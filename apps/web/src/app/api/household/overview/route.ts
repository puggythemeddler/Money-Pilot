import { NextRequest } from "next/server";
import { fail, newRequestId, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getHouseholdOverview } from "@/lib/finance/households";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const overview = await getHouseholdOverview(context.user.id);
    return ok({ overview });
  } catch (err) {
    return fail(err, requestId);
  }
}
