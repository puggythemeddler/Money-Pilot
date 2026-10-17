#!/usr/bin/env node
// Prisma migration encoding gate for CI: every committed `migration.sql`
// must be plain UTF-8 without a BOM and without NUL bytes.
//
// This has broken production deploys twice, both as Windows writing
// artifacts: the baseline was saved as UTF-16 LE and later the recurring
// income migration as UTF-8 *with* a BOM. Prisma hands the raw file bytes
// to node-postgres, which then rejects them (embedded NUL / `U+FEFF` at
// position 1 → P3018) and aborts `prisma migrate deploy`, leaving the
// migration marked failed in `_prisma_migrations`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "apps/api/prisma/migrations";

function findMigrationFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...findMigrationFiles(full));
    else if (entry === "migration.sql") files.push(full);
  }
  return files;
}

function describeEncoding(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "UTF-8 with BOM";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return "UTF-16 LE";
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return "UTF-16 BE";
  if (bytes.includes(0x00)) return "contains NUL bytes";
  return null;
}

let files;
try {
  files = findMigrationFiles(MIGRATIONS_DIR);
} catch (err) {
  console.error(`migrations: could not read ${MIGRATIONS_DIR}: ${err.message ?? err}`);
  process.exit(2);
}

const problems = [];
for (const file of files) {
  const bytes = readFileSync(file);
  const issue = describeEncoding(bytes);
  if (issue) problems.push(`${file} — ${issue}`);

  // Round-trip through a strict UTF-8 decoder to catch any other mojibake.
  const decoded = bytes.toString("utf8");
  if (Buffer.from(decoded, "utf8").compare(bytes) !== 0 && !issue) {
    problems.push(`${file} — not valid UTF-8`);
  }
}

if (problems.length === 0) {
  console.log(`migrations: ok — ${files.length} migration(s) are plain UTF-8 without BOM.`);
  process.exit(0);
}

for (const problem of problems) console.error(`migrations: FAIL — ${problem}`);
console.error(
  `migrations: ${problems.length} file(s) must be re-saved as UTF-8 without a BOM ` +
    `(text mode, "UTF-8", no byte-order mark).`,
);
process.exit(1);
