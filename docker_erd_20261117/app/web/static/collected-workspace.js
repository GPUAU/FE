/* Keep collected data inside the existing workspace header and navigation. */
(() => {
 'use strict';
 VIEWS.push('data');
 PAGES.data={grp:'market',tools:false};
 PAGE_KEY.data='pCollectedData';
 SH.ko.pCollectedData='수집 데이터·품질';
 SH.ko.d_data='가격 원본과 수집 상태, 이상 경고를 한곳에서 확인하세요.';
 READABLE_PAGES.data=['시세 분석',SH.ko.pCollectedData,SH.ko.d_data];
 PORTAL_ROUTES.push(['data',SH.ko.pCollectedData,SH.ko.d_data,'database-check','전체 수집 원본 CSV 오퍼 데이터 품질 검증 상태 경고']);
 const root=document.createElement('section');
 root.id='v-data';root.className='view collected-page cp-page';root.hidden=true;
 document.getElementById('content').append(root);
 let pending,qualityDetails,qualityPending;
 function loadQuality(){
  if(!qualityPending){
   const host=root.querySelector('#dataQualityPanels');
   qualityPending=RENDER.qa({root:host,embedded:true}).catch(()=>{
    qualityPending=null;
    const notice=document.createElement('p');notice.setAttribute('role','status');
    notice.textContent='일부 품질 점검을 불러오지 못했습니다. 수집 가격 목록은 계속 확인할 수 있습니다.';
    const retry=document.createElement('button');retry.type='button';retry.textContent='품질 점검 다시 조회';
    retry.onclick=loadQuality;host.append(notice,retry);
   });
  }
  return qualityPending;
 }
 async function mount(){
  const response=await fetch('/static/public-data.html');
  if(!response.ok)throw new Error('수집 화면을 불러오지 못했습니다.');
  const doc=new DOMParser().parseFromString(await response.text(),'text/html');
  const main=doc.querySelector('main'),detail=doc.querySelector('#detail');
  if(!main||!detail)throw new Error('수집 화면 구성을 확인할 수 없습니다.');
  root.replaceChildren(...Array.from(main.childNodes).map(node=>document.importNode(node,true)),document.importNode(detail,true));
  root.querySelector('.cp-hero h1').innerHTML='수집 데이터 <em>· 품질</em>';
  root.querySelector('.cp-hero>p:last-child').textContent=SH.ko.d_data;
  qualityDetails=document.createElement('details');qualityDetails.id='dataQuality';qualityDetails.className='data-quality';
  qualityDetails.innerHTML='<summary><img src="/static/icons/shield-check.svg" alt=""><span><strong>수집 상태·품질 점검</strong><small>모델별 확보 현황 · 처리 이력 · 이상 경고</small></span><span class="data-quality-toggle" aria-hidden="true"></span></summary><div id="dataQualityPanels"><p role="status">펼치면 저장된 품질 점검 결과를 불러옵니다.</p></div>';
  root.querySelector('.cp-overview').after(qualityDetails);
  qualityDetails.addEventListener('toggle',()=>{if(qualityDetails.open)loadQuality();});
  root.querySelectorAll('a[href^="/#"]').forEach(a=>a.setAttribute('href',a.getAttribute('href').slice(1)));
  window.mountCollectedData(root);
 }
 RENDER.data=async()=>{
  marketPriceFrame(SH.ko.pCollectedData,SH.ko.d_data);
  if(!pending){
   root.innerHTML='<p role="status">수집 화면을 불러오는 중입니다.</p>';
   pending=mount().catch(error=>{
    pending=null;root.replaceChildren();
    const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;
    const retry=document.createElement('button');retry.textContent='다시 시도';retry.onclick=()=>RENDER.data();
    root.append(message,retry);
   });
  }
  await pending;
  if(state.view==='data'&&location.hash.split('/')[1]==='quality'&&qualityDetails){
   qualityDetails.open=true;loadQuality();
   qualityDetails.scrollIntoView({block:'start'});
  }
 };
})();
