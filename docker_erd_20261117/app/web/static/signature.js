/* SK-inspired editorial shell with a data-first GPU pricing explorer. */
const SG = { model:'B300', term:'ON_DEMAND', provider:'ALL', region:'ALL', query:'', sort:'price', page:0, period:'ALL', chart:null, miniChart:null, data:null, pending:null, seq:0, view:'home', group:'' };
async function signatureSpringHistory(){
  const envelope=await api('/api/v1/catalog');
  if(!envelope.isSuccess)throw new Error(envelope.message||'모델 조회 실패');
  const {mapSeries}=await import('/static/spring-history-adapter.mjs');
  const to=new Date().toISOString();
  const groups=await Promise.all(envelope.result.models.map(async model=>{
    const params=new URLSearchParams({modelId:model.id,from:'2000-01-01T00:00:00Z',to});
    const result=await api('/api/v1/market/price-histories?'+params);
    if(!result.isSuccess)throw new Error(result.message||'가격 이력 조회 실패');
    return mapSeries(result.result.series);
  }));
  return groups.flat();
}
const sgArrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';
const sgSearch = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
const sgCount = n => Number(n).toLocaleString('en-US');
const sgMoney = n => n == null || !Number.isFinite(Number(n)) ? '—' : mp(n);
const sgPrice = n => n == null || !Number.isFinite(Number(n)) ? '—' : fxPrice(n);
const sgDay = t => t ? kstDay(t) : '미확인';
function sgRoute(){document.body.classList.toggle('signature-page',['home','trend',''].includes(location.hash.slice(1).split('/')[0]));}
window.addEventListener('hashchange',sgRoute);sgRoute();
document.querySelector('.gmenu [data-grp="market"]').href='#home';
async function sgData(){
  if(!SG.pending) SG.pending=Promise.all([marketData(),signatureSpringHistory(),api('/api/erd/contracts'),api('/api/erd/comparison').catch(()=>null)]).then(([market,history,contracts,comparison])=>{
    const offers=market.records.map(r=>({id:r.id,observation:r.observation_id,provider:r.provider,model:r.model,product:r.product_original,region:r.region,gpus:r.gpu_count,term:r.term,contract:r.term_original,price:r.normalized_price,collected:r.observed_at,source:r.source_url,payment:'',basis:'명목 시간당 단가'}));
    contracts.forEach(r=>offers.push({id:r.offer_id,observation:r.observation_id,provider:r.provider_name,model:r.model_name,product:r.original_product_name,region:r.region_code,gpus:r.gpu_count,term:r.contract_type==='spot'?'SPOT':r.commitment_months===12?'1_YEAR':r.commitment_months===36?'3_YEAR':'OTHER',contract:r.contract_product_type,price:r.display_price,collected:r.collected_at,source:r.source_url,payment:erdPayment[r.payment_option]||'',basis:r.display_basis}));
    const springIds=new Map(history.map(r=>[String(r.observation_id).split('-')[1],r.observation_id]));
    offers.forEach(offer=>{offer.comparisonObservation=offer.observation;offer.observation=springIds.get(String(offer.observation))||offer.observation;});
    return SG.data={market,history,offers,comparison};
  }).catch(e=>{SG.pending=null;throw e;});
  return SG.pending;
}
function sgCurrentRows(){
  const q=SG.query.trim().toLowerCase();
  const rows=SG.data.offers.filter(r=>r.model===SG.model&&r.term===SG.term&&(SG.provider==='ALL'||r.provider===SG.provider)&&(SG.region==='ALL'||r.region===SG.region)&&(!q||`${r.provider} ${r.product} ${r.region} ${r.contract}`.toLowerCase().includes(q)));
  return rows.sort((a,b)=>SG.sort==='latest'?String(b.collected).localeCompare(String(a.collected)):SG.sort==='provider'?a.provider.localeCompare(b.provider)||(a.price??Infinity)-(b.price??Infinity):(a.price??Infinity)-(b.price??Infinity));
}
function sgHistoryRows(){
  let rows=SG.data.history.filter(r=>r.model_name===SG.model&&r.term===SG.term&&(SG.provider==='ALL'||r.provider_name===SG.provider)&&(SG.region==='ALL'||r.region_code===SG.region));
  if(SG.period!=='ALL'&&rows.length){const end=Math.max(...rows.map(r=>Date.parse(r.chart_at)));rows=rows.filter(r=>Date.parse(r.chart_at)>=end-Number(SG.period)*86400000);}
  return rows;
}
function sgStats(rows){
 const groups=GpuComparison.groups(SG.data.comparison,rows.map(r=>r.comparisonObservation));
 const chosen=groups.find(g=>JSON.stringify(g.conditions)===SG.group)||groups[0];SG.group=chosen?JSON.stringify(chosen.conditions):'';
 const {values,representatives}=GpuComparison.stats(chosen?.rows||[]);
 const ref=GpuComparison.reference(rows);
 const dates=ref.latest===null?'미확인':`${sgDay(ref.earliest)}${sgDay(ref.earliest)!==sgDay(ref.latest)?' ~ '+sgDay(ref.latest):''} (KST)`;
 const ids=new Set(rows.map(r=>String(r.comparisonObservation))),reasons=new Map();
 for(const r of SG.data.comparison?.candidates||[])if(ids.has(String(r.observation_id)))for(const reason of new Set(r.comparison_reasons?.strict||[]))reasons.set(reason,(reasons.get(reason)||0)+1);
 return `<div class="sg-summary-note sg-reference-heading"><b>수집 가격 범위 · 참고용</b><p>선택한 상품 목록의 저장 가격을 요약합니다. 리전·상품 구성·수집 시점이 다를 수 있으며, 최신 시장 대표가격이 아닙니다.</p><p>수집일 ${dates} · 48시간 초과 ${ref.stale}개${ref.unknownTime?' · 수집 시각 확인 필요 '+ref.unknownTime+'개':''}${rows.length!==ref.count?' · 가격 미확보/유효하지 않은 값 '+(rows.length-ref.count)+'개 제외':''}</p>${ref.stale?'<span class="sg-stale-notice">오래된 가격 포함 · 현재 판매가격은 출처에서 다시 확인하세요.</span>':''}</div>
 ${['최저','중앙값','최고'].map((label,i)=>`<div class="sg-metric"><span>수집 가격 ${label} · 참고</span><strong>${ref.values?sgPrice(ref.values[i]):'자료 없음'}</strong><small>USD / GPU·시간 · 선택 목록 기준</small></div>`).join('')}
 <div class="sg-metric"><span>가격 확보 오퍼</span><strong>${sgCount(ref.count)}<em>개</em></strong><small>${ref.providers}개 사업자${ref.providers===1?' · 단일 사업자 자료':''}</small></div>
 <div class="sg-strict-summary"><b>동일 조건 대표가격</b><p>${!SG.data.comparison?'비교 판정 조회 실패 · 참고 가격만 표시하고 있습니다.':!chosen?'비교 조건을 충족한 최신 표본이 없습니다.':`최저 ${sgPrice(values[0])} · 중앙값 ${sgPrice(values[1])} · 최고 ${sgPrice(values[2])} (USD / GPU·시간)`}</p>${chosen?`<label>집계 조건 <select id="sgSummaryGroup">${groups.map((g,i)=>`<option value="${i}" ${g===chosen?'selected':''}>${mh(cpConditions(g.conditions))}</option>`).join('')}</select></label><p>사업자별 최저 1개 · ${representatives.length}개 사업자${representatives.length===1?' · 시장 전체의 분포가 아닙니다.':''}</p>`:''}<p>조건 미확인·48시간 초과 가격은 최신 대표가격에서 제외합니다. <a href="#compare" id="sgCompareLink">조건·제외 사유 확인 ↗</a></p>${reasons.size?`<details><summary>선택 목록의 제외 사유</summary><ul>${[...reasons].map(([reason,n])=>`<li>${mh(reason)}: ${n}개</li>`).join('')}</ul><small>한 오퍼에 여러 제외 사유가 있을 수 있습니다.</small></details>`:''}<details><summary>48시간이 지난 가격은 어떻게 처리하나요?</summary><p>마지막 성공 수집 후 48시간을 초과하면 최신 비교·최저가 집계에서 제외하고, 실제 수집 시각과 함께 과거 참고자료로 보존합니다. 정확히 48시간인 값은 허용합니다. 수집 실패로 기존 수집 시각을 갱신하지 않습니다. 저장 데이터 다시 조회는 외부 가격 재수집이 아닙니다.</p></details></div>`;
}
function sgBindSummary(root){
 root.querySelector('#sgSummaryGroup')?.addEventListener('change',e=>{const groups=GpuComparison.groups(SG.data.comparison,sgCurrentRows().map(r=>r.comparisonObservation));SG.group=JSON.stringify(groups[Number(e.target.value)].conditions);sgRenderOffers(root);});
 root.querySelector('#sgCompareLink')?.addEventListener('click',()=>{CP.model=SG.model;CP.term=SG.term==='ON_DEMAND'?'on_demand':SG.term==='SPOT'?'spot':'commitment';CP.months=SG.term==='1_YEAR'?'12':SG.term==='3_YEAR'?'36':'ALL';CP.provider=SG.provider;CP.country='ALL';CP.region=SG.region;CP.query=SG.query;CP.type='ALL';CP.generation='ALL';CP.confidential=true;CP.mode='strict';CP.group=SG.group;CP.page=0;});
}
function sgInvalidateData(){SG.pending=null;SG.data=null;SG.group='';MV.promise=null;}
async function signatureRender(view='home'){
  const ticket=++SG.seq;SG.view=view;
  mountFx();
  sgRoute();
  const root=document.getElementById('v-'+view);
  try{await sgData();}catch(e){root.innerHTML='<div class="sg-error"><h2>가격 자료를 불러오지 못했습니다.</h2><p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p><button class="sg-button" id="sgRetry">다시 불러오기</button></div>';root.querySelector('#sgRetry').onclick=()=>signatureRender(view);return;}
  if(ticket!==SG.seq||state.view!==view)return;
  if(SG.chart){SG.chart.destroy();SG.chart=null;}
  if(SG.miniChart){SG.miniChart.destroy();SG.miniChart=null;}
  if(typeof erdHistoryChart!=='undefined'&&erdHistoryChart){erdHistoryChart.destroy();erdHistoryChart=null;}
  for(const other of ['home','trend']) if(other!==view) document.getElementById('v-'+other).querySelector(':scope > .sg')?.remove();
  const {market,offers}=SG.data;
  const rows=sgCurrentRows();
  const totalModels=market.models.filter(m=>offers.some(r=>r.model===m)).length;
  const options=market.models.map(m=>`<button type="button" data-sg-model="${mh(m)}" aria-pressed="${m===SG.model}">${mh(m)}${!offers.some(r=>r.model===m)?'<small>미확보</small>':''}</button>`).join('');
  const regions=[...new Set(offers.filter(r=>r.model===SG.model&&r.term===SG.term&&(SG.provider==='ALL'||r.provider===SG.provider)).map(r=>r.region))].filter(Boolean).sort();
  root.innerHTML=`<div class="sg">
    <nav class="sg-topnav" aria-label="시세 분석 메뉴"><div><a href="#home" ${view==='home'?'aria-current="page"':''}>시장 개요</a><a href="#catalog">GPU 카탈로그</a><a href="#dashboard">사업자 비교</a><a href="#discounts">계약 할인</a><a href="#trend" ${view==='trend'?'aria-current="page"':''}>가격 이력</a></div><a href="#qa">데이터 품질 ${sgArrow}</a></nav>
    ${view==='home'?`<section class="sg-hero"><div class="sg-hero-copy"><div class="sg-eyebrow"><i></i> GPU MARKET INTELLIGENCE</div><h1>컴퓨팅의 가치,<br><span>데이터로 선명하게.</span></h1><p>흩어진 GPU 가격을 하나의 기준으로.<br>시장 탐색부터 계약 비교까지, 다음 결정을 위한 인사이트.</p><div class="sg-hero-actions"><button class="sg-button sg-primary" data-sg-scroll="sgExplorer">GPU 가격 탐색 ${sgArrow}</button><a href="#discounts">계약별 할인 비교 <span>↗</span></a></div><div class="sg-hero-foot"><b>${sgCount(market.summary.observations)}</b> 가격 관측 <span></span><b>${totalModels}</b> 가격 확보 모델 <span></span><small>공개 수집 자료 기반</small></div></div><div class="sg-hero-visual"><img src="/static/img/enterprise-datacenter.jpg" alt="서버 랙이 배치된 데이터센터" fetchpriority="high"><div class="sg-photo-shade"></div><div class="sg-photo-label"><span>INFRASTRUCTURE<br>FOR WHAT'S NEXT.</span><i>01 / GPU INDEX</i></div><div class="sg-photo-caption"><span>더 넓은 시야로,<br><b>더 명확한 선택으로.</b></span><i>${sgArrow}</i></div><div class="sg-photo-corner"></div></div></section>`:`<section class="sg-trend-intro"><div><div class="sg-eyebrow"><i></i> MARKET RESEARCH / 02</div><h1>가격의 흐름을 읽다.</h1><p>모델과 계약 조건을 선택하고, 실제 관측 기록과 가격의 근거를 확인하세요.</p></div><div class="sg-trend-stamp">GPU<br><b>INDEX.</b><span>PRICES WITH CONTEXT</span></div></section>`}
    <section class="sg-explorer" id="sgExplorer"><div class="sg-section-heading"><div><span class="sg-eyebrow">01 — EXPLORE THE MARKET</span><h2>어떤 GPU를 찾고 있나요?</h2></div><p>GPU당 시간 단가 · USD 기준</p></div><div class="sg-modeltabs" aria-label="GPU 모델 선택">${options}</div>
    <div class="sg-modelhead"><div><div class="sg-nvidia"><img src="/static/icons/nvidia.svg" alt="">NVIDIA GPU</div><h2>${mh(SG.model)}<span>가격 인덱스</span></h2><p>공개 요금과 상품 구성, 과금 조건을 함께 비교하세요.</p><a class="sg-outline-link sg-model-link" href="#catalog/gpu/${encodeURIComponent(SG.model)}">모델 상세 보기 <span>↗</span></a></div><div class="sg-mini"><div><span>PRICE OBSERVATIONS</span><button data-sg-scroll="sgHistory">상세 차트 보기 ↗</button></div><div class="sg-mini-canvas" id="sgMiniArea"></div></div></div>
    <div class="sg-billing" aria-label="계약 유형 선택">${Object.entries(MT).map(([key,label])=>`<button type="button" data-sg-term="${key}" aria-pressed="${SG.term===key}">${label}<small>${offers.filter(r=>r.model===SG.model&&r.term===key).length}</small></button>`).join('')}<span>상품별 최신 확보 요금</span></div>
    <div class="sg-reload-row"><button type="button" class="mv-btn" id="sgReload">저장 데이터 다시 조회</button><small>저장된 자료를 다시 읽습니다. 외부 가격을 새로 수집하지 않습니다.</small></div><div class="sg-metrics" id="sgMetrics">${sgStats(rows)}</div>
    <div class="sg-workspace"><aside class="sg-rail"><span>IN THIS REPORT</span><button class="active" data-sg-scroll="sgPrices">요금과 상품 <b>01</b></button><button data-sg-scroll="sgHistory">가격 관측 이력 <b>02</b></button><button data-sg-scroll="sgMethod">비교 기준과 출처 <b>03</b></button><div class="sg-rail-note"><i>↗</i><strong>단가 너머의<br>조건까지.</strong><p>리전·GPU 수·약정 조건을<br>함께 확인하세요.</p><a href="#dashboard">사업자 비교로 이동 ${sgArrow}</a></div></aside>
    <div class="sg-report"><section id="sgPrices" class="sg-prices"><div class="sg-block-title"><div><span class="sg-eyebrow">PRICING & CONFIGURATION</span><h3>요금과 상품 구성 <small id="sgResultCount">${rows.length}</small></h3></div><button class="sg-export" id="sgExport">CSV 다운로드 ↓</button></div><div class="sg-filters"><label class="sg-search">${sgSearch}<input id="sgSearch" type="search" value="${mh(SG.query)}" placeholder="사업자, 상품, 리전 검색" aria-label="사업자, 상품, 리전 검색"></label><label class="sg-select"><span class="sg-sr">사업자</span><select id="sgProvider"><option value="ALL">모든 사업자</option>${Object.values(market.providers).map(p=>`<option ${p===SG.provider?'selected':''}>${mh(p)}</option>`).join('')}</select></label><label class="sg-select"><span class="sg-sr">리전</span><select id="sgRegion"><option value="ALL">모든 리전</option>${regions.map(r=>`<option ${r===SG.region?'selected':''}>${mh(r)}</option>`).join('')}</select></label><label class="sg-select"><span class="sg-sr">정렬</span><select id="sgSort"><option value="price" ${SG.sort==='price'?'selected':''}>낮은 가격순</option><option value="latest" ${SG.sort==='latest'?'selected':''}>최근 수집순</option><option value="provider" ${SG.sort==='provider'?'selected':''}>사업자순</option></select></label></div><div id="sgOfferList"></div><div class="sg-price-note"><span>ⓘ</span><p>CPU·RAM이 포함된 VM의 GPU당 환산 단가입니다. 옵션·네트워크 등 미확인 조건이 있어 참고 비교로 제공하며, 실제 견적·재고를 보장하지 않습니다.</p></div></section>
    <section class="sg-history" id="sgHistory"><div class="sg-block-title"><div><span class="sg-eyebrow">OBSERVED PRICE HISTORY</span><h3>가격의 흐름, 기록의 근거</h3></div><label class="sg-select"><span class="sg-sr">관측 기간</span><select id="sgPeriod"><option value="ALL" ${SG.period==='ALL'?'selected':''}>전체 기록</option><option value="365" ${SG.period==='365'?'selected':''}>최근 1년 기록</option><option value="90" ${SG.period==='90'?'selected':''}>최근 90일 기록</option></select></label></div><div class="sg-chart-frame"><div class="sg-chart-meta"><span><i class="sg-status-dot"></i>${mh(SG.model)} · ${MT[SG.term]}</span><span>USD / GPU·시간</span></div><div class="sg-chart" id="sgChartArea"><canvas id="sgChart" role="img" aria-label="${mh(SG.model)} 실제 가격 관측 산점도 (수집 시각 기준)"></canvas></div><div class="sg-chart-footer" id="sgChartFoot"></div></div><p class="sg-chart-disclaimer">각 점은 저장된 실효 단가이며 수집 시각 기준입니다. 환산 불가 관측은 제외합니다. 빈 기간은 연결하지 않으며, 기간 선택은 마지막 기록일을 기준으로 합니다. 검색어는 요금표에만 적용됩니다.</p><details class="sg-history-detail"><summary>개별 관측 기록과 출처 확인 <span>＋</span></summary><div id="sgHistoryLog"></div><button type="button" class="sg-export" id="sgHistoryExport">선택 관측 전체 CSV ↓</button></details></section>
    <section class="sg-method" id="sgMethod"><div class="sg-block-title"><div><span class="sg-eyebrow">TRANSPARENT BY DESIGN</span><h3>좋은 비교는, 명확한 기준에서.</h3></div></div><details open><summary><b>01</b> 무엇을 비교하나요?<span>＋</span></summary><p>동일 모델의 사업자·리전·계약별 공개 요금을 GPU 1개·1시간 기준으로 표시합니다. 상품 구성과 수집 시점이 서로 다를 수 있습니다. 수집 가격 범위는 선택 목록의 참고용 요약으로 오래된 가격도 포함하며 수집일을 함께 표시합니다. 별도의 동일 조건 대표가격은 서버가 승인한 집단에서 사업자별 최저 1개만 집계하고, 조건 미확인·48시간 초과 자료는 제외합니다.</p></details><details><summary><b>02</b> 약정 요금은 어떻게 보나요?<span>＋</span></summary><p>예약 요금의 선납금과 반복 요금은 저장된 환산 규칙에 따라 합산합니다. 연 8,760시간·100% 사용 가정이 적용될 수 있습니다. Savings Plan의 할인 적용 단가는 미사용 약정까지 포함한 실제 실효 비용이 아닙니다. 각 상품의 상세 근거에서 원본 금액과 계산 조건을 확인하세요.</p></details><details><summary><b>03</b> 가격의 출처는 어디인가요?<span>＋</span></summary><p>AWS 공식 가격 카탈로그·스팟 기록, Azure Retail Prices API 및 업로드한 SQL 백업의 관측 자료를 사용합니다. 과거 가격 적용일과 실제 수집일은 구분하며, 빈 기간의 가격을 만들어 넣지 않습니다. Nebius·Verda는 현재 가격 자료가 없습니다.</p><a href="#qa">수집 상태와 데이터 품질 확인 ↗</a></details></section></div></div>
    <section class="sg-next"><div><span>NEXT STEP</span><h2>가격을 확인했다면,<br>다음은 비즈니스의 기준.</h2></div><a href="#discounts"><b>계약기간별 할인 비교</b><span>같은 상품의 약정 조건과 가격 차이 ${sgArrow}</span></a><a href="#cost"><b>원가·제안가 검토</b><span>입력 가정을 바탕으로 수익성 점검 ${sgArrow}</span></a></section>
    <footer class="sg-footer"><div><b>GPU MARKET INTELLIGENCE</b><span>더 나은 결정을 위한, 더 명확한 데이터.</span></div><p>SKALA 프로젝트 · 저장된 공개 가격 자료<br>수집 기준 ${sgDay(market.snapshot_at)} · 실시간 견적 아님</p></footer></section></div>`;
  root.querySelector('#sgReload').onclick=()=>{sgInvalidateData();signatureRender(view);};
  root.querySelectorAll('[data-sg-model]').forEach(b=>b.onclick=()=>{SG.model=b.dataset.sgModel;SG.provider='ALL';SG.region='ALL';SG.query='';SG.page=0;signatureRender(view);});
  root.querySelectorAll('[data-sg-term]').forEach(b=>b.onclick=()=>{SG.term=b.dataset.sgTerm;SG.region='ALL';SG.page=0;signatureRender(view);});
  root.querySelectorAll('[data-sg-scroll]').forEach(b=>b.onclick=()=>{root.querySelector('#'+b.dataset.sgScroll)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});root.querySelectorAll('.sg-rail button').forEach(x=>x.classList.toggle('active',x.dataset.sgScroll===b.dataset.sgScroll));});
  root.querySelector('#sgSearch').oninput=e=>{SG.query=e.target.value;SG.page=0;sgRenderOffers(root);};
  root.querySelector('#sgProvider').onchange=e=>{SG.provider=e.target.value;SG.region='ALL';SG.page=0;signatureRender(view);};
  root.querySelector('#sgRegion').onchange=e=>{SG.region=e.target.value;SG.page=0;signatureRender(view);};
  root.querySelector('#sgSort').onchange=e=>{SG.sort=e.target.value;SG.page=0;sgRenderOffers(root);};
  root.querySelector('#sgPeriod').onchange=e=>{SG.period=e.target.value;sgDrawHistory(root);};
  root.querySelector('#sgExport').onclick=()=>downloadCSV(`GPU_${SG.model}_${SG.term}.csv`,['사업자','모델','상품','리전','GPU수','요금제','지불방식','USD_GPU시간','가격기준','수집UTC','관측ID','출처'],sgCurrentRows().map(r=>[r.provider,r.model,r.product,r.region,r.gpus,r.contract,r.payment,r.price,r.basis,r.collected,r.observation,r.source]));
  root.querySelector('#sgHistoryExport').onclick=()=>downloadCSV(`GPU_${SG.model}_observations.csv`,['관측ID','사업자','모델','상품','리전','계약','표시기준UTC','수집UTC','USD_GPU시간','출처'],sgHistoryRows().map(r=>[r.observation_id,r.provider_name,r.model_name,r.original_product_name,r.region_code,r.contract_product_type,r.chart_at,r.collected_at,r.price,r.original_url]));
  sgRenderOffers(root);sgDrawHistory(root);refreshKrw();
}
function sgRenderOffers(root){
  const rows=sgCurrentRows(),size=6;
  SG.page=Math.min(SG.page,Math.max(0,Math.ceil(rows.length/size)-1));
  root.querySelector('#sgResultCount').textContent=rows.length;
  root.querySelector('#sgMetrics').innerHTML=sgStats(rows);sgBindSummary(root);
  root.querySelector('#sgOfferList').innerHTML=rows.length?`<div class="sg-table-head"><span>사업자 / 상품</span><span>상품 구성</span><span>GPU당 시간 단가</span><span>근거</span></div>${rows.slice(SG.page*size,(SG.page+1)*size).map((r,i)=>`<article class="sg-offer"><div class="sg-offer-brand"><div class="sg-provider-logo ${r.provider.toLowerCase()}">${r.provider==='AWS'?'aws':r.provider==='Azure'?'A':mh(r.provider.slice(0,1))}</div><div><h4>${mh(r.provider)}</h4><p>${mh(r.product)}</p><span>수집 ${sgDay(r.collected)} · ${!Number.isFinite(Date.parse(r.collected))?'시각 미확인':Date.now()-Date.parse(r.collected)>48*3600000?'48시간 초과 · 과거 참고':'조건 확인 필요'}</span></div></div><div class="sg-configuration"><b>${mh(r.region||'리전 미확인')}</b><span>${r.gpus??'미확인'} GPU / VM</span><small>${mh(r.contract)}${r.payment?' · '+mh(r.payment):''}</small></div><div class="sg-offer-price"><strong>${sgPrice(r.price)}</strong><span>/ GPU·시간</span><small>${mh(r.basis)}</small></div><button class="sg-evidence" data-observation="${r.observation}" aria-label="${mh(r.provider+' '+r.region+' '+r.contract)} 상세 근거">${sgArrow}</button></article>`).join('')}<div class="sg-pagination"><span>${SG.page*size+1}–${Math.min((SG.page+1)*size,rows.length)} / ${rows.length}개 오퍼</span><div><button id="sgPrev" ${SG.page===0?'disabled':''} aria-label="이전 상품 페이지">←</button><b>${SG.page+1} <span>/ ${Math.ceil(rows.length/size)}</span></b><button id="sgNext" ${(SG.page+1)*size>=rows.length?'disabled':''} aria-label="다음 상품 페이지">→</button></div></div>`:`<div class="sg-empty"><span>—</span><h4>선택 조건의 가격 자료가 없습니다.</h4><p>가격 미확보는 0원이나 미판매를 뜻하지 않습니다.<br>다른 모델·계약 조건을 선택하거나 필터를 초기화해 주세요.</p><button id="sgReset" class="sg-button">필터 초기화</button></div>`;
  const prev=root.querySelector('#sgPrev'),next=root.querySelector('#sgNext'),reset=root.querySelector('#sgReset');
  if(prev)prev.onclick=()=>{SG.page--;sgRenderOffers(root);};if(next)next.onclick=()=>{SG.page++;sgRenderOffers(root);};
  refreshKrw();
  if(reset)reset.onclick=()=>{SG.provider='ALL';SG.region='ALL';SG.query='';SG.term='ON_DEMAND';signatureRender(SG.view);};
}
function sgDrawHistory(root){
  const rows=sgHistoryRows().filter(r=>r.price!=null&&Number.isFinite(Number(r.price))).sort((a,b)=>a.chart_at.localeCompare(b.chart_at));
  if(SG.chart){SG.chart.destroy();SG.chart=null;}
  if(SG.miniChart){SG.miniChart.destroy();SG.miniChart=null;}
  const area=root.querySelector('#sgChartArea');
  area.innerHTML=rows.length?`<canvas id="sgChart" role="img" aria-label="${mh(SG.model)} 실제 가격 관측 산점도 (수집 시각 기준)"></canvas>`:'<div class="sg-chart-empty">이 조건의 가격 관측 이력을 아직 확보하지 못했습니다.</div>';
  if(rows.length){
    const providers=[...new Set(rows.map(r=>r.provider_name))];
    const times=rows.map(r=>Date.parse(r.chart_at)),first=Math.min(...times),last=Math.max(...times);
    SG.chart=new Chart(root.querySelector('#sgChart'),{type:'scatter',data:{datasets:providers.map((p,i)=>({label:p,data:rows.filter(r=>r.provider_name===p).map(r=>({x:Date.parse(r.chart_at),y:Number(r.price),product:r.original_product_name,region:r.region_code})),backgroundColor:i===0?'#e52c3f':'#416cae',pointRadius:3.5,pointHoverRadius:6,pointBorderWidth:1.5,pointBorderColor:'#fff'}))},options:{responsive:true,maintainAspectRatio:false,animation:{duration:250},scales:{x:{type:'linear',min:first===last?first-86400000:first,max:first===last?last+86400000:last,grid:{display:false},border:{display:false},ticks:{maxTicksLimit:5,color:'#90949d',font:{size:10},callback:v=>sgDay(v)}},y:{grid:{color:'#eff0f2',drawTicks:false},border:{display:false},ticks:{color:'#90949d',padding:12,font:{size:10},callback:v=>'$'+v}}},plugins:{legend:{display:providers.length>1,position:'bottom',labels:{boxWidth:7,boxHeight:7,usePointStyle:true,font:{size:11},padding:20}},tooltip:{backgroundColor:'#242830',padding:12,displayColors:false,callbacks:{title:items=>sgDay(items[0].parsed.x),label:ctx=>[`${ctx.dataset.label} · ${ctx.raw.region}`,ctx.raw.product,sgMoney(ctx.parsed.y)+' / GPU·시간']}}}}});
    root.querySelector('#sgMiniArea').innerHTML='<canvas id="sgMiniChart" role="img" aria-label="선택 조건의 실제 가격 관측 미리보기"></canvas>';
    SG.miniChart=new Chart(root.querySelector('#sgMiniChart'),{type:'scatter',data:{datasets:[{data:rows.map(r=>({x:Date.parse(r.chart_at),y:Number(r.price)})),backgroundColor:'#e8495966',pointRadius:2,pointHoverRadius:4}]},options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{x:{type:'linear',min:first===last?first-86400000:first,max:first===last?last+86400000:last,grid:{display:false},border:{display:false},ticks:{maxTicksLimit:3,color:'#b0b3bd',font:{size:8},callback:v=>sgDay(v).slice(2)}},y:{grid:{color:'#f0f0f3',drawTicks:false},border:{display:false},ticks:{maxTicksLimit:3,color:'#b0b3bd',font:{size:8},callback:v=>'$'+v}}},plugins:{legend:{display:false},tooltip:{enabled:false}}}});
  }else{
    root.querySelector('#sgMiniArea').innerHTML='<span class="sg-mini-empty">가격 관측 미확보</span>';
  }
  root.querySelector('#sgChartFoot').innerHTML=`<span><b>${sgCount(rows.length)}</b>개 가격 기록 <i>·</i> ${new Set(rows.map(r=>r.offer_id)).size}개 오퍼</span><span>${rows.length?sgDay(rows[0].chart_at)+' — '+sgDay(rows.at(-1).chart_at):'확보한 기간 없음'} <small>KST</small></span>`;
  root.querySelector('#sgHistoryLog').innerHTML=rows.length?`<p>최근 기준일 12건 표시 · 전체 ${sgCount(rows.length)}건은 CSV로 확인할 수 있습니다.</p><div class="sg-log-scroll"><table><thead><tr><th>표시 기준일</th><th>사업자 · 리전</th><th>단가</th><th>출처</th></tr></thead><tbody>${rows.slice(-12).reverse().map(r=>`<tr><td>${sgDay(r.chart_at)}</td><td>${mh(r.provider_name+' · '+r.region_code)}</td><td>${sgPrice(r.price)}</td><td><button data-observation="${r.observation_id}">상세 근거 ↗</button></td></tr>`).join('')}</tbody></table></div>`:'<p>선택 조건의 관측 기록이 없습니다.</p>';
}
RENDER.home=()=>signatureRender('home');
RENDER.trend=()=>signatureRender('trend');
PAGES.home.grp='market';
