import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { MessagesGateway } from '../messages/messages.gateway';
import { MessagesService } from '../messages/messages.service';
import { BanServerMemberDto, CreateServerDto, RestrictServerMemberDto } from './dto';
import { ServersService } from './servers.service';

@UseGuards(AuthGuard)
@Controller('servers')
export class ServersController {
  constructor(
    private readonly servers: ServersService,
    private readonly gateway: MessagesGateway,
    private readonly messages: MessagesService,
  ) {}

  @Get()
  list(@Req() req: any) { return this.servers.list(req.user.sub); }

  @Post()
  create(@Req() req: any, @Body() dto: CreateServerDto) { return this.servers.create(req.user.sub, dto.name); }

  @Get(':serverId/unreads')
  unreads(@Req() req:any,@Param('serverId') serverId:string){ return this.messages.unreads(req.user.sub,serverId); }

  @Get(':serverId/search')
  search(@Req() req:any,@Param('serverId') serverId:string,@Query('q') query=''){ return this.messages.search(req.user.sub,serverId,String(query)); }

  @Get(':serverId/members')
  listMembers(@Req() req: any, @Param('serverId') serverId: string) {
    return this.servers.listMembers(req.user.sub, serverId);
  }

  @Delete(':serverId/members/me')
  async leave(@Req() req: any, @Param('serverId') serverId: string) {
    const result = await this.servers.leave(req.user.sub, serverId);
    await this.gateway.removeUserFromServer(serverId, req.user.sub, 'left');
    return result;
  }

  @Delete(':serverId/members/:userId')
  async kick(@Req() req: any, @Param('serverId') serverId: string, @Param('userId') userId: string) {
    const result = await this.servers.kick(req.user.sub, serverId, userId);
    await this.gateway.removeUserFromServer(serverId, userId, 'kicked');
    return result;
  }
  @Post(':serverId/members/:userId/message-restriction')
  async restrictMessages(@Req() req: any, @Param('serverId') serverId: string, @Param('userId') userId: string, @Body() body: RestrictServerMemberDto) {
    const result = await this.servers.restrictMessages(req.user.sub, serverId, userId, body.durationMinutes, body.reason);
    await this.gateway.refreshServerAccess(serverId, [userId]);
    return result;
  }

  @Delete(':serverId/members/:userId/message-restriction')
  async clearMessageRestriction(@Req() req: any, @Param('serverId') serverId: string, @Param('userId') userId: string) {
    const result = await this.servers.clearMessageRestriction(req.user.sub, serverId, userId);
    await this.gateway.refreshServerAccess(serverId, [userId]);
    return result;
  }

  @Get(':serverId/audit')
  audit(@Req() req: any, @Param('serverId') serverId: string, @Query('action') action?: string) {
    return this.servers.listAudit(req.user.sub, serverId, action);
  }

  @Get(':serverId/bans')
  bans(@Req() req: any, @Param('serverId') serverId: string) {
    return this.servers.listBans(req.user.sub, serverId);
  }

  @Post(':serverId/bans/:userId')
  async ban(@Req() req: any, @Param('serverId') serverId: string, @Param('userId') userId: string, @Body() body: BanServerMemberDto) {
    const result = await this.servers.ban(req.user.sub, serverId, userId, body.reason);
    await this.gateway.removeUserFromServer(serverId, userId, 'banned');
    return result;
  }

  @Delete(':serverId/bans/:userId')
  unban(@Req() req: any, @Param('serverId') serverId: string, @Param('userId') userId: string) {
    return this.servers.unban(req.user.sub, serverId, userId);
  }

}
