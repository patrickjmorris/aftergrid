// Connection and capability validation, through the real adapters and nothing else. Two things this module
// refuses to confuse:
//
//  - DuckDB's `privilege_probe: unsupported` is a fact about DuckDB (it has no roles), not a missing safety
//    policy. The safety there is the read-only local-file policy the engine enforces on every statement, and
//    that is what gets reported.
//  - A Postgres role that can write or run DDL is refused. A connection that works is not a connection that is
//    safe, and setup never records the second because it observed the first.
//
// No connection string, and nothing derived from one, reaches a report, a file or a log.
import { existsSync, statSync } from "node:fs";
import { DuckDbAdapter, type DuckDbSource } from "../adapters/duckdb.ts";
import { PostgresAdapter } from "../adapters/postgres.ts";
import { AdapterError, type CapabilityMatrix, type PrivilegeProbe } from "../adapters/contract.ts";
import type { Category, Problem } from "../report.ts";

export type ConnectionResult = {
  adapter: "duckdb" | "postgres";
  /** True only when the adapter actually opened the source and answered a question about it. */
  validated: boolean;
  /** True only when a statement really ran against the source. */
  sqlExecuted: boolean;
  capabilities?: CapabilityMatrix;
  probe?: PrivilegeProbe;
  problems: Problem[];
  warnings: Problem[];
  info: string[];
};

const KNOWN: ReadonlySet<string> = new Set<Category>([
  "missing_file", "missing_credential", "runtime_unavailable", "unsafe_path", "admission", "cancelled",
  "resource_limit", "sql_error", "sql_policy", "sql_parameter", "hash_mismatch", "invalid_artifact",
] as Category[]);
const categoryOf = (e: unknown): Category =>
  e instanceof AdapterError && KNOWN.has(e.category) ? (e.category as Category) : "sql_error";

/**
 * Anything that could carry a credential is removed before a message is reported or stored: the value of the
 * connection-string variable itself, and any URL-shaped substring.
 */
export function redact(message: string, secret?: string): string {
  let out = String(message).split("\n")[0] ?? "";
  if (secret && secret.length > 3) out = out.split(secret).join("<redacted>");
  return out.replace(/\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S*/g, "<redacted-url>");
}

const matrixLines = (caps: CapabilityMatrix): string[] =>
  Object.entries(caps).map(([name, c]) => `capability ${name}: ${c.status} — ${c.note}`);

export type ConnectionOptions = {
  instanceRoot: string;
  connection: { adapter: "duckdb"; path: string } | { adapter: "postgres"; urlEnv: string };
};

export async function validateConnection(opts: ConnectionOptions): Promise<ConnectionResult> {
  return opts.connection.adapter === "duckdb"
    ? validateDuckDb(opts.connection.path)
    : validatePostgres(opts.connection.urlEnv);
}

async function validateDuckDb(path: string): Promise<ConnectionResult> {
  const result: ConnectionResult = { adapter: "duckdb", validated: false, sqlExecuted: false, problems: [], warnings: [], info: [] };
  if (!existsSync(path)) {
    result.problems.push({
      category: "missing_file", location: path,
      message: "the configured DuckDB source does not exist, so nothing about it could be validated",
      remedy: "point --duckdb-path at a .duckdb file or at a directory of <table>.csv files inside the Instance, then rerun setup",
    });
    return result;
  }
  const isDir = statSync(path).isDirectory();
  const source: DuckDbSource = isDir ? { kind: "csv_dir", path } : { kind: "duckdb_file", path };
  const adapter = new DuckDbAdapter({ source });
  try {
    const tables = await adapter.catalog();           // opens the source read-only and runs a statement
    result.sqlExecuted = true;
    result.validated = true;
    result.capabilities = adapter.capabilities();
    result.probe = await adapter.probePrivileges();
    result.info.push(
      isDir
        ? `opened ${path} as a read-only CSV source: ${tables.length} table${tables.length === 1 ? "" : "s"} materialised into a sealed in-memory database; the directory itself is never written`
        : `opened ${path} with access_mode READ_ONLY, which the engine enforces for every statement: ${tables.length} table${tables.length === 1 ? "" : "s"} visible`,
    );
    if (tables.length) result.info.push(`tables: ${tables.map((t) => t.name).slice(0, 12).join(", ")}${tables.length > 12 ? `, … (${tables.length} total)` : ""}`);
    else result.warnings.push({ category: "incomplete", location: path, message: "the source opened but holds no tables", remedy: "check that --duckdb-path points at the warehouse you meant; an empty source is valid but nothing can be analysed from it" });
    result.info.push(...matrixLines(result.capabilities));
    // The one sentence this module exists to get right.
    result.info.push(
      `role probing: unsupported by design — ${result.probe.status === "unsupported" ? result.probe.reason : "reported as supported, which DuckDB cannot be"}. ` +
      "DuckDB has no roles, so there is no role to probe; the safety here is the read-only local-file policy above, which the engine enforces. " +
      "An unsupported probe is not a missing safety policy and is never reported as one, and it is never reported as a passed probe either.",
    );
  } catch (e) {
    result.problems.push({
      category: categoryOf(e), location: path,
      message: `the DuckDB source could not be validated: ${redact((e as Error).message ?? String(e))}`,
      remedy: "check the path and that the file is a DuckDB database (or a directory of CSV files); nothing was written",
    });
  } finally {
    await adapter.close().catch(() => undefined);
  }
  return result;
}

// `process.env` and nothing else: it is the environment `PostgresAdapter` itself reads, so a presence check here
// answers the same question the connection will ask a moment later.
async function validatePostgres(urlEnv: string): Promise<ConnectionResult> {
  const result: ConnectionResult = { adapter: "postgres", validated: false, sqlExecuted: false, problems: [], warnings: [], info: [] };
  const secret = process.env[urlEnv];
  if (!secret) {
    result.problems.push({
      category: "missing_credential", location: urlEnv,
      message: `environment variable ${urlEnv} is not set, so the connection could not be opened and no privilege was probed`,
      remedy: `export ${urlEnv} with the connection string of a read-only analysis role before running setup. aftergrid.yaml records the variable NAME only; the URL is never written to a file, a report or a log.`,
    });
    return result;
  }
  let adapter: PostgresAdapter;
  try {
    adapter = new PostgresAdapter({ connection_string_env: urlEnv });
  } catch (e) {
    result.problems.push({
      category: categoryOf(e), location: urlEnv,
      message: redact((e as Error).message ?? String(e), secret),
      remedy: "--pg-url-env takes the NAME of an environment variable, never the connection string itself",
    });
    return result;
  }
  try {
    const probe = await adapter.probePrivileges();
    result.sqlExecuted = true;
    result.validated = true;
    result.probe = probe;
    result.capabilities = adapter.capabilities();
    if (probe.status !== "supported") {
      result.warnings.push({
        category: "incomplete", location: urlEnv,
        message: `the privilege probe did not run: ${probe.reason}. Whether this role can write is unknown, so it is not recorded as read-only.`,
        remedy: "grant the analysis role enough catalogue access to probe its own privileges, or use a role you know is read-only and say so in the Instance's own notes",
      });
    } else if (probe.can_write || probe.can_ddl) {
      result.problems.push({
        category: "write_capable_role", location: urlEnv,
        message: `the connected role can ${[probe.can_write ? "write" : null, probe.can_ddl ? "run DDL" : null].filter(Boolean).join(" and ")}. ${probe.detail} A session setting is not a boundary: the role's own grants are, and these ones permit changing the source.`,
        remedy:
          "create a read-only role for analysis and point the connection string at it, e.g.\n" +
          "  CREATE ROLE aftergrid_analysis LOGIN PASSWORD '…';\n" +
          "  GRANT CONNECT ON DATABASE <db> TO aftergrid_analysis;\n" +
          "  GRANT USAGE ON SCHEMA <schema> TO aftergrid_analysis;\n" +
          "  GRANT SELECT ON ALL TABLES IN SCHEMA <schema> TO aftergrid_analysis;\n" +
          "  ALTER DEFAULT PRIVILEGES IN SCHEMA <schema> GRANT SELECT ON TABLES TO aftergrid_analysis;\n" +
          "  REVOKE CREATE ON SCHEMA <schema> FROM aftergrid_analysis;  -- and CREATE on the database\n" +
          "Then rerun setup. There is no flag that accepts a write-capable role.",
      });
    } else {
      result.info.push(`privilege probe: the connected role cannot write and cannot run DDL. ${probe.detail}`);
    }
    result.info.push(...matrixLines(result.capabilities));
    result.info.push("what stops a write here, in order: the statement guard (a readable refusal), default_transaction_read_only on every session, and the role's own grants — the last of these is the boundary.");
  } catch (e) {
    result.problems.push({
      category: categoryOf(e), location: urlEnv,
      message: `the Postgres source could not be validated: ${redact((e as Error).message ?? String(e), secret)}`,
      remedy: `check that ${urlEnv} points at a reachable database and that the role can connect. The URL is not printed here.`,
    });
  } finally {
    await adapter.close().catch(() => undefined);
  }
  return result;
}
