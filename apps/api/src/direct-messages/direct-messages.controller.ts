import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import { MessagesGateway } from '../messages/messages.gateway';
import { DirectMessagesService } from './direct-messages.service';
import { CreateGroupDmDto, DirectReactionDto, EditDirectMessageDto, SendDirectMessageDto } from './dto';

@UseGuards(AuthGuard)
@Controller('dms')
export class DirectMessagesController {
  constructor(private readonly dms: DirectMessagesService, private readonly gateway: MessagesGateway) {}

  @Get() list(@Req() req: any) { return this.dms.listConversations(req.user.sub); }

  @Get('unreads')
  unreads(@Req() req: any) { return this.dms.unreadSummary(req.user.sub); }

  @Post(':conversationId/read')
  markRead(@Req() req: any, @Param('conversationId') conversationId: string) { return this.dms.markRead(req.user.sub, conversationId); }

  @Post('with/:friendId')
  open(@Req() req: any, @Param('friendId') friendId: string) { return this.dms.open(req.user.sub, friendId); }

  @Post('group')
  async createGroup(@Req() req: any, @Body() dto: CreateGroupDmDto) {
    const conversation = await this.dms.createGroup(req.user.sub, dto.memberIds, dto.title);
    this.gateway.emitDirectConversationChanged(conversation.id, conversation.members.map((member: any) => member.id));
    return conversation;
  }

  @Get(':conversationId/messages')
  listMessages(@Req() req: any, @Param('conversationId') conversationId: string) { return this.dms.listMessages(req.user.sub, conversationId); }

  @Post(':conversationId/messages')
  async send(@Req() req: any, @Param('conversationId') conversationId: string, @Body() dto: SendDirectMessageDto) {
    const message = await this.dms.send(req.user.sub, conversationId, dto.content, dto.replyToId);
    await this.gateway.emitDirectMessage(conversationId, message);
    return message;
  }

  @Post(':conversationId/messages/upload')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(@Req() req: any, @Param('conversationId') conversationId: string, @UploadedFiles() files: Express.Multer.File[], @Body() body: any) {
    const message = await this.dms.sendWithFiles(req.user.sub, conversationId, String(body.content || ''), files || [], body.replyToId || undefined);
    await this.gateway.emitDirectMessage(conversationId, message);
    return message;
  }

  @Patch(':conversationId/messages/:messageId')
  async edit(@Req() req: any, @Param('conversationId') conversationId: string, @Param('messageId') messageId: string, @Body() dto: EditDirectMessageDto) {
    const message = await this.dms.edit(req.user.sub, conversationId, messageId, dto.content);
    this.gateway.emitDirectMessageUpdated(conversationId, message);
    return message;
  }

  @Post(':conversationId/messages/:messageId/pin')
  async pin(@Req() req: any, @Param('conversationId') conversationId: string, @Param('messageId') messageId: string) {
    const message = await this.dms.togglePin(req.user.sub, conversationId, messageId);
    this.gateway.emitDirectMessageUpdated(conversationId, message);
    return message;
  }

  @Post(':conversationId/messages/:messageId/reactions')
  async react(@Req() req: any, @Param('conversationId') conversationId: string, @Param('messageId') messageId: string, @Body() dto: DirectReactionDto) {
    const message = await this.dms.react(req.user.sub, conversationId, messageId, dto.emoji);
    this.gateway.emitDirectMessageUpdated(conversationId, message);
    return message;
  }

  @Delete(':conversationId/messages/:messageId/reactions/:emoji')
  async unreact(@Req() req: any, @Param('conversationId') conversationId: string, @Param('messageId') messageId: string, @Param('emoji') emoji: string) {
    const message = await this.dms.react(req.user.sub, conversationId, messageId, decodeURIComponent(emoji), true);
    this.gateway.emitDirectMessageUpdated(conversationId, message);
    return message;
  }

  @Delete(':conversationId/messages/:messageId')
  async remove(@Req() req: any, @Param('conversationId') conversationId: string, @Param('messageId') messageId: string) {
    const result = await this.dms.remove(req.user.sub, conversationId, messageId);
    this.gateway.emitDirectMessageDeleted(conversationId, messageId);
    return result;
  }
}
