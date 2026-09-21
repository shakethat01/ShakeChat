import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsCoreModule } from '../permissions/permissions-core.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({
  imports: [PermissionsCoreModule],
  controllers: [VoiceController],
  providers: [VoiceService, AuthGuard],
  exports: [VoiceService],
})
export class VoiceModule {}
