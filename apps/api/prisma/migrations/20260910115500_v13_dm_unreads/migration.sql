ALTER TABLE "DirectMessageMember"
  ADD COLUMN "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "DirectMessageMember_userId_lastReadAt_idx" ON "DirectMessageMember"("userId", "lastReadAt");
