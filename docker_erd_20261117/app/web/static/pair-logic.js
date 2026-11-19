(function(root){
 'use strict';
 const knownRegion = r => r && r !== 'GLOBAL_UNSPECIFIED';
 function selectOffer(rows,region='ALL',key=''){
  const valid=rows.filter(r=>r.usable&&(region==='ALL'||r.region===region));
  return valid.find(r=>r.product_key===key)||valid[0]||null;
 }
 function compare(left,right){
  if(!left||!right)return {available:false,reasons:['양쪽에 유효 가격이 있어야 차이를 계산합니다.']};
  const reasons=[];
  if(left.gpu_count!==right.gpu_count)reasons.push('상품당 GPU 수가 다릅니다.');
  if(!left.gpu_variant||!right.gpu_variant)reasons.push('세부 GPU 형식을 모두 확인하지 못했습니다.');
  else if(left.gpu_variant!==right.gpu_variant)reasons.push('GPU 형식 또는 메모리 구성이 다를 수 있습니다.');
  if(!knownRegion(left.region)||!knownRegion(right.region))reasons.push('한쪽 이상은 지역이 명시되지 않았습니다.');
  else if(left.region!==right.region)reasons.push('사업자별 지역 코드가 다르므로 실제 위치 확인이 필요합니다.');
  if(left.vcpu==null||right.vcpu==null||left.memory_gb==null||right.memory_gb==null)reasons.push('CPU·RAM 정보가 일부 미제공입니다.');
  else if(left.vcpu!==right.vcpu||left.memory_gb!==right.memory_gb)reasons.push('포함된 CPU·RAM 구성이 다릅니다.');
  reasons.push('네트워크·스토리지·지원 조건은 원문 확인이 필요합니다.');
  const l=Number(left.normalized_price_usd),r=Number(right.normalized_price_usd);
  if(!Number.isFinite(l)||!Number.isFinite(r))return {available:false,reasons:['유효한 가격이 없습니다.']};
  return {available:true,delta:r-l,percent:l>0?(r-l)/l*100:null,reasons};
 }
 function configurationHour(r){
  if(!r)return null;
  if(r.raw_currency==='USD'&&r.billing_unit==='HOUR'&&!Number(r.upfront_cost||0)&&r.raw_price!=null){
   if(r.price_basis==='PER_INSTANCE')return Number(r.raw_price);
   if(r.price_basis==='PER_GPU')return Number(r.raw_price)*r.gpu_count;
  }
  return Number(r.normalized_price_usd)*r.gpu_count;
 }
 const api={selectOffer,compare,configurationHour};root.PairLogic=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
