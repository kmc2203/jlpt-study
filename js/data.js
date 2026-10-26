// 문제 데이터 로딩과 출제 대상 선택
//   data/manifest.json : { batches:[...], released:{ 문제ID: 'YYYY-MM-DD' }, daily_count }
//   data/pool/*.json   : { items:[...] }  (문제 풀. release.py 가 매일 일부를 'released'에 등록)

export const TYPES = {
  kanji_reading: '한자 읽기',
  orthography: '표기',
  context: '문맥 규정',
  synonym: '유의 표현',
  usage: '용법',
  grammar: '문법 형식',
  sentence_order: '문장 완성(★)',
  text_grammar: '글의 문법',
  reading_short: '독해(단문)',
  reading_mid: '독해(중문)',
  reading_long: '독해(장문)',
  reading_integrated: '통합 이해',
  reading_claim: '주장 이해',
  info_search: '정보 검색',
};

let cache;

async function fetchJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} (${r.status})`);
  return r.json();
}

export async function loadData(force = false) {
  if (cache && !force) return cache;
  const man = await fetchJson('data/manifest.json');
  const batches = await Promise.all((man.batches || []).map(b => fetchJson('data/' + b)));
  const items = batches.flatMap(b => b.items || []);
  cache = { man, items, byId: new Map(items.map(i => [i.id, i])), released: man.released || {} };
  return cache;
}

// 유형별 라운드로빈으로 n개 선택 (입력 순서는 유형 안에서 유지)
export function balancedPick(items, n) {
  const groups = new Map();
  for (const it of items) {
    if (!groups.has(it.type)) groups.set(it.type, []);
    groups.get(it.type).push(it);
  }
  const out = [];
  while (out.length < n && groups.size) {
    for (const [t, arr] of [...groups]) {
      out.push(arr.shift());
      if (!arr.length) groups.delete(t);
      if (out.length >= n) break;
    }
  }
  return out;
}

// 매일 공개된 문제 중 아직 안 푼 것 (공개일 순)
export function dailyAvailable(d, progress, today) {
  return d.items
    .filter(i => d.released[i.id] && d.released[i.id] <= today && !progress.done[i.id])
    .sort((a, b) => d.released[a.id].localeCompare(d.released[b.id]));
}

// '더 풀기'용: 아직 공개 안 된 문제를 풀의 '뒤쪽'부터 소진한다.
// (매일 공개는 앞쪽부터 나가므로 둘이 겹치지 않는다)
export function extraAvailable(d, progress, type) {
  return d.items
    .filter(i => !d.released[i.id] && !progress.done[i.id] && (!type || i.type === type))
    .reverse();
}

export function wrongAvailable(d, progress) {
  return Object.keys(progress.wrong).map(id => d.byId.get(id)).filter(Boolean);
}

export const unreleasedCount = d => d.items.filter(i => !d.released[i.id]).length;
