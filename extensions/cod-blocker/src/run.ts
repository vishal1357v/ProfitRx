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
  currency?: string | null;
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
  const totalAmount = (input.cart as any)?.cost?.totalAmount;
  const cartAmountStr = totalAmount?.amount;
  const cartCurrency = totalAmount?.currencyCode;
  const configCurrency = configuration.currency;

  if (!shouldBlockCod && cartAmountStr !== undefined && cartAmountStr !== null) {
    const cartAmount = parseFloat(cartAmountStr);

    // Explicit Currency Contract:
    // When a configuration specifies a target currency (e.g. "INR"), and the cart checkout currency
    // does not match (e.g. international presentment currency "USD" or "EUR"), prevent comparison
    // between amounts expressed in different currencies. Do NOT silently assume an exchange rate.
    const currencyMatches =
      !configCurrency ||
      !cartCurrency ||
      cartCurrency.toUpperCase() === configCurrency.toUpperCase();

    if (!isNaN(cartAmount) && currencyMatches) {
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
