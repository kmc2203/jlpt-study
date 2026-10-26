// 문제 풀이 화면: 시작 화면 → 세션(문제 → 해설 → 다음) → 결과
import { $, h, fmt, sanitizeHtml, todayStr, toast, speak } from './util.js';
import { load, commit } from './storage.js';
import { TYPES, loadData, balancedPick, dailyAvailable, extraAvailable, wrongAvailable, unreleasedCount } from './data.js';
import { addWord, findWord } from './words.js';
import { openWordModal } from './vocab.js';

let session = null; // { items, queue:[{item, qi}], pos, mode, results:{id:[bool]}, answered }

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'];

/* ───────── 시작 화면 ───────── */
export async function renderQuizHome(view) {
  session = null;
  view.replaceChildren(h('div', { class: 'empty' }, '불러오는 중…'));
  let d;
  try { d = await loadData(); }
  catch (e) { view.replaceChildren(h('div', { class: 'card' }, '문제 데이터를 불러오지 못했어요. ', h('div', { class: 'sub' }, String(e.message)))); return; }
  const progress = await load('progress');
  const today = todayStr();
  const daily = dailyAvailable(d, progress, today);
  const wrong = wrongAvailable(d, progress);

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

  view.replaceChildren(
    h('div', { class: 'card' },
      h('h2', {}, '오늘의 문제'),
      h('div', { class: 'sub' }, daily.length ? `풀지 않은 문제 ${daily.length}개 (매일 아침 새 문제가 추가돼요)` : '오늘 분량은 모두 풀었어요 👏'),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', disabled: !daily.length, onclick: () => start(daily, 'daily') }, '시작'))),
    h('div', { class: 'card' },
      h('h2', {}, '더 풀기'),
      h('div', { class: 'sub' }, `시간이 많을 때 아직 공개되지 않은 새 문제를 미리 풀어요. (풀 남은 문제: ${unreleasedCount(d)}개)`),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('div', { class: 'grow' }, typeSel), h('div', {}, countSel)),
      extraInfo, h('div', { style: 'height:8px' }), extraBtn),
    h('div', { class: 'card' },
      h('h2', {}, '틀린 문제 복습'),
      h('div', { class: 'sub' }, wrong.length ? `다시 풀어볼 문제 ${wrong.length}개` : '틀린 문제가 아직 없어요'),
      h('div', { class: 'row end' }, h('button', { class: 'btn', disabled: !wrong.length, onclick: () => start(wrong, 'review') }, '복습 시작'))));
  refreshExtra();
}

/* ───────── 세션 ───────── */
function start(items, mode) {
  if (!items.length) return toast('풀 문제가 없어요');
  const queue = items.flatMap(item => item.questions.map((_, qi) => ({ item, qi })));
  session = { items, queue, pos: 0, mode, results: {}, answered: false };
  renderQuestion();
}

const view = () => $('#view');

function slotify(html) {
  return html.replace(/＿{2,}/g, '<span class="slot">　　</span>').replace(/★/g, '<span class="slot star">★</span>');
}

function renderQuestion() {
  const { item, qi } = session.queue[session.pos];
  const q = item.questions[qi];
  session.answered = false;
  const pct = Math.round((session.pos / session.queue.length) * 100);

  const choiceBtns = q.choices.map((c, i) => h('button', {
    class: 'choice jp', onclick: () => choose(i, choiceBtns),
  }, h('b', {}, String(i + 1)), h('span', { html: fmt(c) })));

  const passage = item.passage_html
    ? h('div', { class: 'passage', html: sanitizeHtml(item.passage_html) })
    : item.passage ? h('div', { class: 'passage jp', html: fmt(item.passage) }) : null;

  view().replaceChildren(
    h('div', { class: 'row between' },
      h('span', { class: 'tag' }, TYPES[item.type] || item.type),
      h('span', { class: 'row' },
        h('span', { class: 'sub' }, `${session.pos + 1} / ${session.queue.length}`),
        h('button', { class: 'btn small', onclick: () => renderQuizHome(view()) }, '종료'))),
    h('div', { class: 'progress' }, h('i', { style: `width:${pct}%` })),
    h('div', { class: 'card' },
      item.instruction ? h('div', { class: 'inst' }, item.instruction) : null,
      passage,
      q.stem ? h('div', { class: 'stem jp', html: slotify(fmt(q.stem)) }) : null,
      ...choiceBtns),
    h('div', { id: 'exp' }),
    h('div', { class: 'actions', id: 'actions' },
      h('button', { class: 'btn', onclick: () => openWordModal({ source: `quiz:${item.id}` }) }, '✏️ 단어 메모')));
  window.scrollTo(0, 0);
}

async function choose(i, btns) {
  if (session.answered) return;
  session.answered = true;
  const { item, qi } = session.queue[session.pos];
  const q = item.questions[qi];
  const ok = i === q.answer;
  btns.forEach((b, k) => {
    b.disabled = true;
    if (k === q.answer) b.classList.add('correct');
    else if (k === i) b.classList.add('wrong');
  });
  (session.results[item.id] ||= [])[qi] = ok;
  await recordAnswer(item, qi, ok);

  $('#exp').replaceChildren(buildExplanation(item, q, ok, i));
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
  const day = todayStr();
  p.days[day] = (p.days[day] || 0) + 1;
  // 아이템의 모든 문항을 마치면 '푼 문제'로 기록 (다시 출제되지 않음)
  const res = session.results[item.id] || [];
  const complete = item.questions.every((_, k) => typeof res[k] === 'boolean');
  if (complete) {
    p.done[item.id] = { at: Date.now(), res: [...res] };
    if (res.every(Boolean)) delete p.wrong[item.id];
    else p.wrong[item.id] = true;
  }
  await commit('progress');
}

function next() {
  if (session.pos >= session.queue.length - 1) return renderResult();
  session.pos += 1;
  renderQuestion();
}

/* ───────── 해설 ───────── */
function buildExplanation(item, q, ok, picked) {
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
  if (e.translation) card.append(h('h3', {}, '번역'), h('div', {}, e.translation));
  if (e.point) card.append(h('h3', {}, '포인트'), h('div', { html: fmt(e.point) }));
  if (Array.isArray(e.choices) && e.choices.length) {
    card.append(h('h3', {}, '선택지 해설'),
      h('ol', { style: 'list-style:none;padding-left:0' },
        ...e.choices.map((t, k) => h('li', {}, h('b', {}, CIRCLED[k] + ' '), h('span', { html: fmt(t) })))));
  }
  if (Array.isArray(e.words) && e.words.length) {
    card.append(h('h3', {}, '주요 단어 (＋ 를 누르면 단어 오답노트에 저장)'),
      h('div', { class: 'words' }, ...e.words.map(w => wordRow(w, item.id))));
  }
  if (item.passage_translation) {
    card.append(h('details', {}, h('summary', {}, '지문 번역 보기'), h('div', { style: 'margin-top:6px' }, item.passage_translation)));
  }
  return card;
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

/* ───────── 결과 ───────── */
function renderResult() {
  const all = session.queue.length;
  const okN = session.queue.filter(({ item, qi }) => session.results[item.id]?.[qi]).length;
  const wrongItems = session.items.filter(it => session.results[it.id]?.some(r => r === false));
  const mode = session.mode;
  view().replaceChildren(
    h('div', { class: 'card' },
      h('h2', {}, '수고했어요!'),
      h('div', { class: 'big' }, `${okN} / ${all}`),
      h('div', { class: 'sub' }, `정답률 ${Math.round((okN / all) * 100)}%`),
      wrongItems.length ? h('div', { class: 'notice', style: 'margin-top:10px' }, `틀린 문제 ${wrongItems.length}개는 '틀린 문제 복습'에 저장됐어요.`) : null),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => renderQuizHome(view()) }, '문제 홈'),
      wrongItems.length && mode !== 'review'
        ? h('button', { class: 'btn primary', onclick: () => start(wrongItems, 'review') }, '틀린 문제 바로 복습')
        : h('button', { class: 'btn primary', onclick: () => renderQuizHome(view()) }, '계속 풀기')));
}
