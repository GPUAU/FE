/* Use the original Copilot panel with the Spring public-price endpoint. */
const publicPriceExamples = [
  'B300 온디맨드 GPU당 시간 가격과 출처 알려줘',
  '미국 AWS B300 온디맨드 가격 알려줘',
  'H100 온디맨드 가격과 수집 시각 알려줘',
  'VR200 온디맨드 가격 알려줘'
];

RENDER.agent = () => {
  $('#agentDesc').textContent = '저장된 온디맨드 가격과 출처를 질문으로 확인합니다.';
  $('#exQs').innerHTML = publicPriceExamples
    .map(message => `<button type="button" class="qbtn" data-q="${esc(message)}">${esc(message)}</button>`)
    .join('');
  $('#usageBox').textContent = '이번 화면의 질문은 단건 공개가격 조회로 처리됩니다.';
  renderHist();
};

async function askSpringPrice(text) {
  const message = text.trim();
  if (!message) return;

  const feed = $('#feed');
  if (!feed) return;
  $('#agentWelcome')?.remove();
  const question = document.createElement('div');
  question.className = 'msg-u';
  question.textContent = message;
  const reply = document.createElement('div');
  reply.className = 'msg-a';
  reply.setAttribute('aria-live', 'polite');
  reply.textContent = '공개가격 조회 중…';
  feed.append(question, reply);
  state.hist.unshift(message);
  renderHist();
  try {
    const result = await GpuSpringAnalysis.askPrice(message);
    const label = {
      ANSWERED: '확인된 공개가격',
      NO_DATA: '가격 미확보',
      NEEDS_CLARIFICATION: '질문 조건 확인'
    }[result.status] || '조회 결과';
    const items = (result.results || []).map(item => {
      const time = new Date(item.collectedAt);
      const collected = item.collectedAt && !Number.isNaN(time.getTime())
        ? new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short'
          }).format(time) + ' KST'
        : '수집 시각 미확인';
      const conditions = [item.providerName, item.regionCode,
        item.gpuCount == null ? null : item.gpuCount + ' GPU'].filter(Boolean).join(' · ');
      const price = item.priceUsdGpuHour == null ? '가격 미확보' : '$' + item.priceUsdGpuHour + ' / GPU·시간';
      const links = GpuSpringAnalysis.sourcesForResult(item, result.sources || []).flatMap(source => {
        const url = GpuSpringAnalysis.sourceLink(source.sourceUrl);
        if (!url) return [];
        return [`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(source.sourceName || '출처 원문')}</a>`];
      });
      return `<li><b>${esc(conditions)}</b> · ${esc(price)}<br>
        <small>${esc(collected)} · 출처 ${links.join(' · ') || '미제공'}</small></li>`;
    });
    const answer = items.length ? String(result.answer ?? '').split(/\r?\n/, 1)[0] : result.answer;
    reply.innerHTML = `<div class="hd"><span class="route">${esc(label)}</span></div>
      <div class="md"><p>${esc(answer)}</p>
      ${items.length ? '<h4>조회 가격·수집 시각·출처</h4><ul>' + items.join('') + '</ul>' : ''}</div>`;
  } catch (error) {
    reply.textContent = error.message;
  }
  reply.scrollIntoView({ block: 'nearest' });
}

ask = askSpringPrice;
