const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const F = require('./lib/pce-form');
// PCE — cadastros por programa (pce-cadastros.js): um formulário e um PDF por modelo de papel (banana, mandioca, soja e cadastro geral da propriedade),
// numeração própria por programa, modelo escolhido pela família da cultura, um botão por cadastro que falta na visita, "tem" das pragas de detecção vindo
// do levantamento, campos reaproveitados do cadastro anterior da propriedade, "digitar do papel" e lista. Citros e monilíase seguem como antes.
// Dados fictícios. App real + Code.gs real no fakegas.
const { API, APP, PAINEL } = amb;
const get = p => fetch(API + p).then(r => r.json());
const ler = async aba => (await get('/__fn?nome=lerLeitura_&args=' + encodeURIComponent(JSON.stringify([aba])))).r || [];
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 500))); if (!c) falhas++; };
const ANO = new Date().getFullYear();

(async () => {
  const b = await amb.lancar();
  const f = await U.fiscal('Pessoa Ficticia Alfa', { permissoes: U.lista({ veiculos: 1, tf: 1, pce: 1, antigo: 1 }) });
  const c = await b.newContext({ viewport: { width: 1000, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.12, longitude: -60.02, accuracy: 9 } });
  await c.addInitScript(([t]) => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Pessoa Ficticia Alfa'); localStorage.setItem('gdv.semInstalar', '1'); } }, [f.token]);
  await c.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { if (window === window.top && typeof CONFIG !== 'undefined') CONFIG.assinaturaNaTela = true; }));
  await c.addInitScript(() => { if (window !== window.top) window.print = () => { window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: document.body.innerText.replace(/\s+/g, ' '), html: document.body.innerHTML }); }; });
  const p = await c.newPage(); const err = []; p.on('pageerror', e => err.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && err.push(m.text() + ' @' + JSON.stringify(m.location())));
  p.on('dialog', d => d.accept());
  const toast = () => p.textContent('#toast');
  const sim = (nome, v) => p.click(`label:has(> input[name="${nome}"][value="${v}"])`);
  const imprimir = async (tipo, id) => { await p.evaluate(() => { window.__prints = []; }); await p.evaluate(([t, i]) => PCEMon.imprimir(t, i), [tipo, id]); await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 }); return p.evaluate(() => window.__prints[0]); };
  /** Confirma o popup do número (se vier) e espera o seletor. */
  const aguardar = async sel => { for (let i = 0; i < 60 && !(await p.locator(sel).count()); i++) { if (await p.locator('#mon-m-ok').count()) await p.click('#mon-m-ok'); await p.waitForTimeout(250); } return p.locator(sel).count(); };
  const cads = () => p.evaluate(async () => (await Store.todos('cadastrosPce')).filter(x => !x.excluido).map(x => ({ ...x, d: JSON.parse(x.dados) })));
  const levantar = async (id, culturas, o = {}) => {
    await p.evaluate(() => go('pce')); await p.waitForSelector('#pce-novolev'); await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm');
    await p.fill('#pce-doc', id.doc); await p.fill('#pce-nome', id.nome); await p.fill('#pce-propriedade', id.propriedade); await p.fill('#pce-codigo', id.codigo || '');
    await p.fill('#pce-telefone', '92 90000-0000'); await p.fill('#pce-endereco', 'Ramal Ficticio, km 3'); await p.selectOption('#pce-municipio', 'Manaus');
    if (o.situacao) await p.selectOption('#pce-situacao', o.situacao);
    if (o.comercial) await p.selectOption('#pce-comercial', o.comercial);
    for (let i = 0; i < culturas.length; i++) {
      const k = culturas[i]; await F.cultura(p, i, k.nome);
      if (k.area) await p.fill(`${F.cult(i)} >> .c-area`, k.area);
      if (k.esp) { await p.fill(`${F.cult(i)} >> .c-espLinha`, k.esp[0]); await p.fill(`${F.cult(i)} >> .c-espPlanta`, k.esp[1]); }
      for (const [pr, res, am] of k.pragas || []) await F.responder(p, i, pr, res, am);
      await F.responderObrigatorias(p, i);
    }
    if (o.citros) for (const k of ['hlb', 'acaro', 'cancro']) await p.click(`#pce-citros label:has(input[name="pce-ci-det-${k}-tem"][value="nao"])`);
    await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto');
    return p.evaluate(async () => (await Store.todos('levantamentos')).sort((a, b) => b.criadoEm - a.criadoEm)[0].id);
  };
  const botoes = () => p.$$eval('.pce-visita [data-pce=cadvisita]', l => l.map(x => ({ modelo: x.dataset.modelo, texto: x.textContent.trim(), id: x.id })));

  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]'); await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
  await p.selectOption('#pce-s-cargo', { index: 1 }); await p.selectOption('#pce-s-lotacao', 'Manaus'); await p.click('#pce-s-salvar'); await p.waitForSelector('#pce-novolev');

  console.log('1) modelo pela família da cultura');
  const M = await p.evaluate(async () => { const cat = await PCECads.catalogo(); const m = n => PCECads.modeloDaCultura(n, cat);
    return { cat: !!cat, soja: m('Soja'), banana: m('Banana'), mandioca: m('Mandioca'), cacau: m('Cacau'), cupuacu: m('Cupuaçu'), laranja: m('Laranja'), mamao: m('Mamão'), acai: m('Açaí'), semCat: PCECads.modeloDaCultura('Soja', null), semCatMamao: PCECads.modeloDaCultura('Mamão', null) }; });
  ok(M.soja === 'soja' && M.banana === 'banana' && M.mandioca === 'mandioca' && M.cacau === 'moniliase' && M.cupuacu === 'moniliase' && M.laranja === 'citros', 'família define o modelo (soja, banana, mandioca, cacau e cupuaçu, citros)', M);
  ok(M.mamao === 'propriedade' && M.acai === 'propriedade' && M.semCat === 'soja' && M.semCatMamao === 'propriedade', 'cultura sem família cai no cadastro geral; sem catálogo vale a lista do config', M);

  console.log('2) visita de soja: cadastro de soja com PDF de soja e número próprio');
  const lev1 = await levantar({ doc: '52998224725', nome: 'Raimundo Nonato', propriedade: 'Sitio Esperanca', codigo: 'PRP-77' },
    [{ nome: 'Soja', area: '12,5', esp: ['0,5', '0,1'], pragas: [['Phakopsora pachyrhizi', 'detectada']] }], { situacao: 'Arrendamento', comercial: 'sim' });
  let bt = await botoes();
  ok(bt.length === 1 && bt[0].modelo === 'soja' && /Cadastro de soja/.test(bt[0].texto) && bt[0].id === 'pce-pronto-cad', 'visita de soja: um botão, o do cadastro de soja', bt);
  await p.click('#pce-pronto-cad'); await p.waitForSelector('#monCadForm[data-programa=soja]');
  ok(await p.locator('#mon-cadgen, form.mon-cadgen').count() === 1 && !(await p.locator('#mc-pl-cacau').count()), 'formulário genérico de soja (não o de monilíase)');
  const resumo = await p.textContent('#mc-resumo');
  ok(/Raimundo Nonato/i.test(resumo) && /529\.982\.247-25/.test(resumo) && /Sitio Esperanca/.test(resumo) && /PRP-77/.test(resumo) && /92 90000-0000/.test(resumo) && /Ramal Ficticio/.test(resumo),
    'produtor, propriedade, código, telefone e endereço vêm do levantamento (resumo, sem perguntar de novo)', resumo);
  ok(!(await p.locator('#mc-nome').isVisible()), 'campos de identificação ficam escondidos quando vêm do levantamento');
  ok(await p.isChecked('input[name="mc-f-situacao"][value="arrendatario"]'), 'situação fundiária do levantamento (Arrendamento) vira "Arrendatário"');
  const lin = await p.$$eval('#mc-f-culturas .pc-lin input', l => l.map(i => i.dataset.col + '=' + i.value));
  ok(lin.includes('area=12,5') && lin.some(x => /espacamento=0.5 x 0.1 m|espacamento=0,5 x 0,1 m/.test(x)), 'tabela da cultura vem com área e espaçamento do levantamento', lin);
  ok(await p.locator('#mc-d-ferrugem-lev').count() === 1 && /detectada ou suspeita/.test(await p.textContent('#mc-d-ferrugem-lev')) && await p.locator('input[name="mc-d-ferrugem-tem"]').count() === 0,
    'ferrugem: "tem" vem do resultado no levantamento (Detectada) e não é perguntado');
  ok(await p.locator('input[name="mc-d-amaranthus-tem"]').count() === 2 || await p.locator('#mc-d-amaranthus-lev').count() === 1, 'Amaranthus: ou vem do levantamento ou é perguntado');
  ok(await p.isVisible('#mc-d-ferrugem-tempo'), 'ferrugem detectada: pergunta "há quanto tempo"');
  await p.screenshot({ path: amb.saida('pce_cad_soja_form.png'), fullPage: true });
  ok(await p.inputValue('#mc-unidade') === 'Manaus', 'unidade da numeração: a lotação de quem faz o cadastro');
  await p.fill('#mc-f-destino', 'Cooperativa Ficticia'); await p.fill('#mc-d-ferrugem-tempo', '2 anos'); await p.fill('#mc-f-fornecedor', 'Fornecedor Ficticio Ltda');
  await p.fill('#mc-rt-nome', 'Responsavel Teste'); await p.fill('#mc-rt-conselho', 'CREA-AM 0000');
  await sim('mc-f-maquinario', 'sim'); await p.fill('#mc-f-maquinarioLocal', 'Cidade Ficticia/MT'); await sim('mc-f-limpeza', 'nao');
  ok(await p.isHidden('.pc-campo[data-k=limpezaForma]') && await p.isVisible('.pc-campo[data-k=maquinarioLocal]'), 'campos condicionais (local do maquinário só com "sim"; forma de limpeza só com "sim")');
  await p.click('#mc-salvar');
  ok(await aguardar('#pce-lev-pronto') === 1, 'depois de salvar volta para a tela do levantamento pronto', await toast());
  let C = await cads();
  const soja1 = C.find(x => x.programa === 'soja');
  ok(C.length === 1 && soja1.numeroTxt === `001-${ANO}-MANAUS` && soja1.d.deteccao.ferrugem.tem === 'sim' && soja1.d.deteccao.ferrugem.origem === 'levantamento' && soja1.d.deteccao.ferrugem.tempo === '2 anos',
    'cadastro de soja nº 001 gravado; "tem" da ferrugem veio do levantamento', C.map(x => [x.programa, x.numeroTxt]));
  ok(soja1.d.destino === 'Cooperativa Ficticia' && soja1.d.maquinarioLocal === 'Cidade Ficticia/MT' && soja1.d.limpezaForma === '' && soja1.d.rt.nome === 'Responsavel Teste' && soja1.d.codigoPropriedade === 'PRP-77'
    && soja1.d.situacao === 'arrendatario' && soja1.d.culturas[0].area === '12,5' && soja1.d.levantamentoId === lev1, 'dados gravados (campos, RT, código, situação, cultura com área)', soja1.d);
  ok(await p.locator('.pce-visita [data-pce=cadvisita]').count() === 0 && /já cadastrada/.test(await p.textContent('.pce-visita')), 'a visita não pede o cadastro de novo');
  const pdf = await imprimir('cadastro', soja1.id);
  ok(/FICHA DE CADASTRO E LEVANTAMENTO DE SOJA/.test(pdf.texto) && /001-\d{4}-MANAUS/.test(pdf.texto) && /PORTARIA Nº 865/.test(pdf.texto) && !/HOSPEDEIROS|monilíase/i.test(pdf.texto)
    && /RAIMUNDO NONATO/.test(pdf.texto) && /Cooperativa Ficticia/.test(pdf.texto) && /2 anos/.test(pdf.texto) && /Responsavel Teste/.test(pdf.texto) && /Fornecedor Ficticio/.test(pdf.texto), 'PDF é o modelo de soja, com número, produtor e respostas', pdf.texto.slice(0, 300));
  ok(/ARRENDATÁRIO/.test(pdf.texto) && pdf.html.includes('(X)') && /0,5 x 0,1 m|0.5 x 0.1 m/.test(pdf.texto) && /12,5/.test(pdf.texto), 'PDF de soja: situação marcada, cultura com área e espaçamento');
  ok(/\(X\)\s*sim/.test(pdf.texto), 'PDF de soja: ferrugem marcada como "sim"');
  const nome = await p.evaluate(id => Store.obter('cadastrosPce', id).then(r => Docs.nomePdfMon(PCEDocs.tipoDoRegistro('cadastro', r), r)), soja1.id);
  ok(/^Cadastro_Soja_001-/.test(nome), 'nome do arquivo do PDF: Cadastro_Soja_...', nome);

  console.log('3) segunda propriedade de soja: nº 002; banana: nº 001 (numeração por programa)');
  const lev2 = await levantar({ doc: '11144477735', nome: 'Maria Souza Teste', propriedade: 'Fazenda Teste Dois', codigo: 'PRP-78' }, [{ nome: 'Soja', area: '30', pragas: [['Phakopsora pachyrhizi', 'nao_detectada'], ['Amaranthus palmeri', 'nao_detectada']] }]);
  await p.click('#pce-pronto-cad'); await p.waitForSelector('#monCadForm[data-programa=soja]');
  ok(await p.locator('#mc-d-amaranthus-lev').count() === 1 && /não detectada/.test(await p.textContent('#mc-d-ferrugem-lev')), 'resultado "não detectada" no levantamento vira "não" sem perguntar');
  ok(!(await p.locator('#mc-reaproveitados').count()), 'propriedade nova: nada a reaproveitar');
  await p.selectOption('#mc-unidade', 'Manaus'); await p.click('#mc-salvar');
  ok(await aguardar('#pce-lev-pronto') === 1, 'segundo cadastro de soja salvo');
  C = await cads();
  const soja2 = C.find(x => x.id !== soja1.id && x.programa === 'soja');
  ok(soja2 && soja2.numeroTxt === `002-${ANO}-MANAUS` && soja2.d.deteccao.ferrugem.tem === 'nao' && soja2.d.deteccao.amaranthus.tem === 'nao', 'segundo cadastro de soja é o nº 002; detecção "não"', soja2 && soja2.numeroTxt);

  console.log('4) visita com banana e cultura sem família: dois cadastros');
  const lev3 = await levantar({ doc: '52998224725', nome: 'Raimundo Nonato', propriedade: 'Sitio Esperanca', codigo: 'PRP-77' },
    [{ nome: 'Banana', area: '4', pragas: [['Moko da Bananeira', 'suspeita']] }, { nome: 'Mamão', area: '1,5' }], { comercial: 'nao' });
  bt = await botoes();
  ok(bt.length === 2 && bt.map(x => x.modelo).join() === 'banana,propriedade' && bt[0].id === 'pce-pronto-cad' && /Cadastro de banana/.test(bt[0].texto) && /Cadastro geral da propriedade/.test(bt[1].texto)
    && /mais de um cadastro/.test(await p.textContent('.pce-visita')), 'banana + mamão (sem família): pede dois cadastros, um botão por modelo', bt);
  await p.click('[data-pce=cadvisita][data-modelo=banana]'); await p.waitForSelector('#monCadForm[data-programa=banana]');
  ok(await p.locator('input[name="mc-comercial"]').count() === 2 && await p.locator('input[name="mc-comercial"][value="nao"]:checked').count() === 1, 'banana: "propriedade comercial?" vem do levantamento (não)');
  ok(await p.locator('#mc-telefone').count() === 0, 'a ficha de banana não tem telefone');
  ok(/suspeita/.test(await p.textContent('#mc-d-moko-lev')) && await p.locator('input[name="mc-d-sigatoka-tem"]').count() === 2, 'Moko (suspeita no levantamento) = sim; Sigatoka não foi avaliada: pergunta');
  ok(await p.isVisible('#mc-d-moko-tempo') && await p.isVisible('input[name="mc-d-moko-controle"] >> nth=0'), 'banana: tempo e método de controle');
  await p.selectOption('#mc-unidade', 'Manaus'); await sim('mc-d-sigatoka-tem', 'nao');
  await sim('mc-d-moko-controle', 'sim'); await p.fill('#mc-d-moko-qual', 'Erradicacao da planta'); await p.fill('#mc-d-moko-tempo', '3 meses');
  await p.fill('#mc-f-origemMaterial', 'Viveiro Ficticio'); await p.fill('#mc-f-destino', 'Feira Ficticia');
  await p.fill('#mc-rt-nome', 'Engenheira Teste'); await p.fill('#mc-rt-conselho', 'CREA 1234');
  await p.fill('#mc-f-culturas .pc-lin >> nth=0 >> [data-col=cultivar]', 'Prata'); await p.fill('#mc-f-culturas .pc-lin >> nth=0 >> [data-col=plantas]', '2000');
  await p.click('[data-pc=addlinha]'); await p.fill('#mc-f-culturas .pc-lin >> nth=1 >> [data-col=cultivar]', 'Maca');
  await p.check('input[name="mc-f-compradores"][value="feira"]');
  await p.click('#mc-salvar');
  ok(await aguardar('#pce-lev-pronto') === 1, 'cadastro de banana salvo, volta ao levantamento', await toast());
  bt = await botoes();
  ok(bt.length === 1 && bt[0].modelo === 'propriedade' && bt[0].id === 'pce-pronto-cad', 'falta só o cadastro geral (o de banana já existe)', bt);
  C = await cads();
  const ban = C.find(x => x.programa === 'banana');
  ok(ban.numeroTxt === `001-${ANO}-MANAUS` && ban.d.deteccao.moko.tem === 'sim' && ban.d.deteccao.moko.origem === 'levantamento' && ban.d.deteccao.moko.controle === 'sim' && ban.d.deteccao.sigatoka.tem === 'nao'
    && ban.d.deteccao.sigatoka.origem === 'campo' && ban.d.comercial === 'nao' && ban.d.culturas.length === 2 && ban.totalPlantas === 2000 && ban.d.compradores.join() === 'feira',
    'banana nº 001 (numeração própria do programa); detecção: Moko do levantamento, Sigatoka perguntada', ban && [ban.numeroTxt, ban.d.deteccao, ban.totalPlantas]);
  const pb = await imprimir('cadastro', ban.id);
  ok(/FICHA DE CADASTRO E LEVANTAMENTO DE BANANA/.test(pb.texto) && /MOKO DA BANANEIRA/.test(pb.texto) && /SIGATOKA NEGRA/.test(pb.texto) && /Prata/.test(pb.texto) && /Maca/.test(pb.texto) && /Engenheira Teste/.test(pb.texto)
    && /3 meses/.test(pb.texto) && /Erradicacao da planta/.test(pb.texto), 'PDF de banana: modelo de banana com a tabela de cultura e a delimitação', pb.texto.slice(0, 200));
  await p.click('#pce-pronto-cad'); await p.waitForSelector('#monCadForm[data-programa=propriedade]');
  ok(await p.locator('#mc-reaproveitados').count() === 1 && /responsável técnico/.test(await p.textContent('#mc-reaproveitados')) && /destino/i.test(await p.textContent('#mc-reaproveitados')), 'reaproveita: RT e destino copiados do cadastro de banana da mesma propriedade', await p.textContent('#mc-reaproveitados').catch(() => ''));
  ok(await p.inputValue('#mc-rt-nome') === 'Engenheira Teste' && await p.inputValue('#mc-rt-conselho') === 'CREA 1234' && await p.inputValue('#mc-f-destino') === 'Feira Ficticia', 'valores copiados nos campos', [await p.inputValue('#mc-rt-nome'), await p.inputValue('#mc-f-destino'), await p.evaluate(async () => (await Store.todos('cadastrosPce')).map(x => [x.programa, x.data, x.criadoEm, x.propriedadeId]))]);
  const lin3 = await p.$$eval('#mc-f-culturas .pc-lin', l => l.map(x => [...x.querySelectorAll('input')].map(i => i.dataset.col + '=' + i.value).join(',')));
  ok(lin3.length === 1 && /cultura=Mamão/.test(lin3[0]) && /area=1,5/.test(lin3[0]), 'cadastro geral: tabela com a cultura sem família e a área do levantamento', lin3);
  ok(await p.locator('input[name="mc-f-tipos"][value="outros"]:checked').count() === 1 && await p.inputValue('#mc-f-tiposOutros') === 'Mamão', 'tipo de cultura: "Mamão" não tem caixa na ficha e vai em "Outros"');
  await p.fill('#mc-f-areaTotal', '10'); await p.selectOption('#mc-unidade', 'Manaus'); await sim('mc-f-manipula', 'sim');
  ok(await p.isVisible('.pc-campo[data-k=natureza]') && await p.isHidden('.pc-campo[data-k=naturezaOutros]'), 'natureza operativa aparece com "manipula" = sim');
  await p.check('input[name="mc-f-natureza"][value="outros"]'); await p.dispatchEvent('input[name="mc-f-natureza"][value="outros"]', 'change');
  await p.fill('#mc-f-naturezaOutros', 'Farinha');
  await p.click('#mc-salvar');
  ok(await aguardar('#pce-lev-pronto') === 1, 'cadastro geral salvo');
  C = await cads();
  const prop = C.find(x => x.programa === 'propriedade');
  ok(prop.numeroTxt === `001-${ANO}-MANAUS` && prop.d.rt.nome === 'Engenheira Teste' && prop.d.destino === 'Feira Ficticia' && prop.d.culturas[0].cultura === 'Mamão' && prop.d.naturezaOutros === 'Farinha' && prop.d.tiposOutros === 'Mamão',
    'cadastro geral nº 001 próprio, com RT e destino reaproveitados', prop && [prop.numeroTxt, prop.d]);
  const pp = await imprimir('cadastro', prop.id);
  ok(/PROPRIEDADE DE INTERESSE DA DEFESA VEGETAL/.test(pp.texto) && /ASSUMO TOTAL RESPONSABILIDADE/.test(pp.texto) && /Mamão/.test(pp.texto) && /Farinha/.test(pp.texto), 'PDF do cadastro geral da propriedade', pp.texto.slice(0, 200));
  ok(await p.locator('.pce-visita [data-pce=cadvisita]').count() === 0, 'visita completa: nenhum cadastro pendente');

  console.log('5) mandioca avulsa (sem levantamento): detecção e colheita de amostras perguntadas');
  await p.evaluate(() => go('pcecads')); await p.waitForSelector('#mon-modelo');
  ok(await p.$$eval('#mon-modelo option', l => l.map(o => o.value).join()) === 'moniliase,banana,mandioca,soja,propriedade', 'lista: "Novo cadastro" deixa escolher o modelo (citros sai do levantamento)');
  ok(await p.locator('.mon-prog').count() >= 4 && /Soja/.test(await p.textContent('#monItens')) && /Banana/.test(await p.textContent('#monItens')), 'lista mostra o programa de cada cadastro');
  await p.selectOption('#mon-modelo', 'mandioca'); await p.click('#mon-novo'); await p.waitForSelector('#monCadForm[data-programa=mandioca]');
  ok(await p.isVisible('#mc-nome') && await p.isVisible('#mc-telefone') && await p.locator('input[name="mc-d-vassoura-tem"]').count() === 2 && await p.locator('input[name="mc-a-tem"]').count() === 2, 'avulso: identificação, telefone, vassoura e colheita de amostras perguntados');
  ok(!(await p.locator('#mc-rt-nome').count()), 'a ficha de mandioca não tem responsável técnico');
  await p.fill('#mc-nome', 'Joaquim Roca Teste'); await p.fill('#mc-doc', '39053344705'); await p.fill('#mc-propriedade', 'Roca do Joaquim'); await p.fill('#mc-telefone', '92 91111-2222'); await p.selectOption('#mc-municipio', 'Manaus');
  await p.selectOption('#mc-unidade', 'Manaus'); await sim('mc-d-vassoura-tem', 'sim'); await p.fill('#mc-d-vassoura-tempo', '6 meses'); await sim('mc-a-tem', 'sim'); await p.fill('#mc-a-tipo', 'Folhas');
  await p.check('input[name="mc-f-estagio"][value="raizes"]'); await sim('mc-f-materialDe', 'terceiros'); await p.fill('#mc-f-origemMaterial', 'Vizinho'); await sim('mc-f-assistencia', 'sim'); await p.fill('#mc-f-assistenciaEmpresa', 'Empresa Ficticia');
  await p.fill('#mc-f-culturas .pc-lin >> nth=0 >> [data-col=cultivar]', 'Aipim'); await p.fill('#mc-f-culturas .pc-lin >> nth=0 >> [data-col=area]', '2');
  await p.click('#mc-salvar'); ok(await aguardar('#mon-pronto') === 1, 'mandioca avulsa salva', await toast());
  C = await cads();
  const man = C.find(x => x.programa === 'mandioca');
  ok(man.numeroTxt === `001-${ANO}-MANAUS` && man.d.deteccao.vassoura.tem === 'sim' && man.d.deteccao.vassoura.origem === 'campo' && man.d.amostra.tem === 'sim' && man.d.amostra.tipo === 'Folhas' && man.d.telefone === '92 91111-2222' && man.d.estagio === 'raizes',
    'mandioca nº 001; detecção e amostra perguntadas e gravadas', man && man.d);
  const pm = await imprimir('cadastro', man.id);
  ok(/FICHA DE CADASTRO E LEVANTAMENTO DE MANDIOCA/.test(pm.texto) && /VASSOURA-DE-BRUXA/.test(pm.texto) && /COLHEITA DE AMOSTRAS/.test(pm.texto) && /Folhas/.test(pm.texto) && /Aipim/.test(pm.texto) && /92 91111-2222/.test(pm.texto), 'PDF de mandioca', pm.texto.slice(0, 200));

  console.log('6) rascunho automático e digitar do papel');
  await p.evaluate(() => go('pcecads')); await p.waitForSelector('#mon-modelo'); await p.selectOption('#mon-modelo', 'soja'); await p.click('#mon-novo'); await p.waitForSelector('#monCadForm[data-programa=soja]');
  await p.fill('#mc-nome', 'Rascunho Teste'); await p.fill('#mc-f-fornecedor', 'Forn Rascunho'); await p.waitForTimeout(900);
  const rasc = await p.evaluate(() => Store.meta('pceCadRascunho'));
  ok(rasc && rasc.programa === 'soja' && rasc.dados.nome === 'Rascunho Teste' && rasc.dados.f.fornecedor === 'Forn Rascunho', 'rascunho guarda o programa e os campos', rasc && rasc.programa);
  await p.evaluate(() => go('pcecads')); await p.waitForSelector('#mon-modelo'); await p.click('#mon-novo'); await p.waitForSelector('#monCadForm[data-programa=soja]');
  ok(await p.inputValue('#mc-nome') === 'Rascunho Teste' && await p.inputValue('#mc-f-fornecedor') === 'Forn Rascunho', 'rascunho retomado no formulário de soja');
  await p.click('[data-mon=descartar]'); await p.waitForSelector('#mon-modelo');
  await p.selectOption('#mon-modelo', 'soja'); await p.click('#mon-novo-papel'); await p.waitForSelector('#monCadForm.pce-antigo[data-programa=soja]');
  await p.fill('#mc-snome', 'Servidora Papel Teste'); await p.selectOption('#mc-scargo', { index: 1 }); await p.selectOption('#mc-slotacao', 'Manaus'); await p.selectOption('#mc-unidade', 'Manaus');
  await p.fill('#mc-numpapel', '7'); await p.fill('#mc-data', `${ANO}-02-03`); await p.fill('#mc-nome', 'Produtor Papel Teste'); await p.fill('#mc-doc', '39053344705'); await p.selectOption('#mc-municipio', 'Manaus');
  ok(await p.locator('#mc-pdfs').count() === 1 && await p.locator('#mon-ass-servidor').count() === 0, 'do papel: número, data e PDF escaneado; sem assinaturas');
  await p.click('#mc-salvar'); ok(await aguardar('#mon-pronto') === 1, 'cadastro do papel salvo (confirma o número)', await toast());
  C = await cads();
  const papel = C.find(x => x.programa === 'soja' && x.numeroOrigem === 'papel');
  ok(papel && papel.numeroTxt === `007-${ANO}-MANAUS` && Number(papel.registroAntigo) === 1 && papel.data === `${ANO}-02-03` && papel.servidor === 'Servidora Papel Teste', 'número do papel 007 na sequência de soja; servidor e data do papel', papel && [papel.numeroTxt, papel.servidor]);

  console.log('7) citros e monilíase seguem como antes');
  const levC = await levantar({ doc: '52998224725', nome: 'Raimundo Nonato', propriedade: 'Sitio Esperanca', codigo: 'PRP-77' }, [{ nome: 'Laranja', pragas: [['Cancro Cítrico', 'nao_detectada']] }], { citros: true });
  bt = await botoes();
  ok(bt.length === 1 && bt[0].modelo === 'citros' && /Cadastro de citros/.test(bt[0].texto) && /Cadastro de citros sai deste levantamento/.test(await p.textContent('.pce-visita')), 'citros: o botão e o texto de sempre', bt);
  const levMo = await levantar({ doc: '39053344705', nome: 'Joaquim Roca Teste', propriedade: 'Roca do Joaquim', codigo: 'PRP-99' }, [{ nome: 'Cacau', pragas: [['Monilíase do Cacaueiro', 'nao_detectada']] }]);
  bt = await botoes();
  ok(bt.length === 1 && bt[0].modelo === 'moniliase' && /Cadastrar a propriedade/.test(bt[0].texto), 'monilíase: "Cadastrar a propriedade"', bt);
  await p.click('#pce-pronto-cad'); await p.waitForSelector('#monCadForm');
  ok(!(await p.locator('form.mon-cadgen').count()) && await p.locator('#mc-pl-cacau').count() === 1, 'monilíase abre o formulário de monilíase (hospedeiros)');
  await p.click('[data-mon=descartar]'); await p.waitForSelector('#pce-novolev, #mon-modelo, #pce-lev-pronto', { timeout: 5000 }).catch(() => {});

  console.log('8) sincroniza: o servidor guarda o programa e a numeração por programa');
  for (let i = 0; i < 25; i++) { await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(400); if (!(await p.evaluate(async () => (await Store.todos('cadastrosPce')).filter(x => x.pendente).length))) break; }
  const L = (await ler('CadastrosPCE')).filter(x => x.id && !x.excluido);
  const por = Object.fromEntries(L.map(x => [x.programa + ':' + x.numero, x.numeroTxt]));
  ok(L.length === C.length && por['soja:1'] && por['soja:2'] && por['soja:7'] && por['banana:1'] && por['propriedade:1'] && por['mandioca:1'], 'planilha: cada programa com a própria sequência (soja 1, 2 e 7; banana 1; propriedade 1; mandioca 1)', por);
  ok(L.every(x => x.usuario), 'todo cadastro grava quem fez', L.map(x => x.usuario));

  console.log('9) painel mostra o programa');
  const g = await amb.gerente('Gerente Cadastros Teste');
  const cx = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block' });
  await cx.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.painel.token', i.t); localStorage.setItem('gdv.painel.nome', i.n); } }, { t: g.token, n: 'Gerente Cadastros Teste' });
  const pg = await cx.newPage(); pg.on('pageerror', e => err.push('painel: ' + e.stack));
  await pg.goto(amb.PAINEL); await pg.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 30000 });
  await pg.click('#pn-aba-pce'); await pg.waitForSelector('#pce-cadastros-mon', { timeout: 15000 }).catch(() => {});
  const tab = await pg.textContent('#pce-cadastros-mon').catch(() => '');
  ok(/Programa/.test(tab) && /Soja/.test(tab) && /Banana/.test(tab) && /Mandioca/.test(tab) && /Propriedade/.test(tab) && !/monilíase\)/i.test(await pg.textContent('#pce-cadastros-mon h3, #pce-cadastros-mon caption').catch(() => '')), 'painel: tabela de cadastros com a coluna Programa e todos os programas', tab.slice(0, 300));
  ok(/Soja: 3|Soja: \d/.test(await pg.textContent('#pn-conteudo')), 'painel: indicador de cadastros por programa');
  ok(!err.length, 'sem erros de JavaScript', err);
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
