import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listDevicesForUser } from "@/lib/devices";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DevicesSection, type SettingsDevice } from "@/components/settings/DevicesSection";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { PrivacySection } from "@/components/settings/PrivacySection";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const [profile, devices] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: auth.user.id } }),
    listDevicesForUser(auth.user.id),
  ]);

  const serializedDevices: SettingsDevice[] = devices.map((d) => ({
    id: d.id,
    name: d.name,
    platform: d.platform,
    lastSeenAt: d.lastSeenAt.toISOString(),
    activeSessions: d._count.sessions,
    isCurrent: d.id === auth.deviceId,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Profile, preferences, security and devices.</p>
      </header>

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
              financialMonthStartDay: profile?.financialMonthStartDay ?? 1,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Devices & sessions</CardTitle>
          <CardDescription>
            Every browser or handset signed in to this account. Revoking a device signs it out
            immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DevicesSection initialDevices={serializedDevices} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data & privacy</CardTitle>
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