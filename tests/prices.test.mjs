import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { latestObservation, freshness, safeUrl } from '../docker_erd_20261117/app/web/static/spring-price-logic.mjs';

test('selects the most recent observation even when it has no price', () => {
  const result = latestObservation([{collectedAt:'2026-11-16T00:00:00Z',effectiveUsdGpuHour:'2'}, {collectedAt:'2026-11-17T00:00:00Z',effectiveUsdGpuHour:null}]);
  assert.equal(result.effectiveUsdGpuHour, null);
});
test('keeps older observations available with their timestamps', () => {
  assert.equal(freshness('2026-11-16T00:00:00Z', Date.parse('2026-11-18T00:00:00Z')), '관측 시각 확인');
  assert.equal(freshness('2026-11-15T23:59:59Z', Date.parse('2026-11-18T00:00:00Z')), '관측 시각 확인');
});
test('rejects unsafe source urls', () => { assert.equal(safeUrl('javascript:alert(1)'), null); assert.equal(safeUrl('https://example.com'), 'https://example.com/'); });
