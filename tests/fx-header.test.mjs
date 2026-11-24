import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fx = require('../docker_erd_20261117/app/web/static/fx-display.js');
const header = require('../docker_erd_20261117/app/web/static/fx-header.js');
const quote = { status: 'available', rate: { rate: 1337.312345, reference_date: '2026-11-23' }, warnings: [], stale: false };

test('header rounds only the compact label, retaining exact quote in its accessible description', () => {
  const data = header.summary(quote, null, false, fx);
  assert.equal(data.value, '1,337.31원');
  assert.match(data.description, /1,337.312345/);
  assert.match(data.description, /2026-11-23/);
  assert.equal(quote.rate.rate, 1337.312345);
});
test('manual assumptions, stale quotes and previous-date warnings remain identifiable', () => {
  assert.equal(header.summary(quote, 1400, false, fx).status, '직접 입력');
  assert.match(header.summary(quote, 1400, false, fx).description, /사용자 가정/);
  assert.doesNotMatch(header.summary(quote, 1400, false, fx).description, /2026-11-23/);
  assert.equal(header.summary({ ...quote, stale: true }, null, false, fx).status, '오래된 공시');
  assert.equal(header.summary({ ...quote, warnings: ['이전 공시일'] }, null, false, fx).status, '기준일 확인');
});
test('failed, missing and loading rates never display zero or a fabricated quote', () => {
  assert.equal(header.summary({ status: 'failed' }, null, false, fx).value, '조회 실패');
  assert.equal(header.summary({ status: 'unavailable' }, null, false, fx).value, '미확보');
  assert.equal(header.summary(null, null, true, fx).value, '조회 중');
  assert.equal(header.summary({ status: 'failed' }, 1400, false, fx).value, '1,400원');
  assert.equal(header.summary(quote, null, true, fx).status, '조회 중');
});

function fixture(search = '') {
  let doc;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.hidden = false; this.attributes = {}; this.listeners = {}; this.dataset = {}; this.offsetWidth = 440; this.style = { setProperty() {} }; this.classList = { add() {} }; }
    append(...items) { this.children.push(...items); }
    insertBefore(item, before) { const index = this.children.indexOf(before); this.children.splice(index < 0 ? this.children.length : index, 0, item); }
    querySelector(s) { return this.children.find(x => s.startsWith('.') ? x.className === s.slice(1) : x.id === s.slice(1)) || null; }
    contains(n) { return n === this || this.children.some(x => x.contains(n)); }
    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k]; }
    addEventListener(k, f) { (this.listeners[k] ||= []).push(f); }
    emit(k, e = {}) { for (const f of this.listeners[k] || []) f(e); }
    focus(options) { doc.activeElement = this; this.focusOptions = options; }
    getBoundingClientRect() { return { right: 950, bottom: 60 }; }
  }
  const body = new Element('body'); const nav = new Element('header'); const searchButton = new Element('button'); searchButton.className = 'portal-search'; nav.append(searchButton);
  doc = { body, activeElement: null, documentElement: { clientWidth: 1024 }, listeners: {},
    querySelector: selector => selector === '.gnb-in' ? nav : null, createElement: tag => new Element(tag),
    addEventListener(k, f) { (this.listeners[k] ||= []).push(f); },
    emit(k, e) { for (const f of this.listeners[k] || []) f(e); } };
  const win = { location: { search }, listeners: {}, addEventListener(k, f) { (this.listeners[k] ||= []).push(f); }, emit(k) { for (const f of this.listeners[k] || []) f(); } };
  const controller = header.createController(doc, win);
  return { doc, win, nav, searchButton, controller };
}
test('one header button opens and dismisses a non-modal popover without navigating', () => {
  const f = fixture(); const panel = f.controller.ensure();
  assert.equal(f.controller.ensure(), panel); assert.equal(f.nav.children.length, 2);
  assert.equal(f.nav.children[1], f.searchButton);
  const button = f.nav.children[0].children[0];
  assert.equal(panel.hidden, true); assert.equal(panel.getAttribute('aria-modal'), 'false');
  button.emit('click'); assert.equal(panel.hidden, false); assert.equal(button.getAttribute('aria-expanded'), 'true');
  f.controller.update(quote, 1400, false);
  assert.equal(panel.hidden, false); assert.equal(button.dataset.state, 'manual');
  f.doc.emit('pointerdown', { target: panel.children[0] }); assert.equal(panel.hidden, false);
  f.doc.emit('keydown', { key: 'Escape', isComposing: false, preventDefault() {} });
  assert.equal(panel.hidden, true); assert.equal(f.doc.activeElement, button);
  button.emit('click'); f.doc.emit('pointerdown', { target: f.searchButton }); assert.equal(panel.hidden, true);
  button.emit('click'); f.win.emit('hashchange'); assert.equal(panel.hidden, true);
});
test('the embedded agent does not create a second exchange-rate surface', () => {
  const f = fixture('?agentEmbed=1'); assert.equal(f.controller.ensure(), null); assert.equal(f.nav.children.length, 1);
});
