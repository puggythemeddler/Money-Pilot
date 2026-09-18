import { NextRequest } from "next/server";
import { fail, newRequestId, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { dashboardSummary } from "@/lib/finance/dashboard";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const summary = await dashboardSummary(context.user.id);
    return ok(summary);
  } catch (err) {
    return fail(err, requestId);
  }
}