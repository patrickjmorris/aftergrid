// What a difference between two states of a Finding *means*: presentation, interpretation, or numeric.
//
// The classifier is deliberately conservative and is not a semantic classifier. It reads field paths, token
// multisets and chart-spec structure; it cannot read a sentence. A rewrite that keeps every token and changes
// what the sentence asserts lands in `presentation` here and is caught only by Method review. Anything it does
// not recognise is `interpretation`, which costs a review the Operator may not have needed — the cheap mistake.
import { canon } from "../digest.ts";
import { diffValues, domainsIn, fieldsIn, sameTokens, type Difference } from "./diff.ts";

/** Ordered by how much of the Analysis a change reopens. `numeric` is refused; `interpretation` needs review. */
export type Level = "presentation" | "interpretation" | "numeric";
export type Judgement = { level: Level; location: string; message: string };

const RANK: Record<Level, number> = { presentation: 0, interpretation: 1, numeric: 2 };

/** The level of a set of judgements: the most disruptive one present. */
export function overall(judgements: Judgement[]): Level | "unchanged" {
  if (!judgements.length) return "unchanged";
  return judgements.reduce<Level>((worst, j) => (RANK[j.level] > RANK[worst] ? j.level : worst), "presentation");
}

const head = (pointer: string) => pointer.split(".")[0] ?? "";
const at = (pointer: string, n: number) => pointer.split(".")[n] ?? "";

/** Evidence the Analysis produced. A change to any of it reopens the Analysis. */
const EVIDENCE_ROOTS = new Set(["snapshot", "queries", "executions", "results", "definitions", "checks"]);

/** Fields on a Claim that state what it means, rather than how it reads. */
const CLAIM_MEANING = new Set(["type", "comparison", "population", "window", "exclusions", "limitations", "material_caveat", "recheck", "answer_bearing", "numeric", "provisional", "baseline"]);

/** Classify one manifest difference. `working` supplies the entries a pointer refers to. */
export function classifyManifestDifference(d: Difference, baseline: any, working: any): Judgement {
  const root = head(d.pointer);
  const field = at(d.pointer, 2);
  const numeric = (message: string): Judgement => ({ level: "numeric", location: `manifest.yaml#${d.pointer}`, message });
  const interpretation = (message: string): Judgement => ({ level: "interpretation", location: `manifest.yaml#${d.pointer}`, message });
  const presentation = (message: string): Judgement => ({ level: "presentation", location: `manifest.yaml#${d.pointer}`, message });
  const wording = (what: string) => (sameTokens(d.before, d.after) ? presentation(`${what} was reworded and names the same evidence tokens`) : interpretation(`${what} names different evidence tokens`));

  if (EVIDENCE_ROOTS.has(root)) return numeric(`${root} is the evidence the Analysis produced`);
  if (root === "derived") return ["display", "description"].includes(field) ? presentation("a derived value's display formatting") : numeric("a derived value's operation, operands or unit");
  if (root === "external_sources") return ["display", "description"].includes(field) ? presentation("an external source's display formatting") : numeric("an external source's value, unit, kind or provenance");

  if (root === "claims") {
    if (field === "evidence") return numeric("the evidence a Claim rests on");
    if (field === "sentence") return wording("the Claim sentence");
    if (CLAIM_MEANING.has(field)) return interpretation(`claims.${at(d.pointer, 1)}.${field} states what the Claim means`);
    if (field === "chart_ids" || field === "table_ids") return figureSwap(d, baseline, working) ?? interpretation("a Claim shows a different figure");
    return interpretation(`an unclassified Claim field (${field || "the whole Claim"}); revise is conservative`);
  }

  if (root === "charts") {
    const id = at(d.pointer, 1);
    const entry = (d.kind === "removed" ? baseline : working)?.charts?.[id];
    if (d.pointer === `charts.${id}`) {
      if (entry?.variant_of) return presentation(`a rejected Variant of ${entry.variant_of} was ${d.kind === "added" ? "kept for the record" : "dropped"}; a Variant does not render`);
      return interpretation(`a rendered chart was ${d.kind === "added" ? "added" : "removed"}`);
    }
    if (field === "variant_of") return presentation("which Variant of this chart survives; Variants share one result set and its pinned evidence");
    if (field === "title" || field === "description") return wording(`the chart ${field}`);
    return interpretation(`charts.${id}.${field} binds the chart to different evidence`);
  }

  if (root === "tables") {
    if (field === "columns") return at(d.pointer, 4) === "label" ? presentation("a table column label") : interpretation("a table shows different columns");
    if (field === "title" || field === "caption") return wording(`the table ${field}`);
    return interpretation(`tables.${at(d.pointer, 1)}.${field} binds the table to different evidence`);
  }

  if (root === "finding") return at(d.pointer, 1) === "title" ? wording("the Finding title") : interpretation(`finding.${at(d.pointer, 1)} states what the Finding is`);
  if (root === "question") return ["falsifier", "metric"].includes(at(d.pointer, 1)) ? numeric("the Question's falsifier or metric binds an executable Check and a pinned definition") : interpretation("the Question states what is being asked");
  if (root === "export_policy") return interpretation("the export policy decides what a Reader may ever see");
  if (root === "renderer") return interpretation("the pinned renderer and house-style versions are part of the content digest");
  return interpretation(`${d.pointer} is not a field revise classifies; revise is conservative and calls it interpretation`);
}

/** Swapping which of two Variants a Claim shows is a taste decision, not a change of meaning. */
function figureSwap(d: Difference, baseline: any, working: any): Judgement | null {
  const claimId = d.pointer.split(".")[1]!;
  const kind = d.pointer.split(".")[2] === "chart_ids" ? "charts" : "tables";
  const ids = new Set([...(baseline?.claims?.[claimId]?.[`${kind.slice(0, -1)}_ids`] ?? []), ...(working?.claims?.[claimId]?.[`${kind.slice(0, -1)}_ids`] ?? [])].map(String));
  const entries = [...ids].map((id) => working?.[kind]?.[id] ?? baseline?.[kind]?.[id]);
  if (entries.some((e) => !e)) return null;
  const resultIds = new Set(entries.map((e: any) => e.result_id));
  const claimIds = new Set(entries.map((e: any) => e.claim_id));
  if (resultIds.size !== 1 || claimIds.size !== 1 || claimIds.values().next().value !== claimId) return null;
  return { level: "presentation", location: `manifest.yaml#${d.pointer}`, message: "a Variant of the same Claim, bound to the same result set, was chosen" };
}

/** Chart-spec keys whose values are how a chart looks, never what it measures. */
const COSMETIC_CONTAINERS = new Set(["mark", "config", "axis", "legend", "view", "header", "title", "description", "width", "height", "padding", "spacing", "background", "resolve", "$schema"]);
const COSMETIC_LEAVES = new Set(["sort", "title", "format", "labelAngle", "align", "baseline", "dx", "dy", "angle", "color", "fill", "stroke", "opacity", "size", "strokeWidth", "fontSize", "fontWeight", "font", "orient", "tickCount", "labelLimit"]);

/**
 * Classify a change to one Vega-Lite spec. Direct labels — a layered `text` mark bound to a field the chart
 * already showed — are the expected presentation move and are recognised as one.
 */
export function classifyChartSpec(chartId: string, specPath: string, before: unknown, after: unknown): Judgement[] {
  const out: Judgement[] = [];
  const beforeFields = fieldsIn(before);
  const beforeDomains = domainsIn(before), afterDomains = domainsIn(after);
  // Only a position channel has an axis a Reader reads lengths off. A `color` scale domain is a palette
  // mapping, and changing it is how a chart goes grey plus one accent.
  const axes = [...new Set([...beforeDomains.keys(), ...afterDomains.keys()])].filter(isAxis);
  const judged: string[] = [];
  for (const key of axes) {
    judged.push(`${key}.scale.domain`);
    const b = beforeDomains.get(key), a = afterDomains.get(key);
    if (canon(b) === canon(a)) continue;
    out.push({ level: truncates(b, a) ? "interpretation" : "presentation", location: `${specPath}#${key}.scale.domain`, message: truncates(b, a) ? `the ${key} axis domain ${canon(b)} became ${canon(a)}, which cuts values off the axis` : `the ${key} axis domain ${canon(b)} became ${canon(a)}, which shows at least as much as before` });
  }
  for (const d of diffValues(before, after)) {
    const parts = d.pointer.split(".");
    if (judged.some((p) => d.pointer === p || d.pointer.startsWith(`${p}.`))) continue; // judged above, whole domain at a time
    const last = parts[parts.length - 1] ?? "";
    const loc = `${specPath}#${d.pointer || "(whole spec)"}`;
    if (parts.includes("field")) {
      if (d.kind === "added" && typeof d.after === "string" && beforeFields.has(d.after)) out.push({ level: "presentation", location: loc, message: `a mark was bound to ${d.after}, a field the chart already showed` });
      else out.push({ level: "interpretation", location: loc, message: d.kind === "removed" ? "a field binding was removed, so the chart shows less evidence" : `a field binding became ${JSON.stringify(d.after)}, so the chart shows different evidence` });
      continue;
    }
    if (parts.includes("encoding") && last === "type") { out.push({ level: "interpretation", location: loc, message: "an encoding's measurement type decides how its values are scaled" }); continue; }
    if (parts.includes("stack") || parts[0] === "data" || parts.includes("transform") || parts.includes("aggregate")) { out.push({ level: "interpretation", location: loc, message: `${last} changes what the chart computes` }); continue; }
    if (parts.includes("scale") || parts.some((p) => COSMETIC_CONTAINERS.has(p)) || COSMETIC_LEAVES.has(last)) { out.push({ level: "presentation", location: loc, message: `${d.pointer || "the spec"} is how the chart looks` }); continue; }
    if (d.kind === "added") { out.push(addedSubtree(loc, d.after, beforeFields)); continue; }
    out.push({ level: "interpretation", location: loc, message: `${d.pointer} is not a chart property revise classifies; revise is conservative` });
  }
  return out.map((j) => ({ ...j, message: `chart ${chartId}: ${j.message}` }));
}

/** A new sub-spec (a layer, for instance) is presentation when it shows only evidence the chart already showed. */
function addedSubtree(location: string, added: unknown, beforeFields: Set<string>): Judgement {
  const added_ = JSON.stringify(added) ?? "";
  const fields = [...fieldsIn(added)];
  if (/"(data|transform|aggregate|bin|timeUnit|datum|expr|signal)"\s*:/.test(added_)) return { level: "interpretation", location, message: "the added sub-spec computes a value of its own" };
  if (fields.every((f) => beforeFields.has(f))) return { level: "presentation", location, message: `an added sub-spec showing only ${fields.length ? fields.join(", ") : "constants"}, already on the chart` };
  return { level: "interpretation", location, message: `the added sub-spec shows ${fields.filter((f) => !beforeFields.has(f)).join(", ")}, which the chart did not show before` };
}

/** Position channels: the ones whose scale domain decides how long a mark is drawn. */
const POSITION = new Set(["x", "y", "x2", "y2", "theta", "theta2", "radius", "radius2"]);
const isAxis = (path: string) => { const parts = path.split("."); return parts.includes("encoding") && POSITION.has(parts[parts.length - 1] ?? ""); };

/** A domain truncates when it starts later or ends earlier than the one it replaced. */
function truncates(before: unknown, after: unknown): boolean {
  if (!Array.isArray(before) || !Array.isArray(after)) return true; // a domain appearing or disappearing can cut the axis
  const nb = before.map(Number), na = after.map(Number);
  if (nb.length !== 2 || na.length !== 2 || [...nb, ...na].some((n) => !Number.isFinite(n))) return canon(before) !== canon(after);
  return na[0]! > nb[0]! || na[1]! < nb[1]!;
}

/** Classify a change to `memo.md`: the same tokens is a rewording, different tokens is different evidence on the page. */
export function classifyMemo(before: string, after: string): Judgement {
  return sameTokens(before, after)
    ? { level: "presentation", location: "memo.md", message: "the memo was reworded and shows the same evidence tokens" }
    : { level: "interpretation", location: "memo.md", message: "the memo shows a different set of evidence tokens" };
}
