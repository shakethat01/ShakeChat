import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInviteDto } from './dto';

@Injectable()
export class InvitesService {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionsService) {}

  private async manager(userId: string, serverId: string) {
    await this.permissions.require(userId, serverId, Permission.MANAGE_INVITES, undefined, 'Davetleri yönetme yetkin yok.');
  }

  private publicInvite(invite: any) {
    return {
      id: invite.id,
      code: invite.code,
      serverId: invite.serverId,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      useCount: invite.useCount,
      revokedAt: invite.revokedAt,
      createdAt: invite.createdAt,
      creator: invite.creator ? {
        id: invite.creator.id,
        username: invite.creator.username,
        displayName: invite.creator.displayName,
        avatarUrl: invite.creator.avatarUrl,
      } : undefined,
    };
  }

  async create(userId: string, serverId: string, dto: CreateInviteDto) {
    await this.manager(userId, serverId);
    const server = await this.prisma.server.findUnique({ where: { id: serverId }, select: { id: true } });
    if (!server) throw new NotFoundException('Sunucu bulunamadı.');

    const expiresAt = dto.expiresInHours ? new Date(Date.now() + dto.expiresInHours * 60 * 60 * 1000) : null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const invite = await this.prisma.invite.create({
          data: {
            code: randomBytes(9).toString('base64url'),
            serverId,
            creatorId: userId,
            expiresAt,
            maxUses: dto.maxUses ?? null,
          },
          include: { creator: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
        });
        return this.publicInvite(invite);
      } catch (error: any) {
        if (error?.code !== 'P2002' || attempt === 4) throw error;
      }
    }
    throw new BadRequestException('Davet kodu oluşturulamadı.');
  }

  async list(userId: string, serverId: string) {
    await this.manager(userId, serverId);
    const invites = await this.prisma.invite.findMany({
      where: { serverId },
      include: { creator: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map(invite => this.publicInvite(invite));
  }

  async revoke(userId: string, serverId: string, inviteId: string) {
    await this.manager(userId, serverId);
    const invite = await this.prisma.invite.findFirst({ where: { id: inviteId, serverId } });
    if (!invite) throw new NotFoundException('Davet bulunamadı.');
    if (invite.revokedAt) return { ok: true };
    await this.prisma.invite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async preview(code: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: {
        server: { select: { id: true, name: true, iconUrl: true, _count: { select: { members: true } } } },
      },
    });
    if (!invite) throw new NotFoundException('Davet bulunamadı.');
    this.assertUsable(invite);
    return {
      code: invite.code,
      server: {
        id: invite.server.id,
        name: invite.server.name,
        iconUrl: invite.server.iconUrl,
        memberCount: invite.server._count.members,
      },
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      useCount: invite.useCount,
    };
  }

  private assertUsable(invite: { revokedAt: Date | null; expiresAt: Date | null; maxUses: number | null; useCount: number }) {
    if (invite.revokedAt) throw new BadRequestException('Bu davet iptal edilmiş.');
    if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) throw new BadRequestException('Bu davetin süresi dolmuş.');
    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) throw new BadRequestException('Bu davetin kullanım sınırı dolmuş.');
  }

  async join(userId: string, code: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          const invite = await tx.invite.findUnique({
            where: { code },
            include: { server: { select: { id: true, name: true, iconUrl: true } } },
          });
          if (!invite) throw new NotFoundException('Davet bulunamadı.');
          this.assertUsable(invite);

          const existing = await tx.serverMember.findUnique({
            where: { serverId_userId: { serverId: invite.serverId, userId } },
            select: { id: true },
          });
          if (existing) throw new ConflictException('Bu sunucunun zaten üyesisin.');

          const banned = await tx.serverBan.findUnique({
            where: { serverId_userId: { serverId: invite.serverId, userId } },
            select: { id: true },
          });
          if (banned) throw new ForbiddenException('Bu sunucuya katılman yasaklanmış.');

          // Optimistic use-count guard prevents two concurrent joins from consuming the same final slot.
          const claimed = await tx.invite.updateMany({
            where: {
              id: invite.id,
              useCount: invite.useCount,
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            data: { useCount: { increment: 1 } },
          });
          if (claimed.count !== 1) throw new ConflictException('Davet aynı anda kullanıldı. Tekrar dene.');

          await tx.serverMember.create({ data: { serverId: invite.serverId, userId, role: 'MEMBER' } });
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          });
          if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
          return { server: invite.server, member: { ...user, role: 'MEMBER' as const } };
        });
      } catch (error: any) {
        if (error instanceof ConflictException && error.message.includes('aynı anda') && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException('Davet kullanılamadı.');
  }
}
