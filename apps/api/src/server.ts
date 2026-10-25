import { serve } from "@hono/node-server";
import { loadEnvFile } from "./env-loader";

/**
 * API entry point.
 *
 * Loads the local .env (if any) BEFORE importing the app: db.ts constructs
 * the Prisma client at import time and must see the final environment.
 * Production platforms inject real environment variables, which always win.
 */
loadEnvFile();

const { createApp } = await import("./app");

const app = createApp();
const port = Number(process.env.PORT || 4000);

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`moneypilot-api listening on http://0.0.0.0:${info.port}`);
});
