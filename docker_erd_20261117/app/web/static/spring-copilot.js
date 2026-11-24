/* Use the original Copilot panel with the Spring public-price endpoint. */
/* 출처 식별자(aws_ec2_pricing_api)를 읽을 수 있는 이름(AWS EC2 Pricing API)으로 바꾼다. */
const COPILOT_UPPER = new Set(['aws', 'api', 'ec2', 'oci', 'gpu', 'fx', 'krw', 'usd', 'url']);
function copilotSourceName(name) {
  if (!name) return '출처 원문';
  if (!/^[a-z0-9_]+$/.test(name)) return name;
  return name.split('_').filter(Boolean)
    .map(word => COPILOT_UPPER.has(word) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)).join(' ');
}
const publicPriceExamples = [
  'B300 온디맨드 GPU당 시간 가격과 출처 알려줘',
  '미국 AWS B300 온디맨드 가격 알려줘',
  'H100 온디맨드 가격과 수집 시각 알려줘',
  'VR200 온디맨드 가격 알려줘'
];
const springAgentWelcome = $('#agentWelcome');
let springAgentSessionId = null;
let springAgentBusy = false;

function syncSpringCopilotControls() {
  $('#agentReset').disabled = springAgentBusy || !state.hist.length;
  document.querySelectorAll('#askForm button[type="submit"], #exQs button, #histQs button, #feed [data-welcome-ask]')
    .forEach(button => { button.disabled = springAgentBusy; });
}

RENDER.agent = () => {
  $('#agentDesc').textContent = '저장된 온디맨드 가격과 출처를 질문으로 확인합니다.';
  $('#exQs').innerHTML = publicPriceExamples
    .map(message => `<button type="button" class="qbtn" data-q="${esc(message)}">${esc(message)}</button>`)
    .join('');
  $('#usageBox').textContent = '후속 질문에는 앞서 선택한 조회 조건이 이어집니다. 조건을 처음부터 설정하려면 ‘새 대화’를 누르세요.';
  renderHist();
  syncSpringCopilotControls();
};

async function askSpringPrice(text) {
  const message = text.trim();
  if (!message || springAgentBusy) return;

  const feed = $('#feed');
  if (!feed) return;
  springAgentBusy = true;
  $('#agentSessionStatus').textContent = '';
  $('#agentWelcome')?.remove();
  const question = document.createElement('div');
  question.className = 'msg-u';
  question.textContent = message;
  const reply = document.createElement('div');
  reply.className = 'msg-a';
  reply.setAttribute('aria-live', 'polite');
  reply.textContent = '공개가격 조회 중…';
  feed.append(question, reply);
  if (feed.closest('#agentMiniWindow, #agentEmbeddedPanel')) feed.scrollTop = feed.scrollHeight;
  state.hist.unshift(message);
  renderHist();
  syncSpringCopilotControls();
  try {
    const result = await GpuSpringAnalysis.askPrice(message, undefined, springAgentSessionId);
    springAgentSessionId = result.sessionId || null;
    const label = {
      ANSWERED: '확인된 공개가격',
      NO_DATA: '가격 미확보',
      NEEDS_CLARIFICATION: '질문 조건 확인'
    }[result.status] || '조회 결과';
    const items = (result.results || []).map(item => {
      const time = new Date(item.collectedAt);
      const collected = item.collectedAt && !Number.isNaN(time.getTime())
        ? new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short'
          }).format(time) + ' KST'
        : '수집 시각 미확인';
      const conditions = [item.providerName, item.regionCode,
        item.gpuCount == null ? null : item.gpuCount + ' GPU'].filter(Boolean).join(' · ');
      const amount = Number(item.priceUsdGpuHour);
      const price = item.priceUsdGpuHour == null || !Number.isFinite(amount) ? '가격 미확보'
        : '$' + amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' / GPU·시간';
      const links = GpuSpringAnalysis.sourcesForResult(item, result.sources || []).flatMap(source => {
        const url = GpuSpringAnalysis.sourceLink(source.sourceUrl);
        if (!url) return [];
        return [`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(copilotSourceName(source.sourceName))}</a>`];
      });
      return `<li><b>${esc(conditions)}</b> · ${esc(price)}<br>
        <small>${esc(collected)} · 출처 ${links.join(' · ') || '미제공'}</small></li>`;
    });
    const answer = items.length ? String(result.answer ?? '').split(/\r?\n/, 1)[0] : result.answer;
    reply.innerHTML = `<div class="hd"><span class="route">${esc(label)}</span></div>
      <div class="md"><p>${esc(answer)}</p>
      ${items.length ? '<h4>조회 가격·수집 시각·출처</h4><ul>' + items.join('') + '</ul>' : ''}</div>`;
  } catch (error) {
    if (error instanceof GpuSpringAnalysis.AgentSessionExpiredError) springAgentSessionId = null;
    reply.textContent = error.message;
  } finally {
    springAgentBusy = false;
    syncSpringCopilotControls();
  }
  // Keep async replies inside the mini window; never scroll the underlying page.
  if (feed.closest('#agentMiniWindow, #agentEmbeddedPanel')) {
    feed.scrollTop = feed.scrollHeight;
  } else if (feed.getClientRects().length) {
    reply.scrollIntoView({ block: 'nearest' });
  }
}

async function resetSpringCopilot() {
  if (springAgentBusy || !state.hist.length) return;
  const status = $('#agentSessionStatus');
  springAgentBusy = true;
  status.textContent = '이전 대화 종료 중…';
  syncSpringCopilotControls();
  try {
    if (springAgentSessionId) await GpuSpringAnalysis.deleteAgentSession(springAgentSessionId);
    springAgentSessionId = null;
    state.hist.length = 0;
    $('#feed').replaceChildren(springAgentWelcome);
    renderHist();
    const input = $('#askIn');
    input.value = '';
    input.focus();
    status.textContent = '새 대화를 시작할 수 있습니다.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    springAgentBusy = false;
    syncSpringCopilotControls();
  }
}

$('#askForm').addEventListener('submit', event => {
  if (!springAgentBusy) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
// Bind immediately as the embedded mini window does not wait for workspace metadata.
$('#askForm').onsubmit = event => {
  event.preventDefault();
  if (springAgentBusy) return;
  const input = $('#askIn');
  if (!input.value.trim()) return;
  const message = input.value;
  input.value = '';
  askSpringPrice(message);
};
$('#agentReset').onclick = resetSpringCopilot;
ask = askSpringPrice;
