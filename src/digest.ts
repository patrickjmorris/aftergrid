// Content digest and definition hash, exactly as docs/contracts/finding-manifest.md and instance-layout.md define them.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
// @ts-ignore: plain ESM module shared with the fixture tooling; path containment checks live there.
import { safePath } from "../scripts/fixture-safety.mjs";

export type Hash = { algorithm: "sha256"; value: string };
export const sha256 = (buf: Buffer | string): string => createHash("sha256").update(buf).digest("hex");
export const hashOf = (buf: Buffer | string): Hash => ({ algorithm: "sha256", value: sha256(buf) });

/** Canonical JSON: keys sorted recursively, no whitespace. */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

type ManifestLike = {
  content_digest?: unknown; attestations?: unknown; reviews?: unknown;
  finding: { generated_at?: unknown; [k: string]: unknown };
  snapshot: { drift_fingerprints?: unknown; [k: string]: unknown };
  executions: Array<{ executed_at?: unknown; [k: string]: unknown }>;
  checks: Array<{ id: string; path: string; executed_at?: unknown; [k: string]: unknown }>;
  queries: Array<{ id: string; path: string }>;
  charts: Array<{ id: string; spec_path: string }>;
  results: Array<{ id: string; path: string }>;
  [k: string]: unknown;
};

/** The digest envelope over a Finding directory. Files are committed through their SHA-256, keyed by manifest id. */
export function contentDigest(manifest: ManifestLike, dir: string, readFile: (p: string) => Buffer = (p) => readFileSync(p), resolvePath: (root: string, rel: string) => string = safePath): Hash {
  const m = JSON.parse(JSON.stringify(manifest)) as ManifestLike;
  delete m.content_digest; delete m.attestations; delete m.reviews;
  delete m.finding.generated_at; delete m.snapshot.drift_fingerprints;
  for (const e of m.executions) delete e.executed_at;
  for (const c of m.checks) delete c.executed_at;
  const files: Record<string, string> = {};
  // Every path is contained (no absolute, dot, parent or symlink components) before it is read.
  const add = (key: string, rel: string) => { files[key] = sha256(readFile(resolvePath(dir, rel))); };
  add("memo", "memo.md");
  for (const q of m.queries) add("query:" + q.id, q.path);
  for (const c of m.checks) add("check:" + c.id, c.path);
  for (const c of m.charts) add("chart:" + c.id, c.spec_path);
  for (const r of m.results) add("result:" + r.id, r.path);
  return hashOf(canon({ manifest: m, files }));
}

/** Definition content hash: canonical front matter minus `approval`, newline, body. */
export function definitionHash(text: string, parseYaml: (s: string) => unknown): Hash {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error("definition file has no front matter");
  const fm = parseYaml(m[1]!) as Record<string, unknown>;
  delete fm.approval;
  return hashOf(canon(fm) + "\n" + m[2]!);
}
