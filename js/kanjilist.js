// 한자 카드 목록: 학년별로 한자를 모아 보고, 누르면 카드가 열린다
import { h } from './util.js';
import { load } from './storage.js';
import { loadKanjiDb, gradeLabel } from './kanjidb.js';
import { openKanjiSheet } from './kanji.js';

let grade = 1;

export async function renderKanjiList(view) {
  const db = await loadKanjiDb();
  const grades = [...db.byGrade.keys()].sort((a, b) => a - b);
  if (!grades.length) {
    view.replaceChildren(h('div', { class: 'empty' }, '한자 카드 데이터를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));
    return;
  }
  if (!db.byGrade.has(grade)) grade = grades[0];
  const links = await load('kanjiLinks');
  const list = db.byGrade.get(grade);
  const draw = () => renderKanjiList(view);

  view.replaceChildren(
    h('div', { class: 'seg' }, ...grades.map(g =>
      h('button', { class: g === grade ? 'on' : '', onclick: () => { grade = g; draw(); } }, `${gradeLabel(g)} ${db.byGrade.get(g).length}자`))),
    h('div', { class: 'sub', style: 'margin-bottom:8px' }, '한자를 누르면 카드가 열려요. 테두리 아래 줄이 있는 한자는 nihongokanji 주소를 저장해 둔 한자예요.'),
    h('div', { class: 'kgrid' }, ...list.map(c =>
      h('button', {
        class: 'kcell' + (links[c.k] ? ' saved' : ''),
        onclick: () => openKanjiSheet(c.k, draw),
      }, h('span', { class: 'jp kk' }, c.k), h('span', { class: 'ks' }, c.hunum)))));
}
