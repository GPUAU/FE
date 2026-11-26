import test from 'node:test';
import assert from 'node:assert/strict';
import {matchQuoteModel,quoteMarketRows} from '../docker_erd_20261117/app/web/static/contract-quote-market.mjs';
import {fetchContractCatalog} from '../docker_erd_20261117/app/web/static/spring-contracts.mjs';
const models=[{id:'1',name:'B200'},{id:'2',name:'GB200'},{id:'3',name:'B300'},{id:'4',name:'GB300 NVL72'}];
const product={id:'p1'};
const base=(id,amount)=>({offerId:id,contractType:'ON_DEMAND',effective:{status:'OK',amount}});
const commitment=(months,amount,discount)=>({offerId:'c'+months,months,contractType:'COMMITMENT',effective:{status:'OK',amount},discount});
test('model matching is case insensitive, bounded, and rejects ambiguous names',()=>{
  assert.equal(matchQuoteModel('b200',models).id,'1');
  assert.equal(matchQuoteModel('NVIDIA GB200',models).id,'2');
  assert.equal(matchQuoteModel('B300 · 가상 예시',models).id,'3');
  assert.equal(matchQuoteModel('GB300 NVL72',models).id,'4');
  assert.equal(matchQuoteModel('B200 / B300',models),null);
  assert.equal(matchQuoteModel('B2000',models),null);
});
test('missing on-demand preserves commitment price but never invents a discount or five-year price',()=>{
  const rows=quoteMarketRows(product,{items:[commitment(36,4,{status:'UNAVAILABLE',reason:'BASE_PRICE_MISSING'})]});
  assert.equal(rows[0].amount,4);assert.equal(rows[0].baselineAmount,null);assert.equal(rows[0].rate,null);
  assert.equal(rows[1].months,60);assert.equal(rows[1].offer,null);assert.equal(rows[1].amount,null);
});
test('uses each offer’s linked baseline rather than another product-wide on-demand price',()=>{
  const rows=quoteMarketRows(product,{items:[base('a',5),base('b',10),commitment(36,4,{status:'OK',baseOfferId:'a',discountRate:0.2}),commitment(60,6,{status:'OK',baseOfferId:'b',discountRate:0.4})]});
  assert.deepEqual(rows.map(r=>[r.baselineAmount,r.amount,r.rate]),[[5,4,0.2],[10,6,0.4]]);
});
test('stale or incomparable discounts stay unavailable even when amounts exist; invalid prices never become zero',()=>{
  const rows=quoteMarketRows(product,{items:[base('a','5'),commitment(36,'4',{status:'UNAVAILABLE',baseOfferId:'a',discountRate:0.2,reason:'COMMITMENT_PRICE_STALE'}),commitment(60,'',{status:'OK',baseOfferId:'a',discountRate:0.2})]});
  assert.equal(rows[0].amount,4);assert.equal(rows[0].rate,null);assert.match(rows[0].reason,/조건 확인/);
  assert.equal(rows[1].amount,null);assert.equal(rows[1].rate,null);
});
test('keeps separate payment options and ignores one-year and spot offers',()=>{
  const a=commitment(36,4,null),b={...commitment(36,3,null),offerId:'other',paymentOption:'ALL_UPFRONT'};
  const rows=quoteMarketRows(product,{items:[a,b,commitment(12,4.5,null),{contractType:'SPOT',months:36,effective:{status:'OK',amount:1}}]});
  assert.deepEqual(rows.map(r=>r.amount),[4,3,null]);
});
test('benchmark catalog includes on-demand-only products while existing contract catalog keeps its filter',async()=>{
  const ok=result=>({isSuccess:true,result});
  const request=async path=>path==='/api/v1/catalog'?ok({models:[models[0]],providers:[{id:'aws',name:'AWS'}]}):ok({items:[{productId:'p1',offerId:'o1',modelId:'1',providerId:'aws',modelName:'B200',providerName:'AWS',product:{gpuCount:8},contract:{type:'ON_DEMAND'}}]});
  assert.equal((await fetchContractCatalog(request)).products.length,0);
  assert.equal((await fetchContractCatalog(request,{includeOnDemandOnly:true})).products.length,1);
});
