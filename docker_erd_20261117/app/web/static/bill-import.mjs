/* 개별 원가 계산기 · IDC 청구서로 채우기.
 * 청구서 엑셀을 cost-agent(/agent/v1/bills)에 올려 원가 항목으로 매핑하고, 담당자가 확인한 뒤 계산기 입력칸을 채운다.
 * 계산은 기존 '원가·후보가격 계산'(Spring)이 그대로 한다. 이 모듈은 숫자를 계산하지 않는다.
 */

export const AGENT_BASE = '/agent/v1';

// cost-agent(BE ItemType) → 계산기 행 id
const ROW_OF = {
  MEMORY: 'memory', NETWORK_STORAGE: 'network', RACK_FACILITY: 'rack', RENT: 'rent', OPERATIONS: 'ops',
  GPU: 'ops', OTHER: 'ops'
};
export const ITEM_LABEL = {
  ELECTRICITY: '전기료', RACK_FACILITY: '랙·전원·냉각 설비', RENT: '임차료', NETWORK_STORAGE: '네트워크·스토리지',
  OPERATIONS: '운영·유지보수', MEMORY: '별도 메모리', GPU: 'GPU 임차', ACQUISITION: '1회성 비용(취득비)', OTHER: '기타'
};
const ROLE_LABEL = { COST: '원가', SUBTOTAL: '소계', TOTAL: '총액', TAX: '부가세', DISCOUNT: '할인', IGNORE: '제외' };
const LEVEL_LABEL = { ERROR: '오류', WARNING: '확인 필요', INFO: '참고' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function readJson(response) {
  let data = null;
  try { data = await response.json(); } catch { /* 비 JSON */ }
  if (!response.ok) {
    const detail = data?.detail;
    const message = typeof detail === 'string' ? detail : detail?.message;
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw new Error('청구서 분석 서버(cost-agent)에 연결할 수 없습니다. 배포 상태를 확인하세요.');
    }
    throw new Error(message || `청구서 분석 실패 (${response.status})`);
  }
  return data;
}

export async function uploadBill(file, fetchImpl = fetch) {
  const body = new FormData();
  body.append('file', file, file.name);
  return readJson(await fetchImpl(`${AGENT_BASE}/bills`, { method: 'POST', body }));
}

export async function correctBill(id, corrections, fetchImpl = fetch) {
  return readJson(await fetchImpl(`${AGENT_BASE}/bills/${encodeURIComponent(id)}/lines`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ corrections, save_template: true })
  }));
}

/** 매핑 결과(cost_items) → 계산기 입력값. 서버·GPU 취득비는 청구서에 없으므로 건드리지 않는다. */
export function toCostForm(draft) {
  const rows = {};
  const notes = [];
  let electricity = null;
  const add = (rowId, amount, currency, from) => {
    const row = rows[rowId];
    if (row && row.state === 'user') {
      if (row.currency !== currency) throw new Error(`${ITEM_LABEL[from]}: 통화가 섞여 있어 자동으로 합칠 수 없습니다.`);
      row.amount = round(row.amount + amount);
      row.types.push(from);
    } else {
      rows[rowId] = { state: 'user', amount: round(amount), currency, period: 'year', types: [from] };
    }
  };
  for (const item of draft.cost_items || []) {
    const type = item.item_type;
    if (item.status === 'INCLUDED_IN_OTHER') {
      const owner = ROW_OF[item.included_in];
      if (type === 'ELECTRICITY') electricity = owner ? { mode: 'included', includedIn: owner } : electricity;
      else if (ROW_OF[type] && owner && ROW_OF[type] !== owner && !rows[ROW_OF[type]]) {
        rows[ROW_OF[type]] = { state: 'included', includedIn: owner };
      }
      continue;
    }
    if (item.amount == null) continue;
    if (type === 'ELECTRICITY') {
      electricity = { mode: 'amount', amount: round(item.amount), currency: item.currency };
    } else if (type === 'ACQUISITION') {
      notes.push(`청구서의 1회성 비용 ${fmt(item.amount, item.currency)}은 자동으로 넣지 않았습니다. 서버·GPU 취득비에 포함할지 판단하세요.`);
    } else if (ROW_OF[type]) {
      if (type === 'GPU' || type === 'OTHER') notes.push(`${ITEM_LABEL[type]} ${fmt(item.amount, item.currency)}을 운영·유지보수에 더했습니다.`);
      add(ROW_OF[type], item.amount, item.currency, type);
    }
  }
  if (Object.keys(rows).length || electricity) notes.unshift('월 청구 금액은 12배 해서 연 운영비로 넣었습니다.');
  return { rows, electricity, notes };
}

// 청구서에 없는 큰 비용 → 계산기 행
const MISSING_ROWS = { OPERATIONS: ['ops'], NETWORK_STORAGE: ['network'], RACK_FACILITY: ['rack', 'rent'], RENT: ['rack', 'rent'], ELECTRICITY: ['electric'] };
const ROW_LABEL = { server: '서버·GPU 취득비', memory: '별도 메모리', network: '네트워크·스토리지', rack: '랙·전원·냉각 설비', rent: '임차료', ops: '운영·유지보수', electric: '전기료' };
// 계산에 꼭 필요한 입력 (id, 이름)
export const REQUIRED_FIELDS = [
  ['v02CostModel', 'GPU 모델'], ['v02Gpu', 'GPU 수'], ['v02Util', '유료 가동률'], ['v02Rate', '연 자본비용률'], ['v02Margin', '목표 마진']
];

/**
 * 빠진 값 목록. values = { rows: {id: {state, amount}}, fields: {id: value}, electricMode, anyKrw }
 * 반환: [{ key, label, reason }]  key는 'row:ops' / 'field:v02Gpu' / 'electric'
 */
export function findMissing(draft, values) {
  const out = [];
  const seen = new Set();
  const push = (key, label, reason) => { if (!seen.has(key)) { seen.add(key); out.push({ key, label, reason }); } };
  const onlyOther = r => r.autoTypes?.length && r.autoTypes.every(t => t === 'OTHER' || t === 'GPU') && String(r.amount) === String(r.autoAmount);
  const rowEmpty = id => { const r = values.rows[id]; return !r || r.state === 'missing' || ((r.state === 'user' || r.state === 'public') && (r.amount == null || r.amount === '' || onlyOther(r))); };
  const server = values.rows.server;
  if (!server || !['user', 'public'].includes(server.state) || server.amount == null || server.amount === '') {
    push('row:server', ROW_LABEL.server, '청구서에 없는 값 · 직접 입력');
  }
  for (const type of draft?.missing_items || []) {
    const targets = MISSING_ROWS[type] || [];
    if (targets.includes('electric')) {
      if (!values.electricMode || values.electricMode === 'missing') push('electric', ROW_LABEL.electric, '청구서에 없음 · 별도 계산 또는 금액 입력');
      continue;
    }
    // 공간처럼 두 행 중 하나만 있으면 되는 경우: 둘 다 비었을 때만 표시
    if (targets.every(rowEmpty)) targets.forEach(id => push('row:' + id, ROW_LABEL[id],
      onlyOther(values.rows[id] || {}) ? '청구서에 없음 · 지금 금액은 기타 항목만 · 실제 금액 확인' : '청구서에 없음 · 금액 입력 또는 다른 항목에 포함 선택'));
  }
  for (const [id, label] of REQUIRED_FIELDS) {
    const v = values.fields[id];
    if (v == null || v === '') push('field:' + id, label, '필수 입력');
  }
  if (values.anyKrw && (values.fields.v02CostFx == null || values.fields.v02CostFx === '')) push('field:v02CostFx', '비용 환산용 환율', '원화 비용이 있어 필수');
  return out;
}

export function readFormValues(form) {
  const rows = {};
  form.querySelectorAll('[data-cost-row]').forEach(tr => {
    const f = k => tr.querySelector(`[data-field="${k}"]`)?.value ?? '';
    rows[tr.dataset.costRow] = { state: f('state'), amount: f('amount'), currency: f('currency'),
      autoTypes: tr.dataset.billTypes ? tr.dataset.billTypes.split(',') : [], autoAmount: tr.dataset.billAmount ?? '' };
  });
  const fields = {};
  for (const id of [...REQUIRED_FIELDS.map(([id]) => id), 'v02CostFx']) fields[id] = form.querySelector('#' + id)?.value ?? '';
  const electricMode = form.querySelector('#electricMode')?.value;
  const anyKrw = Object.values(rows).some(r => ['user', 'public'].includes(r.state) && r.currency === 'KRW')
    || (electricMode === 'amount' && form.querySelector('#electricCurrency')?.value === 'KRW') || electricMode === 'separate';
  return { rows, fields, electricMode, anyKrw };
}

function targetOf(form, key) {
  if (key.startsWith('row:')) return form.querySelector(`[data-cost-row="${key.slice(4)}"]`);
  if (key === 'electric') return form.querySelector('#electricMode')?.closest('label');
  return form.querySelector('#' + key.slice(6))?.closest('label');
}

/** 빠진 값을 빨간색으로 표시하고, 담당자가 값을 넣으면 표시를 지운다. 남은 개수를 돌려준다. */
export function markMissing(form, draft) {
  form.querySelectorAll('.bill-missing').forEach(el => el.classList.remove('bill-missing'));
  form.querySelectorAll('.bill-missing-note').forEach(el => el.remove());
  const missing = findMissing(draft, readFormValues(form));
  for (const m of missing) {
    const el = targetOf(form, m.key);
    if (!el) continue;
    el.classList.add('bill-missing');
    const note = document.createElement('small');
    note.className = 'bill-missing-note';
    note.textContent = `⚠ ${m.label} 값이 빠졌습니다 · ${m.reason}`;
    (el.tagName === 'TR' ? el.querySelector('td') : el).appendChild(note);
  }
  if (!form.dataset.billMissingBound) {
    form.dataset.billMissingBound = '1';
    const refresh = () => { if (form.querySelector('.bill-missing')) markMissing(form, draft); };
    form.addEventListener('input', refresh);
    form.addEventListener('change', refresh);
  }
  return missing;
}

const round = n => Math.round(Number(n) * 100) / 100;
const fmt = (n, currency) => currency === 'KRW' ? `${Math.round(n).toLocaleString('ko-KR')}원` : `$${Number(n).toLocaleString('en-US')}`;

/** 계산기 DOM에 값을 넣는다. 각 칸에 change 이벤트를 보내 기존 화면 로직(재계산 필요 표시 등)이 그대로 동작하게 한다. */
export function applyToForm(form, mapping) {
  const set = (el, value) => {
    if (!el) return;
    el.value = value ?? '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  for (const [rowId, row] of Object.entries(mapping.rows)) {
    const tr = form.querySelector(`[data-cost-row="${rowId}"]`);
    if (!tr) continue;
    const field = name => tr.querySelector(`[data-field="${name}"]`);
    set(field('state'), row.state);
    if (row.state === 'included') {
      set(field('includedIn'), row.includedIn);
      set(field('amount'), '');
    } else {
      set(field('amount'), row.amount);
      set(field('currency'), row.currency);
      set(field('period'), row.period);
    }
    tr.dataset.billTypes = (row.types || []).join(',');
    tr.dataset.billAmount = row.amount ?? '';
  }
  const e = mapping.electricity;
  if (e) {
    set(form.querySelector('#electricMode'), e.mode);
    if (e.mode === 'included') set(form.querySelector('#electricOwner'), e.includedIn);
    if (e.mode === 'amount') {
      set(form.querySelector('#electricAmount'), e.amount);
      set(form.querySelector('#electricCurrency'), e.currency);
    }
  }
}

function linesTable(draft) {
  const options = Object.keys(ITEM_LABEL).map(k => `<option value="${k}">${esc(ITEM_LABEL[k])}</option>`).join('');
  return `<table class="mv-table bill-lines"><thead><tr><th>원본 위치</th><th>청구서 항목명</th><th>금액</th><th>분류</th><th>신뢰도</th></tr></thead><tbody>${
    draft.lines.filter(l => l.role !== 'IGNORE').map(l => {
      const low = l.confidence < 0.7;
      const kind = l.role === 'COST'
        ? `<select data-bill-ref="${esc(l.ref)}" aria-label="${esc(l.label)} 분류">${options.replace(`value="${l.item_type}"`, `value="${l.item_type}" selected`)}</select>${l.included_items?.length ? `<small>+ ${l.included_items.map(i => esc(ITEM_LABEL[i] || i)).join(', ')} 포함</small>` : ''}`
        : `<span class="bill-role">${esc(ROLE_LABEL[l.role] || l.role)}</span>`;
      const flagged = (draft.issues || []).some(i => i.ref === l.ref && i.level !== 'INFO');
      return `<tr${low || flagged ? ' class="bill-low"' : ''}><td>${esc(l.ref)}</td><td>${esc(l.label)}</td><td class="num">${l.amount == null ? '—' : esc(Number(l.amount).toLocaleString())}</td><td>${kind}</td><td class="num">${Math.round(l.confidence * 100)}%</td></tr>`;
    }).join('')}</tbody></table>`;
}

function issuesList(draft) {
  if (!draft.issues.length) return '';
  return `<ul class="bill-issues">${draft.issues.map(i => `<li data-level="${esc(i.level)}"><b>${esc(LEVEL_LABEL[i.level] || i.level)}</b> ${esc(i.message)}</li>`).join('')}</ul>`;
}

export function renderDraft(draft) {
  const r = draft.reconciliation;
  const rec = r.matched === true ? `총액 대조 일치 · ${esc(r.basis)}` : r.matched === false ? `총액 불일치 (${esc(Number(r.difference).toLocaleString())})` : '총액 대조 불가';
  const via = { llm: 'AI 분류', rules: '키워드 규칙', template: '저장된 양식 템플릿' }[draft.mapper] || draft.mapper;
  const missing = (draft.missing_items || []).map(t => ITEM_LABEL[t] || t);
  const missingBox = missing.length ? `<div class="bill-missing-box" role="alert"><b>⚠ 청구서에서 빠진 큰 비용 ${missing.length}건</b> ${missing.map(m => `<span>${esc(m)}</span>`).join('')}<p>다른 계약에 포함됐는지 확인하고, 계산기에서 금액을 입력하거나 '다른 항목에 포함'을 선택하세요.</p></div>` : '';
  const llm = draft.llm ? `<details class="bill-llm"><summary>AI에 보낸 내용 보기 · ${esc(draft.llm.destination)} · ${draft.llm.masked ? '금액·숫자·식별자 가림' : '<b>가림 꺼짐</b>'}</summary><p>파일명과 금액은 보내지 않았습니다. 숫자 칸은 #NUM, 글자 속 숫자는 #로 바꿔 보냈습니다.</p><pre>${esc(draft.llm.sent)}</pre></details>` : '<p class="bill-llm-none">이번 분류는 외부 AI를 호출하지 않았습니다 (저장된 양식 또는 키워드 규칙).</p>';
  return `<div class="bill-summary"><b>${esc(draft.file_name)}</b><span>${esc(via)}</span><span>${esc(draft.currency || '통화 미확인')}</span><span data-ok="${r.matched === true}">${rec}</span></div>
   ${missingBox}${issuesList(draft)}${llm}<div class="mv-tablebox" tabindex="0" role="region" aria-label="청구서 매핑 결과">${linesTable(draft)}</div>
   <div class="mc-actions"><button type="button" class="mv-btn" data-bill-action="confirm">분류 수정 반영 · 양식 저장</button><button type="button" class="mv-btn primary" data-bill-action="apply" ${draft.issues.some(i => i.level === 'ERROR') ? 'disabled' : ''}>계산기 입력칸에 채우기</button></div>`;
}

/** 계산기 화면에 '청구서로 채우기' 영역을 붙인다. */
export function mountBillImport({ host, form, fetchImpl = fetch }) {
  host.innerHTML = `<details class="bill-import"><summary>IDC 청구서로 채우기 <small>AI가 항목을 분류하고 총액·누락을 점검합니다</small></summary>
   <p>사업자마다 양식이 다른 청구서(xlsx·csv)를 올리면 각 줄을 원가 항목으로 분류합니다. 금액은 파일의 칸에서 그대로 읽고, 계산은 아래 '원가·후보가격 계산'이 합니다. 서버·GPU 취득비, GPU 수, 가동률, 마진은 직접 입력하세요.</p>
   <label class="mv-btn">청구서 파일 선택<input type="file" accept=".xlsx,.csv" data-bill-file hidden></label><div data-bill-status aria-live="polite"></div><div data-bill-result></div></details>`;
  const status = host.querySelector('[data-bill-status]');
  const result = host.querySelector('[data-bill-result]');
  let draft = null;
  const show = d => { draft = d; result.innerHTML = renderDraft(d); };
  host.querySelector('[data-bill-file]').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    status.textContent = '청구서를 분석하고 있습니다…';
    result.innerHTML = '';
    try { show(await uploadBill(file, fetchImpl)); status.textContent = ''; } catch (error) { status.textContent = error.message; }
    event.target.value = '';
  });
  result.addEventListener('click', async event => {
    const action = event.target.closest('[data-bill-action]')?.dataset.billAction;
    if (!action || !draft) return;
    try {
      if (action === 'confirm') {
        const corrections = [...result.querySelectorAll('[data-bill-ref]')]
          .filter(select => draft.lines.find(l => l.ref === select.dataset.billRef)?.item_type !== select.value)
          .map(select => ({ ref: select.dataset.billRef, item_type: select.value }));
        status.textContent = '분류를 반영하고 있습니다…';
        show(await correctBill(draft.id, corrections, fetchImpl));
        status.textContent = '반영했습니다. 같은 양식은 다음부터 바로 처리됩니다.';
      } else if (action === 'apply') {
        const mapping = toCostForm(draft);
        applyToForm(form, mapping);
        const missing = markMissing(form, draft);
        const missingText = missing.length
          ? `<p class="bill-missing-summary">⚠ 빠진 값 ${missing.length}개: ${missing.map(m => esc(m.label)).join(', ')} — 빨간색 칸을 채우세요.</p>`
          : '<p>필수 값이 모두 채워졌습니다.</p>';
        status.innerHTML = `<b>입력칸을 채웠습니다.</b> ${mapping.notes.map(esc).join(' ')}${missingText}`;
        form.querySelector('.bill-missing')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    } catch (error) { status.textContent = error.message; }
  });
}
