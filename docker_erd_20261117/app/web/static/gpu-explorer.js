/* Discovery is the entry point; model details contain the comparison tools. */
(() => {
  'use strict';
  const shell=document.createElement('section');
  shell.id='gpuExplorer';
  shell.setAttribute('aria-label','GPU 모델·사업자 탐색');
  shell.innerHTML=`<header class="gx-hero"><p class="gx-eyebrow">GPU 시세 인덱스</p><h1>GPU 모델<span>·</span>사업자 탐색</h1><p>GPU 모델이나 사업자를 선택하면 상품 구성과 국가별 가격을 함께 확인할 수 있습니다.</p></header>`;
  document.getElementById('content').prepend(shell);
  function sync(){
    const [view,kind]=location.hash.slice(1).split('/');
    const active=view==='catalog';
    shell.hidden=!active||Boolean(kind);
    document.body.classList.toggle('gpu-explorer',active);
    document.body.classList.toggle('gpu-explorer-detail',active&&Boolean(kind));
  }
  window.addEventListener('hashchange',sync);sync();
})();
