const amb = require('./lib/amb');
const A = require('./lib/pce-app');
// PCE — fichas oficiais (pce-cadastros.js): geradas do cadastro do produtor, da propriedade e dos frutos, nunca bloqueiam o Termo; um modelo por família da
// cultura; numeração própria por programa, unidade e ano; o formulário só pergunta o que é próprio do modelo e ainda não foi respondido (em outra ficha ou na
// visita); a ficha da monilíase lê as respostas de detecção da visita; ficha antiga (CadastrosPCE de antes) continua abrindo. Frutos sugeridos pelo histórico
// só inserem. App real + Code.gs real no fakegas. Dados fictícios.
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' -> ' + JSON.stringify(x).slice(0, 400))); if (!c) throw new Error(m); };
const ANO = new Date().getFullYear();
const post = b => fetch(amb.API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
(async () => {
  const b = await amb.lancar();
  const p = await A.aparelho(b, 'Marta Fichas Ficticia');
  await A.identificar(p);
  const modelo = m => p.locator(`.pce-visita-termo[data-modelo=${m}]`);

  console.log('1) a tela do produtor oferece uma ficha por modelo dos frutos; Termo não depende de ficha');
  await A.novoProdutor(p, { doc: '390.533.447-05', nome: 'Joana Ficticia', propriedade: 'Sitio Fichas', codigo: 'PRP-FIC-1', municipio: 'Manaus',
    frutos: [{ cultura: 'Soja', area: 20 }, { cultura: 'Banana', area: 2, quantidade: 500 }, { cultura: 'Mandioca', area: 1 }, { cultura: 'Cacau', area: 3, quantidade: 400 }, { cultura: 'Açaí', area: 1 }, { cultura: 'Laranja', area: 1 }] });
  const ms = await p.locator('.pce-visita-termo[data-modelo]').evaluateAll(l => l.map(e => e.dataset.modelo));
  ok(['soja', 'banana', 'mandioca', 'moniliase', 'propriedade', 'citros'].every(m => ms.includes(m)) && ms.length === 6, 'seis modelos pela família da cultura (Açaí, sem família, cai na ficha da propriedade)', ms);
  ok(await p.locator('#pce-novavisita').isEnabled(), 'Nova visita disponível sem nenhuma ficha');

  console.log('2) ficha de soja: só as perguntas do modelo; número próprio por programa');
  await modelo('soja').locator('[data-cad=ficha]').click(); await p.waitForSelector('#pceFichaForm');
  const ps = await p.locator('#fi-perguntas fieldset legend, #fi-perguntas label').allTextContents();
  ok(ps.some(x => /MAQUINÁRIO/.test(x)) && ps.some(x => /LIMPEZA/.test(x)) && ps.some(x => /FORNECEDOR/.test(x)) && !ps.some(x => /CPF|NOME DO PRODUTOR|ÁREA/.test(x)), 'soja pergunta maquinário, limpeza e fornecedor; nada do cadastro', ps);
  await p.locator('fieldset[data-k=maquinario] label:has(input[value=nao])').click();
  await p.locator('fieldset[data-k=limpeza] label:has(input[value=sim])').click(); await p.fill('#fi-limpezaForma', 'Lavagem com água e detergente');
  await p.fill('#fi-fornecedor', 'Cooperativa Ficticia'); await p.fill('#fi-rtnome', 'Eng. Agr. Fictício'); await p.fill('#fi-rtconselho', 'CREA-AM 0000');
  await p.click('#fi-salvar'); await p.waitForSelector('#pce-produtor');
  ok(new RegExp(`Gerada: nº 001-${ANO}-MANAUS`).test(await modelo('soja').textContent()), 'ficha de soja nº 001');
  const pf = await A.imprimir(p, '.pce-visita-termo[data-modelo=soja] [data-cad=pdfficha]');
  ok(/FICHA DE CADASTRO E LEVANTAMENTO DE SOJA/.test(pf.texto) && /Cooperativa Ficticia/.test(pf.texto) && /Fictício/.test(pf.texto) && /Joana Ficticia|JOANA FICTICIA/i.test(pf.texto) && /Soja/.test(pf.texto), 'PDF da soja: título oficial, respostas, RT e a cultura vinda do cadastro', pf.texto.slice(0, 400));
  await A.salvarPdf(p, pf, 'pce-ficha.html', 'pce_cadastros_soja');
  await modelo('banana').locator('[data-cad=ficha]').click(); await p.waitForSelector('#pceFichaForm');
  ok(await p.inputValue('#fi-rtnome') === 'Eng. Agr. Fictício', 'o responsável técnico é perguntado uma vez: vem da ficha anterior');
  await p.locator('#fi-perguntas input[name="fi-compradores"][value=feira]').check(); await p.fill('#fi-origemMaterial', 'Mudas de viveiro fictício');
  await p.click('#fi-salvar'); await p.waitForSelector('#pce-produtor');
  ok(new RegExp(`Gerada: nº 001-${ANO}-MANAUS`).test(await modelo('banana').textContent()), 'ficha de banana também é nº 001: a numeração é por programa');

  console.log('3) o que já foi respondido em outra ficha não é perguntado de novo');
  await modelo('citros').locator('[data-cad=ficha]').click(); await p.waitForSelector('#pceFichaForm');
  const pc = await p.locator('#fi-perguntas').textContent();
  ok(!/Com quem comercializa/.test(pc) && !/Origem do material genético/.test(pc) && /Entrega na propriedade/.test(pc), 'citros não repete "com quem comercializa" nem "origem do material" (mesma pergunta e opções da banana); pergunta o resto');
  ok(/pergunta\(s\) já respondida\(s\) em outra ficha/.test(await p.textContent('#pceFichaForm')), 'a tela diz quantas perguntas foram dispensadas');
  await p.click('#fi-salvar'); await p.waitForSelector('#pce-produtor');
  const cit = await p.evaluate(async () => JSON.parse((await Store.todos('cadastrosPce')).find(c => c.programa === 'citros').dados));
  ok(JSON.stringify(cit.compradores) === '["feira"]' && cit.origemMaterial === 'Mudas de viveiro fictício', 'a resposta reaproveitada vai junto na ficha de citros', cit);

  console.log('4) ficha da monilíase lê a detecção da visita; ficha da propriedade (sem família)');
  await A.visita(p, { frutos: ['Cacau'], resultados: { Cacau: { 'Monilíase do Cacaueiro': 'detectada' } }, parar: 3 });
  const cac = A.bloco(p, 'Cacau');
  await cac.locator('input[id$=sintomaLat]').fill('-3,2'); await cac.locator('input[id$=sintomaLon]').fill('-60,1');
  await cac.locator('fieldset[data-k=camaraUmida] label:has(input[value=sim])').click(); await cac.locator('fieldset[data-k=camaraMr] label:has(input[value=nao])').click();
  await cac.locator('input[name$=suspeitos][value=cacau]').check();
  await p.click('#vi-continuar'); await p.waitForSelector('#vi-local'); await p.click('#vi-continuar'); await p.waitForSelector('#vi-resumo'); await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta');
  await p.click('#vi-voltar-produtor'); await p.waitForSelector('#pce-produtor');
  await modelo('moniliase').locator('[data-cad=ficha]').click(); await p.waitForSelector('#pceFichaForm');
  const pm = await p.locator('#fi-perguntas').textContent();
  ok(!/Câmara Úmida/.test(pm) && !/HOSPEDEIRO SUSPEITO/.test(pm) && !/coordenada da planta/.test(pm) && /Existe área abandonada/.test(pm) && /Retirada de frutos mumificados/.test(pm), 'monilíase não pergunta o que a visita respondeu (câmara úmida, hospedeiro, coordenada); pergunta o do modelo', pm.slice(0, 300));
  ok(!/FRUTO COM SINTOMAS/.test(pm) && !/COLHEITA DE AMOSTRA/.test(pm), 'sintomas e amostra vêm da visita (resultado da praga e coleta), não são perguntados');
  await p.locator('fieldset[data-k=mumificados] label:has(input[value=sim])').click(); await p.click('#fi-salvar'); await p.waitForSelector('#pce-produtor');
  const v = await p.evaluate(async () => { const pr = (await Store.todos('propriedades'))[0], pe = await Store.obter('pessoas', '39053344705');
    return PCEDocs.valoresFicha('moniliase', { produtor: { nome: pe.nome, doc: pr.doc }, propriedade: { ...pr }, dados: {}, visita: await PCECads.visitaMaisRecente(pr), ficha: {} }); });
  ok(v.r.sintomas === 'sim' && v.r.camaraUmida === 'sim' && v.r.camaraMr === 'nao' && v.r.sintomaLat === '-3,2' && v.r.sintomaLon === '-60,1' && v.r.suspeitos.includes('cacau'), 'a ficha da monilíase traz as respostas da visita (detecção, coordenada, hospedeiro)', { s: v.r.sintomas, c: v.r.camaraUmida, la: v.r.sintomaLat });
  await modelo('propriedade').locator('[data-cad=ficha]').click(); await p.waitForSelector('#pceFichaForm');
  ok(/Produzem e\/ou Manipulam/.test(await p.textContent('#fi-perguntas')) && !/TIPO DE CULTURA/.test(await p.textContent('#fi-perguntas')), 'ficha da propriedade pergunta o próprio; "tipo de cultura" sai dos frutos');
  await p.click('#fi-salvar'); await p.waitForSelector('#pce-produtor');
  const pp = await A.imprimir(p, '.pce-visita-termo[data-modelo=propriedade] [data-cad=pdfficha]');
  ok(/PROPRIEDADE DE INTERESSE DA DEFESA VEGETAL/.test(pp.texto) && /Açaí/.test(pp.texto), 'PDF da ficha da propriedade lista o Açaí');

  console.log('5) planilha, editar a ficha e ficha antiga');
  await A.sync(p);
  const cads = await A.aba('CadastrosPCE');
  ok(cads.length === 5 && cads.filter(c => c.programa === 'soja' || c.programa === 'banana').every(c => c.numeroTxt === `001-${ANO}-MANAUS`) && cads.every(c => c.propriedadeId === 'PRP-FIC-1'), 'planilha: 5 fichas ligadas à propriedade, soja e banana nº 001', cads.map(c => c.programa + c.numeroTxt));
  await modelo('soja').locator('[data-cad=ficha]').click(); await p.waitForSelector('#pceFichaForm');
  ok(await p.inputValue('#fi-fornecedor') === 'Cooperativa Ficticia' && /001-/.test(await p.textContent('#pceFichaForm h3')), 'abrir ficha gerada: respostas e número de volta');
  await p.fill('#fi-fornecedor', 'Cooperativa Ficticia Dois'); await p.click('#fi-salvar'); await p.waitForSelector('#pce-produtor'); await A.sync(p);
  const sj = (await A.aba('CadastrosPCE')).find(c => c.programa === 'soja');
  ok(JSON.parse(sj.dados).fornecedor === 'Cooperativa Ficticia Dois' && sj.numeroTxt === `001-${ANO}-MANAUS`, 'editar não muda o número e a planilha recebe a resposta nova');
  // ficha antiga (CadastrosPCE de antes, formato de dados do app anterior): continua abrindo e imprimindo, sem alterar o dado
  const velho = { id: 'cad-antigo-1', programa: 'mandioca', unidade: 'MANAUS', ano: 2025, numero: 7, numeroTxt: '007-2025-MANAUS', propriedadeId: 'PRP-FIC-1', doc: '39053344705', nome: 'JOANA FICTICIA', propriedade: 'Sitio Fichas',
    data: '2025-05-10', hora: '09:00', municipio: 'Manaus', uf: 'AM', servidor: 'Marta Fichas Ficticia', cargo: 'Fiscal', lotacao: 'Manaus', local: 'Manaus/AM',
    dados: JSON.stringify({ culturas: [{ cultivar: 'Amarela', area: '1', espacamento: '1x1', producao: '10' }], estagio: 'vegetativo', destino: 'Feira' }), totalPlantas: 0, fotos: '[]', assinaturas: '{}', documentos: '[]',
    registroAntigo: 0, excluido: 0, pendente: 0, criadoEm: 1, atualizadoEm: 1 };
  await p.evaluate(r => Store.gravar('cadastrosPce', r), velho);
  await p.evaluate(() => go('pceprodutor', '39053344705')); await p.waitForSelector('#pce-produtor');
  ok(/Gerada: nº 007-2025-MANAUS/.test(await modelo('mandioca').textContent()) && await modelo('mandioca').locator('[data-cad=ficha]').count() === 0, 'ficha antiga aparece como gerada, só com PDF (não se refaz nem renumera)');
  const pa = await A.imprimir(p, '.pce-visita-termo[data-modelo=mandioca] [data-cad=pdfficha]');
  ok(/FICHA DE CADASTRO E LEVANTAMENTO DE MANDIOCA/.test(pa.texto) && /Amarela/.test(pa.texto) && /007/.test(pa.texto), 'PDF da ficha antiga no modelo único, com o dado como estava');
  ok((await p.evaluate(() => Store.obter('cadastrosPce', 'cad-antigo-1'))).dados === velho.dados, 'o dado antigo não foi alterado');

  console.log('6) frutos sugeridos pelo histórico só inserem');
  const f2 = await A.aparelho(b, 'Rita Historico Ficticia');
  await A.identificar(f2);
  const lev = { id: 'lev-hist-1', data: '2025-08-10', hora: '09:00', servidor: 'Rita Historico Ficticia', doc: '11144477735', nome: 'Pedro Antigo Ficticio', propriedade: 'Sitio Historico', codigoPropriedade: 'PRP-HIST-1', municipio: 'Manaus',
    culturas: '[]', fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: Date.now(), atualizadoEm: Date.now(),
    pragas: JSON.stringify([{ praga: 'Monilíase do Cacaueiro', culturas: [{ cultura: 'Cacau', area: '2', espLinha: '4', espPlanta: '3', espUnidade: 'm', resultado: 'nao_detectada', coleta: 'Não' }] }]) };
  const tok = (await f2.conta).token;
  let r = await post({ action: 'sync', key: tok, since: 0, levantamentos: [lev], propriedades: [{ id: 'PRP-HIST-1', codigo: 'PRP-HIST-1', nome: 'Sitio Historico', doc: '11144477735', municipio: 'Manaus', criadoEm: Date.now(), atualizadoEm: Date.now() }] });
  ok(r.ok, 'semeia levantamento antigo e propriedade sem frutos no servidor', r);
  await f2.fill('#campoQ', '11144477735'); await f2.waitForSelector('#campo-servidor'); await f2.click('#campo-servidor'); await f2.waitForSelector('#pce-produtor');
  ok(/Há sugestão do histórico: Cacau/.test(await f2.textContent('.pce-prop')) && await f2.locator('.pce-frutos li').count() === 0, 'a tela mostra a sugestão (Cacau), sem tratá-la como cadastro');
  ok((await f2.evaluate(() => Store.obter('propriedades', 'PRP-HIST-1'))).frutos === '' || !(await f2.evaluate(() => Store.obter('propriedades', 'PRP-HIST-1'))).frutos, 'a sugestão não grava nada (só leitura até salvar)');
  await f2.locator('[data-cad=editar][data-prop]').click(); await f2.waitForSelector('#pceProdForm');
  ok(await f2.locator('#pp-sugestao').count() === 1 && await f2.locator('.pc-fruto .f-cultura').inputValue() === 'Cacau' && await f2.locator('.pc-fruto .f-area').inputValue() === '2', 'o formulário traz a sugestão para conferir (Cacau, 2 ha, espaçamento do levantamento)');
  await f2.locator('.pc-fruto .f-area').fill('2,5'); await f2.fill('#pp-nome', 'Pedro Antigo Ficticio'); await f2.click('#pp-salvar'); await f2.waitForSelector('#pce-produtor');
  await A.sync(f2);
  let pr = (await A.aba('Propriedades')).find(x => x.id === 'PRP-HIST-1'), fr = JSON.parse(pr.frutos);
  ok(fr.length === 1 && fr[0].id === 'sug-cacau' && Number(fr[0].area) === 2.5, 'salvou: vira cadastro (id sug-cacau, área editada 2,5)', fr);
  await f2.evaluate(() => go('pce')); await f2.waitForSelector('#campoQ'); await f2.fill('#campoQ', '11144477735'); await f2.waitForTimeout(600);
  await f2.evaluate(async () => { await Campo.consultar('11144477735'); });                 // nova consulta ao servidor: nada sobrescreve o fruto editado
  const loc = await f2.evaluate(async () => { const x = await Store.obter('propriedades', 'PRP-HIST-1'); return { f: JSON.parse(x.frutos), s: x.frutosSugeridos || [] }; });
  ok(loc.f.length === 1 && Number(loc.f[0].area) === 2.5 && !loc.s.length, 'nova consulta: o fruto editado continua e a sugestão não volta', loc);
  ok(p.err.length === 0 && f2.err.length === 0, 'sem erros de JavaScript', [...p.err, ...f2.err]);
  console.log('OK'); await b.close();
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
