-- ShakeChat v0.5: custom roles, effective permissions and channel role overrides.
CREATE TYPE "Permission" AS ENUM (
  'ADMINISTRATOR','MANAGE_SERVER','MANAGE_CHANNELS','MANAGE_ROLES','KICK_MEMBERS',
  'MANAGE_MESSAGES','MANAGE_INVITES','VIEW_CHANNEL','SEND_MESSAGES','CONNECT_VOICE','SPEAK'
);

CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "permissions" "Permission"[] NOT NULL DEFAULT ARRAY[]::"Permission"[],
    "isManaged" BOOLEAN NOT NULL DEFAULT false,
    "legacyRole" "MemberRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServerMemberRole" (
    "memberId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerMemberRole_pkey" PRIMARY KEY ("memberId", "roleId")
);

CREATE TABLE "ChannelPermission" (
    "channelId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "allow" "Permission"[] NOT NULL DEFAULT ARRAY[]::"Permission"[],
    "deny" "Permission"[] NOT NULL DEFAULT ARRAY[]::"Permission"[],
    CONSTRAINT "ChannelPermission_pkey" PRIMARY KEY ("channelId", "roleId")
);

CREATE UNIQUE INDEX "Role_serverId_name_key" ON "Role"("serverId", "name");
CREATE UNIQUE INDEX "Role_serverId_legacyRole_key" ON "Role"("serverId", "legacyRole");
CREATE INDEX "Role_serverId_position_idx" ON "Role"("serverId", "position");
CREATE INDEX "ServerMemberRole_roleId_idx" ON "ServerMemberRole"("roleId");
CREATE INDEX "ChannelPermission_roleId_idx" ON "ChannelPermission"("roleId");

ALTER TABLE "Role" ADD CONSTRAINT "Role_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerMemberRole" ADD CONSTRAINT "ServerMemberRole_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ServerMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerMemberRole" ADD CONSTRAINT "ServerMemberRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelPermission" ADD CONSTRAINT "ChannelPermission_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelPermission" ADD CONSTRAINT "ChannelPermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
