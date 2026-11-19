// BE 167655a: from inclusive, to exclusive, <=731 days per request.
export async function fetchHistory(request, modelId, from, to, paginate = true) {
  const start = Date.parse(from), end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    throw Error('조회 시작일과 종료일을 확인하세요.');
  const merged = new Map();
  for (let at = start; at < end; at += 730 * 86400000) {
    const until = Math.min(end, at + 730 * 86400000);
    let cursor = null;
    const seen = new Set();
    do {
      const params = new URLSearchParams({modelId: String(modelId), from: new Date(at).toISOString(), to: new Date(until).toISOString()});
      if (paginate) params.set('limit', '50');
      if (cursor) params.set('cursor', cursor);
      const response = await request('/api/v1/market/price-histories?' + params);
      if (!response.isSuccess || !Array.isArray(response.result?.series))
        throw Error(response.message || '가격 이력 응답을 확인할 수 없습니다.');
      for (const series of response.result.series) {
        const key = series.offerId ?? series.seriesId;
        const prior = merged.get(key);
        if (prior) prior.points.push(...series.points);
        else merged.set(key, {...series, points: [...series.points]});
      }
      cursor = response.result.nextCursor || null;
      if (cursor && seen.has(cursor)) throw Error('가격 이력 페이지가 반복되어 조회를 중단했습니다.');
      seen.add(cursor);
    } while (cursor);
  }
  return [...merged.values()];
}

export async function fetchModelHistories(request, models, from, to, paginate = true) {
  const settled = await Promise.allSettled(models.map(model => fetchHistory(request, model.id, from, to, paginate)));
  return {series: settled.flatMap(r => r.status === 'fulfilled' ? r.value : []),
    failures: settled.flatMap((r, i) => r.status === 'rejected' ? [{model: models[i].name, reason: r.reason.message}] : [])};
}
