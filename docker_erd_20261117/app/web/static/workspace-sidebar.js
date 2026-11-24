/* Single shared navigation for the workspace and collected-data page. */
(() => {
 'use strict';
 const standalone=location.pathname.endsWith('/public-data.html')||location.pathname.replace(/\/$/,'')==='/public-data';
 const groups=[
  ['시세 분석','bar-chart-line',[['catalog','GPU 탐색·가격 비교'],['dashboard','사업자 비교'],['discounts','계약 할인'],['trend','가격 이력'],['data','수집 데이터·품질']]],
  ['원가·가격 시뮬레이션','calculator',[['cost','원가·제안가'],['forecast','몬테카를로 시뮬레이션']]],
  ['AI 질의','chat-square-text',[['agent','Pricing Copilot']]],
 ];
 const icon=name=>`<img src="/static/icons/${name}.svg" alt="" width="18" height="18">`;
 const href=id=>(standalone?'/':'')+'#'+id;
 const link=([id,title])=>`<a href="${href(id)}" data-ws-route="${id}">${title}</a>`;
 document.body.classList.add('workspace-sidebar');
 if(standalone)document.body.classList.add('workspace-data');
 const aside=document.createElement('aside');aside.id='workspaceSidebar';aside.setAttribute('aria-label','업무 메뉴');
 aside.innerHTML=`<div class="ws-identity">${icon('cpu')}<div><b>GPU 가격 리서치</b><span>시장 비교 · 가격 검토</span></div></div><span class="ws-caption">업무 메뉴</span><a class="ws-home" href="${href('home')}" data-ws-route="home">${icon('grid-3x3-gap')}홈</a><nav aria-label="전체 업무">${groups.map(([name,i,items],n)=>`<details class="ws-group" ${n===0?'open':''}><summary>${icon(i)}<span>${name}</span></summary>${items.map(link).join('')}</details>`).join('')}</nav><div class="ws-foot">GPU 시세 인덱스</div>`;
 document.body.append(aside);
 const toggle=document.createElement('button');toggle.id='workspaceMenuToggle';toggle.type='button';toggle.textContent='☰ 메뉴';toggle.setAttribute('aria-controls','workspaceSidebar');toggle.setAttribute('aria-expanded','false');
 const header=document.querySelector('.gnb-in')||document.querySelector('body > nav');header.prepend(toggle);
 const backdrop=document.createElement('button');backdrop.id='workspaceMenuBackdrop';backdrop.type='button';backdrop.setAttribute('aria-label','메뉴 닫기');backdrop.tabIndex=-1;document.body.append(backdrop);
 function close(restore=false){document.body.classList.remove('ws-menu-open');toggle.setAttribute('aria-expanded','false');if(restore)toggle.focus();}
 toggle.onclick=()=>{const open=document.body.classList.toggle('ws-menu-open');toggle.setAttribute('aria-expanded',String(open));if(open)aside.querySelector('a').focus();};
 backdrop.onclick=()=>close(true);
 aside.addEventListener('click',e=>{if(e.target.closest('a'))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('ws-menu-open'))close(true);});
 function sync(){const route=standalone?'data':location.hash.slice(1).split('/')[0]||'home';aside.querySelectorAll('[data-ws-route]').forEach(a=>{const current=a.dataset.wsRoute===(route==='compare'?'catalog':route);if(current){a.setAttribute('aria-current','page');const group=a.closest('details');if(group)group.open=true;}else a.removeAttribute('aria-current');});close();}
 window.addEventListener('hashchange',sync);sync();
})();
