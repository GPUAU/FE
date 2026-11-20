import {fetchMarketCatalog, fetchMarketOffers} from './spring-market-client.mjs';

export const isContractOffer = type => type === 'SPOT' || type === 'COMMITMENT';

export function contractTerm(offer) {
  if (offer.months > 0) return String(offer.months);
  return offer.contractType === 'COMMITMENT' ? 'UNKNOWN' : 'NONE';
}

export function matchesContractTerms(offer, {type = 'ALL', term = 'ALL'}) {
  return (type === 'ALL' || offer.contractProductType === type) &&
    (term === 'ALL' || contractTerm(offer) === term);
}

export async function fetchContractCatalog(request) {
  const {models, providers} = await fetchMarketCatalog(request);
  const items = await fetchMarketOffers(request, {includeStale: true});
  const modelIds = new Set(models.map(model => model.id));
  const providerIds = new Set(providers.map(provider => provider.id));
  const products = new Map();

  for (const item of items) {
    if (!item.productId || !item.product || !modelIds.has(item.modelId) || !providerIds.has(item.providerId)) continue;
    if (!products.has(item.productId)) {
      const {sku, originalProductName, regionCode, gpuCount, configurationVersion} = item.product;
      products.set(item.productId, {
        id: item.productId, modelId: item.modelId, modelName: item.modelName,
        providerId: item.providerId, providerName: item.providerName,
        sku, originalProductName, regionCode, gpuCount, configurationVersion, offers: new Map(),
      });
    }
    const observation = item.lastSuccessfulObservation;
    products.get(item.productId).offers.set(item.offerId, {
      contractType: item.contract.type,
      contractProductType: item.contract.productType,
      months: item.contract.months,
      eligible: item.comparison?.eligibleForAggregate === true,
      observation: observation && {
        observationId: observation.observationId,
        rawPriceText: observation.rawPriceText,
        components: observation.components ?? [],
        evidence: (observation.evidence ?? []).map(({role, sourceName, sourceUrl}) => ({role, sourceName, sourceUrl})),
      },
    });
  }

  return {models, providers, products: filterContractProducts([...products.values()], {})};
}

export function filterContractProducts(products, filters) {
  const {modelId = 'ALL', providerId = 'ALL'} = filters;
  return products.flatMap(product => {
    if ((modelId !== 'ALL' && product.modelId !== modelId) ||
        (providerId !== 'ALL' && product.providerId !== providerId)) return [];
    const contracts = [...product.offers.values()].filter(offer =>
      isContractOffer(offer.contractType) && matchesContractTerms(offer, filters));
    if (!contracts.length) return [];
    return [{product, score: contracts.filter(offer => offer.eligible).length}];
  }).sort((a, b) => b.score - a.score).map(({product}) => product);
}

export async function fetchContractComparison(request, product) {
  const path = '/api/v1/market/products/' + encodeURIComponent(product.id) + '/contracts?currency=USD';
  const response = await request(path);
  const data = response?.result;
  if (!response?.isSuccess || data?.productId !== product.id || !Array.isArray(data.items) || !Array.isArray(data.discounts)) {
    throw Error(response?.message || '상품별 계약 비교 응답을 확인할 수 없습니다.');
  }
  const discounts = new Map(data.discounts.map(discount => [discount.commitmentOfferId, discount]));
  const items = data.items.map(item => {
    const observation = product.offers.get(item.offerId)?.observation;
    return {
      ...item,
      term: contractTerm(item),
      observation: observation?.observationId === item.observationId ? observation ?? null : null,
      discount: discounts.get(item.offerId) ?? null,
    };
  });
  const baselineId = data.discounts.find(discount => discount.baseOfferId)?.baseOfferId;
  const baseline = items.find(item => item.offerId === baselineId && item.contractType === 'ON_DEMAND') ?? null;
  return {...data, items, baseline};
}
