// Carrega módulos do navegador (web/js, web/documentos, web/painel/js) e do back (apps-script/*.gs) no Node, com o módulo vm,
// sem fakegas nem Chromium. Os arquivos rodam num contexto com um window/document mínimos; as declarações de topo (const/function)
// ficam visíveis entre os arquivos do mesmo contexto, como no navegador.
//
//   const { carregar, verificador } = require('./vm_loader');
//   const G = carregar(['web/js/config.js', 'web/js/tf.js'], ['CONFIG', 'TFUI']);   // G.CONFIG, G.TFUI
//   const { ok, fim } = verificador();  ok(cond, 'mensagem', extra); ...; fim();
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.resolve(__dirname, '..', '..');

/** Elemento falso: aceita as chamadas comuns de DOM e não faz nada. */
function elementoFalso() {
  const el = { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, children: [], value: '', textContent: '', innerHTML: '',
    appendChild: x => x, removeChild: x => x, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, focus() {}, click() {}, remove() {}, getContext: () => null };
  return el;
}

/** Contexto com window, document, localStorage e navigator falsos. `extra` acrescenta ou troca globais. */
function contexto(extra = {}) {
  const mem = new Map();
  const doc = { readyState: 'complete', body: elementoFalso(), head: elementoFalso(), documentElement: elementoFalso(), createElement: elementoFalso, createTextNode: () => elementoFalso(),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, TextEncoder, TextDecoder, Blob: typeof Blob !== 'undefined' ? Blob : undefined,
    document: doc, navigator: { onLine: true, userAgent: 'node' }, location: { href: 'http://localhost/', search: '', hash: '', origin: 'http://localhost' },
    localStorage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear() },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    ...extra
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  return vm.createContext(ctx);
}

/**
 * Roda os arquivos (caminhos relativos à raiz do repositório), na ordem, num contexto novo (ou em `o.ctx`) e devolve
 * { nome: valor } das globais pedidas em `nomes`, mais `ctx` (para carregar mais arquivos ou avaliar expressões).
 */
function carregar(arquivos, nomes = [], o = {}) {
  const ctx = o.ctx || contexto(o.globais);
  for (const a of [].concat(arquivos)) vm.runInContext(fs.readFileSync(path.join(RAIZ, a), 'utf8'), ctx, { filename: a });
  const r = nomes.length ? vm.runInContext(`({ ${nomes.map(n => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')} })`, ctx) : {};
  r.ctx = ctx;
  return r;
}
/** Avalia uma expressão no contexto (ex.: função interna de um .gs). */
const avaliar = (ctx, expr) => vm.runInContext(expr, ctx);

/** Arquivos .gs do back (apps-script/), relativos à raiz. */
const gs = (...nomes) => nomes.map(n => 'apps-script/' + n + (n.endsWith('.gs') ? '' : '.gs'));

/**
 * Back inteiro (todos os .gs, Code.gs primeiro, como no fakegas) num contexto vm, sem planilha. Funções de leitura podem ser trocadas
 * depois por atribuição no contexto (ex.: G.ctx.lerLeitura_ = () => []), porque as declarações de função de topo são globais.
 */
function carregarBack(nomes = [], o = {}) {
  const { arquivosGs } = require('../lib/arquivos-gs');
  return carregar(arquivosGs().map(a => path.relative(RAIZ, a)), nomes, o);
}

/** Copia um valor do contexto vm para o realm do Node (para comparar com deepStrictEqual e JSON). */
const copia = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** ok(cond, msg, extra) imprime ✓/✗ como os demais testes; fim() imprime FALHOU=N e define o código de saída. */
function verificador() {
  let falhas = 0;
  const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 600))); if (!c) falhas++; return !!c; };
  const fim = () => { console.log('FALHOU=' + falhas); process.exitCode = falhas ? 1 : 0; };
  return { ok, fim, falhas: () => falhas };
}

/** CSV simples (aspas duplas, vírgula, quebra de linha) -> linhas de células. */
function csv(txt) {
  const L = []; let l = [], c = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"' && txt[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { l.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; l.push(c); c = ''; if (l.some(x => x !== '')) L.push(l); l = []; }
    else c += ch;
  }
  if (c !== '' || l.length) { l.push(c); L.push(l); }
  return L;
}

module.exports = { RAIZ, contexto, carregar, carregarBack, avaliar, gs, copia, verificador, csv, elementoFalso };
