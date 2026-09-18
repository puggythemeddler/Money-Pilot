import type { SVGProps } from "react";

/** MoneyPilot logo mark — a stylized circuit/"P" in a rounded square. */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <rect width="32" height="32" rx="8" fill="url(#mp-grad)" />
      <path
        d="M9.5 23V9h6.2a5.4 5.4 0 0 1 3.9 1.45 5.1 5.1 0 0 1 1.45 3.8c0 1.55-.48 2.75-1.45 3.6-.96.84-2.32 1.27-4.05 1.27h-2.5V23h-3.55Zm3.55-3.1h2.5c1.18 0 2.07-.27 2.65-.82.6-.57.9-1.4.9-2.5 0-1.07-.3-1.9-.9-2.5-.58-.6-1.47-.92-2.65-.92h-2.5v6.74Z"
        fill="white"
      />
      <defs>
        <linearGradient id="mp-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0d9488" />
          <stop offset="1" stopColor="#134e4a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function MoneyPilotLogo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark className="h-7 w-7" />
      <span className="text-lg font-semibold tracking-tight text-slate-900">
        Money<span className="text-primary-600">Pilot</span>
      </span>
    </span>
  );
}

export const Icons = {
  dashboard: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5" />
      <rect x="3" y="15" width="7.5" height="6" rx="1.5" />
    </svg>
  ),
  settings: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  ),
  logout: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M9 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2H9" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
  check: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" {...props}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  ),
  lock: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  phone: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  ),
  arrowRight: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  ),
  alert: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M12 3 2.5 19.5h19L12 3Z" />
      <path d="M12 9.5V14" />
      <path d="M12 16.8v.2" />
    </svg>
  ),
  wallet: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M3.5 6.5A2.5 2.5 0 0 1 6 4h12.5v2" />
      <path d="M3.5 6.5A2.5 2.5 0 0 0 6 9h14.5V5a1.5 1.5 0 0 0-1.5-1.5" />
      <path d="M3.5 6.5 4 19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2" />
      <circle cx="16.4" cy="14.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  ),
  receipt: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M6 3.5h12a1 1 0 0 1 1 1v16l-2.5-1.7L14 20.5l-2-1.8-2 1.8-2.5-1.7L5 20.5v-16a1 1 0 0 1 1-1Z" />
      <path d="M8.5 8.5h7" />
      <path d="M8.5 12h7" />
      <path d="M9 15.5h4" />
    </svg>
  ),
  swap: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M8 4 4 8l4 4" />
      <path d="M4 8h11a5 5 0 0 1 5 5v0" />
      <path d="m16 20 4-4-4-4" />
      <path d="M20 16H9a5 5 0 0 1-5-5v0" />
    </svg>
  ),
  tag: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M4 4h7.2a2 2 0 0 1 1.4.6l7.3 7.3a2 2 0 0 1 0 2.8l-4.2 4.2a2 2 0 0 1-2.8 0l-7.3-7.3a2 2 0 0 1-.6-1.4V4Z" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
};