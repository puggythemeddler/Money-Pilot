import { NextRequest } from "next/server";
import { billCreateSchema, minorToNumber } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createBill, listBills } from "@/lib/finance/bills";

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

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const url = new URL(req.url);
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const bills = await listBills(context.user.id, includeArchived);
    return ok({ bills });
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
    const input = validate(billCreateSchema, raw);
    const bill = await createBill(context.user.id, input, { ip, userAgent: ua });
    return ok({ bill: serializeBill(bill) }, { status: 201 });
  } catch (err) {
    return fail(err, requestId);
  }
}