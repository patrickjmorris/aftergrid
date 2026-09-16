// What must be true before an unattended Analysis is dispatched at all (spec story 36, ADR 0006).
//
// There is no bypass. No `--allow-no-hook`, no environment variable, no "report it and continue": absent
// enforcement prevents dispatch, period. A flag that let an unattended run proceed without the guard would be
// the rule with no enforcement that ADR 0006 exists to refuse, and "we warned you" is not enforcement.
//
// Everything here reuses code that already owns the fact: `hook({action:"status"})` for the guard (installed
// AND self-tested, which are separate facts), `findInstance` for the policy, `safePath` for scope.
import { existsSync } from "node:fs";
import { hook } from "../commands/hook.ts";
import { findInstance, type Instance } from "../instance.ts";
import type { Problem, Report } from "../report.ts";
// @ts-ignore: shared path containment and error type.
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";

export type PreflightOptions = {
  instanceDir?: string;
  cwd?: string;
  settingsPath?: string;
  /** Test seam: the hook status report. Defaults to really running `aftergrid hook status`. */
  hookStatus?: () => Report;
};

export type PreflightResult = {
  ok: boolean;
  instance: Instance | null;
  problems: Problem[];
  /** One line per fact checked, whether it passed or failed. A step never borrows another's evidence. */
  facts: string[];
};

export function intakePreflight(opts: PreflightOptions): PreflightResult {
  const problems: Problem[] = [];
  const facts: string[] = [];
  const start = opts.instanceDir ?? opts.cwd ?? process.cwd();

  const instance = findInstance(start);
  if (!instance) {
    problems.push({
      category: "missing_file", location: start,
      message: "no aftergrid.yaml found here or above, so there is no Instance policy to run under",
      remedy: "run `aftergrid setup` or pass --instance <dir>",
    });
    facts.push("instance policy: not found");
    return { ok: false, instance: null, problems, facts };
  }
  facts.push(`instance policy: ${instance.root}/aftergrid.yaml`);

  // 1. The guardrail hook is installed AND its self-test passed, just now.
  const status = (opts.hookStatus ?? (() => hook({ action: "status", settingsPath: opts.settingsPath, cwd: opts.cwd })))();
  const installed = status.state === "installed";
  const selfTested = !status.errors.some((e) => e.category === "hook_self_test_failed");
  if (!installed) {
    problems.push({
      category: "hook_not_installed", location: opts.settingsPath ?? "<cwd>/.claude/settings.json",
      message: "the guardrail hook is not installed, so a source write or DDL through a supported query path would not be blocked",
      remedy: "run `aftergrid hook install`; there is no flag that dispatches an unattended Analysis without it",
    });
  }
  for (const e of status.errors) if (e.category === "hook_self_test_failed") problems.push(e);
  facts.push(`guardrail hook: ${installed ? "installed" : "not installed"}, self-test ${selfTested ? "passed" : "failed"}`);

  // 2. The findings directory exists and is inside the Instance: the only place a produced Finding may land.
  try {
    const findings = safePath(instance.root, "findings");
    if (!existsSync(findings)) {
      problems.push({ category: "missing_file", location: findings, message: "the Instance has no findings/ directory to put a Finding in", remedy: "run `aftergrid setup` to scaffold the Instance layout" });
      facts.push("findings scope: findings/ is missing");
    } else {
      facts.push(`findings scope: ${findings}`);
    }
  } catch (e) {
    problems.push({ category: e instanceof ContractError ? String((e as any).category) as Problem["category"] : "unsafe_path", location: "findings", message: (e as Error).message });
    facts.push("findings scope: refused");
  }

  // 3. The configured source carries its limits. A budget that is not written down is not a budget.
  problems.push(...sourceLimits(instance, facts));

  return { ok: problems.length === 0, instance, problems, facts };
}

/**
 * Postgres needs a statement timeout and an estimate cap; DuckDB needs `read_only: true`. These are the
 * Instance's own declarations — the adapters enforce them at execution time (docs/contracts/adapters.md).
 * Preflight checks that they are *present*, and says so in those words: it does not re-verify the enforcement.
 */
function sourceLimits(instance: Instance, facts: string[]): Problem[] {
  const connection = (instance.config as any)?.connection ?? {};
  const adapter = String(connection.adapter ?? "");
  const location = "aftergrid.yaml#/connection";
  const missing = (message: string, remedy: string): Problem[] => {
    facts.push(`source limits: missing (${adapter || "no adapter"})`);
    return [{ category: "source_limits_missing", location, message, remedy }];
  };
  if (adapter === "postgres") {
    const pg = connection.postgres ?? {};
    const gaps: string[] = [];
    if (!Number.isFinite(Number(pg.statement_timeout_ms)) || Number(pg.statement_timeout_ms) <= 0) gaps.push("statement_timeout_ms");
    if (!Number.isFinite(Number(pg.estimate_cap)) || Number(pg.estimate_cap) <= 0) gaps.push("estimate_cap");
    if (gaps.length) return missing(`connection.postgres is missing ${gaps.join(" and ")}, so an unattended run has no declared limit`, "set connection.postgres.statement_timeout_ms and estimate_cap in aftergrid.yaml");
    facts.push(`source limits: postgres statement_timeout_ms=${pg.statement_timeout_ms}, estimate_cap=${pg.estimate_cap} (declared here; enforced by the adapter)`);
    return [];
  }
  if (adapter === "duckdb") {
    if (connection.duckdb?.read_only !== true) return missing("connection.duckdb.read_only is not true, so an unattended run is not declared read-only", "set connection.duckdb.read_only: true in aftergrid.yaml");
    facts.push("source limits: duckdb read_only=true (declared here; enforced by the adapter)");
    return [];
  }
  return missing(`connection.adapter is '${adapter || "unset"}', which has no declared limits for an unattended run`, "set connection.adapter to duckdb or postgres with its limits, as docs/contracts/instance-layout.md shows");
}
