// Token resolution and display formatting for renderers. One resolver (validate-finding.resolveValueStrict, which
// also enforces the export and provisional policies) and one formatter (fixture-safety.formatValue).
import { readFileSync } from "node:fs";
// @ts-ignore: shared ESM library.
import { resolveValueStrict, TOKEN_RE } from "../../scripts/lib/validate-finding.mjs";
// @ts-ignore: shared ESM helpers.
import { formatValue, escapeHtml, safePath } from "../../scripts/fixture-safety.mjs";

export type Results = Record<string, { rows: Record<string, unknown>[] }>;

export function loadResults(dir: string, manifest: any): Results {
  const out: Results = {};
  for (const r of manifest.results) out[r.id] = JSON.parse(readFileSync(safePath(dir, r.path), "utf8"));
  return out;
}

/** Display text for one value reference (ref:/derived:/ext:). Throws ContractError for anything unresolved or unexported. */
export function displayValue(manifest: any, results: Results, ref: string, loc = ref): string {
  const v = resolveValueStrict(manifest, results, ref, loc);
  return formatValue(v);
}

/** Replace every {{ref|derived|ext|literal:…}} token with escaped display text. Non-token text is escaped by the caller. */
export function resolveTokens(manifest: any, results: Results, text: string, loc: string, escape: (s: string) => string = escapeHtml): string {
  return text.replace(new RegExp((TOKEN_RE as RegExp).source, "g"), (_m: string, kind: string, body: string) => {
    if (kind === "literal") return escape(body);
    return escape(displayValue(manifest, results, `${kind}:${body}`, loc));
  });
}

/** Rows of a result set as display-formatted cells for the given columns (allowlisted by the caller). */
export function tableCells(manifest: any, results: Results, resultId: string, columns: string[], rowKeys?: string[]): { key: string; cells: string[] }[] {
  const res = manifest.results.find((r: any) => r.id === resultId);
  const rows = results[resultId]!.rows;
  const keys = rowKeys ?? rows.map((r) => String(r[res.row_key]));
  return keys.map((key) => ({ key, cells: columns.map((c) => displayValue(manifest, results, `ref:${resultId}.${key}.${c}`, `table ${resultId}`)) }));
}
