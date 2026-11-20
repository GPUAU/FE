/* Shared numerical rules: no inferred prices, no cross-SKU contract discounts. */
(function(root){
 const price=r=>r&&Number.isFinite(r.normalized_price)&&r.normalized_price>0?r.normalized_price:null;
 function discount(base,offer){const a=price(base),b=price(offer);return a===null||b===null?null:(a-b)/a*100}
 function contractGroups(rows){
  const groups=new Map();
  for(const r of rows){
   if(!['ON_DEMAND','1_YEAR','3_YEAR'].includes(r.term)||price(r)===null||r.gpu_count==null)continue;
   // 'sp' identifies a payment product (Savings Plan), not a hardware tier.
   const tier=r.tier==='sp'?'':r.tier||'';
   const k=JSON.stringify([r.provider_id,r.model,r.sku,r.region,r.gpu_count,r.model_original,tier,r.listed_unit,r.vcpu??null,r.ram_gb??null]);
   if(!groups.has(k))groups.set(k,{key:k,provider:r.provider,provider_id:r.provider_id,model:r.model,sku:r.sku,region:r.region,gpu_count:r.gpu_count,terms:{}});
   const g=groups.get(k),old=g.terms[r.term];
   if(!old||(old.origin==='official'&&r.origin==='aggregate'))g.terms[r.term]=r;
  }
  return [...groups.values()].sort((a,b)=>Object.keys(b.terms).length-Object.keys(a.terms).length||a.provider.localeCompare(b.provider)||a.sku.localeCompare(b.sku));
 }
 function gap(a,b){const av=price(a),bv=price(b);return av===null||bv===null?null:{amount:bv-av,percent:(bv-av)/av*100}}
 const api={price,discount,contractGroups,gap};root.MarketLogic=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
