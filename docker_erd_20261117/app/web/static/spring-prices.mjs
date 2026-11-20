import { latestObservation, freshness, safeUrl } from './spring-price-logic.mjs';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '미확인').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when = value => value ? new Date(value).toLocaleString('ko-KR', {timeZone:'Asia/Seoul',timeZoneName:'short'}) : '미확인';
const terms = {ON_DEMAND:'온디맨드', SPOT:'스팟', COMMITMENT:'약정', UNKNOWN:'미확인'};
let current=[];
async function api(path) {
  const response=await fetch(path, {headers:{Accept:'application/json'}});
  let body; try {body=await response.json()} catch {throw new Error('서버 응답을 읽을 수 없습니다.')}
  if (!response.ok || body.isSuccess !== true) throw new Error(body.message || `서버 오류 (${response.status})`);
  return body.result;
}
function dateValue(date) {return date.toISOString().slice(0,10)}
function renderRows() {
  $('#count').textContent=`${current.length}개 오퍼`;
  $('#rows').innerHTML=current.length ? current.map((s,i)=> {
    const p=s.latest, price=p?.status==='OK' && p.effectiveUsdGpuHour!=null ? '$'+Number(p.effectiveUsdGpuHour).toLocaleString('en-US',{maximumFractionDigits:6}) : '가격 미확보';
    return `<tr><td><strong>${esc(s.providerName)}</strong><small>오퍼 ${esc(s.offerId)} · ${esc(s.systemType)}</small></td><td>${esc(s.countryCode)} / ${esc(s.regionCode)}<small>${s.gpuCount == null ? 'GPU 수 미확인' : `${esc(s.gpuCount)} GPU`} · ${esc(s.serviceOption)}</small></td><td>${esc(terms[s.contractType] || s.contractType)}<small>${s.commitmentMonths ? esc(s.commitmentMonths)+'개월' : ''}</small></td><td><strong>${price}</strong><small>규칙 ${esc(p?.ruleVersion)}</small></td><td>${esc(when(p?.collectedAt))}<small>${esc(freshness(p?.collectedAt))}</small></td><td><button class="btn sm" data-detail="${i}">상세 · 근거</button></td></tr>`;
  }).join('') : '<tr><td colspan="6">선택한 기간에 관측된 가격이 없습니다. 미출시 또는 비공개라는 뜻은 아닙니다.</td></tr>';
}
async function loadPrices(event) {
  event?.preventDefault();
  let from=$('#from').value, to=$('#to').value;
  if(!from || !to || from>to) {$('#status').textContent='조회 시작일과 종료일을 확인해 주세요.'; return;}
  const end=new Date(to+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+1);
  const query=new URLSearchParams({modelId:$('#model').value,from:from+'T00:00:00Z',to:end.toISOString()});
  $('#status').textContent='가격 이력을 불러오는 중입니다.'; $('#rows').innerHTML=''; $('#count').textContent='';
  try {
    const result=await api('/api/v1/market/price-histories?'+query);
    current=result.series.map(s=>({...s, latest:latestObservation(s.points)})).filter(s=>s.latest);
    renderRows(); $('#status').textContent=`조회 완료 · ${$('#model').selectedOptions[0].textContent} · ${from} ~ ${to} UTC`;
  } catch(error) {current=[];$('#status').textContent='가격 조회 실패: '+error.message;$('#rows').innerHTML='<tr><td colspan="6">서버 연결 또는 조회 조건을 확인한 뒤 다시 시도해 주세요.</td></tr>';}
}
async function showDetail(index) {
  const p=current[index]?.latest; if(!p)return;
  $('#detail').showModal();$('#detailBody').innerHTML='<p class="spring-evidence">근거를 불러오는 중입니다.</p>';
  try {
    const query=p.normalizationId?'?normalizationId='+encodeURIComponent(p.normalizationId):'';
    const d=await api('/api/v1/market/observations/'+encodeURIComponent(p.observationId)+query);
    const sources=d.evidence.map(e=>{const url=safeUrl(e.sourceUrl);return `<section><b>${esc(e.sourceName)}</b> · ${esc(e.role)}<br>근거 확보 ${esc(when(e.capturedAt))}<br>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">출처 원문 열기 ↗</a>`:'출처 주소 미확인'}<br>공식 원천 검증: ${e.primaryVerified===true?'확인':e.primaryVerified===false?'미확인':'기록 없음'}</section>`}).join('');
    $('#detailBody').innerHTML=`<div class="spring-evidence"><section><b>관측 ${esc(d.observationId)}</b><br>원문: ${esc(d.rawPriceText)}<br>수집: ${esc(when(d.collectedAt))}<br>적용 시작: ${esc(when(d.effectiveFrom))}<br>가격 구분: ${esc(d.priceCertainty)}</section><section><b>환산 단가</b><br>${d.effective?.amount != null?'$'+esc(d.effective.amount)+' /GPU·시간':'환산 불가'}<br>규칙: ${esc(d.effective?.ruleVersion)}<br>${esc(d.effective?.reason ?? '')}</section><h3>출처</h3>${sources||'<p>이 관측의 출처가 기록되지 않았습니다.</p>'}</div>`;
  } catch(error) {$('#detailBody').textContent='출처 조회 실패: '+error.message;}
}
$('#filters').addEventListener('submit',loadPrices);
$('#rows').addEventListener('click',e=>{const b=e.target.closest('[data-detail]');if(b)showDetail(Number(b.dataset.detail));});
$('#close').addEventListener('click',()=>$('#detail').close());
(async()=>{
  const now=new Date(), start=new Date(now);start.setUTCDate(start.getUTCDate()-90);$('#from').value=dateValue(start);$('#to').value=dateValue(now);
  try {const catalog=await api('/api/v1/catalog');$('#model').innerHTML=catalog.models.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');if(!catalog.models.length)throw new Error('모델 목록이 없습니다.'); if(catalog.models.some(m=>m.name==='B200')) $('#model').value=catalog.models.find(m=>m.name==='B200').id;await loadPrices();}
  catch(error){$('#status').textContent='모델 조회 실패: '+error.message;$('#model').innerHTML='<option value="">모델 조회 실패</option>';}
})();
