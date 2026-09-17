// The adapter contract every warehouse backend implements (spec: Adapters). Capabilities are declared per
// backend from evidence, never assumed; an unsupported required capability fails or takes an explicit,
// recorded fallback, never a silent green.
export type Capability =
  | "execute" | "capture" | "open_retained" | "privilege_probe" | "cost_estimate"
  | "resource_limits" | "cancellation" | "statement_guard" | "catalog";
export type CapabilityStatus = "supported" | "unsupported" | "partial";
export type CapabilityMatrix = Record<Capability, { status: CapabilityStatus; note: string }>;

export type SqlParams = Record<string, string | number | boolean | null>;
export type ColumnMeta = { name: string; sql_type: string };
/** Rows as JSON-safe values: integers as numbers, decimals/dates/timestamps as strings, booleans, null. */
export type ExecuteResult = { columns: ColumnMeta[]; rows: Record<string, string | number | boolean | null>[]; admission: Admission };

/**
 * A non-executing planner estimate. `unit` names the planner model the numbers came from, never a promise of
 * accuracy: `estimated_rows` is DuckDB's estimated cardinality; `planner_cost` is Postgres `EXPLAIN` without
 * `ANALYZE`, where `rows`/`scan_rows` are plan-row estimates and `cost` is the planner's abstract total cost.
 */
export type Estimate =
  | { status: "estimated"; rows: number; unit: "estimated_rows" | "planner_cost"; scan_rows: number; cost?: number }
  | { status: "unknown"; reason: string };

export type Admission =
  | { decision: "admitted"; basis: "estimate_under_cap"; estimate: Estimate; cap: number }
  | { decision: "admitted"; basis: "unknown_estimate_with_enforced_limits"; estimate: Estimate; limits: ResourceLimits }
  | { decision: "rejected"; reason: string; estimate?: Estimate };

export type ResourceLimits = { statement_timeout_ms: number; memory_limit: string; threads: number };

export type PrivilegeProbe =
  | { status: "unsupported"; reason: string }
  | { status: "supported"; can_write: boolean; can_ddl: boolean; detail: string };

export type Hash = { algorithm: "sha256"; value: string };
/**
 * What a rerun needs to rebuild an extract's table faithfully on a disposable instance of the same engine.
 * Optional and additive: an adapter that cannot state it omits it, and a rerun then falls back to all-text
 * columns and says so. The Finding manifest schema does not carry this field, so the same facts are also
 * summarised in `description`, which it does carry.
 */
export type RetainedRuntime = { engine: string; server_version: string; columns: { name: string; sql_type: string; nullable: boolean }[] };
export type RetainedInput = {
  id: string; kind: "extract"; path: string; content_hash: Hash; captured_at: string; description: string;
  source: { adapter: string; method: string; tables: string[]; consistency: "single_transaction" | "per_table" | "unknown" };
  runtime?: RetainedRuntime;
};
export type CatalogTable = { name: string; columns: { name: string; sql_type: string }[] };

/**
 * What a whole-table read of one table would cost, without reading it: the planner's estimate for
 * `select * from <table>` and the admission that estimate earns. `bytes` is the source's own on-disk size where
 * the backend can state one (a CSV file's length, `pg_table_size`), omitted where it cannot — it is never
 * inferred from the row estimate. This is what `capture --catalog` reports and what `capture` itself refuses on
 * (docs/contracts/adapters.md, "Large sources: the windowed Instance pattern").
 */
export type TableAdmission = { table: string; estimate: Estimate; bytes?: number; admission: Admission };

export class AdapterError extends Error {
  category: string; location: string;
  constructor(category: string, message: string, location = "") { super(message); this.category = category; this.location = location; }
}

export interface Adapter {
  readonly name: "duckdb" | "postgres";
  capabilities(): CapabilityMatrix;
  probePrivileges(): Promise<PrivilegeProbe>;
  estimate(sql: string, params: SqlParams): Promise<Estimate>;
  /** Guarded execution against the connected source: single SELECT, admission by estimate, limits active throughout. */
  execute(sql: string, params: SqlParams, opts?: { timeout_ms?: number }): Promise<ExecuteResult>;
  /**
   * Capture whole-table extracts of the named tables (no row bound is applied; the analytical window lives in SQL)
   * into destDir as retained inputs with content hashes. Because the read is the whole table, every table is
   * admitted against the same cap `execute` uses before anything is written; a table over the cap is refused with
   * `admission` and nothing is read or written at all.
   */
  capture(tables: string[], destDir: string, opts?: { description?: string }): Promise<RetainedInput[]>;
  catalog(): Promise<CatalogTable[]>;
  /**
   * Per-table planner estimate, source bytes where known, and whether a whole-table capture would be admitted —
   * without executing or capturing anything. Optional and additive: an adapter that cannot plan a bare table read
   * omits it, and `capture --catalog` then reports columns only.
   */
  tableAdmissions?(tables: string[]): Promise<TableAdmission[]>;
  close(): Promise<void>;
}

export interface RetainedSession {
  execute(sql: string, params: SqlParams, opts?: { timeout_ms?: number }): Promise<ExecuteResult>;
  close(): Promise<void>;
}
