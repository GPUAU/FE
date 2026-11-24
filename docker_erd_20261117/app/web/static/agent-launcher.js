/* Character launcher: reuse the current Copilot route and conversation. */
(() => {
  'use strict';
  if (document.getElementById('agentLauncher')) return;
  const standalone = !document.getElementById('v-agent');
  const launcher = document.createElement('a');
  launcher.id = 'agentLauncher';
  launcher.href = standalone ? '/#agent' : '#agent';
  launcher.setAttribute('aria-label', 'AI 에이전트에게 질문하기');
  launcher.title = 'AI 에이전트 열기';
  launcher.innerHTML = '<img src="/static/img/agent-button.png?v=orange1124" alt="" width="1024" height="1024" draggable="false">';
  document.body.append(launcher);
  let focusRequested = false;
  function sync() {
    const onAgent = !standalone && location.hash.slice(1).split('/')[0] === 'agent';
    launcher.hidden = onAgent;
    document.body.classList.toggle('has-agent-launcher', !onAgent);
    if (focusRequested && onAgent) {
      focusRequested = false;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const input = document.getElementById('askIn');
        if (input && !document.getElementById('v-agent').hidden) {
          input.focus({ preventScroll: true });
          input.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
      }));
    }
  }
  launcher.addEventListener('click', event => {
    if (!standalone && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      focusRequested = true;
    }
  });
  window.addEventListener('hashchange', sync);
  sync();
})();
