"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Status =
  | { state: "loading" }
  | { state: "success"; alreadyVerified: boolean }
  | { state: "error"; message: string };

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<Status>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        if (!cancelled) setStatus({ state: "error", message: "This verification link is incomplete." });
        return;
      }
      try {
        const result = await apiFetch<{ verified: boolean; alreadyVerified: boolean }>(
          "/api/auth/verify-email",
          { method: "POST", body: JSON.stringify({ token }) },
        );
        if (!cancelled) setStatus({ state: "success", alreadyVerified: result.alreadyVerified });
      } catch (err) {
        if (!cancelled) {
          setStatus({
            state: "error",
            message: err instanceof ApiClientError ? err.message : "Unable to verify your email.",
          });
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status.state === "loading") {
    return <p className="text-sm text-slate-500">Verifying your email…</p>;
  }
  if (status.state === "error") {
    return <Alert variant="error" title="Verification failed">{status.message}</Alert>;
  }
  return (
    <Alert variant="success" title={status.alreadyVerified ? "Email already verified" : "Email verified"}>
      Your email address is confirmed.{" "}
      <a href="/dashboard" className="font-semibold underline">
        Go to your dashboard
      </a>
      .
    </Alert>
  );
}

export default function VerifyEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>Confirming your email secures your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
          <VerifyEmailForm />
        </Suspense>
        <div className="mt-5 flex items-center justify-between text-sm">
          <a href="/dashboard" className="font-medium text-primary-700 hover:text-primary-800">
            Go to dashboard
          </a>
          <a href="/login" className="font-medium text-slate-600 hover:text-slate-800">
            <Button variant="ghost" size="sm">
              Log in
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}