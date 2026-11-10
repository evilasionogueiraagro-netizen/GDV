const amb = require('./lib/amb');
const A = require('./lib/pce-app');
// PCE — praga "opcional" do catálogo (Fusariose, Moko, Sigatoka, Pinta Preta, Leprose, Diaphorina, Amaranthus) na Nova visita: é um campo de duas
// opções ("Não tem" / "Tem"), já marcado "Não tem"; conta como praga avaliada no Termo do programa (caixa do quadro, caixas Presença/Ausência na descrição
// da ação e enquadramento legal). A constatação não vem mais com frases prontas: o resultado de cada praga sai nas caixas do Termo, sem Suspeita nas opcionais. Rascunho antigo com a opcional em branco abre como "Não tem". Dados fictícios.
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 1200))); if (!c) falhas++; };

(async () => {
  const b = await amb.lancar();
  const p = await A.aparelho(b, 'Fiscal Opcionais Teste');
  await A.identificar(p);
  await A.novoProdutor(p, { doc: '52998224725', nome: 'Produtor Ficticio Opcionais', propriedade: 'Sitio Ficticio Opcionais', codigo: 'PRP-OPC-1', municipio: 'Manaus',
    frutos: [{ cultura: 'Banana', area: 1 }, { cultura: 'Soja', area: 2 }, { cultura: 'Laranja', area: 1 }] });
  const L = await p.evaluate(() => CONFIG.PCE.legislacao);
  const lin = (...n) => n.map(x => L[x]).join('\n');
  const mesmas = (a, b2) => JSON.stringify(a.split('\n').sort()) === JSON.stringify(b2.split('\n').sort());
  ok(L['Fusarium R4T'] && L['Amaranthus palmeri'] && L['Phakopsora pachyrhizi'] && !L['Moko da Bananeira'] && !L['Sigatoka Negra'], 'base do teste: Fusariose, Amaranthus e Ferrugem têm enquadramento; Moko e Sigatoka não');

  /** Visita até o passo 4 (lê constatação e enquadramento da tela) e concluída (lê o Termo gravado). */
  const visita = async (fruto, resultados) => {
    const antes = await p.evaluate(async () => (await Store.todos('termosPce')).map(t => t.id));
    await A.visita(p, { frutos: [fruto], resultados: { [fruto]: resultados || {} }, parar: 4 });
    const cons = await p.locator('textarea[data-prog]').first().inputValue(), res = await p.locator('.vi-resultados li').allTextContents();
    const enq = await p.locator('.vi-enq').first().evaluate(e => { e.querySelectorAll('br').forEach(br => br.replaceWith('\n')); return e.textContent; });
    await p.click('#vi-continuar'); await p.waitForSelector('#vi-resumo'); await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta', { timeout: 20000 });
    const termos = await p.evaluate(async antes => (await Store.todos('termosPce')).filter(t => t.visitaId && !antes.includes(t.id)), antes);
    const cx = A.caixasDoTermo((await A.imprimir(p, '.pce-termo-pronto [data-mon=imprimir]')).html);
    return { cons, res, enq, termos, cx };
  };

  console.log('1) banana com tudo "Não tem": Termo de Pragas da Bananeira com a Fusariose marcada, constatação e enquadramento das avaliadas');
  await p.locator('#pce-novavisita').first().click(); await p.waitForSelector('#pceVisitaForm');
  await p.locator('label.vi-fruto', { hasText: 'Banana' }).locator('input').check(); await p.click('#vi-continuar'); await p.waitForSelector('.pce-pr');
  const opc = p.locator('.pce-pr[data-opcional]');
  ok(await p.locator('.pce-pr').count() === 3 && await opc.count() === 3, 'banana: Fusariose, Moko e Sigatoka, todas opcionais');
  ok(await opc.locator('.pce-res-nao_detectada input:checked').count() === 3 && await opc.locator('.pce-res-detectada input:checked').count() === 0, 'as 3 vêm marcadas "Não tem" sem a pessoa tocar');
  ok((await opc.first().locator('.pce-res-op label').allTextContents()).join('|') === 'Não tem|Tem' && (await opc.first().locator('legend').textContent()).trim() === 'Resultado', 'campo de duas opções "Não tem" e "Tem", legenda sem "(opcional)"');
  ok(!/em branco|opcional/i.test(await opc.first().locator('.pce-pr-cat').textContent()), 'o selo ao lado do nome não sugere deixar em branco', await opc.first().locator('.pce-pr-cat').textContent());
  await p.click('#vi-continuar'); await p.waitForSelector('.v-plantas'); await p.click('#vi-continuar'); await p.waitForSelector('#vi-local');
  const consB = await p.locator('textarea[data-prog]').first().inputValue(), resB = await p.locator('.vi-resultados li').allTextContents();
  const enqB = await p.locator('.vi-enq').first().evaluate(e => { e.querySelectorAll('br').forEach(br => br.replaceWith('\n')); return e.textContent; });
  ok(resB.join('|') === 'Fusarium R4T (Banana): Ausência|Moko da Bananeira (Banana): Ausência|Sigatoka Negra (Banana): Ausência', 'passo 4: lista só de leitura com o resultado das 3 (Ausência), para as caixas do Termo', resB);
  ok(consB === '' && /Observações sobre a situação constatada \(opcional\)/.test(await p.textContent('.pce-prog')) && !/Constatei|Ausência de sintomas/.test(consB), 'campo de texto vazio, sem frase pronta, chamado "Observações sobre a situação constatada (opcional)"', consB);
  ok(mesmas(enqB, lin('Fusarium R4T')), 'enquadramento: o das avaliadas do programa (só a Fusariose tem texto no catálogo)', enqB);
  await p.click('#vi-continuar'); await p.waitForSelector('#vi-resumo'); await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta', { timeout: 20000 });
  const tB = await p.evaluate(async () => (await Store.todos('termosPce')).filter(t => t.visitaId));
  ok(tB.length === 1 && tB[0].programaVisita === 'Pragas da Bananeira', 'um Termo só: Pragas da Bananeira (as opcionais não geram Termo extra)', tB.map(t => t.programaVisita));
  ok(JSON.parse(tB[0].pragas).join() === 'Fusariose FOC R4T' && mesmas(tB[0].enquadramento, lin('Fusarium R4T')), 'Termo gravado: caixa Fusariose FOC R4T marcada (Moko e Sigatoka não têm caixa) e enquadramento', { p: tB[0].pragas });
  const cs = JSON.parse(tB[0].culturas)[0].pragas;
  ok(cs.length === 3 && cs.every(x => x.resultado === 'nao_detectada'), 'cultura do Termo: as 3 pragas avaliadas como não detectadas', cs);
  const pr = await A.imprimir(p, '.pce-termo-pronto [data-mon=imprimir]');
  const marcadas = await p.evaluate(h => [...new DOMParser().parseFromString(h, 'text/html').querySelectorAll('[data-x^="pragas="].on')].map(e => e.getAttribute('data-x')), pr.html);
  ok(marcadas.join() === 'pragas=Fusariose FOC R4T', 'PDF do Termo: só a caixa Fusariose FOC R4T marcada no quadro de pragas', marcadas);
  const cxB = A.caixasDoTermo(pr.html);
  ok(cxB.length === 3 && cxB.every(x => x.caixas.join() === 'Presença,Ausência' && x.marcadas.join() === 'Ausência') && cxB.map(x => x.linha).join('|') === 'Fusarium R4T (Banana):|Moko da Bananeira (Banana):|Sigatoka Negra (Banana):', 'PDF do Termo: as 3 opcionais com só Presença e Ausência (sem Suspeita), Ausência marcada', cxB);
  ok(!/Não constatei a presença/.test(pr.texto), 'PDF do Termo: sem frase pronta de constatação');
  await A.salvarPdf(p, pr, 'pce-termo.html', 'pce_opcionais_termo_banana');

  console.log('2) "Tem" abre os campos de detecção; enquadramento só das detectadas');
  await A.abrirProdutor(p, '52998224725');
  const s1 = await visita('Soja', { 'Phakopsora pachyrhizi': 'nao_detectada', 'Amaranthus palmeri': 'detectada' });
  ok(s1.res.join('|') === 'Phakopsora pachyrhizi (Soja): Ausência|Amaranthus palmeri (Soja): Presença' && s1.cons === '', '"Tem": o Amaranthus aparece como Presença e a obrigatória Ferrugem como Ausência (sem texto pronto)', [s1.res, s1.cons]);
  const marc = x => x.map(c => c.linha + ' ' + c.caixas.join('/') + ' => ' + c.marcadas.join()).join(' | ');
  ok(marc(s1.cx) === 'Phakopsora pachyrhizi (Soja): Presença/Ausência/Suspeita => Ausência | Amaranthus palmeri (Soja): Presença/Ausência => Presença', 'PDF do Termo: Ferrugem (obrigatória) com 3 caixas e Ausência marcada; Amaranthus (opcional) com 2 caixas e Presença marcada', marc(s1.cx));
  ok(mesmas(s1.enq, lin('Amaranthus palmeri')) && mesmas(s1.termos[0].enquadramento, lin('Amaranthus palmeri')), 'enquadramento só da detectada (Amaranthus), na tela e no Termo', s1.enq);
  ok(JSON.parse(s1.termos[0].pragas).join() === 'Ferrugem Asiática da soja,Amaranthus palmeri', 'Termo de soja: caixas da Ferrugem e do Amaranthus marcadas', s1.termos[0].pragas);
  ok(s1.termos.length === 1 && s1.termos[0].programaVisita === 'Pragas da Soja', 'um Termo só (Pragas da Soja)', s1.termos.map(t => t.programaVisita));
  await A.abrirProdutor(p, '52998224725');
  const s2 = await visita('Soja', { 'Phakopsora pachyrhizi': 'detectada' });
  ok(s2.res.join('|') === 'Phakopsora pachyrhizi (Soja): Presença|Amaranthus palmeri (Soja): Ausência' && marc(s2.cx) === 'Phakopsora pachyrhizi (Soja): Presença/Ausência/Suspeita => Presença | Amaranthus palmeri (Soja): Presença/Ausência => Ausência', 'obrigatória detectada e opcional intocada: Ferrugem em Presença e Amaranthus em Ausência (lista e caixas do Termo)', [s2.res, marc(s2.cx)]);
  ok(mesmas(s2.enq, lin('Phakopsora pachyrhizi')) && mesmas(s2.termos[0].enquadramento, lin('Phakopsora pachyrhizi')), 'enquadramento só da detectada (Ferrugem), sem o do Amaranthus "Não tem"', s2.enq);

  const ids = () => p.evaluate(async () => (await Store.todos('termosPce')).map(t => t.id));
  const novo = async antes => (await p.evaluate(async antes => (await Store.todos('termosPce')).filter(t => t.visitaId && !antes.includes(t.id)), antes))[0];
  console.log('3) campos do "Tem" (há quanto tempo e controle) e validação');
  await A.abrirProdutor(p, '52998224725'); const antesM = await ids();
  await p.locator('#pce-novavisita').first().click(); await p.waitForSelector('#pceVisitaForm');
  await p.locator('label.vi-fruto', { hasText: 'Banana' }).locator('input').check(); await p.click('#vi-continuar'); await p.waitForSelector('.pce-pr');
  const moko = p.locator('.pce-pr[data-nome="Moko da Bananeira"]');
  ok(await moko.locator('.vi-det').count() === 0, '"Não tem": sem campos de detecção');
  await moko.locator('.pce-res-detectada').click();
  ok(await moko.locator('.r-tempo').count() === 1 && await moko.locator('fieldset[data-k=c]').count() === 1 && await moko.locator('.r-qual').count() === 1, '"Tem": abre "há quanto tempo", "utiliza controle?" e "qual controle"');
  await moko.locator('.r-tempo').fill('10 dias'); await moko.locator('fieldset[data-k=c] label:has(input[value=sim])').click();
  await p.click('#vi-continuar'); ok(/Informe qual controle é usado para Moko/.test(await p.textContent('#toast')), 'controle "sim" exige o nome do controle', await p.textContent('#toast'));
  await moko.locator('.r-qual').fill('Eliminação das plantas');
  await p.click('#vi-continuar'); await p.waitForSelector('.v-plantas'); await p.click('#vi-continuar'); await p.waitForSelector('#vi-local');
  const resM = await p.locator('.vi-resultados li').allTextContents();
  ok(resM.includes('Moko da Bananeira (Banana): Presença') && resM.includes('Sigatoka Negra (Banana): Ausência'), 'Moko "Tem": a lista do passo 4 mostra Moko em Presença e Sigatoka em Ausência', resM);
  await p.click('#vi-continuar'); await p.waitForSelector('#vi-resumo'); await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta', { timeout: 20000 });
  const cxMoko = A.caixasDoTermo((await A.imprimir(p, '.pce-termo-pronto [data-mon=imprimir]')).html);
  ok(marc(cxMoko) === 'Fusarium R4T (Banana): Presença/Ausência => Ausência | Moko da Bananeira (Banana): Presença/Ausência => Presença | Sigatoka Negra (Banana): Presença/Ausência => Ausência', 'PDF do Termo de banana com Moko: Presença marcada no Moko (2 caixas) e Ausência nas outras', marc(cxMoko));
  const tM = await novo(antesM);
  const pm = JSON.parse(tM.culturas)[0].pragas.find(x => x.praga === 'Moko da Bananeira');
  ok(pm.resultado === 'detectada' && pm.haQuantoTempo === '10 dias' && pm.controle === 'Sim' && pm.qualControle === 'Eliminação das plantas', 'Termo grava o resultado, há quanto tempo e o controle do Moko', pm);
  // regra do usuário (09/11/2026): na banana o enquadramento é só o da Fusariose; Moko e Sigatoka ficam como registro na constatação
  ok(mesmas(tM.enquadramento, lin('Fusarium R4T')), 'Moko "Tem": o enquadramento continua só o da Fusariose (Moko e Sigatoka são registro)', tM.enquadramento);

  console.log('4) rascunho antigo com a opcional em branco abre como "Não tem"');
  await A.abrirProdutor(p, '52998224725'); const antesR = await ids();
  await A.visita(p, { frutos: ['Banana'], parar: 2 });
  for (let i = 0; i < 50 && !(await p.evaluate(async () => { const r = await Store.meta('pceVisitaRascunho'); return !!(r && r.passo === 2); })); i++) await p.waitForTimeout(100);
  const idsPragas = await p.locator('.pce-pr[data-opcional]').evaluateAll(l => l.map(e => e.dataset.praga));
  await p.evaluate(async idsPragas => {                // como um rascunho de versão antiga: uma opcional com resultado vazio, outra sem registro nenhum, outra só com o resto
    const r = await Store.meta('pceVisitaRascunho'), f = Object.values(r.F)[0];
    f.pragas = { [idsPragas[0]]: { resultado: '', haQuantoTempo: '', controle: '', qualControle: '' }, [idsPragas[2]]: { resultado: '' } }; await Store.setMeta('pceVisitaRascunho', r);
  }, idsPragas);
  await p.reload(); await p.waitForSelector('.modulo[data-v=pce]');
  await p.evaluate(async () => { const r = await Store.meta('pceVisitaRascunho'); go('pcevisita', { doc: r.doc, propId: r.propId }); }); await p.waitForSelector('#pceVisitaForm');
  ok(/Passo 2 de 5/.test(await p.textContent('.pce-passos')) && await p.locator('.pce-pr[data-opcional] .pce-res-nao_detectada input:checked').count() === 3, 'rascunho retomado: as 3 opcionais (vazia e sem registro) abrem como "Não tem"');
  await p.click('#vi-continuar'); await p.waitForSelector('.v-plantas'); await p.click('#vi-continuar'); await p.waitForSelector('#vi-local');
  ok((await p.locator('.vi-resultados li').allTextContents()).includes('Fusarium R4T (Banana): Ausência'), 'segue para o Termo sem pedir resposta: a Fusariose entra como avaliada (Ausência)');
  await p.click('#vi-continuar'); await p.waitForSelector('#vi-resumo'); await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta', { timeout: 20000 });
  const tR = await novo(antesR);
  ok(JSON.parse(tR.pragas).join() === 'Fusariose FOC R4T' && JSON.parse(tR.culturas)[0].pragas.every(x => x.resultado === 'nao_detectada'), 'Termo do rascunho antigo: Fusariose marcada e as 3 como não detectadas', tR.pragas);

  console.log('5) citros: HLB, ácaro e cancro (obrigatórias, com Suspeita) e as opcionais (só Presença e Ausência) nas caixas do Termo');
  await A.abrirProdutor(p, '52998224725');
  await p.locator('#pce-novavisita').first().click(); await p.waitForSelector('#pceVisitaForm');
  await p.locator('label.vi-fruto', { hasText: 'Laranja' }).locator('input').check();
  await p.click('#vi-continuar'); await p.waitForSelector('.pce-pr');
  for (const n of ['HLB / Greening', 'Schizotetranychus hindustanicus', 'Cancro Cítrico']) await p.locator(`.pce-pr[data-nome="${n}"] .pce-res-nao_detectada`).click();
  await p.locator('.pce-pr[data-nome="Pinta Preta dos Citros"] .pce-res-detectada').click();
  await p.click('#vi-continuar'); await p.waitForSelector('.v-plantas'); await p.click('#vi-continuar'); await p.waitForSelector('#vi-local');
  const resC = await p.locator('.vi-resultados li').allTextContents(), consC = await p.locator('textarea[data-prog]').first().inputValue();
  ok(consC === '' && resC.includes('HLB / Greening (Laranja): Ausência') && resC.includes('Pinta Preta dos Citros (Laranja): Presença') && resC.includes('Leprose dos Citros (Laranja): Ausência') && resC.includes('Diaphorina citri (vetor do HLB) (Laranja): Ausência'), 'citros: lista de leitura com o resultado das obrigatórias e das opcionais, sem texto pronto', [resC, consC]);
  await p.click('#vi-continuar'); await p.waitForSelector('#vi-resumo'); await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta', { timeout: 20000 });
  const cxC = A.caixasDoTermo((await A.imprimir(p, '.pce-termo-pronto [data-mon=imprimir]')).html), por = n => cxC.find(x => x.linha.startsWith(n + ' '));
  ok(['HLB / Greening', 'Schizotetranychus hindustanicus', 'Cancro Cítrico'].every(n => por(n) && por(n).caixas.join() === 'Presença,Ausência,Suspeita' && por(n).marcadas.join() === 'Ausência') && por('Pinta Preta dos Citros').caixas.join() === 'Presença,Ausência' && por('Pinta Preta dos Citros').marcadas.join() === 'Presença'
    && por('Leprose dos Citros').caixas.join() === 'Presença,Ausência' && por('Diaphorina citri (vetor do HLB)').marcadas.join() === 'Ausência', 'PDF do Termo de citros: as 3 obrigatórias com Suspeita e Ausência marcada; Pinta Preta em Presença; Leprose e Diaphorina só com 2 caixas', marc(cxC));
  ok(p.err.length === 0, 'sem erros de JavaScript', p.err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
