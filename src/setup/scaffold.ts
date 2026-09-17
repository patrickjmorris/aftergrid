// The Instance layout `aftergrid setup` scaffolds (docs/contracts/instance-layout.md). Two rules govern every
// byte here: an existing file is never overwritten, and a file that differs from what setup would write is
// reported as kept-and-different rather than silently reconciled. A rerun with different options must leave the
// Operator's edits exactly where they were.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
// @ts-ignore: shared path containment and error type.
import { safePath } from "../../scripts/fixture-safety.mjs";
import { renderDecisionIndex } from "../commands/decide.ts";
import { DEFAULT_ESTIMATE_CAP_ROWS } from "../adapters/admission.ts";

export type ScaffoldStatus = "created" | "kept" | "kept_differs" | "would_create" | "would_keep" | "would_keep_differs";
export type ScaffoldOutcome = { rel: string; path: string; status: ScaffoldStatus };

/**
 * What goes into `connection:`. The Postgres URL is never a value here: only the NAME of an environment variable.
 *
 * `none` is the default and the recorded path (ADR 0010): the harness runs the SQL and `aftergrid record` writes
 * down what it ran. It is written as an explicit `adapter: none` rather than as an absent `connection:` block,
 * because every reader of the field already treats "not duckdb, not postgres" as no adapter — `src/analysis/
 * source.ts`, `src/intake/preflight.ts` — and an explicit value says the Operator chose the recorded path, where
 * an absent block reads as a file somebody edited a section out of.
 */
export type ConnectionSpec =
  | { adapter: "duckdb"; duckdbPath: string }
  | { adapter: "postgres"; urlEnv: string }
  | { adapter: "none" };

export type ScaffoldSpec = {
  /** Directory name of the Instance root, written as `instance_root`. */
  instanceRoot: string;
  connection: ConnectionSpec;
  owner?: { name?: string; contact?: string };
  publication?: { repository?: string; trustedApprovers?: string[]; automationLogin?: string };
};

const yamlString = (v: string) => (/^[A-Za-z0-9_][A-Za-z0-9_.@/-]*$/.test(v) ? v : JSON.stringify(v));

/**
 * The `connection:` block alone, byte for byte as `aftergrid.yaml` carries it. It is a separate function because
 * setup never overwrites an existing `aftergrid.yaml`: on an Instance that already has one, the only honest
 * upgrade is to print this block and let the Operator paste it in (`src/commands/setup.ts`, step 3).
 */
export function connectionBlock(connection: ConnectionSpec): string {
  return connectionLines(connection).join("\n") + "\n";
}

function connectionLines(connection: ConnectionSpec): string[] {
  const lines: string[] = ["connection:"];
  if (connection.adapter === "duckdb") {
    lines.push(
      "  adapter: duckdb",
      "  duckdb:",
      "    # A .duckdb file, or a directory of <table>.csv files. Relative to this Instance root.",
      `    path: ${yamlString(connection.duckdbPath)}`,
      "    # DuckDB has no roles: the safety here is that the engine opens the file READ_ONLY on every statement.",
      "    read_only: true",
      "    # The largest planned scan any read may make. It bounds `capture` as well as `execute`, because a",
      "    # whole-table copy is a scan of the whole table; a table over it is refused with `admission` before",
      "    # anything is read or written (docs/contracts/adapters.md, \"Large sources: the windowed Instance pattern\").",
      `    estimate_cap: ${DEFAULT_ESTIMATE_CAP_ROWS}`,
    );
  } else if (connection.adapter === "none") {
    lines.push(
      "  # No adapter. This Instance is on the RECORDED path, which is the default (ADR 0010): your harness runs",
      "  # the SQL with whatever tool it has and `aftergrid record` writes down the query, the parameters, the",
      "  # result and the tool that produced them. A Finding built that way is complete, checkable and",
      "  # renderable, and it guarantees artifact_replay: the saved results replay byte for byte.",
      "  # What that costs, exactly: `aftergrid capture` refuses here, because there is no source to copy from;",
      "  # `aftergrid execute` refuses on a Finding with no retained inputs, and still runs on one that already",
      "  # holds them, because it never reads a live source; `check --mode rerun` answers `rerun_unavailable`",
      "  # for a recorded Finding; Revisit needs a Finding that can be rerun; and unattended intake stays",
      "  # refused, because source limits are an adapter's to declare.",
      "  # To upgrade, set `connection.adapter` here to duckdb or postgres with its block. Setup never overwrites",
      "  # this file, so `aftergrid setup --adapter duckdb --duckdb-path <file-or-csv-dir>` (or `--adapter",
      "  # postgres --pg-url-env <ENV_VAR_NAME>`) PRINTS the block for you to paste in; it does not edit it.",
      "  adapter: none",
    );
  } else {
    lines.push(
      "  adapter: postgres",
      "  postgres:",
      "    # The NAME of the environment variable holding the connection string. The URL itself is never written",
      "    # to this file, to a report or to a log: it is read from the environment at runtime.",
      `    url_env: ${yamlString(connection.urlEnv)}`,
      "    statement_timeout_ms: 30000",
      "    # The same cap, meaning the same thing, as the duckdb block: the largest planned scan any read may",
      "    # make, `capture` included. One default for both backends, so the same source is admissible on either.",
      `    estimate_cap: ${DEFAULT_ESTIMATE_CAP_ROWS}`,
    );
  }
  return lines;
}

function aftergridYaml(spec: ScaffoldSpec): string {
  const lines: string[] = [
    "# aftergrid Instance policy. Scaffolded by `aftergrid setup`; every value below is yours to edit.",
    "# Field meanings and the full layout: docs/contracts/instance-layout.md",
    "#",
    "# Guard this file with CODEOWNERS and branch protection. A Finding pull request must never be able to widen",
    "# the allowlist that judges it (docs/contracts/publication.md); nothing in the Engine can enforce that for you.",
    "schema_version: 0.1.0",
    `instance_root: ${yamlString(spec.instanceRoot)}`,
    ...connectionLines(spec.connection),
  ];
  lines.push(
    "render:",
    "  # House font for the Reader HTML and chart PNGs. The HTML stays self-contained: the font is embedded, never linked.",
    "  # preset: system (default, no embedding) | geist (shipped with the Engine, SIL OFL). Or bring your own files:",
    "  #   font: { family: Inter, files: [ { path: fonts/Inter[wght].woff2, weight: \"100 900\" } ], fallback: \"system-ui, sans-serif\" }",
    "  font: { preset: system }",
  );
  const pub = spec.publication ?? {};
  lines.push("publication:");
  if (pub.repository && pub.automationLogin && pub.trustedApprovers?.length) {
    lines.push(
      "  # Where Finding pull requests are opened.",
      `  repository: ${yamlString(pub.repository)}`,
      "  # Humans whose APPROVED GitHub review counts as publication authority. Never the automation identity:",
      "  # GitHub does not let the author of a pull request approve it, and there is no bypass.",
      `  trusted_approvers: [${pub.trustedApprovers.map(yamlString).join(", ")}]`,
      `  automation_login: ${yamlString(pub.automationLogin)}`,
    );
  } else {
    lines.push(
      "  # Not configured yet. Until all three are filled in, no Finding in this Instance can reach publication",
      "  # readiness `ready`; drafts still render, labelled as drafts. Rerun `aftergrid setup` with",
      "  # --repository, --automation-login and --trusted-approver, or fill these in by hand.",
      "  # repository: owner/repo",
      "  # trusted_approvers: [your-github-login]",
      "  # automation_login: your-automation-login",
    );
  }
  lines.push(
    "export_defaults:",
    "  recipient_scope: named_readers",
    "  granularity: aggregate_only",
    "owner:",
  );
  if (spec.owner?.name && spec.owner?.contact) {
    lines.push(`  name: ${yamlString(spec.owner.name)}`, `  contact: ${yamlString(spec.owner.contact)}`);
  } else {
    lines.push(
      "  # The Operator a Reader's flag reaches. Rerun setup with --owner-name and --owner-contact, or fill in here.",
      "  # name: Your Name",
      "  # contact: you@example.com",
    );
  }
  return lines.join("\n") + "\n";
}

// The example profile is indented inside the fence on purpose: `readerProfileIds` reads every line that starts
// with `## ` as a real profile id, so an unindented example would advertise a Reader who does not exist.
const READERS_MD = `# Readers

Named Reader profiles for this Instance. Format: \`docs/contracts/reader-profiles.md\`; schema:
\`schema/reader-profile.schema.json\`.

Every Finding names the Reader it is written for. A Finding that names no profile uses the built-in **generic**
profile — a non-data decision maker, with nothing else known about them. That is honest but weak: the Reader
reviewer can only judge a memo against the person the Instance actually describes, so add a real profile before
the first Finding that matters.

Add one \`## <profile_id>\` section per Reader, each holding one YAML block. The block below is an **example**,
indented so the Engine does not read it as a profile. Copy it out to the left margin, then replace every value
with a real person.

\`\`\`markdown
  ## product_owner
  \`\`\`yaml
  id: product_owner
  label: Non-technical product owner
  role: Owns the roadmap and decides what the team builds next; reads Findings between meetings.
  data_literacy: reads_charts
  reads_on: [phone]
  time_budget_minutes: 5
  decisions:
    - whether to keep, change or stop a feature
    - whether to wait for more data before deciding
  cares_about:
    - what changed for users, in plain words
    - whether the number is big enough to act on
  will_misread:
    - treats a correlation as a cause
    - reads a rate without asking what it is a rate of
  vocabulary:
    use: [people, new users, came back, out of, compared with]
    avoid: [denominator, cohort, statistically significant, p-value, lift]
  \`\`\`
\`\`\`
`;

const DEFINITIONS_README = `# Metric definitions and Diagnostic calculations

One markdown file per definition, named \`<definition_id>.md\`. Shape, front matter and the content-hash rule:
\`docs/contracts/instance-layout.md\`.

Two separate axes, never collapsed into one word:

- \`kind\` is \`metric\` or \`diagnostic\`. A Diagnostic calculation may be used inside an Analysis with its status
  shown; it is never the headline of a Finding.
- \`lifecycle\` is \`proposed\`, \`approved\` or \`deprecated\`. **The \`lifecycle\` line is display only.** Approval is
  the \`approval:\` attestation underneath it: an approver, a date and the content hash of what they approved.
  Editing \`lifecycle: approved\` by hand approves nothing, and \`aftergrid check\` says so.

A published decision metric must cite an approved definition at a pinned version. Anything else belongs in the
Analysis with its status visible.

\`example_definition.md\` is an example, not a definition of yours: it is \`proposed\`, it carries no approval, and
its SQL runs against nothing. Delete it once you have written a real one.
`;

const EXAMPLE_DEFINITION = `---
id: example_definition
version: 1
kind: metric
lifecycle: proposed
grain: user
population: EXAMPLE — the people this metric counts, stated so a Reader can check themselves against it
denominator: EXAMPLE — what the numerator is divided by, including the people who did nothing
window: EXAMPLE — the period and the analytical timezone, e.g. 7 calendar days from signup, America/New_York
owner: EXAMPLE — the person who answers questions about this definition
---
**This file is an example.** It is \`proposed\`, it carries no \`approval:\` block, and no Finding may cite it as a
published decision metric. Copy it, rename it to your definition's id, and replace every line.

Write the meaning in plain language first: a Reader should be able to tell whether they are in the population
without reading the SQL. Say what is excluded and what happens at the edges (a user who signed up on the last
day of the window; a denominator that can be zero).

## SQL (duckdb)

\`\`\`sql
-- Canonical SQL for this definition. Parameters use $name.
-- Replace this with the query that computes the metric exactly as the prose above describes it.
select 1 as example_value
\`\`\`
`;

const GOLDEN_README = `# Golden Questions

One file per reference case: a Question with a reviewed expected answer within tolerances, **or** an expected
abstention. A golden Question is how you find out that the Engine and this Instance still agree after a model,
skill or definition change.

\`<question_id>.yaml\` carries the raw ask, the Reader, the expected outcome (including \`insufficient_data\` and
\`needs_reframing\`, which are real answers), the definition ids and tables the Analysis is expected to use, the
values it must land on with their tolerances, what the Finding must state, and what it must not conclude.

The Engine ships worked examples under \`fixtures/instance/analytics/golden/\`. Nothing is scaffolded here,
because a golden Question is a judgement about your data that only you can make.
`;

const PROVISIONAL_README = `# Provisional sign-off records

The one narrow bridge ADR 0006 (amended) allows: an exploratory read of a **non-sensitive unverified source**,
recorded as \`<id>.yaml\` in this directory. Shape, every failure code and what is deliberately not verified:
\`docs/contracts/hook.md\`.

What this directory does **not** do:

- It does not grant database permissions. A read-only role is still the boundary.
- It does not bridge privacy limits, export policy or execution limits. Those have no bridge.
- An approver *name* is editable text and authorizes nothing on its own: a record needs a reference
  (\`github_pr_review\`, \`github_issue_comment\` or \`signed_note\`) that a Finding pull request cannot mint.
- A result read under a provisional sign-off stays provisional. The validator refuses to render it to a Reader.

\`log.jsonl\` is appended to on every evaluation, allowed or blocked.
`;

const GITIGNORE = `# Generated by \`aftergrid setup\`.
# Resumable setup state: local to this checkout, and not an artifact anyone else should read.
.aftergrid-setup.json
`;

/** Every managed path, with the exact bytes setup would write. Pure: nothing here touches the filesystem. */
export function scaffoldFiles(spec: ScaffoldSpec): { rel: string; content: string }[] {
  return [
    { rel: "aftergrid.yaml", content: aftergridYaml(spec) },
    { rel: "readers.md", content: READERS_MD },
    { rel: "definitions/README.md", content: DEFINITIONS_README },
    { rel: "definitions/example_definition.md", content: EXAMPLE_DEFINITION },
    { rel: "findings/.gitkeep", content: "" },
    { rel: "decisions/.gitkeep", content: "" },
    { rel: "decisions.md", content: renderDecisionIndex([]) },
    { rel: "golden/README.md", content: GOLDEN_README },
    { rel: "provisional/README.md", content: PROVISIONAL_README },
    { rel: ".gitignore", content: GITIGNORE },
  ];
}

/**
 * Create what is missing; keep what is there. A file whose bytes differ from what setup would write is reported
 * as `kept_differs` — the Operator edited it, or a previous run used different options, and either way their
 * copy wins. `dryRun` reports the same three states without writing anything.
 */
export function applyScaffold(root: string, files: { rel: string; content: string }[], opts: { dryRun?: boolean } = {}): ScaffoldOutcome[] {
  const outcomes: ScaffoldOutcome[] = [];
  // safePath resolves against a real directory, so it can only be applied once the root exists. A real run
  // creates the root first; only a dry run against a root that is not there yet takes the plain join, and every
  // `rel` here is an Engine constant rather than anything read from config.
  const rootExists = existsSync(root);
  for (const f of files) {
    const path = rootExists ? (safePath(root, f.rel) as string) : join(root, f.rel);
    if (existsSync(path)) {
      const same = readFileSync(path, "utf8") === f.content;
      outcomes.push({ rel: f.rel, path, status: opts.dryRun ? (same ? "would_keep" : "would_keep_differs") : same ? "kept" : "kept_differs" });
      continue;
    }
    if (opts.dryRun) { outcomes.push({ rel: f.rel, path, status: "would_create" }); continue; }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, f.content);
    outcomes.push({ rel: f.rel, path, status: "created" });
  }
  return outcomes;
}

export const describeOutcome = (o: ScaffoldOutcome): string =>
  o.status === "created" ? `created ${o.rel}`
    : o.status === "kept" ? `kept ${o.rel}`
    : o.status === "kept_differs" ? `kept ${o.rel} (differs from what setup would write; your copy was not touched)`
    : o.status === "would_create" ? `would create ${o.rel}`
    : o.status === "would_keep" ? `would keep ${o.rel}`
    : `would keep ${o.rel} (differs from what setup would write)`;
