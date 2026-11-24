import test from 'node:test';
import assert from 'node:assert/strict';
import {reportDefaults,dataCenterPayload,simulateDataCenter,utilizationScenarios,safeSource} from '../docker_erd_20261117/app/web/static/data-center-model.mjs';
import {renderResult} from '../docker_erd_20261117/app/web/static/data-center-ui.mjs';
const result={formulaVersion:'dc-report-1',saved:false,unit:'USD/GPU-hour',
  annualElectricityUsd:'624649320',annualCapitalUsd:'7600000000',annualTcoUsd:'8500000000',annualDepreciationUsd:'6035714285.6',
  capexUsd:'38000000000',billableGpuHours:'3942000000',hourlyCost:'2.15626585',candidatePrice:'2.69533232',
  gpuEconomicMargin:'.281244714',gpuRevenueUsd:'11826000000',softwareRevenueUsd:'1182600000',totalRevenueUsd:'13008600000',
  gpuEconomicSurplusUsd:'3326000000',economicSurplusUsd:'4508600000',economicMarginWithAttach:'.346585',bareMetalBreakEvenWithAttach:'1.96024168',
  assets:[{type:'SERVER',years:5,capexUsd:'20833333333',annualCapitalUsd:'5000000000',annualDepreciationUsd:'4166666666.6'}],marketComparison:{status:'NOT_REQUESTED'}};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('report defaults are explicit and power is included once in total OPEX',()=>{
 const i=reportDefaults(),p=dataCenterPayload(i);
 assert.equal(p.gpuCount,600000);assert.equal(p.gpusPerRack,72);
 assert.equal(p.server.capexUsd,'20833333333');assert.equal(p.facility.years,14);
 const energy=i.gpuCount/i.gpusPerRack*i.rackPowerKw*i.pue*.75*8760*i.electricityUsdPerKwh;
 close(energy,624649320);close(energy+i.otherAnnualOpexUsd,900000000);
 i.serverCapex=0;assert.equal(reportDefaults().serverCapex,20833333333);
});
test('market product GPU count is independent from center capacity',()=>{
 const scope={gpuCount:8,countryCode:'US'};
 const p=dataCenterPayload({...reportDefaults(),modelId:'2',marketScope:JSON.stringify(scope)});
 assert.equal(p.gpuCount,600000);assert.equal(p.marketFilters.gpuCount,8);
 const resized=dataCenterPayload({...reportDefaults(),gpuCount:72});
 assert.equal(resized.server.capexUsd,'20833333333');
});
test('linked and independent power modes do not apply paid utilization twice',()=>{
 const base=reportDefaults();
 assert.equal(dataCenterPayload({...base,utilization:60}).powerLoadFraction,'0.6');
 assert.equal(dataCenterPayload({...base,utilization:60,powerMode:'independent'}).powerLoadFraction,'0.75');
 const linked=utilizationScenarios(base,result);
 close(linked[1].cost,8500000000/3942000000);
 close(linked[0].cost,(7600000000+275350680+624649320*.6/.75)/(600000*8760*.6));
 const fixed=utilizationScenarios({...base,powerMode:'independent'},result);
 close(fixed[0].cost,8500000000/(600000*8760*.6));
 close(linked[1].price,8500000000/3942000000/.8);
});
test('report mode and discount-rate mode never mix hidden capital assumptions',()=>{
 const i={...reportDefaults(),serverYears:3,serverResidual:100000};
 assert.equal(dataCenterPayload(i).server.years,5);assert.equal(dataCenterPayload(i).server.residualUsd,'0');
 assert.equal(dataCenterPayload({...i,capitalMethod:'DISCOUNT_RATE'}).server.years,3);
 assert.throws(()=>dataCenterPayload({...reportDefaults(),gpuCount:2.5}),/정수/);
 assert.throws(()=>dataCenterPayload({...reportDefaults(),serverCapex:''}),/빈 입력/);
 assert.throws(()=>dataCenterPayload({...reportDefaults(),targetMargin:100}),/100% 미만/);
 assert.equal(dataCenterPayload({...reportDefaults(),bareMetalPrice:0}).bareMetalPrice,'0');
});
test('uses server results and rejects an incompatible endpoint response',async()=>{
 const r=await simulateDataCenter(async(path,payload)=>{assert.equal(path,'/api/v1/data-center-simulations');assert.equal(payload.targetMargin,'0.2');return {isSuccess:true,result};},reportDefaults());
 assert.equal(r.hourlyCost,'2.15626585');
 await assert.rejects(simulateDataCenter(async()=>({isSuccess:true,result:{saved:true}}),reportDefaults()),/계산 응답/);
});
test('result distinguishes GPU-only margin and software revenue and escapes evidence',()=>{
 const r={...result,marketComparison:{status:'OK',groups:[{
   groupKey:{regionCode:'us-east-1',gpuCount:8,contractType:'ON_DEMAND'},sampleCounts:{providerCount:1},
   sources:[{evidenceId:'1',sourceName:'<evil>',sourceUrl:'javascript:alert(1)'}],
   offerResults:[{providerId:'7',price:{amount:'3'},estimatedMargin:'.28',evidenceIds:['1']}]
 }]}};
 const html=renderResult(r,reportDefaults(),[{id:'7',name:'Example Cloud'}]);
 assert.match(html,/Example Cloud/);assert.match(html,/&lt;evil&gt;/);assert.doesNotMatch(html,/javascript:|NaN|undefined/);
 assert.match(html,/경쟁사 수익률이 아니라/);assert.match(html,/소프트웨어 부가매출을 제외/);
 assert.equal(safeSource('https://example.com/rates'),'https://example.com/rates');
 assert.equal(safeSource('https://user:secret@example.com'),null);
});
