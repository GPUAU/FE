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
  mini.innerHTML = '<div class="agent-panel-resizer" role="separator" aria-label="대화창 너비 조절" aria-orientation="vertical" aria-controls="agentMiniWindow" tabindex="0" title="드래그하여 대화창 너비 조절"></div><header class="agent-mini-header"><h2 id="agentMiniTitle">GPU AI 에이전트</h2></header><div class="agent-mini-body copilot-layout"></div>';
  const content = mini.querySelector('.agent-mini-body');
  const resizer = mini.querySelector('.agent-panel-resizer');
  const panelHeader = mini.querySelector('.agent-mini-header');
  const resetHome = feedPanel?.querySelector('.chat-panel-head');
  const resetButton = feedPanel?.querySelector('#agentReset') || document.createElement('button');
  if (!feedPanel) {
    resetButton.type = 'button';
    resetButton.className = 'agent-reset-proxy';
    resetButton.textContent = '새 대화';
    resetButton.disabled = true;
    resetButton.addEventListener('click', () => frame?.contentDocument?.getElementById('agentReset')?.click());
    panelHeader.append(resetButton);
  }
  let dragWidth = null;
  const widthLimits = () => ({min:320,max:Math.max(380,Math.min(800,window.innerWidth-400))});
  function updateResizeState() {
    const {min,max}=widthLimits();
    resizer.setAttribute('aria-valuemin',String(min));
    resizer.setAttribute('aria-valuemax',String(max));
    resizer.setAttribute('aria-valuenow',String(Math.round(mini.getBoundingClientRect().width)));
  }
  function setPanelWidth(width) {
    const {min,max}=widthLimits();
    document.body.style.setProperty('--agent-panel-width', `${Math.round(Math.max(min,Math.min(max,width)))}px`);
    updateResizeState();
    window.dispatchEvent(new Event('resize'));
  }
  function stopResize() {
    if(!dragWidth)return;
    const id=dragWidth.id;dragWidth=null;
    document.body.classList.remove('agent-panel-resizing');
    if(resizer.hasPointerCapture(id))resizer.releasePointerCapture(id);
  }
  resizer.addEventListener('pointerdown', event => {
    if(event.button!==0)return;
    event.preventDefault();
    dragWidth={id:event.pointerId,x:event.clientX,width:mini.getBoundingClientRect().width};
    resizer.setPointerCapture(event.pointerId);
    resizer.focus({preventScroll:true});
    document.body.classList.add('agent-panel-resizing');
  });
  resizer.addEventListener('pointermove', event => {
    if(dragWidth&&event.pointerId===dragWidth.id)setPanelWidth(dragWidth.width+dragWidth.x-event.clientX);
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>resizer.addEventListener(type,stopResize));
  resizer.addEventListener('keydown', event => {
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const {min,max}=widthLimits(),width=mini.getBoundingClientRect().width;
    setPanelWidth(event.key==='Home'?min:event.key==='End'?max:width+(event.key==='ArrowLeft'?24:-24));
  });
  window.addEventListener('resize', () => {
    if(window.innerWidth>760&&document.body.style.getPropertyValue('--agent-panel-width')) {
      const {min,max}=widthLimits(),width=parseFloat(document.body.style.getPropertyValue('--agent-panel-width'));
      document.body.style.setProperty('--agent-panel-width',`${Math.max(min,Math.min(max,width))}px`);
    }
    if(!mini.hidden)updateResizeState();
  });
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
      if(ready) {
        const frameReset=frame.contentDocument.getElementById('agentReset');
        if(frameReset) {
          resetButton.disabled=frameReset.disabled;
          new MutationObserver(()=>{resetButton.disabled=frameReset.disabled;}).observe(frameReset,{attributes:true,attributeFilter:['disabled']});
        }
      }
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
        panelHeader.append(resetButton);
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
        resizer.focus({ preventScroll: true });
      }
    } else {
      stopResize();
      if (feedPanel) {
        resetHome.append(resetButton);
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
