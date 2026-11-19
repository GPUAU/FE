export function mapSeries(series) {
  return series.flatMap(s => (s.points || []).filter(p => p.status === 'OK' && p.effectiveUsdGpuHour != null).map(p => ({
    observation_id:`spring-${p.observationId}-${p.normalizationId || 'none'}`,offer_id:s.offerId,
    provider_name:s.providerName,model_name:s.modelName,original_product_name:s.originalProductName ?? null,configuration_version:s.configurationVersion ?? null,
    region_code:s.regionCode,gpu_count:s.gpuCount,contract_type:s.contractType,
    term:s.contractType==='COMMITMENT'?(s.commitmentMonths===12?'1_YEAR':s.commitmentMonths===36?'3_YEAR':'OTHER'):s.contractType,
    commitment_months:s.commitmentMonths,payment_option:s.paymentOption,contract_product_type:s.contractProductType ?? null,
    series_key:`offer-${s.offerId}`,chart_at:p.collectedAt,collected_at:p.collectedAt,
    price:Number(p.effectiveUsdGpuHour),effective_usd_gpu_hour:p.effectiveUsdGpuHour,rule_version:p.ruleVersion ?? null,
    nominal_usd_gpu_hour:null,result_status:'success',source_kind:'spring',source_label:p.evidenceRoles?.includes('aggregator')?'집계 스냅샷':p.sourceNames?.some(n=>n.includes('history'))?'공식 과거 자료':'Spring 저장 관측',
    verification_label:p.evidenceRoles?.includes('aggregator')?'집계 출처 · 공식 원천 대조 여부는 상세 참조':'원천 확인 여부는 상세 참조',retrieved_at:null,original_url:p.sourceUrls?.[0] ?? null,archive_url:null,
    original_currency:null,original_time_unit:null,price_applies_to:null
  })));
}
