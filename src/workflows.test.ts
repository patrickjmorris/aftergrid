// The shipped GitHub Actions workflows, asserted as parsed YAML rather than as text.
//
// A workflow cannot be exercised from a test — nothing here runs Actions — so what is checked is the property
// the contract states: which branch a step takes, which condition gates it, and which tokens the analyzer
// template carries. Contract: docs/contracts/eval.md ("Nightly", "The schedule").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { renderAnalyzerCommand } from "./eval/runner.ts";

const REPO = resolve(fileURLToPath(new URL("../", import.meta.url)));
const workflow = (name: string): any => parseYaml(readFileSync(join(REPO, ".github", "workflows", name), "utf8"));

const nightly = () => workflow("nightly-eval.yml");
const steps = (): any[] => nightly().jobs.golden.steps;
const stepNamed = (fragment: string): any => {
  const found = steps().find((s: any) => typeof s.name === "string" && s.name.includes(fragment));
  assert.ok(found, `no step whose name contains '${fragment}': ${steps().map((s: any) => s.name ?? s.uses).join(" | ")}`);
  return found;
};

/* ------------------------------------------------------------------ the nightly is never a merge gate */

test("the nightly workflow is schedule + workflow_dispatch only, and never on: pull_request", () => {
  const on = nightly().on ?? nightly()[true]; // `on:` parses as the boolean key in YAML 1.1 readers
  assert.ok(on.schedule, "the nightly runs on a schedule");
  assert.ok(on.workflow_dispatch !== undefined, "and can be dispatched by hand");
  assert.equal(on.pull_request, undefined, "a nightly eval is evaluation material, never a merge gate");
});

/* ------------------------------------------------------------------ P1-2(a): the analyzer has to exist */

test("the command branch installs the headless CLI it is about to invoke", () => {
  const run = stepNamed("analyzer").run as string;
  assert.match(run, /npm i(nstall)? -g @anthropic-ai\/claude-code/,
    "the command branch shells out to `claude`, so a step has to install it; nothing on a runner provides it");
  // Only in the branch that uses it: the fixture branch runs no model and must not pay for an install.
  const command = run.slice(run.indexOf("kind=command"));
  assert.match(command, /@anthropic-ai\/claude-code/, "the install belongs to the command branch");
});

/* ------------------------------------------------------------------ P1-2(b): /analyze is a plugin skill */

test("the analyzer template loads this repository as a plugin and carries a spend ceiling", () => {
  const run = stepNamed("run the golden suite").run as string;
  const m = /--analyzer-command "([^"]+)"/.exec(run);
  assert.ok(m, "the command branch passes an --analyzer-command template");
  const template = m![1]!;
  const tokens = template.trim().split(/\s+/);

  assert.equal(tokens[0], "claude");
  assert.ok(tokens.includes("-p"), "headless: /analyze is a prompt, not an interactive session");
  assert.ok(tokens.includes("/analyze"), "the skill the eval is about");
  // /analyze ships in this repository's plugin; a mkdtemp copy of the Instance cannot reach it otherwise.
  assert.ok(tokens.includes("--plugin-dir") && tokens.includes("{repo_root}"),
    `the template must load the Engine checkout as a plugin: ${template}`);
  assert.equal(tokens[tokens.indexOf("--plugin-dir") + 1], "{repo_root}");
  assert.equal(tokens[tokens.indexOf("--add-dir") + 1], "{finding_dir}");
  assert.equal(tokens[tokens.indexOf("--max-budget-usd") + 1], "{max_cost_usd}",
    "the spend ceiling is enforced by the CLI, and the runner substitutes what --max-cost-usd configured");
  // bypassPermissions, not acceptEdits: acceptEdits + --plugin-dir had every write into the Finding directory
  // refused as "a sensitive file" in a real run, and no allow rule lifted it (examples/nyc-open-data/docs/
  // run-log.md, run 1). Bypass is the one mode that wrote there and in the 2026-09-17 probes; the sandbox is
  // the mkdtemp copy of the Instance the runner makes per case (docs/contracts/eval.md).
  assert.equal(tokens[tokens.indexOf("--permission-mode") + 1], "bypassPermissions");
  assert.equal(tokens[tokens.indexOf("--output-format") + 1], "json");
  // There is no shell: a quoted token would be substituted with its quotes.
  assert.equal(/["']/.test(template), false, `the template is split per token, so quotes would become literal: ${template}`);
  assert.match(run, /--max-cost-usd/, "the run passes the ceiling it substitutes");
});

/* ------------------------------------------------------------------ P1-2(c): the summary is gated on evidence */

test("the job summary decides 'model in the loop' from run.json, not from a secret being set", () => {
  const run = stepNamed("job summary").run as string;
  assert.match(run, /node src\/cli\.ts eval summary/,
    "the claim is computed from the recorded run, never from shell string matching on a secret");
  assert.equal(/if \[ -z "\$ANTHROPIC_API_KEY" \]/.test(run), false,
    "a present secret is not evidence a model ran: a crashed analyzer sets it too");
});

/* ------------------------------------------------------------------ P2-2: the scheduled run can file issues */

test("the issue step runs on the schedule as well as on a dispatch that asked for it", () => {
  const step = stepNamed("file or update one issue");
  const condition = String(step.if);
  assert.match(condition, /github\.event_name == 'schedule'/,
    "`inputs` is null on a schedule, so gating on inputs.report_issues alone never files a scheduled regression");
  assert.match(condition, /inputs\.report_issues/);
  assert.match(condition, /always\(\)/);
});

/* ------------------------------------------------------------------ P3-2: an untrusted input is validated */

test("budget_minutes is validated as an integer before it reaches shell arithmetic", () => {
  const run = stepNamed("run the golden suite").run as string;
  const guard = run.indexOf('case "$BUDGET_MINUTES"');
  assert.ok(guard >= 0, `budget_minutes is a free-text dispatch input and must be validated: ${run}`);
  assert.match(run.slice(guard), /\*\[!0-9\]\*\)/, "anything that is not a run of digits is refused");
  assert.ok(guard < run.indexOf("BUDGET_MS=$(("), "the guard has to come before the arithmetic it protects");
});

/* ------------------------------------------------------------------ P3-5: which baseline was chosen */

test("the baseline is taken from the default branch, ignores cancelled runs, and is named in the summary", () => {
  const run = stepNamed("fetch the previous nightly").run as string;
  assert.match(run, /--branch "?\$\{\{ github\.event\.repository\.default_branch \}\}"?/,
    "a baseline from another branch is not a baseline for this one");
  // The jq filter is inside a double-quoted shell string, so its own quotes are backslash-escaped.
  assert.match(run, /conclusion != \\?"cancelled\\?"/, "a cancelled run recorded nothing to compare against");
  assert.match(run, /GITHUB_STEP_SUMMARY/);
  assert.match(run, /[Bb]aseline[^\n]*\$prev|\$prev[^\n]*GITHUB_STEP_SUMMARY/,
    "the chosen baseline run id is printed, so a reader can check what the comparison compared against");
});

/* ------------------------------------------------------------------ P2-3: the PR check is not a merge gate */

test("ci.yml tolerates a failing golden case, because an eval is never a merge gate", () => {
  const ci = workflow("ci.yml");
  const evalStep = ci.jobs["seam-1"].steps.find((s: any) => typeof s.run === "string" && s.run.includes("cli.ts eval --golden"));
  assert.ok(evalStep, "ci runs the golden suite with the fixture analyzer");
  assert.match(String(evalStep.run), /\|\| test \$\? -eq 1/,
    "exit 1 is a failing case and must not fail the PR check; 2 (usage) and 3 still do");
});

/* ------------------------------------------------------------------ the template and the runner agree */

test("the workflow's analyzer template renders to an argv the runner can actually spawn", () => {
  const run = stepNamed("run the golden suite").run as string;
  const template = /--analyzer-command "([^"]+)"/.exec(run)![1]!;
  const argv = renderAnalyzerCommand(template, {
    golden: { id: "g", raw_ask: "ask", reader: "r", expected: { outcome: "answered", definition_ids: [], tables_read: [] }, reference: { queries: [] } },
    rawAsk: "ask", findingDir: "/tmp/finding", instanceRoot: "/tmp/instance",
    repoRoot: "/tmp/engine", maxCostUsd: 3,
  });

  assert.equal(argv[0], "claude");
  assert.equal(argv.includes("{repo_root}"), false, "every token the template names is substituted, not passed through");
  assert.equal(argv.includes("{max_cost_usd}"), false);
  assert.equal(argv[argv.indexOf("--plugin-dir") + 1], "/tmp/engine");
  assert.equal(argv[argv.indexOf("--add-dir") + 1], "/tmp/finding");
  assert.equal(argv[argv.indexOf("--max-budget-usd") + 1], "3");
  // Flags the local CLI really has: verified by hand against `claude --help` on a machine that ships it.
  // Nothing here runs a model, so this is a shape check and not evidence the invocation works.
  for (const flag of ["-p", "--plugin-dir", "--add-dir", "--permission-mode", "--max-budget-usd", "--output-format"]) {
    assert.ok(argv.includes(flag), `${flag} survived substitution`);
  }
});
