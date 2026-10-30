const amb = require('./lib/amb'); const U = require('./lib/usuarios');
// Histórico → "Buscar meus turnos na planilha": o turno encerrado que sumiu do celular (aparelho novo, limpeza) volta com os veículos e o
// Termo sai de novo. Só os turnos do próprio login (e os em que entrou pelo código); turno de outro fiscal não vem. Dados fictícios.
const { APP, API } = amb;
let falhas = 0;
const ok = (c, m, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); if (!c) falhas++; };
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
(async () => {
  const b = await amb.lancar(), A = await U.fiscal('Fulano Ficticio Teste'), B = await U.fiscal('Beltrano Ficticio Teste');
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.119, longitude: -60.0217, accuracy: 10 } });
  await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [A.token, A.nome]);
  await c.addInitScript(() => { if (window !== window.top) window.print = () => { window.top.__prints = (window.top.__prints || []).concat([document.body.innerText.replace(/\s+/g, ' ')]); }; });
  const p = await c.newPage(), err = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  const sinc = async () => { await p.evaluate(() => Sync.sincronizar()); await p.waitForFunction(() => ['ok', 'idle'].includes(Sync.estado().tipo) && !Sync.estado().pend, null, { timeout: 15000 }); };
  await p.goto(APP); await p.waitForSelector('.modulo', { timeout: 15000 });
  await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno');
  await p.fill('#nTF', '30'); await p.selectOption('#nPosto', 'Fixa').catch(() => {}); await p.selectOption('#nLocal', 'BVA - CEASA').catch(() => p.fill('#nLocal', 'BVA - CEASA')); await p.fill('#nUnidade', 'MANAUS').catch(() => {});
  await p.click('#fTurno button[type=submit]'); await p.waitForSelector('.contador');
  for (const [i, pl] of ['AAA1A11', 'BBB2B22'].entries()) {                      // espera cada veículo entrar no turno (CI mais lento)
    await p.click('nav [data-v=registrar]'); await p.waitForSelector('#fVeic'); await p.fill('#placa', pl); await p.click('#fVeic > button');
    await p.waitForFunction(n => Store.todos('veiculos').then(v => v.filter(x => !x.excluido).length >= n), i + 1, { timeout: 10000, polling: 200 });
  }
  await p.click('nav [data-v=home]'); await p.click('#encerrar'); await p.waitForSelector('[data-doc=termo]'); await sinc();
  const turnoId = (await p.evaluate(() => Store.todos('turnos')))[0].id;
  // turno de outro fiscal no mesmo período: não pode vir
  await post({ action: 'sync', key: B.token, since: 9e15, turnos: [{ id: 'turno-beltrano', numeroTF: '0099/2026', data: new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), inicio: '07:00', fim: '19:00',
    fiscal: B.nome, local: 'BVA - CEASA', unidade: 'MANAUS', posto: 'Fixa', encerrado: 1, criadoEm: Date.now(), atualizadoEm: Date.now() }], veiculos: [] });
  // o turno some do celular (como acontecia com a limpeza do aparelho)
  await p.evaluate(async () => { await Store.apagar('turnos', (await Store.todos('turnos')).map(t => t.id)); await Store.apagar('veiculos', (await Store.todos('veiculos')).map(v => v.id)); });
  await p.click('nav [data-v=historico]'); await p.waitForSelector('#recuperar');
  ok(!(await p.locator(`[data-doc=termo][data-id="${turnoId}"]`).count()), 'o turno sumiu do celular: sem o Termo no Histórico');
  await p.click('#recuperar'); await p.waitForSelector(`[data-doc=termo][data-id="${turnoId}"]`, { timeout: 15000 }).catch(() => {});
  ok(await p.locator(`[data-doc=termo][data-id="${turnoId}"]`).count() === 1, '"Buscar meus turnos na planilha": o turno volta ao Histórico com o Termo');
  ok(!(await p.locator('[data-doc=termo][data-id="turno-beltrano"]').count()), 'turno de outro fiscal não vem');
  await p.evaluate(() => { window.__prints = []; }); await p.click(`[data-doc=termo][data-id="${turnoId}"]`);
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 10000 });
  const termo = await p.evaluate(() => window.__prints[0]);
  ok(/Fulano Ficticio Teste/.test(termo) && /Foram fiscalizados 2 veículos/.test(termo), 'o Termo sai de novo, com os 2 veículos', termo.slice(0, 200));
  await sinc(); await p.click('nav [data-v=historico]'); await p.waitForSelector('#hOut');
  ok(await p.locator(`[data-doc=termo][data-id="${turnoId}"]`).count() === 1, 'depois de sincronizar, o turno continua no Histórico');
  const r = await post({ action: 'turnoRecuperar', key: A.token, de: '2026-01-01', ate: '2026-12-31' });
  ok(!r.ok && /longo demais/.test(r.erro), 'período de mais de 62 dias é recusado', r.erro);
  ok(!err.length, 'sem erros de página', err);
  await b.close(); console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
