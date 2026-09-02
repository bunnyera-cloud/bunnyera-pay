-- AlterTable
ALTER TABLE "orders" ADD COLUMN "source" TEXT;
ALTER TABLE "orders" ADD COLUMN "externalOrderNo" TEXT;
ALTER TABLE "orders" ADD COLUMN "shopNotifyUrl" TEXT;
ALTER TABLE "orders" ADD COLUMN "shopNotifyStatus" TEXT;
ALTER TABLE "orders" ADD COLUMN "apiAppId" TEXT;

CREATE INDEX "orders_merchantId_externalOrderNo_idx"
  ON "orders"("merchantId", "externalOrderNo");

CREATE UNIQUE INDEX "orders_merchantId_externalOrderNo_key"
  ON "orders"("merchantId", "externalOrderNo");

ALTER TABLE "orders"
ADD CONSTRAINT "orders_apiAppId_fkey"
FOREIGN KEY ("apiAppId") REFERENCES "api_apps"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
