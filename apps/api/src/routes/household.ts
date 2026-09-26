import { Hono } from "hono";
import {
  accountCreateSchema,
  accountUpdateSchema,
  householdCreateSchema,
  householdInviteAcceptSchema,
  householdInviteCreateSchema,
  householdMemberUpdateSchema,
  householdRenameSchema,
  minorToNumber,
} from "@moneypilot/shared";
import { fail, getClientIp, newRequestId, ok, parseJson, validate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  acceptHouseholdInvite,
  createHousehold,
  createHouseholdInvite,
  createJointAccount,
  getHouseholdOverview,
  getHouseholdView,
  leaveHousehold,
  listHouseholdInvites,
  removeHouseholdMember,
  renameHousehold,
  revokeHouseholdInvite,
  updateHouseholdMemberPermission,
  updateJointAccount,
} from "@/lib/finance/households";

/**
 * Household routes mounted at /api: the household itself (view/create/rename/
 * leave), the shared overview, joint accounts, invites and member
 * management. Ported verbatim from the Next.js route handlers.
 */

const household = new Hono();

household.get("/household", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const view = await getHouseholdView(context.user.id);
    return ok({ household: view });
  } catch (err) {
    return fail(err, requestId);
  }
});

household.post("/household", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(householdCreateSchema, raw);
    const created = await createHousehold(context.user.id, input, { ip, userAgent: ua });
    return ok(
      { household: { id: created.id, name: created.name, createdAt: created.createdAt.toISOString() } },
      { status: 201 },
    );
  } catch (err) {
    return fail(err, requestId);
  }
});

household.patch("/household", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(householdRenameSchema, raw);
    const renamed = await renameHousehold(context.user.id, input, { ip, userAgent: ua });
    return ok({ household: { id: renamed.id, name: renamed.name, createdAt: renamed.createdAt.toISOString() } });
  } catch (err) {
    return fail(err, requestId);
  }
});

/** Leaves the household (any member; ownership passes or the household archives). */
household.delete("/household", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const result = await leaveHousehold(context.user.id, { ip, userAgent: ua });
    return ok({ left: true, archivedHousehold: result.archivedHousehold });
  } catch (err) {
    return fail(err, requestId);
  }
});

household.get("/household/overview", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const overview = await getHouseholdOverview(context.user.id);
    return ok({ overview });
  } catch (err) {
    return fail(err, requestId);
  }
});

/** Creates a joint account owned by the household (owner only). */
household.post("/household/accounts", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(accountCreateSchema, raw);
    const account = await createJointAccount(context.user.id, input, { ip, userAgent: ua });
    return ok(
      {
        account: {
          id: account.id,
          name: account.name,
          type: account.type,
          currency: account.currency,
          openingBalanceMinor: minorToNumber(account.openingBalanceMinor),
          archived: false,
          shared: true,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return fail(err, requestId);
  }
});

/** Renames or archives a joint account (owner only). */
household.patch("/household/accounts/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    const raw = await parseJson(req);
    const input = validate(accountUpdateSchema, raw);
    const account = await updateJointAccount(context.user.id, id, input, { ip, userAgent: ua });
    return ok({
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        openingBalanceMinor: minorToNumber(account.openingBalanceMinor),
        archived: account.archivedAt !== null,
        shared: true,
      },
    });
  } catch (err) {
    return fail(err, requestId);
  }
});

household.get("/household/invites", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const invites = await listHouseholdInvites(context.user.id);
    return ok({ invites });
  } catch (err) {
    return fail(err, requestId);
  }
});

/**
 * Creates an invitation link. The plain token is returned exactly once — only
 * its SHA-256 digest is stored, so a leaked database cannot leak live invites.
 */
household.post("/household/invites", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(householdInviteCreateSchema, raw);
    const invite = await createHouseholdInvite(context.user.id, input, { ip, userAgent: ua });
    return ok(
      {
        invite: {
          id: invite.id,
          token: invite.token,
          canRecord: invite.canRecord,
          expiresAt: invite.expiresAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return fail(err, requestId);
  }
});

household.post("/household/invites/accept", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = await parseJson(req);
    const input = validate(householdInviteAcceptSchema, raw);
    const result = await acceptHouseholdInvite(context.user.id, input, { ip, userAgent: ua });
    return ok({ joined: true, householdId: result.householdId, canRecord: result.canRecord });
  } catch (err) {
    return fail(err, requestId);
  }
});

/** Revokes a pending invitation (owner only). */
household.delete("/household/invites/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    await revokeHouseholdInvite(context.user.id, id, { ip, userAgent: ua });
    return ok({ revoked: true });
  } catch (err) {
    return fail(err, requestId);
  }
});

/** Grants or withdraws a member's record permission (owner only). */
household.patch("/household/members/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    const raw = await parseJson(req);
    const input = validate(householdMemberUpdateSchema, raw);
    await updateHouseholdMemberPermission(context.user.id, id, input, { ip, userAgent: ua });
    return ok({ member: { id, canRecord: input.canRecord } });
  } catch (err) {
    return fail(err, requestId);
  }
});

/** Removes a member from the household (owner only). */
household.delete("/household/members/:id", async (c) => {
  const requestId = newRequestId();
  const req = c.req.raw;
  try {
    const context = await requireUser(req);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? undefined;
    const id = c.req.param("id");
    await removeHouseholdMember(context.user.id, id, { ip, userAgent: ua });
    return ok({ removed: true });
  } catch (err) {
    return fail(err, requestId);
  }
});

export const householdRoutes = household;
