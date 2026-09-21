-- ShakeChat v0.4: friends and one-to-one direct messages.
CREATE TABLE "FriendRequest" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectMessageConversation" (
    "id" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DirectMessageConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectMessageMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectMessageMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FriendRequest_senderId_receiverId_key" ON "FriendRequest"("senderId", "receiverId");
CREATE INDEX "FriendRequest_receiverId_createdAt_idx" ON "FriendRequest"("receiverId", "createdAt");
CREATE UNIQUE INDEX "Friendship_userAId_userBId_key" ON "Friendship"("userAId", "userBId");
CREATE INDEX "Friendship_userAId_idx" ON "Friendship"("userAId");
CREATE INDEX "Friendship_userBId_idx" ON "Friendship"("userBId");
CREATE UNIQUE INDEX "DirectMessageConversation_pairKey_key" ON "DirectMessageConversation"("pairKey");
CREATE UNIQUE INDEX "DirectMessageMember_conversationId_userId_key" ON "DirectMessageMember"("conversationId", "userId");
CREATE INDEX "DirectMessageMember_userId_idx" ON "DirectMessageMember"("userId");
CREATE INDEX "DirectMessage_conversationId_createdAt_idx" ON "DirectMessage"("conversationId", "createdAt");

ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessageMember" ADD CONSTRAINT "DirectMessageMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DirectMessageConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessageMember" ADD CONSTRAINT "DirectMessageMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DirectMessageConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
