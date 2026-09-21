import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { MessagesModule } from '../messages/messages.module';
import { PermissionsCoreModule } from '../permissions/permissions-core.module';
import { InviteRateLimitService } from './invite-rate-limit.service';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
  imports: [MessagesModule, PermissionsCoreModule],
  controllers: [InvitesController],
  providers: [InvitesService, InviteRateLimitService, AuthGuard],
})
export class InvitesModule {}
