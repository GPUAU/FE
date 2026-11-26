/* GPU 시세 인덱스 — 화면 스크립트. 모든 데이터는 /api/* (파이프라인 v2 PostgreSQL) 에서 받는다. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/ \[[a-f0-9]{10}\]$/,'').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const TERMS = { ON_DEMAND: '온디맨드', SPOT: '스팟', '1_YEAR': '1년 약정', '3_YEAR': '3년 약정', '5_YEAR': '5년 약정' };
const TYPES = { HYPERSCALER: '하이퍼스케일러', NEOCLOUD: '네오클라우드', MARKETPLACE: '마켓플레이스', DOMESTIC: '국내 클라우드' };
const TYPE_VAR = { HYPERSCALER: '--t-hyper', NEOCLOUD: '--t-neo', MARKETPLACE: '--t-mkt', DOMESTIC: '--t-kr' };
const PALETTE = ['--t-hyper', '--t-neo', '--t-mkt', '--t-kr', '--info', '--warn', '--ok', '--bad'];
const termL = t => TERMS[t] || t, typeL = t => TYPES[t] || t;

const state = { view: 'home', cur: 'USD', fx: null, dbFx: null, meta: null,
  f: { model: null, term: 'ON_DEMAND', region: 'ALL', ptype: 'ALL' },
  t: { model: null, term: 'ON_DEMAND', region: 'ALL', ptype: 'ALL', days: 365 },
  cost: null, costChanges: {}, hist: [], qa: null, user: null, favs: new Set() };
state.bc = BC_INIT();
state.disc = DISC_INIT();
const isAdmin = () => state.user && state.user.role === 'ADMIN';
const ROLE_L = { ADMIN: '관리자', USER: '사용자', PENDING: '승인 대기' };
const charts = {};

/* ---------- API ---------- */
async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch (e) { /* 비 JSON */ }
  if (r.status === 401 || r.status === 403) throw new Error('이 워크스페이스에서 지원하지 않는 작업입니다.');
  if (r.status === 404 && data && data.detail === 'Not Found') throw new Error('서버가 화면보다 이전 버전입니다. 터미널에서 docker compose restart web 을 실행하고, 로그에 Uvicorn running 이 보이면 새로고침하세요.');
  if (!r.ok) {
    const error = new Error((data && data.detail) ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)) : `서버 오류 (${r.status})`);
    error.httpStatus = r.status;
    throw error;
  }
  return data;
}
const qs = o => '?' + new URLSearchParams(o).toString();
async function apiM(method, path) {
  const r = await fetch(path, { method });
  let data = null; try { data = await r.json(); } catch (e) { /* 비 JSON */ }
  if (r.status === 401 || r.status === 403) throw new Error('이 워크스페이스에서 지원하지 않는 작업입니다.');
  if (r.status === 404 && data && data.detail === 'Not Found') throw new Error('서버가 화면보다 이전 버전입니다. 터미널에서 docker compose restart web 을 실행하고, 로그에 Uvicorn running 이 보이면 새로고침하세요.');
  if (!r.ok) throw new Error((data && data.detail) || `서버 오류 (${r.status})`);
  return data;
}

/* ---------- 표시 헬퍼 ---------- */
function money(usd, cur = state.cur, d = 2) {
  if (usd == null || isNaN(usd)) return '—';
  if (cur === 'KRW' && state.fx) return '₩' + Math.round(usd * state.fx).toLocaleString('ko-KR');
  return '$' + Number(usd).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
const pctu = (v, d = 1) => v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d) + '%';
const pct = (v, d = 1) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%';
const shortAt = s => s ? s.slice(5, 16).replace('T', ' ') : '—';
const tsMs = s => Date.parse(s);
const dayStr = ms => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const typeTag = t => `<span class="tier ${t === 'DOMESTIC' ? 'KR_CLOUD' : t}">${typeL(t)}</span>`;
function toast(msg, ms = 4200) { const d = document.createElement('div'); d.className = 'tst'; d.textContent = msg; $('#toast').appendChild(d); setTimeout(() => d.remove(), ms); }
function segment(el, opts, val, on) {
  el.innerHTML = opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(val)}">${esc(l)}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('button'); if (b) on(b.dataset.v); };
}
function chipset(el, opts, val, on) {
  el.innerHTML = opts.map(([v, l, sw]) => `<button type="button" class="chip" data-v="${esc(v)}" aria-pressed="${String(v) === String(val)}">${sw ? `<span class="sw" style="background:var(${sw})"></span>` : ''}${esc(l)}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('button'); if (b) on(b.dataset.v); };
}
function mkChart(id, cfg) { if (charts[id]) charts[id].destroy(); const el = document.getElementById(id); if (el) charts[id] = new Chart(el, cfg); }
function chartBase() { Chart.defaults.font.family = css('--f-sans'); Chart.defaults.font.size = 12; Chart.defaults.color = css('--ink-2'); Chart.defaults.borderColor = css('--line-2'); }
function errBox(el, err) {
  console.warn('화면 데이터 조회 실패:', err.message || err);
  el.innerHTML = `<div class="service-empty" role="status"><span class="empty-symbol">↻</span><h3>데이터를 불러오지 못했습니다</h3><p>이 화면에 필요한 데이터가 아직 준비되지 않았거나 연결이 지연되고 있습니다.<br>다시 시도하거나 가격 대시보드에서 수집된 데이터를 확인해 주세요.</p><div><button class="btn" type="button" data-retry-view>다시 시도</button><a class="btn primary" href="#dashboard">가격 대시보드</a></div></div>`;
}
const modelOpts = () => [...new Set([...(state.meta.catalog_models || []), ...(state.meta.models || [])])].map(m => [m, m + (state.meta.gpu_models?.[m]?.priority === 'main' ? ' · 메인' : ' · 참조')]);
const termOpts = () => state.meta.terms.map(t => [t, termL(t)]);
const regionOpts = () => [['ALL', '전체 지역'], ...state.meta.regions.map(r => [r, r])];
const typeOpts = () => [['ALL', '전체'], ...state.meta.provider_types.map(t => [t, typeL(t), TYPE_VAR[t]])];

/* ---------- 상단 상태 ---------- */
const compatibilityUnavailable = error => [502, 503, 504].includes(error.httpStatus);

async function loadMeta() {
  let m;
  try {
    m = await api('/api/meta');
  } catch (error) {
    if (!compatibilityUnavailable(error)) throw error;
  }
  if (!m?.run) {
    const { isSuccess, result: catalog } = await api('/api/v1/catalog');
    if (!isSuccess || !Array.isArray(catalog?.models) || !Array.isArray(catalog?.providers)) {
      throw new Error('Spring GPU 카탈로그를 읽을 수 없습니다.');
    }
    const names = catalog.models.map(model => model.name);
    const defaultModel = names.includes('B300') ? 'B300' : names[0];
    state.meta = {
      springOnly: true, catalog_models: names, models: names, fresh_hours: 48,
      terms: Object.keys(TERMS), provider_types: catalog.providerTypes || [],
      regions: [...new Set((catalog.regions || []).map(region => region.regionCode).filter(Boolean))],
    };
    state.f.model ||= defaultModel;
    state.t.model ||= defaultModel;
    $('#sLast').textContent = '공통 적재 시각 미제공';
    $('#sCount').textContent = `Spring 카탈로그 · GPU 모델 ${names.length}개 · 사업자 ${catalog.providers.length}곳`;
    return;
  }
  state.meta = m;
  if (m.fx) { state.dbFx = m.fx.rate_to_usd; if (state.fx == null) state.fx = state.dbFx; }
  if (!state.f.model) state.f.model = (m.catalog_models || ['B200'])[0];
  if (!state.t.model) state.t.model = state.f.model;
  $('#sLast').textContent = m.run.started_at.slice(0, 16).replace('T', ' ');
  $('#sCount').innerHTML = `전체 적재 · 상품 <b class="num">${m.counts.products}</b> · 사업자 <b class="num">${m.counts.providers}</b> · 수집 회차 <b class="num">${m.counts.runs}</b> · 원본 <b class="num">${m.counts.raw_rows.toLocaleString()}</b>행`;
  $('#fxIn').value = state.fx ?? '';
  $('#fxSrc').textContent = m.fx ? (state.fx === state.dbFx ? `${m.fx.source} · ${m.fx.rate_at.slice(0, 10)}` : '직접 입력값 (표시용)') : '환율 데이터 없음';
  $('#agentDesc').textContent = `수집된 가격과 출처를 바탕으로 답합니다. ${m.llm ? '자연어로 비교 조건을 입력해 보세요.' : '현재는 정해진 가격 조회 질문을 지원합니다.'} 모델·지역·계약 조건이 부족하면 먼저 확인합니다. 미래 가격은 예측하지 않습니다.`;
}

/* ---------- 1. 대시보드 ---------- */
let dashboardRequest = 0;
async function renderDash() {
  const request = ++dashboardRequest;
  const f = { ...state.f };
  const select = (key, value) => { state.f[key] = value; renderDash(); };
  readableModelPicker($('#fModel'), f.model, v => select('model', v));
  segment($('#fTerm'), termOpts(), f.term, v => select('term', v));
  $('#fRegion').innerHTML = regionOpts().map(([v, l]) => `<option value="${esc(v)}" ${v === f.region ? 'selected' : ''}>${esc(l)}</option>`).join('');
  $('#fRegion').onchange = e => select('region', e.target.value);
  chipset($('#fType'), typeOpts(), f.ptype, v => select('ptype', v));
  $('#typeLegend').innerHTML = state.meta.provider_types.map(t => `<span><i style="background:var(${TYPE_VAR[t] || '--ink-3'})"></i>${typeL(t)}</span>`).join('');
  let d;
  setDashboardPending(f);
  try { d = await api('/api/prices' + qs({ model: f.model, term: f.term, region: f.region, ptype: f.ptype })); }
  catch (e) { if (request !== dashboardRequest) return; $('#v-dashboard').removeAttribute('aria-busy'); errBox($('#kpis'), e); $('#dashTbl').innerHTML = ''; $('#dashCount').textContent = ''; $('#selectionSummary').textContent = '선택 조건 조회 실패'; $('#barBox').hidden = true; $('#barNote').textContent = '가격 데이터를 조회하지 못했습니다.'; return; }
  if (request !== dashboardRequest || state.view !== 'dashboard') return;
  const k = d.kpi, rows = d.rows;
  rows.sort((a, b) => ((a.normalized_price_usd == null) * 2 + !!a.stale) - ((b.normalized_price_usd == null) * 2 + !!b.stale) || (a.normalized_price_usd || 0) - (b.normalized_price_usd || 0));
  const priced = rows.filter(r => r.normalized_price_usd != null);
  const unpr = rows.length - priced.length, stale = priced.filter(r => r.stale);
  $('#chartTitle').textContent = `${f.model} · ${termL(f.term)} 환산 단가 (${state.cur === 'KRW' ? '₩' : 'USD'}/GPU·시간)`;
  $('#barBox').style.height = Math.max(120, priced.length * 30 + 40) + 'px';
  const conv = v => state.cur === 'KRW' && state.fx ? Math.round(v * state.fx) : v;
  mkChart('barChart', { type: 'bar', data: { labels: priced.map(r => `${r.provider_name} · ${r.raw_product_name}`),
    datasets: [{ data: priced.map(r => conv(r.normalized_price_usd)), backgroundColor: priced.map(r => css(TYPE_VAR[r.provider_type] || '--ink-3') + (r.stale ? '55' : 'DD')), borderRadius: 3, barThickness: 18 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => { const r = priced[c.dataIndex]; return [`${money(r.normalized_price_usd)} /GPU·시간`, r.stale ? `오래된 데이터 (${shortAt(r.collected_at)}) — 통계 제외` : `수집 ${shortAt(r.collected_at)}`]; } } } },
      scales: { x: { beginAtZero: true, ticks: { callback: v => state.cur === 'KRW' ? '₩' + Number(v).toLocaleString() : '$' + v } }, y: { grid: { display: false }, ticks: { color: css('--ink'), callback(v) { const l = this.getLabelForValue(v); return l.length > 34 ? l.slice(0, 33) + '…' : l; } } } } } });
  $('#barNote').textContent = [`표시 ${priced.length}개 상품 · 회차 기준 유효 ${priced.length-stale.length}개 · 참고 ${stale.length}개`, unpr ? `미공개·환산 불가 ${unpr}건은 차트 제외` : '', stale.length ? `흐린 막대 ${stale.length}건은 오래된 데이터 (통계 제외)` : ''].filter(Boolean).join(' · ');

  state.dashRows = rows;
  enhanceDashboard(d);
  renderEvents();
}
async function renderEvents() {
  const LV = { FAIL: ['p-bad', '수집 실패'], ANOMALY: ['p-warn', '가격 급변'], FX: ['p-info', '환율 착시'], NEW: ['p-new', '신규 상품'], REMOVED: ['p-bad', '상품 사라짐'], INFO: ['p-info', '배치'], LAUNCH: ['p-new', '첫 공개'] };
  try {
    const ev = await api('/api/events?limit=20');
    $('#logList').innerHTML = ev.map(l => `<li><span class="lv pill ${(LV[l.level] || ['p-info'])[0]}">${(LV[l.level] || [, esc(l.level)])[1]}</span><span class="m">${esc(l.msg)}</span><time>${shortAt(l.at)}${l.url ? ` · <a href="${esc(l.url)}" target="_blank" rel="noopener">원문</a>` : ''}</time></li>`).join('') || '<li class="muted">기록 없음</li>';
  } catch (e) { $('#logList').innerHTML = `<li class="err">${esc(e.message)}</li>`; }
}

/* ---------- 2. 추이·시차·생애주기 ---------- */
const evPlugin = { id: 'ev', afterDatasetsDraw(c) {
  const o = c.options.plugins.ev; if (!o || !o.events) return; const { ctx, chartArea: a, scales: { x } } = c;
  ctx.save(); ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.setLineDash([4, 4]); ctx.font = '600 11px ' + css('--f-sans');
  o.events.forEach((e, i) => { const px = x.getPixelForValue(e.t); if (px < a.left || px > a.right) return; ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke(); ctx.fillText('E' + (i + 1), Math.min(px + 4, a.right - 20), a.top + 12); });
  ctx.restore(); } };
let trendRequest = 0;
async function renderTrend() {
  const request = ++trendRequest;
  const t = state.t;
  chipset($('#tModel'), modelOpts(), t.model, v => { t.model = v; renderTrend(); });
  segment($('#tTerm'), termOpts(), t.term, v => { t.term = v; renderTrend(); });
  $('#tRegion').innerHTML = regionOpts().map(([v, l]) => `<option value="${esc(v)}" ${v === t.region ? 'selected' : ''}>${esc(l)}</option>`).join('');
  $('#tRegion').onchange = e => { t.region = e.target.value; renderTrend(); };
  segment($('#tPeriod'), [['90', '90일'], ['180', '6개월'], ['365', '1년'], ['3650', '전체']], t.days, v => { t.days = +v; renderTrend(); });
  chipset($('#tType'), typeOpts(), t.ptype, v => { t.ptype = v; renderTrend(); });
  $('#trendTitle').textContent = `${t.model} · ${termL(t.term)} · ${t.region === 'ALL' ? '전체 지역' : t.region}`;
  $('#trendChart').parentElement.hidden=true;
  if(charts.trendChart){charts.trendChart.destroy();delete charts.trendChart;}
  $('#trendIns').innerHTML='<div class="ins" role="status">선택한 조건의 관측 이력을 불러오고 있습니다.</div>';
  $('#trendObservations')?.remove();$('#chgTbl').innerHTML='';$('#trendEv').innerHTML='';
  let d; try { d = await api('/api/trend' + qs({ model: t.model, term: t.term, region: t.region, ptype: t.ptype, days: t.days })); } catch (e) { if(request===trendRequest)errBox($('#trendIns'), e); return; }
  if(request!==trendRequest || state.view!=='trend')return;
  $('#trendChart').parentElement.hidden=false;
  const conv = v => state.cur === 'KRW' && state.fx ? v * state.fx : v;
  // Plot only observed values; do not carry forward old values into market statistics.
  const times = [...new Set(d.series.flatMap(s => s.pts.map(p => tsMs(p[0]))))].sort((a,b)=>a-b);
  const ds = d.series.map((s,i)=>({label:s.name, data:s.pts.map(([at,v])=>({x:tsMs(at),y:conv(v)})), borderColor:css(PALETTE[i%PALETTE.length]),backgroundColor:css(PALETTE[i%PALETTE.length]),borderWidth:1.5,pointRadius:3.5,showLine:false}));
  const evs = d.events.map(e => ({ t: Date.parse(e.event_date + 'T00:00:00+09:00'), d: e.event_date, title: e.description, factor: e.factor, chg: e.change_pct }));
  mkChart('trendChart', { type: 'line', data: { datasets: ds }, plugins: [evPlugin],
    options: { maintainAspectRatio: false, animation: false, parsing: false, interaction: { mode: 'nearest', intersect: false, axis: 'x' },
      plugins: { ev: { events: evs, color: css('--warn') }, legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } },
        tooltip: { callbacks: { title: it => dayStr(it[0].parsed.x), label: c => `${c.dataset.label}: ${state.cur === 'KRW' ? '₩' + Math.round(c.parsed.y).toLocaleString() : '$' + c.parsed.y.toFixed(2)}` } } },
      scales: { x: { type: 'linear', ticks: { callback: v => dayStr(v).slice(2, 7).replace('-', '.'), maxTicksLimit: 8 } }, y: { ticks: { callback: v => state.cur === 'KRW' ? '₩' + Math.round(v).toLocaleString() : '$' + v.toFixed(2) } } } } });
  const observations=d.series.reduce((n,s)=>n+s.pts.length,0);
  $('#trendIns').innerHTML=`<div class="ins"><b>${observations}개 관측값 · ${d.series.length}개 상품</b>${times.length?` · ${dayStr(times[0])} ~ ${dayStr(times[times.length-1])}`:''}<br>${times.length<2?'관측 시점이 2개 미만이므로 가격 추이를 판단할 수 없습니다.':'점은 실제 저장된 관측값입니다. 점 사이 기간의 가격은 확인되지 않았습니다.'} 이전 가격을 이월한 중앙값과 보간선은 표시하지 않습니다.</div>`;
  let evidenceList=$('#trendObservations');
  if(!evidenceList){evidenceList=document.createElement('details');evidenceList.id='trendObservations';evidenceList.className='panel collection-details';$('#trendIns').after(evidenceList);}
  evidenceList.innerHTML=`<summary><span><b>상품별 관측 범위와 출처</b><small>관측 횟수는 상품 수나 GPU 장수와 다릅니다.</small></span><span>⌄</span></summary><div class="tw"><table class="t"><thead><tr><th>사업자 · 상품</th><th>관측 수</th><th>첫 관측</th><th>마지막 관측</th><th>출처</th></tr></thead><tbody>${d.series.map(s=>{const url=safeSource(s.url);return `<tr><td>${esc(s.name)}</td><td>${s.pts.length}회</td><td>${esc(fullAt(s.pts[0]?.[0]))}</td><td>${esc(fullAt(s.pts[s.pts.length-1]?.[0]))}</td><td>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">원문 ↗</a>`:'미제공'}</td></tr>`;}).join('')||'<tr><td colspan="5">관측 이력이 없습니다.</td></tr>'}</tbody></table></div><p class="comparison-footnote">상품의 출처 링크입니다. 관측 당시의 보존 원문과 상세 환산 근거는 이 목록에서 제공하지 않습니다.</p>`;
  $('#trendEv').innerHTML = evs.map((e, i) => `<div class="ev"><b>E${i + 1}</b><span class="num muted">${e.d}</span><span>${esc(e.title)} <span class="muted">(${esc(e.factor)} ${e.chg > 0 ? '+' : ''}${e.chg}%)</span></span></div>`).join('');
  $('#chgTbl').innerHTML = `<thead><tr><th>최초 관측</th><th>사업자</th><th>상품</th><th class="n">이전</th><th class="n">현재</th><th class="n">변동률</th><th class="n">원본가 효과</th><th class="n">환율 효과</th><th>구분</th></tr></thead><tbody>` +
    (d.changes.map(c => `<tr><td class="num">${shortAt(c.first_observed_at)}</td><td class="prov">${esc(c.provider_name)}</td><td>${esc(c.raw_product_name)}</td><td class="n">${money(c.prev_price_usd)}</td><td class="n">${money(c.curr_price_usd)}</td><td class="n ${c.price_delta_rate > 0 ? 'up' : 'down'}">${c.price_delta_rate > 0 ? '+' : ''}${Number(c.price_delta_rate).toFixed(2)}%</td><td class="n">${Number(c.price_effect_usd).toFixed(4)}</td><td class="n">${Number(c.fx_effect_usd).toFixed(4)}</td><td>${c.is_raw_price_changed ? '<span class="pill p-info">원본가 변경</span>' : '<span class="pill p-warn">환율 요인</span>'}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">기간 내 변동 없음</td></tr>') + '</tbody>';
  renderLag(); renderLife();
}
async function renderLag() {
  try {
    const d = await api('/api/lag');
    const weeks = d.lag.flatMap(x => x.reactions.map(r => r.weeks));
    $('#lagBox').innerHTML = d.lag.map(x => `<div style="margin-bottom:10px"><div><b class="num">${esc(x.event.event_date)}</b> ${esc(x.event.description)}</div>${x.reactions.length ? `<ul style="margin:4px 0 0;padding-left:18px;font-size:13px">${x.reactions.map(r => `<li>${esc(r.provider)} — ${esc(r.date)} 인상 ${money(r.old)} → ${money(r.new)} (${pct(r.change_pct)}) · <b>${r.weeks}주</b> 후행</li>`).join('')}</ul>` : '<div class="muted">90일 이내 원본가 인상 없음</div>'}</div>`).join('') +
      (weeks.length ? `<div class="ins">후행 시차 ${Math.min(...weeks)}주 ~ ${Math.max(...weeks)}주 (평균 ${(weeks.reduce((a, b) => a + b, 0) / weeks.length).toFixed(1)}주)</div>` : '');
    $('#fxTbl').innerHTML = `<thead><tr><th>관측</th><th>사업자 · 상품</th><th class="n">환산가 변화</th><th class="n">환율 효과</th></tr></thead><tbody>` +
      (d.fx_only.map(r => `<tr><td class="num">${shortAt(r.first_observed_at)}</td><td>${esc(r.provider_name)} · ${esc(r.raw_product_name)}</td><td class="n">${money(r.prev_price_usd)} → ${money(r.curr_price_usd)}</td><td class="n">${Number(r.fx_effect_usd).toFixed(4)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">환율만으로 움직인 건 없음</td></tr>') + '</tbody>';
  } catch (e) { errBox($('#lagBox'), e); }
}
async function renderLife() {
  let life; try { life = await api('/api/lifecycle'); } catch (e) { errBox($('#lifeNote'), e); return; }
  const hasLaunch = life.every(l => l.launch_date);
  mkChart('lifeChart', { type: 'line', data: { datasets: life.map((l, i) => ({ label: l.model, data: l.points.map(p => ({ x: hasLaunch ? p.months : tsMs(p.at), y: p.idx })), borderColor: css(PALETTE[i % PALETTE.length]), backgroundColor: css(PALETTE[i % PALETTE.length]), borderWidth: 2, pointRadius: 3 })) },
    options: { maintainAspectRatio: false, animation: false, parsing: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: { callbacks: { title: it => hasLaunch ? `출시 후 ${it[0].parsed.x.toFixed(1)}개월` : dayStr(it[0].parsed.x), label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(0)}` } } },
      scales: { x: { type: 'linear', title: { display: true, text: hasLaunch ? '출시 후 개월' : '관측일' }, ticks: hasLaunch ? {} : { callback: v => dayStr(v).slice(2, 7) } }, y: { title: { display: true, text: '첫 관측 = 100' } } } } });
  $('#lifeTbl').innerHTML = `<thead><tr><th>모델</th><th>출시일</th><th class="n">첫 관측 평균가</th><th class="n">최근 중앙값</th><th class="n">연쇄 지수</th><th class="n">관측 회차</th></tr></thead><tbody>` +
    life.map(l => { const last = l.points[l.points.length - 1]; return `<tr><td class="prov">${esc(l.model)}</td><td class="num">${esc(l.launch_date || '—')}</td><td class="n">${money(l.base)}<span class="sub2">${shortAt(l.base_at)}</span></td><td class="n">${money(last.v)}</td><td class="n">${last.idx.toFixed(0)}</td><td class="n">${l.points.length}</td></tr>`; }).join('') + '</tbody>';
  $('#lifeNote').textContent = '연쇄 지수는 같은 상품의 가격 변화만 이어 붙인 값이라, 비싼 상품이 새로 수집되거나 빠져도 튀지 않습니다. 관측 회차가 적은 모델은 지수로 해석하기 어렵습니다. 수집 이력이 쌓일수록 “출시 후 몇 개월에 몇 % 하락” 패턴을 검증할 수 있습니다. 출시일은 등록된 참고값이며, 실제 출시 근거와 별도로 확인해야 합니다.';
}

/* ---------- 3. 원가 (파이프라인 GPUCostSimulator) ---------- */
const COST_FIELDS = [
  ['h', '서버·감가상각'], ['gpu_model', 'GPU 모델', '', 'text'], ['server_purchase_price', '서버 1대 구매가', 'USD', 1000], ['gpus_per_server', '서버당 GPU 수', '장', 1], ['amortization_months', '감가상각 기간', '개월', 1],
  ['h', '금융'], ['loan_ratio', '대출 비율', '%', 1], ['loan_interest_rate', '대출 금리', '%/년', 0.1],
  ['h', '데이터센터'], ['rack_rental_fee', '랙 월 임차료', 'USD', 50], ['nodes_per_rack', '랙당 서버 수', '대', 1], ['server_power_kw', '서버 정격 전력', 'kW', 0.1], ['pue', 'PUE', '배', 0.05], ['electricity_kwh_rate', '전기료', 'USD/kWh', 0.005], ['mgmt_cost_per_node_month', '노드당 월 운용비', 'USD', 50],
  ['h', '가동·가격 정책'], ['target_utilization', '목표 가동률', '%', 1], ['market_reference_price', '시장 기준가 (비우면 수집 평균)', 'USD', 0.05], ['target_margin_on_demand', '온디맨드 목표 마진', '%', 0.5], ['target_margin_3yr', '3년 약정 목표 마진', '%', 0.1], ['min_margin_3yr', '3년 약정 최저 마진', '%', 0.1], ['alert_margin_threshold', '마진 알림 기준', '%', 0.5],
];
const BREAK_L = { monthly_amortization: '월 감가상각', monthly_interest: '월 대출 이자', monthly_capital: '월 금융 자본 원가', monthly_ops: '월 인프라 고정비 (랙+운용)', hourly_power_node: '시간당 전력비 (노드)', billable_hours: '월 과금 시간', fixed_cost_per_hour_node: '과금시간당 고정비 (노드)', bep_per_gpu_hour_exact: 'GPU·시간 BEP (정밀)', bep_per_gpu_hour: 'GPU·시간 BEP' };
let simTimer = null;
async function renderCost() {
  if (!state.cost) { try { state.cost = await api('/api/cost'); } catch (e) { errBox($('#costBig'), e); return; } }
  if (state.cost.configured === false) { $('#costBig').innerHTML = `<div class="service-empty"><h3>새 원가 자료를 입력해야 합니다</h3><p>${esc(state.cost.message)}</p><a href="#dashboard">수집 가격 비교로 이동</a></div>`; $('#costForm').innerHTML = ''; return; }
  const base = state.cost.master;
  $('#costForm').innerHTML = COST_FIELDS.map(([k, l, u, st]) => k === 'h' ? `<h4>${l}</h4>` :
    `<label for="c_${k}">${l} <span class="u">${u}</span><input class="inp ${st === 'text' ? '' : 'num'}" id="c_${k}" ${st === 'text' ? 'type="text"' : `type="number" step="${st}"`} value="${esc(state.costChanges[k] ?? base[k] ?? '')}"></label>`).join('');
  COST_FIELDS.forEach(([k, , , st]) => { if (k === 'h') return; $('#c_' + k).oninput = e => { const raw = e.target.value; state.costChanges[k] = st === 'text' ? raw : (raw === '' ? null : parseFloat(raw)); clearTimeout(simTimer); simTimer = setTimeout(simulate, 250); }; });
  $('#verList').innerHTML = state.cost.versions.map(v => `<li><span><b class="num">${esc(v.cost_version)}</b> ${esc(v.gpu_model)} ${v.is_active ? '<span class="pill p-ok">활성</span>' : ''}</span><span class="muted num">BEP $${Number(v.calculated_bep_hour).toFixed(2)} · ${shortAt(v.updated_at)}</span></li>`).join('');
  $('#dList').oninput = $('#dRate').oninput = () => { clearTimeout(simTimer); simTimer = setTimeout(simulate, 250); };
  await simulate();
}
async function simulate() {
  const lp = parseFloat($('#dList').value), dr = parseFloat($('#dRate').value);
  let r;
  try { r = await api('/api/cost/simulate', { changes: state.costChanges, list_price: lp > 0 ? lp : null, discount_rate: isNaN(dr) ? null : dr / 100 }); }
  catch (e) { errBox($('#costRec'), e); return; }
  const changed = Object.keys(state.costChanges).length > 0;
  $('#costTitle').textContent = `${r.master.gpu_model} · 원가 버전 ${r.master.cost_version}${changed ? ' (변경 계산 중, 미저장)' : ''}`;
  $('#costSub').textContent = r.market_avg ? `수집 온디맨드 평균 ${money(r.market_avg)}` : '';
  const rec = r.recommend;
  $('#costBig').innerHTML = `
    <div class="kpi"><div class="lbl">BEP (마지노선 원가)</div><div class="v">${money(r.bep)}</div><div class="s">/GPU·시간 · 이 아래로 팔면 손실</div></div>
    <div class="kpi ${rec.status !== 'OK' ? 'warn' : ''}"><div class="lbl">추천 온디맨드 제안가</div><div class="v">${rec.price ? money(rec.price) : '제안 중단'}</div><div class="s">${rec.status === 'OK' ? `마진 ${pctu(rec.margin, 2)} · ${esc(rec.rule)}` : esc(rec.message || '시장 기준가 없음')}</div></div>
    <div class="kpi"><div class="lbl">추천 3년 약정가</div><div class="v">${money(r.three_year.price)}</div><div class="s">이익률 ${pctu(r.three_year.margin)} · 방어선 ${money(r.three_year.floor_price)}</div></div>`;
  $('#costRec').innerHTML = rec.status === 'OK' ? `<div class="ins">목표 마진 ${r.master.target_margin_on_demand}% 반영가는 <b>${money(rec.target_price)}</b>, 시장 기준가는 <b>${money(r.reference_price)}</b>입니다. 영업 할인 한계선은 <b>${pctu(r.discount_limit, 2)}</b>이며, 이를 넘는 할인은 시스템에서 차단합니다.${r.margin_alert ? ` <b class="up">마진이 알림 기준 ${r.master.alert_margin_threshold}% 미만입니다.</b>` : ''}</div>` : `<div class="caution">⛔ 역마진 위험 — ${esc(rec.message || '')} 목표 마진가 ${money(rec.target_price)}, 시장 기준가 ${money(r.reference_price)}</div>`;
  if (!$('#dList').value && rec.price) $('#dList').placeholder = rec.price.toFixed(2);
  $('#costBreak').innerHTML = Object.entries(r.breakdown).map(([k, v]) => `<dt>${BREAK_L[k] || k}</dt><dd>${k === 'billable_hours' ? v + 'h' : (k.startsWith('monthly') ? '$' + Number(v).toLocaleString() : '$' + v)}</dd>`).join('');
  const dc = r.discount_check;
  $('#dOut').innerHTML = dc ? `<div class="${dc.allowed ? 'ins' : 'caution'}">${dc.allowed ? '✓ 허용' : '⛔ 차단'} — 제시가 ${money(dc.offered_price)} · 한계 ${pctu(dc.limit_rate, 2)}${dc.allowed ? '' : `<br>${esc(dc.message)}`}</div>` : '<div class="muted">책정가와 할인율을 넣으면 허용 여부를 판정합니다.</div>';
  $('#mktSub').textContent = `${r.master.gpu_model} 최신 정상 단가 기준`;
  $('#costMkt').innerHTML = `<thead><tr><th>계약 조건</th><th class="n">시장 중앙값</th><th class="n">시장 최저가</th><th class="n">표본</th><th class="n">중앙값에 팔 때 마진</th><th class="n">최저가에 팔 때 마진</th><th>판단</th></tr></thead><tbody>` +
    (r.market.map(m => { const v = m.margin_at_min < 0 && m.margin_at_median < 0 ? '<span class="pill p-bad">역마진</span>' : m.margin_at_min < 0 ? '<span class="pill p-warn">최저가 경쟁 시 역마진</span>' : m.margin_at_median < r.master.alert_margin_threshold / 100 ? '<span class="pill p-warn">마진 알림 기준 미만</span>' : '<span class="pill p-ok">마진 확보</span>';
      return `<tr><td>${termL(m.term)}</td><td class="n">${money(m.median)}</td><td class="n">${money(m.min)}</td><td class="n">${m.n}</td><td class="n ${m.margin_at_median < 0 ? 'up' : ''}">${pct(m.margin_at_median)}</td><td class="n ${m.margin_at_min < 0 ? 'up' : ''}">${pct(m.margin_at_min)}</td><td>${v}</td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">이 모델의 최신 시장 가격이 없습니다.</td></tr>') + '</tbody>';
  const tab = r.commitments;
  $('#commitTbl').innerHTML = `<thead><tr><th>사업자</th><th class="n">온디맨드</th>${tab.terms.map(t => `<th class="n">${termL(t)}</th><th class="n">할인율</th>`).join('')}</tr></thead><tbody>` +
    (tab.rows.map(x => `<tr><td class="prov">${esc(x.provider)}</td><td class="n">${money(x.on_demand)}</td>${tab.terms.map(t => x[t].price != null ? `<td class="n">${money(x[t].price)}</td><td class="n down">${pct(-x[t].discount)}</td>` : `<td class="n muted" colspan="2">${esc(x[t].status)}${x[t].reason ? ' · ' + esc(x[t].reason) : ''}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${2 + tab.terms.length * 2}" class="muted">약정 가격 데이터가 없습니다.</td></tr>`) + '</tbody>';
}

/* ---------- 4. Copilot ---------- */
const ROUTE_L = { TOOL_Q1: 'Q1 시장 가격 도구', TOOL_Q2: 'Q2 약정 할인 도구', TOOL_Q3: 'Q3 원가 시차 도구', TOOL_Q4: 'Q4 단종·신규 도구', TOOL_Q5: 'Q5 자사 제안가 도구', CLARIFY: '조건 확인 필요' };
function mdRender(text) {
  const lines = String(text).split('\n'); let out = '', i = 0;
  const inline = s => esc(TERMS[s] || s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(https?:\/\/[^\s|<]+)/g, '<a href="$1" target="_blank" rel="noopener">원문</a>');
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const body = rows.filter((r, j) => !(j === 1 && /^[\s|:-]+$/.test(r)));
      out += `<div class="tw"><table><thead><tr>${cells(body[0]).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.slice(1).map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      continue;
    }
    if (!l.trim()) out += '<div style="height:6px"></div>';
    else if (/^\s*[•·\-]/.test(l)) out += `<p class="bul">${inline(l.trim())}</p>`;
    else out += `<p>${inline(l)}</p>`;
    i++;
  }
  return out;
}
async function ask(text) {
  text = text.trim(); if (!text) return;
  const feed = $('#feed'); $('#agentWelcome')?.remove(); feed.insertAdjacentHTML('beforeend', `<div class="msg-u">${esc(text)}</div>`);
  const box = document.createElement('div'); box.className = 'msg-a'; box.innerHTML = '<span class="muted">조회 중…</span>'; feed.appendChild(box);
  state.hist.unshift(text); renderHist();
  try {
    const r = await api('/api/ask', { question: text });
    const label = ROUTE_L[r.route] || (r.route.startsWith('TEXT2SQL') ? `Text-to-SQL · ${r.route.replace('TEXT2SQL_', '')}` : r.route);
    let html = `<div class="hd"><span class="${r.route === 'CLARIFY' ? 'pill p-warn' : 'route'}">${esc(label)}</span>${r.route !== 'CLARIFY' ? '<span class="ground">✓ DB 근거 답변</span>' : ''}${r.used_llm ? '<span class="pill p-warn">LLM 호출 · 과금</span>' : '<span class="pill p-ok">LLM 미사용</span>'}</div><div class="md">${mdRender(r.text)}</div>`;
    if (r.route === 'CLARIFY' && /모델/.test(r.text)) html += `<div class="chips" style="margin-top:8px">${state.meta.models.map(m => `<button type="button" class="chip" data-ask="${esc(m + ' ' + text)}">${esc(m)}</button>`).join('')}</div>`;
    if (r.sql) html += `<details><summary>실행된 SQL (가드레일 통과·읽기 전용)</summary><pre class="code">${esc(r.sql)}</pre></details>`;
    box.innerHTML = html;
    enhanceReadableAnswer(box, r);
    box.querySelectorAll('[data-ask]').forEach(b => b.onclick = () => ask(b.dataset.ask));
  } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  renderUsage();
  box.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function renderHist() { $('#histQs').innerHTML = state.hist.length ? state.hist.slice(0, 8).map(h => `<button type="button" class="qbtn" data-q="${esc(h)}">${esc(h)}</button>`).join('') : '<span class="muted">아직 없음</span>'; }

async function renderUsage() {
  try { const me = await api('/api/workspace'); const u = me.usage; $('#usageBox').innerHTML = `<b>워크스페이스 사용량</b><br>오늘 질문 <b>${u.today}</b>회 · 이번 달 LLM 호출 <b>${u.llm_month}</b>회 · 누적 ${u.total}회<br><span class="muted">Q1~Q5 도구 답변은 LLM을 쓰지 않아 과금되지 않습니다.</span>`; }
  catch (e) { $('#usageBox').textContent = ''; }
}

/* ---------- 7. 사용자 관리 (관리자) ---------- */
async function renderUsers() {
  if (!isAdmin()) { location.hash = '#dashboard'; return; }
  let us; try { us = await api('/api/admin/users'); } catch (e) { errBox($('#userTbl'), e); return; }
  state.users = us; $('#userCount').innerHTML = tr('countFmt', us.length);
  $('#usersDesc').textContent = `가입한 사용자의 역할을 정합니다. 현재 가입 정책: ${state.autoApprove ? '가입 즉시 사용 (데모, AUTH_AUTO_APPROVE=1)' : '관리자 승인 후 사용 (AUTH_AUTO_APPROVE=0)'}. Pricing Copilot은 과금 대상이라 USER 이상만 쓸 수 있고, 호출은 사용자별로 기록됩니다.`;
  $('#userTbl').innerHTML = `<thead><tr><th>이름</th><th>소속</th><th>직위</th><th>이메일</th><th>역할</th><th>가입</th><th>최근 로그인</th><th class="n">질문</th><th class="n">LLM 호출</th></tr></thead><tbody>` +
    us.map(u => `<tr class="${u.role === 'PENDING' ? 'best' : ''}"><td class="prov">${esc(u.display_name)}</td><td>${esc(u.department || '—')}</td><td>${esc(u.position || '—')}</td><td>${esc(u.email)}</td>
      <td><select class="sel" data-uid="${u.user_id}" aria-label="${esc(u.email)} 역할" ${u.user_id === state.user.user_id ? 'disabled' : ''}>${['PENDING', 'USER', 'ADMIN'].map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_L[r]}</option>`).join('')}</select></td>
      <td class="num">${shortAt(u.created_at)}</td><td class="num">${shortAt(u.last_login_at)}</td><td class="n">${u.asks}</td><td class="n">${u.llm_asks}</td></tr>`).join('') + '</tbody>';
  $('#userTbl').querySelectorAll('select[data-uid]').forEach(sel => sel.onchange = async () => {
    try { const r = await api(`/api/admin/users/${sel.dataset.uid}/role`, { role: sel.value }); toast(`${r.email} → ${ROLE_L[r.role]}`); renderUsers(); }
    catch (e) { toast(e.message, 5000); renderUsers(); }
  });
}

/* ---------- 5. QA ---------- */
function qaSummary(results) {
  const J = ['PASS', 'FAIL', 'MISS', 'ERROR'];
  return ['COLLECT', 'CONVERT', 'AGENT'].map(k => { const c = results.filter(r => r.test_type === k); const by = Object.fromEntries(J.map(j => [j, c.filter(r => r.judgment === j).length])); return { k, total: c.length, by, rate: c.length ? by.PASS / c.length * 100 : null }; });
}
async function renderQA(run = false) {
  try {
    if (run) { const r = await api('/api/qa', { tolerance: Math.max(0, parseFloat($('#qaTol').value) || 0) }); state.qa = { version: r.version, results: r.results.map(x => ({ ...x, failure_reason: x.reason, actual_price_usd: x.actual })) }; toast('검증 완료 — qa_results_log에 저장했습니다'); }
    else if (!state.qa) { state.qa = await api('/api/qa/latest'); }
  } catch (e) { errBox($('#qaCards'), e); return; }
  if (!state.qa) { $('#qaCards').innerHTML = '<div class="muted">아직 검증 기록이 없습니다. ‘검증 실행’을 누르세요.</div>'; $('#qaMatrix').innerHTML = ''; $('#qaFails').innerHTML = ''; return; }
  const line = parseFloat($('#qaLine').value) || 95, res = state.qa.results, stat = qaSummary(res);
  const N = { COLLECT: ['수집 정확도', '최신 회차 수집값 = 정답셋'], CONVERT: ['단가 환산 정확도', '원본가·USD/GPU·시간 환산 일치'], AGENT: ['Copilot 답변 일치율', '답변에 필수 값이 모두 포함'] };
  $('#qaVer').textContent = `실행 버전 ${state.qa.version} · ${res.length}건`;
  $('#qaCards').innerHTML = stat.map(s => s.total ? `<div class="qac ${s.rate >= line ? 'pass' : 'fail'}"><div class="lbl">${N[s.k][0]}</div><div class="v">${s.rate.toFixed(1)}%</div><div class="muted">${s.by.PASS} / ${s.total}건 · ${N[s.k][1]}</div><div class="bar"><div style="width:${s.rate}%;background:var(${s.rate >= line ? '--ok' : '--bad'})"></div><i style="left:${line}%"></i></div><div style="margin-top:8px">${s.rate >= line ? '<span class="pill p-ok">합격</span>' : '<span class="pill p-bad">불합격</span>'} <span class="muted">합격선 ${line}%</span></div></div>` : '').join('');
  $('#qaMatrix').innerHTML = `<thead><tr><th>지표</th><th class="n">PASS</th><th class="n">FAIL</th><th class="n">MISS</th><th class="n">ERROR</th><th class="n">합계</th><th>판정</th></tr></thead><tbody>` +
    stat.map(s => `<tr><td>${N[s.k][0]}</td>${['PASS', 'FAIL', 'MISS', 'ERROR'].map(j => `<td class="n">${s.by[j]}</td>`).join('')}<td class="n"><b>${s.total}</b></td><td>${s.total ? (s.rate >= line ? '<span class="pill p-ok">합격</span>' : '<span class="pill p-bad">불합격</span>') : '—'}</td></tr>`).join('') + '</tbody>';
  const JL = { FAIL: ['p-bad', '오답'], MISS: ['p-warn', '누락'], ERROR: ['p-bad', '실패'] };
  $('#qaFails').innerHTML = res.filter(r => r.judgment !== 'PASS').map(r => `<li><span class="pill ${JL[r.judgment][0]}">${JL[r.judgment][1]}</span> <b>#${r.case_id}</b> [${esc(r.test_type)}] ${r.test_type === 'AGENT' ? `“${esc(r.eval_question)}”` : `${esc(r.expected_provider_id)} ${esc(r.expected_gpu_model)} ${termL(r.expected_contract)}`} <span class="muted">· 기대 ${r.expected_price_usd != null ? '$' + Number(r.expected_price_usd).toFixed(4) : '—'} · 실제 ${r.actual_price_usd != null ? '$' + Number(r.actual_price_usd).toFixed(4) : '값 없음'}</span><div class="r">${esc(r.failure_reason || '')}</div></li>`).join('') || '<li class="muted">불일치 없음</li>';
}

/* ---------- 6. DB 콘솔 ---------- */
const SQL_EX = [
  ['최신 단가', "SELECT provider_name, gpu_model_name, contract_term, region, normalized_price_usd, collected_at\nFROM v_latest_prices\nWHERE gpu_model_name = 'H100'\nORDER BY contract_term, normalized_price_usd"],
  ['환산 근거', "SELECT rp.provider_id, rp.raw_product_name, np.normalized_price_usd, np.calculation_trace\nFROM raw_products rp JOIN normalized_prices np USING (raw_id)\nWHERE rp.data_status = 'SUCCESS'\nORDER BY rp.collected_at DESC"],
  ['사업자 상태', 'SELECT * FROM v_provider_health ORDER BY provider_id'],
  ['환율 착시', 'SELECT product_key, prev_price_usd, curr_price_usd, price_effect_usd, fx_effect_usd, first_observed_at\nFROM price_changes_log WHERE NOT is_raw_price_changed'],
  ['수집 회차', 'SELECT * FROM collection_runs ORDER BY started_at DESC'],
  ['환율', 'SELECT * FROM exchange_rates ORDER BY rate_at DESC'],
];
async function renderDB() {
  if (!state.meta.db_console) { $('#tblList').innerHTML = '<li class="muted">DB 콘솔이 꺼져 있습니다 (DB_CONSOLE=0)</li>'; return; }
  try {
    const ts = await api('/api/db/tables');
    $('#tblList').innerHTML = ts.map(t => `<li data-t="${esc(t.name)}" data-c="${esc(t.columns.join('\n  '))}"><span>${esc(t.name)}</span><span class="muted num">${t.type === 'VIEW' ? 'VIEW' : t.rows.toLocaleString()}</span></li>`).join('');
    $('#tblList').onclick = e => { const li = e.target.closest('li[data-t]'); if (!li) return; $('#sqlIn').value = `-- ${li.dataset.t}\n--   ${li.dataset.c.replace(/\n/g, '\n-- ')}\nSELECT * FROM ${li.dataset.t}`; runSQL(); };
  } catch (e) { $('#tblList').innerHTML = `<li class="err">${esc(e.message)}</li>`; }
  chipset($('#sqlEx'), SQL_EX.map(([l], i) => [String(i), l]), '-1', v => { $('#sqlIn').value = SQL_EX[+v][1]; runSQL(); });
  if (!$('#sqlIn').value) { $('#sqlIn').value = SQL_EX[0][1]; runSQL(); }
}
async function runSQL() {
  try {
    const r = await api('/api/db/query', { sql: $('#sqlIn').value });
    $('#sqlMeta').textContent = `${r.rows.length.toLocaleString()}행 · ${r.ms}ms${r.truncated ? ' · 500행까지만 표시' : ''}`;
    $('#sqlOut').innerHTML = `<table class="t"><thead><tr>${r.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${r.rows.map(row => `<tr>${row.map(v => `<td class="${typeof v === 'number' ? 'n' : ''}">${v == null ? '<span class="muted">NULL</span>' : esc(typeof v === 'object' ? JSON.stringify(v) : v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  } catch (e) { $('#sqlMeta').textContent = ''; errBox($('#sqlOut'), e); }
}

/* ---------- 라우팅·공통 ---------- */
const VIEWS = ['home', 'bizcase', 'catalog', 'dashboard', 'compare', 'discounts', 'trend', 'cost', 'agent', 'qa', 'db', 'users', 'inquiries', 'admin-inquiries'];
const ADMIN_VIEWS = ['db', 'users', 'admin-inquiries'];
const RENDER = { home: renderHome, bizcase: renderBiz, catalog: renderCatalog, dashboard: renderDash, compare: renderCompare, discounts: renderDiscounts, trend: renderTrend, cost: renderCost, agent: renderUsage, qa: () => renderQA(false), db: renderDB, users: renderUsers,
  inquiries: () => renderInquiries(false), 'admin-inquiries': () => renderInquiries(true) };
/* 페이지 메타: 그룹(브레드크럼·메뉴 강조), 제목·설명 키, 상단 띠의 통화·환율 도구 표시 여부 */
const PAGES = {
  home: { grp: null }, bizcase: { grp: 'biz', tools: true }, catalog: { grp: 'market', tools: true }, dashboard: { grp: 'market', tools: true }, compare: { grp: 'market', tools: true }, discounts: { grp: 'market', tools: true }, trend: { grp: 'market', tools: true }, cost: { grp: 'cost', tools: true },
  agent: { grp: 'ai', tools: false }, qa: { grp: 'quality' }, db: { grp: 'admin' }, users: { grp: 'admin' },
  inquiries: { grp: 'settings' }, 'admin-inquiries': { grp: 'admin' },
};
const GRP_KEY = { market: 'gMarket', cost: 'gCost', biz: 'gBiz', ai: 'gAi', quality: 'gQuality', admin: 'gAdmin', settings: 'gSettings' };
const PAGE_KEY = { bizcase: 'pBizcase', catalog: 'pCatalog', dashboard: 'pDashboard', compare: 'pCompare', discounts: 'pDiscounts', trend: 'pTrend', cost: 'pCost', agent: 'pAgent', qa: 'pQa', db: 'pDb', users: 'pUsers', inquiries: 'pInquiries', 'admin-inquiries': 'pAdminInq' };
function render() {
  chartBase();
  const v = state.view, pg = PAGES[v];
  document.body.classList.toggle('is-home', v === 'home');
  document.body.classList.toggle('is-catalog', v === 'catalog');
  $('#hello').hidden = v !== 'home';
  if (v !== 'home') {
    $('#pageTitle').textContent = tr(PAGE_KEY[v]);
    $('#pageDesc').textContent = tr('d_' + v);
    $('#crumbTrail').innerHTML = `<span class="sep">▸</span>${esc(tr(GRP_KEY[pg.grp]))}<span class="sep">▸</span><b>${esc(tr(PAGE_KEY[v]))}</b>`;
    $('#bandTools').hidden = !pg.tools; $('#bandMeta').hidden = !pg.tools;
  }
  document.querySelectorAll('.snb-nav a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + v ? 'page' : 'false'));
  document.querySelectorAll('.gmenu a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + v ? 'page' : 'false'));
  VIEWS.forEach(x => { document.getElementById('v-' + x).hidden = x !== v; });
  updateDataContext(v);
  updateReadableShell(v);
  updateEnterpriseShell(v);
  return RENDER[v]();
}
function route() {
  const full = location.hash.slice(1), h = full.split('/')[0];          // #catalog/gpu/H100 → 보기 'catalog' + 하위 경로
  if(h==='qa'){location.replace('#data/quality');return;}
  if(h==='compare'){const suffix=full.slice('compare'.length);location.replace(suffix?'#catalog/gpu'+suffix:'#catalog');return;}
  const prev = state.view, prevFull = state.hashFull;
  state.view = VIEWS.includes(h) && (isAdmin() || !ADMIN_VIEWS.includes(h)) ? h : 'home';
  state.hashFull = full;
  closePops();
  if (prev !== state.view || prevFull !== full) window.scrollTo(0, 0);
  render();
}

function wire() {
  window.addEventListener('hashchange', route);
  $('#fxIn').oninput = e => { const v = parseFloat(e.target.value); if (v > 0) { state.fx = v; $('#fxSrc').textContent = '직접 입력값 (표시용)'; render(); } };
  $('#fxReset').onclick = async () => { state.fx = state.dbFx; await loadMeta(); render(); };
  $('#curSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; state.cur = b.dataset.v; $('#curSeg').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === state.cur)); render(); };
  $('#refreshBtn').onclick = async () => {
    const b = $('#refreshBtn'); b.disabled = true;
    try {
      state.cost = null; state.bc.a = null; state.noti = null;
      let rr = null; try { rr = await api('/api/rates/refresh', {}); } catch (e) { /* 금리 테이블 미적용 등 — 화면 갱신은 계속 */ }
      await loadMeta(); await loadNoti().catch(() => {});
      await render(); toast(tr('refreshed', $('#sLast').textContent));
      const bad = rr && Object.entries(rr.this_refresh || {}).filter(([, v]) => v && v.ok === false);   // 이번 새로고침의 결과만
      if (bad && bad.length) toast('수출입은행 갱신 실패 — ' + bad.map(([k, v]) => `${k === 'fx' ? '환율' : '대출금리'}: ${v.error}`).join(' / '), 7000);
    } catch (e) { toast(e.message, 5000); }
    b.disabled = false;
  };
  $('#runBtn').onclick = async () => {
    const b = $('#runBtn'); b.disabled = true; b.textContent = tr('collecting');
    try {
      const s = await api('/api/collect', { source: 'fixture' });
      const okN = s.providers.filter(p => p.status === 'OK').length, fail = s.providers.filter(p => p.status !== 'OK');
      toast(`수집 회차 #${s.run_id} 완료 — 사업자 ${okN}곳 정상${fail.length ? ` · 실패 ${fail.map(p => p.provider_id).join(', ')}` : ''}`);
      state.cost = null; await loadMeta(); render();
    } catch (e) { toast('수집 실패: ' + e.message, 6000); }
    b.disabled = false; b.textContent = tr('collectNow');
  };
  $('#eximDate').value = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  $('#eximBtn').onclick = async () => {
    const b = $('#eximBtn'); b.disabled = true;
    try { const r = await api('/api/fx/exim', {}); toast(`환율 저장 — ${r.date} ${r.source} ${r.rate.toLocaleString()}원`); state.fx = null; await loadMeta(); render(); $('#eximPanel').hidden = true; }
    catch (e) { $('#eximPanel').hidden = false; const m = $('#eximMsg'); m.className = 'bad'; m.textContent = e.message; }
    b.disabled = false;
  };
  $('#eximApply').onclick = async () => {
    const m = $('#eximMsg');
    try {
      let payload; try { payload = JSON.parse($('#eximJson').value.trim()); } catch (e) { throw new Error('JSON 형식이 아닙니다. 응답 전체([ 로 시작)를 붙여넣어 주세요.'); }
      const r = await api('/api/fx/exim', { date: $('#eximDate').value.replace(/-/g, ''), payload: Array.isArray(payload) ? payload : [payload] });
      m.className = 'ok'; m.textContent = `저장 완료 — ${r.date} USD ${r.rate.toLocaleString()}원`; state.fx = null; await loadMeta(); render();
    } catch (e) { m.className = 'bad'; m.textContent = e.message; }
  };
  $('#costReset').onclick = () => { state.costChanges = {}; renderCost(); };
  $('#costSave').onclick = async () => {
    const m = $('#costSaveMsg');
    try { const r = await api('/api/cost/activate', { changes: state.costChanges, cost_version: $('#costVer').value.trim() }); m.textContent = `저장·활성화 완료 — BEP $${r.bep.toFixed(2)}`; state.cost = null; state.costChanges = {}; $('#costVer').value = ''; renderCost(); }
    catch (e) { m.textContent = e.message; }
  };
  $('#qaRun').onclick = () => renderQA(true);
  $('#qaLine').oninput = () => renderQA(false);
  $('#sqlRun').onclick = runSQL;
  $('#sqlIn').onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runSQL(); };
  $('#exQs').onclick = $('#histQs').onclick = e => { const b = e.target.closest('[data-q]'); if (b) ask(b.dataset.q); };
  $('#askForm').onsubmit = e => { e.preventDefault(); const v = $('#askIn').value; $('#askIn').value = ''; ask(v); };
  const rerender = () => { if (state.view !== 'agent') render(); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender);
  new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

/* ========== 셸: 다국어 · 팝오버 · 알림 · 문의 · 홈 · 목록 ========== */
const LANG_KEY = 'gpuindex.lang', SEEN_KEY = 'gpuindex.notiSeen';
const ls = { get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const SH = {
  ko: {
    product: 'GPU 시세 인덱스', gMarket: '시세 분석', gCost: '원가', gAi: 'AI 질의', gQuality: '품질', gAdmin: '관리', gSettings: '설정',
    pDashboard: '가격 대시보드', pFavorites: '관심 사업자 대시보드', pDiscounts: '계약기간별 할인', pCatalog: 'GPU·사업자 카탈로그', d_catalog: '메인 B300·GB300 NVL72·VR200 NVL72, 참조 GB200 NVL72·H100·H200. NVL72 구성 미확인 가격은 별도 참고 자료입니다.', d_discounts: '모든 GPU 모델의 1년·3년 약정과 스팟 가격을 같은 사업자의 온디맨드 가격과 짝지어 할인율을 비교합니다. 대표 할인은 3곳 이상일 때만 냅니다.', gBiz: '사업성', pBizcase: '사업성 분석', d_bizcase: '네 가지 모듈, 하나의 비즈니스 사례. 가속기 벤치마크 → 시간당 TCO → 임대료 시나리오 → 클러스터 재무(NPV·IRR·3개 재무제표) → 가격 대비 성능이 같은 가정에서 이어서 계산됩니다.', refresh: '새로고침', refreshed: r => `최신 정보를 불러왔습니다 · 최신 회차 ${r}`, pCompare: '모델별 가격 비교', d_compare: '한 GPU 모델의 사업자별 온디맨드·스팟·약정 가격을 비교 기준(자사 제안가·시장 중앙값·특정 사업자)과 나란히 봅니다. 같은 계약 조건끼리만 비교합니다.', favFx: '환율 효과', favSolo: '비교 불가', hOk: '정상', hFail: '수집 실패', hPart: '일부 실패', favDash: '관심 사업자 대시보드', d_favorites: '찜한 사업자의 모든 모델·계약 가격을 한곳에서 봅니다. 시장 대비는 같은 모델·계약의 최신 정상가 중앙값과 비교한 값입니다.', favPickTitle: '사업자 선택', favPickHint: '☆를 눌러 찜하거나 해제합니다. 가격 대시보드 표에서도 찜할 수 있습니다.', favAdded: n => `${n}을(를) 관심 사업자에 추가했습니다.`, favRemoved: n => `${n}을(를) 관심 사업자에서 뺐습니다.`, favEmpty: '아직 찜한 사업자가 없습니다.', favEmptySub: '위 사업자 선택에서 ☆를 눌러 추가하세요.', favStar: '관심 사업자 찜', favUnstar: '관심 사업자 해제', kFavProv: '관심 사업자', kFavItems: '수집 상품', kFavBelow: '시장보다 저렴', kFavChg: '최근 7일 가격 변동', kFavIssue: '수집 주의', colModel: '모델', colProduct: '상품', colRegion: '지역', colTerm: '계약', colPrice: '환산 단가', colMarket: '시장 중앙값', colVs: '시장 대비', colChange: '최근 변동', colCollected: '수집 시각', colSrc: '출처', favHiddenL: '미공개·환산 불가', favLastOk: '최근 정상 수집', favSite: '가격 페이지', favNoItems: '최신 정상 가격이 없습니다.', pTrend: '추이·시차·생애주기', pCost: '원가·제안가', pAgent: 'Pricing Copilot', pQa: '정확도 검증', pDb: 'DB 콘솔',
    pUsers: '사용자 관리', pInquiries: '워크스페이스 문의', pAdminInq: '문의 관리', newInquiry: '문의 등록하기',
    d_dashboard: '최근 수집 회차를 기준으로 환산 가격을 비교합니다. 현재 시각과의 차이는 안내와 근거 패널에서 확인하세요. 지역·구성 차이가 있는 상품은 참고용으로 비교하세요.',
    d_trend: '수집 회차마다 쌓인 단가 이력과, 원가 이벤트 이후 경쟁사가 가격에 반영하기까지의 시차입니다.',
    d_cost: '원가 엔진으로 BEP와 제안가를 계산합니다. 값을 바꾸면 저장 없이 다시 계산하고, ‘새 원가 버전으로 저장’을 눌러야 기록됩니다.',
    d_agent: '자연어로 시세를 묻습니다. 모든 답은 DB에 쌓인 값과 출처·수집 시각을 근거로 합니다.',
    d_qa: '정답셋과 수집·환산·Copilot 결과를 비교합니다. 수집 실패·누락도 분모에 넣습니다.',
    d_db: '스키마를 보고 읽기 전용 조회문을 실행합니다 (3초 제한·최대 500행).',
    d_users: '가입한 사용자의 역할을 정하고 Copilot 사용량을 확인합니다.',
    d_inquiries: '이 워크스페이스에서 함께 확인하는 문의와 답변입니다.', 'd_admin-inquiries': '사용자 문의를 확인하고 답변합니다.',
    searchLabel: 'Copilot에게 질문', searchPh: 'Copilot에게 물어보세요 (예: B200 최저가)',
    tipProfile: '마이 프로필', tipNoti: '알림', tipHelp: '문의하기', tipLang: '언어 변경',
    logout: 'Logout', myInquiries: '워크스페이스 문의', userAdmin: '사용자 관리', recentQs: '최근 내 질문', noRecent: '아직 질문한 기록이 없습니다.',
    todayAsks: '오늘 질문', monthLlm: '이번 달 LLM 호출',
    nim: '님', helloSub: '오늘의 GPU 임대 시세를 확인하세요.<br>원가와 비교해 제안가를 정하고, 궁금한 건 Copilot에게 물어보세요.',
    stRun: '최신 수집', stProducts: '수집 상품', stAsks: '오늘 내 질문', unitN: '개', unitTimes: '회',
    hotTitle: '모델별 최저가', viewAll: '전체보기', kwTitle: '사용자가 많이 찾은 <b>질문</b>', notiTitle: '최근 알림',
    cardMin: '온디맨드 최저', cardSample: '표본', cardPlaces: '곳', cardMom: '월간 변동', cardNone: '정상 가격 없음', launched: '출시',
    latestRun: '최신 회차', currency: '표시 통화', fxShown: '표시 환율 USD/KRW', fxDb: 'DB 고시값', fxFetch: '수출입은행 환율 받기',
    collectNow: '지금 수집 실행', collecting: '수집 중…',
    emptyNoti: '새로운 알림이 없습니다.', emptyNotiSub: '수집 실패, 가격 급변, 신규 상품 소식을<br>한 번에 받아보세요.',
    empty: '결과가 없습니다.', countFmt: n => `총 <b>${n}개</b>의 결과가 있습니다.`, countShort: n => `총 ${n}개`, downloadAll: '전체 다운로드',
    inqTab: '문의 등록', adminInqTab: '전체 문의', sOpen: '답변대기', sAnswered: '답변완료', p7: '최근 1주', p30: '최근 1개월', p180: '최근 6개월', p365: '최근 1년',
    colNo: '번호', colType: '문의유형', colTitle: '제목', colStatus: '상태', colCreated: '등록일', colAnswered: '답변일', colAuthor: '작성자',
    answerLabel: '답변', answerPh: '답변을 입력하세요 (2,000자 이내)', answerBtn: '답변 등록', answered: '답변을 등록했습니다.',
    inqModalTitle: '문의 등록', inqModalDesc: '이 워크스페이스에서 함께 확인할 문의를 남겨주세요.',
    inqType: '문의유형', inqTitleL: '제목', inqBodyL: '내용', selCat: '분류를 선택해주세요', titlePh: '제목을 입력해주세요.', bodyPh: '1,000자 이내로 입력하세요.',
    cancel: '취소', submit: '등록', eCat: '문의유형을 선택해주세요.', eTitle: '제목을 입력해주세요.', eBody: '내용을 입력해주세요.', inqSent: '문의를 등록했습니다.',
    roleADMIN: '관리자', roleUSER: '사용자', rolePENDING: '승인 대기',
  },
  en: {
    product: 'GPU Price Index', gMarket: 'Market', gCost: 'Cost', gAi: 'AI', gQuality: 'Quality', gAdmin: 'Admin', gSettings: 'Settings',
    pDashboard: 'Price dashboard', pFavorites: 'Favorite providers', pDiscounts: 'Commit & spot discounts', pCatalog: 'GPU & provider catalog', d_catalog: 'Every GPU model and provider as a card. Open one for its price history, at-a-glance stats, offers by provider and an FAQ answered from current data.', d_discounts: 'Compare 1- and 3-year commitments and spot prices against each provider’s own on-demand price, across all GPU models. Headline discounts need 3+ providers.', gBiz: 'Business case', pBizcase: 'Business case', d_bizcase: 'Four modules, one business case: accelerator benchmarks → hourly TCO → rental scenarios → cluster finance (NPV, IRR, three statements) → price-performance, all from the same assumptions.', refresh: 'Refresh', refreshed: r => `Loaded the latest data · run ${r}`, pCompare: 'Price comparison', d_compare: 'Compare on-demand, spot and committed prices for one GPU model against a baseline (our quote, market median, or a provider). Only like-for-like terms are compared.', favFx: 'FX effect', favSolo: 'No peers', hOk: 'OK', hFail: 'Failed', hPart: 'Partial', favDash: 'Favorite providers', d_favorites: 'All model and contract prices from the providers you starred. “vs market” compares with the median of the latest valid prices for the same model and term.', favPickTitle: 'Choose providers', favPickHint: 'Tap ☆ to star or unstar. You can also star from the price dashboard table.', favAdded: n => `${n} added to favorites.`, favRemoved: n => `${n} removed from favorites.`, favEmpty: 'No favorite providers yet.', favEmptySub: 'Tap ☆ above to add one.', favStar: 'Star provider', favUnstar: 'Unstar provider', kFavProv: 'Favorites', kFavItems: 'Products', kFavBelow: 'Below market', kFavChg: 'Price changes (7 days)', kFavIssue: 'Collection issues', colModel: 'Model', colProduct: 'Product', colRegion: 'Region', colTerm: 'Term', colPrice: 'Price', colMarket: 'Market median', colVs: 'vs market', colChange: 'Last change', colCollected: 'Collected', colSrc: 'Source', favHiddenL: 'Unpublished / not convertible', favLastOk: 'Last success', favSite: 'Pricing page', favNoItems: 'No current valid prices.', pTrend: 'Trends & lifecycle', pCost: 'Cost & quote', pAgent: 'Pricing Copilot', pQa: 'Accuracy check', pDb: 'DB console',
    pUsers: 'Users', pInquiries: 'Workspace inquiries', pAdminInq: 'Inquiries', newInquiry: 'Contact us',
    d_dashboard: 'Latest valid prices per GPU-hour. Values older than 48 hours and from failed providers are shown separately and excluded from stats.',
    d_trend: 'Price history by collection run, and how long competitors took to react after cost events.',
    d_cost: 'The cost engine computes break-even and quotes. Edits recalculate without saving until you save a new cost version.',
    d_agent: 'Ask about prices in plain language. Every answer is grounded in stored data with source and collection time.',
    d_qa: 'Compares collection, conversion and Copilot results against the answer set. Failures count against accuracy.',
    d_db: 'Browse the schema and run read-only queries (3-second limit, 500 rows max).',
    d_users: 'Set user roles and review Copilot usage.', d_inquiries: 'Review shared workspace inquiries and answers.', 'd_admin-inquiries': 'Review and answer user inquiries.',
    searchLabel: 'Ask Copilot', searchPh: 'Ask Copilot (e.g. cheapest H100)',
    tipProfile: 'My profile', tipNoti: 'Notifications', tipHelp: 'Contact us', tipLang: 'Language',
    logout: 'Logout', myInquiries: 'Workspace inquiries', userAdmin: 'Users', recentQs: 'My recent questions', noRecent: 'No questions yet.',
    todayAsks: 'Questions today', monthLlm: 'LLM calls this month',
    nim: '', helloSub: "Check today's GPU rental prices.<br>Set quotes against your cost, and ask Copilot anything.",
    stRun: 'Latest run', stProducts: 'Products', stAsks: 'My questions today', unitN: '', unitTimes: '',
    hotTitle: 'Lowest price by model', viewAll: 'View all', kwTitle: 'Popular <b>questions</b>', notiTitle: 'Recent alerts',
    cardMin: 'On-demand low', cardSample: 'Sample', cardPlaces: ' providers', cardMom: 'Monthly change', cardNone: 'No valid price', launched: 'Launched',
    latestRun: 'Latest run', currency: 'Currency', fxShown: 'Display FX USD/KRW', fxDb: 'DB rate', fxFetch: 'Fetch Eximbank rate',
    collectNow: 'Collect now', collecting: 'Collecting…',
    emptyNoti: 'No new notifications.', emptyNotiSub: 'Collection failures, price swings and new products<br>show up here.',
    empty: 'No results.', countFmt: n => `<b>${n}</b> results`, countShort: n => `${n} total`, downloadAll: 'Download all',
    inqTab: 'Inquiries', adminInqTab: 'All inquiries', sOpen: 'Waiting', sAnswered: 'Answered', p7: 'Last week', p30: 'Last month', p180: 'Last 6 months', p365: 'Last year',
    colNo: 'No.', colType: 'Type', colTitle: 'Title', colStatus: 'Status', colCreated: 'Created', colAnswered: 'Answered', colAuthor: 'Author',
    answerLabel: 'Answer', answerPh: 'Write an answer (up to 2,000 characters)', answerBtn: 'Post answer', answered: 'Answer posted.',
    inqModalTitle: 'Contact us', inqModalDesc: "Share an inquiry with this workspace.",
    inqType: 'Type', inqTitleL: 'Title', inqBodyL: 'Details', selCat: 'Select a category', titlePh: 'Enter a title.', bodyPh: 'Up to 1,000 characters.',
    cancel: 'Cancel', submit: 'Submit', eCat: 'Select an inquiry type.', eTitle: 'Enter a title.', eBody: 'Enter the details.', inqSent: 'Inquiry submitted.',
    roleADMIN: 'Admin', roleUSER: 'User', rolePENDING: 'Pending',
  },
  zh: {
    product: 'GPU 价格指数', gMarket: '行情分析', gCost: '成本', gAi: 'AI 问答', gQuality: '质量', gAdmin: '管理', gSettings: '设置',
    pDashboard: '价格看板', pFavorites: '关注供应商看板', pDiscounts: '合约·竞价折扣', pCatalog: 'GPU·供应商目录', d_catalog: '按 GPU 型号和供应商整理的卡片。打开即可查看价格走势、概览、各供应商报价，以及根据当前数据自动回答的常见问题。', d_discounts: '将所有 GPU 型号的 1 年、3 年合约及竞价价格与同一供应商的按需价格配对比较折扣。代表折扣需 3 家以上。', gBiz: '商业分析', pBizcase: '商业可行性分析', d_bizcase: '四个模块，一个商业案例：加速器基准 → 每小时 TCO → 租赁价格情景 → 集群财务（NPV·IRR·三张报表）→ 性价比，全部基于同一组假设计算。', refresh: '刷新', refreshed: r => `已载入最新数据 · 最新批次 ${r}`, pCompare: '型号价格对比', d_compare: '按同一 GPU 型号，将各供应商的按需·竞价·合约价格与基准（自有报价、市场中位数或指定供应商）并列对比。仅比较相同合约条件。', favFx: '汇率因素', favSolo: '无法比较', hOk: '正常', hFail: '采集失败', hPart: '部分失败', favDash: '关注供应商看板', d_favorites: '集中查看已关注供应商的所有型号与合约价格。“对比市场”是与同型号同合约最新有效价格中位数的比较。', favPickTitle: '选择供应商', favPickHint: '点击 ☆ 关注或取消。也可在价格看板表格中关注。', favAdded: n => `已将 ${n} 加入关注。`, favRemoved: n => `已取消关注 ${n}。`, favEmpty: '还没有关注的供应商。', favEmptySub: '点击上方 ☆ 添加。', favStar: '关注供应商', favUnstar: '取消关注', kFavProv: '关注供应商', kFavItems: '采集商品', kFavBelow: '低于市场', kFavChg: '近 7 天价格变动', kFavIssue: '采集异常', colModel: '型号', colProduct: '商品', colRegion: '地区', colTerm: '合约', colPrice: '换算单价', colMarket: '市场中位数', colVs: '对比市场', colChange: '最近变动', colCollected: '采集时间', colSrc: '来源', favHiddenL: '未公开·无法换算', favLastOk: '最近成功采集', favSite: '价格页面', favNoItems: '没有最新有效价格。', pTrend: '趋势·时滞·生命周期', pCost: '成本·报价', pAgent: 'Pricing Copilot', pQa: '准确性验证', pDb: 'DB 控制台',
    pUsers: '用户管理', pInquiries: '工作区咨询', pAdminInq: '咨询管理', newInquiry: '提交咨询',
    d_dashboard: '采集并标准化后的最新有效单价。超过 48 小时的数据及采集失败供应商的历史值单独显示，不计入统计。',
    d_trend: '按采集批次累积的价格历史，以及成本事件后竞争对手调价的时滞。',
    d_cost: '成本引擎计算盈亏平衡点与报价。修改后即时重算，保存为新成本版本时才会记录。',
    d_agent: '用自然语言查询行情。所有回答都以数据库中的数据、来源和采集时间为依据。',
    d_qa: '将采集、换算和 Copilot 结果与标准答案比较。采集失败也计入分母。',
    d_db: '查看表结构并执行只读查询（3 秒限制，最多 500 行）。',
    d_users: '设置用户角色并查看 Copilot 使用量。', d_inquiries: '查看工作区共享的咨询和回复。', 'd_admin-inquiries': '查看并回复用户咨询。',
    searchLabel: '向 Copilot 提问', searchPh: '向 Copilot 提问（例：H100 最低价）',
    tipProfile: '我的资料', tipNoti: '通知', tipHelp: '咨询', tipLang: '切换语言',
    logout: '退出', myInquiries: '工作区咨询', userAdmin: '用户管理', recentQs: '我最近的提问', noRecent: '还没有提问记录。',
    todayAsks: '今日提问', monthLlm: '本月 LLM 调用',
    nim: '，您好', helloSub: '查看今天的 GPU 租赁价格。<br>与成本比较确定报价，有疑问就问 Copilot。',
    stRun: '最新采集', stProducts: '采集商品', stAsks: '今日我的提问', unitN: '个', unitTimes: '次',
    hotTitle: '各型号最低价', viewAll: '查看全部', kwTitle: '用户常问的<b>问题</b>', notiTitle: '最新通知',
    cardMin: '按需最低价', cardSample: '样本', cardPlaces: ' 家', cardMom: '月度变化', cardNone: '无有效价格', launched: '发布',
    latestRun: '最新批次', currency: '显示货币', fxShown: '显示汇率 USD/KRW', fxDb: 'DB 公告值', fxFetch: '获取进出口银行汇率',
    collectNow: '立即采集', collecting: '采集中…',
    emptyNoti: '没有新通知。', emptyNotiSub: '采集失败、价格骤变、新品消息<br>都会显示在这里。',
    empty: '没有结果。', countFmt: n => `共 <b>${n}</b> 条结果`, countShort: n => `共 ${n} 条`, downloadAll: '全部下载',
    inqTab: '提交咨询', adminInqTab: '全部咨询', sOpen: '待回复', sAnswered: '已回复', p7: '最近 1 周', p30: '最近 1 个月', p180: '最近 6 个月', p365: '最近 1 年',
    colNo: '编号', colType: '咨询类型', colTitle: '标题', colStatus: '状态', colCreated: '提交日', colAnswered: '回复日', colAuthor: '提交人',
    answerLabel: '回复', answerPh: '请输入回复（2,000 字以内）', answerBtn: '提交回复', answered: '已提交回复。',
    inqModalTitle: '提交咨询', inqModalDesc: '请留下供工作区共同查看的咨询内容。',
    inqType: '咨询类型', inqTitleL: '标题', inqBodyL: '内容', selCat: '请选择分类', titlePh: '请输入标题。', bodyPh: '请输入 1,000 字以内。',
    cancel: '取消', submit: '提交', eCat: '请选择咨询类型。', eTitle: '请输入标题。', eBody: '请输入内容。', inqSent: '咨询已提交。',
    roleADMIN: '管理员', roleUSER: '用户', rolePENDING: '待批准',
  },
};
let lang = ['ko', 'en', 'zh'].includes(ls.get(LANG_KEY)) ? ls.get(LANG_KEY) : 'ko';
function tr(k, ...a) { const v = (SH[lang] && SH[lang][k]) ?? SH.ko[k]; return typeof v === 'function' ? v(...a) : (v ?? k); }
function applyShellLang() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  document.title = tr('product');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = tr(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = tr(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-tip-key]').forEach(el => { el.dataset.tip = tr(el.dataset.tipKey); el.setAttribute('aria-label', tr(el.dataset.tipKey)); });
  $('#gSearchIn').placeholder = tr('searchPh');
  $('#inqTitle').placeholder = tr('titlePh'); $('#inqBodyIn').placeholder = tr('bodyPh');
  document.querySelectorAll('#popLang li').forEach(li => li.setAttribute('aria-checked', li.dataset.lang === lang));
}

/* 팝오버 */
const POPS = [['#btnNoti', '#popNoti', openNoti], ['#btnLang', '#popLang', null]];
function closePops() { POPS.forEach(([b, p]) => { $(p).hidden = true; $(b).setAttribute('aria-expanded', 'false'); }); }
function togglePop(b, p, onOpen) {
  const open = $(p).hidden; closePops();
  if (!open) return;
  $(p).hidden = false; $(b).setAttribute('aria-expanded', 'true');
  if (onOpen) onOpen();
  if (p === '#popLang') ($(p).querySelector('[aria-checked="true"]') || $(p).firstElementChild).focus();
}
const LV = { FAIL: ['p-bad', '수집 실패'], ANOMALY: ['p-warn', '가격 급변'], FX: ['p-info', '환율 착시'], NEW: ['p-new', '신규 상품'], REMOVED: ['p-bad', '상품 사라짐'], INFO: ['p-info', '배치'], LAUNCH: ['p-new', '첫 공개'] };
const emptyNotiHTML = () => `<li style="display:block;border:0"><div class="empty"><div class="e-ic"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg></div><b>${tr('emptyNoti')}</b><span>${tr('emptyNotiSub')}</span></div></li>`;
const notiItems = ev => ev.map(l => `<li><span class="pill ${(LV[l.level] || ['p-info'])[0]}">${(LV[l.level] || [, esc(l.level)])[1]}</span><span>${esc(l.msg)}</span><time>${shortAt(l.at)}</time></li>`).join('');
async function loadNoti() {
  const ev = (await api('/api/events?limit=30')).filter(e => e.level !== 'INFO');
  state.noti = ev;
  const seen = ls.get(SEEN_KEY), unread = ev.filter(e => !seen || e.at > seen).length;
  $('#notiBadge').hidden = !unread; $('#notiBadge').textContent = unread > 9 ? '9+' : unread;
  return ev;
}
async function openNoti() {
  try { const ev = await loadNoti(); $('#notiList').innerHTML = ev.length ? notiItems(ev.slice(0, 12)) : emptyNotiHTML(); if (ev.length) ls.set(SEEN_KEY, ev[0].at); $('#notiBadge').hidden = true; }
  catch (e) { $('#notiList').innerHTML = `<li class="err">${esc(e.message)}</li>`; }
}

/* 문의 등록 모달 */
let inqTypes = null;
async function openInquiry() {
  closePops();
  if (!inqTypes) { try { inqTypes = await api('/api/inquiries/types'); } catch (e) { toast(e.message); return; } }
  $('#inqCat').innerHTML = `<option value="">${tr('selCat')}</option>` + Object.keys(inqTypes).map(c => `<option>${esc(c)}</option>`).join('');
  $('#inqSub').innerHTML = `<option value="">${tr('selCat')}</option>`; $('#inqSub').disabled = true;
  $('#inqTitle').value = ''; $('#inqBodyIn').value = ''; $('#inqTitleN').textContent = '0'; $('#inqBodyN').textContent = '0'; $('#inqMsg').textContent = '';
  $('#inqModal').hidden = false; document.body.style.overflow = 'hidden'; $('#inqCat').focus();
}
function closeInquiry() { $('#inqModal').hidden = true; document.body.style.overflow = ''; }
async function submitInquiry(e) {
  e.preventDefault();
  const body = { category: $('#inqCat').value, subcategory: $('#inqSub').value, title: $('#inqTitle').value.trim(), body: $('#inqBodyIn').value.trim() };
  const m = $('#inqMsg');
  if (!body.category || !body.subcategory) { m.textContent = tr('eCat'); return; }
  if (!body.title) { m.textContent = tr('eTitle'); $('#inqTitle').focus(); return; }
  if (!body.body) { m.textContent = tr('eBody'); $('#inqBodyIn').focus(); return; }
  $('#inqSubmit').disabled = true;
  try { await api('/api/inquiries', body); closeInquiry(); toast(tr('inqSent')); if (state.view === 'inquiries') renderInquiries(false); }
  catch (err) { m.textContent = err.message; }
  $('#inqSubmit').disabled = false;
}

/* ---------- 모델별 가격 비교 (기준 대비 배수·할인율) ---------- */
const SALE = { ON_DEMAND: ['p-ok', '온디맨드 가능'], COMMIT_ONLY: ['p-warn', '약정만'], SPOT_ONLY: ['p-info', '스팟만'], PRIVATE: ['p-bad', '가격 미공개'] };
state.c = { model: null, base: 'AUTO' };
function vsBase(price, base) {
  if (price == null || !base) return '';
  const r = price / base;
  if (Math.abs(r - 1) < 0.005) return '<span class="vs same">기준과 같음</span>';
  return r > 1 ? `<span class="vs more">${r.toFixed(2)}배 · ${pct(r - 1, 0)} 비쌈</span>` : `<span class="vs less">${pctu(1 - r, 0)} 저렴</span>`;
}
async function renderCompare() {
  const c = state.c;
  if (!c.model) c.model = state.f.model;
  chipset($('#cModel'), modelOpts(), c.model, v => { c.model = v; c.base = 'AUTO'; renderCompare(); });
  let d;
  try { d = await api('/api/compare' + qs({ model: c.model })); } catch (e) { errBox($('#cGlance'), e); return; }
  state.cmp = d;
  const P = d.providers, terms = d.terms;
  const opts = [...(d.ours ? [['OURS', '자사 제안가 (원가 엔진)']] : []), ['MEDIAN', '시장 중앙값'], ...P.map(p => [p.provider_id, p.provider_name])];
  if (c.base === 'AUTO' || !opts.some(o => o[0] === c.base)) c.base = d.ours ? 'OURS' : 'MEDIAN';
  $('#cBase').innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}" ${v === c.base ? 'selected' : ''}>${esc(l)}</option>`).join('');
  $('#cBase').onchange = e => { c.base = e.target.value; renderCompare(); };
  // 기준 행: 계약 조건별 기준가
  let base;
  if (c.base === 'OURS') base = { name: 'SK텔레콤 AI 팩토리', sub: `자사 제안가 · 원가 ${esc(d.ours.cost_version)} · BEP ${money(d.ours.bep)}`, terms: d.ours.terms };
  else if (c.base === 'MEDIAN') base = { name: '시장 중앙값', sub: `최신 ${d.fresh_hours}시간 이내 정상가`, terms: Object.fromEntries(Object.entries(d.market).map(([t, m]) => [t, { price: m.median, n: m.n }])) };
  else { const p = P.find(x => x.provider_id === c.base); base = { name: p.provider_name, sub: typeTag(p.provider_type), terms: p.terms, pid: p.provider_id }; }
  const bp = t => (base.terms[t] || {}).price ?? null;
  const od = d.market.ON_DEMAND, odMin = P.filter(p => p.terms.ON_DEMAND && p.terms.ON_DEMAND.price != null && !p.terms.ON_DEMAND.stale).sort((a, b) => a.terms.ON_DEMAND.price - b.terms.ON_DEMAND.price)[0];
  const long = terms.filter(t => !['ON_DEMAND', 'SPOT'].includes(t)).slice(-1)[0];
  const best = P.flatMap(p => Object.entries(p.terms).filter(([, x]) => x.commit_discount != null).map(([t, x]) => ({ p, t, x }))).sort((a, b) => b.x.commit_discount - a.x.commit_discount)[0];
  const baseLong = long && bp(long), baseOd = bp('ON_DEMAND');
  $('#cGlance').innerHTML = `
    <div class="gl base"><div class="lbl">기준 · 온디맨드</div><div class="v">${money(baseOd)}</div><div class="s">${esc(base.name)} /GPU·시간</div></div>
    <div class="gl base"><div class="lbl">기준 · ${long ? termL(long) : '약정'}</div><div class="v">${money(baseLong)}</div><div class="s">${c.base === 'MEDIAN' && baseLong ? `약정가 공개 ${base.terms[long].n}곳의 중앙값` : baseLong && baseOd ? `온디맨드 대비 ${pctu(1 - baseLong / baseOd, 0)} 할인` : '기준 약정가 없음'}</div></div>
    <div class="gl"><div class="lbl">시장 최저 · 온디맨드</div><div class="v">${odMin ? money(odMin.terms.ON_DEMAND.price) : '—'}</div><div class="s">${odMin ? esc(odMin.provider_name) + ' ' + vsBase(odMin.terms.ON_DEMAND.price, baseOd) : '—'}</div></div>
    <div class="gl"><div class="lbl">시장 중앙값 · 온디맨드</div><div class="v">${od ? money(od.median) : '—'}</div><div class="s">${od ? `표본 ${od.n}곳` : '정상 가격 없음'}</div></div>
    <div class="gl"><div class="lbl">최대 약정 할인</div><div class="v">${best ? pctu(best.x.commit_discount, 0) : '—'}</div><div class="s">${best ? `${esc(best.p.provider_name)} · ${termL(best.t)}` : '약정가 공개 사업자 없음'}</div></div>`;
  $('#cTblTitle').textContent = `${d.model} 사업자별 가격 (${state.cur === 'KRW' ? '₩' : 'USD'}/GPU·시간)`;
  const cell = (x, t, isBase) => {
    if (!x) return '<td class="n"><span class="muted">—</span></td>';
    if (x.price == null) return `<td class="n"><span class="muted" title="${esc(x.reason || '')}">${esc(x.status || '—')}</span></td>`;
    return `<td class="n ${x.stale ? 'dim' : ''}" title="${esc([x.product, x.region].filter(Boolean).join(' · '))}"><b>${money(x.price)}</b>${x.options > 1 ? `<span class="sub2">최저 · 상품 ${x.options}개</span>` : ''}${x.commit_discount != null ? `<span class="sub2">자체 약정 할인 ${pctu(x.commit_discount, 0)}</span>` : ''}${x.stale ? '<span class="sub2">오래된 데이터</span>' : ''}${isBase ? '' : vsBase(x.price, bp(t))}</td>`;
  };
  const head = `<thead><tr><th>사업자</th>${terms.map(t => `<th class="n">${termL(t)}</th>`).join('')}<th class="n">최대 약정 할인</th><th>판매 형태</th></tr></thead>`;
  const baseRow = `<tr class="base-row"><td><span class="prov">${esc(base.name)}</span><span class="base-tag">기준</span><span class="sub2">${base.sub}</span></td>${terms.map(t => base.terms[t] ? `<td class="n"><b>${money(base.terms[t].price)}</b>${base.terms[t].n ? `<span class="sub2">n=${base.terms[t].n}</span>` : ''}${c.base !== 'MEDIAN' && t !== 'ON_DEMAND' && t !== 'SPOT' && baseOd && base.terms[t].price ? `<span class="sub2">온디맨드 대비 ${pctu(1 - base.terms[t].price / baseOd, 0)} 할인</span>` : ''}</td>` : '<td class="n"><span class="muted">—</span></td>').join('')}<td class="n"></td><td></td></tr>`;
  const rest = P.filter(p => p.provider_id !== base.pid);
  $('#cTbl').innerHTML = head + '<tbody>' + baseRow + rest.map(p => `<tr><td><span class="pv">${starBtn(p.provider_id, p.provider_name)}<span class="prov">${esc(p.provider_name)}</span></span><br>${typeTag(p.provider_type)}</td>${terms.map(t => cell(p.terms[t], t, false)).join('')}<td class="n">${p.max_commit_discount != null ? `<b>${pctu(p.max_commit_discount, 0)}</b>` : '<span class="muted">—</span>'}</td><td><span class="pill ${SALE[p.sale][0]}">${SALE[p.sale][1]}</span></td></tr>`).join('') + '</tbody>';
  $('#cTbl').onclick = onStarClick;
  $('#cNote').innerHTML = `· <b>비교 방법</b>: 각 칸의 ‘○배 비쌈 / ○% 저렴’은 <b>같은 계약 조건</b>의 기준가와 비교한 값입니다. 기준에 그 조건 가격이 없으면 비교하지 않습니다. 스팟은 언제든 회수될 수 있어 온디맨드와 비교하지 않습니다.<br>
    · <b>자체 약정 할인</b> = 1 − (약정 환산 단가 ÷ 그 사업자의 온디맨드 단가). 약정 단가는 선납금을 약정 시간으로 나눠 시간당으로 환산한 값입니다.<br>
    · 한 사업자가 같은 조건에 상품을 여러 개 내면 가장 싼 것을 표시합니다 (칸에 마우스를 올리면 상품명). 판매 형태 ‘약정만’은 온디맨드 가격이 공개되지 않은 사업자입니다.<br>
    · ${d.fresh_hours}시간보다 오래된 값은 흐리게 표시하고 시장 중앙값·최저가에서 뺍니다. 기준 시점: 최신 회차 ${shortAt(d.as_of)}.`;
  // 약정 할인율 차트
  const commitTerms = terms.filter(t => !['ON_DEMAND', 'SPOT'].includes(t));
  const chartRows = [...(d.ours && d.ours.terms.ON_DEMAND ? [{ name: '자사 제안가', t: d.ours.terms, ours: true }] : []), ...P.filter(p => p.max_commit_discount != null).map(p => ({ name: p.provider_name, t: p.terms }))];
  const disc = (r, t) => { const o = (r.t.ON_DEMAND || {}).price, x = (r.t[t] || {}).price; return o && x ? +((1 - x / o) * 100).toFixed(1) : null; };
  $('#cDiscBox').closest('.panel').hidden = !chartRows.some(r => commitTerms.some(t => disc(r, t) != null));
  $('#cDiscBox').style.height = Math.max(140, chartRows.length * 42 + 50) + 'px';
  const COLS = ['--t-neo', '--t-hyper', '--t-mkt', '--info'];
  mkChart('cDiscChart', { type: 'bar', data: { labels: chartRows.map(r => r.name), datasets: commitTerms.map((t, i) => ({ label: termL(t), data: chartRows.map(r => disc(r, t)), backgroundColor: css(COLS[i % 4]), borderRadius: 3, barThickness: 14 })) },
    options: { indexAxis: 'y', maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'top', align: 'end' }, tooltip: { callbacks: { label: x => `${x.dataset.label} ${x.raw == null ? '—' : x.raw + '% 할인'}` } } },
      scales: { x: { beginAtZero: true, ticks: { callback: v => v + '%' } }, y: { grid: { display: false }, ticks: { color: css('--ink'), font: { weight: ctx => chartRows[ctx.index] && chartRows[ctx.index].ours ? 'bold' : 'normal' } } } } } });
  const oursD = chartRows[0] && chartRows[0].ours ? disc(chartRows[0], long) : null;
  const mk = P.map(p => p.terms[long] && p.terms[long].commit_discount).filter(v => v != null);
  $('#cDiscNote').textContent = chartRows.length ? (oursD != null && mk.length ? `${termL(long)} 기준: 자사 제안가 할인 ${oursD}% · 시장 사업자 할인 중앙값 ${(median(mk) * 100).toFixed(0)}% (${mk.length}곳)` : '') : '약정 가격을 공개한 사업자가 없습니다.';
}

// Compatibility helpers for retained table renderers; provider favorites were removed.
function starBtn() { return ''; }
function onStarClick() {}

function askFromAnywhere(q) { if (!q) return; location.hash = '#agent'; setTimeout(() => ask(q), 50); }

/* 목록 공통: 필터 칩 · 결과 수 · CSV · 빈 상태 */
const emptyHTML = () => `<div class="empty"><div class="e-ic"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><circle cx="12" cy="16.5" r=".8" fill="currentColor"/></svg></div><b>${tr('empty')}</b></div>`;
function downloadCSV(name, header, rows) {
  const cell = value => {
    let text = value == null ? '' : String(value);
    const formula = /^[=+@-]/.test(text.trimStart().normalize('NFKC'));
    const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text);
    if (/^[\t\r\n]/.test(text) || (formula && !numeric)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  const text = '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const stamp = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
function toggleChips(el, opts, cur, on) {
  el.innerHTML = opts.map(([v, l]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${v === cur}">${esc(l)}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('button'); if (b) on(b.dataset.v === cur ? '' : b.dataset.v); };
}
state.inqF = { status: '', days: '' }; state.ainqF = { status: '', days: '' };
async function renderInquiries(admin) {
  const P = admin ? 'ainq' : 'inq', F = admin ? state.ainqF : state.inqF;
  toggleChips($(`#${P}StatusChips`), [['OPEN', tr('sOpen')], ['ANSWERED', tr('sAnswered')]], F.status, v => { F.status = v; renderInquiries(admin); });
  toggleChips($(`#${P}PeriodChips`), [['7', tr('p7')], ['30', tr('p30')], ['180', tr('p180')], ['365', tr('p365')]], F.days, v => { F.days = v; renderInquiries(admin); });
  let rows;
  try { rows = await api(admin ? '/api/admin/inquiries' : '/api/inquiries/mine'); } catch (e) { errBox($(`#${P}Body`), e); return; }
  const since = F.days ? Date.now() - F.days * 86400e3 : 0;
  rows = rows.filter(r => (!F.status || r.status === F.status) && (!since || tsMs(r.created_at) >= since));
  $(`#${P}Count`).innerHTML = tr('countFmt', rows.length);
  const st = r => r.status === 'OPEN' ? `<span class="pill p-warn">${tr('sOpen')}</span>` : `<span class="pill p-ok">${tr('sAnswered')}</span>`;
  const cols = admin ? 7 : 6;
  $(`#${P}Body`).innerHTML = rows.length ? `<div class="panel"><div class="tw"><table class="t"><thead><tr><th class="n">${tr('colNo')}</th><th>${tr('colType')}</th><th>${tr('colTitle')}</th>${admin ? `<th>${tr('colAuthor')}</th>` : ''}<th>${tr('colStatus')}</th><th>${tr('colCreated')}</th><th>${tr('colAnswered')}</th></tr></thead><tbody>` +
    rows.map(r => `<tr class="inq-row" data-id="${r.inquiry_id}" tabindex="0"><td class="n">${r.inquiry_id}</td><td>${esc(r.category)}<span class="sub2">${esc(r.subcategory)}</span></td><td class="prov">${esc(r.title)}</td>${admin ? `<td>${esc(r.display_name)}<span class="sub2">${esc([r.department, r.position].filter(Boolean).join(' · '))}</span></td>` : ''}<td>${st(r)}</td><td class="num">${shortAt(r.created_at)}</td><td class="num">${shortAt(r.answered_at)}</td></tr>
      <tr class="inq-detail" data-for="${r.inquiry_id}" hidden><td colspan="${cols}"><div>${esc(r.body)}</div>${r.answer ? `<div class="inq-ans"><b>${tr('answerLabel')}</b><br>${esc(r.answer)}</div>` : ''}${admin ? `<div class="ans-box"><textarea maxlength="2000" placeholder="${esc(tr('answerPh'))}" aria-label="${esc(tr('answerLabel'))}">${esc(r.answer || '')}</textarea><button class="btn primary" type="button" data-answer="${r.inquiry_id}">${tr('answerBtn')}</button></div>` : ''}</td></tr>`).join('') + '</tbody></table></div></div>' : emptyHTML();
  const body = $(`#${P}Body`);
  body.onclick = async e => {
    const ab = e.target.closest('[data-answer]');
    if (ab) {
      const ta = ab.parentElement.querySelector('textarea');
      try { await api(`/api/admin/inquiries/${ab.dataset.answer}/answer`, { answer: ta.value }); toast(tr('answered')); renderInquiries(true); } catch (err) { toast(err.message, 5000); }
      return;
    }
    const tr_ = e.target.closest('.inq-row'); if (!tr_) return;
    const d = body.querySelector(`.inq-detail[data-for="${tr_.dataset.id}"]`); d.hidden = !d.hidden;
  };
  body.onkeydown = e => { if (e.key === 'Enter' && e.target.classList.contains('inq-row')) e.target.click(); };
  $(`#${P}Csv`).onclick = () => downloadCSV(`${admin ? 'inquiries_all' : 'workspace_inquiries'}_${stamp()}.csv`,
    ['번호', '대분류', '소분류', '제목', '내용', ...(admin ? ['작성자', '이메일'] : []), '상태', '등록일', '답변', '답변일'],
    rows.map(r => [r.inquiry_id, r.category, r.subcategory, r.title, r.body, ...(admin ? [r.display_name, r.email] : []), r.status === 'OPEN' ? '답변대기' : '답변완료', r.created_at, r.answer, r.answered_at]));
}

function wireShell() {
  POPS.forEach(([b, p, fn]) => { $(b).onclick = e => { e.stopPropagation(); togglePop(b, p, fn); }; });
  document.addEventListener('click', e => { if (!e.target.closest('.pop-wrap')) closePops(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#inqModal').hidden) closeInquiry(); else closePops(); } });
  $('#popLang').onclick = e => { const li = e.target.closest('li[data-lang]'); if (!li) return; lang = li.dataset.lang; ls.set(LANG_KEY, lang); applyShellLang(); closePops(); render(); $('#btnLang').focus(); };
  $('#popLang').onkeydown = e => {
    const items = [...$('#popLang').querySelectorAll('li')], i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.activeElement.click(); }
  };
  $('#gSearch').onsubmit = e => { e.preventDefault(); const q = $('#gSearchIn').value.trim(); $('#gSearchIn').value = ''; askFromAnywhere(q); };
  $('#btnHelp')?.addEventListener('click', openInquiry);
  $('#snbHelp').onclick = openInquiry; $('#inqNew').onclick = openInquiry;
  $('#inqClose').onclick = $('#inqCancel').onclick = closeInquiry;
  $('#inqModal').onclick = e => { if (e.target === $('#inqModal')) closeInquiry(); };
  $('#inqForm').onsubmit = submitInquiry;
  $('#inqCat').onchange = () => { const c = $('#inqCat').value; $('#inqSub').innerHTML = `<option value="">${tr('selCat')}</option>` + (inqTypes[c] || []).map(x => `<option>${esc(x)}</option>`).join(''); $('#inqSub').disabled = !c; $('#inqMsg').textContent = ''; };
  $('#inqTitle').oninput = () => { $('#inqTitleN').textContent = $('#inqTitle').value.length; $('#inqMsg').textContent = ''; };
  $('#inqBodyIn').oninput = () => { $('#inqBodyN').textContent = $('#inqBodyIn').value.length; $('#inqMsg').textContent = ''; };
  $('#dashCsv').onclick = () => downloadCSV(`gpu_prices_${state.f.model}_${state.f.term}_${stamp()}.csv`,
    ['사업자', '유형', '상품', '지역', 'GPU 수', '원본 가격', '통화', '환산 단가(USD/GPU·시간)', '온디맨드 대비', '상태', '수집 시각', '출처'],
    (state.dashRows || []).map(r => [r.provider_name, r.provider_type, r.raw_product_name, r.region, r.gpu_count, r.raw_price, r.raw_currency, r.normalized_price_usd, r.vs_on_demand == null ? '' : (r.vs_on_demand * 100).toFixed(1) + '%', r.status, r.collected_at, r.source_url]));
  $('#cCsv').onclick = () => { const d = state.cmp; if (!d) return;
    downloadCSV(`gpu_compare_${d.model}_${stamp()}.csv`, ['사업자', '유형', '판매 형태', ...d.terms.flatMap(t => [termL(t) + ' (USD/GPU·시간)', termL(t) + ' 자체 약정 할인']), '최대 약정 할인'],
      d.providers.map(p => [p.provider_name, p.provider_type, SALE[p.sale][1], ...d.terms.flatMap(t => { const x = p.terms[t] || {}; return [x.price ?? x.status ?? '', x.commit_discount == null ? '' : (x.commit_discount * 100).toFixed(1) + '%']; }), p.max_commit_discount == null ? '' : (p.max_commit_discount * 100).toFixed(1) + '%'])); };
  $('#userCsv').onclick = () => downloadCSV(`users_${stamp()}.csv`, ['이름', '소속', '직위', '이메일', '역할', '가입', '최근 로그인', '질문', 'LLM 호출'],
    (state.users || []).map(u => [u.display_name, u.department, u.position, u.email, u.role, u.created_at, u.last_login_at, u.asks, u.llm_asks]));
}

async function boot() {
  try {
    const me = await api('/api/workspace').catch(error => {
      if (!compatibilityUnavailable(error)) throw error;
      return { user: null };
    });
    state.user = me.user;
    document.querySelectorAll('[data-admin]').forEach(el => { el.hidden = !isAdmin(); });
    applyShellLang();
    await loadMeta();
    wire(); wireShell(); wireBiz(); wireHome(); wireDiscPage();
    if (!window.GpuSpringAnalysis) {
      const examples = await api('/api/ask/examples').catch(() => []);
      $('#exQs').innerHTML = examples.map(x => `<button type="button" class="qbtn" data-q="${esc(x)}">${esc(x)}</button>`).join('');
    }
    loadNoti().catch(() => {});
    await route();
    $('#loader').remove();
  } catch (e) {
    $('#loadmsg').innerHTML = `서버 또는 DB에 연결하지 못했습니다.<br><span class="err">${esc(e.message)}</span><br><br>위 안내대로 처리한 뒤 새로고침하세요.`;
    console.error(e);
  }
}
boot();
