const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const { chromium } = require('playwright-core');
const { API, APP } = amb;
const ANO = new Date(Date.now() - 4 * 3600e3).getUTCFullYear();   // ano corrente em Manaus (o app numera TF/turno pelo ano)
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await amb.lancar();
  const cred = async n => { const r = await U.fiscal(n); return [r.token, n]; };
  const aparelho = async ([t, n]) => {
    const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.1, longitude: -60 } });
    await c.addInitScript(([t, n]) => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } }, [t, n]);
    const p = await c.newPage(); p.err = []; p.on('pageerror', e => p.err.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(APP); await p.waitForSelector('.modulo[data-v=home]'); return p;
  };
  const turno = async (p, tf, bva, n) => {
    await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno'); await p.selectOption('#nLocal', bva); await p.fill('#nTF', tf); await p.click('#fTurno button[type=submit]'); await p.waitForSelector('.contador');
    await p.click('[data-go=registrar]'); for (let i = 0; i < n; i++) { await p.waitForSelector('#fVeic'); await p.fill('#placa', 'ABC1D' + String(10 + i)); await p.click('#fVeic > button.botao'); await p.waitForTimeout(400); }
    await p.click('nav [data-v=modulos]'); await p.waitForSelector('.modulo[data-v=home]');
  };
  const sync = p => p.evaluate(async () => { await Sync.sincronizar(); await new Promise(r => setTimeout(r, 800)); });
  const A = await aparelho(await cred('Magda Adegas')), B = await aparelho(await cred('Luciana Ferreira'));
  // simula um aparelho com dados de outro fiscal já baixados por versão antiga
  await turno(A, '96', 'BVA - CEASA', 3); await sync(A);
  await turno(B, '1', 'BVA - JUNDIÁ', 2);
  await B.evaluate(async () => { await Store.gravar('turnos', { id: 'alheio', numeroTF: 'TF-096-A-2026', data: '2026-10-10', usuario: 'Magda Adegas', local: 'BVA - CEASA', fiscal: 'Magda', encerrado: 0, pendente: 0, atualizadoEm: 1 }); await Store.gravar('veiculos', { id: 'v-alheio', turnoId: 'alheio', placa: 'XXX1X11', tipo: 'PA', pessoas: 3, usuario: 'Magda Adegas', pendente: 0, atualizadoEm: 1 }); });
  await sync(B); await sync(A); await sync(B);
  const tb = await B.evaluate(async () => ({ t: (await Store.todos('turnos')).map(x => x.numeroTF), v: (await Store.todos('veiculos')).length }));
  ok(new RegExp(`^TF-001-[AB]-${ANO}$`).test(tb.t.join()) && tb.v === 2, 'aparelho B só tem o próprio turno e os próprios veículos: ' + JSON.stringify(tb));
  const ta = await A.evaluate(async () => ({ t: (await Store.todos('turnos')).map(x => x.numeroTF), v: (await Store.todos('veiculos')).length }));
  ok(new RegExp(`^TF-096-[AB]-${ANO}$`).test(ta.t.join()) && ta.v === 3, 'aparelho A só tem o próprio: ' + JSON.stringify(ta));
  await B.click('nav [data-v=historico]').catch(() => {}); await B.waitForTimeout(800);
  const hist = await B.textContent('#view'); ok(!/TF-096/.test(hist), 'histórico de B não mostra o turno de outro fiscal');
  const dump = await (await fetch(API + '/__dump')).json(); ok(dump.T.length >= 3 && dump.V.length >= 6, 'planilha mantém tudo (turnos ' + (dump.T.length - 1) + ', veículos ' + (dump.V.length - 1) + ')');
  ok(!A.err.length && !B.err.length, 'sem erros ' + JSON.stringify(A.err.concat(B.err)));
  await b.close();
})();
