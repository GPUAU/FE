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
 document.querySelectorAll('[data-usd]').forEach(el=>{
  let text=GpuFx.krwText(el.dataset.usd,V02.fx,V02.manualFx);
  const rate=GpuFx.appliedRate(V02.fx,V02.manualFx).rate;
  if(rate!==null && el.hasAttribute('data-krw-compact')) {
   const won=value=>Math.round(Number(value)*rate).toLocaleString('ko-KR')+'원';
   text=won(el.dataset.usd);
   if(el.hasAttribute('data-usd-upper'))text+='–'+won(el.dataset.usdUpper);
   text='약 '+text;
  }
  el.textContent=text;
 });
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
 const draft=panel.querySelector('#v02FxInput')?.value;
 const focusedId=panel.contains(document.activeElement)?document.activeElement.id:null;
 const source=d?.rate?.source_name;
 const sourceName=source&&/koreaexim/i.test(source)?'한국수출입은행':source||'출처 미제공';
 const status=applied.manual?'사용자 가정':loading?'조회 중':d?.status==='failed'?'조회 실패':!d?.rate?'미확보':d.stale?'오래된 공시':'자동 환율';
 const current=applied.rate!==null?`1 USD = ${applied.rate.toLocaleString('ko-KR',{maximumFractionDigits:6})} KRW`:loading?'환율 조회 중…':d?.status==='failed'?'환율 조회 실패':'환율 미확보';
 const date=applied.manual?'사용자 입력 · 공시 기준일 없음':d?.rate?`공시 기준일 ${d.rate.reference_date}`:'조회 출처 · 한국수출입은행';
 const warnings=[...(d?.stale?['환율 기준일이 4일을 초과했습니다. 오래된 환율로 환산 중입니다.']:[]),...(d?.warnings||[])];
 panel.setAttribute('aria-busy',String(loading));
 panel.innerHTML=`<div class="fx-display-head"><div class="fx-display-title"><span>USD → KRW</span><span class="fx-state ${applied.manual?'is-manual':d?.stale||d?.status==='failed'?'is-warning':''}">${mh(status)}</span><h2 id="fxSummaryCurrent">${mh(current)}</h2><p id="fxSummaryDate">${mh(date)}${!applied.manual&&d?.rate?' · '+mh(sourceName):''}</p></div><button type="button" class="mv-btn" id="v02FxRefresh" ${loading?'disabled':''}>${loading?'조회 중…':'환율 다시 조회'}</button></div>
 <div id="fxDisplayStatus" class="fx-display-status" role="status" aria-live="polite">${loading?'저장된 최신 환율을 확인하고 있습니다.':d?.reason?mh(d.reason):''}${applied.manual?' 사용자 입력값으로 환산 중입니다. 자동 환율과 원본 가격은 변경하지 않습니다.':''}${warnings.map(w=>`<p class="fx-warning">${mh(w)}</p>`).join('')}</div>
 <details class="fx-display-details" ${open?'open':''}><summary>환율 출처 · 사용자 환율 입력</summary><div class="fx-display-body"><div class="fx-provenance"><h3>자동 환율 정보</h3>${d?.rate?`<p><b>1 USD = ${Number(d.rate.rate).toLocaleString('ko-KR',{maximumFractionDigits:6})} KRW</b></p><p>공시 기준일 ${mh(d.rate.reference_date)} · ${mh(sourceName)}</p><p>수집 ${mh(fxCollectedAt(d.rate.collected_at))}</p>${d.rate.source_url?mlink(d.rate.source_url,'환율 출처 보기 ↗'): '<p>출처 링크 미제공</p>'}`:`<p>${d?.status==='failed'?'자동 환율 조회 실패':'자동 환율 미확보'}</p>`}<p>원화는 표시 환율로 재계산한 참고값이며, 과거 관측 당시의 원화 가격이 아닙니다. 차트와 CSV의 가격 기준은 USD입니다.</p><button type="button" class="mv-btn" id="v02Interest">금리 자료 보기</button></div><form id="v02FxForm"><label for="v02FxInput">사용자 환율 <span>KRW / USD</span></label><input id="v02FxInput" type="number" min="0.000001" step="any" inputmode="decimal" required placeholder="예: 1400 (가정값)" value="${V02.manualFx??''}" aria-describedby="v02FxNote"><div class="fx-form-actions"><button class="mv-btn" type="submit">적용</button><button class="mv-btn" type="button" id="v02FxReset">자동 환율로 복귀</button></div><small id="v02FxNote" role="status">${applied.manual?'사용자 가정 적용 중 · 새로고침하면 초기화':''}</small></form></div></details>`;
 if(draft!==undefined)panel.querySelector('#v02FxInput').value=draft;
 GpuFxHeader.update(d,V02.manualFx,loading);
 if(focusedId){const focused=document.getElementById(focusedId);if(focused&&!focused.disabled)focused.focus({preventScroll:true});}
 panel.querySelector('#v02FxRefresh').onclick=()=>mountFx(true);
 panel.querySelector('#v02Interest').onclick=openInterestRates;
 panel.querySelector('#v02FxForm').onsubmit=e=>{
  e.preventDefault();const value=GpuFx.positiveNumber(panel.querySelector('#v02FxInput').value);
  if(value===null){panel.querySelector('#v02FxNote').textContent='0보다 큰 유효한 환율을 입력하세요.';return;}
  V02.manualFx=value;paintFx(panel,Boolean(V02.fxPromise));refreshKrw();panel.querySelector('#v02FxInput').focus({preventScroll:true});
 };
 panel.querySelector('#v02FxReset').onclick=()=>{V02.manualFx=null;panel.querySelector('#v02FxInput').value='';paintFx(panel,Boolean(V02.fxPromise));refreshKrw();panel.querySelector('#v02FxReset').focus({preventScroll:true});};
}
async function mountFx(force=false){
 const host=GpuFxHeader.ensure();
 if(!host)return;
 let panel=document.querySelector('#v02Fx');
 if(!panel){panel=document.createElement('section');panel.id='v02Fx';panel.className='v02-fx';panel.setAttribute('aria-label','USD 원화 환율 정보');}
 if(panel.parentElement!==host)host.append(panel);
 const loading=force||!V02.fx||Boolean(V02.fxPromise);
 paintFx(panel,loading);
 if(loading){await fxData(force);if(panel.isConnected)paintFx(panel);}
 refreshKrw();
}
const beforeV02Frame=mframe;
mframe=(title,desc)=>{beforeV02Frame(title,desc);mountFx();};
// The header quote is available on every main-app route, including home and Agent.
mountFx();
// Repaint derived price amounts after route/filter rendering; never inspect raw amounts.
let v02PaintPending=false;
new MutationObserver(changes=>{if(changes.some(c=>[...c.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('[data-usd]')||n.querySelector?.('[data-usd]'))))&&!v02PaintPending){v02PaintPending=true;queueMicrotask(()=>{refreshKrw();v02PaintPending=false;});}}).observe(document.body,{childList:true,subtree:true});

const costRows=[['server','서버·GPU'],['memory','별도 메모리'],['network','네트워크·스토리지'],['rack','랙·전원·냉각 설비'],['rent','임차료'],['ops','운영·유지보수']];
const numberInput=(id,title,value='',step='any',placeholder='')=>`<label>${title}<input id="${id}" type="number" step="${step}" placeholder="${mh(placeholder)}" value="${mh(value??'')}"></label>`;
const fieldValue=id=>{const v=$('#'+id).value;return v===''?null:Number(v);};
function calculatorNote(){return `<div class="mv-note"><b>사용자 가정 계산 · 외부 전송 및 저장 없음</b><p>입력값은 현재 브라우저 메모리에서만 사용합니다. 새로고침하면 사라집니다. 실제 견적·수익 보장이 아닙니다. 원화 비용은 입력한 환율로 달러로 환산합니다.</p></div>`;}
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
RENDER.agent=async()=>{await marketData();mframe('가격 질의 Agent','연결 상태');$('#v-agent').innerHTML='<div class="mv mv-note"><h3>Agent 미연결</h3><p>현재 공개가격 조회와 원가·IRR 계산 화면을 사용할 수 있습니다. 자연어 조건 해석·후속 질문·공통 도구 호출 및 평가 연결은 아직 구현되지 않았습니다. 임시 답변을 실제 AI 결과로 표시하지 않습니다.</p><a href="#catalog">공개가격 조회 →</a></div>';};

function kstDay(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function renderHistoryCoverage(rows){
 const groups=new Map();for(const r of rows){const kind=r.source_kind==='spring'?'Spring DB 관측':r.import_batch?'SQL 백업 이력':r.source_kind==='historical'?'공식 과거 카탈로그':r.source_kind==='archive'?'아카이브':'현재가 수집';const key=r.provider_name+' · '+kind;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 const panel=document.createElement('section');panel.className='mv-note v02-coverage';
 panel.innerHTML=`<h3>확보한 이력의 범위</h3><p>가격 기록 수는 가격 변경 횟수나 수집 일수가 아닙니다. 현재가 응답의 과거 적용 시작일만으로 과거 시세를 확보했다고 보지 않습니다.</p><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>사업자 / 근거 유형</th><th>기록 / 오퍼</th><th>표시 기간 (KST)</th><th>기록이 있는 날짜 수</th></tr></thead><tbody>${[...groups].map(([label,rs])=>{const dates=[...new Set(rs.map(r=>kstDay(r.chart_at)))].sort();return `<tr><td>${mh(label)}</td><td>${rs.length}건 / ${new Set(rs.map(r=>r.offer_id)).size}개</td><td>${dates[0]} ~ ${dates.at(-1)}</td><td>${dates.length}일</td></tr>`;}).join('')||'<tr><td colspan="4">선택 기간의 근거 없음</td></tr>'}</tbody></table></div>${rows.some(r=>r.provider_name==='Azure'&&r.source_kind==='current')?'<p><b>Azure 현재가 수집</b>: API 조회 시점의 요금표입니다. 가격 적용 시작일이 오래됐어도 2~3년간의 가격 변동 기록을 뜻하지 않습니다.</p>':''}`;
 $('#v-trend .sk-comparison-chart').before(panel);
}
RENDER.agent = async () => {
  await marketData();
  mframe('가격 분석 Agent', '질문으로 시장 가격과 근거를 확인하는 기능입니다.');
  $('#v-agent').innerHTML = `<div class="mv agent-workspace"><section class="agent-intro"><span class="agent-status">연결 준비 중</span><h2>시장 가격에 대해 질문하기</h2><p>Agent API가 아직 연결되지 않아 질문을 전송하거나 답변을 생성할 수 없습니다.</p><label for="agentQuestion">질문 입력</label><textarea id="agentQuestion" rows="3" disabled placeholder="Agent 연결 후 질문을 입력할 수 있습니다."></textarea><button type="button" class="mv-btn primary" disabled>질문 보내기</button><h3>질문 예시</h3><ul><li>B200의 사업자별 시간당 가격과 출처를 알려줘.</li><li>최근 수집된 B300 가격을 비교해줘.</li></ul></section><section class="agent-evidence"><h2>답변과 조회 근거</h2><p>연결 후 답변과 실제 조회한 가격, 출처 및 수집 시각을 구분하여 표시할 예정입니다.</p></section></div>`;
};
