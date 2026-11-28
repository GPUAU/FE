import {fetchContractCatalog, fetchContractComparison} from './spring-contracts.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pay = {ALL_UPFRONT:'전액 선납',PARTIAL_UPFRONT:'일부 선납',NO_UPFRONT:'선납 없음',NOT_APPLICABLE:'해당 없음'};
const reasons = {BASE_PRICE_MISSING:'유효한 온디맨드 기준가 없음',AMBIGUOUS_BASE_PRICE:'온디맨드 기준가 미확정',COMMITMENT_PRICE_STALE:'약정 가격 조건 확인 필요',COMMITMENT_PRICE_NOT_AVAILABLE:'최근 약정 가격 미확보',COMMITMENT_PRICE_NOT_EXACT:'확정가 조건 미충족',COMMITMENT_PRICE_MISSING:'약정 환산 단가 없음',CONDITIONS_NOT_COMPARABLE:'비교 조건 미충족',PRICE_NOT_OBSERVED:'관측 가격 없음',LATEST_PRICE_NOT_AVAILABLE:'최근 가격 미확보'};
const kind = {EXACT:'확정가',SCENARIO:'시나리오 단가',FROM:'시작가',RANGE:'범위 가격',UNKNOWN:'가격 구분 미확인'};
const freshness = {CURRENT:'관측 시각 확인',STALE:'관측 시각 확인',UNKNOWN:'확인 시각 미확인'};
const amount = offer => {
  const value=offer?.effective?.amount;
  return offer?.effective?.status==='OK' && value!=null && String(value).trim()!=='' && Number.isFinite(Number(value)) && Number(value)>=0 ? Number(value) : null;
};
const price = value => value==null?'데이터 없음':Number(value).toLocaleString('ko-KR',{maximumFractionDigits:6});
const krw = value => value == null ? '' : `<small class="cq-krw" data-usd="${Number(value)}" data-krw-compact></small>`;
const normalize = value => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();

// Match whole model names; B200 must never select GB200, nor B300 select GB300.
export function matchQuoteModel(text, models) {
  const input=' '+normalize(text)+' ';
  const matches=models.filter(model=>input.includes(' '+normalize(model.name)+' '));
  const specific=matches.filter(model=>!matches.some(other=>other!==model && (' '+normalize(other.name)+' ').includes(' '+normalize(model.name)+' ')));
  return specific.length===1?specific[0]:null;
}

export function quoteMarketRows(product, comparison) {
  const items=comparison.items;
  const onDemand=items.filter(offer=>offer.contractType==='ON_DEMAND');
  return [36,60].flatMap(months=>{
    const offers=items.filter(offer=>offer.contractType==='COMMITMENT' && Number(offer.months)===months);
    return (offers.length?offers:[null]).map(offer=>{
      const approvedBase=offer?.discount?.baseOfferId==null?null:onDemand.find(base=>base.offerId===offer.discount.baseOfferId);
      const baseline=approvedBase || (onDemand.length===1?onDemand[0]:null);
      const baselineAmount=amount(baseline), offerAmount=amount(offer);
      const value=offer?.discount?.discountRate;
      const rate=offer?.discount?.status==='OK' && approvedBase && amount(approvedBase)>0 && offerAmount!=null && value!=null && String(value).trim()!=='' && Number.isFinite(Number(value))?Number(value):null;
      return {product,months,offer,baseline,baselineAmount,amount:offerAmount,rate,
        reason:!offer?'해당 기간의 수집 데이터 없음':reasons[offer.discount?.reason] || (baselineAmount==null?'온디맨드 기준가 없음':'비교 조건 미확인')};
    });
  });
}

const catalogs=new WeakMap();
function catalogFor(request) {
  const cached=catalogs.get(request);
  if(cached && Date.now()-cached.time<60000)return cached.promise;
  const promise=fetchContractCatalog(request,{includeOnDemandOnly:true});
  catalogs.set(request,{time:Date.now(),promise});
  promise.catch(()=>{if(catalogs.get(request)?.promise===promise)catalogs.delete(request);});
  return promise;
}
const evidence = offer => offer?.observationId?`<button type="button" class="mv-btn" data-observation="spring-${esc(offer.observationId)}-${esc(offer.effective?.normalizationId ?? 'none')}">상세·근거</button>`:'';
const observed = offer => offer ? `<small>${esc(kind[offer.effective?.kind] || '가격 구분 미확인')} · ${esc(freshness[offer.freshness] || '확인 시각 미확인')}</small>` : '';
const date = offer => {const time=Date.parse(offer?.collectedAt);return Number.isFinite(time)?new Date(time).toISOString().slice(0,16).replace('T',' ')+' UTC':'수집 시각 미확인';};

export async function mountQuoteMarket({host,quote,request}) {
  let revision=0, page=0;
  const cache=new Map(), pageSize=6;
  host.innerHTML='<p role="status">같은 GPU의 경쟁사 약정 가격을 조회하고 있습니다.</p>';
  let catalog;
  try {catalog=await catalogFor(request);}
  catch(error) {
    if(!host.isConnected)return;
    host.innerHTML=`<p role="alert">경쟁사 가격을 불러오지 못했습니다. ${esc(error.message)}</p><button type="button" class="mv-btn" data-retry>다시 조회</button>`;
    host.querySelector('[data-retry]').onclick=()=>mountQuoteMarket({host,quote,request});return;
  }
  if(!host.isConnected)return;
  const relevant = product => [...product.offers.values()].some(o=>o.contractType==='ON_DEMAND' || (o.contractType==='COMMITMENT' && [36,60].includes(Number(o.months))));
  const priority = product => [...product.offers.values()].reduce((score,o)=>score+(o.contractType==='COMMITMENT' && [36,60].includes(Number(o.months))?(o.eligible?100:1):0),0);
  catalog={...catalog,products:catalog.products.filter(relevant).sort((a,b)=>priority(b)-priority(a))};
  let modelId=matchQuoteModel(quote.input.model,catalog.models)?.id ?? '',providerId='',region='';
  const select=(name,label,options,value)=>`<label>${label}<select name="${name}">${options.map(([id,text])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
  function shell() {
    const products=catalog.products.filter(p=>p.modelId===modelId && (!providerId || p.providerId===providerId));
    const regions=[...new Set(products.map(p=>p.regionCode||''))].filter(Boolean).sort();
    if(region&&!regions.includes(region))region='';
    host.innerHTML=`<div class="cq-benchmark-controls">${select('model','비교 GPU 모델',[['','모델 선택'],...catalog.models.map(m=>[m.id,m.name])],modelId)}${select('provider','사업자',[['','전체 사업자'],...catalog.providers.map(p=>[p.id,p.name])],providerId)}${select('region','리전',[['','전체 리전'],...regions.map(r=>[r,r])],region)}</div><div data-market-rows aria-live="polite"></div>`;
    for(const control of host.querySelectorAll('select'))control.onchange=()=>{
      modelId=host.querySelector('[name=model]').value;providerId=host.querySelector('[name=provider]').value;region=host.querySelector('[name=region]').value;page=0;shell();load();
    };
  }
  async function load() {
    const ticket=++revision, target=host.querySelector('[data-market-rows]');
    const current=()=>host.isConnected && ticket===revision && target.isConnected;
    if(!modelId){target.innerHTML='<p class="cq-market-note">입력한 상품명에서 비교 모델을 하나로 확인하지 못했습니다. 위에서 GPU 모델을 선택하세요.</p>';return;}
    const model=catalog.models.find(m=>m.id===modelId);
    const all=catalog.products.filter(p=>p.modelId===modelId && (!providerId||p.providerId===providerId) && (!region||p.regionCode===region));
    if(!all.length){target.innerHTML=`<p class="cq-market-note">${esc(model?.name)} · 선택 조건의 수집 데이터가 없습니다. 미판매를 뜻하지 않습니다.</p>`;return;}
    const products=all.slice(page*pageSize,(page+1)*pageSize);
    target.innerHTML='<p role="status">상품별 온디맨드·3년·5년 약정 가격을 조회하고 있습니다.</p>';
    const results=await Promise.all(products.map(async product=>{
      try {
        if(!cache.has(product.id))cache.set(product.id,fetchContractComparison(request,product));
        return {product,comparison:await cache.get(product.id)};
      }catch(error){cache.delete(product.id);return {product,error};}
    }));
    if(!current())return;
    const summary=quote.rows.map(row=>`${row.years}년 ${price(row.unit)} ${quote.input.currency}`).join(' · ');
    target.innerHTML=`<div class="cq-benchmark-summary"><b>${esc(model?.name)} 경쟁사 공개 관측가</b><p>우리 견적(${esc(quote.input.model)}) 할인 단가: ${esc(summary)} / GPU·시간</p><p>경쟁사 금액은 USD / GPU·시간입니다.${quote.input.currency==='KRW'?' 우리 견적은 KRW이며 환율 변환을 적용하지 않았습니다.':''} 같은 칩이어도 서버 구성·리전·최소 물량·서비스 조건이 다를 수 있습니다.</p></div>
      <div class="mv-tablebox cq-benchmark-scroll" tabindex="0" role="region" aria-label="경쟁사 3년 5년 약정 비교"><table class="mv-table cq-benchmark-table"><thead><tr><th>사업자 · 상품 / 리전</th><th>약정 / 결제 조건</th><th>온디맨드 관측 단가</th><th>약정 환산 단가</th><th>온디맨드 대비 할인율</th><th>수집 시각 / 근거</th></tr></thead><tbody>${results.map(({product,comparison,error})=>{
        const productCell=`<b>${esc(product.providerName)}</b><span>${esc(product.originalProductName || product.sku || '상품명 미확인')}</span><span>${esc(product.regionCode || '리전 미확인')} · ${esc(product.gpuCount ?? '?')} GPU / 상품</span><small>상품 #${esc(product.id)}${product.configurationVersion==null?'':' · 구성 v'+esc(product.configurationVersion)}</small>`;
        if(error)return `<tr><td>${productCell}</td><td colspan="5">조회 실패 · ${esc(error.message)} <button class="mv-btn" type="button" data-retry-row>다시 조회</button></td></tr>`;
        return quoteMarketRows(product,comparison).map(row=>{
          const rate=row.rate==null?`<span>산출 불가</span><small>${esc(row.reason)}</small>`:`<b class="cq-market-rate">${(Math.abs(row.rate)*100).toLocaleString('ko-KR',{maximumFractionDigits:1})}% ${row.rate<0?'높음':'할인'}</b>`;
          return `<tr><td>${productCell}</td><td><b>${row.months/12}년 약정</b><span>${row.offer?esc(pay[row.offer.paymentOption] || '결제 조건 미확인'):'데이터 없음'}</span><small>${esc(row.offer?.contractProductType || '')}</small></td><td>${price(row.baselineAmount)}${krw(row.baselineAmount)}${observed(row.baseline)}</td><td><b>${price(row.amount)}</b>${krw(row.amount)}${observed(row.offer)}${row.offer?.effective?.assumptions?.length?`<small>${esc(row.offer.effective.assumptions.join(' · '))}</small>`:''}</td><td>${rate}</td><td>${row.offer?`<small>약정 · ${date(row.offer)}</small>${evidence(row.offer)}`:''}${row.baseline?`<small>온디맨드 · ${date(row.baseline)}</small>${evidence(row.baseline)}`:''}${!row.offer&&!row.baseline?'데이터 없음':''}</td></tr>`;
        }).join('');
      }).join('')}</tbody></table></div><p class="cq-neutral">할인율은 각 사업자의 동일 상품·리전 온디맨드 기준가에 대한 값입니다. 검증된 비교 결과가 없으면 산출하지 않습니다. 5년 데이터가 없을 때 3년 가격으로 추정하지 않습니다.</p><div class="cq-market-pagination"><span>상품 ${page*pageSize+1}–${Math.min((page+1)*pageSize,all.length)} / ${all.length}개</span><button type="button" class="mv-btn" data-prev ${page===0?'disabled':''}>이전</button><button type="button" class="mv-btn" data-next ${(page+1)*pageSize>=all.length?'disabled':''}>다음</button></div>`;
    target.querySelector('[data-prev]').onclick=()=>{page--;load();};
    target.querySelector('[data-next]').onclick=()=>{page++;load();};
    for(const button of target.querySelectorAll('[data-retry-row]'))button.onclick=()=>load();
  }
  shell();await load();
}
