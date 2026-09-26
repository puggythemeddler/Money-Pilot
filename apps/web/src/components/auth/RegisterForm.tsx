"use client";

import { useState, type FormEvent } from "react";
import { CURRENCIES } from "@moneypilot/shared";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { getOrCreateDeviceKey } from "@/lib/device-key";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { GoogleButton, OrDivider } from "@/components/auth/GoogleButton";

interface RegisterResponse {
  user: { id: string; email: string; name: string };
}

const currencyOptions = Object.values(CURRENCIES);

export function RegisterForm({ initialError }: { initialError: string | null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [preferredCurrency, setPreferredCurrency] = useState("KES");
  const [inviteToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("invite") ?? "";
  });
  const [error, setError] = useState<string | null>(initialError);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          password,
          preferredCurrency,
          inviteToken: inviteToken || undefined,
          device: { clientKey: getOrCreateDeviceKey(), platform: "WEB" },
        }),
      });
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Unable to create your account.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {inviteToken ? (
        <Alert variant="info">
          You&apos;re signing up with an invitation. The token will be applied automatically.
        </Alert>
      ) : null}
      <GoogleButton />
      <OrDivider />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Your name" htmlFor="name">
          <Input
            id="name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Wanjiku Kamau"
          />
        </Field>

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

        <Field
          label="Password"
          htmlFor="password"
          hint="At least 8 characters, with a letter and a number."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a strong password"
          />
        </Field>

        <Field label="Preferred currency" htmlFor="currency">
          <Select
            id="currency"
            value={preferredCurrency}
            onChange={(e) => setPreferredCurrency(e.target.value)}
          >
            {currencyOptions.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} — {currency.name} ({currency.symbol})
              </option>
            ))}
          </Select>
        </Field>

        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>
    </div>
  );
}
