-- Forward-only additive financial detail migration. It will not remove or alter
-- existing merchant records. The RTO constraint safely blocks deployment if
-- historical duplicate records exist and requires reviewed remediation.

CREATE TABLE "order_line_items" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shopifyLineItemId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "variantTitle" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "originalUnitPrice" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refundedQuantity" INTEGER NOT NULL DEFAULT 0,
    "refundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cogsPerUnitAtOrder" DOUBLE PRECISION,
    "totalCOGSAtOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "order_line_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_line_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "order_refunds" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shopifyRefundId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "totalRefundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shippingRefundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxRefundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "order_refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "refund_line_items" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shopifyLineItemId" TEXT,
    "quantity" INTEGER NOT NULL,
    "refundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxRefundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "restocked" BOOLEAN,
    "cogsRecovered" DOUBLE PRECISION,
    "recoveryStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "refund_line_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "refund_line_items_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "order_refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "order_line_items_shop_shopifyLineItemId_key" ON "order_line_items"("shop", "shopifyLineItemId");
CREATE INDEX "order_line_items_shop_orderId_idx" ON "order_line_items"("shop", "orderId");
CREATE INDEX "order_line_items_shop_productId_idx" ON "order_line_items"("shop", "productId");
CREATE INDEX "order_line_items_shop_variantId_idx" ON "order_line_items"("shop", "variantId");
CREATE UNIQUE INDEX "order_refunds_shop_shopifyRefundId_key" ON "order_refunds"("shop", "shopifyRefundId");
CREATE INDEX "order_refunds_shop_orderId_idx" ON "order_refunds"("shop", "orderId");
CREATE UNIQUE INDEX "refund_line_items_refundId_shopifyLineItemId_key" ON "refund_line_items"("refundId", "shopifyLineItemId");
CREATE INDEX "refund_line_items_shop_orderId_idx" ON "refund_line_items"("shop", "orderId");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "rto_events" GROUP BY "shop", "orderId", "eventType" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Cannot add rto_events uniqueness constraint: historical duplicate rows require reviewed remediation.';
  END IF;
END $$;

CREATE UNIQUE INDEX "rto_events_shop_orderId_eventType_key" ON "rto_events"("shop", "orderId", "eventType");
