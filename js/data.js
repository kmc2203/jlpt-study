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

export const LEVELS = ['N5', 'N4', 'N3', 'N2'];
export const levelOf = item => (LEVELS.includes(item?.level) ? item.level : 'N2');

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

// 간격 반복: 틀린 문제는 하루 뒤 → 3 → 7 → 14 → 30일 뒤에 다시 나오고, 그때마다 맞히면 다음 단계로
export const SRS_STEPS = [1, 3, 7, 14, 30];

// 오늘 복습할 문제: 일정이 오늘 이전인 것 + 아직 일정이 없는 틀린 문제(기존 기록)
export function srsDue(d, progress, today) {
  const ids = new Set();
  for (const id of Object.keys(progress.wrong || {})) if (!progress.srs?.[id]) ids.add(id);
  for (const [id, s] of Object.entries(progress.srs || {})) if (s.due <= today) ids.add(id);
  return [...ids].map(id => d.byId.get(id)).filter(Boolean);
}

// 모의고사 구성: 어휘 35% · 문법 35% · 독해 30% (문항 수 기준), 안 푼 문제를 먼저. 시험처럼 어휘 → 문법 → 독해 순.
export const EXAM_GROUPS = [
  { key: 'vocab', label: '문자·어휘', w: 0.35, types: ['kanji_reading', 'orthography', 'context', 'synonym', 'usage'] },
  { key: 'grammar', label: '문법', w: 0.35, types: ['grammar', 'sentence_order', 'text_grammar'] },
  { key: 'reading', label: '독해', w: 0.30, types: ['reading_short', 'reading_mid', 'reading_long', 'reading_integrated', 'reading_claim', 'info_search'] },
];
export const groupOf = type => EXAM_GROUPS.find(g => g.types.includes(type))?.key;

export function buildExam(d, progress, nQuestions, rnd = Math.random) {
  const shuffle = a => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  const fresh = it => (progress.done[it.id] ? 1 : 0);
  const used = new Set(), out = [];
  const take = (pool, target) => {
    let n = 0;
    for (const it of pool) {
      if (n >= target) break;
      if (used.has(it.id) || n + it.questions.length > target + 2) continue;
      used.add(it.id); out.push(it); n += it.questions.length;
    }
    return n;
  };
  const byGroup = Object.fromEntries(EXAM_GROUPS.map(g => [g.key,
    shuffle(d.items.filter(i => g.types.includes(i.type))).sort((a, b) => fresh(a) - fresh(b))]));
  let got = 0;
  for (const g of EXAM_GROUPS) got += take(byGroup[g.key], Math.round(nQuestions * g.w));
  if (got < nQuestions) got += take(shuffle(d.items).sort((a, b) => fresh(a) - fresh(b)), nQuestions - got);
  const rank = Object.fromEntries(EXAM_GROUPS.map((g, i) => [g.key, i]));
  return out.sort((a, b) => rank[groupOf(a.type)] - rank[groupOf(b.type)]);
}

export const unreleasedCount = d => d.items.filter(i => !d.released[i.id]).length;
