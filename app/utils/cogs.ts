/**
 * Centralized logic for resolving effective Cost of Goods Sold (COGS).
 * Ensures a single source of truth for prioritizing manual overrides,
 * Shopify native costs, and legacy DB values across all components.
 */

export function resolveEffectiveCOGS(record: any, fallbackShopifyNative?: number | null): number | null {
  if (!record) {
    return fallbackShopifyNative !== undefined && fallbackShopifyNative !== null ? Number(fallbackShopifyNative) : null;
  }
  
  // Priority: 
  // 1. manualOverride
  // 2. shopifyNative
  // 3. cost (historical synced cost)
  // 4. legacy cogs (if > 0)
  const manualOverride = record.manualOverride;
  const shopifyNative = record.shopifyNative ?? fallbackShopifyNative;
  const cost = record.cost;
  const legacyCogs = record.cogs > 0 ? record.cogs : undefined;
  
  const effectiveCost = manualOverride ?? shopifyNative ?? cost ?? legacyCogs;
  
  if (effectiveCost !== undefined && effectiveCost !== null && !isNaN(Number(effectiveCost))) {
    return Number(effectiveCost);
  }
  
  return null;
}
