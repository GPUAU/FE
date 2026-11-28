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
  assert.ok(html.includes('STEP 2 · 누락 확인'));
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
  assert.ok(renderWorkspace(done).includes('모든 단계를 마쳤습니다'));
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
  await assert.rejects(sendAnswer('s1', {}, down), /연결할 수 없어요/);
});

import { renderLive, pendingSession, boardAt, WAIT_HINTS } from '../docker_erd_20261117/app/web/static/cost-agent-ui.mjs';

test('pending session starts with analysis running and others waiting', () => {
  const p = pendingSession('c.xlsx', { model_id: '29' });
  assert.equal(p.board.length, 8);   // 승인 검토 단계 포함
  assert.deepEqual(p.board.map(b => b.status), ['RUNNING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING']);
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

test('completed workspace shows questions and results with activity below and no reading checkpoint', () => {
  const question = renderWorkspace(session);
  assert.ok(question.includes('data-qid="q1"') && question.includes('ca-activity'));
  const result = renderWorkspace({...session, step:'DONE', question:null, simulation:{hourlyCost:2,candidatePrice:3}, terms:[], summary:[]});
  assert.ok(result.includes('class="ca-kpis"') && result.includes('ca-activity'));
  for (const html of [question,result]) {
    assert.ok(!html.includes('data-ca-countdown') && !html.includes('data-ca-continue') && !html.includes('data-ca-review'));
  }
});

// ---------------------------------------------------------------- 2순위: 승인 검토 · 묶음 카드 · 보고서
import { hiddenFields, reportHtmlUrl } from '../docker_erd_20261117/app/web/static/cost-agent-ui.mjs';

test('pending board includes the approval review step between terms and report', () => {
  const keys = pendingSession('a.xlsx', {}).board.map(b => b.key);
  assert.deepEqual(keys.slice(-3), ['TERMS', 'REVIEW', 'REPORT']);
  assert.equal(pendingSession('a.xlsx', {}).board.find(b => b.key === 'REVIEW').title, '승인 검토');
});

test('grouped card: prefixed fields follow their own choice select', () => {
  const fields = [
    { name: 'choice:네트워크', type: 'select', value: 'amount', options: [{ value: 'amount' }, { value: 'included' }] },
    { name: 'amount:네트워크', show_for: ['amount'] },
    { name: 'parent:네트워크', show_for: ['included'] },
    { name: 'finding:NO_FINANCING', type: 'select', value: 'proceed', options: [{ value: 'fix' }, { value: 'proceed' }] },
    { name: 'reason:NO_FINANCING', show_for: ['proceed'] },
  ];
  assert.deepEqual(hiddenFields(fields, { 'choice:네트워크': 'included', 'finding:NO_FINANCING': 'fix' }),
    ['amount:네트워크', 'reason:NO_FINANCING']);
  assert.deepEqual(hiddenFields(fields, {}), ['parent:네트워크']);
});

test('fields-only card: a field shows for the select whose options it names (interest rate)', () => {
  const fields = [
    { name: 'interest_rate_type', type: 'select', value: 'NOT_APPLIED', options: [{ value: 'NOT_APPLIED' }, { value: 'ASSUMED' }, { value: 'ACTUAL_LOAN' }] },
    { name: 'annual_interest_rate', show_for: ['ASSUMED', 'ACTUAL_LOAN'] },
  ];
  assert.deepEqual(hiddenFields(fields, {}), ['annual_interest_rate']);
  assert.deepEqual(hiddenFields(fields, { interest_rate_type: 'ASSUMED' }), []);
});

test('option-button card keeps the old behaviour', () => {
  const fields = [{ name: 'amount', show_for: ['amount'] }, { name: 'parent', show_for: ['included'] }];
  assert.deepEqual(hiddenFields(fields, {}, 'amount'), ['parent']);
});

test('result shows the verdict and opens the one-page report in a new tab', () => {
  const done = { ...session, id: 's1', step: 'DONE', question: null, report_ready: true,
    simulation: { hourlyCost: '2.52', candidatePrice: '3.15' }, assumptions: { target_rate: 0.2 }, market: null, terms: [], summary: [],
    approval: { verdict: '조건부', reasons: ['금융비용(이자)이 원가에 반영되지 않았어요'] } };
  const html = renderResult(done);
  assert.ok(html.includes('권고: 조건부') && html.includes('금융비용(이자)'));
  assert.ok(html.includes(`href="${reportHtmlUrl('s1')}"`) && html.includes('target="_blank"'));
  assert.ok(reportHtmlUrl('s1').endsWith('/agent/sessions/s1/report.html'));
});

test('upload accepts PDF bills as well as Excel and CSV', () => {
  const html = renderStart([]);
  assert.ok(html.includes('accept=".xlsx,.csv,.pdf"'));
  assert.ok(html.includes('PDF'));
});

// ---------------------------------------------------------------- 여러 부서 문서 · 기준표 · 천천히 보여 주는 확인할 점
import { renderSheet, renderIssues, eventDelay, fileLabel } from '../docker_erd_20261117/app/web/static/cost-agent-ui.mjs';

test('upload sends multiple files as files[]', async () => {
  let sent = null;
  const ok = async (url, init) => { sent = init.body; return { ok: true, json: async () => ({ id: 's' }) }; };
  await startSession([new File(['a'], '01.pdf'), new File(['b'], '03.pdf')], {}, ok);
  assert.deepEqual(sent.getAll('files').map(f => f.name), ['01.pdf', '03.pdf']);
  assert.equal(sent.get('file'), null);
  await startSession([new File(['a'], 'c.xlsx')], {}, ok);  // 하나면 예전처럼 file
  assert.equal(sent.get('file').name, 'c.xlsx');
  assert.equal(fileLabel([{ name: 'a.pdf' }, { name: 'b.pdf' }, { name: 'c.pdf' }]), 'a.pdf 외 2개');
});

test('start screen allows several files', () => {
  assert.ok(renderStart([]).includes('multiple'));
});

const sheet = { cells: {
  acquisition: { key: 'acquisition', value: 1009000000, unit: '원', currency: 'KRW', status: 'filled', grade: '사내 문서 · 교차 확인 2건',
    sources: [{ doc: '01_구매팀.pdf', page: 1, row: 10 }, { doc: '04_재무회계팀.pdf', page: 1, row: 6 }], note: '', owner: '구매팀·재무회계팀' },
  electricity: { key: 'electricity', value: null, unit: '', status: 'conflict', sources: [], note: '', owner: '시설운영팀',
    candidates: [{ doc: '03', text: '57,600,000원' }, { doc: '09', text: '60,000,000원' }] },
  utilization: { key: 'utilization', value: 0.7, unit: '%', status: 'filled', sources: [{ doc: '06_영업팀.pdf', row: 9 }], note: '문장 교차 확인 일치' },
  memory: { key: 'memory', value: null, status: 'empty', sources: [] }
}, notices: ['x.pdf: 문서 종류를 확인해 주세요'] };

test('cost sheet table shows value, sources, conflicts and notices', () => {
  const html = renderSheet({ sheet, sheet_answers: {} });
  assert.ok(html.includes('서버·GPU 취득비') && html.includes('10.09억 원') && html.includes('01_구매팀.pdf'));
  assert.ok(html.includes('교차 확인 2건') && html.includes('70%'));
  assert.ok(html.includes('충돌') && html.includes('57,600,000원') && html.includes('60,000,000원'));
  assert.ok(html.includes('문서 종류를 확인해 주세요'));
  assert.ok(!html.includes('메모리'));  // 빈 비핵심 칸은 표에 넣지 않음
  assert.equal(renderSheet({}), '');
});

test('warnings and questions are held longer than routine lines', () => {
  assert.ok(eventDelay({ kind: 'warn' }) >= 1500 && eventDelay({ kind: 'warn' }) > 2 * eventDelay({ kind: 'answer' }));
  assert.ok(eventDelay({ kind: 'ask' }) > eventDelay({ kind: 'think' }));
});

test('issues found in a step stay pinned above the next card', () => {
  const warns = [{ step: 'ANALYZE', kind: 'warn', message: '총액이 맞지 않아요' }, { step: 'MISSING', kind: 'ask', message: '전력 칸이 비었어요' },
    { step: 'ANALYZE', kind: 'think', message: '판단' }];
  const html = renderIssues(warns);
  assert.ok(html.includes('확인할 점 2개') && html.includes('총액이 맞지 않아요') && html.includes('전력 칸이 비었어요'));
  assert.ok(!html.includes('판단'));
  assert.equal(renderIssues([{ kind: 'result', message: 'ok' }]), '');
  const ws = renderWorkspace({ ...session, sheet }, { issues: warns });
  assert.ok(ws.indexOf('확인할 점 2개') < ws.indexOf('ca-question'));
  assert.ok(ws.includes('원가 기준표'));
});

// ---------------------------------------------------------------- 최종 리뷰: 확인할 점은 끝·중단 화면에도, 질문만으로는 늘지 않음
import { isIssue, followFeed } from '../docker_erd_20261117/app/web/static/cost-agent-ui.mjs';

test('only warnings and missing-value questions count as issues', () => {
  assert.equal(isIssue({ kind: 'warn', step: 'ANALYZE' }), true);
  assert.equal(isIssue({ kind: 'ask', step: 'MISSING' }), true);
  assert.equal(isIssue({ kind: 'ask', step: 'ASSUMPTIONS' }), false);
  assert.equal(renderIssues([{ kind: 'ask', step: 'TERMS', message: '할인율' }]), '');
});

test('issues stay pinned on the result and on a stopped run', () => {
  const warns = [{ step: 'SIMULATE', kind: 'warn', message: '원가 계산 실패' }];
  const done = { ...session, step: 'DONE', question: null, simulation: { hourlyCost: 2, candidatePrice: 2.5 }, report_ready: true };
  assert.ok(renderWorkspace(done, { issues: warns }).includes('원가 계산 실패'));
  const stopped = { ...session, step: 'DONE', question: null, simulation: null };
  const html = renderWorkspace(stopped, { issues: warns });
  assert.ok(html.includes('원가 계산 실패') && html.indexOf('원가 계산 실패') < html.indexOf('에이전트가 멈췄습니다'));
});

test('live feed stops following once an issue line is shown', () => {
  assert.equal(followFeed([{ kind: 'think' }, { kind: 'result' }]), true);
  assert.equal(followFeed([{ kind: 'warn', step: 'ANALYZE' }, { kind: 'result' }]), false);
});

// ---------------------------------------------------------------- 사용자가 이해할 수 있는 오류 문구
import { errorMessage } from '../docker_erd_20261117/app/web/static/bill-import.mjs';
import { checkUpload } from '../docker_erd_20261117/app/web/static/cost-agent-ui.mjs';

test('server message in BE format is shown as is', () => {
  assert.equal(errorMessage(403, { isSuccess: false, code: 'FORBIDDEN', message: '권한이 없습니다.' }), '권한이 없습니다.');
  assert.equal(errorMessage(422, { detail: '선택지에서 골라 주세요.' }), '선택지에서 골라 주세요.');  // 예전 형식
  assert.equal(errorMessage(422, { detail: { message: '오류를 먼저 고쳐야 계산할 수 있습니다.' } }), '오류를 먼저 고쳐야 계산할 수 있습니다.');
});

test('proxy errors without JSON get a friendly message, never a bare status code', () => {
  const m413 = errorMessage(413, null);
  assert.ok(m413.includes('파일이 너무 커요') && m413.includes('20MB') && !m413.includes('413'));
  assert.equal(errorMessage(401, null), '로그인이 필요합니다. 다시 로그인해 주세요.');
  assert.equal(errorMessage(403, null), '권한이 없습니다.');
  assert.ok(errorMessage(404, null).includes('찾을 수 없'));
  assert.ok(errorMessage(504, null).includes('잠시 후'));
  assert.ok(errorMessage(500, null).includes('일시적인 오류'));
  assert.ok(!/\(\d{3}\)/.test(errorMessage(418, null)));
});

test('API call turns a proxy 413 page into the friendly message', async () => {
  const html413 = async () => ({ ok: false, status: 413, json: async () => { throw new Error('html'); } });
  await assert.rejects(startSession(new File(['x'], 'a.pdf'), {}, html413), /파일이 너무 커요/);
  const offline = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(sendAnswer('s', {}, offline), /서버에 연결할 수 없어요/);
});

test('upload is checked before sending: per-file size, total size, file count', () => {
  const mb = n => ({ name: `f${n}.pdf`, size: n * 1024 * 1024 });
  assert.equal(checkUpload([mb(1), mb(2)]), null);
  assert.ok(checkUpload([{ name: '큰파일.pdf', size: 6 * 1024 * 1024 }]).includes("'큰파일.pdf' 파일이 너무 커요"));
  assert.ok(checkUpload([mb(5), mb(5), mb(5), mb(5), mb(4)]).includes('합쳐 최대 20MB'));
  assert.ok(checkUpload(Array.from({ length: 21 }, () => mb(0.1))).includes('최대 20개'));
  assert.ok(checkUpload([{ name: 'a.hwp', size: 10 }]).includes('xlsx, csv, pdf'));
});
