#!/usr/bin/env node
// aftergrid CLI. Supported runtime: Node 22.18+ or 24+ (type stripping is on by default there); no native compilation.
// Lifecycle: `new finding` (draft) -> author evidence -> `check` (artifact or rerun) -> review/approve -> `render`.
import { parseArgs } from "node:util";
import { newFinding } from "./commands/new-finding.ts";
import { setup } from "./commands/setup.ts";
import { check } from "./commands/check.ts";
import { render } from "./commands/render.ts";
import { decide } from "./commands/decide.ts";
import { hook } from "./commands/hook.ts";
import { intake } from "./commands/intake.ts";
import { exitCodeFor, formatHuman, type Report } from "./report.ts";

const HELP = `aftergrid — produce Findings a non-data Reader can understand, inspect and act on.

Usage:
  aftergrid setup [--instance <dir>] [--adapter duckdb|postgres] [--duckdb-path <file-or-csv-dir>]
                  [--pg-url-env <ENV_VAR_NAME>] [--owner-name "<name>"] [--owner-contact <contact>]
                  [--repository owner/repo] [--automation-login <bot>] [--trusted-approver <login> ...]
                  [--settings <claude settings.json>] [--skip-hook] [--dry-run] [--json]
  aftergrid new finding <slug> [--ask "<raw ask>"] [--reader <profile-id>] [--instance <dir>] [--date yyyy-mm-dd]
  aftergrid check <finding-dir> [--mode artifact|rerun] [--json]
  aftergrid render <finding-dir> [--png] [--json]
  aftergrid decide --finding <dir> --owner <name> --date <yyyy-mm-dd> --claims <c1,c2> --action action|inaction
                   --description "<what was done>" --rationale "<why>" [--revisit-date <yyyy-mm-dd> | --revisit-every <days>]
                   [--timezone <IANA zone>] [--falsifier-check <check_id>] [--outcome "<yyyy-mm-dd> <what happened>"]
                   [--supersedes <dec_id>] [--id <dec_id>] [--dry-run] [--json]
  aftergrid hook install|uninstall|status [--settings <path>]
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
  if (cmd === "render") {
    const { values, positionals } = parseArgs({ args: [sub, ...rest].filter((x): x is string => x !== undefined), allowPositionals: true, options: { png: { type: "boolean" }, json: { type: "boolean" } } });
    const dir = positionals[0];
    if (!dir) { process.stderr.write("usage: aftergrid render <finding-dir>\n"); process.exit(2); }
    out(await render({ dir, png: !!values.png }), !!values.json);
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
      id: { type: "string" }, "dry-run": { type: "boolean" }, json: { type: "boolean" },
    } });
    const usage = (message: string): never => { process.stderr.write(`${message}\nusage: aftergrid decide --finding <dir> --owner <name> --date <yyyy-mm-dd> --claims <c1,c2> --action action|inaction --description "<what was done>" --rationale "<why>" [--revisit-date <yyyy-mm-dd> | --revisit-every <days>] [--timezone <IANA zone>] [--falsifier-check <check_id>] [--outcome "<yyyy-mm-dd> <what happened>"] [--supersedes <dec_id>] [--id <dec_id>] [--dry-run] [--json]\n`); process.exit(2); };
    const dir = values.finding ?? positionals[0];
    if (!dir) usage("name the Finding directory to decide on");
    if (values.action !== "action" && values.action !== "inaction") usage("--action must be action or inaction");
    for (const required of ["owner", "date", "claims", "description", "rationale"] as const) if (!values[required]) usage(`--${required} is required: aftergrid decide never invents one`);
    if (!values["revisit-date"] && !values["revisit-every"] && !values["falsifier-check"]) usage("state when to revisit: --revisit-date, --revisit-every, and/or --falsifier-check");
    const om = values.outcome ? /^(\d{4}-\d{2}-\d{2})\s+(.*\S)$/.exec(values.outcome) : null;
    if (values.outcome && !om) usage('--outcome is "<yyyy-mm-dd> <what happened>"; omit it while the outcome is unknown');
    out(await decide({
      findingDir: dir,
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

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("/cli.ts") || process.argv[1]?.endsWith("/aftergrid")) await main(process.argv.slice(2));
