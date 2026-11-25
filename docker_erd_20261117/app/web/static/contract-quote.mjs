// Deterministic quote arithmetic. All amounts remain in the user's selected currency.
const blank = value => value == null || String(value).trim() === '';
function fixed(value, digits, label, min, max) {
  const text = String(value ?? '').trim();
  if (!new RegExp('^\\d+(?:\\.\\d{1,' + digits + '})?$').test(text) || blank(value))
    throw Error(`${label}: 0 이상의 숫자와 소수 ${digits}자리 이내로 입력하세요.`);
  if (Number(text) < min || Number(text) > max) throw Error(`${label}: ${min}~${max} 범위로 입력하세요.`);
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0'));
}
function moneyCents(numerator, denominator) {
  const value = (numerator + denominator / 2n) / denominator;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('견적 금액이 계산 범위를 초과했습니다. 단가·수량·시간을 확인하세요.');
  return Number(value);
}
export function calculateContractQuote(input) {
  if (!String(input.model ?? '').trim()) throw Error('견적 대상 GPU·상품을 입력하세요.');
  if (!['USD', 'KRW'].includes(input.currency)) throw Error('견적 통화를 확인하세요.');
  if (!['full', 'monthly'].includes(input.billing)) throw Error('과금 방식을 확인하세요.');
  if (!/^\d+$/.test(String(input.quantity)) || Number(input.quantity) < 1 || Number(input.quantity) > 1000000)
    throw Error('계약 GPU 수량은 1~1,000,000 사이 정수로 입력하세요.');
  const quantity = BigInt(input.quantity);
  const price = fixed(input.price, 6, '기준 판매단가', 0.000001, 1000000000);
  const cost = blank(input.cost) ? null : fixed(input.cost, 6, '참고 원가', 0, 1000000000);
  // 365-day year, 730-hour average month. No utilization adjustment to reserved hours.
  const annualHours100 = input.billing === 'full' ? 876000n : fixed(input.monthlyHours, 2, '월 과금 시간', 0.01, 730) * 12n;
  const rows = [];
  for (const years of [3, 5]) {
    const entered = input['discount' + years];
    if (blank(entered)) continue;
    const discount = fixed(entered, 2, years + '년 할인율', 0, 100);
    const unitNumerator = price * (10000n - discount);
    const totalHours100 = annualHours100 * BigInt(years) * quantity;
    const totalCents = moneyCents(unitNumerator * totalHours100, 10000000000n);
    const baselineCents = moneyCents(price * totalHours100, 1000000n);
    rows.push({years, discount: Number(discount) / 100, unit: Number(unitNumerator) / 1e10,
      totalCents, baselineCents, savingCents: baselineCents - totalCents,
      monthlyCents: moneyCents(unitNumerator * totalHours100, 10000000000n * BigInt(years * 12)),
      gpuHours: Number(totalHours100) / 100,
      belowCost: cost !== null && unitNumerator < cost * 10000n,
      margin: cost === null || unitNumerator === 0n ? null : 1 - Number(cost * 10000n) / Number(unitNumerator),
      free: discount === 10000n});
  }
  if (!rows.length) throw Error('3년 또는 5년 할인율을 입력하세요. 할인하지 않으면 0을 입력하세요.');
  return {input: {...input, model: String(input.model).trim()}, annualHours: Number(annualHours100) / 100, rows};
}

export function quoteText(result) {
  const {input: i, rows, annualHours} = result;
  return ['장기계약 예상 견적 · 확정 계약가 아님', `대상: ${i.model} / ${i.quantity} GPU / 통화: ${i.currency}`,
    `단가 출처: ${i.sourceLabel || '사용자 직접 입력'}`, `기준 판매단가: ${i.price} ${i.currency}/GPU·시간`,
    `과금: ${i.billing === 'full' ? '24시간 전체 예약' : '월 ' + i.monthlyHours + '시간/GPU'} / 연 ${annualHours}시간/GPU`,
    ...rows.flatMap(r => [`${r.years}년 / 사용자 할인율 ${r.discount}% / 할인 단가 ${r.unit.toFixed(10).replace(/\.?0+$/, '') || '0'} ${i.currency}/GPU·시간`,
      `할인 전 ${(r.baselineCents / 100).toFixed(2)} / 할인 후 ${(r.totalCents / 100).toFixed(2)} / 절감 ${(r.savingCents / 100).toFixed(2)} ${i.currency}`,
      `월 평균 환산 ${(r.monthlyCents / 100).toFixed(2)} ${i.currency} (실제 청구 일정 아님)`,
      ...(r.belowCost ? ['주의: 할인 단가가 입력한 참고 원가보다 낮습니다.'] : []),
      ...(r.free ? ['주의: 100% 할인으로 GPU 이용료가 0입니다.'] : [])]),
    `참고 원가: ${blank(i.cost) ? '미입력 · 수익성 미검증' : i.cost + ' ' + i.currency + '/GPU·시간 (고정 가정)'}`,
    '산식: 기준 판매단가 × (1 − 할인율/100) × GPU 수 × 연 과금 시간 × 계약 연수',
    '1년 365일, 월 평균 730시간. 계약 중 단가·할인율 고정. 세금·별도 네트워크/스토리지/부가서비스 비용 제외.',
    '월 평균은 총액의 기간 환산이며 선납·분납 조건 및 현재가치 할인은 반영하지 않습니다.',
    '우리 서비스 견적 시나리오이며 경쟁사 실제 3년·5년 계약 가격이 아닙니다.'].join('\n');
}
