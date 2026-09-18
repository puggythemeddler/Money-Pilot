/**
 * Currency registry.
 *
 * MoneyPilot treats the Kenyan Shilling (KES) as a first-class currency.
 * Additional currencies can be added by extending this registry. Monetary
 * values are always stored as integer minor units with a currency code;
 * never as floating point numbers.
 */
export interface CurrencyInfo {
  /** ISO 4217 code, e.g. "KES". */
  code: string;
  /** Human readable name, e.g. "Kenyan Shilling". */
  name: string;
  /** Symbol used for display, e.g. "KSh". */
  symbol: string;
  /** Number of decimal places in the minor unit (2 = cents). */
  minorUnitDigits: number;
  /** Locale used for grouping/formatting when available. */
  locale?: string;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  KES: {
    code: "KES",
    name: "Kenyan Shilling",
    symbol: "KSh",
    minorUnitDigits: 2,
    locale: "en-KE",
  },
  UGX: {
    code: "UGX",
    name: "Ugandan Shilling",
    symbol: "USh",
    minorUnitDigits: 0,
    locale: "en-UG",
  },
  TZS: {
    code: "TZS",
    name: "Tanzanian Shilling",
    symbol: "TSh",
    minorUnitDigits: 0,
    locale: "en-TZ",
  },
  NGN: {
    code: "NGN",
    name: "Nigerian Naira",
    symbol: "\u20A6",
    minorUnitDigits: 2,
    locale: "en-NG",
  },
  USD: {
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    minorUnitDigits: 2,
    locale: "en-US",
  },
  GBP: {
    code: "GBP",
    name: "British Pound",
    symbol: "\u00A3",
    minorUnitDigits: 2,
    locale: "en-GB",
  },
  EUR: {
    code: "EUR",
    name: "Euro",
    symbol: "\u20AC",
    minorUnitDigits: 2,
    locale: "en-IE",
  },
};

export const DEFAULT_CURRENCY = "KES";

const SUPPORTED_CODES = new Set(Object.keys(CURRENCIES));

/** Look up a currency, ignoring case. Returns undefined when unsupported. */
export function getCurrency(code: string): CurrencyInfo | undefined {
  return CURRENCIES[code.toUpperCase()];
}

/** Returns true when the code is a supported currency. */
export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_CODES.has(code.toUpperCase());
}

/** Convenience: always returns a CurrencyInfo, falling back to KES. */
export function requireCurrency(code: string): CurrencyInfo {
  return getCurrency(code) ?? CURRENCIES[DEFAULT_CURRENCY]!;
}