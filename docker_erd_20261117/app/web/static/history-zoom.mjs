const DAY=86400000;
export function clampWindow(a,b,fullMin,fullMax){
 const minimum=Math.min(DAY,fullMax-fullMin),width=Math.min(Math.max(Math.abs(b-a),minimum),fullMax-fullMin);
 const lo=Math.max(fullMin,Math.min(Math.min(a,b),fullMax-width));return [lo,lo+width];
}
export function wheelWindow(min,max,anchor,delta,fullMin,fullMax){
 const factor=Math.exp(Math.max(-180,Math.min(180,delta))*.003);
 return clampWindow(anchor+(min-anchor)*factor,anchor+(max-anchor)*factor,fullMin,fullMax);
}
export function visibleExtent(points,min,max){
 const values=[];
 for(let i=0;i<points.length;i++){
  const p=points[i];if(p.x>=min&&p.x<=max)values.push(p.min,p.max);
  const q=points[i+1];if(q)for(const x of [min,max])if(p.x<x&&x<q.x){const t=(x-p.x)/(q.x-p.x);values.push(p.min+(q.min-p.min)*t,p.max+(q.max-p.max)*t);}
 }
 if(!values.length)return null;
 const lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.13,Math.abs(hi)*.025,.01);
 const raw=(hi-lo+2*pad)/5,base=10**Math.floor(Math.log10(raw));
 const step=[1,2,2.5,5,10].find(n=>n*base>=raw)*base;
 return {min:Math.max(0,Number((Math.floor((lo-pad)/step)*step).toPrecision(12))),max:Number((Math.ceil((hi+pad)/step)*step).toPrecision(12))};
}
export function historyTicks(min,max){
 const hours=[6,12,24,48,72,120,168,336,720,1440,2160];
 const step=(hours.find(h=>h*3600000>=(max-min)/6)||4320)*3600000,offset=9*3600000;
 const ticks=[];for(let x=Math.ceil((min+offset)/step)*step-offset;x<=max;x+=step)ticks.push({value:x});
 return ticks;
}
export function historyZoom({reset,zoomIn,zoomOut,status,format,summary,curve,fullMin,fullMax,scopeLabel,presets,medianOnly=false}){
 const extentPoints=medianOnly?curve.map(p=>({...p,min:p.median,max:p.median})):curve;
 let cleanup=()=>{},hover=null,drag=null;
 const fitY=chart=>{const e=visibleExtent(extentPoints,chart.options.scales.x.min,chart.options.scales.x.max);if(e)Object.assign(chart.options.scales.y,e);};
 return {id:'historyWheelZoom',beforeInit:fitY,afterInit(chart){
  const canvas=chart.canvas,parent=canvas.parentElement,oldCursor=canvas.style.cursor;
  canvas.style.cursor='grab';canvas.setAttribute('tabindex','0');canvas.setAttribute('aria-label','가격 추이. 마우스를 올리면 중앙값·최댓값·최솟값 표시. Enter로도 확인, Esc로 닫기. 휠로 확대·축소, 드래그로 기간 이동. 키보드 +, -, 방향키, Home 사용 가능.');
  const tip=document.createElement('div');tip.className='history-hover';parent.append(tip);
  tip.setAttribute('role','tooltip');
  const announce=()=>{const {min,max}=chart.options.scales.x;reset.disabled=Math.abs(min-fullMin)<1&&Math.abs(max-fullMax)<1;zoomOut.disabled=reset.disabled;zoomIn.disabled=max-min<=Math.min(DAY,fullMax-fullMin)+1;status.textContent=format(min)+' — '+format(max)+' · KST';presets.forEach(b=>{const days=Number(b.dataset.historyDays);b.setAttribute('aria-pressed',String(days===0?reset.disabled:Math.abs(max-fullMax)<1&&Math.abs(min-Math.max(fullMin,fullMax-days*DAY))<1));});};
  const apply=(a,b)=>{const [min,max]=clampWindow(a,b,fullMin,fullMax);hover=null;tip.style.display='none';Object.assign(chart.options.scales.x,{min,max});fitY(chart);chart.update('none');announce();};
  const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*chart.width/r.width,y:(e.clientY-r.top)*chart.height/r.height};};
  const inside=p=>{const a=chart.chartArea;return a&&p.x>=a.left&&p.x<=a.right&&p.y>=a.top&&p.y<=a.bottom;};
  const wheel=e=>{const p=point(e);if(!inside(p))return;e.preventDefault();const {min,max}=chart.options.scales.x;const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?300:1);apply(...wheelWindow(min,max,chart.scales.x.getValueForPixel(p.x),delta,fullMin,fullMax));};
  const clear=()=>{hover=null;tip.style.display='none';chart.draw();};
  const nearest=p=>{
   const {min,max}=chart.options.scales.x,x=chart.scales.x.getValueForPixel(p.x),visible=summary.filter(r=>r.x>=min&&r.x<=max);
   return visible.length?visible.reduce((a,b)=>Math.abs(a.x-x)<=Math.abs(b.x-x)?a:b):null;
  };
  const show=p=>{
   if(!hover)return;
   const priceText='중앙값: $'+hover.median.toFixed(2)+'\n최댓값: $'+hover.max.toFixed(2)+'\n최솟값: $'+hover.min.toFixed(2);
   tip.textContent=(scopeLabel?scopeLabel+'\n':'')+format(hover.x)+' · 실제 관측\n'+priceText+'\nUSD / GPU·시간 · '+hover.count+'개 오퍼';
   tip.style.display='block';
   const r=canvas.getBoundingClientRect();const anchorX=p.x*r.width/chart.width,right=anchorX+16;tip.style.left=Math.max(0,right+tip.offsetWidth<=parent.clientWidth-8?right:anchorX-tip.offsetWidth-16)+'px';tip.style.top=Math.max(0,Math.min(p.y*r.height/chart.height-35,parent.clientHeight-tip.offsetHeight))+'px';chart.draw();
  };
  const move=e=>{const p=point(e);if(drag){if(e.pointerId!==drag.id)return;if(!drag.moved&&Math.hypot(p.x-drag.x,p.y-drag.y)<5)return;drag.moved=true;const shift=(p.x-drag.x)*(drag.max-drag.min)/(chart.chartArea.right-chart.chartArea.left);apply(drag.min-shift,drag.max-shift);return;}
   if(!inside(p)){clear();return;}hover=nearest(p);if(!hover){clear();return;}show(p);
  };
  const down=e=>{if(e.button!==0||e.pointerType==='touch'||!inside(point(e)))return;e.preventDefault();canvas.focus({preventScroll:true});const p=point(e);drag={id:e.pointerId,x:p.x,y:p.y,moved:false,min:chart.options.scales.x.min,max:chart.options.scales.x.max};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';};
  const stop=()=>{if(!drag)return;const id=drag.id;drag=null;canvas.style.cursor='grab';if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);};
  const restore=()=>{stop();apply(fullMin,fullMax);};
  const resize=f=>()=>{stop();const {min,max}=chart.options.scales.x,mid=(min+max)/2;apply(mid-(max-min)*f/2,mid+(max-min)*f/2);};
  const inward=resize(.7),outward=resize(1/.7);
  const key=e=>{if(['+','=','-','ArrowLeft','ArrowRight','Home','Escape','Enter',' '].includes(e.key))e.preventDefault();const {min,max}=chart.options.scales.x;if(e.key==='Enter'||e.key===' '){const x=hover?.x??(min+max)/2;hover=nearest({x:chart.scales.x.getPixelForValue(x)});if(hover)show({x:chart.scales.x.getPixelForValue(hover.x),y:chart.scales.y.getPixelForValue(hover.median)});}if(e.key==='+'||e.key==='=')inward();if(e.key==='-')outward();if(e.key==='Home')restore();if(e.key==='Escape'){stop();clear();}if(e.key.startsWith('Arrow')){const d=(max-min)*.2*(e.key==='ArrowLeft'?-1:1);if(e.key==='ArrowLeft'||e.key==='ArrowRight')apply(min+d,max+d);}};
  const listeners=[[canvas,'wheel',wheel,{passive:false}],[canvas,'pointerdown',down],[canvas,'pointermove',move],[canvas,'pointerup',stop],[canvas,'pointercancel',stop],[canvas,'lostpointercapture',stop],[canvas,'pointerleave',()=>{if(!drag)clear();}],[canvas,'keydown',key],[reset,'click',restore],[zoomIn,'click',inward],[zoomOut,'click',outward],[canvas,'dblclick',restore]];
  presets.forEach(b=>listeners.push([b,'click',()=>{stop();const days=Number(b.dataset.historyDays);apply(days?Math.max(fullMin,fullMax-days*DAY):fullMin,fullMax);}]));
  listeners.forEach(([el,event,fn,opts])=>el.addEventListener(event,fn,opts));announce();
  cleanup=()=>{stop();listeners.forEach(([el,event,fn,opts])=>el.removeEventListener(event,fn,opts));tip.remove();canvas.style.cursor=oldCursor;};
 },afterDraw(chart){if(!hover||drag)return;const x=chart.scales.x.getPixelForValue(hover.x),y=chart.scales.y.getPixelForValue(hover.median),ctx=chart.ctx,a=chart.chartArea;ctx.save();ctx.beginPath();ctx.rect(a.left,a.top,a.right-a.left,a.bottom-a.top);ctx.clip();ctx.strokeStyle='#b0b8c1';ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x,a.top);ctx.lineTo(x,a.bottom);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#d84b23';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();ctx.restore();},beforeDestroy(){cleanup();}};
}
