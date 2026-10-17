import { describe, expect, it } from "vitest";
import {
  incomeRecordSchema,
  recurringIncomeCreateSchema,
  recurringIncomeUpdateSchema,
} from "../src/schemas/finance";

describe("recurringIncomeCreateSchema", () => {
  const base = { name: "Monthly salary", amount: "85000", payDay: 28 };

  it("defaults currency to KES and keeps raw fields", () => {
    const result = recurringIncomeCreateSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("KES");
      expect(result.data.amount).toBe("85000");
      expect(result.data.payDay).toBe(28);
    }
  });

  it("accepts an optional payee, notes and category", () => {
    const result = recurringIncomeCreateSchema.safeParse({
      ...base,
      payee: "Acme Ltd",
      notes: "Net pay after tax",
      categoryId: "ckz0000000000000000000001",
      currency: "USD",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.payee).toBe("Acme Ltd");
  });

  it("requires a name, an amount and a pay day", () => {
    expect(recurringIncomeCreateSchema.safeParse({ amount: "100", payDay: 1 }).success).toBe(false);
    expect(recurringIncomeCreateSchema.safeParse({ name: "Salary", payDay: 1 }).success).toBe(false);
    expect(recurringIncomeCreateSchema.safeParse({ name: "Salary", amount: "100" }).success).toBe(false);
  });

  it("coerces payDay and bounds it to a valid day of the month", () => {
    const coerced = recurringIncomeCreateSchema.safeParse({ ...base, payDay: "28" });
    expect(coerced.success).toBe(true);
    if (coerced.success) expect(coerced.data.payDay).toBe(28);

    expect(recurringIncomeCreateSchema.safeParse({ ...base, payDay: 0 }).success).toBe(false);
    expect(recurringIncomeCreateSchema.safeParse({ ...base, payDay: 32 }).success).toBe(false);
    expect(recurringIncomeCreateSchema.safeParse({ ...base, payDay: 1.5 }).success).toBe(false);
  });

  it("rejects zero, negative or non-numeric amounts", () => {
    expect(recurringIncomeCreateSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(recurringIncomeCreateSchema.safeParse({ ...base, amount: "-500" }).success).toBe(false);
    expect(recurringIncomeCreateSchema.safeParse({ ...base, amount: "free" }).success).toBe(false);
  });
});

describe("recurringIncomeUpdateSchema", () => {
  it("supports renaming, reassigning payee and archiving", () => {
    expect(
      recurringIncomeUpdateSchema.safeParse({ name: "Bonus", payee: "Acme", archived: true }).success,
    ).toBe(true);
    expect(recurringIncomeUpdateSchema.safeParse({ archived: "yes" }).success).toBe(false);
  });

  it("coerces and bounds payDay when provided", () => {
    const result = recurringIncomeUpdateSchema.safeParse({ payDay: "5" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.payDay).toBe(5);

    expect(recurringIncomeUpdateSchema.safeParse({ payDay: 32 }).success).toBe(false);
    expect(recurringIncomeUpdateSchema.safeParse({ payDay: 0 }).success).toBe(false);
  });

  it("keeps amounts raw for service-layer currency-aware parsing", () => {
    const result = recurringIncomeUpdateSchema.safeParse({ amount: "90000.50" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amount).toBe("90000.50");
  });
});

describe("incomeRecordSchema", () => {
  it("requires an account and allows an optional date", () => {
    const result = incomeRecordSchema.safeParse({
      accountId: "ckz0000000000000000000001",
      transactionDate: "2026-10-28",
    });
    expect(result.success).toBe(true);

    expect(incomeRecordSchema.safeParse({}).success).toBe(false);
    expect(incomeRecordSchema.safeParse({ transactionDate: "2026-10-28" }).success).toBe(false);
  });

  it("rejects an invalid or malformed date", () => {
    expect(incomeRecordSchema.safeParse({ accountId: "ckz0000000000000000000001" }).success).toBe(true);
    expect(
      incomeRecordSchema.safeParse({ accountId: "ckz0000000000000000000001", transactionDate: "soon" }).success,
    ).toBe(false);
    expect(
      incomeRecordSchema.safeParse({ accountId: "ckz0000000000000000000001", transactionDate: "" }).success,
    ).toBe(false);
  });
});
