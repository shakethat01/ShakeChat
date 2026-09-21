ALTER TABLE "Message" ADD COLUMN "replyToId" TEXT;
ALTER TABLE "Message" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Message" ADD COLUMN "editedAt" TIMESTAMP(3);
CREATE TABLE "Attachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MessageReaction" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Attachment_objectKey_key" ON "Attachment"("objectKey");
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_emoji_key" ON "MessageReaction"("messageId","userId","emoji");
CREATE INDEX "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");
CREATE INDEX "MessageReaction_userId_idx" ON "MessageReaction"("userId");
CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
