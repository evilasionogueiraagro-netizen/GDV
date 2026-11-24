#!/usr/bin/env node
// Executor dos testes automáticos do GDV.
//
//   node tests/run.js                    todos os testes
//   node tests/run.js tv_test e2e        só estes (com ou sem ".js")
//   node tests/run.js --parte 2/3        2ª de 3 partes (divisão equilibrada pelo tempo; usado no CI)
//   node tests/run.js --lista            lista os testes (respeita --parte)
//   node tests/run.js -v tv_test         mostra a saída do teste ao vivo
//   node tests/run.js --tentativas 2     repete uma vez quem falhar (a falha original fica registrada)
//   node tests/run.js --paralelo 4       suíte inteira em 4 partes ao mesmo tempo (uso local, ~3 min; antes de subir)
//   node tests/run.js --mudou            roda só os testes ligados ao que mudou no git (mais os estáticos/unitários)
//   node tests/run.js --rapidos          só os testes sem fakegas e sem navegador (tests/unit/ e estáticos; segundos)
//   node tests/run.js --sem-rapidos      todos menos os rápidos (no CI, os rápidos rodam num job à parte, sem Chromium)
//
// Cada teste roda com um fakegas NOVO (planilha vazia), um de cada vez, nas portas
// GDV_PORTA_WEB (8081) / GDV_PORTA_API (8082). Com --paralelo N, a parte k usa as portas 8081+2(k-1) / 8082+2(k-1).
// Saída de cada teste em tests/saida/logs/.
// Código de saída 0 só se todos passarem.
//
// Um teste é qualquer tests/*.js (exceto fakegas.js e run.js). Ele falha se sair com código ≠ 0,
// imprimir uma linha com "✗" ou imprimir "FALHOU=N" com N > 0.
// Comentário opcional no topo do teste:  // gdv:relogio dia=15 hora=10:00
//   → fakegas, teste e navegador rodam com o relógio deslocado para esse dia do mês corrente (Manaus).
'use strict';
const fs = require('fs'), path = require('path'), net = require('net'), { spawn, execFileSync } = require('child_process');
const { deslocPara } = require('./lib/relogio');

const DIR = __dirname, SAIDA = path.join(DIR, 'saida'), LOGS = path.join(SAIDA, 'logs');
const PORTA_WEB = Number(process.env.GDV_PORTA_WEB) || 8081, PORTA_API = Number(process.env.GDV_PORTA_API) || 8082;
const TIMEOUT_S = Number(process.env.GDV_TIMEOUT) || 360;
const CI = !!process.env.CI;

// Tempo aproximado de cada teste (s, medido no CI), só para dividir em partes equilibradas (--parte, --paralelo).
// Teste novo sem entrada aqui conta como 60 s.
const PESO = {
  acessos_test: 8, adm_test: 5, adm_filtro_escalas_test: 3, desempenho_server_test: 3, pc_troca_login_test: 9, aparelho_compartilhado_test: 2, arquivo_test: 2, auto_infracao_test: 8,
  bgsync_test: 5, bva_ponto_test: 3, bvas_test: 4, cargo_outro_test: 2, colunas_dup_test: 1, colunas_test: 1,
  convenio_test: 23, convfin_test: 8, design_test: 1, docs_sistema_test: 1, docs_tamanho_test: 1,
  dois_aparelhos_test: 6, e2e: 7, educacao_test: 9, encerrar_test: 9, escala_turno_test: 4, escalas_test: 9,
  gps_pedidos_test: 7, historico_recuperar_test: 4, impressao_celular_test: 8, inicio_test: 2, install_check: 6,
  invasao_test: 2, invasao_xss_test: 5, letra_turno_test: 1, login_campo_test: 7, login_painel_test: 7,
  manual_prints_test: 17, migra_db: 6, nomes_painel_test: 3, ordem_arquivos_test: 1, painel_test: 12,
  pareamento_test: 9, pce_antigo_test: 14, pce_banco_test: 3, pce_busca_test: 8, pce_cadastros_test: 7,
  pce_campo_test: 8, pce_catalogo_test: 5, pce_citros_test: 5, pce_e2e: 8, pce_fichas_test: 55,
  pce_hospedeiros_test: 2, pce_laudo_test: 3, pce_legislacao_test: 3, pce_moniliase_test: 10,
  pce_naoassina_test: 4, pce_opcionais_test: 6, pce_server_test: 1, pce_visita_test: 5, pce_visitas_test: 1,
  permissoes_campo_test: 8, permissoes_test: 5, placa_tf_test: 9, plantao_test: 2, proprio_test: 3,
  publico_test: 10, reincidencia_test: 1, relatorio_equipe_test: 3, relgdv_test: 27, responsivo_test: 2,
  rolagem_test: 1, rotinas_test: 8, sem_emoji_test: 1, semplaca_test: 8, server_painel_test: 1, sinal_test: 9,
  tabatinga_test: 9, tf_alerta_test: 16, tf_anexos_test: 11, tf_barreira_turno_test: 5, tf_e2e: 10,
  tf_modelos_test: 2, tf_paginas: 4, tf_papel_test: 3, tf_server_test: 1, tf_textos_test: 14,
  turno_cancelar_test: 4, turno_papel_test: 5, tv_test: 15, usuarios_server_test: 1, vigifito_test: 30
};

// ---------- argumentos ----------
const args = process.argv.slice(2);
let parte = null, paralelo = 0, listar = false, verboso = false, mudou = false, rapidos = null, tentativas = Number(process.env.GDV_TENTATIVAS) || 1;
const pedidos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--parte') parte = args[++i];
  else if (a.startsWith('--parte=')) parte = a.slice(8);
  else if (a === '--paralelo' || a === '-j') paralelo = Number(args[++i]) || 0;
  else if (a.startsWith('--paralelo=')) paralelo = Number(a.slice(11)) || 0;
  else if (a === '--lista') listar = true;
  else if (a === '--mudou') mudou = true;
  else if (a === '--rapidos') rapidos = true;
  else if (a === '--sem-rapidos') rapidos = false;
  else if (a === '-v' || a === '--verboso') verboso = true;
  else if (a === '--tentativas') tentativas = Number(args[++i]) || 1;
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 23).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
  else pedidos.push(path.basename(a).replace(/\.js$/, ''));
}

const UNIT_DIR = path.join(DIR, 'unit');
const unitarios = fs.existsSync(UNIT_DIR) ? fs.readdirSync(UNIT_DIR).filter(f => f.endsWith('_test.js')).map(f => 'unit/' + f.slice(0, -3)).sort() : [];
const todos = unitarios.concat(fs.readdirSync(DIR).filter(f => f.endsWith('.js') && !['fakegas.js', 'run.js', 'local.js'].includes(f)).map(f => f.slice(0, -3)).sort());
const arqDe = nome => path.join(DIR, nome + '.js');
const lerTeste = nome => fs.readFileSync(arqDe(nome), 'utf8');
const precisaFakegas = nome => {
  if (nome.startsWith('unit/')) return false;
  const src = lerTeste(nome);
  if (/\/\/\s*gdv:node\b/.test(src)) return false;
  return /\b(amb|API|APP|PAINEL|ORIGEM|fetch\(|fakegas|8081|8082)\b/.test(src);
};
const precisaNavegador = nome => !nome.startsWith('unit/') && /\b(amb\.lancar|playwright|chromium)\b/.test(lerTeste(nome));
const precisaSW = nome => /\b(serviceWorker|setOffline)\b/.test(lerTeste(nome));
const rapido = nome => !precisaFakegas(nome) && !precisaNavegador(nome);

function testesMudados() {
  const raiz = path.resolve(DIR, '..');
  const git = a => execFileSync('git', a, { cwd: raiz, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  let arqs = [...new Set([...git(['diff', '--name-only', 'HEAD']), ...git(['ls-files', '--others', '--exclude-standard'])])];
  if (!arqs.length) try { arqs = git(['diff', '--name-only', 'origin/main...HEAD']); } catch (e) {}
  if (!arqs.length) return [];
  const sel = new Set(todos.filter(t => !precisaFakegas(t)));
  const add = l => l.forEach(t => { if (todos.includes(t)) sel.add(t); });
  for (const f of arqs) {
    if (f.startsWith('tests/') && f.endsWith('.js')) {
      const n = f.replace(/^tests\//, '').replace(/\.js$/, '');
      if (todos.includes(n)) sel.add(n);
      if (/^tests\/(fakegas|lib\/)/.test(f)) return todos;
    }
    if (/web\/js\/(campo|pce|pce-cadastros|moniliase|pce-visita|citros)|apps-script\/pce/.test(f)) add(['pce_e2e', 'pce_busca_test', 'pce_campo_test', 'pce_cadastros_test', 'pce_visita_test', 'pce_server_test', 'pce_visitas_test']);
    if (/web\/js\/tf|apps-script\/tf/.test(f)) add(['tf_e2e', 'tf_server_test', 'tf_anexos_test', 'tf_alerta_test', 'tf_papel_test', 'tf_modelos_test', 'tf_textos_test']);
    if (/web\/js\/educacao|apps-script\/educacao/.test(f)) add(['educacao_test']);
    if (/web\/js\/escala|apps-script\/escalas|relatorio-equipe/.test(f)) add(['escalas_test', 'escala_turno_test', 'relatorio_equipe_test']);
    if (/web\/js\/(app|sync|envio|store|login)/.test(f)) add(['e2e', 'bgsync_test', 'login_campo_test', 'permissoes_campo_test', 'rolagem_test']);
    if (/web\/painel\//.test(f)) add(['painel_test', 'login_painel_test', 'tv_test', 'nomes_painel_test']);
    if (/web\/administrativo\//.test(f)) add(['adm_test', 'convenio_test', 'convfin_test', 'vigifito_test']);
    if (/web\/dashboard\//.test(f)) add(['publico_test']);
    if (/web\/documentos\//.test(f)) add(['pce_fichas_test', 'tf_paginas', 'auto_infracao_test', 'impressao_celular_test']);
    if (/apps-script\/(Code|acessos|usuarios)/.test(f)) add(['usuarios_server_test', 'invasao_test', 'permissoes_test', 'server_painel_test']);
  }
  return todos.filter(t => sel.has(t));
}

let testes = todos;
if (pedidos.length) {
  const faltando = pedidos.filter(p => !todos.includes(p));
  if (faltando.length) { console.error('Teste(s) não encontrado(s): ' + faltando.join(', ') + '\nDisponíveis: ' + todos.join(', ')); process.exit(2); }
  testes = pedidos;
} else if (mudou) {
  testes = testesMudados();
  if (!testes.length) { console.log('Nenhum arquivo alterado no git: nada a rodar.'); process.exit(0); }
}
if (rapidos !== null) testes = testes.filter(t => rapido(t) === rapidos);
if (parte) {
  const m = /^(\d+)\/(\d+)$/.exec(parte);
  if (!m || +m[1] < 1 || +m[1] > +m[2]) { console.error('--parte espera i/n (ex.: 1/3)'); process.exit(2); }
  const n = +m[2], cestos = Array.from({ length: n }, () => ({ t: 0, l: [] }));
  [...testes].sort((a, b) => (PESO[b] || 60) - (PESO[a] || 60) || a.localeCompare(b)).forEach(t => {
    const c = cestos.reduce((x, y) => (y.t < x.t ? y : x)); c.t += PESO[t] || 60; c.l.push(t);
  });
  testes = cestos[+m[1] - 1].l.sort();
}
if (listar) { console.log(testes.join('\n')); process.exit(0); }

// ---------- utilitários ----------
const dorme = ms => new Promise(r => setTimeout(r, ms));
const portaLivre = porta => new Promise(res => {
  const s = net.connect({ port: porta, host: '127.0.0.1' });
  s.once('connect', () => { s.destroy(); res(false); });
  s.once('error', () => res(true));
});
async function esperarPortasLivres(ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await portaLivre(PORTA_WEB) && await portaLivre(PORTA_API)) return true; await dorme(150); }
  return false;
}
function matarGrupo(proc, sinal = 'SIGTERM') {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) { try { process.kill(-proc.pid, sinal); } catch (e) {} return; }
  try { process.kill(-proc.pid, sinal); } catch (e) { try { proc.kill(sinal); } catch (e2) {} }
}
async function encerrar(proc) {
  if (!proc) return;
  matarGrupo(proc, 'SIGTERM');
  const t0 = Date.now();
  while (proc.exitCode === null && proc.signalCode === null && Date.now() - t0 < 5000) await dorme(100);
  matarGrupo(proc, 'SIGKILL');   // restos do grupo (ex.: Chromium órfão)
}
function relogioDoTeste(arquivo) {
  const topo = fs.readFileSync(arquivo, 'utf8').split('\n').slice(0, 15).join('\n');
  const m = /\/\/\s*gdv:relogio\s+dia=(\d+)(?:\s+hora=(\d\d:\d\d))?/.exec(topo);
  return m ? { dia: +m[1], hora: m[2] || '10:00' } : null;
}
const fmtS = ms => (ms / 1000).toFixed(1) + ' s';
const cor = (c, t) => (process.stdout.isTTY ? `\x1b[${c}m${t}\x1b[0m` : t);
const grupo = (t) => CI && console.log(`::group::${t}`), fimGrupo = () => CI && console.log('::endgroup::');

async function iniciarFakegas(env, logArq) {
  if (!await esperarPortasLivres()) throw new Error(`portas ${PORTA_WEB}/${PORTA_API} ocupadas (outro fakegas rodando?)`);
  const log = fs.openSync(logArq, 'w');
  const p = spawn(process.execPath, [path.join(DIR, 'fakegas.js')], { cwd: DIR, env, detached: true, stdio: ['ignore', 'pipe', log] });
  let saida = '';
  p.stdout.on('data', d => { saida += d; fs.appendFileSync(logArq, d); });
  const t0 = Date.now();
  while (!/ready/.test(saida)) {
    if (p.exitCode !== null) throw new Error('fakegas terminou ao iniciar (código ' + p.exitCode + '): ' + fs.readFileSync(logArq, 'utf8').slice(-800));
    if (Date.now() - t0 > 15000) { await encerrar(p); throw new Error('fakegas não ficou pronto em 15 s'); }
    await dorme(50);
  }
  // espera as duas portas aceitarem conexão
  while (await portaLivre(PORTA_WEB) || await portaLivre(PORTA_API)) {
    if (Date.now() - t0 > 15000) { await encerrar(p); throw new Error('fakegas não abriu as portas'); }
    await dorme(50);
  }
  return p;
}

async function rodarUm(nome, tentativa, browserWs) {
  const arq = arqDe(nome);
  const sufixo = tentativa > 1 ? `.tentativa${tentativa}` : '';
  const logArq = path.join(LOGS, nome + sufixo + '.log'), logSrv = path.join(LOGS, nome + sufixo + '.fakegas.log');
  fs.mkdirSync(path.dirname(logArq), { recursive: true });
  const env = { ...process.env, GDV_PORTA_WEB: String(PORTA_WEB), GDV_PORTA_API: String(PORTA_API), GDV_SEM_SW: precisaSW(nome) ? '0' : '1' };
  if (browserWs && precisaNavegador(nome)) env.GDV_BROWSER_WS = browserWs;
  else delete env.GDV_BROWSER_WS;
  const rel = relogioDoTeste(arq);
  if (rel) env.GDV_DESLOC_MS = String(deslocPara(rel.dia, rel.hora));
  else delete env.GDV_DESLOC_MS;
  const t0 = Date.now();
  let srv = null, teste = null, rc = null, motivo = '';
  try {
    if (precisaFakegas(nome)) srv = await iniciarFakegas(env, logSrv);
    const out = fs.openSync(logArq, 'w');
    teste = spawn(process.execPath, [arq], { cwd: DIR, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const escrever = d => { fs.writeSync(out, d); if (verboso) process.stdout.write(d); };
    teste.stdout.on('data', escrever); teste.stderr.on('data', escrever);
    let estourou = false;
    const timer = setTimeout(() => { estourou = true; matarGrupo(teste, 'SIGKILL'); }, TIMEOUT_S * 1000);
    rc = await new Promise(res => teste.on('close', (c, s) => res(c === null ? 128 + (s === 'SIGKILL' ? 9 : 15) : c)));
    clearTimeout(timer);
    fs.closeSync(out);
    if (estourou) motivo = `tempo esgotado (${TIMEOUT_S} s)`;
  } catch (e) {
    rc = rc === null ? 99 : rc; motivo = 'erro do executor: ' + e.message;
    fs.appendFileSync(logArq, '\n[run.js] ' + motivo + '\n');
  } finally {
    await encerrar(teste);
    await encerrar(srv);
  }
  const txt = fs.existsSync(logArq) ? fs.readFileSync(logArq, 'utf8') : '';
  const okN = (txt.match(/✓/g) || []).length, xs = txt.split('\n').filter(l => /✗/.test(l));
  const falhouN = /FALHOU=[1-9]/.test(txt);
  if (!motivo && rc !== 0) motivo = 'código de saída ' + rc;
  if (!motivo && xs.length) motivo = xs.length + ' verificação(ões) com ✗';
  if (!motivo && falhouN) motivo = 'FALHOU=N > 0 na saída';
  return { nome, passou: !motivo, motivo, ms: Date.now() - t0, okN, xs, rc, logArq, txt, rel };
}

/**
 * --paralelo N (uso local): roda as N partes de --parte ao mesmo tempo, cada uma num processo com o próprio fakegas em portas
 * próprias. Mostra o andamento de cada parte e, no fim, o resumo das N juntas. Sai com 0 só se todas passarem.
 */
async function rodarEmParalelo() {
  const repassar = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--paralelo' || args[i] === '-j') { i++; continue; }
    if (!args[i].startsWith('--paralelo=')) repassar.push(args[i]);
  }
  fs.mkdirSync(SAIDA, { recursive: true });
  fs.readdirSync(SAIDA).filter(f => /^resumo-parte-/.test(f)).forEach(f => fs.unlinkSync(path.join(SAIDA, f)));
  console.log(`GDV – ${testes.length} teste(s) em ${paralelo} partes ao mesmo tempo | portas ${PORTA_WEB}/${PORTA_API} a ${PORTA_WEB + 2 * (paralelo - 1)}/${PORTA_API + 2 * (paralelo - 1)}`);
  const t0 = Date.now();
  const cods = await Promise.all(Array.from({ length: paralelo }, (_, k) => new Promise(res => {
    const env = { ...process.env, GDV_PORTA_WEB: String(PORTA_WEB + 2 * k), GDV_PORTA_API: String(PORTA_API + 2 * k) };
    const p = spawn(process.execPath, [__filename, '--parte', `${k + 1}/${paralelo}`, ...repassar], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let resto = '';
    const linhas = d => {
      resto += d; const ls = resto.split('\n'); resto = ls.pop();
      ls.forEach(l => { if (/^\[\d+\/\d+\]|^\s+✗|executor/.test(l)) console.log(`[parte ${k + 1}] ${l}`); });
    };
    p.stdout.on('data', linhas); p.stderr.on('data', linhas);
    p.on('close', c => res(c === null ? 1 : c));
  })));
  const linhas = [];
  for (let k = 1; k <= paralelo; k++) {
    const arq = path.join(SAIDA, `resumo-parte-${k}de${paralelo}.txt`);
    if (fs.existsSync(arq)) fs.readFileSync(arq, 'utf8').split('\n').filter(l => /^(OK|FALHOU) /.test(l)).forEach(l => linhas.push(l));
  }
  linhas.sort((a, b) => a.slice(7).localeCompare(b.slice(7)));
  const falhas = linhas.filter(l => l.startsWith('FALHOU'));
  const resumo = `\n===== Resumo: ${linhas.length - falhas.length}/${linhas.length} passaram em ${fmtS(Date.now() - t0)} (${paralelo} partes ao mesmo tempo) =====\n` +
    linhas.join('\n') + (falhas.length ? `\nFalharam: ${falhas.map(l => l.slice(7).trim().split(/\s+/)[0]).join(', ')}\nLogs em tests/saida/logs/` : '') +
    (linhas.length < testes.length ? `\nAtenção: só ${linhas.length} de ${testes.length} testes têm resultado (uma parte terminou antes da hora).` : '') + '\n';
  console.log(resumo);
  fs.writeFileSync(path.join(SAIDA, 'resumo.txt'), resumo);
  process.exit(cods.some(c => c !== 0) || falhas.length || linhas.length < testes.length ? 1 : 0);
}

(async () => {
  if (paralelo > 1 && !parte) return rodarEmParalelo();
  fs.mkdirSync(LOGS, { recursive: true });
  console.log(`GDV – ${testes.length} teste(s)${parte ? ` (parte ${parte})` : ''} | web :${PORTA_WEB} api :${PORTA_API} | timeout ${TIMEOUT_S} s` + (tentativas > 1 ? ` | até ${tentativas} tentativas` : ''));
  let srvPw = null, browserWs = '';
  if (testes.filter(precisaNavegador).length >= 2) {
    try {
      const { chromium } = require('playwright-core'), amb = require('./lib/amb');
      srvPw = await chromium.launchServer({ executablePath: amb.chromiumPath(), args: ['--no-sandbox'] });
      browserWs = srvPw.wsEndpoint();
    } catch (e) { srvPw = null; browserWs = ''; }
  }
  const resultados = [], t0 = Date.now();
  try {
    for (const [i, nome] of testes.entries()) {
      let r;
      for (let tent = 1; tent <= tentativas; tent++) {
        process.stdout.write(`[${i + 1}/${testes.length}] ${nome}${tent > 1 ? ` (tentativa ${tent})` : ''} ... `);
        r = await rodarUm(nome, tent, browserWs);
        r.tentativa = tent;
        console.log(r.passou ? cor(32, 'OK') + `  ${fmtS(r.ms)}, ${r.okN} ✓` + (r.rel ? `  [relógio: dia ${r.rel.dia} ${r.rel.hora}]` : '')
          : cor(31, 'FALHOU') + `  ${fmtS(r.ms)} – ${r.motivo}`);
        if (!r.passou) {
          grupo(`saída de ${nome} (últimas linhas; completa em ${path.relative(process.cwd(), r.logArq)})`);
          r.xs.slice(0, 20).forEach(l => console.log('    ' + l.trim().slice(0, 400)));
          console.log(r.txt.split('\n').slice(-40).map(l => '    | ' + l.slice(0, 400)).join('\n'));
          fimGrupo();
        }
        if (r.passou) break;
      }
      resultados.push(r);
    }
  } finally {
    if (srvPw) await srvPw.close().catch(() => {});
  }
  const falhas = resultados.filter(r => !r.passou), instaveis = resultados.filter(r => r.passou && r.tentativa > 1);
  const linhas = resultados.map(r => `${r.passou ? 'OK    ' : 'FALHOU'} ${r.nome.padEnd(22)} ${fmtS(r.ms).padStart(8)}  ${String(r.okN).padStart(4)} ✓` + (r.tentativa > 1 ? `  (${r.tentativa}ª tentativa)` : '') + (r.passou ? '' : `  ${r.motivo}`));
  const resumo = `\n===== Resumo: ${resultados.length - falhas.length}/${resultados.length} passaram em ${fmtS(Date.now() - t0)} =====\n` + linhas.join('\n') +
    (instaveis.length ? `\nInstáveis (passaram só na repetição): ${instaveis.map(r => r.nome).join(', ')}` : '') +
    (falhas.length ? `\nFalharam: ${falhas.map(r => r.nome).join(', ')}\nLogs em tests/saida/logs/` : '') + '\n';
  console.log(resumo);
  fs.writeFileSync(path.join(SAIDA, parte ? `resumo-parte-${parte.replace('/', 'de')}.txt` : 'resumo.txt'), resumo);
  process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
