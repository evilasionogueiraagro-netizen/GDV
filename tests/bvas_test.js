const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Cadastro de BVAs (bvas.gs): a gerência cadastra BVAs novas no painel (aba Barreiras → "Cadastro de BVAs") e muda ou desativa as da
// base (CONFIG.bvas) pelo nome. A lista chega aos aparelhos no sync (bvas) e ao painel no painelDados (bvasCadastro); o app a usa no
// "Local / Posto (BVA)" do turno (placa obrigatória e Ficha de Campo), também sem internet (meta "bvas"). Dados fictícios.
const { API, APP } = amb;
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };
const linhas = async aba => { const d = await (await fetch(API + '/__tudo')).json(); const l = d[aba] || []; return l.slice(1).map(r => Object.fromEntries(l[0].map((k, i) => [k, r[i]]))); };

(async () => {
  console.log('1) servidor: cadastrar, validar, desativar uma da base');
  const g = await amb.gerente('Gerente Bvas Teste'), leitor = await amb.usuario('Leitor Bvas Teste', { aplicativo: 'painel', permissoes: ['painel'] });
  let r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { nome: 'humaitá', municipio: 'Humaitá', endereco: 'BR-319, km 0 (fictício)', placa: true, ficha: false, ativo: true } });
  ok(r.ok && r.bva.nome === 'BVA - HUMAITÁ' && r.bva.placa === 1, 'nova BVA no padrão "BVA - NOME"', r);
  r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { nome: 'BVA - Humaitá', municipio: 'Humaitá' } });
  ok(!r.ok && /Já existe a BVA - HUMAITÁ/.test(r.erro), 'nome repetido: recusa', r.erro);
  r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { nome: 'BVA - PARINTINS', municipio: '' } });
  ok(!r.ok && /município/.test(r.erro), 'sem município: recusa', r.erro);
  r = await post({ action: 'painelBvaSalvar', key: leitor.token, bva: { nome: 'BVA - TESTE', municipio: 'Manaus' } });
  ok(!r.ok && /Só a gerência/.test(r.erro), 'painel só leitura: recusa', r.erro);
  r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { nome: 'BVA - AEROPORTO', municipio: 'Manaus', ativo: false } });
  ok(r.ok && r.bva.ativo === 0, 'desativar uma BVA da base (pelo nome)', r);
  const hum = (await linhas('BVAs')).find(x => x.nome === 'BVA - HUMAITÁ');
  r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { id: hum.id, nome: 'OUTRO NOME', municipio: 'Humaitá', endereco: 'BR-319, km 1 (fictício)', placa: true, ficha: true, ativo: true } });
  ok(r.ok && r.bva.nome === 'BVA - HUMAITÁ' && r.bva.ficha === 1, 'editar: o nome não muda (os turnos guardam o nome)', r.bva);
  ok((await linhas('HistoricoDeAlteracoes')).filter(h => h.tabela === 'BVAs').length === 3, 'histórico: cadastrar e alterar');
  const f = await U.fiscal('Fiscal Bvas Teste');
  const s = await post({ action: 'sync', key: f.token, since: 0 });
  ok(s.ok && s.bvas.some(b => b.nome === 'BVA - HUMAITÁ' && b.ativo === 1) && s.bvas.some(b => b.nome === 'BVA - AEROPORTO' && b.ativo === 0), 'sync leva o cadastro aos aparelhos', s.bvas);

  console.log('2) app: a BVA nova no "Local / Posto (BVA)" (e a desativada some), também sem internet');
  const b = await amb.lancar(), err = [];
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -7.5, longitude: -63.0 } });
  await c.addInitScript(([t]) => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Fiscal Bvas Teste'); localStorage.setItem('gdv.semInstalar', '1'); } }, [f.token]);
  const p = await c.newPage(); p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(APP); await p.waitForSelector('.modulo[data-v=home]', { timeout: 20000 });
  await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(1000);
  await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno #nLocal', { timeout: 15000 });
  const ops = await p.$$eval('#nLocal option', o => o.map(x => x.textContent));
  ok(ops.join('|') === 'BVA - CEASA|BVA - JUNDIÁ|BVA - HUMAITÁ', 'lista: as da base (sem a desativada) + a cadastrada', ops);
  await p.selectOption('#nLocal', 'BVA - HUMAITÁ');
  ok(/obrigatória/.test(await p.textContent('#nPlacaInfo')) && (await p.inputValue('#nUnidade')) === 'BVA - HUMAITÁ', 'BVA nova: placa obrigatória e unidade = a BVA');
  await p.screenshot({ path: amb.saida('bvas_app.png') });
  await c.setOffline(true); await p.reload(); await p.waitForSelector('.modulo[data-v=home]', { timeout: 20000 });
  await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno #nLocal', { timeout: 15000 });
  ok((await p.$$eval('#nLocal option', o => o.map(x => x.textContent))).includes('BVA - HUMAITÁ'), 'sem internet: a lista guardada no aparelho');
  await c.setOffline(false);

  console.log('3) painel: aba Barreiras → "Cadastro de BVAs"');
  const cg = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block' });
  await cg.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.painel.token', i.t); localStorage.setItem('gdv.painel.nome', i.n); } }, { t: g.token, n: g.nome });
  const G = await cg.newPage(); G.on('pageerror', x => err.push('painel: ' + x.message));
  await G.goto(amb.PAINEL); await G.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 30000 });
  await G.click('.pn-aba[data-aba=barreiras]'); await G.waitForSelector('#pn-bva-abrir'); await G.click('#pn-bva-abrir'); await G.waitForSelector('#pn-bva-dlg[open] #pn-bva-tab');
  const tab = (await G.innerText('#pn-bva-tab')).replace(/\s+/g, ' ');
  ok(/BVA - HUMAITÁ Humaitá obrigatória sim Período ajustável ativa/.test(tab) && /BVA - AEROPORTO .*desativada/.test(tab), 'painel: lista com as da base e as cadastradas', tab);
  ok(/BVA - JUNDIÁ .*10 dias/.test(tab) && /BVA - CEASA .*8 dias/.test(tab) && /Plantão de 12 h × 36 h/.test(tab), 'painel: regime da escala de cada BVA', tab);
  await G.click('#pn-bva-nova'); await G.fill('#pn-bva-nome', 'Parintins'); await G.fill('#pn-bva-mun', 'Parintins');
  await G.selectOption('#pn-bva-reg', 'dias'); await G.fill('#pn-bva-dias', '5'); await G.click('#pn-bva-salvar');
  await G.waitForFunction(() => /BVA - PARINTINS/.test(document.querySelector('#pn-bva-tab').textContent), null, { timeout: 15000 });
  await G.screenshot({ path: amb.saida('bvas_painel.png') });
  ok((await linhas('BVAs')).some(x => x.nome === 'BVA - PARINTINS' && x.atualizadoPor === 'Gerente Bvas Teste' && x.escalaRegime === 'dias' && Number(x.escalaDias) === 5), 'painel: nova BVA gravada (quem; escala de 5 dias)');
  ok(await G.evaluate(() => CONFIG.fimEscala('BVA - PARINTINS', '2026-12-01')) === '2026-12-05', 'a escala da BVA nova sugere o fim pelos 5 dias');
  r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { nome: 'BVA - TABATINGA', municipio: 'Tabatinga', escalaRegime: 'dias', escalaDias: 0 } });
  ok(!r.ok && /de 1 a/.test(r.erro), 'regime "dias" sem os dias: recusa', r.erro);
  r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { nome: 'BVA - TABATINGA', municipio: 'Tabatinga', escalaRegime: 'ajustavel' } });
  ok(r.ok && r.bva.escalaRegime === 'ajustavel', 'Tabatinga: período ajustável', r);
  ok(await G.evaluate(() => CONFIG.bvas.some(b => b.nome === 'BVA - PARINTINS')), 'painel: a lista em uso já tem a nova');
  await cg.close();
  ok(!err.length, 'sem erros de página', err);
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
