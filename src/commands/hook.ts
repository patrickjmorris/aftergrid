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

const kindOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "a JSON array" : typeof v === "object" ? "an object" : `a JSON ${typeof v}`);
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Claude Code runs a `PreToolUse` group only when its matcher matches the tool name, so an entry under a matcher
 * that never matches `Bash` is not an installed guard however present it looks.
 */
export function matchesBash(matcher: unknown): boolean {
  if (matcher === undefined || matcher === null || matcher === "" || matcher === "*") return true;
  if (typeof matcher !== "string") return false;
  if (matcher === "Bash") return true;
  try { return new RegExp(`^(?:${matcher})$`).test("Bash"); } catch { return false; }
}

/**
 * Settings that parse as JSON can still be shaped in a way no code here can walk. Every shape is checked once, up
 * front, for every action: the alternative is an uncaught TypeError out of `hook()` instead of the `invalid_artifact`
 * report the contract promises, and (for `hooks: []`) a reported success that writes nothing.
 */
function shapeProblem(settings: Record<string, unknown>): string | null {
  const hooks = settings.hooks;
  if (hooks === undefined) return null;
  if (!isPlainObject(hooks)) return `hooks is ${kindOf(hooks)}, not an object`;
  const pre = hooks.PreToolUse;
  if (pre === undefined) return null;
  if (!Array.isArray(pre)) return `hooks.PreToolUse is ${kindOf(pre)}, not an array`;
  for (const [i, g] of pre.entries()) {
    if (!isPlainObject(g)) return `hooks.PreToolUse[${i}] is ${kindOf(g)}, not an object`;
    const entries = (g as MatcherGroup).hooks;
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) return `hooks.PreToolUse[${i}].hooks is ${kindOf(entries)}, not an array`;
    for (const [j, e] of entries.entries()) if (!isPlainObject(e)) return `hooks.PreToolUse[${i}].hooks[${j}] is ${kindOf(e)}, not an object`;
  }
  return null;
}

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
  const problem = shapeProblem(settings);
  if (problem) {
    report.errors.push({ category: "invalid_artifact", location: settingsPath, message: problem, remedy: "fix the file by hand; nothing was written, so no other settings were lost" });
    report.syntax = "invalid";
    return report;
  }

  const groups = ((settings.hooks as any)?.PreToolUse ?? []) as MatcherGroup[];
  // Presence under a matcher that never matches Bash is not presence: the guard would never run for a Bash call.
  const present = groups.some((g) => matchesBash(g.matcher) && (g.hooks ?? []).some((e) => e.command === HOOK_COMMAND));
  const otherPath = groups.filter((g) => matchesBash(g.matcher)).flatMap((g) => g.hooks ?? []).filter((e) => isOurs(e) && e.command !== HOOK_COMMAND).map((e) => String(e.command));
  const inactiveMatchers = groups.filter((g) => !matchesBash(g.matcher) && (g.hooks ?? []).some(isOurs)).map((g) => String(g.matcher));
  const inactiveWarning = (path: string) => {
    for (const m of inactiveMatchers) {
      report.warnings.push({
        category: "hook_not_installed", location: path,
        message: `an aftergrid guard entry sits under matcher '${m}', which does not match Bash; Claude Code never runs it before a Bash call`,
        remedy: "leave it or remove it, but do not read it as the Bash guard; `aftergrid hook install` adds the matcher 'Bash' entry that is actually run",
      });
    }
  };

  if (opts.action === "status") {
    report.state = present ? "installed" : "not_installed";
    report.info.push(existed ? `settings: ${settingsPath}` : `settings: ${settingsPath} (does not exist)`);
    if (present) report.info.push(`PreToolUse guard present: ${HOOK_COMMAND}`);
    else {
      report.warnings.push({ category: "hook_not_installed", location: settingsPath, message: `the aftergrid guard command is not in a hooks.PreToolUse group that matches Bash`, remedy: "run `aftergrid hook install`" });
    }
    for (const c of otherPath) report.warnings.push({ category: "hook_not_installed", location: settingsPath, message: `another aftergrid guard path is installed: ${c}`, remedy: "run `aftergrid hook install` to point it at this Engine checkout" });
    inactiveWarning(settingsPath);
    selfTest(report, cwd);
    return report;
  }

  if (opts.action === "install") {
    if (!existsSync(GUARD_PATH)) {
      report.errors.push({ category: "missing_file", location: GUARD_PATH, message: "the guard script is missing from this Engine checkout", remedy: "reinstall aftergrid" });
      return report;
    }
    // shapeProblem has already established that hooks is an object and PreToolUse, if present, is an array of
    // groups: `??=` here can only create them, never keep a value JSON.stringify would silently drop.
    const hooks = (settings.hooks ??= {}) as Record<string, unknown>;
    const pre = (hooks.PreToolUse ??= []) as MatcherGroup[];
    let active = 0, inactive = 0;
    for (const g of pre) for (const e of g.hooks ?? []) if (isOurs(e) && e.command !== HOOK_COMMAND) { e.command = HOOK_COMMAND; e.type = "command"; matchesBash(g.matcher) ? active++ : inactive++; }
    if (present || active) {
      report.state = "installed";
      report.info.push(active ? `updated ${active} existing aftergrid guard entr${active === 1 ? "y" : "ies"} to ${HOOK_COMMAND}` : "already installed: no second entry added");
      if (active || inactive) writeSettings(settingsPath, settings, report);
      inactiveWarning(settingsPath);
      return report;
    }
    let group = pre.find((g) => g.matcher === "Bash");
    if (!group) { group = { matcher: "Bash", hooks: [] }; pre.push(group); }
    (group.hooks ??= []).push({ type: "command", command: HOOK_COMMAND });
    writeSettings(settingsPath, settings, report);
    if (report.errors.length) return report;
    report.state = "installed";
    inactiveWarning(settingsPath);
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
