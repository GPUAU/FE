// Supplemental sensitivity only. The submitted cost and market comparison come from Spring.
export function annualRecovery(capex, salvage, years, rate) {
  if (![capex, salvage, years, rate].every(Number.isFinite) || capex < 0 || salvage < 0
      || salvage > capex || !Number.isInteger(years) || years < 1 || years > 100 || rate < 0 || rate > 1) {
    throw new Error('자본회수 가정을 확인하세요.');
  }
  if (rate === 0) return (capex - salvage) / years;
  // Stable near zero: r / (1 - (1+r)^-n).
  const exponent = -years * Math.log1p(rate);
  return (capex - salvage * Math.exp(exponent)) * rate / -Math.expm1(exponent);
}

export function costBreakdown(result) {
  const annualHours = result.gpu * 8760 * result.util;
  return {
    cashUnit: result.opex / annualHours,
    depreciationUnit: result.annualDepreciation == null ? null : (result.annualDepreciation + result.opex) / annualHours,
    economicUnit: (result.capitalAnnual + result.opex) / annualHours
  };
}

export function canTransferCost(result) {
  return !result.nonPositiveCandidate && (!result.assetSpecificLives
    || result.capitalAssets.every(asset => asset.years === result.years));
}

export function sensitivity(result) {
  const itTypes = new Set(['ACQUISITION', 'MEMORY', 'NETWORK_STORAGE']);
  return [3, 5, 7].map(years => {
    const annualCapital = result.capitalAssets.reduce((sum, asset) => sum + annualRecovery(
      asset.capex, asset.salvage, !result.assetSpecificLives || itTypes.has(asset.type) ? years : asset.years, result.rate), 0);
    return { years, values: [.60, .75, .85].map(util => (annualCapital + result.opex) / (result.gpu * 8760 * util)) };
  });
}

export function renderCostEconomics(result, { money, escape }) {
  const { cashUnit, depreciationUnit } = costBreakdown(result);
  if (!result.capitalAssets.length || depreciationUnit == null) return '';
  return `<section class="cost-economics"><h3>원가 구성과 감가상각</h3>
    <p>자본회수비용에는 투자금 회수와 자본비용이 포함됩니다. 아래 정액 감가상각비를 자본회수비용에 다시 더하지 않습니다.</p>
    <div class="v02-results"><div>현금 운영비 기준<strong>${money(cashUnit)}</strong><span>USD / GPU·시간 · 투자금 회수 제외</span></div>
    <div>정액 감가상각 포함 참고 원가<strong>${money(depreciationUnit)}</strong><span>USD / GPU·시간 · 감가상각 + 현금 운영비</span></div></div>
    <div class="mv-tablebox" tabindex="0" role="region" aria-label="자산별 연간 비용"><table class="mv-table"><thead><tr><th>자산</th><th>내용연수</th><th>취득비 (USD)</th><th>종료 잔존가치 (USD)</th><th>연 정액 감가상각비</th><th>연 자본회수비용</th></tr></thead><tbody>
    ${result.capitalAssets.map(asset => `<tr><td>${escape(asset.label)}</td><td>${asset.years}년</td><td>${money(asset.capex)}</td><td>${money(asset.salvage)}</td><td>${money(asset.annualDepreciation)}</td><td>${money(asset.capitalAnnual)}</td></tr>`).join('')}
    </tbody></table></div><p>연 정액 감가상각 합계 ${money(result.annualDepreciation)} · 연 자본회수비용 ${money(result.capitalAnnual)} · 연 현금 운영비 ${money(result.opex)} (전기료 포함 여부는 입력 기준).</p>
    <p>정액 감가상각 참고값 = (취득비 − 잔존가치) ÷ 내용연수. 세법상 상각액·재무제표상 비용을 확정하는 계산은 아닙니다. 서로 다른 내용연수를 연간 비용으로 환산한 비교이며, 특정 사업기간의 교체투자 현금흐름 예측이 아닙니다. 모든 비교는 연 8,760시간 기준입니다.</p>
    <details><summary>내용연수·가동률에 따른 시간당 원가 비교</summary>
    <p>${result.assetSpecificLives ? '서버·GPU, 별도 메모리, 네트워크·스토리지' : '전체 투자'}의 내용연수를 바꾼 입력 가정 민감도입니다. ${result.assetSpecificLives ? '시설과 그 외 자산의 내용연수는 입력값으로 유지합니다. ' : ''}취득비·종료 잔존가치·자본비용률·연 현금 운영비·평균 IT 전력은 고정하며, 미래 시세 예측이 아닙니다.</p>
    <table class="mv-table"><caption>자본회수비용 + 현금 운영비 · USD / GPU·시간</caption><thead><tr><th>${result.assetSpecificLives ? 'IT ' : '공통 '}내용연수</th><th>유료 가동률 60%</th><th>75%</th><th>85%</th></tr></thead><tbody>
    ${sensitivity(result).map(row => `<tr><td>${row.years}년</td>${row.values.map(value => `<td>${money(value)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></details></section>`;
}
