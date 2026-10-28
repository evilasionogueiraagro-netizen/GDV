const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Cancelar turno aberto por engano: só quem abriu, sem TF lavrado. Nada é apagado: o turno fica na planilha com cancelado = 1 (e os
// veículos dele excluídos), fora do painel, do histórico do aparelho e das letras do nº (o próximo turno com o mesmo nº volta a ser A).
// Envio antigo do aparelho não "descancela"; turno com TF (de um colega, p.ex.) fica só encerrado. Dados fictícios.
const { API, APP } = amb;
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);

(async () => {
  const b = await amb.lancar();
  const f = await U.fiscal('Fiscal Cancela Teste');
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.1, longitude: -60.0 } });
  await c.addInitScript(([t]) => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Fiscal Cancela Teste'); localStorage.setItem('gdv.semInstalar', '1'); } }, [f.token]);
  const p = await c.newPage(); const err = [], toasts = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  const semPendentes = async () => { for (let i = 0; i < 60; i++) { if (await p.evaluate(async () => !Sync.emAndamento() && !(await Store.todos('turnos')).some(t => t.pendente) && !(await Store.todos('veiculos')).some(v => v.pendente))) return; await p.waitForTimeout(250); } throw new Error('pendentes'); };
  const linhas = async aba => { const d = await (await fetch(API + '/__tudo')).json(); const l = d[aba] || []; return l.slice(1).map(r => Object.fromEntries(l[0].map((k, i) => [k, r[i]]))); };
  const abrir = async n => {
    await p.waitForSelector('#fTurno #nLocal', { timeout: 15000 }); await p.selectOption('#nLocal', 'BVA - CEASA'); await p.fill('#nTF', String(n));
    await p.click('#fTurno button[type=submit]'); await p.waitForSelector('.contador');
    return p.evaluate(async () => Store.obter('turnos', await Store.meta('turnoAtual')));
  };

  console.log('1) cancelar o turno aberto por engano (com 1 veículo)');
  await p.goto(APP); await p.waitForSelector('.modulo[data-v=home]'); await p.click('.modulo[data-v=home]');
  const t1 = await abrir(77);
  await p.waitForTimeout(800); await p.waitForSelector('#cancelarTurno'); await p.screenshot({ path: amb.saida('turno_cancelar.png'), fullPage: true });
  ok(await p.isVisible('#cancelarTurno') && await p.isVisible('#encerrar'), 'tela do turno: "Encerrar turno" e "Cancelar turno (aberto por engano)"');
  await p.click('[data-go=registrar]'); await p.waitForSelector('#fVeic'); await p.fill('#placa', 'ABC1D23'); await p.click('#fVeic > button.botao'); await p.waitForTimeout(400);
  await p.click('nav [data-v=home]'); await p.waitForSelector('#cancelarTurno');
  await p.click('#cancelarTurno'); await p.waitForSelector('#fTurno', { timeout: 10000 });
  ok(!(await p.evaluate(() => Store.meta('turnoAtual'))), 'cancelado: volta para "Iniciar turno"');
  await p.evaluate(() => Sync.sincronizar()); await semPendentes();
  let T = (await linhas('Turnos')).find(x => x.id === t1.id), V = (await linhas('Veiculos')).filter(x => x.turnoId === t1.id);
  ok(T && Number(T.cancelado) === 1 && Number(T.canceladoEm) > 0 && Number(T.encerrado) === 1 && V.length === 1 && Number(V[0].excluido) === 1, 'planilha: o turno fica (cancelado = 1, encerrado) e o veículo excluído — nada apagado', [T && T.cancelado, V]);
  const g = await amb.gerente('Gerente Cancela Teste');
  let d = await post({ action: 'painelDados', key: g.token, de: hoje, ate: hoje });
  ok(d.ok && !d.turnos.some(x => x.id === t1.id) && !d.veiculos.some(x => x.turnoId === t1.id), 'painel: turno cancelado e seus veículos fora');
  await p.click('nav [data-v=historico]'); await p.waitForSelector('#hOut .card'); await p.waitForTimeout(300);
  ok(!(await p.textContent('#hOut')).includes(t1.numeroTF), 'histórico do aparelho: sem o turno cancelado');

  console.log('2) envio antigo não descancela; o mesmo nº volta a ser a letra A');
  let r = await post({ action: 'sync', key: f.token, since: 0, turnos: [{ ...t1, cancelado: 0, canceladoEm: 0, encerrado: 0, fim: '', atualizadoEm: Date.now() + 5000 }] });
  T = (await linhas('Turnos')).find(x => x.id === t1.id);
  ok(r.ok && Number(T.cancelado) === 1 && Number(T.encerrado) === 1, 'envio com cancelado = 0 (aparelho antigo) não reabre nem descancela', [T.cancelado, T.encerrado]);
  await p.click('nav [data-v=home]');
  const t2 = await abrir(77);
  await p.evaluate(() => Sync.sincronizar()); await semPendentes();
  T = (await linhas('Turnos')).find(x => x.id === t2.id);
  ok(T && T.letra === 'A' && /-A-/.test(T.numeroTF), 'novo turno com o mesmo nº: letra A (o cancelado não conta)', T && T.numeroTF);

  console.log('3) turno com TF não se cancela (app e servidor)');
  await p.evaluate(async id => { await Store.gravar('tfs', { id: 'tf-cancela-1', turnoId: id, numeroTxt: '0001/2026', placa: 'ABC1D23', cancelado: 0, data: '2026-10-28', pendente: 0 }); }, t2.id);
  await p.click('#cancelarTurno'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => !!Store.meta) && (await p.evaluate(() => Store.meta('turnoAtual'))) === t2.id && /não pode ser cancelado/.test(await p.textContent('#toast')), 'app: com TF lavrado, recusa e explica', await p.textContent('#toast'));
  r = await post({ action: 'sync', key: f.token, since: 0, tfs: [{ id: 'tf-srv-1', barreira: 'BVA-CEASA', ano: 2026, numero: 901, numeroTxt: '0901/2026', turnoId: t2.id, data: hoje, hora: '10:00', fiscal: 'Fiscal Cancela Teste', local: 'BVA - CEASA', placa: 'ABC1D23', procedimento: 'liberacao', produtos: '[]', cancelado: 0, criadoEm: Date.now(), atualizadoEm: Date.now() }] });
  r = await post({ action: 'sync', key: f.token, since: 0, turnos: [{ ...t2, numeroTF: T.numeroTF, letra: 'A', cancelado: 1, canceladoEm: Date.now(), encerrado: 1, fim: '10:30', atualizadoEm: Date.now() + 9000 }] });
  T = (await linhas('Turnos')).find(x => x.id === t2.id);
  ok(r.ok && Number(T.cancelado) !== 1 && Number(T.encerrado) === 1, 'servidor: turno com TF fica só encerrado (o cancelamento não vale)', [T.cancelado, T.encerrado]);

  console.log('4) colega no turno compartilhado não vê "Cancelar turno"');
  ok(await p.evaluate(() => { const t = { usuario: 'Outro Fiscal', numeroTF: 'x' }; return !botaoFim(t).includes('cancelarTurno'); }), 'colega: só "Sair do turno"');
  ok(!err.length, 'sem erros de página', err);
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
