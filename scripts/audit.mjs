#!/usr/bin/env node
// npm audit gate for CI: fails on high/critical vulnerabilities in the
// production dependency tree, with a small reviewed allowlist for
// build-time-only tools that have no fix available yet.
//
// npm's --omit=dev cannot exclude workspace dev-tool chains (the Prisma CLI
// leaks into the "prod" tree in workspaces), so the allowlist below is the
// single, reviewed place where known build-time advisories are carried.
// Review it on every dependency bump and remove entries as soon as a fix ships.
import { execSync } from "node:child_process";

const EXCEPTIONS = {
  prisma: "Prisma CLI — build-time generate/migrate tool, not shipped to the runtime",
  "@prisma/config": "Prisma CLI config loader — build-time only",
  "deepmerge-ts": "Transitive of @prisma/config — build-time only, no patched release yet",
};

function runAudit() {
  try {
    return JSON.parse(
      execSync("npm audit --omit=dev --json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    );
  } catch (err) {
    // npm audit exits non-zero when it finds issues; the JSON is on stdout.
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        /* fall through to the error below */
      }
    }
    console.error(`audit: could not run \`npm audit\`: ${err.message ?? err}`);
    process.exit(2);
  }
}

const result = runAudit();
const all = Object.values(result.vulnerabilities ?? {});
const gateRelevant = all.filter((v) => v.severity === "high" || v.severity === "critical");
const findings = gateRelevant.filter((v) => !EXCEPTIONS[v.name]);
const skipped = gateRelevant.filter((v) => EXCEPTIONS[v.name]);

for (const v of skipped) {
  console.log(`audit: allowlisted ${v.name} (${v.severity}) — ${EXCEPTIONS[v.name]}`);
}

if (findings.length === 0) {
  console.log(
    `audit: ok — no high/critical vulnerabilities in production dependencies (${gateRelevant.length - findings.length} allowlisted).`,
  );
  process.exit(0);
}

for (const v of findings) {
  const via = (v.via ?? [])
    .map((x) => (typeof x === "string" ? `via ${x}` : `${x.title} (${x.url ?? "no advisory url"})`))
    .join("; ");
  console.error(`audit: ${v.severity.toUpperCase()} — ${v.name}${via ? ` — ${via}` : ""}`);
}
console.error(`audit: ${findings.length} non-allowlisted high/critical finding(s).`);
process.exit(1);
