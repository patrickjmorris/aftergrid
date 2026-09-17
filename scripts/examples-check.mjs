#!/usr/bin/env node
// Checks every committed example Finding in artifact mode and decides whether the tree is acceptable.
//
// The examples commit real run output, halts included: a Finding whose `analysis-progress.yaml` records
// `needs_attention` or `needs_input` is a truthful state, not a broken artifact. Such a Finding passes when the
// only errors `aftergrid check` reports are the ones the recorded halt names (a `check_failed` on the Check the
// reason cites). Anything else — a syntax, hash or digest error, an error on a Finding with no recorded halt, or
// a halt whose reason names no Check that actually failed — fails the run. Exit 0 when every Finding is
// acceptable, 1 otherwise, 2 on usage.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HALTS = new Set(["needs_attention", "needs_input"]);

/** The recorded halt of a Finding directory, or null when none is recorded. */
export function recordedHalt(dir) {
  const p = join(dir, "analysis-progress.yaml");
  if (!existsSync(p)) return null;
  const y = parseYaml(readFileSync(p, "utf8"));
  if (!y || typeof y !== "object" || !HALTS.has(y.status)) return null;
  return { status: y.status, stage: y.stage ?? null, reason: String(y.reason ?? "") };
}

/**
 * Decide one Finding. `report` is the JSON `aftergrid check --mode artifact --json` printed; `halt` is
 * `recordedHalt(dir)`. Returns { ok, why }.
 */
export function verdict(report, halt) {
  const errors = Array.isArray(report?.errors) ? report.errors : [];
  if (report?.syntax && report.syntax !== "ok") return { ok: false, why: `syntax ${report.syntax}` };
  if (!errors.length) return { ok: true, why: halt ? `recorded halt (${halt.status} at ${halt.stage}) with no evidence error` : "valid" };
  if (!halt) return { ok: false, why: `${errors.length} error(s) and no recorded halt: ${errors.map((e) => `${e.category} at ${e.location}`).join("; ")}` };
  const unexplained = errors.filter((e) => !(e.category === "check_failed" && halt.reason.includes(String(e.location).replace(/^checks\//, "").replace(/\.sql$/, ""))));
  if (unexplained.length) return { ok: false, why: `recorded halt does not explain: ${unexplained.map((e) => `${e.category} at ${e.location}`).join("; ")}` };
  return { ok: true, why: `recorded halt (${halt.status} at ${halt.stage}) explains every error: ${errors.map((e) => e.location).join(", ")}` };
}

export function findingDirs(root = REPO) {
  const out = [];
  const examples = join(root, "examples");
  if (!existsSync(examples)) return out;
  for (const ex of readdirSync(examples)) {
    const findings = join(examples, ex, "analytics", "findings");
    if (!existsSync(findings)) continue;
    for (const f of readdirSync(findings)) {
      const d = join(findings, f);
      if (statSync(d).isDirectory() && existsSync(join(d, "manifest.yaml"))) out.push(d);
    }
  }
  return out;
}

function checkOne(dir) {
  const r = spawnSync(process.execPath, [join(REPO, "src", "cli.ts"), "check", dir, "--mode", "artifact", "--json"], { encoding: "utf8", cwd: REPO });
  let report = null;
  try { report = JSON.parse(r.stdout); } catch { /* fall through */ }
  if (!report) return { ok: false, why: `check produced no JSON (exit ${r.status}): ${(r.stderr || r.stdout).slice(0, 300)}` };
  return verdict(report, recordedHalt(dir));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dirs = findingDirs();
  if (!dirs.length) { console.log("no example Findings yet"); process.exit(0); }
  let failed = 0;
  for (const d of dirs) {
    const v = checkOne(d);
    console.log(`${v.ok ? "ok  " : "FAIL"} ${d.replace(REPO + "/", "")}: ${v.why}`);
    if (!v.ok) failed++;
  }
  process.exit(failed ? 1 : 0);
}
