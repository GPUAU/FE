/* Latest BE read-only data, with independent retry and explicit pagination. */
async function backendQualityPages(box,path,headers,row){
 let items=[],cursor=null,busy=false;const seen=new Set();
 async function page(){
  if(busy)return;busy=true;box.querySelector('button')?.setAttribute('disabled','');
  try{
   const query=new URLSearchParams({limit:'50'});if(cursor)query.set('cursor',cursor);
   const response=await qualityRequest(path+(path.includes('?')?'&':'?')+query);
   if(!response.isSuccess||!Array.isArray(response.result?.items))throw Error(response.message||'응답 형식 확인 필요');
   const d=response.result;if(d.nextCursor&&seen.has(d.nextCursor))throw Error('페이지가 반복됩니다.');
   if(d.nextCursor)seen.add(d.nextCursor);items.push(...d.items);cursor=d.nextCursor;
   box.innerHTML=`<p>조회 ${mtime(d.asOf)} · ${items.length}건 표시${cursor?' · 다음 페이지 있음':''}</p>${qaTable(headers,items.map(row))}${cursor?'<button class="mv-btn" type="button">다음 기록 보기</button>':''}`;
  }catch(error){
   if(!items.length)throw error;
   box.querySelector('.qa-page-error')?.remove();
   box.insertAdjacentHTML('beforeend',`<p class="qa-page-error" role="status">추가 조회 실패: ${mh(error.message)}</p>`);
  }finally{busy=false;const button=box.querySelector('button');if(button){button.disabled=false;button.onclick=()=>page();}}
 }
 await page();
}
const backendOriginalQuality=RENDER.qa;
RENDER.qa=async(options={})=>{
 const original=backendOriginalQuality(options);
 const root=(options.root||$('#v-qa')).querySelector('.mv');
 const capabilities=await qualityRequest('/static/backend-capabilities.json');
 if(!capabilities.historyPagination){
  root.insertAdjacentHTML('beforeend','<section class="mv-note"><h3>새 백엔드 연결 대기</h3><p>가격 확보 상태와 수집 실행 이력 화면은 로컬 백엔드 전환 후 사용할 수 있습니다. 현재는 기존 수집 데이터를 표시합니다.</p></section>');
  await original;return;
 }
 root.insertAdjacentHTML('beforeend','<section class="mv-note"><h3>가격 확보 상태 · 모델별</h3><p>공개 확인, 최근 처리, 마지막 성공을 구분합니다. 최신 BE 전환 전에는 조회할 수 없습니다.</p><div id="qa-be-availability"></div></section><section class="mv-note"><h3>수집 실행 이력</h3><p>저장된 실행 기록입니다. 자동 수집이 설정되었다는 뜻은 아닙니다.</p><div id="qa-be-runs"></div></section>');
 await Promise.allSettled([original,
 qualitySection(root.querySelector('#qa-be-availability'),async box=>{
  const response=await qualityRequest('/api/v1/catalog');if(!response.isSuccess)throw Error('모델 조회 실패');
  const d=response.result,providers=new Map(d.providers.map(p=>[String(p.id),p.name]));
  box.innerHTML=`<label>GPU 모델 <select aria-label="가격 확보 상태 모델">${d.models.map(m=>`<option value="${mh(m.id)}">${mh(m.name)}</option>`).join('')}</select></label><div class="qa-model-records"></div>`;
  let version=0;
  const load=async()=>{const ticket=++version,target=document.createElement('div');box.querySelector('.qa-model-records').replaceChildren(target);
   await qualitySection(target,async area=>{await backendQualityPages(area,'/api/v1/market/availability-records?modelId='+encodeURIComponent(box.querySelector('select').value),['사업자 / 범위','공개 상태','최근 처리','마지막 성공 / 최신성'],r=>`<tr><td>${mh(providers.get(String(r.providerId))||r.providerId)}<span>${mh(r.scopeDescription||'범위 미확인')}</span></td><td>${mh(r.latestDisclosure?.status||'UNKNOWN')}<span>${mtime(r.latestDisclosure?.verifiedAt)}</span></td><td>${mh(r.latestCheck?.processingStatus||'미실시')}<span>${mtime(r.latestCheck?.checkedAt)}</span><span>${mh(r.latestCheck?.reason||'')}</span></td><td>${mtime(r.freshness?.lastSuccessAt)}<span>${mh(r.freshness?.status||'UNKNOWN')}</span></td></tr>`);});
   if(ticket!==version)target.remove();
  };box.querySelector('select').onchange=load;await load();
 }),
 qualitySection(root.querySelector('#qa-be-runs'),box=>backendQualityPages(box,'/api/v1/operations/collection-runs',['실행','시작 / 종료 (KST)','결과','대상별 결과'],r=>`<tr><td>${mh(r.runId)}<span>${mh(r.collectorVersion||'버전 미확인')}</span></td><td>${mtime(r.startedAt)}<span>${mtime(r.finishedAt)}</span></td><td>${mh(r.status)}</td><td><details><summary>${r.targets.length}개 대상</summary>${r.targets.map(t=>`<p>${mh(t.scopeDescription||t.targetId)} · ${mh(t.processingStatus)}<br>${mh(t.reason||'')}<br>확인 ${mtime(t.checkedAt)} / 마지막 성공 ${mtime(t.lastSuccessAt)}</p>`).join('')}</details></td></tr>`))]);
};
