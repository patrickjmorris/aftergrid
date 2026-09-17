import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, decimal, formatValue } from '../scripts/fixture-safety.mjs';
const scalar=(value,unit='ratio')=>({value,unit});
test('decimal rounding occurs once and preserves exact decimal values',()=>{
  assert.equal(formatValue({value:'1.005',unit:'ratio',display:{kind:'decimal',decimals:2}}),'1.01');
  assert.equal(formatValue({value:'9007199254740993.25',unit:'currency_usd',display:{kind:'currency_usd'}}),'$9,007,199,254,740,993.25');
  const exact=calculate('difference',[scalar('0.3'),scalar('0.1')],'ratio');
  assert.equal(formatValue({value:'derived',exact,unit:'ratio',display:{kind:'decimal',decimals:20}}),'0.20000000000000000000');
});
test('nulls and division by zero stay unavailable',()=>{
  assert.equal(calculate('ratio',[scalar('1'),scalar('0')],'ratio'),null);
  assert.equal(calculate('sum',[scalar(null),scalar('1')],'ratio'),null);
  assert.equal(formatValue({value:null}),'not available');
});
// ag-derived-named-operands-kbk: the named pair is the same arithmetic as the positional one, and it is the
// only form in which the sign is a declared fact rather than an operand order nobody wrote down.
test('named operands declare the direction of a difference, ratio or percent change',()=>{
  const after=scalar('0.3'), baseline=scalar('0.2');
  for(const [operation,unit] of [['difference','ratio'],['ratio','ratio'],['percent_change','percent']]){
    assert.deepEqual(calculate(operation,{after,baseline},unit),calculate(operation,[after,baseline],unit),operation);
  }
  const shown=ops=>formatValue({value:'derived',exact:calculate('percent_change',ops,'percent'),unit:'percent',display:{kind:'percent',decimals:1}});
  assert.equal(shown({after,baseline}),'50.0%');
  assert.equal(shown({after:baseline,baseline:after}),'-33.3%');
  assert.throws(()=>calculate('sum',{after,baseline},'ratio'),e=>e.category==='derived_arity');
  assert.throws(()=>calculate('difference',{after},'ratio'),e=>e.category==='derived_arity');
});
test('invalid numeric inputs and incompatible units fail explicitly',()=>{
  for(const v of ['NaN','Infinity','1e100000','',true,{},'12garbage'])assert.throws(()=>decimal(v));
  assert.throws(()=>calculate('sum',[scalar('1','users'),scalar('2','days')],'users'));
  assert.throws(()=>calculate('difference',[scalar('1'),scalar('2')],'users'));
});
