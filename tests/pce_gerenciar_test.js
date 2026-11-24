const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const A = require('./lib/pce-app');
// PCE, "Gerenciar termos realizados" no app (Chromium + Code.gs real): a lista de Termos consulta os de todos os servidores (online); quem não tem a
// permissão só vê e imprime; quem tem edita o Termo do papel e cancela o de visita, e o autor continua o mesmo com a auditoria gravada.
// A parte do servidor (recusa, antes/depois, TF) está em pce_gerenciar_server_test. Dados fictícios.
const B = amb.API;
const post = b => fetch(B + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const lerAba = async n => (await (await fetch(B + '/__fn?nome=lerLeitura_&args=' + encodeURIComponent(JSON.stringify([n])))).json()).r;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' -> ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };
const toast = p => p.evaluate(() => (document.querySelector('.toast, #toast') || {}).textContent || '');
(async () => {
  const b = await amb.lancar(), ANO = new Date().getFullYear(), agora = Date.now(), CPF = '52998224725';
  const perm = o => ({ permissoes: U.lista({ veiculos: 1, tf: 1, pce: 1, ...o }) });
  const autora = await U.fiscal('Pessoa Ficticia Autora Tela', perm({ antigo: 1 }));
  const CARGO = 'Fiscal Agropecuário Engenheiro Agrônomo';
  const termo = (id, numero, extra = {}) => ({ id, unidade: 'ITACOATIARA', ano: ANO, numero, numeroSugerido: numero, numeroOrigem: 'papel', conflito: 0, propriedadeId: 'P-TELA', programa: 'moniliase',
    doc: CPF, nome: 'FULANO FICTICIO TESTE', municipio: 'Itacoatiara', uf: 'AM', data: `${ANO}-03-10`, hora: '10:00', servidor: 'Pessoa Ficticia Autora Tela', cargo: CARGO, matricula: '77', lotacao: 'Itacoatiara',
    pragas: '["Monilíase"]', acoes: '["Fiscalização"]', tipoLocal: '[]', testemunhas: '[]', cancelado: 0, excluido: 0, criadoEm: agora + numero, atualizadoEm: agora + numero, registroAntigo: 1,
    fotos: '[]', assinaturas: '{}', documentos: '[]', hospedeiros: '[]', ...extra });
  const papel = termo('tela-papel', 1), visita = termo('tela-visita', 2, { registroAntigo: 0, numeroOrigem: 'sistema', visitaId: 'v-tela', programaVisita: 'Monilíase do Cacaueiro',
    culturas: JSON.stringify([{ cultura: 'Cacau', area: 1, pragas: [{ praga: 'Monilíase do Cacaueiro', resultado: 'nao_detectada' }], coleta: 'Não', fotos: [] }]) });
  let r = await post({ action: 'sync', key: autora.token, since: 0, propriedades: [{ id: 'P-TELA', nome: 'Sitio Tela Ficticio', doc: CPF, municipio: 'Itacoatiara', criadoEm: agora, atualizadoEm: agora }], termosPce: [papel, visita] });
  ok(r.ok && !Object.keys(r.recusados).length, 'a autora gravou o Termo do papel e o Termo de visita', r.recusados);

  console.log('1) quem só tem o PCE: vê e imprime os Termos de outros servidores, sem editar nem cancelar');
  const L = await A.aparelho(b, 'Pessoa Ficticia Leitora Tela', { conta: perm({}) });
  await A.identificar(L);
  await L.click('nav [data-v=pcetermos]'); await L.waitForSelector('#pce-todos');
  ok(await L.locator('#pceTItens .item').count() === 0, 'a lista do aparelho continua só com os próprios (vazia)');
  await L.click('#pce-g-buscar'); await L.waitForSelector('.pce-g-item');
  ok(await L.locator('.pce-g-item').count() === 2 && /Autor: Pessoa Ficticia Autora Tela/.test(await L.textContent('#pceGItens')), 'a busca na planilha lista os 2 Termos da autora e mostra o autor');
  ok(await L.locator('.pce-g-item [data-pce=gpdf]').count() === 2 && await L.locator('.pce-g-item [data-pce=gabrir]').count() === 0 && await L.locator('.pce-g-item [data-pce=gcancelar]').count() === 0, 'sem a permissão: só PDF (sem "Abrir e editar" nem "Cancelar")');
  await L.fill('#pceGQ', 'cacau'); await L.click('#pce-g-buscar'); await L.waitForFunction(() => document.querySelectorAll('.pce-g-item').length === 1);
  ok(true, 'filtro por texto (cultura) na planilha');
  await L.click('.pce-g-item [data-pce=gpdf]');
  await L.waitForFunction(() => (window.__prints || []).length > 0, null, { timeout: 20000 });
  ok(/FULANO FICTICIO TESTE/i.test(await L.evaluate(() => window.__prints[0].texto)), 'PDF/impressão do Termo de outro servidor abre');
  ok(await L.evaluate(async () => (await Store.obter('termosPce', 'tela-visita') || {}).deOutro === 1), 'a cópia fica no aparelho marcada como de outro servidor');
  ok(await L.evaluate(async () => (await Sync.visiveis('termosPce', await Store.todos('termosPce'))).length === 0), 'e não aparece nas listas do login');
  await L.click('nav [data-v=pce]'); await L.waitForSelector('#campo-novo'); await L.click('nav [data-v=pcetermos]'); await L.waitForSelector('#pce-todos');
  ok(await L.evaluate(async () => (await Store.todos('termosPce')).length === 0), 'ao reabrir a lista, a cópia já enviada/consultada sai do aparelho');
  await L.ctx.setOffline(true); await L.evaluate(() => window.dispatchEvent(new Event('offline')));
  await L.click('#pce-g-buscar'); await L.waitForFunction(() => /Sem internet/.test((document.querySelector('#pceGItens') || {}).textContent || ''));
  ok(true, 'sem internet: avisa que a consulta aos outros servidores precisa de conexão');
  await L.ctx.setOffline(false); await L.evaluate(() => window.dispatchEvent(new Event('online')));
  ok(!L.err.length, 'console limpo (leitora)', L.err);
  await L.ctx.close();

  console.log('2) quem tem "Gerenciar termos realizados": edita o Termo do papel e cancela o de visita; autor e auditoria');
  const G = await A.aparelho(b, 'Pessoa Ficticia Gestora Tela', { conta: perm({ antigo: 1 }) });
  await A.identificar(G);
  await G.click('nav [data-v=pcetermos]'); await G.waitForSelector('#pce-todos');
  ok(/Gerenciar termos realizados/.test(await G.textContent('.pce-papel h3')), 'o cartão do papel se chama "Gerenciar termos realizados"');
  await G.click('#pce-g-buscar'); await G.waitForSelector('.pce-g-item');
  ok(await G.locator('.pce-g-item [data-pce=gabrir]').count() === 1 && await G.locator('.pce-g-item [data-pce=gcancelar]').count() === 2, 'com a permissão: "Abrir e editar" só no Termo do papel; "Cancelar" nos dois');
  await G.click('.pce-g-item[data-gid=tela-papel] [data-pce=gabrir]'); await G.waitForSelector('#monTfForm.pce-antigo');
  ok((await G.inputValue('#mt-nome')) === 'FULANO FICTICIO TESTE' && (await G.inputValue('#mt-snome')) === 'Pessoa Ficticia Autora Tela', 'o Termo de outro servidor abre preenchido (inclusive o servidor que fez a vistoria)');
  await G.fill('#mt-nome', 'Beltrano Ficticio Corrigido'); await G.click('#mt-salvar'); await G.waitForSelector('#mon-pronto', { timeout: 15000 });
  await G.evaluate(() => Sync.sincronizar());
  await G.waitForFunction(async () => !(await Store.obter('termosPce', 'tela-papel')).pendente, null, { timeout: 15000 });
  let t = (await lerAba('TermosPCE')).find(x => x.id === 'tela-papel');
  ok(t.nome === 'BELTRANO FICTICIO CORRIGIDO' && t.usuario === autora.nome, 'planilha: nome corrigido e o autor continua a autora', [t.nome, t.usuario]);
  let h = (await lerAba('HistoricoDeAlteracoes')).filter(x => x.registroId === 'tela-papel');
  ok(h.length === 1 && h[0].usuarioId === G.conta.usuario.id && JSON.parse(h[0].antes).nome === 'FULANO FICTICIO TESTE' && JSON.parse(h[0].depois).nome === 'BELTRANO FICTICIO CORRIGIDO', 'auditoria: quem alterou e antes/depois do nome', h);
  await G.click('nav [data-v=pcetermos]'); await G.waitForSelector('#pce-todos'); await G.click('#pce-g-buscar'); await G.waitForSelector('.pce-g-item[data-gid=tela-visita]');
  await G.click('.pce-g-item[data-gid=tela-visita] [data-pce=gcancelar]');   // o prompt é aceito pelo helper com um motivo
  await G.waitForFunction(() => document.querySelector('.pce-g-item[data-gid=tela-visita]') && /CANCELADO/.test(document.querySelector('.pce-g-item[data-gid=tela-visita]').textContent), null, { timeout: 15000 });
  await G.evaluate(() => Sync.sincronizar());
  await G.waitForFunction(async () => { const x = await Store.obter('termosPce', 'tela-visita'); return !x || !x.pendente; }, null, { timeout: 15000 });
  t = (await lerAba('TermosPCE')).find(x => x.id === 'tela-visita');
  ok(t.cancelado === 1 && t.usuario === autora.nome, 'planilha: Termo de visita cancelado pela gestora, autor mantido');
  h = (await lerAba('HistoricoDeAlteracoes')).filter(x => x.registroId === 'tela-visita');
  ok(h.length === 1 && JSON.parse(h[0].depois).cancelado === '1' && JSON.parse(h[0].antes).cancelado === '0', 'auditoria do cancelamento', h);
  ok(!G.err.length, 'console limpo (gestora)', G.err);
  await G.ctx.close();
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'FALHOU=0');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error('  ✗ erro: ' + (e.stack || e)); process.exitCode = 1; });
