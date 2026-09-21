import { Body, Controller, Delete, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ChannelsService } from './channels.service';
import { CreateChannelDto, UpdateChannelDto } from './dto';
import { MessagesGateway } from '../messages/messages.gateway';

@UseGuards(AuthGuard)
@Controller('servers/:serverId/channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService, private readonly gateway: MessagesGateway) {}
  @Post() create(@Req() req: any, @Param('serverId') serverId: string, @Body() dto: CreateChannelDto) {
    return this.channels.create(req.user.sub, serverId, dto);
  }
  @Patch(':channelId') async update(@Req() req:any,@Param('serverId') serverId:string,@Param('channelId') channelId:string,@Body() dto:UpdateChannelDto){
    const channel=await this.channels.update(req.user.sub,serverId,channelId,dto);
    this.gateway.emitChannelUpdated(serverId,channel);
    return channel;
  }
  @Delete(':channelId') remove(@Req() req:any,@Param('serverId') serverId:string,@Param('channelId') channelId:string){
    return this.channels.remove(req.user.sub,serverId,channelId);
  }
}
