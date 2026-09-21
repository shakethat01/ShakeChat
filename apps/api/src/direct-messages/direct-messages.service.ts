import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { StorageService } from '../messages/storage.service';
import { PrismaService } from '../prisma/prisma.service';

const safeUserSelect = { id: true, username: true, displayName: true, avatarUrl: true, statusText: true, profileMode: true } as const;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 10;
const ALLOWED_MIME = /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime)|audio\/(mpeg|ogg|wav|webm)|application\/(pdf|zip|x-zip-compressed)|text\/plain)$/i;
const DM_INCLUDE = {
  author: { select: safeUserSelect },
  replyTo: { select: { id: true, content: true, author: { select: { id: true, username: true, displayName: true } } } },
  attachments: true,
  reactions: { select: { emoji: true, userId: true } },
} satisfies Prisma.DirectMessageInclude;
type DmWithRelations = Prisma.DirectMessageGetPayload<{ include: typeof DM_INCLUDE }>;
type GroupedReaction = { emoji: string; count: number; userIds: string[] };

@Injectable()
export class DirectMessagesService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  private pair(a: string, b: string) { return a < b ? [a, b] as const : [b, a] as const; }
  private pairKey(a: string, b: string) { const [x, y] = this.pair(a, b); return `${x}:${y}`; }

  private async blocked(a: string, b: string) {
    return !!await this.prisma.userBlock.findFirst({
      where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
      select: { id: true },
    });
  }

  private async assertMember(userId: string, conversationId: string) {
    const member = await this.prisma.directMessageMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true, conversation: { select: { pairKey: true } } },
    });
    if (!member) throw new ForbiddenException('Bu özel mesaja erişimin yok.');
    return member;
  }

  private async assertSendAllowed(userId: string, conversationId: string) {
    const member = await this.assertMember(userId, conversationId);
    if (!member.conversation?.pairKey) return;
    const other = await this.prisma.directMessageMember.findFirst({ where: { conversationId, userId: { not: userId } }, select: { userId: true } });
    if (other && await this.blocked(userId, other.userId)) throw new ForbiddenException('Engellenen kullanıcıyla özel mesaj gönderilemez.');
  }

  private async hydrate(message: DmWithRelations | null) {
    if (!message) return message;
    const rawAttachments = Array.isArray(message.attachments) ? message.attachments : [];
    const rawReactions = Array.isArray(message.reactions) ? message.reactions : [];
    const attachments = await Promise.all(rawAttachments.map(async attachment => ({ ...attachment, url: await this.storage.url(attachment.objectKey) })));
    const grouped = new Map<string, GroupedReaction>();
    for (const reaction of rawReactions) {
      const entry: GroupedReaction = grouped.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, userIds: [] };
      entry.count += 1; entry.userIds.push(reaction.userId); grouped.set(reaction.emoji, entry);
    }
    return { ...message, attachments, reactions: [...grouped.values()] };
  }

  async listConversations(userId: string) {
    const rows = await this.prisma.directMessageConversation.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { include: { user: { select: safeUserSelect } }, orderBy: { joinedAt: 'asc' } },
        messages: { take: 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: DM_INCLUDE },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const visible = [];
    for (const row of rows) {
      const users = row.members.map(member => member.user);
      const other = users.find(user => user.id !== userId) ?? null;
      const isGroup = row.pairKey === null || users.length > 2;
      const isBlocked = !isGroup && !!other && await this.blocked(userId, other.id);
      const lastMessage = row.messages[0] ? await this.hydrate(row.messages[0]) : null;
      visible.push({ id: row.id, updatedAt: row.updatedAt, title: row.title, isGroup, blocked: isBlocked, members: users, other, lastMessage });
    }
    return visible;
  }

  async open(userId: string, friendId: string) {
    if (friendId === userId) throw new BadRequestException('Kendinle özel mesaj başlatamazsın.');
    if (await this.blocked(userId, friendId)) throw new ForbiddenException('Engellenen kullanıcıyla özel mesaj başlatılamaz.');
    const [userAId, userBId] = this.pair(userId, friendId);
    const friendship = await this.prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } }, select: { id: true } });
    if (!friendship) throw new ForbiddenException('Özel mesaj başlatmak için arkadaş olmalısınız.');
    const other = await this.prisma.user.findUnique({ where: { id: friendId }, select: safeUserSelect });
    if (!other) throw new NotFoundException('Kullanıcı bulunamadı.');
    const conversation = await this.prisma.directMessageConversation.upsert({
      where: { pairKey: this.pairKey(userId, friendId) },
      update: {},
      create: { pairKey: this.pairKey(userId, friendId), members: { create: [{ userId }, { userId: friendId }] } },
      select: { id: true, updatedAt: true },
    });
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: safeUserSelect });
    return { ...conversation, title: null, isGroup: false, blocked: false, members: [me, other].filter(Boolean), other, lastMessage: null };
  }

  async createGroup(userId: string, memberIds: string[], title?: string) {
    const unique = [...new Set(memberIds)].filter(id => id !== userId);
    if (unique.length < 2 || unique.length > 8) throw new BadRequestException('Grup için 2 ile 8 arkadaş seçmelisin.');
    for (const friendId of unique) {
      if (await this.blocked(userId, friendId)) throw new ForbiddenException('Engellenen kullanıcı grup sohbetine eklenemez.');
      const [userAId, userBId] = this.pair(userId, friendId);
      const friendship = await this.prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } }, select: { id: true } });
      if (!friendship) throw new ForbiddenException('Grup sohbetine yalnızca arkadaşlarını ekleyebilirsin.');
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [userId, ...unique] } },
      select: { ...safeUserSelect, allowGroupDmInvites: true },
    });
    if (users.length !== unique.length + 1) throw new NotFoundException('Gruba eklenecek kullanıcılardan biri bulunamadı.');
    const blockedInvite = users.find(user => user.id !== userId && user.allowGroupDmInvites === false);
    if (blockedInvite) throw new ForbiddenException(`${blockedInvite.displayName || blockedInvite.username} grup sohbeti daveti kabul etmiyor.`);
    const conversation = await this.prisma.directMessageConversation.create({
      data: { title: title?.trim().slice(0, 64) || null, members: { create: [userId, ...unique].map(id => ({ userId: id })) } },
      select: { id: true, title: true, updatedAt: true },
    });
    const safeUsers = users.map(({ allowGroupDmInvites: _privacy, ...user }) => user);
    return { ...conversation, isGroup: true, blocked: false, members: safeUsers, other: null, lastMessage: null };
  }


  async unreadSummary(userId: string) {
    const memberships = await this.prisma.directMessageMember.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true },
    });
    const rows = await Promise.all(memberships.map(async membership => ({
      conversationId: membership.conversationId,
      count: await this.prisma.directMessage.count({
        where: {
          conversationId: membership.conversationId,
          authorId: { not: userId },
          createdAt: { gt: membership.lastReadAt },
        },
      }),
    })));
    return rows.filter(row => row.count > 0);
  }

  async markRead(userId: string, conversationId: string) {
    await this.assertMember(userId, conversationId);
    const lastReadAt = new Date();
    await this.prisma.directMessageMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt },
    });
    return { ok: true, conversationId, lastReadAt };
  }

  async listMessages(userId: string, conversationId: string) {
    await this.assertMember(userId, conversationId);
    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId }, include: DM_INCLUDE, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100,
    });
    return Promise.all(messages.reverse().map(message => this.hydrate(message)));
  }

  async send(userId: string, conversationId: string, content: string, replyToId?: string) {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Mesaj boş olamaz.');
    await this.assertSendAllowed(userId, conversationId);
    if (replyToId) {
      const reply = await this.prisma.directMessage.findFirst({ where: { id: replyToId, conversationId }, select: { id: true } });
      if (!reply) throw new BadRequestException('Yanıtlanan mesaj bulunamadı.');
    }
    const message = await this.prisma.directMessage.create({
      data: { conversationId, authorId: userId, content: trimmed, replyToId: replyToId || null }, include: DM_INCLUDE,
    });
    await this.prisma.directMessageConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return this.hydrate(message);
  }

  async sendWithFiles(userId: string, conversationId: string, content: string, files: Express.Multer.File[], replyToId?: string) {
    await this.assertSendAllowed(userId, conversationId);
    if ((!content || !content.trim()) && !files?.length) throw new BadRequestException('Mesaj veya dosya gerekli.');
    if ((files?.length || 0) > MAX_FILES) throw new BadRequestException(`En fazla ${MAX_FILES} dosya yüklenebilir.`);
    if (replyToId) {
      const reply = await this.prisma.directMessage.findFirst({ where: { id: replyToId, conversationId }, select: { id: true } });
      if (!reply) throw new BadRequestException('Yanıtlanan mesaj bulunamadı.');
    }
    for (const file of files || []) {
      if (file.size > MAX_FILE_SIZE) throw new BadRequestException(`${file.originalname}: dosya 25 MB sınırını aşıyor.`);
      if (!ALLOWED_MIME.test(file.mimetype)) throw new BadRequestException(`${file.originalname}: bu dosya türüne izin verilmiyor.`);
    }
    const uploaded: { objectKey: string; originalName: string; mimeType: string; size: number }[] = [];
    try {
      for (const file of files || []) {
        const safeExt = extname(file.originalname).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12);
        const objectKey = `dm/${conversationId}/${randomUUID()}${safeExt}`;
        await this.storage.put(objectKey, file.buffer, file.size, file.mimetype);
        uploaded.push({ objectKey, originalName: file.originalname.slice(0, 255), mimeType: file.mimetype, size: file.size });
      }
      const message = await this.prisma.directMessage.create({
        data: { conversationId, authorId: userId, content: (content || '').trim(), replyToId: replyToId || null, attachments: { create: uploaded } },
        include: DM_INCLUDE,
      });
      await this.prisma.directMessageConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      return this.hydrate(message);
    } catch (error) {
      await Promise.all(uploaded.map(file => this.storage.remove(file.objectKey)));
      throw error;
    }
  }

  async edit(userId: string, conversationId: string, messageId: string, content: string) {
    await this.assertMember(userId, conversationId);
    const message = await this.prisma.directMessage.findFirst({ where: { id: messageId, conversationId }, select: { id: true, authorId: true } });
    if (!message) throw new NotFoundException('Mesaj bulunamadı.');
    if (message.authorId !== userId) throw new ForbiddenException('Yalnızca kendi mesajını düzenleyebilirsin.');
    const trimmed = content.trim(); if (!trimmed) throw new BadRequestException('Mesaj boş olamaz.');
    return this.hydrate(await this.prisma.directMessage.update({ where: { id: messageId }, data: { content: trimmed, editedAt: new Date() }, include: DM_INCLUDE }));
  }

  async togglePin(userId: string, conversationId: string, messageId: string) {
    await this.assertMember(userId, conversationId);
    const message = await this.prisma.directMessage.findFirst({ where: { id: messageId, conversationId }, select: { id: true, isPinned: true } });
    if (!message) throw new NotFoundException('Mesaj bulunamadı.');
    return this.hydrate(await this.prisma.directMessage.update({ where: { id: messageId }, data: { isPinned: !message.isPinned }, include: DM_INCLUDE }));
  }

  async react(userId: string, conversationId: string, messageId: string, emoji: string, remove = false) {
    await this.assertMember(userId, conversationId);
    const message = await this.prisma.directMessage.findFirst({ where: { id: messageId, conversationId }, select: { id: true } });
    if (!message) throw new NotFoundException('Mesaj bulunamadı.');
    if (remove) await this.prisma.directMessageReaction.deleteMany({ where: { messageId, userId, emoji } });
    else await this.prisma.directMessageReaction.upsert({ where: { messageId_userId_emoji: { messageId, userId, emoji } }, update: {}, create: { messageId, userId, emoji } });
    return this.hydrate(await this.prisma.directMessage.findUnique({ where: { id: messageId }, include: DM_INCLUDE }));
  }

  async remove(userId: string, conversationId: string, messageId: string) {
    await this.assertMember(userId, conversationId);
    const message = await this.prisma.directMessage.findFirst({ where: { id: messageId, conversationId }, include: { attachments: true } });
    if (!message) throw new NotFoundException('Mesaj bulunamadı.');
    if (message.authorId !== userId) throw new ForbiddenException('Yalnızca kendi mesajını silebilirsin.');
    await this.prisma.directMessage.delete({ where: { id: message.id } });
    await Promise.all(message.attachments.map(attachment => this.storage.remove(attachment.objectKey)));
    return { ok: true, id: message.id };
  }

  canAccess(userId: string, conversationId: string) { return this.prisma.directMessageMember.findUnique({ where: { conversationId_userId: { conversationId, userId } }, select: { id: true } }).then(Boolean); }
}
