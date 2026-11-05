const fs = require('fs'), path = require('path'), vm = require('vm');
const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// PCE — enquadramento legal: a planilha da GDV (docs/modulos/pce-legislacao.csv) é a fonte e tem de ser igual ao CONFIG.PCE.legislacao (app),
// ao LEGISLACAO_PCE_ (back) e ao catálogo que o back entrega; no Termo de citros o texto é o do catálogo (só das pragas detectadas ou
// suspeitas), nunca um texto próprio do citros. Dados fictícios.
const { API, APP, RAIZ } = amb;
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

  console.log('2) Termo de citros: enquadramento do catálogo, só das detectadas ou suspeitas');
  const b = await amb.lancar();
  const f = await U.fiscal('Fiscal Legislacao Teste');
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.12, longitude: -60.02, accuracy: 9 } });
  await c.addInitScript(i => { if (!localStorage.getItem('gdv.key')) Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); localStorage.setItem('gdv.url', window.__GDV_API); }, f.ls);
  const p = await c.newPage(); const err = [];
  p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]');
  await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(1200);
  await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
  await p.selectOption('#pce-s-cargo', { index: 1 }); await p.selectOption('#pce-s-lotacao', 'Manaus'); await p.click('#pce-s-salvar'); await p.waitForSelector('#pce-novolev');
  // levantamento de citros gravado direto no banco do aparelho (o formulário de citros tem outro teste)
  const levId = await p.evaluate(async () => {
    const id = Store.novoId(), cult = (resultado) => ({ cultura: 'Limão', area: '', espLinha: '', espPlanta: '', espUnidade: 'm', resultado, coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '', fotos: [] });
    await Store.salvar('levantamentos', { id, data: '2026-10-05', hora: '09:00', doc: '52998224725', nome: 'PRODUTOR FICTICIO LEGISLACAO', propriedade: 'Sitio Ficticio', municipio: 'Manaus', uf: 'AM', excluido: 0,
      servidor: 'Fiscal Legislacao Teste', cargo: 'Fiscal', matricula: '1', lotacao: 'Manaus', fotos: '[]', assinaturas: '{}', culturas: '[]', citros: '',
      pragas: JSON.stringify([{ praga: 'HLB / Greening', culturas: [cult('detectada')] }, { praga: 'Cancro Cítrico', culturas: [cult('nao_detectada')] }, { praga: 'Schizotetranychus hindustanicus', culturas: [cult('suspeita')] }]) });
    return id;
  });
  const termo = async () => {
    await p.evaluate(id => go('pcetf', { levId: id, programaVisita: 'pragas-dos-citros', nomePrograma: 'Pragas dos Citros', culturas: ['Limão'] }), levId);
    await p.waitForSelector('#monTfForm'); await p.waitForTimeout(300);
    return p.inputValue('#mt-enquadramento');
  };
  const leg = n => planilha[n];
  const enq1 = await termo();
  ok(enq1 === [leg('HLB / Greening'), leg('Schizotetranychus hindustanicus')].join('\n'), 'detectada (HLB) e suspeita (ácaro): enquadramento da planilha de cada uma, e só delas', enq1);
  ok(!/ART\. ?2[36]/i.test(enq1) && !/1326, DE 4 DE JULHO/.test(enq1), 'sem o texto próprio antigo do citros');
  await p.evaluate(async id => { const l = await Store.obter('levantamentos', id), pr = JSON.parse(l.pragas); pr.forEach(g => g.culturas.forEach(x => { x.resultado = 'nao_detectada'; })); await Store.salvar('levantamentos', { ...l, pragas: JSON.stringify(pr) }); }, levId);
  const enq2 = await termo();
  ok(enq2 === '', 'nada detectado nem suspeito: enquadramento em branco (o fiscal digita se quiser)', enq2);
  ok(err.length === 0, 'sem erros de JavaScript', err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
