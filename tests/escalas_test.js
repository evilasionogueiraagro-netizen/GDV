const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Escalas de plantão (escalas.gs): a coordenação de barreira e trânsito (permissão coordenacaoBarreiras) monta no app a equipe de cada
// BVA por período (início e fim variáveis por BVA); a gerência vê e edita no painel. Rascunho → publicada (só a publicada chega ao
// fiscal, no sync: minhasEscalas). Avisos de fiscal em duas BVAs e de período sobreposto; excluir é lógico; tudo em
// HistoricoDeAlteracoes. App: módulo só para quem tem a permissão; "Sua escala" e a BVA proposta ao iniciar o turno. Dados fictícios.
const { API, APP } = amb;
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
const dia = n => new Date(Date.parse(hoje + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const linhas = async aba => { const d = await (await fetch(API + '/__tudo')).json(); const l = d[aba] || []; return l.slice(1).map(r => Object.fromEntries(l[0].map((k, i) => [k, r[i]]))); };

(async () => {
  console.log('1) servidor: permissão, rascunho, publicação, avisos, painel e exclusão');
  const coord = await U.fiscal('Carla Coordenadora Teste', { permissoes: ['campo', 'fiscalizacaoDeTransito', 'coordenacaoBarreiras'] });
  const f1 = await U.fiscal('Ana Escalada Teste'), f2 = await U.fiscal('Bruno Escalado Teste'), f3 = await U.fiscal('Diego Duplo Teste');
  ok(coord.modulos && coord.modulos.escala === 1 && f1.modulos.escala === 0, 'módulo "escala" só para quem tem coordenacaoBarreiras', [coord.modulos, f1.modulos]);
  let r = await post({ action: 'escalaDados', key: f1.token }); ok(!r.ok && /Sem autorização para montar escalas/.test(r.erro), 'fiscal sem a permissão: recusado', r.erro);
  const D = await post({ action: 'escalaDados', key: coord.token });
  const id = n => D.fiscais.find(f => f.nome === n).id;
  ok(D.ok && ['Ana Escalada Teste', 'Bruno Escalado Teste', 'Diego Duplo Teste'].every(n => D.fiscais.some(f => f.nome === n)), 'lista de fiscais com o app de campo', D.erro);
  r = await post({ action: 'escalaSalvar', key: coord.token, escala: { bva: 'BVA - JUNDIÁ', inicio: dia(-2), fim: dia(7), fiscais: [id('Ana Escalada Teste'), id('Diego Duplo Teste')], situacao: 'rascunho' } });
  ok(r.ok && r.escala.situacao === 'rascunho' && r.escala.fiscais.length === 2, 'rascunho gravado (Jundiá, 10 dias)', r.erro);
  const jundia = r.escala.id;
  let s1 = await post({ action: 'sync', key: f1.token, since: 0 });
  ok(s1.ok && !(s1.minhasEscalas || []).length, 'rascunho não chega ao fiscal');
  r = await post({ action: 'escalaSalvar', key: coord.token, escala: { id: jundia, bva: 'BVA - JUNDIÁ', inicio: dia(-2), fim: dia(7), fiscais: [id('Ana Escalada Teste'), id('Diego Duplo Teste')], situacao: 'publicada' } });
  ok(r.ok && r.escala.situacao === 'publicada' && r.escala.publicadaPor === 'Carla Coordenadora Teste', 'publicada (quem e quando)', r);
  r = await post({ action: 'escalaSalvar', key: coord.token, escala: { bva: 'BVA - CEASA', inicio: dia(0), fim: dia(6), fiscais: [id('Bruno Escalado Teste'), id('Diego Duplo Teste')], situacao: 'publicada' } });
  ok(r.ok && r.avisos.some(a => /Diego Duplo Teste também está na BVA - JUNDIÁ/.test(a)), 'aviso: o mesmo fiscal em duas BVAs no período (não bloqueia)', r.avisos);
  const ceasa = r.escala.id;
  r = await post({ action: 'escalaSalvar', key: coord.token, escala: { bva: 'BVA - JUNDIÁ', inicio: dia(5), fim: dia(14), fiscais: [id('Bruno Escalado Teste')], situacao: 'rascunho' } });
  ok(r.ok && r.avisos.some(a => /Já há escala da BVA - JUNDIÁ que se sobrepõe/.test(a)), 'aviso: período sobreposto na mesma BVA', r.avisos);
  const sobra = r.escala.id;
  for (const [e, re] of [[{ bva: '', inicio: dia(0), fim: dia(1), fiscais: [] }, /Escolha a BVA/], [{ bva: 'BVA - CEASA', inicio: dia(3), fim: dia(1), fiscais: [] }, /antes do início/],
    [{ bva: 'BVA - CEASA', inicio: dia(0), fim: dia(80), fiscais: [] }, /longo demais/], [{ bva: 'BVA - CEASA', inicio: dia(0), fim: dia(3), fiscais: ['nao-existe'] }, /não encontrado/],
    [{ bva: 'BVA - CEASA', inicio: dia(0), fim: dia(3), fiscais: [], situacao: 'publicada' }, /pelo menos um fiscal/]]) {
    const x = await post({ action: 'escalaSalvar', key: coord.token, escala: e }); ok(!x.ok && re.test(x.erro), 'validação: ' + re.source, x.erro);
  }
  s1 = await post({ action: 'sync', key: f1.token, since: 0 });
  const me = (s1.minhasEscalas || [])[0];
  ok(me && me.bva === 'BVA - JUNDIÁ' && me.inicio === dia(-2) && me.equipe.join() === 'Ana Escalada Teste,Diego Duplo Teste', 'fiscal recebe a própria escala publicada no sync (com a equipe)', s1.minhasEscalas);
  const s3 = await post({ action: 'sync', key: f3.token, since: 0 });
  ok((s3.minhasEscalas || []).length === 2, 'fiscal em duas escalas recebe as duas', s3.minhasEscalas);

  const g = await amb.gerente('Gerente Escalas Teste'), leitor = await amb.usuario('Leitor Painel Teste', { aplicativo: 'painel', permissoes: ['painel'] });
  r = await post({ action: 'painelEscalas', key: g.token });
  ok(r.ok && r.escalas.some(e => e.id === jundia) && r.escalas.some(e => e.id === ceasa), 'painel: gerente vê as escalas', r.erro);
  r = await post({ action: 'painelEscalas', key: leitor.token }); ok(r.ok, 'painel só leitura também vê');
  r = await post({ action: 'painelEscalaSalvar', key: leitor.token, escala: { id: ceasa, bva: 'BVA - CEASA', inicio: dia(0), fim: dia(6), fiscais: [], situacao: 'rascunho' } });
  ok(!r.ok && /Só a gerência/.test(r.erro), 'painel só leitura não edita', r.erro);
  r = await post({ action: 'painelEscalaSalvar', key: g.token, escala: { id: ceasa, bva: 'BVA - CEASA', inicio: dia(0), fim: dia(6), fiscais: [id('Bruno Escalado Teste')], situacao: 'publicada' } });
  ok(r.ok && r.escala.fiscais.length === 1 && r.escala.atualizadoPor === 'Gerente Escalas Teste', 'gerente edita pelo painel', r.erro);
  r = await post({ action: 'painelEscalaExcluir', key: g.token, id: sobra }); ok(r.ok, 'gerente exclui');
  const L = await linhas('Escalas');
  ok(L.find(x => x.id === sobra) && Number(L.find(x => x.id === sobra).excluido) === 1 && !(await post({ action: 'escalaDados', key: coord.token })).escalas.some(e => e.id === sobra), 'exclusão lógica: a linha fica, some das telas');
  const H = (await linhas('HistoricoDeAlteracoes')).filter(x => x.tabela === 'Escalas');
  ok(H.filter(x => x.acao === 'criar escala').length === 3 && H.some(x => x.acao === 'alterar escala') && H.some(x => x.acao === 'excluir escala'), 'histórico: criar, alterar e excluir', H.map(x => x.acao));

  console.log('2) app de campo: módulo só para a coordenação; montar a escala; o fiscal vê a escala ao iniciar o turno');
  const b = await amb.lancar(), err = [];
  const aparelho = async (sess, nome) => {
    const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -2.0, longitude: -60.0 } });
    await c.addInitScript(([t, n]) => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } }, [sess.token, nome]);
    const p = await c.newPage(); p.on('pageerror', e => err.push(nome + ': ' + e.message)); p.on('dialog', d => d.accept());
    await p.goto(APP); await p.waitForSelector('.modulo[data-v=home]', { timeout: 20000 });
    await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(800); await p.evaluate(() => go('modulos')); await p.waitForTimeout(300);
    return p;
  };
  const pa = await aparelho(f1, 'Ana Escalada Teste');
  ok(!(await pa.$('.modulo[data-v=escalas]')), 'fiscal sem a permissão: sem o cartão "Escalas de plantão"');
  await pa.waitForSelector('#escPop', { timeout: 10000 });
  const card = await pa.textContent('#escPop');
  ok(/Sua escala de plantão/.test(card) && /BVA - JUNDIÁ/.test(card) && /Diego Duplo Teste/.test(card), 'tela inicial: aviso "Sua escala de plantão" (janela por cima) com a BVA, o período e a equipe', card);
  await pa.screenshot({ path: amb.saida('escala_fiscal.png') });
  await pa.click('#escPopOk'); ok(!(await pa.$('#escPop')), '"Entendi" fecha o aviso');
  await pa.evaluate(() => go('modulos')); await pa.waitForTimeout(500);
  ok(!(await pa.$('#escPop')), 'visto: não volta a aparecer (até a escala mudar)');
  await pa.click('.modulo[data-v=home]'); await pa.waitForSelector('#fTurno #nLocal', { timeout: 15000 }); await pa.waitForTimeout(400);
  ok(!(await pa.$('#suaEscala')) && (await pa.inputValue('#nLocal')) === 'BVA - JUNDIÁ', 'iniciar turno: sem o cartão, a BVA da escala já escolhida', await pa.inputValue('#nLocal'));

  const pc = await aparelho(coord, 'Carla Coordenadora Teste');
  ok(!!(await pc.$('.modulo[data-v=escalas]')), 'coordenação: cartão "Escalas de plantão" nos módulos');
  await pc.click('.modulo[data-v=escalas]'); await pc.waitForSelector('#escLista [data-esc]', { timeout: 15000 });
  const lista = await pc.textContent('#escLista');
  ok(/BVA - JUNDIÁ/.test(lista) && /Ana Escalada Teste/.test(lista) && /BVA - CEASA/.test(lista), 'lista das escalas por BVA e período', lista.slice(0, 300));
  await pc.screenshot({ path: amb.saida('escala_lista.png'), fullPage: true });
  await pc.click('[data-escnova]'); await pc.waitForSelector('#fEscala');
  await pc.selectOption('#escBva', 'BVA - AEROPORTO'); await pc.fill('#escIni', dia(1)); await pc.fill('#escFim', dia(5));
  await pc.check(`#fEscala input[data-fiscal="${id('Ana Escalada Teste')}"]`);
  ok(/BVA - JUNDIÁ/.test(await pc.textContent(`#fEscala label:has(input[data-fiscal="${id('Ana Escalada Teste')}"])`)), 'escolher fiscal: mostra quem já está em outra BVA no período');
  await pc.screenshot({ path: amb.saida('escala_form.png'), fullPage: true });
  await pc.click('#escPublicar'); await pc.waitForSelector('#escLista [data-esc]', { timeout: 15000 }); await pc.waitForTimeout(300);
  const L2 = (await linhas('Escalas')).find(x => x.bva === 'BVA - AEROPORTO');
  ok(L2 && L2.situacao === 'publicada' && JSON.parse(L2.fiscais)[0].nome === 'Ana Escalada Teste' && L2.atualizadoPor === 'Carla Coordenadora Teste', 'app: escala publicada pela coordenação', L2);
  ok(/também está na BVA - JUNDIÁ/.test(await pc.textContent('#escAvisos').catch(() => '')), 'app: avisos depois de publicar');

  console.log('3) painel: aba Escalas (anterior/atual/próxima, hoje × turnos, fora da escala) e edição pela gerência');
  const ag = Date.now(), hIni = new Date(Date.now() - 5 * 3600e3).toISOString().slice(11, 16);   // começou há 1 h (Manaus)
  r = await post({ action: 'sync', key: f1.token, since: 0, turnos: [{ id: 'turno-fora-1', numeroTF: 'TF-801-A-' + hoje.slice(0, 4), data: hoje, letra: 'A', inicio: hIni, fim: '', fiscal: 'Ana Escalada Teste',
    local: 'BVA - CEASA', unidade: 'BVA - CEASA', posto: 'Fixa', encerrado: 0, criadoEm: ag, atualizadoEm: ag }] });
  ok(r.ok, 'Ana (escalada no Jundiá) abre turno na CEASA', r.erro);
  const cg = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block' });
  await cg.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.painel.token', i.t); localStorage.setItem('gdv.painel.nome', i.n); } }, { t: g.token, n: g.nome });
  const G = await cg.newPage(); G.on('pageerror', x => err.push('painel: ' + x.message)); G.on('dialog', d => d.accept());
  await G.goto(amb.PAINEL); await G.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 30000 });
  await G.click('.pn-aba[data-aba=escalas]'); await G.waitForSelector('#pn-esc-tab', { timeout: 15000 });
  const tab = (await G.textContent('#pn-esc-tab')).replace(/\s+/g, ' ');
  ok(/BVA - JUNDIÁ/.test(tab) && /Ana Escalada Teste, Diego Duplo Teste/.test(tab) && /BVA - AEROPORTO/.test(tab) && /Bruno Escalado Teste/.test(tab), 'tabela por BVA com os nomes', tab.slice(0, 300));
  const hj = (await G.textContent('#pn-esc-hoje')).replace(/\s+/g, ' ');
  ok(/Ana Escalada Teste abriu turno na BVA - CEASA às \d\d:\d\d; escalado na BVA - JUNDIÁ/.test(hj) && /Sem turno Bruno Escalado Teste/.test(hj), 'hoje: fora da escala e escalado sem turno', hj);
  await G.screenshot({ path: amb.saida('escala_painel.png'), fullPage: true });
  await G.click(`#pn-esc-tab [data-esc="${jundia}"]`); await G.waitForSelector('#pn-esc-dlg[open]');
  await G.check(`#pn-esc-dlg input[data-fiscal="${id('Bruno Escalado Teste')}"]`); await G.click('#pn-esc-publicar');
  await G.waitForSelector('#pn-esc-dlg', { state: 'detached', timeout: 15000 }); await G.waitForTimeout(800);
  const jx = (await linhas('Escalas')).find(x => x.id === jundia);
  ok(JSON.parse(jx.fiscais).some(f => f.nome === 'Bruno Escalado Teste') && jx.atualizadoPor === 'Gerente Escalas Teste', 'gerente edita a escala pelo painel', jx);
  ok(/Bruno Escalado Teste também está na BVA - CEASA/.test(await G.textContent('#pn-conteudo')), 'painel: avisos depois de gravar');
  await cg.close();
  ok(!err.length, 'sem erros de página', err);
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
