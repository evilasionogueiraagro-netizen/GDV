// O back é dividido em vários .gs com um escopo global só (como no Apps Script). Nenhum arquivo pode depender, ao
// carregar, de algo definido em outro: a carga precisa funcionar em qualquer ordem (o Apps Script carrega na ordem do
// projeto, e o clasp pode mudá-la). Carrega em três ordens num contexto vazio e confere que nada estoura e que nenhum
// nome global aparece em dois arquivos. Não usa o fakegas nem o navegador.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { arquivosGs } = require('./lib/arquivos-gs');
const arqs = arquivosGs();
let falhas = 0;
const ok = (c, msg, extra) => { console.log(`  ${c ? '✓' : '✗'} ${msg}${!c && extra ? ' — ' + extra : ''}`); if (!c) falhas++; };

const ordens = { 'Code.gs primeiro': arqs, 'invertida': arqs.slice().reverse(), 'Code.gs por último': arqs.slice(1).concat(arqs[0]) };
for (const [nome, lista] of Object.entries(ordens)) {
  const ctx = vm.createContext({ console });
  let erro = '';
  for (const a of lista) {
    try { vm.runInContext(fs.readFileSync(a, 'utf8'), ctx, { filename: a }); }
    catch (e) { erro = path.basename(a) + ': ' + e.message; break; }
  }
  ok(!erro, `carga na ordem "${nome}" sem erro`, erro);
}

// nome global (function/const/let/var no começo da linha) definido em mais de um arquivo
const dono = {};
for (const a of arqs) {
  for (const m of fs.readFileSync(a, 'utf8').matchAll(/^(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*))/gm)) {
    const n = m[1] || m[2];
    (dono[n] = dono[n] || []).push(path.basename(a));
  }
}
const repetidos = Object.entries(dono).filter(([, l]) => l.length > 1);
ok(!repetidos.length, `${Object.keys(dono).length} nomes globais, nenhum em dois arquivos`, repetidos.map(([n, l]) => n + ' (' + l.join(', ') + ')').join('; '));

const versao = /^const VERSAO_CODIGO = '([^']+)'/m.exec(fs.readFileSync(arqs[0], 'utf8'));
ok(!!versao, 'VERSAO_CODIGO no Code.gs (o workflow de publicação lê dali)');
console.log('FALHOU=' + falhas);
process.exit(falhas ? 1 : 0);
