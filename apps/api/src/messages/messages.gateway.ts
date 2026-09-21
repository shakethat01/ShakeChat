import { JwtService } from '@nestjs/jwt';
import { Permission } from '@prisma/client';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';

type TypingState = { client: Socket; roomId: string; timer: ReturnType<typeof setTimeout> };

@WebSocketGateway({
  cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true },
  namespace: '/chat',
  maxHttpBufferSize: 16 * 1024,
})
export class MessagesGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Namespace;
  private readonly connections = new Map<string, Set<string>>();
  private readonly typingStates = new Map<string, TypingState>();
  private readonly dmTypingStates = new Map<string, TypingState>();

  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService, private readonly permissions: PermissionsService, private readonly voice?: VoiceService) {}

  afterInit(server: Namespace) {
    server.use(async (client, next) => {
      try {
        const token = client.handshake.auth?.token;
        if (typeof token !== 'string') throw new Error();
        const payload = this.jwt.verify(token);
        if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') throw new Error();
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, username: true, authVersion: true } });
        if (!user || payload.exp * 1000 <= Date.now() || Number(payload.v ?? 0) !== Number(user.authVersion ?? 0)) throw new Error();
        client.data.user = { sub: user.id, username: user.username, exp: payload.exp, authVersion: Number(user.authVersion ?? 0) };
        next();
      } catch { next(new Error('Oturum geçersiz. Yeniden giriş yap.')); }
    });
  }

  async handleConnection(client: Socket) {
    const user = client.data.user;
    if (!user) return client.disconnect(true);
    const sockets = this.connections.get(user.sub) ?? new Set<string>();
    sockets.add(client.id);
    this.connections.set(user.sub, sockets);
    await client.join(`user:${user.sub}`);
    client.data.expiryTimer = setTimeout(() => client.disconnect(true), Math.min(user.exp * 1000 - Date.now(), 2_147_483_647));
    client.data.sessionTimer = setInterval(async () => {
      try {
        const current = await this.prisma.user.findUnique({ where: { id: user.sub }, select: { authVersion: true } });
        if (!current || Number(current.authVersion ?? 0) !== Number(user.authVersion ?? 0)) client.disconnect(true);
      } catch { /* transient database errors are rechecked on the next interval or packet */ }
    }, 30_000);
    client.use(async (_packet, next) => {
      if (Date.now() >= user.exp * 1000) { client.disconnect(true); return next(new Error('Oturum süresi doldu.')); }
      try {
        const current = await this.prisma.user.findUnique({ where: { id: user.sub }, select: { authVersion: true } });
        if (!current || Number(current.authVersion ?? 0) !== Number(user.authVersion ?? 0)) {
          client.disconnect(true);
          return next(new Error('Oturum geçersiz. Yeniden giriş yap.'));
        }
        next();
      } catch {
        client.disconnect(true);
        next(new Error('Oturum doğrulanamadı.'));
      }
    });
    void this.broadcastPresence(user.sub);
  }

  handleDisconnect(client: Socket) {
    clearTimeout(client.data.expiryTimer);
    clearInterval(client.data.sessionTimer);
    this.stopTyping(client);
    this.stopDmTyping(client);
    const id = client.data.user?.sub;
    if (!id) return;
    const sockets = this.connections.get(id);
    sockets?.delete(client.id);
    if (!sockets?.size) this.connections.delete(id);
    void this.broadcastPresence(id);
  }

  private async friendIds(userId: string) {
    const friendships = await this.prisma.friendship.findMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] }, select: { userAId: true, userBId: true } });
    return friendships.map(row => row.userAId === userId ? row.userBId : row.userAId);
  }

  private async broadcastPresence(userId: string) {
    try {
      const memberships = await this.prisma.serverMember.findMany({ where: { userId }, select: { serverId: true } });
      for (const { serverId } of memberships) this.server.to(`server:${serverId}`).emit('presence:update', { serverId, userId, online: this.connections.has(userId) });
      for (const friendId of await this.friendIds(userId)) this.server.to(`user:${friendId}`).emit('friend:presence', { userId, online: this.connections.has(userId) });
    } catch { /* Reconnect snapshots recover presence after temporary database failures. */ }
  }

  @SubscribeMessage('friends:snapshot')
  async friendSnapshot(@ConnectedSocket() client: Socket) {
    try {
      const ids = await this.friendIds(client.data.user.sub);
      return { ok: true, friends: ids.map(id => ({ id, online: this.connections.has(id) })) };
    } catch { return { ok: false, friends: [] }; }
  }

  @SubscribeMessage('server:join')
  async joinServer(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const serverId = this.identifier(body, 'serverId');
    const sequence = client.data.serverSequence = (client.data.serverSequence ?? 0) + 1;
    if (!serverId) return { ok: false, error: 'Geçersiz sunucu.' };
    try {
      const member = await this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: client.data.user.sub } } });
      if (!member) return { ok: false, error: 'Bu sunucuya erişimin yok.' };
      await this.permissions.ensureDefaultRoles(serverId);
      const managed = await this.prisma.role.findMany({ where: { serverId, isManaged: true } });
      const byLegacy = new Map(managed.filter(role => role.legacyRole).map(role => [role.legacyRole!, role]));
      const members = await this.prisma.serverMember.findMany({ where: { serverId }, select: { role: true, joinedAt: true, messageRestrictedUntil: true, messageRestrictionReason: true, roleLinks: { include: { role: true } }, user: { select: { id: true, username: true, displayName: true, avatarUrl: true, statusText: true, profileMode: true } } }, orderBy: { joinedAt: 'asc' } });
      if (!client.connected || sequence !== client.data.serverSequence) return { ok: false };
      for (const room of client.rooms) if (room.startsWith('server:')) await client.leave(room);
      await client.join(`server:${serverId}`);
      return { ok: true, members: members.map(m => ({ ...m.user, role: m.role, joinedAt: m.joinedAt, messageRestrictedUntil: m.messageRestrictedUntil, messageRestrictionReason: m.messageRestrictionReason, roles: [byLegacy.get(m.role), ...m.roleLinks.map(link => link.role)].filter(Boolean), online: this.connections.has(m.user.id) })) };
    } catch { return { ok: false, error: 'Üye listesi yüklenemedi.' }; }
  }

  private identifier(body: unknown, key: string): string | null {
    if (!body || typeof body !== 'object') return null;
    const value = (body as Record<string, unknown>)[key];
    return typeof value === 'string' && value.length > 0 && value.length < 128 ? value : null;
  }

  private async canAccessChannel(userId: string, channelId: string, permission: Permission = Permission.VIEW_CHANNEL) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true, type: true, isLocked: true } });
    if (!channel || channel.type !== 'TEXT') return false;
    if (!(await this.permissions.canAccessChannel(userId, channelId, permission))) return false;
    if (permission === Permission.SEND_MESSAGES && channel.isLocked) {
      const effective = await this.permissions.effective(userId, channel.serverId, channelId);
      if (!effective.includes(Permission.ADMINISTRATOR) && !effective.includes(Permission.MANAGE_MESSAGES) && !effective.includes(Permission.MANAGE_CHANNELS)) return false;
    }
    return true;
  }

  private canAccessDm(userId: string, conversationId: string) {
    return this.prisma.directMessageMember.findUnique({ where: { conversationId_userId: { conversationId, userId } }, select: { id: true } }).then(Boolean);
  }

  @SubscribeMessage('channel:leave')
  async leave(@ConnectedSocket() client: Socket) {
    client.data.channelSequence = (client.data.channelSequence ?? 0) + 1;
    this.stopTyping(client);
    for (const room of client.rooms) if (room.startsWith('channel:')) await client.leave(room);
    return { ok: true };
  }

  @SubscribeMessage('channel:join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const channelId = this.identifier(body, 'channelId');
    const sequence = client.data.channelSequence = (client.data.channelSequence ?? 0) + 1;
    this.stopTyping(client);
    for (const room of client.rooms) if (room.startsWith('channel:')) await client.leave(room);
    try {
      if (!channelId || !(await this.canAccessChannel(client.data.user.sub, channelId))) return { ok: false, error: 'Bu metin kanalına erişimin yok.' };
      if (!client.connected || sequence !== client.data.channelSequence) return { ok: false };
      await client.join(`channel:${channelId}`);
      return { ok: true };
    } catch { return { ok: false, error: 'Kanala bağlanılamadı.' }; }
  }

  @SubscribeMessage('dm:leave')
  async leaveDm(@ConnectedSocket() client: Socket) {
    client.data.dmSequence = (client.data.dmSequence ?? 0) + 1;
    this.stopDmTyping(client);
    for (const room of client.rooms) if (room.startsWith('dm:')) await client.leave(room);
    return { ok: true };
  }

  @SubscribeMessage('dm:join')
  async joinDm(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const conversationId = this.identifier(body, 'conversationId');
    const sequence = client.data.dmSequence = (client.data.dmSequence ?? 0) + 1;
    this.stopDmTyping(client);
    for (const room of client.rooms) if (room.startsWith('dm:')) await client.leave(room);
    try {
      if (!conversationId || !(await this.canAccessDm(client.data.user.sub, conversationId))) return { ok: false, error: 'Bu özel mesaja erişimin yok.' };
      if (!client.connected || sequence !== client.data.dmSequence) return { ok: false };
      await client.join(`dm:${conversationId}`);
      return { ok: true };
    } catch { return { ok: false, error: 'Özel mesaja bağlanılamadı.' }; }
  }

  private stopTyping(client: Socket) {
    client.data.typingSequence = (client.data.typingSequence ?? 0) + 1;
    const state = this.typingStates.get(client.id);
    if (!state) return;
    clearTimeout(state.timer);
    this.typingStates.delete(client.id);
    const user = client.data.user;
    const other = [...this.typingStates.values()].some(s => s.roomId === state.roomId && s.client.data.user.sub === user.sub);
    if (!other) this.server.to(`channel:${state.roomId}`).emit('typing', { channelId: state.roomId, userId: user.sub, username: user.username, typing: false });
  }

  @SubscribeMessage('typing')
  async typing(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const channelId = this.identifier(body, 'channelId');
    if (!channelId || typeof (body as any).typing !== 'boolean' || !client.rooms.has(`channel:${channelId}`)) return;
    const sequence = client.data.typingSequence = (client.data.typingSequence ?? 0) + 1;
    if (!(body as any).typing) { this.stopTyping(client); return; }
    const now = Date.now();
    if (now - (client.data.lastTypingAt ?? 0) < 500) return;
    client.data.lastTypingAt = now;
    try {
      if (!(await this.canAccessChannel(client.data.user.sub, channelId, Permission.SEND_MESSAGES)) || !client.connected || sequence !== client.data.typingSequence || !client.rooms.has(`channel:${channelId}`)) return;
      const previous = this.typingStates.get(client.id);
      if (previous) clearTimeout(previous.timer);
      const timer = setTimeout(() => this.stopTyping(client), 3000);
      this.typingStates.set(client.id, { client, roomId: channelId, timer });
      client.to(`channel:${channelId}`).emit('typing', { channelId, userId: client.data.user.sub, username: client.data.user.username, typing: true });
    } catch { this.stopTyping(client); }
  }

  private stopDmTyping(client: Socket) {
    client.data.dmTypingSequence = (client.data.dmTypingSequence ?? 0) + 1;
    const state = this.dmTypingStates.get(client.id);
    if (!state) return;
    clearTimeout(state.timer);
    this.dmTypingStates.delete(client.id);
    const user = client.data.user;
    const other = [...this.dmTypingStates.values()].some(s => s.roomId === state.roomId && s.client.data.user.sub === user.sub);
    if (!other) this.server.to(`dm:${state.roomId}`).emit('dm:typing', { conversationId: state.roomId, userId: user.sub, username: user.username, typing: false });
  }

  @SubscribeMessage('dm:typing')
  async dmTyping(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const conversationId = this.identifier(body, 'conversationId');
    if (!conversationId || typeof (body as any).typing !== 'boolean' || !client.rooms.has(`dm:${conversationId}`)) return;
    const sequence = client.data.dmTypingSequence = (client.data.dmTypingSequence ?? 0) + 1;
    if (!(body as any).typing) { this.stopDmTyping(client); return; }
    const now = Date.now();
    if (now - (client.data.lastDmTypingAt ?? 0) < 500) return;
    client.data.lastDmTypingAt = now;
    try {
      if (!(await this.canAccessDm(client.data.user.sub, conversationId)) || !client.connected || sequence !== client.data.dmTypingSequence || !client.rooms.has(`dm:${conversationId}`)) return;
      const previous = this.dmTypingStates.get(client.id);
      if (previous) clearTimeout(previous.timer);
      const timer = setTimeout(() => this.stopDmTyping(client), 3000);
      this.dmTypingStates.set(client.id, { client, roomId: conversationId, timer });
      client.to(`dm:${conversationId}`).emit('dm:typing', { conversationId, userId: client.data.user.sub, username: client.data.user.username, typing: true });
    } catch { this.stopDmTyping(client); }
  }

  isUserOnline(userId: string) { return this.connections.has(userId); }

  emitFriendRequest(receiverId: string, request: unknown) { this.server.to(`user:${receiverId}`).emit('friend:request', request); }
  emitFriendshipChanged(userAId: string, userBId: string) {
    this.server.to(`user:${userAId}`).emit('friendship:changed', { userId: userBId });
    this.server.to(`user:${userBId}`).emit('friendship:changed', { userId: userAId });
  }
  emitMemberJoined(serverId: string, member: unknown) { this.server.to(`server:${serverId}`).emit('member:joined', { serverId, member }); }

  async removeUserFromServer(serverId: string, userId: string, reason: 'left' | 'kicked' | 'banned') {
    this.server.to(`server:${serverId}`).emit('member:removed', { serverId, userId, reason });
    await this.voice?.removeUserFromServer(serverId, userId);
    const channels = await this.prisma.channel.findMany({ where: { serverId }, select: { id: true } });
    const channelRooms = new Set(channels.map(channel => `channel:${channel.id}`));
    for (const socketId of this.connections.get(userId) ?? []) {
      const client = this.server.sockets.get(socketId);
      if (!client) continue;
      const typing = this.typingStates.get(client.id);
      if (typing && channelRooms.has(`channel:${typing.roomId}`)) this.stopTyping(client);
      for (const room of channelRooms) if (client.rooms.has(room)) await client.leave(room);
      if (client.rooms.has(`server:${serverId}`)) await client.leave(`server:${serverId}`);
      client.emit('server:removed', { serverId, reason });
    }
  }

  async refreshServerAccess(serverId: string, userIds?: string[]) {
    const channels = await this.prisma.channel.findMany({ where: { serverId }, select: { id: true, type: true } });
    const targets = userIds ?? (await this.prisma.serverMember.findMany({ where: { serverId }, select: { userId: true } })).map(row => row.userId);
    this.server.to(`server:${serverId}`).emit('permissions:changed', { serverId });
    await this.voice?.refreshServerAccess(serverId, [...new Set(targets)]);
    for (const userId of new Set(targets)) {
      for (const socketId of this.connections.get(userId) ?? []) {
        const client = this.server.sockets.get(socketId);
        if (!client) continue;
        if (!client.rooms.has(`server:${serverId}`)) client.emit('permissions:changed', { serverId });
        for (const channel of channels) {
          const room = `channel:${channel.id}`;
          if (!client.rooms.has(room)) continue;
          if (!(await this.permissions.canAccessChannel(userId, channel.id, Permission.VIEW_CHANNEL))) {
            const typing = this.typingStates.get(client.id);
            if (typing?.roomId === channel.id) this.stopTyping(client);
            await client.leave(room);
            client.emit('channel:removed', { serverId, channelId: channel.id });
            continue;
          }
          if (!(await this.permissions.canAccessChannel(userId, channel.id, Permission.SEND_MESSAGES))) {
            const typing = this.typingStates.get(client.id);
            if (typing?.roomId === channel.id) this.stopTyping(client);
          }
        }
      }
    }
  }

  async emitMessage(channelId: string, message: unknown) {
    this.server.to(`channel:${channelId}`).emit('message:new', message);
    try {
      const channel = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
      if (!channel) return;
      const members = await this.prisma.serverMember.findMany({
        where: { serverId: channel.serverId },
        select: { userId: true, user: { select: { username: true } } },
      });
      const item = message as any;
      const authorId = typeof item?.author?.id === 'string' ? item.author.id : item?.authorId;
      const authorName = item?.author?.displayName || item?.author?.username || 'Bir üye';
      const content = typeof item?.content === 'string' ? item.content.trim() : '';
      const attachmentCount = Array.isArray(item?.attachments) ? item.attachments.length : 0;
      const preview = (content || (attachmentCount ? `${attachmentCount} dosya paylaştı` : 'Yeni mesaj')).slice(0, 180);
      for (const member of members) {
        if (!member.userId || member.userId === authorId) continue;
        if (!(await this.permissions.canAccessChannel(member.userId, channelId, Permission.VIEW_CHANNEL))) continue;
        const escaped = member.user?.username?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const mentioned = !!escaped && new RegExp(`(^|\\s)@${escaped}(?=$|\\s|[.,!?;:])`, 'i').test(content);
        this.server.to(`user:${member.userId}`).emit('channel:activity', {
          serverId: channel.serverId, channelId, messageId: item?.id, authorId, authorName, preview, mentioned, createdAt: item?.createdAt,
        });
      }
    } catch { /* Activity badges/notifications must never block message delivery. */ }
  }
  emitMessageDeleted(channelId: string, messageId: string) { this.server.to(`channel:${channelId}`).emit('message:deleted', { channelId, messageId }); }
  emitChannelUpdated(serverId: string, channel: unknown) { this.server.to(`server:${serverId}`).emit('channel:updated', { serverId, channel }); }
  async emitDirectMessage(conversationId: string, message: unknown) {
    this.server.to(`dm:${conversationId}`).emit('dm:new', message);
    try {
      const members = await this.prisma.directMessageMember.findMany({ where: { conversationId }, select: { userId: true } });
      for (const { userId } of members) this.server.to(`user:${userId}`).emit('dm:conversation-update', { conversationId, message, kind: 'new' });
    } catch { /* The active room delivery above remains authoritative. */ }
  }

  emitDirectMessageUpdated(conversationId: string, message: unknown) {
    this.server.to(`dm:${conversationId}`).emit('dm:updated', { conversationId, message });
    void this.prisma.directMessageMember.findMany({ where: { conversationId }, select: { userId: true } }).then(members => {
      for (const { userId } of members) this.server.to(`user:${userId}`).emit('dm:conversation-update', { conversationId, message, kind: 'update' });
    }).catch(() => undefined);
  }

  emitDirectMessageDeleted(conversationId: string, messageId: string) {
    this.server.to(`dm:${conversationId}`).emit('dm:deleted', { conversationId, messageId });
    void this.prisma.directMessageMember.findMany({ where: { conversationId }, select: { userId: true } }).then(members => {
      for (const { userId } of members) this.server.to(`user:${userId}`).emit('dm:conversation-update', { conversationId, messageId, kind: 'delete' });
    }).catch(() => undefined);
  }

  emitDirectConversationChanged(conversationId: string, userIds: string[]) {
    for (const userId of userIds) this.server.to(`user:${userId}`).emit('dm:conversation-update', { conversationId, kind: 'conversation' });
  }

  emitMessageUpdated(channelId:string,message:any){this.server.to(`channel:${channelId}`).emit('message:updated',{channelId,message})}
}
