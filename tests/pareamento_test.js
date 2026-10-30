const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Turno compartilhado (pareamento): o dono do turno gera um código (turnoConvidar); o colega, com o PRÓPRIO login, entra com ele
// (turnoParear) e lança no mesmo turno. App real (Chromium) + Code.gs real. Confere: os veículos dos dois ficam no turno do dono e cada
// aparelho vê os do outro; o nome do colega entra no turno (Termo, painel); só o dono encerra (o colega só sai, e o envio do turno pelo
// colega não muda a planilha); código errado, vencido ou reusado é recusado e há limite de tentativas. Dados fictícios.
const { API, APP } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500))); if (!c) falhas++; };
const aba = async n => { const rows = await get('/__aba?nome=' + n); const cab = rows[0]; return rows.slice(1).map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]))); };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);

(async () => {
  const b = await amb.lancar();
  try {
    const A = await U.fiscal('Fulano Ficticio Teste'), B = await U.fiscal('Beltrano Ficticio Teste'), C = await U.fiscal('Ciclano Ficticio Teste');
    const abrirApp = async ls => {
      const c = await b.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'America/Manaus', permissions: ['geolocation'], geolocation: { latitude: -3.1190, longitude: -60.0217, accuracy: 10 } });
      await c.route(u => !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u)), r => r.abort());
      await c.addInitScript(i => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, ls);
      await c.addInitScript(() => { if (window !== window.top) window.print = () => { window.top.__prints = window.top.__prints || []; window.top.__prints.push(document.body.innerText.replace(/\s+/g, ' ')); }; });
      const p = await c.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message)); p.on('dialog', d => d.accept());
      await p.goto(APP); await p.waitForSelector('.modulo'); await p.evaluate(() => Sync.sincronizar());
      await p.click('.modulo[data-v=home]'); return p;
    };
    const registrar = async (p, placa) => { await p.click('nav [data-v=registrar]'); await p.waitForSelector('#fVeic'); await p.fill('#placa', placa); await p.click('#fVeic > button'); await p.waitForTimeout(500); };
    const sinc = p => p.evaluate(() => Sync.sincronizar());
    const contador = async p => { await p.click('nav [data-v=home]'); await p.waitForSelector('.contador h1'); return (await p.textContent('.contador h1')).trim(); };

    console.log('1) dono abre o turno e convida');
    const pa = await abrirApp(A.ls);
    await pa.waitForSelector('#fTurno'); await pa.fill('#nTF', '5'); await pa.selectOption('#nPosto', 'Fixa'); await pa.selectOption('#nLocal', 'BVA - CEASA');
    await pa.click('#fTurno button[type=submit]'); await pa.waitForSelector('#convidar');
    await registrar(pa, 'ABC1D23'); await sinc(pa); await pa.click('nav [data-v=home]'); await pa.waitForSelector('#convidar');
    await pa.click('#convidar'); await pa.waitForSelector('.codigo-par', { timeout: 25000 });
    const codigo = (await pa.textContent('.codigo-par')).replace(/\D/g, ''); await pa.locator('#convite').scrollIntoViewIfNeeded(); await pa.screenshot({ path: amb.saida('pareamento_convite.png') });
    ok(/^\d{6}$/.test(codigo) && /Vale até/.test(await pa.textContent('#convite')), 'dono: "Convidar colega" mostra um código de 6 números com a validade', codigo);
    const turnoId = await pa.evaluate(() => Store.meta('turnoAtual'));

    console.log('2) servidor: regras do código');
    let r = await post({ action: 'turnoParear', key: C.token, codigo: '000000' === codigo ? '111111' : '000000' });
    ok(!r.ok && /inválido ou vencido/.test(r.erro), 'código errado: recusado', r.erro);
    r = await post({ action: 'turnoParear', key: A.token, codigo });
    ok(!r.ok && /já é seu/.test(r.erro), 'o próprio dono não "entra" no turno dele', r.erro);
    r = await post({ action: 'turnoConvidar', key: B.token, turnoId });
    ok(!r.ok && /Só quem abriu/.test(r.erro), 'quem não é dono não gera código', r.erro);

    console.log('3) colega entra com o próprio login');
    const pb = await abrirApp(B.ls);
    await pb.waitForSelector('#parearBox summary'); await pb.click('#parearBox summary'); await pb.screenshot({ path: amb.saida('pareamento_entrar.png') }); await pb.fill('#pCodigo', codigo.slice(0, 3) + ' ' + codigo.slice(3)); await pb.click('#fParear button[type=submit]');
    await pb.waitForSelector('.contador h1', { timeout: 25000 });
    const telaB = await pb.textContent('main');
    ok(/Turno de Fulano Ficticio Teste/.test(telaB) && /colaborando/.test(telaB) && (await pb.textContent('#encerrar')).includes('Sair do turno') && !(await pb.locator('#convidar').count()),
      'colega: tela do turno do dono, botão "Sair do turno" (não encerra nem convida)', telaB.slice(0, 400));
    ok((await pb.textContent('.contador h1')).trim() === '1', 'colega já vê o veículo que o dono lançou');
    r = await post({ action: 'turnoParear', key: C.token, codigo });
    ok(!r.ok && /inválido ou vencido/.test(r.erro), 'código já usado: não vale para outra pessoa', r.erro);
    await registrar(pb, 'ABC1D24'); await sinc(pb); await sinc(pa);
    ok(await contador(pa) === '2' && await contador(pb) === '2', 'os dois aparelhos veem os 2 veículos (1 de cada login)');
    ok(/Beltrano Ficticio Teste/.test(await pa.textContent('main')), 'dono: o nome do colega aparece entre os fiscais do turno');
    const ts = (await aba('Turnos')).filter(t => t.id === turnoId), vs = (await aba('Veiculos')).filter(v => v.turnoId === turnoId);
    ok(ts.length === 1 && ts[0].usuario === A.nome && JSON.parse(ts[0].colegas || '[]').includes(B.nome), 'planilha: 1 turno, do dono, com o colega em "colegas"', ts[0]);
    ok(vs.length === 2 && vs.some(v => v.usuario === B.nome) && vs.some(v => v.usuario === A.nome), 'planilha: os 2 veículos no turno do dono, cada um com quem lançou', vs.map(v => v.usuario));
    const pr = (await aba('Pareamentos')).find(x => x.codigo === codigo);
    ok(pr && pr.dono === A.nome && pr.colega === B.nome && Number(pr.entrouEm) > 0 && !pr.saiuEm, 'aba Pareamentos registra quem convidou, quem entrou e quando', pr);

    console.log('4) só o dono grava e encerra o turno');
    const t0 = ts[0];
    r = await post({ action: 'sync', key: B.token, since: 9e15, turnos: [{ ...t0, encerrado: 1, fim: '10:00', fiscal: 'Outro Nome', atualizadoEm: Date.now() + 5000 }], veiculos: [] });
    const t1 = (await aba('Turnos')).find(t => t.id === turnoId);
    ok(r.ok && String(t1.encerrado) === '0' && t1.fiscal === t0.fiscal && t1.usuario === A.nome, 'envio do turno pelo colega não muda a planilha (nem encerra)', t1);
    const adm = await amb.gerente('Gestora Ficticia Teste');
    const PD = await post({ action: 'painelDados', key: adm.token, de: hoje, ate: hoje });
    const tp = (PD.turnos || []).find(x => x.id === turnoId);
    ok(tp && /Fulano Ficticio Teste/.test(tp.fiscal) && /Beltrano Ficticio Teste/.test(tp.fiscal), 'painel: o turno conta para os dois fiscais', tp && tp.fiscal);
    await pa.click('nav [data-v=home]'); await pa.click('#encerrar'); await pa.waitForSelector('[data-doc=termo]');
    await pa.evaluate(() => { window.__prints = []; }); await pa.click('[data-doc=termo]');
    await pa.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 8000 });
    const termo = await pa.evaluate(() => window.__prints[0]);
    ok(/Fulano Ficticio Teste e Beltrano Ficticio Teste/.test(termo) && /Foram fiscalizados 2 veículos/.test(termo), 'Termo do dono: os dois fiscais e os 2 veículos', termo.slice(0, 500));
    await sinc(pa); await sinc(pb); await pb.click('nav [data-v=home]'); await pb.waitForSelector('#fTurno', { timeout: 8000 }).catch(() => {});
    ok(await pb.locator('#fTurno').count() === 1 && /encerrado fora deste aparelho/.test(await pb.textContent('main')), 'colega: o turno encerrado pelo dono sai do aparelho dele (aviso + novo turno)');
    // o turno do dono continua no Histórico do colega (com o Termo), mesmo depois de outras sincronizações
    await sinc(pb); await sinc(pb);
    await pb.click('nav [data-v=historico]'); await pb.waitForSelector('#hOut .turno-linha', { timeout: 8000 }).catch(() => {});
    ok(await pb.locator(`#hOut [data-doc=termo][data-id="${turnoId}"]`).count() === 1, 'colega: o turno encerrado fica no Histórico dele, com o botão do Termo');
    await pb.click('nav [data-v=home]'); await pb.waitForSelector('#fTurno', { timeout: 8000 });
    ok(await pa.evaluate(() => Sync.mesmoNome(' fulano  ficticio TESTE ', 'Fulano Ficticio Teste') && !Sync.mesmoNome('Fulano Ficticio', 'Fulano Ficticio Teste')),
      'mesmo login com outra grafia (maiúsculas, espaços) conta como o próprio fiscal (não some do Histórico)');

    console.log('5) sair do turno e limite de tentativas');
    await pa.click('[data-go=home]'); await pa.waitForSelector('#fTurno'); await pa.fill('#nTF', '6'); await pa.selectOption('#nPosto', 'Fixa'); await pa.selectOption('#nLocal', 'BVA - CEASA');
    await pa.click('#fTurno button[type=submit]'); await pa.waitForSelector('#convidar'); await sinc(pa);
    await pa.click('#convidar'); await pa.waitForSelector('.codigo-par', { timeout: 25000 });
    const cod2 = (await pa.textContent('.codigo-par')).replace(/\D/g, ''), turno2 = await pa.evaluate(() => Store.meta('turnoAtual'));
    await pb.click('#parearBox summary'); await pb.fill('#pCodigo', cod2); await pb.click('#fParear button[type=submit]'); await pb.waitForSelector('.contador h1', { timeout: 25000 });
    await pb.click('#encerrar'); await pb.waitForSelector('#fTurno'); await pb.waitForTimeout(1500);
    const p2 = (await aba('Pareamentos')).find(x => x.codigo === cod2), t2 = (await aba('Turnos')).find(t => t.id === turno2);
    ok(p2 && Number(p2.saiuEm) > 0 && String(t2.encerrado) === '0', '"Sair do turno": o colega sai (saiuEm) e o turno do dono continua aberto', [p2 && p2.saiuEm, t2 && t2.encerrado]);
    let ult = null;
    const D = await U.fiscal('Fulano Tentativas Teste');
    for (let i = 0; i < 11; i++) ult = await post({ action: 'turnoParear', key: D.token, codigo: String(100000 + i) });
    ok(!ult.ok && /Muitos códigos errados/.test(ult.erro), 'depois de 10 códigos errados, o login espera 15 min', ult.erro);
    ok(!pa.erros.length && !pb.erros.length, 'sem erros de página', pa.erros.concat(pb.erros));
  } finally { await b.close(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
