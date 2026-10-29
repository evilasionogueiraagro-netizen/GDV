const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// App de campo: o redesenho da sincronização automática (evento gdv-dados, a cada 20 s a 1 min) não volta a tela ao topo
// e não redesenha enquanto o fiscal digita num campo da tela.
const { APP } = amb;
let falhas = 0;
const ok = (c, m, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); if (!c) falhas++; };

(async () => {
  const b = await amb.lancar(), f = await U.fiscal('Ana Paula Lima');
  const c = await b.newContext({ viewport: { width: 400, height: 800 } });
  await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [f.token, f.nome]);
  const p = await c.newPage(), err = []; p.on('pageerror', e => err.push(e.message));
  await p.goto(APP); await p.waitForSelector('.modulo', { timeout: 15000 });
  await p.click('.modulo[data-v=pce]'); await p.waitForTimeout(800);
  const vw = await p.evaluate(() => VIEW);
  // tela comprida (a lista do PCE com muitos levantamentos): rola até embaixo e a sincronização termina
  await p.evaluate(() => { document.querySelector('#view').style.minHeight = '4000px'; window.scrollTo(0, 2500); });
  const antes = await p.evaluate(() => window.scrollY);
  await p.evaluate(() => window.dispatchEvent(new Event('gdv-dados'))); await p.waitForTimeout(800);
  const depois = await p.evaluate(() => window.scrollY);
  ok(antes > 2000 && Math.abs(depois - antes) <= 2, `sincronização na tela "${vw}": a rolagem fica onde estava`, { antes, depois });
  // digitando num campo: a tela não é redesenhada (o texto e o foco ficam)
  await p.evaluate(() => { const i = document.createElement('input'); i.id = 'campoTeste'; document.querySelector('#view').prepend(i); i.focus(); i.value = 'digitando'; });
  await p.evaluate(() => window.dispatchEvent(new Event('gdv-dados'))); await p.waitForTimeout(800);
  ok(await p.evaluate(() => !!document.querySelector('#campoTeste') && document.activeElement.id === 'campoTeste'), 'com o fiscal digitando, a sincronização não redesenha a tela');
  // trocar de tela continua indo para o topo
  await p.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 2500); go('modulos'); }); await p.waitForTimeout(500);
  ok(await p.evaluate(() => window.scrollY) === 0, 'abrir outra tela começa no topo');
  ok(!err.length, 'sem erros de página', err);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
