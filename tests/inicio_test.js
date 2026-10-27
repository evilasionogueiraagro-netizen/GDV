const amb = require('./lib/amb');
// Página inicial (web/inicio/): atalhos para painel, app de campo, Portal do Administrativo e dashboard público.
// Confere os links (todos abrem), celular e computador sem rolagem horizontal, modo escuro e que a página não chama a API.
const { ORIGEM, API } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
const INICIO = ORIGEM + '/inicio/';
(async () => {
  const b = await amb.lancar();
  const c = await b.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' });
  const p = await c.newPage(), erros = [], api = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400) erros.push(r.status() + ' ' + r.url()); });
  p.on('request', r => { if (r.url().startsWith(API)) api.push(r.url()); });
  await p.goto(INICIO);

  const cartoes = await p.$$eval('.in-cartao', as => as.map(a => ({ titulo: a.querySelector('h2').textContent.trim(), href: a.href, entrar: a.querySelector('.in-entrar').textContent.trim() })));
  ok(cartoes.map(x => x.titulo).join() === 'Painel gerencial,App de campo,Portal do Administrativo,Dashboard público', 'quatro destinos, na ordem', cartoes.map(x => x.titulo));
  ok(cartoes.every(x => /^Como entrar:/.test(x.entrar)), 'cada destino diz como entrar');
  const esperado = { 'Painel gerencial': '/painel/', 'App de campo': '/', 'Portal do Administrativo': '/administrativo/', 'Dashboard público': '/dashboard/' };
  ok(cartoes.every(x => new URL(x.href).pathname === esperado[x.titulo]), 'links relativos levam a cada parte', cartoes.map(x => new URL(x.href).pathname));
  const links = await p.$$eval('a[href]', as => as.map(a => a.href));
  const st = await Promise.all(links.map(u => fetch(u).then(r => r.status)));
  ok(st.every(s => s === 200), 'todos os links abrem (200)', links.map((u, i) => new URL(u).pathname + ' ' + st[i]));
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.in-grade')).gridTemplateColumns.split(' ').length) === 2, 'computador: duas colunas');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'computador: sem rolagem horizontal');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(await p.textContent('body')), 'sem emojis no texto');

  await p.setViewportSize({ width: 360, height: 780 }); await p.waitForTimeout(150);
  const cel = await p.evaluate(() => ({ semRolagem: document.documentElement.scrollWidth <= innerWidth + 1,
    colunas: getComputedStyle(document.querySelector('.in-grade')).gridTemplateColumns.split(' ').length,
    dentro: [...document.querySelectorAll('.in-cartao')].every(a => { const r = a.getBoundingClientRect(); return r.left >= 16 - 1 && r.right <= innerWidth - 16 + 1; }) }));
  ok(cel.semRolagem && cel.colunas === 1 && cel.dentro, '360 px: uma coluna, margem de 16 px, sem rolagem horizontal', cel);
  await p.screenshot({ path: amb.saida('inicio_celular.png'), fullPage: true });

  await p.click('#in-painel'); await p.waitForURL(/\/painel\/$/);
  ok(new URL(p.url()).pathname === '/painel/', 'tocar no cartão abre o painel');
  ok(api.length === 0, 'a página inicial não chama a API', api);

  const e = await b.newContext({ viewport: { width: 1366, height: 800 }, colorScheme: 'dark', serviceWorkers: 'block' });
  const pe = await e.newPage(); await pe.goto(INICIO);
  const fundo = await pe.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(fundo === 'rgb(13, 13, 13)', 'modo escuro: fundo escuro', fundo);
  await pe.screenshot({ path: amb.saida('inicio_escuro.png') });

  ok(erros.length === 0, 'sem erros de console/página/HTTP', erros);
  await b.close();
  if (falhas) { console.log('FALHOU=' + falhas); process.exitCode = 1; }
})().catch(e => { console.error(e); process.exitCode = 1; });
