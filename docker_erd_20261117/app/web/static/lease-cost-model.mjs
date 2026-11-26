/** 임차형 GPUaaS: 현대차증권 본문 28쪽 입력 가정으로 재계산. */
export const BASE = Object.freeze({gpuCount:500,gpuKw:2,gpuPrice:38000,contractKw:1000,fx:1450,rent:350000,rentMode:'capacity',rentAnnual:4200000000,tariff:183,pue:1.3,powerLoad:100,powerMode:'estimate',powerAnnual:2084004000,ops:1800000000,opsMode:'capacity',years:6,extra:0,residual:0,capitalRate:0,util:80,price:4,margin:20});
export const FIELDS = {
 gpuCount:['GPU 수','개','1,000kW ÷ 2kW에서 산출'], gpuKw:['GPU당 IT 전력','kW/GPU','서버·네트워크 포함, 시설 전력 제외'],
 gpuPrice:['GPU당 장비 구매비','USD/GPU','혼합 세대 구매단가 가정. 서버 견적의 포함 범위 확인'], contractKw:['임차 IT 용량','kW','비교 기준 1MW. GPU 전력 합계 이상 확보'],fx:['계산 환율','원/USD','고정 가정. 상단 현재 환율과 자동 연동하지 않음'],
 rent:['상면·설비 이용료','원/kW·월','홀세일 장기 임차, 판매율과 무관한 고정비'],rentAnnual:['연 임차료 총액','원/년','계약서·청구서의 연간 총액 직접 입력'],
 tariff:['전력단가','원/kWh','2025 산업용 평균을 사용한 가정. 실제 계약 요금으로 변경'],pue:['PUE','배','시설 전체 전력 ÷ IT 전력'],powerLoad:['평균 전력 부하율','%','만실 전력비를 재현하는 100% 가정. 판매율과 별도'],powerAnnual:['연 전기료 총액','원/년','실제 별도 청구되는 전기료. PUE를 추가 곱하지 않음'],
 ops:['기타 운영비','원/MW·년','인건비·네트워크·판관비. 임차료·전기료 제외'],
 years:['감가상각 기간','년','6년 가정. 경제적 수명을 보장하지 않음'],extra:['추가 장비·설치비','원','별도 구매한 장비만 추가. 예시 0원은 앱 가정'],residual:['기간 종료 잔존가치','원','전체 장비의 예상 매각금액. 예시 0원은 앱 가정'],capitalRate:['연 자본비용률','%','앱 가정 0%는 정액 회수. 양수는 자본회수계수(CRF) 적용'],
 util:['유료 판매율','%','공급 가능 GPU 시간 중 과금한 시간 비중'],price:['검토 판매단가','USD/GPU·h','장기·중기·온디맨드 혼합 단가 가정'],margin:['목표 마진율','%','사용자 설정 · 예시 20%. 매출 대비, 목표 IRR과 다름']};
export function activeFields(x){return ['gpuCount','gpuKw','gpuPrice','contractKw','fx',x.rentMode==='annual'?'rentAnnual':'rent',...(x.powerMode==='estimate'?['tariff','pue','powerLoad']:x.powerMode==='actual'?['powerAnnual']:[]),'ops','years','extra','residual','capitalRate','util','price','margin'];}
export function calculate(x){
 for(const k of activeFields(x))if(typeof x[k]!=='number'||!Number.isFinite(x[k])||x[k]<0)throw new Error(`${FIELDS[k][0]}: 0 이상의 숫자를 입력하세요.`);
 if(!['capacity','annual'].includes(x.rentMode)||!['capacity','annual'].includes(x.opsMode)||!['estimate','actual','included'].includes(x.powerMode))throw new Error('비용 계산 방식을 확인하세요.');
 if(!Number.isInteger(x.gpuCount)||x.gpuCount<1)throw new Error('GPU 수는 1 이상의 정수여야 합니다.');
 if(x.gpuKw<=0||x.contractKw<=0||x.fx<=0)throw new Error('전력·임차 용량·환율은 0보다 커야 합니다.');
 if(x.gpuCount*x.gpuKw>x.contractKw+1e-8)throw new Error('GPU의 IT 전력 합계가 임차 용량을 초과합니다. 임차 용량 또는 GPU 수를 조정하세요.');
 if(x.util<=0||x.util>100)throw new Error('유료 판매율은 0% 초과, 100% 이하여야 합니다.');
 if(x.powerMode==='estimate'&&(x.pue<1||x.powerLoad>100))throw new Error('PUE는 1 이상, 전력 부하율은 0~100%여야 합니다.');
 if(!Number.isInteger(x.years)||x.years<1||x.years>30)throw new Error('감가상각 기간은 1~30년의 정수여야 합니다.');
 if(x.margin>=100||x.capitalRate>100)throw new Error('목표 마진은 100% 미만, 자본비용률은 100% 이하여야 합니다.');
 const itKw=x.gpuCount*x.gpuKw,capex=x.gpuCount*x.gpuPrice*x.fx+x.extra;
 if(x.residual>capex)throw new Error('잔존가치는 전체 장비 투자비 이하여야 합니다.');
 const hours=x.gpuCount*8760*x.util/100,rent=x.rentMode==='annual'?x.rentAnnual:x.contractKw*x.rent*12;
 const power=x.powerMode==='included'?0:x.powerMode==='actual'?x.powerAnnual:itKw*x.pue*x.powerLoad/100*8760*x.tariff;
 const ops=x.opsMode==='annual'?x.ops:x.ops*x.contractKw/1000,dep=(capex-x.residual)/x.years,r=x.capitalRate/100;
 const capital=r===0?dep:(capex-x.residual/(1+r)**x.years)*r/(1-(1+r)**(-x.years));
 const opex=rent+power+ops,total=opex+capital,cost=total/hours/x.fx,candidate=cost/(1-x.margin/100),revenue=hours*x.price*x.fx;
 const result={itKw,capex,hours,rent,power,ops,dep,capital,opex,total,cost,candidate,revenue,ebitda:revenue-opex,ebit:revenue-opex-dep,surplus:revenue-total,actualMargin:revenue>0?(revenue-total)/revenue*100:null,breakeven:x.price>0?total/(x.gpuCount*8760*x.price*x.fx)*100:null};
 if(Object.values(result).some(v=>v!==null&&!Number.isFinite(v)))throw new Error('계산 가능한 숫자 범위를 초과했습니다. 입력값을 줄여주세요.');
 return result;
}
/** Only map known, explicitly denominated bill values. Unmapped items remain visible. */
export function importSession(session){
 const values={},notes=[],a=session.assumptions||{},origins={};
 const set=(k,v)=>{if(v!=null&&v!==''&&Number.isFinite(Number(v))){values[k]=Number(v);origins[k]='청구서 분석';}};
 set('gpuCount',a.gpu_count);set('fx',a.fx_krw_per_usd);set('years',a.depreciation_years);
 if(a.utilization!=null)set('util',Number(a.utilization)*100);
 const fx=values.fx;const toWon=(v,c)=>c==='KRW'?Number(v):c==='USD'&&fx?Number(v)*fx:null;
 if(a.acquisition_amount!=null&&values.gpuCount&&fx){const won=toWon(a.acquisition_amount,a.acquisition_currency);if(won!=null)set('gpuPrice',won/fx/values.gpuCount);else notes.push('장비 취득비 통화를 확인하고 직접 입력하세요.');}
 const totals={};const included=[];
 for(const item of session.final_items||[]){
  if(item.status==='INCLUDED_IN_OTHER'){included.push(item);continue;}
  const type=item.item_type;
  if(!['RENT','RACK_FACILITY','OPERATIONS','NETWORK_STORAGE','MEMORY','ELECTRICITY'].includes(type)||!['YEAR','MONTH'].includes(item.period)||item.amount==null){notes.push(`${type||'항목'}: 포함 범위·기간 확인 후 직접 반영`);continue;}
  const won=toWon(item.amount,item.currency);
  if(won==null||won<0||!Number.isFinite(won)){notes.push(`${type}: 금액·통화 확인 필요`);continue;}
  const key=type==='RENT'||type==='RACK_FACILITY'?'rentAnnual':type==='ELECTRICITY'?'powerAnnual':'ops';
  totals[key]=(totals[key]||0)+won*(item.period==='MONTH'?12:1);
 }
 for(const [k,v]of Object.entries(totals))set(k,v);
 if('rentAnnual'in totals)values.rentMode='annual';if('ops'in totals)values.opsMode='annual';if('powerAnnual'in totals)values.powerMode='actual';
 for(const item of included)if(item.item_type==='ELECTRICITY'){
  const parent=(session.final_items||[]).find(p=>p.item_type===item.included_in&&p.amount!=null);
  if(parent&&['RENT','RACK_FACILITY'].includes(parent.item_type)&&'rentAnnual'in totals&&!('powerAnnual'in totals))values.powerMode='included';
  else notes.push('전기료 포함 항목을 확인하세요. 전기료 방식은 자동 변경하지 않았습니다.');
 }
 notes.unshift('분석에서 확인한 값만 반영했습니다. 나머지는 보고서 예시이므로 실제 계약 조건을 확인하세요.');
 return {values,origins,notes};
}
