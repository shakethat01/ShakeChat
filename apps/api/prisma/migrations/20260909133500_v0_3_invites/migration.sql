-- ShakeChat v0.3: server invite links.
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invite_code_key" ON "Invite"("code");
CREATE INDEX "Invite_serverId_createdAt_idx" ON "Invite"("serverId", "createdAt");

ALTER TABLE "Invite" ADD CONSTRAINT "Invite_serverId_fkey"
FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invite" ADD CONSTRAINT "Invite_creatorId_fkey"
FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
