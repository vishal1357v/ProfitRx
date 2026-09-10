import type {
  CartPaymentMethodsTransformRunInput,
  CartPaymentMethodsTransformRunResult,
} from "../generated/api";
import { cartPaymentMethodsTransformRun, run as originalRun } from "./run";

export function run(input: CartPaymentMethodsTransformRunInput): CartPaymentMethodsTransformRunResult {
  return originalRun(input);
}

export default run;
export { cartPaymentMethodsTransformRun };
