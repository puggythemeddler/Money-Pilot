import { NextRequest } from "next/server";
import { AppError, ErrorCodes, updateProfileSchema } from "@moneypilot/shared";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { getAuthContext, requireUser, toPublicUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await requireUser({ headers: req.headers });
    return ok({
      user: toPublicUser(context.user),
      sessionId: context.sessionId,
      deviceId: context.deviceId,
    });
  } catch (err) {
    return fail(err, requestId);
  }
}

export async function PATCH(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const context = await getAuthContext({ headers: req.headers });
    if (!context) {
      throw new AppError(ErrorCodes.AUTHENTICATION, "Please sign in to continue.", 401);
    }
    const ip = getClientIp(req);

    const raw = await parseJson(req);
    const input = validate(updateProfileSchema, raw);

    const [user, profile] = await prisma.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id: context.user.id },
        data: {
          name: input.name ?? context.user.name,
          preferredCurrency: input.preferredCurrency ?? context.user.preferredCurrency,
          timezone: input.timezone ?? context.user.timezone,
        },
      });
      const nextProfile = await tx.userProfile.upsert({
        where: { userId: context.user.id },
        create: {
          userId: context.user.id,
          financialMonthStartDay: input.financialMonthStartDay ?? 1,
        },
        update: {
          financialMonthStartDay: input.financialMonthStartDay ?? undefined,
        },
      });
      return [next, nextProfile] as const;
    });

    await writeAudit({
      userId: context.user.id,
      action: "PROFILE_UPDATED",
      entityType: "User",
      entityId: context.user.id,
      metadata: { currency: user.preferredCurrency, ip },
      ip,
    });

    return ok({
      user: toPublicUser({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role === "ADMIN" ? "ADMIN" : "USER",
        emailVerified: user.emailVerifiedAt !== null,
        preferredCurrency: user.preferredCurrency,
        timezone: user.timezone,
      }),
      profile: { financialMonthStartDay: profile.financialMonthStartDay },
    });
  } catch (err) {
    return fail(err, requestId);
  }
}