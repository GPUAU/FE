/* 약정·스팟 할인 — 모든 GPU 모델, 같은 사업자 온디맨드와 짝지어 할인 비교 (GET /api/discounts).
   app.js 의 공통 헬퍼($, esc, api, money, pct, pctu, shortAt, termL, typeTag, starBtn, onStarClick, downloadCSV, stamp, state)를 쓴다. */
const MECH = { BID: ['p-warn', '입찰'], DYNAMIC: ['p-info', '변동가'], FIXED: ['p-ok', '고정가'], MARKETPLACE: ['p-new', '마켓'] };
const DISC_INIT = () => ({ tab: 'reserved', d: null });

async function renderDiscounts() {
  const S = state.disc;
  api('/api/aggregators/gpufinder').then(g => { $('#gfStatus').textContent = g.last_ingest_at ? `GPU Finder 최근 받음 ${shortAt(String(g.last_ingest_at))}${g.auto_daily ? ' · 하루 1회 자동' : ''}` : (g.auto_daily ? 'GPU Finder: 서버가 하루 1회 자동으로 받습니다' : ''); }).catch(() => {});
  try { S.d = await api('/api/discounts'); } catch (e) { errBox($('#discBody'), e); return; }
  document.querySelectorAll('#discTabs [data-t]').forEach(b => b.setAttribute('aria-current', String(b.dataset.t === S.tab)));
  S.tab === 'reserved' ? discReserved() : discSpot();
}
const ago = at => at ? shortAt(String(at)).slice(0, 5) : '—';
function jump(models) {
  return `<nav class="djump" aria-label="모델 바로가기">${models.map(g => `<a href="#d-${esc(g.model)}" data-jump="d-${esc(g.model)}">${esc(g.model)} <span>(${g.rows.length})</span></a>`).join('')}</nav>`;
}
function discReserved() {
  const d = state.disc.d, R = d.reserved, H = R.headline;
  const terms = Object.keys(H).sort();
  $('#discBody').innerHTML = `
    <div class="kpis dkpis">${terms.map(t => { const h = H[t]; return `<div class="kpi ${h.median == null ? 'warn' : ''}"><div class="lbl">${termL(t)} 대표 할인 (중앙값)</div><div class="v">${h.median == null ? '—' : pctu(h.median, 0)}</div><div class="s">${h.median == null ? `표본 부족 — ${h.providers}곳 (3곳 이상일 때만 표시)` : `${h.providers}곳 · ${h.pairs}쌍 · 범위 ${pctu(h.min, 0)}~${pctu(h.max, 0)}`}</div></div>`; }).join('') || '<div class="kpi"><div class="lbl">약정 가격</div><div class="v">—</div><div class="s">약정가를 공개한 사업자가 없습니다</div></div>'}
      <div class="kpi"><div class="lbl">기준</div><div class="v" style="font-size:15px">같은 사업자 온디맨드</div><div class="s">같은 지역 우선 · 최신 회차 ${shortAt(String(d.as_of))}</div></div></div>
    ${jump(R.models)}
    ${R.models.map(g => `<div class="panel dgroup" id="d-${esc(g.model)}"><div class="ph"><h3>${esc(g.model)} <span class="muted">${g.rows.length}개 · 싼 순</span></h3></div><div class="tw"><table class="t">
      <thead><tr><th>사업자</th><th>약정</th><th class="n">USD/GPU·시간</th><th>자체 온디맨드 대비</th><th class="n">7일 변동</th><th>지역</th><th>출처 · 수집</th></tr></thead><tbody>
      ${g.rows.map(r => `<tr class=""><td><span class="pv">${starBtn(r.provider_id, r.provider_name)}<span class="prov">${esc(r.provider_name)}</span></span>${r.via ? `<span class="via" title="gpufinder.dev 집계 데이터">${esc(r.via)} 경유</span>` : ''}<br>${typeTag(r.provider_type)}</td>
        <td>${termL(r.term)}<span class="sub2">최소 ${termL(r.term).replace(' 약정', '')}</span></td>
        <td class="n"><b>${money(r.price)}</b>${r.per_node && r.raw_price != null ? `<span class="sub2">${r.raw_currency === 'KRW' ? '₩' : '$'}${Number(r.raw_price).toLocaleString()}/노드 ÷ ${r.gpu_count}</span>` : ''}</td>
        <td>${r.discount_pct == null ? '<span class="muted">온디맨드 가격 없음 — 비교 불가</span>' : `<b class="down">−${money(r.discount_usd)} (−${pctu(r.discount_pct, 0)})</b><span class="sub2">자체 온디맨드 ${money(r.od_price)}${r.od_same_region ? '' : ` · 다른 지역(${esc(r.od_region || '—')})과 비교`}</span>`}</td>
        <td class="n">${r.change_7d == null ? '<span class="muted">변동 없음</span>' : `<span class="${r.change_7d > 0 ? 'up' : 'down'}">${pct(r.change_7d, 1)}</span>`}</td>
        <td>${esc(r.region || '—')}</td>
        <td>${r.source_url ? `<a href="${esc(r.source_url)}" target="_blank" rel="noopener">원문</a>` : '—'}<span class="sub2">${ago(r.collected_at)} 수집 · ${ago(r.unchanged_since)}부터 같은 가격</span></td></tr>`).join('')}
      </tbody></table></div></div>`).join('') || '<div class="pb muted">약정 가격이 없습니다.</div>'}
    <p class="pnote">· 할인 = 1 − (약정 단가 ÷ 같은 사업자·같은 모델의 온디맨드 단가). 같은 지역 온디맨드가 없으면 다른 지역과 짝짓고 표시합니다. 노드 단위 가격은 GPU 수로 나눈 과정을 그대로 보여 줍니다.<br>· 대표 할인(중앙값)은 짝이 있는 사업자가 ${R.min_providers}곳 이상일 때만 냅니다. 한두 곳만 파는 조건은 대표값으로 보기 어렵기 때문입니다.<br>· 공개 가격 기준입니다. 대형 고객이 협상한 실제 거래가는 다를 수 있습니다.</p>`;
  wireDisc();
}
function discSpot() {
  const d = state.disc.d, S = d.spot;
  const all = S.models.flatMap(g => g.rows), valid = all.filter(r => r.valid);
  $('#discBody').innerHTML = `
    <div class="kpis dkpis">
      <div class="kpi"><div class="lbl">스팟 상품</div><div class="v">${all.length}</div><div class="s">${S.models.length}개 모델 · GPU Finder 참고 ${all.filter(r => r.via).length}개${(() => { const a = all.filter(r => r.via && r.discount_pct != null); return a.length ? ` (참고 할인 중앙값 ${pctu(median(a.map(r => r.discount_pct)), 0)})` : ''; })()}</div></div>
      <div class="kpi ${valid.length ? '' : 'warn'}"><div class="lbl">직접 수집 · 같은 사업자 짝</div><div class="v">${valid.length}</div><div class="s">${valid.length ? `할인 중앙값 ${pctu(median(valid.map(r => r.discount_pct)), 0)}` : '직접 수집한 스팟·온디맨드 짝이 없음'}</div></div>
      <div class="kpi"><div class="lbl">유효 할인 규칙</div><div class="v" style="font-size:15px">1% 이상 · 10% 이상</div><div class="s">온디맨드보다 1% 이상 싸고, 온디맨드의 10% 이상</div></div>
      <div class="kpi"><div class="lbl">정렬</div><div class="v" style="font-size:15px">스팟 단가 싼 순</div><div class="s">회수 위험은 사업자마다 달라 순위에 넣지 않음</div></div></div>
    ${jump(S.models)}
    ${S.models.map(g => `<div class="panel dgroup" id="d-${esc(g.model)}"><div class="ph"><h3>${esc(g.model)} <span class="muted">${g.rows.length}개 · 시장 온디맨드 중앙값 ${money(g.market_od)}</span></h3></div><div class="tw"><table class="t">
      <thead><tr><th>사업자</th><th>가격 방식</th><th class="n">스팟 /GPU·시간</th><th class="n">온디맨드 /GPU·시간</th><th class="n">할인</th><th>회수될 때</th><th>출처 · 수집</th></tr></thead><tbody>
      ${g.rows.map(r => { const mc = MECH[r.mechanism];
        return `<tr class=""><td><span class="pv">${starBtn(r.provider_id, r.provider_name)}<span class="prov">${esc(r.provider_name)}</span></span>${r.via ? `<span class="via" title="gpufinder.dev 집계 데이터">${esc(r.via)} 경유</span>` : ''}<span class="sub2">${r.gpu_count || 1}× · ${esc(r.region || '—')}</span></td>
        <td>${mc ? `<span class="pill ${mc[0]}">${mc[1]}</span>` : '<span class="muted">미확인</span>'}</td>
        <td class="n"><b>${money(r.price)}</b><span class="sub2">${r.low_7d != null && r.high_7d != null && Math.abs(r.high_7d - r.low_7d) > 1e-9 ? `7일 ${money(r.low_7d)}~${money(r.high_7d)}${r.range_source === 'GPU Finder' ? ' (GPU Finder)' : ''}` : '7일 변동 없음'}</span></td>
        <td class="n">${r.od_basis === 'provider' ? `${money(r.od_price)}${r.od_same_region ? '' : '<span class="sub2">다른 지역</span>'}` : r.od_basis === 'aggregator' ? `<span class="muted">${money(r.od_price)}</span><span class="sub2">GPU Finder 표시 · 같은 상품 (참고)</span>` : r.od_basis === 'market' ? `<span class="muted">${money(r.market_od)}</span><span class="sub2">자체 온디맨드 없음 · 시장 중앙값(참고)</span>` : '<span class="muted">—</span>'}</td>
        <td class="n">${r.valid ? `<b class="down">${pctu(r.discount_pct, 0)}</b>` : r.discount_pct != null ? `<span class="muted" title="${esc(r.invalid_reason || '')}">참고 ${pctu(r.discount_pct, 0)}</span><span class="sub2" title="${esc(r.invalid_reason || '')}">${r.od_basis === 'aggregator' ? '직접 수집 아님' : esc(r.invalid_reason || '같은 사업자 짝 없음')}</span>` : '<span class="muted">—</span>'}</td>
        <td>${r.on_interrupt ? esc(r.on_interrupt) : '<span class="muted">문서 확인 필요</span>'}</td>
        <td>${r.source_url ? `<a href="${esc(r.source_url)}" target="_blank" rel="noopener">원문</a>` : '—'}<span class="sub2">${ago(r.collected_at)} 수집 · ${ago(r.unchanged_since)}부터 같은 가격</span></td></tr>`; }).join('')}
      </tbody></table></div></div>`).join('') || '<div class="pb muted">스팟 가격이 없습니다.</div>'}
    <p class="pnote">· 할인 = 1 − (스팟 단가 ÷ 같은 사업자·같은 모델의 온디맨드 단가). 같은 사업자 온디맨드가 없으면 시장 온디맨드 중앙값과 비교한 값을 ‘참고’로만 보여 주고 대표값에서 뺍니다.<br>· 스팟은 언제든 회수될 수 있어 온디맨드와 같은 상품이 아닙니다. ‘가격 방식’과 ‘회수될 때’는 사업자 공개 문서 요약(config/providers.json)이며 계약 전 확인이 필요합니다.<br>· 7일 범위는 최근 7일 수집 회차의 최저~최고 스팟 단가입니다. ‘GPU Finder 경유’ 행은 gpufinder.dev 공개 데이터(하루 1회)입니다. 할인은 GPU Finder가 같은 상품에 표시한 온디맨드가 기준의 <b>참고값</b>이며, 대시보드·사업성 분석의 시장 통계에는 넣지 않습니다(직접 수집 기준). 짝짓기는 같은 수집 경로 안에서만 합니다.</p>`;
  wireDisc();
}
function wireDisc() {
  $('#discBody').onclick = e => {
    const j = e.target.closest('[data-jump]');
    if (j) { e.preventDefault(); document.getElementById(j.dataset.jump).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); return; }
    onStarClick(e);
  };
}
function discCsv() {
  const d = state.disc.d; if (!d) return;
  if (state.disc.tab === 'reserved')
    downloadCSV(`reserved_discounts_${stamp()}.csv`, ['모델', '사업자', '약정', 'USD/GPU·시간', '원본가(노드)', 'GPU 수', '자체 온디맨드', '할인율', '할인액', '같은 지역', '7일 변동', '지역', '수집 시각', '같은 가격 시작', '출처'],
      d.reserved.models.flatMap(g => g.rows.map(r => [g.model, r.provider_name, r.term, r.price, r.raw_price, r.gpu_count, r.od_price, r.discount_pct == null ? '' : (r.discount_pct * 100).toFixed(1) + '%', r.discount_usd, r.od_same_region ? 'Y' : 'N', r.change_7d == null ? '' : (r.change_7d * 100).toFixed(1) + '%', r.region, r.collected_at, r.unchanged_since, r.source_url])));
  else
    downloadCSV(`spot_vs_ondemand_${stamp()}.csv`, ['모델', '사업자', '스팟 USD/GPU·시간', '7일 최저', '7일 최고', '온디맨드', '온디맨드 기준', '할인율', '유효', '가격 방식', '회수될 때', '수집 시각', '출처'],
      d.spot.models.flatMap(g => g.rows.map(r => [g.model, r.provider_name, r.price, r.low_7d, r.high_7d, r.od_basis === 'provider' ? r.od_price : r.market_od, r.od_basis === 'provider' ? '같은 사업자' : '시장 중앙값(참고)', r.discount_pct == null ? '' : (r.discount_pct * 100).toFixed(1) + '%', r.valid ? 'Y' : 'N', r.mechanism, r.on_interrupt, r.collected_at, r.source_url])));
}
function wireDiscPage() {
  $('#discTabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { state.disc.tab = b.dataset.t; renderDiscounts(); } };
  $('#discCsv').onclick = discCsv;
  $('#gfBtn').onclick = async () => {
    const b = $('#gfBtn'); b.disabled = true; b.textContent = '받는 중…';
    try { const r = await api('/api/aggregators/gpufinder', {}); toast(`GPU Finder — ${r.rows}행 중 데이터센터 GPU 스팟 ${r.spot}개 · 온디맨드 ${r.on_demand}개 적재${r.new_providers.length ? ` · 새 사업자 ${r.new_providers.join(', ')}` : ''}`, 6000); await loadMeta(); renderDiscounts(); }
    catch (e) { toast(e.message, 7000); }
    b.disabled = false; b.textContent = 'GPU Finder 받기';
  };
}
