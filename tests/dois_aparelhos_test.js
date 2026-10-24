const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// O mesmo login com a barreira aberta em dois aparelhos (o PC e o celular da BVA). App: o segundo aparelho vê o turno em andamento e
// entra nele; os veículos dos dois vão para o mesmo turno (uma linha em Turnos). Painel: turnos do mesmo login na mesma barreira com
// horários sobrepostos (lançados antes desta mudança) são uma barreira em andamento só, com os veículos somados, e o "Encerrar turno"
// encerra os dois. Dados fictícios.
const { API, PAINEL: WEB, APP } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500))); if (!c) falhas++; };
const M = ms => new Date(ms - 4 * 3600e3), diaM = ms => M(ms).toISOString().slice(0, 10), hmM = ms => M(ms).toISOString().slice(11, 16);
const aba = async n => { const rows = await get('/__aba?nome=' + n); const cab = rows[0]; return rows.slice(1).map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]))); };

(async () => {
  const b = await amb.lancar();
  try {
    const F = await U.fiscal('Fulano Ficticio Teste');
    const e2 = await post({ action: 'entrar', matricula: F.matricula, senha: F.senha, aplicativo: 'campo', aparelhoId: 'aparelho-teste-pc-' + process.pid });
    ok(e2.ok, 'o mesmo login entra no segundo aparelho', e2.erro);
    const abrirApp = async ls => {
      const c = await b.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'America/Manaus', permissions: ['geolocation'], geolocation: { latitude: -3.1190, longitude: -60.0217, accuracy: 10 } });
      await c.route(u => !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u)), r => r.abort());
      await c.addInitScript(i => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, ls);
      const p = await c.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message)); p.on('dialog', d => d.accept());
      await p.goto(APP); await p.waitForSelector('.modulo'); await p.evaluate(() => Sync.sincronizar());
      await p.click('.modulo[data-v=home]'); return p;
    };
    const registrar = async (p, placa) => { await p.click('nav [data-v=registrar]'); await p.waitForSelector('#fVeic'); await p.fill('#placa', placa); await p.click('#fVeic > button'); await p.waitForTimeout(500); };
    const sinc = p => p.evaluate(() => Sync.sincronizar());

    console.log('1) app: o segundo aparelho entra no turno aberto');
    const cel = await abrirApp(F.ls);
    await cel.waitForSelector('#fTurno'); await cel.fill('#nTF', '7'); await cel.selectOption('#nPosto', 'Fixa'); await cel.selectOption('#nLocal', 'BVA - CEASA');
    await cel.click('#fTurno button[type=submit]'); await cel.waitForSelector('#encerrar');
    await registrar(cel, 'ABC1D23'); await sinc(cel);
    const pc = await abrirApp({ ...F.ls, 'gdv.key': e2.token });
    await pc.waitForSelector('#fTurno'); await sinc(pc);
    await pc.waitForSelector('[data-entrar]', { timeout: 8000 }).catch(() => {});
    ok(/Turno em andamento com o seu login/.test(await pc.textContent('main')) && /BVA - CEASA/.test(await pc.textContent('#nAbertoBox')), 'PC: aparece o turno aberto no celular, com "Continuar neste turno"');
    await pc.click('[data-entrar]'); await pc.waitForSelector('#encerrar');
    await registrar(pc, 'ABC1D24'); await sinc(pc); await sinc(cel);
    await cel.click('nav [data-v=home]'); await cel.waitForSelector('.contador h1');
    ok((await cel.textContent('.contador h1')).trim() === '2', 'celular: o turno mostra os 2 veículos (1 de cada aparelho)', await cel.textContent('.contador h1'));
    const ts = (await aba('Turnos')).filter(t => t.usuario === F.nome), vs = await aba('Veiculos');
    ok(ts.length === 1 && vs.filter(v => v.turnoId === ts[0].id).length === 2, 'planilha: 1 turno com os 2 veículos', [ts.length, vs.filter(v => ts[0] && v.turnoId === ts[0].id).length]);

    console.log('2) app: iniciar outro turno na mesma BVA pergunta e entra no aberto');
    const pc2 = await abrirApp({ ...F.ls, 'gdv.key': e2.token, 'gdv.outro': '1' });
    await pc2.evaluate(() => Store.setMeta('turnoAtual', '')); await pc2.click('nav [data-v=home]').catch(() => {}); await pc2.click('.modulo[data-v=home]').catch(() => {});
    await pc2.waitForSelector('#fTurno'); await pc2.fill('#nTF', '8'); await pc2.selectOption('#nPosto', 'Fixa'); await pc2.selectOption('#nLocal', 'BVA - CEASA');
    await pc2.click('#fTurno button[type=submit]'); await pc2.waitForSelector('#encerrar'); await sinc(pc2);
    ok((await aba('Turnos')).filter(t => t.usuario === F.nome).length === 1, 'confirmou "continuar": nenhum turno novo na planilha');

    console.log('3) painel: dois turnos do mesmo login abertos na mesma barreira contam como um');
    const K = await amb.carga(), AG = Date.now(), ini1 = AG - 3 * 3600e3, ini2 = AG - 40 * 60e3;
    const T = (id, ini) => ({ id, numeroTF: 'TF-' + id, data: diaM(ini), letra: 'A', inicio: hmM(ini), fim: '', fiscal: 'Beltrano Ficticio Teste', local: 'BVA - JUNDIÁ', unidade: 'BVA - JUNDIÁ',
      posto: 'Fixa', encerrado: 0, criadoEm: ini, atualizadoEm: ini, latIni: '-1.0', lngIni: '-60.5', precIni: '9' });
    const V = (id, turnoId) => ({ id, turnoId, hora: hmM(AG - 10 * 60e3), placa: 'ABC1D' + id.slice(-2), tipo: 'PA', pessoas: 1, obs: '', excluido: 0, criadoEm: AG, atualizadoEm: AG });
    const r = await post({ action: 'sync', key: K, since: 0, turnos: [T('dj1', ini1), T('dj2', ini2)], veiculos: [V('vj11', 'dj1'), V('vj12', 'dj1'), V('vj21', 'dj2')] });
    ok(r.ok, 'dois turnos abertos na BVA - JUNDIÁ (mesmo login)', r.erro);
    const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus' });
    await c.route(u => !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u)), rt => rt.abort());
    await c.addInitScript(t => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API);
      localStorage.setItem('gdv.painel.token', t); localStorage.setItem('gdv.painel.nome', 'Carga Dados Teste'); } }, K);
    const p = await c.newPage(), err = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(WEB); await p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 }); await p.waitForTimeout(500);
    const cards = await p.$$eval('.pn-vivo .pn-vivo-item', x => x.map(e => ({ id: e.dataset.turno, txt: e.textContent.replace(/\s+/g, ' ') })));
    const jun = cards.filter(x => /JUNDIÁ/.test(x.txt));
    ok(jun.length === 1 && jun[0].id === 'dj1' && /\b3\s*veículos/.test(jun[0].txt), 'Visão geral: um cartão da BVA - JUNDIÁ, com os 3 veículos dos dois turnos', cards);
    const kpi = await p.evaluate(() => { const k = [...document.querySelectorAll('#pn-conteudo .pn-kpi')].find(k => /Barreiras em andamento agora/.test(k.textContent)); return k && k.querySelector('.pn-kpi-val').textContent.trim(); });
    ok(kpi === '2', '"Barreiras em andamento agora" = 2 (CEASA e Jundiá)', kpi);
    await p.click('[data-encerrar=dj1]'); await p.waitForSelector('#pn-encerrar[open]'); await p.fill('#pn-enc-fim', hmM(AG - 60 * 60e3));
    await p.click('#pn-enc-ok'); await p.waitForSelector('#pn-toast.on', { timeout: 10000 });
    const tj = (await aba('Turnos')).filter(t => /^dj/.test(t.id));
    ok(tj.length === 2 && tj.every(t => String(t.encerrado) === '1'), 'Encerrar turno encerra os dois turnos da planilha', tj.map(t => [t.id, t.encerrado, t.fim]));
    ok(tj.find(t => t.id === 'dj2').fim === hmM(ini2), 'o turno que começou depois do horário escolhido fecha no próprio início (não vira o dia seguinte)', tj.map(t => [t.id, t.inicio, t.fim]));
    ok(!err.length && !cel.erros.length && !pc.erros.length, 'sem erros de página', err.concat(cel.erros, pc.erros));
  } finally { await b.close(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
