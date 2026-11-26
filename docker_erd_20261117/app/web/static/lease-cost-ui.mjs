import { BASE, FIELDS, activeFields, calculate, importSession } from './lease-cost-model.mjs?v=field-notes1126';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=1)=>Number(v).toLocaleString('ko-KR',{maximumFractionDigits:d});
const money=v=>Math.abs(v)>=1e8?`${num(v/1e8,2)}억원`:`${num(v,0)}원`;
const usd=v=>'$'+Number(v).toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2});
let selectedPanel='review';
let disposeTabs=()=>{};
const APP_FIELDS=['extra','residual','capitalRate','margin'];
let draft={...BASE},reasons={},origins={},memo='',model='혼합 세대 · 보고서 예시',importNotes=[],importConfirmed=true;
const source=k=>origins[k]||(draft[k]!==BASE[k]?'사용자 변경':APP_FIELDS.includes(k)?'앱 예시':'보고서 기준');
const reportSource='현대차증권 「인터넷/SW — SW/서비스의 겨울, AI인프라/네오클라우드의 봄」 본문 28쪽 (표지 2026.09.02)';
export function mountLeaseCost({host,onEdit,onResult,openQuote,session}){
 disposeTabs();
 if(session)selectedPanel='review';
 if(session){const imported=importSession(session);draft={...BASE,...imported.values};reasons={};origins=imported.origins;importNotes=imported.notes;importConfirmed=false;memo='';model=session.assumptions?.model_name||'청구서 분석에서 전달';}
 let last=null;
 const field=(k,options={})=>{const [label,unit,hint]=FIELDS[k];return `<label class="lc-field" data-field-wrap="${k}"><span class="lc-label">${label}<small data-source="${k}">${source(k)}</small></span><span class="lc-input"><input name="${k}" aria-label="${label}" type="number" min="${['gpuCount','years'].includes(k)?1:0}" step="${['gpuCount','years'].includes(k)?1:'any'}" value="${Number.isFinite(draft[k])?draft[k]:''}" ${options.max!=null?`max="${options.max}"`:''} required><span data-unit="${k}">${k==='ops'&&draft.opsMode==='annual'?'원/년':unit}</span></span><span class="lc-hint">${options.hint||hint}</span></label>`;};
 const select=(name,label,opts)=>`<label class="lc-field lc-select"><span class="lc-label">${label}</span><select name="${name}" aria-label="${label}">${opts.map(([v,t])=>`<option value="${v}" ${draft[name]===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
 host.innerHTML=`<div class="lc cp-page">
 <header class="cp-hero"><p class="cp-eyebrow">GPU 시세 인덱스</p><h1>원가 산정 · <em>판매가격 검토</em></h1><p>장비 투자와 운영비를 반영해 GPU 시간당 원가를 계산합니다.</p></header>
 <div class="lc-toolbar"><nav class="lc-local-nav" role="tablist" aria-label="시뮬레이션 검토 항목">${[['review','원가·가격 검토'],['evidence','가정과 근거']].map(([key,label],i)=>`<button type="button" role="tab" id="lc-tab-${key}" aria-controls="lc-panel-${key}" aria-selected="${key===selectedPanel}" tabindex="${key===selectedPanel?0:-1}" data-panel-tab="${key}">${label}</button>`).join('')}</nav><button type="button" class="lc-button lc-reset" data-reset>보고서 예시로 초기화</button></div>
 <div class="lc-basis"><p><b>데이터센터 임차형 GPUaaS</b> · 1MW / GPU 500개 예시 적용<br><span>토지·건물 건설비는 제외합니다. 장비와 임차 조건은 실제 계약에 맞게 수정하세요.</span></p><button type="button" data-jump="lc-evidence">산정 기준 보기 <span aria-hidden="true">↗</span></button></div>
 ${importNotes.length?`<aside class="lc-import"><b>청구서 분석 값이 반영되었습니다</b><ul>${importNotes.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><label><input type="checkbox" data-import-confirm ${importConfirmed?'checked':''}> 남아 있는 보고서 예시와 반영하지 않은 항목을 확인했습니다.</label></aside>`:''}
 <div class="lc-layout"><form class="lc-form" id="lc-inputs" novalidate>
 <section class="lc-section"><div class="lc-section-head"><h3>장비 및 임차 조건</h3></div>
 <label class="lc-model">검토 대상<input name="modelLabel" type="text" maxlength="100" value="${esc(model)}" aria-label="검토 대상"><small>모델명은 메모입니다. 변경해도 구매비·전력이 자동 변경되지 않습니다.</small></label>
 <div class="lc-fields">${field('gpuCount')}${field('gpuPrice')}${field('gpuKw')}${field('contractKw')}${field('fx')}${field('years')}</div>
 <div class="lc-capacity" data-capacity></div>
 <details class="lc-advanced"><summary>추가 투자·잔존가치·자본비용</summary><div class="lc-fields">${field('extra')}${field('residual')}${field('capitalRate')}</div><p>추가 장비도 같은 내용연수를 적용합니다. 자본비용률이 0%보다 크면 정액 감가상각 대신 자본회수비용을 원가에 반영하며, 둘을 중복 합산하지 않습니다.</p></details></section>
 <section class="lc-section"><div class="lc-section-head"><h3>임차료 및 운영비</h3></div>
 <div class="lc-fields">${select('rentMode','임차료 입력 방식',[['capacity','계약 용량 × 월 단가'],['annual','연간 총액 직접 입력']])}${field('rent')}${field('rentAnnual')}${select('opsMode','기타 운영비 입력 방식',[['capacity','MW당 연 운영비'],['annual','연간 총액 직접 입력']])}${field('ops')}</div>
 <div class="lc-subhead">전력비 <span>유료 판매율과 별도로 계산</span></div>
 <div class="lc-fields">${select('powerMode','전력비 반영 방식',[['estimate','IT 전력·PUE로 추정'],['actual','연간 청구 총액 입력'],['included','임차료에 전액 포함']])}${field('tariff')}${field('pue')}${field('powerLoad',{max:100})}${field('powerAnnual')}</div><p class="lc-footnote" data-power-note></p></section>
 <section class="lc-section"><div class="lc-section-head"><h3>판매 조건</h3></div><div class="lc-fields">${field('util',{max:100})}${field('price')}${field('margin',{max:99.99})}</div><p class="lc-footnote">장기 계약은 실제 사용량과 과금 시간이 다를 수 있습니다. 평균 판매단가는 각 계약의 <b>과금 시간 비중</b>으로 가중 평균하세요. 할인율은 자동 가정하지 않습니다.</p></section>
 </form>
 <aside class="lc-results" aria-label="원가 계산 결과"><div class="lc-result-head"><h3>원가·제안가</h3><span class="lc-live">GPU 1개 · 시간당</span></div><div data-result aria-live="polite" aria-atomic="true"></div></aside></div>
 <section class="lc-section lc-logic" id="lc-logic"><div class="lc-section-head"><h3>원가 산정 내역</h3><span>입력값과 산식을 함께 확인</span></div><div data-logic></div></section>
 <section class="lc-section lc-evidence" id="lc-evidence"><div class="lc-section-head"><h3>입력 가정과 근거</h3><span data-change-count></span></div><p class="lc-section-desc">보고서 가정·앱 예시·사용자 변경을 구분합니다. 변경 이유나 견적서 번호를 남기면 검토서에 함께 기록됩니다.</p><div class="lc-table-scroll"><table><thead><tr><th>항목</th><th>출발값</th><th>현재값 / 구분</th><th>근거와 선택 이유</th></tr></thead><tbody data-evidence></tbody></table></div>
 <label class="lc-memo">검토 목적·보고 메모<textarea name="reviewMemo" maxlength="3000" rows="2" placeholder="예: B300 도입 검토 · 장기 계약으로 판매율 80% 확보를 가정">${esc(memo)}</textarea></label>
 <details class="lc-reference"><summary>보고서별 역할과 원문 수치 확인</summary><div><p><b>원가 기준 · 현대차증권</b><br>${reportSource}. GPU 전력 2kW, 구매비 $38,000, 판매율 80%, 감가상각 6년 등은 분석 가정입니다. 특정 GPU의 현재 실견적이 아닙니다.</p><p><b>예시 재계산 안내</b><br>35만원 × 1,000kW × 12개월 = 연 임차료 42억원입니다(원문 43억원). 원문에 제시된 매출·비용을 빼도 EBITDA 114.4억원과 일치하지 않습니다. 이 화면은 원문의 결과값을 복사하지 않고 입력값으로 재계산합니다.</p><p><b>사업 범위 · 하나증권</b><br>데이터센터 리포트 본문 1~32쪽, 특히 28쪽 도표34의 DC 사업자/임차인 구분을 참고했습니다. 건설 비용은 임차형 사업의 직접 투자에서 제외합니다.</p><p><b>민감도 · 미래에셋증권</b><br>「AI Factory의 경제학」(2026.05.19) 13~17쪽의 가동률·판매단가·내용연수 관점을 참고했습니다. 1GW 건설형 TCO나 자본회수계수 24%를 이 모델에 그대로 적용하지 않습니다.</p></div></details></section>
 <section class="lc-section" id="lc-sensitivity"><div class="lc-section-head"><h3>판매율·감가상각 기간별 비교</h3><span>미래 예측이 아닌 조건별 계산</span></div><div data-sensitivity></div></section>
 <div class="lc-bottom"><p>입력값은 현재 브라우저 탭에서 유지됩니다. 새로고침하면 초기화되므로 필요한 검토서는 저장하세요.</p><button type="button" class="lc-button lc-primary" data-export>검토서 저장</button></div>
 </div>`;
 const tabs=document.getElementById('costTabs');
 if(tabs)host.querySelector('.cp-hero').after(tabs);
 const root=host.querySelector('.lc');
 const toolbar=root.querySelector('.lc-toolbar');
 const panels=[{key:'review',label:'원가·가격 검토'},{key:'evidence',label:'가정과 근거'}];
 const bottom=root.querySelector('.lc-bottom');
 const review=document.createElement('div');review.id='lc-panel-review';review.className='lc-panel';review.dataset.panel='review';
 const evidencePanel=document.createElement('section');evidencePanel.id='lc-panel-evidence';evidencePanel.className='lc-panel';evidencePanel.dataset.panel='evidence';
 [review,evidencePanel].forEach(panel=>{panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','lc-tab-'+panel.dataset.panel);panel.tabIndex=-1;});
 const contents=document.createElement('nav');contents.className='lc-review-contents';contents.setAttribute('aria-label','검토 화면 목차');
 contents.innerHTML=[['inputs','운영 조건'],['logic','산정 내역'],['sensitivity','조건별 비교']].map(([key,label],i)=>`<a href="#lc-chapter-${key}" data-jump="lc-${key}"><span>${i+1}</span> ${label}</a>`).join('');
 review.append(contents);
 [
  {key:'inputs',label:'운영 조건',description:'장비·임차료·판매 조건을 입력하고 오른쪽에서 원가와 제안가를 확인합니다.',nodes:'.lc-basis, .lc-import, .lc-layout'},
  {key:'logic',label:'산정 내역',description:'입력한 금액이 GPU 시간당 원가로 계산되는 과정을 확인합니다.',nodes:'#lc-logic'},
  {key:'sensitivity',label:'조건별 비교',description:'판매율과 감가상각 기간에 따라 원가가 얼마나 달라지는지 비교합니다.',nodes:'#lc-sensitivity'}
 ].forEach((p,i)=>{
  const chapter=document.createElement('section');chapter.id='lc-chapter-'+p.key;chapter.className='lc-chapter';chapter.tabIndex=-1;
  chapter.setAttribute('aria-labelledby','lc-heading-'+p.key);
  chapter.innerHTML=`<header class="lc-panel-heading"><div><span class="lc-chapter-number">${i+1}</span><h2 id="lc-heading-${p.key}">${p.label}</h2></div><p>${p.description}</p></header>`;
  root.querySelectorAll(p.nodes).forEach(node=>chapter.append(node));review.append(chapter);
 });
 // Keep calculation details and exports mounted when the evidence tab is hidden.
 evidencePanel.innerHTML='<header class="lc-panel-heading"><div><h2>가정과 근거</h2></div><p>보고서 기준과 변경한 값을 비교하고, 선택 이유를 기록합니다.</p></header>';
 evidencePanel.append(root.querySelector('#lc-evidence'));
 const back=document.createElement('footer');back.className='lc-panel-footer';
 back.innerHTML='<p>입력값과 근거 메모는 탭을 바꿔도 유지됩니다.</p><button type="button" class="lc-button" data-panel-go="review">← 원가·가격 검토로 돌아가기</button>';
 evidencePanel.append(back);
 const actions=document.createElement('div');actions.className='lc-end-actions';
 const evidenceButton=document.createElement('button');evidenceButton.type='button';evidenceButton.className='lc-button';evidenceButton.dataset.panelGo='evidence';evidenceButton.textContent='가정과 근거 확인';
 actions.append(evidenceButton,bottom.querySelector('[data-export]'));bottom.append(actions);review.append(bottom);
 root.append(review,evidencePanel);
 let reviewScrollY=null;
 function showPanel(key,{scroll=true,focusPanel=false}={}){
  if(!panels.some(p=>p.key===key))return;
  if(selectedPanel==='review'&&key==='evidence')reviewScrollY=window.scrollY;
  selectedPanel=key;
  root.querySelectorAll('[data-panel]').forEach(p=>{p.hidden=p.dataset.panel!==key;});
  root.querySelectorAll('[data-panel-tab]').forEach(b=>{const active=b.dataset.panelTab===key;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
  const panel=root.querySelector('#lc-panel-'+key);
  if(focusPanel)panel.focus({preventScroll:true});
  if(scroll){
   if(key==='review'&&reviewScrollY!==null)window.scrollTo({top:reviewScrollY,behavior:'instant'});
   else panel.scrollIntoView({behavior:'instant',block:'start'});
  }
 }
 const measureToolbar=()=>{
  root.style.setProperty('--lc-header-offset',`${Math.ceil(document.querySelector('.gnb')?.getBoundingClientRect().height||70)}px`);
  root.style.setProperty('--lc-toolbar-height',`${Math.ceil(toolbar.getBoundingClientRect().height)}px`);
 };
 const resizeObserver=new ResizeObserver(measureToolbar);
 resizeObserver.observe(toolbar);const header=document.querySelector('.gnb');if(header)resizeObserver.observe(header);
 const cleanup=()=>{resizeObserver.disconnect();window.removeEventListener('hashchange',cleanup);};
 window.addEventListener('hashchange',cleanup,{once:true});disposeTabs=cleanup;
 toolbar.addEventListener('keydown',event=>{
  const tab=event.target.closest('[data-panel-tab]');if(!tab)return;
  const buttons=[...toolbar.querySelectorAll('[data-panel-tab]')],i=buttons.indexOf(tab);
  const index={ArrowRight:(i+1)%buttons.length,ArrowLeft:(i+buttons.length-1)%buttons.length,Home:0,End:buttons.length-1}[event.key];
  if(index===undefined)return;
  event.preventDefault();buttons[index].focus({preventScroll:true});showPanel(buttons[index].dataset.panelTab);
 });
 measureToolbar();showPanel(selectedPanel,{scroll:false});
 const form=host.querySelector('form');
 const evidence=()=>{
  host.querySelector('[data-change-count]').textContent=`${activeFields(draft).filter(k=>['사용자 변경','청구서 분석'].includes(source(k))).length}개 입력 변경`;
  host.querySelector('[data-evidence]').innerHTML=activeFields(draft).map(k=>{const [label,unit,hint]=FIELDS[k],s=source(k);return `<tr><th>${label}<small>${k==='ops'&&draft.opsMode==='annual'?'원/년':unit}</small></th><td>${['rentAnnual','powerAnnual'].includes(k)||k==='ops'&&draft.opsMode==='annual'?'총액 직접 입력':num(BASE[k],4)}<small>${APP_FIELDS.includes(k)?'앱 예시':'보고서 기준'}</small></td><td><b>${Number.isFinite(draft[k])?num(draft[k],4):'미입력'}</b><small class="${s==='사용자 변경'?'lc-edited':''}">${s}</small></td><td><p>${hint}</p><input type="text" maxlength="500" data-reason="${k}" aria-label="${label} 선택 이유" value="${esc(reasons[k]||'')}" placeholder="선택 이유·견적 출처 메모"></td></tr>`;}).join('');
 };
 const syncModes=()=>{
  const active=new Set(activeFields(draft));
  host.querySelectorAll('[data-field-wrap]').forEach(w=>{const k=w.dataset.fieldWrap;w.hidden=!active.has(k);w.querySelector('input').disabled=w.hidden;w.querySelector('[data-source]').textContent=source(k);w.querySelector('[data-source]').classList.toggle('lc-edited',source(k)==='사용자 변경');});
  host.querySelector('[data-unit="ops"]').textContent=draft.opsMode==='annual'?'원/년':'원/MW·년';
  host.querySelector('[data-power-note]').textContent=draft.powerMode==='included'?'전기료가 임차료에 전액 포함된 계약만 선택하세요. 별도 전기료를 0원 처리합니다.':draft.powerMode==='actual'?'연간 청구 총액을 그대로 반영합니다. PUE·전력 부하율을 다시 곱하지 않습니다.':'GPU 수 × GPU당 IT 전력 × PUE × 전력 부하율 × 8,760시간 × 전력단가. 판매율이 낮아져도 전력비는 자동 감소하지 않습니다.';
 };
 function update(){
  onEdit?.();last=null;syncModes();evidence();
  host.querySelector('[data-capacity]').textContent=Number.isFinite(draft.gpuCount*draft.gpuKw)?`장비 IT 전력 ${num(draft.gpuCount*draft.gpuKw)}kW / 임차 ${num(draft.contractKw)}kW · 임차 용량은 판매율과 무관하게 과금`:'장비와 임차 용량을 입력하세요.';
  try{last=calculate(draft);renderResults(last);if(importConfirmed)onResult?.(last);}
  catch(error){last=null;host.querySelector('[data-result]').innerHTML=`<div class="lc-error" role="alert"><b>입력값을 확인하세요</b><p>${esc(error.message)}</p></div>`;host.querySelector('[data-logic]').textContent='입력값을 확인하면 실제 숫자가 들어간 계산 과정을 표시합니다.';host.querySelector('[data-sensitivity]').textContent='유효한 입력값이 필요합니다.';}
  host.querySelector('[data-export]').disabled=!last||!importConfirmed;
 }
 function renderResults(r){
  const x=draft,parts=[['장비 비용 회수',r.capital,'#34353a'],['상면·설비',r.rent,'#ea002c'],['전력',r.power,'#ff7600'],['기타 운영',r.ops,'#c6c7cc']];
  host.querySelector('[data-result]').innerHTML=`<div class="lc-price"><span>${x.capitalRate>0?'자본회수 포함':'감가상각 포함'} 원가</span><strong>${usd(r.cost)}<small>/GPU·h</small></strong><p>${num(r.cost*x.fx,0)}원 · 판매 시간 기준</p></div><div class="lc-candidate"><span>제안가 · 목표 마진 ${num(x.margin)}%</span><strong>${usd(r.candidate)}</strong><small>원가 ÷ (1 − ${num(x.margin)}%)</small></div><div class="lc-costbar" aria-label="연간 비용 구성">${parts.map(([l,v,c])=>`<span title="${l} ${money(v)}" style="width:${r.total?v/r.total*100:0}%;background:${c}"></span>`).join('')}</div><dl class="lc-breakdown">${parts.map(([l,v,c])=>`<div><dt><i style="background:${c}"></i>${l}</dt><dd>${usd(v/r.hours/x.fx)}</dd></div>`).join('')}</dl><div class="lc-verdict"><b>검토 판매단가 ${usd(x.price)}</b><p>${r.actualMargin===null?'판매단가가 0이어서 마진율을 산출할 수 없습니다.':`현재 마진 ${num(r.actualMargin)}% · 목표 ${r.actualMargin+1e-8>=x.margin?'충족':'미달'}`}</p><small>원가 회수에 필요한 판매율 ${r.breakeven===null?'산출 불가':num(r.breakeven)+'%'+(r.breakeven>100?' · 100% 초과':'')}</small></div><button type="button" class="lc-button lc-primary" data-quote ${importConfirmed?'':'disabled'}>계약 견적에 적용</button><button type="button" class="lc-textbutton" data-jump="lc-logic">상세 산식 보기</button><p class="lc-result-note">${importConfirmed?'현재 입력 조건의 계산값입니다. 시장 수용성·차입이자·세금·중간 교체투자는 별도 검토합니다.':'청구서에서 가져온 값과 남은 예시를 먼저 확인하세요.'}</p>`;
  host.querySelector('[data-quote]').onclick=()=>{if(last&&importConfirmed)openQuote?.();};
  host.querySelector('[data-logic]').innerHTML=`<div class="lc-equation"><div><small>연간 비용 합계</small><b>${money(r.total)}</b><span>임차 + 전력 + 운영 + 장비 회수</span></div><i>÷</i><div><small>연간 유료 GPU 시간</small><b>${num(r.hours,0)} h</b><span>${num(x.gpuCount)}개 × 8,760h × ${num(x.util)}%</span></div><i>÷</i><div><small>적용 환율</small><b>${num(x.fx)}원</b><span>1 USD 기준</span></div><i>＝</i><div class="lc-equation-answer"><small>GPU 시간당 원가</small><b>${usd(r.cost)}</b><span>후보가격 ${usd(r.candidate)}</span></div></div>
  <div class="lc-logic-columns"><div><h4>연간 비용을 만드는 산식</h4><dl class="lc-formulas"><div><dt>장비 취득비</dt><dd>${num(x.gpuCount)} × $${num(x.gpuPrice)} × ${num(x.fx)}원 + ${money(x.extra)}<b>${money(r.capex)}</b></dd></div><div><dt>장비 비용 회수</dt><dd>${x.capitalRate===0?`(${money(r.capex)} − ${money(x.residual)}) ÷ ${x.years}년`:`잔존가치를 할인한 투자금 × CRF(${num(x.capitalRate)}%, ${x.years}년)`}<b>${money(r.capital)}/년</b></dd></div><div><dt>상면·설비 임차료</dt><dd>${x.rentMode==='annual'?'연 계약 총액 직접 입력':`${num(x.contractKw)}kW × ${num(x.rent)}원 × 12개월`}<b>${money(r.rent)}/년</b></dd></div><div><dt>전력비</dt><dd>${x.powerMode==='included'?'임차료에 전액 포함 · 별도 가산 없음':x.powerMode==='actual'?'연 청구 총액 · PUE 추가 적용 없음':`${num(r.itKw)}kW × ${num(x.pue)} × ${num(x.powerLoad)}% × 8,760h × ${num(x.tariff)}원`}<b>${money(r.power)}/년</b></dd></div><div><dt>기타 운영비</dt><dd>${x.opsMode==='annual'?'연간 총액 직접 입력':`${num(x.contractKw/1000,3)}MW × ${money(x.ops)}`}<b>${money(r.ops)}/년</b></dd></div></dl></div><div><h4>검토 판매단가 ${usd(x.price)}의 연간 결과</h4><dl class="lc-totals">${[['매출',r.revenue],['현금 운영비',r.opex],['EBITDA',r.ebitda],['정액 감가상각',r.dep],['영업이익',r.ebit],['자본회수 후 잉여',r.surplus]].map(([l,v])=>`<div><dt>${l}</dt><dd>${money(v)}</dd></div>`).join('')}</dl><p class="lc-footnote">매출 = 유료 GPU 시간 × 판매단가 × 환율.<br>영업이익은 정액 감가상각 기준, 후보가격은 선택한 장비 회수 방식 기준입니다. 초기 투자비를 매년 전액 차감하지 않습니다.</p><details><summary>자본회수와 마진의 정의</summary><p>CRF = r ÷ [1 − (1+r)<sup>−n</sup>]. 연 자본회수비용 = [투자비 − 잔존가치 ÷ (1+r)<sup>n</sup>] × CRF. r=0이면 정액 감가상각과 같습니다.</p><p>목표 마진은 (매출 − 원가) ÷ 매출입니다. 원가에 일정 비율을 더하는 가산율과 다릅니다. 별도 차입이자는 포함하지 않습니다.</p></details></div></div>`;
  const us=[...new Set([50,65,80,95,x.util])].sort((a,b)=>a-b),ys=[...new Set([3,5,6,x.years])].sort((a,b)=>a-b);
  host.querySelector('[data-sensitivity]').innerHTML=`<div class="lc-table-scroll"><table class="lc-matrix"><caption>판매율·감가상각 기간별 GPU 시간당 원가 (USD)</caption><thead><tr><th>유료 판매율</th>${ys.map(y=>`<th>${y}년</th>`).join('')}</tr></thead><tbody>${us.map(u=>`<tr><th>${num(u)}%</th>${ys.map(y=>{const c=calculate({...x,util:u,years:y});return `<td class="${u===x.util&&y===x.years?'lc-selected':''}">${usd(c.cost)}${u===x.util&&y===x.years?'<small>현재 가정</small>':''}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div><p class="lc-footnote">임차 용량·장비 구매비·전력 부하·운영비·잔존가치·자본비용률은 고정합니다. 감가상각 기간 변경은 교체 시점을 예측하지 않으며, 미래 가격·수요 예측이나 목표 IRR 결과가 아닙니다.</p>`;
 }
 form.addEventListener('input',event=>{const el=event.target,k=el.name;if(k==='modelLabel'){model=el.value;return;}if(k in FIELDS){draft[k]=el.value===''?NaN:Number(el.value);origins[k]='사용자 변경';update();}});
 form.addEventListener('change',event=>{const el=event.target,k=el.name;if(!['rentMode','powerMode','opsMode'].includes(k))return;
  // Keep the currently entered annual cost when switching denomination.
  const prior=last;draft[k]=el.value;
  if(k==='opsMode'&&prior){draft.ops=el.value==='annual'?prior.ops:prior.ops/draft.contractKw*1000;origins.ops='사용자 변경';form.elements.ops.value=draft.ops;}
  if(k==='rentMode'&&prior){const f=el.value==='annual'?'rentAnnual':'rent';draft[f]=el.value==='annual'?prior.rent:prior.rent/draft.contractKw/12;origins[f]='사용자 변경';form.elements[f].value=draft[f];}
  if(k==='powerMode'&&el.value==='actual'&&prior){draft.powerAnnual=prior.power;origins.powerAnnual='사용자 변경';form.elements.powerAnnual.value=draft.powerAnnual;}
  update();});
 host.oninput=event=>{if(event.target.dataset.reason)reasons[event.target.dataset.reason]=event.target.value;if(event.target.name==='reviewMemo')memo=event.target.value;};
 form.onsubmit=event=>{event.preventDefault();update();};
 host.onclick=event=>{
  const tab=event.target.closest('[data-panel-tab]');
  if(tab){showPanel(tab.dataset.panelTab);return;}
  const next=event.target.closest('[data-panel-go]');
  if(next){showPanel(next.dataset.panelGo,{focusPanel:true});return;}
  const jump=event.target.closest('[data-jump]');
  if(jump){
   event.preventDefault();
   if(jump.dataset.jump==='lc-evidence'){showPanel('evidence',{focusPanel:true});return;}
   const key={'lc-inputs':'inputs','lc-logic':'logic','lc-sensitivity':'sensitivity'}[jump.dataset.jump];
   if(key){showPanel('review',{scroll:false});const chapter=root.querySelector('#lc-chapter-'+key);chapter.focus({preventScroll:true});chapter.scrollIntoView({behavior:'instant',block:'start'});}
  }
 };
 host.querySelector('[data-reset]').onclick=()=>{const tabs=document.getElementById('costTabs');if(tabs)host.before(tabs);selectedPanel='review';draft={...BASE};reasons={};origins={};memo='';model='혼합 세대 · 보고서 예시';importNotes=[];importConfirmed=true;mountLeaseCost({host,onEdit,onResult,openQuote});};
 host.querySelector('[data-import-confirm]')?.addEventListener('change',e=>{importConfirmed=e.target.checked;update();});
 host.querySelector('[data-export]').onclick=()=>{
  if(!last||!importConfirmed)return;
  const table=activeFields(draft).map(k=>`<tr><th>${FIELDS[k][0]}</th><td>${num(draft[k],4)} ${k==='ops'&&draft.opsMode==='annual'?'원/년':FIELDS[k][1]}</td><td>${source(k)}</td><td>${esc(FIELDS[k][2])}<br>${esc(reasons[k]||'변경 사유 미기재')}</td></tr>`).join('');
  const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>GPUaaS 원가 검토서</title><style>body{font:15px/1.7 system-ui,sans-serif;max-width:1080px;margin:40px auto;padding:24px;color:#25262b}h1{border-bottom:3px solid #d35428;padding-bottom:20px}table{width:100%;border-collapse:collapse}th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd}small{display:block;color:#74757b}.lc-equation,.lc-logic-columns{display:flex;gap:24px;flex-wrap:wrap}.lc-equation>div{padding:16px;background:#f5f5f7}.lc-formulas div,.lc-totals div{padding:8px;border-bottom:1px solid #ddd}dd{margin:0}dd b{display:block}.lc-selected{background:#fff0e5}button,input,summary{display:none}details{display:block}@media print{body{margin:0}tr{break-inside:avoid}}</style><h1>임차형 GPUaaS 원가·후보가격 검토서</h1><p>${esc(model)} · ${new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST</p><p>보고서 가정과 사용자 입력으로 계산한 시나리오이며 실견적·미래 예측이 아닙니다. 토지·건물 건설, 별도 차입이자·세금·중간 교체투자는 제외했습니다.</p><p><b>검토 메모</b><br>${esc(memo||'미기재').replace(/\n/g,'<br>')}</p><h2>계산 결과와 산식</h2>${host.querySelector('[data-logic]').innerHTML.replaceAll('<details>', '<div>').replaceAll('</details>', '</div>')}<h2>입력 가정과 근거</h2><p>임차료 방식: ${draft.rentMode==='annual'?'연 총액':'계약 용량 × 월 단가'} · 전력비 방식: ${{estimate:'IT 전력·PUE 추정',actual:'연 청구 총액',included:'임차료에 전액 포함'}[draft.powerMode]} · 운영비 방식: ${draft.opsMode==='annual'?'연 총액':'MW당 연 운영비'}</p><table><tr><th>항목</th><th>적용값</th><th>구분</th><th>근거·선택 이유</th></tr>${table}</table><h2>민감도</h2>${host.querySelector('[data-sensitivity]').innerHTML}<h2>참고 자료와 재계산 안내</h2>${host.querySelector('.lc-reference>div').innerHTML}</html>`;
  const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='GPUaaS_cost_review.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 update();
}
