ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'BAN_MEMBERS';

ALTER TABLE "DirectMessageConversation" ALTER COLUMN "pairKey" DROP NOT NULL;
ALTER TABLE "DirectMessageConversation" ADD COLUMN "title" TEXT;

ALTER TABLE "DirectMessage"
  ADD COLUMN "replyToId" TEXT,
  ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "editedAt" TIMESTAMP(3);

CREATE TABLE "UserBlock" (
  "id" TEXT NOT NULL,
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ServerBan" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServerBan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServerBan_serverId_userId_key" ON "ServerBan"("serverId", "userId");
CREATE INDEX "ServerBan_userId_idx" ON "ServerBan"("userId");
ALTER TABLE "ServerBan" ADD CONSTRAINT "ServerBan_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerBan" ADD CONSTRAINT "ServerBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DirectMessageAttachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectMessageAttachment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DirectMessageAttachment_objectKey_key" ON "DirectMessageAttachment"("objectKey");
CREATE INDEX "DirectMessageAttachment_messageId_idx" ON "DirectMessageAttachment"("messageId");
ALTER TABLE "DirectMessageAttachment" ADD CONSTRAINT "DirectMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DirectMessageReaction" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectMessageReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DirectMessageReaction_messageId_userId_emoji_key" ON "DirectMessageReaction"("messageId", "userId", "emoji");
CREATE INDEX "DirectMessageReaction_messageId_idx" ON "DirectMessageReaction"("messageId");
CREATE INDEX "DirectMessageReaction_userId_idx" ON "DirectMessageReaction"("userId");
ALTER TABLE "DirectMessageReaction" ADD CONSTRAINT "DirectMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessageReaction" ADD CONSTRAINT "DirectMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "DirectMessage_replyToId_idx" ON "DirectMessage"("replyToId");
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "DirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
