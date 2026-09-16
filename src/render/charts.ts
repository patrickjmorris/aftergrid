// Chart rendering: a validated Vega-Lite subset spec, bound by the renderer to one saved result set, rendered to SVG
// in Node (no canvas) with a pinned house style, and to PNG through a WASM rasterizer (no native compile).
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fail } from "../../scripts/fixture-safety.mjs";
import type { Results } from "./values.ts";

export const RENDERER_VERSION = "0.1.0";
export const HOUSE_STYLE_VERSION = "0.1.0";
const ACCENT = "#0b6e4f", GREY = "#b9b9b9", INK = "#1c1c1c", MUTED = "#5a5a5a";
const FONT = "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

/** Storytelling-with-data defaults: grey plus one accent, direct labels, no gridlines, title states the Claim. */
export const houseStyle = {
  background: "transparent",
  font: FONT,
  axis: { grid: false, domainColor: "#d9d9d9", tickColor: "#d9d9d9", labelColor: INK, titleColor: MUTED, labelFontSize: 13, titleFontSize: 13, labelFont: FONT, titleFont: FONT },
  view: { stroke: null },
  title: { anchor: "start", fontSize: 18, fontWeight: 600, color: INK, font: FONT, subtitleColor: MUTED, subtitleFontSize: 13 },
  range: { category: [ACCENT, GREY, "#4c78a8", "#f58518", "#54a24b", "#e45756"] },
  bar: { cornerRadiusEnd: 2 },
  legend: { disable: true },
};

function bindRows(manifest: any, results: Results, resultId: string, allowed: Set<string>): Record<string, unknown>[] {
  const res = manifest.results.find((r: any) => r.id === resultId);
  const numeric = new Set(res.columns.filter((c: any) => c.type === "integer" || c.type === "decimal").map((c: any) => c.name));
  const cols: string[] = res.columns.map((c: any) => c.name).filter((n: string) => allowed.has(`${resultId}.${n}`));
  // Only exported columns reach the chart data; nothing else is embedded in the SVG or its payload.
  return results[resultId]!.rows.map((row) => Object.fromEntries(cols.map((n) => {
    const value = row[n] === null ? null : numeric.has(n) ? Number(row[n]) : row[n];
    if (typeof value === "number" && !Number.isFinite(value)) fail("render_error", `${resultId}.${n}`, "value exceeds the chart engine's finite numeric range");
    return [n, value];
  })));
}

export async function renderChartSvg(manifest: any, results: Results, chart: any, title: string, opts: { width?: number; height?: number } = {}): Promise<string> {
  const vega = await import("vega");
  const vl = await import("vega-lite");
  const spec = JSON.parse(readFileSync(chart.__specPath, "utf8"));
  const allowed = new Set<string>(manifest.export_policy.allowed_fields);
  const rows = bindRows(manifest, results, chart.result_id, allowed);
  const full = { ...spec, width: opts.width ?? 480, height: opts.height ?? Math.max(60, 32 * rows.length + 20), title: { text: title }, config: houseStyle, data: { name: "result" } };
  const compiled = vl.compile(full as any).spec;
  const view = new vega.View(vega.parse(compiled), { renderer: "none" }).data("result", rows);
  try {
    await view.runAsync();
    return await view.toSVG();
  } finally { view.finalize(); }
}

let wasmReady: Promise<void> | undefined;
/** The WASM rasterizer has no system fonts. A TTF is looked up here (AFTERGRID_FONT first); without one, text is not rasterized and the caller is told. */
const FONT_CANDIDATES = [
  process.env.AFTERGRID_FONT ?? "",
  "/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Helvetica.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "C:\\Windows\\Fonts\\arial.ttf",
].filter(Boolean);
export function findFont(): string | null { for (const f of FONT_CANDIDATES) if (existsSync(f)) return f; return null; }

export async function svgToPng(svg: string, width = 960): Promise<{ png: Buffer; font: string | null }> {
  const resvg = await import("@resvg/resvg-wasm");
  if (!wasmReady) {
    const require = createRequire(import.meta.url);
    wasmReady = resvg.initWasm(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
  }
  await wasmReady;
  const font = findFont();
  const opts: any = { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false, fontBuffers: font ? [readFileSync(font)] : [], defaultFontFamily: "sans-serif" } };
  const rasterizer = new resvg.Resvg(svg, opts);
  try {
    const image = rasterizer.render();
    try { return { png: Buffer.from(image.asPng()), font }; }
    finally { image.free(); }
  } finally { rasterizer.free(); }
}

/** Accessible wrapper: title and desc inside the SVG so screen readers announce the Claim and the takeaway. */
export function accessibleSvg(svg: string, id: string, title: string, description: string, escape: (s: string) => string): string {
  return svg.replace(/^<svg([^>]*)>/, (_m, attrs) => `<svg${attrs} role="img" aria-labelledby="${id}-title ${id}-desc"><title id="${id}-title">${escape(title)}</title><desc id="${id}-desc">${escape(description)}</desc>`);
}
