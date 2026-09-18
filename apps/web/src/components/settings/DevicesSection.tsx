"use client";

import { useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface SettingsDevice {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: string;
  activeSessions: number;
  isCurrent: boolean;
}

export function DevicesSection({ initialDevices }: { initialDevices: SettingsDevice[] }) {
  const [devices, setDevices] = useState(initialDevices);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  async function revoke(deviceId: string) {
    setError(null);
    setBusyId(deviceId);
    try {
      const result = await apiFetch<{ revoked: boolean; currentDevice: boolean }>(
        "/api/auth/devices",
        { method: "POST", body: JSON.stringify({ deviceId }) },
      );
      if (result.currentDevice) {
        window.location.assign("/login");
        return;
      }
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not revoke the device.");
    } finally {
      setBusyId(null);
    }
  }

  async function signOutAll() {
    setError(null);
    setBusyAll(true);
    try {
      await apiFetch<{ loggedOutAll: boolean }>("/api/auth/logout-all", { method: "POST" });
      window.location.assign("/login");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not sign out all devices.");
      setBusyAll(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {devices.length === 0 ? (
          <li className="px-4 py-3 text-sm text-slate-500">No active devices.</li>
        ) : (
          devices.map((device) => (
            <li key={device.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {device.isCurrent ? `${device.name} (this device)` : device.name}
                  </p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                    {device.platform}
                  </span>
                  {device.activeSessions > 1 ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      {device.activeSessions} sessions
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  Last active {new Date(device.lastSeenAt).toLocaleString()}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => revoke(device.id)}
                disabled={busyId !== null}
                loading={busyId === device.id}
              >
                {device.isCurrent ? "Sign out" : "Revoke"}
              </Button>
            </li>
          ))
        )}
      </ul>
      <Button variant="danger" size="sm" onClick={signOutAll} loading={busyAll} disabled={busyId !== null}>
        Sign out on all devices
      </Button>
    </div>
  );
}