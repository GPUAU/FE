
let springModelUnavailable = false;
async function loadSpringHistory(name, from, to) {
  const catalogResponse=await api('/api/v1/catalog');
  if (!catalogResponse.isSuccess) throw new Error(catalogResponse.message || '모델 조회 실패');
  const selected=catalogResponse.result.models.find(item=>item.name===name);
  springModelUnavailable = !selected;
  if (!selected) return [];
  const end=to?new Date(to+'T15:00:00Z'):new Date();
  const start=from?new Date(from+'T15:00:00Z'):new Date(end.getTime()-730*86400000);
  if(from) start.setUTCDate(start.getUTCDate()-1);
  const {fetchHistory}=await import('/static/spring-history-client.mjs');
  const {mapSeries}=await import('/static/spring-history-adapter.mjs');
  const capabilities=await api('/static/backend-capabilities.json');
  return mapSeries(await fetchHistory(api,selected.id,start.toISOString(),end.toISOString(),capabilities.historyPagination===true));
}
async function showSpringObservation(id) {
  const ticket = ++marketDetailTicket;
  const dialog = $('#evidenceDialog'), body = $('#evidenceBody');
  const [,observationId,normalizationId]=id.split('-');
  const query=normalizationId!=='none'?'?normalizationId='+encodeURIComponent(normalizationId):'';
  evidenceTrigger=document.activeElement;
  dialog.classList.add('mv-dialog');
  body.innerHTML='<div class="mv"><h2 id="evidenceTitle">가격 관측 근거</h2><p role="status">근거 조회 중입니다.</p></div>';
  if(!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  try {
    const envelope=await api('/api/v1/market/observations/'+encodeURIComponent(observationId)+query);
    if (!dialog.open || ticket !== marketDetailTicket) return;
    if(!envelope.isSuccess)throw new Error(envelope.message||'조회 실패');
    const d=envelope.result;
    const evidence=d.evidence.map(e=>`<div class="mv-evidence-match"><b>${mh(e.sourceName)}</b><p>${mlink(e.sourceUrl,'원본 URL')} · ${mh(e.role)}</p><p>근거 확보 ${mutc(e.capturedAt)} · 공식 원천 검증 ${e.primaryVerified===true?'확인됨':e.primaryVerified===false?'미확인':'기록 없음'}</p></div>`).join('');
    $('#evidenceBody').innerHTML=`<div class="mv"><h2 id="evidenceTitle">Spring 가격 관측 ${mh(d.observationId)}</h2><section class="mv-detail-section"><h3>가격 원문과 수집 시각</h3><p>${mh(d.rawPriceText||'미확인')}</p><p>수집 ${mutc(d.collectedAt)} · 적용 시작 ${mutc(d.effectiveFrom)}</p><p>가격 구분 ${mh(d.priceCertainty)} · 실효 단가 ${d.effective?.amount==null?'환산 불가':mp(d.effective.amount)+' / GPU·시간'} · 규칙 ${mh(d.effective?.ruleVersion||'미확인')}</p></section><section class="mv-detail-section"><h3>출처와 검증 근거</h3>${evidence||'<p>출처 미확보</p>'}</section><section class="mv-detail-section"><h3>직접 입력 환율 재계산</h3><p>이 관측의 실효 USD 단가를 입력한 환율로 환산합니다. 결과는 저장되지 않습니다.</p><form id="springFxForm"><label>사용자 환율 (KRW / USD)<input id="springFxInput" type="number" min="0.000001" step="0.000001" required></label><button class="mv-btn" type="submit" ${normalizationId==='none'?'disabled':''}>재계산</button></form><p id="springFxResult" role="status">${normalizationId==='none'?'환산 결과 ID가 없어 재계산할 수 없습니다.':'양수 환율을 입력하세요.'}</p></section></div>`;
    $('#springFxForm').onsubmit=async event=>{
      event.preventDefault(); const out=$('#springFxResult'); const button=event.currentTarget.querySelector('button');
      if (button.disabled) return;
      const rate = event.currentTarget.querySelector('#springFxInput').value;
      button.disabled=true;out.textContent='재계산 중입니다.';
      try {const {fxRequest}=await import('/static/spring-operations.mjs'); const request=fxRequest(observationId,normalizationId,rate);
        const result=await api('/api/v1/exchange-rate-simulations',request);if(!result.isSuccess)throw Error(result.message||'재계산 실패');const item=result.result.items[0];
        out.textContent=item?.status==='OK'?`환산 단가 ${Number(item.krwPerGpuHour).toLocaleString('ko-KR',{maximumFractionDigits:6})}원/GPU·시간 · 적용 환율 ${request.krwPerUsd}원/USD · 저장하지 않음`:`환산 불가: ${item?.reason||'결과가 없습니다.'}`;
      } catch(error){out.textContent='재계산 실패: '+error.message;} finally {button.disabled=normalizationId==='none';}
    };
  } catch(e) {
    if (dialog.open && ticket === marketDetailTicket) body.textContent='관측 출처 조회 실패: '+e.message;
  }
}
/* ERD adapter: retain the existing SK shell, market cards and evidence dialog. */

mfooter = () => `<footer class="mv-sourcebar"><b>ERD 수집 데이터 · 2026-11-17</b><span>AWS 가격 카탈로그·스팟 API 기록 · Azure Retail Prices API</span><small>대시보드·카탈로그·추이는 동일한 PostgreSQL 수집 데이터 기준. 온디맨드 ${MV.data?.summary?.current_offers??"—"}개 / 스팟·약정 ${MV.data?.summary?.contract_offers??"—"}개 / 전체 가격 관측 ${MV.data?.summary?.observations??"—"}건. 이 첨부 데이터의 사업자는 AWS·Azure입니다. 자동 갱신 없음.</small><a href="#trend">과거 가격 이력 ↗</a></footer>`;
const originalMarketHome = marketHome;
marketHome = async () => {
  await originalMarketHome();
  $('#helloWhy').textContent='첨부 데이터 모델: '+MV.data.models.join(' · ')+' / VM 구성은 상품 상세에서 확인';
  const s=MV.data.summary;
  $('#heroStatus').innerHTML=`<span>온디맨드 <b>${s.current_offers}개 오퍼</b></span><span>스팟·약정 <b>${s.contract_offers}개 오퍼</b></span><span>전체 관측 <b>${s.observations}건</b></span><span>공식 과거 자료 <b>${s.historical}건</b></span><span>동일 조건 비교 <b>${s.eligible}건 · 조건 미확인</b></span>`;
};
RENDER.home=marketHome;
const originalMarketCatalog=marketCatalog;
RENDER.catalog=async()=>{MV.provider=location.hash.includes('/provider/')?decodeURIComponent(location.hash.split('/provider/')[1]):'ALL';MV.page=0;MV.supp=true;await originalMarketCatalog();};

let erdHistoryChart=null, erdModel='B300', erdProvider='ALL', erdRegion='ALL', erdTerm='ON_DEMAND', erdFrom='', erdTo='', erdRequest=0;
RENDER.trend=async()=>{
  const ticket=++erdRequest;
  $('#v-trend').innerHTML='<div class="mv-note" role="status">가격 이력을 불러오는 중입니다.</div>';
  let all;
  try {await marketData(); all=await loadSpringHistory(erdModel, erdFrom, erdTo);} catch(error) {
    if(ticket===erdRequest) $('#v-trend').innerHTML=`<div class="mv-note"><b>Spring 가격 이력 조회 실패</b><p>${mh(error.message)} · 조건을 바꾸거나 서버 연결을 확인하세요.</p><button class="mv-btn" onclick="RENDER.trend()">다시 시도</button></div>`;
    return;
  }
  if(ticket!==erdRequest)return;
  mframe('가격 추이와 관측 이력','요금제별로 같은 오퍼의 관측을 구분합니다. 수집 시점과 가격 적용일은 다릅니다.');
  $('#dataContext').innerHTML='<span class="mv-dot"></span><div><b>Spring PostgreSQL 가격 이력</b><span>수집 시각 기준 · 상세에서 출처 확인</span></div>';
  $('#dataContext').hidden=false;
  if(erdHistoryChart){erdHistoryChart.destroy();erdHistoryChart=null;}
  let modelRows=all.filter(r=>r.term===erdTerm && r.model_name===erdModel && (erdProvider==='ALL'||r.provider_name===erdProvider));
  const regions=[...new Set(modelRows.map(r=>r.region_code))].sort();
  if(!regions.includes(erdRegion))erdRegion='ALL';
  const rows=modelRows.filter(r=>(erdRegion==='ALL'||r.region_code===erdRegion)&&(!erdFrom||kstDay(r.chart_at)>=erdFrom)&&(!erdTo||kstDay(r.chart_at)<=erdTo)).sort((a,b)=>a.chart_at.localeCompare(b.chart_at));
  const select=(id,label,values,value)=>`<label>${label}<select id="${id}">${values.map(v=>`<option value="${mh(v)}" ${v===value?'selected':''}>${v==='ALL'?'전체':mh(MT[v]||v)}</option>`).join('')}</select></label>`;
  $('#v-trend').innerHTML=`<div class="mv"><section class="mv-controls"><div class="mv-filterline">${select('erdModel','GPU 모델',MV.data.models,erdModel)}${select('erdProvider','사업자',['ALL',...Object.values(MV.data.providers)],erdProvider)}${select('erdTerm','계약 유형',['ON_DEMAND','SPOT','1_YEAR','3_YEAR'],erdTerm)}${select('erdRegion','리전',['ALL',...regions],erdRegion)}<label>시작일 (KST)<input id="erdFrom" type="date" value="${erdFrom}"></label><label>종료일 (KST)<input id="erdTo" type="date" value="${erdTo}"></label><button class="mv-btn" id="erdHistoryCSV">관측 이력 CSV ↓</button></div></section><div class="mv-note"><b>${rows.length}건의 가격 기록 · ${new Set(rows.map(r=>r.offer_id)).size}개 오퍼</b><p>${springModelUnavailable?'Spring 모델 목록에 동일한 이름이 없어 이력을 조회하지 못했습니다. 모델명만으로 NVL72 구성을 추정하지 않습니다.':'Spring PostgreSQL에 저장된 관측이며 표시 기준은 수집 시각입니다.'} 가격 적용 시각과 원천 근거는 상세에서 확인하세요. 조회 기간을 지정하지 않으면 최근 2년을 조회합니다. 환산 불가 관측은 차트와 목록에서 제외됩니다. 빈 기간을 보간하거나 일별 가격으로 복제하지 않습니다. 조건이 미확인된 참고 단가입니다.</p></div><section class="sk-comparison-chart"><h3>${mh(erdModel)} · USD / GPU·시간</h3><div style="height:360px;position:relative">${rows.length?'<canvas id="erdHistoryCanvas" aria-label="실제 관측 가격 산점도"></canvas>':'<div class="mv-empty"><h3>선택 조건의 관측 이력이 없습니다.</h3><p>미수집 상태이며 0원이나 미판매를 뜻하지 않습니다.</p></div>'}</div></section><section class="history-table-section" aria-labelledby="historyTableTitle"><div class="history-table-heading"><div><h2 id="historyTableTitle">가격 관측 목록</h2><p>표 검색과 정렬은 차트와 CSV에 영향을 주지 않습니다.</p></div><div class="history-table-controls"><label>목록 검색<input id="historySearch" type="search" placeholder="사업자, 상품, 리전 검색"></label><label>정렬<select id="historySort"><option value="date-desc">수집일 최신순</option><option value="price-asc">가격 낮은 순</option><option value="price-desc">가격 높은 순</option></select></label></div></div><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>표시 기준일 (KST)</th><th>사업자 / 상품</th><th>리전 / GPU 수</th><th>USD / GPU·시간</th><th>근거 유형 / 수집일 (KST)</th><th>출처</th></tr></thead><tbody id="historyTableBody"></tbody></table></div><div class="history-pagination"><span id="historyCount" role="status" aria-live="polite"></span><div><button type="button" class="mv-btn" id="historyPrev">이전</button><span id="historyPage"></span><button type="button" class="mv-btn" id="historyNext">다음</button></div></div></section>${mfooter()}</div>`;
  const { historyPage } = await import('/static/history-table.mjs');
  let historyPageNumber = 1;
  function renderHistoryTable() {
    const result = historyPage(rows, { query: $('#historySearch').value, sort: $('#historySort').value, page: historyPageNumber });
    historyPageNumber = result.page;
    $('#historyTableBody').innerHTML = result.items.length ? result.items.map(r=>`<tr><td>${mtime(r.chart_at)}</td><td>${mh(r.provider_name)}<span>${r.original_product_name?mh(r.original_product_name):'상품명 미제공'} · ${r.configuration_version==null?'구성 버전 미제공':'구성 v'+mh(r.configuration_version)}</span></td><td>${mh(r.region_code)}${r.availability_zone?'<span>'+mh(r.availability_zone)+'</span>':''}<span>${r.gpu_count} GPU</span></td><td>${mp(r.price)}<span>${r.source_kind==='spring'?'실효 단가':r.result_status==='assumption'?'가정 실효 단가':'명목 단가'}</span><span>${mh(r.contract_product_type)}</span></td><td>${mh(r.source_label)}<span>${mh(r.verification_label)}</span><span>${mtime(r.retrieved_at||r.collected_at)}</span></td><td><button class="mv-btn" data-observation="${r.observation_id}">상세·근거</button><br>${mlink(r.original_url,'사업자 원문')}${r.archive_url?'<br>'+mlink(r.archive_url,'아카이브 저장본'):''}</td></tr>`).join('') : '<tr><td colspan="6">검색 조건에 맞는 가격 기록이 없습니다.</td></tr>';
    $('#historyCount').textContent = `검색 결과 ${result.total}건`;
    $('#historyPage').textContent = `${result.page} / ${result.totalPages}`;
    $('#historyPrev').disabled = result.page <= 1;
    $('#historyNext').disabled = result.page >= result.totalPages;
  }
  $('#historySearch').oninput = () => { historyPageNumber = 1; renderHistoryTable(); };
  $('#historySort').onchange = () => { historyPageNumber = 1; renderHistoryTable(); };
  $('#historyPrev').onclick = () => { historyPageNumber--; renderHistoryTable(); };
  $('#historyNext').onclick = () => { historyPageNumber++; renderHistoryTable(); };
  renderHistoryTable();
  $('#erdModel').onchange=e=>{erdModel=e.target.value;RENDER.trend()};$('#erdProvider').onchange=e=>{erdProvider=e.target.value;RENDER.trend()};$('#erdRegion').onchange=e=>{erdRegion=e.target.value;RENDER.trend()};$('#erdTerm').onchange=e=>{erdTerm=e.target.value;RENDER.trend()};
  $('#erdFrom').onchange=e=>{erdFrom=e.target.value;RENDER.trend()};$('#erdTo').onchange=e=>{erdTo=e.target.value;RENDER.trend()};
  renderHistoryCoverage(rows);
  renderPriceChanges(rows);
  $('#erdHistoryCSV').onclick=()=>downloadCSV('GPU_ERD_history.csv',['관측ID','사업자','모델','상품','구성버전','리전','GPU수','계약종류','약정개월','지불방식','원본단위','차트기준UTC','수집UTC','명목USD_GPU시간','실효USD_GPU시간','계산상태','원천유형','원본URL','아카이브URL','아카이브저장UTC','검증상태'],rows.map(r=>[r.observation_id,r.provider_name,r.model_name,r.original_product_name,r.configuration_version,r.region_code,r.gpu_count,r.contract_product_type,r.commitment_months,r.payment_option,r.original_time_unit,r.chart_at,r.collected_at,r.nominal_usd_gpu_hour,r.effective_usd_gpu_hour,r.result_status,r.source_kind,r.original_url,r.archive_url,r.archive_captured_at,r.verification_label]));
  if(rows.length){const groups=new Map();rows.forEach(r=>{const key=`${r.series_key} / ${r.contract_product_type} / ${r.commitment_months||0}개월 / ${r.payment_option||"지불방식 미확인"}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({x:Date.parse(r.chart_at),y:r.price})});const colors=['#d52342','#f47725','#407ab6','#6c57a1','#008b78','#666666'];erdHistoryChart=new Chart($('#erdHistoryCanvas'),{type:'scatter',data:{datasets:[...groups].map(([label,data],i)=>({label,data,pointRadius:4,pointHoverRadius:6,showLine:false,backgroundColor:colors[i%colors.length]}))},options:{responsive:true,maintainAspectRatio:false,scales:{x:{type:'linear',ticks:{callback:v=>kstDay(v),maxTicksLimit:6}},y:{title:{display:true,text:'USD / GPU·시간'}}},plugins:{legend:{display:groups.size<=8},tooltip:{callbacks:{title:items=>kstDay(items[0].parsed.x)}}}}});}
};

const erdStatusText={success:'수집 성공',not_found:'조회 범위 내 가격 미발견',collection_failed:'수집 실패',validation_failed:'검증 실패',unsupported_path:'수집 경로 미지원',pending_content_review:'저장 기록만 확보',no_target_price_in_saved_html:'저장 HTML에 대상 가격 없음',needs_price_context_review:'가격·조건 추가 확인 필요',fetch_failed:'저장본 접근 실패',capture_redirect_needs_review:'저장 시각 재확인 필요'};
RENDER.qa=async()=>{
  await marketData();const d=await api('/api/erd/status');
  mframe('데이터 품질 · 수집 상태','가격 미확보와 상품 미판매를 구분합니다.');
  const productText={official_product_confirmed:'공식 상품 확인',announced_plan:'도입 계획 확인',price_observed:'공개 가격 관측',not_established_in_review:'이번 조사에서 미확인'};
  const links=r=>`${mlink(r.original_url,'사업자 원문')} · ${mlink(r.archive_url,'아카이브 저장본')}`;
  $('#v-qa').innerHTML=`<div class="mv"><div class="mv-note"><b>온디맨드 ${d.summary.current_offers}개 / 스팟·약정 ${d.summary.contract_offers}개 / 관측 ${d.summary.observations}건 / 아카이브 가격 ${d.summary.archive_observations}건</b><p>공식 과거 자료·집계 스냅샷·인터넷 아카이브는 서로 다른 출처입니다. 집계 스냅샷 ${d.summary.aggregator_observations??0}건은 공식 현재가에 포함하지 않습니다. 저장 링크만 확보한 자료는 가격 통계·차트에 포함하지 않습니다. 동일 조건 비교 ${d.summary.eligible}건: 서비스 옵션·연결망 등 미확인 항목은 참고 단가로 표시합니다.</p></div>
  <h3>모델별 확보 현황</h3><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>사업자</th><th>모델</th><th>상품 확인</th><th>공개 가격</th><th>근거</th></tr></thead><tbody>${d.availability.map(r=>`<tr><td>${mh(r.provider_name)}</td><td>${mh(r.model_name)}</td><td>${mh(productText[r.product_status]||r.product_status)}</td><td>${r.public_price_status==='observations_available'?'저장 관측값 있음':'검증된 가격 미확보'}</td><td>${r.evidence_url?mlink(r.evidence_url,'공식 사양·안내'):'조회 결과 기준'}</td></tr>`).join('')}</tbody></table></div>
  <h3>이번 수집 결과</h3><div class="mv-note"><p>첨부 SQL에 저장된 AWS·Azure 수집 결과입니다. 조사 리전과 조회 조건은 각 기록의 근거를 확인하세요. 전체 리전·모든 판매 채널의 완전한 조사 결과는 아닙니다. 429는 호출 제한이며 가격 미존재를 뜻하지 않습니다.</p></div><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>사업자 / 모델</th><th>출처</th><th>처리 결과</th><th>확인 UTC</th></tr></thead><tbody>${d.recent_checks.map(r=>{const reason=JSON.parse(r.reason||'{}');return `<tr><td>${mh(r.provider_name)} / ${mh(r.model_name)}</td><td>${reason.source_kind==='archive'?'아카이브 탐색':'공식 API·가격 파일'}</td><td>${mh(erdStatusText[r.processing_status]||r.processing_status)}${reason.error?'<span>'+mh(reason.error)+'</span>':''}</td><td>${mh(r.checked_at)}</td></tr>`}).join('')}</tbody></table></div>
  <h3>아카이브 근거 링크 · ${d.archive_candidates.length}건</h3><div class="mv-note"><p>아래 항목은 과거 페이지 저장 기록입니다. 원문 가격과 과금 조건을 추출한 뒤에만 가격 관측으로 승격합니다. 독립적인 공식 과거 자료 대조가 안 된 경우에는 검증 미완료로 표시합니다.</p></div><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>사업자</th><th>아카이브 저장 UTC</th><th>확인 상태</th><th>링크</th></tr></thead><tbody>${d.archive_candidates.map(r=>`<tr><td>${mh(r.provider_name)}</td><td>${mh(r.archive_captured_at)}</td><td>${mh(erdStatusText[r.review_status]||r.review_status)}</td><td>${links(r)}</td></tr>`).join('')}</tbody></table></div>
  <details><summary>기존 수집 대상과 보류 상태</summary><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><tbody>${d.targets.map(r=>`<tr><td>${mh(r.provider_name)}</td><td>${mh(r.model_name)}</td><td>${!r.enabled?'수집 보류 · 약관 검토 미완료':mh(erdStatusText[r.processing_status]||r.processing_status||'확인 기록 없음')}</td></tr>`).join('')}</tbody></table></div></details>${mfooter()}</div>`;
};

// These modules need separate application data. Do not substitute old fixtures.
for(const view of ['cost','bizcase','agent','favorites','inquiries']){
  RENDER[view]=async()=>{await marketData();$('#v-'+view).innerHTML=`<div class="mv"><div class="mv-note"><b>이번 ERD 가격 데이터 연결 범위 밖의 기능입니다.</b><p>현재가 비교·상품 상세·과거 이력·수집 상태를 사용할 수 있습니다. 이 메뉴의 원가 가정, AI, 계정 기능은 별도 백엔드 연결이 필요합니다.</p><a class="mv-btn primary" href="#dashboard">수집 가격 보기 ↗</a></div></div>`};
}

const originalLoadMeta=loadMeta;
loadMeta=async()=>{
  await originalLoadMeta();
  if(state.meta.springOnly)return;
  const d=await api('/api/market').catch(error=>{if(!compatibilityUnavailable(error))throw error;return null;});
  if(d)$('#sCount').textContent=`온디맨드 ${d.summary.current_offers}개 · 스팟·약정 ${d.summary.contract_offers}개 · 가격 관측 ${d.summary.observations}건 · 공식 과거 자료 ${d.summary.historical}건 · 아카이브 가격 ${d.summary.archive_observations}건`;
};
// The old refresh button also fetched rates. This preview only rereads its DB.
document.addEventListener('click',async e=>{if(e.target.closest('#refreshBtn')){e.preventDefault();e.stopImmediatePropagation();MV.promise=null;if(typeof sgInvalidateData==='function')sgInvalidateData();await loadMeta();await render();toast('저장된 ERD 데이터를 다시 불러왔습니다. 외부 수집은 실행하지 않았습니다.');}},true);

PAGES.catalog.tools=false;PAGES.trend.tools=false;

const contractFilters = {modelId:'ALL', providerId:'ALL', type:'ALL', term:'ALL'};
let contractProductId = '', contractChoices = {}, contractRequest = 0;
const contractPayment = {
  ALL_UPFRONT:'전액 선납', PARTIAL_UPFRONT:'일부 선납', NO_UPFRONT:'선납 없음', NOT_APPLICABLE:'해당 없음',
};
const contractTypeName = {ON_DEMAND:'온디맨드', SPOT:'스팟', COMMITMENT:'약정'};
const contractPriceKind = {EXACT:'확정가', SCENARIO:'시나리오', FROM:'시작가', RANGE:'가격 범위', UNKNOWN:'가격 구분 미확인'};
const contractFreshness = {CURRENT:'48시간 이내 확인', STALE:'48시간 초과 관측', UNKNOWN:'확인 시각 미확인'};
const contractReasons = {
  BASE_PRICE_MISSING:'최근 48시간 내 확인한 양수 온디맨드 확정가가 없습니다.',
  AMBIGUOUS_BASE_PRICE:'조건을 충족하는 온디맨드 기준가가 하나로 정해지지 않았습니다.',
  COMMITMENT_PRICE_STALE:'마지막 약정 가격 확인 후 48시간이 지났습니다.',
  COMMITMENT_PRICE_NOT_AVAILABLE:'최근 점검에서 약정 가격을 확보하지 못했습니다.',
  COMMITMENT_PRICE_NOT_EXACT:'약정 요금의 확정가 근거가 없습니다.',
  COMMITMENT_PRICE_MISSING:'비교할 약정 환산 단가가 없습니다.',
  CONDITIONS_NOT_COMPARABLE:'환산 규칙, 최소 물량, 약정기간 또는 결제 조건이 일치하지 않거나 미확인입니다.',
  PRICE_NOT_OBSERVED:'가격 관측이 없습니다.',
  LATEST_PRICE_NOT_AVAILABLE:'최근 점검에서 가격을 확보하지 못했습니다.',
};
const contractComponents = {
  HOURLY_RATE:'시간요금', UPFRONT_FEE:'선납금', COMMITMENT_TOTAL:'약정 총액', LIST_PRICE:'표시가',
  DISCOUNT_RATE:'공개 할인율', RANGE_MIN:'범위 하한', RANGE_MAX:'범위 상한',
};
const contractPriceUnit = {HOUR:'/ 시간', DAY:'/ 일', MONTH:'/ 월', YEAR:'/ 년', CONTRACT:'/ 계약'};
const contractOriginalAmount = new Intl.NumberFormat('en-US',{maximumFractionDigits:10});
const contractTermName = term => ({NONE:'기간 약정 없음', UNKNOWN:'약정기간 미확인', 12:'1년', 36:'3년'}[term] || term+'개월');
const contractOfferName = offer => offer.contractProductType || contractTypeName[offer.contractType] || offer.contractType;
const contractPayName = offer => contractPayment[offer.paymentOption] || '지불 방식 미확인';
const contractAmount = offer => offer?.effective?.status === 'OK' ? offer.effective.amount : null;
const contractRate = offer => offer.discount?.status === 'OK' ? offer.discount.discountRate : null;
const contractReason = reason => contractReasons[reason] || reason || '비교 가능한 기준가를 확인하지 못했습니다.';
const contractSelect = (id, label, options, selected) => `<label>${label}<select id="${id}" ${options.length?'':'disabled'}>${options.map(([value,text])=>
  `<option value="${mh(value)}" ${value===selected?'selected':''}>${mh(text)}</option>`).join('')||'<option>해당 상품 없음</option>'}</select></label>`;

function contractProductName(product) {
  return [product.providerName, product.modelName, product.originalProductName, product.regionCode,
    product.gpuCount == null ? 'GPU 수 미확인' : product.gpuCount+' GPU',
    product.sku, product.configurationVersion == null ? null : '구성 v'+product.configurationVersion, '상품 #'+product.id,
  ].filter(Boolean).join(' · ');
}

function contractEvidence(offer) {
  return offer.observationId ? `<button type="button" class="mv-btn" data-observation="spring-${mh(offer.observationId)}-${mh(offer.effective?.normalizationId ?? 'none')}">상세·근거</button>` : '출처 미확보';
}

function contractOriginalPrice(offer) {
  const observation = offer.observation;
  if (!observation?.components.length) return mv(observation?.rawPriceText);
  return observation.components.map(component => {
    let amount = component.rawValue;
    if (component.type === 'DISCOUNT_RATE' && component.discountRate != null) {
      amount = (Number(component.discountRate)*100).toLocaleString('ko-KR',{maximumFractionDigits:6})+'%';
    } else if (component.amount != null) {
      amount = [contractOriginalAmount.format(Number(component.amount)),
        component.currency, contractPriceUnit[component.timeUnit] || component.timeUnit].filter(Boolean).join(' ');
    }
    return `${mh(contractComponents[component.type] || component.type)} · ${mv(amount)}`;
  }).join('<br>');
}

function contractPriceNote(offer) {
  const effective = offer.effective ?? {};
  const labels = [contractPriceKind[effective.kind], contractFreshness[offer.freshness]];
  if (contractAmount(offer) == null) labels.push(contractReason(effective.reason));
  labels.push(...(effective.assumptions ?? []));
  return labels.filter(Boolean).map(mh).join(' · ');
}

function contractDiscount(offer, baseline) {
  if (offer.contractType === 'ON_DEMAND') return offer === baseline ? '<b class="mv-saving">비교 기준가</b>' : '온디맨드 관측가';
  if (offer.contractType === 'SPOT') return '<b class="mv-saving is-missing">스팟 관측가</b><span>중단 가능</span>';
  const rate = contractRate(offer);
  if (rate == null) return `<b class="mv-saving is-missing">할인율 산출 불가</b><span>${mh(contractReason(offer.discount?.reason))}</span>`;
  const percent = Number(rate)*100;
  const label = percent < 0 ? '높음' : percent > 0 ? '할인' : '차이';
  const baseAmount = contractAmount(baseline);
  const amount = contractAmount(offer);
  const difference = baseAmount == null || amount == null ? null : Number(baseAmount)-Number(amount);
  return `<b class="mv-saving ${percent<0?'is-increase':''}">${Math.abs(percent).toFixed(1)}% ${label}</b>${difference == null?'':
    ` <span>${difference<0?'추가':difference>0?'절감':'차액'} ${mp(Math.abs(difference))} / GPU·시간</span>`}`;
}

function contractCards(rows, baseline) {
  const onDemand = rows.filter(offer => offer.contractType === 'ON_DEMAND');
  const base = baseline ?? (onDemand.length === 1 ? onDemand[0] : null);
  const baseCard = `<article class="mv-contractcard"><span class="mv-chip">${baseline?'비교 기준가':'온디맨드 관측가'}</span><h3>온디맨드</h3>
    ${base?`<strong>${fxPrice(contractAmount(base))}<small>USD / GPU·시간</small></strong><p>${contractPriceNote(base)}</p><small>수집 · ${mutc(base.collectedAt)}</small>${contractEvidence(base)}`:
    `<strong>기준가 미확정</strong><p>${onDemand.length?'온디맨드 오퍼는 아래 표에서 확인하세요.':'온디맨드 관측가가 없습니다.'}</p>`}</article>`;
  const terms = [['spot','스팟'], ['12','1년 약정'], ['36','3년 약정']];
  return `<div class="mv-contractgrid discount-grid">${baseCard}${terms.map(([key,title]) => {
    const options = rows.filter(offer => key === 'spot' ? offer.contractType === 'SPOT' :
      offer.contractType === 'COMMITMENT' && String(offer.months) === key);
    const selected = options.find(offer => offer.offerId === contractChoices[key]) ?? options[0];
    const choices = options.map(offer => [offer.offerId,
      [contractOfferName(offer), contractPayName(offer), mp(contractAmount(offer))+' / GPU·시간', '#'+offer.offerId].join(' · ')]);
    return `<article class="mv-contractcard featured"><span class="mv-chip">${key==='spot'?'중단 가능':'장기 약정'}</span><h3>${title}</h3>
      ${selected?`${contractSelect('contractChoice'+key,'비교 요금제',choices,selected.offerId)}
      <strong>${fxPrice(contractAmount(selected))}<small>USD / GPU·시간</small></strong>
      <div>${contractDiscount(selected,baseline)}</div><p>${key==='spot'?'':mh(contractPayName(selected))+' · '}${contractPriceNote(selected)}</p>
      <small>수집 · ${mutc(selected.collectedAt)}</small>${contractEvidence(selected)}`:
      '<strong>미확보</strong><p>선택 조건의 요금제가 없습니다.</p>'}</article>`;
  }).join('')}</div>`;
}

function contractResults(product, rows, comparison) {
  const baseline = comparison.baseline;
  const offerCount = rows.filter(offer => offer.contractType === 'SPOT' || offer.contractType === 'COMMITMENT').length;
  const calculated = rows.filter(offer => contractRate(offer) != null).length;
  return `${contractCards(rows,baseline)}<div class="mv-note">
    <b>스팟·약정 ${offerCount}개 · 약정 할인율 산출 ${calculated}건</b>
    <p>약정 할인율은 같은 상품 ID의 단일 온디맨드 기준가를 사용합니다. 최근 48시간 내 확인한 확정가, 환산 규칙, 최소 물량, 기간 및 지불 조건을 확인합니다.</p>
    <p>공개 할인율을 적용한 추정 단가는 시나리오로 표시합니다. 스팟은 중단될 수 있으며 약정 할인율과 별개로 관측가를 표시합니다. ${mh(comparison.disclaimer)}</p></div>
    <div class="mv-tablebox" tabindex="0" role="region" aria-label="계약별 가격 표"><table class="mv-table"><thead><tr>
    <th>사업자 / 모델 / 상품</th><th>리전 / GPU 수</th><th>요금제 / 약정 / 지불</th><th>원본 가격 구성</th>
    <th>USD / GPU·시간</th><th>온디맨드 기준가</th><th>온디맨드 대비 차이 / 할인율</th><th>수집일 (UTC) / 출처</th>
    </tr></thead><tbody>${rows.map(offer => `<tr>
      <td>${mh(product.providerName)} · ${mh(product.modelName)}<span>${mv(product.originalProductName)}</span></td>
      <td>${mv(product.regionCode)}<span>${product.gpuCount == null?'GPU 수 미확인':mh(product.gpuCount)+' GPU'}</span></td>
      <td>${mh(contractOfferName(offer))}<span>${mh(contractTermName(offer.term))} · ${mh(contractPayName(offer))}</span></td>
      <td>${contractOriginalPrice(offer)}</td><td>${fxPrice(contractAmount(offer))}<span>${contractPriceNote(offer)}</span></td>
      <td>${baseline?fxPrice(contractAmount(baseline))+'<span>'+mutc(baseline.collectedAt)+'</span>':'기준가 미확정'}</td>
      <td>${contractDiscount(offer,baseline)}</td><td>${mutc(offer.collectedAt)}${contractEvidence(offer)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function exportContracts(product, rows, comparison) {
  const baseline = comparison.baseline;
  downloadCSV('GPU_spot_commitments_discounts.csv',
    ['상품ID','오퍼ID','관측ID','사업자','모델','상품','SKU','리전','GPU수','계약종류','약정개월','지불방식',
      '원본가격요소','실효USD_GPU시간','가격구분','가격상태','최신성','온디맨드USD_GPU시간','온디맨드오퍼ID','할인율퍼센트',
      '할인율상태','할인율산출사유','수집UTC','출처'],
    rows.map(offer => [
      product.id,offer.offerId,offer.observationId,product.providerName,product.modelName,product.originalProductName,
      product.sku,product.regionCode,product.gpuCount,offer.contractProductType,offer.months,offer.paymentOption,
      JSON.stringify(offer.observation?.components ?? []),contractAmount(offer),offer.effective?.kind,offer.effective?.status,offer.freshness,
      contractAmount(baseline),baseline?.offerId,contractRate(offer) == null ? '' : (Number(contractRate(offer))*100).toFixed(4),
      offer.discount?.status,offer.discount?.reason,offer.collectedAt,
      (offer.observation?.evidence ?? []).map(source => source.sourceUrl).filter(Boolean).join(' '),
    ]));
}

RENDER.discounts = async () => {
  const view = $('#v-discounts');
  const context = $('#dataContext');
  const request = ++contractRequest;
  const isCurrent = () => request === contractRequest && state.view === 'discounts';
  const loading = '<div class="mv-note" role="status">계약 비교를 조회하고 있습니다.</div>';
  const failure = error => `<div class="mv-note" role="alert"><b>계약 비교 조회 실패</b>
    <p>${mh(error.message)}</p><button type="button" class="mv-btn" id="contractRetry">다시 시도</button></div>`;
  const setContext = asOf => {
    context.innerHTML = `<span class="mv-dot"></span><div><b>Spring PostgreSQL 계약 비교</b><span>${asOf?mtime(asOf)+' · 조회 기준':'공개 관측가와 가격 근거'}</span></div>`;
    context.hidden = false;
  };

  document.body.classList.add('market-v4','contract-v4');
  $('#pageTitle').textContent = '계약별 관측가와 약정 할인율';
  $('#pageDesc').textContent = '같은 상품의 온디맨드·스팟·장기 약정 가격을 비교합니다.';
  setContext();
  mountFx();
  view.innerHTML = `<div class="mv">${loading}</div>`;

  try {
    const client = await import('/static/spring-contracts.mjs');
    const catalog = await client.fetchContractCatalog(api);
    if (!isCurrent()) return;
    const offerIndex = catalog.products.flatMap(product => [...product.offers.values()])
      .filter(offer => client.isContractOffer(offer.contractType));
    const all = ['ALL','전체'];
    const filters = [
      ['contractModel','GPU 모델','modelId',[all,...catalog.models.map(model => [model.id,model.name])]],
      ['contractProvider','사업자','providerId',[all,...catalog.providers.map(provider => [provider.id,provider.name])]],
      ['contractType','요금제','type',[all,...[...new Set(offerIndex.map(offer => offer.contractProductType).filter(Boolean))].sort().map(type => [type,type])]],
      ['contractTerm','약정기간','term',[all,...[...new Set(offerIndex.map(client.contractTerm))].map(term => [term,contractTermName(term)])]],
    ];
    for (const [,,key,options] of filters) {
      if (!options.some(([value]) => value === contractFilters[key])) contractFilters[key] = 'ALL';
    }
    let comparison = null, selectedRequest = 0;
    const chooseProduct = id => {
      if (contractProductId !== id) {
        contractProductId = id;
        contractChoices = {};
      }
    };

    const paint = (products, product, message = '') => {
      const focusId = view.contains(document.activeElement) ? document.activeElement.id : '';
      const rows = message ? [] : comparison.items.filter(offer =>
        offer.contractType === 'ON_DEMAND' || client.matchesContractTerms(offer,contractFilters));
      view.innerHTML = `<div id="mvContracts" class="mv"><section class="mv-controls"><div class="mv-filterline">
        ${filters.map(([id,label,key,options]) => contractSelect(id,label,options,contractFilters[key])).join('')}
        <button type="button" class="mv-btn" id="contractCSV" ${rows.length?'':'disabled'}>선택 자료 CSV ↓</button>
        </div></section><section class="discount-comparison">
        ${contractSelect('contractBaseline','비교할 상품 · 리전',products.map(item => [item.id,contractProductName(item)]),contractProductId)}
        ${message || contractResults(product,rows,comparison)}</section>
        <footer class="mv-sourcebar"><b>Spring PostgreSQL 공개 관측 가격</b><span>원본 요금과 출처는 상세·근거에서 확인하세요.</span><a href="#trend">과거 가격 이력 ↗</a></footer></div>`;

      for (const [id,,key] of filters) $('#'+id).onchange = event => {
        contractFilters[key] = event.target.value;
        loadProduct();
      };
      $('#contractBaseline').onchange = event => {
        chooseProduct(event.target.value);
        loadProduct();
      };
      for (const key of ['spot','12','36']) {
        const select = $('#contractChoice'+key);
        if (select) select.onchange = event => {
          contractChoices[key] = event.target.value;
          paint(products,product);
        };
      }
      $('#contractCSV').onclick = () => exportContracts(product,rows,comparison);
      if ($('#contractRetry')) $('#contractRetry').onclick = () => loadProduct();
      if (focusId) document.getElementById(focusId)?.focus({preventScroll:true});
    };

    const loadProduct = async () => {
      const pending = ++selectedRequest;
      const products = client.filterContractProducts(catalog.products,contractFilters);
      const product = products.find(option => option.id === contractProductId) ?? products[0];
      chooseProduct(product?.id ?? '');
      if (!product) {
        comparison = null;
        setContext();
        paint(products,product,'<div class="mv-empty" role="status"><h3>선택 조건의 상품이 없습니다.</h3><p>GPU 모델, 사업자 또는 요금제를 변경해 보세요.</p></div>');
        return;
      }
      try {
        if (comparison?.productId !== product.id) {
          comparison = null;
          setContext();
          paint(products,product,loading);
          const result = await client.fetchContractComparison(api,product);
          if (!isCurrent() || pending !== selectedRequest) return;
          comparison = result;
        }
        setContext(comparison.asOf);
        const hasPlans = comparison.items.some(offer => client.isContractOffer(offer.contractType) &&
          client.matchesContractTerms(offer,contractFilters));
        paint(products,product,hasPlans?'':'<div class="mv-empty" role="status"><h3>선택 조건의 스팟·약정 가격 자료가 없습니다.</h3></div>');
      } catch (error) {
        if (isCurrent() && pending === selectedRequest) paint(products,product,failure(error));
      }
    };
    await loadProduct();
  } catch (error) {
    if (!isCurrent()) return;
    view.innerHTML = `<div class="mv">${failure(error)}</div>`;
    $('#contractRetry').onclick = RENDER.discounts;
  }
};
PAGES.discounts.tools=false;

const erdDisclosure={public:'공개가',quote_required:'견적 문의',login_required:'로그인 필요',not_disclosed:'가격 미공개',unknown:'미확인'};
const erdPayment={all_upfront:'전액 선납',partial_upfront:'일부 선납',no_upfront:'선납 없음'};
const erdMethod={api:'API',file:'공식 가격 파일',page:'페이지',manual:'수동 확인'};
const erdComponent={hourly_rate:'반복 시간요금',upfront_fee:'선납금',commitment_total:'약정 총액',list_price:'표시가',discount_rate:'할인율',range_min:'범위 하한',range_max:'범위 상한'};
marketEvidence=async id=>{const offer=await api('/api/market/offer/'+encodeURIComponent(id));if(offer?.observation_id)await showErdObservation(offer.observation_id);};
async function showErdObservation(id){
  if(String(id).startsWith('spring-')) return showSpringObservation(id);
  const ticket = ++marketDetailTicket;
  const trigger = document.activeElement;
  const d=await api('/api/erd/observation/'+encodeURIComponent(id));
  const fxInfo=await fxData();
  if (ticket !== marketDetailTicket) return;
  const o=d.observation,p=d.product,f=d.offer,c=d.check,n=d.normalizations[0];
  evidenceTrigger=trigger;
  const val=x=>x===null||x===undefined||x===''?'미확인':mh(x);
  const money=x=>x==null?'계산값 없음':mp(x);
  const section=(title,items)=>`<section class="mv-detail-section"><h3>${title}</h3><dl>${items.map(([a,b])=>`<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl></section>`;
  const input=n?.calculation_inputs||{};
  const hasUpfront=d.components.some(x=>x.component_type==='upfront_fee'&&Number(x.amount)>0);
  const monthlyUsed=input.monthly_hours_used===true;
  $('#evidenceBody').innerHTML=`<div class="mv"><p class="mv-eyebrow">상품·계약·관측 근거</p><h2 id="evidenceTitle">${mh(d.provider.provider_name)} · ${mh(d.model.model_name)}</h2><div class="mv-detailhero"><h3>${val(p.original_product_name)}</h3><p>${val(f.contract_product_type)} · ${p.gpu_count??'미확인'} GPU / ${val(p.spec_scope)}</p></div>
    ${section('상품 구성과 지역',[['상품명 / SKU 원문',val(p.original_product_name)+' / '+val(p.sku)],['모델명 원문',val(p.original_model_name)],['구성 버전',val(p.configuration_version)],['GPU 수',val(p.gpu_count)],['GPU당 VRAM (GB)',val(p.vram_gb_per_gpu)],['시스템 유형',val(p.system_type)],['서비스 옵션',val(p.service_option)],['vCPU / RAM (GB)',val(p.vcpu_count)+' / '+val(p.ram_gb)],['스토리지',val(p.storage_description)],['노드 내부 연결',val(p.intra_node_interconnect)+' · '+({confirmed:'공식 근거 확인',unconfirmed:'미확인',not_applicable:'해당 없음'}[p.interconnect_status]||val(p.interconnect_status))],['노드 간 네트워크',val(p.inter_node_network)],['리전 / 국가',val(p.region_code)+' / '+val(p.country_code)],['상품 범위',p.gpu_count+' GPU / VM'+(d.model.model_name.includes('NVL72')?' · NVL72 전체 랙 가격이 아님':'')]])}
    ${section('계약과 가격 원문',[['계약 종류',val(f.contract_product_type)],['약정기간',f.commitment_months?f.commitment_months+'개월':'기간 약정 없음'],['지불 방식',erdPayment[f.payment_option]||'미확인'],['최소물량 / 단위',val(f.minimum_quantity)+' / '+val(f.minimum_quantity_unit)],['가격 원문',val(o.raw_price_text)],['원본 통화 / 단위',val(o.original_currency)+' / '+val(o.original_time_unit)],['가격 적용 대상',val(o.price_applies_to)],['가격 적용 시작일',val(o.effective_from)]])}
    <section class="mv-detail-section"><h3>가격 구성요소</h3><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>종류</th><th>원본 금액</th><th>통화 / 단위</th></tr></thead><tbody>${d.components.map(x=>`<tr><td>${erdComponent[x.component_type]||mh(x.component_type)}</td><td>${val(x.amount)}</td><td>${val(x.currency)} / ${val(x.time_unit)}</td></tr>`).join('')}</tbody></table></div>${hasUpfront?'<p>반복 시간요금이 0이어도 무료가 아닙니다. 선납금을 포함한 환산 단가를 함께 확인하세요.</p>':''}</section>
    ${section('정규화 결과와 계산 기준',[['명목 USD / GPU·시간',money(n?.nominal_usd_gpu_hour)],['실효 USD / GPU·시간',money(n?.effective_usd_gpu_hour)],['계산 상태',n?.result_status==='assumption'?'가정 적용 · 실제 청구액 아님':n?.result_status==='success'?'계산 성공':'계산 불가'],['계산 설명',val(n?.reason)],['규칙 버전',val(n?.rule_version)],['규칙 산식',val(n?.formula_description)],['월 환산 기준',val(n?.monthly_hours)+'시간 · '+(monthlyUsed?'이 계산에 사용':'이 계산에는 월 환산 미사용')],['약정 시간 가정',input.contract_hours?val(input.contract_hours)+'시간':'미사용'],['계산 시각 (UTC)',val(n?.calculated_at)]])}
    ${section('수집 상태와 시각',[['가격 공개 상태',erdDisclosure[c.disclosure_status]||val(c.disclosure_status)],['처리 결과',erdStatusText[c.processing_status]||val(c.processing_status)],['실제 가격 수집 시각 (UTC)',val(o.collected_at)],['이 관측의 점검 시각 (UTC)',val(c.checked_at)],['전체 대상 범위 완료',c.scope_completed?'완료':'이 점검은 전체 범위 완료를 뜻하지 않음'],['가용 재고','미확인 · 공개 가격이 구매 가능 물량을 보장하지 않음']])}
    <section class="mv-detail-section"><h3>출처와 검증 근거</h3>${d.evidence.map(e=>`<div class="mv-evidence-match"><b>${mh(e.source_name)} · ${erdMethod[e.collection_method]||mh(e.collection_method)}</b><p>${mlink(e.source_url,'원본 URL')} · ${mh(e.evidence_role)}</p><p>근거 확보 ${mutc(e.captured_at)} · 공식 확인 ${e.primary_verified?'확인됨':'미확인'}</p><small>출처 이용조건 기록: ${e.terms_status==='allowed'?'해당 이용 범위에서 허용':e.terms_status==='not_allowed'?'허용되지 않음':'미확인'} · ${e.terms_url?mlink(e.terms_url,'이용조건 근거'):''}</small></div>`).join('')}</section>
    <section class="mv-detail-section"><h3>원화 환산</h3>${d.krw_conversions.length?d.krw_conversions.map(x=>`<p>자동 환율 ${mh(x.rate)} KRW/USD · 기준일 ${mh(x.reference_date)} · ${mlink(x.source_url,'환율 출처')}</p>`).join(''):'<p>이 관측에 연결된 당시 환율·원화 환산 이력은 없습니다.</p>'}${fxInfo.rate?`<p><b>현재 기준 환산</b> · 1 USD = ${Number(fxInfo.rate.rate).toLocaleString('ko-KR')}원 · 기준일 ${mh(fxInfo.rate.reference_date)} · ${mlink(fxInfo.rate.source_url,'한국수출입은행')}</p><p>명목 ${n?.nominal_usd_gpu_hour==null?'계산 불가':Math.round(Number(n.nominal_usd_gpu_hour)*Number(fxInfo.rate.rate)).toLocaleString('ko-KR')+'원'} · 실효 ${n?.effective_usd_gpu_hour==null?'계산 불가':Math.round(Number(n.effective_usd_gpu_hour)*Number(fxInfo.rate.rate)).toLocaleString('ko-KR')+'원'} / GPU·시간. 과거 당시 환율을 적용한 가격이 아닙니다.${fxInfo.stale?' 환율 기준일 4일 초과.':''}</p>`:'<p>현재 기준 환율도 미확보입니다.</p>'}<label>사용자 환율 (KRW / USD)<input id="erdUserFx" type="number" min="0.01" step="0.01" placeholder="직접 입력"></label><p id="erdFxPreview">직접 입력한 환율은 이번 화면에서만 계산하며 DB에 저장하지 않습니다.</p></section>
    <details class="mv-raw"><summary>계산 입력·원본 레코드 확인</summary><pre>${mh(JSON.stringify(d,null,2))}</pre></details></div>`;
  $('#evidenceDialog').classList.add('mv-dialog');if(!$('#evidenceDialog').open)$('#evidenceDialog').showModal();$('#evidenceDialog').scrollTop=0;
  $('#erdUserFx').oninput=e=>{const fx=Number(e.target.value);$('#erdFxPreview').textContent=Number.isFinite(fx)&&fx>0?`사용자 가정 환율 ${fx.toLocaleString('ko-KR')} KRW/USD · 명목 ${n?.nominal_usd_gpu_hour==null?'계산 불가':(Number(n.nominal_usd_gpu_hour)*fx).toLocaleString('ko-KR',{maximumFractionDigits:0})+'원'} · 실효 ${n?.effective_usd_gpu_hour==null?'계산 불가':(Number(n.effective_usd_gpu_hour)*fx).toLocaleString('ko-KR',{maximumFractionDigits:0})+'원'} / GPU·시간. 저장하지 않음.`:'양수 환율을 입력하세요. 자동 환율과 별개이며 저장하지 않습니다.';};
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-observation]');if(b)showErdObservation(b.dataset.observation);});

