import type {
  CartPaymentMethodsTransformRunInput,
  CartPaymentMethodsTransformRunResult,
} from "../generated/api";

const NO_CHANGES: CartPaymentMethodsTransformRunResult = {
  operations: [],
};

type Configuration = {
  blockedPincodes?: string[];
  rejectCodOver?: number | null;
  requirePrepaidAbove?: number | null;
};

export function run(input: CartPaymentMethodsTransformRunInput): CartPaymentMethodsTransformRunResult {
  const configuration: Configuration = JSON.parse(
    input?.paymentCustomization?.metafield?.value ?? "{}"
  );

  const blockedPincodes = configuration.blockedPincodes || [];
  const rejectCodOver = typeof configuration.rejectCodOver === "number" ? configuration.rejectCodOver : null;
  const requirePrepaidAbove = typeof configuration.requirePrepaidAbove === "number" ? configuration.requirePrepaidAbove : null;

  let shouldBlockCod = false;

  // 1. Check blocked pincodes
  if (blockedPincodes.length > 0) {
    const deliveryGroups = input.cart?.deliveryGroups || [];
    for (const group of deliveryGroups) {
      const zip = group.deliveryAddress?.zip?.trim();
      if (zip && blockedPincodes.includes(zip)) {
        shouldBlockCod = true;
        break;
      }
    }
  }

  // 2. Check cart value thresholds (rejectCodOver, requirePrepaidAbove)
  const cartAmountStr = (input.cart as any)?.cost?.totalAmount?.amount;
  if (!shouldBlockCod && cartAmountStr !== undefined && cartAmountStr !== null) {
    const cartAmount = parseFloat(cartAmountStr);
    if (!isNaN(cartAmount)) {
      if (rejectCodOver !== null && cartAmount > rejectCodOver) {
        shouldBlockCod = true;
      } else if (requirePrepaidAbove !== null && cartAmount >= requirePrepaidAbove) {
        shouldBlockCod = true;
      }
    }
  }

  if (!shouldBlockCod) {
    return NO_CHANGES;
  }

  const paymentMethods = input.paymentMethods || [];
  const codPaymentMethods = paymentMethods.filter(method => {
    const name = (method.name || "").toLowerCase();
    return name.includes("cash on delivery") || name === "cod" || name.includes("manual");
  });

  if (codPaymentMethods.length === 0) {
    return NO_CHANGES;
  }

  return {
    operations: codPaymentMethods.map(method => ({
      paymentMethodHide: {
        paymentMethodId: method.id,
      },
    })),
  };
}

export function cartPaymentMethodsTransformRun(input: CartPaymentMethodsTransformRunInput): CartPaymentMethodsTransformRunResult {
  return run(input);
}

export default run;
