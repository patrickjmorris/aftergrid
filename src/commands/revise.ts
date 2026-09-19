// `aftergrid revise <finding-dir>`: say what a change to a pinned Finding would cost, then apply it or refuse.
//
// Three modes, in the order an Operator meets them:
//   --pin       record the current, digest-clean Finding as the baseline later comparisons are measured against
//   --classify  compare the working tree with that baseline and call every difference presentation,
//               interpretation or numeric
//   --apply     presentation or interpretation -> a new revision, archived predecessor, re-render, re-check;
//               numeric -> refused, with the instruction to reopen the Analysis
//
// Contract, including what the classifier cannot see: docs/contracts/revise.md.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml, stringify as toYaml } from "yaml";
// @ts-ignore: shared path containment (JS module, no types).
import { safePath, ContractError, fail } from "../../scripts/fixture-safety.mjs";
// @ts-ignore: shared ESM validation library; the single implementation of the digest envelope.
import { digestOf } from "../../scripts/lib/validate-finding.mjs";
import { emptyReport, type Problem, type Report } from "../report.ts";
import { sha256 } from "../digest.ts";
import { check } from "./check.ts";
import { render } from "./render.ts";
import { diffValues, normalizeManifest } from "../revise/diff.ts";
import { classifyChartSpec, classifyManifestDifference, classifyMemo, overall, promotions, type Judgment, type Level } from "../revise/classify.ts";
import { archive, archivedPaths, digestMatches, findBaseline, readManifest, revisionDir } from "../revise/baseline.ts";

export type ReviseMode = "pin" | "classify" | "apply";
export type ReviseOptions = { dir: string; mode: ReviseMode; baseline?: string; now?: () => Date; force?: boolean };
export type ReviseReport = Report & {
  command: "revise";
  classification: Level | "unchanged" | "unknown";
  differences: Judgment[];
  revision?: number;
  archive?: string;
};

const empty = (): ReviseReport => ({ ...emptyReport("check"), command: "revise", classification: "unknown", differences: [] });

export async function revise(opts: ReviseOptions): Promise<ReviseReport> {
  const report = empty();
  const dir = resolve(opts.dir);
  if (!existsSync(safePathQuiet(dir, "manifest.yaml"))) {
    report.errors.push({ category: "missing_file", location: `${dir}/manifest.yaml`, message: "manifest.yaml not found", remedy: "pass a Finding directory" });
    report.syntax = "invalid";
    return report;
  }
  let manifest: any;
  try { manifest = parseYaml(readFileSync(safePath(dir, "manifest.yaml"), "utf8")); }
  catch (e) {
    report.errors.push({ category: e instanceof ContractError ? (e as any).category : "invalid_artifact", location: "manifest.yaml", message: (e as Error).message });
    report.syntax = "invalid";
    return report;
  }
  report.finding = `${manifest.finding.id} r${manifest.finding.revision}`;
  report.revision = Number(manifest.finding.revision);

  // A file the manifest names and the Finding does not hold produces no difference to classify. Say it is
  // missing rather than let "nothing to compare" be reported as "nothing changed".
  const missing = missingArtifacts(dir, manifest);
  if (missing.length) {
    report.errors.push(...missing);
    report.syntax = "invalid";
    return report;
  }

  if (opts.mode === "pin") return pin(dir, manifest, report, !!opts.force);

  // Evidence drift is readable from the manifest's own recorded hashes, with or without a baseline: a Finding
  // whose queries, Checks, results or retained inputs have moved is already back in the Analysis.
  const drift = evidenceDrift(dir, manifest);
  const judgments: Judgment[] = [...drift];

  const baseline = findBaseline(dir, manifest, opts.baseline);
  if (!baseline) {
    report.differences = judgments;
    report.classification = drift.length ? "numeric" : "unknown";
    if (drift.length) return refuseNumeric(report, judgments);
    report.errors.push({
      category: "needs_input",
      location: `revisions/${manifest.finding.revision}`,
      message: `no pinned baseline for revision ${manifest.finding.revision}, so a difference in the manifest, the memo or a chart spec cannot be classified`,
      remedy: `run \`aftergrid revise ${opts.dir} --pin\` on the Finding as it was reviewed, or pass --baseline <dir> naming a copy of it`,
    });
    return report;
  }
  report.info.push(`baseline: ${baseline.source === "archive" ? `revisions/${manifest.finding.revision}` : opts.baseline}`);

  try { judgments.push(...classifyAgainst(dir, baseline.dir, baseline.manifest, manifest)); }
  catch (e) {
    report.errors.push({ category: e instanceof ContractError ? (e as any).category : "invalid_artifact", location: e instanceof ContractError ? (e as any).location : dir, message: (e as Error).message, remedy: "fix the artifact, or restore it from the pinned revision" });
    report.syntax = "invalid";
    report.differences = judgments;
    return report;
  }
  report.differences = judgments;
  const level = overall(judgments);
  report.classification = level;

  if (level === "unchanged") {
    report.content = "complete";
    report.info.push("no difference from the pinned baseline; there is nothing to revise");
    return report;
  }
  for (const j of judgments) report.info.push(`${j.level}: ${j.location} — ${j.message}`);
  if (level === "numeric") return refuseNumeric(report, judgments);

  if (opts.mode === "classify") {
    report.content = "complete";
    if (level === "interpretation") report.warnings.push({ category: "needs_attention", location: "manifest.yaml", message: "this change alters what the Finding means; applying it requires a fresh Method and Question review" });
    return report;
  }
  return applyRevision(dir, manifest, baseline, report, opts);
}

/* ------------------------------------------------------------------ modes */

function pin(dir: string, manifest: any, report: ReviseReport, force: boolean): ReviseReport {
  const drift = evidenceDrift(dir, manifest);
  if (drift.length || !digestMatches(dir, manifest)) {
    report.errors.push({
      category: "digest",
      location: "manifest.yaml#/content_digest",
      message: "the Finding does not hash to the digest it pins, so this state was never the reviewed one",
      remedy: "run `aftergrid check` and restore or re-pin the Finding before recording it as a baseline",
    });
    for (const j of drift) report.info.push(`${j.level}: ${j.location} — ${j.message}`);
    report.classification = drift.length ? "numeric" : "unknown";
    return report;
  }
  const revision = Number(manifest.finding.revision);
  const existing = revisionDir(dir, revision);
  if (existsSync(`${existing}/manifest.yaml`) && !force) {
    const archived = readManifest(existing);
    if (archived.content_digest?.value !== manifest.content_digest?.value) {
      report.errors.push({ category: "exists", location: `revisions/${revision}`, message: `revisions/${revision} archives a different digest`, remedy: "pass --force to replace it, or bump the revision first" });
      return report;
    }
    report.classification = "unchanged";
    report.content = "complete";
    report.archive = existing;
    report.info.push(`revisions/${revision} already archives this digest; nothing written`);
    return report;
  }
  report.archive = archive(dir, dir, revision, manifest);
  report.classification = "unchanged";
  report.content = "complete";
  report.info.push(`archived revision ${revision} to revisions/${revision}: ${archivedPaths(manifest).join(", ")}${existsSync(`${dir}/render`) ? ", render/" : ""}`);
  report.info.push("evidence files are not copied: a change to one is classified numeric and refused, so the archived manifest's hashes still resolve against the Finding's own queries, Checks, results and retained inputs");
  return report;
}

function refuseNumeric(report: ReviseReport, judgments: Judgment[]): ReviseReport {
  report.classification = "numeric";
  for (const j of judgments.filter((x) => x.level === "numeric")) {
    report.errors.push({ category: "reopens_analysis", location: j.location, message: j.message, remedy: "this is a change to a number, not to how it reads: reopen the Analysis with `aftergrid execute <finding-dir>` and take the Finding through review again. Nothing was written." });
  }
  return report;
}

async function applyRevision(dir: string, manifest: any, baseline: { dir: string; manifest: any; source: string }, report: ReviseReport, opts: ReviseOptions): Promise<ReviseReport> {
  const previous = Number(manifest.finding.revision);
  const next = previous + 1;
  // `--baseline <dir>` names a copy of the reviewed Finding, and archiving it overwrites `revisions/<N>/`.
  // Refuse when that would destroy an archive of some other state: a pinned revision N is the only copy of the
  // artifact revision N's reviews and attestations were written against.
  const blocked = archiveCollision(dir, previous, baseline, !!opts.force);
  if (blocked) {
    report.errors.push(blocked);
    report.info.push("nothing was written");
    return report;
  }
  // The predecessor is archived from the baseline, never from the working tree: the reviewed artifact is the
  // one without the edits.
  report.archive = archive(baseline.dir, dir, previous, readManifest(baseline.dir));

  const dropped = (manifest.attestations ?? []).length;
  manifest.finding.revision = next;
  manifest.finding.generated_at = (opts.now ? opts.now() : new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  // An attestation states that a named human approved one content digest. Revision N+1 has a different digest,
  // so revision N's approval cannot bind it and is not carried forward; it stays readable in the archive.
  // Reviews are left exactly as they were, which is what makes `check` report them as stale.
  manifest.attestations = [];

  const memoPath = safePath(dir, "memo.md");
  const memo = readFileSync(memoPath, "utf8");
  const bumped = memo.replace(/^(---\n[\s\S]*?\nrevision: )\d+$/m, `$1${next}`);
  if (bumped === memo) report.warnings.push({ category: "template", location: "memo.md:1", message: "memo front matter has no revision line to bump; check will report the mismatch" });
  else writeFileSync(memoPath, bumped);

  manifest.content_digest = digestOf(manifest, dir);
  writeFileSync(safePath(dir, "manifest.yaml"), toYaml(manifest, { lineWidth: 0 }));

  report.revision = next;
  report.info.push(`revision ${previous} archived at revisions/${previous}; the Finding is now revision ${next}`);
  if (dropped) report.info.push(`${dropped} publication attestation(s) bound revision ${previous}'s digest and do not carry to revision ${next}; they stay readable in revisions/${previous}/manifest.yaml. Revision ${next} is unapproved.`);
  if (report.classification === "interpretation") {
    report.warnings.push({ category: "needs_attention", location: "manifest.yaml", message: `revision ${next} changes what the Finding means: Method and Question review are required before it is published` });
    report.readiness_reasons.push("an interpretation change was applied; Method and Question review are required");
  }

  const rendered = await render({ dir });
  mergeInto(report, rendered, "render");
  const checked = await check({ dir, github: null });
  mergeInto(report, checked, "check");
  report.syntax = checked.syntax;
  report.content = checked.content;
  report.evidence = checked.evidence;
  report.sql_execution = checked.sql_execution;
  report.readiness = checked.readiness;
  report.readiness_reasons.push(...checked.readiness_reasons);
  for (const w of checked.warnings) if (w.category === "stale_review") report.info.push(`${w.location}: ${w.message} — the review is for revision ${previous} and says so`);
  return report;
}

/**
 * Why archiving this baseline as revision N would destroy something, or `null`. Two ways it can: the baseline is
 * a different state than the one already archived at `revisions/<N>/`, or it is not revision N at all.
 */
function archiveCollision(dir: string, previous: number, baseline: { dir: string; manifest: any; source: string }, force: boolean): Problem | null {
  if (baseline.source !== "flag") return null; // the archive of revision N is the baseline; archiving it is a no-op
  const revision = Number(baseline.manifest?.finding?.revision);
  if (Number.isFinite(revision) && revision !== previous)
    return { category: "needs_input", location: `revisions/${previous}`, message: `--baseline names revision ${revision} and the Finding is revision ${previous}, so archiving it would file revision ${revision}'s artifact as revision ${previous}`, remedy: `pass the copy of revision ${previous}, or bring the Finding back to revision ${revision}` };
  // An archive has to be a state somebody reviewed, the rule `--pin` enforces. `--force` does not buy past it:
  // there is nothing to gain by filing an unreviewed copy as the reviewed revision.
  let hashes = false;
  try { hashes = digestMatches(baseline.dir, baseline.manifest); } catch { hashes = false; }
  if (!hashes)
    return { category: "digest", location: `${baseline.dir}/manifest.yaml#/content_digest`, message: "--baseline does not hash to the digest its manifest pins, so it was never the reviewed state, and archiving it would replace the archive of the one that was", remedy: "run `aftergrid check` on the copy, or drop --baseline to archive the pinned revision itself" };
  const existing = revisionDir(dir, previous);
  if (force || !existsSync(`${existing}/manifest.yaml`)) return null;
  const archived = readManifest(existing);
  if (archived.content_digest?.value === baseline.manifest?.content_digest?.value) return null;
  return { category: "exists", location: `revisions/${previous}`, message: `revisions/${previous} archives a different digest than --baseline holds, and applying would replace it`, remedy: `drop --baseline to use revisions/${previous} itself, or pass --force to replace the archive` };
}

function mergeInto(report: ReviseReport, other: Report, label: string) {
  const seen = new Set(report.errors.map((e) => `${e.category}@${e.location}`));
  for (const e of other.errors) if (!seen.has(`${e.category}@${e.location}`)) report.errors.push({ ...e, message: `${label}: ${e.message}` } as Problem);
  for (const w of other.warnings) report.warnings.push({ ...w, message: `${label}: ${w.message}` } as Problem);
  for (const i of other.info) report.info.push(`${label}: ${i}`);
}

/* ------------------------------------------------------------------ comparison */

/** Every difference between the baseline and the working tree, classified. */
export function classifyAgainst(dir: string, baselineDir: string, baseline: any, working: any): Judgment[] {
  const out: Judgment[] = [];
  const nb = normalizeManifest(baseline), nw = normalizeManifest(working);
  for (const d of diffValues(nb, nw)) out.push(classifyManifestDifference(d, nb, nw));

  const before = readIfPresent(baselineDir, "memo.md"), after = readIfPresent(dir, "memo.md");
  if (before !== null && after !== null && before !== after) out.push(classifyMemo(before, after));

  for (const chart of working.charts ?? []) {
    const spec = readIfPresent(dir, chart.spec_path);
    const old = readIfPresent(baselineDir, chart.spec_path);
    if (spec === null || old === null || spec === old) continue;
    out.push(...classifyChartSpec(String(chart.id), String(chart.spec_path), parseSpec(baselineDir, chart.spec_path, old), parseSpec(dir, chart.spec_path, spec)));
  }

  // Promoting a Variant changes the chart the Reader sees without either spec file changing, so the walk above
  // sees nothing. Compare the spec that starts rendering against the one it replaced: a Variant carrying a
  // truncated axis or another field binding costs what that change costs, whenever it reaches the page.
  for (const [promoted, demoted] of promotions(nb, nw)) {
    const spec = readIfPresent(dir, promoted.spec_path), old = readIfPresent(baselineDir, demoted.spec_path);
    if (spec === null || old === null) continue;
    out.push(...classifyChartSpec(String(promoted.id), String(promoted.spec_path), parseSpec(baselineDir, demoted.spec_path, old), parseSpec(dir, promoted.spec_path, spec))
      .map((j) => ({ ...j, message: `${j.message} (against ${demoted.id}, the chart it replaces on the page)` })));
  }
  return out;
}

/** A chart spec that is not JSON is a typed `invalid_artifact`, never a stack trace out of the command. */
function parseSpec(dir: string, rel: string, text: string): unknown {
  try { return JSON.parse(text); }
  catch (e) { return fail("invalid_artifact", `${dir}/${rel}`, `chart spec is not valid JSON: ${(e as Error).message}`); }
}

/**
 * The files a revision compares that the manifest says exist. A missing one is reported here, because with
 * nothing to read the classifier produces no judgment at all and would otherwise call the Finding unchanged.
 */
export function missingArtifacts(dir: string, manifest: any): Problem[] {
  const out: Problem[] = [];
  const mustExist = (rel: string, location: string, what: string) => {
    if (readIfPresent(dir, rel) === null) out.push({ category: "missing_file", location, message: `${what} (${rel}) is missing from the Finding`, remedy: "restore the file, or remove what refers to it; `aftergrid check` lists everything it breaks" });
  };
  mustExist("memo.md", "memo.md", "the memo");
  for (const [n, chart] of (manifest.charts ?? []).entries()) mustExist(String(chart.spec_path), `manifest.yaml#/charts/${n}`, `the spec of chart ${chart.id}`);
  return out;
}

/** Evidence files that no longer hash to what the manifest recorded. Readable without a baseline. */
export function evidenceDrift(dir: string, manifest: any): Judgment[] {
  const out: Judgment[] = [];
  const entries: [string, any[], string][] = [
    ["retained input", manifest.snapshot?.inputs ?? [], "snapshot/inputs"],
    ["query", manifest.queries ?? [], "queries"],
    ["Check", manifest.checks ?? [], "checks"],
    ["result", manifest.results ?? [], "results"],
  ];
  for (const [label, list, pointer] of entries) {
    for (const [n, item] of list.entries()) {
      let actual: string;
      try { actual = sha256(readFileSync(safePath(dir, item.path))); }
      catch { out.push({ level: "numeric", location: `manifest.yaml#/${pointer}/${n}`, message: `${label} ${item.id} (${item.path}) is missing` }); continue; }
      if (actual !== item.content_hash?.value) out.push({ level: "numeric", location: `manifest.yaml#/${pointer}/${n}`, message: `${label} ${item.id} (${item.path}) no longer hashes to what the manifest pinned` });
    }
  }
  return out;
}

const readIfPresent = (dir: string, rel: string): string | null => {
  try { const p = safePath(dir, rel); return existsSync(p) ? readFileSync(p, "utf8") : null; } catch { return null; }
};
const safePathQuiet = (dir: string, rel: string): string => { try { return safePath(dir, rel); } catch { return `${dir}/${rel}`; } };
