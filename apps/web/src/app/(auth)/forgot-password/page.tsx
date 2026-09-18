"use client";

import { useState, type FormEvent } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch<{ sent: boolean }>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>We will email you a one-time reset link if an account exists.</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <Alert variant="success" title="Check your inbox">
            If an account exists for that email, a reset link is on its way. It expires in 4 hours.
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {error ? <Alert variant="error">{error}</Alert> : null}
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Button type="submit" className="w-full" loading={submitting}>
              Send reset link
            </Button>
          </form>
        )}
        <p className="mt-5 text-center text-sm text-slate-500">
          Remembered it?{" "}
          <a href="/login" className="font-medium text-primary-700 hover:text-primary-800">
            Back to login
          </a>
        </p>
      </CardContent>
    </Card>
  );
}