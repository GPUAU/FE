import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const context={RENDER:{},mh:String};vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../docker_erd_20261117/app/web/static/quality-ui.js',import.meta.url),'utf8'),context);
test('one panel failure does not block others; retry recovers',async()=>{const button={},bad={innerHTML:'',querySelector:()=>button},good={innerHTML:''};let fail=true;await Promise.all([context.qualitySection(bad,async p=>{if(fail)throw Error('HTTP 500');p.innerHTML='복구됨';}),context.qualitySection(good,async p=>p.innerHTML='경고 2건')]);assert.match(bad.innerHTML,/HTTP 500/);assert.equal(good.innerHTML,'경고 2건');fail=false;await button.onclick();assert.equal(bad.innerHTML,'복구됨');});
test('malformed reason does not crash quality screen',()=>{assert.equal(context.qualityReason('not json').error,'not json');assert.equal(context.qualityReason('{"error":"rate limit"}').error,'rate limit');});

test('null reason is treated as absent',()=>{assert.equal(context.qualityReason('null').error,undefined);});
