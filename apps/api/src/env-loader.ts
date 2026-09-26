import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Loads a local .env file (if present) into process.env without overriding
 * values that are already set, mirroring the development convenience the web
 * app had under Next.js. Production platforms (Render) inject real
 * environment variables, which always win.
 *
 * Must run before any module that reads process.env at import time (db.ts
 * constructs the Prisma client on load), which is why server.ts loads it
 * before dynamically importing the app.
 */
export function loadEnvFile(): void {
  const file = path.join(process.cwd(), ".env");
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
