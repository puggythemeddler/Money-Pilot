import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser, serverFetch } from "@/lib/server-api";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectedAccountsSection, type ConnectedIdentity } from "@/components/settings/ConnectedAccountsSection";
import { DevicesSection, type SettingsDevice } from "@/components/settings/DevicesSection";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { PrivacySection } from "@/components/settings/PrivacySection";
import { oauthErrorMessage } from "@/lib/oauth-errors";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; error?: string }>;
}) {
  const auth = await getServerUser();
  if (!auth) redirect("/login");

  const { linked, error } = await searchParams;
  const errorMessage = oauthErrorMessage(error);
  const linkedMessage = linked === "google" ? "Google was connected to this account." : null;

  const [{ devices }, { identities }] = await Promise.all([
    serverFetch<{ devices: SettingsDevice[] }>("/api/auth/devices"),
    serverFetch<{ identities: ConnectedIdentity[] }>("/api/auth/identities"),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Profile, preferences, security and devices.</p>
      </header>

      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
      {linkedMessage ? <Alert variant="success">{linkedMessage}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How MoneyPilot personalizes your experience.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initial={{
              name: auth.user.name,
              email: auth.user.email,
              preferredCurrency: auth.user.preferredCurrency,
              timezone: auth.user.timezone,
              financialMonthStartDay: auth.profile.financialMonthStartDay,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Devices &amp; sessions</CardTitle>
          <CardDescription>
            Every browser or handset signed in to this account. Revoking a device signs it out
            immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DevicesSection initialDevices={devices} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected accounts</CardTitle>
          <CardDescription>
            Social sign-in providers linked to this account. Disconnecting asks for your
            password first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectedAccountsSection initialIdentities={identities} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data &amp; privacy</CardTitle>
          <CardDescription>
            Export everything this account has, or delete the account entirely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PrivacySection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Coming with the security phase. For now, use the{" "}
            <a href="/forgot-password" className="font-medium text-primary-700 hover:text-primary-800">
              forgot password
            </a>{" "}
            flow — it signs you out everywhere after resetting.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
