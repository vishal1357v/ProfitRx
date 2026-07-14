import { cartPaymentMethodsTransformRun } from "./cart_payment_methods_transform_run";
import type {
  CartPaymentMethodsTransformRunInput,
  CartPaymentMethodsTransformRunResult,
} from "../generated/api";

// Directly define and export run() to satisfy Shopify CLI static compiler
export function run(input: CartPaymentMethodsTransformRunInput): CartPaymentMethodsTransformRunResult {
  return cartPaymentMethodsTransformRun(input);
}
