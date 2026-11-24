/* PM Python prototype adapter UI. All scenario computation stays on localhost. */
(() => {
 'use strict';
 const MC={defaults:null,forecast:null,pricing:null,busy:false,chart:null,ready:null,flowRevision:null,generation:0,inputOrigin:null};
 const endpoint=`http://${location.hostname==='localhost'?'localhost':'127.0.0.1'}:18096`;
 // 배포 사이트에는 PM 로컬 계산 서버(18096)가 없다. BE 몬테카를로 API 연동 전까지 계산 버튼을 막고 안내한다.
 const DEPLOYED=!['localhost','127.0.0.1'].includes(location.hostname);
 const DEPLOYED_MESSAGE='배포 환경에서는 아직 시뮬레이션 계산 서버가 연결되지 않아 계산을 실행할 수 없습니다. 입력 항목과 PM 기본 가정은 확인할 수 있습니다.';
 const $m=id=>document.getElementById(id), money=v=>v==null?'계산 불가':`$${Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
 const pct=v=>v==null?'산출 불가':`${(v*100).toFixed(1)}%`, safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const prob=v=>v==null?'산출 불가':`${(v*100).toFixed(v>0&&v<1&&(v<.0005||v>=.9995)?3:1)}%`;
 VIEWS.push('forecast');GRP_KEY.forecast='gBiz';PAGES.forecast={grp:'forecast',tools:false};PAGE_KEY.forecast='pForecast';
 SH.ko.pForecast='몬테카를로 시뮬레이션';SH.ko.d_forecast='시장가격의 변동 범위와 목표 IRR 기준 판매가를 검토합니다.';
 READABLE_PAGES.forecast=['MONTE CARLO LAB','몬테카를로 시뮬레이션','PM 프로토타입의 계산을 입력 가정과 함께 확인하세요.'];
 PORTAL_ROUTES.push(['forecast','몬테카를로 시뮬레이션','12개월 가격 범위 · 목표 IRR 확률','graph-up-arrow','미래가격 예측 몬테카를로 시뮬레이션']);
 const root=document.createElement('section');root.id='v-forecast';root.className='view';root.hidden=true;$m('content').append(root);
 const field=(id,label,value,min,max,step='any')=>`<label class="mc-field">${label}<input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" required></label>`;
 const triple=(key,label,values,percent,min,max)=>`<span>${label}</span>${values.map((v,i)=>`<input id="mc-${key}-${i}" aria-label="${label} ${['최소','최빈','최대'][i]}" type="number" min="${min}" max="${max}" step="any" value="${+(v*(percent?100:1)).toFixed(6)}" required>`).join('')}`;
 async function request(path,data){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
  try{
   const r=await fetch(endpoint+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,signal:controller.signal,cache:'no-store'});
   const result=await r.json();if(!r.ok)throw Error(result.error||`계산 서버 오류 (${r.status})`);return result;
  }catch(e){if(e.name==='AbortError')throw Error('계산 대기 시간이 초과되었습니다. 반복 횟수를 줄여 다시 실행하세요.');if(e instanceof TypeError)throw Error(DEPLOYED?DEPLOYED_MESSAGE:'로컬 계산 서버에 연결되지 않았습니다. 프로젝트의 「몬테카를로_실행.command」를 실행한 뒤 다시 눌러주세요.');throw e;}finally{clearTimeout(timer);}
 }
 function status(text,type=''){const el=$m('mcStatus');el.textContent=text;el.className='mc-status '+type;}
 function destroyChart(){MC.chart?.destroy();MC.chart=null;}
 function invalidate(all){
  MC.generation++;
  if(all){MC.flowRevision=null;MC.inputOrigin=null;}
  GpuFlow.clearSimulation();
  bridge();
  MC.pricing=null;$m('mcPricingResult').hidden=true;$m('mcPricingExport').disabled=true;
  if(all){$m('mcInputTag').textContent=' · 사용자 수정 가정 포함';MC.forecast=null;destroyChart();$m('mcForecastResult').hidden=true;$m('mcEmpty').hidden=false;$m('mcEmpty').innerHTML='<div><b>입력이 변경되었습니다.</b>시장가격 범위를 다시 계산하면 판매가 분석을 진행할 수 있습니다.</div>';$m('mcForecastExport').disabled=true;}
  $m('mcPriceButton').disabled=!MC.forecast;status(all?'입력이 변경되었습니다. 시장가격 범위를 다시 계산하세요.':'시장가 선택이 변경되었습니다. 판매가를 다시 계산하세요.');
 }
 function config(){
  const c=structuredClone(MC.defaults),n=id=>{const el=$m(id);return el.value.trim()===''?NaN:Number(el.value);};
  c.simulation={n_paths:n('mcPaths'),seed:n('mcSeed'),mean_block_length:n('mcBlock'),jump_prob_per_month:n('mcJumpProb')/100,jump_size_tri:[0,1,2].map(i=>n(`mc-jump-${i}`)/100)};
  c.investment={gpus:n('mcGpus'),months:n('mcMonths'),capex_per_gpu:n('mcCapex'),ramp_months:n('mcRamp'),residual_value_pct:n('mcResidual')/100,pricing_mode:$m('mcMode').value};
  c.target_irr_annual=n('mcTarget')/100;
  for(const k of Object.keys(c.uncertain))c.uncertain[k]=[0,1,2].map(i=>n(`mc-${k}-${i}`)/(k==='opex_per_gpu_month'?1:100));
  c.candidate_prices=$m('mcCandidates').value.split(',').map(x=>x.trim()===''?NaN:Number(x.trim()));return c;
 }
 function table(headers,rows){return `<div class="mc-tablebox" tabindex="0"><table><thead><tr>${headers.map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;}
 function row(cells,cls=''){return `<tr class="${cls}">${cells.map(x=>`<td>${x}</td>`).join('')}</tr>`;}
 function metadata(meta){return `<details class="mc-metadata"><summary>실행 근거와 모델 정보</summary><dl><dt>모델 버전</dt><dd>${safe(meta.model_version)} · 연결 모듈 ${safe(meta.adapter_version)}</dd><dt>계산 시각</dt><dd>${new Date(meta.run_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST</dd><dt>가격 이력 기준</dt><dd>2025-06 ~ 2026-11 · 18개월 · 가상 샘플</dd><dt>PM 설정 기준일</dt><dd>${safe(meta.data_asof)} (월별 가상 자료)</dd><dt>반복 / 시드</dt><dd>${meta.n_paths.toLocaleString()}회 / ${meta.seed}</dd><dt>가격 이력 SHA-256</dt><dd>${safe(meta.history_hash)}</dd><dt>입력 설정 SHA-256</dt><dd>${safe(meta.config_hash)}</dd></dl><p>월 730시간 · USD/GPU·시간. 계산은 이 컴퓨터에서 수행되며 입력값을 외부 서비스로 보내지 않습니다.</p></details>`;}
 function build(c){
  const s=c.simulation,i=c.investment,u=c.uncertain;
  root.innerHTML=`<div class="mc">
   <div class="mc-intro"><div><div class="mc-kicker">GPU PRICING / SIMULATION LAB</div><h2>가격의 가능성을 계산하다.</h2><p class="mc-subtle">시장가격의 범위를 살펴보고, 선택한 가정에서 필요한 판매가를 비교하세요.</p></div><span class="mc-chip">PM 프로토타입 · 가상 샘플</span></div>
   <div class="mc-note warn"><b>동작 확인용 데이터입니다.</b>가격 이력은 ZIP의 B300 가상 자료 18개월입니다. 투자·운영비는 PM 기본값 또는 가격 검토에서 연결한 사용자 가정을 사용합니다. 실제 수집 DB와 연결하지 않았으며, 백테스트로 정확도를 검증하지 않았습니다.</div>
   <div id="mcReviewBridge"></div><div class="mc-steps"><strong>시장가격 범위 계산</strong><span>시장가 가정 선택</span><span>목표 IRR 기준 판매가 검토</span></div>
   <form id="mcConfigForm" novalidate><fieldset id="mcConfigFields"><div class="mc-grid">
    <div class="mc-panel"><h3>시뮬레이션 조건</h3><p class="mc-subtle">B300 GPU 클라우드 · 샘플<br>최근 샘플 가격 <b>$4.31</b> / GPU·시간</p><div class="mc-fields">
    ${field('mcPaths','반복 횟수',s.n_paths,1000,50000,1)}${field('mcSeed','난수 시드',s.seed,0,2147483647,1)}
    ${field('mcBlock','평균 블록 길이 (개월)',s.mean_block_length,1,24)}${field('mcMonths','투자 분석 기간 (개월)',i.months,12,60,1)}
    </div><details><summary>가격 인하 이벤트 가정</summary><div class="mc-fields">${field('mcJumpProb','월 이벤트 발생 확률 (%)',s.jump_prob_per_month*100,0,100)}${[0,1,2].map(n=>field(`mc-jump-${n}`,`가격 변화 ${['최소','최빈','최대'][n]} (%)`,s.jump_size_tri[n]*100,-95,0)).join('')}</div><p class="mc-subtle">과거 월별 변화율을 블록으로 재추출하고, 별도 이벤트가 발생하면 삼각분포로 추가 인하율을 뽑습니다. 과거 이력과 이벤트의 중복 반영 가능성을 검토하세요.</p></details>
    <button type="submit" class="primary mc-run" id="mcForecastButton">시장가격 범위 계산</button><div class="mc-actions"><button type="button" id="mcReset">PM 기본값 복원</button></div><p class="mc-subtle">같은 입력과 시드로 다시 실행하면 같은 결과를 얻습니다.</p></div>
    <div><div id="mcEmpty" class="mc-empty"><div><b>12개월의 가격 범위</b>‘시장가격 범위 계산’을 누르면<br>중앙값과 P10~P90 범위가 표시됩니다.</div></div><div id="mcForecastResult" hidden></div></div>
   </div>
   <details class="mc-panel" id="mcInvestment"><summary>투자·운영비 가정 수정 <small id="mcInputTag"> · PM 샘플 기본값 적용 중</small></summary><p class="mc-subtle">PM 기본값 또는 연결한 사용자 가정입니다. 변경하면 기존 결과가 만료되고 가격 검토와의 연결이 해제됩니다.</p>
    <div class="mc-fields">${field('mcGpus','GPU 수',i.gpus,1,100000,1)}${field('mcCapex','GPU당 투자비 (USD)',i.capex_per_gpu,1,10000000)}${field('mcRamp','정상 가동까지 기간 (개월)',i.ramp_months,0,60,1)}${field('mcResidual','말기 잔존가치 (%)',i.residual_value_pct*100,0,100)}${field('mcTarget','목표 IRR (연 %)',c.target_irr_annual*100,0,200)}
    <label class="mc-field">판매가격 방식<select id="mcMode"><option value="follow_market">시장가 연동</option><option value="fixed">분석기간 고정가</option></select></label><label class="mc-field full">후보 기준 판매가 (USD/GPU·시간 · 쉼표 구분, 최대 8개)<input id="mcCandidates" value="${c.candidate_prices.join(', ')}" required></label></div>
    <p class="mc-subtle">각 변수는 서로 독립인 삼각분포로 추출합니다. 최빈값은 가장 자주 나올 것으로 가정한 값입니다.</p><div class="mc-tablebox"><div class="mc-triples"><span class="mc-th">불확실 변수</span><span class="mc-th">최소</span><span class="mc-th">최빈</span><span class="mc-th">최대</span>
    ${triple('utilization','유료 가동률 (%)',u.utilization,true,1,100)}${triple('capex_overrun','투자비 초과율 (%)',u.capex_overrun,true,0,200)}${triple('opex_per_gpu_month','GPU당 월 운영비 (USD)',u.opex_per_gpu_month,false,0,1000000)}${triple('opex_annual_inflation','운영비 연 상승률 (%)',u.opex_annual_inflation,true,-50,100)}</div></div>
   </details></fieldset></form>
   <div id="mcStatus" class="mc-status" role="status" aria-live="polite"></div>
   <form id="mcSelectionForm" class="mc-panel"><fieldset id="mcSelectionFields"><div class="mc-panel-title"><h3>시장가 가정 선택과 판매가 계산</h3><small>판매자 관점의 시나리오</small></div><div class="mc-fields">
    <label class="mc-field">12개월 후 시장가 가정<select id="mcScenario"><option value="기준">기준 · P50</option><option value="보수">보수 · P25</option><option value="낙관">낙관 · P75</option><option value="direct">직접 입력</option></select></label>
    <label class="mc-field">12개월 이후 추세<select id="mcTrend"><option value="ease">점차 완화 · 추세 강도 매년 절반</option><option value="keep">과거 추세 유지</option><option value="flat">추세 멈춤 · 변동성은 유지</option></select></label>
    <label class="mc-field" id="mcDirectLabel" hidden>직접 입력 시장가 (USD/GPU·시간)<input id="mcDirect" type="number" min="0.01" max="100000" step="any" disabled required></label></div>
    <p class="mc-subtle" id="mcSelectionHint">먼저 시장가격 범위를 계산하세요. 선택한 분위 ±10%p 구간의 경로로 판매가를 평가합니다.</p>
    <div class="mc-actions"><button type="submit" class="primary" id="mcPriceButton" disabled>목표 IRR 기준 판매가 계산</button><button type="button" id="mcForecastExport" disabled>가격 범위 JSON 저장</button><button type="button" id="mcPricingExport" disabled>판매가 결과 JSON 저장</button></div>
   </fieldset></form>
   <div id="mcPricingResult" hidden></div>
   <div class="mc-footer">PM 모델 0.3.0-prototype · 정상 블록 부트스트랩 + 이벤트 점프 · 최종 시장가 가정과 판매가는 담당자가 결정합니다.</div>
  </div>`;
  $m('mcMode').value=i.pricing_mode;bridge();
  $m('mcConfigForm').addEventListener('input',()=>invalidate(true));$m('mcConfigForm').addEventListener('change',()=>invalidate(true));
  $m('mcSelectionForm').addEventListener('input',()=>invalidate(false));$m('mcSelectionForm').addEventListener('change',()=>invalidate(false));
  $m('mcScenario').addEventListener('change',()=>{const direct=$m('mcScenario').value==='direct';$m('mcDirectLabel').hidden=!direct;$m('mcDirect').disabled=!direct;selectionHint();});
  $m('mcReset').onclick=()=>{MC.generation++;MC.flowRevision=null;MC.inputOrigin=null;GpuFlow.clearSimulation();destroyChart();MC.forecast=null;MC.pricing=null;build(MC.defaults);status('PM 기본값으로 복원했습니다. 계산을 다시 실행하세요.');};
  $m('mcConfigForm').onsubmit=e=>{e.preventDefault();run('forecast');};
  $m('mcSelectionForm').onsubmit=e=>{e.preventDefault();run('pricing');};
  $m('mcForecastExport').onclick=()=>download('forecast',MC.forecast);$m('mcPricingExport').onclick=()=>download('pricing',MC.pricing);
 }
 function selectionHint(){
  if(!MC.forecast)return;const r=MC.forecast.monthly[11],name=$m('mcScenario').value,key={보수:'p25',기준:'p50',낙관:'p75'}[name];
  $m('mcSelectionHint').textContent=key?`${name} 시장가 ${money(r[key])} / GPU·시간 · 해당 분위 ±10%p 경로를 선택합니다. 판매자 입장에서 낮은 시장가가 보수적인 가정입니다.`:'직접 입력값의 분포상 위치를 찾아 주변 경로를 선택합니다. 입력값 자체에 모든 경로를 맞추는 방식은 아닙니다.';
 }
 function paintForecast(r){
  destroyChart();const end=r.monthly[11],ev=r.evidence,out=$m('mcForecastResult');$m('mcEmpty').hidden=true;out.hidden=false;
  out.innerHTML=`<div class="mc-results-label">가상 샘플 계산 결과 · USD/GPU·시간</div><div class="mc-kpis"><div class="mc-kpi emphasis"><span>12개월 후 중앙값 · P50</span><strong>${money(end.p50)}</strong><small>현재 샘플 ${money(ev.last_price)}</small></div><div class="mc-kpi"><span>12개월 후 P10~P90</span><strong>${money(end.p10)}~${money(end.p90)}</strong><small>모형 내 중앙 80% 범위</small></div><div class="mc-kpi"><span>현재 가격 이하 경로 비율</span><strong>${prob(end.prob_below_now)}</strong><small>입력 가정에 따른 계산</small></div></div>
   <section class="mc-panel"><div class="mc-panel-title"><h3>12개월 시장가격 범위</h3><small>${r.meta.n_paths.toLocaleString()}개 경로</small></div><div class="mc-legend"><span>시뮬레이션 중앙값</span><span>P10~P90</span><span>과거 샘플 이력</span></div><div class="mc-chart"><canvas id="mcChart" role="img" aria-label="가상 가격 이력과 향후 12개월 중앙값 및 P10~P90 범위. 월별 수치는 아래 표에서 확인할 수 있습니다."></canvas></div><p class="mc-chart-note">과거 구간도 가상 데이터입니다. 색칠한 범위는 예측 정확도나 실제 가격의 보장 범위가 아닙니다.</p>
   ${table(['시점','P10','P25','중앙값','P75','P90'],r.monthly.filter(x=>[3,6,12].includes(x.month)).map(x=>row([`${x.month}개월 후`,money(x.p10),money(x.p25),`<strong>${money(x.p50)}</strong>`,money(x.p75),money(x.p90)])))}
   <details><summary>월별 가격 범위 전체 보기</summary>${table(['시점','P10','중앙값','P90','현재 가격 이하'],r.monthly.map(x=>row([`${x.month}개월 후`,money(x.p10),money(x.p50),money(x.p90),prob(x.prob_below_now)])))}</details>
   <details><summary>가격 이력과 계산 근거</summary><p class="mc-subtle">${ev.n_months}개월 · 월평균 변화 ${pct(ev.monthly_mean_change)} · 월 로그 변화율 표준편차 ${pct(ev.monthly_volatility)} · 최대 월 하락 ${pct(ev.worst_month_change)} (${safe(ev.worst_month)})</p>${table(['월','가상 가격 (USD/GPU·시간)'],r.history.map(x=>row([safe(x.month),money(x.price)])))}</details>${metadata(r.meta)}</section>`;
  const history=r.history,blank=Array(history.length-1).fill(null),last=history.at(-1),start=new Date(last.month+'-01T00:00:00Z');
  const labels=[...history.map(x=>x.month),...r.monthly.map(x=>{const d=new Date(start);d.setUTCMonth(d.getUTCMonth()+x.month);return d.toISOString().slice(0,7);})];
  const series=k=>[...blank,last.price,...r.monthly.map(x=>x[k])];
  MC.chart=new Chart($m('mcChart'),{type:'line',data:{labels,datasets:[
   {label:'P10',data:series('p10'),borderWidth:0,pointRadius:0,fill:false},
   {label:'P10~P90',data:series('p90'),borderWidth:0,pointRadius:0,fill:'-1',backgroundColor:'rgba(227,27,67,.12)'},
   {label:'과거 가상 가격',data:[...history.map(x=>x.price),...Array(12).fill(null)],borderColor:'#6e7788',borderWidth:2,pointRadius:2,fill:false},
   {label:'시뮬레이션 중앙값',data:series('p50'),borderColor:'#e31b43',borderWidth:2.5,pointRadius:2,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{filter:item=>item.raw!==null,callbacks:{label:ctx=>`${ctx.dataset.label}: ${money(ctx.raw)}`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:7,maxRotation:0,color:'#626777'}},y:{beginAtZero:true,title:{display:true,text:'USD / GPU·시간'},ticks:{callback:v=>'$'+v},grid:{color:'#eef0f5'}}}}});
  selectionHint();
 }
 function paintPricing(r,c){
  const out=$m('mcPricingResult'),q=r.required_quantiles,sel=r.selection;out.hidden=false;
  const labels={utilization:'유료 가동률',capex_overrun:'투자비 초과율',opex_per_gpu_month:'GPU당 월 운영비',opex_annual_inflation:'운영비 연 상승률',market_path:'선택 구간의 시장가격 경로'};
  const trendNames={ease:'점차 완화',keep:'과거 추세 유지',flat:'추세 멈춤'};
  out.innerHTML=`<div class="mc-results-label">선택한 가정에 따른 판매가 분석 · 가상 샘플</div><div class="mc-note"><b>${safe(sel.label)} · ${trendNames[r.post12_trend]}</b>12개월 후 시장가 ${money(sel.band_price_12m[0])}~${money(sel.band_price_12m[1])} 구간의 ${sel.n_selected.toLocaleString()}개 경로 · 목표 연 IRR ${pct(c.target_irr_annual)} · ${c.investment.months}개월 · ${c.investment.gpus} GPU<br>${c.investment.pricing_mode==='fixed'?'분석기간 내 판매가 고정':'기준 판매가 × 매월 시장가격 지수로 판매가 조정'}</div>
   ${sel.warnings.map(x=>`<div class="mc-note warn">${safe(x)}</div>`).join('')}
   <div class="mc-kpis"><div class="mc-kpi"><span>목표 IRR 달성 비율 50% 기준</span><strong>${money(q['0.5'])}</strong><small>필요 기준 판매가 / GPU·시간</small></div><div class="mc-kpi emphasis"><span>목표 IRR 달성 비율 80% 기준</span><strong>${money(q['0.8'])}</strong><small>필요 기준 판매가 / GPU·시간</small></div><div class="mc-kpi"><span>목표 IRR 달성 비율 90% 기준</span><strong>${money(q['0.9'])}</strong><small>필요 기준 판매가 / GPU·시간</small></div></div>
   <div class="mc-note warn"><b>추천 범위의 하한 후보: ${money(q['0.5'])}~${money(q['0.8'])}</b>PM 코드가 제시한 50~80% 달성 기준의 필요 판매가입니다. 최종 추천 범위의 상한은 아직 정해지지 않았습니다. 시장가·실제 계약 가능 가격과 구분해서 검토하세요.</div>
   <section class="mc-panel"><h3>후보 판매가별 목표 IRR 달성 확률</h3><p class="mc-subtle">달성 확률은 선택 경로 전체 기준입니다. IRR 분위수는 앞 ${r.candidates[0]?.irr_sample_size.toLocaleString()}개 경로 중 IRR 산출이 가능한 경로 기준입니다.</p>
   ${table(['기준 판매가','목표 달성 확률','IRR P10','IRR 중앙값','IRR P90','IRR 미산출'],r.candidates.map(x=>row([money(x.price),`<strong>${prob(x.prob_meet_target)}</strong>${x.prob_meet_target<.5?' · 낮음':''}`,pct(x.irr_p10),pct(x.irr_p50),pct(x.irr_p90),`${x.irr_undefined_count}개`])))}
   <p class="mc-subtle">50% 미만은 PM 기본 경고 기준에 따른 ‘낮음’ 표시입니다. 가동률·투자비·운영비 가정에 조건부인 확률이며, 실제 사업의 성공 확률을 검증한 값은 아닙니다.</p></section>
   <section class="mc-panel"><h3>시장가 가정별 비교</h3>${table(['가정','12개월 후 시장가 중앙값','필요 판매가 · 달성 50%','필요 판매가 · 달성 80%'],r.scenario_comparison.map(x=>row([safe(x.scenario),money(x.price_12m),money(x.req_p50),money(x.req_p80)],$m('mcScenario').value===x.scenario?'mc-selected':'')))}
   ${c.investment.pricing_mode==='fixed'?'<p class="mc-subtle">고정가 방식에서는 시장가격 경로가 매출에 반영되지 않습니다. 가정별 차이는 선택된 경로에 배정된 비용·가동률 표본의 차이입니다.</p>':''}</section>
   <section class="mc-panel"><h3>12개월 이후 · 선택한 추세 가정</h3><p class="mc-subtle">‘${trendNames[r.post12_trend]}’를 ${c.investment.months}개월 분석에 적용했습니다. 아래 가격은 전체 경로 기준이며, 검증된 장기 예측이 아닙니다.</p>${table(['시점','P10','중앙값','P90'],r.monthly.filter(x=>[12,24,36,48,60,c.investment.months].includes(x.month)).map(x=>row([`${x.month}개월 후${x.month>12?' · 가정':''}`,money(x.p10),money(x.p50),money(x.p90)])))}</section>
   <section class="mc-panel"><h3>필요 판매가에 영향을 주는 변수</h3>${table(['변수','최소 가정의 필요가','최대 가정의 필요가','가격 변동폭'],r.tornado.map(x=>row([labels[x.input]||safe(x.input),money(x.required_at_low),money(x.required_at_high),money(x.swing)])))}<p class="mc-subtle">다른 입력은 최빈값으로 고정하고 한 변수만 바꾼 민감도입니다. 변수별 영향의 합이나 인과관계를 뜻하지 않습니다.</p>${metadata(r.meta)}</section>
   <div class="mc-note"><b>가정과 한계</b>월 730시간 · 세전·무차입 프로젝트 IRR · 가격에 따른 수요 변화 미반영 · 비용·가동률 변수 간 상관관계 미반영 · 백테스트와 기준 모델 비교 미수행. 연결한 입력이 유지된 결과는 가격 검토 화면에서 함께 확인할 수 있습니다. 원가 입력·추천 구간·DB 값은 덮어쓰지 않습니다.</div>`;
 }
 async function run(kind){
  if(MC.busy)return;
   const invalid=$m('mcConfigForm').querySelector('input:invalid, select:invalid');
   if(invalid){let parent=invalid.parentElement;while(parent&&parent!==root){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}$m('mcConfigForm').reportValidity();return;}
  if(kind==='pricing'&&!MC.forecast){status('먼저 시장가격 범위를 계산하세요.','error');return;}
  const c=config(),generation=MC.generation,flowRevision=MC.flowRevision;MC.busy=true;$m('mcConfigFields').disabled=true;$m('mcSelectionFields').disabled=true;
  if(kind==='forecast'){MC.forecast=null;MC.pricing=null;destroyChart();$m('mcForecastResult').hidden=true;$m('mcPricingResult').hidden=true;$m('mcForecastExport').disabled=true;$m('mcPricingExport').disabled=true;}
  else {MC.pricing=null;$m('mcPricingResult').hidden=true;$m('mcPricingExport').disabled=true;}
  status(kind==='forecast'?`${c.simulation.n_paths.toLocaleString()}개 가격 경로를 계산하고 있습니다…`:'시장가 경로를 선택하고 현금흐름·IRR을 계산하고 있습니다…','busy');
  try{
   const selection={post12_trend:$m('mcTrend').value};if($m('mcScenario').value==='direct')selection.market_price_12m=Number($m('mcDirect').value);else selection.scenario=$m('mcScenario').value;
   const r=await request('/'+kind,{config:c,selection});
   if(generation!==MC.generation){status('연결 입력이 바뀌어 이 계산 결과를 폐기했습니다. 가격 검토에서 다시 연결하세요.','error');return;}
   r.input_provenance={origin:MC.inputOrigin||'PM 기본값 또는 시뮬레이션에서 직접 수정',review_revision:flowRevision,price_history:'B300 가상 샘플'};
   if(kind==='forecast'){MC.forecast=r;paintForecast(r);$m('mcForecastExport').disabled=false;status('시장가격 범위 계산 완료. 아래에서 시장가 가정을 선택하고 판매가를 계산하세요.');}
   else{MC.pricing={...r,config:c,requested_selection:selection};paintPricing(r,c);if(flowRevision!==null)GpuFlow.saveSimulation({...r,config:c},flowRevision);bridge();$m('mcPricingExport').disabled=false;status('판매가 계산 완료. 아래에서 후보가격별 목표 IRR 달성 확률을 확인하세요.');$m('mcPricingResult').scrollIntoView({behavior:'smooth',block:'start'});}
  }catch(e){status(e.message,'error');}finally{MC.busy=false;$m('mcConfigFields').disabled=false;$m('mcSelectionFields').disabled=false;$m('mcPriceButton').disabled=!MC.forecast;}
 }
 function download(kind,data){if(!data)return;const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`GPU_PM_sample_${kind}_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function bridge(){
  const el=$m('mcReviewBridge');if(!el)return;
  el.innerHTML=MC.flowRevision!==null?`<div class="mc-note"><b>가격 검토의 사용자 가정을 연결했습니다 · 입력 버전 ${MC.flowRevision}</b>${safe(MC.inputOrigin)} · 투자·운영비·가동률·목표 IRR·후보가격 적용. 가격 이력은 B300 가상 샘플입니다.<br>첫 연결은 고정가, 가동 지연 0개월, 추가 비용 변동 0으로 맞춥니다. 입력을 바꾸면 가격 검토 결과와의 연결은 해제됩니다.<br>연간 IRR과 월별 현금흐름의 수취 시점 차이로 수치가 달라질 수 있습니다.<div class="mc-actions"><a href="#decision">가격 검토와 결과 함께 보기</a></div></div>`:'<div class="mc-note"><b>독립 시뮬레이션 입력</b>원가·가동률·IRR 가정을 이어 쓰려면 <a href="#decision">가격 검토 화면</a>에서 계산 후 연결하세요. 이 화면에서 수정한 입력은 기존 원가나 IRR을 덮어쓰지 않습니다.</div>';
 }
 GpuFlow.subscribe(f=>{if(MC.flowRevision!==null&&(f.stale||f.revision!==MC.flowRevision)){
  invalidate(true);status('연결했던 원가·IRR·가격 검토 입력이 변경되었습니다. 가격 검토에서 다시 연결하세요.','error');
 }});
 window.GpuMonteCarlo={applyReview:async(snapshot,revision)=>{
  if(MC.busy)throw Error('시뮬레이션 계산이 끝난 뒤 다시 연결하세요.');
  if(snapshot.model!=='B300')throw Error('PM은 B300 가상 가격 이력만 지원합니다.');
  await RENDER.forecast();
  if(!MC.defaults)throw Error('시뮬레이션 기본 설정을 불러오지 못했습니다. 다시 시도하세요.');
  const c=GpuDecision.toMonteCarlo(snapshot,MC.defaults),f=GpuFlow.get();
  if(f.stale||f.revision!==revision)throw Error('가격 검토 입력이 변경되었습니다. 다시 계산 후 연결하세요.');
  MC.generation++;MC.flowRevision=revision;MC.inputOrigin=snapshot.origin;MC.forecast=null;MC.pricing=null;destroyChart();GpuFlow.clearSimulation();build(c);
  $m('mcInputTag').textContent=' · 가격 검토의 사용자 가정 적용';
  status('가격 검토 입력을 적용했습니다. 시장가격 범위와 판매가를 순서대로 계산하세요.');
 }};
 if(DEPLOYED){const buildForm=build;build=c=>{buildForm(c);$m('mcForecastButton').disabled=true;$m('mcPriceButton').disabled=true;status(DEPLOYED_MESSAGE,'error');};}
 RENDER.forecast=async()=>{
  calculatorFrame('몬테카를로 시뮬레이션','PM 프로토타입 · 12개월 가격 범위와 목표 IRR 기준 판매가');
  if(MC.defaults)return;
  if(!MC.ready){root.innerHTML='<div class="mc mc-panel" role="status">PM 샘플 설정을 불러오고 있습니다…</div>';MC.ready=fetch('/static/montecarlo-defaults.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('샘플 설정을 불러오지 못했습니다.');return r.json();}).then(c=>{MC.defaults=c;build(c);}).catch(e=>{root.textContent=e.message+' 새로고침 후 다시 시도하세요.';MC.ready=null;});}
  await MC.ready;
 };
})();
