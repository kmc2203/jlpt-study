// 문법 정리: 문제를 풀고 난 해설에서 그 문제에 나온 문법을 눌러 자세히 본다.
//   data/grammar.json 의 항목 { id, form, keys[], level, mean, connect, note, similar[{f,d}], ex[{ja,ko}] }
//   항목은 새 문제가 만들어질 때마다 함께 늘어난다 (docs/GENERATE_PROMPT.md).
//   문제와 항목은 keys 와 문제 글자를 비교해 자동으로 이어진다 (scripts/validate.py 도 같은 규칙).
import { h, plain, fmt, openModal } from './util.js';
import { linkKanji } from './kanji.js';

let cache;
export async function loadGrammar() {
  if (cache) return cache;
  try {
    const r = await fetch('data/grammar.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    cache = (await r.json()).entries || [];
  } catch (e) { console.warn('문법 데이터를 불러오지 못했어요', e); cache = []; }
  return cache;
}

const norm = s => plain(s).replace(/[～〜~「」『』\s　、。,.]/g, '');
const TYPES = new Set(['grammar', 'text_grammar', 'sentence_order']);

// 문제 하나에 이어지는 문법: { main: [항목], compare: [항목] }
//  main    = 정답 표현 / 완성 문장 속에 들어 있는 표현 / 배열 조각
//  compare = 오답 선택지가 가리키는 표현 (헷갈리기 쉬운 것)
export function matchGrammar(entries, item, q) {
  const res = { main: [], compare: [] };
  if (!TYPES.has(item.type) || !Array.isArray(q.choices)) return res;
  const choices = q.choices.map(norm);
  const correct = item.type === 'sentence_order' ? null : choices[q.answer];
  const full = norm(q.full || '');
  for (const e of entries) {
    const keys = e.keys.map(norm).filter(Boolean);
    const hitMain = keys.some(k =>
      (correct != null && k === correct) ||
      (k.length >= 4 && full.includes(k)) ||
      (k.includes('…') && new RegExp(k.split('…').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*?')).test(full)) ||
      (item.type === 'sentence_order' && choices.includes(k)));
    if (hitMain) { res.main.push(e); continue; }
    if (item.type !== 'sentence_order' && keys.some(k => choices.some((c, i) => i !== q.answer && c === k))) res.compare.push(e);
  }
  return res;
}

export function grammarSection(entries, item, q) {
  const { main, compare } = matchGrammar(entries, item, q);
  if (!main.length && !compare.length) return null;
  const chip = (e, cls) => h('button', { class: 'gchip ' + cls, type: 'button', onclick: () => openGrammar(e) }, e.form);
  const box = h('div', {}, h('h3', {}, '문법 정리 (눌러서 자세히)'),
    h('div', { class: 'gchips' }, ...main.map(e => chip(e, 'main'))));
  if (compare.length) {
    box.append(h('div', { class: 'sub', style: 'margin-top:6px' }, '헷갈린 선택지'),
      h('div', { class: 'gchips' }, ...compare.map(e => chip(e, ''))));
  }
  return box;
}

export function openGrammar(e, buttons = []) {
  const ex = e.ex.map(x => {
    const ko = h('div', { class: 'sub', hidden: true }, x.ko);
    const ja = h('div', { class: 'jp', html: fmt(x.ja) });
    linkKanji(ja);
    return h('li', {}, ja, ko,
      h('button', { class: 'btn small', type: 'button', style: 'margin-top:4px', onclick: ev => {
        ko.hidden = !ko.hidden; ev.currentTarget.textContent = ko.hidden ? '해석 보기' : '해석 숨기기';
      } }, '해석 보기'));
  });
  const body = h('div', { class: 'gram' },
    h('div', { class: 'gmean' }, h('b', {}, e.mean), ' ', h('span', { class: 'tag' }, e.level)),
    h('h4', {}, '접속'), h('div', {}, e.connect),
    h('h4', {}, '설명'), h('div', {}, e.note),
    e.similar?.length ? h('h4', {}, '비슷한 표현과 비교') : '',
    e.similar?.length ? h('ul', { class: 'plain-list' }, ...e.similar.map(s => h('li', {}, h('b', { class: 'jp' }, s.f), ' — ' + s.d))) : '',
    h('h4', {}, '예문 (먼저 머릿속으로 해석해 보세요)'),
    h('ol', { class: 'plain-list gex' }, ...ex));
  openModal(e.form, body, [...buttons, { label: '닫기' }]);
}

/* ───────── 문법별 학습 상태 ─────────
   따로 저장하지 않고 '푼 기록(progress.done)' 에서 그때그때 계산한다 → 기존 기록도 그대로 반영되고,
   틀렸던 문제를 나중에 맞히면 그 문법은 자동으로 「익힘」이 된다. */
const indexCache = new WeakMap();

// 문법 항목 id → 그 문법이 정답 표현으로 쓰인 [{ item, qi }]
export function grammarIndex(d, entries) {
  const hit = indexCache.get(d);
  if (hit && hit.entries === entries) return hit.map;
  const map = new Map(entries.map(e => [e.id, []]));
  for (const item of d.items) {
    item.questions.forEach((q, qi) => {
      for (const e of matchGrammar(entries, item, q).main) map.get(e.id)?.push({ item, qi });
    });
  }
  indexCache.set(d, { entries, map });
  return map;
}

// [{ entry, total, seen, right, wrong, status: 'weak'|'good'|'new', wrongItems, freshItems, doneItems }]
export function grammarStats(d, entries, progress, today) {
  const map = grammarIndex(d, entries);
  const isOut = id => !(d.released[id] && d.released[id] <= today);
  return entries.map(entry => {
    const hits = map.get(entry.id) || [];
    let right = 0, wrong = 0;
    const wrongItems = new Map(), freshItems = new Map(), doneItems = new Map();
    for (const { item, qi } of hits) {
      const r = progress.done?.[item.id]?.res?.[qi];
      if (r === false) { wrong++; wrongItems.set(item.id, item); }
      else if (r === true) { right++; doneItems.set(item.id, item); }
      else if (!progress.done?.[item.id]) freshItems.set(item.id, item);
    }
    // 새 문제는 이미 공개된 것 → 공개 전(더 풀기 영역) 순
    const fresh = [...freshItems.values()].sort((a, b) =>
      (isOut(a.id) - isOut(b.id)) || String(d.released[a.id] || '').localeCompare(String(d.released[b.id] || '')));
    return {
      entry, total: hits.length, seen: right + wrong, right, wrong,
      status: wrong > 0 ? 'weak' : right > 0 ? 'good' : 'new',
      wrongItems: [...wrongItems.values()],
      freshItems: fresh, doneItems: [...doneItems.values()],
    };
  });
}

// 틀린 문법 자동 복습: 많이 틀린 문법부터, 같은 문법의 '새 문제'를 먼저, 없으면 틀렸던 문제를 다시.
// 문법마다 한 문제씩 번갈아 뽑아서 여러 문법이 골고루 들어간다.
export function buildGrammarReview(stats, n = 10) {
  const weak = stats.filter(s => s.status === 'weak').sort((a, b) => b.wrong - a.wrong);
  const queues = weak.map(s => ({ s, q: [...s.freshItems.map(i => ({ i, fresh: true })), ...s.wrongItems.map(i => ({ i, fresh: false }))] }));
  const used = new Set(), items = [];
  let fresh = 0;
  for (let round = 0; items.length < n && queues.some(x => x.q.length); round++) {
    for (const x of queues) {
      while (x.q.length && used.has(x.q[0].i.id)) x.q.shift();
      const next = x.q.shift();
      if (!next) continue;
      used.add(next.i.id); items.push(next.i); if (next.fresh) fresh++;
      if (items.length >= n) break;
    }
  }
  return { items, weakCount: weak.length, fresh, redo: items.length - fresh, weak };
}

// 한 문법만 연습: 새 문제 → 틀렸던 문제 → 맞혔던 문제 순으로 최대 n개
export function itemsForGrammar(st, n = 5) {
  const seen = new Set(), out = [];
  for (const i of [...st.freshItems, ...st.wrongItems, ...st.doneItems]) {
    if (!seen.has(i.id)) { seen.add(i.id); out.push(i); }
    if (out.length >= n) break;
  }
  return out;
}
