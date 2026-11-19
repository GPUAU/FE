/* Focused NVIDIA catalogue. Prices always come from the local pricing API. */
const catalogListUI = { status: 'all', sort: 'default' };
const catIcon = name => `<img class="ci" src="/static/icons/${name}.svg" alt="" aria-hidden="true" width="16" height="16">`;
const nvidiaMark = (cls = '') => `<img class="nv-mark ${cls}" src="/static/icons/nvidia.svg" alt="NVIDIA 로고" width="40" height="40">`;
const catalogStatus = m => m.od ? ['available', '가격 있음'] : m.status === 'PRIVATE' ? ['pending', '가격 비공개'] : ['pending', '수집값 없음'];

async function catIndex() {
  const d = await api('/api/catalog'), el = $('#catBody');
  catTitle('GPU 시장가격', 'B200 · B300 · VR200의 공개 임대가격을 한눈에 비교하세요.');
  const priced = d.models.filter(m => m.od).length;
  const updated = d.as_of ? String(d.as_of).slice(0, 16).replace('T', ' ') : '수집 이력 없음';
  const demo = d.data_mode === 'demo';
  el.innerHTML = `
    <div class="catalog-heading">
      <div><div class="catalog-eyebrow"><span></span> NVIDIA CLOUD GPU</div>
        <h1>GPU 시장가격<span class="title-dot">.</span></h1>
        <p>B200, B300, VR200. 필요한 GPU의 가격과 공급 현황을 한곳에서.</p></div>
      <div class="nvidia-signature">${nvidiaMark()}<span>NVIDIA<small>GPU PRICE INDEX</small></span></div>
    </div>
    <div class="catalog-context">
      <div class="catalog-metrics"><span>추적 모델 <b>${d.models.length}</b></span><i></i><span>가격 확보 <b>${priced}</b></span><i></i><span>사업자 <b>${d.providers.length}</b></span></div>
      <div class="catalog-updated">${demo ? '<span class="demo-label">예제 데이터</span>' : ''}${catIcon('clock-history')}<span>${esc(updated)} 기준</span><button id="catRefresh" class="catalog-icon-button" aria-label="카탈로그 새로고침" title="저장된 최신 데이터 불러오기">${catIcon('arrow-repeat')}</button></div>
    </div>
    <section class="catalog-panel" aria-label="GPU와 사업자 비교">
      <div class="catalog-panel-head"><div class="catalog-tabs" role="tablist" aria-label="카탈로그 보기">
        <button id="catModelTab" type="button" role="tab" data-tab="model" aria-controls="catalogResults">GPU 모델 <span>${d.models.length}</span></button>
        <button id="catProviderTab" type="button" role="tab" data-tab="provider" aria-controls="catalogResults">사업자 <span>${d.providers.length}</span></button>
      </div><details class="catalog-method"><summary>${catIcon('info-circle')} 비교 기준</summary><div><b>이 가격은 어떻게 계산하나요?</b><p>최저가와 중앙값은 최근 직접 수집한 온디맨드 상품의 GPU 1장·1시간 환산 단가입니다. 스팟·약정·미공개·오래된 값은 포함하지 않습니다.</p><p>중앙값은 유효 상품 기준입니다. 사업자별 상품 수, 지역·구성 차이가 있으므로 상세 조건을 함께 확인하세요. 표본이 1개면 최저가와 중앙값이 같습니다.</p><p>메모리는 NVIDIA HGX 대표 사양입니다. 실제 임대 상품 구성은 상세 화면에서 확인하세요.</p></div></details></div>
      <div class="catalog-toolbar"><label class="catalog-search">${catIcon('search')}<input id="catSearch" type="search" autocomplete="off" placeholder="GPU 모델 검색 · B200, B300, VR200" aria-label="카탈로그 검색" value="${esc(catUI.q)}"></label>
        <div class="catalog-sort"><label for="catSort">정렬</label><select id="catSort"><option value="default">기본 순서</option><option value="price">최저가 낮은 순</option><option value="median">중앙값 낮은 순</option><option value="providers">사업자 많은 순</option><option value="name">이름순</option></select></div></div>
      <div class="catalog-filterbar"><div class="catalog-filters" role="group" aria-label="가격 확보 여부"><button data-status="all">전체 <span>${d.models.length}</span></button><button data-status="priced">가격 있음 <span>${priced}</span></button><button data-status="unpriced">수집값 없음 <span>${d.models.length - priced}</span></button></div><div class="catalog-scope">${nvidiaMark()}<span>NVIDIA</span><i></i><span>데이터센터</span></div></div>
      <div id="catalogResults" role="tabpanel" aria-labelledby="catModelTab" tabindex="0"></div>
      <div class="catalog-table-footer"><span id="catResultCount" aria-live="polite"></span><span>표시 단위 <select id="catCurrency" aria-label="카탈로그 표시 통화"><option value="USD">USD / GPU·시간</option><option value="KRW">KRW / GPU·시간</option></select></span></div>
    </section>
    <div class="catalog-notes"><article>${catIcon('sliders')}<div><h3>같은 조건에서 비교하세요</h3><p>지역, GPU 수, 포함 자원에 따라 가격이 달라집니다.<br>모델을 선택하면 상품 구성과 원문 출처를 확인할 수 있습니다.</p></div></article><article>${catIcon('clock-history')}<div><h3>가격이 없어도 추적은 계속됩니다</h3><p>수집값이 없다는 것은 가격 비공개가 확정됐다는 뜻이 아닙니다.<br>확보한 가격과 확인 상태를 구분해 보여드립니다.</p></div></article></div>
    <p class="catalog-disclaimer">${demo ? '현재 예제 데이터로 표시하고 있습니다. 실제 시장가격·실시간 공급 여부와 다를 수 있습니다.' : '수집 범위 내 공개가격입니다. 실제 견적과 상품 가용성은 사업자 원문을 확인하세요.'}</p>`;

  const matches = text => catUI.q.toLowerCase().trim().split(/[\s,]+/).filter(Boolean).every(q => text.toLowerCase().includes(q));
  const sortRows = rows => [...rows].sort((a, b) => {
    if (catalogListUI.sort === 'name') return (a.model || a.provider_name).localeCompare(b.model || b.provider_name);
    if (catalogListUI.sort === 'providers') return (b.providers ?? b.configs) - (a.providers ?? a.configs);
    if (catalogListUI.sort === 'default') return 0;
    const value = x => catUI.tab === 'provider' ? x.cheapest : x.od?.[catalogListUI.sort === 'median' ? 'median' : 'min'];
    const x = value(a), y = value(b);
    return x == null ? (y == null ? 0 : 1) : y == null ? -1 : x - y;
  });
  const priceCell = (m, medianColumn) => m.od ? `<strong class="catalog-price">${money(m.od[medianColumn ? 'median' : 'min'])}</strong><small>${medianColumn ? `유효 상품 ${m.od.n}개${m.od.providers === 1 ? ' · 표본 1곳' : ''}` : esc(m.od.min_provider)}</small>` : '<span class="catalog-no-price">—</span><small>수집된 온디맨드 없음</small>';
  const providerCell = m => m.provider_list?.length ? `<div class="provider-stack">${m.provider_list.slice(0, 3).map(([id, name]) => `<a href="#catalog/provider/${encodeURIComponent(id)}" class="provider-avatar" title="${esc(name)}" aria-label="${esc(name)} 상세 보기">${esc(name.slice(0, 1))}</a>`).join('')}<span>${m.providers}곳</span></div>` : '<span class="catalog-unconfirmed">확인된 사업자 없음</span>';
  const modelRow = m => { const s = m.spec || {}, [cls, label] = catalogStatus(m), href = '#catalog/gpu/' + encodeURIComponent(m.model); return `<tr>
      <td class="catalog-model-cell"><a class="catalog-model-link" href="${href}"><span class="catalog-logo-box">${nvidiaMark()}</span><span><strong>NVIDIA ${esc(m.model)}</strong><small>${esc(m.generation || '상세 확인 필요')}</small></span></a></td>
      <td data-label="메모리 · 아키텍처">${s.hbm_gb ? `<strong class="catalog-memory">${s.hbm_gb}<span> GB</span></strong><span class="memory-type">${esc(s.memory_type || 'HBM')}</span><small>${esc(s.spec_basis || '등록 사양')}</small>` : '<span class="catalog-unconfirmed">사양 확인 중</span><small>확인된 정보부터 제공</small>'}</td>
      <td data-label="최저 온디맨드">${priceCell(m, false)}</td><td data-label="중앙값">${priceCell(m, true)}</td>
      <td data-label="사업자">${providerCell(m)}</td><td class="catalog-state-cell" data-label="확보 상태"><span class="catalog-status ${cls}"><i></i>${label}</span><a class="catalog-row-arrow" href="${href}" aria-label="${esc(m.model)} 상세 보기">${catIcon('arrow-up-right')}</a></td></tr>`; };
  const draw = () => {
    const isModel = catUI.tab === 'model';
    let rows = isModel ? d.models.filter(m => matches(`NVIDIA 엔비디아 ${m.model} ${m.generation || ''} ${m.spec?.hbm_gb || ''}`) && (catalogListUI.status === 'all' || Boolean(m.od) === (catalogListUI.status === 'priced'))) : d.providers.filter(p => matches(`${p.provider_name} ${p.provider_id} ${p.models.join(' ')}`));
    rows = sortRows(rows);
    el.querySelectorAll('[data-tab]').forEach(b => { const active = b.dataset.tab === catUI.tab; b.setAttribute('aria-selected', active); b.tabIndex = active ? 0 : -1; });
    el.querySelectorAll('[data-status]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.status === catalogListUI.status)));
    el.querySelector('.catalog-filterbar').hidden = !isModel;
    $('#catSearch').placeholder = isModel ? 'GPU 모델 검색 · B200, B300, VR200' : '사업자 또는 지원 모델 검색';
    $('#catSort option[value="median"]').disabled = !isModel;
    $('#catSort option[value="providers"]').textContent = isModel ? '사업자 많은 순' : '상품 많은 순';
    const target = $('#catalogResults'); target.setAttribute('aria-labelledby', isModel ? 'catModelTab' : 'catProviderTab');
    target.innerHTML = rows.length ? `<div class="catalog-table-scroll"><table class="catalog-table"><caption class="sr">${isModel ? 'NVIDIA GPU 모델별 가격과 확보 상태' : '대상 GPU를 제공하는 사업자'}</caption><thead><tr>${(isModel ? ['GPU 모델', '메모리', '최저 온디맨드', '중앙값', '사업자', '확보 상태'] : ['사업자', '서비스 유형', '지원 GPU', '최저 수집 단가', '상품 수', '수집 상태']).map(t => `<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${isModel ? rows.map(modelRow).join('') : rows.map(p => `<tr><td class="catalog-model-cell"><a class="catalog-model-link" href="#catalog/provider/${encodeURIComponent(p.provider_id)}"><span class="catalog-logo-box provider-letter">${esc(p.provider_name.slice(0, 1))}</span><span><strong>${esc(p.provider_name)}</strong><small>대상 GPU 제공 사업자</small></span></a></td><td data-label="서비스 유형">${typeTag(p.provider_type)}</td><td data-label="지원 GPU"><strong>${p.models.map(esc).join(', ') || '가격 확인 중'}</strong></td><td data-label="최저 수집 단가"><strong class="catalog-price">${p.cheapest == null ? '—' : money(p.cheapest)}</strong><small>대상 모델 · 수집 상품 기준</small></td><td data-label="상품 수">${p.configs}개</td><td class="catalog-state-cell" data-label="수집 상태"><span class="catalog-status ${p.health?.status === 'SUCCESS' ? 'available' : 'pending'}"><i></i>${esc(p.health ? (HSTATE[p.health.status]?.[1] || '확인 필요') : '이력 없음')}</span><a class="catalog-row-arrow" href="#catalog/provider/${encodeURIComponent(p.provider_id)}" aria-label="${esc(p.provider_name)} 상세 보기">${catIcon('arrow-up-right')}</a></td></tr>`).join('')}</tbody></table></div>` : `<div class="catalog-empty">${catIcon('search')}<h3>일치하는 ${isModel ? 'GPU 모델' : '사업자'}이 없습니다</h3><p>${isModel ? 'B200, B300, VR200을 검색하거나 필터를 변경해 보세요.' : '검색어를 변경해 보세요.'}</p><button class="btn" id="catResetFilters">검색·필터 초기화</button></div>`;
    $('#catResultCount').textContent = `${rows.length}개 ${isModel ? '모델' : '사업자'} 표시 · 전체 ${isModel ? d.models.length : d.providers.length}개`;
    if ($('#catResetFilters')) $('#catResetFilters').onclick = () => { catUI.q = ''; catalogListUI.status = 'all'; $('#catSearch').value = ''; draw(); };
  };
  $('#catSort').value = catalogListUI.sort; $('#catCurrency').value = state.cur;
  $('#catSearch').oninput = e => { catUI.q = e.target.value; draw(); };
  $('#catSort').onchange = e => { catalogListUI.sort = e.target.value; draw(); };
  $('#catCurrency').onchange = e => { state.cur = e.target.value; document.querySelectorAll('#curSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === state.cur))); draw(); };
  $('#catRefresh').onclick = () => renderCatalog();
  el.querySelector('.catalog-filters').onclick = e => { const b = e.target.closest('[data-status]'); if (b) { catalogListUI.status = b.dataset.status; draw(); } };
  const changeTab = b => { catUI.tab = b.dataset.tab; catUI.q = ''; $('#catSearch').value = ''; if (catUI.tab === 'provider' && catalogListUI.sort === 'median') { catalogListUI.sort = 'default'; $('#catSort').value = 'default'; } draw(); };
  el.querySelector('.catalog-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) changeTab(b); };
  el.querySelector('.catalog-tabs').onkeydown = e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const tabs = [...el.querySelectorAll('[data-tab]')]; const b = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[1] : tabs.find(t => t.dataset.tab !== catUI.tab); changeTab(b); b.focus(); } };
  draw();
}
