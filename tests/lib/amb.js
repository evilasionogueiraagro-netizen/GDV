// Ambiente comum dos testes: portas, URLs, pastas e navegador.
// Portas configuráveis por GDV_PORTA_WEB (padrão 8081) e GDV_PORTA_API (padrão 8082).
const path = require('path'), fs = require('fs');
const relogio = require('./relogio');   // aplica GDV_DESLOC_MS no processo do teste

const RAIZ = path.resolve(__dirname, '..', '..');           // raiz do repositório
const TESTES = path.resolve(__dirname, '..');
const SAIDA = path.join(TESTES, 'saida');                    // screenshots, PDFs, logs (fora do git)
const PORTA_WEB = Number(process.env.GDV_PORTA_WEB) || 8081;
const PORTA_API = Number(process.env.GDV_PORTA_API) || 8082;
const ORIGEM = `http://localhost:${PORTA_WEB}`;              // web/ estático
const APP = ORIGEM + '/';                                    // app do fiscal
const PAINEL = ORIGEM + '/painel/';                          // painel gerencial
const API = `http://localhost:${PORTA_API}`;                 // Code.gs (fakegas), sem barra final
const API_URL = API + '/';                                   // como o app guarda em gdv.url

fs.mkdirSync(SAIDA, { recursive: true });
const saida = nome => path.join(SAIDA, nome);

// Caminho do Chromium: CHROMIUM_PATH > Chromium do Playwright instalado > /opt/pw-browsers (ambiente local antigo).
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try { const p = require('playwright-core').chromium.executablePath(); if (p && fs.existsSync(p)) return p; } catch (e) {}
  const base = '/opt/pw-browsers';
  try {
    const d = fs.readdirSync(base).filter(x => /^chromium-\d+$/.test(x)).sort((a, b) => b.split('-')[1] - a.split('-')[1]);
    for (const x of d) for (const sub of ['chrome-linux', 'chrome-linux64']) { const p = path.join(base, x, sub, 'chrome'); if (fs.existsSync(p)) return p; }
  } catch (e) {}
  return undefined;   // deixa o Playwright decidir (vai falhar com mensagem clara se não houver navegador)
}

// Abre o Chromium. Todo contexto/página criado por este navegador recebe window.__GDV_API
// (endereço da API) antes dos scripts de inicialização dos testes, para o lado do navegador
// não depender da porta fixa; com GDV_DESLOC_MS, o relógio do navegador também é deslocado.
async function lancar(opts = {}) {
  const { chromium } = require('playwright-core');
  const ws = process.env.GDV_BROWSER_WS;
  const padrao = !opts || !Object.keys(opts).some(k => k !== 'headless' || opts.headless === false);
  let b = null, conectado = false;
  if (ws && padrao) {
    try { b = await chromium.connect(ws); conectado = true; } catch (e) { b = null; }
  }
  if (!b) b = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'], ...opts });
  const ctxs = [];
  const novoContexto = b.newContext.bind(b);
  b.newContext = async (o) => {
    if (process.env.GDV_SEM_SW === '1' && (!o || !o.serviceWorkers)) o = { ...o, serviceWorkers: 'block' };
    const c = await novoContexto(o);
    ctxs.push(c);
    await c.addInitScript(u => {
      window.__GDV_API = u;
      // Nos testes, avisos flutuantes não devem interceptar cliques nos botões de ação abaixo deles em telas estreitas.
      const st = () => { if (!document.head || document.getElementById('__gdv_test_css')) return;
        const e = document.createElement('style'); e.id = '__gdv_test_css'; e.textContent = '#toast, .pn-toast { pointer-events: none !important; }'; document.head.appendChild(e); };
      if (document.head) st(); else document.addEventListener('DOMContentLoaded', st, { once: true });
    }, API_URL);
    if (relogio.DESLOC) await c.addInitScript(`(${relogio.instalar})(window, ${relogio.DESLOC})`);
    return c;
  };
  if (conectado) {
    const origClose = b.close.bind(b);
    b.close = async () => { for (const c of ctxs) await c.close().catch(() => {}); await origClose().catch(() => {}); };
  }
  return b;
}

// Atalho de teste (fakegas /__usuario): conta com senha definitiva e sessão aberta, sem passar pelo login. Mesmo nome = mesma conta
// (sessão nova). o = {permissoes: [...], aplicativo: campo|painel|administracao, matricula, aparelhoId}. Devolve a resposta do `entrar`
// ({token, usuario, permissoes, modulos}) + matricula e senha. Padrão: campo = campo + 3 módulos; painel = gerencia; administracao.
async function usuario(nome, o = {}) {
  const q = new URLSearchParams({ nome });
  if (o.permissoes) q.set('permissoes', [].concat(o.permissoes).join(','));
  ['aplicativo', 'matricula', 'aparelhoId'].forEach(k => { if (o[k]) q.set(k, o[k]); });
  const r = await fetch(API + '/__usuario?' + q).then(x => x.json());
  if (!r.ok) throw new Error('/__usuario (' + nome + '): ' + r.erro);
  return r;
}
const gerente = (nome, o = {}) => usuario(nome, { aplicativo: 'painel', ...o });   // painel com gerencia (vale tudo)
/**
 * Módulos do campo de um usuário (pelo nome) com a action real usuarioPermissoes: m = {veiculos, tf, pce, antigo} (0/1), como no app.
 * Devolve a resposta, com permissoes no formato dos módulos ({veiculos, tf, pce, antigo}) quando ok.
 */
async function modulos(tokGerente, nome, m) {
  const post = b => fetch(API_URL, { method: 'POST', body: JSON.stringify(b) }).then(x => x.json());
  const L = await post({ action: 'usuariosListar', key: tokGerente });
  if (!L.ok) return L;
  const u = L.usuarios.find(x => x.nome === nome);
  if (!u) return { ok: false, erro: 'usuário não encontrado: ' + nome };
  const perms = ['campo'].concat(m.veiculos ? ['fiscalizacaoDeTransito'] : [], m.tf ? ['termoDeBarreira'] : [], m.pce ? ['pce'] : [], m.antigo ? ['digitarDoPapel'] : [], m.educacao ? ['educacaoSanitaria'] : []);
  const r = await post({ action: 'usuarioPermissoes', key: tokGerente, usuarioId: u.id, permissoes: perms });
  if (r.ok) r.permissoes = { veiculos: m.veiculos ? 1 : 0, tf: m.tf ? 1 : 0, pce: m.pce ? 1 : 0, antigo: m.pce && m.antigo ? 1 : 0, educacao: m.educacao ? 1 : 0 };
  return r;
}
let tokCarga = null;
/** Token de um gerente só para carregar dados de teste (sync com tudo liberado); o mesmo em todo o teste. */
async function carga() { return tokCarga || (tokCarga = (await gerente('Carga Dados Teste')).token); }
/** Espera até `fn(arg)` na página devolver verdadeiro (suporta função async/Promise, ao contrário de page.waitForFunction). */
async function esperar(p, fn, arg, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await p.evaluate(fn, arg)) return true; } catch (e) { /* página navegando */ }
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error('tempo esgotado esperando condição (' + ms + ' ms)');
}
/**
 * Caminho local de um download do Playwright. Com o navegador compartilhado (GDV_BROWSER_WS), download.path() não existe
 * ("not available when connecting remotely"); saveAs() funciona nos dois modos.
 */
let nDl = 0;
async function arquivoBaixado(dl) {
  const dir = path.join(SAIDA, 'downloads'); fs.mkdirSync(dir, { recursive: true });
  const arq = path.join(dir, `${process.pid}-${++nDl}-${dl.suggestedFilename()}`);
  await dl.saveAs(arq);
  return arq;
}

module.exports = { RAIZ, TESTES, SAIDA, PORTA_WEB, PORTA_API, ORIGEM, APP, PAINEL, API, API_URL, saida, chromiumPath, lancar, usuario, gerente, carga, modulos, esperar, arquivoBaixado };
