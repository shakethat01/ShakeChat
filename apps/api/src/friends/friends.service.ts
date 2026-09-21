import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FriendRateLimitService } from './friend-rate-limit.service';

const safeUserSelect = { id: true, username: true, displayName: true, avatarUrl: true, statusText: true, profileMode: true } as const;

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService, private readonly rateLimit: FriendRateLimitService) {}

  private pair(a: string, b: string) { return a < b ? [a, b] as const : [b, a] as const; }

  async isBlockedEither(userId: string, otherId: string) {
    return !!await this.prisma.userBlock.findFirst({
      where: { OR: [{ blockerId: userId, blockedId: otherId }, { blockerId: otherId, blockedId: userId }] },
      select: { id: true },
    });
  }

  async list(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      include: { userA: { select: safeUserSelect }, userB: { select: safeUserSelect } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(row => row.userAId === userId ? row.userB : row.userA);
  }

  async blocks(userId: string) {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      include: { blocked: { select: safeUserSelect } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(row => ({ id: row.id, createdAt: row.createdAt, user: row.blocked }));
  }

  async requests(userId: string) {
    const [incoming, outgoing] = await Promise.all([
      this.prisma.friendRequest.findMany({ where: { receiverId: userId }, include: { sender: { select: safeUserSelect } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.friendRequest.findMany({ where: { senderId: userId }, include: { receiver: { select: safeUserSelect } }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      incoming: incoming.map(request => ({ id: request.id, createdAt: request.createdAt, user: request.sender })),
      outgoing: outgoing.map(request => ({ id: request.id, createdAt: request.createdAt, user: request.receiver })),
    };
  }

  async sendRequest(userId: string, username: string) {
    this.rateLimit.assert(userId);
    const receiver = await this.prisma.user.findUnique({
      where: { username },
      select: { ...safeUserSelect, friendRequestPolicy: true },
    });
    if (!receiver) throw new NotFoundException('Kullanıcı bulunamadı.');
    if (receiver.id === userId) throw new BadRequestException('Kendine arkadaşlık isteği gönderemezsin.');
    if (await this.isBlockedEither(userId, receiver.id)) throw new ForbiddenException('Bu kullanıcıyla arkadaşlık isteği başlatılamaz.');

    const policy = receiver.friendRequestPolicy ?? 'EVERYONE';
    if (policy === 'NOBODY') throw new ForbiddenException('Bu kullanıcı arkadaşlık isteği kabul etmiyor.');
    if (policy === 'SHARED_SERVERS') {
      const shared = await this.prisma.serverMember.findFirst({
        where: { userId, server: { members: { some: { userId: receiver.id } } } },
        select: { id: true },
      });
      if (!shared) throw new ForbiddenException('Bu kullanıcı yalnızca ortak alan üyelerinden arkadaşlık isteği kabul ediyor.');
    }

    const [userAId, userBId] = this.pair(userId, receiver.id);
    if (await this.prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } }, select: { id: true } })) throw new ConflictException('Bu kullanıcı zaten arkadaşın.');
    const reverse = await this.prisma.friendRequest.findUnique({ where: { senderId_receiverId: { senderId: receiver.id, receiverId: userId } }, select: { id: true } });
    if (reverse) throw new ConflictException('Bu kullanıcı sana zaten arkadaşlık isteği göndermiş. Bekleyen isteklerden kabul edebilirsin.');
    try {
      const request = await this.prisma.friendRequest.create({ data: { senderId: userId, receiverId: receiver.id } });
      const { friendRequestPolicy: _policy, ...safeReceiver } = receiver;
      return { id: request.id, createdAt: request.createdAt, user: safeReceiver };
    } catch { throw new ConflictException('Bu kullanıcıya zaten arkadaşlık isteği gönderdin.'); }
  }

  async accept(userId: string, requestId: string) {
    const request = await this.prisma.friendRequest.findUnique({ where: { id: requestId }, select: { id: true, senderId: true, receiverId: true } });
    if (!request) throw new NotFoundException('Arkadaşlık isteği bulunamadı.');
    if (request.receiverId !== userId) throw new ForbiddenException('Bu isteği kabul edemezsin.');
    if (await this.isBlockedEither(request.senderId, request.receiverId)) throw new ForbiddenException('Engellenen kullanıcıyla arkadaşlık kurulamaz.');
    const [userAId, userBId] = this.pair(request.senderId, request.receiverId);
    await this.prisma.$transaction(async tx => {
      await tx.friendship.upsert({ where: { userAId_userBId: { userAId, userBId } }, update: {}, create: { userAId, userBId } });
      await tx.friendRequest.deleteMany({ where: { OR: [{ senderId: request.senderId, receiverId: request.receiverId }, { senderId: request.receiverId, receiverId: request.senderId }] } });
    });
    const friend = await this.prisma.user.findUnique({ where: { id: request.senderId }, select: safeUserSelect });
    return { friend };
  }

  async rejectOrCancel(userId: string, requestId: string) {
    const request = await this.prisma.friendRequest.findUnique({ where: { id: requestId }, select: { senderId: true, receiverId: true } });
    if (!request) throw new NotFoundException('Arkadaşlık isteği bulunamadı.');
    if (request.senderId !== userId && request.receiverId !== userId) throw new ForbiddenException('Bu isteği yönetemezsin.');
    await this.prisma.friendRequest.delete({ where: { id: requestId } });
    return { ok: true, otherUserId: request.senderId === userId ? request.receiverId : request.senderId };
  }

  async remove(userId: string, friendId: string) {
    if (friendId === userId) throw new BadRequestException('Kendini arkadaş listesinden çıkaramazsın.');
    const [userAId, userBId] = this.pair(userId, friendId);
    const friendship = await this.prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } }, select: { id: true } });
    if (!friendship) throw new NotFoundException('Arkadaşlık bulunamadı.');
    await this.prisma.friendship.delete({ where: { id: friendship.id } });
    return { ok: true };
  }

  async block(userId: string, targetId: string) {
    if (targetId === userId) throw new BadRequestException('Kendini engelleyemezsin.');
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: safeUserSelect });
    if (!target) throw new NotFoundException('Kullanıcı bulunamadı.');
    const [userAId, userBId] = this.pair(userId, targetId);
    await this.prisma.$transaction(async tx => {
      await tx.userBlock.upsert({ where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } }, update: {}, create: { blockerId: userId, blockedId: targetId } });
      await tx.friendship.deleteMany({ where: { userAId, userBId } });
      await tx.friendRequest.deleteMany({ where: { OR: [{ senderId: userId, receiverId: targetId }, { senderId: targetId, receiverId: userId }] } });
    });
    return { ok: true, user: target };
  }

  async unblock(userId: string, targetId: string) {
    await this.prisma.userBlock.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
    return { ok: true };
  }

  async areFriends(userId: string, friendId: string) {
    const [userAId, userBId] = this.pair(userId, friendId);
    return !!await this.prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } }, select: { id: true } });
  }
}
