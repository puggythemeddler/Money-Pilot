"use client";

import { useState, type FormEvent } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { getOrCreateDeviceKey } from "@/lib/device-key";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface LoginResponse {
  user: { id: string; email: string; name: string };
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          remember,
          device: { clientKey: getOrCreateDeviceKey(), platform: "WEB" },
        }),
      });
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Unable to sign in. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Log in to your MoneyPilot account.</CardDescription>
      </CardHeader>
      <CardContent>
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

          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            Keep me signed in
          </label>

          <Button type="submit" className="w-full" loading={submitting}>
            Log in
          </Button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <a href="/register" className="font-medium text-primary-700 hover:text-primary-800">
            Create an account
          </a>
          <a href="/forgot-password" className="font-medium text-primary-700 hover:text-primary-800">
            Forgot password?
          </a>
        </div>
      </CardContent>
    </Card>
  );
}