// PCE: enquadramento legal. A planilha da GDV (docs/modulos/pce-legislacao.csv) é a fonte e tem de ser igual ao CONFIG.PCE.legislacao
// (app), ao LEGISLACAO_PCE_ (back) e ao catálogo que o back entrega (catalogoPce_ com as abas vazias = base). Sem fakegas nem navegador;
// o Termo de citros gravado com esse texto continua no tests/pce_legislacao_test.js (Playwright).
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./vm_loader');
const { ok, fim } = L.verificador();

const linhas = L.csv(fs.readFileSync(path.join(L.RAIZ, 'docs/modulos/pce-legislacao.csv'), 'utf8')), cab = linhas[0];
const iPraga = cab.indexOf('PRAGA_NO_CATALOGO'), iLeg = cab.indexOf('LEGISLACAO');
ok(iPraga === 0 && iLeg === 4 && linhas.length > 1, 'planilha lida (colunas PRAGA_NO_CATALOGO e LEGISLACAO)', cab);
const planilha = Object.fromEntries(linhas.slice(1).map(l => [l[iPraga].trim(), l[iLeg].trim()]));
const igual = (a, b) => JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort()) && Object.keys(a).every(k => a[k] === b[k]);
const dif = (a, b) => Object.keys({ ...a, ...b }).filter(k => a[k] !== b[k]);

const W = L.carregar(['web/js/config.js'], ['CONFIG']);
const app = L.copia(W.CONFIG.PCE.legislacao);
ok(igual(planilha, app), 'CONFIG.PCE.legislacao = planilha (mesmas pragas, mesmos textos)', dif(planilha, app));
ok(W.CONFIG.PCE.citros.enquadramento === undefined, 'citros não tem enquadramento próprio em CONFIG.PCE');

const G = L.carregar(L.gs('dashboard-publico', 'pce-catalogo'), ['LEGISLACAO_PCE_', 'catalogoPce_'], { globais: { lerLeitura_: () => [] } });
const back = L.copia(G.LEGISLACAO_PCE_);
ok(igual(planilha, back), 'LEGISLACAO_PCE_ (back) = planilha', dif(planilha, back));

// o que a action painelPceCatalogo devolve em r.catalogo (planilha nova: abas vazias, vale a base)
const cat = Object.fromEntries(G.catalogoPce_().pragas.filter(p => p.enquadramentoLegal).map(p => [p.id, p.enquadramentoLegal]));
const idDe = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/ /g, '-');
ok(Object.keys(planilha).every(k => cat[idDe(k)] === planilha[k]) && Object.keys(cat).length === Object.keys(planilha).length,
  'catálogo entregue pelo back (catalogoPce_) = planilha', Object.keys(cat));
fim();
