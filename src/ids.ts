// Identifier minting and grammar. Restricted charsets keep reference separators unambiguous
// (docs/contracts/reference-grammar.md).
import { randomBytes } from "node:crypto";

const BASE36 = "abcdefghijklmnopqrstuvwxyz0123456789";
export const ID_RE = /^[a-z][a-z0-9_]{0,63}$/;
export const ROW_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const FINDING_ID_RE = /^fnd_[a-z0-9]{12}$/;
export const DECISION_ID_RE = /^dec_[a-z0-9]{12}$/;

function base36(n: number): string {
  const bytes = randomBytes(n);
  let out = "";
  for (let i = 0; i < n; i++) out += BASE36[bytes[i]! % 36];
  return out;
}
export const mintFindingId = (): string => "fnd_" + base36(12);
export const mintDecisionId = (): string => "dec_" + base36(12);

/** Turns free text into a manifest id: lowercase, non-alphanumerics to underscore, leading letter guaranteed. */
export function toId(text: string): string {
  let id = text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
  if (!/^[a-z]/.test(id)) id = "q_" + id;
  return id.slice(0, 64).replace(/_+$/, "") || "q";
}
