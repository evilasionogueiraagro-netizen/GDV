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

module.exports = { RAIZ, TESTES, SAIDA, PORTA_WEB, PORTA_API, ORIGEM, APP, PAINEL, API, API_URL, saida, chromiumPath, lancar };
