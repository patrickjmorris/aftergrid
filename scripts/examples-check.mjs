#!/usr/bin/env node
// Checks every committed example Finding in artifact mode and decides whether the tree is acceptable.
//
// The examples commit real run output, halts included: a Finding whose `analysis-progress.yaml` records
// `needs_attention` or `needs_input` is a truthful state, not a broken artifact. Such a Finding passes when
// every error `aftergrid check` reports is one the repository's own record accounts for:
//
//   1. A Check-level error — `check_failed` or `check_shape` — at a Check the halt reason names by its whole id.
//      The halt is a statement about that Check, and which of the two the Engine says can change as the contract
//      sharpens. `analytical_outcome` is NOT among them: that category means the Finding still records
//      `answered` over a falsifier that fired, which is the dishonest publication this whole contract exists to
//      stop. No recorded halt excuses it — the repair is the outcome, not a note about it.
//   2. A `hash_mismatch` on a `manifest.yaml#/definitions/<n>` pin, where the record NAMES that definition — in
//      the halt reason, or in a `stale_definitions: [<id>, …]` list in `analysis-progress.yaml`. That is the
//      INSTANCE moving on after the run: the definition file was improved, and this Finding is a faithful record
//      of the definition as it stood when it ran. Re-pinning it would mean editing committed run output to agree
//      with a file the run never saw. A new revision is the repair, and the run log says what it would change.
//      Unnamed, the tolerance would cover every definition at once, including one that moved for a reason nobody
//      wrote down.
//
// Every other error — a syntax or digest error, a hash mismatch on a result, an input or a Check FILE, an error
// on a Finding with no recorded halt, or a halt whose reason names no Check that actually failed — fails the
// run. A result or input whose bytes no longer match its pin is tampered evidence, and no halt excuses it.
// Exit 0 when every Finding is acceptable, 1 otherwise, 2 on usage.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// `permission_denied` is here for the same reason as the other two: a run the harness blocked records the
// halt when the progress file itself is writable, and that record accounts for the errors the same way.
const HALTS = new Set(["needs_attention", "needs_input", "permission_denied"]);

/** The recorded halt of a Finding directory, or null when none is recorded. */
export function recordedHalt(dir) {
  const p = join(dir, "analysis-progress.yaml");
  if (!existsSync(p)) return null;
  const y = parseYaml(readFileSync(p, "utf8"));
  if (!y || typeof y !== "object" || !HALTS.has(y.status)) return null;
  const stale = Array.isArray(y.stale_definitions) ? y.stale_definitions.map((d) => String(d)) : [];
  return { status: y.status, stage: y.stage ?? null, reason: String(y.reason ?? ""), stale_definitions: stale };
}

/** Categories that are the Engine saying something about one Check; the halt reason must name that Check. */
const CHECK_CATEGORIES = new Set(["check_failed", "check_shape"]);
/** A definition pin that moved because the Instance's definition file did. See the header. */
const DEFINITION_PIN = /^manifest\.yaml#\/definitions\/\d+$/;
/** `check`'s message for a moved definition pin carries the definition's id; that is what the record must name. */
const DEFINITION_ID = /^definition ([a-z][a-z0-9_]*) content changed/;

/**
 * Whether `text` names `id` as a whole word. A halt reason names a Check or a definition by its id, so a
 * substring match would let a reason about `falsifier_lift` account for an error at a Check called `lift`.
 */
function names(text, id) {
  return new RegExp(`(?:^|[^A-Za-z0-9_])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^A-Za-z0-9_]|$)`).test(text);
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
  const stale = halt.stale_definitions ?? [];
  const accounted = (e) => {
    const location = String(e.location);
    if (CHECK_CATEGORIES.has(e.category)) return names(halt.reason, location.replace(/^checks\//, "").replace(/\.sql$/, ""));
    if (e.category !== "hash_mismatch" || !DEFINITION_PIN.test(location)) return false;
    // Which definition moved is in the message, because the location is only its index in the manifest.
    const id = DEFINITION_ID.exec(String(e.message ?? ""))?.[1];
    return !!id && (stale.includes(id) || names(halt.reason, id));
  };
  const unexplained = errors.filter((e) => !accounted(e));
  if (unexplained.length) return { ok: false, why: `recorded halt does not explain: ${unexplained.map((e) => `${e.category} at ${e.location}`).join("; ")}` };
  return { ok: true, why: `recorded halt (${halt.status} at ${halt.stage}) accounts for every error: ${errors.map((e) => `${e.category} at ${e.location}`).join(", ")}` };
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
