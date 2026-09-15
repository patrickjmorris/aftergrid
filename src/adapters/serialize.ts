// Deterministic result-set serialization (docs/contracts/checks-and-results.md). The bytes written here are what
// results[].content_hash commits to; two runs of the same SQL on the same retained inputs produce identical bytes.
import type { ExecuteResult } from "./contract.ts";
import { AdapterError } from "./contract.ts";

export type DeclaredColumn = { name: string; type: "integer" | "decimal" | "text" | "date" | "timestamp" | "boolean"; nullable?: boolean };

export function coerceCell(v: unknown, type: DeclaredColumn["type"], location: string): string | number | boolean | null {
  if (v === null) return null;
  if (v === undefined) throw new AdapterError("value_type", "missing value", location);
  if (type === "integer") {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isSafeInteger(n) || (typeof v === "string" && !/^-?[0-9]+$/.test(v))) throw new AdapterError("value_type", `integer column holds '${v}'`, location);
    return n;
  }
  if (type === "boolean") { if (typeof v !== "boolean") throw new AdapterError("value_type", "expected SQL boolean", location); return v; }
  if (type === "decimal") {
    const s = String(v);
    if (!/^-?[0-9]+(\.[0-9]+)?$/.test(s)) throw new AdapterError("value_type", `decimal column holds '${s}'`, location);
    return s;
  }
  return String(v);
}

/** Result file object for a declared result set; rows keep query order (the row key, not the order, is identity). */
export function serializeResult(exec: ExecuteResult, declared: { result_id: string; execution_id: string; row_key: string; columns: DeclaredColumn[] }) {
  const names = exec.columns.map((c) => c.name);
  const want = declared.columns.map((c) => c.name);
  if (JSON.stringify(names) !== JSON.stringify(want)) throw new AdapterError("result_shape", `query returned columns [${names}] but the manifest declares [${want}]`, declared.result_id);
  const rows = exec.rows.map((row, i) => Object.fromEntries(declared.columns.map((c) => [c.name, coerceCell(row[c.name], c.type, `${declared.result_id} row ${i} ${c.name}`)])));
  const out = { result_id: declared.result_id, execution_id: declared.execution_id, row_key: declared.row_key, columns: want, rows };
  return { object: out, bytes: Buffer.from(JSON.stringify(out, null, 2) + "\n", "utf8") };
}
