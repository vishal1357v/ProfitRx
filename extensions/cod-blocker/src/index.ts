import { cartPaymentMethodsTransformRun, run as originalRun } from "./run";

export function run(input: any) {
  return originalRun(input);
}

export default run;
export { cartPaymentMethodsTransformRun };
