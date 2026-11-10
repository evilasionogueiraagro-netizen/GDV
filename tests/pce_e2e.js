const amb = require('./lib/amb');
const A = require('./lib/pce-app');
// PCE simplificado de ponta a ponta: produtor -> propriedade e frutos -> visita em passos -> um Termo por programa (e Termo de Colheita) -> PDFs ->
// planilha. Também: visita sem internet com envio depois, número provisório com conflito entre dois aparelhos, visita negativa, cancelar Termo e
// rascunho automático. App real (Chromium) + Code.gs real (fakegas, Drive falso). Dados fictícios.
const { API } = amb;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' -> ' + JSON.stringify(x).slice(0, 300))); if (!c) throw new Error(m); };
const ANO = new Date().getFullYear();
(async () => {
  const b = await amb.lancar();
  const pA = await A.aparelho(b, 'Pessoa Ficticia Alfa');

  console.log('0) módulo PCE: menu Módulos | Produtores | Termos');
  const tit = await pA.locator('.modulo b').allTextContents();
  ok(tit.length === 3 && tit[2] === 'PCE', 'três módulos no hub: ' + tit.join(' | '));
  ok(/produtores, visitas e Termos de Fiscalização e de Colheita/.test(await pA.textContent('.modulo[data-v=pce]')), 'cartão do PCE descreve o novo fluxo');
  await pA.click('.modulo[data-v=pce]'); await pA.waitForSelector('#pceServForm');
  ok(await pA.locator('#nav button').allTextContents().then(t => t.map(x => x.trim()).join('|')) === 'Módulos|Produtores|Termos', 'menu do módulo: Módulos | Produtores | Termos');
  await pA.click('#pce-s-salvar'); await pA.waitForTimeout(200); ok(/cargo/i.test(await pA.textContent('#toast')) && await pA.locator('#pceServForm').count() === 1, 'sem cargo não salva a identificação');
  await A.identificar(pA);
  ok(/Pessoa Ficticia Alfa/.test(await pA.textContent('.pce-serv')) && await pA.locator('#campo-novo').count() === 1 && await pA.locator('#pce-campo').count() === 1, 'lista de produtores com busca, "Novo produtor" e "Baixar dados para o campo"');

  console.log('1) produtor, propriedade e frutos em um formulário só');
  await A.novoProdutor(pA, { doc: '529.982.247-25', nome: 'raimundo ficticio', propriedade: 'Sitio Boa Vista', codigo: 'PRP-E2E-1', municipio: 'Autazes',
    frutos: [{ cultura: 'Cacau', cultivar: 'Comum', area: '2,5', quantidade: 800 }, { cultura: 'Laranja', cultivar: 'Pera', area: 1, quantidade: 300 }, { cultura: 'Banana', area: 0.5 }] });
  ok(/RAIMUNDO FICTICIO/.test(await pA.textContent('#pce-produtor')) && /529\.982\.247-25/.test(await pA.textContent('#pce-produtor')), 'tela do produtor com nome em maiúsculas e CPF formatado');
  const frs = await pA.locator('.pce-frutos li').allTextContents();
  ok(frs.length === 3 && /Cacau \(Comum\) · 2,5 ha · 800 plantas/.test(frs[0]) && /Banana · 0,5 ha/.test(frs[2]), 'frutos listados na tela do produtor', frs);
  ok(await pA.locator('.pce-visita-termo[data-modelo]').count() === 3 && await pA.locator('#pce-novavisita').count() === 1, 'fichas oficiais por modelo (monilíase, citros, banana) e o botão Nova visita');
  await A.sync(pA);
  let pr = (await A.aba('Propriedades')).find(p => p.id === 'PRP-E2E-1');
  ok(pr && JSON.parse(pr.frutos).length === 3 && pr.doc === '52998224725' && pr.municipio === 'Autazes', 'planilha: propriedade com 3 frutos');
  await pA.evaluate(() => go('pce')); await pA.waitForSelector('#campoQ');
  await pA.fill('#campoQ', 'boa vista'); await pA.waitForSelector('.campo-res-item');
  ok(/RAIMUNDO FICTICIO/.test(await pA.textContent('.campo-res-item')), 'busca por nome da propriedade acha o produtor');
  await pA.fill('#campoQ', '52998'); await pA.waitForSelector('.campo-res-item'); ok(true, 'busca por parte do CPF');

  console.log('2) visita SEM internet: Cacau (monilíase detectada, com amostra) e Laranja (citros, tudo negativo) -> 2 Termos de programas diferentes e 1 de Colheita');
  await pA.ctx.setOffline(true); await pA.evaluate(() => window.dispatchEvent(new Event('offline')));
  await A.abrirProdutor(pA, '52998224725');
  const foto = await A.imagem(pA, 2400, 1800, '#2a7');
  await A.visita(pA, { frutos: ['Cacau', 'Laranja'], resultados: { Cacau: { 'Monilíase do Cacaueiro': 'detectada' } }, amostra: { Cacau: { tipo: 'Folhas e frutos', codigo: 'AM-E2E-1', destino: 'LFDA-GO', qtd: 2 } },
    plantas: { Cacau: 120, Laranja: 80 }, fotos: { Cacau: [{ name: 'fruto.jpg', mimeType: 'image/jpeg', buffer: foto }] } });
  ok(await pA.locator('.pce-termo-pronto').count() === 2 && await pA.locator('.pce-colheita-pronta').count() === 1, 'visita concluída: 2 Termos de Fiscalização e 1 Termo de Colheita');
  const nums = await pA.locator('.pce-termo-pronto .tf-num-inline').allTextContents();
  ok(nums[0] === `001.${ANO}.MANAUS` && nums[1] === `002.${ANO}.MANAUS`, 'números provisórios 001 e 002 (unidade = lotação do servidor)', nums);
  ok(/Aguardando envio \/ número provisório/.test(await pA.textContent('#pce-visita-pronta')), 'aviso de número provisório e aguardando envio');
  const L = await pA.evaluate(async () => ({ t: await Store.todos('termosPce'), c: await Store.todos('colheitas'), a: (await Store.todos('arquivos')).map(x => ({ id: x.id, rotulo: x.rotulo, donoId: x.donoId })) }));
  const tM = L.t.find(t => /Monilíase/.test(t.programaVisita)), tC = L.t.find(t => /Citros/.test(t.programaVisita));
  ok(L.t.length === 2 && tM.visitaId === tC.visitaId && tM.programaVisita === 'Monilíase do Cacaueiro e Cupuaçuzeiro' && tC.programaVisita === 'Pragas dos Citros', 'mesmo visitaId, um Termo por programa do catálogo', L.t.map(t => t.programaVisita));
  ok(tM.pendente === 1 && tM.provisorio === 1 && tM.numeroOrigem === 'provisorio' && tM.propriedadeId === 'PRP-E2E-1' && tM.plantasInspecionadas === 120 && tM.amostra === 'sim' && tM.sintomas === 'sim', 'Termo da monilíase: pendente, provisório, 120 plantas, amostra e sintomas', { p: tM.pendente, pv: tM.provisorio, o: tM.numeroOrigem, id: tM.propriedadeId, pl: tM.plantasInspecionadas, a: tM.amostra, s: tM.sintomas, d: JSON.parse(tM.culturas).map(c => c.dados) });
  ok(tC.plantasInspecionadas === 80 && tC.amostra === 'nao' && tC.sintomas === 'nao', 'Termo de citros: 80 plantas, sem amostra, sem sintomas');
  const cM = JSON.parse(tM.culturas)[0];
  ok(cM.cultura === 'Cacau' && cM.coleta === 'Sim' && cM.codigoAmostra === 'AM-E2E-1' && cM.pragas.length === 1 && cM.pragas[0].resultado === 'detectada' && cM.fotos.length === 1 && cM.dados.qtdAmostras === '2', 'culturas do Termo: resultado, amostra e foto do fruto', cM);
  ok(tM.constatacao === '' && /IN 112 DE 11\/12\/2020/.test(tM.enquadramento), 'sem frase pronta na constatação (o resultado vai nas caixas) e enquadramento da planilha da GDV (detectada)', tM.constatacao);
  ok(tC.constatacao === '' && /IN MAPA nº 21\/2018/.test(tC.enquadramento) && /IN MAPA nº 8\/2012/.test(tC.enquadramento), 'citros negativo: constatação sem frases e enquadramento de todas as avaliadas do programa', tC.constatacao);
  const col = L.c[0];
  ok(L.c.length === 1 && col.levantamentoId === tM.visitaId && col.cultura === 'Cacau' && col.quantidade === 2 && col.numeroTxt === `001/${ANO}/MANAUS` && col.pendente === 1, 'Termo de Colheita nasce da visita (levantamentoId = visitaId)', col);
  ok(L.a.length === 1 && L.a[0].rotulo === 'Cacau' && L.a[0].donoId === tM.visitaId, 'foto do fruto guardada com o rótulo da cultura');

  console.log('3) PDFs pelo modelo único do Termo');
  await pA.locator('.pce-termo-pronto').first().locator('[data-mon=imprimir]').click();
  await pA.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 });
  const imp = await pA.evaluate(() => window.__prints[0]);
  ok(imp.paginas >= 1 && /TERMO DE FISCALIZAÇÃO Nº 001/.test(imp.texto) && new RegExp(`${ANO} Ano - MANAUS Unidade`).test(imp.texto) && /RAIMUNDO FICTICIO/.test(imp.texto) && /Monilíase/.test(imp.texto), 'PDF do Termo: número, produtor e programa', imp.texto.slice(0, 200));
  const cxM = A.caixasDoTermo(imp.html);
  ok(cxM.length === 1 && /^Monilíase do Cacaueiro \(Cacau\):$/.test(cxM[0].linha) && cxM[0].caixas.join() === 'Presença,Ausência,Suspeita' && cxM[0].marcadas.join() === 'Presença', 'PDF do Termo: Monilíase (Cacau) com a caixa Presença marcada', cxM);
  await A.salvarPdf(pA, imp, 'pce-termo.html', 'pce_e2e_termo');
  await pA.evaluate(() => { window.__prints = []; });
  await pA.locator('.pce-termo-pronto').nth(1).locator('[data-mon=imprimir]').click();
  await pA.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 });
  const impC = await pA.evaluate(() => window.__prints[0]), cxC = A.caixasDoTermo(impC.html), esperadas = JSON.parse(tC.culturas).flatMap(c => c.pragas.map(p => p.praga));
  ok(cxC.length === esperadas.length && esperadas.length >= 3 && cxC.every(x => x.marcadas.join() === 'Ausência') && esperadas.every(n => cxC.some(x => x.linha.startsWith(n + ' (Laranja)'))), 'PDF do Termo de citros negativo: toda praga avaliada com a caixa Ausência marcada', cxC);
  const col1 = await A.imprimir(pA, '.pce-colheita-pronta [data-pce=imprimirtermo]');
  ok(new RegExp(`001/${ANO}/MANAUS`).test(col1.texto) && /Cacau/.test(col1.texto), 'PDF do Termo de Colheita');

  console.log('4) volta a internet: tudo sobe, com os números confirmados');
  await pA.ctx.setOffline(false); await pA.evaluate(() => window.dispatchEvent(new Event('online')));
  await A.sync(pA);
  const TP = await A.aba('TermosPCE'), tv = TP.filter(t => t.visitaId === tM.visitaId);
  ok(tv.length === 2 && tv.every(t => t.numeroTxt && t.unidade === 'MANAUS' && Number(t.conflito) !== 1), 'planilha: 2 Termos da visita, sem conflito', tv.map(t => t.numeroTxt));
  const tvM = tv.find(t => /Monilíase/.test(t.programaVisita));
  ok(JSON.parse(tvM.culturas)[0].dados.qtdAmostras === '2' && tvM.amostra === 'sim' && Number(tvM.plantasInspecionadas) === 120, 'planilha: culturas, amostra e plantas do Termo');
  const CO = await A.aba('Colheitas');
  ok(CO.length === 1 && CO[0].levantamentoId === tM.visitaId, 'planilha: Termo de Colheita com o visitaId em levantamentoId');
  const arqs = await A.aba('Arquivos');
  ok(arqs.some(a => a.rotulo === 'Cacau' && a.tipo === 'foto'), 'foto do fruto enviada ao Drive');
  const depois = await pA.evaluate(async () => (await Store.todos('termosPce')).map(t => ({ n: t.numeroTxt, p: t.pendente })));
  ok(depois.every(t => !t.p), 'nada pendente no aparelho', depois);
  await pA.evaluate(() => go('pcetermos')); await pA.waitForSelector('#pceTItens .item');
  ok(await pA.locator('#pceTItens .item').count() === 3 && /Fiscalização/.test(await pA.textContent('#pceTItens')) && /Colheita/.test(await pA.textContent('#pceTItens')), 'lista de Termos junta Fiscalização e Colheita');
  await pA.selectOption('#pceTTipo', 'c'); ok(await pA.locator('#pceTItens .item').count() === 1, 'filtro por tipo');
  await pA.selectOption('#pceTTipo', ''); await pA.fill('#pceTQ', 'citros'); ok(await pA.locator('#pceTItens .item').count() === 1, 'pesquisa por programa');

  console.log('5) dois aparelhos sem internet: número repetido vira conflito ao sincronizar');
  const pB = await A.aparelho(b, 'Pessoa Ficticia Beta');
  await A.identificar(pB); await pB.evaluate(() => Sync.sincronizar()); await pB.waitForTimeout(800);
  await pB.fill('#campoQ', '52998224725'); await pB.waitForSelector('#campo-servidor'); await pB.click('#campo-servidor'); await pB.waitForSelector('#pce-produtor');
  ok(await pB.locator('.pce-frutos li').count() === 3, 'segundo aparelho consulta o servidor e recebe produtor, propriedade e frutos');
  await pB.ctx.setOffline(true); await pB.evaluate(() => window.dispatchEvent(new Event('offline')));
  await A.visita(pB, { frutos: ['Banana'], resultados: { Banana: { 'Moko da Bananeira': 'nao_detectada' } } });
  const nB = await pB.locator('.pce-termo-pronto .tf-num-inline').allTextContents();
  ok(nB.length === 1 && nB[0] === `003.${ANO}.MANAUS`, 'Bruno sabe até o nº 002 (sync): provisório 003', nB);
  // Ana, ainda online, usa o 003 antes
  await A.abrirProdutor(pA, '52998224725');
  await A.visita(pA, { frutos: ['Banana'], resultados: { Banana: { 'Moko da Bananeira': 'nao_detectada' } } });
  ok((await pA.locator('.pce-termo-pronto .tf-num-inline').first().textContent()) === `003.${ANO}.MANAUS`, 'Ana grava o 003 na planilha primeiro');
  await pB.ctx.setOffline(false); await pB.evaluate(() => window.dispatchEvent(new Event('online'))); await A.sync(pB);
  const tb = await pB.evaluate(async () => (await Store.todos('termosPce')).find(t => t.visitaId && t.pendente !== 1 && /Bananeira/.test(t.programaVisita)));
  ok(tb && Number(tb.conflito) === 1, 'o Termo repetido de Bruno volta marcado com conflito', tb && { n: tb.numeroTxt, c: tb.conflito });
  await pB.evaluate(() => go('pcetermos')); await pB.waitForSelector('#pceTItens .item');
  ok(/Número duplicado na planilha/.test(await pB.textContent('#pceTItens')), 'a lista avisa: número duplicado, confira com a coordenação');

  console.log('6) cancelar Termo (mantém o número) e rascunho automático da visita');
  await pA.evaluate(() => go('pcetermos')); await pA.waitForSelector('#pceTItens .item');
  await pA.locator('#pceTItens .item', { hasText: `002.${ANO}.MANAUS` }).locator('[data-mon=cancelar]').click(); await pA.waitForTimeout(500);
  await A.sync(pA);
  ok(/CANCELADO: digitação errada/.test(await pA.textContent('#pceTItens')), 'Termo cancelado aparece com o motivo');
  const canc = (await A.aba('TermosPCE')).find(t => t.numeroTxt === `002.${ANO}.MANAUS`);
  ok(Number(canc.cancelado) === 1 && canc.motivoCancel === 'digitação errada', 'planilha: cancelado, número continua usado');
  await A.abrirProdutor(pA, '52998224725');
  await pA.locator('#pce-novavisita').first().click(); await pA.waitForSelector('#pceVisitaForm');
  await pA.locator('label.vi-fruto', { hasText: 'Cacau' }).locator('input').check(); await pA.click('#vi-continuar'); await pA.waitForSelector('.pce-pr');
  await pA.locator('.pce-pr[data-nome="Monilíase do Cacaueiro"] .pce-res-suspeita').click(); await pA.waitForTimeout(900);
  await pA.reload(); await pA.waitForSelector('.modulo[data-v=pce]');
  await pA.evaluate(async () => { const r = await Store.meta('pceVisitaRascunho'); go('pcevisita', { doc: r.doc, propId: r.propId }); }); await pA.waitForSelector('#pceVisitaForm');
  ok(/Passo 2 de 5/.test(await pA.textContent('.pce-passos')) && await pA.locator('.pce-pr[data-nome="Monilíase do Cacaueiro"] .r-res[value=suspeita]:checked').count() === 1, 'rascunho automático: volta no passo 2 com a resposta marcada');
  await pA.click('[data-mon=vi-cancelar]'); await pA.waitForSelector('#pce-produtor');
  ok(await pA.evaluate(async () => (await Store.meta('pceVisitaRascunho')) == null), 'cancelar a visita apaga o rascunho');

  ok(pA.err.length === 0 && pB.err.length === 0, 'sem erros de JavaScript', [...pA.err, ...pB.err]);
  console.log('OK'); await b.close();
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
