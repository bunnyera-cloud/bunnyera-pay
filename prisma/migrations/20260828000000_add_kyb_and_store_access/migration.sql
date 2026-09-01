-- CreateEnum
CREATE TYPE "KybStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "merchants"
ADD COLUMN "kybStatus" "KybStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN "kybSubmittedAt" TIMESTAMP(3),
ADD COLUMN "kybReviewedAt" TIMESTAMP(3),
ADD COLUMN "kybRejectReason" TEXT;

-- Preserve the meaning of existing reviewed merchants while separating
-- operational status from KYB for all future registrations.
UPDATE "merchants"
SET
  "kybStatus" = CASE
    WHEN "status" IN ('APPROVED', 'CHANNEL_PROVISION', 'ACTIVE') THEN 'APPROVED'::"KybStatus"
    WHEN "status" IN ('SUBMITTED', 'REVIEWING', 'SUPPLEMENTARY') THEN 'PENDING'::"KybStatus"
    WHEN "status" = 'REJECTED' THEN 'REJECTED'::"KybStatus"
    ELSE 'NOT_SUBMITTED'::"KybStatus"
  END,
  "kybSubmittedAt" = CASE
    WHEN "status" IN ('SUBMITTED', 'REVIEWING', 'SUPPLEMENTARY', 'APPROVED', 'CHANNEL_PROVISION', 'ACTIVE', 'REJECTED')
      THEN "createdAt"
    ELSE NULL
  END,
  "kybReviewedAt" = CASE
    WHEN "status" IN ('APPROVED', 'CHANNEL_PROVISION', 'ACTIVE', 'REJECTED')
      THEN COALESCE("approvedAt", "updatedAt")
    ELSE NULL
  END,
  "kybRejectReason" = CASE
    WHEN "status" = 'REJECTED' THEN "rejectReason"
    ELSE NULL
  END;

-- Merchant operational access is independent from KYB. Preserve explicit
-- suspensions/terminations; all other merchants may use non-payment features.
UPDATE "merchants"
SET "status" = 'ACTIVE'
WHERE "status" NOT IN ('SUSPENDED', 'TERMINATED');

-- CreateTable
CREATE TABLE "merchant_member_stores" (
  "memberId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "merchant_member_stores_pkey" PRIMARY KEY ("memberId", "storeId")
);

-- Existing rows must be repaired explicitly instead of being silently
-- deleted or assigned to an arbitrary store.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "qr_codes" WHERE "storeId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot require QRCode.storeId: existing qr_codes rows have NULL storeId';
  END IF;
END $$;

ALTER TABLE "qr_codes" ALTER COLUMN "storeId" SET NOT NULL;

-- CreateIndex
DROP INDEX IF EXISTS "merchant_members_merchantId_email_key";
CREATE UNIQUE INDEX "merchant_members_email_key" ON "merchant_members"("email");
CREATE INDEX "merchant_member_stores_storeId_idx" ON "merchant_member_stores"("storeId");
CREATE INDEX "orders_qrcodeId_status_idx" ON "orders"("qrcodeId", "status");
CREATE INDEX "qr_codes_merchantId_storeId_idx" ON "qr_codes"("merchantId", "storeId");

-- AddForeignKey
ALTER TABLE "merchant_member_stores"
ADD CONSTRAINT "merchant_member_stores_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "merchant_members"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "merchant_member_stores"
ADD CONSTRAINT "merchant_member_stores_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "qr_codes"
ADD CONSTRAINT "qr_codes_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- No WeChat Native merchant credentials are available yet. Keep new
-- payments disabled even if a stale local configuration row exists.
UPDATE "merchant_channels"
SET "isEnabled" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "channel" = 'WECHAT_NATIVE';
