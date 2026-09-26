// Generates prisma/schema.sqlite.prisma from the canonical prisma/schema.prisma
// (PostgreSQL). The SQLite twin powers zero-install local development and the
// e2e harnesses; it is a pure provider swap so the two can never drift.
// Run this after every schema change, then commit the regenerated twin:
//   node apps/web/scripts/make-sqlite-schema.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const prismaDir = join(here, "..", "prisma");
const source = readFileSync(join(prismaDir, "schema.prisma"), "utf8");

const out = source
  .replace(
    /datasource db \{\s*provider\s*=\s*"postgresql"/,
    'datasource db {\n  provider = "sqlite"',
  )
  .replace(/\n\s*directUrl\s*=\s*env\([^)]*\)[^\n]*\n/g, "\n");

const header = `// ------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Zero-install SQLite twin for local development and e2e harnesses.
// Regenerate with: node apps/web/scripts/make-sqlite-schema.mjs
// (after editing the canonical prisma/schema.prisma).
// ------------------------------------------------------------------

`;

writeFileSync(join(prismaDir, "schema.sqlite.prisma"), header + out, "utf8");
console.log("wrote prisma/schema.sqlite.prisma (provider = sqlite)");
