import { lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

export class ContractError extends Error {
  constructor(category, location, message) { super(message); this.category = category; this.location = location; }
}
export const fail = (category, location, message) => { throw new ContractError(category, location, message); };

// Check every path component, including the final output, before either reading or writing it.
// Disallow symlinks even when they currently point inside the root: a fixture is portable data, not links.
export function safePath(root, path) {
  if (typeof path !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..')) {
    fail('unsafe_path', String(path), 'expected a relative file path without empty, dot or parent components');
  }
  let current = realpathSync(root);
  for (const part of path.split('/')) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) fail('unsafe_path', path, 'symlinks are not allowed in fixture paths'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return current;
}

export function validateStructure(m, dir, instance) {
  const unique = (items, field, loc) => {
    const seen = new Set();
    for (const item of items) { if (seen.has(item[field])) fail('duplicate_id', loc, `duplicate ${field}: ${item[field]}`); seen.add(item[field]); }
  };
  for (const group of ['definitions','queries','executions','results','derived','external_sources','claims','charts','tables','checks']) unique(m[group], 'id', group);
  unique(m.snapshot.inputs, 'id', 'snapshot.inputs');
  const destinations = new Set(['manifest.yaml', 'memo.md']);
  for (const [items, key] of [[m.snapshot.inputs,'path'],[m.queries,'path'],[m.results,'path'],[m.checks,'path'],[m.charts,'spec_path']]) {
    for (const item of items) {
      safePath(dir, item[key]);
      if (destinations.has(item[key])) fail('path_collision', item[key], 'evidence files must have distinct paths and cannot overwrite manifest or memo');
      destinations.add(item[key]);
    }
  }
  for (const def of m.definitions) safePath(instance, def.path);
  for (const r of m.results) {
    unique(r.columns, 'name', r.id + '.columns');
    const ex = m.executions.find(e => e.id === r.execution_id);
    if (!ex || ex.result_id !== r.id) fail('execution_binding', r.id, 'result and execution must point to each other');
    for (const col of r.columns) if (col.definition_ref && !m.definitions.some(d => d.id === col.definition_ref.id && d.version === col.definition_ref.version)) fail('definition_version', r.id + '.' + col.name, 'column definition is not pinned');
  }
  for (const ex of m.executions) {
    if (!m.queries.some(q => q.id === ex.query_id) || !m.results.some(r => r.id === ex.result_id && r.execution_id === ex.id)) fail('execution_binding', ex.id, 'execution needs an existing query and reciprocal result');
    for (const id of ex.input_ids) if (!m.snapshot.inputs.some(i => i.id === id)) fail('unresolved_reference', ex.id, `unknown input ${id}`);
    for (const ref of ex.definition_refs) if (!m.definitions.some(d => d.id === ref.id && d.version === ref.version)) fail('definition_version', ex.id, 'execution definition is not pinned');
  }
  for (const ck of m.checks) if (ck.execution_id && !m.executions.some(e => e.id === ck.execution_id)) fail('unresolved_reference', ck.id, 'Check execution does not exist');
  for (const [i, d] of m.derived.entries()) {
    const operands = operandList(d.operation, d.operands, `manifest.yaml#/derived/${i}`);
    const binary = ['difference','ratio','percent_of','percent_change'].includes(d.operation);
    if (binary && operands.length !== 2) fail('derived_arity', d.id, d.operation + ' requires exactly two operands');
  }
}

/**
 * Operations whose value has a direction: which operand is the measured value and which is the reference
 * decides the SIGN, and both orders are valid arithmetic, so no arithmetic check can tell a flipped pair from
 * an intended one. These three therefore accept NAMED operands, and the named form makes the direction a
 * declared fact. A real run wrote four `percent_change` values baseline-then-after and rendered every one with
 * the opposite sign ("rose by −20.6%"); `check` could not see it and only the method reviewer could
 * (examples/nyc-open-data/docs/run-log.md, Citi Bike run 1). `percent_of` is not here: "a as a percent of b"
 * names its own order, and `sum`, `min` and `max` are order-free.
 */
export const DIRECTIONAL_OPERATIONS = ['difference', 'ratio', 'percent_change'];

/**
 * The named operand forms, in the order they are offered. Each is a declaration of which operand is which,
 * and each clears `direction_unstated` — what differs is what the pair MEANS.
 *
 * `{ after, baseline }` is a before-and-after comparison: a measured value against what it is measured
 * against. It is the form for a lift, a change over time, a treatment arm against a control.
 *
 * `{ minuend, subtrahend }` and `{ numerator, denominator }` are for the signed differences and ratios that
 * are not comparisons at all. A policy minimum minus what has accumulated is a subtraction with a direction
 * and no "after"; a part over a whole is a division with a direction and no "baseline". Before these existed
 * those entries had to stay positional and carry `direction_unstated` forever, and naming them after/baseline
 * would have been a false declaration (bead ag-derived-direction-none-9kp).
 *
 * `percent_change` takes `{ after, baseline }` only: a percent change is by definition a change against a
 * baseline, so a percent change without one is not a percent change.
 */
export const OPERAND_VOCABULARIES = [
  { keys: ['after', 'baseline'], operations: ['difference', 'ratio', 'percent_change'] },
  { keys: ['minuend', 'subtrahend'], operations: ['difference'] },
  { keys: ['numerator', 'denominator'], operations: ['ratio'] },
];

const vocabularyName = (v) => `{ ${v.keys.join(', ')} }`;
const ALL_VOCABULARIES = OPERAND_VOCABULARIES.map(vocabularyName).join(', ');

/** The named forms `operation` accepts, in offer order; empty for an operation with no direction to declare. */
export function vocabulariesFor(operation) {
  return OPERAND_VOCABULARIES.filter((v) => v.operations.includes(operation));
}

/**
 * The vocabulary whose keys are exactly the keys of `operands`, or null — for a positional list, a non-object,
 * a partial pair, or a mix of two vocabularies (`{ after, denominator }` declares nothing).
 */
export function operandVocabulary(operands) {
  if (!operands || typeof operands !== 'object' || Array.isArray(operands)) return null;
  const declared = Object.keys(operands);
  return OPERAND_VOCABULARIES.find((v) => declared.length === v.keys.length && v.keys.every((k) => operands[k])) ?? null;
}

/**
 * The operands of a derived value as a positional list, whichever form declared them, or `derived_arity` when
 * the shape is not one this contract defines. Every named pair yields `[first, second]` in its own key order,
 * so `after - baseline`, `minuend - subtrahend`, `after / baseline` and `numerator / denominator` are exactly
 * the arithmetic the positional form computes: the names add the declaration, never a different sum.
 */
export function operandList(operation, operands, location = operation) {
  if (Array.isArray(operands)) return operands;
  if (!operands || typeof operands !== 'object') fail('derived_arity', location, `operands is a positional list, or one of the named pairs ${ALL_VOCABULARIES}`);
  const allowed = vocabulariesFor(operation);
  if (!allowed.length) {
    fail('derived_arity', location, `named operands declare a direction and ${operation} has none; only ${DIRECTIONAL_OPERATIONS.join(', ')} take a named pair`);
  }
  const vocabulary = operandVocabulary(operands);
  if (!vocabulary) {
    fail('derived_arity', location, `named operands are exactly one of ${ALL_VOCABULARIES}; this entry declares { ${Object.keys(operands).join(', ') || 'nothing'} }`);
  }
  if (!allowed.includes(vocabulary)) {
    fail('derived_arity', location, `${operation} takes ${allowed.map(vocabularyName).join(' or ')}, not ${vocabularyName(vocabulary)}`);
  }
  return vocabulary.keys.map((k) => operands[k]);
}

/**
 * The operand references of a derived entry, for traversal that must not judge the shape: `validateStructure`
 * and `calculate` raise the shape problem once, at the location that can be acted on, and a resolver or an
 * export walk reporting it a second time would say the same thing twice.
 */
export function operandRefs(d) {
  if (Array.isArray(d?.operands)) return d.operands;
  const vocabulary = operandVocabulary(d?.operands);
  if (!vocabulary) return [];
  return vocabulary.keys.map((k) => d.operands[k]);
}

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
export function decimal(value) {
  const text = String(value);
  if ((typeof value !== 'string' && typeof value !== 'number') || text.length > 1024 || !DECIMAL.test(text)) fail('value_type', 'value', 'expected a finite decimal');
  const [mantissa, exp = '0'] = text.toLowerCase().split('e');
  const exponent = Number(exp);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) fail('value_type', 'value', 'decimal exponent exceeds fixture limit');
  const fractional = mantissa.split('.')[1]?.length ?? 0;
  const n = BigInt(mantissa.replace('.', ''));
  const scale = fractional - exponent;
  return scale >= 0 ? { n, d: 10n ** BigInt(scale) } : { n: n * 10n ** BigInt(-scale), d: 1n };
}
const reduce = ({n, d}) => {
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n, b = d;
  while (b) [a,b] = [b,a % b];
  return { n: n / a, d: d / a };
};
/**
 * The value of one derived entry, exactly, as `{ n, d }`, or null when an operand is null or a denominator is
 * zero. `operands` is a positional list of resolved records, or one of the named pairs the directional
 * operations accept (`{ after, baseline }`, `{ minuend, subtrahend }`, `{ numerator, denominator }`); each
 * names the same `[a, b]` the positional form passes, so the forms agree on the value and differ only in
 * whether the direction was declared.
 */
export function calculate(operation, operands, unit) {
  const list = operandList(operation, operands, operation);
  const same = ['sum','difference','min','max'].includes(operation);
  if (same && list.some(o => o.unit !== unit)) fail('unit_mismatch', operation, 'operand and output units must agree');
  if (!same && unit !== (operation === 'ratio' ? 'ratio' : 'percent')) fail('unit_mismatch', operation, 'ratio/percent output unit does not match the operation');
  const binary = ['difference','ratio','percent_of','percent_change'].includes(operation);
  if ((binary && list.length !== 2) || !list.length) fail('derived_arity', operation, 'incorrect number of operands');
  if (list.some(o => o.value === null)) return null;
  const values = list.map(o => o.exact ?? decimal(o.value));
  let [a, b] = values;
  let v;
  if (operation === 'sum') v = values.reduce((a,b) => reduce({n:a.n*b.d+b.n*a.d,d:a.d*b.d}), {n:0n,d:1n});
  else if (operation === 'difference') v = {n:a.n*b.d-b.n*a.d,d:a.d*b.d};
  else if (operation === 'min' || operation === 'max') v = values.reduce((a,b) => (operation === 'min' ? a.n*b.d <= b.n*a.d : a.n*b.d >= b.n*a.d) ? a : b);
  else if (b.n === 0n) return null;
  else if (operation === 'ratio') v = {n:a.n*b.d,d:a.d*b.n};
  else if (operation === 'percent_of') v = {n:100n*a.n*b.d,d:a.d*b.n};
  else if (operation === 'percent_change') v = {n:100n*(a.n*b.d-b.n*a.d),d:a.d*b.n};
  else fail('derived_operation', operation, 'unknown operation');
  return reduce(v);
}

export function formatValue(record) {
  if (record.value === null) return 'not available';
  const kind = record.display?.kind ?? 'text';
  if (kind === 'text' || kind === 'date') {
    if (!record.exact) return String(record.value);
    // With no display format, preserve the exact value rather than inventing a rounded decimal.
    const {n,d} = record.exact;
    return d === 1n ? String(n) : `${n}/${d}`;
  }
  const places = kind === 'currency_usd' ? 2 : kind === 'integer' ? 0 : (record.display?.decimals ?? 0);
  if (!Number.isInteger(places) || places < 0 || places > 100) fail('display', kind, 'invalid decimal places');
  let {n,d} = record.exact ?? decimal(record.value);
  if ((kind === 'percent' || kind === 'percentage_points') && record.unit === 'ratio') n *= 100n;
  const negative = n < 0n;
  if (negative) n = -n;
  n *= 10n ** BigInt(places);
  const rounded = n / d + ((n % d) * 2n >= d ? 1n : 0n);
  const digits = rounded.toString().padStart(places + 1, '0');
  const whole = (places ? digits.slice(0, -places) : digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const number = (negative && rounded !== 0n ? '-' : '') + whole + (places ? '.' + digits.slice(-places) : '');
  return (kind === 'currency_usd' ? '$' : '') + number + (kind === 'percent' ? '%' : kind === 'percentage_points' ? ' pp' : '');
}

export function validateResult(data, res) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.rows) || !Array.isArray(data.columns)) fail('result_shape', res.path, 'expected columns and rows arrays');
  if (data.result_id !== res.id || data.execution_id !== res.execution_id || data.row_key !== res.row_key) fail('execution_binding', res.path, 'file result_id, execution_id and row_key must match the manifest');
  if (JSON.stringify(data.columns) !== JSON.stringify(res.columns.map(c => c.name)) || data.rows.length !== res.row_count) fail('result_shape', res.path, 'columns or row_count do not match manifest');
  const keys = new Set();
  for (const [i,row] of data.rows.entries()) {
    const loc = res.path + ' row ' + i;
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length !== res.columns.length || res.columns.some(c => !Object.hasOwn(row,c.name))) fail('result_shape', loc, 'row must contain exactly the declared columns');
    const key = row[res.row_key];
    if (!['number','string'].includes(typeof key) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(key))) fail('row_key', loc, 'invalid row key');
    if (keys.has(String(key))) fail('duplicate_row_key', loc, 'row keys must be unique');
    keys.add(String(key));
    for (const col of res.columns) {
      const v = row[col.name];
      if (v === null) { if (!col.nullable) fail('null_value', loc, col.name + ' is not nullable'); continue; }
      let valid = true;
      if (col.type === 'integer') valid = Number.isSafeInteger(v);
      else if (col.type === 'decimal') { valid = typeof v === 'string'; if (valid) decimal(v); }
      else if (col.type === 'boolean') valid = typeof v === 'boolean';
      else if (col.type === 'date') valid = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
      else if (col.type === 'timestamp') valid = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(v) && Number.isFinite(Date.parse(v));
      else valid = typeof v === 'string';
      if (!valid) fail('value_type', loc, col.name + ' must be a valid ' + col.type);
    }
  }
}

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const sqlString = value => "'" + String(value).replaceAll("'", "''") + "'";
