import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const safeUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  statusText: true,
  profileMode: true,
} as const;

@Injectable()
export class DirectMessageAccessService {
  constructor(private readonly prisma: PrismaService) {}

  private pair(a: string, b: string) {
    return a < b ? [a, b] as const : [b, a] as const;
  }

  private pairKey(a: string, b: string) {
    const [x, y] = this.pair(a, b);
    return `${x}:${y}`;
  }

  private async blocked(a: string, b: string) {
    return !!await this.prisma.userBlock.findFirst({
      where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
      select: { id: true },
    });
  }

  private async areFriends(a: string, b: string) {
    const [userAId, userBId] = this.pair(a, b);
    return !!await this.prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
      select: { id: true },
    });
  }

  private async shareServer(a: string, b: string) {
    return !!await this.prisma.serverMember.findFirst({
      where: {
        userId: a,
        server: { members: { some: { userId: b } } },
      },
      select: { id: true },
    });
  }

  async open(userId: string, targetUserId: string) {
    if (targetUserId === userId) throw new BadRequestException('Kendinle özel mesaj başlatamazsın.');
    if (await this.blocked(userId, targetUserId)) throw new ForbiddenException('Engellenen kullanıcıyla özel mesaj başlatılamaz.');

    const other = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: safeUserSelect });
    if (!other) throw new NotFoundException('Kullanıcı bulunamadı.');

    const [friends, commonServer] = await Promise.all([
      this.areFriends(userId, targetUserId),
      this.shareServer(userId, targetUserId),
    ]);
    if (!friends && !commonServer) {
      throw new ForbiddenException('Özel mesaj başlatmak için aynı sunucuda olmalı veya arkadaş olmalısınız.');
    }

    const conversation = await this.prisma.directMessageConversation.upsert({
      where: { pairKey: this.pairKey(userId, targetUserId) },
      update: {},
      create: {
        pairKey: this.pairKey(userId, targetUserId),
        members: { create: [{ userId }, { userId: targetUserId }] },
      },
      select: { id: true, updatedAt: true },
    });
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: safeUserSelect });
    return {
      ...conversation,
      title: null,
      isGroup: false,
      blocked: false,
      members: [me, other].filter(Boolean),
      other,
      lastMessage: null,
    };
  }
}
