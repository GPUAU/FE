import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mapSeries} from '../docker_erd_20261117/app/web/static/spring-history-adapter.mjs';
test('history keeps offer identity, time and normalized price without inventing product fields',()=>{
 const [row]=mapSeries([{offerId:'10',providerName:'AWS',modelName:'B200',contractType:'ON_DEMAND',gpuCount:8,regionCode:'us-east-1',points:[{observationId:'11',normalizationId:'12',collectedAt:'2026-01-01T00:00:00Z',status:'OK',effectiveUsdGpuHour:'4.2'}]}]);
 assert.equal(row.observation_id,'spring-11-12');assert.equal(row.price,4.2);assert.equal(row.chart_at,'2026-01-01T00:00:00Z');assert.equal(row.original_product_name,null);
});
test('unavailable price is not plotted as zero',()=>{assert.equal(mapSeries([{points:[{status:'UNAVAILABLE',effectiveUsdGpuHour:null}]}]).length,0)});
