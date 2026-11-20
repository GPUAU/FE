export function latestObservation(points) {
  return [...points].filter(p => Number.isFinite(Date.parse(p.collectedAt))).sort((a,b) => Date.parse(b.collectedAt)-Date.parse(a.collectedAt))[0] ?? null;
}
export function freshness(at, now=Date.now()) {
  const time=Date.parse(at);
  if (!Number.isFinite(time) || time > now) return '시각 확인 필요';
  return now-time > 48*60*60*1000 ? '오래된 값' : '최신';
}
export function safeUrl(url) {
  try { const u=new URL(url); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
