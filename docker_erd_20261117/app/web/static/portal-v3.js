/* Enterprise presentation layer. Navigation uses existing application routes. */
const PORTAL_ROUTES = [
 ['home','워크스페이스 홈','업무 시작 · 시장 요약과 바로가기','grid-3x3-gap','홈 메인 시작'],
 ['dashboard','GPU 가격 비교','모델·계약·지역별 가격과 환산 근거','bar-chart-line','시세 대시보드 최저가 시장'],
 ['catalog','GPU 탐색·가격 비교','모델·사업자 탐색부터 조건별 요금 비교까지','cpu','GPU 카탈로그 상품 사양 공급자 조건별 가격 비교 할인 계약'],
 ['compare','계약 조건별 비교','온디맨드·스팟·약정 가격 비교','sliders','할인 계약'],
 ['trend','가격 추이와 관측 이력','저장된 가격과 변화 시점 확인','graph-up-arrow','과거 차트 시차 생애주기'],
 ['cost','원가·제안가 점검','입력 가정으로 손익과 제안가 계산','calculator','원가 비용 손익 마진'],
 ['agent','Pricing Copilot','자연어로 수집된 가격에 질문하기','chat-square-text','AI 에이아이 질문 챗봇'],
 ['discounts','계약기간별 할인','계약별 할인과 비교 가능 조건','sliders','할인 약정 스팟'],
 ['inquiries','워크스페이스 문의','함께 확인하는 문의와 답변','folder2-open','문의 도움 지원']
];
const portalIcon = name => `<span class="bi-icon" style="--bi:url('/static/icons/${name}.svg')" aria-hidden="true"></span>`;
const PORTAL_NEXT = {
 dashboard:['관련 분석', ['trend','cost','agent']],
 compare:['관련 분석', ['dashboard','cost','trend']],
 trend:['관련 분석', ['dashboard','cost','agent']],
 cost:['원가와 시장가격을 함께 확인하세요.', ['dashboard','trend','agent']],
 bizcase:['시나리오의 가정을 더 구체적으로.', ['cost','dashboard','trend']],
 discounts:['관련 비교', ['compare','dashboard','agent']],
 qa:['검증 결과에서 원본 근거까지.', ['dashboard','trend','agent']]
};
function updateEnterpriseShell(view){
 const groupIcons={gMarket:'bar-chart-line',gCost:'calculator',gBiz:'graph-up-arrow',gAi:'chat-square-text',gQuality:'shield-check',gSettings:'folder2-open',gAdmin:'database-check'};
 document.querySelectorAll('.nav-section').forEach(el=>{
  const icon=el.querySelector('.nav-icon');if(icon&&!icon.dataset.bootstrap){icon.innerHTML=portalIcon(groupIcons[el.dataset.navGroup]||'grid-3x3-gap');icon.dataset.bootstrap='true';}
 });
 const visual=$('#portalVisual');
 const route=PORTAL_ROUTES.find(r=>r[0]===view);
 visual.dataset.kind=['dashboard','catalog','compare','trend','discounts'].includes(view)?'photo':'graphic';
 visual.innerHTML=visual.dataset.kind==='photo'?'<img src="/static/img/enterprise-datacenter.jpg" alt="" width="1800" height="1200"><span>AI INFRASTRUCTURE</span>':`${portalIcon(route?.[3]||'grid-3x3-gap')}<span>${view==='agent'?'ASK. COMPARE. DECIDE.':'DATA TO DECISION'}</span>`;
 $('#portalGuideButton').hidden=['users','db','admin-inquiries','inquiries'].includes(view);
 const next=$('#portalNext'),config=PORTAL_NEXT[view];next.hidden=!config;
 if(config){next.innerHTML=`<div class="portal-next-heading"><span>관련 업무</span><h2>${config[0]}</h2></div><div class="portal-next-grid">${config[1].map(id=>{const r=PORTAL_ROUTES.find(x=>x[0]===id);return `<a href="#${id}">${portalIcon(r[3])}<div><b>${r[1]}</b><p>${r[2]}</p></div><span aria-hidden="true">↗</span></a>`;}).join('')}</div>`;}
 $('#portalHomeLink').setAttribute('aria-current',view==='home'?'page':'false');
}

let portalSearchRows=[],portalSearchActive=0,portalDialogTrigger=null;
function paintPortalSearch(){
 const q=$('#portalSearchInput').value.trim().toLocaleLowerCase();
 portalSearchRows=PORTAL_ROUTES.filter(r=>r[0]!=='compare'&&r.join(' ').toLocaleLowerCase().includes(q));portalSearchActive=0;
 $('#portalSearchResults').innerHTML=portalSearchRows.map((r,i)=>`<li id="portalOption${i}" role="option" aria-selected="${i===0}" data-portal-route="${r[0]}">${portalIcon(r[3])}<div><b>${r[1]}</b><span>${r[2]}</span></div><span class="search-enter" aria-hidden="true">↵</span></li>`).join('');
 $('#portalSearchEmpty').hidden=!!portalSearchRows.length;
 $('#portalSearchCount').textContent=`${portalSearchRows.length}개 메뉴`;
 if(portalSearchRows.length)$('#portalSearchInput').setAttribute('aria-activedescendant','portalOption0');else $('#portalSearchInput').removeAttribute('aria-activedescendant');
}
function openPortalDialog(id){
 const dialog=$(id);if(dialog.open)return;
 portalDialogTrigger=document.activeElement;dialog.showModal();
 if(id==='#portalSearchDialog'){$('#portalSearchInput').value='';paintPortalSearch();$('#portalSearchInput').focus();}
}
function closePortalDialog(dialog){dialog.close();}
function selectPortalRoute(id){
 closePortalDialog($('#portalSearchDialog'));location.hash='#'+id;
}
document.addEventListener('click',e=>{
 if(e.target.closest('[data-open-launcher]'))openPortalDialog('#portalSearchDialog');
 if(e.target.closest('[data-open-guide]'))openPortalDialog('#portalGuideDialog');
 const close=e.target.closest('[data-close-portal]');if(close)closePortalDialog(close.closest('dialog'));
 const route=e.target.closest('[data-portal-route]');if(route)selectPortalRoute(route.dataset.portalRoute);
});
$('#portalSearchInput').addEventListener('input',paintPortalSearch);
$('#portalSearchInput').addEventListener('keydown',e=>{
 if(e.isComposing||e.keyCode===229)return;
 if(['ArrowDown','ArrowUp'].includes(e.key)&&portalSearchRows.length){
  e.preventDefault();portalSearchActive=(portalSearchActive+(e.key==='ArrowDown'?1:-1)+portalSearchRows.length)%portalSearchRows.length;
  $('#portalSearchResults').querySelectorAll('[role=option]').forEach((el,i)=>el.setAttribute('aria-selected',String(i===portalSearchActive)));
  $('#portalSearchInput').setAttribute('aria-activedescendant','portalOption'+portalSearchActive);
  $('#portalOption'+portalSearchActive).scrollIntoView({block:'nearest'});
 }else if(e.key==='Enter'&&portalSearchRows.length){e.preventDefault();selectPortalRoute(portalSearchRows[portalSearchActive][0]);}
});
document.addEventListener('keydown',e=>{
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]:not(#portalSearchDialog)')){e.preventDefault();openPortalDialog('#portalSearchDialog');}
});
document.querySelectorAll('.portal-dialog').forEach(dialog=>{
 dialog.addEventListener('close',()=>portalDialogTrigger?.focus());
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
});
