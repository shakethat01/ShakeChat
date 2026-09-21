import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { MessagesModule } from '../messages/messages.module';
import { FriendRateLimitService } from './friend-rate-limit.service';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';

@Module({
  imports: [MessagesModule],
  controllers: [FriendsController],
  providers: [FriendsService, FriendRateLimitService, AuthGuard],
  exports: [FriendsService],
})
export class FriendsModule {}
