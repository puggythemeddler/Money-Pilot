import { describe, expect, it } from "vitest";
import {
  accountCreateSchema,
  accountUpdateSchema,
  categoryCreateSchema,
  incomeCreateSchema,
  expenseCreateSchema,
  moneyInputSchema,
  transferCreateSchema,
  transactionCreateSchema,
} from "../src/schemas/finance";
import { ACCOUNT_TYPES, CATEGORY_KINDS } from "../src/finance";

describe("moneyInputSchema", () => {
  it("transforms decimal input into positive integer minor units", () => {
    expect(moneyInputSchema.parse("100.50")).toBe(10050);
    expect(moneyInputSchema.parse(12.34)).toBe(1234);
  });

  it("rejects zero, negative, and non-finite amounts", () => {
    expect(moneyInputSchema.safeParse("0").success).toBe(false);
    expect(moneyInputSchema.safeParse("-5").success).toBe(false);
    expect(moneyInputSchema.safeParse(Number.NaN).success).toBe(false);
    expect(moneyInputSchema.safeParse("abc").success).toBe(false);
    expect(moneyInputSchema.safeParse(Infinity).success).toBe(false);
  });
});

describe("accountCreateSchema", () => {
  it("defaults type and currency", () => {
    const result = accountCreateSchema.safeParse({ name: "M-Pesa", openingBalance: "5000" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("BANK");
      expect(result.data.currency).toBe("KES");
      expect(result.data.openingBalance).toBe(500000);
    }
  });

  it("accepts a supported account type and rejects unknown types", () => {
    expect(accountCreateSchema.safeParse({ name: "Cash", type: "CASH" }).success).toBe(true);
    expect(accountCreateSchema.safeParse({ name: "X", type: "CRYPTO" }).success).toBe(false);
  });

  it("validates the account type is one of the domain constants", () => {
    for (const type of Object.values(ACCOUNT_TYPES)) {
      expect(accountCreateSchema.safeParse({ name: "A", type }).success).toBe(true);
    }
  });
});

describe("accountUpdateSchema", () => {
  it("supports renaming and archiving", () => {
    expect(accountUpdateSchema.safeParse({ name: "New", archived: true }).success).toBe(true);
    expect(accountUpdateSchema.safeParse({ archived: "yes" }).success).toBe(false);
  });
});

describe("categoryCreateSchema", () => {
  it("validates kind against category domain constants", () => {
    expect(categoryCreateSchema.safeParse({ name: "Rent", kind: "EXPENSE", color: "#0f766e" }).success).toBe(
      true,
    );
    expect(categoryCreateSchema.safeParse({ name: "Pay", kind: "INCOME" }).success).toBe(true);
    expect(categoryCreateSchema.safeParse({ name: "X", kind: "WHATEVER" }).success).toBe(false);
    for (const kind of Object.values(CATEGORY_KINDS)) {
      expect(categoryCreateSchema.safeParse({ name: "A", kind }).success).toBe(true);
    }
  });
});

describe("transactionCreateSchema", () => {
  const base = {
    accountId: "ckz0000000000000000000001",
    transactionDate: "2026-09-01",
  };

  it("accepts expenses and income and discards the kind from transformed input", () => {
    const expense = expenseCreateSchema.safeParse({ ...base, kind: "EXPENSE", amount: "800" });
    expect(expense.success).toBe(true);

    const income = incomeCreateSchema.safeParse({ ...base, kind: "INCOME", amount: "25000" });
    expect(income.success).toBe(true);
  });

  it("rejects transfers and adjustments at the create endpoint", () => {
    const t = transactionCreateSchema.safeParse({ ...base, kind: "TRANSFER", amount: "10" });
    expect(t.success).toBe(false);
    const a = transactionCreateSchema.safeParse({ ...base, kind: "ADJUSTMENT", amount: "10" });
    expect(a.success).toBe(false);
  });

  it("transforms amounts to minor units", () => {
    const result = transactionCreateSchema.parse({
      ...base,
      kind: "INCOME",
      amount: "100.50",
    });
    if (result.kind === "INCOME") {
      expect(result.amount).toBe(10050);
    } else {
      throw new Error("expected income");
    }
  });
});

describe("transferCreateSchema", () => {
  it("requires distinct real account ids and a positive amount", () => {
    const okTry = transferCreateSchema.safeParse({
      fromAccountId: "ckz0000000000000000000001",
      toAccountId: "ckz0000000000000000000002",
      amount: "5000",
      transactionDate: "2026-09-01",
    });
    expect(okTry.success).toBe(true);
    if (okTry.success) expect(okTry.data.amount).toBe(500000);

    expect(transferCreateSchema.safeParse({ amount: "5000", transactionDate: "2026-09-01" }).success).toBe(
      false,
    );
    expect(
      transferCreateSchema.safeParse({
        fromAccountId: "nope",
        toAccountId: "nope2",
        amount: "-5",
        transactionDate: "2026-09-01",
      }).success,
    ).toBe(false);
  });
});