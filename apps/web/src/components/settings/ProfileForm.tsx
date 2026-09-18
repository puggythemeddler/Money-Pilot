"use client";

import { useState, type FormEvent } from "react";
import { CURRENCIES, isSupportedCurrency } from "@moneypilot/shared";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";

export interface ProfileFormInitial {
  name: string;
  email: string;
  preferredCurrency: string;
  timezone: string;
  financialMonthStartDay: number;
}

const timezones = [
  "Africa/Nairobi",
  "Africa/Kampala",
  "Africa/Dar_es_Salaam",
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Addis_Ababa",
  "Africa/Cairo",
  "Europe/London",
  "America/New_York",
  "Asia/Dubai",
  "UTC",
];

const currencyOptions = Object.values(CURRENCIES);

async function patchProfile(body: unknown) {
  return apiFetch<{ user: { name: string; preferredCurrency: string; timezone: string } }>(
    "/api/auth/me",
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export function ProfileForm({ initial }: { initial: ProfileFormInitial }) {
  const [name, setName] = useState(initial.name);
  const [preferredCurrency, setPreferredCurrency] = useState(initial.preferredCurrency);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [monthStart, setMonthStart] = useState(initial.financialMonthStartDay);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    const currency = preferredCurrency.trim().toUpperCase();
    if (currency && !isSupportedCurrency(currency)) {
      setError(`Currency "${currency}" is not supported yet.`);
      setBusy(false);
      return;
    }
    try {
      await patchProfile({
        name,
        preferredCurrency: currency || undefined,
        timezone,
        financialMonthStartDay: monthStart,
      });
      setMessage("Profile updated.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update your profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}

      <Field label="Name" htmlFor="profile-name">
        <Input
          id="profile-name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label="Email" htmlFor="profile-email" hint="Email cannot be changed yet.">
        <Input id="profile-email" value={initial.email} disabled />
      </Field>

      <Field label="Preferred currency" htmlFor="profile-currency">
        <Select
          id="profile-currency"
          value={preferredCurrency}
          onChange={(e) => setPreferredCurrency(e.target.value)}
        >
          {currencyOptions.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Timezone"
        htmlFor="profile-timezone"
        hint="Used to display dates in your local time."
      >
        <Input
          id="profile-timezone"
          list="timezone-options"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
        <datalist id="timezone-options">
          {timezones.map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
      </Field>

      <Field
        label="Financial month start day"
        htmlFor="profile-month-start"
        hint="Day of the month your financial month begins (1–28). Used for budgets and reports."
      >
        <Input
          id="profile-month-start"
          type="number"
          min={1}
          max={28}
          value={monthStart}
          onChange={(e) => setMonthStart(Number(e.target.value))}
        />
      </Field>

      <Button type="submit" loading={busy}>
        Save changes
      </Button>
    </form>
  );
}