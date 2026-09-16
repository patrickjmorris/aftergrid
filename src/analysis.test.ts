// Seam: the Analysis directory (docs/contracts/analysis-directory.md).
//
// Everything a model does in `/grill-question` and `/checked-analysis` is prose, and prose cannot be asserted
// here. What can be asserted is the contract the two skills write into and the writer reads out of: a Finding
// directory taken from `new finding` through `capture` and `execute` to evidence that survives a rerun, plus an
// `analysis.yaml` whose recorded execution order really does put the Checks before the analysis SQL.
//
// Not exercised here: any model in the loop. The two recorded runs under `fixtures/runs/` were produced by
// hand, following the skills step by step, and are fixed inputs to these tests — evidence about the artifact
// shape, never evidence that a model produces it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { newFinding } from "./commands/new-finding.ts";
import { capture } from "./commands/capture.ts";
import { execute } from "./commands/execute.ts";
import { check } from "./commands/check.ts";
import { validateAnalysisFile } from "./analysis/validate.ts";
import { proposeDefinition } from "./analysis/definitions.ts";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const WAREHOUSE = join(REPO, "fixtures/instance/data");
const RUNS = join(REPO, "fixtures/runs");
const EXEMPLAR = join(REPO, "fixtures/instance/analytics/findings/2026-07-20-onboarding-checklist-retention");

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

const READERS_MD = `# Readers\n\n## product_owner\n\nNon-technical product owner; reads on a phone.\n`;

/** A throwaway Instance whose source is a copy of the synthetic warehouse, inside the Instance root. */
function scratchInstance(tables = ["users", "events"]): string {
  const root = join(mkdtempSync(join(tmpdir(), "ag-analysis-")), "analytics");
  mkdirSync(join(root, "data"), { recursive: true });
  for (const t of tables) cpSync(join(WAREHOUSE, `${t}.csv`), join(root, "data", `${t}.csv`));
  writeFileSync(join(root, "aftergrid.yaml"), AFTERGRID_YAML);
  writeFileSync(join(root, "readers.md"), READERS_MD);
  mkdirSync(join(root, "definitions"), { recursive: true });
  return root;
}

const RETENTION_SQL = `with cohort as (
  select user_id, onboarding_variant as arm, cast(timezone($tz, signed_up_at::timestamptz) as date) as signup_day
  from users where onboarding_variant in ('checklist', 'control')
),
w as (select * from cohort where signup_day between $exp_start::date and $exp_end::date),
opens as (select user_id, cast(timezone($tz, "timestamp"::timestamptz) as date) as open_day from events where event = 'app_open'),
flags as (select c.arm, exists (select 1 from opens o where o.user_id = c.user_id and o.open_day between c.signup_day + 1 and c.signup_day + 7) as r from w c)
select arm, count(*) as signups, (count(*) filter (where r))::decimal(12,6) / count(*) as retained_7d_rate
from flags group by arm order by arm
`;

const UNIQUE_USERS_SQL = `select count(*) = count(distinct user_id) as pass,
       'users rows ' || count(*) || ', distinct user_id ' || count(distinct user_id) as detail
from users
`;

const MIN_ARM_SQL = `with cohort as (
  select onboarding_variant as arm, cast(timezone($tz, signed_up_at::timestamptz) as date) as signup_day
  from users where onboarding_variant in ('checklist', 'control')
)
select min(n) >= 500 as pass, 'smallest arm ' || min(n) as detail
from (select arm, count(*) as n from cohort where signup_day between $exp_start::date and $exp_end::date group by arm)
`;

const PARAMS = { analytical_timezone: "America/New_York", tz: "America/New_York", exp_start: "2026-06-01", exp_end: "2026-07-12" };

/** The evidence an Analysis declares before `aftergrid execute` runs it: Checks first, then the query. */
function authorAnalysis(dir: string, instanceRoot: string) {
  writeFileSync(join(dir, "checks", "unique_users.sql"), UNIQUE_USERS_SQL);
  writeFileSync(join(dir, "checks", "both_arms_large_enough.sql"), MIN_ARM_SQL);
  writeFileSync(join(dir, "queries", "retention_by_arm.sql"), RETENTION_SQL);
  proposeDefinition(instanceRoot, {
    id: "returned_within_7_days", version: 1, kind: "diagnostic",
    grain: "user", population: "users assigned to either onboarding inside the window",
    denominator: "the arm's signups", window: "7 days from signup, analytical timezone America/New_York",
    owner: "An Operator",
    meaning: "The share of an arm's new users who opened the app on any of the seven days after they signed up.",
    sql: { duckdb: "select 1 as placeholder_for_the_canonical_calculation" },
  });

  const zero = { algorithm: "sha256", value: "0".repeat(64) };
  const m: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  m.definitions = [{ id: "returned_within_7_days", version: 1, kind: "diagnostic", lifecycle: "proposed", path: "definitions/returned_within_7_days.md", content_hash: zero, role: "supporting" }];
  m.queries = [{ id: "retention_by_arm", path: "queries/retention_by_arm.sql", dialect: "duckdb", purpose: "Primary comparison.", content_hash: zero }];
  m.executions = [{
    id: "ex_retention_by_arm", query_id: "retention_by_arm", sql_hash: zero, parameters: PARAMS,
    input_ids: ["users", "events"], definition_refs: [{ id: "returned_within_7_days", version: 1 }],
    result_id: "retention_by_arm", result_hash: zero, adapter: "duckdb", engine_version: "unset",
  }];
  m.results = [{
    id: "retention_by_arm", execution_id: "ex_retention_by_arm", path: "results/retention_by_arm.json", row_key: "arm",
    columns: [
      { name: "arm", type: "text", unit: "text", description: "Experiment arm." },
      { name: "signups", type: "integer", unit: "users", display: { kind: "integer" } },
      { name: "retained_7d_rate", type: "decimal", unit: "ratio", display: { kind: "percent", decimals: 1 }, definition_ref: { id: "returned_within_7_days", version: 1 } },
    ],
    row_count: 0, content_hash: zero,
  }];
  m.checks = [
    { id: "unique_users", kind: "invariant", path: "checks/unique_users.sql", required: true, outcome: "not_run", description: "No user is counted twice.", content_hash: zero, execution_id: "ex_retention_by_arm" },
    { id: "both_arms_large_enough", kind: "minimum_data", path: "checks/both_arms_large_enough.sql", required: false, outcome: "not_run", description: "Each arm holds at least five hundred users.", content_hash: zero, execution_id: "ex_retention_by_arm" },
  ];
  m.export_policy.allowed_fields = ["retention_by_arm.arm", "retention_by_arm.signups", "retention_by_arm.retained_7d_rate"];
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
}

async function builtFinding(): Promise<{ dir: string; instanceRoot: string }> {
  const instanceRoot = scratchInstance();
  const created = newFinding({ slug: "checklist-retention", ask: "Did the onboarding checklist help new users come back?", reader: "product_owner", instanceDir: instanceRoot, date: "2026-07-20" });
  assert.deepEqual(created.errors, [], JSON.stringify(created.errors));
  const dir = join(instanceRoot, "findings", "2026-07-20-checklist-retention");
  const captured = await capture({ dir, tables: ["users", "events"] });
  assert.deepEqual(captured.errors, [], JSON.stringify(captured.errors));
  authorAnalysis(dir, instanceRoot);
  return { dir, instanceRoot };
}

test("capture retains the declared tables with hashes and honest source metadata, and never claims a guarantee it did not observe", async () => {
  const instanceRoot = scratchInstance();
  newFinding({ slug: "capture-only", ask: "Anything.", reader: "product_owner", instanceDir: instanceRoot, date: "2026-07-20" });
  const dir = join(instanceRoot, "findings", "2026-07-20-capture-only");
  const report = await capture({ dir, tables: ["users", "events"] });
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  const m: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  assert.deepEqual(m.snapshot.inputs.map((i: any) => i.id), ["users", "events"]);
  for (const input of m.snapshot.inputs) {
    assert.ok(existsSync(join(dir, input.path)), input.path);
    assert.match(input.content_hash.value, /^[a-f0-9]{64}$/);
    assert.equal(input.source.adapter, "duckdb");
    assert.equal(input.source.consistency, "single_transaction");
    assert.ok(!("runtime" in input), "the adapter's runtime field is summarised in description, not written where the schema rejects it");
  }
  assert.deepEqual(m.snapshot.guarantees, [], "capturing inputs establishes no replay or rerun guarantee on its own");
  assert.equal(report.sql_execution, "not_performed");
});

test("capture --catalog reads the catalog and writes nothing", async () => {
  const instanceRoot = scratchInstance();
  newFinding({ slug: "catalog-only", ask: "Anything.", reader: "product_owner", instanceDir: instanceRoot, date: "2026-07-20" });
  const dir = join(instanceRoot, "findings", "2026-07-20-catalog-only");
  const before = readFileSync(join(dir, "manifest.yaml"), "utf8");
  const report = await capture({ dir, catalog: true });
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  assert.ok(report.info.some((i) => /^table users: /.test(i) && /user_id/.test(i)), JSON.stringify(report.info));
  assert.equal(readFileSync(join(dir, "manifest.yaml"), "utf8"), before, "--catalog writes nothing");
  assert.ok(!existsSync(join(dir, "inputs", "users.csv")));
});

test("execute refuses a Finding with no retained inputs and names capture, rather than reaching for the live source", async () => {
  const instanceRoot = scratchInstance();
  newFinding({ slug: "no-inputs", ask: "Anything.", reader: "product_owner", instanceDir: instanceRoot, date: "2026-07-20" });
  const report = await execute({ dir: join(instanceRoot, "findings", "2026-07-20-no-inputs") });
  const problem = report.errors.find((e) => e.location === "manifest.yaml#/snapshot/inputs");
  assert.ok(problem, JSON.stringify(report.errors));
  assert.match(problem!.message, /never reads a live source/);
  assert.match(problem!.remedy ?? "", /aftergrid capture/);
  assert.equal(report.sql_execution, "not_performed");
});

test("capture then execute produces evidence that is valid on rerun, and a second execute is a no-op on the digest", async () => {
  const { dir } = await builtFinding();
  const ran = await execute({ dir });
  assert.deepEqual(ran.errors, [], JSON.stringify(ran.errors));
  assert.equal(ran.sql_execution, "performed");

  const m: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  assert.equal(m.checks.find((c: any) => c.id === "unique_users").outcome, "pass");
  assert.equal(m.checks.find((c: any) => c.id === "both_arms_large_enough").outcome, "pass");
  assert.deepEqual(m.snapshot.guarantees, ["artifact_replay", "analysis_rerun"]);
  assert.equal(m.executions[0].mode, "retained_rerun");
  assert.equal(m.executions[0].adapter, "duckdb");
  assert.equal(m.results[0].row_count, 2);
  const saved = JSON.parse(readFileSync(join(dir, "results", "retention_by_arm.json"), "utf8"));
  assert.deepEqual(saved.rows.map((r: any) => r.arm).sort(), ["checklist", "control"]);
  assert.equal(typeof saved.rows[0].retained_7d_rate, "string", "decimals keep full precision as strings");

  const rerun = await check({ dir, mode: "rerun", github: null });
  assert.deepEqual(rerun.errors, [], JSON.stringify(rerun.errors));
  assert.equal(rerun.evidence, "valid");
  assert.equal(rerun.sql_execution, "performed");

  const digest = m.content_digest.value;
  const again = await execute({ dir });
  assert.deepEqual(again.errors, [], JSON.stringify(again.errors));
  const m2: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  assert.equal(m2.content_digest.value, digest, "re-running the same SQL on the same retained inputs changes nothing the digest covers");
});

test("execute refuses to change content an attestation binds to, and discards the run rather than write it", async () => {
  const { dir } = await builtFinding();
  assert.deepEqual((await execute({ dir })).errors, []);
  const m: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  m.attestations = [{
    kind: "publication_approval",
    source: { type: "github_pr_review", repository: "example/analytics", pull_request: 1, review_id: 2, commit_sha: "a".repeat(40) },
    attester: "an-operator", date: "2026-07-21", content_digest: m.content_digest,
  }];
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));

  // Re-running unchanged SQL changes nothing the digest covers, so it is allowed.
  assert.deepEqual((await execute({ dir })).errors, [], "an unchanged rerun does not disturb an attestation");

  // Changing a Check changes the content the attestation binds to.
  writeFileSync(join(dir, "checks", "unique_users.sql"), UNIQUE_USERS_SQL.replace("count(*) = count(distinct user_id)", "count(distinct user_id) = count(*)"));
  const before = readFileSync(join(dir, "manifest.yaml"), "utf8");
  const refused = await execute({ dir });
  const problem = refused.errors.find((e) => e.category === "stale_attestation");
  assert.ok(problem, JSON.stringify(refused.errors));
  assert.match(problem!.remedy ?? "", /bump finding\.revision/);
  assert.equal(readFileSync(join(dir, "manifest.yaml"), "utf8"), before, "nothing was written");
});

test("a failing minimum_data Check is recorded as a business result; a failing required Check is an error", async () => {
  const { dir } = await builtFinding();
  writeFileSync(join(dir, "checks", "both_arms_large_enough.sql"), MIN_ARM_SQL.replace(">= 500", ">= 100000"));
  const thin = await execute({ dir });
  assert.deepEqual(thin.errors, [], "an optional minimum_data Check that fails is data, not an engine failure");
  assert.ok(thin.warnings.some((w) => w.category === "check_failed" && /business result/.test(w.message)), JSON.stringify(thin.warnings));
  const m: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  assert.equal(m.checks.find((c: any) => c.id === "both_arms_large_enough").outcome, "fail", "the outcome is written down as it happened");

  // The same Check marked required is an error, and the outcome is still recorded honestly.
  m.checks.find((c: any) => c.id === "both_arms_large_enough").required = true;
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  const required = await execute({ dir });
  const problem = required.errors.find((e) => e.category === "check_failed");
  assert.ok(problem, JSON.stringify(required.errors));
  assert.match(problem!.remedy ?? "", /insufficient_data/);

  // A Check with the wrong shape is an engine failure: nothing is written at all.
  const before = readFileSync(join(dir, "manifest.yaml"), "utf8");
  writeFileSync(join(dir, "checks", "unique_users.sql"), "select 1 as pass, 2 as detail");
  const broken = await execute({ dir });
  assert.ok(broken.errors.some((e) => e.category === "check_shape"), JSON.stringify(broken.errors));
  assert.equal(broken.sql_execution, "not_performed");
  assert.equal(readFileSync(join(dir, "manifest.yaml"), "utf8"), before, "an engine failure writes nothing");
});

test("a proposed definition is written as proposed with no approval, and an approved one is never rewritten", () => {
  const instanceRoot = scratchInstance();
  const created = proposeDefinition(instanceRoot, {
    id: "weekly_active_days", version: 1, kind: "diagnostic", grain: "user", population: "users active in the window",
    denominator: "days in the week", window: "calendar week, analytical timezone UTC", owner: "An Operator",
    meaning: "How many days in a week a user opened the app.", sql: { duckdb: "select 1 as placeholder" },
  });
  assert.deepEqual(created.problems, []);
  assert.equal(created.action, "created");
  const text = readFileSync(join(instanceRoot, "definitions", "weekly_active_days.md"), "utf8");
  const front: any = parseYaml(/^---\n([\s\S]*?)\n---\n/.exec(text)![1]!);
  assert.equal(front.lifecycle, "proposed");
  assert.equal(front.kind, "diagnostic");
  assert.equal(front.approval, undefined, "a proposal never carries an approval block");
  assert.equal(front.approver, undefined);

  // An approved definition from the fixture Instance is left exactly as it was.
  const approved = join(instanceRoot, "definitions", "retained_7d.md");
  cpSync(join(REPO, "fixtures/instance/analytics/definitions/retained_7d.md"), approved);
  const bytes = readFileSync(approved);
  const refused = proposeDefinition(instanceRoot, {
    id: "retained_7d", version: 3, kind: "metric", grain: "user", population: "anything", denominator: "anything",
    window: "anything", owner: "An Operator", meaning: "A rewrite that must not happen.", sql: { duckdb: "select 1 as placeholder" },
  });
  assert.equal(refused.written, false);
  assert.equal(refused.action, "refused");
  assert.equal(refused.problems[0]!.category, "definition_not_approved");
  assert.match(refused.problems[0]!.remedy ?? "", /definition_approval/);
  assert.deepEqual(readFileSync(approved), bytes, "the approved definition file is untouched");
});

test("analysis.yaml records the Checks before the analysis queries, and a Check recorded after a query is an error", () => {
  const dir = mkdtempSync(join(tmpdir(), "ag-order-"));
  const base: any = parseYaml(readFileSync(join(RUNS, "7qg-onboarding", "analysis.yaml"), "utf8"));
  assert.deepEqual(validateAnalysisFile(dir), [], "no analysis.yaml is not a defect");

  writeFileSync(join(dir, "analysis.yaml"), toYaml(base, { lineWidth: 0 }));
  assert.deepEqual(validateAnalysisFile(dir), [], JSON.stringify(validateAnalysisFile(dir)));

  const kinds = base.execution_order.map((s: any) => s.kind);
  assert.ok(kinds.lastIndexOf("check") < kinds.indexOf("query"), "the recorded run itself puts every Check before the first query");

  const shuffled = structuredClone(base);
  const firstCheck = shuffled.execution_order.findIndex((s: any) => s.kind === "check");
  const [moved] = shuffled.execution_order.splice(firstCheck, 1);
  shuffled.execution_order.push(moved);
  writeFileSync(join(dir, "analysis.yaml"), toYaml(shuffled, { lineWidth: 0 }));
  const problems = validateAnalysisFile(dir);
  const order = problems.find((p) => p.category === "analysis_contract" && /recorded after a query/.test(p.message));
  assert.ok(order, JSON.stringify(problems));
  assert.match(order!.remedy ?? "", /before the final analysis SQL/);
});

test("the recorded onboarding run is an Analysis the writer can consume against the exemplar's manifest", () => {
  const dir = join(RUNS, "7qg-onboarding");
  const manifest = parseYaml(readFileSync(join(EXEMPLAR, "manifest.yaml"), "utf8"));
  assert.deepEqual(validateAnalysisFile(dir, manifest), [], JSON.stringify(validateAnalysisFile(dir, manifest)));

  const analysis: any = parseYaml(readFileSync(join(dir, "analysis.yaml"), "utf8"));
  assert.ok(analysis.assumptions.length, "assumptions are recorded");
  assert.equal(analysis.reader_profile, "product_owner");
  assert.equal(analysis.pre_registered_comparison.registered_before_cuts, true);
  assert.equal(analysis.outcome_recommendation.outcome, "answered");
  assert.equal(analysis.candidate_claims.filter((c: any) => c.answer_bearing).length, 1);
  const exploratory = analysis.execution_order.filter((s: any) => s.exploratory);
  assert.ok(exploratory.length, "the exploratory cut is labelled as one in the execution order");
  for (const step of exploratory) {
    const claim = analysis.candidate_claims.find((c: any) => (c.evidence ?? []).some((r: string) => r.startsWith(`ref:${step.id}.`)));
    if (claim) assert.equal(claim.comparison.pre_registered, false, `${claim.id} rests on an exploratory cut and says so`);
  }

  // The clarified Question is the manifest.question block, and it never invented a falsifier it could not run.
  const question: any = parseYaml(readFileSync(join(dir, "clarified-question.yaml"), "utf8")).question;
  assert.equal(question.state, "resolved");
  assert.equal(question.falsifier.kind, "check");
  assert.ok(analysis.execution_order.some((s: any) => s.kind === "check" && s.id === question.falsifier.check_id), "the falsifier is a Check that was written before the analysis queries");
});

test("the recorded referral run ends in insufficient_data with a specific needs-input and no fabricated falsifier", () => {
  const dir = join(RUNS, "7qg-referral");
  assert.deepEqual(validateAnalysisFile(dir), [], JSON.stringify(validateAnalysisFile(dir)));

  const analysis: any = parseYaml(readFileSync(join(dir, "analysis.yaml"), "utf8"));
  assert.equal(analysis.outcome_recommendation.outcome, "insufficient_data");
  assert.ok(analysis.outcome_recommendation.what_would_be_needed.length, "a non-answer says what would be needed");
  assert.ok(analysis.candidate_claims.every((c: any) => c.numeric === false || c.evidence.length), "no Claim asserts a number without evidence");
  assert.ok(analysis.needs_input.length, "the run names what it stopped for");
  for (const need of analysis.needs_input) {
    assert.ok(need.owner && need.description.length > 40, `needs_input must be specific enough to act on: ${JSON.stringify(need)}`);
  }

  const question: any = parseYaml(readFileSync(join(dir, "clarified-question.yaml"), "utf8")).question;
  assert.equal(question.state, "unresolved");
  assert.ok(question.unresolved.includes("falsifier"));
  assert.equal(question.falsifier, undefined, "an unresolved Question never carries a fabricated falsifier");
});

test("repeated clarification re-asks nothing: every settled part of the Question is already in the recorded artifacts", () => {
  for (const run of ["7qg-onboarding", "7qg-referral"]) {
    const recorded: any = parseYaml(readFileSync(join(RUNS, run, "clarified-question.yaml"), "utf8"));
    const question = recorded.question;
    const analysis: any = parseYaml(readFileSync(join(RUNS, run, "analysis.yaml"), "utf8"));
    const settled = ["decision", "metric", "population", "window", "primary_comparison", "falsifier"].filter((part) => question[part] !== undefined);
    const unresolved = question.unresolved ?? [];
    for (const part of settled) assert.ok(!unresolved.includes(part), `${run}: ${part} is both settled and listed unresolved`);
    for (const part of unresolved) assert.ok(!settled.includes(part), `${run}: ${part} is listed unresolved but already answered`);
    assert.ok(question.raw_ask, `${run}: the raw ask is kept verbatim beside the sharpened Question`);
    assert.equal(recorded.reader.profile, analysis.reader_profile, `${run}: the Reader is named once and agrees across the two files`);
  }
});
