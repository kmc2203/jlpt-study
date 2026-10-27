// 단어 오답노트 화면: 학습(사이클) / 목록 / 추가
import { h, toast, openModal } from './util.js';
import { load, commit } from './storage.js';
import { allWords, addWord, updateWord, removeWord, recordSeen, parseBulk, isIncomplete, shown, cardFor } from './words.js';
import { loadKanjiDb } from './kanjidb.js';
import { newCycle, answer, retryRound, summary, CYCLE_SIZE } from './cycle.js';
import { kanjiChips } from './kanji.js';

let tab = 'study';
let revealed = false;
let listFilter = 'all'; // 'all' | 'todo'(미완성)

/* ───────── 단어 추가/수정 모달 (문제 화면에서도 사용) ───────── */
export function openWordModal(prefill = {}, onSaved) {
  const word = h('input', { type: 'text', value: prefill.word || '', placeholder: '例) 納める' });
  const reading = h('input', { type: 'text', value: prefill.reading || '', placeholder: 'おさめる' });
  const meaning = h('input', { type: 'text', value: prefill.meaning || '', placeholder: '납부하다' });
  const body = h('div', {},
    h('label', { class: 'f' }, '단어 / 한자 / 표현'), word,
    h('label', { class: 'f' }, '읽기 (선택)'), reading,
    h('label', { class: 'f' }, '뜻 (선택)'), meaning,
    prefill.id ? null : h('div', { class: 'sub', style: 'margin-top:8px' }, '읽기와 뜻은 비워 둬도 돼요. 비어 있으면 「미완성」으로 표시되고, 나중에 채울 수 있어요.'));
  openModal(prefill.id ? '단어 수정' : '단어 오답노트에 추가', body, [
    { label: '취소' },
    { label: '저장', cls: 'primary', onClick: async () => {
      if (!word.value.trim()) { toast('단어를 입력해 주세요'); return false; }
      if (prefill.id) {
        await updateWord(prefill.id, { word: word.value, reading: reading.value, meaning: meaning.value });
        toast('수정했어요');
      } else {
        const r = await addWord({ word: word.value, reading: reading.value, meaning: meaning.value, source: prefill.source || 'manual' });
        toast(r.added ? '단어 오답노트에 저장했어요' : '이미 저장된 단어예요');
      }
      onSaved?.();
    } },
  ]);
  setTimeout(() => word.focus(), 50);
}

/* ───────── 진입점 ───────── */
export async function renderVocab(view) {
  await loadKanjiDb(); // 한자 카드와 연결된 단어의 읽기·뜻을 채우려면 먼저 필요
  const words = await allWords();
  const labels = [['study', '학습'], ['list', `목록 (${words.length})`], ['add', '추가']];
  const seg = h('div', { class: 'seg' }, ...labels.map(([k, l]) =>
    h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; revealed = false; renderVocab(view); } }, l)));
  const body = h('div');
  view.replaceChildren(seg, body);
  if (tab === 'study') await renderStudy(body, words, view);
  else if (tab === 'list') renderList(body, words, view);
  else renderAdd(body, view);
}

/* ───────── 학습 (사이클) ───────── */
function cleanse(c, byId) {
  const keep = id => byId.has(id);
  const removedBefore = c.queue.slice(0, c.idx).filter(id => !keep(id)).length;
  c.queue = c.queue.filter(keep);
  c.unknown = c.unknown.filter(keep);
  c.ids = c.ids.filter(keep);
  c.idx = Math.max(0, c.idx - removedBefore);
  if (c.idx >= c.queue.length) c.done = true;
}

async function renderStudy(body, words, view) {
  if (!words.length) {
    body.append(h('div', { class: 'card empty' }, '저장된 단어가 없어요.',
      h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: () => { tab = 'add'; renderVocab(view); } }, '단어 추가하기'))));
    return;
  }
  const byId = new Map(words.map(w => [w.id, w]));
  let cycle = await load('cycle');
  if (cycle) { cleanse(cycle, byId); if (!cycle.queue.length) { cycle = null; await commit('cycle', null); } }

  const startNew = async () => { await commit('cycle', newCycle(words)); revealed = false; renderVocab(view); };

  if (!cycle) {
    body.append(h('div', { class: 'card' },
      h('h2', {}, '새 사이클'),
      h('div', { class: 'sub' }, `저장된 단어 ${words.length}개 중 ${Math.min(CYCLE_SIZE, words.length)}개를 골라 풀어요. 오래 안 본 단어와 자주 몰랐던 단어가 더 잘 나와요.`),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: startNew }, '시작'))));
    return;
  }

  if (cycle.done) {
    const s = summary(cycle);
    const unknownWords = cycle.unknown.map(id => byId.get(id)).filter(Boolean);
    body.append(
      h('div', { class: 'card' },
        h('h2', {}, cycle.round > 1 ? `${cycle.round}차 완료` : '사이클 완료'),
        h('div', { class: 'big' }, `알아요 ${s.known} · 몰라요 ${s.unknown}`),
        unknownWords.length ? h('div', { class: 'words', style: 'margin-top:10px' }, ...unknownWords.map(w =>
          h('div', { class: 'word' },
            h('div', { class: 'info' },
              h('div', {}, h('span', { class: 'w jp' }, w.word), '  ', h('span', { class: 'sub' }, [shown(w).reading, shown(w).meaning].filter(Boolean).join(' · ') || '(읽기·뜻 미입력)')),
              kanjiChips(w.word))))) : h('div', { class: 'sub', style: 'margin-top:6px' }, '모두 알고 있었어요 🎉')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', disabled: !unknownWords.length, onclick: async () => {
          await commit('cycle', retryRound(cycle)); revealed = false; renderVocab(view);
        } }, '몰랐던 단어 다시 풀기'),
        h('button', { class: 'btn primary', onclick: startNew }, '새로운 사이클로 다시 풀기')));
    return;
  }

  // 진행 중
  const w = byId.get(cycle.queue[cycle.idx]);
  const pct = Math.round((cycle.idx / cycle.queue.length) * 100);
  const card = h('div', { class: 'card vcard', onclick: () => { revealed = !revealed; fill(); } });
  const fill = () => {
    card.replaceChildren(h('div', { class: 'word-big' }, w.word));
    const chips = kanjiChips(w.word); // 한자 한 글자씩 nihongokanji 연결
    if (chips) card.append(chips);
    if (revealed) {
      const s = shown(w);
      if (s.reading) card.append(h('div', { class: 'reading jp' }, s.reading));
      card.append(s.meaning ? h('div', { class: 'meaning' }, s.meaning) : h('div', { class: 'meaning sub' }, '(뜻을 아직 입력하지 않았어요)'));
      if (w.memo) card.append(h('div', { class: 'hint' }, w.memo));
      if (isIncomplete(w)) card.append(h('button', {
        class: 'btn small',
        onclick: e => { e.stopPropagation(); openWordModal({ id: w.id, ...w }, () => renderVocab(view)); },
      }, '✏️ 읽기·뜻 입력하기'));
    } else card.append(h('div', { class: 'hint' }, isIncomplete(w)
      ? '카드를 누르면 입력된 정보가 보여요 (미완성 단어)'
      : '카드를 누르면 읽기·뜻이 보여요'));
  };
  fill();

  const respond = async known => {
    const id = answer(cycle, known);
    await recordSeen(id, known);
    await commit('cycle');
    revealed = false;
    renderVocab(view);
  };

  body.append(
    h('div', { class: 'row between' },
      h('span', { class: 'tag' }, cycle.round > 1 ? `다시 풀기 ${cycle.round}차` : '사이클'),
      h('span', { class: 'sub' }, `${cycle.idx + 1} / ${cycle.queue.length}`)),
    h('div', { class: 'progress' }, h('i', { style: `width:${pct}%` })),
    card,
    h('div', { class: 'actions' },
      h('button', { class: 'btn ng', onclick: () => respond(false) }, '몰라요'),
      h('button', { class: 'btn ok', onclick: () => respond(true) }, '알아요')));
}

/* ───────── 목록 ───────── */
function renderList(body, words, view) {
  const list = h('div', { class: 'words' });
  const search = h('input', { type: 'text', placeholder: '검색 (단어·읽기·뜻)' });
  const todoCount = words.filter(isIncomplete).length;
  const filters = h('div', { class: 'seg' }, ...[['all', `전체 ${words.length}`], ['todo', `미완성 ${todoCount}`]].map(([k, l]) =>
    h('button', { class: listFilter === k ? 'on' : '', onclick: () => { listFilter = k; renderVocab(view); } }, l)));
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const rows = [...words].sort((a, b) => b.addedAt - a.addedAt)
      .filter(w => listFilter !== 'todo' || isIncomplete(w))
      .filter(w => !q || [w.word, shown(w).reading, shown(w).meaning].some(s => (s || '').toLowerCase().includes(q)));
    list.replaceChildren(...(rows.length ? rows.map(w => h('div', { class: 'word' },
      h('div', { class: 'info' },
        h('div', {}, h('span', { class: 'w jp' }, w.word), shown(w).reading && !shown(w).fromCard ? h('span', { class: 'sub jp' }, `  ${shown(w).reading}`) : null,
          isIncomplete(w) ? h('span', { class: 'badge' }, '미완성') : (cardFor(w) ? h('span', { class: 'badge link' }, '카드 연결') : null)),
        shown(w).fromCard && shown(w).reading ? h('div', { class: 'sub jp' }, shown(w).reading) : null,
        shown(w).meaning ? h('div', {}, shown(w).meaning) : h('div', { class: 'sub' }, '(뜻 없음)'),
        kanjiChips(w.word),
        h('div', { class: 'sub' }, `본 횟수 ${w.seen || 0} · 몰라요 ${w.miss || 0}`)),
      h('button', { class: 'btn small', onclick: () => openWordModal({ id: w.id, ...w }, () => renderVocab(view)) }, '✏️'),
      h('button', { class: 'btn small', onclick: async () => {
        if (!confirm(`'${w.word}' 을(를) 삭제할까요?`)) return;
        await removeWord(w.id); renderVocab(view);
      } }, '🗑'))) : [h('div', { class: 'empty' }, listFilter === 'todo' ? '미완성 단어가 없어요 👍' : '결과가 없어요')]));
  };
  search.addEventListener('input', draw);
  body.append(filters, h('div', { class: 'card' }, search), list);
  draw();
}

/* ───────── 추가 ───────── */
function renderAdd(body, view) {
  const word = h('input', { type: 'text', placeholder: '単語 / 漢字 / 表現' });
  const reading = h('input', { type: 'text', placeholder: '읽기' });
  const meaning = h('input', { type: 'text', placeholder: '뜻' });
  const memo = h('input', { type: 'text', placeholder: '메모' });
  const bulk = h('textarea', { placeholder: '한 줄에 하나씩\n納める\n更新, こうしん, 갱신\n提供\tていきょう\t제공' });
  const gap = () => h('div', { style: 'height:6px' });

  const submit = async () => {
    if (!word.value.trim()) return toast('단어를 입력해 주세요');
    const r = await addWord({ word: word.value, reading: reading.value, meaning: meaning.value, memo: memo.value });
    toast(!r.added ? '이미 저장된 단어예요' : isIncomplete(r.word) ? '추가했어요 (미완성으로 표시돼요)' : '추가했어요');
    if (r.added) { word.value = reading.value = meaning.value = memo.value = ''; word.focus(); }
  };
  word.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

  body.append(
    h('div', { class: 'card' },
      h('h3', {}, '단어 추가'),
      h('div', { class: 'sub', style: 'margin-bottom:8px' }, '모르는 단어나 한자만 입력해도 돼요. 읽기와 뜻이 비어 있으면 「미완성」으로 표시되고, 목록에서 모아 볼 수 있어요.'),
      word,
      h('details', {}, h('summary', {}, '읽기·뜻·메모도 입력하기 (선택)'), gap(), reading, gap(), meaning, gap(), memo),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: submit }, '추가'))),
    h('div', { class: 'card' },
      h('h3', {}, '여러 개 한 번에 추가'),
      h('div', { class: 'sub' }, '한 줄에 하나씩. 「単語」만 써도 되고, 「単語, よみ, 뜻」 또는 탭/| 로 구분해도 돼요. PC에서 엑셀·메모장 내용을 그대로 붙여넣을 수 있어요. 이미 있는 단어는 건너뜁니다.'),
      bulk,
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async () => {
        const rows = parseBulk(bulk.value);
        if (!rows.length) return toast('추가할 줄이 없어요');
        let added = 0, dup = 0;
        for (const r of rows) { (await addWord({ ...r, source: 'bulk' })).added ? added++ : dup++; }
        toast(`${added}개 추가, ${dup}개는 이미 있어요`);
        bulk.value = '';
        renderVocab(view);
      } }, '일괄 추가'))));
}
