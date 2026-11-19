import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {fxRequest, alertRows} from '../docker_erd_20261117/app/web/static/spring-operations.mjs';
test('fx request uses the paired observation and normalization and rejects invalid rates',()=>{
 assert.deepEqual(fxRequest('12','34','1500.25'),{items:[{observationId:'12',normalizationId:'34'}],priceType:'EFFECTIVE',krwPerUsd:'1500.25'});
 assert.throws(()=>fxRequest('12','none','1500'));
 assert.throws(()=>fxRequest('12','34','0'));
});
test('alert list distinguishes empty results from failure',()=>{
 assert.deepEqual(alertRows({isSuccess:true,result:{items:[],nextCursor:null}}),{items:[],nextCursor:null,asOf:undefined});
 assert.throws(()=>alertRows({isSuccess:false,message:'실패'}));
});
