import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { MessagesGateway } from '../messages/messages.gateway';
import { SendFriendRequestDto } from './dto';
import { FriendsService } from './friends.service';

@UseGuards(AuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService, private readonly gateway: MessagesGateway) {}

  @Get()
  async list(@Req() req: any) {
    const friends = await this.friends.list(req.user.sub);
    return friends.map(friend => ({ ...friend, online: this.gateway.isUserOnline(friend.id) }));
  }

  @Get('blocks')
  blocks(@Req() req: any) { return this.friends.blocks(req.user.sub); }

  @Post('blocks/:userId')
  async block(@Req() req: any, @Param('userId') userId: string) {
    const result = await this.friends.block(req.user.sub, userId);
    this.gateway.emitFriendshipChanged(req.user.sub, userId);
    return result;
  }

  @Delete('blocks/:userId')
  async unblock(@Req() req: any, @Param('userId') userId: string) {
    const result = await this.friends.unblock(req.user.sub, userId);
    this.gateway.emitFriendshipChanged(req.user.sub, userId);
    return result;
  }

  @Get('requests')
  requests(@Req() req: any) { return this.friends.requests(req.user.sub); }

  @Post('requests')
  async send(@Req() req: any, @Body() dto: SendFriendRequestDto) {
    const request = await this.friends.sendRequest(req.user.sub, dto.username);
    this.gateway.emitFriendRequest(request.user.id, { id: request.id, createdAt: request.createdAt, userId: req.user.sub });
    return request;
  }

  @Post('requests/:requestId/accept')
  async accept(@Req() req: any, @Param('requestId') requestId: string) {
    const result = await this.friends.accept(req.user.sub, requestId);
    if (result.friend) this.gateway.emitFriendshipChanged(req.user.sub, result.friend.id);
    return result;
  }

  @Delete('requests/:requestId')
  async rejectOrCancel(@Req() req: any, @Param('requestId') requestId: string) {
    const result = await this.friends.rejectOrCancel(req.user.sub, requestId);
    this.gateway.emitFriendshipChanged(req.user.sub, result.otherUserId);
    return { ok: true };
  }

  @Delete(':friendId')
  async remove(@Req() req: any, @Param('friendId') friendId: string) {
    const result = await this.friends.remove(req.user.sub, friendId);
    this.gateway.emitFriendshipChanged(req.user.sub, friendId);
    return result;
  }
}
