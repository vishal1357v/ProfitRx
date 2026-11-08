/**
 * ProfitRx — Canonical Currency Contract Utilities
 * 
 * Enforces multi-currency integrity across:
 * - Order ingestion & Shopify money sets (shopMoney vs presentmentMoney)
 * - Financial profit calculations & COGS snapshots
 * - External ad-spend reconciliation
 * - GST and statutory reporting
 * - CSV exports & merchant UI formatting
 */

export interface MoneySet {
  amount: number;
  currencyCode: string;
}

export interface DualCurrencyMoney {
  shopMoney: MoneySet;
  presentmentMoney: MoneySet;
}

export class CurrencyMismatchError extends Error {
  constructor(public fromCurrency: string, public toCurrency: string, context: string) {
    super(`[CurrencyMismatchError] Cannot perform monetary operation between '${fromCurrency}' and '${toCurrency}' in context: ${context}. Explicit exchange rate required.`);
    this.name = "CurrencyMismatchError";
  }
}

/**
 * Returns the primary currency symbol for common ISO 4217 currencies.
 */
export function getCurrencySymbol(currencyCode: string = "INR"): string {
  const code = (currencyCode || "INR").toUpperCase();
  switch (code) {
    case "USD":
      return "$";
    case "INR":
      return "₹";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "CAD":
      return "CA$";
    case "AUD":
      return "A$";
    case "SGD":
      return "S$";
    case "AED":
      return "AED";
    default:
      return `${code} `;
  }
}

/**
 * Formats a monetary amount according to the shop or transaction currency.
 * Automatically selects the appropriate international locale formatting.
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currencyCode: string = "INR",
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
): string {
  if (amount == null) return `${getCurrencySymbol(currencyCode)}0.00`;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return `${getCurrencySymbol(currencyCode)}0.00`;

  const code = (currencyCode || "INR").toUpperCase();
  const maxDigits = options?.maximumFractionDigits ?? 2;
  const minDigits = options?.minimumFractionDigits ?? 2;

  let locale = "en-US";
  if (code === "INR") locale = "en-IN";
  else if (code === "EUR") locale = "de-DE";
  else if (code === "GBP") locale = "en-GB";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
    }).format(num);
  } catch {
    // Fallback if locale or currency code is unsupported in environment
    const symbol = getCurrencySymbol(code);
    return `${symbol}${num.toFixed(maxDigits)}`;
  }
}

/**
 * Validates that two monetary amounts share the exact same currency code before
 * executing arithmetic operations (e.g. subtracting COGS or shipping from Revenue).
 */
export function assertSameCurrency(
  currencyA: string = "INR",
  currencyB: string = "INR",
  context: string = "financial_calculation"
): void {
  const cA = (currencyA || "INR").toUpperCase();
  const cB = (currencyB || "INR").toUpperCase();
  if (cA !== cB) {
    throw new CurrencyMismatchError(cA, cB, context);
  }
}

/**
 * Converts a monetary amount from one currency to another using an explicit,
 * documented exchange rate. Never silently assumes a rate or 1:1 parity.
 */
export function convertMoneyWithExplicitRate(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRate: number
): { convertedAmount: number; rateUsed: number } {
  const from = (fromCurrency || "INR").toUpperCase();
  const to = (toCurrency || "INR").toUpperCase();

  if (from === to) {
    return { convertedAmount: Math.round((amount + Number.EPSILON) * 100) / 100, rateUsed: 1.0 };
  }

  if (!exchangeRate || isNaN(exchangeRate) || exchangeRate <= 0) {
    throw new CurrencyMismatchError(from, to, "convertMoneyWithExplicitRate: Invalid or missing exchange rate");
  }

  const converted = Math.round((amount * exchangeRate + Number.EPSILON) * 100) / 100;
  return { convertedAmount: converted, rateUsed: exchangeRate };
}

/**
 * Reconciles Shopify MoneySets:
 * Shopify provides both `shopMoney` (in the merchant's store accounting currency)
 * and `presentmentMoney` (in the buyer's checkout currency).
 * 
 * ProfitRx canonical rule:
 * - Primary accounting revenue MUST use `shopMoney.amount` and `shopMoney.currencyCode`.
 * - Checkout display / audit preserves `presentmentMoney`.
 */
export function resolveShopifyOrderMoney(
  totalPriceSet?: {
    shopMoney?: { amount: string; currencyCode: string };
    presentmentMoney?: { amount: string; currencyCode: string };
  } | null
): {
  accountingAmount: number;
  accountingCurrency: string;
  presentmentAmount: number;
  presentmentCurrency: string;
  isMultiCurrency: boolean;
} {
  const shopAmount = parseFloat(totalPriceSet?.shopMoney?.amount || "0");
  const shopCurrency = (totalPriceSet?.shopMoney?.currencyCode || "INR").toUpperCase();

  const presAmount = parseFloat(totalPriceSet?.presentmentMoney?.amount || String(shopAmount));
  const presCurrency = (totalPriceSet?.presentmentMoney?.currencyCode || shopCurrency).toUpperCase();

  return {
    accountingAmount: isNaN(shopAmount) ? 0 : shopAmount,
    accountingCurrency: shopCurrency,
    presentmentAmount: isNaN(presAmount) ? shopAmount : presAmount,
    presentmentCurrency: presCurrency,
    isMultiCurrency: shopCurrency !== presCurrency,
  };
}

