import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { historyPage } from '../docker_erd_20261117/app/web/static/history-table.mjs';
const rows = [
  { provider_name:'AWS', model_name:'B200', region_code:'us-east', chart_at:'2026-01-01', price:3 },
  { provider_name:'Azure', model_name:'B300', region_code:'korea', chart_at:'2026-02-01', price:1 },
  { provider_name:'AWS', model_name:'B300', region_code:'korea', chart_at:'2026-03-01', price:2 }
];
test('검색은 대소문자를 구분하지 않고 상품 조건을 찾는다', () => assert.equal(historyPage(rows,{query:'azure'}).total,1));
test('가격 정렬 및 페이지 이동', () => { const result=historyPage(rows,{sort:'price-asc',page:2,pageSize:2}); assert.equal(result.items[0].price,3); assert.equal(result.totalPages,2); });
test('검색 결과가 없으면 빈 페이지를 반환한다', () => assert.deepEqual(historyPage(rows,{query:'없음'}).items,[]));
test('마지막 페이지 범위 밖은 마지막 페이지로 조정한다', () => assert.equal(historyPage(rows,{page:9,pageSize:2}).page,2));
