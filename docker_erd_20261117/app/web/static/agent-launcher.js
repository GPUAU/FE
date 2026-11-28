/* Reuse the existing Copilot DOM and session in a non-modal right side panel. */
(() => {
  'use strict';
  if (document.getElementById('agentLauncher') || document.getElementById('agentEmbeddedPanel')) return;
  const agentView = document.getElementById('v-agent');
  const feedPanel = agentView?.querySelector('.feedwrap');
  const embedded = new URLSearchParams(location.search).get('agentEmbed') === '1';
  const welcome = document.getElementById('agentWelcome');
  if (welcome && !welcome.querySelector('.agent-welcome-mark')) {
    const mark = document.createElement('span');
    mark.className = 'agent-welcome-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = '<img src="/static/img/skt-logo.png" alt="" width="640" height="252" draggable="false">';
    welcome.prepend(mark);
    welcome.querySelector('h2').textContent = 'GPU 가격, 무엇이 궁금하세요?';
    welcome.querySelector('p:not(.eyebrow)').textContent = 'GPU 모델과 궁금한 내용을 입력해 주세요.';
  }


  const composer = document.getElementById('askForm');
  const questionInput = document.getElementById('askIn');
  const sendButton = composer?.querySelector('button[type="submit"]');
  if (questionInput && sendButton) {
    questionInput.rows = 1;
    questionInput.placeholder = '질문을 입력하세요 (Enter 전송)';
    sendButton.setAttribute('aria-label', '질문 전송');
    sendButton.title = '질문 전송';
    sendButton.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 3-6.5 18-4-7.5L3 9.5 21 3Z"/><path d="M10.5 13.5 21 3"/></svg>';
    function syncComposer() {
      composer.classList.toggle('has-question', Boolean(questionInput.value.trim()));
      questionInput.style.height = 'auto';
      questionInput.style.height = `${Math.min(120, Math.max(40, questionInput.scrollHeight))}px`;
    }
    questionInput.addEventListener('input', syncComposer);
    composer.addEventListener('submit', () => queueMicrotask(syncComposer));
    document.getElementById('agentReset')?.addEventListener('click', () => queueMicrotask(syncComposer));
    new MutationObserver(syncComposer).observe(sendButton, { attributes: true, attributeFilter: ['disabled'] });
    syncComposer();
  }

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
  launcher.setAttribute('aria-label', '에이전트 패널 열기');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'agentMiniWindow');
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg><span>에이전트</span>';

  const mini = document.createElement('section');
  mini.id = 'agentMiniWindow';
  mini.hidden = true;
  mini.setAttribute('role', 'dialog');
  mini.setAttribute('aria-modal', 'false');
  mini.setAttribute('aria-labelledby', 'agentMiniTitle');
  mini.innerHTML = '<header class="agent-mini-header"><div><h2 id="agentMiniTitle">GPU AI 에이전트</h2><p>가격과 출처를 함께 확인하세요.</p></div><button type="button" class="agent-mini-minimize" aria-label="에이전트 패널 접기" title="패널 접기"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button></header><div class="agent-mini-body copilot-layout"></div>';
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
    launcher.setAttribute('aria-label', open ? '에이전트 패널 접기' : '에이전트 패널 열기');
    window.dispatchEvent(new Event('resize'));
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
  document.body.append(mini);
  const header = document.querySelector('.gnb') || document.querySelector('body > nav');
  const headerActions = document.querySelector('.gnb-in');
  if (headerActions) headerActions.append(launcher);
  else if (header) header.append(launcher);
  else { document.body.append(launcher); launcher.classList.add('agent-toggle-fallback'); }
  function syncHeaderHeight() {
    const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    document.documentElement.style.setProperty('--agent-panel-top', `${top}px`);
  }
  if (header) new ResizeObserver(syncHeaderHeight).observe(header);
  window.addEventListener('resize', syncHeaderHeight);
  window.addEventListener('scroll', syncHeaderHeight, { passive: true });
  syncHeaderHeight();
  syncRoute();
})();
