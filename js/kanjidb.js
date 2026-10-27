// 한자 카드 데이터 로딩 (data/kanji/index.json 에 적힌 파일들)
//   카드: { k, hunum, meaning[], on[], kun[], radical, radical_ch, strokes, grade, words:[{w,r,m}] }
let cache;

async function fetchJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} (${r.status})`);
  return r.json();
}

// 반환: { cards: Map(한자 → 카드), byGrade: Map(학년 → 카드[]) }. 불러오지 못하면 빈 데이터(앱은 그대로 동작)
export async function loadKanjiDb(force = false) {
  if (cache && !force) return cache;
  const db = { cards: new Map(), byGrade: new Map() };
  try {
    const index = await fetchJson('data/kanji/index.json');
    const parts = await Promise.all(index.files.map(f => fetchJson('data/kanji/' + f)));
    for (const p of parts) for (const c of p.kanji) {
      db.cards.set(c.k, c);
      if (!db.byGrade.has(c.grade)) db.byGrade.set(c.grade, []);
      db.byGrade.get(c.grade).push(c);
    }
  } catch (e) { console.warn('한자 카드 데이터를 불러오지 못했어요', e); }
  cache = db;
  return db;
}

// 이미 불러온 카드를 바로 조회 (아직 안 불러왔으면 undefined). 앱 시작 때 loadKanjiDb() 를 한 번 불러 둔다.
export const cardSync = k => cache?.cards.get(k);

// 사전식 표기 "やす.む" → 화면용 "やす・む"
export const showReading = s => String(s).replace(/\./g, '・');
