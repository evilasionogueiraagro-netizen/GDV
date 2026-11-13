const amb = require('./lib/amb');
const A = require('./lib/pce-app');
// PCE — que praga vale em que cultura (CONFIG.PCE.hospedeiros, docs/modulos/pce-hospedeiros.md): na Nova visita (passo 2) a lista de
// "Outra praga do catálogo" de cada fruto só traz as pragas dele; levantamento antigo com praga fora da regra continua abrindo, sem perder a praga.
// Dados fictícios.
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };

(async () => {
  const b = await amb.lancar();
  const p = await A.aparelho(b, 'Fiscal Hospedeiros Teste');
  await A.identificar(p);
  await A.novoProdutor(p, { doc: '52998224725', nome: 'Produtor Ficticio Hospedeiros', propriedade: 'Sitio Ficticio Hospedeiros', codigo: 'PRP-HOSP-1', municipio: 'Manaus',
    frutos: ['Banana', 'Coco', 'Soja', 'Limão', 'Manga', 'Milho'].map(cultura => ({ cultura, area: 1 })) });
  await p.locator('#pce-novavisita').click(); await p.waitForSelector('#pceVisitaForm');
  for (const c of ['Banana', 'Coco', 'Soja', 'Limão', 'Manga', 'Milho']) await p.locator('label.vi-fruto', { hasText: c }).locator('input').check();
  await p.click('#vi-continuar'); await p.waitForSelector('.pce-pr');

  // nomes (como no papel) das pragas oferecidas em "Outra praga do catálogo" do fruto
  const oferta = cultura => A.bloco(p, cultura).locator('.vi-extra option').evaluateAll(os => os.map(o => o.textContent).filter(t => t !== 'Selecione')
    .map(t => { const x = PCECads.pragaPorNome(t); return x ? PCECads.nomeDaPraga(x) : t; }));
  const fixas = cultura => A.bloco(p, cultura).locator('.pce-pr').evaluateAll(l => l.map(e => e.dataset.nome));

  console.log('1) lista de "Outra praga do catálogo" por fruto');
  const banana = await oferta('Banana');
  ok(!banana.includes('Bactrocera carambolae') && !banana.includes('Monilíase do Cacaueiro'), 'banana não oferece Mosca-da-carambola nem Monilíase', banana);
  const coco = await oferta('Coco');
  ok(coco.includes('Schizotetranychus hindustanicus') && !coco.includes('Moko da Bananeira') && !coco.includes('Cancro Cítrico'), 'coco oferece Ácaro Hindustânico, e só ele entre os de citros', coco);
  const soja = await oferta('Soja');
  ok(!soja.includes('Moko da Bananeira') && !soja.includes('Bactrocera carambolae') && !soja.includes('Monilíase do Cacaueiro'), 'soja não oferece Moko, Mosca-da-carambola nem Monilíase', soja);
  const limao = await oferta('Limão');
  ok(limao.includes('Bactrocera carambolae') && !limao.includes('Moko da Bananeira'), 'citros (família) oferece Mosca-da-carambola e não oferece Moko', limao);
  ok(!limao.includes('HLB / Greening') && (await fixas('Limão')).includes('HLB / Greening'), 'as pragas ligadas ao fruto já vêm no fruto, não na lista de acrescentar', [limao, await fixas('Limão')]);
  const manga = await oferta('Manga');
  ok((await fixas('Manga')).includes('Bactrocera carambolae') && !manga.includes('Moko da Bananeira') && !manga.includes('Schizotetranychus hindustanicus'), 'manga (cultura da lista da mosca, sem família) traz a mosca e não oferece pragas de outras culturas', [await fixas('Manga'), manga]);
  const milho = await oferta('Milho');
  ok(milho.includes('Amaranthus palmeri') && !milho.includes('Phakopsora pachyrhizi'), 'milho oferece Amaranthus palmeri (cultura listada) e não a ferrugem da soja', milho);
  await A.bloco(p, 'Milho').locator('.vi-extra').selectOption({ label: (await A.bloco(p, 'Milho').locator('.vi-extra option').allTextContents()).find(t => /amaranthus|caruru|palmeri/i.test(t)) });
  await A.bloco(p, 'Milho').locator('[data-mon=addpraga]').click();
  ok((await fixas('Milho')).includes('Amaranthus palmeri') && !(await oferta('Milho')).includes('Amaranthus palmeri'), 'a praga acrescentada vira praga do fruto e sai da lista de acrescentar', await fixas('Milho'));

  console.log('2) levantamento antigo fora da regra continua abrindo, sem perder a praga');
  const id = await p.evaluate(async () => {   // dado antigo: soja com uma praga que a regra não oferece nela
    const id = Store.novoId(), cult = resultado => ({ cultura: 'Soja', area: '', espLinha: '', espPlanta: '', espUnidade: 'm', resultado, coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '', fotos: [] });
    await Store.salvar('levantamentos', { id, data: '2026-08-10', hora: '09:00', doc: '52998224725', nome: 'PRODUTOR FICTICIO HOSPEDEIROS', propriedade: 'Sitio Ficticio Hospedeiros', municipio: 'Manaus', uf: 'AM', excluido: 0,
      servidor: 'Fiscal Hospedeiros Teste', cargo: 'Fiscal', matricula: '1', lotacao: 'Manaus', fotos: '[]', assinaturas: '{}', culturas: '[]', citros: '', criadoEm: 1, atualizadoEm: 1,
      pragas: JSON.stringify([{ praga: 'Phakopsora pachyrhizi', culturas: [cult('nao_detectada')] }, { praga: 'Moko da Bananeira', culturas: [cult('detectada')] }]) });
    return id; });
  await p.evaluate(i => go('pcelevver', i), id); await p.waitForSelector('#pce-lev-ver');
  const tab = await p.textContent('#pce-lev-res');
  ok(/Soja/.test(tab) && /Moko da Bananeira/.test(tab) && /Detectada/.test(tab) && /Phakopsora pachyrhizi/.test(tab), 'registro aberto só para leitura: a praga fora da regra continua na tabela, com o resultado', tab.replace(/\s+/g, ' '));
  ok(await p.locator('.pce-pdf').count() >= 1 && await p.locator('#pceVisitaForm, #pceLevForm').count() === 0, 'levantamento antigo: botões de PDF e nenhum formulário de edição');
  ok(p.err.length === 0, 'sem erros de JavaScript', p.err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
