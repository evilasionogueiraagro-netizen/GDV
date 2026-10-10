// Service worker: guarda o app no aparelho para abrir sem internet.
// VERSAO é trocada automaticamente a cada publicação (workflow do GitHub Pages usa o hash do commit).
const VERSAO = 'gdv-v13';
const ARQUIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/config.js', 'js/store.js', 'js/sync.js', 'js/docs.js', 'js/tf.js', 'js/pce.js', 'js/app.js',
  'documentos/ficha.html', 'documentos/termo.html', 'documentos/tf.html', 'documentos/ficha-campo.css', 'documentos/termo.css',
  'documentos/pce-levantamento.html', 'documentos/pce-colheita.html', 'documentos/pce.css',
  'img/logo-adaf.png', 'img/brasao.png', 'img/sepror.png', 'img/icon-192.png', 'img/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('gdv-') && k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;   // API do Apps Script passa direto
  // GDV Painel (pasta painel/) é outro app, com service worker próprio: não entra no cache do app de campo.
  if (/\/painel(\/|$)/.test(new URL(req.url).pathname)) return;
  // Rede primeiro (pega atualizações quando online); cai no cache quando offline.
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => {      // no-cache: sempre revalida com o servidor
    const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); return r;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
