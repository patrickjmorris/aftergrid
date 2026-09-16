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
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { newFinding } from "./commands/new-finding.ts";
import { capture } from "./commands/capture.ts";
import { execute } from "./commands/execute.ts";
import { check } from "./commands/check.ts";
import { validateAnalysisFile, analysisWarnings } from "./analysis/validate.ts";
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
    // No `if (claim)`: a run that labels a cut exploratory and rests no Claim on it, or names the Claim's
    // evidence after something else, would otherwise pass this loop without asserting anything.
    const claim = analysis.candidate_claims.find((c: any) => (c.evidence ?? []).some((r: string) => r.startsWith(`ref:${step.id}.`)));
    assert.ok(claim, `the exploratory cut ${step.id} has a candidate Claim whose evidence names it`);
    assert.equal(claim.comparison.pre_registered, false, `${claim.id} rests on an exploratory cut and says so`);
  }
  // The causal Claim names the design that earns it, and the only design that does.
  const causal = analysis.candidate_claims.filter((c: any) => c.type === "causal");
  assert.ok(causal.length, "the headline Claim of this run is causal");
  for (const c of causal) assert.equal(c.causal_basis, "randomised_assignment", `${c.id} is causal only because assignment was random`);

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

/**
 * Parts a round asked about although they were already settled — by the Instance before round 1, or by an
 * earlier round's answers. Empty means no round re-interrogated anything.
 */
function reAskedParts(rounds: any): { round: number | string; part: string }[] {
  const settled = new Set<string>((rounds.settled_before_round_1 ?? []).map((s: any) => s.part));
  const offences: { round: number | string; part: string }[] = [];
  for (const round of rounds.rounds ?? []) {
    for (const part of round.asked ?? []) if (settled.has(part)) offences.push({ round: round.round, part });
    for (const part of round.answered ?? []) settled.add(part);
  }
  for (const part of rounds.re_entry?.asked ?? []) if (settled.has(part)) offences.push({ round: "re_entry", part });
  return offences;
}

test("repeated clarification re-asks nothing: no round asks about a part the Instance or an earlier round had settled", () => {
  const PARTS = ["decision", "reader", "metric", "population", "window", "primary_comparison", "falsifier"];
  for (const run of ["7qg-onboarding", "7qg-referral"]) {
    const rounds: any = parseYaml(readFileSync(join(RUNS, run, "clarification-rounds.yaml"), "utf8"));
    const question: any = parseYaml(readFileSync(join(RUNS, run, "clarified-question.yaml"), "utf8")).question;
    const unresolved: string[] = question.unresolved ?? [];

    assert.deepEqual(reAskedParts(rounds), [], `${run}: a round asked about a part that was already settled`);

    // The negative control: the same checker on a copy whose last round re-asks something round 1 settled.
    const mutated = structuredClone(rounds);
    const firstAnswered = (mutated.rounds ?? []).flatMap((r: any) => r.answered ?? [])[0];
    assert.ok(firstAnswered, `${run}: the recorded rounds settle at least one part`);
    mutated.rounds.push({ round: 99, asked: [firstAnswered], answered: [firstAnswered] });
    assert.deepEqual(reAskedParts(mutated), [{ round: 99, part: firstAnswered }],
      `${run}: the re-asking check must fail on a run that re-asks a settled part`);

    // A second pass asks only what is still open, and restates the rest instead of re-interrogating it.
    for (const part of rounds.re_entry?.asked ?? []) {
      assert.ok(unresolved.includes(part), `${run}: the re-entry pass asks '${part}', which the Question does not list as unresolved`);
    }
    for (const part of rounds.re_entry?.restated ?? []) {
      assert.ok(!unresolved.includes(part), `${run}: '${part}' is restated as settled but listed in question.unresolved`);
    }

    // What the rounds settled is exactly what the Question records as settled, part for part.
    const settledByRounds = new Set<string>([
      ...(rounds.settled_before_round_1 ?? []).map((s: any) => s.part),
      ...(rounds.rounds ?? []).flatMap((r: any) => r.answered ?? []),
    ]);
    const settledInQuestion = new Set(PARTS.filter((part) => (part === "reader" ? true : question[part] !== undefined)));
    assert.deepEqual([...settledByRounds].sort(), [...settledInQuestion].sort(),
      `${run}: the rounds and the recorded Question disagree about which parts are settled`);
    for (const part of unresolved) {
      assert.ok(!settledByRounds.has(part), `${run}: '${part}' is listed unresolved but a round recorded it as answered`);
    }
    for (const part of PARTS) {
      assert.ok(settledByRounds.has(part) || unresolved.includes(part), `${run}: '${part}' is neither settled nor listed unresolved`);
    }
  }
});

test("the recorded runs keep the Question and the Analysis consistent about what is settled", () => {
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

// ---------------------------------------------------------------------------------------------------------
// Regressions from the 2026-09-16 review of ag-grill-checked-analysis-7qg. Each test names the defect it keeps
// fixed, and each one fails on the code as it stood before that review.
// ---------------------------------------------------------------------------------------------------------

/** A complete `stage: analysed` Analysis for the Finding `builtFinding()` produces, with the given overrides. */
function analysedFor(overrides: Record<string, any> = {}): any {
  return {
    schema_version: "0.1.0",
    stage: "analysed",
    reader_profile: "product_owner",
    assumptions: [],
    probes: [],
    execution_order: [{ kind: "check", id: "unique_users" }, { kind: "check", id: "both_arms_large_enough" }, { kind: "query", id: "retention_by_arm" }],
    candidate_claims: [{
      id: "c1",
      sentence_draft: "Users assigned the checklist came back within a week at the rate the table records.",
      type: "descriptive",
      numeric: true,
      evidence: ["ref:retention_by_arm.checklist.retained_7d_rate"],
      comparison: { kind: "none", pre_registered: true },
      population: "Users assigned to either onboarding inside the window.",
      window: { start: "2026-06-01", end: "2026-07-12", timezone: "America/New_York" },
      exclusions: [],
      limitations: ["Recorded for a regression test, not for a Reader."],
      recheck_draft: { mode: "not_automatically_evaluable", reason: "This Claim exists to exercise reference resolution.", owner: "An Operator" },
    }],
    outcome_recommendation: { outcome: "inconclusive", reason: "A fixture Analysis, not a real one.", what_would_be_needed: ["A real Question behind it."] },
    ...overrides,
  };
}

test("capture refuses a --description that claims a bound it never applied, and its own description says whole table", async () => {
  const instanceRoot = scratchInstance();
  newFinding({ slug: "bound-claim", ask: "Anything.", reader: "product_owner", instanceDir: instanceRoot, date: "2026-07-20" });
  const dir = join(instanceRoot, "findings", "2026-07-20-bound-claim");
  const before = readFileSync(join(dir, "manifest.yaml"), "utf8");

  const refused = await capture({ dir, tables: ["users"], description: "Signups 2026-05-31 to 2026-07-13 UTC (bounded one day either side of the window so timezone conversion cannot drop a row)." });
  const problem = refused.errors.find((e) => e.location === "--description");
  assert.ok(problem, JSON.stringify(refused.errors));
  assert.match(problem!.message, /capture applies no bound/);
  assert.match(problem!.remedy ?? "", /analysis SQL/);
  assert.equal(readFileSync(join(dir, "manifest.yaml"), "utf8"), before, "a refused description writes nothing");
  assert.ok(!existsSync(join(dir, "inputs", "users.csv")), "and reads nothing");

  // A description that describes what was captured is accepted, and the recorded provenance stays honest.
  const ok = await capture({ dir, tables: ["users"], description: "Every user row as it stood on 2026-07-20." });
  assert.deepEqual(ok.errors, [], JSON.stringify(ok.errors));
  const m: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  assert.equal(m.snapshot.inputs[0].description, "Every user row as it stood on 2026-07-20.");
  assert.match(m.snapshot.inputs[0].source.method, /^select \* from users/, "the method records the read that actually happened");

  // With no --description at all, the adapter's own wording says how much of the table it took.
  newFinding({ slug: "plain-capture", ask: "Anything.", reader: "product_owner", instanceDir: instanceRoot, date: "2026-07-20" });
  const plainDir = join(instanceRoot, "findings", "2026-07-20-plain-capture");
  const plain = await capture({ dir: plainDir, tables: ["users"] });
  assert.deepEqual(plain.errors, [], JSON.stringify(plain.errors));
  const plainManifest: any = parseYaml(readFileSync(join(plainDir, "manifest.yaml"), "utf8"));
  assert.match(plainManifest.snapshot.inputs[0].description, /[Ww]hole-table extract/);
});

test("the /grill-question seed is a valid Analysis file at stage clarified, and check reports its evidence valid", async () => {
  const instanceRoot = scratchInstance();
  newFinding({ slug: "seeded", ask: "Did anything change?", reader: "product_owner", instanceDir: instanceRoot, date: "2026-07-20" });
  const dir = join(instanceRoot, "findings", "2026-07-20-seeded");

  // Exactly the sections docs/contracts/analysis-directory.md gives /grill-question, plus the stage.
  const seed: any = {
    schema_version: "0.1.0",
    stage: "clarified",
    reader_profile: "product_owner",
    assumptions: [{ id: "a_window_timezone", statement: "The window is read in America/New_York.", basis: "operator_answer", settled_by: "An Operator, round 2" }],
    pre_registered_comparison: { statement: "Checklist arm versus control arm over the window.", registered_before_cuts: true },
    needs_input: [{ kind: "clarification", description: "How many users per arm are enough for the comparison to be worth running?", owner: "An Operator" }],
  };
  writeFileSync(join(dir, "analysis.yaml"), toYaml(seed, { lineWidth: 0 }));
  assert.deepEqual(validateAnalysisFile(dir), [], "the documented seed is a complete artifact for its stage");

  const report = await check({ dir, github: null });
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  assert.equal(report.evidence, "valid", "a Question with no analysis behind it yet is not invalid evidence");

  // Absence of `stage` still means `analysed`: a seed does not become complete by omitting the field.
  const { stage: _dropped, ...noStage } = seed;
  writeFileSync(join(dir, "analysis.yaml"), toYaml(noStage, { lineWidth: 0 }));
  const problems = validateAnalysisFile(dir);
  const missing = problems.map((p) => p.message).join(" | ");
  for (const section of ["probes", "execution_order", "candidate_claims", "outcome_recommendation"]) {
    assert.match(missing, new RegExp(`'${section}'`), `a file with no stage is still required to carry ${section}`);
  }
  assert.match(problems[0]!.remedy ?? "", /stage: clarified/, "and the remedy names the stage that makes a seed legal");
});

test("execute reports a partial analysis.yaml as a problem instead of throwing away the report of a run that happened", async () => {
  const { dir } = await builtFinding();
  writeFileSync(join(dir, "analysis.yaml"), "schema_version: 0.1.0\nreader_profile: generic\n");

  const ran = await execute({ dir });   // before the fix this threw a TypeError out of analysisSummary
  assert.equal(ran.sql_execution, "performed", "the evidence was written, and the report says so");
  assert.ok(ran.errors.some((e) => e.category === "analysis_contract"), JSON.stringify(ran.errors));
  assert.ok(existsSync(join(dir, "results", "retention_by_arm.json")), "the results of the run are on disk");
  const m: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  assert.equal(m.checks.find((c: any) => c.id === "unique_users").outcome, "pass");

  // A clarified seed mid-run is reported, never rejected: /checked-analysis executes before it fills the file.
  writeFileSync(join(dir, "analysis.yaml"), toYaml({
    schema_version: "0.1.0", stage: "clarified", reader_profile: "product_owner", assumptions: [],
  }, { lineWidth: 0 }));
  const seeded = await execute({ dir });
  assert.deepEqual(seeded.errors, [], JSON.stringify(seeded.errors));
  assert.ok(seeded.warnings.some((w) => w.location === "analysis.yaml#/stage"), JSON.stringify(seeded.warnings));
  assert.ok(seeded.info.some((i) => /stage clarified/.test(i)), JSON.stringify(seeded.info));
});

test("execute refuses a Check that resolves to no execution, rather than record a pass check --mode rerun contradicts", async () => {
  const { dir } = await builtFinding();
  const m: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  m.executions = [];
  m.results = [];
  m.queries = [];
  m.checks = [{ id: "unique_users", kind: "invariant", path: "checks/unique_users.sql", required: true, outcome: "not_run", description: "No user is counted twice.", content_hash: { algorithm: "sha256", value: "0".repeat(64) } }];
  m.export_policy.allowed_fields = [];
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  const before = readFileSync(join(dir, "manifest.yaml"), "utf8");

  const refused = await execute({ dir });
  const problem = refused.errors.find((e) => e.category === "execution_binding");
  assert.ok(problem, JSON.stringify(refused.errors));
  assert.match(problem!.message, /no execution/);
  assert.match(problem!.remedy ?? "", /rerun/);
  assert.equal(refused.sql_execution, "not_performed");
  assert.equal(readFileSync(join(dir, "manifest.yaml"), "utf8"), before, "nothing was written");

  const after: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  assert.equal(after.checks[0].outcome, "not_run", "no outcome was recorded for a Check nobody can rerun");
  assert.deepEqual(after.snapshot.guarantees, [], "and no replay or rerun guarantee was claimed for a run with no result");

  // A Check naming an execution that does not exist is the same defect: the structural rule reaches it first,
  // and it is refused before any SQL runs rather than run against every retained input.
  m.checks[0].execution_id = "ex_that_never_existed";
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  const named = await execute({ dir });
  assert.ok(named.errors.some((e) => /execution/i.test(e.message)), JSON.stringify(named.errors));
  assert.equal(named.sql_execution, "not_performed");
  assert.equal(parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8")).checks[0].outcome, "not_run");
});

test("both recorded Question blocks parse as intended and validate against the Finding manifest schema", () => {
  const schema: any = JSON.parse(readFileSync(join(REPO, "schema/finding-manifest.schema.json"), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validateQuestion = ajv.compile({ ...schema.properties.question, $defs: schema.$defs });

  for (const run of ["7qg-onboarding", "7qg-referral"]) {
    const recorded: any = parseYaml(readFileSync(join(RUNS, run, "clarified-question.yaml"), "utf8"));
    assert.ok(validateQuestion(recorded.question), `${run}: ${JSON.stringify(validateQuestion.errors)}`);
    // The window is where an unquoted comma silently split a description into a fifth, null-valued key.
    assert.deepEqual(Object.keys(recorded.question.window).filter((k) => !["start", "end", "timezone", "description"].includes(k)), [],
      `${run}: question.window carries a key the schema does not allow — quote any value containing a comma`);
    for (const [key, value] of Object.entries(recorded.question.window)) {
      assert.notEqual(value, null, `${run}: question.window.${key} parsed as null`);
    }
  }
});

test("a candidate Claim's evidence must resolve to a cell that exists, not merely to a declared column", async () => {
  const { dir } = await builtFinding();
  assert.deepEqual((await execute({ dir })).errors, []);
  const manifest: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));

  writeFileSync(join(dir, "analysis.yaml"), toYaml(analysedFor(), { lineWidth: 0 }));
  assert.deepEqual(validateAnalysisFile(dir, manifest), [], "a reference to a row the query produced resolves");

  const bogus = analysedFor();
  bogus.candidate_claims[0].evidence = ["ref:retention_by_arm.no_such_arm.retained_7d_rate"];
  writeFileSync(join(dir, "analysis.yaml"), toYaml(bogus, { lineWidth: 0 }));
  const problems = validateAnalysisFile(dir, manifest);
  const rowKey = problems.find((p) => p.category === "unresolved_reference" && /row key 'no_such_arm'/.test(p.message));
  assert.ok(rowKey, JSON.stringify(problems));
  assert.match(rowKey!.remedy ?? "", /arm/);

  // Two rows under one key is the other way a reference fails to name one cell.
  const saved = JSON.parse(readFileSync(join(dir, "results", "retention_by_arm.json"), "utf8"));
  saved.rows.push(structuredClone(saved.rows[0]));
  writeFileSync(join(dir, "results", "retention_by_arm.json"), JSON.stringify(saved, null, 2) + "\n");
  writeFileSync(join(dir, "analysis.yaml"), toYaml(analysedFor(), { lineWidth: 0 }));
  assert.ok(validateAnalysisFile(dir, manifest).some((p) => p.category === "duplicate_row_key"), "a duplicated row key is reported");
});

test("a non-answer must say what would be needed, so the contract's fourth rule is enforced and not merely described", () => {
  const dir = mkdtempSync(join(tmpdir(), "ag-nonanswer-"));
  const base: any = parseYaml(readFileSync(join(RUNS, "7qg-referral", "analysis.yaml"), "utf8"));
  writeFileSync(join(dir, "analysis.yaml"), toYaml(base, { lineWidth: 0 }));
  assert.deepEqual(validateAnalysisFile(dir), [], JSON.stringify(validateAnalysisFile(dir)));

  for (const outcome of ["inconclusive", "insufficient_data", "needs_reframing"]) {
    const stripped = structuredClone(base);
    stripped.outcome_recommendation = { outcome, reason: base.outcome_recommendation.reason };
    writeFileSync(join(dir, "analysis.yaml"), toYaml(stripped, { lineWidth: 0 }));
    const problems = validateAnalysisFile(dir);
    assert.ok(problems.some((p) => /what_would_be_needed/.test(p.message)), `${outcome}: ${JSON.stringify(problems)}`);
  }

  const empty = structuredClone(base);
  empty.outcome_recommendation.what_would_be_needed = [];
  writeFileSync(join(dir, "analysis.yaml"), toYaml(empty, { lineWidth: 0 }));
  assert.ok(validateAnalysisFile(dir).length, "an empty list is not an answer to what would be needed");
});

test("a causal candidate Claim carries the design that earns it, and no other value passes", () => {
  const dir = mkdtempSync(join(tmpdir(), "ag-causal-"));
  const causal = analysedFor();
  causal.candidate_claims[0].type = "causal";
  causal.candidate_claims[0].comparison = { kind: "variant_vs_control", description: "Checklist arm versus control arm.", pre_registered: true };

  writeFileSync(join(dir, "analysis.yaml"), toYaml(causal, { lineWidth: 0 }));
  assert.ok(validateAnalysisFile(dir).some((p) => /causal_basis/.test(p.message)), "a causal Claim with no recorded design is refused");

  const unearned = structuredClone(causal);
  unearned.candidate_claims[0].causal_basis = "none";
  writeFileSync(join(dir, "analysis.yaml"), toYaml(unearned, { lineWidth: 0 }));
  const refused = validateAnalysisFile(dir);
  const problem = refused.find((p) => p.category === "analysis_contract" && /type causal with causal_basis 'none'/.test(p.message));
  assert.ok(problem, JSON.stringify(refused));
  assert.match(problem!.remedy ?? "", /associational/);

  const earned = structuredClone(causal);
  earned.candidate_claims[0].causal_basis = "randomised_assignment";
  writeFileSync(join(dir, "analysis.yaml"), toYaml(earned, { lineWidth: 0 }));
  assert.deepEqual(validateAnalysisFile(dir), [], JSON.stringify(validateAnalysisFile(dir)));
});

test("candidate Claims may cite values the writer will create, named under requested_derived and requested_external_sources", async () => {
  const { dir } = await builtFinding();
  assert.deepEqual((await execute({ dir })).errors, []);
  const manifest: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  assert.deepEqual(manifest.derived, [], "an Analysis directory has no derived values yet");
  assert.deepEqual(manifest.external_sources, [], "and no external sources yet");

  const requesting = analysedFor({
    requested_derived: [{
      id: "lift", operation: "difference", unit: "ratio",
      operands: ["ref:retention_by_arm.checklist.retained_7d_rate", "ref:retention_by_arm.control.retained_7d_rate"],
      description: "Checklist rate minus control rate; the writer declares it in manifest.derived.",
    }],
    requested_external_sources: [{
      id: "keep_threshold", kind: "target", value: "0.03", unit: "ratio",
      source: { type: "document", description: "The experiment plan's agreed bar.", date: "2026-05-20", owner: "An Operator" },
    }],
  });
  requesting.candidate_claims[0].evidence = ["ref:retention_by_arm.checklist.retained_7d_rate", "derived:lift", "ext:keep_threshold"];
  writeFileSync(join(dir, "analysis.yaml"), toYaml(requesting, { lineWidth: 0 }));
  assert.deepEqual(validateAnalysisFile(dir, manifest), [], JSON.stringify(validateAnalysisFile(dir, manifest)));

  // An id that is requested nowhere still fails, and the remedy names where to declare it.
  const unrequested = structuredClone(requesting);
  unrequested.candidate_claims[0].evidence = ["derived:nowhere"];
  writeFileSync(join(dir, "analysis.yaml"), toYaml(unrequested, { lineWidth: 0 }));
  const problems = validateAnalysisFile(dir, manifest);
  assert.ok(problems.some((p) => p.category === "unresolved_reference" && /requested_derived/.test(p.remedy ?? "")), JSON.stringify(problems));

  // A requested derived value's own operands are resolved too.
  const badOperand = structuredClone(requesting);
  badOperand.requested_derived[0].operands = ["ref:retention_by_arm.no_such_arm.retained_7d_rate"];
  writeFileSync(join(dir, "analysis.yaml"), toYaml(badOperand, { lineWidth: 0 }));
  assert.ok(validateAnalysisFile(dir, manifest).some((p) => /row key 'no_such_arm'/.test(p.message)), "a requested value cannot be built from a cell that does not exist");
});

test("a probe taken after a result was seen is recorded where it happened, marked post_hoc", () => {
  const dir = mkdtempSync(join(tmpdir(), "ag-posthoc-"));
  const late = analysedFor({
    probes: [{ id: "p_late_look", at: "2026-07-20T15:40:00Z", kind: "exploratory", question: "Does the gap hold inside each signup week?", observed: "It does in five of six weeks.", changed_plan: "Nothing: it is a lead for the next experiment." }],
  });
  late.execution_order = [...late.execution_order, { kind: "probe", id: "p_late_look", post_hoc: true, note: "Taken after the headline table was read." }];
  writeFileSync(join(dir, "analysis.yaml"), toYaml(late, { lineWidth: 0 }));
  assert.deepEqual(validateAnalysisFile(dir), [], JSON.stringify(validateAnalysisFile(dir)));

  // Without the label it is an ordering violation, so the label is a record and not a loophole.
  const unlabelled = structuredClone(late);
  delete unlabelled.execution_order.at(-1).post_hoc;
  writeFileSync(join(dir, "analysis.yaml"), toYaml(unlabelled, { lineWidth: 0 }));
  assert.ok(validateAnalysisFile(dir).some((p) => /recorded after a query/.test(p.message)), "an unlabelled late probe is still an ordering error");

  // And post_hoc belongs to a probe: a Check cannot claim it to escape the ordering rule.
  const sneaked = structuredClone(late);
  sneaked.execution_order = [...analysedFor().execution_order, { kind: "check", id: "unique_users", post_hoc: true }];
  writeFileSync(join(dir, "analysis.yaml"), toYaml(sneaked, { lineWidth: 0 }));
  assert.ok(validateAnalysisFile(dir).length, "post_hoc is only ever a property of a probe");
});

test("a candidate Claim's definition_refs resolve in manifest.definitions at the version the Analysis read", async () => {
  const { dir } = await builtFinding();
  assert.deepEqual((await execute({ dir })).errors, []);
  const manifest: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));

  const pinned = analysedFor();
  pinned.candidate_claims[0].definition_refs = [{ id: "returned_within_7_days", version: 1 }];
  writeFileSync(join(dir, "analysis.yaml"), toYaml(pinned, { lineWidth: 0 }));
  assert.deepEqual(validateAnalysisFile(dir, manifest), [], JSON.stringify(validateAnalysisFile(dir, manifest)));

  const untraced = structuredClone(pinned);
  untraced.candidate_claims[0].definition_refs = [{ id: "platform_group", version: 1 }];
  writeFileSync(join(dir, "analysis.yaml"), toYaml(untraced, { lineWidth: 0 }));
  const problems = validateAnalysisFile(dir, manifest);
  assert.ok(problems.some((p) => p.category === "unresolved_reference" && /platform_group/.test(p.message)), JSON.stringify(problems));

  const wrongVersion = structuredClone(pinned);
  wrongVersion.candidate_claims[0].definition_refs = [{ id: "returned_within_7_days", version: 2 }];
  writeFileSync(join(dir, "analysis.yaml"), toYaml(wrongVersion, { lineWidth: 0 }));
  assert.ok(validateAnalysisFile(dir, manifest).some((p) => p.category === "definition_version"), "reading a version the manifest does not pin is a defect");
});

test("the Analysis file's comparison kinds are the manifest's, and the proposed grouping is the SQL that ran", () => {
  const analysisSchema: any = JSON.parse(readFileSync(join(REPO, "src/analysis/analysis.schema.json"), "utf8"));
  const manifestSchema: any = JSON.parse(readFileSync(join(REPO, "schema/finding-manifest.schema.json"), "utf8"));
  assert.deepEqual(
    analysisSchema.properties.candidate_claims.items.properties.comparison.properties.kind.enum,
    manifestSchema.$defs.claim.properties.comparison.properties.kind.enum,
    "the writer copies comparison.kind through unchanged, so the two enums cannot disagree",
  );

  // The proposed Diagnostic and the query that produced the numbers it describes must say the same thing.
  const proposal = readFileSync(join(RUNS, "7qg-onboarding", "proposed-definitions", "platform_group.md"), "utf8");
  const sql = readFileSync(join(EXEMPLAR, "queries", "retention_by_platform_arm.sql"), "utf8");
  const expression = /case when platform in \('ios', 'android'\) then 'mobile' else 'web' end/;
  assert.match(proposal, expression, "the proposal's canonical SQL is the expression the query ran");
  assert.match(sql, expression, "and the query still uses it");
});

// ---------------------------------------------------------------------------------------------------------
// ag-3ce: the middle of the analysis is recorded in place. A probe carries the time it was taken and what
// kind of look it was, a reframe says what changed, dead ends are kept, and the list reads as a timeline.
// ---------------------------------------------------------------------------------------------------------

/** One probe, with the given overrides, complete enough to be legal on its own. */
function probe(over: Record<string, any> = {}): any {
  return {
    id: "p_catalog", at: "2026-07-20T12:05:00Z", kind: "exploratory",
    question: "Does anything record which onboarding a user saw, rather than which they were assigned?",
    observed: "Nothing does; only the assigned arm is stored.",
    changed_plan: "The population is 'assigned to', not 'saw'.",
    ...over,
  };
}

test("a probe records when it was taken and what kind of look it was, and both are required", () => {
  const dir = mkdtempSync(join(tmpdir(), "ag-probe-kind-"));
  const write = (probes: any[]) => writeFileSync(join(dir, "analysis.yaml"), toYaml(analysedFor({ probes }), { lineWidth: 0 }));

  write([probe()]);
  assert.deepEqual(validateAnalysisFile(dir), [], JSON.stringify(validateAnalysisFile(dir)));

  const { at: _dropped, ...noTime } = probe();
  write([noTime]);
  const untimed = validateAnalysisFile(dir);
  assert.ok(untimed.some((p) => p.location === "analysis.yaml#/probes/0" && /'at'/.test(p.message)), JSON.stringify(untimed));
  assert.match(untimed[0]!.remedy ?? "", /harness's clock/, "the remedy says where the time comes from, not just which field is missing");
  assert.match(untimed[0]!.remedy ?? "", /never invented after the fact/, "and that it is not invented afterwards");

  write([probe({ at: "the morning of the 20th" })]);
  assert.ok(validateAnalysisFile(dir).some((p) => p.location === "analysis.yaml#/probes/0/at"), "a prose time is not a timestamp");

  const { kind: _noKind, ...unkinded } = probe();
  write([unkinded]);
  assert.ok(validateAnalysisFile(dir).some((p) => /'kind'/.test(p.message)), "kind is required");

  write([probe({ kind: "hunch" })]);
  const wrongKind = validateAnalysisFile(dir);
  assert.ok(wrongKind.some((p) => p.location === "analysis.yaml#/probes/0/kind"), JSON.stringify(wrongKind));
  assert.match(JSON.stringify(wrongKind), /dead_end/, "the three kinds are named in the report");

  // All three kinds are legal, and a dead end is a first-class entry rather than something to delete.
  for (const kind of ["exploratory", "dead_end", "reframe"]) {
    write([probe({ kind, changed_plan: "Recorded; the plan went the other way." })]);
    assert.deepEqual(validateAnalysisFile(dir), [], `${kind} is a legal probe kind`);
  }
});

test("a reframe probe names what changed, and a reframe that names nothing is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "ag-reframe-"));
  const write = (probes: any[]) => writeFileSync(join(dir, "analysis.yaml"), toYaml(analysedFor({ probes }), { lineWidth: 0 }));

  const { changed_plan: _none, ...silent } = probe({ kind: "reframe" });
  write([silent]);
  const refused = validateAnalysisFile(dir);
  assert.ok(refused.some((p) => /^analysis\.yaml#\/probes\/0/.test(p.location) && /'changed_plan'/.test(p.message)), JSON.stringify(refused));
  assert.ok(refused.some((p) => /grill-question/.test(p.remedy ?? "")), "the remedy points at the Question change and the revisit");
  assert.equal(refused.length, 1, `one precise problem, not a second 'must match then schema' echo: ${JSON.stringify(refused)}`);

  // An exploratory probe is under no such obligation: `changed_plan` stays optional there.
  write([{ ...silent, kind: "exploratory" }]);
  assert.deepEqual(validateAnalysisFile(dir), [], "a look that changed nothing is still a look worth recording");

  write([probe({ kind: "reframe", changed_plan: "Question reframed from 'does video cause ranking' to 'is video associated with ranking'; /grill-question revisited the same afternoon." })]);
  assert.deepEqual(validateAnalysisFile(dir), [], JSON.stringify(validateAnalysisFile(dir)));
});

test("probes out of timeline order are a warning, never an error: the fix is the times, not the sort", async () => {
  const { dir } = await builtFinding();
  const ordered = [probe({ id: "p1", at: "2026-07-20T12:05:00Z" }), probe({ id: "p2", at: "2026-07-20T12:40:00Z" })];
  writeFileSync(join(dir, "analysis.yaml"), toYaml(analysedFor({ probes: ordered }), { lineWidth: 0 }));
  assert.deepEqual(analysisWarnings(dir), [], "a list in the order it happened has nothing to report");

  const backwards = [ordered[0], probe({ id: "p2", at: "2026-07-20T11:00:00Z" })];
  writeFileSync(join(dir, "analysis.yaml"), toYaml(analysedFor({ probes: backwards }), { lineWidth: 0 }));
  const warnings = analysisWarnings(dir);
  assert.equal(warnings.length, 1, JSON.stringify(warnings));
  assert.equal(warnings[0]!.location, "analysis.yaml#/probes/1/at");
  assert.match(warnings[0]!.message, /timeline/, "the message says what the order is for");
  assert.deepEqual(validateAnalysisFile(dir), [], "and the Analysis is not refused over it");

  // check reports it where a warning goes, and the Finding is not failed over it.
  const report = await check({ dir, github: null });
  assert.ok(report.warnings.some((w) => w.location === "analysis.yaml#/probes/1/at"), JSON.stringify(report.warnings));
  assert.ok(!report.errors.some((e) => /probes/.test(e.location)), JSON.stringify(report.errors));

  // Equal timestamps are non-decreasing: two looks taken in the same minute are not a defect.
  const together = [probe({ id: "p1", at: "2026-07-20T12:05:00Z" }), probe({ id: "p2", at: "2026-07-20T12:05:00Z" })];
  writeFileSync(join(dir, "analysis.yaml"), toYaml(analysedFor({ probes: together }), { lineWidth: 0 }));
  assert.deepEqual(analysisWarnings(dir), [], "non-decreasing, not strictly increasing");
});

test("every recorded run's probes carry a time and a kind, in order, with the dead end kept", () => {
  const files = [
    join(RUNS, "7qg-onboarding", "analysis.yaml"),
    join(RUNS, "7qg-referral", "analysis.yaml"),
    join(RUNS, "kpc-numeric", "input", "analysis.yaml"),
    join(RUNS, "kpc-insufficient", "input", "analysis.yaml"),
  ];
  const kinds = new Set<string>();
  for (const file of files) {
    const analysis: any = parseYaml(readFileSync(file, "utf8"));
    assert.ok(analysis.probes.length, `${file}: a recorded run's middle is not empty`);
    let previous = 0;
    for (const p of analysis.probes) {
      const at = Date.parse(p.at);
      assert.ok(Number.isFinite(at), `${file}: probe ${p.id} has no parseable at`);
      assert.ok(["exploratory", "dead_end", "reframe"].includes(p.kind), `${file}: probe ${p.id} kind ${p.kind}`);
      assert.ok(at >= previous, `${file}: probe ${p.id} is timestamped before the one above it`);
      previous = at;
      kinds.add(p.kind);
    }
    assert.deepEqual(analysisWarnings(join(file, "..")), [], `${file}: recorded probes read as a timeline`);
  }
  assert.ok(kinds.has("dead_end"), "a path considered and abandoned is recorded as one, not deleted from the run");
});
