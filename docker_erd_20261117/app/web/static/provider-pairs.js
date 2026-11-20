/* Pair-first workspace: independent provider selections, shared model and contract. */
const PAIR_GROUPS={general:{title:'종합 클라우드',left:'AWS',right:'Oracle OCI',note:'인스턴스 구성과 지역을 함께 비교'},specialist:{title:'GPU 전문 클라우드',left:'RunPod',right:'Nebius',note:'1 GPU 상품부터 GPU 임대 조건 비교'}};
const pairState={group:'general',single:false,region:['ALL','ALL'],keys:['',''],data:null,request:0};
const pairRegion=r=>r==='GLOBAL_UNSPECIFIED'?'지역 미명시 / 공통 요금':r||'미제공';
const pairPrice=n=>n==null?'—':'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4});
const pairAt=t=>t?fullAt(t):'관측 시각 미제공';
const pairSources=()=>'<div class="pair-sources">가격: <a href="https://gpuledger.dev/data/" target="_blank" rel="noopener">GPU Ledger</a> · <a href="https://gpueconomy.com/data" target="_blank" rel="noopener">GPU Economy</a> · <a href="https://gpurentwatch.com/data/" target="_blank" rel="noopener">GPU Rent Watch</a> <span>CC BY 4.0 · 선별·정규화 적용</span> <a href="/public-data">수집 자료·과거 이력 ↗</a></div>';
function pairGroupButtons(home=false){return Object.entries(PAIR_GROUPS).map(([key,g])=>`<button type="button" class="pair-group ${key===pairState.group&&!home?'selected':''}" data-pair-group="${key}" ${home?'':`aria-pressed="${key===pairState.group}"`}><span class="pair-group-top">${g.title}<span>${home?'시작하기 ↗':key===pairState.group?'선택됨 ✓':'선택'}</span></span><strong>${g.left} <i>↔</i> ${g.right}</strong><small>${g.note}</small></button>`).join('')}
function choosePair(group){if(group!==pairState.group){pairState.group=group;pairState.single=group==='specialist';pairState.region=['ALL','ALL'];pairState.keys=['',''];}const hash='#dashboard/'+group;if(location.hash!==hash)location.hash=hash;else renderPairDashboard();}
async function renderPairHome(){
 ++homeRequest;setHomeHero();
 $('#heroHeadline').innerHTML='비슷한 사업자끼리,<br>조건을 나란히 비교하세요.';
 $('#helloSub').textContent='AWS와 Oracle OCI, RunPod과 Nebius. 두 비교 그룹에서 가격과 상품 조건을 함께 확인하세요.';
 $('#helloWhy').textContent='메인 B300 · GB300 NVL72 · VR200 NVL72 / 참조 GB200 NVL72 · H100 · H200';
 $('#heroStatus').innerHTML=`<span><i class="status-mark"></i>데이터 적재 <b>${esc(fullAt(state.meta.run.started_at))}</b></span><span>비교 그룹 <b>2개</b></span><span>대상 사업자 <b>4곳</b></span><a href="/public-data">원본과 이력 보기 ↗</a>`;
 $('#homeBody').innerHTML=`<section class="pair-home"><div class="section-heading"><div><p class="eyebrow">CHOOSE YOUR COMPARISON</p><h2>어떤 두 사업자를 비교할까요?</h2><p>같은 모델과 계약 조건을 선택한 뒤, 각 사업자의 상품을 골라보세요.</p></div></div><div class="pair-groups">${pairGroupButtons(true)}</div><div class="pair-home-note"><b>GPU당 가격 ≠ 1 GPU 상품</b><span>GPU당 단가로 단위를 맞추고, 실제 상품의 GPU 수는 별도로 표시합니다. NVL72 자료도 4 GPU 노드와 72 GPU 전체 랙을 구분합니다.</span></div><div class="pair-home-links"><a href="/public-data">B300·B200 과거 차트와 수집 자료 ↗</a><a href="#catalog">전체 모델·상품 카탈로그 ↗</a></div>${pairSources()}</section>`;
 $('#homeBody').onclick=e=>{const b=e.target.closest('[data-pair-group]');if(b)choosePair(b.dataset.pairGroup)};
}
function pairShell(){
 let el=$('#pairWorkspace');if(!el){el=document.createElement('div');el.id='pairWorkspace';$('#v-dashboard').prepend(el)}
 document.body.classList.add('pair-mode');
 const models=state.meta.catalog_models||[],main=models.filter(m=>state.meta.gpu_models?.[m]?.priority==='main'),refs=models.filter(m=>!main.includes(m));
 const btn=m=>`<button type="button" class="pair-model" data-pair-model="${esc(m)}" aria-pressed="${m===state.f.model}">${esc(m)}</button>`;
 el.innerHTML=`<div class="pair-groups" aria-label="비교할 사업자 그룹">${pairGroupButtons()}</div>
 <section class="pair-controls" aria-label="공통 비교 조건"><div class="pair-controls-head"><div><span class="pair-step">01 / 공통 조건</span><h2>같은 모델·계약으로 맞추기</h2></div><button type="button" class="btn" id="pairReset">조건 초기화</button></div>
 <div class="pair-model-row"><span>메인</span><div>${main.map(btn).join('')}</div></div><div class="pair-model-row reference"><span>참조</span><div>${refs.map(btn).join('')}</div></div>
 <div class="pair-shared"><label>계약 조건<select id="pairTerm">${Object.entries(TERMS).filter(([k])=>k!=='5_YEAR').map(([v,t])=>`<option value="${v}" ${v===state.f.term?'selected':''}>${t}</option>`).join('')}</select></label><label class="pair-checkbox"><input id="pairSingle" type="checkbox" ${pairState.single?'checked':''}>1 GPU 표기 상품만 보기</label><span>단위: USD / GPU·시간 · 실제 판매 조건은 상품별 확인</span></div></section>
 <div class="pair-result-heading"><div><span class="pair-step">02 / 나란히 비교</span><h2>${esc(state.f.model)} <span>· ${esc(termL(state.f.term))}</span></h2></div><button id="pairDownload" class="btn" disabled>선택 비교 저장 ↓</button></div><div id="pairNotice" role="status" class="pair-status">두 사업자의 관측 가격을 불러오는 중…</div><div id="pairResults" aria-busy="true"></div>${pairSources()}`;
 el.onclick=e=>{const group=e.target.closest('[data-pair-group]'),model=e.target.closest('[data-pair-model]');if(group)choosePair(group.dataset.pairGroup);if(model&&state.f.model!==model.dataset.pairModel){state.f.model=model.dataset.pairModel;pairState.keys=['',''];pairState.region=['ALL','ALL'];renderPairDashboard()}};
 $('#pairTerm').onchange=e=>{state.f.term=e.target.value;pairState.keys=['',''];renderPairDashboard()};
 $('#pairSingle').onchange=e=>{pairState.single=e.target.checked;pairState.keys=['',''];pairState.region=['ALL','ALL'];renderPairDashboard()};
 $('#pairReset').onclick=()=>{state.f.model='B300';state.f.term='ON_DEMAND';pairState.single=pairState.group==='specialist';pairState.keys=['',''];pairState.region=['ALL','ALL'];renderPairDashboard()};
 $('#pairDownload').onclick=downloadPair;
}
async function renderPairDashboard(){
 const routeGroup=location.hash.split('/')[1];if(PAIR_GROUPS[routeGroup]&&routeGroup!==pairState.group){pairState.group=routeGroup;pairState.single=routeGroup==='specialist';pairState.region=['ALL','ALL'];pairState.keys=['',''];}
 const request=++pairState.request;pairState.data=null;pairShell();
 // The main workspace's currency toggles do not change this explicitly USD comparison.
 $('#pageTitle').textContent='사업자 2:2 가격 비교';$('#pageDesc').textContent='종합 클라우드와 GPU 전문 클라우드, 두 그룹을 나누어 비교합니다.';
 try{const d=await api('/api/pair-prices'+qs({model:state.f.model,term:state.f.term,group:pairState.group,single_gpu_only:pairState.single}));if(request!==pairState.request||state.view!=='dashboard')return;pairState.data=d;renderPairResults()}
 catch(e){if(request!==pairState.request)return;$('#pairNotice').textContent='가격 조회에 실패했습니다. 아래에서 다시 시도해 주세요.';$('#pairResults').innerHTML=`<div class="pair-empty"><h3>비교 자료를 불러오지 못했습니다</h3><p>${esc(e.message)}</p><button class="btn" id="pairRetry">다시 조회</button></div>`;$('#pairResults').setAttribute('aria-busy','false');$('#pairRetry').onclick=renderPairDashboard}
}
function currentPairRows(){return pairState.data.sides.map((s,i)=>PairLogic.selectOffer(s.offers,pairState.region[i],pairState.keys[i]))}
function renderPairResults(){
 const d=pairState.data;d.sides.forEach((s,i)=>{if(pairState.region[i]!=='ALL'&&!s.regions.includes(pairState.region[i]))pairState.region[i]='ALL'});
 const chosen=currentPairRows();chosen.forEach((r,i)=>{pairState.keys[i]=r?.product_key||''});
 const group=PAIR_GROUPS[d.group],comparison=PairLogic.compare(...chosen);
 $('#pairNotice').textContent=`${group.left} ↔ ${group.right} 전용 비교 · 유효 관측 ${d.count}개 · 같은 그룹의 두 사업자만 표시합니다.`;
 $('#pairDownload').disabled=!chosen.some(Boolean);
 const card=(s,i)=>{
  const r=chosen[i],options=s.offers.filter(x=>x.usable&&(pairState.region[i]==='ALL'||x.region===pairState.region[i]));
  const optionsHtml=options.map(x=>`<option value="${esc(x.product_key)}" ${r?.product_key===x.product_key?'selected':''}>${esc(x.sku)} · ${x.gpu_count} GPU · ${esc(pairRegion(x.region))} · ${pairPrice(x.normalized_price_usd)}</option>`).join('');
  return `<article class="pair-provider ${i===0?'left':'right'}"><div class="pair-provider-head"><span>${i===0?'A':'B'}</span><div><small>${group.title}</small><h3>${s.name}</h3></div><b>${s.fresh_count}개 유효 관측</b></div><div class="pair-provider-controls"><label>${s.name} 지역<select data-pair-region="${i}" ${s.regions.length?'':'disabled'}><option value="ALL">전체 관측 지역</option>${s.regions.map(x=>`<option value="${esc(x)}" ${pairState.region[i]===x?'selected':''}>${esc(pairRegion(x))}</option>`).join('')}</select></label><label>${s.name} 비교 상품<select data-pair-offer="${i}" ${options.length?'':'disabled'}>${optionsHtml||'<option>선택 가능한 상품 없음</option>'}</select></label></div>${r?`<div class="pair-quote"><span>선택 상품의 GPU당 요금</span><strong>${pairPrice(r.normalized_price_usd)}<small>/ GPU·시간</small></strong><p>${esc(r.sku)}</p><div class="pair-quote-tags"><span>${r.gpu_count} GPU 표기 구성</span><span>${esc(termL(r.contract_term))}</span>${d.model.includes('NVL72')?'<span class="attention">NVL72 기반 노드 · 전체 랙 아님</span>':''}</div></div><div class="pair-provider-foot"><span>${esc(pairAt(r.collected_at))}<small>${esc(r.data_source)}</small></span><button class="btn" data-pair-evidence="${i}">${s.name} 가격 근거 ↗</button></div>`:`<div class="pair-empty"><span>—</span><h4>${s.name}의 유효 가격이 없습니다</h4><p>${pairState.single&&s.unfiltered_count?'1 GPU 필터를 해제하면 다른 GPU 수의 상품이 표시될 수 있습니다.':s.offers.length?'남아 있는 관측은 오래되었거나 비교 조건을 충족하지 않습니다.':'선택한 모델·계약의 가격을 이번 수집 자료에서 확인하지 못했습니다.'}</p><p>미관측은 0원이나 미판매를 뜻하지 않습니다.</p></div>`}</article>`;
 };
 const spec=(label,values)=>`<tr><th scope="row">${label}</th>${values.map(v=>`<td>${v}</td>`).join('')}</tr>`;
 const read=(r,k,suffix='')=>r&&r[k]!=null?esc(r[k])+suffix:'미제공';
 const nodeCost=r=>r?pairPrice(PairLogic.configurationHour(r))+' / '+r.gpu_count+' GPU·시간':'—';
 const specs=[spec('GPU당 시간 요금',chosen.map(r=>r?pairPrice(r.normalized_price_usd):'—')),spec('표기 구성의 시간 요금',chosen.map(nodeCost)),spec('상품당 GPU 수',chosen.map(r=>read(r,'gpu_count',' GPU'))),spec('GPU 세부 형식',chosen.map(r=>read(r,'gpu_variant'))),spec('지역',chosen.map(r=>r?esc(pairRegion(r.region)):'—')),spec('vCPU / 시스템 메모리',chosen.map(r=>r?read(r,'vcpu')+' / '+read(r,'memory_gb',' GB'):'—')),spec('서비스 등급',chosen.map(r=>r?esc(r.tier||'미제공'):'—')),spec('재고 신호',chosen.map(r=>r?esc(({available:'있음',limited:'제한적',unavailable:'없음'})[r.availability]||'출처 미제공'):'—')),spec('출처 관측 시각',chosen.map(r=>r?esc(pairAt(r.collected_at)):'—'))].join('');
 let gap='<h3>양쪽의 가격이 있어야 차이를 계산할 수 있습니다.</h3><p>자료가 있는 사업자의 가격과 조건은 위에서 확인할 수 있습니다.</p>';
 if(comparison.available){const delta=comparison.delta,description=Math.abs(delta)<.0000001?'같음':delta>0?'높음':'낮음';gap=`<div><span>선택한 B 상품 − A 상품</span><h3>${group.right}의 GPU당 요금이 ${description}</h3><strong>${delta>0?'+':delta<0?'−':''}${pairPrice(Math.abs(delta))}<small> / GPU·시간</small></strong><p>${comparison.percent==null?'기준 가격이 0이어서 비율은 계산하지 않습니다.':`${group.left} 선택 요금 기준 ${comparison.percent>0?'+':''}${comparison.percent.toFixed(1)}%`}</p></div><div><b>조건 차이가 있는 참고 비교</b><p>${comparison.reasons.map(esc).join(' ')}</p><small>가격 차이는 성능 대비 가성비나 동일 조건 견적의 할인율을 뜻하지 않습니다.</small></div>`}
 const lists=d.sides.map((s,i)=>`<div><h4>${s.name} 전체 관측 ${s.offers.length}개</h4>${s.offers.length?`<div class="pair-observed-list">${s.offers.map((r,j)=>`<button type="button" data-pair-listed="${i}:${j}" ${r.usable?'':'disabled'}><span>${esc(r.sku)}<small>${esc(pairRegion(r.region))} · ${r.gpu_count} GPU${r.usable?'':' · 비교 제외'}</small></span><b>${pairPrice(r.normalized_price_usd)}</b></button>`).join('')}</div>`:'<p class="pair-muted">관측 자료 없음</p>'}</div>`).join('');
 $('#pairResults').innerHTML=`<div class="pair-provider-grid">${d.sides.map(card).join('')}</div><div class="pair-gap ${comparison.available?'':'empty'}">${gap}</div><section class="pair-specs"><div class="pair-spec-heading"><h3>상품 조건을 한 줄씩 비교하세요</h3><p>자동 선택은 각 사업자의 유효 관측 중 최저 단가입니다. 지역과 SKU를 바꿔 직접 맞출 수 있습니다.</p></div><div class="pair-table-wrap"><table><thead><tr><th scope="col">비교 항목</th><th scope="col">${group.left}</th><th scope="col">${group.right}</th></tr></thead><tbody>${specs}</tbody></table></div><p class="pair-footnote">표기 구성의 시간 요금은 원본 USD 시간 요금을 우선 사용하며, 없으면 GPU당 단가 × 표기 GPU 수로 계산합니다. 세금·스토리지·네트워크 추가 비용은 원문 확인이 필요합니다. ‘1 GPU’는 출처의 가격 구성 표기이며 최소 예약 수량을 보장하지 않습니다.</p></section><details class="pair-all"><summary>두 사업자의 전체 관측 펼치기 <span>${d.sides.reduce((n,s)=>n+s.offers.length,0)}개</span></summary><div class="pair-all-grid">${lists}</div></details>`;
 $('#pairResults').setAttribute('aria-busy','false');
 $('#pairResults').onchange=e=>{const r=e.target.dataset.pairRegion,o=e.target.dataset.pairOffer;if(r!==undefined){pairState.region[+r]=e.target.value;pairState.keys[+r]='';renderPairResults()}if(o!==undefined){pairState.keys[+o]=e.target.value;renderPairResults()}};
 $('#pairResults').onclick=e=>{const b=e.target.closest('[data-pair-evidence]'),offer=e.target.closest('[data-pair-listed]');if(b){showEvidence(currentPairRows()[+b.dataset.pairEvidence],d.model)}if(offer){const [i,j]=offer.dataset.pairListed.split(':').map(Number);pairState.region[i]='ALL';pairState.keys[i]=d.sides[i].offers[j].product_key;renderPairResults()}};
}
function downloadPair(){
 const d=pairState.data,rows=currentPairRows(),headers=['comparison_group','provider','model','contract','sku','region','gpu_count','usd_per_gpu_hour','configuration_usd_hour','observed_at','data_source','source_url'];
 const safeCell=x=>{let s=String(x??'');if(/^[=+@\-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
 const csv=[headers,...rows.filter(Boolean).map(r=>[d.title,r.provider_name,d.model,d.term,r.sku,r.region,r.gpu_count,r.normalized_price_usd,PairLogic.configurationHour(r),r.collected_at,r.data_source,r.source_url])].map(r=>r.map(safeCell).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`GPU_${d.group}_${d.model}_${d.term}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
READABLE_PAGES.dashboard=['PROVIDER PAIRS','사업자 2:2 가격 비교','종합 클라우드와 GPU 전문 클라우드, 두 그룹을 나누어 비교합니다.'];
RENDER.home=renderPairHome;RENDER.dashboard=renderPairDashboard;renderDash=renderPairDashboard;
// Old comparison links lead to the same pair workspace instead of mixing all four providers.
RENDER.compare=()=>{location.hash='#dashboard'};
PAGES.dashboard.tools=false;
for(const item of PORTAL_ROUTES){if(item[0]==='dashboard'){item[1]='사업자 2:2 비교';item[2]='AWS ↔ Azure / Nebius ↔ Verda'}if(item[0]==='compare'){item[1]='사업자 비교 조건';item[2]='두 사업자의 상품 조건 맞추기'}}
