/**
 * Pure decision logic for Google OAuth login/link flows. This module has no
 * I/O: the caller loads the referenced rows (identity owner, user by email,
 * session user) and passes them in, which keeps every security-relevant rule
 * unit-testable and the route handler thin.
 *
 * Rules:
 * - A Google profile without a verified email is never trusted.
 * - LOGIN mode: an existing identity wins (its user logs in). Without an
 *   identity, a verified-email match auto-links. Without a user, a new
 *   Google-only account is created.
 * - LINK mode (Settings, signed-in only): the Google account must not be
 *   connected to any user yet.
 * - Deleted/disabled accounts are refused everywhere.
 */

export type GoogleLinkMode = "LOGIN" | "LINK";

/** Claims from the verified ID token that matter for the decision. */
export interface GoogleProfileInput {
  /** Google account subject identifier (`sub`). Never empty. */
  subject: string;
  email: string | null;
  emailVerified: boolean;
}

/** The subset of a user row the decision depends on. */
export interface ExistingUserInput {
  id: string;
  status: "ACTIVE" | "DISABLED";
  deletedAt: Date | null;
  emailVerified: boolean;
}

export interface GoogleDecisionInput {
  mode: GoogleLinkMode;
  profile: GoogleProfileInput;
  /** User who already owns a (google, subject) identity, if any. */
  identityOwner: ExistingUserInput | null;
  /** User whose (normalized) email matches the Google email, if any. */
  userByEmail: ExistingUserInput | null;
  /** Signed-in user id. Required for LINK mode. */
  sessionUserId: string | null;
  /** Invite-only deployments refuse Google sign-ups (invites need a form flow). */
  privateMode?: boolean;
}

export type GoogleRefusalReason =
  | "NO_EMAIL"
  | "EMAIL_NOT_VERIFIED"
  | "ACCOUNT_DELETED"
  | "ACCOUNT_DISABLED"
  | "EMAIL_TAKEN_UNVERIFIED"
  | "ALREADY_LINKED"
  | "NOT_SIGNED_IN"
  | "PRIVATE_MODE";

export type GoogleDecision =
  | { action: "LOGIN"; userId: string; /** Attach the identity now (first Google login for this user). */ autoLink: boolean }
  | { action: "CREATE" }
  | { action: "LINK"; userId: string }
  | { action: "REFUSE"; reason: GoogleRefusalReason };

/** Lowercases and trims an email for storage and case-insensitive matching. */
export function normalizeEmailForMatch(email: string): string {
  return email.trim().toLowerCase();
}

function usable(user: ExistingUserInput): GoogleRefusalReason | null {
  if (user.deletedAt) return "ACCOUNT_DELETED";
  if (user.status === "DISABLED") return "ACCOUNT_DISABLED";
  return null;
}

export function decideGoogleAction(input: GoogleDecisionInput): GoogleDecision {
  const email = input.profile.email?.trim() ?? "";
  if (!email) return { action: "REFUSE", reason: "NO_EMAIL" };
  if (!input.profile.emailVerified) return { action: "REFUSE", reason: "EMAIL_NOT_VERIFIED" };
  if (!input.profile.subject) return { action: "REFUSE", reason: "NO_EMAIL" };

  if (input.mode === "LINK") {
    if (!input.sessionUserId) return { action: "REFUSE", reason: "NOT_SIGNED_IN" };
    if (input.identityOwner) return { action: "REFUSE", reason: "ALREADY_LINKED" };
    return { action: "LINK", userId: input.sessionUserId };
  }

  if (input.identityOwner) {
    const refused = usable(input.identityOwner);
    if (refused) return { action: "REFUSE", reason: refused };
    return { action: "LOGIN", userId: input.identityOwner.id, autoLink: false };
  }

  if (input.userByEmail) {
    const refused = usable(input.userByEmail);
    if (refused) return { action: "REFUSE", reason: refused };
    if (!input.userByEmail.emailVerified) return { action: "REFUSE", reason: "EMAIL_TAKEN_UNVERIFIED" };
    // Verified email match: attach Google to the existing account and log in.
    return { action: "LOGIN", userId: input.userByEmail.id, autoLink: true };
  }

  // No identity, no user with that email: create a Google-only account —
  // unless registration is invite-only (invites are handled by the
  // password registration flow, which consumes the invite token).
  if (input.privateMode) return { action: "REFUSE", reason: "PRIVATE_MODE" };
  return { action: "CREATE" };
}
