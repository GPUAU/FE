import {reportDefaults,safeSource} from './data-center-model.mjs?v=logic1124';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>v==null||v===''?'미입력':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:8});
const usd=v=>'$'+Number(v).toLocaleString('ko-KR',{maximumFractionDigits:2});
const report='미래에셋증권 「AI Factory의 경제학」, 2026-05-19, 표 3~5(14~16쪽)';
const definitions=[
 ['gpuCount','전체 GPU 수','개','report','센터의 판매 가능 GPU 시간과 랙 규모를 산정하는 기준.'],
 ['gpusPerRack','랙당 GPU 수','개','report','보고서의 NVL72 구성. 다른 장비 구성에는 직접 조정.'],
 ['rackPowerKw','랙당 IT 전력','kW','report','등가 랙 수에 곱해 설계 IT 부하를 산정.'],
 ['pue','PUE','배','report','IT 전력에 냉각·전력 손실 등 부대 전력을 반영.'],
 ['utilization','유료 가동률','%','report','보유 시간 중 유료 판매되는 비율. 판매 분모를 결정.'],
 ['powerLoadFraction','평균 전력 부하율','%','linked','유료 가동률과 전력 사용률이 같다는 가정은 별도 확인 필요.'],
 ['electricityUsdPerKwh','전력단가','USD/kWh','report','연간 사용 전력량에 적용. 실제 계약 전력단가 확인 필요.'],
 ['serverCapex','서버·GPU 취득비','USD','report','서버 투자비를 연간 자본회수비용으로 배분. 메모리 중복 가산 제외.'],
 ['networkCapex','네트워크 취득비','USD','report','네트워크 투자비를 서버·시설과 분리.'],
 ['facilityCapex','시설·전력·냉각 취득비','USD','report','센터 시설과 전력·냉각 인프라의 통합 투자비.'],
 ['serverYears','서버 내용연수','년','report','자본비용 회수기간. 보고서 계수 모드에서는 설명 가정, 할인율 모드에서는 산식에 직접 적용.'],
 ['networkYears','네트워크 내용연수','년','report','네트워크 투자비의 회수기간. 보고서 계수 모드에서는 설명 가정.'],
 ['facilityYears','시설 내용연수','년','report','IT 장비와 시설의 회수기간을 구분. 보고서 계수 모드에서는 설명 가정.'],
 ['serverResidual','서버 종료 잔존가치','USD','assumed','제품의 0 가정. 보고서의 독립적인 잔존가치 견적이 아님.'],
 ['networkResidual','네트워크 종료 잔존가치','USD','assumed','제품의 0 가정. 실제 처분가치 확인 필요.'],
 ['facilityResidual','시설 종료 잔존가치','USD','assumed','제품의 0 가정. 서로 다른 자산의 종료 시점은 같지 않을 수 있음.'],
 ['annualDiscountRate','연 자본비용률','%','example','8%는 사용자 예시. 보고서에 명시된 공통 WACC가 아님.'],
 ['otherAnnualOpexUsd','기타 연 운영비','USD/년','derived','900,000,000 − 624,649,320 = 275,350,680. 인건비·보안 등의 개별 견적이 아닌 잔액.'],
 ['targetMargin','목표 매출 이익률','%','example','20%는 사용자 목표 예시. 원가 가산율과 구분하며 원가 ÷ (1−목표율)에 적용.'],
 ['bareMetalPrice','검토 GPU 판매가격','USD/GPU·시간','report','보고서의 매출 시나리오. 경쟁사 최신 관측 가격이 아님.'],
 ['softwareAttach','소프트웨어 부가매출률','%','report','GPU 매출에 곱하는 부가매출 가정. GPU 목표 판매가격에는 반영하지 않음.']
];

export function transitionForEdit(input,key) {
 const patch={};let message='';
 if((key==='annualDiscountRate'||/^(server|network|facility)(Years|Residual)$/.test(key))&&input.capitalMethod==='REPORT_FACTORS') {
  patch.capitalMethod='DISCOUNT_RATE';message='입력한 자본비용률·내용연수·잔존가치를 계산에 반영하도록 사용자 할인율 계산으로 전환했습니다.';
 }
 if(key==='powerLoadFraction'&&input.powerMode==='linked') {patch.powerMode='independent';message='직접 입력한 전력 부하율을 유지하도록 별도 입력으로 전환했습니다. 유료 가동률과 독립적으로 계산합니다.';}
 if(key==='capitalMethod'&&input.capitalMethod==='REPORT_FACTORS') {
  Object.assign(patch,{serverYears:5,networkYears:5,facilityYears:14,serverResidual:0,networkResidual:0,facilityResidual:0});
  message='보고서 계수를 선택해 내용연수를 IT 5년·시설 14년, 잔존가치를 0으로 복원했습니다. 표시된 자본비용률은 이 모드에서 사용하지 않습니다.';
 }
 if(key==='powerMode'&&input.powerMode==='linked')message='전력 부하율을 유료 가동률에 다시 연동했습니다.';
 return {patch,message};
}

export function assumptionRows(input) {
 const defaults=reportDefaults();
 return definitions.map(([key,label,unit,kind,reason])=>{
  const value=key==='powerLoadFraction'&&input.powerMode==='linked'?input.utilization:input[key];
  const changed=value==null||value===''||Number(value)!==Number(defaults[key]);
  let category=changed?'사용자 변경':kind==='report'?'보고서 가정과 동일':kind==='derived'?'보고서에서 산출':kind==='example'?'사용자 예시':'사용자 가정';
  let source=kind==='report'||kind==='derived'?report:'사용자 설정 · 외부 근거 미확인';
  if(key==='powerLoadFraction'){category=input.powerMode==='linked'?'모형 연동값':'사용자 직접 입력';source=input.powerMode==='linked'?'유료 가동률과 동일하게 적용하는 보고서 모형':'사용자 설정 · 부하 측정자료 확인 필요';}
  if(changed&&kind!=='linked')source='기준값 출처와 별개인 사용자 설정 · 입력 근거 확인 필요';
  const applied=key==='annualDiscountRate'&&input.capitalMethod==='REPORT_FACTORS'?'미적용 · 보고서 배분계수 사용':'적용';
  return {key,label,unit,value,baseline:defaults[key],category,source,reason,applied,changed,note:String(input.assumptionNotes?.[key]||'')};
 });
}
export function renderAssumptions(input) {
 const rows=assumptionRows(input);
 return `<div class="mv-tablebox" tabindex="0" role="region" aria-label="가정과 근거"><table class="mv-table dc-assumption-table"><thead><tr><th>가정</th><th>현재 값 / 출발값</th><th>근거 구분</th><th>적용 이유와 출처</th><th>담당자 검토 근거 · 선택</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.label)}</td><td><b>${n(r.value)} ${r.unit}</b><small>출발값 ${n(r.baseline)} ${r.unit}</small><small>${r.applied}</small></td><td><span class="dc-evidence-tag">${r.category}</span></td><td>${esc(r.reason)}<small>${esc(r.source)}</small></td><td><textarea data-assumption-note="${r.key}" rows="2" maxlength="1200" aria-label="${esc(r.label)} 검토 근거" placeholder="예: 견적서명·기준일·선택 이유">${esc(r.note)}</textarea></td></tr>`).join('')}</tbody></table></div><p class="dc-small">담당자 메모는 검증된 출처로 자동 인정되지 않습니다. 메모는 현재 브라우저의 작업 상태에만 유지하며 계산 서버로 보내지 않습니다. 새로고침하면 사라집니다.</p>`;
}
export function renderAssumptionOverview(i) {
 const rows=assumptionRows(i),changed=rows.filter(r=>r.changed&&r.applied.startsWith('적용')).length;
 return `<div class="dc-evidence-overview"><div><small>모형의 범위</small><b>데이터센터 직접 운영</b><span>설비 투자와 연간 운영비 포함</span></div><div><small>자본회수 가정</small><b>${i.capitalMethod==='REPORT_FACTORS'?'보고서 배분계수':'사용자 할인율 계산'}</b><span>${i.capitalMethod==='REPORT_FACTORS'?'서버·네트워크 약 24% / 시설 약 11.51%':n(i.annualDiscountRate)+'% · 자산별 내용연수·잔존가치'}</span></div><div><small>전력 가정</small><b>${i.powerMode==='linked'?'유료 가동률과 연동':'독립 전력 부하율'}</b><span>${n(i.powerMode==='linked'?i.utilization:i.powerLoadFraction)}% 적용</span></div><div><small>출발값과 다른 적용 가정</small><b>${changed}개</b><span>보고서 가정·산출값·사용자 설정 구분</span></div></div>`;
}
export function reviewSummary(r,i) {
 const rows=assumptionRows(i);
 const market=r.marketComparison?.status;
 const lines=[
 '데이터센터 원가·판매가격 검토',
 '검토 목적: '+(i.assumptionNotes?.scenario||'데이터센터 운영 원가와 목표 마진 판매가격 검토'),
 '계산 시점: '+(r.calculatedAt?new Date(r.calculatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST':'미기록'),
 '기준 자료: '+report,
 '계산 방식: '+(i.capitalMethod==='REPORT_FACTORS'?'보고서 연간 비용 배분계수':'자산별 할인율 계산'),
 '연 자본회수비용 '+usd(r.annualCapitalUsd)+' + 전기료 '+usd(r.annualElectricityUsd)+' + 기타 운영비 '+usd(i.otherAnnualOpexUsd)+' = 연 TCO '+usd(r.annualTcoUsd),
 '판매 GPU 시간: '+n(i.gpuCount)+' × 8,760 × '+n(i.utilization)+'% = '+n(r.billableGpuHours),
 '시간당 원가 '+usd(r.hourlyCost)+' / GPU·시간 · 목표 매출 이익률 '+n(i.targetMargin)+'% · 목표 판매가격 '+usd(r.candidatePrice)+' / GPU·시간 (소프트웨어 부가매출 제외)',
 '검토 판매가격 '+usd(i.bareMetalPrice)+' · GPU 매출 기준 연 경제적 잉여 '+usd(r.gpuEconomicSurplusUsd),
 '전력 부하율: '+(i.powerMode==='linked'?'유료 가동률과 연동 '+n(i.utilization):'별도 입력 '+n(i.powerLoadFraction))+'%',
 '시장 비교: '+(market==='OK'?'선택 상품 조건의 공개 관측 가격 조회':market==='NOT_AVAILABLE'?'선택 조건의 비교 가격 없음':'미선택'),
 ...(i.modelId?['시장 조회 모델 ID: '+i.modelId+' · 상품 GPU 수: '+n(i.offerGpuCount)+' (센터 전체 GPU 수와 별개)']:[]),
 '', '가정과 선택 근거:',
 ...rows.map(x=>`${x.label}: ${n(x.value)} ${x.unit} [${x.category}; ${x.applied}] · 출발값 ${n(x.baseline)} · ${x.reason} · 담당자 근거: ${x.note||'미기재'}`),
 '', '확인할 사항: 실제 장비·시설 견적, 기타 운영비 세부 내역, 실제 전력 부하와 가동률. GPU 모델·규모 변경 시 비용 적합성 확인.',
 '범위: 자본회수비용 포함 경제적 원가·잉여. 감가상각 중복 가산 없음. 세후 순이익·중간 교체투자 현금흐름·IRR 제외. 담당자 메모는 외부 검증되지 않음.',
 '계산 버전: '+r.formulaVersion
 ];
 if(market==='OK')for(const g of r.marketComparison.groups||[]) {
  lines.push('시장 조건: '+JSON.stringify(g.groupKey));
  for(const o of g.offerResults||[])lines.push(`관측 오퍼 ${o.offerId||'미확인'}: ${o.price.amount} USD/GPU·시간 · 수집 ${o.collectedAt||'미확인'} · 우리 예상 이익률 ${o.estimatedMargin==null?'미산출':n(Number(o.estimatedMargin)*100)+'%'}`);
  for(const s of g.sources||[])lines.push('시장 출처: '+(s.sourceName||'미확인')+' · '+(safeSource(s.sourceUrl)||'유효한 공개 URL 미확인'));
 }
 return lines.join('\n');
}
export function renderReasoning(r,i) {
 return `<section class="dc-section dc-reasoning"><h3>이 판매가격이 나온 이유</h3><div class="dc-logic-flow" role="group" aria-label="원가에서 판매가격까지 계산 흐름"><article><small>비용을 연간으로 합산</small><h4>연간 총원가</h4><p>자본회수 ${usd(r.annualCapitalUsd)}<br>+ 전기료 ${usd(r.annualElectricityUsd)}<br>+ 기타 운영비 ${usd(i.otherAnnualOpexUsd)}</p><strong>= ${usd(r.annualTcoUsd)}</strong></article><article><small>판매 가능한 GPU 시간으로 배분</small><h4>GPU 시간당 원가</h4><p>${usd(r.annualTcoUsd)} ÷<br>(${n(i.gpuCount)} GPU × 8,760시간 × ${n(i.utilization)}%)</p><strong>= ${usd(r.hourlyCost)}</strong></article><article><small>목표 매출 이익률 적용</small><h4>목표 판매가격</h4><p>${usd(r.hourlyCost)} ÷ (1 − ${n(i.targetMargin)}%)<br>소프트웨어 부가매출 제외</p><strong>= ${usd(r.candidatePrice)}</strong></article></div><p>${i.capitalMethod==='REPORT_FACTORS'?'자본회수비용은 보고서의 각 연간 비용 ÷ 취득비 계수를 적용합니다. 표시된 5년·14년은 이 계수의 배경 가정이며 공통 자본비용률은 사용하지 않습니다.':'자본회수비용은 자산별 (취득비 − 잔존가치 현재가치) × CRF의 합입니다. 입력한 자본비용률·내용연수·잔존가치를 적용합니다.'} 정액 감가상각비를 다시 더하지 않습니다.</p><details><summary>보고 전에 확인할 가정과 미확인 항목</summary><ul><li>보고서 숫자는 분석 가정이며 실제 장비·시설 견적이나 실측값이 아닙니다.</li><li>기타 운영비 기본값은 총 운영비에서 전기료를 뺀 잔액입니다. 인건비·유지보수·보안 등 세부 내역을 확인하세요.</li><li>${i.powerMode==='linked'?'전력 부하율과 유료 가동률을 같게 적용했습니다. 유휴전력이 다르면 독립 부하율을 입력하세요.':'전력 부하율을 유료 가동률과 독립적으로 적용했습니다. 측정자료 또는 산정 근거를 확인하세요.'}</li><li>GPU 모델·규모 변경 시 기존 투자비의 적합성을 확인해야 합니다. 세후 손익과 중간 교체투자·IRR은 계산 범위 밖입니다.</li></ul></details></section>
 <section class="dc-section"><h3>보고용 요약</h3><p class="dc-small">현재 계산에 사용된 가정·근거·결과를 함께 복사합니다. 입력을 바꾸면 다시 계산해야 합니다.</p><button type="button" class="mv-btn" data-copy-report>보고용 요약 복사</button><span data-copy-status role="status"></span><details><summary>요약 내용 확인</summary><textarea class="dc-report-text" data-report-text rows="14" readonly aria-label="현재 계산의 보고용 요약">${esc(reviewSummary(r,i))}</textarea></details></section>`;
}
