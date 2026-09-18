"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

export function LogoutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        setBusy(true);
        try {
          await apiFetch<{ loggedOut: boolean }>("/api/auth/logout", { method: "POST" });
        } catch {
          // Always redirect, even if the server call failed.
        }
        window.location.assign("/login");
      }}
      disabled={busy}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60 ${className ?? ""}`}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}