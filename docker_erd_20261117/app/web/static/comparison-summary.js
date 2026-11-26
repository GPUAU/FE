/* Both home and comparison summarize only a single server-approved group. */
(function(root){
 const id=x=>String(x);
 function eligible(row,mode='strict',now=Date.now()){
  const time=Date.parse(row.collected_at),price=row.display_price;
  return Array.isArray(row.comparison_reasons?.[mode])&&row.comparison_reasons[mode].length===0&&Number.isFinite(time)&&time<=now&&price!==null&&price!==''&&Number.isFinite(Number(price))&&Number(price)>0;
 }
 function stats(rows){
  const byProvider=new Map();for(const r of rows){const key=id(r.provider_id),old=byProvider.get(key);if(!old||Number(r.display_price)<Number(old.display_price)||(Number(r.display_price)===Number(old.display_price)&&Number(r.offer_id)<Number(old.offer_id)))byProvider.set(key,r);}
  const representatives=[...byProvider.values()],values=representatives.map(r=>Number(r.display_price)).sort((a,b)=>a-b),n=values.length;
  return {representatives,values: n?[values[0],(values[Math.floor((n-1)/2)]+values[Math.floor(n/2)])/2,values[n-1]]:null};
 }
 function groups(data,visibleIds,mode='strict',now=Date.now()){
  const visible=new Set(visibleIds.map(id)),byId=new Map((data?.candidates||[]).filter(r=>visible.has(id(r.observation_id))&&eligible(r,mode,now)).map(r=>[id(r.observation_id),r]));
  return (data?.groups?.[mode]||[]).map(g=>({...g,rows:[...new Set(g.observation_ids.map(id))].map(x=>byId.get(x)).filter(Boolean)})).filter(g=>g.rows.length>0);
 }
 // Exploration only: all selected offer prices, including dated reference data.
 function reference(rows,now=Date.now()){
  const valid=rows.filter(r=>r.price!==null&&r.price!==undefined&&String(r.price).trim()!==''&&Number.isFinite(Number(r.price))&&Number(r.price)>0);
  const values=valid.map(r=>Number(r.price)).sort((a,b)=>a-b),n=values.length;
  const times=valid.map(r=>Date.parse(r.collected)).filter(t=>Number.isFinite(t)&&t<=now);
  return {values:n?[values[0],(values[Math.floor((n-1)/2)]+values[Math.floor(n/2)])/2,values[n-1]]:null,count:n,providers:new Set(valid.map(r=>r.provider)).size,unknownTime:n-times.length,earliest:times.length?Math.min(...times):null,latest:times.length?Math.max(...times):null};
 }
 const api={eligible,stats,groups,reference};root.GpuComparison=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
