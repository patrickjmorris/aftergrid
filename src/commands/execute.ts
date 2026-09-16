// `aftergrid execute <finding-dir> [--json]`
//
// Runs the Analysis: every declared execution and every Check, against the Finding's retained inputs, through
// the shared SQL runner, and pins what came back — `results/*.json`, `sql_hash`, `result_hash`, each Check's
// outcome, every content hash and the content digest.
//
// What it refuses, without a flag to get past it:
//   - **The live source.** Retained inputs are opened by `openRetained`, which hash-verifies every extract and
//     reports `missing_file` or `hash_mismatch` rather than fall back to the source. A Finding with no retained
//     inputs is refused and told to run `aftergrid capture` first.
//   - **Rewriting approved content.** When the revision carries attestations and the run would change the
//     content digest they bind to, nothing is written and the report says to bump the revision.
//   - **Rebinding trust.** `attestations` and `reviews` are never written, refreshed or dropped. A run that
//     changes the content leaves them stale, which is exactly what `check` is there to report.
//   - **An outcome nobody can reproduce.** A Check that resolves to no execution has no recorded input set, and
//     `check --mode rerun` would run it against none of the retained inputs. It is refused before any SQL runs
//     rather than recorded as a pass the rerun contradicts.
//
// `snapshot.guarantees` records what this run observed: `artifact_replay` and `analysis_rerun` are written only
// when an execution actually produced a saved result, never as a closing assertion.
//
// Engine failures and business results stay apart: a SQL error, a bad Check shape or a result that does not
// match its declared columns aborts the run and writes nothing; a Check that honestly records `fail` is data
// and is written down (a failing `minimum_data` Check is how a Finding reaches `insufficient_data`).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import { emptyReport, type Problem, type Report } from "../report.ts";
import { findInstance } from "../instance.ts";
import { retainedOpenerFor } from "./check.ts";
import { AdapterError, type RetainedSession } from "../adapters/contract.ts";
import { serializeResult, type DeclaredColumn } from "../adapters/serialize.ts";
import { contentDigest, sha256 } from "../digest.ts";
import { validateAnalysisFile, analysisSummary, analysisStage, readAnalysis } from "../analysis/validate.ts";
// @ts-ignore: the shared digest envelope and definition hash, as `check` and the fixture build compute them.
import { digestOf, definitionHash } from "../../scripts/lib/validate-finding.mjs";
// @ts-ignore: the shared Check-shape rule.
import { checkOutcome } from "../../scripts/lib/sql-runner.mjs";
// @ts-ignore: shared path containment and structural rules.
import { safePath, validateStructure, validateResult, ContractError } from "../../scripts/fixture-safety.mjs";

export type ExecuteOptions = { dir: string; instanceDir?: string };

const KNOWN = new Set([
  "missing_file", "unsafe_path", "path_collision", "duplicate_id", "hash_mismatch", "admission", "cancelled",
  "resource_limit", "sql_error", "sql_policy", "sql_parameter", "check_shape", "check_error", "result_shape",
  "value_type", "row_key", "duplicate_row_key", "null_value", "execution_binding", "derived_arity",
  "definition_version", "unresolved_reference", "runtime_unavailable", "missing_credential", "not_implemented",
  "invalid_artifact", "unit_mismatch",
]);
const categoryOf = (e: unknown): Problem["category"] => {
  const c = (e as any)?.category;
  if ((e instanceof AdapterError || e instanceof ContractError) && KNOWN.has(c)) return c as Problem["category"];
  if ((e as any)?.code === "ENOENT") return "missing_file";
  return "sql_error";
};

function engineVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"));
    return `aftergrid ${pkg.version ?? "0.0.0"}`;
  } catch { return "aftergrid unknown"; }
}

export async function execute(opts: ExecuteOptions): Promise<Report> {
  const report = emptyReport("execute");
  const dir = resolve(opts.dir);
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
    err(categoryOf(e), "manifest.yaml", (e as Error).message, "the manifest must be readable YAML with a finding block; no SQL was run");
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
    err(categoryOf(e), String((e as any).location ?? "manifest.yaml"), (e as Error).message, "fix the manifest bindings before running any SQL");
    return report;
  }

  const inputs: any[] = manifest.snapshot?.inputs ?? [];
  if (!inputs.length) {
    // With no retained inputs there is nothing to run against. Which remedy is honest depends on the Instance:
    // an Instance with an adapter can capture them; an Instance with none is on the recorded path (ADR 0010),
    // where `capture` refuses too, so pointing at it would send the Operator in a circle.
    const adapterName = String((instance.config as any)?.connection?.adapter ?? "");
    if (adapterName === "" || adapterName === "none") {
      err("recorded_path", "aftergrid.yaml#/connection/adapter",
        `this Finding has no retained inputs and this Instance configures no adapter (${adapterName === "" ? "no connection.adapter" : "connection.adapter: none"}) to capture any with, so there is nothing for execute to run and it never reads a live source`,
        'on the recorded path your harness runs the query and `aftergrid record <finding-dir> --tool "<name>" --execution <id> --result <file>` writes down the SQL, the parameters, the result and the tool that produced them; the Finding then guarantees artifact_replay and `check --mode rerun` answers rerun_unavailable. To earn analysis_rerun instead, configure an adapter (`aftergrid setup --instance <dir> --adapter duckdb --duckdb-path <file-or-csv-dir>`), then `aftergrid capture` and rerun this command. Nothing was run and nothing was written.');
      return report;
    }
    err("incomplete", "manifest.yaml#/snapshot/inputs", "this Finding has no retained inputs, and execute never reads a live source",
      "run `aftergrid capture <finding-dir> --tables …` first; the Analysis runs on the extracts it captured");
    return report;
  }
  const executions: any[] = manifest.executions ?? [];
  if (!executions.length && !(manifest.checks ?? []).length) {
    err("incomplete", "manifest.yaml#/executions", "there is nothing to run: no executions and no Checks are declared",
      "write the applicable Checks first, then the analysis queries, and declare both in the manifest");
    return report;
  }

  // A Check runs against the execution named by its `execution_id`, or the first execution when it names none
  // (docs/contracts/checks-and-results.md). A Check that resolves to no execution has no recorded table set, and
  // `check --mode rerun` would run it against no retained inputs at all — so an outcome recorded here would be
  // one nobody can reproduce. Refuse it before any SQL runs rather than pin a pass the rerun contradicts.
  const executionFor = (ck: any): any | undefined => (ck.execution_id ? executions.find((e: any) => e.id === ck.execution_id) : executions[0]);
  const unbound = (manifest.checks ?? []).filter((ck: any) => !executionFor(ck));
  if (unbound.length) {
    for (const ck of unbound) {
      err("execution_binding", `checks/${ck.id}`,
        ck.execution_id
          ? `Check ${ck.id} names execution '${ck.execution_id}', and no execution with that id is declared`
          : `Check ${ck.id} names no execution_id and this Finding declares no executions, so nothing records which retained inputs and parameters it runs against`,
        "bind the Check to a declared execution with execution_id; a Check runs against that execution's retained inputs and parameters, and `aftergrid check --mode rerun` resolves it the same way. Nothing was run and nothing was written.");
    }
    return report;
  }

  let opener: ReturnType<typeof retainedOpenerFor>;
  let engineName: "duckdb" | "postgres";
  try {
    opener = retainedOpenerFor(inputs);
    engineName = [...new Set(inputs.map((i: any) => String(i?.source?.adapter ?? "duckdb")))].includes("postgres") ? "postgres" : "duckdb";
  } catch (e) {
    err(categoryOf(e), String((e as any).location ?? "manifest.yaml#/snapshot/inputs"), (e as Error).message);
    return report;
  }

  const sessions = new Map<string, RetainedSession>();
  const sessionFor = async (inputIds: string[]): Promise<RetainedSession> => {
    const key = JSON.stringify([...new Set(inputIds)].sort());
    if (!sessions.has(key)) sessions.set(key, await opener(dir, inputs.filter((i: any) => inputIds.includes(i.id))));
    return sessions.get(key)!;
  };
  // No fallback: every Check resolved to an execution above, and inventing one here is what let `execute` and
  // `check --mode rerun` disagree about which tables a Check reads.
  const paramsFor = (ck: any) => executionFor(ck)!;

  const staged = new Map<string, Buffer>();     // finding-relative path -> bytes, written only if everything ran
  const pins: [(string | number)[], unknown][] = [];
  const set = (path: (string | number)[], value: unknown) => pins.push([path, value]);
  const outcomes: Record<string, string> = {};

  try {
    // Definition hashes: what this run actually read. `approval` is never touched.
    (manifest.definitions ?? []).forEach((d: any, i: number) => {
      set(["definitions", i, "content_hash"], definitionHash(readFileSync(safePath(instance.root, d.path), "utf8")));
    });
    (manifest.queries ?? []).forEach((q: any, i: number) => {
      set(["queries", i, "content_hash"], { algorithm: "sha256", value: sha256(readFileSync(safePath(dir, q.path))) });
    });

    for (const [i, ex] of (manifest.executions ?? []).entries()) {
      const query = manifest.queries.find((q: any) => q.id === ex.query_id);
      const result = manifest.results.find((r: any) => r.id === ex.result_id);
      const sql = readFileSync(safePath(dir, query.path), "utf8");
      set(["executions", i, "sql_hash"], { algorithm: "sha256", value: sha256(Buffer.from(sql, "utf8")) });
      const session = await sessionFor(ex.input_ids);
      const got = await session.execute(sql, ex.parameters ?? {});
      const declared: DeclaredColumn[] = result.columns.map((c: any) => ({ name: c.name, type: c.type, nullable: !!c.nullable }));
      const ser = serializeResult(got, { result_id: result.id, execution_id: ex.id, row_key: result.row_key, columns: declared });
      validateResult(ser.object, { ...result, row_count: ser.object.rows.length });
      const hash = { algorithm: "sha256" as const, value: sha256(ser.bytes) };
      staged.set(result.path, ser.bytes);
      const ri = manifest.results.findIndex((r: any) => r.id === result.id);
      set(["results", ri, "content_hash"], hash);
      set(["results", ri, "row_count"], ser.object.rows.length);
      set(["executions", i, "result_hash"], hash);
      set(["executions", i, "adapter"], engineName);
      set(["executions", i, "engine_version"], engineVersion());
      set(["executions", i, "mode"], "retained_rerun");
      set(["executions", i, "executed_at"], new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
      report.info.push(`execution ${ex.id}: ran ${query.id} on retained inputs [${ex.input_ids.join(", ")}] -> ${result.id}, ${ser.object.rows.length} row(s)`);
    }

    for (const [i, ck] of (manifest.checks ?? []).entries()) {
      const sql = readFileSync(safePath(dir, ck.path), "utf8");
      set(["checks", i, "content_hash"], { algorithm: "sha256", value: sha256(Buffer.from(sql, "utf8")) });
      const ex = paramsFor(ck);
      const session = await sessionFor(ex.input_ids);   // exactly the set `check --mode rerun` will use
      const got = await session.execute(sql, ex.parameters ?? {});
      const { outcome, detail } = checkOutcome(got.columns.map((c) => c.name), got.rows, ck.path);
      outcomes[ck.id] = outcome;
      set(["checks", i, "outcome"], outcome);
      set(["checks", i, "executed_at"], new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
      report.info.push(`check ${ck.id} (${ck.kind}${ck.required ? ", required" : ""}): ${outcome}${detail ? ` — ${detail}` : ""}`);
    }
  } catch (e) {
    err(categoryOf(e), String((e as any).location ?? dir), (e as Error).message,
      "nothing was written: the Finding directory is exactly as it was before this run");
    return report;   // the finally below closes every session
  } finally {
    for (const s of sessions.values()) await s.close().catch(() => undefined);
  }

  // Everything ran. Stage the manifest changes and decide whether they may be written at all.
  for (const [path, value] of pins) doc.setIn(path, value);
  // A guarantee is a thing this run observed, never a thing the command asserts on its way out: with no
  // execution there is no saved artifact to replay and no analysis to rerun, so the list stays empty.
  const replayed = executions.length > 0 && staged.size > 0;
  doc.setIn(["snapshot", "guarantees"], replayed ? ["artifact_replay", "analysis_rerun"] : []);
  const next: any = doc.toJS();
  let stagedDigest: { algorithm: "sha256"; value: string };
  try {
    // The digest the write would produce, computed over the staged result bytes rather than the files on disk,
    // so an approved revision can be refused before anything is written.
    stagedDigest = contentDigest(next, dir, (p) => {
      for (const [rel, bytes] of staged) { try { if (safePath(dir, rel) === p) return bytes; } catch { /* not a staged path */ } }
      return readFileSync(p);
    });
  } catch (e) {
    err(categoryOf(e), String((e as any).location ?? dir), `the content digest could not be computed: ${(e as Error).message}`,
      "nothing was written; every file the manifest names must exist and be readable");
    return report;
  }
  const attestations = manifest.attestations ?? [];
  if (attestations.length && stagedDigest.value !== manifest.content_digest?.value) {
    err("stale_attestation", "manifest.yaml#/attestations",
      `this run would change the content digest that ${attestations.length} attestation(s) bind to (${String(manifest.content_digest?.value).slice(0, 12)}… -> ${stagedDigest.value.slice(0, 12)}…)`,
      "bump finding.revision first and execute into the new revision; execute never rewrites, rebinds or drops an attestation");
    report.info.push("nothing was written: every query and Check ran, and the results were discarded rather than change approved content");
    return report;
  }

  mkdirSync(safePath(dir, "results"), { recursive: true });
  for (const [rel, bytes] of staged) writeFileSync(safePath(dir, rel), bytes);
  const pinned = digestOf(doc.toJS(), dir);
  doc.setIn(["content_digest"], pinned);
  writeFileSync(safePath(dir, "manifest.yaml"), doc.toString({ lineWidth: 0 }));
  report.sql_execution = "performed";
  report.info.push(`pinned content digest ${pinned.value}`);
  report.info.push(replayed
    ? "snapshot.guarantees: artifact_replay and analysis_rerun — this run replayed the saved SQL on the retained inputs, so both were observed, not assumed"
    : "snapshot.guarantees is empty: this run saved no result, so there is no artifact to replay and no analysis to rerun; the guarantees are not claimed");
  report.info.push("attestations and reviews were not written; if this run changed the content, `check` will report them stale");

  // Checks as facts, in the categories `check` uses.
  for (const ck of manifest.checks ?? []) {
    const outcome = outcomes[ck.id];
    if (outcome === "fail" && ck.required) {
      err("check_failed", `checks/${ck.id}`, `required Check ${ck.id} (${ck.kind}) recorded fail`,
        ck.kind === "minimum_data"
          ? "a failing minimum_data Check is a business result: the Finding's outcome is insufficient_data and the memo says what is missing"
          : "the Analysis does not establish what this Check asserts; fix the analysis or state the limitation, and do not publish on it");
    } else if (outcome === "fail") {
      report.warnings.push({ category: "check_failed", location: `checks/${ck.id}`, message: `Check ${ck.id} (${ck.kind}) recorded fail; it is not required, so it is a business result the memo must explain` });
    } else if (outcome === "not_run" && ck.required) {
      report.warnings.push({ category: "minimum_data", location: `checks/${ck.id}`, message: `required Check ${ck.id} declared itself not evaluable on this data (pass is NULL); it is recorded as not_run, never as a pass` });
    }
    if (ck.expected_outcome && outcome !== ck.expected_outcome) {
      report.warnings.push({ category: "falsifier", location: `checks/${ck.id}`, message: `falsifier ${ck.id} recorded ${outcome}, and the Question expects ${ck.expected_outcome}; an answered Finding cannot stand on this` });
    }
  }

  // The Analysis file, when there is one. It is read AFTER the evidence has been written, so a defect in it is
  // reported as a problem and never allowed to throw away the report of a run that already happened.
  let analysisProblems: Problem[] = [];
  try {
    analysisProblems = validateAnalysisFile(dir, doc.toJS());
    report.info.push(...analysisSummary(dir));
  } catch (e) {
    analysisProblems = [{
      category: "invalid_artifact", location: "analysis.yaml", message: `analysis.yaml could not be read: ${(e as Error).message}`,
      remedy: "the evidence above was written and pinned; fix analysis.yaml against src/analysis/analysis.schema.json and run `aftergrid check`",
    }];
  }
  report.errors.push(...analysisProblems);
  // Completeness is required of the finished working record, not of the seed mid-run: /checked-analysis runs
  // this command before it fills analysis.yaml in, so a `stage: clarified` file is reported, never rejected.
  try {
    if (analysisStage(readAnalysis(dir)) === "clarified") {
      report.warnings.push({
        category: "incomplete", location: "analysis.yaml#/stage",
        message: "analysis.yaml is still the clarification seed (stage: clarified): the probes, execution order, candidate Claims and outcome recommendation the writer reads are not recorded yet",
        remedy: "fill them in and set stage: analysed; `aftergrid execute` then reports no analysis_contract error when the working record is complete",
      });
    }
  } catch { /* an unreadable analysis.yaml was already reported above */ }
  if (!analysisProblems.length && !existsSync(`${dir}/analysis.yaml`)) {
    report.info.push("no analysis.yaml here: the evidence is pinned, but the assumptions, probes, execution order and candidate Claims the writer reads are not recorded yet");
  }

  // execute pins evidence; it does not walk the whole evidence graph, so it never answers `valid` or `invalid`.
  report.evidence = "not_evaluated";
  report.content = manifest.finding?.state === "complete" ? "complete" : "incomplete";
  report.info.push("evidence validity and publication readiness are `aftergrid check`'s answers, not this command's");
  report.readiness_reasons.push("execute records evidence and never judges readiness; run `aftergrid check` next");
  return report;
}
