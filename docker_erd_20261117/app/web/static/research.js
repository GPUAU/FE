/* Chart-first research layout; all observations and evidence remain unchanged. */
const researchOriginalFx = mountFx;
mountFx = async function () {
  await researchOriginalFx();
  const panel = document.querySelector('#v02Fx');
  if (panel && !panel.closest('.research-fx')) {
    const details = document.createElement('details');
    details.className = 'research-fx';
    details.innerHTML = '<summary>환율·금리 및 사용자 시나리오 <span>설정 열기 ＋</span></summary>';
    panel.before(details); details.append(panel);
  }
};
function researchRoute() { document.body.classList.toggle('research-trend', location.hash.split('/')[0] === '#trend'); }
window.addEventListener('hashchange', researchRoute);
researchRoute();
function researchTrend(rows) {
  const root = document.querySelector('#v-trend > .mv');
  if (!root || root.dataset.research) return;
  root.dataset.research = 'true';
  const chart = root.querySelector('.sk-comparison-chart');
  const controls = root.querySelector('.mv-controls');
  const table = root.querySelector(':scope > .mv-tablebox');
  const notes = [...root.querySelectorAll(':scope > .mv-note')];
  const methods = document.createElement('details');
  methods.className = 'research-methods';
  methods.innerHTML = '<summary><span>데이터 범위와 비교 기준</span><span>기록·출처 확인 ＋</span></summary>';
  notes.forEach(note => methods.append(note));
  const tabs = document.createElement('div');
  tabs.className = 'research-models'; tabs.setAttribute('aria-label', 'GPU 모델 빠른 선택');
  tabs.innerHTML = MV.data.models.map(model => `<button type="button" aria-pressed="${model === erdModel}" data-research-model="${mh(model)}">${mh(model)}</button>`).join('');
  tabs.querySelectorAll('button').forEach(b => b.onclick = () => { erdModel = b.dataset.researchModel; RENDER.trend(); });
  controls.before(tabs);
  const prices = rows.map(r => Number(r.price)).filter(Number.isFinite);
  const dates = rows.map(r => kstDay(r.chart_at)).sort();
  const stats = document.createElement('section'); stats.className = 'research-stats';
  stats.setAttribute('aria-label', '선택 조건의 관측 요약');
  stats.innerHTML = `<div><span>관측 최저가</span><strong>${prices.length ? mp(Math.min(...prices)) : '—'}</strong><small>USD / GPU·시간</small></div><div><span>관측 최고가</span><strong>${prices.length ? mp(Math.max(...prices)) : '—'}</strong><small>USD / GPU·시간</small></div><div><span>확보한 가격 기록</span><strong>${rows.length.toLocaleString()}<em>건</em></strong><small>${new Set(rows.map(r => r.offer_id)).size}개 오퍼 · ${new Set(rows.map(r => r.provider_name)).size}개 사업자</small></div><div><span>표시 기준일 범위</span><strong class="research-dates">${dates[0] || '—'}<em>— ${dates.at(-1) || '—'}</em></strong><small>선택 조건 · KST</small></div>`;
  controls.after(stats);
  const heading = chart.querySelector('h3');
  heading.innerHTML = `<span class="research-kicker">PRICE HISTORY</span>${mh(erdModel)} 가격 관측 추이`;
  const chartHeader = document.createElement('div'); chartHeader.className = 'research-charthead';
  heading.before(chartHeader); chartHeader.append(heading);
  const unit = document.createElement('span'); unit.textContent = `${MT[erdTerm]} · USD / GPU·시간`; chartHeader.append(unit);
  const chartNote = document.createElement('p'); chartNote.className = 'research-chartnote';
  chartNote.textContent = '각 점은 실제 확보한 가격 기록입니다. 관측이 없는 기간은 연결하지 않습니다. 조건 미확인 항목을 포함한 참고 단가입니다.';
  chart.append(chartNote);
  const legend = document.createElement('div'); legend.className = 'research-legend';
  if (erdHistoryChart) {
    const palette = ['#d62b4c','#5264d9','#099b91','#b37a25','#8f56b3','#3479b5','#e88d66','#6e8399','#9f3e61','#5a985a'];
    erdHistoryChart.data.datasets.forEach((series, i) => {
      series.backgroundColor = palette[i % palette.length];
      series.pointRadius = 3.5; series.pointHoverRadius = 7;
      const button = document.createElement('button'); button.type = 'button';
      const parts = series.label.split(' / ');
      const label = `${parts[0]} · ${parts[2]} · #${parts[4]}`;
      button.title = series.label; button.setAttribute('aria-pressed', 'true');
      button.innerHTML = `<i style="background:${palette[i % palette.length]}"></i>${mh(label)}`;
      button.onclick = () => { const visible = erdHistoryChart.isDatasetVisible(i); erdHistoryChart.setDatasetVisibility(i, !visible); button.setAttribute('aria-pressed', String(!visible)); erdHistoryChart.update(); };
      legend.append(button);
    });
    erdHistoryChart.options.plugins.legend.display = false;
    erdHistoryChart.options.scales.x.grid = { display: false };
    const timestamps = rows.map(r => Date.parse(r.chart_at)).filter(Number.isFinite);
    if (timestamps.length) {
      const first = Math.min(...timestamps), last = Math.max(...timestamps);
      erdHistoryChart.options.scales.x.min = first === last ? first - 86400000 : first;
      erdHistoryChart.options.scales.x.max = first === last ? last + 86400000 : last;
    }
    erdHistoryChart.options.scales.y.grid = { color: '#edf0f4' };
    erdHistoryChart.options.scales.y.ticks = { callback: v => '$' + v, color: '#7b8492' };
    erdHistoryChart.options.scales.x.ticks.color = '#7b8492';
    erdHistoryChart.options.scales.y.title.display = false;
    erdHistoryChart.update();
  }
  chartHeader.after(legend);
  const records = document.createElement('div'); records.className = 'research-recordhead';
  records.innerHTML = `<div><span class="research-kicker">OBSERVATION LOG</span><h2>가격 관측 이력 <small>${rows.length}건</small></h2><p>기준일 내림차순 · 각 가격의 상품 조건과 출처를 확인하세요.</p></div>`;
  const csv = document.querySelector('#erdHistoryCSV'); csv.textContent = '전체 결과 CSV ↓'; records.append(csv);
  table.before(records);
  const trs = [...table.querySelectorAll('tbody > tr')];
  const pager = document.createElement('div'); pager.className = 'research-pager';
  pager.innerHTML = '<span aria-live="polite"></span><div><button type="button" aria-label="이전 관측 페이지">← 이전</button><b></b><button type="button" aria-label="다음 관측 페이지">다음 →</button></div>';
  let page = 0; const pageSize = 10;
  const showPage = () => {
    trs.forEach((r,i) => r.hidden = i < page * pageSize || i >= (page + 1) * pageSize);
    pager.querySelector('span').textContent = rows.length ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, trs.length)} / ${trs.length}건` : '선택 조건의 관측 이력이 없습니다.';
    pager.querySelector('b').textContent = `${page + 1} / ${Math.max(1, Math.ceil(trs.length / pageSize))}`;
    pager.querySelectorAll('button')[0].disabled = page === 0;
    pager.querySelectorAll('button')[1].disabled = (page + 1) * pageSize >= trs.length;
  };
  pager.querySelectorAll('button')[0].onclick = () => { page--; showPage(); };
  pager.querySelectorAll('button')[1].onclick = () => { page++; showPage(); };
  showPage(); table.after(pager); pager.after(methods);
}
