-- Mobile staff app migration (additive — safe to apply ahead of the deploy).
-- Creates the five tables that back the "Vela Staff" mobile app and, like every
-- other public table, ENABLES ROW LEVEL SECURITY with NO public policies so the
-- browser-exposed Supabase anon/authenticated roles cannot read or write them.
-- The app connects as the table owner (service role) via Prisma, which bypasses
-- RLS, so normal server-side access is unaffected.
--
-- These tables hold sensitive material — access-code and device-token HASHES and
-- internal staff↔admin messages/notifications — so RLS here is a security
-- requirement, not a formality. `npm run db:push` creates the tables but does
-- NOT manage RLS; run the ENABLE ROW LEVEL SECURITY statements below (also
-- mirrored in docs/supabase-enable-public-rls.sql) whenever these tables are
-- (re)created.
--
-- Nothing here drops or rewrites existing data.

-- CreateEnum
CREATE TYPE "StaffAccessCodeStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StaffThreadSender" AS ENUM ('STAFF', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "StaffNotificationKind" AS ENUM ('MESSAGE', 'APPOINTMENT', 'REMINDER', 'SYSTEM');

-- CreateTable
CREATE TABLE "StaffAccessCode" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" "StaffAccessCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffDevice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "platform" TEXT,
    "expoPushToken" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffThread" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "subtitle" TEXT,
    "unreadForStaff" INTEGER NOT NULL DEFAULT 0,
    "unreadForAdmin" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffThreadMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "sender" "StaffThreadSender" NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffThreadMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffNotification" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "kind" "StaffNotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkType" TEXT,
    "linkId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccessCode_codeHash_key" ON "StaffAccessCode"("codeHash");

-- CreateIndex
CREATE INDEX "StaffAccessCode_businessId_staffMemberId_idx" ON "StaffAccessCode"("businessId", "staffMemberId");

-- CreateIndex
CREATE INDEX "StaffAccessCode_staffMemberId_status_idx" ON "StaffAccessCode"("staffMemberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffDevice_tokenHash_key" ON "StaffDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffDevice_staffMemberId_revokedAt_idx" ON "StaffDevice"("staffMemberId", "revokedAt");

-- CreateIndex
CREATE INDEX "StaffDevice_businessId_idx" ON "StaffDevice"("businessId");

-- CreateIndex
CREATE INDEX "StaffThread_businessId_lastMessageAt_idx" ON "StaffThread"("businessId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "StaffThread_staffMemberId_lastMessageAt_idx" ON "StaffThread"("staffMemberId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "StaffThreadMessage_threadId_createdAt_idx" ON "StaffThreadMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffNotification_staffMemberId_readAt_createdAt_idx" ON "StaffNotification"("staffMemberId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffAccessCode" ADD CONSTRAINT "StaffAccessCode_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccessCode" ADD CONSTRAINT "StaffAccessCode_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDevice" ADD CONSTRAINT "StaffDevice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDevice" ADD CONSTRAINT "StaffDevice_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffThread" ADD CONSTRAINT "StaffThread_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffThread" ADD CONSTRAINT "StaffThread_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffThreadMessage" ADD CONSTRAINT "StaffThreadMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "StaffThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNotification" ADD CONSTRAINT "StaffNotification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNotification" ADD CONSTRAINT "StaffNotification_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (NO public policies — see header).
ALTER TABLE "StaffAccessCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffThread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffThreadMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffNotification" ENABLE ROW LEVEL SECURITY;
