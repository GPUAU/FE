import {simulate} from './montecarlo-core.mjs';
self.onmessage=async({data})=>{
 try{const result=await simulate(data.dataset,data.settings,{onProgress:progress=>self.postMessage({type:'progress',progress})});self.postMessage({type:'result',result});}
 catch(error){self.postMessage({type:'error',message:error.message||'시뮬레이션을 완료하지 못했습니다.'});}
};
