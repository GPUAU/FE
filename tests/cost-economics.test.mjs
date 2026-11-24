import assert from 'node:assert/strict';
import { test } from 'node:test';
import { annualRecovery, costBreakdown, sensitivity, canTransferCost, renderCostEconomics } from '../docker_erd_20261117/app/web/static/cost-economics.mjs';

const base = {
  gpu: 8, util: .75, years: 5, rate: 0, opex: 34000, capitalAnnual: 90000,
  annualDepreciation: 90000, assetSpecificLives: true, nonPositiveCandidate: false,
  capitalAssets: [
    {type:'ACQUISITION', label:'서버·GPU', years:5, capex:400000, salvage:0, capitalAnnual:80000, annualDepreciation:80000},
    {type:'RACK_FACILITY', label:'시설', years:14, capex:140000, salvage:0, capitalAnnual:10000, annualDepreciation:10000}
  ]
};
const close = (actual, expected) => assert.ok(Math.abs(actual-expected) < 1e-7, `${actual} != ${expected}`);

test('annual recovery respects zero rate, positive rate and salvage opportunity cost', () => {
  close(annualRecovery(100000,10000,5,0),18000);
  const expected=(100000-10000/1.1**5)*(.1/(1-1.1**-5));
  close(annualRecovery(100000,10000,5,.1), expected);
  close(annualRecovery(100000,100000,5,.1),10000);
  close(annualRecovery(100000,0,5,1e-12),20000);
  assert.throws(()=>annualRecovery(100,101,5,.1));
  assert.throws(()=>annualRecovery(100,0,2.5,.1));
});

test('economic cost does not add straight-line depreciation a second time', () => {
  const r=costBreakdown(base);
  close(r.economicUnit,124000/(8*8760*.75));
  close(r.depreciationUnit,r.economicUnit);
  close(r.cashUnit,34000/(8*8760*.75));
  const withCapitalCost=costBreakdown({...base,capitalAnnual:120000});
  close(withCapitalCost.economicUnit,154000/(8*8760*.75));
  close(withCapitalCost.depreciationUnit,124000/(8*8760*.75));
});

test('IT sensitivity holds facility life, residuals and operating power cost fixed', () => {
  const rows=sensitivity(base);
  close(rows[0].values[1],(400000/3+140000/14+34000)/(8*8760*.75));
  close(rows[1].values[1],124000/(8*8760*.75));
  assert.ok(rows[2].values[1]<rows[1].values[1]);
  assert.ok(rows[0].values[0]>rows[0].values[1]);
  close(rows[0].values[0]*.60,rows[0].values[2]*.85);
  const withSalvage={...base,capitalAssets:base.capitalAssets.map(a=>({...a,salvage:10000}))};
  close(sensitivity(withSalvage)[0].values[1],(390000/3+130000/14+34000)/(8*8760*.75));
});

test('mixed-life residuals cannot be transferred to a single-horizon IRR', () => {
  assert.equal(canTransferCost(base),false);
  assert.equal(canTransferCost({...base,capitalAssets:base.capitalAssets.map(a=>({...a,years:5}))}),true);
  assert.equal(canTransferCost({...base,assetSpecificLives:false}),true);
  assert.equal(canTransferCost({...base,assetSpecificLives:false,nonPositiveCandidate:true}),false);
});

test('rendered sensitivity labels annual assumptions and keeps asset labels escaped', () => {
  const output=renderCostEconomics(base,{money:n=>n.toFixed(2),escape:s=>s.replaceAll('&','&amp;')});
  assert.match(output,/정액 감가상각비를 자본회수비용에 다시 더하지/);
  assert.match(output,/연 8,760시간/);
  assert.match(output,/미래 시세 예측이 아닙니다/);
  assert.doesNotMatch(output,/NaN|Infinity|undefined/);
});
