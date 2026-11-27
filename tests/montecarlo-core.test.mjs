import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulate,validateDataset,validateSettings,futureMonth,quantile} from '../docker_erd_20261117/app/web/static/montecarlo-core.mjs';
const sample=JSON.parse(readFileSync(new URL('../docker_erd_20261117/app/web/static/montecarlo-demo-data.json',import.meta.url),'utf8'));
const noWait={yieldControl:async()=>{}};
const settings={nPaths:1000,seed:71,blockLength:3,jumpProbability:0};
test('generated presentation series remains explicitly synthetic and chronological',()=>{
 assert.equal(validateDataset(sample),sample);assert.equal(sample.kind,'mock');assert.equal(sample.history.length,18);
 assert.equal(sample.history[0].month,'2025-06');assert.equal(sample.history.at(-1).month,'2026-11');
 assert.equal(futureMonth('2026-11',12),'2027-11');assert.equal(futureMonth('2026-12',1),'2027-01');
});
test('forecast has 12 ordered positive quantiles, with source provenance and actual sample paths',async()=>{
 const r=await simulate(sample,settings,noWait);assert.equal(r.monthly.length,12);assert.equal(r.dataset.kind,'mock');
 for(const row of r.monthly){assert.ok(0<row.p10&&row.p10<=row.p25&&row.p25<=row.p50&&row.p50<=row.p75&&row.p75<=row.p90);assert.ok(row.probBelowNow>=0&&row.probBelowNow<=1);}
 assert.equal(r.samplePaths.length,24);for(const path of r.samplePaths){assert.equal(path.length,13);assert.equal(path[0],sample.history.at(-1).price);assert.ok(path.every(x=>x>0));}
 assert.equal(r.monthly[11].date,'2027-11');
});
test('same source and seed reproduce all results; another seed changes paths',async()=>{
 const a=await simulate(sample,settings,noWait),b=await simulate(sample,settings,noWait),c=await simulate(sample,{...settings,seed:72},noWait);
 assert.deepEqual(a.monthly,b.monthly);assert.deepEqual(a.samplePaths,b.samplePaths);assert.notDeepEqual(a.samplePaths,c.samplePaths);
});
test('flat input does not invent volatility or price movement',async()=>{
 const data=structuredClone(sample);data.history.forEach(x=>x.price=4);
 const r=await simulate(data,settings,noWait);for(const row of r.monthly){assert.equal(row.p10,4);assert.equal(row.p50,4);assert.equal(row.p90,4);}
});
test('constant monthly growth is preserved without fabricated uncertainty',async()=>{
 const data=structuredClone(sample);data.history.forEach((x,i)=>x.price=4*Math.exp(.01*i));
 const r=await simulate(data,settings,noWait),base=data.history.at(-1).price;
 r.monthly.forEach(x=>assert.ok(Math.abs(x.p50-base*Math.exp(.01*x.month))<1e-10));
});
test('quantiles interpolate between ordered observations, including endpoints',()=>{
 assert.equal(quantile([1,2,3,4,5],.1),1.4);assert.equal(quantile([1,2,3,4,5],.5),3);assert.equal(quantile([1,2,3,4,5],.9),4.6);
 assert.equal(quantile([1,2,3],0),1);assert.equal(quantile([1,2,3],1),3);
});
test('progress reports completed generated paths in order and reaches requested count',async()=>{
 const events=[];await simulate(sample,settings,{...noWait,onProgress:p=>events.push(p)});
 assert.deepEqual(events.slice(0,2).map(x=>x.stage),['validated','analyzed']);assert.equal(events.at(-1).stage,'summarizing');
 assert.deepEqual(events.filter(x=>x.stage==='paths').map(x=>x.completed),[500,1000]);assert.equal(events.at(-1).completed,1000);
});
test('missing months, duplicate months, invalid prices and mixed units are rejected',()=>{
 for(const mutate of [d=>d.history.splice(2,1),d=>d.history[1].month=d.history[0].month,d=>d.history[0].price=0,d=>d.history[0].price=NaN,d=>d.unit='KRW/server-hour',d=>d.region='',d=>d.history[0].month='2025-13']){
  const d=structuredClone(sample);mutate(d);assert.throws(()=>validateDataset(d));
 }
});
test('observed data requires explicit source metadata; presentation mock cannot be relabeled silently',()=>{
 const d=structuredClone(sample);d.kind='observed';assert.throws(()=>validateDataset(d),/출처/);
 d.source_url='https://example.com/price-history';d.collected_at='2026-11-27T00:00:00Z';assert.equal(validateDataset(d).kind,'observed');
});
test('invalid simulation settings are rejected before allocating paths',async()=>{
 for(const value of [{nPaths:0},{nPaths:50001},{nPaths:1000.5},{seed:-1},{blockLength:NaN},{blockLength:0},{jumpProbability:1.1}])assert.throws(()=>validateSettings(value));
 await assert.rejects(simulate(sample,{nPaths:1},noWait));
});
test('additional event assumptions only apply when enabled',async()=>{
 const d=structuredClone(sample);d.history.forEach(x=>x.price=4);
 const r=await simulate(d,{...settings,jumpProbability:1},noWait);assert.ok(r.monthly[0].p90<4);
 for(const path of r.samplePaths)assert.ok(path.every((x,i)=>i===0||x<path[i-1]));
});

test('all seven selectable models have distinct histories and preserve model identity in forecasts',async()=>{
 const {validateDemoCatalog}=await import('../docker_erd_20261117/app/web/static/montecarlo-core.mjs');
 const catalog=JSON.parse(readFileSync(new URL('../docker_erd_20261117/app/web/static/montecarlo-demo-catalog.json',import.meta.url),'utf8'));
 const datasets=validateDemoCatalog(catalog);
 assert.deepEqual(datasets.map(d=>d.model),['B300','GB300','VR200','B200','H100','GB200','H200']);
 assert.deepEqual(datasets[0],sample);
 assert.equal(new Set(datasets.map(d=>JSON.stringify(d.history))).size,7);
 const results=[];
 for(const data of datasets){
  const result=await simulate(data,settings,noWait);
  assert.equal(result.dataset.id,data.id);assert.equal(result.dataset.product,data.product);
  assert.equal(result.evidence.lastPrice,data.history.at(-1).price);assert.equal(result.monthly.length,12);
  assert.equal(result.dataset.kind,'mock');results.push(result.monthly[11].p50);
 }
 assert.equal(new Set(results).size,7);
 const duplicate=structuredClone(catalog);duplicate.datasets.push(duplicate.datasets[0]);assert.throws(()=>validateDemoCatalog(duplicate),/중복/);
 const observed=structuredClone(catalog);observed.datasets[0].kind='observed';assert.throws(()=>validateDemoCatalog(observed));
 const empty=structuredClone(catalog);empty.datasets=[];assert.throws(()=>validateDemoCatalog(empty));
});
