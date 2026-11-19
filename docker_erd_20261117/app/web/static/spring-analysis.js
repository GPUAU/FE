(function (root) {
  'use strict';

  async function request(path, body, fetcher) {
    const options = body === undefined
      ? { cache: 'no-store' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const response = await fetcher(path, options);
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
        throw new Error('입력값과 자릿수, 필수 조건을 확인하세요.');
      }
      throw new Error('Spring 서버의 조회에 실패했습니다. 연결을 확인한 뒤 다시 시도하세요.');
    }
    return envelope.result;
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

  const client = { loadModels, simulateIrr, askPrice, sourceLink };
  root.GpuSpringAnalysis = client;
  if (typeof module !== 'undefined') module.exports = client;
})(globalThis);
