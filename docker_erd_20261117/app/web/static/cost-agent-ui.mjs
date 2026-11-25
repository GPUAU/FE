/* 원가 에이전트 화면 (원가·제안가 › 청구서로 산정).
 * 시작 → 진행(단계 표시줄 + 질문 카드 + 확인된 내용) → 결과.
 * 에이전트(cost-agent /agent/v1/agent/sessions)가 단계를 진행하고, 이 화면은 상태를 그리기만 한다. 숫자 계산은 서버가 한다.
 */
import { AGENT_BASE, toCostForm, applyToForm, markMissing } from './bill-import.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const STEP_ORDER = ['ANALYZE', 'MISSING', 'ASSUMPTIONS', 'SIMULATE', 'MARKET', 'TERMS', 'REPORT'];
const STATUS_LABEL = { PENDING: '대기', RUNNING: '진행 중', WAITING: '확인 필요', DONE: '완료', WARNING: '완료 · 확인 사항', ERROR: '중단' };
const KIND_LABEL = { think: '판단', tool: '도구', ask: '질문', answer: '답변', result: '결과', warn: '주의' };
const ITEM_LABEL = {
  ELECTRICITY: '전기료', RACK_FACILITY: '랙·상면', RENT: '임차료·공간', NETWORK_STORAGE: '네트워크·스토리지', OPERATIONS: '운영·유지보수',
  MEMORY: '메모리', GPU: 'GPU 임차', ACQUISITION: '취득비(1회)', OTHER: '기타', FINANCING: '조달 금리'
};
const MAPPER_LABEL = { llm: 'AI 분류', rules: '키워드 규칙', template: '저장된 양식' };

export const usd = n => n == null || n === '' || Number.isNaN(Number(n)) ? '—' : `$${Number(n).toFixed(2)}`;
export function money(amount, currency) {
  if (amount == null) return '—';
  const n = Number(amount);
  if (currency === 'KRW') {
    if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2).replace(/\.?0+$/, '')}억 원`;
    if (Math.abs(n) >= 1e4) return `${Math.round(n / 1e4).toLocaleString('ko-KR')}만 원`;
    return `${Math.round(n).toLocaleString('ko-KR')}원`;
  }
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

// ------------------------------------------------------------------ API
async function call(fetchImpl, path, init) {
  const r = await fetchImpl(`${AGENT_BASE}${path}`, init);
  let data = null;
  try { data = await r.json(); } catch { /* 비 JSON */ }
  if (!r.ok) {
    if ([502, 503, 504].includes(r.status)) throw new Error('원가 에이전트 서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');
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

// ------------------------------------------------------------------ 진행률
export function progressOf(s) {
  const board = s?.board || [];
  const done = board.filter(b => b.status === 'DONE' || b.status === 'WARNING').length;
  const total = board.length || STEP_ORDER.length;
  const cur = board.find(b => b.key === s?.step) || board.find(b => ['WAITING', 'RUNNING', 'ERROR'].includes(b.status));
  return { done, total, pct: Math.round((done / total) * 100), current: cur || null, finished: s?.step === 'DONE' };
}

// ------------------------------------------------------------------ 시작 화면
export function renderStart(models = []) {
  return `<section class="ca ca-start" aria-label="원가 에이전트 시작">
    <div class="ca-start-copy">
      <p class="ca-eyebrow">AI 원가 에이전트</p>
      <h2>청구서 한 장으로<br>제안가까지</h2>
      <ol class="ca-how">
        <li><b>분류</b><span>사업자마다 다른 청구서 항목명을 표준 원가 항목으로 정리합니다.</span></li>
        <li><b>점검</b><span>총액을 대조하고, 빠진 큰 비용이 있으면 먼저 물어봅니다.</span></li>
        <li><b>비교</b><span>원가와 제안가를 같은 GPU의 시장 공개가격과 비교합니다.</span></li>
        <li><b>근거서</b><span>가정값·근거·진행 기록을 엑셀 근거서로 내려받습니다.</span></li>
      </ol>
      <p class="ca-privacy"><span aria-hidden="true">🔒</span> 금액·숫자·식별자는 가리고 항목명만 AI에 보냅니다. 원가 계산은 내부 원가 서버가 합니다.</p>
    </div>
    <div class="ca-card ca-start-card">
      <label class="ca-drop" data-ca-drop>
        <input type="file" accept=".xlsx,.csv" data-ca-file hidden>
        <span class="ca-drop-icon" aria-hidden="true">⬆</span>
        <strong>청구서를 끌어다 놓거나 클릭해서 선택</strong>
        <small>xlsx · csv · 최대 5MB · 사업자 양식 그대로</small>
        <span class="ca-file" data-ca-filename></span>
      </label>
      <div class="ca-row">
        <label>GPU 모델<select data-ca-model><option value="">진행 중에 선택</option>${models.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></label>
        <label>GPU 수<input type="number" min="1" inputmode="numeric" data-ca-gpu placeholder="예: 32"></label>
      </div>
      <p class="ca-hint">비워 두면 진행 중에 근거와 함께 물어봅니다. 계약 기간은 3년·5년 가격을 함께 계산합니다.</p>
      <button type="button" class="ca-btn ca-btn-primary ca-btn-block" data-ca-start disabled>분석 시작</button>
      <div class="ca-error" data-ca-error role="alert"></div>
    </div>
  </section>`;
}

// ------------------------------------------------------------------ 단계 표시줄
export function renderStepper(s) {
  const p = progressOf(s);
  const head = p.finished
    ? '<strong>모든 단계를 마쳤습니다</strong>'
    : `<strong>${esc(p.current?.title || '준비 중')}</strong><span class="ca-state" data-status="${esc(p.current?.status || 'RUNNING')}">${esc(STATUS_LABEL[p.current?.status] || '진행 중')}</span>`;
  return `<div class="ca-progress" aria-label="진행 상황">
    <div class="ca-progress-top"><div>${head}</div><span class="ca-pct">${p.done}/${p.total} 단계 · ${p.pct}%</span></div>
    <div class="ca-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}"><i style="width:${p.pct}%"></i></div>
    <ol class="ca-steps">${(s.board || []).map((b, i) => `<li data-status="${esc(b.status)}"${b.key === s.step ? ' aria-current="step"' : ''}>
      <span class="ca-dot" aria-hidden="true">${b.status === 'DONE' ? '✓' : b.status === 'WARNING' ? '!' : b.status === 'ERROR' ? '×' : i + 1}</span>
      <span class="ca-step-title">${esc(b.title)}</span>
      <span class="ca-step-sum">${esc(b.summary || STATUS_LABEL[b.status] || '')}</span></li>`).join('')}</ol>
  </div>`;
}

// ------------------------------------------------------------------ 질문 카드
function fieldInput(f) {
  const id = `ca-f-${esc(f.name)}`;
  const value = f.value ?? '';
  const control = f.type === 'select'
    ? `<select id="${id}" name="${esc(f.name)}">${f.value == null ? '<option value="">선택</option>' : ''}${f.options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
    : `<input id="${id}" name="${esc(f.name)}" type="${f.type === 'number' ? 'number' : 'text'}" step="any" value="${esc(value)}" ${f.required ? 'required' : ''}>`;
  return `<label class="ca-field" for="${id}" data-show-for="${esc((f.show_for || []).join(','))}"><span>${esc(f.label)}</span>${control}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
}

export function renderQuestion(q, s) {
  // <form>을 쓰지 않는다 (다른 form 안에 들어가도 안전하게). 모든 버튼은 type="button".
  const stepNo = STEP_ORDER.indexOf(q.step) + 1;
  const stepTitle = s?.board?.find(b => b.key === q.step)?.title || '';
  const choose = q.options.length && q.fields.length;   // 선택 후 입력
  const opts = choose
    ? `<div class="ca-opts" role="radiogroup">${q.options.map((o, i) => `<button type="button" class="ca-opt" role="radio" data-choice="${esc(o.value)}" aria-pressed="${i === 0}" aria-checked="${i === 0}"><b>${esc(o.label)}</b>${o.description ? `<small>${esc(o.description)}</small>` : ''}</button>`).join('')}</div>`
    : q.options.length ? `<div class="ca-actions">${q.options.map((o, i) => `<button type="button" class="ca-btn ${i === 0 ? 'ca-btn-primary' : 'ca-btn-ghost'}" data-choice="${esc(o.value)}" data-submit><span>${esc(o.label)}</span>${o.description ? `<small>${esc(o.description)}</small>` : ''}</button>`).join('')}</div>` : '';
  return `<div class="ca-card ca-question" role="form" aria-label="${esc(q.title)}" data-qid="${esc(q.id)}">
    <p class="ca-step-label">STEP ${stepNo} · ${esc(stepTitle)} · 담당자 확인</p>
    <h3>${esc(q.title)}</h3>
    <p class="ca-desc">${esc(q.text)}</p>
    ${opts}
    ${q.fields.length ? `<div class="ca-fields">${q.fields.map(fieldInput).join('')}</div>` : ''}
    ${q.fields.length ? `<div class="ca-actions"><button type="button" class="ca-btn ca-btn-primary" data-submit>${esc(q.submit_label)}</button></div>` : ''}
    <div class="ca-error" role="alert"></div>
  </div>`;
}

export function renderBusy(label) {
  return `<div class="ca-card ca-busy" aria-live="polite"><span class="ca-spinner" aria-hidden="true"></span><div><h3>${esc(label)}</h3><p class="ca-desc">AI 분류와 원가 계산을 진행하고 있어요. 보통 10~20초 걸립니다.</p></div></div>`;
}

// ------------------------------------------------------------------ 결과
export function renderMarket(m) {
  if (!m?.count || m.min == null) return '<p class="ca-desc">비교할 공개 가격이 없습니다.</p>';
  const lo = Math.min(m.min, m.candidate ?? m.min) * 0.9;
  const hi = Math.max(m.max, m.candidate ?? m.max) * 1.05;
  const pos = v => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)).toFixed(1)}%`;
  return `<div class="ca-market" aria-label="시장 가격 위치">
    <div class="ca-track"><span class="ca-range" style="left:${pos(m.min)};width:calc(${pos(m.max)} - ${pos(m.min)})"></span>
      <span class="ca-tick" style="left:${pos(m.min)}"><small>최저 ${usd(m.min)}</small></span>
      <span class="ca-tick ca-tick-mid" style="left:${pos(m.median)}"><small>중앙 ${usd(m.median)}</small></span>
      <span class="ca-tick" style="left:${pos(m.max)}"><small>최고 ${usd(m.max)}</small></span>
      ${m.candidate != null ? `<span class="ca-me" style="left:${pos(m.candidate)}"><b>제안가 ${usd(m.candidate)}</b></span>` : ''}
    </div>
    <p class="ca-desc">${esc(m.position)} · 공개가격 ${m.count}개 · 사업자 ${m.providers}곳 기준 (사업자별 대표값)</p>
  </div>`;
}

export function renderResult(s) {
  const r = s.simulation || {};
  const a = s.assumptions || {};
  return `<div class="ca-card ca-result">
    <p class="ca-step-label">완료 · 견적 근거서 준비됨</p>
    <h3>제안가 ${usd(r.candidatePrice)} <small>/ GPU·시간</small></h3>
    <div class="ca-kpis">
      <div><span>GPU·시간당 원가</span><strong>${usd(r.hourlyCost)}</strong></div>
      <div class="ca-kpi-main"><span>제안가</span><strong>${usd(r.candidatePrice)}</strong></div>
      <div><span>목표 마진</span><strong>${a.target_rate != null ? Math.round(a.target_rate * 100) + '%' : '—'}</strong></div>
      ${(s.terms || []).map(t => `<div><span>${t.years}년 계약가 · 할인 ${Math.round(t.discount_rate * 100)}%</span><strong>${usd(t.price)}</strong></div>`).join('')}
    </div>
    <h4>시장에서의 위치</h4>${renderMarket(s.market)}
    <h4>에이전트 판단 요약</h4><ul class="ca-summary-list">${(s.summary || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="ca-actions">
      ${s.report_ready ? `<a class="ca-btn ca-btn-primary" href="${reportUrl(s.id)}" download>견적 근거서 엑셀 다운로드</a>` : ''}
      <button type="button" class="ca-btn ca-btn-ghost" data-ca-send>항목별 계산기로 보내기</button>
      <button type="button" class="ca-btn ca-btn-text" data-ca-reset>새 청구서로 시작</button>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ 확인된 내용 (오른쪽)
export function renderSummary(s) {
  const d = s.draft;
  const a = s.assumptions || {};
  const r = s.simulation;
  const items = (s.final_items?.length ? s.final_items : d?.cost_items || []);
  const rec = d?.reconciliation;
  const recText = !rec ? '—' : rec.matched === true ? '일치' : rec.matched === false ? '불일치' : '대조 불가';
  const row = (k, v) => `<div class="ca-kv"><dt>${esc(k)}</dt><dd>${v}</dd></div>`;
  const itemRows = items.map(it => row(ITEM_LABEL[it.item_type] || it.item_type,
    it.status === 'INCLUDED_IN_OTHER' ? `<span class="ca-muted">${esc(ITEM_LABEL[it.included_in] || '')}에 포함</span>`
      : it.status === 'NOT_INCLUDED' ? '<span class="ca-warn">제외</span>'
        : `${esc(money(it.amount, it.currency))}<small>/${it.period === 'ONE_TIME' ? '1회' : '년'}</small>`)).join('');
  return `<aside class="ca-card ca-side" aria-label="확인된 내용">
    <h4>확인된 내용</h4>
    ${d ? `<dl class="ca-group"><p>청구서</p>
      ${row('분류', esc(MAPPER_LABEL[d.mapper] || d.mapper))}
      ${row('통화 · 기간', `${esc(d.currency || '확인 필요')} · ${d.period === 'YEAR' ? '연간' : '월'}`)}
      ${row('총액 대조', `<span class="${rec?.matched ? 'ca-ok' : 'ca-warn'}">${recText}</span>`)}
    </dl>` : ''}
    ${items.length ? `<dl class="ca-group"><p>원가 항목 (연 환산)</p>${itemRows}</dl>` : ''}
    ${a.confirmed ? `<dl class="ca-group"><p>가정값</p>
      ${row('GPU', `${esc(a.model_name || '')} · ${esc(a.gpu_count)}장`)}
      ${row('취득비', esc(money(a.acquisition_amount, a.acquisition_currency)))}
      ${row('가동률 · 마진', `${Math.round(a.utilization * 100)}% · ${Math.round(a.target_rate * 100)}%`)}
    </dl>` : ''}
    ${r ? `<dl class="ca-group"><p>결과</p>
      ${row('원가', usd(r.hourlyCost))}${row('제안가', `<b>${usd(r.candidatePrice)}</b>`)}
      ${s.market?.count ? row('시장', esc(s.market.position)) : ''}
    </dl>` : ''}
    ${d?.llm ? `<details class="ca-llm"><summary>AI에 보낸 내용 보기</summary><p>${esc(d.llm.destination)} · ${d.llm.masked ? '금액·숫자·식별자 가림' : '가림 꺼짐'}</p><pre>${esc(d.llm.sent)}</pre></details>` : ''}
  </aside>`;
}

export function renderActivity(s) {
  const ev = s.events || [];
  if (!ev.length) return '';
  const last = ev[ev.length - 1];
  return `<details class="ca-activity"><summary><span>에이전트 활동 ${ev.length}건</span><span class="ca-last">${esc(KIND_LABEL[last.kind] || last.kind)} · ${esc(last.message)}</span></summary>
    <ol class="ca-timeline">${ev.map(e => `<li data-kind="${esc(e.kind)}"><b>${esc(KIND_LABEL[e.kind] || e.kind)}</b><span>${esc(e.message)}</span></li>`).join('')}</ol></details>`;
}

export function renderWorkspace(s, { busyLabel = '', models = [] } = {}) {
  const d = s.draft;
  const a = s.assumptions || {};
  const goalModel = models.find(m => String(m.id) === String(s.goal?.model_id))?.name;
  const chips = [
    a.model_name ? `${a.model_name} · ${a.gpu_count}장`
      : goalModel ? `${goalModel}${s.goal?.gpu_count ? ` · ${s.goal.gpu_count}장` : ''}` : 'GPU 미정',
    d ? MAPPER_LABEL[d.mapper] || d.mapper : null,
    (s.goal?.terms_years || []).length ? `${s.goal.terms_years.join('·')}년 계약가` : null
  ].filter(Boolean);
  const main = busyLabel ? renderBusy(busyLabel)
    : s.question ? renderQuestion(s.question, s)
      : s.step === 'DONE' && s.simulation ? renderResult(s)
        : `<div class="ca-card"><h3>에이전트가 멈췄습니다</h3><p class="ca-desc">단계 표시줄에서 중단된 이유를 확인하고 새 청구서로 다시 시작하세요.</p><div class="ca-actions"><button type="button" class="ca-btn ca-btn-primary" data-ca-reset>새 청구서로 시작</button></div></div>`;
  return `<section class="ca ca-run">
    <header class="ca-runhead"><div><p class="ca-eyebrow">원가 에이전트</p><h2>${esc(d?.file_name || '청구서 분석')}</h2>
      <div class="ca-chips">${chips.map(c => `<span>${esc(c)}</span>`).join('')}</div></div>
      <button type="button" class="ca-btn ca-btn-ghost" data-ca-reset>새 청구서</button></header>
    ${renderStepper(s)}
    <div class="ca-grid"><div class="ca-main">${main}${renderActivity(s)}</div>${renderSummary(s)}</div>
  </section>`;
}

// ------------------------------------------------------------------ 계산기로 보내기
export function fillCalculator(form, session) {
  const draft = { cost_items: session.final_items || [], missing_items: [] };
  applyToForm(form, toCostForm(draft));
  const a = session.assumptions || {};
  const server = form.querySelector('[data-cost-row="server"]');
  const put = (el, v) => { if (el && v != null) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); } };
  if (server && a.acquisition_amount != null) {
    const f = k => server.querySelector(`[data-field="${k}"]`);
    put(f('state'), 'user'); put(f('amount'), a.acquisition_amount); put(f('currency'), a.acquisition_currency || 'USD');
    put(f('period'), 'once'); put(f('usefulLifeYears'), a.depreciation_years ?? ''); put(f('residualValueUsd'), 0);
  }
  const set = (id, v) => put(form.querySelector('#' + id), v);
  set('v02CostModel', a.model_id); set('v02Gpu', a.gpu_count); set('v02Util', a.utilization != null ? +(a.utilization * 100).toFixed(4) : null);
  set('v02Margin', a.target_rate != null ? +(a.target_rate * 100).toFixed(4) : null); set('v02CostFx', a.fx_krw_per_usd);
  return markMissing(form, draft).length;
}

/** 질문 카드에서 답 읽기. 선택 버튼이 있으면 눌린 것, 입력칸은 보이는 것만. */
export function readAnswer(card, choice) {
  const values = {};
  card.querySelectorAll('.ca-field').forEach(label => {
    if (label.hidden) return;
    const el = label.querySelector('input,select');
    if (el && el.value !== '') values[el.name] = el.type === 'number' ? Number(el.value) : el.value;
  });
  return { question_id: card.dataset.qid, choice: choice ?? null, values };
}

function syncShowFor(card) {
  const chosen = card.querySelector('.ca-opt[aria-pressed="true"]')?.dataset.choice;
  card.querySelectorAll('.ca-field').forEach(label => {
    const only = label.dataset.showFor ? label.dataset.showFor.split(',') : [];
    label.hidden = only.length > 0 && !only.includes(chosen);
  });
}

// ------------------------------------------------------------------ 마운트
let session = null;   // 탭을 오가도 진행 중인 세션을 유지한다

export function mountAgentWorkspace({ host, models = [], onSendToCalculator, fetchImpl = fetch }) {
  let file = null;
  const draw = (opts = {}) => {
    host.innerHTML = session ? renderWorkspace(session, { ...opts, models }) : renderStart(models);
    const card = host.querySelector('.ca-question');
    if (card) syncShowFor(card);
    if (!session) wireStart();
  };
  const stepTitle = () => session?.board?.find(b => b.key === session.step)?.title || '다음 단계';

  function wireStart() {
    const drop = host.querySelector('[data-ca-drop]');
    const input = host.querySelector('[data-ca-file]');
    const start = host.querySelector('[data-ca-start]');
    const pick = f => {
      if (!f) return;
      file = f;
      host.querySelector('[data-ca-filename]').textContent = `선택됨 · ${f.name}`;
      drop.classList.add('has-file');
      start.disabled = false;
    };
    input.addEventListener('change', e => pick(e.target.files?.[0]));
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', e => pick(e.dataTransfer?.files?.[0]));
    start.addEventListener('click', async () => {
      if (!file) return;
      const err = host.querySelector('[data-ca-error]');
      start.disabled = true;
      start.textContent = '청구서를 분석하는 중…';
      try {
        session = await startSession(file, {
          modelId: host.querySelector('[data-ca-model]').value,
          gpuCount: Number(host.querySelector('[data-ca-gpu]').value) || null
        }, fetchImpl);
        draw();
        host.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } catch (ex) { err.textContent = ex.message; start.disabled = false; start.textContent = '분석 시작'; }
    });
  }

  async function submit(card, choice) {
    const answer = readAnswer(card, choice);
    draw({ busyLabel: `${stepTitle()} 반영 중…` });
    try {
      session = await sendAnswer(session.id, answer, fetchImpl);
      draw();
    } catch (ex) {
      draw();
      const box = host.querySelector('.ca-question .ca-error');
      if (box) box.textContent = ex.message;
    }
  }

  host.onclick = async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.hasAttribute('data-ca-reset')) { session = null; file = null; draw(); return; }
    if (btn.hasAttribute('data-ca-send') && session) { onSendToCalculator?.(session); return; }
    const card = btn.closest('.ca-question');
    if (!card || !session) return;
    if (btn.classList.contains('ca-opt')) {
      card.querySelectorAll('.ca-opt').forEach(b => { const on = b === btn; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-checked', String(on)); });
      syncShowFor(card);
      return;
    }
    if (btn.hasAttribute('data-submit')) {
      await submit(card, btn.dataset.choice || card.querySelector('.ca-opt[aria-pressed="true"]')?.dataset.choice);
    }
  };
  host.onkeydown = e => {
    if (e.key !== 'Enter' || e.target.tagName === 'BUTTON') return;
    if (e.target.closest('.ca-start-card')) { e.preventDefault(); return; }
    const card = e.target.closest('.ca-question');
    if (!card) return;
    e.preventDefault();
    card.querySelector('.ca-actions [data-submit]:not([data-choice])')?.click();
  };
  draw();
}
