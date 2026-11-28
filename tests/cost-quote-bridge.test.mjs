import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {mountAgentWorkspace} from '../docker_erd_20261117/app/web/static/cost-agent-ui.mjs';

const launcher=readFileSync(new URL('../docker_erd_20261117/app/web/static/contract-quote-launcher.js',import.meta.url),'utf8');
function bridge(storage=new Map()) {
 const context={window:{},crypto:webcrypto,SH:{ko:{}},READABLE_PAGES:{},PORTAL_ROUTES:[],RENDER:{},
  sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
 vm.runInNewContext(launcher,context);
 return context.window.GpuContractQuote;
}
test('cost source survives reload and invalidation removes saved results',()=>{
 const storage=new Map(),first=bridge(storage);
 first.acceptCost({hourlyCost:'2.52',candidatePrice:'6.05'});
 const restored=bridge(storage);
 assert.equal(restored.source.price,6.05);assert.equal(restored.source.cost,2.52);
 assert.equal(restored.source.id,first.source.id);
 restored.invalidateCost();assert.equal(bridge(storage).source,null);
});
test('invalid results never become zero or retain an older import',()=>{
 for(const bad of [null,undefined,'',' ',NaN,Infinity,-1]){
  const b=bridge();b.acceptCost({hourlyCost:2,candidatePrice:5});
  b.acceptCost({hourlyCost:bad,candidatePrice:6});assert.equal(b.source,null);
 }
 const b=bridge();b.acceptCost({hourlyCost:0,candidatePrice:3});assert.equal(b.source.cost,0);
 b.acceptCost({hourlyCost:2,candidatePrice:0});assert.equal(b.source,null);
 assert.equal(bridge(new Map([['gpu-contract-cost-source-v1','broken json']])).source,null);
});

// Exercise the actual upload completion handler and reset button, not only a result converter.
test('invoice completion publishes the exact quote source even after leaving the agent tab',async()=>{
 const previous={location:globalThis.location,matchMedia:globalThis.matchMedia};
 globalThis.location={hash:'#cost'};globalThis.matchMedia=()=>({matches:true});
 const nodes=new Map();
 for(const selector of ['[data-ca-drop]','[data-ca-file]','[data-ca-start]','[data-ca-filename]',
  '.ca-start-footer > span','[data-ca-model]','[data-ca-gpu]']){
  nodes.set(selector,{value:'',listeners:{},classList:{add(){},remove(){}},
   addEventListener(type,fn){this.listeners[type]=fn;}});
 }
 const host={innerHTML:'',querySelector:s=>nodes.get(s)||null,scrollIntoView(){}};
 const b=bridge();b.acceptCost({hourlyCost:1,candidatePrice:2});
 const done={step:'DONE',simulation:{hourlyCost:'2.52',candidatePrice:'6.05'},board:[],assumptions:{},events:[]};
 try {
  mountAgentWorkspace({host,onResult:r=>b.acceptCost(r),onInvalidate:()=>b.invalidateCost(),
   fetchImpl:async()=>{assert.equal(b.source,null);globalThis.location.hash='#discounts';return {ok:true,json:async()=>done};}});
  const file=new Blob(['test invoice']);file.name='fixture.csv';
  nodes.get('[data-ca-file]').listeners.change({target:{files:[file]}});
  await nodes.get('[data-ca-start]').listeners.click();
  assert.equal(b.source.price,6.05);assert.equal(b.source.cost,2.52);
  await host.onclick({target:{closest:()=>({hasAttribute:key=>key==='data-ca-reset'})}});
  assert.equal(b.source,null);
 } finally {for(const [k,v]of Object.entries(previous)) {if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
