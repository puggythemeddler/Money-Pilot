"use client";

import { useState, type FormEvent } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function PrivacySection() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function onExport() {
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/users/export", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiClientError(
          body?.error ?? { error: { code: "INTERNAL_ERROR", message: `Request failed (${res.status}).` } },
          res.status,
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "moneypilot-export.json";
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Export downloaded. It contains everything we have for this account.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Export failed. Please try again.");
    }
  }

  async function onDelete(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (confirm !== "DELETE") {
      setError('Type "DELETE" to confirm account deletion.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/users/delete-account", {
        method: "POST",
        body: JSON.stringify({ password, confirm }),
      });
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not delete your account.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-slate-900">Export your data</p>
          <p className="text-sm text-slate-500">
            Download everything we have for this account as JSON.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={onExport}>
          Download export
        </Button>
      </div>

      <form onSubmit={onDelete} className="space-y-4 rounded-xl border border-red-200 p-4">
        <div>
          <p className="font-medium text-red-700">Delete this account</p>
          <p className="text-sm text-slate-500">
            This signs you out on every device, removes your personal information, and marks the
            account deleted. It cannot be undone.
          </p>
        </div>

        <Field label="Confirm by typing DELETE" htmlFor="delete-confirm">
          <Input
            id="delete-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
          />
        </Field>

        <Field label="Current password" htmlFor="delete-password" hint="Required to confirm it's you.">
          <Input
            id="delete-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        <Button type="submit" variant="danger" loading={busy}>
          Delete account
        </Button>
      </form>
    </div>
  );
}