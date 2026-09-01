-- AlterEnum
ALTER TYPE "PaymentChannel" ADD VALUE 'WECHAT_EXTERNAL_QR';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "confirmationMode" TEXT;

-- CreateTable
CREATE TABLE "external_payment_targets" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "channel" "PaymentChannel" NOT NULL,
  "displayName" TEXT NOT NULL,
  "qrImageUrl" TEXT,
  "targetUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "external_payment_targets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "external_payment_targets_merchantId_storeId_channel_idx"
  ON "external_payment_targets"("merchantId", "storeId", "channel");

ALTER TABLE "external_payment_targets"
ADD CONSTRAINT "external_payment_targets_merchantId_fkey"
FOREIGN KEY ("merchantId") REFERENCES "merchants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "external_payment_targets"
ADD CONSTRAINT "external_payment_targets_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
