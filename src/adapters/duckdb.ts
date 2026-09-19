// DuckDB adapter: read-only local data, a sandboxed in-process engine, honest capabilities.
// Sandbox settings and the single-SELECT/named-parameter policy mirror scripts/fixture-tool.mjs (code review
// 2026-09-15) so the fixture build and the CLI execute SQL the same way.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { AdapterError } from "./contract.ts";
import { admit, captureRefusal, DEFAULT_ESTIMATE_CAP_ROWS } from "./admission.ts";
import type { Adapter, CapabilityMatrix, Estimate, ExecuteResult, PrivilegeProbe, RetainedInput, RetainedSession, ResourceLimits, SqlParams, CatalogTable, TableAdmission } from "./contract.ts";
// @ts-ignore: shared path containment and SQL string quoting.
import { safePath, sqlString, ContractError } from "../../scripts/fixture-safety.mjs";
// @ts-ignore: the one SQL execution policy, shared with the fixture builder.
import { SANDBOX_SETTINGS, DEFAULT_LIMITS as RUNNER_LIMITS, applyLimits, sealConnection, openRetainedDatabase, runSelect, runBounded, CSV_READ_OPTIONS, csvText, identifier } from "../../scripts/lib/sql-runner.mjs";
// @ts-ignore: shared decimal validator.
import { decimal as sharedDecimal } from "../../scripts/fixture-safety.mjs";

export type DuckDbSource =
  | { kind: "duckdb_file"; path: string }        // opened READ_ONLY
  | { kind: "csv_dir"; path: string };           // each <table>.csv exposed as a table; the directory is never written

export type DuckDbOptions = { source: DuckDbSource; limits?: Partial<ResourceLimits>; estimate_cap_rows?: number };

const DEFAULT_LIMITS: ResourceLimits = { ...RUNNER_LIMITS };
const SANDBOX: Record<string, string> = { ...SANDBOX_SETTINGS };
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function api() { return await import("@duckdb/node-api"); }

/** Every authored statement goes through the shared runner; ContractError categories become AdapterError. */
async function guardedRun(c: any, sql: string, params: SqlParams, limits: ResourceLimits, timeoutMs: number): Promise<{ columns: ExecuteResult["columns"]; rows: ExecuteResult["rows"] }> {
  try {
    const { names, types, rows } = await runSelect(c, sql, params, { timeoutMs, limits });
    return { columns: (names as string[]).map((n, i) => ({ name: n, sql_type: (types as string[])[i]! })), rows };
  } catch (e) {
    if (e instanceof ContractError) throw new AdapterError((e as any).category, e.message, String((e as any).location));
    throw e;
  }
}

function maxCardinality(plan: any): number | null {
  let max: number | null = null;
  const walk = (node: any) => {
    const raw = node?.extra_info?.["Estimated Cardinality"];
    if (raw !== undefined) { const n = Number(raw); if (Number.isFinite(n)) max = max === null ? n : Math.max(max, n); }
    for (const child of node?.children ?? []) walk(child);
  };
  for (const root of Array.isArray(plan) ? plan : [plan]) walk(root);
  return max;
}

async function estimateOn(c: any, sql: string, params: SqlParams, timeoutMs: number): Promise<Estimate> {
  const { StatementType } = await api();
  let p: any;
  // Planning is bounded by the same statement timeout as execution.
  const timer = setTimeout(() => { try { c.interrupt(); } catch { /* finished */ } }, timeoutMs);
  try {
    const statements = await c.extractStatements(sql);
    if (statements.count !== 1) return { status: "unknown", reason: "not a single statement" };
    p = await statements.prepare(0);
    if (p.statementType !== StatementType.SELECT) return { status: "unknown", reason: "not a SELECT" };
    p.destroySync(); p = undefined;
    // EXPLAIN never executes. Named parameters are bound with the real values so filters are estimated as written.
    const ex = await c.extractStatements("EXPLAIN (FORMAT JSON) " + sql);
    p = await ex.prepare(0);
    const bindings: Record<string, unknown> = Object.create(null);
    for (let i = 1; i <= p.parameterCount; i++) { const name = p.parameterName(i); if (!Object.hasOwn(params, name)) return { status: "unknown", reason: `missing parameter $${name}` }; bindings[name] = params[name]; }
    if (p.parameterCount) p.bind(bindings);
    const r = await p.runAndReadAll();
    const row = r.getRowObjectsJson()[0];
    const plan = JSON.parse(String(row.explain_value));
    const scan = maxCardinality(plan);
    if (scan === null) return { status: "unknown", reason: "planner reported no cardinality" };
    // rows: the topmost node that reports a cardinality (what the query returns); scan_rows: the largest planned scan.
    let top: number | null = null;
    const queue: any[] = Array.isArray(plan) ? [...plan] : [plan];
    while (queue.length && top === null) { const n = queue.shift(); const raw = n?.extra_info?.["Estimated Cardinality"]; if (raw !== undefined && Number.isFinite(Number(raw))) top = Number(raw); else queue.push(...(n?.children ?? [])); }
    return { status: "estimated", rows: top ?? scan, unit: "estimated_rows", scan_rows: scan };
  } catch (e) {
    return { status: "unknown", reason: String((e as Error).message ?? e).split("\n")[0]! };
  } finally { clearTimeout(timer); p?.destroySync?.(); }
}

export class DuckDbAdapter implements Adapter {
  readonly name = "duckdb" as const;
  private limits: ResourceLimits;
  private cap: number;
  private db: any; private conn: any;
  private tables: string[] = [];
  private opts: DuckDbOptions;
  constructor(opts: DuckDbOptions) {
    this.opts = opts;
    this.limits = { ...DEFAULT_LIMITS, ...(opts.limits ?? {}) };
    this.cap = opts.estimate_cap_rows ?? DEFAULT_ESTIMATE_CAP_ROWS;
  }
  capabilities(): CapabilityMatrix {
    return {
      execute: { status: "supported", note: "single SELECT, named parameters, JSON-safe typed cells" },
      capture: { status: "supported", note: "CSV extracts of whole tables from one connection; content hashes recorded" },
      open_retained: { status: "supported", note: "extracts loaded into a fresh in-memory database with external access disabled" },
      privilege_probe: { status: "unsupported", note: "DuckDB has no roles; safety comes from READ_ONLY file access or read-only CSV views, not from a role probe" },
      cost_estimate: { status: "supported", note: "EXPLAIN (FORMAT JSON) without execution; unit estimated_rows; unknown when the planner reports none" },
      resource_limits: { status: "partial", note: "memory_limit and threads are enforced by the engine; the statement timeout is an interrupt from this process and also bounds planning, capture and source materialization; no CPU or disk quota; calls on one adapter are serialized" },
      cancellation: { status: "supported", note: "interrupt() on timeout; the connection is reusable afterwards" },
      statement_guard: { status: "supported", note: "one statement, SELECT only, external file access disabled after inputs load, declared inputs only in retained sessions" },
      catalog: { status: "supported", note: "information_schema.columns" },
    };
  }
  private opening?: Promise<any>;
  private generation = 0;            // bumped by close(); an open that finishes for an older generation is discarded
  private queue: Promise<unknown> = Promise.resolve();
  /**
   * Concurrency contract: one connection, one statement at a time. execute/capture/estimate/catalog calls are
   * serialized in call order, because each statement's timeout interrupts the shared connection and capture runs a
   * transaction; overlapping callers therefore never cancel each other. Use separate adapters for parallelism.
   */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }
  private closed = false;
  private async open() {
    if (this.closed) throw new AdapterError("closed", "adapter is closed", this.opts.source.path);
    if (this.conn) return this.conn;
    if (!this.opening) this.opening = this.openFresh().finally(() => { this.opening = undefined; });
    return this.opening;
  }
  /** Initialise into locals; publish the connection only after the sandbox is sealed and only if close() has not run meanwhile. */
  private async openFresh() {
    const { DuckDBInstance } = await api();
    const gen = this.generation;
    let db: any, conn: any; const tables: string[] = [];
    try {
      if (this.opts.source.kind === "duckdb_file") {
        if (!existsSync(this.opts.source.path)) throw new AdapterError("missing_file", `database ${this.opts.source.path} not found`, this.opts.source.path);
        db = await DuckDBInstance.create(this.opts.source.path, { ...SANDBOX, access_mode: "READ_ONLY" });
        conn = await db.connect();
        await applyLimits(conn, this.limits);
        const t = await conn.runAndReadAll("select table_name from information_schema.tables where table_schema='main' order by 1");
        tables.push(...t.getRowObjectsJson().map((r: any) => String(r.table_name)));
      } else {
        const dir = this.opts.source.path;
        if (!existsSync(dir)) throw new AdapterError("missing_file", `source directory ${dir} not found`, dir);
        db = await DuckDBInstance.create(":memory:", SANDBOX);
        conn = await db.connect();
        await applyLimits(conn, this.limits);
        for (const f of readdirSync(dir).filter((x) => x.endsWith(".csv")).sort()) {
          const table = basename(f, ".csv");
          if (!/^[a-z][a-z0-9_]{0,63}$/.test(table)) continue;
          // Materialised once; the source directory is never written. DML is refused by the guard before the engine.
          // Materialisation is bounded by the statement timeout like every other source read.
          await runBounded(conn, `create table ${identifier(table)} as select * from read_csv(${sqlString(safePath(dir, f))}, ${CSV_READ_OPTIONS})`, this.limits.statement_timeout_ms, `loading ${table}`);
          tables.push(table);
        }
      }
      // READ_ONLY stops database writes, not filesystem reads: both source kinds are sealed before any authored SQL.
      await sealConnection(conn);
      if (gen !== this.generation || this.closed) throw new AdapterError("closed", "adapter was closed while opening", this.opts.source.path);
    } catch (e) {
      if (e instanceof ContractError) e = new AdapterError((e as any).category, (e as Error).message, String((e as any).location));
      try { conn?.closeSync(); } catch { /* ignore */ } try { db?.closeSync(); } catch { /* ignore */ }
      throw e;
    }
    this.db = db; this.conn = conn; this.tables = tables;
    return conn;
  }
  async probePrivileges(): Promise<PrivilegeProbe> {
    return { status: "unsupported", reason: this.opts.source.kind === "duckdb_file" ? "no roles in DuckDB; the file is opened READ_ONLY, which the engine enforces for every statement" : "no roles in DuckDB; CSV sources are exposed as read-only views" };
  }
  async estimate(sql: string, params: SqlParams, opts: { timeout_ms?: number } = {}): Promise<Estimate> {
    return this.serialize(async () => estimateOn(await this.open(), sql, params, opts.timeout_ms ?? this.limits.statement_timeout_ms));
  }
  async execute(sql: string, params: SqlParams, opts: { timeout_ms?: number } = {}): Promise<ExecuteResult> {
    return this.serialize(async () => {
      const c = await this.open();
      const timeout = opts.timeout_ms ?? this.limits.statement_timeout_ms;
      const est = await estimateOn(c, sql, params, timeout);
      const admission = admit(est, this.cap, this.limits);
      if (admission.decision === "rejected") throw new AdapterError("admission", admission.reason, "SQL");
      const { columns, rows } = await guardedRun(c, sql, params, this.limits, timeout);
      return { columns, rows, admission };
    });
  }
  async capture(tables: string[], destDir: string, opts: { description?: string; timeout_ms?: number } = {}): Promise<RetainedInput[]> {
    return this.serialize(() => this.captureNow(tables, destDir, opts));
  }
  /** The planner's view of `select * from <table>` — the read capture performs — and the admission it earns. */
  private async admissionOf(c: any, table: string, timeout: number): Promise<TableAdmission> {
    const estimate = await estimateOn(c, `select * from ${identifier(table)}`, {}, timeout);
    const bytes = this.sourceBytes(table);
    return { table, estimate, ...(bytes === undefined ? {} : { bytes }), admission: admit(estimate, this.cap, this.limits) };
  }
  /** The source's own size, where the source has one file per table. A `.duckdb` file holds every table at once, so no per-table size is claimed. */
  private sourceBytes(table: string): number | undefined {
    if (this.opts.source.kind !== "csv_dir") return undefined;
    try { return statSync(safePath(this.opts.source.path, `${table}.csv`) as string).size; } catch { return undefined; }
  }
  async tableAdmissions(tables: string[]): Promise<TableAdmission[]> {
    return this.serialize(async () => {
      const c = await this.open();
      const out: TableAdmission[] = [];
      for (const table of tables) {
        if (!this.tables.includes(table)) throw new AdapterError("unresolved_reference", `table ${table} is not in the source catalog`, table);
        out.push(await this.admissionOf(c, table, this.limits.statement_timeout_ms));
      }
      return out;
    });
  }
  private async captureNow(tables: string[], destDir: string, opts: { description?: string; timeout_ms?: number }): Promise<RetainedInput[]> {
    const c = await this.open();
    const out: RetainedInput[] = [];
    const captured_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    for (const table of tables) if (!this.tables.includes(table)) throw new AdapterError("unresolved_reference", `table ${table} is not in the source catalog`, table);
    // Admission first, for every table, before a directory is made or a byte is read: capture's read IS the whole
    // table, so the cap that bounds `execute` bounds it too, and a refusal must leave the Finding untouched.
    for (const table of tables) {
      const { estimate, admission } = await this.admissionOf(c, table, opts.timeout_ms ?? this.limits.statement_timeout_ms);
      if (admission.decision === "rejected") throw new AdapterError("admission", captureRefusal(table, estimate.status === "estimated" ? estimate.scan_rows : NaN, this.cap), table);
    }
    mkdirSync(join(destDir, "inputs"), { recursive: true });
    // One read transaction for every table, so the extracts are a single consistent view (DuckDB MVCC snapshot).
    await c.run("BEGIN TRANSACTION");
    try {
      for (const table of tables) {
        const rel = `inputs/${table}.csv`;
        const full = safePath(destDir, rel);
        // Deterministic order for a stable hash; bounded by the statement timeout like any other read.
        const { columns, rows } = await guardedRun(c, `select * from ${identifier(table)} order by all`, {}, this.limits, opts.timeout_ms ?? this.limits.statement_timeout_ms);
        const bytes = Buffer.from(csvText(columns.map((x) => x.name), rows), "utf8");
        writeFileSync(full, bytes);
        out.push({ id: table, kind: "extract", path: rel, content_hash: { algorithm: "sha256", value: sha(bytes) }, captured_at,
          description: opts.description ?? `Whole-table extract of ${table} from ${this.opts.source.kind} ${basename(this.opts.source.path)}`,
          source: { adapter: "duckdb", method: `select * from ${table} order by all inside one read transaction, written as CSV (NULL empty, empty string quoted)`, tables: [table], consistency: "single_transaction" } });
      }
    } finally { try { await c.run("COMMIT"); } catch { /* read-only transaction */ } }
    return out;
  }
  async catalog(): Promise<CatalogTable[]> { return this.serialize(() => this.catalogNow()); }
  private async catalogNow(): Promise<CatalogTable[]> {
    const c = await this.open();
    const r = await c.runAndReadAll("select table_name, column_name, data_type from information_schema.columns where table_schema='main' order by table_name, ordinal_position");
    const map = new Map<string, CatalogTable>();
    for (const row of r.getRowObjectsJson() as any[]) {
      const t = String(row.table_name); if (!map.has(t)) map.set(t, { name: t, columns: [] });
      map.get(t)!.columns.push({ name: String(row.column_name), sql_type: String(row.data_type) });
    }
    return [...map.values()];
  }
  /** Closes for good: queued or in-flight opens discard their connection instead of publishing it; later calls fail with `closed`. */
  async close() {
    this.closed = true;
    this.generation++;
    const pending = this.opening;
    try { this.conn?.closeSync(); this.db?.closeSync(); } finally { this.conn = undefined; this.db = undefined; this.tables = []; }
    if (pending) await pending.catch(() => undefined);
  }
}

/**
 * Open retained inputs for a rerun. Every extract is hash-verified before it is loaded; a missing or corrupt
 * extract is an explicit error and never falls back to a live source. Only the listed inputs are visible.
 */
export async function openRetained(baseDir: string, inputs: { id: string; kind: string; path: string; content_hash: { value: string } }[], limits: Partial<ResourceLimits> = {}): Promise<RetainedSession> {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  for (const inp of inputs) {
    if (inp.kind !== "extract") throw new AdapterError("not_implemented", `retained input kind ${inp.kind} is not supported for rerun yet`, inp.id);
    const full = safePath(baseDir, inp.path);
    if (!existsSync(full)) throw new AdapterError("missing_file", `retained input ${inp.id} (${inp.path}) is unavailable; rerun cannot proceed and will not read a live source`, inp.path);
    const actual = sha(readFileSync(full));
    if (actual !== inp.content_hash.value) throw new AdapterError("hash_mismatch", `retained input ${inp.id} content differs from its recorded hash; rerun refused`, inp.path);
  }
  const { c, close } = await openRetainedDatabase(baseDir, inputs, lim);
  // Same contract as the adapter: one statement at a time, close is terminal.
  let queue: Promise<unknown> = Promise.resolve(); let closed = false;
  const serialize = <T,>(fn: () => Promise<T>): Promise<T> => { const next = queue.then(fn, fn); queue = next.then(() => undefined, () => undefined); return next; };
  return {
    execute(sql, params, opts = {}) {
      return serialize(async () => {
        if (closed) throw new AdapterError("closed", "retained session is closed", baseDir);
        const { columns, rows } = await guardedRun(c, sql, params, lim, opts.timeout_ms ?? lim.statement_timeout_ms);
        return { columns, rows, admission: { decision: "admitted", basis: "unknown_estimate_with_enforced_limits", estimate: { status: "unknown", reason: "retained inputs are bounded extracts; admission is by enforced limits" }, limits: lim } };
      });
    },
    close() { return serialize(async () => { if (!closed) { closed = true; close(); } }); },
  };
}
