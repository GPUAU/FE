import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fx = require('../docker_erd_20261117/app/web/static/fx-display.js');
const script = fs.readFileSync(new URL('../docker_erd_20261117/app/web/static/requirements-v02.js', import.meta.url), 'utf8').split('const costRows=')[0];

test('mounts outside content, coalesces lookup, preserves drafts, and keeps manual/reset conversion', async () => {
  let panel, doc, calls = 0; const pending = []; const updates = [];
  const price = { dataset: { usd: '2' }, textContent: '' };
  const control = (id, value = '') => ({ id, value, disabled: false, textContent: '', focus() { doc.activeElement = this; } });
  const host = { append(node) { panel = node; node.parentElement = host; node.isConnected = true; } };
  doc = { activeElement: null,
    querySelector: s => s === '#v02Fx' ? panel : null,
    querySelectorAll: s => s === '[data-usd]' ? [price] : [],
    getElementById: id => panel?.controls[id],
    createElement() { return {
      controls: {}, setAttribute() {}, contains(node) { return Object.values(this.controls).includes(node); },
      querySelector(s) { return s === 'details' ? this.details : this.controls[s.slice(1)]; },
      set innerHTML(html) {
        this.html = html; this.controls = {};
        for (const match of html.matchAll(/id="([^"]+)"/g)) this.controls[match[1]] = control(match[1]);
        this.controls.v02FxInput.value = html.match(/id="v02FxInput"[^>]*value="([^"]*)"/)?.[1] || '';
        this.details = { open: /<details[^>]*\bopen/.test(html) };
      }
    }; }, body: {} };
  const context = { document: doc, GpuFx: { ...fx, fetchLatestFx() { calls++; return new Promise(resolve => pending.push(resolve)); } },
    GpuFxHeader: { ensure: () => host, update: (data, manual, loading) => updates.push({ data, manual, loading }) },
    mh: value => String(value), mlink: () => '', mframe() {},
    MutationObserver: class { observe() {} }, queueMicrotask };
  vm.createContext(context); vm.runInContext(script, context);
  assert.equal(panel.parentElement, host); assert.equal(calls, 1);
  const second = context.mountFx(); assert.equal(calls, 1);
  const quote = { status: 'available', rate: { rate: 1337.3, reference_date: '2026-11-23', collected_at: null }, warnings: [], stale: false };
  pending.shift()(quote); await second;
  assert.match(price.textContent, /2,675원/);
  const samePanel = panel;
  panel.controls.v02FxInput.value = '1450'; panel.controls.v02FxInput.focus(); panel.details.open = true;
  const refresh = context.mountFx(true);
  assert.equal(panel.controls.v02FxInput.value, '1450'); assert.equal(panel.details.open, true);
  pending.shift()(quote); await refresh;
  assert.equal(panel.controls.v02FxInput.value, '1450'); assert.equal(doc.activeElement, panel.controls.v02FxInput);
  panel.controls.v02FxForm.onsubmit({ preventDefault() {} });
  assert.equal(updates.at(-1).manual, 1450); assert.match(price.textContent, /2,900원.*사용자 가정/);
  panel.controls.v02FxReset.onclick();
  assert.equal(updates.at(-1).manual, null); assert.equal(panel.controls.v02FxInput.value, '');
  assert.match(price.textContent, /2,675원.*표시 환율/);
  await context.mountFx(); assert.equal(panel, samePanel); assert.equal(calls, 2);
});
