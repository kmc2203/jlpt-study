// 화면 동작 스모크 테스트 (jsdom). `npm install` 후 `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); } catch { /* jsdom 없으면 건너뜀 */ }

const { todayStr } = await import('../js/util.js').catch(() => ({ todayStr: () => '' }));
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
        const body = JSON.parse(txt);
        // 실제 manifest 는 매일 공개가 늘어 풀이 소진될 수 있으니, 테스트에서는 일부만 공개된 상태로 고정한다
        if (String(url) === 'data/manifest.json') {
          body.released = Object.fromEntries(Object.entries(body.released).sort().slice(0, 24));
        }
        return { ok: true, status: 200, json: async () => body };
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
  const reviewBtns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '복습 시작');
  assert.equal(reviewBtns.length, 2, '오늘의 복습 + 틀린 문제 복습');
  assert.ok(reviewBtns[0].disabled, '방금 틀린 문제의 간격 복습은 내일부터');
  assert.ok(!reviewBtns[1].disabled, '틀린 문제 복습 가능');
  const p2 = await load('progress');
  const { addDays } = await import('../js/util.js');
  assert.ok(Object.keys(p2.wrong).every(id => p2.srs[id]?.step === 0 && p2.srs[id].due === addDays(todayStr(), 1)), '틀린 문제는 하루 뒤 복습 일정');

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
  const gradeBtn = n => [...document.querySelectorAll('.seg button')].find(b => b.textContent.startsWith(n === 8 ? '중·고' : `${n}학년`));
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
  gradeBtn(8).click();
  await waitFor(() => document.querySelectorAll('.kcell').length === 1110, '중·고 전체 1110자');
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

  // 오답노트의 한자 칩 → 같은 카드. 카드가 없는 한자(凛, 상용한자 밖)는 기존처럼 연결 시트만
  const box = kanjiChips('休む凛'); view.append(box);
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
  await addWord({ word: '凛' });                              // 카드 없음
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
  assert.ok(todo.textContent.includes('2'), '미완성은 凛, 休む 두 개');
});

test('문제 화면에서 한자 한 글자를 선택하면 「한자 카드」 버튼이 뜬다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { loadKanjiDb } = await import('../js/kanjidb.js');
  await loadKanjiDb();
  const { initSelectionBar, refreshSelectionBar } = await import('../js/select.js');
  initSelectionBar();
  document.body.dataset.route = 'quiz';
  const p = document.createElement('p'); p.textContent = '休日に凛とする'; view.replaceChildren(p);
  const select = (start, end) => {
    const r = document.createRange(); r.setStart(p.firstChild, start); r.setEnd(p.firstChild, end);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    refreshSelectionBar();
  };
  const bar = document.getElementById('selbar');
  const cardBtn = [...bar.querySelectorAll('button')].find(b => b.textContent === '한자 카드');
  select(0, 1);                       // 休
  assert.equal(bar.hidden, false); assert.equal(cardBtn.hidden, false);
  select(3, 4);                       // 凛 (상용한자 밖이라 카드 없음)
  assert.equal(bar.hidden, false); assert.equal(cardBtn.hidden, true, '카드가 없는 한자에는 버튼 없음');
  select(0, 2);                       // 休日 (두 글자)
  assert.equal(cardBtn.hidden, true);
  select(0, 1);
  cardBtn.click();
  await waitFor(() => document.querySelector('.modal .kcard'), '카드 열림');
  assert.ok(document.querySelector('.modal .kcard').textContent.includes('쉴 휴'));
  assert.equal(bar.hidden, true, '카드를 열면 바는 닫힘');

  // 카드를 닫으면 방금 고른 글자가 그대로 선택돼 있고 바도 다시 뜬다
  await clickBtn('닫기');
  await waitFor(() => !bar.hidden, '카드를 닫은 뒤 바 복귀');
  assert.equal(window.getSelection().toString(), '休', '선택 유지');
  assert.ok(bar.textContent.includes('休'));
  assert.equal(cardBtn.hidden, false);
  // 안드로이드가 선택을 풀어 버려도 바와 글자는 유지된다
  window.getSelection().removeAllRanges();
  document.dispatchEvent(new window.Event('selectionchange'));
  await sleep(300);
  assert.equal(bar.hidden, false, '선택이 풀려도 바는 유지');
  // 화면의 다른 곳을 누르면 평소처럼 사라진다
  p.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  await waitFor(() => bar.hidden, '다른 곳을 누르면 바 사라짐');
});

test('문제 화면에 급수(N5~N2) 배지가 표시된다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { renderQuizHome } = await import('../js/quiz.js');
  await renderQuizHome(view);
  await clickBtn('시작');
  await waitFor(() => document.querySelector('.choice'), '선택지');
  const lv = document.querySelector('.tag.lv');
  assert.ok(lv && /^N[2-5]$/.test(lv.textContent), '급수 배지: ' + lv?.textContent);
});

test('통계: 약한 유형이 맨 위에 오고, 집중 풀기로 해당 유형 문제가 시작된다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { load, commit } = await import('../js/storage.js');
  const { renderStats } = await import('../js/stats.js');
  const p = await load('progress');
  p.stats = { grammar: { n: 10, ok: 3 }, kanji_reading: { n: 10, ok: 9 }, synonym: { n: 2, ok: 0 } };
  p.recent = { grammar: [0, 0, 1, 0, 1, 0, 0, 1, 0, 0] };
  p.days[todayStr()] = 22;
  await commit('progress');
  await renderStats(view);
  const rows = [...view.querySelectorAll('.bars')][0].children;
  assert.match(rows[0].textContent, /문법 형식/, '가장 약한 유형이 맨 위');
  assert.match(view.textContent, /보강 필요/); assert.match(view.textContent, /강점/); assert.match(view.textContent, /표본 부족/);
  assert.match(view.textContent, /지금 보강할 곳/);
  assert.ok(view.querySelector('.rx')?.textContent.includes('문법 형식'), '처방 카드에 문법 형식');
  assert.ok(view.textContent.includes('급수별 정답률'));
  // 집중 풀기 → 퀴즈 홈이 같은 유형 문제로 바로 시작
  const { renderQuizHome } = await import('../js/quiz.js');
  [...view.querySelectorAll('.rx button')][0].click();
  assert.equal(window.location.hash, '#/quiz');
  await renderQuizHome(view);
  await waitFor(() => document.querySelector('.choice'), '집중 풀기 첫 문제');
  assert.match(document.querySelector('.tag:not(.lv)').textContent, /문법 형식/);
});

test('통계: 분석용 요약에는 유형·급수·단어가 들어가고 개인 식별 정보는 없다', { skip: !JSDOM }, async () => {
  await setup();
  const { load, commit } = await import('../js/storage.js');
  const { computeStats, buildSummary } = await import('../js/stats.js');
  const { loadData } = await import('../js/data.js');
  const { addWord, allWords } = await import('../js/words.js');
  const d = await loadData();
  const first = d.items[0];
  const p = await load('progress');
  p.stats = { [first.type]: { n: 4, ok: 1 } };
  p.done[first.id] = { at: 1, res: first.questions.map(() => false) };
  p.wrong[first.id] = true;
  await commit('progress');
  await addWord({ word: '納める', reading: 'おさめる', meaning: '납부하다', source: 'quiz:' + first.id });
  const st = computeStats(p, d, await allWords());
  const sum = buildSummary(st, await allWords(), d);
  assert.equal(sum.byType[0].type, first.type);
  assert.ok(sum.byLevel[first.level || 'N2'].n >= 1);
  assert.equal(sum.wordsSavedWhileSolvingByType[first.type], 1);
  assert.equal(sum.words[0].word, '納める');
  assert.ok(!JSON.stringify(sum).includes('@'), '이메일 등 식별 정보 없음');
});

test('마크업과 sanitizer', { skip: !JSDOM }, async () => {
  await setup();
  const { fmt, plain, sanitizeHtml } = await import('../js/util.js');
  assert.equal(fmt('<b>[[賛成]]</b>\n{漢字|かんじ}'), '&lt;b&gt;<u>賛成</u>&lt;/b&gt;<br><ruby>漢字<rt>かんじ</rt></ruby>');
  assert.equal(plain('[[賛成]]と{漢字|かんじ}'), '賛成と漢字');
  const clean = sanitizeHtml('<table onclick="x()"><tr><td><a href="javascript:alert(1)">a</a><script>x</script></td></tr></table>');
  assert.ok(!/script|onclick|javascript:/i.test(clean), clean);
});

/* ───────── 간격 복습 · 조각 배열 · 모의고사 · 신고 · 해설 한자 ───────── */
const typeSelect = () => [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.textContent === '전체 유형'));
const findItem = (d, type) => d.items.find(i => i.type === type);

test('간격 복습: 일정이 오늘인 문제만 오늘의 복습에 뜨고, 맞히면 다음 단계로 간다', { skip: !JSDOM }, async () => {
  await setup();
  await sleep(650);   // 앞 테스트의 글자 선택 직후 탭 방지(600ms)가 끝나길 기다린다
  const { load, commit } = await import('../js/storage.js');
  const { loadData, srsDue, SRS_STEPS } = await import('../js/data.js');
  const { addDays } = await import('../js/util.js');
  const d = await loadData();
  const p = await load('progress');
  const [a, b, c] = d.items;
  const today = todayStr();
  p.wrong[a.id] = true;                                        // 일정 없는 기존 틀린 문제 → 오늘 복습
  p.wrong[b.id] = true; p.srs[b.id] = { step: 1, due: addDays(today, 2) };   // 아직 아님
  p.srs[c.id] = { step: 0, due: addDays(today, -1) };          // 이미 맞힌 뒤의 후속 복습, 도래
  assert.deepEqual(srsDue(d, p, today).map(i => i.id).sort(), [a.id, c.id].sort());
  assert.deepEqual(SRS_STEPS, [1, 3, 7, 14, 30]);
  await commit('progress');

  const { renderQuizHome } = await import('../js/quiz.js');
  const view = document.getElementById('view');
  await renderQuizHome(view);
  assert.match(view.textContent, /복습할 문제 2개/);
  // c 를 전부 맞히면 다음 단계(3일 뒤)
  const dueBtn = [...view.querySelectorAll('button')].filter(x => x.textContent.trim() === '복습 시작')[0];
  dueBtn.click();
  for (let guard = 0; guard < 40; guard++) {
    await waitFor(() => document.querySelector('.choice') || document.querySelector('.piece') || bodyText().includes('수고했어요'), '문제');
    if (bodyText().includes('수고했어요')) break;
    const sel = document.querySelector('.stem')?.textContent;
    const all = d.items.flatMap(i => i.questions);
    const q = all.find(x => document.querySelector('.stem')?.textContent.replace(/[\s　]/g, '') === x.stem.replace(/\[\[|\]\]/g, '').replace(/\{([^{}|]+)\|[^{}]+\}/g, '$1').replace(/[\s　]/g, '') || false);
    if (document.querySelector('.piece')) { await setupArrangeOff(); }
    const choices = [...document.querySelectorAll('.choice')];
    if (!choices.length) throw new Error('선택지 없음: ' + sel);
    const right = (q || findQuestion(d, sel, choices[0].textContent)).answer;
    choices[right].click();
    await waitFor(() => document.querySelector('.banner'), '해설');
    await clickBtn(btn('다음 문제') ? '다음 문제' : '결과 보기');
  }
  const p2 = await load('progress');
  assert.equal(p2.srs[c.id]?.step, 1, '맞히면 다음 단계');
  assert.equal(p2.srs[c.id]?.due, addDays(todayStr(), SRS_STEPS[1]));
  assert.equal(p2.wrong[a.id], undefined, '다 맞히면 틀린 문제 목록에서 빠짐');
  assert.equal(p2.srs[a.id], undefined, '일정이 없던 문제는 일정도 안 생김');
  async function setupArrangeOff() { throw new Error('이 테스트는 조각 배열 문제를 쓰지 않는 문제만 고른다'); }
});

test('★ 문장 완성: 조각을 눌러 배열하면 정답 처리되고, 끄면 선택지 방식으로 돌아간다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { loadData } = await import('../js/data.js');
  const { load } = await import('../js/storage.js');
  const d = await loadData();
  const item = findItem(d, 'sentence_order');
  const q = item.questions[0];
  const { renderQuizHome } = await import('../js/quiz.js');
  const { default: _ } = { default: 0 };
  // 이 문제만 풀도록 '더 풀기'는 못 쓰니, 풀의 sentence_order 가 나올 때까지 유형을 골라 시작
  await renderQuizHome(view);
  const sel = typeSelect();
  sel.value = 'sentence_order'; sel.dispatchEvent(new window.Event('change'));
  [...document.querySelectorAll('select')].at(-1).value = '5';
  await clickBtn('더 풀기');
  await waitFor(() => document.querySelector('.piece'), '조각');
  assert.equal(document.querySelectorAll('.piece').length, 4);
  assert.equal(document.querySelector('.choice'), null, '선택지 방식이 아님');
  const stemText = document.querySelector('.stem').textContent;
  const owner = d.items.find(i => i.type === 'sentence_order' && i.questions.some(x => x.choices.every(c => document.body.textContent.includes(c.replace(/\[\[|\]\]/g, '')))));
  const cur = owner.questions.find(x => x.choices.every(c => document.body.textContent.includes(c.replace(/\[\[|\]\]/g, ''))));
  assert.ok(btn('확인').disabled, '다 채우기 전엔 확인 불가');
  const pieces = [...document.querySelectorAll('.piece')];
  // 일부러 한 칸 틀리게: 정답 순서에서 앞 두 조각을 바꿔 넣는다
  const wrongOrder = [...cur.order]; [wrongOrder[0], wrongOrder[1]] = [wrongOrder[1], wrongOrder[0]];
  for (const i of wrongOrder) pieces[i].click();
  assert.ok(!btn('확인').disabled);
  // 넣은 조각을 눌러 빼고 다시 올바르게
  document.querySelectorAll('.slot.arr')[0].click();
  assert.ok(btn('확인').disabled, '조각을 빼면 다시 비활성');
  document.querySelectorAll('.slot.arr')[1].click();
  for (const i of [cur.order[0], cur.order[1]]) pieces[i].click();
  btn('확인').click();
  await waitFor(() => document.querySelector('.banner'), '해설');
  assert.match(document.querySelector('.banner').textContent, /정답/);
  assert.equal(document.querySelectorAll('.slot.arr.right').length, 4);
  assert.ok(stemText.includes('★'));
  const p = await load('progress');
  assert.equal(p.stats.sentence_order.n, 1);
});

test('★ 문장 완성: 틀리게 배열하면 오답이고, 선택지 방식 전환 버튼이 있다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { loadData } = await import('../js/data.js');
  const d = await loadData();
  const { renderQuizHome } = await import('../js/quiz.js');
  await renderQuizHome(view);
  const sel = typeSelect();
  sel.value = 'sentence_order'; sel.dispatchEvent(new window.Event('change'));
  await clickBtn('더 풀기');
  await waitFor(() => document.querySelector('.piece'), '조각');
  const cur = d.items.filter(i => i.type === 'sentence_order').flatMap(i => i.questions)
    .find(x => x.choices.every(c => document.body.textContent.includes(c.replace(/\[\[|\]\]/g, ''))));
  const pieces = [...document.querySelectorAll('.piece')];
  const bad = [...cur.order].reverse();
  for (const i of bad) pieces[i].click();
  btn('확인').click();
  await waitFor(() => document.querySelector('.banner'), '해설');
  assert.match(document.querySelector('.banner').textContent, /오답/);
  assert.ok(document.querySelectorAll('.slot.arr.miss').length >= 1);
  await clickBtn('다음 문제').catch(() => {});
});

test('모의고사: 시험 비율로 구성되고, 풀이 중엔 해설이 없고, 끝나면 영역별 결과와 목표 비교가 나온다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { loadData, buildExam, groupOf } = await import('../js/data.js');
  const { load } = await import('../js/storage.js');
  const d = await loadData();
  const progress = await load('progress');
  const exam = buildExam(d, progress, 20, () => 0.5);
  const qn = exam.reduce((a, i) => a + i.questions.length, 0);
  assert.ok(qn >= 18 && qn <= 24, '문항 수 ' + qn);
  const order = exam.map(i => ['vocab', 'grammar', 'reading'].indexOf(groupOf(i.type)));
  assert.deepEqual(order, [...order].sort(), '어휘 → 문법 → 독해 순');
  assert.equal(new Set(exam.map(i => i.id)).size, exam.length, '중복 없음');

  const { renderQuizHome } = await import('../js/quiz.js');
  await renderQuizHome(view);
  const examSelect = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent.includes('분')));
  examSelect.value = '10';
  const startBtn = examSelect.parentElement.parentElement.querySelector('button');
  startBtn.click();
  let n = 0;
  for (let guard = 0; guard < 60; guard++) {
    await waitFor(() => document.querySelector('.choice') || bodyText().includes('모의고사 결과'), '문제 또는 결과');
    if (bodyText().includes('모의고사 결과')) break;
    assert.ok(document.getElementById('examTimer'), '타이머 표시');
    document.querySelectorAll('.choice')[0].click();
    assert.equal(document.querySelector('.choice.correct'), null, '모의고사에서는 정답 표시 없음');
    assert.equal(document.querySelector('.banner'), null, '해설 없음');
    n++;
    await sleep(300);
  }
  await waitFor(() => bodyText().includes('모의고사 결과'), '결과');
  assert.ok(n >= 8);
  assert.match(bodyText(), /목표와 비교/);
  assert.match(bodyText(), /문자·어휘|문법|독해/);
  await waitFor(() => /60%/.test(document.getElementById('examTarget')?.textContent || ''), '목표 표시');
  assert.match(document.getElementById('examTarget').textContent, /달성|미달/);
  const p = await load('progress');
  assert.ok(Object.keys(p.done).length >= 1, '푼 기록은 일반 풀이와 같이 남음');
});

test('문제 신고: 저장되고, 이슈 주소에 문제 정보가 담긴다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { load } = await import('../js/storage.js');
  const { reportIssueUrl, REPORT_REASONS } = await import('../js/quiz.js');
  const { loadData } = await import('../js/data.js');
  const d = await loadData();
  const it = d.items[0];
  const u = new URL(reportIssueUrl(it, 0, REPORT_REASONS[0], '정답이 둘이에요'));
  assert.equal(u.hostname, 'github.com');
  assert.match(u.pathname, /^\/kmc2203\/jlpt-study\/issues\/new$/);
  assert.ok(u.searchParams.get('title').startsWith('[문제 신고] ' + it.id));
  assert.ok(u.searchParams.get('body').includes(it.questions[0].choices[0]));
  assert.ok(u.searchParams.get('body').includes('정답이 둘이에요'));

  const { renderQuizHome } = await import('../js/quiz.js');
  await renderQuizHome(view);
  await clickBtn('시작');
  await waitFor(() => document.querySelector('.choice'), '문제');
  document.querySelector('.choice').click();
  await waitFor(() => btn('🚩 문제 신고'), '신고 버튼');
  btn('🚩 문제 신고').click();
  await waitFor(() => document.querySelector('.modal textarea'), '신고 창');
  document.querySelector('.modal textarea').value = '어색해요';
  await clickBtn('저장만');
  await waitFor(() => !document.querySelector('.modal'), '창 닫힘');
  const r = await load('reports');
  assert.equal(r.length, 1);
  assert.equal(r[0].memo, '어색해요');
});

test('해설 속 한자(카드가 있는 것)를 누르면 한자 카드가 열린다', { skip: !JSDOM }, async () => {
  const { view } = await setup();
  const { loadKanjiDb } = await import('../js/kanjidb.js');
  await loadKanjiDb();
  const { linkKanji } = await import('../js/kanji.js');
  const box = document.createElement('div');
  box.innerHTML = '<div>休日に<ruby>勉<rt>べん</rt></ruby>強。ABC</div>';
  view.append(box);
  linkKanji(box);
  const links = [...box.querySelectorAll('.kk-link')].map(x => x.textContent);
  assert.deepEqual(links, ['休', '日', '勉', '強'].filter(k => links.includes(k)), '카드가 있는 한자만 링크');
  assert.ok(links.includes('休') && links.includes('日'));
  assert.equal(box.querySelector('rt').textContent, 'べん', '후리가나는 건드리지 않음');
  box.querySelector('.kk-link').click();
  await waitFor(() => document.querySelector('.modal .kcard'), '카드');
  await clickBtn('닫기');
});

test('알림 발송: 시간대 판정과 구독 파싱, 구독이 없으면 조용히 끝난다', async () => {
  const m = await import('../scripts/send_push.mjs');
  assert.equal(m.slotAt(new Date('2026-11-03T02:30:00Z')), 'morning');   // 11:30 KST
  assert.equal(m.slotAt(new Date('2026-11-03T06:30:00Z')), 'afternoon'); // 15:30 KST
  assert.equal(m.slotAt(new Date('2026-11-03T12:30:00Z')), 'night');     // 21:30 KST
  assert.equal(m.parseSubscriptions('').length, 0);
  assert.equal(m.parseSubscriptions('{"endpoint":"https://x","keys":{"p256dh":"a","auth":"b"}}').length, 1);
  assert.equal(m.parseSubscriptions('[{"endpoint":"https://x"},{"endpoint":"https://y","keys":{"p256dh":"a","auth":"b"}}]').length, 1, '키가 없는 구독은 버림');
  assert.ok(Object.values(m.MESSAGES).every(x => x.title && x.body));
});

test('한자 획순: 풀이 속 {요소} 는 그 획 범위와 연결되고, 재생 버튼이 동작한다', { skip: !JSDOM }, async () => {
  await setup();
  const { parseNote, strokePlayer, strokeFile } = await import('../js/strokes.js');
  assert.equal(strokeFile('愛'), 'data/strokes/06101.json'.replace('06101', '611b'.padStart(5, '0')));
  const data = JSON.parse(await fs.readFile(path.join(ROOT, strokeFile('愛')), 'utf8'));
  assert.equal(data.strokes.length, 13);
  const notes = {};
  for (const f of JSON.parse(await fs.readFile(path.join(ROOT, 'data/kanji/index.json'), 'utf8')).files) {
    Object.assign(notes, JSON.parse(await fs.readFile(path.join(ROOT, 'data/notes', f), 'utf8')).notes);
  }
  // 노트의 모든 {요소} 가 실제 획 범위로 풀려야 한다 (안 풀리면 그냥 글자로 남아 눌러도 반응이 없다)
  for (const k of ['愛', '秋', '休', '明', '学', '語', '食', '校', '安', '思']) {
    const d = JSON.parse(await fs.readFile(path.join(ROOT, strokeFile(k)), 'utf8'));
    const segs = parseNote(notes[k], d.parts);
    for (const s of segs.filter(x => typeof x !== 'string')) {
      assert.ok(s.from >= 0 && s.to < d.strokes.length && s.from <= s.to, `${k}: ${s.label} 범위`);
    }
    assert.ok(segs.some(x => typeof x !== 'string'), `${k}: 눌러볼 구성 요소가 있어야 함`);
    assert.ok(!notes[k].replace(/\{[^}]+\}/g, '').includes('{'), `${k}: 짝이 안 맞는 중괄호`);
  }
  const el = strokePlayer(data, notes['愛']);
  document.body.append(el);
  assert.match(el.querySelector('.kstroke-count').textContent, /^0 \/ 13획/, '열자마자 처음부터 재생이 시작된다');
  el.querySelector('.btn:last-of-type').click();            // 다음 획 (재생 중단 후 1획부터)
  assert.match(el.querySelector('.kstroke-count').textContent, /1 \/ 13획/);
  assert.equal(el.querySelectorAll('path.cur').length, 1);
  const part = [...el.querySelectorAll('.kpart')].find(b => b.textContent === '心');
  part.click();
  assert.equal(el.querySelectorAll('path.on').length, 4, '心 은 4획');
  part.click();
  assert.equal(el.querySelectorAll('path.on').length, 0, '다시 누르면 해제');
});
