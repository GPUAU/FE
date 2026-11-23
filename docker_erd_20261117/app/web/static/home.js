/* Home portal. Prices, coverage and collection events come from the existing API. */
const HOME_Q = ['H100 온디맨드 최저가 어디야?', 'B300 현재 온디맨드 가격 비교해 줘', 'H100 가격 추이 보여 줘'];
const homeIcon = name => `<img src="/static/icons/${name}.svg" width="24" height="24" alt="" aria-hidden="true">`;
const hCard = (title, meta, body, cls = '') => `<section class="panel hcard ${cls}"><div class="ph"><h3>${title}</h3><span class="muted">${meta}</span></div>${body}</section>`;
const hLinks = items => `<div class="pb hlinks">${items.map(([h, t, s]) => `<a href="${h}"><b>${t}</b><span>${s} ${homeIcon('arrow-up-right')}</span></a>`).join('')}</div>`;
const hFeed = evs => evs.length ? `<ul class="hfeed">${evs.slice(0, 4).map(e => `<li><span class="event-dot ${e.level === 'FAIL' ? 'bad' : ''}"></span><div>${esc(e.msg)}<time>${shortAt(String(e.at))}${safeSource(e.url) ? ` · <a href="${esc(safeSource(e.url))}" target="_blank" rel="noopener noreferrer">원문 ↗</a>` : ''}</time></div></li>`).join('')}</ul>` : '<div class="pb muted">아직 기록된 변동이 없습니다.</div>';
const HOME_SHORTCUTS = [
  ['#dashboard', 'search', '가격 탐색', '모델과 조건별 시장 가격', '01'],
  ['/public-data', 'clock-history', '과거 가격 이력', '첨부 이력과 출처별 관측', '02'],
  ['#bizcase', 'sliders', '사업성 검토', '원가와 투자 시나리오', '03'],
  ['#qa', 'check2-circle', '데이터 검증', '수집 상태와 출처 확인', '04']
];
function homeShortcuts() {
  return `<nav class="home-shortcuts" aria-label="주요 업무 바로가기">${HOME_SHORTCUTS.map(([href, icon, title, description, number]) => `<a href="${href}"><span class="home-shortcut-icon">${homeIcon(icon)}</span><span class="home-shortcut-copy"><small>${number} / WORKSPACE</small><b>${title}</b><span>${description}</span></span><span class="home-shortcut-arrow">${homeIcon('arrow-up-right')}</span></a>`).join('')}</nav>`;
}
function setHomeHero() {
  const art = document.querySelector('#hello .hero-art');
  if (!art || art.dataset.photoReady) return;
  art.dataset.photoReady = 'true';
  art.removeAttribute('aria-hidden');
  art.innerHTML = `<figure class="home-hero-photo"><img src="/static/img/enterprise-datacenter.jpg" alt="서버 랙이 나란히 배치된 데이터센터 내부" width="1800" height="1200" fetchpriority="high"><figcaption>데이터센터 이미지 · Brett Sayles / Pexels</figcaption></figure><div class="home-hero-image-label" aria-hidden="true"><span>POWERING THE NEXT</span><b>Intelligence starts<br>with infrastructure.</b><i></i></div>`;
}
let homeRequest = 0;
async function renderHome() {
  const request = ++homeRequest, m = state.meta;
  setHomeHero();
  if ($('#helloName')) $('#helloName').textContent = '';
  if ($('#helloTag')) $('#helloTag').textContent = '';
  $('#heroHeadline').innerHTML = 'GPU 가격의 흐름을,<br>비즈니스의 기준으로.';
  $('#helloSub').textContent = '시장 가격부터 사업성 검토까지. 판단에 필요한 근거를 한눈에.';
  $('#helloWhy').textContent = '공개 가격 · 동일 단위 환산 · 수집 이력과 출처';
  $('#heroStatus').innerHTML = `<span><i class="status-mark"></i>마지막 수집 <b>${esc(fullAt(m.run.started_at))}</b></span><span>전체 사업자 <b>${m.counts.providers}곳</b></span><span>누적 수집 <b>${m.counts.runs}회</b></span><a href="#qa">데이터 품질 확인 ${homeIcon('arrow-right')}</a>`;
  $('#homeBody').innerHTML = `${homeShortcuts()}<div class="home-loading" role="status">워크스페이스 데이터를 불러오는 중…</div>`;
  const models = m.catalog_models || ['B200', 'B300', 'VR200'];
  const results = await Promise.allSettled(models.map(model => api('/api/prices' + qs({ model, term: 'ON_DEMAND', region: 'ALL', ptype: 'ALL' }))));
  const extra = await Promise.allSettled([
    api('/api/prices' + qs({ model: 'H100', term: 'ON_DEMAND', region: 'ALL', ptype: 'ALL' })),
    api('/api/events?limit=6'),
    api('/api/lifecycle')
  ]);
  if (request !== homeRequest || state.view !== 'home') return;
  const cards = models.map((model, i) => {
    const r = results[i], d = r.status === 'fulfilled' ? r.value : null, k = d?.kpi, cfg = m.gpu_models?.[model] || {};
    const n = k?.providers || 0;
    return `<button type="button" class="market-card ${i === 0 ? 'featured' : ''}" data-open-model="${esc(model)}"><span class="mc-top"><span class="mc-gen">${esc(cfg.priority === 'main' ? '메인 우선순위' : '참조 모델')}</span><span class="mc-arrow">${homeIcon('arrow-up-right')}</span></span><h3>${esc(model)}</h3><span class="mc-label">온디맨드 · 관측 최저가</span><span class="mc-price ${!k?.count ? 'no-price' : ''}">${!d ? '조회 불가' : k?.count ? money(k.min, 'USD') : '관측 가격 없음'}${k?.count ? '<small>/ GPU·시간</small>' : ''}</span><span class="mc-bottom"><span class="pill ${!d ? 'p-bad' : n >= 3 ? 'p-ok' : 'p-warn'}">${!d ? '연결 확인 필요' : n ? `${n}개 사업자 · ${k.count}개 상품` : '수집 결과 없음'}</span><span>${n && n < 3 ? '표본 부족' : n ? '조건별 비교' : '미관측'}</span></span></button>`;
  }).join('');
  const ref = extra[0].status === 'fulfilled' ? extra[0].value : null;
  const events = extra[1].status === 'fulfilled' ? extra[1].value : null;
  const refrows = ref?.rows?.filter(r => r.normalized_price_usd != null).slice(0, 5) || [];
  const reference = hCard('레퍼런스 시장 · H100', '온디맨드 · USD/GPU·시간', ref ? `<div class="reference-summary"><div><span>관측 최저가</span><b>${money(ref.kpi?.min, 'USD')}</b></div><div><span>사업자</span><b>${ref.kpi?.providers || 0}<small>곳</small></b></div><a class="btn" href="#dashboard" data-open-model="H100">상세 비교 ${homeIcon('arrow-up-right')}</a></div><div class="tw"><table class="t"><thead><tr><th>사업자 / 상품</th><th>지역</th><th class="n">관측 단가</th><th>출처·환산</th></tr></thead><tbody>${refrows.map((r, i) => `<tr><td><b>${esc(r.provider_name)}</b><span class="sub2">${esc(r.raw_product_name)}</span></td><td>${esc(r.region || '미확인')}</td><td class="n"><strong>${money(r.normalized_price_usd, 'USD')}</strong>${r.stale ? '<span class="sub2">오래된 값</span>' : ''}</td><td><button class="evidence-btn" data-home-evidence="${i}">근거 보기 ↗</button></td></tr>`).join('') || '<tr><td colspan="4">관측 가격이 없습니다.</td></tr>'}</tbody></table></div><p class="hnote pb">지역·구성 조건이 서로 다를 수 있습니다. 상품별 출처와 구성을 함께 확인하세요.</p>` : '<div class="service-empty"><h3>레퍼런스 가격 조회 불가</h3><a href="#dashboard">가격 대시보드에서 확인 ↗</a></div>', 'home-reference');
  const life = extra[2].status === 'fulfilled' ? extra[2].value : null;
  const analysis = hCard('첨부 과거 가격 이력', 'B300 · B200 / 2024.11–2026.11 조사 범위', '<div class="pb"><p class="hnote">월별 관측 91행을 상품·구성별로 연결했습니다. 관측이 없는 월은 비워두며, 과거 가격을 현재 시세에 섞지 않습니다.</p><a class="btn" href="/static/public-data.html">과거 차트와 원본 보기 ↗</a></div>');
  $('#homeBody').innerHTML = `${homeShortcuts()}
    <section class="home-market" aria-labelledby="homeMarketTitle">
      <div class="section-heading"><div><p class="eyebrow">MARKET SNAPSHOT</p><h2 id="homeMarketTitle">다음 세대의 가격을 먼저 확인하세요.</h2><p class="section-description">관측된 공개 가격을 동일한 단위로 살펴보세요.</p></div><a href="#dashboard">전체 가격 보기 ${homeIcon('arrow-up-right')}</a></div>
      <div class="market-cards">${cards}</div>
      <p class="overview-note">최신 수집 회차 기준 · 전체 지역·구성 · USD/GPU·시간 · 실제 수집 시점과 환산 근거는 상세에서 확인</p>
    </section>
    <div class="workspace-grid">
      <div class="workspace-main">${analysis}${reference}
        <section class="home-research" aria-labelledby="homeResearchTitle"><div class="home-research-image"><img src="/static/img/enterprise-datacenter.jpg" alt="GPU 인프라를 구성하는 데이터센터 서버 랙" width="1800" height="1200" loading="lazy"><span>데이터센터 이미지</span></div><div class="home-research-copy"><p class="eyebrow">RESEARCH DESK</p><h2 id="homeResearchTitle">가격 너머의 조건까지,<br>한눈에 이해하세요.</h2><p>GPU 사양과 사업자 정보를 함께 살펴보고,<br class="research-break">비교에 필요한 기준을 정리하세요.</p><a href="#catalog">GPU·사업자 카탈로그 ${homeIcon('arrow-right')}</a><a href="#compare">모델별 가격 비교 ${homeIcon('arrow-right')}</a></div></section>
      </div>
      <aside class="workspace-side" aria-label="질문과 수집 현황">
        <section class="copilot-card"><span class="copilot-icon" aria-hidden="true">✦</span><p class="eyebrow">PRICING COPILOT</p><h2>질문에서,<br>가격의 근거까지.</h2><p>모델과 계약 조건을 알려주세요.<br>수집된 데이터로 답합니다.</p><form id="homeAsk"><label class="sr" for="homeAskIn">Copilot 질문</label><input id="homeAskIn" placeholder="예: H100 온디맨드 최저가" maxlength="500" required><button aria-label="Copilot에 질문하기">${homeIcon('arrow-right')}</button></form><div class="hchips">${HOME_Q.slice(0, 2).map(q => `<button type="button" data-q="${esc(q)}">${esc(q)} <span>↗</span></button>`).join('')}</div></section>
        ${hCard('수집·가격 변동', '수집된 이벤트', events ? hFeed(events) : '<div class="pb muted">변동 내역을 불러오지 못했습니다.</div>', 'home-events')}
      </aside>
    </div>
    <section class="home-support" aria-labelledby="homeSupportTitle"><div class="home-support-intro"><p class="eyebrow">WORKSPACE SUPPORT</p><h2 id="homeSupportTitle">리서치부터 의사결정까지.</h2><p>확인한 가격을 업무의 다음 단계로 연결하세요.</p></div><div class="home-support-links">${[
      ['#cost', '원가·제안가', '원가 구성과 손익분기점 확인'],
      ['#bizcase', '사업성 시나리오', '입력 가정별 투자 결과 비교'],
      ['#favorites', '관심 사업자', '관심 있는 사업자 모아 보기'],
      ['#inquiries', '문의·지원', '공유 문의와 답변 확인']
    ].map(([href, title, description]) => `<a href="${href}"><span><b>${title}</b><small>${description}</small></span>${homeIcon('arrow-up-right')}</a>`).join('')}</div></section>`;
  state.homeEvidence = refrows;
  $('#homeAsk').onsubmit = e => { e.preventDefault(); const q = $('#homeAskIn').value.trim(); if (q) askFromAnywhere(q); };
  state.homeLife = life;
  if (life) drawLifeSvg(life);
}
function wireHome() {
  $('#homeBody').addEventListener('click', e => {
    const q = e.target.closest('[data-q]'); if (q) askFromAnywhere(q.dataset.q);
    const ev = e.target.closest('[data-home-evidence]'); if (ev) showEvidence(state.homeEvidence[+ev.dataset.homeEvidence], 'H100');
  });
  window.addEventListener('resize', () => { if (state.view === 'home' && $('#hLife') && state.homeLife) drawLifeSvg(state.homeLife); });
}

function drawLifeSvg(life) {
  const svg = $('#hLife'); if (!svg) return;
  const series = life.filter(l => l.points.length > 1 && l.points.every(p => p.months != null)
    && l.points[l.points.length - 1].months - l.points[0].months >= 1);           // 관측 기간 1개월 미만은 추세로 보기 어려워 제외
  const COLS = ['--t-neo', '--t-hyper', '--t-mkt', '--t-kr', '--info', '--warn'];
  if (!series.length) { svg.outerHTML = '<p class="muted">출시일이 있고 1개월 이상 관측된 모델이 아직 없습니다. 수집 이력이 쌓이면 나타납니다.</p>'; return; }
  const W = svg.clientWidth || 640, H = svg.clientHeight || 250, L = 36, R = 70, T = 10, B = 26;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const xs = series.flatMap(l => l.points.map(p => p.months)), ys = series.flatMap(l => l.points.map(p => p.idx));
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), y0 = Math.floor(Math.min(...ys, 90) / 10) * 10, y1 = Math.ceil(Math.max(...ys, 100) / 10) * 10;
  const X = m => L + (W - L - R) * (m - x0) / Math.max(1, x1 - x0), Y = v => T + (H - T - B) * (y1 - v) / Math.max(1, y1 - y0);
  let g = '';
  for (let v = y0; v <= y1; v += 10) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${css('--line-2')}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  const step = Math.max(1, Math.ceil((x1 - x0) / 6));
  for (let m = x0; m <= x1; m += step) g += `<text x="${X(m)}" y="${H - 6}" text-anchor="middle">${m}개월</text>`;
  const labels = [];
  series.forEach((l, k) => {
    const col = css(COLS[k % COLS.length]), pts = l.points;
    g += `<polyline points="${pts.map(p => `${X(p.months)},${Y(p.idx)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>`;
    pts.forEach(p => { g += `<circle cx="${X(p.months)}" cy="${Y(p.idx)}" r="2.6" fill="${col}"><title>${esc(l.model)} 출시 후 ${p.months.toFixed(0)}개월 · 지수 ${p.idx.toFixed(1)} · 중앙값 $${p.v.toFixed(2)}</title></circle>`; });
    const e = pts[pts.length - 1]; labels.push({ x: X(e.months) + 6, y: Y(e.idx) + 4, col, t: `${esc(l.model)} ${e.idx.toFixed(0)}` });
  });
  labels.sort((a, b) => a.y - b.y);                                             // 끝점 라벨이 겹치지 않게 아래로 민다
  labels.forEach((lb, i) => { if (i && lb.y - labels[i - 1].y < 13 && Math.abs(lb.x - labels[i - 1].x) < 60) lb.y = labels[i - 1].y + 13; g += `<text x="${lb.x}" y="${lb.y}" style="fill:${lb.col};font-weight:700">${lb.t}</text>`; });
  svg.innerHTML = g;
  $('#hLifeLegend').innerHTML = series.map((l, k) => `<span><i style="background:var(${COLS[k % COLS.length]})"></i>${esc(l.model)}</span>`).join('');
}

