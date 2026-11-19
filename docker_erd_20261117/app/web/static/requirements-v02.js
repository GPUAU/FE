/* Requirements v0.2: display FX provenance and local-only cost / IRR scenarios. */
const V02={fx:null,manualFx:null,fxPromise:null,cost:null,costInput:null,irrInput:null};
async function openInterestRates(){
 let dialog=document.querySelector('#financialRates');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='financialRates';dialog.className='v02-settings v02-rates';document.body.append(dialog);}
 dialog.innerHTML='<h2>한국수출입은행 금리</h2><p>조회 중…</p>';dialog.showModal();
 try{
  const d=await api('/api/erd/interest');
  dialog.innerHTML=`<div class="mv"><div class="mv-section-head"><h2>한국수출입은행 금리</h2><button type="button" class="mv-btn" id="financialRatesClose">닫기</button></div>${d.status==='available'?`<p>기준일 ${mh(d.capture.reference_date)} · ${d.rates.length}개 항목 · ${mlink(d.capture.source_url,'API 출처')}<br>수집 시각 ${mtime(d.capture.collected_at)} · 매일 자동 수집 미설정</p><p>${mh(d.note)} 원가 계산의 조달금리는 실제 계약 조건을 직접 입력하세요.</p><div class="v02-results">${['1년','3년','5년'].map(term=>{const r=d.rates.find(x=>x.rate_name==='수은채 유통수익률 '+term);return r?`<div>${mh(r.rate_name)}<strong>${Number(r.rate_percent).toFixed(2)}%</strong></div>`:'';}).join('')}</div><details><summary>전체 금리 ${d.rates.length}개 보기</summary><table class="mv-table"><thead><tr><th>고시 항목 원문</th><th>금리 (%)</th></tr></thead><tbody>${d.rates.map(r=>`<tr><td>${mh(r.rate_name)}</td><td>${Number(r.rate_percent).toFixed(2)}</td></tr>`).join('')}</tbody></table></details>`:'<p>금리 자료를 아직 조회할 수 없습니다.</p>'}</div>`;
  $('#financialRatesClose').onclick=()=>dialog.close();
 }catch{dialog.innerHTML='<h2>금리 조회 실패</h2><p>Esc를 눌러 닫고 서버 연결을 확인하세요.</p>';}
}
function fxPrice(value){
 const valid=value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value));
 return valid?`${mp(value)}<small class="v02-krw" data-usd="${Number(value)}"></small>`:'—';
}
function refreshKrw(){
 document.querySelectorAll('[data-usd]').forEach(el=>{el.textContent=GpuFx.krwText(el.dataset.usd,V02.fx,V02.manualFx);});
}
async function fxData(force=false){
 if(V02.fxPromise)return V02.fxPromise;
 if(!force&&V02.fx)return V02.fx;
 V02.fxPromise=GpuFx.fetchLatestFx().then(data=>{V02.fx=data;return data;}).finally(()=>{V02.fxPromise=null;});
 return V02.fxPromise;
}
function fxCollectedAt(value){
 if(!value||!Number.isFinite(Date.parse(value)))return '수집 시각 미제공';
 return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))+' KST';
}
function paintFx(panel,loading=false){
 const d=V02.fx,applied=GpuFx.appliedRate(d,V02.manualFx),open=panel.querySelector('details')?.open;
 const source=d?.rate?.source_name;
 const sourceName=source&&/koreaexim/i.test(source)?'한국수출입은행':source||'출처 미제공';
 const status=applied.manual?'사용자 가정':loading?'조회 중':d?.status==='failed'?'조회 실패':!d?.rate?'미확보':d.stale?'오래된 공시':'자동 환율';
 const current=applied.rate!==null?`1 USD = ${applied.rate.toLocaleString('ko-KR',{maximumFractionDigits:6})} KRW`:loading?'환율 조회 중…':d?.status==='failed'?'환율 조회 실패':'환율 미확보';
 const date=applied.manual?'사용자 입력 · 공시 기준일 없음':d?.rate?`공시 기준일 ${d.rate.reference_date}`:'조회 출처 · 한국수출입은행';
 const warnings=[...(d?.stale?['환율 기준일이 4일을 초과했습니다. 오래된 환율로 환산 중입니다.']:[]),...(d?.warnings||[])];
 panel.setAttribute('aria-busy',String(loading));
 panel.innerHTML=`<div class="fx-display-head"><div class="fx-display-title"><span>USD → KRW</span><span class="fx-state ${applied.manual?'is-manual':d?.stale||d?.status==='failed'?'is-warning':''}">${mh(status)}</span><h2 id="fxSummaryCurrent">${mh(current)}</h2><p id="fxSummaryDate">${mh(date)}${!applied.manual&&d?.rate?' · '+mh(sourceName):''}</p></div><button type="button" class="mv-btn" id="v02FxRefresh" ${loading?'disabled':''}>${loading?'조회 중…':'환율 다시 조회'}</button></div>
 <div id="fxDisplayStatus" class="fx-display-status" role="status" aria-live="polite">${loading?'저장된 최신 환율을 확인하고 있습니다.':d?.reason?mh(d.reason):''}${applied.manual?' 사용자 입력값으로 환산 중입니다. 자동 환율과 원본 가격은 변경하지 않습니다.':''}${warnings.map(w=>`<p class="fx-warning">${mh(w)}</p>`).join('')}</div>
 <details class="fx-display-details" ${open?'open':''}><summary>환율 출처 · 사용자 환율 입력</summary><div class="fx-display-body"><div class="fx-provenance"><h3>자동 환율 정보</h3>${d?.rate?`<p><b>1 USD = ${Number(d.rate.rate).toLocaleString('ko-KR',{maximumFractionDigits:6})} KRW</b></p><p>공시 기준일 ${mh(d.rate.reference_date)} · ${mh(sourceName)}</p><p>수집 ${mh(fxCollectedAt(d.rate.collected_at))}</p>${d.rate.source_url?mlink(d.rate.source_url,'환율 출처 보기 ↗'): '<p>출처 링크 미제공</p>'}`:`<p>${d?.status==='failed'?'자동 환율 조회 실패':'자동 환율 미확보'}</p>`}<p>원화는 표시 환율로 재계산한 참고값이며, 과거 관측 당시의 원화 가격이 아닙니다. 차트와 CSV의 가격 기준은 USD입니다.</p><button type="button" class="mv-btn" id="v02Interest">금리 자료 보기</button></div><form id="v02FxForm"><label for="v02FxInput">사용자 환율 <span>KRW / USD</span></label><input id="v02FxInput" type="number" min="0.000001" step="any" inputmode="decimal" required placeholder="예: 1400 (가정값)" value="${V02.manualFx??''}" aria-describedby="v02FxNote"><div class="fx-form-actions"><button class="mv-btn" type="submit">적용</button><button class="mv-btn" type="button" id="v02FxReset">자동 환율로 복귀</button></div><small id="v02FxNote" role="status">${applied.manual?'사용자 가정 적용 중 · 새로고침하면 초기화':'입력값은 저장하거나 서버로 전송하지 않습니다.'}</small></form></div></details>`;
 panel.querySelector('#v02FxRefresh').onclick=()=>mountFx(true);
 panel.querySelector('#v02Interest').onclick=openInterestRates;
 panel.querySelector('#v02FxForm').onsubmit=e=>{
  e.preventDefault();const value=GpuFx.positiveNumber(panel.querySelector('#v02FxInput').value);
  if(value===null){panel.querySelector('#v02FxNote').textContent='0보다 큰 유효한 환율을 입력하세요.';return;}
  V02.manualFx=value;paintFx(panel,Boolean(V02.fxPromise));refreshKrw();panel.querySelector('#v02FxInput').focus();
 };
 panel.querySelector('#v02FxReset').onclick=()=>{V02.manualFx=null;paintFx(panel,Boolean(V02.fxPromise));refreshKrw();panel.querySelector('#v02FxReset').focus();};
}
async function mountFx(force=false){
 let panel=document.querySelector('#v02Fx');
 if(!panel){panel=document.createElement('section');panel.id='v02Fx';panel.className='v02-fx';panel.setAttribute('aria-label','USD 원화 환율 정보');document.querySelector('#dataContext').after(panel);}
 const loading=force||!V02.fx||Boolean(V02.fxPromise);
 paintFx(panel,loading);
 if(loading){await fxData(force);if(panel.isConnected)paintFx(panel);}
 refreshKrw();
}
const beforeV02Frame=mframe;
mframe=(title,desc)=>{beforeV02Frame(title,desc);mountFx();};
// Repaint derived price amounts after route/filter rendering; never inspect raw amounts.
let v02PaintPending=false;
new MutationObserver(changes=>{if(changes.some(c=>[...c.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('[data-usd]')||n.querySelector?.('[data-usd]'))))&&!v02PaintPending){v02PaintPending=true;queueMicrotask(()=>{refreshKrw();v02PaintPending=false;});}}).observe(document.body,{childList:true,subtree:true});

const costRows=[['server','서버·GPU'],['memory','별도 메모리'],['network','네트워크·스토리지'],['rack','랙·전원·냉각 설비'],['rent','임차료'],['ops','운영·유지보수']];
const numberInput=(id,title,value='',step='any')=>`<label>${title}<input id="${id}" type="number" step="${step}" value="${mh(value??'')}"></label>`;
const fieldValue=id=>{const v=$('#'+id).value;return v===''?null:Number(v);};
function calculatorNote(){return `<div class="mv-note"><b>사용자 가정 계산 · 외부 전송 및 저장 없음</b><p>입력값은 현재 브라우저 메모리에서만 사용합니다. 새로고침하면 사라집니다. 실제 견적·수익 보장이 아닙니다. 원화 비용은 입력한 환율로 달러로 환산합니다.</p></div>`;}
RENDER.cost=async()=>{
 await marketData();await fxData();mframe('원가와 후보가격','입력한 비용과 가정으로 GPU당 시간 원가를 계산합니다.');
 const saved=V02.costInput;
 $('#v-cost').innerHTML=`<div class="mv v02-calc">${calculatorNote()}<form id="v02CostForm"><section class="mv-controls"><div class="mv-filterline">${numberInput('v02Gpu','GPU 수',saved?.gpu,'1')}${numberInput('v02Util','가동률 (%)',saved?saved.util*100:'')}${numberInput('v02Years','상각 기간 (년)',saved?.years)}${numberInput('v02Rate','조달 금리 (%) · 미입력 시 미반영',saved?.rate==null?'':saved.rate*100)}${numberInput('v02CostFx','KRW 비용 환산용 환율',saved?.fx??V02.manualFx??V02.fx?.rate?.rate??'')}</div></section><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>원가 항목</th><th>반영 상태</th><th>금액</th><th>통화 / 기간</th><th>기준일 / 출처</th></tr></thead><tbody>${costRows.map(([id,name],i)=>{const item=saved?.items[i];return `<tr data-cost-row="${id}"><td><b>${name}</b><small>다른 항목에 포함되면 중복 입력하지 마세요.</small></td><td><select data-field="state" aria-label="${name} 상태">${[['missing','미반영'],['user','사용자 입력'],['public','공개 자료'],['included','다른 항목에 포함']].map(([k,v])=>`<option value="${k}" ${item?.state===k?'selected':''}>${v}</option>`).join('')}</select></td><td><input type="number" min="0" step="any" data-field="amount" aria-label="${name} 금액" value="${item?.amount??''}"></td><td><select data-field="currency" aria-label="${name} 통화">${['USD','KRW'].map(k=>`<option ${item?.currency===k?'selected':''}>${k}</option>`).join('')}</select><select data-field="period" aria-label="${name} 기간">${[['once','일회성 투자'],['month','월 운영비'],['year','연 운영비']].map(([k,v])=>`<option value="${k}" ${(item?.period??(i<4?'once':'year'))===k?'selected':''}>${v}</option>`).join('')}</select></td><td><input type="date" data-field="date" aria-label="${name} 기준일" value="${item?.date??''}"><input type="url" data-field="source" aria-label="${name} 출처" placeholder="공개 자료는 URL 필수" value="${mh(item?.source??'')}"></td></tr>`;}).join('')}</tbody></table></div><section class="mv-controls"><div class="mv-filterline"><label>마진 방식<select id="v02MarginType"><option value="profit">매출 기준 이익률</option><option value="markup" ${saved?.marginType==='markup'?'selected':''}>원가 가산율</option></select></label>${numberInput('v02Margin','목표 마진 (%)',saved?saved.margin*100:'')}<button class="mv-btn primary" type="submit">원가·후보가격 계산</button></div></section></form><div id="v02CostResult" aria-live="polite"></div></div>`;
 $('#v02CostForm').onsubmit=e=>{e.preventDefault();try{
   const items=costRows.map(([id,name])=>{const row=document.querySelector(`[data-cost-row="${id}"]`);const read=k=>row.querySelector(`[data-field="${k}"]`).value;return {id,name,state:read('state'),amount:read('amount')===''?null:Number(read('amount')),currency:read('currency'),period:read('period'),date:read('date'),source:read('source')};});
   const input={gpu:fieldValue('v02Gpu'),util:fieldValue('v02Util')/100,years:fieldValue('v02Years'),rate:fieldValue('v02Rate')==null?null:fieldValue('v02Rate')/100,fx:fieldValue('v02CostFx'),margin:fieldValue('v02Margin')==null?NaN:fieldValue('v02Margin')/100,marginType:$('#v02MarginType').value,items};
   const r=GpuV02.cost(input);V02.cost=r;V02.costInput=input;
   $('#v02CostResult').innerHTML=`<section class="mv-note"><h3>${r.incomplete?'불완전 원가 · 조건부 결과':'입력 항목 반영 결과'}</h3>${r.incomplete?`<p class="v02-warning">미반영: ${r.missing.map(mh).join(', ')}. 누락 비용 때문에 마진이 실제보다 높게 나올 수 있음.</p>`:''}${r.negativeMargin?'<p class="v02-warning">음수 마진 가정입니다. 원가보다 낮은 후보가격입니다.</p>':''}<div class="v02-results"><div>시간당 원가<strong>${fxPrice(r.unit)} / GPU·시간</strong></div><div>후보가격<strong>${fxPrice(r.candidate)} / GPU·시간</strong></div><div>연간 비용<strong>${mp(r.annual)}</strong></div></div><p>CRF ${r.crf.toFixed(6)} = r ÷ [1 − (1+r)<sup>−n</sup>], r=0이면 1/n.<br>연간 비용 = 투자비 × CRF + 연간 운영비. 시간 원가 = 연간 비용 ÷ (8,760 × 가동률 × GPU 수).<br>후보가격 = ${input.marginType==='profit'?'원가 ÷ (1 − 이익률)':'원가 × (1 + 가산율)'}. 금융비용과 감가상각을 중복 가산하지 않습니다.</p><p>동일 조건 시장 비교: ${MV.data.summary.eligible===0?'비교 불가 · 서비스·상호연결 조건이 확인된 표본 없음':'조건별 검증된 시장가격 연결 필요'}. 참고 단가를 최적가로 제시하지 않습니다.</p><a class="mv-btn primary" href="#bizcase">이 가정으로 IRR 계산 →</a></section>`;refreshKrw();
 }catch(error){$('#v02CostResult').textContent=error.message;}};
};
RENDER.bizcase=async()=>{
 await marketData();mframe('투자수익률 IRR','원가 가정과 연간 현금흐름으로 목표 IRR 가격을 계산합니다.');
 const c=V02.cost,s=V02.irrInput;
 $('#v-bizcase').innerHTML=`<div class="mv v02-calc">${calculatorNote()}${!c?'<p class="mv-note">원가를 먼저 계산하면 투자금·운영비·가동률·GPU 수를 가져옵니다. 아래에 직접 입력할 수도 있습니다. <a href="#cost">원가 입력 →</a></p>':''}<form id="v02IrrForm"><section class="mv-controls"><div class="mv-filterline">${numberInput('irrInitial','초기 투자금 (USD)',s?.initial??c?.capex)}${numberInput('irrYears','분석 기간 (년)',s?.years??c?.years,'1')}${numberInput('irrOpex','연간 운영비 (USD)',s?.opex??c?.opex)}${numberInput('irrGpu','GPU 수',s?.gpu??c?.gpu,'1')}${numberInput('irrUtil','가동률 (%)',s?s.util*100:c?c.util*100:'')}${numberInput('irrSalvage','마지막 해 잔존가치 (USD)',s?.salvage)}${numberInput('irrTarget','목표 IRR (%)',s?s.target*100:'')}${numberInput('irrPrice','판매가격 (USD / GPU·시간)',s?.price??c?.candidate)}</div><button type="submit" class="mv-btn primary">IRR·목표가격 계산</button></section></form><div id="v02IrrResult" aria-live="polite"></div></div>`;
 $('#v02IrrForm').onsubmit=e=>{e.preventDefault();try{
  const ids={initial:'Initial',years:'Years',opex:'Opex',gpu:'Gpu',util:'Util',salvage:'Salvage',target:'Target',price:'Price'},input={};
  for(const [key,id] of Object.entries(ids)){input[key]=fieldValue('irr'+id);if(input[key]===null)throw Error('모든 IRR 입력값을 입력하세요. 0도 명시적으로 입력해야 합니다.');}
  input.util/=100;input.target/=100;const r=GpuV02.investment(input);V02.irrInput=input;
  $('#v02IrrResult').innerHTML=`<section class="mv-note"><h3>입력 가정에 따른 결과</h3><p class="v02-warning">${!c||c.incomplete?'원가 완전성 미확인 · 조건부 IRR입니다. 누락 운영비가 있으면 결과가 과대평가될 수 있습니다.':'입력된 원가 항목에 따른 계산입니다.'}</p><div class="v02-results"><div>판매가격 IRR<strong>${r.irr.value==null?mh(r.irr.reason):(r.irr.value*100).toFixed(2)+'%'}</strong></div><div>목표 IRR 충족 최소가격<strong>${fxPrice(r.minimum)} / GPU·시간</strong></div></div><p><b>시장 상한 검증 미완료</b> · 동일 조건 경쟁가격을 확보하지 못해 시장에서 실현 가능한 가격으로 확정하지 않습니다.</p><p>CF₀ = −투자금. 연간 CF = 판매가격 × GPU 수 × 8,760 × 가동률 − 운영비. 마지막 해에 잔존가치를 더합니다. 세금·운전자본은 제외합니다. IRR은 NPV=0이 되는 할인율이며 후보가격의 마진율과 다릅니다.</p><details><summary>연도별 현금흐름 (USD)</summary><table class="mv-table"><thead><tr><th>연도</th><th>현금흐름</th></tr></thead><tbody>${r.flows.map((x,i)=>`<tr><td>${i}</td><td>${mp(x)}</td></tr>`).join('')}</tbody></table></details></section>`;refreshKrw();
 }catch(error){$('#v02IrrResult').textContent=error.message;}};
};
const previousQa=RENDER.qa;
function renderPriceChanges(rows){
 const previous=new Map(),events=[];
 for(const r of rows){
  // Do not mix catalog publication dates, archive captures and SQL API effective dates.
  const key=[r.series_key,r.contract_type,r.payment_option,r.commitment_months,r.source_kind,r.rule_version||'',r.import_batch||'',r.original_currency,r.original_time_unit,r.price_applies_to].join('|');
  const old=previous.get(key);
  if(old&&old.price!=null&&r.price!=null&&Number(old.price)!==Number(r.price))events.push({old,row:r,delta:Number(r.price)-Number(old.price),pct:Number(old.price)===0?null:(Number(r.price)/Number(old.price)-1)*100});
  previous.set(key,r);
 }
 const section=document.createElement('details');section.className='mv-note';
 section.innerHTML=`<summary><b>관측 간 가격 변화 ${events.length}건 보기</b></summary><p>선택 기간 안에서 같은 오퍼·구성·단위·근거 유형의 연속 관측을 비교합니다. 전체 가격 변경 횟수나 정확한 변경일을 뜻하지 않습니다. 대표 오퍼 변경은 섞지 않습니다. 당시 환율이 없어 원화의 가격·환율 효과 분해는 불가합니다.</p><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>사업자 / 상품 / 리전</th><th>전후 기준 시각</th><th>이전 → 이후 USD/GPU·시간</th><th>변동액 / 변동률</th><th>원문 근거</th></tr></thead><tbody>${events.slice(-30).reverse().map(e=>`<tr><td>${mh(e.row.provider_name)} · ${mh(e.row.original_product_name)}<span>${mh(e.row.region_code)} ${mh(e.row.availability_zone||'')}</span></td><td>${mtime(e.old.chart_at)}<span>→ ${mtime(e.row.chart_at)}</span></td><td>${mp(e.old.price)} → ${mp(e.row.price)}</td><td>${e.delta>0?'+':''}${mp(e.delta)}<span>${e.pct==null?'이전 가격 0 · 변동률 불가':(e.pct>0?'+':'')+e.pct.toFixed(2)+'%'}</span></td><td><button class="mv-btn" data-observation="${e.old.observation_id}">이전 근거</button><button class="mv-btn" data-observation="${e.row.observation_id}">이후 근거</button></td></tr>`).join('')||'<tr><td colspan="5">선택된 관측 사이에 확인한 가격 변화 없음 · 이력 완전성을 보장하지 않습니다.</td></tr>'}</tbody></table></div>${events.length>30?'<p>최근 30건 표시. 전체 관측은 아래 표와 CSV에서 확인할 수 있습니다.</p>':''}`;
 $('#v-trend .sk-comparison-chart').after(section);
}
RENDER.qa=async()=>{await previousQa();const audit=await api('/api/erd/requirements');const section=document.createElement('section');section.className='mv mv-note';section.innerHTML=`<h3>v0.2 · 노션 ERD 반영 점검</h3><p>테이블 존재와 기능 구현 완료는 다릅니다. 자동 수집·Agent·운영 평가는 아직 미완료입니다.</p><a href="/static/requirements-audit.md" download>항목별 점검표 다운로드 ↓</a><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>범위</th><th>상태</th><th>확인 내용</th></tr></thead><tbody>${audit.areas.map(x=>`<tr><td>${mh(x.name)}</td><td>${mh(x.status)}</td><td>${mh(x.note)}</td></tr>`).join('')}</tbody></table></div>`;$('#v-qa').prepend(section);};
RENDER.agent=async()=>{await marketData();mframe('가격 질의 Agent','연결 상태');$('#v-agent').innerHTML='<div class="mv mv-note"><h3>Agent 미연결</h3><p>현재 공개가격 조회와 원가·IRR 계산 화면을 사용할 수 있습니다. 자연어 조건 해석·후속 질문·공통 도구 호출 및 평가 연결은 아직 구현되지 않았습니다. 임시 답변을 실제 AI 결과로 표시하지 않습니다.</p><a href="#catalog">공개가격 조회 →</a></div>';};

function kstDay(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function renderHistoryCoverage(rows){
 const groups=new Map();for(const r of rows){const kind=r.source_kind==='spring'?'Spring DB 관측':r.import_batch?'SQL 백업 이력':r.source_kind==='historical'?'공식 과거 카탈로그':r.source_kind==='archive'?'아카이브':'현재가 수집';const key=r.provider_name+' · '+kind;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 const panel=document.createElement('section');panel.className='mv-note v02-coverage';
 panel.innerHTML=`<h3>확보한 이력의 범위</h3><p>가격 기록 수는 가격 변경 횟수나 수집 일수가 아닙니다. 현재가 응답의 과거 적용 시작일만으로 과거 시세를 확보했다고 보지 않습니다.</p><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>사업자 / 근거 유형</th><th>기록 / 오퍼</th><th>표시 기간 (KST)</th><th>기록이 있는 날짜 수</th></tr></thead><tbody>${[...groups].map(([label,rs])=>{const dates=[...new Set(rs.map(r=>kstDay(r.chart_at)))].sort();return `<tr><td>${mh(label)}</td><td>${rs.length}건 / ${new Set(rs.map(r=>r.offer_id)).size}개</td><td>${dates[0]} ~ ${dates.at(-1)}</td><td>${dates.length}일</td></tr>`;}).join('')||'<tr><td colspan="4">선택 기간의 근거 없음</td></tr>'}</tbody></table></div>${rows.some(r=>r.provider_name==='Azure'&&r.source_kind==='current')?'<p><b>Azure 현재가 수집</b>: API 조회 시점의 요금표입니다. 가격 적용 시작일이 오래됐어도 2~3년간의 가격 변동 기록을 뜻하지 않습니다.</p>':''}`;
 $('#v-trend .sk-comparison-chart').before(panel);
}
const qaBeforeOperations=RENDER.qa;
RENDER.qa=async()=>{
 await qaBeforeOperations();const data=await api('/api/erd/operations');const panel=document.createElement('section');panel.className='mv mv-note';
 const rows=data.targets;const now=Date.parse(data.assessed_at);const isOld=r=>!r.last_success_at||now-Date.parse(r.last_success_at)>48*3600000;
 panel.innerHTML=`<h3>수집 운영 상태</h3><p>매일 자동 수집은 미설정입니다. 마지막 성공과 최근 처리 결과를 따로 표시합니다. 전체 대상 ${rows.length}개 · 활성 대상 중 성공 시각 미확인/48시간 초과 ${rows.filter(r=>r.enabled&&isOld(r)).length}개.</p><details><summary>대상별 공개 상태·처리 상태·마지막 성공 확인</summary><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>대상</th><th>공개 상태</th><th>최근 처리 / 확인</th><th>마지막 전체 범위 성공</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${mh(r.provider_name)} · ${mh(r.model_name)}<span>${mh(r.region_filter||'대상 범위 기준')} · ${mh(r.contract_filter||'미지정')}</span><span>${r.enabled?'수집 대상 활성':'수집 보류'}</span></td><td>${erdDisclosure[r.disclosure_status]||'미확인'}</td><td>${erdStatusText[r.processing_status]||mh(r.processing_status||'미실시')}<span>${mtime(r.checked_at)}</span></td><td>${r.last_success_at?mtime(r.last_success_at):'성공 기록 없음'}<span>${isOld(r)?'최신성 확인 필요':'48시간 이내 성공'}</span></td></tr>`).join('')}</tbody></table></div></details><details><summary>저장된 점검 알림 ${data.alerts.length}건 (최근 최대 100건)</summary>${data.alerts.length?`<table class="mv-table"><thead><tr><th>시각</th><th>유형</th><th>사유</th><th>처리</th></tr></thead><tbody>${data.alerts.map(r=>`<tr><td>${mtime(r.detected_at)}</td><td>${mh(r.alert_type)}</td><td>${mh(r.reason)}</td><td>${mh(r.handling_status)}</td></tr>`).join('')}</tbody></table>`:'<p>저장된 알림 없음. 자동 점검이 실행됐거나 이상이 없음을 뜻하지 않습니다.</p>'}</details>`;
 $('#v-qa').prepend(panel);
 const spring=document.createElement('section');spring.className='mv mv-note';
 spring.innerHTML='<h3>Spring 수집·가격 이상 경고</h3><p>PostgreSQL에 저장된 경고입니다. 위 수집 대상 상태는 기존 SQLite 자료입니다.</p><div id="springAlerts" role="status">경고 목록을 불러오는 중입니다.</div>';
 panel.after(spring);
 let cursor=null, items=[];
 async function loadAlerts(next=false){
  const box=spring.querySelector('#springAlerts');if(!next)items=[];box.textContent='경고 목록을 불러오는 중입니다.';
  try {const {alertRows}=await import('/static/spring-operations.mjs');const query=new URLSearchParams({limit:'50'});if(next&&cursor)query.set('cursor',cursor);
    const result=alertRows(await api('/api/v1/operations/alerts?'+query));items.push(...result.items);cursor=result.nextCursor;
    box.innerHTML=`<p>조회 시각 ${mtime(result.asOf)} · ${items.length}건 표시${cursor?' · 추가 결과 있음':''}</p>${items.length?`<div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>감지 시각</th><th>유형</th><th>사유</th><th>처리 상태</th></tr></thead><tbody>${items.map(r=>`<tr><td>${mtime(r.detectedAt)}</td><td>${mh(r.alertType)}</td><td>${mh(r.reason)}</td><td>${mh(r.handlingStatus)}</td></tr>`).join('')}</tbody></table></div>`:'<p>저장된 경고가 없습니다. 수집 성공이나 이상 없음을 보장하지 않습니다.</p>'}${cursor?'<button type="button" class="mv-btn" id="springAlertsNext">다음 경고 보기</button>':''}`;
    box.querySelector('#springAlertsNext')?.addEventListener('click',()=>loadAlerts(true));
  } catch(error){box.textContent='Spring 경고 조회 실패: '+error.message;}
 }
 await loadAlerts();
};

RENDER.agent = async () => {
  await marketData();
  mframe('가격 분석 Agent', '질문으로 시장 가격과 근거를 확인하는 기능입니다.');
  $('#v-agent').innerHTML = `<div class="mv agent-workspace"><section class="agent-intro"><span class="agent-status">연결 준비 중</span><h2>시장 가격에 대해 질문하기</h2><p>Agent API가 아직 연결되지 않아 질문을 전송하거나 답변을 생성할 수 없습니다.</p><label for="agentQuestion">질문 입력</label><textarea id="agentQuestion" rows="3" disabled placeholder="Agent 연결 후 질문을 입력할 수 있습니다."></textarea><button type="button" class="mv-btn primary" disabled>질문 보내기</button><h3>질문 예시</h3><ul><li>B200의 사업자별 시간당 가격과 출처를 알려줘.</li><li>최근 수집된 B300 가격을 비교해줘.</li></ul></section><section class="agent-evidence"><h2>답변과 조회 근거</h2><p>연결 후 답변과 실제 조회한 가격, 출처 및 수집 시각을 구분하여 표시할 예정입니다.</p></section></div>`;
};
