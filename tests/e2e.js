const amb = require('./lib/amb');
const { chromium } = require('playwright-core');
const assert = require('assert');
(async () => {
  const b = await amb.lancar();
  const ctx = await b.newContext({ viewport: { width: 400, height: 800 }, permissions: ['geolocation'], geolocation: { latitude: -3.1190275, longitude: -60.0217314, accuracy: 12 } });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(e.message)); page.on('console', m => m.type() === 'error' && erros.push(m.text()));
  page.on('dialog', d => d.accept());
  const dump = async () => (await fetch(amb.API + '/__dump')).json();
  await ctx.addInitScript(() => { if (window !== window.top) { window.print = () => { window.top.__prints = window.top.__prints || []; window.top.__prints.push(document.body.innerText.replace(/\s+/g, ' ')); window.top.__titulo = window.top.document.title; }; } });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', 'segredo'); } } catch (e) {} });
  await fetch(amb.API + '/__off');                      // começa SEM servidor
  await page.goto(amb.APP);
  await page.waitForSelector('.modulo'); console.log('módulos após ativar:', await page.locator('.modulo').count(), '| nav:', (await page.$$eval('#nav button', bs => bs.map(x => x.textContent.trim()))).join(' / '));
  await page.click('.modulo[data-v=home]'); await page.waitForSelector('#fTurno');
  // configura sync (servidor fora do ar) – só salva
  await page.evaluate(() => { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', 'segredo'); });
  await page.fill('#nTF', '7'); let t0; await page.selectOption('#nPosto', 'Fixa'); 
  await page.selectOption('#nLocal', 'BVA - CEASA'); 
  await page.click('#fTurno button[type=submit]');
  console.log('sem fiscal ->', await page.textContent('#toast'));
  await page.fill('#nFiscal1', 'Joao'); await page.click('#fTurno button[type=submit]');
  console.log('nome curto ->', await page.textContent('#toast'));
  await page.fill('#nFiscal1', 'João  Silva'); await page.fill('#nFiscal2', 'Maria das Graças Souza');
  await page.click('#fTurno button[type=submit]'); await page.waitForSelector('.contador');
  // registra 3 veículos
  for (const [pl, tipo] of [['ABC1D23', 'PA'], ['XYZ9K88', 'ON'], ['QQQ1A11', 'CC']]) {
    await page.waitForTimeout(400); await page.click('nav [data-v=registrar]'); await page.waitForTimeout(300); await page.waitForSelector('#fVeic');
    await page.fill('#placa', pl.toLowerCase()); await page.check(`input[value=${tipo}]`);
    await page.click('#fVeic button');
    await page.waitForFunction(p => document.querySelector('#toast').textContent.includes(p), pl, {timeout:4000}).catch(async e => { console.log('TOAST=', await page.textContent('#toast'), 'URL erros=', erros); throw e; });
  }
  // edita um e exclui outro
  await page.click('nav [data-v=lista]'); await page.waitForSelector('.item');
  assert.equal(await page.locator('.item').count(), 3);
  await page.locator('[data-del]').first().click(); await page.waitForFunction(() => document.querySelectorAll('.item').length === 2);
  await page.locator('[data-edit]').first().click(); await page.waitForSelector('#fVeic');
  await page.fill('#obs', 'carga de frutas'); await page.click('#fVeic button'); await page.waitForSelector('.item');
  console.log('offline: 2 veículos ativos, pendentes ->', (await page.locator('.pend').count()));
  // resumo
  await page.click('nav [data-v=resumo]'); await page.waitForSelector('.total');
  console.log('resumo total:', (await page.textContent('.total')).replace(/\s+/g, ' '));
  // ficha (turno aberto) e encerramento
  const docs = {};
  const cap = async (sel) => { await page.click(sel); await page.waitForFunction(() => window.__prints && window.__prints.length > 0, null, { timeout: 8000 });
    return page.evaluate(() => { const t = window.__prints.pop(); window.__prints.length = 0; return t; }); };
  assert.equal(await page.locator('[data-doc=termo]').count(), 0, 'Termo não deve aparecer antes de encerrar');
  docs.ficha = await cap('[data-doc=ficha]');
  await page.waitForTimeout(61000);                                   // garante fim > início
  await page.click('#encerrar'); await page.waitForSelector('[data-doc=termo]');
  console.log('tela encerrado:', (await page.textContent('main')).replace(/\s+/g, ' ').slice(0, 120), '| início capturado:', t0);
  t0 = await page.evaluate(async () => { const ts = await Store.todos('turnos'); return ts.sort((a, b) => b.criadoEm - a.criadoEm)[0].inicio; });   // início real gravado pelo app
  docs.termo = await cap('[data-doc=termo]');
  const m = docs.termo.match(/das (\d\d:\d\d) horas às (\d\d:\d\d) horas/); console.log('TERMO horários:', m && m[1], m && m[2]);
  assert.equal(m[1], t0); assert.ok(m[2] > m[1]);
  // coordenadas NÃO podem aparecer em nenhuma tela do app
  const vazou = async pg => { const t = await pg.evaluate(() => document.body.innerText); return /-3\.1190|-60\.0217|📍 (Início|Encerramento|Local)|Local de início/.test(t); };
  const telas = {}; telas.encerrado = await vazou(page);
  for (const v of ['home', 'registrar', 'lista', 'resumo', 'historico', 'config']) { if (v === 'config') await page.click('nav [data-v=modulos]'); await page.click(`nav [data-v=${v}]`); await page.waitForTimeout(350); telas[v] = await vazou(page); }
  console.log('coordenadas visíveis em alguma tela? ->', JSON.stringify(telas));
  assert.ok(!Object.values(telas).some(Boolean), 'coordenadas não devem aparecer no app');
  assert.equal(await page.locator('#reabrir').count(), 0, 'não deve haver botão de reabrir');
  assert.ok(docs.termo.includes('-3.11903, -60.02173'), 'Termo deve ter a coordenada final');
  console.log('título na impressão:', await page.evaluate(() => window.__titulo), '| título depois:', await page.evaluate(() => document.title));
  console.log('TERMO:', docs.termo.match(/Aos .*?pessoas\./)?.[0]);
  console.log('FICHA tem placas:', /ABC1D23|XYZ9K88|QQQ1A11/.test(docs.ficha), '| total:', docs.ficha.match(/Total de ve.culos parados:\s*(\d+)/)?.[1]);
  // servidor ainda vazio?
  console.log('servidor off, linhas na planilha:', (await dump().catch(() => 'sem resposta (esperado)')));
  // volta a internet → sincroniza
  await fetch(amb.API + '/__on');
  await page.evaluate(() => Sync.sincronizar()); await page.click('nav [data-v=modulos]'); await page.click('nav [data-v=config]'); console.log('botão sincronizar existe?', await page.locator('#cSync').count(), '| campos URL/chave visíveis?', await page.locator('#cUrl, #cKey').count());
  await page.waitForFunction(() => /pendentes de envio: 0/.test((document.querySelector('#cEst')?.textContent || '')), null, { timeout: 8000 }).catch(async e => { console.log('EST=', await page.textContent('#cEst'), await page.textContent('#toast'), erros); throw e; });
  const s = await dump();
  console.log('cabeçalho Turnos:', JSON.stringify(s.T[0].slice(13)));
  console.log('linha antiga preservada:', JSON.stringify(s.T[1].slice(0, 6)));
  console.log('planilha Turnos (novo):', JSON.stringify(s.T[2]));
  console.log('planilha Veiculos linhas:', s.V.length - 1, '| excluídos:', s.V.slice(1).filter(r => r[7] === 1).length);
  // segundo aparelho: contexto limpo, baixa tudo da planilha
  const c2 = await b.newContext(); const p2 = await c2.newPage(); p2.on('dialog', d => d.accept());
  await p2.goto(amb.APP);
  await p2.evaluate(() => { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', 'segredo'); });
  await p2.reload(); await p2.waitForSelector('.modulo'); await p2.click('.modulo[data-v=home]');
  await p2.click('nav [data-v=historico]');
  await p2.waitForFunction(() => /veículos/.test(document.querySelector('#hOut')?.textContent || '') && document.querySelector('.kpi b')?.textContent !== '0', null, { timeout: 10000 });
  console.log('aparelho 2 histórico KPIs:', (await p2.locator('.kpi').allTextContents()).join(' | '));
  // limpar histórico no aparelho 2 (tudo sincronizado)
  await p2.click('nav [data-v=historico]'); await p2.waitForSelector('#limpar');
  await p2.waitForFunction(() => document.querySelector('.kpi b')?.textContent !== '0', null, { timeout: 8000 });
  await p2.click('#limpar'); await p2.waitForFunction(() => document.querySelector('.kpi b')?.textContent === '0', null, { timeout: 8000 });
  console.log('após limpar: KPIs =', (await p2.locator('.kpi').allTextContents()).join(' | '));
  await p2.evaluate(() => Sync.sincronizar()); await p2.waitForTimeout(1500);
  await p2.click('nav [data-v=lista]'); await p2.click('nav [data-v=historico]'); await p2.waitForSelector('#limpar');
  console.log('após novo sync, histórico volta? KPIs =', (await p2.locator('.kpi').allTextContents()).join(' | '));
  console.log('planilha intacta: veículos =', ((await dump()).V.length - 1));
  // GPS negado: turno deve iniciar mesmo assim
  const c3 = await b.newContext({ permissions: [] }); const p3 = await c3.newPage(); p3.on('dialog', d => d.accept());
  await p3.goto(amb.APP); await p3.waitForSelector('#fAtivar');
  console.log('sem ativação -> formulário de turno?', await p3.locator('#fTurno').count(), '| texto antigo presente?', (await p3.textContent('main')).includes('ficam salvos'));
  await p3.evaluate(() => { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', 'segredo'); });
  await p3.reload(); await p3.waitForSelector('.modulo'); await p3.click('.modulo[data-v=home]'); await p3.waitForSelector('#fTurno');
  await p3.fill('#nTF', '9'); await p3.selectOption('#nPosto', 'Móvel'); await p3.fill('#nLocal', 'X'); await p3.fill('#nUnidade', 'MANAUS'); await p3.fill('#nFiscal1', 'Ana Paula Lima');
  await p3.click('#fTurno button[type=submit]'); await p3.waitForSelector('.contador', { timeout: 20000 });
  console.log('GPS negado -> turno iniciou | toast:', (await p3.textContent('#toast')).slice(0, 60));
  // ---------- ativação por código de 6 dígitos ----------
  const URLGS = 'https://script.google.com/macros/s/AKfycbx58-TObty08Aqc5Vft30r_G_zzLPq_agJReOqJcFgXRKkVXoqb4vFPowi3kDKo3q7p/exec';
  const rota = async pg => pg.route(URLGS, async route => {
    const r = await fetch(amb.API + '/', { method: 'POST', body: route.request().postData() });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: await r.text() });
  });
  const nomeF = 'Maria das Graças Souza';
  const g1 = await (await fetch(amb.API + '/__gerar?nome=' + encodeURIComponent(nomeF))).json();
  console.log('código gerado:', g1.codigo, '| nome de uma palavra:', JSON.stringify(await (await fetch(amb.API + '/__gerar?nome=Joao')).json()));
  const c6 = await b.newContext({ permissions: ['geolocation'], geolocation: { latitude: -3.1, longitude: -60.0, accuracy: 10 } });
  const p6 = await c6.newPage(); p6.on('dialog', d => d.accept()); await rota(p6);
  await p6.goto(amb.APP); await p6.waitForSelector('#fAtivar');
  await p6.fill('#aCod', '000000'); await p6.click('#fAtivar button');
  await p6.waitForFunction(() => document.querySelector('#toast').textContent.includes('incorreto'), null, { timeout: 8000 });
  console.log('código errado ->', await p6.textContent('#toast'));
  await p6.fill('#aCod', g1.codigo.slice(0, 3) + ' ' + g1.codigo.slice(3)); await p6.click('#fAtivar button');
  await p6.waitForSelector('.modulo', { timeout: 8000 }); console.log('após ativar -> tela de módulos:', (await p6.locator('.modulo b').allTextContents()).join(' | '));
  await p6.click('.modulo[data-v=home]'); await p6.waitForSelector('#fTurno', { timeout: 8000 }); await p6.waitForSelector('#nFiscal1');
  console.log('após ativar -> Fiscal 1:', await p6.inputValue('#nFiscal1'), '| somente leitura:', await p6.getAttribute('#nFiscal1', 'readonly') !== null, '| cartão de ativação some:', await p6.locator('#fAtivar').count() === 0);
  console.log('credencial != código:', await p6.evaluate(c => localStorage.getItem('gdv.key') !== c && localStorage.getItem('gdv.key').length >= 32, g1.codigo));
  await p6.fill('#nTF', '21'); await p6.selectOption('#nPosto', 'Móvel'); await p6.fill('#nLocal', 'BR-174'); await p6.fill('#nUnidade', 'MANAUS'); await p6.fill('#nFiscal2', 'João Silva');
  await p6.click('#fTurno button[type=submit]'); await p6.waitForSelector('.contador');
  await p6.waitForTimeout(400); await p6.click('nav [data-v=registrar]'); await p6.waitForTimeout(300); await p6.fill('#placa', 'MMM1A11'); await p6.click('#fVeic button');
  await p6.waitForFunction(() => document.querySelector('#toast').textContent.includes('registrado'));
  await p6.evaluate(() => Sync.sincronizar()); await p6.waitForTimeout(1500);
  const d2 = await dump();
  const linhaT = d2.T.find(r => r[1] === 'TF-021-' + 'B-2026' || String(r[1]).startsWith('TF-021'));
  console.log('planilha: turno do fiscal -> fiscal:', linhaT && linhaT[6], '| usuario:', linhaT && linhaT[linhaT.length - 1]);
  console.log('planilha: veículo -> usuario:', d2.V.find(r => r[3] === 'MMM1A11')?.slice(-1)[0], '| aba Fiscais:', JSON.stringify(d2.F.slice(1).map(r => [r[0], r[1] === '' ? '(código consumido)' : r[1], r[3]])));
  // código de uso único
  const c7 = await b.newContext(); const p7 = await c7.newPage(); await rota(p7);
  await p7.goto(amb.APP); await p7.waitForSelector('#fAtivar'); await p7.fill('#aCod', g1.codigo); await p7.click('#fAtivar button');
  await p7.waitForFunction(() => document.querySelector('#toast').textContent.length > 5); console.log('reuso do código ->', await p7.textContent('#toast'));
  // revogação
  console.log('revogados:', await (await fetch(amb.API + '/__revogar?nome=' + encodeURIComponent(nomeF))).text());
  await p6.evaluate(() => Sync.sincronizar()); await p6.waitForTimeout(1500);
  await p6.click('nav [data-v=modulos]'); await p6.click('nav [data-v=config]'); await p6.waitForTimeout(500);
  console.log('após revogar -> selo:', await p6.textContent('#sync'), '| cartão:', (await p6.locator('#fAtivar h3').textContent()));
  // bloqueio por tentativas
  const c8 = await b.newContext(); const p8 = await c8.newPage(); await rota(p8);
  await p8.goto(amb.APP); await p8.waitForSelector('#fAtivar');
  const g2 = await (await fetch(amb.API + '/__gerar?nome=' + encodeURIComponent('Carlos Eduardo Lima'))).json();
  for (let i = 0; i < 10; i++) { await p8.fill('#aCod', String(100000 + i)); await p8.click('#fAtivar button'); await p8.waitForTimeout(250); }
  await p8.fill('#aCod', g2.codigo); await p8.click('#fAtivar button'); await p8.waitForTimeout(600);
  console.log('após 10 erros, código CERTO ->', await p8.textContent('#toast'));
  // chave errada
  const r = await fetch(amb.API + '/', { method: 'POST', body: JSON.stringify({ action: 'sync', key: 'x' }) }).then(r => r.json());
  console.log('chave errada ->', JSON.stringify(r));
  // offline reload (service worker)
  await page.goto(amb.APP); await page.waitForTimeout(800);
  await ctx.setOffline(true); await page.reload(); await page.waitForSelector('nav');
  console.log('abre offline (SW): ok; sync badge =', await page.textContent('#sync'));
  console.log('erros de console/página:', erros.filter(e => !/Failed to load resource|net::ERR|Failed to fetch/.test(e)));
  await b.close();
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
