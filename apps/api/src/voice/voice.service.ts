import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VoiceService {
  private readonly apiKey = process.env.LIVEKIT_API_KEY ?? 'devkey';
  private readonly apiSecret = process.env.LIVEKIT_API_SECRET ?? 'devsecret-change-me';
  private readonly apiUrl = process.env.LIVEKIT_URL ?? 'http://localhost:7880';
  private readonly publicUrl = process.env.LIVEKIT_PUBLIC_URL ?? 'ws://localhost:7880';
  private readonly roomClient = new RoomServiceClient(this.apiUrl, this.apiKey, this.apiSecret);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  roomName(channelId: string) {
    return `shakechat-${channelId}`;
  }

  screenIdentity(userId: string) {
    return `screen:${userId}`;
  }

  private rosterCache = new Map<string, { expires: number; value: Promise<{ identity: string; name: string; muted: boolean; screen: boolean }[]> }>();

  async participantsInServer(userId: string, serverId: string) {
    const member = await this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId } }, select: { id: true } });
    if (!member) throw new ForbiddenException('Bu sunucunun ses kanallarını göremezsin.');
    const channels = await this.prisma.channel.findMany({ where: { serverId, type: 'VOICE' }, select: { id: true } });
    const visible = (await Promise.all(channels.map(async channel => ({ channel, allowed: await this.permissions.has(userId, serverId, Permission.VIEW_CHANNEL, channel.id) })))).filter(item => item.allowed);
    const rows = await Promise.all(visible.map(async ({ channel }) => {
      const room = this.roomName(channel.id);
      let cached = this.rosterCache.get(room);
      if (!cached || cached.expires < Date.now()) {
        for (const [key, value] of this.rosterCache) if (value.expires < Date.now()) this.rosterCache.delete(key);
        const value = this.roomClient.listParticipants(room).then(participants => {
          const merged = new Map<string, { identity: string; name: string; muted: boolean; screen: boolean }>();
          for (const participant of participants) {
            const syntheticScreen = participant.identity.startsWith('screen:');
            const identity = syntheticScreen ? participant.identity.slice('screen:'.length) : participant.identity;
            const current = merged.get(identity);
            const screen = participant.tracks.some(track => track.source === TrackSource.SCREEN_SHARE && !track.muted);
            const microphoneActive = participant.tracks.some(track => track.source === TrackSource.MICROPHONE && !track.muted);
            merged.set(identity, {
              identity,
              name: participant.name || current?.name || identity,
              muted: syntheticScreen ? (current?.muted ?? true) : !microphoneActive,
              screen: Boolean(current?.screen || screen),
            });
          }
          return [...merged.values()];
        }).catch(error => {
          this.rosterCache.delete(room);
          if (error?.code === 'not_found' || error?.status === 404) return [];
          throw error;
        });
        cached = { expires: Date.now() + 2000, value };
        this.rosterCache.set(room, cached);
      }
      try { return { channelId: channel.id, participants: await cached.value, available: true }; }
      catch { return { channelId: channel.id, participants: [], available: false }; }
    }));
    return { channels: rows };
  }

  private async voiceContext(userId: string, channelId: string) {
    const channel = await this.permissions.channelContext(channelId);
    if (channel.type !== 'VOICE') throw new NotFoundException('Ses kanalı bulunamadı.');
    await this.permissions.require(userId, channel.serverId, Permission.VIEW_CHANNEL, channelId, 'Bu ses kanalını göremezsin.');
    await this.permissions.require(userId, channel.serverId, Permission.CONNECT_VOICE, channelId, 'Bu ses kanalına bağlanma yetkin yok.');
    const effective = await this.permissions.effective(userId, channel.serverId, channelId);
    const canSpeak = effective.includes(Permission.ADMINISTRATOR) || effective.includes(Permission.SPEAK);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true },
    });
    if (!user) throw new ForbiddenException('Kullanıcı bulunamadı.');
    return { channel, user, canSpeak };
  }

  async createJoinToken(userId: string, channelId: string) {
    const { user, canSpeak } = await this.voiceContext(userId, channelId);
    const room = this.roomName(channelId);
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: user.id,
      name: user.displayName || user.username,
      ttl: '15m',
    });
    token.addGrant({
      roomJoin: true,
      room,
      canSubscribe: true,
      canPublish: canSpeak,
      canPublishData: true,
    });
    return { token: await token.toJwt(), url: this.publicUrl, room, channelId, canSpeak };
  }

  async createScreenToken(userId: string, channelId: string) {
    const { user, canSpeak } = await this.voiceContext(userId, channelId);
    if (!canSpeak) throw new ForbiddenException('Bu ses kanalında yayın açma yetkin yok.');
    const room = this.roomName(channelId);
    const identity = this.screenIdentity(user.id);
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      name: user.displayName || user.username,
      metadata: JSON.stringify({ kind: 'screen', ownerId: user.id }),
      ttl: '15m',
    });
    token.addGrant({
      roomJoin: true,
      room,
      canSubscribe: false,
      canPublishData: false,
      canPublishSources: [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
    });
    return { token: await token.toJwt(), url: this.publicUrl, room, channelId, ownerId: user.id, identity };
  }

  async refreshServerAccess(serverId: string, userIds: string[]) {
    const channels = await this.prisma.channel.findMany({
      where: { serverId, type: 'VOICE' },
      select: { id: true },
    });
    const targets = [...new Set(userIds)];

    await Promise.all(channels.flatMap(channel => targets.map(async userId => {
      const room = this.roomName(channel.id);
      try {
        const canConnect = await this.permissions.has(userId, serverId, Permission.CONNECT_VOICE, channel.id);
        if (!canConnect) {
          await Promise.allSettled([
            this.roomClient.removeParticipant(room, userId, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) }),
            this.roomClient.removeParticipant(room, this.screenIdentity(userId), { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) }),
          ]);
          return;
        }
        const canSpeak = await this.permissions.has(userId, serverId, Permission.SPEAK, channel.id);
        await this.roomClient.updateParticipant(room, userId, {
          permission: { canSubscribe: true, canPublish: canSpeak, canPublishData: true },
        });
        if (!canSpeak) {
          await this.roomClient.removeParticipant(room, this.screenIdentity(userId), { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) }).catch(() => undefined);
        }
      } catch {
        // Room or participant may not currently exist. The next join token is still authoritative.
      }
    })));
  }

  async removeUserFromServer(serverId: string, userId: string) {
    const channels = await this.prisma.channel.findMany({
      where: { serverId, type: 'VOICE' },
      select: { id: true },
    });
    await Promise.all(channels.map(async channel => {
      const room = this.roomName(channel.id);
      await Promise.allSettled([
        this.roomClient.removeParticipant(room, userId, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) }),
        this.roomClient.removeParticipant(room, this.screenIdentity(userId), { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) }),
      ]);
    }));
  }

  async closeChannel(channelId: string) {
    this.rosterCache.delete(this.roomName(channelId));
    try { await this.roomClient.deleteRoom(this.roomName(channelId)); }
    catch { /* No active LiveKit room is fine. */ }
  }
}
