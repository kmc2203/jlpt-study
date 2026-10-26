// 단어 오답노트 사이클 로직 (순수 함수 — DOM/저장소와 무관, 테스트 가능)

export const CYCLE_SIZE = 10;

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 새 사이클에서 뽑힐 가중치: 한 번도 안 본 단어, 자주 몰랐던 단어, 오래 안 본 단어가 유리
export function weightOf(w, now = Date.now()) {
  const days = w.lastSeen ? (now - w.lastSeen) / 86400000 : 30;
  return 1 + (w.miss || 0) * 0.5 + Math.min(days, 14) / 7 + ((w.seen || 0) === 0 ? 2 : 0);
}

// 가중치 비복원 추출
export function pickWeighted(words, n, rng = Math.random, now = Date.now()) {
  const pool = words.map(w => ({ w, wt: weightOf(w, now) }));
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, p) => s + p.wt, 0);
    let r = rng() * total;
    let idx = pool.findIndex(p => (r -= p.wt) < 0);
    if (idx < 0) idx = pool.length - 1;
    out.push(pool.splice(idx, 1)[0].w);
  }
  return out;
}

export function newCycle(words, rng = Math.random, now = Date.now(), size = CYCLE_SIZE) {
  const ids = pickWeighted(words, Math.min(size, words.length), rng, now).map(w => w.id);
  return { ids, queue: shuffle(ids, rng), idx: 0, unknown: [], round: 1, done: ids.length === 0, startedAt: now };
}

// 현재 카드에 대한 답을 기록하고 다음으로 넘어간다. 해당 단어 id 를 반환.
export function answer(cycle, known) {
  const id = cycle.queue[cycle.idx];
  if (!known) cycle.unknown.push(id);
  cycle.idx += 1;
  if (cycle.idx >= cycle.queue.length) cycle.done = true;
  return id;
}

// '몰랐던 단어 다시 풀기': 이번 라운드에서 몰라요를 누른 단어만 랜덤 순서로 새 라운드
export function retryRound(cycle, rng = Math.random) {
  if (!cycle.unknown.length) return null;
  return { ...cycle, queue: shuffle(cycle.unknown, rng), idx: 0, unknown: [], round: cycle.round + 1, done: false };
}

export function summary(cycle) {
  const total = cycle.queue.length;
  return { total, unknown: cycle.unknown.length, known: total - cycle.unknown.length };
}
