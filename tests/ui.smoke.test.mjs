// 화면 동작 스모크 테스트 (jsdom). `npm install` 후 `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); } catch { /* jsdom 없으면 건너뜀 */ }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function setup() {
  const html = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/' });
  const w = dom.window;
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};
  Object.assign(globalThis, {
    window: w, document: w.document, localStorage: w.localStorage, DOMParser: w.DOMParser,
    confirm: () => true,
    fetch: async url => {
      try {
        const txt = await fs.readFile(path.join(ROOT, String(url)), 'utf8');
        return { ok: true, status: 200, json: async () => JSON.parse(txt) };
      } catch { return { ok: false, status: 404 }; }
    },
  });
  return { view: w.document.getElementById('view') };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, what, timeout = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const v = fn(); if (v) return v; await sleep(5); }
  throw new Error('시간 초과: ' + what);
}
const btn = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
const clickBtn = async text => { const b = await waitFor(() => { const x = btn(text); return x && !x.disabled ? x : null; }, `버튼 '${text}'`); b.click(); };
const bodyText = () => document.body.textContent;

test('문제 풀이: 오늘의 문제 → 풀이 → 해설 → 결과, 푼 문제 기록', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { renderQuizHome } = await import('../js/quiz.js');
  const { load } = await import('../js/storage.js');
  const { loadData } = await import('../js/data.js');
  const d = await loadData();
  const releasedN = Object.keys(d.released).length;
  assert.ok(releasedN > 0, '초기 manifest 에 공개된 문제가 있어야 함');

  await renderQuizHome(view);
  assert.match(bodyText(), new RegExp(`풀지 않은 문제 ${releasedN}개`));
  await clickBtn('시작');

  let n = 0, wrongCount = 0;
  while (true) {
    await waitFor(() => document.querySelector('.choice'), '선택지');
    const choices = [...document.querySelectorAll('.choice')];
    assert.equal(choices.length, 4);
    // 3번째마다 일부러 틀린다. 정답 인덱스는 data 에서 찾는다 (화면 텍스트로 문항 식별)
    const q = findQuestion(d, document.querySelector('.stem')?.textContent, choices[0].textContent);
    const wrong = n % 3 === 2;
    const pick = wrong ? (q.answer + 1) % 4 : q.answer;
    choices[pick].click();
    await waitFor(() => document.querySelector('.banner'), '해설 배너');
    assert.match(document.querySelector('.banner').textContent, wrong ? /오답/ : /정답/);
    assert.ok(document.querySelector('.exp h3'), '해설 섹션이 보여야 함');
    assert.equal(document.querySelectorAll('.choice.correct').length, 1);
    if (wrong) wrongCount++;
    n++;
    const last = !btn('다음 문제');
    await clickBtn(last ? '결과 보기' : '다음 문제');
    if (last) break;
  }
  await waitFor(() => bodyText().includes('수고했어요'), '결과 화면');

  const p = await load('progress');
  assert.equal(Object.keys(p.done).length, releasedN, '공개된 문제를 모두 푼 것으로 기록');
  assert.ok(Object.keys(p.wrong).length >= 1 && Object.keys(p.wrong).length <= wrongCount);

  // 다시 들어오면 오늘 분량이 0개, 푼 문제는 다시 나오지 않는다
  await renderQuizHome(view);
  assert.match(bodyText(), /오늘 분량은 모두 풀었어요/);
  assert.ok(btn('복습 시작') && !btn('복습 시작').disabled, '틀린 문제 복습 가능');

  // 더 풀기: 공개되지 않은 문제만, 이미 푼 문제는 제외
  const sel = [...document.querySelectorAll('select')].at(-1);
  sel.value = '5';
  await clickBtn('더 풀기');
  await waitFor(() => document.querySelector('.choice'), '더 풀기 첫 문제');
  const first = findQuestion(d, document.querySelector('.stem')?.textContent, document.querySelector('.choice').textContent);
  const owner = d.items.find(i => i.questions.includes(first));
  assert.ok(!d.released[owner.id], '공개되지 않은 문제에서 출제');
  assert.ok(!p.done[owner.id], '이미 푼 문제는 다시 나오지 않음');
});

function findQuestion(d, stemText, firstChoiceText) {
  for (const it of d.items) for (const q of it.questions) {
    const plainStem = (q.stem || '').replace(/\[\[(.+?)\]\]/g, '$1').replace(/＿{2,}/g, '').replace(/\s/g, '');
    const screen = (stemText || '').replace(/\s/g, '').replace(/　/g, '');
    if (plainStem.replace(/　/g, '') === screen.replace(/★/g, '★') || screen.includes(plainStem.replace(/　/g, '').replace(/★/g, '★'))) {
      if (q.choices[0].replace(/\s/g, '') === firstChoiceText.replace(/^\d/, '').replace(/\s/g, '')) return q;
    }
  }
  // 화면의 슬롯 표기(공백)와 데이터가 어긋나는 경우를 위한 보조 매칭: 첫 선택지로만 찾기
  for (const it of d.items) for (const q of it.questions) {
    if (q.choices[0].replace(/\s/g, '') === firstChoiceText.replace(/^\d/, '').replace(/\s/g, '') &&
        (stemText || '').replace(/\s/g, '').includes((q.stem || '').slice(0, 3).replace(/\s/g, ''))) return q;
  }
  throw new Error('화면의 문항을 데이터에서 찾지 못함: ' + stemText);
}

test('단어 오답노트: 사이클 → 몰랐던 단어 다시 풀기 → 새 사이클', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { renderVocab } = await import('../js/vocab.js');
  const { addWord, allWords } = await import('../js/words.js');
  for (let i = 0; i < 25; i++) await addWord({ word: `単語${i}`, reading: `よみ${i}`, meaning: `뜻${i}` });
  assert.equal((await addWord({ word: '単語0', reading: 'よみ0' })).added, false, '중복 단어는 추가되지 않음');
  assert.equal((await allWords()).length, 25);

  await renderVocab(view);
  await clickBtn('시작');
  await waitFor(() => /1 \/ 10/.test(bodyText()), '1 / 10');

  // 앞 3개 몰라요, 나머지 7개 알아요
  for (let i = 0; i < 10; i++) {
    await waitFor(() => new RegExp(`${i + 1} / 10`).test(bodyText()) || bodyText().includes('사이클 완료'), `카드 ${i + 1}`);
    // 카드를 눌러 뜻 공개
    document.querySelector('.vcard').click();
    assert.ok(document.querySelector('.vcard .meaning'), '카드를 누르면 뜻이 보임');
    await clickBtn(i < 3 ? '몰라요' : '알아요');
  }
  await waitFor(() => bodyText().includes('알아요 7 · 몰라요 3'), '사이클 결과');
  assert.ok(btn('몰랐던 단어 다시 풀기') && btn('새로운 사이클로 다시 풀기'), '두 버튼이 모두 보임');

  await clickBtn('몰랐던 단어 다시 풀기');
  await waitFor(() => /1 \/ 3/.test(bodyText()), '다시 풀기 1 / 3');
  assert.match(bodyText(), /다시 풀기 2차/);
  await clickBtn('알아요');
  await clickBtn('몰라요');
  await waitFor(() => /3 \/ 3/.test(bodyText()), '3 / 3');
  await clickBtn('알아요');
  await waitFor(() => bodyText().includes('알아요 2 · 몰라요 1'), '2차 결과');

  await clickBtn('몰랐던 단어 다시 풀기'); // 또 모르는 1개만
  await waitFor(() => /1 \/ 1/.test(bodyText()), '3차 1 / 1');
  await clickBtn('알아요');
  await waitFor(() => bodyText().includes('모두 알고 있었어요'), '모두 알게 됨');
  assert.ok(btn('몰랐던 단어 다시 풀기').disabled, '몰랐던 단어가 없으면 비활성');

  await clickBtn('새로운 사이클로 다시 풀기');
  await waitFor(() => /1 \/ 10/.test(bodyText()), '새 사이클 1 / 10');
});

test('마크업과 sanitizer', { skip: !JSDOM }, async () => {
  await setup();
  const { fmt, plain, sanitizeHtml } = await import('../js/util.js');
  assert.equal(fmt('<b>[[賛成]]</b>\n{漢字|かんじ}'), '&lt;b&gt;<u>賛成</u>&lt;/b&gt;<br><ruby>漢字<rt>かんじ</rt></ruby>');
  assert.equal(plain('[[賛成]]と{漢字|かんじ}'), '賛成と漢字');
  const clean = sanitizeHtml('<table onclick="x()"><tr><td><a href="javascript:alert(1)">a</a><script>x</script></td></tr></table>');
  assert.ok(!/script|onclick|javascript:/i.test(clean), clean);
});
