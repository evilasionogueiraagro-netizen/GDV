const amb = require('./lib/amb');
// "Encerrar turno" pela gerência: action painelEncerrarTurno (Code.gs real via fakegas), proteção contra reabertura no sync,
// botão/diálogo no painel (Visão geral, aba Barreiras, celular; nunca no Modo TV) e o aviso no app do fiscal.
const { chromium } = require('playwright-core');
const { API, PAINEL: WEB, APP } = amb;
const DIR = amb.SAIDA + '/';
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const M = ms => new Date(ms - 4 * 3600e3);
const diaM = ms => M(ms).toISOString().slice(0, 10), hmM = ms => M(ms).toISOString().slice(11, 16);
const tsM = (d, hm) => Date.parse(`${d}T${hm}:00-04:00`);
const aba = async n => { const rows = await get('/__aba?nome=' + n); const cab = rows[0]; return rows.slice(1).map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]))); };
const linhaTurno = async id => (await aba('Turnos')).find(t => t.id === id);

(async () => {
  const AG = Date.now();
  const gAdm = await get('/__gerar?nome=' + encodeURIComponent('Gerente Encerra Silva') + '&perfil=admin');
  const adm = await post({ action: 'painelAtivar', codigo: gAdm.codigo });
  const gFis = await get('/__gerar?nome=' + encodeURIComponent('Fiscal Encerra Souza'));
  const fis = await post({ action: 'ativar', codigo: gFis.codigo });
  ok(adm.ok && fis.ok && adm.token && fis.token, 'credenciais de administrador e de fiscal');
  const ADM = adm.token, FIS = fis.token;
  const enc = (key, turnoId, fim) => post({ action: 'painelEncerrarTurno', key, turnoId, fim });
  const iniS = AG - 3 * 3600e3;
  const T = (id, extra = {}) => ({ id, numeroTF: 'TF-' + id, data: diaM(iniS), letra: 'A', inicio: hmM(iniS), fim: '', fiscal: 'Fiscal Encerra Souza', local: 'Barreira ' + id,
    unidade: 'MANAUS', posto: 'Fixa', encerrado: 0, criadoEm: AG - 3 * 3600e3, atualizadoEm: AG - 3 * 3600e3, latIni: '-3.1', lngIni: '-60.0', precIni: '9', ...extra });
  const V = (id, turnoId, hora, extra = {}) => ({ id, turnoId, hora, placa: 'ENC1A' + id.slice(-2), tipo: 'PA', pessoas: 2, obs: '', excluido: 0, criadoEm: AG, atualizadoEm: AG, ...extra });

  /* ================= 1. servidor ================= */
  console.log('1. Servidor: painelEncerrarTurno');
  let r = await post({ action: 'sync', key: FIS, since: 0, turnos: [T('s1'), T('s2'), T('s3', { data: diaM(AG - 2 * 864e5), inicio: '22:00' }), T('s4', { atualizadoEm: AG + 3600e3 })],
    veiculos: [V('vs1a', 's1', hmM(AG - 2 * 3600e3))] });
  ok(r.ok, 'fiscal sincroniza 4 turnos abertos');
  r = await enc(FIS, 's1', '12:00'); ok(!r.ok && /restrito ao administrador/i.test(r.erro), 'credencial de fiscal é recusada', r.erro);
  r = await enc('', 's1', '12:00'); ok(!r.ok && /sess[aã]o do painel/i.test(r.erro), 'sem credencial é recusado', r.erro);
  for (const f of ['25:00', '7:30', '12:60', 'abc', '', '12:00:00']) { r = await enc(ADM, 's1', f); ok(!r.ok && /HH:MM/.test(r.erro), `fim "${f}" recusado (formato)`, r.erro); }
  r = await enc(ADM, 'nao-existe', '12:00'); ok(!r.ok && /não encontrado/i.test(r.erro), 'turno inexistente recusado', r.erro);
  r = await enc(ADM, '', '12:00'); ok(!r.ok && /não informado/i.test(r.erro), 'turno não informado recusado', r.erro);
  r = await enc(ADM, 's1', hmM(AG + 3 * 3600e3)); ok(!r.ok && /ainda não chegou/.test(r.erro), 'horário que ainda não chegou (3 h à frente) recusado', r.erro);
  const fim1 = hmM(AG - 3600e3);
  r = await enc(ADM, 's1', fim1);
  ok(r.ok && r.turno && r.turno.fim === fim1 && r.turno.encerradoPor === 'Gerente Encerra Silva' && r.turno.encerrado === 1, 'administrador encerra s1', r);
  const L1 = await linhaTurno('s1');
  ok(L1.encerrado === 1 && L1.fim === fim1 && L1.encerradoPor === 'Gerente Encerra Silva' && L1.encerradoEm > AG && L1.srv_ts === L1.encerradoEm && L1.atualizadoEm === L1.encerradoEm,
    'planilha: encerrado=1, fim, encerradoPor, encerradoEm, atualizadoEm=srv_ts=agora', { encerrado: L1.encerrado, fim: L1.fim, por: L1.encerradoPor });
  ok(L1.usuario === 'Fiscal Encerra Souza', 'a linha continua do fiscal (usuario) — é ele quem recebe no sync');
  const cab = (await get('/__aba?nome=Turnos'))[0];
  ok(cab.slice(-3).join() === 'semPlaca,encerradoPor,encerradoEm', 'colunas novas no FIM da aba Turnos', cab.slice(-4));
  r = await enc(ADM, 's1', '12:00'); ok(!r.ok && /já está encerrado/.test(r.erro) && r.erro.includes(fim1) && /Gerente Encerra Silva/.test(r.erro), 'já encerrado: recusado com mensagem clara', r.erro);
  // turno que passou da meia-noite: 22:00 → 02:00 = 4 h
  r = await enc(ADM, 's3', '02:00'); ok(r.ok && r.turno.fimTs - r.turno.inicioTs === 4 * 3600e3, 'fim antes do início = dia seguinte (22:00 → 02:00 = 4 h)', r.turno && (r.turno.fimTs - r.turno.inicioTs) / 3600e3);
  // aparelho envia o turno (edição local mais nova) com encerrado = 0: não reabre
  r = await post({ action: 'sync', key: FIS, since: 0, turnos: [T('s1', { atualizadoEm: Date.now() + 1000, unidade: 'MANACAPURU', fim: '', latFim: '', lngFim: '' })], veiculos: [] });
  let L = await linhaTurno('s1');
  ok(L.encerrado === 1 && L.fim === fim1 && L.encerradoPor === 'Gerente Encerra Silva' && L.encerradoEm === L1.encerradoEm, 'envio com encerrado=0 NÃO reabre (encerrado, fim, encerradoPor/encerradoEm mantidos)', { e: L.encerrado, fim: L.fim, por: L.encerradoPor });
  ok(L.unidade === 'MANACAPURU', 'os demais campos seguem a regra normal (unidade atualizada)', L.unidade);
  const devolvido = (r.turnos || []).find(t => t.id === 's1');
  ok(devolvido && devolvido.encerrado === 1 && devolvido.encerradoPor === 'Gerente Encerra Silva', 'a resposta do sync devolve o turno encerrado ao aparelho');
  // aparelho encerra depois (sem saber) com outro horário: o horário da gerência fica
  await post({ action: 'sync', key: FIS, since: 0, turnos: [T('s1', { atualizadoEm: Date.now() + 2000, encerrado: 1, fim: '23:59' })], veiculos: [] });
  L = await linhaTurno('s1'); ok(L.encerrado === 1 && L.fim === fim1 && L.encerradoPor === 'Gerente Encerra Silva', 'encerramento posterior do aparelho não troca o horário da gerência', L.fim);
  // veículos lançados offline depois do encerramento: aceitos
  r = await post({ action: 'sync', key: FIS, since: 0, turnos: [], veiculos: [V('vs1b', 's1', hmM(AG - 30 * 60e3))] });
  ok(r.ok && (await aba('Veiculos')).some(v => v.id === 'vs1b' && v.turnoId === 's1'), 'veículo do turno encerrado enviado depois é aceito');
  // relógio corrigido: encerramento com atualizadoEm mais velho que a planilha ainda encerra
  r = await post({ action: 'sync', key: FIS, since: 0, turnos: [T('s4', { atualizadoEm: AG, encerrado: 1, fim: hmM(AG - 10 * 60e3) })], veiculos: [] });
  L = await linhaTurno('s4'); ok(L.encerrado === 1 && L.fim === hmM(AG - 10 * 60e3) && L.srv_ts >= AG, 'encerramento do aparelho com atualizadoEm mais velho que a planilha encerra assim mesmo', { e: L.encerrado, fim: L.fim });
  // painelDados ao vivo: s1 não está mais em andamento e traz quem encerrou
  r = await post({ action: 'painelDados', key: ADM, aoVivo: true, ids: ['s1', 's2'] });
  const d1 = r.turnos.find(t => t.id === 's1'), d2 = r.turnos.find(t => t.id === 's2');
  ok(d1 && d1.encerrado === 1 && !d1.emAndamento && d1.encerradoPor === 'Gerente Encerra Silva' && d1.fimTs === tsM(d1.data, fim1) && d2 && d2.emAndamento, 'painelDados: s1 encerrado (com encerradoPor e fimTs), s2 segue em andamento');

  /* ================= 2. painel ================= */
  console.log('2. Painel');
  const iniP = AG - 2 * 3600e3, ultP = hmM(AG - 40 * 60e3);
  await post({ action: 'sync', key: FIS, since: 0, turnos: [T('p1', { data: diaM(iniP), inicio: hmM(iniP), local: 'Barreira Porto Encerra' }), T('p2', { data: diaM(iniP), inicio: hmM(iniP), local: 'Barreira Sem Veiculo' }),
    T('p3', { data: diaM(iniP), inicio: hmM(iniP), local: 'Barreira Aba Barreiras' }), T('p4', { data: diaM(iniP), inicio: hmM(iniP), local: 'Barreira Celular' })],
    veiculos: [V('vp1a', 'p1', hmM(AG - 90 * 60e3)), V('vp1b', 'p1', ultP), V('vp3a', 'p3', hmM(AG - 50 * 60e3))] });
  const b = await amb.lancar();
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const erros = [];
  async function abrir(url, ls, opts = {}) {
    const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', ...opts });
    await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await c.route('https://nominatim.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await c.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API);
      Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, ls);
    await c.addInitScript(() => { if (window !== window.top) { window.print = () => { window.top.__prints = window.top.__prints || []; window.top.__prints.push(document.body.innerText.replace(/\s+/g, ' ')); }; } });
    const p = await c.newPage();
    p.on('pageerror', e => erros.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
    p.on('dialog', d => { erros.push('diálogo do navegador: ' + d.message()); d.accept(); });
    await p.goto(url); return p;
  }
  const sessao = { 'gdv.painel.token': ADM, 'gdv.painel.nome': 'Gerente Encerra Silva' };
  const esperarDados = p => p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 }).then(() => p.waitForTimeout(500));
  const kpiAndamento = p => p.evaluate(() => { const k = [...document.querySelectorAll('#pn-conteudo .pn-kpi')].find(k => /Barreiras em andamento agora/.test(k.textContent)); return k ? k.querySelector('.pn-kpi-val').textContent.trim() : null; });
  let p = await abrir(WEB, sessao, { viewport: { width: 1366, height: 900 } });
  await esperarDados(p);
  const nAntes = Number(await kpiAndamento(p));
  ok(await p.locator('.pn-vivo-item[data-turno=p1] [data-encerrar=p1]').count() === 1 && await p.locator('.pn-vivo-item[data-turno=p2] [data-encerrar=p2]').count() === 1,
    'Visão geral: botão "Encerrar turno" em cada cartão de barreira em andamento');
  ok((await p.textContent('[data-encerrar=p1]')).trim() === 'Encerrar turno', 'texto do botão');
  await p.click('[data-encerrar=p1]'); await p.waitForSelector('#pn-encerrar[open]');
  const hAg = await p.evaluate(() => { const o = {}; new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Manaus', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).forEach(x => { o[x.type] = x.value; }); return o.hour + ':' + o.minute; });
  const info = await p.textContent('#pn-encerrar .pn-dlg-info');
  ok(/Barreira Porto Encerra/.test(info) && /Fiscal Encerra Souza/.test(info) && info.includes(hmM(iniP)), 'diálogo: barreira, fiscais e início', info.replace(/\s+/g, ' '));
  const rapidos = await p.$$eval('#pn-encerrar [data-hora]', bs => bs.map(x => x.textContent.trim()));
  ok(rapidos[0] === `Último veículo (${ultP})` && /^Agora \(\d\d:\d\d\)$/.test(rapidos[1]), 'botões rápidos "Último veículo (HH:MM)" / "Agora (HH:MM)"', rapidos);
  ok(await p.inputValue('#pn-enc-fim') === ultP, 'sugestão = horário do último veículo', await p.inputValue('#pn-enc-fim'));
  ok(/o turno sai das barreiras em andamento e o aparelho do fiscal será avisado na próxima sincronização/i.test(await p.textContent('#pn-encerrar')), 'aviso sobre o aparelho do fiscal');
  await p.click('#pn-encerrar [data-hora]:nth-child(2)'); ok(Math.abs(tsM('2026-01-01', await p.inputValue('#pn-enc-fim')) - tsM('2026-01-01', hAg)) <= 60e3, '"Agora" preenche o horário atual', await p.inputValue('#pn-enc-fim'));
  await p.click('#pn-encerrar [data-hora]:nth-child(1)'); ok(await p.inputValue('#pn-enc-fim') === ultP, '"Último veículo" volta a sugestão');
  ok(/duração/.test(await p.textContent('#pn-enc-prev')), 'prévia da duração', (await p.textContent('#pn-enc-prev')).trim());
  await p.screenshot({ path: DIR + 'encerrar_dialogo.png' });
  await p.click('#pn-enc-cancelar'); await p.waitForTimeout(300);
  ok(await p.locator('#pn-encerrar').count() === 0 && (await linhaTurno('p1')).encerrado === 0, 'Cancelar fecha o diálogo sem encerrar');
  // erro do servidor em português dentro do diálogo: p2 encerrado por outro gerente enquanto o cartão estava na tela
  await enc(ADM, 'p2', hmM(AG - 5 * 60e3));
  await p.click('[data-encerrar=p2]'); await p.waitForSelector('#pn-encerrar[open]');
  ok(await p.inputValue('#pn-enc-fim') === hAg || Math.abs(tsM('2026-01-01', await p.inputValue('#pn-enc-fim')) - tsM('2026-01-01', hAg)) <= 60e3, 'sem veículo: sugestão = agora', await p.inputValue('#pn-enc-fim'));
  ok(await p.locator('#pn-encerrar [data-hora]').count() === 1, 'sem veículo: só o botão "Agora"');
  await p.click('#pn-enc-ok'); await p.waitForSelector('#pn-enc-erro:not([hidden])');
  ok(/já está encerrado/.test(await p.textContent('#pn-enc-erro')), 'erro do servidor aparece no diálogo, em português', await p.textContent('#pn-enc-erro'));
  await p.fill('#pn-enc-fim', ''); await p.click('#pn-enc-ok'); ok(/HH:MM/.test(await p.textContent('#pn-enc-erro')), 'horário vazio: aviso de formato', await p.textContent('#pn-enc-erro'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // confirma p1
  await p.click('[data-encerrar=p1]'); await p.waitForSelector('#pn-encerrar[open]');
  await p.click('#pn-enc-ok'); await p.waitForSelector('#pn-toast.on');
  ok((await p.textContent('#pn-toast')).trim() === 'Turno encerrado', 'aviso "Turno encerrado"');
  await p.waitForTimeout(1500);
  ok(await p.locator('.pn-vivo-item[data-turno=p1]').count() === 0, 'p1 saiu de "Barreiras em andamento agora"');
  const nDepois = Number(await kpiAndamento(p));
  ok(nDepois === nAntes - 2, `indicador "Barreiras em andamento agora": ${nAntes} → ${nDepois} (p1 e p2 encerrados)`);
  const L2 = await linhaTurno('p1'); ok(L2.encerrado === 1 && L2.fim === ultP && L2.encerradoPor === 'Gerente Encerra Silva', 'planilha: p1 encerrado às ' + ultP + ' pelo gerente');
  const dur = () => p.evaluate(() => { const t = Painel.todos.turnosTodos.find(x => x.id === 'p1'); Painel.reavaliarAbertos(); return t && { enc: t.encerrado, and: t.emAndamento, min: Math.round(t.duracaoMin), sit: t.situacao }; });
  const d0 = await dur(); await p.waitForTimeout(1500); await p.evaluate(() => Painel.recarregar()); await p.waitForTimeout(2500); const dd = await dur();
  const esperado = Math.round((tsM(diaM(iniP), ultP) - tsM(diaM(iniP), hmM(iniP))) / 60000);
  ok(d0 && d0.enc && !d0.and && d0.min === esperado && dd.min === esperado && dd.sit === 'encerrada', `horas param de contar: duração fixa em ${esperado} min (início → fim informado)`, [d0, dd]);
  await p.screenshot({ path: DIR + 'encerrar_geral.png', fullPage: false });
  // aba Barreiras
  await p.click('.pn-aba[data-aba=barreiras]'); await p.waitForTimeout(1200);
  ok(await p.locator('.pn-bar-vivo .pn-vivo-item[data-turno=p3] [data-encerrar=p3]').count() === 1, 'aba Barreiras: botão "Encerrar turno" na lista em andamento');
  ok(await p.locator('.pn-bar-vivo [data-encerrar=p1]').count() === 0, 'aba Barreiras: p1 não está mais na lista');
  await p.click('.pn-bar-vivo [data-encerrar=p3]'); await p.waitForSelector('#pn-encerrar[open]');
  ok(await p.inputValue('#pn-enc-fim') === hmM(AG - 50 * 60e3), 'aba Barreiras: sugestão = último veículo de p3');
  await p.click('#pn-enc-ok'); await p.waitForSelector('#pn-toast.on'); await p.waitForTimeout(1500);
  ok(await p.locator('.pn-bar-vivo .pn-vivo-item[data-turno=p3]').count() === 0 && (await linhaTurno('p3')).encerrado === 1, 'aba Barreiras: p3 encerrado e fora da lista');
  const fimTabela = await p.evaluate(() => [...document.querySelectorAll('#pn-conteudo table tr')].map(tr => tr.textContent).find(t => /Barreira Aba Barreiras/.test(t) && /\d\d:\d\d/.test(t)) || '');
  ok(/\(gerência\)/.test(fimTabela), 'tabela de turnos: fim com "(gerência)"', fimTabela.slice(0, 160));
  await p.screenshot({ path: DIR + 'encerrar_barreiras.png' });
  await p.context().close();
  // celular
  p = await abrir(WEB, sessao, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await esperarDados(p);
  ok(await p.locator('.pn-vivo-item[data-turno=p4] [data-encerrar=p4]').count() === 1, 'celular: botão no cartão (Visão geral)');
  await p.locator('[data-encerrar=p4]').scrollIntoViewIfNeeded(); await p.click('[data-encerrar=p4]'); await p.waitForSelector('#pn-encerrar[open]');
  const geo = await p.evaluate(() => { const r = document.querySelector('#pn-encerrar').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, rol: document.documentElement.scrollWidth <= innerWidth + 1 }; });
  ok(geo.l >= 15 && geo.r <= geo.w - 15 && geo.rol, 'celular: diálogo cabe na tela (margem ≥ 16 px, sem rolagem lateral)', geo);
  await p.screenshot({ path: DIR + 'encerrar_celular.png' });
  await p.click('#pn-enc-ok'); await p.waitForSelector('#pn-toast.on'); await p.waitForTimeout(800);
  ok((await linhaTurno('p4')).encerrado === 1 && await p.locator('.pn-vivo-item[data-turno=p4]').count() === 0, 'celular: encerrado e fora da lista');
  await p.context().close();
  // Modo TV: nunca tem o botão
  await post({ action: 'sync', key: FIS, since: 0, turnos: [T('p5', { data: diaM(iniP), inicio: hmM(iniP), local: 'Barreira TV' })], veiculos: [] });
  p = await abrir(WEB + '?tv=1&rotacao=300&rotacaoAoVivo=300', sessao, { viewport: { width: 1920, height: 1080 } });
  await p.waitForSelector('#tv-palco .tv-kpi', { timeout: 20000 }); await p.waitForTimeout(1500);
  ok(/Barreira TV/.test(await p.textContent('#tv-palco')), 'Modo TV mostra a barreira aberta');
  ok(await p.locator('[data-encerrar], .pn-btn-encerrar, #pn-encerrar').count() === 0, 'Modo TV: sem botão "Encerrar turno"');
  ok(await p.evaluate(() => Painel.botaoEncerrar(Painel.todos.turnosTodos.find(t => t.id === 'p5')) === null), 'Modo TV: botaoEncerrar() devolve null');
  await p.screenshot({ path: DIR + 'encerrar_tv.png' });
  await p.context().close();

  /* ================= 3. app do fiscal ================= */
  console.log('3. App do fiscal');
  const lsApp = { 'gdv.key': FIS, 'gdv.nome': 'Fiscal Encerra Souza', 'gdv.semInstalar': '1' };
  p = await abrir(APP, lsApp, { viewport: { width: 400, height: 820 }, permissions: ['geolocation'], geolocation: { latitude: -3.119, longitude: -60.021, accuracy: 10 } });
  const sync = () => p.evaluate(async () => { for (let i = 0; i < 40 && Sync.estado().tipo === 'sync'; i++) await new Promise(r => setTimeout(r, 150)); await Sync.sincronizar(); return Sync.estado(); });
  const iniciarTurno = async n => {
    await p.click('nav [data-v=modulos]').catch(() => {}); await p.waitForSelector('.modulo[data-v=home]'); await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno');
    await p.fill('#nTF', String(n)); await p.selectOption('#nPosto', 'Fixa'); await p.click('#fTurno button[type=submit]'); await p.waitForSelector('.contador');
    return p.evaluate(() => Store.meta('turnoAtual'));
  };
  const registrar = async placa => { await p.click('nav [data-v=registrar]'); await p.waitForSelector('#fVeic'); await p.waitForTimeout(400);
    // a tela pode ser redesenhada logo depois do clique (o formulário antigo ainda estava na tela): confere a placa antes de salvar
    for (let i = 0; i < 5 && await p.inputValue('#placa').catch(() => '') !== placa; i++) { await p.fill('#placa', placa); await p.waitForTimeout(300); }
    await p.click('#fVeic > button');
    await p.waitForFunction(pl => document.querySelector('#toast').textContent.includes(pl), placa); };
  await p.waitForSelector('.modulo');
  const id1 = await iniciarTurno(41); await registrar('AAA1A11'); await sync();
  ok(!!(await linhaTurno(id1)), 'turno do aparelho chegou à planilha');
  // offline: registra mais um veículo (fica pendente); a gerência encerra; volta a internet e sincroniza
  await fetch(API + '/__off'); await registrar('BBB2B22');
  await p.click('nav [data-v=resumo]'); await p.waitForSelector('#encerrar');
  await fetch(API + '/__on');
  const fimG = hmM(Date.now() - 60e3) < (await linhaTurno(id1)).inicio ? (await linhaTurno(id1)).inicio : hmM(Date.now() - 60e3);
  r = await enc(ADM, id1, fimG); ok(r.ok, 'gerência encerra o turno do aparelho às ' + fimG, r.erro);
  await sync(); await p.waitForSelector('#avisoEncerrado', { timeout: 8000 }).catch(() => {});
  const av = (await p.textContent('#avisoEncerrado').catch(() => '')) || '';
  ok(av.includes(`Este turno foi encerrado pela gerência às ${fimG}. Os documentos estão no Histórico.`), 'app: aviso "encerrado pela gerência às HH:MM"', av.replace(/\s+/g, ' '));
  ok(await p.locator('#encerrar').count() === 0 && await p.locator('#fTurno').count() === 1, 'app: saiu da tela do turno (resumo) e mostra o início de novo turno');
  ok(await p.evaluate(() => Store.meta('turnoAtual')) === '', 'app: turnoAtual limpo');
  ok((await aba('Veiculos')).some(v => v.placa === 'BBB2B22' && v.turnoId === id1), 'veículo pendente (offline) subiu para o turno encerrado');
  await p.screenshot({ path: DIR + 'encerrar_app_aviso.png' });
  await p.reload(); await p.waitForSelector('.modulo');
  ok(/encerrado pela gerência/.test(await p.textContent('#view')), 'app: o aviso continua depois de recarregar (tela de módulos)');
  // Histórico: turno encerrado com o Termo
  await p.click('.modulo[data-v=home]'); await p.waitForSelector('#avisoEncerrado');
  await p.click('#avisoEncerrado [data-go=historico]'); await p.waitForSelector('.turno-linha');
  const linhaH = await p.evaluate(id => { const b = document.querySelector(`.turno-linha [data-doc=termo][data-id="${id}"]`); return b ? b.closest('.turno-linha').textContent.replace(/\s+/g, ' ') : ''; }, id1);
  ok(linhaH.includes('–' + fimG) && /encerrado pela gerência/.test(linhaH), 'Histórico: turno encerrado (fim da gerência) com o botão do Termo', linhaH);
  await p.click(`.turno-linha [data-doc=termo][data-id="${id1}"]`);
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 8000 }).catch(() => {});
  const termo = await p.evaluate(() => (window.__prints || []).pop() || '');
  ok(new RegExp(`às ${fimG} horas`).test(termo), 'Termo gerado com o horário final da gerência', (termo.match(/das \d\d:\d\d horas às \d\d:\d\d horas/) || [])[0]);
  await p.screenshot({ path: DIR + 'encerrar_app_historico.png' });
  // "Entendi" tira o aviso
  await p.click('nav [data-v=home]'); await p.waitForSelector('#avisoEncerrado'); await p.click('#avisoEncerrado [data-avisook]');
  ok(await p.locator('#avisoEncerrado').count() === 0, '"Entendi" fecha o aviso');

  // edição local MAIS NOVA do turno: o encerramento da planilha vale assim mesmo (mescla no aplicar)
  const id2 = await iniciarTurno(42); await registrar('CCC3C33'); await sync();
  r = await enc(ADM, id2, (await linhaTurno(id2)).inicio); ok(r.ok, 'gerência encerra o 2º turno');
  await p.click('nav [data-v=lista]'); await p.waitForSelector('.item');
  await p.evaluate(async id => { const t = await Store.obter('turnos', id); t.unidade = 'EDITADO NO APARELHO'; await Store.salvar('turnos', t); }, id2);
  // o envio do turno é retido e volta como "recusado" (a edição local continua pendente e mais nova que a da planilha)
  await p.route(API + '/', async rt => { const b2 = JSON.parse(rt.request().postData() || '{}'); if (b2.action !== 'sync') return rt.continue();
    const retido = (b2.turnos || []).map(t => t.id); b2.turnos = [];
    const resp = await rt.fetch({ postData: JSON.stringify(b2) }), j = await resp.json();
    j.recusados = { ...(j.recusados || {}), turnos: retido };
    return rt.fulfill({ response: resp, json: j }); });
  await p.evaluate(() => Store.setMeta('lastSync', 0));
  await sync(); await p.waitForTimeout(500);
  const loc = await p.evaluate(id => Store.obter('turnos', id), id2);
  ok(loc.encerrado === 1 && loc.encerradoPor === 'Gerente Encerra Silva' && loc.fim === r.turno.fim && loc.pendente === 1 && loc.unidade === 'EDITADO NO APARELHO',
    'edição local mais nova: encerramento mesclado (encerrado/fim/encerradoPor) e a edição local continua pendente', { e: loc.encerrado, fim: loc.fim, pend: loc.pendente, un: loc.unidade });
  ok(await p.locator('#avisoEncerrado').count() === 1 && await p.locator('.item').count() === 0 && await p.evaluate(() => Store.meta('turnoAtual')) === '', 'app: saiu da lista do turno e mostra o aviso');
  await p.unroute(API + '/'); await sync();
  L = await linhaTurno(id2); ok(L.encerrado === 1 && L.unidade === 'EDITADO NO APARELHO' && L.encerradoPor === 'Gerente Encerra Silva', 'depois: a edição local sobe e o turno continua encerrado na planilha');
  ok((await p.evaluate(id => Store.obter('turnos', id), id2)).pendente === 0, 'nada pendente no aparelho');

  // encerramento feito pelo próprio fiscal: tela "Turno encerrado" mostra se já foi enviado
  const id3 = await iniciarTurno(43); await fetch(API + '/__off');
  await p.click('nav [data-v=resumo]'); await p.waitForSelector('#encerrar'); p.removeAllListeners('dialog'); p.on('dialog', d => d.accept());
  await p.click('#encerrar'); await p.waitForSelector('[data-doc=termo]');
  ok(/ainda não enviado à planilha/.test(await p.textContent('#encPend')), 'fiscal encerra sem internet: "⏳ Encerramento ainda não enviado à planilha"');
  await p.screenshot({ path: DIR + 'encerrar_app_pendente.png' });
  await fetch(API + '/__on'); await sync(); await p.waitForTimeout(600);
  ok(/Turno encerrado, bom descanso!/.test(await p.textContent('#encPend').catch(() => '')) && (await linhaTurno(id3)).encerrado === 1, 'com internet: enviado (tela atualiza sozinha)', await p.textContent('#encPend').catch(() => ''));
  ok(await p.locator('#avisoEncerrado').count() === 0, 'encerramento do próprio fiscal não mostra o aviso da gerência');

  const errosReais = erros.filter(e => !/ERR_EMPTY_RESPONSE/.test(e));          // servidor desligado de propósito (/__off)
  ok(!errosReais.length, 'sem erros de página / diálogos do navegador', errosReais.slice(0, 5));
  await b.close();
  console.log(`FALHOU=${falhas}`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
