/* Compact header entry point for the existing FX data and controls. */
(function (root) {
  'use strict';
  function summary(fx, manual, loading, api = root.GpuFx) {
    const applied = api.appliedRate(fx, manual);
    const rate = applied.rate;
    const value = rate === null ? (loading ? '조회 중' : fx?.status === 'failed' ? '조회 실패' : '미확보')
      : rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '원';
    let status = '', tone = 'normal';
    if (applied.manual) { status = '직접 입력'; tone = 'manual'; }
    else if (loading) status = '조회 중';
    else if (fx?.status === 'failed') { status = '조회 실패'; tone = 'warning'; }
    else if (rate === null) { status = '미확보'; tone = 'warning'; }
    else if (fx?.stale) { status = '오래된 공시'; tone = 'warning'; }
    else if (fx?.warnings?.length) { status = '기준일 확인'; tone = 'warning'; }
    const quote = rate === null ? value : '1 USD = ' + rate.toLocaleString('ko-KR', { maximumFractionDigits: 6 }) + ' KRW';
    const date = applied.manual ? '사용자 가정' : fx?.rate?.reference_date ? '공시 기준일 ' + fx.rate.reference_date : '';
    return { value, status, tone, description: [quote, status, date, '환율 상세 열기'].filter(Boolean).join(' · ') };
  }
  function createController(doc, win) {
    let host, button, popup, value, badge, closeButton;
    function position() {
      if (!popup || popup.hidden) return;
      const rect = button.getBoundingClientRect();
      const width = doc.documentElement.clientWidth;
      const right = Math.max(12, Math.min(width - popup.offsetWidth - 12, width - rect.right));
      popup.style.right = right + 'px';
      popup.style.setProperty('--fx-panel-top', Math.round(rect.bottom + 10) + 'px');
    }
    function close(returnFocus = false) {
      if (!popup || popup.hidden) return;
      popup.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (returnFocus) button.focus({ preventScroll: true });
    }
    function ensure() {
      if (popup) return popup;
      if (new URLSearchParams(win.location.search).get('agentEmbed') === '1') return null;
      const header = doc.querySelector('.gnb-in');
      if (!header) return null;
      host = doc.createElement('div'); host.id = 'headerFx';
      button = doc.createElement('button'); button.id = 'headerFxButton'; button.type = 'button';
      button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', 'headerFxPanel');
      const pair = doc.createElement('span'); pair.className = 'header-fx-pair'; pair.textContent = 'USD/KRW';
      value = doc.createElement('strong'); value.className = 'header-fx-value'; value.textContent = '조회 중';
      badge = doc.createElement('span'); badge.className = 'header-fx-state'; badge.hidden = true;
      const chevron = doc.createElement('span'); chevron.className = 'header-fx-chevron';
      chevron.textContent = '⌄'; chevron.setAttribute('aria-hidden', 'true');
      button.append(pair, value, badge, chevron); host.append(button);
      header.insertBefore(host, header.querySelector('.portal-search') || header.querySelector('.gicons'));
      popup = doc.createElement('section'); popup.id = 'headerFxPanel'; popup.hidden = true;
      popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-modal', 'false');
      popup.setAttribute('aria-labelledby', 'headerFxTitle');
      const heading = doc.createElement('div'); heading.className = 'header-fx-heading';
      const title = doc.createElement('h2'); title.id = 'headerFxTitle'; title.textContent = '환율 정보';
      closeButton = doc.createElement('button'); closeButton.type = 'button'; closeButton.textContent = '×';
      closeButton.setAttribute('aria-label', '환율 상세 닫기');
      heading.append(title, closeButton); popup.append(heading); doc.body.append(popup);
      doc.body.classList.add('has-header-fx');
      button.addEventListener('click', () => {
        if (!popup.hidden) { close(); return; }
        popup.hidden = false; button.setAttribute('aria-expanded', 'true'); position();
        closeButton.focus({ preventScroll: true });
      });
      closeButton.addEventListener('click', () => close(true));
      doc.addEventListener('pointerdown', event => {
        if (!popup.hidden && !host.contains(event.target) && !popup.contains(event.target)) close();
      });
      doc.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !event.isComposing && !popup.hidden &&
            (popup.contains(doc.activeElement) || host.contains(doc.activeElement))) {
          event.preventDefault(); close(true);
        }
      });
      win.addEventListener('hashchange', () => close());
      win.addEventListener('resize', position);
      return popup;
    }
    function update(fx, manual, loading) {
      if (!ensure()) return;
      const data = summary(fx, manual, loading);
      value.textContent = data.value;
      badge.textContent = data.status;
      badge.hidden = !data.status || data.status === data.value;
      button.dataset.state = data.tone;
      button.title = data.description;
      button.setAttribute('aria-label', data.description);
      position();
    }
    return { ensure, update, close };
  }
  const api = { summary, createController };
  if (root.document) Object.assign(api, createController(root.document, root));
  root.GpuFxHeader = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
