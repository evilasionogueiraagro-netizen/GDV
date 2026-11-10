// Documentação dentro dos limites de tamanho (tests/lib/contexto.js), sem link quebrado e com autoria humana identificável no HEAD.
// Não usa o fakegas nem o navegador. Tabela completa: node tests/lib/contexto.js
const { execFileSync } = require('child_process');
const { medir, linksQuebrados } = require('./lib/contexto');
const m = medir(), q = linksQuebrados();
let falhas = 0;
for (const p of m.problemas) { console.log('  ✗ ' + p); falhas++; }
for (const x of q) { console.log(`  ✗ link quebrado em ${x.arquivo}: ${x.link}`); falhas++; }
try {
  const info = execFileSync('git', ['log', '-1', '--format=%an <%ae>%n%B'], { cwd: __dirname, encoding: 'utf8' });
  const linhas = info.trim().split('\n');
  const autor = linhas[0] || '';
  const coautores = linhas.slice(1).filter(l => /^Co-authored-by:/i.test(l.trim()));
  const ehBot = s => /\b(claude|anthropic\.com|github-actions|dependabot|bot\b|copilot)/i.test(s);
  const temHumano = !ehBot(autor) || coautores.some(c => !ehBot(c));
  if (!temHumano) {
    console.log(`  ✗ commit HEAD sem humano real identificado ("${autor}"); configure git config user.name e user.email da pessoa responsável`);
    falhas++;
  }
} catch (_) {}
if (!falhas) console.log(`  ✓ docs/ com ~${m.docs} tokens, mapa com ~${m.mapa}, todos os arquivos no limite, links e autoria ok`);
console.log('FALHOU=' + falhas);
process.exit(falhas ? 1 : 0);
