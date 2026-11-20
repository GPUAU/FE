import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { simulateIrr, askPrice, deleteAgentSession, AgentSessionExpiredError, sourceLink } =
  require('../docker_erd_20261117/app/web/static/spring-analysis.js');
const input = { initial: 100000, years: 1, opex: 31400, gpu: 1, util: 1, salvage: 10000,
  target: .1, price: 15 };
const success = result => new Response(JSON.stringify({ isSuccess: true, result }), { status: 200 });

test('IRR submits annual cash operating cost and keeps the exact Spring result', async () => {
  const data = { resultStatus: 'OK', candidateResults: [{ irr: '0.100000000000',
    cashFlows: [{ year: 0, amount: '-100000' }, { year: 1, amount: '110000' }] }],
    targetPrice: { amount: '15.000000000000', status: 'OK' } };
  const result = await simulateIrr(input, '42', async (url, options) => {
    assert.equal(url, '/api/v1/irr-simulations');
    const request = JSON.parse(options.body);
    assert.equal(request.costInput.modelId, '42');
    assert.deepEqual(request.costInput.items, [
      { itemType: 'ACQUISITION', status: 'USER_INPUT', amount: '100000', currency: 'USD', period: 'ONE_TIME' },
      { itemType: 'OPERATIONS', status: 'USER_INPUT', amount: '31400', currency: 'USD', period: 'YEAR' }
    ]);
    assert.equal(request.costInput.assumptions.utilization, '1');
    assert.equal(request.targetIrr, '0.1');
    assert.deepEqual(request.candidatePrices, ['15']);
    assert.equal(request.marketConstraint, 'NONE');
    return success(data);
  });
  assert.deepEqual(result, data);
});

test('contains no fallback result when the IRR endpoint is missing or the input is incomplete', async () => {
  await assert.rejects(simulateIrr(input, '42', async () => new Response('', { status: 403 })),
    /API.*IRR|IRR.*API/);
  await assert.rejects(simulateIrr({ ...input, opex: null }, '42', () => assert.fail('called Spring')),
    /입력/);
});

test('Agent starts a session without an ID and preserves price unavailable', async () => {
  const reply = await askPrice(' VR200 온디맨드 가격 ', async (url, options) => {
    assert.equal(url, '/api/v1/agent-messages');
    assert.deepEqual(JSON.parse(options.body), { message: 'VR200 온디맨드 가격' });
    return success({ sessionId: 'conversation-1', status: 'NO_DATA',
      answer: '조건에 맞는 공개 가격이 없습니다.', results: [] });
  });
  assert.equal(reply.sessionId, 'conversation-1');
  assert.equal(reply.status, 'NO_DATA');
  assert.deepEqual(reply.results, []);
});

test('Agent sends the previous session ID with a follow-up', async () => {
  const reply = { sessionId: 'conversation-1', status: 'ANSWERED', retainedConditions: ['countryCode'] };
  let request;
  const result = await askPrice(' B300 ', async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return success(reply);
  }, 'conversation-1');
  assert.deepEqual(request, {
    url: '/api/v1/agent-messages',
    body: { message: 'B300', sessionId: 'conversation-1' }
  });
  assert.deepEqual(result, reply);
});

test('Agent reports a missing session without replaying the follow-up', async () => {
  let calls = 0;
  const missing = async () => {
    calls++;
    return new Response(null, { status: 404 });
  };
  await assert.rejects(askPrice('B300', missing, 'conversation-1'), error => {
    assert.equal(typeof AgentSessionExpiredError, 'function');
    assert.ok(error instanceof AgentSessionExpiredError);
    assert.match(error.message, /대화.*종료/);
    return true;
  });
  assert.equal(calls, 1);
  await assert.rejects(askPrice('B300', missing), /공개가격 조회 API/);
});

test('Agent deletes a session and accepts an empty 204 response', async () => {
  await deleteAgentSession('conversation-1', async (url, options) => {
    assert.equal(url, '/api/v1/agent-sessions/conversation-1');
    assert.equal(options.method, 'DELETE');
    assert.equal(options.body, undefined);
    return new Response(null, { status: 204 });
  });
});

test('Agent surfaces a failed reset so the existing session can be kept', async () => {
  await assert.rejects(deleteAgentSession('conversation-1',
    async () => new Response(null, { status: 503 })), /새 대화.*다시 시도/);
});

test('allows valid HTTPS evidence links and rejects unsupported schemes', () => {
  assert.equal(sourceLink('https://example.com/pricing'), 'https://example.com/pricing');
  assert.equal(sourceLink('javascript:void(0)'), null);
  assert.equal(sourceLink('https://user:pass@example.com/path'), null);
});

test('IRR applies the selected market cap with the full public comparison scope', async () => {
  const filters = { countryCode: 'KR', regionCode: 'ap-northeast-2', gpuCount: 1 };
  const result = await simulateIrr(input, '42', async (url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.marketConstraint, 'MEDIAN');
    assert.deepEqual(request.marketFilters, filters);
    return success({ resultStatus: 'NO_FEASIBLE_PRICE', candidateResults: [],
      marketReference: { amount: '10' }, targetPrice: { amount: null } });
  }, { constraint: 'MEDIAN', filters });
  assert.equal(result.resultStatus, 'NO_FEASIBLE_PRICE');
  assert.equal(result.targetPrice.amount, null);
  await assert.rejects(simulateIrr(input, '42', () => assert.fail('called Spring'), {
    constraint: 'MEDIAN'
  }), /비교 조건/);
});

test('cost validation identifies the affected Korean fields without including input values', async () => {
  const { requestEnvelope } = require('../docker_erd_20261117/app/web/static/spring-analysis.js');
  const validation = new Response(JSON.stringify({ isSuccess: false, code: 'VALIDATION_ERROR',
    errors: [{ field: 'assumptions.utilization', reason: '입력값이 유효하지 않습니다.' },
      { field: 'items[0].amount', reason: '금액·통화·기간을 입력하세요.' }] }), { status: 422 });
  const body = { items: [{ itemType: 'ACQUISITION', amount: '135790' }] };
  await assert.rejects(requestEnvelope('/api/v1/cost-simulations', body, async () => validation), err => {
    assert.match(err.message, /가동률.*서버·GPU.*금액/);
    assert.doesNotMatch(err.message, /135790|assumptions/);
    return true;
  });
});

test('public evidence is matched to the observation and deduplicated by evidence ID', () => {
  const { sourcesForResult } = require('../docker_erd_20261117/app/web/static/spring-analysis.js');
  const sources = [
    { evidenceId: '10', sourceName: 'AWS', sourceUrl: 'https://example.org/seoul' },
    { evidenceId: '20', sourceName: 'AWS', sourceUrl: 'https://example.org/ohio' },
  ];
  assert.deepEqual(sourcesForResult({ evidenceIds: ['20', '20', '30'] }, sources), [sources[1]]);
  assert.deepEqual(sourcesForResult({ evidenceIds: [] }, sources), []);
});
