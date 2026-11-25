(() => {
/* A concise entry point to the existing pricing tools. All figures use stored observations. */
let homeOverviewSequence = 0;
let homeMotionCleanup = () => {};
function animateHomeOverview(root) {
  homeMotionCleanup();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches || !('IntersectionObserver' in window)) return;
  const targets = [...root.querySelectorAll('.hc-hero-copy, .hc-find-heading, .hc-gateway-heading, .hc-gateway-card, .hc-hero-foot, .ho-search, .ho-shortcuts, .ho-statbar, .ho-section-heading, .ho-section-description, .ho-gpu-card, .ho-tool, .ho-provider, .ho-business, .ho-trust > div, .ho-footer')];
  const columns = matchMedia('(max-width:650px)').matches ? 2 : 3;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('ho-in');
      observer.unobserve(entry.target);
    });
  }, {threshold:0.08, rootMargin:'0px 0px -28px 0px'});
  targets.forEach(element => {
    let delay = 0;
    if (element.matches('.ho-gpu-card, .ho-tool, .ho-provider')) {
      const siblings = [...element.parentElement.children];
      const count = element.matches('.ho-provider') ? (columns===2 ? 1 : 2) : element.matches('.ho-tool') && columns===2 ? 1 : columns;
      delay = siblings.indexOf(element) % count * 95;
    } else if (element.parentElement.matches('.ho-hero')) {
      delay = Math.min([...element.parentElement.children].indexOf(element),4)*65;
    }
    element.style.setProperty('--ho-delay',delay+'ms');
    element.classList.add('ho-reveal');
    observer.observe(element);
  });
  // Keyboard navigation never lands on an invisible control.
  const onFocus = event => {
    const element = event.target.closest('.ho-reveal');
    if(element){element.style.setProperty('--ho-delay','0ms');element.classList.add('ho-in');observer.unobserve(element);}
  };
  const revealAll = () => {
    observer.disconnect();
    targets.forEach(element => element.classList.add('ho-in'));
  };
  const onPreference = () => {if(reduced.matches)revealAll();};
  root.addEventListener('focusin',onFocus);
  reduced.addEventListener('change',onPreference);
  homeMotionCleanup = () => {
    revealAll();
    root.removeEventListener('focusin',onFocus);
    reduced.removeEventListener('change',onPreference);
  };
}
window.addEventListener('hashchange',()=>{if(location.hash.split('/')[0]!=='#home')homeMotionCleanup();});
const homeCompareUrl = (model, provider = 'ALL', term = 'on_demand') => '#compare/' + encodeURIComponent(model) + '?' + new URLSearchParams({provider, term});
const homeValidPrice = row => row.display_price != null && Number.isFinite(Number(row.display_price)) && Number(row.display_price) >= 0;
const homeDate = value => Number.isFinite(Date.parse(value)) ? sgDay(value) : '수집일 미확인';
const homeIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${({compare:'<path d="M4 4h6v16H4zM14 4h6v16h-6zM6 8h2M16 8h2M6 12h2M16 12h2"/>',contract:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',history:'<path d="M3 12a9 9 0 1 0 3-6.7M3 3v5h5M12 7v5l3 2"/>',chip:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'})[name]}</svg>`;
RENDER.home = async function renderHomeOverview() {
  homeMotionCleanup();
  const ticket = ++homeOverviewSequence;
  ++SG.seq;
  sgRoute();
  if(SG.chart){SG.chart.destroy();SG.chart=null;}
  if(SG.miniChart){SG.miniChart.destroy();SG.miniChart=null;}
  const root = document.getElementById('v-home');
  root.innerHTML = '<div class="ho-loading" role="status">GPU 가격과 수집 현황을 불러오는 중입니다.</div>';
  let market, comparison;
  try { ({market, comparison} = await springLegacyData()); }
  catch(error) {
    if(ticket!==homeOverviewSequence || state.view!=='home')return;
    root.innerHTML='<div class="ho-loading"><h1>가격 정보를 불러오지 못했습니다.</h1><p>잠시 후 다시 시도해 주세요.</p><button class="ho-button" id="hoRetry">다시 불러오기</button></div>';
    root.querySelector('#hoRetry').onclick=()=>{MV.promise=null;springLegacyPending=null;RENDER.home();};return;
  }
  if(ticket!==homeOverviewSequence || state.view!=='home')return;
  const rows = comparison.candidates || [];
  const valid = rows.filter(homeValidPrice);
  const priority=['B300','GB300','VR200'];
  const models = [...market.models].sort((a,b)=>(priority.includes(a)?priority.indexOf(a):3)-(priority.includes(b)?priority.indexOf(b):3));
  const providers = Object.entries(market.providers);
  const pricedModels = new Set(valid.map(r=>r.model_name));
  const pricedProviders = new Set(valid.map(r=>r.provider_name));
  const timestamps = rows.map(r=>Date.parse(r.collected_at)).filter(Number.isFinite);
  const latest = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
  const allStale = timestamps.length && Date.now()-Math.max(...timestamps)>48*3600000;
  const optionModels = models.map(m=>`<option value="${mh(m)}">${mh(m)}</option>`).join('');
  const card = (model,index) => {
    const available = valid.filter(r=>r.model_name===model&&r.contract_type==='on_demand'&&r.service_option!=='confidential');
    const quote = [...available].sort((a,b)=>Number(a.display_price)-Number(b.display_price))[0];
    const stale = quote && (!Number.isFinite(Date.parse(quote.collected_at)) || Date.now()-Date.parse(quote.collected_at)>48*3600000);
    return `<article class="ho-gpu-card"><div class="ho-card-top"><span class="ho-chip-icon"><img src="/static/icons/nvidia.svg" alt="NVIDIA 로고" width="28" height="28"></span><span class="ho-tag ${quote?'':'muted'}">${priority.includes(model)?'중점 조사':'참조 모델'}</span></div><a class="ho-model-name" href="#catalog/gpu/${encodeURIComponent(model)}"><span>NVIDIA</span><h3>${mh(model)}</h3></a><p class="ho-model-meta">${available.length?new Set(available.map(r=>r.provider_name)).size+'개 사업자 · '+available.length+'개 온디맨드 오퍼':'온디맨드 가격 미확보'}</p><div class="ho-quote"><span>${quote?'수집 최저 단가 · 참고':'공개 가격 확인 상태'}</span><strong class="${quote?'':'ho-missing'}">${quote?mp(quote.display_price):'가격 미확보'}</strong><small>${quote?'USD / GPU·시간':'0원 또는 미판매를 뜻하지 않습니다.'}</small></div><div class="ho-quote-source">${quote?`<b>${mh(quote.provider_name)}</b><span>${homeDate(quote.collected_at)}${stale?' · 48시간 초과':''}</span>`:'<span>확인된 사양은 모델 상세에서 제공합니다.</span>'}</div><a class="ho-card-action" href="${quote?homeCompareUrl(model):'#catalog/gpu/'+encodeURIComponent(model)}">${quote?'상품·조건 비교':'모델 상세'}</a></article>`;
  };
  root.innerHTML=`<div class="ho ho-corporate">
    <section class="hc-hero" aria-labelledby="hoTitle">
      <img class="hc-hero-image" src="/static/img/gpu-datacenter-hero.jpg" alt="" fetchpriority="high" width="1632" height="960">
      <div class="hc-hero-shade"></div>
      <div class="hc-hero-copy"><p class="hc-eyebrow">GPU 시세 인덱스</p><h1 id="hoTitle">GPU 클라우드의<br><em>가격을 비교합니다.</em></h1><p class="hc-hero-lead">모델별 공개 요금부터 계약 조건까지.<br>GPU 도입에 필요한 정보를 확인하세요.</p><div class="hc-hero-actions"><a href="#compare" class="hc-primary">가격 비교</a><a href="#catalog" class="hc-secondary">GPU 카탈로그</a></div></div>
      <div class="hc-hero-foot"><button class="hc-scroll" type="button" id="hcExplore">가격 검색 <span class="hc-scroll-line" aria-hidden="true"></span></button><span class="hc-image-credit">AI 생성 이미지</span><button class="hc-motion" type="button" aria-pressed="false" id="hcMotion">모션 정지</button></div>
    </section>
    <div class="hc-wrap">
    <section class="hc-finder" id="hoFinder" aria-labelledby="hoFinderTitle"><div class="hc-find-heading"><div><p class="hc-eyebrow">가격 검색</p><h2 id="hoFinderTitle" tabindex="-1">어떤 GPU가 필요하신가요?</h2></div><p>모델과 이용 조건을 선택하면<br>수집된 가격을 비교할 수 있습니다.</p></div>
    <form class="ho-search" id="hoCompareForm" aria-label="GPU 가격 빠른 비교"><label><span>GPU 모델</span><select name="model" aria-label="비교할 GPU 모델">${optionModels}</select></label><label><span>사업자</span><select name="provider" aria-label="비교할 사업자"><option value="ALL">모든 사업자</option>${providers.map(([,name])=>`<option>${mh(name)}</option>`).join('')}</select></label><label><span>계약 유형</span><select name="term" aria-label="비교할 계약 유형"><option value="on_demand">온디맨드</option><option value="spot">스팟</option><option value="commitment">장기약정</option></select></label><button class="ho-button" type="submit">가격 비교하기</button></form>
    <div class="ho-shortcuts"><span>빠른 탐색</span>${models.slice(0,3).map(m=>`<a href="${homeCompareUrl(m)}">${mh(m)}</a>`).join('')}<a href="#dashboard/general">AWS · Azure 비교</a></div>
    <div class="ho-statbar"><a href="#catalog"><strong>${models.length}</strong><span>조사 대상 GPU</span></a><a href="#catalog"><strong>${pricedModels.size}</strong><span>가격 확보 모델</span></a><a href="#dashboard"><strong>${pricedProviders.size}</strong><span>가격 확보 사업자</span></a><a href="/static/public-data.html"><strong>${new Set(valid.map(r=>r.offer_id)).size.toLocaleString()}</strong><span>가격 확보 오퍼</span></a><div class="ho-updated"><span>최근 수집일 · KST</span><b>${homeDate(latest)}</b><small>${allStale?'48시간 초과 자료 · 과거 참고용':'저장된 관측 기준 · 실시간 견적 아님'}</small></div></div></section>

    <section class="hc-gateway" aria-labelledby="hcGatewayTitle"><div class="hc-gateway-heading"><p class="hc-eyebrow">GPU 서비스</p><h2 id="hcGatewayTitle">정보를 찾고, 조건을 비교하고,<br>사업성을 검토합니다.</h2></div>
    <div class="hc-gateway-grid">
      <a class="hc-gateway-card hc-catalog" href="#catalog"><img src="/static/img/cloud-infrastructure-white.png" alt="" loading="lazy"><div><span>GPU 카탈로그</span><h3>모델별 사양과<br>공개 요금</h3><p>B300 · GB300 · VR200</p></div><span class="hc-gateway-cta">카탈로그 보기</span></a>
      <a class="hc-gateway-card hc-providers" href="#dashboard/general"><img src="/static/img/gpu-datacenter-hero.jpg" alt="" loading="lazy"><div><span>사업자 비교</span><h3>같은 GPU,<br>다른 이용 조건</h3><p>AWS · Azure</p></div><span class="hc-gateway-cta">사업자별 요금 보기</span></a>
      <a class="hc-gateway-card hc-business-card" href="#bizcase"><span class="hc-ribbon" aria-hidden="true"></span><div><span>사업성 검토</span><h3>원가에서<br>손익과 IRR까지</h3><p>가동률과 제안가에 따른 사업성 검토</p></div><span class="hc-gateway-cta">사업성 검토하기</span></a>
    </div></section>
    <section class="ho-section" aria-labelledby="hoModels"><div class="ho-section-heading"><div><p class="hc-eyebrow">수집 가격</p><h2 id="hoModels">GPU 모델별 가격</h2></div><a class="ho-text-link" href="#catalog">전체 GPU 카탈로그</a></div><p class="ho-section-description">수집된 온디맨드 요금입니다. 상품 구성과 지역이 다른 참고 가격으로, 세부 조건은 가격 비교에서 확인할 수 있습니다.</p><div class="ho-gpu-grid">${models.map(card).join('')}</div></section>
    <section class="ho-section" aria-labelledby="hoTools"><div class="ho-section-heading"><div><p class="hc-eyebrow">가격 분석</p><h2 id="hoTools">조건과 변화까지 확인합니다.</h2></div></div><div class="ho-tool-grid"><a href="#dashboard/general" class="ho-tool">${homeIcon('compare')}<h3>사업자별 가격 비교</h3><p>AWS와 Azure의 상품 구성과<br>GPU당 요금을 비교합니다.</p><span>AWS · Azure</span></a><a href="#discounts" class="ho-tool">${homeIcon('contract')}<h3>계약 할인·견적</h3><p>우리 판매단가와 할인율로<br>3년·5년 예상 견적을 계산합니다.</p><span>사용자 할인율 · 경쟁사 가격 참고</span></a><a href="#trend" class="ho-tool">${homeIcon('history')}<h3>가격 관측 이력</h3><p>수집 시점별 가격 변동과<br>원본 출처를 확인합니다.</p><span>수집 시각 · 가격 근거</span></a></div></section>
    <section class="ho-section ho-coverage" aria-labelledby="hoCoverage"><div class="ho-section-heading"><div><h2 id="hoCoverage">수집 사업자 현황</h2></div><a class="ho-text-link" href="#qa">데이터 품질 확인</a></div><div class="ho-provider-grid">${providers.map(([id,name])=>{const pool=valid.filter(r=>r.provider_name===name);return `<a class="ho-provider" href="#catalog/provider/${encodeURIComponent(id)}"><span class="ho-provider-mark ${mh(id)}">${mh(id==='aws'?'aws':name.slice(0,1))}</span><div><h3>${mh(name)}</h3><p>${pool.length?new Set(pool.map(r=>r.model_name)).size+'개 모델 · '+new Set(pool.map(r=>r.offer_id)).size+'개 가격 오퍼':'현재 확보된 가격 없음'}</p></div><span class="ho-provider-state">${pool.length?'자료 확보':'미확보'}</span></a>`;}).join('')}</div></section>
    <section class="ho-business"><div><p class="hc-eyebrow">사업성 검토</p><h2>GPU 서비스의<br>사업성을 검토합니다.</h2><p>원가와 가동률을 기준으로<br>제안가, 손익, IRR을 산정합니다.</p><div><a class="ho-button" href="#cost">원가 분석</a><a class="ho-business-link" href="#bizcase">사업성 검토</a></div></div><img src="/static/img/cloud-infrastructure-white.png" alt="흰 배경에 자연스럽게 어우러진 클라우드 서버 인프라 이미지" loading="lazy"></section>
    <section class="ho-trust"><div><b>가격 단위</b><p>USD / GPU·시간 기준으로<br>구성 전체 요금과 구분합니다.</p></div><div><b>수집 출처</b><p>원본 출처와 수집 시각을<br>상세 비교에서 확인합니다.</p></div><div><b>비교 기준</b><p>미확인·48시간 초과 자료는<br>최신 동일 조건 집계에서 제외합니다.</p></div></section><footer class="ho-footer"><b>SKALA <span>GPU Market Intelligence</span></b><span>공개 수집 자료 기반 · 실시간 견적 및 재고를 보장하지 않습니다.</span><a href="/static/public-data.html">수집 데이터 보기</a></footer>
  </div></div>`;
  animateHomeOverview(root);
  const hero = root.querySelector('.hc-hero');
  const motionButton = root.querySelector('#hcMotion');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let motionPaused = reduceMotion.matches;
  const syncMotion = () => {
    hero.classList.toggle('hc-paused', motionPaused || reduceMotion.matches);
    motionButton.hidden = reduceMotion.matches;
    motionButton.setAttribute('aria-pressed', String(motionPaused));
    motionButton.textContent = motionPaused ? '모션 재생' : '모션 정지';
  };
  motionButton.onclick=()=>{motionPaused=!motionPaused;syncMotion();};
  syncMotion();
  reduceMotion.addEventListener('change',syncMotion);
  const previousCleanup=homeMotionCleanup;
  homeMotionCleanup=()=>{previousCleanup();reduceMotion.removeEventListener('change',syncMotion);};
  root.querySelector('#hcExplore').onclick=()=>{
    root.querySelector('#hoFinderTitle').focus({preventScroll:true});
    root.querySelector('#hoFinder').scrollIntoView({behavior:reduceMotion.matches?'instant':'smooth',block:'start'});
  };
  root.querySelector('#hoCompareForm').onsubmit=event=>{event.preventDefault();const values=new FormData(event.currentTarget);location.hash=homeCompareUrl(values.get('model'),values.get('provider'),values.get('term'));};
};

})();
