const amb = require('./lib/amb');
// PCE — a visita é uma só: levantamento (pragas escolhidas) → cadastrar a propriedade (se nova) → Termo de Fiscalização com as pragas já marcadas.
// Sem cartão específico de monilíase na lista: só atalhos gerais para cadastros, termos e relatório.
const { API, APP } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
(async () => {
  const b = await amb.lancar();
  const g = await (await fetch(API + '/__gerar?nome=' + encodeURIComponent('Ana Paula Lima'))).json();
  const r = await (await fetch(API, { method: 'POST', body: JSON.stringify({ action: 'ativar', codigo: g.codigo }) })).json();
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.12, longitude: -60.02, accuracy: 9 } });
  await c.addInitScript(([t]) => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Ana Paula Lima'); localStorage.setItem('gdv.semInstalar', '1'); } }, [r.token]);
  const p = await c.newPage(); const err = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  const toast = () => p.textContent('#toast');

  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]'); await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
  await p.selectOption('#pce-s-cargo', { index: 1 }); await p.selectOption('#pce-s-lotacao', 'Manaus'); await p.click('#pce-s-salvar'); await p.waitForSelector('#pce-novolev');
  ok(await p.locator('.pce-mon-atalhos').count() === 0 && !/🍫|Monilíase/.test(await p.textContent('#view')), 'lista do PCE sem cartão específico de monilíase');
  ok(await p.locator('.pce-docs-atalhos #pce-cads').count() === 1 && await p.locator('.pce-docs-atalhos #pce-tfs').count() === 1 && await p.locator('.pce-docs-atalhos #pce-rel').count() === 1,
    'atalhos gerais: cadastros de propriedades, termos de fiscalização e relatório');

  // 1) levantamento: propriedade nova, duas pragas
  await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm');
  await p.fill('#pce-doc', '52998224725'); await p.fill('#pce-nome', 'Raimundo Nonato'); await p.fill('#pce-propriedade', 'Sítio Esperança'); await p.fill('#pce-codigo', 'PRP-77');
  await p.selectOption('.pce-praga >> nth=0 >> .p-praga', 'Monilíase do Cacaueiro'); await p.selectOption('.pce-praga >> nth=0 >> .pce-cult >> nth=0 >> .c-cultura', 'Cacau');
  await p.click('.pce-praga >> nth=0 >> .pce-cult >> nth=0 >> .pce-res-nao_detectada');
  await p.click('#pce-addpraga'); await p.selectOption('.pce-praga >> nth=1 >> .p-praga', 'Bactrocera carambolae');
  await p.selectOption('.pce-praga >> nth=1 >> .pce-cult >> nth=0 >> .c-cultura', 'Laranja'); await p.click('.pce-praga >> nth=1 >> .pce-cult >> nth=0 >> .pce-res-nao_detectada');
  await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto');
  ok(await p.locator('.pce-visita #pce-pronto-tf').count() === 1 && await p.locator('.pce-visita #pce-pronto-cad').count() === 1 && /Propriedade nova/.test(await p.textContent(".pce-visita")),
    'depois de salvar: "Próximo passo da visita" com Cadastrar a propriedade e Termo de Fiscalização');
  await p.screenshot({ path: amb.saida('pce_visita_pronto.png'), fullPage: true });

  // 2) cadastrar a propriedade: vem preenchido do levantamento; ao salvar, segue para o Termo
  await p.click('#pce-pronto-cad'); await p.waitForSelector('#monCadForm');
  ok((await p.inputValue('#mc-nome')).toUpperCase() === 'RAIMUNDO NONATO' && /52998224725|529\.982\.247-25/.test(await p.inputValue('#mc-doc')) && await p.inputValue('#mc-propriedade') === 'Sítio Esperança',
    'cadastro já vem com produtor, CPF e propriedade do levantamento', [await p.inputValue('#mc-nome'), await p.inputValue('#mc-doc'), await p.inputValue('#mc-propriedade')]);
  if (!(await p.inputValue('#mc-municipio'))) await p.selectOption('#mc-municipio', 'Manaus');
  await p.click('#mc-salvar');
  for (let i = 0; i < 40 && !(await p.locator('#monTfForm').count()); i++) {           // número do cadastro (popup) e depois o Termo
    if (await p.locator('#mon-m-ok').count()) await p.click('#mon-m-ok');
    await p.waitForTimeout(300);
  }
  ok(await p.locator('#monTfForm').count() === 1, 'depois do cadastro: abre o Termo de Fiscalização da visita', await toast());
  const marcadas = await p.evaluate(() => [...document.querySelectorAll('#monTfForm input[type=checkbox]:checked')].map(i => i.value));
  ok(marcadas.includes('Monilíase') && marcadas.includes('Mosca-da-Carambola'), 'Termo já vem com as pragas do levantamento marcadas', marcadas);
  ok((await p.inputValue('#mt-nome')).toUpperCase() === 'RAIMUNDO NONATO', 'Termo já vem com o produtor (cadastro ligado)', await p.inputValue('#mt-nome'));
  await p.screenshot({ path: amb.saida('pce_visita_termo.png'), fullPage: true });
  await p.click('#mt-salvar');
  for (let i = 0; i < 40 && !(await p.locator('#mon-pronto').count()); i++) { if (await p.locator('#mon-m-ok').count()) await p.click('#mon-m-ok'); await p.waitForTimeout(300); }
  ok(await p.locator('#mon-pronto').count() === 1, 'Termo de Fiscalização salvo', await toast());

  // 3) na lista: o levantamento mostra o Termo feito e não pede mais cadastro
  await p.evaluate(() => go('pce')); await p.waitForSelector('.item.pce-lev');
  const item = await p.textContent('.item.pce-lev');
  ok(/Termo de Fiscalização \d/.test(item) && !/Cadastrar a propriedade/.test(item), 'lista: levantamento com o Termo da visita e sem pedir cadastro de novo', item.replace(/\s+/g, ' ').slice(0, 200));

  // 4) propriedade já cadastrada, novo levantamento em outro dia: só o Termo (sem "Cadastrar")
  const lev2 = await p.evaluate(async () => { const l = (await Store.todos('levantamentos'))[0]; const n = { ...l, id: Store.novoId(), data: '2026-01-05', hora: '09:00', pendente: 1 }; await Store.salvar('levantamentos', n); return n.id; });
  await p.evaluate(id => PCEUI.levPronto(id), lev2); await p.waitForSelector('#pce-lev-pronto');
  ok(await p.locator('#pce-pronto-cad').count() === 0 && /Fazer o Termo/.test(await p.textContent('#pce-pronto-tf')) && /já cadastrada/.test(await p.textContent('.pce-visita')),
    'propriedade já cadastrada: só "Fazer o Termo de Fiscalização da visita"');
  ok(err.length === 0, 'sem erros de JavaScript', err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
