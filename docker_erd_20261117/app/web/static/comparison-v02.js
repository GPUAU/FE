/* v0.2 comparison uses the server's shared rule output; no missing facts inferred. */
const CP={model:'B300',mode:'reference',type:'ALL',provider:'ALL',country:'ALL',region:'ALL',query:'',term:'on_demand',months:'ALL',generation:'ALL',confidential:false,page:0,group:''};
const cpTerm={on_demand:'온디맨드',spot:'스팟',commitment:'장기약정'};
const cpModes={strict:'동일 조건',region_excluded:'지역 제외',reference:'참고 비교'};
const cpVal=x=>x==null||x===''||x==='unknown'?'미확인':mh(x);
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

function cpStrictFilters(catalog, model) {
  const provider = catalog.providers.find(item => item.name === CP.provider);
  if (!model || (CP.provider !== 'ALL' && !provider)
    || CP.months === 'UNKNOWN' || (CP.months === '0' && CP.term === 'commitment')
    || (CP.generation === 'UNKNOWN' && !!model.generation)
    || (!['ALL','UNKNOWN'].includes(CP.generation) && model.generation !== CP.generation)) return null;
  return {
    modelId: model.id,
    ...(CP.term !== 'ALL' ? {contractType: CP.term.toUpperCase()} : {}),
    ...(/^\d+$/.test(CP.months) && CP.months !== '0' ? {commitmentMonths: CP.months} : {}),
    ...(provider ? {providerIds: provider.id} : {}),
    ...(CP.region !== 'ALL' ? {regionCode: CP.region} : {}),
    ...(CP.country !== 'ALL' ? {countryCode: CP.country} : {}),
    ...(CP.type !== 'ALL' ? {providerType: CP.type === 'hyperscaler' ? 'GENERAL_CLOUD' : 'GPU_SPECIALIST'} : {}),
    ...(!CP.confidential ? {serviceOption: 'STANDARD'} : {}),
  };
}

RENDER.compare=async()=>{
 const ticket = ++cpRequest, el = $('#v-compare'), legacy = CP.mode === 'region_excluded', strict = CP.mode === 'strict';
 const focusId = el.contains(document.activeElement) ? document.activeElement.id : '';
 const focusMode = el.contains(document.activeElement) ? document.activeElement.dataset.cpMode : '';
 el.querySelector(':scope > .cp-page')?.setAttribute('inert', '');
 el.setAttribute('aria-busy', 'true');
 marketPriceFrame('조건별 가격 비교', '비교 조건과 가격 표본을 확인합니다.');
 let catalog, data, summary, client, legacyUnavailable = false;
 try {
   [catalog, client] = await Promise.all([springMarketCatalog(), import('/static/spring-market-client.mjs')]);
   if (ticket !== cpRequest || state.view !== 'compare') return;
   const model = catalog.models.find(item => item.name === CP.model);
   if (legacy) {
     if (!cpLegacyPending) cpLegacyPending = api('/api/erd/comparison').catch(error => { cpLegacyPending = null; throw error; });
     data = await cpLegacyPending.catch(() => null);
     legacyUnavailable = !data;
     data ||= {candidates:[]};
   } else {
     const filters = strict ? cpStrictFilters(catalog, model) : null;
     const [items, result] = await Promise.all([
       model ? client.fetchMarketOffers(api, {modelId:model.id, includeStale:'true'}) : [],
       filters ? client.fetchMarketSummary(api, filters).catch(() => null) : {groups:[], excludedSummary:{}},
     ]);
     data = {candidates: cpSpringRows(items, model, client)};
     summary = result;
   }
 } catch (error) {
   if (ticket !== cpRequest || state.view !== 'compare') return;
   el.removeAttribute('aria-busy');
   errBox(el, error);
   return;
 }
 if (ticket !== cpRequest || state.view !== 'compare') return;
 el.removeAttribute('aria-busy');
 function draw(restoreId = '', restoreMode = ''){
  const active = document.activeElement;
  const focusId = restoreId || (el.contains(active) ? active.id : '');
  const focusMode = restoreMode || (el.contains(active) ? active.dataset.cpMode : '');
  const query = CP.query.trim().toLowerCase();
  const matchesQuery = row => !query || `${row.provider_name} ${row.original_product_name} ${row.region_code} ${row.contract_product_type}`.toLowerCase().includes(query);
  const scoped = data.candidates.filter(r=>r.model_name===CP.model&&(CP.region==='ALL'||r.region_code===CP.region)&&(CP.term==='ALL'||r.contract_type===CP.term)&&(CP.months==='ALL'||String(r.commitment_months??(r.contract_type==='commitment'?'UNKNOWN':0))===CP.months)&&(CP.provider==='ALL'||r.provider_name===CP.provider)&&(CP.country==='ALL'||r.country_code===CP.country)&&(CP.generation==='ALL'||(CP.generation==='UNKNOWN'?!r.generation:r.generation===CP.generation))&&(CP.type==='ALL'||r.provider_type===CP.type)&&(CP.confidential||r.service_option!=='confidential'));
  const rows = scoped.filter(matchesQuery);
  const groups = strict ? (summary?.groups || []).map(group => ({...group, id:client.marketGroupId(group.groupKey), description:marketGroupConditions(group.groupKey)}))
    : legacy ? GpuComparison.groups(data, rows.map(row => row.observation_id), CP.mode).map(group => ({...group, id:JSON.stringify(group.conditions), description:cpConditions(group.conditions)}))
    : [];
  const chosen = groups.find(group => group.id === CP.group) || groups[0];
  CP.group = chosen?.id || '';
  const shown = strict ? rows.filter(row => row.eligible && chosen?.id === row.group)
    : legacy ? (chosen?.rows || []) : rows;
  const pages = Math.max(1, Math.ceil(shown.length/20));
  CP.page = Math.min(CP.page, pages-1);
  const {representatives:reps, values:stats} = legacy ? GpuComparison.stats(shown) : {};
  const mode = legacy ? 'region_excluded' : 'strict';
  const excluded = rows.filter(row => row.comparison_reasons[mode].length), reasons = new Map();
  excluded.forEach(row => row.comparison_reasons[mode].forEach(reason => reasons.set(reason, (reasons.get(reason)||0)+1)));
  const options = values => [['ALL','전체'], ...[...new Set(values.filter(Boolean))].sort().map(value => [value,value])];

  el.innerHTML=`<div class="mv cp-page"><section class="mv-controls"><div class="cp-modes" role="group" aria-label="비교 방식">${Object.entries(cpModes).map(([k,v])=>`<button type="button" class="mv-btn ${CP.mode===k?'primary':''}" data-cp-mode="${k}" aria-pressed="${CP.mode===k}">${v}</button>`).join('')}</div><div class="mv-filterline">${cpSelect('cpModel','GPU 모델',catalog.models.map(({name})=>[name,name]),CP.model)}${cpSelect('cpTerm','계약 유형',Object.entries(cpTerm),CP.term)}${cpSelect('cpMonths','약정기간',[['ALL','전체'],['0','기간 약정 없음'],['12','1년'],['36','3년'],['UNKNOWN','기간 미확인']],CP.months)}${cpSelect('cpProvider','사업자',[['ALL','전체'],...catalog.providers.map(({name})=>[name,name])],CP.provider)}${cpSelect('cpCountry','국가',options(catalog.regions.map(region => region.countryCode)),CP.country)}${cpSelect('cpRegion','리전',options(catalog.regions.map(region => region.regionCode)),CP.region)}<label>상품 검색<input id="cpSearch" type="search" value="${mh(CP.query)}" placeholder="사업자, 상품, 리전 검색"></label>${cpSelect('cpType','사업자 유형',[['ALL','전체'],['hyperscaler','종합 클라우드'],['neocloud','GPU 특화']],CP.type)}${cpSelect('cpGeneration','세대',[...options(catalog.generations),['UNKNOWN','세대 미확인']],CP.generation)}</div><label class="cp-check"><input id="cpConfidential" type="checkbox" ${CP.confidential?'checked':''}> 기밀 컴퓨팅 상품 포함 · 별도 조건 집단으로 비교</label></section>
  <section class="mv-note cp-summary" aria-live="polite"><h3>${cpModes[CP.mode]}${strict?'':' · '+cpCounts(shown)}</h3><p>${CP.mode==='reference'?'구성·계약이 다르거나 미확인인 가격을 살펴보는 목록입니다. 최저·중앙·최고를 집계하지 않습니다.':CP.mode==='strict'?'백엔드가 동일 리전·상품 구성·계약으로 판정한 최신 표본을 집계합니다. 상품 검색어는 아래 표에 적용됩니다.':'국가만 비교 키에서 제외합니다. 계약·GPU 수·시스템·연결 등 나머지 조건은 모두 일치해야 합니다.'}</p>${CP.mode!=='reference'&&groups.length?`<label>비교 조건 집단<select id="cpGroup">${groups.map((g,i)=>`<option value="${i}" ${g===chosen?'selected':''}>${mh(g.description)}</option>`).join('')}</select></label>`:''}
  ${strict ? marketSummaryContent(summary, chosen) + (summary ? '' : '<button class="mv-btn" id="cpSummaryRetry">요약 다시 조회</button>') : legacy ? (legacyUnavailable ? '<p role="status">지역 제외 비교는 별도 보관 자료를 사용합니다. 보관 자료에 연결하지 못했습니다.</p>' : stats?`<div class="v02-results">${['최저','중앙값','최고'].map((x,i)=>`<div>사업자 대표가격 ${x}<strong>${fxPrice(stats[i])}</strong></div>`).join('')}</div><p>${reps.length===1?'<b>단일 사업자</b> · 사업자 간 시장 분포가 아닙니다.':''} ${mh(data.representative_policy)}. 단위 USD / GPU·시간.</p><details><summary>오퍼 단위 집계 ${shown.length}개 확인</summary><p>${cpOfferStats(shown)}</p></details>`:'<p class="v02-warning"><b>집계 가능한 동일 조건 표본 없음</b> · 미확인 조건을 임의로 같다고 처리하지 않습니다. 참고 비교에서 확보된 가격과 제외 사유를 볼 수 있습니다.</p>'):'<p>최신 비교에서 제외되는 사유가 있어도 원본 가격과 이력은 보존합니다.</p>'}${legacy&&!legacyUnavailable?`<p><small>${mh(data.standard_configuration)} · 판정 ${mtime(data.assessed_at)} · 보관 데이터</small></p>`:''}</section>
  ${!strict&&reasons.size?`<details class="mv-note"><summary>집계 제외 사유 · ${excluded.length}개 오퍼</summary><p>한 오퍼에 여러 사유가 있을 수 있습니다.</p><ul>${[...reasons].map(([k,v])=>`<li>${mh(k)}: ${v}개</li>`).join('')}</ul></details>`:''}
  <div class="mv-section-head"><h3>선택 상품과 비교 조건</h3><button class="mv-btn" id="cpCSV">선택 자료 CSV ↓</button></div><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>사업자 / 상품</th><th>국가 / 리전</th><th>GPU / 구성</th><th>계약 조건</th><th>실효 USD/GPU·시간</th><th>판정 / 근거</th></tr></thead><tbody>${shown.slice(CP.page*20,(CP.page+1)*20).map(r=>`<tr><td>${mh(r.provider_name)}<span>${mh(r.original_product_name)}</span></td><td>${cpVal(r.country_code)}<span>${cpVal(r.region_code)}</span></td><td>${cpVal(r.gpu_count)} GPU · ${cpVal(r.system_type)}<span>서비스 ${cpVal(r.service_option)} / 내부 연결 ${cpVal(r.intra_node_interconnect)}</span><details><summary>CPU·RAM 등 차이 항목</summary><p>vCPU ${cpVal(r.vcpu_count)} / RAM ${cpVal(r.ram_gb)} GB<br>VRAM/GPU ${cpVal(r.vram_gb_per_gpu)} GB<br>스토리지 ${cpVal(r.storage_description)}<br>노드 간 네트워크 ${cpVal(r.inter_node_network)}</p></details></td><td>${cpVal(r.contract_product_type)}<span>${r.contract_type==='on_demand'||r.contract_type==='spot'?'기간 약정 없음':(r.commitment_months??'미확인')+'개월'} / ${cpVal(r.payment_option)}</span></td><td>${fxPrice(r.display_price)}<span>${mtime(r.collected_at)}</span><span>${({firm:'확정가',starting:'시작가',range:'범위가',estimated:'추정가'}[r.price_certainty])||mh(r.price_certainty)} · ${({success:'환산 성공',assumption:'가정 환산'}[r.result_status])||mh(r.result_status)}</span></td><td>${r.comparison_reasons[CP.mode==='region_excluded'?'region_excluded':'strict'].length?`<details><summary>참고 비교 · 제외 사유</summary><ul>${r.comparison_reasons[CP.mode==='region_excluded'?'region_excluded':'strict'].map(x=>`<li>${mh(x)}</li>`).join('')}</ul></details>`:'조건 확인됨'}<button class="mv-btn" ${r.spring?`data-market-offer="${mh(r.offer_id)}"`:`data-observation="${mh(r.observation_id)}"`}>상세·근거</button></td></tr>`).join('')||'<tr><td colspan="6">선택 조건의 가격이 없습니다. 미수집·미확보는 0원 또는 미판매를 뜻하지 않습니다.</td></tr>'}</tbody></table></div><div class="cp-pager"><button class="mv-btn" id="cpPrevious" ${CP.page===0?'disabled':''}>이전</button><span>${CP.page+1} / ${pages}</span><button class="mv-btn" id="cpNext" ${CP.page+1===pages?'disabled':''}>다음</button></div>${springMarketFooter()}</div>`;
  el.querySelectorAll('[data-cp-mode]').forEach(b=>b.onclick=()=>{CP.mode=b.dataset.cpMode;CP.page=0;RENDER.compare();});
  for(const [id,key] of [['cpModel','model'],['cpTerm','term'],['cpMonths','months'],['cpProvider','provider'],['cpCountry','country'],['cpRegion','region'],['cpType','type'],['cpGeneration','generation']])$('#'+id).onchange=e=>{CP[key]=e.target.value;CP.page=0;RENDER.compare();};
  $('#cpSearch').oninput=e=>{const start=e.target.selectionStart;CP.query=e.target.value;CP.page=0;draw();$('#cpSearch').setSelectionRange(start,start);};
  $('#cpConfidential').onchange=e=>{CP.confidential=e.target.checked;CP.page=0;RENDER.compare();};
  $('#cpSummaryRetry')?.addEventListener('click', RENDER.compare);
  if($('#cpGroup'))$('#cpGroup').onchange=e=>{CP.group=groups[+e.target.value].id;CP.page=0;draw();};
  $('#cpPrevious').onclick=()=>{CP.page--;draw();};$('#cpNext').onclick=()=>{CP.page++;draw();};
  $('#cpCSV').onclick=()=>downloadCSV('GPU_condition_comparison.csv',['관측ID','상품ID','오퍼ID','사업자','모델','국가','리전','계약','약정개월','선납','실효USD_GPU시간','수집UTC','비교방식','제외사유','출처'],shown.map(r=>[r.observation_id,r.product_id,r.offer_id,r.provider_name,r.model_name,r.country_code,r.region_code,r.contract_product_type,r.commitment_months,r.payment_option,r.display_price,r.collected_at,cpModes[CP.mode],r.comparison_reasons[CP.mode==='region_excluded'?'region_excluded':'strict'].join('; '),r.source_url]));
  refreshKrw();
  const focusTarget = focusId ? document.getElementById(focusId) : focusMode ? el.querySelector(`[data-cp-mode="${focusMode}"]`) : null;
  if (focusTarget && !focusTarget.disabled) focusTarget.focus({preventScroll:true});
 }
 draw(focusId, focusMode);
};
function cpOfferStats(rows){const v=rows.map(r=>r.display_price).sort((a,b)=>a-b),i=Math.floor(v.length/2);return v.length?`최저 ${mp(v[0])} · 중앙 ${mp(v.length%2?v[i]:(v[i-1]+v[i])/2)} · 최고 ${mp(v.at(-1))} / GPU·시간. 반복 관측은 중복 집계하지 않습니다.`:'표본 없음';}
