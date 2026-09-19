/**
 * Financial domain constants.
 *
 * Roles, account types, transaction kinds and category kinds are modelled as
 * application-level enum constants and validated with zod (see
 * schemas/finance.ts). They are stored as strings in the database so the
 * Prisma schema stays portable between SQLite and PostgreSQL without enum
 * migrations; the zod schemas keep arbitrary values out of the database.
 */

export const ACCOUNT_TYPES = {
  CASH: "CASH",
  BANK: "BANK",
  MPESA: "MPESA",
  SAVINGS: "SAVINGS",
  CREDIT: "CREDIT",
  OTHER: "OTHER",
} as const;

export type AccountType = (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES];

export const TRANSACTION_KINDS = {
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
  TRANSFER: "TRANSFER",
  ADJUSTMENT: "ADJUSTMENT",
} as const;

export type TransactionKind = (typeof TRANSACTION_KINDS)[keyof typeof TRANSACTION_KINDS];

export const CATEGORY_KINDS = {
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
} as const;

export type CategoryKind = (typeof CATEGORY_KINDS)[keyof typeof CATEGORY_KINDS];

export const ACCOUNT_TYPE_LIST = ["CASH", "BANK", "MPESA", "SAVINGS", "CREDIT", "OTHER"] as const;
export const TRANSACTION_KIND_LIST = ["INCOME", "EXPENSE", "TRANSFER", "ADJUSTMENT"] as const;
export const CATEGORY_KIND_LIST = ["INCOME", "EXPENSE"] as const;
export const DEBT_TYPE_LIST = ["LOAN", "CREDIT_CARD", "MORTGAGE", "OTHER"] as const;

export type DebtType = (typeof DEBT_TYPE_LIST)[number];

/**
 * Default expense and income categories created for every new account. Users
 * can archive or rename them; the set keeps first-run entry usable.
 */
export const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; kind: CategoryKind; color: string }> = [
  // Expenses
  { name: "Rent", kind: "EXPENSE", color: "#0f766e" },
  { name: "Food", kind: "EXPENSE", color: "#ea580c" },
  { name: "Transport", kind: "EXPENSE", color: "#2563eb" },
  { name: "Utilities", kind: "EXPENSE", color: "#7c3aed" },
  { name: "Internet", kind: "EXPENSE", color: "#0d9488" },
  { name: "Phone", kind: "EXPENSE", color: "#0891b2" },
  { name: "Shopping", kind: "EXPENSE", color: "#db2777" },
  { name: "Entertainment", kind: "EXPENSE", color: "#f59e0b" },
  { name: "Medical", kind: "EXPENSE", color: "#dc2626" },
  { name: "Education", kind: "EXPENSE", color: "#4f46e5" },
  { name: "Debt repayment", kind: "EXPENSE", color: "#b91c1c" },
  { name: "Other", kind: "EXPENSE", color: "#64748b" },
  // Income
  { name: "Salary", kind: "INCOME", color: "#16a34a" },
  { name: "Freelance", kind: "INCOME", color: "#059669" },
  { name: "Business", kind: "INCOME", color: "#0d9488" },
  { name: "Gift", kind: "INCOME", color: "#e879f9" },
  { name: "Other", kind: "INCOME", color: "#64748b" },
];

export const COLOR_PRESETS = [
  "#0f766e",
  "#ea580c",
  "#2563eb",
  "#7c3aed",
  "#dc2626",
  "#db2777",
  "#0891b2",
  "#16a34a",
  "#f59e0b",
  "#4f46e5",
  "#b91c1c",
  "#64748b",
] as const;