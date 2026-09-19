import { z } from "zod";
import { parseMoneyToMinorUnits } from "../money";
import { preferredCurrencySchema } from "./auth";
import {
  ACCOUNT_TYPE_LIST,
  CATEGORY_KIND_LIST,
  COLOR_PRESETS,
  DEBT_TYPE_LIST,
  TRANSACTION_KIND_LIST,
} from "../finance";

const cuid = (label: string) => z.string().cuid({ message: `${label} is invalid.` });

const descriptionSchema = z.string().trim().min(1, "Description is required.").max(140);

const dateSchema = z
  .string()
  .trim()
  .min(1, "Date is required.")
  .max(32)
  .refine((s) => !Number.isNaN(Date.parse(s)), "Enter a valid date.");

/**
 * A decimal amount entered by the user: either a finite positive JS number or
 * a decimal string. The result is deterministic INTEGER minor units; floats
 * are rounded exactly once at the boundary.
 */
export const moneyInputSchema = z
  .union([z.number(), z.string().trim().min(1, "Amount is required.").max(30)])
  .refine(
    (v) => {
      if (typeof v === "number") return Number.isFinite(v);
      // Reject obvious junk but let parseMoneyToMinorUnits do the exact work.
      return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v);
    },
    { message: "Enter a valid amount." },
  )
  .transform((v) => parseMoneyToMinorUnits(v, "KES"))
  .refine((minor) => minor > 0, { message: "Amount must be greater than zero." });

export type MoneyInput = z.infer<typeof moneyInputSchema>;

/**
 * Same as moneyInputSchema but allows a zero value. Used where zero is
 * meaningful (e.g. an account's opening balance).
 */
export const moneyNonNegativeInputSchema = z
  .union([z.number(), z.string().trim().min(1, "Amount is required.").max(30)])
  .refine(
    (v) => {
      if (typeof v === "number") return Number.isFinite(v);
      return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v);
    },
    { message: "Enter a valid amount." },
  )
  .transform((v) => parseMoneyToMinorUnits(v, "KES"))
  .refine((minor) => minor >= 0, { message: "Amount cannot be negative." });

export type MoneyNonNegativeInput = z.infer<typeof moneyNonNegativeInputSchema>;

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60, "Name must be at most 60 characters."),
  type: z.enum(ACCOUNT_TYPE_LIST).default("BANK"),
  currency: preferredCurrencySchema.default("KES"),
  openingBalance: moneyNonNegativeInputSchema.optional(),
});

export type AccountCreateInput = z.infer<typeof accountCreateSchema>;

export const accountUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  archived: z.boolean().optional(),
});

export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;

export const categoryCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(40, "Category name must be at most 40 characters."),
  kind: z.enum(CATEGORY_KIND_LIST),
  color: z.enum(COLOR_PRESETS).catch("#64748b"),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  color: z.enum(COLOR_PRESETS).optional(),
  archived: z.boolean().optional(),
});

export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

/** Base fields shared by expense, income and transfer legs. */
const transactionBase = {
  accountId: cuid("Account"),
  amount: moneyInputSchema,
  currency: preferredCurrencySchema.optional(),
  transactionDate: dateSchema,
  description: descriptionSchema.optional(),
  merchant: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
};

export const expenseCreateSchema = z.object({
  kind: z.literal("EXPENSE"),
  ...transactionBase,
  categoryId: cuid("Category").optional(),
});

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;

export const incomeCreateSchema = z.object({
  kind: z.literal("INCOME"),
  ...transactionBase,
  categoryId: cuid("Category").optional(),
});

export type IncomeCreateInput = z.infer<typeof incomeCreateSchema>;

export const transactionCreateSchema = z.discriminatedUnion("kind", [
  expenseCreateSchema,
  incomeCreateSchema,
]);

export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;

export const transactionUpdateSchema = z.object({
  amount: moneyInputSchema.optional(),
  transactionDate: dateSchema.optional(),
  description: descriptionSchema.optional(),
  merchant: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  categoryId: cuiOptional("Category"),
});

function cuiOptional(label: string) {
  return z
    .union([cuid(label), z.literal("").transform(() => null), z.null()])
    .optional();
}

export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>;

/**
 * A positive decimal exchange rate with at most 8 fractional digits,
 * matched against the exact BigInt parser in the service layer.
 */
export const rateSchema = z
  .string()
  .trim()
  .max(24)
  .refine((s) => /^[0-9]+(?:\.[0-9]{1,8})?$/.test(s) && !/^0+(?:\.0*)?$/.test(s), {
    message: "Enter a valid exchange rate (e.g. 129.45).",
  });

export type RateInput = z.infer<typeof rateSchema>;

export const transferCreateSchema = z.object({
  fromAccountId: cuid("Source account"),
  toAccountId: cuid("Destination account"),
  amount: moneyInputSchema,
  currency: preferredCurrencySchema.optional(),
  transactionDate: dateSchema,
  description: descriptionSchema.optional(),
  notes: z.string().trim().max(500).optional(),
  /**
   * Decimal exchange rate used when the source and destination accounts have
   * different currencies: 1 unit of source = `rate` units of destination
   * (e.g. "129.45" for USD -> KES). Required for cross-currency transfers and
   * ignored for same-currency ones.
   */
  rate: rateSchema.optional(),
});

export type TransferCreateInput = z.infer<typeof transferCreateSchema>;

export const transferUpdateSchema = z.object({
  amount: moneyInputSchema.optional(),
  transactionDate: dateSchema.optional(),
  description: descriptionSchema.optional(),
  notes: z.string().trim().max(500).optional(),
  rate: rateSchema.optional(),
});

export type TransferUpdateInput = z.infer<typeof transferUpdateSchema>;

/** A "YYYY-MM" calendar period key used by budgets. */
export const monthPeriodSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, { message: "Period must look like YYYY-MM." });

export type MonthPeriod = z.infer<typeof monthPeriodSchema>;

/** A yearly-percentage interest rate, optional, up to 2 decimal places. */
const interestRateSchema = z
  .string()
  .trim()
  .max(16)
  .refine((s) => /^[0-9]+(?:\.[0-9]{1,2})?$/.test(s), {
    message: "Enter a valid interest rate (e.g. 13.5).",
  });

export const budgetCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  amount: moneyInputSchema,
  currency: preferredCurrencySchema.default("KES"),
  period: monthPeriodSchema,
  categoryId: cuiOptional("Category"),
  notes: z.string().trim().max(500).optional(),
});

export type BudgetCreateInput = z.infer<typeof budgetCreateSchema>;

export const budgetUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  amount: moneyInputSchema.optional(),
  notes: z.string().trim().max(500).optional(),
  archived: z.boolean().optional(),
});

export type BudgetUpdateInput = z.infer<typeof budgetUpdateSchema>;

/** Query filters for listing budgets (defaults to the current month). */
export const budgetQuerySchema = z.object({
  period: monthPeriodSchema.optional(),
});

export type BudgetQuery = z.infer<typeof budgetQuerySchema>;

export const debtCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  type: z.enum(DEBT_TYPE_LIST).default("LOAN"),
  institution: z.string().trim().max(60).optional(),
  principal: moneyInputSchema,
  currency: preferredCurrencySchema.default("KES"),
  interestRate: interestRateSchema.optional(),
  minimumPayment: moneyNonNegativeInputSchema.optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  categoryId: cuiOptional("Category"),
  notes: z.string().trim().max(500).optional(),
});

export type DebtCreateInput = z.infer<typeof debtCreateSchema>;

export const debtUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  type: z.enum(DEBT_TYPE_LIST).optional(),
  institution: z.string().trim().max(60).optional(),
  principal: moneyInputSchema.optional(),
  interestRate: interestRateSchema.optional(),
  minimumPayment: moneyNonNegativeInputSchema.optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  categoryId: cuiOptional("Category"),
  notes: z.string().trim().max(500).optional(),
  archived: z.boolean().optional(),
});

export type DebtUpdateInput = z.infer<typeof debtUpdateSchema>;

/** Debts can be filtered by whether they are still active (default: active). */
export const debtQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional(),
});

export type DebtQuery = z.infer<typeof debtQuerySchema>;

/** Bills are monthly recurring obligations; dueDay is the day of the month. */
export const billCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  amount: moneyInputSchema,
  currency: preferredCurrencySchema.default("KES"),
  dueDay: z.coerce.number().int().min(1).max(31),
  categoryId: cuiOptional("Category"),
  notes: z.string().trim().max(500).optional(),
});

export type BillCreateInput = z.infer<typeof billCreateSchema>;

export const billUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  amount: moneyInputSchema.optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  categoryId: cuiOptional("Category"),
  notes: z.string().trim().max(500).optional(),
  archived: z.boolean().optional(),
});

export type BillUpdateInput = z.infer<typeof billUpdateSchema>;

/**
 * Paying a bill records a real EXPENSE transaction on an account (optionally
 * on a specific day; today when omitted). The amount is taken from the bill.
 */
export const billPaySchema = z.object({
  accountId: cuid("Account"),
  transactionDate: dateSchema.optional(),
});

export type BillPayInput = z.infer<typeof billPaySchema>;

/** Query filters shared by transaction listing endpoints. */
export const transactionQuerySchema = z.object({
  kind: z.enum(TRANSACTION_KIND_LIST).optional(),
  accountId: z.string().cuid().optional(),
  categoryId: z.string().cuid().optional(),
  from: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid from date.").optional(),
  to: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid to date.").optional(),
  q: z.string().trim().max(140).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type TransactionQuery = z.infer<typeof transactionQuerySchema>;