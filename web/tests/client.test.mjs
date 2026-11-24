import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiGet, summarizeCatalog } from '../src/api/client.js';

test('summarizeCatalog counts catalog lists and tolerates missing fields', () => {
  assert.deepEqual(summarizeCatalog({ models: [1, 2], providers: [1], regions: [] }), { models: 2, providers: 1, regions: 0 });
  assert.deepEqual(summarizeCatalog(null), { models: 0, providers: 0, regions: 0 });
});

test('apiGet returns result on success and throws the server message on failure', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ isSuccess: true, result: { ok: 1 } }), { status: 200 });
    assert.deepEqual(await apiGet('/api/v1/catalog'), { ok: 1 });
    globalThis.fetch = async () => new Response(JSON.stringify({ isSuccess: false, code: 'DATA_UNAVAILABLE', message: '데이터 없음' }), { status: 503 });
    await assert.rejects(apiGet('/api/v1/catalog'), error => error.code === 'DATA_UNAVAILABLE' && error.status === 503 && error.message === '데이터 없음');
  } finally {
    globalThis.fetch = original;
  }
});
