import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const D=require('../docker_erd_20261117/app/web/static/decision-logic.js');
const defaults=require('../docker_erd_20261117/app/web/static/montecarlo-defaults.json');
const input=()=>({initial:100,years:1,gpu:1,util:1,opex:0,salvage:10,target:.1,price:100/8760});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('utilization scenarios share capex and opex, vary sold hours and preserve residual once',()=>{
 const rows=D.scenarios(input(),[.5,.75,1],90);
 close(rows[0].revenue,50);close(rows[2].revenue,100);close(rows[2].irr.value,.1);
 close(rows[0].minimum,200/8760);close(rows[2].costUnit,90/8760);
 assert.equal(rows[0].meets,false);assert.equal(rows[2].meets,true);
});
test('missing, reversed and impossible utilization cannot silently become zero',()=>{
 for(const rates of [[0,.7,.9],[null,.7,.9],[.8,.7,.9],[.7,.7,.9],[.5,.7,1.01],[.5,NaN,.9]])assert.throws(()=>D.scenarios(input(),rates));
 assert.throws(()=>D.validate({...input(),target:null}));
});
test('zero sales show unavailable IRR, not zero IRR',()=>{
 const r=D.scenarios({...input(),price:0,salvage:0},[.5,.7,.9]);assert.equal(r[0].irr.value,null);assert.equal(r[0].meets,false);
});
test('difference percentage uses competitor as denominator and keeps sign',()=>{
 const c=D.comparison(6,{normalized_price:8,observed_at:'2026-11-19T00:00:00Z'},Date.parse('2026-11-19T01:00:00Z'));close(c.delta,-2);close(c.percent,-25);assert.ok(c.referenceOnly);
});
test('missing and zero competitor prices never produce fake percentage',()=>{
 for(const p of [null,0,NaN,-1,'']){const c=D.comparison(6,{normalized_price:p});assert.equal(c.percent,null);assert.equal(c.delta,null);}
});
test('contract references preserve payment conditions and display basis without duplicating GPU conversion',()=>{
 const [r]=D.contractRecords([{offer_id:10,observation_id:20,model_name:'B300',contract_type:'commitment',commitment_months:12,payment_option:'all_upfront',gpu_count:8,display_price:10.5,display_basis:'선납 반영 요율'}]);
 assert.equal(r.id,'contract-10');assert.equal(r.term,'1_YEAR');assert.equal(r.normalized_price,10.5);assert.match(r.term_original,/all_upfront/);assert.equal(r.price_basis,'선납 반영 요율');
 assert.equal(D.contractRecords([{contract_type:'spot',display_price:null}])[0].normalized_price,null);
});
test('reference comparison marks 48h expiry, future and unknown timestamps',()=>{
 const now=Date.parse('2026-11-19T10:00:00Z');const c=t=>D.comparison(5,{normalized_price:8,observed_at:t},now);
 assert.ok(!c('2026-11-17T10:00:00Z').reasons.includes('수집 후 48시간 초과'));
 assert.ok(c('2026-11-17T09:59:59Z').reasons.includes('수집 후 48시간 초과'));
 assert.ok(c('2026-11-20T00:00:00Z').reasons.some(x=>x.includes('미래')));
 assert.ok(c(null).reasons.some(x=>x.includes('미확인')));
});
test('review chooses stricter cost/IRR floor without inventing upper market price',()=>{
 const r=D.review({input:input(),costAnnual:120,costComplete:true},null);
 close(r.lower,120/8760);assert.equal(r.interval,null);assert.equal(r.state,'missing');
});
test('conflicting upper bound yields no interval; incomplete cost stays conditional',()=>{
 const s={input:input(),costAnnual:120,costComplete:true};
 assert.equal(D.review(s,.001).state,'conflict');assert.equal(D.review(s,.001).interval,null);
 assert.equal(D.review({...s,costComplete:false},1).state,'conditional');
 assert.equal(D.review(s,1).state,'available');assert.throws(()=>D.review(s,0));
});
test('Monte Carlo mapping excludes annual capital recovery from cash opex and sets explicit fixed assumptions',()=>{
 const a={initial:640000,years:4,gpu:64,util:.7,opex:76800,salvage:64000,target:.15,price:8};
 const c=D.toMonteCarlo({input:a},defaults);
 assert.equal(c.investment.capex_per_gpu,10000);assert.equal(c.investment.months,48);assert.equal(c.investment.residual_value_pct,.1);
 assert.deepEqual(c.uncertain.opex_per_gpu_month,[100,100,100]);assert.deepEqual(c.uncertain.utilization,[.7,.7,.7]);
 assert.deepEqual(c.uncertain.capex_overrun,[0,0,0]);assert.equal(c.investment.ramp_months,0);assert.equal(c.investment.pricing_mode,'fixed');assert.deepEqual(c.candidate_prices,[8]);
 assert.equal(defaults.investment.gpus,64);assert.equal(defaults.investment.capex_per_gpu,55000);
});
test('unsupported PM periods and zero candidate do not get silently clamped',()=>{
 for(const patch of [{years:6},{years:1.5},{util:.005},{price:0}])assert.throws(()=>D.toMonteCarlo({input:{...input(),...patch}},defaults));
});
test('upstream edits invalidate matching snapshots and block late simulation responses',()=>{
 const store=D.createStore();const rev=store.set({input:input(),dependsOn:['cost']});
 assert.equal(store.saveSimulation({value:5},rev),true);
 store.invalidateSource('irr');assert.equal(store.get().stale,false);
 store.invalidateSource('cost');assert.equal(store.get().stale,true);assert.equal(store.get().simulation,null);
 assert.equal(store.saveSimulation({value:9},rev),false);
 const next=store.set({input:{...input(),price:8},dependsOn:['irr']});assert.equal(store.saveSimulation({},rev),false);assert.equal(store.saveSimulation({value:8},next),true);
});
test('store snapshots are isolated from later form mutations',()=>{
 const store=D.createStore(),s={input:input(),dependsOn:[]};store.set(s);s.input.price=999;assert.notEqual(store.get().snapshot.input.price,999);
 const received=store.get();received.snapshot.input.price=999;assert.notEqual(store.get().snapshot.input.price,999);
});

test('Spring IRR results outside price review bounds retain their result but cannot be forwarded', () => {
 assert.match(D.reviewRangeError({...input(),target:-.05}), /0~200%/);
 assert.match(D.reviewRangeError({...input(),target:2.01}), /0~200%/);
 assert.match(D.reviewRangeError({...input(),salvage:150}), /잔존가치/);
 assert.equal(D.reviewRangeError(input()), null);
});
