-- ShakeChat v1.5 moderation audit history
CREATE TYPE "AuditAction" AS ENUM ('MEMBER_KICKED', 'MEMBER_BANNED', 'MEMBER_UNBANNED');

CREATE TABLE "ServerAuditLog" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "actorId" TEXT,
    "targetUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServerAuditLog_serverId_createdAt_idx" ON "ServerAuditLog"("serverId", "createdAt");
CREATE INDEX "ServerAuditLog_actorId_idx" ON "ServerAuditLog"("actorId");
CREATE INDEX "ServerAuditLog_targetUserId_idx" ON "ServerAuditLog"("targetUserId");

ALTER TABLE "ServerAuditLog"
ADD CONSTRAINT "ServerAuditLog_serverId_fkey"
FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
