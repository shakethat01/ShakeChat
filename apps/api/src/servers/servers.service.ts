import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, MemberRole, Permission } from '@prisma/client';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServersService {
  constructor(private prisma: PrismaService, private permissions: PermissionsService) {}

  async list(userId: string) {
    const servers = await this.prisma.server.findMany({
      where: { members: { some: { userId } } },
      include: { channels: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(servers.map(async server => ({
      ...server,
      channels: (await Promise.all(server.channels.map(async channel => ({
        channel,
        visible: await this.permissions.has(userId, server.id, Permission.VIEW_CHANNEL, channel.id).catch(() => false),
      })))).filter(item => item.visible).map(item => item.channel),
    })));
  }

  async create(userId: string, name: string) {
    const server = await this.prisma.server.create({
      data: {
        name,
        ownerId: userId,
        members: { create: { userId, role: 'OWNER' } },
        channels: { create: [
          { name: 'genel', type: 'TEXT', position: 0 },
          { name: 'Genel Ses', type: 'VOICE', position: 1 },
        ] },
      },
      include: { channels: true },
    });
    await this.permissions.ensureDefaultRoles(server.id);
    return server;
  }

  async listMembers(userId: string, serverId: string) {
    const requester = await this.prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } },
      select: { id: true },
    });
    if (!requester) throw new ForbiddenException('Bu sunucunun üyelerini göremezsin.');
    await this.permissions.ensureDefaultRoles(serverId);
    const managed = await this.prisma.role.findMany({ where: { serverId, isManaged: true } });
    const byLegacy = new Map(managed.filter(role => role.legacyRole).map(role => [role.legacyRole!, role]));
    const rows = await this.prisma.serverMember.findMany({
      where: { serverId },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        messageRestrictedUntil: true,
        messageRestrictionReason: true,
        roleLinks: { include: { role: true } },
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, statusText: true, profileMode: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map(row => ({
      role: row.role,
      joinedAt: row.joinedAt,
      messageRestrictedUntil: row.messageRestrictedUntil,
      messageRestrictionReason: row.messageRestrictionReason,
      roles: [byLegacy.get(row.role), ...row.roleLinks.map(link => link.role)].filter(Boolean),
      user: row.user,
    }));
  }

  async leave(userId: string, serverId: string) {
    const member = await this.prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } },
      select: { id: true, role: true },
    });
    if (!member) throw new NotFoundException('Sunucu üyeliği bulunamadı.');
    if (member.role === MemberRole.OWNER) throw new ForbiddenException('Sunucu sahibi sunucudan ayrılamaz. Önce sahipliği devret veya sunucuyu sil.');
    await this.prisma.serverMember.delete({ where: { id: member.id } });
    return { ok: true };
  }

  async kick(requesterId: string, serverId: string, targetUserId: string) {
    if (requesterId === targetUserId) throw new ForbiddenException('Kendini kickleyemezsin. Ayrıl seçeneğini kullan.');
    await this.permissions.require(requesterId, serverId, Permission.KICK_MEMBERS, undefined, 'Üye çıkarma yetkin yok.');
    const [requester, target] = await Promise.all([
      this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: requesterId } }, select: { role: true, user: { select: { username: true, displayName: true } } } }),
      this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: targetUserId } }, select: { id: true, role: true, user: { select: { username: true, displayName: true } } } }),
    ]);
    if (!requester) throw new ForbiddenException('Bu sunucunun üyesi değilsin.');
    if (!target) throw new NotFoundException('Üye bulunamadı.');
    if (target.role === MemberRole.OWNER) throw new ForbiddenException('Sunucu sahibi çıkarılamaz.');
    if (!this.permissions.canKickByHierarchy(requester.role, target.role)) throw new ForbiddenException('Eşit veya daha yüksek yetkili bir üyeyi çıkaramazsın.');
    await this.prisma.$transaction(async tx => {
      await tx.serverMember.delete({ where: { id: target.id } });
      await tx.serverAuditLog.create({ data: {
        serverId, actorId: requesterId, targetUserId, action: AuditAction.MEMBER_KICKED,
        actorName: requester.user.displayName?.trim() || requester.user.username,
        targetName: target.user.displayName?.trim() || target.user.username,
      } });
    });
    return { ok: true };
  }

  async restrictMessages(requesterId: string, serverId: string, targetUserId: string, durationMinutes: number, reason?: string) {
    if (requesterId === targetUserId) throw new ForbiddenException('Kendi yazma yetkini kısıtlayamazsın.');
    await this.permissions.require(requesterId, serverId, Permission.MODERATE_MEMBERS, undefined, 'Üye yazma kısıtı yetkin yok.');
    const [requester, target] = await Promise.all([
      this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: requesterId } }, select: { role: true, user: { select: { username: true, displayName: true } } } }),
      this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: targetUserId } }, select: { id: true, role: true, user: { select: { username: true, displayName: true } } } }),
    ]);
    if (!requester) throw new ForbiddenException('Bu sunucunun üyesi değilsin.');
    if (!target) throw new NotFoundException('Üye bulunamadı.');
    if (target.role === MemberRole.OWNER || target.role === MemberRole.ADMIN) throw new ForbiddenException('Yönetici veya sunucu sahibi yazma kısıtına alınamaz.');
    if (!this.permissions.canKickByHierarchy(requester.role, target.role)) throw new ForbiddenException('Eşit veya daha yüksek yetkili bir üyeyi kısıtlayamazsın.');
    const targetPermissions = await this.permissions.effective(targetUserId, serverId);
    if (targetPermissions.includes(Permission.ADMINISTRATOR)) throw new ForbiddenException('Yönetici yetkisine sahip üye yazma kısıtına alınamaz.');
    const minutes = Math.max(1, Math.min(10080, Math.trunc(durationMinutes)));
    const restrictedUntil = new Date(Date.now() + minutes * 60_000);
    const normalizedReason = reason?.trim().slice(0, 240) || null;
    await this.prisma.$transaction(async tx => {
      await tx.serverMember.update({ where: { id: target.id }, data: { messageRestrictedUntil: restrictedUntil, messageRestrictionReason: normalizedReason } });
      await tx.serverAuditLog.create({ data: {
        serverId, actorId: requesterId, targetUserId, action: AuditAction.MEMBER_RESTRICTED,
        actorName: requester.user.displayName?.trim() || requester.user.username,
        targetName: target.user.displayName?.trim() || target.user.username,
        reason: normalizedReason ? `${minutes} dk · ${normalizedReason}` : `${minutes} dk`,
      } });
    });
    return { ok: true, userId: targetUserId, messageRestrictedUntil: restrictedUntil, messageRestrictionReason: normalizedReason };
  }

  async clearMessageRestriction(requesterId: string, serverId: string, targetUserId: string) {
    if (requesterId === targetUserId) throw new ForbiddenException('Kendi yazma kısıtını kaldıramazsın.');
    await this.permissions.require(requesterId, serverId, Permission.MODERATE_MEMBERS, undefined, 'Üye yazma kısıtı yetkin yok.');
    const [requester, target] = await Promise.all([
      this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: requesterId } }, select: { role: true, user: { select: { username: true, displayName: true } } } }),
      this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: targetUserId } }, select: { id: true, role: true, messageRestrictedUntil: true, messageRestrictionReason: true, user: { select: { username: true, displayName: true } } } }),
    ]);
    if (!requester) throw new ForbiddenException('Bu sunucunun üyesi değilsin.');
    if (!target) throw new NotFoundException('Üye bulunamadı.');
    if (target.role === MemberRole.OWNER || target.role === MemberRole.ADMIN) throw new ForbiddenException('Yönetici veya sunucu sahibi yazma kısıtına alınamaz.');
    if (!this.permissions.canKickByHierarchy(requester.role, target.role)) throw new ForbiddenException('Eşit veya daha yüksek yetkili bir üyenin kısıtını değiştiremezsin.');
    const hadRestriction = !!target.messageRestrictedUntil || !!target.messageRestrictionReason;
    await this.prisma.$transaction(async tx => {
      await tx.serverMember.update({ where: { id: target.id }, data: { messageRestrictedUntil: null, messageRestrictionReason: null } });
      if (hadRestriction) await tx.serverAuditLog.create({ data: {
        serverId, actorId: requesterId, targetUserId, action: AuditAction.MEMBER_RESTRICTION_REMOVED,
        actorName: requester.user.displayName?.trim() || requester.user.username,
        targetName: target.user.displayName?.trim() || target.user.username,
      } });
    });
    return { ok: true, userId: targetUserId, messageRestrictedUntil: null, messageRestrictionReason: null };
  }

  async listBans(userId: string, serverId: string) {
    await this.permissions.require(userId, serverId, Permission.BAN_MEMBERS, undefined, 'Yasaklı kullanıcıları görme yetkin yok.');
    return this.prisma.serverBan.findMany({
      where: { serverId },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, statusText: true, profileMode: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async ban(requesterId: string, serverId: string, targetUserId: string, reason?: string) {
    if (requesterId === targetUserId) throw new ForbiddenException('Kendini yasaklayamazsın.');
    await this.permissions.require(requesterId, serverId, Permission.BAN_MEMBERS, undefined, 'Üye yasaklama yetkin yok.');
    const [requester, target, user] = await Promise.all([
      this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: requesterId } }, select: { role: true, user: { select: { username: true, displayName: true } } } }),
      this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: targetUserId } }, select: { id: true, role: true } }),
      this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, username: true, displayName: true } }),
    ]);
    if (!requester) throw new ForbiddenException('Bu sunucunun üyesi değilsin.');
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    if (target?.role === MemberRole.OWNER) throw new ForbiddenException('Sunucu sahibi yasaklanamaz.');
    if (target && !this.permissions.canKickByHierarchy(requester.role, target.role)) throw new ForbiddenException('Eşit veya daha yüksek yetkili bir üyeyi yasaklayamazsın.');
    await this.prisma.$transaction(async tx => {
      await tx.serverBan.upsert({
        where: { serverId_userId: { serverId, userId: targetUserId } },
        update: { reason: reason?.trim().slice(0, 240) || null, createdAt: new Date() },
        create: { serverId, userId: targetUserId, reason: reason?.trim().slice(0, 240) || null },
      });
      if (target) await tx.serverMember.delete({ where: { id: target.id } });
      await tx.serverAuditLog.create({ data: {
        serverId, actorId: requesterId, targetUserId, action: AuditAction.MEMBER_BANNED,
        actorName: requester.user.displayName?.trim() || requester.user.username,
        targetName: user.displayName?.trim() || user.username,
        reason: reason?.trim().slice(0, 240) || null,
      } });
    });
    return { ok: true };
  }

  async unban(userId: string, serverId: string, targetUserId: string) {
    await this.permissions.require(userId, serverId, Permission.BAN_MEMBERS, undefined, 'Yasak kaldırma yetkin yok.');
    const [actor, target, existing] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { username: true, displayName: true } }),
      this.prisma.user.findUnique({ where: { id: targetUserId }, select: { username: true, displayName: true } }),
      this.prisma.serverBan.findUnique({ where: { serverId_userId: { serverId, userId: targetUserId } }, select: { id: true } }),
    ]);
    if (!actor) throw new ForbiddenException('Kullanıcı bulunamadı.');
    if (!target) throw new NotFoundException('Kullanıcı bulunamadı.');
    await this.prisma.$transaction(async tx => {
      await tx.serverBan.deleteMany({ where: { serverId, userId: targetUserId } });
      if (existing) await tx.serverAuditLog.create({ data: {
        serverId, actorId: userId, targetUserId, action: AuditAction.MEMBER_UNBANNED,
        actorName: actor.displayName?.trim() || actor.username,
        targetName: target.displayName?.trim() || target.username,
      } });
    });
    return { ok: true };
  }

  async listAudit(userId: string, serverId: string, action?: string) {
    const permissions = await this.permissions.effective(userId, serverId);
    const canView = permissions.includes(Permission.ADMINISTRATOR) || permissions.includes(Permission.MANAGE_SERVER) || permissions.includes(Permission.KICK_MEMBERS) || permissions.includes(Permission.BAN_MEMBERS) || permissions.includes(Permission.MODERATE_MEMBERS);
    if (!canView) throw new ForbiddenException('İşlem geçmişini görme yetkin yok.');
    let actionFilter: AuditAction | undefined;
    if (action) {
      if (!Object.values(AuditAction).includes(action as AuditAction)) throw new BadRequestException('Geçersiz işlem filtresi.');
      actionFilter = action as AuditAction;
    }
    return this.prisma.serverAuditLog.findMany({
      where: { serverId, ...(actionFilter ? { action: actionFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

}
