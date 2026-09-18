import { z } from "zod";
import { isSupportedCurrency } from "../currency";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Enter a valid email address.")
  .max(254, "Email address is too long.")
  .email("Enter a valid email address.");

/**
 * Password policy: 8–72 characters, at least one letter and one digit.
 * 72 is the bcrypt input limit; longer inputs are rejected rather than
 * silently truncated.
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be at most 72 characters.")
  .regex(/[A-Za-z]/, "Password must include at least one letter.")
  .regex(/[0-9]/, "Password must include at least one digit.");

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(120, "Name must be at most 120 characters.");

/** Preferred currency must be one of the supported ISO codes. */
export const preferredCurrencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3)
  .max(3)
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO 4217 code.")
  .refine(isSupportedCurrency, "This currency is not supported yet.");

export const timezoneSchema = z.string().trim().min(1).max(80);

/** Optional client device information used for idempotent device registration. */
export const deviceInfoSchema = z
  .object({
    clientKey: z.string().min(8).max(200).optional(),
    name: z.string().max(200).optional(),
    platform: z.enum(["WEB", "IOS", "ANDROID"]).optional(),
  })
  .default({});

export type DeviceInfoInput = z.infer<typeof deviceInfoSchema>;

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  preferredCurrency: preferredCurrencySchema.default("KES"),
  inviteToken: z.string().min(1).max(512).optional(),
  device: deviceInfoSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required.").max(72),
  remember: z.boolean().optional().default(false),
  device: deviceInfoSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Refresh request body. In token-mode (mobile clients sending
 * `X-Use-Token-Auth: true`) the refreshToken is required and returned in the
 * JSON body. In cookie-mode (browsers) the token travels in an httpOnly cookie
 * and the body can be empty.
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(512).optional(),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  password: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1).max(512),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
  preferredCurrency: preferredCurrencySchema.optional(),
  timezone: timezoneSchema.optional(),
  financialMonthStartDay: z.number().int().min(1).max(28).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;