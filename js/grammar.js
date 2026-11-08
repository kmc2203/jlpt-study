// 문법 정리: 문제를 풀고 난 해설에서 그 문제에 나온 문법을 눌러 자세히 본다.
//   data/grammar.json 의 항목 { id, form, keys[], level, mean, connect, note, similar[{f,d}], ex[{ja,ko}] }
//   항목은 새 문제가 만들어질 때마다 함께 늘어난다 (docs/GENERATE_PROMPT.md).
//   문제와 항목은 keys 와 문제 글자를 비교해 자동으로 이어진다 (scripts/validate.py 도 같은 규칙).
import { h, plain, openModal } from './util.js';
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

export function openGrammar(e) {
  const ex = e.ex.map(x => {
    const ko = h('div', { class: 'sub', hidden: true }, x.ko);
    const ja = h('div', { class: 'jp' }, x.ja);
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
  openModal(e.form, body, [{ label: '닫기' }]);
}
