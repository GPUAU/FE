/* Preserve the existing analysis data builders; replace only their chart renderer. */
(function (root) {
  'use strict';
  const ids = new Set(['trendChart','lifeChart','bcCost','bcShip','bcBase','bcRent','bcCash','bcTornado','bcP0','bcP1','bcP2','bcP3']);
  const text = value => Array.isArray(value) ? value.join('\n') : String(value ?? '');
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  function buildSpec(id, config, context = {}) {
    const datasets = config.data?.datasets || [], labels = config.data?.labels || [];
    const horizontal = config.options?.indexAxis === 'y';
    const xTitle = config.options?.scales?.x?.title?.text || '';
    const xKind = id === 'trendChart' || (id === 'lifeChart' && !xTitle.includes('개월')) ? 'time' : id === 'lifeChart' ? 'number' : 'category';
    const currency = context.currency === 'KRW' && context.fx ? 'KRW' : 'USD';
    const valueFormat = /^bcP/.test(id) ? 'USD' : ['bcCash','bcTornado'].includes(id) ? (currency === 'KRW' ? 'KRW_EOK' : 'USD_M') : ['trendChart','bcRent'].includes(id) ? currency : 'number';
    const callbacks = config.options?.plugins?.tooltip?.callbacks || {};
    const tooltips = datasets.map((dataset, datasetIndex) => dataset.data.map((raw, dataIndex) => {
      const y = raw && !Array.isArray(raw) && typeof raw === 'object' ? raw.y : Array.isArray(raw) ? raw[datasetIndex === 0 ? 0 : 1] : raw;
      const x = raw && !Array.isArray(raw) && typeof raw === 'object' ? raw.x : dataIndex;
      const label = labels[dataIndex] ?? x;
      const item = { dataset, datasetIndex, dataIndex, raw, label: String(label), parsed: horizontal ? {x:y,y:dataIndex} : {x,y}, formattedValue:text(y) };
      return {
        title: text(callbacks.title ? callbacks.title([item]) : label),
        label: text(callbacks.label ? callbacks.label(item) : `${dataset.label ? dataset.label+': ' : ''}${Array.isArray(raw) ? raw.join(' → ') : text(y)}`),
        afterLabel: text(callbacks.afterLabel ? callbacks.afterLabel(item) : ''),
      };
    }));
    const xs = xKind === 'category' ? labels.map((_,i)=>i) : [...new Set(datasets.flatMap(d=>d.data.map(p=>p?.x).filter(finite)))].sort((a,b)=>a-b);
    const tick = config.options?.scales?.x?.ticks?.callback;
    const xTicks = xs.map((value,index)=>({value,label:xKind==='category'?String(labels[index]):text(tick?tick(value):value)}));
    return {
      id, title: context.title || id, config: JSON.parse(JSON.stringify(config)), valueFormat, xKind, xTicks,
      xTitle, yTitle: config.options?.scales?.y?.title?.text || '', rightTitle:config.options?.scales?.y1?.title?.text || '',
      tooltips, events:config.options?.plugins?.ev?.events || [], currency,
    };
  }
  root.SKAnalysisBridge = Object.freeze({ buildSpec, supports:id=>ids.has(id) });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SKAnalysisBridge;
  if (typeof document === 'undefined' || typeof mkChart !== 'function') return;
  const previous = mkChart;
  mkChart = function (id, config) {
    if (!ids.has(id)) return previous(id, config);
    if (charts[id]) charts[id].destroy();
    let host = document.getElementById(id);
    if (!host) return;
    const title = host.getAttribute('aria-label') || id;
    if (host.tagName === 'CANVAS') {
      const next = document.createElement('div');
      next.id = id;
      next.setAttribute('aria-label',title);
      host.replaceWith(next);
      host = next;
    }
    const spec = buildSpec(id,config,{title,currency:state.cur,fx:state.fx});
    host.classList.add('sk-analysis-host');
    host.setAttribute('data-sk-analysis-chart','');
    host.setAttribute('data-rows',JSON.stringify(spec));
    charts[id] = { destroy() { host.removeAttribute('data-sk-analysis-chart'); } };
  };
})(typeof window === 'undefined' ? globalThis : window);
