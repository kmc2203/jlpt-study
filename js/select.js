// 문제 화면에서 글자를 길게 눌러 선택하면 하단에 「오답노트에 추가」 바를 띄운다.
import { h, toast } from './util.js';
import { addWord } from './words.js';

const MAX_LEN = 30;
let bar, label, addBtn;
let current = '';
let holdUntil = 0;     // 바를 누르는 동안(선택이 풀려도) 바를 유지
let lastSelAt = 0;     // 마지막으로 글자가 선택돼 있던 시각
let timer;

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

function hide() { if (bar) bar.hidden = true; current = ''; }

export function refreshSelectionBar() {
  if (!bar) return;
  if (document.body.dataset.route !== 'quiz') return hide();
  const text = readSelection();
  if (text) {
    lastSelAt = Date.now();
    current = text;
    label.textContent = `「${text}」`;
    bar.hidden = false;
  } else if (Date.now() >= holdUntil) {
    hide();
  }
}

export async function addCurrentSelection() {
  const word = current;
  if (!word) return null;
  const r = await addWord({ word, source: 'select' });
  toast(r.added ? `「${word}」 오답노트에 저장했어요` : '이미 저장된 단어예요');
  window.getSelection?.().removeAllRanges();
  hide();
  return r;
}

export function initSelectionBar() {
  if (bar) return;
  label = h('span', { class: 'selbar-text jp' });
  addBtn = h('button', { class: 'btn primary small', onclick: addCurrentSelection }, '＋ 오답노트에 추가');
  const close = h('button', { class: 'btn small', 'aria-label': '선택 취소', onclick: () => { window.getSelection?.().removeAllRanges(); hide(); } }, '✕');
  bar = h('div', { id: 'selbar', hidden: true }, label, addBtn, close);
  // 바를 누르는 순간 선택이 풀려도 바가 먼저 사라지지 않게 한다
  bar.addEventListener('pointerdown', () => { holdUntil = Date.now() + 1000; });
  bar.addEventListener('mousedown', e => e.preventDefault());
  document.body.append(bar);
  document.addEventListener('selectionchange', () => {
    clearTimeout(timer);
    timer = setTimeout(refreshSelectionBar, 120);
  });
}
