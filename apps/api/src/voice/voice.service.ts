import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
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

  async createJoinToken(userId: string, channelId: string) {
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
      canPublishData: false,
    });

    return {
      token: await token.toJwt(),
      url: this.publicUrl,
      room,
      channelId,
      canSpeak,
    };
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
          await this.roomClient.removeParticipant(room, userId, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) });
          return;
        }
        const canSpeak = await this.permissions.has(userId, serverId, Permission.SPEAK, channel.id);
        await this.roomClient.updateParticipant(room, userId, {
          permission: {
            canSubscribe: true,
            canPublish: canSpeak,
            canPublishData: false,
          },
        });
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
      try {
        await this.roomClient.removeParticipant(this.roomName(channel.id), userId, {
          revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
        });
      } catch {
        // Not being connected to this voice room is already the desired state.
      }
    }));
  }

  async closeChannel(channelId: string) {
    try { await this.roomClient.deleteRoom(this.roomName(channelId)); }
    catch { /* No active LiveKit room is fine. */ }
  }
}
