/**
 * Precision money utilities for ProfitRx Phase 2.
 * Eliminates floating point arithmetic errors by centralizing rounding.
 */

export function roundMoney(amount: number | string | null | undefined): number {
  if (amount == null) return 0;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return 0;
  // Round to 2 decimal places (paise/cents)
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function addMoney(...amounts: (number | string | null | undefined)[]): number {
  const sum = amounts.reduce<number>((acc, curr) => acc + roundMoney(curr), 0);
  return roundMoney(sum);
}

export function subtractMoney(base: number | string | null | undefined, ...amounts: (number | string | null | undefined)[]): number {
  const diff = amounts.reduce<number>((acc, curr) => acc - roundMoney(curr), roundMoney(base));
  return roundMoney(diff);
}
