import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsCoreModule } from '../permissions/permissions-core.module';
import { VoiceModule } from '../voice/voice.module';
import { MessagesController } from './messages.controller';
import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';
import { StorageService } from './storage.service';

@Module({
  imports: [PermissionsCoreModule, VoiceModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway, StorageService, AuthGuard],
  exports: [MessagesGateway, MessagesService, StorageService],
})
export class MessagesModule {}
