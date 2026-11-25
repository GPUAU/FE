/* 원가·제안가 화면을 '작업 선택 탭'으로 정리한다.
 *   #cost            청구서로 산정 (AI 원가 에이전트) — 기본
 *   #cost/manual     항목별 직접 계산 (calculator-ui.js)
 *   #cost/datacenter 1GW 데이터센터 모형 (data-center-launcher.js, 내용 변경 없음)
 * data-center-launcher.js 다음에 불러야 한다.
 */
(() => {
  if (typeof RENDER === 'undefined' || !RENDER.cost) return;
  const dataCenter = RENDER.cost;
  const manual = window.renderCostCalculator;
  const TABS = [
    { id: 'agent', title: '청구서로 산정', badge: 'AI', desc: '청구서를 올리면 원가·제안가·시장 비교·근거서까지 단계별로 진행' },
    { id: 'manual', title: '항목별 직접 계산', badge: '', desc: '원가 항목과 금액을 알고 있을 때 직접 입력' },
    { id: 'datacenter', title: '1GW 데이터센터 모형', badge: '보고서', desc: '대규모 데이터센터 투자 기준으로 검토' }
  ];
  const current = () => {
    const m = location.hash.split('/')[1];
    return TABS.some(t => t.id === m) ? m : 'agent';
  };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function tabBar() {
    let bar = document.getElementById('costTabs');
    if (!bar) {
      bar = document.createElement('nav');
      bar.id = 'costTabs';
      bar.className = 'cost-tabs';
      bar.setAttribute('aria-label', '원가 작업 선택');
      const view = document.getElementById('v-cost');
      view.parentNode.insertBefore(bar, view);
      window.addEventListener('hashchange', () => { bar.hidden = !location.hash.startsWith('#cost'); });
    }
    const now = current();
    bar.hidden = false;
    bar.innerHTML = `<div class="cost-tabs-in" role="tablist">${TABS.map(t => `<a role="tab" href="#cost${t.id === 'agent' ? '' : '/' + t.id}" aria-selected="${t.id === now}" ${t.id === now ? 'aria-current="page"' : ''}>
      <span class="ct-title">${esc(t.title)}${t.badge ? `<em>${esc(t.badge)}</em>` : ''}</span><span class="ct-desc">${esc(t.desc)}</span></a>`).join('')}</div>`;
  }

  async function renderAgent() {
    calculatorFrame('원가와 제안가', '청구서 한 장으로 원가부터 시장 비교, 견적 근거서까지 진행합니다.');
    const host = document.getElementById('v-cost');
    const { mountAgentWorkspace } = await import('/static/cost-agent-ui.mjs?v=live1125b');
    if (state.view !== 'cost' || current() !== 'agent') return;
    let models = [];
    try { models = (await api('/api/v1/catalog'))?.result?.models || []; } catch { /* 모델 목록 없이도 시작 가능 */ }
    mountAgentWorkspace({
      host, models,
      onSendToCalculator: session => { window.__costAgentFill = session; location.hash = '#cost/manual'; }
    });
  }

  async function renderManual() {
    await manual();
    if (state.view !== 'cost' || current() !== 'manual' || !window.__costAgentFill) return;
    const session = window.__costAgentFill;
    window.__costAgentFill = null;
    const form = document.getElementById('v02CostForm');
    if (!form) return;
    const { fillCalculator } = await import('/static/cost-agent-ui.mjs?v=live1125b');
    const left = fillCalculator(form, session);
    if (typeof toast === 'function') toast(left ? `에이전트 결과를 채웠습니다. 남은 빈칸 ${left}개(빨간색)를 확인하세요.` : '에이전트 결과를 채웠습니다.', 4500);
  }

  RENDER.cost = async () => {
    tabBar();
    const m = current();
    const view = document.getElementById('v-cost');
    if (m !== 'agent' && view) { view.onclick = null; view.onkeydown = null; }   // 에이전트 화면의 이벤트를 다른 탭에 남기지 않는다
    if (m === 'manual' && manual) return renderManual();
    if (m === 'datacenter') return dataCenter();
    return renderAgent();
  };
})();
