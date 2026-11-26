/* 사업성 분석 — 네 모듈, 하나의 비즈니스 사례. app.js 의 공통 헬퍼($, esc, api, money, pct, pctu, mkChart, css, state …)를 쓴다.
   모든 숫자는 POST /api/bc/model 한 번의 응답(같은 가정)에서 나온다. */
const BC_VENDOR = { NVIDIA: '--t-neo', AMD: '--bad', TPU: '--info', Trainium: '--warn' };
const BC_TABS = [['econ', '01 가속기 경제성·설치 기반'], ['tco', '02 GPU TCO·임대료'], ['fin', '03 클러스터 재무'], ['perf', '04 가격 대비 성능']];
const BC_ADV = [
  ['자금 조달', [['debt_pct', '차입 비율', '%'], ['interest_rate', '금리 (비우면 수출입은행 금리 + 가산)', '%'], ['loan_spread', '가산금리', '%'], ['pik_share', 'PIK 이자 비중', '%'], ['debt_term_years', '상환 기간', '년'], ['cost_of_equity', '자기자본비용', '%']]],
  ['회계·수명', [['dep_years', '감가상각 기간', '년'], ['physical_life_years', '물리적 작동 수명', '년'], ['useful_life_years', 'TCO 회수 기간', '년'], ['tax_rate', '법인세율', '%'], ['residual_pct', '잔존가치 (설비비 대비)', '%'], ['repair_pct', '수리비 (연, 설비비 대비)', '%']]],
  ['고객 계약', [['contract_coverage', '고정가 계약 비중', '%'], ['contract_years', '계약 기간', '년'], ['contract_discount', '계약 할인 (현재 시장가 대비)', '%'], ['annual_decline', '임대료 연간 하락률 (비우면 시나리오)', '%'], ['prepay_pct', '선불 비율 (계약 총액 대비)', '%'], ['current_rental', '현재 임대료 (비우면 DB)', '$/h']]],
  ['원가 (가속기 1개) · 운영', [['capex_gpu', 'GPU', '$'], ['capex_dram', 'DRAM', '$'], ['capex_nand', 'NAND', '$'], ['capex_other', 'CPU·섀시 등', '$'], ['network', '네트워킹', '$'], ['power_usd_kwh', '전기료', '$/kWh'], ['pue', 'PUE', '배'], ['facility_usd_kw_month', '공간 (kW·월)', '$'], ['wacc', 'WACC', '%'], ['maintenance_pct', '유지보수 (연)', '%']]],
];
const BC_INIT = () => ({ acc: 'H100', buyer: 'SKT', sc: 'BASE', tab: 'econ', util: '', n: '', ov: {}, basis: 'tco', stmt: 'is', sample: 'direct', a: null, d: null });
const big = v => { if (v == null || !isFinite(v)) return '—'; const sg = v < 0 ? '−' : '', x = Math.abs(v); return sg + (state.cur === 'KRW' && state.fx ? '₩' + (x * state.fx / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '억' : '$' + (x / 1e6).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M'); };
const num = (v, d = 0) => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const sgnCls = v => v == null ? '' : v >= 0 ? 'down' : 'up';     // 화면 관례: down(초록)=좋음, up(빨강)=나쁨

async function renderBiz() {
  const B = state.bc;
  if (!B.a) { try { B.a = await api('/api/bc/assumptions'); } catch (e) { errBox($('#bcBody'), e); return; } }
  const a = B.a;
  const vendors = [...new Set(a.accelerators.map(x => x.vendor))];
  $('#bcAcc').innerHTML = vendors.map(v => `<optgroup label="${esc(v)}">${a.accelerators.filter(x => x.vendor === v).map(x => `<option value="${esc(x.id)}" ${x.id === B.acc ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
  $('#bcBuyer').innerHTML = Object.entries(a.buyers).map(([k, b]) => `<option value="${k}" ${k === B.buyer ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  segment($('#bcSc'), Object.entries(a.scenarios).map(([k, s]) => [k, s.name]), B.sc, v => { B.sc = v; bcRun(); });
  const buyer = a.buyers[B.buyer];
  $('#bcUtil').placeholder = Math.round(buyer.utilization * 100); $('#bcUtil').value = B.util;
  $('#bcN').placeholder = a.defaults.n_accel; $('#bcN').value = B.n;
  $('#bcTabs').innerHTML = BC_TABS.map(([k, l]) => `<button type="button" class="ltab" data-t="${k}" aria-current="${k === B.tab}">${l}</button>`).join('');
  bcAdvForm();
  await bcRun();
}
function bcDefault(key) {
  const a = state.bc.a, acc = a.accelerators.find(x => x.id === state.bc.acc), b = a.buyers[state.bc.buyer];
  if (key.startsWith('capex_')) return acc.capex[key.slice(6)];
  if (key === 'annual_decline') return a.scenarios[state.bc.sc].annual_decline;
  if (key === 'network') return acc.network;
  if (key === 'current_rental') return a.market[acc.id] ? +a.market[acc.id].price.toFixed(2) : acc.rental_ref;
  return key in a.defaults ? a.defaults[key] : b[key];
}
function bcAdvForm() {
  $('#bcAdvBody').innerHTML = BC_ADV.map(([g, fields]) => `<fieldset class="bc-fs"><legend>${g}</legend>${fields.map(([k, l, u]) => {
    const dv = bcDefault(k), shown = u === '%' ? +(dv * 100).toFixed(2) : dv, cur = state.bc.ov[k];
    return `<label class="bc-f"><span>${l}</span><span class="bc-in"><input type="number" step="any" min="0" data-k="${k}" data-u="${u}" placeholder="${shown}" value="${cur == null ? '' : u === '%' ? +(cur * 100).toFixed(4) : cur}"><i>${u}</i></span></label>`;
  }).join('')}</fieldset>`).join('');
}
function bcCollect() {
  const B = state.bc, ov = {};
  document.querySelectorAll('#bcAdvBody input[data-k]').forEach(i => { if (i.value !== '') ov[i.dataset.k] = i.dataset.u === '%' ? parseFloat(i.value) / 100 : parseFloat(i.value); });
  B.util = $('#bcUtil').value; B.n = $('#bcN').value;
  if (B.util !== '') ov.utilization = parseFloat(B.util) / 100;
  if (B.n !== '') ov.n_accel = parseFloat(B.n);
  B.ov = ov;
}
async function bcRun() {
  const B = state.bc;
  bcCollect();
  $('#bcMsg').textContent = '계산 중…';
  try { B.d = await api('/api/bc/model', { accelerator: B.acc, buyer: B.buyer, scenario: B.sc, overrides: B.ov, sample: B.sample }); $('#bcMsg').textContent = Object.keys(B.ov).length ? `조정한 가정 ${Object.keys(B.ov).length}개 반영` : '기본 가정'; }
  catch (e) { $('#bcMsg').textContent = ''; errBox($('#bcBody'), e); return; }
  const ir = document.querySelector('#bcAdvBody input[data-k="interest_rate"]');
  if (ir) ir.placeholder = +(B.d.params.interest_rate * 100).toFixed(2);
  bcSummary(); bcTab();
}
function interestNote(d) {
  const i = d.interest || {};
  if (i.source === 'exim') return `수출입은행 대출금리 ${esc(i.term_label)} ${num(i.base_pct, 2)}% + 가산 ${num(i.spread * 100, 2)}%p · ${esc(String(i.date).slice(0, 10))} 고시`;
  if (i.source === 'override') return '직접 입력';
  return '기본값 (수출입은행 대출금리 미적재)';
}
function bcSummary() {
  const d = state.bc.d, t = d.tco, r = d.rental, f = d.finance.summary;
  $('#bcSum').innerHTML = `
    <div class="gl base"><div class="lbl">시간당 TCO · ${esc(d.accelerator.id)}</div><div class="v">${money(t.total_hourly)}</div><div class="s">${esc(d.buyer.name)} · 가동률 ${pctu(t.utilization, 0)}</div></div>
    <div class="gl"><div class="lbl">현재 임대료 (중앙값)</div><div class="v">${money(r.current)}</div><div class="s">${r.band ? `범위 ${money(r.band.p25)}~${money(r.band.p75)} · 직접 ${r.market.n_direct}곳${r.band.n_external ? ` + 외부 ${r.band.n_external}곳` : ''}` : r.source === 'override' ? '직접 입력값' : '참고값 (수집 데이터 없음)'}</div></div>
    <div class="gl"><div class="lbl">임대 마진</div><div class="v ${sgnCls(r.current - t.total_hourly)}">${pct((r.current - t.total_hourly) / r.current, 0)}</div><div class="s">(임대료 − TCO) ÷ 임대료</div></div>
    <div class="gl"><div class="lbl">프로젝트 NPV · IRR</div><div class="v ${sgnCls(f.project_npv)}">${big(f.project_npv)}</div><div class="s">${r.band ? `임대료 범위 시 ${big(r.band.npv_p25)} ~ ${big(r.band.npv_p75)}` : `IRR ${f.project_irr == null ? '—' : pctu(f.project_irr, 1)}`} · ${esc(d.finance_by_scenario[d.scenario].name)}</div></div>
    <div class="gl"><div class="lbl">$/MTok · 추론</div><div class="v">${money(d.bench.find(b => b.id === d.accelerator.id).perf_tco.usd_per_mtok, 'USD', 3)}</div><div class="s">TCO 기준 · ${num(d.accelerator.infer_tok_s)} tok/s</div></div>`;
}
function bcTab() {
  document.querySelectorAll('#bcTabs .ltab').forEach(b => b.setAttribute('aria-current', b.dataset.t === state.bc.tab));
  ({ econ: bcEcon, tco: bcTco, fin: bcFin, perf: bcPerf })[state.bc.tab]();
}

/* 01 가속기 경제성·설치 기반 */
function bcEcon() {
  const d = state.bc.d, o = d.outlook, ib = o.install_base, last = ib[ib.length - 1];
  const vendors = [...new Set(d.bench.map(b => b.vendor))];
  $('#bcBody').innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="lbl">${last.year} 설치 기반</div><div class="v">${num(last.units_k / 1000, 1)}<span style="font-size:13px;color:var(--ink-3)"> 백만 개</span></div><div class="s">출하 후 ${o.life}년 가동 가정</div></div>
      <div class="kpi"><div class="lbl">시장 학습 처리량 (실효)</div><div class="v">${num(last.train_eflops / 1000, 1)}<span style="font-size:13px;color:var(--ink-3)"> ZFLOPS</span></div><div class="s">BF16 dense × MFU · ${last.year}</div></div>
      <div class="kpi"><div class="lbl">시장 추론 처리량</div><div class="v">${num(last.infer_mtok_s / 1e3, 1)}<span style="font-size:13px;color:var(--ink-3)"> B tok/s</span></div><div class="s">70B급 모델 기준 · ${last.year}</div></div>
      <div class="kpi"><div class="lbl">${o.years[o.years.length - 1]} 연간 출하</div><div class="v">${num(Object.values(o.vendors).reduce((s, v) => s + v[v.length - 1].units_k, 0) / 1000, 1)}<span style="font-size:13px;color:var(--ink-3)"> 백만 개</span></div><div class="s">4개 벤더 합계</div></div>
      <div class="kpi warn"><div class="lbl">데이터 성격</div><div class="v" style="font-size:15px">가정치</div><div class="s">출하·원가·처리량은 교체 필요</div></div>
    </div>
    <div class="panel"><div class="ph"><h3>가속기별 벤치마크 · 경제성</h3><span class="muted">행을 누르면 그 가속기로 전체 사례를 다시 계산합니다 · * 전력 비공개(추정)</span></div>
      <div class="tw"><table class="t bc-bench"><thead><tr><th>벤더</th><th>가속기</th><th class="n">BF16 PFLOPS</th><th class="n">FP8 PFLOPS</th><th class="n">HBM</th><th class="n">대역폭 TB/s</th><th class="n">GPU TDP</th><th class="n">시스템 전력</th><th class="n">학습 실효 PFLOPS</th><th class="n">추론 tok/s</th><th class="n">설비비 /개</th><th class="n">시간당 TCO</th><th class="n">현재 임대료</th><th class="n">$/MTok</th><th class="n">$/EFLOP</th></tr></thead><tbody>
      ${d.bench.map(b => `<tr data-acc="${esc(b.id)}" class="${b.id === d.accelerator.id ? 'sel' : ''}" tabindex="0"><td style="white-space:nowrap"><span class="vd" style="background:var(${BC_VENDOR[b.vendor]})"></span>${esc(b.vendor)}</td><td class="prov">${esc(b.name)}<span class="sub2">${esc(b.launch)}</span></td>
        <td class="n">${num(b.bf16_pflops, 2)}</td><td class="n">${num(b.fp8_pflops, 2)}</td><td class="n">${b.hbm_gb} GB</td><td class="n">${num(b.hbm_tbs, 2)}</td>
        <td class="n">${num(b.tdp_w)} W${b.tdp_estimated ? '*' : ''}</td><td class="n">${num(b.system_w)} W</td><td class="n">${num(b.eff_train_pflops, 2)}<span class="sub2">MFU ${pctu(b.train_mfu, 0)}</span></td><td class="n">${num(b.infer_tok_s)}</td>
        <td class="n">${money(b.capex_total, state.cur, 0)}</td><td class="n"><b>${money(b.tco_hourly)}</b></td><td class="n">${money(b.rental)}<span class="sub2">${b.rental_source === 'market' ? `시장 ${b.rental_n}곳` : '참고값'}</span></td>
        <td class="n">${money(b.perf_tco.usd_per_mtok, 'USD', 3)}</td><td class="n">${money(b.perf_tco.usd_per_eflop, 'USD', 3)}</td></tr>`).join('')}</tbody></table></div>
      <div class="pb cmp-note">· 시간당 TCO·$/MTok·$/EFLOP는 선택한 구매자 유형(${esc(d.buyer.name)})의 전기료·공간·WACC·가동률로 계산한 값입니다. 02·04 탭과 같은 숫자입니다.<br>· BF16·FP8은 공개 사양(dense)입니다. 시스템 전력은 가속기 1개당 CPU·NIC·팬 배분을 포함한 추정치이고, MFU·tok/s·설비비는 실습용 가정치입니다.<br>· $/EFLOP = 시간당 비용 ÷ (BF16 PFLOPS × MFU × 3,600초 ÷ 1,000) — 실효 학습 연산 10<sup>18</sup>회 비용.</div></div>
    <div class="grid2" style="margin-top:12px">
      <div class="panel"><div class="ph"><h3>벤더별 출하 전망 (천 개)</h3><span class="muted">${o.years[0]}–${o.years[o.years.length - 1]} · 흐린 막대 = 성능 외삽 연도</span></div><div class="pb"><div class="chartbox" style="height:300px"><canvas id="bcShip" role="img" aria-label="벤더별 출하 전망"></canvas></div></div></div>
      <div class="panel"><div class="ph"><h3>설치 기반과 시장 처리량</h3><span class="muted">${o.years[0]}–${o.install_base_until}</span></div><div class="pb"><div class="chartbox" style="height:300px"><canvas id="bcBase" role="img" aria-label="설치 기반"></canvas></div></div></div>
    </div>
    <p class="pnote" style="margin-top:10px">${esc(o.note)}</p>`;
  $('#bcBody').querySelector('.bc-bench tbody').onclick = e => { const tr = e.target.closest('tr[data-acc]'); if (tr) { state.bc.acc = tr.dataset.acc; state.bc.ov = Object.fromEntries(Object.entries(state.bc.ov).filter(([k]) => !k.startsWith('capex_') && k !== 'network' && k !== 'current_rental')); renderBiz(); } };
  $('#bcBody').querySelector('.bc-bench tbody').onkeydown = e => { if (e.key === 'Enter') e.target.click(); };
  mkChart('bcShip', { type: 'bar', data: { labels: o.years, datasets: vendors.map(v => ({ label: v, data: o.vendors[v].map(r => r.units_k), backgroundColor: o.vendors[v].map(r => css(BC_VENDOR[v]) + (r.projected ? '77' : 'DD')), stack: 's' })) },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'top', align: 'end' }, tooltip: { callbacks: { afterLabel: c => { const r = o.vendors[c.dataset.label][c.dataIndex]; return `대표 ${r.rep}${r.projected ? ` (성능 연 ${pctu(o.perf_growth, 0)} 외삽)` : ''}`; } } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: v => num(v) } } } } });
  mkChart('bcBase', { data: { labels: ib.map(r => r.year), datasets: [
      ...vendors.map(v => ({ type: 'bar', label: v, data: ib.map(r => r.by_vendor[v] / 1000), backgroundColor: css(BC_VENDOR[v]) + 'CC', stack: 'b', yAxisID: 'y' })),
      { type: 'line', label: '학습 실효 ZFLOPS', data: ib.map(r => r.train_eflops / 1000), borderColor: css('--ink'), backgroundColor: css('--ink'), yAxisID: 'y1', tension: .25, pointRadius: 3 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'top', align: 'end' } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, title: { display: true, text: '설치 기반 (백만 개)' } }, y1: { position: 'right', grid: { display: false }, title: { display: true, text: 'ZFLOPS' } } } } });
}

/* 02 GPU TCO·임대료 */
function bcTco() {
  const d = state.bc.d, t = d.tco, r = d.rental, n = d.params.n_accel;
  const COL = { gpu: '--t-neo', dram: '--t-hyper', nand: '--t-mkt', other: '--t-kr', network: '--info', capital: '--ink-3', power: '--warn', facility: '--bad', maintenance: '--ok' };
  const annual = t.items.reduce((s, i) => s + i.annual, 0), beUtil = annual / (8760 * r.current);
  const yrs = r.scenarios.BASE.prices.map((_, i) => i === 0 ? '현재' : `${i}년차`);
  $('#bcBody').innerHTML = `
    <div class="grid2" style="grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)">
      <div class="panel"><div class="ph"><h3>GPU 시간당 비용이 어디에 쓰이는지</h3><span class="muted">${esc(d.accelerator.name)} · ${esc(d.buyer.name)} · 판매 1시간당</span></div>
        <div class="pb"><div class="bc-stack"><canvas id="bcCost" role="img" aria-label="시간당 원가 구성"></canvas></div>
        <table class="t bc-cost"><thead><tr><th>항목</th><th class="n">/시간</th><th class="n">비중</th><th class="n">연간 /개</th><th class="n">연간 클러스터 (${num(n)}개)</th></tr></thead><tbody>
        ${t.items.map(i => `<tr><td><span class="vd" style="background:var(${COL[i.key]})"></span>${esc(i.label)}</td><td class="n">${money(i.hourly, state.cur, 3)}</td><td class="n">${pctu(i.share, 1)}</td><td class="n">${money(i.annual, state.cur, 0)}</td><td class="n">${big(i.annual * n)}</td></tr>`).join('')}
        <tr class="tot"><td>합계 (시간당 TCO)</td><td class="n">${money(t.total_hourly, state.cur, 3)}</td><td class="n">100%</td><td class="n">${money(annual, state.cur, 0)}</td><td class="n">${big(annual * n)}</td></tr></tbody></table>
        <div class="cmp-note" style="padding:10px 0 0">· 서버·네트워킹 설비비는 ${d.params.useful_life_years}년 정액 감가상각, 자본비용은 자본회수계수(WACC ${pctu(d.buyer.wacc, 1)})에서 감가상각을 뺀 나머지입니다.<br>· 전력은 GPU TDP(${num(d.accelerator.tdp_w)} W)가 아니라 시스템 전력 ${num(d.accelerator.system_w)} W × PUE ${d.buyer.pue}, 놀 때 ${pctu(d.params.idle_power_ratio, 0)} 대기전력 가정. 공간은 kW·월 ${money(d.buyer.facility_usd_kw_month, 'USD', 0)}.</div></div></div>
      <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
        <div class="kpis" style="grid-template-columns:1fr 1fr;margin:0">
          <div class="kpi"><div class="lbl">현금 운영비 /시간</div><div class="v">${money(t.cash_cost_hourly)}</div><div class="s">전력·공간·유지보수 = 임대료 하한</div></div>
          <div class="kpi"><div class="lbl">설비비 /개</div><div class="v">${money(t.capex_total, state.cur, 0)}</div><div class="s">서버 ${money(t.capex_server, state.cur, 0)} · 네트워킹 ${money(t.capex_network, state.cur, 0)}</div></div>
          <div class="kpi"><div class="lbl">손익분기 가동률 ≈</div><div class="v ${beUtil <= t.utilization ? 'down' : 'up'}">${pctu(beUtil, 0)}</div><div class="s">현재 임대료 ${money(r.current)} 기준</div></div>
          <div class="kpi"><div class="lbl">임대 마진</div><div class="v ${sgnCls(r.current - t.total_hourly)}">${pct((r.current - t.total_hourly) / r.current, 0)}</div><div class="s">${r.source === 'market' ? `시장 중앙값 · ${r.market.n}곳` : '참고값'}</div></div>
        </div>
        <div class="panel"><div class="ph"><h3>구매자 유형별 TCO</h3><span class="muted">같은 가속기</span></div><div class="tw"><table class="t"><thead><tr><th>구매자</th><th class="n">/시간</th><th class="n">WACC</th><th class="n">전기료</th><th class="n">가동률</th></tr></thead><tbody>
          ${d.buyers.map(b => `<tr class="${b.id === d.buyer.id ? 'sel' : ''}"><td>${esc(b.name)}</td><td class="n"><b>${money(b.tco_hourly)}</b></td><td class="n">${pctu(b.wacc, 1)}</td><td class="n">$${b.power_usd_kwh}</td><td class="n">${pctu(b.utilization, 0)}</td></tr>`).join('')}</tbody></table></div></div>
      </div>
    </div>
    <div class="panel" style="margin-top:12px"><div class="ph"><h3>임대료 시나리오 (USD/GPU·시간)</h3><span class="muted">현재 시장가에서 연간 하락 · 현금 운영비 아래로는 떨어지지 않음</span></div>
      <div class="pb"><div class="chartbox" style="height:300px"><canvas id="bcRent" role="img" aria-label="임대료 시나리오"></canvas></div>
      <div class="tw" style="margin-top:10px"><table class="t"><thead><tr><th>시나리오</th><th class="n">연간 하락</th><th class="n">가동률 조정</th>${yrs.map(y => `<th class="n">${y}</th>`).join('')}<th>TCO 아래로</th></tr></thead><tbody>
      ${Object.entries(r.scenarios).map(([k, s]) => `<tr class="${k === d.scenario ? 'sel' : ''}"><td class="prov">${esc(s.name)}</td><td class="n">−${pctu(s.annual_decline, 0)}</td><td class="n">${s.util_delta ? pct(s.util_delta, 0).replace('%', '%p') : '—'}</td>${s.prices.map(p => `<td class="n ${p < t.total_hourly ? 'up' : ''}">${money(p)}</td>`).join('')}<td>${s.below_tco_year == null ? '<span class="muted">수명 내 없음</span>' : s.below_tco_year === 0 ? '이미 아래' : `${s.below_tco_year}년차부터`}</td></tr>`).join('')}</tbody></table></div></div></div>`;
  mkChart('bcCost', { type:'bar', data:{labels:['시간당 비용'],datasets:t.items.map(i=>({label:i.label,data:[i.share*100],backgroundColor:css(COL[i.key]),stack:'cost'}))},
    options:{indexAxis:'y',skCompact:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${t.items[c.datasetIndex].label}: ${money(t.items[c.datasetIndex].hourly)} (${pctu(t.items[c.datasetIndex].share,1)})`}}},scales:{x:{stacked:true},y:{stacked:true}}}});
  const SC = { BULL: '--ok', BASE: '--accent', BEAR: '--bad' };
  mkChart('bcRent', { type: 'line', data: { labels: yrs, datasets: [
      ...Object.entries(r.scenarios).map(([k, s]) => ({ label: s.name, data: s.prices.map(p => conv(p)), borderColor: css(SC[k]), backgroundColor: css(SC[k]), borderWidth: k === d.scenario ? 3 : 1.5, tension: .2, pointRadius: 3 })),
      { label: '시간당 TCO', data: yrs.map(() => conv(t.total_hourly)), borderColor: css('--ink'), borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
      { label: '현금 운영비 (하한)', data: yrs.map(() => conv(t.cash_cost_hourly)), borderColor: css('--ink-3'), borderDash: [2, 3], pointRadius: 0, borderWidth: 1.5 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'top', align: 'end' } }, scales: { y: { beginAtZero: true, ticks: { callback: v => state.cur === 'KRW' ? '₩' + num(v) : '$' + v } } } } });
}
const conv = v => state.cur === 'KRW' && state.fx ? Math.round(v * state.fx) : +v.toFixed(3);

/* 03 클러스터 재무 */
const BC_STMT = {
  is: ['손익계산서', [['revenue', '매출'], ['rev_contract', '  고정가 계약', 1], ['rev_market', '  시장가 판매', 1], ['opex', '운영비 (전력·공간·수리)'], ['ebitda', 'EBITDA', 0, 1], ['dep', '감가상각비'], ['ebit', '영업이익 (EBIT)', 0, 1], ['interest_cash', '현금 이자'], ['interest_pik', 'PIK 이자 (원금 가산)'], ['gain', '자산 처분이익'], ['ebt', '세전이익'], ['tax', '법인세'], ['ni', '당기순이익', 0, 1]]],
  bs: ['재무상태표 (연말)', [['ppe', 'GPU 클러스터 (순장부가)'], ['assets', '자산 총계', 0, 1], ['debt', '차입금 (PIK 포함)'], ['deferred', '선수수익'], ['equity', '자기자본'], ['balance_gap', '검증: 자산 − 부채 − 자본', 1]]],
  cf: ['현금흐름표', [['cfo', '영업활동 현금흐름', 0, 1], ['cfi', '투자활동 (설비 투자·매각)'], ['debt_draw', '차입'], ['principal', '원금 상환', 2], ['equity_cf', '자기자본 현금흐름 (배분 − 출자)', 0, 1], ['project_fcf', '프로젝트 FCF (차입 전)', 0, 1], ['cum_project', '누적 프로젝트 현금흐름'], ['cum_equity', '누적 자기자본 현금흐름']]],
};
function bcFin() {
  const d = state.bc.d, F = d.finance, s = F.summary, rows = F.rows, B = state.bc;
  const irrS = v => v == null ? '—' : pctu(v, 1);
  const [title, lines] = BC_STMT[B.stmt];
  $('#bcBody').innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="lbl">프로젝트 NPV (WACC ${pctu(s.wacc, 1)})</div><div class="v ${sgnCls(s.project_npv)}">${big(s.project_npv)}</div><div class="s">IRR ${irrS(s.project_irr)} · 회수 ${s.payback_year ? s.payback_year + '년차' : '수명 내 미회수'}</div></div>
      <div class="kpi"><div class="lbl">자기자본 NPV (${pctu(s.cost_of_equity, 0)})</div><div class="v ${sgnCls(s.equity_npv)}">${big(s.equity_npv)}</div><div class="s">IRR ${irrS(s.equity_irr)} · 출자 ${big(s.equity_in)}</div></div>
      <div class="kpi"><div class="lbl">잔존가치</div><div class="v">${big(s.residual_value)}</div><div class="s">현재가치(세후) ${big(s.residual_npv)} · ${s.years}년 후</div></div>
      <div class="kpi"><div class="lbl">EBITDA · EBIT (연평균)</div><div class="v">${big(s.avg_ebitda)}</div><div class="s">EBIT ${big(s.avg_ebit)} · EBITDA 마진 ${pctu(s.ebitda_margin, 0)}</div></div>
      <div class="kpi"><div class="lbl">ROA · ROIC · ROE</div><div class="v" style="font-size:17px">${irrS(s.roa)} · ${irrS(s.roic)} · ${irrS(s.roe)}</div><div class="s">운영 기간 가중 평균</div></div>
    </div>
    ${bcSensHTML(d)}
    <div class="grid2" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)">
      <div class="panel"><div class="ph"><h3>누적 현금흐름</h3><span class="muted">${esc(d.finance_by_scenario[d.scenario].name)} · ${num(d.params.n_accel)}개 클러스터</span></div><div class="pb"><div class="chartbox" style="height:280px"><canvas id="bcCash" role="img" aria-label="누적 현금흐름"></canvas></div></div></div>
      <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
        <div class="panel"><div class="ph"><h3>자금 원천과 사용 (구축 시점)</h3></div><div class="pb"><dl class="kv">
          <dt>설비 투자 (서버 + 네트워킹)</dt><dd>${big(s.capex)}</dd><dt>차입 (${pctu(d.params.debt_pct, 0)}, 금리 ${pctu(d.params.interest_rate, 2)}${d.params.pik_share ? `, PIK ${pctu(d.params.pik_share, 0)}` : ''})<span class="sub2">${interestNote(d)}</span></dt><dd>${big(s.debt)}</dd>
          <dt>고객 선불 (계약 총액의 ${pctu(d.params.prepay_pct, 0)})</dt><dd>${big(s.prepay)}</dd><dt>자기자본 출자</dt><dd>${big(s.equity_in)}</dd>
          <dt>고정 계약가 (${pctu(d.params.contract_coverage, 0)} 물량 · ${d.params.contract_years}년)</dt><dd>${money(s.contract_price)}/h</dd><dt>가동률 (시나리오 반영)</dt><dd>${pctu(s.utilization, 0)}</dd></dl></div></div>
        <div class="panel"><div class="ph"><h3>시나리오 비교</h3></div><div class="tw"><table class="t"><thead><tr><th>시나리오</th><th class="n">프로젝트 NPV</th><th class="n">IRR</th><th class="n">자기자본 IRR</th><th class="n">회수</th></tr></thead><tbody>
          ${Object.entries(d.finance_by_scenario).map(([k, x]) => `<tr class="${k === d.scenario ? 'sel' : ''}"><td>${esc(x.name)}</td><td class="n ${sgnCls(x.project_npv)}">${big(x.project_npv)}</td><td class="n">${irrS(x.project_irr)}</td><td class="n">${irrS(x.equity_irr)}</td><td class="n">${x.payback_year ? x.payback_year + '년' : '—'}</td></tr>`).join('')}</tbody></table></div></div>
      </div>
    </div>
    <div class="panel" style="margin-top:12px"><div class="ph"><h3>3개 재무제표 <span class="muted">${state.cur === 'KRW' ? '억 원' : '백만 USD'}</span></h3><div class="seg" id="bcStmt">${Object.entries(BC_STMT).map(([k, [l]]) => `<button type="button" data-v="${k}" aria-pressed="${k === B.stmt}">${l.replace(' (연말)', '')}</button>`).join('')}</div></div>
      <div class="tw"><table class="t bc-stmt"><thead><tr><th>${title}</th>${rows.map(r => `<th class="n">${r.year === 0 ? '구축 (0년)' : r.year + '년차'}</th>`).join('')}</tr></thead><tbody>
      ${lines.map(([k, l, sub, bold]) => `<tr class="${bold ? 'tot' : ''} ${sub === 1 ? 'subl' : ''}"><td>${esc(l.trim())}</td>${rows.map(r => { let v = r[k] ?? 0; if (sub === 2) v = -v; if (k === 'balance_gap') return `<td class="n ${Math.abs(v) < 1 ? 'down' : 'up'}">${Math.abs(v) < 1 ? '0 ✓' : num(v, 2)}</td>`; return `<td class="n ${v < 0 ? 'neg' : ''}">${stmtNum(v)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="pb cmp-note">· 0년차 = 설비 투자·차입·고객 선불 수령. 선불은 선수수익으로 잡고 계약 기간 동안 매출로 인식합니다(현금은 0년차에 이미 들어옴).<br>· 남는 현금은 매년 자기자본에 배분하고 부족하면 출자하는 구조라 현금 잔액은 0입니다. 마지막 해에 잔존가치로 매각하고 남은 차입금을 상환합니다.<br>· PIK 이자는 현금으로 내지 않고 원금에 더해 만기에 갚습니다. 결손은 이월해 이후 이익에서 공제합니다.</div></div>`;
  $('#bcStmt').onclick = e => { const b = e.target.closest('button'); if (b) { B.stmt = b.dataset.v; bcFin(); } };
  bcSensChart(d);
  const lbl = rows.map(r => r.year === 0 ? '0' : r.year + '년');
  const M = v => state.cur === 'KRW' && state.fx ? v * state.fx / 1e8 : v / 1e6;
  mkChart('bcCash', { data: { labels: lbl, datasets: [
      { type: 'bar', label: '연간 프로젝트 FCF', data: rows.map(r => M(r.project_fcf)), backgroundColor: rows.map(r => css(r.project_fcf >= 0 ? '--ok' : '--bad') + '88') },
      { type: 'line', label: '누적 프로젝트', data: rows.map(r => M(r.cum_project)), borderColor: css('--accent'), backgroundColor: css('--accent'), tension: .2 },
      { type: 'line', label: '누적 자기자본', data: rows.map(r => M(r.cum_equity)), borderColor: css('--info'), backgroundColor: css('--info'), borderDash: [5, 3], tension: .2 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'top', align: 'end' } }, scales: { y: { ticks: { callback: v => (state.cur === 'KRW' ? '' : '$') + num(v) + (state.cur === 'KRW' ? '억' : 'M') } } } } });
}
/* 임대료 범위 + 민감도 (어떤 가정이 NPV 를 좌우하나) */
function bcSensHTML(d) {
  const S = d.sensitivity, b = d.rental.band; if (!S) return '';
  const irrS = v => v == null ? '—' : pctu(v, 1);
  return `<div class="panel bc-sens"><div class="ph"><h3>민감도 — 어떤 가정이 NPV를 좌우하나</h3><span class="muted">한 번에 하나만 바꾸고 나머지는 그대로 · 기준 NPV ${big(S.base_npv)}</span></div>
    <div class="pb">
      ${b ? `<div class="bc-band"><div><span class="lbl">임대료 범위 (시장 하위 25% ~ 상위 25%)</span><b>${money(b.p25)} ~ ${money(b.p75)}</b><span class="muted">중앙값 ${money(b.p50)} · 표본 ${b.n}곳${b.n_external ? ` (외부 ${b.n_external}곳 포함)` : ' (직접 수집)'} · 최저 ${money(b.min)} · 최고 ${money(b.max)}</span></div>
        <div><span class="lbl">그때 프로젝트 NPV</span><b><span class="${b.npv_p25 < 0 ? 'up' : 'down'}">${big(b.npv_p25)}</span> ~ <span class="${b.npv_p75 < 0 ? 'up' : 'down'}">${big(b.npv_p75)}</span></b><span class="muted">IRR ${irrS(b.irr_p25)} ~ ${irrS(b.irr_p75)}</span></div></div>` : '<p class="muted" style="margin:0 0 8px">시장 수집값이 없어 임대료 범위를 낼 수 없습니다 (참고값 또는 직접 입력값 사용 중).</p>'}
      <div class="chartbox" style="height:${S.rows.length * 34 + 50}px"><canvas id="bcTornado" role="img" aria-label="가정별 NPV 민감도"></canvas></div>
      <div class="tw" style="margin-top:8px"><table class="t"><thead><tr><th>가정</th><th>바꾼 값 (불리 / 유리)</th><th class="n">불리할 때 NPV</th><th class="n">유리할 때 NPV</th><th class="n">폭</th></tr></thead><tbody>
        ${S.rows.map(r => `<tr><td class="prov">${esc(r.label)}</td><td class="muted">${esc(r.values)}</td><td class="n ${r.npv_unfavorable < 0 ? 'up' : ''}">${big(r.npv_unfavorable)}</td><td class="n ${r.npv_favorable < 0 ? 'up' : 'down'}">${big(r.npv_favorable)}</td><td class="n"><b>${big(r.spread)}</b></td></tr>`).join('')}
      </tbody></table></div>
      <p class="cmp-note" style="margin:8px 0 0;border:0">· 위에 있을수록 결과를 크게 좌우하는 가정입니다. 중앙값 하나보다 미래 가격 경로·가동률 같은 가정을 먼저 검증하세요.<br>· 임대료 범위는 대시보드와 같은 온디맨드 정상가 기준입니다. ‘외부 표본 포함’은 GPU Finder가 같은 상품에 표시한 온디맨드가를 더하되, 같은 사업자·지역·GPU 수가 직접 수집에 있으면 중복으로 보고 뺍니다.</p>
    </div></div>`;
}
function bcSensChart(d) {
  const S = d.sensitivity; if (!S || !document.getElementById('bcTornado')) return;
  const M = v => state.cur === 'KRW' && state.fx ? v * state.fx / 1e8 : v / 1e6, base = M(S.base_npv);
  mkChart('bcTornado', { type: 'bar', data: { labels: S.rows.map(r => r.label), datasets: [
      { label: '불리할 때', data: S.rows.map(r => [M(r.npv_unfavorable), base]), backgroundColor: css('--bad') + 'AA', borderRadius: 3, grouped: false, barThickness: 18 },
      { label: '유리할 때', data: S.rows.map(r => [base, M(r.npv_favorable)]), backgroundColor: css('--ok') + 'AA', borderRadius: 3, grouped: false, barThickness: 18 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, animation: false,
      plugins: { legend: { position: 'top', align: 'end' }, tooltip: { callbacks: { label: c => { const r = S.rows[c.dataIndex]; return `${c.dataset.label}: NPV ${big(c.datasetIndex ? r.npv_favorable : r.npv_unfavorable)}`; } } } },
      scales: { x: { title: { display: true, text: `프로젝트 NPV (${state.cur === 'KRW' ? '억 원' : '백만 USD'}) · 기준 ${big(S.base_npv)}` }, ticks: { callback: v => (v < 0 ? '−' : '') + (state.cur === 'KRW' ? '' : '$') + num(Math.abs(v)) + (state.cur === 'KRW' ? '억' : 'M') } }, y: { grid: { display: false }, ticks: { color: css('--ink') } } } } });
}
const stmtNum = v => { const x = state.cur === 'KRW' && state.fx ? v * state.fx / 1e8 : v / 1e6; return Math.abs(x) < 0.05 ? '—' : x < 0 ? `(${num(-x, 1)})` : num(x, 1); };

/* 04 가격 대비 성능 */
function bcPerf() {
  const d = state.bc.d, B = state.bc, key = B.basis === 'tco' ? 'perf_tco' : 'perf_rental';
  const M4 = [['usd_per_pflop_hr', '$ / PFLOP·시간', '공칭 BF16 dense 연산 1 PFLOPS를 1시간 쓰는 비용', 3], ['usd_per_mtok', '$ / 백만 토큰', '측정(가정) 추론 처리량 기준 출력 토큰 100만 개', 3],
              ['usd_per_tbs_hr', '$ / (TB/s)·시간', 'HBM 대역폭 1 TB/s를 1시간 쓰는 비용 (메모리 병목 추론)', 3], ['usd_per_eflop', '$ / EFLOP (학습 실효)', 'BF16 × MFU로 실제 수행한 학습 연산 10¹⁸회 비용', 3]];
  $('#bcBody').innerHTML = `
    <div class="filters"><div class="fgroup"><span class="lbl">비용 기준</span><div class="seg" id="bcBasis"><button type="button" data-v="tco" aria-pressed="${B.basis === 'tco'}">소유 (시간당 TCO)</button><button type="button" data-v="rental" aria-pressed="${B.basis === 'rental'}">임대 (현재 임대료)</button></div></div>
      <div class="fgroup"><span class="muted">${B.basis === 'tco' ? `${esc(d.buyer.name)} 가정으로 직접 보유할 때` : '시장에서 빌릴 때 (수집 DB 중앙값, 없으면 참고값)'} · 낮을수록 유리</span></div></div>
    <div class="grid2">${M4.map(([k, l, s], i) => `<div class="panel"><div class="ph"><h3>${l}</h3><span class="muted">${s}</span></div><div class="pb"><div class="chartbox" style="height:${d.bench.length * 26 + 40}px"><canvas id="bcP${i}" role="img" aria-label="${l}"></canvas></div></div></div>`).join('')}</div>
    <div class="panel" style="margin-top:12px"><div class="ph"><h3>가격 대비 성능 표</h3><span class="muted">괄호 = 10개 중 순위</span></div><div class="tw"><table class="t"><thead><tr><th>가속기</th><th class="n">시간당 비용</th>${M4.map(m => `<th class="n">${m[1]}</th>`).join('')}</tr></thead><tbody>
      ${d.bench.map(b => `<tr class="${b.id === d.accelerator.id ? 'sel' : ''}"><td><span class="vd" style="background:var(${BC_VENDOR[b.vendor]})"></span><span class="prov">${esc(b.name)}</span></td><td class="n">${money(B.basis === 'tco' ? b.tco_hourly : b.rental)}</td>${M4.map(([k, , , dg]) => { const v = b[key][k], rk = [...d.bench].sort((x, y) => x[key][k] - y[key][k]).findIndex(x => x.id === b.id) + 1; return `<td class="n">${money(v, 'USD', dg)} <span class="muted">(${rk})</span></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="pb cmp-note">· 같은 시간당 비용이라도 워크로드에 따라 순위가 바뀝니다. 학습은 $/EFLOP, 대형 모델 추론은 $/MTok·$/(TB/s), 연산 집약 작업은 $/PFLOP를 보세요.<br>· 임대 기준에서 TPU·Trainium은 클라우드 공개가(참고값), 수집 대상 모델은 수집 DB 시장 중앙값입니다.</div></div>`;
  $('#bcBasis').onclick = e => { const b = e.target.closest('button'); if (b) { B.basis = b.dataset.v; bcPerf(); } };
  M4.forEach(([k], i) => {
    const sorted = [...d.bench].sort((x, y) => x[key][k] - y[key][k]);
    mkChart('bcP' + i, { type: 'bar', data: { labels: sorted.map(b => b.name.replace(/^(NVIDIA|AMD Instinct|Google|AWS) /, '')), datasets: [{ data: sorted.map(b => +b[key][k].toFixed(4)), backgroundColor: sorted.map(b => css(BC_VENDOR[b.vendor]) + (b.id === d.accelerator.id ? 'FF' : '99')), borderColor: sorted.map(b => b.id === d.accelerator.id ? css('--ink') : 'transparent'), borderWidth: 1.5, borderRadius: 3, barThickness: 16 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { callback: v => '$' + v } }, y: { grid: { display: false }, ticks: { color: css('--ink') } } } } });
  });
}

function wireBiz() {
  $('#bcAcc').onchange = e => { state.bc.acc = e.target.value; state.bc.ov = Object.fromEntries(Object.entries(state.bc.ov).filter(([k]) => !k.startsWith('capex_') && k !== 'network' && k !== 'current_rental')); renderBiz(); };
  $('#bcBuyer').onchange = e => { state.bc.buyer = e.target.value; state.bc.util = ''; renderBiz(); };
  $('#bcUtil').onchange = $('#bcN').onchange = () => bcRun();
  $('#bcSample').onchange = e => { state.bc.sample = e.target.value; bcRun(); };
  $('#bcTabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { state.bc.tab = b.dataset.t; bcTab(); } };
  $('#bcMore').onclick = () => { const p = $('#bcAdv'); p.hidden = !p.hidden; $('#bcMore').setAttribute('aria-expanded', !p.hidden); };
  $('#bcApply').onclick = () => bcRun();
  $('#bcReset').onclick = () => { state.bc.ov = {}; state.bc.util = ''; state.bc.n = ''; renderBiz(); };
  $('#bcAdvBody').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); bcRun(); } };
}
