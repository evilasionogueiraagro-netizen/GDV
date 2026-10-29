const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const PORTAL = require('./lib/portal');
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

  console.log('1b) troca no último dia, fiscal sem login e "gerar períodos"');
  // Jundiá: a equipe troca no último dia (15/10 a 24/10, 24/10 a 02/11): encostar no dia da troca não é sobreposição
  r = await post({ action: 'escalaSalvar', key: coord.token, escala: { bva: 'BVA - JUNDIÁ', inicio: '2027-01-04', fim: '2027-01-13', fiscais: [], situacao: 'rascunho' } });
  const j1 = r.escala.id;
  r = await post({ action: 'escalaSalvar', key: coord.token, escala: { bva: 'BVA - JUNDIÁ', inicio: '2027-01-13', fim: '2027-01-22', fiscais: [{ nome: 'Fulano Sem Login Teste' }, id('Ana Escalada Teste')], situacao: 'publicada' } });
  const j2 = r.escala.id;
  ok(r.ok && !r.avisos.some(a => /sobrepõe/.test(a)), 'troca no último dia: o período seguinte começa no fim do anterior, sem aviso de sobreposição', r.avisos);
  ok(r.escala.fiscais.some(f => f.nome === 'Fulano Sem Login Teste' && !f.id && f.semLogin === 1), 'fiscal sem login: nome digitado, marcado "sem login"', r.escala.fiscais);
  r = await post({ action: 'escalaSalvar', key: coord.token, escala: { bva: 'BVA - JUNDIÁ', inicio: '2027-01-20', fim: '2027-01-29', fiscais: [{ nome: 'ab' }] } });
  ok(!r.ok && /curto demais/.test(r.erro), 'nome sem login curto: recusa', r.erro);
  r = await post({ action: 'escalaGerar', key: coord.token, bva: 'BVA - JUNDIÁ', periodos: [{ inicio: '2027-01-22', fim: '2027-01-31' }, { inicio: '2027-01-31', fim: '2027-02-09' }, { inicio: '2027-01-10', fim: '2027-01-19' }] });
  ok(r.ok && r.criados === 2 && r.pulados === 1, 'gerar períodos: 2 rascunhos; o que se sobrepõe a uma escala existente é pulado', r);
  r = await post({ action: 'escalaGerar', key: f1.token, bva: 'BVA - JUNDIÁ', periodos: [{ inicio: '2027-03-01', fim: '2027-03-10' }] });
  ok(!r.ok && /Sem autorização/.test(r.erro), 'gerar: só a coordenação (ou a gerência no painel)');
  const DG = await post({ action: 'escalaDados', key: coord.token, de: '2027-01-01', ate: '2027-03-01' });
  ok(DG.ok && DG.escalas.filter(e => e.bva === 'BVA - JUNDIÁ' && e.inicio >= '2027-01-22').every(e => e.situacao === 'rascunho' && !e.fiscais.length) && DG.fimConvenio === '2027-04-01', 'gerados: rascunho sem fiscais; fim do convênio vem nos dados', DG.fimConvenio);

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
  // fim sugerido pelo regime da BVA: Jundiá 10 dias, CEASA 8, Aeroporto (12 h × 36 h) o mesmo dia; ajustável: o coordenador escolhe
  await pc.click('[data-escnova="BVA - JUNDIÁ"]'); await pc.waitForSelector('#fEscala');
  ok(/Período de 10 dias \(troca no último dia\): o fim vem sugerido/.test(await pc.textContent('#escRegime')), 'nova escala do Jundiá: mostra o regime (10 dias)');
  await pc.fill('#escIni', '2026-12-01'); await pc.dispatchEvent('#escIni', 'change');
  const fimJ = await pc.inputValue('#escFim');
  await pc.selectOption('#escBva', 'BVA - CEASA'); await pc.fill('#escIni', '2026-12-01'); await pc.dispatchEvent('#escIni', 'change');
  const fimC = await pc.inputValue('#escFim');
  await pc.selectOption('#escBva', 'BVA - AEROPORTO'); await pc.fill('#escIni', '2026-12-01'); await pc.dispatchEvent('#escIni', 'change');
  const fimA = await pc.inputValue('#escFim'), regA = await pc.textContent('#escRegime');
  ok(fimJ === '2026-12-10' && fimC === '2026-12-08' && fimA === '2026-12-01' && /12 h × 36 h/.test(regA), 'só o início: o fim vem pelo regime (Jundiá +9, CEASA +7, Aeroporto o mesmo dia)', [fimJ, fimC, fimA, regA]);
  ok(await pc.evaluate(() => { CONFIG.bvas.push({ nome: 'BVA - TABATINGA', escala: { regime: 'ajustavel' } }); const r = [CONFIG.fimEscala('BVA - TABATINGA', '2026-12-01'), CONFIG.proximoInicioEscala('BVA - AEROPORTO', { inicio: '2026-12-01', fim: '2026-12-01' })]; CONFIG.bvas.pop(); return r.join(); }) === ',2026-12-03',
    'ajustável (Tabatinga): sem fim sugerido; 12×36: o próximo plantão 2 dias depois');
  // gerar períodos do Jundiá a partir de 15/10 até o fim do ano: os mesmos da escala do papel (15/10 a 24/10 … 26/12 a 04/01)
  const gerados = await pc.evaluate(() => CONFIG.gerarPeriodosEscala('BVA - JUNDIÁ', '2026-10-15', '2026-12-31').map(p => p.inicio.slice(5) + '>' + p.fim.slice(5)).join(' '));
  ok(gerados === '10-15>10-24 10-24>11-02 11-02>11-11 11-11>11-20 11-20>11-29 11-29>12-08 12-08>12-17 12-17>12-26 12-26>01-04', 'Jundiá: períodos de 10 dias com troca no último dia, iguais aos do papel', gerados);
  const geradosC = await pc.evaluate(() => CONFIG.gerarPeriodosEscala('BVA - CEASA', '2026-10-04', '2026-11-28').map(p => p.inicio.slice(5) + '>' + p.fim.slice(5)).join(' '));
  ok(geradosC === '10-04>10-11 10-11>10-18 10-18>10-25 10-25>11-01 11-01>11-08 11-08>11-15 11-15>11-22 11-22>11-29', 'CEASA: períodos de 8 dias com troca no último dia, iguais aos do papel', geradosC);
  await pc.click('[data-go=escalas]'); await pc.waitForSelector('#escLista [data-escgerar="BVA - CEASA"]', { timeout: 15000 });
  ok(!(await pc.$('[data-escgerar="BVA - TABATINGA"]')), 'ajustável: sem "Gerar períodos"');
  await pc.click('[data-escgerar="BVA - CEASA"]'); await pc.waitForSelector('#fGerar #gerPrevia li');
  await pc.fill('#gerIni', '2027-02-01'); await pc.fill('#gerAte', '2027-02-28'); await pc.dispatchEvent('#gerAte', 'change');
  const prev = await pc.textContent('#gerPrevia');
  ok(/4 período\(s\) novo/.test(prev) && /01\/02\/2027 a 08\/02\/2027/.test(prev), 'app: prévia dos períodos da CEASA (8 dias)', prev);
  await pc.screenshot({ path: amb.saida('escala_gerar.png'), fullPage: true });
  await pc.click('#gerOk'); await pc.waitForSelector('#escLista [data-esc]', { timeout: 15000 });
  ok((await linhas('Escalas')).filter(x => x.bva === 'BVA - CEASA' && x.inicio >= '2027-02-01' && x.situacao === 'rascunho').length === 4, 'app: 4 rascunhos da CEASA criados');
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

  console.log('4) Portal do Administrativo: diárias das escalas (pendente → PCDP concluída)');
  const SA = await PORTAL.sessao('', '', 'Vera Diarias Administrativa');
  r = await post({ action: 'admEscalaPcdp', key: f1.token, escalaId: jundia, usuarioId: id('Ana Escalada Teste'), concluida: true });
  ok(!r.ok, 'fiscal sem o portal não marca PCDP', r.erro);
  let AE = await post({ action: 'admEscalas', sessao: SA.sessao });
  const ej = AE.escalas.find(e => e.id === jundia);
  ok(AE.ok && ej && ej.dias === 10 && ej.fiscais.length === 3 && ej.fiscais.every(f => !f.concluida && f.naEscala) && !AE.escalas.some(e => e.id === sobra), 'publicadas (coordenação e gerência) chegam ao portal: cada fiscal pendente; rascunho/excluída fora', ej);
  r = await post({ action: 'admEscalaPcdp', sessao: SA.sessao, escalaId: sobra, usuarioId: id('Bruno Escalado Teste'), concluida: true });
  ok(!r.ok && /não está publicada/.test(r.erro), 'escala excluída: recusa', r.erro);
  const pp = await PORTAL.abrir(b, SA, { aba: 'escalas' });
  await pp.waitForSelector(`#adm-esc [data-escala="${jundia}"] [data-pcdp=concluir]`, { timeout: 20000 });
  ok(/Pendente de solicitação de diárias/.test(await pp.textContent(`[data-escala="${jundia}"]`)) && Number(await pp.textContent('#adm-esc-npend .pn-kpi-val')) >= 3, 'portal: escala com os fiscais "Pendente de solicitação de diárias"');
  await pp.screenshot({ path: amb.saida('escala_portal.png'), fullPage: true });
  const linha = `[data-escala="${jundia}"] tr[data-fiscal="${id('Ana Escalada Teste')}"]`;
  await pp.fill(`${linha} .adm-esc-pcdp`, '1234/2026'); await pp.click(`${linha} [data-pcdp=concluir]`);
  await pp.waitForSelector(`${linha} [data-pcdp=desfazer]`, { timeout: 15000 });
  ok(/PCDP concluída/.test(await pp.textContent(linha)) && /1234\/2026/.test(await pp.textContent(linha)) && /Vera Diarias Administrativa/.test(await pp.textContent(linha)), 'marcar PCDP concluída (nº, quem e quando)');
  let P = (await linhas('EscalaPcdp')).find(x => x.id === jundia + '|' + id('Ana Escalada Teste'));
  ok(P && P.situacao === 'concluida' && P.pcdp === '1234/2026' && P.atualizadoPor === 'Vera Diarias Administrativa', 'aba EscalaPcdp gravada', P);
  ok((await linhas('AdmHistorico')).some(h => h.aba === 'EscalaPcdp' && h.acao === 'PCDP concluída'), 'histórico do portal');
  // a gerência altera a escala depois da PCDP: a linha fica marcada para conferir
  await new Promise(res => setTimeout(res, 20));
  r = await post({ action: 'painelEscalaSalvar', key: g.token, escala: { id: jundia, bva: 'BVA - JUNDIÁ', inicio: dia(-2), fim: dia(8), fiscais: [id('Ana Escalada Teste'), id('Bruno Escalado Teste')], situacao: 'publicada' } });
  AE = await post({ action: 'admEscalas', sessao: SA.sessao });
  const ej2 = AE.escalas.find(e => e.id === jundia), ana = ej2.fiscais.find(f => f.nome === 'Ana Escalada Teste');
  ok(r.ok && ana.concluida && ana.alterada && ej2.fiscais.some(f => f.nome === 'Diego Duplo Teste' && !f.naEscala) === false, 'escala alterada depois da PCDP: "confira"; quem saiu sem PCDP some', ej2.fiscais);
  // desfazer
  await pp.click('#adm-esc-atualizar'); await pp.waitForSelector(`${linha} [data-pcdp=desfazer]`, { timeout: 15000 });
  ok(/escala alterada depois: confira/.test(await pp.textContent(linha)), 'portal: aviso "escala alterada depois: confira"');
  await pp.click(`${linha} [data-pcdp=desfazer]`); await pp.waitForSelector(`${linha} [data-pcdp=concluir]`, { timeout: 15000 });
  P = (await linhas('EscalaPcdp')).find(x => x.id === jundia + '|' + id('Ana Escalada Teste'));
  ok(P.situacao === 'pendente' && P.pcdp === '', 'desfazer: volta a pendente', P);
  AE = await post({ action: 'admEscalas', sessao: SA.sessao });
  const esem = AE.escalas.find(e => e.id === j2), fsem = esem && esem.fiscais.find(f => f.semLogin);
  ok(fsem && fsem.nome === 'Fulano Sem Login Teste', 'portal: fiscal sem login também fica pendente de diárias', esem && esem.fiscais);
  r = await post({ action: 'admEscalaPcdp', sessao: SA.sessao, escalaId: j2, usuarioId: fsem.usuarioId, concluida: true, pcdp: '9/2027' });
  ok(r.ok && r.situacao === 'concluida', 'portal: PCDP do fiscal sem login', r);
  ok(!pp.errosPag.length, 'portal sem erros', pp.errosPag);
  await pp.context().close();
  ok(!err.length, 'sem erros de página', err);
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
