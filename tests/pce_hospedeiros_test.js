const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const PF = require('./lib/pce-form');
// PCE — que praga vale em que cultura (CONFIG.PCE.hospedeiros, docs/modulos/pce-hospedeiros.md): a lista de "+ Outra praga/doença" de cada
// cultura só traz as pragas dela; praga fora da regra não some de registro antigo. Dados fictícios.
const { APP } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };

(async () => {
  const b = await amb.lancar();
  const f = await U.fiscal('Fiscal Hospedeiros Teste');
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.12, longitude: -60.02, accuracy: 9 } });
  await c.addInitScript(i => { if (!localStorage.getItem('gdv.key')) Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); localStorage.setItem('gdv.url', window.__GDV_API); }, f.ls);
  const p = await c.newPage(); const err = [];
  p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]');
  await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(1200);
  await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
  await p.selectOption('#pce-s-cargo', { index: 1 }); await p.selectOption('#pce-s-lotacao', 'Manaus'); await p.click('#pce-s-salvar'); await p.waitForSelector('#pce-novolev');
  await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm');

  // nomes das pragas oferecidas em "+ Outra praga/doença" da cultura i (o bloco novo é o último do card)
  const oferta = async (i, cultura) => {
    await PF.cultura(p, i, cultura);
    const antes = await p.locator(`${PF.cult(i)} >> .pce-pr`).count();
    await p.click(`${PF.cult(i)} >> .pce-addpraga`);
    const sel = p.locator(`${PF.cult(i)} >> .pce-pr`).nth(antes).locator('.r-praga');
    const o = await sel.locator('option').allTextContents();
    await p.click(`${PF.cult(i)} >> .pce-pr >> nth=${antes} >> [data-pce=delpraga]`);
    return o;
  };
  console.log('1) lista de "+ Outra praga/doença" por cultura');
  const banana = await oferta(0, 'Banana');
  ok(!banana.includes('Bactrocera carambolae') && banana.some(t => /Outra/.test(t)), 'banana não oferece Mosca-da-carambola (e "Outra" continua)', banana);
  const coco = await oferta(0, 'Coco');
  ok(coco.includes('Schizotetranychus hindustanicus') && !coco.includes('Moko da Bananeira') && !coco.includes('Cancro Cítrico'), 'coco oferece Ácaro Hindustânico, e só ele entre os de citros', coco);
  const soja = await oferta(0, 'Soja');
  ok(!soja.includes('Moko da Bananeira') && !soja.includes('Bactrocera carambolae') && !soja.includes('Monilíase do Cacaueiro'), 'soja não oferece Moko, Mosca-da-carambola nem Monilíase', soja);
  const limao = await oferta(0, 'Limão');
  ok(limao.includes('Bactrocera carambolae') && !limao.includes('Moko da Bananeira'), 'citros (família) oferece Mosca-da-carambola e não oferece Moko', limao);
  const manga = await oferta(0, 'Manga');
  ok(manga.length > 1 && !manga.includes('Moko da Bananeira') && !manga.includes('Schizotetranychus hindustanicus'), 'manga (cultura da lista da mosca, sem família) não oferece pragas de outras culturas', manga);
  const milho = await oferta(0, 'Milho');
  ok(milho.includes('Amaranthus palmeri') && !milho.includes('Phakopsora pachyrhizi'), 'milho oferece Amaranthus palmeri (cultura listada) e não a ferrugem da soja', milho);

  console.log('2) registro antigo fora da regra continua abrindo, sem perder a praga');
  await PF.preencherCultura(p, 0, 'Soja');
  await p.fill('#pce-doc', '52998224725'); await p.fill('#pce-nome', 'Produtor Ficticio Hospedeiros'); await p.fill('#pce-propriedade', 'Sitio Ficticio Hospedeiros');
  if (!(await p.inputValue('#pce-municipio'))) await p.selectOption('#pce-municipio', 'Manaus');
  await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto', { timeout: 8000 });
  const id = await p.evaluate(async () => {   // o registro ganha uma praga que a regra não oferece na soja (como um dado antigo)
    const l = (await Store.todos('levantamentos'))[0], pr = JSON.parse(l.pragas);
    pr.push({ praga: 'Moko da Bananeira', culturas: [{ cultura: 'Soja', area: '', espLinha: '', espPlanta: '', espUnidade: 'm', resultado: 'nao_detectada', coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '', fotos: [] }] });
    await Store.salvar('levantamentos', { ...l, pragas: JSON.stringify(pr) }); return l.id; });
  await p.evaluate(i => go('pcelev', i), id); await p.waitForSelector('#pceLevForm');
  const sel = await p.evaluate(() => [...document.querySelectorAll('.pce-cultura:first-of-type .pce-pr .r-praga')].map(s => ({ valor: s.value, texto: s.selectedOptions[0] && s.selectedOptions[0].textContent })));
  ok(sel.some(s => s.valor === 'moko-da-bananeira' && s.texto === 'Moko da Bananeira'), 'a praga fora da regra continua selecionada no registro aberto', sel);
  await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto', { timeout: 8000 });
  const salvo = await p.evaluate(async i => JSON.parse((await Store.obter('levantamentos', i)).pragas).map(g => g.praga), id);
  ok(salvo.includes('Moko da Bananeira'), 'salvar de novo mantém a praga', salvo);
  ok(err.length === 0, 'sem erros de JavaScript', err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
