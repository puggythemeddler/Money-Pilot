import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const source = readFileSync(new URL("./audit.mjs", import.meta.url), "utf8")
  .replace('import { execSync } from "node:child_process";',
    'const execSync = () => { const e = new Error("npm failed"); e.stdout = process.argv[1]; throw e; };');

function run(report) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", source,
    typeof report === "string" ? report : JSON.stringify(report)], { encoding: "utf8" });
}

const report = (vulnerabilities = {}) => ({
  auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } },
});

test("accepts a complete clean report even when npm exits nonzero", () => {
  assert.equal(run(report()).status, 0);
});

test("rejects high severity findings", () => {
  assert.equal(run(report({ example: { name: "example", severity: "high", via: [] } })).status, 1);
});

test("preserves reviewed exceptions", () => {
  assert.equal(run(report({ prisma: { name: "prisma", severity: "high", via: [] } })).status, 0);
});

test("fails closed on registry errors, missing reports, and malformed JSON", () => {
  for (const value of [{ error: { code: "ENETUNREACH" } }, {}, null,
    { auditReportVersion: 2, vulnerabilities: {} }, "not json"]) {
    const result = run(value);
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stdout, /audit: ok/);
  }
});
