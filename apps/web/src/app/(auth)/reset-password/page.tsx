"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch<{ reset: boolean }>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Unable to reset your password.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <Alert variant="error" title="Missing reset link">
        This password-reset link is incomplete. Request a new one below.
      </Alert>
    );
  }

  if (done) {
    return (
      <Alert variant="success" title="Password updated">
        Your password has been changed and you have been signed out everywhere.{" "}
        <a href="/login" className="font-semibold underline">
          Log in with your new password
        </a>
        .
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Field label="New password" htmlFor="password" hint="At least 8 characters, with a letter and a number.">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button type="submit" className="w-full" loading={submitting}>
        Reset password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>This link can only be used once.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
        <p className="mt-5 text-center text-sm text-slate-500">
          <a href="/forgot-password" className="font-medium text-primary-700 hover:text-primary-800">
            Request a new link
          </a>
        </p>
      </CardContent>
    </Card>
  );
}