-- AlterEnum
ALTER TYPE "PaymentChannel" ADD VALUE 'PAYMENTFM_AGGREGATE';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "walletType" TEXT;
