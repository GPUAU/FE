/* Public exchange-rate response only. Bank credentials stay on the server. */
(function (root) {
  function positiveNumber(value) {
    if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }
  function safeSourceUrl(value) {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }
  function normalizeFx(envelope, now = Date.now()) {
    if (envelope?.isSuccess !== true || !envelope.result) throw new Error('Invalid FX response');
    const r = envelope.result;
    if (r.status === 'NOT_AVAILABLE') return {status: 'unavailable', rate: null, stale: false, warnings: [], reason: '저장된 환율이 없습니다. 환율이 준비되면 다시 조회해 주세요.'};
    const rate = positiveNumber(r.rate);
    const date = typeof r.referenceDate === 'string' ? r.referenceDate : '';
    const reference = Date.parse(date + 'T00:00:00Z');
    const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
    if (r.status !== 'AVAILABLE' || r.baseCurrency !== 'USD' || r.quoteCurrency !== 'KRW' || rate === null || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(reference) || new Date(reference).toISOString().slice(0, 10) !== date || date > today) {
      throw new Error('Invalid USD/KRW quote');
    }
    return {
      status: 'available',
      rate: {rate, reference_date: date, collected_at: r.collectedAt || null, source_name: r.source?.name || null, source_url: safeSourceUrl(r.source?.url)},
      stale: (Date.parse(today + 'T00:00:00Z') - reference) / 86400000 > 4,
      warnings: Array.isArray(r.warnings) ? r.warnings.filter(x => typeof x === 'string') : [],
      reason: null,
    };
  }
  function appliedRate(fx, manual) {
    const rate = positiveNumber(manual);
    if (rate !== null) return {rate, manual: true};
    return {rate: fx?.status === 'available' ? positiveNumber(fx.rate?.rate) : null, manual: false};
  }
  function krwText(usd, fx, manual) {
    if (usd === null || usd === undefined || String(usd).trim() === '' || !Number.isFinite(Number(usd))) return '';
    const applied = appliedRate(fx, manual);
    if (applied.rate === null) return fx?.status === 'failed' ? '원화 환산 불가 · 환율 조회 실패' : '원화 환산 대기 · 환율 미확보';
    const amount = Number(usd) * applied.rate;
    if (!Number.isFinite(amount)) return '원화 환산 범위 초과';
    return Math.round(amount).toLocaleString('ko-KR') + '원 · ' + (applied.manual ? '사용자 가정' : '표시 환율 기준');
  }
  async function fetchLatestFx({fetchImpl = root.fetch.bind(root), timeoutMs = 8000, now = Date.now()} = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl('/api/v1/exchange-rates/latest', {headers: {Accept: 'application/json'}, cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw new Error('FX HTTP failure');
      return normalizeFx(await response.json(), now);
    } catch {
      return {status: 'failed', rate: null, stale: false, warnings: [], reason: '환율을 조회하지 못했습니다. 다시 조회하거나 사용자 환율을 입력해 주세요.'};
    } finally { clearTimeout(timer); }
  }
  const api = {positiveNumber, normalizeFx, appliedRate, krwText, fetchLatestFx};
  root.GpuFx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
