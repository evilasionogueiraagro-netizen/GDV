// Design system único (docs/DESIGN.md): toda tela carrega web/css/design.css ANTES do próprio CSS, o arquivo é guardado para uso
// offline, nenhum CSS de tela redefine os tokens de cor, não há ícone desenhado à mão (só a Lucide, em web/js/icones.js) e a
// versão da Lucide é a mesma no código, na licença e na documentação. Não usa o fakegas nem o navegador.
const fs = require('fs'), path = require('path');
const WEB = path.join(__dirname, '..', 'web'), DOCS = path.join(__dirname, '..', 'docs');
const ler = (...p) => fs.readFileSync(path.join(...p), 'utf8');
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };

// 1) toda tela (modelos impressos de web/documentos ficam de fora) carrega o design.css primeiro
const TELAS = { 'index.html': 'css/design.css', 'painel/index.html': '../css/design.css', 'administrativo/index.html': '../css/design.css',
  'dashboard/index.html': '../css/design.css', 'inicio/index.html': '../css/design.css', 'verificar.html': 'css/design.css', 'manual.html': 'css/design.css',
  'painel/manual.html': '../css/design.css', 'administrativo/manual.html': '../css/design.css' };
for (const [tela, href] of Object.entries(TELAS)) {
  const h = ler(WEB, tela);
  const dentro = h.slice(0, h.indexOf('</head>'));
  const iDesign = dentro.indexOf(`<link rel="stylesheet" href="${href}">`);
  const outros = [...dentro.matchAll(/<link rel="stylesheet" href="[^"]+"|<style/g)].map(m => m.index).filter(i => i !== iDesign);
  ok(iDesign >= 0, `${tela}: carrega ${href}`);
  ok(iDesign >= 0 && outros.every(i => i > iDesign), `${tela}: o design.css vem antes de qualquer outro CSS`);
  ok(fs.existsSync(path.join(WEB, tela, '..', href)), `${tela}: o arquivo ${href} existe`);
}

// 2) offline: app de campo (sw.js) e painel (painel/sw.js) guardam o design.css; os dois contam com o ícone da Lucide
ok(/ARQUIVOS = \[[^\]]*'css\/design\.css'/.test(ler(WEB, 'sw.js')), 'sw.js (app de campo) guarda css/design.css');
ok(/ARQUIVOS = \[[^\]]*'\.\.\/css\/design\.css'/.test(ler(WEB, 'painel/sw.js')), 'painel/sw.js guarda ../css/design.css (painel, Modo TV e portal)');

// 3) tokens de cor só no design.css
const TOKENS = ['marca', 'marca2', 'pg', 'sf', 'sf2', 'ink', 'ink2', 'mut', 'borda', 'grade', 'base', 'critico', 'atencao', 'bom', 'serio', 'link', 'destaque', 'sel'];
const reDef = new RegExp(`(^|[\\s{;])--(${TOKENS.join('|')})\\s*:`);
function varrer(dir, f) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n), st = fs.statSync(p);
    if (st.isDirectory()) { if (!['vendor', 'documentos', 'dados', 'img'].includes(n)) varrer(p, f); } else f(p);
  }
}
const redefine = [], desenhados = [];
varrer(WEB, p => {
  const rel = path.relative(WEB, p).replace(/\\/g, '/');
  if (/\.(css|html)$/.test(rel) && rel !== 'css/design.css') ler(p).split('\n').forEach((l, i) => { if (reDef.test(l)) redefine.push(`${rel}:${i + 1}`); });
  // 4) ícone desenhado à mão: <svg no código (a Lucide mora em js/icones.js; vendor e modelos impressos ficam de fora)
  if (/\.(js|html)$/.test(rel) && rel !== 'js/icones.js') ler(p).split('\n').forEach((l, i) => { if (/<svg\b/.test(l)) desenhados.push(`${rel}:${i + 1}`); });
});
ok(!redefine.length, 'nenhum CSS ou página redefine os tokens de cor (só css/design.css)', redefine);
ok(!desenhados.length, 'nenhum <svg> à mão: ícones só via icone() de js/icones.js (Lucide)', desenhados);

// 5) Lucide: versão e licença guardadas, um comentário com o nome da Lucide em cada ícone
const ico = ler(WEB, 'js/icones.js'), lic = ler(WEB, 'vendor/lucide/LICENSE'), des = ler(DOCS, 'DESIGN.md');
const versao = (/lucide-static\s+versão (\d+\.\d+\.\d+)/.exec(ico) || [])[1];
ok(!!versao && /ISC/.test(ico.slice(0, 700)), 'icones.js diz a versão da Lucide e a licença ISC no topo', versao);
ok(!!versao && lic.includes(`versão ${versao}`) && /ISC License/.test(lic), 'web/vendor/lucide/LICENSE traz a mesma versão e o texto da licença');
ok(!!versao && des.includes(`Lucide, versão ${versao}`), 'docs/DESIGN.md cita a mesma versão da Lucide');
const linhas = ico.split('\n').filter(l => /^\s+'?[a-z][a-z-]*'?: '<(path|circle|rect|line|polyline|ellipse|polygon)/.test(l));
ok(linhas.length >= 50 && linhas.every(l => /\/\/ [a-z0-9-]+\s*$/.test(l)), `cada um dos ${linhas.length} ícones aponta para um ícone da Lucide (comentário no fim da linha)`);
ok(!/<(circle|path) [^>]*fill="(?!none)/.test(ico), 'ícones sem preenchimento (traço, como a Lucide)');

console.log('FALHOU=' + falhas);
process.exit(falhas ? 1 : 0);
