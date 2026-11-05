const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Catálogo do PCE (pce-catalogo.gs): famílias, culturas e pragas (a praga é o programa). Sem edição vale a base do código; a primeira
// gravação copia a base para as abas. Lê quem tem o módulo PCE; grava gerência + PCE. Ligações praga × família e praga × cultura (desfeita =
// ativo 0). O catálogo chega ao app no sync (só com o módulo PCE). Dados fictícios.
const { API } = amb;
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };
const linhas = async aba => { const d = await (await fetch(API + '/__tudo')).json(); const l = d[aba] || []; return l.slice(1).map(r => Object.fromEntries(l[0].map((k, i) => [k, r[i]]))); };
const pragasDe = (cat, culturaId) => {
  const c = cat.culturas.find(x => x.id === culturaId), ativas = new Set(cat.pragas.filter(p => p.ativo).map(p => p.id)), ids = [];
  cat.pragasDasFamilias.forEach(l => { if (c.familiaId && l.familiaId === c.familiaId && ativas.has(l.pragaId) && !ids.includes(l.pragaId)) ids.push(l.pragaId); });
  cat.pragasDasCulturas.forEach(l => { if (l.culturaId === culturaId && ativas.has(l.pragaId) && !ids.includes(l.pragaId)) ids.push(l.pragaId); });
  return ids.sort();
};

(async () => {
  const g = await amb.usuario('Gerente Catalogo Teste', { aplicativo: 'painel', permissoes: ['gerencia', 'pce'] });
  const gSemPce = await amb.usuario('Gerente Sem Pce Teste', { aplicativo: 'painel', permissoes: ['gerencia'] });
  const leitor = await amb.usuario('Leitor Pce Teste', { aplicativo: 'painel', permissoes: ['painel', 'pce'] });

  console.log('1) base: vale enquanto ninguém editou; nada gravado');
  let r = await post({ action: 'painelPceCatalogo', key: leitor.token });
  const base = r.catalogo;
  ok(r.ok && !r.podeEditar && base.culturas.length >= 30 && base.pragas.length === 14, 'leitor com PCE vê o catálogo base (sem editar)', r.ok ? [base.culturas.length, base.pragas.length] : r);
  ok(pragasDe(base, 'limao').join() === 'cancro-citrico,diaphorina-citri-vetor-do-hlb,hlb-greening,leprose-dos-citros,pinta-preta-dos-citros,schizotetranychus-hindustanicus',
    'Limão herda as pragas da família Citros', pragasDe(base, 'limao'));
  ok(base.familias.find(f => f.id === 'cacau-e-cupuacu').modeloCadastro === 'moniliase' && base.culturas.find(c => c.id === 'cupuacu').familiaId === 'cacau-e-cupuacu',
    'família define o modelo de cadastro (Cacau e cupuaçu → monilíase)');
  ok(base.pragas.find(p => p.id === 'hlb-greening').nomeNoTF === 'HLB' && /1\.326/.test(base.pragas.find(p => p.id === 'hlb-greening').enquadramentoLegal),
    'praga traz o nome no quadro do TF e o enquadramento legal');
  ok(!(await linhas('Pragas')).length, 'ler não grava nada na planilha');
  r = await post({ action: 'painelPceCatalogo', key: gSemPce.token });
  ok(!r.ok && /módulo PCE/.test(r.erro), 'sem o módulo PCE: não lê (nem a gerência)', r.erro);

  console.log('2) gravar: só gerência + PCE; a primeira gravação copia a base');
  r = await post({ action: 'painelPceCatalogoSalvar', key: leitor.token, tipo: 'cultura', item: { nome: 'Pitaia' } });
  ok(!r.ok && /Só a gerência/.test(r.erro), 'painel só leitura: recusa', r.erro);
  r = await post({ action: 'painelPceCatalogoSalvar', key: gSemPce.token, tipo: 'cultura', item: { nome: 'Pitaia' } });
  ok(!r.ok && /módulo PCE/.test(r.erro), 'gerência sem PCE: recusa', r.erro);
  r = await post({ action: 'painelPceCatalogoSalvar', key: g.token, tipo: 'cultura', item: { nome: '  Pitaia ', nomeCientifico: 'Hylocereus undatus' } });
  ok(r.ok && r.item.id === 'pitaia' && r.catalogo.culturas.some(c => c.id === 'pitaia'), 'nova cultura com id estável a partir do nome', r);
  ok((await linhas('Pragas')).length === 14 && (await linhas('Culturas')).length === base.culturas.length + 1, 'a base foi copiada para as abas na primeira gravação');
  r = await post({ action: 'painelPceCatalogoSalvar', key: g.token, tipo: 'cultura', item: { nome: 'pitaia' } });
  ok(!r.ok && /Já existe/.test(r.erro), 'nome repetido (sem diferença de maiúscula/acento): recusa', r.erro);
  r = await post({ action: 'painelPceCatalogoSalvar', key: g.token, tipo: 'praga', item: { nomePopular: 'X' } });
  ok(!r.ok && /nome/.test(r.erro), 'sem nome: recusa', r.erro);

  console.log('3) ligações: praga × família e praga × cultura');
  r = await post({ action: 'painelPceCatalogoSalvar', key: g.token, tipo: 'praga', item: { id: 'bactrocera-carambolae', nomePopular: 'Mosca-da-carambola',
    nomeCientifico: 'Bactrocera carambolae', tipo: 'praga', nomeNoTF: 'Mosca-da-Carambola', familias: [], culturas: ['pitaia'] } });
  ok(r.ok && pragasDe(r.catalogo, 'pitaia').join() === 'bactrocera-carambolae', 'mosca-da-carambola ligada só à pitaia', r.ok ? pragasDe(r.catalogo, 'pitaia') : r);
  r = await post({ action: 'painelPceCatalogoSalvar', key: g.token, tipo: 'praga', item: { id: 'pinta-preta-dos-citros', nomePopular: 'Pinta Preta dos Citros',
    nomeCientifico: 'Phyllosticta citricarpa', tipo: 'doenca', familias: [], culturas: ['laranja'] } });
  ok(r.ok && !pragasDe(r.catalogo, 'limao').includes('pinta-preta-dos-citros') && pragasDe(r.catalogo, 'laranja').includes('pinta-preta-dos-citros'),
    'pinta preta sai da família Citros e fica só na laranja');
  const lf = (await linhas('PragasDasFamilias')).find(l => l.id === 'pinta-preta-dos-citros|citros');
  ok(lf && Number(lf.ativo) === 0, 'ligação desfeita fica na planilha com ativo 0 (nada se apaga)', lf);
  r = await post({ action: 'painelPceCatalogoSalvar', key: g.token, tipo: 'cultura', item: { id: 'pitaia', nome: 'Pitaia', pragas: [] } });
  ok(r.ok && !pragasDe(r.catalogo, 'pitaia').length, 'cultura: a lista de pragas ligadas só a ela substitui a anterior');
  r = await post({ action: 'painelPceCatalogoSalvar', key: g.token, tipo: 'praga', item: { id: 'leprose-dos-citros', nomePopular: 'Leprose dos Citros', ativo: false, familias: ['citros'] } });
  ok(r.ok && !pragasDe(r.catalogo, 'limao').includes('leprose-dos-citros'), 'praga desativada sai da lista da cultura');
  const h = (await linhas('HistoricoDeAlteracoes')).filter(x => /catálogo do PCE/.test(x.acao));
  ok(h.length >= 5 && h.every(x => x.usuarioId), 'toda alteração fica no histórico, com quem fez', h.length);

  console.log('4) app: catálogo no sync só com o módulo PCE');
  const f = await U.fiscal('Fiscal Catalogo Teste'), t = await U.fiscal('Fiscal Sem Pce Teste', { permissoes: ['campo', 'fiscalizacaoDeTransito'] });
  r = await post({ action: 'sync', key: f.token, since: 0 });
  ok(r.ok && r.catalogoPce && r.catalogoPce.culturas.some(c => c.id === 'pitaia') && r.catalogoPce.modelosCadastro.includes('banana'), 'fiscal com PCE recebe o catálogo atual');
  r = await post({ action: 'sync', key: t.token, since: 0 });
  ok(r.ok && r.catalogoPce === null, 'sem o módulo PCE: o sync não manda o catálogo', r.catalogoPce);

  console.log('5) painel: seletor da aba PCE e telas do catálogo');
  const b = await amb.lancar(), err = [];
  const abrir = async (u, w = 1366) => {
    const cx = await b.newContext({ viewport: { width: w, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block' });
    await cx.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API);
      localStorage.setItem('gdv.painel.token', i.t); localStorage.setItem('gdv.painel.nome', i.n); } }, { t: u.token, n: 'Usuário Teste' });
    const pg = await cx.newPage(); pg.on('pageerror', e => err.push(e.message));
    await pg.goto(amb.PAINEL); await pg.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 30000 });
    await pg.click('#pn-aba-pce'); await pg.waitForTimeout(300);
    return { pg, cx };
  };
  let { pg: G, cx: cg } = await abrir(g);
  ok((await G.$$eval('.pn-pce-sub [data-pce-visao]', l => l.map(x => x.textContent))).join() === 'Indicadores e mapa,Culturas,Doenças e pragas', 'seletor com as três visões');
  await G.click('[data-pce-visao=culturas]'); await G.waitForSelector('.pn-cat-cabeca');
  ok(/Culturas/.test(await G.textContent('.pn-cat-cabeca h2')) && await G.isVisible('.pn-cat-cabeca .pn-btn-prim'), 'Culturas: título, linha e "+ Nova cultura" (gerência + PCE)');
  ok((await G.$$eval('.pn-cat-grupo', l => l.map(x => x.textContent))).slice(0, 2).join() === 'Citros,Bananeira', 'lista agrupada por família');
  await G.click('[data-cat-sel=limao]'); await G.waitForSelector('#pn-cat-ps');
  ok(/HLB \/ Greening/.test(await G.textContent('#pn-cat-ps')) && /família Citros/.test(await G.textContent('#pn-cat-ps')), 'Limão: pragas ligadas pela família Citros');
  await G.fill('#pn-cat-cultivares', 'Limão Tahiti, Limão Galego'); await G.click('#pn-cat-salvar'); await G.waitForTimeout(500);
  ok((await linhas('Culturas')).find(x => x.id === 'limao').cultivares === 'Limão Tahiti, Limão Galego', 'editar cultivares e salvar grava na planilha');
  await G.selectOption('#pn-cat-ligar-sel', 'bactrocera-carambolae'); await G.click('#pn-cat-ligar'); await G.waitForTimeout(500);
  ok(/só Limão/.test(await G.textContent('#pn-cat-ps')), 'ligar uma praga só ao limão');
  await G.click('[data-pce-visao=pragas]'); await G.waitForSelector('#pn-cat-chips');
  await G.click('[data-cat-sel=cancro-citrico]'); await G.waitForTimeout(200);
  ok(/21\/2018/.test(await G.inputValue('#pn-cat-enq')) && /família Citros/.test(await G.textContent('#pn-cat-chips')), 'Cancro Cítrico: enquadramento legal e culturas afetadas');
  await G.screenshot({ path: amb.saida('pce_catalogo_pragas.png'), fullPage: true });
  await cg.close();
  ({ pg: G, cx: cg } = await abrir(leitor));
  await G.click('[data-pce-visao=culturas]'); await G.waitForSelector('.pn-cat-cabeca');
  ok(!(await G.$('.pn-cat-cabeca .pn-btn-prim')) && await G.isDisabled('#pn-cat-nome') && !(await G.$('#pn-cat-salvar')), 'só PCE (sem gerência): vê sem editar');
  await cg.close();
  ({ pg: G, cx: cg } = await abrir(gSemPce));
  ok(!(await G.$('.pn-pce-sub')), 'gerência sem o módulo PCE: sem as visões do catálogo');
  await cg.close();
  ok(!err.length, 'sem erros de JavaScript', err);
  await b.close();

  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
