import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `env` snapshots the Google credentials at module load, so each case resets
 * the module registry and re-imports after stubbing the environment.
 */
async function loadCapabilities() {
  vi.resetModules();
  return import("../src/lib/capabilities");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("authCapabilities", () => {
  it("reports googleSignIn false when credentials are absent", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const { authCapabilities } = await loadCapabilities();
    expect(authCapabilities().googleSignIn).toBe(false);
  });

  it("reports googleSignIn true only when both credentials are present", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    const { authCapabilities } = await loadCapabilities();
    expect(authCapabilities().googleSignIn).toBe(true);

    // A partial configuration must not read as enabled.
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const partial = await loadCapabilities();
    expect(partial.authCapabilities().googleSignIn).toBe(false);
  });

  it("never overclaims email delivery while no transport is implemented", async () => {
    const { authCapabilities } = await loadCapabilities();
    expect(authCapabilities().emailDelivery).toBe(false);
  });
});
