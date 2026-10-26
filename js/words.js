// 단어 오답노트 데이터 접근 (UI 없음)
import { load, commit } from './storage.js';
import { uid } from './util.js';

export const allWords = () => load('words');

const norm = s => String(s ?? '').trim();

// 한자 한 글자씩 (々 는 한자가 아니라 반복 기호이므로 제외). 중복은 한 번만, 등장 순서 유지.
const KANJI_RE = /[㐀-䶿一-鿿豈-﫿]/g;
export const kanjiOf = s => [...new Set(String(s ?? '').match(KANJI_RE) || [])];

// '미완성' = 뜻이 없거나, 한자가 들어 있는데 읽기가 없는 단어
export const isIncomplete = w => !norm(w.meaning) || (kanjiOf(w.word).length > 0 && !norm(w.reading));

export async function findWord(word, reading = '') {
  const words = await allWords();
  const w = norm(word), r = norm(reading);
  return words.find(x => x.word === w && (!r || !x.reading || x.reading === r));
}

// 이미 있으면 {added:false}, 새로 저장하면 {added:true}
export async function addWord({ word, reading = '', meaning = '', memo = '', source = 'manual' }) {
  const w = norm(word);
  if (!w) throw new Error('단어를 입력해 주세요');
  const dup = await findWord(w, reading);
  if (dup) return { added: false, word: dup };
  const entry = {
    id: uid(), word: w, reading: norm(reading), meaning: norm(meaning), memo: norm(memo),
    source, addedAt: Date.now(), seen: 0, miss: 0, lastSeen: 0,
  };
  const words = await allWords();
  words.push(entry);
  await commit('words');
  return { added: true, word: entry };
}

export async function updateWord(id, patch) {
  const words = await allWords();
  const w = words.find(x => x.id === id);
  if (!w) return;
  for (const k of ['word', 'reading', 'meaning', 'memo']) if (k in patch) w[k] = norm(patch[k]);
  await commit('words');
}

export async function removeWord(id) {
  const words = await allWords();
  const i = words.findIndex(x => x.id === id);
  if (i >= 0) words.splice(i, 1);
  await commit('words');
}

export async function recordSeen(id, known) {
  const words = await allWords();
  const w = words.find(x => x.id === id);
  if (!w) return;
  w.seen = (w.seen || 0) + 1;
  if (!known) w.miss = (w.miss || 0) + 1;
  w.lastSeen = Date.now();
  await commit('words');
}

// 여러 줄 붙여넣기 파싱.
//   탭 또는 | 로 구분하거나, "単語, よみ, 뜻" 처럼 쉼표 두 개까지만 구분(뜻 안의 쉼표는 유지).
//   필드가 2개면 단어, 뜻으로 처리한다.
export function parseBulk(text) {
  const out = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let parts;
    if (line.includes('\t')) parts = line.split('\t');
    else if (line.includes('|')) parts = line.split('|');
    else {
      const m = line.match(/^([^,，、]+)[,，、]\s*([^,，、]+)[,，、]\s*(.+)$/) || line.match(/^([^,，、]+)[,，、]\s*(.+)$/);
      parts = m ? m.slice(1) : [line];
    }
    parts = parts.map(s => s.trim());
    if (!parts[0]) continue;
    if (parts.length >= 3) out.push({ word: parts[0], reading: parts[1], meaning: parts.slice(2).join(' ') });
    else if (parts.length === 2) out.push({ word: parts[0], reading: '', meaning: parts[1] });
    else out.push({ word: parts[0], reading: '', meaning: '' });
  }
  return out;
}
