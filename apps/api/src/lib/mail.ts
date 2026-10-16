import { env } from "./env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  /**
   * True only when a message actually reaches the recipient's inbox. The
   * console mailer prints to the server log (useful in development, but not
   * real delivery) and the SMTP transport is not implemented yet, so this is
   * currently false everywhere. The web UI reads this so verification and
   * password-reset screens never promise an email that will not arrive.
   */
  readonly delivers: boolean;
  send(message: MailMessage): Promise<void>;
}

/**
 * Development mailer: prints the message to the server console so flows can
 * be verified without SMTP. Links and tokens are never logged in production.
 */
const consoleMailer: Mailer = {
  delivers: false,
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
 * the console mailer outside production. `delivers` stays false until a real
 * transport is wired up, even when credentials are present.
 */
const smtpMailer: Mailer | null =
  env.mail.host && env.mail.user && env.mail.pass
    ? {
        delivers: false,
        send: () => Promise.reject(new Error("SMTP transport not implemented yet")),
      }
    : null;

export const mailer: Mailer = smtpMailer ?? consoleMailer;

/** True when the API can deliver mail to an inbox (see `Mailer.delivers`). */
export const emailDeliveryAvailable = mailer.delivers;