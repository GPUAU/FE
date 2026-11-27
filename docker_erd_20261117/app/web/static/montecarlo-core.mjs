// Presentation forecast engine. A validated, single-series dataset is the input boundary.
export const MODEL_VERSION='market-bootstrap-browser-1';
export function randomSource(seed){
 let value=seed>>>0;
 return ()=>{value=(value+0x6D2B79F5)>>>0;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function validateDataset(data){
 if(data?.schema_version!==1||data.unit!=='USD/GPU-hour'||data.frequency!=='monthly')throw Error('월별 USD/GPU·시간 데이터 형식이 필요합니다.');
 if(!['mock','observed'].includes(data.kind))throw Error('목데이터 또는 실제 관측 자료의 출처를 표시해야 합니다.');
 for(const key of ['id','product','provider','region','contract','price_basis'])if(typeof data[key]!=='string'||!data[key].trim())throw Error('GPU·사업자·리전·계약 유형과 가격 기준이 필요합니다.');
 if(data.kind==='observed'&&(!data.source_url||!data.collected_at))throw Error('실제 관측 자료에는 출처와 수집 시각이 필요합니다.');
 if(!Array.isArray(data.history)||data.history.length<3)throw Error('최소 3개월의 연속 가격 이력이 필요합니다.');
 let previous=null;
 for(const row of data.history){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month)||!Number.isFinite(row.price)||row.price<=0)throw Error('월과 가격 값을 확인하세요. 가격은 0보다 커야 합니다.');
  const [y,m]=row.month.split('-').map(Number),ordinal=y*12+m;
  if(previous!==null&&ordinal!==previous+1)throw Error('가격 이력에 중복·누락된 월이 있습니다. 같은 조건의 연속 월별 자료가 필요합니다.');
  previous=ordinal;
 }
 return data;
}
export function validateDemoCatalog(catalog){
 if(catalog?.schema_version!==1||catalog.kind!=='mock'||!Array.isArray(catalog.datasets)||!catalog.datasets.length)throw Error('GPU별 목데이터 목록을 확인하세요.');
 const ids=new Set(),models=new Set();
 for(const data of catalog.datasets){
  validateDataset(data);
  if(data.kind!=='mock'||typeof data.model!=='string'||!/^[-A-Z0-9]+$/.test(data.model))throw Error('이 발표 화면에는 모델명이 있는 목데이터만 사용할 수 있습니다.');
  if(ids.has(data.id)||models.has(data.model))throw Error('중복된 GPU 목데이터가 있습니다.');
  ids.add(data.id);models.add(data.model);
 }
 return catalog.datasets;
}
export function validateSettings(raw={}){
 const c={nPaths:20000,seed:20261127,blockLength:3,jumpProbability:0,...raw};
 if(!Number.isInteger(c.nPaths)||c.nPaths<1000||c.nPaths>50000)throw Error('반복 횟수는 1,000~50,000회 범위의 정수로 입력하세요.');
 if(!Number.isInteger(c.seed)||c.seed<0||c.seed>2147483647)throw Error('시드는 0~2147483647 범위의 정수로 입력하세요.');
 if(!Number.isFinite(c.blockLength)||c.blockLength<1||c.blockLength>24)throw Error('평균 블록 길이는 1~24개월로 입력하세요.');
 if(!Number.isFinite(c.jumpProbability)||c.jumpProbability<0||c.jumpProbability>1)throw Error('가격 인하 이벤트 확률은 0~100%로 입력하세요.');
 return c;
}
export function quantile(sorted,q){const p=(sorted.length-1)*q,a=Math.floor(p),b=Math.ceil(p);return sorted[a]+(sorted[b]-sorted[a])*(p-a);}
export function futureMonth(month,offset){const [y,m]=month.split('-').map(Number),total=y*12+m-1+offset;return `${Math.floor(total/12)}-${String(total%12+1).padStart(2,'0')}`;}
export function evidence(data){
 const values=data.history.map(x=>x.price),returns=values.slice(1).map((p,i)=>Math.log(p/values[i]));
 const mean=returns.reduce((a,b)=>a+b,0)/returns.length;
 const deviation=Math.sqrt(returns.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,returns.length-1));
 return {returns,mean,monthlyChange:Math.expm1(mean),volatility:deviation,lastPrice:values.at(-1),nMonths:values.length};
}
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
export async function simulate(dataset,rawSettings,{onProgress=()=>{},yieldControl=pause}={}){
 const started=Date.now(),data=validateDataset(dataset),settings=validateSettings(rawSettings),ev=evidence(data),rng=randomSource(settings.seed);
 onProgress({stage:'validated',completed:0,total:settings.nPaths,historyCount:ev.nMonths});await yieldControl();
 onProgress({stage:'analyzed',completed:0,total:settings.nPaths,monthlyChange:ev.monthlyChange});await yieldControl();
 const columns=Array.from({length:12},()=>[]),samplePaths=[];
 const batchSize=500;
 for(let pathIndex=0;pathIndex<settings.nPaths;pathIndex++){
  let at=-1,logLevel=0;const path=[ev.lastPrice];
  for(let month=0;month<12;month++){
   if(at<0||rng()<1/settings.blockLength)at=Math.floor(rng()*ev.returns.length);else at=(at+1)%ev.returns.length;
   logLevel+=ev.returns[at];
   if(settings.jumpProbability>0&&rng()<settings.jumpProbability){
    // Same triangular event assumption as the PM model, explicitly off by default.
    const lo=-.30,mode=-.15,hi=-.05,u=rng(),pivot=(mode-lo)/(hi-lo);
    const jump=u<pivot?lo+Math.sqrt(u*(hi-lo)*(mode-lo)):hi-Math.sqrt((1-u)*(hi-lo)*(hi-mode));
    logLevel+=Math.log1p(jump);
   }
   const price=ev.lastPrice*Math.exp(logLevel);
   if(!Number.isFinite(price)||price<=0)throw Error('계산 범위를 벗어난 가격 경로가 있습니다. 입력 자료를 확인하세요.');
   columns[month].push(price);path.push(price);
  }
  if(pathIndex<24)samplePaths.push(path);
  if((pathIndex+1)%batchSize===0||pathIndex+1===settings.nPaths){onProgress({stage:'paths',completed:pathIndex+1,total:settings.nPaths});await yieldControl();}
 }
 onProgress({stage:'summarizing',completed:settings.nPaths,total:settings.nPaths});await yieldControl();
 const monthly=columns.map((values,index)=>{
  values.sort((a,b)=>a-b);
  return {month:index+1,date:futureMonth(data.history.at(-1).month,index+1),p10:quantile(values,.1),p25:quantile(values,.25),p50:quantile(values,.5),p75:quantile(values,.75),p90:quantile(values,.9),probBelowNow:values.filter(p=>p<=ev.lastPrice).length/values.length};
 });
 return {dataset:{id:data.id,kind:data.kind,product:data.product,provider:data.provider,region:data.region,contract:data.contract,unit:data.unit},history:data.history,monthly,samplePaths,settings,evidence:{...ev,returns:undefined},meta:{modelVersion:MODEL_VERSION,rng:'mulberry32',runAt:new Date().toISOString(),durationMs:Date.now()-started,horizonMonths:12,historyCount:ev.nMonths,disclosure:data.disclosure||'입력 데이터와 가정에 따른 시뮬레이션입니다.'}};
}
