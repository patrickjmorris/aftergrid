// ag-guardrail-hook-8jc: the PreToolUse guard is exercised as a black box (stdin JSON in, exit code and
// machine-readable reason out), the settings merge is exercised for idempotence and for what it preserves, and
// the provisional bridge is exercised for every way a sign-off can fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { GUARD_PATH, HOOK_COMMAND, hook } from "./commands/hook.ts";
import { evaluateProvisional } from "./hook/provisional.ts";
import { render } from "./commands/render.ts";
// @ts-ignore: shared ESM validation library.
import { digestOf } from "../scripts/lib/validate-finding.mjs";

type Guard = { status: number | null; decision: any; stdout: string; stderr: string };

/** An Instance whose configured source is a Postgres warehouse and a DuckDB file. */
function instance(): string {
  const root = mkdtempSync(join(tmpdir(), "ag-hook-"));
  const inst = join(root, "analytics");
  mkdirSync(join(inst, "findings"), { recursive: true });
  mkdirSync(join(inst, "data"), { recursive: true });
  writeFileSync(join(inst, "data", "warehouse.duckdb"), "");
  writeFileSync(join(inst, "aftergrid.yaml"), [
    "schema_version: 0.1.0",
    "instance_root: analytics",
    "connection:",
    "  adapter: postgres",
    "  duckdb:",
    "    path: data/warehouse.duckdb",
    "    read_only: true",
    "  postgres:",
    "    host: warehouse.example",
    "    database: analytics",
    "",
  ].join("\n"));
  return root;
}

function guard(command: string, cwd: string): Guard {
  const r = spawnSync(process.execPath, [GUARD_PATH, "--explain"], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd }), encoding: "utf8", timeout: 20000,
  });
  const line = (r.status === 2 ? r.stderr : r.stdout).trim().split("\n").pop() ?? "";
  let decision: any = null;
  try { decision = JSON.parse(line).aftergrid_hook; } catch { /* reported by the assertion that reads it */ }
  return { status: r.status, decision, stdout: r.stdout, stderr: r.stderr };
}

test("writes and DDL through supported query paths are blocked against the configured source", () => {
  const root = instance();
  const cases: [string, string, string][] = [
    [`psql -c "insert into users values (1, 'x')"`, "source_write", "insert"],
    [`psql -h warehouse.example -d analytics -c "UPDATE users SET plan = 'pro'"`, "source_write", "update"],
    [`duckdb analytics/data/warehouse.duckdb "create table scratch as select 1"`, "source_write", "create"],
    ["psql -h warehouse.example -d analytics <<'SQL'\ndelete from events where day < '2026-01-01';\nSQL", "source_write", "delete"],
    [`echo "truncate table events" | psql -d analytics`, "source_write", "truncate"],
    [`psql -c "grant select on users to bob"`, "source_write", "grant"],
    [`psql -c "copy (select * from users) to '/tmp/users.csv'"`, "source_write", "copy"],
    [`duckdb -c "install httpfs"`, "engine_extension", "install"],
    [`duckdb -c "attach 'analytics/data/warehouse.duckdb' as w (read_write)"`, "engine_extension", "attach"],
    [`node -e "await client.query('delete from users')"`, "source_write", "delete"],
  ];
  for (const [command, rule, op] of cases) {
    const g = guard(command, root);
    assert.equal(g.status, 2, `should be blocked: ${command}\n${g.stdout}${g.stderr}`);
    assert.equal(g.decision.decision, "block");
    assert.equal(g.decision.rule, rule, command);
    assert.ok(g.decision.operations.includes(op), `${command}: ${JSON.stringify(g.decision.operations)}`);
    assert.ok(g.decision.remedy && g.decision.message, "a block says what it refused and what to do instead");
    assert.ok(g.stderr.includes("aftergrid guard:"), "the reason reaches stderr, where Claude Code reads it");
    assert.ok(g.decision.not_covered.some((n: string) => /not a shell sandbox/.test(n)), "every verdict carries its own non-coverage");
  }
});

test("reads, local artifact creation, the CLI and disposable-database provisioning are allowed", () => {
  const root = instance();
  const findings = join(root, "analytics", "findings", "2026-09-15-q");
  mkdirSync(join(findings, "queries"), { recursive: true });
  const cases: [string, string][] = [
    [`psql -h warehouse.example -d analytics -c "select count(*) from users where deleted_at is null"`, "query_read"],
    [`psql -c "select 'delete from users' as note"`, "query_read"],
    [`duckdb analytics/data/warehouse.duckdb "select * from users limit 5"`, "query_read"],
    [`node src/cli.ts check analytics/findings/2026-09-15-q --json`, "local_artifact"],
    [`mkdir -p analytics/findings/2026-09-15-q/results`, "local_artifact"],
    [`cp /etc/hosts analytics/findings/2026-09-15-q/queries/a.sql`, "local_artifact"],
    [`initdb -D /tmp/ag-scratch-pg`, "disposable_database"],
    [`pg_ctl -D /tmp/ag-scratch-pg -l /tmp/ag.log start`, "disposable_database"],
    [`docker run --rm -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:16`, "disposable_database"],
  ];
  for (const [command, rule] of cases) {
    const g = guard(command, root);
    assert.equal(g.status, 0, `should be allowed: ${command}\n${g.stderr}`);
    assert.equal(g.decision.rule, rule, command);
  }
  // A LIMIT-only read is admitted here and the hook says whose job the budget is.
  const g = guard(`psql -c "select * from events limit 10"`, root);
  assert.match(g.decision.message, /budgets are enforced by the adapter/);
});

test("what the hook cannot inspect is allowed and said to be uninspected, never reported as checked", () => {
  const root = instance();
  for (const command of [
    `curl -s https://warehouse.example/api/query -d 'select 1'`,
    `python3 scripts/pull.py --table users`,
    `bash ./load.sh`,
  ]) {
    const g = guard(command, root);
    assert.equal(g.status, 0, command);
    assert.equal(g.decision.rule, "uninspected", command);
    assert.equal(g.decision.uninspected, true);
    // An uninspected command reports itself even without --explain: silence would imply it was checked.
    const quiet = spawnSync(process.execPath, [GUARD_PATH], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: root }), encoding: "utf8" });
    assert.match(quiet.stdout, /uninspected/, command);
  }
  const sub = guard(`psql -c "$(cat /tmp/q.sql)"`, root);
  assert.equal(sub.status, 2, "SQL the hook cannot read is refused rather than waved through");
  assert.equal(sub.decision.rule, "uninspected_sql");
});

test("SQL in a file is read when it can be, and reported as uninspected when it cannot", () => {
  const root = instance();
  writeFileSync(join(root, "ddl.sql"), "-- migration\ndrop table users;\n");
  const blocked = guard(`psql -h warehouse.example -d analytics -f ddl.sql`, root);
  assert.equal(blocked.status, 2);
  assert.deepEqual(blocked.decision.operations, ["drop"]);
  const unread = guard(`psql -h warehouse.example -d analytics -f nowhere.sql`, root);
  assert.equal(unread.status, 0);
  assert.equal(unread.decision.rule, "uninspected");
  assert.ok(unread.decision.notes.some((n: string) => /nowhere.sql could not be read/.test(n)));
  // psql's clustered short form, and duckdb's -cmd, are read as the flags they are.
  assert.equal(guard(`psql -danalytics -c"delete from events"`, root).status, 2);
  assert.equal(guard(`duckdb analytics/data/warehouse.duckdb -cmd "select 1"`, root).decision.rule, "query_read");
});

test("a write to a database that is not the configured source is allowed and named as out of scope", () => {
  const root = instance();
  const g = guard(`psql -h 127.0.0.1 -p 55432 -d scratch -c "create table t (a int)"`, root);
  assert.equal(g.status, 0);
  assert.equal(g.decision.target, "other");
  assert.match(g.decision.message, /not the configured source/);
  assert.match(g.decision.message, /permissions remain the boundary/);
});

test("with no Instance policy the hook says so and still blocks the built-in destructive commands", () => {
  const bare = mkdtempSync(join(tmpdir(), "ag-nopolicy-"));
  const blocked = guard(`psql -c "drop table users"`, bare);
  assert.equal(blocked.status, 2);
  assert.equal(blocked.decision.rule, "source_write");
  assert.match(blocked.decision.policy, /no aftergrid.yaml found/);
  assert.equal(guard(`psql -c "select 1"`, bare).status, 0);
  const explained = guard(`ls -la`, bare);
  assert.match(explained.decision.policy_source, /no instance policy found/);
});

test("non-Bash tools and empty commands are not this hook's business", () => {
  const root = instance();
  const r = spawnSync(process.execPath, [GUARD_PATH, "--explain"], {
    input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/tmp/x", content: "drop table users" }, cwd: root }), encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout.trim()).aftergrid_hook.rule, "not_a_bash_command");
});

test("install is idempotent, uninstall removes only ours, status reports presence and self-tests the guard", () => {
  const root = instance();
  const settings = join(root, ".claude", "settings.json");
  mkdirSync(join(root, ".claude"));
  writeFileSync(settings, JSON.stringify({
    permissions: { allow: ["Bash(ls:*)"] },
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "node other-guard.mjs" }] }],
      PostToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "node fmt.mjs" }] }],
    },
  }, null, 2) + "\n");

  const absent = hook({ action: "status", settingsPath: settings, cwd: root });
  assert.equal(absent.state, "not_installed");
  assert.ok(absent.warnings.some((w) => w.category === "hook_not_installed"));
  assert.ok(absent.info.some((i) => /blocked \(exit 2\)/.test(i)), "status self-tests the guard, it does not assume it works");
  assert.ok(absent.info.some((i) => /allowed \(exit 0\)/.test(i)));
  assert.equal(absent.errors.length, 0);
  assert.equal(absent.readiness, "unknown", "publication readiness is not a fact about the hook");

  const first = hook({ action: "install", settingsPath: settings, cwd: root });
  assert.equal(first.errors.length, 0, JSON.stringify(first.errors));
  const second = hook({ action: "install", settingsPath: settings, cwd: root });
  assert.ok(second.info.some((i) => /already installed/.test(i)));
  const after = JSON.parse(readFileSync(settings, "utf8"));
  const bashGroup = after.hooks.PreToolUse.find((g: any) => g.matcher === "Bash");
  assert.equal(bashGroup.hooks.filter((e: any) => e.command === HOOK_COMMAND).length, 1, "install twice, one entry");
  assert.ok(bashGroup.hooks.some((e: any) => e.command === "node other-guard.mjs"), "the other Bash hook survived");
  assert.deepEqual(after.permissions, { allow: ["Bash(ls:*)"] }, "unrelated settings survive");
  assert.equal(after.hooks.PostToolUse[0].hooks[0].command, "node fmt.mjs");

  const present = hook({ action: "status", settingsPath: settings, cwd: root });
  assert.equal(present.state, "installed");
  assert.equal(present.warnings.length, 0);

  const removed = hook({ action: "uninstall", settingsPath: settings, cwd: root });
  assert.equal(removed.errors.length, 0);
  const final = JSON.parse(readFileSync(settings, "utf8"));
  assert.deepEqual(final.hooks.PreToolUse, [{ matcher: "Bash", hooks: [{ type: "command", command: "node other-guard.mjs" }] }]);
  assert.equal(final.hooks.PostToolUse[0].hooks[0].command, "node fmt.mjs");
  assert.deepEqual(final.permissions, { allow: ["Bash(ls:*)"] });
  assert.ok(hook({ action: "uninstall", settingsPath: settings, cwd: root }).info.some((i) => /nothing removed/.test(i)));
});

test("install refuses to touch settings it cannot parse, and creates the file when there is none", () => {
  const root = instance();
  const broken = join(root, ".claude", "settings.json");
  mkdirSync(join(root, ".claude"));
  writeFileSync(broken, "{ not json");
  const r = hook({ action: "install", settingsPath: broken, cwd: root });
  assert.equal(r.errors[0]?.category, "invalid_artifact");
  assert.equal(readFileSync(broken, "utf8"), "{ not json", "a file it cannot read is a file it does not write");

  const fresh = join(root, "elsewhere", "settings.json");
  const r2 = hook({ action: "install", settingsPath: fresh, cwd: root });
  assert.equal(r2.errors.length, 0);
  assert.equal(JSON.parse(readFileSync(fresh, "utf8")).hooks.PreToolUse[0].hooks[0].command, HOOK_COMMAND);
});

test("a redirection is removed operator and operand, so an output file is never read as the target", () => {
  const root = instance();
  for (const command of [
    `psql -h warehouse.example -d analytics -c "drop table users" > out.txt`,
    `psql -h warehouse.example -d analytics -c "drop table users" 2> err.log`,
    `psql -h warehouse.example -d analytics -c "drop table users" 2>&1`,
    `psql -c "drop table users" > /dev/null`,
    `psql -c "drop table users" >out.txt`,
    `psql -c "drop table users" -o "out file.txt" 2>> err.log`,
  ]) {
    const g = guard(command, root);
    assert.equal(g.status, 2, `redirecting output must not change the target: ${command}\n${JSON.stringify(g.decision)}`);
    assert.equal(g.decision.rule, "source_write", command);
    assert.equal(g.decision.target, "configured", command);
  }
  assert.equal(guard(`ls -la > out.txt`, root).status, 0, "a local command with a redirection is still local");
});

test("every -c and every -f is inspected: an opening select does not hide the statement behind it", () => {
  const root = instance();
  writeFileSync(join(root, "a.sql"), "select 1;\n");
  writeFileSync(join(root, "ddl.sql"), "drop table users;\n");
  const duck = "analytics/data/warehouse.duckdb";
  const cases: [string, string][] = [
    [`psql -c "select 1" -c "drop table users"`, "source_write"],
    [`psql -c "select 1" --command "delete from users"`, "source_write"],
    [`psql -f a.sql -f ddl.sql`, "source_write"],
    [`duckdb ${duck} -c "select 1" -c "drop table t"`, "source_write"],
    [`duckdb ${duck} -c "select 1" -c "attach '/tmp/x.db' as x"`, "engine_extension"],
  ];
  for (const [command, rule] of cases) {
    const g = guard(command, root);
    assert.equal(g.status, 2, `${command}\n${JSON.stringify(g.decision)}`);
    assert.equal(g.decision.rule, rule, command);
  }
  assert.equal(guard(`psql -c "select 1" -c "select 2"`, root).decision.rule, "query_read", "repeated reads are still reads");
});

test("a target the hook cannot resolve is unknown, never 'other': an unexpanded variable does not wave a write through", () => {
  const root = instance();
  for (const command of [
    `psql -d "$DB" -c "drop table users"`,
    `psql $PGDATABASE -c "drop table users"`,
    `psql -h $PGHOST -d $PGDATABASE -c "truncate events"`,
    `psql -d "\${WAREHOUSE}" -c "drop table users"`,
    `duckdb $DB -c "drop table t"`,
  ]) {
    const g = guard(command, root);
    assert.equal(g.status, 2, `${command}\n${JSON.stringify(g.decision)}`);
    assert.equal(g.decision.target, "unknown", command);
    assert.match(g.decision.message, /cannot rule out/, command);
  }
  assert.equal(guard(`psql -h 127.0.0.1 -d scratch -c "create table t (a int)"`, root).decision.target, "other",
    "a target it did read, and that differs, is still out of scope");
});

test("a command substitution anywhere in the SQL is refused, not only when it is the whole string", () => {
  const root = instance();
  const duck = "analytics/data/warehouse.duckdb";
  for (const command of [
    `psql -d analytics -c "select 1; $(cat /tmp/evil.sql)"`,
    `psql -c "$(echo drop) table users"`,
    `psql -c "de$(echo lete) from users"`,
    `psql -c "select id from t where x = $(cat /tmp/t.txt)"`,
    `duckdb ${duck} "dr$(echo op) table t"`,
    'psql -c "select 1; `cat /tmp/evil.sql`"',
  ]) {
    const g = guard(command, root);
    assert.equal(g.status, 2, `${command}\n${JSON.stringify(g.decision)}`);
    assert.equal(g.decision.rule, "uninspected_sql", command);
    assert.equal(g.decision.uninspected, true, command);
  }
});

test("shell parameter expansion is reported uninspected, never as a checked read", () => {
  const root = instance();
  for (const command of [
    `Q="drop table users"; psql -d analytics -c "$Q"`,
    `Q="drop table users"; psql -d analytics -c "\${Q}"`,
    `duckdb analytics/data/warehouse.duckdb "$Q"`,
  ]) {
    const g = guard(command, root);
    assert.equal(g.status, 0, command);
    assert.equal(g.decision.rule, "uninspected", `${command}\n${JSON.stringify(g.decision)}`);
    assert.equal(g.decision.uninspected, true, command);
    assert.ok(g.decision.notes.some((n: string) => /parameter expansion/.test(n)), `${command}: ${JSON.stringify(g.decision.notes)}`);
  }
  assert.equal(guard(`psql -d analytics -c "delete from users where id = $ID"`, root).status, 2,
    "a write keyword the hook can see still blocks, expansion or not");
});

test("an inline shell or interpreter payload is inspected; a script file is still only reported", () => {
  const root = instance();
  const blocked = [
    `bash -c "psql -c 'drop table users'"`,
    `sh -c "psql -d analytics -c 'delete from events'"`,
    `bash -lc "psql -d analytics -c 'truncate events'"`,
    `env bash -c "duckdb analytics/data/warehouse.duckdb -c 'drop table t'"`,
    `zsh -c "psql -c 'grant select on users to bob'"`,
    `python3 -c "cur.execute('drop table users')"`,
    `perl -e "$dbh->do('drop table users')"`,
  ];
  for (const command of blocked) {
    const g = guard(command, root);
    assert.equal(g.status, 2, `one word of indirection is not a payload beyond the parser: ${command}\n${JSON.stringify(g.decision)}`);
    assert.equal(g.decision.rule, "source_write", command);
  }
  const read = guard(`bash -c "psql -c 'select 1'"`, root);
  assert.equal(read.status, 0);
  assert.equal(read.decision.rule, "query_read");
  assert.equal(read.decision.wrapper, "bash", "the verdict says how it was reached");
  // A script file is not read, exactly as the contract says.
  assert.equal(guard(`bash ./load.sh`, root).decision.rule, "uninspected");
  assert.equal(guard(`python3 scripts/pull.py --table users`, root).decision.rule, "uninspected");
});

test("SQL arriving on stdin is read when the hook can read it, and named when it cannot", () => {
  const root = instance();
  writeFileSync(join(root, "ddl.sql"), "drop table users;\n");
  const redirected = guard(`psql -d analytics < ddl.sql`, root);
  assert.equal(redirected.status, 2, JSON.stringify(redirected.decision));
  assert.deepEqual(redirected.decision.operations, ["drop"]);
  assert.equal(guard(`psql -d analytics <<< "drop table users"`, root).status, 2, "a here-string is the SQL");
  const piped = guard(`cat ddl.sql | psql -d analytics`, root);
  assert.equal(piped.status, 0);
  assert.equal(piped.decision.rule, "uninspected");
  assert.ok(piped.decision.notes.some((n: string) => /piped in from cat/.test(n)), JSON.stringify(piped.decision.notes));
});

test("the block remedy does not promise that a provisional sign-off unblocks a write", () => {
  const g = guard(`psql -c "drop table users"`, instance());
  assert.equal(g.status, 2);
  assert.match(g.decision.remedy, /not something any sign-off in this Engine unblocks/);
  assert.match(g.decision.remedy, /no command calls yet: it never lifts this block/);
});

test("settings that parse but are shaped differently are reported, not crashed through, and never written", () => {
  const root = instance();
  const dir = join(root, "shaped");
  mkdirSync(dir, { recursive: true });
  const shapes: [string, RegExp][] = [
    [JSON.stringify({ hooks: { PreToolUse: { matcher: "Bash" } } }), /hooks\.PreToolUse is an object, not an array/],
    [JSON.stringify({ hooks: { PreToolUse: [null, { matcher: "Bash", hooks: [] }] } }), /hooks\.PreToolUse\[0\] is null, not an object/],
    [JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: "nope" }] } }), /hooks\.PreToolUse\[0\]\.hooks is a JSON string, not an array/],
    [JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command" }, 5] }] } }), /hooks\.PreToolUse\[0\]\.hooks\[1\] is a JSON number, not an object/],
    [JSON.stringify({ hooks: [] }), /hooks is a JSON array, not an object/],
    [JSON.stringify({ hooks: [{ matcher: "Bash" }] }), /hooks is a JSON array, not an object/],
    [JSON.stringify({ hooks: "x" }), /hooks is a JSON string, not an object/],
    [JSON.stringify({ hooks: 5 }), /hooks is a JSON number, not an object/],
  ];
  for (const [text, message] of shapes) {
    const p = join(dir, "settings.json");
    writeFileSync(p, text);
    for (const action of ["status", "install", "uninstall"] as const) {
      const r = hook({ action, settingsPath: p, cwd: root });
      assert.equal(r.errors[0]?.category, "invalid_artifact", `${action} ${text}: ${JSON.stringify(r.errors)}`);
      assert.match(r.errors[0]!.message, message, `${action} ${text}`);
      assert.equal(r.syntax, "invalid", `${action} ${text}`);
      assert.equal(readFileSync(p, "utf8"), text, `${action} ${text}: a file it cannot walk is a file it does not write`);
      assert.notEqual(r.state, "installed", `${action} ${text}: nothing was written, so nothing is installed`);
    }
  }
});

test("a guard entry under a matcher that never matches Bash is not an installed guard", () => {
  const root = instance();
  const p = join(root, ".claude", "settings.json");
  mkdirSync(join(root, ".claude"), { recursive: true });
  const inert = JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: HOOK_COMMAND }] }] } }, null, 2) + "\n";
  writeFileSync(p, inert);

  const before = hook({ action: "status", settingsPath: p, cwd: root });
  assert.equal(before.state, "not_installed", "Claude Code never runs a Write-matched group for a Bash call");
  assert.ok(before.warnings.some((w) => /does not match Bash/.test(w.message)), JSON.stringify(before.warnings));

  const installed = hook({ action: "install", settingsPath: p, cwd: root });
  assert.equal(installed.errors.length, 0, JSON.stringify(installed.errors));
  assert.notEqual(readFileSync(p, "utf8"), inert, "install must add the group that is actually run");
  const after = JSON.parse(readFileSync(p, "utf8"));
  const bash = after.hooks.PreToolUse.find((g: any) => g.matcher === "Bash");
  assert.equal(bash.hooks[0].command, HOOK_COMMAND);
  assert.equal(hook({ action: "status", settingsPath: p, cwd: root }).state, "installed");

  // A matcher that does match Bash counts: an exact name, a wildcard, an empty matcher, an alternation.
  for (const [n, matcher] of ["", "*", "Bash|Write"].entries()) {
    const q = join(root, `matcher-${n}`, "settings.json");
    mkdirSync(dirname(q), { recursive: true });
    writeFileSync(q, JSON.stringify({ hooks: { PreToolUse: [{ matcher, hooks: [{ type: "command", command: HOOK_COMMAND }] }] } }));
    assert.equal(hook({ action: "status", settingsPath: q, cwd: root }).state, "installed", `matcher '${matcher}'`);
  }
});

// ---------------------------------------------------------------- provisional sign-off

/** A record is identified by its file, so by default the written `id` is the filename; `keepId` writes the record
 *  exactly as given, which is how the mismatch case is built. */
function signoff(inst: string, id: string, record: Record<string, unknown>, { keepId = false } = {}) {
  mkdirSync(join(inst, "provisional"), { recursive: true });
  writeFileSync(join(inst, "provisional", `${id}.yaml`), toYaml(keepId ? record : { ...record, id }));
}
const AT = new Date("2026-09-15T12:00:00Z");
const valid = {
  id: "prov_unverified_billing",
  source: "postgres://warehouse.example/analytics#billing_raw",
  reason: "billing_raw is not in the verified table set; exploring whether it explains the September gap",
  reason_code: "unverified_table",
  approver: { name: "Dana Okafor", evidence: { type: "github_pr_review", url: "https://github.com/loop-example/analytics/pull/12#pullrequestreview-345" } },
  date: "2026-09-10",
  expiry: "2026-09-20",
};

test("a provisional sign-off is scoped to source, reason, date and expiry, and an approver name alone is not authorization", () => {
  const root = instance();
  const inst = join(root, "analytics");
  const src = valid.source;

  const missing = evaluateProvisional(inst, "prov_absent", src, AT);
  assert.equal(missing.decision, "blocked");
  assert.deepEqual(missing.reasons.map((r) => r.code), ["missing"]);

  signoff(inst, "prov_ok", valid);
  const ok = evaluateProvisional(inst, "prov_ok", src, AT);
  assert.equal(ok.decision, "allowed", JSON.stringify(ok.reasons));
  assert.equal(ok.reason_code, "unverified_table");
  assert.ok(ok.caveats.some((c) => /not verified through the provider's API/.test(c)), "recorded is not the same fact as verified");
  assert.ok(ok.caveats.some((c) => /never be rendered for a Reader/.test(c)));

  signoff(inst, "prov_name_only", { ...valid, approver: { name: "Dana Okafor" } });
  const nameOnly = evaluateProvisional(inst, "prov_name_only", src, AT);
  assert.equal(nameOnly.decision, "blocked");
  assert.deepEqual(nameOnly.reasons.map((r) => r.code), ["unverified_evidence"]);
  assert.match(nameOnly.reasons[0]!.message, /editable text and is not authorization/);

  signoff(inst, "prov_expired", { ...valid, date: "2026-08-01", expiry: "2026-09-01" });
  assert.deepEqual(evaluateProvisional(inst, "prov_expired", src, AT).reasons.map((r) => r.code), ["expired"]);

  signoff(inst, "prov_future", { ...valid, date: "2026-10-01", expiry: "2026-10-10" });
  assert.deepEqual(evaluateProvisional(inst, "prov_future", src, AT).reasons.map((r) => r.code), ["not_yet_valid"]);

  const wrong = evaluateProvisional(inst, "prov_ok", "postgres://warehouse.example/analytics#payments_raw", AT);
  assert.deepEqual(wrong.reasons.map((r) => r.code), ["wrong_source"]);

  signoff(inst, "prov_bare", { source: src });
  const bare = evaluateProvisional(inst, "prov_bare", src, AT);
  assert.deepEqual(bare.reasons.map((r) => r.code).sort(), ["incomplete", "incomplete", "incomplete", "unverified_evidence"]);

  // Expiry is inclusive to the end of its day, and one day later it is not.
  assert.equal(evaluateProvisional(inst, "prov_ok", src, new Date("2026-09-20T23:59:00Z")).decision, "allowed");
  assert.equal(evaluateProvisional(inst, "prov_ok", src, new Date("2026-09-21T00:00:01Z")).decision, "blocked");

  const log = readFileSync(join(inst, "provisional", "log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(log.length, 9, "every evaluation is logged, allowed and blocked alike");
  assert.equal(log[1].decision, "allowed");
  assert.equal(log[1].reason_code, "unverified_table");
  assert.deepEqual(log[0], {
    at: AT.toISOString(), source: src, record_id: null, record_path: missing.record_path,
    decision: "blocked", reason_code: null, reasons: ["missing"],
  });
});

test("a sign-off is identified by its file: a record declaring another id is blocked, and the log joins back to the file", () => {
  const root = instance();
  const inst = join(root, "analytics");

  signoff(inst, "prov_a", { ...valid, id: "totally_other_id" }, { keepId: true });
  const mismatched = evaluateProvisional(inst, "prov_a", valid.source, AT);
  assert.equal(mismatched.decision, "blocked", "a record that misnames itself cannot be audited");
  assert.deepEqual(mismatched.reasons.map((r) => r.code), ["id_mismatch"]);
  assert.equal(mismatched.record_id, "prov_a", "the id that was evaluated, never the one the file claims");

  signoff(inst, "prov_num", { ...valid, id: 42 }, { keepId: true });
  assert.deepEqual(evaluateProvisional(inst, "prov_num", valid.source, AT).reasons.map((r) => r.code), ["id_mismatch"]);

  signoff(inst, "prov_named", valid); // written with its own filename as the id
  assert.equal(evaluateProvisional(inst, "prov_named", valid.source, AT).decision, "allowed");

  const log = readFileSync(join(inst, "provisional", "log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(log[0].record_id, "prov_a");
  assert.equal(log[0].record_path, mismatched.record_path, "a log line names the file that granted or refused the read");
  assert.match(String(log[0].record_path), /provisional\/prov_a\.yaml$/);
  assert.equal(log[2].decision, "allowed");
});

test("a result marked provisional cannot be rendered: the existing validator refuses it", async () => {
  const root = mkdtempSync(join(tmpdir(), "ag-prov-render-"));
  cpSync(fileURLToPath(new URL("../fixtures/instance/", import.meta.url)), root, { recursive: true });
  const dir = join(root, "analytics", "findings", "2026-07-20-onboarding-checklist-retention");
  const mp = join(dir, "manifest.yaml");
  const m = parseYaml(readFileSync(mp, "utf8"));
  m.results[0].provisional = true;
  m.attestations = []; m.reviews = [];
  rmSync(join(root, "analytics", "decisions"), { recursive: true, force: true });
  m.content_digest = digestOf(m, dir);
  writeFileSync(mp, toYaml(m, { lineWidth: 0 }));
  const r = await render({ dir });
  assert.ok(r.errors.some((e) => e.category === "provisional_evidence"), JSON.stringify(r.errors.map((e) => e.category)));
  assert.equal(r.evidence, "invalid");
  assert.ok(r.info.some((i) => /render refused/.test(i)), "nothing is generated from provisional evidence");
});
