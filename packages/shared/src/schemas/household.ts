/**
 * Household (shared space for a family or couple) request schemas.
 * Joint accounts reuse the account schemas from ./finance — the input
 * shape is identical; only the ownership context differs.
 */
import { z } from "zod";

export const householdNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(60, "Name must be at most 60 characters.");

export const householdCreateSchema = z.object({
  name: householdNameSchema,
});

export const householdRenameSchema = z.object({
  name: householdNameSchema,
});

/** Owner-issued invitation: per-member record permission, optional expiry. */
export const householdInviteCreateSchema = z.object({
  canRecord: z.boolean().default(true),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

export const householdInviteAcceptSchema = z.object({
  token: z.string().trim().min(1, "An invitation token is required."),
});

/** Owner-managed per-member permission change. */
export const householdMemberUpdateSchema = z.object({
  canRecord: z.boolean(),
});

export type HouseholdCreateInput = z.infer<typeof householdCreateSchema>;
export type HouseholdRenameInput = z.infer<typeof householdRenameSchema>;
export type HouseholdInviteCreateInput = z.infer<typeof householdInviteCreateSchema>;
export type HouseholdInviteAcceptInput = z.infer<typeof householdInviteAcceptSchema>;
export type HouseholdMemberUpdateInput = z.infer<typeof householdMemberUpdateSchema>;
