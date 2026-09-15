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

export type Estimate =
  | { status: "estimated"; rows: number; unit: "estimated_rows"; scan_rows: number }
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
export type RetainedInput = {
  id: string; kind: "extract"; path: string; content_hash: Hash; captured_at: string; description: string;
  source: { adapter: string; method: string; tables: string[]; consistency: "single_transaction" | "per_table" | "unknown" };
};
export type CatalogTable = { name: string; columns: { name: string; sql_type: string }[] };

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
  /** Capture bounded extracts of the named tables into destDir as retained inputs with content hashes. */
  capture(tables: string[], destDir: string, opts?: { description?: string }): Promise<RetainedInput[]>;
  catalog(): Promise<CatalogTable[]>;
  close(): Promise<void>;
}

export interface RetainedSession {
  execute(sql: string, params: SqlParams, opts?: { timeout_ms?: number }): Promise<ExecuteResult>;
  close(): Promise<void>;
}
