import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberRole, Permission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto, SetChannelOverrideDto, UpdateRoleDto } from './dto';
import { ALL_PERMISSIONS, DEFAULT_ROLE_META, DEFAULT_ROLE_PERMISSIONS, ROLE_RANK } from './permission.constants';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async member(userId: string, serverId: string) {
    const member = await this.prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } },
      include: { roleLinks: { include: { role: true } } },
    });
    if (!member) throw new ForbiddenException('Bu sunucuya erişimin yok.');
    return member;
  }

  async ensureDefaultRoles(serverId: string) {
    const result = [];
    for (const legacyRole of Object.values(MemberRole)) {
      const meta = DEFAULT_ROLE_META[legacyRole];
      result.push(await this.prisma.role.upsert({
        where: { serverId_legacyRole: { serverId, legacyRole } },
        update: { isManaged: true },
        create: {
          serverId,
          legacyRole,
          name: meta.name,
          color: meta.color,
          position: meta.position,
          permissions: DEFAULT_ROLE_PERMISSIONS[legacyRole],
          isManaged: true,
        },
      }));
    }
    return result;
  }

  private serverPermissionsFromMember(member: Awaited<ReturnType<PermissionsService['member']>>) {
    if (member.role === MemberRole.OWNER) return new Set<Permission>(ALL_PERMISSIONS);
    const set = new Set<Permission>(DEFAULT_ROLE_PERMISSIONS[member.role]);
    for (const link of member.roleLinks ?? []) for (const permission of link.role.permissions) set.add(permission);
    if (set.has(Permission.ADMINISTRATOR)) return new Set<Permission>(ALL_PERMISSIONS);
    return set;
  }

  private applyMemberRestrictions(member: { messageRestrictedUntil?: Date | null }, permissions: Set<Permission>) {
    if (member.messageRestrictedUntil && member.messageRestrictedUntil.getTime() > Date.now()) {
      permissions.delete(Permission.SEND_MESSAGES);
    }
    return permissions;
  }

  async effective(userId: string, serverId: string, channelId?: string) {
    const member = await this.member(userId, serverId);
    if (member.role === MemberRole.OWNER) return [...ALL_PERMISSIONS];
    const managed = await this.prisma.role.findUnique({ where: { serverId_legacyRole: { serverId, legacyRole: member.role } } });
    const base = new Set<Permission>(managed?.permissions ?? DEFAULT_ROLE_PERMISSIONS[member.role]);
    for (const link of member.roleLinks ?? []) for (const permission of link.role.permissions) base.add(permission);
    if (base.has(Permission.ADMINISTRATOR)) return [...ALL_PERMISSIONS];
    if (!channelId) return [...this.applyMemberRestrictions(member, base)];

    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, serverId }, select: { id: true } });
    if (!channel) throw new NotFoundException('Kanal bulunamadı.');

    const roleIds = new Set((member.roleLinks ?? []).map(link => link.roleId));
    if (managed) roleIds.add(managed.id);
    if (roleIds.size) {
      const overrides = await this.prisma.channelPermission.findMany({ where: { channelId, roleId: { in: [...roleIds] } } });
      const deny = new Set<Permission>();
      const allow = new Set<Permission>();
      for (const override of overrides) {
        for (const permission of override.deny) deny.add(permission);
        for (const permission of override.allow) allow.add(permission);
      }
      for (const permission of deny) base.delete(permission);
      for (const permission of allow) base.add(permission);
    }
    return [...this.applyMemberRestrictions(member, base)];
  }

  async has(userId: string, serverId: string, permission: Permission, channelId?: string) {
    const permissions = await this.effective(userId, serverId, channelId);
    return permissions.includes(Permission.ADMINISTRATOR) || permissions.includes(permission);
  }

  async require(userId: string, serverId: string, permission: Permission, channelId?: string, message = 'Bu işlem için yetkin yok.') {
    if (!(await this.has(userId, serverId, permission, channelId))) throw new ForbiddenException(message);
  }

  async channelContext(channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { id: true, serverId: true, type: true } });
    if (!channel) throw new NotFoundException('Kanal bulunamadı.');
    return channel;
  }

  async canAccessChannel(userId: string, channelId: string, permission: Permission = Permission.VIEW_CHANNEL) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
    if (!channel) return false;
    try { return await this.has(userId, channel.serverId, permission, channelId); } catch { return false; }
  }

  async listRoles(userId: string, serverId: string) {
    await this.member(userId, serverId);
    await this.ensureDefaultRoles(serverId);
    const roles = await this.prisma.role.findMany({
      where: { serverId },
      include: { _count: { select: { members: true } } },
      orderBy: [{ position: 'desc' }, { createdAt: 'asc' }],
    });
    const baseCounts = await this.prisma.serverMember.groupBy({ by: ['role'], where: { serverId }, _count: { role: true } });
    const countByLegacy = new Map(baseCounts.map(row => [row.role, row._count.role]));
    return roles.map(role => ({
      ...role,
      memberCount: role.legacyRole ? (countByLegacy.get(role.legacyRole) ?? 0) : role._count.members,
      _count: undefined,
    }));
  }

  private async requester(userId: string, serverId: string) {
    const member = await this.member(userId, serverId);
    const permissions = await this.effective(userId, serverId);
    if (!permissions.includes(Permission.ADMINISTRATOR) && !permissions.includes(Permission.MANAGE_ROLES)) throw new ForbiddenException('Rolleri yönetme yetkin yok.');
    return { member, owner: member.role === MemberRole.OWNER };
  }

  private elevated(permissions: Permission[]) {
    return permissions.includes(Permission.ADMINISTRATOR) || permissions.includes(Permission.MANAGE_ROLES);
  }

  async createRole(userId: string, serverId: string, dto: CreateRoleDto) {
    const requester = await this.requester(userId, serverId);
    if (!requester.owner && this.elevated(dto.permissions)) throw new ForbiddenException('Bu yetkileri yalnızca sunucu sahibi verebilir.');
    const max = await this.prisma.role.aggregate({ where: { serverId, isManaged: false }, _max: { position: true } });
    return this.prisma.role.create({ data: {
      serverId,
      name: dto.name.trim(),
      color: dto.color ?? null,
      permissions: dto.permissions,
      position: Math.min((max._max.position ?? 1) + 1, 49),
    } });
  }

  async updateRole(userId: string, serverId: string, roleId: string, dto: UpdateRoleDto) {
    const requester = await this.requester(userId, serverId);
    const role = await this.prisma.role.findFirst({ where: { id: roleId, serverId } });
    if (!role) throw new NotFoundException('Rol bulunamadı.');
    if (role.legacyRole === MemberRole.OWNER) throw new ForbiddenException('Sahip rolü değiştirilemez.');
    if (role.isManaged && !requester.owner) throw new ForbiddenException('Sistem rollerini yalnızca sunucu sahibi değiştirebilir.');
    const nextPermissions = dto.permissions ?? role.permissions;
    if (!requester.owner && (this.elevated(role.permissions) || this.elevated(nextPermissions))) throw new ForbiddenException('Bu rolü yönetemezsin.');
    if (role.isManaged && dto.name && dto.name.trim() !== role.name) throw new BadRequestException('Sistem rolünün adı değiştirilemez.');
    return this.prisma.role.update({ where: { id: role.id }, data: {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.color !== undefined ? { color: dto.color } : {}),
      ...(dto.permissions !== undefined ? { permissions: dto.permissions } : {}),
    } });
  }

  async deleteRole(userId: string, serverId: string, roleId: string) {
    const requester = await this.requester(userId, serverId);
    const role = await this.prisma.role.findFirst({ where: { id: roleId, serverId } });
    if (!role) throw new NotFoundException('Rol bulunamadı.');
    if (role.isManaged) throw new ForbiddenException('Sistem rolü silinemez.');
    if (!requester.owner && this.elevated(role.permissions)) throw new ForbiddenException('Bu rolü silemezsin.');
    const affected = await this.memberIdsForRole(role);
    await this.prisma.role.delete({ where: { id: role.id } });
    return { ok: true, affectedUserIds: affected };
  }

  async assignRole(userId: string, serverId: string, targetUserId: string, roleId: string) {
    const requester = await this.requester(userId, serverId);
    const target = await this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: targetUserId } } });
    if (!target) throw new NotFoundException('Üye bulunamadı.');
    if (target.role === MemberRole.OWNER) throw new ForbiddenException('Sunucu sahibinin rolleri değiştirilemez.');
    const role = await this.prisma.role.findFirst({ where: { id: roleId, serverId } });
    if (!role) throw new NotFoundException('Rol bulunamadı.');
    if (!requester.owner && (role.isManaged || this.elevated(role.permissions))) throw new ForbiddenException('Bu rolü atayamazsın.');
    if (role.legacyRole) {
      if (!requester.owner) throw new ForbiddenException('Sistem rolünü yalnızca sunucu sahibi atayabilir.');
      if (role.legacyRole === MemberRole.OWNER) throw new ForbiddenException('Sahiplik devri bu sürümde desteklenmiyor.');
      await this.prisma.serverMember.update({ where: { id: target.id }, data: { role: role.legacyRole } });
      return { ok: true, baseRole: role.legacyRole };
    }
    await this.prisma.serverMemberRole.upsert({
      where: { memberId_roleId: { memberId: target.id, roleId } },
      update: {}, create: { memberId: target.id, roleId },
    });
    return { ok: true };
  }

  async unassignRole(userId: string, serverId: string, targetUserId: string, roleId: string) {
    const requester = await this.requester(userId, serverId);
    const target = await this.prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: targetUserId } } });
    if (!target) throw new NotFoundException('Üye bulunamadı.');
    const role = await this.prisma.role.findFirst({ where: { id: roleId, serverId } });
    if (!role) throw new NotFoundException('Rol bulunamadı.');
    if (role.isManaged) throw new ForbiddenException('Temel sistem rolü kaldırılamaz; başka bir sistem rolü ata.');
    if (!requester.owner && this.elevated(role.permissions)) throw new ForbiddenException('Bu rolü kaldıramazsın.');
    await this.prisma.serverMemberRole.deleteMany({ where: { memberId: target.id, roleId } });
    return { ok: true };
  }

  async listChannelOverrides(userId: string, serverId: string, channelId: string) {
    await this.member(userId, serverId);
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, serverId }, select: { id: true } });
    if (!channel) throw new NotFoundException('Kanal bulunamadı.');
    await this.ensureDefaultRoles(serverId);
    const roles = await this.prisma.role.findMany({ where: { serverId }, orderBy: [{ position: 'desc' }, { createdAt: 'asc' }] });
    const overrides = await this.prisma.channelPermission.findMany({ where: { channelId } });
    const byRole = new Map(overrides.map(item => [item.roleId, item]));
    return roles.map(role => ({ role, allow: byRole.get(role.id)?.allow ?? [], deny: byRole.get(role.id)?.deny ?? [] }));
  }

  async setChannelOverride(userId: string, serverId: string, channelId: string, roleId: string, dto: SetChannelOverrideDto) {
    const requester = await this.requester(userId, serverId);
    const [channel, role] = await Promise.all([
      this.prisma.channel.findFirst({ where: { id: channelId, serverId }, select: { id: true } }),
      this.prisma.role.findFirst({ where: { id: roleId, serverId } }),
    ]);
    if (!channel) throw new NotFoundException('Kanal bulunamadı.');
    if (!role) throw new NotFoundException('Rol bulunamadı.');
    if (role.legacyRole === MemberRole.OWNER) throw new ForbiddenException('Sahip rolü kanal kısıtlamalarından etkilenmez.');
    if (!requester.owner && (role.isManaged || this.elevated(role.permissions))) throw new ForbiddenException('Bu rolün kanal izinlerini değiştiremezsin.');
    const allow = [...new Set(dto.allow)];
    const allowSet = new Set(allow);
    const deny = [...new Set(dto.deny)].filter(permission => !allowSet.has(permission));
    return this.prisma.channelPermission.upsert({
      where: { channelId_roleId: { channelId, roleId } },
      update: { allow, deny },
      create: { channelId, roleId, allow, deny },
    });
  }

  async clearChannelOverride(userId: string, serverId: string, channelId: string, roleId: string) {
    await this.requester(userId, serverId);
    const [channel, role] = await Promise.all([
      this.prisma.channel.findFirst({ where: { id: channelId, serverId }, select: { id: true } }),
      this.prisma.role.findFirst({ where: { id: roleId, serverId }, select: { id: true } }),
    ]);
    if (!channel) throw new NotFoundException('Kanal bulunamadı.');
    if (!role) throw new NotFoundException('Rol bulunamadı.');
    await this.prisma.channelPermission.deleteMany({ where: { channelId, roleId } });
    return { ok: true };
  }

  async memberIdsForRole(role: { id: string; serverId: string; legacyRole: MemberRole | null }) {
    if (role.legacyRole) {
      return (await this.prisma.serverMember.findMany({ where: { serverId: role.serverId, role: role.legacyRole }, select: { userId: true } })).map(row => row.userId);
    }
    return (await this.prisma.serverMemberRole.findMany({ where: { roleId: role.id }, select: { member: { select: { userId: true } } } })).map(row => row.member.userId);
  }

  async roleDetailsForMember(serverId: string, memberId: string, baseRole: MemberRole) {
    await this.ensureDefaultRoles(serverId);
    const [managed, custom] = await Promise.all([
      this.prisma.role.findUnique({ where: { serverId_legacyRole: { serverId, legacyRole: baseRole } } }),
      this.prisma.serverMemberRole.findMany({ where: { memberId }, include: { role: true } }),
    ]);
    return [managed, ...custom.map(link => link.role)].filter(Boolean);
  }

  canKickByHierarchy(requesterRole: MemberRole, targetRole: MemberRole) {
    return requesterRole === MemberRole.OWNER || ROLE_RANK[requesterRole] > ROLE_RANK[targetRole];
  }
}
