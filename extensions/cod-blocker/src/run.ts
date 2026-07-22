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

export function run(input: CartPaymentMethodsTransformRunInput): CartPaymentMethodsTransformRunResult {
  const configuration: Configuration = JSON.parse(
    input?.paymentCustomization?.metafield?.value ?? "{}"
  );

  const blockedPincodes = configuration.blockedPincodes || [];
  if (blockedPincodes.length === 0) {
    return NO_CHANGES;
  }

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

  const isBlocked = zipCodes.some(zip => blockedPincodes.includes(zip));

  if (!isBlocked) {
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
