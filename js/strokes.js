// 한자 획순 재생 + 구성 풀이.
//   data/strokes/<5자리 16진수>.json : KanjiVG(CC BY-SA 3.0, (c) Ulrich Apel)에서 뽑은 획 경로와 구성 요소의 획 범위
//   data/notes/*.json                : 한자별 암기용 구성 풀이 (직접 작성). 풀이 속 {글자} 는 눌러서 그 부분 획을 강조
import { h } from './util.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const cache = new Map();
let notes;

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} (${r.status})`);
  return r.json();
}

export const strokeFile = k => `data/strokes/${k.codePointAt(0).toString(16).padStart(5, '0')}.json`;

// 획 데이터. 없거나 못 불러오면 null (앱은 그대로 동작)
export async function loadStrokes(k) {
  if (cache.has(k)) return cache.get(k);
  let d = null;
  try { d = await getJson(strokeFile(k)); } catch { /* 아직 없는 한자 */ }
  cache.set(k, d);
  return d;
}

// 풀이는 data/notes/<학년 파일>.json (data/kanji/index.json 과 같은 파일 이름). 한 번만 모아서 불러온다.
export async function loadNote(k) {
  if (notes === undefined) {
    notes = {};
    try {
      const index = await getJson('data/kanji/index.json');
      const parts = await Promise.all(index.files.map(f => getJson('data/notes/' + f).catch(() => null)));
      for (const p of parts) Object.assign(notes, p?.notes);
    } catch { /* 풀이 없이도 획순은 보인다 */ }
  }
  return notes[k] || null;
}

// "손({爫:⺤})으로 …{心}…" → [문자열 | {label, from, to}]. {라벨} 은 그 이름의 구성 요소, {라벨:요소} 는 요소 글자가 다를 때, {라벨:3-5} 는 획 범위(0부터)
export function parseNote(text, parts) {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(/\{([^}:]+)(?::([^}]+))?\}/g)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const label = m[1], spec = m[2] ?? label;
    let range = null;
    const r = /^(\d+)-(\d+)$/.exec(spec);
    if (r) range = { from: +r[1], to: +r[2] };
    else {
      const p = parts.find(x => x.el === spec);
      if (p) range = { from: p.from, to: p.to };
    }
    out.push(range ? { label, ...range } : label);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function strokePlayer(data, note) {
  const n = data.strokes.length;
  let shown = n;           // 지금까지 그린 획 수
  let focus = null;        // 강조 중인 구성 요소 {from,to}
  let timer = null;
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 109 109');
  svg.setAttribute('class', 'kstroke-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '획순');
  const paths = data.strokes.map(d => {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('pathLength', '1');
    svg.append(p);
    return p;
  });
  const count = h('span', { class: 'kstroke-count' });

  const paint = () => {
    paths.forEach((p, i) => {
      const inFocus = focus && i >= focus.from && i <= focus.to;
      let cls = 'ks ';
      if (focus) cls += inFocus ? 'on' : (i < shown ? 'dim' : 'off');
      else cls += i < shown - 1 || (i === shown - 1 && shown === n) ? 'done' : i === shown - 1 ? 'cur' : 'off';
      p.setAttribute('class', cls);
    });
    count.textContent = `${shown} / ${n}획`;
  };
  const stop = () => { clearTimeout(timer); timer = null; };
  const play = () => {
    stop(); focus = null; shown = 0; paint();
    const step = () => { shown++; paint(); if (shown < n) timer = setTimeout(step, 650); else timer = null; };
    timer = setTimeout(step, 250);
  };
  const next = () => {
    stop(); focus = null;
    shown = shown >= n ? 1 : shown + 1;
    paint();
  };

  const story = h('div', { class: 'kstory' });
  if (note) {
    const segs = parseNote(note, data.parts);
    story.append(...segs.map(s => typeof s === 'string' ? s : h('button', {
      class: 'kpart', type: 'button',
      onclick: e => {
        stop();
        const same = focus && focus.from === s.from && focus.to === s.to;
        focus = same ? null : { from: s.from, to: s.to };
        for (const b of story.querySelectorAll('.kpart')) b.classList.remove('sel');
        if (!same) e.currentTarget.classList.add('sel');
        paint();
      },
    }, s.label)));
    story.append(h('div', { class: 'sub', style: 'margin-top:6px' },
      '밑줄 친 부분을 누르면 그 부분의 획이 강조돼요. 모양을 외우기 위한 연상 풀이예요.'));
  }

  play();   // 카드를 열면 바로 획순이 재생된다
  return h('div', { class: 'kstroke' },
    h('div', { class: 'kstroke-box' }, svg),
    h('div', { class: 'row', style: 'justify-content:center;gap:8px;align-items:center;margin:8px 0' },
      count,
      h('button', { class: 'btn', type: 'button', onclick: play }, '다시 보기'),
      h('button', { class: 'btn', type: 'button', onclick: next }, '다음 획')),
    story);
}

// 카드 안의 자리(holder)에 획순과 풀이를 채운다. 데이터가 없는 한자는 아무것도 넣지 않는다.
export async function fillStrokes(holder, k) {
  const data = await loadStrokes(k);
  if (!data || !data.strokes?.length) return;
  const note = await loadNote(k);
  holder.replaceChildren(strokePlayer(data, note));
}
