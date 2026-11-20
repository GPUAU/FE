/* Browser-local review calculations. No market eligibility or recommendation API is simulated. */
(function(root){
 'use strict';
 const C=typeof module!=='undefined'?require('./v02-calculations.js'):root.GpuV02;
 const copy=x=>JSON.parse(JSON.stringify(x));
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 function reviewRangeError(input){
  if(!finite(input.target)||input.target<0||input.target>2)return '가격 검토의 목표 IRR은 0~200%로 입력하세요.';
  if(input.salvage>input.initial)return '가격 검토에서는 잔존가치를 초기 투자금 이하로 입력하세요.';
  return null;
 }
 function validate(input){
  if(!input||Object.values(input).some(x=>x==null))throw Error('투자·가동률·IRR의 모든 입력을 채워 주세요. 0도 직접 입력하세요.');
  const rangeError=reviewRangeError(input);
  if(rangeError)throw Error(rangeError);
  const r=C.investment(input);
  if(![r.minimum,r.hours,...r.flows].every(finite))throw Error('입력이 계산 가능한 범위를 초과했습니다.');
  return r;
 }
 function scenarios(input,rates,costAnnual=null){
  validate(input);
  if(!Array.isArray(rates)||rates.length!==3||rates.some(x=>!finite(x)||x<=0||x>1)||!(rates[0]<rates[1]&&rates[1]<rates[2]))throw Error('가동률은 0% 초과 100% 이하에서 보수 < 기준 < 낙관 순서로 입력하세요.');
  return rates.map((util,i)=>{
   const r=C.investment({...input,util}),revenue=input.price*r.hours;
   return {label:['보수','기준','낙관'][i],util,revenue,cash:revenue-input.opex,irr:r.irr,minimum:r.minimum,
    costUnit:finite(costAnnual)?costAnnual/r.hours:null,meets:C.npv(input.target,r.flows)>=-1e-7};
  });
 }
 function comparison(candidate,record,now=Date.now()){
  const p=record?.normalized_price,t=Date.parse(record?.observed_at),reasons=['서버의 동일 조건 판정 미연결'];
  if(!finite(p)||p<=0)reasons.push('유효한 USD/GPU·시간 단가 없음');
  if(!Number.isFinite(t))reasons.push('수집 시각 미확인');
  else if(t>now)reasons.push('미래 수집 시각 · 확인 필요');
  else if(now-t>48*3600000)reasons.push('수집 후 48시간 초과');
  if(record?.processing_status&&record.processing_status!=='success')reasons.push('최근 수집 상태 확인 필요');
  const valid=finite(candidate)&&candidate>=0&&finite(p)&&p>0;
  return {delta:valid?candidate-p:null,percent:valid?(candidate-p)/p*100:null,reasons,referenceOnly:true};
 }
 function contractRecords(records){
  if(!Array.isArray(records))throw Error('스팟·약정 목록 형식이 올바르지 않습니다.');
  return records.map(r=>({id:'contract-'+r.offer_id,observation_id:r.observation_id,provider:r.provider_name,model:r.model_name,
   product_original:r.original_product_name,sku:r.sku,gpu_count:r.gpu_count,region:r.region_code,
   term:r.contract_type==='spot'?'SPOT':r.commitment_months===12?'1_YEAR':r.commitment_months===36?'3_YEAR':'OTHER',
   term_original:[r.contract_product_type,r.payment_option,r.commitment_months?r.commitment_months+'개월':''].filter(Boolean).join(' · '),
   normalized_price:finite(r.display_price)?r.display_price:null,price_basis:r.display_basis,source_url:r.source_url,observed_at:r.collected_at,
   processing_status:r.processing_status,verification_note:[r.reason,...(r.discount_notes||[])].filter(Boolean).join(' · '),formula:r.raw_price_text}));
 }
 function review(snapshot,upper){
  const {input}=snapshot,r=validate(input),costFloor=finite(snapshot.costAnnual)?snapshot.costAnnual/(8760*input.gpu*input.util):null;
  if(upper!=null&&(!finite(upper)||upper<=0))throw Error('사용자 가격 상한은 0보다 커야 합니다.');
  const lower=Math.max(r.minimum,costFloor??0),reasons=[];
  if(snapshot.costComplete!==true)reasons.push('원가 항목 완전성 미확인'+(snapshot.missing?.length?' · '+snapshot.missing.join(', '):''));
  if(upper==null)reasons.push('사용자 가격 상한 미입력');
  if(upper!=null&&lower>upper)reasons.push('필요 하한이 사용자 상한을 초과하여 가능한 구간 없음');
  if(input.price+1e-9<r.minimum)reasons.push('후보가격이 목표 IRR 필요가보다 낮음');
  if(costFloor!=null&&input.price+1e-9<costFloor)reasons.push('후보가격이 연간 환산 원가보다 낮음');
  if(upper!=null&&input.price>upper+1e-9)reasons.push('후보가격이 사용자 상한을 초과함');
  const interval=upper!=null&&lower<=upper?[lower,upper]:null;
  return {lower,upper,interval,costFloor,irrFloor:r.minimum,irr:r.irr,reasons,
   state:upper!=null&&lower>upper?'conflict':upper==null?'missing':snapshot.costComplete!==true?'conditional':'available',
   marketStatus:'실제 동일 조건 시장 상한·서버 추천가격·예측 정확도 검증 대기'};
 }
 function toMonteCarlo(snapshot,defaults){
  const a=snapshot.input;validate(a);
  const months=a.years*12,capex=a.initial/a.gpu,opex=a.opex/a.gpu/12;
  if(months<12||months>60)throw Error('PM 시뮬레이션은 1~5년만 연결할 수 있습니다. 기간을 수정하고 다시 계산하세요.');
  if(a.gpu>100000||capex<1||capex>10000000||opex>1000000||a.util<.01||a.price<.01||a.price>100000)throw Error('입력값이 PM 시뮬레이션 지원 범위를 벗어났습니다. GPU당 투자비·운영비·가동률·후보가격을 확인하세요.');
  const c=copy(defaults);
  c.investment={gpus:a.gpu,months,capex_per_gpu:capex,ramp_months:0,residual_value_pct:a.salvage/a.initial,pricing_mode:'fixed'};
  c.uncertain={utilization:[a.util,a.util,a.util],capex_overrun:[0,0,0],opex_per_gpu_month:[opex,opex,opex],opex_annual_inflation:[0,0,0]};
  c.target_irr_annual=a.target;c.candidate_prices=[a.price];
  return c;
 }
 function fromCost(r,target=null){return {input:{initial:r.capex,years:r.years,salvage:r.salvage,gpu:r.gpu,util:r.util,price:r.candidate,opex:r.opex,target},costAnnual:r.annual,costComplete:!r.incomplete,missing:r.missing.slice(),origin:'원가 계산',dependsOn:['cost'],periodNote:r.period==='month'?r.month+' 가정을 연간 고정 · 전기료 8,760시간 환산':'연 8,760시간 기준'};}
 function createStore(){
  let snapshot=null,revision=0,stale=false,reason='',simulation=null;
  const subscribers=new Set();
  const state=()=>({snapshot:snapshot?copy(snapshot):null,revision,stale,reason,simulation:simulation?copy(simulation):null});
  const emit=()=>subscribers.forEach(f=>f(state()));
  return {get:state,subscribe:f=>{subscribers.add(f);return()=>subscribers.delete(f);},
   set:value=>{snapshot=copy(value);revision++;stale=false;reason='';simulation=null;emit();return revision;},
   invalidate:message=>{stale=true;reason=message;simulation=null;revision++;emit();},
   invalidateSource:source=>{if(snapshot?.dependsOn?.includes(source)){stale=true;reason=source==='cost'?'원가 입력 또는 결과 변경 · 다시 가져와 계산하세요.':'IRR 입력 또는 결과 변경 · 다시 가져와 계산하세요.';simulation=null;revision++;emit();}},
   clearSimulation:()=>{simulation=null;emit();},
   saveSimulation:(value,version)=>{if(stale||version!==revision||!snapshot)return false;simulation=copy(value);emit();return true;}};
 }
 const api={validate,reviewRangeError,scenarios,comparison,contractRecords,review,toMonteCarlo,fromCost,createStore};
 root.GpuDecision=api;root.GpuFlow=createStore();if(typeof module!=='undefined')module.exports=api;
})(globalThis);
