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

/**
 * Coerces a value coming out of the ORM (Prisma BigInt columns, or plain
 * numbers in memory) into a JS number. Prisma returns `bigint` for BigInt
 * columns; data sources that already hold numbers pass through unchanged.
 */
export function minorToNumber(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

/** Converts a decimal amount to minor units (e.g. 12.34 -> 1234). */
export function toMinorUnits(amount: number, currencyCode: string = "KES"): number {
  if (!Number.isFinite(amount)) {
    throw new RangeError("Amount must be a finite number.");
  }
  const digits = requireCurrency(currencyCode).minorUnitDigits;
  const factor = 10 ** digits;
  return Math.round((amount + Number.EPSILON) * factor);
}

/**
 * Parses a user-supplied decimal amount (number or string) into integer minor
 * units without going through floating-point arithmetic. The string form is
 * parsed exactly (integer + fraction digits with optional exponent) using
 * BigInt, so inputs like "0.07" never produce 7.0000000001. The only place a
 * float can appear is when a JS `number` is passed in: it is stringified
 * canonically first (`String(n)`) and the decimal literal is then rounded
 * deterministically to the currency's minor unit.
 *
 * @throws RangeError for non-finite, malformed, negative, or overflowing values.
 */
export function parseMoneyToMinorUnits(input: string | number, currencyCode: string | undefined): number {
  const digits = requireCurrency(currencyCode ?? "KES").minorUnitDigits;
  let sign = 1n;
  let body: string;

  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new RangeError("Amount must be a finite number.");
    body = String(input);
  } else {
    body = input.trim();
    if (body.length === 0) throw new RangeError("Amount must not be empty.");
  }

  if (body.startsWith("-")) {
    sign = -1n;
    body = body.slice(1);
  } else if (body.startsWith("+")) {
    body = body.slice(1);
  }

  // Normalize scientific notation: "1e3", "4.555e-2", "0.7e+2" ...
  let exponent = 0;
  const expMatch = /^([0-9]+(?:\.[0-9]+)?|\.[0-9]+)[eE]([+-]?[0-9]+)$/.exec(body);
  if (expMatch) {
    body = expMatch[1]!;
    exponent = Number.parseInt(expMatch[2]!, 10);
    if (!Number.isFinite(exponent) || Math.abs(exponent) > 10_000) {
      throw new RangeError("Amount exponent is out of range.");
    }
  }

  const parts = /^([0-9]*)(?:\.([0-9]+))?$/.exec(body);
  if (!parts) throw new RangeError("Amount format is invalid.");
  const intStr = parts[1] === "" ? "0" : parts[1];
  const fracStr = parts[2] ?? "";

  // value = D * 10^(exponent - fracLen) where D = intStr + fracStr.
  // minor = round(value * 10^digits) = round(D * 10^(exponent - fracLen + digits)).
  const totalExp = exponent - fracStr.length + digits;
  const d = intStr + fracStr;

  let minorDigits: string;
  let roundUp = false;

  if (totalExp >= 0) {
    minorDigits = d + "0".repeat(totalExp);
  } else {
    const cut = -totalExp; // decimal digits to drop
    if (cut >= d.length) {
      // The whole amount is a fractional minor unit: round to 0 or 1.
      const allNine = [...d].every((c) => c === "9");
      roundUp = allNine || Number(d[0] ?? "0") >= 5;
      minorDigits = roundUp ? "1" : "0";
    } else {
      const keep = d.slice(0, d.length - cut);
      const dropped = d.slice(d.length - cut);
      const first = Number(dropped[0] ?? "0");
      const allNine = [...dropped].every((c) => c === "9");
      // Half-up rounding on the exact decimal fraction (matches Math.round
      // semantics for a clean decimal; e.g. 1.005 -> 101 minor).
      roundUp = first >= 5 || allNine;
      minorDigits = keep;
    }
  }

  let result = sign * BigInt(minorDigits || "0");
  if (roundUp) result += sign;
  if (result > BigInt(MAX_SAFE_MINOR_UNITS) || result < -BigInt(MAX_SAFE_MINOR_UNITS)) {
    throw new RangeError("Amount exceeded the safe integer range.");
  }
  return Number(result);
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

/**
 * An exact rational representation of a decimal exchange rate:
 * `value = numerator / denominator`, e.g. "129.45" -> 12945/100.
 */
export interface RateFraction {
  numerator: bigint;
  denominator: bigint;
}

/**
 * Parses a decimal exchange-rate string into an exact fraction so conversions
 * never go through floating-point arithmetic. Rate must be positive and have
 * at most 8 fractional digits.
 *
 * @throws RangeError for malformed, empty, non-positive, or over-precise input.
 */
export function parseRateFraction(rate: string): RateFraction {
  const cleaned = rate.trim();
  const parts = /^([0-9]+)(?:\.([0-9]+))?$/.exec(cleaned);
  if (!parts) {
    throw new RangeError("Exchange-rate format is invalid.");
  }
  const intStr = parts[1]!;
  const fracStr = parts[2] ?? "";
  const numerator = BigInt(intStr + fracStr);
  if (numerator <= 0n) {
    throw new RangeError("Exchange rate must be greater than zero.");
  }
  if (fracStr.length > 8) {
    throw new RangeError("Exchange rate supports at most 8 decimal places.");
  }
  return { numerator, denominator: BigInt(10 ** fracStr.length) };
}

/**
 * Converts a signed minor-unit amount from one currency to another using an
 * exact rate fraction: 1 unit of source = `rate` units of target. The result
 * is rounded half-up to the target currency's minor unit and, like all money
 * values in this codebase, is a safe-integer `number`.
 *
 * @throws RangeError when the result overflows the safe-integer range.
 */
export function convertMinorUnitsWithRate(
  sourceMinor: number | bigint,
  rate: RateFraction,
  sourceDigits: number,
  targetDigits: number,
): number {
  const raw = typeof sourceMinor === "bigint" ? sourceMinor : BigInt(Math.trunc(sourceMinor));
  const sign = raw < 0n ? -1n : 1n;
  const source = sign * raw;
  // targetMinor = round_half_up( sourceMinor * rate * 10^targetDigits / 10^sourceDigits )
  const numerator = rate.numerator * 10n ** BigInt(targetDigits);
  const denominator = rate.denominator * 10n ** BigInt(sourceDigits);
  const quarter = source * numerator * 2n + denominator;
  const result = sign * (quarter / (2n * denominator));
  if (result > BigInt(MAX_SAFE_MINOR_UNITS) || result < -BigInt(MAX_SAFE_MINOR_UNITS)) {
    throw new RangeError("Converted amount exceeded the safe integer range.");
  }
  return Number(result);
}

/** Returns the number of minor-unit digits for a currency (2 for most). */
export function currencyMinorUnitDigits(currencyCode: string): number {
  return requireCurrency(currencyCode).minorUnitDigits;
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