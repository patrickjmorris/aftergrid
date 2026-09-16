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
  assert.equal(report.skills[0]!.invocation, "unstated", "an unstated policy is reported as unstated, never guessed");
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
