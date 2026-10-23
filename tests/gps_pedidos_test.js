const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const { chromium } = require('playwright-core');
const { API, APP } = amb;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await amb.lancar();
  const r = await U.fiscal('Ana Paula Lima');
  const c = await b.newContext({ viewport: { width: 400, height: 900 } });                // SEM permissão de localização (estado "prompt")
  await c.addInitScript(([t]) => {
    if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Ana Paula Lima'); localStorage.setItem('gdv.semInstalar', '1'); }
    window.__pedidos = 0; const orig = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (ok, no, o) => { window.__pedidos++; no && no({ code: 1 }); };   // conta cada pedido (= janela de permissão)
    navigator.permissions.query = async () => ({ state: 'prompt' });
  }, [r.token]);
  const p = await c.newPage(); const err = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(APP); await p.waitForSelector('.modulo[data-v=tf]');
  await p.click('.modulo[data-v=tf]'); await p.waitForSelector('button[data-tf=novo]'); await p.click('button[data-tf=novo]'); await p.waitForSelector('#tfForm'); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => window.__pedidos) === 0, 'abrir um TF não pede localização');
  await p.click('nav [data-v=modulos]'); await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm, #pce-novolev');
  if (await p.locator('#pceServForm').count()) { await p.selectOption('#pce-s-cargo', { index: 1 }); await p.fill('#pce-s-matricula', '1'); await p.selectOption('#pce-s-lotacao', 'Manaus'); await p.click('#pce-s-salvar'); }
  await p.waitForSelector('#pce-novolev'); await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm'); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => window.__pedidos) === 0, 'abrir um levantamento do PCE não pede localização');
  ok(/Atualizar GPS/.test(await p.textContent('#pceLevForm')), 'levantamento orienta a tocar em "Atualizar GPS"');
  await p.click('[data-pce=gps]').catch(() => p.click('text=Atualizar GPS')); await p.waitForTimeout(500);
  ok(await p.evaluate(() => window.__pedidos) === 1, 'tocar em "Atualizar GPS" pede (uma vez)');
  ok(!err.length, 'sem erros ' + JSON.stringify(err));
  await b.close();
})();
