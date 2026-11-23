/* Task-oriented inner workspace. Home and login keep their existing design. */
const READABLE_PAGES = {
  dashboard:['시세 분석','GPU 가격 비교','모델과 계약 조건을 고르고, 상품의 가격과 근거를 확인하세요.'],
  compare:['시세 분석','계약 조건별 가격 비교','같은 계약 조건의 가격을 나란히 보고 비교 기준을 바꿔보세요.'],
  trend:['시세 분석','가격 추이와 관측 이력','수집된 과거 가격에서 변화의 시점과 관측 범위를 확인하세요.'],
  agent:['AI 질의','Pricing Copilot','GPU 가격과 상품 조건을 질문하고 출처를 확인합니다.'],
  cost:['원가 분석','원가와 제안가 점검','입력한 원가·가동률 가정으로 손익분기점과 제안가를 확인하세요.'],
  bizcase:['사업성 검토','사업성 시나리오','가정을 직접 조정하고, 시나리오에 따라 달라지는 결과를 확인하세요.'],
  discounts:['시세 분석','계약기간별 할인 비교','온디맨드와 짝이 있는 상품의 할인과 비교 조건을 확인하세요.'],
  favorites:['시세 분석','관심 사업자 모아보기','관심 사업자의 가격과 관측 상태를 한곳에서 확인하세요.'],
  qa:['품질 관리','데이터 품질 확인','수집·환산·답변의 정확도와 확인이 필요한 항목을 살펴보세요.'],
  inquiries:['문의','워크스페이스 문의','이 워크스페이스에서 함께 확인하는 문의와 답변입니다.']
};
const NAV_ICONS={gMarket:'M3 17l6-6 4 3 8-10M15 4h6v6',gCost:'M5 4h14v16H5zM8 8h8M8 12h3M14 12h2M8 16h3M14 16h2',gBiz:'M4 20V10h4v10M10 20V4h4v16M16 20v-8h4v8',gAi:'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',gQuality:'M12 3l8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6zM8 12l3 3 5-6',gSettings:'M4 5h16v12H9l-5 4z',gAdmin:'M6 9V6a6 6 0 0 1 12 0v3M4 9h16v12H4z'};
function prepareReadableNav(){
 const nav=$('.snb-nav');if(nav.dataset.readable)return;nav.dataset.readable='true';
 let group=null;
 [...nav.children].forEach(node=>{
  if(node.classList.contains('snb-grp')){
   group=document.createElement('details');group.className='nav-section';group.dataset.navGroup=node.dataset.i18n;
   if(node.hasAttribute('data-admin')){group.setAttribute('data-admin','');group.hidden=node.hidden;}
   const summary=document.createElement('summary'),icon=document.createElement('span');icon.className='nav-icon';icon.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${NAV_ICONS[node.dataset.i18n]||NAV_ICONS.gSettings}"/></svg>`;
   summary.append(icon,node);const arrow=document.createElement('span');arrow.className='nav-chevron';arrow.textContent='⌄';summary.append(arrow);group.append(summary);nav.append(group);
  }else if(group){group.append(node);}
 });
}
function updateReadableShell(view){
 const previousView=document.body.dataset.page;document.body.dataset.page=view;prepareReadableNav();
 const pg=READABLE_PAGES[view];$('#pageEyebrow').textContent=pg?.[0]||'GPU 시세 인덱스';
 if(pg&&lang==='ko'){$('#pageTitle').textContent=pg[1];$('#pageDesc').textContent=pg[2];}
 $('#currencyLabel').textContent=state.cur;
 $('#displaySettings').hidden=!PAGES[view]?.tools;
 $('.page-data').hidden=['home','agent','inquiries','users','db','admin-inquiries','qa'].includes(view);
 const activeKey=GRP_KEY[PAGES[view]?.grp];
 document.querySelectorAll('.nav-section').forEach(el=>{el.open=el.dataset.navGroup===activeKey;el.classList.toggle('active-group',el.open);});
 if(view==='home')return;
 const at=state.meta?.run?.started_at,old=at&&(Date.now()-Date.parse(at))/3600000>(state.meta.fresh_hours||48);
 const ctx=$('#dataContext');ctx.hidden=['inquiries','users','db','admin-inquiries'].includes(view);
 if(!ctx.hidden){
  ctx.className='data-context readable-context'+(old?' aged':'');
  ctx.innerHTML=`<span class="context-label">${['cost','bizcase'].includes(view)?'시장가격 수집 시점':'DB 적재 시점'}</span><b>${esc(fullAt(at))}</b>${old?'<span class="status-chip attention">현재보다 오래된 관측값</span>':''}<span class="context-demo">${['cost','bizcase'].includes(view)?'입력 가정 기반 계산 · 시연 데이터 포함':'공개 피드 기반 가격 · 상품 조건별 참고 비교'}</span>`;
 }
 if(view==='agent'){$('#agentDesc').textContent='';}
 if(view==='dashboard'&&lang==='ko')$('#dashCsv').textContent='비교 결과 저장 ↓';
 if(previousView!==view)document.querySelectorAll('.display-settings[open]').forEach(x=>x.open=false);
}
function readableModelPicker(el,value,onSelect){
 const all=[...new Set([...(state.meta.catalog_models||[]),...(state.meta.models||[])])],targets=all.filter(m=>state.meta.gpu_models?.[m]?.priority==='main'),refs=all.filter(m=>!targets.includes(m));
 const button=m=>`<button class="model-option" type="button" data-v="${esc(m)}" aria-label="${esc(m)}" aria-pressed="${m===value}"><b>${esc(m)}</b><small>${esc(state.meta.gpu_models?.[m]?.priority==='main'?'메인 우선순위':'참조')}</small><span class="model-check">✓</span></button>`;
 el.innerHTML=`<div class="target-models">${targets.map(button).join('')}</div>${refs.length?`<details class="reference-models" ${refs.includes(value)?'open':''}><summary>참조 모델 비교 <span>⌄</span></summary><div class="reference-chips">${refs.map(m=>`<button type="button" class="chip" data-v="${esc(m)}" aria-pressed="${m===value}">${esc(m)} <small>참고</small></button>`).join('')}</div></details>`:''}`;
 el.onclick=e=>{const b=e.target.closest('button[data-v]');if(b)onSelect(b.dataset.v);};
}
function setDashboardPending(f){
 $('#v-dashboard').setAttribute('aria-busy','true');state.dashRows=[];$('#dashCsv').disabled=true;
 $('#selectionSummary').innerHTML=`<div class="result-heading"><span class="step-label">02 / 비교 결과</span><h2>${esc(f.model)} · ${esc(termL(f.term))}</h2></div><span class="result-count">가격을 불러오는 중…</span>`;
 $('#kpis').innerHTML='<div class="result-loading" role="status"><i></i>선택한 조건의 가격을 확인하고 있습니다.</div>';
 $('#dashTbl').innerHTML='';$('#dashCount').textContent='';$('#comparisonChart').hidden=true;$('#singleOfferNote').hidden=true;
}
function priceObservationStatus(r){
 const hours=r.collected_at?(Date.now()-Date.parse(r.collected_at))/3600000:null;
 const old=hours!=null&&hours>(state.meta.fresh_hours||48);
 const failed=r.status==='FAILED';
 const collected=failed?'수집 실패 · 직전 값':r.status==='PRIVATE'?'가격 미공개':r.normalized_price_usd==null?'환산값 없음':r.status==='STALE'?'회차 기준 오래됨':'수집 성공';
 return `<span class="status-chip ${failed?'danger':r.normalized_price_usd==null?'attention':'neutral'}">${esc(collected)}</span>${old?'<span class="observation-age">과거 관측값</span>':''}<small class="observed-at">${r.collected_at?esc(shortAt(r.collected_at))+' KST':'수집 시각 미확인'}</small>`;
}
function readableRawPrice(r){
 if(r.raw_price==null)return '<span class="missing-value">미제공</span>';
 const currency=r.raw_currency==='USD'?'$':r.raw_currency==='KRW'?'₩':esc(r.raw_currency||'');
 const period={HOUR:'시간',MONTH:'월',YEAR:'연'}[r.billing_unit];
 const basis=r.price_basis==='PER_GPU'?'GPU':r.price_basis==='PER_INSTANCE'?'인스턴스':r.price_basis==='PER_NODE'?'노드':null;
 return `<b>${currency}${Number(r.raw_price).toLocaleString('en-US',{maximumFractionDigits:4})}</b><small>${[basis,period].filter(Boolean).join(' · ')||'원본 단위 미제공'}</small>`;
}
function renderReadableDashboard(d){
 const rows=d.rows,k=d.kpi,valid=rows.filter(r=>r.normalized_price_usd!=null&&!r.stale),providers=new Set(valid.map(r=>r.provider_id));
 $('#v-dashboard').removeAttribute('aria-busy');$('#dashCsv').disabled=!rows.length;$('#providerFilterLabel').textContent=state.f.ptype==='ALL'?'전체':typeL(state.f.ptype);
 $('#selectionSummary').innerHTML=`<div class="result-heading"><span class="step-label">02 / 비교 결과</span><h2>${esc(state.f.model)} <span>· ${esc(termL(state.f.term))}</span></h2></div><div class="result-count"><b>${rows.length}개 상품</b><span>회차 기준 유효 ${valid.length}개 · ${providers.size}개 사업자</span></div>`;
 if(k?.count){
  $('#kpis').innerHTML=`<div class="market-price-main"><div class="summary-label">관측 최저가 <span>${esc(termL(state.f.term))} · ${state.f.region==='ALL'?'전체 지역':esc(state.f.region)}</span></div><div class="price-headline">${money(k.min)}<span>/ GPU·시간</span></div><div class="price-provider">${k.cheapest.map(r=>esc(r.provider_name)).join(' · ')}<span>수집 회차 안에서의 가격 비교</span></div>${k.count>1?`<div class="price-range"><span>중앙값 <b>${money(k.median)}</b></span><span>최고가 <b>${money(k.max)}</b></span><span>평균 <b>${money(k.mean)}</b></span></div>`:''}</div><div class="market-coverage"><span class="summary-label">이 비교를 읽는 방법</span><h3>${providers.size<3?'비교할 사업자가 더 필요합니다':'표본과 조건을 함께 확인하세요'}</h3><p>${providers.size<3?`현재 유효 가격은 ${providers.size}개 사업자에서 확인됐습니다. 시장 전체의 대표가격으로 해석하기에는 표본이 적습니다.`:`${providers.size}개 사업자의 유효 상품 ${valid.length}개를 비교합니다. 모델이 같아도 메모리·GPU 수·지역·지원 조건은 다를 수 있습니다.`}</p><div class="coverage-stats"><span>사업자 <b>${providers.size}곳</b></span><span>유효 상품 <b>${valid.length}개</b></span><span>조건 차이 <b>상품 근거에서 확인</b></span></div></div>`;
 }else{
  const unknown=rows.filter(r=>r.normalized_price_usd==null).length;
  $('#kpis').innerHTML=`<div class="no-observations"><span class="no-observation-icon">∅</span><div><h3>선택한 조건의 유효 가격이 없습니다.</h3><p>${unknown?`${unknown}개 상품에 가격 미공개·환산 불가 상태가 있습니다. 아래에서 이유를 확인하세요.`:rows.length?'이전 관측값은 아래에서 확인할 수 있습니다. 회차 기준 통계에는 포함되지 않습니다.':'모델·계약·지역 조건을 바꿔 다시 확인해 보세요.'} 가격이 없다는 것은 0원을 의미하지 않습니다.</p><button type="button" class="text-action" data-focus-filter>비교 조건 다시 선택하기 ↑</button></div></div>`;
 }
 $('#dashCount').textContent=`${rows.length}개 상품 · ${state.cur==='KRW'?'표시용 환율을 적용한 KRW':'USD'} / GPU·시간`;
 $('#dashTbl').innerHTML=`<caption class="sr">선택 조건의 상품별 가격, 수집 상태와 출처 근거</caption><thead><tr><th scope="col">사업자 · 상품 구성</th><th scope="col">이용 조건</th><th scope="col">원본 가격</th><th scope="col" class="n">환산 단가</th><th scope="col">관측 상태</th><th scope="col"><span class="sr">가격 근거</span></th></tr></thead><tbody>${rows.map((r,i)=>`<tr class="${r.stale||r.normalized_price_usd==null?'reference-offer':''}"><td><div class="offer-provider">${starBtn(r.provider_id,r.provider_name)}<b>${esc(r.provider_name)}</b>${!r.stale&&r.normalized_price_usd===k?.min?'<span class="lowest-label">관측 최저</span>':''}</div><span class="offer-product">${esc(r.raw_product_name)}</span><span class="offer-spec">${r.gpu_count?esc(r.gpu_count)+' GPU':'GPU 수 미확인'} · ${esc(typeL(r.provider_type))}</span></td><td><b>${esc(r.region||'지역 미확인')}</b><small>${esc(termL(r.contract_term||state.f.term))}</small></td><td class="original-price">${readableRawPrice(r)}</td><td class="n offer-price"><b>${r.normalized_price_usd==null?'—':money(r.normalized_price_usd)}</b><small>${r.normalized_price_usd==null?esc(r.reason||'환산값 없음'):'/ GPU·시간'}</small></td><td>${priceObservationStatus(r)}</td><td><button type="button" class="evidence-action" data-evidence="${i}" aria-label="${esc(r.provider_name)} ${esc(r.raw_product_name)} 가격 근거 보기">근거 보기 <span>↗</span></button></td></tr>`).join('')||'<tr><td colspan="6"><div class="empty-offers">조건에 맞는 상품이 아직 수집되지 않았습니다.</div></td></tr>'}</tbody>`;
 $('#dashTbl').onclick=e=>{const b=e.target.closest('[data-evidence]');if(b)showEvidence(state.dashRows[+b.dataset.evidence],state.f.model);else onStarClick(e);};
 $('#comparisonChart').hidden=rows.filter(r=>r.normalized_price_usd!=null).length<2;
 $('#singleOfferNote').hidden=valid.length!==1;
 $('#singleOfferNote').innerHTML='<span>ⓘ</span><p><b>가격이 한 건일 때는 상품의 근거가 더 중요합니다.</b> 위의 근거 보기에서 원본 단위와 GPU 수, 출처를 확인하세요.</p>';
 $('#barBox').hidden=false;
}
function enhanceReadableAnswer(box,result){
 const names={TOOL_Q1:'시장 가격 조회',TOOL_Q2:'약정 가격 비교',TOOL_Q3:'원가 이벤트 관측',TOOL_Q4:'상품 변화 확인',TOOL_Q5:'원가·제안가 점검',CLARIFY:'조건을 먼저 확인할게요'};
 const hd=box.querySelector('.hd');
 if(hd)hd.innerHTML=`<span class="answer-mark">✦</span><b>${names[result.route]||'가격 조회 결과'}</b><span class="answer-proof">${result.route==='CLARIFY'?'확인 후 조회':result.used_llm?'출처와 함께 확인하세요':'수집 데이터 기반'}</span>`;
 box.classList.add('readable-answer');
 if(['TOOL_Q1','TOOL_Q2'].includes(result.route)){
  const note=document.createElement('div');note.className='answer-scope-note';
  note.innerHTML=result.route==='TOOL_Q1'?'이 조회는 온디맨드·스팟과 집계 사이트 가격이 함께 포함될 수 있습니다. 동일 조건의 견적으로 해석하지 마세요. <a href="#dashboard">조건별 가격 비교 ↗</a>':'약정 비교는 사업자별 참고 결과입니다. 지역·구성 일치와 출처·수집 시각을 확인한 후 사용하세요. <a href="#dashboard">상품별 근거 확인 ↗</a>';
  if(hd)hd.after(note);else box.prepend(note);
 }
}
$('#resetDashFilters').onclick=()=>{state.f={model:(state.meta.catalog_models||['B200'])[0],term:'ON_DEMAND',region:'ALL',ptype:'ALL'};renderDash();};
$('#askIn').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#askForm').requestSubmit();}});
document.addEventListener('click',e=>{if(e.target.closest('[data-focus-filter]')){$('#fModel button')?.focus();$('.explorer-controls').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}});
$('#comparisonChart').addEventListener('toggle',()=>{if($('#comparisonChart').open)charts.barChart?.resize();});
