-- Baileys messaging migration (additive — safe to apply ahead of the deploy).
-- Applied to prod 2026-06-24 via `prisma db push` (which runs ALTER TYPE ... ADD
-- VALUE outside a transaction, as Postgres requires). Kept for the record.
--
-- Nothing here drops or rewrites existing data:
--   * new AppointmentReminderStatus enum + AppointmentReminder.status (DEFAULT
--     'SENT', so existing reminder rows stay correct and old code that omits it
--     still inserts fine),
--   * BAILEYS added to WhatsAppProvider (old code never selects it),
--   * WhatsAppSession / WhatsAppSessionKey tables (only the worker writes them).

-- CreateEnum
CREATE TYPE "AppointmentReminderStatus" AS ENUM ('SENT', 'FAILED');

-- AlterEnum
ALTER TYPE "WhatsAppProvider" ADD VALUE 'BAILEYS';

-- AlterTable
ALTER TABLE "AppointmentReminder" ADD COLUMN     "status" "AppointmentReminderStatus" NOT NULL DEFAULT 'SENT';

-- CreateTable
CREATE TABLE "WhatsAppSession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "creds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppSessionKey" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppSessionKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_businessId_key" ON "WhatsAppSession"("businessId");

-- CreateIndex
CREATE INDEX "WhatsAppSessionKey_businessId_category_idx" ON "WhatsAppSessionKey"("businessId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSessionKey_businessId_category_keyId_key" ON "WhatsAppSessionKey"("businessId", "category", "keyId");

-- AddForeignKey
ALTER TABLE "WhatsAppSession" ADD CONSTRAINT "WhatsAppSession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppSessionKey" ADD CONSTRAINT "WhatsAppSessionKey_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security. These tables live in the public schema and hold WhatsApp
-- link credentials, so — like every other app table — RLS is enabled with NO
-- public policies: the browser-exposed anon/authenticated Supabase roles can't
-- read or write them. The app and worker connect as the table owner (service
-- role), which bypasses RLS, so normal access is unaffected.
ALTER TABLE "WhatsAppSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppSessionKey" ENABLE ROW LEVEL SECURITY;
