import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { VoiceService } from './voice.service';

@UseGuards(AuthGuard)
@Controller('voice')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Post('channels/:channelId/token')
  token(@Req() req: any, @Param('channelId') channelId: string) {
    return this.voice.createJoinToken(req.user.sub, channelId);
  }
}
