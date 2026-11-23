/* Spring-backed data for screens written against the legacy compatibility API.
 * home-overview.js and research-workspace.js read {models, providers} and comparison
 * candidates. The deployed site has no legacy server, so build the same shape from
 * /api/v1/catalog and /api/v1/market/offers, and fall back to the legacy API only
 * when Spring is unavailable (local preview without the backend). */
let springLegacyPending = null;

async function springLegacyLoad() {
  const [client, catalog] = await Promise.all([import('/static/spring-market-client.mjs'), springMarketCatalog()]);
  const perModel = await Promise.all(catalog.models.map(async model => {
    const raw = await client.fetchMarketOffers(api, {modelId: model.id, includeStale: 'true'});
    return cpSpringRows(raw, model, client).map((row, index) => {
      const stale = client.mapMarketOffer(raw[index]).freshness === 'STALE';
      return {...row, is_stale: stale, comparison_reasons: {strict: row.comparison_reasons.strict, region_excluded: row.comparison_reasons.strict}};
    });
  }));
  return {
    market: {models: catalog.models.map(item => item.name), providers: Object.fromEntries(catalog.providers.map(item => [item.id, item.name]))},
    comparison: {candidates: perModel.flat()},
  };
}

/* Resolves to {market:{models, providers}, comparison:{candidates}}. */
function springLegacyData() {
  if (!springLegacyPending) {
    const pending = springLegacyLoad()
      .catch(() => Promise.all([marketData(), api('/api/erd/comparison')]).then(([market, comparison]) => ({market, comparison})));
    pending.catch(() => { if (springLegacyPending === pending) springLegacyPending = null; });
    springLegacyPending = pending;
  }
  return springLegacyPending;
}
