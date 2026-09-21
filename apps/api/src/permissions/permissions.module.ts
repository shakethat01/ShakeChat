import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { MessagesModule } from '../messages/messages.module';
import { PermissionsController } from './permissions.controller';
import { PermissionsCoreModule } from './permissions-core.module';

@Module({
  imports:[PermissionsCoreModule,MessagesModule],
  controllers:[PermissionsController],
  providers:[AuthGuard],
})
export class PermissionsModule {}
