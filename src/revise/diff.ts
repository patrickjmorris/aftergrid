// Differences between two states of one Finding, keyed by identity rather than by array position, so that
// reordering a list is not reported as a rewrite of every entry in it. Nothing here decides what a difference
// means; that is src/revise/classify.ts.
import { canon } from "../digest.ts";

export type DiffKind = "added" | "removed" | "changed";
export type Difference = { pointer: string; kind: DiffKind; before?: unknown; after?: unknown };

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Recursive structural diff. Pointers are dotted paths: `claims.c1.type`, `encoding.x.scale.domain.0`. */
export function diffValues(before: unknown, after: unknown, prefix = ""): Difference[] {
  if (canon(before) === canon(after)) return [];
  if (isPlainObject(before) && isPlainObject(after)) {
    const out: Difference[] = [];
    for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      const pointer = prefix ? `${prefix}.${key}` : key;
      if (!Object.hasOwn(after, key)) out.push({ pointer, kind: "removed", before: before[key] });
      else if (!Object.hasOwn(before, key)) out.push({ pointer, kind: "added", after: after[key] });
      else out.push(...diffValues(before[key], after[key], pointer));
    }
    return out;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const out: Difference[] = [];
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      const pointer = prefix ? `${prefix}.${i}` : String(i);
      if (i >= after.length) out.push({ pointer, kind: "removed", before: before[i] });
      else if (i >= before.length) out.push({ pointer, kind: "added", after: after[i] });
      else out.push(...diffValues(before[i], after[i], pointer));
    }
    return out;
  }
  return [{ pointer: prefix, kind: "changed", before, after }];
}

/** The manifest lists that carry stable ids, so a diff names `claims.c1`, never `claims.0`. */
export const ID_LISTS = ["definitions", "queries", "executions", "results", "derived", "external_sources", "claims", "charts", "tables", "checks"];

/**
 * The manifest as the digest envelope sees it, with the id-keyed lists turned into objects.
 * `finding.revision` and `finding.generated_at` are removed as well: `aftergrid revise --apply` owns both, so a
 * bump is never a difference the Operator asked for.
 */
export function normalizeManifest(manifest: unknown): Record<string, unknown> {
  const m = JSON.parse(JSON.stringify(manifest)) as any;
  delete m.content_digest; delete m.attestations; delete m.reviews;
  if (m.finding) { delete m.finding.generated_at; delete m.finding.revision; }
  if (m.snapshot) delete m.snapshot.drift_fingerprints;
  for (const e of m.executions ?? []) delete e.executed_at;
  for (const c of m.checks ?? []) delete c.executed_at;
  const byId = (list: any[]) => Object.fromEntries((list ?? []).map((x: any) => [String(x?.id), x]));
  for (const key of ID_LISTS) if (Array.isArray(m[key])) m[key] = byId(m[key]);
  if (Array.isArray(m.snapshot?.inputs)) m.snapshot.inputs = byId(m.snapshot.inputs);
  return m;
}

const TOKEN = /\{\{(ref|derived|ext|literal):([^}]*)\}\}/g;

/** The multiset of value tokens in a string, sorted, so "the same tokens, different words" is a decidable test. */
export function tokensOf(text: string): string[] {
  return [...String(text).matchAll(TOKEN)].map((m) => `${m[1]}:${m[2]}`).sort();
}

export const sameTokens = (before: unknown, after: unknown): boolean =>
  canon(tokensOf(typeof before === "string" ? before : canon(before))) === canon(tokensOf(typeof after === "string" ? after : canon(after)));

/** Every `field` value bound anywhere in a Vega-Lite spec. */
export function fieldsIn(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) { for (const n of node) fieldsIn(n, found); return found; }
  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "field" && typeof value === "string") found.add(value);
      else fieldsIn(value, found);
    }
  }
  return found;
}

/** Every `scale.domain` in a spec, keyed by the path of the encoding channel that carries it. */
export function domainsIn(node: unknown, path = "", found = new Map<string, unknown>()): Map<string, unknown> {
  if (Array.isArray(node)) { node.forEach((n, i) => domainsIn(n, `${path}.${i}`, found)); return found; }
  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      const next = path ? `${path}.${key}` : key;
      if (key === "scale" && isPlainObject(value) && Object.hasOwn(value, "domain")) found.set(path, value.domain);
      domainsIn(value, next, found);
    }
  }
  return found;
}
