import { Hono } from "hono";
import {
  accountCreateSchema,
  accountUpdateSchema,
  billCreateSchema,
  billPaySchema,
  billUpdateSchema,
  budgetCreateSchema,
  budgetQuerySchema,
  budgetUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  debtCreateSchema,
  debtQuerySchema,
  debtUpdateSchema,
  minorToNumber,
  transactionCreateSchema,
  transactionQuerySchema,
  transactionUpdateSchema,
  transferCreateSchema,
  transferUpdateSchema,
} from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createAccount, listAccounts, updateAccount } from "@/lib/finance/accounts";
import { accountBalances } from "@/lib/finance/balances";
import { resolveAccountForUser } from "@/lib/finance/households";
import { createTransaction, deleteTransaction, listTransactions, updateTransaction } from "@/lib/finance/transactions";
import { createTransfer, deleteTransfer, listTransfers, updateTransfer } from "@/lib/finance/transfers";
import { createCategory, listCategories, updateCategory } from "@/lib/finance/categories";
import { createBudget, listBudgets, updateBudget } from "@/lib/finance/budgets";
import { createDebt, listDebts, updateDebt } from "@/lib/finance/debts";
import { createBill, listBills, payBill, updateBill } from "@/lib/finance/bills";
import { dashboardSummary } from "@/lib/finance/dashboard";

/**
 * Finance routes mounted at /api: accounts, transactions, transfers,
 * categories, budgets, debts, bills and the dashboard summary. Ported
 * verbatim from the Next.js route handlers.
 */

function serializeBudget(budget: {
  id: string;
  name: string;
  amountMinor: bigint;
  currency: string;
  period: string;
  categoryId: string | null;
  notes: string | null;
  archivedAt: Date | null;
}) {
  return {
    id: budget.id,
    name: budget.name,
    amountMinor: minorToNumber(budget.amountMinor),
    currency: budget.currency,
    period: budget.period,
    categoryId: budget.categoryId,
    notes: budget.notes,
    archived: budget.archivedAt !== null,
  };
}

function serializeDebt(debt: {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  principalMinor: bigint;
  currency: string;
  interestRate: string | null;
  minimumPaymentMinor: bigint | null;
  dueDay: number | null;
  categoryId: string | null;
  notes: string | null;
  archivedAt: Date | null;
}) {
  return {
    id: debt.id,
    name: debt.name,
    type: debt.type,
    institution: debt.institution,
    principalMinor: minorToNumber(debt.principalMinor),
    currency: debt.currency,
    interestRate: debt.interestRate,
    minimumPaymentMinor: debt.minimumPaymentMinor !== null ? minorToNumber(debt.minimumPaymentMinor) : null,
    dueDay: debt.dueDay,
    categoryId: debt.categoryId,
    notes: debt.notes,
    archived: debt.archivedAt !== null,
  };
}

function serializeBill(bill: {
  id: string;
  name: string;
  amountMinor: bigint;
  currency: string;
  dueDay: number;
  categoryId: string | null;
  notes: string | null;
  archivedAt: Date | null;
}) {
  return {
    id: bill.id,
    name: bill.name,
    amountMinor: minorToNumber(bill.amountMinor),
    currency: bill.currency,
    dueDay: bill.dueDay,
    categoryId: bill.categoryId,
    notes: bill.notes,
    archived: bill.archivedAt !== null,
  };
}

const finance = new Hono();

// --- accounts -------------------------------------------------------------

finance.get("/accounts", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const url = new URL(req.url);
    const includeArchived = url.searchParams.get("archived") === "1" || url.searchParams.get("archived") === "true";
    const accounts = await listAccounts(context.user.id, includeArchived);
    return ok({ accounts });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.post("/accounts", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(accountCreateSchema, raw);
    const account = await createAccount(context.user.id, input, { ip, userAgent: ua });
    return ok(
      {
        account: {
          id: account.id,
          name: account.name,
          type: account.type,
          currency: account.currency,
          openingBalanceMinor: minorToNumber(account.openingBalanceMinor),
          archived: false,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.get("/accounts/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const id = c.req.param("id");
    const account = await resolveAccountForUser(context.user.id, id);
    const balance = await accountBalances([id]);
    const opening = minorToNumber(account.openingBalanceMinor);
    return ok({
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        openingBalanceMinor: opening,
        balanceMinor: opening + (balance[id]?.balanceMinor ?? 0),
        archived: account.archivedAt !== null,
        shared: account.householdId !== null,
        createdAt: account.createdAt.toISOString(),
      },
    });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.patch("/accounts/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    const raw = await parseJson(req);
    const input = validate(accountUpdateSchema, raw);
    const account = await updateAccount(context.user.id, id, input, { ip, userAgent: ua });
    return ok({
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        openingBalanceMinor: minorToNumber(account.openingBalanceMinor),
        archived: account.archivedAt !== null,
      },
    });
  } catch (err) {
    return fail(err, requestId);
  }
});

// --- transactions ---------------------------------------------------------

finance.get("/transactions", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const url = new URL(req.url);
    const query = validate(transactionQuerySchema, {
      kind: url.searchParams.get("kind") ?? undefined,
      accountId: url.searchParams.get("account") ?? undefined,
      categoryId: url.searchParams.get("category") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    const result = await listTransactions(context.user.id, query);
    return ok(result);
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.post("/transactions", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(transactionCreateSchema, raw);
    const transaction = await createTransaction(context.user.id, input, { ip, userAgent: ua });
    return ok(
      {
        transaction: {
          id: transaction.id,
          kind: transaction.kind,
          amountMinor: minorToNumber(transaction.amountMinor),
          currency: transaction.currency,
          transactionDate: transaction.transactionDate.toISOString(),
          accountId: transaction.accountId,
          categoryId: transaction.categoryId,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.patch("/transactions/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    const raw = await parseJson(req);
    const input = validate(transactionUpdateSchema, raw);
    const transaction = await updateTransaction(context.user.id, id, input, { ip, userAgent: ua });
    return ok({
      transaction: {
        id: transaction.id,
        amountMinor: minorToNumber(transaction.amountMinor),
        transactionDate: transaction.transactionDate.toISOString(),
        categoryId: transaction.categoryId,
      },
    });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.delete("/transactions/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    await deleteTransaction(context.user.id, id, { ip, userAgent: ua });
    return ok({ deleted: id });
  } catch (err) {
    return fail(err, requestId);
  }
});

// --- transfers ------------------------------------------------------------

finance.get("/transfers", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const transfers = await listTransfers(context.user.id);
    return ok({ transfers });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.post("/transfers", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(transferCreateSchema, raw);
    const transfer = await createTransfer(context.user.id, input, { ip, userAgent: ua });
    return ok({ transfer }, { status: 201 });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.patch("/transfers/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    const body = await req.json().catch(() => null);
    const input = validate(transferUpdateSchema, body);
    const updated = await updateTransfer(context.user.id, id, input, { ip, userAgent: ua });
    return ok({ transfer: updated });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.delete("/transfers/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    await deleteTransfer(context.user.id, id, { ip, userAgent: ua });
    return ok({ deleted: id });
  } catch (err) {
    return fail(err, requestId);
  }
});

// --- categories -----------------------------------------------------------

finance.get("/categories", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") ?? undefined;
    const includeArchived =
      url.searchParams.get("archived") === "1" || url.searchParams.get("archived") === "true";
    const categories = await listCategories(context.user.id, { kind, includeArchived });
    return ok({ categories });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.post("/categories", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(categoryCreateSchema, raw);
    const category = await createCategory(context.user.id, input, { ip, userAgent: ua });
    return ok(
      {
        category: {
          id: category.id,
          name: category.name,
          kind: category.kind,
          color: category.color,
          archived: false,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.patch("/categories/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    const raw = await parseJson(req);
    const input = validate(categoryUpdateSchema, raw);
    const category = await updateCategory(context.user.id, id, input, { ip, userAgent: ua });
    return ok({
      category: {
        id: category.id,
        name: category.name,
        kind: category.kind,
        color: category.color,
        archived: category.archivedAt !== null,
      },
    });
  } catch (err) {
    return fail(err, requestId);
  }
});

// --- budgets --------------------------------------------------------------

finance.get("/budgets", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const url = new URL(req.url);
    const query = validate(budgetQuerySchema, {
      period: url.searchParams.get("period") ?? undefined,
    });
    const budgets = await listBudgets(context.user.id, query.period);
    return ok({ budgets });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.post("/budgets", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(budgetCreateSchema, raw);
    const budget = await createBudget(context.user.id, input, { ip, userAgent: ua });
    return ok({ budget: serializeBudget(budget) }, { status: 201 });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.patch("/budgets/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    const raw = await parseJson(req);
    const input = validate(budgetUpdateSchema, raw);
    const budget = await updateBudget(context.user.id, id, input, { ip, userAgent: ua });
    return ok({ budget: serializeBudget(budget) });
  } catch (err) {
    return fail(err, requestId);
  }
});

// --- debts ----------------------------------------------------------------

finance.get("/debts", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const url = new URL(req.url);
    const query = validate(debtQuerySchema, {
      includeArchived: url.searchParams.get("includeArchived") ?? undefined,
    });
    const debts = await listDebts(context.user.id, query.includeArchived ?? false);
    return ok({ debts });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.post("/debts", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(debtCreateSchema, raw);
    const debt = await createDebt(context.user.id, input, { ip, userAgent: ua });
    return ok({ debt: serializeDebt(debt) }, { status: 201 });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.patch("/debts/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    const raw = await parseJson(req);
    const input = validate(debtUpdateSchema, raw);
    const debt = await updateDebt(context.user.id, id, input, { ip, userAgent: ua });
    return ok({ debt: serializeDebt(debt) });
  } catch (err) {
    return fail(err, requestId);
  }
});

// --- bills ----------------------------------------------------------------

finance.get("/bills", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const url = new URL(req.url);
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const bills = await listBills(context.user.id, includeArchived);
    return ok({ bills });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.post("/bills", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(billCreateSchema, raw);
    const bill = await createBill(context.user.id, input, { ip, userAgent: ua });
    return ok({ bill: serializeBill(bill) }, { status: 201 });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.patch("/bills/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    const raw = await parseJson(req);
    const input = validate(billUpdateSchema, raw);
    const bill = await updateBill(context.user.id, id, input, { ip, userAgent: ua });
    return ok({ bill: serializeBill(bill) });
  } catch (err) {
    return fail(err, requestId);
  }
});

finance.post("/bills/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    const raw = await parseJson(req);
    const input = validate(billPaySchema, raw);
    const result = await payBill(context.user.id, id, input, { ip, userAgent: ua });
    return ok(result, { status: 201 });
  } catch (err) {
    return fail(err, requestId);
  }
});

// --- dashboard ------------------------------------------------------------

finance.get("/dashboard", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const summary = await dashboardSummary(context.user.id);
    return ok(summary);
  } catch (err) {
    return fail(err, requestId);
  }
});

export const financeRoutes = finance;
