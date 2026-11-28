/* 원가 에이전트 화면 (원가·제안가 › 청구서로 산정).
 * 시작 → 진행(단계 표시줄 + 질문 카드 + 확인된 내용) → 결과.
 * 에이전트(cost-agent /agent/v1/agent/sessions)가 단계를 진행하고, 이 화면은 상태를 그리기만 한다. 숫자 계산은 서버가 한다.
 */
import { createProgressPlayback } from './agent-progress-playback.mjs?v=hold5-1127';
import { AGENT_BASE, toCostForm, applyToForm, markMissing, requestJson, UPLOAD_LIMITS } from './bill-import.mjs?v=err-1128';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const STEP_ORDER = ['ANALYZE', 'MISSING', 'ASSUMPTIONS', 'SIMULATE', 'MARKET', 'TERMS', 'REVIEW', 'REPORT'];
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
function call(fetchImpl, path, init) {
  return requestJson(fetchImpl, `${AGENT_BASE}${path}`, init);  // 오류는 사용자 문구로 (bill-import.mjs errorMessage)
}

const ALLOWED = /\.(xlsx|csv|pdf)$/i;
/** 올리기 전에 확인: 파일 종류·개수·파일당 크기·합계. 문제가 없으면 null. */
export function checkUpload(files) {
  const MB = 1024 * 1024;
  const { fileMb, totalMb, files: maxFiles } = UPLOAD_LIMITS;
  if (files.length > maxFiles) return `한 번에 최대 ${maxFiles}개까지 올릴 수 있어요. 나눠서 올려 주세요.`;
  const bad = files.find(f => !ALLOWED.test(f.name || ''));
  if (bad) return `'${bad.name}': xlsx, csv, pdf 파일만 올릴 수 있어요.`;
  const big = files.find(f => f.size > fileMb * MB);
  if (big) return `'${big.name}' 파일이 너무 커요. 파일 하나는 최대 ${fileMb}MB까지 올릴 수 있어요.`;
  if (files.reduce((n, f) => n + f.size, 0) > totalMb * MB) return `올린 파일을 합쳐 최대 ${totalMb}MB까지 보낼 수 있어요. 나눠서 올려 주세요.`;
  return null;
}

/** 파일 하나(File)는 예전처럼 'file', 여러 개(배열)는 'files'로 보낸다 (부서별 문서 → 원가 기준표). */
export function startSession(fileOrFiles, goal, fetchImpl = fetch) {
  const body = new FormData();
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  if (files.length === 1) body.append('file', files[0], files[0].name);
  else files.forEach(f => body.append('files', f, f.name));
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
export const reportHtmlUrl = id => `${AGENT_BASE}/agent/sessions/${encodeURIComponent(id)}/report.html`;
/** 승인 보고서를 열자마자 인쇄 창(PDF로 저장)을 띄운다. 보고서 HTML에 A4 인쇄 서식이 있다. */
export const reportPdfUrl = id => `${reportHtmlUrl(id)}?print=1`;

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
        <input type="file" accept=".xlsx,.csv,.pdf" data-ca-file multiple hidden>
        <span class="ca-document" aria-hidden="true"><svg viewBox="0 0 48 56" fill="none"><path d="M8 2h22l12 12v38a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M30 2v12h12M15 25h18M15 32h18M15 39h10"/></svg></span>
        <strong>청구서·부서 문서를 여기에 놓으세요</strong>
        <span class="ca-upload-sub">또는 <span class="ca-file-action">파일 선택</span></span>
        <small>XLSX, CSV, PDF (스캔본은 서버 안에서 OCR) · 파일당 최대 5MB · 여러 개를 함께 올리면 원가 기준표로 합칩니다</small>
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

// ------------------------------------------------------------------ 확인 사항 등급
// 서버는 단계마다 WARNING과 사유(details)를 보내고, 승인 검토에서 발견 사항마다 등급(재검토·조건부)과 고칠 단계(fix_step)를 준다.
// 화면은 이 둘을 이어서 '!'가 얼마나 무거운지(빨강·주황·회색)와, 어디서 어떻게 처리되는지를 보여 준다.
const LEVEL_OF = { 재검토: 'high', 조건부: 'mid' };
const LEVEL_RANK = { note: 1, mid: 2, high: 3 };
const FLAG_LABEL = { high: '재검토 필요', mid: '확인 필요', note: '참고' };
const STEP_CODES = { SIMULATE: ['NO_FINANCING'] };  // fix_step은 다르지만 이 단계 경고에서 이어지는 발견 사항
const levelOfFinding = f => LEVEL_OF[f?.level] || 'mid';

/** 이 단계와 이어진 승인 검토 발견 사항. 승인 검토 단계는 전부. */
export function stepFindings(s, key) {
  const fs = s?.approval?.findings || [];
  return key === 'REVIEW' ? fs : fs.filter(f => f.fix_step === key || (STEP_CODES[key] || []).includes(f.code));
}

/** WARNING·ERROR 단계의 무게: high(손실·재검토) · mid(확인 필요) · note(판정에 들어가지 않는 참고). 그 밖은 null. */
export function stepLevel(b, s) {
  if (!b) return null;
  if (b.status === 'ERROR') return 'high';
  if (b.status !== 'WARNING') return null;
  const fs = stepFindings(s, b.key);
  if (fs.length) return fs.map(levelOfFinding).reduce((a, c) => (LEVEL_RANK[c] > LEVEL_RANK[a] ? c : a), 'note');
  if (b.key === 'TERMS') return 'high';  // 기간별 가격의 경고는 '원가보다 낮음(손실)' 하나뿐이다
  return s?.approval ? 'note' : 'mid';
}

/** 담당자가 직접 고른 결과인지 (입력 오류가 아니라는 것을 알려 준다). */
const chosenByUser = b => (b.key === 'MARKET' && /유지$/.test(b.summary || '')) || (b.key === 'ANALYZE' && /알고 진행/.test(b.summary || ''));

/** 이 확인 사항이 어디서 어떻게 처리되는지 한 문장. */
export function flagResolution(b, s, level) {
  if (b.status === 'ERROR') return '이 단계에서 멈췄어요. 사유를 확인하고 새 청구서로 다시 시작하세요.';
  if (chosenByUser(b)) return b.key === 'MARKET'
    ? "담당자가 '그대로 유지'를 골라 진행했어요. 입력이 잘못된 것이 아니라 보고서에 '시장 범위 밖'으로 표시됩니다."
    : '담당자가 총액 불일치를 확인하고 진행하기로 했어요. 보고서에 그대로 남습니다.';
  if (s?.question?.step === 'REVIEW') return b.key === 'REVIEW'
    ? "아래 카드에서 항목마다 '고치기'(해당 단계로 돌아감) 또는 '사유를 적고 진행'을 고르세요."
    : "아래 승인 검토 카드에서 '고치기'를 고르면 이 단계로 돌아와 다시 계산해요.";
  if (!s?.approval) return "입력이 막힌 것은 아니에요. 마지막 '승인 검토' 단계에서 다시 모아 고치거나 사유를 남깁니다.";
  if (level === 'high') return "재검토 사유라 사유를 적어도 판정이 바뀌지 않아요. 가정값이나 할인율을 고쳐 다시 계산해야 '승인 권고'가 됩니다.";
  if (level === 'mid') return '조건부 사유예요. 승인 보고서에 사유와 함께 남습니다.';
  return '승인 판정에는 들어가지 않는 참고 사항이에요. 값이 실제와 맞는지만 확인하세요.';
}

function flagButton(b, s, open) {
  const level = stepLevel(b, s);
  if (!level) return '';
  return `<button type="button" class="ca-step-flag" data-level="${level}" data-ca-flag="${esc(b.key)}" aria-expanded="${open === b.key}" aria-controls="ca-flag-panel">${FLAG_LABEL[level]}</button>`;
}

/** 단계 표시줄 아래: 고른 단계의 사유와 처리 방법. */
export function renderFlagPanel(s, open) {
  const b = (s?.board || []).find(x => x.key === open);
  const level = b && stepLevel(b, s);
  if (!level) return '';
  const fs = stepFindings(s, b.key);
  const seen = b.key === 'REVIEW' ? [] : (b.details || []).filter(Boolean);
  const lines = seen.map(t => `<li><span class="ca-lv" data-level="${level === 'high' && !fs.length ? 'high' : 'note'}">에이전트 확인</span><span>${esc(t)}</span></li>`)
    .concat(fs.map(f => `<li><span class="ca-lv" data-level="${levelOfFinding(f)}">${esc(f.level)}</span><span>${esc(f.message)}${f.reason ? `<small>진행 사유: ${esc(f.reason)}</small>` : ''}</span></li>`));
  return `<div class="ca-flag-panel" data-level="${level}" role="region" aria-label="${esc(b.title)} 확인 사항">
    <div class="ca-flag-head"><b>${esc(b.title)}</b><span class="ca-lv" data-level="${level}">${FLAG_LABEL[level]}</span>
      <button type="button" class="ca-flag-close" data-ca-flag="${esc(b.key)}" aria-label="닫기">×</button></div>
    ${lines.length ? `<ul>${lines.join('')}</ul>` : ''}
    <p>${esc(flagResolution(b, s, level))}</p>
  </div>`;
}

export function renderStepper(s, open = null) {
  const p = progressOf(s);
  const board = s.board || [];
  return `<div class="ca-progress" aria-label="진행 상황"${p.finished ? ' data-finished' : ''}>
    <div class="ca-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}"><i style="width:${p.pct}%"></i></div>
    <div class="ca-progress-top"><div class="ca-head">${stepHead(p)}</div>
      <div class="ca-meta"><span class="ca-elapsed" data-ca-elapsed></span><span class="ca-pct">${p.done}/${p.total} 단계 · ${p.pct}%</span></div></div>
    <ol class="ca-steps">${board.map((b, i) => `<li data-status="${esc(b.status)}" data-level="${stepLevel(b, s) || ''}"${b.key === s.step ? ' aria-current="step"' : ''}>
      <span class="ca-line" aria-hidden="true"><i></i></span>
      <span class="ca-dot" aria-hidden="true"><span class="ca-ic ca-num">${i + 1}</span>${DOT_ICONS}</span>
      <span class="ca-step-title">${esc(b.title)}</span>
      <span class="ca-step-sum" title="${esc(b.summary || '')}">${esc(shortSummary(b.summary) || STATUS_LABEL[b.status] || '')}</span>
      <span class="ca-flag-slot">${flagButton(b, s, open)}</span></li>`).join('')}</ol>
    <div class="ca-flag-panel-slot" id="ca-flag-panel">${renderFlagPanel(s, open)}</div>
  </div>`;
}

// ------------------------------------------------------------------ 질문 카드
function fieldPlaceholder(f, currency) {
  if (f.name === 'acquisition_amount') return currency === 'KRW' ? '예: 300,000,000 (원)' : currency === 'USD' ? '예: 240,000 (달러)' : '예: 240,000';
  if (/사내 인건비.*판관비/.test(f.label || '')) return '예: 50,000,000 (연간)';
  return f.placeholder || '';
}
function fieldInput(f, currency) {
  const id = `ca-f-${esc(f.name)}`;
  const value = f.value ?? '';
  const control = f.type === 'select'
    ? `<select id="${id}" name="${esc(f.name)}">${f.value == null ? '<option value="">선택</option>' : ''}${f.options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
    : `<input id="${id}" name="${esc(f.name)}" type="${f.type === 'number' ? 'number' : 'text'}" step="any" placeholder="${esc(fieldPlaceholder(f, currency))}" value="${esc(value)}" ${f.required ? 'required' : ''}>`;
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
    ${q.fields.length ? `<div class="ca-fields">${q.fields.map(f => fieldInput(f, q.fields.find(field => field.name === 'acquisition_currency')?.value)).join('')}</div>` : ''}
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
const STEP_TITLES = { ANALYZE: '청구서 분석', MISSING: '누락 확인', ASSUMPTIONS: '가정값 확인', SIMULATE: '원가 계산', MARKET: '시장 비교', TERMS: '기간별 가격', REVIEW: '승인 검토', REPORT: '견적 근거서' };
const KIND_ICON = { think: '◆', tool: '⚙', ask: '?', answer: '✎', result: '✓', warn: '!' };

export function renderLive(s, { feed = [], waiting = false, hint = '', completed = false } = {}) {
  const step = s.board?.find(b => b.key === s.step);
  const lines = feed.map((e, i) => `<li data-kind="${esc(e.kind)}" class="ca-live-in"${i === feed.length - 1 && !waiting ? ' aria-current="true"' : ''}><i aria-hidden="true">${esc(KIND_ICON[e.kind] || '·')}</i><b>${esc(KIND_LABEL[e.kind] || e.kind)}</b><span>${esc(e.message)}</span></li>`).join('');
  return `<div class="ca-card ca-live" aria-live="polite" aria-busy="${!completed}">
    <div class="ca-live-head"><span class="ca-orb" aria-hidden="true"><i></i><i></i><i></i></span>
      <div><p class="ca-step-label">${completed ? '처리 내역' : '에이전트 작업 중'}</p><h3>${esc(step?.title || '준비 중')}</h3></div></div>
    <ol class="ca-live-feed">${lines}${waiting ? `<li class="ca-live-wait"><i aria-hidden="true">…</i><span class="ca-live-hint">${esc(hint)}</span><span class="ca-dots" aria-hidden="true"><b></b><b></b><b></b></span></li>` : ''}</ol>
    ${completed ? '<div class="ca-playback-controls"><span data-ca-playback-status role="timer">처리 내역 표시 중</span><div><button type="button" class="ca-btn ca-btn-ghost" data-ca-playback-pause aria-pressed="false">일시정지</button><button type="button" class="ca-btn ca-btn-primary" data-ca-playback-next>다음</button></div></div>' : ''}
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

// ------------------------------------------------------------------ 원가 기준표 (여러 부서 문서)
const CELL_LABEL = {
  rack: '랙·상면 사용료', rent: '공간 임대료', electricity: '전력·냉각', network: '회선·스토리지',
  operations: '운영비 (청구서 운영비 + 사내 인건비·판관비)', gpu_lease: 'GPU 임차', memory: '메모리', other: '기타',
  acquisition: '서버·GPU 취득비', gpu_model: 'GPU 모델', gpu_count: 'GPU 수', depreciation_years: '감가상각 연수',
  utilization: '유료 가동률', pricing_method: '마진 방식', target_rate: '목표 마진', fx_krw_per_usd: '환율 (원/달러)',
  interest_rate_type: '금리 종류', annual_interest_rate: '연 금리', discount_3: '3년 약정 할인', discount_5: '5년 약정 할인',
  plan_annual_cost: '검산 연간 원가', plan_hourly_cost: '검산 시간당 원가', plan_price: '검산 시간당 판매가', plan_price_usd: '검산 달러 판매가'
};
const CORE_CELLS = ['rack', 'electricity', 'network', 'operations', 'acquisition'];
const CELL_STATUS = { filled: '채움', included: '다른 요금에 포함', excluded: '제외', empty: '빈칸', conflict: '충돌' };
const METHOD_LABEL = { REVENUE_MARGIN: '매출 기준 이익률', COST_MARKUP: '원가 가산율' };

function cellValue(c) {
  if (c.status === 'conflict') return (c.candidates || []).map(x => `${esc(x.text)} <small>(${esc(x.doc)})</small>`).join(' · ');
  if (c.value == null || c.value === '') return '—';
  if (c.unit === '%') return `${Math.round(Number(c.value) * 1000) / 10}%`;
  if (c.unit === '원' || c.currency === 'KRW') return esc(money(c.value, 'KRW'));
  if (c.unit === 'method') return esc(METHOD_LABEL[c.value] || c.value);
  if (typeof c.value === 'number') return `${esc(c.value.toLocaleString('ko-KR'))}${esc(c.unit === 'KRW/USD' ? '원/달러' : c.unit || '')}`;
  return esc(c.value);
}

/** 원가 기준표: 칸마다 값 · 상태 · 출처 문서 · 등급 · 메모. 빈 비핵심 칸은 뺀다. */
export function renderSheet(s) {
  const cells = s?.sheet?.cells;
  if (!cells) return '';
  const rows = Object.values(cells).filter(c => c.status !== 'empty' || CORE_CELLS.includes(c.key)).map(c => {
    const docs = [...new Set((c.sources || []).map(x => x.doc))];
    const fixed = s.sheet_answers?.[c.key] ? ' <span class="ca-tag">담당자 확인</span>' : '';
    return `<tr data-status="${esc(c.status)}"><th scope="row">${esc(CELL_LABEL[c.key] || c.key)}${fixed}</th><td>${cellValue(c)}</td>
      <td><span class="ca-cell-status">${esc(CELL_STATUS[c.status] || c.status)}</span></td>
      <td>${docs.map(d => `<span class="ca-doc">${esc(d)}</span>`).join(' ') || '—'}${c.grade ? `<small>${esc(c.grade)}</small>` : ''}</td>
      <td class="ca-muted">${esc(c.note || '')}</td></tr>`;
  }).join('');
  const notices = (s.sheet.notices || []).map(n => `<li>${esc(n)}</li>`).join('');
  return `<details class="ca-sheet" open><summary>원가 기준표</summary>
    ${notices ? `<ul class="ca-sheet-notices" role="alert">${notices}</ul>` : ''}
    <div class="ca-sheet-wrap"><table><thead><tr><th>칸</th><th>값</th><th>상태</th><th>출처</th><th>메모</th></tr></thead><tbody>${rows}</tbody></table></div>
  </details>`;
}

// ------------------------------------------------------------------ 확인할 점 (천천히 보여 주기)
// 누락값·오류·질문 줄은 재생할 때 더 오래 머물고, 다음 카드 위에 '확인할 점'으로 남는다 (담당자가 놓치지 않게)
/** 확인할 점: 주의(오류·기준선 경고) 줄과 누락값 질문. 다른 질문(가정값·할인율)은 카드 자체가 보여 주므로 넣지 않는다. */
export const isIssue = e => e?.kind === 'warn' || (e?.kind === 'ask' && e?.step === 'MISSING');
/** 진행 줄을 따라 내려갈지: 확인할 점이 한 번 나오면 그 줄이 밀려 올라가지 않게 멈춘다. */
export const followFeed = feed => !feed.some(isIssue);
export function renderIssues(events = []) {
  const list = events.filter(isIssue);
  if (!list.length) return '';
  return `<div class="ca-card ca-issues" role="status" aria-live="polite">
    <p class="ca-step-label">이번 단계에서 확인할 점 ${list.length}개</p>
    <ol>${list.map((e, i) => `<li data-kind="${esc(e.kind)}" style="--i:${i}"><b>${esc(STEP_TITLES[e.step] || e.step || '')}</b><span>${esc(e.message)}</span></li>`).join('')}</ol>
  </div>`;
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

/** 판단 요약 한 줄의 색: bad(손실·불완전 원가·재검토) · warn(확인 필요). 서버 문장 형식에 맞춘다. */
export function summaryTone(line, s) {
  const t = String(line || '');
  const cost = Number(s?.simulation?.hourlyCost);
  const term = t.match(/^(\d+)년 계약가 \$([\d.]+)/);
  if (term) return Number.isFinite(cost) && Number(term[2]) < cost ? 'bad' : '';
  const check = t.match(/자동 검증 (\d+)\/(\d+)/);
  if (check) return Number(check[1]) < Number(check[2]) ? 'bad' : '';
  if (/승인 검토 판정: 재검토|불완전 원가|손실/.test(t)) return 'bad';
  if (/승인 검토 판정: 조건부|불일치|빠져 있습니다|예시값/.test(t)) return 'warn';
  const m = s?.market, cand = Number(s?.simulation?.candidatePrice);
  if (/^시장 공개가격/.test(t) && m?.count && Number.isFinite(cand) && (cand < m.min || cand > m.max)) return 'warn';
  return '';
}

/** 결과 맨 위: 권고와 확인할 점 (등급 색, 진행 사유, 고칠 단계). */
export function renderChecks(s) {
  const ap = s.approval;
  if (!ap) return '';
  const fs = ap.findings?.length ? ap.findings
    : (ap.reasons || []).map(message => ({ level: ap.verdict === '재검토' ? '재검토' : '조건부', message }));
  const count = lv => fs.filter(f => f.level === lv).length;
  const tally = [['재검토', count('재검토')], ['조건부', count('조건부')]].filter(([, n]) => n).map(([lv, n]) => `${lv} ${n}`).join(' · ');
  const note = ap.verdict === '재검토' ? "재검토 사유는 사유를 적어도 판정이 바뀌지 않아요. 가정값이나 할인율을 고쳐 다시 계산해야 '승인 권고'가 됩니다."
    : ap.verdict === '조건부' ? '조건부 사유는 승인 보고서에 사유와 함께 남습니다.' : '';
  const tone = ap.verdict === '재검토' ? 'high' : ap.verdict === '조건부' ? 'mid' : 'ok';  // CSS 선택자에는 한글을 쓰지 않는다 (인코딩)
  return `<section class="ca-checks" data-level="${tone}" aria-label="승인 검토 결과">
    <div class="ca-checks-head"><b>권고: ${esc(ap.verdict)}</b><span>${fs.length ? `확인할 점 ${fs.length}개${tally ? ` · ${tally}` : ''}` : '확인할 점 없음'}</span></div>
    ${fs.length ? `<ol>${fs.map(f => `<li data-level="${levelOfFinding(f)}"><span class="ca-lv" data-level="${levelOfFinding(f)}">${esc(f.level)}</span>
      <div><p>${esc(f.message)}</p>${f.reason || f.fix_step ? `<small>${f.reason ? `진행 사유: ${esc(f.reason)}` : ''}${f.reason && f.fix_step ? ' · ' : ''}${f.fix_step ? `관련 단계: ${esc(STEP_TITLES[f.fix_step] || f.fix_step)}` : ''}</small>` : ''}</div></li>`).join('')}</ol>` : ''}
    ${note ? `<p class="ca-checks-note">${esc(note)}</p>` : ''}
  </section>`;
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
    ${renderChecks(s)}
    <h4>시장에서의 위치</h4>${renderMarket(s.market)}
    ${renderSheet(s)}
    <h4>에이전트 판단 요약</h4><ul class="ca-summary-list">${(s.summary || []).map(l => { const t = summaryTone(l, s); return `<li${t ? ` data-tone="${t}"` : ''}>${esc(l)}</li>`; }).join('')}</ul>
    <div class="ca-actions">
      ${s.report_ready && s.approval ? `<a class="ca-btn ca-btn-primary" href="${reportPdfUrl(s.id)}" target="_blank" rel="noopener">승인 보고서 PDF 저장</a>` : ''}
      ${s.report_ready ? `<a class="ca-btn ${s.approval ? 'ca-btn-ghost' : 'ca-btn-primary'}" href="${reportUrl(s.id)}" download>견적 근거서 엑셀 다운로드</a>` : ''}
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

export function renderWorkspace(s, { busyLabel = '', models = [], live = null, enter = false, issues = [], openFlag = null } = {}) {
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
    : s.question ? renderIssues(issues) + renderQuestion(s.question, s) + (s.question.step === 'MISSING' ? renderSheet(s) : '')
      : s.step === 'DONE' && s.simulation ? renderIssues(issues) + renderResult(s)
        : renderIssues(issues) + `<div class="ca-card"><h3>에이전트가 멈췄습니다</h3><p class="ca-desc">단계 표시줄에서 중단된 이유를 확인하고 새 청구서로 다시 시작하세요.</p><div class="ca-actions"><button type="button" class="ca-btn ca-btn-primary" data-ca-reset>새 청구서로 시작</button></div></div>`;
  return `<section class="ca ca-run">
    <header class="ca-runhead"><div><p class="ca-eyebrow">원가 에이전트</p><h2>${esc(s.docs?.length ? `부서 문서 ${s.docs.length}개` : d?.file_name || '청구서 분석')}</h2>
      <div class="ca-chips">${chips.map(c => `<span>${esc(c)}</span>`).join('')}</div></div>
      <button type="button" class="ca-btn ca-btn-ghost" data-ca-reset>새 청구서</button></header>
    ${renderStepper(s, openFlag)}
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

// 조건부 입력칸: 'amount:네트워크'처럼 접두사가 있으면 같은 그룹의 'choice:'/'finding:' 칸을,
// 선택지 버튼이 있으면 그 선택을, 아니면 show_for 값을 선택지로 가진 select 칸을 따른다.
export function hiddenFields(fields, values = {}, chosen) {
  const valueOf = f => values[f.name] ?? f.value;
  const byName = Object.fromEntries(fields.map(f => [f.name, f]));
  const hidden = [];
  for (const f of fields) {
    const only = f.show_for || [];
    if (!only.length) continue;
    let current;
    const key = f.name.includes(':') ? f.name.split(':').slice(1).join(':') : null;
    const ctl = key && (byName[`choice:${key}`] || byName[`finding:${key}`]);
    if (ctl) current = valueOf(ctl);
    else if (chosen !== undefined) current = chosen;
    else {
      const sel = fields.find(g => g !== f && g.type === 'select' && (g.options || []).some(o => only.includes(String(o.value))));
      current = sel ? valueOf(sel) : undefined;
    }
    if (!only.includes(String(current))) hidden.push(f.name);
  }
  return hidden;
}

function syncShowFor(card) {
  const chosen = card.querySelector('.ca-opt[aria-pressed="true"]')?.dataset.choice;
  const labels = [...card.querySelectorAll('.ca-field')];
  const fields = labels.map(label => {
    const el = label.querySelector('input,select');
    return { name: el?.name || '', type: el?.tagName === 'SELECT' ? 'select' : 'text', value: el?.value,
      options: el?.tagName === 'SELECT' ? [...el.options].map(o => ({ value: o.value })) : [],
      show_for: label.dataset.showFor ? label.dataset.showFor.split(',') : [] };
  });
  const hidden = new Set(hiddenFields(fields, {}, card.querySelector('.ca-opt') ? chosen : undefined));
  labels.forEach((label, i) => { label.hidden = hidden.has(fields[i].name); });
}

// ------------------------------------------------------------------ 마운트
let disposeMount = () => {};
let activeMount = 0;
let session = null;   // 탭을 오가도 진행 중인 세션을 유지한다

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const EVENT_DELAY = { think: 650, tool: 750, ask: 1200, answer: 350, result: 600, warn: 1800 };
/** 한 줄을 보여 주고 다음 줄까지 기다릴 시간. 누락·오류(주의)와 질문은 읽을 시간을 더 준다. */
export const eventDelay = ev => EVENT_DELAY[ev?.kind] || 500;
export const fileLabel = files => files.length > 1 ? `${files[0].name} 외 ${files.length - 1}개` : files[0]?.name || '';
export function fmtElapsed(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  return sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분 ${String(sec % 60).padStart(2, '0')}초`;
}
// 다른 탭으로 옮겼으면 화면을 덮어쓰지 않는다 (#cost 가 에이전트 탭)
const onAgentTab = () => location.hash.startsWith('#cost') && !location.hash.split('/')[1];

/** 단계 표시줄을 다시 그리지 않고 상태만 바꿔 전환 애니메이션이 보이게 한다. */
function updateStepper(root, s, open = null) {
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
    li.dataset.level = stepLevel(b, s) || '';
    const slot = li.querySelector('.ca-flag-slot');
    if (slot) slot.innerHTML = flagButton(b, s, open);
  });
  const panel = prog.querySelector('.ca-flag-panel-slot');
  if (panel) panel.innerHTML = renderFlagPanel(s, open);
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
  disposeMount();
  const mountId = ++activeMount;
  const isCurrent = () => mountId === activeMount;
  let files = [];
  let issues = [];      // 마지막 응답에서 나온 주의·질문 줄 (다음 카드 위에 남김)
  let openFlag = null;  // 단계 표시줄에서 사유를 펼친 단계
  let hintTimer = null;
  let playback = null;
  let run = 0;          // 새 청구서로 전환하면 이전 요청의 응답을 무시한다
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
    if (!clock) clock = setInterval(() => { if (!isCurrent()) busyEnd(); else if (onAgentTab()) paintElapsed(); }, 1000);
  };
  const busyEnd = () => {
    if (busySince) workMs += Date.now() - busySince;
    busySince = null;
    if (clock) clearInterval(clock);
    clock = null;
    paintElapsed();
  };
  const stopHints = () => { if (hintTimer) clearInterval(hintTimer); hintTimer = null; };
  disposeMount = () => { run++; playback?.stop(); stopHints(); busyEnd(); };
  const draw = (opts = {}) => {
    stopHints();
    host.innerHTML = session ? renderWorkspace(session, { ...opts, models, issues, openFlag }) : renderStart(models);
    paintElapsed();
    const card = host.querySelector('.ca-question');
    if (card) {
      syncShowFor(card);
      card.addEventListener('change', () => syncShowFor(card));  // select를 바꾸면 조건부 입력칸을 다시 맞춘다
    }
    if (!session) wireStart();
    if (opts.enter && !reducedMotion()) countUp(host);
  };

  /** 서버 응답을 기다리는 동안: 현재 단계를 진행 중으로 두고 작업 문구를 순환한다. */
  function showWaiting(base) {
    playback?.stop(); playback = null;
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
      if (!isCurrent() || !host.isConnected || !el || !onAgentTab()) return stopHints();
      i = (i + 1) % hints.length;
      el.classList.remove('ca-live-in'); void el.offsetWidth; el.classList.add('ca-live-in');
      el.textContent = hints[i];
    }, 1800);
  }

  /** 처리 내역을 순서대로 표시한 뒤 5초간 유지한다. */
  function replay(prev, next, requestId) {
    if (requestId !== run || !isCurrent()) return;
    stopHints(); busyEnd(); playback?.stop();
    session = next;
    if (!onAgentTab()) return;
    const events = (next.events || []).slice(prev?.events?.length || 0);
    issues = events.filter(isIssue);
    if (!events.length) { draw({enter:true}); return; }
    let board = (prev?.board || pendingSession('', {}).board).map(b => ({...b}));
    const first = {...next, board:boardAt(board,next,events[0]), step:events[0].step, question:null};
    host.innerHTML = renderWorkspace(first,{models,live:{feed:[],completed:true}});
    paintElapsed();
    const valid = () => requestId === run && isCurrent() && host.isConnected && onAgentTab();
    let readingStarted = false;
    const shown = [];
    playback = createProgressPlayback({events, immediate:reducedMotion(),
      delayFor:eventDelay,
      active:()=>{if (!valid()) {playback?.stop();return false;}return !document.hidden;},
      onEvent:ev=>{
        shown.push(ev);
        board = boardAt(board,next,ev);
        updateStepper(host,{...next,board,step:ev.step,question:null});
        const heading = host.querySelector('.ca-live h3');
        if (heading) heading.textContent = board.find(b=>b.key===ev.step)?.title || '';
        const list = host.querySelector('.ca-live-feed');
        if (list) {
          list.querySelector('[aria-current]')?.removeAttribute('aria-current');
          list.insertAdjacentHTML('beforeend',`<li data-kind="${esc(ev.kind)}" class="ca-live-in${isIssue(ev) ? ' ca-live-issue' : ''}" aria-current="true"><i aria-hidden="true">${esc(KIND_ICON[ev.kind] || '·')}</i><b>${esc(KIND_LABEL[ev.kind] || ev.kind)}</b><span>${esc(ev.message)}</span></li>`);
          if (followFeed(shown.slice(0, -1))) {  // 확인할 점이 나오면 그 줄을 맨 위에 두고 더 내리지 않는다
            const li = list.lastElementChild;
            list.scrollTop = isIssue(ev) && li ? li.offsetTop - list.offsetTop : list.scrollHeight;
          }
        }
      },
      onState:({paused,phase,seconds})=>{
        const status=host.querySelector('[data-ca-playback-status]');
        const text=paused?'일시정지됨':phase==='reading'?`${seconds}초 후 다음 단계로 이동`:'처리 내역 표시 중';
        if(status && status.textContent!==text)status.textContent=text;
        const button=host.querySelector('[data-ca-playback-pause]');
        if(button){button.textContent=paused?'계속':'일시정지';button.setAttribute('aria-pressed',String(paused));}
        host.querySelector('.ca-live')?.classList.toggle('ca-playback-paused',paused);
        if(phase==='reading' && !readingStarted){readingStarted=true;updateStepper(host,next);}
      },
      onComplete:()=>{
        if(!valid())return;
        playback=null;draw({enter:true});
        const heading=host.querySelector('.ca-main h3');
        heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
      }
    });
  }

  function wireStart() {
    const drop = host.querySelector('[data-ca-drop]');
    const input = host.querySelector('[data-ca-file]');
    const start = host.querySelector('[data-ca-start]');
    const pick = list => {
      const picked = [...(list || [])];
      if (!picked.length) return;
      const problem = checkUpload(picked);
      const err = host.querySelector('[data-ca-error]');
      if (err) err.textContent = problem || '';
      if (problem) { files = []; start.disabled = true; drop.classList.remove('has-file'); host.querySelector('[data-ca-filename]').textContent = ''; return; }
      files = picked;
      host.querySelector('[data-ca-filename]').textContent = `선택됨 · ${fileLabel(files)}`;
      drop.classList.add('has-file');
      start.disabled = false;
      host.querySelector('.ca-start-footer > span').textContent = files.length > 1
        ? `문서 ${files.length}개를 원가 기준표로 합쳐 분석할 준비가 되었습니다.` : '등록한 청구서를 분석할 준비가 되었습니다.';
    };
    drop.addEventListener('keydown', e => {
      if (e.target !== drop || !['Enter', ' '].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation(); input.click();
    });
    input.addEventListener('change', e => pick(e.target.files));
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', e => pick(e.dataTransfer?.files));
    start.addEventListener('click', async () => {
      if (!files.length) return;
      const goal = { model_id: host.querySelector('[data-ca-model]').value || null, gpu_count: Number(host.querySelector('[data-ca-gpu]').value) || null };
      const requestId = ++run;
      workMs = 0;
      const placeholder = pendingSession(fileLabel(files), goal);
      showWaiting(placeholder);
      host.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
      try {
        const next = await startSession(files.length === 1 ? files[0] : files, { modelId: goal.model_id, gpuCount: goal.gpu_count }, fetchImpl);
        await replay(placeholder, next, requestId);
      } catch (ex) {
        if (requestId !== run || !isCurrent()) return;
        busyEnd();
        session = null;
        if (!onAgentTab()) return;
        draw();
        const err = host.querySelector('[data-ca-error]');
        if (err) err.textContent = ex.message;
      }
    });
  }

  async function submit(card, choice) {
    const answer = readAnswer(card, choice);
    const prev = session;
    const requestId = ++run;
    showWaiting(prev);
    try {
      const next = await sendAnswer(prev.id, answer, fetchImpl);
      await replay(prev, next, requestId);
    } catch (ex) {
      if (requestId !== run || !isCurrent()) return;
      busyEnd();
      session = prev;
      if (!onAgentTab()) return;
      draw();
      const box = host.querySelector('.ca-question .ca-error');
      if (box) box.textContent = ex.message;
    }
  }

  host.onclick = async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.hasAttribute('data-ca-reset')) { playback?.stop(); playback=null; run++; busyEnd(); workMs = 0; session = null; files = []; issues = []; openFlag = null; draw(); return; }
    if (btn.hasAttribute('data-ca-flag') && session) {
      openFlag = openFlag === btn.dataset.caFlag ? null : btn.dataset.caFlag;
      const shown = playback ? null : session;  // 재생 중에는 표시줄이 재생 상태를 그리므로 끝난 뒤에 반영한다
      if (shown) updateStepper(host, shown, openFlag);
      host.querySelector(`.ca-step-flag[data-ca-flag="${CSS.escape(openFlag || btn.dataset.caFlag)}"]`)?.focus();
      return;
    }
    if (btn.hasAttribute('data-ca-playback-next')) { playback?.next(); return; }
    if (btn.hasAttribute('data-ca-playback-pause')) { playback?.toggle(); return; }
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
  host.onchange = e => {
    if (e.target.name !== 'acquisition_currency') return;
    const amount = e.target.closest('.ca-question')?.querySelector('[name="acquisition_amount"]');
    if (amount) amount.placeholder = fieldPlaceholder({name:'acquisition_amount'}, e.target.value);
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
