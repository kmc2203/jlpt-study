// 공통 유틸: DOM 헬퍼, 텍스트 마크업, 토스트/모달, 음성 읽기

export const $ = (sel, root = document) => root.querySelector(sel);

export function h(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 문제 데이터용 간단 마크업 (HTML 이스케이프 후 적용)
//   [[밑줄]]  → <u>
//   {漢字|かんじ} → <ruby> (후리가나, 설정에서 표시/숨김)
//   \n → <br>
export function fmt(s) {
  return esc(s)
    .replace(/\[\[(.+?)\]\]/g, '<u>$1</u>')
    .replace(/\{([^{}|]+)\|([^{}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>')
    .replace(/\n/g, '<br>');
}

// 마크업을 제거한 순수 텍스트 (음성 읽기, 검증용)
export function plain(s) {
  return String(s ?? '')
    .replace(/\[\[(.+?)\]\]/g, '$1')
    .replace(/\{([^{}|]+)\|([^{}]+)\}/g, '$1');
}

// 메뉴판·안내문 등 passage_html 용 최소 sanitizer
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,link,meta,style,form,base').forEach(n => n.remove());
  doc.body.querySelectorAll('*').forEach(n => {
    for (const a of [...n.attributes]) {
      const name = a.name.toLowerCase();
      const val = a.value.trim().toLowerCase();
      const bad = name.startsWith('on') ||
        ((name === 'href' || name === 'src' || name === 'xlink:href') && val.startsWith('javascript:'));
      if (bad) n.removeAttribute(a.name);
    }
  });
  return doc.body.innerHTML;
}

export const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

export function speak(text) {
  if (typeof speechSynthesis === 'undefined') return toast('이 브라우저는 음성 읽기를 지원하지 않아요');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(plain(text).replace(/[＿★]/g, ''));
  u.lang = 'ja-JP';
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

// 하단 시트 모달. buttons: [{label, cls, onClick}] — onClick이 false를 반환하면 닫지 않음
export function openModal(title, body, buttons = []) {
  const close = () => overlay.remove();
  const overlay = h('div', { class: 'modal', onclick: e => { if (e.target === overlay) close(); } },
    h('div', { class: 'sheet' },
      h('h3', {}, title),
      body,
      h('div', { class: 'row end' },
        ...buttons.map(b => h('button', {
          class: 'btn ' + (b.cls || ''),
          onclick: async () => { const r = await b.onClick?.(); if (r !== false) close(); },
        }, b.label)))));
  document.body.append(overlay);
  return close;
}
