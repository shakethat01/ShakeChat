import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ServersModule } from './servers/servers.module';
import { ChannelsModule } from './channels/channels.module';
import { MessagesModule } from './messages/messages.module';
import { InvitesModule } from './invites/invites.module';
import { FriendsModule } from './friends/friends.module';
import { DirectMessagesModule } from './direct-messages/direct-messages.module';
import { PermissionsModule } from './permissions/permissions.module';
import { VoiceModule } from './voice/voice.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
    AuthModule,
    ServersModule,
    ChannelsModule,
    MessagesModule,
    InvitesModule,
    FriendsModule,
    DirectMessagesModule,
    PermissionsModule,
    VoiceModule,
  ],
})
export class AppModule {}
