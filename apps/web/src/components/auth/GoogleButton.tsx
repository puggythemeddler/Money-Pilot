import { cn } from "@/lib/cn";

/**
 * "Continue with Google" — a plain anchor (not a fetch): the start endpoint
 * answers with a top-level redirect to Google's consent screen, so the
 * browser must navigate. `linkMode` (Settings) binds the signed-in user into
 * the flow instead of logging in.
 */
export function GoogleButton({
  linkMode = false,
  label = "Continue with Google",
  className,
}: {
  linkMode?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={linkMode ? "/api/auth/google/start?link=1" : "/api/auth/google/start"}
      className={cn(
        "inline-flex h-10 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900",
        className,
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[18px] w-[18px]">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A8.99 8.99 0 0 0 9 18Z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A8.99 8.99 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
        />
      </svg>
      {label}
    </a>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <span className="text-xs font-medium uppercase tracking-wide text-faint">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
