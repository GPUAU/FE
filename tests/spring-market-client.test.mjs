import test from 'node:test';
import assert from 'node:assert/strict';
import * as market from '../docker_erd_20261117/app/web/static/spring-market-client.mjs';

test('offer pagination keeps the model, term, and stale-data scope for each cursor', async () => {
  const calls = [];
  const result = await market.fetchMarketOffers(async path => {
    const url = new URL(path, 'https://test.invalid');
    calls.push(url);
    const cursor = url.searchParams.get('cursor');
    return {isSuccess: true, result: {items: [{offerId: cursor ? '92' : '73'}], nextCursor: cursor ? null : 'next+='}};
  }, {modelId: '9', ...market.marketTerm('1_YEAR'), includeStale: true});
  assert.deepEqual(result.map(row => row.offerId), ['73', '92']);
  assert.deepEqual(calls.map(url => Object.fromEntries(url.searchParams)), [
    {modelId: '9', contractType: 'COMMITMENT', commitmentMonths: '12', includeStale: 'true', limit: '100'},
    {modelId: '9', contractType: 'COMMITMENT', commitmentMonths: '12', includeStale: 'true', limit: '100', cursor: 'next+='},
  ]);
});

test('last observed price is retained as a reference with its exact normalization, even after a no-price check', () => {
  const row = market.mapMarketOffer({
    offerId: '73', providerId: '6', providerName: 'Azure', providerType: 'GENERAL_CLOUD', modelId: '9',
    contract: {type: 'COMMITMENT', months: 36, paymentOption: 'ALL_UPFRONT'},
    lastSuccessfulObservation: {
      observationId: '534', effective: {status: 'OK', normalizationId: '239', amount: '0'},
      nominal: {status: 'UNAVAILABLE', normalizationId: '239', amount: null},
      components: [{type: 'UPFRONT_FEE', amount: '7500.00', currency: 'USD', timeUnit: 'TERM'}],
    },
    latestDisclosure: {status: 'NOT_DISCLOSED', evidence: [{sourceName:'공개 상태 확인', sourceUrl:'https://example.test/status'}]},
    freshness: {status: 'CURRENT'},
    comparison: {eligibleForAggregate: false, excludedReasons: ['notFoundOffers']},
  });
  assert.equal(row.term, '3_YEAR');
  assert.equal(row.price, '0');
  assert.equal(row.observation, 'spring-534-239');
  assert.equal(row.disclosure, 'NOT_DISCLOSED');
  assert.equal(row.hourlyComponent, null);
  assert.equal(row.excludedReasons[0], 'notFoundOffers');
  assert.equal(row.source, undefined);
  assert.equal(row.sourceName, undefined);
  assert.equal(market.getPairPrice(row), null);
});

test('pair comparison prefers recently confirmed prices and keeps older selections as references', () => {
  const unavailable = {id:'1', price:'1', freshness:'CURRENT', excludedReasons:['notFoundOffers']};
  const current = {id:'2', price:'5', freshness:'CURRENT', excludedReasons:[]};
  const stale = {id:'3', price:'2', freshness:'STALE', excludedReasons:['staleOffers']};
  const approximate = {id:'4', price:'3', freshness:'CURRENT', excludedReasons:['nonExactOffers']};
  assert.equal(market.pickPairOffer([unavailable, stale, approximate, current]), current);
  assert.equal(market.pickPairOffer([unavailable, current], '1'), unavailable);
  assert.equal(market.pairPriceGap(unavailable, current), null);
  assert.equal(market.getPairPrice(stale), null);
  assert.equal(market.getPairPrice(approximate), null);
});

test('a confirmed zero is a real comparison value and never creates an infinite percentage', () => {
  const five = {price:'5', freshness:'CURRENT', excludedReasons:[]};
  const zero = {price:'0', freshness:'CURRENT', excludedReasons:[]};
  assert.deepEqual(market.pairPriceGap(five, zero), {amount:-5, percent:-100});
  assert.deepEqual(market.pairPriceGap(zero, five), {amount:5, percent:null});
});

test('recent sorting places observations with missing timestamps last', () => {
  const rows = [{id:'0'}, {id:'1', collected:'2026-11-10T00:00:00Z'}, {id:'2', collected:'2026-11-20T00:00:00Z'}];
  assert.deepEqual(rows.sort(market.compareMarketObservationTime).map(row => row.id), ['2','1','0']);
});

test('server summary uses the selected scope and preserves independent groups and zero prices', async () => {
  const groups = [
    {groupKey: {regionCode: 'us-east-1', gpuCount: 8}, minimum: '0', median: '6', maximum: '12', sampleCounts: {providerCount: 2}},
    {groupKey: {regionCode: 'us-east-1', gpuCount: 4}, minimum: '1', median: '3', maximum: '5', sampleCounts: {providerCount: 1}},
  ];
  const result = await market.fetchMarketSummary(async path => {
    assert.equal(path, '/api/v1/market/summaries?modelId=9&contractType=ON_DEMAND&providerIds=6&regionCode=us-east-1');
    return {isSuccess: true, result: {groups, excludedSummary: {staleOffers: 2}}};
  }, {modelId: '9', ...market.marketTerm('ON_DEMAND'), providerIds: '6', regionCode: 'us-east-1'});
  assert.deepEqual(result.groups.map(group => group.minimum), ['0', '1']);
  assert.notEqual(market.marketGroupId(groups[0].groupKey), market.marketGroupId(groups[1].groupKey));
  assert.equal(market.marketGroupId({gpuCount: 8, regionCode: 'us-east-1'}), market.marketGroupId(groups[0].groupKey));
});
