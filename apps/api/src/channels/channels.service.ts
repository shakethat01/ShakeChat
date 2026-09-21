import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';
import { CreateChannelDto, UpdateChannelDto } from './dto';

@Injectable()
export class ChannelsService {
  constructor(private prisma: PrismaService, private permissions: PermissionsService, private voice: VoiceService) {}

  async create(userId: string, serverId: string, dto: CreateChannelDto) {
    await this.permissions.require(userId, serverId, Permission.MANAGE_CHANNELS, undefined, 'Akış oluşturma yetkin yok.');
    if (dto.type === 'VOICE' && ((dto.slowModeSeconds ?? 0) > 0 || dto.isLocked)) throw new BadRequestException('Yavaş mod ve kanal kilidi yalnızca yazı akışlarında kullanılabilir.');
    const position = await this.prisma.channel.count({ where: { serverId } });
    return this.prisma.channel.create({ data: { serverId, name: dto.name.trim(), type: dto.type, position, groupName: dto.groupName?.trim() || null, slowModeSeconds: dto.type === 'TEXT' ? (dto.slowModeSeconds ?? 0) : 0, isLocked: dto.type === 'TEXT' ? !!dto.isLocked : false } });
  }

  async update(userId:string, serverId:string, channelId:string, dto:UpdateChannelDto){
    await this.permissions.require(userId, serverId, Permission.MANAGE_CHANNELS, undefined, 'Akış düzenleme yetkin yok.');
    const channel=await this.prisma.channel.findFirst({where:{id:channelId,serverId}});
    if(!channel) throw new NotFoundException('Akış bulunamadı.');

    if(dto.slowModeSeconds !== undefined && channel.type !== 'TEXT' && dto.slowModeSeconds > 0) throw new BadRequestException('Yavaş mod yalnızca yazı akışlarında kullanılabilir.');
    if(dto.isLocked !== undefined && channel.type !== 'TEXT' && dto.isLocked) throw new BadRequestException('Kanal kilidi yalnızca yazı akışlarında kullanılabilir.');

    if(dto.position !== undefined){
      const ordered=await this.prisma.channel.findMany({where:{serverId},orderBy:[{position:'asc'},{createdAt:'asc'}],select:{id:true}});
      const without=ordered.filter(item=>item.id!==channelId);
      const nextIndex=Math.min(Math.max(0,dto.position),without.length);
      without.splice(nextIndex,0,{id:channelId});
      await this.prisma.$transaction(without.map((item,index)=>this.prisma.channel.update({where:{id:item.id},data:{position:index}})));
    }

    return this.prisma.channel.update({
      where:{id:channelId},
      data:{
        name:dto.name===undefined?undefined:dto.name.trim(),
        groupName:dto.groupName===undefined?undefined:(dto.groupName.trim()||null),
        slowModeSeconds:dto.slowModeSeconds===undefined?undefined:dto.slowModeSeconds,
        isLocked:dto.isLocked===undefined?undefined:dto.isLocked,
      },
    });
  }

  async remove(userId: string, serverId: string, channelId: string) {
    await this.permissions.require(userId, serverId, Permission.MANAGE_CHANNELS, undefined, 'Akış silme yetkin yok.');
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, serverId } });
    if (!channel) throw new NotFoundException('Akış bulunamadı.');
    const count = await this.prisma.channel.count({ where: { serverId } });
    if (count <= 1) throw new ForbiddenException('Alandaki son akış silinemez.');
    if (channel.type === 'VOICE') await this.voice.closeChannel(channelId);
    await this.prisma.channel.delete({ where: { id: channelId } });
    return { ok: true };
  }
}
