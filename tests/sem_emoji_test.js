// Interface sem emojis (docs/DESIGN.md): nenhum arquivo de web/ (fora de vendor/) pode ter emoji. Ícone vem de
// web/js/icones.js. Símbolos tipográficos de texto (✓ ✕ ☐ ☑ ❚) são permitidos. Não usa o fakegas nem o navegador.
const fs = require('fs'), path = require('path');
const WEB = path.join(__dirname, '..', 'web');
const EMO = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const PERMITIDOS = new Set(['✓', '✕', '☐', '☑', '❚']);
let falhas = 0, arquivos = 0;

function varrer(dir) {
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome), st = fs.statSync(p);
    if (st.isDirectory()) { if (nome !== 'vendor') varrer(p); continue; }
    if (!/\.(js|html|css|json|webmanifest)$/.test(nome)) continue;
    arquivos++;
    fs.readFileSync(p, 'utf8').split('\n').forEach((linha, i) => {
      for (const ch of linha) {
        if (EMO.test(ch) && !PERMITIDOS.has(ch)) {
          console.log(`  ✗ ${path.relative(WEB, p)}:${i + 1} tem o emoji "${ch}" (use icone() de web/js/icones.js): ${linha.trim().slice(0, 100)}`);
          falhas++; break;
        }
      }
    });
  }
}
varrer(WEB);
if (!falhas) console.log(`  ✓ ${arquivos} arquivos de web/ sem emoji`);
console.log('FALHOU=' + falhas);
process.exit(falhas ? 1 : 0);
