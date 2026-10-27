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
  // 테스트끼리 저장 데이터가 섞이지 않도록 매번 초기화
  const { resetAll } = await import('../js/storage.js');
  await resetAll();
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
    assert.ok(document.querySelector('.jp-note'), '일본어 해설(포인트)은 바로 보여야 함');
    if (n === 0) {
      // 한국어 해석은 기본 숨김 → 버튼을 눌러야 보인다
      const ko = document.querySelector('.ko');
      assert.ok(ko && ko.hidden, '한국어 해석은 기본으로 숨겨져 있어야 함');
      assert.ok(btn('한국어 해석 보기'));
      btn('한국어 해석 보기').click();
      assert.equal(ko.hidden, false);
      assert.ok(btn('한국어 해석 숨기기'));
      assert.ok(q.explanation.choice_meanings.every(m => ko.textContent.includes(m)), '선택지 4개의 한국어 뜻이 보여야 함');
      assert.ok(ko.textContent.includes(q.explanation.point_ko), '포인트의 한국어판이 보여야 함');
      assert.ok(ko.textContent.includes(q.explanation.translation), '한국어 번역이 보여야 함');
      btn('한국어 해석 숨기기').click();
      assert.equal(ko.hidden, true);
    }
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

const segBtn = label => [...document.querySelectorAll('.seg button')].find(b => b.textContent.trim().startsWith(label));

test('한자만 저장하면 미완성으로 표시되고, 목록에서 미완성만 모아 볼 수 있다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { renderVocab } = await import('../js/vocab.js');
  const { addWord, allWords, isIncomplete } = await import('../js/words.js');
  await addWord({ word: '納める' });                                         // 한자만 → 미완성
  await addWord({ word: 'うっかり', meaning: '깜빡' });                       // 한자 없음 + 뜻 있음 → 완성
  await addWord({ word: '更新', reading: 'こうしん', meaning: '갱신' });       // 완성
  await addWord({ word: '提供', meaning: '제공' });                           // 한자인데 읽기 없음 → 미완성
  assert.deepEqual((await allWords()).map(isIncomplete), [true, false, false, true]);

  await renderVocab(view);
  segBtn('목록').click();
  await waitFor(() => document.querySelector('.word'), '목록');
  assert.equal(document.querySelectorAll('.word .badge').length, 2);
  segBtn('미완성').click();
  await waitFor(() => document.querySelectorAll('.word').length === 2, '미완성 필터');
  assert.deepEqual([...document.querySelectorAll('.word .w')].map(e => e.textContent).sort(), ['提供', '納める']);
  segBtn('전체').click();
  await waitFor(() => document.querySelectorAll('.word').length === 4, '전체 필터');

  // 일괄 추가: 단어만 적은 줄도 허용
  segBtn('추가').click();
  await waitFor(() => document.querySelector('textarea'), '추가 화면');
  document.querySelector('textarea').value = '提出\n返却, へんきゃく, 반납';
  await clickBtn('일괄 추가');
  await waitFor(async () => true, '대기');
  await sleep(50);
  const words = await allWords();
  assert.equal(words.length, 6);
  assert.equal(isIncomplete(words.find(w => w.word === '提出')), true);
  assert.equal(isIncomplete(words.find(w => w.word === '返却')), false);

  // 학습 카드: 미완성 단어는 뜻을 공개한 뒤 '입력하기' 버튼이 나온다
  segBtn('학습').click();
  await clickBtn('시작');
  await waitFor(() => document.querySelector('.vcard .word-big'), '카드');
  const shown = document.querySelector('.vcard .word-big').textContent;
  document.querySelector('.vcard').click();
  assert.equal(!!btn('✏️ 읽기·뜻 입력하기'), isIncomplete(words.find(w => w.word === shown)));
});

test('nihongokanji 연결은 한자 한 글자 단위이고, 그 사이트 주소만 저장한다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { kanjiChips, validLink, searchUrl } = await import('../js/kanji.js');
  const { kanjiOf } = await import('../js/words.js');
  const { load, exportAll } = await import('../js/storage.js');

  assert.deepEqual(kanjiOf('納める'), ['納']);
  assert.deepEqual(kanjiOf('入り口'), ['入', '口']);
  assert.deepEqual(kanjiOf('時々'), ['時'], '반복 기호 々 는 한자로 세지 않음');
  assert.deepEqual(kanjiOf('更新更'), ['更', '新'], '중복 제거');
  assert.deepEqual(kanjiOf('うっかり'), []);
  assert.equal(kanjiChips('うっかり'), null, '한자가 없으면 칩도 없음');

  assert.equal(validLink(' https://nihongokanji.com/8 '), 'https://nihongokanji.com/8');
  for (const bad of ['http://nihongokanji.com/8', 'https://nihongokanji.com.evil.com/8', 'https://example.com/nihongokanji.com', 'javascript:alert(1)', 'abc', '']) {
    assert.equal(validLink(bad), null, bad);
  }

  const box = kanjiChips('更新');
  view.append(box);
  await waitFor(() => box.querySelectorAll('.kchip').length === 2, '칩');
  assert.deepEqual([...box.querySelectorAll('.kchip')].map(b => b.textContent), ['更', '新'], '단어 전체가 아니라 한 글자씩');

  // 주소가 없으면 구글 사이트 검색으로 연결
  box.querySelector('.kchip').click();
  let link = await waitFor(() => document.querySelector('.modal a.btn'), '시트');
  assert.equal(link.href, searchUrl('更'));
  assert.match(link.href, /google\.com\/search\?q=site%3Anihongokanji\.com/);
  assert.equal(link.target, '_blank');
  assert.match(link.rel, /noopener/);

  // 다른 사이트 주소는 저장 거부(시트는 그대로)
  const input = document.querySelector('.modal input');
  input.value = 'https://evil.example.com/8';
  await clickBtn('주소 저장');
  await waitFor(() => document.getElementById('toast').textContent.includes('nihongokanji.com'), '거부 안내');
  assert.ok(document.querySelector('.modal'), '거부되면 시트가 닫히지 않음');
  assert.equal((await load('kanjiLinks'))['更'], undefined);

  // 올바른 주소는 저장되고, 다음부터는 바로 그 주소로 연결
  input.value = 'https://nihongokanji.com/123';
  await clickBtn('주소 저장');
  await waitFor(() => !document.querySelector('.modal'), '시트 닫힘');
  assert.equal((await load('kanjiLinks'))['更'], 'https://nihongokanji.com/123');
  await waitFor(() => view.querySelector('.kchip.saved'), '저장 표시');
  assert.equal(view.querySelectorAll('.kchip.saved').length, 1, '저장한 한자만 표시');
  view.querySelector('.kchip.saved').click();
  link = await waitFor(() => document.querySelector('.modal a.btn'), '시트 다시 열기');
  assert.equal(link.href, 'https://nihongokanji.com/123');
  assert.equal(link.textContent, 'nihongokanji에서 보기');
  assert.equal((await exportAll()).data.kanjiLinks['更'], 'https://nihongokanji.com/123', '백업에 포함');

  await clickBtn('주소 삭제');
  await waitFor(() => !document.querySelector('.modal'), '삭제 후 닫힘');
  assert.equal((await load('kanjiLinks'))['更'], undefined);
});

test('문제 화면에서 글자를 선택하면 추가 바가 뜨고 오답노트(미완성)로 저장된다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { renderQuizHome } = await import('../js/quiz.js');
  const { initSelectionBar, refreshSelectionBar } = await import('../js/select.js');
  const { allWords, isIncomplete } = await import('../js/words.js');
  initSelectionBar();
  document.body.dataset.route = 'quiz';
  await renderQuizHome(view);
  await clickBtn('시작');
  await waitFor(() => document.querySelector('.choice'), '선택지');
  const bar = document.getElementById('selbar');
  assert.equal(bar.hidden, true);

  const select = node => {
    const r = document.createRange(); r.selectNodeContents(node);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  };
  const span = document.querySelector('.choice span');
  const expected = span.textContent.replace(/\s/g, '');
  select(span);
  refreshSelectionBar();
  assert.equal(bar.hidden, false);
  assert.equal(bar.querySelector('.selbar-text').textContent, `「${expected}」`);

  // 글자를 고르던 직후의 탭은 정답 선택으로 처리되지 않는다
  document.querySelector('.choice').click();
  assert.equal(document.querySelector('.banner'), null);

  await clickBtn('＋ 오답노트에 추가');
  await waitFor(() => bar.hidden, '바 숨김');
  const words = await allWords();
  assert.equal(words.length, 1);
  assert.equal(words[0].word, expected);
  assert.equal(words[0].source, 'select');
  assert.equal(words[0].meaning, '', '읽기·뜻은 비워 둠');
  assert.equal(isIncomplete(words[0]), !!words[0].word.match(/[一-鿿]/) || true);

  // 너무 긴 선택, 문제 화면이 아닌 곳에서의 선택은 무시
  select(document.querySelector('.card'));
  refreshSelectionBar();
  assert.equal(bar.hidden, true, '30자를 넘는 선택은 무시');
  document.body.dataset.route = 'vocab';
  select(span);
  refreshSelectionBar();
  assert.equal(bar.hidden, true, '문제 화면이 아니면 바가 뜨지 않음');
  document.body.dataset.route = 'quiz';

  // 시간이 지난 뒤의 탭은 정상적으로 답 선택
  window.getSelection().removeAllRanges();
  await sleep(700);
  document.querySelector('.choice').click();
  await waitFor(() => document.querySelector('.banner'), '해설 배너');
});

test('한자 카드: 목록에서 열고, 오답노트 한자 칩에서도 카드가 열린다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { renderKanjiList } = await import('../js/kanjilist.js');
  const { kanjiChips } = await import('../js/kanji.js');
  await renderKanjiList(view);
  assert.equal(document.querySelectorAll('.kcell').length, 80, '1학년 80자');
  const gradeBtn = n => [...document.querySelectorAll('.seg button')].find(b => b.textContent.startsWith(`${n}학년`));
  gradeBtn(2).click();
  await waitFor(() => document.querySelectorAll('.kcell').length === 160, '2학년 160자');
  gradeBtn(3).click();
  await waitFor(() => document.querySelectorAll('.kcell').length === 200, '3학년 200자');
  gradeBtn(4).click();
  await waitFor(() => document.querySelectorAll('.kcell').length === 220, '4학년 220자');
  gradeBtn(5).click();
  await waitFor(() => document.querySelectorAll('.kcell').length === 185, '5학년 185자');
  gradeBtn(6).click();
  await waitFor(() => document.querySelectorAll('.kcell').length === 181, '6학년 181자');
  gradeBtn(1).click();
  await waitFor(() => document.querySelectorAll('.kcell').length === 80, '다시 1학년');
  const cell = [...document.querySelectorAll('.kcell')].find(b => b.querySelector('.kk').textContent === '休');
  assert.ok(cell.textContent.includes('쉴 휴'));
  cell.click();
  await waitFor(() => document.querySelector('.modal .kcard'), '카드');
  const card = document.querySelector('.modal .kcard').textContent;
  for (const t of ['쉴 휴', 'キュウ', 'やす・む', '6획', '1학년', '休日', '휴일']) assert.ok(card.includes(t), t);
  assert.ok(document.querySelector('.modal a.btn').href.includes('nihongokanji.com'), '카드 아래에 nihongokanji 연결');
  await clickBtn('닫기');

  // 오답노트의 한자 칩 → 같은 카드. 카드가 없는 한자(更)는 기존처럼 연결 시트만
  const box = kanjiChips('休む更'); view.append(box);
  await waitFor(() => box.querySelectorAll('.kchip').length === 2, '칩');
  box.querySelectorAll('.kchip')[0].click();
  await waitFor(() => document.querySelector('.modal .kcard'), '칩에서 카드');
  await clickBtn('닫기');
  box.querySelectorAll('.kchip')[1].click();
  await waitFor(() => document.querySelector('.modal a.btn'), '카드 없는 한자 시트');
  assert.equal(document.querySelector('.modal .kcard'), null);
});

test('한자 카드가 있는 한자 한 글자는 미완성이 아니라 카드와 연결된다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { loadKanjiDb } = await import('../js/kanjidb.js');
  await loadKanjiDb();
  const { renderVocab } = await import('../js/vocab.js');
  const { addWord, allWords, isIncomplete, shown, cardFor } = await import('../js/words.js');
  await addWord({ word: '休' });                              // 카드 있음
  await addWord({ word: '更' });                              // 카드 없음
  await addWord({ word: '休む' });                            // 두 글자 이상은 카드로 못 채움
  await addWord({ word: '日', reading: 'にち', meaning: '날' }); // 직접 입력이 우선
  const [a, b, c, d] = await allWords();
  assert.ok(cardFor(a) && !cardFor(b) && !cardFor(c));
  assert.deepEqual([a, b, c, d].map(isIncomplete), [false, true, true, false]);
  assert.ok(shown(a).reading.includes('キュウ') && shown(a).reading.includes('やす・む'));
  assert.ok(shown(a).meaning.startsWith('쉴 휴') && shown(a).meaning.includes('쉬다'));
  assert.equal(shown(d).reading, 'にち'); assert.equal(shown(d).meaning, '날');
  assert.equal(a.reading, '', '저장된 값은 비어 있고, 화면에서만 카드로 채움');

  await renderVocab(view);
  [...document.querySelectorAll('.seg button')].find(x => x.textContent.startsWith('목록')).click();
  await waitFor(() => document.querySelector('.word'), '목록');
  const row = [...document.querySelectorAll('.word')].find(r => r.querySelector('.w').textContent === '休');
  assert.ok(row.querySelector('.badge.link'), '카드 연결 배지');
  assert.equal(row.querySelector('.badge:not(.link)'), null, '미완성 배지는 없음');
  assert.ok(row.textContent.includes('쉴 휴'));
  const todo = [...document.querySelectorAll('.seg button')].find(x => x.textContent.startsWith('미완성'));
  assert.ok(todo.textContent.includes('2'), '미완성은 更, 休む 두 개');
});

test('문제 화면에서 한자 한 글자를 선택하면 「한자 카드」 버튼이 뜬다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { loadKanjiDb } = await import('../js/kanjidb.js');
  await loadKanjiDb();
  const { initSelectionBar, refreshSelectionBar } = await import('../js/select.js');
  initSelectionBar();
  document.body.dataset.route = 'quiz';
  const p = document.createElement('p'); p.textContent = '休日に更新する'; view.replaceChildren(p);
  const select = (start, end) => {
    const r = document.createRange(); r.setStart(p.firstChild, start); r.setEnd(p.firstChild, end);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    refreshSelectionBar();
  };
  const bar = document.getElementById('selbar');
  const cardBtn = [...bar.querySelectorAll('button')].find(b => b.textContent === '한자 카드');
  select(0, 1);                       // 休
  assert.equal(bar.hidden, false); assert.equal(cardBtn.hidden, false);
  select(3, 4);                       // 更 (5학년, 아직 카드 없음)
  assert.equal(bar.hidden, false); assert.equal(cardBtn.hidden, true, '카드가 없는 한자에는 버튼 없음');
  select(0, 2);                       // 休日 (두 글자)
  assert.equal(cardBtn.hidden, true);
  select(0, 1);
  cardBtn.click();
  await waitFor(() => document.querySelector('.modal .kcard'), '카드 열림');
  assert.ok(document.querySelector('.modal .kcard').textContent.includes('쉴 휴'));
  assert.equal(bar.hidden, true, '카드를 열면 바는 닫힘');
});

test('마크업과 sanitizer', { skip: !JSDOM }, async () => {
  await setup();
  const { fmt, plain, sanitizeHtml } = await import('../js/util.js');
  assert.equal(fmt('<b>[[賛成]]</b>\n{漢字|かんじ}'), '&lt;b&gt;<u>賛成</u>&lt;/b&gt;<br><ruby>漢字<rt>かんじ</rt></ruby>');
  assert.equal(plain('[[賛成]]と{漢字|かんじ}'), '賛成と漢字');
  const clean = sanitizeHtml('<table onclick="x()"><tr><td><a href="javascript:alert(1)">a</a><script>x</script></td></tr></table>');
  assert.ok(!/script|onclick|javascript:/i.test(clean), clean);
});
