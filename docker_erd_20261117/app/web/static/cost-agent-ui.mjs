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
    <div class="ca-start-card">
      <header class="ca-section-head"><div><p class="ca-eyebrow">청구서 기반 산정</p><h2>청구서 등록</h2><p class="ca-desc">임차료·전력비 등 청구 내역을 바탕으로 원가와 제안가를 계산합니다.</p></div><span class="ca-stage-label">새 분석</span></header>
      <label class="ca-drop" data-ca-drop tabindex="0" role="button" aria-label="청구서 파일 선택">
        <input type="file" accept=".xlsx,.csv" data-ca-file hidden>
        <span class="ca-document" aria-hidden="true"><svg viewBox="0 0 48 56" fill="none"><path d="M8 2h22l12 12v38a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M30 2v12h12M15 25h18M15 32h18M15 39h10"/></svg></span>
        <strong>청구서 파일을 여기에 놓으세요</strong>
        <span class="ca-upload-sub">또는 <span class="ca-file-action">파일 선택</span></span>
        <small>XLSX, CSV · 최대 5MB</small>
        <span class="ca-file" data-ca-filename aria-live="polite"></span>
      </label>
      <div class="ca-context-head"><h3>GPU 정보</h3><span>선택 입력</span></div>
      <div class="ca-row">
        <label>GPU 모델<select data-ca-model><option value="">분석 중에 확인</option>${models.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></label>
        <label>GPU 수<span class="ca-number-wrap"><input type="number" min="1" inputmode="numeric" data-ca-gpu placeholder="수량 입력"><span aria-hidden="true">장</span></span></label>
      </div>
      <p class="ca-hint">아직 정해지지 않았다면 비워 두세요. 분석 과정에서 확인할 수 있습니다.</p>
      <div class="ca-start-footer"><span>파일 등록 후 분석을 시작할 수 있습니다.</span><button type="button" class="ca-btn ca-btn-primary" data-ca-start disabled>청구서 분석 시작 <span aria-hidden="true">→</span></button></div>
      <div class="ca-error" data-ca-error role="alert"></div>
    </div>
    <aside class="ca-start-aside" aria-label="산정 안내">
      <div class="ca-aside-heading"><span class="ca-aside-rule"></span><p>분석 후 확인할 내용</p></div>
      <dl class="ca-deliverables">
        <div><dt><span>01</span>항목별 원가</dt><dd>청구 항목 분류, 총액 대조와 누락 비용 확인</dd></div>
        <div><dt><span>02</span>제안가와 시장 비교</dt><dd>운영 조건과 목표 마진을 반영한 가격 검토</dd></div>
        <div><dt><span>03</span>계약 기간별 가격</dt><dd>3년·5년 계약 조건에 따른 제안가 비교</dd></div>
      </dl>
      <div class="ca-report-note"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h8"/></svg><div><strong>견적 근거서</strong><p>계산 가정과 검토 기록을<br>엑셀 파일로 내려받습니다.</p></div><span>XLSX</span></div>
      <details class="ca-data-note"><summary>청구서 데이터는 어떻게 처리되나요?</summary><p>금액·숫자·식별자는 가리고 항목명만 AI에 보냅니다. 원가 계산은 내부 원가 서버가 합니다.</p></details>
      <a class="ca-manual-link" href="#cost/simulation">운영 조건 직접 입력하기 <span aria-hidden="true">↗</span></a>
    </aside>
  </section>`;
}

// ------------------------------------------------------------------ 단계 표시줄
/** 단계 아래 한 줄 요약: 길면 첫 구절만 보이고 전체는 툴팁으로 둔다. */
export function shortSummary(text) {
  const s = String(text || '');
  if (s.length <= 24) return s;
  return s.split(' · ')[0];
}
const DOT_ICONS = '<svg class="ca-ic ca-ic-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.4"/></svg>'
  + '<span class="ca-ic ca-ic-warn" aria-hidden="true">!</span><span class="ca-ic ca-ic-err" aria-hidden="true">×</span>';

function stepHead(p) {
  if (p.finished) return '<span class="ca-head-ic" data-status="DONE" aria-hidden="true"></span><strong>모든 단계를 마쳤습니다</strong>';
  const st = p.current?.status || 'RUNNING';
  return `<span class="ca-head-ic" data-status="${esc(st)}" aria-hidden="true"></span><strong>${esc(p.current?.title || '준비 중')}</strong><span class="ca-state" data-status="${esc(st)}">${esc(STATUS_LABEL[st] || '진행 중')}</span>`;
}

export function renderStepper(s) {
  const p = progressOf(s);
  const board = s.board || [];
  return `<div class="ca-progress" aria-label="진행 상황"${p.finished ? ' data-finished' : ''}>
    <div class="ca-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}"><i style="width:${p.pct}%"></i></div>
    <div class="ca-progress-top"><div class="ca-head">${stepHead(p)}</div>
      <div class="ca-meta"><span class="ca-elapsed" data-ca-elapsed></span><span class="ca-pct">${p.done}/${p.total} 단계 · ${p.pct}%</span></div></div>
    <ol class="ca-steps">${board.map((b, i) => `<li data-status="${esc(b.status)}"${b.key === s.step ? ' aria-current="step"' : ''}>
      <span class="ca-line" aria-hidden="true"><i></i></span>
      <span class="ca-dot" aria-hidden="true"><span class="ca-ic ca-num">${i + 1}</span>${DOT_ICONS}</span>
      <span class="ca-step-title">${esc(b.title)}</span>
      <span class="ca-step-sum" title="${esc(b.summary || '')}">${esc(shortSummary(b.summary) || STATUS_LABEL[b.status] || '')}</span></li>`).join('')}</ol>
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

// 서버가 일하는 동안 보여 줄 단계별 작업 문구 (실제 처리 순서와 같다)
export const WAIT_HINTS = {
  ANALYZE: ['청구서의 시트와 표를 읽는 중', '금액·숫자를 가리고 AI에 항목 분류를 요청하는 중', '원가 합계와 청구 총액을 대조하는 중', '빠진 큰 비용이 있는지 확인하는 중'],
  MISSING: ['답변을 원가 항목에 반영하는 중', '다음에 확인할 값을 준비하는 중'],
  ASSUMPTIONS: ['가정값을 검증하는 중', '원가 서버에 원가·제안가 계산을 요청하는 중', '같은 GPU의 시장 공개가격을 조회하는 중', '사업자별 대표 가격으로 시장 위치를 계산하는 중'],
  SIMULATE: ['원가 서버에 계산을 요청하는 중'],
  MARKET: ['목표 마진을 조정해 다시 계산하는 중', '시장 위치를 다시 확인하는 중'],
  TERMS: ['장기계약 가격을 계산하는 중', '견적 근거서를 만드는 중']
};
const STEP_TITLES = { ANALYZE: '청구서 분석', MISSING: '누락 확인', ASSUMPTIONS: '가정값 확인', SIMULATE: '원가 계산', MARKET: '시장 비교', TERMS: '기간별 가격', REPORT: '견적 근거서' };
const KIND_ICON = { think: '◆', tool: '⚙', ask: '?', answer: '✎', result: '✓', warn: '!' };

export function renderLive(s, { feed = [], waiting = false, hint = '' } = {}) {
  const step = s.board?.find(b => b.key === s.step);
  const lines = feed.map((e, i) => `<li data-kind="${esc(e.kind)}" class="ca-live-in"${i === feed.length - 1 && !waiting ? ' aria-current="true"' : ''}><i aria-hidden="true">${esc(KIND_ICON[e.kind] || '·')}</i><b>${esc(KIND_LABEL[e.kind] || e.kind)}</b><span>${esc(e.message)}</span></li>`).join('');
  return `<div class="ca-card ca-live" aria-live="polite" aria-busy="true">
    <div class="ca-live-head"><span class="ca-orb" aria-hidden="true"><i></i><i></i><i></i></span>
      <div><p class="ca-step-label">에이전트 작업 중</p><h3>${esc(step?.title || '준비 중')}</h3></div></div>
    <ol class="ca-live-feed">${lines}${waiting ? `<li class="ca-live-wait"><i aria-hidden="true">…</i><span class="ca-live-hint">${esc(hint)}</span><span class="ca-dots" aria-hidden="true"><b></b><b></b><b></b></span></li>` : ''}</ol>
    <div class="ca-shimmer" aria-hidden="true"></div>
  </div>`;
}

/** 첫 분석 전에 보여 줄 임시 세션 (모든 단계 대기, 분석 진행 중) */
export function pendingSession(fileName, goal) {
  return {
    id: '', step: 'ANALYZE', question: null, events: [], goal: { terms_years: [3, 5], ...goal },
    board: STEP_ORDER.map(k => ({ key: k, title: STEP_TITLES[k], status: k === 'ANALYZE' ? 'RUNNING' : 'PENDING', summary: '', details: [] })),
    draft: { file_name: fileName }, assumptions: {}, final_items: []
  };
}

/** 응답 재생용: 이벤트 i번째까지 진행된 것처럼 보이는 단계 상태 */
export function boardAt(prevBoard, next, ev) {
  const order = next.board.map(b => b.key);
  const idx = order.indexOf(ev.step);
  const fin = st => ['DONE', 'WARNING', 'ERROR'].includes(st);
  return order.map((k, i) => {
    const before = prevBoard?.find(b => b.key === k) || { key: k, title: STEP_TITLES[k], status: 'PENDING', summary: '' };
    const after = next.board[i];
    if (i < idx && fin(after.status)) return { ...after };
    if (i === idx) return fin(before.status) ? { ...before } : { ...after, status: 'RUNNING', summary: before.summary || '' };
    return { ...before };
  });
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
      <div><span>GPU·시간당 원가</span><strong data-count="${esc(r.hourlyCost)}" data-fmt="usd">${usd(r.hourlyCost)}</strong></div>
      <div class="ca-kpi-main"><span>제안가</span><strong data-count="${esc(r.candidatePrice)}" data-fmt="usd">${usd(r.candidatePrice)}</strong></div>
      <div><span>목표 마진</span><strong ${a.target_rate != null ? `data-count="${Math.round(a.target_rate * 100)}" data-fmt="pct"` : ''}>${a.target_rate != null ? Math.round(a.target_rate * 100) + '%' : '—'}</strong></div>
      ${(s.terms || []).map(t => `<div><span>${t.years}년 계약가 · 할인 ${Math.round(t.discount_rate * 100)}%</span><strong data-count="${esc(t.price)}" data-fmt="usd">${usd(t.price)}</strong></div>`).join('')}
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
    ${!d?.reconciliation ? '<p class="ca-desc ca-side-empty">분석이 끝나면 청구서 대조 결과, 원가 항목, 가정값이 여기에 차례로 정리됩니다.</p>' : ''}
    ${d?.reconciliation ? `<dl class="ca-group"><p>청구서</p>
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
      ${s.market?.count ? row('시장', `<span title="${esc(s.market.position)}">${esc(shortSummary(s.market.position))}</span>`) : ''}
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

export function renderWorkspace(s, { busyLabel = '', models = [], live = null, enter = false } = {}) {
  const d = s.draft;
  const a = s.assumptions || {};
  const goalModel = models.find(m => String(m.id) === String(s.goal?.model_id))?.name;
  const chips = [
    a.model_name ? `${a.model_name} · ${a.gpu_count}장`
      : goalModel ? `${goalModel}${s.goal?.gpu_count ? ` · ${s.goal.gpu_count}장` : ''}` : 'GPU 미정',
    d ? MAPPER_LABEL[d.mapper] || d.mapper : null,
    (s.goal?.terms_years || []).length ? `${s.goal.terms_years.join('·')}년 계약가` : null
  ].filter(Boolean);
  const main = live ? renderLive(s, live)
    : busyLabel ? renderBusy(busyLabel)
    : s.question ? renderQuestion(s.question, s)
      : s.step === 'DONE' && s.simulation ? renderResult(s)
        : `<div class="ca-card"><h3>에이전트가 멈췄습니다</h3><p class="ca-desc">단계 표시줄에서 중단된 이유를 확인하고 새 청구서로 다시 시작하세요.</p><div class="ca-actions"><button type="button" class="ca-btn ca-btn-primary" data-ca-reset>새 청구서로 시작</button></div></div>`;
  return `<section class="ca ca-run">
    <header class="ca-runhead"><div><p class="ca-eyebrow">원가 에이전트</p><h2>${esc(d?.file_name || '청구서 분석')}</h2>
      <div class="ca-chips">${chips.map(c => `<span>${esc(c)}</span>`).join('')}</div></div>
      <button type="button" class="ca-btn ca-btn-ghost" data-ca-reset>새 청구서</button></header>
    ${renderStepper(s)}
    <div class="ca-grid"><div class="ca-main${enter ? ' ca-enter' : ''}">${main}${live ? '' : renderActivity(s)}</div>${renderSummary(s)}</div>
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

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EVENT_DELAY = { think: 650, tool: 750, ask: 550, answer: 350, result: 600, warn: 650 };
export function fmtElapsed(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  return sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분 ${String(sec % 60).padStart(2, '0')}초`;
}
// 다른 탭으로 옮겼으면 화면을 덮어쓰지 않는다 (#cost 가 에이전트 탭)
const onAgentTab = () => location.hash.startsWith('#cost') && !location.hash.split('/')[1];

/** 단계 표시줄을 다시 그리지 않고 상태만 바꿔 전환 애니메이션이 보이게 한다. */
function updateStepper(root, s) {
  const prog = root.querySelector('.ca-progress');
  if (!prog) return;
  const p = progressOf(s);
  const bar = prog.querySelector('.ca-bar i');
  if (bar) bar.style.width = `${p.pct}%`;
  prog.querySelector('.ca-bar')?.setAttribute('aria-valuenow', String(p.pct));
  prog.toggleAttribute('data-finished', p.finished);
  const pct = prog.querySelector('.ca-pct');
  if (pct) pct.textContent = `${p.done}/${p.total} 단계 · ${p.pct}%`;
  const head = prog.querySelector('.ca-head');
  if (head) head.innerHTML = stepHead(p);
  prog.querySelectorAll('.ca-steps > li').forEach((li, i) => {
    const b = s.board[i];
    if (!b) return;
    if (li.dataset.status !== b.status && ['DONE', 'WARNING', 'ERROR'].includes(b.status)) {
      li.classList.remove('ca-pop'); void li.offsetWidth; li.classList.add('ca-pop');
    }
    li.dataset.status = b.status;
    if (b.key === s.step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    const sum = li.querySelector('.ca-step-sum');
    sum.textContent = shortSummary(b.summary) || STATUS_LABEL[b.status] || '';
    sum.title = b.summary || '';
  });
  // 좁은 화면에서는 단계 줄이 가로로 스크롤되므로 현재 단계를 가운데로 옮긴다
  const steps = prog.querySelector('.ca-steps');
  const cur = steps?.querySelector('[aria-current="step"]');
  if (steps && cur && steps.scrollWidth > steps.clientWidth) {
    steps.scrollTo({ left: cur.offsetLeft - (steps.clientWidth - cur.offsetWidth) / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
}

function countUp(root) {
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = Number(el.dataset.count);
    if (!Number.isFinite(to)) return;
    const fmt = el.dataset.fmt === 'pct' ? v => `${Math.round(v)}%` : v => `$${v.toFixed(2)}`;
    const t0 = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - t0) / 800);
      el.textContent = fmt(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function mountAgentWorkspace({ host, models = [], onSendToCalculator, fetchImpl = fetch }) {
  let file = null;
  let run = 0;          // 진행 중인 애니메이션 식별 (새 청구서·탭 이동 시 중단)
  let hintTimer = null;
  // 에이전트가 실제로 일한 시간 (담당자가 답을 고르는 시간은 빼고 센다)
  let workMs = 0, busySince = null, clock = null;
  const elapsedNow = () => workMs + (busySince ? Date.now() - busySince : 0);
  const paintElapsed = () => {
    const el = host.querySelector('[data-ca-elapsed]');
    if (!el) return;
    const ms = elapsedNow();
    el.textContent = ms < 500 && !busySince ? '' : `${busySince ? '작업' : '에이전트 작업'} ${fmtElapsed(ms)}`;
    el.toggleAttribute('data-live', !!busySince);
  };
  const busyStart = () => {
    if (busySince) return;
    busySince = Date.now();
    if (!clock) clock = setInterval(() => (onAgentTab() ? paintElapsed() : null), 1000);
  };
  const busyEnd = () => {
    if (busySince) workMs += Date.now() - busySince;
    busySince = null;
    if (clock) clearInterval(clock);
    clock = null;
    paintElapsed();
  };
  const stopHints = () => { if (hintTimer) clearInterval(hintTimer); hintTimer = null; };
  const draw = (opts = {}) => {
    stopHints();
    host.innerHTML = session ? renderWorkspace(session, { ...opts, models }) : renderStart(models);
    paintElapsed();
    const card = host.querySelector('.ca-question');
    if (card) syncShowFor(card);
    if (!session) wireStart();
    if (opts.enter && !reducedMotion()) countUp(host);
  };

  /** 서버 응답을 기다리는 동안: 현재 단계를 진행 중으로 두고 작업 문구를 순환한다. */
  function showWaiting(base) {
    const hints = WAIT_HINTS[base.step] || ['처리하는 중'];
    const live = { ...base, question: null, board: base.board.map(b => (b.key === base.step ? { ...b, status: 'RUNNING' } : b)) };
    busyStart();
    host.innerHTML = renderWorkspace(live, { models, live: { feed: [], waiting: true, hint: hints[0] } });
    paintElapsed();
    let i = 0;
    stopHints();
    if (reducedMotion()) return;
    hintTimer = setInterval(() => {
      const el = host.querySelector('.ca-live-hint');
      if (!el || !onAgentTab()) return stopHints();
      i = (i + 1) % hints.length;
      el.classList.remove('ca-live-in'); void el.offsetWidth; el.classList.add('ca-live-in');
      el.textContent = hints[i];
    }, 1800);
  }

  /** 응답이 오면 에이전트가 한 일을 한 줄씩 재생하며 단계 표시줄을 채운 뒤 최종 화면을 보여 준다. */
  async function replay(prev, next) {
    stopHints();
    const me = ++run;
    const events = next.events.slice(prev?.events?.length || 0);
    if (reducedMotion() || !events.length) { busyEnd(); session = next; draw({ enter: true }); return; }
    let board = (prev?.board || pendingSession('', {}).board).map(b => ({ ...b }));
    const feed = [];
    const first = { ...next, board: boardAt(board, next, events[0]), step: events[0].step, question: null };
    host.innerHTML = renderWorkspace(first, { models, live: { feed } });
    paintElapsed();
    for (const ev of events) {
      if (me !== run) return;
      if (!onAgentTab()) { busyEnd(); session = next; return; }
      board = boardAt(board, next, ev);
      const view = { ...next, board, step: ev.step, question: null };
      updateStepper(host, view);
      const head = host.querySelector('.ca-live h3');
      if (head) head.textContent = board.find(b => b.key === ev.step)?.title || '';
      feed.push(ev);
      const list = host.querySelector('.ca-live-feed');
      if (list) {
        list.querySelector('[aria-current]')?.removeAttribute('aria-current');
        list.insertAdjacentHTML('beforeend', `<li data-kind="${esc(ev.kind)}" class="ca-live-in" aria-current="true"><i aria-hidden="true">${esc(KIND_ICON[ev.kind] || '·')}</i><b>${esc(KIND_LABEL[ev.kind] || ev.kind)}</b><span>${esc(ev.message)}</span></li>`);
        list.scrollTop = list.scrollHeight;
      }
      await sleep(EVENT_DELAY[ev.kind] || 500);
    }
    if (me !== run) return;
    updateStepper(host, next);
    await sleep(350);
    if (me !== run) return;
    busyEnd();
    session = next;
    if (onAgentTab()) draw({ enter: true });
  }

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
      host.querySelector('.ca-start-footer > span').textContent = '등록한 청구서를 분석할 준비가 되었습니다.';
    };
    drop.addEventListener('keydown', e => {
      if (e.target !== drop || !['Enter', ' '].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation(); input.click();
    });
    input.addEventListener('change', e => pick(e.target.files?.[0]));
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', e => pick(e.dataTransfer?.files?.[0]));
    start.addEventListener('click', async () => {
      if (!file) return;
      const goal = { model_id: host.querySelector('[data-ca-model]').value || null, gpu_count: Number(host.querySelector('[data-ca-gpu]').value) || null };
      workMs = 0;
      const placeholder = pendingSession(file.name, goal);
      showWaiting(placeholder);
      host.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
      try {
        const next = await startSession(file, { modelId: goal.model_id, gpuCount: goal.gpu_count }, fetchImpl);
        await replay(placeholder, next);
      } catch (ex) {
        stopHints();
        busyEnd();
        session = null;
        draw();
        const err = host.querySelector('[data-ca-error]');
        if (err) err.textContent = ex.message;
      }
    });
  }

  async function submit(card, choice) {
    const answer = readAnswer(card, choice);
    const prev = session;
    showWaiting(prev);
    try {
      const next = await sendAnswer(prev.id, answer, fetchImpl);
      await replay(prev, next);
    } catch (ex) {
      busyEnd();
      session = prev;
      draw();
      const box = host.querySelector('.ca-question .ca-error');
      if (box) box.textContent = ex.message;
    }
  }

  host.onclick = async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.hasAttribute('data-ca-reset')) { run++; busyEnd(); workMs = 0; session = null; file = null; draw(); return; }
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
