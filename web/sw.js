// Service worker: guarda o app no aparelho para abrir sem internet.
// VERSAO é trocada automaticamente a cada publicação (workflow do GitHub Pages usa o hash do commit).
const VERSAO = 'gdv-v13';
const ARQUIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/config.js', 'js/store.js', 'js/envio.js', 'js/sync.js', 'js/docs.js', 'js/tf.js', 'js/pce.js', 'js/app.js',
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

/* ---------- Envio em segundo plano (Background Sync — Chrome/Android) ----------
   A página registra a tag "gdv-enviar" sempre que algo fica pendente; quando a conexão volta, o navegador acorda este service worker
   (mesmo com o app fechado) e ele envia os pendentes — só a subida: as mudanças do servidor são baixadas quando o app abrir.
   Usa o mesmo núcleo da página (envio.js) e o mesmo banco (store.js). A credencial vem da meta "cred" (espelho do localStorage). */
importScripts('js/config.js', 'js/store.js', 'js/envio.js');
let enviando = null;                                                     // sync e periodicsync juntos: uma execução só
function enviarEmSegundoPlano() {
  if (!enviando) enviando = Envio.subir().then(async r => {
    if (r.enviados || r.arquivos || r.motivo) {                          // app aberto em alguma janela: atualiza o selo/tela
      const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      cs.forEach(c => c.postMessage({ tipo: 'gdv-enviado', ...r }));
    }
    // ainda há arquivos (o tempo do evento acabou): pede outra rodada
    if (r.resta && self.registration.sync) await self.registration.sync.register(Envio.TAG).catch(() => {});
    return r;
  }).finally(() => { enviando = null; });
  return enviando;
}
// Falha (sem internet, servidor fora): a promise rejeitada faz o navegador tentar de novo mais tarde.
self.addEventListener('sync', e => { if (e.tag === Envio.TAG) e.waitUntil(enviarEmSegundoPlano()); });
// Periodic Background Sync (só quando o navegador concedeu): melhor esforço, sem repetição.
self.addEventListener('periodicsync', e => { if (e.tag === Envio.TAG_PERIODICO) e.waitUntil(enviarEmSegundoPlano().catch(() => {})); });
