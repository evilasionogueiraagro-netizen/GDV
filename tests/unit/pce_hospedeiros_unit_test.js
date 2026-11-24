// PCE: que praga vale em que cultura (CONFIG.PCE.hospedeiros, docs/modulos/pce-hospedeiros.md). Matriz cultura x praga com o catálogo
// que o back entrega (catalogoPce_ do apps-script, abas vazias = base) e as funções do app (PCECads.pragasLigadas / pragasExtras),
// sem fakegas nem navegador. A tela da Nova visita (lista "Outra praga do catálogo", acrescentar, levantamento antigo) fica no
// tests/pce_hospedeiros_test.js.
'use strict';
const L = require('./vm_loader');
const { ok, fim } = L.verificador();

(async () => {
  const G = L.carregar(L.gs('dashboard-publico', 'pce-catalogo'), ['catalogoPce_'], { globais: { lerLeitura_: () => [] } });
  const catalogo = L.copia(G.catalogoPce_());
  const W = L.carregar(['web/js/config.js', 'web/js/pce-cadastros.js'], ['CONFIG', 'PCECads'], { globais: { Store: { meta: async k => (k === 'catalogoPce' ? catalogo : null) } } });
  const C = W.PCECads;
  ok(!!(await C.carregarCatalogo()), 'catálogo do back carregado no app');

  const oferta = cultura => C.pragasExtras(cultura).map(p => C.nomeDaPraga(p));      // "Outra praga do catálogo" do fruto
  const fixas = cultura => C.pragasLigadas(cultura).map(p => C.nomeDaPraga(p));       // pragas que já vêm no fruto

  const banana = oferta('Banana');
  ok(!banana.includes('Bactrocera carambolae') && !banana.includes('Monilíase do Cacaueiro'), 'banana não oferece Mosca-da-carambola nem Monilíase', banana);
  const coco = oferta('Coco');
  ok(coco.includes('Schizotetranychus hindustanicus') && !coco.includes('Moko da Bananeira') && !coco.includes('Cancro Cítrico'), 'coco oferece Ácaro Hindustânico, e só ele entre os de citros', coco);
  const soja = oferta('Soja');
  ok(!soja.includes('Moko da Bananeira') && !soja.includes('Bactrocera carambolae') && !soja.includes('Monilíase do Cacaueiro'), 'soja não oferece Moko, Mosca-da-carambola nem Monilíase', soja);
  const limao = oferta('Limão');
  ok(limao.includes('Bactrocera carambolae') && !limao.includes('Moko da Bananeira'), 'citros (família) oferece Mosca-da-carambola e não oferece Moko', limao);
  ok(!limao.includes('HLB / Greening') && fixas('Limão').includes('HLB / Greening'), 'as pragas ligadas ao fruto já vêm no fruto, não na lista de acrescentar', [limao, fixas('Limão')]);
  const manga = oferta('Manga');
  ok(fixas('Manga').includes('Bactrocera carambolae') && !manga.includes('Moko da Bananeira') && !manga.includes('Schizotetranychus hindustanicus'),
    'manga (cultura da lista da mosca, sem família) traz a mosca e não oferece pragas de outras culturas', [fixas('Manga'), manga]);
  const milho = oferta('Milho');
  ok(milho.includes('Amaranthus palmeri') && !milho.includes('Phakopsora pachyrhizi'), 'milho oferece Amaranthus palmeri (cultura listada) e não a ferrugem da soja', milho);

  // matriz completa: toda praga restrita (CONFIG.PCE.hospedeiros) só aparece (ligada ou oferecida) nas culturas e famílias dela,
  // ou nas ligadas a ela no catálogo; nenhuma cultura recebe a mesma praga duas vezes
  const H = W.CONFIG.PCE.hospedeiros, idCat = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/ /g, '-');
  const fam = Object.fromEntries(catalogo.familias.map(f => [f.id, f]));
  const fora = [], dup = [];
  for (const c of catalogo.culturas.filter(x => x.ativo)) {
    const lig = C.pragasLigadas(c.nome).map(p => p.id), ext = C.pragasExtras(c.nome).map(p => p.id), todas = lig.concat(ext);
    if (new Set(todas).size !== todas.length) dup.push(c.nome);
    for (const [nome, h] of Object.entries(H)) {
      const id = idCat(nome);
      if (!ext.includes(id)) continue;
      const vale = (h.culturas || []).some(n => idCat(n) === c.id) || (!!c.familiaId && (h.familias || []).some(n => idCat(n) === (fam[c.familiaId] || {}).id));
      if (!vale) fora.push(c.nome + ': ' + nome);
    }
  }
  ok(!fora.length, `matriz ${catalogo.culturas.length} culturas x ${Object.keys(H).length} pragas restritas: nenhuma praga oferecida fora das culturas/famílias dela`, fora);
  ok(!dup.length, 'nenhuma cultura recebe a mesma praga como ligada e como extra', dup);
  fim();
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exitCode = 1; });
