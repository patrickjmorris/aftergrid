// `aftergrid record <finding-dir> --execution <id> --result <file> --tool <name> [--sql <file|inline>] [--params k=v …]`
// `aftergrid record <finding-dir> --check <id> --outcome pass|fail|not_run|error --tool <name> [--evidence <file>]`
//
// The recorded data path (ADR 0010, docs/contracts/record.md). The Operator's harness owns the connection: it
// runs the SQL with whatever tool it has, and this command writes down what it ran and what came back. aftergrid
// executes nothing here — `sql_execution` is `not_performed` on every report this command produces, and that is
// the point, not a gap.
//
// What it pins: the query text, the parameters, the result set in the canonical result format, and the hashes of
// all three; who ran it (`executions[].executed_by`, `kind: harness`, with the tool the Operator named); and the
// content digest. What it refuses to claim: `analysis_rerun`. A recorded Finding's `snapshot.guarantees` is
// exactly `[artifact_replay]` — the saved bytes can be replayed, and nothing can be rerun, because nothing was
// retained. `check --mode rerun` refuses such a Finding with `rerun_unavailable` rather than pretend otherwise.
//
// Four refusals, none of them behind a flag:
//   - **A revision carrying attestations.** Evidence is inside the content digest an approval binds to, so
//     recording into an approved revision would silently invalidate it. The answer is a new revision, exactly as
//     `capture` says.
//   - **An agent-reported `pass` with nothing behind it.** A Check outcome the Engine did not execute may only be
//     recorded as `pass` with an evidence file, which is copied into the Finding and pinned by hash.
//   - **An execution that names retained inputs.** Those extracts are what `execute` reads; a harness-recorded
//     execution read the Operator's source instead, and saying otherwise would put a false provenance in the
//     digest.
//   - **A result that does not match its declared shape.** Columns, types, row key and nullability are checked by
//     the same `validateResult` the adapter path uses. Nothing is written when it fails.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { parseDocument } from "yaml";
import { emptyReport, type Problem, type Report } from "../report.ts";
import { findInstance } from "../instance.ts";
import { AdapterError } from "../adapters/contract.ts";
import { serializeResult, type DeclaredColumn } from "../adapters/serialize.ts";
import { contentDigest, sha256 } from "../digest.ts";
import { validateAnalysisFile } from "../analysis/validate.ts";
// @ts-ignore: the shared digest envelope, as `check`, `execute` and the fixture build compute it.
import { digestOf } from "../../scripts/lib/validate-finding.mjs";
// @ts-ignore: shared path containment and structural rules.
import { safePath, validateStructure, validateResult, ContractError } from "../../scripts/fixture-safety.mjs";

export type RecordOptions = {
  dir: string;
  instanceDir?: string;
  /** The tool the harness actually used, as the Operator names it. Never defaulted: aftergrid does not guess. */
  tool: string;
  toolVersion?: string;
  /** Recording one execution. */
  execution?: string;
  /** A SQL file to copy into the declared query path, or the SQL text itself when no such file exists. */
  sql?: string;
  /** The result the harness produced: `.json` (canonical, `{columns,rows}`, or an array of rows) or `.csv`. */
  result?: string;
  /** `key=value` parameter pins, merged into the execution's recorded parameters. */
  params?: string[];
  /** When the harness ran it. Defaults to now; never invented as something earlier. */
  executedAt?: string;
  /** Recording one agent-reported Check outcome. */
  check?: string;
  outcome?: string;
  evidence?: string;
  /** Test seam: the clock. */
  now?: () => Date;
};

const KNOWN = new Set([
  "missing_file", "unsafe_path", "path_collision", "duplicate_id", "hash_mismatch", "sql_parameter", "check_shape",
  "result_shape", "value_type", "row_key", "duplicate_row_key", "null_value", "execution_binding", "derived_arity",
  "definition_version", "unresolved_reference", "invalid_artifact", "unit_mismatch",
]);
const categoryOf = (e: unknown): Problem["category"] => {
  const c = (e as any)?.category;
  if ((e instanceof AdapterError || e instanceof ContractError) && KNOWN.has(c)) return c as Problem["category"];
  if ((e as any)?.code === "ENOENT") return "missing_file";
  return "invalid_artifact";
};

const OUTCOMES = new Set(["pass", "fail", "not_run", "error"]);
const stamp = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** One RFC 4180 record set: a header row of column names plus typed-by-declaration rows. */
export function parseCsv(text: string): { columns: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, started = false;
  const endField = () => { row.push(field); field = ""; started = false; };
  const endRow = () => { endField(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
      continue;
    }
    if (c === '"' && !started && field === "") { quoted = true; started = true; continue; }
    if (c === ",") { endField(); continue; }
    if (c === "\r") continue;
    if (c === "\n") { endRow(); continue; }
    field += c; started = true;
  }
  if (field !== "" || row.length) endRow();
  while (rows.length && rows[rows.length - 1]!.every((f) => f === "")) rows.pop();
  if (!rows.length) throw new ContractError("result_shape", "--result", "the CSV is empty: a result file carries a header row of column names");
  return { columns: rows[0]!.map((c) => c.trim()), rows: rows.slice(1) };
}

/**
 * The harness's result file, as `{ columns, rows }` in the shape `serializeResult` consumes. A CSV cell is text,
 * so it is converted by the column's DECLARED type and never guessed: an empty field is SQL NULL, `true`/`false`
 * is a boolean, an integer column is a number, and everything else stays the string the tool wrote. A value the
 * declared type cannot hold is left alone so `serializeResult` reports `value_type` on it.
 */
export function readResultFile(path: string, declared: DeclaredColumn[]): { columns: { name: string }[]; rows: Record<string, unknown>[] } {
  const full = resolve(path);
  if (!existsSync(full)) throw new ContractError("missing_file", path, `the result file ${path} does not exist`);
  const text = readFileSync(full, "utf8");
  const names = declared.map((c) => c.name);
  if (extname(full).toLowerCase() === ".csv") {
    const { columns, rows } = parseCsv(text);
    const typeOf = (name: string) => declared.find((c) => c.name === name)?.type;
    const cell = (raw: string, type: DeclaredColumn["type"] | undefined): unknown => {
      if (raw === "") return null;
      if (type === "integer") { const n = Number(raw); return Number.isFinite(n) ? n : raw; }
      if (type === "boolean") return raw === "true" ? true : raw === "false" ? false : raw;
      return raw;
    };
    return {
      columns: columns.map((name) => ({ name })),
      rows: rows.map((r) => Object.fromEntries(columns.map((name, i) => [name, cell(r[i] ?? "", typeOf(name))]))),
    };
  }
  let data: unknown;
  try { data = JSON.parse(text); }
  catch (e) { throw new ContractError("result_shape", path, `the result file is not readable JSON: ${(e as Error).message}`); }
  if (Array.isArray(data)) return { columns: names.map((name) => ({ name })), rows: data as Record<string, unknown>[] };
  const o = data as { columns?: unknown; rows?: unknown };
  if (!o || typeof o !== "object" || !Array.isArray(o.rows)) {
    throw new ContractError("result_shape", path, "expected an array of rows, or an object with `columns` and `rows` (the canonical result format)");
  }
  const columns = Array.isArray(o.columns)
    ? (o.columns as unknown[]).map((c) => ({ name: typeof c === "string" ? c : String((c as { name?: unknown })?.name ?? "") }))
    : names.map((name) => ({ name }));
  return { columns, rows: o.rows as Record<string, unknown>[] };
}

/** A parameter value as the manifest holds it: a JSON scalar when the text is one, otherwise the text itself. */
function paramValue(raw: string): string | number | boolean | null {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

/** The evidence file's destination inside the Finding. The extension is kept only when it is plainly an extension. */
export function evidenceDestination(checkId: string, source: string): string {
  const ext = extname(source);
  return `checks/evidence/${checkId}${/^\.[A-Za-z0-9]{1,8}$/.test(ext) ? ext.toLowerCase() : ".txt"}`;
}

export async function record(opts: RecordOptions): Promise<Report> {
  const report = emptyReport("record");
  const dir = resolve(opts.dir);
  const now = opts.now ?? (() => new Date());
  const err = (category: Problem["category"], location: string, message: string, remedy?: string) => report.errors.push({ category, location, message, remedy });

  if (!existsSync(`${dir}/manifest.yaml`)) {
    err("missing_file", `${dir}/manifest.yaml`, "manifest.yaml not found", "pass a Finding directory created by `aftergrid new finding`");
    report.syntax = "invalid";
    return report;
  }
  let doc: ReturnType<typeof parseDocument>;
  let manifest: any;
  try {
    doc = parseDocument(readFileSync(safePath(dir, "manifest.yaml"), "utf8"));
    manifest = doc.toJS();
    if (!manifest?.finding) throw new Error("manifest.yaml has no finding block");
  } catch (e) {
    err(categoryOf(e), "manifest.yaml", (e as Error).message, "the manifest must be readable YAML with a finding block; nothing was written");
    report.syntax = "invalid";
    return report;
  }
  report.finding = manifest?.finding?.id ? `${manifest.finding.id} r${manifest.finding.revision}` : undefined;
  report.state = manifest?.finding?.state;
  report.outcome = manifest?.finding?.outcome;

  const instance = findInstance(opts.instanceDir ?? dir);
  if (!instance) {
    err("missing_file", opts.instanceDir ?? dir, "no aftergrid.yaml found here or above", "run /setup-aftergrid, or pass --instance <dir>");
    return report;
  }
  try {
    validateStructure(manifest, dir, instance.root);
  } catch (e) {
    err(categoryOf(e), String((e as any).location ?? "manifest.yaml"), (e as Error).message, "fix the manifest bindings before recording anything against them");
    return report;
  }

  const wants = [opts.execution ? "--execution" : "", opts.check ? "--check" : ""].filter(Boolean);
  if (wants.length !== 1) {
    err("incomplete", "--execution/--check", `name exactly one thing to record, got ${wants.length ? wants.join(" and ") : "neither"}`,
      "`aftergrid record <dir> --execution <id> --result <file>` records one query run; `--check <id> --outcome <o>` records one agent-reported Check outcome");
    return report;
  }
  if (!opts.tool?.trim()) {
    err("incomplete", "--tool", "name the tool that actually ran this", "pass --tool '<name>', as the Operator names it (psql, supabase mcp, duckdb cli); aftergrid never guesses which tool the harness used");
    return report;
  }
  // Evidence is inside the content digest an approval binds to, exactly as retained inputs are for `capture`.
  if ((manifest.attestations ?? []).length) {
    err("stale_attestation", "manifest.yaml#/attestations",
      `this revision carries ${manifest.attestations.length} attestation(s), and recorded evidence is inside the content digest they bind to`,
      "bump finding.revision first and record into the new revision; record never rewrites, rebinds or drops an attestation");
    return report;
  }

  const executedBy = (at: string) => ({
    kind: "harness" as const, tool: opts.tool.trim(),
    ...(opts.toolVersion ? { tool_version: opts.toolVersion } : {}),
    recorded_at: at,
  });
  const at = stamp(now());
  const staged = new Map<string, Buffer>();
  const pins: [(string | number)[], unknown][] = [];
  const drops: (string | number)[][] = [];
  const set = (path: (string | number)[], value: unknown) => pins.push([path, value]);

  try {
    if (opts.execution) recordExecution(opts, manifest, dir, at, executedBy(at), set, drops, staged, report);
    else recordCheck(opts, manifest, dir, at, executedBy(at), set, staged, report);
  } catch (e) {
    err(categoryOf(e), String((e as any).location ?? dir), (e as Error).message,
      "nothing was written: the Finding directory is exactly as it was before this command");
    return report;
  }
  if (report.errors.length) return report;

  for (const [path, value] of pins) doc.setIn(path, value);
  for (const path of drops) doc.deleteIn(path);
  // The digest the write WOULD produce, computed over the staged bytes rather than the files on disk, so a
  // Finding that names a file it does not hold is refused before anything is written (`execute` does the same).
  try {
    contentDigest(doc.toJS(), dir, (p) => {
      for (const [rel, bytes] of staged) { try { if (safePath(dir, rel) === p) return bytes; } catch { /* not a staged path */ } }
      return readFileSync(p);
    });
  } catch (e) {
    err(categoryOf(e), String((e as any).location ?? dir), `the content digest could not be computed: ${(e as Error).message}`,
      "nothing was written; every file the manifest names must exist and be readable before a recording can be pinned");
    return report;
  }
  for (const [rel, bytes] of staged) {
    const full = safePath(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, bytes);
  }
  const pinned = digestOf(doc.toJS(), dir);
  doc.setIn(["content_digest"], pinned);
  writeFileSync(safePath(dir, "manifest.yaml"), doc.toString({ lineWidth: 0 }));

  report.sql_execution = "not_performed";
  report.content = manifest.finding?.state === "complete" ? "complete" : "incomplete";
  report.evidence = "not_evaluated";
  report.info.push(`pinned content digest ${pinned.value}`);
  report.info.push("aftergrid ran nothing: sql_execution is not_performed because the harness owns the data path on this route (ADR 0010)");
  report.info.push("attestations and reviews were not written; if this recording changed the content, `check` will report them stale");
  report.readiness_reasons.push("record writes down what the harness ran and never judges readiness; run `aftergrid check` next");

  // The Analysis file, when there is one, is read AFTER the evidence is written, so a defect in it is reported
  // and never throws away the report of a recording that already happened.
  try { report.errors.push(...validateAnalysisFile(dir, doc.toJS())); }
  catch (e) {
    err("invalid_artifact", "analysis.yaml", `analysis.yaml could not be read: ${(e as Error).message}`,
      "the evidence above was written and pinned; fix analysis.yaml against src/analysis/analysis.schema.json and run `aftergrid check`");
  }
  return report;
}

// ---------------------------------------------------------------- one execution

function recordExecution(
  opts: RecordOptions, manifest: any, dir: string, at: string, by: object,
  set: (p: (string | number)[], v: unknown) => void, drops: (string | number)[][], staged: Map<string, Buffer>, report: Report,
): void {
  const err = (category: Problem["category"], location: string, message: string, remedy?: string) => report.errors.push({ category, location, message, remedy });
  const i = (manifest.executions ?? []).findIndex((e: any) => e.id === opts.execution);
  if (i < 0) {
    err("unresolved_reference", "manifest.yaml#/executions", `no execution '${opts.execution}' is declared in this manifest`,
      "declare the execution, its query and its result set first (docs/contracts/analysis-directory.md); record pins what an execution says it is, and never invents one");
    return;
  }
  const ex = manifest.executions[i];
  const query = manifest.queries.find((q: any) => q.id === ex.query_id);
  const result = manifest.results.find((r: any) => r.id === ex.result_id);
  if ((ex.input_ids ?? []).length) {
    err("execution_binding", `manifest.yaml#/executions/${i}`,
      `execution ${ex.id} declares retained inputs [${ex.input_ids.join(", ")}], and a recorded execution read the Operator's source rather than those extracts`,
      "clear input_ids to record what the harness ran, or run `aftergrid execute`, which does read the retained inputs and can then claim analysis_rerun");
    return;
  }
  if (!opts.result) {
    err("incomplete", "--result", "name the result file the harness produced", "pass --result <file.json|file.csv>; record has no way to obtain a result on its own");
    return;
  }

  // The SQL as the harness ran it. `--sql` is a file when one exists at that path, otherwise the SQL text itself;
  // either way the BYTES are staged for the query path the manifest declares, never linked to, and never written
  // until everything below has also succeeded.
  const queryPath = safePath(dir, query.path);
  let sqlBytes: Buffer;
  if (opts.sql !== undefined) {
    const asFile = resolve(opts.sql);
    const fromFile = existsSync(asFile);
    const text = fromFile ? readFileSync(asFile, "utf8") : opts.sql;
    if (!text.trim()) { err("incomplete", "--sql", "--sql is empty", "pass the SQL file the harness ran, or the SQL text itself"); return; }
    sqlBytes = Buffer.from(text.endsWith("\n") ? text : text + "\n", "utf8");
    staged.set(query.path, sqlBytes);
    report.info.push(`copied the recorded SQL into ${query.path} from ${fromFile ? opts.sql : "--sql text"}`);
  } else if (existsSync(queryPath)) {
    sqlBytes = readFileSync(queryPath);
  } else {
    err("missing_file", query.path, `${query.path} does not exist, so there is no SQL text to pin`,
      "pass --sql <file|inline> with the SQL the harness ran, or write it to the declared query path first");
    return;
  }

  // Parameters. The analytical timezone is not optional anywhere in the contract, recorded path included.
  const parameters: Record<string, unknown> = { ...(ex.parameters ?? {}) };
  for (const raw of opts.params ?? []) {
    const eq = raw.indexOf("=");
    if (eq <= 0) { err("sql_parameter", "--params", `'${raw}' is not key=value`, "pass --params tz=America/New_York --params day=2026-09-08"); return; }
    parameters[raw.slice(0, eq)] = paramValue(raw.slice(eq + 1));
  }
  if (!parameters.analytical_timezone) {
    err("sql_parameter", `manifest.yaml#/executions/${i}/parameters`, "the execution records no analytical_timezone, and every date grouping is read in one",
      "pass --params analytical_timezone=<IANA zone>, the zone the harness ran the query in");
    return;
  }

  const declared: DeclaredColumn[] = result.columns.map((c: any) => ({ name: c.name, type: c.type, nullable: !!c.nullable }));
  const got = readResultFile(opts.result, declared);
  const ser = serializeResult(got as any, { result_id: result.id, execution_id: ex.id, row_key: result.row_key, columns: declared });
  validateResult(ser.object, { ...result, row_count: ser.object.rows.length });
  const hash = { algorithm: "sha256" as const, value: sha256(ser.bytes) };
  staged.set(result.path, ser.bytes);

  const ri = manifest.results.findIndex((r: any) => r.id === result.id);
  const qi = manifest.queries.findIndex((q: any) => q.id === query.id);
  set(["queries", qi, "content_hash"], { algorithm: "sha256", value: sha256(sqlBytes) });
  set(["executions", i, "sql_hash"], { algorithm: "sha256", value: sha256(sqlBytes) });
  set(["executions", i, "parameters"], parameters);
  set(["executions", i, "result_hash"], hash);
  set(["executions", i, "mode"], "recorded");
  set(["executions", i, "executed_by"], by);
  set(["executions", i, "executed_at"], opts.executedAt ?? at);
  // aftergrid did not run this, so it does not know which engine did, and will not carry a stale adapter name.
  drops.push(["executions", i, "adapter"], ["executions", i, "engine_version"]);
  set(["results", ri, "content_hash"], hash);
  set(["results", ri, "row_count"], ser.object.rows.length);
  // Exactly artifact_replay, never analysis_rerun: the bytes can be replayed and nothing can be rerun.
  set(["snapshot", "guarantees"], ["artifact_replay"]);

  report.info.push(`recorded_path: execution ${ex.id} (${query.id} -> ${result.id}, ${ser.object.rows.length} row(s)) was run by ${opts.tool}; aftergrid recorded it and did not run it`);
  report.info.push("snapshot.guarantees: artifact_replay only — the saved result can be replayed byte for byte, and nothing here can be rerun or revisited until retained inputs exist");
  if ((manifest.snapshot?.inputs ?? []).length === 0) {
    report.info.push("snapshot.inputs is empty, which is correct on this path: capture is optional, and `check --mode rerun` refuses this Finding with rerun_unavailable rather than pretend it can reproduce it");
  }
}

// ---------------------------------------------------------------- one agent-reported Check outcome

function recordCheck(
  opts: RecordOptions, manifest: any, dir: string, at: string, by: Record<string, unknown>,
  set: (p: (string | number)[], v: unknown) => void, staged: Map<string, Buffer>, report: Report,
): void {
  const err = (category: Problem["category"], location: string, message: string, remedy?: string) => report.errors.push({ category, location, message, remedy });
  const i = (manifest.checks ?? []).findIndex((c: any) => c.id === opts.check);
  if (i < 0) {
    err("unresolved_reference", "manifest.yaml#/checks", `no Check '${opts.check}' is declared in this manifest`,
      "declare the Check and its SQL file first; record writes down an outcome for a Check the Finding already states, and never invents one");
    return;
  }
  const ck = manifest.checks[i];
  if (!opts.outcome || !OUTCOMES.has(opts.outcome)) {
    err("check_shape", "--outcome", `--outcome must be pass, fail, not_run or error, got '${opts.outcome ?? "nothing"}'`,
      "report what the harness observed: pass, fail, not_run (the Check declared itself not evaluable) or error (it failed to run)");
    return;
  }
  // An outcome nobody can point at is not evidence. pass is the only one that asserts something held, so it is
  // the one that needs an artifact; fail, not_run and error may carry one and are not required to.
  if (opts.outcome === "pass" && !opts.evidence) {
    err("unevidenced_outcome", `checks/${ck.id}`,
      `a pass reported by the harness needs the artifact it rests on, and none was given for Check ${ck.id}`,
      "pass --evidence <file>: the output the tool produced when it ran this Check. It is copied into the Finding and pinned by hash, so a Reader can see what the pass rests on. Nothing was written");
    return;
  }

  const checkPath = safePath(dir, ck.path);
  if (!existsSync(checkPath)) {
    err("missing_file", ck.path, `${ck.path} does not exist, so there is no Check text to pin the outcome against`,
      "write the Check SQL the harness ran to the declared path first");
    return;
  }
  set(["checks", i, "content_hash"], { algorithm: "sha256", value: sha256(readFileSync(checkPath)) });

  const reported: Record<string, unknown> = { kind: by.kind, tool: by.tool, ...(by.tool_version ? { tool_version: by.tool_version } : {}), reported_at: at };
  if (opts.evidence) {
    const source = resolve(opts.evidence);
    if (!existsSync(source)) { err("missing_file", opts.evidence, `the evidence file ${opts.evidence} does not exist`, "point --evidence at the output the tool produced"); return; }
    const rel = evidenceDestination(ck.id, source);
    const bytes = readFileSync(source);           // copied in, never linked: the Finding must stand on its own
    staged.set(rel, bytes);
    reported.evidence = { path: rel, content_hash: { algorithm: "sha256", value: sha256(bytes) } };
    report.info.push(`copied the Check evidence into ${rel} and pinned its hash`);
  }
  set(["checks", i, "outcome"], opts.outcome);
  set(["checks", i, "executed_at"], opts.executedAt ?? at);
  set(["checks", i, "reported_by"], reported);

  report.checks_reported_by_agent = true;
  report.info.push(`recorded_path: Check ${ck.id} (${ck.kind}${ck.required ? ", required" : ""}) was reported ${opts.outcome} by ${opts.tool}; aftergrid recorded that report and did not run the Check`);
  report.info.push("an agent-reported outcome is somebody's word, not a mechanical result: `check` treats it as valid only for artifact consistency and never lets it carry publication readiness on its own");
}
