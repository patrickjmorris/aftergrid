// `aftergrid setup`: onboard a team to a working, resumable private Instance (spec stories 1–4).
//
// Six steps, each reported as its own fact: scaffold, dependencies, connection, hook, publication preflight and
// an end-to-end smoke. Three rules hold across all of them.
//
//  1. Nothing is reported as installed, verified or ready unless this run actually observed it. `unknown` is a
//     real answer and is never rounded up.
//  2. An existing file is never overwritten. A rerun with different options reports what differs and leaves the
//     Operator's copy exactly where it was.
//  3. A credential is never written to a file, a report or a log. The Postgres connection string is named by
//     environment variable and read at runtime; the GitHub token is read from the environment by the client.
//
// Contract: docs/contracts/setup.md. Instance layout: docs/contracts/instance-layout.md.
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
// @ts-ignore: shared path containment and error type.
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";
import { emptyReport, type Problem, type Report } from "../report.ts";
import { hook } from "./hook.ts";
import { applyScaffold, describeOutcome, scaffoldFiles, type ConnectionSpec, type ScaffoldOutcome } from "../setup/scaffold.ts";
import { checkDuckDbBinding, checkNodeVersion, checkPostgresRuntime, defaultSkillsSearchPaths, describeDependency, findSkillsBundle, type DependencyResult } from "../setup/dependencies.ts";
import { validateConnection } from "../setup/connection.ts";
import { createPreflightClient, publicationPreflight, RUNBOOK, type PreflightClient } from "../setup/preflight.ts";
import { tokenFromEnv } from "../publication/github.ts";
import { readSetupState, writeSetupState, SETUP_STATE_FILE, STEPS, type SetupState, type StepName, type StepStatus } from "../setup/state.ts";
import { runSmoke } from "../setup/smoke.ts";

export type SetupOptions = {
  /** Instance root. Default: `analytics/` under the current directory. */
  instanceDir?: string;
  /**
   * Which backend this Instance reads, or `none` — the default. `none` is the recorded path of ADR 0010: the
   * harness runs the SQL and `aftergrid record` writes down what it ran. An adapter is the upgrade that earns
   * `analysis_rerun`, `check --mode rerun` and Revisit; it is not a prerequisite for a Finding.
   */
  adapter?: "duckdb" | "postgres" | "none";
  /** DuckDB: a `.duckdb` file or a directory of `<table>.csv` files, inside the Instance. */
  duckdbPath?: string;
  /** Postgres: the NAME of the environment variable holding the connection string. Never the string itself. */
  pgUrlEnv?: string;
  ownerName?: string;
  ownerContact?: string;
  repository?: string;
  automationLogin?: string;
  trustedApprovers?: string[];
  /** Claude Code settings.json the guard is installed into. Default: `<repo>/.claude/settings.json`. */
  settingsPath?: string;
  skipHook?: boolean;
  dryRun?: boolean;
  /** Injectable GitHub preflight client (the `--github` test seam). Defaults to a fetch client when a token is set. */
  github?: PreflightClient | null;
  /** Same seam, named explicitly. Takes precedence over `github`. */
  preflightClient?: PreflightClient | null;
  /** Where to look for the mattpocock-skills bundle. Defaults to the Claude Code plugin and skill directories. */
  skillsSearchPaths?: string[];
  /**
   * Environment setup reads for its own lookups (the GitHub token, AFTERGRID_SKILLS_PATH). The Postgres
   * connection string is deliberately *not* read from here: the adapter reads `process.env`, and a presence
   * check against anything else would answer a different question from the one the connection asks.
   */
  env?: Record<string, string | undefined>;
  cwd?: string;
  now?: () => Date;
};

const stepLine = (name: StepName, status: StepStatus | "resumed", detail: string) => `step ${name}: ${status} — ${detail}`;

export async function setup(opts: SetupOptions): Promise<Report> {
  const report = emptyReport("setup");
  report.command = "setup";
  const env = opts.env ?? process.env;
  const cwd = resolve(opts.cwd ?? process.cwd());
  const now = opts.now ?? (() => new Date());
  const stamp = now().toISOString().replace(/\.\d{3}Z$/, "Z");
  const dryRun = !!opts.dryRun;
  const err = (category: Problem["category"], location: string, message: string, remedy?: string) => report.errors.push({ category, location, message, remedy });
  const warn = (category: Problem["category"], location: string, message: string, remedy?: string) => report.warnings.push({ category, location, message, remedy });

  // Publication readiness is a fact about a Finding. Setup can say whether the policy could ever produce one.
  report.readiness = "unknown";
  report.readiness_reasons.push("publication readiness is a fact about a Finding, not about setup; what follows is only whether this Instance's publication policy can ever produce a verified approval");
  report.evidence = "not_evaluated";

  const instanceRoot = resolve(opts.instanceDir ?? join(cwd, "analytics"));
  // No `--adapter` is the recorded path (ADR 0010), not a missing input: the harness owns the data path and
  // `aftergrid record` writes down what it ran. duckdb and postgres are the upgrade, asked for by name.
  const adapter = opts.adapter ?? "none";
  if (adapter !== "duckdb" && adapter !== "postgres" && adapter !== "none") {
    err("value_type", "--adapter", `'${adapter}' is not a supported adapter`, "use --adapter duckdb, --adapter postgres, or --adapter none (the default: the recorded path, where your harness runs the SQL and `aftergrid record` writes it down)");
    report.syntax = "invalid";
    return report;
  }
  if (adapter === "duckdb" && !opts.duckdbPath) {
    err("incomplete", "--duckdb-path", "the DuckDB adapter needs a source", "pass --duckdb-path <file-or-csv-dir>, relative to the Instance root");
    report.syntax = "invalid";
    return report;
  }
  if (adapter === "postgres" && !opts.pgUrlEnv) {
    err("incomplete", "--pg-url-env", "the Postgres adapter needs the NAME of the environment variable holding the connection string", "pass --pg-url-env AFTERGRID_PG_URL (the URL itself is read from the environment and is never written to aftergrid.yaml)");
    report.syntax = "invalid";
    return report;
  }
  if (adapter === "postgres" && !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(opts.pgUrlEnv!)) {
    err("value_type", "--pg-url-env", `'${opts.pgUrlEnv}' is not an environment variable name`, "pass the NAME of the variable (for example AFTERGRID_PG_URL), never the connection string");
    report.syntax = "invalid";
    return report;
  }

  report.finding = undefined;
  report.info.push(`instance: ${instanceRoot}${dryRun ? " (dry run: nothing is written)" : ""}`);

  if (!existsSync(instanceRoot)) {
    if (dryRun) report.info.push(`would create the Instance root ${instanceRoot}`);
    else {
      try { mkdirSync(instanceRoot, { recursive: true }); report.info.push(`created the Instance root ${instanceRoot}`); }
      catch (e) {
        err("invalid_artifact", instanceRoot, `the Instance root could not be created: ${(e as Error).message}`, "check the path and permissions");
        return report;
      }
    }
  }

  const previous = readSetupState(instanceRoot);
  report.warnings.push(...previous.problems);
  const resuming = Object.values(previous.state.steps).some((s) => s?.status === "completed");
  if (resuming) {
    const done = STEPS.filter((s) => previous.state.steps[s]?.status === "completed");
    report.info.push(`resuming: a previous run (${previous.state.updated_at || "date not recorded"}) completed ${done.join(", ")}. Every verifying step runs again and reports what it finds now; only the smoke run is skipped when it already passed.`);
  }
  const state: SetupState = { schema_version: "0.1.0", updated_at: stamp, steps: { ...previous.state.steps } };
  const record = (name: StepName, status: StepStatus, detail: string) => { state.steps[name] = { status, at: stamp, detail }; };

  // ---- step 1: scaffold -----------------------------------------------------------------------------------
  let connectionSpec: ConnectionSpec;
  let duckdbAbs = "";
  if (adapter === "duckdb") {
    const given = opts.duckdbPath!;
    const rel = (isAbsolute(given) ? relative(instanceRoot, resolve(given)) : given).split(sep).join("/");
    try {
      duckdbAbs = safePath(instanceRoot, rel) as string;
    } catch (e) {
      const category = e instanceof ContractError ? ((e as any).category as Problem["category"]) : "unsafe_path";
      err(category, given, `the DuckDB source path is not usable: ${(e as Error).message}`, "keep the warehouse inside the Instance root and give a relative path without `..` or symlinked components; every path read from aftergrid.yaml is resolved the same way by the guardrail hook");
      record("scaffold", "incomplete", "the configured DuckDB path was refused");
      if (!dryRun) writeSetupState(instanceRoot, state);
      report.content = "incomplete";
      return report;
    }
    connectionSpec = { adapter: "duckdb", duckdbPath: rel };
  } else if (adapter === "postgres") {
    connectionSpec = { adapter: "postgres", urlEnv: opts.pgUrlEnv! };
  } else {
    connectionSpec = { adapter: "none" };
  }

  const files = scaffoldFiles({
    instanceRoot: basename(instanceRoot),
    connection: connectionSpec,
    owner: { name: opts.ownerName, contact: opts.ownerContact },
    publication: { repository: opts.repository, trustedApprovers: opts.trustedApprovers, automationLogin: opts.automationLogin },
  });
  let outcomes: ScaffoldOutcome[] = [];
  try {
    outcomes = applyScaffold(instanceRoot, files, { dryRun });
  } catch (e) {
    err(e instanceof ContractError ? ((e as any).category as Problem["category"]) : "invalid_artifact", instanceRoot, `the scaffold could not be written: ${(e as Error).message}`, "check the Instance path and permissions; existing files are never overwritten");
    report.content = "incomplete";
    return report;
  }
  for (const o of outcomes) report.info.push(`scaffold: ${describeOutcome(o)}`);
  const differs = outcomes.filter((o) => o.status === "kept_differs" || o.status === "would_keep_differs");
  for (const o of differs) {
    warn("exists", o.path, `${o.rel} differs from what setup would write and was kept as it is`, "setup never overwrites. If you want the scaffolded version, move your copy aside and rerun; otherwise nothing needs doing.");
  }
  report.info.push(stepLine("scaffold", dryRun ? "skipped" : "completed", dryRun
    ? `${outcomes.filter((o) => o.status === "would_create").length} file(s) would be created, ${outcomes.length - outcomes.filter((o) => o.status === "would_create").length} kept`
    : `${outcomes.filter((o) => o.status === "created").length} created, ${outcomes.filter((o) => o.status === "kept").length} kept unchanged, ${differs.length} kept and different`));
  if (!dryRun) record("scaffold", "completed", `${outcomes.filter((o) => o.status === "created").length} created, ${differs.length} kept and different`);

  // ---- step 2: hard dependencies --------------------------------------------------------------------------
  // The DuckDB binding is hard for an Instance that reads through it. On the recorded path nothing in the
  // Engine opens it, so its absence is reported as what it is — an upgrade that is not available yet — rather
  // than as a missing requirement of a route that does not use it.
  const duckdbBinding = await checkDuckDbBinding();
  const deps: DependencyResult[] = [
    checkNodeVersion(),
    findSkillsBundle(opts.skillsSearchPaths ?? defaultSkillsSearchPaths(cwd, env)),
    adapter === "none"
      ? { ...duckdbBinding, hard: false, detail: `${duckdbBinding.detail}${duckdbBinding.status === "present" ? "" : " — not needed on the recorded path, which runs no SQL from the Engine; it is needed to configure the duckdb adapter later"}` }
      : duckdbBinding,
  ];
  if (adapter === "postgres") deps.push(checkPostgresRuntime());
  for (const d of deps) {
    report.info.push(describeDependency(d));
    if (d.status === "present") continue;
    const location = d.id === "mattpocock_skills" ? "mattpocock-skills" : d.id;
    if (d.hard) err("dependency_missing", location, d.detail, d.remedy);
    else warn("runtime_unavailable", location, d.detail, d.remedy);
  }
  const hardDepsOk = deps.every((d) => !d.hard || d.status === "present");
  report.info.push(stepLine("dependencies", hardDepsOk ? "completed" : "incomplete", hardDepsOk
    ? "every hard dependency was found"
    : `${deps.filter((d) => d.hard && d.status !== "present").map((d) => d.id).join(", ")} unresolved; the remaining steps still ran, and each remedy above is the whole fix`));
  if (!dryRun) record("dependencies", hardDepsOk ? "completed" : "incomplete", deps.map((d) => `${d.id}=${d.status}`).join(" "));

  // ---- step 3: connection and capabilities ----------------------------------------------------------------
  // With no adapter there is no connection to validate, and nothing here pretends otherwise: the step is
  // `skipped`, `sql_execution` stays `not_performed`, and what is unavailable is named rather than left to be
  // discovered by a command that refuses later.
  let connectionSettled: boolean;
  if (adapter === "none") {
    connectionSettled = true;
    report.info.push("connection: no adapter is configured, so nothing was opened, no statement ran and no privilege was probed. This Instance is on the recorded path (ADR 0010): your harness runs the SQL with its own tool and `aftergrid record <finding-dir> --tool \"<name>\" …` writes down the query, the parameters, the result and the tool that produced them.");
    report.info.push("connection: what a Finding gets here — artifact_replay, so the saved results replay byte for byte and every hash is verified by `aftergrid check`. What it does not get — analysis_rerun: `aftergrid capture` and `aftergrid execute` refuse and name `aftergrid record`, `aftergrid check --mode rerun` answers `rerun_unavailable`, and a Finding that cannot be rerun cannot be revisited.");
    report.info.push("connection: unattended intake stays refused while there is no adapter — source limits are an adapter's to declare, and preflight reports `source_limits_missing` (docs/contracts/intake.md).");
    report.info.push("connection: to upgrade, rerun setup with --adapter duckdb --duckdb-path <file-or-csv-dir>, or --adapter postgres --pg-url-env <ENV_VAR_NAME>. aftergrid.yaml is never overwritten, so copy the connection block setup prints into your own file.");
    report.info.push(stepLine("connection", "skipped", "no adapter was configured; the recorded path is the default and needs none. Nothing about any source's safety is claimed, because no source was opened."));
    if (!dryRun) record("connection", "skipped", "adapter=none (recorded path)");
  } else {
    const connection = await validateConnection({
      instanceRoot,
      connection: adapter === "duckdb" ? { adapter: "duckdb", path: duckdbAbs } : { adapter: "postgres", urlEnv: opts.pgUrlEnv! },
    });
    report.errors.push(...connection.problems);
    report.warnings.push(...connection.warnings);
    for (const line of connection.info) report.info.push(`connection: ${line}`);
    if (connection.sqlExecuted) report.sql_execution = "performed";
    const connectionOk = connection.validated && connection.problems.length === 0;
    connectionSettled = connectionOk;
    report.info.push(stepLine("connection", connectionOk ? "completed" : "incomplete", connectionOk
      ? `${adapter} source opened and its capability matrix read from the adapter itself`
      : `the ${adapter} source was not validated; nothing about its safety is claimed`));
    if (!dryRun) record("connection", connectionOk ? "completed" : "incomplete", `${adapter} validated=${connection.validated}`);
  }

  // ---- step 4: the guardrail hook -------------------------------------------------------------------------
  let hookActive = false;
  if (opts.skipHook) {
    report.info.push(stepLine("hook", "skipped", "--skip-hook was passed. The PreToolUse guard is not installed, so writes and DDL through supported query paths are not blocked in code. Do not run unattended intake until `aftergrid hook install` has run and its self-test passes."));
    warn("hook_not_installed", opts.settingsPath ?? join(dirname(instanceRoot), ".claude", "settings.json"), "the guardrail hook was skipped at your request; setup verified nothing about it", "run `aftergrid hook install` and then `aftergrid hook status`, or rerun setup without --skip-hook");
    if (!dryRun) record("hook", "skipped", "--skip-hook");
  } else if (dryRun) {
    report.info.push(stepLine("hook", "skipped", "dry run: the guard would be installed into the Claude Code settings and then self-tested; nothing was written"));
  } else {
    const hookCwd = dirname(instanceRoot);
    const install = hook({ action: "install", settingsPath: opts.settingsPath, cwd: hookCwd });
    for (const p of install.errors) report.errors.push(p);
    for (const p of install.warnings) report.warnings.push(p);
    for (const line of install.info) report.info.push(`hook install: ${line}`);
    const status = hook({ action: "status", settingsPath: opts.settingsPath, cwd: hookCwd });
    for (const p of status.errors) report.errors.push(p);
    for (const p of status.warnings) report.warnings.push(p);
    for (const line of status.info) report.info.push(`hook status: ${line}`);
    const selfTestFailed = [...install.errors, ...status.errors].filter((e) => e.category === "hook_self_test_failed");
    hookActive = status.state === "installed" && install.errors.length === 0 && status.errors.length === 0;
    report.info.push(stepLine("hook", hookActive ? "completed" : "incomplete", hookActive
      ? "hook active: the guard command is present in the Claude Code settings and its self-test blocked a write and allowed a read just now. It is not a shell sandbox — docs/contracts/hook.md lists what it does not cover."
      : status.state !== "installed"
        ? "the guard command is not present in the Claude Code settings, so nothing is being blocked"
        : `the guard is installed but its self-test did not pass: ${selfTestFailed.map((e) => e.message).join("; ") || "see the errors above"}. Installed and working are separate facts and this run only verified the first.`));
    record("hook", hookActive ? "completed" : "incomplete", `state=${status.state}`);
  }

  // ---- step 5: publication preflight ----------------------------------------------------------------------
  const policyPath = join(instanceRoot, "aftergrid.yaml");
  const configured = !!(opts.repository || opts.automationLogin || opts.trustedApprovers?.length);
  const client = opts.preflightClient !== undefined ? opts.preflightClient
    : opts.github !== undefined ? opts.github
    : tokenFromEnv(env) ? createPreflightClient() : null;
  const preflight = await publicationPreflight({
    repository: opts.repository,
    trustedApprovers: opts.trustedApprovers,
    automationLogin: opts.automationLogin,
    policyPath,
    client,
  });
  report.errors.push(...preflight.errors);
  report.warnings.push(...preflight.warnings);
  for (const line of preflight.info) report.info.push(`publication: ${line}`);
  for (const reason of preflight.reasons) report.readiness_reasons.push(`publication preflight: ${reason}`);
  if (preflight.status === "invalid") report.readiness = "not_ready";
  report.info.push(stepLine("publication_preflight", preflight.status === "ok" ? "completed" : preflight.status === "invalid" ? "incomplete" : configured ? "incomplete" : "skipped",
    preflight.status === "ok" ? "the policy is self-consistent and every login resolves to a distinct GitHub account. No Finding has been approved by this; approval is verified per Finding by `aftergrid check`."
      : preflight.status === "invalid" ? "the policy as configured can never produce a verified approval; see the error above"
      : `unknown: ${configured ? "the policy is self-consistent but was not verified against GitHub" : "publication is not configured yet"}. Runbook: ${RUNBOOK}`));
  if (!dryRun) record("publication_preflight", preflight.status === "ok" ? "completed" : "incomplete", preflight.status);

  // ---- step 6: end-to-end smoke ---------------------------------------------------------------------------
  const smokeDone = previous.state.steps.smoke?.status === "completed";
  if (dryRun) {
    report.info.push(stepLine("smoke", "skipped", "dry run: `new finding setup-smoke` -> `check` -> `render` would run in a temporary copy of the scaffold"));
  } else if (smokeDone) {
    report.info.push(stepLine("smoke", "completed", `resumed: a previous run (${previous.state.steps.smoke?.at || "date not recorded"}) completed the smoke and it was not run again. Delete ${SETUP_STATE_FILE} to force it.`));
  } else {
    const smoke = await runSmoke(instanceRoot, { now });
    for (const s of smoke.steps) report.info.push(`smoke ${s.command}: ${s.ok ? "ok" : "failed"} — ${s.summary}`);
    for (const line of smoke.info) report.info.push(line);
    for (const f of smoke.failures) err("check_failed", instanceRoot, `smoke: ${f}`, "this scaffold cannot yet carry a Finding end to end; fix the errors above and rerun setup. Your Instance was not modified by the smoke: it ran in a temporary copy.");
    report.info.push(stepLine("smoke", smoke.passed ? "completed" : "incomplete", smoke.passed
      ? "new -> check -> draft render all ran against a temporary copy of this scaffold; the real Instance holds only the scaffold"
      : "the end-to-end path did not complete"));
    record("smoke", smoke.passed ? "completed" : "incomplete", smoke.passed ? "new/check/render" : smoke.failures.join("; ").slice(0, 200));
  }

  // ---- what setup is, and is not, saying ------------------------------------------------------------------
  const complete = !dryRun && hardDepsOk && connectionSettled && (hookActive || false) && preflight.status === "ok" && state.steps.smoke?.status === "completed" && differs.length === 0;
  report.content = complete ? "complete" : "incomplete";
  if (!complete && !dryRun) {
    const outstanding = [
      hardDepsOk ? null : "a hard dependency is missing",
      connectionSettled ? null : "the source connection was not validated",
      hookActive ? null : opts.skipHook ? "the guardrail hook was skipped" : "the guardrail hook is not active",
      preflight.status === "ok" ? null : `publication preflight is ${preflight.status}`,
      state.steps.smoke?.status === "completed" ? null : "the end-to-end smoke did not pass",
      differs.length ? "one or more scaffold files differ from what setup would write" : null,
    ].filter(Boolean);
    report.info.push(`setup is incomplete: ${outstanding.join("; ")}. Each has a remedy above; fix and rerun \`aftergrid setup\` — completed steps are remembered.`);
  }

  if (!dryRun) {
    try {
      const statePath = writeSetupState(instanceRoot, state);
      report.info.push(`setup state: ${statePath} (listed in the Instance .gitignore; it records which steps completed so a rerun can resume)`);
    } catch (e) {
      warn("invalid_artifact", join(instanceRoot, SETUP_STATE_FILE), `the setup state could not be written: ${(e as Error).message}`, "a rerun will simply redo every step");
    }
  } else {
    report.info.push("dry run: nothing was written — no scaffold, no setup state, no hook entry, no smoke Finding.");
  }

  if (adapter === "none") {
    report.info.push("adapter: not configured. Findings in this Instance are produced on the recorded path — your harness runs the SQL, `aftergrid record` writes down what it ran, and the Finding guarantees artifact_replay. `aftergrid capture` and `aftergrid execute` refuse here, `check --mode rerun` answers rerun_unavailable, and Revisit is unavailable until an adapter is configured and the inputs are captured. That is a stated cost of the default route, not a failed step.");
  }
  report.info.push("what setup did not verify: that your data is correct, that the trusted approver will read a Finding, that the guard covers a query path it says it does not cover, and that any Finding is approved. docs/contracts/setup.md lists the limits in full.");
  return report;
}
