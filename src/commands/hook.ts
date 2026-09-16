// `aftergrid hook install|uninstall|status`: the Claude Code PreToolUse guard, installed in code rather than
// described in prose (ADR 0006). Settings are merged, never rewritten: other hooks and unrelated settings survive
// install and uninstall, and a repeated install adds no second entry.
// The guard itself and its explicit non-coverage: hooks/claude-code/aftergrid-guard.mjs, docs/contracts/hook.md.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { emptyReport, type Report } from "../report.ts";

export const GUARD_PATH = resolve(fileURLToPath(new URL("../../hooks/claude-code/aftergrid-guard.mjs", import.meta.url)));
const SUFFIX = "hooks/claude-code/aftergrid-guard.mjs";
const shellQuote = (p: string) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(p) ? p : `"${p.replace(/(["\\$`])/g, "\\$1")}"`);
/** The exact command `status` looks for. */
export const HOOK_COMMAND = `node ${shellQuote(GUARD_PATH)}`;

export type HookAction = "install" | "uninstall" | "status";
export type HookOptions = { action: HookAction; settingsPath?: string; cwd?: string };

type HookEntry = { type?: string; command?: string; [k: string]: unknown };
type MatcherGroup = { matcher?: string; hooks?: HookEntry[]; [k: string]: unknown };

const isOurs = (e: HookEntry) => typeof e?.command === "string" && e.command.includes(SUFFIX);
const defaultSettings = (cwd: string) => join(cwd, ".claude", "settings.json");

export function hook(opts: HookOptions): Report {
  const report = emptyReport("hook");
  const cwd = resolve(opts.cwd ?? process.cwd());
  const settingsPath = resolve(opts.settingsPath ?? defaultSettings(cwd));
  report.readiness = "unknown";
  report.readiness_reasons.push("publication readiness is a fact about a Finding, not about the hook command");
  report.content = "complete";

  let settings: Record<string, unknown> = {};
  const existed = existsSync(settingsPath);
  if (existed) {
    try {
      const parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("settings.json is not a JSON object");
      settings = parsed as Record<string, unknown>;
    } catch (e) {
      report.errors.push({ category: "invalid_artifact", location: settingsPath, message: (e as Error).message, remedy: "fix the file by hand; nothing was written, so no other settings were lost" });
      report.syntax = "invalid";
      return report;
    }
  }
  const groups = ((settings.hooks as any)?.PreToolUse ?? []) as MatcherGroup[];
  const present = groups.some((g) => (g.hooks ?? []).some((e) => e.command === HOOK_COMMAND));
  const otherPath = groups.flatMap((g) => g.hooks ?? []).filter((e) => isOurs(e) && e.command !== HOOK_COMMAND).map((e) => String(e.command));

  if (opts.action === "status") {
    report.state = present ? "installed" : "not_installed";
    report.info.push(existed ? `settings: ${settingsPath}` : `settings: ${settingsPath} (does not exist)`);
    if (present) report.info.push(`PreToolUse guard present: ${HOOK_COMMAND}`);
    else {
      report.warnings.push({ category: "hook_not_installed", location: settingsPath, message: `the aftergrid guard command is not in hooks.PreToolUse`, remedy: "run `aftergrid hook install`" });
    }
    for (const c of otherPath) report.warnings.push({ category: "hook_not_installed", location: settingsPath, message: `another aftergrid guard path is installed: ${c}`, remedy: "run `aftergrid hook install` to point it at this Engine checkout" });
    selfTest(report, cwd);
    return report;
  }

  if (opts.action === "install") {
    if (!existsSync(GUARD_PATH)) {
      report.errors.push({ category: "missing_file", location: GUARD_PATH, message: "the guard script is missing from this Engine checkout", remedy: "reinstall aftergrid" });
      return report;
    }
    const hooks = (settings.hooks ??= {}) as Record<string, unknown>;
    const pre = (hooks.PreToolUse ??= []) as MatcherGroup[];
    if (!Array.isArray(pre)) {
      report.errors.push({ category: "invalid_artifact", location: settingsPath, message: "hooks.PreToolUse is not an array", remedy: "fix the file by hand; nothing was written" });
      return report;
    }
    let replaced = 0;
    for (const g of pre) for (const e of g.hooks ?? []) if (isOurs(e) && e.command !== HOOK_COMMAND) { e.command = HOOK_COMMAND; e.type = "command"; replaced++; }
    if (present || replaced) {
      report.state = "installed";
      report.info.push(replaced ? `updated ${replaced} existing aftergrid guard entr${replaced === 1 ? "y" : "ies"} to ${HOOK_COMMAND}` : "already installed: no second entry added");
      if (replaced) writeSettings(settingsPath, settings, report);
      return report;
    }
    let group = pre.find((g) => g.matcher === "Bash");
    if (!group) { group = { matcher: "Bash", hooks: [] }; pre.push(group); }
    (group.hooks ??= []).push({ type: "command", command: HOOK_COMMAND });
    writeSettings(settingsPath, settings, report);
    if (report.errors.length) return report;
    report.state = "installed";
    report.info.push(`installed PreToolUse(Bash) -> ${HOOK_COMMAND} in ${settingsPath}`);
    report.info.push("the guard blocks writes and DDL through supported query paths; it is not a shell sandbox (docs/contracts/hook.md)");
    selfTest(report, cwd);
    return report;
  }

  // uninstall: ours only.
  let removed = 0;
  for (const g of groups) {
    const before = (g.hooks ?? []).length;
    if (g.hooks) g.hooks = g.hooks.filter((e) => !isOurs(e));
    removed += before - (g.hooks ?? []).length;
  }
  if (!removed) {
    report.state = "not_installed";
    report.info.push(`no aftergrid guard entry in ${settingsPath}; nothing removed`);
    return report;
  }
  const kept = groups.filter((g) => (g.hooks ?? []).length > 0);
  const hooksObj = (settings.hooks ?? {}) as Record<string, unknown>;
  if (kept.length) hooksObj.PreToolUse = kept;
  else delete hooksObj.PreToolUse;
  if (Object.keys(hooksObj).length === 0) delete settings.hooks;
  writeSettings(settingsPath, settings, report);
  if (report.errors.length) return report;
  report.state = "not_installed";
  report.info.push(`removed ${removed} aftergrid guard entr${removed === 1 ? "y" : "ies"} from ${settingsPath}; every other hook and setting was left as it was`);
  return report;
}

function writeSettings(path: string, settings: unknown, report: Report) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
  } catch (e) {
    report.errors.push({ category: "invalid_artifact", location: path, message: `could not write settings: ${(e as Error).message}`, remedy: "check the path and permissions" });
  }
}

/** Pipe a known-bad and a known-good command through the guard. Installed is not the same fact as working. */
export function selfTest(report: Report, cwd: string) {
  const run = (command: string) => spawnSync(process.execPath, [GUARD_PATH], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd }), encoding: "utf8", timeout: 15000,
  });
  const bad = `psql -c "drop table users"`, good = `psql -c "select 1"`;
  const rb = run(bad), rg = run(good);
  if (rb.error || rb.status !== 2) {
    report.errors.push({ category: "hook_self_test_failed", location: GUARD_PATH, message: `the guard did not block \`${bad}\` (exit ${rb.status ?? "none"}${rb.error ? `, ${rb.error.message}` : ""})`, remedy: "the guard is not enforcing; do not run unattended intake until it does" });
  } else {
    report.info.push(`self-test: \`${bad}\` blocked (exit 2), reason on stderr`);
  }
  if (rg.error || rg.status !== 0) {
    report.errors.push({ category: "hook_self_test_failed", location: GUARD_PATH, message: `the guard blocked the read \`${good}\` (exit ${rg.status ?? "none"})`, remedy: "reads must pass; report this as an Engine bug" });
  } else {
    report.info.push(`self-test: \`${good}\` allowed (exit 0)`);
  }
}
