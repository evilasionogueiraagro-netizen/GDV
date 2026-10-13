const amb = require('./lib/amb');
// Migração do banco local: v1 (app original) e v2 (com TF) → v4 (PCE + monilíase), sem perder dados.
const { chromium } = require('playwright-core');
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) throw new Error(m); };
(async () => {
  const b = await amb.lancar();
  const criar = (p, versao, stores, dados) => p.evaluate(([versao, stores, dados]) => new Promise((ok, no) => {
    const rq = indexedDB.open('gdv', versao);
    rq.onupgradeneeded = () => { const d = rq.result; stores.forEach(n => d.createObjectStore(n, { keyPath: n === 'meta' ? 'k' : 'id' })); };
    rq.onsuccess = () => { const d = rq.result, t = d.transaction(Object.keys(dados), 'readwrite');
      Object.entries(dados).forEach(([s, recs]) => recs.forEach(r => t.objectStore(s).put(r)));
      t.oncomplete = () => { d.close(); ok(); }; };
    rq.onerror = () => no(rq.error); }), [versao, stores, dados]);
  const abrirApp = async p => {
    await p.addInitScript(() => { localStorage.setItem('gdv.semInstalar', '1'); localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', 'segredo'); localStorage.setItem('gdv.nome', 'Ana Lima'); });
    await p.goto(amb.APP); await p.waitForSelector('#view *', { state: 'attached' }); await p.waitForTimeout(1000);
  };
  const estrutura = p => p.evaluate(() => new Promise(ok => { const q = indexedDB.open('gdv'); q.onsuccess = () => { const d = q.result;
    const r = { v: d.version, stores: [...d.objectStoreNames], indices: [...d.transaction('arquivos').objectStore('arquivos').indexNames] }; d.close(); ok(r); }; }));
  const nova = async () => { const c = await b.newContext(); const p = await c.newPage(); p.err = []; p.on('pageerror', e => p.err.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(amb.APP + 'documentos/ficha.html'); return p; };                         // mesma origem, sem rodar o app

  const turno = { id: 't-antigo', numeroTF: 'TF-001-A-2026', data: '2026-10-09', letra: 'A', inicio: '04:02', fim: '', fiscal: 'Ana Lima', local: 'CEASA', unidade: 'MANAUS', encerrado: 0, criadoEm: 1, atualizadoEm: 1, pendente: 1 };
  const veic = { id: 'v-antigo', turnoId: 't-antigo', hora: '08:10', placa: 'AAA1A11', tipo: 'PA', pessoas: 4, obs: '', excluido: 0, criadoEm: 1, atualizadoEm: 1, pendente: 1 };

  console.log('1) banco v1 (só veículos) → v4');
  let p = await nova();
  await criar(p, 1, ['turnos', 'veiculos', 'meta'], { turnos: [turno], veiculos: [veic], meta: [{ k: 'turnoAtual', v: 't-antigo' }] });
  await abrirApp(p);
  let r = await p.evaluate(async () => ({ turnos: (await Store.todos('turnos')).map(t => t.id), veic: (await Store.todos('veiculos')).map(v => v.placa), atual: await Store.meta('turnoAtual') }));
  let e = await estrutura(p);
  ok(e.v === 4 && ['levantamentos', 'colheitas', 'propriedades', 'arquivos', 'tfs', 'pessoas', 'placas', 'cadastrosPce', 'termosPce'].every(s => e.stores.includes(s)) && e.indices.includes('enviado'), 'v1 → v4: stores novas e índice "enviado": ' + JSON.stringify(e));
  ok(r.turnos.includes('t-antigo') && r.veic.includes('AAA1A11') && r.atual === 't-antigo', 'turno, veículo e turno atual preservados');
  await p.click('.modulo[data-v=home]'); await p.waitForTimeout(500);
  const tela = await p.evaluate(() => document.querySelector('#view').innerText.replace(/\s+/g, ' ')); ok(/Turno em andamento|TF-001-A-2026|CEASA/.test(tela), 'turno aberto continua na tela inicial: ' + tela.slice(0, 160));
  ok(!p.err.length, 'sem erros: ' + JSON.stringify(p.err)); await p.context().close();

  console.log('2) banco v2 (veículos + TF) → v4');
  p = await nova();
  const tf = { id: 'tf-antigo', barreira: 'BVA-CEASA', ano: 2026, numero: 7, numeroTxt: '0007/2026 - BVA - CEASA', nome: 'JOSE', doc: '52998224725', pendente: 1, criadoEm: 2, atualizadoEm: 2 };
  await criar(p, 2, ['turnos', 'veiculos', 'tfs', 'pessoas', 'placas', 'meta'], { turnos: [turno], veiculos: [veic], tfs: [tf],
    pessoas: [{ id: '52998224725', tipo: 'PF', nome: 'JOSE', telefone: '9', pendente: 0, criadoEm: 1, atualizadoEm: 1 }], placas: [{ id: 'ABC1D23', doc: '52998224725', nome: 'JOSE', pendente: 1, criadoEm: 1, atualizadoEm: 1 }],
    meta: [{ k: 'turnoAtual', v: 't-antigo' }, { k: 'ultimoVisto', v: { 'BVA-CEASA|2026': 7 } }, { k: 'lastSync', v: 123 }, { k: 'tfRascunho', v: { dados: { nome: 'RASC' } } }] });
  await fetch(amb.API + '/__off');                                          // servidor fora: os pendentes continuam pendentes
  await abrirApp(p);
  r = await p.evaluate(async () => ({ tfs: await Store.todos('tfs'), pes: await Store.todos('pessoas'), pla: await Store.todos('placas'), uv: await Store.meta('ultimoVisto'), ls: await Store.meta('lastSync'),
    rasc: await Store.meta('tfRascunho'), veic: await Store.todos('veiculos'), lev: await Store.todos('levantamentos'), arq: (await Sync.arquivosPendentes()).length }));
  e = await estrutura(p);
  ok(e.v === 4 && ['levantamentos', 'colheitas', 'propriedades', 'arquivos', 'cadastrosPce', 'termosPce'].every(s => e.stores.includes(s)) && e.indices.includes('enviado'), 'v2 → v4: ' + e.stores.join(','));
  ok(r.tfs.length === 1 && r.tfs[0].numeroTxt === '0007/2026 - BVA - CEASA' && r.tfs[0].pendente === 1, 'TF antigo preservado (ainda pendente)');
  ok(r.pes.length === 1 && r.pes[0].nome === 'JOSE' && r.pla.length === 1 && r.veic.length === 1, 'pessoas, placas e veículos preservados');
  ok(r.uv['BVA-CEASA|2026'] === 7 && r.ls === 123 && r.rasc && r.rasc.dados.nome === 'RASC', 'meta (último nº visto, lastSync, rascunho do TF) preservada');
  ok(r.lev.length === 0 && r.arq === 0, 'stores do PCE vazias e utilizáveis');
  await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm'); ok(true, 'módulo PCE abre sobre o banco migrado');
  ok(!p.err.length, 'sem erros: ' + JSON.stringify(p.err));
  await fetch(amb.API + '/__on');
  console.log('OK'); await b.close();
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
