// 서비스 워커: 네트워크 우선, 실패하면 캐시 (오프라인에서도 마지막으로 본 내용 사용 가능)
const CACHE = 'jlpt-study-v3';
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/util.js', 'js/storage.js', 'js/cycle.js', 'js/words.js',
  'js/data.js', 'js/quiz.js', 'js/vocab.js', 'js/kanji.js', 'js/kanjidb.js', 'js/kanjilist.js', 'js/select.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(new Request(req, { cache: 'no-cache' }))
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
});
