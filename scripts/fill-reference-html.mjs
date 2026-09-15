// Fills a hand-authored HTML reference template with display-formatted values from a Finding's manifest and
// saved results, writing render/finding.html. Same token grammar as memo.md plus {{meta:<json.path>}} for manifest
// fields. Refuses to write if a token does not resolve, if the export policy's private marker appears, or if a
// result column outside allowed_fields is referenced. This is reference tooling for the a2f exemplars, not the renderer.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const DIR = resolve(process.argv[2]);
const manifest = parseYaml(readFileSync(join(DIR, "manifest.yaml"), "utf8"));
const results = Object.fromEntries(manifest.results.map((r) => [r.id, JSON.parse(readFileSync(join(DIR, r.path), "utf8"))]));
const allowed = new Set(manifest.export_policy.allowed_fields);
const errors = [];

function fmt(value, unit, display) {
  if (value === null || value === undefined) return "not available";
  const kind = display?.kind ?? "text";
  const dec = display?.decimals ?? 0;
  let n = typeof value === "number" ? value : Number(value);
  const num = (x, d) => x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  switch (kind) {
    case "integer": return num(Math.round(n), 0);
    case "decimal": return num(n, dec);
    case "percent": return num(unit === "ratio" ? n * 100 : n, dec) + "%";
    case "percentage_points": return num(unit === "ratio" ? n * 100 : n, dec) + " pp";
    case "currency_usd": return "$" + num(n, 2);
    case "date": return String(value);
    default: return String(value);
  }
}
function resolveRef(ref) {
  let m;
  if ((m = /^ref:([a-z0-9_]+)\.([A-Za-z0-9_-]+)\.([a-z0-9_]+)$/.exec(ref))) {
    const [, rid, rk, col] = m;
    if (!allowed.has(`${rid}.${col}`)) { errors.push(`${ref}: column not in export_policy.allowed_fields`); return null; }
    const res = manifest.results.find((r) => r.id === rid); const data = results[rid];
    const rows = data?.rows.filter((r) => String(r[res.row_key]) === rk) ?? [];
    if (rows.length !== 1) { errors.push(`${ref}: ${rows.length} rows`); return null; }
    const c = res.columns.find((x) => x.name === col);
    return { value: rows[0][col], unit: c.unit, display: c.display };
  }
  if ((m = /^derived:([a-z0-9_]+)$/.exec(ref))) {
    const d = manifest.derived.find((x) => x.id === m[1]); if (!d) { errors.push(ref); return null; }
    const ops = d.operands.map(resolveRef); if (ops.some((o) => !o)) return null;
    const nums = ops.map((o) => (o.value === null ? null : Number(o.value)));
    let v = null;
    if (!nums.includes(null)) {
      const [a, b] = nums;
      v = d.operation === "difference" ? a - b : d.operation === "sum" ? nums.reduce((x, y) => x + y, 0)
        : d.operation === "ratio" ? (b === 0 ? null : a / b) : d.operation === "percent_of" ? (b === 0 ? null : 100 * a / b)
        : d.operation === "percent_change" ? (b === 0 ? null : 100 * (a - b) / b)
        : d.operation === "min" ? Math.min(...nums) : d.operation === "max" ? Math.max(...nums) : null;
    }
    return { value: v, unit: d.unit, display: d.display };
  }
  if ((m = /^ext:([a-z0-9_]+)$/.exec(ref))) {
    const e = manifest.external_sources.find((x) => x.id === m[1]); if (!e) { errors.push(ref); return null; }
    return { value: e.value, unit: e.unit, display: e.display };
  }
  errors.push("malformed " + ref); return null;
}
const meta = (path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[/^\d+$/.test(k) ? Number(k) : k]), manifest);

const tpl = readFileSync(join(DIR, "render/finding.template.html"), "utf8");
const out = tpl.replace(/\{\{(ref|derived|ext|meta|literal):([^}]*)\}\}/g, (_, kind, body) => {
  if (kind === "literal") return body;
  if (kind === "meta") { const v = meta(body); if (v === undefined) errors.push("meta:" + body); return String(v); }
  const r = resolveRef(kind + ":" + body); return r ? fmt(r.value, r.unit, r.display) : "UNRESOLVED";
});
if (manifest.export_policy.private_marker && out.includes(manifest.export_policy.private_marker)) errors.push("private marker present in output");
if (/\{\{/.test(out)) errors.push("unfilled token remains");
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
writeFileSync(join(DIR, "render/finding.html"), out);
console.log("wrote render/finding.html (" + out.length + " bytes)");
