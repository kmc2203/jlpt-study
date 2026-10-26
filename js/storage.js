// 저장 계층. 모든 화면은 이 파일의 load/commit 만 사용한다.
// 지금은 localStorage 기반이며, 나중에 Firebase 등으로 바꿀 때는
// 아래 `backend` 의 get/set 두 함수만 같은 시그니처(async)로 교체하면 된다.

const PREFIX = 'jlpt2:';
const mem = new Map(); // localStorage 사용 불가 시 임시 대체

const backend = {
  async get(key) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v == null ? undefined : JSON.parse(v);
    } catch { return mem.get(key); }
  },
  async set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); }
    catch { mem.set(key, value); }
  },
};

export const DEFAULTS = {
  words: () => [],
  progress: () => ({ done: {}, wrong: {}, stats: {}, days: {} }),
  settings: () => ({ furigana: false }),
  cycle: () => null,
};

const cache = {};

export async function load(key) {
  if (!(key in cache)) {
    const v = await backend.get(key);
    cache[key] = v === undefined ? DEFAULTS[key]() : v;
  }
  return cache[key];
}

// load() 로 받은 객체를 수정한 뒤 호출. value 를 넘기면 통째로 교체.
export async function commit(key, value) {
  if (value !== undefined) cache[key] = value;
  await backend.set(key, cache[key]);
}

export async function requestPersistence() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}

export async function exportAll() {
  const data = {};
  for (const k of Object.keys(DEFAULTS)) data[k] = await load(k);
  return { app: 'jlpt-study', version: 1, exportedAt: new Date().toISOString(), data };
}

export async function importAll(obj) {
  if (!obj || obj.app !== 'jlpt-study' || !obj.data) throw new Error('이 앱에서 내보낸 파일이 아니에요');
  for (const k of Object.keys(DEFAULTS)) {
    if (obj.data[k] !== undefined) await commit(k, obj.data[k]);
  }
}

export async function resetAll() {
  for (const k of Object.keys(DEFAULTS)) await commit(k, DEFAULTS[k]());
}
