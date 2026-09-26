import { NextRequest } from "next/server";
import { householdCreateSchema, householdRenameSchema } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  createHousehold,
  getHouseholdView,
  leaveHousehold,
  renameHousehold,
} from "@/lib/finance/households";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const household = await getHouseholdView(context.user.id);
    return ok({ household });
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
    const input = validate(householdCreateSchema, raw);
    const household = await createHousehold(context.user.id, input, { ip, userAgent: ua });
    return ok(
      { household: { id: household.id, name: household.name, createdAt: household.createdAt.toISOString() } },
      { status: 201 },
    );
  } catch (err) {
    return fail(err, requestId);
  }
}

export async function PATCH(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(householdRenameSchema, raw);
    const household = await renameHousehold(context.user.id, input, { ip, userAgent: ua });
    return ok({ household: { id: household.id, name: household.name, createdAt: household.createdAt.toISOString() } });
  } catch (err) {
    return fail(err, requestId);
  }
}

/** Leaves the household (any member; ownership passes or the household archives). */
export async function DELETE(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const result = await leaveHousehold(context.user.id, { ip, userAgent: ua });
    return ok({ left: true, archivedHousehold: result.archivedHousehold });
  } catch (err) {
    return fail(err, requestId);
  }
}
