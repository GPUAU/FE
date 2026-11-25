import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderBoard, renderQuestion, renderResult, renderSession, startSession, sendAnswer, reportUrl } from '../docker_erd_20261117/app/web/static/cost-agent-ui.mjs';

const board = [
  { key: 'ANALYZE', title: '청구서 분석', status: 'DONE', summary: '총액 대조 일치 · 재분류 1회', details: [] },
  { key: 'MISSING', title: '누락 확인', status: 'WAITING', summary: "'운영·유지보수' 확인 대기", details: ['<b>x</b>'] },
  { key: 'ASSUMPTIONS', title: '가정값 확인', status: 'PENDING', summary: '', details: [] }
];
const question = {
  id: 'q1', step: 'MISSING', title: "'운영·유지보수' 비용이 청구서에 없어요", text: '다른 계약인지 알려 주세요',
  options: [{ value: 'amount', label: '별도 계약 금액 입력', description: '' }, { value: 'exclude', label: '이번엔 제외', description: '' }],
  fields: [{ name: 'amount', label: '금액', type: 'number', required: true, value: null, hint: '', options: [], show_for: ['amount'] }],
  submit_label: '확인'
};

test('board shows status icons, current step and escapes details', () => {
  const html = renderBoard({ step: 'MISSING', board });
  assert.ok(html.includes('✔') && html.includes('⏳'));
  assert.ok(html.includes('aria-current="step"'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
});

test('question with options and fields uses select-then-submit', () => {
  const html = renderQuestion(question);
  assert.ok(html.includes('data-choice="amount"') && html.includes('aria-pressed="true"'));
  assert.ok(html.includes('data-show-for="amount"'));
  assert.ok(!html.includes('<form') && !html.includes('type="submit"'));   // 계산기 form 안이라 중첩 form·submit 금지
  assert.ok(html.includes('data-choice="amount" aria-pressed="true"'));      // 선택 후 입력
  const simple = renderQuestion({ ...question, fields: [] });
  assert.ok(simple.includes('data-choice="amount" data-submit'));            // 선택만 있으면 누르면 바로 답
});

test('result shows KPIs, terms, summary and report link', () => {
  const html = renderResult({ id: 's1', report_ready: true, simulation: { hourlyCost: '2.5', candidatePrice: '3.125' },
    market: { count: 5, position: '시장 중앙값 대비 −10%', min: 3, max: 7 }, terms: [{ years: 3, discount_rate: 0.1, price: 2.8125 }],
    summary: ['요약 <i>'] });
  assert.ok(html.includes('$2.500') && html.includes('$3.125') && html.includes('3년 계약가'));
  assert.ok(html.includes(reportUrl('s1')) && html.includes('요약 &lt;i&gt;'));
});

test('session view shows question, log and LLM disclosure', () => {
  const html = renderSession({ id: 's1', step: 'MISSING', board, question, events: [{ kind: 'think', message: '총액 확인' }],
    draft: { llm: { destination: 'OpenAI', masked: true, sent: '#NUM' } } });
  assert.ok(html.includes('에이전트 진행 기록 (1)') && html.includes('생각') && html.includes('AI에 보낸 내용 보기'));
});

test('API calls go through the /agent proxy and surface errors', async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push([url, init.method, init.body instanceof FormData ? [...init.body.keys()] : JSON.parse(init.body)]); return { ok: true, status: 200, json: async () => ({ id: 's1' }) }; };
  await startSession(new File(['x'], 'c.xlsx'), { modelId: '29', gpuCount: 32 }, ok);
  await sendAnswer('s1', { question_id: 'q1', choice: 'amount', values: { amount: 1 } }, ok);
  assert.deepEqual(calls[0].slice(0, 2), ['/agent/v1/agent/sessions', 'POST']);
  assert.deepEqual(calls[0][2], ['file', 'model_id', 'gpu_count', 'terms']);
  assert.equal(calls[1][0], '/agent/v1/agent/sessions/s1/answer');
  const bad = async () => ({ ok: false, status: 422, json: async () => ({ detail: '금액을 숫자로 입력하세요.' }) });
  await assert.rejects(sendAnswer('s1', {}, bad), /금액을 숫자로/);
});
