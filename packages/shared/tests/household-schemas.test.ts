import { describe, expect, it } from "vitest";
import {
  householdCreateSchema,
  householdInviteAcceptSchema,
  householdInviteCreateSchema,
  householdMemberUpdateSchema,
  householdRenameSchema,
} from "../src/schemas/household";

describe("householdCreateSchema / householdRenameSchema", () => {
  it.each([
    ["Family wallet", true],
    ["  Njeri & Otieno  ", true],
    ["", false],
    ["   ", false],
    ["x".repeat(61), false],
  ])("accepts %j as %s", (name, ok) => {
    const result = householdCreateSchema.safeParse({ name });
    expect(result.success).toBe(ok);
    const rename = householdRenameSchema.safeParse({ name });
    expect(rename.success).toBe(ok);
  });

  it("trims the name", () => {
    const result = householdCreateSchema.parse({ name: "  Home  " });
    expect(result.name).toBe("Home");
  });
});

describe("householdInviteCreateSchema", () => {
  it("defaults canRecord to true", () => {
    expect(householdInviteCreateSchema.parse({}).canRecord).toBe(true);
  });

  it("accepts an explicit canRecord and expiry", () => {
    const parsed = householdInviteCreateSchema.parse({ canRecord: false, expiresInDays: 7 });
    expect(parsed.canRecord).toBe(false);
    expect(parsed.expiresInDays).toBe(7);
  });

  it("rejects out-of-range expiry", () => {
    expect(householdInviteCreateSchema.safeParse({ expiresInDays: 31 }).success).toBe(false);
    expect(householdInviteCreateSchema.safeParse({ expiresInDays: 0 }).success).toBe(false);
  });
});

describe("householdInviteAcceptSchema", () => {
  it("requires a non-empty token", () => {
    expect(householdInviteAcceptSchema.safeParse({ token: "abc" }).success).toBe(true);
    expect(householdInviteAcceptSchema.safeParse({ token: "" }).success).toBe(false);
    expect(householdInviteAcceptSchema.safeParse({}).success).toBe(false);
  });

  it("trims the token", () => {
    expect(householdInviteAcceptSchema.parse({ token: " abc " }).token).toBe("abc");
  });
});

describe("householdMemberUpdateSchema", () => {
  it("requires an explicit boolean", () => {
    expect(householdMemberUpdateSchema.safeParse({ canRecord: false }).success).toBe(true);
    expect(householdMemberUpdateSchema.safeParse({}).success).toBe(false);
    expect(householdMemberUpdateSchema.safeParse({ canRecord: "no" }).success).toBe(false);
  });
});
