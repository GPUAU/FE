/* Shared, deterministic v0.2 calculation rules. No network or persistence. */
(function(root){
 'use strict';
 const positive=(v,name)=>{if(!Number.isFinite(v)||v<=0)throw Error(name+'은 0보다 커야 합니다.');return v;};
 const nonnegative=(v,name)=>{if(!Number.isFinite(v)||v<0)throw Error(name+'은 0 이상이어야 합니다.');return v;};
 function calendarHours(month){
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))throw Error('적용 월을 선택하세요.');
   const [year,m]=month.split('-').map(Number);
   if(year<1900||year>9999)throw Error('적용 연도는 1900~9999년이어야 합니다.');
   return new Date(Date.UTC(year,m,0)).getUTCDate()*24;
 }
 function cost(input){
   const gpu=positive(input.gpu,'GPU 수'),years=positive(input.years,'사용연수'),util=positive(input.util,'가동률');
   if(!Number.isInteger(gpu)||util>1)throw Error('GPU 수는 정수, 가동률은 0% 초과 100% 이하여야 합니다.');
   const rate=nonnegative(input.rate,'자본비용률');
   if(rate>1)throw Error('자본비용률은 100% 이하여야 합니다.');
   const missing=[],seen=new Set(),breakdown=[];let capex=0,otherOpex=0;
   const acquisition=input.items.find(x=>x.id==='server');
   if(!acquisition||!['user','public'].includes(acquisition.state)||acquisition.period!=='once')throw Error('서버·GPU 취득비를 일회성 투자로 명시하세요. 0도 직접 입력해야 합니다.');
   for(const item of input.items){
     if(seen.has(item.id))throw Error('동일 원가 항목이 중복되었습니다.');seen.add(item.id);
     if(!['user','public','missing','included'].includes(item.state))throw Error('원가 상태를 선택하세요.');
     if(['missing','included'].includes(item.state)){
       if(item.amount!==null&&item.amount!==undefined&&item.amount!=='')throw Error(item.name+': 미반영·포함 항목에는 금액을 넣지 마세요.');
       if(item.state==='missing')missing.push(item.name);continue;
     }
     if(item.amount==null||item.amount==='')throw Error(item.name+': 금액을 입력하세요.');
     let amount=nonnegative(Number(item.amount),item.name);
     if(!/^\d{4}-\d{2}-\d{2}$/.test(item.date||'')||!Number.isFinite(Date.parse(item.date))||new Date(item.date).toISOString().slice(0,10)!==item.date)throw Error(item.name+': 유효한 기준일을 입력하세요.');
     if(item.state==='public'){
       let url;try{url=new URL(item.source);}catch{}
       if(!url||!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error(item.name+': 공개 출처 URL을 입력하세요.');
     }
     if(!['USD','KRW'].includes(item.currency))throw Error('통화를 선택하세요.');
     if(item.currency==='KRW')amount/=positive(input.fx,'원가 환산용 환율');
     if(item.period==='once')capex+=amount;
     else if(item.period==='year')otherOpex+=amount;
     else if(item.period==='month')otherOpex+=amount*12;
     else throw Error('금액 기간을 선택하세요.');
     breakdown.push({name:item.name,usd:amount,period:item.period});
   }
   const salvage=nonnegative(input.salvage,'잔존가치 (USD)');
   if(salvage>capex)throw Error('잔존가치는 초기 투자금 이하여야 합니다.');
   const electricity=input.electricity||{mode:'missing'};let electricityHourly=0;
   if(electricity.mode==='separate'){
     const kw=nonnegative(electricity.kw,'전체 IT 전력'),pue=positive(electricity.pue,'PUE'),tariff=nonnegative(electricity.tariff,'전기단가');
     if(pue<1)throw Error('PUE는 1 이상이어야 합니다.');
     electricityHourly=kw*pue*tariff/positive(input.fx,'전기료 환산용 환율');
   }else if(electricity.mode==='included'){
     const owner=input.items.find(x=>x.id===electricity.includedIn);
     if(!owner||!['user','public'].includes(owner.state)||!['month','year'].includes(owner.period))throw Error('전기료가 포함된 운영비 항목을 선택하고 금액을 입력하세요.');
     if(['kw','pue','tariff'].some(k=>electricity[k]!=null&&electricity[k]!==''))throw Error('전기료 포함 상태에서는 별도 전기료 입력값을 비워 주세요.');
   }else if(electricity.mode==='missing'){
     if(['kw','pue','tariff'].some(k=>electricity[k]!=null&&electricity[k]!==''))throw Error('전기료 미반영 상태에서는 별도 전기료 입력값을 비워 주세요.');
     missing.push('전기료');
   }else throw Error('전기료 반영 방식을 선택하세요.');
   const crf=rate===0?1/years:rate/(-Math.expm1(-years*Math.log1p(rate)));
   const capitalAnnual=(capex-salvage/Math.pow(1+rate,years))*crf;
   const opex=otherOpex+electricityHourly*8760,annual=capitalAnnual+opex;
   const period=input.period||'year';if(!['year','month'].includes(period))throw Error('분석 기간 단위를 선택하세요.');
   const periodHours=period==='month'?calendarHours(input.month):8760;
   const periodElectricity=electricityHourly*periodHours;
   const periodCost=(capitalAnnual+otherOpex)/(period==='month'?12:1)+periodElectricity;
   const hours=periodHours*util*gpu,unit=periodCost/hours;
   const margin=input.margin;if(!Number.isFinite(margin))throw Error('목표 마진을 입력하세요.');
   if(!['profit','markup'].includes(input.marginType))throw Error('마진 방식을 선택하세요.');
   if(input.marginType==='profit'&&(margin<0||margin>=1))throw Error('매출 기준 이익률은 0% 이상 100% 미만이어야 합니다.');
   if(input.marginType==='markup'&&margin< -1)throw Error('가산율은 -100% 이상이어야 합니다.');
   const candidate=input.marginType==='profit'?unit/(1-margin):unit*(1+margin);
   if(![capex,opex,annual,unit,candidate,hours].every(Number.isFinite))throw Error('입력값이 계산 가능한 범위를 초과했습니다.');
   return {version:'COST-CRF-RESIDUAL-1',capex,salvage,rate,opex,otherOpex,capitalAnnual,periodElectricity,periodCost,periodHours,period,month:input.month,crf,annual,hours,unit,candidate,missing,incomplete:missing.length>0,negativeMargin:margin<0,gpu,util,years,breakdown};
 }
 function npv(rate,flows){return flows.reduce((sum,cf,i)=>sum+cf/Math.pow(1+rate,i),0);}
 function irr(flows){
   const signs=flows.filter(x=>x!==0).map(Math.sign);let changes=0;
   for(let i=1;i<signs.length;i++)if(signs[i]!==signs[i-1])changes++;
   if(changes!==1)return {value:null,reason:changes>1?'현금흐름 부호가 여러 번 바뀌어 단일 IRR을 확정할 수 없습니다.':'양수·음수 현금흐름이 모두 필요합니다.'};
   let lo=-0.999,hi=1;
   for(let i=0;i<60&&npv(lo,flows)*npv(hi,flows)>0;i++)hi=hi*2+1;
   if(!Number.isFinite(npv(lo,flows))||npv(lo,flows)*npv(hi,flows)>0)return {value:null,reason:'탐색 범위에서 IRR 해를 찾지 못했습니다.'};
   for(let i=0;i<200;i++){const mid=(lo+hi)/2;if(npv(lo,flows)*npv(mid,flows)>0)lo=mid;else hi=mid;}
   return {value:(lo+hi)/2,reason:null};
 }
 function investment(input){
   const initial=positive(input.initial,'초기 투자금'),years=positive(input.years,'분석 기간'),gpu=positive(input.gpu,'GPU 수'),util=positive(input.util,'가동률');
   if(!Number.isInteger(years)||years>100||!Number.isInteger(gpu)||util>1)throw Error('기간은 1~100년 정수, GPU 수는 양의 정수, 가동률은 100% 이하여야 합니다.');
   const opex=nonnegative(input.opex,'연간 운영비'),salvage=nonnegative(input.salvage,'잔존가치'),target=nonnegative(input.target,'목표 IRR');
   if(salvage>initial)throw Error('잔존가치는 초기 투자금 이하여야 합니다.');
   const price=nonnegative(input.price,'판매가격'),hours=8760*gpu*util;
   const flows=p=>[-initial,...Array.from({length:years},(_,i)=>p*hours-opex+(i===years-1?salvage:0))];
   let lo=0,hi=Math.max(price,1);
   for(let i=0;i<100&&npv(target,flows(hi))<0;i++)hi*=2;
   if(!Number.isFinite(hi)||npv(target,flows(hi))<0)throw Error('목표 가격을 계산할 수 없습니다.');
   for(let i=0;i<200;i++){const mid=(lo+hi)/2;if(npv(target,flows(mid))<0)lo=mid;else hi=mid;}
   const minimum=npv(target,flows(0))>=0?0:(lo+hi)/2;
   return {flows:flows(price),irr:irr(flows(price)),minimum,hours,target};
 }
 const api={cost,calendarHours,npv,irr,investment};root.GpuV02=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
