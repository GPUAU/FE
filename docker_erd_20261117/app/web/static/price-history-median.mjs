// KST Monday buckets. Each provider has equal weight, regardless of collection frequency.
const DAY = 86400000, WEEK = 7 * DAY, KST = 9 * 3600000;
export function weekStart(value) {
  const d = new Date(Number(value) + KST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (d.getUTCDay() + 6) % 7) - KST;
}
export function median(values) {
  const sorted = [...values].sort((a,b) => a-b), n = sorted.length;
  return n ? (sorted[Math.floor((n-1)/2)] + sorted[Math.floor(n/2)]) / 2 : null;
}
export function weeklyPriceHistory(rows, {model, provider='ALL', region='ALL', country='ALL', countries=new Map(), months=36, payment='NO_UPFRONT', windowMonths=12, end=Date.now()}={}) {
  const from = new Date(end); from.setUTCMonth(from.getUTCMonth()-windowMonths);
  const start = from.getTime(), buckets = new Map();
  const types = ['ON_DEMAND', 'COMMITMENT', 'SPOT'];
  for (const r of rows) {
    const time = Date.parse(r.chart_at), price = Number(r.price), type = r.contract_type;
    if (r.model_name!==model || !types.includes(type) || !r.provider_name || r.offer_id==null || r.price==null || String(r.price).trim()==='' || !Number.isFinite(price) || price<=0 || !Number.isFinite(time) || time<start || time>end) continue;
    if (provider!=='ALL' && r.provider_name!==provider || region!=='ALL' && r.region_code!==region) continue;
    if (country!=='ALL' && (r.country_code || countries.get(r.provider_name+'|'+r.region_code))!==country) continue;
    if (type==='COMMITMENT' && (Number(r.commitment_months)!==Number(months) || String(r.payment_option||'').toUpperCase()!==payment)) continue;
    const week = weekStart(time), key = `${type}|${week}`;
    if (!buckets.has(key)) buckets.set(key,new Map());
    const offers = buckets.get(key), offerKey = r.provider_name+'|'+r.offer_id, prior = offers.get(offerKey);
    if (!prior || time>prior.time || time===prior.time && String(r.observation_id)>String(prior.id)) offers.set(offerKey,{price,provider:r.provider_name,time,id:r.observation_id});
  }
  const providerSeries = [];
  const series = types.map(type => {
    const points=[];
    for(let x=weekStart(start); x<=weekStart(end); x+=WEEK) {
      const offers=[...(buckets.get(`${type}|${x}`)?.values() || [])], providers=new Map();
      for(const o of offers) {if(!providers.has(o.provider))providers.set(o.provider,[]);providers.get(o.provider).push(o.price);}
      const members=[...(buckets.get(`${type}|${x}`)?.keys() || [])].sort().join(',');
      points.push({x,members,min:offers.length?Math.min(...offers.map(o=>o.price)):null,max:offers.length?Math.max(...offers.map(o=>o.price)):null,y:median([...providers.values()].map(median)),providers:providers.size,offers:offers.length,observedAt:offers.length?Math.max(...offers.map(o=>o.time)):null});
    }
    const names = [...new Set([...buckets].filter(([key])=>key.startsWith(type+'|')).flatMap(([,offers])=>[...offers.values()].map(o=>o.provider)))].sort();
    for (const name of names) {
      const providerPoints=[];
      let prior=null;
      for (const point of points) {
        const offers=[...(buckets.get(`${type}|${point.x}`)?.entries() || [])].filter(([,o])=>o.provider===name);
        const members=offers.map(([key])=>key).sort().join(',');
        const next={x:point.x,y:median(offers.map(([,o])=>o.price)),providers:offers.length?1:0,offers:offers.length,observedAt:offers.length?Math.max(...offers.map(([,o])=>o.time)):null,members};
        // Never connect medians of different product baskets as a price movement.
        if(prior?.y!=null && next.y!=null && prior.members!==members) providerPoints.push({x:(prior.x+next.x)/2,y:null});
        providerPoints.push(next);prior=next;
      }
      providerSeries.push({type,provider:name,points:providerPoints,latest:providerPoints.findLast(p=>p.y!=null)||null});
    }
    return {type,points,latest:points.findLast(p=>p.y!=null)||null};
  });
  return {start,end,series,providerSeries};
}

// Keep observed medians, but do not imply price movement between different samples.
export function comparableMedianPoints(points) {
  const output=[];
  for (const point of points) {
    const prior=output.at(-1);
    if(prior?.y!=null && point.y!=null && prior.members!==point.members) output.push({x:(prior.x+point.x)/2,y:null});
    output.push(point);
  }
  return output;
}
