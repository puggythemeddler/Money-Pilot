import { NextRequest } from "next/server";
import { categoryCreateSchema } from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createCategory, listCategories } from "@/lib/finance/categories";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") ?? undefined;
    const includeArchived =
      url.searchParams.get("archived") === "1" || url.searchParams.get("archived") === "true";
    const categories = await listCategories(context.user.id, { kind, includeArchived });
    return ok({ categories });
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
}