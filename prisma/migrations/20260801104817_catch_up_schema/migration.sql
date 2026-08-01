-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "actualShippingCost" DOUBLE PRECISION,
ADD COLUMN     "merchantRecommendation" TEXT,
ADD COLUMN     "riskFlags" JSONB,
ADD COLUMN     "riskLevel" TEXT,
ADD COLUMN     "riskReasons" JSONB,
ADD COLUMN     "riskScore" INTEGER,
ADD COLUMN     "shippingCostSource" TEXT NOT NULL DEFAULT 'ESTIMATED';

-- AlterTable
ALTER TABLE "pincode_stats" ADD COLUMN     "aov" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "successfulDeliveries" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboardingStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rulesAutoFlagRepeatOffenders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rulesAutoRequireOtp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rulesDisableCodForPincodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "rulesRejectCodOver" DOUBLE PRECISION,
ADD COLUMN     "rulesRequirePrepaidAbove" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "variant_cogs" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "shopifyVariantId" TEXT,
    "cost" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'manual_override',
    "manualOverride" DOUBLE PRECISION,
    "shopifyNative" DOUBLE PRECISION,
    "cogs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variant_cogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_risk" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "codOrders" INTEGER NOT NULL DEFAULT 0,
    "prepaidOrders" INTEGER NOT NULL DEFAULT 0,
    "successfulDeliveries" INTEGER NOT NULL DEFAULT 0,
    "rtoCount" INTEGER NOT NULL DEFAULT 0,
    "cancellationCount" INTEGER NOT NULL DEFAULT 0,
    "aov" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lifetimeSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastOrderDate" TIMESTAMP(3),
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_risk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "variant_cogs_shop_productId_idx" ON "variant_cogs"("shop", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "variant_cogs_shop_variantId_key" ON "variant_cogs"("shop", "variantId");

-- CreateIndex
CREATE INDEX "customer_risk_shop_idx" ON "customer_risk"("shop");

-- CreateIndex
CREATE INDEX "customer_risk_shop_phone_idx" ON "customer_risk"("shop", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "customer_risk_shop_customerId_key" ON "customer_risk"("shop", "customerId");

