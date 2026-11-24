import test from 'node:test';
import assert from 'node:assert/strict';
import {reportDefaults,dataCenterPayload} from '../docker_erd_20261117/app/web/static/data-center-model.mjs';
import {transitionForEdit,assumptionRows,renderAssumptions,renderReasoning,reviewSummary} from '../docker_erd_20261117/app/web/static/data-center-evidence.mjs';

test('editing formerly locked capital inputs changes the method and preserves the entered value',()=>{
 for(const [key,value] of [['annualDiscountRate',10],['serverYears',3],['networkYears',7],['facilityYears',20],['serverResidual',2000],['networkResidual',1000],['facilityResidual',5000]]) {
  const input={...reportDefaults(),[key]:value};
  const {patch,message}=transitionForEdit(input,key);
  const edited={...input,...patch};
  assert.equal(edited.capitalMethod,'DISCOUNT_RATE');assert.equal(edited[key],value);assert.ok(message);
  const payload=dataCenterPayload(edited);
  if(key==='annualDiscountRate')assert.equal(payload.annualDiscountRate,'0.1');
  if(key==='serverYears')assert.equal(payload.server.years,3);
  if(key==='facilityResidual')assert.equal(payload.facility.residualUsd,'5000');
 }
});
test('editing power load disconnects it from paid utilization without overwriting it',()=>{
 const i={...reportDefaults(),powerLoadFraction:42};
 const changed={...i,...transitionForEdit(i,'powerLoadFraction').patch};
 assert.equal(dataCenterPayload(changed).powerLoadFraction,'0.42');
 assert.equal(dataCenterPayload(changed).utilization,'0.75');
 assert.equal(transitionForEdit({...changed,utilization:60},'utilization').patch.powerMode,undefined);
});
test('explicit return to report mode restores only the constrained capital inputs',()=>{
 const i={...reportDefaults(),serverYears:3,serverResidual:2000};
 const {patch,message}=transitionForEdit(i,'capitalMethod');
 const restored={...i,...patch};
 assert.equal(restored.serverYears,5);assert.equal(restored.facilityYears,14);assert.equal(restored.serverResidual,0);
 assert.match(message,/복원/);assert.equal(restored.targetMargin,20);assert.doesNotThrow(()=>dataCenterPayload(restored));
});
test('evidence distinguishes report assumptions, derived values, unverified assumptions and changes',()=>{
 const map=i=>Object.fromEntries(assumptionRows(i).map(x=>[x.key,x]));
 const original=map(reportDefaults());
 assert.equal(original.gpuCount.category,'보고서 가정과 동일');
 assert.equal(original.otherAnnualOpexUsd.category,'보고서에서 산출');
 assert.equal(original.targetMargin.category,'사용자 예시');
 assert.equal(original.serverResidual.category,'사용자 가정');
 assert.match(original.annualDiscountRate.applied,/미적용/);
 const changed=map({...reportDefaults(),utilization:60,otherAnnualOpexUsd:1,capitalMethod:'DISCOUNT_RATE'});
 assert.equal(changed.utilization.category,'사용자 변경');
 assert.equal(changed.otherAnnualOpexUsd.category,'사용자 변경');
 assert.equal(changed.powerLoadFraction.value,60);
 assert.equal(changed.annualDiscountRate.applied,'적용');
 assert.equal(map({...reportDefaults(),serverCapex:null}).serverCapex.category,'사용자 변경');
});
test('review notes remain local, are escaped and do not become verified sources',()=>{
 const i={...reportDefaults(),assumptionNotes:{serverCapex:'</textarea><script>alert(1)</script>',scenario:'CEO 검토'}};
 const payload=dataCenterPayload(i);assert.equal(payload.assumptionNotes,undefined);
 const html=renderAssumptions(i);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
 assert.match(html,/검증된 출처로 자동 인정되지 않습니다/);
});
test('reasoning and copied summary use the calculated snapshot and show exclusions',()=>{
 const i={...reportDefaults(),targetMargin:25,assumptionNotes:{scenario:'70% 시나리오',utilization:'담당자 검토 필요'}};
 const r={annualCapitalUsd:'7600000000',annualElectricityUsd:'624649320',annualTcoUsd:'8500000000',billableGpuHours:'3942000000',hourlyCost:'2.15626585',candidatePrice:'2.87502114',gpuEconomicSurplusUsd:'3326000000',formulaVersion:'dc-report-1',calculatedAt:'2026-11-24T08:00:00Z',marketComparison:{status:'NOT_REQUESTED'}};
 const summary=reviewSummary(r,i),html=renderReasoning(r,i);
 assert.match(summary,/25%/);assert.match(summary,/2.88/);assert.match(summary,/담당자 검토 필요/);assert.match(summary,/세후 순이익/);
 assert.match(summary,/시장 비교: 미선택/);assert.match(summary,/KST/);
 assert.match(html,/계산 흐름/);assert.match(html,/보고용 요약/);assert.doesNotMatch(html,/NaN|undefined/);
});
