// 앱 진입점: 해시 라우터 + 홈 + 설정
import { $, h, todayStr, toast } from './util.js';
import { load, commit, exportAll, importAll, resetAll, requestPersistence } from './storage.js';
import { TYPES, loadData, dailyAvailable, wrongAvailable, unreleasedCount, srsDue } from './data.js';
import { allWords } from './words.js';
import { renderQuizHome } from './quiz.js';
import { renderVocab } from './vocab.js';
import { initSelectionBar, refreshSelectionBar } from './select.js';
import { renderKanjiList } from './kanjilist.js';
import { renderStats } from './stats.js';
import { renderGrammarList } from './grammarlist.js';
import { loadGrammar, grammarStats } from './grammar.js';
import { loadKanjiDb } from './kanjidb.js';
import { openModal } from './util.js';
import { pushSupported, currentSubscription, enablePush, disablePush } from './push.js';
import { REPO } from './config.js';

const TITLES = { home: 'JLPT N2 공부방', quiz: '문제 풀이', vocab: '단어 오답노트', settings: '설정', kanji: '한자 카드', stats: '통계', grammar: '문법 모아보기' };

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
  let dailyN = '-', dueN = '-', wrongN = Object.keys(progress.wrong).length, gramN = 0;
  try {
    const d = await loadData();
    dailyN = dailyAvailable(d, progress, today).length;
    wrongN = wrongAvailable(d, progress).length;
    dueN = srsDue(d, progress, today).length;
    gramN = grammarStats(d, await loadGrammar(), progress, today).filter(x => x.status === 'weak').length;
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
      h('div', { class: 'sub' }, `풀 문제 ${dailyN}개 · 오늘의 복습 ${dueN}개 · 틀린 문제 전체 ${wrongN}개 · 틀린 문법 ${gramN}개`),
      h('div', { class: 'row end' },
        h('a', { class: 'btn', href: '#/grammar', style: 'text-decoration:none' }, '문법'),
        h('a', { class: 'btn', href: '#/kanji', style: 'text-decoration:none' }, '한자 카드'),
        h('a', { class: 'btn', href: '#/vocab', style: 'text-decoration:none' }, '단어 학습'),
        h('a', { class: 'btn primary', href: '#/quiz', style: 'text-decoration:none' }, '문제 풀기'))),
    h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('h2', {}, '유형별 정답률'), h('a', { class: 'btn small', href: '#/stats', style: 'text-decoration:none' }, '취약점 분석')),
      types.length ? h('div', { class: 'bars' }, ...types.map(([t, s]) => {
        const pct = Math.round((s.ok / s.n) * 100);
        return h('div', { class: 'bar' },
          h('span', { class: 'n' }, TYPES[t] || t),
          h('div', { class: 'track' }, h('i', { style: `width:${pct}%` })),
          h('span', { class: 'sub' }, `${pct}% (${s.ok}/${s.n})`));
      })) : h('div', { class: 'sub' }, '아직 푼 문제가 없어요. 오늘 첫 문제를 풀어 볼까요?')));
}

/* ───────── 푸시 알림 ───────── */
async function buildPushCard() {
  const box = h('div', { class: 'card' }, h('h3', {}, '학습 알림'));
  if (!pushSupported()) {
    box.append(h('div', { class: 'sub' }, '이 브라우저는 푸시 알림을 지원하지 않아요. 안드로이드 크롬에서 열어 주세요.'));
    return box;
  }
  const out = h('div');
  const paint = async () => {
    const sub = await currentSubscription();
    const info = sub ? JSON.stringify(sub.toJSON()) : '';
    out.replaceChildren(
      h('div', { class: 'sub' }, '하루 3번(오전 11:30 · 오후 3:30 · 밤 9:30) 알림이 와요. 알림은 GitHub Actions 가 보내기 때문에, 아래 구독 정보를 한 번 GitHub 에 등록해야 해요.'),
      sub ? h('div', {},
        h('div', { class: 'notice', style: 'margin:8px 0' }, '이 기기에서 알림이 켜져 있어요. 아래 구독 정보를 복사해 GitHub Secrets 의 PUSH_SUBSCRIPTIONS 에 붙여 넣으세요.'),
        h('textarea', { readonly: true, rows: '4', style: 'width:100%;font-size:11px' }, info),
        h('div', { class: 'row', style: 'margin-top:6px' },
          h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(info); toast('복사했어요'); } catch { toast('길게 눌러 직접 복사해 주세요'); } } }, '구독 정보 복사'),
          h('a', { class: 'btn', style: 'text-decoration:none', target: '_blank', rel: 'noopener noreferrer',
            href: `https://github.com/${REPO}/settings/secrets/actions` }, 'GitHub Secrets 열기'),
          h('button', { class: 'btn ng', onclick: async () => { await disablePush(); toast('알림을 껐어요'); paint(); } }, '끄기')))
        : h('button', { class: 'btn primary', style: 'margin-top:8px', onclick: async () => {
            try { await enablePush(); toast('알림을 켰어요'); paint(); } catch (e) { toast(e.message); }
          } }, '이 기기에서 알림 켜기'));
  };
  box.append(out);
  await paint();
  return box;
}

/* ───────── 출처·라이선스 ───────── */
function openCredits() {
  const a = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
  openModal('출처·라이선스', h('div', { class: 'credits' },
    h('p', {}, '한자 카드의 음독·획수·부수와 대표 단어의 읽기 확인에는 다음 공개 사전 데이터를 사용했어요.'),
    h('ul', {},
      h('li', {}, 'KANJIDIC2 — 한자 정보'),
      h('li', {}, 'KanjiVG — 한자 획순 (© Ulrich Apel, CC BY-SA 3.0)'),
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

  const arr = h('input', { type: 'checkbox', checked: settings.arrange !== false ? true : null,
    onchange: async e => { settings.arrange = e.target.checked; await commit('settings'); } });
  const target = h('input', { type: 'number', min: '30', max: '100', step: '5', value: String(settings.target ?? 60), style: 'width:4.5em;margin:0 6px',
    onchange: async e => { const v = Math.min(100, Math.max(30, Number(e.target.value) || 60)); e.target.value = v; settings.target = v; await commit('settings'); } });
  const pushCard = await buildPushCard();

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
      h('label', { class: 'row' }, fur, '후리가나 표시 (시험처럼 N2 범위를 넘는 한자에만 달려요)'),
      h('label', { class: 'row', style: 'margin-top:8px' }, arr, '★ 문장 완성을 조각 배열로 풀기 (끄면 선택지 방식)'),
      h('div', { class: 'row', style: 'margin-top:8px' }, '모의고사 목표 정답률', target, '%')),
    pushCard,
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
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (name === 'grammar' ? 'quiz' : name)));
  $('#title').textContent = TITLES[name] || TITLES.home;
  document.body.dataset.route = name; // 글자 선택 바는 문제 화면에서만 동작
  refreshSelectionBar();
  const view = $('#view');
  try {
    if (name === 'quiz') await renderQuizHome(view);
    else if (name === 'vocab') await renderVocab(view);
    else if (name === 'settings') await renderSettings(view);
    else if (name === 'kanji') await renderKanjiList(view);
    else if (name === 'stats') await renderStats(view);
    else if (name === 'grammar') await renderGrammarList(view);
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
