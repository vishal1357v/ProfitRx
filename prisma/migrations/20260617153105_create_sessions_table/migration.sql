/*
  Warnings:

  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductCOGS` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Order";

-- DropTable
DROP TABLE "ProductCOGS";

-- DropTable
DROP TABLE "Session";

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN,
    "locale" TEXT,
    "collaborator" BOOLEAN,
    "emailVerified" BOOLEAN,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "subtotalPrice" DOUBLE PRECISION NOT NULL,
    "totalTax" DOUBLE PRECISION NOT NULL,
    "shippingPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "financialStatus" TEXT NOT NULL,
    "fulfillmentStatus" TEXT NOT NULL,
    "productId" TEXT,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_cogs" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cogs" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_cogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rto_events" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "reason" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "rto_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "shopifyChargeId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "defaultCOGSPct" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "alertEmail" TEXT,
    "rtoThreshold" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "marginThreshold" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_scores" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER NOT NULL,
    "profitMargin" DOUBLE PRECISION NOT NULL,
    "rtoRate" DOUBLE PRECISION NOT NULL,
    "aov" DOUBLE PRECISION NOT NULL,
    "repeatRate" DOUBLE PRECISION NOT NULL,
    "adCostPercent" DOUBLE PRECISION NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_shop_idx" ON "orders"("shop");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");

-- CreateIndex
CREATE INDEX "product_cogs_shop_idx" ON "product_cogs"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "product_cogs_shop_productId_key" ON "product_cogs"("shop", "productId");

-- CreateIndex
CREATE INDEX "rto_events_shop_idx" ON "rto_events"("shop");

-- CreateIndex
CREATE INDEX "rto_events_orderId_idx" ON "rto_events"("orderId");

-- CreateIndex
CREATE INDEX "alerts_shop_idx" ON "alerts"("shop");

-- CreateIndex
CREATE INDEX "alerts_isRead_idx" ON "alerts"("isRead");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_shop_key" ON "subscriptions"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "store_settings_shop_key" ON "store_settings"("shop");

-- CreateIndex
CREATE INDEX "health_scores_shop_idx" ON "health_scores"("shop");

-- CreateIndex
CREATE INDEX "health_scores_date_idx" ON "health_scores"("date");

-- CreateIndex
CREATE UNIQUE INDEX "health_scores_shop_date_key" ON "health_scores"("shop", "date");
