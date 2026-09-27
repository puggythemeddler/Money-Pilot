"use client";

import { useState, type FormEvent } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Change-password form. The current password is re-verified server-side;
 * after a successful change every other session is revoked (this device
 * stays signed in). Google-only accounts must first set a password through
 * the forgot-password flow — their stored hash is unguessable by design.
 */
export function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (password !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch<{ changed: boolean }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, password }),
      });
      setNotice("Password updated. You are still signed in here; other devices were signed out.");
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not change your password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4" noValidate>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <Field label="Current password" htmlFor="currentPassword">
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Your current password"
        />
      </Field>

      <Field
        label="New password"
        htmlFor="newPassword"
        hint="At least 8 characters, with a letter and a number."
      >
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Create a strong password"
        />
      </Field>

      <Field label="Confirm new password" htmlFor="confirmPassword">
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat the new password"
        />
      </Field>

      <Button type="submit" loading={submitting}>
        Change password
      </Button>
    </form>
  );
}
