const amb = require('./lib/amb');
const A = require('./lib/pce-app');
// PCE — praga "opcional" do catálogo (Fusariose, Moko, Sigatoka, Pinta Preta, Leprose, Diaphorina, Amaranthus) na Nova visita: é um campo de duas
// opções ("Não tem" / "Tem"), já marcado "Não tem"; conta como praga avaliada no Termo do programa (caixa do quadro, constatação com a redação das
// outras pragas e enquadramento legal). Rascunho antigo com a opcional em branco abre como "Não tem". Dados fictícios.
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
    const cons = await p.locator('textarea[data-prog]').first().inputValue();
    const enq = await p.locator('.vi-enq').first().evaluate(e => { e.querySelectorAll('br').forEach(br => br.replaceWith('\n')); return e.textContent; });
    await p.click('#vi-continuar'); await p.waitForSelector('#vi-resumo'); await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta', { timeout: 20000 });
    const termos = await p.evaluate(async antes => (await Store.todos('termosPce')).filter(t => t.visitaId && !antes.includes(t.id)), antes);
    return { cons, enq, termos };
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
  const consB = await p.locator('textarea[data-prog]').first().inputValue();
  const enqB = await p.locator('.vi-enq').first().evaluate(e => { e.querySelectorAll('br').forEach(br => br.replaceWith('\n')); return e.textContent; });
  ok(/Não constatei a presença de Fusarium R4T em Banana\./.test(consB) && /Não constatei a presença de Moko da Bananeira em Banana\./.test(consB) && /Não constatei a presença de Sigatoka Negra em Banana\./.test(consB) && !/opcional/i.test(consB), 'constatação: "Não constatei a presença de X em Banana." das 3 (sem "Praga opcional")', consB);
  ok(mesmas(enqB, lin('Fusarium R4T')), 'enquadramento: o das avaliadas do programa (só a Fusariose tem texto no catálogo)', enqB);
  await p.click('#vi-continuar'); await p.waitForSelector('#vi-resumo'); await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta', { timeout: 20000 });
  const tB = await p.evaluate(async () => (await Store.todos('termosPce')).filter(t => t.visitaId));
  ok(tB.length === 1 && tB[0].programaVisita === 'Pragas da Bananeira', 'um Termo só: Pragas da Bananeira (as opcionais não geram Termo extra)', tB.map(t => t.programaVisita));
  ok(JSON.parse(tB[0].pragas).join() === 'Fusariose FOC R4T' && mesmas(tB[0].enquadramento, lin('Fusarium R4T')), 'Termo gravado: caixa Fusariose FOC R4T marcada (Moko e Sigatoka não têm caixa) e enquadramento', { p: tB[0].pragas });
  const cs = JSON.parse(tB[0].culturas)[0].pragas;
  ok(cs.length === 3 && cs.every(x => x.resultado === 'nao_detectada'), 'cultura do Termo: as 3 pragas avaliadas como não detectadas', cs);
  const pr = await A.imprimir(p, '.pce-termo-pronto [data-mon=imprimir]');
  const marcadas = await p.evaluate(h => [...new DOMParser().parseFromString(h, 'text/html').querySelectorAll('[data-x^="pragas="].on')].map(e => e.getAttribute('data-x')), pr.html);
  ok(marcadas.join() === 'pragas=Fusariose FOC R4T' && /Não constatei a presença de Fusarium R4T/.test(pr.texto), 'PDF do Termo: só a caixa Fusariose FOC R4T marcada e as frases "Não constatei..."', marcadas);
  await A.salvarPdf(p, pr, 'pce-termo.html', 'pce_opcionais_termo_banana');

  console.log('2) "Tem" abre os campos de detecção; enquadramento só das detectadas');
  await A.abrirProdutor(p, '52998224725');
  const s1 = await visita('Soja', { 'Phakopsora pachyrhizi': 'nao_detectada', 'Amaranthus palmeri': 'detectada' });
  ok(/Constatei a presença de Amaranthus palmeri em Soja\./.test(s1.cons) && /Não constatei a presença de Phakopsora pachyrhizi em Soja\./.test(s1.cons) && !/opcional/i.test(s1.cons), '"Tem": constatação de presença com a mesma redação; a obrigatória segue "Não constatei"', s1.cons);
  ok(mesmas(s1.enq, lin('Amaranthus palmeri')) && mesmas(s1.termos[0].enquadramento, lin('Amaranthus palmeri')), 'enquadramento só da detectada (Amaranthus), na tela e no Termo', s1.enq);
  ok(JSON.parse(s1.termos[0].pragas).join() === 'Ferrugem Asiática da soja,Amaranthus palmeri', 'Termo de soja: caixas da Ferrugem e do Amaranthus marcadas', s1.termos[0].pragas);
  ok(s1.termos.length === 1 && s1.termos[0].programaVisita === 'Pragas da Soja', 'um Termo só (Pragas da Soja)', s1.termos.map(t => t.programaVisita));
  await A.abrirProdutor(p, '52998224725');
  const s2 = await visita('Soja', { 'Phakopsora pachyrhizi': 'detectada' });
  ok(/Constatei a presença de Phakopsora pachyrhizi em Soja\./.test(s2.cons) && /Não constatei a presença de Amaranthus palmeri em Soja\./.test(s2.cons), 'obrigatória detectada e opcional intocada: "Não constatei" do Amaranthus', s2.cons);
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
  const consM = await p.locator('textarea[data-prog]').first().inputValue();
  ok(/Constatei a presença de Moko da Bananeira em Banana\./.test(consM) && /Não constatei a presença de Sigatoka Negra em Banana\./.test(consM), 'Moko "Tem": "Constatei a presença de Moko da Bananeira em Banana."', consM);
  await p.click('#vi-continuar'); await p.waitForSelector('#vi-resumo'); await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta', { timeout: 20000 });
  const tM = await novo(antesM);
  const pm = JSON.parse(tM.culturas)[0].pragas.find(x => x.praga === 'Moko da Bananeira');
  ok(pm.resultado === 'detectada' && pm.haQuantoTempo === '10 dias' && pm.controle === 'Sim' && pm.qualControle === 'Eliminação das plantas', 'Termo grava o resultado, há quanto tempo e o controle do Moko', pm);

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
  ok(/Não constatei a presença de Fusarium R4T/.test(await p.locator('textarea[data-prog]').first().inputValue()), 'segue para o Termo sem pedir resposta: a Fusariose entra como avaliada');
  await p.click('#vi-continuar'); await p.waitForSelector('#vi-resumo'); await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta', { timeout: 20000 });
  const tR = await novo(antesR);
  ok(JSON.parse(tR.pragas).join() === 'Fusariose FOC R4T' && JSON.parse(tR.culturas)[0].pragas.every(x => x.resultado === 'nao_detectada'), 'Termo do rascunho antigo: Fusariose marcada e as 3 como não detectadas', tR.pragas);

  console.log('5) citros: HLB, ácaro e cancro com as frases próprias; as opcionais com a redação padrão');
  await A.abrirProdutor(p, '52998224725');
  await p.locator('#pce-novavisita').first().click(); await p.waitForSelector('#pceVisitaForm');
  await p.locator('label.vi-fruto', { hasText: 'Laranja' }).locator('input').check();
  await p.click('#vi-continuar'); await p.waitForSelector('.pce-pr');
  for (const n of ['HLB / Greening', 'Schizotetranychus hindustanicus', 'Cancro Cítrico']) await p.locator(`.pce-pr[data-nome="${n}"] .pce-res-nao_detectada`).click();
  await p.locator('.pce-pr[data-nome="Pinta Preta dos Citros"] .pce-res-detectada').click();
  await p.click('#vi-continuar'); await p.waitForSelector('.v-plantas'); await p.click('#vi-continuar'); await p.waitForSelector('#vi-local');
  const consC = await p.locator('textarea[data-prog]').first().inputValue();
  ok(/Ausência de sintomas de HLB/.test(consC) && /Constatei a presença de Pinta Preta dos Citros em Laranja\./.test(consC) && /Não constatei a presença de Leprose dos Citros em Laranja\./.test(consC) && /Não constatei a presença de Diaphorina citri \(vetor do HLB\) em Laranja\./.test(consC) && !/Praga opcional/.test(consC), 'citros: frases próprias das 3 obrigatórias e, das opcionais, "Constatei"/"Não constatei"', consC);
  ok(p.err.length === 0, 'sem erros de JavaScript', p.err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
