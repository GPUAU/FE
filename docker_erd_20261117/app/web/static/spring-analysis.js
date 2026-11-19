(function (root) {
  'use strict';

  const labels = {
    modelId: 'GPU 모델', 'assumptions.gpuCount': 'GPU 수',
    'assumptions.depreciationYears': '사용연수', 'assumptions.utilization': '유료 가동률',
    'assumptions.annualInterestRate': '연 자본비용률',
    'assumptions.residualValueUsd': '말기 잔존가치', 'assumptions.calendarMonth': '적용 월',
    'pricing.targetRate': '목표 마진', inputFxKrwPerUsd: '비용 환산용 환율',
    electricity: '전기료', 'electricity.itPowerKw': '전체 IT 전력',
    'electricity.pue': 'PUE', 'electricity.krwPerKwh': '전기단가',
    investment: '초기 투자금', analysisYears: '분석 기간', residualValue: '말기 잔존가치',
    targetIrr: '목표 IRR', 'candidatePrices[0]': '판매가격', marketFilters: '동일 조건 시장',
    items: '원가 항목', message: '질문'
  };
  const costLabels = {
    ACQUISITION: '서버·GPU', MEMORY: '별도 메모리', NETWORK_STORAGE: '네트워크·스토리지',
    RACK_FACILITY: '랙·전원·냉각 설비', RENT: '임차료', OPERATIONS: '운영·유지보수',
    FINANCING: '연 자본비용률', ELECTRICITY: '전기료'
  };
  const itemFields = {
    amount: '금액', currency: '통화', period: '기간', sourceUrl: '출처',
    referenceDate: '기준일', includedInItemType: '상위 항목'
  };

  function validationMessage(body, errors) {
    const fields = (errors || []).map(error => {
      const path = String(error.field || '').replace(/^costInput\./, '');
      const item = /^items\[(\d+)\](?:\.(\w+))?$/.exec(path);
      const category = item && (body?.costInput || body)?.items?.[Number(item[1])]?.itemType;
      const label = item
        ? [costLabels[category] || '원가 항목', itemFields[item[2]]].filter(Boolean).join(' ')
        : labels[path];
      return label ? label + ': ' + error.reason : null;
    }).filter(Boolean);
    return fields.length ? [...new Set(fields)].join(' · ')
      : '입력값과 자릿수, 필수 조건을 확인하세요.';
  }

  async function requestEnvelope(path, body, fetcher = fetch) {
    const options = body === undefined
      ? { cache: 'no-store' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    let response;
    try {
      response = await fetcher(path, options);
    } catch {
      throw new Error('Spring 서버에 연결하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.');
    }
    if (response.status === 403 || response.status === 404) {
      const name = path.endsWith('/irr-simulations') ? 'IRR' : '공개가격 조회';
      throw new Error(`현재 Spring 서버에서 ${name} API를 사용할 수 없습니다.`);
    }
    const envelope = await response.json().catch(() => null);
    if (envelope?.code === 'SENSITIVE_INPUT_BLOCKED') {
      throw new Error('비공개 원가나 협상 정보는 제외하고 공개가격만 질문하세요.');
    }
    if (!response.ok || !envelope?.isSuccess || !envelope.result) {
      if (response.status === 422 || response.status === 400) {
        throw new Error(validationMessage(body, envelope?.errors));
      }
      throw new Error('Spring 서버의 조회에 실패했습니다. 연결을 확인한 뒤 다시 시도하세요.');
    }
    return envelope;
  }

  async function request(path, body, fetcher) {
    return (await requestEnvelope(path, body, fetcher)).result;
  }

  function loadModels(fetcher = fetch) {
    return request('/api/v1/catalog', undefined, fetcher).then(result => result.models);
  }

  function decimal(value, scale) {
    const fixed = value.toFixed(scale);
    return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  }

  async function simulateIrr(input, modelId, fetcher = fetch, market = {}) {
    const constraint = market.constraint || 'NONE';
    if (constraint !== 'NONE' && !market.filters) {
      throw new Error('시장 상한에 적용할 동일 비교 조건을 선택하세요.');
    }
    if (!modelId || Object.values(input).some(value => !Number.isFinite(value))) {
      throw new Error('GPU 모델과 모든 IRR 입력값을 입력하세요.');
    }
    if (!Number.isInteger(input.years) || input.years < 1 || input.years > 100
        || !Number.isSafeInteger(input.gpu) || input.gpu < 1 || input.gpu > 2147483647
        || input.initial <= 0 || input.opex < 0 || input.salvage < 0
        || input.util <= 0 || input.util > 1 || input.target <= -1 || input.price < 0) {
      throw new Error('투자금, 기간, GPU 수, 가동률과 가격의 입력 범위를 확인하세요.');
    }
    return request('/api/v1/irr-simulations', {
      costInput: {
        modelId: String(modelId),
        items: [
          { itemType: 'ACQUISITION', status: 'USER_INPUT', amount: decimal(input.initial, 8),
            currency: 'USD', period: 'ONE_TIME' },
          { itemType: 'OPERATIONS', status: 'USER_INPUT', amount: decimal(input.opex, 8),
            currency: 'USD', period: 'YEAR' }
        ],
        assumptions: {
          gpuCount: input.gpu, depreciationYears: input.years, utilization: decimal(input.util, 8),
          interestRateType: 'NOT_APPLIED'
        }
      },
      analysisYears: input.years,
      residualValue: decimal(input.salvage, 8),
      targetIrr: decimal(input.target, 8),
      candidatePrices: [decimal(input.price, 12)],
      marketConstraint: constraint,
      ...(constraint === 'NONE' ? {} : { marketFilters: market.filters })
    }, fetcher);
  }

  function askPrice(message, fetcher = fetch) {
    return request('/api/v1/agent-messages', { message: message.trim() }, fetcher);
  }

  function sourceLink(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  }

  function sourcesForResult(item, sources) {
    const available = new Map(sources.map(source => [String(source.evidenceId), source]));
    return [...new Set((item.evidenceIds || []).map(String))]
      .map(id => available.get(id)).filter(Boolean);
  }

  const client = { requestEnvelope, loadModels, simulateIrr, askPrice, sourceLink, sourcesForResult };
  root.GpuSpringAnalysis = client;
  if (typeof module !== 'undefined') module.exports = client;
})(globalThis);
