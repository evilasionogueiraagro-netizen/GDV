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
const fs = require('fs'), path = require('path'), net = require('net'), { spawn } = require('child_process');
const { deslocPara } = require('./lib/relogio');

const DIR = __dirname, SAIDA = path.join(DIR, 'saida'), LOGS = path.join(SAIDA, 'logs');
const PORTA_WEB = Number(process.env.GDV_PORTA_WEB) || 8081, PORTA_API = Number(process.env.GDV_PORTA_API) || 8082;
const TIMEOUT_S = Number(process.env.GDV_TIMEOUT) || 360;
const CI = !!process.env.CI;

// Tempo aproximado de cada teste (s, medido no CI), só para dividir em partes equilibradas (--parte, --paralelo).
// Teste novo sem entrada aqui conta como 60 s.
const PESO = {
  acessos_test: 23, adm_test: 5, arquivo_test: 3, bgsync_test: 47, cargo_outro_test: 2, colunas_dup_test: 1, colunas_test: 1, convenio_test: 16,
  convfin_test: 6, e2e: 88, encerrar_test: 21, gps_pedidos_test: 5, install_check: 5, migra_db: 4, painel_test: 39, pce_antigo_test: 33,
  pce_campo_test: 12, pce_citros_test: 38, pce_e2e: 49, pce_laudo_test: 13, pce_moniliase_test: 16, pce_naoassina_test: 5, pce_server_test: 1,
  pce_visita_test: 6, permissoes_test: 10, proprio_test: 38, publico_test: 12, relgdv_test: 18, responsivo_test: 2, rotinas_test: 7,
  semplaca_test: 8, server_painel_test: 1, sinal_test: 12, tf_alerta_test: 23, tf_anexos_test: 11, tf_e2e: 17, tf_paginas: 4, tf_server_test: 1,
  inicio_test: 2, tv_test: 80, vigifito_test: 17, plantao_test: 4, tf_papel_test: 12, tabatinga_test: 8, reincidencia_test: 2
};

// ---------- argumentos ----------
const args = process.argv.slice(2);
let parte = null, paralelo = 0, listar = false, verboso = false, tentativas = Number(process.env.GDV_TENTATIVAS) || 1;
const pedidos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--parte') parte = args[++i];
  else if (a.startsWith('--parte=')) parte = a.slice(8);
  else if (a === '--paralelo' || a === '-j') paralelo = Number(args[++i]) || 0;
  else if (a.startsWith('--paralelo=')) paralelo = Number(a.slice(11)) || 0;
  else if (a === '--lista') listar = true;
  else if (a === '-v' || a === '--verboso') verboso = true;
  else if (a === '--tentativas') tentativas = Number(args[++i]) || 1;
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 21).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
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
