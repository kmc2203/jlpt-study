import test from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, weightOf, pickWeighted, newCycle, answer, retryRound, summary } from '../js/cycle.js';
import { parseBulk } from '../js/words.js';

const mk = n => Array.from({ length: n }, (_, i) => ({ id: 'w' + i, word: 'w' + i, seen: 0, miss: 0, lastSeen: 0 }));

test('shuffle 은 원소를 보존한다', () => {
  const a = [1, 2, 3, 4, 5, 6];
  assert.deepEqual([...shuffle(a)].sort(), a);
  assert.deepEqual(a, [1, 2, 3, 4, 5, 6], '원본은 그대로');
});

test('한 사이클은 10개, 단어가 적으면 있는 만큼', () => {
  assert.equal(newCycle(mk(25)).queue.length, 10);
  assert.equal(newCycle(mk(4)).queue.length, 4);
  assert.equal(new Set(newCycle(mk(25)).ids).size, 10, '중복 없음');
});

test('알아요/몰라요 기록과 완료', () => {
  const c = newCycle(mk(3));
  const [a, b, d] = c.queue;
  answer(c, true);
  answer(c, false);
  assert.equal(c.done, false);
  answer(c, false);
  assert.equal(c.done, true);
  assert.deepEqual(c.unknown, [b, d]);
  assert.deepEqual(summary(c), { total: 3, known: 1, unknown: 2 });
  assert.ok(a);
});

test('몰랐던 단어 다시 풀기: 몰라요만, 기록은 새로 시작', () => {
  const c = newCycle(mk(10));
  c.queue.forEach((_, i) => answer(c, i >= 3)); // 앞의 3개만 몰라요
  const r = retryRound(c);
  assert.equal(r.queue.length, 3);
  assert.deepEqual([...r.queue].sort(), [...c.unknown].sort());
  assert.equal(r.round, 2);
  assert.deepEqual(r.unknown, []);
  assert.equal(r.done, false);
  // 다시 풀기에서 또 모르면 그 단어만 남는다
  answer(r, true); answer(r, false); answer(r, true);
  assert.equal(r.unknown.length, 1);
  assert.equal(retryRound(r).queue.length, 1);
});

test('모두 알면 다시 풀기는 null', () => {
  const c = newCycle(mk(5));
  c.queue.forEach(() => answer(c, true));
  assert.equal(retryRound(c), null);
});

test('가중치: 안 본 단어·자주 틀린 단어·오래 안 본 단어가 더 무겁다', () => {
  const now = Date.now();
  const fresh = weightOf({ seen: 0, miss: 0, lastSeen: 0 }, now);
  const known = weightOf({ seen: 5, miss: 0, lastSeen: now }, now);
  const hard = weightOf({ seen: 5, miss: 4, lastSeen: now }, now);
  assert.ok(fresh > known && hard > known);
  assert.ok(weightOf({ seen: 5, miss: 0, lastSeen: now - 10 * 86400000 }, now) > known);
});

test('pickWeighted 는 중복 없이 뽑는다', () => {
  const picked = pickWeighted(mk(12), 10);
  assert.equal(new Set(picked.map(w => w.id)).size, 10);
});

test('일괄 추가 파싱', () => {
  const rows = parseBulk('納める, おさめる, 납부하다, 바치다\n更新\tこうしん\t갱신\n提供|ていきょう|제공\n余計な, 쓸데없는\n\n単独');
  assert.deepEqual(rows, [
    { word: '納める', reading: 'おさめる', meaning: '납부하다, 바치다' },
    { word: '更新', reading: 'こうしん', meaning: '갱신' },
    { word: '提供', reading: 'ていきょう', meaning: '제공' },
    { word: '余計な', reading: '', meaning: '쓸데없는' },
    { word: '単独', reading: '', meaning: '' },
  ]);
});
