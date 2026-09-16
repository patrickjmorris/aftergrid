// ag-setup-aftergrid-78k: `aftergrid setup` is exercised as a black box against throwaway Instances. What is
// asserted is what an Operator can see: which files exist afterwards, what the report says about each separate
// fact, what a rerun does to their edits, and what never appears in a generated file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { setup } from "./commands/setup.ts";
import { newFinding } from "./commands/new-finding.ts";
import { capture } from "./commands/capture.ts";
import { execute } from "./commands/execute.ts";
import { HOOK_COMMAND } from "./commands/hook.ts";
import { checkNodeVersion, findSkillsBundle } from "./setup/dependencies.ts";
import { publicationPreflight, type PreflightClient } from "./setup/preflight.ts";
import { findBinary, provisionDisposablePostgres, type DisposablePostgres } from "./adapters/postgres.ts";
import type { Report } from "./report.ts";

const scratch = (p: string) => mkdtempSync(join(tmpdir(), p));
const cleanup: string[] = [];
process.on("exit", () => { for (const d of cleanup) rmSync(d, { recursive: true, force: true }); });

/** A repository holding an Instance root with a tiny CSV warehouse, and a fake skills bundle beside it. */
function fixture(): { repo: string; instance: string; skills: string; settings: string } {
  const repo = scratch("ag-setup-");
  cleanup.push(repo);
  const instance = join(repo, "analytics");
  mkdirSync(join(instance, "data"), { recursive: true });
  writeFileSync(join(instance, "data", "users.csv"), "user_id,platform\n1,ios\n2,web\n");
  const skills = join(repo, "fake-skills");
  for (const s of ["grilling", "writing-for-agents"]) {
    mkdirSync(join(skills, s), { recursive: true });
    writeFileSync(join(skills, s, "SKILL.md"), `---\nname: ${s}\n---\n`);
  }
  return { repo, instance, skills, settings: join(repo, ".claude", "settings.json") };
}

const base = (f: ReturnType<typeof fixture>) => ({
  instanceDir: f.instance,
  adapter: "duckdb" as const,
  duckdbPath: "data",
  ownerName: "Dana Okafor",
  ownerContact: "dana@example.test",
  repository: "example/analytics",
  automationLogin: "example-bot",
  trustedApprovers: ["a-human"],
  settingsPath: f.settings,
  skillsSearchPaths: [f.skills],
  github: null as PreflightClient | null,
});

const info = (r: Report) => r.info.join("\n");
const step = (r: Report, name: string) => r.info.find((l) => l.startsWith(`step ${name}:`)) ?? `(no step line for ${name})`;
const listFiles = (root: string): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p); else out.push(relative(root, p));
    }
  };
  walk(root);
  return out.sort();
};

test("a fresh Instance is scaffolded and carries a Finding from new through check to a draft render", async () => {
  const f = fixture();
  const r = await setup({ ...base(f), skipHook: true });

  assert.equal(r.command, "setup");
  assert.equal(r.syntax, "ok");
  for (const rel of ["aftergrid.yaml", "readers.md", "definitions/README.md", "definitions/example_definition.md", "findings/.gitkeep", "decisions/.gitkeep", "decisions.md", "golden/README.md", "provisional/README.md", ".gitignore"]) {
    assert.ok(existsSync(join(f.instance, rel)), `${rel} was scaffolded`);
    assert.match(info(r), new RegExp(`scaffold: created ${rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `${rel} reported as created`);
  }
  const config: any = parseYaml(readFileSync(join(f.instance, "aftergrid.yaml"), "utf8"));
  assert.equal(config.connection.adapter, "duckdb");
  assert.equal(config.connection.duckdb.path, "data");
  assert.equal(config.publication.automation_login, "example-bot");
  assert.deepEqual(config.publication.trusted_approvers, ["a-human"]);
  assert.equal(config.owner.contact, "dana@example.test");

  // The readers file advertises the generic profile and keeps its example out of the profile index.
  const readers = readFileSync(join(f.instance, "readers.md"), "utf8");
  assert.match(readers, /generic/);
  assert.equal(/^## /m.test(readers), false, "the example profile is indented so it is not read as a real profile");
  assert.match(readFileSync(join(f.instance, "definitions/example_definition.md"), "utf8"), /lifecycle: proposed/);
  assert.match(readFileSync(join(f.instance, ".gitignore"), "utf8"), /\.aftergrid-setup\.json/);

  // The smoke ran the whole chain — in a copy. The Operator's Instance still holds only the scaffold.
  for (const cmd of ["new", "check", "render"]) assert.match(info(r), new RegExp(`smoke ${cmd}: ok`), `smoke ${cmd} passed`);
  assert.match(step(r, "smoke"), /completed/);
  assert.deepEqual(readdirSync(join(f.instance, "findings")), [".gitkeep"], "no setup-smoke Finding is left in the real Instance");
  assert.equal(r.sql_execution, "performed", "the DuckDB source really was opened");
  assert.match(step(r, "connection"), /completed/);
  assert.match(step(r, "dependencies"), /completed/);
  assert.equal(r.errors.length, 0, `no errors: ${JSON.stringify(r.errors)}`);
});

test("a rerun keeps every edit: readers.md, a definition, an existing Finding, and one hook entry", async () => {
  const f = fixture();
  const first = await setup({ ...base(f) });
  assert.match(step(first, "hook"), /completed — hook active/, `hook should install and self-test: ${JSON.stringify(first.errors)}`);
  const settingsAfterFirst = JSON.parse(readFileSync(f.settings, "utf8"));
  assert.equal(settingsAfterFirst.hooks.PreToolUse.flatMap((g: any) => g.hooks).filter((h: any) => h.command === HOOK_COMMAND).length, 1);

  // The Operator edits their Instance the way they would in week one.
  const myReaders = "# Readers\n\n## exec_sponsor\n```yaml\nid: exec_sponsor\nlabel: The exec who funds this\n```\n";
  writeFileSync(join(f.instance, "readers.md"), myReaders);
  const myDefinition = "---\nid: weekly_active\nversion: 1\nkind: metric\nlifecycle: proposed\n---\nMine.\n";
  writeFileSync(join(f.instance, "definitions", "weekly_active.md"), myDefinition);
  const created = newFinding({ slug: "real-question", ask: "does it?", instanceDir: f.instance, date: "2026-09-15" });
  assert.equal(created.errors.length, 0);
  const findingDir = join(f.instance, "findings", "2026-09-15-real-question");
  const manifestBefore = readFileSync(join(findingDir, "manifest.yaml"), "utf8");

  // A rerun, with different options: a different owner and a second approver.
  const second = await setup({ ...base(f), ownerName: "Someone Else", trustedApprovers: ["a-human", "another-human"] });

  assert.equal(readFileSync(join(f.instance, "readers.md"), "utf8"), myReaders, "the edited readers file is untouched");
  assert.equal(readFileSync(join(f.instance, "definitions", "weekly_active.md"), "utf8"), myDefinition, "the Operator's definition is untouched");
  assert.equal(readFileSync(join(findingDir, "manifest.yaml"), "utf8"), manifestBefore, "the existing Finding is untouched");
  const configAfter: any = parseYaml(readFileSync(join(f.instance, "aftergrid.yaml"), "utf8"));
  assert.equal(configAfter.owner.name, "Dana Okafor", "the policy file written by the first run wins over the second run's options");
  assert.match(info(second), /kept aftergrid\.yaml \(differs from what setup would write/);
  assert.match(info(second), /kept readers\.md \(differs from what setup would write/);
  assert.ok(second.warnings.some((w) => w.category === "exists" && /readers\.md differs/.test(w.message)), "a kept-and-different file is a warning with a remedy");

  const settings = JSON.parse(readFileSync(f.settings, "utf8"));
  const ours = settings.hooks.PreToolUse.flatMap((g: any) => g.hooks).filter((h: any) => h.command === HOOK_COMMAND);
  assert.equal(ours.length, 1, "a second install adds no second hook entry");

  assert.match(info(second), /^resuming: a previous run/m, "a rerun says which steps it is resuming");
  assert.match(step(second, "smoke"), /resumed/, "the completed smoke is not run again");
  assert.deepEqual(readdirSync(join(f.instance, "findings")).sort(), [".gitkeep", "2026-09-15-real-question"], "the rerun added no Finding of its own");
});

test("a failed dependency is reported with its remedy, does not stop the rest of setup, and clears on a rerun", async () => {
  const f = fixture();
  const empty = join(f.repo, "no-skills-here");
  mkdirSync(empty, { recursive: true });

  const missing = await setup({ ...base(f), skipHook: true, skillsSearchPaths: [empty] });
  const problem = missing.errors.find((e) => e.category === "dependency_missing" && e.location === "mattpocock-skills");
  assert.ok(problem, `mattpocock-skills reported missing: ${JSON.stringify(missing.errors)}`);
  assert.match(problem!.message, /grilling and writing-for-agents not found/);
  assert.match(problem!.remedy!, /claude plugins install mattpocock-skills/);
  assert.match(problem!.remedy!, /npx skills@latest add mattpocock\/skills/);
  assert.match(info(missing), /dependency mattpocock_skills: missing/);
  assert.equal(missing.content, "incomplete");
  // Everything else still ran.
  assert.match(step(missing, "scaffold"), /completed/);
  assert.match(step(missing, "connection"), /completed/);
  assert.match(step(missing, "smoke"), /completed/);

  const fixed = await setup({ ...base(f), skipHook: true });
  assert.equal(fixed.errors.some((e) => e.category === "dependency_missing"), false, "the corrected dependency is no longer an error");
  assert.match(step(fixed, "dependencies"), /completed/);
  assert.match(info(fixed), /^resuming: a previous run/m);
});

test("the DuckDB role probe is reported as unsupported by design, never as a missing safety policy", async () => {
  const f = fixture();
  const r = await setup({ ...base(f), skipHook: true });
  const line = r.info.find((l) => l.startsWith("connection: role probing:"));
  assert.ok(line, "the role probe has its own line");
  assert.match(line!, /unsupported by design/);
  assert.match(line!, /read-only local-file policy/);
  assert.match(line!, /never reported as a passed probe/);
  assert.match(info(r), /capability privilege_probe: unsupported/);
  // It is a fact about DuckDB, not a defect: nothing in the report treats it as one.
  for (const p of [...r.errors, ...r.warnings]) {
    assert.equal(/privilege_probe|role prob/i.test(p.message), false, `the unsupported probe must not be reported as a problem: ${JSON.stringify(p)}`);
  }
  assert.equal(r.errors.length, 0);
});

test("an author who is also an approver is refused as solo_setup_invalid, with no bypass", async () => {
  const f = fixture();
  const r = await setup({ ...base(f), skipHook: true, automationLogin: "dana", trustedApprovers: ["Dana"] });
  const problem = r.errors.find((e) => e.category === "solo_setup_invalid");
  assert.ok(problem, `solo_setup_invalid: ${JSON.stringify(r.errors)}`);
  assert.match(problem!.message, /GitHub does not let the author of a pull request approve it/);
  assert.match(problem!.message, /no bypass flag/);
  assert.match(problem!.remedy!, /separate automation account/);
  assert.equal(r.readiness, "not_ready");
  assert.match(step(r, "publication_preflight"), /incomplete/);
  // The policy file is still written, so the Operator can fix it in place.
  assert.ok(existsSync(join(f.instance, "aftergrid.yaml")));
});

test("publication preflight: distinct accounts verify, a shared account does not, no client stays unknown", async () => {
  const accounts: Record<string, { login: string; id: number; type: string }> = {
    "example-bot": { login: "example-bot", id: 1001, type: "Bot" },
    "a-human": { login: "a-human", id: 2002, type: "User" },
    "dana": { login: "dana", id: 2002, type: "User" },   // the same account behind a second login
  };
  const client: PreflightClient = {
    async getUser(login) {
      const a = accounts[login.toLowerCase()];
      if (!a) throw new Error(`no such user ${login}`);
      return a;
    },
    async getRepository(repo) { return { full_name: repo, id: 55, private: true }; },
  };

  const ok = await publicationPreflight({ repository: "example/analytics", automationLogin: "example-bot", trustedApprovers: ["a-human"], policyPath: "aftergrid.yaml", client });
  assert.equal(ok.status, "ok");
  assert.equal(ok.errors.length, 0);
  assert.match(ok.reasons.join("\n"), /distinct GitHub account/);
  assert.match(ok.info.join("\n"), /automation identity example-bot resolves to account 1001/);

  const shared = await publicationPreflight({ repository: "example/analytics", automationLogin: "example-bot", trustedApprovers: ["dana", "a-human"], policyPath: "aftergrid.yaml", client });
  assert.equal(shared.status, "invalid");
  assert.ok(shared.errors.some((e) => e.category === "solo_setup_invalid" && /same GitHub account/.test(e.message)), JSON.stringify(shared.errors));

  const blind = await publicationPreflight({ repository: "example/analytics", automationLogin: "example-bot", trustedApprovers: ["a-human"], policyPath: "aftergrid.yaml", client: null });
  assert.equal(blind.status, "unknown");
  assert.equal(blind.errors.length, 0);
  assert.match(blind.reasons.join("\n"), /no GitHub client or token/);
  assert.match(blind.reasons.join("\n"), /docs\/contracts\/publication\.md/);

  const unreadable = await publicationPreflight({
    repository: "example/analytics", automationLogin: "example-bot", trustedApprovers: ["a-human"], policyPath: "aftergrid.yaml",
    client: { async getUser() { throw new Error("boom"); }, async getRepository() { throw new Error("boom"); } },
  });
  assert.equal(unreadable.status, "unknown", "an unreadable API is unknown, never a rejection and never a pass");
});

test("setup with a fake GitHub client verifies the identities; without one it reports unknown", async () => {
  const f = fixture();
  const client: PreflightClient = {
    async getUser(login) { return { login, id: login === "example-bot" ? 1 : 2, type: login === "example-bot" ? "Bot" : "User" }; },
    async getRepository(repo) { return { full_name: repo, id: 9, private: true }; },
  };
  const verified = await setup({ ...base(f), skipHook: true, github: client });
  assert.match(step(verified, "publication_preflight"), /completed/);
  assert.match(info(verified), /repository example\/analytics exists \(private\)/);
  assert.match(verified.readiness_reasons.join("\n"), /says nothing about any Finding being approved/);
  assert.equal(verified.readiness, "unknown", "setup never claims a Finding is ready to publish");

  const g = fixture();
  const blind = await setup({ ...base(g), skipHook: true, github: null });
  assert.equal(blind.readiness, "unknown");
  assert.match(blind.readiness_reasons.join("\n"), /no GitHub client or token/);
  assert.match(step(blind, "publication_preflight"), /unknown/);
});

test("a Postgres connection string never reaches a generated file, and a missing variable is a missing_credential", async () => {
  const f = fixture();
  const SECRET = "postgresql://analyst:hunter2-do-not-leak@warehouse.invalid:5432/analytics";
  // The adapter reads process.env, so the test sets the real thing and puts it back afterwards.
  process.env.AG_TEST_SETUP_PG = SECRET;

  const r = await setup({
    ...base(f), skipHook: true, adapter: "postgres", duckdbPath: undefined, pgUrlEnv: "AG_TEST_SETUP_PG",
  });
  delete process.env.AG_TEST_SETUP_PG;
  const config = readFileSync(join(f.instance, "aftergrid.yaml"), "utf8");
  assert.match(config, /url_env: AG_TEST_SETUP_PG/);
  for (const rel of listFiles(f.instance)) {
    const bytes = readFileSync(join(f.instance, rel), "utf8");
    for (const secret of [SECRET, "hunter2-do-not-leak", "analyst:hunter2"]) {
      assert.equal(bytes.includes(secret), false, `${rel} must not contain the connection string`);
    }
  }
  const printed = JSON.stringify(r);
  for (const secret of [SECRET, "hunter2-do-not-leak"]) assert.equal(printed.includes(secret), false, "the report never prints the URL");

  const g = fixture();
  delete process.env.AG_TEST_SETUP_PG_ABSENT;
  const unset = await setup({ ...base(g), skipHook: true, adapter: "postgres", duckdbPath: undefined, pgUrlEnv: "AG_TEST_SETUP_PG_ABSENT" });
  const problem = unset.errors.find((e) => e.category === "missing_credential");
  assert.ok(problem, JSON.stringify(unset.errors));
  assert.match(problem!.message, /AG_TEST_SETUP_PG_ABSENT is not set/);
  assert.match(problem!.remedy!, /read-only analysis role/);
  assert.match(step(unset, "connection"), /incomplete/);
});

const PG_SKIP = findBinary("initdb") && findBinary("pg_ctl")
  ? false
  : "no local Postgres runtime (initdb/pg_ctl not on PATH or AFTERGRID_PG_BINDIR): the write-capable-role refusal is not exercised here and this is not evidence that it works";

test("a write-capable Postgres role is refused with the read-only remedy", { skip: PG_SKIP }, async () => {
  const f = fixture();
  let pg: DisposablePostgres | undefined;
  try {
    pg = await provisionDisposablePostgres();
    const m: any = await import("pg");
    const { Client } = m.default ?? m;
    const admin = new Client({ connectionString: pg.url("postgres") });
    await admin.connect();
    await admin.query("create database warehouse");
    await admin.end();
    const wh = new Client({ connectionString: pg.url("warehouse") });
    await wh.connect();
    await wh.query("create table users (id int)");
    await wh.end();

    // The superuser that owns the instance: it can write and it can run DDL.
    process.env.AG_TEST_SETUP_PG_WRITER = pg.url("warehouse");
    const r = await setup({ ...base(f), skipHook: true, adapter: "postgres", duckdbPath: undefined, pgUrlEnv: "AG_TEST_SETUP_PG_WRITER" });
    const problem = r.errors.find((e) => e.category === "write_capable_role");
    assert.ok(problem, `a write-capable role must be refused: ${JSON.stringify(r.errors)}`);
    assert.match(problem!.message, /can (write|run DDL)/);
    assert.match(problem!.remedy!, /GRANT SELECT ON ALL TABLES/);
    assert.match(problem!.remedy!, /no flag that accepts a write-capable role/);
    assert.match(step(r, "connection"), /incomplete/);
    assert.equal(r.content, "incomplete");
    assert.equal(JSON.stringify(r).includes(pg.socketDir) && JSON.stringify(r).includes("postgresql://"), false, "no connection string in the report");
  } finally {
    delete process.env.AG_TEST_SETUP_PG_WRITER;
    pg?.stop();
  }
});

test("--dry-run writes nothing at all", async () => {
  const f = fixture();
  const before = listFiles(f.instance);
  const r = await setup({ ...base(f), dryRun: true });
  assert.deepEqual(listFiles(f.instance), before, "the dry run created no file");
  assert.equal(existsSync(join(f.instance, "aftergrid.yaml")), false);
  assert.equal(existsSync(join(f.instance, ".aftergrid-setup.json")), false);
  assert.equal(existsSync(f.settings), false, "no hook entry was written");
  assert.match(info(r), /would create aftergrid\.yaml/);
  assert.match(info(r), /dry run: nothing was written/);
  assert.equal(r.content, "incomplete");

  // And on a root that does not exist yet.
  const missing = join(f.repo, "not-created-yet");
  const r2 = await setup({ ...base(f), instanceDir: missing, dryRun: true });
  assert.equal(existsSync(missing), false, "a dry run does not create the Instance root");
  assert.match(info(r2), /would create the Instance root/);
});

test("options that cannot be honoured are refused before anything is written", async () => {
  const f = fixture();
  const noSource = await setup({ instanceDir: f.instance, adapter: "duckdb", skipHook: true, skillsSearchPaths: [f.skills] });
  assert.equal(noSource.syntax, "invalid");
  assert.equal(noSource.errors[0]?.location, "--duckdb-path");
  assert.equal(existsSync(join(f.instance, "aftergrid.yaml")), false);

  const literalUrl = await setup({ instanceDir: f.instance, adapter: "postgres", pgUrlEnv: "postgresql://a:b@c/d", skipHook: true, skillsSearchPaths: [f.skills] });
  assert.equal(literalUrl.syntax, "invalid");
  assert.equal(literalUrl.errors[0]?.category, "value_type");
  assert.match(literalUrl.errors[0]!.remedy!, /never the connection string/);

  const escaping = await setup({ ...base(f), skipHook: true, duckdbPath: "../outside-the-instance" });
  assert.equal(escaping.errors[0]?.category, "unsafe_path");
  assert.match(escaping.errors[0]!.remedy!, /inside the Instance root/);

  const gone = await setup({ ...base(f), skipHook: true, duckdbPath: "data/not-here.duckdb" });
  const problem = gone.errors.find((e) => e.category === "missing_file");
  assert.ok(problem, JSON.stringify(gone.errors));
  assert.match(step(gone, "connection"), /incomplete/);
  assert.match(step(gone, "connection"), /nothing about its safety is claimed/);
});

test("the dependency checks answer honestly, including when they cannot answer", () => {
  assert.equal(checkNodeVersion("22.18.0").status, "present");
  assert.equal(checkNodeVersion("24.3.1").status, "present");
  assert.equal(checkNodeVersion("22.17.1").status, "missing");
  assert.match(checkNodeVersion("22.17.1").remedy!, /Node 22\.18 or newer/);
  assert.equal(checkNodeVersion("23.9.0").status, "unknown", "an untested line is unknown, not a pass and not a failure");
  assert.equal(checkNodeVersion("not-a-version").status, "unknown");

  const empty = scratch("ag-skills-empty-");
  cleanup.push(empty);
  const absent = findSkillsBundle([empty]);
  assert.equal(absent.status, "missing");
  assert.equal(absent.hard, true);

  // A directory that holds only one of the two is still missing: the dependency is both skills.
  const half = scratch("ag-skills-half-");
  cleanup.push(half);
  mkdirSync(join(half, "grilling"), { recursive: true });
  writeFileSync(join(half, "grilling", "SKILL.md"), "---\nname: grilling\n---\n");
  const partial = findSkillsBundle([half]);
  assert.equal(partial.status, "missing");
  assert.match(partial.detail, /writing-for-agents not found/);

  const both = scratch("ag-skills-both-");
  cleanup.push(both);
  for (const s of ["grilling", "writing-for-agents"]) {
    mkdirSync(join(both, "bundle", "skills", s), { recursive: true });
    writeFileSync(join(both, "bundle", "skills", s, "SKILL.md"), "---\n---\n");
  }
  assert.equal(findSkillsBundle([both]).status, "present", "the walk finds skills nested a few directories down");
});

test("the setup state records completed steps and survives a corrupt file", async () => {
  const f = fixture();
  await setup({ ...base(f), skipHook: true });
  const statePath = join(f.instance, ".aftergrid-setup.json");
  assert.ok(existsSync(statePath));
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.steps.scaffold.status, "completed");
  assert.equal(state.steps.smoke.status, "completed");
  assert.ok(statSync(statePath).size > 0);
  assert.equal(JSON.stringify(state).includes("hunter2"), false);

  writeFileSync(statePath, "{ not json");
  const r = await setup({ ...base(f), skipHook: true });
  assert.ok(r.warnings.some((w) => w.category === "invalid_artifact" && /setup state file could not be read/.test(w.message)));
  assert.match(step(r, "smoke"), /completed/, "an unreadable state simply redoes the step");
  assert.equal(JSON.parse(readFileSync(statePath, "utf8")).steps.scaffold.status, "completed");
});

/* ---------------------------------------------------------- the recorded path: an Instance with no adapter */
//
// ADR 0010: the adapter is an upgrade, not a prerequisite. Setup must accept an Instance that configures none,
// say what that costs, and every command that needs a source must refuse it by naming the route that works.

/** The same fixture, set up the way an Operator with no adapter runs it: no --adapter, no source flags. */
const recorded = (f: ReturnType<typeof fixture>) => ({ ...base(f), adapter: undefined, duckdbPath: undefined });

test("setup with no --adapter writes an Instance on the recorded path and says what is unavailable", async () => {
  const f = fixture();
  const r = await setup({ ...recorded(f), skipHook: true });

  assert.equal(r.syntax, "ok", `an adapterless setup is not a usage error: ${JSON.stringify(r.errors)}`);
  assert.equal(r.errors.length, 0, `no errors: ${JSON.stringify(r.errors)}`);

  const config: any = parseYaml(readFileSync(join(f.instance, "aftergrid.yaml"), "utf8"));
  assert.equal(config.connection.adapter, "none", "the recorded path is stated in the file, not left as an absent block");
  assert.equal(config.connection.duckdb, undefined);
  assert.equal(config.connection.postgres, undefined);

  // The connection step is skipped and says so; nothing is claimed about a source that was never opened.
  assert.match(step(r, "connection"), /skipped/);
  assert.match(step(r, "connection"), /no adapter/);
  assert.equal(r.sql_execution, "not_performed", "no statement ran, so none is reported");

  // What the Operator is told they have, and what they do not.
  const text = info(r);
  assert.match(text, /aftergrid record/, "the report names the command that produces evidence on this route");
  assert.match(text, /artifact_replay/);
  assert.match(text, /rerun_unavailable/);
  assert.match(text, /Revisit/);
  assert.match(text, /source_limits_missing/, "unattended intake stays refused, and the report says with which category");

  // The DuckDB binding is an upgrade here, not a hard requirement of a route that never opens it.
  assert.equal(r.errors.some((e) => e.category === "dependency_missing" && e.location === "duckdb_binding"), false);

  // The whole chain still runs: a Finding goes new -> check -> draft render with no adapter anywhere.
  assert.match(step(r, "smoke"), /completed/);
  assert.match(step(r, "dependencies"), /completed/);
});

test("capture on an adapterless Instance refuses with recorded_path and names `aftergrid record`", async () => {
  const f = fixture();
  await setup({ ...recorded(f), skipHook: true });
  const created = newFinding({ slug: "no-adapter", ask: "does it?", instanceDir: f.instance, date: "2026-09-16" });
  assert.equal(created.errors.length, 0, JSON.stringify(created.errors));
  const dir = join(f.instance, "findings", "2026-09-16-no-adapter");
  const before = readFileSync(join(dir, "manifest.yaml"), "utf8");

  const r = await capture({ dir, tables: ["users"], instanceDir: f.instance });

  const problem = r.errors.find((e) => e.category === "recorded_path");
  assert.ok(problem, `expected a recorded_path refusal, got ${JSON.stringify(r.errors)}`);
  assert.equal(problem!.location, "aftergrid.yaml#/connection/adapter");
  assert.match(problem!.message, /configures no adapter/);
  assert.match(problem!.remedy!, /aftergrid record/);
  assert.match(problem!.remedy!, /--adapter duckdb/, "the upgrade is named too, so the refusal is not a dead end");
  assert.equal(r.sql_execution, "not_performed");
  assert.equal(readFileSync(join(dir, "manifest.yaml"), "utf8"), before, "nothing was written");
  assert.deepEqual(readdirSync(join(dir, "inputs")).filter((n) => n !== ".gitkeep"), [], "no extract was written");
});

test("execute on an adapterless Instance refuses with recorded_path rather than sending the Operator to capture", async () => {
  const f = fixture();
  await setup({ ...recorded(f), skipHook: true });
  const created = newFinding({ slug: "no-adapter-execute", ask: "does it?", instanceDir: f.instance, date: "2026-09-16" });
  assert.equal(created.errors.length, 0, JSON.stringify(created.errors));
  const dir = join(f.instance, "findings", "2026-09-16-no-adapter-execute");
  const before = readFileSync(join(dir, "manifest.yaml"), "utf8");

  const r = await execute({ dir, instanceDir: f.instance });

  const problem = r.errors.find((e) => e.category === "recorded_path");
  assert.ok(problem, `expected a recorded_path refusal, got ${JSON.stringify(r.errors)}`);
  assert.equal(problem!.location, "aftergrid.yaml#/connection/adapter");
  assert.match(problem!.remedy!, /aftergrid record/);
  assert.equal(problem!.remedy!.includes("aftergrid capture <finding-dir> --tables"), false,
    "capture refuses here too, so a remedy that points at it would send the Operator in a circle");
  assert.equal(r.sql_execution, "not_performed");
  assert.equal(readFileSync(join(dir, "manifest.yaml"), "utf8"), before, "nothing was written");
});
