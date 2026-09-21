-- ShakeChat v1.6: server-wide temporary text restrictions
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'MODERATE_MEMBERS';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'MEMBER_RESTRICTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'MEMBER_RESTRICTION_REMOVED';

ALTER TABLE "ServerMember"
  ADD COLUMN "messageRestrictedUntil" TIMESTAMP(3),
  ADD COLUMN "messageRestrictionReason" TEXT;
