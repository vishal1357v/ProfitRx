import type {
  CartPaymentMethodsTransformRunInput,
  CartPaymentMethodsTransformRunResult,
} from "../generated/api";

const NO_CHANGES: CartPaymentMethodsTransformRunResult = {
  operations: [],
};

type Configuration = {
  blockedPincodes?: string[];
};

export function cartPaymentMethodsTransformRun(input: CartPaymentMethodsTransformRunInput): CartPaymentMethodsTransformRunResult {
  const configuration: Configuration = JSON.parse(
    input?.paymentCustomization?.metafield?.value ?? "{}"
  );

  const blockedPincodes = configuration.blockedPincodes || [];
  if (blockedPincodes.length === 0) {
    return NO_CHANGES;
  }

  // Get shipping zip codes from cart delivery groups
  const zipCodes: string[] = [];
  const deliveryGroups = input.cart?.deliveryGroups || [];
  for (const group of deliveryGroups) {
    const zip = group.deliveryAddress?.zip?.trim();
    if (zip) {
      zipCodes.push(zip);
    }
  }

  if (zipCodes.length === 0) {
    return NO_CHANGES;
  }

  // Check if any zip is blocked
  const isBlocked = zipCodes.some(zip => blockedPincodes.includes(zip));

  if (!isBlocked) {
    return NO_CHANGES;
  }

  // Find COD payment method(s)
  const codPaymentMethods = input.paymentMethods.filter(method => {
    const name = method.name.toLowerCase();
    return name.includes("cash on delivery") || name === "cod" || name.includes("manual");
  });

  if (codPaymentMethods.length === 0) {
    return NO_CHANGES;
  }

  // Return hide operations for COD payment methods
  return {
    operations: codPaymentMethods.map(method => ({
      paymentMethodHide: {
        paymentMethodId: method.id,
      },
    })),
  };
}