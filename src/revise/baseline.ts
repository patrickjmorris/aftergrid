// The pinned baseline a revision is measured against, and the archive that keeps a superseded revision
// reconstructable. Both are plain directory copies: manifest, memo, chart specs and the generated render.
//
// Evidence files (queries, Checks, results, retained inputs) are deliberately not copied. A change to any of
// them is classified `numeric` and refused, so a presentation or interpretation revision shares the evidence
// that is still in the Finding directory, and the archived manifest's recorded hashes still resolve against it.
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
// @ts-ignore: shared path containment (JS module, no types).
import { safePath } from "../../scripts/fixture-safety.mjs";
// @ts-ignore: shared ESM validation library; the single implementation of the digest envelope.
import { digestOf } from "../../scripts/lib/validate-finding.mjs";

export type Baseline = { dir: string; manifest: any; source: "archive" | "flag" };

export const revisionDir = (dir: string, revision: number) => safePath(dir, `revisions/${revision}`);

/** Read a manifest from a Finding directory or an archive of one. */
export function readManifest(dir: string): any {
  return parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
}

/** True when the directory's content still hashes to the digest its manifest pins. */
export function digestMatches(dir: string, manifest: any): boolean {
  return digestOf(manifest, dir).value === manifest.content_digest?.value;
}

/**
 * The baseline for `dir`: the directory named by `--baseline`, or the archive of the revision the working
 * manifest carries. `null` means there is nothing to compare against and the caller must say so rather than
 * guess.
 */
export function findBaseline(dir: string, manifest: any, flag?: string): Baseline | null {
  if (flag) {
    if (!existsSync(join(flag, "manifest.yaml"))) return null;
    return { dir: flag, manifest: readManifest(flag), source: "flag" };
  }
  const archive = revisionDir(dir, Number(manifest.finding.revision));
  if (!existsSync(join(archive, "manifest.yaml"))) return null;
  return { dir: archive, manifest: readManifest(archive), source: "archive" };
}

/** The files an archive holds: everything a revision changes that is not generated evidence. */
export function archivedPaths(manifest: any): string[] {
  return ["manifest.yaml", "memo.md", ...(manifest.charts ?? []).map((c: any) => String(c.spec_path))];
}

/**
 * Copy the pinned state at `from` into `<dir>/revisions/<revision>/`. Overwrites an archive of the same
 * revision only when it already holds the same content digest, so a second `--pin` is a no-op and a conflicting
 * one is refused by the caller.
 */
export function archive(from: string, dir: string, revision: number, manifest: any): string {
  const target = revisionDir(dir, revision);
  // The baseline is usually already the archive of this revision; copying it onto itself would delete it.
  if (existsSync(from) && existsSync(target) && realpathSync(from) === realpathSync(target)) return target;
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const rel of archivedPaths(manifest)) {
    const source = safePath(from, rel);
    if (!existsSync(source)) continue;
    mkdirSync(dirname(safePath(target, rel)), { recursive: true });
    cpSync(source, safePath(target, rel));
  }
  const render = join(from, "render");
  if (existsSync(render)) cpSync(render, join(target, "render"), { recursive: true });
  return target;
}
