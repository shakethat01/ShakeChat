import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Permission, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 10;
const ALLOWED_MIME = /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime)|audio\/(mpeg|ogg|wav|webm)|application\/(pdf|zip|x-zip-compressed)|text\/plain)$/i;

const MESSAGE_INCLUDE = {
  author: { select: { id: true, username: true, displayName: true, avatarUrl: true, statusText: true, profileMode: true } },
  replyTo: { select: { id: true, content: true, author: { select: { id: true, username: true, displayName: true } } } },
  attachments: true,
  reactions: { select: { emoji: true, userId: true } },
} satisfies Prisma.MessageInclude;

type MessageWithRelations = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;
type GroupedReaction = { emoji: string; count: number; userIds: string[] };

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService, private permissions: PermissionsService, private storage: StorageService) {}

  private async channel(userId: string, channelId: string, permission: Permission) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Kanal bulunamadı.');
    await this.permissions.require(userId, channel.serverId, Permission.VIEW_CHANNEL, channelId, 'Bu kanalı göremezsin.');
    if (permission !== Permission.VIEW_CHANNEL) await this.permissions.require(userId, channel.serverId, permission, channelId, 'Bu işlem için kanal yetkin yok.');
    return channel;
  }

  private readonly includeMessage = MESSAGE_INCLUDE;

  private async enforceChannelLock(userId: string, channel: { id: string; serverId: string; isLocked?: boolean | null }) {
    if (!channel.isLocked) return;
    const effective = await this.permissions.effective(userId, channel.serverId, channel.id);
    if (effective.includes(Permission.ADMINISTRATOR) || effective.includes(Permission.MANAGE_MESSAGES) || effective.includes(Permission.MANAGE_CHANNELS)) return;
    throw new ForbiddenException('Bu akış moderasyon tarafından kilitlendi.');
  }

  private async enforceSlowMode(userId: string, channel: { id: string; serverId: string; slowModeSeconds?: number | null }) {
    const seconds = Math.max(0, Number(channel.slowModeSeconds || 0));
    if (!seconds) return;
    const effective = await this.permissions.effective(userId, channel.serverId, channel.id);
    if (effective.includes(Permission.ADMINISTRATOR) || effective.includes(Permission.MANAGE_MESSAGES)) return;
    const latest = await this.prisma.message.findFirst({
      where: { channelId: channel.id, authorId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true },
    });
    if (!latest) return;
    const remainingMs = seconds * 1000 - (Date.now() - latest.createdAt.getTime());
    if (remainingMs > 0) {
      const remaining = Math.max(1, Math.ceil(remainingMs / 1000));
      throw new HttpException(`Bu akışta yavaş mod etkin. ${remaining} sn sonra tekrar yazabilirsin.`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async hydrate(message: MessageWithRelations | null) {
    if (!message) return message;

    // Prisma returns included relations as arrays, but keeping this defensive also
    // makes transport/unit-test doubles and partially shaped records safe.
    const rawAttachments = Array.isArray(message.attachments) ? message.attachments : [];
    const rawReactions = Array.isArray(message.reactions) ? message.reactions : [];

    const attachments = await Promise.all(
      rawAttachments.map(async (attachment) => ({
        ...attachment,
        url: await this.storage.url(attachment.objectKey),
      })),
    );

    const grouped = new Map<string, GroupedReaction>();
    for (const reaction of rawReactions) {
      const entry: GroupedReaction = grouped.get(reaction.emoji) ?? {
        emoji: reaction.emoji,
        count: 0,
        userIds: [],
      };
      entry.count += 1;
      entry.userIds.push(reaction.userId);
      grouped.set(reaction.emoji, entry);
    }

    return { ...message, attachments, reactions: [...grouped.values()] };
  }

  async list(userId: string, channelId: string) {
    await this.channel(userId, channelId, Permission.VIEW_CHANNEL);
    const messages = await this.prisma.message.findMany({
      where: { channelId }, include: this.includeMessage,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100,
    });
    return Promise.all(messages.reverse().map(message => this.hydrate(message)));
  }

  async send(userId: string, channelId: string, content: string, replyToId?: string) {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Mesaj boş olamaz.');
    const channel = await this.channel(userId, channelId, Permission.SEND_MESSAGES);
    if (channel.type !== 'TEXT') throw new ForbiddenException('Ses kanalına mesaj gönderilemez.');
    await this.enforceChannelLock(userId, channel);
    await this.enforceSlowMode(userId, channel);
    if (replyToId) {
      const reply = await this.prisma.message.findFirst({ where: { id: replyToId, channelId }, select: { id: true } });
      if (!reply) throw new BadRequestException('Yanıtlanan mesaj bulunamadı.');
    }
    return this.hydrate(await this.prisma.message.create({
      data: { channelId, authorId: userId, content: trimmed, replyToId: replyToId || null }, include: this.includeMessage,
    }));
  }

  async sendWithFiles(userId:string, channelId:string, content:string, files:Express.Multer.File[], replyToId?:string) {
    const channel = await this.channel(userId, channelId, Permission.SEND_MESSAGES);
    if (channel.type !== 'TEXT') throw new ForbiddenException('Ses kanalına mesaj gönderilemez.');
    await this.enforceChannelLock(userId, channel);
    await this.enforceSlowMode(userId, channel);
    if ((!content || !content.trim()) && !files?.length) throw new BadRequestException('Mesaj veya dosya gerekli.');
    if ((files?.length || 0) > MAX_FILES) throw new BadRequestException(`En fazla ${MAX_FILES} dosya yüklenebilir.`);
    if (replyToId) {
      const reply = await this.prisma.message.findFirst({ where: { id: replyToId, channelId }, select: { id:true } });
      if (!reply) throw new BadRequestException('Yanıtlanan mesaj bulunamadı.');
    }
    for (const file of files || []) {
      if (file.size > MAX_FILE_SIZE) throw new BadRequestException(`${file.originalname}: dosya 25 MB sınırını aşıyor.`);
      if (!ALLOWED_MIME.test(file.mimetype)) throw new BadRequestException(`${file.originalname}: bu dosya türüne izin verilmiyor.`);
    }
    const uploaded:{objectKey:string;originalName:string;mimeType:string;size:number}[]=[];
    try {
      for (const file of files || []) {
        const safeExt = extname(file.originalname).replace(/[^.a-zA-Z0-9]/g,'').slice(0,12);
        const objectKey = `${channel.serverId}/${channelId}/${randomUUID()}${safeExt}`;
        await this.storage.put(objectKey, file.buffer, file.size, file.mimetype);
        uploaded.push({ objectKey, originalName:file.originalname.slice(0,255), mimeType:file.mimetype, size:file.size });
      }
      const message = await this.prisma.message.create({
        data:{ channelId, authorId:userId, content:(content||'').trim(), replyToId:replyToId||null, attachments:{create:uploaded} },
        include:this.includeMessage,
      });
      return this.hydrate(message);
    } catch (error) {
      await Promise.all(uploaded.map(file=>this.storage.remove(file.objectKey)));
      throw error;
    }
  }

  async edit(userId:string, channelId:string, messageId:string, content:string) {
    await this.channel(userId,channelId,Permission.VIEW_CHANNEL);
    const message=await this.prisma.message.findFirst({where:{id:messageId,channelId},select:{id:true,authorId:true}});
    if(!message) throw new NotFoundException('Mesaj bulunamadı.');
    if(message.authorId!==userId) throw new ForbiddenException('Yalnızca kendi mesajını düzenleyebilirsin.');
    const trimmed=content.trim(); if(!trimmed) throw new BadRequestException('Mesaj boş olamaz.');
    return this.hydrate(await this.prisma.message.update({where:{id:messageId},data:{content:trimmed,editedAt:new Date()},include:this.includeMessage}));
  }

  async togglePin(userId:string,channelId:string,messageId:string){
    const channel=await this.channel(userId,channelId,Permission.MANAGE_MESSAGES);
    const message=await this.prisma.message.findFirst({where:{id:messageId,channelId},select:{id:true,isPinned:true}});
    if(!message) throw new NotFoundException('Mesaj bulunamadı.');
    return this.hydrate(await this.prisma.message.update({where:{id:messageId},data:{isPinned:!message.isPinned},include:this.includeMessage}));
  }

  async react(userId:string,channelId:string,messageId:string,emoji:string,remove=false){
    await this.channel(userId,channelId,Permission.VIEW_CHANNEL);
    const message=await this.prisma.message.findFirst({where:{id:messageId,channelId},select:{id:true}}); if(!message) throw new NotFoundException('Mesaj bulunamadı.');
    if(remove) await this.prisma.messageReaction.deleteMany({where:{messageId,userId,emoji}});
    else await this.prisma.messageReaction.upsert({where:{messageId_userId_emoji:{messageId,userId,emoji}},update:{},create:{messageId,userId,emoji}});
    return this.hydrate(await this.prisma.message.findUnique({where:{id:messageId},include:this.includeMessage}));
  }


  async markRead(userId:string, channelId:string) {
    await this.channel(userId, channelId, Permission.VIEW_CHANNEL);
    const lastReadAt = new Date();
    await this.prisma.channelReadState.upsert({
      where: { userId_channelId: { userId, channelId } },
      update: { lastReadAt },
      create: { userId, channelId, lastReadAt },
    });
    return { ok: true, channelId, lastReadAt };
  }

  async unreads(userId:string, serverId:string) {
    const membership = await this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId } }, select: { id: true } });
    if (!membership) throw new ForbiddenException('Bu alana erişimin yok.');
    const channels = await this.prisma.channel.findMany({ where: { serverId, type: 'TEXT' }, orderBy: { position: 'asc' }, select: { id: true } });
    const visible:string[] = [];
    for (const channel of channels) if (await this.permissions.has(userId, serverId, Permission.VIEW_CHANNEL, channel.id).catch(() => false)) visible.push(channel.id);
    if (!visible.length) return [];
    const states = await this.prisma.channelReadState.findMany({ where: { userId, channelId: { in: visible } } });
    const byChannel = new Map(states.map(state => [state.channelId, state.lastReadAt]));
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    return Promise.all(visible.map(async channelId => {
      const lastReadAt = byChannel.get(channelId);
      if (!lastReadAt) return { channelId, count: 0, mentions: 0 };
      const baseWhere = { channelId, authorId: { not: userId }, createdAt: { gt: lastReadAt } } as const;
      const [count, mentions] = await Promise.all([
        this.prisma.message.count({ where: baseWhere }),
        user?.username ? this.prisma.message.count({ where: { ...baseWhere, content: { contains: `@${user.username}`, mode: 'insensitive' } } }) : Promise.resolve(0),
      ]);
      return { channelId, count, mentions };
    }));
  }

  async search(userId:string, serverId:string, query:string) {
    const q = query.trim();
    if (q.length < 2) return [];
    if (q.length > 80) throw new BadRequestException('Arama en fazla 80 karakter olabilir.');
    const membership = await this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId } }, select: { id: true } });
    if (!membership) throw new ForbiddenException('Bu alanda arama yapamazsın.');
    const channels = await this.prisma.channel.findMany({ where: { serverId, type: 'TEXT' }, select: { id: true } });
    const visible:string[] = [];
    for (const channel of channels) if (await this.permissions.has(userId, serverId, Permission.VIEW_CHANNEL, channel.id).catch(() => false)) visible.push(channel.id);
    if (!visible.length) return [];
    return this.prisma.message.findMany({
      where: { channelId: { in: visible }, content: { contains: q, mode: 'insensitive' } },
      select: {
        id: true, channelId: true, content: true, createdAt: true,
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true, statusText: true, profileMode: true } },
        channel: { select: { id: true, name: true, groupName: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
  }

  async bulkRemove(userId:string, channelId:string, count:number){
    const channel=await this.channel(userId,channelId,Permission.MANAGE_MESSAGES);
    if(channel.type!=='TEXT') throw new ForbiddenException('Ses kanalında mesaj temizleme kullanılamaz.');
    const amount=Math.max(2,Math.min(100,Math.trunc(count)));
    const rows=await this.prisma.message.findMany({
      where:{channelId},
      orderBy:[{createdAt:'desc'},{id:'desc'}],
      take:amount,
      select:{id:true,attachments:{select:{objectKey:true}}},
    });
    if(!rows.length) return {ok:true,ids:[],count:0};
    const ids=rows.map(row=>row.id);
    await this.prisma.message.deleteMany({where:{id:{in:ids},channelId}});
    await Promise.allSettled(rows.flatMap(row=>row.attachments.map(attachment=>this.storage.remove(attachment.objectKey))));
    return {ok:true,ids,count:ids.length};
  }

  async remove(userId:string,channelId:string,messageId:string){
    const channel=await this.channel(userId,channelId,Permission.VIEW_CHANNEL);
    const message=await this.prisma.message.findFirst({where:{id:messageId,channelId},include:{attachments:true}});
    if(!message) throw new NotFoundException('Mesaj bulunamadı.');
    if(message.authorId!==userId) await this.permissions.require(userId,channel.serverId,Permission.MANAGE_MESSAGES,channelId,'Başkasının mesajını silme yetkin yok.');
    await this.prisma.message.delete({where:{id:message.id}});
    await Promise.all(message.attachments.map(attachment=>this.storage.remove(attachment.objectKey)));
    return {ok:true,id:message.id};
  }
}
