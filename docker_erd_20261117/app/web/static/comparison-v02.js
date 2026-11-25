/* v0.2 comparison uses the server's shared rule output; no missing facts inferred. */
const CP={model:'B300',mode:'reference',type:'ALL',provider:'ALL',country:'ALL',region:'ALL',query:'',term:'on_demand',months:'ALL',generation:'ALL',confidential:false,page:0,group:'',sort:'price'};
const cpTerm={on_demand:'온디맨드',spot:'스팟',commitment:'장기약정'};
const cpModes={strict:'동일 조건',region_excluded:'지역 제외',reference:'참고 비교'};
const cpCountryLabel=code=>{try{const name=new Intl.DisplayNames(['ko'],{type:'region'}).of(code);return name===code?code:`${name} (${code})`;}catch{return code;}};
const cpVal=x=>x==null||x===''||x==='unknown'?'미확인':mh(x);
function cpPriceOrder(a,b,descending){
 const valid=x=>x!=null&&String(x).trim()!==''&&Number.isFinite(Number(x));
 if(!valid(a))return valid(b)?1:0;
 if(!valid(b))return -1;
 return (Number(a)-Number(b))*(descending?-1:1);
}
function cpSelect(id,label,values,value){return `<label>${label}<select id="${id}">${values.map(([k,v])=>`<option value="${mh(k)}" ${k===value?'selected':''}>${mh(v)}</option>`).join('')}</select></label>`;}
function cpCounts(rows){return [['상품','product_id'],['오퍼','offer_id'],['사업자','provider_id'],['관측','observation_id']].map(([label,key])=>`${label} <b>${new Set(rows.map(r=>r[key]).filter(value => value != null)).size}</b>`).join(' · ');}
function cpConditions(c){const labels={model_name:'모델',service_option:'서비스',system_type:'시스템',gpu_count:'GPU 수',intra_node_interconnect:'내부 연결',country_code:'국가',contract_type:'계약',contract_product_type:'계약 상품',commitment_months:'개월',payment_option:'선납'};return Object.entries(c).map(([k,v])=>`${labels[k]||k} ${v}`).join(' · ');}
PAGES.compare.tools=false;
let cpRequest = 0, cpLegacyPending;

function cpSpringRows(rawOffers, model, client) {
  return rawOffers.map(raw => {
    const row = client.mapMarketOffer(raw), p = row.configuration, c = row.contractInfo;
    return {
      model_name: row.model, provider_name: row.provider, provider_id: row.providerId,
      provider_type: {GENERAL_CLOUD:'hyperscaler', GPU_SPECIALIST:'neocloud'}[row.providerType] || 'unknown',
      generation: model?.generation, original_product_name: row.product, product_id: row.productId, offer_id: row.id,
      region_code: row.region, country_code: row.country, gpu_count: row.gpus, system_type: p.systemType?.toLowerCase(),
      service_option: p.serviceOption?.toLowerCase(), intra_node_interconnect: p.intraNodeInterconnect,
      vcpu_count: p.vcpuCount, ram_gb: p.ramGb, vram_gb_per_gpu: p.vramGbPerGpu, storage_description: p.storageDescription,
      inter_node_network: p.interNodeNetwork, contract_product_type: row.contract, contract_type: c.type?.toLowerCase(),
      commitment_months: c.months, payment_option: marketPayment[c.paymentOption], display_price: row.price,
      collected_at: row.collected, price_certainty: marketCertainty[row.certainty],
      result_status: row.price != null ? '환산 성공' : '환산 불가', observation_id: raw.lastSuccessfulObservation?.observationId,
      source_url: row.source, spring: true, group: row.group, eligible: row.eligible,
      comparison_reasons: {strict: row.excludedReasons.map(reason => marketExclusions[reason] || reason)},
    };
  });
}

function cpStrictFilters(catalog, model, selection = CP) {
  const S = selection;
  const provider = catalog.providers.find(item => item.name === S.provider);
  if (!model || (S.provider !== 'ALL' && !provider)
    || S.months === 'UNKNOWN' || (S.months === '0' && S.term === 'commitment')
    || (S.generation === 'UNKNOWN' && !!model.generation)
    || (!['ALL','UNKNOWN'].includes(S.generation) && model.generation !== S.generation)) return null;
  return {
    modelId: model.id,
    ...(S.term !== 'ALL' ? {contractType: S.term.toUpperCase()} : {}),
    ...(/^\d+$/.test(S.months) && S.months !== '0' ? {commitmentMonths: S.months} : {}),
    ...(provider ? {providerIds: provider.id} : {}),
    ...(S.region !== 'ALL' ? {regionCode: S.region} : {}),
    ...(S.country !== 'ALL' ? {countryCode: S.country} : {}),
    ...(S.type !== 'ALL' ? {providerType: S.type === 'hyperscaler' ? 'GENERAL_CLOUD' : 'GPU_SPECIALIST'} : {}),
    ...(!S.confidential ? {serviceOption: 'STANDARD'} : {}),
  };
}

const defaultComparisonSelection = CP;
async function renderGpuComparison(options = {}) {
 const CP = options.selection || defaultComparisonSelection;
 const embedded = Boolean(options.host);
 const el = options.host || $('#v-compare');
 const isActive = options.isActive || (() => state.view === 'compare');
 const rerender = () => renderGpuComparison(options);
 const onSelectionChange = options.onChange;
 const ticket = ++cpRequest;
 let legacy = CP.mode === 'region_excluded', strict = CP.mode === 'strict';
 const focusId = el.contains(document.activeElement) ? document.activeElement.id : '';
 const focusMode = el.contains(document.activeElement) ? document.activeElement.dataset.cpMode : '';
 el.querySelector(':scope > .cp-page')?.setAttribute('inert', '');
 el.setAttribute('aria-busy', 'true');
 if (!embedded) marketPriceFrame('조건별 가격 비교', '비교 조건과 가격 표본을 확인합니다.');
 let catalog, data, summary, client, legacyUnavailable = false;
 try {
   [catalog, client] = await Promise.all([springMarketCatalog(), import('/static/spring-market-client.mjs')]);
   if (ticket !== cpRequest || !isActive()) return;
   const deepLink = location.hash.slice(1).split('/').slice(1).join('/');
   if (!embedded && deepLink && RENDER.compare.appliedLink !== deepLink) {
     const [encodedModel, query = ''] = deepLink.split('?');
     let linked = ''; try { linked = decodeURIComponent(encodedModel); } catch {}
     if (catalog.models.some(item => item.name === linked)) {
       const params = new URLSearchParams(query), provider = params.get('provider'), term = params.get('term');
       Object.assign(CP, {model:linked, mode:'reference', provider:catalog.providers.some(item => item.name === provider) ? provider : 'ALL', term:Object.hasOwn(cpTerm, term) ? term : 'on_demand', country:'ALL', region:'ALL', months:'ALL', query:'', type:'ALL', generation:'ALL', confidential:false, page:0, group:''});
     }
     RENDER.compare.appliedLink = deepLink;
   }
   const model = catalog.models.find(item => item.name === CP.model);
   legacy = CP.mode === 'region_excluded'; strict = CP.mode === 'strict';
   if (legacy) {
     if (!cpLegacyPending) cpLegacyPending = api('/api/erd/comparison').catch(error => { cpLegacyPending = null; throw error; });
     data = await cpLegacyPending.catch(() => null);
     legacyUnavailable = !data;
     data ||= {candidates:[]};
   } else {
     const filters = strict ? cpStrictFilters(catalog, model, CP) : null;
     const [items, result] = await Promise.all([
       model ? client.fetchMarketOffers(api, {modelId:model.id, includeStale:'true'}) : [],
       filters ? client.fetchMarketSummary(api, filters).catch(() => null) : {groups:[], excludedSummary:{}},
     ]);
     data = {candidates: cpSpringRows(items, model, client)};
     summary = result;
   }
 } catch (error) {
   if (ticket !== cpRequest || !isActive()) return;
   el.removeAttribute('aria-busy');
   errBox(el, error);
   return;
 }
 if (ticket !== cpRequest || !isActive()) return;
 el.removeAttribute('aria-busy');
 function draw(restoreId = '', restoreMode = ''){
  const active = document.activeElement;
  const focusId = restoreId || (el.contains(active) ? active.id : '');
  const focusMode = restoreMode || (el.contains(active) ? active.dataset.cpMode : '');
  const focusModel = el.contains(active) ? active.dataset.cpModel : '';
  const openDetails = new Set([...el.querySelectorAll('details[id][open]')].map(d=>d.id));
  const query = CP.query.trim().toLowerCase();
  const matchesQuery = row => !query || `${row.provider_name} ${row.original_product_name} ${row.region_code} ${row.contract_product_type}`.toLowerCase().includes(query);
  const scoped = data.candidates.filter(r=>r.model_name===CP.model&&(CP.region==='ALL'||r.region_code===CP.region)&&(CP.term==='ALL'||r.contract_type===CP.term)&&(CP.months==='ALL'||String(r.commitment_months??(r.contract_type==='commitment'?'UNKNOWN':0))===CP.months)&&(CP.provider==='ALL'||r.provider_name===CP.provider)&&(CP.country==='ALL'||r.country_code===CP.country)&&(CP.generation==='ALL'||(CP.generation==='UNKNOWN'?!r.generation:r.generation===CP.generation))&&(CP.type==='ALL'||r.provider_type===CP.type)&&(CP.confidential||r.service_option!=='confidential'));
  const rows = scoped.filter(matchesQuery);
  const groups = strict ? (summary?.groups || []).map(group => ({...group, id:client.marketGroupId(group.groupKey), description:marketGroupConditions(group.groupKey)}))
    : legacy ? GpuComparison.groups(data, rows.map(row => row.observation_id), CP.mode).map(group => ({...group, id:JSON.stringify(group.conditions), description:cpConditions(group.conditions)}))
    : [];
  const chosen = groups.find(group => group.id === CP.group) || groups[0];
  CP.group = chosen?.id || '';
  const shown = [...(strict ? rows.filter(row => row.eligible && chosen?.id === row.group)
    : legacy ? (chosen?.rows || []) : rows)].sort((a,b)=>CP.sort==='latest'?Date.parse(b.collected_at)-Date.parse(a.collected_at):CP.sort==='provider'?String(a.provider_name).localeCompare(String(b.provider_name)):cpPriceOrder(a.display_price,b.display_price,CP.sort==='price_desc'));
  const pages = Math.max(1, Math.ceil(shown.length/20));
  CP.page = Math.min(CP.page, pages-1);
  const {representatives:reps, values:stats} = legacy ? GpuComparison.stats(shown) : {};
  const mode = legacy ? 'region_excluded' : 'strict';
  const excluded = rows.filter(row => row.comparison_reasons[mode].length), reasons = new Map();
  excluded.forEach(row => row.comparison_reasons[mode].forEach(reason => reasons.set(reason, (reasons.get(reason)||0)+1)));
  const options = values => [['ALL','전체'], ...[...new Set(values.filter(Boolean))].sort().map(value => [value,value])];
  const modelNames = catalog.models.map(item => item.name);
  const modelOrder = [...new Set(['B300','GB300','VR200',...modelNames])].filter(name => modelNames.includes(name));
  const modelProviders = [...new Set(data.candidates.map(r=>r.provider_name).filter(Boolean))];
  const modelOffers = new Set(data.candidates.map(r=>r.offer_id)).size;
  const recent = data.candidates.reduce((t,r)=>Math.max(t,Date.parse(r.collected_at)||0),0);
  const allStale = data.candidates.length>0 && data.candidates.every(r=>r.is_stale);
  const extraCount = [CP.months,CP.region,CP.type,CP.generation].filter(x=>x!=='ALL').length+Number(CP.confidential);
  const modeNote = CP.mode==='reference'?'구성·계약이 다르거나 미확인인 참고 가격입니다. 최저·중앙·최고 집계에서 제외합니다.':CP.mode==='strict'?'백엔드가 동일 리전·상품 구성·계약으로 판정한 최신 표본만 집계합니다. 상품 검색어는 아래 표에 적용됩니다.':'국가를 제외한 계약·GPU 구성 등 나머지 조건이 같은 상품만 비교합니다.';
  const summaryHtml = strict ? marketSummaryContent(summary, chosen) + (summary ? '' : '<button class="mv-btn" id="cpSummaryRetry">요약 다시 조회</button>')
    : legacy ? (legacyUnavailable ? '<p role="status">지역 제외 비교는 별도 보관 자료를 사용합니다. 보관 자료에 연결하지 못했습니다.</p>' : stats?`<div class="v02-results">${['최저','중앙값','최고'].map((x,i)=>`<div>사업자 대표가격 ${x}<strong>${fxPrice(stats[i])}</strong></div>`).join('')}</div><p>${reps.length===1?'<b>단일 사업자</b> · 사업자 간 시장 분포가 아닙니다.':''} ${mh(data.representative_policy)}. 단위 USD / GPU·시간.</p><details><summary>오퍼 단위 집계 ${shown.length}개 확인</summary><p>${cpOfferStats(shown)}</p></details>`:'<p class="v02-warning"><b>집계 가능한 동일 조건 표본이 없습니다.</b> 미확인 조건을 임의로 같다고 처리하지 않습니다. 참고 비교에서 확보된 가격과 제외 사유를 확인하세요.</p>')
    : '';

  el.innerHTML=`<div class="mv cp-page ${embedded?'gx-detail-prices':''}">
   ${!embedded?`<header class="cp-hero"><p class="cp-eyebrow">GPU 시세 인덱스</p><h1>클라우드 GPU <em>가격 비교</em></h1><p>GPU 모델과 계약 조건별 공개 요금을 비교합니다.</p></header>
   <section class="cp-overview" aria-label="전체 수집 현황">
    <div><span>조사 대상 GPU</span><strong>${modelNames.length}<small>개 모델</small></strong><p>사업자 ${catalog.providers.length}곳 · 리전 ${catalog.regions.length}곳</p></div>
    <div><span>${mh(CP.model)} 가격 사업자</span><strong>${modelProviders.length}<small>개 사업자</small></strong><p>${mh(modelProviders.join(' · '))||'확보된 사업자 없음'}</p></div>
    <div><span>${mh(CP.model)} 가격 오퍼</span><strong>${modelOffers.toLocaleString('ko-KR')}<small>개</small></strong><p>온디맨드 · 스팟 · 장기약정</p></div>
    <div class="cp-freshness"><span>최근 가격 수집 · KST</span><strong>${recent?mh(new Date(recent).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})):'미확보'}</strong><p>${allStale?'48시간 초과 · 과거 참고 자료':'자동 갱신되지 않는 수집 자료'}</p></div>
   </section>`:''}
   <section class="cp-explorer" aria-labelledby="cpExplorerTitle">
    ${embedded?'<div class="cp-explorer-head"><h2 id="cpExplorerTitle">상품 조건</h2><button type="button" class="cp-reset" id="cpReset">필터 초기화</button></div>':`<div class="cp-explorer-head"><h2 id="cpExplorerTitle">GPU 모델</h2><a href="#catalog/gpu/${encodeURIComponent(CP.model)}">${mh(CP.model)} 모델 상세</a></div>
    <div class="cp-model-tabs" role="group" aria-label="GPU 모델 선택">${modelOrder.map(m=>`<button type="button" data-cp-model="${mh(m)}" aria-pressed="${CP.model===m}"><img src="/static/icons/nvidia.svg" alt=""><b>${mh(m)}</b><span>${m===CP.model?new Set(data.candidates.filter(r=>r.contract_type===CP.term).map(r=>r.offer_id)).size+' 오퍼':'선택'}</span></button>`).join('')}</div>`}
    <div class="cp-filterbar"><label class="cp-search"><span>상품 검색</span><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input id="cpSearch" type="search" value="${mh(CP.query)}" placeholder="사업자, 상품, 리전 검색"></div></label>${cpSelect('cpTerm','계약 유형',Object.entries(cpTerm),CP.term)}${cpSelect('cpProvider','사업자',[['ALL','모든 사업자'],...catalog.providers.map(({name})=>[name,name])],CP.provider)}${cpSelect('cpCountry','국가',options(embedded?data.candidates.filter(row=>row.model_name===CP.model).map(row=>row.country_code):catalog.regions.map(region => region.countryCode)).map(([code,label])=>[code,code==='ALL'?label:cpCountryLabel(code)]),CP.country)}${embedded?cpSelect('cpRegion','리전',options(data.candidates.filter(r=>r.model_name===CP.model&&(CP.country==='ALL'||r.country_code===CP.country)).map(r=>r.region_code)),CP.region):''}${cpSelect('cpSort','정렬',[['price','낮은 가격순'],['price_desc','높은 가격순'],['latest','최근 수집순'],['provider','사업자순']],CP.sort)}</div>
    <details class="cp-advanced" id="cpAdvanced" ${openDetails.has('cpAdvanced')?'open':''}><summary>상세 필터·비교 기준${extraCount?` <b>${extraCount}</b>`:''}</summary><div class="cp-advanced-grid">${cpSelect('cpMonths','약정기간',[['ALL','전체'],['0','기간 약정 없음'],['12','1년'],['36','3년'],['UNKNOWN','기간 미확인']],CP.months)}${!embedded?cpSelect('cpRegion','리전',options(catalog.regions.map(region => region.regionCode)),CP.region):''}${cpSelect('cpType','사업자 유형',[['ALL','전체'],['hyperscaler','종합 클라우드'],['neocloud','GPU 특화']],CP.type)}${cpSelect('cpGeneration','세대',[...options(catalog.generations),['UNKNOWN','세대 미확인']],CP.generation)}<label class="cp-check"><input id="cpConfidential" type="checkbox" ${CP.confidential?'checked':''}> 기밀 컴퓨팅 상품 포함 · 별도 조건 집단으로 비교</label></div>${embedded?`<div class="cp-modebar"><div class="cp-modes" role="group" aria-label="비교 방식">${Object.entries(cpModes).map(([k,v])=>`<button type="button" class="mv-btn ${CP.mode===k?'primary':''}" data-cp-mode="${k}" aria-pressed="${CP.mode===k}">${embedded&&k==='reference'?'전체 상품':v}</button>`).join('')}</div></div>`:''}</details>
    ${!embedded?`<div class="cp-modebar"><div class="cp-modes" role="group" aria-label="비교 방식">${Object.entries(cpModes).map(([k,v])=>`<button type="button" class="mv-btn ${CP.mode===k?'primary':''}" data-cp-mode="${k}" aria-pressed="${CP.mode===k}">${v}</button>`).join('')}</div><button type="button" class="cp-reset" id="cpReset">필터 초기화</button></div>`:''}
   </section>
   <section class="cp-context" aria-label="비교 기준"><p><b>${embedded&&CP.mode==='reference'?'가격 안내':cpModes[CP.mode]}</b>${modeNote}</p><details id="cpMethod" ${openDetails.has('cpMethod')?'open':''}><summary>비교 기준·제외 사유</summary><div class="cp-method-body">${data.standard_configuration?`<p>${mh(data.standard_configuration)} · 판정 ${mtime(data.assessed_at)}</p>`:''}<p>최신 비교에서 제외되는 사유가 있어도 원본 가격과 이력은 보존합니다.</p>${reasons.size?`<p><b>집계 제외 ${excluded.length}개 오퍼</b> · 한 오퍼에 여러 사유가 있을 수 있습니다.</p><ul>${[...reasons].map(([k,v])=>`<li>${mh(k)} <b>${v}개</b></li>`).join('')}</ul>`:'<p>현재 필터에 해당하는 집계 제외 사유가 없습니다.</p>'}</div></details></section>
   ${CP.mode!=='reference'?`<section class="cp-summary" aria-live="polite">${groups.length?`<label>비교 조건 집단<select id="cpGroup">${groups.map((g,i)=>`<option value="${i}" ${g===chosen?'selected':''}>${mh(g.description)}</option>`).join('')}</select></label>`:''}${summaryHtml}</section>`:''}
   <section class="cp-results" aria-labelledby="cpResultsTitle"><div class="cp-results-head"><div><h2 id="cpResultsTitle">${mh(CP.model)} <span>가격 목록</span><small>${shown.length}</small></h2><p aria-live="polite">${cpCounts(shown)} <span class="cp-unit">USD / GPU·시간</span></p></div><button class="mv-btn" id="cpCSV">CSV 다운로드</button></div>
   <div class="mv-tablebox" tabindex="0" role="region" aria-label="가격 비교 표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><caption class="cp-sr">${mh(CP.model)} ${cpModes[CP.mode]} 가격과 상품 조건</caption><thead><tr><th scope="col">GPU / 상품 구성</th><th scope="col">사업자</th><th scope="col">국가 / 리전</th><th scope="col">계약 조건</th><th scope="col">시간당 가격 <small>USD / GPU</small></th><th scope="col">가격 근거</th></tr></thead><tbody>${shown.slice(CP.page*20,(CP.page+1)*20).map(r=>`<tr><td><div class="cp-product"><img src="/static/icons/nvidia.svg" alt="NVIDIA"><div><b>${mh(r.model_name)}</b><span>${mh(r.original_product_name)}</span></div></div><div class="cp-spec">${cpVal(r.gpu_count)} GPU · ${cpVal(r.system_type)}${r.vram_gb_per_gpu?' · '+Number(r.vram_gb_per_gpu).toLocaleString('ko-KR',{maximumFractionDigits:1})+' GB/GPU':''}</div><details class="cp-spec-details"><summary>상세 구성</summary><p>서비스 ${cpVal(r.service_option)} / 내부 연결 ${cpVal(r.intra_node_interconnect)}<br>vCPU ${cpVal(r.vcpu_count)} / RAM ${cpVal(r.ram_gb)} GB<br>스토리지 ${cpVal(r.storage_description)}<br>노드 간 네트워크 ${cpVal(r.inter_node_network)}</p></details></td><td><b class="cp-provider">${mh(r.provider_name)}</b><span>${r.provider_type==='hyperscaler'?'종합 클라우드':r.provider_type==='neocloud'?'GPU 특화':'유형 미확인'}</span></td><td><b>${cpVal(r.country_code)}</b><span>${cpVal(r.region_code)}</span></td><td><b>${cpVal(cpTerm[r.contract_type]||r.contract_product_type)}</b><span>${r.contract_type==='on_demand'||r.contract_type==='spot'?'기간 약정 없음':(r.commitment_months??'미확인')+'개월'}</span><span>선납 ${cpVal(r.payment_option)}</span></td><td class="cp-price"><strong>${fxPrice(r.display_price)}</strong><span class="cp-price-meta">${({firm:'확정가',starting:'시작가',range:'범위가',estimated:'추정가'}[r.price_certainty])||mh(r.price_certainty)} · ${({success:'환산 성공',assumption:'가정 환산'}[r.result_status])||mh(r.result_status)}</span></td><td class="cp-evidence"><span class="cp-status ${r.is_stale?'is-stale':''}">${r.is_stale?'48시간 초과':'수집 자료'}</span><span>${mtime(r.collected_at)}</span><button class="mv-btn" ${r.spring?`data-market-offer="${mh(r.offer_id)}"`:`data-observation="${mh(r.observation_id)}"`}>상세·근거</button>${r.comparison_reasons[CP.mode==='region_excluded'?'region_excluded':'strict'].length?`<details><summary>집계 제외 사유</summary><ul>${r.comparison_reasons[CP.mode==='region_excluded'?'region_excluded':'strict'].map(x=>`<li>${mh(x)}</li>`).join('')}</ul></details>`:'<span>조건 확인됨</span>'}</td></tr>`).join('')||'<tr><td colspan="6"><div class="cp-empty"><strong>선택한 조건의 가격이 아직 없습니다.</strong><p>필터를 변경하거나 다른 GPU 모델을 선택해 보세요.<br>미수집·미확보는 0원 또는 미판매를 뜻하지 않습니다.</p><button type="button" class="mv-btn" id="cpShowReference">참고 비교 · 기본 조건으로 보기</button></div></td></tr>'}</tbody></table></div>
   <div class="cp-pager"><button class="mv-btn" id="cpPrevious" ${CP.page===0?'disabled':''}>이전</button><span>${CP.page+1} / ${pages}</span><button class="mv-btn" id="cpNext" ${CP.page+1===pages?'disabled':''}>다음</button></div></section>${springMarketFooter()}</div>`;
  el.querySelectorAll('[data-cp-mode]').forEach(b=>b.onclick=()=>{CP.mode=b.dataset.cpMode;CP.page=0;rerender();});
  for(const [id,key] of [['cpTerm','term'],['cpMonths','months'],['cpProvider','provider'],['cpCountry','country'],['cpRegion','region'],['cpType','type'],['cpGeneration','generation']])$('#'+id).onchange=e=>{CP[key]=e.target.value;if(key==='country')CP.region='ALL';CP.page=0;rerender();};
  $('#cpSort').onchange=e=>{CP.sort=e.target.value;CP.page=0;draw();};
  el.querySelectorAll('[data-cp-model]').forEach(b=>b.onclick=()=>{CP.model=b.dataset.cpModel;CP.page=0;CP.group='';rerender();});
  function resetFilters(){Object.assign(CP,{mode:'reference',term:'on_demand',months:'ALL',provider:'ALL',country:'ALL',region:'ALL',query:'',type:'ALL',generation:'ALL',confidential:false,page:0,group:'',sort:'price'});rerender();}
  $('#cpReset').onclick=resetFilters;
  if($('#cpShowReference'))$('#cpShowReference').onclick=resetFilters;
  $('#cpSearch').oninput=e=>{const start=e.target.selectionStart;CP.query=e.target.value;CP.page=0;draw();$('#cpSearch').setSelectionRange(start,start);};
  $('#cpConfidential').onchange=e=>{CP.confidential=e.target.checked;CP.page=0;rerender();};
  $('#cpSummaryRetry')?.addEventListener('click', rerender);
  if($('#cpGroup'))$('#cpGroup').onchange=e=>{CP.group=groups[+e.target.value].id;CP.page=0;draw();};
  $('#cpPrevious').onclick=()=>{CP.page--;draw();};$('#cpNext').onclick=()=>{CP.page++;draw();};
  $('#cpCSV').onclick=()=>downloadCSV('GPU_condition_comparison.csv',['관측ID','상품ID','오퍼ID','사업자','모델','국가','리전','계약','약정개월','선납','실효USD_GPU시간','수집UTC','비교방식','제외사유','출처'],shown.map(r=>[r.observation_id,r.product_id,r.offer_id,r.provider_name,r.model_name,r.country_code,r.region_code,r.contract_product_type,r.commitment_months,r.payment_option,r.display_price,r.collected_at,cpModes[CP.mode],r.comparison_reasons[CP.mode==='region_excluded'?'region_excluded':'strict'].join('; '),r.source_url]));
  if(!embedded && window.renderComparisonPriceChart)window.renderComparisonPriceChart(el,shown,CP);
  refreshKrw();
  onSelectionChange?.(CP, shown);
  const focusTarget = focusId ? document.getElementById(focusId) : focusMode ? el.querySelector(`[data-cp-mode="${focusMode}"]`) : focusModel ? [...el.querySelectorAll('[data-cp-model]')].find(b=>b.dataset.cpModel===focusModel) : null;
  if (focusTarget && !focusTarget.disabled) focusTarget.focus({preventScroll:true});
 }
 draw(focusId, focusMode);
}
RENDER.compare=()=>renderGpuComparison();
function cpOfferStats(rows){const v=rows.map(r=>r.display_price).sort((a,b)=>a-b),i=Math.floor(v.length/2);return v.length?`최저 ${mp(v[0])} · 중앙 ${mp(v.length%2?v[i]:(v[i-1]+v[i])/2)} · 최고 ${mp(v.at(-1))} / GPU·시간. 반복 관측은 중복 집계하지 않습니다.`:'표본 없음';}
// Scope the catalog layout to this route; preserve every other workspace.
function cpRoute(){const active=location.hash.slice(1).split('/')[0]==='compare';document.body.classList.toggle('compare-catalog',active);if(!active)RENDER.compare.appliedLink=null;}
window.addEventListener('hashchange',cpRoute);cpRoute();
