#!/usr/bin/env node
// Tamanho do contexto da documentação (o que um agente ou dev precisa ler).
//
//   node tests/lib/contexto.js        tabela por arquivo, totais e limites
//
// Tokens são estimados (caracteres / 3,5, média do português com Markdown); servem para comparar, não para cobrar.
// Os limites abaixo valem para o docs_tamanho_test (CI). Mudou um limite? Explique no PR.
'use strict';
const fs = require('fs'), path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const CHARS_POR_TOKEN = 3.5;

// Mapa = lido em toda sessão (CLAUDE.md importa o AGENTS.md). Índice = a primeira coisa lida em docs/.
const MAPA = ['CLAUDE.md', 'AGENTS.md'];
const INDICE = 'docs/README.md';
const LIMITES = {
  mapa: 1500,       // CLAUDE.md + AGENTS.md juntos: só o mapa e as regras em uma linha
  indice: 1000,     // docs/README.md: uma linha por assunto
  arquivo: 3000,    // cada arquivo de docs/ (e README.md, tests/README.md): uma leitura curta; passou, divida ou corte
  docs: 25000       // docs/ inteira: regra, decisão, procedimento e onde fica no código; tela não se descreve
};

const tokens = txt => Math.ceil([...txt].length / CHARS_POR_TOKEN);

function arquivosDocs(dir) {
  const r = [];
  for (const nome of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) r.push(...arquivosDocs(p));
    else if (nome.endsWith('.md')) r.push(p);
  }
  return r;
}

/** Links relativos (Markdown) que apontam para arquivo inexistente: [{arquivo, link}]. Âncoras (#) não são conferidas. */
function linksQuebrados() {
  const r = [];
  const lista = MAPA.concat(arquivosDocs(path.join(RAIZ, 'docs')).map(p => path.relative(RAIZ, p)), ['README.md', 'tests/README.md']);
  for (const a of lista) {
    const p = path.join(RAIZ, a); if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const m of txt.matchAll(/\]\(([^)\s]+)\)/g)) {
      const alvo = m[1].split('#')[0];
      if (!alvo || /^[a-z]+:/i.test(alvo)) continue;
      if (!fs.existsSync(path.join(path.dirname(p), decodeURI(alvo)))) r.push({ arquivo: a, link: m[1] });
    }
  }
  return r;
}

/** Mede tudo e devolve {arquivos: [{arquivo, tokens}], mapa, docs, problemas: [texto]}. */
function medir() {
  const ler = rel => { const p = path.join(RAIZ, rel); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; };
  const docs = arquivosDocs(path.join(RAIZ, 'docs')).map(p => path.relative(RAIZ, p));
  const outros = ['README.md', 'tests/README.md'];
  const arquivos = MAPA.concat(docs, outros).map(a => ({ arquivo: a, tokens: tokens(ler(a)) }));
  const t = a => arquivos.find(x => x.arquivo === a).tokens;
  const mapa = MAPA.reduce((s, a) => s + t(a), 0);
  const totalDocs = docs.reduce((s, a) => s + t(a), 0);
  const problemas = [];
  if (mapa > LIMITES.mapa) problemas.push(`mapa (CLAUDE.md + AGENTS.md) tem ~${mapa} tokens; limite ${LIMITES.mapa}`);
  if (t(INDICE) > LIMITES.indice) problemas.push(`${INDICE} tem ~${t(INDICE)} tokens; limite ${LIMITES.indice}`);
  for (const a of docs.concat(outros)) {
    if (a !== INDICE && t(a) > LIMITES.arquivo) problemas.push(`${a} tem ~${t(a)} tokens; limite ${LIMITES.arquivo} (divida o arquivo)`);
  }
  if (totalDocs > LIMITES.docs) problemas.push(`docs/ inteira tem ~${totalDocs} tokens; limite ${LIMITES.docs}`);
  return { arquivos, mapa, docs: totalDocs, problemas };
}

module.exports = { medir, linksQuebrados, LIMITES, tokens };

if (require.main === module) {
  const m = medir();
  const larg = Math.max(...m.arquivos.map(a => a.arquivo.length));
  for (const a of m.arquivos) console.log(a.arquivo.padEnd(larg), String(a.tokens).padStart(7));
  console.log('');
  console.log('mapa (sempre lido)'.padEnd(larg), String(m.mapa).padStart(7), ' limite', LIMITES.mapa);
  console.log('docs/ inteira'.padEnd(larg), String(m.docs).padStart(7), ' limite', LIMITES.docs);
  console.log('');
  console.log(m.problemas.length ? 'Acima do limite:\n  ' + m.problemas.join('\n  ') : 'Tudo dentro dos limites.');
  const q = linksQuebrados();
  if (q.length) console.log('Links quebrados:\n  ' + q.map(x => x.arquivo + ' -> ' + x.link).join('\n  '));
}
