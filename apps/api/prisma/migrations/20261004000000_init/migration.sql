-- KROTO initial schema (PHASE 1)
-- Generated from prisma/schema.prisma + hand-written hardening:
--   * immutable audit_logs / webhook_logs (trigger-enforced append-only)
--   * partial index powering the SELECT ... FOR UPDATE SKIP LOCKED allocator

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'ADMIN', 'SUPER_ADMIN');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'DELIVERED', 'CANCELLED', 'REFUND_REQUESTED', 'REFUNDED', 'UNDERPAID', 'EXPIRED');
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'UNDERPAID', 'OVERPAID', 'EXPIRED', 'CONFIRMED', 'REFUND_ISSUED');
CREATE TYPE "CryptoCurrency" AS ENUM ('BTC', 'ETH', 'USDT', 'SOL', 'BNB');
CREATE TYPE "Network" AS ENUM ('BTC', 'ETH', 'TRON', 'SOLANA', 'BNB_CHAIN');
CREATE TYPE "InventoryCodeStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'VOID');
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FIXED_USD');
CREATE TYPE "AuditAction" AS ENUM ('ORDER_CREATED','ORDER_PAID','ORDER_DELIVERED','ORDER_CANCELLED','INVOICE_CREATED','RATE_LOCKED','PAYMENT_RECEIVED','PAYMENT_UNDERPAID','PAYMENT_OVERPAID','INVOICE_EXPIRED','CODE_ALLOCATED','CODE_SOLD','CODE_IMPORTED','REFUND_INITIATED','REFUND_COMPLETED','COUPON_APPLIED','COUPON_CREATED','COUPON_DELETED','PRODUCT_CREATED','PRODUCT_UPDATED','PRODUCT_DELETED','INVENTORY_ADJUSTED','SETTINGS_UPDATED','WALLET_SWEEP','ADMIN_LOGIN','ADMIN_LOGIN_FAILED','WEBHOOK_RECEIVED','USER_CREATED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "fullNameAr" TEXT,
    "fullNameEn" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "totpSecretEnc" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "creditUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "users_role_idx" ON "users"("role");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "categoryId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "priceUsd" DECIMAL(12,2) NOT NULL,
    "compareAtUsd" DECIMAL(12,2),
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "networkHints" "Network"[] DEFAULT ARRAY[]::"Network"[],
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "products_categoryId_isActive_idx" ON "products"("categoryId", "isActive");
CREATE INDEX "products_brand_idx" ON "products"("brand");
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

CREATE TABLE "inventory_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "productId" UUID NOT NULL,
    "status" "InventoryCodeStatus" NOT NULL DEFAULT 'AVAILABLE',
    "codeEncrypted" TEXT NOT NULL,
    "codeLast4" TEXT NOT NULL,
    "batchId" TEXT,
    "orderId" UUID,
    "reservedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inventory_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inventory_codes_productId_status_idx" ON "inventory_codes"("productId", "status");
CREATE INDEX "inventory_codes_batchId_idx" ON "inventory_codes"("batchId");

CREATE TABLE "coupons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "minOrderUsd" DECIMAL(12,2),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

CREATE TABLE "product_coupons" (
    "couponId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    CONSTRAINT "product_coupons_pkey" PRIMARY KEY ("couponId","productId")
);

CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderNo" TEXT NOT NULL,
    "userId" UUID,
    "email" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotalUsd" DECIMAL(12,2) NOT NULL,
    "discountUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalUsd" DECIMAL(12,2) NOT NULL,
    "couponId" UUID,
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "orders_orderNo_key" ON "orders"("orderNo");
CREATE INDEX "orders_email_idx" ON "orders"("email");
CREATE INDEX "orders_status_createdAt_idx" ON "orders"("status", "createdAt");

CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceUsd" DECIMAL(12,2) NOT NULL,
    "productNameAr" TEXT NOT NULL,
    "productSlugSnapshot" TEXT NOT NULL,
    "inventoryCodeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoiceNo" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "currency" "CryptoCurrency" NOT NULL,
    "network" "Network" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'btcpay',
    "providerInvoiceId" TEXT,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "rateUsd" DECIMAL(18,8) NOT NULL,
    "cryptoAmount" DECIMAL(18,8) NOT NULL,
    "paidAmount" DECIMAL(18,8),
    "rateLocked" BOOLEAN NOT NULL DEFAULT false,
    "rateExpiresAt" TIMESTAMP(3) NOT NULL,
    "address" TEXT,
    "paymentUri" TEXT,
    "txHash" TEXT,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "requiredConfirmations" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "underpayDelta" DECIMAL(18,8),
    "overpayDelta" DECIMAL(18,8),
    "refundAddress" TEXT,
    "requoteOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoices_invoiceNo_key" ON "invoices"("invoiceNo");
CREATE UNIQUE INDEX "invoices_providerInvoiceId_key" ON "invoices"("providerInvoiceId");
CREATE INDEX "invoices_orderId_idx" ON "invoices"("orderId");
CREATE INDEX "invoices_status_expiresAt_idx" ON "invoices"("status", "expiresAt");

CREATE TABLE "webhook_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "invoiceId" UUID,
    "headers" JSONB NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processError" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_logs_idempotency_key_key" ON "webhook_logs"("idempotency_key");
CREATE INDEX "webhook_logs_provider_createdAt_idx" ON "webhook_logs"("provider", "createdAt");
CREATE INDEX "webhook_logs_processed_idx" ON "webhook_logs"("processed");

CREATE TABLE "settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'string',
    "group" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actorId" UUID,
    "actorEmail" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_codes" ADD CONSTRAINT "inventory_codes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_coupons" ADD CONSTRAINT "product_coupons_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_coupons" ADD CONSTRAINT "product_coupons_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Hardening ────────────────────────────────────────────────────

-- Append-only protection for the immutable audit trail.
CREATE OR REPLACE FUNCTION forbid_mutation_of_immutable_tables() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only and cannot be modified or deleted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation_of_immutable_tables();

CREATE TRIGGER webhook_logs_immutable_payload
  BEFORE UPDATE OR DELETE ON "webhook_logs"
  FOR EACH ROW WHEN (OLD.rawPayload IS DISTINCT FROM NEW.rawPayload)
  EXECUTE FUNCTION forbid_mutation_of_immutable_tables();

-- Allocator support: fast lookup of AVAILABLE codes per product
-- (the transactional query itself uses SELECT ... FOR UPDATE SKIP LOCKED in code).
CREATE INDEX inventory_codes_available_idx ON "inventory_codes" ("productId", "createdAt") WHERE "status" = 'AVAILABLE';
