/* Match chart labels to the locally hosted site typeface. */
(() => {
 if(!window.Chart)return;
 Chart.defaults.font.family='"Noto Sans KR", "Malgun Gothic", sans-serif';
 if(document.fonts){
  Promise.all([document.fonts.load('400 14px "Noto Sans KR"'),document.fonts.load('500 16px "Noto Sans KR"')]).then(()=>{
   Object.values(Chart.instances||{}).forEach(chart=>{if(chart.canvas?.isConnected)chart.update('none');});
  }).catch(()=>{});
 }
})();
