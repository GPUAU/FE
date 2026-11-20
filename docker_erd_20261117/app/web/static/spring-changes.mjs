const UTC_DAY = 86_400_000;
const TYPES = {
  FIRST_OBSERVATION: '최초 관측',
  PRICE_CHANGE: '가격 변경',
  UNIT_CHANGE: '원본 과금 단위 변경',
  BECAME_PUBLIC: '공개 전환',
};
const CONTRACTS = { ON_DEMAND: 'ON_DEMAND', SPOT: 'SPOT', '1_YEAR': 'COMMITMENT', '3_YEAR': 'COMMITMENT' };
const KRW_EFFECT_STATES = { UNAVAILABLE: '당시 환율 근거 미확보', NOT_APPLICABLE: '환율 효과 해당 없음' };
const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const priceFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const wonFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
const rateFormat = new Intl.NumberFormat('ko-KR', { style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero' });

export function changeScope(catalog, selection, end = Date.now()) {
  const model = catalog.models.find(item => item.name === selection.model);
  if (!model) throw new Error('선택한 GPU 모델을 Spring 카탈로그에서 찾지 못했습니다.');
  const days = ['90', '365'].includes(selection.period) ? Number(selection.period) : 730;
  const scope = {
    modelId: String(model.id), from: new Date(end - days * UTC_DAY).toISOString(),
    to: new Date(end).toISOString(),
  };
  if (selection.provider && selection.provider !== 'ALL') {
    const provider = catalog.providers.find(item => item.name === selection.provider);
    if (!provider) throw new Error('선택한 사업자를 Spring 카탈로그에서 찾지 못했습니다.');
    scope.providerIds = String(provider.id);
  }
  if (selection.region && selection.region !== 'ALL') scope.regionCode = selection.region;
  if (CONTRACTS[selection.term]) scope.contractType = CONTRACTS[selection.term];
  return scope;
}

export async function fetchChangePage(request, scope, cursor) {
  const params = new URLSearchParams({ ...scope, includeKrwDecomposition: 'true', limit: '20' });
  if (cursor) params.set('cursor', cursor);
  const data = await request('/api/v1/market/changes?' + params);
  if (!data?.isSuccess || !Array.isArray(data.result?.items)) {
    throw new Error('가격·상태 변화 응답을 읽을 수 없습니다.');
  }
  return data.result;
}

export function observationRef(observationId, normalizationId) {
  const validId = id => /^[1-9][0-9]*$/.test(String(id));
  if (!validId(observationId)) return null;
  return 'spring-' + observationId + '-' + (validId(normalizationId) ? normalizationId : 'none');
}

function time(value) {
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? dateFormat.format(millis) : '—';
}

function number(value, formatter, suffix = '') {
  return value == null || !Number.isFinite(Number(value)) ? '—' : formatter.format(Number(value)) + suffix;
}

function sourceLink(source, escape) {
  try {
    const url = new URL(source.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${escape(source.sourceName || '미공개 근거')}</a>`;
  } catch {
    return '';
  }
}

function eventRow(event, offers, escape) {
  const offer = offers.get(String(event.offerId));
  const before = observationRef(event.previousObservationId, event.previousNormalizationId);
  const after = observationRef(event.currentObservationId, event.currentNormalizationId);
  const evidence = [
    before && `<button type="button" data-observation="${before}">이전 근거</button>`,
    after && `<button type="button" data-observation="${after}">현재 근거</button>`,
    ...(event.lastUndisclosedEvidence || []).map(source => sourceLink(source, escape)),
  ].filter(Boolean).join(' · ');
  const effects = event.krwDecomposition;
  const effectText = effects?.status === 'OK'
    ? `가격 ${number(effects.priceEffectKrw, wonFormat, '원')} · 환율 ${number(effects.exchangeEffectKrw, wonFormat, '원')}`
    : KRW_EFFECT_STATES[effects?.status] || '—';
  const detail = [offer?.provider_name, offer?.original_product_name, offer?.region_code].filter(Boolean);
  const originalUnit = unit => [unit?.currency, unit?.timeUnit, unit?.appliesTo].filter(Boolean).join(' / ') || '—';
  const unitChange = event.eventType === 'UNIT_CHANGE'
    ? '<br><small>' + escape(originalUnit(event.previousUnit) + ' → ' + originalUnit(event.currentUnit)) + '</small>' : '';
  return `<tr><td>${time(event.eventAt)}</td><td>${escape(detail.join(' · ') || '오퍼 ' + event.offerId)}</td>
    <td>${escape(TYPES[event.eventType] || event.eventType)}${unitChange}</td>
    <td>${number(event.previousPrice, priceFormat)} → ${number(event.currentPrice, priceFormat)}</td>
    <td>${number(event.changeRate, rateFormat)}</td><td>${effectText}</td><td>${evidence || '—'}</td></tr>`;
}

let keepOpen = false;

export function mountChanges(history, selection, options) {
  const previous = history.querySelector('[data-spring-changes]');
  const details = document.createElement('details');
  details.className = 'sg-history-detail';
  details.dataset.springChanges = '';
  details.open = previous?.open ?? keepOpen;
  const showAllCommitments = CONTRACTS[selection.term] === 'COMMITMENT';
  details.innerHTML = `<summary>가격·상태 변화 <span>＋</span></summary>
    <p>선택한 기간을 오늘 기준으로 조회합니다. 관측 시각은 KST, 단가는 USD/GPU·시간입니다.${showAllCommitments ? ' 변화 조회는 모든 약정 기간을 포함합니다.' : ''}</p>
    <p data-change-status role="status"></p><div data-change-rows></div><button type="button" class="sg-export" hidden></button>`;
  if (previous) previous.replaceWith(details);
  else history.appendChild(details);

  const offers = new Map(options.historyRows.map(row => [String(row.offer_id), row]));
  const status = details.querySelector('[data-change-status]');
  const rows = details.querySelector('[data-change-rows]');
  const button = details.querySelector('button');
  const items = [];
  const cursors = new Set();
  let scope, cursor, started = false, loading = false;

  async function load() {
    if (loading) return;
    started = true;
    loading = true;
    button.hidden = true;
    status.textContent = '가격·상태 변화 조회 중…';
    try {
      if (!scope) {
        const catalog = await options.request('/api/v1/catalog');
        if (!catalog?.isSuccess || !Array.isArray(catalog.result?.models) || !Array.isArray(catalog.result?.providers)) {
          throw new Error('GPU 모델과 사업자 목록을 읽을 수 없습니다.');
        }
        scope = changeScope(catalog.result, selection);
      }
      const result = await fetchChangePage(options.request, scope, cursor);
      if (!details.isConnected) return;
      const nextCursor = result.nextCursor || null;
      if (nextCursor && cursors.has(nextCursor)) throw new Error('같은 페이지가 반복되어 조회를 중단했습니다.');
      if (nextCursor) cursors.add(nextCursor);
      cursor = nextCursor;
      items.push(...result.items);
      status.textContent = items.length ? items.length + '건 표시' : '선택 조건의 가격·상태 변화 기록이 없습니다.';
      if (items.length) {
        rows.innerHTML = `<div class="sg-log-scroll" tabindex="0" role="region" aria-label="가격·상태 변화 표"><table>
          <thead><tr><th>관측 시각</th><th>사업자 / 상품</th><th>변화 유형</th><th>이전 → 현재</th>
          <th>변화율</th><th>원화 효과</th><th>근거</th></tr></thead>
          <tbody>${items.map(item => eventRow(item, offers, options.escape)).join('')}</tbody></table></div>`;
      }
      if (cursor) {
        button.textContent = '변화 기록 더 보기';
        button.hidden = false;
      }
    } catch (error) {
      if (!details.isConnected) return;
      status.textContent = '가격·상태 변화 조회 실패 · ' + error.message;
      button.textContent = '다시 시도';
      button.hidden = false;
    } finally {
      loading = false;
    }
  }

  button.onclick = load;
  details.ontoggle = () => {
    if (!details.isConnected) return;
    keepOpen = details.open;
    if (details.open && !started) load();
  };
  if (details.open) load();
}
