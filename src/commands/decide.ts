// `aftergrid decide`: record one owner Decision against a reviewed Finding revision (docs/contracts/decide.md).
// Every field is supplied by the caller; nothing here infers an owner's intent. Merging, rendering or checking a
// Finding never creates a record. The command binds the record to the exact revision and content digest it was
// decided on, writes one immutable YAML file per record with create-if-absent semantics, and regenerates
// decisions.md as an index. Validation is the shared Finding validator plus the shared Decision schema
// (src/decisions.ts); neither is duplicated here.
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
// @ts-ignore: shared ESM validation library.
import { validateFinding, canon } from "../../scripts/lib/validate-finding.mjs";
// @ts-ignore: shared path containment.
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";
import { emptyReport, type Category, type Problem, type Report } from "../report.ts";
import { findInstance } from "../instance.ts";
import { decisionSchemaErrors, readDecisionRecords, validateDecisionsFor } from "../decisions.ts";
import { DECISION_ID_RE, mintDecisionId } from "../ids.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const INDEX_HEADER = `# Decision log

Generated index. Source of truth: one record per file under \`decisions/\` (\`schema/decision-record.schema.json\`). Never edit records; corrections append a superseding record.

| Record | Decided | Owner | Finding | Rests on | Action | Revisit | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
`;

export type DecideSchedule = { kind: "on_date" | "every"; date?: string; every_days?: number; timezone: string };
/** `finding_id` defaults to the Finding being decided on, which is the ordinary case. */
export type DecideFalsifier = { finding_id?: string; check_id: string; revision?: number };

export type DecideOptions = {
  owner: string;
  decidedOn: string;                 // yyyy-mm-dd, a real calendar date
  findingDir?: string;               // the Finding directory, or
  findingId?: string;                // its id (+ revision) inside the Instance
  findingRevision?: number;
  instanceDir?: string;              // where to start looking for aftergrid.yaml
  restsOnClaims: string[];
  action: { kind: "action" | "deliberate_inaction"; description: string };
  rationale: string;
  revisitWhen: { schedule?: DecideSchedule; falsifier?: DecideFalsifier };
  outcome?: { state: "pending" | "recorded"; description?: string; recorded_on?: string };
  supersedes?: string;
  id?: string;                       // supply to make a retry idempotent
  dryRun?: boolean;
  now?: () => Date;                  // injectable for tests
};

/** A real calendar date, not merely a date-shaped string: 2026-02-30 is rejected. */
function isCalendarDate(s: unknown): boolean {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(s + "T00:00:00Z");
  return Number.isFinite(t.getTime()) && t.toISOString().slice(0, 10) === s;
}

/**
 * A pure numeric UTC offset written as a zone: `+05:00`, `-0800`, `+5`, and the `Etc/GMT±n` family that ICU
 * accepts. These name an offset, not a place, so a stored date would not survive a change in the place's rules.
 */
const FIXED_OFFSET_ZONE = /^(?:[A-Za-z]+\/)?(?:GMT|UTC|UCT|UT)?[+-]\d{1,2}(?::?\d{2})?$/;

/**
 * A zone name the running ICU accepts (`Intl.DateTimeFormat`), minus fixed numeric offsets. ICU acceptance is the
 * only gate on which names exist, so the legacy IANA aliases it knows — `GMT`, `EST`, `EST5EDT`, `Japan`, `Zulu` —
 * are zone names and are accepted; `Mars/Phobos` is not and is refused. A schedule names a place, not an offset.
 */
export function isIanaTimezone(tz: unknown): boolean {
  if (typeof tz !== "string" || tz === "" || FIXED_OFFSET_ZONE.test(tz)) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

/** Record identity for idempotent retries: everything except the timestamp `decide` itself writes. */
export const recordIdentity = (rec: any): string => { const { recorded_at, ...rest } = rec ?? {}; return canon(rest); };

function findFindingDir(instanceRoot: string, id: string, revision?: number): string | null {
  let findings: string;
  try { findings = safePath(instanceRoot, "findings"); } catch { return null; }
  if (!existsSync(findings) || !lstatSync(findings).isDirectory()) return null;
  for (const name of readdirSync(findings).sort()) {
    let manifestPath: string;
    try { manifestPath = safePath(findings, `${name}/manifest.yaml`); } catch { continue; }
    if (!existsSync(manifestPath)) continue;
    let m: any;
    try { m = parseYaml(readFileSync(manifestPath, "utf8")); } catch { continue; }
    if (m?.finding?.id === id && (revision === undefined || m.finding.revision === revision)) return join(findings, name);
  }
  return null;
}

// ---- decisions.md index ----

const cell = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
/** The first clause of an action description, so the index stays one line; the record keeps the full text. */
function firstClause(text: string): string {
  const t = cell(text);
  const m = /^(.*?)[;.](?:\s|$)/.exec(t);
  const head = (m ? m[1]! : t).trim();
  return head.length > 100 ? head.slice(0, 99) + "…" : head;
}
function revisitCell(rec: any): string {
  const parts: string[] = [];
  const s = rec.revisit_when?.schedule;
  if (s?.kind === "on_date") parts.push(cell(s.date));
  else if (s?.kind === "every") parts.push(`every ${cell(s.every_days)} days`);
  const f = rec.revisit_when?.falsifier;
  if (f) parts.push(`when ${cell(f.check_id)} fails`);
  return parts.join(", or ") || "not stated";
}

/** Deterministic index over every record present: ordered by decided_on, then by id. */
export function renderDecisionIndex(records: any[]): string {
  const rows = [...records].sort((a, b) => String(a.decided_on).localeCompare(String(b.decided_on)) || String(a.id).localeCompare(String(b.id)));
  const supersededBy = new Map<string, string[]>();
  for (const r of rows) if (typeof r.supersedes === "string") supersededBy.set(r.supersedes, [...(supersededBy.get(r.supersedes) ?? []), r.id].sort());
  const line = (r: any) => {
    const by = supersededBy.get(r.id);
    const action = r.action?.kind === "deliberate_inaction" ? "Deliberate inaction: " + firstClause(r.action?.description ?? "") : firstClause(r.action?.description ?? "");
    const outcome = r.outcome?.state === "recorded" ? `recorded ${cell(r.outcome.recorded_on)}` : cell(r.outcome?.state ?? "pending");
    return `| ${cell(r.id)}${by ? ` (superseded by ${by.join(", ")})` : ""} | ${cell(r.decided_on)} | ${cell(r.owner)} | ${cell(r.finding?.id)} r${cell(r.finding?.revision)} | ${cell((r.rests_on_claims ?? []).join(", "))} | ${action} | ${revisitCell(r)} | ${outcome} |`;
  };
  return INDEX_HEADER + rows.map(line).join("\n") + (rows.length ? "\n" : "");
}

/** Write bytes at `path` through a temp file in the same directory, so a reader never sees a half-written file. */
function writeAtomic(dir: string, path: string, text: string) {
  const tmp = join(dir, `.tmp-${process.pid}-${randomBytes(6).toString("hex")}`);
  writeFileSync(tmp, text);
  try { renameSync(tmp, path); } catch (e) { rmSync(tmp, { force: true }); throw e; }
}

/**
 * Hold an exclusive lock around (read the directory, write the index) so a slow writer cannot publish an index
 * built from an older listing. Every record file is created before its writer takes this lock, so whoever holds
 * it last sees every record. Best effort: after the budget the index is rebuilt unlocked and the caller is told.
 */
async function withIndexLock<T>(dir: string, fn: (locked: boolean) => T): Promise<T> {
  const lock = join(dir, ".index.lock");
  const deadline = Date.now() + 5000;
  for (;;) {
    try { mkdirSync(lock); break; } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      try { if (Date.now() - statSync(lock).mtimeMs > 30_000) { rmSync(lock, { recursive: true, force: true }); continue; } } catch { /* the holder released it; retry */ }
      if (Date.now() > deadline) return fn(false);
      await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 10)));
    }
  }
  try { return fn(true); } finally { rmSync(lock, { recursive: true, force: true }); }
}

export async function decide(opts: DecideOptions): Promise<Report> {
  const report = emptyReport("decide");
  const err = (category: Category, location: string, message: string, remedy?: string) => report.errors.push({ category, location, message, remedy });
  const refuse = (): Report => { report.info.push("refused: nothing was written to the Decision log"); return dedupe(report); };

  // 1. The Instance and the exact Finding revision being decided on. An explicit `instanceDir` wins over the
  //    Finding directory, so naming the Instance is a real answer when the Finding directory is not inside one.
  const start = opts.instanceDir ?? opts.findingDir ?? process.cwd();
  const instance = findInstance(start);
  if (!instance) { err("missing_file", start, "no aftergrid.yaml found here or above", "pass --instance <dir>, or a Finding directory inside an Instance"); report.syntax = "invalid"; return refuse(); }
  let dir: string | null = null;
  if (opts.findingDir) dir = resolve(opts.findingDir);
  else if (opts.findingId) {
    dir = findFindingDir(instance.root, opts.findingId, opts.findingRevision);
    if (!dir) { err("unresolved_reference", "finding", `no Finding ${opts.findingId}${opts.findingRevision === undefined ? "" : ` r${opts.findingRevision}`} in ${instance.root}`, "check the id and revision, or pass the Finding directory"); return refuse(); }
  } else { err("syntax", "finding", "name the Finding to decide on", "pass a Finding directory, or an id and revision"); report.syntax = "invalid"; return refuse(); }
  if (!existsSync(join(dir, "manifest.yaml"))) { err("missing_file", join(dir, "manifest.yaml"), "manifest.yaml not found", "pass a Finding directory"); report.syntax = "invalid"; return refuse(); }

  // 2. The cited evidence must verify first: a Decision cites a Finding, it never certifies one.
  const v: any = validateFinding(dir, { instanceRoot: instance.root, repoRoot: REPO_ROOT });
  report.errors.push(...(v.errors as Problem[]));
  report.warnings.push(...(v.warnings as Problem[]));
  let manifest: any;
  try { manifest = parseYaml(readFileSync(safePath(dir, "manifest.yaml"), "utf8")); }
  catch (e) { err(e instanceof ContractError ? ((e as any).category as Category) : "invalid_artifact", "manifest.yaml", (e as Error).message); return refuse(); }
  report.finding = `${manifest.finding?.id} r${manifest.finding?.revision}`;
  report.state = manifest.finding?.state; report.outcome = manifest.finding?.outcome;
  report.content = manifest.finding?.state === "complete" ? "complete" : "incomplete";
  report.evidence = report.errors.length ? "invalid" : "valid";
  report.readiness = (v.readiness as Report["readiness"]) ?? "not_ready";
  report.readiness_reasons.push(...((v.reasons as string[]) ?? []));
  if (report.errors.length) {
    report.info.push("the cited Finding does not verify; `aftergrid check` reports it in full");
    return refuse();
  }
  if (report.content !== "complete") report.warnings.push({ category: "incomplete", location: "manifest.yaml#/finding/state", message: `the cited Finding is ${manifest.finding.state}/${manifest.finding.outcome}; the record pins that revision and its digest, and claims nothing more` });

  // 3. Build the record from what the caller supplied. Nothing is defaulted except a pending outcome and the id.
  const id = opts.id ?? mintDecisionId();
  if (!DECISION_ID_RE.test(id)) { err("syntax", "id", `'${id}' is not a Decision record id`, "use dec_ plus 12 lowercase base-36 characters, or omit --id to mint one"); report.syntax = "invalid"; return refuse(); }
  const now = (opts.now ?? (() => new Date()))();
  const record: any = {
    schema_version: "0.1.0",
    id,
    owner: opts.owner,
    decided_on: opts.decidedOn,
    finding: { id: manifest.finding.id, revision: manifest.finding.revision, content_digest: { algorithm: manifest.content_digest.algorithm, value: manifest.content_digest.value } },
    rests_on_claims: opts.restsOnClaims,
    action: { kind: opts.action?.kind, description: opts.action?.description },
    rationale: opts.rationale,
    revisit_when: {
      ...(opts.revisitWhen?.schedule ? { schedule: prune(opts.revisitWhen.schedule) } : {}),
      ...(opts.revisitWhen?.falsifier ? { falsifier: prune({ finding_id: opts.revisitWhen.falsifier.finding_id ?? manifest.finding?.id, check_id: opts.revisitWhen.falsifier.check_id, revision: opts.revisitWhen.falsifier.revision }) } : {}),
    },
    outcome: opts.outcome ? prune(opts.outcome) : { state: "pending" },
    ...(opts.supersedes ? { supersedes: opts.supersedes } : {}),
    recorded_at: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
  };

  // 4. Shape first (the shared schema), then the meanings the schema cannot express.
  const schemaProblems = decisionSchemaErrors(record, "record");
  if (schemaProblems.length) { report.errors.push(...schemaProblems); report.syntax = "invalid"; return refuse(); }
  if (!isCalendarDate(record.decided_on)) err("schema", "record#/decided_on", `${record.decided_on} is not a real calendar date`, "use an existing yyyy-mm-dd date");
  if (record.outcome.state === "recorded" && !isCalendarDate(record.outcome.recorded_on)) err("schema", "record#/outcome/recorded_on", `${record.outcome.recorded_on} is not a real calendar date`, "use an existing yyyy-mm-dd date");
  const schedule = record.revisit_when.schedule;
  if (schedule) {
    if (schedule.kind === "on_date" && !isCalendarDate(schedule.date)) err("schema", "record#/revisit_when/schedule/date", `${schedule.date} is not a real calendar date`, "use an existing yyyy-mm-dd date");
    if (!isIanaTimezone(schedule.timezone))
      err("value_type", "record#/revisit_when/schedule/timezone",
        typeof schedule.timezone === "string" && FIXED_OFFSET_ZONE.test(schedule.timezone)
          ? `'${schedule.timezone}' is a fixed UTC offset, not a zone name`
          : `'${schedule.timezone}' is not a timezone this runtime's ICU knows`,
        "use a zone name such as America/New_York or UTC; a fixed offset is not a zone");
  }
  for (const [i, cid] of (record.rests_on_claims as string[]).entries())
    if (!manifest.claims.some((c: any) => c.id === cid)) err("decision_binding", `record#/rests_on_claims/${i}`, `Claim ${cid} is not in ${manifest.finding.id} r${manifest.finding.revision}`, `cite Claim ids of the cited revision: ${manifest.claims.map((c: any) => c.id).join(", ") || "(none)"}`);
  const falsifier = record.revisit_when.falsifier;
  if (falsifier) {
    const targetRev = falsifier.revision ?? manifest.finding.revision;
    let target: any = manifest;
    if (falsifier.finding_id !== manifest.finding.id || targetRev !== manifest.finding.revision) {
      const other = findFindingDir(instance.root, falsifier.finding_id, targetRev);
      if (!other) { target = null; err("decision_binding", "record#/revisit_when/falsifier", `this Instance holds no ${falsifier.finding_id} r${targetRev}, so its Check cannot be verified`, "reference a falsifier Check of a Finding revision this Instance holds; decide never records a reference it cannot verify"); }
      else target = parseYaml(readFileSync(safePath(other, "manifest.yaml"), "utf8"));
    }
    if (target && !(target.checks ?? []).some((c: any) => c.id === falsifier.check_id && c.kind === "falsifier"))
      err("decision_binding", "record#/revisit_when/falsifier", `Check ${falsifier.check_id} is not a falsifier Check of ${falsifier.finding_id} r${targetRev}`, "reference the Question's falsifier check_id");
  }

  // 5. The decisions directory, the existing log, and the correction chain.
  let decisionsDir: string;
  try { decisionsDir = safePath(instance.root, "decisions"); }
  catch (e) { err(((e as any).category as Category) ?? "unsafe_path", "decisions", (e as Error).message); return refuse(); }
  if (existsSync(decisionsDir) && !lstatSync(decisionsDir).isDirectory()) { err("invalid_artifact", "decisions", "decisions is not a directory", "one Decision record per file lives in a decisions/ directory"); return refuse(); }
  if (!existsSync(decisionsDir) && !opts.dryRun) mkdirSync(decisionsDir, { recursive: true });
  const existing = existsSync(decisionsDir) ? readDecisionRecords(decisionsDir).records : new Map<string, { rec: any; loc: string }>();
  if (record.supersedes) {
    if (record.supersedes === id) err("decision_binding", "record#/supersedes", "a record cannot supersede itself", "name the record this one corrects");
    else if (!existing.has(record.supersedes)) err("decision_binding", "record#/supersedes", `no record ${record.supersedes} in the Decision log`, "a correction names an existing record; the superseded record is never edited");
  }
  if (report.errors.length) return refuse();

  const rel = `decisions/${id}.yaml`;
  const text = `# Decision record written by \`aftergrid decide\`. Immutable: corrections append a superseding record.\n` + toYaml(record, { lineWidth: 0 });

  // 5b. Whether the id is already taken, and by what, is a pure read, so a dry run answers it exactly as the real
  //     run does. A dry run that said "would be created" about a write the real run refuses would be a false preview.
  let dest: string;
  try { dest = safePath(decisionsDir, `${id}.yaml`); }
  catch (e) { err(((e as any).category as Category) ?? "unsafe_path", rel, (e as Error).message); return refuse(); }
  let taken: "absent" | "identical" = "absent";
  if (existsSync(dest)) {
    let prior: any;
    try { prior = parseYaml(readFileSync(dest, "utf8")); } catch (e) { err("syntax", rel, (e as Error).message); return refuse(); }
    if (recordIdentity(prior) !== recordIdentity(record)) {
      err("decision_conflict", rel, `a different Decision record already exists with id ${id}`, "a record is immutable: retry with the identical input, use a new id, or append a correction with --supersedes");
      return refuse();
    }
    taken = "identical";
  }

  if (opts.dryRun) {
    report.info.push(taken === "identical"
      ? `dry run: nothing written. ${rel} already holds this record byte-for-byte; the real run would be an idempotent retry and would regenerate ${join(instance.root, "decisions.md")}`
      : `dry run: nothing written. ${rel} would be created and ${join(instance.root, "decisions.md")} regenerated`);
    report.info.push(`proposed record:\n${text.trimEnd()}`);
    return dedupe(report);
  }

  // 6. Create-if-absent: the link succeeds only when nothing holds the name, so concurrent writers cannot
  //    overwrite one another. An identical retry is a success; different content under the same id is a conflict.
  //    The check above is not enough on its own: another writer can take the name between the read and the link.
  const tmp = join(decisionsDir, `.tmp-${id}-${process.pid}-${randomBytes(6).toString("hex")}`);
  let created = false;
  try {
    writeFileSync(tmp, text);
    try { linkSync(tmp, dest); created = true; }
    catch (e: any) { if (e.code !== "EEXIST") throw e; }
  } catch (e) {
    err("invalid_artifact", rel, `could not write the record: ${(e as Error).message}`);
    return refuse();
  } finally { rmSync(tmp, { force: true }); }
  if (created) report.info.push(`recorded ${id}: ${record.action.kind === "action" ? "action" : "deliberate inaction"} by ${record.owner} on ${record.decided_on}, resting on ${record.rests_on_claims.join(", ")} of ${record.finding.id} r${record.finding.revision}`);
  else {
    let prior: any;
    try { prior = parseYaml(readFileSync(dest, "utf8")); } catch (e) { err("syntax", rel, (e as Error).message); return written(report, id, dest); }
    if (recordIdentity(prior) !== recordIdentity(record)) {
      err("decision_conflict", rel, `a different Decision record already exists with id ${id}`, "a record is immutable: retry with the identical input, use a new id, or append a correction with --supersedes");
      return refuse();
    }
    report.info.push(`${id} already recorded with identical content; nothing written (idempotent retry)`);
  }
  report.info.push(`path: ${dest}`);

  // 7. Regenerate the index from whatever the directory now holds, then re-verify the log with the shared checker.
  //    The record is already on disk, so nothing here may throw out of the command: a refusal after this point is
  //    reported as a Problem, and it says the record exists so a retry names the same id instead of minting a second.
  const indexProblems: Problem[] = [];
  try {
    const indexPath = safePath(instance.root, "decisions.md");
    const locked = await withIndexLock(decisionsDir, (haveLock) => {
      const index = readDecisionRecords(decisionsDir);
      indexProblems.push(...index.errors);
      // Only a record that really is missing from the generated index is described as excluded from it.
      for (const p of index.errors) report.warnings.push(index.excluded.has(p.location.replace(/#.*$/, "")) ? { ...p, message: `${p.message} (excluded from the generated index)` } : p);
      report.warnings.push(...index.warnings);
      writeAtomic(instance.root, indexPath, renderDecisionIndex([...index.records.values()].map((x) => x.rec)));
      return haveLock;
    });
    report.info.push(`regenerated ${indexPath} from ${readdirSync(decisionsDir).filter((f) => f.endsWith(".yaml")).length} record file(s); the index is generated, never the source of truth`);
    if (!locked) report.warnings.push({ category: "invalid_artifact", location: "decisions.md", message: "another writer held the index lock; the index was rebuilt without it and may lag a concurrent record", remedy: "re-run decide, or regenerate the index, once writers are idle" });
  } catch (e) {
    err(e instanceof ContractError ? ((e as any).category as Category) : "invalid_artifact", "decisions.md",
      `the record was written but the index could not be regenerated: ${(e as Error).message}`,
      `fix decisions.md, then re-run decide with --id ${id} to regenerate the index without minting a second record`);
    return written(report, id, dest);
  }

  // Problems the shared checker finds in *other* records are real, but they are not this run's refusal: the record
  // this call was asked to write is on disk. They are reported as warnings so the exit code and `evidence` still
  // describe this run; `aftergrid check` reports the same problems as errors, which is where the log is adjudicated.
  const dc = validateDecisionsFor(instance.root, manifest);
  const mine = (p: Problem) => p.location === rel || p.location.startsWith(`${rel}#`);
  const alreadyReported = (p: Problem) => indexProblems.some((q) => q.category === p.category && q.location === p.location && q.message === p.message);
  report.errors.push(...dc.errors.filter(mine));
  report.warnings.push(...dc.errors.filter((p) => !mine(p) && !alreadyReported(p)).map((p) => ({ ...p, message: `${p.message} (a pre-existing record, not the one this run wrote; \`aftergrid check\` reports it as an error)` })));
  report.warnings.push(...dc.warnings);
  report.info.push(`${dc.records} Decision record(s) now cite ${manifest.finding.id}; revisit conditions are stored, never evaluated`);
  return dedupe(report);
}

/** A refusal raised after the record file is on disk: say so, and say how to retry without minting a second id. */
function written(report: Report, id: string, dest: string): Report {
  report.info.push(`the record was written before this problem: ${id} at ${dest}`);
  report.info.push(`nothing else was changed; re-run with --id ${id} once the problem is fixed, so the retry is idempotent`);
  return dedupe(report);
}

/** Drop undefined keys so the record YAML carries only what the caller supplied. */
function prune<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** The same problem can be reached through the index read and the shared checker; report it once. */
function dedupe(report: Report): Report {
  const once = (ps: Problem[]) => { const seen = new Set<string>(); return ps.filter((p) => { const k = `${p.category}|${p.location}|${p.message}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
  report.errors = once(report.errors); report.warnings = once(report.warnings);
  return report;
}
