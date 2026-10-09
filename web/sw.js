// Service worker: guarda o app no aparelho para abrir sem internet.
// Ao alterar qualquer arquivo, aumente VERSAO para os aparelhos baixarem a atualização.
const VERSAO = 'gdv-v1';
const ARQUIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/config.js', 'js/store.js', 'js/sync.js', 'js/docs.js', 'js/app.js',
  'documentos/ficha.html', 'documentos/termo.html', 'documentos/ficha-campo.css', 'documentos/termo.css',
  'img/logo-adaf.png', 'img/brasao.png', 'img/sepror.png', 'img/icon-192.png', 'img/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;   // API do Apps Script passa direto
  // Rede primeiro (pega atualizações quando online); cai no cache quando offline.
  e.respondWith(fetch(req).then(r => {
    const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); return r;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
