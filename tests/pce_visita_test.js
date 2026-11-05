const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const F = require('./lib/pce-form');
// PCE — a visita é uma só: levantamento (uma cultura por card; as pragas dela vêm do catálogo) → cadastrar a propriedade (se nova) → um Termo de
// Fiscalização por programa, com as culturas avaliadas nele. A tela inicial é por fluxo; cadastros, termos e relatório ficam no submenu da gestão.
const { API, APP } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
(async () => {
  const b = await amb.lancar();
  const r = await U.fiscal('Ana Paula Lima');
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.12, longitude: -60.02, accuracy: 9 } });
  await c.addInitScript(([t]) => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Ana Paula Lima'); localStorage.setItem('gdv.semInstalar', '1'); } }, [r.token]);
  const p = await c.newPage(); const err = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  const toast = () => p.textContent('#toast');

  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]'); await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
  await p.selectOption('#pce-s-cargo', { index: 1 }); await p.selectOption('#pce-s-lotacao', 'Manaus'); await p.click('#pce-s-salvar'); await p.waitForSelector('#pce-novolev');
  ok(await p.locator('.pce-mon-atalhos').count() === 0 && !/🍫|Monilíase/.test(await p.textContent('#view')), 'lista do PCE sem cartão específico de monilíase');
  const fluxos = await p.locator('.pce-fluxo-titulo').allTextContents();
  ok(fluxos.join('|') === 'Propriedades e Gestão|Levantamentos|Dados Offline', 'tela inicial por fluxo: Propriedades e Gestão, Levantamentos e Dados Offline', fluxos);
  ok(await p.locator('#pce-cads').count() === 1 && await p.locator('#pce-novolev').count() === 1 && await p.locator('#pce-campo').count() === 1, 'atalhos da tela inicial: gerenciar propriedades, criar levantamento e dados offline');
  await p.click('#pce-cads'); await p.waitForSelector('.pce-subnav');
  ok(await p.locator('.pce-subnav #pce-tfs').count() === 1 && await p.locator('.pce-subnav #pce-rel').count() === 1 && await p.locator('.pce-subnav #pce-subnav-campo').count() === 1 && (await p.locator('.pce-subnav .pce-subnav-btn').count()) >= 4,
    'submenu da gestão: propriedades, termos de fiscalização, relatório e dados offline');
  await p.evaluate(() => go('pce')); await p.waitForSelector('#pce-novolev');

  // 1) levantamento: propriedade nova, duas culturas (cada uma com as pragas do catálogo, que pedem resultado)
  await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm');
  await p.fill('#pce-doc', '52998224725'); await p.fill('#pce-nome', 'Raimundo Nonato'); await p.fill('#pce-propriedade', 'Sítio Esperança'); await p.fill('#pce-codigo', 'PRP-77');
  await p.fill('#pce-telefone', '92 90000-0000'); await p.fill('#pce-empresa', 'Sitio Ficticio Teste'); await p.fill('#pce-endereco', 'Ramal Ficticio, km 3');
  if (!(await p.inputValue('#pce-municipio'))) await p.selectOption('#pce-municipio', 'Manaus');
  await F.cultura(p, 0, 'Cacau');
  ok(await p.locator('.pce-cultura >> nth=0 >> .pce-pr[data-nome="Monilíase do Cacaueiro"]').count() === 1, 'ao escolher Cacau, a Monilíase do catálogo aparece sozinha');
  await p.click('#pce-salvar'); await p.waitForTimeout(250);
  ok(/Informe o resultado de Monilíase do Cacaueiro em Cacau/.test(await toast()) && await p.locator('#pceLevForm').count() === 1, 'a praga do catálogo sem resultado não deixa salvar', await toast());
  await F.responder(p, 0, 'Monilíase do Cacaueiro', 'nao_detectada');
  await F.preencherCultura(p, 1, 'Carambola');
  ok(await p.locator('.pce-cultura >> nth=1 >> .pce-pr[data-nome="Bactrocera carambolae"]').count() === 1, 'ao escolher Carambola, a Mosca-da-carambola do catálogo aparece sozinha');
  await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto');
  ok(await p.locator('#pce-pronto-res tbody').count() === 2 && await p.locator('#pce-pronto-res .pce-res-cultura').count() === 2 && await p.locator('#pce-pronto-res td .pce-selo-res').count() === 2,
    'resumo em tabela: um bloco por cultura, com uma linha por praga e o resultado');
  ok(await p.locator('.pce-visita #pce-pronto-cad').count() === 1 && await p.locator('.pce-visita [data-pce=tfvisita]').count() === 2 && /Propriedade nova/.test(await p.textContent(".pce-visita")),
    'depois de salvar: "Próximo passo da visita" com Cadastrar a propriedade e um Termo de Fiscalização por programa (2)');
  await p.screenshot({ path: amb.saida('pce_visita_pronto.png'), fullPage: true });

  // 2) cadastrar a propriedade: vem preenchido do levantamento; ao salvar, segue para o Termo
  await p.click('#pce-pronto-cad'); await p.waitForSelector('#monCadForm');
  ok((await p.inputValue('#mc-nome')).toUpperCase() === 'RAIMUNDO NONATO' && /52998224725|529\.982\.247-25/.test(await p.inputValue('#mc-doc')) && await p.inputValue('#mc-propriedade') === 'Sítio Esperança',
    'cadastro já vem com produtor, CPF e propriedade do levantamento', [await p.inputValue('#mc-nome'), await p.inputValue('#mc-doc'), await p.inputValue('#mc-propriedade')]);
  if (!(await p.inputValue('#mc-municipio'))) await p.selectOption('#mc-municipio', 'Manaus');
  await p.click('#mc-salvar');
  for (let i = 0; i < 40 && !(await p.locator('#pce-lev-pronto').count()); i++) {           // número do cadastro (popup) e depois a tela do levantamento
    if (await p.locator('#mon-m-ok').count()) await p.click('#mon-m-ok');
    await p.waitForTimeout(300);
  }
  ok(await p.locator('#pce-lev-pronto').count() === 1 && await p.locator('#pce-pronto-cad').count() === 0, 'depois do cadastro: volta ao levantamento, que já não pede o cadastro', await toast());
  const botoesTf = await p.locator('.pce-visita [data-pce=tfvisita]').allTextContents();
  ok(botoesTf.length === 2 && botoesTf.some(t => /Monilíase do Cacaueiro e Cupuaçuzeiro \(Cacau\)/.test(t)) && botoesTf.some(t => /Mosca-da-Carambola \(Carambola\)/.test(t)),
    'um Termo por programa da visita, com as culturas avaliadas nele', botoesTf.map(t => t.trim()));
  await p.click('.pce-visita [data-pce=tfvisita][data-programa="moniliase-do-cacaueiro-e-cupuacuzeiro"]'); await p.waitForSelector('#monTfForm');
  ok(/Cacau/.test(await p.textContent('#mt-programa')) && /Monilíase/.test(await p.textContent('#mt-programa')), 'Termo da Monilíase mostra o programa e a cultura avaliada', await p.textContent('#mt-programa'));
  const marcadas = await p.evaluate(() => [...document.querySelectorAll('#monTfForm input[type=checkbox]:checked')].map(i => i.value));
  ok(marcadas.includes('Monilíase') && !marcadas.includes('Mosca-da-Carambola'), 'Termo já vem só com as pragas do programa marcadas (Monilíase, sem a Mosca-da-Carambola)', marcadas);
  ok((await p.inputValue('#mt-nome')).toUpperCase() === 'RAIMUNDO NONATO', 'Termo já vem com o produtor (cadastro ligado)', await p.inputValue('#mt-nome'));
  const ident = await p.evaluate(() => Object.fromEntries(['doc', 'atividade', 'empresa', 'atividadeEmpresa', 'endereco', 'municipio', 'uf', 'telefone'].map(k => [k, document.querySelector('#mt-' + k).value])));
  ok(/529\.982\.247-25/.test(ident.doc) && ident.atividade === 'Cultivo de cacau' && ident.empresa === 'Sitio Ficticio Teste' && ident.atividadeEmpresa === 'Cultivo de cacau'
    && ident.endereco === 'Ramal Ficticio, km 3' && ident.municipio === 'Manaus' && ident.uf === 'AM' && ident.telefone === '92 90000-0000',
    'Termo já vem com a identificação do levantamento: CPF, atividade (culturas do programa), empresa, endereço, município, UF e telefone', ident);
  await p.screenshot({ path: amb.saida('pce_visita_termo.png'), fullPage: true });
  await p.click('#mt-salvar');
  for (let i = 0; i < 40 && !(await p.locator('#mon-pronto').count()); i++) { if (await p.locator('#mon-m-ok').count()) await p.click('#mon-m-ok'); await p.waitForTimeout(300); }
  ok(await p.locator('#mon-pronto').count() === 1, 'Termo de Fiscalização salvo', await toast());
  const tfp = await p.evaluate(async () => (await Store.todos('termosPce'))[0] || {});
  ok(tfp.atividade === 'Cultivo de cacau' && tfp.empresa === 'Sitio Ficticio Teste' && tfp.endereco === 'Ramal Ficticio, km 3' && tfp.uf === 'AM' && tfp.telefone === '92 90000-0000',
    'Termo salvo com a identificação completa (vai para o PDF)', tfp);
  ok(!!tfp.programaVisita && /Cacau/.test(String(tfp.culturas)), 'Termo salvo ligado ao programa da visita e às culturas dele', [tfp.programaVisita, tfp.culturas]);

  // 3) na lista: o levantamento mostra o Termo feito (Monilíase), o que falta (Mosca-da-Carambola) e não pede mais cadastro
  await p.evaluate(() => go('pce')); await p.waitForSelector('.item.pce-lev');
  const item = await p.textContent('.item.pce-lev');
  ok(await p.locator('.item.pce-lev [data-pce=abrirtfvisita]').count() === 1 && /Termo \d.*Monilíase/.test(item) && await p.locator('.item.pce-lev [data-pce=tfvisita]').count() === 1
    && !/Cadastrar a propriedade/.test(item) && await p.locator('.item.pce-lev [data-pce=cadvisita]').count() === 0, 'lista: Termo da Monilíase feito, o da Mosca-da-Carambola por fazer, e sem pedir cadastro de novo', item.replace(/\s+/g, ' ').slice(0, 260));

  // 4) propriedade já cadastrada, novo levantamento em outro dia: só os Termos (sem "Cadastrar")
  const lev2 = await p.evaluate(async () => { const l = (await Store.todos('levantamentos'))[0]; const n = { ...l, id: Store.novoId(), data: '2026-01-05', hora: '09:00', pendente: 1 }; await Store.salvar('levantamentos', n); return n.id; });
  await p.evaluate(id => PCEUI.levPronto(id), lev2); await p.waitForSelector('#pce-lev-pronto');
  ok(await p.locator('#pce-pronto-cad').count() === 0 && await p.locator('.pce-visita [data-pce=tfvisita]').count() === 2 && /Fazer o Termo|Termo de Fiscalização/.test(await p.textContent('.pce-visita')) && /já cadastrada/.test(await p.textContent('.pce-visita')),
    'propriedade já cadastrada: só os Termos de Fiscalização da visita, um por programa (sem "Cadastrar")');
  ok(err.length === 0, 'sem erros de JavaScript', err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
