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
    const side = d.kind === "removed" ? baseline : working;
    const entry = side?.charts?.[id];
    if (d.pointer === `charts.${id}`) {
      if (entry?.variant_of) {
        // The message about to be printed says the Variant shares the survivor's Claim and result set. Check it
        // rather than assert it: an entry that carries `variant_of` and binds other evidence is not a Variant.
        const mismatch = variantMismatch(id, entry, side);
        if (mismatch) return interpretation(mismatch);
        return presentation(`a rejected Variant of ${entry.variant_of} was ${d.kind === "added" ? "kept for the record" : "dropped"}; it shares that chart's Claim and result set, and a Variant does not render`);
      }
      return interpretation(`a rendered chart was ${d.kind === "added" ? "added" : "removed"}`);
    }
    if (field === "variant_of") return variantOfChange(d, id, baseline, working);
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

/* --------------------------------------------------------------- Variants */

/** A chart is on the Reader's page when it exists and carries no `variant_of` (`src/render/html.ts`). */
const renders = (entry: any): boolean => !!entry && !entry.variant_of;

/** Why `entry` is not a Variant of the chart it names, or `null` when it is one. */
function variantMismatch(id: string, entry: any, manifest: any): string | null {
  const target = manifest?.charts?.[entry.variant_of];
  if (!target) return `charts.${id} is filed as a Variant of ${entry.variant_of}, and no chart of that id is in the manifest`;
  if (target.result_id !== entry.result_id) return `charts.${id} is filed as a Variant of ${entry.variant_of} but binds result set ${entry.result_id}, not ${target.result_id}: it is different evidence, not the same evidence shown another way`;
  if (target.claim_id !== entry.claim_id) return `charts.${id} is filed as a Variant of ${entry.variant_of} but backs Claim ${entry.claim_id}, not ${target.claim_id}`;
  return null;
}

/**
 * A change to `charts.<id>.variant_of`. Filing a chart under a different survivor is a bookkeeping change. Adding
 * or removing `variant_of` on a chart moves it off or onto the Reader's page, which is the same publication-visible
 * change as adding or removing a chart — presentation only when another Variant of the same Claim and result set
 * trades places with it, and `classifyAgainst` then compares the two specs as the chart change they are.
 */
function variantOfChange(d: Difference, id: string, baseline: any, working: any): Judgement {
  const location = `manifest.yaml#${d.pointer}`;
  const before = baseline?.charts?.[id], after = working?.charts?.[id];
  const was = renders(before), now = renders(after);
  if (was === now) {
    const mismatch = now ? null : variantMismatch(id, after, working);
    if (mismatch) return { level: "interpretation", location, message: mismatch };
    return { level: "presentation", location, message: `which chart ${id} is filed as a Variant of; it is off the Reader's page either way` };
  }
  const swapped = tradedPlaces(id, baseline, working);
  if (!swapped) return { level: "interpretation", location, message: now ? `charts.${id} now renders, so the publication shows a chart it did not show` : `charts.${id} no longer renders, so the publication no longer shows it` };
  return { level: "presentation", location, message: `${now ? `charts.${id} took the place of ${swapped}` : `charts.${swapped} took the place of ${id}`} on the page; both are Variants on the same Claim and result set` };
}

/** The chart that moved the opposite way on the page, on the same Claim and result set, or `null`. */
function tradedPlaces(id: string, baseline: any, working: any): string | null {
  const entry = working?.charts?.[id] ?? baseline?.charts?.[id];
  const was = renders(baseline?.charts?.[id]);
  for (const [other, after] of Object.entries<any>(working?.charts ?? {})) {
    if (other === id) continue;
    const before = baseline?.charts?.[other];
    if (renders(before) !== !was || renders(after) !== was) continue; // it has to move the other way
    if (after.result_id !== entry?.result_id || after.claim_id !== entry?.claim_id) continue;
    return other;
  }
  return null;
}

/**
 * The chart-spec pairs a revision swaps on the Reader's page: `[promoted, demoted]`, the chart that starts
 * rendering and the one that stops. Neither spec file has to change for the page to change, so this is the only
 * place a promoted Variant's spec is ever compared with the spec it replaces.
 */
export function promotions(baseline: any, working: any): [any, any][] {
  const entering = Object.entries<any>(working?.charts ?? {}).filter(([id, c]) => renders(c) && baseline?.charts?.[id] && !renders(baseline.charts[id]));
  const leaving = Object.entries<any>(baseline?.charts ?? {}).filter(([id, c]) => renders(c) && working?.charts?.[id] && !renders(working.charts[id]));
  const out: [any, any][] = [];
  const taken = new Set<string>();
  for (const [, promoted] of entering) {
    const match = leaving.find(([id, c]) => !taken.has(id) && c.claim_id === promoted.claim_id && c.result_id === promoted.result_id);
    if (!match) continue;
    taken.add(match[0]);
    out.push([promoted, match[1]]);
  }
  return out;
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
    out.push({ ...domainJudgement(key, b, a), location: `${specPath}#${key}.scale.domain` });
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
    // A scale is judged by the channel it belongs to, before the generic `type` and cosmetic rules: on a position
    // channel everything except `domain` (judged above) and a handful of spacing keys decides how long a mark is
    // drawn, which is what the Reader reads the value off.
    const scaleAt = parts.indexOf("scale");
    if (scaleAt > 0) {
      const channel = parts[scaleAt - 1] ?? "";
      const key = parts[scaleAt + 1] ?? "";
      if (!(POSITION.has(channel) && parts.slice(0, scaleAt - 1).includes("encoding")) || POSITION_SCALE_SPACING.has(key)) { out.push({ level: "presentation", location: loc, message: `${d.pointer || "the spec"} is how the chart looks` }); continue; }
      // The whole scale object appeared or vanished: `domain` is already judged above, so judge what is left.
      const rest = key ? [key] : Object.keys((d.kind === "removed" ? d.before : d.after) ?? {}).filter((k) => k !== "domain" && !POSITION_SCALE_SPACING.has(k));
      if (!rest.length) continue;
      out.push({ level: "interpretation", location: loc, message: `${channel}.scale.${rest.join(", ")} decides how a value becomes a length on the ${channel} axis, so it changes what a mark's length says` });
      continue;
    }
    if (parts.includes("encoding") && last === "type") { out.push({ level: "interpretation", location: loc, message: "an encoding's measurement type decides how its values are scaled" }); continue; }
    if (parts.includes("stack") || parts[0] === "data" || parts.includes("transform") || parts.includes("aggregate")) { out.push({ level: "interpretation", location: loc, message: `${last} changes what the chart computes` }); continue; }
    if (parts.some((p) => COSMETIC_CONTAINERS.has(p)) || COSMETIC_LEAVES.has(last)) { out.push({ level: "presentation", location: loc, message: `${d.pointer || "the spec"} is how the chart looks` }); continue; }
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
/** Position-scale keys that space marks out without changing what a length means. */
const POSITION_SCALE_SPACING = new Set(["padding", "paddingInner", "paddingOuter", "round", "align", "bandPosition"]);
const isAxis = (path: string) => { const parts = path.split("."); return parts.includes("encoding") && POSITION.has(parts[parts.length - 1] ?? ""); };

/**
 * What a changed position-axis domain means. Two numeric endpoints can be compared: a domain that starts later
 * or ends earlier cuts values off. Anything else — a domain appearing, disappearing, or a set of categories —
 * `revise` cannot compare, so it says that rather than asserting an effect on the image it did not establish.
 */
function domainJudgement(key: string, before: unknown, after: unknown): Omit<Judgement, "location"> {
  const j = (level: Level, message: string) => ({ level, message });
  const pair = (v: unknown) => { if (!Array.isArray(v) || v.length !== 2) return null; const n = v.map(Number); return n.every((x) => Number.isFinite(x)) ? (n as number[]) : null; };
  const nb = pair(before), na = pair(after);
  if (!nb || !na) return j("interpretation", `the ${key} axis domain ${canon(before)} became ${canon(after)}; revise compares two numeric endpoints and cannot compare these, so it calls the change a change of meaning`);
  if (na[0]! > nb[0]! || na[1]! < nb[1]!) return j("interpretation", `the ${key} axis domain ${canon(before)} became ${canon(after)}, which cuts values off the axis`);
  return j("presentation", `the ${key} axis domain ${canon(before)} became ${canon(after)}, which shows at least as much as before`);
}

/** Classify a change to `memo.md`: the same tokens is a rewording, different tokens is different evidence on the page. */
export function classifyMemo(before: string, after: string): Judgement {
  return sameTokens(before, after)
    ? { level: "presentation", location: "memo.md", message: "the memo was reworded and shows the same evidence tokens" }
    : { level: "interpretation", location: "memo.md", message: "the memo shows a different set of evidence tokens" };
}
