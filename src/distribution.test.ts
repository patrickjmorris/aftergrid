// ag-distribution-dq4: the shipped package has to agree with itself, and the tarball has to contain only what
// the product is. Both are checked as black boxes — `validatePlugin` against a directory, and the packed tarball
// against its own contents — never against the implementation that produced them.
//
// The full clean-install smoke (`scripts/pack-smoke.mjs`) is NOT run here: it installs from the network and
// drives the whole CLI, which belongs in the `pack-smoke` CI job. Its `--quick` mode is, because packing and
// grepping the tarball is fast and the credential, marker and licence checks are the ones that must never go
// unrun.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlugin } from "./distribution/validate-plugin.ts";

const REPO = resolve(fileURLToPath(new URL("../", import.meta.url)));
const cleanup: string[] = [];
process.on("exit", () => { for (const d of cleanup) rmSync(d, { recursive: true, force: true }); });

const categories = (r: { errors: { category: string }[] }) => r.errors.map((e) => e.category);
const locations = (r: { errors: { location: string }[] }) => r.errors.map((e) => e.location);

/** A copy holding everything validatePlugin reads: the manifest, the skills, the docs pages and package.json. */
function packageCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "ag-plugin-"));
  cleanup.push(dir);
  cpSync(join(REPO, ".claude-plugin"), join(dir, ".claude-plugin"), { recursive: true });
  cpSync(join(REPO, "skills"), join(dir, "skills"), { recursive: true });
  cpSync(join(REPO, "docs", "skills"), join(dir, "docs", "skills"), { recursive: true });
  cpSync(join(REPO, "package.json"), join(dir, "package.json"));
  return dir;
}

const skillFile = (root: string, name = "setup-aftergrid") => join(root, "skills", name, "SKILL.md");
const openaiFile = (root: string, name = "setup-aftergrid") => join(root, "skills", name, "agents", "openai.yaml");

/* ------------------------------------------------------------------ the repository itself */

test("the repository's plugin package validates, and every promoted skill states who may invoke it", () => {
  const report = validatePlugin(REPO);
  assert.deepEqual(report.errors, [], "the repository's own plugin package must validate");
  assert.equal(report.command, "plugin");
  assert.equal(report.content, "complete");
  assert.equal(report.readiness, "unknown", "a plugin says nothing about a Finding's publication readiness");

  const setup = report.skills.find((s) => s.name === "setup-aftergrid");
  assert.ok(setup, "setup-aftergrid is the promoted skill in v0");
  assert.equal(setup.invocation, "user", "setup writes files and installs a hook: a human asks for it");
  for (const s of report.skills) assert.notEqual(s.invocation, "unstated");
});

test("every promoted skill is named in the manifest, has an openai.yaml and has a docs page", () => {
  const manifest = JSON.parse(readFileSync(join(REPO, ".claude-plugin", "plugin.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  assert.deepEqual([...manifest.skills].sort(), [...pkg.skills].sort(), "the plugin manifest and the package.json skills index must agree");
  for (const entry of manifest.skills) {
    const dir = join(REPO, String(entry).replace(/^\.\//, ""));
    assert.ok(existsSync(join(dir, "SKILL.md")), `${entry}/SKILL.md`);
    assert.ok(existsSync(join(dir, "agents", "openai.yaml")), `${entry}/agents/openai.yaml (spec story 48)`);
    const name = dir.split("/").pop();
    assert.ok(existsSync(join(REPO, "docs", "skills", `${name}.md`)), `docs/skills/${name}.md`);
  }
});

/* ------------------------------------------------------------------ the failures it has to catch */

test("a SKILL.md with no invocation policy fails, and says which file and what to add", () => {
  const root = packageCopy();
  const source = readFileSync(skillFile(root), "utf8");
  writeFileSync(skillFile(root), source.replace(/^disable-model-invocation: true\n/m, ""));

  const report = validatePlugin(root);
  assert.ok(categories(report).includes("invocation_policy"), `expected an invocation_policy error, got ${JSON.stringify(report.errors)}`);
  const problem = report.errors.find((e) => e.category === "invocation_policy")!;
  assert.equal(problem.location, "skills/setup-aftergrid/SKILL.md");
  assert.match(problem.remedy ?? "", /disable-model-invocation: true|user-invocable: false/);
  // By name, not by position: `report.skills` is every promoted skill, in alphabetical order, and grows.
  assert.equal(report.skills.find((s) => s.name === "setup-aftergrid")!.invocation, "unstated", "an unstated policy is reported as unstated, never guessed");
  assert.equal(report.content, "incomplete");
});

test("an openai.yaml that disagrees with its SKILL.md fails, naming both sides", () => {
  const root = packageCopy();
  const source = readFileSync(openaiFile(root), "utf8");
  writeFileSync(openaiFile(root), source.replace("allow_implicit_invocation: false", "allow_implicit_invocation: true"));

  const report = validatePlugin(root);
  const problem = report.errors.find((e) => e.category === "invocation_policy");
  assert.ok(problem, `expected an invocation_policy error, got ${JSON.stringify(report.errors)}`);
  assert.equal(problem.location, "skills/setup-aftergrid/agents/openai.yaml#policy.allow_implicit_invocation");
  assert.match(problem.message, /allow_implicit_invocation: true/);
  assert.match(problem.message, /user-invoked/);
});

test("an openai.yaml with no policy at all fails: the default is not a statement", () => {
  const root = packageCopy();
  writeFileSync(openaiFile(root), 'interface:\n  display_name: "Setup aftergrid"\n  short_description: "Scaffold and verify an aftergrid Instance"\n');

  const report = validatePlugin(root);
  const problem = report.errors.find((e) => e.category === "invocation_policy");
  assert.ok(problem, `expected an invocation_policy error, got ${JSON.stringify(report.errors)}`);
  assert.match(problem.location, /openai\.yaml#policy\.allow_implicit_invocation$/);
});

test("a missing openai.yaml, a missing docs page and a skill the manifest forgot are each reported with a location", () => {
  const root = packageCopy();
  rmSync(openaiFile(root), { force: true });
  rmSync(join(root, "docs", "skills", "setup-aftergrid.md"), { force: true });
  // A second promoted skill on disk that the manifest does not list.
  mkdirSync(join(root, "skills", "ghost"), { recursive: true });
  writeFileSync(join(root, "skills", "ghost", "SKILL.md"), "---\nname: ghost\ndescription: not in the manifest\nuser-invocable: false\n---\n\n# Ghost\n");

  const report = validatePlugin(root);
  assert.ok(locations(report).includes("skills/setup-aftergrid/agents/openai.yaml"));
  assert.ok(locations(report).includes("docs/skills/setup-aftergrid.md"));
  assert.ok(report.errors.some((e) => e.category === "plugin_manifest" && e.location === "skills/ghost"), `expected the unlisted skill to be reported, got ${JSON.stringify(report.errors)}`);
});

test("a manifest naming a skill that does not exist fails rather than being ignored", () => {
  const root = packageCopy();
  const manifest = JSON.parse(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8"));
  manifest.skills.push("./skills/not-here");
  writeFileSync(join(root, ".claude-plugin", "plugin.json"), JSON.stringify(manifest, null, 2));

  const report = validatePlugin(root);
  assert.ok(report.errors.some((e) => e.category === "plugin_manifest" && /not-here/.test(e.message)), JSON.stringify(report.errors));
});

test("a missing or unparseable manifest stops with one honest error, not a cascade", () => {
  const root = packageCopy();
  rmSync(join(root, ".claude-plugin", "plugin.json"), { force: true });
  const absent = validatePlugin(root);
  assert.deepEqual(categories(absent), ["missing_file"]);
  assert.equal(absent.syntax, "invalid");

  writeFileSync(join(root, ".claude-plugin", "plugin.json"), "{ not json");
  const broken = validatePlugin(root);
  assert.deepEqual(categories(broken), ["syntax"]);
});

test("the package.json skills index disagreeing with the manifest is an error", () => {
  const root = packageCopy();
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  pkg.skills = ["./skills/something-else"];
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg, null, 2));

  const report = validatePlugin(root);
  assert.ok(report.errors.some((e) => e.category === "plugin_manifest" && e.location === "package.json#skills"), JSON.stringify(report.errors));
});

/* ------------------------------------------------------------------ what ships */

test("the files whitelist excludes fixtures, tests, beads, design docs and test sources", () => {
  const packed = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: REPO, encoding: "utf8", timeout: 120_000 });
  assert.equal(packed.status, 0, `npm pack --dry-run failed: ${packed.stderr}`);
  const files: string[] = JSON.parse(packed.stdout)[0].files.map((f: { path: string }) => f.path);

  for (const forbidden of ["fixtures/", "tests/", ".beads/", "docs/design/", "docs/spec/", "docs/adr/", ".github/"]) {
    const leaked = files.filter((f) => f.startsWith(forbidden));
    assert.deepEqual(leaked, [], `${forbidden} must not be in the package`);
  }
  assert.deepEqual(files.filter((f) => /\.test\.(ts|mjs)$/.test(f)), [], "test sources must not be in the package");

  for (const required of ["bin/aftergrid.mjs", "bin/strip-types.mjs", "src/cli.ts", "LICENSE", "README.md", ".claude-plugin/plugin.json", "skills/setup-aftergrid/SKILL.md", "skills/setup-aftergrid/agents/openai.yaml", "docs/skills/setup-aftergrid.md", "docs/contracts/distribution.md"]) {
    assert.ok(files.includes(required), `${required} must be in the package`);
  }
  assert.ok(files.some((f) => f.startsWith("schema/")), "the schemas must be in the package");
  assert.ok(files.some((f) => f.startsWith("hooks/")), "the guard must be in the package");
});

test("the packed tarball carries no credential, no fixture marker and an intact MIT notice", () => {
  const smoke = spawnSync(process.execPath, [join(REPO, "scripts", "pack-smoke.mjs"), "--quick", "--json"], { cwd: REPO, encoding: "utf8", timeout: 300_000 });
  const summary = JSON.parse(smoke.stdout);
  assert.equal(summary.ok, true, `pack-smoke --quick failed: ${JSON.stringify(summary.steps, null, 2)}`);
  assert.equal(smoke.status, 0);
  assert.deepEqual(summary.steps.map((s: { id: string; status: string }) => [s.id, s.status]), [["pack", "ok"], ["tarball-audit", "ok"]]);
  assert.match(summary.steps[1].detail, /no credential pattern/);
  assert.match(summary.steps[1].detail, /MIT notice intact/);
  assert.ok(summary.not_established.some((n: string) => /npm publish/.test(n)), "the summary must keep saying what it did not do");
});

test("the bin is a plain-JavaScript launcher, so an unsupported Node gets a message instead of a parse error", () => {
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  assert.equal(pkg.bin.aftergrid, "bin/aftergrid.mjs");
  assert.equal(pkg.private, true, "publishing is the owner's action; the package stays private here");
  assert.ok(!pkg.scripts.prepare && !pkg.scripts.prepack && !pkg.scripts.install, "the no-build-step claim means no lifecycle build script");
  for (const runtime of ["@duckdb/node-api", "@resvg/resvg-wasm", "ajv", "ajv-formats", "marked", "pg", "vega", "vega-lite", "yaml"]) {
    assert.ok(pkg.dependencies[runtime], `${runtime} is imported at runtime and must be a dependency`);
    assert.ok(!pkg.devDependencies?.[runtime], `${runtime} must not also be a devDependency`);
  }
  const launcher = readFileSync(join(REPO, "bin", "aftergrid.mjs"), "utf8");
  assert.match(launcher, /22\.18/, "the launcher names the supported floor in the message an old Node gets");
  assert.match(launcher, /await import\("\.\/strip-types\.mjs"\)/, "the launcher registers the type-stripping hook before importing any .ts");
});

/* ------------------------------------------------------------------ the skills and the CLI agree (ag-olp) */
//
// The skills are prose, so what can be asserted about them is that they still say what the shipped CLI does.
// ADR 0010 makes the recorded data path the default and the adapter the exception, and three facts are the ones
// a later edit would quietly undo: the order the two paths are written in, that a missing adapter is not a halt,
// and that every `aftergrid record` line a skill tells a model to run is a command the CLI actually parses.

/** The body of a numbered step, from its `## <n>. ` heading to the next `## ` heading. */
function step(markdown: string, n: number): string {
  const start = markdown.search(new RegExp(`^## ${n}\\. `, "m"));
  assert.notEqual(start, -1, `no step ${n} heading`);
  const rest = markdown.slice(start);
  const end = rest.slice(1).search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

test("checked-analysis steps 3 and 6 write the recorded path before the adapter path (ADR 0010)", () => {
  const skill = readFileSync(join(REPO, "skills", "checked-analysis", "SKILL.md"), "utf8");

  for (const [n, adapterCommand] of [[3, "aftergrid capture"], [6, "aftergrid execute"]] as const) {
    const body = step(skill, n);
    const recorded = body.indexOf("aftergrid record");
    const adapter = body.indexOf(adapterCommand);
    assert.notEqual(recorded, -1, `step ${n} must name \`aftergrid record\``);
    assert.notEqual(adapter, -1, `step ${n} must still name \`${adapterCommand}\` as the exception`);
    assert.ok(recorded < adapter, `step ${n} names ${adapterCommand} before aftergrid record: the recorded path is the default, the adapter path the exception`);
  }

  const three = step(skill, 3);
  assert.match(three, /artifact_replay/, "step 3 must name the one guarantee the recorded path gives");
  assert.match(three, /rerun_unavailable/, "step 3 must say what stops having an answer until retained inputs exist");
  assert.match(three, /Revisit/, "step 3 must name Revisit as unavailable on the recorded path");

  const six = step(skill, 6);
  assert.match(six, /--tool/, "step 6 must show the required --tool flag");
  assert.match(six, /agent-reported/, "step 6 must say Check outcomes on this path are agent-reported");
  assert.match(six, /unevidenced_outcome/, "step 6 must say a reported pass may only be recorded with its evidence file");
  assert.match(six, /checks_reported_by_agent/, "step 6 must name the fact `check` reports");
  assert.match(six, /guardrail hook[\s\S]{0,400}shell/, "ADR 0006/0010: step 6 must state the guard's non-coverage where SQL is run outside the CLI");
  assert.match(six, /rerun_unavailable/, "step 6 may not offer `check --mode rerun` on this path without saying it is refused");
});

// ag-falsifier-outcome-cov. The skill told a model to mark the falsifier `required: true`, `check` then read a
// failing falsifier as an evidence error, and the honest inconclusive Finding could not be written at all.
test("checked-analysis writes the falsifier as required: false, and calls a failing one the inconclusive path", () => {
  const skill = readFileSync(join(REPO, "skills", "checked-analysis", "SKILL.md"), "utf8");
  const four = step(skill, 4);

  const row = four.split("\n").find((l) => /^\|\s*`falsifier`\s*\|/.test(l));
  assert.ok(row, "step 4 must still carry the Check-kinds table row for `falsifier`");
  assert.match(row!, /`required: false`/, `the falsifier row must say required: false, it says: ${row}`);
  assert.doesNotMatch(row!, /`required: true`/, "a falsifier is never an evidence-validity condition");

  assert.match(four, /never `required: true`|is never `required: true`/, "step 4 must say so in prose, not only in the table");
  assert.match(four, /check_shape/, "and name what `check` reports when it is");
  assert.match(four, /inconclusive/, "step 4 must name the outcome a failing falsifier forces");
  assert.match(four, /[Ww]rite it up|continue to `\/write-finding`|Write it up/, "and say the run writes it up");
  assert.match(four, /not a halt|Do not stop at\s*\n?`?needs_attention`?|needs_attention/, "and say it is not a needs_attention halt");
  assert.match(four, /checks_preregistered/, "step 4 must tell the model to pin each Check's hash when it writes it");

  // The same rule, in the two places a harness might read instead of the skill body.
  const halting = readFileSync(join(REPO, "skills", "analyze", "references", "halting.md"), "utf8");
  assert.match(halting, /## What is not a halt[\s\S]*failing pre-registered falsifier/i, "the halting reference lists it as a non-halt");
  const doc = readFileSync(join(REPO, "docs", "skills", "checked-analysis.md"), "utf8");
  assert.match(doc, /falsifier_failed/, "the docs page must name the warning `check` reports");

  // And the contract the prose describes really refuses the shape, so the two cannot drift apart.
  const validator = readFileSync(join(REPO, "scripts", "lib", "validate-finding.mjs"), "utf8");
  assert.match(validator, /kind === "falsifier" && ck\.required === true/, "the validator must be the thing that refuses it");
});

test("the /analyze halt conditions do not name a missing adapter", () => {
  const skill = readFileSync(join(REPO, "skills", "analyze", "SKILL.md"), "utf8");
  const halts = step(skill, 4);

  const bullets = halts.split("\n").filter((l) => l.startsWith("- "));
  assert.ok(bullets.length >= 7, `expected the three halt lists, found ${bullets.length} bullet(s)`);
  for (const bullet of bullets) {
    assert.doesNotMatch(bullet, /adapter/i, `a missing adapter is not a halt (ADR 0010), but a halt bullet names one: ${bullet}`);
  }
  assert.match(halts, /adapter is on none of the three lists/, "the halt section must say so explicitly, not leave it to be inferred");
  // The third halt: a harness refusal is reported through the run's own output, because the halt artifact may
  // be the very file that was refused (ag-analyze-permission-halt-pr7).
  assert.match(halts, /permission_denied/, "a harness refusal is a halt state of its own");
  assert.match(halts, /"aftergrid": "halt"/, "and it is printed as the last line of the final message");
  assert.match(halts, /rerun_unavailable/, "the halt section must say what a recorded Finding costs instead of halting");

  const doc = readFileSync(join(REPO, "docs", "skills", "analyze.md"), "utf8");
  assert.match(doc, /Is a missing adapter a halt\?\*\* No/, "the docs page must answer it in the same words");
  const halting = readFileSync(join(REPO, "skills", "analyze", "references", "halting.md"), "utf8");
  assert.match(halting, /## What is not a halt/, "the halting reference carries the same non-halt");
});

// ag-analyze-review-last-oko. Citi Bike runs 2 and 3 (`examples/nyc-open-data/docs/run-log.md`): a headless
// run reported "three current reviews, no blocking findings" in its own words while the tree carried
// superseded round-1 reviews, the Operator read those warnings as "all reviews stale", and a whole run went on
// re-reviews that `review record` would have deduped away. The three sentences below are what the skill has to
// keep saying, and the CLI has to keep implementing.
test("the /analyze chain ends with review status, quotes its verdict line, and separates stale from superseded", () => {
  const skill = readFileSync(join(REPO, "skills", "analyze", "SKILL.md"), "utf8");
  const halting = readFileSync(join(REPO, "skills", "analyze", "references", "halting.md"), "utf8");
  const doc = readFileSync(join(REPO, "docs", "skills", "analyze.md"), "utf8");

  // `assert.ok` rather than `assert.match`: these pages are thousands of characters, and a failure that dumps
  // all three of them buries the one sentence that went missing.
  const says = (name: string, text: string, pattern: RegExp, what: string) =>
    assert.ok(pattern.test(text), `${name} must ${what} (no match for ${pattern})`);

  for (const [name, text] of [["SKILL.md", skill], ["halting.md", halting], ["docs/skills/analyze.md", doc]] as const) {
    // 1. The order of the last two commands, and that nothing follows them.
    says(name, text, /last two commands of every run[\s\S]{0,240}`aftergrid check[\s\S]{0,160}`aftergrid review status/,
      "name the last two commands of every run, in order");
    // 2. An edit after a review re-reviews before the run may report the Finding reviewed.
    says(name, text, /\/?analysis[-_]review/, "say where an edit after a review sends the run");
    says(name, text, /edit(?:ed)?\s+(?:made\s+)?after\s+(?:a|the)\s+review/i, "name the edit-after-review case in those words");
    // 3. A stale newest review means re-run that review, never re-pin it.
    says(name, text, /never\s+re-?pin/i, "forbid re-pinning a review");
    // 4. A superseded review is history, not a reason to re-review.
    says(name, text, /superseded/, "use the word superseded for a replaced review");
    says(name, text, /history,?\s+(?:and\s+)?not/i, "call a superseded review history rather than staleness");
    // 5. The counts line and the verdict line, as the command prints them.
    says(name, text, /reviews: 3 current, 3 superseded, 0 stale/, "show the counts line as the command prints it");
    says(name, text, /verdict: continue/, "show the verdict line as the command prints it");
  }
  says("SKILL.md", skill, /verbatim/, "say the final report quotes the verdict line verbatim");
  says("SKILL.md", skill, /not\*{0,2}\s+summarise/i, "say the run does not retell it in its own words");
  says("docs/skills/analyze.md", doc, /verbatim/, "answer it the same way");

  // The rule is not only prose: the command it describes exits non-zero, and the contract documents the code.
  const command = readFileSync(join(REPO, "src", "commands", "review.ts"), "utf8");
  says("src/commands/review.ts", command, /category: "stale_review", location: `reviews\/\$\{s\.kind\}`/,
    "report a stale newest review as an error, not as a note");
  says("src/commands/review.ts", command,
    /reviews: \$\{current\} current, \$\{decision\.superseded\.length\} superseded, \$\{decision\.stale\.length\} stale/,
    "build the counts line the skills quote");
  const contract = readFileSync(join(REPO, "docs", "contracts", "analysis-directory.md"), "utf8");
  says("docs/contracts/analysis-directory.md", contract, /\|\s*1\s*\|[^|]*stale_review/, "carry the exit-code row");
});

test("every `aftergrid record` line in the skills and their docs uses flags the CLI parses", () => {
  // The flags the shipped command really takes, read from the `record` branch of the CLI's own parseArgs.
  const cli = readFileSync(join(REPO, "src", "cli.ts"), "utf8");
  const branch = cli.slice(cli.indexOf('if (cmd === "record") {'), cli.indexOf('if (cmd === "revise") {'));
  assert.ok(branch.length > 0 && branch.includes("parseArgs"), "could not find the record branch of the CLI");
  const declared = new Set<string>();
  for (const m of branch.matchAll(/(?:"([a-z][a-z-]*)"|\b([a-z][a-z-]*)):\s*\{\s*type:/g)) declared.add((m[1] ?? m[2])!);
  for (const required of ["tool", "execution", "result", "check", "outcome", "evidence"]) {
    assert.ok(declared.has(required), `the CLI no longer declares --${required}, and the skills still tell a model to pass it`);
  }

  const pages = [
    join("skills", "checked-analysis", "SKILL.md"),
    join("skills", "checked-analysis", "agents", "openai.yaml"),
    join("skills", "checked-analysis", "references", "clarification.md"),
    join("skills", "analyze", "SKILL.md"),
    join("skills", "analyze", "agents", "openai.yaml"),
    join("skills", "analyze", "references", "halting.md"),
    join("skills", "setup-aftergrid", "SKILL.md"),
    join("skills", "setup-aftergrid", "agents", "openai.yaml"),
    join("skills", "write-finding", "SKILL.md"),
    join("skills", "revise-finding", "SKILL.md"),
    join("docs", "skills", "checked-analysis.md"),
    join("docs", "skills", "analyze.md"),
    join("docs", "skills", "setup-aftergrid.md"),
    join("docs", "skills", "write-finding.md"),
    join("docs", "skills", "revise-finding.md"),
  ];

  let invocations = 0;
  for (const page of pages) {
    const text = readFileSync(join(REPO, page), "utf8").replace(/\\\n\s*/g, " ");
    for (const line of text.matchAll(/aftergrid record\b[^\n`]*/g)) {
      invocations += 1;
      for (const flag of line[0].matchAll(/--([a-z][a-z-]*)/g)) {
        assert.ok(declared.has(flag[1]!), `${page} tells a model to run \`aftergrid record --${flag[1]}\`, which the CLI does not parse`);
      }
    }
  }
  assert.ok(invocations >= 3, `expected the recorded path to be shown as a command, found ${invocations} \`aftergrid record\` invocation(s)`);
});

/* ------------------------------ the remaining adapter assumptions on the recorded path (ag-…-q2l) */
//
// Three skills still read as though an adapter were the world: setup made `--adapter` a required input,
// /write-finding took coverage from retained inputs that a recorded Finding does not have, and /revise-finding
// sent every numeric revision to `aftergrid execute`. What is asserted here is what a later edit would quietly
// undo — that the adapter is stated as optional, that the recorded source of a date is written before the
// retained one, and that the recorded re-run is named.

test("the setup skill says the adapter is optional and shows the command without one", () => {
  const skill = readFileSync(join(REPO, "skills", "setup-aftergrid", "SKILL.md"), "utf8");
  const doc = readFileSync(join(REPO, "docs", "skills", "setup-aftergrid.md"), "utf8");
  const openai = readFileSync(join(REPO, "skills", "setup-aftergrid", "agents", "openai.yaml"), "utf8");

  assert.match(skill, /adapter is optional/i, "the skill must say the adapter is optional in those words");
  assert.match(skill, /recorded path/i, "and name the route that is the default instead");
  assert.match(skill, /aftergrid record/, "the skill must name the command that produces evidence without an adapter");
  assert.match(doc, /Optional/i, "the docs page must say the same about the backend input");
  assert.match(doc, /aftergrid record/);
  assert.match(openai, /optional/i, "the OpenAI prompt must not ask for a backend as though it were required");

  // The command the skill tells a model to run first carries no --adapter: the flag is the upgrade, shown after.
  const blocks = [...skill.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]!);
  const first = blocks.find((b) => /\bsetup\b/.test(b));
  assert.ok(first, "the skill must still show the setup command");
  assert.equal(/--adapter/.test(first!), false, `the first setup command must run without an adapter, got:\n${first}`);
  assert.ok(blocks.some((b) => /--adapter duckdb/.test(b)) && blocks.some((b) => /--adapter postgres/.test(b)),
    "both upgrades must still be shown, as the exception");
});

test("every `aftergrid setup` flag the skills name is one the CLI parses", () => {
  const cli = readFileSync(join(REPO, "src", "cli.ts"), "utf8");
  const branch = cli.slice(cli.indexOf('if (cmd === "setup") {'), cli.indexOf('if (cmd === "new") {'));
  assert.ok(branch.length > 0 && branch.includes("parseArgs"), "could not find the setup branch of the CLI");
  const declared = new Set<string>();
  for (const m of branch.matchAll(/(?:"([a-z][a-z-]*)"|\b([a-z][a-z-]*)):\s*\{\s*type:/g)) declared.add((m[1] ?? m[2])!);
  for (const required of ["instance", "adapter", "duckdb-path", "pg-url-env", "owner-name", "owner-contact", "repository", "automation-login", "trusted-approver"]) {
    assert.ok(declared.has(required), `the CLI no longer declares --${required}, and the skills still tell a model to pass it`);
  }
  // `none` is a value the CLI accepts, so a skill may write it without inventing a flag.
  assert.match(branch, /"none"/, "the CLI must accept --adapter none, which is what an optional adapter means");

  const pages = [
    join("skills", "setup-aftergrid", "SKILL.md"),
    join("skills", "setup-aftergrid", "agents", "openai.yaml"),
    join("docs", "skills", "setup-aftergrid.md"),
    join("skills", "revise-finding", "SKILL.md"),
    join("skills", "write-finding", "SKILL.md"),
  ];
  for (const page of pages) {
    const text = readFileSync(join(REPO, page), "utf8").replace(/\\\n\s*/g, " ");
    for (const line of text.matchAll(/(?:aftergrid|cli\.ts) setup\b[^\n`]*/g)) {
      for (const flag of line[0].matchAll(/--([a-z][a-z-]*)/g)) {
        assert.ok(declared.has(flag[1]!), `${page} tells a model to run \`aftergrid setup --${flag[1]}\`, which the CLI does not parse`);
      }
    }
  }
});

test("write-finding step 7 takes coverage from the recorded parameters before the retained inputs", () => {
  const skill = readFileSync(join(REPO, "skills", "write-finding", "SKILL.md"), "utf8");
  const seven = step(skill, 7);

  const recorded = seven.indexOf("recorded parameters");
  const retained = seven.indexOf("retained inputs");
  assert.notEqual(recorded, -1, "step 7 must say the window comes from the recorded parameters");
  assert.notEqual(retained, -1, "step 7 must still name the retained inputs as the adapter path's source");
  assert.ok(recorded < retained, "the recorded path is the default: its source of a date is written first");
  assert.match(seven, /executed_at/, "step 7 must name where data_to comes from when the SQL read up to the moment it ran");
  assert.match(seven, /needs_input/, "a date in neither place is a needs_input item, never an invented one");

  // The Appendix says what was run and by which tool, because on this route there is no retained input to list.
  const eight = step(skill, 8);
  assert.match(eight, /what was run and by which tool/i);
  assert.match(eight, /executed_by\.tool/, "the Appendix names the field the tool is read from");

  // Integrity: a hash mismatch is not only a retained input's to have.
  const ten = step(skill, 10);
  assert.match(ten, /hash_mismatch|hash mismatch/);
  assert.match(ten, /recorded result/, "step 10 must cover a mismatch on a recorded result");
  assert.match(ten, /evidence file/, "and on a Check's evidence file");

  const doc = readFileSync(join(REPO, "docs", "skills", "write-finding.md"), "utf8");
  assert.match(doc, /recorded parameters/, "the docs page must answer it in the same words");
});

test("revise-finding sends a numeric revision on the recorded path to `aftergrid record`", () => {
  const skill = readFileSync(join(REPO, "skills", "revise-finding", "SKILL.md"), "utf8");
  const start = skill.search(/^### `numeric`$/m);
  assert.notEqual(start, -1, "no `numeric` branch heading");
  const rest = skill.slice(start);
  const afterHeading = rest.indexOf("\n") + 1;          // past the `### ` line itself, not one character into it
  const end = rest.slice(afterHeading).search(/^#{2,3} /m);
  const numeric = end === -1 ? rest : rest.slice(0, afterHeading + end);

  const recorded = numeric.indexOf("aftergrid record");
  const adapter = numeric.indexOf("aftergrid execute");
  assert.notEqual(recorded, -1, "the numeric branch must name `aftergrid record` as the recorded re-run");
  assert.notEqual(adapter, -1, "and must still name `aftergrid execute` for the adapter path");
  assert.ok(recorded < adapter, "the recorded path is the default, the adapter path the exception");

  // Only what the contracts hold: record re-pins, and archiving is revise's.
  assert.match(numeric, /does \*\*not\*\* archive/, "record archives nothing, and the skill must say so");
  assert.match(numeric, /finding\.revision/, "record does not bump the revision either");
  assert.match(numeric, /stale_attestation/, "recording into an approved revision is refused, by that category");
  assert.match(numeric, /revisions\/<N>\//, "the archive is revise --pin's, and the skill names where it lives");

  const doc = readFileSync(join(REPO, "docs", "skills", "revise-finding.md"), "utf8");
  assert.match(doc, /aftergrid record/, "the docs page must give the same route");
});

// ag-3ce: the middle of an analysis is recorded in place, so the skill a harness ships has to say how.
test("checked-analysis step 2 records each probe with its time, its kind, and the dead ends kept", () => {
  const skill = readFileSync(join(REPO, "skills", "checked-analysis", "SKILL.md"), "utf8");
  const two = step(skill, 2);

  assert.match(two, /`at`/, "step 2 must name the `at` field a probe carries");
  assert.match(two, /harness's clock/, "and say the time comes from the harness's clock");
  assert.match(two, /[Nn]ever a time (worked out|invented)/, "and that it is not reconstructed after the fact");
  for (const kind of ["exploratory", "dead_end", "reframe"]) {
    assert.match(two, new RegExp(`\`${kind}\``), `step 2 must name the probe kind \`${kind}\``);
  }
  assert.match(two, /dead end is recorded, not deleted/i, "step 2 must say a dead end is kept rather than removed");
  assert.match(two, /reframe[\s\S]{0,400}\/grill-question/, "a reframe must point at the Question change and the revisit");
  assert.doesNotMatch(two, /Probes are `kind: exploratory`/, "step 2 may no longer say every probe is exploratory");

  // The hand-over reads the same list as the account of the middle, and names what the writer may do with it.
  const eight = step(skill, 8);
  assert.match(eight, /`at` order/, "step 8 must hand the probes over in the order they happened");
  assert.match(eight, /dead end/i, "step 8 must tell the writer the dead ends are there");
  assert.match(eight, /Limitations/, "and where a dead end may legitimately appear in the Finding");
  assert.match(eight, /reframe/, "and name a reframe explicitly, since the Question answered is not the one the run started with");

  // The docs page and the OpenAI prompt carry the same instruction, not a different one.
  const doc = readFileSync(join(REPO, "docs", "skills", "checked-analysis.md"), "utf8");
  assert.match(doc, /dead_end/, "the docs page must name the kinds the skill writes");
  const openai = readFileSync(openaiFile(REPO, "checked-analysis"), "utf8");
  for (const token of ["at", "dead_end", "reframe"]) {
    assert.ok(openai.includes(token), `the openai.yaml prompt must carry ${token}`);
  }

  // And the schema the prose describes really requires both fields, so the two cannot drift apart.
  const schema: any = JSON.parse(readFileSync(join(REPO, "src", "analysis", "analysis.schema.json"), "utf8"));
  const probe = schema.properties.probes.items;
  assert.ok(probe.required.includes("at") && probe.required.includes("kind"), JSON.stringify(probe.required));
  assert.deepEqual(probe.properties.kind.enum, ["exploratory", "dead_end", "reframe"]);
});

test("the DuckDB-binding warning is never relayed as `nothing to fix`, because rerun and execute open extracts through it", () => {
  const skill = readFileSync(skillFile(REPO), "utf8");
  const binding = skill.split("\n").filter((l) => /DuckDB binding/.test(l) || /runtime_unavailable/.test(l)).join("\n");
  const section = skill.slice(skill.indexOf("runtime_unavailable` warning about the DuckDB binding"));
  assert.notEqual(binding, "", "the skill must still tell the Operator what that warning means");

  // The claim being guarded: on the recorded path the Engine opens no source — but `execute` and
  // `check --mode rerun` open RETAINED extracts through this binding whatever `connection:` says, so an
  // unqualified "nothing to fix" would be wrong for any Finding that already holds some.
  const bullet = section.slice(0, section.indexOf("\n- ") === -1 ? 600 : section.indexOf("\n- "));
  assert.match(bullet, /retained inputs/, `the qualification is missing: ${bullet}`);
  assert.match(bullet, /check --mode rerun/);
  assert.match(bullet, /configure the duckdb adapter/);
  assert.doesNotMatch(bullet, /nothing to fix\.\s/, "an unqualified `nothing to fix.` is the wording this rule exists to prevent");

  // The contract page says the same thing, in the words the report itself prints.
  const doc = readFileSync(join(REPO, "docs", "contracts", "setup.md"), "utf8");
  assert.match(doc, /not needed to produce a Finding on the recorded path/);
  assert.match(doc, /needed to configure the duckdb adapter, and to run `execute` or `check --mode rerun` on any Finding that already holds retained inputs/);
});

test("`record` is documented as refusing any attestation, not only an approval", () => {
  // src/commands/record.ts counts `manifest.attestations` and reads no type off them.
  const impl = readFileSync(join(REPO, "src", "commands", "record.ts"), "utf8");
  const refusal = impl.slice(impl.indexOf('err("stale_attestation"'), impl.indexOf('err("stale_attestation"') + 500);
  assert.match(refusal, /attestation\(s\)/, "the refusal counts attestations");
  assert.doesNotMatch(refusal, /approval/i, "and reads no approval off them");

  for (const page of [join(REPO, "skills", "revise-finding", "SKILL.md"), join(REPO, "docs", "skills", "revise-finding.md")]) {
    const text = readFileSync(page, "utf8");
    const line = text.split(/\n\n/).find((p) => /stale_attestation/.test(p));
    assert.ok(line, `${page} must say what record refuses`);
    assert.match(line!, /any attestation/i, `${page} narrows the refusal to an approval: ${line}`);
  }
});

// ag-demo-open-data-qsl.1: examples/ is material for a checkout, not for an install. The `files` allowlist is
// what keeps it out, and an allowlist excludes by omission — so the rule has to be asserted, not assumed.
test("the packed tarball carries no examples/ path, and there is an example to leave out", () => {
  assert.ok(existsSync(join(REPO, "examples", "README.md")), "examples/README.md must exist, or this test asserts nothing");

  const packed = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: REPO, encoding: "utf8", timeout: 120_000 });
  assert.equal(packed.status, 0, `npm pack --dry-run failed: ${packed.stderr}`);
  const files: string[] = JSON.parse(packed.stdout)[0].files.map((f: { path: string }) => f.path);
  assert.deepEqual(files.filter((f) => f.startsWith("examples/")), [], "examples/ must not be in the package");

  // And the tarball audit rejects it too, so a later `files` entry cannot quietly let it back in.
  const audit = readFileSync(join(REPO, "scripts", "pack-smoke.mjs"), "utf8");
  const forbidden = audit.slice(audit.indexOf("const FORBIDDEN_PREFIXES"), audit.indexOf("const REQUIRED_ENTRIES"));
  assert.match(forbidden, /"examples\/"/, "scripts/pack-smoke.mjs must reject an examples/ entry in the tarball");
});
