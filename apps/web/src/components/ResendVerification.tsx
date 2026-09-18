"use client";

import { useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

export function ResendVerification() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await apiFetch<{ sent: boolean; reason: string }>(
        "/api/auth/resend-verification",
        { method: "POST" },
      );
      setMessage(
        result.reason === "already_verified"
          ? "Your email is already verified."
          : "A new verification link is on its way.",
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Unable to resend the link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button variant="outline" size="sm" onClick={resend} loading={busy}>
        Resend verification link
      </Button>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
    </div>
  );
}