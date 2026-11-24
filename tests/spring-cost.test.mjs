import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateCost, costPayload, marketChoices } from '../docker_erd_20261117/app/web/static/spring-cost.mjs';

const input = {
  modelId: '2', gpu: 8, years: 5, util: .7, rate: null, fx: null, margin: .2, marginType: 'profit',
  items: [
    { id: 'server', state: 'user', period: 'once', amount: '400000', currency: 'USD' },
    { id: 'memory', state: 'included', includedIn: 'server', amount: null, currency: 'USD' },
    { id: 'ops', state: 'user', period: 'year', amount: '34000', currency: 'USD' }
  ]
};

test('sends the existing cost inputs to Spring without agent or private external context', async () => {
  const r = await calculateCost(async (path, payload) => {
    assert.equal(path, '/api/v1/cost-simulations');
    assert.deepEqual(payload.assumptions, { gpuCount: 8, depreciationYears: 5, utilization: '0.7',
      annualInterestRate: null, interestRateType: 'NOT_APPLIED', residualValueUsd: null, calendarMonth: null, costProfile: 'SCREEN_SCENARIO' });
    assert.equal(payload.items[1].includedInItemType, 'ACQUISITION');
    assert.equal(payload.items[2].amount, '34000');
    return { isSuccess: true, result: {
      unit: 'USD/GPU-hour', hourlyCost: '2.323874755382', candidatePrice: '2.904843444227',
      annualCost: '114000', missingItems: ['FINANCING'], warnings: [], costCompleteness: 'INCOMPLETE',
      marketComparison: { status: 'NOT_REQUESTED' }, appliedAssumptions: { capitalRecoveryFactor: '0.2' }, saved: false
    }};
  }, input);
  assert.equal(r.unit, 2.323874755382);
  assert.equal(r.candidate, 2.904843444227);
  assert.deepEqual(r.missing, ['조달 금리']);
});

test('preserves calendar month, residual and metered electricity when supplied', () => {
  const payload = costPayload({ ...input, period: 'month', month: '2028-02', salvage: 100000,
    rate: 0, fx: 1400, electricity: { mode: 'separate', kw: 10, pue: 1.2, tariff: 100 } });
  assert.equal(payload.assumptions.calendarMonth, '2028-02');
  assert.equal(payload.assumptions.residualValueUsd, '100000');
  assert.equal(payload.assumptions.annualInterestRate, '0');
  assert.deepEqual(payload.electricity, { itPowerKw: '10', pue: '1.2', krwPerKwh: '100' });
});

test('market choices pass an exact region and omit inapplicable commitment duration', () => {
  const groupKey = { regionCode: 'us-west-2', countryCode: 'US', providerType: 'GENERAL_CLOUD',
    systemType: 'INSTANCE', serviceOption: 'STANDARD', gpuCount: 8, contractType: 'ON_DEMAND',
    commitmentMonths: null, contractProductType: 'ON_DEMAND', paymentOption: 'NOT_APPLICABLE',
    intraNodeInterconnect: 'NVLink' };
  const [choice] = marketChoices([{groupKey}, {groupKey: { ...groupKey, vcpuCount: 200 }}]);
  assert.match(choice.label, /us-west-2.*온디맨드/);
  assert.equal(JSON.parse(choice.value).regionCode, 'us-west-2');
  assert.equal(JSON.parse(choice.value).commitmentMonths, undefined);
  assert.equal(marketChoices([{groupKey: {regionCode: 'unknown'}}]).length, 0);
});

test('included costs require a selected parent and never assume a parent', () => {
  const items = input.items.map(row => row.id === 'memory' ? { ...row, includedIn: null } : row);
  assert.throws(() => costPayload({ ...input, items }), /상위/);
});

const assetInput = { ...input, capitalMode: 'asset', rate: .08, salvage: 9999,
  items: input.items.map(row => row.id === 'server'
    ? {...row,usefulLifeYears:'5',residualValueUsd:'0'}
    : {...row,usefulLifeYears:'14',residualValueUsd:'100'})
};
test('asset payload removes duplicate aggregate residual and inactive asset details', () => {
  const payload=costPayload(assetInput);
  assert.equal(payload.assumptions.residualValueUsd,null);
  assert.equal(payload.assumptions.depreciationYears,5);
  assert.equal(payload.items[0].usefulLifeYears,5);
  assert.equal(payload.items[0].residualValueUsd,'0');
  assert.equal(payload.items[1].usefulLifeYears,undefined);
  assert.equal(payload.items[2].residualValueUsd,undefined);
  assert.equal(costPayload({...assetInput,capitalMode:'common'}).items[0].usefulLifeYears,undefined);
});
test('blank residual and fractional life cannot silently become defaults', () => {
  for(const values of [{residualValueUsd:''},{residualValueUsd:null},{usefulLifeYears:'2.5'},{usefulLifeYears:''}]) {
    assert.throws(()=>costPayload({...assetInput,items:assetInput.items.map(row=>row.id==='server'?{...row,...values}:row)}),/내용연수/);
  }
});
test('an older backend cannot silently ignore per-asset requests', async () => {
  await assert.rejects(calculateCost(async()=>({isSuccess:true,result:{unit:'USD/GPU-hour',saved:false,appliedAssumptions:{}}}),assetInput),/반영되지 않았습니다/);
});
test('maps asset results without inventing a common CRF', async () => {
  const r=await calculateCost(async()=>({isSuccess:true,result:{unit:'USD/GPU-hour',saved:false,
    hourlyCost:'2',candidatePrice:'2.5',annualCost:'124000',missingItems:[],warnings:[],costCompleteness:'COMPLETE',
    appliedAssumptions:{assetSpecificLives:true,capitalRecoveryFactor:null,annualStraightLineDepreciationUsd:'90000',
      capitalAssets:[{itemType:'RACK_FACILITY',usefulLifeYears:14,acquisitionCostUsd:'140000',residualValueUsd:'0',
        capitalRecoveryFactor:'0.071428571428',annualCapitalRecoveryUsd:'10000',annualStraightLineDepreciationUsd:'10000'}]}
  }}),assetInput);
  assert.equal(r.crf,null);
  assert.equal(r.annualDepreciation,90000);
  assert.equal(r.capitalAssets[0].years,14);
  assert.equal(r.capitalAssets[0].label,'랙·전원·냉각 설비');
});
