#!/usr/bin/env node
// Velocidade do back publicado (Apps Script em produção), só com chamadas de leitura sem credencial: não grava nada.
//
//   node tests/lib/velocidade.js                     mede o /exec de web/js/config.js
//   node tests/lib/velocidade.js --vezes 8           mais repetições (tfVerificar fica em no máximo 5)
//   node tests/lib/velocidade.js --url <endereço>    outro back (ex.: servidor próprio), para comparar
//
// Fica em tests/lib/ de propósito: o run.js roda todo tests/*.js, e isto não pode rodar no CI (chama a produção).
// "script" = 1º salto (o Apps Script executando); "total" = com o 2º salto (busca do resultado) e a rede.
//
// Não mede o envio dos fiscais (sync): exige chave e grava em produção, e toda gravação passa pela trava única do script.
// Para isso: planilha → Extensões → Apps Script → Execuções (ícone de lista na barra da esquerda), filtrar por doPost.
//
// Referência (17/11/2026, versão 2026-11-17a, mediana do total): GET 2,7 s; dashboard no cache 2,5 s (9,3 s ao calcular);
// tfVerificar (lê a aba TFs) 5,6 s; rede pura 0,5 a 1 s. 5 GET simultâneos: 2,6 s, sem fila.
'use strict';
const fs = require('fs'), path = require('path');
require('net').setDefaultAutoSelectFamilyAttemptTimeout(3000);   // o padrão (250 ms por endereço) estoura em rede lenta e sem IPv6

const args = process.argv.slice(2);
const arg = (nome, pad) => { const i = args.indexOf(nome); return i >= 0 && args[i + 1] ? args[i + 1] : pad; };
const config = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'js', 'config.js'), 'utf8');
const URL_EXEC = arg('--url', (config.match(/sync:\s*\{\s*url:\s*'([^']+)'/) || [])[1]);
const VEZES = Math.max(1, Number(arg('--vezes', 5)) || 5);
const MAX_VERIFICAR = 5;   // tfVerificar com id inexistente conta no limite de 30/min de todos (VERIF_MAX_INVALIDAS); não bloquear a verificação pública
if (!URL_EXEC) { console.error('Endereço do back não encontrado em web/js/config.js. Use --url.'); process.exit(1); }

async function chamar(corpo) {
  const op = corpo ? { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(corpo), redirect: 'manual' } : { redirect: 'manual' };
  const t0 = performance.now();
  let r = await fetch(URL_EXEC, op);
  const t1 = performance.now();
  if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {   // Apps Script: executa e redireciona para o resultado
    await r.arrayBuffer();
    r = await fetch(r.headers.get('location'));
  }
  const txt = await r.text(), t2 = performance.now();
  let ok = false; try { ok = JSON.parse(txt).ok === true; } catch (e) { ok = false; }
  return { script: (t1 - t0) / 1000, total: (t2 - t0) / 1000, ok };
}

const seg = n => n.toFixed(2).replace('.', ',') + ' s';
const mediana = v => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function linha(nome, amostras) {
  const tot = amostras.map(a => a.total), scr = amostras.map(a => a.script), falhas = amostras.filter(a => !a.ok).length;
  console.log(`${nome.padEnd(34)} total ${seg(Math.min(...tot))} / ${seg(mediana(tot))} / ${seg(Math.max(...tot))}` +
    `   script ${seg(mediana(scr))}${falhas ? `   ${falhas} sem ok:true` : ''}`);
}
async function serie(nome, corpo, n) { const a = []; for (let i = 0; i < n; i++) a.push(await chamar(corpo)); linha(nome, a); }

(async () => {
  console.log(`Back: ${URL_EXEC}`);
  const v = await chamar(null);   // aquecimento (TLS e primeira execução), fora das séries
  console.log(`Versão no ar: ${v.ok ? 'ok' : 'sem resposta'} (aquecimento ${seg(v.total)})`);
  console.log(`${''.padEnd(34)} total mín. / mediana / máx.   script (mediana)`);
  await serie('GET /exec (sem planilha)', null, VEZES);
  await serie('publicoDados (dashboard, cache)', { action: 'publicoDados' }, VEZES);
  await serie('tfVerificar (lê a aba TFs)', { action: 'tfVerificar', id: '00000000-0000-4000-8000-000000000000' }, Math.min(VEZES, MAX_VERIFICAR));
  const t0 = performance.now();
  const juntos = await Promise.all([1, 2, 3, 4, 5].map(() => chamar(null)));
  linha('5 GET simultâneos (cada um)', juntos);
  console.log(`5 GET simultâneos (parede)         ${seg((performance.now() - t0) / 1000)}`);
})().catch(e => { console.error('Falhou: ' + e.message); process.exit(1); });
