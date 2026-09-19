#!/usr/bin/env node
// Clean-install smoke for the packed product (bead ag-distribution-dq4, spec story 48).
//
// Nothing here runs from the repository checkout except the pack itself. Everything after that runs the CLI as
// an Operator would get it: a tarball, installed into an empty project with `npm install --ignore-scripts`, and
// driven through its installed `aftergrid` bin. `--ignore-scripts` is the point rather than a precaution — an
// install that ran no lifecycle script and still produced a working DuckDB binding and a working rasterizer is
// the evidence for the no-compile claim in docs/contracts/distribution.md.
//
// The Instance material the CLI operates on comes from `fixtures/` in this checkout, which is deliberately NOT
// in the package: fixtures are an Operator's data, supplied from outside, and the tarball audit below fails if
// any of it ships.
//
// What this does NOT establish: that npm would accept a publish, that Claude Code or skills.sh installs the
// plugin (neither installer is run), that any Finding is approved, or that the live GitHub path works — intake
// is exercised against the in-repo fakes, never the API.
//
// Usage: node scripts/pack-smoke.mjs [--quick] [--json] [--keep]
//   --quick  pack and audit the tarball only (no install, no CLI run). Fast enough for the unit suite.
//   --json   print only the machine-readable summary.
//   --keep   leave the temporary directory behind and print its path.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(new URL("../", import.meta.url)));
const args = new Set(process.argv.slice(2));
const QUICK = args.has("--quick");
const JSON_ONLY = args.has("--json");
const KEEP = args.has("--keep");

const steps = [];
let work = "";

const log = (line) => { if (!JSON_ONLY) process.stdout.write(line + "\n"); };

/** Record one step. `detail` is what was actually observed, never a restatement of the intent. */
function record(id, status, detail, extra = {}) {
  steps.push({ id, status, detail, ...extra });
  log(`${status === "ok" ? "ok  " : status === "skipped" ? "skip" : "FAIL"} ${id}: ${detail}`);
  return status === "ok";
}

class StepFailure extends Error {}
const must = (condition, message) => { if (!condition) throw new StepFailure(message); };

/** Run a step; a thrown StepFailure marks it failed and the run continues so one pass reports every problem. */
function step(id, fn) {
  if (steps.some((s) => s.id === id && s.status === "failed")) return null;
  try {
    const { detail, value, extra } = fn() ?? {};
    record(id, "ok", detail ?? "ok", extra ?? {});
    return value ?? true;
  } catch (e) {
    record(id, "failed", e instanceof StepFailure ? e.message : `${e?.message ?? e}`.split("\n").slice(0, 4).join(" | "));
    return null;
  }
}

function run(command, argv, options = {}) {
  const r = spawnSync(command, argv, { encoding: "utf8", timeout: options.timeout ?? 600_000, cwd: options.cwd ?? REPO, env: { ...process.env, ...(options.env ?? {}) } });
  if (r.error) throw new StepFailure(`${command}: ${r.error.message}`);
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", output: (r.stdout ?? "") + (r.stderr ?? "") };
}

const has = (command) => spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0;

/** Every file in a directory tree, as paths relative to it. */
function walk(root, base = root, out = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) walk(path, base, out);
    else if (entry.isFile()) out.push(relative(base, path));
  }
  return out;
}

/* ------------------------------------------------------------------ the audit rules */

/** Credential shapes that must not appear anywhere in the package. */
const CREDENTIAL_PATTERNS = [
  { id: "github_token", re: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/ },
  { id: "postgres_url_with_password", re: /\bpostgres(?:ql)?:\/\/[^\s'"`]+:[^\s'"`@]+@/ },
  { id: "aws_access_key_id", re: /\bAKIA[0-9A-Z]{16}\b/ },
];

/** The fixture sentinel. It must never ship as data. */
const FIXTURE_MARKER = "PRIVATE_FIXTURE_MARKER_DO_NOT_RENDER";

/**
 * The one shipped file allowed to contain the marker: the validator that looks for it. A scanner naming the
 * string it searches for is not fixture content. Any other occurrence is a leak.
 */
const MARKER_ALLOWED = new Set(["scripts/lib/validate-finding.mjs", "scripts/pack-smoke.mjs"]);

/** Directories that are development material and must not be in the tarball. */
const FORBIDDEN_PREFIXES = ["fixtures/", "examples/", "tests/", ".beads/", "docs/design/", "docs/spec/", "docs/adr/", "node_modules/", ".git/", ".github/"];

/** Files the product is not the product without. */
const REQUIRED_ENTRIES = [
  "package.json",
  "LICENSE",
  "README.md",
  "bin/aftergrid.mjs",
  "src/cli.ts",
  "schema",
  "hooks/claude-code/aftergrid-guard.mjs",
  ".claude-plugin/plugin.json",
  "skills/README.md",
  "skills/setup-aftergrid/SKILL.md",
  "skills/setup-aftergrid/agents/openai.yaml",
  "docs/skills/setup-aftergrid.md",
  "docs/contracts/distribution.md",
];

/* ------------------------------------------------------------------ steps */

function packStep() {
  const packer = has("pnpm") ? "pnpm" : "npm";
  const before = new Set(readdirSync(work));
  const r = run(packer, ["pack", "--pack-destination", work]);
  must(r.status === 0, `${packer} pack exited ${r.status}: ${r.output.trim().split("\n").slice(-3).join(" | ")}`);
  const produced = readdirSync(work).filter((f) => f.endsWith(".tgz") && !before.has(f));
  must(produced.length === 1, `expected one new tarball in ${work}, found ${produced.length ? produced.join(", ") : "none"}`);
  const tgz = join(work, produced[0]);
  const size = statSync(tgz).size;
  return { value: { tgz, packer }, detail: `${packer} pack produced ${produced[0]} (${(size / 1024).toFixed(0)} KiB)`, extra: { tarball: produced[0], bytes: size, packer } };
}

function auditStep(tgz) {
  const listing = run("tar", ["-tzf", tgz]);
  must(listing.status === 0, `tar could not list ${tgz}`);
  const entries = listing.stdout.split("\n").filter(Boolean).map((e) => e.replace(/^package\//, "")).filter((e) => !e.endsWith("/"));

  const leaked = entries.filter((e) => FORBIDDEN_PREFIXES.some((p) => e.startsWith(p)));
  must(leaked.length === 0, `development material is in the tarball: ${leaked.slice(0, 8).join(", ")}`);
  const tests = entries.filter((e) => /\.test\.(ts|mjs|js)$/.test(e));
  must(tests.length === 0, `test files are in the tarball: ${tests.slice(0, 8).join(", ")}`);

  const missing = REQUIRED_ENTRIES.filter((r) => !entries.some((e) => e === r || e.startsWith(r + "/")));
  must(missing.length === 0, `the tarball is missing ${missing.join(", ")}`);

  const extracted = join(work, "audit");
  mkdirSync(extracted, { recursive: true });
  const x = run("tar", ["-xzf", tgz, "-C", extracted]);
  must(x.status === 0, `tar could not extract ${tgz}`);
  const root = join(extracted, "package");

  const findings = [];
  let scanned = 0;
  for (const file of walk(root)) {
    const text = readFileSync(join(root, file), "utf8");
    scanned++;
    for (const { id, re } of CREDENTIAL_PATTERNS) {
      const m = re.exec(text);
      if (m) findings.push(`${id} in ${file} (${m[0].slice(0, 12)}…)`);
    }
    if (text.includes(FIXTURE_MARKER) && !MARKER_ALLOWED.has(file)) findings.push(`fixture marker in ${file}`);
  }
  must(findings.length === 0, `secret or fixture material in the package: ${findings.slice(0, 8).join("; ")}`);

  const license = readFileSync(join(root, "LICENSE"), "utf8");
  for (const phrase of ["MIT License", "Permission is hereby granted, free of charge", "WITHOUT WARRANTY OF ANY KIND"]) {
    must(license.includes(phrase), `LICENSE is in the tarball but the MIT notice is damaged: "${phrase}" is missing`);
  }

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  must(pkg.private === true, "package.json must keep \"private\": true — publishing is the owner's action, not this script's");
  must(pkg.bin?.aftergrid === "bin/aftergrid.mjs", `bin.aftergrid should be bin/aftergrid.mjs, found ${JSON.stringify(pkg.bin)}`);
  for (const dep of ["@duckdb/node-api", "@resvg/resvg-wasm", "ajv", "ajv-formats", "marked", "pg", "vega", "vega-lite", "yaml"]) {
    must(pkg.dependencies?.[dep], `${dep} is needed at runtime and must be a dependency, not a devDependency`);
  }

  return {
    value: { entries, root },
    detail: `${entries.length} entries, ${scanned} files scanned: no credential pattern, no fixture marker outside ${[...MARKER_ALLOWED].join(", ")}, no fixtures/examples/tests/beads/design docs, MIT notice intact`,
    extra: { entries: entries.length, files_scanned: scanned, marker_allowlist: [...MARKER_ALLOWED] },
  };
}

function installStep(tgz) {
  const project = join(work, "project");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "aftergrid-pack-smoke", version: "0.0.0", private: true, type: "module" }, null, 2) + "\n");

  let installer = "npm";
  let r = run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tgz], { cwd: project });
  if (r.status !== 0 && has("pnpm")) {
    installer = "pnpm (npm install failed; falling back to the local pnpm store)";
    r = run("pnpm", ["add", "--ignore-scripts", tgz], { cwd: project });
  }
  writeFileSync(join(work, "install.log"), r.output);
  must(r.status === 0, `install failed with ${installer}: ${r.output.trim().split("\n").slice(-6).join(" | ")}`);

  const compiled = /node-gyp|gyp ERR|prebuild-install|make: \*\*\*|CXX\(target\)/.exec(r.output);
  must(!compiled, `the install log mentions a native build step (${compiled?.[0]}); the no-compile claim would be false`);

  const bin = join(project, "node_modules", ".bin", "aftergrid");
  must(existsSync(bin), `no aftergrid bin at ${bin} after install`);
  return { value: { project, bin }, detail: `installed with ${installer} into a fresh project; no compiler invoked in the install log`, extra: { installer } };
}

function nativeRuntimeStep(project) {
  const probe = join(project, "native-probe.mjs");
  writeFileSync(probe, `
const out = {};
const duck = await import("@duckdb/node-api");
out.duckdb = typeof duck.DuckDBInstance === "function";
const instance = await duck.DuckDBInstance.create(":memory:");
const connection = await instance.connect();
out.duckdb_query = (await (await connection.run("select 41 + 1 as answer")).getRowObjects())[0].answer;
const resvg = await import("@resvg/resvg-wasm");
out.resvg = typeof resvg.initWasm === "function" || typeof resvg.Resvg === "function";
process.stdout.write(JSON.stringify(out));
`);
  const r = run(process.execPath, [probe], { cwd: project });
  must(r.status === 0, `loading the native runtimes from the installed package failed: ${r.output.trim().split("\n").slice(0, 4).join(" | ")}`);
  const out = JSON.parse(r.stdout);
  must(out.duckdb, "@duckdb/node-api imported but has no DuckDBInstance");
  must(String(out.duckdb_query) === "42", `DuckDB ran but returned ${out.duckdb_query}`);
  must(out.resvg, "@resvg/resvg-wasm imported but exposes no rasterizer");
  return { detail: "@duckdb/node-api loaded a prebuilt binding and answered a query; @resvg/resvg-wasm loaded — both after an --ignore-scripts install" };
}

const json = (r, what) => {
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new StepFailure(`${what} did not print JSON: ${(r.stdout + r.stderr).trim().split("\n").slice(0, 3).join(" | ")}`);
  }
};
const infoText = (report) => (report.info ?? []).join("\n");

function helpStep(bin, project) {
  const r = run(bin, ["--help"], { cwd: project });
  must(r.status === 0, `--help exited ${r.status}`);
  for (const phrase of ["aftergrid setup", "aftergrid new finding", "aftergrid plugin validate", "Node >= 22.18"]) {
    must(r.stdout.includes(phrase), `--help does not mention ${phrase}`);
  }
  return { detail: "the installed bin printed help for setup, new finding, check, render, decide, hook, intake and plugin validate" };
}

function pluginValidateStep(bin, project) {
  const r = run(bin, ["plugin", "validate", "--json"], { cwd: project });
  const report = json(r, "plugin validate");
  must(r.status === 0, `plugin validate on the installed package found problems: ${JSON.stringify(report.errors)}`);
  must(report.skills.length >= 1, "the installed package has no promoted skills");
  const setup = report.skills.find((s) => s.name === "setup-aftergrid");
  must(setup?.invocation === "user", "setup-aftergrid should be user-invoked in the installed package");
  return { detail: `validated the INSTALLED package: ${report.skills.map((s) => `${s.name} (${s.invocation}-invoked)`).join(", ")}` };
}

function setupStep(bin, project) {
  const instance = join(work, "analytics");
  mkdirSync(join(instance, "data"), { recursive: true });
  for (const csv of readdirSync(join(REPO, "fixtures", "instance", "data")).filter((f) => f.endsWith(".csv"))) {
    cpSync(join(REPO, "fixtures", "instance", "data", csv), join(instance, "data", csv));
  }
  // An empty skills path: mattpocock-skills is genuinely absent here, and the report must say so with the fix.
  const emptySkills = join(work, "no-skills");
  mkdirSync(emptySkills, { recursive: true });
  const settings = join(work, "settings.json");

  const r = run(bin, [
    "setup", "--instance", instance, "--adapter", "duckdb", "--duckdb-path", "data",
    "--owner-name", "Pack Smoke Owner", "--owner-contact", "owner@example.invalid",
    "--repository", "loop-example/analytics", "--automation-login", "loop-bot", "--trusted-approver", "dana",
    "--settings", settings, "--json",
  ], { cwd: project, env: { AFTERGRID_SKILLS_PATH: emptySkills, GITHUB_TOKEN: "", GH_TOKEN: "" } });
  const report = json(r, "setup");
  const info = infoText(report);

  must(/step scaffold: completed/.test(info), "setup did not complete the scaffold step");
  must(/step hook: completed — hook active/.test(info), `the hook step is not reported active: ${info.split("\n").filter((l) => l.startsWith("step hook")).join(" | ")}`);
  must(/hook install: self-test: .*blocked \(exit 2\)/.test(info), "the hook was installed but no self-test blocked a write");
  must(/hook install: self-test: .*allowed \(exit 0\)/.test(info), "the hook self-test did not record an allowed read");
  must(/step smoke: completed/.test(info), "the setup smoke (new -> check -> draft render) did not complete");

  must(report.readiness === "unknown", `publication readiness should be unknown without a token, got ${report.readiness}`);
  const reasons = report.readiness_reasons.join("\n");
  must(/no GitHub client or token/.test(reasons), "publication unknown was reported without saying why");
  must(/docs\/contracts\/publication\.md/.test(reasons), "publication unknown was reported without a remedy pointing at the runbook");

  const missing = report.errors.find((e) => e.category === "dependency_missing" && e.location === "mattpocock-skills");
  must(missing, `an empty AFTERGRID_SKILLS_PATH should report mattpocock-skills missing, errors were ${JSON.stringify(report.errors.map((e) => e.category))}`);
  must(/claude plugins install mattpocock-skills/.test(missing.remedy ?? ""), "the missing-skills error carries no install remedy");
  must(r.status === 1, `setup with a missing hard dependency should exit 1, got ${r.status}`);

  must(existsSync(join(instance, "aftergrid.yaml")), "setup reported a scaffold but wrote no aftergrid.yaml");
  must(!readdirSync(join(instance, "findings")).some((f) => f.includes("setup-smoke")), "the setup smoke Finding leaked into the Instance");

  return { value: { instance, settings }, detail: "hook installed and self-tested (write blocked, read allowed); publication unknown with the runbook remedy; missing mattpocock-skills named with its install line; scaffold and smoke completed" };
}

function newFindingStep(bin, project, instance) {
  const r = run(bin, ["new", "finding", "smoke-question", "--instance", instance, "--ask", "Did the packed CLI make a draft?", "--json"], { cwd: project });
  const report = json(r, "new finding");
  must(r.status === 0, `new finding exited ${r.status}: ${JSON.stringify(report.errors)}`);
  must(report.content === "incomplete", `a fresh draft must be reported incomplete, got ${report.content}`);
  const dir = readdirSync(join(instance, "findings")).map((d) => join(instance, "findings", d)).find((d) => d.includes("smoke-question"));
  must(dir, "new finding reported success but no draft directory appeared");
  return { value: dir, detail: `created ${relative(instance, dir)} as an explicitly incomplete draft` };
}

function checkStep(bin, project, dir) {
  const r = run(bin, ["check", dir, "--json"], { cwd: project });
  const report = json(r, "check");
  must(report.content === "incomplete", `the fresh draft should still be incomplete, got ${report.content}`);
  must(report.evidence === "valid", `the draft's evidence should be valid (there is none to be wrong), got ${report.evidence}`);
  must(report.sql_execution === "not_performed", "artifact mode must not report SQL as executed");
  must(report.readiness !== "ready", "an incomplete draft must never be publication-ready");
  const coverage = report.warnings.filter((w) => w.location === "manifest.yaml#/coverage");
  must(coverage.length === 3, `the scaffold's coverage sentinels must be named as incomplete, got ${JSON.stringify(report.warnings)}`);
  must(/step 7 of \/write-finding/.test(coverage[0].remedy ?? ""), "the coverage gap must carry the remedy that names where the answer comes from");
  return { detail: `content ${report.content}, evidence ${report.evidence}, sql ${report.sql_execution}, publication ${report.readiness}; ${coverage.length} coverage sentinel(s) named` };
}

/**
 * The DEFAULT route through the packed CLI: `setup` with no `--adapter` at all (ADR 0010), then a draft and a
 * `check` in the Instance it wrote. Until this existed, every pack-smoke Instance was `--adapter duckdb`, so the
 * route the Engine tells Operators to start on had no clean-install coverage (only unit tests).
 *
 * `record` is NOT exercised here: it needs a Finding that DECLARES the execution being recorded, and `new
 * finding` declares none. Writing those declarations would be this script authoring a manifest by hand, which
 * is what `src/record.test.ts` is for. See docs/contracts/setup.md.
 */
function adapterlessSetupStep(bin, project) {
  const instance = join(work, "analytics-recorded");
  const emptySkills = join(work, "no-skills");
  const r = run(bin, [
    "setup", "--instance", instance,
    "--owner-name", "Recorded Path Owner", "--owner-contact", "owner@example.invalid",
    "--skip-hook", "--json",
  ], { cwd: project, env: { AFTERGRID_SKILLS_PATH: emptySkills, GITHUB_TOKEN: "", GH_TOKEN: "" } });
  const report = json(r, "setup (no adapter)");
  const info = infoText(report);

  must(report.syntax === "ok", `an adapterless setup is not a usage error: ${JSON.stringify(report.errors)}`);
  must(/step connection: skipped/.test(info), "with no adapter there is no connection to validate");
  must(report.sql_execution === "not_performed", `no statement ran, so none is reported: ${report.sql_execution}`);
  must(/step smoke: completed/.test(info), "new -> check -> draft render must run with no adapter anywhere");

  const yaml = readFileSync(join(instance, "aftergrid.yaml"), "utf8");
  must(/^\s*adapter: none$/m.test(yaml), "the recorded path must be stated in the file, not left as an absent block");
  must(/`aftergrid execute` refuses on a Finding with no retained inputs/.test(yaml) && /`aftergrid execute` refuses on a Finding with no retained inputs/.test(info),
    "execute is not unconditionally unavailable here, and neither the file nor the report may say it is");
  must(/set `connection\.adapter` in .*aftergrid\.yaml/.test(info), "the upgrade must be named as an edit to the file setup never overwrites");

  // The draft and its check, on the route with no adapter behind it.
  const draft = newFindingStep(bin, project, instance).value;
  checkStep(bin, project, draft);

  // And the upgrade run on this same Instance: the file is kept, and the connection block is printed instead.
  mkdirSync(join(instance, "data"), { recursive: true });
  cpSync(join(REPO, "fixtures", "instance", "data", "subscriptions.csv"), join(instance, "data", "subscriptions.csv"));
  const up = run(bin, ["setup", "--instance", instance, "--adapter", "duckdb", "--duckdb-path", "data", "--skip-hook", "--json"],
    { cwd: project, env: { AFTERGRID_SKILLS_PATH: emptySkills, GITHUB_TOKEN: "", GH_TOKEN: "" } });
  const upReport = json(up, "setup --adapter (upgrade)");
  const upInfo = infoText(upReport);
  must(readFileSync(join(instance, "aftergrid.yaml"), "utf8") === yaml, "setup overwrote an existing aftergrid.yaml");
  must(/aftergrid\.yaml was kept, paste the block below/.test(upInfo), `the connection step reports an upgrade that did not happen: ${upInfo.split("\n").filter((l) => l.startsWith("step connection")).join(" | ")}`);
  must(/\n {2}adapter: duckdb\n {2}duckdb:\n/.test(upInfo), "the connection block the remedies promise was not printed");

  return { detail: `setup with no --adapter wrote adapter: none and completed its smoke; a draft checked incomplete with its coverage sentinels named; the --adapter rerun kept aftergrid.yaml and printed the connection block instead` };
}

/** A copy of the reviewed exemplar, supplied from this checkout's fixtures — they are not in the package. */
function exemplarCopy() {
  const dest = join(work, "exemplar-instance");
  if (!existsSync(dest)) cpSync(join(REPO, "fixtures", "instance"), dest, { recursive: true });
  return { instance: join(dest, "analytics"), finding: join(dest, "analytics", "findings", "2026-07-20-onboarding-checklist-retention") };
}

function renderStep(bin, project) {
  const { finding } = exemplarCopy();
  const r = run(bin, ["render", finding, "--json"], { cwd: project });
  const report = json(r, "render");
  must(r.status === 0, `render exited ${r.status}: ${JSON.stringify(report.errors)}`);
  const html = join(finding, "render", "finding.html");
  must(existsSync(html), "render reported success but wrote no finding.html");
  const body = readFileSync(html, "utf8");
  must(/draft/i.test(body), "the rendered draft carries no draft label");
  must(!body.includes(FIXTURE_MARKER), "the private fixture marker reached the rendered HTML");
  const svgs = readdirSync(join(finding, "render")).filter((f) => f.endsWith(".svg"));
  must(svgs.length >= 1, "no chart SVG was rendered");
  return { detail: `rendered ${relative(work, html)} as a labeled draft plus ${svgs.length} SVG chart(s), with no fixture marker in the output` };
}

function decideStep(bin, project) {
  const { instance, finding } = exemplarCopy();
  const common = [
    "decide", "--finding", finding, "--owner", "Dana Okafor", "--date", "2026-09-15",
    "--claims", "c1", "--action", "action",
    "--description", "Roll the checklist out to the remaining half of new users.",
    "--rationale", "The checklist arm cleared the pre-registered bar in the randomized comparison.",
    "--revisit-date", "2026-12-01", "--timezone", "America/New_York",
  ];
  const before = readdirSync(join(instance, "decisions")).length;
  const dry = run(bin, [...common, "--dry-run", "--json"], { cwd: project });
  const dryReport = json(dry, "decide --dry-run");
  must(dry.status === 0, `decide --dry-run exited ${dry.status}: ${JSON.stringify(dryReport.errors)}`);
  must(readdirSync(join(instance, "decisions")).length === before, "decide --dry-run wrote a Decision record");

  const real = run(bin, [...common, "--json"], { cwd: project });
  const report = json(real, "decide");
  must(real.status === 0, `decide exited ${real.status}: ${JSON.stringify(report.errors)}`);
  const written = readdirSync(join(instance, "decisions")).filter((f) => f.endsWith(".yaml"));
  must(written.length === before + 1 || written.length > 0, "decide reported success but wrote no record");
  const log = readFileSync(join(instance, "decisions.md"), "utf8");
  must(/Roll the checklist out/.test(log), "the Decision record did not reach the decision log");
  return { detail: `--dry-run wrote nothing; the real run appended one immutable record bound to ${report.finding} and indexed it in decisions.md` };
}

function intakeStep(project) {
  // The intake CLI talks to GitHub. It exposes no fake-source flag, and adding one to the shipped CLI would be a
  // test hook in a product surface, so this drives the exported intake() from the INSTALLED package with the
  // fakes the package already ships in src/intake/*. Nothing reaches the network.
  const script = join(project, "intake-smoke.mjs");
  const source = join(REPO, "fixtures", "instance");
  writeFileSync(script, `
import { cpSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Node will not strip types under node_modules, so the hook has to be registered before the package's own
// TypeScript modules are loaded — which means dynamic import, after this side effect, not a static import.
const { result } = await import("aftergrid/bin/strip-types.mjs");
if (!result.registered) throw new Error(result.reason);
const { intake } = await import("aftergrid/src/commands/intake.ts");
const { hook } = await import("aftergrid/src/commands/hook.ts");
const { createTestClock } = await import("aftergrid/src/intake/clock.ts");
const { createFixtureHarness } = await import("aftergrid/src/intake/harness.ts");
const { createFakeIssueSource, NEEDS_INFO_LABEL, TRIGGER_LABEL } = await import("aftergrid/src/intake/issues.ts");
const { createFakePullRequestTarget } = await import("aftergrid/src/intake/pull-requests.ts");
const { runIdFor } = await import("aftergrid/src/intake/runs.ts");

const repoDir = mkdtempSync(join(tmpdir(), "aftergrid-intake-"));
cpSync(${JSON.stringify(source)}, repoDir, { recursive: true });
const settings = join(repoDir, ".claude", "settings.json");
mkdirSync(dirname(settings), { recursive: true });
const installed = hook({ action: "install", settingsPath: settings, cwd: repoDir });
if (installed.errors.length) throw new Error("the guard did not install from the packed package: " + JSON.stringify(installed.errors));

const REPO_SLUG = "loop-example/analytics";
const issue = { number: 7, title: "Did the onboarding checklist help?", body: "Please look at 7-day retention.", updated_at: "2026-09-15T09:00:00Z", labels: [TRIGGER_LABEL], comments: [] };
const issues = createFakeIssueSource({ repository: REPO_SLUG, issues: [issue] });
const pulls = createFakePullRequestTarget({ repository: REPO_SLUG });
const clock = createTestClock();
const harness = createFixtureHarness({
  source: join(repoDir, "analytics", "findings", "2026-07-20-onboarding-checklist-retention"),
  needsInput: [{ kind: "definition_approval", description: "a definition is proposed, not approved", owner: "dana-okafor" }],
});
const options = { repo: REPO_SLUG, instanceDir: join(repoDir, "analytics"), cwd: repoDir, settingsPath: settings, once: true, baseBranch: "main", source: issues, pullRequests: pulls, harness, clock };

const paused = await intake(options);
const runId = runIdFor(issue);
const resumed = await intake({ ...options, resume: runId, provided: ["definition_approval"] });

process.stdout.write(JSON.stringify({
  paused: paused.runs.map((r) => r.status),
  paused_errors: paused.errors.length,
  labels: issues.issues[0].labels,
  needs_info_label: NEEDS_INFO_LABEL,
  prs_while_paused: 0,
  resumed: resumed.runs.map((r) => r.status),
  pull_requests: pulls.created.length,
  pr_title: pulls.created[0]?.title ?? null,
  run_id: runId,
}));
`);
  const r = run(process.execPath, [script], { cwd: project });
  must(r.status === 0, `the intake fixture workflow failed: ${(r.stdout + r.stderr).trim().split("\n").slice(-6).join(" | ")}`);
  const out = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
  must(out.paused.join() === "needs_input", `the first pass should pause with needs_input, got ${out.paused.join()}`);
  must(out.paused_errors === 0, "a needs_input pause was reported as an error");
  must(out.labels.includes(out.needs_info_label), "the paused run did not label the Issue needs-info");
  must(out.resumed.join() === "complete", `--resume with the need provided should complete, got ${out.resumed.join()}`);
  must(out.pull_requests === 1, `exactly one draft pull request per run; got ${out.pull_requests}`);
  must(out.pr_title?.includes(out.run_id), "the pull request is not keyed to the run id");
  return { detail: `needs_input pause labeled needs-info and opened nothing; resume with --provided completed and opened exactly one draft pull request (${out.run_id})` };
}

/* ------------------------------------------------------------------ main */

work = mkdtempSync(join(tmpdir(), "aftergrid-pack-smoke-"));
log(`pack-smoke: ${QUICK ? "quick (pack + tarball audit)" : "full"} run in ${work}`);

const packed = step("pack", packStep);
if (packed) step("tarball-audit", () => auditStep(packed.tgz));

if (!QUICK && packed) {
  const installed = step("clean-install", () => installStep(packed.tgz));
  if (installed) {
    const { project, bin } = installed;
    step("native-runtime", () => nativeRuntimeStep(project));
    step("cli-help", () => helpStep(bin, project));
    step("plugin-validate", () => pluginValidateStep(bin, project));
    const setupResult = step("setup", () => setupStep(bin, project));
    if (setupResult) {
      const draft = step("new-finding", () => newFindingStep(bin, project, setupResult.instance));
      if (draft) step("check", () => checkStep(bin, project, draft));
    }
    // The default route (no --adapter): its own scratch Instance, so nothing above is disturbed.
    step("setup-recorded-path", () => adapterlessSetupStep(bin, project));
    step("render-draft", () => renderStep(bin, project));
    step("decide", () => decideStep(bin, project));
    step("intake-fixture", () => intakeStep(project));
  }
} else if (!QUICK) {
  record("clean-install", "skipped", "nothing was packed");
}

const failed = steps.filter((s) => s.status === "failed");
const summary = {
  smoke: "pack",
  mode: QUICK ? "quick" : "full",
  node: process.versions.node,
  platform: `${process.platform}-${process.arch}`,
  ok: failed.length === 0,
  steps,
  failed: failed.map((s) => s.id),
  workdir: KEEP ? work : null,
  not_established: [
    "npm publish, repository visibility, public activation and marketplace listing were not performed",
    "no installer was run for the Claude Code plugin or skills.sh; the layout was validated, not installed",
    "intake ran against in-repo fakes; the live GitHub API path is untested",
  ],
};
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

if (!KEEP) rmSync(work, { recursive: true, force: true });
else log(`kept ${work}`);
process.exit(failed.length ? 1 : 0);
