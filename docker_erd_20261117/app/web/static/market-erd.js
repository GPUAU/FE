/* Four-provider research workspace. Read-only snapshot, transparent provenance. */
const MV={data:null,promise:null,model:'B300',group:'general',term:'ON_DEMAND',region:['ALL','ALL'],pick:['',''],provider:'ALL',q:'',page:0,includeStale:true,contractProvider:'aws',contractKey:'',seq:0};
const MG={
 general:{label:'GPU 인스턴스 클라우드',ids:['aws','azure'],caption:'CPU·메모리 포함',description:'GPU와 CPU·메모리를 함께 제공하는 인스턴스 상품을 비교합니다.'},
 specialist:{label:'GPU 전문 클라우드',ids:['nebius','verda'],caption:'GPU 중심 서비스 · Neo Cloud',description:'GPU 연산 중심의 클라우드 상품과 계약 조건을 비교합니다.'}
};
const MT={ON_DEMAND:'온디맨드',SPOT:'스팟','1_YEAR':'1년 약정','3_YEAR':'3년 약정'};
const mh=x=>esc(String(x??''));
const mp=x=>x==null?'—':'$'+Number(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const mr=x=>x||'리전 미명시';
const mv=x=>x==null||x===''?'미확인':mh(x);
const mutc=x=>x?new Date(x).toISOString().replace('T',' ').replace('.000Z',' UTC').replace(/\.\d+Z$/,' UTC'):'미확인';
const mtime=x=>x?new Date(x).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})+' KST':'미확인';
const msource=r=>r.source;
const mstamp=r=>`<span class="mv-badge ${r.verification==='공식 관측가 일치'?'good':r.verification==='공식 관측가 차이'?'bad':''}">${mh(r.verification)}</span>`;
const mlink=(url,label)=>/^https?:\/\//.test(url||'')?`<a href="${mh(url)}" target="_blank" rel="noopener noreferrer">${mh(label)} ↗</a>`:'미확인';
async function marketData(){if(!MV.promise)MV.promise=api('/api/market').then(d=>(MV.data=d,d)).catch(e=>{MV.promise=null;throw e});return MV.promise}
function mframe(title,desc){document.body.classList.add('market-v4');$('#pageTitle').textContent=title;$('#pageDesc').textContent=desc;const c=$('#dataContext');c.innerHTML=`<span class="mv-dot"></span><div><b>가격 관측 기준</b><span>${mtime(MV.data.snapshot_at)} · 현재 예약가와 다를 수 있습니다. 자동 갱신되지 않는 수집 자료입니다.</span></div>`;c.hidden=false}
function mfooter(){return `<footer class="mv-sourcebar"><b>자료 출처</b><span>${mlink('https://gpuledger.dev/data/','GPU Ledger')} · ${mlink('https://gpueconomy.com/data','GPU Economy')} · 집계 데이터 CC BY 4.0 / 선별·환산 적용</span><small>공식 관측은 검증·보완 자료입니다. 집계 라이선스가 사업자 원문에 적용된다는 뜻은 아닙니다. </small><a href="/public-data">수집 자료·과거 이력 보기 ↗</a></footer>`}
function mmodels(models = MV.data.models){return `<div class="mv-models"><div><small>메인 모델</small>${models.slice(0,3).map(m=>`<button data-model="${mh(m)}" aria-pressed="${m===MV.model}">${mh(m)}</button>`).join('')}</div><div class="refs"><small>참조 모델</small>${models.slice(3).map(m=>`<button data-model="${mh(m)}" aria-pressed="${m===MV.model}">${mh(m)}</button>`).join('')}</div></div>`}
function mbind(el,rerender){el.onclick=e=>{const b=e.target.closest('[data-model]'),detail=e.target.closest('[data-offer]');if(b){MV.model=b.dataset.model;MV.page=0;MV.pick=['',''];MV.contractKey='';rerender()}if(detail)marketEvidence(detail.dataset.offer)};}
async function marketHome(){await marketData();mframe('GPU 가격 리서치','동일한 조건, 명확한 근거로 가격을 비교하세요.');++homeRequest;setHomeHero();$('#heroHeadline').innerHTML='GPU 가격과 계약 조건을<br>한곳에서 비교하세요.';$('#helloSub').textContent='클라우드 유형을 선택하고 상품 구성과 공개 가격을 함께 비교하세요.';$('#helloWhy').textContent='메인 B300 · GB300 NVL72 · VR200 NVL72 / 참조 GB200 NVL72 · H100 · H200';$('#heroStatus').innerHTML=`<span>집계 출처 <b>${MV.data.summary.aggregate}개 조합</b></span><span>공식 가격 일치 <b>${MV.data.summary.by_verification['공식 관측가 일치']||0}건</b></span><span>관측 기준 <b>${mtime(MV.data.snapshot_at)}</b></span>`;
 $('#homeBody').innerHTML=`<div class="mv"><div class="mv-section-head"><div><p class="mv-eyebrow">사업자 비교</p><h2>비교 시장 선택</h2></div><a class="mv-btn" href="#discounts">계약기간별 할인 보기 ↗</a></div><div class="mv-groups">${Object.entries(MG).map(([k,g])=>`<a class="mv-group" href="#dashboard/${k}"><i class="sk-market-accent" data-sk-market-accent aria-hidden="true"></i><span>${g.caption}</span><h3>${g.label}</h3><p>${g.description}</p><b>시장 선택 <span aria-hidden="true">↗</span></b></a>`).join('')}</div><div class="mv-section-head"><div><p class="mv-eyebrow">모델별 자료</p><h2>주요 GPU 모델</h2></div><span>모델별 수집 현황과 공개 가격 상태</span></div><div class="mv-modelcards">${MV.data.models.slice(0,3).map(m=>{const rows=MV.data.records.filter(r=>r.model===m&&r.listed_price!=null);return `<a href="#catalog/gpu/${encodeURIComponent(m)}"><span class="mv-chip">주요 모델</span><h3>${mh(m)}</h3><strong>${rows.length?rows.length.toLocaleString():'—'}<small>${rows.length?'개 가격 조합':'공개 가격 미관측'}</small></strong><p>${m.includes('NVL72')?'전체 랙과 부분 구성을 구분해 확인하세요.':'지역·GPU 수·과금 방식에 따라 달라집니다.'}</p><span>모든 상품과 근거 보기 ↗</span></a>`}).join('')}</div><div class="mv-note"><b>GPU당 가격 ≠ 단일 GPU 상품</b><p>수집한 원본 가격과 구성 수를 보존합니다. 선납금·지역·사양이 없으면 추정하지 않고 미확인으로 표시합니다.</p></div>${mfooter()}</div>`;
}
let springCatalogPending;
async function springMarketCatalog() {
  if (!springCatalogPending) {
    const pending = import('/static/spring-market-client.mjs')
      .then(client => client.fetchMarketCatalog(api))
      .catch(error => {
        if (springCatalogPending === pending) springCatalogPending = null;
        throw error;
      });
    springCatalogPending = pending;
  }
  return springCatalogPending;
}

const marketProviderTypes = {general: 'GENERAL_CLOUD', specialist: 'GPU_SPECIALIST'};
const marketProviderNames = {aws:'AWS', azure:'Azure', nebius:'Nebius', verda:'Verda'};
const marketFreshness = {CURRENT:'48시간 이내 확인', STALE:'48시간 초과 · 과거 참고', UNKNOWN:'확인 시각 미확인'};
const marketCertainty = {EXACT:'확정가', FROM:'시작가', RANGE:'범위가', SCENARIO:'시나리오', UNKNOWN:'가격 구분 미확인'};
const marketDisclosure = {PUBLIC:'공개가', NOT_DISCLOSED:'가격 미공개', LOGIN_REQUIRED:'로그인 필요', CONTACT_SALES:'영업 문의', QUOTE_REQUIRED:'견적 문의', UNKNOWN:'공개 여부 미확인'};
const marketPayment = {ALL_UPFRONT:'전액 선납', PARTIAL_UPFRONT:'일부 선납', NO_UPFRONT:'선납 없음', NOT_APPLICABLE:'해당 없음', UNKNOWN:'미확인'};
const marketExclusions = {staleOffers:'48시간 초과', notFoundOffers:'최근 확인에서 공개가 미확보', nonExactOffers:'확정 단가 아님', incomparableOffers:'동일 조건 판단에 필요한 정보 누락', missingPriceOffers:'관측 가격 미확보', unavailableNormalizationOffers:'실효 단가 환산 불가'};

function marketGroupConditions(key) {
  const labels = {
    providerType:'사업자 유형', countryCode:'국가', regionCode:'리전', systemType:'시스템',
    serviceOption:'서비스', gpuCount:'GPU 수', contractType:'계약', contractProductType:'계약 상품',
    commitmentMonths:'약정 개월', paymentOption:'지불 방식', minimumQuantity:'최소 물량',
    minimumQuantityUnit:'최소 물량 단위', intraNodeInterconnect:'노드 내 연결', vcpuCount:'vCPU',
    ramGb:'RAM(GB)', vramGbPerGpu:'GPU당 VRAM(GB)', specScope:'구성 범위',
    storageDescription:'스토리지', interNodeNetwork:'노드 간 네트워크',
  };
  const values = {
    providerType: {GENERAL_CLOUD:'GPU 인스턴스 클라우드', GPU_SPECIALIST:'GPU 전문 클라우드'},
    paymentOption: marketPayment,
    contractType: {ON_DEMAND:'온디맨드', SPOT:'스팟', COMMITMENT:'장기약정'},
  };
  return Object.entries(labels).filter(([field]) => key[field] != null)
    .map(([field, label]) => label + ' ' + (values[field]?.[key[field]] || key[field])).join(' · ');
}

function marketSummaryContent(summary, chosen) {
  if (!summary) return '<p>시장 요약을 불러오지 못했습니다.</p>';
  const counts = chosen?.sampleCounts;
  const excluded = Object.entries(summary.excludedSummary).filter(([, count]) => count > 0);
  const asOf = summary.asOf ? '<p><small>판정 ' + mtime(summary.asOf) + '</small></p>' : '';
  return (chosen
    ? `<p>최저 ${fxPrice(chosen.minimum)} · 중앙값 ${fxPrice(chosen.median)} · 최고 ${fxPrice(chosen.maximum)} (USD / GPU·시간)</p>
      <p>사업자별 최저 1개 · 사업자 ${counts.providerCount}곳 / 상품 ${counts.productCount}개 / 오퍼 ${counts.offerCount}개 / 관측 ${counts.observationCount}건${chosen.warnings?.includes('SINGLE_PROVIDER')?' · 단일 사업자 표본':''}</p>`
    : '<p>비교 조건을 충족한 최신 표본이 없습니다.</p>') + asOf
    + (excluded.length ? `<details><summary>집계 제외 사유</summary><ul>${excluded.map(([reason, count]) => `<li>${mh(marketExclusions[reason] || reason)} · ${count}개</li>`).join('')}</ul></details>` : '');
}

function springMarketFooter() {
  return '<footer class="mv-sourcebar"><b>공개 GPU 가격</b><span>AWS 가격 카탈로그·스팟 API 기록 · Azure Retail Prices API</span><small>기존 수집 파일과 과거 이력은 별도 보관 서버에서 제공합니다.</small><a href="/public-data">수집 아카이브 열기 (선택) ↗</a></footer>';
}

function exportMarketOffers(filename, rows) {
  const headers = ['오퍼ID','상품ID','관측ID','사업자','모델','상품','SKU','국가','리전','GPU수','시스템 유형','vCPU','RAM_GB','스토리지','노드 내 연결','계약','약정개월','선납','최소 물량','최소 물량 단위','가격 원문','반복 요금 원본','실효USD_GPU시간','최근공개상태','최신성','수집UTC','출처'];
  const values = rows.map(row => {
    const product = row.configuration, contract = row.contractInfo;
    const fields = [row.id, row.productId, row.observationId, row.provider, row.model, row.product, product.sku, row.country,
      row.region, row.gpus, product.systemType, product.vcpuCount, product.ramGb, product.storageDescription,
      product.intraNodeInterconnect, row.contract, contract.months, contract.paymentOption, contract.minimumQuantity,
      contract.minimumQuantityUnit, row.rawPriceText, row.hourlyComponent ? marketHourly(row.hourlyComponent) : '',
      row.price, row.disclosure, row.freshness, row.collected, row.source];
    return fields.map(value => typeof value === 'string' && /^\s*[=+@-]/.test(value) ? "'" + value : value);
  });
  downloadCSV(filename, headers, values);
}

function marketPriceFrame(title, description) {
  document.body.classList.add('market-v4');
  $('#pageTitle').textContent = title;
  $('#pageDesc').textContent = description;
  const context = $('#dataContext');
  context.innerHTML = '<span class="mv-dot"></span><div><b>저장 가격 관측</b><span>마지막 성공 관측 가격과 최근 공개 상태를 확인할 수 있습니다.</span></div>';
  context.hidden = false;
}


async function marketDashboard() {
  const ticket = ++MV.seq;
  const group = location.hash.split('/')[1];
  if (MG[group] && MV.group !== group) {
    MV.group = group;
    MV.region = ['ALL','ALL'];
    MV.pick = ['',''];
    MV.summaryGroup = '';
  }
  state.f.model = MV.model;
  state.f.term = MV.term;
  document.body.classList.add('pair-mode', 'market-v4');
  const el = $('#pairWorkspace') || Object.assign(document.createElement('div'), {id:'pairWorkspace'});
  if (!el.isConnected) $('#v-dashboard').prepend(el);
  marketPriceFrame('시장별 GPU 가격 비교', '클라우드 유형별로 상품 구성과 가격 근거를 확인하세요.');
  el.innerHTML = '<div class="mv-note" role="status">가격 자료를 불러오는 중입니다.</div>';

  try {
    const [client, catalog] = await Promise.all([import('/static/spring-market-client.mjs'), springMarketCatalog()]);
    if (ticket !== MV.seq || state.view !== 'dashboard') return;
    const filters = {
      modelId: catalog.models.find(model => model.name === MV.model)?.id,
      providerType: marketProviderTypes[MV.group], ...client.marketTerm(MV.term),
    };
    const [offers, summary] = filters.modelId ? await Promise.all([
      client.fetchMarketOffers(api, {...filters, includeStale: String(MV.includeStale)}),
      client.fetchMarketSummary(api, filters).catch(() => null),
    ]) : [[], null];
    if (ticket !== MV.seq || state.view !== 'dashboard') return;
    const modelNames = catalog.models.map(model => model.name);
    el.innerHTML = `<div class="mv"><nav class="mv-tabs" aria-label="비교 시장 선택">${Object.entries(MG).map(([key, item]) => `<a class="${MV.group===key?'active':''}" href="#dashboard/${key}" ${MV.group===key?'aria-current="page"':''}><small>${item.caption}</small>${item.label}${MV.group===key?'<i class="sk-market-accent" data-sk-market-accent aria-hidden="true"></i>':''}</a>`).join('')}</nav>
      <section class="mv-controls">${mmodels(modelNames)}<div class="mv-filterline"><label>과금 방식<select id="mvTerm">${Object.entries(MT).map(([key,label]) => `<option value="${key}" ${MV.term===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="mv-check"><input id="mvSupplement" type="checkbox" ${MV.includeStale?'checked':''}> 48시간 지난 가격 포함</label><a class="mv-btn" href="#discounts">1년·3년 할인 비교 ↗</a></div></section>
      <div class="mv-section-head"><div><p class="mv-eyebrow">${MG[MV.group].label} · 비교 사업자 ${MG[MV.group].ids.length}곳</p><h2>${mh(MV.model)} <span>· ${MT[MV.term]}</span></h2></div><button class="mv-btn" id="mvExport">선택 비교 저장 ↓</button></div>
      <div id="mvPair"></div><section class="mv-note cp-summary" id="mvMarketSummary"></section>${springMarketFooter()}</div>`;
    mbind(el, marketDashboard);
    $('#mvTerm').onchange = event => { MV.term = event.target.value; MV.pick = ['','']; marketDashboard(); };
    $('#mvSupplement').onchange = event => { MV.includeStale = event.target.checked; MV.pick = ['','']; marketDashboard(); };
    drawMarketPair(offers.map(client.mapMarketOffer));
    const groups = summary?.groups || [];
    const drawSummary = () => {
      const chosen = groups.find(item => client.marketGroupId(item.groupKey) === MV.summaryGroup) || groups[0];
      MV.summaryGroup = client.marketGroupId(chosen?.groupKey);
      $('#mvMarketSummary').innerHTML = `<h3>동일 조건 대표가격</h3><p>선택한 시장 유형·GPU 모델·계약 기준으로 집계합니다.</p>
        ${chosen ? `<label>집계 조건 <select id="mvSummaryGroup">${groups.map((item, index) => `<option value="${index}" ${item===chosen?'selected':''}>${mh(marketGroupConditions(item.groupKey))}</option>`).join('')}</select></label>` : ''}
        ${marketSummaryContent(summary, chosen)}${!summary && filters.modelId ? '<button class="mv-btn" id="mvSummaryRetry">요약 다시 조회</button> ' : ''}<a class="mv-btn" id="mvCompareLink" href="#compare">동일 조건·표본 수 확인 ↗</a>`;
      $('#mvSummaryGroup')?.addEventListener('change', event => {
        MV.summaryGroup = client.marketGroupId(groups[Number(event.target.value)].groupKey);
        drawSummary();
        $('#mvSummaryGroup').focus();
      });
      $('#mvSummaryRetry')?.addEventListener('click', marketDashboard);
      $('#mvCompareLink').onclick = () => {
        Object.assign(CP, {model: MV.model, term: filters.contractType.toLowerCase(), months: filters.commitmentMonths || 'ALL',
          type: MV.group === 'general' ? 'hyperscaler' : 'neocloud', provider:'ALL', country:'ALL', region:'ALL',
          query:'', generation:'ALL', confidential:true, mode:'strict', group:MV.summaryGroup, page:0});
      };
      refreshKrw();
    };
    drawSummary();
  } catch (error) {
    if (ticket !== MV.seq || state.view !== 'dashboard') return;
    el.innerHTML = `<div class="mv-note"><b>가격 자료를 불러오지 못했습니다.</b><p>${mh(error.message)}</p><button class="mv-btn" id="mvMarketRetry">다시 불러오기</button></div>`;
    $('#mvMarketRetry').onclick = marketDashboard;
  }
}

function marketHourly(component) {
  if (component?.amount == null) return '—';
  const amount = String(component.amount).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
  return [component.currency, amount, component.timeUnit, component.appliesTo].filter(Boolean).join(' ');
}

function drawMarketPair(pool) {
  const group = MG[MV.group], picked = [];
  const cards = group.ids.map((pid, i) => {
    const name = marketProviderNames[pid];
    const rows = pool.filter(row => row.provider === name);
    const regions = [...new Set(rows.map(row => row.region || ''))].sort();
    if (MV.region[i] !== 'ALL' && !regions.includes(MV.region[i])) MV.region[i] = 'ALL';
    const options = rows.filter(row => MV.region[i] === 'ALL' || (row.region || '') === MV.region[i])
      .sort((a, b) => (a.freshness === 'STALE') - (b.freshness === 'STALE') || (a.price ?? Infinity) - (b.price ?? Infinity));
    const row = options.find(item => item.id === MV.pick[i]) || options.find(item => item.price != null) || options[0];
    picked.push(row);
    MV.pick[i] = row?.id || '';
    return `<article class="mv-provider"><div class="mv-provider-head"><span class="mv-monogram ${pid}">${{aws:'aws',azure:'A',nebius:'N',verda:'V'}[pid]}</span><div><small>${group.label}</small><h3>${name}</h3></div><span class="mv-muted">${rows.length}개 오퍼</span></div>
      <div class="mv-selects"><label>리전<select data-region="${i}"><option value="ALL">전체 관측 지역</option>${regions.map(region => `<option value="${mh(region)}" ${region===MV.region[i]?'selected':''}>${mh(mr(region))}</option>`).join('')}</select></label>
      <label>비교 상품<select data-pick="${i}" ${options.length?'':'disabled'}>${options.map(item => `<option value="${mh(item.id)}" ${row?.id===item.id?'selected':''}>${mh(item.configuration.sku || item.product)} · ${item.gpus??'?'} GPU · ${mh(mr(item.region))} · ${mp(item.price)}</option>`).join('') || '<option>관측 자료 없음</option>'}</select></label></div>
      ${row ? `<div class="mv-quote"><div><span class="mv-badge ${row.eligible?'good':''}">${mh(marketFreshness[row.freshness] || '미확인')}</span> <span class="mv-chip">${mv(row.sourceName)}</span></div><small>마지막 관측 실효 단가 · ${mh(marketCertainty[row.certainty] || '가격 미관측')}</small><strong>${fxPrice(row.price)}<em>/ GPU·시간</em></strong><p>${mh(row.product)}</p><span class="mv-chip">${mv(row.configuration.systemType)} · ${row.gpus ?? '미확인'} GPU</span></div>
      <dl class="mv-quick"><div><dt>원본 반복 요금</dt><dd>${mh(marketHourly(row.hourlyComponent))}</dd></div><div><dt>vCPU / 시스템 RAM</dt><dd>${mv(row.configuration.vcpuCount)} / ${mv(row.configuration.ramGb)} GB</dd></div><div><dt>최근 가격 공개 상태</dt><dd>${mh(marketDisclosure[row.disclosure] || '미확인')}</dd></div></dl>
      <div class="mv-cardfoot"><small>${mtime(row.collected)}</small><button class="mv-btn primary" data-market-offer="${mh(row.id)}">상품 상세·가격 근거 ↗</button></div>` : '<div class="mv-empty"><span>—</span><h3>선택 조건의 가격 미확보</h3><p>저장된 가격 관측이 없습니다.</p></div>'}</article>`;
  });
  const chartRows = group.ids.map((pid, i) => ({label:marketProviderNames[pid], price:picked[i]?.price == null ? null : Number(picked[i].price),
    missingLabel:'실효 단가 미확보', source:picked[i]?.sourceName || '', observedAt:picked[i]?.collected || ''}));
  const gap = MarketLogic.gap(...picked.map(row => row && {normalized_price:row.price == null ? null : Number(row.price)}));
  $('#mvPair').innerHTML = `<section class="sk-comparison-chart" aria-label="선택 상품의 GPU당 시간 요금 차트"><div class="sk-chart-heading"><div><h3>선택 상품의 시간당 가격</h3><p>${mh(MV.model)} · ${MT[MV.term]} · ${group.label}</p></div><span>USD / GPU·시간</span></div><div data-sk-price-chart data-rows="${mh(JSON.stringify(chartRows))}"></div><p class="sk-comparison-note">참고 단가에는 서로 다른 리전·CPU·메모리·GPU 수·연결망 조건이 포함될 수 있습니다.</p></section>
    <div class="mv-pairgrid">${cards.join('')}</div><div class="mv-gap"><div><small>선택한 ${group.ids.map(pid => marketProviderNames[pid]).join(' → ')} · GPU당 차이</small><strong>${gap ? `${gap.amount>=0?'+':'−'}${mp(Math.abs(gap.amount))}` : '비교 가능한 양쪽 가격이 필요합니다.'}</strong>${gap?`<span>왼쪽 기준 ${gap.percent>0?'+':''}${gap.percent.toFixed(1)}%</span>`:''}</div><p>선택 상품의 실효 단가를 사용한 참고 비교입니다.</p></div>`;
  $('#mvPair').onchange = event => {
    const {region, pick} = event.target.dataset;
    if (region !== undefined) { MV.region[Number(region)] = event.target.value; MV.pick[Number(region)] = ''; }
    if (pick !== undefined) MV.pick[Number(pick)] = event.target.value;
    drawMarketPair(pool);
    if (region !== undefined) $('#mvPair').querySelector(`[data-region="${region}"]`).focus();
    if (pick !== undefined) $('#mvPair').querySelector(`[data-pick="${pick}"]`).focus();
  };
  $('#mvExport').disabled = !picked.some(Boolean);
  $('#mvExport').onclick = () => exportMarketOffers('GPU_선택비교.csv', picked.filter(Boolean));
  refreshKrw();
}

let marketDetailTicket = 0;

function marketEvidenceList(evidence) {
  return evidence.map(source => `<div class="mv-evidence-match"><b>${mv(source.sourceName)}</b><p>${mlink(source.sourceUrl, '원문 URL')} · ${mv(source.role)}</p><small>근거 확보 ${mtime(source.capturedAt)} · 공식 검증 ${source.primaryVerified === true ? '확인됨' : source.primaryVerified === false ? '미확인' : '기록 없음'}</small></div>`).join('') || '<p>연결된 출처가 없습니다.</p>';
}

async function showMarketOffer(offerId, trigger) {
  const ticket = ++marketDetailTicket;
  const dialog = $('#evidenceDialog'), body = $('#evidenceBody');
  evidenceTrigger = trigger;
  dialog.classList.add('mv-dialog');
  body.innerHTML = '<div class="mv"><h2 id="evidenceTitle">상품 상세·가격 근거</h2><p role="status">상품을 불러오는 중입니다.</p></div>';
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  try {
    const client = await import('/static/spring-market-client.mjs');
    const detail = await client.fetchMarketOffer(api, offerId);
    if (!dialog.open || ticket !== marketDetailTicket) return;
    const offer = detail.offer, product = offer.product, contract = offer.contract;
    const observation = offer.lastSuccessfulObservation, row = client.mapMarketOffer(offer);
    const status = offer.latestCheck, explanation = detail.normalizationExplanation;
    const section = (title, fields) => `<section class="mv-detail-section"><h3>${title}</h3><dl>${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl></section>`;
    body.innerHTML = `<div class="mv"><p class="mv-eyebrow">상품·계약·관측 근거</p><h2 id="evidenceTitle">${mh(offer.providerName)} · ${mh(offer.modelName)}</h2><div class="mv-detailhero"><h3>${mv(row.product)}</h3><p>오퍼 ${mh(offerId)} · ${mv(offer.providerType)} · ${mv(product.countryCode)} / ${mv(product.regionCode)}</p><strong>${fxPrice(row.price)} <small>/ GPU·시간 · 마지막 관측 실효 단가</small></strong></div>
      ${section('상품 구성', [['상품명·SKU', mv(product.originalProductName) + ' / ' + mv(product.sku)], ['원본 모델명', mv(product.originalModelName)], ['시스템·서비스', mv(product.systemType) + ' / ' + mv(product.serviceOption)], ['GPU 수 / GPU당 VRAM(GB)', mv(product.gpuCount) + ' / ' + mv(product.vramGbPerGpu)], ['vCPU / RAM(GB)', mv(product.vcpuCount) + ' / ' + mv(product.ramGb)], ['스토리지', mv(product.storageDescription)], ['연결 정보', mv(product.intraNodeInterconnect) + ' / ' + mv(product.interNodeNetwork)], ['구성 범위·버전', mv(product.specScope) + ' / ' + mv(product.configurationVersion)]])}
      ${section('계약과 공개 상태', [['계약 상품', mv(contract.productType)], ['약정기간', contract.months == null ? (contract.type==='ON_DEMAND'||contract.type==='SPOT'?'기간 약정 없음':'미확인') : mh(contract.months) + '개월'], ['지불 방식', mv(marketPayment[contract.paymentOption])], ['최소 물량', mv(contract.minimumQuantity) + ' / ' + mv(contract.minimumQuantityUnit)], ['최근 가격 공개 상태', mv(marketDisclosure[row.disclosure])], ['최근 확인', mtime(status?.checkedAt) + ' · ' + mv(status?.processingStatus)], ['최신성', mv(marketFreshness[row.freshness])], ['동일 조건 집계', row.eligible ? '집계 대상' : mh(row.excludedReasons.map(reason => marketExclusions[reason] || reason).join(' · ') || '미확인')]])}
      ${section('마지막 성공 관측', [['가격 원문', mv(observation?.rawPriceText)], ['실제 수집 시각', mtime(row.collected)], ['가격 적용 시작', mtime(observation?.effectiveFrom)], ['가격 구분', mv(marketCertainty[row.certainty])], ['명목 USD / GPU·시간', fxPrice(observation?.nominal?.amount)], ['정규화 산식', mv(explanation?.formulaDescription)], ['정규화 규칙·정밀도', mv(explanation?.ruleVersion) + ' / ' + mv(explanation?.precisionPolicy)]])}
      ${observation?.components?.length ? `<section class="mv-detail-section"><h3>원본 가격 구성요소</h3><ul>${observation.components.map(component => `<li>${mv(component.type)} · ${mv(component.amount ?? component.discountRate)} ${mv(component.currency)} / ${mv(component.timeUnit)} · ${mv(component.appliesTo)}</li>`).join('')}</ul></section>` : ''}
      <section class="mv-detail-section"><h3>가격 관측 출처</h3>${marketEvidenceList(observation?.evidence || [])}</section>
      ${offer.latestDisclosure?.evidence?.length ? `<details class="mv-note"><summary>최근 공개 상태 출처</summary>${marketEvidenceList(offer.latestDisclosure.evidence)}</details>` : ''}
      ${detail.specEvidence?.length ? `<details class="mv-note"><summary>상품 사양 근거</summary>${detail.specEvidence.map(item => `<h4>${mv(item.attributeName)}</h4>${marketEvidenceList([item.evidence])}`).join('')}</details>` : ''}
      ${row.observation ? `<button class="mv-btn primary" id="mvOfferObservation">정규화 관측·환율 재계산 ↗</button>` : ''}
      </div>`;
    $('#mvOfferObservation')?.addEventListener('click', () => {
      const pending = showErdObservation(row.observation);
      evidenceTrigger = trigger;
      return pending;
    });
    refreshKrw();
  } catch (error) {
    if (!dialog.open || ticket !== marketDetailTicket) return;
    body.innerHTML = `<div class="mv"><h2 id="evidenceTitle">상품 상세·가격 근거</h2><p role="alert">${mh(error.message)}</p><button class="mv-btn" id="mvOfferRetry">다시 불러오기</button></div>`;
    $('#mvOfferRetry').onclick = () => showMarketOffer(offerId, trigger);
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-market-offer]');
  if (button) showMarketOffer(button.dataset.marketOffer, button);
});


let marketCatalogTicket = 0;

async function marketCatalog() {
  const ticket = ++marketCatalogTicket, el = $('#catBody');
  const [, kind, ...parts] = location.hash.slice(1).split('/');
  const modelRoute = kind === 'gpu', providerRoute = kind === 'provider';
  marketPriceFrame('GPU·사업자 카탈로그', '가격과 구성, 계약 조건, 원천 확인 결과를 함께 살펴보세요.');
  el.innerHTML = '<div class="mv-note" role="status">등록 상품을 불러오는 중입니다.</div>';

  try {
    const id = decodeURIComponent(parts.join('/'));
    const [catalog, client] = await Promise.all([springMarketCatalog(), import('/static/spring-market-client.mjs')]);
    if (ticket !== marketCatalogTicket || state.view !== 'catalog') return;
    const model = modelRoute ? catalog.models.find(item => item.name === id) : null;
    const provider = providerRoute ? catalog.providers.find(item => item.id === id || item.name.toLowerCase() === id.toLowerCase()) : null;
    const filters = {
      ...(model ? {modelId: model.id} : {}),
      ...(provider ? {providerIds: provider.id} : {}),
      includeStale:'true',
    };
    const offers = (modelRoute && !model) || (providerRoute && !provider) ? [] : await client.fetchMarketOffers(api, filters);
    if (ticket !== marketCatalogTicket || state.view !== 'catalog') return;
    const rows = offers.map(client.mapMarketOffer);
    const providers = providerRoute ? (provider ? [provider] : []) : catalog.providers;
    let selectedProvider = provider?.id || 'ALL';
    if (model) {
      MV.model = model.name;
      $('#pageTitle').textContent = model.name + ' 상품 카탈로그';
    }

    function draw() {
      const query = MV.q.trim().toLowerCase();
      const filtered = rows.filter(row => (selectedProvider === 'ALL' || row.providerId === selectedProvider)
        && (!query || [row.configuration.sku, row.region, row.product, row.sourceName, row.provider].join(' ').toLowerCase().includes(query)));
      const pages = Math.max(1, Math.ceil(filtered.length / 24));
      MV.page = Math.min(MV.page, pages - 1);
      const display = filtered.slice(MV.page * 24, (MV.page + 1) * 24);
      const pricedProviders = new Set(filtered.filter(row => row.price != null).map(row => row.providerId));
      el.innerHTML = `<div class="mv"><div class="mv-cataloghero"><div><p class="mv-eyebrow">GPU / ${modelRoute ? model && catalog.models.indexOf(model) < 3 ? '주요 모델' : '참조 모델' : '상품 목록'}</p>
        <h1>${modelRoute ? mh(model?.name || id) : 'GPU 상품·가격 목록'}</h1><p>원본 가격과 상품 조건을 함께 확인하세요.</p>
        <div class="mv-actions"><a class="mv-btn primary" href="#dashboard/${MV.group}">사업자 비교 ↗</a><a class="mv-btn" href="#discounts">계약기간별 할인 ↗</a></div></div>
        <div class="mv-catalognumbers"><div><strong>${filtered.length}</strong><span>상품·지역·계약 조합</span></div><div><strong>${pricedProviders.size}</strong><span>숫자 단가 확보 사업자</span></div></div></div>
        ${!modelRoute ? `<div class="mv-modelnav">${catalog.models.map(({name}, i) => `<a href="#catalog/gpu/${encodeURIComponent(name)}"><small>${i<3?'메인':'참조'}</small>${mh(name)}</a>`).join('')}</div>` : ''}
        <div class="mv-toolbar"><label>사업자<select id="mvProvider">${providerRoute ? '' : '<option value="ALL">수집 사업자 전체</option>'}${providers.map(item => `<option value="${mh(item.id)}" ${selectedProvider===item.id?'selected':''}>${mh(item.name)}</option>`).join('') || (providerRoute ? '<option>등록 사업자 없음</option>' : '')}</select></label>
        <label class="grow">상품·리전 검색<input id="mvSearch" type="search" placeholder="예: p6-b300, koreasouth" value="${mh(MV.q)}"></label>
        <button class="mv-btn" id="mvCatalogCSV" ${filtered.length?'':'disabled'}>검색 결과 저장 ↓</button></div>
        <div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>사업자 / 상품 원문</th><th>계약 / 구성</th><th>지역</th><th>원본 반복 요금</th><th>실효 USD / GPU·시간</th><th>수집 상태 / 출처</th><th>전체 정보</th></tr></thead>
        <tbody>${display.map(row => `<tr><td><b>${mh(row.provider)}</b><span>${mv(row.product)}</span><small>${mh(row.model)} · 원문 ${mv(row.configuration.originalModelName)}</small></td>
          <td>${mh(MT[row.term] || row.contract || '미확인')}<span>${mv(row.configuration.systemType)} · ${mv(row.gpus)} GPU</span><small>${mv(marketPayment[row.contractInfo.paymentOption])}</small></td>
          <td>${mh(mr(row.region))}<span>${mv(row.country)}</span></td><td>${mh(marketHourly(row.hourlyComponent))}</td>
          <td><strong>${fxPrice(row.price)}</strong><span>${mh(marketCertainty[row.certainty] || '가격 미관측')}</span></td>
          <td><span class="mv-badge ${row.eligible?'good':''}">${mh(marketFreshness[row.freshness] || '미확인')}</span><span>${mh(marketDisclosure[row.disclosure] || '공개 여부 미확인')}</span><small>${mtime(row.collected)} · ${mv(row.sourceName)}</small></td>
          <td><button class="mv-btn" data-market-offer="${mh(row.id)}">상세·근거 ↗</button></td></tr>`).join('') || '<tr><td colspan="7"><div class="mv-empty"><h3>이번 수집 범위에서 가격을 확인하지 못했습니다.</h3><p>검색어를 지우거나 다른 모델·사업자를 선택해 주세요.</p></div></td></tr>'}</tbody></table></div>
        <div class="mv-pagination"><span>${filtered.length}개 중 ${filtered.length?MV.page*24+1:0}–${Math.min((MV.page+1)*24,filtered.length)}</span><button class="mv-btn" id="mvPrev" ${MV.page?'':'disabled'}>이전</button><b>${MV.page+1} / ${pages}</b><button class="mv-btn" id="mvNext" ${MV.page+1<pages?'':'disabled'}>다음</button></div>
        <div class="mv-note"><b>원본 요금과 실효 단가</b><p>반복 요금에 더해 선납금·원본 약정 기간·환산 규칙 등은 상품 상세에서 확인할 수 있습니다.</p></div>${springMarketFooter()}</div>`;
      $('#mvProvider').onchange = event => { selectedProvider = event.target.value; MV.page = 0; draw(); $('#mvProvider').focus(); };
      $('#mvSearch').oninput = event => {
        const pos = event.target.selectionStart;
        MV.q = event.target.value;
        MV.page = 0;
        draw();
        $('#mvSearch').focus();
        $('#mvSearch').setSelectionRange(pos, pos);
      };
      $('#mvPrev').onclick = () => { MV.page--; draw(); ($('#mvPrev').disabled ? $('#mvNext') : $('#mvPrev')).focus(); };
      $('#mvNext').onclick = () => { MV.page++; draw(); ($('#mvNext').disabled ? $('#mvPrev') : $('#mvNext')).focus(); };
      $('#mvCatalogCSV').onclick = () => exportMarketOffers('GPU_상품목록.csv', filtered);
      refreshKrw();
    }
    draw();
  } catch (error) {
    if (ticket === marketCatalogTicket && state.view === 'catalog') errBox(el, error);
  }
}
async function marketEvidence(id){const r=await api('/api/market/offer/'+encodeURIComponent(id));evidenceTrigger=document.activeElement;const item=(label,value)=>`<div><dt>${label}</dt><dd>${value}</dd></div>`;const sec=(n,title,items)=>`<section class="mv-detail-section"><h3><span>${n}</span>${title}</h3><dl>${items.map(([a,b])=>item(a,b)).join('')}</dl></section>`;
 const upfront=/all upfront/i.test(r.term_original||r.product_original||'')?'전액 선납 조건 · 선납 총액 미확인':r.upfront_amount==null?'금액 미확인 · 0원으로 간주하지 않음':mp(r.upfront_amount);
 const official=r.official_evidence.map(o=>`<div class="mv-evidence-match"><b>공식 ${mp(o.listed_price)} / ${mh(o.listed_unit)}</b><p>${mh(o.sku)} · ${mh(mr(o.region))} · ${MT[o.term]}</p><small>${mutc(o.observed_at)}</small>${mlink(o.source_url,'공식 원문')}</div>`).join('');
 const other=r.other_sources.map(o=>`<div class="mv-evidence-match"><b>${mh(o.source)} ${mp(o.normalized_price)} / GPU·시간</b><p>${mutc(o.observed_at)}</p>${mlink(o.source_page,'집계 출처')} · ${mlink(o.source_url,'원천 링크')}</div>`).join('');
 $('#evidenceBody').innerHTML=`<div class="mv"><p class="mv-eyebrow">상품 상세</p><h2 id="evidenceTitle">상품 구성과 가격 근거</h2><div class="mv-detailhero"><span>${r.provider} · ${mh(r.model)}</span><h3>${mh(r.product_original)}</h3><strong>${fxPrice(r.normalized_price)} <small>/ GPU·시간</small></strong><div>${mstamp(r)} <span class="mv-chip">${msource(r)}</span></div></div><div class="mv-note"><p>${mh(r.verification_note)}</p>${official}${other}</div>
 ${sec('01','수집 메타',[['집계 / 보완 출처',mlink(r.source_page,msource(r))],['원천 URL',mlink(r.source_url,r.source_url)],['원천 관측 시각 (UTC)',mutc(r.observed_at)],['한국 시각',mtime(r.observed_at)],['우리 파일 확보 시각 (UTC)',mutc(r.retrieved_at)],['원천 수집방법',r.source_method==='api'?'API':r.source_method==='html'?'공개 페이지 (HTML)':'출처 미제공'],['우리 수집 경로',r.origin==='aggregate'?'공개 JSON 파일 다운로드':'공식 자료 단발 수집']])}
 ${sec('02','상품 식별',[['사업자',r.provider],['상품명 원문',mv(r.product_original)],['SKU 원문',mv(r.sku)],['모델 (정규화)',mh(r.model)],['모델 원문',mv(r.model_original)],['제품 범위',mh(r.hardware_scope)]])}
 ${sec('03','가격 원본',[['수집 출처의 금액',mp(r.listed_price)],['통화',mh(r.currency)],['원본 과금 단위',mv(r.listed_unit)],['실제 상품 GPU 수',r.gpu_count==null?'미확인 · GPU당 요금과 별개':r.gpu_count+' GPU (출처 표기)'],['약정 원본의 범위',r.term_months?'출처가 이미 시간 단위로 제공한 약정 요금. 계약 총액 원문은 미확인.':'공개 시간당 요금']])}
 ${sec('04','계약 조건',[['계약 유형',MT[r.term]],['약정 기간',r.term_months?r.term_months+'개월':r.listed_price==null?'미확인':'기간 약정 해당 없음'],['계약 원문',mv(r.term_original)],['선납금 / 지불 방식',upfront],['최소 물량',r.minimum_gpus==null?'미확인 · 상품 GPU 수와 다름':r.minimum_gpus+' GPU'],['약정 계약 총액','미확인 · 시간 단가로 임의의 실견적을 만들지 않음']])}
 ${sec('05','상품 구성',[['vCPU',mv(r.vcpu)],['시스템 RAM',r.ram_gb==null?'미확인':mh(r.ram_gb)+' GB'],['스토리지',mv(r.storage)],['InfiniBand / NVLink 보장',r.interconnect?mh(r.interconnect):'미확인 · 모델명으로 보장 여부를 추정하지 않음'],['사양 적용 범위',r.gpu_count==null?'원문 요금 표기 기준 · 전체 VM 사양인지 추가 확인 필요':'수집 출처의 상품 구성 표기']])}
 ${sec('06','지역',[['리전 코드',mh(mr(r.region))],['국가',mv(r.country)],['미기재 해석','지역 미명시는 전 지역 동일 요금이라는 뜻이 아님']])}
 ${sec('07','가격 상태와 확인',[['가격 공개 상태',r.status],['로그인 필요 여부','수집에 사용한 출처는 공개 접근 · 실제 주문 과정은 미확인'],['가용성 / 재고',r.availability?mh(r.availability):'출처 미제공'],['마지막 출처 관측',mutc(r.observed_at)],['마지막 공식 확인',mutc(r.official_checked_at)],['수집 근거 상태',mh(r.verification)],['마지막 수집 처리 결과',mv(r.processing_status)],['현재 최신성',!r.observed_at?'관측 시각 미확인':Date.now()-new Date(r.observed_at)>48*3600000?'48시간 초과 관측 · 수집 시점 참고값':'관측 후 48시간 이내 · 실시간 견적 아님']])}
 ${sec('08','환산과 파생 단가',[['GPU당 시간 환산 단가',mp(r.normalized_price)],['명목 단가 (공개 시간요금)',r.nominal_price==null?'별도 명목 단가 미확인':mp(r.nominal_price)+' / GPU·시간'],['실효 단가 (정규화 결과)',r.effective_price==null?'별도 실효 단가 미산정':mp(r.effective_price)+' / GPU·시간 · 저장된 환산값'],['환산식',mh(r.formula)],['적용 환율','해당 없음 (USD → USD)'],['환율 기준일','해당 없음 · 외화 환산하지 않음'],['추가 비용','세금·스토리지·네트워크·지원의 포함 범위 미확인']])}
 <details class="mv-raw"><summary>ERD 저장 레코드 보기</summary><pre>${mh(JSON.stringify(r.raw_record,null,2))}</pre></details><div class="mv-actions"><button class="mv-btn" id="mvDetailExport">상품 정보 저장 ↓</button></div></div>`;
 $('#evidenceDialog').classList.add('mv-dialog');$('#evidenceDialog').showModal();$('#evidenceDialog').scrollTop=0;$('#mvDetailExport').onclick=()=>marketCSV([r],'상품상세');
}
function marketCSV(rows,name){const fields=['provider','model','product_original','sku','model_original','region','country','term','term_months','term_original','upfront_amount','minimum_gpus','gpu_count','vcpu','ram_gb','storage','interconnect','listed_price','currency','listed_unit','normalized_price','nominal_price','effective_price','source','source_url','source_method','observed_at','retrieved_at','official_checked_at','verification','status','formula'];const cell=x=>{let s=String(x??'');if(/^[=+@\-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};const csv=[fields,...rows.map(r=>fields.map(k=>r[k]))].map(row=>row.map(cell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`GPU_${name}_20261116.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function marketContracts(){await marketData();mframe('계약기간별 할인 비교','같은 SKU·지역·GPU 수의 온디맨드, 1년, 3년 요금을 비교합니다.');let el=$('#mvContracts');if(!el){el=document.createElement('div');el.id='mvContracts';$('#v-discounts').prepend(el)}document.body.classList.add('contract-v4');const groups=MarketLogic.contractGroups(MV.data.records.filter(r=>r.model===MV.model));const options=groups.filter(g=>g.provider_id===MV.contractProvider);const chosen=options.find(g=>g.key===MV.contractKey)||options[0];MV.contractKey=chosen?.key||'';const ts=chosen?.terms||{},od=ts.ON_DEMAND;const max=Math.max(...Object.values(ts).map(r=>r.normalized_price),1);const cards=['ON_DEMAND','1_YEAR','3_YEAR'].map((t,i)=>{const r=ts[t],off=MarketLogic.discount(od,r);return `<article class="mv-contractcard ${t==='3_YEAR'?'featured':''}"><span class="mv-chip">${i===0?'기준 요금':i===1?'12개월':'36개월'}</span><h3>${MT[t]}</h3><strong>${fxPrice(r?.normalized_price)}<small>/ GPU·시간</small></strong><div class="mv-bar"><i style="width:${r?r.normalized_price/max*100:0}%"></i></div><b class="mv-saving ${off==null?'is-missing':off<0?'is-increase':''}">${i===0?'할인 비교 기준':off==null?'할인율 계산 불가':off>=0?off.toFixed(1)+'% 절감':Math.abs(off).toFixed(1)+'% 높음'}</b><p>${r?mh(r.term_original||'기간 약정 없음'):'비교 가능한 동일 구성 요금을 확인하지 못했습니다.'}</p>${r?`<small>${msource(r)} · ${mtime(r.observed_at)}</small><button class="mv-btn" data-offer="${r.id}">계약 조건·근거 ↗</button>`:'<small>누락된 기간의 가격을 추정하지 않습니다.</small>'}</article>`}).join('');const extra=MarketLogic.discount(ts['1_YEAR'],ts['3_YEAR']);
 el.innerHTML=`<div class="mv"><section class="mv-controls">${mmodels()}<div class="mv-filterline"><label>사업자<select id="mvContractProvider">${Object.entries(MV.data.providers).map(([k,n])=>`<option value="${k}" ${k===MV.contractProvider?'selected':''}>${n}</option>`).join('')}</select></label><label class="grow">동일 구성 · 지역<select id="mvContractSKU">${options.map((g,i)=>`<option value="${i}" ${g.key===MV.contractKey?'selected':''}>${mh(g.sku)} · ${g.gpu_count} GPU · ${mh(mr(g.region))} · ${Object.keys(g.terms).length}개 요금</option>`).join('')||'<option>대응되는 상품 없음</option>'}</select></label></div></section><div class="mv-section-head"><div><h2>${MV.data.providers[MV.contractProvider]} · ${mh(MV.model)}</h2><p>${chosen?mh(chosen.sku)+' · '+mh(mr(chosen.region))+' · '+chosen.gpu_count+' GPU':'동일 구성의 비교 자료가 없습니다. GPU 수 미확인 상품은 제외합니다.'}</p></div><button class="mv-btn" id="mvContractCSV" ${chosen?'':'disabled'}>계약 비교 저장 ↓</button></div><div class="mv-contractgrid">${cards}</div><section class="sk-contract-chart" aria-label="계약기간별 시간당 단가 차트"><div class="sk-chart-heading"><div><h3>계약별 시간당 단가</h3><p>선택한 동일 상품의 공개 요금</p></div><span>USD / GPU·시간</span></div><div data-sk-contract-chart data-rows="${mh(JSON.stringify(['ON_DEMAND','1_YEAR','3_YEAR'].map(t=>({label:MT[t],price:ts[t]?.normalized_price??null,source:ts[t]?msource(ts[t]):'',observedAt:ts[t]?.observed_at||''}))))}"></div></section><div class="mv-extra"><div><small>1년에서 3년으로 약정하면</small><strong>${extra==null?'추가 절감 계산 보류':extra>=0?extra.toFixed(1)+'% 추가 절감':Math.abs(extra).toFixed(1)+'% 높음'}</strong></div><p>${extra==null?'양쪽 기간의 같은 구성 가격이 있어야 계산합니다.':`GPU당 시간 요금 차이 ${mp(Math.abs(ts['1_YEAR'].normalized_price-ts['3_YEAR'].normalized_price))}. 기준은 1년 요금입니다.`}</p></div><div class="mv-note"><b>단가 할인과 계약 조건을 함께 보세요.</b><p>동일 사업자·SKU·GPU 수·리전·GPU 변형·공개 CPU/RAM을 맞춥니다. Savings Plan / 예약 / 온디맨드는 구매 방식이 다르며, 전액 선납·최소 사용량·해지 조건을 별도로 확인해야 합니다. 시간 환산 요금으로 비교하며, 계약 총액이나 총비용 절감을 보장하지 않습니다.</p><p>온디맨드 대비 할인율 = (온디맨드 − 약정) ÷ 온디맨드 × 100. 추가 절감률 = (1년 − 3년) ÷ 1년 × 100. 가격이 같으면 0%, 더 비싸면 증가로 표시합니다.</p></div>${mfooter()}</div>`;
 mbind(el,marketContracts);$('#mvContractProvider').onchange=e=>{MV.contractProvider=e.target.value;MV.contractKey='';marketContracts()};$('#mvContractSKU').onchange=e=>{MV.contractKey=options[+e.target.value]?.key||'';marketContracts()};$('#mvContractCSV').onclick=()=>marketCSV(Object.values(ts),'계약기간비교');
}
RENDER.home=marketHome;RENDER.dashboard=marketDashboard;renderDash=marketDashboard;RENDER.discounts=marketContracts;RENDER.compare=()=>{location.hash='#dashboard/'+MV.group};
READABLE_PAGES.dashboard=['MARKET COMPARISON','시장별 GPU 가격 비교','GPU 인스턴스 클라우드 · GPU 전문 클라우드'];READABLE_PAGES.discounts=['COMMITMENT EXPLORER','계약기간별 할인 비교','동일 구성의 온디맨드·1년·3년 공개 요금 비교'];
for(const item of PORTAL_ROUTES){if(item[0]==='dashboard'){item[1]='시장별 GPU 가격 비교';item[2]='GPU 인스턴스 클라우드 · GPU 전문 클라우드';}if(item[0]==='discounts'){item[1]='계약기간별 할인 비교';item[2]='온디맨드 · 1년 · 3년 단가와 할인율'}}

PAGES.discounts.tools=false;
// Keep the original cat.js/catalog-list.js catalogue routes and toolbar unchanged.
const priorMarketEvidence=showEvidence;showEvidence=(r,m)=>r?.calculation_trace?.market_id?marketEvidence(r.calculation_trace.market_id):priorMarketEvidence(r,m);
