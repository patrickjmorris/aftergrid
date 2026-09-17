// Postgres adapter: bounded analysis against a live source, captured as retained extracts, rerun on a disposable
// instance the Engine provisions itself. Capabilities are what Postgres actually enforces, named honestly:
//  - the connection string is read from a named environment variable; no credential is written to a file, a log
//    line, an error message or a report location (only the variable's name is)
//  - authored SQL is one statement, SELECT/WITH only, checked by a conservative token guard *and* refused at the
//    server by a read-only role, `default_transaction_read_only` and the extended protocol; the guard is a filter
//    in front of that boundary, never a substitute for it
//  - admission uses the largest planned scan from `EXPLAIN` without `ANALYZE` (src/adapters/admission.ts); a row
//    LIMIT never bounds admission, and a rerun never falls back to a live source
// The DuckDB adapter (src/adapters/duckdb.ts) implements the same contract with an in-process engine; the
// differences are listed in docs/contracts/adapters.md.
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { AdapterError } from "./contract.ts";
import type { Adapter, Admission, CapabilityMatrix, CatalogTable, ColumnMeta, Estimate, ExecuteResult, PrivilegeProbe, ResourceLimits, RetainedInput, RetainedRuntime, RetainedSession, SqlParams, TableAdmission } from "./contract.ts";
import { admit, captureRefusal } from "./admission.ts";
// @ts-ignore: shared path containment, SQL string quoting and the shared error type.
import { ContractError, safePath, sqlString } from "../../scripts/fixture-safety.mjs";
// @ts-ignore: shared limits, the identifier rule and the lossless CSV writer (one CSV policy for every adapter).
import { DEFAULT_LIMITS as RUNNER_LIMITS, csvText, identifier } from "../../scripts/lib/sql-runner.mjs";

const run = promisify(execFile);
const DEFAULT_LIMITS: ResourceLimits = { ...RUNNER_LIMITS };
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const ms = (n: number) => Math.max(1, Math.floor(n));

async function pgapi(): Promise<any> { const m: any = await import("pg"); return m.default ?? m; }

/** Shared-library failures (path containment, identifier rule) surface as adapter errors with their category. */
function asAdapterError(e: unknown): unknown {
  if (e instanceof AdapterError) return e;
  if (e instanceof ContractError) return new AdapterError((e as any).category, (e as Error).message, String((e as any).location ?? ""));
  return e;
}
const translate = <T,>(fn: () => Promise<T>): Promise<T> => fn().catch((e) => { throw asAdapterError(e); });
/** The one identifier rule (scripts/lib/sql-runner.mjs), reported as an adapter error. */
function ident(name: string): string {
  try { return identifier(name); } catch (e) { throw asAdapterError(e); }
}

// ---------------------------------------------------------------------------------------------------------------
// Statement guard. Postgres has no client-side parser we can trust here, so this is a deliberately conservative
// tokenizer: it understands comments, string literals, dollar quoting and quoted identifiers well enough to find
// top-level statement boundaries and bare keywords, and refuses anything it cannot classify.
// ---------------------------------------------------------------------------------------------------------------

/** Statement kinds and side-effecting commands that authored analysis SQL never contains. */
const DENIED_WORDS = new Set([
  "insert", "update", "delete", "merge", "create", "drop", "alter", "truncate", "grant", "revoke", "copy",
  "vacuum", "analyse", "analyze", "cluster", "reindex", "refresh", "comment", "call", "do", "set", "reset",
  "begin", "start", "commit", "rollback", "savepoint", "release", "prepare", "execute", "deallocate", "declare",
  "fetch", "move", "close", "listen", "notify", "unlisten", "lock", "discard", "import", "checkpoint", "load",
  "explain", "into", "security", "reassign", "abort", "end",
]);
/** Functions that read or write outside the query, run SQL from a string, or reach another backend. */
const DENIED_FUNCTIONS = new Set([
  "pg_read_file", "pg_read_binary_file", "pg_ls_dir", "pg_stat_file", "pg_ls_logdir", "pg_ls_waldir",
  "pg_ls_archive_statusdir", "pg_ls_tmpdir", "lo_import", "lo_export", "lo_get", "lo_put", "lo_from_bytea",
  "dblink", "dblink_exec", "dblink_connect", "dblink_send_query", "set_config", "pg_sleep", "pg_sleep_for",
  "pg_sleep_until", "pg_cancel_backend", "pg_terminate_backend", "pg_reload_conf", "pg_rotate_logfile",
  "pg_promote", "pg_logical_emit_message", "pg_create_physical_replication_slot", "pg_create_logical_replication_slot",
  "query_to_xml", "query_to_xmlschema", "query_to_xml_and_xmlschema", "pg_file_write", "pg_file_unlink",
  "pg_file_rename", "pg_execute_server_program", "pg_backup_start", "pg_start_backup",
]);

type ParamRef = { name: string; start: number; end: number };
/** `words` are bare (unquoted) words; `quoted` are the contents of double-quoted identifiers, unescaped. */
export type Scan = { firstWord: string; words: string[]; quoted: string[]; params: ParamRef[]; statements: number };

const policy = (message: string): never => { throw new AdapterError("sql_policy", message, "SQL"); };
const IDENT_CHAR = /[A-Za-z0-9_-￿]/;

/** Tokenize far enough to split top-level statements and see bare keywords; refuse anything unrecognised. */
export function scan(sql: string): Scan {
  if (typeof sql !== "string" || !sql.trim()) policy("empty SQL");
  const words: string[] = []; const quoted: string[] = []; const params: ParamRef[] = [];
  let statements = 0; let firstWord = ""; let tokens = 0; let i = 0;
  const endStatement = () => { if (tokens) statements++; tokens = 0; };
  while (i < sql.length) {
    const ch = sql[i]!;
    if (ch === "-" && sql[i + 1] === "-") { const nl = sql.indexOf("\n", i); i = nl === -1 ? sql.length : nl + 1; continue; }
    if (ch === "/" && sql[i + 1] === "*") {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql[i] === "/" && sql[i + 1] === "*") { depth++; i += 2; }
        else if (sql[i] === "*" && sql[i + 1] === "/") { depth--; i += 2; }
        else i++;
      }
      if (depth) policy("unterminated block comment");
      continue;
    }
    if (ch === "'" || ch === '"') {
      // A quote glued to a preceding word or & is escape / unicode / bit-string syntax, whose escaping rules this
      // tokenizer does not model. Refuse rather than guess.
      if (i > 0 && (IDENT_CHAR.test(sql[i - 1]!) || sql[i - 1] === "&")) policy("escape, unicode and bit string literal syntax is not allowed in analysis SQL");
      const quote = ch; const start = ++i;
      for (;;) {
        if (i >= sql.length) policy(quote === "'" ? "unterminated string literal" : "unterminated quoted identifier");
        if (sql[i] === quote) { if (sql[i + 1] === quote) { i += 2; continue; } i++; break; }
        i++;
      }
      // A quoted identifier names the same object as the bare word, so the guard has to see it too: without this
      // `select "pg_read_file"(...)` would be admitted while `select pg_read_file(...)` is refused.
      if (quote === '"') quoted.push(sql.slice(start, i - 1).replace(/""/g, '"'));
      tokens++; continue;
    }
    if (ch === "$") {
      if (i > 0 && IDENT_CHAR.test(sql[i - 1]!)) policy("'$' inside an identifier is not allowed in analysis SQL");
      const tag = /^\$([A-Za-z_-￿][A-Za-z0-9_-￿]*)?\$/.exec(sql.slice(i));
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length);
        if (close === -1) policy("unterminated dollar-quoted string");
        i = close + tag[0].length; tokens++; continue;
      }
      const named = /^\$([A-Za-z_][A-Za-z0-9_]{0,62})/.exec(sql.slice(i));
      if (named) { params.push({ name: named[1]!, start: i, end: i + named[0].length }); i += named[0].length; tokens++; continue; }
      if (/^\$\d/.test(sql.slice(i))) throw new AdapterError("sql_parameter", "positional parameters are not allowed; use named parameters ($name)", "SQL");
      policy("unexpected '$' in SQL");
    }
    if (ch === ";") { endStatement(); i++; continue; }
    if (/[0-9]/.test(ch)) { // a numeric literal is a token, never a keyword
      let j = i;
      while (j < sql.length && /[0-9A-Za-z_.]/.test(sql[j]!)) j++;
      tokens++; i = j; continue;
    }
    if (/[A-Za-z_-￿]/.test(ch)) {
      let j = i;
      while (j < sql.length && IDENT_CHAR.test(sql[j]!)) j++;
      const word = sql.slice(i, j).toLowerCase();
      words.push(word);
      if (statements === 0 && firstWord === "") firstWord = word;
      tokens++; i = j; continue;
    }
    if (/\s/.test(ch)) { i++; continue; }
    if (!/[-+*/<>=~!@#%^&|?(),.[\]:{}]/.test(ch)) policy(`unexpected character '${ch}' in SQL`);
    tokens++; i++;
  }
  endStatement();
  return { firstWord, words, quoted, params, statements };
}

/** One statement, SELECT only, no side-effecting keyword and no function that reaches outside the query. */
export function guard(sql: string): Scan {
  const s = scan(sql);
  if (s.statements !== 1) policy("exactly one SELECT statement is allowed");
  if (s.firstWord !== "select" && s.firstWord !== "with") policy("only SELECT statements are allowed");
  for (const w of s.words) {
    if (DENIED_WORDS.has(w)) policy(`only SELECT statements are allowed; the keyword '${w}' is refused`);
    if (DENIED_FUNCTIONS.has(w)) policy(`'${w}' reaches outside the query and is refused`);
  }
  // Double quoting is the documented escape hatch for a column named after a *keyword*; it is not one for a denied
  // function, which Postgres resolves identically quoted or bare. Refusing a column that happens to be named after
  // one is a false refusal, which is the side this guard errs on.
  for (const q of s.quoted) {
    if (DENIED_FUNCTIONS.has(q.toLowerCase())) policy(`'${q}' reaches outside the query and is refused; quoting an identifier does not exempt it`);
  }
  if (s.firstWord === "with" && !s.words.includes("select")) policy("only SELECT statements are allowed");
  return s;
}

/** Rewrite $name to $1..$n in first-use order and collect the values the statement actually declares. */
export function bindNamed(sql: string, s: Scan, params: SqlParams): { text: string; values: (string | number | boolean | null)[] } {
  const order: string[] = [];
  let text = ""; let last = 0;
  for (const p of s.params) {
    if (!Object.hasOwn(params, p.name)) throw new AdapterError("sql_parameter", `missing named SQL parameter $${p.name}`, p.name);
    let idx = order.indexOf(p.name);
    if (idx < 0) { order.push(p.name); idx = order.length - 1; }
    text += sql.slice(last, p.start) + "$" + (idx + 1);
    last = p.end;
  }
  return { text: text + sql.slice(last), values: order.map((n) => params[n] ?? null) };
}

// ---------------------------------------------------------------------------------------------------------------
// Typed cells. Values arrive as the server's own text (the driver's type parsers are disabled) so nothing is
// silently reinterpreted on the way in; this adapter decides the JSON-safe shape.
// ---------------------------------------------------------------------------------------------------------------
const BOOL_OID = 16;
const INT_OIDS = new Set([20, 21, 23, 26]); // int8, int2, int4, oid

/** Integers as numbers when safe (their text otherwise), decimals/dates/timestamps as strings, booleans, null. */
export function cell(oid: number, raw: string | null): string | number | boolean | null {
  if (raw === null || raw === undefined) return null;
  if (oid === BOOL_OID) return raw === "t" || raw === "true";
  if (INT_OIDS.has(oid)) { const n = Number(raw); return Number.isSafeInteger(n) ? n : raw; }
  return raw; // timestamptz already reads 'YYYY-MM-DD HH:MM:SS+00' because every session runs in UTC
}

/** Connection loss (idle kill, server restart, administrator terminate) is a runtime state, not a SQL error. */
const LOST_CODES = new Set(["57P01", "57P02", "57P03", "08000", "08001", "08003", "08004", "08006", "08007", "08P01", "ECONNREFUSED", "ECONNRESET", "EPIPE", "ENOTFOUND", "ETIMEDOUT", "ENOENT"]);

function mapError(e: unknown, timeoutMs: number, what: string): AdapterError {
  const translated = asAdapterError(e);
  if (translated instanceof AdapterError) return translated;
  const code = (e as any)?.code;
  const msg = String((e as any)?.message ?? e).split("\n")[0]!;
  if (code === "57014") return new AdapterError("cancelled", `${what} cancelled after ${timeoutMs} ms (statement_timeout)`, "SQL");
  if (code === "53200" || code === "53100" || code === "53400" || code === "54000") return new AdapterError("resource_limit", msg, "SQL");
  if (code === "25006" || code === "42501") return new AdapterError("sql_policy", msg, "SQL");
  if (LOST_CODES.has(String(code)) || /connection terminated|connection ended|server closed the connection|terminating connection/i.test(msg)) {
    return new AdapterError("runtime_unavailable", `${msg} (${what}); the Postgres connection is gone and this session cannot be used again`, "SQL");
  }
  return new AdapterError("sql_error", msg, "SQL");
}

/**
 * `work_mem` as Postgres spells it: an integer with a unit (`B`, `kB`, `MB`, `GB`, `TB`); a bare number is kB.
 * A caller-supplied limit that cannot be expressed that way is refused here, never silently dropped, because the
 * admission record names the limits that admitted an unknown estimate.
 */
export function workMem(value: string): string {
  const m = /^\s*([0-9]+)\s*(b|kb|k|mb|m|gb|g|tb|t)?\s*$/i.exec(String(value ?? ""));
  const unit = (m?.[2] ?? "kb").toLowerCase();
  const scale = unit === "b" ? 1 / 1024 : unit === "kb" || unit === "k" ? 1 : unit === "mb" || unit === "m" ? 1024 : unit === "gb" || unit === "g" ? 1024 ** 2 : 1024 ** 3;
  const kb = m ? Math.floor(Number(m[1]) * scale) : NaN;
  if (!Number.isFinite(kb) || kb < 64 || kb > 2_147_483_647) {
    throw new AdapterError("resource_limit", `memory_limit ${JSON.stringify(String(value))} is not a work_mem value Postgres accepts; use an integer with a unit (64kB..2047GB), for example "256MB"`, "memory_limit");
  }
  if (kb % (1024 ** 2) === 0) return `${kb / 1024 ** 2}GB`;
  if (kb % 1024 === 0) return `${kb / 1024}MB`;
  return `${kb}kB`;
}

/** Limits as this adapter will actually apply them, so the values it records are the values it enforced. */
function normalizeLimits(limits: ResourceLimits): ResourceLimits {
  return { ...limits, memory_limit: workMem(limits.memory_limit) };
}

/** One connection, one statement at a time: the session owns the timeout, the cancel path and the type names. */
class Session {
  readonly client: any;
  private url: string;
  private pid = 0;
  private lost?: AdapterError;
  private typeNames = new Map<number, string>();
  private constructor(client: any, url: string) { this.client = client; this.url = url; }

  static async open(url: string, limits: ResourceLimits, opts: { search_path?: string } = {}): Promise<Session> {
    const { Client } = await pgapi();
    const client = new Client({ connectionString: url, types: { getTypeParser: () => (v: any) => v }, application_name: "aftergrid" });
    const s = new Session(client, url);
    // node-postgres emits 'error' on the Client when the connection drops while nothing is in flight (server
    // restart, proxy idle kill, administrator terminate). Without a listener that is an unhandled 'error' event,
    // which kills the process — taking any disposable instance's cleanup with it. Record it instead: the next
    // call on this session fails with it, as an AdapterError like any other.
    client.on("error", (e: unknown) => { s.lost ??= mapError(e, limits.statement_timeout_ms, "the connection"); });
    try { await client.connect(); } catch (e) { throw mapError(e, limits.statement_timeout_ms, "connecting"); }
    try {
      await client.query("SET TimeZone='UTC'");
      // The enforced read boundary for this session, independent of the statement guard.
      await client.query("SET default_transaction_read_only = on");
      await client.query(`SET statement_timeout = ${ms(limits.statement_timeout_ms)}`);
      await client.query(`SET lock_timeout = ${ms(limits.statement_timeout_ms)}`);
      await client.query(`SET idle_in_transaction_session_timeout = ${ms(limits.statement_timeout_ms * 10)}`);
      // work_mem is per-operation tuning, not a memory cap; capabilities() says so. An unusable value is refused
      // by workMem() rather than dropped, so what the admission records is what the session applied.
      await client.query(`SET work_mem = ${sqlString(workMem(limits.memory_limit))}`);
      await client.query(`SET max_parallel_workers_per_gather = ${Math.max(0, Math.floor(limits.threads) - 1)}`);
      if (opts.search_path) await client.query(`SET search_path = ${ident(opts.search_path)}`);
      s.pid = Number((await client.query("select pg_backend_pid() as pid")).rows[0].pid);
    } catch (e) {
      await client.end().catch(() => undefined);
      throw mapError(e, limits.statement_timeout_ms, "opening the session");
    }
    return s;
  }

  /** Backstop for statement_timeout: ask the server to cancel this backend from a second connection. */
  private arm(timeoutMs: number): () => void {
    const timer = setTimeout(async () => {
      try {
        const { Client } = await pgapi();
        const c = new Client({ connectionString: this.url, application_name: "aftergrid-cancel" });
        c.on("error", () => { /* the backstop never crashes the process it is protecting */ });
        await c.connect();
        try { await c.query("select pg_cancel_backend($1)", [this.pid]); } finally { await c.end().catch(() => undefined); }
      } catch { /* statement_timeout remains the enforced stop */ }
    }, ms(timeoutMs) + 250);
    timer.unref?.();
    return () => clearTimeout(timer);
  }

  /**
   * End a transaction this session opened. It deliberately does not go through raw(): after a failed statement the
   * transaction is aborted, and every statement but COMMIT/ROLLBACK — including raw()'s `SET statement_timeout` —
   * fails with 25P02, which would leave the session aborted for good.
   */
  async endTransaction(commit: boolean) {
    await this.client.query(commit ? "COMMIT" : "ROLLBACK").catch(() => undefined);
  }

  async raw(text: string, values: (string | number | boolean | null)[], timeoutMs: number, what: string): Promise<any> {
    if (this.lost) throw this.lost;
    const disarm = this.arm(timeoutMs);
    try {
      await this.client.query(`SET statement_timeout = ${ms(timeoutMs)}`);
      // queryMode 'extended' forces the extended protocol, where the server itself refuses multiple commands.
      return await this.client.query({ text, values, rowMode: "array", queryMode: "extended" });
    } catch (e) { throw mapError(e, timeoutMs, what); } finally { disarm(); }
  }

  /** Column metadata plus JSON-safe rows. Duplicate output column names are an error, not a silent merge. */
  async typed(text: string, values: (string | number | boolean | null)[], timeoutMs: number, what: string): Promise<{ columns: ColumnMeta[]; rows: ExecuteResult["rows"] }> {
    const r = await this.raw(text, values, timeoutMs, what);
    await this.loadTypeNames(timeoutMs);
    const fields: any[] = r.fields ?? [];
    const columns: ColumnMeta[] = fields.map((f) => ({ name: String(f.name), sql_type: this.typeNames.get(Number(f.dataTypeID)) ?? `oid_${f.dataTypeID}` }));
    const seen = new Set<string>();
    for (const c of columns) {
      if (seen.has(c.name)) throw new AdapterError("result_shape", `duplicate output column '${c.name}'; give every column a distinct name`, "SQL");
      seen.add(c.name);
    }
    const rows = (r.rows as any[][]).map((row) => Object.fromEntries(columns.map((c, i) => [c.name, cell(Number(fields[i].dataTypeID), row[i])])));
    return { columns, rows };
  }

  private async loadTypeNames(timeoutMs: number) {
    if (this.typeNames.size) return;
    const r = await this.raw("select oid, typname from pg_type", [], timeoutMs, "reading type names");
    for (const [oid, name] of r.rows as any[][]) this.typeNames.set(Number(oid), String(name));
  }

  async close() { await this.client.end().catch(() => undefined); }
}

function planNumbers(planJson: string): Estimate {
  const parsed = JSON.parse(planJson);
  const root = (Array.isArray(parsed) ? parsed[0] : parsed)?.Plan;
  if (!root || typeof root["Plan Rows"] !== "number") return { status: "unknown", reason: "the planner reported no row estimate" };
  let scan_rows = 0;
  const walk = (n: any) => { if (typeof n?.["Plan Rows"] === "number") scan_rows = Math.max(scan_rows, n["Plan Rows"]); for (const c of n?.Plans ?? []) walk(c); };
  walk(root);
  const cost = typeof root["Total Cost"] === "number" ? root["Total Cost"] : undefined;
  return { status: "estimated", rows: root["Plan Rows"], unit: "planner_cost", scan_rows, ...(cost === undefined ? {} : { cost }) };
}

/** EXPLAIN without ANALYZE: the statement is planned, never executed. Any failure is an honest `unknown`. */
async function estimateOn(s: Session, text: string, values: (string | number | boolean | null)[], timeoutMs: number): Promise<Estimate> {
  try {
    const r = await s.raw("EXPLAIN (FORMAT JSON) " + text, values, timeoutMs, "planning");
    const json = r.rows?.[0]?.[0];
    if (json === undefined || json === null) return { status: "unknown", reason: "EXPLAIN returned no plan" };
    return planNumbers(String(json));
  } catch (e) {
    return { status: "unknown", reason: String((e as Error).message ?? e).split("\n")[0]! };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------------------------------------------

export type PostgresOptions = {
  /** NAME of the environment variable holding the connection string. A literal secret is never accepted here. */
  connection_string_env: string;
  /** Schema the analysis reads; defaults to `public`. */
  schema?: string;
  limits?: Partial<ResourceLimits>;
  estimate_cap_rows?: number;
};

export class PostgresAdapter implements Adapter {
  readonly name = "postgres" as const;
  private limits: ResourceLimits;
  private cap: number;
  private schema: string;
  private opts: PostgresOptions;
  private session?: Session;
  private opening?: Promise<Session>;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private generation = 0;

  constructor(opts: PostgresOptions) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(opts.connection_string_env ?? "")) {
      throw new AdapterError("missing_credential", "connection_string_env must be the NAME of an environment variable, never a connection string", "connection_string_env");
    }
    this.opts = opts;
    this.limits = normalizeLimits({ ...DEFAULT_LIMITS, ...(opts.limits ?? {}) });
    this.cap = opts.estimate_cap_rows ?? 5_000_000;
    this.schema = opts.schema ?? "public";
    ident(this.schema);
  }

  capabilities(): CapabilityMatrix {
    return {
      execute: { status: "supported", note: "single SELECT, named parameters mapped to $1..$n, JSON-safe typed cells; timestamptz rendered in UTC" },
      capture: { status: "supported", note: "whole-table CSV extracts read inside one REPEATABLE READ READ ONLY transaction; content hashes, server version and column types recorded; rows ordered by every column, by its text rendering where the type has no ordering operator; a column whose name a rerun could not restore is refused at capture" },
      open_retained: { status: "partial", note: "extracts are restored into a disposable Postgres provisioned with initdb/pg_ctl; a column type the fresh instance does not have (an enum, domain or composite) is restored as text and the substitution is recorded in the admission; without those binaries rerun reports runtime_unavailable and never falls back to the live source" },
      privilege_probe: { status: "supported", note: "effective privileges of the connected role: has_table_privilege for INSERT/UPDATE/DELETE/TRUNCATE on tables, views and materialised views (a writable view writes its base table), CREATE on schema and database, and pg_roles superuser/createdb; EXECUTE on SECURITY DEFINER routines is not probed" },
      cost_estimate: { status: "supported", note: "EXPLAIN (FORMAT JSON) without ANALYZE; unit planner_cost (plan rows plus the planner's abstract total cost); unknown when planning fails or reports no rows" },
      resource_limits: { status: "partial", note: "statement_timeout, lock_timeout and idle_in_transaction_session_timeout are enforced by the server; memory_limit is applied as work_mem, which is per-operation tuning, not a total memory cap, and a value work_mem cannot take is refused rather than dropped; no hard memory or CPU bound is claimed unless the hosting runtime enforces one; calls on one adapter are serialised" },
      cancellation: { status: "supported", note: "statement_timeout cancels the statement server-side, with pg_cancel_backend from a second connection as a backstop; the session stays usable" },
      statement_guard: { status: "supported", note: "conservative single-SELECT token guard, applied to quoted identifiers as well as bare words, in front of the enforced boundary: a read-only role, default_transaction_read_only, and the extended protocol, which refuses multiple commands at the server" },
      catalog: { status: "supported", note: "information_schema.columns for the configured schema" },
    };
  }

  private connectionString(): string {
    const value = process.env[this.opts.connection_string_env];
    if (!value) throw new AdapterError("missing_credential", `environment variable ${this.opts.connection_string_env} is not set; the Postgres connection string is read from the environment, never from a file`, this.opts.connection_string_env);
    return value;
  }

  /** One connection, one statement at a time (a timeout interrupts the shared backend). Separate adapters for parallelism. */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async open(): Promise<Session> {
    if (this.closed) throw new AdapterError("closed", "adapter is closed", this.opts.connection_string_env);
    if (this.session) return this.session;
    if (!this.opening) {
      const gen = this.generation;
      const url = this.connectionString();
      this.opening = Session.open(url, this.limits, { search_path: this.schema })
        .then(async (s) => {
          if (gen !== this.generation || this.closed) { await s.close(); throw new AdapterError("closed", "adapter was closed while opening", this.opts.connection_string_env); }
          this.session = s;
          return s;
        })
        .finally(() => { this.opening = undefined; });
    }
    return this.opening;
  }

  async probePrivileges(): Promise<PrivilegeProbe> {
    return this.serialize(() => translate(async () => {
      const s = await this.open();
      // Views and materialised views count: an INSERT/UPDATE/DELETE grant on an auto-updatable or trigger-backed
      // view writes the base table, and a view that is not security_invoker does it with the owner's rights. A
      // probe that looked only at ('r','p','f') would report can_write:false for a role that can write the source.
      const sql = `select current_user::text as role,
          (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where c.relkind in ('r','p','f','v','m') and n.nspname not in ('pg_catalog','information_schema')) as tables,
          (select coalesce(bool_or(has_table_privilege(c.oid,'INSERT') or has_table_privilege(c.oid,'UPDATE')
                                   or has_table_privilege(c.oid,'DELETE') or has_table_privilege(c.oid,'TRUNCATE')), false)
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind in ('r','p','f','v','m') and n.nspname not in ('pg_catalog','information_schema')) as can_write,
          (select coalesce(bool_or(has_schema_privilege(n.oid,'CREATE')), false) from pg_namespace n
            where n.nspname not in ('pg_catalog','information_schema')) as schema_create,
          has_database_privilege(current_database(),'CREATE') as database_create,
          coalesce((select rolsuper from pg_roles where rolname = current_user), false) as is_superuser,
          coalesce((select rolcreatedb from pg_roles where rolname = current_user), false) as can_createdb`;
      const { rows } = await s.typed(sql, [], this.limits.statement_timeout_ms, "probing privileges");
      const r = rows[0]!;
      const can_write = r.can_write === true;
      const can_ddl = r.is_superuser === true || r.can_createdb === true || r.schema_create === true || r.database_create === true;
      const detail = `role ${r.role}: INSERT/UPDATE/DELETE/TRUNCATE on at least one of ${r.tables} non-system tables, views or materialised views (a writable view writes its base table): ${can_write ? "yes" : "no"}; CREATE on a schema: ${r.schema_create ? "yes" : "no"}; CREATE in the database: ${r.database_create ? "yes" : "no"}; superuser: ${r.is_superuser ? "yes" : "no"}; createdb: ${r.can_createdb ? "yes" : "no"}. This session also runs with default_transaction_read_only=on and statement_timeout=${ms(this.limits.statement_timeout_ms)}ms, which bound the session but not the role. EXECUTE on a SECURITY DEFINER routine is not probed, so a 'no' here is about relation privileges only.`;
      return { status: "supported", can_write, can_ddl, detail };
    }));
  }

  async estimate(sql: string, params: SqlParams, opts: { timeout_ms?: number } = {}): Promise<Estimate> {
    return this.serialize(() => translate(async () => {
      const s = await this.open();
      const bound = bindNamed(sql, guard(sql), params);
      return estimateOn(s, bound.text, bound.values, opts.timeout_ms ?? this.limits.statement_timeout_ms);
    }));
  }

  async execute(sql: string, params: SqlParams, opts: { timeout_ms?: number } = {}): Promise<ExecuteResult> {
    return this.serialize(() => translate(async () => {
      const s = await this.open();
      const timeout = opts.timeout_ms ?? this.limits.statement_timeout_ms;
      const bound = bindNamed(sql, guard(sql), params);
      const admission = admit(await estimateOn(s, bound.text, bound.values, timeout), this.cap, this.limits);
      if (admission.decision === "rejected") throw new AdapterError("admission", admission.reason, "SQL");
      const { columns, rows } = await s.typed(bound.text, bound.values, timeout, "statement");
      return { columns, rows, admission };
    }));
  }

  async catalog(): Promise<CatalogTable[]> {
    return this.serialize(() => translate(async () => {
      const s = await this.open();
      const { rows } = await s.typed(
        "select table_name, column_name, data_type from information_schema.columns where table_schema = $1 order by table_name, ordinal_position",
        [this.schema], this.limits.statement_timeout_ms, "reading the catalog");
      const map = new Map<string, CatalogTable>();
      for (const row of rows) {
        const t = String(row.table_name);
        if (!map.has(t)) map.set(t, { name: t, columns: [] });
        map.get(t)!.columns.push({ name: String(row.column_name), sql_type: String(row.data_type) });
      }
      return [...map.values()];
    }));
  }

  async capture(tables: string[], destDir: string, opts: { description?: string; timeout_ms?: number } = {}): Promise<RetainedInput[]> {
    return this.serialize(() => translate(() => this.captureNow(tables, destDir, opts)));
  }

  /**
   * The planner's view of `select * from <schema>.<table>` — the read capture performs — plus `pg_table_size`,
   * which is the heap and its TOAST on disk (indexes excluded: capture copies rows, not indexes).
   */
  private async admissionOf(s: Session, table: string, timeout: number): Promise<TableAdmission> {
    const text = `select * from ${ident(this.schema)}.${ident(table)}`;
    const estimate = await estimateOn(s, bindNamed(text, guard(text), {}).text, [], timeout);
    let bytes: number | undefined;
    try {
      const { rows } = await s.typed("select pg_table_size(($1 || '.' || $2)::regclass) as bytes", [this.schema, table], timeout, `sizing ${table}`);
      const n = Number(rows[0]?.bytes);
      if (Number.isFinite(n)) bytes = n;
    } catch { /* no privilege on the size function, or no such relation: bytes stay unstated rather than guessed */ }
    return { table, estimate, ...(bytes === undefined ? {} : { bytes }), admission: admit(estimate, this.cap, this.limits) };
  }

  async tableAdmissions(tables: string[]): Promise<TableAdmission[]> {
    return this.serialize(() => translate(async () => {
      const s = await this.open();
      const out: TableAdmission[] = [];
      for (const table of tables) out.push(await this.admissionOf(s, table, this.limits.statement_timeout_ms));
      return out;
    }));
  }

  /** Column names, storage types and nullability from information_schema, in ordinal order. */
  private async columnsOf(s: Session, table: string, timeout: number): Promise<RetainedRuntime["columns"]> {
    const { rows } = await s.typed(
      "select column_name, udt_name, is_nullable from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position",
      [this.schema, table], timeout, `reading the schema of ${table}`);
    if (!rows.length) throw new AdapterError("unresolved_reference", `table ${table} is not in the source catalog`, table);
    return rows.map((r) => {
      const name = String(r.column_name);
      // A capture whose rerun could never restore the column is refused here, not minted as a hashed artifact that
      // fails at verification time with a wrong-noun error from deep inside the DDL builder.
      try { identifier(name); } catch {
        throw new AdapterError("unsafe_identifier", `column ${table}.${name} cannot be captured: a rerun restores columns by name, and column names must match ^[a-z][a-z0-9_]{0,63}$; expose the column under a conforming name (a view) or drop it from the capture`, `${table}.${name}`);
      }
      return { name, sql_type: pgTypeName(String(r.udt_name)), nullable: r.is_nullable === "YES" };
    });
  }

  /**
   * Which of these types the server can sort. Postgres has no default btree ordering for `json`, `xml`, `point`
   * and friends, so `order by <ordinal>` over such a column fails outright; those columns are ordered by their
   * text rendering instead. Probing happens before the capture transaction opens, because a failed probe would
   * otherwise abort it.
   */
  private async orderableTypes(s: Session, types: string[], timeout: number): Promise<Set<string>> {
    const ok = new Set<string>();
    for (const t of new Set(types)) {
      const array = t.endsWith("[]");
      const cast = `"${(array ? t.slice(0, -2) : t).replace(/"/g, '""')}"${array ? "[]" : ""}`;
      try {
        await s.raw(`select (null::${cast} < null::${cast}) is null as orderable`, [], timeout, `checking whether ${t} can be ordered`);
        ok.add(t);
      } catch { /* no ordering operator for this type: it is ordered by its text rendering instead */ }
    }
    return ok;
  }

  private async captureNow(tables: string[], destDir: string, opts: { description?: string; timeout_ms?: number }): Promise<RetainedInput[]> {
    const s = await this.open();
    const timeout = opts.timeout_ms ?? this.limits.statement_timeout_ms;
    const captured_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const version = String((await s.typed("select current_setting('server_version') as v", [], timeout, "reading the server version")).rows[0]!.v);
    const out: RetainedInput[] = [];
    // Schema reads and the orderability probe happen first: both can fail, and a failure inside the transaction
    // would abort it. Only the data reads belong in the snapshot.
    const schemas = new Map<string, RetainedRuntime["columns"]>();
    for (const table of tables) schemas.set(table, await this.columnsOf(s, table, timeout));
    const orderable = await this.orderableTypes(s, [...schemas.values()].flat().map((c) => c.sql_type), timeout);
    // One REPEATABLE READ READ ONLY transaction, so every extract is the same consistent view of the source.
    await s.raw("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", [], timeout, "opening the capture transaction");
    let committed = false;
    try {
      // Admission for every table, before a directory is made or a row is read: capture's read IS the whole table,
      // so the cap that bounds `execute` bounds it too, and a refusal rolls back having written nothing. It runs
      // INSIDE the transaction on purpose — `EXPLAIN` takes an ACCESS SHARE lock, and doing it outside would let a
      // lock wait on the last table move the snapshot past a commit the earlier extracts were meant to precede.
      for (const table of tables) {
        const { estimate, admission } = await this.admissionOf(s, table, timeout);
        if (admission.decision === "rejected") throw new AdapterError("admission", captureRefusal(table, estimate.status === "estimated" ? estimate.scan_rows : NaN, this.cap), table);
      }
      mkdirSync(join(destDir, "inputs"), { recursive: true });
      for (const table of tables) {
        const columns = schemas.get(table)!;
        const rel = `inputs/${table}.csv`;
        const full = safePath(destDir, rel);
        // Deterministic order for a stable hash: every column, left to right, by ordinal — except a column whose
        // type the server cannot sort, which is ordered by its text rendering so the capture is still possible.
        const order = columns.map((c, i) => (orderable.has(c.sql_type) ? String(i + 1) : `${ident(c.name)}::text`)).join(",");
        const sql = `select * from ${ident(this.schema)}.${ident(table)} order by ${order}`;
        const { columns: outCols, rows } = await s.typed(bindNamed(sql, guard(sql), {}).text, [], timeout, `capturing ${table}`);
        const bytes = Buffer.from(csvText(outCols.map((c) => c.name), rows), "utf8");
        writeFileSync(full, bytes);
        const schemaText = columns.map((c) => `${c.name} ${c.sql_type}${c.nullable ? "" : " not null"}`).join(", ");
        out.push({
          id: table, kind: "extract", path: rel, content_hash: { algorithm: "sha256", value: sha(bytes) }, captured_at,
          description: `${opts.description ?? `Whole-table extract of ${this.schema}.${table}`} (postgres ${version}; columns: ${schemaText})`,
          source: {
            adapter: "postgres",
            method: `select * from ${this.schema}.${table} order by ${order} inside one BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY transaction, written as CSV (NULL empty, empty string quoted)`,
            tables: [table], consistency: "single_transaction",
          },
          runtime: { engine: "postgres", server_version: version, columns },
        });
      }
      committed = true;
    } finally { await s.endTransaction(committed); }
    return out;
  }

  /** Closes for good: an open still in flight discards its session instead of publishing it; later calls fail with `closed`. */
  async close() {
    this.closed = true;
    this.generation++;
    const pending = this.opening;
    const s = this.session;
    this.session = undefined;
    if (s) await s.close();
    if (pending) await pending.then((p) => p.close(), () => undefined);
  }
}

/** information_schema spells array types `_int4`; Postgres spells them `int4[]`. Anything else is refused. */
export function pgTypeName(udt: string): string {
  const array = udt.startsWith("_");
  const base = array ? udt.slice(1) : udt;
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(base)) throw new AdapterError("unsafe_identifier", `unsupported column type '${udt}'`, udt);
  return array ? `${base}[]` : base;
}

// ---------------------------------------------------------------------------------------------------------------
// Disposable instance + retained rerun
// ---------------------------------------------------------------------------------------------------------------

const RUNTIME_MISSING = "SQL rerun is unavailable here; saved-result artifact replay remains possible (run check --mode artifact)";

export function findBinary(name: string): string | null {
  const dirs = [...(process.env.AFTERGRID_PG_BINDIR ? [process.env.AFTERGRID_PG_BINDIR] : []), ...(process.env.PATH ?? "").split(delimiter).filter(Boolean)];
  for (const d of dirs) {
    if (!isAbsolute(d)) continue;
    const full = join(d, name);
    try { accessSync(full, constants.X_OK); return full; } catch { /* keep looking */ }
  }
  return null;
}

/** A socket directory short enough for the platform's sockaddr_un limit (about 104 bytes on macOS). */
function socketBase(): string {
  for (const base of [tmpdir(), "/tmp"]) {
    if (existsSync(base) && !/\s/.test(base) && (base + "/agpg-XXXXXX/.s.PGSQL.5432").length <= 96) return base;
  }
  return tmpdir();
}

export type DisposablePostgres = {
  dataDir: string; socketDir: string; superuser: string;
  /** A connection string for this instance; it carries no secret (trust auth on a private unix socket, no TCP). */
  url(database: string, user?: string): string;
  stop(): void;
};

/**
 * Engine-controlled provisioning of a throwaway Postgres: initdb into a temp directory, started on a private unix
 * socket with no TCP listener. This is a controlled Engine path, never a path for agent-issued source SQL.
 */
export async function provisionDisposablePostgres(opts: { superuser?: string; timeout_ms?: number } = {}): Promise<DisposablePostgres> {
  const initdb = findBinary("initdb");
  const pgCtl = findBinary("pg_ctl");
  if (!initdb || !pgCtl) throw new AdapterError("runtime_unavailable", `no local Postgres runtime: ${initdb ? "pg_ctl" : "initdb"} was not found on PATH or AFTERGRID_PG_BINDIR; ${RUNTIME_MISSING}`, "PATH");
  const superuser = opts.superuser ?? "aftergrid_owner";
  ident(superuser);
  const dataDir = mkdtempSync(join(tmpdir(), "ag-pgdata-"));
  const socketDir = mkdtempSync(join(socketBase(), "agpg-"));
  const timeout = opts.timeout_ms ?? 120_000;
  const cleanup = () => { rmSync(dataDir, { recursive: true, force: true }); rmSync(socketDir, { recursive: true, force: true }); };
  try {
    if (/\s/.test(socketDir) || /\s/.test(dataDir)) throw new Error("temporary directory paths must not contain whitespace");
    await run(initdb, ["-D", dataDir, "-U", superuser, "--auth=trust", "--no-sync", "-E", "UTF8", "--locale=C"], { timeout });
    await run(pgCtl, ["-D", dataDir, "-l", join(dataDir, "server.log"), "-o",
      `-k ${socketDir} -c listen_addresses= -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_connections=20`,
      "-w", "-t", "60", "start"], { timeout });
  } catch (e) {
    const detail = String((e as any)?.stderr || (e as Error)?.message || e).split("\n").filter(Boolean).pop() ?? "";
    cleanup();
    throw new AdapterError("runtime_unavailable", `the disposable Postgres could not be started (${detail}); ${RUNTIME_MISSING}`, dataDir);
  }
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    process.removeListener("exit", stop);
    try { execFileSync(pgCtl, ["-D", dataDir, "-m", "immediate", "-w", "-t", "30", "stop"], { stdio: "ignore" }); } catch { /* the data directory goes anyway */ }
    cleanup();
  };
  // A caller that forgets close(), or a process that dies before it, still leaves no postmaster and no temp
  // directory behind: 'exit' runs after an uncaught exception too, and every step here is synchronous.
  if (process.listenerCount("exit") + 2 >= process.getMaxListeners()) process.setMaxListeners(process.getMaxListeners() + 8);
  process.once("exit", stop);
  return {
    dataDir, socketDir, superuser,
    url: (database, user = superuser) => `postgresql://${encodeURIComponent(user)}@/${encodeURIComponent(database)}?host=${encodeURIComponent(socketDir)}`,
    stop,
  };
}

const RETAINED_DB = "aftergrid_retained";
const RETAINED_ROLE = "aftergrid_analysis";

export type RetainedInputRef = { id: string; kind: string; path: string; content_hash: { value: string }; runtime?: RetainedRuntime };

/**
 * Open retained inputs for a rerun on a disposable Postgres. Every extract is hash-verified before it is loaded; a
 * missing or corrupt extract is an explicit error, and no path here reaches the live source. Only the listed
 * inputs exist on the instance, and the analysis connects as a role that holds SELECT and nothing else.
 */
export async function openRetained(baseDir: string, inputs: RetainedInputRef[], limits: Partial<ResourceLimits> = {}): Promise<RetainedSession> {
  const lim: ResourceLimits = normalizeLimits({ ...DEFAULT_LIMITS, ...limits });
  const files = new Map<string, string>();
  const notes: string[] = [];
  const retyped: string[] = [];
  for (const inp of inputs) {
    if (inp.kind !== "extract") throw new AdapterError("not_implemented", `retained input kind ${inp.kind} is not supported for rerun yet`, inp.id);
    ident(inp.id);
    const full = (() => { try { return safePath(baseDir, inp.path); } catch (e) { throw asAdapterError(e); } })() as string;
    if (!existsSync(full)) throw new AdapterError("missing_file", `retained input ${inp.id} (${inp.path}) is unavailable; rerun cannot proceed and will not read a live source`, inp.path);
    if (sha(readFileSync(full)) !== inp.content_hash.value) throw new AdapterError("hash_mismatch", `retained input ${inp.id} content differs from its recorded hash; rerun refused`, inp.path);
    files.set(inp.id, full);
  }
  const instance = await provisionDisposablePostgres();
  let owner: Session | undefined;
  let analysis: Session | undefined;
  try {
    // Provisioning statements are Engine-issued, never authored SQL: they run outside the read-only session default.
    owner = await Session.open(instance.url("postgres"), lim);
    await owner.client.query("SET default_transaction_read_only = off");
    await owner.client.query(`CREATE DATABASE ${ident(RETAINED_DB)}`);
    await owner.close(); owner = undefined;

    owner = await Session.open(instance.url(RETAINED_DB), lim);
    await owner.client.query("SET default_transaction_read_only = off");
    // A fresh instance has only built-in types: an enum, domain or composite recorded at capture does not exist
    // here. Such a column is restored as text (the extract holds its text rendering) and the substitution is
    // recorded, rather than failing the rerun with `type "mood" does not exist`.
    const builtin = await builtinTypes(owner, inputs.flatMap((i) => (i.runtime?.columns ?? []).map((c) => retainedType(c.sql_type))), lim.statement_timeout_ms);
    for (const inp of inputs) {
      const declared = inp.runtime?.columns ?? [];
      if (!declared.length) notes.push(inp.id);
      const columns = declared.length
        ? declared.map((c) => {
            const want = retainedType(c.sql_type);
            const known = builtin.has(want.endsWith("[]") ? want.slice(0, -2) : want);
            if (!known) retyped.push(`${inp.id}.${c.name} (${c.sql_type})`);
            return { name: c.name, sql_type: known ? want : "text" };
          })
        : headerOf(files.get(inp.id)!).map((name) => ({ name, sql_type: "text" }));
      const ddl = columns.map((c) => `${retainedColumn(inp.id, c.name)} ${c.sql_type}`).join(", ");
      await owner.client.query(`CREATE TABLE ${ident(inp.id)} (${ddl})`);
      // Server-side COPY on an instance this process just created, reading the hash-verified extract by absolute path.
      await owner.client.query(`COPY ${ident(inp.id)} FROM ${sqlString(files.get(inp.id)!)} WITH (FORMAT csv, HEADER, NULL '')`);
    }
    await owner.client.query(`CREATE ROLE ${ident(RETAINED_ROLE)} LOGIN`);
    await owner.client.query(`REVOKE ALL ON DATABASE ${ident(RETAINED_DB)} FROM PUBLIC`);
    await owner.client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await owner.client.query(`GRANT CONNECT ON DATABASE ${ident(RETAINED_DB)} TO ${ident(RETAINED_ROLE)}`);
    await owner.client.query(`GRANT USAGE ON SCHEMA public TO ${ident(RETAINED_ROLE)}`);
    await owner.client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${ident(RETAINED_ROLE)}`);
    await owner.client.query(`ALTER ROLE ${ident(RETAINED_ROLE)} SET default_transaction_read_only = on`);
    await owner.close(); owner = undefined;

    analysis = await Session.open(instance.url(RETAINED_DB, RETAINED_ROLE), lim);
  } catch (e) {
    await owner?.close(); await analysis?.close(); instance.stop();
    throw mapError(e, lim.statement_timeout_ms, "restoring the retained inputs");
  }
  const session = analysis!;
  let queue: Promise<unknown> = Promise.resolve();
  let closed = false;
  const serialize = <T,>(fn: () => Promise<T>): Promise<T> => { const next = queue.then(fn, fn); queue = next.then(() => undefined, () => undefined); return next; };
  const fallback = (notes.length ? `; extracts restored as all-text columns because no column types were recorded: ${notes.join(", ")}` : "")
    + (retyped.length ? `; columns restored as text because their recorded type is not a built-in type on the rerun instance: ${retyped.join(", ")}` : "");
  return {
    execute(sql, params, opts = {}) {
      return serialize(() => translate(async () => {
        if (closed) throw new AdapterError("closed", "retained session is closed", baseDir);
        const bound = bindNamed(sql, guard(sql), params);
        const { columns, rows } = await session.typed(bound.text, bound.values, opts.timeout_ms ?? lim.statement_timeout_ms, "statement");
        const admission: Admission = {
          decision: "admitted", basis: "unknown_estimate_with_enforced_limits",
          estimate: { status: "unknown", reason: `retained inputs are bounded extracts on a disposable Postgres; admission is by enforced limits${fallback}` },
          limits: lim,
        };
        return { columns, rows, admission };
      }));
    },
    close() { return serialize(async () => { if (closed) return; closed = true; await session.close(); instance.stop(); }); },
  };
}

/** A recorded column type, validated before it is ever interpolated into DDL. */
function retainedType(sql_type: string): string {
  const array = sql_type.endsWith("[]");
  return pgTypeName((array ? sql_type.slice(0, -2) : sql_type)) + (array ? "[]" : "");
}

/** Which of these type names the rerun instance actually has, as built-in `pg_catalog` types. */
async function builtinTypes(owner: Session, wanted: string[], timeoutMs: number): Promise<Set<string>> {
  const names = [...new Set(wanted.map((t) => (t.endsWith("[]") ? t.slice(0, -2) : t)))];
  if (!names.length) return new Set();
  const r = await owner.raw(
    "select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'pg_catalog' and t.typname = any($1::text[])",
    [`{${names.join(",")}}`], timeoutMs, "reading the rerun instance's types");
  return new Set((r.rows as any[][]).map((row) => String(row[0])));
}

/** A column of a retained extract, reported as a column when it cannot be restored — never as a table. */
function retainedColumn(id: string, name: string): string {
  try { return identifier(name); } catch {
    throw new AdapterError("unsafe_identifier", `retained input ${id} has a column named ${JSON.stringify(name)} that cannot be restored: column names must match ^[a-z][a-z0-9_]{0,63}$`, `${id}.${name}`);
  }
}

/**
 * Column names of an extract whose adapter recorded no column types: every column is restored as text. The header
 * is parsed as CSV, not split on bare commas, so a name containing a comma stays one name (and is then reported as
 * an unrestorable column, instead of tearing the header into more columns than the rows have).
 */
function headerOf(file: string): string[] {
  const first = (readFileSync(file, "utf8").split("\n")[0] ?? "").replace(/\r$/, "");
  const names: string[] = [];
  let cur = ""; let quoted = false; let fresh = true;
  for (let i = 0; i < first.length; i++) {
    const ch = first[i]!;
    if (quoted) {
      if (ch !== '"') { cur += ch; continue; }
      if (first[i + 1] === '"') { cur += '"'; i++; continue; }
      quoted = false; continue;
    }
    if (ch === '"' && fresh) { quoted = true; fresh = false; continue; }
    if (ch === ",") { names.push(cur.trim()); cur = ""; fresh = true; continue; }
    cur += ch; fresh = false;
  }
  names.push(cur.trim());
  if (quoted) throw new AdapterError("invalid_artifact", `retained extract ${file} has an unterminated quoted name in its CSV header`, file);
  if (!names.length || names.some((n) => !n)) throw new AdapterError("invalid_artifact", `retained extract ${file} has no usable CSV header`, file);
  return names;
}
