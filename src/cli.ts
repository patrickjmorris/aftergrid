#!/usr/bin/env node
// aftergrid CLI. Supported runtime: Node 22.18+ or 24+ (type stripping is on by default there); no native compilation.
// Lifecycle: `new finding` (draft) -> author evidence -> `check` (artifact or rerun) -> review/approve -> `render`.
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { newFinding } from "./commands/new-finding.ts";
import { setup } from "./commands/setup.ts";
import { check } from "./commands/check.ts";
import { capture } from "./commands/capture.ts";
import { execute } from "./commands/execute.ts";
import { record } from "./commands/record.ts";
import { revise } from "./commands/revise.ts";
import { recordReview, reviewStatus, type ReviewKind } from "./commands/review.ts";
import { runEval } from "./eval/runner.ts";
import { nightlyExitCode, readRun, renderModelSummary, runNightly } from "./eval/nightly.ts";
import { compareCommand } from "./eval/compare.ts";
import { reportCommand } from "./eval/report.ts";
import { findInstance } from "./instance.ts";
import { render } from "./commands/render.ts";
import { decide } from "./commands/decide.ts";
import { hook } from "./commands/hook.ts";
import { intake } from "./commands/intake.ts";
import { validatePlugin } from "./distribution/validate-plugin.ts";
import { exitCodeFor, formatHuman, type Report } from "./report.ts";

const HELP = `aftergrid — produce Findings a non-data Reader can understand, inspect and act on.

Usage:
  aftergrid setup [--instance <dir>] [--adapter duckdb|postgres] [--duckdb-path <file-or-csv-dir>]
                  [--pg-url-env <ENV_VAR_NAME>] [--owner-name "<name>"] [--owner-contact <contact>]
                  [--repository owner/repo] [--automation-login <bot>] [--trusted-approver <login> ...]
                  [--settings <claude settings.json>] [--skip-hook] [--dry-run] [--json]
  aftergrid new finding <slug> [--ask "<raw ask>"] [--reader <profile-id>] [--instance <dir>] [--date yyyy-mm-dd]
  aftergrid check <finding-dir> [--mode artifact|rerun] [--json]
  aftergrid capture <finding-dir> --tables <a,b> [--catalog] [--instance <dir>] [--description "<text>"] [--json]
  aftergrid execute <finding-dir> [--instance <dir>] [--json]
  aftergrid record <finding-dir> --tool <name> [--tool-version <v>] [--executed-at <timestamp>]
                   [--instance <dir>] [--json]
                   --execution <id> --result <file.json|file.csv> [--sql <file|inline>] [--params k=v ...]
                 | --check <id> --outcome pass|fail|not_run|error [--evidence <file>]
  aftergrid revise <finding-dir> --pin|--classify|--apply [--baseline <dir>] [--force] [--json]
  aftergrid review record <finding-dir> --kind method|question|reader|visual --reviewer "agent:<model id>"
                   [--blocking "<finding>" ...] [--non-blocking "<finding>" ...] [--profile <reader-profile>]
                   [--date yyyy-mm-dd] [--dry-run] [--json]
  aftergrid review status <finding-dir> [--json]
  aftergrid eval --golden <id|all> [--analyzer fixture|command] [--analyzer-command "<template>"]
                   [--instance <dir>] [--out <dir>] [--sha <git sha>] [--model <model id>]
                   [--max-cost-usd N] [--json]
  aftergrid eval nightly [--golden <id|all>] [--analyzer fixture|command] [--analyzer-command "<template>"]
                   [--instance <dir>] [--out <dir>] [--sha <git sha>] [--model <model id>]
                   [--budget-ms N] [--case-timeout-ms N] [--max-cost-usd N] [--report-issues [--repo owner/repo]]
                   [--artifact-base <path prefix>] [--json]
  aftergrid eval summary <run-dir>
  aftergrid eval compare <baseline-run-dir> <run-dir> [--dry-run] [--json]
  aftergrid eval report <run-dir> [--repo owner/repo] [--artifact-base <prefix>] [--dry-run] [--json]
  aftergrid render <finding-dir> [--png] [--json]
  aftergrid decide --finding <dir> --owner <name> --date <yyyy-mm-dd> --claims <c1,c2> --action action|inaction
                   --description "<what was done>" --rationale "<why>"
                   [--revisit-date <yyyy-mm-dd> --timezone <IANA zone> | --revisit-every <days> --timezone <IANA zone>]
                   [--falsifier-check <check_id>] [--outcome "<yyyy-mm-dd> <what happened>"]
                   [--supersedes <dec_id>] [--instance <dir>] [--id <dec_id>] [--dry-run] [--json]
  aftergrid hook install|uninstall|status [--settings <path>]
  aftergrid plugin validate [--root <dir>] [--json]
  aftergrid intake --repo owner/repo [--label ready-for-agent] [--instance <dir>] [--once | --poll-seconds N]
                   [--harness fixture|command] [--harness-command "<template>"] [--fixture-source <finding-dir>]
                   [--resume <run_id>] [--provided <kind> ...] [--timeout-ms N] [--max-attempts N]
                   [--base <branch>] [--settings <path>] [--json]

Lifecycle:
  setup         scaffolds the Instance (docs/contracts/instance-layout.md) and reports six separate facts:
                what was created or kept, which hard dependencies are present, what the configured source's
                capabilities actually are, whether the guardrail hook is installed AND self-tests clean,
                whether the publication policy could ever produce a verified approval, and whether a throwaway
                Finding runs new -> check -> draft render. It never overwrites a file, never writes a
                credential (Postgres is named by environment variable), and records which steps completed in
                <instance>/.aftergrid-setup.json so a rerun resumes. --dry-run writes nothing at all.
  new finding   creates an explicitly incomplete draft with fresh ids; never overwrites an existing Finding.
  check         reports four separate facts: syntax, content completeness, evidence validity, publication readiness.
                --mode artifact (default) verifies saved evidence and never re-executes SQL.
                --mode rerun re-executes every recorded query and Check against the retained inputs (never a
                live source) and reports any difference from what the manifest recorded. Nothing is modified.
  capture       copies the named source tables into the Finding as retained inputs with content hashes and
                honest source metadata (docs/contracts/analysis-directory.md). --catalog reads the tables and
                columns and writes nothing. It refuses a revision carrying attestations and never sets a Snapshot
                guarantee: a guarantee is established by running the analysis, not by capturing inputs.
  execute       runs every declared execution and Check against the retained inputs (never a live source),
                writes results/*.json and pins SQL hashes, result hashes, Check outcomes and the content digest.
                A SQL error, a malformed Check or a result that does not match its declared columns writes
                nothing; a Check that records fail is data and is written down. It refuses to change content an
                attestation binds to, and never writes a review or an attestation.
  record        the recorded data path (ADR 0010, docs/contracts/record.md): the harness ran the SQL, aftergrid
                writes down what it ran. --execution pins the query text, the parameters, the result the tool
                produced in the canonical result format, every hash, and who ran it; --check stores one
                agent-reported Check outcome with the tool that reported it. It executes nothing, so every report
                says sql_execution not_performed. snapshot.guarantees becomes exactly [artifact_replay], never
                analysis_rerun, and check --mode rerun then refuses the Finding with rerun_unavailable. Capture
                is optional on this route. An agent-reported pass without an evidence file is refused, and so is
                a revision carrying attestations. --executed-at is the harness's own execution time, as RFC 3339
                (2026-09-16T09:12:44Z); it defaults to now and is never invented as something earlier.
  revise      says what a change to a pinned Finding costs, then applies it or refuses. --pin archives the
                Finding under revisions/<N>/ as the baseline; --classify calls every difference presentation,
                interpretation or numeric and writes nothing; --apply makes a presentation or interpretation
                change revision N+1, archives its predecessor, re-renders and re-checks; a numeric change is
                refused with the instruction to reopen the Analysis. Reviews and approvals are reported stale,
                never carried forward. Conservative, not a semantic classifier: docs/contracts/revise.md.
  review        record appends one agent review to the manifest, bound to the digest the files hash to now,
                and refuses when they no longer match. It never writes an attestation and never reports
                readiness: an agent review completes a draft, a human APPROVED review approves it. status
                reprints what is recorded, what is stale, and whether /analyze continues or halts.
  eval          runs Golden Questions end to end against an analyzer and records what happened per case under
                <out>/<sha>/. Evaluation material, never a merge gate; analytical and infrastructure failures are
                recorded apart; it approves nothing and validates no evidence. Contract: docs/contracts/eval.md.
                nightly runs the same suite inside a wall-clock budget and a per-case timeout, and writes
                run.json (sha, versions, model, analyzer, budget, partial + the cases it did not reach) and
                summary.md (one line per case, with a stable fingerprint per failure) beside the per-case
                records. --report-issues opens ONE issue per failure fingerprint and comments on it thereafter
                instead of opening a second. summary prints, as markdown, whether a model was really in the
                loop — decided from run.json (the command analyzer, a case that reached a verdict, a case that
                named the model), never from a secret being set. Exit codes: 0 clean, 1 a case failed or errored, 2 usage,
                4 the run was partial. compare classifies two recorded runs as unchanged, regressed, fixed,
                new or infrastructure into comparison.json. Nightly results are never a merge gate.
  render        validates the source, then writes render/finding.html and render/<chart>.svg (and .png with --png);
                a draft renders with a draft label, never as reviewed; invalid evidence is refused.
  decide        records one owner Decision against a reviewed Finding revision: one immutable file per record under
                <instance>/decisions/, bound to that revision and its content digest. Retrying with the same --id and
                identical input is a no-op; different content under the same id is refused. Merging, rendering or
                checking a Finding never creates a record.
  intake        runs Issue requests in the background: claims an Issue labelled ready-for-agent at a stable
                revision, refuses to dispatch unless the guardrail hook is installed AND self-tests clean, the
                Instance policy is present and the source's limits are declared (there is no bypass flag), hands
                the request to a harness, checks what comes back with the same validator as check, and opens
                ONE draft pull request per run. It pauses with needs-info instead of guessing, never removes a label, and never reports a
                Finding as approved: publication still requires a human APPROVED review
                (docs/contracts/publication.md). --once processes the currently labelled Issues and exits;
                --poll-seconds N loops. Contract: docs/contracts/intake.md.
  plugin        validate checks that the shipped package agrees with itself: the Claude Code plugin manifest
                names skills that exist, every promoted skill states who may invoke it in BOTH its SKILL.md
                frontmatter and its agents/openai.yaml and the two agree, and each has a docs page. It runs no
                installer, so it never claims Claude Code or skills.sh accepts the layout
                (docs/contracts/distribution.md). --root defaults to the installed package.
  hook          installs, removes or reports the Claude Code PreToolUse guard that blocks source writes and DDL
                through supported query paths (docs/contracts/hook.md). install is idempotent and preserves other
                hooks; status reports whether the exact command is present and self-tests the guard by piping a
                known-bad command through it. The guard is not a shell sandbox: source permissions and runtime
                isolation remain the boundary.

Runtime: Node >= 22.18 or >= 24 (TypeScript type stripping on by default), no native compiler needed; prebuilt DuckDB binaries are used for rerun.
Exit codes: 0 clean, 1 problems found, 2 refused or usage error, 3 not implemented.
`;

function out(report: Report, json: boolean): never {
  process.stdout.write((json ? JSON.stringify(report, null, 2) : formatHuman(report)) + "\n");
  process.exit(exitCodeFor(report));
}

export async function main(argv: string[]): Promise<void> {
  const [cmd, sub, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") { process.stdout.write(HELP); process.exit(0); }
  if (cmd === "setup") {
    // `setup` is the first command an Operator types, so `--help` here prints help rather than a parse error.
    if (sub === "--help" || sub === "-h" || rest.includes("--help") || rest.includes("-h")) { process.stdout.write(HELP); process.exit(0); }
    const { values } = parseArgs({ args: [sub, ...rest].filter((x): x is string => x !== undefined), allowPositionals: true, options: {
      instance: { type: "string" }, adapter: { type: "string" }, "duckdb-path": { type: "string" }, "pg-url-env": { type: "string" },
      "owner-name": { type: "string" }, "owner-contact": { type: "string" }, repository: { type: "string" },
      "automation-login": { type: "string" }, "trusted-approver": { type: "string", multiple: true },
      settings: { type: "string" }, "skip-hook": { type: "boolean" }, "dry-run": { type: "boolean" }, json: { type: "boolean" },
    } });
    if (values.adapter !== undefined && values.adapter !== "duckdb" && values.adapter !== "postgres") { process.stderr.write(`--adapter must be duckdb or postgres, got '${values.adapter}'\n`); process.exit(2); }
    out(await setup({
      instanceDir: values.instance,
      adapter: values.adapter === "postgres" ? "postgres" : "duckdb",
      duckdbPath: values["duckdb-path"],
      pgUrlEnv: values["pg-url-env"],
      ownerName: values["owner-name"],
      ownerContact: values["owner-contact"],
      repository: values.repository,
      automationLogin: values["automation-login"],
      trustedApprovers: values["trusted-approver"],
      settingsPath: values.settings,
      skipHook: !!values["skip-hook"],
      dryRun: !!values["dry-run"],
    }), !!values.json);
  }
  if (cmd === "new") {
    if (sub !== "finding") { process.stderr.write("usage: aftergrid new finding <slug>\n"); process.exit(2); }
    const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { ask: { type: "string" }, reader: { type: "string" }, instance: { type: "string" }, date: { type: "string" }, json: { type: "boolean" } } });
    const slug = positionals[0];
    if (!slug) { process.stderr.write("usage: aftergrid new finding <slug>\n"); process.exit(2); }
    out(newFinding({ slug, ask: values.ask, reader: values.reader, instanceDir: values.instance, date: values.date }), !!values.json);
  }
  if (cmd === "check") {
    const { values, positionals } = parseArgs({ args: [sub, ...rest].filter((x): x is string => x !== undefined), allowPositionals: true, options: { mode: { type: "string" }, json: { type: "boolean" } } });
    const dir = positionals[0];
    if (!dir) { process.stderr.write("usage: aftergrid check <finding-dir>\n"); process.exit(2); }
    if (values.mode !== undefined && values.mode !== "artifact" && values.mode !== "rerun") { process.stderr.write(`--mode must be artifact or rerun, got '${values.mode}'\n`); process.exit(2); }
    out(await check({ dir, mode: values.mode === "rerun" ? "rerun" : "artifact" }), !!values.json);
  }
  if (cmd === "capture") {
    const { values, positionals } = parseArgs({ args: [sub, ...rest].filter((x): x is string => x !== undefined), allowPositionals: true, options: { tables: { type: "string" }, catalog: { type: "boolean" }, instance: { type: "string" }, description: { type: "string" }, json: { type: "boolean" } } });
    const dir = positionals[0];
    if (!dir) { process.stderr.write("usage: aftergrid capture <finding-dir> --tables a,b [--catalog] [--json]\n"); process.exit(2); }
    if (!values.catalog && !values.tables) { process.stderr.write("name the tables to capture: --tables a,b (or --catalog to read the catalog and write nothing)\n"); process.exit(2); }
    out(await capture({ dir, tables: values.tables?.split(",").map((t) => t.trim()).filter(Boolean), catalog: !!values.catalog, instanceDir: values.instance, description: values.description }), !!values.json);
  }
  if (cmd === "execute") {
    const { values, positionals } = parseArgs({ args: [sub, ...rest].filter((x): x is string => x !== undefined), allowPositionals: true, options: { instance: { type: "string" }, json: { type: "boolean" } } });
    const dir = positionals[0];
    if (!dir) { process.stderr.write("usage: aftergrid execute <finding-dir> [--json]\n"); process.exit(2); }
    out(await execute({ dir, instanceDir: values.instance }), !!values.json);
  }
  if (cmd === "record") {
    const { values, positionals } = parseArgs({ args: [sub, ...rest].filter((x): x is string => x !== undefined), allowPositionals: true, options: {
      execution: { type: "string" }, sql: { type: "string" }, result: { type: "string" }, params: { type: "string", multiple: true },
      check: { type: "string" }, outcome: { type: "string" }, evidence: { type: "string" },
      tool: { type: "string" }, "tool-version": { type: "string" }, "executed-at": { type: "string" },
      instance: { type: "string" }, json: { type: "boolean" },
    } });
    const dir = positionals[0];
    const usage = 'usage: aftergrid record <finding-dir> --tool "<name>" --execution <id> --result <file.json|file.csv> [--sql <file|inline>] [--params k=v ...]\n' +
      '       aftergrid record <finding-dir> --tool "<name>" --check <id> --outcome pass|fail|not_run|error [--evidence <file>]\n' +
      "       [--executed-at <timestamp>] is when the harness ran it (2026-09-16T09:12:44Z); it defaults to now\n";
    if (!dir) { process.stderr.write(usage); process.exit(2); }
    if (!values.tool) { process.stderr.write("--tool names the tool that actually ran this; aftergrid never guesses which tool the harness used\n" + usage); process.exit(2); }
    if (!!values.execution === !!values.check) { process.stderr.write("name exactly one of --execution or --check\n" + usage); process.exit(2); }
    out(await record({
      dir, instanceDir: values.instance, tool: values.tool, toolVersion: values["tool-version"],
      execution: values.execution, sql: values.sql, result: values.result, params: values.params,
      check: values.check, outcome: values.outcome, evidence: values.evidence, executedAt: values["executed-at"],
    }), !!values.json);
  }
  if (cmd === "revise") {
    const { values, positionals } = parseArgs({ args: [sub, ...rest].filter((x): x is string => x !== undefined), allowPositionals: true, options: {
      pin: { type: "boolean" }, classify: { type: "boolean" }, apply: { type: "boolean" },
      baseline: { type: "string" }, force: { type: "boolean" }, json: { type: "boolean" },
    } });
    const dir = positionals[0];
    const usage = "usage: aftergrid revise <finding-dir> --pin|--classify|--apply [--baseline <dir>] [--force] [--json]\n";
    if (!dir) { process.stderr.write(usage); process.exit(2); }
    const modes = (["pin", "classify", "apply"] as const).filter((m) => values[m]);
    if (modes.length !== 1) { process.stderr.write("name exactly one of --pin, --classify or --apply\n" + usage); process.exit(2); }
    out(await revise({ dir, mode: modes[0]!, baseline: values.baseline, force: !!values.force }), !!values.json);
  }
  if (cmd === "review") {
    if (sub !== "record" && sub !== "status") { process.stderr.write("usage: aftergrid review record|status <finding-dir> [...]\n"); process.exit(2); }
    const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: {
      kind: { type: "string" }, reviewer: { type: "string" }, blocking: { type: "string", multiple: true },
      "non-blocking": { type: "string", multiple: true }, profile: { type: "string" }, date: { type: "string" },
      "dry-run": { type: "boolean" }, json: { type: "boolean" },
    } });
    const dir = positionals[0];
    if (!dir) { process.stderr.write(`usage: aftergrid review ${sub} <finding-dir>\n`); process.exit(2); }
    if (sub === "status") out(reviewStatus({ dir }), !!values.json);
    if (!values.kind || !values.reviewer) { process.stderr.write('usage: aftergrid review record <finding-dir> --kind method|question|reader|visual --reviewer "agent:<model id>" [--blocking "..."] [--non-blocking "..."] [--profile <id>] [--date yyyy-mm-dd] [--dry-run] [--json]\n'); process.exit(2); }
    out(recordReview({ dir, kind: values.kind as ReviewKind, reviewer: values.reviewer, blocking: values.blocking, nonBlocking: values["non-blocking"], profile: values.profile, date: values.date, dryRun: !!values["dry-run"] }), !!values.json);
  }
  if (cmd === "eval" && sub === "nightly") {
    // The scheduled run: the same golden suite, bounded, with run.json + summary.md and an optional issue sink.
    // Contract: docs/contracts/eval.md ("Nightly"). Never a merge gate, and never on: pull_request.
    const { values } = parseArgs({ args: rest, allowPositionals: true, options: {
      golden: { type: "string" }, analyzer: { type: "string" }, "analyzer-command": { type: "string" },
      instance: { type: "string" }, out: { type: "string" }, sha: { type: "string" }, model: { type: "string" },
      "fixture-root": { type: "string" }, "budget-ms": { type: "string" }, "case-timeout-ms": { type: "string" },
      "max-cost-usd": { type: "string" },
      "report-issues": { type: "boolean" }, repo: { type: "string" }, "artifact-base": { type: "string" }, json: { type: "boolean" },
    } });
    if (values.analyzer !== undefined && values.analyzer !== "fixture" && values.analyzer !== "command") { process.stderr.write(`--analyzer must be fixture or command, got '${values.analyzer}'\n`); process.exit(2); }
    // `Number("")` is 0, and an empty workflow input is not a zero budget: it is a mistake, and a run that
    // silently took it would skip every case and report a partial suite as if that had been asked for.
    const ms = (name: string, raw?: string): number | undefined => {
      if (raw === undefined) return undefined;
      const n = raw.trim() === "" ? Number.NaN : Number(raw);
      if (!Number.isFinite(n) || n < 0) { process.stderr.write(`--${name} must be a non-negative, finite number of milliseconds, got '${raw}'\n`); process.exit(2); }
      return n;
    };
    const usd = (raw?: string): number | undefined => {
      if (raw === undefined) return undefined;
      const n = raw.trim() === "" ? Number.NaN : Number(raw);
      if (!Number.isFinite(n) || n <= 0) { process.stderr.write(`--max-cost-usd must be a positive, finite dollar amount, got '${raw}'\n`); process.exit(2); }
      return n;
    };
    const report = await runNightly({
      golden: values.golden, analyzer: values.analyzer === "command" ? "command" : "fixture",
      analyzerCommand: values["analyzer-command"], instanceDir: values.instance, outDir: values.out,
      fixtureRoot: values["fixture-root"], sha: values.sha, model: values.model,
      budgetMs: ms("budget-ms", values["budget-ms"]), caseTimeoutMs: ms("case-timeout-ms", values["case-timeout-ms"]),
      maxCostUsd: usd(values["max-cost-usd"]),
    });
    if (values["report-issues"]) {
      const filed = await reportCommand({
        runDir: report.run_dir,
        repo: values.repo ?? findInstance(values.instance ?? process.cwd())?.config.publication?.repository ?? null,
        artifactBase: values["artifact-base"] ?? null,
      });
      report.errors.push(...filed.errors);
      report.info.push(...filed.info);
    }
    process.stdout.write((values.json ? JSON.stringify(report, null, 2) : formatHuman(report) + "\n\n" + report.summary_markdown) + "\n");
    process.exit(nightlyExitCode(report));
  }
  if (cmd === "eval" && sub === "summary") {
    // Whether a model was really in the loop, as markdown for a job summary. It reads the recorded run and
    // judges nothing else: a present API key is not evidence that an analyzer produced anything.
    const { positionals } = parseArgs({ args: rest, allowPositionals: true, options: {} });
    const dir = positionals[0];
    if (!dir) { process.stderr.write("usage: aftergrid eval summary <run-dir>\n"); process.exit(2); }
    const run = readRun(dir);
    if (!run) { process.stderr.write(`no run.json at ${dir}: point at the <out>/<sha> directory \`aftergrid eval nightly\` wrote\n`); process.exit(2); }
    process.stdout.write(renderModelSummary(run));
    process.exit(0);
  }
  if (cmd === "eval" && sub === "report") {
    // Files the failures a recorded run already holds. It re-runs nothing, so a reporting step can never
    // overwrite the run it is reporting on.
    const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: {
      repo: { type: "string" }, "artifact-base": { type: "string" }, instance: { type: "string" },
      "dry-run": { type: "boolean" }, json: { type: "boolean" },
    } });
    const dir = positionals[0];
    if (!dir) { process.stderr.write("usage: aftergrid eval report <run-dir> [--repo owner/repo] [--artifact-base <prefix>] [--dry-run] [--json]\n"); process.exit(2); }
    out(await reportCommand({
      runDir: dir,
      repo: values.repo ?? findInstance(values.instance ?? process.cwd())?.config.publication?.repository ?? null,
      artifactBase: values["artifact-base"] ?? null,
      dryRun: !!values["dry-run"],
    }), !!values.json);
  }
  if (cmd === "eval" && sub === "compare") {
    const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { json: { type: "boolean" }, "dry-run": { type: "boolean" } } });
    if (positionals.length !== 2) { process.stderr.write("usage: aftergrid eval compare <baseline-run-dir> <run-dir> [--dry-run] [--json]\n"); process.exit(2); }
    out(compareCommand({ baseline: positionals[0]!, run: positionals[1]!, write: !values["dry-run"] }), !!values.json);
  }
  if (cmd === "eval") {
    const { values } = parseArgs({ args: [sub, ...rest].filter((x): x is string => x !== undefined), allowPositionals: true, options: {
      golden: { type: "string" }, analyzer: { type: "string" }, "analyzer-command": { type: "string" },
      instance: { type: "string" }, out: { type: "string" }, sha: { type: "string" }, model: { type: "string" },
      "fixture-root": { type: "string" }, "max-cost-usd": { type: "string" }, json: { type: "boolean" },
    } });
    if (values.analyzer !== undefined && values.analyzer !== "fixture" && values.analyzer !== "command") { process.stderr.write(`--analyzer must be fixture or command, got '${values.analyzer}'\n`); process.exit(2); }
    let maxCostUsd: number | undefined;
    if (values["max-cost-usd"] !== undefined) {
      maxCostUsd = values["max-cost-usd"].trim() === "" ? Number.NaN : Number(values["max-cost-usd"]);
      if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) { process.stderr.write(`--max-cost-usd must be a positive, finite dollar amount, got '${values["max-cost-usd"]}'\n`); process.exit(2); }
    }
    out(await runEval({ golden: values.golden, analyzer: values.analyzer === "command" ? "command" : "fixture", analyzerCommand: values["analyzer-command"], instanceDir: values.instance, outDir: values.out, fixtureRoot: values["fixture-root"], sha: values.sha, model: values.model, maxCostUsd }), !!values.json);
  }
  if (cmd === "render") {
    const { values, positionals } = parseArgs({ args: [sub, ...rest].filter((x): x is string => x !== undefined), allowPositionals: true, options: { png: { type: "boolean" }, json: { type: "boolean" } } });
    const dir = positionals[0];
    if (!dir) { process.stderr.write("usage: aftergrid render <finding-dir>\n"); process.exit(2); }
    out(await render({ dir, png: !!values.png }), !!values.json);
  }
  if (cmd === "plugin") {
    if (sub !== "validate") { process.stderr.write("usage: aftergrid plugin validate [--root <dir>] [--json]\n"); process.exit(2); }
    const { values } = parseArgs({ args: rest, options: { root: { type: "string" }, json: { type: "boolean" } } });
    // Default: the package this CLI is running from, so `aftergrid plugin validate` checks the copy that was
    // actually installed rather than whatever directory the Operator happens to be standing in.
    const packageRoot = fileURLToPath(new URL("../", import.meta.url));
    out(validatePlugin(values.root ?? packageRoot), !!values.json);
  }
  if (cmd === "hook") {
    if (sub !== "install" && sub !== "uninstall" && sub !== "status") { process.stderr.write("usage: aftergrid hook install|uninstall|status [--settings <path>]\n"); process.exit(2); }
    const { values } = parseArgs({ args: rest, options: { settings: { type: "string" }, json: { type: "boolean" } } });
    out(hook({ action: sub, settingsPath: values.settings }), !!values.json);
  }
  if (cmd === "decide") {
    const { values, positionals } = parseArgs({ args: [sub, ...rest].filter((x): x is string => x !== undefined), allowPositionals: true, options: {
      owner: { type: "string" }, date: { type: "string" }, finding: { type: "string" }, claims: { type: "string" },
      action: { type: "string" }, description: { type: "string" }, rationale: { type: "string" },
      "revisit-date": { type: "string" }, "revisit-every": { type: "string" }, timezone: { type: "string" },
      "falsifier-check": { type: "string" }, outcome: { type: "string" }, supersedes: { type: "string" },
      instance: { type: "string" }, id: { type: "string" }, "dry-run": { type: "boolean" }, json: { type: "boolean" },
    } });
    const usage = (message: string): never => { process.stderr.write(`${message}\nusage: aftergrid decide --finding <dir> --owner <name> --date <yyyy-mm-dd> --claims <c1,c2> --action action|inaction --description "<what was done>" --rationale "<why>" [--revisit-date <yyyy-mm-dd> --timezone <IANA zone> | --revisit-every <days> --timezone <IANA zone>] [--falsifier-check <check_id>] [--outcome "<yyyy-mm-dd> <what happened>"] [--supersedes <dec_id>] [--instance <dir>] [--id <dec_id>] [--dry-run] [--json]\n`); process.exit(2); };
    const dir = values.finding ?? positionals[0];
    if (!dir) usage("name the Finding directory to decide on");
    if (values.action !== "action" && values.action !== "inaction") usage("--action must be action or inaction");
    for (const required of ["owner", "date", "claims", "description", "rationale"] as const) if (!values[required]) usage(`--${required} is required: aftergrid decide never invents one`);
    if (!values["revisit-date"] && !values["revisit-every"] && !values["falsifier-check"]) usage("state when to revisit: --revisit-date, --revisit-every, and/or --falsifier-check");
    // A schedule is a date in a place, so the zone is part of the schedule, not an optional extra.
    if ((values["revisit-date"] || values["revisit-every"]) && !values.timezone) usage("--timezone is required with --revisit-date or --revisit-every: a schedule names an IANA zone, such as America/New_York or UTC");
    const om = values.outcome ? /^(\d{4}-\d{2}-\d{2})\s+(.*\S)$/.exec(values.outcome) : null;
    if (values.outcome && !om) usage('--outcome is "<yyyy-mm-dd> <what happened>"; omit it while the outcome is unknown');
    out(await decide({
      findingDir: dir,
      instanceDir: values.instance,
      owner: values.owner!,
      decidedOn: values.date!,
      restsOnClaims: values.claims!.split(",").map((c) => c.trim()).filter(Boolean),
      action: { kind: values.action === "action" ? "action" : "deliberate_inaction", description: values.description! },
      rationale: values.rationale!,
      revisitWhen: {
        ...(values["revisit-date"] || values["revisit-every"]
          ? { schedule: values["revisit-date"]
              ? { kind: "on_date" as const, date: values["revisit-date"], timezone: values.timezone! }
              : { kind: "every" as const, every_days: Number(values["revisit-every"]), timezone: values.timezone! } }
          : {}),
        ...(values["falsifier-check"] ? { falsifier: { check_id: values["falsifier-check"] } } : {}),
      },
      ...(om ? { outcome: { state: "recorded" as const, recorded_on: om[1]!, description: om[2]! } } : {}),
      supersedes: values.supersedes,
      id: values.id,
      dryRun: !!values["dry-run"],
    }), !!values.json);
  }
  if (cmd === "intake") {
    const { values } = parseArgs({ args: [sub, ...rest].filter((x): x is string => x !== undefined), allowPositionals: true, options: {
      repo: { type: "string" }, label: { type: "string" }, instance: { type: "string" }, once: { type: "boolean" },
      "poll-seconds": { type: "string" }, harness: { type: "string" }, "harness-command": { type: "string" },
      "fixture-source": { type: "string" }, resume: { type: "string" }, provided: { type: "string", multiple: true },
      "timeout-ms": { type: "string" }, "max-attempts": { type: "string" }, base: { type: "string" },
      settings: { type: "string" }, json: { type: "boolean" },
    } });
    if (values.harness !== undefined && values.harness !== "fixture" && values.harness !== "command") { process.stderr.write(`--harness must be fixture or command, got '${values.harness}'\n`); process.exit(2); }
    const number = (name: string, raw?: string): number | undefined => {
      if (raw === undefined) return undefined;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) { process.stderr.write(`--${name} must be a positive number, got '${raw}'\n`); process.exit(2); }
      return n;
    };
    out(await intake({
      repo: values.repo,
      label: values.label,
      instanceDir: values.instance,
      once: !!values.once,
      pollSeconds: number("poll-seconds", values["poll-seconds"]),
      harnessKind: values.harness === "command" ? "command" : values.harness === "fixture" ? "fixture" : undefined,
      harnessCommand: values["harness-command"],
      fixtureSource: values["fixture-source"],
      resume: values.resume,
      provided: values.provided,
      timeoutMs: number("timeout-ms", values["timeout-ms"]),
      maxAttempts: number("max-attempts", values["max-attempts"]),
      baseBranch: values.base,
      settingsPath: values.settings,
    }), !!values.json);
  }
  process.stderr.write(`unknown command '${cmd}'\n${HELP}`); process.exit(2);
}

// Run when this file IS the entry point (`node src/cli.ts …`). The installed `aftergrid` bin is
// bin/aftergrid.mjs, which checks the Node version and then calls main() itself; matching on the bin's name
// here as well would run every command twice.
const entry = process.argv[1];
if (entry && (import.meta.url === pathToFileURL(entry).href || entry.endsWith("/cli.ts"))) await main(process.argv.slice(2));
