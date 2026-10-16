import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "../src/finance";

describe("DEFAULT_CATEGORIES", () => {
  it("ships a Kenya-first starter set", () => {
    const expense = DEFAULT_CATEGORIES.filter((c) => c.kind === "EXPENSE").map((c) => c.name);
    // Everyday Kenyan spending and obligations.
    for (const name of ["Rent", "Food", "Fare", "Airtime & data", "School fees", "Loans", "Utilities"]) {
      expect(expense).toContain(name);
    }
    const income = DEFAULT_CATEGORIES.filter((c) => c.kind === "INCOME").map((c) => c.name);
    for (const name of ["Salary", "Business", "Freelance"]) {
      expect(income).toContain(name);
    }
  });

  it("never repeats a name within the same kind", () => {
    for (const kind of ["EXPENSE", "INCOME"] as const) {
      const names = DEFAULT_CATEGORIES.filter((c) => c.kind === kind).map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("gives every category a valid hex colour", () => {
    for (const category of DEFAULT_CATEGORIES) {
      expect(category.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
