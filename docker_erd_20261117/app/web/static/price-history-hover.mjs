// A shared weekly cursor. Values always come from the exact same week, never nearby points.
export function weeklyHoverRows(series, index) {
  return series.map(s => ({type:s.type, point:s.points[index] || null}));
}
export function createWeeklyHover({series, labels, colors, money, day}) {
  let box, canvas, active=-1, chartRef, priorTabIndex, priorDescription;
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hide=()=>{if(box)box.hidden=true;if(active!==-1){active=-1;chartRef?.draw();}};
  const show=(chart,index)=>{
    const points=series[0]?.points||[];
    if(!points[index]||!box)return;
    active=index;
    const rows=weeklyHoverRows(series,index);
    box.innerHTML=`<div class="rw-hover-heading">${escape(day(points[index].x))} 시작 주</div><table><thead><tr><th scope="col">요금제</th><th scope="col">중앙값</th><th scope="col">가격 범위</th><th scope="col">사업자</th></tr></thead><tbody>${rows.map(({point:p},i)=>`<tr><th scope="row"><i style="background:${colors[i]}"></i>${escape(labels[i])}</th><td><b>${p?.y!=null?escape(money(p.y)):'미확보'}</b></td><td>${p?.min!=null?escape(money(p.min))+'–'+escape(money(p.max)):'—'}</td><td>${p?.y!=null?p.providers:'—'}</td></tr>`).join('')}</tbody></table><p>USD / GPU·시간 · 범위: 해당 주 상품 관측값의 최저–최고</p>`;
    box.hidden=false;
    const rect=chart.canvas.getBoundingClientRect(),scaleX=rect.width/chart.width,scaleY=rect.height/chart.height;
    const x=rect.left+chart.scales.x.getPixelForValue(points[index].x)*scaleX;
    const width=box.offsetWidth,height=box.offsetHeight;
    box.style.left=Math.max(12,Math.min(x-width/2,window.innerWidth-width-12))+'px';
    const below=rect.top+chart.chartArea.bottom*scaleY+10;
    box.style.top=Math.max(12,Math.min(below,window.innerHeight-height-12))+'px';
  };
  const keydown=e=>{
    if(e.key==='Escape'){hide();return;}
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();
    const last=series[0].points.length-1;
    let next=active<0?last:active;
    if(e.key==='Home')next=0;else if(e.key==='End')next=last;else next=Math.max(0,Math.min(last,next+(e.key==='ArrowRight'?1:-1)));
    show(chartRef,next);chartRef.draw();
  };
  const focus=()=>{show(chartRef,series[0].points.length-1);chartRef.draw();};
  return {
    id:'weeklyPriceHover',
    afterInit(chart){
      chartRef=chart;canvas=chart.canvas;
      box=document.createElement('div');box.id='rwWeeklyTooltip';box.className='rw-weekly-tooltip';box.hidden=true;box.setAttribute('role','tooltip');document.body.append(box);
      priorTabIndex=chart.canvas.getAttribute('tabindex');priorDescription=chart.canvas.getAttribute('aria-describedby');
      chart.canvas.tabIndex=0;chart.canvas.setAttribute('aria-describedby',box.id);
      chart.canvas.addEventListener('keydown',keydown);chart.canvas.addEventListener('focus',focus);chart.canvas.addEventListener('blur',hide);
      window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);
    },
    afterEvent(chart,args){
      const {event}=args,area=chart.chartArea;
      if(event.type==='mouseout'||!area||event.x<area.left||event.x>area.right||event.y<area.top||event.y>area.bottom){hide();return;}
      const value=chart.scales.x.getValueForPixel(event.x),points=series[0].points;
      let nearest=0;
      for(let i=1;i<points.length;i++)if(Math.abs(points[i].x-value)<Math.abs(points[nearest].x-value))nearest=i;
      show(chart,nearest);args.changed=true;
    },
    afterDatasetsDraw(chart){
      if(active<0)return;
      const x=chart.scales.x.getPixelForValue(series[0].points[active].x),ctx=chart.ctx;
      ctx.save();ctx.beginPath();ctx.moveTo(x,chart.chartArea.top);ctx.lineTo(x,chart.chartArea.bottom);ctx.strokeStyle='#a5adba';ctx.lineWidth=1;ctx.stroke();
      weeklyHoverRows(series,active).forEach(({point:p},i)=>{
        if(p?.y==null)return;
        ctx.beginPath();ctx.arc(x,chart.scales.y.getPixelForValue(p.y),4,0,Math.PI*2);ctx.fillStyle=colors[i];ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#fff';ctx.stroke();
      });ctx.restore();
    },
    afterDestroy(chart){
      canvas.removeEventListener('keydown',keydown);canvas.removeEventListener('focus',focus);canvas.removeEventListener('blur',hide);
      window.removeEventListener('scroll',hide,true);window.removeEventListener('resize',hide);
      for(const [key,value] of [['tabindex',priorTabIndex],['aria-describedby',priorDescription]]){if(value==null)canvas.removeAttribute(key);else canvas.setAttribute(key,value);}
      box?.remove();box=null;chartRef=null;
    }
  };
}
