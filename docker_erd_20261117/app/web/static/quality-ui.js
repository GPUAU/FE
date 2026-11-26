/* Independent quality panels: one unavailable endpoint must not hide the rest. */
async function qualityRequest(path){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const response=await fetch(path,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json'}});if(!response.ok)throw Error('조회 실패 (HTTP '+response.status+')');return await response.json();}
 finally{clearTimeout(timer);}
}
function qualityReason(raw){try{const parsed=JSON.parse(raw||'{}');return parsed&&typeof parsed==='object'?parsed:{};}catch{return {error:String(raw||'사유 형식 미확인')};}}
async function qualitySection(panel,load){
 panel.innerHTML='<p role="status">조회 중입니다.</p>';
 try{await load(panel);}catch(error){panel.innerHTML=`<p role="status">${mh(error.name==='AbortError'?'응답 시간이 초과되었습니다.':error.message)}</p><button type="button" class="mv-btn">이 영역 다시 조회</button>`;panel.querySelector('button').onclick=()=>qualitySection(panel,load);}
}
const qaTable=(headers,rows)=>`<div class="mv-tablebox" tabindex="0" role="region" aria-label="데이터 품질 목록"><table class="mv-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan="${headers.length}">저장된 기록 없음 · 수집 성공이나 이상 없음을 뜻하지 않습니다.</td></tr>`}</tbody></table></div>`;
RENDER.qa=async(options={})=>{
 if(!options.embedded)calculatorFrame('데이터 품질 · 수집 상태','공개 상태·처리 결과·수집 경고를 각각 확인합니다.');
 const root=options.root||$('#v-qa');root.innerHTML=`<div class="mv"><section class="mv-note"><h3>검증 범위</h3><p>아래는 저장된 조회 결과입니다. 자동 수집의 정상 운영이나 전체 요구사항 충족을 보장하지 않습니다. 가격 미확보는 0원·미판매와 다릅니다.</p><a href="/static/requirements-audit.md" download>기존 구현 점검 기록 다운로드</a><small>이 파일은 과거 검토 기록이며 실시간 점검 결과가 아닙니다.</small></section>${[['status','모델별 확보 현황'],['operations','수집 대상과 처리 상태'],['alerts','Spring 수집·가격 이상 경고']].map(([id,title])=>`<section class="mv-note"><h3>${title}</h3><div id="qa-${id}"></div></section>`).join('')}</div>`;
 await Promise.allSettled([
 qualitySection(root.querySelector('#qa-status'),async box=>{const d=await qualityRequest('/api/erd/status');
  box.innerHTML=`<p>온디맨드 ${mh(d.summary.current_offers)}개 / 스팟·약정 ${mh(d.summary.contract_offers)}개 / 관측 ${mh(d.summary.observations)}건. 미관측 대상의 상태는 아래 수집 대상 목록에서 확인하세요.</p>${qaTable(['사업자','모델','공개 가격','근거'],d.availability.map(r=>`<tr><td>${mh(r.provider_name)}</td><td>${mh(r.model_name)}</td><td>${r.public_price_status==='observations_available'?'저장 관측값 있음':'검증된 가격 미확보'}</td><td>${r.evidence_url?mlink(r.evidence_url,'공식 근거'):'조회 결과 기준'}</td></tr>`))}<details><summary>최근 처리 기록 · ${d.recent_checks.length}건</summary>${qaTable(['사업자 / 모델','처리 결과','확인 시각 (KST)'],d.recent_checks.map(r=>{const reason=qualityReason(r.reason);return `<tr><td>${mh(r.provider_name)} / ${mh(r.model_name)}</td><td>${mh(erdStatusText[r.processing_status]||r.processing_status)}${reason.error?'<span>'+mh(reason.error)+'</span>':''}</td><td>${mtime(r.checked_at)}</td></tr>`;}))}</details><details><summary>아카이브 근거 링크 · ${d.archive_candidates.length}건</summary><p>저장 링크만 확보한 자료는 검증된 과거 가격이 아닙니다.</p>${qaTable(['사업자','저장 시각 (KST)','확인 상태','출처'],d.archive_candidates.map(r=>`<tr><td>${mh(r.provider_name)}</td><td>${mtime(r.archive_captured_at)}</td><td>${mh(erdStatusText[r.review_status]||r.review_status)}</td><td>${mlink(r.original_url,'원문')} · ${mlink(r.archive_url,'저장본')}</td></tr>`))}</details>`;
 }),
 qualitySection(root.querySelector('#qa-operations'),async box=>{const d=await qualityRequest('/api/erd/operations');
  box.innerHTML=`<p>조회 기준 ${mtime(d.assessed_at)} · ${d.targets.length}개 대상. 최근 처리 결과와 마지막 성공은 별개입니다. 매일 자동 수집은 미설정입니다.</p>${qaTable(['대상','공개 상태','최근 처리','마지막 성공 (KST)'],d.targets.map(r=>{return `<tr><td>${mh(r.provider_name)} · ${mh(r.model_name)}<span>${mh(r.region_filter||'대상 범위 기준')} · ${r.enabled?'활성':'보류'}</span></td><td>${erdDisclosure[r.disclosure_status]||'미확인'}</td><td>${mh(erdStatusText[r.processing_status]||r.processing_status||'미실시')}<span>${mtime(r.checked_at)}</span></td><td>${r.last_success_at?mtime(r.last_success_at):'성공 기록 없음'}</td></tr>`;}))}<details><summary>기존 저장 알림 ${d.alerts.length}건</summary>${qaTable(['감지 시각 (KST)','유형','사유','처리'],d.alerts.map(r=>`<tr><td>${mtime(r.detected_at)}</td><td>${mh(r.alert_type)}</td><td>${mh(r.reason)}</td><td>${mh(r.handling_status)}</td></tr>`))}</details>`;
 }),
 qualitySection(root.querySelector('#qa-alerts'),async box=>{
  const {alertRows}=await import('/static/spring-operations.mjs');let items=[],cursor=null,busy=false;
  async function page(){if(busy)return;busy=true;box.querySelector('button')?.setAttribute('disabled','');
   try{const query=new URLSearchParams({limit:'50'});if(cursor)query.set('cursor',cursor);const r=alertRows(await qualityRequest('/api/v1/operations/alerts?'+query));items.push(...r.items);cursor=r.nextCursor;
    box.innerHTML=`<p>조회 ${mtime(r.asOf)} · ${items.length}건 표시</p>${qaTable(['감지 시각 (KST)','유형','사유','처리'],items.map(r=>`<tr><td>${mtime(r.detectedAt)}</td><td>${mh(r.alertType)}</td><td>${mh(r.reason)}</td><td>${mh(r.handlingStatus)}</td></tr>`))}${cursor?'<button type="button" class="mv-btn">다음 경고 보기</button>':''}`;
   }catch(error){if(!items.length)throw error;box.querySelector('.qa-page-error')?.remove();box.insertAdjacentHTML('beforeend',`<p class="qa-page-error" role="status">추가 조회 실패: ${mh(error.message)}. 다음 경고 보기를 눌러 재시도하세요.</p>`);}
   finally{busy=false;const button=box.querySelector('button');if(button){button.disabled=false;button.onclick=()=>page();}}
  }await page();
 })]);
};
