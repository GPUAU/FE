/* A single in-memory review joining cost, utilization, IRR and the PM preview. */
(() => {
 'use strict';
 const $d=id=>document.getElementById(id),esc=mh,money=mp;
 const percent=v=>v==null?'산출 불가':(v*100).toFixed(2)+'%';
 const D={draft:null,version:-1,result:null,records:null,loading:false,error:'',partial:'',request:0,recordId:'',term:'ON_DEMAND',region:'ALL',rates:[null,null,null],upper:null};
 const keys={initial:'초기 투자금 (USD)',years:'분석 기간 (년 · 정수)',gpu:'GPU 수',opex:'연간 현금 운영비 (USD)',salvage:'말기 잔존가치 (USD)',util:'현재 유료 가동률 (%)',target:'목표 IRR (연 %)',price:'후보가격 (USD/GPU·시간)'};
 VIEWS.push('decision');GRP_KEY.decision='gBiz';PAGES.decision={grp:'decision',tools:false};PAGE_KEY.decision='pDecision';SH.ko.pDecision='가격 검토';SH.ko.d_decision='공통 가정으로 가동률·IRR과 후보가격을 검토합니다.';
 READABLE_PAGES.decision=['PRICE REVIEW','가격 검토','원가와 시장 근거를 한 흐름으로 확인하세요.'];
 PORTAL_ROUTES.push(['decision','가격 검토','가동률 비교 · 경쟁사 차이 · 추천 조건','calculator','가동률 원가 IRR 추천 후보가격']);
 const root=document.createElement('section');root.id='v-decision';root.className='view';root.hidden=true;$d('content').append(root);
 const field=(id,title,value)=>`<label class="mc-field">${title}<input id="${id}" type="number" step="any" value="${esc(value??'')}"></label>`;
 const table=(heads,rows)=>`<div class="mc-tablebox" tabindex="0" role="region" aria-label="가격 검토 표 · 가로 스크롤 가능"><table><thead><tr>${heads.map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
 const row=xs=>`<tr>${xs.map(x=>`<td>${x}</td>`).join('')}</tr>`;
 const num=id=>$d(id).value.trim()===''?null:Number($d(id).value);
 function input(){return Object.fromEntries(Object.keys(keys).map(k=>[k,['util','target'].includes(k)&&num('review-'+k)!=null?num('review-'+k)/100:num('review-'+k)]));}
 function flash(text,error=false){$d('reviewStatus').textContent=text;$d('reviewStatus').className='mc-status'+(error?' error':'');}
 function readDraft(){D.draft={...D.draft,input:input(),model:$d('reviewModel').value};D.upper=num('reviewUpper');D.rates=[0,1,2].map(i=>num('reviewUtil'+i)==null?null:num('reviewUtil'+i)/100);}
 function clearResult(text){D.result=null;if($d('reviewResult')){$d('reviewResult').hidden=true;$d('reviewResult').textContent='';}$d('reviewExport').disabled=true;$d('reviewSimulation').disabled=true;$d('reviewToIrr').disabled=true;flash(text);paintComparison();}
 function dirty(e){
  readDraft();
  if(['review-initial','review-opex','review-salvage','review-years','review-gpu','reviewModel'].includes(e.target.id))D.draft={...D.draft,costAnnual:null,costComplete:false,missing:['원가 입력과 별도로 수정한 투자·비용'],origin:'가격 검토에서 직접 수정',dependsOn:[]};
  GpuFlow.invalidate('가격 검토 입력 변경 · 재계산 필요');D.version=GpuFlow.get().revision;
  clearResult('입력이 변경되었습니다. 가동률·IRR 비교를 다시 계산하세요.');
 }
 window.openPriceReview=snapshot=>{GpuFlow.set({...snapshot,model:snapshot.model||'B300'});D.rates=[null,null,null];D.upper=null;location.hash==='#decision'?RENDER.decision():location.hash='#decision';};
 function importCost(){if(!V02.cost)return flash('원가 화면에서 먼저 계산하세요.',true);window.openPriceReview(GpuDecision.fromCost(V02.cost,V02.irrInput?.target??null));}
 function importIrr(){if(!V02.irrResult)return flash('IRR 화면에서 먼저 다시 계산하세요.',true);window.openPriceReview({...V02.irrContext,input:V02.irrInput,origin:V02.irrProvenance||'IRR 직접 입력',dependsOn:[...(V02.irrContext?.dependsOn||[]),'irr']});}
 function results(snapshot,preserve=false){
  const rows=GpuDecision.scenarios(snapshot.input,D.rates,snapshot.costAnnual),r=GpuDecision.review(snapshot,D.upper);
  const version=preserve?GpuFlow.get().revision:GpuFlow.set(snapshot);D.version=version;D.draft=snapshot;D.result={snapshot:structuredClone(snapshot),rates:D.rates.slice(),upper:D.upper,rows,review:r,revision:version,calculatedAt:new Date().toISOString()};
  const a=snapshot.input;
  $d('reviewResult').hidden=false;
  $d('reviewResult').innerHTML=`<section class="mc-panel"><h3>가동률별 결과 비교</h3><p class="mc-subtle">동일 투자비·운영비·판매가에서 가동률만 변경한 결정론적 가정입니다. 수요 예측이나 확률 시나리오가 아닙니다. 연 8,760시간, 세전·무차입 기준입니다.</p>${table(['가정 / 유료 가동률','연 매출','연 운영 현금흐름','연 IRR','목표 IRR 필요가','연간 환산 원가','선택'],rows.map((x,i)=>row([`${x.label} · ${percent(x.util)}`,money(x.revenue),money(x.cash),x.irr.value==null?esc(x.irr.reason):percent(x.irr.value)+(x.meets?' · 충족':' · 미충족'),money(x.minimum),money(x.costUnit),`<button type="button" data-review-util="${i}">이 가동률 적용</button>`])))}<p class="mc-subtle">연 운영 현금흐름 = 매출 − 현금 운영비. 초기 투자금은 0년, 잔존가치는 마지막 해에 한 번 반영합니다. ‘연간 환산 원가’는 원가 화면에서 가져온 경우에만 표시합니다.</p></section>
   <section class="mc-panel" id="reviewRecommendation"><h3>추천 검토 범위와 미충족 사유</h3><span class="mc-chip">${{conflict:'충족 구간 없음',missing:'상한 입력 대기',conditional:'조건부 검토',available:'사용자 조건의 검토 구간'}[r.state]}</span>
   <div class="mc-kpis review-kpis"><div class="mc-kpi"><span>필요 하한</span><strong>${money(r.lower)}</strong><small>원가와 목표 IRR 필요가 중 큰 값</small></div><div class="mc-kpi"><span>사용자 가격 상한</span><strong>${r.upper==null?'미입력':money(r.upper)}</strong><small>시장 상한으로 검증된 값이 아님</small></div><div class="mc-kpi emphasis"><span>사용자 조건 검토 구간</span><strong>${r.interval?money(r.interval[0])+' ~ '+money(r.interval[1]):r.state==='conflict'?'구간 없음':'판정 대기'}</strong><small>USD / GPU·시간 · 최종 추천 아님</small></div></div>
   <div class="mc-note"><b>계산 근거</b>목표 연 IRR ${percent(a.target)} 필요가 ${money(r.irrFloor)} · 원가 하한 ${r.costFloor==null?'연결된 원가 없음':money(r.costFloor)} · 선택 가동률 ${percent(a.util)}<br>후보가격 ${money(a.price)}의 IRR: ${r.irr.value==null?esc(r.irr.reason):percent(r.irr.value)}<br>입력 출처: ${esc(snapshot.origin)} · ${esc(snapshot.periodNote||'연 8,760시간 가정')}</div>
   <h4>입력 조건 점검</h4><ul>${r.reasons.length?r.reasons.map(x=>`<li>${esc(x)}</li>`).join(''):'<li>입력한 원가·목표 IRR·가격 상한 조건을 충족했습니다.</li>'}</ul><div class="mc-note warn"><b>최종 추천 확정 전 필요한 검증</b>${esc(r.marketStatus)}. 경쟁사 참고 가격이나 PM 가상 예측을 자동으로 상한에 넣지 않습니다. 위 조건 충족은 실제 계약 가능성이나 수익을 보장하지 않습니다.</div></section>`;
  root.querySelectorAll('[data-review-util]').forEach(b=>b.onclick=()=>{$d('review-util').value=D.rates[+b.dataset.reviewUtil]*100;readDraft();calculate();});
  $d('reviewExport').disabled=false;$d('reviewToIrr').disabled=false;$d('reviewSimulation').disabled=false;
  flash('가동률·IRR 비교 완료. 선택한 가정을 IRR이나 시뮬레이션으로 이어서 검토할 수 있습니다.');paintComparison();paintSimulation();
 }
 function calculate(){
  readDraft();clearResult('계산 중…');
  try{results({...D.draft,input:input(),model:$d('reviewModel').value});}
  catch(e){GpuFlow.invalidate('가격 검토 계산 미완료');D.version=GpuFlow.get().revision;flash(e.message,true);}
 }
 function filtered(){return (D.records||[]).filter(r=>r.model===$d('reviewModel').value&&r.term===D.term&&(D.region==='ALL'||r.region===D.region));}
 function paintMarket(){
  const box=$d('reviewMarket');if(!box)return;
  if(D.loading){box.innerHTML='<p role="status">저장된 가격 자료를 조회하고 있습니다…</p>';return;}
  if(D.error){box.innerHTML=`<p class="mc-status error">${esc(D.error)}</p><button type="button" id="reviewMarketRetry">가격 자료 다시 조회</button>`;$d('reviewMarketRetry').onclick=loadMarket;return;}
  const model=$d('reviewModel').value,regions=[...new Set((D.records||[]).filter(r=>r.model===model&&r.term===D.term).map(r=>r.region||''))].sort();
  if(!regions.includes(D.region))D.region='ALL';
  const rs=filtered();if(!rs.some(r=>String(r.id)===D.recordId))D.recordId=rs[0]?String(rs[0].id):'';
  box.innerHTML=`${D.partial?`<div class="mc-note warn">${esc(D.partial)}</div>`:""}<div class="mc-fields"><label class="mc-field">경쟁 상품 과금 방식<select id="reviewTerm">${Object.entries(MT).map(([k,v])=>`<option value="${k}" ${k===D.term?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label class="mc-field">경쟁 상품 리전<select id="reviewRegion"><option value="ALL">전체</option>${regions.map(x=>`<option value="${esc(x)}" ${x===D.region?'selected':''}>${esc(x||'미확인')}</option>`).join('')}</select></label><label class="mc-field full">비교할 저장 상품 (${rs.length}개)<select id="reviewOffer">${rs.map(r=>`<option value="${esc(r.id)}" ${String(r.id)===D.recordId?'selected':''}>${esc(r.provider)} · ${esc(r.product_original||r.sku)} · ${esc(r.region)} · ${r.gpu_count??'?'} GPU · ${esc(r.term_original||r.term)} · ${money(r.normalized_price)}</option>`).join('')||'<option value="">선택 조건의 가격 자료 없음</option>'}</select></label></div><div id="reviewComparison"></div><button type="button" id="reviewMarketRefresh">저장 데이터 다시 조회</button>`;
  $d('reviewTerm').onchange=e=>{D.term=e.target.value;D.region='ALL';D.recordId='';paintMarket();};$d('reviewRegion').onchange=e=>{D.region=e.target.value;D.recordId='';paintMarket();};$d('reviewOffer').onchange=e=>{D.recordId=e.target.value;paintComparison();};$d('reviewMarketRefresh').onclick=loadMarket;paintComparison();
 }
 async function loadMarket(){
  const ticket=++D.request;D.loading=true;D.error='';D.partial='';paintMarket();
  try{
   async function get(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetch(url,{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('조회 오류 '+r.status);return await r.json();}finally{clearTimeout(timer);}}
   const responses=await Promise.allSettled([get('/api/market').then(r=>{if(!Array.isArray(r.records))throw Error('온디맨드 목록 형식 오류');return r.records;}),get('/api/erd/contracts').then(GpuDecision.contractRecords)]);
   if(responses.every(x=>x.status==='rejected'))throw Error('온디맨드 및 스팟·약정 자료에 연결하지 못했습니다.');
   if(ticket===D.request){D.records=responses.flatMap(x=>x.status==='fulfilled'?x.value:[]);D.partial=responses.map((x,i)=>x.status==='rejected'?['온디맨드','스팟·약정'][i]+' 조회 실패 · 해당 조건의 목록은 불완전합니다. 다시 조회하세요.':'').filter(Boolean).join(' ');}
  }
  catch(e){if(ticket===D.request)D.error='가격 자료 조회 실패 · '+(e.name==='AbortError'?'응답 시간 초과':e.message);}
  finally{if(ticket===D.request){D.loading=false;paintMarket();}}
 }
 function paintComparison(){
  const box=$d('reviewComparison');if(!box)return;
  const record=filtered().find(r=>String(r.id)===D.recordId);
  if(!record){box.innerHTML='<p>이 모델·계약·리전에 수집된 가격이 없습니다. 가격을 0으로 대체하지 않습니다.</p>';return;}
  const candidate=D.result?.snapshot.input.price,c=GpuDecision.comparison(candidate,record),signed=x=>x==null?'계산 대기':(x>0?'+':x<0?'−':'')+money(Math.abs(x));
  box.innerHTML=`<div class="mc-kpis review-kpis"><div class="mc-kpi"><span>내 후보가격</span><strong>${candidate==null?'재계산 필요':money(candidate)}</strong></div><div class="mc-kpi"><span>경쟁 상품 참고 단가</span><strong>${money(record.normalized_price)}</strong></div><div class="mc-kpi"><span>후보 − 경쟁 단가</span><strong>${signed(c.delta)}</strong><small>${c.percent==null?'유효한 양쪽 가격 필요':(c.percent>0?'+':'')+c.percent.toFixed(2)+'% · 경쟁 단가 기준'}</small></div></div><p class="mc-subtle">차이율 = (후보가격 − 경쟁 단가) ÷ 경쟁 단가 × 100. 음수는 후보가격이 낮다는 뜻이며 우수성이나 추천 판정이 아닙니다.</p><div class="mc-note warn"><b>참고 비교 · 동일 조건 판정 대기</b>${c.reasons.map(esc).join(' · ')}<br>${esc(record.verification_note||'GPU 수·CPU/RAM·서비스·결제 조건을 함께 확인하세요.')}</div>
   <details><summary>선택 상품의 조건과 출처</summary><p>${esc(record.model)} · ${esc(record.provider)} · ${esc(record.product_original||record.sku)} · ${record.gpu_count??'?'} GPU / 상품<br>${esc(record.region||'리전 미확인')} · ${esc(record.term_original||record.term)} · 수집 ${esc(record.observed_at||'미확인')}</p><p>${esc(record.price_basis||'USD/GPU·시간 환산 단가')+' · '+esc(record.formula||'환산 근거 미제공')}</p>${mlink(record.source_url,'가격 출처')}<p>관측 ID ${esc(record.observation_id)} · 저장 자료 재조회는 외부 가격 재수집이 아닙니다.</p></details>`;
 }
 function paintSimulation(){
  const box=$d('reviewSimulationResult');if(!box)return;const f=GpuFlow.get(),s=f.simulation;
  box.innerHTML=s?`<div class="mc-note"><b>연결한 PM 시뮬레이션 결과 · 가격 이력은 가상 샘플</b>현재 검토 입력 버전 ${f.revision} · 목표 달성 50% 필요가 ${money(s.required_quantiles['0.5'])} · 80% 필요가 ${money(s.required_quantiles['0.8'])}<br>이 값은 추천 구간에 자동 합산하지 않습니다. 연간 IRR 계산과 PM 월별 현금흐름의 시점이 달라 결과가 다를 수 있습니다.<br>계산 시각 ${esc(s.meta.run_at)} · 시드 ${s.meta.seed}</div>`:'<p class="mc-subtle">현재 입력에 연결된 시뮬레이션 결과가 없습니다. 아래 버튼으로 값을 전달한 후 계산하세요.</p>';
 }
 GpuFlow.subscribe(f=>{
  if(f.stale&&/^(원가|IRR)/.test(f.reason)&&D.draft){
   D.draft={...D.draft,costAnnual:null,costComplete:false,missing:['상위 입력 변경 · 원가 다시 확인 필요'],origin:'이전 입력 복사본 · 원가/IRR에서 다시 가져오거나 직접 확인',dependsOn:[]};
   if($d('reviewOrigin'))$d('reviewOrigin').textContent=D.draft.origin;
  }
  if(D.result&&(f.stale||f.revision!==D.result.revision)){D.result=null;if($d('reviewStatus'))clearResult(f.reason||'연결 입력이 변경되었습니다. 재계산하세요.');}
  paintSimulation();
 });
 RENDER.decision=async()=>{
  calculatorFrame('가격 검토','원가 · 가동률 · IRR · 시뮬레이션을 같은 입력으로 검토합니다.');
  const f=GpuFlow.get();
  if(f.snapshot&&f.revision!==D.version&&!f.stale){D.draft=f.snapshot;D.version=f.revision;D.result=null;}
  D.draft||={input:{},model:'B300',origin:'직접 입력 · 원가 완전성 미확인',costAnnual:null,costComplete:false,missing:[],dependsOn:[]};
  const a=D.draft.input;
  root.innerHTML=`<div class="mc review"><div class="mc-intro"><div><div class="mc-kicker">PRICE REVIEW</div><h2>같은 가정으로, 끝까지 비교.</h2><p class="mc-subtle">원가를 가져오고 가동률별 수익성과 경쟁사 차이를 검토하세요.</p></div><span class="mc-chip">사용자 가정 · 브라우저 임시 보관</span></div>
   <nav class="review-flow" aria-label="가격 검토 순서"><a href="#cost">원가 입력</a><a href="#decision" aria-current="page">가동률·가격 검토</a><a href="#bizcase">IRR 상세</a><a href="#forecast">시뮬레이션</a></nav>
   <section class="mc-panel"><h3>공통 입력 가정</h3><p id="reviewOrigin" class="mc-subtle">${esc(D.draft.origin)} · ${esc(D.draft.periodNote||'연간 고정 가정')} · GPU 모델은 아래에서 확인하세요.</p><div class="mc-actions"><button type="button" id="reviewImportCost" ${V02.cost?'':'disabled'}>최근 원가 결과 가져오기</button><button type="button" id="reviewImportIrr" ${V02.irrResult?'':'disabled'}>최근 IRR 입력 가져오기</button></div><p class="mc-subtle">가져오기를 누르면 아래 공통 입력을 덮어씁니다. 목표 IRR은 자본비용률과 별도 입력입니다. 새로고침하면 입력이 사라집니다.</p>
   <form id="reviewForm" novalidate><div class="mc-fields"><label class="mc-field">검토 GPU 모델<select id="reviewModel">${['B300','B200','GB300','H100','H200','GB200','VR200'].map(m=>`<option ${m===D.draft.model?'selected':''}>${m}</option>`).join('')}</select></label>${Object.entries(keys).map(([k,title])=>field('review-'+k,title,a[k]==null?null:['util','target'].includes(k)?a[k]*100:a[k])).join('')}${field('reviewUpper','사용자 가격 상한 (선택 · USD/GPU·시간)',D.upper)}</div>
   <h3 class="review-subhead">비교할 가동률 시나리오</h3><p class="mc-subtle">수요 예측값이 아닙니다. 검토할 유료 가동률을 직접 입력하세요. 비용·판매가격은 동일하게 고정합니다.</p><div class="mc-fields">${['보수','기준','낙관'].map((n,i)=>field('reviewUtil'+i,n+' 가동률 (%)',D.rates[i]==null?null:D.rates[i]*100)).join('')}</div><div class="mc-actions"><button type="submit" class="primary">가동률·IRR 비교 계산</button></div></form></section>
   <div id="reviewStatus" class="mc-status" role="status" aria-live="polite"></div><div id="reviewResult" hidden></div>
   <section class="mc-panel"><h3>경쟁사 가격과 차이 비교</h3><p class="mc-subtle">선택 모델의 저장 상품을 참고 비교합니다. 과금 방식·리전은 경쟁 상품 필터이며 내 상품과 동일한 조건임을 의미하지 않습니다.</p><div id="reviewMarket"></div></section>
   <section class="mc-panel"><h3>같은 가정으로 다음 분석</h3><div id="reviewSimulationResult"></div><p class="mc-subtle">IRR에는 동일한 연간 입력을 전달합니다. PM에는 투자금 ÷ GPU 수, 운영비 ÷ GPU 수 ÷ 12, 잔존가치 ÷ 투자금을 전달합니다. 첫 연결은 고정가·가동 지연 0개월·추가 비용 변동 0으로 맞춥니다. PM 가격 이력은 B300 가상 자료이며 1~5년만 지원합니다.</p><div class="mc-actions"><button type="button" id="reviewToIrr" disabled>이 가정으로 IRR 상세 보기</button><button type="button" class="primary" id="reviewSimulation" disabled>이 가정으로 시뮬레이션 열기</button><button type="button" id="reviewExport" disabled>검토 결과 JSON 저장</button></div></section></div>`;
  $d('reviewImportCost').onclick=importCost;$d('reviewImportIrr').onclick=importIrr;
  $d('reviewForm').addEventListener('input',dirty);$d('reviewForm').addEventListener('change',e=>{dirty(e);if(e.target.id==='reviewModel')paintMarket();});
  $d('reviewForm').onsubmit=e=>{e.preventDefault();calculate();};
  $d('reviewToIrr').onclick=()=>{if(!D.result)return;const s=D.result.snapshot;V02.irrFlowRevision=D.result.revision;V02.irrInput=structuredClone(s.input);V02.irrContext=structuredClone(s);V02.irrIncomplete=!s.costComplete;V02.irrProvenance='가격 검토에서 전달 · '+s.origin;V02.irrResult=null;location.hash='#bizcase';};
  $d('reviewSimulation').onclick=async()=>{if(!D.result)return;try{if(D.result.snapshot.model!=='B300')throw Error('PM 가격 이력은 B300 가상 샘플입니다. 다른 GPU 모델의 예측으로 연결할 수 없습니다.');await GpuMonteCarlo.applyReview(D.result.snapshot,D.result.revision);location.hash='#forecast';}catch(e){flash(e.message,true);}};
  $d('reviewExport').onclick=()=>{if(!D.result)return;const record=filtered().find(r=>String(r.id)===D.recordId),data={version:'frontend-review-1',...D.result,comparison:record?{record,calculation:GpuDecision.comparison(D.result.snapshot.input.price,record)}:null,simulation:GpuFlow.get().simulation,limitations:['사용자 조건 검토이며 최종 추천 아님','경쟁 단가 동일 조건 판정 미연결','PM은 가상 가격 이력','입력은 새로고침 시 소멸']};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='GPU_price_review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  paintMarket();paintSimulation();if(!D.records&&!D.loading)loadMarket();
  if(f.stale)flash(f.reason,true);else if(D.result){const saved=D.result;results(saved.snapshot,true);}else flash('공통 입력과 가동률 3개를 확인하고 계산하세요.');
 };
})();
