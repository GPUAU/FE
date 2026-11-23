/* One-shot section entrances. No scroll hijacking, data changes or persistent motion. */
(() => {
 'use strict';
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 if(!('IntersectionObserver' in window)||!('MutationObserver' in window))return;
 const root=document.getElementById('content')||document.querySelector('main');
 if(!root)return;
 const selector='.cp-hero,.cp-overview,.cp-explorer,.rw-catalog-trend,.rw-chart-card,.rw-pair-card,.discount-comparison,.mc-panel';
 const registered=new WeakSet();let frame=0;
 const observer=new IntersectionObserver(entries=>{
  let visible=0;
  entries.forEach(entry=>{
   if(!entry.isIntersecting)return;
   observer.unobserve(entry.target);
   if(reduced.matches)return;
   entry.target.style.setProperty('--polish-delay',Math.min(visible++,2)*45+'ms');
   entry.target.classList.add('polish-enter');
  });
 },{threshold:.06});
 function scan(){
  frame=0;
  root.querySelectorAll(selector).forEach(el=>{
   if(registered.has(el))return;
   registered.add(el);
   if(!reduced.matches)observer.observe(el);
  });
 }
 const mutations=new MutationObserver(records=>{
  records.forEach(record=>record.removedNodes.forEach(node=>{
   if(node.nodeType!==1)return;
   observer.unobserve(node);
   node.querySelectorAll(selector).forEach(el=>observer.unobserve(el));
  }));
  if(!frame&&records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1)))frame=requestAnimationFrame(scan);
 });
 mutations.observe(root,{childList:true,subtree:true});
 root.addEventListener('animationend',event=>{
  if(['polish-enter','corporate-enter'].includes(event.animationName))event.target.classList.remove('polish-enter');
 });
 root.addEventListener('focusin',event=>event.target.closest('.polish-enter')?.classList.remove('polish-enter'));
 reduced.addEventListener('change',()=>{
  if(reduced.matches){observer.disconnect();root.querySelectorAll('.polish-enter').forEach(el=>el.classList.remove('polish-enter'));}
 });
 scan();
})();
