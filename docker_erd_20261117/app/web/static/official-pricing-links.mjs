// Human-facing destinations, checked against provider websites on 2026-11-27.
// These pages do not guarantee a permalink selecting a SKU/region/contract.
// Never replace source_url: it identifies the evidence for the saved observation.
export function officialPricingLink(row = {}) {
  const provider = String(row.provider_name || '').trim().toLowerCase();
  const contract = String(row.contract_product_type || '').toLowerCase();
  const term = String(row.contract_type || '').toLowerCase();
  let url;
  if (provider === 'aws') {
    if (/capacity[ _-]*blocks?/.test(contract)) url = 'https://aws.amazon.com/ec2/capacityblocks/pricing/';
    else if (/savings[ _-]*plans?/.test(contract)) url = 'https://aws.amazon.com/savingsplans/compute-pricing/';
    else if (term === 'spot') url = 'https://aws.amazon.com/ec2/spot/pricing/';
    else if (/reserved/.test(contract)) url = 'https://aws.amazon.com/ec2/pricing/reserved-instances/pricing/';
    else if (term === 'on_demand') url = 'https://aws.amazon.com/ec2/pricing/on-demand/';
    else url = 'https://aws.amazon.com/ec2/pricing/';
  } else {
    url = {
      azure: 'https://azure.microsoft.com/ko-kr/pricing/details/virtual-machines/linux/',
      verda: 'https://verda.com/pricing',
      nebius: 'https://nebius.com/prices',
      oracle: 'https://www.oracle.com/kr/cloud/price-list/',
      scaleway: 'https://www.scaleway.com/en/pricing/gpu/',
      hyperstack: 'https://www.hyperstack.cloud/gpu-pricing',
    }[provider];
  }
  // Unknown providers must not silently expose an API/archive as an official price page.
  if (!url) return null;
  const context = [row.provider_name, row.original_product_name || row.model_name,
    row.region_code, row.contract_product_type,
    row.commitment_months ? `${row.commitment_months}개월` : null].filter(Boolean).join(' · ');
  return {url, label: '공식 가격표 ↗', title: `${context} — 가격표에서 상품·리전·계약 조건을 확인하세요.`};
}
