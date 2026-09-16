// Decision records (schema/decision-record.schema.json) cite an exact Finding revision and Claim ids.
// `check` validates every record in the Instance that cites the Finding being checked. Ids are compared only
// against the very revision the record cites; a record citing another revision is reported as unverified here,
// never as wrong, because a Decision stands on what was decided on. Revisit conditions are never evaluated.
import { existsSync, readdirSync, readFileSync, lstatSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { Problem } from "./report.ts";
// @ts-ignore: shared path containment.
import { safePath, ContractError } from "../scripts/fixture-safety.mjs";

const SCHEMA = new URL("../schema/decision-record.schema.json", import.meta.url);

export type DecisionCheck = { records: number; unverified: number; errors: Problem[]; warnings: Problem[] };
/**
 * Every parsed record in a decisions directory, indexed by record id, with the problems reading them raised.
 * `excluded` holds the locations of record files that are NOT in `records` (unparseable, not an object, no usable
 * `id`, or a duplicate id), so a caller that generates an index from `records` can say truthfully which files it left out.
 */
export type DecisionIndex = { records: Map<string, { rec: any; loc: string }>; excluded: Set<string>; errors: Problem[]; warnings: Problem[] };

let validator: ((rec: unknown) => boolean) & { errors?: any[] } | null = null;

/** Schema problems for one Decision record, as report entries. Empty when valid. The single place the schema is read. */
export function decisionSchemaErrors(rec: unknown, loc: string): Problem[] {
  if (!validator) {
    const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv);
    validator = ajv.compile(JSON.parse(readFileSync(SCHEMA, "utf8"))) as typeof validator;
  }
  if (validator!(rec)) return [];
  return (validator!.errors ?? []).map((e: any) => ({ category: "schema" as const, location: `${loc}#${e.instancePath}`, message: e.message ?? "invalid", remedy: "fix against schema/decision-record.schema.json" }));
}

/**
 * Read every `<dec_id>.yaml` in a decisions directory. Records are indexed by their own `id`, so `supersedes`
 * resolves by record identity rather than by file name; the file-name/id agreement is reported separately.
 * A record file that cannot be indexed is always reported and always listed in `excluded` — never dropped in
 * silence, because a record that disappears from every report is exactly the tamper the digest pinning exists to catch.
 * Shared by `check` (src/commands/check.ts) and `decide` (src/commands/decide.ts).
 */
export function readDecisionRecords(dir: string): DecisionIndex {
  const out: DecisionIndex = { records: new Map(), excluded: new Set(), errors: [], warnings: [] };
  const entries = readdirSync(dir).sort();
  for (const other of entries) if (other.endsWith(".yml")) out.warnings.push({ category: "invalid_artifact", location: `decisions/${other}`, message: "Decision records use the .yaml extension; this file is ignored" });
  for (const name of entries.filter((f) => f.endsWith(".yaml"))) {
    const loc = `decisions/${name}`;
    let rec: any;
    try { rec = parseYaml(readFileSync(safePath(dir, name), "utf8")); }
    catch (e) { out.excluded.add(loc); out.errors.push({ category: e instanceof ContractError ? (e as any).category : "syntax", location: loc, message: (e as Error).message }); continue; }
    if (!rec || typeof rec !== "object") { out.excluded.add(loc); out.errors.push({ category: "invalid_artifact", location: loc, message: "not a record" }); continue; }
    if (typeof rec.id !== "string") {
      out.excluded.add(loc);
      out.errors.push({ category: "schema", location: `${loc}#/id`, message: `record has no string id (${rec.id === undefined ? "the key is absent" : `it is ${typeof rec.id}`}), so it cannot be indexed, bound-checked or superseded`, remedy: "every record carries its own dec_ id, and the file is named by it" });
      continue;
    }
    if (out.records.has(rec.id)) { out.excluded.add(loc); out.errors.push({ category: "duplicate_id", location: loc, message: `record id ${rec.id} also appears in ${out.records.get(rec.id)!.loc}` }); }
    else out.records.set(rec.id, { rec, loc });
    if (rec.id !== name.replace(/\.yaml$/, "")) out.errors.push({ category: "decision_binding", location: loc, message: `file name does not match record id ${rec.id}`, remedy: "one file per record, named by its id" });
  }
  return out;
}

export function validateDecisionsFor(instanceRoot: string, manifest: any): DecisionCheck {
  const out: DecisionCheck = { records: 0, unverified: 0, errors: [], warnings: [] };
  let dir: string;
  try { dir = safePath(instanceRoot, "decisions"); }
  catch (e) { out.errors.push({ category: (e as any).category ?? "unsafe_path", location: "decisions", message: (e as Error).message }); return out; }
  if (!existsSync(dir)) return out;
  if (!lstatSync(dir).isDirectory()) { out.errors.push({ category: "invalid_artifact", location: "decisions", message: "decisions is not a directory" }); return out; }

  const index = readDecisionRecords(dir);
  out.errors.push(...index.errors); out.warnings.push(...index.warnings);
  const records = index.records;

  for (const [, { rec, loc }] of records) {
    if (rec.finding?.id !== manifest.finding.id) continue;
    out.records++;
    const schemaProblems = decisionSchemaErrors(rec, loc);
    if (schemaProblems.length) { out.errors.push(...schemaProblems); continue; }
    // Binding is verified only against the exact revision this directory holds.
    if (rec.finding.revision !== manifest.finding.revision) {
      out.unverified++;
      out.warnings.push({ category: "decision_binding", location: `${loc}#/finding/revision`, message: `record cites revision ${rec.finding.revision}; this directory holds revision ${manifest.finding.revision}, so its Claim and falsifier bindings are not verified here` });
    } else {
      if (rec.finding.content_digest.value !== manifest.content_digest.value)
        out.errors.push({ category: "decision_binding", location: `${loc}#/finding/content_digest`, message: `record cites revision ${rec.finding.revision} at a different content digest than this directory pins`, remedy: "content changed after the decision without a revision bump; restore the content or bump the revision. Never edit the Decision record to fit" });
      for (const [i, cid] of (rec.rests_on_claims as string[]).entries())
        if (!manifest.claims.some((c: any) => c.id === cid)) out.errors.push({ category: "decision_binding", location: `${loc}#/rests_on_claims/${i}`, message: `Claim ${cid} is not in revision ${manifest.finding.revision}`, remedy: "cite Claim ids that exist in the cited revision" });
      const f = rec.revisit_when?.falsifier;
      if (f) {
        const targetRev = f.revision ?? rec.finding.revision;
        if (f.finding_id === manifest.finding.id && targetRev === manifest.finding.revision) {
          if (!manifest.checks.some((c: any) => c.id === f.check_id && c.kind === "falsifier"))
            out.errors.push({ category: "decision_binding", location: `${loc}#/revisit_when/falsifier`, message: `Check ${f.check_id} is not a falsifier Check of the cited revision`, remedy: "reference the Question's falsifier check_id" });
        } else {
          out.unverified++;
          out.warnings.push({ category: "decision_binding", location: `${loc}#/revisit_when/falsifier`, message: `falsifier references ${f.finding_id} r${targetRev}, which is not the Finding being checked; binding not verified here` });
        }
      }
    }
    // Correction chains: predecessor must be a different, existing record and the chain must not loop.
    if (rec.supersedes) {
      const seen = new Set<string>([rec.id]);
      let cur: string | undefined = rec.supersedes;
      while (cur) {
        if (seen.has(cur)) { out.errors.push({ category: "decision_binding", location: `${loc}#/supersedes`, message: cur === rec.id ? "a record cannot supersede itself" : `correction chain loops at ${cur}` }); break; }
        const prev = records.get(cur);
        if (!prev) { out.errors.push({ category: "decision_binding", location: `${loc}#/supersedes`, message: `superseded record ${cur} not found` }); break; }
        if (prev.rec.finding?.id !== rec.finding.id) out.warnings.push({ category: "decision_binding", location: `${loc}#/supersedes`, message: `superseded record ${cur} cites a different Finding` });
        seen.add(cur); cur = prev.rec.supersedes;
      }
    }
  }
  return out;
}
