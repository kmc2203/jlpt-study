// 한자 한 글자 → nihongokanji.com 연결.
// 그 사이트는 한자마다 주소가 숫자 ID 라서 한자로 주소를 만들 수 없다.
//   · 저장된 주소가 있으면 바로 그 페이지로
//   · 없으면 구글 사이트 검색으로 (찾은 페이지 주소를 저장해 두면 다음부터 바로 이동)
// 사이트 내용을 복사하지 않고 링크만 건다.
import { h, toast, openModal } from './util.js';
import { load, commit } from './storage.js';
import { kanjiOf } from './words.js';
import { loadKanjiDb, showReading, gradeLabel } from './kanjidb.js';

export const searchUrl = k => `https://www.google.com/search?q=${encodeURIComponent('site:nihongokanji.com ' + k)}`;

// nihongokanji.com 의 https 주소만 허용. 올바르면 정규화된 주소, 아니면 null
export function validLink(u) {
  try {
    const x = new URL(String(u ?? '').trim());
    const ok = x.protocol === 'https:' && (x.hostname === 'nihongokanji.com' || x.hostname === 'www.nihongokanji.com');
    return ok ? x.href : null;
  } catch { return null; }
}

export async function kanjiUrl(k) {
  const links = await load('kanjiLinks');
  return links[k] || searchUrl(k);
}

// 단어 안의 한자 한 글자마다 칩 하나. 단어 전체가 아니라 한자 단위로만 연결한다.
export function kanjiChips(word) {
  const list = kanjiOf(word);
  if (!list.length) return null;
  const box = h('div', { class: 'kchips', onclick: e => e.stopPropagation() });
  load('kanjiLinks').then(links => {
    box.replaceChildren(...list.map(k => h('button', {
      class: 'kchip' + (links[k] ? ' saved' : ''),
      title: links[k] ? '저장된 nihongokanji 주소가 있어요' : 'nihongokanji에서 찾기',
      onclick: e => { e.stopPropagation(); openKanjiSheet(k, () => box.replaceWith(kanjiChips(word))); },
    }, k)));
  });
  return box;
}

// 한자 카드 본문 (카드 데이터가 있는 한자만)
export function kanjiCard(c) {
  const row = (label, value) => h('div', { class: 'krow' }, h('span', { class: 'klabel' }, label), h('span', { class: 'jp' }, value));
  return h('div', { class: 'kcard' },
    h('div', { class: 'kanji-big jp' }, c.k),
    h('div', { class: 'khun' }, c.hunum),
    h('div', { class: 'row', style: 'justify-content:center;gap:6px;margin:4px 0 8px' }, ...c.meaning.map(m => h('span', { class: 'tag' }, m))),
    row('음독', c.on.join('、') || '-'),
    row('훈독', c.kun.map(showReading).join('、') || '-'),
    row('부수·획수', `${c.radical_ch}(${c.radical}번) · ${c.strokes}획 · ${gradeLabel(c.grade)}`),
    h('div', { class: 'klabel', style: 'margin-top:8px' }, '대표 단어'),
    h('ul', { class: 'kwords' }, ...c.words.map(w =>
      h('li', {}, h('span', { class: 'jp kw' }, w.w), h('span', { class: 'sub' }, ` ${w.r} `), '— ' + w.m))));
}

export async function openKanjiSheet(k, onChange) {
  const links = await load('kanjiLinks');
  const card = (await loadKanjiDb()).cards.get(k);
  const saved = links[k];
  const input = h('input', { type: 'text', inputmode: 'url', value: saved || '', placeholder: 'https://nihongokanji.com/…' });
  const go = h('a', {
    class: 'btn primary block', href: saved || searchUrl(k), target: '_blank', rel: 'noopener noreferrer',
    style: 'display:block;text-align:center;text-decoration:none;margin-top:10px',
  }, saved ? 'nihongokanji에서 보기' : 'nihongokanji에서 찾기 (구글 검색)');
  const body = h('div', {},
    card ? kanjiCard(card) : h('div', { class: 'kanji-big jp' }, k),
    go,
    h('div', { class: 'sub', style: 'margin:10px 0 4px' }, saved
      ? '저장된 주소로 바로 이동해요. 주소를 바꾸려면 아래에서 수정하세요.'
      : '이 사이트는 한자마다 주소가 달라서 처음에는 검색으로 찾아요. 찾은 페이지의 주소를 아래에 저장하면 다음부터 바로 이동해요.'),
    input);
  const buttons = [{ label: '닫기' }];
  if (saved) buttons.push({
    label: '주소 삭제', cls: 'ng', onClick: async () => {
      delete links[k]; await commit('kanjiLinks'); toast('삭제했어요'); onChange?.();
    },
  });
  buttons.push({
    label: '주소 저장', cls: 'primary', onClick: async () => {
      const raw = input.value.trim();
      if (!raw) { toast('저장할 주소를 붙여넣어 주세요'); return false; }
      const u = validLink(raw);
      if (!u) { toast('nihongokanji.com 의 주소만 저장할 수 있어요'); return false; }
      links[k] = u; await commit('kanjiLinks'); toast('저장했어요'); onChange?.();
    },
  });
  openModal(`한자 「${k}」`, body, buttons);
}
