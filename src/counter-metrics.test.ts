// Seam: the counter-metric (ag-counter-metric-fv0, docs/contracts/instance-layout.md "Counter-metrics",
// docs/contracts/finding-manifest.md "Counter-metrics the decision metric names").
//
// A Metric definition may name what pushing it hard would damage, and a Finding that publishes such a
// definition as its decision metric must report it. What can be asserted here is the mechanism and its edges:
// the field is omitted when empty so no already-approved definition's hash moved; a listed counter-metric with
// no report is an error once the Finding is complete and a warning while it is a draft; a reported value has to
// be traced to the counter-metric's OWN execution over the Question's OWN window; and "none, because …" has a
// place to be recorded rather than looking identical to never having asked.
//
// Not asserted here: whether a `not_computed` reason is honest, or whether a counter-metric that moved the wrong
// way was treated as a result. No Check can see either; both are the method review's
// (skills/analysis-review/references/reviewer-briefs.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { proposeDefinition, renderProposedDefinition, counterMetricProblems } from "./analysis/definitions.ts";
import { check, checkArtifact } from "./commands/check.ts";
// @ts-ignore: shared ESM validation library.
import { definitionHash, digestOf } from "../scripts/lib/validate-finding.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const FIXTURE_DEFINITIONS = join(REPO, "fixtures/instance/analytics/definitions");
/** The negative fixture whose decision metric names a counter-metric and reports it, traced. */
const REPORTED_CASE = join(REPO, "fixtures/negatives/counter-metric-reported");

const BASE: Parameters<typeof proposeDefinition>[1] = {
  id: "weekly_active_days", version: 1, kind: "metric", grain: "user", population: "users active in the window",
  denominator: "days in the week", window: "calendar week, analytical timezone UTC", owner: "An Operator",
  meaning: "How many days in a week a user opened the app.", sql: { duckdb: "select 1 as placeholder" },
};

function scratchInstance(): string {
  const root = mkdtempSync(join(tmpdir(), "ag-counter-metric-"));
  writeFileSync(join(root, "aftergrid.yaml"), "schema_version: 0.1.0\ninstance_root: .\n");
  return root;
}

/** A temp copy of a committed negative-fixture Instance, with one case's manifest edited and re-digested. */
function stageCase(caseDir: string, edit: (m: any) => void): { dir: string; report: ReturnType<typeof checkArtifact> } {
  const stage = mkdtempSync(join(tmpdir(), "ag-counter-stage-"));
  const root = join(stage, "negatives");
  cpSync(join(REPO, "fixtures/negatives"), root, { recursive: true });
  const dir = join(root, caseDir);
  const m: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  edit(m);
  m.content_digest = digestOf(m, dir);
  for (const review of m.reviews ?? []) review.content_digest = m.content_digest;
  for (const a of m.attestations ?? []) a.content_digest = m.content_digest;
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  return { dir, report: checkArtifact({ dir, mode: "artifact" }) };
}

const counterProblems = (r: { errors: any[]; warnings: any[] }) => ({
  errors: r.errors.filter((e) => e.category === "counter_metric_missing"),
  warnings: r.warnings.filter((w) => w.category === "counter_metric_missing"),
});

/* ------------------------------------------------------------------ the hash does not move for definitions without it */

test("a definition that names no counter-metric writes no counter_metrics key, so every hash is what it was", () => {
  // The whole reason the field is omitted when empty: a `counter_metrics: []` would be a new byte in the front
  // matter of every definition that has none, and every approval bound to a content hash would break at once.
  const bytes = renderProposedDefinition(BASE);
  assert.ok(!/counter_metric/.test(bytes), `no counter-metric key is written when none was named:\n${bytes}`);
  assert.deepEqual(renderProposedDefinition({ ...BASE, counterMetrics: [] }), bytes, "an empty list writes the same bytes as an absent one");

  // And the fixture Instance's own definitions: each one that carries no counter-metric field hashes to the
  // value pinned here, which was recorded from the tree before counter-metrics existed.
  const before: Record<string, string> = {
    "retained_7d.md": "a496990d0aa0bc832758710d1c778d4de4add966e70fe0b7e891a55df3fc08f8",
    "weekly_cancellation_rate.md": "4dad915c7cdebfe0887b91c0d3618caf494948fc21265ee9c95bc3aa578e2efd",
  };
  let checked = 0;
  for (const name of readdirSync(FIXTURE_DEFINITIONS).sort()) {
    const text = readFileSync(join(FIXTURE_DEFINITIONS, name), "utf8");
    const front: any = parseYaml(/^---\n([\s\S]*?)\n---/.exec(text)![1]!);
    if (front.counter_metrics !== undefined || front.counter_metrics_none_because !== undefined) continue;
    assert.ok(!/^counter_metrics/m.test(text), `${name} carries no counter-metric field, so it carries no key either`);
    if (before[name]) { assert.equal(definitionHash(text).value, before[name], `${name} hashes to what it hashed before counter-metrics existed`); checked++; }
  }
  assert.ok(checked > 0, "at least one fixture definition without counter-metrics is pinned here, or this proves nothing");
});

test("the fixture definition that DOES name a counter-metric is a new version with an approval of its own", () => {
  // The approval consequence, stated as a fixture: naming a counter-metric changed habit_creation_rate's content
  // hash, so it is v2 and the approval binds the new content. That is the correct cost — what a metric would
  // damage if it were pushed is part of what the metric means.
  const text = readFileSync(join(FIXTURE_DEFINITIONS, "habit_creation_rate.md"), "utf8");
  const front: any = parseYaml(/^---\n([\s\S]*?)\n---/.exec(text)![1]!);
  assert.equal(front.version, 2);
  assert.equal(front.lifecycle, "approved");
  assert.deepEqual(front.counter_metrics.map((c: any) => c.id), ["retained_7d"]);
  assert.ok(String(front.counter_metrics[0].why).trim().length > 20, "why is a sentence, not a word");
  assert.equal(front.approval.content_hash.value, definitionHash(text).value,
    "the approval binds the definition's CURRENT content: naming a counter-metric needs a new approval, never an inherited one");
});

/* ------------------------------------------------------------------ the shape, and the recorded "none" */

test("counter_metrics shape is checked: another definition, a version that is a version, a why that is a sentence", () => {
  assert.deepEqual(counterMetricProblems(undefined, "primary"), [], "absent is the default and says nothing");
  assert.match(counterMetricProblems([], "primary")[0]!, /non-empty list, or absent/);
  assert.match(counterMetricProblems([{ id: "primary", why: "x" }], "primary")[0]!, /names this definition/);
  assert.match(counterMetricProblems([{ id: "Other", why: "x" }], "primary")[0]!, /not a definition id/);
  assert.match(counterMetricProblems([{ id: "a", why: "x" }, { id: "a", why: "y" }], "primary")[0]!, /listed twice/);
  assert.match(counterMetricProblems([{ id: "a", version: 0, why: "x" }], "primary")[0]!, /whole number of 1 or more/);
  assert.match(counterMetricProblems([{ id: "a", why: "  " }], "primary")[0]!, /one sentence/);
  assert.match(counterMetricProblems([{ id: "a", why: "x", note: "no" }] as any, "primary")[0]!, /unknown key 'note'/);
  assert.deepEqual(counterMetricProblems([{ id: "a", version: 2, why: "Gaming this lifts that." }], "primary"), []);
});

test("a proposal names a counter-metric that exists in the Instance, and is refused when it does not", () => {
  const root = scratchInstance();
  const refused = proposeDefinition(root, { ...BASE, counterMetrics: [{ id: "nowhere_metric", why: "Pushing this would push that." }] });
  assert.equal(refused.written, false);
  assert.equal(refused.problems[0]!.category, "schema");
  assert.match(refused.problems[0]!.message, /has no definition file at definitions\/nowhere_metric\.md/);

  // With the counter-metric's own definition present, the proposal is written and the key is rendered.
  proposeDefinition(root, { ...BASE, id: "nowhere_metric", meaning: "The counter.", counterMetricsNoneBecause: "Nothing trades against a fixed policy population." });
  const ok = proposeDefinition(root, { ...BASE, counterMetrics: [{ id: "nowhere_metric", version: 1, why: "Pushing this hard buys days from people who would have left, which is what that one counts." }] });
  assert.deepEqual(ok.problems, []);
  const front: any = parseYaml(/^---\n([\s\S]*?)\n---/.exec(readFileSync(join(root, "definitions", "weekly_active_days.md"), "utf8"))![1]!);
  assert.deepEqual(front.counter_metrics, [{ id: "nowhere_metric", version: 1, why: "Pushing this hard buys days from people who would have left, which is what that one counts." }]);
  assert.ok(ok.info.some((i) => /names 1 counter-metric\(s\) \[nowhere_metric\]/.test(i)), JSON.stringify(ok.info));
});

test("\"none, because …\" is recorded where an omission cannot be mistaken for it, and never alongside a list", () => {
  const root = scratchInstance();
  const none = proposeDefinition(root, { ...BASE, counterMetricsNoneBecause: "  This counts a fixed policy population no team can move, so pushing the rate has nothing to trade against.  " });
  assert.deepEqual(none.problems, []);
  const text = readFileSync(join(root, "definitions", "weekly_active_days.md"), "utf8");
  const front: any = parseYaml(/^---\n([\s\S]*?)\n---/.exec(text)![1]!);
  assert.equal(front.counter_metrics, undefined, "\"none\" is not an empty list");
  assert.equal(front.counter_metrics_none_because, "This counts a fixed policy population no team can move, so pushing the rate has nothing to trade against.");
  assert.ok(none.info.some((i) => /records that no counter-metric could be named, and why/.test(i)), JSON.stringify(none.info));

  // A definition that says both is refused: it either names counter-metrics or says why it names none.
  proposeDefinition(root, { ...BASE, id: "some_counter", meaning: "The counter." });
  const both = proposeDefinition(root, { ...BASE, counterMetrics: [{ id: "some_counter", why: "Pushing this pushes that." }], counterMetricsNoneBecause: "Nothing." });
  assert.equal(both.written, false);
  assert.ok(both.problems.some((p) => /does one or the other/.test(p.message)), JSON.stringify(both.problems));

  // Silence is reported as silence, so an Operator can see the question was never answered.
  const silent = proposeDefinition(scratchInstance(), BASE);
  assert.ok(silent.info.some((i) => /names no counter-metric and does not say why/.test(i)), JSON.stringify(silent.info));
});

/* ------------------------------------------------------------------ the publication-path rule */

test("the committed fixtures are the three answers: reported, missing, not computed", () => {
  const verdicts = Object.fromEntries(["counter-metric-reported", "counter-metric-missing", "counter-metric-not-computed"].map((name) => {
    const dir = join(REPO, "fixtures/negatives", name);
    const report = checkArtifact({ dir, mode: "artifact" });
    return [name, { errors: report.errors.map((e) => e.category), evidence: report.evidence }];
  }));
  assert.deepEqual(verdicts["counter-metric-reported"], { errors: [], evidence: "valid" },
    "a traced counter-metric over the Question's window is valid evidence");
  assert.deepEqual(verdicts["counter-metric-not-computed"], { errors: [], evidence: "valid" },
    "an explicit stated reason is valid evidence: what the Engine refuses is silence, not a hard case");
  assert.deepEqual(verdicts["counter-metric-missing"], { errors: ["counter_metric_missing"], evidence: "invalid" },
    "a published decision metric whose counter-metric is unreported is not publishable evidence");
});

test("counter_metric_missing forces not_ready and says why in its own words", () => {
  const report = checkArtifact({ dir: join(REPO, "fixtures/negatives/counter-metric-missing"), mode: "artifact" });
  assert.equal(report.readiness, "not_ready");
  assert.ok(report.readiness_reasons.some((r) => /counter-metric\(s\) named by this Finding's published decision metric are not reported/.test(r)),
    JSON.stringify(report.readiness_reasons));
  const problem = report.errors.find((e) => e.category === "counter_metric_missing")!;
  assert.match(problem.location, /^manifest\.yaml#\/definitions\/\d+$/);
  assert.match(problem.remedy ?? "", /not_computed with the reason/);
});

test("the full check command keeps the reason: the readiness list it rebuilds still names the counter-metric", async () => {
  // `check` REPLACES the offline readiness reasons with the publication assessment's, so the reason has to be
  // restated there or the one line an Operator needs disappears between `checkArtifact` and the command.
  const report = await check({ dir: join(REPO, "fixtures/negatives/counter-metric-missing"), github: null });
  assert.equal(report.readiness, "not_ready");
  assert.ok(report.readiness_reasons.some((r) => /counter-metric\(s\) named by this Finding's published decision metric are not reported/.test(r)),
    JSON.stringify(report.readiness_reasons));
  const clean = await check({ dir: join(REPO, "fixtures/negatives/counter-metric-not-computed"), github: null });
  assert.ok(!clean.readiness_reasons.some((r) => /counter-metric/.test(r)), JSON.stringify(clean.readiness_reasons));
});

test("a draft carries the same rule as a warning: it has not published anything yet", () => {
  // Same axis as definition_not_approved. `draft` forces `outcome: pending` under the schema, and the memo
  // template does not apply to a draft the way it applies to a complete Finding, so the only assertion that
  // matters here is the severity of THIS rule.
  const { report } = stageCase("counter-metric-missing", (m) => {
    m.finding.state = "draft";
    m.finding.outcome = "pending";
  });
  const { errors, warnings } = counterProblems(report);
  assert.deepEqual(errors, [], `a draft is warned, never refused: ${JSON.stringify(errors)}`);
  assert.equal(warnings.length, 1, JSON.stringify(report.warnings));
  assert.match(warnings[0]!.message, /the draft cannot complete until it is reported/);
});

test("a supporting definition's counter-metrics are nobody's obligation: the rule is about what is published", () => {
  const { report } = stageCase("counter-metric-missing", (m) => {
    m.definitions.find((d: any) => d.id === "habit_creation_rate").role = "supporting";
    m.definitions.find((d: any) => d.id === "retained_7d").role = "decision_metric";
  });
  assert.deepEqual(counterProblems(report).errors, [], JSON.stringify(report.errors));
  assert.deepEqual(counterProblems(report).warnings, [], JSON.stringify(report.warnings));
});

/* ------------------------------------------------------------------ same population and window, checked */

test("a reported counter-metric over another window is refused, and the message names both windows", () => {
  const { report } = stageCase("counter-metric-reported", (m) => {
    m.counter_metrics_reported[0].window.end = "2026-07-19";   // the coverage window, not the Question's
  });
  const { errors } = counterProblems(report);
  assert.equal(errors.length, 1, JSON.stringify(report.errors));
  assert.match(errors[0]!.location, /^manifest\.yaml#\/counter_metrics_reported\/0$/);
  assert.match(errors[0]!.message, /reported over 2026-06-01\.\.2026-07-19 America\/New_York and the Question's window is 2026-06-01\.\.2026-07-12 America\/New_York/);
});

test("a reported value must come from an execution that pins the counter-metric's own definition", () => {
  // The population and the denominator are the counter-metric definition's, so they are checked by binding the
  // number to that definition rather than by comparing prose. A column that merely sits in a nearby result set
  // is not the counter-metric: here the value is real, traced and exported, and it is still refused.
  const { report } = stageCase("counter-metric-reported", (m) => {
    for (const ex of m.executions) ex.definition_refs = ex.definition_refs.filter((r: any) => r.id !== "retained_7d");
    // Keep the manifest otherwise consistent: definition_refs is the only thing this case removes.
    for (const res of m.results) for (const col of res.columns) delete col.definition_ref;
  });
  const { errors } = counterProblems(report);
  assert.equal(errors.length, 1, JSON.stringify(report.errors));
  assert.match(errors[0]!.message, /none of which was produced by an execution pinning that definition/);
  assert.match(errors[0]!.remedy ?? "", /definition_refs including \{ id: retained_7d, version: 2 \}/);
});

test("a reported counter-metric whose definition the Finding does not pin is a name, not a metric", () => {
  const { report } = stageCase("counter-metric-reported", (m) => {
    m.counter_metrics_reported[0].version = 1;   // the definitions list pins retained_7d at v2
  });
  const messages = counterProblems(report).errors.map((e) => e.message);
  assert.ok(messages.some((msg) => /is reported and is not pinned in definitions at that version/.test(msg)), JSON.stringify(messages));
  assert.ok(messages.some((msg) => /pins the counter-metric retained_7d at v2 and this Finding reports v1/.test(msg)), JSON.stringify(messages));
});

test("a reported counter-metric outside the export allowlist fails as an export failure, in its own category", () => {
  // The counter-metric goes through the same strict resolver render uses, so a value a Reader could never be
  // shown is reported by the resolver's own category rather than mislabelled as a missing counter-metric.
  const { report } = stageCase("counter-metric-reported", (m) => {
    m.export_policy.allowed_fields = m.export_policy.allowed_fields.filter((f: string) => f !== "retention_by_arm.retained_7d_rate");
  });
  const at = report.errors.filter((e) => e.location === "manifest.yaml#/counter_metrics_reported/0");
  assert.ok(at.some((e) => e.category === "export_policy"), JSON.stringify(report.errors));
  assert.ok(!at.some((e) => e.category === "counter_metric_missing"), "the resolver's own category is reported, not a counter-metric one");
});

test("reporting a counter-metric nobody asked for is a warning, never a refusal", () => {
  const { report } = stageCase("counter-metric-reported", (m) => {
    m.counter_metrics_reported.push({ id: "weekly_cancellation_rate", version: 1, not_computed: "Subscriptions are not in this extract." });
    m.definitions.push({
      id: "weekly_cancellation_rate", version: 1, kind: "metric", lifecycle: "proposed",
      path: "definitions/weekly_cancellation_rate.md",
      content_hash: definitionHash(readFileSync(join(REPO, "fixtures/negatives/definitions/weekly_cancellation_rate.md"), "utf8")),
      role: "supporting",
    });
  });
  assert.deepEqual(counterProblems(report).errors, [], JSON.stringify(report.errors));
  const warnings = counterProblems(report).warnings;
  assert.equal(warnings.length, 1, JSON.stringify(report.warnings));
  assert.match(warnings[0]!.message, /weekly_cancellation_rate is reported as a counter-metric and no decision metric in this Finding names it/);
});

/* ------------------------------------------------------------------ what a Reader is shown */

test("the render shows each counter-metric as its own fact, with its value traced and its reason in words", () => {
  // Asserted against the committed page of the positive control, which `src/negatives.test.ts` renders.
  const manifest: any = parseYaml(readFileSync(join(REPORTED_CASE, "manifest.yaml"), "utf8"));
  assert.equal(manifest.counter_metrics_reported.length, 1);
  assert.equal(manifest.counter_metrics_reported[0].ref, "ref:retention_by_arm.checklist.retained_7d_rate");
  const expected: any = parseYaml(readFileSync(join(REPORTED_CASE, "expected.yaml"), "utf8"));
  assert.ok(expected.render.must_contain.some((s: string) => /<strong>Counter-metric<\/strong>/.test(s)),
    "the case asserts the counter-metric is its own fact on the page, not folded into the definition line");
  assert.ok(expected.render.must_contain.some((s: string) => /habits nobody comes back for/.test(s)),
    "the page repeats WHY the counter-metric was named, which lives in the primary definition's front matter");
});

/* ------------------------------------------------------------------ the contract says all of this */

test("the contracts state the rule, the severity axis and where \"none\" is recorded", () => {
  const says = (name: string, text: string, pattern: RegExp, what: string) =>
    assert.ok(pattern.test(text), `docs/contracts/${name} must ${what} (no match for ${pattern})`);
  const layout = readFileSync(join(REPO, "docs/contracts/instance-layout.md"), "utf8");
  const manifestDoc = readFileSync(join(REPO, "docs/contracts/finding-manifest.md"), "utf8");
  const checksDoc = readFileSync(join(REPO, "docs/contracts/checks-and-results.md"), "utf8");
  const memoDoc = readFileSync(join(REPO, "docs/contracts/memo-template.md"), "utf8");
  const renderDoc = readFileSync(join(REPO, "docs/contracts/render.md"), "utf8");

  says("instance-layout.md", layout, /counter_metrics_none_because/, "name the field a recorded \"none\" lives in");
  says("instance-layout.md", layout, /never\s+`counter_metrics: \[\]`/, "forbid the empty list that would move every approved hash");
  says("instance-layout.md", layout, /new version and a new Operator approval/, "state the approval consequence");
  says("instance-layout.md", layout, /front matter is validated in code/i, "say where definition front matter is validated");
  says("finding-manifest.md", manifestDoc, /counter_metric_missing/, "name the category");
  says("finding-manifest.md", manifestDoc, /equal\s+`question\.window`\s+field for field/, "say how the window is checked");
  says("finding-manifest.md", manifestDoc, /definition_refs/, "say how the population and denominator are bound");
  says("finding-manifest.md", manifestDoc, /error\*{0,2}\s+when\s+`finding\.state`\s+is\s+`complete`/, "state the severity axis");
  says("checks-and-results.md", checksDoc, /not a `checks\/<id>\.sql`/, "say the rule is not a Check file");
  says("memo-template.md", memoDoc, /Where a counter-metric goes/, "say where a counter-metric goes in the memo");
  says("render.md", renderDoc, /Counter-metric <id>/, "say what the Reader is shown");
});

test("the skills ask the question, record a \"none\", and hand the reporting to the writer and the reviewer", () => {
  const says = (name: string, text: string, pattern: RegExp, what: string) =>
    assert.ok(pattern.test(text), `${name} must ${what} (no match for ${pattern})`);
  const clarification = readFileSync(join(REPO, "skills/checked-analysis/references/clarification.md"), "utf8");
  const grill = readFileSync(join(REPO, "skills/grill-question/SKILL.md"), "utf8");
  const grillDoc = readFileSync(join(REPO, "docs/skills/grill-question.md"), "utf8");
  const writer = readFileSync(join(REPO, "skills/write-finding/SKILL.md"), "utf8");
  const briefs = readFileSync(join(REPO, "skills/analysis-review/references/reviewer-briefs.md"), "utf8");

  says("clarification.md", clarification, /What would get worse if this metric were pushed hard\?/, "ask the question in those words");
  says("clarification.md", clarification, /counter_metrics_none_because/, "give \"none\" a place to be recorded");
  says("clarification.md", clarification, /Never `counter_metrics: \[\]`/, "forbid the empty list");
  says("clarification.md", clarification, /definition_approval/, "send a change to an approved definition to the Operator");
  for (const [name, text] of [["skills/grill-question/SKILL.md", grill], ["docs/skills/grill-question.md", grillDoc]] as const) {
    says(name, text, /counter_metrics/, "name the field");
    says(name, text, /counter_metrics_none_because/, "name where a recorded \"none\" goes");
  }
  says("skills/write-finding/SKILL.md", writer, /counter_metrics_reported/, "name the manifest block the writer fills");
  says("skills/write-finding/SKILL.md", writer, /equal to question\.window/, "say the window is the Question's");
  says("skills/write-finding/SKILL.md", writer, /not_computed/, "say what to write when it cannot be computed");
  says("skills/write-finding/SKILL.md", writer, /moved the wrong way is a result/, "forbid burying a bad counter-metric");
  says("reviewer-briefs.md", briefs, /Counter-metrics honestly reported/, "give the method reviewer the line");
  says("reviewer-briefs.md", briefs, /blocking/, "say when it is blocking");
});
