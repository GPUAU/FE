import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchContractCatalog, fetchContractComparison, filterContractProducts} from '../docker_erd_20261117/app/web/static/spring-contracts.mjs';

const ok = result => ({isSuccess: true, result});
const provider = {id: '1', name: 'AWS'};
const model = {id: '4', name: 'H100'};
const offer = (offerId, productId, type, months, gpuCount, regionCode, sourceUrl) => ({
  offerId, productId, providerId: provider.id, providerName: provider.name,
  modelId: model.id, modelName: model.name,
  product: {sku: 'same-name-sku', originalProductName: 'p5.48xlarge', regionCode, gpuCount},
  contract: {type, months, productType: {ON_DEMAND: 'On-Demand', COMMITMENT: 'Reserved', SPOT: 'Spot'}[type]},
  comparison: {eligibleForAggregate: true},
  lastSuccessfulObservation: {
    observationId: '1' + offerId,
    components: [{type: 'HOURLY_RATE', amount: '40', currency: 'USD'}],
    evidence: [{role: 'PRIMARY', sourceName: 'Provider', sourceUrl}],
  },
});

test('discovers each eligible product ID once across offer pages and retains its configuration and terms', async () => {
  const paths = [];
  const request = async path => {
    paths.push(path);
    if (path === '/api/v1/catalog') return ok({providers: [provider], models: [model]});
    return paths.length === 2
      ? ok({items: [offer('1', '12', 'ON_DEMAND', null, 8, 'us-east-1'), offer('2', '12', 'COMMITMENT', 12, 8, 'us-east-1')], nextCursor: 'page/2'})
      : ok({items: [offer('3', '12', 'COMMITMENT', 36, 8, 'us-east-1'), offer('4', '13', 'SPOT', null, 4, 'us-east-1'), offer('5', '14', 'ON_DEMAND', null, 8, 'us-west-2')], nextCursor: null});
  };
  const catalog = await fetchContractCatalog(request);
  assert.deepEqual(paths, [
    '/api/v1/catalog', '/api/v1/market/offers?includeStale=true&limit=100',
    '/api/v1/market/offers?includeStale=true&limit=100&cursor=page%2F2',
  ]);
  assert.deepEqual(catalog.products.map(p => [p.id, p.gpuCount, p.offers.size]), [['12', 8, 3], ['13', 4, 1]]);
  assert.deepEqual(filterContractProducts(catalog.products, {modelId: '4', providerId: '1', type: 'Reserved', term: '36'}).map(p => p.id), ['12']);
  assert.deepEqual(filterContractProducts(catalog.products, {type: 'Spot', term: 'NONE'}).map(p => p.id), ['13']);
  assert.deepEqual(filterContractProducts(catalog.products, {modelId: '1'}), []);
});

test('preserves the per-offer Spring discount and attaches evidence only to matching observations', async () => {
  const sourceUrl = 'https://pricing.example/reserved';
  const page = [offer('1', '12', 'ON_DEMAND', null, 8, 'us-east-1'), offer('2', '12', 'COMMITMENT', 12, 8, 'us-east-1', sourceUrl), offer('3', '12', 'SPOT', null, 8, 'us-east-1', 'https://pricing.example/old')];
  const catalog = await fetchContractCatalog(async path => path === '/api/v1/catalog' ? ok({models:[model], providers:[provider]}) : ok({items:page}));
  const items = [
    {offerId:'1', observationId:'11', contractType:'ON_DEMAND', effective:{status:'OK', amount:'5'}},
    {offerId:'2', observationId:'12', contractType:'COMMITMENT', effective:{status:'OK', kind:'EXACT', amount:'2'}},
    {offerId:'3', observationId:'new', contractType:'SPOT', effective:{status:'OK', amount:'1'}},
    {offerId:'4', observationId:'14', contractType:'COMMITMENT', effective:{status:'OK', kind:'SCENARIO', amount:'3'}},
  ];
  const discounts = [
    {baseOfferId:'1', commitmentOfferId:'2', status:'OK', discountRate:'0.600000'},
    {baseOfferId:'1', commitmentOfferId:'4', status:'UNAVAILABLE', discountRate:null, reason:'COMMITMENT_PRICE_NOT_EXACT'},
  ];
  const result = await fetchContractComparison(async path => {
    assert.equal(path, '/api/v1/market/products/12/contracts?currency=USD');
    return ok({productId:'12', items, discounts});
  }, catalog.products[0]);
  assert.equal(result.baseline.offerId, '1');
  assert.equal(result.items[1].discount.discountRate, '0.600000');
  assert.equal(result.items[1].observation.evidence[0].sourceUrl, sourceUrl);
  assert.equal(result.items[2].observation, null);
  assert.equal(result.items[2].discount, null);
  assert.equal(result.items[3].discount.reason, 'COMMITMENT_PRICE_NOT_EXACT');
});

test('returns an empty comparison and rejects a response for a different product', async () => {
  const product = {id:'12', offers:new Map()};
  const empty = await fetchContractComparison(async () => ok({productId:'12', items:[], discounts:[]}), product);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.baseline, null);
  await assert.rejects(fetchContractComparison(async () => ok({productId:'13', items:[], discounts:[]}), product), /계약 비교/);
});
