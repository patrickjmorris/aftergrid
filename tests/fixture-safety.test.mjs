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
test('invalid numeric inputs and incompatible units fail explicitly',()=>{
  for(const v of ['NaN','Infinity','1e100000','',true,{},'12garbage'])assert.throws(()=>decimal(v));
  assert.throws(()=>calculate('sum',[scalar('1','users'),scalar('2','days')],'users'));
  assert.throws(()=>calculate('difference',[scalar('1'),scalar('2')],'users'));
});
