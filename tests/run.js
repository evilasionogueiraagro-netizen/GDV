#!/usr/bin/env node
// Executor dos testes automáticos do GDV.
//
//   node tests/run.js                    todos os testes
//   node tests/run.js tv_test e2e        só estes (com ou sem ".js")
//   node tests/run.js --parte 2/3        2ª de 3 partes (divisão equilibrada pelo tempo; usado no CI)
//   node tests/run.js --lista            lista os testes (respeita --parte)
//   node tests/run.js -v tv_test         mostra a saída do teste ao vivo
//   node tests/run.js --tentativas 2     repete uma vez quem falhar (a falha original fica registrada)
//
// Cada teste roda com um fakegas NOVO (planilha vazia), um de cada vez, nas portas
// GDV_PORTA_WEB (8081) / GDV_PORTA_API (8082). Saída de cada teste em tests/saida/logs/.
// Código de saída 0 só se todos passarem.
//
// Um teste é qualquer tests/*.js (exceto fakegas.js e run.js). Ele falha se sair com código ≠ 0,
// imprimir uma linha com "✗" ou imprimir "FALHOU=N" com N > 0.
// Comentário opcional no topo do teste:  // gdv:relogio dia=15 hora=10:00
//   → fakegas, teste e navegador rodam com o relógio deslocado para esse dia do mês corrente (Manaus).
'use strict';
const fs = require('fs'), path = require('path'), net = require('net'), { spawn } = require('child_process');
const { deslocPara } = require('./lib/relogio');

const DIR = __dirname, SAIDA = path.join(DIR, 'saida'), LOGS = path.join(SAIDA, 'logs');
const PORTA_WEB = Number(process.env.GDV_PORTA_WEB) || 8081, PORTA_API = Number(process.env.GDV_PORTA_API) || 8082;
const TIMEOUT_S = Number(process.env.GDV_TIMEOUT) || 360;
const CI = !!process.env.CI;

// Tempo aproximado de cada teste (s, medido localmente), só para dividir em partes equilibradas (--parte).
// Teste novo sem entrada aqui conta como 60 s.
const PESO = {
  acessos_test: 12, arquivo_test: 4, bgsync_test: 47, e2e: 89, encerrar_test: 23, gps_pedidos_test: 5, install_check: 6,
  migra_db: 4, painel_test: 88, pce_antigo_test: 36, pce_campo_test: 14, pce_e2e: 24, pce_server_test: 1, permissoes_test: 11, publico_test: 17,
  proprio_test: 39, rotinas_test: 8, semplaca_test: 8, server_painel_test: 1, sinal_test: 13, tf_alerta_test: 25,
  cargo_outro_test: 6, colunas_test: 1, tf_anexos_test: 14, tf_e2e: 16, tf_paginas: 5, tf_server_test: 1, tv_test: 83
};

// ---------- argumentos ----------
const args = process.argv.slice(2);
let parte = null, listar = false, verboso = false, tentativas = Number(process.env.GDV_TENTATIVAS) || 1;
const pedidos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--parte') parte = args[++i];
  else if (a.startsWith('--parte=')) parte = a.slice(8);
  else if (a === '--lista') listar = true;
  else if (a === '-v' || a === '--verboso') verboso = true;
  else if (a === '--tentativas') tentativas = Number(args[++i]) || 1;
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 19).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
  else pedidos.push(path.basename(a).replace(/\.js$/, ''));
}

const todos = fs.readdirSync(DIR).filter(f => f.endsWith('.js') && !['fakegas.js', 'run.js'].includes(f)).map(f => f.slice(0, -3)).sort();
let testes = todos;
if (pedidos.length) {
  const faltando = pedidos.filter(p => !todos.includes(p));
  if (faltando.length) { console.error('Teste(s) não encontrado(s): ' + faltando.join(', ') + '\nDisponíveis: ' + todos.join(', ')); process.exit(2); }
  testes = pedidos;
}
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

async function rodarUm(nome, tentativa) {
  const arq = path.join(DIR, nome + '.js');
  const sufixo = tentativa > 1 ? `.tentativa${tentativa}` : '';
  const logArq = path.join(LOGS, nome + sufixo + '.log'), logSrv = path.join(LOGS, nome + sufixo + '.fakegas.log');
  const env = { ...process.env, GDV_PORTA_WEB: String(PORTA_WEB), GDV_PORTA_API: String(PORTA_API) };
  const rel = relogioDoTeste(arq);
  if (rel) env.GDV_DESLOC_MS = String(deslocPara(rel.dia, rel.hora));
  else delete env.GDV_DESLOC_MS;
  const t0 = Date.now();
  let srv = null, teste = null, rc = null, motivo = '';
  try {
    srv = await iniciarFakegas(env, logSrv);
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

(async () => {
  fs.mkdirSync(LOGS, { recursive: true });
  console.log(`GDV – ${testes.length} teste(s)${parte ? ` (parte ${parte})` : ''} | web :${PORTA_WEB} api :${PORTA_API} | timeout ${TIMEOUT_S} s` + (tentativas > 1 ? ` | até ${tentativas} tentativas` : ''));
  const resultados = [], t0 = Date.now();
  for (const [i, nome] of testes.entries()) {
    let r;
    for (let tent = 1; tent <= tentativas; tent++) {
      process.stdout.write(`[${i + 1}/${testes.length}] ${nome}${tent > 1 ? ` (tentativa ${tent})` : ''} ... `);
      r = await rodarUm(nome, tent);
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
  const falhas = resultados.filter(r => !r.passou), instaveis = resultados.filter(r => r.passou && r.tentativa > 1);
  const linhas = resultados.map(r => `${r.passou ? 'OK    ' : 'FALHOU'} ${r.nome.padEnd(22)} ${fmtS(r.ms).padStart(8)}  ${String(r.okN).padStart(4)} ✓` + (r.tentativa > 1 ? `  (${r.tentativa}ª tentativa)` : '') + (r.passou ? '' : `  ${r.motivo}`));
  const resumo = `\n===== Resumo: ${resultados.length - falhas.length}/${resultados.length} passaram em ${fmtS(Date.now() - t0)} =====\n` + linhas.join('\n') +
    (instaveis.length ? `\nInstáveis (passaram só na repetição): ${instaveis.map(r => r.nome).join(', ')}` : '') +
    (falhas.length ? `\nFalharam: ${falhas.map(r => r.nome).join(', ')}\nLogs em tests/saida/logs/` : '') + '\n';
  console.log(resumo);
  fs.writeFileSync(path.join(SAIDA, parte ? `resumo-parte-${parte.replace('/', 'de')}.txt` : 'resumo.txt'), resumo);
  process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
