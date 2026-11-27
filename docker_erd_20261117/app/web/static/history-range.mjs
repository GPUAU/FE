const DAY=86400000,KST=9*3600000;
export function buildHistoryRange(rows){
 const days=new Map();
 rows.forEach((r,i)=>{
  const t=Date.parse(r.chart_at),price=Number(r.price);
  if(!Number.isFinite(t)||r.price==null||String(r.price).trim()===''||!Number.isFinite(price))return;
  const x=Math.floor((t+KST)/DAY)*DAY-KST;
  const key=JSON.stringify([r.provider_name,r.region_code,r.offer_id??r.observation_id??i,r.term,r.contract_product_type]);
  if(!days.has(x))days.set(x,new Map());
  const offers=days.get(x),previous=offers.get(key);
  if(!previous||t>previous.t||(t===previous.t&&String(r.observation_id||'')>String(previous.id||'')))offers.set(key,{t,price,id:r.observation_id});
 });
 return [...days].sort(([a],[b])=>a-b).map(([x,offers])=>{
  const p=[...offers.values()].map(r=>r.price).sort((a,b)=>a-b),n=p.length;
  return {x,min:p[0],max:p[n-1],median:n%2?p[(n-1)/2]:(p[n/2-1]+p[n/2])/2,count:n};
 });
}

// A shared easing weight keeps min <= median <= max throughout each visual segment.
// These rendering samples are never used for statistics, CSV, or observed-value tooltips.
export function smoothHistoryRange(summary){
 const out=[];
 summary.forEach((a,i)=>{out.push({...a});const b=summary[i+1];if(!b)return;
  for(let j=1;j<32;j++){const t=j/32,w=t*t*(3-2*t);out.push({x:a.x+(b.x-a.x)*t,min:a.min+(b.min-a.min)*w,max:a.max+(b.max-a.max)*w,median:a.median+(b.median-a.median)*w});}
 });return out;
}
