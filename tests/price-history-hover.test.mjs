import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyHoverRows} from '../docker_erd_20261117/app/web/static/price-history-hover.mjs';
test('weekly tooltip never substitutes another date for missing contract data',()=>{
 const series=[{type:'ON_DEMAND',points:[{x:1,y:10},{x:2,y:11}]},{type:'COMMITMENT',points:[{x:1,y:8},{x:2,y:null}]},{type:'SPOT',points:[{x:1,y:null},{x:2,y:5}]}];
 const rows=weeklyHoverRows(series,1);
 assert.deepEqual(rows.map(r=>r.point.y),[11,null,5]);
 assert.ok(rows.every(r=>r.point.x===2));
 assert.ok(weeklyHoverRows(series,9).every(r=>r.point===null));
});
test('tooltip and event listeners are cleaned up after Chart.js clears its canvas',async()=>{
 const {createWeeklyHover}=await import('../docker_erd_20261117/app/web/static/price-history-hover.mjs');
 const originalDocument=globalThis.document,originalWindow=globalThis.window;
 const canvasEvents=new Set(),windowEvents=new Set(),attrs=new Map();let removed=false;
 const canvas={getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),addEventListener:k=>canvasEvents.add(k),removeEventListener:k=>canvasEvents.delete(k)};
 try{
  globalThis.document={createElement:()=>({setAttribute(){},remove(){removed=true;}}),body:{append(){}}};
  globalThis.window={addEventListener:k=>windowEvents.add(k),removeEventListener:k=>windowEvents.delete(k)};
  const plugin=createWeeklyHover({series:[],labels:[],colors:[],money:String,day:String});
  plugin.afterInit({canvas});assert.equal(canvasEvents.size,3);
  plugin.afterDestroy({canvas:null});
  assert.equal(removed,true);assert.equal(canvasEvents.size,0);assert.equal(windowEvents.size,0);assert.equal(attrs.size,0);
 }finally{globalThis.document=originalDocument;globalThis.window=originalWindow;}
});
