/**
 * Friendly copy for the error codes the Google OAuth redirect endpoints send
 * back as `?error=`. Pages only ever render these fixed messages — the raw
 * query parameter is never reflected into the page.
 */
export const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    "Google sign-in isn't set up on this deployment. Use your email and password instead.",
  google_cancelled: "Google sign-in was cancelled.",
  google_state: "That sign-in attempt expired or could not be verified. Please try again.",
  google_email: "Your Google account didn't share an email address, so it can't be used.",
  google_email_unverified:
    "The email on your Google account isn't verified. Verify it with Google, then try again.",
  google_email_taken:
    "An account already uses that email but never verified it. Log in with your password, then connect Google from Settings.",
  google_account_disabled: "This account has been disabled.",
  google_already_linked: "That Google account is already connected.",
  invite_required: "Registration is invite-only. You need an invitation to create an account.",
};

/** Resolves a redirect error code to its message, or null for unknown codes. */
export function oauthErrorMessage(code: string | undefined): string | null {
  return code ? (OAUTH_ERROR_MESSAGES[code] ?? null) : null;
}
