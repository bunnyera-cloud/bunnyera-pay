-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWING', 'SUPPLEMENTARY', 'APPROVED', 'CHANNEL_PROVISION', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'PAYING', 'PAID', 'CLOSED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'SUCCESS', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('ALIPAY_BAR', 'ALIPAY_PC', 'ALIPAY_WAP', 'WECHAT_NATIVE', 'WECHAT_H5', 'WECHAT_JSAPI', 'WECHAT_MINI', 'UNIONPAY_GATEWAY', 'UNIONPAY_WAP', 'UNIONPAY_QR', 'LAKALA_AGGREGATE', 'DIGITAL_RMB', 'VISA', 'MASTERCARD', 'ANTOM', 'PAYPAL');

-- CreateEnum
CREATE TYPE "PaymentScene" AS ENUM ('QR_CODE', 'CASHIER', 'ONLINE', 'H5', 'MINI_PROGRAM', 'APP');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'MISMATCH_AMOUNT', 'MISSING_IN_CHANNEL', 'MISSING_IN_SYSTEM', 'DUPLICATE', 'REFUND_MISMATCH');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'SETTLING', 'SETTLED', 'ARRIVED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLATFORM_SUPER_ADMIN', 'PLATFORM_REVIEWER', 'MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'STORE_MANAGER', 'CASHIER', 'CUSTOMER_SERVICE', 'AUDITOR');

-- CreateEnum
CREATE TYPE "QRCodeType" AS ENUM ('FIXED', 'DYNAMIC');

-- CreateTable
CREATE TABLE "platform_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PLATFORM_SUPER_ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "device" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "merchantNo" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CN',
    "companyName" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "legalPerson" TEXT NOT NULL,
    "legalPersonIdNo" TEXT,
    "email" TEXT NOT NULL,
    "phoneCode" TEXT NOT NULL DEFAULT '+86',
    "phone" TEXT NOT NULL,
    "registeredAddress" TEXT NOT NULL,
    "businessAddress" TEXT,
    "businessCategory" TEXT NOT NULL,
    "website" TEXT,
    "licenseImageUrl" TEXT,
    "storeFrontUrl" TEXT,
    "storeInteriorUrl" TEXT,
    "legalPersonIdFront" TEXT,
    "legalPersonIdBack" TEXT,
    "settlementBank" TEXT,
    "settlementAccount" TEXT,
    "settlementAccountTail" TEXT,
    "uboName" TEXT,
    "uboIdNo" TEXT,
    "uboRelation" TEXT,
    "controllerName" TEXT,
    "controllerIdNo" TEXT,
    "status" "MerchantStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "agreementAccepted" BOOLEAN NOT NULL DEFAULT false,
    "agreementVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_members" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "avatarUrl" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_sessions" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "device" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_configs" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "appId" TEXT,
    "privateKey" TEXT,
    "publicKey" TEXT,
    "gateway" TEXT,
    "mchId" TEXT,
    "apiKey" TEXT,
    "certPath" TEXT,
    "keyPath" TEXT,
    "serialNo" TEXT,
    "unionpayMchId" TEXT,
    "unionpayCert" TEXT,
    "notifyUrl" TEXT,
    "extraConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isSandbox" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_channels" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyLimit" DECIMAL(15,2),
    "singleLimit" DECIMAL(15,2),
    "feeRate" DECIMAL(8,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "brandId" TEXT,
    "storeId" TEXT,
    "departmentId" TEXT,
    "counterId" TEXT,
    "operatorId" TEXT,
    "subject" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "refundAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "channel" "PaymentChannel" NOT NULL,
    "scene" "PaymentScene" NOT NULL,
    "channelTradeNo" TEXT,
    "payData" TEXT,
    "paymentEnv" TEXT DEFAULT 'PREVIEW',
    "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
    "qrcodeId" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "callbackRaw" JSONB,
    "callbackCount" INTEGER NOT NULL DEFAULT 0,
    "reconciliationStatus" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "reconciledAt" TIMESTAMP(3),
    "settlementStatus" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "settlementId" TEXT,
    "invoiceRequested" BOOLEAN NOT NULL DEFAULT false,
    "invoiceIssued" BOOLEAN NOT NULL DEFAULT false,
    "clientIp" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "channelTradeNo" TEXT,
    "status" TEXT NOT NULL,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "callback_logs" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "rawData" JSONB NOT NULL,
    "signature" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "callback_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "refundNo" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "channelRefundNo" TEXT,
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "QRCodeType" NOT NULL,
    "name" TEXT,
    "storeId" TEXT,
    "departmentId" TEXT,
    "counterId" TEXT,
    "operatorId" TEXT,
    "amount" DECIMAL(15,2),
    "orderId" TEXT,
    "expiredAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "batchDate" TIMESTAMP(3) NOT NULL,
    "systemAmount" DECIMAL(15,2) NOT NULL,
    "channelAmount" DECIMAL(15,2) NOT NULL,
    "systemCount" INTEGER NOT NULL,
    "channelCount" INTEGER NOT NULL,
    "status" "ReconciliationStatus" NOT NULL,
    "diffAmount" DECIMAL(15,2),
    "diffCount" INTEGER,
    "details" JSONB,
    "processedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "channel" "PaymentChannel",
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "feeAmount" DECIMAL(15,2) NOT NULL,
    "refundAmount" DECIMAL(15,2) NOT NULL,
    "adjustAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(15,2) NOT NULL,
    "settlementAccountTail" TEXT,
    "expectedDate" TIMESTAMP(3),
    "actualDate" TIMESTAMP(3),
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_apps" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "appSecret" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "platformUserId" TEXT,
    "merchantMemberId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "ip" TEXT,
    "device" TEXT,
    "userAgent" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "result" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "category" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_sessions_token_key" ON "platform_sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_merchantNo_key" ON "merchants"("merchantNo");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_email_key" ON "merchants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_members_merchantId_email_key" ON "merchant_members"("merchantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_sessions_token_key" ON "merchant_sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "brands_merchantId_code_key" ON "brands"("merchantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "stores_brandId_code_key" ON "stores"("brandId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_storeId_code_key" ON "departments"("storeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "counters_departmentId_code_key" ON "counters"("departmentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_configs_merchantId_channel_key" ON "payment_configs"("merchantId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_channels_merchantId_channel_key" ON "merchant_channels"("merchantId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNo_key" ON "orders"("orderNo");

-- CreateIndex
CREATE INDEX "orders_merchantId_createdAt_idx" ON "orders"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_merchantId_status_idx" ON "orders"("merchantId", "status");

-- CreateIndex
CREATE INDEX "orders_channelTradeNo_idx" ON "orders"("channelTradeNo");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_refundNo_key" ON "refunds"("refundNo");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_code_key" ON "qr_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliations_merchantId_channel_batchDate_key" ON "reconciliations"("merchantId", "channel", "batchDate");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_batchNo_key" ON "settlements"("batchNo");

-- CreateIndex
CREATE UNIQUE INDEX "api_apps_appId_key" ON "api_apps"("appId");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_platformUserId_idx" ON "audit_logs"("platformUserId");

-- CreateIndex
CREATE INDEX "audit_logs_merchantMemberId_idx" ON "audit_logs"("merchantMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- AddForeignKey
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_members" ADD CONSTRAINT "merchant_members_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_sessions" ADD CONSTRAINT "merchant_sessions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "merchant_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counters" ADD CONSTRAINT "counters_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_configs" ADD CONSTRAINT "payment_configs_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_channels" ADD CONSTRAINT "merchant_channels_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "counters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "merchant_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_qrcodeId_fkey" FOREIGN KEY ("qrcodeId") REFERENCES "qr_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callback_logs" ADD CONSTRAINT "callback_logs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_apps" ADD CONSTRAINT "api_apps_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_merchantMemberId_fkey" FOREIGN KEY ("merchantMemberId") REFERENCES "merchant_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
