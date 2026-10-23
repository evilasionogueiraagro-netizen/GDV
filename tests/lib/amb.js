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
    for (const x of d) { const p = path.join(base, x, 'chrome-linux', 'chrome'); if (fs.existsSync(p)) return p; }
  } catch (e) {}
  return undefined;   // deixa o Playwright decidir (vai falhar com mensagem clara se não houver navegador)
}

// Abre o Chromium. Todo contexto/página criado por este navegador recebe window.__GDV_API
// (endereço da API) antes dos scripts de inicialização dos testes, para o lado do navegador
// não depender da porta fixa; com GDV_DESLOC_MS, o relógio do navegador também é deslocado.
async function lancar(opts = {}) {
  const { chromium } = require('playwright-core');
  const b = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'], ...opts });
  const novoContexto = b.newContext.bind(b);
  b.newContext = async (o) => {
    const c = await novoContexto(o);
    await c.addInitScript(u => { window.__GDV_API = u; }, API_URL);
    if (relogio.DESLOC) await c.addInitScript(`(${relogio.instalar})(window, ${relogio.DESLOC})`);
    return c;
  };
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
  const perms = ['campo'].concat(m.veiculos ? ['fiscalizacaoDeTransito'] : [], m.tf ? ['termoDeBarreira'] : [], m.pce ? ['pce'] : [], m.antigo ? ['digitarDoPapel'] : []);
  const r = await post({ action: 'usuarioPermissoes', key: tokGerente, usuarioId: u.id, permissoes: perms });
  if (r.ok) r.permissoes = { veiculos: m.veiculos ? 1 : 0, tf: m.tf ? 1 : 0, pce: m.pce ? 1 : 0, antigo: m.pce && m.antigo ? 1 : 0 };
  return r;
}
let tokCarga = null;
/** Token de um gerente só para carregar dados de teste (sync com tudo liberado); o mesmo em todo o teste. */
async function carga() { return tokCarga || (tokCarga = (await gerente('Carga Dados Teste')).token); }

module.exports = { RAIZ, TESTES, SAIDA, PORTA_WEB, PORTA_API, ORIGEM, APP, PAINEL, API, API_URL, saida, chromiumPath, lancar, usuario, gerente, carga, modulos };
