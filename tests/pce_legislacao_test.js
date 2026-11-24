const fs = require('fs'), path = require('path');
const amb = require('./lib/amb');
const { csv } = require('./unit/vm_loader');
// PCE — enquadramento legal no Termo de citros (Nova visita): o texto é o do catálogo (só das pragas detectadas ou suspeitas; sem detecção,
// de todas as avaliadas do programa), nunca um texto próprio do citros. A igualdade planilha da GDV (docs/modulos/pce-legislacao.csv) =
// CONFIG.PCE.legislacao = LEGISLACAO_PCE_ = catálogo do back fica em tests/unit/pce_legislacao_unit_test.js. Dados fictícios.
const { RAIZ } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 500))); if (!c) falhas++; };

(async () => {
  const L = csv(fs.readFileSync(path.join(RAIZ, 'docs/modulos/pce-legislacao.csv'), 'utf8')), cab = L[0];
  const iPraga = cab.indexOf('PRAGA_NO_CATALOGO'), iLeg = cab.indexOf('LEGISLACAO');
  const planilha = Object.fromEntries(L.slice(1).map(l => [l[iPraga].trim(), l[iLeg].trim()]));

  console.log('1) Termo de citros na Nova visita: enquadramento do catálogo, só das detectadas ou suspeitas');
  const A = require('./lib/pce-app');
  const b = await amb.lancar();
  const p = await A.aparelho(b, 'Fiscal Legislacao Teste');
  await A.identificar(p);
  await A.novoProdutor(p, { doc: '52998224725', nome: 'Produtor Ficticio Legislacao', propriedade: 'Sitio Ficticio', codigo: 'PRP-LEG-1', municipio: 'Manaus', frutos: [{ cultura: 'Limão', area: 1 }] });
  const leg = n => planilha[n];
  const mesmas = (a, b) => JSON.stringify(a.split('\n').sort()) === JSON.stringify(b.split('\n').sort());   // a ordem é a das pragas do fruto na visita, não faz parte da regra
  // visita até o passo 4 (para ler o enquadramento na tela) e concluída (para ler o gravado no Termo)
  const visita = async resultados => {
    const antes = await p.evaluate(async () => (await Store.todos('termosPce')).map(t => t.id));
    await A.visita(p, { frutos: ['Limão'], resultados: { Limão: resultados }, parar: 4 });
    const tela = await p.locator('.vi-enq').evaluate(e => { e.querySelectorAll('br').forEach(br => br.replaceWith('\n')); return e.textContent; });
    await p.click('#vi-continuar'); await p.waitForSelector('#vi-resumo'); await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta', { timeout: 20000 });
    const novo = await p.evaluate(async antes => (await Store.todos('termosPce')).find(t => t.visitaId && !antes.includes(t.id)), antes);   // o Termo desta visita
    return { tela, termo: novo.enquadramento };
  };
  const e1 = await visita({ 'HLB / Greening': 'detectada', 'Cancro Cítrico': 'nao_detectada', 'Schizotetranychus hindustanicus': 'suspeita' });
  const esp1 = [leg('HLB / Greening'), leg('Schizotetranychus hindustanicus')].join('\n');
  ok(mesmas(e1.tela, esp1) && mesmas(e1.termo, esp1), 'detectada (HLB) e suspeita (ácaro): enquadramento da planilha de cada uma, e só delas (na tela do passo 4 e gravado no Termo)', e1);
  ok(!/ART\. ?2[36]/i.test(e1.termo) && !/1326, DE 4 DE JULHO/.test(e1.termo), 'sem o texto próprio antigo do citros');
  await A.abrirProdutor(p, '52998224725');
  const e2 = await visita({ 'HLB / Greening': 'nao_detectada', 'Cancro Cítrico': 'nao_detectada', 'Schizotetranychus hindustanicus': 'nao_detectada' });
  const esp2 = [...new Set([leg('HLB / Greening'), leg('Cancro Cítrico'), leg('Schizotetranychus hindustanicus')])].join('\n');
  ok(mesmas(e2.tela, esp2) && mesmas(e2.termo, esp2) && e2.termo.split('\n').length === 3 && !e2.termo.includes(leg('Pinta Preta dos Citros')), 'nada detectado nem suspeito: entra o enquadramento de todas as avaliadas do programa (sem repetir; a opcional "Não tem" também é avaliada, mas a Pinta Preta não tem texto no catálogo e não acrescenta linha)', e2);
  ok(p.err.length === 0, 'sem erros de JavaScript', p.err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
