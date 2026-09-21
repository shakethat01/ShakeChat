import { MemberRole, Permission } from '@prisma/client';

export const ALL_PERMISSIONS: Permission[] = [
  Permission.ADMINISTRATOR,
  Permission.MANAGE_SERVER,
  Permission.MANAGE_CHANNELS,
  Permission.MANAGE_ROLES,
  Permission.KICK_MEMBERS,
  Permission.BAN_MEMBERS,
  Permission.MODERATE_MEMBERS,
  Permission.MANAGE_MESSAGES,
  Permission.MANAGE_INVITES,
  Permission.VIEW_CHANNEL,
  Permission.SEND_MESSAGES,
  Permission.CONNECT_VOICE,
  Permission.SPEAK,
];

export const DEFAULT_ROLE_PERMISSIONS: Record<MemberRole, Permission[]> = {
  OWNER: [Permission.ADMINISTRATOR],
  ADMIN: [Permission.ADMINISTRATOR],
  MODERATOR: [
    Permission.KICK_MEMBERS,
    Permission.MODERATE_MEMBERS,
    Permission.MANAGE_MESSAGES,
    Permission.MANAGE_INVITES,
    Permission.VIEW_CHANNEL,
    Permission.SEND_MESSAGES,
    Permission.CONNECT_VOICE,
    Permission.SPEAK,
  ],
  MEMBER: [
    Permission.VIEW_CHANNEL,
    Permission.SEND_MESSAGES,
    Permission.CONNECT_VOICE,
    Permission.SPEAK,
  ],
};

export const DEFAULT_ROLE_META: Record<MemberRole, { name: string; position: number; color: string | null }> = {
  OWNER: { name: 'Sahip', position: 100, color: '#f0b232' },
  ADMIN: { name: 'Yönetici', position: 80, color: '#e74c3c' },
  MODERATOR: { name: 'Moderatör', position: 50, color: '#2ecc71' },
  MEMBER: { name: 'Üye', position: 0, color: null },
};

export const ROLE_RANK: Record<MemberRole, number> = { OWNER: 100, ADMIN: 80, MODERATOR: 50, MEMBER: 0 };
