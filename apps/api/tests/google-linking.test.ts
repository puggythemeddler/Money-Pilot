import { describe, expect, it } from "vitest";
import { decideGoogleAction, normalizeEmailForMatch, type ExistingUserInput } from "../src/lib/google-linking";

const activeVerifiedUser: ExistingUserInput = {
  id: "user-1",
  status: "ACTIVE",
  deletedAt: null,
  emailVerified: true,
};

const activeUnverifiedUser: ExistingUserInput = {
  id: "user-2",
  status: "ACTIVE",
  deletedAt: null,
  emailVerified: false,
};

const disabledUser: ExistingUserInput = {
  id: "user-3",
  status: "DISABLED",
  deletedAt: null,
  emailVerified: true,
};

const deletedUser: ExistingUserInput = {
  id: "user-4",
  status: "ACTIVE",
  deletedAt: new Date("2026-01-01T00:00:00Z"),
  emailVerified: true,
};

const profile = {
  subject: "google-sub-1",
  email: "alice@example.com",
  emailVerified: true,
} as const;

describe("decideGoogleAction", () => {
  it("refuses a Google profile without an email", () => {
    const decision = decideGoogleAction({
      mode: "LOGIN",
      profile: { subject: "google-sub-1", email: null, emailVerified: false },
      identityOwner: null,
      userByEmail: null,
      sessionUserId: null,
    });
    expect(decision).toEqual({ action: "REFUSE", reason: "NO_EMAIL" });
  });

  it("refuses a Google profile with an unverified email", () => {
    const decision = decideGoogleAction({
      mode: "LOGIN",
      profile: { subject: "google-sub-1", email: "alice@example.com", emailVerified: false },
      identityOwner: null,
      userByEmail: null,
      sessionUserId: null,
    });
    expect(decision).toEqual({ action: "REFUSE", reason: "EMAIL_NOT_VERIFIED" });
  });

  it("refuses an empty subject", () => {
    const decision = decideGoogleAction({
      mode: "LOGIN",
      profile: { subject: "", email: "alice@example.com", emailVerified: true },
      identityOwner: null,
      userByEmail: null,
      sessionUserId: null,
    });
    expect(decision).toEqual({ action: "REFUSE", reason: "NO_EMAIL" });
  });

  it("logs in the owner of an existing identity without re-linking", () => {
    const decision = decideGoogleAction({
      mode: "LOGIN",
      profile,
      identityOwner: activeVerifiedUser,
      userByEmail: null,
      sessionUserId: null,
    });
    expect(decision).toEqual({ action: "LOGIN", userId: "user-1", autoLink: false });
  });

  it("refuses login when the identity owner is deleted or disabled", () => {
    for (const owner of [deletedUser, disabledUser]) {
      const decision = decideGoogleAction({
        mode: "LOGIN",
        profile,
        identityOwner: owner,
        userByEmail: null,
        sessionUserId: null,
      });
      expect(decision.action).toBe("REFUSE");
    }
  });

  it("auto-links and logs in a verified-email match", () => {
    const decision = decideGoogleAction({
      mode: "LOGIN",
      profile,
      identityOwner: null,
      userByEmail: activeVerifiedUser,
      sessionUserId: null,
    });
    expect(decision).toEqual({ action: "LOGIN", userId: "user-1", autoLink: true });
  });

  it("refuses auto-link when the matching user never verified their email", () => {
    const decision = decideGoogleAction({
      mode: "LOGIN",
      profile,
      identityOwner: null,
      userByEmail: activeUnverifiedUser,
      sessionUserId: null,
    });
    expect(decision).toEqual({ action: "REFUSE", reason: "EMAIL_TAKEN_UNVERIFIED" });
  });

  it("refuses auto-link when the matching user is deleted or disabled", () => {
    for (const user of [deletedUser, disabledUser]) {
      const decision = decideGoogleAction({
        mode: "LOGIN",
        profile,
        identityOwner: null,
        userByEmail: user,
        sessionUserId: null,
      });
      expect(decision.action).toBe("REFUSE");
    }
  });

  it("creates a Google-only account when nothing matches", () => {
    const decision = decideGoogleAction({
      mode: "LOGIN",
      profile,
      identityOwner: null,
      userByEmail: null,
      sessionUserId: null,
    });
    expect(decision).toEqual({ action: "CREATE" });
  });

  it("refuses Google sign-up in invite-only mode", () => {
    const decision = decideGoogleAction({
      mode: "LOGIN",
      profile,
      identityOwner: null,
      userByEmail: null,
      sessionUserId: null,
      privateMode: true,
    });
    expect(decision).toEqual({ action: "REFUSE", reason: "PRIVATE_MODE" });
  });

  it("still logs in existing identities in invite-only mode", () => {
    const decision = decideGoogleAction({
      mode: "LOGIN",
      profile,
      identityOwner: activeVerifiedUser,
      userByEmail: null,
      sessionUserId: null,
      privateMode: true,
    });
    expect(decision).toEqual({ action: "LOGIN", userId: "user-1", autoLink: false });
  });

  it("still auto-links verified-email matches in invite-only mode", () => {
    const decision = decideGoogleAction({
      mode: "LOGIN",
      profile,
      identityOwner: null,
      userByEmail: activeVerifiedUser,
      sessionUserId: null,
      privateMode: true,
    });
    expect(decision).toEqual({ action: "LOGIN", userId: "user-1", autoLink: true });
  });

  it("links to the signed-in user when the Google account is unused", () => {
    const decision = decideGoogleAction({
      mode: "LINK",
      profile,
      identityOwner: null,
      userByEmail: activeVerifiedUser,
      sessionUserId: "user-9",
    });
    expect(decision).toEqual({ action: "LINK", userId: "user-9" });
  });

  it("refuses linking without a session", () => {
    const decision = decideGoogleAction({
      mode: "LINK",
      profile,
      identityOwner: null,
      userByEmail: null,
      sessionUserId: null,
    });
    expect(decision).toEqual({ action: "REFUSE", reason: "NOT_SIGNED_IN" });
  });

  it("refuses linking when the Google account is already connected to anyone", () => {
    const decision = decideGoogleAction({
      mode: "LINK",
      profile,
      identityOwner: { ...activeVerifiedUser, id: "user-9" },
      userByEmail: null,
      sessionUserId: "user-9",
    });
    expect(decision).toEqual({ action: "REFUSE", reason: "ALREADY_LINKED" });
  });

  it("ignores an unverified email match when the identity owner is fine", () => {
    // The existing identity wins over the unverified email squatter.
    const decision = decideGoogleAction({
      mode: "LOGIN",
      profile: { ...profile, email: "bob@example.com" },
      identityOwner: activeVerifiedUser,
      userByEmail: activeUnverifiedUser,
      sessionUserId: null,
    });
    expect(decision).toEqual({ action: "LOGIN", userId: "user-1", autoLink: false });
  });
});

describe("normalizeEmailForMatch", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmailForMatch("  Alice@Example.COM ")).toBe("alice@example.com");
  });
});
