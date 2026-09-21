import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { MessagesModule } from '../messages/messages.module';
import { PermissionsCoreModule } from '../permissions/permissions-core.module';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  imports: [MessagesModule, PermissionsCoreModule],
  controllers: [ServersController],
  providers: [ServersService, AuthGuard],
})
export class ServersModule {}
