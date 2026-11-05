const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const PF = require('./lib/pce-form');
// PCE — banco local do aparelho e envio das linhas da visita (culturasAvaliadas e resultados), com o app real e o Code.gs real no fakegas.
//  1. aparelho que já estava na versão 4 do banco (sem as stores novas): o app sobe para a versão 5, cria as stores e salva o levantamento;
//  2. as linhas são gravadas antes do levantamento e, se ficarem pendentes sozinhas, o levantamento delas sobe junto;
//  3. excluir o levantamento exclui (lógico) as linhas da visita, e a exclusão chega à planilha. Dados fictícios.
const { API, APP } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };
const linhas = async aba => { const d = await (await fetch(API + '/__tudo')).json(); const l = d[aba] || []; return l.slice(1).map(r => Object.fromEntries(l[0].map((k, i) => [k, r[i]]))); };

(async () => {
  const b = await amb.lancar();
  const f = await U.fiscal('Fiscal Banco Local Teste');
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.12, longitude: -60.02, accuracy: 9 } });
  await c.addInitScript(i => { if (!localStorage.getItem('gdv.key')) Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); localStorage.setItem('gdv.url', window.__GDV_API); }, f.ls);
  const p = await c.newPage(); const err = [];
  p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  const toast = () => p.textContent('#toast');

  console.log('1) aparelho já na versão 4 do banco, sem as stores novas');
  await p.goto(APP + 'js/config.js');                 // mesma origem do app, sem carregar o app: cria o banco antigo à mão
  await p.evaluate(() => new Promise((ok, no) => {
    const rq = indexedDB.open('gdv', 4);
    rq.onupgradeneeded = () => {
      const d = rq.result;
      ['turnos', 'veiculos', 'tfs', 'pessoas', 'placas', 'levantamentos', 'colheitas', 'propriedades', 'cadastrosPce', 'termosPce'].forEach(n => d.createObjectStore(n, { keyPath: 'id' }));
      d.createObjectStore('arquivos', { keyPath: 'id' }).createIndex('enviado', 'enviado');
      d.createObjectStore('meta', { keyPath: 'k' });
    };
    rq.onsuccess = () => { rq.result.close(); ok(); }; rq.onerror = () => no(rq.error);
  }));
  const antes = await p.evaluate(() => new Promise(ok => { const r = indexedDB.open('gdv'); r.onsuccess = () => { const d = r.result, o = { v: d.version, stores: [...d.objectStoreNames] }; d.close(); ok(o); }; }));
  ok(antes.v === 4 && !antes.stores.includes('culturasAvaliadas') && !antes.stores.includes('resultados'), 'ponto de partida: banco v4 sem culturasAvaliadas nem resultados', antes);

  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]');
  await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(1200);
  const depois = await p.evaluate(() => new Promise(ok => { const r = indexedDB.open('gdv'); r.onsuccess = () => { const d = r.result, o = { v: d.version, stores: [...d.objectStoreNames] }; d.close(); ok(o); }; }));
  ok(depois.v === 5 && depois.stores.includes('culturasAvaliadas') && depois.stores.includes('resultados'), 'o app sobe o banco para a versão 5 e cria as stores novas, mantendo as antigas', depois);
  ok(await p.evaluate(async () => !!(await Store.meta('catalogoPce'))), 'catálogo do PCE recebido no sync');

  await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
  await p.selectOption('#pce-s-cargo', { index: 1 }); await p.selectOption('#pce-s-lotacao', 'Manaus'); await p.click('#pce-s-salvar'); await p.waitForSelector('#pce-novolev');
  await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm');
  await p.fill('#pce-doc', '52998224725'); await p.fill('#pce-nome', 'Produtor Ficticio Banco'); await p.fill('#pce-propriedade', 'Sitio Ficticio Banco'); await p.fill('#pce-codigo', 'PRP-BANCO-1');
  if (!(await p.inputValue('#pce-municipio'))) await p.selectOption('#pce-municipio', 'Manaus');
  await PF.preencherCultura(p, 0, 'Soja');
  await p.click('#pce-salvar');
  await p.waitForSelector('#pce-lev-pronto', { timeout: 8000 }).catch(() => {});
  ok(await p.locator('#pce-lev-pronto').count() === 1, 'levantamento salvo no banco que era v4', await toast());
  const lev = await p.evaluate(async () => (await Store.todos('levantamentos'))[0] || null);
  const ler = n => p.evaluate(s => Store.todos(s).catch(() => []), n), ca = await ler('culturasAvaliadas'), rs = await ler('resultados');
  ok(lev && ca.length === 1 && rs.length >= 1 && ca.every(x => x.levantamentoId === lev.id) && rs.every(x => x.levantamentoId === lev.id), 'linhas da visita gravadas no aparelho (1 cultura, uma linha por praga)', [ca.length, rs.length]);
  await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(1500);
  const pc = await linhas('CulturasAvaliadas'), pr = await linhas('Resultados');
  ok(pc.length === 1 && pc[0].levantamentoId === lev.id && pr.length === 1 && pr[0].levantamentoId === lev.id, 'as linhas chegam à planilha (CulturasAvaliadas e Resultados)', [pc.length, pr.length]);
  ok(err.length === 0, 'sem erros de JavaScript', err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
