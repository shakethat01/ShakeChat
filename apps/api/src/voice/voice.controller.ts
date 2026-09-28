import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { VoiceService } from './voice.service';

@UseGuards(AuthGuard)
@Controller('voice')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Get('servers/:serverId/participants')
  participants(@Req() req: any, @Param('serverId') serverId: string) {
    return this.voice.participantsInServer(req.user.sub, serverId);
  }

  @Post('channels/:channelId/token')
  token(@Req() req: any, @Param('channelId') channelId: string) {
    return this.voice.createJoinToken(req.user.sub, channelId);
  }
}
