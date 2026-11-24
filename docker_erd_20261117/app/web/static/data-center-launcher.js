/* Preserve the detailed legacy calculator while making the data-center model the default. */
(()=>{
 const legacy=RENDER.cost;
 const render=async()=>{
  calculatorFrame('데이터센터 원가와 GPU 판매가격','1GW 보고서 모형으로 원가·목표 마진·경쟁사 가격을 함께 검토합니다.');
  const {renderDataCenter}=await import('/static/data-center-ui.mjs?v=logic1124');
  if(state.view!=='cost')return;
  const host=document.querySelector('#v-cost');
  await renderDataCenter({host,api,request:GpuSpringAnalysis.requestEnvelope,saved:V02.dcInput,
   isActive:()=>state.view==='cost',
   onEdit:value=>{V02.dcInput=value;V02.cost=null;GpuFlow.invalidateSource('cost');if(V02.irrContext?.dependsOn?.includes('cost')){V02.irrResult=null;V02.irrContext=null;V02.irrIncomplete=true;V02.irrProvenance='데이터센터 원가 가정 변경 · 기존 IRR 입력을 다시 확인하세요.';}},
   openLegacy:async()=>{await legacy();if(state.view!=='cost')return;const back=document.createElement('button');back.type='button';back.className='mv-btn';back.textContent='1GW 데이터센터 모형으로 돌아가기';back.onclick=render;host.prepend(back);}
  });
 };
 RENDER.cost=render;
})();
