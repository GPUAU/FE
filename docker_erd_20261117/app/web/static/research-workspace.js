/* Shared research UI. Uses stored prices and existing evidence endpoints only. */
(() => {
 'use strict';
 const RW={promise:null,data:null,seq:0,charts:new Map(),catalog:{tab:'models',q:'',status:'all',term:'on_demand',provider:'ALL',sort:'name',page:0},pair:{model:'B300',term:'on_demand',group:'general',providers:['AWS','Azure'],regions:['ALL','ALL'],picks:['','']},history:{model:'B300',term:'ON_DEMAND',provider:'ALL',region:'ALL',offer:'ALL',period:'ALL',q:'',page:0}};
 const route=()=>location.hash.slice(1).split('/')[0];
 const valid=x=>x!=null&&String(x).trim()!==''&&Number.isFinite(Number(x));
 const count=(rows,key)=>new Set(rows.map(r=>r[key]).filter(x=>x!=null)).size;
 const options=(rows,key)=>[['ALL','전체'],...[...new Set(rows.map(r=>r[key]).filter(Boolean))].sort().map(x=>[String(x),String(x)])];
 const models=()=>[...new Set(['B300','GB300','VR200',...RW.meta.models])].filter(m=>RW.meta.models.includes(m));
 const heading=(title,accent,description)=>`<header class="cp-hero"><p class="cp-eyebrow">GPU 시세 인덱스</p><h1>${title} <em>${accent}</em></h1><p>${description}</p></header>`;
 const metric=(label,value,note)=>`<div><span>${label}</span><strong>${value}</strong><p>${note}</p></div>`;
 const overview=rows=>`<section class="cp-overview" aria-label="전체 수집 현황">${metric('조사 대상 GPU',RW.meta.models.length+'<small>개 모델</small>',count(rows,'model_name')+'개 모델 가격 확보')}${metric('가격 확보 사업자',count(rows,'provider_id')+'<small>개 사업자</small>',[...new Set(rows.map(r=>r.provider_name))].map(mh).join(' · ')||'자료 없음')}${metric('수집된 가격 오퍼',count(rows,'offer_id').toLocaleString()+'<small>개</small>','온디맨드 · 스팟 · 장기약정')}<div class="cp-freshness"><span>최근 가격 수집 · KST</span><strong>${rows.length?sgDay(Math.max(...rows.map(r=>Date.parse(r.collected_at)).filter(Number.isFinite))):'미확보'}</strong></div></section>`;
 const tabs=(selected,attr,rows,term)=>`<div class="cp-explorer-head"><h2>GPU 모델</h2><span class="rw-muted">선택한 계약 유형의 수집 오퍼</span></div><div class="cp-model-tabs" role="group" aria-label="GPU 모델 선택">${models().map(m=>`<button type="button" ${attr}="${mh(m)}" aria-pressed="${m===selected}"><img src="/static/icons/nvidia.svg" alt=""><b>${mh(m)}</b><span>${count(rows.filter(r=>r.model_name===m&&r.contract_type===term),'offer_id')} 오퍼</span></button>`).join('')}</div>`;
 const notice=text=>`<div class="cp-context"><p><b>참고 자료</b>${text}</p></div>`;
 const empty=text=>`<div class="rw-empty"><strong>${text}</strong><p>미확보는 0원이나 미판매를 뜻하지 않습니다. 다른 조건을 선택해 주세요.</p></div>`;
 const search=(id,value,placeholder='모델, 상품, 리전 검색')=>`<label class="cp-search"><span>검색</span><div>${sgSearch}<input id="${id}" type="search" placeholder="${placeholder}" value="${mh(value)}"></div></label>`;
 const pager=(prefix,page,pages)=>`<div class="cp-pager"><button class="mv-btn" id="${prefix}Prev" ${page===0?'disabled':''}>이전</button><span>${page+1} / ${pages}</span><button class="mv-btn" id="${prefix}Next" ${page+1>=pages?'disabled':''}>다음</button></div>`;
 const termOptions=Object.entries(cpTerm);
 const compareLink=model=>`#compare/${encodeURIComponent(model)}?${new URLSearchParams({provider:RW.catalog.provider,term:RW.catalog.term})}`;
 function destroyCharts(prefix=''){for(const [id,chart] of RW.charts)if(id.startsWith(prefix)){chart.destroy();RW.charts.delete(id);}}
 function researchRoute(){
  const active=['catalog','dashboard','trend','discounts'].includes(route());
  document.body.classList.toggle('research-catalog',active);
  if(active)document.body.classList.remove('signature-page');
  destroyCharts();
 }
 window.addEventListener('hashchange',researchRoute);researchRoute();
 async function data(){
  if(!RW.promise)RW.promise=springLegacyData().then(({market,comparison})=>(RW.meta=market,RW.data=comparison,comparison)).catch(e=>{RW.promise=null;throw e;});
  return RW.promise;
 }
 function focusState(root){const e=document.activeElement;return root.contains(e)?{id:e.id,start:e.selectionStart}:{};}
 function restoreFocus(saved){if(!saved.id)return;const e=document.getElementById(saved.id);if(e){e.focus({preventScroll:true});if(saved.start!=null&&e.setSelectionRange)e.setSelectionRange(saved.start,saved.start);}}
 function frame(root,title,accent,desc){root.innerHTML=`<div class="mv cp-page rw-page">${heading(title,accent,desc)}<div class="rw-loading" role="status">저장된 자료를 불러오고 있습니다.</div></div>`;}
 function error(root,e,retry){root.innerHTML=`<div class="mv cp-page rw-page">${heading('자료','조회 실패','연결 상태를 확인한 뒤 다시 시도해 주세요.')}<div class="rw-empty"><p>${mh(e.message)}</p><button class="mv-btn" id="rwRetry">다시 조회</button></div></div>`;root.querySelector('#rwRetry').onclick=retry;}
 function chartCard(id,title,desc){return `<section class="rw-chart-card" aria-labelledby="${id}Title"><div class="cp-results-head"><div><h2 id="${id}Title">${title}</h2><p>${desc}</p></div><span class="rw-muted">USD / GPU·시간</span></div><div class="rw-chart" id="${id}Area"><canvas id="${id}" role="img" aria-label="${title}. 정확한 가격과 상품 조건은 아래 목록에서 확인하세요."></canvas></div></section>`;}
 function bars(id,rows,{label=r=>r.provider_name+' · '+r.region_code,price=r=>r.display_price,description=r=>r.original_product_name,maxRows=10}={}){
  destroyCharts(id);
  const shown=rows.filter(r=>valid(price(r))).slice(0,maxRows),canvas=document.getElementById(id);
  if(!canvas)return;
  if(!shown.length){canvas.parentElement.innerHTML=empty('그래프로 표시할 가격이 없습니다.');return;}
  canvas.parentElement.style.height=Math.max(145,shown.length*38+45)+'px';
  const providers=[...new Set(shown.map(r=>r.provider_name))];
  RW.charts.set(id,new Chart(canvas,{type:'bar',data:{labels:shown.map(label),datasets:[{data:shown.map(r=>Number(price(r))),backgroundColor:shown.map(r=>providers.indexOf(r.provider_name)===0?'#e5233c':'#546b8d'),borderRadius:4,maxBarThickness:18}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:250},scales:{x:{beginAtZero:true,grid:{color:'#eef0f4'},border:{display:false},ticks:{color:'#7b8493',callback:v=>'$'+v}},y:{grid:{display:false},border:{display:false},ticks:{color:'#566172',font:{size:12},autoSkip:false}}},plugins:{legend:{display:false},tooltip:{backgroundColor:'#252c38',padding:12,callbacks:{label:c=>mp(c.parsed.x)+' / GPU·시간',afterLabel:c=>description(shown[c.dataIndex])}}}}}));
 }
 window.renderComparisonPriceChart=(root,rows,selection,{collapsed=false}={})=>{
  const wasOpen=root.querySelector('.rw-comparison-graph')?.open;
  root.querySelector('.rw-comparison-graph')?.remove();
  const mount=document.createElement(collapsed?'details':'div');mount.className='rw-comparison-graph';if(collapsed)mount.open=Boolean(wasOpen);
  const page=rows.slice(selection.page*20,(selection.page+1)*20);
  mount.innerHTML=(collapsed?'<summary>상품별 가격 그래프 보기</summary>':'')+chartCard('rwCompareChart','상품별 가격 그래프',`현재 표의 순서대로 최대 10개 오퍼 표시 · ${selection.mode==='reference'?'구성·계약이 다른 참고 단가':'선택한 동일 조건 집단'} · 막대에 마우스를 올리면 가격 확인`);
  root.querySelector('.cp-results').before(mount);
  if(collapsed)mount.addEventListener('toggle',()=>{if(mount.open)RW.charts.get('rwCompareChart')?.resize();});
  bars('rwCompareChart',page,{label:r=>r.provider_name+' · '+(r.region_code||'리전 미확인'),description:r=>[r.original_product_name,cpTerm[r.contract_type]+' · '+(r.commitment_months?r.commitment_months+'개월':'기간 약정 없음'),'수집 '+sgDay(r.collected_at)]});
 };
 function offerTable(rows){return `<div class="mv-tablebox" tabindex="0" role="region" aria-label="상품 가격 목록: 가로로 스크롤"><table class="mv-table rw-offers"><thead><tr>${['GPU / 상품','사업자','국가 / 리전','계약 조건','시간당 가격','가격 근거'].map(t=>`<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td><div class="cp-product"><img src="/static/icons/nvidia.svg" alt="NVIDIA"><div><a class="rw-model-link" href="#catalog/gpu/${encodeURIComponent(r.model_name)}?${new URLSearchParams({provider:r.provider_name,term:r.contract_type})}"><b>${mh(r.model_name)}</b></a><span>${mh(r.original_product_name)}</span></div></div><div class="cp-spec">${cpVal(r.gpu_count)} GPU · ${cpVal(r.system_type)}</div></td><td><b>${mh(r.provider_name)}</b></td><td><b>${cpVal(r.country_code)}</b><span>${cpVal(r.region_code)}</span></td><td><b>${cpTerm[r.contract_type]||cpVal(r.contract_type)}</b><span>${mh(r.contract_product_type)}</span><span>${r.commitment_months?r.commitment_months+'개월':'기간 약정 없음'} · ${cpVal(r.payment_option)}</span></td><td class="cp-price"><strong>${fxPrice(r.display_price)}</strong><span>USD / GPU·시간</span></td><td class="cp-evidence"><span class="cp-status ${''}">${'수집 자료'}</span><span>${mtime(r.collected_at)}</span><button class="mv-btn" data-observation="${mh(r.observation_id)}">상세·근거</button></td></tr>`).join('')||`<tr><td colspan="6">${empty('선택 조건의 가격 자료가 없습니다.')}</td></tr>`}</tbody></table></div>`;}
 function exportOffers(rows,name){downloadCSV(name,['모델','사업자','상품','리전','계약','약정개월','GPU수','USD_GPU시간','수집UTC','관측ID','출처'],rows.map(r=>[r.model_name,r.provider_name,r.original_product_name,r.region_code,r.contract_product_type,r.commitment_months,r.gpu_count,r.display_price,r.collected_at,r.observation_id,r.source_url]));}
 function catalogTrendCard(model){return `<section class="rw-catalog-trend rw-median-card" aria-label="${mh(model)} 사업자별 가격 추이"><div class="rw-mini-heading"><h2>가격 추이</h2><span>최근 3개월</span></div><p class="rw-median-subtitle">사업자 중앙값 기준 · USD / GPU·시간</p><div class="rw-median-controls" id="rwCommitmentControls"><span>약정 기준</span><select id="rwTrendMonths" aria-label="그래프 약정기간"><option value="12">1년 약정</option><option value="36" selected>3년 약정</option><option value="60">5년 약정</option></select><select id="rwTrendPayment" aria-label="그래프 선납 조건"><option value="NO_UPFRONT">선납 없음</option><option value="PARTIAL_UPFRONT">부분 선납</option><option value="ALL_UPFRONT">전액 선납</option></select></div><div class="rw-mini-plot" id="rwCatalogTrendArea"><canvas id="rwCatalogTrend" role="img" aria-label="${mh(model)} 온디맨드·약정·스팟 주별 중앙값 추이"></canvas><p id="rwCatalogTrendLoading" role="status">가격 이력 불러오는 중…</p></div><div id="rwTrendMetrics" class="rw-median-metrics" aria-live="polite"></div><p id="rwCatalogTrendStatus" class="rw-mini-status" role="status"></p><details class="rw-median-method"><summary>사업자별 내역 · 집계 기준</summary><div id="rwProviderBreakdown"></div><p>상품별 주간 마지막 관측값 → 사업자별 중앙값 → 사업자 중앙값들의 중앙값으로 계산합니다. 각 사업자에 같은 비중을 적용합니다. 월요일 시작(KST) 기준이며, 선은 실제 관측된 주간 중앙값 사이를 연결한 시각적 안내입니다. 관측이 없는 주의 가격을 채우지 않으며, 주마다 집계 사업자·상품이 달라질 수 있습니다. 아래 내역은 대표 가격과 같은 주의 표본입니다. 리전·상품 구성 차이를 포함한 참고 시세이며, 동일 상품의 가격 변동률이나 요금제 간 할인율은 아닙니다. 목록의 사업자·국가·리전 필터가 적용됩니다. 계약 유형·검색·상세 비교 조건은 그래프와 별도입니다.</p></details></section>`;}
 async function renderCatalogTrend(model,term,provider,scope={}){
  const canvas=$('#rwCatalogTrend'),area=$('#rwCatalogTrendArea'),status=$('#rwCatalogTrendStatus');
  const current=()=>canvas&&canvas.isConnected&&$('#rwCatalogTrend')===canvas;
  try{
   const [snapshot,{weeklyPriceHistory},{createWeeklyHover}]=await Promise.all([sgData(),import('/static/price-history-median.mjs?v=hover1125'),import('/static/price-history-hover.mjs?v=hover1125b')]);if(!current())return;
   const countries=new Map((RW.data?.candidates||[]).map(r=>[r.provider_name+'|'+r.region_code,r.country_code]));
   const months=$('#rwTrendMonths'),payment=$('#rwTrendPayment');
   RW.trendChoices ||= new Map();
   if(!RW.trendChoices.has(model))RW.trendChoices.set(model,{months:'36',payment:'NO_UPFRONT'});
   const choice=RW.trendChoices.get(model);
   months.value=choice.months;payment.value=choice.payment;
   const draw=()=>{
    if(!current())return;
    const result=weeklyPriceHistory(snapshot.history,{model,provider,countries,country:scope.country||'ALL',region:scope.region||'ALL',months:months.value,payment:payment.value,windowMonths:3});
    choice.months=months.value;choice.payment=payment.value;
    const labels=['온디맨드',`${Number(months.value)/12}년 약정`,'스팟'];
    const colors=['#3867ff','#f47725','#19a35b'];
    $('#rwCatalogTrendLoading')?.remove();
    destroyCharts('rwCatalogTrend');
    const hasData=result.series.some(s=>s.latest);
    area.querySelector('.rw-mini-empty')?.remove();canvas.hidden=!hasData;
    if(hasData)RW.charts.set('rwCatalogTrend',new Chart(canvas,{type:'line',plugins:[createWeeklyHover({series:result.series,labels,colors,money:mp,day:sgDay})],data:{datasets:result.series.map((s,i)=>({label:labels[i],data:s.points.filter(p=>p.y!=null),borderColor:colors[i],backgroundColor:colors[i],borderDash:i?[5,4]:[],borderWidth:2,pointRadius:2,pointHoverRadius:5,pointHitRadius:10,tension:0,spanGaps:false}))},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:false},scales:{x:{type:'linear',min:result.series[0].points[0].x,max:result.end,grid:{color:'#eef0f4'},border:{display:false,dash:[2,4]},ticks:{maxTicksLimit:5,font:{size:10},color:'#8992a2',callback:v=>sgDay(v).slice(5)}},y:{beginAtZero:true,border:{display:false,dash:[2,4]},grid:{color:'#eef0f4'},ticks:{maxTicksLimit:5,font:{size:10},color:'#8992a2',callback:v=>'$'+v}}},plugins:{legend:{display:false},tooltip:{enabled:false}}}}));
    else area.insertAdjacentHTML('beforeend','<div class="rw-mini-empty"><strong>선택 조건의 가격 이력 미확보</strong><span>데이터가 확보되면 추이를 표시합니다.</span></div>');
    $('#rwTrendMetrics').innerHTML=result.series.map((s,i)=>`<div style="--trend-color:${colors[i]}"><span><i aria-hidden="true"></i>${labels[i]}</span><strong>${s.latest?mp(s.latest.y):'—'}</strong><small>${s.latest?sgDay(s.latest.x).slice(5)+' 시작 주 · '+s.latest.providers+'개 사업자':'이력 미확보'}</small></div>`).join('');
    const allProviders=snapshot.catalog.providers.map(p=>p.name);
    const visibleProviders=provider==='ALL'?allProviders:allProviders.filter(name=>name===provider);
    $('#rwProviderBreakdown').innerHTML=`<table class="rw-breakdown-table"><caption>유형별 최근 관측 주의 사업자 중앙값 · USD / GPU·시간</caption><thead><tr><th>사업자</th>${labels.map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${visibleProviders.map(name=>`<tr><td>${mh(name)}</td>${result.series.map(series=>{const p=result.providerSeries.find(s=>s.type===series.type&&s.provider===name)?.points.find(p=>p.x===series.latest?.x&&p.y!=null);return `<td>${p?mp(p.y):'미확보'}</td>`;}).join('')}</tr>`).join('')}</tbody></table><p>미확보는 해당 집계 주·선택 조건의 관측값이 없다는 뜻이며, 미판매를 의미하지 않습니다.</p>`;
    const failure=(snapshot.historyFailures||[]).some(r=>r.model===model);
    status.textContent=`전체 등록 ${allProviders.length}개 사업자 · 요금제별 집계 수는 가격 아래 표시${failure?' · 일부 이력 조회 실패':''}`;
    canvas.setAttribute('aria-label',model+' 최근 3개월 사업자 중앙값 추이. '+result.series.map((s,i)=>labels[i]+': '+(s.latest?mp(s.latest.y)+' USD, '+s.latest.providers+'개 사업자, '+sgDay(s.latest.x)+' 시작 주':'이력 미확보')).join('. '));

   };
   months.onchange=draw;payment.onchange=draw;draw();
  }catch(e){if(current()){area.innerHTML='<div class="rw-mini-empty"><strong>가격 이력을 불러오지 못했습니다.</strong><a href="#trend">가격 이력에서 다시 조회 →</a></div>';status.textContent='상품 목록은 계속 확인할 수 있습니다.';}}
 }
 async function modelDetail(root,model,C){
  const routeHash=location.hash;
  RW.priceScopes ||= new Map();
  if(!RW.priceScopes.has(model))RW.priceScopes.set(model,{...defaultComparisonSelection,model,mode:'reference',provider:C.provider,term:C.term,country:C.country,region:C.region,query:'',page:0,group:''});
  const selection=RW.priceScopes.get(model);
  const query=routeHash.split('?')[1]||'';
  if(query&&selection.linkQuery!==query){
   const params=new URLSearchParams(query);
   const provider=params.get('provider'),term=params.get('term');
   if(provider==='ALL'||Object.values(RW.meta.providers).includes(provider))selection.provider=provider;
   if(Object.hasOwn(cpTerm,term))selection.term=term;
   Object.assign(selection,{country:'ALL',region:'ALL',page:0,linkQuery:query});
  }
  destroyCharts();
  root.innerHTML=`<div class="mv cp-page rw-page gx-model-detail"><a class="rw-back" href="#catalog">모델·사업자 목록</a><div class="rw-catalog-top"><header class="cp-hero"><p class="cp-eyebrow">GPU 모델 · 상품과 공개 요금</p><h1>${mh(model)} <em>상품·가격 비교</em></h1><p>국가와 사업자, 계약 유형을 선택해 상품 구성과 가격을 확인하세요.</p><div class="gx-model-meta"><span>NVIDIA GPU</span><span>USD / GPU·시간</span></div></header><div id="gxTrendHost"></div></div><div id="gxPriceHost" role="region" aria-label="${mh(model)} 상품 조건과 가격"><p role="status">상품 가격을 불러오는 중입니다.</p></div></div>`;
  const priceHost=root.querySelector('#gxPriceHost'),trendHost=root.querySelector('#gxTrendHost');
  let historyKey='';
  await renderGpuComparison({host:priceHost,selection,isActive:()=>state.view==='catalog'&&location.hash===routeHash&&priceHost.isConnected,
   onChange:(current,rows)=>{
    Object.assign(C,{term:current.term,provider:current.provider,country:current.country,region:current.region});
    const key=[current.provider,current.country,current.region].join('|');
    if(key===historyKey)return;historyKey=key;
    destroyCharts('rwCatalogTrend');
    trendHost.innerHTML=catalogTrendCard(model);
    renderCatalogTrend(model,current.term,current.provider,{country:current.country,region:current.region});
   }
  });
 }
 async function catalog(){
  const ticket=++RW.seq,root=$('#v-catalog');frame(root,'GPU','카탈로그','GPU 모델별 사양과 수집 가격을 제공합니다.');
  let d;try{d=await data();}catch(e){if(ticket===RW.seq)error(root,e,catalog);return;}if(ticket!==RW.seq||route()!=='catalog')return;
  marketPriceFrame('GPU 카탈로그','모델별 상품과 가격 근거');
  const parts=location.hash.slice(1).split('?')[0].split('/');let id='';try{id=decodeURIComponent(parts.slice(2).join('/'));}catch{}
  const detailModel=parts[1]==='gpu'&&RW.meta.models.includes(id)?id:null;
  const detailProvider=parts[1]==='provider'?Object.entries(RW.meta.providers).find(([k])=>k===id)?.[1]:null;
  const scope=parts.slice(1).join('/')||'index';
  RW.catalogScopes ||= new Map([['index',{...RW.catalog,country:'ALL',region:'ALL'}]]);
  const indexScope=RW.catalogScopes.get('index');
  if(!RW.catalogScopes.has(scope))RW.catalogScopes.set(scope,{...indexScope,q:'',provider:detailProvider?'ALL':indexScope.provider,country:'ALL',region:'ALL',page:0});
  const C=RW.catalog=RW.catalogScopes.get(scope);
  C.country ||= 'ALL'; C.region ||= 'ALL';
  if(detailModel){await modelDetail(root,detailModel,C);return;}
  function draw(){
   const focus=focusState(root),q=C.q.trim().toLowerCase(),detail=detailModel||detailProvider;
   const pool=d.candidates.filter(r=>r.contract_type===C.term&&(!detailModel||r.model_name===detailModel)&&(!detailProvider||r.provider_name===detailProvider)&&(C.provider==='ALL'||r.provider_name===C.provider)&&(C.country==='ALL'||r.country_code===C.country)&&(C.region==='ALL'||r.region_code===C.region));
   let rows=pool.filter(r=>!q||`${r.model_name} ${r.provider_name} ${r.original_product_name} ${r.region_code}`.toLowerCase().includes(q));
   rows.sort((a,b)=>C.sort==='price'?cpPriceOrder(a.display_price,b.display_price,false):a.model_name.localeCompare(b.model_name)||a.provider_name.localeCompare(b.provider_name));
   let modelRows=models().map(model=>{const r=pool.filter(x=>x.model_name===model),prices=r.map(x=>x.display_price).filter(valid).map(Number);return {model,rows:r,prices,lowest:prices.length?Math.min(...prices):null};}).filter(m=>(!q||('NVIDIA 엔비디아 '+m.model+' '+m.rows.map(r=>r.generation).join(' ')).toLowerCase().includes(q))&&(C.status==='all'||(C.status==='priced')===Boolean(m.prices.length)));
   if(C.sort==='price')modelRows.sort((a,b)=>cpPriceOrder(a.lowest,b.lowest,false));
   const providerRows=Object.entries(RW.meta.providers).map(([id,name])=>({id,name,rows:pool.filter(r=>r.provider_name===name)})).filter(p=>!q||(p.name+' '+p.rows.map(r=>r.model_name).join(' ')).toLowerCase().includes(q));
   if(C.sort==='price')providerRows.sort((a,b)=>{const low=p=>{const v=p.rows.map(r=>r.display_price).filter(valid).map(Number);return v.length?Math.min(...v):null;};return cpPriceOrder(low(a),low(b),false);});
   const pages=Math.max(1,Math.ceil(rows.length/20));C.page=Math.min(C.page,pages-1);
   destroyCharts('rwCatalogTrend');
   const title=heading(detail?mh(detail):'GPU',detail?'상품 카탈로그':'카탈로그',detail?'상품별 GPU 구성, 리전, 계약 조건과 수집 가격을 제공합니다.':'GPU 모델별 사양과 공개 요금, 이용 조건을 제공합니다.');
   root.innerHTML=`<div class="mv cp-page rw-page">${detailModel?`<div class="rw-catalog-top">${title}${catalogTrendCard(detailModel,C.term)}</div>`:title}${overview(d.candidates)}
    ${detail?'<a class="rw-back" href="#catalog">전체 GPU 카탈로그</a>':`<div class="cp-explorer-head"><h2>모델과 사업자</h2><div class="cp-modes" role="group" aria-label="카탈로그 종류"><button class="mv-btn ${C.tab==='models'?'primary':''}" data-rw-cat="models" aria-pressed="${C.tab==='models'}">GPU 모델</button><button class="mv-btn ${C.tab==='providers'?'primary':''}" data-rw-cat="providers" aria-pressed="${C.tab==='providers'}">사업자</button></div></div>`}
    <div class="cp-filterbar rw-catalog-filters">${search('rwCatSearch',C.q,detail?'상품, GPU, 리전 검색':'GPU 모델 또는 사업자 검색')}${cpSelect('rwCatTerm','계약 유형',termOptions,C.term)}${cpSelect('rwCatProvider','사업자',options(d.candidates,'provider_name'),C.provider)}${detailProvider?cpSelect('rwCatCountry','국가',options(d.candidates.filter(r=>r.provider_name===detailProvider),'country_code'),C.country)+cpSelect('rwCatRegion','리전',options(d.candidates.filter(r=>r.provider_name===detailProvider&&(C.country==='ALL'||r.country_code===C.country)),'region_code'),C.region):''}${cpSelect('rwCatSort','정렬',[['name','기본 순서'],['price','낮은 수집 단가순']],C.sort)}</div>
    ${!detail&&C.tab==='models'?`<div class="rw-filter-actions"><div class="cp-modes" role="group" aria-label="가격 확보 상태">${[['all','전체 모델'],['priced','가격 확보'],['unpriced','가격 미확보']].map(([k,v])=>`<button class="mv-btn ${C.status===k?'primary':''}" data-rw-status="${k}" aria-pressed="${C.status===k}">${v}</button>`).join('')}</div></div>`:''}
    ${notice('선택한 계약 유형의 수집 단가 범위입니다. 상품 구성·지역·약정 조건이 다르므로 동일 조건 시장 대표가격을 뜻하지 않습니다.')}
    ${detail?`<div class="cp-results-head"><h2>수집 상품 <small>${rows.length}</small></h2><button class="mv-btn" id="rwCatCSV">CSV 다운로드</button></div>${offerTable(rows.slice(C.page*20,(C.page+1)*20))}${pager('rwCat',C.page,pages)}`:C.tab==='models'?`<div class="mv-tablebox" tabindex="0" role="region" aria-label="GPU 모델 카탈로그 표"><table class="mv-table rw-model-table"><thead><tr>${['GPU 모델','세대 / 상품 메모리','수집 단가 범위 · 참고','가격 확보 사업자','수집 오퍼','상세 보기'].map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${modelRows.map(m=>{const gens=[...new Set(m.rows.map(r=>r.generation).filter(Boolean))],vram=[...new Set(m.rows.map(r=>r.vram_gb_per_gpu).filter(valid).map(Number))].sort((a,b)=>a-b);return `<tr><td><a class="cp-product rw-model-link" href="#catalog/gpu/${encodeURIComponent(m.model)}"><img src="/static/icons/nvidia.svg" alt="NVIDIA"><div><b>${mh(m.model)}</b><span>NVIDIA GPU</span></div></a></td><td><b>${mh(gens.join(' · ')||'사양 미확보')}</b>${vram.length?'<span>'+vram.map(x=>x.toLocaleString()).join(' / ')+' GB/GPU · 수집 상품 기준</span>':''}</td><td class="cp-price"><strong>${m.prices.length?mp(Math.min(...m.prices)):'가격 미확보'}</strong>${m.prices.length?`<span>${Math.max(...m.prices)!==Math.min(...m.prices)?'~ '+mp(Math.max(...m.prices))+' · ':''}USD / GPU·시간</span>`:''}</td><td><b>${[...new Set(m.rows.map(r=>r.provider_name))].map(mh).join(' · ')||'미확보'}</b></td><td><b>${count(m.rows,'offer_id')}개</b></td><td><a class="mv-btn" href="#catalog/gpu/${encodeURIComponent(m.model)}">상품·가격 보기</a></td></tr>`;}).join('')||`<tr><td colspan="6">${empty('검색 조건에 맞는 모델이 없습니다.')}</td></tr>`}</tbody></table></div>`:`<div class="mv-tablebox" tabindex="0" role="region" aria-label="사업자 카탈로그 표"><table class="mv-table rw-provider-table"><thead><tr><th>사업자</th><th>가격 확보 GPU</th><th>수집 오퍼</th><th>수집 국가</th><th>상품 보기</th></tr></thead><tbody>${providerRows.map(p=>`<tr><td><b class="rw-provider-name">${mh(p.name)}</b><span>종합 클라우드</span></td><td><b>${[...new Set(p.rows.map(r=>r.model_name))].map(mh).join(' · ')||'미확보'}</b></td><td><b>${count(p.rows,'offer_id')}개</b></td><td>${count(p.rows,'country_code')}개 국가</td><td><a class="mv-btn" href="#catalog/provider/${encodeURIComponent(p.id)}">상품 보기</a></td></tr>`).join('')||`<tr><td colspan="5">${empty('일치하는 사업자가 없습니다.')}</td></tr>`}</tbody></table></div>`}
    ${springMarketFooter()}</div>`;
   $('#rwCatSearch').oninput=e=>{C.q=e.target.value;C.page=0;draw();};
   for(const [id,key] of [['rwCatTerm','term'],['rwCatProvider','provider'],['rwCatSort','sort']])$('#'+id).onchange=e=>{C[key]=e.target.value;C.page=0;draw();};
   for(const [id,key] of [['rwCatCountry','country'],['rwCatRegion','region']]){const input=root.querySelector('#'+id);if(input)input.onchange=e=>{C[key]=e.target.value;if(key==='country')C.region='ALL';C.page=0;draw();};}
   root.querySelectorAll('[data-rw-cat]').forEach(b=>b.onclick=()=>{C.tab=b.dataset.rwCat;C.q='';draw();});
   root.querySelectorAll('[data-rw-status]').forEach(b=>b.onclick=()=>{C.status=b.dataset.rwStatus;draw();});
   if(detail){$('#rwCatPrev').onclick=()=>{C.page--;draw();};$('#rwCatNext').onclick=()=>{C.page++;draw();};$('#rwCatCSV').onclick=()=>exportOffers(rows,'GPU_catalog.csv');}
   if(detailModel){root.querySelectorAll('[data-rw-trend-term]').forEach(button=>button.onclick=()=>{C.term=button.dataset.rwTrendTerm;C.page=0;draw();root.querySelector(`[data-rw-trend-term="${C.term}"]`).focus({preventScroll:true});});renderCatalogTrend(detailModel,C.term,C.provider);}
   refreshKrw();restoreFocus(focus);
   window.GpuExplorerContext={model:detailModel,provider:detailProvider||C.provider,term:C.term};
   window.dispatchEvent(new Event('gpu-explorer-context'));
  }draw();
 }
 async function dashboard(){
  const ticket=++RW.seq,root=$('#v-dashboard');frame(root,'클라우드','사업자 비교','사업자별 상품 구성과 이용 요금을 비교합니다.');
  let d;try{d=await data();}catch(e){if(ticket===RW.seq)error(root,e,dashboard);return;}if(ticket!==RW.seq||route()!=='dashboard')return;
  marketPriceFrame('사업자 비교','선택 상품의 가격과 구성');const P=RW.pair;
  const group=location.hash.split('/')[1];if(group&&group!==P.group){P.group=group==='specialist'?'specialist':'general';P.regions=['ALL','ALL'];P.picks=['',''];}
  function draw(){
   const focus=focusState(root),providers=P.group==='specialist'?['Nebius','Verda']:[...new Set(d.candidates.map(r=>r.provider_name))];
   if(P.group==='specialist')P.providers=['Nebius','Verda'];else P.providers=P.providers.map((p,i)=>providers.includes(p)?p:providers[i]||providers[0]);
   const pools=P.providers.map(p=>d.candidates.filter(r=>r.model_name===P.model&&r.contract_type===P.term&&r.provider_name===p));
   const choices=pools.map((rows,i)=>{if(P.regions[i]!=='ALL'&&!rows.some(r=>r.region_code===P.regions[i]))P.regions[i]='ALL';return rows.filter(r=>P.regions[i]==='ALL'||r.region_code===P.regions[i]).sort((a,b)=>cpPriceOrder(a.display_price,b.display_price,false));});
   const picked=choices.map((rows,i)=>rows.find(r=>String(r.observation_id)===P.picks[i])||rows[0]);P.picks=picked.map(r=>r?String(r.observation_id):'');
   const fields=[['상품명',r=>r.original_product_name],['리전 / 국가',r=>`${r.region_code} / ${r.country_code}`],['GPU 수 / 시스템',r=>`${cpVal(r.gpu_count)} GPU / ${cpVal(r.system_type)}`],['GPU당 VRAM',r=>r.vram_gb_per_gpu==null?'미확인':Number(r.vram_gb_per_gpu).toLocaleString()+' GB'],['vCPU / RAM',r=>`${cpVal(r.vcpu_count)} / ${r.ram_gb==null?'미확인':Number(r.ram_gb).toLocaleString()+' GB'}`],['내부 연결',r=>r.intra_node_interconnect||'미확인'],['계약 상품',r=>r.contract_product_type],['약정 / 선납',r=>`${r.commitment_months?r.commitment_months+'개월':'기간 약정 없음'} / ${cpVal(r.payment_option)}`],['수집 시각',r=>mtime(r.collected_at)]];
   root.innerHTML=`<div class="mv cp-page rw-page">${heading('클라우드','사업자 비교','사업자별 상품 구성과 시간당 이용 요금을 비교합니다.')}${overview(d.candidates)}${tabs(P.model,'data-rw-pair-model',d.candidates,P.term)}
    <div class="rw-filter-actions"><div class="cp-modes" role="group" aria-label="비교 시장"><a class="mv-btn ${P.group==='general'?'primary':''}" href="#dashboard/general">GPU 인스턴스 클라우드</a><a class="mv-btn ${P.group==='specialist'?'primary':''}" href="#dashboard/specialist">GPU 전문 클라우드</a></div>${cpSelect('rwPairTerm','계약 유형',termOptions,P.term)}</div>
    <div class="rw-pair-grid">${[0,1].map(i=>`<section class="rw-pair-card"><div class="cp-results-head"><h2>${mh(P.providers[i]||'사업자')}</h2><span class="rw-muted">${pools[i].length}개 오퍼</span></div><div class="rw-pair-selects">${cpSelect('rwPairProvider'+i,'사업자',providers.map(p=>[p,p]),P.providers[i])}${cpSelect('rwPairRegion'+i,'리전',options(pools[i],'region_code'),P.regions[i])}</div>${cpSelect('rwPairOffer'+i,'비교 상품',choices[i].length?choices[i].map(r=>[String(r.observation_id),`${r.original_product_name} · ${r.region_code} · ${r.commitment_months?r.commitment_months+'개월 · ':''}${r.payment_option||r.contract_product_type} · ${mp(r.display_price)}`]):[['','확보된 상품 없음']],P.picks[i])}<div class="rw-pair-price">${picked[i]?`<strong>${fxPrice(picked[i].display_price)}</strong><span>USD / GPU·시간</span><p>${mh(picked[i].original_product_name)} · ${cpVal(picked[i].gpu_count)} GPU</p><span class="cp-status is-stale">${'수집 자료 · 조건 확인 필요'}</span>`:empty('선택 조건의 가격 미확보')}</div>${picked[i]?`<button class="mv-btn" data-observation="${picked[i].observation_id}">상세·근거</button>`:''}</section>`).join('')}</div>
    ${notice('GPU 수·리전·CPU·RAM·연결망과 계약 조건이 다를 수 있습니다. 두 상품의 단가 차이를 동일 조건 할인율로 해석하지 마세요.')}
    ${chartCard('rwPairChart','선택 상품의 가격 비교','두 상품의 저장된 실효 단가 · 각 막대에서 상품과 지역 확인')}
    <div class="cp-results-head"><h2>상품 구성 나란히 보기</h2><button class="mv-btn" id="rwPairCSV">선택 자료 CSV</button></div><div class="mv-tablebox" tabindex="0" role="region" aria-label="두 상품의 구성 비교"><table class="mv-table rw-spec-table"><thead><tr><th>비교 항목</th><th>${mh(P.providers[0])}</th><th>${mh(P.providers[1])}</th></tr></thead><tbody>${fields.map(([label,get])=>`<tr><th scope="row">${label}</th>${picked.map(r=>`<td>${r?mh(get(r)):'자료 미확보'}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="rw-next"><a class="mv-btn" href="${compareLink(P.model)}">동일 조건으로 가격 비교</a><a class="mv-btn" href="#discounts">계약기간별 할인</a></div>${springMarketFooter()}</div>`;
   root.querySelectorAll('[data-rw-pair-model]').forEach(b=>b.onclick=()=>{P.model=b.dataset.rwPairModel;P.picks=['',''];draw();root.querySelector(`[data-rw-pair-model="${P.model}"]`).focus({preventScroll:true});});
   $('#rwPairTerm').onchange=e=>{P.term=e.target.value;P.picks=['',''];draw();};
   [0,1].forEach(i=>{for(const [id,key] of [['rwPairProvider','providers'],['rwPairRegion','regions'],['rwPairOffer','picks']])$('#'+id+i).onchange=e=>{P[key][i]=e.target.value;if(key!=='picks')P.picks[i]='';draw();};});
   $('#rwPairCSV').onclick=()=>exportOffers(picked.filter(Boolean),'GPU_provider_comparison.csv');
   bars('rwPairChart',picked.filter(Boolean),{description:r=>r.original_product_name+' · '+r.region_code});refreshKrw();restoreFocus(focus);
  }draw();
 }
 async function history(){
  const ticket=++RW.seq,root=$('#v-trend');frame(root,'GPU','가격 이력','수집 시점별 가격 변동과 원본 출처를 제공합니다.');
  let d;try{let snapshot;[d,snapshot]=await Promise.all([data(),sgData()]);SG.data=snapshot;SG.historyFailures=snapshot.historyFailures||[];}catch(e){if(ticket===RW.seq)error(root,e,history);return;}if(ticket!==RW.seq||route()!=='trend')return;
  marketPriceFrame('가격 이력','수집 시각 기준 가격 관측');const H=RW.history;
  function draw(){
   const focus=focusState(root),source=SG.data.history.filter(r=>r.model_name===H.model&&r.term===H.term);
   if(H.provider!=='ALL'&&!source.some(r=>r.provider_name===H.provider))H.provider='ALL';
   if(H.region!=='ALL'&&!source.some(r=>(H.provider==='ALL'||r.provider_name===H.provider)&&r.region_code===H.region))H.region='ALL';
   const pool=source.filter(r=>(H.provider==='ALL'||r.provider_name===H.provider)&&(H.region==='ALL'||r.region_code===H.region));
   const ids=[...new Set(pool.map(r=>String(r.offer_id)))];if(H.offer!=='ALL'&&!ids.includes(H.offer))H.offer='ALL';
   let rows=pool.filter(r=>H.offer==='ALL'||String(r.offer_id)===H.offer);
   if(H.period!=='ALL'&&rows.length){const latest=Math.max(...rows.map(r=>Date.parse(r.chart_at)).filter(Number.isFinite));rows=rows.filter(r=>Date.parse(r.chart_at)>=latest-Number(H.period)*86400000);}
   const q=H.q.trim().toLowerCase();rows=rows.filter(r=>!q||`${r.provider_name} ${r.original_product_name} ${r.region_code} ${r.contract_product_type}`.toLowerCase().includes(q)).sort((a,b)=>Date.parse(b.chart_at)-Date.parse(a.chart_at));
   const plotted=rows.filter(r=>valid(r.price)&&Number.isFinite(Date.parse(r.chart_at))),pages=Math.max(1,Math.ceil(rows.length/20));H.page=Math.min(H.page,pages-1);
   root.innerHTML=`<div class="mv cp-page rw-page">${heading('GPU','가격 이력','수집 시점별 가격 변동과 원본 출처를 제공합니다.')}${overview(d.candidates)}${tabs(H.model,'data-rw-history-model',d.candidates.filter(r=>!['1_YEAR','3_YEAR'].includes(H.term)||r.commitment_months===(H.term==='1_YEAR'?12:36)),H.term==='ON_DEMAND'?'on_demand':H.term==='SPOT'?'spot':'commitment')}
    <div class="cp-filterbar rw-history-filters">${cpSelect('rwHistoryTerm','계약 유형',Object.entries(MT),H.term)}${cpSelect('rwHistoryProvider','사업자',options(source,'provider_name'),H.provider)}${cpSelect('rwHistoryRegion','리전',options(source.filter(r=>H.provider==='ALL'||r.provider_name===H.provider),'region_code'),H.region)}${cpSelect('rwHistoryPeriod','관측 기간',[['ALL','조회한 전체 기록'],['365','마지막 기록 기준 1년'],['90','마지막 기록 기준 90일']],H.period)}</div>
    <div class="rw-history-detail-filters">${cpSelect('rwHistoryOffer','개별 오퍼',[['ALL','선택 조건의 모든 오퍼'],...ids.map(id=>{const r=pool.find(r=>String(r.offer_id)===id);return [id,`${r.provider_name} · ${r.original_product_name||'상품명 미확인'} · ${r.region_code} · #${id}`];})],H.offer)}${search('rwHistorySearch',H.q,'상품, 리전 검색 · 그래프와 표에 함께 적용')}</div>
    ${notice('각 점은 실제 수집 시각의 가격입니다. 기록이 없는 기간은 연결하지 않으며, 여러 상품을 함께 표시한 경우 하나의 상품 추세로 해석하지 마세요.')}
    ${(SG.historyFailures||[]).length?`<div class="rw-warning" role="status">일부 모델 이력 조회 실패: ${SG.historyFailures.map(r=>mh(r.model+' ('+r.reason+')')).join(' · ')}</div>`:''}
    ${chartCard('rwHistoryChart','가격 변동 이력',`${plotted.length.toLocaleString()}개 유효 관측 · ${count(rows,'offer_id')}개 오퍼 · ${rows.length?sgDay(rows.at(-1).chart_at)+' ~ '+sgDay(rows[0].chart_at):'기간 미확보'} · KST`)}
    <div class="rw-chart-note">최근 730일 범위에서 조회한 자료입니다. ${rows.length-plotted.length}개 환산 불가·시각 미확인 기록은 그래프에서 제외됩니다.<button class="rw-text-button" id="rwHistoryReload">저장 데이터 다시 조회</button></div>
    <div class="cp-results-head"><div><h2>가격 관측 기록 <small>${rows.length.toLocaleString()}</small></h2><p>최근 수집 시각순 · 표시 단위 USD / GPU·시간</p></div><button class="mv-btn" id="rwHistoryCSV">전체 선택 기록 CSV</button></div>
    <div class="mv-tablebox" tabindex="0" role="region" aria-label="가격 관측 기록 표"><table class="mv-table rw-history-table"><thead><tr><th>수집 시각 · KST</th><th>사업자 / 상품</th><th>리전 / 계약</th><th>관측 단가</th><th>가격 근거</th></tr></thead><tbody>${rows.slice(H.page*20,(H.page+1)*20).map(r=>`<tr><td><b>${sgDay(r.chart_at)}</b><span>${mtime(r.chart_at)}</span></td><td><b>${mh(r.provider_name)}</b><span>${mh(r.original_product_name||'상품명 미확인')}</span><span>오퍼 ${mh(r.offer_id)}</span></td><td><b>${mh(r.region_code||'미확인')}</b><span>${mh(r.contract_product_type||MT[r.term]||'계약 미확인')}</span></td><td class="cp-price"><strong>${fxPrice(r.price)}</strong><span>USD / GPU·시간</span></td><td><button class="mv-btn" data-observation="${mh(r.observation_id)}">상세·근거</button></td></tr>`).join('')||`<tr><td colspan="5">${empty('선택한 조건의 관측 기록이 없습니다.')}</td></tr>`}</tbody></table></div>${pager('rwHistory',H.page,pages)}${springMarketFooter()}</div>`;
   root.querySelectorAll('[data-rw-history-model]').forEach(b=>b.onclick=()=>{Object.assign(H,{model:b.dataset.rwHistoryModel,provider:'ALL',region:'ALL',offer:'ALL',page:0});draw();root.querySelector(`[data-rw-history-model="${H.model}"]`).focus({preventScroll:true});});
   for(const [id,key] of [['rwHistoryTerm','term'],['rwHistoryProvider','provider'],['rwHistoryRegion','region'],['rwHistoryOffer','offer'],['rwHistoryPeriod','period']])$('#'+id).onchange=e=>{H[key]=e.target.value;H.page=0;if(key==='term')H.provider='ALL';if(['term','provider'].includes(key)){H.region='ALL';H.offer='ALL';}draw();};
   $('#rwHistorySearch').oninput=e=>{H.q=e.target.value;H.page=0;draw();};$('#rwHistoryPrev').onclick=()=>{H.page--;draw();};$('#rwHistoryNext').onclick=()=>{H.page++;draw();};
   $('#rwHistoryReload').onclick=()=>{RW.promise=null;SG.pending=null;SG.data=null;history();};
   $('#rwHistoryCSV').onclick=()=>downloadCSV('GPU_price_history.csv',['관측ID','사업자','모델','상품','리전','계약','표시기준UTC','수집UTC','USD_GPU시간','출처'],rows.map(r=>[r.observation_id,r.provider_name,r.model_name,r.original_product_name,r.region_code,r.contract_product_type,r.chart_at,r.collected_at,r.price,r.original_url]));
   destroyCharts('rwHistoryChart');
   if(!plotted.length)$('#rwHistoryChartArea').innerHTML=empty('그래프로 표시할 관측 기록이 없습니다.');
   else{const providers=[...new Set(plotted.map(r=>r.provider_name))],times=plotted.map(r=>Date.parse(r.chart_at)),first=Math.min(...times),last=Math.max(...times);
    RW.charts.set('rwHistoryChart',new Chart($('#rwHistoryChart'),{type:'scatter',data:{datasets:providers.map((p,i)=>({label:p,data:plotted.filter(r=>r.provider_name===p).map(r=>({x:Date.parse(r.chart_at),y:Number(r.price),product:r.original_product_name,region:r.region_code,observation:r.observation_id})),backgroundColor:i===0?'#e5233cbb':'#546b8dbb',pointRadius:3.5,pointHoverRadius:6,pointBorderColor:'#fff',pointBorderWidth:1}))},options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{x:{type:'linear',min:first===last?first-86400000:first,max:first===last?last+86400000:last,grid:{display:false},border:{display:false},ticks:{maxTicksLimit:6,color:'#798393',callback:v=>sgDay(v)}},y:{beginAtZero:true,grid:{color:'#eef0f4'},border:{display:false},ticks:{color:'#798393',callback:v=>'$'+v}}},plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:8,padding:20}},tooltip:{backgroundColor:'#252c38',padding:12,callbacks:{title:items=>mtime(items[0].parsed.x),label:c=>[c.dataset.label+' · '+c.raw.region,c.raw.product||'상품명 미확인',mp(c.parsed.y)+' / GPU·시간']}}}}}));
   }refreshKrw();restoreFocus(focus);
  }draw();
 }
 RENDER.catalog=catalog;RENDER.dashboard=dashboard;renderDash=dashboard;RENDER.trend=history;
 // Apply the same shell to the existing, fully featured contract calculator.
 const oldDiscounts=RENDER.discounts;
 RENDER.discounts=async()=>{await oldDiscounts();if(route()!=='discounts')return;const root=$('#v-discounts'),content=root.querySelector('#mvContracts');if(content){content.classList.add('cp-page','rw-page','rw-contracts');content.insertAdjacentHTML('afterbegin',heading('계약기간별','할인 비교','동일 상품의 온디맨드 요금과 약정 요금을 비교합니다.'));}};
})();
