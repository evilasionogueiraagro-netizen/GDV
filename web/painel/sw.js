// Service worker do GDV Painel (app separado do app de campo). Rede primeiro: o painel sempre busca a versão nova;
// sem internet, abre a última versão guardada (os dados vêm da planilha e exigem conexão).
// VERSAO é trocada automaticamente a cada publicação (workflow do GitHub Pages usa o hash do commit).
const VERSAO = 'painel-v1';
// vendor/xlsx (SheetJS, 250 KB) fica fora da lista: só baixa quando o gerente gera o VIGIFITO em .xlsx (e então entra no cache pelo fetch).
const ARQUIVOS = [
  './', 'index.html', 'manual.html', 'manifest.webmanifest', '../css/design.css', 'css/painel.css', '../js/config.js', '../js/versao.js', '../js/icones.js',
  '../documentos/pce-docs.js', 'js/painel.js', 'js/painel-barreiras.js', 'js/painel-tf.js', 'js/painel-pce.js', 'js/painel-usuarios.js', 'js/painel-publico.js', 'js/painel-tv.js',
  '../documentos/conv-docs.js', '../documentos/conv-relatorio.html', 'js/docx.js', 'js/painel-convenios.js', '../documentos/indicadores.js', '../documentos/relgdv-docs.js', '../documentos/vigifito-docs.js', '../documentos/relgdv-relatorio.html', 'js/painel-relatorios.js', '../img/brasao.png', '../img/sepror.png',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/leaflet-heat.js', 'vendor/chart.umd.js',
  'dados/am-municipios.json', '../img/logo-adaf.png', 'img/icon-192.png', 'img/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {                       // apaga só caches antigos do painel (o app de campo tem os seus)
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('painel-') && k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;   // API e mapas passam direto
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
