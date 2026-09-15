// The one SQL execution policy for aftergrid: used by the fixture builder (scripts/fixture-tool.mjs build),
// the DuckDB adapter (src/adapters/duckdb.ts) and `check --mode rerun`. Keep security decisions here only.
//  - a sandboxed in-memory DuckDB: no extension autoload/install, no temp spill, bounded memory and threads
//  - declared inputs are materialised first, then external file access is disabled and the config locked
//  - authored SQL is exactly one statement, SELECT only; named parameters are bound only when the parser reports them
//  - a statement past its timeout is interrupted; resources are released in finally
//  - a Check result is exactly one row: boolean-or-null `pass`, optional text `detail`
import { ContractError, fail, safePath, sqlString } from "../fixture-safety.mjs";

export const SANDBOX_SETTINGS = Object.freeze({
  autoload_known_extensions: "false", autoinstall_known_extensions: "false",
  allow_community_extensions: "false", allow_unsigned_extensions: "false", max_temp_directory_size: "0B",
});
export const DEFAULT_LIMITS = Object.freeze({ statement_timeout_ms: 10000, memory_limit: "256MB", threads: 2 });

async function api() { return await import("@duckdb/node-api"); }

export async function applyLimits(c, limits = DEFAULT_LIMITS) {
  await c.run(`SET memory_limit=${sqlString(limits.memory_limit)}`);
  await c.run(`SET threads=${Math.max(1, Math.floor(limits.threads))}`);
  await c.run("SET TimeZone='UTC'");
}

/** Lock the sandbox after every declared input has been materialised. */
export async function sealConnection(c) {
  await c.run("SET enable_external_access=false");
  await c.run("SET lock_configuration=true");
}

/**
 * Open a sandbox holding exactly the given retained CSV extracts as tables named by input id.
 * Callers verify hashes before calling this. Returns { c, close }.
 */
export async function openRetainedDatabase(baseDir, inputs, limits = DEFAULT_LIMITS) {
  const { DuckDBInstance } = await api();
  const db = await DuckDBInstance.create(":memory:", { ...SANDBOX_SETTINGS, memory_limit: limits.memory_limit, threads: String(limits.threads) });
  const c = await db.connect();
  try {
    await applyLimits(c, limits);
    for (const inp of inputs) {
      if (inp.kind !== "extract") fail("not_implemented", inp.id, `retained input kind ${inp.kind} is not supported for rerun yet`);
      await c.run(`create table ${identifier(inp.id)} as select * from read_csv(${sqlString(safePath(baseDir, inp.path))}, ${CSV_READ_OPTIONS})`);
    }
    await sealConnection(c);
    return { c, close: () => { c.closeSync(); db.closeSync(); } };
  } catch (e) { c.closeSync(); db.closeSync(); throw e; }
}

/** Execute one authored SELECT with named parameters. Returns { names, types, rows } with JSON-safe rows. */
export async function runSelect(c, sql, params, { timeoutMs = DEFAULT_LIMITS.statement_timeout_ms, limits = DEFAULT_LIMITS } = {}) {
  const { StatementType } = await api();
  const timer = setTimeout(() => { try { c.interrupt(); } catch { /* finished */ } }, timeoutMs);
  let p;
  try {
    const statements = await c.extractStatements(sql);
    if (statements.count !== 1) fail("sql_policy", "SQL", "exactly one SELECT statement is allowed");
    p = await statements.prepare(0);
    if (p.statementType !== StatementType.SELECT) fail("sql_policy", "SQL", "only SELECT statements are allowed");
    const bindings = Object.create(null);
    for (let i = 1; i <= p.parameterCount; i++) {
      const name = p.parameterName(i);
      if (!Object.hasOwn(params, name)) fail("sql_parameter", name, `missing named SQL parameter $${name}`);
      bindings[name] = params[name];
    }
    if (p.parameterCount) p.bind(bindings);
    const r = await p.runAndReadAll();
    const names = r.columnNames();
    const types = r.columnTypes().map((t) => t.toString());
    const rows = r.getRowObjectsJson();
    // TIMESTAMP WITH TIME ZONE is rendered by the client in the process zone; re-render in UTC from the instant.
    const tzCols = names.filter((_, i) => types[i] === "TIMESTAMP WITH TIME ZONE");
    if (tzCols.length) {
      const typed = r.getRowObjects();
      rows.forEach((row, i) => { for (const col of tzCols) { const v = typed[i][col]; row[col] = v === null || v === undefined ? null : utcText(v.micros); } });
    }
    return { names, types, rows };
  } catch (e) {
    if (e instanceof ContractError) throw e;
    const msg = String(e?.message ?? e);
    if (/INTERRUPT/i.test(msg)) fail("cancelled", "SQL", `statement cancelled after ${timeoutMs} ms (statement_timeout)`);
    if (/Out of Memory|memory limit/i.test(msg)) fail("resource_limit", "SQL", `memory limit ${limits.memory_limit} exceeded`);
    fail("sql_error", "SQL", msg.split("\n")[0]);
  } finally { clearTimeout(timer); p?.destroySync?.(); }
}

/** '2026-01-02 03:04:05+00' from a UTC microsecond instant (fractional seconds kept only when non-zero). */
export function utcText(micros) {
  micros = BigInt(micros);
  if (micros >= 9223372036854775807n) return "infinity"; if (micros <= -9223372036854775807n) return "-infinity";
  // Floor division so instants before the epoch keep a non-negative microsecond remainder.
  let seconds = micros / 1000000n; let frac = micros % 1000000n;
  if (frac < 0n) { frac += 1000000n; seconds -= 1n; }
  const base = new Date(Number(seconds) * 1000).toISOString().slice(0, 19).replace("T", " ");
  return frac ? `${base}.${String(frac).padStart(6, "0").replace(/0+$/, "")}+00` : `${base}+00`;
}

/** Lossless CSV policy for retained extracts: NULL is an empty unquoted field; an empty string is "" (quoted). */
export const CSV_READ_OPTIONS = "header=true, all_varchar=true, nullstr='', allow_quoted_nulls=false, quote='\"', escape='\"', delim=','";
export function csvField(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s === "" || /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function csvText(names, rows) {
  const line = (vals) => vals.map(csvField).join(",");
  return line(names) + "\n" + rows.map((row) => line(names.map((n) => row[n]))).join("\n") + (rows.length ? "\n" : "");
}
/** Only conservative identifiers are ever interpolated into SQL, always double-quoted. */
export function identifier(name) {
  if (typeof name !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(name)) fail("unsafe_identifier", String(name), "table names must match ^[a-z][a-z0-9_]{0,63}$");
  return '"' + name + '"';
}

/** Outcome of a Check result set: pass | fail | not_run, or a check_shape ContractError. */
export function checkOutcome(names, rows, location) {
  if (rows.length !== 1 || !names.includes("pass") || names.some((n) => !["pass", "detail"].includes(n)) ||
      (rows[0].pass !== null && typeof rows[0].pass !== "boolean") ||
      (names.includes("detail") && rows[0].detail !== null && rows[0].detail !== undefined && typeof rows[0].detail !== "string")) {
    fail("check_shape", location, "Check must return exactly one row with a boolean/null pass and optional text detail");
  }
  const p = rows[0].pass;
  return { outcome: p === null ? "not_run" : p ? "pass" : "fail", detail: rows[0].detail ?? "" };
}
