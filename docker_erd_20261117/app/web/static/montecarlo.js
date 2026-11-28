/* GPU market outlook: explicit mock source, twelve months, one-click local simulation. */
(() => {
 'use strict';
 const S={catalog:[],data:null,core:null,ready:null,result:null,worker:null,chart:null,busy:false,runId:0,futureOnly:false,showPaths:false,settings:null,provider:'',region:''};
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=value=>`$${Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
 const pct=value=>`${Math.abs(value*100).toFixed(1)}%`;
 const month=value=>value.replace('-','.');
 const stages=['가격 이력 확인','월별 변화 분석','미래 경로 생성','가격 범위 정리'];
 VIEWS.push('forecast');GRP_KEY.forecast='gBiz';PAGES.forecast={grp:'forecast',tools:false};PAGE_KEY.forecast='pForecast';
 SH.ko.pForecast='몬테카를로 시뮬레이션';SH.ko.d_forecast='향후 12개월 GPU 시장가격의 범위를 살펴봅니다.';
 READABLE_PAGES.forecast=['미래가격 분석','몬테카를로 시뮬레이션','가격의 흐름을 살펴보고, 앞으로의 범위를 확인합니다.'];
 PORTAL_ROUTES.push(['forecast','몬테카를로 시뮬레이션','12개월 미래가격 범위 · 목데이터 시연','graph-up-arrow','미래가격 예측 몬테카를로 시뮬레이션']);
 const root=document.createElement('section');root.id='v-forecast';root.className='view';root.hidden=true;$('content').append(root);
 function settings(){return S.core.validateSettings({nPaths:Number($('mfPaths').value),seed:$('mfSeed').value.trim()===''?NaN:Number($('mfSeed').value),blockLength:$('mfBlock').value.trim()===''?NaN:Number($('mfBlock').value),jumpProbability:$('mfJump').value.trim()===''?NaN:Number($('mfJump').value)/100});}
 function status(text,error=false){$('mfStatus').textContent=text;$('mfStatus').className='mf-status'+(error?' is-error':'');}
 function build(previousSettings){
  const data=S.data,first=data.history[0],last=data.history.at(-1),agg=data.aggregation;
  const providers=[...new Set(data.sourceSeries.map(x=>x.provider))].sort();
  const regions=[...new Set(data.sourceSeries.filter(x=>x.provider===S.provider).map(x=>x.region))].sort();
  root.innerHTML=`<div class="mf">
   <div class="mf-heading"><div><h2>앞으로 12개월, GPU 가격은 어떻게 움직일까요?</h2><p>하나의 예상 가격보다, 여러 가능성의 범위를 살펴봅니다.</p></div><button type="button" class="mf-method-link" id="mfMethodJump">어떻게 계산하나요? ↓</button></div>
   <div class="mf-layout"><div class="mf-main">
    <section id="mfChartPanel" class="mf-chart-panel" aria-label="가격 이력과 미래가격 범위">
     <div class="mf-chart-heading"><div><span class="mf-eyebrow">${esc(data.product)} · ${esc(data.scope)} · 온디맨드</span><h3>시장 대표가격 흐름</h3></div><span class="mf-unit">USD / GPU·시간</span></div>
     <div class="mf-metrics" id="mfMetrics"><div><span>마지막 시장 대표가격</span><strong>${money(last.price)}</strong><small>${month(last.month)} 기준</small></div><div><span>12개월 후 중앙값</span><strong class="mf-placeholder">—</strong><small>시뮬레이션 후 표시</small></div><div><span>12개월 후 가격 범위</span><strong class="mf-placeholder">—</strong><small>시뮬레이션 후 표시</small></div></div>
     <div class="mf-chart-tools"><div class="mf-legend"><span class="history">과거 시장 대표가격</span><span class="median">미래 중앙값</span><span class="range">모의 경로 중앙 80% 범위</span></div><button type="button" id="mfView" disabled aria-pressed="false">향후 12개월만 보기</button></div>
     <div class="mf-canvas-wrap"><canvas id="mfChart" role="img" aria-label="발표용 월별 가격 이력. 실행하면 향후 12개월 중앙값과 P10~P90 범위를 표시합니다."></canvas><div class="mf-chart-overlay" id="mfChartOverlay"><strong>미래의 범위를 계산해 보세요</strong><span>시뮬레이션을 실행하면 이 영역에 표시됩니다.</span></div></div>
     <div class="mf-chart-footer"><p>색칠한 범위는 모의 경로의 P10~P90입니다. 최저·최고 가격이나 예측 정확도 80%를 뜻하지 않습니다.</p><label><input type="checkbox" id="mfShowPaths" disabled>개별 경로 24개 보기</label></div>
    </section>
    <section id="mfInsights" class="mf-insights" hidden aria-label="시뮬레이션 결과 요약"></section>
   </div><aside class="mf-sidebar">
    <div class="mf-side-title"><span class="mf-eyebrow">SIMULATION</span><h3>가격 시뮬레이션</h3></div>
    <label class="mf-model-picker" for="mfModel">GPU 모델<select id="mfModel">${S.catalog.map(item=>`<option value="${esc(item.id)}" ${item.model===data.model?'selected':''}>${esc(item.product)}</option>`).join('')}</select><small>사업자·리전별 목데이터를 집계합니다.</small></label>
    <div class="mf-market-filters"><label for="mfProvider">사업자<select id="mfProvider"><option value="">전체 사업자</option>${providers.map(p=>`<option value="${esc(p)}" ${p===S.provider?'selected':''}>${esc(p)}</option>`).join('')}</select></label><label for="mfRegion">리전<select id="mfRegion" ${S.provider?'':'disabled'}><option value="">${S.provider?'해당 사업자의 전체 리전':'전체 리전'}</option>${regions.map(r=>`<option value="${esc(r)}" ${r===S.region?'selected':''}>${esc(r)}</option>`).join('')}</select></label></div>
    <form id="mfForm" novalidate><fieldset id="mfControls">
     <dl class="mf-dataset-facts"><div><dt>대상 GPU</dt><dd>${esc(data.product)}</dd></div><div><dt>집계 범위</dt><dd>${agg.providerCount}개 사업자 · ${agg.regionCount}개 리전</dd></div><div><dt>입력 자료</dt><dd>${agg.offerCount}개 상품 · ${agg.observationCount.toLocaleString()}개 월별 값</dd></div><div><dt>입력 데이터</dt><dd>${data.history.length}개월 · 목데이터</dd></div><div><dt>이력 기간</dt><dd>${month(first.month)} – ${month(last.month)}</dd></div><div><dt>전망 기간</dt><dd>${month(S.core.futureMonth(last.month,1))} – ${month(S.core.futureMonth(last.month,12))}</dd></div></dl>
     <button type="submit" class="mf-run" id="mfRun">12개월 시뮬레이션 실행 <span aria-hidden="true">→</span></button>
     <p class="mf-run-help">가격 이력을 바탕으로 여러 미래 경로를 자동 계산합니다.</p>
     <details class="mf-settings" id="mfSettings"><summary>세부 설정 <span id="mfSettingsSummary">20,000개 경로</span></summary><div class="mf-setting-fields">
      <label>계산할 경로 수<select id="mfPaths"><option value="1000">1,000개</option><option value="5000">5,000개</option><option value="20000" selected>20,000개</option><option value="50000">50,000개</option></select></label>
      <label>재현용 난수 시드<input id="mfSeed" type="number" min="0" max="2147483647" step="1" value="20261127" required></label>
      <label>평균 블록 길이 (개월)<input id="mfBlock" type="number" min="1" max="24" step="any" value="3" required></label>
      <label>월 추가 인하 이벤트 확률 (%)<input id="mfJump" type="number" min="0" max="100" step="any" value="0" required></label>
      <p>기본값은 추가 이벤트 미적용입니다. 적용하면 −30%~−5% 인하(최빈 −15%)를 가정합니다. 같은 데이터·설정·시드는 같은 결과를 만듭니다.</p>
     </div></details>
    </fieldset></form>
    <div id="mfStatus" class="mf-status" role="status" aria-live="polite"></div>
    <section class="mf-process" aria-label="계산 진행 상황"><div class="mf-process-title"><strong id="mfProcessTitle">분석 준비</strong><span id="mfProgressText">실행 대기</span></div><progress id="mfProgress" max="20000" value="0" aria-label="생성한 미래 가격 경로 수"></progress><ol>${stages.map((x,i)=>`<li id="mfStage${i}"><span class="mf-stage-icon">${i+1}</span><span>${x}</span><small id="mfStageNote${i}">대기</small></li>`).join('')}</ol><button type="button" id="mfCancel" hidden>계산 취소</button></section>
    <div class="mf-source-note"><strong>실제 데이터로 확장</strong><p>같은 GPU·계약·단위의 사업자별·리전별 가격 이력이 쌓이면, 동일한 집계 규칙으로 시장 대표가격을 만들고 검증합니다.</p><span>실제 데이터 연결은 아직 적용되지 않았습니다.</span></div>
   </aside></div>
   <section id="mfMethod" class="mf-method" aria-labelledby="mfMethodTitle" tabindex="-1">
    <div class="mf-method-heading"><h3 id="mfMethodTitle">어떻게 계산하나요?</h3><p>과거에 나타난 가격 변화를 여러 방식으로 조합해, 앞으로의 가능한 가격 범위를 계산합니다.</p></div>
    <div id="mfLogicContent"></div>
    <details class="mf-method-detail"><summary>계산식과 실행 근거 자세히 보기</summary>
     <p>집계식: 리전 대표값 = 해당 리전의 포함 상품 가격 중앙값. 사업자 대표값 = 해당 사업자의 리전 대표값 평균. 시장 대표가격 = 포함 사업자의 대표값 평균. 리전 수와 수집 건수가 많은 사업자에 자동으로 더 큰 비중을 주지 않습니다.</p>
     <p>월별 로그 변화율 r = ln(이번 달 가격 ÷ 지난달 가격). 마지막 가격에 선택한 변화율을 차례로 적용합니다.</p>
     <p>m개월 후 가격 = 마지막 가격 × exp(선택한 로그 변화율 r₁ + … + rₘ).</p>
     <p>정상 블록 부트스트랩: 매월 1 ÷ 평균 블록 길이의 확률로 과거 변화율의 시작점을 다시 뽑고, 나머지는 다음 변화율을 이어갑니다. 이력 끝에서는 처음으로 돌아갑니다. 따라서 매번 고정된 개월 수를 묶는 방식은 아닙니다.</p>
     <p>추가 인하 이벤트를 켜면 매월 해당 확률로 −30%~−5%(최빈 −15%)의 인하율을 삼각분포에서 뽑아 가격에 추가 적용합니다. 기본값은 미적용입니다.</p>
     <div id="mfRunEvidence"></div>
    </details>
   </section>
   <div class="mf-bottom">
    <details id="mfDataDetails" class="mf-disclosure"><summary><span>어떤 사업자·리전이 포함됐나요?</span><small>${agg.providerCount}개 사업자 · ${agg.regionCount}개 리전 · ${agg.offerCount}개 상품</small></summary>
     <p>현재 범위: <strong>${esc(data.scope)}</strong> · ${esc(data.product)} · 온디맨드 · USD/GPU·시간. 아래 가격과 상품은 모두 목데이터이며 사업자·리전 명칭만 수집 카탈로그를 참고했습니다. 실제 GPU 제공 여부나 가격을 뜻하지 않습니다.</p>
     <p>카탈로그 7개 사업자 중 리전 코드가 확인되는 6개 사업자·56개 사업자/리전 조합으로 시연합니다. Oracle은 리전 미확인으로 제외했고 가용영역(-azN)은 리전에 중복 합산하지 않았습니다.</p>
     <p>${data.history.length}개월 모두 유효한 가격이 있는 상품만 고정해서 사용합니다. 현재 선택 범위에서 ${agg.excluded.length}개 상품 제외. 누락 월은 임의로 채우지 않습니다.</p>
     <div class="mf-table-wrap"><table><thead><tr><th>사업자</th><th>마지막 월 사업자 대표가격</th><th>시장 집계 비중</th></tr></thead><tbody>${agg.monthly.at(-1).providers.map(x=>`<tr><td>${esc(x.provider)}</td><td>${money(x.price)}</td><td>${(100/agg.providerCount).toFixed(2)}%</td></tr>`).join('')}</tbody></table></div>
     <div class="mf-table-wrap"><table><thead><tr><th>사업자</th><th>리전</th><th>포함 상품</th><th>마지막 월 대표가격</th><th>전체 집계 비중</th></tr></thead><tbody>${agg.members.map(x=>`<tr><td>${esc(x.provider)}</td><td>${esc(x.region)}</td><td>${x.offerCount}</td><td>${money(x.lastPrice)}</td><td>${(x.weight*100).toFixed(2)}%</td></tr>`).join('')}</tbody></table></div>
     ${agg.excluded.length?`<details><summary>제외한 상품 ${agg.excluded.length}개와 사유</summary><ul>${agg.excluded.map(x=>`<li>${esc(x.provider)} / ${esc(x.region)} · ${esc(x.id)}: ${esc(x.reason)}</li>`).join('')}</ul></details>`:''}
     <details><summary>월별 시장 대표가격 ${data.history.length}개월</summary><div class="mf-table-wrap"><table><thead><tr><th>월</th><th>대표가격 (USD/GPU·시간)</th><th>사업자 수</th><th>리전 수</th></tr></thead><tbody>${data.history.map(x=>`<tr><td>${month(x.month)}</td><td>${money(x.price)}</td><td>${agg.providerCount}</td><td>${agg.regionCount}</td></tr>`).join('')}</tbody></table></div></details>
     <button type="button" id="mfDataExport">시장 대표가격 CSV</button> <button type="button" id="mfRawExport">포함·제외 상품 원자료 CSV</button></details>

   </div>
  </div>`;
  if(previousSettings)for(const [id,value] of Object.entries(previousSettings))$(id).value=value;
  $('mfSettingsSummary').textContent=Number($('mfPaths').value).toLocaleString()+'개 경로';
  updateMethod();
  $('mfMethodJump').onclick=()=>{$('mfMethod').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});$('mfMethod').focus({preventScroll:true});};
  $('mfModel').onchange=()=>selectModel($('mfModel').value);
  $('mfProvider').onchange=()=>selectScope($('mfProvider').value,'');
  $('mfRegion').onchange=()=>selectScope(S.provider,$('mfRegion').value);
  $('mfForm').onsubmit=event=>{event.preventDefault();run();};
  $('mfForm').oninput=()=>invalidate();$('mfForm').onchange=()=>invalidate();
  $('mfCancel').onclick=()=>cancel();
  $('mfView').onclick=()=>{S.futureOnly=!S.futureOnly;$('mfView').textContent=S.futureOnly?'과거 이력 함께 보기':'향후 12개월만 보기';$('mfView').setAttribute('aria-pressed',String(S.futureOnly));drawChart();};
  $('mfShowPaths').onchange=()=>{S.showPaths=$('mfShowPaths').checked;drawChart();};
  $('mfDataExport').onclick=()=>save(`GPU_${data.model}_MOCK_history.csv`,'model,dataset_id,scope,month,price_usd_per_gpu_hour,source,aggregation\n'+data.history.map(x=>`${data.model},${data.id},${data.scope},${x.month},${x.price},MOCK,${agg.method}`).join('\n'),'text/csv;charset=utf-8');
  $('mfRawExport').onclick=()=>{const included=new Set(agg.includedIds),excluded=new Map(agg.excluded.map(x=>[x.id,x.reason]));save(`GPU_${data.model}_MOCK_market_sources.csv`,'model,provider,region,offer_id,month,price_usd_per_gpu_hour,source,included,exclusion_reason\n'+data.sourceSeries.filter(o=>included.has(o.id)||excluded.has(o.id)).flatMap(o=>o.history.map(x=>`${data.model},${o.provider},${o.region},${o.id},${x.month},${x.price},MOCK,${included.has(o.id)},${excluded.get(o.id)||''}`)).join('\n'),'text/csv;charset=utf-8');};
  drawChart();
 }
 function updateMethod(){
  const data=S.data,first=data.history[0],next=data.history[1],last=data.history.at(-1);
  let config;try{config=settings();}catch(error){$('mfLogicContent').innerHTML=`<p class="mf-method-note">${esc(error.message)} 설정을 수정하면 적용 조건이 표시됩니다.</p>`;return;}
  const change=next.price/first.price-1,changeText=`${pct(change)} ${change<0?'하락':'상승'}`;
  $('mfLogicContent').innerHTML=`<ol class="mf-logic-steps">
   <li><span class="mf-logic-number">01</span><div><h4>여러 사업자·리전의 가격을 월별로 집계</h4><p><strong>${esc(data.product)} · ${esc(data.scope)}</strong>의 ${data.aggregation.providerCount}개 사업자·${data.aggregation.regionCount}개 리전·${data.aggregation.offerCount}개 상품을 사용합니다. 동일 GPU·온디맨드·USD/GPU·시간으로 분류하고, 리전별 상품 중앙값 → 사업자 내 리전 평균 → 사업자 평균 순서로 ${data.history.length}개월 시장 대표가격을 만듭니다.</p><small>리전은 사업자 안에서 동일 비중, 사업자는 시장 집계에서 동일 비중입니다. 실제 시장점유율 가중치나 모든 상품의 단순 중앙값이 아닙니다. 전체 기간에 이력이 있는 상품 구성을 고정합니다.</small></div></li>
   <li><span class="mf-logic-number">02</span><div><h4>월마다 얼마나 변했는지 계산</h4><p>집계한 시장 대표가격의 지난달 대비 상승·하락 비율을 구합니다. ${data.history.length}개월 이력에서 <strong>${data.history.length-1}개의 월별 변화율</strong>을 얻습니다.</p><small>시장 대표가격 예시: ${month(first.month)} ${money(first.price)} → ${month(next.month)} ${money(next.price)} · 약 ${changeText} <br>화면 예시는 반올림한 일반 변화율이며, 계산에는 로그 변화율을 사용합니다.</small></div></li>
   <li><span class="mf-logic-number">03</span><div><h4>12개월 시나리오를 ${config.nPaths.toLocaleString()}번 생성</h4><p>마지막 시장 대표가격 <strong>${money(last.price)}</strong>에서 시작합니다. 과거 변화율을 평균 <strong>${config.blockLength}개월</strong>씩 이어 뽑아, 가격이 연속해서 오르거나 내리는 패턴을 일부 유지하며 12개월 경로를 만듭니다.</p><small>한 경로 = 앞으로 12개월의 가상 가격 흐름. 과거 패턴이 미래에도 이어진다는 가정입니다.</small></div></li>
   <li><span class="mf-logic-number">04</span><div><h4>매월의 가격을 정렬해 선과 범위로 표시</h4><p>각 월의 ${config.nPaths.toLocaleString()}개 가격을 낮은 순서로 정렬합니다. <strong>가운데 값(P50)은 빨간 선</strong>, 아래 10% 지점(P10)부터 90% 지점(P90)까지는 색칠한 범위로 보여줍니다.</p><small>시장 대표가격의 미래 분포입니다. 현재 리전별 최저·최고 가격 차이나 개별 상품의 미래가격을 뜻하지 않습니다.</small></div></li>
  </ol>
  <div class="mf-method-settings"><strong>현재 적용 조건</strong><span>경로 ${config.nPaths.toLocaleString()}개</span><span>평균 블록 ${config.blockLength}개월</span><span>재현 시드 ${config.seed}</span><span>추가 인하 이벤트 ${config.jumpProbability===0?'미적용':`월 ${pct(config.jumpProbability)}`}</span></div>
  <p class="mf-method-note"><strong>결과는 이렇게 활용하세요.</strong> 중앙값과 범위를 함께 보며 가격 하락·상승 시나리오를 검토하세요. 색칠한 범위는 최저·최고 가격이나 검증된 적중 확률이 아닙니다. 같은 자료·설정·시드는 같은 결과를 만들며, 경로 수를 늘려도 실제 가격 이력이 부족한 문제는 해결되지 않습니다.</p>`;
 }
 function selectModel(id){
  const data=S.catalog.find(item=>item.id===id);if(!data||data===S.data)return;
  const rerun=!!S.result||S.busy;
  const previousSettings=Object.fromEntries(['mfPaths','mfSeed','mfBlock','mfJump'].map(id=>[id,$(id).value]));
  S.runId++;stopWorker();S.busy=false;S.result=null;S.settings=null;S.futureOnly=false;S.showPaths=false;
  S.chart?.destroy();S.chart=null;S.provider='';S.region='';S.data=data;build(previousSettings);
  status(`${data.product} 목데이터를 선택했습니다. 시뮬레이션을 실행해 가격 범위를 확인하세요.`);
  if(rerun)run();
 }
 function selectScope(provider,region){
  const group=S.catalog.find(x=>x.model===S.data.model),rerun=!!S.result||S.busy;
  let data;try{data=S.core.aggregateMarket(group,{provider,region});}catch(error){$('mfProvider').value=S.provider;$('mfRegion').value=S.region;status(error.message,true);return;}
  const previousSettings=Object.fromEntries(['mfPaths','mfSeed','mfBlock','mfJump'].map(id=>[id,$(id).value]));
  S.runId++;stopWorker();S.busy=false;S.result=null;S.settings=null;S.futureOnly=false;S.showPaths=false;
  S.chart?.destroy();S.chart=null;S.provider=provider;S.region=region;S.data=data;build(previousSettings);
  status(`${data.scope}의 시장 대표가격을 집계했습니다.`);if(rerun)run();
 }
 function setStage(active,complete=false){
  stages.forEach((_,index)=>{const li=$('mfStage'+index);li.className=complete||index<active?'is-complete':index===active?'is-active':'';li.querySelector('.mf-stage-icon').textContent=complete||index<active?'✓':String(index+1);if(index===active&&!complete)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
 }
 function resetProgress(){
  setStage(-1);stages.forEach((_,i)=>$('mfStageNote'+i).textContent='대기');$('mfProgress').value=0;$('mfProgressText').textContent='실행 대기';$('mfProcessTitle').textContent='분석 준비';
 }
 function invalidate(){
  if(S.busy)cancel();S.result=null;S.futureOnly=false;S.showPaths=false;
  $('mfInsights').hidden=true;$('mfRunEvidence').innerHTML='';$('mfView').disabled=true;$('mfView').setAttribute('aria-pressed','false');$('mfView').textContent='향후 12개월만 보기';$('mfShowPaths').disabled=true;$('mfShowPaths').checked=false;
  $('mfSettingsSummary').textContent=Number($('mfPaths').value).toLocaleString()+'개 경로';
  updateMethod();resetProgress();metrics();drawChart();status('설정이 변경되었습니다. 다시 실행하면 새로운 가격 범위를 계산합니다.');
 }
 function metrics(){
  const last=S.data.history.at(-1),end=S.result?.monthly.at(-1);
  $('mfMetrics').innerHTML=`<div><span>마지막 시장 대표가격</span><strong>${money(last.price)}</strong><small>${month(last.month)} 기준</small></div><div><span>12개월 후 중앙값</span><strong class="${end?'mf-accent':'mf-placeholder'}">${end?money(end.p50):'—'}</strong><small>${end?`${pct(end.p50/last.price-1)} ${end.p50>=last.price?'상승':'하락'} · 마지막 목데이터 대비`:'시뮬레이션 후 표시'}</small></div><div><span>12개월 후 가격 범위</span><strong class="${end?'':'mf-placeholder'}">${end?`${money(end.p10)}–${money(end.p90)}`:'—'}</strong><small>${end?'모의 경로 중앙 80% · P10~P90':'시뮬레이션 후 표시'}</small></div>`;
 }
 function drawChart(){
  S.chart?.destroy();S.chart=null;
  const data=S.data,result=S.result,last=data.history.at(-1),history=S.futureOnly?[last]:data.history,split=history.length-1;
  const labels=[...history.map(x=>x.month),...Array.from({length:12},(_,i)=>S.core.futureMonth(last.month,i+1))],blank=Array(split).fill(null);
  const future=key=>result?[...blank,last.price,...result.monthly.map(x=>x[key])]:Array(labels.length).fill(null);
  const sets=[{label:'가격 범위 하한 P10',data:future('p10'),borderWidth:0,pointRadius:0,fill:false},
   {label:'가격 범위 상한 P90',data:future('p90'),backgroundColor:'rgba(234,0,44,.10)',borderWidth:0,pointRadius:0,fill:'-1'},
   {label:'과거 시장 대표가격',data:[...history.map(x=>x.price),...Array(12).fill(null)],borderColor:'#66788d',borderWidth:2.5,pointRadius:0,pointHoverRadius:4,fill:false},
   {label:'미래 중앙값 P50',data:future('p50'),borderColor:'#ea002c',borderWidth:2.6,pointRadius:0,pointHoverRadius:5,fill:false}];
  // Visible sample trajectories are actual simulated paths; they are not decorative curves.
  if(S.showPaths&&result)result.samplePaths.forEach(path=>sets.push({label:'모의 경로',data:[...blank,...path],borderColor:'rgba(217,113,52,.15)',borderWidth:.8,pointRadius:0,fill:false,order:2}));
  const divider={id:'mfForecastDivider',beforeDatasetsDraw(chart){const {ctx,chartArea,scales}=chart;if(!chartArea)return;const x=scales.x.getPixelForValue(split);ctx.save();ctx.fillStyle='rgba(245,247,250,.6)';ctx.fillRect(x,chartArea.top,chartArea.right-x,chartArea.bottom-chartArea.top);ctx.strokeStyle='#adb5c0';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x,chartArea.top);ctx.lineTo(x,chartArea.bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#7a8392';ctx.font='11px sans-serif';ctx.fillText('시뮬레이션 시작',Math.min(x+8,chartArea.right-100),chartArea.top+16);ctx.restore();}};
  S.chart=new Chart($('mfChart'),{type:'line',data:{labels,datasets:sets},plugins:[divider],options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},elements:{line:{tension:0}},plugins:{legend:{display:false},tooltip:{filter:item=>item.raw!==null&&item.datasetIndex<4&&!(item.datasetIndex<2&&item.dataIndex<=split),callbacks:{title:items=>items.length?`${items[0].label}${items[0].dataIndex>split?' · 모의 미래가격':' · 목데이터'}`:'',label:context=>`${context.dataset.label}: ${money(context.raw)}`}}},scales:{x:{grid:{display:false},ticks:{autoSkip:false,maxRotation:0,color:'#7b8594',callback:function(value){const visible=split===0?[0,3,6,9,12]:[0,Math.round(split/2),split,split+6,split+12];return visible.includes(value)?month(this.getLabelForValue(value)):'';}}},y:{beginAtZero:false,grace:'12%',grid:{color:'#edf0f4'},border:{display:false},ticks:{color:'#7b8594',callback:money}}}}});
  $('mfChartOverlay').hidden=!!result||S.futureOnly;
  $('mfChart').setAttribute('aria-label',result?'발표용 목데이터 이력과 향후 12개월 모의 가격 중앙값 및 P10~P90 범위. 월별 수치는 아래 상세 표에서 확인할 수 있습니다.':'발표용 목데이터 가격 이력. 실행 전에는 미래가격을 표시하지 않습니다.');
 }
 function progress(p){
  if(p.stage==='validated'){setStage(0);$('mfStageNote0').textContent=p.historyCount+'개월 확인';}
  if(p.stage==='analyzed'){setStage(1);$('mfStageNote1').textContent='변화율 분석 완료';}
  if(p.stage==='paths'){setStage(2);$('mfStageNote2').textContent=p.completed.toLocaleString()+'개';$('mfProgress').value=p.completed;$('mfProgressText').textContent=`${p.completed.toLocaleString()} / ${p.total.toLocaleString()}`;}
  if(p.stage==='summarizing'){setStage(3);$('mfStageNote3').textContent='월별 분위수 계산';}
 }
 function stopWorker(){S.worker?.terminate();S.worker=null;}
 function finish(){S.busy=false;stopWorker();$('mfControls').disabled=false;$('mfCancel').hidden=true;$('mfRun').innerHTML='12개월 시뮬레이션 다시 실행 <span aria-hidden="true">↻</span>';$('mfForm').setAttribute('aria-busy','false');}
 function cancel(){if(!S.busy)return;S.runId++;finish();resetProgress();$('mfProcessTitle').textContent='계산 취소';status('계산을 취소했습니다. 다시 실행할 수 있습니다.');}
 async function run(){
  if(S.busy)return;
  let config;try{config=settings();}catch(error){$('mfSettings').open=true;status(error.message,true);$('mfForm').reportValidity();return;}
  stopWorker();const id=++S.runId;S.busy=true;S.result=null;S.futureOnly=false;S.showPaths=false;S.settings=config;
  $('mfView').disabled=true;$('mfView').textContent='향후 12개월만 보기';$('mfView').setAttribute('aria-pressed','false');$('mfShowPaths').checked=false;$('mfShowPaths').disabled=true;
  $('mfInsights').hidden=true;$('mfRunEvidence').innerHTML='';$('mfControls').disabled=true;$('mfForm').setAttribute('aria-busy','true');$('mfCancel').hidden=false;$('mfRun').textContent='미래 가격 경로 계산 중…';
  resetProgress();$('mfProgress').max=config.nPaths;$('mfProcessTitle').textContent='시뮬레이션 진행 중';metrics();drawChart();status('브라우저에서 목데이터를 계산하고 있습니다.');
  try{
   const worker=new Worker('/static/montecarlo-worker.mjs?v=market1127',{type:'module'});S.worker=worker;
   const failed=message=>{if(id!==S.runId)return;finish();$('mfProcessTitle').textContent='계산 중단';setStage(-1);status(message,true);};
   worker.onerror=()=>failed('계산 모듈을 실행하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.');
   worker.onmessage=({data})=>{
    if(id!==S.runId)return;
    if(data.type==='progress'){progress(data.progress);return;}
    if(data.type==='error'){failed(data.message);return;}
    if(data.type==='result'){
     S.result=data.result;finish();setStage(3,true);$('mfProgress').value=config.nPaths;$('mfProgressText').textContent=config.nPaths.toLocaleString()+'개 완료';$('mfProcessTitle').textContent='분석 완료';$('mfStageNote3').textContent='12개월 범위 산출';
     $('mfView').disabled=false;$('mfShowPaths').disabled=false;metrics();drawChart();renderInsights();status('완료 · 목데이터 기반 시뮬레이션 결과입니다.');
     if(location.hash==='#forecast')$('mfChartPanel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    }
   };
   worker.postMessage({dataset:S.data,settings:config});
  }catch(error){finish();$('mfProcessTitle').textContent='계산 중단';status('계산 모듈을 시작하지 못했습니다. '+error.message,true);}
 }
 function renderInsights(){
  const r=S.result,end=r.monthly.at(-1),last=r.evidence.lastPrice,delta=end.p50/last-1,down=delta<0;
  $('mfInsights').hidden=false;$('mfInsights').innerHTML=`<div class="mf-insight-heading"><div><span class="mf-eyebrow">결과 읽기</span><h3>${esc(r.dataset.product)} · ${esc(r.dataset.scope)} · 12개월 후 중앙값은 ${money(end.p50)}입니다</h3></div><button type="button" id="mfResultExport">월별 결과 CSV ↓</button></div><p class="mf-insight-copy">마지막 시장 대표가격 ${money(last)} 대비 <strong>${pct(delta)} ${down?'낮은':'높은'}</strong> 수준입니다. 모의 경로의 중앙 80%는 <strong>${money(end.p10)}~${money(end.p90)}</strong>에 분포합니다.</p><div class="mf-horizons">${[3,6,12].map(n=>{const m=r.monthly[n-1];return `<div><span>${n}개월 후 <small>${month(m.date)}</small></span><strong>${money(m.p50)}</strong><small>P10~P90 ${money(m.p10)}~${money(m.p90)}</small></div>`;}).join('')}</div><p class="mf-insight-foot">여러 사업자·리전의 목데이터를 집계한 시장 대표가격의 변화 패턴을 재사용한 결과입니다. 실제 시장의 미래 가격을 검증한 예측은 아닙니다.</p><details class="mf-monthly"><summary>12개월 월별 결과 보기</summary><div class="mf-table-wrap"><table><thead><tr><th>시점</th><th>하단 P10</th><th>중앙값 P50</th><th>상단 P90</th></tr></thead><tbody>${r.monthly.map(m=>`<tr><td>${month(m.date)} · ${m.month}개월 후</td><td>${money(m.p10)}</td><td>${money(m.p50)}</td><td>${money(m.p90)}</td></tr>`).join('')}</tbody></table></div></details>`;
  $('mfResultExport').onclick=()=>save(`GPU_${S.data.model}_MOCK_12month_forecast.csv`,'model,dataset_id,scope,aggregation,month,horizon_months,p10_usd_per_gpu_hour,p50_usd_per_gpu_hour,p90_usd_per_gpu_hour,source,n_paths,seed\n'+r.monthly.map(x=>`${S.data.model},${r.dataset.id},${r.dataset.scope},${r.dataset.aggregation.method},${x.date},${x.month},${x.p10},${x.p50},${x.p90},MOCK,${r.settings.nPaths},${r.settings.seed}`).join('\n'),'text/csv;charset=utf-8');
  $('mfRunEvidence').innerHTML=`<dl class="mf-evidence"><div><dt>계산 모델</dt><dd>정상 블록 부트스트랩 · ${esc(r.meta.modelVersion)}</dd></div><div><dt>실행 설정</dt><dd>${r.settings.nPaths.toLocaleString()}개 경로 · 시드 ${r.settings.seed} · 평균 블록 ${r.settings.blockLength}개월</dd></div><div><dt>추가 인하 이벤트</dt><dd>${r.settings.jumpProbability===0?'미적용':`월 ${pct(r.settings.jumpProbability)} · −30%~−5% (최빈 −15%)`}</dd></div><div><dt>집계 범위·규칙</dt><dd>${esc(r.dataset.scope)} · ${r.dataset.aggregation.providerCount}개 사업자 · ${r.dataset.aggregation.regionCount}개 리전 · ${esc(r.dataset.aggregation.method)}</dd></div><div><dt>입력 자료</dt><dd>${esc(r.dataset.id)} · ${r.history.length}개월 · 목데이터</dd></div><div><dt>계산 시각</dt><dd>${new Date(r.meta.runAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST</dd></div></dl>`;
 }
 function save(name,content,type){const url=URL.createObjectURL(new Blob(['\uFEFF'+content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 // Legacy price-review links cannot silently feed cost inputs into a market forecast.
 window.GpuMonteCarlo={applyReview:async()=>{throw Error('몬테카를로는 12개월 시장가격 범위 시연으로 변경되었습니다. 시뮬레이션 화면에서 실행하세요.');}};
 RENDER.forecast=async()=>{
  calculatorFrame('몬테카를로 시뮬레이션','향후 12개월 GPU 시장가격 범위 · 발표용 목데이터 시연');
  if(S.data)return;
  if(!S.ready){root.innerHTML='<div class="mf mf-loading" role="status">시연용 가격 이력을 준비하고 있습니다…</div>';S.ready=Promise.all([import('/static/montecarlo-core.mjs?v=market1127'),fetch('/static/montecarlo-demo-catalog.json?v=market1127',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('목데이터를 불러오지 못했습니다.');return response.json();})]).then(([core,catalog])=>{S.core=core;S.catalog=core.validateDemoCatalog(catalog);S.data=S.catalog[0];build();}).catch(error=>{S.data=null;root.innerHTML=`<div class="mf mf-loading" role="alert">${esc(error.message)} 새로고침 후 다시 시도하세요.</div>`;S.ready=null;});}
  await S.ready;
 };
})();
