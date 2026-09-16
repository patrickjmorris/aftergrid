#!/usr/bin/env node
// aftergrid Claude Code PreToolUse guard. ADR 0006: a rule with no enforcement is not a rule, so the
// supported-query-path rules live here in code. Contract, supported-path table and the explicit list of what
// this hook does NOT cover: docs/contracts/hook.md.
//
// stdin  {"tool_name":"Bash","tool_input":{"command":"..."},"cwd":"/abs"}
// block  exit 2, a human reason then one machine-readable JSON line on stderr (Claude Code reads stderr).
// allow  exit 0, silent unless the command is one the hook could not inspect (or --explain is passed).
//
// No dependencies beyond node: builtins and scripts/fixture-safety.mjs. No network, no SQL execution, no writes.
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Shared path containment: every path derived from a config goes through safePath.
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";

export const NOT_COVERED = [
  "the hook is not a shell sandbox; source permissions and runtime isolation remain the boundary",
  "HTTP query APIs (curl/wget to a warehouse endpoint), database client libraries inside scripts, interactive sessions and remote shells are not inspected",
  "shell parameter expansion (`$VAR`, `${VAR}`) is not resolved; SQL that depends on it is reported `uninspected`, never as checked",
  "cost and scan budgets are the adapter's job (docs/contracts/adapters.md), never this hook's",
];

// ---------------------------------------------------------------- policy

/** Minimal reader for the aftergrid.yaml subset this hook needs. Anything it cannot parse stays undefined,
 *  and an undefined target field is treated as "the configured source" (fail closed). */
export function readMiniYaml(text) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  for (const raw of String(text).split("\n")) {
    if (!raw.trim() || /^\s*#/.test(raw) || /^\s*-/.test(raw)) continue;
    const m = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(raw);
    if (!m) continue;
    const indent = m[1].length, key = m[2];
    const value = m[3].replace(/\s+#.*$/, "").trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    if (value === "") { const node = {}; parent[key] = node; stack.push({ indent, node }); continue; }
    if (/^\[.*\]$/.test(value)) { parent[key] = value.slice(1, -1).split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean); continue; }
    if (/^\{.*\}$/.test(value)) {
      const node = {};
      for (const pair of value.slice(1, -1).split(",")) { const kv = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*?)\s*$/.exec(pair); if (kv) node[kv[1]] = kv[2].replace(/^['"]|['"]$/g, ""); }
      parent[key] = node; continue;
    }
    parent[key] = value.replace(/^['"]|['"]$/g, "");
  }
  return root;
}

const realOrResolve = (p) => {
  const abs = resolve(p);
  try { return realpathSync(abs); } catch { try { return join(realpathSync(dirname(abs)), basename(abs)); } catch { return abs; } }
};

/** Walk up from cwd for the Instance policy: `aftergrid.yaml`, or `analytics/aftergrid.yaml`, at each ancestor. */
export function loadPolicy(cwd, env = process.env) {
  let cur = resolve(cwd || ".");
  for (let i = 0; i < 12; i++) {
    for (const rel of ["aftergrid.yaml", join("analytics", "aftergrid.yaml")]) {
      const p = join(cur, rel);
      if (existsSync(p)) return policyFrom(p, env);
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return { found: false, notes: ["no aftergrid.yaml above the working directory: only the built-in destructive-source-command list applies, and no source is recognised as configured"] };
}

function policyFrom(configPath, env) {
  const root = dirname(configPath);
  const notes = [];
  let config = {};
  try { config = readMiniYaml(readFileSync(configPath, "utf8")); }
  catch (e) { notes.push(`aftergrid.yaml at ${configPath} could not be read (${e.message}); every source is treated as configured`); }
  const conn = config.connection || {};
  const policy = { found: true, path: configPath, root, adapter: typeof conn.adapter === "string" ? conn.adapter : undefined, notes };
  const declared = conn.duckdb && conn.duckdb.path;
  if (typeof declared === "string") {
    try { policy.duckdb = realOrResolve(safePath(root, declared)); }
    catch (e) {
      if (isAbsolute(declared)) { policy.duckdb = realOrResolve(declared); notes.push("connection.duckdb.path is absolute; it is used as given and is not contained by the Instance root"); }
      else { notes.push(`connection.duckdb.path is not a safe relative path (${e instanceof ContractError ? e.message : String(e)}); every duckdb file is treated as the configured source`); policy.duckdbUnknown = true; }
    }
  }
  const pg = conn.postgres || {};
  policy.postgres = { host: pg.host, database: pg.database, port: pg.port };
  if (typeof pg.url_env === "string" && env[pg.url_env]) {
    try {
      const u = new URL(env[pg.url_env]);
      policy.postgres.host = policy.postgres.host || u.hostname || undefined;
      policy.postgres.database = policy.postgres.database || decodeURIComponent(u.pathname.replace(/^\//, "")) || undefined;
      policy.postgres.port = policy.postgres.port || u.port || undefined;
    } catch { notes.push(`${pg.url_env} is set but is not a URL; the configured Postgres target stays unknown`); }
  }
  try { policy.findings = safePath(root, "findings"); } catch { /* an Instance with no findings directory yet is still a policy */ }
  return policy;
}

// ---------------------------------------------------------------- shell parsing (best effort, fails closed)

/** A substitution leaves this mark where its output would be. It survives tokenizing and quote stripping, so a
 *  stage can tell that part of its SQL came from a command whose output the hook cannot read — even when literal
 *  SQL surrounds it. Never a word separator, never a quote, never something SQL or a path can contain. */
export const SUBSTITUTION_MARK = "agsub";
export const hasSubstitutionMark = (text) => String(text ?? "").includes(SUBSTITUTION_MARK);
/** Marks are internal; a verdict shows the human form instead. */
export const display = (text) => String(text ?? "").replaceAll(SUBSTITUTION_MARK, "$(…)");

/** Pull `$( ... )` and backtick substitutions out so their contents are inspected as commands of their own, and
 *  leave a mark in their place so the surrounding text is never mistaken for the whole command. */
export function extractSubstitutions(src) {
  const inner = [];
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\\") { out += ch + (src[i + 1] ?? ""); i++; continue; }
    if (ch === "$" && src[i + 1] === "(") {
      let depth = 1, j = i + 2, body = "";
      while (j < src.length) { if (src[j] === "(") depth++; else if (src[j] === ")" && !--depth) break; body += src[j]; j++; }
      inner.push(body); out += SUBSTITUTION_MARK; i = j; continue;
    }
    if (ch === "`") { let j = i + 1, body = ""; while (j < src.length && src[j] !== "`") body += src[j++]; inner.push(body); out += SUBSTITUTION_MARK; i = j; continue; }
    out += ch;
  }
  return { outer: out, inner };
}

/** Split one command string into stages. Stages sharing a `pipeline` number are joined by `|`. Heredoc bodies
 *  are lifted out and attached to the stage that opened them. */
export function splitStages(command) {
  const stages = [];
  let src = String(command), i = 0, quote = null, pipeline = 0;
  let cur = { text: "", heredocs: [], pipeline };
  const push = () => { if (cur.text.trim() || cur.heredocs.length) stages.push(cur); cur = { text: "", heredocs: [], pipeline }; };
  while (i < src.length) {
    const ch = src[i];
    if (quote) { if (ch === "\\" && quote === '"') { cur.text += ch + (src[i + 1] ?? ""); i += 2; continue; } if (ch === quote) quote = null; cur.text += ch; i++; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur.text += ch; i++; continue; }
    if (ch === "\\") { cur.text += ch + (src[i + 1] ?? ""); i += 2; continue; }
    if (ch === "<" && src[i + 1] === "<" && src[i + 2] !== "<") {
      let j = i + 2;
      if (src[j] === "-") j++;
      while (src[j] === " " || src[j] === "\t") j++;
      const q = src[j] === "'" || src[j] === '"' ? src[j++] : null;
      let delim = "";
      while (j < src.length && (q ? src[j] !== q : /[A-Za-z0-9_.]/.test(src[j]))) delim += src[j++];
      if (q) j++;
      const nl = src.indexOf("\n", j);
      if (delim && nl !== -1) {
        const rest = src.slice(nl + 1), lines = rest.split("\n"), body = [];
        let consumed = 0, closed = false;
        for (const line of lines) { consumed += line.length + 1; if (line.trim() === delim) { closed = true; break; } body.push(line); }
        cur.heredocs.push(body.join("\n"));
        cur.text += " ";
        src = src.slice(j, nl) + "\n" + (closed ? rest.slice(consumed) : "");
        i = 0; continue;
      }
    }
    if (ch === "\n" || ch === ";") { push(); cur.pipeline = ++pipeline; i++; continue; }
    if ((ch === "&" && src[i + 1] === "&") || (ch === "|" && src[i + 1] === "|")) { push(); cur.pipeline = ++pipeline; i += 2; continue; }
    if (ch === "|") { push(); i++; continue; }
    if (ch === "&") { push(); cur.pipeline = ++pipeline; i++; continue; }
    if (ch === "(" || ch === ")" || ch === "{" || ch === "}") { push(); cur.pipeline = ++pipeline; i++; continue; }
    cur.text += ch; i++;
  }
  push();
  return stages;
}

const WRAPPERS = new Set(["env", "sudo", "command", "exec", "nohup", "time", "nice"]);

/** Words of one stage, quotes removed, leading env assignments and wrappers stripped. A redirection is removed
 *  operator *and* operand: dropping only the operator would leave the file name standing where a positional
 *  argument is read (`psql -d analytics -c "drop …" > out.txt` once parsed `out.txt` as the database). Input
 *  redirections are not thrown away: `< file` names SQL the stage will execute, and `<<<text` is that SQL. */
export function tokenize(text) {
  const words = [];
  const stdinFiles = [], hereStrings = [];
  let w = "", has = false, quote = null;
  const flush = () => { if (has) words.push(w); w = ""; has = false; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === "\\" && quote === '"') { w += text[++i] ?? ""; continue; } if (ch === quote) { quote = null; continue; } w += ch; has = true; continue; }
    if (ch === "'" || ch === '"') { quote = ch; has = true; continue; }
    if (ch === "\\") { w += text[++i] ?? ""; has = true; continue; }
    if (/\s/.test(ch)) { flush(); continue; }
    if (ch === ">" || ch === "<") {
      // `2>err.log` and `2>&1`: the bare file-descriptor number belongs to the redirection, not to the command.
      if (has && /^\d+$/.test(w)) { w = ""; has = false; } else flush();
      let op = "";
      while (i < text.length && (text[i] === ">" || text[i] === "<" || text[i] === "&")) op += text[i++];
      while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
      let operand = "", q = null, saw = false;
      for (; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === "\\" && q === '"') { operand += text[++i] ?? ""; continue; } if (c === q) { q = null; continue; } operand += c; saw = true; continue; }
        if (c === "'" || c === '"') { q = c; saw = true; continue; }
        if (c === "\\") { operand += text[++i] ?? ""; saw = true; continue; }
        if (/\s/.test(c)) break;
        operand += c; saw = true;
      }
      i--;
      if (saw && !op.includes("&")) { if (op === "<<<") hereStrings.push(operand); else if (op === "<") stdinFiles.push(operand); }
      continue;
    }
    w += ch; has = true;
  }
  flush();
  while (words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]) || WRAPPERS.has(basename(words[0])))) words.shift();
  return { words, stdinFiles, hereStrings };
}

// ---------------------------------------------------------------- SQL inspection

/** Comments out, and (for authored SQL) string literals out so `select 'delete me'` is not a write. */
export function normalizeSql(sql, { stripStrings = true } = {}) {
  let t = String(sql).replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  if (stripStrings) t = t.replace(/\$\$[\s\S]*?\$\$/g, " '' ").replace(/'(?:''|[^'])*'/g, " '' ").replace(/"(?:""|[^"])*"/g, ' "" ');
  return t.toLowerCase();
}

const WRITE_OPS = [
  ["create", /\bcreate\b/], ["alter", /\balter\b/], ["drop", /\bdrop\b/], ["insert", /\binsert\b/],
  ["update", /\bupdate\b/], ["delete", /\bdelete\b/], ["truncate", /\btruncate\b/], ["grant", /\bgrant\b/],
  ["revoke", /\brevoke\b/], ["merge", /\bmerge\s+into\b/], ["vacuum", /\bvacuum\b/], ["reindex", /\breindex\b/],
  ["copy", /\bcopy\b[\s\S]{0,4000}?\b(?:to|from)\b/],
];
// ATTACH/INSTALL/LOAD take execution outside the sealed sandbox in scripts/lib/sql-runner.mjs. Only a
// statement-initial match counts, so a column aliased `load` is not mistaken for one.
const ENGINE_OPS = [["attach", /(?:^|;)\s*attach\b/], ["install", /(?:^|;)\s*install\b/], ["load", /(?:^|;)\s*load\b/]];
const DB_CONTEXT = /\b(?:sql|query|duckdb|pg|pool|postgres|psql|database|connection|client|execute|prepare|from|into|table)\b/;

export function findOperations(sql, opts) {
  const t = normalizeSql(sql, opts);
  const write = WRITE_OPS.filter(([, re]) => re.test(t)).map(([name]) => name);
  const engine = ENGINE_OPS.filter(([, re]) => re.test(t)).map(([name]) => name);
  return { write, engine, all: [...write, ...engine] };
}
export const looksLikeSql = (text) => DB_CONTEXT.test(String(text).toLowerCase());

// ---------------------------------------------------------------- stage classification

const verdict = (decision, rule, extra) => ({ version: 1, decision, rule, not_covered: NOT_COVERED, ...extra });
const PRIORITY = ["not_a_bash_command", "not_a_query_path", "local_artifact", "disposable_database", "query_read", "uninspected"];

/** Every occurrence, in order. psql and the duckdb CLI accept repeated `-c`/`-f` and execute all of them, so
 *  reading only the first would let a harmless opening statement hide every later one. Exact and `--flag=value`
 *  forms first; `clustered` additionally allows psql's `-cSELECT 1` short form, which must never be tried before
 *  the exact forms or `-cmd` would parse as `-c md`. */
export const flagValues = (words, names, { clustered = false } = {}) => {
  const found = [];
  const consumed = new Set();
  for (let i = 1; i < words.length; i++) {
    if (consumed.has(i)) continue;
    let matched = false;
    for (const n of names) {
      if (words[i] === n) { if (words[i + 1] !== undefined) found.push({ at: i, value: words[i + 1] }); consumed.add(i + 1); matched = true; break; }
      if (words[i].startsWith(n + "=")) { found.push({ at: i, value: words[i].slice(n.length + 1) }); matched = true; break; }
    }
    if (matched || !clustered) continue;
    for (const n of names) if (n.length === 2 && n[0] === "-" && words[i].startsWith(n) && words[i].length > 2) { found.push({ at: i, value: words[i].slice(2) }); break; }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.value);
};


const readSqlFile = (path, cwd) => {
  try {
    const abs = resolve(cwd, path);
    if (!existsSync(abs) || statSync(abs).size > 1_000_000) return null;
    return readFileSync(abs, "utf8");
  } catch { return null; }
};

const PSQL = new Set(["psql", "pgcli"]);
const UNINSPECTABLE = new Set(["curl", "wget", "http", "httpie", "nc", "ssh", "scp", "mysql", "sqlcmd", "snowsql", "bq", "clickhouse-client", "python", "python3", "ruby", "perl", "bash", "sh", "zsh", "make"]);
/** A shell given an inline command holds that command in plain sight; it is inspected as if it had been typed. */
const SHELLS = new Set(["bash", "sh", "zsh", "ksh", "dash"]);
/** Interpreters whose inline snippet is inspected the way `node -e` is. A script *file* is still not read. */
const INLINE_LANGS = new Map([["python", ["-c"]], ["python3", ["-c"]], ["ruby", ["-e"]], ["perl", ["-e"]]]);
const MAX_WRAPPER_DEPTH = 3;
/** `-c`, and clustered forms such as `-lc` / `-ec`: the word after it is the command string. */
const shellInlineCommand = (words) => {
  for (let i = 1; i < words.length; i++) if (/^-[a-z]*c$/.test(words[i]) && words[i + 1] !== undefined) return words[i + 1];
  return undefined;
};
const PROVISIONING = new Set(["initdb", "pg_ctl", "pg_ctlcluster", "pg_tmp", "createdb", "dropdb", "docker", "podman", "docker-compose"]);
const LOCAL_TOOLS = new Set(["mkdir", "cp", "mv", "touch", "ls", "cat", "rm", "rmdir", "tee", "sed", "awk", "grep", "git", "pnpm", "npm", "npx", "yarn", "jq", "diff", "head", "tail", "wc", "find", "chmod", "echo", "printf", "aftergrid"]);
const DUCK_FLAGS_WITH_VALUE = new Set(["-c", "-cmd", "-s", "-f", "-init", "-separator", "-newline", "-nullvalue"]);

/** Postgres target a psql/pgcli stage will connect to. `explicit` is false when it relies on the environment. */
export function psqlTarget(words, env) {
  const t = { host: env.PGHOST, database: env.PGDATABASE, port: env.PGPORT, explicit: false };
  const consumed = new Set();
  for (let i = 1; i < words.length; i++) {
    if (consumed.has(i)) continue;
    const w = words[i];
    const take = (names, key) => {
      for (const n of names) {
        if (w === n) { t[key] = words[i + 1]; consumed.add(i + 1); t.explicit = true; return true; }
        if (w.startsWith(n + "=")) { t[key] = w.slice(n.length + 1); t.explicit = true; return true; }
        if (!n.startsWith("--") && w.startsWith(n) && w.length > 2) { t[key] = w.slice(2); t.explicit = true; return true; }
      }
      return false;
    };
    if (take(["-h", "--host"], "host") || take(["-d", "--dbname"], "database") || take(["-p", "--port"], "port")) continue;
    if (["-c", "--command", "-f", "--file", "-U", "--username", "-v", "--set", "--variable", "-o", "--output", "-L", "--log-file"].includes(w)) { consumed.add(i + 1); continue; }
    if (w.startsWith("-")) continue;
    if (/^postgres(?:ql)?:\/\//.test(w)) {
      try { const u = new URL(w); t.host = u.hostname || t.host; t.database = decodeURIComponent(u.pathname.replace(/^\//, "")) || t.database; t.port = u.port || t.port; t.explicit = true; } catch { /* unparsed: the target stays as it was */ }
      continue;
    }
    if (t.databaseFromPositional === undefined) { t.database = w; t.databaseFromPositional = true; t.explicit = true; }
  }
  return t;
}

/** A token the hook cannot resolve to a literal: `$DB`, `${WAREHOUSE}`, `~user`, or the output of a substitution.
 *  It is never equal to the configured value, so treating it as a different target would fail *open*. */
export const unresolvedToken = (text) =>
  typeof text === "string" && (hasSubstitutionMark(text) || /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/.test(text) || /^~/.test(text));

/** configured | other | unknown. An unknown, unresolvable or environment-default target counts as not ruled out:
 *  fail closed. Only a target the hook read literally and that differs from the configured one is `other`. */
export function matchPostgres(target, policy) {
  if (!policy.found || !policy.postgres) return "unknown";
  const { host, database } = policy.postgres;
  if (!host && !database) return "unknown";
  if (!target.explicit) return "configured";
  if (unresolvedToken(target.host) || unresolvedToken(target.database)) return "unknown";
  if (host && target.host && target.host !== host) return "other";
  if (database && target.database && target.database !== database) return "other";
  return "configured";
}

export function matchDuckdb(path, cwd, policy) {
  if (!policy.found) return "unknown";
  if (policy.duckdbUnknown) return "configured";
  if (!policy.duckdb) return "unknown";
  if (!path) return "other"; // no file argument: an in-memory database is not the configured source
  if (unresolvedToken(path)) return "unknown"; // a path the hook cannot resolve is not a path it can rule out
  const abs = realOrResolve(resolve(cwd, path));
  return abs === policy.duckdb || abs.startsWith(policy.duckdb + "/") ? "configured" : "other";
}

function duckdbPositionals(words) {
  const out = [];
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (DUCK_FLAGS_WITH_VALUE.has(w)) { i++; continue; }
    if (w.startsWith("-")) continue;
    out.push(w);
  }
  return out;
}

function classifyStage(stage, ctx) {
  const words = stage.words;
  if (!words.length) return verdict("allow", "not_a_query_path", { message: "no command to inspect" });
  const prog = basename(words[0]);
  const { policy, cwd, env } = ctx;

  // Controlled disposable-database provisioning is explicitly not agent-issued SQL against a source (spec: Adapters).
  if (PROVISIONING.has(prog)) {
    if (prog === "docker" || prog === "podman" || prog === "docker-compose") {
      if (words.slice(1).some((w) => ["run", "compose", "up", "start", "stop", "rm", "create"].includes(w))) {
        return verdict("allow", "disposable_database", { tool: prog, uninspected: true, message: "container lifecycle for a throwaway database is allowed; the hook does not inspect what runs inside the container" });
      }
      return verdict("allow", "uninspected", { tool: prog, uninspected: true, message: "container command the hook does not inspect" });
    }
    return verdict("allow", "disposable_database", { tool: prog, message: `${prog} provisions a disposable database; it is not agent-issued SQL against the configured source` });
  }

  if (PSQL.has(prog)) {
    const target = psqlTarget(words, env);
    return classifySql(stage, ctx, { tool: prog, target: matchPostgres(target, policy), source: display(`${target.host || "(default host)"}/${target.database || "(default database)"}`) });
  }
  if (prog === "duckdb") {
    const positionals = duckdbPositionals(words);
    const file = positionals[0];
    const source = !file ? ":memory:" : unresolvedToken(file) ? display(file) : resolve(cwd, file);
    return classifySql(stage, ctx, { tool: "duckdb", target: matchDuckdb(file, cwd, policy), source, extraSql: positionals.slice(1) });
  }
  if (prog === "node" || prog === "deno" || prog === "bun") {
    const scripts = flagValues(words, ["-e", "--eval", "-p", "--print"]);
    if (!scripts.length) {
      const entry = words.slice(1).find((w) => !w.startsWith("-"));
      if (entry && /(?:^|\/)cli\.ts$|(?:^|\/)aftergrid$/.test(entry)) return verdict("allow", "local_artifact", { tool: prog, message: "aftergrid CLI command: it reads and writes Finding files, and its own SQL runs in the sealed adapter sandbox" });
      return verdict("allow", "uninspected", { tool: prog, uninspected: true, message: `${prog} runs a script file whose contents the hook does not read` });
    }
    return inlineSnippet(prog, `${prog} -e`, scripts, policy);
  }
  // A shell wrapping a supported entry point (`bash -c "psql -c 'drop …'"`) is one word of indirection, not a
  // payload beyond the parser: the inner command is classified exactly as if it had been typed directly.
  if (SHELLS.has(prog)) {
    const payload = shellInlineCommand(words);
    if (payload !== undefined && (ctx.depth ?? 0) < MAX_WRAPPER_DEPTH) {
      const chosen = pickVerdict(classifyCommand(payload, { policy, cwd, env, depth: (ctx.depth ?? 0) + 1 }));
      if (chosen) return { ...chosen, wrapper: prog, notes: [...(chosen.notes ?? []), `inspected through \`${prog} -c\``] };
    }
    return verdict("allow", "uninspected", { tool: prog, uninspected: true, message: payload === undefined ? `${prog} runs a script file whose contents the hook does not read` : `${prog} nests shells deeper than the hook follows` });
  }
  if (INLINE_LANGS.has(prog)) {
    const flags = INLINE_LANGS.get(prog);
    const scripts = flagValues(words, flags);
    if (!scripts.length) return verdict("allow", "uninspected", { tool: prog, uninspected: true, message: `${prog} runs a script file whose contents the hook does not read` });
    return inlineSnippet(prog, `${prog} ${flags[0]}`, scripts, policy);
  }
  if (UNINSPECTABLE.has(prog)) return verdict("allow", "uninspected", { tool: prog, uninspected: true, message: `${prog} is not a supported query entry point and its payload is not inspected` });
  if (LOCAL_TOOLS.has(prog)) {
    const findings = policy.findings ? realOrResolve(policy.findings) : null;
    const underFindings = !!findings && words.slice(1).some((w) => !w.startsWith("-") && realOrResolve(resolve(cwd, w)).startsWith(findings));
    return verdict("allow", "local_artifact", { tool: prog, message: underFindings ? "local Finding artifact under the Instance findings directory" : "local file or repository command; it is not a source query path" });
  }
  return verdict("allow", "not_a_query_path", { tool: prog, message: `${prog} is not a supported query entry point` });
}

/** An inline interpreter snippet (`node -e`, `python3 -c`): a write keyword plus database context is a block. */
function inlineSnippet(tool, entry, scripts, policy) {
  const script = scripts.join("\n;\n");
  const ops = findOperations(script, { stripStrings: false });
  if (ops.all.length && looksLikeSql(script)) return blockSql({ tool, target: "unknown", source: "inline script", ops, policy, entry });
  if (hasSubstitutionMark(script)) return verdict("allow", "uninspected", { tool, uninspected: true, message: `${entry} snippet is partly built by a command substitution the hook cannot read` });
  return verdict("allow", "uninspected", { tool, uninspected: true, message: `${entry} snippet with no source write the hook can see` });
}

/** Shell parameter expansion: the hook holds the literal `$Q`, never what it expands to. */
const PARAMETER_EXPANSION = /\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*/;

function classifySql(stage, ctx, info) {
  const { policy, cwd } = ctx;
  const words = stage.words;
  const parts = [];
  const clustered = PSQL.has(info.tool);
  // Every -c/--command and every -f/--file: psql and duckdb run all of them, so reading only the first would let
  // an opening `select 1` hide the DDL behind it.
  for (const cmd of flagValues(words, ["-c", "--command", "-cmd", "-s"], { clustered })) parts.push(cmd);
  for (const sql of info.extraSql ?? []) parts.push(sql);
  for (const body of stage.heredocs) parts.push(body);
  for (const text of stage.hereStrings ?? []) parts.push(text);
  for (const upstream of ctx.pipedText ?? []) parts.push(upstream);
  const fileArgs = [...flagValues(words, ["-f", "--file", "-init"], { clustered }), ...(stage.stdinFiles ?? [])];
  const unreadFiles = [];
  for (const fileArg of fileArgs) {
    const text = hasSubstitutionMark(fileArg) ? null : readSqlFile(fileArg, cwd);
    if (text === null) unreadFiles.push(display(fileArg)); else parts.push(text);
  }
  // Unreadable SQL is refused, never waved through: one literal character beside a substitution does not make the
  // substitution readable, so the mark is what decides, not what is left after it.
  if ([...parts, ...fileArgs].some(hasSubstitutionMark)) {
    return verdict("block", "uninspected_sql", {
      tool: info.tool, target: info.target, source: info.source, uninspected: true,
      message: `${info.tool} is given SQL built by a command substitution, which this hook cannot read`,
      remedy: "pass the SQL literally or in a file, or run the query through `aftergrid check`, where the adapter's statement guard applies",
    });
  }
  const sql = parts.join("\n;\n");
  const ops = findOperations(sql, { stripStrings: true });
  if (ops.all.length) return blockSql({ ...info, ops, policy, entry: info.tool });
  const notes = [];
  for (const f of unreadFiles) notes.push(`${f} could not be read; its SQL was not inspected`);
  const expansion = PARAMETER_EXPANSION.test(sql);
  if (expansion) notes.push("the SQL contains a shell parameter expansion the hook does not resolve; what it expands to was not inspected");
  if (!sql.trim()) {
    notes.push((ctx.pipedFrom ?? []).length
      ? `SQL may be piped in from ${(ctx.pipedFrom ?? []).join(", ")}, whose output the hook does not read`
      : "no SQL on this invocation; an interactive session is not inspected");
  }
  const uninspected = unreadFiles.length > 0 || expansion || !sql.trim();
  return verdict("allow", uninspected ? "uninspected" : "query_read", {
    tool: info.tool, target: info.target, source: info.source, notes, uninspected,
    message: uninspected
      ? "the SQL on this invocation was not fully readable; it is reported as uninspected rather than as checked"
      : "read through a supported query path; cost and scan budgets are enforced by the adapter, never by this hook",
  });
}

function blockSql({ tool, target, source, ops, policy, entry }) {
  if (ops.engine.length) {
    return verdict("block", "engine_extension", {
      tool, target, source, operations: ops.engine,
      message: `${entry} would run ${ops.engine.join(", ").toUpperCase()}, attaching a database or loading an extension outside the sealed sandbox`,
      remedy: "declare the data as a retained input and read it through `aftergrid check --mode rerun`, whose sandbox (scripts/lib/sql-runner.mjs) forbids extensions and external access",
    });
  }
  if (target === "other") {
    return verdict("allow", "query_read", {
      tool, target, source, operations: ops.write, uninspected: true,
      message: `${entry} writes to ${source}, which is not the configured source; this hook polices the configured source only, and database permissions remain the boundary everywhere else`,
    });
  }
  const where = policy.found && target === "configured" ? `the configured source (${source})` : `a source the hook cannot rule out (${source})`;
  return verdict("block", "source_write", {
    tool, target, source, operations: ops.write,
    policy: policy.found ? policy.path : "built-in destructive-command list (no aftergrid.yaml found)",
    message: `${entry} would run ${ops.write.join(", ").toUpperCase()} against ${where}; an Analysis reads, it never writes`,
    remedy: "read with SELECT only; a write is not something any sign-off in this Engine unblocks. For a scratch database, provision a disposable one (initdb/pg_ctl on a temp directory, or a throwaway container). A provisional sign-off (docs/contracts/hook.md) covers an exploratory *read* of an unverified source and is evaluated by `evaluateProvisional`, which no command calls yet: it never lifts this block",
  });
}

// ---------------------------------------------------------------- decision

const isEcho = (s) => ["echo", "printf"].includes(basename(s.words[0] ?? ""));

/** Every stage of one command string (and of each substitution inside it), classified. */
export function classifyCommand(command, ctx) {
  const { policy, cwd, env } = ctx;
  const depth = ctx.depth ?? 0;
  const results = [];
  const { outer, inner } = extractSubstitutions(command);
  for (const text of [outer, ...inner]) {
    const stages = splitStages(text).map((s) => ({ ...s, ...tokenize(s.text) }));
    const byPipeline = new Map();
    for (const s of stages) { if (!byPipeline.has(s.pipeline)) byPipeline.set(s.pipeline, []); byPipeline.get(s.pipeline).push(s); }
    for (const group of byPipeline.values()) {
      const heredocs = group.flatMap((s) => s.heredocs);
      group.forEach((s, k) => {
        const upstream = group.slice(0, k);
        const pipedText = upstream.filter(isEcho).flatMap((u) => u.words.slice(1).filter((w) => !w.startsWith("-")));
        const pipedFrom = upstream.filter((u) => u.words.length && !isEcho(u)).map((u) => basename(u.words[0]));
        results.push(classifyStage({ ...s, heredocs: group.length > 1 ? heredocs : s.heredocs }, { policy, cwd, env, pipedText, pipedFrom, depth }));
      });
    }
  }
  return results;
}

/** A block anywhere decides; otherwise the least-inspected allow is the one reported. */
export function pickVerdict(results) {
  const blocked = results.find((r) => r.decision === "block");
  if (blocked) return blocked;
  return [...results].sort((a, b) => PRIORITY.indexOf(b.rule) - PRIORITY.indexOf(a.rule))[0];
}

export function decide({ tool_name, command, cwd = process.cwd(), env = process.env } = {}) {
  if (tool_name && tool_name !== "Bash") return verdict("allow", "not_a_bash_command", { message: `${tool_name} is not inspected by this hook` });
  if (typeof command !== "string" || !command.trim()) return verdict("allow", "not_a_query_path", { message: "no Bash command supplied" });
  const policy = loadPolicy(cwd, env);
  const results = classifyCommand(command, { policy, cwd, env, depth: 0 });
  const context = { policy_source: policy.found ? `instance policy ${policy.path}` : "no instance policy found", policy_notes: policy.notes ?? [] };
  return { ...(pickVerdict(results) ?? verdict("allow", "not_a_query_path", { message: "nothing to inspect" })), ...context };
}

// ---------------------------------------------------------------- entry point

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export async function main(argv) {
  const explain = argv.includes("--explain");
  let payload = {};
  try { payload = JSON.parse((await readStdin()) || "{}"); } catch { payload = {}; }
  const decision = decide({ tool_name: payload.tool_name, command: payload.tool_input?.command, cwd: payload.cwd || process.cwd() });
  const line = JSON.stringify({ aftergrid_hook: decision });
  if (decision.decision === "block") {
    const reason = `aftergrid guard: ${decision.message}.\nRemedy: ${decision.remedy}\nNot covered by this hook: ${NOT_COVERED[0]}.`;
    process.stdout.write(JSON.stringify({ decision: "block", reason, aftergrid_hook: decision }) + "\n");
    process.stderr.write(reason + "\n" + line + "\n");
    process.exit(2);
  }
  if (explain || decision.uninspected) process.stdout.write(line + "\n");
  process.exit(0);
}

if (process.argv[1] && realOrResolve(process.argv[1]) === realOrResolve(fileURLToPath(import.meta.url))) await main(process.argv.slice(2));
