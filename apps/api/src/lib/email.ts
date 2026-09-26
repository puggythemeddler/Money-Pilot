import { env } from "./env";
import { mailer, type MailMessage } from "./mail";

function buildLink(path: string, token: string): string {
  return `${env.appBaseUrl}/${path}?token=${encodeURIComponent(token)}`;
}

export function sendVerificationEmail(user: { name: string; email: string }, token: string): Promise<void> {
  const link = buildLink("verify-email", token);
  const message: MailMessage = {
    to: user.email,
    subject: "Verify your MoneyPilot email",
    text: [
      `Hi ${user.name},`,
      "",
      "Welcome to MoneyPilot. Verify your email address to secure your account:",
      "",
      link,
      "",
      "This link expires in 24 hours. If you did not create a MoneyPilot account, you can ignore this email.",
    ].join("\n"),
  };
  return mailer.send(message);
}

export function sendPasswordResetEmail(user: { name: string; email: string }, token: string): Promise<void> {
  const link = buildLink("reset-password", token);
  const message: MailMessage = {
    to: user.email,
    subject: "Reset your MoneyPilot password",
    text: [
      `Hi ${user.name},`,
      "",
      "We received a request to reset your MoneyPilot password:",
      "",
      link,
      "",
      "This link expires in 4 hours and can only be used once. If you did not request a reset, you can safely ignore this email.",
    ].join("\n"),
  };
  return mailer.send(message);
}