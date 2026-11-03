// 문제 풀이 화면: 시작 화면 → 세션(문제 → 해설 → 다음) → 결과
import { $, h, fmt, sanitizeHtml, todayStr, addDays, toast, speak, openModal } from './util.js';
import { load, commit } from './storage.js';
import {
  TYPES, SRS_STEPS, EXAM_GROUPS, groupOf, levelOf, loadData, balancedPick, buildExam, srsDue,
  dailyAvailable, extraAvailable, wrongAvailable, unreleasedCount,
} from './data.js';
import { addWord, findWord } from './words.js';
import { openWordModal } from './vocab.js';
import { recentlySelected } from './select.js';
import { linkKanji } from './kanji.js';
import { REPO } from './config.js';

let pendingDrill = null; // 통계 화면의 '이 유형 집중 풀기' 요청
export const requestDrill = type => { pendingDrill = type; };

// { items, queue:[{item, qi}], pos, mode, results:{id:[bool]}, answered, arrange, exam:{deadline,startedAt,limitMin}|null }
let session = null;
let examTimer = null;
const stopTimer = () => { clearInterval(examTimer); examTimer = null; };

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'];
const MODE_LABEL = { daily: '오늘의 문제', extra: '더 풀기', review: '틀린 문제 복습', drill: '집중 풀기', srs: '간격 복습', exam: '모의고사' };
const SQUASH = s => String(s ?? '').replace(/\[\[(.+?)\]\]/g, '$1').replace(/\{([^{}|]+)\|([^{}]+)\}/g, '$1').replace(/[\s　、。，,．.・「」『』]/g, '');

/* ───────── 시작 화면 ───────── */
export async function renderQuizHome(view) {
  stopTimer();
  session = null;
  view.replaceChildren(h('div', { class: 'empty' }, '불러오는 중…'));
  let d;
  try { d = await loadData(); }
  catch (e) { view.replaceChildren(h('div', { class: 'card' }, '문제 데이터를 불러오지 못했어요. ', h('div', { class: 'sub' }, String(e.message)))); return; }
  const progress = await load('progress');
  const today = todayStr();
  const daily = dailyAvailable(d, progress, today);
  const wrong = wrongAvailable(d, progress);
  const due = srsDue(d, progress, today);

  if (pendingDrill) {
    const type = pendingDrill; pendingDrill = null;
    // 틀렸던 문제 → 공개됐지만 안 푼 문제 → 아직 공개 전인 새 문제 순으로 최대 10문제
    const pool = [...wrong, ...dailyAvailable(d, progress, today), ...extraAvailable(d, progress, type)].filter(i => i.type === type);
    const items = [...new Map(pool.map(i => [i.id, i])).values()].slice(0, 10);
    if (items.length) return start(items, 'drill');
    toast('이 유형에서 풀 문제가 없어요. 문제가 새로 추가되면 다시 시도해 주세요.');
  }

  const typeSel = h('select', {}, h('option', { value: '' }, '전체 유형'),
    ...Object.entries(TYPES).filter(([k]) => d.items.some(i => i.type === k)).map(([k, v]) => h('option', { value: k }, v)));
  const countSel = h('select', {}, ...[5, 10, 20].map(n => h('option', { value: n }, `${n}문제`)));
  const extraInfo = h('div', { class: 'sub' });
  const extraBtn = h('button', { class: 'btn block', onclick: () => {
    const pool = extraAvailable(d, progress, typeSel.value);
    start(balancedPick(pool, Number(countSel.value)), 'extra');
  } }, '더 풀기');
  const refreshExtra = () => {
    const n = extraAvailable(d, progress, typeSel.value).length;
    extraInfo.textContent = n ? `이 조건으로 풀 수 있는 새 문제 ${n}개` : '이 조건의 새 문제가 없어요. 문제 풀을 채워 주세요.';
    extraBtn.disabled = n === 0;
  };
  typeSel.addEventListener('change', refreshExtra);

  const qCount = d.items.reduce((a, i) => a + i.questions.length, 0);
  const examSel = h('select', {}, ...[10, 20, 30].filter(n => n <= Math.max(10, qCount)).map(n => h('option', { value: n }, `${n}문항 · ${n}분`)));

  view.replaceChildren(
    h('div', { class: 'card' },
      h('h2', {}, '오늘의 문제'),
      h('div', { class: 'sub' }, daily.length ? `풀지 않은 문제 ${daily.length}개 (평일 오전에 새 문제가 추가돼요)` : '오늘 분량은 모두 풀었어요 👏'),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', disabled: !daily.length, onclick: () => start(daily, 'daily') }, '시작'))),
    h('div', { class: 'card' },
      h('h2', {}, '오늘의 복습'),
      h('div', { class: 'sub' }, due.length
        ? `복습할 문제 ${due.length}개 — 틀린 문제는 ${SRS_STEPS.join('·')}일 뒤에 다시 나와요`
        : '오늘 도착한 복습이 없어요. 문제를 틀리면 잊을 때쯤 다시 나와요.'),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', disabled: !due.length, onclick: () => start(due, 'srs') }, '복습 시작'))),
    h('div', { class: 'card' },
      h('h2', {}, '모의고사'),
      h('div', { class: 'sub' }, '어휘·문법·독해를 시험 비율로 섞고 시간을 재요. 풀 때는 해설이 안 나오고, 끝나면 유형별 결과와 목표 점수 비교를 보여 줘요.'),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('div', { class: 'grow' }, examSel),
        h('button', { class: 'btn primary', disabled: !d.items.length, onclick: () => {
          const n = Number(examSel.value);
          start(buildExam(d, progress, n), 'exam', { limitMin: n });
        } }, '시작'))),
    h('div', { class: 'card' },
      h('h2', {}, '더 풀기'),
      h('div', { class: 'sub' }, `시간이 많을 때 아직 공개되지 않은 새 문제를 미리 풀어요. (풀 남은 문제: ${unreleasedCount(d)}개)`),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('div', { class: 'grow' }, typeSel), h('div', {}, countSel)),
      extraInfo, h('div', { style: 'height:8px' }), extraBtn),
    h('div', { class: 'card' },
      h('h2', {}, '틀린 문제 복습'),
      h('div', { class: 'sub' }, wrong.length ? `다시 풀어볼 문제 ${wrong.length}개 (일정과 상관없이 전부)` : '틀린 문제가 아직 없어요'),
      h('div', { class: 'row end' }, h('button', { class: 'btn', disabled: !wrong.length, onclick: () => start(wrong, 'review') }, '복습 시작'))));
  refreshExtra();
}

/* ───────── 세션 ───────── */
async function start(items, mode, opts = {}) {
  if (!items.length) return toast('풀 문제가 없어요');
  stopTimer();
  const settings = await load('settings');
  const queue = items.flatMap(item => item.questions.map((_, qi) => ({ item, qi })));
  session = {
    items, queue, pos: 0, mode, results: {}, answered: false,
    arrange: settings.arrange !== false && mode !== 'exam', // ★ 문제를 조각 배열로 풀기 (모의고사는 시험처럼 선택지)
    exam: mode === 'exam' ? { startedAt: Date.now(), deadline: Date.now() + (opts.limitMin || queue.length) * 60000 } : null,
  };
  if (session.exam) {
    examTimer = setInterval(() => {
      const left = session.exam.deadline - Date.now();
      const el = document.getElementById('examTimer');
      if (el) el.textContent = fmtClock(left);
      if (left <= 0) { stopTimer(); toast('시간 종료!'); renderResult(); }
    }, 1000);
  }
  renderQuestion();
}

const fmtClock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const view = () => $('#view');
const currentQ = () => { const { item, qi } = session.queue[session.pos]; return { item, qi, q: item.questions[qi] }; };

function slotify(html) {
  return html.replace(/＿{2,}/g, '<span class="slot">　　</span>').replace(/★/g, '<span class="slot star">★</span>');
}

function renderQuestion() {
  const { item, qi, q } = currentQ();
  session.answered = false;
  const pct = Math.round((session.pos / session.queue.length) * 100);
  const arrange = session.arrange && item.type === 'sentence_order' && Array.isArray(q.order);

  // 글자를 길게 눌러 선택할 수 있도록 button 이 아닌 div[role=button] 로 만든다
  const choiceBtns = q.choices.map((c, i) => h('div', {
    class: 'choice jp', role: 'button', tabindex: '0',
    onclick: () => choose(i, choiceBtns),
    onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(i, choiceBtns); } },
  }, h('b', {}, String(i + 1)), h('span', { html: fmt(c) })));

  const passage = item.passage_html
    ? h('div', { class: 'passage', html: sanitizeHtml(item.passage_html) })
    : item.passage ? h('div', { class: 'passage jp', html: fmt(item.passage) }) : null;

  const body = arrange ? arrangeBody(item, q) : [
    q.stem ? h('div', { class: 'stem jp', html: slotify(fmt(q.stem)) }) : null,
    ...choiceBtns];

  view().replaceChildren(
    h('div', { class: 'row between' },
      h('span', { class: 'row' },
        h('span', { class: 'tag lv lv-' + levelOf(item) }, levelOf(item)),
        h('span', { class: 'tag' }, TYPES[item.type] || item.type)),
      h('span', { class: 'row' },
        session.exam ? h('span', { class: 'timer', id: 'examTimer' }, fmtClock(session.exam.deadline - Date.now())) : null,
        h('span', { class: 'sub' }, `${session.pos + 1} / ${session.queue.length}`),
        h('button', { class: 'btn small', onclick: () => renderQuizHome(view()) }, '종료'))),
    h('div', { class: 'progress' }, h('i', { style: `width:${pct}%` })),
    h('div', { class: 'card' },
      item.instruction ? h('div', { class: 'inst' }, item.instruction) : null,
      passage,
      ...body),
    h('div', { id: 'exp' }),
    h('div', { class: 'actions', id: 'actions' },
      h('button', { class: 'btn', onclick: () => openWordModal({ source: `quiz:${item.id}` }) }, '✏️ 단어 메모')));
  window.scrollTo(0, 0);
}

/* ───────── ★ 문장 완성: 조각 배열 ───────── */
function arrangeBody(item, q) {
  const parts = fmt(q.stem).split(/(＿{2,}|★)/);
  const slotCount = parts.filter(p => /^(＿{2,}|★)$/.test(p)).length;
  const placed = Array(slotCount).fill(null);
  const slotEls = [], chipEls = [];
  const confirmBtn = h('button', { class: 'btn primary', disabled: true, onclick: () => submit() }, '확인');

  const paint = () => {
    slotEls.forEach((el, k) => { el.innerHTML = placed[k] == null ? (el.classList.contains('star') ? '★' : '　　') : fmt(q.choices[placed[k]]); el.classList.toggle('filled', placed[k] != null); });
    chipEls.forEach((el, i) => el.classList.toggle('used', placed.includes(i)));
    confirmBtn.disabled = placed.some(v => v == null);
  };
  const place = i => {
    if (session.answered || recentlySelected() || placed.includes(i)) return;
    const k = placed.indexOf(null);
    if (k >= 0) { placed[k] = i; paint(); }
  };
  const lift = k => { if (!session.answered && !recentlySelected() && placed[k] != null) { placed[k] = null; paint(); } };

  let si = 0;
  const stemEl = h('div', { class: 'stem jp' }, ...parts.map(p => {
    if (!/^(＿{2,}|★)$/.test(p)) return h('span', { html: p });
    const k = si++;
    const el = h('span', { class: 'slot arr' + (p === '★' ? ' star' : ''), role: 'button', tabindex: '0', onclick: () => lift(k) }, p === '★' ? '★' : '　　');
    slotEls[k] = el;
    return el;
  }));
  const pool = h('div', { class: 'pieces' }, ...q.choices.map((c, i) => {
    const el = h('div', { class: 'piece jp', role: 'button', tabindex: '0', onclick: () => place(i),
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place(i); } } },
    h('span', { html: fmt(c) }));
    chipEls[i] = el;
    return el;
  }));

  async function submit() {
    if (session.answered || placed.some(v => v == null)) return;
    const assembled = (() => { let n = 0; return parts.map(p => (/^(＿{2,}|★)$/.test(p) ? q.choices[placed[n++]] : p)).join(''); })();
    const ok = placed.every((v, k) => v === q.order[k]) || (q.full && SQUASH(assembled) === SQUASH(q.full));
    slotEls.forEach((el, k) => el.classList.add(placed[k] === q.order[k] ? 'right' : 'miss'));
    chipEls.forEach(el => el.classList.add('locked'));
    confirmBtn.disabled = true;
    await settle(ok);
  }

  const toggle = h('button', { class: 'btn small', onclick: () => { session.arrange = false; renderQuestion(); } }, '선택지 방식으로 풀기');
  return [stemEl, h('div', { class: 'sub' }, '조각을 눌러 빈칸에 순서대로 넣어요. 넣은 조각을 누르면 빼낼 수 있어요.'), pool,
    h('div', { class: 'row end', style: 'margin-top:10px' }, toggle, confirmBtn)];
}

async function choose(i, btns) {
  if (session.answered) return;
  // 글자를 선택하던 중의 탭(선택 해제용)이 답 선택으로 처리되지 않게 한다
  if (recentlySelected()) return;
  const { q } = currentQ();
  const ok = i === q.answer;
  btns.forEach((b, k) => {
    b.classList.add('locked');
    b.setAttribute('aria-disabled', 'true');
    b.removeAttribute('tabindex');
    if (session.exam) { if (k === i) b.classList.add('picked'); }   // 모의고사: 정답을 알려 주지 않는다
    else if (k === q.answer) b.classList.add('correct');
    else if (k === i) b.classList.add('wrong');
  });
  await settle(ok);
}

// 정답 처리의 공통 부분: 기록 → (모의고사면 바로 다음, 아니면 해설)
async function settle(ok) {
  if (session.answered) return;
  session.answered = true;
  const { item, qi, q } = currentQ();
  (session.results[item.id] ||= [])[qi] = ok;
  await recordAnswer(item, qi, ok);

  if (session.exam) { setTimeout(() => { if (session && session.exam) next(); }, 250); return; }

  $('#exp').replaceChildren(buildExplanation(item, qi, q, ok));
  const last = session.pos === session.queue.length - 1;
  const actions = $('#actions');
  actions.replaceChildren(
    h('button', { class: 'btn', onclick: () => openWordModal({ source: `quiz:${item.id}` }) }, '✏️ 단어 메모'),
    h('button', { class: 'btn primary', onclick: next }, last ? '결과 보기' : '다음 문제'));
  $('#exp').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function recordAnswer(item, qi, ok) {
  const p = await load('progress');
  const s = (p.stats[item.type] ||= { n: 0, ok: 0 });
  s.n += 1; if (ok) s.ok += 1;
  // 최근 20문항의 결과(1=정답) — 통계 화면의 '요즘 추세'에 쓴다
  const rec = ((p.recent ||= {})[item.type] ||= []);
  rec.push(ok ? 1 : 0); if (rec.length > 20) rec.shift();
  const day = todayStr();
  p.days[day] = (p.days[day] || 0) + 1;
  // 아이템의 모든 문항을 마치면 '푼 문제'로 기록 (다시 출제되지 않음)
  const res = session.results[item.id] || [];
  const complete = item.questions.every((_, k) => typeof res[k] === 'boolean');
  if (complete) {
    p.done[item.id] = { at: Date.now(), res: [...res] };
    const srs = (p.srs ||= {});
    if (res.every(Boolean)) {
      delete p.wrong[item.id];
      // 복습 일정이 도래한 문제를 맞혔으면 다음 단계로 (미리 푼 경우엔 일정 유지)
      const cur = srs[item.id];
      if (cur && cur.due <= day) {
        const step = cur.step + 1;
        if (step >= SRS_STEPS.length) delete srs[item.id];
        else srs[item.id] = { step, due: addDays(day, SRS_STEPS[step]) };
      }
    } else {
      p.wrong[item.id] = true;
      srs[item.id] = { step: 0, due: addDays(day, SRS_STEPS[0]) };
    }
  }
  await commit('progress');
}

function next() {
  if (session.pos >= session.queue.length - 1) return renderResult();
  session.pos += 1;
  renderQuestion();
}

/* ───────── 해설 ───────── */
function buildExplanation(item, qi, q, ok) {
  const e = q.explanation || {};
  const card = h('div', { class: 'card exp' });
  card.append(h('div', { class: 'banner ' + (ok ? 'ok' : 'ng') },
    ok ? '⭕ 정답!' : `❌ 오답 — 정답은 ${CIRCLED[q.answer] || q.answer + 1}`));

  if (q.full) {
    card.append(h('div', { class: 'row' },
      h('div', { class: 'jp grow', html: fmt(q.full) }),
      h('button', { class: 'btn small', onclick: () => speak(q.full) }, '🔊')));
  }
  if (item.type === 'sentence_order' && Array.isArray(q.order)) {
    card.append(h('div', { class: 'sub' }, '올바른 배열: ' + q.order.map(k => CIRCLED[k]).join(' → ') + `  (★ = ${CIRCLED[q.answer]})`));
  }

  // 한국어 해석은 기본 숨김. 일본어 해설을 먼저 읽고, 필요할 때 펼친다.
  const ko = koSection(item, q, e);
  const toggle = h('button', { class: 'btn block ko-toggle', 'aria-expanded': 'false' }, '한국어 해석 보기');
  toggle.addEventListener('click', () => {
    ko.hidden = !ko.hidden;
    toggle.textContent = ko.hidden ? '한국어 해석 보기' : '한국어 해석 숨기기';
    toggle.setAttribute('aria-expanded', String(!ko.hidden));
  });
  card.append(toggle, ko);

  if (e.point) card.append(h('h3', {}, '포인트'), h('div', { class: 'jp-note', html: fmt(e.point) }));
  if (Array.isArray(e.choices) && e.choices.length) {
    card.append(h('h3', {}, '선택지 해설'),
      h('ol', { class: 'plain-list' },
        ...e.choices.map((t, k) => h('li', {}, h('b', {}, CIRCLED[k] + ' '), h('span', { html: fmt(t) })))));
  }
  if (Array.isArray(e.words) && e.words.length) {
    card.append(h('h3', {}, '주요 단어 (＋ 를 누르면 단어 오답노트에 저장)'),
      h('div', { class: 'words' }, ...e.words.map(w => wordRow(w, item.id))));
  }
  card.append(h('div', { class: 'row end', style: 'margin-top:10px' },
    h('button', { class: 'btn small', onclick: () => openReport(item, qi) }, '🚩 문제 신고')));
  // 해설 속 한자를 누르면 한자 카드가 열린다
  card.querySelectorAll('.jp.grow, .jp-note, .words .w, .plain-list .jp-note').forEach(el => linkKanji(el, { skip: recentlySelected }));
  return card;
}

// 한국어 번역 · 포인트 · 선택지별 한국어 뜻과 해설
function koSection(item, q, e) {
  const box = h('div', { class: 'ko', hidden: true });
  if (item.passage_translation) {
    box.append(h('h3', {}, '지문 번역'), h('div', {}, item.passage_translation));
  }
  if (e.translation) box.append(h('h3', {}, '번역'), h('div', {}, e.translation));
  if (e.point_ko) box.append(h('h3', {}, '포인트'), h('div', {}, e.point_ko));
  if (Array.isArray(e.choice_meanings)) {
    box.append(h('h3', {}, '선택지 뜻'),
      h('ol', { class: 'plain-list' },
        ...q.choices.map((c, k) => h('li', { class: k === q.answer ? 'right' : '' },
          h('b', {}, CIRCLED[k] + ' '),
          h('span', { class: 'jp', html: fmt(c) }),
          h('span', { class: 'sub' }, ' — ' + (e.choice_meanings[k] ?? ''))))));
  }
  if (Array.isArray(e.choices_ko) && e.choices_ko.length) {
    box.append(h('h3', {}, '선택지 해설'),
      h('ol', { class: 'plain-list' },
        ...e.choices_ko.map((t, k) => h('li', {}, h('b', {}, CIRCLED[k] + ' '), h('span', {}, t)))));
  }
  return box;
}

function wordRow(w, itemId) {
  const btn = h('button', { class: 'btn small', onclick: async () => {
    const r = await addWord({ word: w.w, reading: w.r || '', meaning: w.m || '', source: `quiz:${itemId}` });
    btn.textContent = '✓'; btn.disabled = true;
    toast(r.added ? '단어 오답노트에 저장했어요' : '이미 저장된 단어예요');
  } }, '＋');
  findWord(w.w, w.r || '').then(x => { if (x) { btn.textContent = '✓'; btn.disabled = true; } });
  return h('div', { class: 'word' },
    h('span', { class: 'w jp' }, w.w),
    h('span', { class: 'info' }, [w.r, w.m].filter(Boolean).join(' · ')),
    btn);
}

/* ───────── 문제 신고 ───────── */
export const REPORT_REASONS = ['정답이 여러 개예요', '정답이 틀렸어요', '일본어가 어색해요', '해설·번역이 틀렸어요', '급수가 안 맞아요', '기타'];

export function reportIssueUrl(item, qi, reason, memo) {
  const q = item.questions[qi];
  const body = [
    `- 문제: ${item.id} (문항 ${qi + 1}) / ${TYPES[item.type] || item.type} / ${levelOf(item)}`,
    `- 신고 사유: ${reason}`,
    memo ? `- 메모: ${memo}` : null,
    '', '```', (q.stem || '').slice(0, 200), ...q.choices.map((c, i) => `${i + 1}. ${c}`), `정답: ${q.answer + 1}`, '```',
  ].filter(x => x != null).join('\n');
  const title = `[문제 신고] ${item.id} q${qi + 1} — ${reason}`;
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

function openReport(item, qi) {
  const sel = h('select', {}, ...REPORT_REASONS.map(r => h('option', { value: r }, r)));
  const memo = h('textarea', { rows: '3', style: 'width:100%', placeholder: '어떤 점이 이상했는지 적어 주세요 (선택)' });
  const save = async () => {
    const list = await load('reports');
    list.push({ id: item.id, qi, reason: sel.value, memo: memo.value.trim(), at: Date.now() });
    await commit('reports');
  };
  openModal(`문제 신고 — ${item.id}`, h('div', {},
    h('div', { class: 'sub' }, '신고한 문제는 기기에 저장돼요. 「GitHub 이슈로 보내기」를 누르면 다음 자동 생성 때 확인해서 고치거나 빼요.'),
    h('div', { style: 'margin:8px 0' }, sel), memo),
  [
    { label: '닫기' },
    { label: '저장만', onClick: async () => { await save(); toast('신고를 저장했어요'); } },
    { label: 'GitHub 이슈로 보내기', cls: 'primary', onClick: async () => {
      await save();
      window.open(reportIssueUrl(item, qi, sel.value, memo.value.trim()), '_blank', 'noopener');
    } },
  ]);
}

/* ───────── 결과 ───────── */
function renderResult() {
  stopTimer();
  const all = session.queue.length;
  const okN = session.queue.filter(({ item, qi }) => session.results[item.id]?.[qi]).length;
  const exam = session.exam;
  const wrongItems = session.items.filter(it => exam
    ? it.questions.some((_, k) => session.results[it.id]?.[k] !== true)
    : session.results[it.id]?.some(r => r === false));
  const mode = session.mode;
  const pct = Math.round((okN / all) * 100);
  const extra = [];
  if (exam) extra.push(examReport(pct));
  view().replaceChildren(
    h('div', { class: 'card' },
      h('h2', {}, mode === 'exam' ? '모의고사 결과' : '수고했어요!'),
      h('div', { class: 'big' }, `${okN} / ${all}`),
      h('div', { class: 'sub' }, `정답률 ${pct}%` + (exam ? ` · 걸린 시간 ${fmtClock(Math.min(Date.now(), exam.deadline) - exam.startedAt)}` : '')),
      wrongItems.length ? h('div', { class: 'notice', style: 'margin-top:10px' }, exam
        ? `틀리거나 못 푼 문제 ${wrongItems.length}개 — 푼 것 중 틀린 문제는 '틀린 문제 복습'과 간격 복습에 들어갔어요.`
        : `틀린 문제 ${wrongItems.length}개는 '틀린 문제 복습'에 저장됐어요.`) : null),
    ...extra,
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => renderQuizHome(view()) }, '문제 홈'),
      wrongItems.length && mode !== 'review'
        ? h('button', { class: 'btn primary', onclick: () => start(wrongItems, 'review') }, '틀린 문제 바로 복습')
        : h('button', { class: 'btn primary', onclick: () => renderQuizHome(view()) }, '계속 풀기')));
  load('settings').then(s => {
    const t = document.getElementById('examTarget');
    const target = s.target ?? 60;
    if (t) t.textContent = `${target}% → ${pct >= target ? '달성 🎉' : '아직 미달'}`;
  });
}

// 모의고사: 영역별·유형별 결과와 목표 비교
function examReport(pct) {
  const byType = new Map(), byGroup = new Map();
  for (const { item, qi } of session.queue) {
    const ok = session.results[item.id]?.[qi] === true;
    for (const [m, key] of [[byType, item.type], [byGroup, groupOf(item.type)]]) {
      const v = m.get(key) || { n: 0, ok: 0 }; v.n++; if (ok) v.ok++; m.set(key, v);
    }
  }
  const row = (label, v) => h('div', { class: 'bar' },
    h('span', { class: 'n' }, label),
    h('div', { class: 'track' }, h('i', { style: `width:${Math.round((v.ok / v.n) * 100)}%` })),
    h('span', { class: 'sub' }, `${Math.round((v.ok / v.n) * 100)}% (${v.ok}/${v.n})`));
  return h('div', { class: 'card' },
    h('h3', {}, '목표와 비교'),
    h('div', { class: 'sub' }, h('span', {}, '목표 정답률 '), h('b', { id: 'examTarget' }, '…'),
      ' · 이번 ', h('b', {}, `${pct}%`), ' (목표는 설정에서 바꿀 수 있어요)'),
    h('h3', {}, '영역별'),
    h('div', { class: 'bars' }, ...EXAM_GROUPS.filter(g => byGroup.has(g.key)).map(g => row(g.label, byGroup.get(g.key)))),
    h('h3', {}, '유형별'),
    h('div', { class: 'bars' }, ...[...byType].sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).map(([t, v]) => row(TYPES[t] || t, v))));
}
