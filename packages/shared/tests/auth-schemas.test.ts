import { describe, expect, it } from "vitest";
import { AppError, ErrorCodes, isAppError } from "../src/errors";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "../src/schemas/auth";

describe("registerSchema", () => {
  it("accepts a valid registration", () => {
    const result = registerSchema.safeParse({
      name: "Wanjiku Kamau",
      email: "WANJIKU@Example.COM",
      password: "SecurePass1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("wanjiku@example.com");
      expect(result.data.preferredCurrency).toBe("KES");
    }
  });

  it("rejects weak passwords", () => {
    expect(registerSchema.safeParse({ name: "A", email: "a@b.co", password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "A", email: "a@b.co", password: "password" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "A", email: "a@b.co", password: "12345678" }).success).toBe(false);
  });

  it("rejects invalid emails", () => {
    expect(registerSchema.safeParse({ name: "A", email: "nope", password: "SecurePass1" }).success).toBe(false);
  });

  it("rejects unknown currencies", () => {
    const result = registerSchema.safeParse({
      name: "A",
      email: "a@b.co",
      password: "SecurePass1",
      preferredCurrency: "ZZZ",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional invitation token", () => {
    const withToken = registerSchema.safeParse({
      name: "A",
      email: "a@b.co",
      password: "SecurePass1",
      inviteToken: "abc-123",
    });
    expect(withToken.success).toBe(true);
    if (withToken.success) expect(withToken.data.inviteToken).toBe("abc-123");

    const withoutToken = registerSchema.safeParse({
      name: "A",
      email: "a@b.co",
      password: "SecurePass1",
    });
    expect(withoutToken.success).toBe(true);
    if (withoutToken.success) expect(withoutToken.data.inviteToken).toBeUndefined();
  });

  it("rejects non-string invitation tokens", () => {
    expect(
      registerSchema.safeParse({ name: "A", email: "a@b.co", password: "SecurePass1", inviteToken: 5 })
        .success,
    ).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid login", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });

  it("requires email format", () => {
    expect(loginSchema.safeParse({ email: "a", password: "x" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("applies the password policy", () => {
    expect(resetPasswordSchema.safeParse({ token: "t", password: "weak" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "t", password: "BetterPass1" }).success).toBe(true);
  });
});

describe("forgotPasswordSchema", () => {
  it("validates the email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("AppError", () => {
  it("produces a consistent API body", () => {
    const err = new AppError(ErrorCodes.INVALID_CREDENTIALS, "Bad login", 401);
    expect(err.status).toBe(401);
    expect(isAppError(err)).toBe(true);
    expect(err.toBody("req-1").error.code).toBe("INVALID_CREDENTIALS");
    expect(isAppError(new Error("x"))).toBe(false);
  });
});