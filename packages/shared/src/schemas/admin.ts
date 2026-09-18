import { z } from "zod";
import { emailSchema } from "./auth";

export const createInvitationSchema = z.object({
  email: emailSchema.optional(),
  role: z.enum(["USER", "ADMIN"]).default("USER"),
  expiresInDays: z.number().int().min(1).max(90).default(30),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required.").max(72),
  /** The literal "DELETE" must be supplied to confirm the destructive action. */
  confirm: z.literal("DELETE"),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;