import {transitionForEdit,renderAssumptions,renderAssumptionOverview,renderReasoning} from './data-center-evidence.mjs?v=logic1124';
import {reportDefaults,simulateDataCenter,utilizationScenarios,safeSource} from './data-center-model.mjs?v=logic1124';
import {bindMarketScope} from './spring-cost.mjs?v=assets1124';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=2)=>Number(v).toLocaleString('ko-KR',{maximumFractionDigits:d});
const money=v=>'$'+num(v);
const pct=v=>v==null?'산출 불가':num(Number(v)*100)+'%';
const itemNames={SERVER:'서버·GPU',NETWORK:'네트워크',FACILITY:'시설·전력·냉각·기타'};

export async function renderDataCenter({host,api,request,saved,onEdit,isActive,openLegacy}) {
  const s={...reportDefaults(),...saved};
  const notes={...(s.assumptionNotes||{})};
  const input=(key,label,note='',step='any')=>`<label>${label}<input type="number" data-dc="${key}" step="${step}" value="${esc(s[key])}" aria-label="${label}">${note?`<small>${note}</small>`:''}</label>`;
  const rows=[['server','서버·GPU','GPU·CPU·메모리 등 서버 취득비'],['network','네트워크','데이터센터 네트워크 투자비'],['facility','시설·전력·냉각·기타','건물 및 전력·냉각 인프라를 포함한 통합 투자비']];
  host.innerHTML=`<div class="mv dc-workspace">
  <div class="dc-intro"><div><span class="dc-eyebrow">데이터센터 운영자 관점</span><h2>원가에서 판매가격까지</h2><p>센터 규모와 투자·운영비로 GPU 시간당 원가를 계산하고, 목표 마진과 경쟁사 공개 가격을 비교합니다.</p></div><button type="button" class="mv-btn" data-reset>보고서 1GW 기준으로 초기화</button></div>
  <p class="dc-provenance" data-provenance>출발점: 미래에셋증권 「AI Factory의 경제학」(2026-05-19), 14~16쪽 · 보고서의 분석 가정이며 실측·견적값이 아닙니다.</p>
  <div data-assumption-overview></div><form data-dc-form novalidate>
  <section class="dc-section dc-assumption-section"><h3>원가 산정 가정과 근거</h3><p>보고서의 가정, 보고서에서 계산한 값, 사용자 설정을 구분합니다. 아래에서 출발값과 현재 값을 비교하고 선택 이유를 남길 수 있습니다.</p><label>검토 목적·보고 메모<textarea data-assumption-note="scenario" rows="2" maxlength="2000" placeholder="예: 가동률 70%에서 GPU 판매가격 검토">${esc(notes.scenario||'')}</textarea></label><details><summary>가정별 출처·적용 이유와 담당자 검토 근거</summary><div data-assumption-table></div></details><p data-mode-notice role="status" class="dc-mode-notice">모든 숫자 칸을 직접 수정할 수 있습니다. 내용연수·잔존가치·자본비용률을 바꾸면 사용자 할인율 계산으로, 전력 부하율을 바꾸면 별도 입력으로 전환합니다.</p></section>
  <section class="dc-section"><h3>데이터센터 규모와 가동</h3><div class="dc-fields">
    ${input('gpuCount','전체 GPU 수','센터 전체 보유 수량','1')}${input('gpusPerRack','랙당 GPU 수','보고서: NVL72 기준 72개','1')}${input('rackPowerKw','랙당 IT 전력 (kW)','보고서: 120 kW')}${input('pue','PUE','보고서: 1.14')}${input('utilization','유료 가동률 (%)','실제로 판매되는 GPU 시간 비율')}
  </div><div class="dc-capacity" data-capacity></div><p class="dc-small">GPU 수를 바꿔도 아래 투자비·기타 운영비는 자동으로 비례 변경하지 않습니다. 다른 GPU 모델이나 규모에는 해당 장비·시설의 비용 가정을 입력하세요.</p></section>
  <section class="dc-section"><h3>초기 투자비 · CAPEX</h3><div class="dc-method"><label>연간 자본회수비용 산정<select data-dc="capitalMethod"><option value="REPORT_FACTORS" ${s.capitalMethod==='REPORT_FACTORS'?'selected':''}>보고서의 연간 비용 배분계수 적용</option><option value="DISCOUNT_RATE" ${s.capitalMethod==='DISCOUNT_RATE'?'selected':''}>내용연수·잔존가치·할인율로 계산</option></select></label>${input('annualDiscountRate','연 자본비용률 (%)','보고서 모드에서는 미사용 · 직접 수정하면 할인율 계산으로 전환')}</div>
  <div class="mv-tablebox" tabindex="0" role="region" aria-label="데이터센터 초기 투자비"><table class="mv-table dc-capex"><thead><tr><th>투자 항목</th><th>취득비 (USD)</th><th>내용연수 (년)</th><th>종료 잔존가치 (USD)</th></tr></thead><tbody>${rows.map(([key,label,note])=>`<tr><td><b>${label}</b><small>${note}</small></td><td>${input(key+'Capex',label+' 취득비')}</td><td>${input(key+'Years',label+' 내용연수','','1')}</td><td>${input(key+'Residual',label+' 잔존가치')}</td></tr>`).join('')}</tbody></table></div>
  <p class="dc-small" data-capital-note></p></section>
  <section class="dc-section"><h3>연간 운영비 · OPEX</h3><div class="dc-fields">
  <label>전력 부하율 적용<select data-dc="powerMode"><option value="linked" ${s.powerMode==='linked'?'selected':''}>보고서 가정 · 유료 가동률과 연동</option><option value="independent" ${s.powerMode==='independent'?'selected':''}>전력 부하율 별도 입력</option></select></label>
  ${input('powerLoadFraction','평균 전력 부하율 (%)','설계 IT 부하 대비 평균 사용 비율')}${input('electricityUsdPerKwh','전력단가 (USD/kWh)','보고서: $0.0834')}${input('otherAnnualOpexUsd','기타 운영비 합계 (USD/년)','인건비·유지보수·보안 등 통합 · 전기료 제외')}
  </div><div class="dc-opex" data-opex></div>
  <p class="dc-small">기타 운영비 기본값 $275,350,680은 보고서의 전체 운영비 $900,000,000에서 표 4 전기료 $624,649,320을 뺀 잔액입니다. 세부 항목별 견적이 제시된 값은 아닙니다. 임차료·메모리 등이 다른 비용에 포함됐다면 다시 더하지 마세요.</p>
  <details><summary>전력 계산과 보고서 해석</summary><p>연 전기료 = IT kW × PUE × 평균 전력 부하율 × 8,760시간 × 전력단가. 보고서 재현 모드는 전력 부하율을 유료 가동률과 같게 둡니다. 실제 유휴전력이 있거나 두 비율이 다르면 별도 입력을 선택하세요. 보고서 본문의 약 5.9억 달러와 표의 전기료가 달라, 재현 계산은 표 4 수치를 기준으로 합니다.</p></details></section>
  <section class="dc-section"><h3>판매가격과 목표 마진</h3><div class="dc-fields">
  ${input('targetMargin','목표 매출 이익률 (%)','초깃값 20%는 사용자 예시 · 원가 가산율과 다름')}${input('bareMetalPrice','검토할 GPU 판매가격 (USD/GPU·시간)','보고서 시나리오: $3.00')}${input('softwareAttach','소프트웨어 부가매출률 (%)','GPU 매출 대비 비율 · 보고서: 10%')}
  </div><p class="dc-small">목표 판매가격 = GPU 시간당 원가 ÷ (1 − 목표 매출 이익률). 기본 판매가격 판단은 GPU 매출만 사용합니다. 소프트웨어 부가매출을 포함한 결과는 별도로 표시합니다. 여기서 이익은 연 자본회수비용까지 차감한 경제적 잉여이며 세후 순이익이 아닙니다.</p></section>
  <section class="dc-section"><h3>경쟁사 시장가격 비교</h3><div class="dc-fields">
  <label>비교할 GPU 모델<select data-dc="modelId"><option value="">모델 조회 중…</option></select></label>
  ${input('offerGpuCount','비교 상품의 GPU 수','예: 8-GPU 인스턴스 · 전체 보유 수량과 별개','1')}
  <label>지역·상품·계약 조건<select data-dc="marketScope"><option value="">시장 비교 생략</option></select></label>
  </div><p class="dc-small">선택한 모델은 시장 조회 조건입니다. 1GW 기본 투자비가 해당 모델의 실제 견적이라는 뜻은 아닙니다. 상품 구성·지역·계약 조건을 확인한 뒤 USD/GPU·시간 기준으로 비교하세요. 공개된 관측 가격이며 실제 거래가는 다를 수 있습니다.</p><p data-market-status></p></section>
  <div class="dc-submit"><button type="submit" class="mv-btn primary">원가 · 목표 판매가격 · 시장 비교 계산</button><span>입력값은 계산 서버에서 일회성 처리되며 저장하지 않습니다.</span></div></form>
  <div data-dc-result aria-live="polite"></div>
  <details class="dc-section"><summary>출처와 계산 기준</summary><p>사용자 제공 보고서: 미래에셋증권 리서치센터 한종목, 「AI Factory의 경제학」, 2026-05-19, 표 3~5(14~16쪽). 보고서 모드는 초기 투자비 380억 달러, 연 자본회수비용 76억 달러, 연 운영비 9억 달러를 재현합니다. IT 5년·시설 14년은 이 분석의 가정입니다.</p><p>보고서 모드의 자본회수계수는 각 항목의 보고서 연간 비용 ÷ 취득비로 계산합니다. 서버·네트워크 약 24%, 시설 약 11.51%이며 하나의 공통 할인율로 환산한 값이 아닙니다. 잔존가치는 0으로 둡니다. 취득비를 변경하면 같은 계수로 연간화합니다.</p><p>할인율 모드: 자산별 (취득비 − 잔존가치 현재가치) × CRF를 합산합니다. 정액 감가상각비는 별도 참고값이며 자본회수비용에 중복 가산하지 않습니다. 서로 다른 자산의 교체 시점·세금·운전자본을 반영한 IRR 계산은 포함하지 않습니다.</p><button type="button" class="mv-btn" data-legacy>기존 세부 원가 입력 열기</button></details></div>`;
  const form=host.querySelector('[data-dc-form]'),out=host.querySelector('[data-dc-result]');
  const field=k=>form.querySelector(`[data-dc="${k}"]`);
  const read=()=>({...Object.fromEntries([...form.querySelectorAll('[data-dc]')].map(el=>[el.dataset.dc,el.type==='number'?(el.value===''?null:Number(el.value)):el.value])),assumptionNotes:{...notes}});
  let revision=0,loading=false;
  const sync=()=>{
    const report=field('capitalMethod').value==='REPORT_FACTORS';
    const linked=field('powerMode').value==='linked';
    if(linked)field('powerLoadFraction').value=field('utilization').value;
    const x=read(),racks=x.gpusPerRack>0?x.gpuCount/x.gpusPerRack:NaN,it=racks*x.rackPowerKw/1000;
    host.querySelector('[data-capacity]').textContent=Number.isFinite(it)&&it>0?`IT 부하 ${num(it)} MW · 설계 수전 부하 ${num(it*x.pue)} MW · 등가 랙 ${num(racks)}개 (정수 설치 시 최소 ${Math.ceil(racks).toLocaleString()}개)`:'GPU 수와 랙 구성을 입력하세요.';
    const power=it*1000*x.pue*x.powerLoadFraction/100*8760*x.electricityUsdPerKwh;
    host.querySelector('[data-opex]').textContent=Number.isFinite(power)?`연 전기료 ${money(power)} + 기타 운영비 ${money(x.otherAnnualOpexUsd)} = 연 운영비 ${money(power+Number(x.otherAnnualOpexUsd))}`:'전력 가정을 확인하세요.';
    host.querySelector('[data-capital-note]').textContent=report?'보고서의 연간 비용 배분계수를 적용합니다. 내용연수·잔존가치·자본비용률을 직접 수정하면 사용자 할인율 계산으로 자동 전환합니다.':'입력한 자산별 내용연수·잔존가치와 공통 자본비용률로 연 자본회수비용을 계산합니다.';
  };
  const refreshEvidence=()=>{
    host.querySelector('[data-assumption-overview]').innerHTML=renderAssumptionOverview(read());
    host.querySelector('[data-assumption-table]').innerHTML=renderAssumptions(read());
  };
  const edit=event=>{
    revision++;
    const noteKey=event.target.dataset?.assumptionNote;
    if(noteKey) notes[noteKey]=event.target.value;
    else {
      const {patch,message}=transitionForEdit(read(),event.target.dataset?.dc||'');
      for(const [key,value] of Object.entries(patch))field(key).value=value;
      if(message)host.querySelector('[data-mode-notice]').textContent=message;
      sync();refreshEvidence();
    }
    onEdit(read());out.textContent='가정 또는 검토 근거가 변경되었습니다. 다시 계산하세요.';out.dataset.state='dirty';
    host.querySelector('[data-provenance]').textContent='보고서에서 출발한 사용자 편집 시나리오 · 각 값의 출처와 적용 여부는 원가 산정 가정과 근거에서 확인하세요.';
  };
  form.addEventListener('input',edit);form.addEventListener('change',edit);sync();refreshEvidence();
  host.querySelector('[data-reset]').onclick=()=>{onEdit(null);renderDataCenter({host,api,request,saved:null,onEdit,isActive,openLegacy});};
  host.querySelector('[data-legacy]').onclick=openLegacy;
  form.onsubmit=async event=>{
    event.preventDefault();if(loading)return;loading=true;const ticket=++revision;const button=form.querySelector('[type=submit]');button.disabled=true;
    const values=read();onEdit(values);out.textContent='데이터센터 원가와 판매가격을 계산하고 있습니다.';
    try {
      const result=await simulateDataCenter(request,values);
      if(!form.isConnected||!isActive()||ticket!==revision)return;
      out.innerHTML=renderResult(result,values,providers);out.dataset.state='valid';
      out.querySelector('[data-copy-report]').onclick=async()=>{
        const area=out.querySelector('[data-report-text]'),status=out.querySelector('[data-copy-status]');
        try{await navigator.clipboard.writeText(area.value);status.textContent=' 요약을 복사했습니다.';}
        catch{area.closest('details').open=true;area.focus();area.select();status.textContent=' 자동 복사가 제한되어 요약을 선택했습니다. 복사 단축키를 사용하세요.';}
      };
    } catch(error){if(form.isConnected&&isActive()&&ticket===revision){out.textContent=error.message;out.dataset.state='invalid';}}
    finally{loading=false;button.disabled=false;}
  };
  let providers=[];
  try {
    const response=await api('/api/v1/catalog');if(!response?.isSuccess||!Array.isArray(response.result?.models))throw Error('GPU 목록을 불러오지 못했습니다.');
    if(!form.isConnected||!isActive())return;
    providers=response.result.providers||[];
    const model=field('modelId');model.innerHTML='<option value="">시장 비교 생략</option>'+response.result.models.map(m=>`<option value="${esc(m.id)}" ${String(m.id)===String(s.modelId)?'selected':''}>${esc(m.name)}</option>`).join('');
    bindMarketScope(form,api,{model,gpu:field('offerGpuCount'),market:field('marketScope'),savedScope:s.marketScope?JSON.parse(s.marketScope):null});
  } catch(error) {
    if(form.isConnected){field('modelId').innerHTML='<option value="">시장 조회 불가</option>';host.querySelector('[data-market-status]').textContent=error.message+' 원가 계산은 사용할 수 있습니다.';}
  }
  if(!saved && revision===0 && form.isConnected && isActive()) form.requestSubmit();
}

export function renderResult(r,i,providers=[]) {
 const cards=[['GPU 시간당 원가',money(r.hourlyCost),'자본회수 포함 손익분기 단가'],['목표 판매가격',money(r.candidatePrice),`GPU 매출 이익률 ${num(i.targetMargin)}% 기준`],['검토 판매가격의 이익률',pct(r.gpuEconomicMargin),`GPU만 ${money(i.bareMetalPrice)}/시간에 판매할 때`]];
 const comparison=r.marketComparison;
 let market='<p>GPU 모델과 상품 조건을 선택하면 경쟁사 가격을 조회합니다.</p>';
 if(comparison?.status==='NOT_AVAILABLE')market='<p>선택 조건의 비교 가능한 공개 가격이 없습니다. 조건을 변경해 다시 조회하세요.</p>';
 if(comparison?.status==='OK') {
   market=comparison.groups.map(group=>{
     const sourceMap=new Map(group.sources.map(x=>[String(x.evidenceId),x]));
     return `<p>${esc(group.groupKey.regionCode)} · 상품당 ${esc(group.groupKey.gpuCount)} GPU · ${esc(group.groupKey.contractType)} · ${esc(group.sampleCounts.providerCount)}개 사업자</p><div class="mv-tablebox" tabindex="0"><table class="mv-table"><thead><tr><th>사업자 / 출처</th><th>경쟁사 공개 가격</th><th>우리 목표가 대비</th><th>그 가격에 판매 시 이익률</th><th>수집 시점 (KST)</th></tr></thead><tbody>${group.offerResults.map(offer=>{
       const provider=providers.find(p=>String(p.id)===String(offer.providerId));
       const sources=(offer.evidenceIds||[]).map(id=>sourceMap.get(String(id))).filter(Boolean);
       const links=sources.map(src=>{const url=safeSource(src.sourceUrl);return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(src.sourceName||'원문')}</a>`:esc(src.sourceName||'출처 미확인');}).join(' · ');
       const difference=Number(offer.price.amount)-Number(r.candidatePrice);
       return `<tr><td><b>${esc(provider?.name||sources[0]?.sourceName||'사업자명 미확인')}</b><small>${links||'출처 없음'}</small></td><td>${money(offer.price.amount)} / GPU·시간</td><td>${difference>=0?'+':''}${money(difference)}</td><td>${offer.estimatedMargin==null?'산출 불가':pct(offer.estimatedMargin)}</td><td>${offer.collectedAt?esc(new Date(offer.collectedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})):'미확인'}</td></tr>`;
     }).join('')}</tbody></table></div>`;
   }).join('');
 }
 return `<section class="dc-results"><h2>시간당 얼마에 판매해야 하는가</h2><div class="dc-result-cards">${cards.map(([label,value,note])=>`<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('')}</div>
 <p>원가 = 연 TCO ${money(r.annualTcoUsd)} ÷ 판매 가능한 ${num(r.billableGpuHours,0)} GPU·시간. 목표 판매가격은 소프트웨어 부가매출을 제외한 GPU 매출 기준입니다.</p>
 ${renderReasoning(r,i)}<div class="dc-section"><h3>연간 비용 구성</h3><div class="mv-tablebox" tabindex="0"><table class="mv-table"><thead><tr><th>항목</th><th>초기 투자비</th><th>연간 원가에 반영</th><th>연 정액 감가상각 · 참고</th></tr></thead><tbody>
 ${r.assets.map(a=>`<tr><td>${itemNames[a.type]} · ${a.years}년</td><td>${money(a.capexUsd)}</td><td>${money(a.annualCapitalUsd)}</td><td>${money(a.annualDepreciationUsd)}</td></tr>`).join('')}
 <tr><td>전기료</td><td>—</td><td>${money(r.annualElectricityUsd)}</td><td>—</td></tr><tr><td>기타 운영비 · 전기료 제외</td><td>—</td><td>${money(i.otherAnnualOpexUsd)}</td><td>—</td></tr>
 <tr><td><b>합계</b></td><td>${money(r.capexUsd)}</td><td><b>${money(r.annualTcoUsd)}</b></td><td>${money(r.annualDepreciationUsd)}</td></tr></tbody></table></div><p class="dc-small">연간 원가에는 자본회수비용과 운영비를 더합니다. 오른쪽 감가상각 참고값을 다시 더하지 않습니다.</p></div>
 <div class="dc-section"><h3>검토 판매가격 ${money(i.bareMetalPrice)}의 연간 손익</h3><div class="dc-result-cards"><div><span>GPU 임대 매출</span><strong>${money(r.gpuRevenueUsd)}</strong><small>소프트웨어 매출 제외</small></div><div><span>GPU 매출 기준 경제적 잉여</span><strong>${money(r.gpuEconomicSurplusUsd)}</strong><small>GPU 매출 − 연 TCO · 세후 순이익 아님</small></div></div>
 <details><summary>소프트웨어 부가매출 ${num(i.softwareAttach)}%를 포함하면</summary><p>부가매출 ${money(r.softwareRevenueUsd)} · 총매출 ${money(r.totalRevenueUsd)} · 경제적 잉여 ${money(r.economicSurplusUsd)} · 총매출 기준 이익률 ${pct(r.economicMarginWithAttach)}.</p><p>부가매출을 포함한 GPU 기본단가 손익분기점: ${money(r.bareMetalBreakEvenWithAttach)} / GPU·시간. 부가 서비스의 추가 비용이 있다면 운영비에도 반영해야 합니다.</p></details></div>
 <div class="dc-section"><h3>가동률에 따른 판매가격</h3><table class="mv-table"><thead><tr><th>유료 가동률</th><th>시간당 원가</th><th>목표 판매가격</th><th>검토 판매가격의 연 경제적 잉여</th></tr></thead><tbody>${utilizationScenarios(i,r).map(x=>`<tr><td>${x.util}%</td><td>${money(x.cost)}</td><td>${money(x.price)}</td><td>${money(x.surplus)}</td></tr>`).join('')}</tbody></table><p class="dc-small">투자비·기타 운영비·판매가격을 고정한 연 8,760시간 시나리오입니다. ${i.powerMode==='linked'?'전력 부하율도 유료 가동률과 함께 변경합니다.':'전력 부하율은 입력값으로 고정합니다.'} 미래 시세 예측이 아닙니다.</p></div>
 <div class="dc-section"><h3>경쟁사 공개 가격과 비교</h3>${market}<p class="dc-small">공개 가격은 선택한 상품 구성·계약의 관측값입니다. 우리 데이터센터 원가 가정과 동일한 장비·서비스 수준임을 보장하지 않습니다. 표시 이익률은 경쟁사 수익률이 아니라 우리가 그 가격에 판매할 때의 계산값입니다.</p></div></section>`;
}
