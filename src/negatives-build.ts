// Seam-1 negative fixtures (ag-evidence-negatives-422). One small Finding directory per deliberate defect,
// generated from the two reviewed exemplars so that every hash and the content digest are correct for
// everything EXCEPT the defect. The generated directories are committed; `src/negatives.test.ts` runs
// `check` (and `render` where the case is about rendering) on a temp copy of each one.
//
// Nothing here executes SQL. The retained inputs are trimmed stubs, the Snapshot declares only
// `artifact_replay`, and the recorded execution and Check outcomes are carried over from the exemplar:
// they are fixture data, not a record of an execution in these directories. See fixtures/negatives/README.md.
//
// Regenerate with `node src/negatives-build.ts`. Generation is deterministic: no clock, no randomness.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
// @ts-ignore: shared ESM validation library — the one digest and definition-hash implementation.
import { digestOf, definitionHash } from "../scripts/lib/validate-finding.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const EXEMPLARS = join(REPO, "fixtures/instance/analytics/findings");
const SOURCE_INSTANCE = join(REPO, "fixtures/instance/analytics");
export const NEGATIVES_DIR = join(REPO, "fixtures/negatives");
export const PRIVATE_MARKER = "PRIVATE_FIXTURE_MARKER_DO_NOT_RENDER";

const NUMERIC_EXEMPLAR = "2026-07-20-onboarding-checklist-retention";
const NON_ANSWER_EXEMPLAR = "2026-09-15-price-change-cancellations";
/** Retained-input stubs keep the fixture set small; `check` verifies their hash and never reads them. */
const STUB_DATA_ROWS = 4;

export type Layer = "engine_category" | "analytical_outcome" | "review_concern";
/** error: check must report `category`. pass: check must report no error. readiness: no error, but never `ready`. */
export type Expectation = "error" | "pass" | "readiness";
export type Files = Map<string, string>;
export type Hash = { algorithm: "sha256"; value: string };

export type RenderExpectation = {
  /** True when `render` must refuse and write nothing, because `check` already found the evidence invalid. */
  refused?: boolean;
  must_contain?: string[];
  must_not_contain?: string[];
};

export type NegativeCase = {
  name: string;
  base: "numeric" | "non_answer";
  layer: Layer;
  expect: Expectation;
  /** The report category the defect must produce, or the name of the concern for a non-error expectation. */
  category: string;
  location_pattern: string;
  defect: string;
  description: string;
  /** Other error categories this one defect legitimately produces. Anything else means the case fails for the wrong reason. */
  also?: string[];
  /** Warning categories the case is allowed to raise. A negative must never rest on a stale review alone. */
  also_warnings?: string[];
  reason_pattern?: string;
  render?: RenderExpectation;
  /** Applies the defect to the manifest and the files, before any hash is pinned. */
  mutate?: (m: any, files: Files) => void;
  /** The directory as it stood when the attestation was recorded; used to compute the digest that was attested. */
  attested?: (files: Files) => void;
  /** Runs after every hash is pinned and before the digest, for a defect that must corrupt a pinned hash. */
  corrupt?: (m: any) => void;
  /** Runs after the content digest is pinned: reviews and attestations bind to a digest, so they are set last. */
  sign?: (m: any, digest: Hash, attested: Hash | null) => void;
};

// ---------------------------------------------------------------- helpers

const BASE36 = "abcdefghijklmnopqrstuvwxyz0123456789";
const sha = (text: string): string => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
const H = (text: string): Hash => ({ algorithm: "sha256", value: sha(text) });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A stable `fnd_` id per case, so regeneration is byte-identical and every case is its own Finding. */
export function findingIdFor(name: string): string {
  const bytes = createHash("sha256").update("aftergrid-negative-fixture:" + name).digest();
  let out = "";
  for (let i = 0; i < 12; i++) out += BASE36[bytes[i]! % 36];
  return "fnd_" + out;
}

const trimCsv = (text: string): string =>
  text.split("\n").filter((l) => l.length > 0).slice(0, STUB_DATA_ROWS + 1).join("\n") + "\n";

/** Replace exactly once, and fail loudly when the exemplar text moved: a silent no-op would make a fixture lie. */
function replaceOnce(text: string, from: string, to: string): string {
  const at = text.indexOf(from);
  if (at < 0 || text.indexOf(from, at + 1) >= 0) throw new Error(`negatives-build: expected exactly one occurrence of ${JSON.stringify(from.slice(0, 60))}`);
  return text.slice(0, at) + to + text.slice(at + from.length);
}

const resultOf = (m: any, id: string) => m.results.find((r: any) => r.id === id);

function editResult(m: any, files: Files, id: string, fn: (data: any) => void): void {
  const res = resultOf(m, id);
  const data = JSON.parse(files.get(res.path)!);
  fn(data);
  files.set(res.path, JSON.stringify(data, null, 2) + "\n");
}

function editChart(m: any, files: Files, id: string, fn: (spec: any) => any): void {
  const ch = m.charts.find((c: any) => c.id === id);
  const spec = JSON.parse(files.get(ch.spec_path)!);
  files.set(ch.spec_path, JSON.stringify(fn(spec) ?? spec, null, 2) + "\n");
}

const editMemo = (files: Files, fn: (memo: string) => string): void => void files.set("memo.md", fn(files.get("memo.md")!));

// ---------------------------------------------------------------- bases

const STUB_INPUT_DESCRIPTION =
  "Negative-fixture stub: the header row and the first few rows of the exemplar extract. check verifies this file's hash and never reads its contents; these cases are not rerunnable.";
const FIXTURE_REVIEWER = "fixture: generated by src/negatives-build.ts; no review was performed";
const FIXTURE_REVIEW_NOTE =
  "Generated negative fixture for the evidence seam. The recorded execution and Check outcomes are carried over from the exemplar; they are not a record of an execution in this directory.";
// No digits: this line is memo prose, and a numeral in the memo without a token is itself one of the defects here.
const APPENDIX_NOTE =
  "- This directory is a generated negative fixture for the evidence seam (fixtures/negatives). It is not a real Analysis, and nothing in it was reviewed or approved.\n";

function collectFiles(dir: string, m: any): Files {
  const files: Files = new Map();
  const add = (rel: string) => void files.set(rel, readFileSync(join(dir, rel), "utf8"));
  add("memo.md");
  for (const i of m.snapshot.inputs) add(i.path);
  for (const q of m.queries) add(q.path);
  for (const c of m.checks) add(c.path);
  for (const c of m.charts) add(c.spec_path);
  for (const r of m.results) add(r.path);
  return files;
}

/** Shared slimming and honesty edits for both exemplar bases. */
function slim(m: any, files: Files): void {
  for (const input of m.snapshot.inputs) {
    files.set(input.path, trimCsv(files.get(input.path)!));
    input.description = STUB_INPUT_DESCRIPTION;
    input.source = { ...input.source, method: "trimmed from the exemplar extract by src/negatives-build.ts" };
  }
  // The stubs cannot reproduce the saved numbers, so the Snapshot no longer claims a rerun guarantee.
  m.snapshot.guarantees = ["artifact_replay"];
  for (const ex of m.executions) ex.engine_version = "0.0.0-negative-fixture";
  m.reviews = [{ ...m.reviews[0], reviewer: FIXTURE_REVIEWER, blocking: [], non_blocking: [FIXTURE_REVIEW_NOTE] }];
  m.attestations = [];
  editMemo(files, (memo) =>
    replaceOnce(
      memo,
      "- Method review: recorded by the exemplar author. No human has approved this Finding for publication; it is a draft.",
      "- Method review: none was performed. This is a generated negative fixture; the recorded review entry says so. No human has approved this Finding for publication; it is a draft.",
    ) + APPENDIX_NOTE,
  );
}

function numericBase(): { manifest: any; files: Files } {
  const dir = join(EXEMPLARS, NUMERIC_EXEMPLAR);
  const m = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  // The by-week execution backs no Claim; dropping it keeps every case directory small.
  m.queries = m.queries.filter((q: any) => q.id !== "retention_by_week_arm");
  m.executions = m.executions.filter((e: any) => e.query_id !== "retention_by_week_arm");
  m.results = m.results.filter((r: any) => r.id !== "retention_by_week_arm");
  const files = collectFiles(dir, m);
  editMemo(files, (memo) => {
    memo = replaceOnce(memo, "retention_by_week_arm (stability by signup week), ", "");
    memo = replaceOnce(memo, "- Results: retention_by_arm, retention_by_week_arm, retention_by_platform_arm, under results/.", "- Results: retention_by_arm, retention_by_platform_arm, under results/.");
    memo = replaceOnce(memo, "- Retained inputs: inputs/users.csv, inputs/events.csv, hashes in the manifest.", "- Retained inputs: inputs/users.csv, inputs/events.csv, hashes in the manifest. Both are trimmed stubs in this fixture.");
    memo = replaceOnce(
      memo,
      "- Data: a retained copy of the users and app-open events for the experiment window. Anyone can replay these numbers from the saved results and rerun the queries against the retained copy.",
      "- Data: the saved results can be replayed. The retained inputs here are trimmed stubs, so the queries cannot be rerun against them.",
    );
    return memo;
  });
  slim(m, files);
  return { manifest: m, files };
}

function nonAnswerBase(): { manifest: any; files: Files } {
  const dir = join(EXEMPLARS, NON_ANSWER_EXEMPLAR);
  const m = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  const files = collectFiles(dir, m);
  editMemo(files, (memo) => {
    memo = replaceOnce(memo, "- Retained input: inputs/subscriptions.csv, hash in the manifest.", "- Retained input: inputs/subscriptions.csv, hash in the manifest. It is a trimmed stub in this fixture.");
    memo = replaceOnce(
      memo,
      "- Data: a retained copy of all subscriptions through the fourteenth of September. The numbers can be replayed from the saved results and rerun against the retained copy.",
      "- Data: the saved results can be replayed. The retained input here is a trimmed stub, so the queries cannot be rerun against it.",
    );
    return memo;
  });
  slim(m, files);
  return { manifest: m, files };
}

const BASES: Record<NegativeCase["base"], () => { manifest: any; files: Files }> = { numeric: numericBase, non_answer: nonAnswerBase };
const EXEMPLAR_OF: Record<NegativeCase["base"], string> = { numeric: NUMERIC_EXEMPLAR, non_answer: NON_ANSWER_EXEMPLAR };

// ---------------------------------------------------------------- the cases

const APPROVAL_SOURCE = { type: "github_pr_review", repository: "loop-example/analytics", pull_request: 12, review_id: 3100044, commit_sha: "3f2a9c1e5d7b4a6f8c0e2d4b6a8c0e2f4a6b8c0d" };
const approval = (digest: Hash) => ({ kind: "publication_approval", source: clone(APPROVAL_SOURCE), attester: "dana-okafor", date: "2026-07-20", content_digest: digest });

export const CASES: NegativeCase[] = [
  // ---- controls: these must pass ----
  {
    name: "control-valid",
    base: "numeric",
    layer: "engine_category",
    expect: "pass",
    category: "none",
    location_pattern: "",
    defect: "None. This is the unmodified base every numeric negative is derived from.",
    description: "check must report no error and evidence valid, so a failure in any other case is the defect and not the base.",
    render: { must_contain: ["34.8%", "28.5%", "6.3 pp"], must_not_contain: [PRIVATE_MARKER] },
  },
  {
    name: "control-non-answer",
    base: "non_answer",
    layer: "analytical_outcome",
    expect: "pass",
    category: "none",
    location_pattern: "",
    defect: "None. A complete Finding whose honest outcome is a non-answer (insufficient_data), with a minimum-data Check recorded as fail.",
    description: "A non-answer is an analytical outcome, not an engine failure: check must report no error and evidence valid even though a Check recorded fail.",
    render: { must_contain: ["We cannot tell yet", "this failure is the result of the Finding, not an error"] },
  },
  {
    name: "control-prose-dates-ids",
    base: "numeric",
    layer: "engine_category",
    expect: "pass",
    category: "none",
    location_pattern: "",
    defect: "None. The memo carries an ISO date, a timestamp, a numbered heading, manifest ids, a definition version, a file path and an explicit literal token.",
    description: "None of these is a measured quantity, so untraced_numeral must not fire on any of them.",
    mutate: (m, files) =>
      editMemo(files, (memo) => {
        memo = replaceOnce(memo, "# New users who got the onboarding checklist came back more often", "# 1. New users who got the onboarding checklist came back more often");
        return memo +
          `- Control line for the numeral rule: a date (2026-06-01), a timestamp (2026-07-20T14:05:00Z), a definition version (retained_7d v2), ids (${m.finding.id}, c1, retention_by_arm, unique_users), a file path (queries/retention_by_arm.sql) and an explicit non-evidence literal ({{literal:7-day}}). None of them is a measured quantity.\n`;
      }),
  },
  {
    name: "zero-denominator-derived",
    base: "numeric",
    layer: "engine_category",
    expect: "pass",
    category: "none",
    location_pattern: "",
    defect: "None. The web control arm has no signups, so a derived ratio divides by zero and a rate cell is null.",
    description: 'A zero denominator resolves to "not available" and is rendered with those words; it is never 0, blank or a dash.',
    render: { must_contain: ["the share of that group who came back is not available", "not available on the web"], must_not_contain: [PRIVATE_MARKER] },
    mutate: (m, files) => {
      const res = resultOf(m, "retention_by_platform_arm");
      res.columns.find((c: any) => c.name === "retained_7d_rate").nullable = true;
      editResult(m, files, "retention_by_platform_arm", (data) => {
        const row = data.rows.find((r: any) => r.platform_arm === "web_control");
        row.signups = 0; row.retained = 0; row.retained_7d_rate = null;
      });
      m.export_policy.allowed_fields.push("retention_by_platform_arm.retained");
      m.derived.push({
        id: "web_control_rate", operation: "ratio",
        operands: ["ref:retention_by_platform_arm.web_control.retained", "ref:retention_by_platform_arm.web_control.signups"],
        unit: "ratio", display: { kind: "percent", decimals: 1 }, on_zero_denominator: "not_available", on_null: "not_available",
        description: "Share of the web control arm who came back. Its denominator is zero in this Snapshot.",
      });
      const claim = m.claims.find((c: any) => c.id === "c2");
      claim.evidence.push("derived:web_control_rate");
      claim.limitations = ["No one was assigned the old onboarding on the web in this Snapshot, so there is no web comparison to make."];
      editMemo(files, (memo) =>
        replaceOnce(
          memo,
          "On the web the two groups are small, so the web number moves a lot with a handful of people: {{ref:retention_by_platform_arm.web_checklist.retained_7d_rate}} against {{ref:retention_by_platform_arm.web_control.retained_7d_rate}}.",
          "On the web, no one was assigned the old onboarding in this snapshot, so the share of that group who came back is {{derived:web_control_rate}} and the web comparison is {{ref:retention_by_platform_arm.web_checklist.retained_7d_rate}} against {{ref:retention_by_platform_arm.web_control.retained_7d_rate}}.",
        ));
    },
  },
  {
    name: "nullable-null-not-available",
    base: "numeric",
    layer: "engine_category",
    expect: "pass",
    category: "none",
    location_pattern: "",
    defect: "None. A column declared nullable holds null for one row.",
    description: 'A null in a nullable column is valid evidence and renders as "not available", in prose and in the table, never as 0.',
    render: { must_contain: ["not available came back", "<td class=\"num\">not available</td>"] },
    mutate: (m, files) => {
      resultOf(m, "retention_by_arm").columns.find((c: any) => c.name === "retained").nullable = true;
      editResult(m, files, "retention_by_arm", (data) => void (data.rows.find((r: any) => r.arm === "control").retained = null));
    },
  },
  {
    name: "display-only-rounding",
    base: "numeric",
    layer: "engine_category",
    expect: "pass",
    category: "none",
    location_pattern: "",
    defect: "None. The rate column declares whole-percent display while the saved values keep full precision.",
    description: "Rounding is display only and applied once: the render shows whole percents and the saved decimals never reach the page.",
    render: { must_contain: ["35%", "28%"], must_not_contain: ["0.34775641025641024", "0.28483920367534454", "34.8%"] },
    mutate: (m) => {
      for (const id of ["retention_by_arm", "retention_by_platform_arm"]) {
        resultOf(m, id).columns.find((c: any) => c.name === "retained_7d_rate").display = { kind: "percent", decimals: 0 };
      }
    },
  },
  {
    name: "private-field-sentinel",
    base: "numeric",
    layer: "engine_category",
    expect: "pass",
    category: "none",
    location_pattern: "",
    defect: "None. A declared but non-exported column carries the Instance's private marker in every row.",
    description: "The marker and the column name must be absent from every rendered byte; render refuses to write anything that still contains the marker.",
    render: { must_not_contain: [PRIVATE_MARKER, "internal_note"] },
    mutate: (m, files) => {
      resultOf(m, "retention_by_arm").columns.push({ name: "internal_note", type: "text", unit: "text", description: "Deliberately not in export_policy.allowed_fields: it must never reach a Reader." });
      editResult(m, files, "retention_by_arm", (data) => {
        data.columns.push("internal_note");
        for (const row of data.rows) row.internal_note = PRIVATE_MARKER;
      });
    },
  },

  // ---- readiness: no error, but never ready ----
  {
    name: "forged-attestation",
    base: "numeric",
    layer: "review_concern",
    expect: "readiness",
    category: "untrusted_attestation",
    location_pattern: "^manifest\\.yaml#/attestations/0$",
    reason_pattern: "unverified_note.*(not trusted|never an approval)",
    defect: "A publication_approval attestation whose source is an unverified_note, bound to the current digest.",
    description: "An unverified note never counts toward publication readiness: check reports no error, readiness stays not_ready and says why. Whether an informal note was passed off as an approval is then a review concern.",
    render: { must_contain: ["Draft", "None verified"] },
    sign: (m, digest) => {
      m.attestations = [{
        kind: "publication_approval",
        source: { type: "unverified_note", note: "Looks good to me. Fixture only: no human approved this Finding, and an unverified note is never an approval." },
        attester: "none", date: "2026-07-20", content_digest: digest,
      }];
    },
  },

  // ---- errors ----
  {
    name: "unresolved-reference",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "unresolved_reference",
    location_pattern: "^manifest\\.yaml#/claims/0/evidence/0$",
    defect: "The answer-bearing Claim's first evidence reference names a result set that is not in the manifest.",
    description: "Every value a Claim rests on must resolve to a saved result, a derived value or a typed external source.",
    mutate: (m) => void (m.claims[0].evidence[0] = "ref:no_such_result.checklist.retained_7d_rate"),
  },
  {
    name: "duplicate-row-key",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "duplicate_row_key",
    location_pattern: "^results/retention_by_arm\\.json row 1$",
    defect: "Both rows of the primary result set carry the row key 'checklist'.",
    description: "References resolve by row key, so a repeated key makes every reference into that result ambiguous.",
    mutate: (m, files) => editResult(m, files, "retention_by_arm", (data) => void (data.rows[1].arm = "checklist")),
  },
  {
    name: "missing-column",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "missing_column",
    location_pattern: "^manifest\\.yaml#/claims/0/evidence/0$",
    defect: "The answer-bearing Claim cites a column that the result set does not declare.",
    description: "A reference to an undeclared column is unresolvable; the Claim has no evidence for the number it states.",
    mutate: (m) => void (m.claims[0].evidence[0] = "ref:retention_by_arm.checklist.came_back"),
  },
  {
    name: "untraced-numeral",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "untraced_numeral",
    location_pattern: "^memo\\.md:\\d+:\\d+$",
    defect: "A data-bearing number is typed into the memo prose instead of a reference token.",
    description: "A measured quantity is never written by hand: it carries a {{ref:…}}, {{derived:…}} or {{ext:…}} token so it traces to evidence.",
    mutate: (_m, files) =>
      editMemo(files, (memo) =>
        replaceOnce(memo, "Compared with what: the people who were randomly given the old onboarding at the same time.",
          "Compared with what: the people who were randomly given the old onboarding at the same time. Roughly 6 in 10 of them opened the app on the first day.")),
  },
  {
    name: "chart-forbidden-transform",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "chart_subset",
    location_pattern: "^charts/retention_by_arm\\.vl\\.json$",
    defect: "The chart spec carries a top-level transform.",
    description: "A chart never computes: values come from the same saved result sets as every token, so a transform is refused.",
    mutate: (m, files) => editChart(m, files, "retention_by_arm_chart", (spec) => ({ ...spec, transform: [{ filter: "datum.arm == 'checklist'" }] })),
  },
  {
    name: "chart-layered-aggregate",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "chart_subset",
    location_pattern: "^charts/retention_by_arm\\.vl\\.json\\.layer\\[1\\]\\.encoding\\.",
    defect: "A layered chart spec aggregates on one encoding channel and bins on another, inside the second layer.",
    description: "The forbidden-key walk reaches into layers: a chart cannot aggregate or bin evidence anywhere in the spec.",
    mutate: (m, files) =>
      editChart(m, files, "retention_by_arm_chart", (spec) => ({
        $schema: spec.$schema,
        description: "Bound by the renderer to result retention_by_arm. Negative fixture: the second layer aggregates and bins.",
        data: { name: "result" },
        layer: [
          { mark: { type: "bar" }, encoding: { y: { field: "arm", type: "nominal", title: null }, x: { field: "retained_7d_rate", type: "quantitative", title: "Came back within 7 days (share of new users)" } } },
          { mark: { type: "text" }, encoding: { x: { field: "retained_7d_rate", type: "quantitative", aggregate: "mean" }, y: { field: "signups", type: "quantitative", bin: true } } },
        ],
      })),
  },
  {
    name: "missing-memo-section",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "template",
    location_pattern: "^memo\\.md$",
    defect: "The Appendix section is missing from the memo.",
    description: "The six memo sections are fixed and ordered; a Reader who cannot find how to rerun the numbers cannot inspect them.",
    mutate: (_m, files) => editMemo(files, (memo) => memo.slice(0, memo.indexOf("## Appendix"))),
  },
  {
    name: "claim-without-recheck",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "schema",
    location_pattern: "^manifest\\.yaml#/claims/1$",
    defect: "The second Claim declares no Recheck policy.",
    description: "Every Claim declares how it is re-tested on Revisit, or says explicitly that it cannot be evaluated automatically and why.",
    mutate: (m) => void delete m.claims[1].recheck,
  },
  {
    name: "decision-metric-not-approved",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "definition_not_approved",
    location_pattern: "^manifest\\.yaml#/definitions/1$",
    defect: "A complete Finding names a proposed, unapproved Metric definition as its decision metric.",
    description: "Only an approved definition may carry a published decision metric; a proposed one is supporting at most.",
    mutate: (m, files) => {
      m.definitions[0].role = "supporting";
      m.definitions.push({
        id: "weekly_cancellation_rate", version: 1, kind: "metric", lifecycle: "proposed",
        path: "definitions/weekly_cancellation_rate.md", content_hash: { algorithm: "sha256", value: "0".repeat(64) }, role: "decision_metric",
      });
      editMemo(files, (memo) =>
        replaceOnce(memo, "- Definition used: retained_7d v2.",
          "- Decision metric cited: weekly_cancellation_rate v1, which is only proposed and has never been approved.\n- Definition used: retained_7d v2."));
    },
  },
  {
    name: "definition-version-not-pinned",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "definition_version",
    location_pattern: "^manifest\\.yaml#/question/metric$",
    defect: "The Question cites a definition version that the manifest does not pin.",
    description: "A definition is referenced by id and version, and that exact version must be pinned with its content hash.",
    mutate: (m) => void (m.question.metric = { id: "retained_7d", version: 3 }),
  },
  {
    name: "failing-reconciliation-check",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "check_failed",
    location_pattern: "^checks/retained_7d_reconcile$",
    defect: "The required reconciliation Check is recorded as fail while the Finding still answers the Question.",
    description: "A required Check that did not pass is invalid evidence: the headline number does not reconcile with its own definition.",
    render: { refused: true },
    mutate: (m, files) => {
      m.checks.find((c: any) => c.id === "retained_7d_reconcile").outcome = "fail";
      editMemo(files, (memo) =>
        replaceOnce(memo, "- The count of people who came back matches the approved definition of \"came back within a week\" computed a second way (Check retained_7d_reconcile).",
          "- The count of people who came back does NOT match the approved definition of \"came back within a week\" computed a second way (Check retained_7d_reconcile, which failed)."));
    },
  },
  {
    name: "snapshot-input-hash-mismatch",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "hash_mismatch",
    location_pattern: "^manifest\\.yaml#/snapshot/inputs/0$",
    defect: "The pinned content hash of the first retained input does not match the file.",
    description: "A retained input that no longer hashes to what the Snapshot pinned is not the data the Analysis ran on.",
    corrupt: (m) => void (m.snapshot.inputs[0].content_hash.value = "0".repeat(64)),
  },
  {
    name: "stale-attestation",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "stale_attestation",
    location_pattern: "^manifest\\.yaml#/attestations/0$",
    defect: "A github_pr_review publication approval is bound to a content digest this directory does not have.",
    description: "An approval binds to an exact digest; a trusted source approving other content approves nothing here.",
    sign: (m) => void (m.attestations = [approval({ algorithm: "sha256", value: "f".repeat(64) })]),
  },
  {
    name: "artifact-modified-after-attestation",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "stale_attestation",
    also_warnings: ["stale_review"],
    location_pattern: "^manifest\\.yaml#/attestations/0$",
    defect: "The memo was edited after the approval and the method review were recorded, without a new revision.",
    description: "Editing content after an approval makes the approval and the review stale; the stale review alone is a warning, the stale approval is the error.",
    mutate: (_m, files) => editMemo(files, (memo) => memo + "- Added after the approval was recorded, without a new revision: a note the approver never read.\n"),
    attested: (files) => void files.set("memo.md", files.get("memo.md")!.replace("- Added after the approval was recorded, without a new revision: a note the approver never read.\n", "")),
    sign: (m, _digest, attested) => {
      m.attestations = [approval(attested!)];
      m.reviews[0].content_digest = attested!;
    },
  },
  {
    name: "derived-cycle",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "derived_cycle",
    location_pattern: "^manifest\\.yaml#/derived/\\d+ \\(derived self_reference\\)$",
    defect: "A derived value takes itself as an operand.",
    description: "The derived graph must be acyclic; a value that depends on itself has no evidence behind it.",
    mutate: (m) =>
      void m.derived.push({
        id: "self_reference", operation: "sum", operands: ["derived:self_reference", "ref:retention_by_arm.checklist.signups"],
        unit: "users", display: { kind: "integer" }, on_zero_denominator: "not_available", on_null: "not_available",
      }),
  },
  {
    name: "derived-unit-mismatch",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "unit_mismatch",
    location_pattern: "^difference$",
    defect: "A difference is taken between a ratio and a user count.",
    description: "difference and sum need identical units on every operand and on the output; units come from evidence, never from a SQL type.",
    mutate: (m) =>
      void m.derived.push({
        id: "rate_minus_signups", operation: "difference",
        operands: ["ref:retention_by_arm.checklist.retained_7d_rate", "ref:retention_by_arm.checklist.signups"],
        unit: "ratio", display: { kind: "percentage_points", decimals: 1 }, on_zero_denominator: "not_available", on_null: "not_available",
      }),
  },
  {
    name: "null-in-non-nullable-column",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "null_value",
    location_pattern: "^results/retention_by_arm\\.json row 1$",
    defect: "A column that is not declared nullable holds null.",
    description: "Null is a declared possibility or it is a fault: an undeclared null silently becomes a missing number a Reader cannot see.",
    mutate: (m, files) => editResult(m, files, "retention_by_arm", (data) => void (data.rows.find((r: any) => r.arm === "control").retained = null)),
  },
  {
    name: "external-source-missing-type",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "schema",
    location_pattern: "^manifest\\.yaml#/external_sources/0/source$",
    defect: "The typed external source has no source type.",
    description: "An external number carries a typed source (document, person, policy, url, prior_finding) so a Reader can see where it came from.",
    mutate: (m) => void delete m.external_sources[0].source.type,
  },
  {
    name: "unsupported-schema-version",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "schema",
    location_pattern: "^manifest\\.yaml#/schema_version$",
    defect: "The manifest declares a schema version the Engine does not know.",
    description: "check refuses an unknown manifest version rather than guessing which fields still mean what they say.",
    mutate: (m) => void (m.schema_version = "0.2.0"),
  },
  {
    name: "provisional-evidence",
    base: "numeric",
    layer: "engine_category",
    expect: "error",
    category: "provisional_evidence",
    location_pattern: "^manifest\\.yaml#/claims/1$",
    defect: "A Claim rests on a result set marked provisional.",
    description: "Provisional status propagates from results through derived values to Claims; a Claim resting on it is never rendered or exported.",
    render: { refused: true },
    mutate: (m) => void (resultOf(m, "retention_by_platform_arm").provisional = true),
  },
];

// ---------------------------------------------------------------- generation

const INSTANCE_YAML = `# Instance root for the seam-1 negative fixtures. Deliberately holds no decisions/ directory: these cases are
# about evidence integrity, and a Decision record would add an unrelated failure mode.
# Generated by src/negatives-build.ts. Layout: docs/contracts/instance-layout.md
schema_version: 0.1.0
instance_root: fixtures/negatives
connection:
  adapter: duckdb
  duckdb:
    path: data
    read_only: true
publication:
  repository: loop-example/analytics
  trusted_approvers: [dana-okafor]
  automation_login: loop-aftergrid-bot
export_defaults:
  recipient_scope: named_readers
  granularity: aggregate_only
owner:
  name: Dana Okafor
  contact: dana@loop.example
`;

const DEFINITION_FILES = ["retained_7d.md", "weekly_cancellation_rate.md"];

function writeFile(root: string, rel: string, text: string, written: string[]): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  written.push(rel);
}

function pinHashes(m: any, files: Files, instanceRoot: string): void {
  for (const input of m.snapshot.inputs) input.content_hash = H(files.get(input.path)!);
  for (const q of m.queries) q.content_hash = H(files.get(q.path)!);
  for (const c of m.checks) c.content_hash = H(files.get(c.path)!);
  for (const r of m.results) {
    r.row_count = JSON.parse(files.get(r.path)!).rows.length;
    r.content_hash = H(files.get(r.path)!);
  }
  for (const ex of m.executions) {
    ex.sql_hash = H(files.get(m.queries.find((q: any) => q.id === ex.query_id).path)!);
    ex.result_hash = H(files.get(m.results.find((r: any) => r.id === ex.result_id).path)!);
  }
  for (const d of m.definitions) d.content_hash = definitionHash(readFileSync(join(instanceRoot, d.path), "utf8"));
}

function manifestHeader(c: NegativeCase): string {
  return `# Seam-1 negative fixture: ${c.name}. Generated by src/negatives-build.ts from the reviewed exemplar\n` +
    `# fixtures/instance/analytics/findings/${EXEMPLAR_OF[c.base]}; every hash and the content digest are correct\n` +
    `# except where the defect makes them wrong. Deliberate defect: ${c.defect}\n` +
    `# Expected from check: ${c.expect === "error" ? c.category : c.expect === "readiness" ? "no error, readiness not_ready" : "no error"} (see expected.yaml).\n` +
    `# The recorded outcomes and timestamps come from the exemplar; no SQL ran here. Regenerate, never hand-edit.\n`;
}

function expectedYaml(c: NegativeCase): string {
  const doc: Record<string, unknown> = {
    case: c.name,
    layer: c.layer,
    expect: c.expect,
    category: c.category,
    location_pattern: c.location_pattern,
    defect: c.defect,
    description: c.description,
  };
  if (c.also?.length) doc.also = c.also;
  if (c.also_warnings?.length) doc.also_warnings = c.also_warnings;
  if (c.reason_pattern) doc.reason_pattern = c.reason_pattern;
  if (c.render) doc.render = c.render;
  return "# What the Engine must report for this case. Generated by src/negatives-build.ts; read by src/negatives.test.ts.\n" +
    "# layer: which kind of fact this is (docs/contracts/golden-questions.md).\n" +
    "# expect: error -> check reports `category` at a location matching location_pattern; pass -> no error;\n" +
    "#         readiness -> no error, but publication readiness is never ready and says why.\n" +
    toYaml(doc, { lineWidth: 0 });
}

function buildCase(c: NegativeCase, root: string, written: string[]): void {
  const { manifest, files } = BASES[c.base]();
  const m = clone(manifest);
  const f: Files = new Map(files);
  const id = findingIdFor(c.name);
  m.finding.id = id;
  m.finding.slug = c.name;
  m.finding.canonical_location = `aftergrid/fixtures/negatives/${c.name}`;
  f.set("memo.md", f.get("memo.md")!.replace(/^finding: fnd_[a-z0-9]{12}$/m, `finding: ${id}`));

  c.mutate?.(m, f);
  pinHashes(m, f, root);
  c.corrupt?.(m);

  const dir = join(root, c.name);
  rmSync(dir, { recursive: true, force: true });
  for (const [rel, text] of f) writeFile(root, join(c.name, rel), text, written);

  let attestedDigest: Hash | null = null;
  if (c.attested) {
    const before: Files = new Map(f);
    c.attested(before);
    for (const [rel, text] of before) writeFileSync(join(dir, rel), text);
    attestedDigest = digestOf(m, dir);
    for (const [rel, text] of f) writeFileSync(join(dir, rel), text);
  }

  m.content_digest = digestOf(m, dir);
  for (const review of m.reviews) review.content_digest = m.content_digest;
  c.sign?.(m, m.content_digest, attestedDigest);

  writeFile(root, join(c.name, "manifest.yaml"), manifestHeader(c) + toYaml(m, { lineWidth: 0 }), written);
  writeFile(root, join(c.name, "expected.yaml"), expectedYaml(c), written);
}

/** Generate the whole negative-fixture tree under `root`. Returns every relative path written, sorted. */
export function buildNegatives(root: string = NEGATIVES_DIR): string[] {
  const written: string[] = [];
  mkdirSync(root, { recursive: true });
  writeFile(root, "aftergrid.yaml", INSTANCE_YAML, written);
  writeFile(root, "readers.md", readFileSync(join(SOURCE_INSTANCE, "readers.md"), "utf8"), written);
  for (const name of DEFINITION_FILES) writeFile(root, join("definitions", name), readFileSync(join(SOURCE_INSTANCE, "definitions", name), "utf8"), written);
  for (const c of CASES) buildCase(c, root, written);
  return written.sort();
}

/** Every file under `root`, relative and sorted. Used by the test to prove nothing else is committed. */
export function listTree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else out.push(relative(root, p));
    }
  };
  if (existsSync(root) && statSync(root).isDirectory()) walk(root);
  return out.sort();
}

if (process.argv[1]?.endsWith("/negatives-build.ts")) {
  const written = buildNegatives();
  process.stdout.write(`wrote ${written.length} files for ${CASES.length} negative fixtures under ${NEGATIVES_DIR}\n`);
}
