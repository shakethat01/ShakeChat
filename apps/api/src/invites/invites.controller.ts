import { Body, Controller, Delete, Get, Ip, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { MessagesGateway } from '../messages/messages.gateway';
import { CreateInviteDto } from './dto';
import { InviteRateLimitService } from './invite-rate-limit.service';
import { InvitesService } from './invites.service';

@Controller()
export class InvitesController {
  constructor(
    private readonly invites: InvitesService,
    private readonly limits: InviteRateLimitService,
    private readonly gateway: MessagesGateway,
  ) {}

  @Get('invites/:code/preview')
  preview(@Param('code') code: string, @Ip() ip: string) {
    this.limits.assert(`preview:${ip}`, 30);
    return this.invites.preview(code);
  }

  @UseGuards(AuthGuard)
  @Post('invites/:code/join')
  async join(@Req() req: any, @Param('code') code: string, @Ip() ip: string) {
    this.limits.assert(`join:${req.user.sub}:${ip}`, 10);
    const result = await this.invites.join(req.user.sub, code);
    this.gateway.emitMemberJoined(result.server.id, { ...result.member, online: this.gateway.isUserOnline(result.member.id) });
    return result;
  }

  @UseGuards(AuthGuard)
  @Post('servers/:serverId/invites')
  create(@Req() req: any, @Param('serverId') serverId: string, @Body() dto: CreateInviteDto) {
    return this.invites.create(req.user.sub, serverId, dto);
  }

  @UseGuards(AuthGuard)
  @Get('servers/:serverId/invites')
  list(@Req() req: any, @Param('serverId') serverId: string) {
    return this.invites.list(req.user.sub, serverId);
  }

  @UseGuards(AuthGuard)
  @Delete('servers/:serverId/invites/:inviteId')
  revoke(@Req() req: any, @Param('serverId') serverId: string, @Param('inviteId') inviteId: string) {
    return this.invites.revoke(req.user.sub, serverId, inviteId);
  }
}
