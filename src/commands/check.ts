// `aftergrid check <finding-dir>`: reports syntax, content completeness, evidence validity and publication
// readiness as separate axes. This revision implements syntax (JSON Schema), completeness and readiness.
// Evidence validity (references, hashes, template, chart subset, digest) is reported as not_evaluated until the
// hardened validation library lands (scripts/lib, code review 2026-09-15); it is never reported as valid by default.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { contentDigest } from "../digest.ts";
// @ts-ignore: shared ESM helpers from the hardened fixture tooling (structure, path containment, id uniqueness).
import { validateStructure, ContractError } from "../../scripts/fixture-safety.mjs";
import { findInstance } from "../instance.ts";
import { emptyReport, type Report } from "../report.ts";

const SCHEMA_PATH = new URL("../../schema/finding-manifest.schema.json", import.meta.url);

export type CheckOptions = { dir: string; mode?: "artifact" | "rerun" };

export function check(opts: CheckOptions): Report {
  const report = emptyReport("check");
  const err = (category: Report["errors"][number]["category"], location: string, message: string, remedy?: string) => report.errors.push({ category, location, message, remedy });
  const dir = resolve(opts.dir);
  const manifestPath = join(dir, "manifest.yaml");
  if (!existsSync(manifestPath)) { err("missing_file", manifestPath, "manifest.yaml not found", "pass a Finding directory"); report.syntax = "invalid"; return report; }
  let manifest: any;
  try { manifest = parseYaml(readFileSync(manifestPath, "utf8")); }
  catch (e) { err("syntax", manifestPath, `YAML does not parse: ${(e as Error).message.split("\n")[0]}`); report.syntax = "invalid"; return report; }

  const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv);
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  if (!ajv.validate(schema, manifest)) {
    for (const e of ajv.errors ?? []) err("schema", "manifest.yaml#" + e.instancePath, e.message ?? "invalid", "fix against schema/finding-manifest.schema.json");
    report.syntax = "invalid"; return report;
  }
  report.finding = `${manifest.finding.id} r${manifest.finding.revision}`;
  report.state = manifest.finding.state; report.outcome = manifest.finding.outcome;

  // Content completeness: what is missing before evidence can even be judged.
  const missing: string[] = [];
  if (manifest.finding.state !== "complete") {
    if (manifest.question.state !== "resolved") missing.push(`question unresolved: ${(manifest.question.unresolved ?? []).join(", ") || "unspecified"}`);
    if (manifest.claims.length === 0) missing.push("no Claims");
    if (manifest.snapshot.inputs.length === 0) missing.push("no retained inputs");
    if (manifest.executions.length === 0) missing.push("no executions");
    for (const n of manifest.finding.needs_input ?? []) missing.push(`needs input (${n.kind}, owner ${n.owner}): ${n.description}`);
    if (!existsSync(join(dir, "memo.md"))) missing.push("memo.md");
    else if (/_Not written yet\._/.test(readFileSync(join(dir, "memo.md"), "utf8"))) missing.push("memo sections not written");
    report.content = "incomplete";
    for (const m of missing) report.warnings.push({ category: "incomplete", location: "manifest.yaml", message: m });
  } else {
    report.content = "complete";
  }

  // Structure: unique ids, contained paths, no collisions (shared with the fixture tooling), then digest currency.
  // Evidence as a whole stays not_evaluated in this revision.
  const instance = findInstance(dir);
  try {
    validateStructure(manifest, dir, instance?.root ?? dir);
    const d = contentDigest(manifest, dir);
    if (d.value !== manifest.content_digest.value) err("digest", "manifest.yaml#/content_digest", "content digest does not match current content", "re-pin after editing (check --pin, not implemented yet) or restore the content");
  } catch (e) {
    if (e instanceof ContractError) err((e as any).category, String((e as any).location), e.message, "fix the manifest path or id");
    else err("missing_file", dir, `cannot hash content: ${(e as Error).message}`);
  }
  report.evidence = "not_evaluated";
  report.info.push("evidence validity (references, hashes, template, chart subset) is not evaluated by this revision; use scripts/fixture-tool.mjs validate until the validation library is integrated");
  report.sql_execution = "not_performed";
  if (opts.mode === "rerun") report.info.push("rerun mode requested: SQL re-execution is owned by ag-duckdb-execute-check-ypl; nothing was executed");

  // Publication readiness: never inferred from the manifest alone.
  const approvals = (manifest.attestations ?? []).filter((a: any) => a.kind === "publication_approval");
  if (manifest.finding.state !== "complete") report.readiness_reasons.push("not complete");
  if (approvals.length === 0) report.readiness_reasons.push("no publication_approval attestation");
  for (const [i, a] of approvals.entries()) {
    if (a.content_digest.value !== manifest.content_digest.value) err("stale_attestation", `manifest.yaml#/attestations/${i}`, "attestation binds a different digest", "re-approve at the current content");
    else if (a.source.type !== "github_pr_review") report.readiness_reasons.push(`attestation ${i}: source ${a.source.type} is not a trusted type`);
    else report.readiness_reasons.push(`attestation ${i}: github_pr_review must be verified through the API against the trusted allowlist (ag-publication-binding-6r0); not verified here`);
  }
  report.readiness = manifest.finding.state === "complete" && approvals.some((a: any) => a.source.type === "github_pr_review" && a.content_digest.value === manifest.content_digest.value) ? "unknown" : "not_ready";
  return report;
}
