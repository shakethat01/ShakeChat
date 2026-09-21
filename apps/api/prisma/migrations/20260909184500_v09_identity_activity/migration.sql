CREATE TYPE "ProfileMode" AS ENUM ('AVAILABLE', 'FOCUS', 'AWAY');

ALTER TABLE "User" ADD COLUMN "statusText" TEXT;
ALTER TABLE "User" ADD COLUMN "profileMode" "ProfileMode" NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE "Channel" ADD COLUMN "groupName" TEXT;

CREATE TABLE "ChannelReadState" (
  "userId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelReadState_pkey" PRIMARY KEY ("userId", "channelId")
);

CREATE INDEX "ChannelReadState_channelId_lastReadAt_idx" ON "ChannelReadState"("channelId", "lastReadAt");
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
