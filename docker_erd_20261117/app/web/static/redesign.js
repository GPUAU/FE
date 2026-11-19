/* Shared product interactions: responsive navigation and traceable price evidence. */
function safeSource(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function fullAt(value){if(!value)return '미확인';const d=new Date(value);return Number.isNaN(+d)?String(value):new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul',hour12:false}).format(d)+' KST';}
function updateDataContext(view){
 const el=$('#dataContext'); if(!el)return;
 el.hidden=['home','inquiries','admin-inquiries','users','db'].includes(view);
 const at=state.meta?.run?.started_at, age=at?(Date.now()-Date.parse(at))/3600000:null;
 const old=age!=null&&age>(state.meta.fresh_hours||48);
 el.className='data-context'+(old?' aged':'');
 el.innerHTML=`<span class="context-icon">${old?'◷':'ⓘ'}</span><div><b>${old?'최근 수집 회차가 오래되었습니다.':'수집 시점 기준의 공개 가격입니다.'}</b> <span>마지막 수집 ${esc(fullAt(at))}. ${['cost','bizcase'].includes(view)?'원가·사업성 결과는 입력한 가정의 계산값입니다.':'지역·구성 차이와 출처를 확인한 뒤 비교하세요.'}</span></div>`;
}
function enhanceDashboard(d){ renderReadableDashboard(d); }
let evidenceTrigger=null;
function showEvidence(r,model){
 if(!r)return;evidenceTrigger=document.activeElement;
 const source=safeSource(r.source_url),nowAge=r.collected_at?(Date.now()-Date.parse(r.collected_at))/3600000:null;
 const status={SUCCESS:'수집 성공',FAILED:'최근 수집 실패 · 직전 값',STALE:'회차 기준 오래된 값',PRIVATE:'가격 미공개',EMPTY:'가격 없음'}[r.status]||r.status||'미확인';
 const item=(a,b)=>`<div><dt>${a}</dt><dd>${b}</dd></div>`;
 $('#evidenceBody').innerHTML=`<h2 id="evidenceTitle">가격의 근거를 확인하세요.</h2><p class="evidence-product">${esc(r.provider_name)} <span>· ${esc(model)}</span></p><div class="evidence-price"><span>공개 가격 기준 · 환산 단가</span><strong>${money(r.normalized_price_usd,'USD')}</strong><small>USD / GPU · 시간</small></div>
 <div class="evidence-condition">${esc(r.raw_product_name)}<div>${esc(r.region||'지역 미확인')} · ${esc(termL(r.contract_term||state.f.term))} · ${r.gpu_count?esc(r.gpu_count)+' GPU':'GPU 수 미확인'}</div></div>
 <div class="evidence-source"><span>출처 원문</span>${source?`<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">${esc(new URL(source).hostname)} ↗</a><p>${esc(source)}</p>`:'<p>출처 URL이 제공되지 않았습니다.</p>'}</div>
 <p class="evidence-note">${esc(status)} · ${esc(fullAt(r.collected_at))}${nowAge>(state.meta?.fresh_hours||48)?' · 오래된 관측값':''}</p><h3>원본과 환산</h3><dl class="evidence-list">${item('원본 금액',r.raw_price==null?'미확인':esc(Number(r.raw_price).toLocaleString())+' '+esc(r.raw_currency||'통화 미확인'))}${item('과금 단위',esc(({HOUR:'시간',MONTH:'월 (730시간)',YEAR:'연 (8,760시간)'})[r.billing_unit]||r.billing_unit||'미제공'))}${item('가격 기준',esc(({PER_GPU:'GPU당',PER_NODE:'노드당',PER_INSTANCE:'인스턴스당',GPU:'GPU당',NODE:'노드당'})[r.price_basis]||r.price_basis||'미제공'))}${item('환산에 적용한 환율',r.applied_exchange_rate==null?'미제공':esc(r.applied_exchange_rate))}${item('선납금',r.upfront_cost==null?'미제공':esc(r.upfront_cost)+' '+esc(r.raw_currency||''))}${item('약정 시간',r.term_hours==null?'미제공':esc(r.term_hours)+'시간')}${item('환산 규칙',esc(r.calculation_rule_id||'미제공'))}${item('저장된 계산식',esc(r.calculation_trace?.formula||'미제공'))}${item('환율 방향',r.raw_currency==='USD'?'USD 원본':r.applied_exchange_rate!=null?'1 USD당 '+esc(r.raw_currency||'원본 통화'):'미제공')}${item('환율 출처',esc(r.calculation_trace?.fx_source||(r.raw_currency==='USD'?'USD 원본 · 환산 불필요':'미제공')))}${item('환율 기준 시각',esc(fullAt(r.calculation_trace?.fx_rate_at)))}${item('환산 사유 / 상태',r.normalized_price_usd==null?esc(r.reason||'환산 불가'):'환산값 제공')}</dl>
 <div class="evidence-rule"><b>환산 기준</b>${r.price_basis==='PER_GPU'?'<p>이미 GPU당 가격으로 제공된 원본이므로, GPU 수로 다시 나누지 않습니다.</p>':''}<p>시간당 원본 가격에 선납금의 시간 배분액을 더하고, 인스턴스당(노드당) 가격일 때만 GPU 수로 나눕니다. 외화는 적용 환율로 USD로 환산합니다. 위에 제공되지 않은 입력값은 추정하지 않습니다.</p></div>
 <h3>수집과 최신성</h3><dl class="evidence-list">${item('수집 상태',esc(status))}${item('가격 수집 시각',esc(fullAt(r.collected_at)))}${item('최근 수집 시도',esc(fullAt(r.last_attempt_at)))}${item('현재가 최초 관측',esc(fullAt(r.first_observed_at)))}${item('현재 시각 기준',nowAge==null?'미확인':`${Math.max(0,Math.floor(nowAge))}시간 전 수집${nowAge>(state.meta?.fresh_hours||48)?' · 오래된 관측값':''}`)}</dl>
 <p class="evidence-note">현재가 최초 관측은 이 서비스에서 가격을 확인한 시점입니다. 실제 가격 변경일이나 GPU 출시일을 의미하지 않습니다.</p>
<p class="evidence-note">지역·메모리·GPU 수·CPU/RAM·네트워크·지원 조건이 같아야 직접 비교할 수 있습니다. 표시된 임대료에는 GPU 이외의 자원이 포함될 수 있습니다.</p>`;
 if(r.calculation_trace?.source_record){$('#evidenceBody').insertAdjacentHTML('beforeend',`<p class="evidence-note">수집 출처: ${esc(r.calculation_trace.data_source||'공개 피드')} · CC BY 4.0 · ${esc(r.calculation_trace.comparison_note||'')}</p>`);$('#evidenceBody').insertAdjacentHTML('beforeend',`<details><summary>수집한 원본 필드 전체</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px">${esc(JSON.stringify(r.calculation_trace.source_record,null,2))}</pre></details>`);}
 $('#evidenceDialog').showModal();$('#evidenceDialog').scrollTop=0;
}
function closeEvidence(){$('#evidenceDialog').close();evidenceTrigger?.focus();}
$('#evidenceClose').onclick=closeEvidence;
$('#evidenceDialog').addEventListener('click',e=>{if(e.target===$('#evidenceDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeEvidence();}});
$('#evidenceDialog').addEventListener('close',()=>evidenceTrigger?.focus());
$('#mobileMenu').onclick=()=>{const open=$('#mobileNav').hidden;$('#mobileNav').style.top=$('.gnb').getBoundingClientRect().bottom+'px';$('#mobileNav').hidden=!open;$('#mobileMenu').setAttribute('aria-expanded',String(open));$('#mobileMenu').setAttribute('aria-label',open?'전체 메뉴 닫기':'전체 메뉴 열기');};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#mobileNav').hidden){$('#mobileNav').hidden=true;$('#mobileMenu').setAttribute('aria-expanded','false');$('#mobileMenu').focus();}});
document.addEventListener('click',e=>{
 if(e.target.closest('.skip-link')){e.preventDefault();$('#content').focus();$('#content').scrollIntoView({block:'start'});return;}
 if(e.target.closest('[data-retry-view]'))render();
 const model=e.target.closest('[data-open-model]');if(model){e.preventDefault();state.f.model=model.dataset.openModel;state.f.term='ON_DEMAND';state.f.region='ALL';state.f.ptype='ALL';if(state.view==='dashboard')renderDash();else location.hash='#dashboard';}
 if(e.target.closest('#mobileNav a')){$('#mobileNav').hidden=true;$('#mobileMenu').setAttribute('aria-expanded','false');$('#mobileMenu').setAttribute('aria-label','전체 메뉴 열기');}
});

window.addEventListener('resize',()=>{if(innerWidth>1100){$('#mobileNav').hidden=true;$('#mobileMenu').setAttribute('aria-expanded','false');$('#mobileMenu').setAttribute('aria-label','전체 메뉴 열기');}});

/* The detailed catalogue is optional; keep basic navigation useful when it is unavailable. */
async function renderBasicCatalog(el){
 const models=state.meta.catalog_models||[],results=await Promise.allSettled(models.map(model=>api('/api/prices'+qs({model,term:'ON_DEMAND',region:'ALL',ptype:'ALL'}))));
 if(state.view!=='catalog'||catRoute().kind)return;
 if(results.every(r=>r.status==='rejected')){errBox(el,new Error('기본 가격 조회 실패'));return;}
 const rows=results.flatMap((r,i)=>r.status==='fulfilled'?r.value.rows.map(row=>({...row,gpu_model_name:models[i]})):[]);
 el.innerHTML=`<div class="section-heading"><div><p class="eyebrow">GPU & PROVIDER CATALOG</p><h2>모델에서 시작하는 가격 탐색.</h2></div></div><div class="data-context"><span class="context-icon">ⓘ</span><div><b>상세 카탈로그 연결 대기</b><span>수집된 가격으로 기본 목록을 표시합니다. 상세 사양·상품 설명은 연결 후 확인할 수 있습니다.</span></div></div><div class="catalog-basic-search"><label for="basicCatalogSearch">모델·사업자 검색</label><input class="inp" id="basicCatalogSearch" placeholder="예: B200, Lambda" type="search"></div><div class="market-cards">${models.map((model,i)=>{const d=results[i].status==='fulfilled'?results[i].value:null,k=d?.kpi;return `<button class="market-card" type="button" data-basic-search="${esc(model)}" data-open-model="${esc(model)}"><span class="mc-top"><span class="mc-gen">${esc(state.meta.gpu_models?.[model]?.generation||'GPU')}</span><span class="mc-arrow">↗</span></span><h3>${esc(model)}</h3><span class="mc-label">온디맨드 · 관측 최저가</span><span class="mc-price ${!k?.count?'no-price':''}">${!d?'조회 불가':k?.count?money(k.min,'USD'):'관측 가격 없음'}</span><span class="mc-bottom"><span class="pill ${k?.providers>=3?'p-ok':'p-warn'}">${k?.count?`${k.providers}곳 · ${k.count}개 상품`:'관측 가격 없음'}</span><span>가격 상세 비교 ↗</span></span></button>`;}).join('')}</div><div class="panel" style="margin-top:24px"><div class="ph"><h3>수집된 사업자와 상품</h3><span class="muted">대상 모델 · 온디맨드 · 회차 기준</span></div><div class="tw"><table class="t"><thead><tr><th>GPU / 상품</th><th>사업자</th><th>지역</th><th class="n">USD/GPU·시간</th><th>출처·환산 근거</th></tr></thead><tbody>${rows.map((r,i)=>`<tr data-basic-search="${esc(r.gpu_model_name+' '+r.provider_name+' '+r.raw_product_name)}"><td><b>${esc(r.gpu_model_name)}</b><span class="sub2">${esc(r.raw_product_name)}</span></td><td>${esc(r.provider_name)}</td><td>${esc(r.region||'미확인')}</td><td class="n">${money(r.normalized_price_usd,'USD')}</td><td><button class="evidence-btn" data-basic-evidence="${i}">근거 보기 ↗</button></td></tr>`).join('')||'<tr><td colspan="5">대상 모델에서 관측된 온디맨드 상품이 없습니다.</td></tr>'}</tbody></table></div></div><p class="muted" id="basicCatalogEmpty" hidden>검색 결과가 없습니다. 다른 모델이나 사업자를 입력해 보세요.</p>`;
 $('#basicCatalogSearch').oninput=e=>{const q=e.target.value.trim().toLowerCase();let shown=0;el.querySelectorAll('[data-basic-search]').forEach(x=>{x.hidden=!x.dataset.basicSearch.toLowerCase().includes(q);if(!x.hidden)shown++;});$('#basicCatalogEmpty').hidden=!!shown;};
 el.onclick=e=>{const b=e.target.closest('[data-basic-evidence]');if(b){const r=rows[+b.dataset.basicEvidence];showEvidence(r,r.gpu_model_name);}};
}

document.addEventListener('click',e=>{const b=e.target.closest('[data-welcome-ask]');if(b)ask(b.dataset.welcomeAsk);});
