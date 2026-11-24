/* Reuse the existing Copilot DOM and session in a non-modal mini window. */
(() => {
  'use strict';
  if (document.getElementById('agentLauncher') || document.getElementById('agentEmbeddedPanel')) return;
  const agentView = document.getElementById('v-agent');
  const feedPanel = agentView?.querySelector('.feedwrap');
  const embedded = new URLSearchParams(location.search).get('agentEmbed') === '1';

  function prepareCopilot() {
    if (typeof RENDER !== 'undefined' && typeof RENDER.agent === 'function') RENDER.agent();
  }

  // Standalone pages use this same UI in a same-origin frame.
  if (embedded && feedPanel) {
    const host = document.createElement('div');
    host.id = 'agentEmbeddedPanel';
    host.className = 'copilot-layout';
    document.body.classList.add('agent-widget-embedded');
    document.body.append(host);
    host.append(feedPanel);
    prepareCopilot();
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !event.isComposing && window.parent !== window) {
        event.preventDefault();
        window.parent.postMessage({ type: 'gpu-agent-minimize' }, location.origin);
      }
    });
    return;
  }

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.id = 'agentLauncher';
  launcher.setAttribute('aria-label', 'AI 에이전트 대화창 열기');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'agentMiniWindow');
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.title = 'AI 에이전트 대화창 열기';
  launcher.innerHTML = '<span class="agent-launcher-mark" aria-hidden="true"><span class="agent-launcher-flight"><span class="agent-launcher-wing agent-launcher-wing-left"><img src="/static/img/skt-logo.png" alt="" width="640" height="252" draggable="false"></span><span class="agent-launcher-wing agent-launcher-wing-right"><img src="/static/img/skt-logo.png" alt="" width="640" height="252" draggable="false"></span></span></span><span class="agent-launcher-label">Agent</span>';

  const mini = document.createElement('section');
  mini.id = 'agentMiniWindow';
  mini.hidden = true;
  mini.setAttribute('role', 'dialog');
  mini.setAttribute('aria-modal', 'false');
  mini.setAttribute('aria-labelledby', 'agentMiniTitle');
  mini.innerHTML = '<header class="agent-mini-header"><div><h2 id="agentMiniTitle">Agent</h2><p>화면을 보면서 편하게 질문하세요.</p></div><button type="button" class="agent-mini-minimize" aria-label="대화창 최소화" title="최소화 · 대화 유지"><span aria-hidden="true">−</span></button></header><div class="agent-mini-body copilot-layout"></div>';
  const content = mini.querySelector('.agent-mini-body');
  const minimize = mini.querySelector('.agent-mini-minimize');
  const home = feedPanel ? document.createComment('Copilot panel home') : null;
  if (feedPanel) feedPanel.before(home);
  let frame = null;
  let feedScroll = null;

  function mountFrame() {
    if (frame) return;
    const notice = document.createElement('div');
    notice.className = 'agent-mini-notice';
    notice.setAttribute('role', 'status');
    const message = document.createElement('p');
    message.textContent = '에이전트를 연결하고 있습니다…';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '다시 연결';
    retry.hidden = true;
    notice.append(message, retry);
    frame = document.createElement('iframe');
    frame.title = 'GPU 가격 에이전트 대화';
    frame.src = '/?agentEmbed=1#agent';
    frame.hidden = true;
    frame.addEventListener('load', () => {
      let ready = false;
      try { ready = Boolean(frame.contentDocument?.getElementById('agentEmbeddedPanel')); } catch (_) {}
      notice.hidden = ready;
      frame.hidden = !ready;
      retry.hidden = ready;
      if (!ready) message.textContent = '에이전트를 불러오지 못했습니다. 사이트 로그인 상태를 확인한 뒤 다시 연결해주세요.';
    });
    retry.addEventListener('click', () => {
      retry.hidden = true;
      message.textContent = '에이전트를 연결하고 있습니다…';
      frame.src = '/?agentEmbed=1#agent';
    });
    content.append(notice, frame);
  }

  function setOpen(open, returnFocus = false) {
    if (open === !mini.hidden) return;
    if (open) {
      if (feedPanel) {
        prepareCopilot();
        content.append(feedPanel);
      } else {
        mountFrame();
      }
      mini.hidden = false;
      document.body.classList.add('agent-mini-open');
      if (feedPanel) {
        const feed = document.getElementById('feed');
        if (feedScroll !== null) feed.scrollTop = feedScroll;
        document.getElementById('askIn')?.focus({ preventScroll: true });
      } else {
        minimize.focus({ preventScroll: true });
      }
    } else {
      if (feedPanel) {
        feedScroll = document.getElementById('feed').scrollTop;
        home.after(feedPanel);
      }
      mini.hidden = true;
      document.body.classList.remove('agent-mini-open');
      if (returnFocus) launcher.focus({ preventScroll: true });
    }
    launcher.setAttribute('aria-expanded', String(open));
    launcher.setAttribute('aria-label', open ? 'AI 에이전트 대화창 최소화' : 'AI 에이전트 대화창 열기');
    launcher.title = open ? '대화창 최소화 · 대화 유지' : 'AI 에이전트 대화창 열기';
  }

  launcher.addEventListener('click', () => setOpen(mini.hidden));
  minimize.addEventListener('click', () => setOpen(false, true));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing && !mini.hidden &&
        (mini.contains(document.activeElement) || document.activeElement === launcher)) {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  window.addEventListener('message', event => {
    if (frame && event.source === frame.contentWindow && event.origin === location.origin &&
        event.data?.type === 'gpu-agent-minimize') setOpen(false, true);
  });
  function syncRoute() {
    const onAgent = Boolean(agentView) && location.hash.slice(1).split('/')[0] === 'agent';
    if (onAgent) setOpen(false);
    launcher.hidden = onAgent;
    document.body.classList.toggle('has-agent-launcher', !onAgent);
  }
  window.addEventListener('hashchange', syncRoute);
  document.body.append(mini, launcher);
  syncRoute();
})();
