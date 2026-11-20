import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changeScope, fetchChangePage, observationRef,
} from '../docker_erd_20261117/app/web/static/spring-changes.mjs';

const catalog = { models: [{ id: '4', name: 'B300' }], providers: [{ id: '3', name: 'AWS' }] };

test('uses catalog IDs and sends the selected provider, region, period and contract type', async () => {
  const scope = changeScope(catalog, {
    model: 'B300', provider: 'AWS', region: 'ap-northeast-2', term: 'SPOT', period: '90',
  }, Date.parse('2026-11-20T00:00:00Z'));
  const seen = [];
  await fetchChangePage(async path => {
    seen.push(new URL(path, 'http://localhost'));
    return { isSuccess: true, result: { items: [], nextCursor: null } };
  }, scope, 'cursor-2');
  assert.equal(seen[0].pathname, '/api/v1/market/changes');
  assert.deepEqual(Object.fromEntries(seen[0].searchParams), {
    modelId: '4', from: '2026-08-22T00:00:00.000Z', to: '2026-11-20T00:00:00.000Z',
    providerIds: '3', regionCode: 'ap-northeast-2', contractType: 'SPOT',
    includeKrwDecomposition: 'true', limit: '20', cursor: 'cursor-2',
  });
});

test('does not broaden to every provider when the selected provider is unresolved', () => {
  assert.throws(() => changeScope(catalog, { model: 'B300', provider: 'Unknown', period: 'ALL' }),
    /사업자/);
  assert.equal(changeScope(catalog, { model: 'B300', term: '1_YEAR', period: 'ALL' }).contractType,
    'COMMITMENT');
});

test('distinguishes an empty page from invalid API data and preserves evidence IDs', async () => {
  const scope = changeScope(catalog, { model: 'B300' });
  await assert.rejects(fetchChangePage(async () => ({ isSuccess: true, result: {} }), scope),
    /응답/);
  assert.equal(observationRef('107', '409'), 'spring-107-409');
  assert.equal(observationRef('107', null), 'spring-107-none');
  assert.equal(observationRef('bad-id', '409'), null);
});
