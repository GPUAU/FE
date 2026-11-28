import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../docker_erd_20261117/app/web/static/agent-launcher.js', import.meta.url), 'utf8');

// Small DOM fixture for lifecycle tests; this does not exercise browser layout.
function fixture({ standalone = false, embedded = false } = {}) {
  let document;
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.parentNode = null;
      this.attributes = {}; this.listeners = {}; this.hidden = false; this.scrollTop = 0;
      this.value = ''; this.className = '';
      const props = {};
      this.style = { setProperty: (k, v) => { props[k] = v; }, getPropertyValue: k => props[k] || '', removeProperty: k => { delete props[k]; } };
      const classes = new Set();
      this.classList = { add: c => classes.add(c), remove: c => classes.delete(c),
        contains: c => classes.has(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) };
    }
    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k]; }
    append(...nodes) { for (const node of nodes) { node.detach(); node.parentNode = this; this.children.push(node); } }
    detach() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); }
    before(node) { node.detach(); const p = this.parentNode; p.children.splice(p.children.indexOf(this), 0, node); node.parentNode = p; }
    after(node) { node.detach(); const p = this.parentNode; p.children.splice(p.children.indexOf(this) + 1, 0, node); node.parentNode = p; }
    prepend(node) { node.detach(); node.parentNode = this; this.children.unshift(node); }
    getBoundingClientRect() { return { width: 420, bottom: 64 }; }
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    querySelector(selector) {
      // '.class'와 '#id'만 지원한다. 그 밖의 선택자는 이 고정 DOM에 없는 것으로 본다.
      if (!/^[.#][\w-]+$/.test(selector)) return null;
      const matches = n => selector.startsWith('.') ? n.className.split(' ').includes(selector.slice(1)) : n.id === selector.slice(1);
      for (const child of this.children) { if (matches(child)) return child; const found = child.querySelector(selector); if (found) return found; }
      return null;
    }
    set innerHTML(value) {
      this.markup = value;
      // The side-panel shell (resize handle, header, body) is the only parsed template needed in this fixture.
      if (value.includes('agent-mini-header')) {
        const resizer = new Node(); resizer.className = 'agent-panel-resizer';
        const head = new Node('header'); head.className = 'agent-mini-header';
        const body = new Node(); body.className = 'agent-mini-body copilot-layout'; this.append(resizer, head, body);
      }
    }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    emit(name, event = {}) { for (const fn of this.listeners[name] || []) fn(event); }
    focus(options) { document.activeElement = this; this.focusOptions = options; }
  }
  const body = new Node('body');
  document = { body, activeElement: null, listeners: {}, documentElement: new Node('html'),
    createElement: tag => new Node(tag), createComment: () => new Node('#comment'),
    getElementById: id => body.querySelector('#' + id), querySelector: selector => body.querySelector(selector),
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
    emit(name, event) { for (const fn of this.listeners[name] || []) fn(event); } };
  const view = new Node('section'); view.id = 'v-agent'; view.hidden = true;
  const panel = new Node(); panel.className = 'feedwrap';
  const feed = new Node(); feed.id = 'feed';
  const input = new Node('textarea'); input.id = 'askIn'; input.value = '작성 중 질문';
  const head = new Node('header'); head.className = 'chat-panel-head';
  const reset = new Node('button'); reset.id = 'agentReset'; head.append(reset);
  panel.append(head, feed, input); view.append(panel); if (!standalone) body.append(view);
  const location = { hash: '#compare', search: embedded ? '?agentEmbed=1' : '', origin: 'https://example.test' };
  const window = { listeners: {}, innerWidth: 1280, addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
    emit(name, event) { for (const fn of this.listeners[name] || []) fn(event); },
    dispatchEvent(event) { this.emit(event.type, event); } };
  window.parent = window;
  let renders = 0;
  class Event { constructor(type) { this.type = type; } }
  class Observer { observe() {} }
  vm.runInNewContext(script, { document, window, location, URLSearchParams, Event, ResizeObserver: Observer,
    MutationObserver: Observer, queueMicrotask, RENDER: { agent() { renders++; } } });
  return { document, window, location, view, panel, feed, input, head, reset, Node,
    get launcher() { return document.getElementById('agentLauncher'); },
    get mini() { return document.getElementById('agentMiniWindow'); }, get renders() { return renders; } };
}

test('opening keeps the route and original input/listeners, collapsing retains messages and draft', () => {
  const f = fixture();
  let submissions = 0; f.panel.addEventListener('submit', () => submissions++);
  f.launcher.emit('click');
  assert.equal(f.location.hash, '#compare');
  assert.equal(f.mini.hidden, false);
  assert.equal(f.mini.getAttribute('aria-modal'), 'false');
  assert.equal(f.launcher.getAttribute('aria-expanded'), 'true');
  assert.equal(f.mini.contains(f.panel), true);
  assert.equal(f.document.activeElement, f.input);
  assert.equal(f.input.focusOptions.preventScroll, true);
  const answer = new f.Node(); answer.textContent = '확인된 가격'; f.feed.append(answer); f.feed.scrollTop = 137;
  assert.equal(f.mini.querySelector('.agent-mini-header').contains(f.reset), true);  // '새 대화'는 패널 머리로
  assert.equal(f.launcher.getAttribute('aria-label'), '에이전트 패널 접기');
  f.launcher.emit('click');  // 같은 버튼으로 접는다 (따로 최소화 버튼 없음)
  assert.equal(f.mini.hidden, true); assert.equal(f.view.contains(f.panel), true);
  assert.equal(f.head.contains(f.reset), true);  // 접으면 '새 대화'가 원래 자리로
  assert.equal(f.launcher.getAttribute('aria-expanded'), 'false');
  f.launcher.emit('click'); f.panel.emit('submit');
  assert.equal(submissions, 1); assert.equal(f.feed.children[0], answer);
  assert.equal(f.input.value, '작성 중 질문'); assert.equal(f.feed.scrollTop, 137);
});

test('background route changes keep chat open; full Copilot restores its original panel', () => {
  const f = fixture(); f.launcher.emit('click');
  f.location.hash = '#catalog/gpu/H100'; f.window.emit('hashchange');
  assert.equal(f.mini.hidden, false); assert.equal(f.mini.contains(f.panel), true);
  f.location.hash = '#agent'; f.window.emit('hashchange');
  assert.equal(f.mini.hidden, true); assert.equal(f.view.contains(f.panel), true);
  assert.equal(f.launcher.hidden, true);
  f.location.hash = '#compare'; f.window.emit('hashchange');
  assert.equal(f.launcher.hidden, false);
});

test('Escape respects IME and background controls, then minimizes with focus return', () => {
  const f = fixture(); f.launcher.emit('click'); let prevented = false;
  const key = { key: 'Escape', isComposing: true, preventDefault() { prevented = true; } };
  f.document.emit('keydown', key); assert.equal(f.mini.hidden, false);
  key.isComposing = false; f.document.activeElement = f.document.body;
  f.document.emit('keydown', key); assert.equal(f.mini.hidden, false);
  f.input.focus(); f.document.emit('keydown', key);
  assert.equal(prevented, true); assert.equal(f.mini.hidden, true);
  assert.equal(f.document.activeElement, f.launcher);
});

test('standalone pages retain a single same-origin conversation frame', () => {
  const f = fixture({ standalone: true }); f.launcher.emit('click');
  const content = f.mini.querySelector('.agent-mini-body');
  const frame = content.children.find(n => n.tagName === 'iframe');
  assert.equal(frame.src, '/?agentEmbed=1#agent');
  f.launcher.emit('click'); f.launcher.emit('click');
  assert.equal(content.children.filter(n => n.tagName === 'iframe').length, 1);
  assert.equal(content.children.includes(frame), true); assert.equal(f.location.hash, '#compare');
});

test('embedded mode mounts the same Copilot panel without a nested launcher', () => {
  const f = fixture({ embedded: true });
  assert.equal(f.launcher, null);
  assert.equal(f.document.getElementById('agentEmbeddedPanel').contains(f.panel), true);
  assert.equal(f.document.body.classList.contains('agent-widget-embedded'), true);
  assert.equal(f.renders, 1);
});

test('resize handle changes the panel width by keyboard within limits', () => {
  const f = fixture(); f.launcher.emit('click');
  const resizer = f.mini.querySelector('.agent-panel-resizer');
  const width = () => f.document.body.style.getPropertyValue('--agent-panel-width');
  resizer.emit('keydown', { key: 'ArrowLeft', preventDefault() {} });
  assert.equal(width(), '444px');  // 420 + 24 (왼쪽으로 넓힘)
  resizer.emit('keydown', { key: 'Home', preventDefault() {} });
  assert.equal(width(), '320px');  // 최소
  resizer.emit('keydown', { key: 'End', preventDefault() {} });
  assert.equal(width(), '800px');  // 최대 = min(800, 화면 폭 - 400)
  assert.equal(resizer.getAttribute('aria-valuemin'), '320');
});
