/* Cost and IRR screens display Spring simulation results. */
if(typeof PAGES!=='undefined'){PAGES.cost.tools=false;PAGES.bizcase.tools=false;PAGES.qa.tools=false;}
function calculatorFrame(title,description){
 document.body.classList.add('market-v4');$('#pageTitle').textContent=title;$('#pageDesc').textContent=description;
 $('#dataContext').hidden=true;mountFx();
}
function calculationInvalidator(form,result,onEdit){
 const invalidate=event=>{onEdit(event);result.textContent='입력이 변경되었습니다. 재계산이 필요합니다.';result.dataset.state='dirty';};
 form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);
}
function readCostForm(){
 const items=costRows.map(([id,name])=>{const row=document.querySelector(`[data-cost-row="${id}"]`),read=k=>row.querySelector(`[data-field="${k}"]`).value;
  return {id,name,state:read('state'),amount:read('amount')||null,includedIn:read('includedIn')||null,currency:read('currency'),period:read('period'),date:read('date'),source:read('source'),usefulLifeYears:read('usefulLifeYears')||null,residualValueUsd:read('residualValueUsd')||null};});
 const percent=id=>fieldValue(id)==null?null:fieldValue(id)/100;
 return {capitalMode:$('#costCapitalMode').value,modelId:$('#v02CostModel').value,marketFilters:$('#v02CostMarket').value?JSON.parse($('#v02CostMarket').value):null,gpu:fieldValue('v02Gpu'),util:percent('v02Util'),years:fieldValue('v02Years'),rate:percent('v02Rate'),salvage:fieldValue('v02Salvage'),fx:fieldValue('v02CostFx'),period:$('#costPeriod').value,month:$('#costMonth').value,margin:percent('v02Margin'),marginType:$('#v02MarginType').value,items,electricity:{mode:$('#electricMode').value,kw:fieldValue('electricKw'),pue:fieldValue('electricPue'),tariff:fieldValue('electricTariff'),includedIn:$('#electricOwner').value,amount:fieldValue('electricAmount'),currency:$('#electricCurrency').value}};
}
// Examples are display hints only; they never supply calculation values.
const costInputExamples={v02Gpu:'예: 8',v02Util:'예: 70',v02Years:'예: 5',v02Rate:'예: 8',v02Salvage:'예: 0',v02CostFx:'예: 1400',electricKw:'예: 8',electricPue:'예: 1.3',electricTariff:'예: 150',electricAmount:'예: 60480000',v02Margin:'예: 20'};
const costAmountExamples={server:'예: 240000',memory:'예: 12000',network:'예: 10000',rack:'예: 8000',rent:'예: 24000',ops:'예: 12000'};
const costNumberInput=(id,title,value='',step='any')=>numberInput(id,title,value,step,costInputExamples[id]||'');
function bindCostCalendarHints(form){
 const sync=()=>form.querySelectorAll('.cost-calendar-hint').forEach(wrapper=>{
  const input=wrapper.querySelector('input');
  wrapper.classList.toggle('is-empty',!input.value);
  const hint=wrapper.querySelector('.cost-calendar-example');
  hint.textContent=input.disabled?'월별 계산 시 선택':input.type==='month'?'예: 2026-11':'예: 2026-11-01';
 });
 form.addEventListener('input',sync);form.addEventListener('change',sync);sync();
}
RENDER.cost=async()=>{
 calculatorFrame('원가와 후보가격','잔존가치·전기료·판매 가능 시간을 반영한 사용자 가정 계산');
 const { calculateCost, costModels, bindMarketScope, showCostMarket } = await import('/static/spring-cost.mjs?v=bill1124');
 const { renderCostEconomics, canTransferCost } = await import('/static/cost-economics.mjs?v=assets1124');
 let models = [], modelFailure = '';
 try { models = await costModels(api); } catch (error) { modelFailure = error.message; }
 if (location.hash.split('/')[0] !== '#cost') return;
 const saved=V02.costInput,capitalMode=saved?.capitalMode||(saved?'common':'asset'),elec=saved?.electricity||{mode:'missing'};V02.cost=null;
 $('#v-cost').innerHTML=`<div class="mv v02-calc"><div class="mv-note"><b>입력 가정에 따른 계산</b><p>입력한 가정으로 원가와 후보가격을 계산합니다. 입력값과 결과는 저장하지 않습니다. 원화 비용은 입력 환율로 환산합니다.</p><p class="cost-example-note">회색 예시는 입력 형식 안내용 가정이며 실제 시세나 권장값이 아닙니다. 예시값은 계산에 반영되지 않습니다.</p></div><form id="v02CostForm" novalidate>
 <details class="cost-report-reference"><summary>멘토링 참고 자료 · AI Factory의 경제학</summary><p>미래에셋증권 리서치센터, 한종목, 「AI Factory의 경제학」(2026-05-19), 14~16쪽을 참고했습니다. 보고서의 IT 장비 5년·시설 14년은 해당 분석의 가정이며 모든 GPU의 확정 내용연수는 아닙니다. 실제 사용계획·기술 노후화·잔존가치를 검토해 입력하세요.</p><p>보고서의 자본회수계수(CRF)는 투자금 회수와 자본비용을 포함합니다. 고정 24%를 그대로 적용하지 않고 입력한 내용연수와 자본비용률로 다시 계산합니다. 보고서의 1GW 투자금·전기료·미국 세율·임대료는 기본값으로 넣지 않았습니다.</p><p><a href="https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2022/issued/part-a/ias-16-property-plant-and-equipment.pdf?bypass=on" target="_blank" rel="noopener noreferrer">IAS 16 · 구성요소별 감가상각과 내용연수 검토</a> · <a href="https://nvlpubs.nist.gov/nistpubs/hb/2020/NIST.HB.135-2020.pdf" target="_blank" rel="noopener noreferrer">NIST · 자본회수계수</a></p></details>
 <section class="mv-controls"><h3>투자와 분석 조건</h3><div class="cost-capital-mode"><label>내용연수 적용<select id="costCapitalMode"><option value="asset" ${capitalMode==='asset'?'selected':''}>자산별 내용연수</option><option value="common" ${capitalMode==='common'?'selected':''}>전체 투자에 공통 적용</option></select></label><button type="button" id="applyReportLives" class="mv-btn">보고서 내용연수 예시 적용 · IT 5년 / 시설 14년</button></div><div class="mv-filterline">
 <label>GPU 모델<select id="v02CostModel"><option value="">GPU 모델 선택</option>${models.map(model=>`<option value="${mh(model.id)}" ${model.id===saved?.modelId?'selected':''}>${mh(model.name)}</option>`).join('')}</select></label>
 ${costNumberInput('v02Gpu','GPU 수',saved?.gpu,'1')}${costNumberInput('v02Util','유료 가동률 (%)',saved?.util==null?'':saved.util*100)}${costNumberInput('v02Years','공통 내용연수 (년)',saved?.years)}${costNumberInput('v02Rate','연 자본비용률 (%) · 필수',saved?.rate==null?'':saved.rate*100)}${costNumberInput('v02Salvage','공통 말기 잔존가치 (USD) · 0도 입력',saved?.salvage)}${costNumberInput('v02CostFx','비용 환산용 환율 (KRW / USD)',saved?.fx??GpuFx.appliedRate(V02.fx,V02.manualFx)?.rate??'')}
 <label>계산 기간<select id="costPeriod"><option value="year">연간 고정 · 8,760시간</option><option value="month" ${saved?.period==='month'?'selected':''}>선택 월 · 실제 달력 시간</option></select></label><label>적용 월<span class="cost-calendar-hint"><input id="costMonth" type="month" value="${mh(saved?.month||'')}" aria-describedby="costMonthHint"><span class="cost-calendar-example" id="costMonthHint">예: 2026-11</span></span></label></div>
 <p>자본비용률은 전체 투자금의 연 할인율입니다. 실제 차입금리·공개 금리·목표 IRR과 구분합니다. 환율은 이 계산에 적용할 가정값이며 자동으로 바뀌지 않습니다. 잔존가치는 자산 내용연수가 끝나는 시점의 USD 금액입니다. 자산별 모드에서는 반영할 일회성 투자마다 내용연수와 잔존가치(0도 명시)를 입력하세요.</p></section>
 <div id="costAgent"></div><div id="billImport"></div><div class="mv-tablebox" tabindex="0" role="region" aria-label="원가 항목 입력"><table class="mv-table"><thead><tr><th>항목</th><th>상태</th><th>금액 / 자산 가정</th><th>통화 / 기간</th><th>기준일 / 출처</th></tr></thead><tbody>${costRows.map(([id,name],i)=>{const item=saved?.items?.find(x=>x.id===id);return `<tr data-cost-row="${id}"><td><b>${name}</b><small>${id==='server'?'취득비 필수 · 일회성 투자':'다른 항목에 포함 시 중복 입력 금지'}</small></td><td><select data-field="state" aria-label="${name} 상태">${[['missing','미반영'],['user','사용자 입력'],['public','공개 자료'],['included','다른 항목에 포함']].map(([k,v])=>`<option value="${k}" ${item?.state===k?'selected':''}>${v}</option>`).join('')}</select><select data-field="includedIn" aria-label="${name} 상위 항목" ${item?.state==='included'?'':'hidden'}><option value="">상위 항목 선택</option>${costRows.filter(([other])=>other!==id).map(([other,label])=>`<option value="${other}" ${item?.includedIn===other?'selected':''}>${label}</option>`).join('')}</select></td><td><input type="number" step="any" data-field="amount" placeholder="${costAmountExamples[id]}" aria-label="${name} 금액" value="${mh(item?.amount??'')}"><div class="cost-asset-fields" hidden><label>내용연수 (년)<input type="number" min="1" max="100" step="1" data-field="usefulLifeYears" aria-label="${name} 내용연수" placeholder="예: ${id==='rack'?'14':'5'}" value="${mh(item?.usefulLifeYears??'')}"></label><label>종료 잔존가치 (USD)<input type="number" min="0" step="any" data-field="residualValueUsd" aria-label="${name} 종료 잔존가치" placeholder="예: 0" value="${mh(item?.residualValueUsd??'')}"></label></div></td><td><select data-field="currency" aria-label="${name} 통화">${['USD','KRW'].map(k=>`<option ${item?.currency===k?'selected':''}>${k}</option>`).join('')}</select><select data-field="period" aria-label="${name} 기간">${[['once','일회성 투자'],['month','월 운영비'],['year','연 운영비']].map(([k,v])=>`<option value="${k}" ${(item?.period??(i<4?'once':'year'))===k?'selected':''}>${v}</option>`).join('')}</select></td><td><span class="cost-calendar-hint"><input type="date" data-field="date" aria-label="${name} 기준일" aria-describedby="costDateHint-${id}" value="${mh(item?.date??'')}"><span class="cost-calendar-example" id="costDateHint-${id}">예: 2026-11-01</span></span><input type="url" data-field="source" aria-label="${name} 출처" placeholder="예: https://example.com/quote" title="공개 자료 선택 시 출처 URL 필수" value="${mh(item?.source??'')}"></td></tr>`;}).join('')}</tbody></table></div>
 <section class="mv-controls"><h3>전기료</h3><div class="mv-filterline"><label>반영 방식<select id="electricMode">${[['missing','미확인 · 조건부 결과'],['separate','별도 계산'],['amount','연 금액 직접 입력 · 청구서'],['included','입력한 운영비에 포함']].map(([k,v])=>`<option value="${k}" ${elec.mode===k?'selected':''}>${v}</option>`).join('')}</select></label><label>전기료 포함 항목<select id="electricOwner">${costRows.map(([id,name])=>`<option value="${id}" ${elec.includedIn===id?'selected':''}>${name}</option>`).join('')}</select></label>${costNumberInput('electricKw','기간 평균 IT 전력 (kW)',elec.kw)}${costNumberInput('electricPue','PUE (1 이상)',elec.pue)}${costNumberInput('electricTariff','전기단가 (KRW / kWh)',elec.tariff)}${costNumberInput('electricAmount','전기료 연 금액',elec.amount)}<label>전기료 통화<select id="electricCurrency">${['KRW','USD'].map(k=>`<option ${elec.currency===k?'selected':''}>${k}</option>`).join('')}</select></label></div><p>별도 전기료 = 기간 평균 IT 전력 × 기간 시간 × PUE × 전기단가 ÷ 환율. 입력 전력은 유휴 시간을 포함한 기간 평균값입니다. 유료 가동률은 판매 GPU 시간에만 적용하고, 평균 전력에 다시 곱하지 않습니다. 운영비 포함 선택 시 해당 운영비에만 반영합니다.</p></section>
 <section class="mv-controls"><div class="mv-filterline"><label>마진 방식<select id="v02MarginType"><option value="profit">매출 기준 이익률</option><option value="markup" ${saved?.marginType==='markup'?'selected':''}>원가 가산율</option></select></label>${costNumberInput('v02Margin','목표 마진 (%)',saved?.margin==null?'':saved.margin*100)}<label>동일 조건 시장 비교<select id="v02CostMarket"></select></label><button class="mv-btn primary" type="submit">원가·후보가격 계산</button></div></section></form><div id="v02CostResult" aria-live="polite"></div></div>`;
 const form=$('#v02CostForm'),out=$('#v02CostResult');
 const model=form.querySelector('#v02CostModel');
 const toggleAssets=()=>{
  const detailed=$('#costCapitalMode').value==='asset';
  for(const id of ['v02Years','v02Salvage']){const el=$('#'+id);el.disabled=detailed;el.closest('label').hidden=detailed;}
  form.querySelectorAll('[data-cost-row]').forEach(row=>{
   const active=detailed&&['user','public'].includes(row.querySelector('[data-field="state"]').value)&&row.querySelector('[data-field="period"]').value==='once';
   row.querySelector('.cost-asset-fields').hidden=!active;
   row.querySelectorAll('.cost-asset-fields input').forEach(el=>el.disabled=!active);
  });
 };
 toggleAssets();form.addEventListener('change',toggleAssets);
 $('#applyReportLives').onclick=()=>{
  $('#costCapitalMode').value='asset';
  for(const [id,years] of [['server',5],['memory',5],['network',5],['rack',14]]){
   form.querySelector(`[data-cost-row="${id}"] [data-field="usefulLifeYears"]`).value=years;
  }
  toggleAssets();$('#costCapitalMode').dispatchEvent(new Event('change',{bubbles:true}));
 };
 bindMarketScope(form, api, {model,gpu:form.querySelector('#v02Gpu'),market:form.querySelector('#v02CostMarket'),savedScope:saved?.marketFilters});
 form.querySelectorAll('[data-cost-row]').forEach(row=>{
  const status=row.querySelector('[data-field="state"]');
  const parent=row.querySelector('[data-field="includedIn"]');
  status.addEventListener('change',()=>{parent.hidden=status.value!=='included';});
 });
 const toggleElectricity=()=>{const separate=$('#electricMode').value==='separate',amount=$('#electricMode').value==='amount';for(const id of ['electricKw','electricPue','electricTariff']){$('#'+id).disabled=!separate;if(!separate)$('#'+id).value='';}for(const id of ['electricAmount','electricCurrency']){$('#'+id).disabled=!amount;$('#'+id).closest('label').hidden=!amount;}if(!amount)$('#electricAmount').value='';$('#electricOwner').disabled=$('#electricMode').value!=='included';};
 toggleElectricity();$('#electricMode').addEventListener('change',toggleElectricity);
 import('/static/bill-import.mjs?v=agent1125c').then(({mountBillImport})=>{if($('#billImport'))mountBillImport({host:$('#billImport'),form});}).catch(()=>{const h=$('#billImport');if(h)h.textContent='청구서 불러오기 기능을 불러오지 못했습니다.';});
 import('/static/cost-agent-ui.mjs?v=agent1125c').then(({mountCostAgent})=>{if($('#costAgent'))mountCostAgent({host:$('#costAgent'),form,models});}).catch(()=>{const h=$('#costAgent');if(h)h.textContent='원가 에이전트를 불러오지 못했습니다.';});
 const toggleMonth=()=>$('#costMonth').disabled=$('#costPeriod').value!=='month';toggleMonth();$('#costPeriod').addEventListener('change',toggleMonth);
 bindCostCalendarHints(form);
 let revision = 0;
 calculationInvalidator(form,out,()=>{
  revision++;
  V02.costInput=readCostForm();
  V02.cost=null;
  GpuFlow.invalidateSource('cost');
  if(V02.irrContext?.dependsOn?.includes('cost')){
   V02.irrResult=null;
   V02.irrIncomplete=true;
   V02.irrContext=null;
   V02.irrProvenance='원가 입력 변경 · 이전 IRR 가정을 다시 확인하세요.';
  }
 });
 const submit = form.querySelector('button[type="submit"]');
 form.onsubmit=async e=>{
  e.preventDefault();
  if (submit.disabled) return;
  GpuFlow.invalidateSource('cost');
  V02.cost=null;
  const input = readCostForm();
  V02.costInput = input;
  const ticket = ++revision;
  submit.disabled = true;
  out.dataset.state = 'loading';
  out.textContent = 'Spring에서 원가를 계산하고 있습니다.';
  try {
  if (!input.modelId) throw Error('GPU 모델을 선택하세요.');
  if (input.rate == null || input.rate < 0 || input.rate > 1 || (input.capitalMode!=='asset' && input.salvage == null)) {
    throw Error('연 자본비용률(0~100%)을 입력하고, 공통 모드에서는 말기 잔존가치도 입력하세요.');
  }
  const result = await calculateCost(GpuSpringAnalysis.requestEnvelope,input);
  const r = {...result, model:model.selectedOptions[0]?.textContent, modelId:input.modelId};
  if (ticket !== revision || !form.isConnected || state.view!=='cost') return;
  V02.cost=r;out.dataset.state='valid';
  const transferAllowed=canTransferCost(r);
  const price=v=>`${mp(v)}${input.fx>0?`<small>${Math.round(v*input.fx).toLocaleString('ko-KR')}원 · 비용 환산용 입력 환율 기준</small>`:''}`;
  out.innerHTML=`<section class="mv-note"><h3>${r.incomplete?'불완전 원가 · 조건부 결과':'입력 항목 반영 결과'}</h3>${r.incomplete?`<p class="v02-warning">미반영: ${r.missing.map(mh).join(', ')}. 누락 비용 때문에 마진이 실제보다 높게 나올 수 있습니다.</p>`:''}${r.negativeMargin?'<p class="v02-warning">목표율이 음수여서 원가보다 낮은 후보가격입니다.</p>':''}<div class="v02-results"><div>자본회수 포함 시간당 원가<strong>${price(r.unit)}</strong><span>USD / GPU·시간</span></div><div>후보가격<strong>${price(r.candidate)}</strong><span>USD / GPU·시간</span></div><div>${r.period==='month'?mh(r.month)+' 월':'연간 고정'} 비용<strong>${mp(r.periodCost)}</strong><span>${r.periodHours.toLocaleString()}시간 · 판매 ${r.hours.toLocaleString()} GPU시간</span></div></div><p>초기 투자금 ${mp(r.capex)} · 연 자본비용률 ${(r.rate*100).toFixed(2)}% · ${r.assetSpecificLives?'자산별 내용연수·잔존가치 적용':'말기 잔존가치 '+mp(r.salvage)+' · CRF '+r.crf?.toFixed(6)}</p><p>연 자본회수비용 = ${r.assetSpecificLives?'자산별 ':''}(투자금 − 잔존가치 / (1+r)<sup>n</sup>) × CRF${r.assetSpecificLives?'의 합계':''} = ${mp(r.capitalAnnual)}<br>기간 전기료 ${input.electricity.mode==='missing'?'미반영':input.electricity.mode==='included'?'운영비에 포함 (별도 가산 없음)':input.electricity.mode==='amount'?'입력한 연 금액 반영 (기타 연 운영비에 포함)':mp(r.periodElectricity)} · 기타 연 운영비 ${mp(r.otherOpex)}<br>시간당 원가 = 기간 총원가 ÷ (GPU 수 × 기간 시간 × 가동률). 후보가격 = ${input.marginType==='profit'?'원가 ÷ (1 − 매출 이익률)':'원가 × (1 + 가산율)'}.</p><p>Spring 계산 · 산식 ${mh(r.version)}. ${mh(r.disclaimer||'')}</p>${r.nonPositiveCandidate?'<p class="v02-warning">후보가가 0 이하라 예상 이익률을 산출할 수 없습니다.</p>':''}${renderCostEconomics(r,{money:mp,escape:mh})}<div data-cost-market></div>${transferAllowed?'<details>':'<details hidden>'}<summary>IRR에 전달되는 값 확인</summary><p>투자금 ${mp(r.capex)}, 사용연수 ${r.years}년, 잔존가치 ${mp(r.salvage)}, ${r.gpu} GPU, 가동률 ${r.util*100}%, 판매가격 ${mp(r.candidate)}, 연 현금 운영비 ${mp(r.opex)}를 덮어씁니다. 기존 목표 IRR은 유지합니다. 월 계산도 선택 월 가정을 연간 고정하며 전기료는 8,760시간으로 환산합니다. 자본회수분은 현금 운영비에 넣지 않습니다.</p></details>${!transferAllowed&&r.assetSpecificLives?'<p class="v02-warning">자산마다 내용연수가 다르면 잔존가치의 회수 시점도 다릅니다. 단일 기간 IRR로 자동 전달하지 않습니다. <a href="#bizcase">IRR 화면</a>에서 분석 기간·중간 교체투자·말기 처분가정을 별도로 검토하세요. 현재 IRR 계산은 중간 교체투자를 지원하지 않습니다.</p>':''}<div class="mc-actions"><button type="button" id="applyCostToReview" class="mv-btn primary" ${!transferAllowed?'disabled':''}>가동률·가격 검토로 연결</button><button type="button" id="applyCostToIrr" class="mv-btn" ${!transferAllowed?'disabled':''}>위 가정을 IRR에 적용</button></div></section>`;
  showCostMarket(out.querySelector('[data-cost-market]'), r.marketComparison);
  $('#applyCostToReview').onclick=()=>{if(transferAllowed&&V02.cost===r)openPriceReview({...GpuDecision.fromCost(r,V02.irrInput?.target??null),model:r.model});};
  $('#applyCostToIrr').onclick=()=>{if(!transferAllowed||V02.cost!==r)return;V02.irrResult=null;V02.irrContext={...GpuDecision.fromCost(r),model:r.model};V02.irrModel=r.modelId;V02.irrMarketScope=input.marketFilters;V02.irrFlowRevision=null;GpuFlow.invalidateSource('irr');V02.irrInput={initial:r.capex,years:r.years,salvage:r.salvage,gpu:r.gpu,util:r.util,price:r.candidate,opex:r.opex,target:V02.irrInput?.target??null};V02.irrProvenance='원가 계산에서 전달 · '+(r.period==='month'?r.month+' 가정을 연간 고정':'연간 고정');V02.irrIncomplete=r.incomplete;location.hash='#bizcase';};
  } catch(error) {
    if (ticket === revision && form.isConnected) {
      out.dataset.state='invalid';
      out.textContent=error.message;
    }
  } finally {
    submit.disabled = false;
  }
 };
 if (modelFailure) out.textContent = 'GPU 모델 조회 실패 · ' + modelFailure;
 else if(V02.costInput)out.textContent='입력 가정을 복원했습니다. 결과를 확인하려면 다시 계산하세요.';
};
const irrFields={initial:'Initial',years:'Years',opex:'Opex',gpu:'Gpu',util:'Util',salvage:'Salvage',target:'Target',price:'Price'};
function readIrrForm(){const input={};for(const [key,id] of Object.entries(irrFields)){const value=fieldValue('irr'+id);input[key]=value==null?null:['util','target'].includes(key)?value/100:value;}return input;}
RENDER.bizcase=async()=>{
 calculatorFrame('투자수익률 IRR','연간 현금흐름과 목표 IRR 기준가격을 검토합니다.');V02.irrResult=null;const s=V02.irrInput;
 $('#v-bizcase').innerHTML=`<div class="mv v02-calc"><p class="mv-note">Spring이 입력 가정으로 계산합니다. 결과는 서버에 저장하지 않습니다.</p><p class="mv-note" id="irrProvenance">${mh(V02.irrProvenance||'직접 입력 가정')} · 원가 가정을 가져오려면 <a href="#cost">원가 화면</a>에서 계산 후 적용하세요.</p><form id="v02IrrForm" novalidate><section class="mv-controls"><div class="mv-filterline"><label>GPU 모델<select id="irrModel" required disabled><option value="">모델 조회 중…</option></select></label>${numberInput('irrInitial','초기 투자금 (USD)',s?.initial)}${numberInput('irrYears','분석 기간 (1~100년 정수)',s?.years,'1')}${numberInput('irrOpex','연간 현금 운영비 (USD)',s?.opex)}${numberInput('irrGpu','GPU 수',s?.gpu,'1')}${numberInput('irrUtil','유료 가동률 (%)',s?.util==null?'':s.util*100)}${numberInput('irrSalvage','말기 잔존가치 (USD)',s?.salvage)}${numberInput('irrTarget','목표 IRR (%)',s?.target==null?'':s.target*100)}${numberInput('irrPrice','판매가격 (USD / GPU·시간)',s?.price)}<label>시장 기준가 상한<select id="irrConstraint"><option value="NONE">시장 상한 미적용</option><option value="MINIMUM">동일 조건 최저가</option><option value="MEDIAN">동일 조건 중앙값</option><option value="MAXIMUM">동일 조건 최고가</option></select></label><label id="irrScopeLabel" hidden>동일 조건 시장<select id="irrScope"></select></label></div><button type="submit" class="mv-btn primary">IRR·목표가격 계산</button></section></form><div id="v02IrrResult" aria-live="polite"></div></div>`;
 const form=$('#v02IrrForm'),out=$('#v02IrrResult');
 const model=form.querySelector('#irrModel'),submit=form.querySelector('[type="submit"]');
 const constraint=form.querySelector('#irrConstraint'),scope=form.querySelector('#irrScope');
 const scopeLabel=form.querySelector('#irrScopeLabel');
 constraint.value=V02.irrConstraint||'NONE';
 scopeLabel.hidden=constraint.value==='NONE';
 constraint.addEventListener('change',()=>{scopeLabel.hidden=constraint.value==='NONE';});
 const modelName=V02.irrContext?.model;
 let revision=0;
 submit.disabled=true;
 Promise.all([GpuSpringAnalysis.loadModels(),import('/static/spring-cost.mjs')]).then(([models,{bindMarketScope}])=>{
  if(!form.isConnected)return;
  model.replaceChildren(new Option('GPU 모델 선택',''));
  for(const entry of models){
   const selected=modelName ? entry.name===modelName : String(entry.id)===V02.irrModel;
   model.add(new Option(entry.name,String(entry.id),false,selected));
  }
  bindMarketScope(form,api,{model,gpu:form.querySelector('#irrGpu'),market:scope,savedScope:V02.irrMarketScope});
  model.disabled=false;submit.disabled=false;
 }).catch(error=>{
  if(!form.isConnected)return;
  model.replaceChildren(new Option('모델 조회 실패',''));
  out.textContent=error.message+' 화면을 다시 열어 조회하세요.';
 });
 calculationInvalidator(form,out,event=>{
  revision++;
  V02.irrModel=model.value;
  V02.irrConstraint=constraint.value;
  V02.irrMarketScope=scope.value?JSON.parse(scope.value):null;
  submit.disabled=model.disabled;
  if(V02.irrFlowRevision===GpuFlow.get().revision)GpuFlow.invalidate('IRR 입력 변경 · 다시 가져오거나 직접 확인하세요.');
  else GpuFlow.invalidateSource('irr');
  V02.irrFlowRevision=null;
  V02.irrResult=null;
  V02.irrInput=readIrrForm();
  if(['irrPrice','irrTarget','irrConstraint','irrScope'].includes(event.target.id))return;
  V02.irrContext=null;
  V02.irrProvenance='사용자가 직접 수정한 가정';
  V02.irrIncomplete=true;
  form.parentElement.querySelector('#irrProvenance').textContent=V02.irrProvenance+' · 원가 반영 상태를 다시 확인하세요.';
 });
 form.onsubmit=async e=>{
  e.preventDefault();
  const submitted=++revision;
  V02.irrResult=null;
  V02.irrModel=model.value;
  submit.disabled=true;
  out.dataset.state='loading';
  out.textContent='IRR 계산 중…';
  try{
  const input=readIrrForm();V02.irrInput=input;
  if(Object.values(input).some(v=>v==null))throw Error('모든 IRR 입력값을 입력하세요. 0도 명시적으로 입력해야 합니다.');
  const market={constraint:constraint.value,filters:scope.value?JSON.parse(scope.value):null};
  const result=await GpuSpringAnalysis.simulateIrr(input,model.value,undefined,market);
  if(submitted!==revision||!form.isConnected||state.view!=='bizcase')return;
  const candidate=result.candidateResults[0];
  const r={
   irr:{value:candidate.irr==null?null:Number(candidate.irr),reason:'현금흐름에서 IRR을 계산할 수 없습니다.'},
   minimum:result.targetPrice.amount==null?null:Number(result.targetPrice.amount),
   flows:candidate.cashFlows,
   formulaVersion:result.formulaVersion
  };
  const marketLabel={
   NOT_REQUESTED:'시장 상한 미적용',
   UNAVAILABLE:result.marketReference.reason==='MULTIPLE_COMPARISON_GROUPS'?'여러 상품 구성에 해당합니다. 단일 비교 조건을 선택하세요.':'동일 조건 시장가격 미확보',
   OK:'선택한 시장 기준가 '+mp(result.marketReference.amount)+' / GPU·시간'
  }[result.marketReference.status];
  const targetLabel={
   NOT_EVALUATED:'미평가',
   NO_FEASIBLE_PRICE:'상한 이하에서 목표 IRR 충족 가격 없음',
   IRR_UNAVAILABLE:'산출 불가'
  }[result.targetPrice.status];
  const marketSources=(result.marketReference.sources||[]).flatMap(source=>{
   const url=GpuSpringAnalysis.sourceLink(source.sourceUrl);
   return url?[`<li><a href="${mh(url)}" target="_blank" rel="noopener noreferrer">${mh(source.sourceName||'출처 원문')}</a></li>`]:[];
  });
  const reviewError=GpuDecision.reviewRangeError(input);
  V02.irrResult=r;out.dataset.state='valid';
  out.innerHTML=`<section class="mv-note"><h3>입력 가정에 따른 결과</h3><p class="v02-warning">${V02.irrIncomplete!==false?'원가 완전성 미확인 · 누락 운영비가 있으면 IRR이 과대평가될 수 있습니다.':'전달된 원가 항목을 반영한 가정 계산입니다.'}</p><div class="v02-results"><div>입력 판매가격 IRR<strong>${r.irr.value==null?mh(r.irr.reason):(r.irr.value*100).toFixed(2)+'%'}</strong></div><div>목표 IRR 기준가격<strong>${r.minimum==null?mh(targetLabel||'산출 불가'):fxPrice(r.minimum)+' / GPU·시간'}</strong></div></div><p>적용 판매가격 ${mp(input.price)} · 목표 IRR ${input.target*100}% · 가동률 ${input.util*100}%</p><p>Spring 계산 · ${mh(r.formulaVersion)} · ${mh(marketLabel||'')}</p>${result.marketScenarios?.length?`<details><summary>시장 기준가별 IRR</summary><ul>${result.marketScenarios.map(s=>`<li>${{MINIMUM:'최저',MEDIAN:'중앙',MAXIMUM:'최고'}[s.type]} ${mp(s.price)} · ${s.irr==null?'IRR 산출 불가':(Number(s.irr)*100).toFixed(2)+'%'}</li>`).join('')}</ul>${marketSources.length?'<p>시장 기준가 출처</p><ul>'+marketSources.join('')+'</ul>':''}</details>`:''}<p>CF₀ = −투자금. 매년 CF = 판매가격 × GPU 수 × 8,760 × 가동률 − 현금 운영비. 마지막 해에 잔존가치를 한 번 더합니다. 세금·운전자본은 제외하며 실제 수익을 보장하지 않습니다.</p><details><summary>연도별 현금흐름 (USD)</summary><table class="mv-table"><thead><tr><th>연도</th><th>현금흐름</th></tr></thead><tbody>${r.flows.map(flow=>`<tr><td>${mh(flow.year)}</td><td>${mp(flow.amount)}</td></tr>`).join('')}</tbody></table></details><button type="button" id="applyIrrToReview" class="mv-btn primary" ${reviewError?'disabled':''}>가동률·가격 검토로 연결</button>${reviewError?`<p class="v02-warning">${mh(reviewError)}</p>`:''}</section>`;refreshKrw();
  $("#applyIrrToReview").onclick=()=>{if(V02.irrResult===r)openPriceReview({...V02.irrContext,model:model.selectedOptions[0]?.textContent,input:V02.irrInput,costComplete:V02.irrIncomplete===false,origin:V02.irrProvenance||"IRR 직접 입력",dependsOn:[...(V02.irrContext?.dependsOn||[]),"irr"]});};
 }catch(error){
  if(submitted===revision&&form.isConnected){out.dataset.state='invalid';out.textContent=error.message;}
 }finally{
  if(submitted===revision&&form.isConnected)submit.disabled=false;
 }};

};
