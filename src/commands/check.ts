// `aftergrid check <finding-dir>`: four separate facts (syntax, content completeness, evidence validity,
// publication readiness) plus whether SQL was executed. Evidence validation is the shared library
// scripts/lib/validate-finding.mjs (hardened in the 2026-09-15 code review); this command adds the draft-aware
// completeness axis and the stable report shape. Artifact mode never executes SQL. Rerun mode is owned by
// ag-duckdb-execute-check-ypl and is reported as not performed until it lands.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
// @ts-ignore: shared ESM validation library.
import { validateFinding } from "../../scripts/lib/validate-finding.mjs";
import { emptyReport, type Problem, type Report } from "../report.ts";

const REPO_ROOT = resolve(new URL("../../", import.meta.url).pathname);
export type CheckOptions = { dir: string; mode?: "artifact" | "rerun" };

export function check(opts: CheckOptions): Report {
  const report = emptyReport("check");
  const dir = resolve(opts.dir);
  if (!existsSync(join(dir, "manifest.yaml"))) {
    report.errors.push({ category: "missing_file", location: join(dir, "manifest.yaml"), message: "manifest.yaml not found", remedy: "pass a Finding directory" });
    report.syntax = "invalid"; return report;
  }
  const out = validateFinding(dir, { repoRoot: REPO_ROOT });
  report.errors.push(...(out.errors as Problem[]));
  report.warnings.push(...(out.warnings as Problem[]));
  report.info.push(...(out.info as string[]));
  report.syntax = report.errors.some((e) => e.category === "schema" || (e.category === "invalid_artifact" && /YAML|parse/i.test(e.message))) ? "invalid" : "ok";
  if (out.finding) { report.finding = out.finding; report.state = out.state; report.outcome = out.outcome; }
  if (report.syntax === "invalid") return report;

  // Content completeness: what a draft still lacks, named, never invented.
  let manifest: any = null;
  try { manifest = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8")); } catch { /* reported above */ }
  if (manifest && manifest.finding.state !== "complete") {
    const missing: string[] = [];
    if (manifest.question?.state !== "resolved") missing.push(`question unresolved: ${(manifest.question?.unresolved ?? []).join(", ") || "unspecified"}`);
    if (!manifest.claims?.length) missing.push("no Claims");
    if (!manifest.snapshot?.inputs?.length) missing.push("no retained inputs");
    if (!manifest.executions?.length) missing.push("no executions");
    for (const n of manifest.finding.needs_input ?? []) missing.push(`needs input (${n.kind}, owner ${n.owner}): ${n.description}`);
    if (existsSync(join(dir, "memo.md")) && /_Not written yet\._/.test(readFileSync(join(dir, "memo.md"), "utf8"))) missing.push("memo sections not written");
    report.content = "incomplete";
    for (const m of missing) report.warnings.push({ category: "incomplete", location: "manifest.yaml", message: m });
  } else if (manifest) {
    report.content = "complete";
  }

  report.evidence = report.errors.length ? "invalid" : "valid";
  report.sql_execution = "not_performed";
  if (out.recordedCheckOutcomes) report.info.push("recorded Check outcomes (history, not re-executed): " + Object.entries(out.recordedCheckOutcomes).map(([k, v]) => `${k}=${v}`).join(", "));
  if (opts.mode === "rerun") report.info.push("rerun mode requested: SQL re-execution is owned by ag-duckdb-execute-check-ypl; nothing was executed");
  report.readiness = (out.readiness as Report["readiness"]) ?? "not_ready";
  report.readiness_reasons.push(...((out.reasons as string[]) ?? []));
  if (manifest && manifest.finding.state !== "complete" && !report.readiness_reasons.includes("not complete")) report.readiness_reasons.unshift("not complete");
  if (report.errors.length) report.readiness = "not_ready";
  return report;
}
