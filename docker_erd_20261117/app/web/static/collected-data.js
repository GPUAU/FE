(() => {
'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const terms={on_demand:'온디맨드',spot:'스팟',commitment:'장기약정'};
let rows=[],shown=[],page=0;
const time=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미확인';
const price=r=>r.display_price==null?'미확보':'$'+Number(r.display_price).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4});
function source(v){try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function render(){
 const q=$('#query').value.trim().toLowerCase();
 shown=rows.filter(r=>(!$('#model').value||r.model_name===$('#model').value)&&(!$('#provider').value||r.provider_name===$('#provider').value)&&(!$('#term').value||r.contract_type===$('#term').value)&&[r.model_name,r.provider_name,r.original_product_name,r.region_code].join(' ').toLowerCase().includes(q));
 const pages=Math.max(1,Math.ceil(shown.length/30));page=Math.min(page,pages-1);
 $('#status').textContent=`검색 결과 ${shown.length.toLocaleString()}개 오퍼 / 전체 ${rows.length.toLocaleString()}개`;
 $('#rows').innerHTML=shown.slice(page*30,(page+1)*30).map((r,i)=>`<tr><td><b>${esc(r.model_name)}</b><small>${esc(r.original_product_name)}</small><small>${esc(r.gpu_count)} GPU</small></td><td><b>${esc(r.provider_name)}</b><small>${esc(r.region_code)}</small></td><td>${esc(terms[r.contract_type]||r.contract_type)}<small>${esc(r.contract_product_type)}</small><small>${r.commitment_months?esc(r.commitment_months)+'개월':'기간 약정 없음'}</small></td><td class="price">${price(r)}</td><td>${esc(time(r.collected_at))}<small>${r.is_stale?'48시간 초과 · 참고 자료':'저장된 관측'}</small></td><td>${source(r.source_url)?`<a href="${esc(source(r.source_url))}" target="_blank" rel="noopener">공식 원문 ↗</a><br>`:''}<button data-row="${page*30+i}">상세</button></td></tr>`).join('')||'<tr><td colspan="6">선택한 조건의 자료가 없습니다.</td></tr>';
 $('#prev').disabled=page===0;$('#next').disabled=page+1>=pages;$('#page').textContent=`${page+1} / ${pages}`;$('#csv').disabled=!shown.length;
}
for(const id of ['query','model','provider','term'])$('#'+id).addEventListener(id==='query'?'input':'change',()=>{page=0;render();});
$('#prev').onclick=()=>{page--;render();};$('#next').onclick=()=>{page++;render();};
$('#rows').onclick=e=>{const b=e.target.closest('[data-row]');if(!b)return;$('#payload').textContent=JSON.stringify(shown[Number(b.dataset.row)],null,2);$('#detail').showModal();};$('#close').onclick=()=>$('#detail').close();
$('#csv').onclick=()=>{
 const keys=['model_name','provider_name','original_product_name','region_code','contract_type','contract_product_type','commitment_months','payment_option','gpu_count','display_price','collected_at','observation_id','source_url'];
 const cell=v=>'"'+String(v??'').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"';
 const blob=new Blob(['\ufeff'+[keys,...shown.map(r=>keys.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='GPU_collected_offers.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
async function get(url){const r=await fetch(url);if(!r.ok)throw Error('조회 실패: '+r.status);return r.json();}
Promise.all([get('/api/erd/comparison'),get('/api/market')]).then(([d,m])=>{
 if(!Array.isArray(d.candidates))throw Error('가격 목록 응답을 확인할 수 없습니다.');rows=d.candidates;
 $('#observations').textContent=m.summary.observations.toLocaleString();$('#offers').textContent=rows.length.toLocaleString();
 const providers=[...new Set(rows.map(r=>r.provider_name))];$('#providers').textContent=providers.length;$('#providerNames').textContent=providers.join(' · ');
 const dates=rows.map(r=>Date.parse(r.collected_at)).filter(Number.isFinite);$('#latest').textContent=dates.length?new Date(Math.max(...dates)).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}):'미확보';
 for(const [id,key] of [['model','model_name'],['provider','provider_name'],['term','contract_type']])for(const value of [...new Set(rows.map(r=>r[key]).filter(Boolean))].sort())$('#'+id).add(new Option(id==='term'?(terms[value]||value):value,value));
 render();
}).catch(e=>{$('#status').textContent='자료를 불러오지 못했습니다. 새로고침해 주세요. '+e.message;});
})();
