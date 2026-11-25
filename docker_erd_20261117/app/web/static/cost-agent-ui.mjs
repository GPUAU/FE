/* 원가 에이전트 화면: 작업 보드 + 질문 카드 + 진행 기록.
 * 에이전트(cost-agent /agent/v1/agent/sessions)가 단계를 진행하고, 사람만 정할 수 있는 것은 질문 카드로 묻는다.
 * 숫자 계산은 서버(BE)가 하고, 이 화면은 상태를 그리기만 한다.
 */
import { AGENT_BASE, toCostForm, applyToForm, markMissing } from './bill-import.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ICON = { PENDING: '○', RUNNING: '◐', WAITING: '⏳', DONE: '✔', WARNING: '⚠', ERROR: '✖' };
const KIND = { think: '생각', tool: '도구', ask: '질문', answer: '답변', result: '결과', warn: '주의' };
const money = n => n == null || n === '' ? '—' : `$${Number(n).toFixed(3)}`;

async function call(fetchImpl, path, init) {
  const r = await fetchImpl(`${AGENT_BASE}${path}`, init);
  let data = null;
  try { data = await r.json(); } catch { /* 비 JSON */ }
  if (!r.ok) {
    if ([502, 503, 504].includes(r.status)) throw new Error('원가 에이전트 서버에 연결할 수 없습니다.');
    const d = data?.detail;
    throw new Error(typeof d === 'string' ? d : d?.message || `요청 실패 (${r.status})`);
  }
  return data;
}

export function startSession(file, goal, fetchImpl = fetch) {
  const body = new FormData();
  body.append('file', file, file.name);
  if (goal.modelId) body.append('model_id', goal.modelId);
  if (goal.gpuCount) body.append('gpu_count', String(goal.gpuCount));
  body.append('terms', (goal.terms || [3, 5]).join(','));
  return call(fetchImpl, '/agent/sessions', { method: 'POST', body });
}

export function sendAnswer(id, answer, fetchImpl = fetch) {
  return call(fetchImpl, `/agent/sessions/${encodeURIComponent(id)}/answer`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(answer)
  });
}

export const reportUrl = id => `${AGENT_BASE}/agent/sessions/${encodeURIComponent(id)}/report.xlsx`;

export function renderBoard(s) {
  return `<ol class="ca-board">${s.board.map(b => `<li data-status="${esc(b.status)}"${s.step === b.key ? ' aria-current="step"' : ''}>
    <span class="ca-icon" aria-hidden="true">${ICON[b.status] || '○'}</span><div><b>${esc(b.title)}</b>
    ${b.summary ? `<small>${esc(b.summary)}</small>` : ''}${b.details?.length ? `<ul>${b.details.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}</div></li>`).join('')}</ol>`;
}

function fieldInput(f) {
  const id = `ca-f-${esc(f.name)}`;
  const value = f.value ?? '';
  const control = f.type === 'select'
    ? `<select id="${id}" name="${esc(f.name)}">${f.value == null ? '<option value="">선택</option>' : ''}${f.options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
    : `<input id="${id}" name="${esc(f.name)}" type="${f.type === 'number' ? 'number' : 'text'}" step="any" value="${esc(value)}" ${f.required ? 'required' : ''}>`;
  return `<label class="ca-field" data-show-for="${esc((f.show_for || []).join(','))}"><span>${esc(f.label)}</span>${control}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
}

export function renderQuestion(q) {
  // 계산기 <form> 안에 들어가므로 <form>을 쓰지 않는다 (중첩 form은 브라우저가 무시함). 모든 버튼은 type="button".
  const choose = q.options.length && q.fields.length;   // 선택 후 입력 (예: 누락 비용)
  const opts = q.options.map((o, i) => `<button type="button" class="mv-btn${i === 0 ? ' primary' : ''}" data-choice="${esc(o.value)}"${choose ? ` aria-pressed="${i === 0}"` : ' data-submit'}>${esc(o.label)}${o.description ? `<small>${esc(o.description)}</small>` : ''}</button>`).join('');
  return `<div class="ca-question" role="form" aria-label="${esc(q.title)}" data-qid="${esc(q.id)}"><h4>${esc(q.title)}</h4><p>${esc(q.text)}</p>
    ${q.options.length ? `<div class="ca-options" role="group">${opts}</div>` : ''}
    ${q.fields.length ? `<div class="ca-fields">${q.fields.map(fieldInput).join('')}</div>` : ''}
    ${q.fields.length ? `<button type="button" class="mv-btn primary" data-submit>${esc(q.submit_label)}</button>` : ''}
    <div class="ca-error" role="alert"></div></div>`;
}

export function renderResult(s) {
  const r = s.simulation || {};
  const m = s.market;
  return `<section class="ca-result"><h4>결과</h4><div class="ca-kpis">
    <div><span>GPU·시간당 원가</span><strong>${money(r.hourlyCost)}</strong></div>
    <div><span>제안가</span><strong>${money(r.candidatePrice)}</strong></div>
    ${m?.count ? `<div><span>시장 위치</span><strong>${esc(m.position)}</strong><small>공개가격 ${m.count}개 · $${m.min?.toFixed(2)}~$${m.max?.toFixed(2)}</small></div>` : ''}
    ${(s.terms || []).map(t => `<div><span>${t.years}년 계약가 (할인 ${Math.round(t.discount_rate * 100)}%)</span><strong>${money(t.price)}</strong></div>`).join('')}
    </div><ul class="ca-summary">${(s.summary || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="mc-actions">${s.report_ready ? `<a class="mv-btn primary" href="${reportUrl(s.id)}" download>견적 근거서 엑셀 다운로드</a>` : ''}
    <button type="button" class="mv-btn" data-ca-fill>계산기 입력칸에 채우기</button></div></section>`;
}

export function renderSession(s) {
  const llm = s.draft?.llm ? `<details class="bill-llm"><summary>AI에 보낸 내용 보기 · ${esc(s.draft.llm.destination)} · ${s.draft.llm.masked ? '금액·숫자·식별자 가림' : '가림 꺼짐'}</summary><pre>${esc(s.draft.llm.sent)}</pre></details>` : '';
  const log = `<details class="ca-log"><summary>에이전트 진행 기록 (${s.events.length})</summary><ol>${s.events.map(e => `<li data-kind="${esc(e.kind)}"><b>${esc(KIND[e.kind] || e.kind)}</b> ${esc(e.message)}</li>`).join('')}</ol></details>`;
  const main = s.question ? renderQuestion(s.question) : s.step === 'DONE' ? (s.simulation ? renderResult(s) : '<p>에이전트가 멈췄습니다. 작업 보드를 확인하세요.</p>') : '<p>진행 중…</p>';
  return `<div class="ca-layout"><aside>${renderBoard(s)}</aside><div class="ca-main">${main}${log}${llm}</div></div>`;
}

/** 질문 카드에서 답 읽기. 선택 버튼이 있으면 눌린 것, 입력칸은 보이는 것만. */
export function readAnswer(form, choice) {
  const values = {};
  form.querySelectorAll('.ca-field').forEach(label => {
    if (label.hidden) return;
    const el = label.querySelector('input,select');
    if (el && el.value !== '') values[el.name] = el.type === 'number' ? Number(el.value) : el.value;
  });
  return { question_id: form.dataset.qid, choice: choice ?? null, values };
}

function syncShowFor(form) {
  const chosen = form.querySelector('[data-choice][aria-pressed="true"]')?.dataset.choice;
  form.querySelectorAll('.ca-field').forEach(label => {
    const only = label.dataset.showFor ? label.dataset.showFor.split(',') : [];
    label.hidden = only.length > 0 && !only.includes(chosen);
  });
}

export function mountCostAgent({ host, form: calcForm, models = [], fetchImpl = fetch }) {
  host.innerHTML = `<details class="cost-agent" open><summary>원가 에이전트 <small>청구서 한 장으로 원가·제안가·시장 비교·근거서까지 진행합니다</small></summary>
    <div class="ca-start"><label class="mv-btn primary">청구서로 시작<input type="file" accept=".xlsx,.csv" data-ca-file hidden></label>
    <label>GPU 모델<select data-ca-model><option value="">나중에 선택</option>${models.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></label>
    <label>GPU 수<input type="number" min="1" data-ca-gpu placeholder="예: 32"></label>
    <span class="ca-note">금액은 가리고 항목명만 AI에 보냅니다. 계산은 BE가 합니다.</span></div>
    <div data-ca-status aria-live="polite"></div><div data-ca-body></div></details>`;
  const body = host.querySelector('[data-ca-body]');
  const status = host.querySelector('[data-ca-status]');
  let session = null;
  const draw = s => { session = s; body.innerHTML = renderSession(s); const q = body.querySelector('.ca-question'); if (q) syncShowFor(q); };

  host.querySelector('[data-ca-file]').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    status.textContent = '에이전트가 청구서를 분석하고 있습니다…';
    body.innerHTML = '';
    try {
      draw(await startSession(file, { modelId: host.querySelector('[data-ca-model]').value, gpuCount: Number(host.querySelector('[data-ca-gpu]').value) || null }, fetchImpl));
      status.textContent = '';
    } catch (err) { status.textContent = err.message; }
    e.target.value = '';
  });

  async function submit(card, choice) {
    const err = card.querySelector('.ca-error');
    err.textContent = '';
    card.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try { draw(await sendAnswer(session.id, readAnswer(card, choice), fetchImpl)); }
    catch (ex) { err.textContent = ex.message; card.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
  }

  body.addEventListener('click', async e => {
    const card = e.target.closest('.ca-question');
    const btn = e.target.closest('button');
    if (card && btn && session) {
      e.preventDefault();
      if (btn.dataset.choice && !btn.hasAttribute('data-submit')) {   // 선택만 바꿈
        card.querySelectorAll('[data-choice]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        syncShowFor(card);
        return;
      }
      if (btn.hasAttribute('data-submit')) {
        const choice = btn.dataset.choice || card.querySelector('[data-choice][aria-pressed="true"]')?.dataset.choice;
        await submit(card, choice);
        return;
      }
    }
    if (e.target.closest('[data-ca-fill]') && session && calcForm) {
      const draft = { cost_items: session.final_items, missing_items: [] };
      const mapping = toCostForm(draft);
      applyToForm(calcForm, mapping);
      const a = session.assumptions || {};
      // 청구서 밖 값인 서버·GPU 취득비는 에이전트 가정값에서 채운다 (일회성 투자, 내용연수 = 감가 연수, 잔존가치 0)
      const server = calcForm.querySelector('[data-cost-row="server"]');
      if (server && a.acquisition_amount != null) {
        const put = (k, v) => { const el = server.querySelector(`[data-field="${k}"]`); if (el) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); } };
        put('state', 'user'); put('amount', a.acquisition_amount); put('currency', a.acquisition_currency || 'USD'); put('period', 'once');
        put('usefulLifeYears', a.depreciation_years ?? ''); put('residualValueUsd', 0);
      }
      const set = (id, v) => { const el = calcForm.querySelector('#' + id); if (el && v != null) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); } };
      set('v02CostModel', a.model_id); set('v02Gpu', a.gpu_count); set('v02Util', a.utilization != null ? a.utilization * 100 : null);
      set('v02Margin', a.target_rate != null ? +(a.target_rate * 100).toFixed(4) : null); set('v02CostFx', a.fx_krw_per_usd);
      const left = markMissing(calcForm, draft);
      status.textContent = left.length ? `계산기를 채웠습니다. 남은 빈칸 ${left.length}개(빨간색)를 확인하세요.` : '계산기를 채웠습니다.';
    }
  });

  // Enter가 바깥 계산기 폼을 제출하지 않게 막고, 질문 카드의 확인으로 처리한다
  host.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest('.ca-start')) { e.preventDefault(); return; }
    const card = e.target.closest('.ca-question');
    if (!card || e.key !== 'Enter' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    card.querySelector('button[data-submit]:not([data-choice])')?.click();
  });
}
