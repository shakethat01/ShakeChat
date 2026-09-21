-- ShakeChat v1.8: channel lock
ALTER TABLE "Channel" ADD COLUMN "isLocked" BOOLEAN NOT NULL DEFAULT false;
