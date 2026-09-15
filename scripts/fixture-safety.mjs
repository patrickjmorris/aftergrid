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
  for (const d of m.derived) {
    const binary = ['difference','ratio','percent_of','percent_change'].includes(d.operation);
    if (binary && d.operands.length !== 2) fail('derived_arity', d.id, d.operation + ' requires exactly two operands');
  }
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
export function calculate(operation, operands, unit) {
  const same = ['sum','difference','min','max'].includes(operation);
  if (same && operands.some(o => o.unit !== unit)) fail('unit_mismatch', operation, 'operand and output units must agree');
  if (!same && unit !== (operation === 'ratio' ? 'ratio' : 'percent')) fail('unit_mismatch', operation, 'ratio/percent output unit does not match the operation');
  const binary = ['difference','ratio','percent_of','percent_change'].includes(operation);
  if ((binary && operands.length !== 2) || !operands.length) fail('derived_arity', operation, 'incorrect number of operands');
  if (operands.some(o => o.value === null)) return null;
  const values = operands.map(o => o.exact ?? decimal(o.value));
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
