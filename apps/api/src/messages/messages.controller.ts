import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import { BulkDeleteMessagesDto, EditMessageDto, ReactionDto, SendMessageDto } from './dto';
import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';

@UseGuards(AuthGuard)
@Controller('channels/:channelId/messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService, private readonly gateway: MessagesGateway) {}

  @Get() list(@Req() req:any,@Param('channelId') channelId:string){return this.messages.list(req.user.sub,channelId)}

  @Post('read') markRead(@Req() req:any,@Param('channelId') channelId:string){return this.messages.markRead(req.user.sub,channelId)}

  @Post() async send(@Req() req:any,@Param('channelId') channelId:string,@Body() dto:SendMessageDto){
    const message=await this.messages.send(req.user.sub,channelId,dto.content,dto.replyToId);await this.gateway.emitMessage(channelId,message);return message;
  }

  @Post('upload') @UseInterceptors(FilesInterceptor('files',10,{limits:{fileSize:25*1024*1024}}))
  async upload(@Req() req:any,@Param('channelId') channelId:string,@UploadedFiles() files:Express.Multer.File[],@Body() body:any){
    const message=await this.messages.sendWithFiles(req.user.sub,channelId,String(body.content||''),files||[],body.replyToId||undefined);await this.gateway.emitMessage(channelId,message);return message;
  }

  @Post('bulk-delete') async bulkDelete(@Req() req:any,@Param('channelId') channelId:string,@Body() dto:BulkDeleteMessagesDto){
    const result=await this.messages.bulkRemove(req.user.sub,channelId,dto.count);
    for(const messageId of result.ids)this.gateway.emitMessageDeleted(channelId,messageId);
    return result;
  }

  @Patch(':messageId') async edit(@Req() req:any,@Param('channelId') channelId:string,@Param('messageId') messageId:string,@Body() dto:EditMessageDto){
    const message=await this.messages.edit(req.user.sub,channelId,messageId,dto.content);this.gateway.emitMessageUpdated(channelId,message);return message;
  }

  @Post(':messageId/pin') async pin(@Req() req:any,@Param('channelId') channelId:string,@Param('messageId') messageId:string){
    const message=await this.messages.togglePin(req.user.sub,channelId,messageId);this.gateway.emitMessageUpdated(channelId,message);return message;
  }

  @Post(':messageId/reactions') async react(@Req() req:any,@Param('channelId') channelId:string,@Param('messageId') messageId:string,@Body() dto:ReactionDto){
    const message=await this.messages.react(req.user.sub,channelId,messageId,dto.emoji);this.gateway.emitMessageUpdated(channelId,message);return message;
  }

  @Delete(':messageId/reactions/:emoji') async unreact(@Req() req:any,@Param('channelId') channelId:string,@Param('messageId') messageId:string,@Param('emoji') emoji:string){
    const message=await this.messages.react(req.user.sub,channelId,messageId,decodeURIComponent(emoji),true);this.gateway.emitMessageUpdated(channelId,message);return message;
  }

  @Delete(':messageId') async remove(@Req() req:any,@Param('channelId') channelId:string,@Param('messageId') messageId:string){
    const result=await this.messages.remove(req.user.sub,channelId,messageId);this.gateway.emitMessageDeleted(channelId,messageId);return result;
  }
}
