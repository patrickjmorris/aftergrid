// One self-contained, reader-safe HTML page from validated source. Layout follows the reviewed reference
// (fixtures/.../render/finding.template.html). Every interpolation is escaped; every number is a resolved token;
// only exported result columns reach the page, its tables, its charts or its metadata.
import { randomUUID } from "node:crypto";
import { Marked, type Tokens } from "marked";
// @ts-ignore: shared helpers.
import { escapeHtml, safePath } from "../../scripts/fixture-safety.mjs";
import { resolveTokens, tableCells, displayValue, type Results } from "./values.ts";
// @ts-ignore: shared ESM library.
import { TOKEN_RE } from "../../scripts/lib/validate-finding.mjs";
import { renderChartSvg, accessibleSvg, RENDERER_VERSION, HOUSE_STYLE_VERSION } from "./charts.ts";
import { systemFont, type ResolvedFont } from "./fonts.ts";

export const CSS = `
  :root { --fg: #1c1c1c; --muted: #5a5a5a; --bg: #ffffff; --line: #d9d9d9; --accent: #0b6e4f; --grey-bar: #b9b9b9; --draft: #7a4b00; --draft-bg: #fff4e0; --focus: #1d4ed8; }
  @media (prefers-color-scheme: dark) { :root { --fg: #ececec; --muted: #b5b5b5; --bg: #121212; --line: #3a3a3a; --accent: #4fc79f; --grey-bar: #5c5c5c; --draft: #ffd08a; --draft-bg: #3a2a08; --focus: #8ab4ff; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 1.0625rem/1.55 __FONT_STACK__; }
  main { position: relative; max-width: 40rem; margin: 0 auto; padding: 0 1rem 4rem; }
  h1 { font-size: 1.6rem; line-height: 1.25; margin: 1.25rem 0 0.5rem; }
  h2 { font-size: 1.15rem; margin: 2rem 0 0.5rem; border-top: 1px solid var(--line); padding-top: 1rem; }
  h3 { font-size: 1.05rem; line-height: 1.35; margin: 1.5rem 0 0.5rem; }
  p { margin: 0.5rem 0; } a { color: var(--accent); }
  :focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
  .skip { position: absolute; left: -999px; } .skip:focus { left: 1rem; top: 0.5rem; background: var(--bg); padding: 0.5rem; z-index: 2; }
  .draft { background: var(--draft-bg); color: var(--draft); border: 1px solid currentColor; border-radius: 6px; padding: 0.6rem 0.8rem; margin: 1rem 0; font-weight: 600; }
  .answer { font-size: 1.25rem; line-height: 1.4; font-weight: 600; margin: 0.75rem 0 0.5rem; }
  .caveat { border-left: 4px solid var(--accent); padding: 0.4rem 0.8rem; margin: 0.75rem 0 0; background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .caveat strong { display: block; font-size: 0.85rem; letter-spacing: 0.02em; text-transform: uppercase; color: var(--muted); }
  .type { display: inline-block; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 0.05rem 0.55rem; margin-bottom: 0.3rem; }
  dl.who { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 0.75rem; margin: 0.75rem 0; font-size: 0.95rem; }
  dl.who dt { color: var(--muted); } dl.who dd { margin: 0; }
  details { border: 1px solid var(--line); border-radius: 6px; padding: 0.4rem 0.8rem; margin: 0.75rem 0; }
  summary { cursor: pointer; font-weight: 600; padding: 0.2rem 0; }
  figure { margin: 1rem 0; } figcaption { font-size: 0.95rem; color: var(--muted); margin-top: 0.4rem; }
  svg { width: 100%; height: auto; display: block; background: #fff; }
  table { border-collapse: collapse; width: 100%; font-size: 0.95rem; margin: 0.5rem 0; }
  caption { text-align: left; font-weight: 600; padding: 0.3rem 0; }
  th, td { text-align: left; padding: 0.45rem 0.4rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th[scope=col] { font-size: 0.85rem; color: var(--muted); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  ul.facts { list-style: none; padding: 0; margin: 0.5rem 0; }
  ul.facts li { padding: 0.45rem 0; border-bottom: 1px solid var(--line); }
  ul.facts li { display: grid; grid-template-columns: 1.5rem minmax(0, 1fr); gap: 0.4rem; align-items: start; }
  ul.facts li strong { display: block; font-size: 0.85rem; color: var(--muted); font-weight: 600; }
  .mk { display: inline-flex; width: 1.25rem; height: 1.25rem; border-radius: 999px; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; margin-top: 0.15rem; }
  .mk.ok { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
  .mk.wn { background: var(--draft-bg); color: var(--draft); }
  .mk.no { background: color-mix(in srgb, #b3261e 16%, transparent); color: #b3261e; }
  .mk.na { background: color-mix(in srgb, var(--muted) 14%, transparent); color: var(--muted); }
  /* Provenance popover on every resolved value. CSS only: hover, keyboard focus or a tap on the focusable value. */
  .ref { text-decoration: underline; text-decoration-style: dotted; text-decoration-color: var(--muted); text-underline-offset: 3px; text-decoration-thickness: 1.5px; cursor: help; border-radius: 3px; font-variant-numeric: tabular-nums; }
  .ref:hover, .ref:focus-within { background: color-mix(in srgb, var(--accent) 12%, transparent); text-decoration-color: var(--fg); }
  .tip { display: none; position: absolute; left: 1rem; right: 1rem; margin-top: 0.45rem; z-index: 5; background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 16px 40px -16px rgba(0,0,0,.4), 0 2px 6px rgba(0,0,0,.08); font-size: 0.9rem; line-height: 1.45; font-weight: 400; text-align: left; letter-spacing: 0; text-transform: none; }
  .tip::before { content: ""; position: absolute; left: 0; right: 0; top: -0.6rem; height: 0.6rem; }
  .ref:hover .tip, .ref:focus-within .tip { display: block; }
  .tip .th { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; padding: 0.7rem 0.9rem 0.55rem; border-bottom: 1px solid var(--line); }
  .tip .th b { font-size: 1.25rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .tip .th span { font: 0.75rem ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); text-align: right; word-break: break-all; }
  .tip .tr { display: grid; grid-template-columns: 1.3rem minmax(0, 1fr) auto; gap: 0.6rem; padding: 0.45rem 0.9rem; align-items: start; }
  .tip .tr + .tr { border-top: 1px solid color-mix(in srgb, var(--line) 60%, transparent); }
  .tip .tr i { display: inline-flex; width: 1.2rem; height: 1.2rem; border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); font: 600 0.7rem ui-monospace, SFMono-Regular, Menlo, monospace; font-style: normal; align-items: center; justify-content: center; margin-top: 0.1rem; }
  .tip .tr b { display: block; font-weight: 600; }
  .tip .tr b + span { display: block; color: var(--muted); font-size: 0.85rem; }
  .tip .tr em { font: 0.72rem ui-monospace, SFMono-Regular, Menlo, monospace; font-style: normal; color: var(--accent); white-space: nowrap; padding-top: 0.2rem; }
  .tip .tr em.wn { color: var(--draft); }
  .tip .ft { display: block; padding: 0.5rem 0.9rem 0.7rem; font-size: 0.8rem; color: var(--muted); border-top: 1px solid var(--line); }
  .action { display: inline-block; background: var(--accent); color: #fff; padding: 0.6rem 1rem; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 0.5rem 0; }
  code { font: 0.9em ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  footer { margin-top: 3rem; font-size: 0.9rem; color: var(--muted); border-top: 1px solid var(--line); padding-top: 1rem; }
  .flag { font-size: 0.9rem; }
  @media (max-width: 30rem) { dl.who { grid-template-columns: 1fr; } dl.who dt { margin-top: 0.4rem; } table { display: block; overflow-x: auto; } h1 { font-size: 1.4rem; } }
`;

const TYPE_LABEL: Record<string, [string, string]> = {
  causal: ["Cause and effect", "This claim says one thing caused another; it is only supported when the comparison was designed for that, such as random assignment."],
  associational: ["Pattern, not proof", "This claim describes a pattern seen after the fact; it does not establish a cause."],
  descriptive: ["What the data shows", "This claim describes what is in the data; it does not compare or explain."],
};

const md = new Marked({ gfm: true, breaks: false });
md.use({
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) { return escapeHtml((token as any).raw ?? ""); },
    link(token: Tokens.Link) { const ok = /^(https?:|mailto:)/i.test(token.href); const text = this.parser.parseInline(token.tokens); return ok ? `<a href="${escapeHtml(token.href)}">${text}</a>` : text; },
    image() { return ""; },
  },
});
const markdown = (text: string) => md.parse(text) as string;

type MemoSection = { name: string; body: string };
export function parseMemo(text: string): { front: Record<string, unknown>; sections: MemoSection[]; claims: Record<string, string> } {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const body = fm ? text.slice(fm[0].length) : text;
  const front: Record<string, unknown> = {};
  for (const line of (fm?.[1] ?? "").split("\n")) { const m = /^(\w+):\s*(.*)$/.exec(line); if (m) front[m[1]!] = /^\d+$/.test(m[2]!) ? Number(m[2]) : m[2]; }
  const lines = body.split("\n");
  const sections: MemoSection[] = [];
  let cur: MemoSection | null = null;
  for (const line of lines) {
    const h = /^## (.*)$/.exec(line);
    if (h) { cur = { name: h[1]!.trim(), body: "" }; sections.push(cur); continue; }
    if (cur) cur.body += line + "\n";
  }
  const claims: Record<string, string> = {};
  const ev = sections.find((s) => s.name === "Evidence")?.body ?? "";
  for (const part of ev.split(/^(?=### )/m)) { const m = /^### .*?<!-- claim: ([a-z0-9_]+) -->\s*\n([\s\S]*)$/.exec(part); if (m) claims[m[1]!] = m[2]!; }
  return { front, sections, claims };
}


const shortHash = (h: any): string => (h && typeof h.value === "string" && h.value.length > 12) ? `${h.value.slice(0, 4)}…${h.value.slice(-4)}` : (h?.value ?? "");
const day = (ts: unknown): string => typeof ts === "string" ? ts.slice(0, 10) : "";
const unitWords = (col: any): string => {
  const kind = col?.display?.kind; const unit = col?.unit;
  if (kind === "percent") return "a share, shown as a percentage";
  if (kind === "percentage_points") return "a difference in percentage points";
  if (kind === "integer") return unit && unit !== "text" ? `a count of ${unit}` : "a count";
  return unit && unit !== "text" ? String(unit) : "";
};
type TrailRow = [title: string, detail: string, status: string, cls?: string];

export type RenderInputs = { dir: string; manifest: any; results: Results; memo: string; readiness: string; readinessReasons: string[]; content: string; readerLabel: string; generatedAt?: string; charts?: boolean; font?: ResolvedFont };

function mailto(manifest: any, claimId?: string): string {
  const id = manifest.finding.id, rev = manifest.finding.revision;
  const subject = encodeURIComponent(`Question about Finding ${id} r${rev}${claimId ? `, claim ${claimId}` : ""}`);
  const body = encodeURIComponent(`Finding: ${id}\nRevision: ${rev}\n${claimId ? `Claim: ${claimId}\n` : ""}\nMy question: `);
  return `mailto:${encodeURIComponent(manifest.owner.contact)}?subject=${subject}&body=${body}`;
}

export async function renderHtml(inp: RenderInputs): Promise<{ html: string; svgs: Record<string, string> }> {
  const { manifest: m, results, dir } = inp;
  const font = inp.font ?? systemFont();
  const esc = escapeHtml as (s: string) => string;
  // Provenance popover for one value token. Every field comes from the pinned manifest and is escaped; the popover
  // is plain markup (spans only, so it survives inside headings and paragraphs) shown by CSS on hover or focus.
  let tipCount = 0;
  const trail = (rows: (TrailRow | null)[]) => rows.filter((r): r is TrailRow => !!r).map(([title, detail, status, cls], i) => `<span class="tr"><i>${i + 1}</i><span><b>${title}</b><span>${detail}</span></span>${status ? `<em${cls ? ` class="${cls}"` : ""}>${status}</em>` : ""}</span>`).join("");
  const refRows = (rid: string, key: string, col: string): (TrailRow | null)[] => {
    const res = m.results.find((r: any) => r.id === rid);
    const column = res?.columns.find((c: any) => c.name === col);
    const ex = (m.executions ?? []).find((e: any) => e.id === res?.execution_id);
    const q = ex ? (m.queries ?? []).find((x: any) => x.id === ex.query_id) : undefined;
    const inputs = (m.snapshot?.inputs ?? []).filter((i: any) => (ex?.input_ids ?? []).includes(i.id));
    const def = column?.definition_ref ? m.definitions.find((d: any) => d.id === column.definition_ref.id) : undefined;
    const words = unitWords(column);
    return [
      ["Saved result", `<code>${esc(res?.path ?? rid)}</code>, row <code>${esc(key)}</code>, column <code>${esc(col)}</code>${words ? ` (${esc(words)})` : ""}`, res ? `hash ${esc(shortHash(res.content_hash))}` : ""],
      ["Query that produced it", q ? `<code>${esc(q.path)}</code> (${esc(q.dialect)})${ex ? `, run ${esc(day(ex.executed_at))}${ex.mode === "retained_rerun" ? " against the retained copy of the data" : ""}` : ""}` : "not recorded", q ? `sql ${esc(shortHash(q.content_hash))}` : "", q ? undefined : "wn"],
      ["Data it ran on",
        inputs.length ? `${inputs.map((i: any) => `<code>${esc(i.path)}</code>`).join(", ")}, captured ${esc(day(inputs[0].captured_at))}`
        : ex?.executed_by?.kind === "harness" ? `the source, read by ${esc(String(ex.executed_by.tool))}; aftergrid recorded the result and did not run the query, so no copy of the data was kept`
        : "retained inputs not recorded",
        inputs.length ? "hashed" : "", inputs.length ? undefined : "wn"],
      def ? ["Definition it uses", `<code>${esc(def.id)}</code> version ${esc(String(def.version))}, recorded as ${esc(def.lifecycle)}${def.approval ? `; approval recorded by ${esc(def.approval.approver)} on ${esc(def.approval.date)}` : ""}`, def.approval ? "recorded, not verified here" : esc(def.lifecycle), "wn"] : null,
    ];
  };
  const tipInner = (kind: string, body: string, display: string, loc: string): string => {
    let sub = ""; let rows: (TrailRow | null)[] = [];
    if (kind === "ref") {
      const [rid, key, col] = body.split(".") as [string, string, string];
      sub = `${rid} · ${key} · ${col}`; rows = refRows(rid, key, col);
    } else if (kind === "derived") {
      const d = m.derived.find((x: any) => x.id === body);
      const parts = d.operands.map((o: string) => `${esc(displayValue(m, results, o, loc))} <span class="flag">(${esc(o.replace(/^ref:/, ""))})</span>`);
      sub = `${d.operation.replace(/_/g, " ")} · ${d.operands.length} values`;
      const first = /^ref:([a-z0-9_]+)\.([A-Za-z0-9_-]+)\.([a-z0-9_]+)$/.exec(d.operands[0] ?? "");
      rows = [["Calculation", `The ${esc(d.operation.replace(/_/g, " "))} of ${parts.join(" and ")}${d.description ? `. ${esc(d.description)}` : ""}`, "computed at render"], ...(first ? refRows(first[1]!, first[2]!, first[3]!) : [])];
    } else if (kind === "ext") {
      const x = m.external_sources.find((e: any) => e.id === body);
      sub = `${x.kind} · not a measurement`;
      rows = [[x.kind.replace(/^./, (c: string) => c.toUpperCase()), esc(x.source.description), "declared"], ["Where it is written down", `${esc(x.source.type.replace(/_/g, " "))}${x.source.location ? ` <code>${esc(x.source.location)}</code>` : ""}, dated ${esc(x.source.date)}${x.source.owner ? `, owner ${esc(x.source.owner)}` : ""}`, ""]];
    }
    return `<span class="th"><b>${esc(display)}</b><span>${esc(sub)}</span></span>${trail(rows)}<span class="ft">Written in <code>memo.md</code> as <code>{{${esc(kind)}:${esc(body)}}}</code>. If any step changes, the recorded reviews no longer apply.</span>`;
  };
  const tokenHtml = (kind: string, body: string, loc: string): string => {
    const display = displayValue(m, results, `${kind}:${body}`, loc);
    const id = `tip-${++tipCount}`;
    return `<span class="ref" tabindex="0" aria-describedby="${id}">${esc(display)}<span class="tip" id="${id}" role="tooltip">${tipInner(kind, body, display, loc)}</span></span>`;
  };
  const TOKENS = new RegExp((TOKEN_RE as RegExp).source, "g");
  // Parse authored Markdown before inserting token values, so data cannot create tags, links or blocks.
  const R = (text: string, loc: string) => {
    const prefix = `AGTOKEN${randomUUID().replaceAll("-", "")}X`;
    const values: string[] = [];
    const source = text.replace(TOKENS, (_m: string, kind: string, body: string) => {
      values.push(kind === "literal" ? esc(body) : tokenHtml(kind, body, loc)); return `${prefix}${values.length - 1}END`;
    });
    return markdown(source).replace(new RegExp(`${prefix}(\\d+)END`, "g"), (_m, i) => values[Number(i)]!);
  };
  // Inline text with popovers (claim sentences, populations, caveats, limits) and plain inline text (chart titles, captions).
  const RP = (text: string, loc: string) => esc(text).replace(TOKENS, (_m: string, kind: string, body: string) => kind === "literal" ? esc(body) : tokenHtml(kind, body, loc));
  const RI = (text: string, loc: string) => esc(resolveTokens(m, results, text, loc, (s) => s));
  const memo = parseMemo(inp.memo);
  const section = (name: string) => memo.sections.find((s) => s.name === name)?.body ?? "";
  const allowed = new Set<string>(m.export_policy.allowed_fields);
  const svgs: Record<string, string> = {};

  // A table cell is a ref token by construction; numeric cells carry the same popover as prose.
  const cell = (resultId: string, key: string, col: string, display: string): string => {
    const res = m.results.find((r: any) => r.id === resultId);
    const column = res?.columns.find((c: any) => c.name === col);
    return column && column.type !== "text" ? tokenHtml("ref", `${resultId}.${key}.${col}`, `table ${resultId}`) : esc(display);
  };
  // Charts and tables are rendered once and spliced where the memo places their markers.
  const figures: Record<string, string> = {};
  for (const ch of m.charts.filter((c: any) => !c.variant_of)) {
    const title = RI(ch.title, `chart ${ch.id} title`);
    const description = RI(ch.description, `chart ${ch.id} description`);
    const svg = accessibleSvg(await renderChartSvg(m, results, { ...ch, __specPath: safePath(dir, ch.spec_path) }, resolveTokens(m, results, ch.title, ch.id, (s) => s), { font: font.svgStack }), `chart-${ch.id}`, resolveTokens(m, results, ch.title, ch.id, (s) => s), resolveTokens(m, results, ch.description, ch.id, (s) => s), esc);
    svgs[ch.id] = svg;
    const res = m.results.find((r: any) => r.id === ch.result_id);
    const cols = res.columns.map((c: any) => c.name).filter((n: string) => allowed.has(`${ch.result_id}.${n}`));
    const rows = tableCells(m, results, ch.result_id, cols);
    figures[`chart:${ch.id}`] = `<figure>${svg}<figcaption>${description}</figcaption>
<details><summary>The numbers behind this chart</summary><table><caption>${title}</caption><thead><tr>${cols.map((c: string) => `<th scope="col">${esc(c.replace(/_/g, " "))}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.cells.map((c, i) => i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td class="num">${cell(ch.result_id, r.key, cols[i]!, c)}</td>`).join("")}</tr>`).join("")}</tbody></table></details></figure>`;
  }
  for (const t of m.tables) {
    const cols = t.columns.map((c: any) => c.name);
    const rows = tableCells(m, results, t.result_id, cols, t.row_keys);
    figures[`table:${t.id}`] = `<table><caption>${esc(t.title)}</caption><thead><tr>${t.columns.map((c: any, i: number) => `<th scope="col"${i ? ' class="num"' : ""}>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.cells.map((c, i) => i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td class="num">${cell(t.result_id, r.key, cols[i]!, c)}</td>`).join("")}</tr>`).join("")}</tbody></table>${t.caption ? `<p class="flag">${esc(t.caption)}</p>` : ""}`;
  }
  const mdWithMarkers = (text: string, loc: string) => {
    const prefix = `AGFIGURE${randomUUID().replaceAll("-", "")}X`;
    const placed: string[] = [];
    // Skip value tokens: their contents are data, even if they contain a marker-looking comment.
    const source = text.replace(/\{\{(?:ref|derived|ext|literal):[^}]*\}\}|<!-- (chart|table): ([a-z0-9_]+) -->/g, (raw, kind, id) => {
      if (!kind) return raw;
      placed.push(figures[`${kind}:${id}`] ?? "");
      return `\n\n${prefix}${placed.length - 1}END\n\n`;
    });
    return R(source, loc).replace(new RegExp(`(?:<p>)?${prefix}(\\d+)END(?:</p>)?`, "g"), (_m, i) => placed[Number(i)]!);
  };

  // Answer + material caveat together.
  const answerBearing = m.claims.filter((c: any) => c.answer_bearing);
  const answerBody = section("Answer").replace(/<!-- material_caveat -->[\s\S]*$/, "");
  const caveats = answerBearing.map((c: any) => `<div class="caveat"><strong>The one thing that would change this</strong><p>${RP(c.material_caveat, `claim ${c.id} caveat`)}</p></div>`).join("");

  const draft = inp.readiness === "ready" ? "" : `<p class="draft" role="status">${esc(inp.content === "complete" ? "Draft. Publication approval has not been verified. Saved evidence passed validation; SQL was not rerun. Recorded reviews are listed below." : "Incomplete draft. The analysis is not finished; nothing here is a result yet.")}${inp.readinessReasons.length ? ` <span class="flag">(${esc(inp.readinessReasons.join("; "))})</span>` : ""}</p>`;

  const claimsHtml = m.claims.map((c: any) => {
    const [label, hint] = TYPE_LABEL[c.type] ?? TYPE_LABEL.descriptive!;
    const cmp = c.comparison;
    const who = `<dl class="who"><dt>Who is counted</dt><dd>${RP(c.population, `claim ${c.id} population`)}</dd><dt>Compared with</dt><dd>${RP(cmp.description, `claim ${c.id} comparison`)}${cmp.pre_registered === false ? " <em>(a follow-up look, not planned before the analysis)</em>" : ""}</dd><dt>When</dt><dd>${esc(c.window.start)} to ${esc(c.window.end)} (${esc(c.window.timezone)})${c.window.description ? `. ${esc(c.window.description)}` : ""}</dd></dl>`;
    const limits = [...(c.exclusions.length ? c.exclusions : ["Nothing was left out."]), ...c.limitations];
    const calc = [
      ...c.evidence.map((e: string) => `<li><code>${esc(e)}</code> = ${esc(resolveTokens(m, results, `{{${e}}}`, c.id, (s) => s))}</li>`),
      ...m.definitions.filter((d: any) => c.evidence.some((e: string) => { const rid = /^ref:([a-z0-9_]+)\./.exec(e)?.[1]; const res = m.results.find((r: any) => r.id === rid); return res?.columns.some((col: any) => col.definition_ref?.id === d.id); })).map((d: any) => `<li>Definition <code>${esc(d.id)}</code> version ${esc(String(d.version))} (${esc(d.kind)}, recorded as ${esc(d.lifecycle)})</li>`),
      ...m.derived.filter((d: any) => c.evidence.includes(`derived:${d.id}`)).map((d: any) => `<li><code>${esc(d.id)}</code> is the ${esc(d.operation.replace(/_/g, " "))} of ${d.operands.map((o: string) => `<code>${esc(o)}</code>`).join(", ")}${d.description ? `: ${esc(d.description)}` : ""}</li>`),
      ...m.external_sources.filter((x: any) => c.evidence.includes(`ext:${x.id}`)).map((x: any) => `<li><code>${esc(x.id)}</code> is a ${esc(x.kind.replace(/_/g, " "))} from a ${esc(x.source.type.replace(/_/g, " "))} dated ${esc(x.source.date)}: ${esc(x.source.description)}</li>`),
    ];
    return `<section aria-labelledby="${esc(c.id)}"><span class="type" title="${esc(hint)}">${esc(label)}</span><h3 id="${esc(c.id)}">${RP(c.sentence, `claim ${c.id}`)}</h3>${mdWithMarkers(memo.claims[c.id] ?? "", `claim ${c.id} memo`)}${who}<details><summary>Who was left out, and the limits of this claim</summary><ul>${limits.map((l) => `<li>${RP(l, c.id)}</li>`).join("")}</ul></details>${calc.length ? `<details><summary>How this was calculated</summary><ul>${calc.join("")}</ul></details>` : ""}<p class="flag"><a href="${mailto(m, c.id)}">Question or flag this claim</a> (reference: <code>${esc(m.finding.id)} r${esc(String(m.finding.revision))} ${esc(c.id)}</code>)</p></section>`;
  }).join("\n");

  const recordedTools: string[] = [...new Set<string>([
    ...(m.executions ?? []).filter((e: any) => e.executed_by?.kind === "harness").map((e: any) => String(e.executed_by.tool)),
    ...(m.checks ?? []).filter((c: any) => c.reported_by).map((c: any) => String(c.reported_by.tool)),
  ])];
  const checksPassed = m.checks.filter((c: any) => c.outcome === "pass").map((c: any) => esc(c.description));
  const checksFailed = m.checks.filter((c: any) => c.outcome === "fail").map((c: any) => `${esc(c.description)}${c.kind === "minimum_data" ? " (this failure is the result of the Finding, not an error)" : ""}`);
  const checksNotRun = m.checks.filter((c: any) => c.outcome === "not_run").map((c: any) => esc(c.description));
  const fact = (mark: string, title: string, body: string) => `<li><span class="mk ${mark}">${mark === "ok" ? "✓" : mark === "wn" ? "!" : mark === "no" ? "×" : "–"}</span><span><strong>${title}</strong> ${body}</span></li>`;
  const facts = [
    checksPassed.length ? fact("ok", "Checks passed", checksPassed.join(" · ")) : "",
    checksFailed.length ? fact("no", "Checks that did not pass", checksFailed.join(" · ")) : "",
    checksNotRun.length ? fact("na", "Not run", checksNotRun.join(" · ")) : "",
    ...m.definitions.map((d: any) => fact(d.lifecycle === "approved" ? "wn" : "na", "Definition", `${esc(d.id)}, version ${esc(String(d.version))}, recorded as ${esc(d.lifecycle)}${d.approval ? ` (approval recorded by ${esc(d.approval.approver)} on ${esc(d.approval.date)}; a recorded lifecycle is not a verified approval)` : ""}.`)),
    ...m.reviews.map((r: any) => fact(r.content_digest.value !== m.content_digest.value || r.blocking?.length ? "wn" : "ok", `${esc(r.kind.replace(/^./, (x: string) => x.toUpperCase()))} review`, `Recorded ${esc(r.date)} by ${esc(r.reviewer)}${r.content_digest.value !== m.content_digest.value ? "; for an earlier version of this content, so it is stale" : ""}${r.blocking?.length ? `; blocking: ${r.blocking.map(esc).join("; ")}` : ""}.`)),
    fact(inp.readiness === "ready" ? "ok" : "no", "Publication approval", inp.readiness === "ready" ? "Verified." : "None verified. This is a draft."),
    // What the Finding KEPT, which is `snapshot.inputs` and never the guarantee list: a recorded Finding retains
    // nothing and still guarantees artifact_replay, so reading the guarantees as a kept copy would tell a Reader
    // the opposite of what the provenance popover on every value says.
    (m.snapshot.inputs ?? []).length
      ? (m.snapshot.guarantees ?? []).length
        ? fact("ok", "Data", `Retained inputs are kept: ${m.snapshot.guarantees.map((g: string) => esc(g.replace(/_/g, " "))).join(" and ")} are possible.`)
        // capture leaves the guarantee list empty and execute empties it when a run saved no result: the copy
        // exists, nothing has been shown to replay from it yet.
        : fact("wn", "Data", "Retained inputs are kept, but no replay or rerun from them has been recorded yet.")
      : recordedTools.length
        ? fact("no", "Data", "No copy of the data was kept. The saved results replay byte for byte; the queries cannot be rerun here.")
        : fact("no", "Data", "Inputs were not retained; these numbers are not reproducible."),
    // The recorded data path (ADR 0010): the Operator's own tool ran the queries and the Checks, and aftergrid
    // wrote down what came back. A Reader is told that in one sentence, beside the other facts, never instead of them.
    recordedTools.length ? fact("wn", "How this was run", `Queries and Checks were run by the Operator's tool ${esc(recordedTools.join(", "))}; aftergrid recorded them and did not rerun them.`) : "",
    fact("na", "Covers", esc(m.coverage.description)),
  ].filter(Boolean).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="aftergrid-finding" content="${esc(m.finding.id)} r${esc(String(m.finding.revision))}">
<meta name="generator" content="aftergrid render ${RENDERER_VERSION}, house style ${HOUSE_STYLE_VERSION}">
<title>${esc(m.finding.title)}</title>
<style>${font.faces ? font.faces + "\n" : ""}${CSS.replace("__FONT_STACK__", font.stack)}</style>
</head>
<body>
<a class="skip" href="#answer">Skip to the answer</a>
<main>
${draft}
<h1>${esc(m.finding.title)}</h1>
<p class="flag">For: ${esc(inp.readerLabel)} · From: ${esc(m.owner.name)} · Generated ${esc(inp.generatedAt ?? m.finding.generated_at)} · Revision ${esc(String(m.finding.revision))}</p>
<h2 id="answer">Answer</h2>
<div class="answer">${R(answerBody, "Answer")}</div>
${caveats}
<h2>Decision it informs</h2>
${R(section("Decision it informs"), "Decision")}
<h2>Evidence</h2>
${claimsHtml}
<h2>How we checked</h2>
<p>These are separate facts. Passing checks mean the arithmetic and the references hold; they do not by themselves make the conclusion right.</p>
<ul class="facts">${facts}</ul>
${R(section("How we checked"), "How we checked")}
<h2>What would change our mind</h2>
${R(section("What would change our mind"), "What would change our mind")}
<h2>Question or flag this Finding</h2>
<p><a class="action" href="${mailto(m)}">Email ${esc(m.owner.name)}</a></p>
<p>If the button does nothing on this device, write to <code>${esc(m.owner.contact)}</code> and quote <code>${esc(m.finding.id)} r${esc(String(m.finding.revision))}</code>. Your message carries only these ids, never the numbers.</p>
<h2>Appendix</h2>
${R(section("Appendix"), "Appendix")}
<footer>
<p>Finding <code>${esc(m.finding.id)}</code>, revision ${esc(String(m.finding.revision))}, generated ${esc(inp.generatedAt ?? m.finding.generated_at)}. Data covered: ${esc(m.coverage.data_from)} to ${esc(m.coverage.data_to)}.</p>
<p>This file cannot know whether a newer revision exists. The current version lives at <code>${esc(m.finding.canonical_location)}</code>.</p>
<p>Owner: ${esc(m.owner.name)} (${esc(m.owner.contact)}).</p>
</footer>
</main>
</body>
</html>
`;
  return { html, svgs };
}
