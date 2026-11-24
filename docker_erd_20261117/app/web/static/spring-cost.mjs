const itemType = {
  server: 'ACQUISITION', memory: 'MEMORY', network: 'NETWORK_STORAGE',
  rack: 'RACK_FACILITY', rent: 'RENT', ops: 'OPERATIONS'
};
const itemLabel = {
  ACQUISITION: '서버·GPU', MEMORY: '별도 메모리', NETWORK_STORAGE: '네트워크·스토리지',
  RACK_FACILITY: '랙·전원·냉각 설비', RENT: '임차료', OPERATIONS: '운영·유지보수',
  FINANCING: '조달 금리', ELECTRICITY: '전기료'
};
const itemStatus = {
  missing: 'NOT_INCLUDED', user: 'USER_INPUT',
  public: 'PUBLIC_SOURCE', included: 'INCLUDED_IN_OTHER'
};
const periods = { once: 'ONE_TIME', month: 'MONTH', year: 'YEAR' };
const decimal = value => value == null || value === '' ? null : String(value);
const fraction = value => Number.isFinite(value) ? Number(value.toFixed(8)).toString() : null;

export async function costModels(request) {
  const response = await request('/api/v1/catalog');
  if (!response?.isSuccess || !Array.isArray(response.result?.models)) {
    throw new Error('GPU 모델 목록을 읽을 수 없습니다.');
  }
  return response.result.models;
}

export function costPayload(input) {
  const acquisition = input.items.find(item => item.id === 'server');
  if (!acquisition || !['user', 'public'].includes(acquisition.state) || acquisition.period !== 'once'
      || acquisition.amount == null || acquisition.amount === '') {
    throw new Error('서버·GPU 취득비를 일회성 투자로 입력하세요.');
  }
  const items = input.items.map(item => {
    if (item.state === 'included' && (!itemType[item.includedIn] || item.id === item.includedIn)) {
      throw new Error((item.name || itemLabel[itemType[item.id]]) + ': 실제 비용을 입력한 상위 항목을 선택하세요.');
    }
    const reflected = item.state === 'user' || item.state === 'public';
    let asset = {};
    if (input.capitalMode === 'asset' && reflected && item.period === 'once') {
      const life = Number(item.usefulLifeYears), residual = Number(item.residualValueUsd);
      if (!Number.isInteger(life) || life < 1 || life > 100 || item.residualValueUsd == null
          || item.residualValueUsd === '' || !Number.isFinite(residual) || residual < 0) {
        throw new Error((item.name || itemLabel[itemType[item.id]]) + ': 내용연수(1~100년 정수)와 잔존가치(0도 입력)를 확인하세요.');
      }
      asset = { usefulLifeYears: life, residualValueUsd: decimal(item.residualValueUsd) };
    }
    return {
      ...asset,
      itemType: itemType[item.id], status: itemStatus[item.state], amount: decimal(item.amount),
      currency: reflected ? item.currency : null, period: reflected ? periods[item.period] : null,
      referenceDate: item.date || null, sourceUrl: item.state === 'public' ? item.source || null : null,
      includedInItemType: item.state === 'included' ? itemType[item.includedIn] : null
    };
  });
  const loanRate = fraction(input.rate);
  items.push({ itemType: 'FINANCING', status: loanRate == null ? 'NOT_INCLUDED' : 'USER_INPUT' });
  let electricity = null;
  if (input.electricity) {
    const { mode, kw, pue, tariff, includedIn, amount, currency } = input.electricity;
    if (mode === 'separate') {
      electricity = { itPowerKw: decimal(kw), pue: decimal(pue), krwPerKwh: decimal(tariff) };
    } else if (mode === 'amount') {
      // 청구서에 찍힌 전기료 금액을 연 운영비로 그대로 반영한다 (kW·PUE·단가 계산 대신).
      if (amount == null || amount === '' || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
        throw new Error('전기료 연 금액을 입력하세요.');
      }
      items.push({ itemType: 'ELECTRICITY', status: 'USER_INPUT', amount: decimal(amount),
        currency: currency || 'USD', period: 'YEAR' });
    } else if (mode === 'included') {
      items.push({ itemType: 'ELECTRICITY', status: 'INCLUDED_IN_OTHER',
        includedInItemType: itemType[includedIn] });
    } else {
      items.push({ itemType: 'ELECTRICITY', status: 'NOT_INCLUDED' });
    }
  }
  if (input.period === 'month' && !input.month) throw new Error('적용 월을 선택하세요.');
  if (input.electricity?.mode === 'included') {
    const owner = input.items.find(item => item.id === input.electricity.includedIn);
    if (!owner || !['user', 'public'].includes(owner.state) || !['month', 'year'].includes(owner.period)) {
      throw new Error('전기료가 포함된 운영비 항목을 선택하고 금액을 입력하세요.');
    }
  }
  return {
    modelId: input.modelId,
    items,
    assumptions: {
      gpuCount: input.gpu, depreciationYears: input.capitalMode === 'asset' ? Number(acquisition.usefulLifeYears) : input.years, utilization: fraction(input.util),
      annualInterestRate: loanRate, interestRateType: loanRate == null ? 'NOT_APPLIED' : 'ASSUMED',
      residualValueUsd: input.capitalMode === 'asset' ? null : decimal(input.salvage), calendarMonth: input.period === 'month' ? input.month : null,
      costProfile: 'SCREEN_SCENARIO'
    },
    pricing: { method: input.marginType === 'profit' ? 'REVENUE_MARGIN' : 'COST_MARKUP', targetRate: fraction(input.margin) },
    inputFxKrwPerUsd: decimal(input.fx),
    marketFilters: input.marketFilters ?? null,
    electricity
  };
}

export async function calculateCost(request, input) {
  const response = await request('/api/v1/cost-simulations', costPayload(input));
  const r = response?.result;
  if (!response?.isSuccess || r?.unit !== 'USD/GPU-hour' || r.saved !== false) {
    throw new Error('원가 계산 응답을 읽을 수 없습니다.');
  }
  const a = r.appliedAssumptions;
  if (input.capitalMode === 'asset' && (!a.assetSpecificLives || !a.capitalAssets?.length)) {
    throw new Error('자산별 내용연수가 계산에 반영되지 않았습니다. 계산 서버 버전을 확인하세요.');
  }
  return {
    unit: Number(r.hourlyCost), candidate: Number(r.candidatePrice), annual: Number(r.annualCost),
    capex: Number(a.acquisitionCostUsd), opex: Number(a.annualOperatingCostUsd),
    otherOpex: Number(a.annualOperatingCostExcludingMeteredElectricityUsd),
    capitalAnnual: Number(a.annualCapitalRecoveryUsd), crf: a.capitalRecoveryFactor == null ? null : Number(a.capitalRecoveryFactor),
    annualDepreciation: a.annualStraightLineDepreciationUsd == null ? null : Number(a.annualStraightLineDepreciationUsd),
    assetSpecificLives: a.assetSpecificLives === true,
    capitalAssets: (a.capitalAssets || []).map(asset => ({
      type: asset.itemType, label: itemLabel[asset.itemType] || '전체 투자 (공통 가정)',
      years: asset.usefulLifeYears, capex: Number(asset.acquisitionCostUsd), salvage: Number(asset.residualValueUsd),
      crf: Number(asset.capitalRecoveryFactor), capitalAnnual: Number(asset.annualCapitalRecoveryUsd),
      annualDepreciation: Number(asset.annualStraightLineDepreciationUsd)
    })),
    salvage: Number(a.residualValueUsd), rate: Number(a.annualInterestRateUsed),
    gpu: a.gpuCount, years: a.depreciationYears, util: Number(a.utilization),
    period: a.calendarMonth ? 'month' : 'year', month: a.calendarMonth,
    periodCost: Number(r.periodCost), periodHours: r.periodHours, hours: Number(r.billableGpuHoursForPeriod),
    periodElectricity: Number(r.periodElectricityCost),
    missing: r.missingItems.map(key => itemLabel[key] || key), incomplete: r.costCompleteness === 'INCOMPLETE',
    negativeMargin: r.warnings.includes('NEGATIVE_TARGET_RATE'),
    nonPositiveCandidate: r.warnings.includes('NON_POSITIVE_CANDIDATE_PRICE'),
    estimatedMarginRate: r.estimatedMarginRate,
    disclaimer: r.disclaimer,
    version: r.formulaVersion, marketComparison: r.marketComparison, formula: r.formulaSummary
  };
}

const marketFields = [
  'providerType', 'countryCode', 'regionCode', 'systemType', 'serviceOption', 'gpuCount',
  'contractType', 'commitmentMonths', 'contractProductType', 'intraNodeInterconnect', 'paymentOption'
];

export function marketChoices(groups) {
  const choices = new Map();
  for (const { groupKey } of groups) {
    const scope = Object.fromEntries(marketFields.filter(key => groupKey[key] != null)
      .map(key => [key, groupKey[key]]));
    if (marketFields.some(key => key !== 'commitmentMonths' && scope[key] == null)) continue;
    const value = JSON.stringify(scope);
    const plan = { ON_DEMAND: '온디맨드', SPOT: '스팟', COMMITMENT: '약정' }[scope.contractType];
    const label = [scope.regionCode, scope.providerType === 'GENERAL_CLOUD' ? '종합 클라우드' : 'GPU 전문 클라우드',
      plan, scope.commitmentMonths ? scope.commitmentMonths + '개월' : null,
      scope.gpuCount + ' GPU', scope.contractProductType, scope.paymentOption].filter(Boolean).join(' · ');
    choices.set(value, {value, label});
  }
  return [...choices.values()];
}

export function bindMarketScope(form, request, { model, gpu, market, savedScope }) {
  const select = market;
  let revision = 0;
  let refreshTimer;
  async function refresh(preferred) {
    const ticket = ++revision;
    select.replaceChildren(new Option('시장 비교 생략', ''));
    if (!model.value || !Number.isInteger(Number(gpu.value)) || Number(gpu.value) <= 0) return;

    const params = new URLSearchParams({modelId: model.value, gpuCount: gpu.value});
    select.append(new Option('비교 조건 조회 중', '', false, false));
    select.lastElementChild.disabled = true;
    try {
      const response = await request('/api/v1/market/summaries?' + params);
      if (ticket !== revision || !form.isConnected) return;
      select.lastElementChild.remove();
      if (!response?.isSuccess || !Array.isArray(response.result?.groups)) throw Error();
      const choices = marketChoices(response.result.groups);
      for (const { value, label } of choices) {
        select.append(new Option(label, value, false, value === preferred));
      }
      if (!choices.length) {
        const unavailable = new Option('비교 가능한 저장 가격 없음', '');
        unavailable.disabled = true;
        select.append(unavailable);
      }
    } catch {
      if (ticket !== revision || !form.isConnected) return;
      select.replaceChildren(new Option('비교 조건 조회 실패 · 계산만 진행', ''));
    }
  }
  model.addEventListener('change', () => {
    clearTimeout(refreshTimer);
    refresh();
  });
  gpu.addEventListener('input', () => {
    clearTimeout(refreshTimer);
    revision++;
    select.replaceChildren(new Option('시장 비교 생략', ''));
    refreshTimer = setTimeout(() => refresh(), 180);
  });
  refresh(savedScope ? JSON.stringify(savedScope) : null);
}

export function showCostMarket(output, comparison) {
  const headline = document.createElement('p');
  const status = {
    OK: '동일 조건 시장 비교',
    NOT_REQUESTED: '동일 조건 시장 비교를 선택하지 않았습니다.',
    NOT_AVAILABLE: '동일 조건의 공개 가격이 아직 확보되지 않았습니다.'
  }[comparison?.status];
  headline.textContent = status || '시장 비교 결과를 확인할 수 없습니다.';
  output.replaceChildren(headline);
  if (comparison?.status !== 'OK') return;

  for (const group of comparison.groups) {
    const { groupKey, sampleCounts, offerResults } = group;
    const caption = document.createElement('p');
    caption.textContent = groupKey.regionCode + ' · ' + groupKey.gpuCount + ' GPU · '
      + (groupKey.vcpuCount == null ? '' : groupKey.vcpuCount + ' vCPU · ')
      + (groupKey.ramGb == null ? '' : groupKey.ramGb + ' GB RAM · ')
      + sampleCounts.providerCount + '개 사업자 / ' + sampleCounts.offerCount + '개 오퍼';
    output.append(caption);

    const sources = new Map(group.sources.map(source => [source.evidenceId, source]));
    const list = document.createElement('ul');
    for (const offer of offerResults) {
      const row = document.createElement('li');
      const margin = offer.estimatedMargin == null ? '마진 미산출'
        : '예상 이익률 ' + (Number(offer.estimatedMargin) * 100).toFixed(2) + '%';
      row.append(offer.price.amount + ' USD/GPU·시간 · ' + margin);
      if (offer.collectedAt) {
        const time = document.createElement('time');
        time.dateTime = offer.collectedAt;
        time.textContent = new Date(offer.collectedAt).toLocaleString('ko-KR', {
          timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'medium'
        }) + ' KST';
        row.append(' · 수집 ', time);
      }
      for (const id of offer.evidenceIds) {
        const source = sources.get(id);
        if (!source) continue;
        const link = document.createElement('a');
        link.href = source.sourceUrl;
        link.textContent = source.sourceName;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        row.append(' · ', link);
      }
      list.append(row);
    }
    output.append(list);
  }
}
