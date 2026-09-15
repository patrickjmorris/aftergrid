// Decision records (schema/decision-record.schema.json) cite an exact Finding revision and Claim ids.
// `check` validates every record in the Instance that cites the Finding being checked: shape, binding to the
// revision's pinned digest, Claim ids, and the falsifier Check reference. It never evaluates a revisit condition.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { Problem } from "./report.ts";

const SCHEMA = new URL("../schema/decision-record.schema.json", import.meta.url);

export type DecisionCheck = { records: number; errors: Problem[]; warnings: Problem[] };

export function validateDecisionsFor(instanceRoot: string, manifest: any): DecisionCheck {
  const out: DecisionCheck = { records: 0, errors: [], warnings: [] };
  const dir = join(instanceRoot, "decisions");
  if (!existsSync(dir)) return out;
  const ajv = new Ajv2020({ allErrors: true, strict: false, discriminator: true }); addFormats(ajv);
  const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
  const claimIds = new Set((manifest.claims ?? []).map((c: any) => c.id));
  const falsifierChecks = new Set((manifest.checks ?? []).filter((c: any) => c.kind === "falsifier").map((c: any) => c.id));
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml")).sort()) {
    const loc = `decisions/${name}`;
    let rec: any;
    try { rec = parseYaml(readFileSync(join(dir, name), "utf8")); }
    catch (e) { out.errors.push({ category: "syntax", location: loc, message: `YAML does not parse: ${(e as Error).message.split("\n")[0]}` }); continue; }
    if (!rec || rec.finding?.id !== manifest.finding.id) continue;
    out.records++;
    if (!ajv.validate(schema, rec)) {
      for (const e of ajv.errors ?? []) out.errors.push({ category: "schema", location: `${loc}#${e.instancePath}`, message: e.message ?? "invalid", remedy: "fix against schema/decision-record.schema.json" });
      continue;
    }
    if (rec.id !== name.replace(/\.ya?ml$/, "")) out.errors.push({ category: "decision_binding", location: loc, message: `file name does not match record id ${rec.id}`, remedy: "one file per record, named by its id" });
    if (rec.finding.revision === manifest.finding.revision) {
      if (rec.finding.content_digest.value !== manifest.content_digest.value)
        out.errors.push({ category: "decision_binding", location: `${loc}#/finding/content_digest`, message: `record cites revision ${rec.finding.revision} at a different content digest than the one pinned now`, remedy: "the cited content changed after the decision; the decision stands on what was decided on, so record a new revision and a superseding record rather than editing this one" });
    } else if (rec.finding.revision > manifest.finding.revision) {
      out.errors.push({ category: "decision_binding", location: `${loc}#/finding/revision`, message: `record cites revision ${rec.finding.revision}, which does not exist yet (current ${manifest.finding.revision})` });
    } else {
      out.warnings.push({ category: "decision_binding", location: `${loc}#/finding/revision`, message: `record cites an earlier revision ${rec.finding.revision}; a Revisit compares it against the current one` });
    }
    for (const [i, cid] of (rec.rests_on_claims as string[]).entries())
      if (!claimIds.has(cid)) out.errors.push({ category: "decision_binding", location: `${loc}#/rests_on_claims/${i}`, message: `Claim ${cid} is not in the cited Finding`, remedy: "cite Claim ids that exist in the revision" });
    const f = rec.revisit_when?.falsifier;
    if (f && f.finding_id === manifest.finding.id && !falsifierChecks.has(f.check_id))
      out.errors.push({ category: "decision_binding", location: `${loc}#/revisit_when/falsifier`, message: `Check ${f.check_id} is not a falsifier Check of the cited Finding`, remedy: "reference the Question's falsifier check_id" });
    if (rec.supersedes && !existsSync(join(dir, `${rec.supersedes}.yaml`)))
      out.errors.push({ category: "decision_binding", location: `${loc}#/supersedes`, message: `superseded record ${rec.supersedes} not found` });
  }
  return out;
}
