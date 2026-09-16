// Seam: the recorded data path (docs/contracts/record.md, ADR 0010).
//
// On this route aftergrid never touches the source. The Operator's harness runs the SQL with its own tool, and
// `aftergrid record` writes down what it ran, what came back, and who ran it. Everything asserted here is about
// that division: what gets pinned, what the command refuses to claim, and which questions stop having an answer
// once nothing was retained.
//
// Not exercised here: a harness. Every "tool output" below is a file this test wrote, exactly as an Operator
// would hand `record` a file their tool produced — evidence about the contract, never evidence that a harness
// produces it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { newFinding } from "./commands/new-finding.ts";
import { record, parseCsv, readResultFile, evidenceDestination } from "./commands/record.ts";
import { check, rerunUnavailable } from "./commands/check.ts";
import { findInstance } from "./instance.ts";
// @ts-ignore: the shared digest envelope, the one `check` verifies against.
import { digestOf, schemaErrors } from "../scripts/lib/validate-finding.mjs";

const AFTERGRID_YAML = `schema_version: 0.1.0
instance_root: analytics
connection:
  adapter: duckdb
  duckdb:
    path: data
    read_only: true
publication:
  repository: example/analytics
  trusted_approvers: [an-operator]
  automation_login: example-bot
export_defaults:
  recipient_scope: named_readers
  granularity: aggregate_only
owner:
  name: An Operator
  contact: operator@example.invalid
`;
const READERS_MD = "# Readers\n\n## product_owner\n\nNon-technical product owner; reads on a phone.\n";

const CANCELLATIONS_SQL = `select 'post' as period,
       count(*) filter (where cancelled_at is not null) as cancellations,
       count(*) as active_at_change
from subscriptions
where started_at < $change_date::date
`;
const UNIQUE_SQL = "select count(*) = count(distinct subscription_id) as pass, 'rows ' || count(*) as detail from subscriptions\n";
/** A fresh unpinned hash each time: one shared object would make `yaml` emit anchors and aliases. */
const ZERO = () => ({ algorithm: "sha256", value: "0".repeat(64) });

/** The recorded path with no adapter configured either — what an adapterless `aftergrid setup` writes. */
const ADAPTERLESS_YAML = AFTERGRID_YAML.replace(/connection:\n(?:  .*\n)+/, "connection:\n  adapter: none\n");

/** An Instance with no source at all: on the recorded path there is nothing for aftergrid to connect to. */
function scratchInstance(opts: { adapterless?: boolean } = {}): string {
  const root = join(mkdtempSync(join(tmpdir(), "ag-record-")), "analytics");
  mkdirSync(join(root, "definitions"), { recursive: true });
  writeFileSync(join(root, "aftergrid.yaml"), opts.adapterless ? ADAPTERLESS_YAML : AFTERGRID_YAML);
  writeFileSync(join(root, "readers.md"), READERS_MD);
  return root;
}

/**
 * A draft that DECLARES what the harness is about to run: one execution bound to one query and one result set,
 * and one Check. `input_ids` is empty and `mode` is `recorded` — the harness reaches the source, and this Finding
 * retains nothing. Nothing is pinned yet; that is `record`'s job.
 */
function declaredFinding(opts: { withSqlFile?: boolean; checks?: boolean; adapterless?: boolean } = {}): { dir: string; instanceRoot: string } {
  const instanceRoot = scratchInstance({ adapterless: opts.adapterless });
  const created = newFinding({ slug: "price-change-cancellations", ask: "Did the price increase make more people cancel?", reader: "product_owner", instanceDir: instanceRoot, date: "2026-09-16" });
  assert.deepEqual(created.errors, [], JSON.stringify(created.errors));
  const dir = join(instanceRoot, "findings", "2026-09-16-price-change-cancellations");
  if (opts.withSqlFile !== false) writeFileSync(join(dir, "queries", "cancellations.sql"), CANCELLATIONS_SQL);
  if (opts.checks !== false) writeFileSync(join(dir, "checks", "unique_subscriptions.sql"), UNIQUE_SQL);

  const m: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  m.queries = [{ id: "cancellations", path: "queries/cancellations.sql", dialect: "postgres", purpose: "What has accumulated since the change.", content_hash: ZERO() }];
  m.executions = [{
    id: "ex_cancellations", query_id: "cancellations", sql_hash: ZERO(), parameters: { analytical_timezone: "America/New_York" },
    input_ids: [], definition_refs: [], result_id: "since_change", result_hash: ZERO(), mode: "recorded",
  }];
  m.results = [{
    id: "since_change", execution_id: "ex_cancellations", path: "results/since_change.json", row_key: "period",
    columns: [
      { name: "period", type: "text", unit: "text" },
      { name: "cancellations", type: "integer", unit: "count", display: { kind: "integer" } },
      { name: "active_at_change", type: "integer", unit: "count", display: { kind: "integer" } },
    ],
    row_count: 0, content_hash: ZERO(),
  }];
  if (opts.checks !== false) {
    m.checks = [{ id: "unique_subscriptions", kind: "invariant", path: "checks/unique_subscriptions.sql", required: true, outcome: "not_run", description: "No subscription is counted twice.", content_hash: ZERO(), execution_id: "ex_cancellations" }];
  }
  m.export_policy.allowed_fields = ["since_change.period", "since_change.cancellations", "since_change.active_at_change"];
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  return { dir, instanceRoot };
}

/** A file the harness produced, written somewhere else entirely: `record` must copy it in, never link to it. */
function toolOutput(name: string, body: string): string {
  const out = mkdtempSync(join(tmpdir(), "ag-harness-"));
  const path = join(out, name);
  writeFileSync(path, body);
  return path;
}

const JSON_RESULT = JSON.stringify([{ period: "post", cancellations: 67, active_at_change: 887 }], null, 2) + "\n";
const CSV_RESULT = "period,cancellations,active_at_change\npost,67,887\n";
const manifestOf = (dir: string): any => parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));

// ---------------------------------------------------------------- happy path

test("record pins the SQL, the parameters and the result the harness produced, from JSON and from CSV alike", async () => {
  for (const [name, body] of [["result.json", JSON_RESULT], ["result.csv", CSV_RESULT]] as const) {
    const { dir } = declaredFinding();
    const report = await record({
      dir, tool: "psql", toolVersion: "16.2", execution: "ex_cancellations",
      result: toolOutput(name, body), params: ["change_date=2026-09-08"],
    });
    assert.deepEqual(report.errors, [], `${name}: ${JSON.stringify(report.errors)}`);
    assert.equal(report.sql_execution, "not_performed", `${name}: aftergrid ran nothing and says so`);

    const m = manifestOf(dir);
    const ex = m.executions[0];
    assert.deepEqual(ex.executed_by.kind, "harness");
    assert.equal(ex.executed_by.tool, "psql");
    assert.equal(ex.executed_by.tool_version, "16.2");
    assert.equal(ex.mode, "recorded");
    assert.ok(!("adapter" in ex) && !("engine_version" in ex), `${name}: aftergrid did not run it and names no engine that did`);
    assert.match(ex.sql_hash.value, /^[a-f0-9]{64}$/);
    assert.equal(ex.sql_hash.value, m.queries[0].content_hash.value, `${name}: the pinned SQL is the file the query names`);
    assert.equal(ex.result_hash.value, m.results[0].content_hash.value);
    assert.equal(m.results[0].row_count, 1);

    // The result is rewritten into the one canonical format, whatever the tool handed over.
    const saved = JSON.parse(readFileSync(join(dir, "results", "since_change.json"), "utf8"));
    assert.deepEqual(saved, { result_id: "since_change", execution_id: "ex_cancellations", row_key: "period", columns: ["period", "cancellations", "active_at_change"], rows: [{ period: "post", cancellations: 67, active_at_change: 887 }] });
    assert.ok(report.info.some((i) => /^recorded_path: execution ex_cancellations .* was run by psql; aftergrid recorded it and did not run it$/.test(i)), `${name}: ${JSON.stringify(report.info)}`);
  }
});

test("parameters are pinned as the harness ran them, typed, and an execution with no analytical timezone is refused", async () => {
  const { dir } = declaredFinding();
  const ok = await record({
    dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT),
    params: ["change_date=2026-09-08", "min_cancellations=300", "compare=false", "note=four weeks"],
  });
  assert.deepEqual(ok.errors, [], JSON.stringify(ok.errors));
  assert.deepEqual(manifestOf(dir).executions[0].parameters, {
    analytical_timezone: "America/New_York", change_date: "2026-09-08", min_cancellations: 300, compare: false, note: "four weeks",
  });

  const { dir: bare } = declaredFinding();
  const m = manifestOf(bare);
  delete m.executions[0].parameters.analytical_timezone;
  writeFileSync(join(bare, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  const refused = await record({ dir: bare, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT) });
  assert.ok(refused.errors.some((e) => e.category === "sql_parameter" && /analytical_timezone/.test(e.message)), JSON.stringify(refused.errors));
  assert.ok(!existsSync(join(bare, "results", "since_change.json")), "a refused recording writes nothing");
});

test("the SQL the harness ran is copied in, from a file or inline, and pinned to the query the manifest declares", async () => {
  const fromFile = declaredFinding({ withSqlFile: false });
  const sqlFile = toolOutput("ran.sql", CANCELLATIONS_SQL);
  const a = await record({ dir: fromFile.dir, tool: "psql", execution: "ex_cancellations", sql: sqlFile, result: toolOutput("r.json", JSON_RESULT), params: ["change_date=2026-09-08"] });
  assert.deepEqual(a.errors, [], JSON.stringify(a.errors));
  assert.equal(readFileSync(join(fromFile.dir, "queries", "cancellations.sql"), "utf8"), CANCELLATIONS_SQL);
  assert.ok(!lstatSync(join(fromFile.dir, "queries", "cancellations.sql")).isSymbolicLink(), "copied in, never linked");

  const inline = declaredFinding({ withSqlFile: false });
  const b = await record({ dir: inline.dir, tool: "psql", execution: "ex_cancellations", sql: "select 'post' as period, 67 as cancellations, 887 as active_at_change", result: toolOutput("r.json", JSON_RESULT) });
  assert.deepEqual(b.errors, [], JSON.stringify(b.errors));
  assert.match(readFileSync(join(inline.dir, "queries", "cancellations.sql"), "utf8"), /^select 'post' as period/);

  const missing = declaredFinding({ withSqlFile: false });
  const c = await record({ dir: missing.dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT) });
  assert.ok(c.errors.some((e) => e.category === "missing_file" && /--sql/.test(e.remedy ?? "")), JSON.stringify(c.errors));
});

// ---------------------------------------------------------------- what it refuses

test("a result that does not match its declared shape is refused, and nothing is written", async () => {
  const cases: [string, string, string, RegExp][] = [
    ["a missing column", "r.json", JSON.stringify([{ period: "post", cancellations: 67 }]), /value_type|result_shape/],
    ["a column the manifest does not declare", "r.csv", "period,cancellations,active_at_change,extra\npost,67,887,x\n", /result_shape/],
    ["text in an integer column", "r.json", JSON.stringify([{ period: "post", cancellations: "sixty-seven", active_at_change: 887 }]), /value_type/],
    ["a duplicated row key", "r.csv", "period,cancellations,active_at_change\npost,67,887\npost,1,2\n", /duplicate_row_key/],
    ["a null in a column that is not nullable", "r.csv", "period,cancellations,active_at_change\npost,,887\n", /null_value/],
  ];
  for (const [what, name, body, category] of cases) {
    const { dir } = declaredFinding();
    const before = readFileSync(join(dir, "manifest.yaml"), "utf8");
    const report = await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput(name, body), params: ["change_date=2026-09-08"] });
    assert.ok(report.errors.length, `${what}: expected a refusal`);
    assert.ok(report.errors.some((e) => category.test(e.category)), `${what}: got ${report.errors.map((e) => e.category).join(", ")}`);
    assert.equal(readFileSync(join(dir, "manifest.yaml"), "utf8"), before, `${what}: the manifest is untouched`);
    assert.ok(!existsSync(join(dir, "results", "since_change.json")), `${what}: no result was written`);
  }
});

test("an execution that names retained inputs is refused: a recorded run read the source, not those extracts", async () => {
  const { dir } = declaredFinding();
  const m = manifestOf(dir);
  m.snapshot.inputs = [{ id: "subscriptions", kind: "extract", path: "inputs/subscriptions.csv", content_hash: ZERO(), captured_at: "2026-09-16T04:00:00Z", description: "All paid subscriptions." }];
  m.executions[0].input_ids = ["subscriptions"];
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  const report = await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT) });
  const problem = report.errors.find((e) => e.category === "execution_binding");
  assert.ok(problem, JSON.stringify(report.errors));
  assert.match(problem!.remedy ?? "", /aftergrid execute/);
});

test("record refuses a revision carrying attestations, exactly as capture does", async () => {
  const { dir } = declaredFinding();
  const m = manifestOf(dir);
  m.attestations = [{ kind: "publication_approval", source: { type: "unverified_note", note: "fixture" }, attester: "none", date: "2026-09-16", content_digest: m.content_digest }];
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  const before = readFileSync(join(dir, "manifest.yaml"), "utf8");
  const report = await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT) });
  const problem = report.errors.find((e) => e.category === "stale_attestation");
  assert.ok(problem, JSON.stringify(report.errors));
  assert.match(problem!.remedy ?? "", /bump finding\.revision/);
  assert.equal(readFileSync(join(dir, "manifest.yaml"), "utf8"), before);

  const forCheck = await record({ dir, tool: "psql", check: "unique_subscriptions", outcome: "fail" });
  assert.ok(forCheck.errors.some((e) => e.category === "stale_attestation"), "an agent-reported outcome is content too");
});

test("a Finding that names a file it does not hold is refused before anything is written", async () => {
  const { dir } = declaredFinding();
  rmSync(join(dir, "checks", "unique_subscriptions.sql"));   // declared in the manifest, absent from the directory
  const before = readFileSync(join(dir, "manifest.yaml"), "utf8");
  const report = await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT), params: ["change_date=2026-09-08"] });
  assert.ok(report.errors.some((e) => /content digest could not be computed/.test(e.message)), JSON.stringify(report.errors));
  assert.match(report.errors[0]!.remedy ?? "", /nothing was written/);
  assert.equal(readFileSync(join(dir, "manifest.yaml"), "utf8"), before);
  assert.ok(!existsSync(join(dir, "results", "since_change.json")));
});

test("record names what it will not guess: the tool, one subject, and an execution the manifest declares", async () => {
  const { dir } = declaredFinding();
  const noTool = await record({ dir, tool: "  ", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT) });
  assert.ok(noTool.errors.some((e) => e.location === "--tool" && /never guesses/.test(e.remedy ?? "")), JSON.stringify(noTool.errors));

  const both = await record({ dir, tool: "psql", execution: "ex_cancellations", check: "unique_subscriptions", outcome: "fail" });
  assert.ok(both.errors.some((e) => e.location === "--execution/--check"), JSON.stringify(both.errors));

  const unknown = await record({ dir, tool: "psql", execution: "ex_nothing", result: toolOutput("r.json", JSON_RESULT) });
  assert.ok(unknown.errors.some((e) => e.category === "unresolved_reference" && /ex_nothing/.test(e.message)), JSON.stringify(unknown.errors));
});

// ---------------------------------------------------------------- guarantees, digest, capture

test("a recorded Finding guarantees artifact_replay and nothing else, keeps its digest valid, and needs no capture", async () => {
  const { dir } = declaredFinding({ checks: false });
  const m0 = manifestOf(dir);
  m0.snapshot.guarantees = ["artifact_replay", "analysis_rerun"];   // an over-claim record must take back
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m0, { lineWidth: 0 }));

  const report = await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT), params: ["change_date=2026-09-08"] });
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  const m = manifestOf(dir);
  assert.deepEqual(m.snapshot.guarantees, ["artifact_replay"], "never analysis_rerun: nothing was retained, so nothing can be rerun");
  assert.deepEqual(m.snapshot.inputs, [], "capture is optional on this path");
  assert.equal(m.content_digest.value, digestOf(m, dir).value, "the digest is re-pinned over what was just recorded");

  // Recording the same thing again is a no-op on everything the digest covers: `recorded_at` is volatile.
  const digest = m.content_digest.value;
  const again = await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT), params: ["change_date=2026-09-08"] });
  assert.deepEqual(again.errors, [], JSON.stringify(again.errors));
  assert.equal(manifestOf(dir).content_digest.value, digest);

  // And `check` agrees: the artifact verifies, and it says who ran it.
  const verified = await check({ dir, github: null });
  assert.deepEqual(verified.errors, [], JSON.stringify(verified.errors));
  assert.ok(verified.info.some((i) => /^recorded_path: 1 execution\(s\) \[ex_cancellations\]/.test(i)), JSON.stringify(verified.info));
});

test("a Snapshot that claims analysis_rerun over harness-recorded executions is a false_guarantee", async () => {
  const { dir } = declaredFinding();
  await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT), params: ["change_date=2026-09-08"] });
  const m = manifestOf(dir);
  m.snapshot.guarantees = ["artifact_replay", "analysis_rerun"];
  m.content_digest = digestOf(m, dir);
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  const report = await check({ dir, github: null });
  const problem = report.errors.find((e) => e.category === "false_guarantee");
  assert.ok(problem, JSON.stringify(report.errors.map((e) => e.category)));
  assert.match(problem!.remedy ?? "", /aftergrid execute/);
});

test("check --mode rerun refuses a recorded Finding by name instead of crashing or reporting a rerun it never did", async () => {
  const { dir } = declaredFinding({ checks: false });
  await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT), params: ["change_date=2026-09-08"] });
  const report = await check({ dir, mode: "rerun", github: null });
  const problem = report.errors.find((e) => e.category === "rerun_unavailable");
  assert.ok(problem, JSON.stringify(report.errors));
  assert.match(problem!.message, /run by psql/);
  assert.match(problem!.remedy ?? "", /aftergrid capture/);
  assert.equal(report.sql_execution, "not_performed", "nothing ran, and the report does not say otherwise");
  assert.ok(!report.info.some((i) => /reproduced/.test(i)));
  assert.equal(/capture` refuses too/.test(problem!.remedy ?? ""), false,
    "this Instance configures duckdb, so `capture` really is the first step and nothing extra is claimed");
});

test("the rerun_unavailable remedy does not send an adapterless Instance to `capture`, which refuses there too", async () => {
  // Both rerun_unavailable remedies name `aftergrid capture` as the first step. On the default, adapterless
  // Instance `capture` refuses outright, so the remedy has to name the step that actually comes first (ag-q2l).
  const { dir } = declaredFinding({ checks: false, adapterless: true });
  await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT), params: ["change_date=2026-09-08"] });

  const report = await check({ dir, mode: "rerun", github: null });
  const problem = report.errors.find((e) => e.category === "rerun_unavailable");
  assert.ok(problem, JSON.stringify(report.errors));
  assert.match(problem!.remedy ?? "", /[Oo]n this Instance `capture` refuses too/,
    `the remedy sends the Operator to a command that refuses on this Instance: ${problem!.remedy}`);
  assert.match(problem!.remedy ?? "", /set `connection\.adapter` in aftergrid\.yaml first, then capture and execute/);
  assert.equal(report.sql_execution, "not_performed");
});

test("a Finding with executions but no retained inputs gets the same first step named, and only when it is true", () => {
  const { dir, instanceRoot } = declaredFinding({ checks: false, adapterless: true });
  // Nothing recorded and nothing captured: the second rerun_unavailable branch, with the same capture remedy.
  const adapterless = rerunUnavailable(dir, findInstance(dir));
  assert.ok(adapterless, "a Finding with executions and no retained inputs cannot be rerun");
  assert.equal(adapterless!.location, "manifest.yaml#/snapshot/inputs");
  assert.match(adapterless!.remedy ?? "", /[Oo]n this Instance `capture` refuses too/);

  // The same Finding under an Instance that HAS an adapter keeps the plain remedy: capture really is the step.
  writeFileSync(join(instanceRoot, "aftergrid.yaml"), AFTERGRID_YAML);
  const withAdapter = rerunUnavailable(dir, findInstance(dir));
  assert.ok(withAdapter);
  assert.equal(/capture` refuses too/.test(withAdapter!.remedy ?? ""), false, withAdapter!.remedy);

  // And with no Instance in hand, nothing is claimed either way.
  assert.equal(/capture` refuses too/.test(rerunUnavailable(dir)!.remedy ?? ""), false);
});

// ---------------------------------------------------------------- agent-reported Check outcomes

test("an agent-reported Check outcome carries the tool that reported it, and a pass carries the artifact it rests on", async () => {
  const { dir } = declaredFinding();
  await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT), params: ["change_date=2026-09-08"] });

  const output = toolOutput("unique.txt", "pass|detail\ntrue|rows 887\n");
  const passed = await record({ dir, tool: "psql", check: "unique_subscriptions", outcome: "pass", evidence: output });
  assert.deepEqual(passed.errors, [], JSON.stringify(passed.errors));
  assert.equal(passed.checks_reported_by_agent, true);
  const ck = manifestOf(dir).checks[0];
  assert.equal(ck.outcome, "pass");
  assert.equal(ck.reported_by.kind, "harness");
  assert.equal(ck.reported_by.tool, "psql");
  assert.equal(ck.reported_by.evidence.path, "checks/evidence/unique_subscriptions.txt");
  assert.equal(readFileSync(join(dir, ck.reported_by.evidence.path), "utf8"), "pass|detail\ntrue|rows 887\n");
  assert.ok(!lstatSync(join(dir, ck.reported_by.evidence.path)).isSymbolicLink(), "copied in, never linked");

  const verified = await check({ dir, github: null });
  assert.deepEqual(verified.errors, [], JSON.stringify(verified.errors));
  assert.equal(verified.checks_reported_by_agent, true, "the report carries it as its own fact");
  assert.notEqual(verified.readiness, "ready");
  assert.ok(verified.readiness_reasons.some((r) => /reported by the harness/.test(r)), JSON.stringify(verified.readiness_reasons));

  // The evidence is inside the digest through its hash: editing it afterwards is caught.
  writeFileSync(join(dir, ck.reported_by.evidence.path), "pass|detail\ntrue|rows 999\n");
  const tampered = await check({ dir, github: null });
  assert.ok(tampered.errors.some((e) => e.category === "hash_mismatch" && /reported_by\/evidence/.test(e.location)), JSON.stringify(tampered.errors));
});

test("a pass reported by the harness with no evidence file is refused, and a fail or not_run needs none", async () => {
  const { dir } = declaredFinding();
  await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT), params: ["change_date=2026-09-08"] });
  const before = readFileSync(join(dir, "manifest.yaml"), "utf8");

  const refused = await record({ dir, tool: "psql", check: "unique_subscriptions", outcome: "pass" });
  const problem = refused.errors.find((e) => e.category === "unevidenced_outcome");
  assert.ok(problem, JSON.stringify(refused.errors));
  assert.match(problem!.remedy ?? "", /--evidence/);
  assert.equal(readFileSync(join(dir, "manifest.yaml"), "utf8"), before, "nothing was written");

  const failed = await record({ dir, tool: "psql", check: "unique_subscriptions", outcome: "fail" });
  assert.deepEqual(failed.errors, [], JSON.stringify(failed.errors));
  const ck = manifestOf(dir).checks[0];
  assert.equal(ck.outcome, "fail");
  assert.ok(!ck.reported_by.evidence, "a fail may stand on the report alone");

  const nonsense = await record({ dir, tool: "psql", check: "unique_subscriptions", outcome: "probably" });
  assert.ok(nonsense.errors.some((e) => e.category === "check_shape"), JSON.stringify(nonsense.errors));
});

test("a manifest that asserts an unevidenced agent pass is rejected by check, not only by record", async () => {
  const { dir } = declaredFinding();
  await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT), params: ["change_date=2026-09-08"] });
  const m = manifestOf(dir);
  m.checks[0].outcome = "pass";
  m.checks[0].reported_by = { kind: "harness", tool: "psql", reported_at: "2026-09-16T09:00:00Z" };
  m.content_digest = digestOf(m, dir);
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  const report = await check({ dir, github: null });
  assert.ok(report.errors.some((e) => e.category === "unevidenced_outcome" && e.location === "checks/unique_subscriptions"), JSON.stringify(report.errors));
  assert.equal(report.evidence, "invalid");
});

// ---------------------------------------------------------------- path safety

test("every path the Operator gives is contained, and a file outside the Finding is copied in rather than linked", async () => {
  const { dir } = declaredFinding();
  const m = manifestOf(dir);
  m.results[0].path = "../escaped.json";
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  const escaping = await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT) });
  assert.ok(escaping.errors.some((e) => e.category === "unsafe_path"), JSON.stringify(escaping.errors));
  assert.ok(!existsSync(join(dir, "..", "escaped.json")), "nothing was written outside the Finding");

  // A symlinked destination is refused the same way, so a recording cannot be redirected out of the directory.
  const linked = declaredFinding();
  const outside = mkdtempSync(join(tmpdir(), "ag-outside-"));
  symlinkSync(outside, join(linked.dir, "results", "elsewhere"));
  const lm = manifestOf(linked.dir);
  lm.results[0].path = "results/elsewhere/since_change.json";
  writeFileSync(join(linked.dir, "manifest.yaml"), toYaml(lm, { lineWidth: 0 }));
  const symlinked = await record({ dir: linked.dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT) });
  assert.ok(symlinked.errors.some((e) => e.category === "unsafe_path"), JSON.stringify(symlinked.errors));
  assert.ok(!existsSync(join(outside, "since_change.json")));

  // The source, by contrast, is meant to be elsewhere: its BYTES arrive, and no link is left behind.
  const ok = declaredFinding();
  const source = toolOutput("far-away.json", JSON_RESULT);
  const report = await record({ dir: ok.dir, tool: "psql", execution: "ex_cancellations", result: source, params: ["change_date=2026-09-08"] });
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  assert.ok(!lstatSync(join(ok.dir, "results", "since_change.json")).isSymbolicLink());
  writeFileSync(source, "{}");
  assert.equal(JSON.parse(readFileSync(join(ok.dir, "results", "since_change.json"), "utf8")).rows.length, 1, "the Finding does not depend on the file it was handed");
});

// ---------------------------------------------------------------- the readers this command relies on

test("the result readers accept what a tool actually hands over, and say so when they cannot", () => {
  assert.deepEqual(parseCsv('a,b\n"x,1","he said ""no"""\n'), { columns: ["a", "b"], rows: [["x,1", 'he said "no"']] });
  assert.deepEqual(parseCsv("a,b\r\n1,2\r\n"), { columns: ["a", "b"], rows: [["1", "2"]] });
  assert.throws(() => parseCsv(""), /header row/);

  const declared = [{ name: "period", type: "text" as const }, { name: "n", type: "integer" as const }, { name: "flag", type: "boolean" as const }];
  const csv = readResultFile(toolOutput("x.csv", "period,n,flag\npost,4,true\nprior,,false\n"), declared);
  assert.deepEqual(csv.rows, [{ period: "post", n: 4, flag: true }, { period: "prior", n: null, flag: false }], "an empty CSV field is SQL NULL, and types come from the declaration");

  const canonical = readResultFile(toolOutput("x.json", JSON.stringify({ columns: ["period", "n", "flag"], rows: [{ period: "post", n: 4, flag: true }] })), declared);
  assert.deepEqual(canonical.columns.map((c) => c.name), ["period", "n", "flag"]);
  assert.throws(() => readResultFile(toolOutput("x.json", "{oops"), declared), /not readable JSON/);
  assert.throws(() => readResultFile(join(tmpdir(), "ag-nothing-here.json"), declared), /does not exist/);

  assert.equal(evidenceDestination("unique_subscriptions", "/tmp/out.TXT"), "checks/evidence/unique_subscriptions.txt");
  assert.equal(evidenceDestination("unique_subscriptions", "/tmp/out"), "checks/evidence/unique_subscriptions.txt");
  assert.equal(evidenceDestination("unique_subscriptions", "/tmp/out.json"), "checks/evidence/unique_subscriptions.json");
});

// ---------------------------------------------------------------- what `--sql` may be

test("a --sql argument that looks like a file path and names nothing is refused, and so is inline text that is not SQL", async () => {
  // A typo in the path is the dangerous case: taken as inline SQL it OVERWRITES the real query file with the
  // path string, re-pins every hash over it, and leaves a Finding whose evidence `check` reports as valid.
  const typo = declaredFinding();
  const before = readFileSync(join(typo.dir, "manifest.yaml"), "utf8");
  const refused = await record({
    dir: typo.dir, tool: "psql", execution: "ex_cancellations", sql: "queries/cancellations_since_chagne.sql",
    result: toolOutput("r.json", JSON_RESULT), params: ["change_date=2026-09-08"],
  });
  assert.ok(refused.errors.some((e) => e.category === "missing_file" && e.location === "--sql" && /looks like a file path/.test(e.message)), JSON.stringify(refused.errors));
  assert.equal(readFileSync(join(typo.dir, "queries", "cancellations.sql"), "utf8"), CANCELLATIONS_SQL, "the declared query file is untouched");
  assert.equal(readFileSync(join(typo.dir, "manifest.yaml"), "utf8"), before, "nothing was pinned over it");

  // A path with no .sql extension is still plainly a path, and still refused rather than recorded as a query.
  const other = declaredFinding();
  const alsoRefused = await record({ dir: other.dir, tool: "psql", execution: "ex_cancellations", sql: "/tmp/ag-nothing-here/ran", result: toolOutput("r.json", JSON_RESULT) });
  assert.ok(alsoRefused.errors.some((e) => e.category === "missing_file" && e.location === "--sql"), JSON.stringify(alsoRefused.errors));

  // Inline text with no SQL keyword in it was never the query the harness ran.
  const prose = declaredFinding();
  const proseRefused = await record({ dir: prose.dir, tool: "psql", execution: "ex_cancellations", sql: "the usual cancellations query", result: toolOutput("r.json", JSON_RESULT) });
  assert.ok(proseRefused.errors.some((e) => e.location === "--sql" && /SQL/.test(e.message)), JSON.stringify(proseRefused.errors));
  assert.equal(readFileSync(join(prose.dir, "queries", "cancellations.sql"), "utf8"), CANCELLATIONS_SQL, "nothing was written over the query");
});

// ---------------------------------------------------------------- CSV cells are converted, never coerced

test("a CSV cell an integer column cannot hold is reported, never turned into a number that looks right", async () => {
  for (const cell of ["7.0", "1e3", "0x10", "+7"]) {
    const { dir } = declaredFinding();
    const report = await record({
      dir, tool: "psql", execution: "ex_cancellations", params: ["change_date=2026-09-08"],
      result: toolOutput("r.csv", `period,cancellations,active_at_change\npost,${cell},887\n`),
    });
    assert.ok(report.errors.some((e) => e.category === "value_type"), `${cell}: got ${report.errors.map((e) => e.category).join(", ") || "no error"}`);
    assert.ok(!existsSync(join(dir, "results", "since_change.json")), `${cell}: nothing was written`);
  }
  // Whitespace around an integer is still that integer: the tool's padding is not a different value.
  const { dir } = declaredFinding();
  const padded = await record({
    dir, tool: "psql", execution: "ex_cancellations", params: ["change_date=2026-09-08"],
    result: toolOutput("r.csv", "period,cancellations,active_at_change\npost, 67 ,887\n"),
  });
  assert.deepEqual(padded.errors, [], JSON.stringify(padded.errors));
  assert.equal(JSON.parse(readFileSync(join(dir, "results", "since_change.json"), "utf8")).rows[0].cancellations, 67);
});

test("the CSV reader keeps what psql --csv distinguishes: a quoted empty string, a carriage return, and an empty row", async () => {
  assert.deepEqual(parseCsv('a,b\n"",x\n'), { columns: ["a", "b"], rows: [["", "x"]] }, 'a quoted "" is an empty string, and an unquoted empty field is NULL');
  assert.deepEqual(parseCsv("a,b\n,x\n"), { columns: ["a", "b"], rows: [[null, "x"]] });
  assert.deepEqual(parseCsv('a,b\n"one\rtwo",x\n'), { columns: ["a", "b"], rows: [["one\rtwo", "x"]] }, "a CR inside a field is data; only a CRLF line ending is stripped");
  assert.deepEqual(parseCsv("a,b\n1,2\n\n"), { columns: ["a", "b"], rows: [["1", "2"]] }, "a trailing empty LINE is not a row");
  assert.deepEqual(parseCsv("a,b\n,\n"), { columns: ["a", "b"], rows: [[null, null]] }, "an all-empty ROW is a row, and is reported rather than dropped");

  const declared = [{ name: "period", type: "text" as const }, { name: "n", type: "integer" as const }];
  const read = readResultFile(toolOutput("x.csv", 'period,n\n"",4\n'), declared);
  assert.deepEqual(read.rows, [{ period: "", n: 4 }], "an empty string stays an empty string");

  // An all-empty row reaches the declared shape and is refused there, instead of vanishing.
  const { dir } = declaredFinding();
  const report = await record({
    dir, tool: "psql", execution: "ex_cancellations", params: ["change_date=2026-09-08"],
    result: toolOutput("r.csv", "period,cancellations,active_at_change\npost,67,887\n,,\n"),
  });
  assert.ok(report.errors.some((e) => e.category === "null_value" || e.category === "row_key"), JSON.stringify(report.errors));
  assert.ok(!existsSync(join(dir, "results", "since_change.json")), "nothing was written");
});

// ---------------------------------------------------------------- re-recording, timestamps, refused runs

test("re-recording a Check with a different evidence extension leaves no evidence file outside the digest", async () => {
  const { dir } = declaredFinding();
  await record({ dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT), params: ["change_date=2026-09-08"] });
  await record({ dir, tool: "psql", check: "unique_subscriptions", outcome: "pass", evidence: toolOutput("unique.txt", "pass|detail\ntrue|rows 887\n") });
  assert.ok(existsSync(join(dir, "checks", "evidence", "unique_subscriptions.txt")));

  const again = await record({ dir, tool: "psql", check: "unique_subscriptions", outcome: "pass", evidence: toolOutput("unique.json", '{"pass":true}\n') });
  assert.deepEqual(again.errors, [], JSON.stringify(again.errors));
  assert.equal(manifestOf(dir).checks[0].reported_by.evidence.path, "checks/evidence/unique_subscriptions.json");
  assert.ok(!existsSync(join(dir, "checks", "evidence", "unique_subscriptions.txt")), "the evidence this recording replaced is gone, not left behind outside the digest");
  const verified = await check({ dir, github: null });
  assert.deepEqual(verified.errors, [], JSON.stringify(verified.errors));
});

test("--executed-at is the harness's own execution time, and anything that is not a timestamp is refused", async () => {
  const { dir } = declaredFinding();
  const before = readFileSync(join(dir, "manifest.yaml"), "utf8");
  const refused = await record({
    dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT),
    params: ["change_date=2026-09-08"], executedAt: "last tuesday",
  });
  assert.ok(refused.errors.some((e) => e.category === "invalid_artifact" && e.location === "--executed-at"), JSON.stringify(refused.errors));
  assert.equal(readFileSync(join(dir, "manifest.yaml"), "utf8"), before, "nothing was written");

  const ok = await record({
    dir, tool: "psql", execution: "ex_cancellations", result: toolOutput("r.json", JSON_RESULT),
    params: ["change_date=2026-09-08"], executedAt: "2026-09-16T09:12:44Z",
  });
  assert.deepEqual(ok.errors, [], JSON.stringify(ok.errors));
  assert.equal(manifestOf(dir).executions[0].executed_at, "2026-09-16T09:12:44Z");
});

test("a refused recording never reports that it copied anything in", async () => {
  const { dir } = declaredFinding();
  rmSync(join(dir, "queries", "cancellations.sql"));   // declared in the manifest, absent from the directory
  const report = await record({ dir, tool: "psql", check: "unique_subscriptions", outcome: "pass", evidence: toolOutput("unique.txt", "pass|detail\ntrue|rows 887\n") });
  assert.ok(report.errors.length, "the digest could not be computed, so nothing was written");
  assert.ok(!report.info.some((i) => /copied the Check evidence/.test(i)), JSON.stringify(report.info));
  assert.ok(!existsSync(join(dir, "checks", "evidence", "unique_subscriptions.txt")), "and no evidence file was left behind");
});

// ---------------------------------------------------------------- what the schema says about a recorded execution

test("the state /checked-analysis writes is schema-valid, and check says the recording has not happened yet", async () => {
  const { dir } = declaredFinding();
  const report = await check({ dir, github: null });
  assert.deepEqual(report.errors.filter((e) => e.category === "schema"), [], "mode: recorded with no executed_by and no retained inputs is a state the schema allows");
  assert.ok(
    report.warnings.some((w) => w.category === "recorded_path" && /ex_cancellations/.test(w.message)),
    `the warning is reachable: ${JSON.stringify(report.warnings)}`,
  );
});

test("a harness-recorded execution that also names an adapter, an engine version or retained inputs is a schema error", () => {
  const REPO = fileURLToPath(new URL("..", import.meta.url));
  const base = {
    id: "ex_cancellations", query_id: "cancellations", sql_hash: ZERO(), parameters: { analytical_timezone: "America/New_York" },
    input_ids: [], definition_refs: [], result_id: "since_change", result_hash: ZERO(), mode: "recorded",
    executed_by: { kind: "harness", tool: "psql", recorded_at: "2026-09-16T09:14:02Z" },
  };
  const { dir } = declaredFinding();
  const manifest = manifestOf(dir);
  const withExecution = (ex: any) => ({ ...manifest, executions: [ex] });
  assert.deepEqual(schemaErrors(withExecution(base), REPO), [], "the recorded execution itself is valid");
  for (const [what, ex] of [
    ["an adapter", { ...base, adapter: "duckdb" }],
    ["an engine version", { ...base, engine_version: "0.1.0" }],
    ["retained inputs", { ...base, input_ids: ["subscriptions"] }],
  ] as const) {
    const problems = schemaErrors(withExecution(ex), REPO);
    assert.ok(problems.length, `${what}: aftergrid did not run this execution and cannot carry ${what} for it`);
  }
});

// ---------------------------------------------------------------- the generated exemplar

test("the recorded exemplar carries one header, the one its builder writes", () => {
  const text = readFileSync(fileURLToPath(new URL("../fixtures/instance/analytics/findings/2026-09-16-price-change-cancellations-recorded/manifest.yaml", import.meta.url)), "utf8");
  const header = text.split("\n").filter((l) => l.startsWith("#"));
  assert.ok(header[0]!.startsWith("# Exemplar: the recorded data path"), header[0]);
  assert.equal(header.filter((l) => /^# Exemplar:/.test(l)).length, 1, "not the source exemplar's header as well, saying the opposite about retained inputs");
  assert.ok(!text.includes("scripts/fixture-tool.mjs build"), "and not the source exemplar's account of how it was pinned");
});

test("a --sql path with whitespace in it, or a keyword in a directory name, is still a path and not the query", async () => {
  // "my values/nope.sql" holds a SQL keyword and a space: neither makes it the query the harness ran.
  const spaced = declaredFinding();
  const before = readFileSync(join(spaced.dir, "manifest.yaml"), "utf8");
  const refused = await record({ dir: spaced.dir, tool: "psql", execution: "ex_cancellations", sql: "/tmp/ag-nothing-here/my values/nope.sql", result: toolOutput("r.json", JSON_RESULT) });
  assert.ok(refused.errors.some((e) => e.category === "missing_file" && e.location === "--sql"), JSON.stringify(refused.errors));
  assert.equal(readFileSync(join(spaced.dir, "queries", "cancellations.sql"), "utf8"), CANCELLATIONS_SQL);
  assert.equal(readFileSync(join(spaced.dir, "manifest.yaml"), "utf8"), before);

  // A bare keyword inside a path-like string without .sql is not a statement either.
  const keyworded = declaredFinding();
  const alsoRefused = await record({ dir: keyworded.dir, tool: "psql", execution: "ex_cancellations", sql: "/tmp/ag-nothing-here/Sales values/q", result: toolOutput("r.json", JSON_RESULT) });
  assert.ok(alsoRefused.errors.some((e) => e.location === "--sql"), JSON.stringify(alsoRefused.errors));
  assert.equal(readFileSync(join(keyworded.dir, "queries", "cancellations.sql"), "utf8"), CANCELLATIONS_SQL);

  // Real statements of every shape the test admits are still accepted inline.
  for (const sql of ["SELECT 1", "select count(*) as n from subscriptions", "with x as (select 1 as n) select n from x", "values (1, 2)"]) {
    const ok = declaredFinding();
    const r = await record({ dir: ok.dir, tool: "psql", execution: "ex_cancellations", sql, result: toolOutput("r.json", JSON_RESULT), params: ["change_date=2026-09-08"] });
    assert.ok(!r.errors.some((e) => e.location === "--sql"), `${sql}: ${JSON.stringify(r.errors)}`);
  }
});
