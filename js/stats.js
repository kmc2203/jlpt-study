// 통계 대시보드: 어디가 약한지 한눈에 보고, 바로 집중 연습으로 이어 준다.
import { h, todayStr, toast, openModal } from './util.js';
import { load } from './storage.js';
import { TYPES, LEVELS, levelOf, loadData, srsDue } from './data.js';
import { allWords } from './words.js';
import { requestDrill } from './quiz.js';

const MIN_N = 5;       // 이보다 적게 풀었으면 '표본 부족'
const WEAK = 60;       // 정답률 %
const STRONG = 80;

const pctOf = (ok, n) => (n ? Math.round((ok / n) * 100) : null);
const grade = (pct, n) => (n < MIN_N ? 'few' : pct < WEAK ? 'weak' : pct >= STRONG ? 'strong' : 'mid');
const GRADE_TEXT = { weak: '보강 필요', mid: '보통', strong: '강점', few: '표본 부족' };

// 통계 계산(화면과 '요약 복사'가 같은 숫자를 쓰도록 분리)
export function computeStats(progress, data, words) {
  const types = Object.keys(TYPES).map(t => {
    const s = progress.stats[t] || { n: 0, ok: 0 };
    const rec = progress.recent?.[t] || [];
    const recentPct = rec.length >= MIN_N ? pctOf(rec.reduce((a, b) => a + b, 0), rec.length) : null;
    // 요즘 실력을 우선하고, 최근 기록이 아직 적으면 전체 기록으로
    const pct = recentPct ?? pctOf(s.ok, s.n);
    return { type: t, label: TYPES[t], n: s.n, ok: s.ok, allPct: pctOf(s.ok, s.n), recentPct, recentN: rec.length, pct, grade: grade(pct, s.n) };
  }).filter(x => x.n > 0);

  const levels = Object.fromEntries(LEVELS.map(l => [l, { n: 0, ok: 0 }]));
  const wrongByType = {};
  if (data) {
    for (const [id, rec] of Object.entries(progress.done || {})) {
      const it = data.byId.get(id); if (!it) continue;
      for (const r of rec.res || []) {
        if (typeof r !== 'boolean') continue;
        const l = levels[levelOf(it)]; l.n += 1; if (r) l.ok += 1;
      }
    }
    for (const id of Object.keys(progress.wrong || {})) {
      const it = data.byId.get(id); if (it) wrongByType[it.type] = (wrongByType[it.type] || 0) + 1;
    }
  }

  // 문제를 풀다가 저장한 단어가 많이 나오는 유형 = 어휘 때문에 막히는 유형
  const wordsByType = {};
  for (const w of words) {
    const m = /^quiz:(.+)$/.exec(w.source || '');
    const it = m && data?.byId.get(m[1]);
    if (it) wordsByType[it.type] = (wordsByType[it.type] || 0) + 1;
  }

  const days = [];
  const d = new Date();
  for (let i = 13; i >= 0; i--) {
    const x = new Date(d); x.setDate(d.getDate() - i);
    days.push({ date: todayStr(x), n: progress.days[todayStr(x)] || 0 });
  }
  const total = types.reduce((a, t) => a + t.n, 0);
  const totalOk = types.reduce((a, t) => a + t.ok, 0);
  const weakest = types.filter(t => t.n >= 3 && t.pct != null && t.pct < STRONG).sort((a, b) => a.pct - b.pct).slice(0, 3);
  return { types, levels, wrongByType, wordsByType, days, total, totalOk, weakest };
}

function barRow(label, pct, n, ok, cls, extra) {
  return h('div', { class: 'bar ' + cls },
    h('span', { class: 'n' }, label),
    h('div', { class: 'track' }, h('i', { style: `width:${pct ?? 0}%` })),
    h('span', { class: 'sub' }, pct == null ? '기록 없음' : `${pct}% (${ok}/${n})`), extra || null);
}

export async function renderStats(view) {
  const progress = await load('progress');
  const words = await allWords();
  let data = null;
  try { data = await loadData(); } catch { /* 오프라인이면 문제 정보 없이 */ }
  const st = computeStats(progress, data, words);

  if (!st.total) {
    view.replaceChildren(h('div', { class: 'card' }, h('h2', {}, '통계'),
      h('div', { class: 'sub' }, '아직 푼 문제가 없어요. 문제를 몇 개 풀면 어떤 유형이 약한지 여기에 나타나요.'),
      h('a', { class: 'btn primary', href: '#/quiz', style: 'text-decoration:none;margin-top:8px;display:inline-block' }, '문제 풀기')));
    return;
  }

  const overall = pctOf(st.totalOk, st.total);
  const maxDay = Math.max(1, ...st.days.map(x => x.n));
  // 약한 순서. 표본이 부족한 유형은 신뢰하기 어려우니 맨 아래로
  const sorted = [...st.types].sort((a, b) => (a.grade === 'few') - (b.grade === 'few') || (a.pct ?? 101) - (b.pct ?? 101));

  const prescription = st.weakest.length
    ? st.weakest.map(t => h('div', { class: 'rx' },
        h('div', {},
          h('b', {}, t.label), ` — 정답률 ${t.pct}%`,
          h('div', { class: 'sub' }, [
            t.recentPct != null ? `최근 ${t.recentN}문항 기준` : `전체 ${t.n}문항 기준`,
            st.wrongByType[t.type] ? `틀린 문제 ${st.wrongByType[t.type]}개 복습 대기` : null,
            st.wordsByType[t.type] ? `이 유형에서 저장한 단어 ${st.wordsByType[t.type]}개` : null,
          ].filter(Boolean).join(' · '))),
        h('button', { class: 'btn small primary', onclick: () => { requestDrill(t.type); window.location.hash = '#/quiz'; } }, '집중 풀기')))
    : [h('div', { class: 'sub' }, st.types.some(t => t.n >= 3) ? '모든 유형이 80% 이상이에요. 이대로 꾸준히 해요! 👏' : '유형마다 3문항 이상 풀면 보강할 곳을 알려 드릴게요.')];

  view.replaceChildren(
    h('div', { class: 'row', style: 'margin-bottom:12px' },
      h('div', { class: 'card grow', style: 'text-align:center;margin:0' }, h('div', { class: 'big' }, `${overall}%`), h('div', { class: 'sub' }, `전체 정답률 (${st.totalOk}/${st.total})`)),
      h('div', { class: 'card grow', style: 'text-align:center;margin:0' }, h('div', { class: 'big' }, String(Object.keys(progress.wrong).length)), h('div', { class: 'sub' }, '복습 대기 문제'))),
    h('div', { class: 'card' },
      h('h2', {}, '지금 보강할 곳'),
      h('div', { class: 'sub' }, '정답률이 낮은 유형 순이에요. 최근 20문항이 있으면 그 기록을 우선해요.'),
      ...prescription),
    h('div', { class: 'card' },
      h('h2', {}, '유형별 정답률'),
      h('div', { class: 'sub' }, `약한 순서 · ${WEAK}% 미만 보강 필요, ${STRONG}% 이상 강점, ${MIN_N}문항 미만은 표본 부족`),
      h('div', { class: 'bars' }, ...sorted.map(t => barRow(t.label, t.pct, t.n, t.ok, 'g-' + t.grade,
        h('span', { class: 'chip g-' + t.grade }, GRADE_TEXT[t.grade]))))),
    h('div', { class: 'card' },
      h('h2', {}, '급수별 정답률'),
      h('div', { class: 'sub' }, '푼 문제의 가장 최근 결과 기준이에요. (급수는 문제를 만들 때 붙인 추정치)'),
      h('div', { class: 'bars' }, ...LEVELS.filter(l => st.levels[l].n).map(l => {
        const { n, ok } = st.levels[l]; const p = pctOf(ok, n);
        return barRow(l, p, n, ok, 'g-' + grade(p, n));
      })),
      LEVELS.every(l => !st.levels[l].n) ? h('div', { class: 'sub' }, '문제 데이터를 불러오면 표시돼요.') : null),
    h('div', { class: 'card' },
      h('h2', {}, '최근 14일 학습량'),
      h('div', { class: 'daybars' }, ...st.days.map(x => h('div', { class: 'daycol', title: `${x.date}: ${x.n}문항` },
        h('i', { style: `height:${Math.round((x.n / maxDay) * 100)}%` }), h('span', {}, x.date.slice(8)))))),
    h('div', { class: 'card' },
      h('h2', {}, 'Claude에게 보여주기'),
      h('div', { class: 'sub' }, '학습 요약(유형·급수별 정답률, 틀린 문제, 저장한 단어)을 복사해서 채팅에 붙여넣으면 맞춤 학습 방향을 제안받을 수 있어요. 이름·계정 정보는 들어 있지 않아요.'),
      h('button', { class: 'btn block', style: 'margin-top:8px', onclick: () => shareSummary(st, words, data) }, '분석용 요약 복사')));
}

export function buildSummary(st, words, data, extra = {}) {
  return {
    app: 'jlpt-study-summary', version: 1, date: todayStr(),
    total: { n: st.total, ok: st.totalOk, pct: pctOf(st.totalOk, st.total) },
    byType: st.types.map(t => ({ type: t.type, label: t.label, n: t.n, ok: t.ok, pct: t.allPct, recentPct: t.recentPct, grade: GRADE_TEXT[t.grade] })),
    byLevel: Object.fromEntries(LEVELS.filter(l => st.levels[l].n).map(l => [l, { ...st.levels[l], pct: pctOf(st.levels[l].ok, st.levels[l].n) }])),
    wrongByType: st.wrongByType, wordsSavedWhileSolvingByType: st.wordsByType,
    last14Days: st.days,
    words: words.slice(0, 200).map(w => ({ word: w.word, reading: w.reading, meaning: w.meaning, source: (w.source || '').replace(/^quiz:.*/, 'quiz'), miss: w.miss || 0 })),
    poolSize: data ? data.items.length : null,
    srsDueToday: extra.srsDue ?? null,
    reports: (extra.reports || []).slice(-30).map(r => ({ id: r.id, q: r.qi + 1, reason: r.reason, memo: r.memo })),
  };
}

async function shareSummary(st, words, data) {
  const progress = await load('progress');
  const extra = { srsDue: data ? srsDue(data, progress, todayStr()).length : null, reports: await load('reports') };
  const text = JSON.stringify(buildSummary(st, words, data, extra), null, 1);
  try { await navigator.clipboard.writeText(text); toast('복사했어요. 채팅에 붙여넣어 주세요'); return; } catch { /* 아래 수동 복사 */ }
  const ta = h('textarea', { readonly: true, rows: '10', style: 'width:100%;font-size:12px' }, text);
  openModal('분석용 요약', h('div', {}, h('div', { class: 'sub' }, '아래 내용을 길게 눌러 전체 선택 → 복사하세요.'), ta), [{ label: '닫기' }]);
  ta.focus(); ta.select();
}
