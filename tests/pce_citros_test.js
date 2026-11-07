const amb = require('./lib/amb');
const A = require('./lib/pce-app');
// PCE — citros na visita (IN 21/2018 cancro cítrico e Portaria 317/2021 HLB): HLB, ácaro hindustânico e cancro obrigatórios; a Diaphorina (vetor) é opcional
// e não marca o HLB; Termo do programa com as frases de ausência/presença, o enquadramento só do que foi detectado e o local especificado; ficha oficial
// de citros gerada do cadastro (frutos e levantamento da visita). Sem internet e planilha. App real + Code.gs real no fakegas. Dados fictícios.
// Com GDV_SAIDA_CITROS=<pasta> copia as capturas (telas a 400 px e as páginas dos PDFs).
const fs = require('fs');
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' -> ' + JSON.stringify(x).slice(0, 400))); if (!c) throw new Error(m); };
const ANO = new Date().getFullYear();
const CAN = 'IN MAPA nº 21/2018; IN SDA/MAPA nº 38', HLB = 'Portaria SDA/MAPA nº 1.326';
(async () => {
  const b = await amb.lancar();
  const p = await A.aparelho(b, 'Paulo Citros Ficticio');
  await A.identificar(p);
  const tira = nome => { if (process.env.GDV_SAIDA_CITROS) { fs.mkdirSync(process.env.GDV_SAIDA_CITROS, { recursive: true }); return p.screenshot({ path: process.env.GDV_SAIDA_CITROS + '/' + nome + '.png', fullPage: true }); } };

  console.log('1) cadastro: produtor de citros com os frutos da propriedade');
  await A.novoProdutor(p, { doc: '123.456.789-09', nome: 'Paulo Ficticio Citricultor', propriedade: 'Sitio Laranjal', codigo: 'PRP-CIT-1', municipio: 'Presidente Figueiredo',
    frutos: [{ cultura: 'Laranja', cultivar: 'Laranja Pera', area: 4, quantidade: 1200 }, { cultura: 'Limão', cultivar: 'Limão Tahiti', area: 1.5, quantidade: 300 }] });
  await tira('01-produtor-citros');
  ok(await p.locator('.pce-visita-termo[data-modelo=citros]').count() === 1 && await p.locator('.pce-visita-termo[data-modelo]').count() === 1, 'uma só ficha na tela: a de citros (os dois frutos são de citros)');

  console.log('2) visita: obrigatórias; Diaphorina detectada não marca o HLB; cancro detectado');
  await p.locator('#pce-novavisita').click(); await p.waitForSelector('#pceVisitaForm');
  await p.locator('label.vi-fruto', { hasText: 'Laranja' }).locator('input').check(); await p.locator('label.vi-fruto', { hasText: 'Limão' }).locator('input').check();
  await p.click('#vi-continuar'); await p.waitForSelector('.pce-pr');
  const lar = A.bloco(p, 'Laranja'), lim = A.bloco(p, 'Limão');
  ok(await lar.locator('.pce-pr').count() === 6 && await lim.locator('.pce-pr').count() === 6, 'os dois frutos de citros trazem as mesmas 6 pragas do catálogo');
  for (const fruto of [lar, lim]) for (const n of ['HLB / Greening', 'Schizotetranychus hindustanicus', 'Cancro Cítrico'])
    ok(/\*/.test(await fruto.locator(`.pce-pr[data-nome="${n}"] legend`).textContent()), 'obrigatória: ' + n);
  await p.click('#vi-continuar'); ok(/Informe o resultado de (HLB|Schizotetranychus|Cancro)/.test(await p.textContent('#toast')), 'sem responder as três obrigatórias não avança', await p.textContent('#toast'));
  const r = (f, n, res) => f.locator(`.pce-pr[data-nome="${n}"] .pce-res-${res}`).click();
  await r(lar, 'HLB / Greening', 'nao_detectada'); await r(lar, 'Schizotetranychus hindustanicus', 'nao_detectada'); await r(lar, 'Cancro Cítrico', 'detectada');
  await lar.locator('.r-tempo').fill('1 mês'); await r(lar, 'Diaphorina citri (vetor do HLB)', 'detectada');
  for (const n of ['HLB / Greening', 'Schizotetranychus hindustanicus', 'Cancro Cítrico']) await r(lim, n, 'nao_detectada');
  await tira('02-pragas-citros');
  await p.click('#vi-continuar'); await p.waitForSelector('.v-plantas');
  await lar.locator('.v-plantas').fill('200');
  await p.click('#vi-continuar'); await p.waitForSelector('#vi-local');
  const txt = await p.inputValue('textarea[data-prog]');
  ok(/Presença de sintomas de Cancro Cítrico nos frutos e folhas da cultura Laranja e Limão\./.test(txt) && /Ausência de sintomas de HLB nos frutos e folhas/.test(txt) && /Ausência de sintomas de Ácaro Hindustânico/.test(txt), 'frases de ausência/presença das três doenças', txt);
  ok(!/Presença de sintomas de HLB/.test(txt) && /Praga opcional Diaphorina citri \(vetor do HLB\): Detectada em Laranja\./.test(txt), 'Diaphorina detectada NÃO marca presença de HLB e entra como praga opcional', txt);
  const enq = await p.textContent('.vi-enq');
  ok(enq.includes(CAN) && !enq.includes(HLB), 'enquadramento: só o das pragas detectadas (cancro), sem o do HLB', enq);
  await tira('03-constatacao-citros');
  await p.click('#vi-continuar'); await p.waitForSelector('#vi-resumo'); await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta');
  ok(await p.locator('.pce-termo-pronto').count() === 1 && /Pragas dos Citros/.test(await p.textContent('.pce-termo-pronto')), 'um Termo só: o programa Pragas dos Citros (com Laranja e Limão)');
  await tira('04-visita-pronta');

  console.log('3) Termo de citros: PDF, planilha e sem internet');
  const pr = await A.imprimir(p, '.pce-termo-pronto [data-mon=imprimir]');
  ok(/TERMO DE FISCALIZAÇÃO Nº 001/.test(pr.texto) && /Sitio Laranjal/.test(pr.texto) && /Presença de sintomas de Cancro Cítrico/.test(pr.texto) && /IN MAPA nº 21\/2018/.test(pr.texto), 'PDF no modelo único: número, local, frases e enquadramento', pr.texto.slice(0, 500));
  await A.salvarPdf(p, pr, 'pce-termo.html', 'pce_citros_termo');
  if (process.env.GDV_SAIDA_CITROS) fs.copyFileSync(amb.saida('pce_citros_termo.png'), process.env.GDV_SAIDA_CITROS + '/05-termo-citros.png');
  await A.sync(p);
  const t = (await A.aba('TermosPCE'))[0];
  ok(t.programa === 'citros' && t.programaVisita === 'Pragas dos Citros' && t.numeroTxt === `001.${ANO}.MANAUS` && JSON.parse(t.culturas).length === 2 && JSON.parse(t.tipoLocal)[0].startsWith('Propriedade Sitio Laranjal'), 'planilha: programa citros, 2 culturas, local especificado', { p: t.programa, n: t.numeroTxt });
  ok(JSON.parse(t.pragas).includes('HLB') && JSON.parse(t.pragas).includes('Cancro Cítrico') && JSON.parse(t.pragas).includes('Ácaro Hindustânico'), 'planilha: quadro de pragas do Termo com HLB, ácaro e cancro', t.pragas);
  await p.ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await A.abrirProdutor(p, '12345678909');
  await A.visita(p, { frutos: ['Limão'], padrao: 'nao_detectada' });
  ok((await p.locator('.pce-termo-pronto .tf-num-inline').first().textContent()) === `002.${ANO}.MANAUS` && /provisório/.test(await p.textContent('#pce-visita-pronta')), 'sem internet: Termo 002 provisório (visita negativa de citros)');
  const neg = await p.evaluate(async () => (await Store.todos('termosPce')).find(x => x.numeroTxt && x.pendente));
  ok(/Ausência de sintomas de HLB/.test(neg.constatacao) && !/Presença/.test(neg.constatacao) && neg.sintomas === 'nao', 'visita negativa de citros: só ausência');
  ok(neg.enquadramento.includes(CAN) && neg.enquadramento.includes(HLB) && /IN MAPA nº 8\/2012/.test(neg.enquadramento), 'sem detecção: enquadramento de todas as avaliadas do programa (HLB, cancro e ácaro)', neg.enquadramento);
  await p.ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online'))); await A.sync(p);

  console.log('4) ficha oficial de citros: gerada do cadastro, com o levantamento da visita mais recente');
  await A.abrirProdutor(p, '12345678909');
  await p.locator('.pce-visita-termo[data-modelo=citros] [data-cad=ficha]').click(); await p.waitForSelector('#pceFichaForm');
  const perg = await p.locator('#fi-perguntas .mon-sn legend, #fi-perguntas .mon-sub').allTextContents();
  ok(perg.some(x => /TIPO DE ATIVIDADE/.test(x)) && perg.some(x => /Material de propagação/.test(x)) && perg.some(x => /Entrega na propriedade/.test(x)), 'a ficha pergunta só o que é do citros (atividade, entrega, compradores, material)', perg);
  ok(!(await p.textContent('#fi-perguntas')).match(/CPF|Telefone|Município|Cultivar|Área \(ha\)/), 'não repete o que já está no cadastro (produtor, propriedade, frutos)');
  await p.locator('#fi-perguntas input[name="fi-atividades"][value=frutos]').check();
  await p.locator('#fi-perguntas fieldset[data-k=entrega] label:has(input[value=nao])').click();
  await p.locator('#fi-perguntas input[name="fi-compradores"][value=feira]').check();
  await p.fill('#fi-origemMaterial', 'Viveiro fictício credenciado');
  await tira('06-ficha-citros');
  await p.click('#fi-salvar'); await p.waitForSelector('#pce-produtor');
  ok(new RegExp(`Gerada: nº 001-${ANO}-MANAUS`).test(await p.textContent('.pce-visita-termo[data-modelo=citros]')), 'ficha numerada por programa, unidade e ano');
  const pf = await A.imprimir(p, '.pce-visita-termo[data-modelo=citros] [data-cad=pdfficha]');
  ok(/CADASTRO DE IMÓVEIS DE PRODUÇÃO COMERCIAL DE CÍTRICOS/.test(pf.texto) && /Laranja Pera/.test(pf.texto) && /Limão Tahiti/.test(pf.texto) && /TOTAL/.test(pf.texto) && /Viveiro fictício credenciado/.test(pf.texto), 'PDF da ficha: título oficial, tabela dos frutos e respostas', pf.texto.slice(0, 600));
  ok(/Cancro Cítrico/.test(pf.texto) && /HLB/.test(pf.texto), 'quadro do levantamento com cancro, HLB e ácaro');
  await A.salvarPdf(p, pf, 'pce-ficha.html', 'pce_citros_ficha');
  if (process.env.GDV_SAIDA_CITROS) fs.copyFileSync(amb.saida('pce_citros_ficha.png'), process.env.GDV_SAIDA_CITROS + '/07-ficha-citros.png');
  await A.sync(p);
  const cad = (await A.aba('CadastrosPCE'))[0];
  ok(cad && cad.programa === 'citros' && cad.numeroTxt === `001-${ANO}-MANAUS` && JSON.parse(cad.dados).fichaNova === 1 && JSON.parse(cad.dados).atividades.includes('frutos'), 'planilha: ficha de citros (programa citros, respostas)', cad && cad.numeroTxt);
  ok(p.err.length === 0, 'sem erros de JavaScript', p.err);
  console.log('OK'); await b.close();
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
