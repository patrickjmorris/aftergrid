// Proposing a Metric definition or a Diagnostic calculation, without touching an approved one.
//
// `/grill-question` and `/checked-analysis` both propose definitions. Approval is an Operator's attestation
// against the definition's own content hash (docs/contracts/instance-layout.md), so the one thing this must
// never do is write a file that reads as approved, or edit a file whose approval someone already signed.
// The rule is mechanical: write only where nothing is approved. `lifecycle: approved` and an `approval:` block
// are both refusals, and neither is producible from here — this function has no parameter that can set them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import type { Problem } from "../report.ts";
// @ts-ignore: shared path containment (JS module, no types).
import { safePath, ContractError, counterMetricProblems as sharedCounterMetricProblems } from "../../scripts/fixture-safety.mjs";

export type ProposedDefinition = {
  id: string;
  version: number;
  /** Metric definition or Diagnostic calculation — a separate axis from lifecycle (ADR 0007 amended). */
  kind: "metric" | "diagnostic";
  grain: string;
  population: string;
  denominator: string;
  window: string;
  owner: string;
  /** Plain-language meaning: what a Reader would understand this to count. */
  meaning: string;
  /** Canonical SQL per dialect, e.g. { duckdb: "select …" }. */
  sql: Record<string, string>;
  /**
   * What pushing this metric hard would damage (docs/contracts/instance-layout.md, "Counter-metrics"). Each entry
   * names another definition in the same Instance; `why` is one sentence saying what gaming this metric would do
   * to that one. Empty or absent writes NO `counter_metrics` key, which is what keeps every definition approved
   * before counter-metrics existed byte-identical.
   */
  counterMetrics?: CounterMetric[];
  /**
   * The recorded answer when the honest answer is "none": one sentence. Because `counter_metrics` is omitted when
   * empty, an Operator who thought about it and found nothing looks exactly like one who never asked — unless the
   * decision is written down here. Refused alongside a non-empty `counterMetrics`.
   */
  counterMetricsNoneBecause?: string;
};

export type CounterMetric = {
  /** Another definition in the same Instance. Never this definition. */
  id: string;
  /** Pins that definition's version; omitted means whichever version the Instance currently carries. */
  version?: number;
  /** One sentence: what gaming the primary metric would do to this one. The mechanism, not the sentiment. */
  why: string;
};

/**
 * The one shape check for a `counter_metrics` list. It lives in `scripts/fixture-safety.mjs` because the reader
 * (`scripts/lib/validate-finding.mjs`) cannot import this module, and two copies of a rule are two rules.
 */
export const counterMetricProblems = sharedCounterMetricProblems as (entries: unknown, selfId: string | null) => string[];

export type ProposeResult = { written: boolean; path: string; action: "created" | "updated" | "refused"; problems: Problem[]; info: string[] };

export function renderProposedDefinition(def: ProposedDefinition): string {
  // Omitted when empty, both of them. A `counter_metrics: []` would be a new byte in the front matter of every
  // definition that has none, and the content hash of every already-approved definition would move with it.
  const counters = (def.counterMetrics ?? []).length
    ? { counter_metrics: def.counterMetrics!.map((c) => (c.version === undefined ? { id: c.id, why: c.why } : { id: c.id, version: c.version, why: c.why })) }
    : {};
  const none = !(def.counterMetrics ?? []).length && def.counterMetricsNoneBecause?.trim()
    ? { counter_metrics_none_because: def.counterMetricsNoneBecause.trim() }
    : {};
  const front = toYaml({
    id: def.id,
    version: def.version,
    kind: def.kind,
    lifecycle: "proposed",
    grain: def.grain,
    population: def.population,
    denominator: def.denominator,
    window: def.window,
    owner: def.owner,
    ...counters,
    ...none,
  }, { lineWidth: 0 });
  const sql = Object.entries(def.sql)
    .map(([dialect, text]) => `## SQL (${dialect})\n\n\`\`\`sql\n${text.trimEnd()}\n\`\`\`\n`)
    .join("\n");
  return `---\n${front}---\n\n${def.meaning.trimEnd()}\n\n${sql}`;
}

/**
 * Write `<instanceRoot>/definitions/<id>.md` with `lifecycle: proposed` and no approval block.
 * Refuses when a definition file is already there and is anything other than an unapproved proposal, so an
 * approved definition can only ever be changed by the Operator who approved it.
 */
export function proposeDefinition(instanceRoot: string, def: ProposedDefinition): ProposeResult {
  const rel = `definitions/${def.id}.md`;
  let path: string;
  try {
    mkdirSync(safePath(instanceRoot, "definitions"), { recursive: true });
    path = safePath(instanceRoot, rel);
  } catch (e) {
    return { written: false, path: rel, action: "refused", info: [], problems: [{
      category: e instanceof ContractError ? ((e as any).category as Problem["category"]) : "unsafe_path",
      location: rel, message: (e as Error).message, remedy: "a definition id is lowercase letters, digits and underscores",
    }] };
  }
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(def.id)) {
    return { written: false, path: rel, action: "refused", info: [], problems: [{ category: "syntax", location: rel, message: `'${def.id}' is not a definition id`, remedy: "use the restricted charset ^[a-z][a-z0-9_]{0,63}$" }] };
  }
  // A counter-metric is a claim about another definition in this Instance, so a malformed one is refused before
  // anything is written: a definition whose front matter cannot be read is a definition no Finding can cite.
  const counterProblems = counterMetricProblems(def.counterMetrics?.length ? def.counterMetrics : undefined, def.id);
  if ((def.counterMetrics ?? []).length && def.counterMetricsNoneBecause?.trim()) {
    counterProblems.push("counter_metrics_none_because says no counter-metric could be named, and counter_metrics names some; a definition does one or the other");
  }
  for (const c of def.counterMetrics ?? []) {
    if (c.id !== def.id && /^[a-z][a-z0-9_]{0,63}$/.test(c.id) && !existsSync(safePath(instanceRoot, `definitions/${c.id}.md`))) {
      counterProblems.push(`counter-metric '${c.id}' has no definition file at definitions/${c.id}.md; a counter-metric names another definition in this Instance`);
    }
  }
  if (counterProblems.length) {
    return { written: false, path: rel, action: "refused", info: [], problems: counterProblems.map((message) => ({
      category: "schema" as Problem["category"], location: rel, message,
      remedy: "counter_metrics is a list of { id, version?, why }: an id of another definition in this Instance, an optional version pin, and one sentence saying what gaming this metric would do to that one (docs/contracts/instance-layout.md)",
    })) };
  }

  let action: ProposeResult["action"] = "created";
  if (existsSync(path)) {
    const existing = readFileSync(path, "utf8");
    const m = /^---\n([\s\S]*?)\n---\n/.exec(existing);
    const front = (m ? parseYaml(m[1]!) : null) as Record<string, unknown> | null;
    if (!front) {
      return { written: false, path: rel, action: "refused", info: [], problems: [{ category: "invalid_artifact", location: rel, message: "the existing definition file has no front matter, so its lifecycle could not be read and it was left alone", remedy: "repair the file by hand, or propose under a different id" }] };
    }
    if (front.approval !== undefined || front.lifecycle !== "proposed") {
      return { written: false, path: rel, action: "refused", info: [], problems: [{
        category: "definition_not_approved",
        location: rel,
        message: `${def.id} is already recorded as lifecycle ${String(front.lifecycle ?? "unknown")}${front.approval !== undefined ? " with an approval block" : ""}; a proposal never rewrites it`,
        remedy: "keep the approved definition and use it, or ask the Operator to approve a new version — changing an approved definition is their call, recorded as needs_input kind definition_approval",
      }] };
    }
    action = "updated";
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderProposedDefinition(def));
  return {
    written: true, path: rel, action, problems: [],
    info: [
      `${action} ${rel} with lifecycle proposed and no approval block`,
      (def.counterMetrics ?? []).length
        ? `${def.id} names ${def.counterMetrics!.length} counter-metric(s) [${def.counterMetrics!.map((c) => c.id).join(", ")}]; a Finding that publishes ${def.id} as its decision metric must report each of them`
        : def.counterMetricsNoneBecause?.trim()
          ? `${def.id} records that no counter-metric could be named, and why; that is a decision, not an omission`
          : `${def.id} names no counter-metric and does not say why; /grill-question asks what would get worse if this metric were pushed hard`,
      `${def.id} is a ${def.kind === "metric" ? "proposed Metric definition" : "Diagnostic calculation"}; a proposed definition may back a supporting or diagnostic Claim and may never be the published decision metric until an Operator approves it`,
    ],
  };
}
