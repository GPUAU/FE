/* Isolated, browser-local prototype. All events below are fictional. */
(() => {
  'use strict';
  const KEY = 'gpu-market-alerts-demo-v1';
  const providers = ['Nebius', 'AWS', 'Azure'];
  const events = [
    {id:'n1',provider:'Nebius',gpu:'B300',type:'price',time:'오늘 14:20',title:'B300 온디맨드 요금 10% 인하',summary:'신규 고객 대상 한 달 할인이라는 가상 상황입니다. 상시 요금과 프로모션 조건을 구분해 검토하세요.',old:5,price:4.5,region:'유럽',term:'온디맨드',reason:'공식 공지에 할인 조건이 명시된 경우',conditions:'신규 고객 · 1개월 한정 · GPU 1장 기준',action:'프로모션 종료 후 요금과 기존 고객 적용 여부를 확인하세요.'},
    {id:'n2',provider:'AWS',gpu:'H200',type:'launch',time:'오늘 11:40',title:'H200 기반 GPU 인스턴스 출시',summary:'관심 GPU의 신규 상품 출시를 알리는 예시입니다. GPU 수와 리전, 계약 조건을 기존 상품과 비교할 수 있습니다.',region:'미국',term:'신규 상품',reason:'상품 출시 발표를 확인한 경우',conditions:'가격 변동 없음 · 신규 상품 소식',action:'동일 GPU 구성의 상품을 확인하고 비교 대상에 포함할지 검토하세요.'},
    {id:'n3',provider:'Azure',gpu:'H100',type:'supply',time:'오늘 09:10',title:'H100 제공 리전 확대 발표',summary:'공급 관련 소식을 선별한 예시입니다. 리전 확대만으로 가격 하락이나 수요 변화를 단정하지 않습니다.',region:'아시아',term:'공급 변화',reason:'관련 동향 · 가격과의 인과관계 미확인',conditions:'가격 변화 미확인 · 제공 지역 확대',action:'관심 리전에서의 상품 제공 여부와 실제 요금을 후속 확인하세요.'},
    {id:'n4',provider:'Nebius',gpu:'H200',type:'price',time:'어제 16:30',title:'H200 동일 상품 요금 6% 하락',summary:'동일 조건의 가격 하락을 감지했지만 관련 발표를 찾지 못한 예시입니다. 가격 변화와 그 원인을 분리해 표시합니다.',old:3.5,price:3.29,region:'유럽',term:'온디맨드',reason:'가격 변화 확인 · 인하 배경 미확인',conditions:'동일 리전 · 동일 GPU 수 · 동일 요금제',action:'가격 변경 사실은 확인하되, 인하 원인은 추가 근거가 필요합니다.'}
  ];
  const labels={all:'전체 소식',price:'가격 변동',launch:'신상품',supply:'공급 동향'};
  let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
  const prefs={providers:Array.isArray(saved.providers)?saved.providers.filter(x=>providers.includes(x)):[...providers],gpu:['ALL','B300','H200','H100'].includes(saved.gpu)?saved.gpu:'ALL',threshold:[0,5,10].includes(saved.threshold)?saved.threshold:5};
  let activeProvider='ALL',activeType='all',unreadOnly=false;
  const read=new Set(Array.isArray(saved.read)?saved.read.filter(x=>events.some(e=>e.id===x)):[]);
  const icon=(name)=>`<span class="ma-icon" aria-hidden="true">${({bell:'♧',price:'↘',launch:'＋',supply:'◎'})[name]||'◎'}</span>`;
  function persist(){try{localStorage.setItem(KEY,JSON.stringify({...prefs,read:[...read]}));return true;}catch{return false;}}
  function scoped(){return events.filter(e=>prefs.providers.includes(e.provider)&&(prefs.gpu==='ALL'||e.gpu===prefs.gpu)&&(e.type!=='price'||Math.round((1-e.price/e.old)*100)>=prefs.threshold));}
  function filtered(){return scoped().filter(e=>(activeProvider==='ALL'||e.provider===activeProvider)&&(activeType==='all'||e.type===activeType)&&(!unreadOnly||!read.has(e.id)));}
  function render(){
    const root=document.getElementById('v-favorites');if(!root)return;
    if(typeof READABLE_PAGES!=='undefined')READABLE_PAGES.favorites=['시세 분석','관심 사업자 모아보기','관심 사업자의 가격 변화와 시장 소식을 한곳에서 확인하세요.'];
    document.getElementById('pageDesc').textContent='관심 사업자의 가격 변화와 시장 소식을 한곳에서 확인하세요.';
    const all=scoped(),list=filtered(),unread=all.filter(e=>!read.has(e.id)).length;
    root.innerHTML=`<div class="ma-page">
      <div class="ma-demo"><span>PREVIEW</span><p><b>시장 뉴스·알림 미리보기</b> 모든 가격·뉴스는 화면 검토용 가상 예시입니다. 실제 수집·발송은 연결되지 않았습니다.</p></div>
      <section class="ma-watch" aria-labelledby="maWatchTitle"><div class="ma-heading"><div><span class="ma-eyebrow">MY WATCHLIST</span><h2 id="maWatchTitle">관심 사업자</h2></div><button class="ma-button" data-ma="settings">관심 조건 설정</button></div>
      <div class="ma-watchline"><div class="ma-providers" aria-label="사업자 필터"><button data-provider="ALL" aria-pressed="${activeProvider==='ALL'}">전체 <span>${prefs.providers.length}</span></button>${prefs.providers.map(p=>`<button data-provider="${p}" aria-pressed="${activeProvider===p}"><i class="ma-brand ma-${p.toLowerCase()}">${p==='Nebius'?'N':p==='AWS'?'a':'▦'}</i>${p}</button>`).join('')}</div><p>관심 GPU <b>${prefs.gpu==='ALL'?'전체':prefs.gpu}</b><span>·</span> 가격 하락 <b>${prefs.threshold}% 이상</b></p></div></section>
      <section class="ma-stats" aria-label="관심 조건에 맞는 예시 현황"><div><span>관심 사업자</span><strong>${prefs.providers.length}<small>곳</small></strong></div><div><span>시장 소식 <small>예시</small></span><strong>${all.length}<small>건</small></strong></div><div><span>가격 하락 <small>예시</small></span><strong class="ma-down">${all.filter(e=>e.type==='price').length}<small>건</small></strong></div><div><span>아직 읽지 않은 소식</span><strong>${unread}<small>건</small></strong></div></section>
      <section class="ma-news" aria-labelledby="maNewsTitle"><div class="ma-heading"><div><span class="ma-eyebrow">MARKET INTELLIGENCE</span><h2 id="maNewsTitle">시장 뉴스·알림 <small>${list.length}</small></h2><p>중요한 변화부터 확인하고, 다음 가격 검토로 이어가세요.</p></div><button class="ma-text-button" data-ma="readall" ${!unread?'disabled':''}>모두 읽음</button></div>
      <div class="ma-toolbar"><div class="ma-tabs" aria-label="소식 유형">${Object.entries(labels).map(([k,v])=>`<button data-type="${k}" aria-pressed="${activeType===k}">${v}</button>`).join('')}</div><label><input id="maUnread" type="checkbox" ${unreadOnly?'checked':''}> 안 읽은 소식만</label></div>
      <div class="ma-feed">${list.length?list.map(e=>`<article class="ma-card ${read.has(e.id)?'is-read':''}"><div class="ma-card-icon ma-kind-${e.type}">${icon(e.type)}</div><div class="ma-card-body"><div class="ma-meta"><b>${e.provider}</b><span>${e.gpu}</span><span class="ma-tag ma-kind-${e.type}">${labels[e.type]}</span><span class="ma-example">가상 예시</span><time>${e.time}</time>${!read.has(e.id)?'<span class="ma-new">NEW</span>':''}</div><h3><button data-event="${e.id}">${e.title}</button></h3><p>${e.summary}</p>${e.type==='price'?`<div class="ma-price"><del>$${e.old.toFixed(2)}</del><strong>$${e.price.toFixed(2)}</strong><span>/ GPU·시간</span><b>−${Math.round((1-e.price/e.old)*100)}%</b><small>${e.conditions}</small></div>`:`<div class="ma-condition">${e.conditions}</div>`}<div class="ma-card-bottom"><span>${e.type==='supply'||e.id==='n4'?'ⓘ':'▤'} ${e.reason}</span><button class="ma-text-button" data-event="${e.id}">상세·근거 보기</button></div></div></article>`).join(''):'<div class="ma-empty"><b>선택한 조건의 소식이 없습니다.</b><p>사업자·GPU 또는 알림 조건을 바꿔보세요.</p><button class="ma-button" data-ma="reset">필터 초기화</button></div>'}</div>
      <div class="ma-footer-note">가격 변동은 동일 상품 조건으로 비교하고, 뉴스의 관련성과 가격 변화 원인은 구분해 제공합니다.</div></section>
    </div>`;
    root.onclick=e=>{
      const p=e.target.closest('[data-provider]'),t=e.target.closest('[data-type]'),item=e.target.closest('[data-event]'),a=e.target.closest('[data-ma]');
      if(p){activeProvider=p.dataset.provider;render();}
      if(t){activeType=t.dataset.type;render();}
      if(item)detail(item.dataset.event);
      if(a?.dataset.ma==='settings')settings();
      if(a?.dataset.ma==='readall'){all.forEach(x=>read.add(x.id));persist();render();}
      if(a?.dataset.ma==='reset'){activeProvider='ALL';activeType='all';unreadOnly=false;render();}
    };
    root.querySelector('#maUnread').onchange=e=>{unreadOnly=e.target.checked;render();};
  }
  function dialog(title,body){
    document.getElementById('maDialog')?.remove();
    const d=document.createElement('dialog');d.id='maDialog';d.className='ma-dialog';d.setAttribute('aria-labelledby','maDialogTitle');
    d.innerHTML=`<div class="ma-dialog-top"><span class="ma-eyebrow">MARKET INTELLIGENCE · PREVIEW</span><button type="button" class="ma-close" aria-label="닫기">✕</button></div><h2 id="maDialogTitle">${title}</h2>${body}`;
    document.body.append(d);d.querySelector('.ma-close').onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});d.addEventListener('close',()=>d.remove());d.showModal();return d;
  }
  function detail(id){
    const e=events.find(x=>x.id===id);if(!e)return;
    const trigger=document.querySelector(`[data-event="${id}"]`);read.add(id);persist();
    const d=dialog(e.title,`<p class="ma-dialog-sub">${e.provider} · ${e.gpu} · ${e.time} <span class="ma-example">가상 예시</span></p><div class="ma-detail-summary">${e.summary}</div><dl class="ma-facts"><div><dt>비교 조건</dt><dd>${e.region} · ${e.term} · ${e.gpu}</dd></div><div><dt>적용 범위</dt><dd>${e.conditions}</dd></div><div><dt>근거 구분</dt><dd>${e.reason}</dd></div><div><dt>원문 출처</dt><dd>예시 데이터이므로 실제 기사·공식 공지 링크가 없습니다.</dd></div></dl><div class="ma-next"><b>다음 검토 사항</b><p>${e.action}</p></div><p class="ma-dialog-sub">아래 버튼은 기존 분석 화면을 엽니다. 예시 가격은 실제 데이터에 반영되지 않습니다.</p><div class="ma-dialog-actions"><a class="ma-button" href="#dashboard">현재 수집 가격 보기</a><a class="ma-button ma-primary" href="#decision">판매가 검토 화면</a></div>`);
    d.querySelectorAll('a').forEach(a=>a.onclick=()=>d.close());
    d.addEventListener('close',()=>{if(state.view==='favorites'){render();document.querySelector(`[data-event="${id}"]`)?.focus();}});
  }
  function settings(){
    const d=dialog('관심 조건 설정',`<p class="ma-dialog-sub">선택한 조건은 이 브라우저의 미리보기에만 저장됩니다.</p><form id="maSettings"><fieldset><legend>관심 사업자</legend><div class="ma-checks">${providers.map(p=>`<label><input type="checkbox" name="provider" value="${p}" ${prefs.providers.includes(p)?'checked':''}> ${p}</label>`).join('')}</div></fieldset><div class="ma-form-grid"><label>관심 GPU<select name="gpu">${['ALL','B300','H200','H100'].map(g=>`<option value="${g}" ${prefs.gpu===g?'selected':''}>${g==='ALL'?'전체 GPU':g}</option>`).join('')}</select></label><label>가격 하락 알림 기준<select name="threshold">${[0,5,10].map(n=>`<option value="${n}" ${prefs.threshold===n?'selected':''}>${n===0?'모든 가격 하락':n+'% 이상 하락'}</option>`).join('')}</select></label></div><div class="ma-next"><b>사이트 내 알림 미리보기</b><p>신상품·공급 소식은 가격 기준과 별도로 표시합니다. 이메일 및 외부 알림은 발송하지 않습니다.</p></div><p id="maFormStatus" role="status"></p><div class="ma-dialog-actions"><button type="button" class="ma-button" id="maCancel">취소</button><button type="submit" class="ma-button ma-primary">설정 적용</button></div></form>`);
    d.querySelector('#maCancel').onclick=()=>d.close();
    d.querySelector('form').onsubmit=ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget);prefs.providers=f.getAll('provider');prefs.gpu=f.get('gpu');prefs.threshold=Number(f.get('threshold'));activeProvider='ALL';activeType='all';const ok=persist();render();if(ok)d.close();else d.querySelector('#maFormStatus').textContent='현재 화면에 적용했습니다. 브라우저 저장은 사용할 수 없습니다.';};
  }
  RENDER.favorites=render;
})();
