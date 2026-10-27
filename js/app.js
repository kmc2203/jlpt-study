// 앱 진입점: 해시 라우터 + 홈 + 설정
import { $, h, todayStr, toast } from './util.js';
import { load, commit, exportAll, importAll, resetAll, requestPersistence } from './storage.js';
import { TYPES, loadData, dailyAvailable, wrongAvailable, unreleasedCount } from './data.js';
import { allWords } from './words.js';
import { renderQuizHome } from './quiz.js';
import { renderVocab } from './vocab.js';
import { initSelectionBar, refreshSelectionBar } from './select.js';
import { renderKanjiList } from './kanjilist.js';
import { loadKanjiDb } from './kanjidb.js';
import { openModal } from './util.js';

const TITLES = { home: 'JLPT N2 공부방', quiz: '문제 풀이', vocab: '단어 오답노트', settings: '설정', kanji: '한자 카드' };

async function applySettings() {
  const s = await load('settings');
  document.body.classList.toggle('furigana', !!s.furigana);
}

function streak(days) {
  let n = 0;
  const d = new Date();
  if (!days[todayStr(d)]) d.setDate(d.getDate() - 1); // 오늘 아직 안 풀었으면 어제부터 센다
  while (days[todayStr(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ───────── 홈 ───────── */
async function renderHome(view) {
  const progress = await load('progress');
  const words = await allWords();
  const today = todayStr();
  let dailyN = '-', wrongN = Object.keys(progress.wrong).length;
  try {
    const d = await loadData();
    dailyN = dailyAvailable(d, progress, today).length;
    wrongN = wrongAvailable(d, progress).length;
  } catch { /* 오프라인 첫 실행 등 */ }

  const stat = (label, value) => h('div', { class: 'card grow', style: 'text-align:center;margin:0' },
    h('div', { class: 'big' }, String(value)), h('div', { class: 'sub' }, label));

  const types = Object.entries(progress.stats).filter(([, s]) => s.n > 0);
  view.replaceChildren(
    h('div', { class: 'row', style: 'margin-bottom:12px' },
      stat('오늘 푼 문항', progress.days[today] || 0),
      stat('연속 학습일', streak(progress.days)),
      stat('단어 오답노트', words.length)),
    h('div', { class: 'card' },
      h('h2', {}, '오늘 할 일'),
      h('div', { class: 'sub' }, `풀 문제 ${dailyN}개 · 복습할 틀린 문제 ${wrongN}개`),
      h('div', { class: 'row end' },
        h('a', { class: 'btn', href: '#/kanji', style: 'text-decoration:none' }, '한자 카드'),
        h('a', { class: 'btn', href: '#/vocab', style: 'text-decoration:none' }, '단어 학습'),
        h('a', { class: 'btn primary', href: '#/quiz', style: 'text-decoration:none' }, '문제 풀기'))),
    h('div', { class: 'card' },
      h('h2', {}, '유형별 정답률'),
      types.length ? h('div', { class: 'bars' }, ...types.map(([t, s]) => {
        const pct = Math.round((s.ok / s.n) * 100);
        return h('div', { class: 'bar' },
          h('span', { class: 'n' }, TYPES[t] || t),
          h('div', { class: 'track' }, h('i', { style: `width:${pct}%` })),
          h('span', { class: 'sub' }, `${pct}% (${s.ok}/${s.n})`));
      })) : h('div', { class: 'sub' }, '아직 푼 문제가 없어요. 오늘 첫 문제를 풀어 볼까요?')));
}

/* ───────── 출처·라이선스 ───────── */
function openCredits() {
  const a = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
  openModal('출처·라이선스', h('div', { class: 'credits' },
    h('p', {}, '한자 카드의 음독·획수·부수와 대표 단어의 읽기 확인에는 다음 공개 사전 데이터를 사용했어요.'),
    h('ul', {},
      h('li', {}, 'KANJIDIC2 — 한자 정보'),
      h('li', {}, 'JMdict — 일본어 사전')),
    h('p', {}, '이 데이터는 ', a('https://www.edrdg.org/', 'Electronic Dictionary Research and Development Group (EDRDG)'),
      ' 의 저작물이며, ', a('https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0'), ' 및 ',
      a('https://www.edrdg.org/edrdg/licence.html', 'EDRDG 라이선스'), ' 에 따라 사용합니다.'),
    h('p', {}, '한국어 훈음·뜻·대표 단어의 한국어 설명과 문제·해설은 이 앱에서 직접 작성했어요. 한자 풀이 사이트 nihongokanji.com 의 내용은 복사하지 않고 링크로만 연결합니다.')),
  [{ label: '닫기' }]);
}

/* ───────── 설정 ───────── */
async function renderSettings(view) {
  const settings = await load('settings');
  const fur = h('input', { type: 'checkbox', checked: settings.furigana ? true : null,
    onchange: async e => { settings.furigana = e.target.checked; await commit('settings'); applySettings(); } });
  const file = h('input', { type: 'file', accept: 'application/json', hidden: true,
    onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        if (!confirm('현재 기기의 학습 기록과 단어를 가져온 파일로 바꿉니다. 계속할까요?')) return;
        await importAll(JSON.parse(await f.text()));
        await applySettings(); toast('가져왔어요'); renderSettings(view);
      } catch (err) { toast('가져오기 실패: ' + err.message); }
    } });

  let poolInfo = '';
  try {
    const d = await loadData();
    const p = await load('progress');
    poolInfo = `전체 ${d.items.length}개 · 공개됨 ${d.items.length - unreleasedCount(d)}개 · 미공개 ${unreleasedCount(d)}개 · 푼 문제 ${Object.keys(p.done).length}개`;
  } catch { poolInfo = '문제 데이터를 불러오지 못했어요'; }

  const persisted = await (navigator.storage?.persisted?.() ?? false);

  view.replaceChildren(
    h('div', { class: 'card' },
      h('h3', {}, '표시'),
      h('label', { class: 'row' }, fur, '문제·해설에 후리가나 표시 (후리가나가 달린 문제만)')),
    h('div', { class: 'card' },
      h('h3', {}, '문제 풀'), h('div', { class: 'sub' }, poolInfo)),
    h('div', { class: 'card' },
      h('h3', {}, '백업'),
      h('div', { class: 'sub' }, `학습 기록, 단어, 저장한 nihongokanji 주소는 이 기기 브라우저에 저장돼요. 주기적으로 내보내기를 해 두세요. 저장 영구 보호: ${persisted ? '켜짐' : '꺼짐(홈 화면에 설치하면 안전해져요)'}`),
      h('div', { class: 'row', style: 'margin-top:8px' },
        h('button', { class: 'btn', onclick: async () => {
          const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: `jlpt-study-backup-${todayStr()}.json` });
          document.body.append(a); a.click(); a.remove();
        } }, '내보내기'),
        h('button', { class: 'btn', onclick: () => file.click() }, '가져오기'), file)),
    h('div', { class: 'card' },
      h('h3', {}, '출처·라이선스'),
      h('div', { class: 'sub' }, '한자 카드에 쓴 공개 데이터의 출처를 확인할 수 있어요.'),
      h('button', { class: 'btn', style: 'margin-top:8px', onclick: openCredits }, '출처·라이선스 보기')),
    h('div', { class: 'card' },
      h('h3', {}, '초기화'),
      h('button', { class: 'btn ng', onclick: async () => {
        if (!confirm('모든 학습 기록과 단어를 삭제합니다. 되돌릴 수 없어요. 계속할까요?')) return;
        await resetAll(); toast('초기화했어요'); renderSettings(view);
      } }, '모든 데이터 삭제')));
}

/* ───────── 라우터 ───────── */
async function route() {
  const name = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === name));
  $('#title').textContent = TITLES[name] || TITLES.home;
  document.body.dataset.route = name; // 글자 선택 바는 문제 화면에서만 동작
  refreshSelectionBar();
  const view = $('#view');
  try {
    if (name === 'quiz') await renderQuizHome(view);
    else if (name === 'vocab') await renderVocab(view);
    else if (name === 'settings') await renderSettings(view);
    else if (name === 'kanji') await renderKanjiList(view);
    else await renderHome(view);
  } catch (e) {
    console.error(e);
    view.replaceChildren(h('div', { class: 'card' }, '문제가 발생했어요: ' + e.message));
  }
  window.scrollTo(0, 0);
}

// 같은 탭을 다시 누르면 해당 화면을 처음 상태로 (문제 풀이 중 종료 용도)
document.querySelectorAll('#tabs a').forEach(a =>
  a.addEventListener('click', () => { if (a.getAttribute('href') === (location.hash || '#/')) route(); }));
window.addEventListener('hashchange', route);

(async () => {
  await applySettings();
  await loadKanjiDb();
  initSelectionBar();
  requestPersistence();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  route();
})();
