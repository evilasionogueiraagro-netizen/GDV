const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const A = require('./lib/pce-app');
// PCE — banco local do aparelho e levantamentos antigos, com o app real e o Code.gs real no fakegas:
//  1. aparelho na versão 4 do banco (a de produção): abre sem subir de versão e salva produtor, frutos e visita;
//  2. aparelho que chegou a ficar na versão 5 (stores culturasAvaliadas e resultados, já retiradas): abre como está, sem perder nada pendente;
//  3. levantamento pendente no aparelho continua sendo enviado depois de atualizar o app (as linhas da visita antiga não vão mais);
//  4. levantamentos antigos abrem só para leitura, com PDF por programa, na tela do produtor; não há como criar nem editar;
//  5. LGPD: módulo PCE retirado apaga o catálogo do aparelho, mas os levantamentos do fiscal ficam. Dados fictícios.
const { API, APP } = amb;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' -> ' + JSON.stringify(x).slice(0, 400))); if (!c) throw new Error(m); };
const STORES4 = ['turnos', 'veiculos', 'tfs', 'pessoas', 'placas', 'levantamentos', 'colheitas', 'propriedades', 'cadastrosPce', 'termosPce'];
const estrutura = p => p.evaluate(() => new Promise(ok => { const r = indexedDB.open('gdv'); r.onsuccess = () => { const d = r.result, o = { v: d.version, stores: [...d.objectStoreNames] }; d.close(); ok(o); }; }));
const criarBanco = (p, versao, extras) => p.evaluate(([versao, extras, STORES4]) => new Promise((ok, no) => {
  const rq = indexedDB.open('gdv', versao);
  rq.onupgradeneeded = () => {
    const d = rq.result;
    [...STORES4, ...extras].forEach(n => d.createObjectStore(n, { keyPath: 'id' }));
    d.createObjectStore('arquivos', { keyPath: 'id' }).createIndex('enviado', 'enviado'); d.createObjectStore('meta', { keyPath: 'k' });
  };
  rq.onsuccess = () => { rq.result.close(); ok(); }; rq.onerror = () => no(rq.error);
}), [versao, extras, STORES4]);
const gravar = (p, store, rec) => p.evaluate(([s, r]) => new Promise((ok, no) => { const q = indexedDB.open('gdv'); q.onsuccess = () => { const d = q.result, t = d.transaction(s, 'readwrite'); t.objectStore(s).put(r); t.oncomplete = () => { d.close(); ok(); }; t.onerror = () => no(t.error); }; }), [store, rec]);
const agora = Date.now(), dia = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
const lev = (id, cult, praga, res) => ({ id, data: dia, hora: '09:30', servidor: 'Fiscal Banco Local Teste', cargo: 'Fiscal', lotacao: 'Manaus', doc: '52998224725', nome: 'PRODUTOR FICTICIO BANCO', propriedade: 'Sitio Banco', codigoPropriedade: 'PRP-BANCO-1',
  municipio: 'Manaus', culturas: '[]', fotos: '[]', assinaturas: '{}', obs: '', excluido: 0, criadoEm: agora, atualizadoEm: agora, pendente: 1, pragas: JSON.stringify([{ praga, culturas: [{ cultura: cult, area: '2', resultado: res, coleta: 'Não', fotos: [] }] }]) });
const planilha = async aba => { const d = await (await fetch(API + '/__tudo')).json(); const l = (d.abas || d)[aba] || []; return l.slice(1).map(r => Object.fromEntries(l[0].map((k, i) => [k, r[i]]))); };

(async () => {
  const b = await amb.lancar();
  const f = await U.fiscal('Fiscal Banco Local Teste');
  const novo = async () => { const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.12, longitude: -60.02, accuracy: 9 } });
    await c.addInitScript(i => { if (!localStorage.getItem('gdv.key')) Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); localStorage.setItem('gdv.url', window.__GDV_API); }, f.ls);
    const p = await c.newPage(); p.err = []; p.on('pageerror', e => p.err.push(e.message)); p.on('dialog', d => d.accept()); await p.goto(APP + 'js/config.js'); return p; };   // mesma origem do app, sem carregar o app

  console.log('1) aparelho na versão 4 do banco (produção)');
  let p = await novo();
  await criarBanco(p, 4, []);
  ok((await estrutura(p)).v === 4, 'ponto de partida: banco v4');
  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]');
  await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(1200);
  const e4 = await estrutura(p);
  ok(e4.v === 4 && STORES4.every(s => e4.stores.includes(s)) && !e4.stores.includes('culturasAvaliadas') && !e4.stores.includes('resultados'), 'o app continua na versão 4, sem as stores de linhas da visita', e4);
  ok(await p.evaluate(async () => !!(await Store.meta('catalogoPce'))), 'catálogo do PCE recebido no sync');
  await A.identificar(p);
  await A.novoProdutor(p, { doc: '52998224725', nome: 'Produtor Ficticio Banco', propriedade: 'Sitio Banco', codigo: 'PRP-BANCO-1', frutos: [{ cultura: 'Soja', area: 10 }] });
  await A.visita(p, { frutos: ['Soja'] });
  await A.sync(p);
  ok((await planilha('Propriedades')).some(x => x.id === 'PRP-BANCO-1') && (await planilha('TermosPCE')).length === 1, 'produtor, frutos e Termo da visita chegam à planilha no banco v4');
  const abas = Object.keys((await (await fetch(API + '/__tudo')).json()).abas || (await (await fetch(API + '/__tudo')).json()));
  ok(!abas.includes('CulturasAvaliadas') && !abas.includes('Resultados'), 'a planilha não cria as abas CulturasAvaliadas e Resultados', abas);
  await p.context().close();

  console.log('2) aparelho que chegou a ficar na versão 5 (com as stores retiradas) e levantamento pendente');
  const f2 = await U.fiscal('Fiscal Versao Cinco Teste');
  p = await b.newContext({ viewport: { width: 400, height: 900 } }).then(async c => { await c.addInitScript(() => { if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' '), paginas: d.querySelectorAll('.a4').length, html: d.documentElement.outerHTML }); }; });
    await c.addInitScript(i => { if (!localStorage.getItem('gdv.key')) Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); localStorage.setItem('gdv.url', window.__GDV_API); }, f2.ls);
    const q = await c.newPage(); q.err = []; q.on('pageerror', e => q.err.push(e.message)); q.on('dialog', d => d.accept()); await q.goto(APP + 'js/config.js'); return q; });
  await criarBanco(p, 5, ['culturasAvaliadas', 'resultados']);
  const L1 = { ...lev('lev-v5-1', 'Soja', 'Phakopsora pachyrhizi', 'nao_detectada'), servidor: 'Fiscal Versao Cinco Teste', codigoPropriedade: 'PRP-V5-1', propriedade: 'Sitio V5' };
  await gravar(p, 'levantamentos', L1);
  await gravar(p, 'culturasAvaliadas', { id: 'lev-v5-1|soja', levantamentoId: 'lev-v5-1', cultura: 'Soja', excluido: 0, pendente: 1, criadoEm: agora, atualizadoEm: agora });
  await gravar(p, 'resultados', { id: 'lev-v5-1|soja|phakopsora', levantamentoId: 'lev-v5-1', praga: 'Phakopsora pachyrhizi', resultado: 'nao_detectada', excluido: 0, pendente: 1, criadoEm: agora, atualizadoEm: agora });
  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]');
  ok(p.err.length === 0, 'o app abre sobre o banco v5 sem erro (sem VersionError)', p.err);
  const e5 = await estrutura(p);
  ok(e5.v === 5 && e5.stores.includes('culturasAvaliadas'), 'o banco fica como está (v5), sem apagar nada', e5);
  await p.evaluate(() => Sync.sincronizar()); await p.waitForFunction(async () => !(await Store.todos('levantamentos')).some(l => l.pendente), null, { timeout: 15000 });
  const lv = (await planilha('Levantamentos')).find(l => l.id === 'lev-v5-1');
  ok(lv && lv.codigoPropriedade === 'PRP-V5-1', 'levantamento pendente do aparelho foi enviado depois de atualizar o app', lv && lv.id);
  const abas5 = Object.keys((await (await fetch(API + '/__tudo')).json()).abas || (await (await fetch(API + '/__tudo')).json()));
  ok(!abas5.includes('CulturasAvaliadas') && !abas5.includes('Resultados'), 'as linhas antigas da visita não são mais enviadas (nem as abas existem)');
  ok(await p.evaluate(async () => (await Store.todos('culturasAvaliadas')).length + (await Store.todos('resultados')).length) === 2 && await p.evaluate(async () => (await Store.todos('levantamentos')).length) === 1, 'nada se perdeu no aparelho (levantamento e as duas linhas continuam lá)');

  console.log('3) levantamento antigo: só leitura, com PDF por programa, e sem como criar ou editar');
  await p.evaluate(async () => { await Store.gravar('pessoas', { id: '52998224725', tipo: 'PF', nome: 'PRODUTOR FICTICIO BANCO', pendente: 0, criadoEm: 1, atualizadoEm: 1 });
    await Store.gravar('levantamentos', { ...(await Store.obter('levantamentos', 'lev-v5-1')), pragas: JSON.stringify([{ praga: 'Phakopsora pachyrhizi', culturas: [{ cultura: 'Soja', area: '2', resultado: 'nao_detectada', coleta: 'Não', fotos: [] }] },
      { praga: 'Bactrocera carambolae', culturas: [{ cultura: 'Goiaba', area: '1', resultado: 'detectada', coleta: 'Não', fotos: [] }] }]) }); });
  await A.identificar(p);
  ok(await p.locator('#nav [data-v=pcelev]').count() === 0 && await p.locator('[data-pce=novolev], #pce-novolev').count() === 0, 'não há "Novo levantamento" no app');
  await p.evaluate(() => go('pceprodutor', '52998224725')); await p.waitForSelector('#pce-produtor');
  const item = p.locator('.pce-visita-item', { hasText: 'Levantamento antigo' });
  ok(await item.count() === 1 && /somente leitura/.test(await item.textContent()) && await item.locator('[data-pce=excluirlev], [data-pce=abrirlev], .excluir').count() === 0, 'na lista de visitas do produtor: "Levantamento antigo", só leitura, sem editar nem excluir');
  await item.locator('[data-pce=verlev]').click(); await p.waitForSelector('#pce-lev-ver');
  ok(/Somente leitura/.test(await p.textContent('#pce-lev-ver')) && /Phakopsora pachyrhizi/.test(await p.textContent('#pce-lev-res')) && /Detectada/.test(await p.textContent('#pce-lev-res')) && await p.locator('#pce-lev-ver input, #pce-lev-ver select, #pce-lev-ver textarea').count() === 0, 'tela do levantamento: resultados por cultura, sem nenhum campo para editar');
  const pdfs = await p.locator('.pce-pdfs [data-pce=imprimirlev]').allTextContents();
  ok(pdfs.length === 2 && pdfs.some(x => /Pragas da Soja/.test(x)) && pdfs.some(x => /Mosca-da-Carambola/.test(x)), 'um PDF por programa, como o Termo', pdfs);
  const pr = await A.imprimir(p, '.pce-pdfs [data-pce=imprimirlev] >> nth=0');
  ok(pr.paginas >= 1 && /PRODUTOR FICTICIO BANCO/.test(pr.texto), 'PDF do levantamento antigo abre no modelo próprio dele', pr.texto.slice(0, 200));
  const rota = await p.evaluate(() => { try { go('pcelev', 'lev-v5-1'); return 'abriu'; } catch (e) { return 'sem rota'; } });
  ok(rota === 'sem rota' && await p.locator('#pceLevForm').count() === 0, 'a rota antiga de edição do levantamento não existe mais');

  console.log('4) LGPD: módulo PCE retirado apaga o catálogo do aparelho, mas os levantamentos ficam');
  await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(800);
  ok(await p.evaluate(async () => !!(await Store.meta('catalogoPce'))), 'antes: o aparelho tem o catálogo');
  const rp = await U.permissoes(f2.usuario.id, ['campo']); ok(rp.ok, 'gerência tira o módulo PCE', rp);
  await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(1200);
  ok(await p.evaluate(async () => (await Store.meta('catalogoPce')) === undefined), 'sem o módulo: o catálogo some do aparelho');
  ok(await p.evaluate(async () => (await Store.todos('levantamentos')).length) === 1, 'o levantamento do próprio fiscal fica');
  ok(p.err.length === 0, 'sem erros de JavaScript', p.err);
  console.log('OK'); await b.close();
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
