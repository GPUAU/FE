/* Shared, deterministic v0.2 calculation rules. No network or persistence. */
(function(root){
 'use strict';
 const positive=(v,name)=>{if(!Number.isFinite(v)||v<=0)throw Error(name+'은 0보다 커야 합니다.');return v;};
 const nonnegative=(v,name)=>{if(!Number.isFinite(v)||v<0)throw Error(name+'은 0 이상이어야 합니다.');return v;};
 function cost(input){
   const gpu=positive(input.gpu,'GPU 수'),years=positive(input.years,'상각 기간'),util=positive(input.util,'가동률');
   if(!Number.isInteger(gpu)||util>1)throw Error('GPU 수는 정수, 가동률은 0% 초과 100% 이하여야 합니다.');
   const missing=[],seen=new Set();let capex=0,opex=0,reflected=0;
   for(const item of input.items){
     if(seen.has(item.id))throw Error('동일 원가 항목이 중복되었습니다.');seen.add(item.id);
     if(!['user','public','missing','included'].includes(item.state))throw Error('원가 상태를 선택하세요.');
     if(['missing','included'].includes(item.state)){
       if(item.amount!==null&&item.amount!==undefined&&item.amount!=='')throw Error(item.name+': 미반영·포함 항목에는 금액을 넣지 마세요.');
       if(item.state==='missing')missing.push(item.name);continue;
     }
     if(item.amount==null||item.amount==='')throw Error(item.name+': 금액을 입력하세요.');
     let amount=nonnegative(Number(item.amount),item.name);
     if(!item.date)throw Error(item.name+': 기준일을 입력하세요.');
     if(item.state==='public'&&!/^https?:\/\//.test(item.source||''))throw Error(item.name+': 공개 출처 URL을 입력하세요.');
     if(!['USD','KRW'].includes(item.currency))throw Error('통화를 선택하세요.');
     if(item.currency==='KRW')amount/=positive(input.fx,'원가 환산용 환율');
     if(item.period==='once')capex+=amount;
     else if(item.period==='year')opex+=amount;
     else if(item.period==='month')opex+=amount*12;
     else throw Error('금액 기간을 선택하세요.');
     reflected++;
   }
   if(!reflected)throw Error('한 항목 이상 비용을 반영하세요.');
   let rate=input.rate;
   if(rate==null){rate=0;missing.push('조달 금리 (0% 가정)');}
   nonnegative(rate,'조달 금리');
   const crf=rate===0?1/years:rate/(1-Math.pow(1+rate,-years));
   const annual=capex*crf+opex,hours=8760*util*gpu,unit=annual/hours;
   const margin=Number(input.margin);
   if(!Number.isFinite(margin))throw Error('목표 마진을 입력하세요.');
   if(!['profit','markup'].includes(input.marginType))throw Error('마진 방식을 선택하세요.');
   if(input.marginType==='profit'&&margin>=1)throw Error('매출 기준 이익률은 100% 미만이어야 합니다.');
   if(input.marginType==='markup'&&margin< -1)throw Error('가산율은 -100% 이상이어야 합니다.');
   const candidate=input.marginType==='profit'?unit/(1-margin):unit*(1+margin);
   return {capex,opex,crf,annual,hours,unit,candidate,missing,incomplete:missing.length>0,negativeMargin:margin<0,gpu,util,years};
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
   const price=positive(input.price,'판매가격'),hours=8760*gpu*util;
   const flows=p=>[-initial,...Array.from({length:years},(_,i)=>p*hours-opex+(i===years-1?salvage:0))];
   let lo=0,hi=Math.max(price,1);
   for(let i=0;i<100&&npv(target,flows(hi))<0;i++)hi*=2;
   if(!Number.isFinite(hi)||npv(target,flows(hi))<0)throw Error('목표 가격을 계산할 수 없습니다.');
   for(let i=0;i<200;i++){const mid=(lo+hi)/2;if(npv(target,flows(mid))<0)lo=mid;else hi=mid;}
   const minimum=npv(target,flows(0))>=0?0:(lo+hi)/2;
   return {flows:flows(price),irr:irr(flows(price)),minimum,hours,target};
 }
 const api={cost,npv,irr,investment};root.GpuV02=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
