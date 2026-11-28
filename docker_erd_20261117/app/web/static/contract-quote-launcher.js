/* Keep #discounts; separate our quote scenarios from collected competitor prices. */
(() => {
  const saved = {};
  window.GpuContractQuote = {
    source: null,
    invalidateCost() { this.source = null; },
    acceptCost(result) {
      if (!Number.isFinite(Number(result.candidatePrice)) || !Number.isFinite(Number(result.hourlyCost))) return;
      this.source = {id:crypto.randomUUID(),price:result.candidatePrice,cost:result.hourlyCost,
        time:new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})};
    },
    openFromCost() {saved.autoImport = true;location.hash='#discounts';},
  };
  SH.ko.pDiscounts='계약 할인·견적';
  SH.ko.d_discounts='우리 판매단가와 할인율로 장기계약 견적을 계산하고 경쟁사 가격을 참고합니다.';
  READABLE_PAGES.discounts=['계약 검토','계약 할인·예상 견적',SH.ko.d_discounts];
  const menu=PORTAL_ROUTES.find(row=>row[0]==='discounts');
  if(menu){menu[1]='계약 할인·견적';menu[2]=SH.ko.d_discounts;menu[4]='견적 계약 할인율 3년 5년';}
  let revision=0;
  RENDER.discounts=async()=>{
    const ticket=++revision, host=document.getElementById('v-discounts');
    document.getElementById('pageTitle').textContent='계약 할인·예상 견적';
    document.getElementById('pageDesc').textContent=SH.ko.d_discounts;
    document.getElementById('dataContext').hidden=true;
    host.innerHTML='<p role="status">견적 계산 화면을 불러오고 있습니다.</p>';
    try {
      const {mountQuote}=await import('/static/contract-quote-ui.mjs?v=quote-model1128');
      if(ticket!==revision||state.view!=='discounts')return;
      mountQuote({host,saved,request:api,getSource:()=>window.GpuContractQuote.source,
        loadMarket:root=>window.renderContractMarket({root,embedded:true})});
    } catch(error) {
      if(ticket!==revision||state.view!=='discounts')return;
      host.replaceChildren();const p=document.createElement('p');p.setAttribute('role','alert');p.textContent='견적 화면을 불러오지 못했습니다. '+error.message;
      const button=document.createElement('button');button.textContent='다시 시도';button.onclick=()=>RENDER.discounts();host.append(p,button);
    }
  };
})();
