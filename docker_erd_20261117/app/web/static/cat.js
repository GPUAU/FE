/* 카탈로그 — 모델·사업자 목록 → 상세 (getdeploying.com/gpus/... 방식).
   #catalog              목록 (모델 / 사업자 탭, 검색)
   #catalog/gpu/H100     모델 상세: 사양 · 가격 변동 차트 · 한눈에 보기 · 가격 및 이용 가능 여부 · 명세 · 자주 묻는 질문 · 대안
   #catalog/provider/AWS 사업자 상세: 수집 상태 · 모델별 추이 · 시장 대비 · 상품 · 자주 묻는 질문
   FAQ 질문은 고정, 답은 서버가 지금 DB 상태로 만든다 (pricing/catalog.py).
   app.js 공통 헬퍼($, esc, api, money, pct, pctu, shortAt, css, typeTag, starBtn, onStarClick, errBox, state …)를 쓴다. */
const CG = { OD: '온디맨드', RES: '약정', SPOT: '스팟' };
const CG_COL = { OD: '--info', RES: '--accent', SPOT: '--ok' };
const MSTATE = { PUBLIC: ['p-ok', '가격 공개'], PRIVATE: ['p-warn', '가격 비공개'], NOT_SEEN: ['p-info', '미발견'] };
const HSTATE = { SUCCESS: ['p-ok', '수집 정상'], FAILED: ['p-bad', '수집 실패'], PARTIAL: ['p-warn', '일부 실패'] };
const catUI = { tab: 'model', q: '', view: 'provider', filter: 'all', pq: '' };

function catRoute() { const [, kind, ...rest] = (location.hash.slice(1) || '').split('/'); return { kind, id: rest.length ? decodeURIComponent(rest.join('/')) : null }; }
const catAgo = at => { const m = Math.max(0, Math.round((Date.now() - new Date(at)) / 60000)); return m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`; };
const gpuRange = cs => { const n = cs.map(c => c.gpu_count || 1); return n.length ? (Math.min(...n) === Math.max(...n) ? `${n[0]}x` : `${Math.min(...n)}x–${Math.max(...n)}x`) : ''; };

async function renderCatalog() {
  const r = catRoute(), el = $('#catBody');
  if (state.catChart) { state.catChart.destroy(); state.catChart = null; }
  el.innerHTML = '<div class="pb muted">…</div>';
  try {
    if (r.kind === 'gpu' && r.id) return await catModel(r.id);
    if (r.kind === 'provider' && r.id) return await catProvider(r.id);
    return await catIndex();
  } catch (e) { if (!r.kind) { console.warn('상세 카탈로그 연결 대기:', e.message); await renderBasicCatalog(el); } else errBox(el, e); }
}
function catTitle(title, desc, trail) {
  $('#pageTitle').textContent = title; $('#pageDesc').textContent = desc;
  $('#crumbTrail').innerHTML = `<span class="sep">▸</span>${esc(tr('gMarket'))}<span class="sep">▸</span><a href="#catalog">${esc(tr('pCatalog'))}</a>${trail ? `<span class="sep">▸</span><b>${esc(trail)}</b>` : ''}`;
}

/* ---------------- 공통 조각 ---------------- */
function catChart(canvas, chart, labels) {
  const ks = Object.keys(chart.series);
  const cols = ks.map((k, i) => css(CG_COL[k] || ['--info', '--accent', '--ok', '--warn', '--t-neo', '--t-hyper'][i % 6]));
  state.catChart = new Chart(canvas, {
    type: 'line',
    data: { labels: chart.labels.map(l => l.slice(5).replace('-', '/')), datasets: ks.map((k, i) => ({
      label: labels[k] || k, data: chart.series[k].map(v => v == null ? null : (state.cur === 'KRW' ? v * state.fx : v)),
      borderColor: cols[i], backgroundColor: cols[i], borderWidth: 2, pointRadius: chart.series[k].filter(v => v != null).length <= 3 ? 3.5 : 0, pointHoverRadius: 4, tension: .25, spanGaps: false,
      borderDash: k === 'OD' || i === 0 ? [] : [6, 4] })) },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => '주간 (' + chart.labels[it[0].dataIndex] + ' 마감)',
        label: c => `${c.dataset.label} ${c.raw == null ? '—' : money(state.cur === 'KRW' ? c.raw / state.fx : c.raw)}` } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { family: css('--f-mono'), size: 10 } } },
        y: { grace: '15%', grid: { color: css('--line-2'), borderDash: [3, 3] }, ticks: { font: { family: css('--f-mono'), size: 10 }, callback: v => state.cur === 'KRW' ? '₩' + Math.round(v).toLocaleString() : '$' + v } } } },
  });
}
function faqHTML(faq) {
  return faq.map((f, i) => `<details class="faq" ${i === 0 ? 'open' : ''}><summary>${esc(f.q)}<span class="faq-ic" aria-hidden="true"></span></summary><div class="fa">
    ${f.a.map(p => `<p>${esc(p)}</p>`).join('')}
    ${f.table ? `<div class="tw"><table class="t faq-t"><thead><tr>${f.table.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${f.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
    ${f.note ? `<p class="muted">${esc(f.note)}</p>` : ''}</div></details>`).join('');
}
const catNav = items => `<nav class="cat-nav" aria-label="이 페이지">${items.map(([id, l], i) => `<a href="#" data-to="${id}" ${i === 0 ? 'aria-current="true"' : ''}>${l}</a>`).join('')}</nav>`;
function wireCatNav(el) {
  const nav = el.querySelector('.cat-nav'); if (!nav) return;
  nav.onclick = e => { const a = e.target.closest('[data-to]'); if (!a) return; e.preventDefault();
    const t = el.querySelector('#' + a.dataset.to); if (t) window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - 80, behavior: 'smooth' }); };
  const secs = [...nav.querySelectorAll('[data-to]')].map(a => el.querySelector('#' + a.dataset.to)).filter(Boolean);
  if (state.catSpy) window.removeEventListener('scroll', state.catSpy);
  state.catSpy = () => { if (state.view !== 'catalog') return; let cur = secs[0]; secs.forEach(s => { if (s.getBoundingClientRect().top < 140) cur = s; });
    nav.querySelectorAll('a').forEach(a => a.setAttribute('aria-current', String(cur && a.dataset.to === cur.id))); };
  window.addEventListener('scroll', state.catSpy, { passive: true });
}

/* ---------------- 모델 상세 ---------------- */
async function catModel(model) {
  const d = await api('/api/catalog/model/' + encodeURIComponent(model));
  const s = d.spec || {}, g = d.glance, el = $('#catBody');
  catTitle(tr('pCatalog'), `${[s.vendor, model, d.generation].filter(Boolean).join(' · ')} — 공개 가격 · 사업자 · 추이 · 자주 묻는 질문`, model);
  const chips = [['아키텍처', d.generation], ['메모리', s.hbm_gb && `${s.hbm_gb}GB HBM`], ['대역폭', s.hbm_tbs && `${s.hbm_tbs} TB/s`],
    ['BF16', s.bf16_pflops && `${s.bf16_pflops} PFLOPS`], ['출시', d.launch_date ? d.launch_date.slice(0, 7) : s.launch]].filter(x => x[1]);
  const has = d.chart.labels.length > 0;
  el.innerHTML = `
    <div class="cat-hero">
      <div class="ch-l">
        <div class="ch-crumb"><a href="#catalog">카탈로그</a> / GPU</div>
        <h2 class="ch-title">${nvidiaMark()} NVIDIA ${esc(model)}</h2>
        <p class="ch-desc">${esc(s.name || model)}${d.aliases.length ? ` · 다른 표기 ${esc(d.aliases.join(', '))}` : ''}</p>
        <div class="ch-chips">${chips.map(([k, v]) => `<span><i>${k}</i>${esc(String(v))}</span>`).join('')}</div>
        <div class="ch-btns"><a class="btn" href="#compare" data-cmp="${esc(model)}">다른 사업자 가격과 비교</a><a class="btn" href="#trend">추이·생애주기</a></div>
      </div>
      <div class="panel ch-chart">
        <div class="ph"><h3>가격 변동 내역</h3><span class="muted">${has ? `지난 ${Math.round(d.chart.labels.length / 4.3)}개월` : ''}</span></div>
        <div class="pb" style="padding-bottom:4px"><div class="muted" style="font-size:11.5px;margin-bottom:4px">GPU 시간당 주간 중앙값 · 직접 수집 · 상품별 마지막 관측가 최대 30일 이월</div>
          <div class="cc-chart">${has ? '<canvas id="catCv" role="img" aria-label="계약별 주간 중앙값 추이"></canvas>' : '<div class="empty" style="padding:30px 0"><b>아직 추이가 없습니다</b><span>정상 가격이 수집되면 주 단위로 쌓입니다.</span></div>'}</div></div>
        <div class="ch-legend">${Object.keys(CG).map(k => `<div><span><i style="background:var(${CG_COL[k]})"></i>${CG[k]}</span><b>${d.current[k] != null ? money(d.current[k]) : '—'}</b></div>`).join('')}</div>
      </div>
    </div>
    <div class="cat-glance-h"><h3>한눈에 보기</h3>${d.as_of ? `<span class="muted"><i class="live"></i>${catAgo(d.as_of)} 수집 회차 기준</span>` : ''}</div>
    <div class="glance cat-glance">
      <div class="kpi"><div class="lbl">가장 저렴한 온디맨드</div><div class="v">${g.cheapest_od ? money(g.cheapest_od.min) : '—'}<small>/GPU·시간</small></div><div class="s">${g.cheapest_od ? `${esc(g.cheapest_od.min_provider)} · ${esc(g.cheapest_od.min_product)}` : '공개된 온디맨드 없음'}</div></div>
      <div class="kpi"><div class="lbl">중간 가격 (현재)</div><div class="v">${g.median_od ? money(g.median_od.median) : '—'}<small>/GPU·시간</small></div><div class="s">${g.median_od ? `온디맨드 · 사업자 ${g.median_od.providers}곳${g.median_od.providers < 3 ? ' · <span class="up">표본 부족</span>' : ''}` : '—'}</div></div>
      <div class="kpi"><div class="lbl">${g.trend_weeks ? `${g.trend_weeks}주 추세` : '추세'}</div><div class="v ${g.trend_90d > 0.005 ? 'up' : g.trend_90d < -0.005 ? 'down' : ''}">${g.trend_90d == null ? '—' : pct(g.trend_90d, 1) + (g.trend_90d > 0.005 ? ' ▲' : g.trend_90d < -0.005 ? ' ▼' : '')}</div><div class="s">${g.trend_90d == null ? '이력 부족' : '온디맨드 주간 중앙값'}</div></div>
      <div class="kpi"><div class="lbl">적용 범위</div><div class="v">${g.coverage.providers}<small>개 사업자</small></div><div class="s">${g.coverage.configs}개 구성${g.coverage.ref_providers ? ` · 참고 ${g.coverage.ref_providers}곳` : ''}${g.coverage.private ? ` · 비공개 ${g.coverage.private}곳` : ''}</div></div>
    </div>
    <div class="cat-main">
      ${catNav([['c-price', '가격'], ['c-spec', '명세'], ['c-faq', '자주 묻는 질문'], ['c-alt', '대안']])}
      <div class="cat-content">
        <section id="c-price"><div class="cs-h"><h2>가격 및 이용 가능 여부</h2><span class="muted">통계는 직접 수집만 · GPU Finder 경유는 참고</span></div>
          <div class="cat-ctl"><span class="seg" id="cView"><button type="button" data-v="provider">사업자별 <i>${d.counts.all}</i></button><button type="button" data-v="config">구성별 <i>${d.offers.reduce((a, p) => a + p.configs.length, 0)}</i></button></span>
            <input class="inp" id="cPq" type="search" placeholder="사업자·지역 검색 (예: aws, us-east)" value="${esc(catUI.pq)}"></div>
          <div class="cat-ftabs" id="cFilter">${[['all', '모두', d.counts.all], ...Object.keys(CG).map(k => [k, CG[k], d.counts[k]])].map(([k, l, n]) => `<button type="button" data-f="${k}">${l} <i>${n}</i></button>`).join('')}</div>
          <div id="cOffers"></div></section>
        <section id="c-spec"><div class="cs-h"><h2>명세</h2><span class="muted">대표 사양 · 실제 상품 구성은 사업자별 확인</span></div>${specHTML(d)}</section>
        <section id="c-faq"><div class="cs-h"><h2>자주 묻는 질문</h2><span class="muted">질문은 고정 · 답은 ${d.as_of ? shortAt(String(d.as_of)) : '최신'} 회차 데이터로 자동 작성</span></div>${faqHTML(d.faq)}</section>
        <section id="c-alt"><div class="cs-h"><h2>${esc(model)}의 대안</h2><span class="muted">온디맨드 중앙값 기준</span></div>
          <div class="cat-grid alt">${d.alternatives.map(a => `<a class="cat-card" href="#catalog/gpu/${encodeURIComponent(a.model)}"><div class="cc-top"><b class="cc-name">${esc(a.model)}</b>${a.ratio != null ? `<span class="pill ${a.ratio < 1 ? 'p-ok' : 'p-warn'}">${a.ratio < 1 ? `${Math.round((1 - a.ratio) * 100)}% 저렴` : `${a.ratio.toFixed(2)}배`}</span>` : ''}</div>
            <div class="cc-sub">${esc(a.generation || '')}${a.hbm_gb ? ` · ${a.hbm_gb}GB` : ''}</div><div class="cc-price">${a.od ? `<b>${money(a.od.median)}</b><span>/GPU·시간 · ${a.od.providers}곳</span>` : '<span class="muted">신선한 온디맨드 없음</span>'}</div></a>`).join('') || '<div class="muted">비교할 다른 모델이 없습니다.</div>'}</div></section>
      </div>
    </div>`;
  if (has) catChart($('#catCv'), d.chart, CG);
  const drawOffers = () => {
    const q = catUI.pq.trim().toLowerCase(), f = catUI.filter;
    el.querySelectorAll('#cView button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === catUI.view)));
    el.querySelectorAll('#cFilter button').forEach(b => b.setAttribute('aria-current', String(b.dataset.f === f)));
    const offers = d.offers.filter(p => (f === 'all' || p.groups.includes(f)) && (!q || (p.provider_name + ' ' + p.configs.map(c => c.region || '').join(' ')).toLowerCase().includes(q)));
    $('#cOffers').innerHTML = catUI.view === 'provider' ? offerCards(offers, f) : configTable(offers, f);
  };
  el.querySelector('#cView').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { catUI.view = b.dataset.v; drawOffers(); } };
  el.querySelector('#cFilter').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { catUI.filter = b.dataset.f; drawOffers(); } };
  el.querySelector('#cPq').oninput = e => { catUI.pq = e.target.value; drawOffers(); };
  el.querySelector('#cOffers').onclick = onStarClick;
  el.querySelector('[data-cmp]').onclick = () => { if (state.c) state.c.model = model; };
  el.querySelector('a[href="#trend"]').onclick = () => { state.t.model = model; };
  drawOffers(); wireCatNav(el);
}
function specHTML(d) {
  const s = d.spec;
  if (!s) return '<div class="muted">이 모델의 상세 사양을 확인하고 있습니다.</div>';
  const rows = [['제품명', s.name], ['벤더', s.vendor], ['아키텍처', d.generation], ['사양 기준', s.spec_basis], ['출시', d.launch_date || s.launch], ['HBM 메모리', s.hbm_gb && `${s.hbm_gb} GB`],
    ['메모리 대역폭', s.hbm_tbs && `${s.hbm_tbs} TB/s`], ['BF16 (dense)', s.bf16_pflops && `${s.bf16_pflops} PFLOPS`], ['FP8 (dense)', s.fp8_pflops && `${s.fp8_pflops} PFLOPS`],
    ['GPU TDP', s.tdp_w && `${s.tdp_w} W${s.tdp_estimated ? ' (추정)' : ''}`]].filter(r => r[1]);
  return `<div class="panel"><div class="tw"><table class="t spec-t"><tbody>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${esc(String(v))}</td></tr>`).join('')}</tbody></table></div>${s.spec_source ? `<div class="pb muted"><a href="${esc(s.spec_source)}" target="_blank" rel="noopener">NVIDIA 공식 사양 확인 ↗</a></div>` : ''}</div>`;
}
function offerCards(offers, f) {
  if (!offers.length) return '<div class="panel"><div class="empty"><b>조건에 맞는 사업자가 없습니다</b><span>필터나 검색어를 바꿔 보세요.</span></div></div>';
  return offers.map(p => {
    const cs = p.configs.filter(c => f === 'all' || c.group === f);
    const pick = f === 'all' ? (p.best.OD || p.best.RES || p.best.SPOT) : p.best[f];
    const hb = p.health && p.health.status !== 'SUCCESS' ? `<span class="pill p-bad">수집 실패</span>` : '';
    const via = p.via ? '<span class="pill p-info">GPU Finder 경유 · 참고</span>' : '';
    const url = (cs.find(c => c.url) || {}).url;
    return `<div class="panel offer ${p.via ? 'dim' : ''}">
      <div class="of-l">
        <div class="of-h"><span class="pv">${starBtn(p.provider_id, p.provider_name)}<a class="prov" href="#catalog/provider/${encodeURIComponent(p.provider_id)}">${esc(p.provider_name)}</a></span>${typeTag(p.provider_type)}${via}${hb}</div>
        <div class="muted">${cs.length}가지 구성 · ${gpuRange(cs)}${p.checked_at ? ` · ${catAgo(p.checked_at)} 확인` : ''}</div>
        <div class="of-terms">${p.groups.filter(g => f === 'all' || g === f).map(g => { const b = p.best[g]; return `<div><span>${CG[g]}${b.term && g === 'RES' ? ` (${termL(b.term)})` : ''}</span><b>${b.price != null ? money(b.price) + ' 부터' : esc(b.status || '—')}</b></div>`; }).join('')}</div>
        <details class="of-more"><summary>${cs.length}가지 설정 표시</summary><div class="tw"><table class="t"><thead><tr><th>계약</th><th>상품</th><th class="n">GPU</th><th>지역</th><th class="n">원본가</th><th class="n">USD/GPU·시간</th><th>수집</th></tr></thead><tbody>
          ${cs.map(c => `<tr class=""><td>${termL(c.term)}</td><td>${esc(c.product || '')}</td><td class="n">${c.gpu_count || 1}</td><td>${esc(c.region || '—')}</td><td class="n">${c.raw_price != null ? `${c.raw_price.toLocaleString()} ${esc(c.raw_currency || '')}` : '—'}</td><td class="n"><b>${c.price != null ? money(c.price) : esc(c.status || '—')}</b></td><td class="muted">${c.collected_at ? shortAt(String(c.collected_at)) : '—'}${c.url ? ` · <a href="${esc(c.url)}" target="_blank" rel="noopener">원문</a>` : ''}</td></tr>`).join('')}
        </tbody></table></div></details>
      </div>
      <div class="of-r"><span class="lbl">가격</span><b class="of-p">${pick && pick.price != null ? money(pick.price) : '요청 시'}</b><span class="muted">${pick && pick.price != null ? `/GPU·시간 · ${termL(pick.term || '')}` : pick ? esc(pick.status || '') : ''}</span>
        ${url ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener">가격 페이지 →</a>` : ''}</div>
    </div>`; }).join('');
}
function configTable(offers, f) {
  const rows = offers.flatMap(p => p.configs.filter(c => f === 'all' || c.group === f).map(c => ({ ...c, p })))
    .sort((a, b) => (a.price == null) - (b.price == null) || (a.p.via != null) - (b.p.via != null) || (a.price || 0) - (b.price || 0));
  if (!rows.length) return '<div class="panel"><div class="empty"><b>조건에 맞는 구성이 없습니다</b></div></div>';
  return `<div class="panel"><div class="tw"><table class="t"><thead><tr><th>사업자</th><th>계약</th><th>상품</th><th class="n">GPU</th><th>지역</th><th class="n">USD/GPU·시간</th><th>수집</th></tr></thead><tbody>
    ${rows.map(c => `<tr class="${c.p.via ? 'dim' : ''}"><td><a href="#catalog/provider/${encodeURIComponent(c.p.provider_id)}">${esc(c.p.provider_name)}</a>${c.p.via ? '<span class="sub2">GPU Finder 경유 · 참고</span>' : ''}</td><td>${termL(c.term)}</td><td>${esc(c.product || '')}</td><td class="n">${c.gpu_count || 1}</td><td>${esc(c.region || '—')}</td><td class="n"><b>${c.price != null ? money(c.price) : esc(c.status || '—')}</b></td><td class="muted">${c.collected_at ? shortAt(String(c.collected_at)) : '—'}${c.url ? ` · <a href="${esc(c.url)}" target="_blank" rel="noopener">원문</a>` : ''}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}

/* ---------------- 사업자 상세 ---------------- */
async function catProvider(pid) {
  const d = await api('/api/catalog/provider/' + encodeURIComponent(pid));
  const g = d.glance, h = d.health, el = $('#catBody');
  const hs = h ? HSTATE[h.status] || ['p-warn', h.status] : null;
  catTitle(tr('pCatalog'), `${d.provider_name} — 공개 GPU 가격 · 수집 상태 · 시장 대비 · 자주 묻는 질문`, d.provider_name);
  const ms = Object.keys(d.chart.series), has = d.chart.labels.length > 0;
  el.innerHTML = `
    <div class="cat-hero">
      <div class="ch-l">
        <div class="ch-crumb"><a href="#catalog">카탈로그</a> / 사업자</div>
        <h2 class="ch-title"><span class="pv">${starBtn(d.provider_id, d.provider_name)}</span>${esc(d.provider_name)}</h2>
        <p class="ch-desc">${typeTag(d.provider_type)} ${hs ? `<span class="pill ${hs[0]}">${hs[1]}</span>` : ''}</p>
        <div class="ch-chips">${g.models.map(m => `<a href="#catalog/gpu/${encodeURIComponent(m)}"><i>GPU</i>${esc(m)}</a>`).join('') || '<span>직접 수집 상품 없음</span>'}</div>
        ${h && h.status !== 'SUCCESS' ? `<div class="hwarn p-bad" style="margin-top:10px">마지막 수집 실패 — ${esc(h.error || '')} · 마지막 정상 ${h.last_success_at ? shortAt(String(h.last_success_at)) : '—'}</div>` : ''}
      </div>
      <div class="panel ch-chart">
        <div class="ph"><h3>가격 변동 내역</h3><span class="muted">온디맨드 · 모델별 주간 중앙값</span></div>
        <div class="pb"><div class="cc-chart">${has ? '<canvas id="catCv" role="img" aria-label="모델별 주간 온디맨드 추이"></canvas>' : '<div class="empty" style="padding:30px 0"><b>아직 추이가 없습니다</b></div>'}</div></div>
        <div class="ch-legend">${ms.map((m, i) => `<div><span><i style="background:var(${['--info', '--accent', '--ok', '--warn', '--t-neo', '--t-hyper'][i % 6]})"></i>${esc(m)}</span><b>${d.trend[m] == null ? '—' : pct(d.trend[m], 1)}</b></div>`).join('')}</div>
      </div>
    </div>
    <div class="cat-glance-h"><h3>한눈에 보기</h3>${h ? `<span class="muted"><i class="live ${h.status !== 'SUCCESS' ? 'bad' : ''}"></i>마지막 시도 ${catAgo(h.last_attempt_at)}</span>` : ''}</div>
    <div class="glance cat-glance">
      <div class="kpi"><div class="lbl">가장 싼 상품</div><div class="v">${g.cheapest ? money(g.cheapest.price) : '—'}<small>/GPU·시간</small></div><div class="s">${g.cheapest ? `${esc(g.cheapest.model)} · ${termL(g.cheapest.term)}` : '—'}</div></div>
      <div class="kpi"><div class="lbl">시장보다 저렴</div><div class="v">${g.compared ? `${g.below_market}/${g.compared}` : '—'}</div><div class="s">같은 모델·계약 시장 중앙값 대비</div></div>
      <div class="kpi"><div class="lbl">상품</div><div class="v">${g.configs}<small>개 구성</small></div><div class="s">${g.models.length}개 모델${g.private ? ` · 비공개 ${g.private}개` : ''}</div></div>
      <div class="kpi ${h && h.status !== 'SUCCESS' ? 'warn' : ''}"><div class="lbl">수집 상태</div><div class="v">${hs ? hs[1] : '—'}</div><div class="s">${h ? `마지막 정상 ${h.last_success_at ? shortAt(String(h.last_success_at)) : '—'}` : '수집 이력 없음'}</div></div>
    </div>
    <div class="cat-main">
      ${catNav([['c-vs', '시장 대비'], ['c-items', '상품'], ['c-faq', '자주 묻는 질문']])}
      <div class="cat-content">
        <section id="c-vs"><div class="cs-h"><h2>시장 대비</h2><span class="muted">같은 모델·같은 계약의 직접 수집 최신 정상가</span></div>
          <div class="panel"><div class="tw"><table class="t"><thead><tr><th>모델</th><th>계약</th><th>상품</th><th class="n">${esc(d.provider_name)}</th><th class="n">시장 중앙값</th><th class="n">차이</th><th class="n">순위</th></tr></thead><tbody>
            ${d.vs_market.map(v => `<tr class=""><td><a href="#catalog/gpu/${encodeURIComponent(v.model)}">${esc(v.model)}</a></td><td>${termL(v.term)}</td><td>${esc(v.product)}</td><td class="n"><b>${money(v.price)}</b></td><td class="n">${v.market_median != null ? money(v.market_median) : '—'}${v.market_providers < 3 ? '<span class="sub2">표본 부족</span>' : ''}</td><td class="n">${v.vs == null ? '<span class="muted">—</span>' : `<span class="${v.vs > 0.005 ? 'up' : v.vs < -0.005 ? 'down' : ''}">${pct(v.vs, 0)}</span>`}</td><td class="n">${v.rank ? `${v.rank}/${v.market_providers}` : '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">직접 수집한 가격이 없습니다.</td></tr>'}
          </tbody></table></div></div></section>
        <section id="c-items"><div class="cs-h"><h2>상품</h2><span class="muted">${d.configs.length}개 · GPU Finder 경유는 참고</span></div>${configTable([{ provider_id: d.provider_id, provider_name: d.provider_name, via: null, configs: d.configs.filter(c => !c.via) }, { provider_id: d.provider_id, provider_name: d.provider_name, via: 'GPU Finder', configs: d.configs.filter(c => c.via) }], 'all')}</section>
        <section id="c-faq"><div class="cs-h"><h2>자주 묻는 질문</h2><span class="muted">질문은 고정 · 답은 최신 수집 상태로 자동 작성</span></div>${faqHTML(d.faq)}</section>
      </div>
    </div>`;
  if (has) catChart($('#catCv'), d.chart, {});
  el.querySelector('.ch-title').onclick = onStarClick;
  wireCatNav(el);
}
