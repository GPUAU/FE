const route = '/api/v1/market';

async function marketResult(request, path, filters = {}) {
  const query = new URLSearchParams(filters).toString();
  const envelope = await request(query ? path + '?' + query : path);
  if (envelope?.isSuccess !== true || !envelope.result) {
    throw new Error(envelope?.message || '가격 조회 응답을 확인할 수 없습니다.');
  }
  return envelope.result;
}

export function marketTerm(term) {
  if (term === '1_YEAR' || term === '3_YEAR') {
    return {contractType: 'COMMITMENT', commitmentMonths: term === '1_YEAR' ? '12' : '36'};
  }
  return {contractType: term};
}

export async function fetchMarketCatalog(request) {
  const result = await marketResult(request, '/api/v1/catalog');
  if (!Array.isArray(result.models) || !Array.isArray(result.providers)) throw new Error('카탈로그 응답을 확인할 수 없습니다.');
  return result;
}

export async function fetchMarketOffers(request, filters = {}) {
  const items = [], seen = new Set();
  let cursor;
  do {
    const result = await marketResult(request, route + '/offers', {...filters, limit: 100, ...(cursor ? {cursor} : {})});
    if (!Array.isArray(result.items)) throw new Error('상품 목록 응답을 확인할 수 없습니다.');
    items.push(...result.items);
    cursor = result.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('상품 목록 페이지가 반복되어 조회를 중단했습니다.');
    seen.add(cursor);
  } while (cursor);
  return items;
}

export async function fetchMarketSummary(request, filters) {
  const result = await marketResult(request, route + '/summaries', filters);
  if (!Array.isArray(result.groups) || !result.excludedSummary) throw new Error('시장 요약 응답을 확인할 수 없습니다.');
  return result;
}

export async function fetchMarketOffer(request, offerId) {
  const result = await marketResult(request, route + '/offers/' + encodeURIComponent(offerId));
  if (!result.offer || String(result.offer.offerId) !== String(offerId)) throw new Error('상품 상세 응답을 확인할 수 없습니다.');
  return result;
}

export function marketGroupId(key) {
  return key ? JSON.stringify(Object.entries(key).sort(([left], [right]) => left.localeCompare(right))) : '';
}

export function mapMarketOffer(offer) {
  const product = offer.product ?? {}, contract = offer.contract ?? {};
  const observation = offer.lastSuccessfulObservation;
  const price = observation?.effective;
  const normalizationId = price?.normalizationId || observation?.nominal?.normalizationId || 'none';
  const source = observation?.evidence?.[0];
  const hourly = (observation?.components || []).filter(component => component.type === 'HOURLY_RATE');
  const term = contract.type === 'COMMITMENT'
    ? ({12: '1_YEAR', 36: '3_YEAR'}[contract.months] || 'OTHER')
    : contract.type;
  return {
    id: offer.offerId, productId: offer.productId, modelId: offer.modelId, model: offer.modelName,
    providerId: offer.providerId, provider: offer.providerName, providerType: offer.providerType,
    product: product.originalProductName || product.sku, region: product.regionCode, country: product.countryCode,
    gpus: product.gpuCount, configuration: product, contract: contract.productType, contractInfo: contract, term,
    price: price?.status === 'OK' ? price.amount : null, collected: observation?.collectedAt,
    observationId: observation?.observationId, rawPriceText: observation?.rawPriceText,
    observation: observation?.observationId ? 'spring-' + observation.observationId + '-' + normalizationId : null,
    source: source?.sourceUrl, sourceName: source?.sourceName, hourlyComponent: hourly.length === 1 ? hourly[0] : null,
    certainty: observation?.priceCertainty, disclosure: offer.latestDisclosure?.status,
    freshness: offer.freshness?.status, eligible: offer.comparison?.eligibleForAggregate === true,
    group: marketGroupId(offer.comparison?.groupKey), excludedReasons: offer.comparison?.excludedReasons ?? [],
  };
}

export function getPairPrice(row) {
  if (row?.price == null || String(row.price).trim() === '' || row.freshness !== 'CURRENT'
    || row.excludedReasons?.some(reason => [
      'notFoundOffers', 'nonExactOffers', 'missingPriceOffers', 'unavailableNormalizationOffers',
    ].includes(reason))) return null;
  const price = Number(row.price);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function pickPairOffer(options, offerId) {
  return options.find(row => row.id === offerId)
    || options.find(row => getPairPrice(row) !== null)
    || options[0];
}

export function pairPriceGap(left, right) {
  const a = getPairPrice(left), b = getPairPrice(right);
  if (a === null || b === null) return null;
  return {amount: b - a, percent: a === 0 ? null : (b - a) / a * 100};
}

export function compareMarketObservationTime(left, right) {
  const timestamp = value => {
    const millis = Date.parse(value);
    return Number.isFinite(millis) ? millis : -Infinity;
  };
  return (timestamp(right.collected) - timestamp(left.collected)) || 0;
}
