#!/usr/bin/env node
// Re-pin a Finding manifest to the running renderer and house-style versions and recompute its content digest.
// Usage: node scripts/repin-renderer.mjs [--resign-fixtures] <finding-dir>...
// Reviews and attestations bind to a digest; a real Instance records them again by hand after a re-pin.
// --resign-fixtures rebinds entries that carried the previous digest, for the Engine's synthetic fixtures only,
// and prints the old and new digest so any Decision record or recorded run citing it can be updated.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { digestOf } from "./lib/validate-finding.mjs";
import { RENDERER_VERSION, HOUSE_STYLE_VERSION } from "../src/render/charts.ts";

const args = process.argv.slice(2);
const resign = args.includes("--resign-fixtures");
const dirs = args.filter((a) => !a.startsWith("--"));
if (!dirs.length) { console.error("usage: repin-renderer.mjs [--resign-fixtures] <finding-dir>..."); process.exit(2); }

for (const dir of dirs) {
  const path = join(dir, "manifest.yaml");
  const doc = parseDocument(readFileSync(path, "utf8"));
  const before = doc.toJS();
  const oldDigest = before.content_digest?.value;
  doc.setIn(["renderer", "version"], RENDERER_VERSION);
  doc.setIn(["renderer", "house_style_version"], HOUSE_STYLE_VERSION);
  const next = doc.toJS();
  let newDigest = oldDigest;
  if (oldDigest && !/^0+$/.test(oldDigest)) {
    const d = digestOf(next, dir);
    doc.setIn(["content_digest"], d);
    newDigest = d.value;
    if (resign) {
      (next.reviews ?? []).forEach((r, i) => { if (r.content_digest?.value === oldDigest) doc.setIn(["reviews", i, "content_digest", "value"], d.value); });
      (next.attestations ?? []).forEach((a, i) => { if (a.content_digest?.value === oldDigest) doc.setIn(["attestations", i, "content_digest", "value"], d.value); });
    }
  }
  writeFileSync(path, doc.toString({ lineWidth: 0 }));
  console.log(`${dir}: renderer ${before.renderer?.version} -> ${RENDERER_VERSION}, house style ${before.renderer?.house_style_version} -> ${HOUSE_STYLE_VERSION}${oldDigest && newDigest !== oldDigest ? `, digest ${oldDigest.slice(0, 12)} -> ${newDigest.slice(0, 12)}${resign ? " (fixture reviews re-bound)" : ""}` : ""}`);
}
