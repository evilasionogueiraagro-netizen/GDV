const amb = require('./lib/amb');
// E2E do alerta "TF em preenchimento / Apreensão em andamento": aparelho do fiscal (app em 8081) → Code.gs real (fakegas, 8082)
// → e-GDV Painel (normal e modo TV, outros contextos). Rode com ./rodar.sh tf_alerta_test.js (um fakegas novo).
const { chromium } = require('playwright-core'); const fs = require('fs');
const { API, APP, PAINEL: WEB } = amb;
const get = p => fetch(API + p).then(r => r.json());
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const espera = ms => new Promise(r => setTimeout(r, ms));
async function ate(fn, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch (e) { /* tenta de novo */ } await espera(200); } return null; }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
// verificador de layout da TV: o mesmo do tv_test.js (sem rolagem, sem texto fora da tela, cortado ou sobreposto)
const fonteTV = fs.readFileSync(__dirname + '/tv_test.js', 'utf8');
const layout = eval(fonteTV.slice(fonteTV.indexOf('const layout = p =>') + 'const layout = '.length, fonteTV.indexOf('\n  const checarLayout')).trim().replace(/;$/, ''));
// geometria da tela Ao vivo (sem linha de KPIs no topo, mapa na altura toda, 62 municípios no quadro): a mesma do tv_test.js
const geoVivo = eval(fonteTV.slice(fonteTV.indexOf('const geoVivo = p =>') + 'const geoVivo = '.length, fonteTV.indexOf('\n  const checarVivo')).trim().replace(/;$/, ''));

(async () => {
  const b = await amb.lancar();
  const erros = [];
  const vigiar = (p, nome, toleraRede) => {
    p.on('pageerror', e => erros.push(nome + ': pageerror ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !(toleraRede && /Failed to load resource|net::ERR/.test(m.text()))) erros.push(nome + ': ' + m.text()); });
  };
  const andamento = async () => { const rows = await get('/__aba?nome=Andamento'); if (!rows) return []; const cab = rows[0]; return rows.slice(1).map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]))); };
  const doUsuario = async u => (await andamento()).filter(a => a.usuario === u);

  /* ---------- aparelhos dos fiscais ---------- */
  const credencial = async nome => { const g = await get('/__gerar?nome=' + encodeURIComponent(nome)); const r = await post({ action: 'ativar', codigo: g.codigo }); return { token: r.token, nome }; };
  async function aparelho({ token, nome }, geo, relogio) {
    const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: geo, timezoneId: 'America/Manaus' });
    await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [token, nome]);
    const p = await c.newPage(); p.ctx = c; vigiar(p, nome, true);
    p.dialogos = []; p.on('dialog', d => { p.dialogos.push(d.message()); d.accept(); });
    if (relogio) await p.clock.install({ time: Date.now() });
    await p.goto(APP); await p.waitForSelector('#view *', { state: 'attached' }); await p.waitForTimeout(600); return p;
  }
  const sync = async p => { await p.evaluate(() => Sync.sincronizar()); await p.waitForFunction(() => ['ok', 'idle'].includes(Sync.estado().tipo) && !Sync.estado().pend, null, { timeout: 15000 }); };

  /* ---------- painel do gestor ---------- */
  const adminCred = async nome => { const g = await get('/__gerar?nome=' + encodeURIComponent(nome) + '&perfil=admin'); const a = await post({ action: 'painelAtivar', codigo: g.codigo }); return { 'gdv.painel.token': a.token, 'gdv.painel.nome': a.nome }; };
  async function painel(nome, sessao, o = {}) {
    const c = await b.newContext({ viewport: o.viewport || { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', permissions: o.permissoes || [], colorScheme: 'light', serviceWorkers: 'block' });
    await c.route('https://tile.openstreetmap.org/**', rt => o.semTiles ? rt.abort('blockedbyclient') : rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await c.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, sessao);
    const p = await c.newPage(); p.ctx = c; vigiar(p, nome, !!o.semTiles); p.on('dialog', d => d.accept());
    await p.goto(o.url || WEB); return p;
  }
  /** Atualização como a automática (sem esperar 25–60 s): carga completa e espera a condição. */
  const atualizar = async (p, fn, arg) => { await p.evaluate(() => Painel.recarregar()); return p.waitForFunction(fn, arg, { timeout: 15000 }).then(() => true).catch(() => false); };
  const pinos = p => p.$$eval('.pn-duo-mapa .leaflet-marker-pane .pn-pin', x => x.map(e => e.className.replace('pn-pin ', '')).sort());

  const MANAUS = { latitude: -3.119, longitude: -60.0217, accuracy: 10 }, PARINTINS = { latitude: -2.628, longitude: -56.736, accuracy: 15 };
  const ana = await credencial('Ana Paula Lima'), bruno = await credencial('Bruno Costa Souza');

  console.log('1. Fiscal abre o turno (barreira verde no painel)');
  const A = await aparelho(ana, MANAUS, true);
  await A.click('.modulo[data-v=home]'); await A.waitForSelector('#fTurno');
  await A.fill('#nTF', '41'); await A.selectOption('#nPosto', 'Móvel'); await A.fill('#nLocal', 'Barreira Porto CEASA'); await A.fill('#nUnidade', 'MANAUS'); await A.click('#fTurno button[type=submit]'); await A.waitForSelector('.contador');
  await sync(A);
  const turnoId = await A.evaluate(() => Store.meta('turnoAtual'));
  ok(!!turnoId, 'turno aberto e sincronizado', turnoId);

  const sessaoGestor = await adminCred('Gestor Teste');
  const G = await painel('painel', sessaoGestor, { permissoes: ['notifications'] });
  await G.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 }); await G.waitForTimeout(500);
  ok(JSON.stringify(await pinos(G)) === '["ok"]', 'painel: barreira em andamento verde (pulso verde), sem TF', await pinos(G));
  ok(await G.isHidden('#pn-tfaviso').catch(() => true) && (await G.evaluate(() => Painel.alertaTF())).ativos.length === 0, 'painel: nenhum aviso de TF');
  ok(await G.evaluate(() => Notification.permission) === 'granted' && await G.isHidden('#pn-notif'), 'notificação já permitida: botão "Ativar notificações" some');

  console.log('2. Fiscal abre o TF do turno → servidor registra "preenchendo" → painel vermelho + aviso + alerta');
  await A.click('[data-go=tfnovo]'); await A.waitForSelector('#tfForm');
  let reg = await ate(async () => { const r = (await doUsuario('Ana Paula Lima')).find(x => x.estado === 'preenchendo' && x.lat !== ''); return r; });
  ok(reg && reg.turnoId === turnoId && reg.local === 'Barreira Porto CEASA' && /CEASA/.test(reg.barreira) && Math.abs(+reg.lat - MANAUS.latitude) < 1e-3 && Math.abs(+reg.lon - MANAUS.longitude) < 1e-3,
    'aba Andamento: preenchendo, turnoId do turno aberto, local, barreira e GPS do aparelho', reg);
  ok(reg && /^Ana Paula Lima\|[0-9a-f-]{36}$/.test(reg.id) && reg.fiscal === 'Ana Paula Lima' && reg.inicioTs > 0 && reg.atualizadoTs >= reg.inicioTs, 'id = usuario|rascunhoId, fiscal da credencial, inicioTs/atualizadoTs', reg && reg.id);
  ok(!Object.keys(reg || {}).some(k => /doc|cpf|nome$/i.test(k)), 'sem CPF/nome do fiscalizado na aba Andamento', Object.keys(reg || {}));
  const rid1 = reg && reg.id;
  ok(await atualizar(G, () => document.querySelectorAll('.pn-duo-mapa .leaflet-marker-pane .pn-pin.tf').length === 1), 'painel: a barreira passa a piscar vermelho (marcador "TF")');
  ok(JSON.stringify(await pinos(G)) === '["tf"]', 'o marcador verde dá lugar ao vermelho (não fica duplicado)', await pinos(G));
  const estiloTF = await G.$eval('.pn-duo-mapa .leaflet-marker-pane .pn-pin.tf', e => { const a = getComputedStyle(e, '::after'), bf = getComputedStyle(e, '::before'); return { anim: a.animationName, dur: a.animationDuration, cor: getComputedStyle(e).backgroundColor, txt: bf.content, raio: getComputedStyle(e).borderRadius }; });
  const estiloOk = { dur: '1.8s' };
  ok(estiloTF.anim === 'pn-pulso-tf' && parseFloat(estiloTF.dur) < parseFloat(estiloOk.dur) && /^rgb\(208, 59, 59/.test(estiloTF.cor) && estiloTF.txt === '"TF"' && !/50%/.test(estiloTF.raio),
    'marcador TF: pulso vermelho mais rápido que o verde, "TF" escrito e forma de documento (não só a cor)', estiloTF);
  let aviso = (await G.textContent('#pn-tfaviso')).replace(/\s+/g, ' ');
  ok(await G.isVisible('#pn-tfaviso') && /TF em preenchimento/.test(aviso) && /Barreira Porto CEASA/.test(aviso) && /Ana Paula Lima/.test(aviso) && /procedimento ainda não marcado/.test(aviso) && /iniciado (agora|há \d+ min)/.test(aviso),
    'aviso vermelho: barreira, fiscal, procedimento e há quanto tempo', aviso);
  let st = await G.evaluate(() => Painel.alertaTF());
  ok(st.sons === 1 && st.avisos === 1 && st.notificacoes === 1, 'som tocado (Web Audio) e notificação do sistema (permissão concedida) uma vez', st);
  ok(st.rapido && st.proximaMs <= 15000, 'com TF em preenchimento a consulta ao vivo continua a cada 15 s', st.proximaMs);
  const alertas = await G.$$eval('.pn-alertas-caixa .pn-alerta', x => x.map(e => ({ n: e.className.replace('pn-alerta ', ''), t: e.querySelector('.pn-alerta-tit').textContent })));
  ok(alertas[0] && alertas[0].n === 'critico' && /^TF em preenchimento: Barreira Porto CEASA/.test(alertas[0].t), 'item crítico nos "Alertas para decisão" (primeiro da lista)', alertas[0]);
  const card = await G.$eval('.pn-geral-vivo .pn-vivo-item', e => ({ cls: e.className, t: e.textContent.replace(/\s+/g, ' ') })).catch(() => null);
  ok(card && /\btf\b/.test(card.cls) && /TF em preenchimento/i.test(card.t) && /Porto CEASA/.test(card.t), '"Barreiras em andamento agora": cartão da barreira em vermelho, primeiro', card);
  ok(/TF em preenchimento/.test(await G.textContent('.pn-duo-mapa .pn-legenda')), 'legenda do mapa com o estado "TF em preenchimento"');
  await G.screenshot({ path: amb.saida('alerta_painel.png') });
  // outro gestor, sem permissão de notificação: o botão discreto aparece e nada é pedido sozinho
  const G2 = await painel('painel2', await adminCred('Gestor Dois'));
  await G2.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 }); await G2.waitForTimeout(400);
  const perm2 = await G2.evaluate(() => Notification.permission);
  ok(perm2 !== 'default' || await G2.isVisible('#pn-notif'), 'sem permissão ainda: botão "Ativar notificações" visível (nunca pede sozinho)', perm2);
  const st2 = await G2.evaluate(() => Painel.alertaTF());
  ok(st2.sons === 1 && st2.notificacoes === 0 && await G2.isVisible('#pn-tfaviso'), 'outro painel: aviso + tentativa de som; sem notificação (não permitida)', st2);
  await G2.click('[data-dispensar]'); ok(await G2.isHidden('#pn-tfaviso'), '"Dispensar" esconde o aviso (o alerta e o marcador continuam)');
  ok(await G2.locator('.pn-duo-mapa .leaflet-marker-pane .pn-pin.tf').count() === 1, 'marcador vermelho continua depois de dispensar o aviso');
  await G2.ctx.close();

  console.log('3. Procedimento muda para apreensão → "Apreensão em andamento"');
  await A.check('input[name=tf-proc][value=apreensao]'); await A.fill('#tf-placa', 'abc1d23');
  reg = await ate(async () => (await doUsuario('Ana Paula Lima')).find(x => x.estado === 'preenchendo' && x.procedimento === 'apreensao' && x.placa === 'ABC1D23'));
  ok(reg && reg.id === rid1 && reg.inicioTs === (await doUsuario('Ana Paula Lima'))[0].inicioTs, 'servidor: mesmo registro, procedimento apreensao e placa ABC1D23 (inicioTs mantido)', reg);
  ok(await atualizar(G, () => /Apreensão em andamento/.test(document.querySelector('#pn-tfaviso') ? document.querySelector('#pn-tfaviso').textContent : '')), 'aviso: "Apreensão em andamento"');
  aviso = (await G.textContent('#pn-tfaviso')).replace(/\s+/g, ' ');
  ok(/ABC1D23/.test(aviso) && /Apreens/.test(aviso), 'aviso com placa e procedimento', aviso);
  ok(/Apreensão em andamento/i.test(await G.textContent('.pn-geral-vivo .pn-vivo-item.tf')) && /^Apreensão em andamento: Barreira Porto CEASA/.test(await G.textContent('.pn-alertas-caixa .pn-alerta-tit')), 'cartão e alerta: "Apreensão em andamento"');
  st = await G.evaluate(() => Painel.alertaTF()); ok(st.sons === 2 && st.avisos === 2, 'virar apreensão avisa de novo (som/notificação)', st);
  await G.screenshot({ path: amb.saida('alerta_painel_apreensao.png') });
  await G.click('.pn-duo-mapa .leaflet-marker-pane .pn-pin.tf'); await G.waitForSelector('.leaflet-popup-content');
  const pop = (await G.textContent('.leaflet-popup-content')).replace(/\s+/g, ' ');
  ok(/APREENSÃO EM ANDAMENTO|Apreensão em andamento/i.test(pop) && /ABC1D23/.test(pop) && /Fiscal do TF/.test(pop), 'popup do marcador: selo + placa + fiscal do TF', pop.slice(0, 160));

  console.log('3b. Batimento a cada 2 min enquanto o formulário está aberto');
  const antesBat = (await doUsuario('Ana Paula Lima'))[0].atualizadoTs;
  await A.clock.fastForward(121000); await A.waitForTimeout(300);
  ok(await ate(async () => (await doUsuario('Ana Paula Lima'))[0].atualizadoTs > antesBat), 'batimento: atualizadoTs renovado depois de 2 min');

  console.log('4. Gerar o TF → volta a verde e o aviso some');
  await A.fill('#tf-doc', '529.982.247-25'); await A.waitForFunction(() => /Novo cadastro|Cadastro encontrado/.test(document.querySelector('#tf-st-doc').textContent), null, { timeout: 8000 });
  await A.fill('#tf-nome', 'José da Silva');
  const t0 = Date.now();
  await A.click('#tfForm button[type=submit]'); await A.waitForSelector('#tf-num-m', { timeout: 15000 }); await A.click('#tf-m-ok'); await A.waitForSelector('text=TF gerado', { timeout: 10000 });
  ok(Date.now() - t0 < 8000, 'geração do TF não espera o sinal do painel', (Date.now() - t0) + ' ms');
  ok(await ate(async () => (await doUsuario('Ana Paula Lima')).every(x => x.estado === 'fim')), 'servidor: estado "fim" depois de gerar');
  ok(await atualizar(G, () => document.querySelectorAll('.pn-duo-mapa .leaflet-marker-pane .pn-pin.tf').length === 0 && document.querySelectorAll('.pn-duo-mapa .leaflet-marker-pane .pn-pin.ok').length === 1), 'painel: barreira volta a verde');
  ok(await G.isHidden('#pn-tfaviso') && !/TF em preenchimento|Apreensão em andamento/.test(await G.textContent('.pn-alertas-caixa')), 'aviso some e o alerta sai da lista');
  st = await G.evaluate(() => Painel.alertaTF()); ok(!st.rapido && st.proximaMs > 0 && st.proximaMs <= 15000, 'sem TF em preenchimento: segue atualizando a cada 15 s', st.proximaMs);
  await G.screenshot({ path: amb.saida('alerta_painel_fim.png') });

  console.log('5. Descartar e sair do formulário também encerram');
  await A.click('[data-tf=novo]'); await A.waitForSelector('#tfForm');
  ok(await ate(async () => (await doUsuario('Ana Paula Lima')).filter(x => x.estado === 'preenchendo').length === 1), 'novo TF: "preenchendo" de novo (outro rascunho)');
  const rid2 = (await doUsuario('Ana Paula Lima')).find(x => x.estado === 'preenchendo').id; ok(rid2 !== rid1, 'novo formulário = novo id', rid2);
  ok(await atualizar(G, () => document.querySelectorAll('.pn-duo-mapa .leaflet-marker-pane .pn-pin.tf').length === 1), 'painel: vermelho de novo');
  st = await G.evaluate(() => Painel.alertaTF()); ok(st.sons === 3, 'TF novo: novo som', st.sons);
  await A.click('[data-tf=descartar]'); await A.waitForSelector('button[data-tf=novo], .contador, #itens', { timeout: 8000 });
  ok(await ate(async () => (await doUsuario('Ana Paula Lima')).every(x => x.estado === 'fim')), 'descartar: estado "fim"');
  ok(await atualizar(G, () => document.querySelectorAll('.pn-duo-mapa .leaflet-marker-pane .pn-pin.ok').length === 1 && !document.querySelector('.pn-duo-mapa .leaflet-marker-pane .pn-pin.tf')), 'painel: verde depois do descarte');
  // sair do formulário sem gerar (rascunho fica salvo)
  await A.click('nav [data-v=home]'); await A.waitForSelector('.contador'); await A.click('[data-go=tfnovo]'); await A.waitForSelector('#tfForm');
  await A.fill('#tf-nome', 'RASCUNHO GUARDADO'); await A.waitForTimeout(900);
  const rid3 = (await ate(async () => (await doUsuario('Ana Paula Lima')).find(x => x.estado === 'preenchendo'))).id;
  await A.click('nav [data-v=home]'); await A.waitForSelector('.contador');
  ok(await ate(async () => (await doUsuario('Ana Paula Lima')).every(x => x.estado === 'fim')), 'saiu do formulário (menu) sem gerar: estado "fim"');
  ok(await atualizar(G, () => !document.querySelector('.pn-duo-mapa .leaflet-marker-pane .pn-pin.tf')), 'painel: deixa de mostrar vermelho');
  await A.click('[data-go=tfnovo]'); await A.waitForSelector('#tfForm');
  ok((await A.inputValue('#tf-nome')) === 'RASCUNHO GUARDADO' && A.dialogos.some(m => /TF não gerado/.test(m)), 'rascunho continua salvo e é restaurado ao reabrir');
  ok(await ate(async () => { const r = (await doUsuario('Ana Paula Lima')).find(x => x.estado === 'preenchendo'); return r && r.id === rid3; }), 'reabrir o rascunho: volta a "preenchendo" com o mesmo id');
  ok(await atualizar(G, () => document.querySelectorAll('.pn-duo-mapa .leaflet-marker-pane .pn-pin.tf').length === 1), 'painel: vermelho de novo');
  st = await G.evaluate(() => Painel.alertaTF()); ok(st.sons === 4, 'mesmo TF já visto nesta sessão (rascunho reaberto): sem novo som (4 = 3 anteriores + o rascunho novo)', st.sons);

  console.log('6. Batimento expirado (> 10 min sem sinal) → volta a verde');
  await fetch(API + '/__editar?aba=Andamento&col=atualizadoTs&valor=' + (Date.now() - 11 * 60e3) + '&onde=' + encodeURIComponent('estado:preenchendo'));
  ok(await atualizar(G, () => !document.querySelector('.pn-duo-mapa .leaflet-marker-pane .pn-pin.tf') && document.querySelectorAll('.pn-duo-mapa .leaflet-marker-pane .pn-pin.ok').length === 1), 'painel: sem batimento há 11 min = encerrado (verde)');
  ok(await G.isHidden('#pn-tfaviso'), 'aviso some quando expira');
  const dadosSrv = await post({ action: 'painelDados', key: sessaoGestor['gdv.painel.token'], aoVivo: true, ids: [] });
  ok(dadosSrv.ok && Array.isArray(dadosSrv.tfsAndamento) && dadosSrv.tfsAndamento.length === 0, 'servidor (aoVivo): tfsAndamento vazio para registro expirado');
  await A.click('nav [data-v=home]'); await A.waitForSelector('.contador');

  console.log('7. TF sem turno aberto → marcador vermelho próprio na coordenada do TF');
  const B = await aparelho(bruno, PARINTINS);
  await B.click('.modulo[data-v=tf]'); await B.waitForSelector('button[data-tf=novo]'); await B.click('button[data-tf=novo]'); await B.waitForSelector('#tfForm');
  reg = await ate(async () => (await doUsuario('Bruno Costa Souza')).find(x => x.estado === 'preenchendo' && x.lat !== ''));
  ok(reg && reg.turnoId === '' && Math.abs(+reg.lat - PARINTINS.latitude) < 1e-3, 'servidor: TF sem turno (turnoId vazio) com o GPS do aparelho', reg);
  const viaApi = await post({ action: 'painelDados', key: sessaoGestor['gdv.painel.token'] });
  ok(viaApi.tfsAndamento && viaApi.tfsAndamento.length === 1 && viaApi.tfsAndamento[0].turnoId === '' && viaApi.tfsAndamento[0].lat === PARINTINS.latitude, 'painelDados (normal) devolve tfsAndamento', viaApi.tfsAndamento);
  ok(await atualizar(G, () => document.querySelectorAll('.pn-duo-mapa .leaflet-marker-pane .pn-pin.tf').length === 1 && document.querySelectorAll('.pn-duo-mapa .leaflet-marker-pane .pn-pin.ok').length === 1), 'painel: marcador "TF" próprio + a barreira de Ana continua verde');
  aviso = (await G.textContent('#pn-tfaviso')).replace(/\s+/g, ' ');
  ok(/sem turno aberto/.test(aviso) && /Bruno Costa Souza/.test(aviso) && /Parintins/.test(aviso), 'aviso: "sem turno aberto", fiscal e município pela coordenada', aviso);
  ok(/sem turno aberto/.test(await G.textContent('.pn-geral-vivo')) && /TF em preenchimento: /.test(await G.textContent('.pn-alertas-caixa')), 'cartão próprio em "Barreiras em andamento agora" e item nos alertas');
  await G.screenshot({ path: amb.saida('alerta_painel_semturno.png') });

  console.log('8. Fiscal sem internet: nada é enviado e nenhum erro aparece');
  await B.click('nav [data-v=tf]'); await B.waitForSelector('button[data-tf=novo]');
  ok(await ate(async () => (await doUsuario('Bruno Costa Souza')).every(x => x.estado === 'fim')), 'Bruno saiu do formulário: "fim"');
  await B.ctx.setOffline(true); await B.evaluate(() => window.dispatchEvent(new Event('offline')));
  const nAntes = (await andamento()).length;
  await B.click('button[data-tf=novo]'); await B.waitForSelector('#tfForm'); await B.check('input[name=tf-proc][value=rechaco]'); await B.fill('#tf-placa', 'XYZ9A88'); await B.waitForTimeout(2500);
  await B.click('nav [data-v=tf]'); await B.waitForSelector('button[data-tf=novo]'); await B.waitForTimeout(500);
  ok((await andamento()).length === nAntes && (await doUsuario('Bruno Costa Souza')).every(x => x.estado === 'fim'), 'offline: nenhum sinal chega ao servidor (e nada fica em fila)');
  ok(!/\berro\b/.test(await B.getAttribute('#toast', 'class') || '') && !B.dialogos.some(m => /erro|falh/i.test(m)), 'offline: nenhum erro na tela do fiscal');
  await B.ctx.setOffline(false); await B.evaluate(() => window.dispatchEvent(new Event('online'))); await B.waitForTimeout(1500);
  ok((await andamento()).length === nAntes, 'voltou a internet: nada reenviado depois (sem fila)');

  console.log('9. Modo TV: faixa vermelha e salto para "Ao vivo"');
  const TVs = await adminCred('TV Sala da Gerência');
  const T = await painel('tv', TVs, { viewport: { width: 1920, height: 1080 }, url: WEB + '?tv=1&rotacao=300&rotacaoAoVivo=300', semTiles: true });
  await T.waitForSelector('#tv-palco .tv-kpi', { timeout: 20000 }); await T.waitForTimeout(800);
  ok(await T.isHidden('#tv-tf'), 'TV sem TF em preenchimento: sem faixa vermelha');
  ok(/TF em preenchimento \(0\)/.test(await T.textContent('.tv-leg')), 'legenda do mapa da TV com o estado TF');
  await T.evaluate(() => PainelTV.ir('alertas')); await T.waitForTimeout(500);
  ok((await T.evaluate(() => PainelTV.estado())).tela === 'alertas', 'TV na tela Alertas');
  await A.click('[data-go=tfnovo]'); await A.waitForSelector('#tfForm'); await A.check('input[name=tf-proc][value=apreensao]'); await A.fill('#tf-placa', 'QWE4R56');
  ok(await ate(async () => (await doUsuario('Ana Paula Lima')).find(x => x.estado === 'preenchendo' && x.procedimento === 'apreensao' && x.placa === 'QWE4R56')), 'servidor: apreensão em andamento (Ana, com turno)');
  ok(await atualizar(T, () => !document.querySelector('#tv-tf').hidden), 'TV: faixa vermelha no topo');
  await T.waitForTimeout(600);
  const tvE = await T.evaluate(() => PainelTV.estado());
  ok(tvE.tela === 'aovivo' && tvE.restaMs > 300000 * 1.5, 'TV pula para "Ao vivo" e fica nela por pelo menos um ciclo (2 períodos)', tvE);
  const faixa = (await T.textContent('#tv-tf')).replace(/\s+/g, ' ');
  ok(/Apreensão em andamento/i.test(faixa) && /Porto CEASA/.test(faixa) && /Ana Paula Lima/.test(faixa) && /QWE4R56/.test(faixa), 'faixa: apreensão, barreira, fiscal, placa e tempo', faixa);
  ok(await T.locator('.tv-mapa .leaflet-marker-pane .tv-pin.tf').count() === 1 && /APREENSÃO/.test(await T.textContent('.tv-mapa .tv-rotulo.tf')), 'mapa da TV: marcador "TF" vermelho + rótulo "APREENSÃO"');
  ok(/Apreensão em andamento/i.test(await T.textContent('.tv-lista')) && /TF em preenchimento \(\d\)/.test(await T.textContent('.tv-leg')), 'lista e legenda da TV com o novo estado');
  ok(await T.isHidden('#pn-tfaviso').catch(() => true), 'TV: sem o aviso flutuante do painel normal (a faixa faz o papel)');
  let L = await layout(T);
  ok(!L.probs.length, 'TV com faixa: sem rolagem, sem texto cortado/sobreposto', L.probs.slice(0, 6));
  await T.screenshot({ path: amb.saida('alerta_tv.png') });
  ok((await T.evaluate(() => Painel.alertaTF())).sons >= 1, 'TV: tentativa de som (com a flag do quiosque toca sem clique)');
  // fim → a faixa some
  await A.click('nav [data-v=home]'); await A.waitForSelector('.contador');
  ok(await ate(async () => (await doUsuario('Ana Paula Lima')).every(x => x.estado === 'fim')), 'Ana saiu do TF: "fim"');
  ok(await atualizar(T, () => document.querySelector('#tv-tf').hidden && !document.querySelector('.tv-mapa .tv-pin.tf')), 'TV: faixa some e o marcador volta ao normal');
  await T.waitForTimeout(500);
  L = await layout(T); ok(!L.probs.length, 'TV sem faixa: layout ok', L.probs.slice(0, 6));
  await T.screenshot({ path: amb.saida('alerta_tv_fim.png') });
  // TF sem turno (Bruno, online de novo) na TV + 4K
  await B.click('button[data-tf=novo]'); await B.waitForSelector('#tfForm');
  ok(await ate(async () => (await doUsuario('Bruno Costa Souza')).find(x => x.estado === 'preenchendo')), 'Bruno (online de novo) abre TF sem turno');
  ok(await atualizar(T, () => !document.querySelector('#tv-tf').hidden && document.querySelectorAll('.tv-mapa .tv-pin.tf').length === 1), 'TV: faixa + marcador do TF sem turno');
  await T.waitForTimeout(500);
  ok(/sem turno aberto/i.test(await T.textContent('.tv-lista')), 'lista da TV: linha "sem turno aberto"');
  L = await layout(T); ok(!L.probs.length, 'TV (TF sem turno): layout ok', L.probs.slice(0, 6));
  await T.screenshot({ path: amb.saida('alerta_tv_semturno.png') });
  // mapa ≈ 60% da largura e na altura toda da tela Ao vivo (indicadores na coluna da direita); Chrome em janela com barras
  // (1366×620), TV que reporta 1366×768, 1080p e 4K, com a faixa vermelha
  for (const [w, h] of [[1366, 620], [1366, 768], [3840, 2160], [1920, 1080]]) {
    await T.setViewportSize({ width: w, height: h }); await T.waitForTimeout(900);
    const G = await geoVivo(T);
    L = await layout(T);
    ok(!L.probs.length && G.largura > 0.57 && G.largura < 0.63, `TV ${w}×${h} com faixa: mapa ${(G.largura * 100).toFixed(0)}% da largura, sem rolagem/corte/sobreposição`, L.probs.slice(0, 4));
    ok(G.kpisTopo === 0 && G.kpisDir === 2 && G.kpisAcimaLista, `TV ${w}×${h} com faixa: sem linha de KPIs no topo; indicadores acima da lista`, G);
    ok(G.mapaAltura >= 0.7 && G.cartaoAltura >= 0.97 && G.municipios === 62 && G.fora === 0, `TV ${w}×${h} com faixa: mapa com ${(G.mapaAltura * 100).toFixed(0)}% da altura útil e os 62 municípios no quadro`, G);
    await T.screenshot({ path: amb.saida(`alerta_tv_${w}x${h}.png`) });
    if (w === 1366 && h === 768) await T.screenshot({ path: amb.saida('tv_aovivo_novo_tf_1366x768.png') });
  }
  await B.click('nav [data-v=tf]'); await B.waitForSelector('button[data-tf=novo]');

  console.log('10. Servidor: validação da action');
  const tokA = ana.token;
  const r1 = await post({ action: 'tfAndamento', key: tokA, estado: 'xx', rascunhoId: 'a' }), r2 = await post({ action: 'tfAndamento', key: tokA, estado: 'preenchendo', rascunhoId: '../x' });
  const r3 = await post({ action: 'tfAndamento', key: 'invalida', estado: 'preenchendo', rascunhoId: 'abc' }), r4 = await post({ action: 'tfAndamento', key: tokA, estado: 'fim', rascunhoId: 'nunca-aberto' });
  ok(!r1.ok && !r2.ok && !r3.ok && r4.ok, 'estado/rascunho inválidos e credencial inválida são recusados; "fim" sem registro é ignorado', [r1.erro, r2.erro, r3.erro, r4.ok]);
  const r5 = await post({ action: 'tfAndamento', key: tokA, estado: 'preenchendo', rascunhoId: 'teste-lim', placa: 'abc-1d23xxxxx', procedimento: 'outro', lat: 999, lon: 'x', local: 'L'.repeat(500) });
  const g5 = (await doUsuario('Ana Paula Lima')).find(x => x.id === 'Ana Paula Lima|teste-lim');
  ok(r5.ok && g5 && g5.placa.length <= 8 && g5.procedimento === '' && g5.lat === '' && g5.lon === '' && g5.local.length <= 120, 'campos saneados (placa, procedimento, coordenada fora da faixa, tamanho)', g5);
  await post({ action: 'tfAndamento', key: tokA, estado: 'fim', rascunhoId: 'teste-lim' });

  ok(!erros.length, 'sem erros de console/página', erros.slice(0, 8));
  console.log(falhas ? 'FALHOU=' + falhas : 'OK');
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('FALHOU', e.stack || e.message); process.exit(1); });
