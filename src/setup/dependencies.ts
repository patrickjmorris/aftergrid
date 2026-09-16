// Hard dependency checks. Each one answers a single question with `present`, `missing` or `unknown`, and a
// missing one carries the exact line that fixes it. `unknown` is a real answer: a check that could not run says
// so rather than guessing, and nothing is reported as installed that was not actually found.
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { findBinary } from "../adapters/postgres.ts";

export type DependencyStatus = "present" | "missing" | "unknown";
export type DependencyResult = {
  id: "node" | "mattpocock_skills" | "duckdb_binding" | "postgres_runtime";
  status: DependencyStatus;
  /** What was actually looked for and what was found. Never a claim beyond that. */
  detail: string;
  remedy?: string;
  /** A hard dependency's absence is an error in the report; a soft one is a warning. */
  hard: boolean;
};

/** The two install routes mattpocock-skills documents. Either one satisfies the dependency. */
export const SKILLS_INSTALL_LINE = "claude plugins install mattpocock-skills";
export const SKILLS_INSTALL_ALT = "npx skills@latest add mattpocock/skills";
const SKILLS_REMEDY = `install the skills bundle: \`${SKILLS_INSTALL_LINE}\` (Claude Code plugin), or \`${SKILLS_INSTALL_ALT}\` (copies editable files into the project). Either route provides \`grilling\` and \`writing-for-agents\`; installing both leaves every skill twice.`;

/** Node 22.18+ or 24+: the lines where TypeScript type stripping is on by default and aftergrid is tested. */
export function checkNodeVersion(version: string = process.versions.node): DependencyResult {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  const remedy = "install Node 22.18 or newer on the 22 line, or Node 24 or newer (nvm: `nvm install 24`)";
  if (!m) return { id: "node", status: "unknown", detail: `could not parse the Node version string '${version}'`, remedy, hard: true };
  const [major, minor] = [Number(m[1]), Number(m[2])];
  if (major >= 24 || (major === 22 && minor >= 18)) {
    return { id: "node", status: "present", detail: `Node ${version} (type stripping is on by default here)`, hard: true };
  }
  if (major === 23) {
    return { id: "node", status: "unknown", detail: `Node ${version}: the 23 line is not one aftergrid is tested on. Type stripping arrived in 23.6, so this may work, but nothing here has verified it.`, remedy, hard: true };
  }
  return { id: "node", status: "missing", detail: `Node ${version} is older than 22.18; TypeScript type stripping is not on by default, so the CLI will not start`, remedy, hard: true };
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".pnpm", "dist", "build", "coverage", ".cache"]);
const WANTED = ["grilling", "writing-for-agents"];

/** Where a Claude Code plugin or a skills.sh install puts skill directories. Env override for CI and for tests. */
export function defaultSkillsSearchPaths(cwd: string = process.cwd(), env: Record<string, string | undefined> = process.env, home: string = homedir()): string[] {
  const fromEnv = env.AFTERGRID_SKILLS_PATH;
  if (fromEnv) return fromEnv.split(delimiter).filter(Boolean).map((p) => resolve(p));
  return [
    join(cwd, ".claude", "skills"),
    join(cwd, ".claude", "plugins"),
    join(home, ".claude", "skills"),
    join(home, ".claude", "plugins"),
  ];
}

/**
 * Look for a directory named `grilling` and one named `writing-for-agents` under the search roots. Both must be
 * found: the hard dependency is those two skills, not a package name. The walk is bounded in depth and in the
 * number of directories it visits, and it never follows a symlink, so a deep home directory cannot hang setup.
 */
export function findSkillsBundle(searchPaths: string[], opts: { maxDepth?: number; maxDirs?: number } = {}): DependencyResult {
  const maxDepth = opts.maxDepth ?? 8;
  const maxDirs = opts.maxDirs ?? 6000;
  const found = new Map<string, string>();
  let visited = 0;
  let truncated = false;

  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth || found.size === WANTED.length) return;
    if (visited >= maxDirs) { truncated = true; return; }
    visited++;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || e.isSymbolicLink() || e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const child = join(dir, e.name);
      if (WANTED.includes(e.name) && existsSync(join(child, "SKILL.md")) && !found.has(e.name)) found.set(e.name, child);
      walk(child, depth + 1);
      if (found.size === WANTED.length) return;
    }
  };

  const roots = searchPaths.filter((p) => { try { return statSync(p).isDirectory(); } catch { return false; } });
  for (const root of roots) { walk(root, 0); if (found.size === WANTED.length) break; }

  const where = searchPaths.length ? searchPaths.join(", ") : "(no search path given)";
  if (found.size === WANTED.length) {
    return { id: "mattpocock_skills", status: "present", detail: `found ${WANTED.map((w) => `${w} (${found.get(w)})`).join(" and ")}`, hard: true };
  }
  const missing = WANTED.filter((w) => !found.has(w));
  const searched = roots.length ? `searched ${roots.join(", ")}` : `none of these directories exist: ${where}`;
  const cut = truncated ? `; the walk stopped after ${maxDirs} directories, so this is "not found here", not "not installed anywhere"` : "";
  if (truncated) {
    return { id: "mattpocock_skills", status: "unknown", detail: `${missing.join(" and ")} not found: ${searched}${cut}`, remedy: `${SKILLS_REMEDY} If it is already installed elsewhere, point AFTERGRID_SKILLS_PATH at it.`, hard: true };
  }
  return { id: "mattpocock_skills", status: "missing", detail: `${missing.join(" and ")} not found: ${searched}. /grill-question depends on grilling and writing-for-agents.`, remedy: `${SKILLS_REMEDY} If it is installed somewhere else, point AFTERGRID_SKILLS_PATH at it.`, hard: true };
}

/** The prebuilt DuckDB binding, which is what makes "no native compiler" true. Importable or it is not there. */
export async function checkDuckDbBinding(): Promise<DependencyResult> {
  try {
    const m: any = await import("@duckdb/node-api");
    const version = typeof m?.DuckDBInstance === "function" ? "prebuilt binding imported" : "imported, but DuckDBInstance is missing";
    return { id: "duckdb_binding", status: m?.DuckDBInstance ? "present" : "missing", detail: `@duckdb/node-api: ${version}`, remedy: m?.DuckDBInstance ? undefined : "reinstall dependencies (`pnpm install`); the package is present but does not expose DuckDBInstance", hard: true };
  } catch (e) {
    return {
      id: "duckdb_binding", status: "missing",
      detail: `@duckdb/node-api could not be imported: ${String((e as Error).message ?? e).split("\n")[0]}`,
      remedy: "run `pnpm install` in the Engine checkout. DuckDB ships prebuilt binaries for the supported platforms; no native compiler is needed.",
      hard: true,
    };
  }
}

/**
 * `initdb` and `pg_ctl`, which a Postgres rerun provisions its disposable instance with. Their absence is not a
 * setup failure: it means SQL rerun is unavailable here while saved-result artifact replay still works.
 */
export function checkPostgresRuntime(): DependencyResult {
  const initdb = findBinary("initdb");
  const pgCtl = findBinary("pg_ctl");
  if (initdb && pgCtl) return { id: "postgres_runtime", status: "present", detail: `initdb (${initdb}) and pg_ctl (${pgCtl}) are on PATH; a rerun can provision its disposable instance`, hard: false };
  const absent = [initdb ? null : "initdb", pgCtl ? null : "pg_ctl"].filter(Boolean).join(" and ");
  return {
    id: "postgres_runtime", status: "missing",
    detail: `${absent} not found on PATH or AFTERGRID_PG_BINDIR: rerun unavailable, artifact replay available (\`aftergrid check --mode artifact\`). A rerun never falls back to the live source.`,
    remedy: "install a local PostgreSQL (macOS: `brew install postgresql@16`), or set AFTERGRID_PG_BINDIR to the directory holding initdb and pg_ctl",
    hard: false,
  };
}

export const describeDependency = (d: DependencyResult): string =>
  `dependency ${d.id}: ${d.status} — ${d.detail}`;
