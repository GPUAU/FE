import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyPriceHistory,weekStart,comparableMedianPoints} from '../docker_erd_20261117/app/web/static/price-history-median.mjs';
const end=Date.parse('2026-11-25T00:00:00Z');
const row=(id,price,extra={})=>({offer_id:id,price,model_name:'B300',provider_name:'AWS',region_code:'west',contract_type:'ON_DEMAND',chart_at:'2026-11-23T01:00:00Z',...extra});
const calc=(rows,options={})=>weeklyPriceHistory(rows,{model:'B300',end,...options});
test('latest offer observation per week; providers receive equal weight',()=>{
 const rows=[row(1,100),row(1,2,{chart_at:'2026-11-24T00:00:00Z'}),row(2,4),row(3,6),row(4,20,{provider_name:'Azure'})];
 const p=calc(rows).series[0].latest;
 assert.equal(p.y,12);assert.equal(p.offers,4);assert.equal(p.providers,2);
});
test('KST Monday boundary and missing weeks are not filled',()=>{
 assert.notEqual(weekStart(Date.parse('2026-11-22T14:59:59Z')),weekStart(Date.parse('2026-11-22T15:00:00Z')));
 const points=calc([row(1,2,{chart_at:'2026-11-09T00:00:00Z'}),row(1,4)]).series[0].points;
 assert.equal(points.at(-2).y,null);assert.equal(points.at(-1).y,4);
});
test('commitment duration and payment conditions remain separate',()=>{
 const rows=[row(1,3,{contract_type:'COMMITMENT',commitment_months:36,payment_option:'no_upfront'}),row(2,1,{contract_type:'COMMITMENT',commitment_months:12,payment_option:'NO_UPFRONT'}),row(3,2,{contract_type:'COMMITMENT',commitment_months:36,payment_option:'ALL_UPFRONT'})];
 assert.equal(calc(rows).series[1].latest.y,3);
 assert.equal(calc(rows,{payment:'ALL_UPFRONT'}).series[1].latest.y,2);
 assert.equal(calc(rows,{months:60}).series[1].latest,null);
});
test('scope, invalid prices, future and out of window records excluded',()=>{
 const rows=[row(1,4),row(2,99,{model_name:'H100'}),row(3,99,{region_code:'east'}),row(4,99,{provider_name:'Azure'}),row(5,null),row(6,''),row(7,0),row(8,-1),row(9,Infinity),row(10,99,{chart_at:'2025-01-01'}),row(11,99,{chart_at:'2026-12-01'})];
 assert.equal(calc(rows,{provider:'AWS',region:'west',country:'US',countries:new Map([['AWS|west','US']])}).series[0].latest.y,4);
 assert.equal(calc(rows,{country:'KR'}).series[0].latest,null);
});
test('no records yields empty metrics and null points',()=>{assert.ok(calc([]).series.every(s=>s.latest===null&&s.points.every(p=>p.y===null)));});
test('alternating providers never become one volatile line',()=>{
 const result=calc([row(1,17.802,{chart_at:'2026-11-09T00:00:00Z'}),row(2,8.72,{provider_name:'Scaleway',chart_at:'2026-11-16T00:00:00Z'}),row(1,17.802)]);
 const aws=result.providerSeries.find(s=>s.provider==='AWS');
 assert.deepEqual(aws.points.filter(p=>p.y!==null).map(p=>p.y),[17.802,17.802]);
 assert.equal(aws.points.at(-2).y,null);
 assert.equal(result.providerSeries.find(s=>s.provider==='Scaleway').latest.y,8.72);
});
test('same provider product basket changes break the line; same basket stays connected',()=>{
 const stable=calc([row(1,10,{chart_at:'2026-11-16T00:00:00Z'}),row(1,11)]).providerSeries[0].points;
 assert.deepEqual(stable.slice(-2).map(p=>p.y),[10,11]);
 const changed=calc([row(1,10,{chart_at:'2026-11-16T00:00:00Z'}),row(1,11),row(2,30)]).providerSeries[0].points;
 assert.deepEqual(changed.slice(-3).map(p=>p.y),[10,null,20.5]);
});
test('provider filter scopes both chart and market summaries',()=>{
 const r=calc([row(1,10),row(2,20,{provider_name:'Azure'})],{provider:'Azure'});
 assert.equal(r.providerSeries.length,1);assert.equal(r.providerSeries[0].provider,'Azure');assert.equal(r.series[0].latest.y,20);
});

test('summary line breaks when providers or products change, but preserves the observed median',()=>{
 const r=calc([row(1,18,{chart_at:'2026-11-16T00:00:00Z'}),row(2,8,{provider_name:'Azure'})]);
 const points=comparableMedianPoints(r.series[0].points);
 assert.deepEqual(points.slice(-3).map(p=>p.y),[18,null,8]);
 const stable=calc([row(1,18,{chart_at:'2026-11-16T00:00:00Z'}),row(1,19)]);
 assert.deepEqual(comparableMedianPoints(stable.series[0].points).slice(-2).map(p=>p.y),[18,19]);
});
test('three month summary excludes older observations',()=>{
 const r=calc([row(1,50,{chart_at:'2026-08-24T00:00:00Z'}),row(1,8)],{windowMonths:3});
 assert.equal(r.start,Date.parse('2026-08-25T00:00:00Z'));
 assert.deepEqual(r.series[0].points.filter(p=>p.y!==null).map(p=>p.y),[8]);
});

test('hover range uses the last observation per offer, not superseded prices',()=>{
 const r=calc([row(1,100),row(1,4,{chart_at:'2026-11-24T00:00:00Z'}),row(2,12),row(3,20,{provider_name:'Azure'})]);
 const p=r.series[0].latest;
 assert.equal(p.min,4);assert.equal(p.max,20);assert.equal(p.providers,2);assert.equal(p.y,14);
 assert.equal(r.series[1].points.at(-1).min,null);
});
