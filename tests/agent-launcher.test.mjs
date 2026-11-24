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
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    querySelector(selector) {
      const matches = n => selector.startsWith('.') ? n.className.split(' ').includes(selector.slice(1)) : n.id === selector.slice(1);
      for (const child of this.children) { if (matches(child)) return child; const found = child.querySelector(selector); if (found) return found; }
      return null;
    }
    set innerHTML(value) {
      this.markup = value;
      // The shell controls are the only parsed template needed in this fixture.
      if (value.includes('agent-mini-header')) {
        const head = new Node('header'); head.className = 'agent-mini-header';
        const close = new Node('button'); close.className = 'agent-mini-minimize'; head.append(close);
        const body = new Node(); body.className = 'agent-mini-body copilot-layout'; this.append(head, body);
      }
    }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    emit(name, event = {}) { for (const fn of this.listeners[name] || []) fn(event); }
    focus(options) { document.activeElement = this; this.focusOptions = options; }
  }
  const body = new Node('body');
  document = { body, activeElement: null, listeners: {},
    createElement: tag => new Node(tag), createComment: () => new Node('#comment'),
    getElementById: id => body.querySelector('#' + id),
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
    emit(name, event) { for (const fn of this.listeners[name] || []) fn(event); } };
  const view = new Node('section'); view.id = 'v-agent'; view.hidden = true;
  const panel = new Node(); panel.className = 'feedwrap';
  const feed = new Node(); feed.id = 'feed';
  const input = new Node('textarea'); input.id = 'askIn'; input.value = '작성 중 질문';
  panel.append(feed, input); view.append(panel); if (!standalone) body.append(view);
  const location = { hash: '#compare', search: embedded ? '?agentEmbed=1' : '', origin: 'https://example.test' };
  const window = { listeners: {}, addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
    emit(name, event) { for (const fn of this.listeners[name] || []) fn(event); } };
  window.parent = window;
  let renders = 0;
  vm.runInNewContext(script, { document, window, location, URLSearchParams, RENDER: { agent() { renders++; } } });
  return { document, window, location, view, panel, feed, input, Node,
    get launcher() { return document.getElementById('agentLauncher'); },
    get mini() { return document.getElementById('agentMiniWindow'); }, get renders() { return renders; } };
}

test('opening keeps the route and original input/listeners, minimizing retains messages and draft', () => {
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
  f.mini.querySelector('.agent-mini-minimize').emit('click');
  assert.equal(f.mini.hidden, true); assert.equal(f.view.contains(f.panel), true);
  assert.equal(f.document.activeElement, f.launcher);
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
