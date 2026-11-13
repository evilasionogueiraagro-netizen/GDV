const fs = require('fs'), path = require('path'), vm = require('vm');
const amb = require('./lib/amb');
// PCE — enquadramento legal: a planilha da GDV (docs/modulos/pce-legislacao.csv) é a fonte e tem de ser igual ao CONFIG.PCE.legislacao (app),
// ao LEGISLACAO_PCE_ (back) e ao catálogo que o back entrega; no Termo de citros o texto é o do catálogo (só das pragas detectadas ou
// suspeitas; sem detecção, de todas as avaliadas do programa), nunca um texto próprio do citros. Dados fictícios.
const { API, RAIZ } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 500))); if (!c) falhas++; };

/** CSV simples (aspas duplas, vírgula, quebra de linha) -> linhas de células. */
function csv(txt) {
  const L = []; let l = [], c = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"' && txt[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { l.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; l.push(c); c = ''; if (l.some(x => x !== '')) L.push(l); l = []; }
    else c += ch;
  }
  if (c !== '' || l.length) { l.push(c); L.push(l); }
  return L;
}

(async () => {
  console.log('1) planilha da GDV x app x back');
  const L = csv(fs.readFileSync(path.join(RAIZ, 'docs/modulos/pce-legislacao.csv'), 'utf8')), cab = L[0];
  const iPraga = cab.indexOf('PRAGA_NO_CATALOGO'), iLeg = cab.indexOf('LEGISLACAO');
  ok(iPraga === 0 && iLeg === 4 && L.length > 1, 'planilha lida (colunas PRAGA_NO_CATALOGO e LEGISLACAO)', cab);
  const planilha = Object.fromEntries(L.slice(1).map(l => [l[iPraga].trim(), l[iLeg].trim()]));
  const igual = (a, b) => JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort()) && Object.keys(a).every(k => a[k] === b[k]);
  const dif = (a, b) => Object.keys({ ...a, ...b }).filter(k => a[k] !== b[k]);

  const ctx = vm.createContext({ window: {}, document: {}, navigator: {}, localStorage: {}, console });
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'web/js/config.js'), 'utf8') + '\n;this.__CONFIG = CONFIG;', ctx);
  const app = ctx.__CONFIG.PCE.legislacao;
  ok(igual(planilha, app), 'CONFIG.PCE.legislacao = planilha (mesmas pragas, mesmos textos)', dif(planilha, app));

  const gs = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'apps-script/pce-catalogo.gs'), 'utf8') + '\n;this.__LEG = LEGISLACAO_PCE_;', gs);
  ok(igual(planilha, gs.__LEG), 'LEGISLACAO_PCE_ (back) = planilha', dif(planilha, gs.__LEG));

  const g = await amb.usuario('Gerente Legislacao Teste', { aplicativo: 'painel', permissoes: ['gerencia', 'pce'] });
  const r = await fetch(API, { method: 'POST', body: JSON.stringify({ action: 'painelPceCatalogo', key: g.token }) }).then(x => x.json());
  const cat = r.ok ? Object.fromEntries(r.catalogo.pragas.filter(p => p.enquadramentoLegal).map(p => [p.id, p.enquadramentoLegal])) : {};
  const idDe = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/ /g, '-');
  ok(Object.keys(planilha).every(k => cat[idDe(k)] === planilha[k]) && Object.keys(cat).length === Object.keys(planilha).length, 'catálogo entregue pelo back = planilha', r.ok ? Object.keys(cat) : r);
  ok(ctx.__CONFIG.PCE.citros.enquadramento === undefined, 'citros não tem enquadramento próprio em CONFIG.PCE');

  console.log('2) Termo de citros na Nova visita: enquadramento do catálogo, só das detectadas ou suspeitas');
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
