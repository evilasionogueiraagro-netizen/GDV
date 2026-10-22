// Documentação dentro dos limites de tamanho (tests/lib/contexto.js) e sem link quebrado entre os arquivos.
// Não usa o fakegas nem o navegador. Tabela completa: node tests/lib/contexto.js
const { medir, linksQuebrados } = require('./lib/contexto');
const m = medir(), q = linksQuebrados();
let falhas = 0;
for (const p of m.problemas) { console.log('  ✗ ' + p); falhas++; }
for (const x of q) { console.log(`  ✗ link quebrado em ${x.arquivo}: ${x.link}`); falhas++; }
if (!falhas) console.log(`  ✓ docs/ com ~${m.docs} tokens, mapa com ~${m.mapa}, todos os arquivos no limite e links ok`);
console.log('FALHOU=' + falhas);
process.exit(falhas ? 1 : 0);
