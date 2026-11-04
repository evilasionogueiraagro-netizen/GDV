const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Turno em BVA fixa só para quem está na escala (escalas.gs: escalasDaBva, exigirEscalaNaBva_): onde há escala publicada cobrindo o dia,
// só os fiscais dela abrem turno (app) ou entram em turno (turnoEntrar, turnoParear); BVA sem escala para o dia fica livre;
// coordenação de barreira e gerência (livreEscala) não têm a trava. App real (Chromium) + Code.gs real. Dados fictícios.
const { API, APP } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500))); if (!c) falhas++; };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
const dia = n => new Date(Date.parse(hoje + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

(async () => {
  const b = await amb.lancar();
  try {
    const coord = await U.fiscal('Carla Coordenadora Teste', { permissoes: ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'coordenacaoBarreiras'] });
    const E = await U.fiscal('Ana Escalada Teste'), F = await U.fiscal('Bruno Fora Teste');
    const D = await post({ action: 'escalaDados', key: coord.token }), id = n => D.fiscais.find(f => f.nome === n).id;
    let r = await post({ action: 'escalaSalvar', key: coord.token, escala: { bva: 'BVA - CEASA', inicio: dia(-1), fim: dia(5), fiscais: [id(E.nome)], situacao: 'publicada' } });
    ok(r.ok, 'escala publicada: BVA - CEASA, só a fiscal escalada', r.erro);

    console.log('1) sync: escalas da BVA sem nomes');
    const sF = await post({ action: 'sync', key: F.token, since: 0 }), sE = await post({ action: 'sync', key: E.token, since: 0 });
    const eF = sF.escalasDaBva.escalas.find(e => e.bva === 'BVA - CEASA'), eE = sE.escalasDaBva.escalas.find(e => e.bva === 'BVA - CEASA');
    ok(eF && eF.eu === 0 && eE && eE.eu === 1 && !JSON.stringify(sF.escalasDaBva).includes('Ana'), 'escalasDaBva: BVA, período e "eu" (sem nomes de fiscais)', sF.escalasDaBva);
    const sC = await post({ action: 'sync', key: coord.token, since: 0 });
    ok(sC.escalasDaBva.livre === 1 && sF.escalasDaBva.livre === 0, 'livre só para coordenação (e gerência)', [sC.escalasDaBva.livre, sF.escalasDaBva.livre]);

    const abrirApp = async ls => {
      const c = await b.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'America/Manaus', permissions: ['geolocation'], geolocation: { latitude: -3.119, longitude: -60.0217, accuracy: 10 } });
      await c.route(u => !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u)), rt => rt.abort());
      await c.addInitScript(i => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, ls);
      const p = await c.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message)); p.on('dialog', d => d.accept());
      await p.goto(APP); await p.waitForSelector('.modulo'); await p.evaluate(() => Sync.sincronizar());
      await p.waitForTimeout(800); if (await p.$('#escPop')) await p.click('#escPopOk');   // aviso "Sua escala de plantão"
      await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno');
      if (await p.$('#escPop')) await p.click('#escPopOk'); await p.selectOption('#nPosto', 'Fixa'); return p;
    };

    console.log('2) app: fora da escala não abre turno na BVA escalada');
    const pf = await abrirApp(F.ls);
    await pf.selectOption('#nLocal', 'BVA - CEASA'); await pf.waitForSelector('#nForaEscala:not([hidden])', { timeout: 10000 });
    ok(await pf.locator('#fTurno button[type=submit]').isDisabled() && /não está na escala/.test(await pf.textContent('#nForaEscala')), 'BVA - CEASA: aviso "não está na escala" e "Iniciar turno" desativado');
    await pf.screenshot({ path: amb.saida('escala_turno_fora.png') });
    await pf.selectOption('#nLocal', 'BVA - JUNDIÁ'); await pf.waitForSelector('#nForaEscala[hidden]', { state: 'attached', timeout: 10000 });
    ok(!(await pf.locator('#fTurno button[type=submit]').isDisabled()), 'BVA sem escala publicada para hoje: livre');

    console.log('3) escalada abre; fora da escala não entra (sem código nem com código)');
    const pe = await abrirApp(E.ls);
    await pe.selectOption('#nLocal', 'BVA - CEASA'); await pe.fill('#nTF', '7');
    ok(await pe.locator('#nForaEscala').isHidden(), 'escalada: sem aviso');
    await pe.click('#fTurno button[type=submit]'); await pe.waitForSelector('#convidar', { timeout: 20000 });
    await pe.evaluate(() => Sync.sincronizar());
    const turnoId = await pe.evaluate(() => Store.meta('turnoAtual'));
    r = await post({ action: 'turnosAbertos', key: F.token });
    ok(r.ok && !r.turnos.some(t => t.id === turnoId), 'turnosAbertos: o turno da BVA escalada não aparece para quem está fora', r.turnos);
    r = await post({ action: 'turnoEntrar', key: F.token, turnoId });
    ok(!r.ok && /não está na escala/.test(r.erro), 'turnoEntrar fora da escala: recusado', r.erro);
    const cv = await post({ action: 'turnoConvidar', key: E.token, turnoId });
    r = await post({ action: 'turnoParear', key: F.token, codigo: cv.codigo });
    ok(cv.ok && !r.ok && /não está na escala/.test(r.erro), 'com o código, fora da escala: recusado', r.erro);
    r = await post({ action: 'turnoEntrar', key: coord.token, turnoId });
    ok(r.ok && r.turno.id === turnoId, 'coordenação entra mesmo fora da escala', r.erro);
    ok(!pf.erros.length && !pe.erros.length, 'sem erros de página', pf.erros.concat(pe.erros));
  } finally { await b.close(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
