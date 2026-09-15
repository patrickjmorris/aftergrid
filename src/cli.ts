#!/usr/bin/env node
// aftergrid CLI. Supported runtime: Node 22.6+ with type stripping (Node 24+ recommended); no native compilation.
// Lifecycle: `new finding` (draft) -> author evidence -> `check` (artifact or rerun) -> review/approve -> `render`.
import { parseArgs } from "node:util";
import { newFinding } from "./commands/new-finding.ts";
import { check } from "./commands/check.ts";
import { exitCodeFor, formatHuman, type Report } from "./report.ts";

const HELP = `aftergrid — produce Findings a non-data Reader can understand, inspect and act on.

Usage:
  aftergrid new finding <slug> [--ask "<raw ask>"] [--reader <profile-id>] [--instance <dir>] [--date yyyy-mm-dd]
  aftergrid check <finding-dir> [--mode artifact|rerun] [--json]
  aftergrid render <finding-dir>          (not implemented yet: ag-render-html-pjn)
  aftergrid decide ...                    (not implemented yet: ag-v0-spec-9an.1)
  aftergrid intake ...                    (not implemented yet: ag-background-intake-ka3)

Lifecycle:
  new finding   creates an explicitly incomplete draft with fresh ids; never overwrites an existing Finding.
  check         reports four separate facts: syntax, content completeness, evidence validity, publication readiness.
                --mode artifact (default) verifies saved evidence and never re-executes SQL.
                --mode rerun re-executes recorded Checks against retained inputs (owned by the DuckDB adapter bead).
  render        produces the Reader-safe HTML; a draft renders with a draft label, never as reviewed.

Runtime: Node >= 22.6 (type stripping), no native compiler needed; prebuilt DuckDB binaries are used for rerun.
Exit codes: 0 clean, 1 problems found, 2 refused or usage error, 3 not implemented.
`;

function out(report: Report, json: boolean): never {
  process.stdout.write((json ? JSON.stringify(report, null, 2) : formatHuman(report)) + "\n");
  process.exit(exitCodeFor(report));
}

export function main(argv: string[]): void {
  const [cmd, sub, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") { process.stdout.write(HELP); process.exit(0); }
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
    const mode = values.mode === "rerun" ? "rerun" : "artifact";
    out(check({ dir, mode }), !!values.json);
  }
  if (cmd === "render" || cmd === "decide" || cmd === "intake") { process.stderr.write(`aftergrid ${cmd}: not implemented in this revision\n`); process.exit(3); }
  process.stderr.write(`unknown command '${cmd}'\n${HELP}`); process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("/cli.ts") || process.argv[1]?.endsWith("/aftergrid")) main(process.argv.slice(2));
