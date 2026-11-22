// 실전모의고사: 가져오기(이 기기에만 저장) · 연습 모드(시간 제한 없음, 이어 풀기) · 실전 모드(시간 제한, 문항 이동, 임시저장, 단어 선택 불가)
//   파일 형식: { app:'jlpt-study-mock', version:1, id, no, title, minutes, items:[ 일반 문제 항목과 같은 형식 ] }
//   모의고사 문제는 공개 저장소에 두지 않고, 사용자가 가져온 JSON 을 브라우저 저장소(mocks)에만 보관한다.
import { h, fmt, sanitizeHtml, toast, openModal, todayStr } from './util.js';
import { load, commit } from './storage.js';
import { TYPES, EXAM_GROUPS, groupOf, levelOf, loadData } from './data.js';
import { startSession, recordAnswer, fmtClock, slotify } from './quiz.js';

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'];
let tick = null;
const stopTick = () => { clearInterval(tick); tick = null; };
const rootView = () => document.getElementById('view');

/* ───────── 가져오기 ───────── */
export function validateMock(o) {
  if (!o || o.app !== 'jlpt-study-mock' || !o.id || !Array.isArray(o.items) || !o.items.length) throw new Error('모의고사 파일이 아니에요');
  const ids = new Set();
  for (const it of o.items) {
    if (!it.id || ids.has(it.id) || !Array.isArray(it.questions) || !it.questions.length) throw new Error(`문제 형식 오류: ${it.id || '?'}`);
    ids.add(it.id);
    for (const q of it.questions) {
      if (!Array.isArray(q.choices) || q.choices.length < 2 || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) throw new Error(`문항 오류: ${it.id}`);
    }
  }
  return o;
}

export async function importMock(text) {
  const o = validateMock(JSON.parse(text));
  const mocks = await load('mocks');
  const runs = await load('mockruns');
  const replaced = !!mocks[o.id];
  mocks[o.id] = o;
  await commit('mocks');
  if (replaced) delete runs[o.id]; // 문제가 바뀌었을 수 있으니 진행 중이던 저장은 비운다
  await commit('mockruns');
  await loadData(true);
  return { mock: o, replaced };
}

const flatten = m => m.items.flatMap(item => item.questions.map((q, qi) => ({ item, qi, q, no: q.no ?? 0 })));
const nQuestions = m => m.items.reduce((a, i) => a + i.questions.length, 0);
const getRun = async id => { const r = await load('mockruns'); return (r[id] ||= {}); };

/* ───────── 연습 모드 저장 (quiz.js 에서 호출) ───────── */
export async function saveMockPractice(id, results) {
  const run = await getRun(id);
  run.practice = { results: JSON.parse(JSON.stringify(results)), at: Date.now() };
  await commit('mockruns');
}
export async function finishMockPractice(id, ok, total) {
  const run = await getRun(id);
  delete run.practice;
  (run.last ||= {}).practice = { ok, total, at: Date.now() };
  await commit('mockruns');
}

/* ───────── 문제 탭의 카드 ───────── */
export async function mockHomeCard(d, rerender) {
  const mocks = await load('mocks');
  const list = Object.values(mocks).sort((a, b) => (a.no || 0) - (b.no || 0));
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'mockFile' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0]; if (!f) return;
    try {
      const { mock, replaced } = await importMock(await f.text());
      toast(`${mock.title} ${replaced ? '다시 가져왔어요' : '가져왔어요'}`);
      rerender();
    } catch (e) { toast('가져오지 못했어요: ' + e.message); }
  });
  const runs = await load('mockruns');
  return h('div', { class: 'card', id: 'mockCard' },
    h('h2', {}, '실전모의고사'),
    list.length
      ? h('div', { class: 'mocklist' }, ...list.map(m => {
        const r = runs[m.id] || {};
        const bits = [r.exam ? '실전 임시저장 있음' : null, r.practice ? '연습 이어 풀기 가능' : null,
          r.last?.exam ? `실전 ${r.last.exam.ok}/${r.last.exam.total}` : null].filter(Boolean);
        return h('button', { class: 'mockitem', onclick: () => renderMockPanel(m.id) },
          h('b', {}, `${m.no || ''}회차`), h('span', { class: 'sub' }, `${nQuestions(m)}문항 · ${m.minutes}분` + (bits.length ? ' · ' + bits.join(' · ') : '')));
      }))
      : h('div', { class: 'sub' }, '아직 가져온 모의고사가 없어요. 모의고사 파일(.json)을 가져오면 여기에 나타나요. 문제는 이 기기에만 저장돼요.'),
    h('div', { class: 'row end', style: 'margin-top:8px' }, fileIn,
      h('button', { class: 'btn small', onclick: () => fileIn.click() }, list.length ? '파일 추가·다시 가져오기' : '모의고사 파일 가져오기')));
}

/* ───────── 회차 화면: 연습 / 실전 ───────── */
async function renderMockPanel(id) {
  stopTick(); delete document.body.dataset.nosel;
  const mocks = await load('mocks');
  const m = mocks[id]; if (!m) return;
  const run = await getRun(id);
  const total = nQuestions(m);
  const pDone = run.practice ? flatten(m).filter(x => typeof run.practice.results?.[x.item.id]?.[x.qi] === 'boolean').length : 0;
  const lastLine = k => run.last?.[k] ? `지난 결과 ${run.last[k].ok} / ${run.last[k].total} (${Math.round(run.last[k].ok / run.last[k].total * 100)}%) · ${new Date(run.last[k].at).toLocaleDateString('ko-KR')}` : '';

  const practiceStart = fresh => {
    if (fresh) { delete run.practice; commit('mockruns'); }
    startSession(m.items, 'mock', { mock: { id, title: m.title }, resume: fresh ? null : run.practice });
  };
  const view = rootView();
  view.replaceChildren(
    h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, m.title),
      h('button', { class: 'btn small', onclick: () => import('./quiz.js').then(q => q.renderQuizHome(view)) }, '← 문제 홈')),
    h('div', { class: 'card' },
      h('h3', {}, '연습 모드'),
      h('div', { class: 'sub' }, '시간 제한 없이 한 문제씩 풀고 바로 해설을 봐요. 글자를 길게 눌러 단어 오답노트·한자 카드를 쓸 수 있고, 풀던 곳에서 이어 풀 수 있어요(자동 임시저장).'),
      lastLine('practice') ? h('div', { class: 'sub' }, lastLine('practice')) : null,
      h('div', { class: 'row end', style: 'margin-top:8px' },
        run.practice ? h('button', { class: 'btn', onclick: () => practiceStart(true) }, '처음부터') : null,
        h('button', { class: 'btn primary', onclick: () => practiceStart(false) }, run.practice ? `이어 풀기 (${pDone}/${total})` : '연습 시작'))),
    h('div', { class: 'card' },
      h('h3', {}, '실전 모드'),
      h('div', { class: 'sub' }, `${m.minutes}분 제한. 문항을 오가며 풀고 마지막에 제출해요. 풀이 중에는 해설과 단어 선택이 막혀요. 임시저장하면 남은 시간이 저장돼요.`),
      lastLine('exam') ? h('div', { class: 'sub' }, lastLine('exam')) : null,
      h('div', { class: 'row end', style: 'margin-top:8px' },
        run.exam ? h('button', { class: 'btn', onclick: async () => { if (!confirm('임시저장한 풀이를 지우고 처음부터 시작할까요?')) return; delete run.exam; await commit('mockruns'); startExam(id, null); } }, '처음부터') : null,
        h('button', { class: 'btn primary', onclick: () => startExam(id, run.exam || null) },
          run.exam ? `이어 풀기 (남은 ${fmtClock(run.exam.left)})` : '실전 시작'))));
}

/* ───────── 실전 모드 ───────── */
async function startExam(id, saved) {
  stopTick();
  const mocks = await load('mocks'); const m = mocks[id];
  const run = await getRun(id);
  const qs = flatten(m);
  const S = saved ? { ...saved, answers: { ...saved.answers } }
    : { answers: {}, cur: 0, left: (m.minutes || 105) * 60000, marks: {} };
  S.marks ||= {};
  let deadline = Date.now() + S.left;
  document.body.dataset.nosel = '1'; // 실전: 글자 선택(단어 오답노트·한자 카드) 막기
  window.getSelection?.().removeAllRanges();

  const persist = async () => {
    run.exam = { answers: S.answers, cur: S.cur, marks: S.marks, left: Math.max(1000, deadline - Date.now()), at: Date.now() };
    await commit('mockruns');
  };
  const leave = async () => { stopTick(); await persist(); delete document.body.dataset.nosel; toast('임시저장했어요 — 남은 시간이 저장됐어요'); renderMockPanel(id); };

  const submit = async (timeUp = false) => {
    const blank = qs.filter(x => S.answers[x.no] == null).length;
    if (!timeUp && !confirm(blank ? `아직 안 푼 문제가 ${blank}개예요. 안 푼 문제는 오답으로 처리돼요. 제출할까요?` : '제출할까요?')) return;
    stopTick();
    const usedMs = (m.minutes || 105) * 60000 - Math.max(0, deadline - Date.now());
    const results = {};
    let ok = 0;
    for (const x of qs) {
      const right = S.answers[x.no] === x.q.answer;
      (results[x.item.id] ||= [])[x.qi] = right;
      if (right) ok++;
      await recordAnswer(x.item, x.qi, right, results); // 틀린 문제·간격 복습·통계에 반영
    }
    delete run.exam;
    (run.last ||= {}).exam = { ok, total: qs.length, at: Date.now(), usedSec: Math.round(usedMs / 1000) };
    await commit('mockruns');
    delete document.body.dataset.nosel;
    renderExamResult(m, qs, S.answers, results, usedMs, timeUp);
  };

  const paint = () => {
    const x = qs[S.cur]; const { item, q } = x;
    const answered = qs.filter(y => S.answers[y.no] != null).length;
    const choices = q.choices.map((c, i) => h('div', {
      class: 'choice jp' + (S.answers[x.no] === i ? ' picked' : ''), role: 'button', tabindex: '0',
      onclick: () => { S.answers[x.no] = S.answers[x.no] === i ? undefined : i; if (S.answers[x.no] === undefined) delete S.answers[x.no]; persist(); paint(); },
    }, h('b', {}, String(i + 1)), h('span', { html: fmt(c) })));
    const passage = item.passage_html ? h('div', { class: 'passage', html: sanitizeHtml(item.passage_html) })
      : item.passage ? h('div', { class: 'passage jp', html: fmt(item.passage) }) : null;
    const grid = h('div', { class: 'qgrid' }, ...qs.map((y, k) => h('button', {
      class: 'qcell' + (S.answers[y.no] != null ? ' done' : '') + (k === S.cur ? ' cur' : '') + (S.marks[y.no] ? ' mark' : ''),
      onclick: () => { S.cur = k; persist(); paint(); },
    }, String(y.no))));
    rootView().replaceChildren(h('div', { class: 'mockexam' },
      h('div', { class: 'row between' },
        h('span', { class: 'row' }, h('span', { class: 'tag' }, '실전'), h('span', { class: 'timer', id: 'mockTimer' }, fmtClock(deadline - Date.now()))),
        h('span', { class: 'row' }, h('span', { class: 'sub' }, `푼 문제 ${answered}/${qs.length}`),
          h('button', { class: 'btn small', onclick: leave }, '임시저장 후 종료'))),
      h('div', { class: 'progress' }, h('i', { style: `width:${Math.round(answered / qs.length * 100)}%` })),
      h('div', { class: 'card' },
        h('div', { class: 'row between' }, h('b', {}, `問 ${x.no}`),
          h('button', { class: 'btn small' + (S.marks[x.no] ? ' primary' : ''), onclick: () => { S.marks[x.no] = !S.marks[x.no]; persist(); paint(); } }, S.marks[x.no] ? '★ 표시함' : '☆ 나중에 볼 문제')),
        item.instruction ? h('div', { class: 'inst' }, item.instruction) : null,
        passage,
        q.stem ? h('div', { class: 'stem jp', html: slotify(fmt(q.stem)) }) : null,
        ...choices),
      h('div', { class: 'row', style: 'gap:8px;margin:8px 0' },
        h('button', { class: 'btn grow', disabled: S.cur === 0, onclick: () => { S.cur--; persist(); paint(); window.scrollTo(0, 0); } }, '← 이전'),
        h('button', { class: 'btn grow', disabled: S.cur === qs.length - 1, onclick: () => { S.cur++; persist(); paint(); window.scrollTo(0, 0); } }, '다음 →')),
      h('details', { class: 'card' }, h('summary', {}, '문항 이동 (초록 = 푼 문제, ★ = 표시)'), grid),
      h('div', { class: 'row end', style: 'margin:8px 0 80px' }, h('button', { class: 'btn primary', onclick: () => submit(false) }, '제출하고 채점'))));
    window.scrollTo(0, 0);
  };

  paint();
  let n = 0;
  tick = setInterval(() => {
    const el = document.getElementById('mockTimer');
    if (!el) { stopTick(); persist(); delete document.body.dataset.nosel; return; } // 다른 화면으로 나가면 그 시점 남은 시간으로 임시저장
    const left = deadline - Date.now();
    el.textContent = fmtClock(left);
    if (left <= 60000) el.classList.add('low');
    if (++n % 10 === 0) persist();
    if (left <= 0) { toast('시간 종료! 자동으로 제출해요'); submit(true); }
  }, 1000);
}

/* ───────── 실전 결과 ───────── */
function renderExamResult(m, qs, answers, results, usedMs, timeUp) {
  const okN = qs.filter(x => results[x.item.id][x.qi]).length;
  const byGroup = new Map(), byType = new Map();
  for (const x of qs) {
    const right = results[x.item.id][x.qi];
    for (const [mp, key] of [[byGroup, groupOf(x.item.type)], [byType, x.item.type]]) {
      const v = mp.get(key) || { n: 0, ok: 0 }; v.n++; if (right) v.ok++; mp.set(key, v);
    }
  }
  const row = (label, v) => h('div', { class: 'bar' }, h('span', { class: 'n' }, label),
    h('div', { class: 'track' }, h('i', { style: `width:${Math.round(v.ok / v.n * 100)}%` })),
    h('span', { class: 'sub' }, `${Math.round(v.ok / v.n * 100)}% (${v.ok}/${v.n})`));
  const wrongItems = m.items.filter(it => it.questions.some((_, k) => results[it.id][k] !== true));
  const blank = qs.filter(x => answers[x.no] == null).length;
  const view = rootView();
  view.replaceChildren(
    h('div', { class: 'card' },
      h('h2', {}, `${m.title} 실전 결과`),
      h('div', { class: 'big' }, `${okN} / ${qs.length}`),
      h('div', { class: 'sub' }, `정답률 ${Math.round(okN / qs.length * 100)}% · 걸린 시간 ${fmtClock(usedMs)}` + (timeUp ? ' (시간 종료)' : '') + (blank ? ` · 안 푼 문제 ${blank}개` : '')),
      h('div', { class: 'notice', style: 'margin-top:10px' }, '틀린 문제·안 푼 문제는 「틀린 문제 복습」과 간격 복습에 들어갔고, 유형별 통계와 문법 기록에도 반영됐어요.')),
    h('div', { class: 'card' }, h('h3', {}, '영역별'),
      h('div', { class: 'bars' }, ...EXAM_GROUPS.filter(g => byGroup.has(g.key)).map(g => row(g.label, byGroup.get(g.key)))),
      h('h3', {}, '유형별'),
      h('div', { class: 'bars' }, ...[...byType].sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).map(([t, v]) => row(TYPES[t] || t, v)))),
    h('div', { class: 'card' }, h('h3', {}, '문항별 결과'),
      h('div', { class: 'qgrid' }, ...qs.map(x => h('span', { class: 'qcell ' + (results[x.item.id][x.qi] ? 'ok' : 'ng') }, String(x.no))))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => renderMockPanel(m.id) }, `${m.no || ''}회차 화면`),
      wrongItems.length ? h('button', { class: 'btn primary', onclick: () => startSession(wrongItems, 'review') }, '틀린 문제 해설 보며 복습') : h('button', { class: 'btn primary', onclick: () => renderMockPanel(m.id) }, '확인')));
  window.scrollTo(0, 0);
}
