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

  console.log('2) sincronização entre a gravação das linhas e a do levantamento');
  const sync = async () => { for (let i = 0; i < 6; i++) { await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(300); } };
  const semPend = () => p.evaluate(async () => {
    const n = {}; for (const s of ['levantamentos', 'culturasAvaliadas', 'resultados']) n[s] = (await Store.todos(s)).filter(x => x.pendente).length; return n; });
  await p.evaluate(() => { go('pce'); }); await p.waitForSelector('#pce-novolev');
  await p.evaluate(() => {                                      // uma sincronização completa antes de cada gravação da visita (o pior caso da corrida)
    window.__ordem = []; const orig = window.__salvarOrig = Store.salvar;
    Store.salvar = async (s, r) => { if (['levantamentos', 'culturasAvaliadas', 'resultados'].includes(s)) { window.__ordem.push(s); await Sync.sincronizar(); } return orig(s, r); };
  });
  await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm');
  await p.fill('#pce-doc', '52998224725'); await p.fill('#pce-nome', 'Produtor Ficticio Banco'); await p.fill('#pce-propriedade', 'Sitio Ficticio Banco Dois'); await p.fill('#pce-codigo', 'PRP-BANCO-2');
  if (!(await p.inputValue('#pce-municipio'))) await p.selectOption('#pce-municipio', 'Manaus');
  await PF.preencherCultura(p, 0, 'Soja');
  await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto', { timeout: 10000 });
  const ordem = await p.evaluate(() => window.__ordem);
  ok(ordem.length > 1 && ordem[ordem.length - 1] === 'levantamentos' && ordem.indexOf('levantamentos') === ordem.length - 1, 'as linhas são gravadas antes do levantamento', ordem);
  await p.evaluate(() => { Store.salvar = window.__salvarOrig; });
  await sync();
  const lev2 = await p.evaluate(async () => (await Store.todos('levantamentos')).find(l => l.codigoPropriedade === 'PRP-BANCO-2'));
  let pc2 = (await linhas('CulturasAvaliadas')).filter(x => x.levantamentoId === lev2.id), pr2 = (await linhas('Resultados')).filter(x => x.levantamentoId === lev2.id);
  const loc = await p.evaluate(async id => ({ ca: (await Store.todos('culturasAvaliadas')).filter(x => x.levantamentoId === id).length, rs: (await Store.todos('resultados')).filter(x => x.levantamentoId === id).length }), lev2.id);
  ok((await linhas('Levantamentos')).some(l => l.id === lev2.id) && pc2.length === loc.ca && pc2.length === 1 && pr2.length === loc.rs && pr2.length >= 1, 'levantamento e linhas chegam à planilha, mesmo com sincronização no meio', [pc2.length, pr2.length, loc]);
  let pend = await semPend();
  ok(pend.levantamentos === 0 && pend.culturasAvaliadas === 0 && pend.resultados === 0, 'nada fica pendente no aparelho', pend);

  console.log('3) linha pendente sozinha (levantamento já enviado) leva o levantamento junto');
  const alvo = pr2[0].id;
  await p.evaluate(async id => { const x = await Store.obter('resultados', id); await Store.salvar('resultados', { ...x, resultado: 'suspeita' }); }, alvo);
  ok((await semPend()).levantamentos === 0 && (await semPend()).resultados === 1, 'ponto de partida: só a linha está pendente, o levantamento não');
  await sync();
  pr2 = (await linhas('Resultados')).filter(x => x.levantamentoId === lev2.id);
  pend = await semPend();
  ok(pr2.find(x => x.id === alvo).resultado === 'suspeita' && pend.resultados === 0, 'a linha chega à planilha e deixa de ser pendente', [pr2.find(x => x.id === alvo).resultado, pend]);

  console.log('4) excluir o levantamento exclui (lógico) as linhas da visita');
  await p.evaluate(() => { go('pce'); }); await p.waitForSelector('.item.pce-lev');
  const botoes = await p.locator('[data-pce=excluirlev]').count();
  await p.locator(`[data-pce=excluirlev][data-id="${lev2.id}"]`).click(); await p.waitForTimeout(800);
  const exc = await p.evaluate(async id => ({ lev: (await Store.obter('levantamentos', id)).excluido,
    ca: (await Store.todos('culturasAvaliadas')).filter(x => x.levantamentoId === id).map(x => Number(x.excluido)),
    rs: (await Store.todos('resultados')).filter(x => x.levantamentoId === id).map(x => Number(x.excluido)) }), lev2.id);
  ok(botoes === 2 && Number(exc.lev) === 1 && exc.ca.length === 1 && exc.ca.every(x => x === 1) && exc.rs.length >= 1 && exc.rs.every(x => x === 1), 'no aparelho: levantamento e todas as linhas dele com excluido = 1', exc);
  await sync();
  pc2 = (await linhas('CulturasAvaliadas')).filter(x => x.levantamentoId === lev2.id); pr2 = (await linhas('Resultados')).filter(x => x.levantamentoId === lev2.id);
  const pc1 = (await linhas('CulturasAvaliadas')).filter(x => x.levantamentoId === lev.id);
  ok(pc2.length === 1 && pc2.every(x => Number(x.excluido) === 1) && pr2.length >= 1 && pr2.every(x => Number(x.excluido) === 1) && pc1.every(x => Number(x.excluido) !== 1), 'na planilha: linhas do excluído com excluido = 1 (nada apagado) e as do outro levantamento intactas', [pc2.length, pr2.length]);
  pend = await semPend();
  ok(pend.levantamentos === 0 && pend.culturasAvaliadas === 0 && pend.resultados === 0, 'nada fica pendente depois de excluir', pend);
  ok(err.length === 0, 'sem erros de JavaScript', err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
