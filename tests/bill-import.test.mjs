import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCostForm, uploadBill, correctBill, renderDraft, AGENT_BASE } from '../docker_erd_20261117/app/web/static/bill-import.mjs';
import { costPayload } from '../docker_erd_20261117/app/web/static/spring-cost.mjs';

const draftA = {
  id: 'abc', file_name: 'a.xlsx', mapper: 'llm', currency: 'KRW',
  reconciliation: { matched: true, basis: '원가 항목 합계 + 부가세 = 청구 총액', difference: 0 },
  lines: [
    { ref: '청구서!5', label: '상면 사용료 <script>', role: 'COST', item_type: 'RACK_FACILITY', amount: 4800000, confidence: 0.95, included_items: [] },
    { ref: '청구서!11', label: '합계', role: 'TOTAL', item_type: null, amount: 15712400, confidence: 1, included_items: [] }
  ],
  issues: [{ level: 'INFO', code: 'MONTH_TO_YEAR', message: '월 → 연' }],
  cost_items: [
    { item_type: 'RACK_FACILITY', status: 'USER_INPUT', amount: 57600000, currency: 'KRW', period: 'YEAR' },
    { item_type: 'ELECTRICITY', status: 'USER_INPUT', amount: 62208000, currency: 'KRW', period: 'YEAR' },
    { item_type: 'NETWORK_STORAGE', status: 'USER_INPUT', amount: 30000000, currency: 'KRW', period: 'YEAR' },
    { item_type: 'OPERATIONS', status: 'USER_INPUT', amount: 21600000, currency: 'KRW', period: 'YEAR' },
    { item_type: 'OTHER', status: 'USER_INPUT', amount: 1000000, currency: 'KRW', period: 'YEAR' },
    { item_type: 'RENT', status: 'INCLUDED_IN_OTHER', included_in: 'RACK_FACILITY' },
    { item_type: 'ACQUISITION', status: 'USER_INPUT', amount: 200000, currency: 'KRW', period: 'ONE_TIME' }
  ]
};

test('maps agent cost items to calculator rows without touching server acquisition', () => {
  const m = toCostForm(draftA);
  assert.deepEqual(m.rows.rack, { state: 'user', amount: 57600000, currency: 'KRW', period: 'year', types: ['RACK_FACILITY'] });
  assert.deepEqual(m.rows.rent, { state: 'included', includedIn: 'rack' });
  assert.equal(m.rows.ops.amount, 22600000);           // 운영 + 기타
  assert.equal(m.rows.server, undefined);
  assert.deepEqual(m.electricity, { mode: 'amount', amount: 62208000, currency: 'KRW' });
  assert.ok(m.notes.some(n => n.includes('1회성 비용')));
  assert.ok(m.notes.some(n => n.includes('운영·유지보수에 더했습니다')));
});

test('bundled electricity becomes included in the owning row', () => {
  const m = toCostForm({ cost_items: [
    { item_type: 'RENT', status: 'USER_INPUT', amount: 222000, currency: 'USD', period: 'YEAR' },
    { item_type: 'ELECTRICITY', status: 'INCLUDED_IN_OTHER', included_in: 'RENT' },
    { item_type: 'RACK_FACILITY', status: 'INCLUDED_IN_OTHER', included_in: 'RENT' }
  ]});
  assert.deepEqual(m.electricity, { mode: 'included', includedIn: 'rent' });
  assert.deepEqual(m.rows.rack, { state: 'included', includedIn: 'rent' });
});

test('electricity amount mode sends a yearly ELECTRICITY item to Spring', () => {
  const p = costPayload({ modelId: '4', gpu: 64, years: 5, util: .7, rate: null, fx: 1400, margin: .2, marginType: 'profit',
    items: [{ id: 'server', state: 'user', period: 'once', amount: '2400000', currency: 'USD' }],
    electricity: { mode: 'amount', amount: 62208000, currency: 'KRW' } });
  assert.deepEqual(p.items.find(i => i.itemType === 'ELECTRICITY'),
    { itemType: 'ELECTRICITY', status: 'USER_INPUT', amount: '62208000', currency: 'KRW', period: 'YEAR' });
  assert.equal(p.electricity, null);
  assert.throws(() => costPayload({ modelId: '4', gpu: 1, items: [{ id: 'server', state: 'user', period: 'once', amount: '1', currency: 'USD' }],
    electricity: { mode: 'amount', amount: null } }), /전기료 연 금액/);
});

test('upload and correction call the agent through the /agent proxy', async () => {
  const calls = [];
  const fake = async (url, init) => { calls.push([url, init.method]); return { ok: true, status: 200, json: async () => draftA }; };
  await uploadBill(new Blob(['x'], { type: 'text/csv' }), fake).catch(() => {});
  await uploadBill(new File(['x'], 'a.csv'), fake);
  await correctBill('abc', [{ ref: '청구서!5', item_type: 'OPERATIONS' }], fake);
  assert.deepEqual(calls.slice(-2), [[`${AGENT_BASE}/bills`, 'POST'], [`${AGENT_BASE}/bills/abc/lines`, 'PUT']]);
  const down = async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } });
  await assert.rejects(uploadBill(new File(['x'], 'a.csv'), down), /원가 에이전트 서버에 연결할 수 없어요/);
});

test('rendered review escapes file content', () => {
  const html = renderDraft(draftA);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('총액 대조 일치'));
});

import { findMissing } from '../docker_erd_20261117/app/web/static/bill-import.mjs';

const filled = {
  rows: { server: { state: 'user', amount: '1500000' }, rent: { state: 'user', amount: '108000000', currency: 'KRW' },
    rack: { state: 'included' }, network: { state: 'user', amount: '1' }, ops: { state: 'missing', amount: '' } },
  fields: { v02CostModel: '29', v02Gpu: '32', v02Util: '70', v02Rate: '8', v02Margin: '20', v02CostFx: '1400' },
  electricMode: 'amount', anyKrw: true
};

test('flags bill-missing core items and empty required inputs', () => {
  const m = findMissing({ missing_items: ['OPERATIONS'] }, {
    ...filled, rows: { ...filled.rows, server: { state: 'missing', amount: '' } },
    fields: { ...filled.fields, v02Gpu: '', v02CostFx: '' }
  });
  assert.deepEqual(m.map(x => x.key), ['row:server', 'row:ops', 'field:v02Gpu', 'field:v02CostFx']);
  assert.ok(m.find(x => x.key === 'row:ops').reason.includes('청구서에 없음'));
});

test('nothing missing once the manager fills or marks items as included', () => {
  assert.deepEqual(findMissing({ missing_items: ['OPERATIONS'] },
    { ...filled, rows: { ...filled.rows, ops: { state: 'included' } } }), []);
  // 공간: 랙·임차료 중 하나라도 있으면 누락 아님
  assert.deepEqual(findMissing({ missing_items: ['RENT'] }, filled), []);
  // 전기료 누락은 전기료 방식이 미확인일 때만
  assert.equal(findMissing({ missing_items: ['ELECTRICITY'] }, { ...filled, electricMode: 'missing' })[0].key, 'electric');
});

test('review shows missing box and what was sent to the LLM (escaped)', () => {
  const html = renderDraft({ ...draftA, missing_items: ['OPERATIONS'],
    llm: { destination: 'OpenAI (gpt-4o-mini)', masked: true, sent: '{"cells":["동력비","#NUM"]} <b>' } });
  assert.ok(html.includes('청구서에서 빠진 큰 비용 1건'));
  assert.ok(html.includes('운영·유지보수'));
  assert.ok(html.includes('AI에 보낸 내용 보기') && html.includes('금액·숫자·식별자 가림'));
  assert.ok(html.includes('&lt;b&gt;') && !html.includes('"]} <b>'));
});

test('an ops row filled only with OTHER is still flagged as missing operations', () => {
  const values = { ...filled, rows: { ...filled.rows, ops: { state: 'user', amount: '2400000', autoTypes: ['OTHER'], autoAmount: '2400000' } } };
  const m = findMissing({ missing_items: ['OPERATIONS'] }, values);
  assert.equal(m[0].key, 'row:ops');
  assert.ok(m[0].reason.includes('기타 항목만'));
  // 담당자가 금액을 바꾸면 해제
  values.rows.ops.amount = '30000000';
  assert.deepEqual(findMissing({ missing_items: ['OPERATIONS'] }, values), []);
});

test('toCostForm records which item types filled each row', () => {
  const m = toCostForm(draftA);
  assert.deepEqual(m.rows.ops.types, ['OPERATIONS', 'OTHER']);
});
