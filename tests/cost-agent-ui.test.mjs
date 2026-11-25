import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderStart, renderStepper, renderQuestion, renderResult, renderSummary, renderWorkspace, renderMarket,
  progressOf, money, startSession, sendAnswer, reportUrl } from '../docker_erd_20261117/app/web/static/cost-agent-ui.mjs';

const board = [
  { key: 'ANALYZE', title: '청구서 분석', status: 'DONE', summary: '총액 대조 일치', details: [] },
  { key: 'MISSING', title: '누락 확인', status: 'WAITING', summary: "'운영·유지보수' 확인 대기", details: [] },
  { key: 'ASSUMPTIONS', title: '가정값 확인', status: 'PENDING', summary: '', details: [] },
  { key: 'SIMULATE', title: '원가 계산', status: 'PENDING', summary: '', details: [] },
  { key: 'MARKET', title: '시장 비교', status: 'PENDING', summary: '', details: [] },
  { key: 'TERMS', title: '기간별 가격', status: 'PENDING', summary: '', details: [] },
  { key: 'REPORT', title: '견적 근거서', status: 'PENDING', summary: '', details: [] }
];
const question = {
  id: 'q1', step: 'MISSING', title: "'운영·유지보수' 비용이 청구서에 없어요", text: '다른 계약인지 알려 주세요',
  options: [{ value: 'amount', label: '별도 계약 금액 입력', description: '' }, { value: 'exclude', label: '이번엔 제외', description: '' }],
  fields: [{ name: 'amount', label: '금액', type: 'number', required: true, value: null, hint: '', options: [], show_for: ['amount'] }],
  submit_label: '확인'
};
const session = {
  id: 's1', step: 'MISSING', board, question, goal: { model_id: '29', gpu_count: 32, terms_years: [3, 5] }, events: [{ kind: 'think', message: '총액 확인' }],
  draft: { file_name: 'c.xlsx', mapper: 'llm', currency: 'KRW', period: 'MONTH', reconciliation: { matched: true },
    cost_items: [{ item_type: 'RENT', status: 'USER_INPUT', amount: 108000000, currency: 'KRW', period: 'YEAR' },
      { item_type: 'RACK_FACILITY', status: 'INCLUDED_IN_OTHER', included_in: 'RENT' }],
    llm: { destination: 'OpenAI', masked: true, sent: '#NUM <x>' } },
  assumptions: {}, final_items: []
};

test('progress counts finished steps and finds the current step', () => {
  const p = progressOf(session);
  assert.equal(p.done, 1); assert.equal(p.total, 7); assert.equal(p.pct, 14); assert.equal(p.current.key, 'MISSING');
  assert.equal(progressOf({ ...session, step: 'DONE', board: board.map(b => ({ ...b, status: 'DONE' })) }).pct, 100);
});

test('start screen has a drop zone, optional GPU inputs and disabled start until a file is chosen', () => {
  const html = renderStart([{ id: '29', name: 'H200' }]);
  assert.ok(html.includes('data-ca-drop') && html.includes('data-ca-start disabled') && html.includes('H200'));
  assert.ok(html.includes('항목명만 AI에 보냅니다'));
});

test('stepper shows 7 steps, progress bar and the current step state', () => {
  const html = renderStepper(session);
  assert.equal((html.match(/<li /g) || []).length, 7);
  assert.ok(html.includes('aria-valuenow="14"') && html.includes('1/7 단계 · 14%'));
  assert.ok(html.includes('aria-current="step"') && html.includes('확인 필요'));
});

test('question card: radio options with conditional fields, no form or submit inputs', () => {
  const html = renderQuestion(question, session);
  assert.ok(html.includes('2단계 · 누락 확인') && html.includes('확인 필요'));
  assert.ok(html.includes('class="ca-opt" role="radio" data-choice="amount" aria-pressed="true"'));
  assert.ok(html.includes('data-show-for="amount"'));
  assert.ok(!html.includes('<form') && !html.includes('type="submit"'));
  const simple = renderQuestion({ ...question, fields: [] }, session);
  assert.ok(simple.includes('data-choice="amount" data-submit'));
});

test('summary panel shows confirmed facts and escapes the LLM disclosure', () => {
  const html = renderSummary(session);
  assert.ok(html.includes('AI 분류') && html.includes('1.08억 원') && html.includes('임차료·공간에 포함'));
  assert.ok(html.includes('#NUM &lt;x&gt;'));
});

test('result shows KPIs, market position marker, terms and actions', () => {
  const done = { ...session, step: 'DONE', question: null, report_ready: true, simulation: { hourlyCost: '2.52', candidatePrice: '6.05' },
    assumptions: { target_rate: 0.58 }, market: { count: 22, providers: 4, min: 3.99, median: 6.05, max: 10, candidate: 6.05, position: '사업자 중앙값 수준' },
    terms: [{ years: 3, discount_rate: 0.15, price: 5.14 }], summary: ['요약'] };
  const html = renderResult(done);
  assert.ok(html.includes('제안가 $6.05') && html.includes('58%') && html.includes('3년 계약가'));
  assert.ok(html.includes(reportUrl('s1')) && html.includes('data-ca-send'));
  assert.ok(renderMarket(done.market).includes('class="ca-me"'));
  assert.ok(renderWorkspace(done).includes('분석 완료'));
});

test('money formatting for KRW and USD', () => {
  assert.equal(money(108000000, 'KRW'), '1.08억 원');
  assert.equal(money(36000000, 'KRW'), '3,600만 원');
  assert.equal(money(216000, 'USD'), '$216,000');
});

test('API calls go through the /agent proxy and surface errors', async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push([url, init.method]); return { ok: true, status: 200, json: async () => ({ id: 's1' }) }; };
  await startSession(new File(['x'], 'c.xlsx'), { modelId: '29', gpuCount: 32 }, ok);
  await sendAnswer('s1', { question_id: 'q1' }, ok);
  assert.deepEqual(calls, [['/agent/v1/agent/sessions', 'POST'], ['/agent/v1/agent/sessions/s1/answer', 'POST']]);
  const down = async () => ({ ok: false, status: 502, json: async () => { throw new Error('x'); } });
  await assert.rejects(sendAnswer('s1', {}, down), /연결할 수 없습니다/);
});

import { renderLive, pendingSession, boardAt, WAIT_HINTS } from '../docker_erd_20261117/app/web/static/cost-agent-ui.mjs';

test('pending session starts with analysis running and others waiting', () => {
  const p = pendingSession('c.xlsx', { model_id: '29' });
  assert.equal(p.board.length, 7);
  assert.deepEqual(p.board.map(b => b.status), ['RUNNING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING']);
  assert.equal(p.draft.file_name, 'c.xlsx');
});

test('replay board fills steps in order as events arrive', () => {
  const next = { board: board.map((b, i) => ({ ...b, status: i < 3 ? 'DONE' : i === 3 ? 'WAITING' : 'PENDING', summary: i < 3 ? `s${i}` : '' })) };
  const start = pendingSession('c.xlsx', {}).board;
  const b1 = boardAt(start, next, { step: 'MISSING', kind: 'think' });
  assert.equal(b1[0].status, 'DONE'); assert.equal(b1[1].status, 'RUNNING'); assert.equal(b1[2].status, 'PENDING');
  const b2 = boardAt(b1, next, { step: 'SIMULATE', kind: 'tool' });
  assert.deepEqual(b2.slice(0, 4).map(b => b.status), ['DONE', 'DONE', 'DONE', 'RUNNING']);
  assert.equal(b2[2].summary, 's2');
});

test('live card shows the activity feed and rotating hint while waiting', () => {
  const s = { ...pendingSession('c.xlsx', {}), step: 'ANALYZE' };
  const waiting = renderLive(s, { waiting: true, hint: WAIT_HINTS.ANALYZE[1] });
  assert.ok(waiting.includes('에이전트 작업 중') && waiting.includes('ca-live-hint') && waiting.includes('AI에 항목 분류'));
  const feed = renderLive(s, { feed: [{ kind: 'tool', message: '분류 <b>' }, { kind: 'result', message: '완료' }] });
  assert.ok(feed.includes('&lt;b&gt;') && feed.includes('aria-current="true"'));
  assert.ok(!feed.includes('ca-live-hint'));
});

import { shortSummary, fmtElapsed } from '../docker_erd_20261117/app/web/static/cost-agent-ui.mjs';

test('step summaries stay on one line: long text keeps only its first phrase, full text in the tooltip', () => {
  assert.equal(shortSummary('B300 8장 · 마진 20%'), 'B300 8장 · 마진 20%');
  assert.equal(shortSummary('사업자 중앙값 대비 -38% · 사업자 5곳 중 1곳보다 비쌈'), '사업자 중앙값 대비 -38%');
  const html = renderStepper({ ...session, board: session.board.map((b, i) => i === 0 ? { ...b, summary: '사업자 중앙값 대비 -38% · 사업자 5곳 중 1곳보다 비쌈' } : b) });
  assert.ok(html.includes('title="사업자 중앙값 대비 -38% · 사업자 5곳 중 1곳보다 비쌈">사업자 중앙값 대비 -38%</span>'));
  assert.ok(html.includes('class="ca-ic ca-ic-check"') && html.includes('class="ca-line"'));
});

test('elapsed agent time is formatted in seconds and minutes', () => {
  assert.equal(fmtElapsed(12400), '12초');
  assert.equal(fmtElapsed(65000), '1분 05초');
});
