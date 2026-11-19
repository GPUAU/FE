import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchHistory, fetchModelHistories} from '../docker_erd_20261117/app/web/static/spring-history-client.mjs';
const from='2026-11-01T00:00:00Z',to='2026-11-19T00:00:00Z';
test('fetches every offer page with the same time bounds',async()=>{
 const urls=[];
 const out=await fetchHistory(async path=>{const q=new URL(path,'http://test').searchParams;urls.push(q);return {isSuccess:true,result:{series:[{offerId:q.get('cursor')?'2':'1',points:[]}],nextCursor:q.get('cursor')?null:'1'}};},'2',from,to);
 assert.equal(out.length,2);assert.equal(urls[1].get('cursor'),'1');assert.equal(urls[1].get('from'),new Date(from).toISOString());assert.equal(urls[1].get('limit'),'50');
});
test('splits long ranges without gaps and merges an offer',async()=>{
 const ranges=[];const out=await fetchHistory(async path=>{const q=new URL(path,'http://test').searchParams;ranges.push([q.get('from'),q.get('to')]);return {isSuccess:true,result:{series:[{offerId:'1',points:[{at:q.get('from')}]}]}};},1,'2022-01-01T00:00:00Z',to);
 assert.equal(out.length,1);assert.equal(out[0].points.length,3);
 for(let i=0;i<ranges.length;i++){assert.ok(Date.parse(ranges[i][1])-Date.parse(ranges[i][0])<=731*86400000);if(i)assert.equal(ranges[i][0],ranges[i-1][1]);}
});
test('rejects repeated pagination cursors',async()=>{
 await assert.rejects(fetchHistory(async()=>({isSuccess:true,result:{series:[],nextCursor:'1'}}),1,from,to),/반복/);
});
test('a model failure preserves successful model data and explains the gap',async()=>{
 const out=await fetchModelHistories(async path=>{if(new URL(path,'http://test').searchParams.get('modelId')==='2')throw Error('서버 오류');return {isSuccess:true,result:{series:[{offerId:'7',points:[]}]}};},[{id:1,name:'B300'},{id:2,name:'B200'}],from,to);
 assert.equal(out.series.length,1);assert.deepEqual(out.failures,[{model:'B200',reason:'서버 오류'}]);
});
test('rejects invalid ranges before making a request',async()=>{
 await assert.rejects(fetchHistory(()=>assert.fail('unexpected request'),1,to,from),/시작일/);
});
test('keeps the currently running old backend compatible until activation',async()=>{
 await fetchHistory(async path=>{assert.equal(new URL(path,'http://test').searchParams.has('limit'),false);return {isSuccess:true,result:{series:[]}};},1,from,to,false);
});
