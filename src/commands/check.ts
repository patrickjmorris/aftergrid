// `aftergrid check <finding-dir>`: four separate facts (syntax, content completeness, evidence validity,
// publication readiness) plus whether SQL was executed. Evidence validation is the shared library
// scripts/lib/validate-finding.mjs (hardened in the 2026-09-15 code review); this command adds the draft-aware
// completeness axis and the stable report shape. Artifact mode never executes SQL. Rerun mode is owned by
// ag-duckdb-execute-check-ypl and is reported as not performed until it lands.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
// @ts-ignore: shared ESM validation library.
import { validateFinding } from "../../scripts/lib/validate-finding.mjs";
// @ts-ignore: shared path containment.
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";
import { emptyReport, type Problem, type Report } from "../report.ts";
import { findInstance } from "../instance.ts";
import { validateDecisionsFor } from "../decisions.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export type CheckOptions = { dir: string; mode?: "artifact" | "rerun" };

export function check(opts: CheckOptions): Report {
  const report = emptyReport("check");
  const dir = resolve(opts.dir);
  if (!existsSync(join(dir, "manifest.yaml"))) {
    report.errors.push({ category: "missing_file", location: join(dir, "manifest.yaml"), message: "manifest.yaml not found", remedy: "pass a Finding directory" });
    report.syntax = "invalid"; return report;
  }
  if (opts.mode === "rerun") {
    report.errors.push({ category: "not_implemented", location: "--mode rerun", message: "retained-input rerun is not implemented in this revision (ag-duckdb-execute-check-ypl)", remedy: "use --mode artifact, or scripts/fixture-tool.mjs build for fixtures" });
    return report;
  }
  const out = validateFinding(dir, { repoRoot: REPO_ROOT });
  report.errors.push(...(out.errors as Problem[]));
  report.warnings.push(...(out.warnings as Problem[]));
  report.info.push(...(out.info as string[]));
  const STOP = new Set(["schema", "invalid_artifact", "unsafe_path", "path_collision", "duplicate_id", "syntax"]);
  report.syntax = report.errors.some((e) => e.category === "schema" || e.category === "syntax" || (e.category === "invalid_artifact" && /YAML|parse/i.test(e.message))) ? "invalid" : "ok";
  if (out.finding) { report.finding = out.finding; report.state = out.state; report.outcome = out.outcome; }
  // After a structural rejection nothing further is read from the directory.
  if (report.errors.some((e) => STOP.has(e.category))) { report.readiness = "not_ready"; report.readiness_reasons.push("structural errors"); return report; }

  // Content completeness: what a draft still lacks, named, never invented. Reads go through safePath only.
  let manifest: any = null;
  try { manifest = parseYaml(readFileSync(safePath(dir, "manifest.yaml"), "utf8")); }
  catch (e) { report.errors.push({ category: e instanceof ContractError ? (e as any).category : "invalid_artifact", location: "manifest.yaml", message: (e as Error).message }); return report; }
  if (manifest && manifest.finding.state !== "complete") {
    const missing: string[] = [];
    if (manifest.question?.state !== "resolved") missing.push(`question unresolved: ${(manifest.question?.unresolved ?? []).join(", ") || "unspecified"}`);
    if (!manifest.claims?.length) missing.push("no Claims");
    if (!manifest.snapshot?.inputs?.length) missing.push("no retained inputs");
    if (!manifest.executions?.length) missing.push("no executions");
    for (const n of manifest.finding.needs_input ?? []) missing.push(`needs input (${n.kind}, owner ${n.owner}): ${n.description}`);
    try { const mp = safePath(dir, "memo.md"); if (existsSync(mp) && /_Not written yet\._/.test(readFileSync(mp, "utf8"))) missing.push("memo sections not written"); } catch { /* an unsafe memo path was already rejected above */ }
    report.content = "incomplete";
    for (const m of missing) report.warnings.push({ category: "incomplete", location: "manifest.yaml", message: m });
  } else if (manifest) {
    report.content = "complete";
  }

  // Decision records that cite this Finding must bind to it exactly (ADR 0009 schema, v0).
  if (manifest) {
    const inst = findInstance(dir);
    if (inst) {
      const dc = validateDecisionsFor(inst.root, manifest);
      report.errors.push(...dc.errors); report.warnings.push(...dc.warnings);
      if (dc.records) report.info.push(`${dc.records} Decision record(s) cite this Finding; bindings checked, revisit conditions not evaluated`);
    }
  }
  report.evidence = report.errors.length ? "invalid" : "valid";
  report.sql_execution = "not_performed";
  if (out.recordedCheckOutcomes) report.info.push("recorded Check outcomes (history, not re-executed): " + Object.entries(out.recordedCheckOutcomes).map(([k, v]) => `${k}=${v}`).join(", "));
  report.readiness = (out.readiness as Report["readiness"]) ?? "not_ready";
  report.readiness_reasons.push(...((out.reasons as string[]) ?? []));
  if (manifest && manifest.finding.state !== "complete" && !report.readiness_reasons.includes("not complete")) report.readiness_reasons.unshift("not complete");
  if (report.errors.length) report.readiness = "not_ready";
  return report;
}
