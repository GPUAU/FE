import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../docker_erd_20261117/app/web/static/spring-copilot.js', import.meta.url), 'utf8');
function setup() {
  const elements = new Map(); let pageScrolls = 0; let mini = true; let visible = true;
  const make = () => ({ children: [], textContent: '', value: '', scrollTop: 0, scrollHeight: 800,
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
    remove() {}, focus() {}, setAttribute() {}, addEventListener() {},
    scrollIntoView() { pageScrolls++; }, closest() { return mini ? {} : null; },
    getClientRects() { return visible ? [{}] : []; } });
  for (const id of ['agentWelcome','agentReset','agentDesc','exQs','usageBox','agentSessionStatus','feed','askIn','askForm']) elements.set('#' + id, make());
  const pending = []; const calls = []; const deleted = [];
  const ctx = { $: s => elements.get(s), state: { hist: [] }, RENDER: {}, renderHist() {},
    esc: v => String(v ?? '').replaceAll('<', '&lt;'),
    document: { querySelectorAll: () => [], createElement: make },
    GpuSpringAnalysis: {
      askPrice(text, _, session) { calls.push({ text, session }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); },
      async deleteAgentSession(id) { deleted.push(id); }, AgentSessionExpiredError: class extends Error {}
    } };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  return { ctx, elements, pending, calls, deleted, get pageScrolls() { return pageScrolls; },
    minimize() { mini = false; visible = false; } };
}

test('mini replies use the same conversation ID and only scroll the feed', async () => {
  const f = setup(); const feed = f.elements.get('#feed');
  const first = f.ctx.askSpringPrice('B300');
  assert.equal(feed.scrollTop, 800);
  await f.ctx.askSpringPrice('중복 전송'); assert.equal(f.calls.length, 1);
  f.pending[0].resolve({ sessionId: 'same-session', status: 'ANSWERED', answer: 'test reply', results: [] });
  await first;
  const next = f.ctx.askSpringPrice('미국은?');
  assert.equal(f.calls[1].session, 'same-session');
  f.pending[1].resolve({ sessionId: 'same-session', status: 'NO_DATA', answer: '가격 미확보', results: [] });
  await next;
  assert.equal(f.pageScrolls, 0); assert.equal(feed.children.length, 4);
});

test('a response after minimizing cannot scroll the underlying page', async () => {
  const f = setup(); const pending = f.ctx.askSpringPrice('H100'); f.minimize();
  f.pending[0].resolve({ sessionId: 's1', status: 'ANSWERED', answer: 'late reply', results: [] });
  await pending;
  assert.equal(f.pageScrolls, 0);
  assert.match(f.elements.get('#feed').children[1].innerHTML, /late reply/);
});

test('immediate form binding sends before workspace setup and preserves draft while busy', async () => {
  const f = setup(); const form = f.elements.get('#askForm'); const input = f.elements.get('#askIn');
  input.value = 'B300'; form.onsubmit({ preventDefault() {} });
  assert.equal(f.calls.length, 1); assert.equal(input.value, '');
  input.value = '작성 중인 다음 질문'; form.onsubmit({ preventDefault() {} });
  assert.equal(f.calls.length, 1); assert.equal(input.value, '작성 중인 다음 질문');
  f.pending[0].resolve({ sessionId: 's1', status: 'NO_DATA', answer: 'no data', results: [] });
  await new Promise(resolve => setImmediate(resolve));
  await f.ctx.resetSpringCopilot();
  assert.deepEqual(f.deleted, ['s1']); assert.equal(f.ctx.state.hist.length, 0);
});
