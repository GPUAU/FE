export function reportDefaults() {
  return {gpuCount:600000,gpusPerRack:72,rackPowerKw:120,pue:1.14,utilization:75,
    powerMode:'linked',powerLoadFraction:75,electricityUsdPerKwh:.0834,otherAnnualOpexUsd:275350680,
    capitalMethod:'REPORT_FACTORS',annualDiscountRate:8,
    serverCapex:20833333333,serverYears:5,serverResidual:0,
    networkCapex:5000000000,networkYears:5,networkResidual:0,
    facilityCapex:12166666667,facilityYears:14,facilityResidual:0,
    targetMargin:20,bareMetalPrice:3,softwareAttach:10,modelId:'',offerGpuCount:8,marketScope:''};
}
export function dataCenterPayload(input) {
  const defaults=reportDefaults();
  for(const key of Object.keys(defaults).filter(k=>typeof defaults[k]==='number')) {
    if(input[key]==null||input[key]===''||!Number.isFinite(Number(input[key]))) throw Error('빈 입력값을 확인하세요. 0도 명시적으로 입력해야 합니다.');
  }
  if(!Number.isInteger(Number(input.gpuCount))||input.gpuCount<=0||!Number.isInteger(Number(input.gpusPerRack))||input.gpusPerRack<=0) throw Error('GPU 수와 랙당 GPU 수는 양의 정수여야 합니다.');
  if(input.utilization<=0||input.utilization>100||input.targetMargin<0||input.targetMargin>=100) throw Error('유료 가동률은 0 초과~100%, 목표 매출 이익률은 0~100% 미만으로 입력하세요.');
  const fraction=k=>String(Number((Number(input[k])/100).toFixed(8)));
  const report=input.capitalMethod==='REPORT_FACTORS';
  const asset=(key,years)=>({capexUsd:String(input[key+'Capex']),years:report?years:Number(input[key+'Years']),residualUsd:report?'0':String(input[key+'Residual'])});
  return {
    gpuCount:Number(input.gpuCount),gpusPerRack:Number(input.gpusPerRack),rackPowerKw:String(input.rackPowerKw),pue:String(input.pue),
    utilization:fraction('utilization'),powerLoadFraction:input.powerMode==='linked'?fraction('utilization'):fraction('powerLoadFraction'),
    electricityUsdPerKwh:String(input.electricityUsdPerKwh),otherAnnualOpexUsd:String(input.otherAnnualOpexUsd),
    capitalMethod:input.capitalMethod,annualDiscountRate:fraction('annualDiscountRate'),
    server:asset('server',5),network:asset('network',5),facility:asset('facility',14),targetMargin:fraction('targetMargin'),
    bareMetalPrice:String(input.bareMetalPrice),softwareAttach:fraction('softwareAttach'),
    modelId:input.modelId||null,marketFilters:input.marketScope?JSON.parse(input.marketScope):null
  };
}
export async function simulateDataCenter(request,input) {
  const response=await request('/api/v1/data-center-simulations',dataCenterPayload(input));
  if(!response?.isSuccess||response.result?.formulaVersion!=='dc-report-1'||response.result.saved!==false) throw Error('데이터센터 계산 응답을 확인할 수 없습니다.');
  return response.result;
}
export function utilizationScenarios(input,result) {
  return [60,75,85].map(util=>{
    const energy=input.powerMode==='linked'?Number(result.annualElectricityUsd)*util/Number(input.utilization):Number(result.annualElectricityUsd);
    const cost=Number(result.annualCapitalUsd)+Number(input.otherAnnualOpexUsd)+energy;
    const hours=Number(input.gpuCount)*8760*util/100;
    return {util,cost:cost/hours,price:cost/hours/(1-Number(input.targetMargin)/100),surplus:hours*Number(input.bareMetalPrice)-cost};
  });
}
export function safeSource(url) {try {const u=new URL(url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
