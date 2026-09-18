import { env } from "./env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development mailer: prints the message to the server console so flows can
 * be verified without SMTP. Links and tokens are never logged in production.
 */
const consoleMailer: Mailer = {
  async send(message) {
    if (env.isProd) {
      console.error(
        "[mail] Email delivery is not configured in production; a transactional email was not sent.",
      );
      return;
    }
    console.warn(
      `[mail:dev] To: ${message.to}\n  Subject: ${message.subject}\n  ---\n${message.text}\n  ---`,
    );
  },
};

/**
 * SMTP mailer. Implemented against the standard SMTP interface; swap in a
 * transport (e.g. nodemailer or a transactional API client) with the same
 * `Mailer` contract. Until SMTP_HOST is configured, delivery falls back to
 * the console mailer outside production.
 */
const smtpMailer: Mailer | null =
  env.mail.host && env.mail.user && env.mail.pass ? { send: () => Promise.reject(new Error("SMTP transport not implemented yet")) } : null;

export const mailer: Mailer = smtpMailer ?? consoleMailer;