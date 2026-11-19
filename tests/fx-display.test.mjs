import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const fx=require('../docker_erd_20261117/app/web/static/fx-display.js');
const now=Date.parse('2026-11-19T03:00:00Z');
const quote=changes=>({isSuccess:true,result:{status:'AVAILABLE',baseCurrency:'USD',quoteCurrency:'KRW',rate:'1400.25',referenceDate:'2026-11-19',collectedAt:'2026-11-19T02:00:00Z',source:{name:'한국수출입은행',url:'https://example.com/rates'},warnings:[],...changes}});
test('preserves quote precision, provenance and collection timestamp',()=>{
 const actual=fx.normalizeFx(quote(),now);
 assert.equal(actual.rate.rate,1400.25);
 assert.equal(actual.rate.reference_date,'2026-11-19');
 assert.equal(actual.rate.collected_at,'2026-11-19T02:00:00Z');
 assert.equal(actual.rate.source_name,'한국수출입은행');
 assert.equal(actual.stale,false);
});
test('unavailable quote never becomes a zero exchange rate',()=>{
 const actual=fx.normalizeFx(quote({status:'NOT_AVAILABLE',rate:null}),now);
 assert.equal(actual.rate,null);
 assert.equal(fx.appliedRate(actual,null).rate,null);
 assert.match(fx.krwText(10,actual,null),/미확보/);
});
test('invalid rates, currency direction and invalid or future dates fail closed',()=>{
 for(const rate of [null,'',0,-1,'Infinity','NaN',true,'1,400']) assert.throws(()=>fx.normalizeFx(quote({rate}),now));
 for(const referenceDate of ['2026-02-30','2026-11-20','not a date']) assert.throws(()=>fx.normalizeFx(quote({referenceDate}),now));
 assert.throws(()=>fx.normalizeFx(quote({baseCurrency:'KRW',quoteCurrency:'USD'}),now));
});
test('four-day staleness uses Korean calendar days across UTC midnight',()=>{
 assert.equal(fx.normalizeFx(quote({referenceDate:'2026-11-15'}),now).stale,false);
 assert.equal(fx.normalizeFx(quote({referenceDate:'2026-11-14'}),now).stale,true);
 assert.equal(fx.normalizeFx(quote({referenceDate:'2026-11-15'}),Date.parse('2026-11-19T15:00:00Z')).stale,true);
});
test('manual quote takes precedence and reset restores the automatic quote without mutation',()=>{
 const actual=fx.normalizeFx(quote(),now);
 const original=JSON.stringify(actual);
 assert.deepEqual(fx.appliedRate(actual,1500),{rate:1500,manual:true});
 assert.deepEqual(fx.appliedRate(actual,null),{rate:1400.25,manual:false});
 assert.equal(JSON.stringify(actual),original);
 assert.match(fx.krwText(17.802,actual,1400),/^24,923원 · 사용자 가정$/);
 assert.match(fx.krwText(0,actual,null),/^0원/);
 assert.equal(fx.krwText(null,actual,null),'');
});
test('manual rate remains usable during an automatic lookup failure',()=>{
 const failed={status:'failed',rate:null};
 assert.match(fx.krwText(2,failed,1400),/^2,800원 · 사용자 가정$/);
 assert.match(fx.krwText(2,failed,null),/조회 실패/);
});
test('unsafe provenance URLs are not made clickable',()=>{
 const actual=fx.normalizeFx(quote({source:{name:'Test',url:'javascript:alert(1)'}}),now);
 assert.equal(actual.rate.source_url,null);
});
test('fetch uses only same-origin read endpoint with no credentials in body or query',async()=>{
 let request;
 const result=await fx.fetchLatestFx({now,fetchImpl:async(path,options)=>{request={path,options};return {ok:true,json:async()=>quote()};}});
 assert.equal(request.path,'/api/v1/exchange-rates/latest');
 assert.equal(request.options.body,undefined);
 assert.equal(request.options.cache,'no-store');
 assert.equal(result.status,'available');
});
test('HTTP, invalid JSON and business errors produce failure, and a subsequent retry recovers',async()=>{
 for(const response of [{ok:false},{ok:true,json:async()=>{throw Error('invalid JSON');}},{ok:true,json:async()=>({isSuccess:false})}]){
  const result=await fx.fetchLatestFx({now,fetchImpl:async()=>response});
  assert.equal(result.status,'failed');assert.equal(result.rate,null);
 }
 assert.equal((await fx.fetchLatestFx({now,fetchImpl:async()=>({ok:true,json:async()=>quote()})})).status,'available');
});
test('a stalled lookup times out and becomes a retryable failure',async()=>{
 const result=await fx.fetchLatestFx({timeoutMs:5,fetchImpl:(_path,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))});
 assert.equal(result.status,'failed');
});
