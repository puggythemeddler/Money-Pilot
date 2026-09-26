"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiClientError, apiFetch } from "@/lib/api-client";

export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/api/household/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      router.push("/dashboard/household");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not join the household.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Join a household</CardTitle>
        <CardDescription>
          You have been invited to share finances. You keep your personal ledger private — only
          the household&apos;s shared accounts become visible to members.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={accept} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <Button type="submit" loading={busy} className="w-full">
            Accept invitation
          </Button>
        </form>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <p className="text-xs text-slate-400">
          Invitation links are single-use and expire after 14 days. Ask the household owner for a
          fresh link if this one no longer works.
        </p>
      </CardContent>
    </Card>
  );
}
