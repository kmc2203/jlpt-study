// 문제 화면에서 글자를 길게 눌러 선택하면 하단에 「오답노트에 추가」 바를 띄운다.
import { h, toast } from './util.js';
import { addWord, cardFor } from './words.js';
import { loadKanjiDb } from './kanjidb.js';
import { openKanjiSheet } from './kanji.js';

const MAX_LEN = 30;
let bar, label, addBtn, cardBtn;
let current = '';
let holdUntil = 0;     // 바를 누르는 동안(선택이 풀려도) 바를 유지
let lastSelAt = 0;     // 마지막으로 글자가 선택돼 있던 시각
let timer;
let suspended = false; // 한자 카드가 열려 있는 동안엔 바를 건드리지 않는다
let pinned = false;    // 카드를 닫은 뒤 선택이 풀렸어도 바를 유지 (화면의 다른 곳을 누르면 해제)

// 선택 직후 손을 떼는 탭이 선택지를 눌러 버리는 사고를 막는 용도
export const recentlySelected = () => Date.now() - lastSelAt < 600;

// 현재 선택된 글자(후리가나·선택지 번호 제외, 공백 제거). 문제 화면 안이 아니거나 너무 길면 ''
export function readSelection(root = document.getElementById('view')) {
  const sel = window.getSelection?.();
  if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) return '';
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return '';
  const node = range.commonAncestorContainer;
  const el = node.nodeType === 1 ? node : node.parentElement;
  if (el?.closest('input,textarea,select,.modal')) return '';
  const frag = range.cloneContents();
  frag.querySelectorAll('rt,rp,.choice > b,.slot').forEach(n => n.remove());
  const text = (frag.textContent || '').replace(/[\s　]+/g, '');
  return text.length >= 1 && text.length <= MAX_LEN ? text : '';
}

function hide() { if (bar) bar.hidden = true; current = ''; pinned = false; }

export function refreshSelectionBar() {
  if (!bar || suspended) return;
  if (document.body.dataset.route !== 'quiz') return hide();
  const text = readSelection();
  if (text) {
    lastSelAt = Date.now();
    current = text;
    label.textContent = `「${text}」`;
    cardBtn.hidden = !cardFor(text); // 한자 한 글자이고 카드가 있을 때만
    bar.hidden = false;
  } else if (Date.now() >= holdUntil && !pinned) {
    hide();
  }
}

export async function addCurrentSelection() {
  const word = current;
  if (!word) return null;
  const r = await addWord({ word, source: 'select' });
  toast(r.added ? `「${word}」 오답노트에 저장했어요${cardFor(word) ? ' (한자 카드와 연결)' : ''}` : '이미 저장된 단어예요');
  window.getSelection?.().removeAllRanges();
  hide();
  return r;
}

export function openCurrentCard() {
  const k = current;
  if (!k || !cardFor(k)) return;
  // 카드를 닫으면 방금 고른 글자를 그대로 다시 선택 상태로 돌려놓는다.
  // (안드로이드가 선택을 풀어 버려도 바와 글자는 유지)
  const sel = window.getSelection?.();
  let saved = null;
  try { if (sel && sel.rangeCount && !sel.isCollapsed) saved = sel.getRangeAt(0).cloneRange(); } catch { /* 무시 */ }
  suspended = true;
  bar.hidden = true;
  openKanjiSheet(k, undefined, { onClose: () => restoreAfterCard(k, saved) });
}

function restoreAfterCard(text, range) {
  suspended = false;
  if (document.body.dataset.route !== 'quiz') return hide();
  try {
    if (range) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); }
  } catch { /* 선택 복원은 못 해도 바는 아래에서 유지 */ }
  current = text; pinned = true;
  lastSelAt = Date.now();               // 닫기 탭이 선택지를 눌러 버리지 않게
  holdUntil = Date.now() + 1500;
  label.textContent = `「${text}」`;
  cardBtn.hidden = !cardFor(text);
  bar.hidden = false;
}

export function initSelectionBar() {
  if (bar && document.body.contains(bar)) return;
  loadKanjiDb(); // 선택한 글자의 카드 유무를 바로 알 수 있게 미리 불러온다
  label = h('span', { class: 'selbar-text jp' });
  addBtn = h('button', { class: 'btn primary small', onclick: addCurrentSelection }, '＋ 오답노트에 추가');
  const close = h('button', { class: 'btn small', 'aria-label': '선택 취소', onclick: () => { window.getSelection?.().removeAllRanges(); hide(); } }, '✕');
  cardBtn = h('button', { class: 'btn small', hidden: true, onclick: openCurrentCard }, '한자 카드');
  bar = h('div', { id: 'selbar', hidden: true }, label, cardBtn, addBtn, close);
  // 바를 누르는 순간 선택이 풀려도 바가 먼저 사라지지 않게 한다
  bar.addEventListener('pointerdown', () => { holdUntil = Date.now() + 1000; });
  bar.addEventListener('mousedown', e => e.preventDefault());
  document.body.append(bar);
  // 문제 화면의 다른 곳을 누르면 '유지' 상태를 풀고 평소처럼 동작
  document.addEventListener('pointerdown', e => {
    if (!pinned || suspended || bar.contains(e.target) || e.target.closest?.('.modal')) return;
    pinned = false; holdUntil = 0;
    setTimeout(refreshSelectionBar, 150);
  });
  document.addEventListener('selectionchange', () => {
    clearTimeout(timer);
    timer = setTimeout(refreshSelectionBar, 120);
  });
}
