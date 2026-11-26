import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BASE,calculate,importSession} from '../docker_erd_20261117/app/web/static/lease-cost-model.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('table18 inputs independently reproduce corrected annual amounts',()=>{
 const r=calculate({...BASE});close(r.capex,275.5e8);close(r.rent,42e8);close(r.power,20.84004e8);close(r.revenue,203.232e8);close(r.ebitda,122.39196e8);close(r.ebit,76.47529333333333e8);close(r.cost,2.494817876449903);close(r.candidate,3.118522345562379);
});
test('paid utilization changes denominator, never fixed rent or electrical load',()=>{
 const a=calculate({...BASE}),b=calculate({...BASE,util:40});close(a.cost*2,b.cost);close(a.rent,b.rent);close(a.power,b.power);close(a.revenue/2,b.revenue);
});
test('capacity-based cost scales consistently for smaller installation',()=>{
 const a=calculate({...BASE}),b=calculate({...BASE,gpuCount:8,contractKw:16});close(a.cost,b.cost);close(b.ops,28800000);
});
test('unused contracted capacity remains payable, electrical load uses installed IT',()=>{
 const r=calculate({...BASE,contractKw:2000});close(r.rent,84e8);close(r.power,20.84004e8);close(r.ops,36e8);
});
test('included electricity and actual annual bill do not apply PUE twice',()=>{
 close(calculate({...BASE,powerMode:'included',pue:NaN,tariff:NaN,powerLoad:NaN}).power,0);
 close(calculate({...BASE,powerMode:'actual',powerAnnual:1234,pue:4}).power,1234);
});
test('annual rent and ops ignore MW scaling',()=>{const r=calculate({...BASE,rentMode:'annual',rentAnnual:500,opsMode:'annual',ops:700});close(r.rent,500);close(r.ops,700);});
test('capital recovery substitutes for depreciation and accounts for residual',()=>{
 const r=calculate({...BASE,capitalRate:8,residual:1e8});const c=(275.5e8-1e8/(1.08**6))*.08/(1-1.08**-6);close(r.total,r.opex+c);close(r.dep,(275.5e8-1e8)/6);assert.ok(r.capital>r.dep);
});
test('missing, invalid, oversubscribed and overflowing inputs are rejected',()=>{
 for(const patch of [{gpuCount:0},{gpuCount:2.5},{gpuPrice:NaN},{util:0},{util:101},{margin:100},{contractKw:500},{pue:.9},{years:0},{years:1.5},{residual:1e12},{fx:0},{powerLoad:101},{gpuPrice:1e308},{rentMode:'invalid'}])assert.throws(()=>calculate({...BASE,...patch}));
});
test('zero selling price keeps cost valid but break-even and margin undefined',()=>{const r=calculate({...BASE,price:0});assert.equal(r.breakeven,null);assert.equal(r.actualMargin,null);assert.ok(r.cost>0);});
test('bill import converts explicit currencies and periods and does not infer missing ones',()=>{
 const s=importSession({assumptions:{gpu_count:8,fx_krw_per_usd:1400,acquisition_amount:240000,acquisition_currency:'USD',utilization:.7},final_items:[{item_type:'RENT',status:'USER_INPUT',amount:100,currency:'USD',period:'MONTH'},{item_type:'OPERATIONS',amount:300,currency:'KRW',period:'YEAR'},{item_type:'ELECTRICITY',status:'INCLUDED_IN_OTHER',included_in:'RENT'},{item_type:'OTHER',amount:10000,currency:'KRW'}]});
 close(s.values.rentAnnual,1680000);close(s.values.gpuPrice,30000);close(s.values.util,70);assert.equal(s.values.powerMode,'included');assert.equal(s.values.opsMode,'annual');assert.ok(s.notes.some(n=>n.includes('OTHER')));
});
