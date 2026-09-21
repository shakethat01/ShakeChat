import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsCoreModule } from '../permissions/permissions-core.module';
import { VoiceModule } from '../voice/voice.module';
import { MessagesModule } from '../messages/messages.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
@Module({ imports:[PermissionsCoreModule,VoiceModule,MessagesModule], controllers: [ChannelsController], providers: [ChannelsService, AuthGuard] })
export class ChannelsModule {}
