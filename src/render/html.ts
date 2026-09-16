// One self-contained, reader-safe HTML page from validated source. Layout follows the reviewed reference
// (fixtures/.../render/finding.template.html). Every interpolation is escaped; every number is a resolved token;
// only exported result columns reach the page, its tables, its charts or its metadata.
import { existsSync, readFileSync } from "node:fs";
import { Marked, type Tokens } from "marked";
// @ts-ignore: shared helpers.
import { escapeHtml, safePath } from "../../scripts/fixture-safety.mjs";
import { resolveTokens, tableCells, type Results } from "./values.ts";
import { renderChartSvg, accessibleSvg, RENDERER_VERSION, HOUSE_STYLE_VERSION } from "./charts.ts";

export const CSS = `
  :root { --fg: #1c1c1c; --muted: #5a5a5a; --bg: #ffffff; --line: #d9d9d9; --accent: #0b6e4f; --grey-bar: #b9b9b9; --draft: #7a4b00; --draft-bg: #fff4e0; --focus: #1d4ed8; }
  @media (prefers-color-scheme: dark) { :root { --fg: #ececec; --muted: #b5b5b5; --bg: #121212; --line: #3a3a3a; --accent: #4fc79f; --grey-bar: #5c5c5c; --draft: #ffd08a; --draft-bg: #3a2a08; --focus: #8ab4ff; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 1.0625rem/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  main { max-width: 40rem; margin: 0 auto; padding: 0 1rem 4rem; }
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
  svg { width: 100%; height: auto; display: block; }
  table { border-collapse: collapse; width: 100%; font-size: 0.95rem; margin: 0.5rem 0; }
  caption { text-align: left; font-weight: 600; padding: 0.3rem 0; }
  th, td { text-align: left; padding: 0.45rem 0.4rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th[scope=col] { font-size: 0.85rem; color: var(--muted); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  ul.facts { list-style: none; padding: 0; margin: 0.5rem 0; }
  ul.facts li { padding: 0.45rem 0; border-bottom: 1px solid var(--line); }
  ul.facts li strong { display: block; font-size: 0.85rem; color: var(--muted); font-weight: 600; }
  .action { display: inline-block; background: var(--accent); color: #fff; padding: 0.6rem 1rem; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 0.5rem 0; }
  code { font: 0.9em ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  footer { margin-top: 3rem; font-size: 0.9rem; color: var(--muted); border-top: 1px solid var(--line); padding-top: 1rem; }
  .flag { font-size: 0.9rem; }
  @media (max-width: 30rem) { dl.who { grid-template-columns: 1fr; } dl.who dt { margin-top: 0.4rem; } table { display: block; overflow-x: auto; } h1 { font-size: 1.4rem; } }
`;

const SECTIONS = ["Answer", "Decision it informs", "Evidence", "How we checked", "What would change our mind", "Appendix"];
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

export type RenderInputs = { dir: string; manifest: any; results: Results; memo: string; readiness: string; readinessReasons: string[]; content: string; readerLabel: string; generatedAt?: string; charts?: boolean };

function mailto(manifest: any, claimId?: string): string {
  const id = manifest.finding.id, rev = manifest.finding.revision;
  const subject = encodeURIComponent(`Question about Finding ${id} r${rev}${claimId ? `, claim ${claimId}` : ""}`);
  const body = encodeURIComponent(`Finding: ${id}\nRevision: ${rev}\n${claimId ? `Claim: ${claimId}\n` : ""}\nMy question: `);
  return `mailto:${encodeURIComponent(manifest.owner.contact)}?subject=${subject}&body=${body}`;
}

export async function renderHtml(inp: RenderInputs): Promise<{ html: string; svgs: Record<string, string> }> {
  const { manifest: m, results, dir } = inp;
  const esc = escapeHtml as (s: string) => string;
  const R = (text: string, loc: string) => markdown(resolveTokens(m, results, text, loc, (s) => s));
  const RI = (text: string, loc: string) => resolveTokens(m, results, text, loc); // inline, escaped
  const memo = parseMemo(inp.memo);
  const section = (name: string) => memo.sections.find((s) => s.name === name)?.body ?? "";
  const allowed = new Set<string>(m.export_policy.allowed_fields);
  const svgs: Record<string, string> = {};

  // Charts and tables are rendered once and spliced where the memo places their markers.
  const figures: Record<string, string> = {};
  for (const ch of m.charts.filter((c: any) => !c.variant_of)) {
    const title = RI(ch.title, `chart ${ch.id} title`);
    const description = RI(ch.description, `chart ${ch.id} description`);
    const svg = accessibleSvg(await renderChartSvg(m, results, { ...ch, __specPath: safePath(dir, ch.spec_path) }, resolveTokens(m, results, ch.title, ch.id, (s) => s)), `chart-${ch.id}`, resolveTokens(m, results, ch.title, ch.id, (s) => s), resolveTokens(m, results, ch.description, ch.id, (s) => s), esc);
    svgs[ch.id] = svg;
    const res = m.results.find((r: any) => r.id === ch.result_id);
    const cols = res.columns.map((c: any) => c.name).filter((n: string) => allowed.has(`${ch.result_id}.${n}`));
    const rows = tableCells(m, results, ch.result_id, cols);
    figures[`chart:${ch.id}`] = `<figure>${svg}<figcaption>${description}</figcaption>
<details><summary>The numbers behind this chart</summary><table><caption>${title}</caption><thead><tr>${cols.map((c: string) => `<th scope="col">${esc(c.replace(/_/g, " "))}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.cells.map((c, i) => i === 0 ? `<th scope="row">${c}</th>` : `<td class="num">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></details></figure>`;
  }
  for (const t of m.tables) {
    const cols = t.columns.map((c: any) => c.name);
    const rows = tableCells(m, results, t.result_id, cols, t.row_keys);
    figures[`table:${t.id}`] = `<table><caption>${esc(t.title)}</caption><thead><tr>${t.columns.map((c: any, i: number) => `<th scope="col"${i ? ' class="num"' : ""}>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.cells.map((c, i) => i === 0 ? `<th scope="row">${c}</th>` : `<td class="num">${c}</td>`).join("")}</tr>`).join("")}</tbody></table>${t.caption ? `<p class="flag">${esc(t.caption)}</p>` : ""}`;
  }
  const splice = (html: string) => html.replace(/<!-- (chart|table): ([a-z0-9_]+) -->/g, (_x, k, id) => figures[`${k}:${id}`] ?? "");
  const mdWithMarkers = (text: string, loc: string) => splice(R(text.replace(/<!-- (chart|table): ([a-z0-9_]+) -->/g, "\n\n<!-- $1: $2 -->\n\n"), loc)).replace(/&lt;!-- (chart|table): ([a-z0-9_]+) --&gt;/g, (_x, k, id) => figures[`${k}:${id}`] ?? "");

  // Answer + material caveat together.
  const answerBearing = m.claims.filter((c: any) => c.answer_bearing);
  const answerBody = section("Answer").replace(/<!-- material_caveat -->[\s\S]*$/, "");
  const caveats = answerBearing.map((c: any) => `<div class="caveat"><strong>The one thing that would change this</strong><p>${RI(c.material_caveat, `claim ${c.id} caveat`)}</p></div>`).join("");

  const draft = inp.readiness === "ready" ? "" : `<p class="draft" role="status">${esc(inp.content === "complete" ? "Draft. No one has approved this Finding for publication yet. Numbers are checked; the conclusion is not yet reviewed by a person." : "Incomplete draft. The analysis is not finished; nothing here is a result yet.")}${inp.readinessReasons.length ? ` <span class="flag">(${esc(inp.readinessReasons.join("; "))})</span>` : ""}</p>`;

  const claimsHtml = m.claims.map((c: any) => {
    const [label, hint] = TYPE_LABEL[c.type] ?? TYPE_LABEL.descriptive!;
    const cmp = c.comparison;
    const who = `<dl class="who"><dt>Who is counted</dt><dd>${RI(c.population, `claim ${c.id} population`)}</dd><dt>Compared with</dt><dd>${RI(cmp.description, `claim ${c.id} comparison`)}${cmp.pre_registered === false ? " <em>(a follow-up look, not planned before the analysis)</em>" : ""}</dd><dt>When</dt><dd>${esc(c.window.start)} to ${esc(c.window.end)} (${esc(c.window.timezone)})${c.window.description ? `. ${esc(c.window.description)}` : ""}</dd></dl>`;
    const limits = [...(c.exclusions.length ? c.exclusions : ["Nothing was left out."]), ...c.limitations];
    const calc = [
      ...c.evidence.map((e: string) => `<li><code>${esc(e)}</code> = ${esc(resolveTokens(m, results, `{{${e}}}`, c.id, (s) => s))}</li>`),
      ...m.definitions.filter((d: any) => c.evidence.some((e: string) => { const rid = /^ref:([a-z0-9_]+)\./.exec(e)?.[1]; const res = m.results.find((r: any) => r.id === rid); return res?.columns.some((col: any) => col.definition_ref?.id === d.id); })).map((d: any) => `<li>Definition <code>${esc(d.id)}</code> version ${esc(String(d.version))} (${esc(d.kind)}, recorded as ${esc(d.lifecycle)})</li>`),
      ...m.derived.filter((d: any) => c.evidence.includes(`derived:${d.id}`)).map((d: any) => `<li><code>${esc(d.id)}</code> is the ${esc(d.operation.replace(/_/g, " "))} of ${d.operands.map((o: string) => `<code>${esc(o)}</code>`).join(", ")}${d.description ? `: ${esc(d.description)}` : ""}</li>`),
      ...m.external_sources.filter((x: any) => c.evidence.includes(`ext:${x.id}`)).map((x: any) => `<li><code>${esc(x.id)}</code> is a ${esc(x.kind.replace(/_/g, " "))} from a ${esc(x.source.type.replace(/_/g, " "))} dated ${esc(x.source.date)}: ${esc(x.source.description)}</li>`),
    ];
    return `<section aria-labelledby="${esc(c.id)}"><span class="type" title="${esc(hint)}">${esc(label)}</span><h3 id="${esc(c.id)}">${RI(c.sentence, `claim ${c.id}`)}</h3>${mdWithMarkers(memo.claims[c.id] ?? "", `claim ${c.id} memo`)}${who}<details><summary>Who was left out, and the limits of this claim</summary><ul>${limits.map((l) => `<li>${RI(l, c.id)}</li>`).join("")}</ul></details>${calc.length ? `<details><summary>How this was calculated</summary><ul>${calc.join("")}</ul></details>` : ""}<p class="flag"><a href="${mailto(m, c.id)}">Question or flag this claim</a> (reference: <code>${esc(m.finding.id)} r${esc(String(m.finding.revision))} ${esc(c.id)}</code>)</p></section>`;
  }).join("\n");

  const checksPassed = m.checks.filter((c: any) => c.outcome === "pass").map((c: any) => esc(c.description));
  const checksFailed = m.checks.filter((c: any) => c.outcome === "fail").map((c: any) => `${esc(c.description)}${c.kind === "minimum_data" ? " (this failure is the result of the Finding, not an error)" : ""}`);
  const checksNotRun = m.checks.filter((c: any) => c.outcome === "not_run").map((c: any) => esc(c.description));
  const facts = [
    checksPassed.length ? `<li><strong>Checks passed</strong> ${checksPassed.join(" · ")}</li>` : "",
    checksFailed.length ? `<li><strong>Checks that did not pass</strong> ${checksFailed.join(" · ")}</li>` : "",
    checksNotRun.length ? `<li><strong>Not run</strong> ${checksNotRun.join(" · ")}</li>` : "",
    ...m.definitions.map((d: any) => `<li><strong>Definition</strong> ${esc(d.id)}, version ${esc(String(d.version))}, recorded as ${esc(d.lifecycle)}${d.approval ? ` (approval recorded by ${esc(d.approval.approver)} on ${esc(d.approval.date)}; a recorded lifecycle is not a verified approval)` : ""}.</li>`),
    ...m.reviews.map((r: any) => `<li><strong>${esc(r.kind.replace(/^./, (x: string) => x.toUpperCase()))} review</strong> Recorded ${esc(r.date)} by ${esc(r.reviewer)}${r.content_digest.value !== m.content_digest.value ? "; for an earlier version of this content, so it is stale" : ""}${r.blocking?.length ? `; blocking: ${r.blocking.map(esc).join("; ")}` : ""}.</li>`),
    `<li><strong>Publication approval</strong> ${inp.readiness === "ready" ? "Verified." : "None verified. This is a draft."}</li>`,
    `<li><strong>Data</strong> ${m.snapshot.guarantees.length ? `Retained inputs are kept: ${m.snapshot.guarantees.map((g: string) => esc(g.replace(/_/g, " "))).join(" and ")} are possible.` : "Inputs were not retained; these numbers are not reproducible."}</li>`,
    `<li><strong>Covers</strong> ${esc(m.coverage.description)}</li>`,
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
<style>${CSS}</style>
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
  void SECTIONS; void existsSync; void readFileSync;
  return { html, svgs };
}
