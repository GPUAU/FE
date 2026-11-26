/* 원가·제안가 화면을 '작업 선택 탭'으로 정리한다.
 *   #cost            청구서로 산정 (AI 원가 에이전트) — 기본
 *   #cost/simulation 임차형 GPUaaS 통합 원가 모형
 *   #cost/manual, #cost/datacenter 이전 링크도 통합 모형으로 연결
 * data-center-launcher.js 다음에 불러야 한다.
 */
(() => {
  if (typeof RENDER === 'undefined' || !RENDER.cost) return;
  let revision = 0;
  const TABS = [
    { id: 'agent', title: '청구서 분석', badge: '', desc: '청구서를 올리면 원가·제안가·시장 비교·근거서까지 단계별로 진행' },
    { id: 'simulation', title: '원가·제안가 시뮬레이션', badge: '', desc: '임차형 GPUaaS의 입력 가정, 원가와 산정 근거' }
  ];
  const syncPageStyle = () => {
    document.body.classList.toggle('cost-workbench', /^#cost(?:\/|$)/.test(location.hash));
    document.body.classList.toggle('invoice-analysis', /^#cost(?:\/|$)/.test(location.hash) && !/^#cost\/(simulation|manual|datacenter)$/.test(location.hash));
    document.body.classList.toggle('lease-simulation', /^#cost\/(simulation|manual|datacenter)$/.test(location.hash));
  };
  window.addEventListener('hashchange', syncPageStyle);
  syncPageStyle();
  const current = () => {
    const m = location.hash.split('/')[1];
    return ['manual', 'datacenter', 'simulation'].includes(m) ? 'simulation' : 'agent';
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
    const view = document.getElementById('v-cost');
    view.before(bar);
    const now = current();
    bar.hidden = false;
    bar.innerHTML = `<div class="cost-tabs-in" role="tablist">${TABS.map(t => `<a role="tab" href="#cost${t.id === 'agent' ? '' : '/' + t.id}" aria-selected="${t.id === now}" ${t.id === now ? 'aria-current="page"' : ''}>
      <span class="ct-title">${esc(t.title)}</span></a>`).join('')}</div>`;
  }

  async function renderAgent(ticket) {
    calculatorFrame('원가·제안가', '청구 내역과 운영 조건을 바탕으로 GPU 서비스의 판매가격을 검토합니다.');
    const view = document.getElementById('v-cost');
    view.innerHTML = `<div class="invoice-page cp-page"><header class="cp-hero"><p class="cp-eyebrow">GPU 시세 인덱스</p><h1>청구서 분석 · <em>원가 검토</em></h1><p>청구 내역을 확인하고 GPU 원가와 판매가격의 근거를 정리합니다.</p></header><div id="costAgentHost"><p role="status">청구서 분석을 불러오고 있습니다.</p></div></div>`;
    view.querySelector('.cp-hero').after(document.getElementById('costTabs'));
    const host = view.querySelector('#costAgentHost');
    const { mountAgentWorkspace } = await import('/static/cost-agent-ui.mjs?v=invoice-corporate1126');
    if (ticket !== revision || state.view !== 'cost' || current() !== 'agent') return;
    let models = [];
    try { models = (await api('/api/v1/catalog'))?.result?.models || []; } catch { /* 모델 목록 없이도 시작 가능 */ }
    if (ticket !== revision || state.view !== 'cost' || current() !== 'agent') return;
    mountAgentWorkspace({
      host, models,
      onSendToCalculator: session => { window.__costAgentFill = session; location.hash = '#cost/manual'; }
    });
  }

  async function renderSimulation(ticket) {
    calculatorFrame('원가·제안가 시뮬레이션', '데이터센터 임차부터 GPU 시간당 원가까지, 가정과 근거를 함께 검토합니다.');
    const host = document.getElementById('v-cost');
    host.innerHTML = '<p role="status">원가 시뮬레이션을 불러오고 있습니다.</p>';
    try {
      const { mountLeaseCost } = await import('/static/lease-cost-ui.mjs?v=review-flow1126');
      if (ticket !== revision || state.view !== 'cost' || current() !== 'simulation') return;
      const session = window.__costAgentFill; window.__costAgentFill = null;
      mountLeaseCost({host, session,
        onEdit: () => {
          window.GpuContractQuote?.invalidateCost();
          V02.cost = null;
          if(typeof GpuFlow !== 'undefined') GpuFlow.invalidateSource('cost');
          if(V02.irrContext?.dependsOn?.includes('cost')) {
            V02.irrResult=null; V02.irrContext=null; V02.irrIncomplete=true;
          }
        },
        onResult: r => window.GpuContractQuote?.acceptCost({hourlyCost:r.cost,candidatePrice:r.candidate}),
        openQuote: () => window.GpuContractQuote?.openFromCost()
      });
    } catch(error) {
      if(ticket !== revision || current() !== 'simulation') return;
      host.textContent = '시뮬레이션을 불러오지 못했습니다. ' + error.message;
    }
  }

  RENDER.cost = async () => {
    const ticket = ++revision;
    tabBar();
    const m = current();
    const view = document.getElementById('v-cost');
    if (view) { view.onclick = null; view.oninput = null; view.onkeydown = null; }   // 에이전트 화면의 이벤트를 다른 탭에 남기지 않는다
    if (m === 'simulation') return renderSimulation(ticket);
    return renderAgent(ticket);
  };
})();
