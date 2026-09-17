// Opening the Instance's configured source, and nothing else.
//
// `aftergrid.yaml` names a connection (docs/contracts/instance-layout.md); this turns that into an Adapter.
// The Postgres branch passes the NAME of the environment variable through untouched, because the adapter reads
// `process.env` itself and a connection string must never reach a file, a report or a log.
import { existsSync } from "node:fs";
import { DuckDbAdapter, type DuckDbSource } from "../adapters/duckdb.ts";
import { PostgresAdapter } from "../adapters/postgres.ts";
import { AdapterError, type Adapter } from "../adapters/contract.ts";
import type { Instance } from "../instance.ts";
import { statSync } from "node:fs";
// @ts-ignore: shared path containment (JS module, no types).
import { safePath } from "../../scripts/fixture-safety.mjs";

/**
 * `connection.<backend>.estimate_cap` as the adapters take it: the largest planned scan any read may make, so a
 * whole number of rows greater than zero. It is validated here rather than coerced, because `Number()` turns
 * `abc` into `NaN` (a cap that refuses every table, with the planner's number compared against nothing), `true`
 * into `1` (a cap that refuses every table but an empty one) and `-1` into a cap nothing can ever meet — each of
 * them a silent, total refusal blamed on the source instead of on the line that configured it. Absent is not
 * invalid: the adapter's own default (`DEFAULT_ESTIMATE_CAP_ROWS`) stands.
 */
function estimateCapRows(raw: unknown, backend: "duckdb" | "postgres"): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n <= 0) {
    throw new AdapterError("invalid_artifact",
      `connection.${backend}.estimate_cap is ${JSON.stringify(raw)}, which is not a number of rows`,
      `aftergrid.yaml#/connection/${backend}/estimate_cap`);
  }
  return n;
}

/** The remedy for an unusable `estimate_cap`, in the words the command prints. */
export const ESTIMATE_CAP_REMEDY =
  "estimate_cap is the largest planned scan a read may make, so set it to a whole number of rows greater than zero "
  + "(the default is 5000000) or remove the line to take that default; nothing was read and nothing was written";

/**
 * The adapter for this Instance's connection, plus a one-line description of what was opened that carries no
 * credential. Throws `AdapterError` with a category `check` already knows when the connection is unusable.
 */
export function openInstanceAdapter(instance: Instance): { adapter: Adapter; description: string } {
  const connection = (instance.config as any).connection ?? {};
  const kind = connection.adapter;
  if (kind === "postgres") {
    const urlEnv = connection.postgres?.url_env;
    if (!urlEnv) throw new AdapterError("missing_credential", "aftergrid.yaml names the postgres adapter but no connection.postgres.url_env", "aftergrid.yaml#/connection/postgres/url_env");
    // The same `undefined`/`null` guard as the duckdb branch below, not truthiness: `0` is a value an Operator
    // wrote down, and a cap of zero has to be refused by the validator rather than disappear into the default.
    const pgCap = estimateCapRows(connection.postgres.estimate_cap, "postgres");
    const adapter = new PostgresAdapter({
      connection_string_env: urlEnv,
      ...(connection.postgres.schema ? { schema: connection.postgres.schema } : {}),
      ...(connection.postgres.statement_timeout_ms ? { limits: { statement_timeout_ms: Number(connection.postgres.statement_timeout_ms) } } : {}),
      ...(pgCap === undefined ? {} : { estimate_cap_rows: pgCap }),
    });
    return { adapter, description: `postgres source named by the environment variable ${urlEnv} (the connection string is never read into a report)` };
  }
  if (kind !== "duckdb") {
    throw new AdapterError("not_implemented", `connection.adapter '${String(kind)}' is not a supported adapter; v0 ships duckdb and postgres`, "aftergrid.yaml#/connection/adapter");
  }
  const rel = connection.duckdb?.path;
  if (!rel) throw new AdapterError("missing_file", "aftergrid.yaml names the duckdb adapter but no connection.duckdb.path", "aftergrid.yaml#/connection/duckdb/path");
  const path = safePath(instance.root, String(rel)) as string;
  if (!existsSync(path)) throw new AdapterError("missing_file", `the configured DuckDB source ${rel} does not exist inside the Instance`, String(rel));
  const source: DuckDbSource = statSync(path).isDirectory() ? { kind: "csv_dir", path } : { kind: "duckdb_file", path };
  // `estimate_cap` is the same input the postgres block takes, and it means the same thing on both: the largest
  // planned scan a read — including a whole-table `capture` — may make. Absent, the adapter's own default stands.
  const cap = estimateCapRows(connection.duckdb?.estimate_cap, "duckdb");
  return {
    adapter: new DuckDbAdapter({ source, ...(cap === undefined ? {} : { estimate_cap_rows: cap }) }),
    description: source.kind === "csv_dir"
      ? `duckdb over the read-only CSV directory ${rel}; each <table>.csv is materialised into a sealed in-memory database and the directory is never written`
      : `duckdb file ${rel}, opened with access_mode READ_ONLY, which the engine enforces for every statement`,
  };
}
