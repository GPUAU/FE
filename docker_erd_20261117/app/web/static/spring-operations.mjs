export function fxRequest(observationId, normalizationId, rate) {
  const value=String(rate).trim();
  if (!/^[1-9][0-9]{0,18}$/.test(String(observationId)) || !/^[1-9][0-9]{0,18}$/.test(String(normalizationId))) throw new Error('해당 관측의 환산 ID가 필요합니다.');
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(value) || Number(value)<=0) throw new Error('환율은 0보다 크고 소수점 6자리 이내여야 합니다.');
  return {items:[{observationId:String(observationId),normalizationId:String(normalizationId)}],priceType:'EFFECTIVE',krwPerUsd:value};
}
export function alertRows(envelope) {
  if (!envelope?.isSuccess || !Array.isArray(envelope?.result?.items)) throw new Error(envelope?.message || '경고 목록을 읽을 수 없습니다.');
  return {items:envelope.result.items,nextCursor:envelope.result.nextCursor || null,asOf:envelope.result.asOf};
}
