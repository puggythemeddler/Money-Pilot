import { NextRequest } from "next/server";
import { transactionCreateSchema, transactionQuerySchema, minorToNumber } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createTransaction, listTransactions } from "@/lib/finance/transactions";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
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
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
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
}