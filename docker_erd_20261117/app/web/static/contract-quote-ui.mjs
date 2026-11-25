import {mountQuoteMarket} from './contract-quote-market.mjs?v=benchmark1125';
import {calculateContractQuote, quoteText} from './contract-quote.mjs?v=mentoring1125';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults = () => ({model:'', currency:'USD', price:'', cost:'', quantity:'1', billing:'full', monthlyHours:'', discount3:'', discount5:'', sourceLabel:'사용자 직접 입력'});
export function mountQuote({host, saved, getSource, loadMarket, request}) {
  saved.draft ||= defaults();
  const d = saved.draft;
  const examples = () => ({price:d.currency==='KRW'?'예: 6700':'예: 5.00', cost:d.currency==='KRW'?'예: 4000':'예: 3.00', quantity:'예: 8', monthlyHours:'예: 360', discount3:'예: 10', discount5:'예: 20'});
  const number = (key, label, note, step='any') => `<label for="cq-${key}">${label}<input id="cq-${key}" name="${key}" type="number" min="0" step="${step}" value="${esc(d[key])}" placeholder="${esc(examples()[key])}"><small>${note}</small></label>`;
  host.innerHTML = `<div class="mv cp-page rw-page rw-contracts cq-page">
    <header class="cp-hero"><p class="cp-eyebrow">GPU 시세 인덱스</p><h1>계약 할인 <em>· 예상 견적</em></h1><p>우리 판매단가와 할인율로 장기계약 견적을 계산하고 경쟁사 공개 가격을 참고합니다.</p></header>
    <div class="cq-path"><span>GPU 1개당 시간당 판매단가</span><b>×</b><span>(1 − 할인율 ÷ 100)</span><b>×</b><span>GPU 수</span><b>×</b><span>계약 전체 과금 시간</span><b>=</b><strong>예상 계약금액</strong></div>
    <div class="cq-layout"><section class="cq-panel"><div class="cp-results-head cq-section-head"><div><h2>계약 조건 입력</h2><p>경쟁사 온디맨드 가격이 없어도 직접 입력한 단가로 계산할 수 있습니다.</p></div></div>
    <div class="cq-actions"><button type="button" class="mv-btn" data-import>원가·제안가 결과 가져오기</button><a href="#cost/datacenter" class="cq-link">데이터센터 원가 계산</a></div>
    <p class="cq-source" data-source></p><p role="status" data-import-status></p>
    <form data-quote-form novalidate><div class="cq-fields">
      <label for="cq-model">견적 대상 GPU·상품<input id="cq-model" name="model" maxlength="120" value="${esc(d.model)}" placeholder="예: B300 · 제공 사양 직접 입력"><small>센터 원가를 가져온 경우 실제 적용할 GPU·사양을 확인하세요.</small></label>
      <label for="cq-currency">견적 통화<select name="currency" id="cq-currency"><option value="USD" ${d.currency==='USD'?'selected':''}>USD · 미국 달러</option><option value="KRW" ${d.currency==='KRW'?'selected':''}>KRW · 대한민국 원</option></select><small>통화 변경은 환율 변환이 아닙니다. 단가를 새로 입력하세요.</small></label>
      ${number('price','기준 판매단가 / GPU·시간','할인 적용 전 우리 판매단가 · 소수 6자리까지')}
      ${number('quantity','계약 GPU 수량','노드 수가 아닌 GPU 개수', '1')}
      ${number('cost','참고 원가 / GPU·시간 (선택)','동일 통화·동일 제공 조건의 원가 · 할인 후 원가 미달 점검')}
      <label for="cq-billing">과금 기준<select name="billing" id="cq-billing"><option value="full" ${d.billing==='full'?'selected':''}>24시간 전체 예약 · 연 8,760시간</option><option value="monthly" ${d.billing==='monthly'?'selected':''}>월 과금 시간 직접 입력</option></select><small>예약 계약은 실제 사용률과 별개로 전체 시간 과금을 가정합니다.</small></label>
      <div data-monthly ${d.billing==='full'?'hidden':''}>${number('monthlyHours','GPU당 월 과금 시간','월 평균 0 초과~730시간 · 소수 2자리까지', '0.01')}</div>
    </div><fieldset class="cq-discounts"><legend>계약기간별 할인율</legend><p>확인할 기간만 입력하세요. 0%는 무할인, 빈칸은 해당 기간 계산 제외입니다.</p><div class="cq-fields">
      ${number('discount3','3년 계약 할인율 (%)','사용자 지정 · 0~100%', '0.01')}${number('discount5','5년 계약 할인율 (%)','사용자 지정 · 0~100%', '0.01')}
    </div></fieldset><div class="cq-actions"><button type="submit" class="mv-btn primary cq-calculate">예상 견적 계산</button><button type="button" class="mv-btn" data-example>가상 예시 적용</button><button type="button" class="mv-btn" data-clear>초기화</button></div><p data-error role="alert" class="cq-error"></p></form></section>
    <section class="cq-output" aria-label="견적 계산 결과"><div data-result aria-live="polite"></div></section></div>
    <section class="cq-benchmark" data-benchmark tabindex="-1"><div class="cp-results-head cq-section-head"><div><h2>경쟁사 장기약정 가격 비교</h2><p>같은 GPU의 3년·5년 공개 관측가와 온디맨드 대비 할인율을 확인합니다.</p></div></div><div data-benchmark-body></div></section>
    <details class="cq-assumptions"><summary>계산 방식과 견적에 포함되지 않는 항목</summary><p>할인 단가 = 기준 판매단가 × (1 − 할인율 ÷ 100)</p><p>계약 총액 = 할인 단가 × GPU 수 × 연 과금 시간 × 계약 연수</p><p>1년은 365일(8,760시간), 1개월은 평균 730시간으로 계산합니다. 직접 입력한 월 과금 시간은 연 12개월에 동일하게 적용합니다. 윤년·실제 시작일·사용량 변동은 반영하지 않습니다.</p><p>단가와 할인율은 계약기간 중 고정입니다. 세금 및 별도 네트워크·스토리지·부가서비스 비용은 제외합니다. 선납·분납 일정과 현재가치 할인도 반영하지 않습니다. 표시 총액은 마지막에 소수 2자리로 반올림하며 단가 표시값으로 중간 반올림하지 않습니다.</p><p>참고 원가는 입력 시점의 고정 가정입니다. 원가 미달 표시는 손익 검토를 돕는 알림이며 장기 수익성을 보장하지 않습니다.</p></details>
    <details class="cq-market"><summary><span><strong>경쟁사 공개 가격 참고</strong><small>온디맨드 · 스팟 · 1년·3년 약정 관측가와 비교 가능한 할인율</small></span><span>펼쳐보기</span></summary><div class="cq-market-note">아래는 수집된 경쟁사 가격입니다. 위의 우리 판매단가·할인율에 자동 적용하지 않습니다. 동일 상품·리전의 온디맨드 기준가가 없으면 약정 할인율을 산출하지 않습니다.</div><div data-market></div></details>
  </div>`;
  const form = host.querySelector('[data-quote-form]');
  const resultHost = host.querySelector('[data-result]');
  const errorHost = host.querySelector('[data-error]');
  const field = key => form.elements.namedItem(key);
  const note = text => { host.querySelector('[data-import-status]').textContent = text; };
  const sourceLabel = () => {host.querySelector('[data-source]').textContent = '단가 출처: ' + d.sourceLabel;};
  const stale = () => saved.sourceId && saved.sourceId !== getSource()?.id;
  const read = () => {for (const key of Object.keys(defaults())) if (field(key)) d[key] = field(key).value;};
  const money = (cents, currency=d.currency) => (cents / 100).toLocaleString('ko-KR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' ' + esc(currency);
  function invalidate(message='조건이 변경되었습니다. 예상 견적을 다시 계산하세요.') {
    saved.result = null; errorHost.textContent = ''; paint(message);
  }
  function paint(message) {
    const benchmark=host.querySelector('[data-benchmark]');
    const benchmarkBody=host.querySelector('[data-benchmark-body]');
    benchmarkBody.replaceChildren();benchmark.hidden=false;
    if (stale()) {saved.result=null;message='원가·제안가의 가정이 변경되었습니다. 다시 계산한 결과를 가져오거나 기준 판매단가를 직접 입력하세요.';}
    if (!saved.result) {
      benchmarkBody.innerHTML='<p class="cq-market-note">GPU와 계약 조건을 입력하고 <b>예상 견적 계산</b>을 누르면, 이곳에 경쟁사의 온디맨드·3년·5년 약정 가격을 함께 표시합니다.</p>';
      resultHost.innerHTML=`<div class="cq-empty"><span class="cq-eyebrow">예상 견적</span><h2>계약 조건을 먼저 확인하세요</h2><p>${esc(message || '판매단가·수량·할인율을 입력하면 3년과 5년 견적을 나란히 보여드립니다.')}</p><ul><li>할인율을 임의로 추천하지 않습니다.</li><li>월 평균과 총 계약금액을 함께 확인합니다.</li><li>참고 원가가 있으면 원가 미달 여부를 점검합니다.</li></ul></div>`;return;
    }
    const r=saved.result, i=r.input;
    if(request){benchmark.hidden=false;const target=document.createElement('div');benchmarkBody.append(target);mountQuoteMarket({host:target,quote:r,request});}
    resultHost.innerHTML=`<div class="cp-results-head cq-section-head"><div><p class="cq-eyebrow">견적 결과</p><h2>장기계약 예상 견적</h2><p>${esc(i.model)} · ${esc(i.quantity)} GPU · ${esc(i.currency)}</p></div><span class="cq-badge">확정 계약가 아님</span></div><p class="cq-source">${esc(i.sourceLabel)}</p><div class="cq-actions cq-benchmark-jump"><button type="button" class="mv-btn primary" data-show-benchmark>경쟁사 약정 가격 보기</button><span>같은 GPU의 온디맨드·3년·5년 약정 비교</span></div>
      <div class="cq-result-grid">${r.rows.map(row=>`<article class="cq-result-card"><div class="cq-term"><h3>${row.years}년 계약</h3><span>${row.discount}% 할인</span></div><small>총 계약금액 · 세금 별도</small><strong class="cq-total">${money(row.totalCents,i.currency)}</strong><dl><div><dt>할인 전 총액</dt><dd>${money(row.baselineCents,i.currency)}</dd></div><div><dt>절감액</dt><dd>${money(row.savingCents,i.currency)}</dd></div><div><dt>할인 단가 / GPU·시간</dt><dd>${row.unit.toLocaleString('ko-KR',{maximumFractionDigits:10})} ${esc(i.currency)}</dd></div><div><dt>월 평균 환산</dt><dd>${money(row.monthlyCents,i.currency)}</dd></div><div><dt>총 과금 GPU·시간</dt><dd>${row.gpuHours.toLocaleString('ko-KR')}</dd></div></dl>
      ${row.free?'<p class="cq-warning">100% 할인: GPU 이용료가 0입니다. 할인율을 확인하세요.</p>':''}${row.belowCost?'<p class="cq-warning">원가 미달 · 할인 단가가 입력한 참고 원가보다 낮습니다.</p>':i.cost===''?'<p class="cq-neutral">참고 원가 미입력 · 수익성 미검증</p>':`<p class="cq-neutral">${row.margin==null?'이익률 산출 불가':'입력 원가 기준 이익률 '+(row.margin*100).toFixed(2)+'%'} · 고정 원가 가정</p>`}</article>`).join('')}</div>
      <div class="cq-formula"><b>적용한 계산 근거</b><p>${esc(i.price)} ${esc(i.currency)} × (1 − 기간별 할인율 ÷ 100) × ${esc(i.quantity)} GPU × 연 ${r.annualHours.toLocaleString('ko-KR')}시간 × 계약 연수</p><p>월 평균은 총액 ÷ 계약 개월 수이며 실제 월 청구액이 아닙니다.</p></div>
      <div class="cq-actions"><button type="button" class="mv-btn" data-copy>견적 요약 복사</button><button type="button" class="mv-btn" data-download>견적 TXT 저장</button></div><p data-export-status role="status"></p>`;
    resultHost.querySelector('[data-show-benchmark]').onclick=()=>{benchmark.scrollIntoView({behavior:'smooth',block:'start'});benchmark.focus({preventScroll:true});};
    resultHost.querySelector('[data-copy]').onclick=async()=>{
      const status=resultHost.querySelector('[data-export-status]');
      try {await navigator.clipboard.writeText(quoteText(r));status.textContent='견적 요약을 복사했습니다.';}
      catch {status.textContent='자동 복사를 사용할 수 없습니다. 견적 TXT 저장을 이용하세요.';}
    };
    resultHost.querySelector('[data-download]').onclick=()=>{
      const url=URL.createObjectURL(new Blob([quoteText(r)],{type:'text/plain;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download='GPU_contract_quote.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
  }
  function importCost() {
    const source=getSource();
    if (!source || !(Number(source.price)>0)) {note('현재 가져올 계산 결과가 없습니다. 원가·제안가에서 먼저 계산하세요.');return;}
    d.currency='USD';d.price=Number(source.price).toFixed(6);d.cost=Number(source.cost).toFixed(6);
    d.sourceLabel='원가·제안가 계산 결과 · USD · '+source.time+' · 대상 GPU·사양 직접 확인';saved.sourceId=source.id;
    for(const key of ['currency','price','cost'])field(key).value=d[key];
    sourceLabel();invalidate();note('우리 목표 판매단가와 참고 원가를 가져왔습니다. 소수 6자리 기준이며 GPU 모델·계약 수량은 직접 확인하세요.');
  }
  form.addEventListener('input',event=>{
    if(event.target.name==='currency') {
      field('price').value='';field('cost').value='';note('환율을 자동 적용하지 않습니다. 선택한 통화로 단가와 원가를 다시 입력하세요.');
    }
    if(['price','cost','currency'].includes(event.target.name)) {saved.sourceId=null;d.sourceLabel='사용자 직접 입력'+(d.sourceLabel.includes('가상 예시')?' · 가상 예시에서 수정':'');}
    read();for (const key of ['price','cost']) field(key).placeholder=examples()[key];sourceLabel();host.querySelector('[data-monthly]').hidden=d.billing==='full';invalidate();
  });
  form.onsubmit=event=>{
    event.preventDefault();read();saved.result=null;
    if(stale()){paint();errorHost.textContent='변경된 원가·제안가 결과를 다시 가져오세요.';return;}
    try {saved.result=calculateContractQuote(d);errorHost.textContent='';paint();}
    catch(error){paint('입력값을 확인해 주세요.');errorHost.textContent=error.message;}
  };
  host.querySelector('[data-import]').onclick=importCost;
  host.querySelector('[data-example]').onclick=()=>{
    Object.assign(d,defaults(),{model:'B300 · 가상 예시',price:'5',cost:'3',quantity:'8',discount3:'10',discount5:'20',sourceLabel:'가상 예시 · 실제 시세나 권장 할인율이 아님'});
    saved.sourceId=null;saved.result=null;mountQuote({host,saved,getSource,loadMarket,request});
  };
  host.querySelector('[data-clear]').onclick=()=>{saved.draft=defaults();saved.sourceId=null;saved.result=null;mountQuote({host,saved,getSource,loadMarket,request});};
  const market=host.querySelector('.cq-market');let loaded=false;
  market.addEventListener('toggle',()=>{if(market.open&&!loaded){loaded=true;loadMarket(host.querySelector('[data-market]'));}});
  sourceLabel();paint();
  if(saved.autoImport){saved.autoImport=false;importCost();}
}
