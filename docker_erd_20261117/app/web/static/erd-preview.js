
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
  const query=new URLSearchParams({modelId:selected.id,from:start.toISOString(),to:end.toISOString()});
  const response=await api('/api/v1/market/price-histories?'+query);
  if(!response.isSuccess) throw new Error(response.message||'가격 이력 조회 실패');
  const {mapSeries}=await import('/static/spring-history-adapter.mjs');
  return mapSeries(response.result.series);
}
async function showSpringObservation(id) {
  const [,observationId,normalizationId]=id.split('-');
  const query=normalizationId!=='none'?'?normalizationId='+encodeURIComponent(normalizationId):'';
  evidenceTrigger=document.activeElement;
  $('#evidenceBody').innerHTML='<div class="mv"><p>근거 조회 중입니다.</p></div>';
  if(!$('#evidenceDialog').open) $('#evidenceDialog').showModal();
  try {
    const envelope=await api('/api/v1/market/observations/'+encodeURIComponent(observationId)+query);
    if(!envelope.isSuccess)throw new Error(envelope.message||'조회 실패');
    const d=envelope.result;
    const evidence=d.evidence.map(e=>`<div class="mv-evidence-match"><b>${mh(e.sourceName)}</b><p>${mlink(e.sourceUrl,'원본 URL')} · ${mh(e.role)}</p><p>근거 확보 ${mutc(e.capturedAt)} · 공식 원천 검증 ${e.primaryVerified===true?'확인됨':e.primaryVerified===false?'미확인':'기록 없음'}</p></div>`).join('');
    $('#evidenceBody').innerHTML=`<div class="mv"><h2 id="evidenceTitle">Spring 가격 관측 ${mh(d.observationId)}</h2><section class="mv-detail-section"><h3>가격 원문과 수집 시각</h3><p>${mh(d.rawPriceText||'미확인')}</p><p>수집 ${mutc(d.collectedAt)} · 적용 시작 ${mutc(d.effectiveFrom)}</p><p>가격 구분 ${mh(d.priceCertainty)} · 실효 단가 ${d.effective?.amount==null?'환산 불가':mp(d.effective.amount)+' / GPU·시간'} · 규칙 ${mh(d.effective?.ruleVersion||'미확인')}</p></section><section class="mv-detail-section"><h3>출처와 검증 근거</h3>${evidence||'<p>출처 미확보</p>'}</section><section class="mv-detail-section"><h3>직접 입력 환율 재계산</h3><p>이 관측의 실효 USD 단가를 입력한 환율로 환산합니다. 결과는 저장되지 않습니다.</p><form id="springFxForm"><label>사용자 환율 (KRW / USD)<input id="springFxInput" type="number" min="0.000001" step="0.000001" required></label><button class="mv-btn" type="submit" ${normalizationId==='none'?'disabled':''}>재계산</button></form><p id="springFxResult" role="status">${normalizationId==='none'?'환산 결과 ID가 없어 재계산할 수 없습니다.':'양수 환율을 입력하세요.'}</p></section></div>`;
    $('#springFxForm').onsubmit=async event=>{
      event.preventDefault(); const out=$('#springFxResult'); const button=event.currentTarget.querySelector('button');
      try {const {fxRequest}=await import('/static/spring-operations.mjs'); const request=fxRequest(observationId,normalizationId,$('#springFxInput').value);button.disabled=true;out.textContent='재계산 중입니다.';
        const result=await api('/api/v1/exchange-rate-simulations',request);if(!result.isSuccess)throw Error(result.message||'재계산 실패');const item=result.result.items[0];
        out.textContent=item?.status==='OK'?`환산 단가 ${Number(item.krwPerGpuHour).toLocaleString('ko-KR',{maximumFractionDigits:6})}원/GPU·시간 · 적용 환율 ${request.krwPerUsd}원/USD · 저장하지 않음`:`환산 불가: ${item?.reason||'결과가 없습니다.'}`;
      } catch(error){out.textContent='재계산 실패: '+error.message;} finally {button.disabled=normalizationId==='none';}
    };
  } catch(e) {$('#evidenceBody').textContent='관측 출처 조회 실패: '+e.message;}
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
loadMeta=async()=>{await originalLoadMeta();const d=await api('/api/market');$('#sCount').textContent=`온디맨드 ${d.summary.current_offers}개 · 스팟·약정 ${d.summary.contract_offers}개 · 가격 관측 ${d.summary.observations}건 · 공식 과거 자료 ${d.summary.historical}건 · 아카이브 가격 ${d.summary.archive_observations}건`;};
// The old refresh button also fetched rates. This preview only rereads its DB.
document.addEventListener('click',async e=>{if(e.target.closest('#refreshBtn')){e.preventDefault();e.stopImmediatePropagation();MV.promise=null;if(typeof sgInvalidateData==='function')sgInvalidateData();await loadMeta();await render();toast('저장된 ERD 데이터를 다시 불러왔습니다. 외부 수집은 실행하지 않았습니다.');}},true);

PAGES.catalog.tools=false;PAGES.trend.tools=false;

// Contract types and payment options remain separate; no arbitrary minimum
// is presented as guaranteed savings. History filters keep contract types separate.
let contractModel='ALL',contractProvider='ALL',contractType='ALL',contractTerm='ALL';
let contractBaseline='',contractChoices={};
const discountText=r=>r.discount_percent==null?'비교 불가':r.discount_percent<0?`${Math.abs(r.discount_percent).toFixed(1)}% 높음`:`${r.discount_percent.toFixed(1)}% ${r.contract_type==='spot'?'낮음 · 가격 차이':'할인'}`;
const discountClass=r=>r.discount_percent==null?'is-missing':r.discount_percent<0?'is-increase':'';
RENDER.discounts=async()=>{
  await marketData();const all=await api('/api/erd/contracts');
  mframe('온디맨드 대비 가격 차이·할인율','스팟 가격 차이와 1년·3년 약정 할인율을 같은 상품 기준으로 비교합니다.');
  document.body.classList.add('contract-v4');
  const rows=all.filter(r=>(contractModel==='ALL'||r.model_name===contractModel)&&(contractProvider==='ALL'||r.provider_name===contractProvider)&&(contractType==='ALL'||r.contract_product_type===contractType)&&(contractTerm==='ALL'||String(r.commitment_months||0)===contractTerm));
  const select=(id,label,values,value)=>`<label>${label}<select id="${id}">${values.map(v=>`<option value="${mh(v)}" ${v===value?'selected':''}>${v==='ALL'?'전체':v==='0'?'기간 약정 없음':v==='12'?'1년':v==='36'?'3년':mh(v)}</option>`).join('')}</select></label>`;
  const payment={all_upfront:'전액 선납',partial_upfront:'일부 선납',no_upfront:'선납 없음'};
  const componentName={hourly_rate:'시간요금',upfront_fee:'선납금',commitment_total:'약정 총액'};
  const groups=new Map();
  for(const r of rows)if(r.on_demand_observation_id!=null){const k=String(r.on_demand_observation_id);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
  if(!groups.has(contractBaseline)){contractBaseline=[...groups.keys()].sort((a,b)=>new Set(groups.get(b).map(r=>r.contract_type==='spot'?'spot':r.commitment_months)).size-new Set(groups.get(a).map(r=>r.contract_type==='spot'?'spot':r.commitment_months)).size)[0]||'';contractChoices={}}
  const chosen=groups.get(contractBaseline)||[],base=chosen[0];
  const optionName=r=>`${r.contract_product_type} · ${payment[r.payment_option]||'지불 방식 미확인'} · ${mp(r.display_price)} / GPU·시간`;
  const detailButton=id=>`<button class="mv-btn" data-observation="${id}">상세·근거</button>`;
  const cards=base?`<section class="discount-comparison"><div class="mv-section-head"><div><h2>같은 상품, 계약별 할인율</h2><p>아래 상품과 요금제를 선택하면 해당 조건의 할인율을 표시합니다.</p></div></div><label>비교할 상품 · 리전<select id="contractBaseline">${[...groups].map(([k,g])=>`<option value="${k}" ${k===contractBaseline?'selected':''}>${mh(g[0].provider_name+' · '+g[0].model_name+' · '+g[0].original_product_name+' · '+g[0].region_code+' · '+g[0].sku.split('/')[0])}</option>`).join('')}</select></label><div class="mv-contractgrid discount-grid"><article class="mv-contractcard"><span class="mv-chip">기준 가격</span><h3>온디맨드</h3><strong>${fxPrice(base.on_demand_price)}<small>USD / GPU·시간</small></strong><b class="mv-saving">기준 0.0%</b><p>수집: ${mh(base.on_demand_collected_at)}</p>${detailButton(base.on_demand_observation_id)}</article>${[['spot','스팟'],['12','1년 약정'],['36','3년 약정']].map(([key,title])=>{
    const options=chosen.filter(r=>key==='spot'?r.contract_type==='spot':r.contract_type==='commitment'&&String(r.commitment_months)===key);
    const r=options.find(r=>String(r.observation_id)===contractChoices[key])||options[0];
    return `<article class="mv-contractcard featured"><span class="mv-chip">${key==='spot'?'중단 가능':'장기약정'}</span><h3>${title}</h3>${r?`<label>비교 요금제<select data-contract-choice="${key}">${options.map(o=>`<option value="${o.observation_id}" ${o===r?'selected':''}>${mh(optionName(o)+(o.availability_zone?' · '+o.availability_zone:''))}</option>`).join('')}</select></label><strong>${fxPrice(r.display_price)}<small>USD / GPU·시간</small></strong><b class="mv-saving ${discountClass(r)}">${discountText(r)}</b><p>온디맨드 대비 ${r.saving_usd_gpu_hour<0?'추가':'절감'} ${mp(Math.abs(r.saving_usd_gpu_hour))} / GPU·시간</p><p>${mh(r.display_basis)}</p><small>수집: ${mh(r.collected_at)}</small>${detailButton(r.observation_id)}`:'<strong>미확보</strong><p>현재 선택 조건에서 확보한 가격이 없습니다.</p>'}</article>`;
  }).join('')}</div></section>`:'';
  $('#v-discounts').innerHTML=`<div id="mvContracts" class="mv"><section class="mv-controls"><div class="mv-filterline">${select('contractModel','GPU 모델',['ALL',...MV.data.models],contractModel)}${select('contractProvider','사업자',['ALL','AWS','Azure'],contractProvider)}${select('contractType','요금제',['ALL',...new Set(all.map(r=>r.contract_product_type))],contractType)}${select('contractTerm','약정기간',['ALL','0','12','36'],contractTerm)}<button class="mv-btn" id="contractCSV">선택 자료 CSV ↓</button></div></section>${cards}<div class="mv-note"><b>${rows.length}개 공개 요금 · 할인율 산출 ${rows.filter(r=>r.discount_percent!=null).length}건 · 비교 불가 ${rows.filter(r=>r.discount_percent==null).length}건</b><p><b>할인율 = (1 − 선택 요금 ÷ 온디맨드 요금) × 100</b> · 단위는 USD / GPU·시간입니다. 동일 사업자·상품군·VM 규격·리전·GPU 수를 맞추고, 확인된 vCPU·RAM 등 구성의 불일치는 제외합니다. 일부 서비스·상호연결 조건은 미확인 상태이므로 참고 비교입니다.</p><p>예약 요금은 선납금과 반복 요금 또는 약정 총액을 합산·환산하며, 연 8,760시간·100% 사용을 가정합니다. Savings Plan은 적용 사용량의 공개 할인 단가를 비교하며 미사용 약정을 포함한 실제 청구 절감률이 아닙니다. 스팟 수치는 보장 할인율이 아닌 관측 시점 가격 차이입니다. 스팟은 중단될 수 있고 가격·가용성이 변합니다.</p><p>최신 확보 가격끼리 비교하므로 기준가와 할인 요금의 수집 시점이 다를 수 있습니다. 수집일과 원문은 각 근거에서 확인하세요. AWS 스팟은 업로드한 SQL 백업의 관측값을 포함합니다. AZ별 스팟과 같은 리전의 온디맨드를 비교하며, 출처 기록의 API 재조회 검증은 수행하지 않았습니다.</p></div><div class="mv-tablebox" tabindex="0" role="region" aria-label="표: 가로로 스크롤하여 전체 열 확인"><table class="mv-table"><thead><tr><th>사업자 / 모델 / 상품</th><th>리전 / GPU 수</th><th>요금제 / 약정 / 지불</th><th>원본 금액 (USD)</th><th>USD / GPU·시간</th><th>온디맨드 기준가</th><th>온디맨드 대비 차이 / 할인율</th><th>수집일 (UTC) / 출처</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${mh(r.provider_name)} · ${mh(r.model_name)}<span>${mh(r.original_product_name)}</span></td><td>${mh(r.region_code)}${r.availability_zone?'<span>'+mh(r.availability_zone)+'</span>':''}<span>${r.gpu_count} GPU / VM</span></td><td>${mh(r.contract_product_type)}<span>${r.commitment_months?r.commitment_months+'개월':'기간 약정 없음'} · ${payment[r.payment_option]||'지불 방식 미확인'}</span></td><td>${r.components.map(c=>`${componentName[c.component_type]||mh(c.component_type)}: ${mp(c.amount)}`).join('<br>')}</td><td>${fxPrice(r.display_price)}<span>${mh(r.display_basis)}</span></td><td>${r.on_demand_price==null?'기준가 미확정':`${fxPrice(r.on_demand_price)}<span>${mh(r.on_demand_collected_at)}</span>${detailButton(r.on_demand_observation_id)}`}</td><td><b class="mv-saving ${discountClass(r)}">${discountText(r)}</b><span>${r.discount_percent==null?mh(r.discount_reason):`${r.saving_usd_gpu_hour<0?'추가':'절감'} ${mp(Math.abs(r.saving_usd_gpu_hour))} / GPU·시간 · 참고 비교`}</span></td><td>${mh(r.collected_at)}<span>${mlink(r.source_url,'공식 원문')}</span>${detailButton(r.observation_id)}</td></tr>`).join(''):'<tr><td colspan="8">선택 조건에 해당하는 수집 가격이 없습니다.</td></tr>'}</tbody></table></div>${mfooter()}</div>`;
  for(const [id,set] of [['contractModel',v=>contractModel=v],['contractProvider',v=>contractProvider=v],['contractType',v=>contractType=v],['contractTerm',v=>contractTerm=v]])$('#'+id).onchange=e=>{set(e.target.value);RENDER.discounts()};
  if($('#contractBaseline'))$('#contractBaseline').onchange=e=>{contractBaseline=e.target.value;contractChoices={};RENDER.discounts()};
  document.querySelectorAll('[data-contract-choice]').forEach(el=>el.onchange=e=>{contractChoices[el.dataset.contractChoice]=e.target.value;RENDER.discounts()});
  $('#contractCSV').onclick=()=>downloadCSV('GPU_spot_commitments_discounts.csv',['관측ID','사업자','모델','상품','리전','GPU수','계약종류','약정개월','지불방식','원본가격요소','비교USD_GPU시간','온디맨드USD_GPU시간','할인율퍼센트','절감USD_GPU시간','비교상태','비교사유','비교주의','온디맨드관측ID','온디맨드수집UTC','온디맨드적용일','온디맨드출처','계산상태','수집UTC','출처'],rows.map(r=>[r.observation_id,r.provider_name,r.model_name,r.original_product_name,r.region_code,r.gpu_count,r.contract_product_type,r.commitment_months,r.payment_option,JSON.stringify(r.components),r.display_price,r.on_demand_price,r.discount_percent,r.saving_usd_gpu_hour,r.discount_status,r.discount_reason,r.discount_notes.join(' '),r.on_demand_observation_id,r.on_demand_collected_at,r.on_demand_effective_from,r.on_demand_source_url,r.display_basis,r.collected_at,r.source_url]));
};
PAGES.discounts.tools=false;

const erdDisclosure={public:'공개가',quote_required:'견적 문의',login_required:'로그인 필요',not_disclosed:'가격 미공개',unknown:'미확인'};
const erdPayment={all_upfront:'전액 선납',partial_upfront:'일부 선납',no_upfront:'선납 없음'};
const erdMethod={api:'API',file:'공식 가격 파일',page:'페이지',manual:'수동 확인'};
const erdComponent={hourly_rate:'반복 시간요금',upfront_fee:'선납금',commitment_total:'약정 총액',list_price:'표시가',discount_rate:'할인율',range_min:'범위 하한',range_max:'범위 상한'};
marketEvidence=async id=>{const offer=await api('/api/market/offer/'+encodeURIComponent(id));if(offer?.observation_id)await showErdObservation(offer.observation_id);};
async function showErdObservation(id){
  if(String(id).startsWith('spring-')) return showSpringObservation(id);
  const d=await api('/api/erd/observation/'+encodeURIComponent(id));
  const fxInfo=await fxData();
  const o=d.observation,p=d.product,f=d.offer,c=d.check,n=d.normalizations[0];
  evidenceTrigger=document.activeElement;
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

