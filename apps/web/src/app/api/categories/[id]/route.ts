import { NextRequest } from "next/server";
import { categoryUpdateSchema } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { updateCategory } from "@/lib/finance/categories";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const { id } = await ctx.params;
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
}