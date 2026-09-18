import { getCurrency, requireCurrency } from "./currency";

/**
 * A monetary value stored as integer minor units plus an ISO currency code.
 * The invariant of this codebase is that amounts are always integer minor
 * units; converting a user-entered decimal amount to minor units is the only
 * place a float is involved and it is rounded deterministically.
 */
export interface Money {
  amountMinor: number;
  currency: string;
}

/** A safe upper bound for integer minor-unit arithmetic (2^53 - 1). */
export const MAX_SAFE_MINOR_UNITS = Number.MAX_SAFE_INTEGER;

/** Converts a decimal amount to minor units (e.g. 12.34 -> 1234). */
export function toMinorUnits(amount: number, currencyCode: string = "KES"): number {
  if (!Number.isFinite(amount)) {
    throw new RangeError("Amount must be a finite number.");
  }
  const digits = requireCurrency(currencyCode).minorUnitDigits;
  const factor = 10 ** digits;
  return Math.round((amount + Number.EPSILON) * factor);
}

/** Converts minor units to a decimal amount for display (e.g. 1234 -> 12.34). */
export function fromMinorUnits(amountMinor: number, currencyCode: string = "KES"): number {
  if (!Number.isInteger(amountMinor)) {
    throw new RangeError("Minor units must be an integer.");
  }
  const digits = requireCurrency(currencyCode).minorUnitDigits;
  return amountMinor / 10 ** digits;
}

/** Adds a set of minor-unit values without converting to float. */
export function sumMinorUnits(...values: number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isInteger(value)) {
      throw new RangeError("Minor units must be integers.");
    }
    total += value;
    if (Math.abs(total) > MAX_SAFE_MINOR_UNITS) {
      throw new RangeError("Minor-unit total exceeded the safe integer range.");
    }
  }
  return total;
}

export interface FormatMoneyOptions {
  /** Intl locale. Defaults to the currency's locale, then "en". */
  locale?: string;
  /** Show the ISO code (e.g. "KES") in addition to the symbol. */
  showCode?: boolean;
  /** Force no grouping separators. */
  noGrouping?: boolean;
}

/**
 * Formats minor units as a localized currency string, e.g. "KSh 1,234.50".
 * The currency symbol always comes from the registry (Intl output can vary:
 * "Ksh", "KES", etc.), keeping display consistent across clients.
 */
export function formatMoney(amountMinor: number, currencyCode: string, opts: FormatMoneyOptions = {}): string {
  const currency = getCurrency(currencyCode) ?? requireCurrency(currencyCode);
  const locale = opts.locale ?? currency.locale ?? "en";
  const amount = fromMinorUnits(amountMinor, currency.code);
  const value = Number.isNaN(amount) ? 0 : amount;

  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.code,
      currencyDisplay: "code",
      minimumFractionDigits: Math.min(currency.minorUnitDigits, 2),
      maximumFractionDigits: Math.min(currency.minorUnitDigits, 2),
      useGrouping: !opts.noGrouping,
    }).format(value);
  } catch {
    formatted = `${currency.code} ${value.toLocaleString(locale, { useGrouping: !opts.noGrouping })}`;
  }

  const cleaned = formatted.split(currency.code).join(currency.symbol).trim();
  if (opts.showCode) {
    return `${cleaned} (${currency.code})`;
  }
  return cleaned;
}