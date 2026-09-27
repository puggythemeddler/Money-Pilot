"use client";

import { useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleButton } from "@/components/auth/GoogleButton";

export interface ConnectedIdentity {
  provider: string;
  emailAtLink: string;
  linkedAt: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/**
 * Connected social sign-in identities. Disconnecting requires re-entering
 * the account password; Google-only accounts (created through "Continue with
 * Google") must first set a password via the forgot-password flow.
 */
export function ConnectedAccountsSection({ initialIdentities }: { initialIdentities: ConnectedIdentity[] }) {
  const [identities, setIdentities] = useState(initialIdentities);
  const [disconnecting, setDisconnecting] = useState<ConnectedIdentity | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const googleConnected = identities.some((identity) => identity.provider === "google");

  async function disconnect(identity: ConnectedIdentity) {
    setError(null);
    setBusy(true);
    try {
      await apiFetch<{ unlinked: boolean; provider: string }>(
        `/api/auth/identities/${encodeURIComponent(identity.provider)}`,
        { method: "DELETE", body: JSON.stringify({ password }) },
      );
      setIdentities((prev) => prev.filter((i) => i.provider !== identity.provider));
      setDisconnecting(null);
      setPassword("");
      setNotice(`${providerLabel(identity.provider)} was disconnected from this account.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not disconnect the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      {identities.length === 0 ? (
        <p className="text-sm text-muted">
          No connected sign-in providers. You can sign in with your email and password.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {identities.map((identity) => (
            <li key={identity.provider} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-heading">
                    {providerLabel(identity.provider)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-faint">
                    Connected as {identity.emailAtLink} ·{" "}
                    {new Date(identity.linkedAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || disconnecting !== null}
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setPassword("");
                    setDisconnecting(identity);
                  }}
                >
                  Disconnect
                </Button>
              </div>

              {disconnecting?.provider === identity.provider ? (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void disconnect(identity);
                  }}
                >
                  <Input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Confirm your password to disconnect"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" variant="danger" loading={busy}>
                      Disconnect {providerLabel(identity.provider)}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDisconnecting(null);
                        setPassword("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!googleConnected ? (
        <GoogleButton linkMode label="Connect Google account" />
      ) : (
        <p className="text-xs text-faint">
          To disconnect or delete a Google-only account, first set a password using the{" "}
          <a href="/forgot-password" className="font-medium text-primary-700 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300">
            forgot password
          </a>{" "}
          flow, then come back.
        </p>
      )}
    </div>
  );
}
