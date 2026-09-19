import { describe, expect, it } from "vitest";
import { DEFAULT_CURRENCY, CURRENCIES } from "../src/currency";
import { getCurrency, isSupportedCurrency, requireCurrency } from "../src/currency";
import {
  convertMinorUnitsWithRate,
  currencyMinorUnitDigits,
  formatMoney,
  fromMinorUnits,
  minorToNumber,
  parseMoneyToMinorUnits,
  parseRateFraction,
  sumMinorUnits,
  toMinorUnits,
} from "../src/money";

describe("toMinorUnits", () => {
  it("converts decimal amounts to integer minor units", () => {
    expect(toMinorUnits(12.34, "KES")).toBe(1234);
    expect(toMinorUnits(0.01, "KES")).toBe(1);
    expect(toMinorUnits(100, "KES")).toBe(10000);
  });

  it("rounds floating point noise deterministically", () => {
    expect(toMinorUnits(0.1 + 0.2, "KES")).toBe(30);
    expect(toMinorUnits(1.005, "KES")).toBe(101);
  });

  it("honors currency minor-unit digits", () => {
    expect(toMinorUnits(1234.5, "UGX")).toBe(1235);
    expect(toMinorUnits(1234.4, "UGX")).toBe(1234);
  });

  it("rejects non-finite input", () => {
    expect(() => toMinorUnits(Number.NaN, "KES")).toThrow(RangeError);
    expect(() => toMinorUnits(Infinity, "KES")).toThrow(RangeError);
  });
});

describe("fromMinorUnits", () => {
  it("converts minor units back to decimals", () => {
    expect(fromMinorUnits(1234, "KES")).toBe(12.34);
    expect(fromMinorUnits(1500, "KES")).toBe(15);
  });

  it("rejects non-integer input", () => {
    expect(() => fromMinorUnits(1.5, "KES")).toThrow(RangeError);
  });
});

describe("round trip", () => {
  it("preserves value across conversion", () => {
    for (const amount of [0.01, 1, 12.34, 999.99, 1234567.89]) {
      expect(fromMinorUnits(toMinorUnits(amount, "KES"), "KES")).toBeCloseTo(amount, 10);
    }
  });
});

describe("sumMinorUnits", () => {
  it("sums integers exactly", () => {
    expect(sumMinorUnits(100, 200, 300)).toBe(600);
    expect(sumMinorUnits(1, 2, -3)).toBe(0);
  });

  it("rejects non-integer operands", () => {
    expect(() => sumMinorUnits(1.1, 2)).toThrow(RangeError);
  });

  it("rejects unsafe overflow", () => {
    const n = Number.MAX_SAFE_INTEGER;
    expect(() => sumMinorUnits(n, 1)).toThrow(RangeError);
  });
});

describe("formatMoney", () => {
  it("formats with KES symbol and grouping", () => {
    expect(formatMoney(123450, "KES")).toMatch(/1,234\.50/);
    expect(formatMoney(123450, "KES")).toMatch(/KSh/);
  });

  it("handles negative and zero values", () => {
    expect(formatMoney(0, "KES")).toContain("0");
    expect(formatMoney(-1234, "KES")).toContain("12.34");
  });

  it("supports the ISO code display", () => {
    expect(formatMoney(100, "KES", { showCode: true })).toContain("KES");
  });
});

describe("currency registry", () => {
  it("defaults to KES", () => {
    expect(DEFAULT_CURRENCY).toBe("KES");
    expect(CURRENCIES.KES?.code).toBe("KES");
  });

  it("is case-insensitive", () => {
    expect(getCurrency("kes")?.code).toBe("KES");
    expect(getCurrency("UsD")?.code).toBe("USD");
  });

  it("supports the new-currency escape hatch", () => {
    expect(isSupportedCurrency("KES")).toBe(true);
    expect(isSupportedCurrency("ZAR")).toBe(false);
    expect(requireCurrency("ZAR").code).toBe("KES");
  });
});

describe("parseMoneyToMinorUnits", () => {
  it("parses decimal strings exactly with no float drift", () => {
    expect(parseMoneyToMinorUnits("0.07", "KES")).toBe(7);
    expect(parseMoneyToMinorUnits("100.50", "KES")).toBe(10050);
    expect(parseMoneyToMinorUnits("12.34", "KES")).toBe(1234);
    expect(parseMoneyToMinorUnits(".5", "KES")).toBe(50);
    expect(parseMoneyToMinorUnits("100", "KES")).toBe(10000);
    expect(parseMoneyToMinorUnits("0", "KES")).toBe(0);
  });

  it("rounds half and sub-minor-unit tails against the currency digits", () => {
    expect(parseMoneyToMinorUnits("1.005", "KES")).toBe(101);
    expect(parseMoneyToMinorUnits("1.0049", "KES")).toBe(100);
    expect(parseMoneyToMinorUnits("1234.5", "UGX")).toBe(1235);
    expect(parseMoneyToMinorUnits("1234.4", "UGX")).toBe(1234);
  });

  it("handles rounding that carries into the integer part", () => {
    expect(parseMoneyToMinorUnits("0.9999", "KES")).toBe(100);
    expect(parseMoneyToMinorUnits("999.999", "KES")).toBe(100000);
  });

  it("handles trailing-nines carry plus carry chain", () => {
    expect(parseMoneyToMinorUnits("0.09999999999999999999", "KES")).toBe(10);
  });

  it("accepts JS numbers by canonical stringification", () => {
    expect(parseMoneyToMinorUnits(0.1 + 0.2, "KES")).toBe(30);
    expect(parseMoneyToMinorUnits(12.34, "KES")).toBe(1234);
  });

  it("supports scientific notation", () => {
    expect(parseMoneyToMinorUnits("1e3", "KES")).toBe(100000);
    expect(parseMoneyToMinorUnits("1e-2", "KES")).toBe(1);
    expect(parseMoneyToMinorUnits("4.555e2", "KES")).toBe(45550);
  });

  it("supports signed amounts", () => {
    expect(parseMoneyToMinorUnits("-100.50", "KES")).toBe(-10050);
    expect(parseMoneyToMinorUnits("+5", "KES")).toBe(500);
  });

  it("rejects malformed or empty input", () => {
    expect(() => parseMoneyToMinorUnits("", "KES")).toThrow(RangeError);
    expect(() => parseMoneyToMinorUnits("abc", "KES")).toThrow(RangeError);
    expect(() => parseMoneyToMinorUnits("1.2.3", "KES")).toThrow(RangeError);
    expect(() => parseMoneyToMinorUnits(Number.NaN, "KES")).toThrow(RangeError);
    expect(() => parseMoneyToMinorUnits(Infinity, "KES")).toThrow(RangeError);
  });

  it("rejects amounts beyond the safe integer range", () => {
    expect(() => parseMoneyToMinorUnits("99999999999999999999999", "KES")).toThrow(RangeError);
  });
});

describe("parseRateFraction", () => {
  it("parses integer and decimal rates exactly", () => {
    expect(parseRateFraction("129.45")).toEqual({ numerator: 12945n, denominator: 100n });
    expect(parseRateFraction("130")).toEqual({ numerator: 130n, denominator: 1n });
    expect(parseRateFraction("0.5")).toEqual({ numerator: 5n, denominator: 10n });
  });

  it("rejects malformed, empty and non-positive rates", () => {
    expect(() => parseRateFraction("")).toThrow(RangeError);
    expect(() => parseRateFraction("abc")).toThrow(RangeError);
    expect(() => parseRateFraction("1,000")).toThrow(RangeError);
    expect(() => parseRateFraction("-5")).toThrow(RangeError);
    expect(() => parseRateFraction("0")).toThrow(RangeError);
    expect(() => parseRateFraction("0.000")).toThrow(RangeError);
  });

  it("rejects more than 8 fractional digits", () => {
    expect(() => parseRateFraction("1.123456789")).toThrow(RangeError);
  });
});

describe("convertMinorUnitsWithRate", () => {
  it("converts same-digited currencies with half-up rounding", () => {
    // 100.00 USD -> KES at 129.45 => 12,945.00 KES
    expect(convertMinorUnitsWithRate(10000, { numerator: 12945n, denominator: 100n }, 2, 2)).toBe(1_294_500);
    expect(convertMinorUnitsWithRate(1, { numerator: 12945n, denominator: 100n }, 2, 2)).toBe(129);
    expect(convertMinorUnitsWithRate(100, { numerator: 12945n, denominator: 100n }, 2, 2)).toBe(12_945);
  });

  it("rounds half-up at the minor-unit boundary", () => {
    // 0.005 USD * 129.45 = 0.647 -> 65 cents (round half... 0.647 rounds down)
    expect(convertMinorUnitsWithRate(1, { numerator: 12945n, denominator: 100n }, 2, 2)).toBe(129);
    // 2 * 0.5 = 1 exactly
    expect(convertMinorUnitsWithRate(2, { numerator: 1n, denominator: 2n }, 2, 2)).toBe(1);
  });

  it("honors differing minor-unit digit counts", () => {
    // 100 UGX (0 digits) -> KES (2 digits) at 1 UGX = 0.0038 KES => 0.38 KES = 38 cents
    expect(convertMinorUnitsWithRate(100, { numerator: 38n, denominator: 10000n }, 0, 2)).toBe(38);
  });

  it("handles large safe amounts without float noise", () => {
    // 1,000,000.00 KES -> USD at 1/129.45 (~0.0077245) => ~7,724.99 USD = 772,499 cents
    const result = convertMinorUnitsWithRate(100_000_000, { numerator: 100n, denominator: 12945n }, 2, 2);
    expect(result).toBe(772_499);
    expect(Math.abs(result - (1_000_000 / 129.45) * 100)).toBeLessThan(1);
  });

  it("preserves sign and rejects overflow", () => {
    expect(convertMinorUnitsWithRate(-10000, { numerator: 12945n, denominator: 100n }, 2, 2)).toBe(-1_294_500);
    expect(() =>
      convertMinorUnitsWithRate(Number.MAX_SAFE_INTEGER, { numerator: 2n, denominator: 1n }, 2, 2),
    ).toThrow(RangeError);
  });
});

describe("minorToNumber", () => {
  it("passes numbers through and converts BigInt", () => {
    expect(minorToNumber(5)).toBe(5);
    expect(minorToNumber(0n)).toBe(0);
    expect(minorToNumber(-1234n)).toBe(-1234);
    expect(minorToNumber(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("currencyMinorUnitDigits", () => {
  it("returns the correct digit count per currency", () => {
    expect(currencyMinorUnitDigits("KES")).toBe(2);
    expect(currencyMinorUnitDigits("USD")).toBe(2);
    expect(currencyMinorUnitDigits("UGX")).toBe(0);
    expect(currencyMinorUnitDigits("ZAR")).toBe(2);
  });
});