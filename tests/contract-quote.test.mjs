import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateContractQuote as calc,quoteText} from '../docker_erd_20261117/app/web/static/contract-quote.mjs';
const base={model:'B300',currency:'USD',price:'5',quantity:'8',billing:'full',monthlyHours:'',cost:'3',discount3:'10',discount5:'20'};
test('3-year and 5-year quotes use independent discounts and full reserved hours',()=>{
 const r=calc(base);assert.equal(r.rows[0].totalCents,94608000);assert.equal(r.rows[1].totalCents,140160000);
 assert.equal(r.rows[0].unit,4.5);assert.equal(r.rows[0].monthlyCents,2628000);
 assert.equal(r.rows[0].baselineCents-r.rows[0].totalCents,r.rows[0].savingCents);
});
test('absent discount excludes a term, zero discount remains valid',()=>{
 const r=calc({...base,discount3:'0',discount5:''});assert.equal(r.rows.length,1);assert.equal(r.rows[0].savingCents,0);
 assert.throws(()=>calc({...base,discount3:'',discount5:''}),/할인율/);
});
test('100 percent discount yields zero without dividing by zero',()=>{
 const r=calc({...base,discount3:'100'}).rows[0];assert.equal(r.totalCents,0);assert.equal(r.margin,null);assert.ok(r.belowCost&&r.free);
});
test('monthly billed hours are not confused with 24-hour reservation',()=>{
 const r=calc({...base,billing:'monthly',monthlyHours:'100.25',discount5:''});
 assert.equal(r.annualHours,1203);assert.equal(r.rows[0].totalCents,12992400);
});
test('decimal unit price is not prematurely rounded before multiplication',()=>{
 const r=calc({...base,price:'0.123456',quantity:'1',discount3:'12.34',discount5:''});
 assert.equal(r.rows[0].totalCents,284406);
});
test('missing and invalid amounts, hours and quantities are rejected',()=>{
 for(const patch of [{price:''},{price:'0'},{price:'-1'},{price:'NaN'},{price:'1e6'},{price:'0.1234567'},{quantity:'1.5'},
 {quantity:'0'},{discount3:'101'},{discount5:'-1'},{discount3:'1.234'},{billing:'unknown'},
 {billing:'monthly',monthlyHours:''},{billing:'monthly',monthlyHours:'731'},{currency:'EUR'},{model:' '}])assert.throws(()=>calc({...base,...patch}));
});
test('price precision overflow is rejected instead of returning an inaccurate total',()=>{
 assert.throws(()=>calc({...base,price:'1000000000',quantity:'1000000'}),/계산 범위/);
});
test('missing unit cost is distinct from zero unit cost',()=>{
 assert.equal(calc({...base,cost:''}).rows[0].margin,null);
 assert.equal(calc({...base,cost:'0'}).rows[0].margin,1);
 assert.ok(calc({...base,cost:'5'}).rows[0].belowCost);
});
test('export carries inputs, provenance, billing exclusions and both selected terms',()=>{
 const text=quoteText(calc({...base,sourceLabel:'가상 예시'}));
 for(const term of ['가상 예시','3년','5년','연 8760시간','세금','확정 계약가 아님','B300'])assert.ok(text.includes(term));
});
