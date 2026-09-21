import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { MessagesModule } from '../messages/messages.module';
import { DirectMessageAccessService } from './direct-message-access.service';
import { DirectMessagesController } from './direct-messages.controller';
import { DirectMessagesService } from './direct-messages.service';

@Module({
  imports: [MessagesModule],
  controllers: [DirectMessagesController],
  providers: [DirectMessagesService, DirectMessageAccessService, AuthGuard],
  exports: [DirectMessagesService],
})
export class DirectMessagesModule {}
