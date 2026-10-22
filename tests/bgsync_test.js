const amb = require('./lib/amb');
// Envio em segundo plano (Background Sync): o service worker envia os pendentes com o app FECHADO quando a rede volta.
const { chromium } = require('playwright-core');
const { API, APP, ORIGEM } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const aba = async n => { const rows = await get('/__aba?nome=' + n); if (!rows) return []; const cab = rows[0]; return rows.slice(1).map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]))); };
const esperar = async (f, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await new Promise(r => setTimeout(r, 250)); } return false; };
// lê o IndexedDB numa página da mesma origem que NÃO é o app (o app está "fechado")
const lerIDB = (pg, store) => pg.evaluate(s => new Promise((ok, no) => { const rq = indexedDB.open('gdv'); rq.onsuccess = () => { const d = rq.result;
  const g = d.transaction(s).objectStore(s).getAll(); g.onsuccess = () => { d.close(); ok(g.result); }; g.onerror = () => no(g.error); }; rq.onerror = () => no(rq.error); }), store);
const gravarIDB = (pg, store, rec) => pg.evaluate(([s, r]) => new Promise((ok, no) => { const rq = indexedDB.open('gdv'); rq.onsuccess = () => { const d = rq.result;
  const t = d.transaction(s, 'readwrite'); t.objectStore(s).put(r); t.oncomplete = () => { d.close(); ok(); }; t.onerror = () => no(t.error); }; }), [store, rec]);

(async () => {
  const b = await amb.lancar();
  const erros = [];
  async function abrirCtx(nome, semSuporte) {
    const a = await amb.usuario(nome);
    const c = await b.newContext({ viewport: { width: 400, height: 820 }, timezoneId: 'America/Manaus', locale: 'pt-BR', permissions: ['geolocation', 'background-sync'], geolocation: { latitude: -3.119, longitude: -60.021, accuracy: 10 } });
    await c.route('https://nominatim.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await c.addInitScript(([k, n]) => { if (!localStorage.getItem('__init')) { localStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API);
      localStorage.setItem('gdv.key', k); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } }, [a.token, nome]);
    if (semSuporte) await c.addInitScript(() => { try { delete window.SyncManager; delete ServiceWorkerRegistration.prototype.sync; delete ServiceWorkerRegistration.prototype.periodicSync; } catch (e) {} });
    const p = await c.newPage();
    p.on('pageerror', e => erros.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') erros.push(m.text() + ' @' + JSON.stringify(m.location())); });
    p.on('response', r => { if (r.status() === 404) erros.push('404 ' + r.url()); });
    p.on('dialog', d => d.accept());
    return { c, p, token: a.token };
  }
  const prep = async p => {
    await p.goto(APP); await p.waitForSelector('.modulo');
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => p.reload().then(() => p.waitForSelector('.modulo')));
  };
  const iniciarTurno = async (p, n) => {
    await p.click('nav [data-v=modulos]').catch(() => {}); await p.waitForSelector('.modulo[data-v=home]'); await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno');
    await p.fill('#nTF', String(n)); await p.selectOption('#nPosto', 'Fixa'); await p.click('#fTurno button[type=submit]'); await p.waitForSelector('.contador');
    return p.evaluate(() => Store.meta('turnoAtual'));
  };
  const registrar = async (p, placa) => { await p.waitForTimeout(400); await p.click('nav [data-v=registrar]'); await p.waitForSelector('#fVeic'); await p.waitForTimeout(500);
    for (let i = 0; i < 5 && await p.inputValue('#placa').catch(() => '') !== placa; i++) { await p.fill('#placa', placa); await p.waitForTimeout(300); }
    await p.click('#fVeic > button');
    await p.waitForFunction(pl => document.querySelector('#toast').textContent.includes(pl), placa, { timeout: 8000 }).catch(async e => { console.log('TOAST', await p.textContent('#toast'), await p.inputValue('#placa').catch(()=>'?'), await p.evaluate(() => VIEW), erros); throw e; }); };
  const encerrar = async p => { await p.click('nav [data-v=resumo]'); await p.waitForSelector('#encerrar'); await p.click('#encerrar'); await p.waitForSelector('[data-doc=termo]'); };
  const syncApp = p => p.evaluate(async () => { for (let i = 0; i < 40 && Sync.estado().tipo === 'sync'; i++) await new Promise(r => setTimeout(r, 150)); await Sync.sincronizar(); return Sync.estado(); });

  /* ================= 1. Android: encerra offline, fecha o app, a rede volta, o SW envia ================= */
  console.log('1. Envio em segundo plano com o app fechado');
  const A = await abrirCtx('Fiscal Fundo Pereira');
  let p = A.p;
  await prep(p);
  ok(await p.evaluate(() => Sync.envioAutomatico()), 'Chromium: Background Sync suportado (SyncManager)');
  const cred = await p.evaluate(() => Store.meta('cred')), keyLS = await p.evaluate(() => localStorage.getItem('gdv.key'));
  ok(cred && cred.key === keyLS && cred.url === amb.API + '/' && cred.nome === 'Fiscal Fundo Pereira' && !cred.revogado, 'credencial espelhada na meta "cred" do IndexedDB ao abrir o app', cred && { ...cred, key: '…' });
  const idT = await iniciarTurno(p, 71); await registrar(p, 'BGS1A11'); await syncApp(p);
  ok((await aba('Turnos')).some(t => t.id === idT && Number(t.encerrado) === 0), 'turno aberto chegou à planilha (online)');
  // sem internet: registra 2 veículos e encerra
  await A.c.setOffline(true); await fetch(API + '/__off');
  await registrar(p, 'BGS2B22'); await registrar(p, 'BGS3C33');
  await encerrar(p);
  const txtEnc = await p.textContent('#encPend');
  ok(/ainda não enviado à planilha — será enviado automaticamente quando houver internet/.test(txtEnc), 'tela do turno encerrado: "— será enviado automaticamente quando houver internet"', txtEnc);
  await p.click('nav [data-v=modulos]'); await p.click('nav [data-v=config]'); await p.waitForSelector('#cEst');
  const est = await p.textContent('#cEst');
  ok(/pendentes de envio: [1-9]\d* — será enviado automaticamente/.test(est), 'Status: pendentes + aviso do envio automático', est);
  const tags = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).sync.getTags()));
  ok(tags.includes('gdv-enviar'), 'tag "gdv-enviar" registrada no Background Sync', tags);
  const pend0 = await p.evaluate(async () => (await Envio.pendentes()).total);
  ok(pend0 >= 3, 'pendentes no aparelho antes de fechar (turno + 2 veículos)', pend0);
  // fecha o app: navega para outra página da mesma origem (sem o app)
  await p.goto(APP + 'manifest.webmanifest');
  ok(await p.evaluate(() => typeof window.Sync === 'undefined'), 'app fechado (página sem o app)');
  // a rede volta; dispara o evento sync no service worker (CDP)
  const cdp = await A.c.newCDPSession(p);
  const regs = []; cdp.on('ServiceWorker.workerRegistrationUpdated', e => regs.push(...e.registrations));
  await cdp.send('ServiceWorker.enable'); await esperar(() => regs.some(r => r.scopeURL === APP && !r.isDeleted), 5000);
  const reg = regs.find(r => r.scopeURL === APP && !r.isDeleted);
  ok(!!reg, 'registro do service worker encontrado', reg && reg.registrationId);
  await fetch(API + '/__on'); await A.c.setOffline(false);
  await cdp.send('ServiceWorker.dispatchSyncEvent', { origin: ORIGEM, registrationId: reg.registrationId, tag: 'gdv-enviar', lastChance: false });
  const chegou = await esperar(async () => { const t = (await aba('Turnos')).find(x => x.id === idT); const v = (await aba('Veiculos')).filter(x => x.turnoId === idT);
    return t && Number(t.encerrado) === 1 && v.length === 3; });
  const linhaT = (await aba('Turnos')).find(x => x.id === idT);
  ok(chegou, 'planilha recebeu o encerramento e os veículos (app fechado)', { encerrado: linhaT && linhaT.encerrado, fim: linhaT && linhaT.fim, veic: (await aba('Veiculos')).filter(x => x.turnoId === idT).map(v => v.placa) });
  await esperar(async () => !(await lerIDB(p, 'turnos')).some(t => t.pendente) && !(await lerIDB(p, 'veiculos')).some(v => v.pendente), 5000);
  const tl = (await lerIDB(p, 'turnos')).find(t => t.id === idT), vl = await lerIDB(p, 'veiculos');
  ok(tl && tl.pendente === 0 && Number(tl.encerrado) === 1 && vl.every(v => v.pendente === 0), 'IndexedDB: turno e veículos marcados como enviados (pendente 0)', { t: tl && tl.pendente, v: vl.map(v => v.pendente) });
  const meta = await lerIDB(p, 'meta'), ls = (meta.find(m => m.k === 'lastSync') || {}).v;
  ok(true, 'lastSync após o envio em segundo plano (só subida; não avança aqui)', ls);

  // SW direto: falha de rede rejeita (o navegador tenta de novo); sucesso sem pendentes resolve
  const sw = A.c.serviceWorkers().find(w => w.url().startsWith(ORIGEM)) || await A.c.waitForEvent('serviceworker');
  await gravarIDB(p, 'veiculos', { id: 'bg-v-rede', turnoId: idT, hora: '10:00', placa: 'BGS4D44', tipo: 'PA', pessoas: 1, obs: '', excluido: 0, criadoEm: Date.now(), atualizadoEm: Date.now(), pendente: 1 });
  await fetch(API + '/__off');
  const rRede = await sw.evaluate(() => enviarEmSegundoPlano().then(r => ({ ok: true, r }), e => ({ ok: false, erro: String(e && e.message || e) })));
  ok(!rRede.ok, 'servidor fora do ar: a promise do evento rejeita (o navegador tenta de novo)', rRede);
  ok((await lerIDB(p, 'veiculos')).find(v => v.id === 'bg-v-rede').pendente === 1, '... e o registro continua pendente');
  await fetch(API + '/__on');
  const rOk = await sw.evaluate(() => enviarEmSegundoPlano());
  ok(rOk.enviados === 1 && (await lerIDB(p, 'veiculos')).find(v => v.id === 'bg-v-rede').pendente === 0 && (await aba('Veiculos')).some(v => v.id === 'bg-v-rede'), 'nova tentativa com rede: enviado e marcado', rOk);
  // edição durante o envio: atualizadoEm diferente → continua pendente (mesma regra do sync.js)
  const ed = await sw.evaluate(async () => {
    const v = await Store.obter('veiculos', 'bg-v-rede'); await Store.salvar('veiculos', { ...v, obs: 'editado' });
    const enviado = await Store.obter('veiculos', 'bg-v-rede');
    await Store.salvar('veiculos', { ...enviado, obs: 'editado de novo' });             // nova edição "durante" o envio
    await Envio.marcarEnviados('veiculos', [enviado], []);
    return (await Store.obter('veiculos', 'bg-v-rede')).pendente;
  });
  ok(ed === 1, 'marcarEnviados: registro editado durante o envio continua pendente', ed);
  await sw.evaluate(() => enviarEmSegundoPlano());

  // reabrir o app SEM internet: o selo já mostra 0 pendentes (o que o SW enviou)
  await A.c.setOffline(true); await fetch(API + '/__off');
  await p.goto(APP); await p.waitForSelector('.modulo'); await p.waitForTimeout(500);
  const selo = await p.textContent('#sync');
  ok(/Offline/.test(selo) && !/a enviar/.test(selo), 'app reaberto (offline): selo sem pendentes', selo);
  ok(await p.evaluate(async () => (await Envio.pendentes()).total) === 0, 'reaberto: 0 pendentes');
  await p.evaluate(id => go('fechado', id), idT);
  await p.waitForSelector('#encPend');
  ok(/Turno encerrado, bom descanso!/.test(await p.textContent('#encPend')), 'tela do turno: "✅ Turno encerrado, bom descanso!"', await p.textContent('#encPend'));
  await A.c.setOffline(false); await fetch(API + '/__on');

  // app aberto e sincronizando ao mesmo tempo que o SW: tudo enviado, nada corrompido
  const idT2 = await iniciarTurno(p, 72);
  for (const pl of ['BGP1A11', 'BGP2B22', 'BGP3C33']) await registrar(p, pl);
  await Promise.all([syncApp(p), sw.evaluate(() => enviarEmSegundoPlano()), syncApp(p)]);
  await syncApp(p);
  const vv = (await aba('Veiculos')).filter(v => v.turnoId === idT2);
  ok(vv.length === 3 && new Set(vv.map(v => v.id)).size === 3, 'app e SW enviando juntos: sem duplicar na planilha', vv.map(v => v.placa));
  ok(await p.evaluate(async () => (await Envio.pendentes()).total) === 0, 'app e SW juntos: 0 pendentes no aparelho');

  /* ================= 2. credencial revogada: marca e para (sem loop) ================= */
  console.log('2. Credencial revogada');
  await A.c.setOffline(true); await fetch(API + '/__off');
  await registrar(p, 'BGR1A11');
  await p.goto(APP + 'manifest.webmanifest');                              // fecha o app
  await A.c.setOffline(false); await fetch(API + '/__on');
  await fetch(API + '/__revogar?nome=' + encodeURIComponent('Fiscal Fundo Pereira'));
  const r1 = await sw.evaluate(() => enviarEmSegundoPlano());
  ok(r1.motivo === 'credencial revogada', '1º envio: servidor recusa a credencial → resolve (sem repetir)', r1);
  const c1 = (await lerIDB(p, 'meta')).find(m => m.k === 'cred').v;
  ok(c1.revogado === 1, 'meta cred marcada como revogada', c1.revogado);
  const n0 = (await aba('Veiculos')).length;
  const t0 = Date.now(), r2 = await sw.evaluate(() => enviarEmSegundoPlano());
  ok(r2.motivo === 'credencial revogada' && Date.now() - t0 < 1000, '2º evento: para na hora, sem chamar o servidor', r2);
  await cdp.send('ServiceWorker.dispatchSyncEvent', { origin: ORIGEM, registrationId: reg.registrationId, tag: 'gdv-enviar', lastChance: true });
  await new Promise(r => setTimeout(r, 800));
  ok((await aba('Veiculos')).length === n0 && (await lerIDB(p, 'veiculos')).some(v => v.placa === 'BGR1A11' && v.pendente === 1), 'nada enviado; o registro continua guardado no aparelho');
  await p.goto(APP); await p.waitForSelector('#view');
  await p.click('.modulo[data-v=home]').catch(() => {}); await p.waitForTimeout(400);
  ok(/Acesso revogado/.test(await p.textContent('#view')), 'app reaberto: pede novo código (revogação vista pelo service worker)', (await p.textContent('#view')).slice(0, 80));
  ok(await p.evaluate(() => localStorage.getItem('gdv.revogado')) === '1', 'localStorage gdv.revogado = 1');
  // desativar o aparelho apaga a cópia da credencial
  await p.evaluate(() => Sync.desativar()); await p.waitForTimeout(300);
  ok(!(await p.evaluate(() => Store.meta('cred'))), 'desativar: meta "cred" apagada');
  const r3 = await sw.evaluate(() => enviarEmSegundoPlano());
  ok(r3.motivo === 'aparelho não ativado', 'SW sem credencial: não envia', r3);
  await A.c.close();

  /* ================= 3. navegador sem Background Sync (iPhone) ================= */
  console.log('3. Sem suporte a Background Sync');
  const B = await abrirCtx('Fiscal Iphone Ramos', true);
  p = B.p; await prep(p);
  ok(!(await p.evaluate(() => Sync.envioAutomatico())), 'sem SyncManager: envioAutomatico() = false');
  const idB = await iniciarTurno(p, 73); await syncApp(p);
  await B.c.setOffline(true); await fetch(API + '/__off');
  await registrar(p, 'IPH1A11'); await encerrar(p);
  const txtB = await p.textContent('#encPend');
  ok(/ainda não enviado à planilha — abra o app com internet para enviar/.test(txtB), 'aviso: "— abra o app com internet para enviar"', txtB);
  await B.c.setOffline(false); await fetch(API + '/__on'); await syncApp(p); await p.waitForTimeout(500);
  ok((await aba('Turnos')).find(t => t.id === idB).encerrado === 1 && /Turno encerrado, bom descanso!/.test(await p.textContent('#encPend').catch(() => '')), 'com o app aberto e internet: enviado normalmente');
  await B.c.close();

  const errosReais = erros.filter(e => !/ERR_EMPTY_RESPONSE|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
  ok(!errosReais.length, 'sem erros de página', errosReais.slice(0, 5));
  await b.close();
  console.log(`FALHOU=${falhas}`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
