import { describe, expect, it } from "vitest";
import { createInvitationSchema, deleteAccountSchema } from "../src/schemas/admin";

describe("createInvitationSchema", () => {
  it("defaults role and expiry", () => {
    const result = createInvitationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("USER");
      expect(result.data.expiresInDays).toBe(30);
    }
  });

  it("accepts an admin invite with an email", () => {
    const result = createInvitationSchema.safeParse({ email: "a@b.co", role: "ADMIN", expiresInDays: 7 });
    expect(result.success).toBe(true);
  });

  it("rejects invalid roles, emails, and expiry windows", () => {
    expect(createInvitationSchema.safeParse({ role: "SUPERUSER" }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ expiresInDays: 0 }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ expiresInDays: 91 }).success).toBe(false);
  });
});

describe("deleteAccountSchema", () => {
  it("requires the literal DELETE confirmation", () => {
    expect(deleteAccountSchema.safeParse({ password: "x", confirm: "delete" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: "x", confirm: "DELETE" }).success).toBe(true);
  });

  it("requires a password", () => {
    expect(deleteAccountSchema.safeParse({ confirm: "DELETE" }).success).toBe(false);
  });
});