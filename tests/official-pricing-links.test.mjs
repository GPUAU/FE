import test from 'node:test';
import assert from 'node:assert/strict';
import {officialPricingLink} from '../docker_erd_20261117/app/web/static/official-pricing-links.mjs';

test('AWS contract destinations stay distinct and preserve the collected API evidence', () => {
  for (const [type, product, path] of [
    ['on_demand', 'On-Demand', '/ec2/pricing/on-demand/'],
    ['spot', 'Spot', '/ec2/spot/pricing/'],
    ['commitment', 'Compute Savings Plans', '/savingsplans/compute-pricing/'],
    ['commitment', 'EC2 Instance Savings Plans', '/savingsplans/compute-pricing/'],
    ['commitment', 'Reserved Instances', '/ec2/pricing/reserved-instances/pricing/'],
    ['commitment', 'Capacity Blocks', '/ec2/capacityblocks/pricing/'],
    ['commitment', 'Unknown agreement', '/ec2/pricing/'],
  ]) {
    const row = {provider_name:'AWS', original_product_name:'p6-b300.48xlarge', region_code:'us-gov-east-1', contract_type:type, contract_product_type:product, source_url:'https://api.pricing.us-east-1.amazonaws.com/?Action=AWSPriceListService.GetProducts'};
    const before = JSON.stringify(row), link = officialPricingLink(row);
    assert.equal(link.url, 'https://aws.amazon.com'+path);
    assert.match(link.title, /p6-b300\.48xlarge.*us-gov-east-1/);
    assert.equal(JSON.stringify(row), before);
  }
});

test('known provider APIs and archives resolve to human price pages', () => {
  for (const [provider, host] of [['Azure','azure.microsoft.com'],['Verda','verda.com'],['Nebius','nebius.com'],['Oracle','www.oracle.com'],['Scaleway','www.scaleway.com'],['Hyperstack','www.hyperstack.cloud']]) {
    for (const source_url of ['https://prices.azure.com/api/retail/prices','https://web.archive.org/old','javascript:alert(1)',null]) {
      const link = officialPricingLink({provider_name:provider,source_url});
      assert.equal(new URL(link.url).hostname,host);
      assert.equal(new URL(link.url).protocol,'https:');
      assert.match(link.title,/상품·리전·계약 조건/);
    }
  }
});

test('unknown providers do not get an invented official destination', () => {
  for (const provider_name of ['AWS.evil.test','Unknown','',null]) {
    assert.equal(officialPricingLink({provider_name,source_url:'https://evil.test/api'}),null);
  }
  assert.equal(officialPricingLink(),null);
});
