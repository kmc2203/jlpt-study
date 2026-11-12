// 문법 모아보기: 지금까지 만난 문법 항목을 한곳에 모아, 내 상태(틀림/익힘/아직 안 만남)로 걸러 보고
// 눌러서 상세를 보거나 그 문법의 문제만 골라 풀 수 있다. 상태는 푼 기록에서 그때그때 계산한다.
import { h, todayStr } from './util.js';
import { load } from './storage.js';
import { loadData } from './data.js';
import { loadGrammar, grammarStats, buildGrammarReview, itemsForGrammar, openGrammar } from './grammar.js';
import { requestSession } from './quiz.js';

const STATUS = {
  weak: { label: '틀림', cls: 'g-weak' },
  new: { label: '아직 안 만남', cls: '' },
  good: { label: '익힘', cls: 'g-strong' },
};
const FILTERS = [['all', '전체'], ['weak', '틀림'], ['new', '아직 안 만남'], ['good', '익힘']];
const ORDER = { weak: 0, new: 1, good: 2 };

export async function renderGrammarList(view) {
  view.replaceChildren(h('div', { class: 'empty' }, '불러오는 중…'));
  const [d, entries, progress] = await Promise.all([loadData().catch(() => null), loadGrammar(), load('progress')]);
  if (!d || !entries.length) { view.replaceChildren(h('div', { class: 'card' }, '문법 데이터를 불러오지 못했어요.')); return; }
  const stats = grammarStats(d, entries, progress, todayStr());
  const count = k => stats.filter(s => s.status === k).length;
  const review = buildGrammarReview(stats, 10);

  let filter = 'all', level = '', query = '';
  const list = h('div', { class: 'glist' });
  const filterRow = h('div', { class: 'gchips' });
  const search = h('input', { type: 'search', placeholder: '문법·뜻 검색 (예: ものの, 불구하고)', style: 'width:100%' });
  const levelSel = h('select', {}, h('option', { value: '' }, '전체 급수'),
    ...[...new Set(entries.map(e => e.level))].sort().reverse().map(l => h('option', { value: l }, l)));

  const paintFilters = () => filterRow.replaceChildren(...FILTERS.map(([k, label]) =>
    h('button', { class: 'gchip' + (filter === k ? ' main' : ''), type: 'button', onclick: () => { filter = k; paintFilters(); paint(); } },
      `${label} ${k === 'all' ? stats.length : count(k)}`)));

  const paint = () => {
    const q = query.trim().toLowerCase().replace(/[～〜~\s]/g, '');
    const rows = stats
      .filter(s => (filter === 'all' || s.status === filter) && (!level || s.entry.level === level) &&
        (!q || (s.entry.form + s.entry.mean + s.entry.keys.join('')).toLowerCase().replace(/[～〜~\s]/g, '').includes(q)))
      .sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || (b.wrong - a.wrong));
    if (!rows.length) { list.replaceChildren(h('div', { class: 'sub', style: 'padding:12px 0' }, '조건에 맞는 문법이 없어요.')); return; }
    list.replaceChildren(...rows.map(s => {
      const st = STATUS[s.status];
      const detail = s.status === 'weak' ? `틀림 ${s.wrong} · 맞힘 ${s.right}`
        : s.status === 'good' ? `맞힘 ${s.right}` : s.total ? `문제 ${s.total}개 대기` : '아직 문제가 없어요';
      return h('button', { class: 'grow-row', type: 'button', onclick: () => open(s) },
        h('div', { class: 'grow' },
          h('div', { class: 'jp gform' }, s.entry.form),
          h('div', { class: 'sub' }, s.entry.mean + ' · ' + s.entry.level)),
        h('div', { class: 'gst' }, h('span', { class: 'chip ' + st.cls }, st.label), h('div', { class: 'sub' }, detail)));
    }));
  };

  const open = s => {
    const items = itemsForGrammar(s, 5);
    openGrammar(s.entry, items.length ? [{
      label: `이 문법 문제 풀기 (${items.length})`, cls: 'primary',
      onClick: () => { requestSession(items, 'gdrill'); location.hash = '#/quiz'; },
    }] : []);
  };

  search.addEventListener('input', () => { query = search.value; paint(); });
  levelSel.addEventListener('change', () => { level = levelSel.value; paint(); });
  paintFilters(); paint();

  view.replaceChildren(
    h('div', { class: 'card' },
      h('h2', {}, '문법 모아보기'),
      h('div', { class: 'sub' }, `지금까지 모은 문법 ${stats.length}개 · 틀림 ${count('weak')} · 익힘 ${count('good')} · 아직 안 만남 ${count('new')}. 상태는 푼 기록에서 자동으로 정해져요. 틀렸던 문제를 다시 맞히면 「익힘」이 돼요.`),
      h('div', { class: 'row end' },
        h('button', { class: 'btn primary', disabled: !review.items.length, onclick: () => { requestSession(review.items, 'gram'); location.hash = '#/quiz'; } },
          review.items.length ? `틀린 문법 복습 (${review.items.length}문제)` : '틀린 문법이 없어요'))),
    h('div', { class: 'card' }, filterRow, h('div', { class: 'row', style: 'margin:8px 0' }, h('div', { class: 'grow' }, search), levelSel), list));
}
