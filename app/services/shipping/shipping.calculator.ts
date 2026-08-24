import { roundMoney } from "../../utils/money";
import { ShippingCalculationParams, ShippingCalculationResult, ShippingSource, WeightSlab } from "./types";

export const FALLBACK_FORWARD_SHIPPING = 60;
export const FALLBACK_RETURN_SHIPPING = 70;

export class ShippingCalculator {
  /**
   * Authoritative calculation for order shipping economics.
   * Pure deterministic function. No external IO or database calls.
   * Prevents NaN, validates weights and slabs, and assigns explicit source tags.
   */
  static calculate(params: ShippingCalculationParams): ShippingCalculationResult {
    const warnings: string[] = [];

    // 1. If explicit actual shipping cost was already recorded on the order
    if (
      params.actualShippingCost !== undefined &&
      params.actualShippingCost !== null &&
      Number.isFinite(params.actualShippingCost) &&
      params.actualShippingCost > 0
    ) {
      const forwardCost = roundMoney(params.actualShippingCost);
      const defaultReturn = Number.isFinite(Number(params.defaultReturnShipping)) && Number(params.defaultReturnShipping) > 0
        ? Number(params.defaultReturnShipping)
        : FALLBACK_RETURN_SHIPPING;
      const returnCost = roundMoney(defaultReturn);

      return {
        forwardShippingCost: forwardCost,
        returnShippingCost: returnCost,
        source: "MERCHANT_CONFIGURED",
        isWeightBased: false,
        warnings,
      };
    }

    const defaultForward = Number.isFinite(Number(params.defaultForwardShipping)) && Number(params.defaultForwardShipping) > 0
      ? Number(params.defaultForwardShipping)
      : FALLBACK_FORWARD_SHIPPING;

    const defaultReturn = Number.isFinite(Number(params.defaultReturnShipping)) && Number(params.defaultReturnShipping) > 0
      ? Number(params.defaultReturnShipping)
      : FALLBACK_RETURN_SHIPPING;

    if (!Number.isFinite(Number(params.defaultForwardShipping)) || Number(params.defaultForwardShipping) <= 0) {
      warnings.push("USING_FALLBACK_FORWARD_SHIPPING");
    }
    if (!Number.isFinite(Number(params.defaultReturnShipping)) || Number(params.defaultReturnShipping) <= 0) {
      warnings.push("USING_FALLBACK_RETURN_SHIPPING");
    }

    const weightGrams = Number(params.weightGrams);
    const hasValidWeight = Number.isFinite(weightGrams) && weightGrams > 0;
    const slabs = params.shippingSlabs;

    // 2. Weight Slab Calculation
    if (hasValidWeight && Array.isArray(slabs) && slabs.length > 0) {
      const validSlabs: WeightSlab[] = slabs
        .filter((s) => s && Number.isFinite(Number(s.maxWeightGrams)) && Number(s.maxWeightGrams) > 0)
        .map((s) => ({
          maxWeightGrams: Number(s.maxWeightGrams),
          forwardCost: Number.isFinite(Number(s.forwardCost)) ? Number(s.forwardCost) : defaultForward,
          returnCost: Number.isFinite(Number(s.returnCost)) ? Number(s.returnCost) : defaultReturn,
        }))
        .sort((a, b) => a.maxWeightGrams - b.maxWeightGrams);

      if (validSlabs.length > 0) {
        for (const slab of validSlabs) {
          if (weightGrams <= slab.maxWeightGrams) {
            return {
              forwardShippingCost: roundMoney(slab.forwardCost),
              returnShippingCost: roundMoney(slab.returnCost),
              source: "WEIGHT_SLAB",
              isWeightBased: true,
              warnings,
            };
          }
        }

        // Weight exceeds highest configured slab -> use heaviest slab
        const heaviest = validSlabs[validSlabs.length - 1];
        warnings.push("EXCEEDS_MAX_WEIGHT_SLAB");
        return {
          forwardShippingCost: roundMoney(heaviest.forwardCost),
          returnShippingCost: roundMoney(heaviest.returnCost),
          source: "WEIGHT_SLAB",
          isWeightBased: true,
          warnings,
        };
      }
    }

    // 3. Merchant Defaults
    const isUsingDefaults =
      params.defaultForwardShipping !== undefined &&
      params.defaultForwardShipping !== null &&
      params.defaultForwardShipping > 0;

    const source: ShippingSource = isUsingDefaults ? "ESTIMATED" : "FALLBACK";

    return {
      forwardShippingCost: roundMoney(defaultForward),
      returnShippingCost: roundMoney(defaultReturn),
      source,
      isWeightBased: false,
      warnings,
    };
  }
}
