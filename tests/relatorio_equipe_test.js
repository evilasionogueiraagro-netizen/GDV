const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Relatório da equipe (relatorio-equipe.gs): um por escala publicada, com o nº da equipe e o responsável (da escala) e os números de
// todos os turnos da equipe no período (veículos, TFs, apreensões, kg, rechaços, educação sanitária). Veem os fiscais da escala e a
// coordenação; editam o responsável, a coordenação e a gerência (painel). App: lista, tela e PDF com cabeçalho e rodapé. Dados fictícios.
const { API, APP } = amb;
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const fn = (nome, args) => fetch(API + '/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args))).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 500))); if (!c) falhas++; };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
const dia = n => new Date(Date.parse(hoje + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const linhas = async aba => { const d = await (await fetch(API + '/__tudo')).json(); const l = d[aba] || []; return l.slice(1).map(r => Object.fromEntries(l[0].map((k, i) => [k, r[i]]))); };

(async () => {
  console.log('1) escala com nº da equipe e responsável');
  const coord = await U.fiscal('Carla Coordenadora Teste', { permissoes: ['campo', 'fiscalizacaoDeTransito', 'coordenacaoBarreiras'] });
  const A = await U.fiscal('Ana Responsavel Teste'), B = await U.fiscal('Bruno Equipe Teste'), C = await U.fiscal('Ciro Fora Teste');
  const esc = e => post({ action: 'escalaSalvar', key: coord.token, escala: { bva: 'BVA - JUNDIÁ', fiscais: [A.usuario.id, B.usuario.id], situacao: 'publicada', ...e } });
  let r = await esc({ inicio: dia(-9), fim: dia(0), equipeNumero: 'x' });
  ok(!r.ok && /Nº da equipe/.test(r.erro), 'nº da equipe só com números', r.erro);
  r = await esc({ inicio: dia(-9), fim: dia(0), equipeNumero: '33', responsavel: C.usuario.id });
  ok(r.ok && r.escala.responsavel === '' && r.avisos.some(a => /não está na equipe/.test(a)), 'responsável fora da equipe: fica sem, com aviso', r.avisos);
  r = await esc({ id: r.escala.id, inicio: dia(-9), fim: dia(0), equipeNumero: '33', responsavel: A.usuario.id });
  ok(r.ok && r.escala.equipeNumero === '33' && r.escala.responsavel === A.usuario.id, 'escala com equipe 33 e responsável', r.escala);
  const eid = r.escala.id;
  const s = await post({ action: 'sync', key: A.token, since: 0 });
  ok((s.minhasEscalas || []).some(x => x.id === eid && x.equipeNumero === '33'), 'sync: a escala do fiscal traz o nº da equipe');

  console.log('2) números de todos os turnos da equipe no período');
  const ag = Date.now(), T = (id, o) => ({ id, numeroTF: 'TF-001-A-' + hoje.slice(0, 4), data: dia(-3), inicio: '08:00', fim: '18:00', fiscal: A.nome, local: 'BVA - JUNDIÁ',
    unidade: 'Presidente Figueiredo', posto: 'Fixa', encerrado: 1, criadoEm: ag, atualizadoEm: ag, usuario: A.nome, ...o });
  await fn('inserir_', ['Turnos', [T('t1', {}), T('t2', { data: dia(-1), usuario: C.nome, fiscal: C.nome, colegas: JSON.stringify([B.nome]) }),
    T('t3', { data: dia(-2), usuario: C.nome, fiscal: C.nome }), T('t4', { local: 'BVA - CEASA' }), T('t5', { cancelado: 1 }), T('t6', { data: dia(-12) })]]);
  const V = (id, turnoId, pessoas, o) => ({ id, turnoId, hora: '09:00', placa: 'ABC1D23', tipo: 'PA', pessoas, excluido: 0, criadoEm: ag, atualizadoEm: ag, ...o });
  await fn('inserir_', ['Veiculos', [V('v1', 't1', 3), V('v2', 't1', 2), V('v3', 't1', 9, { excluido: 1 }), V('v4', 't2', 4), V('v5', 't3', 7), V('v6', 't4', 5), V('v7', 't5', 5)]]);
  const F = (id, o) => ({ id, barreira: 'BVA-JUNDIA', ano: Number(hoje.slice(0, 4)), numero: 1, numeroTxt: id.toUpperCase(), turnoId: 't1', data: dia(-3), hora: '10:00',
    fiscal: A.nome, usuario: A.nome, procedimento: 'liberacao', cancelado: 0, produtos: '[]', criadoEm: ag, atualizadoEm: ag, ...o });
  await fn('inserir_', ['TFs', [
    F('tfa', { procedimento: 'apreensao', produtos: JSON.stringify([{ p: 'LARANJA', q: '100', u: 'Kg' }, { p: 'MANGA', q: '0,5', u: 'Ton' }, { p: 'GOIABA', q: '3', u: 'Caixas' }]) }),
    F('tfb', { procedimento: 'rechaco', turnoId: 't2' }), F('tfc', { turnoId: '', data: dia(-2) }), F('tfd', { cancelado: 1, procedimento: 'apreensao' }),
    F('tfe', { turnoId: 't3', procedimento: 'apreensao' }), F('tff', { turnoId: '', data: dia(-2), usuario: C.nome, fiscal: C.nome })]]);
  r = await post({ action: 'relEquipe', key: A.token, escalaId: eid });
  const N = r.numeros || {};
  ok(r.ok && N.turnos === 2 && N.veiculos === 3 && N.educacao === 9, 'turnos da equipe (dono ou colega pelo código), sem cancelado, de outra BVA ou fora do período; veículos e educação sanitária', N);
  ok(N.tfs === 3 && N.apreensoes === 1 && N.rechacos === 1 && N.liberacoes === 1 && N.numerosTF.join() === 'TFA,TFB,TFC', 'TFs dos turnos + o sem turno lavrado por fiscal da equipe (sem cancelado nem de quem é de fora)', N);
  ok(N.kg === 600 && N.outras.Caixas === 3, 'kg apreendidos: Kg + Ton × 1000; caixas à parte', [N.kg, N.outras]);
  ok(N.apreendidos.length === 3 && N.apreendidos.map(x => `${x.tf}:${x.p}:${x.q}:${x.u}`).join('|') === '1:LARANJA:100:Kg|1:MANGA:0.5:Ton|1:GOIABA:3:Caixas',
    'Termo de Repasse: cada produto apreendido da equipe (nº do TF, produto, quantidade, unidade)', N.apreendidos);
  ok(r.editar === true && !r.dados && !r.anterior, 'responsável pode editar; nada salvo ainda');

  console.log('3) quem vê e quem edita');
  let l = await post({ action: 'relEquipeLista', key: A.token });
  ok(l.ok && l.escalas.some(e => e.id === eid && e.editar && e.equipeNumero === '33'), 'lista do responsável', l);
  l = await post({ action: 'relEquipeLista', key: B.token });
  ok(l.escalas.some(e => e.id === eid && !e.editar), 'integrante vê, sem editar');
  l = await post({ action: 'relEquipeLista', key: C.token });
  ok(l.ok && !l.escalas.some(e => e.id === eid), 'quem não é da equipe não vê');
  r = await post({ action: 'relEquipe', key: C.token, escalaId: eid });
  ok(!r.ok && /só da equipe/.test(r.erro), 'fora da equipe: relatório recusado', r.erro);
  r = await post({ action: 'relEquipeSalvar', key: B.token, escalaId: eid, dados: { objetivo: 'x' } });
  ok(!r.ok && /Só o responsável/.test(r.erro), 'integrante não grava', r.erro);
  r = await post({ action: 'relEquipeSalvar', key: A.token, escalaId: eid, dados: { kg: 'muito' } });
  ok(!r.ok && /use só números/.test(r.erro), 'kg só com números', r.erro);
  r = await post({ action: 'relEquipeSalvar', key: A.token, escalaId: eid, dados: { repasseItens: [{ tf: '1', p: 'LARANJA', u: 'Kg', q: 'muito' }] } });
  ok(!r.ok && /quantidade inválida em "LARANJA"/.test(r.erro), 'Termo de Repasse: quantidade só com números', r.erro);
  r = await post({ action: 'relEquipeSalvar', key: A.token, escalaId: eid, dados: { local: 'Local Ficticio', objetivo: 'Objetivo ficticio do teste.', deslocamento: 'Manaus/AM x Ficticio',
    intro: 'Intro ficticia:', kg: '650,5', repasse: '1', obs: 'Anexo Termos de Fiscalização.', cpf: '52998224725' } });
  ok(r.ok && r.salvoPor === A.nome, 'responsável grava', r.erro);
  r = await post({ action: 'relEquipe', key: B.token, escalaId: eid });
  ok(r.ok && r.dados.objetivo === 'Objetivo ficticio do teste.' && r.dados.kg === '650,5' && !('cpf' in r.dados) && r.salvoPor === A.nome, 'integrante lê o salvo (só os campos do relatório)', r.dados);
  r = await post({ action: 'relEquipeSalvar', key: coord.token, escalaId: eid, dados: { local: 'Local Ficticio', objetivo: 'Objetivo ficticio do teste.', deslocamento: 'Manaus/AM x Ficticio', intro: 'Intro ficticia:', kg: '650,5', repasse: '2', obs: 'Anexo Termos de Fiscalização.' } });
  ok(r.ok, 'coordenação também edita', r.erro);
  const hist = (await linhas('HistoricoDeAlteracoes')).filter(h => h.acao === 'salvar relatório da equipe' && h.registroId === eid);
  ok(hist.length === 2 && hist.every(h => h.usuarioId), 'cada gravação no histórico, com quem fez', hist.length);
  const g = await amb.gerente('Gestora Ficticia Teste');
  r = await post({ action: 'painelRelEquipe', key: g.token, escalaId: eid });
  ok(r.ok && r.editar && r.numeros.tfs === 3 && r.dados.repasse === '2', 'painel: gerência lê e pode editar', r.erro);
  r = await post({ action: 'painelRelEquipeSalvar', key: g.token, escalaId: eid, dados: { ...r.dados, repasse: '1' } });
  ok(r.ok, 'painel: gerência grava', r.erro);
  // próximo período da mesma BVA: começa com os textos do último relatório salvo
  r = await esc({ inicio: dia(0), fim: dia(9), equipeNumero: '34', responsavel: B.usuario.id });
  r = await post({ action: 'relEquipe', key: B.token, escalaId: r.escala.id });
  ok(r.ok && !r.dados && r.anterior && r.anterior.deslocamento === 'Manaus/AM x Ficticio' && r.editar, 'próxima equipe da BVA: textos do último relatório', r.anterior);

  console.log('4) app: lista, tela, edição e PDF');
  const b = await amb.lancar();
  const c = await b.newContext({ viewport: { width: 420, height: 900 } });
  await c.addInitScript(i => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } } catch (e) {} }, A.ls);
  await c.addInitScript(() => { window.print = function () { const raiz = document.getElementById('gdv-impressao'), sr = raiz && raiz.shadowRoot;
    (window.top.__prints = window.top.__prints || []).push({ quem: window === window.top ? 'pagina' : 'iframe', titulo: document.title,
      texto: (sr || document.body).textContent.replace(/\s+/g, ' '), imgs: [...(sr || document).querySelectorAll('img')].map(i => i.getAttribute('src')),
      folha2: [...(sr || document).querySelectorAll('.folha-assin .assin b')].map(b => b.textContent) }); }; });
  const p = await c.newPage(), err = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(APP); await p.waitForSelector('.modulo', { timeout: 15000 });
  await p.waitForTimeout(800); if (await p.$('#escPopOk')) await p.click('#escPopOk');            // aviso "Sua escala de plantão"
  await p.click('.modulo[data-v=home]'); await p.click('nav [data-v=historico]'); await p.click('[data-go=relequipes]');
  await p.waitForSelector(`[data-releq="${eid}"]`, { timeout: 15000 });
  ok(/Equipe 33/.test(await p.textContent(`[data-releq="${eid}"]`)), 'Histórico → Relatório da equipe: a escala com o nº da equipe');
  await p.click(`[data-releq="${eid}"]`); await p.waitForSelector('#re-objetivo', { timeout: 15000 });
  const tela = await p.textContent('#view');
  ok(/2 turno\(s\) · 3 veículo\(s\)/.test(tela) && /TFA, TFB, TFC/.test(tela) && /600 kg apreendidos \(e 3 Caixas\)/.test(tela), 'tela: números da equipe', tela.slice(0, 300));
  ok((await p.inputValue('#re-kg')) === '650,5' && (await p.inputValue('#re-repasse')) === '1', 'tela: kg corrigido e termos de repasse salvos');
  await p.fill('#re-objetivo', 'Objetivo ficticio editado no app.'); await p.click('#re-salvar');
  await p.waitForFunction(() => /Relatório salvo/.test(document.querySelector('#toast').textContent), null, { timeout: 10000 });
  r = await post({ action: 'relEquipe', key: B.token, escalaId: eid });
  ok(r.dados.objetivo === 'Objetivo ficticio editado no app.', 'app: o responsável salva a edição');
  await p.evaluate(() => { window.__prints = []; }); await p.click('#re-pdf');
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 });
  const pr = await p.evaluate(() => window.__prints[0]);
  ok(/Equipe 33 - Nome dos Servidores/.test(pr.texto) && pr.texto.includes(A.nome) && pr.texto.includes(B.nome) && /Responsável pela equipe: Ana Responsavel Teste/.test(pr.texto),
    'PDF: equipe, servidores e responsável', pr.texto.slice(0, 300));
  ok(/CONVÊNIO N° 00991272\/2025/.test(pr.texto) && /ETAPA 1\.10/.test(pr.texto) && /Período: de \d{2} de [a-zç]+( de \d{4})? a \d{2} de [a-zç]+ de \d{4}\./.test(pr.texto), 'PDF: convênio, etapa e período por extenso', pr.texto.slice(0, 400));
  ok(/Veículos abordados: 3 veículos\./.test(pr.texto) && /Termo de Fiscalização emitidos: 3 \(três\) termos\./.test(pr.texto) && /Apreensões realizadas: 1 \(uma\) apreensão\./.test(pr.texto)
    && /Quantidade de Produtos Apreendidos: 650,5 quilogramas\./.test(pr.texto) && /Termos de Repasse emitidos: 1 termo\./.test(pr.texto)
    && /Rechaços realizados: 1 rechaço\./.test(pr.texto) && /Medidas de educação sanitária: 9 medidas\./.test(pr.texto), 'PDF: atividades (com extenso e kg corrigido)', pr.texto.slice(pr.texto.indexOf('ATIVIDADES'), pr.texto.indexOf('ATIVIDADES') + 500));
  ok(/Objetivo ficticio editado no app\./.test(pr.texto) && /Assinatura e carimbo do Servidor/.test(pr.texto) && /Assinatura e carimbo do Responsável da Equipe/.test(pr.texto), 'PDF: textos e assinaturas');
  ok(pr.folha2.length === 2 && pr.folha2[pr.folha2.length - 1] === A.nome, 'assinaturas na 2ª folha (o responsável por último)', pr.folha2);
  ok(['brasao.png', 'logo-adaf.png', 'sepror.png'].every(n => pr.imgs.some(s => s.includes(n))) && /gabinete@adaf\.am\.gov\.br/.test(pr.texto), 'PDF: cabeçalho e rodapé do Termo (brasão, endereço, logos ADAF e SEPROR)', pr.imgs);
  // Termo de Repasse: itens das apreensões (editáveis), total, local e data, órgão que recebe; salvo e no PDF
  const itens = () => p.$$eval('#re-itens .re-item', ls => ls.map(l => [...l.querySelectorAll('input')].map(i => i.value).join(':')));
  ok((await itens()).join('|') === '1:LARANJA:Kg:100|1:MANGA:Ton:0,5|1:GOIABA:Caixas:3' && (await p.textContent('#re-rpTotal')) === '600 Kg + 3 Caixas',
    'Termo de Repasse na tela: os produtos apreendidos e o total', await itens());
  ok(/^033\/\d{4}$/.test(await p.inputValue('#re-rpNumero')) && (await p.inputValue('#re-rpOrgao')) === 'ADERR' && /^BR 174 KM 75 PVA Jundiá\/RR, \d{2} de [a-zç]+ de \d{4}\.$/.test(await p.inputValue('#re-rpLocal')),
    'Termo de Repasse: nº pela equipe, órgão e local e data padrão do Jundiá', [await p.inputValue('#re-rpNumero'), await p.inputValue('#re-rpLocal')]);
  await p.click('#re-itens .re-item >> nth=2 >> [data-rprm]'); await p.click('#re-rpAdd');
  await p.fill('#re-itens .re-item >> nth=2 >> [data-k=p]', 'CAJU'); await p.fill('#re-itens .re-item >> nth=2 >> [data-k=u]', 'Kg'); await p.fill('#re-itens .re-item >> nth=2 >> [data-k=q]', '2,5');
  await p.fill('#re-itens .re-item >> nth=2 >> [data-k=tf]', '9');
  ok((await p.textContent('#re-rpTotal')) === '602,5 Kg', 'tirar e acrescentar item refaz o total', await p.textContent('#re-rpTotal'));
  await p.evaluate(() => { document.querySelector('#toast').textContent = ''; }); await p.click('#re-salvar');
  await p.waitForFunction(() => /Relatório salvo/.test(document.querySelector('#toast').textContent), null, { timeout: 10000 });
  r = await post({ action: 'relEquipe', key: B.token, escalaId: eid });
  ok(r.dados.repasseItens.length === 3 && r.dados.repasseItens[2].p === 'CAJU' && r.dados.repasseItens[2].q === '2.5' && r.dados.repasseOrgao === 'ADERR', 'itens do Termo de Repasse salvos', r.dados.repasseItens);
  await p.evaluate(() => { window.__prints = []; }); await p.click('#re-rpPdf');
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 });
  const rp = await p.evaluate(() => window.__prints[0]);
  const rpt = rp.texto.replace(/\s+/g, '');
  ok(/TERMODEREPASSEDEPRODUTOSAPREENDIDOSNº033\/\d{4}/.test(rpt) && /1LARANJAKg100/.test(rpt) && /1MANGATon0,5/.test(rpt) && /9CAJUKg2,5/.test(rpt)
    && /TOTAL602,5Kg/.test(rpt) && /Local e Data:BR 174 KM 75 PVA Jundiá\/RR, /.test(rp.texto) && /Servidor da ADAF/.test(rp.texto) && /Servidor da ADERR/.test(rp.texto),
    'Termo de Repasse em PDF (itens, total, local e data, assinaturas ADAF e ADERR)', rp.texto.slice(0, 400));
  ok(['brasao.png', 'logo-adaf.png', 'sepror.png'].every(n => rp.imgs.some(s => s.includes(n))), 'Termo de Repasse: cabeçalho e rodapé do Termo', rp.imgs);
  const ext = await p.evaluate(() => { const f = document.createElement('iframe'); f.src = 'documentos/rel-equipe.html'; document.body.appendChild(f);
    return new Promise(ok => { f.onload = () => { const X = f.contentWindow.RelEquipeDocs; ok([0, 1, 16, 21, 100, 101, 999, 1000, 1530, 2000].map(n => X.extenso(n)).concat([X.extenso(1, true), X.extenso(232, true)])); f.remove(); }; }); });
  ok(ext.join('|') === 'zero|um|dezesseis|vinte e um|cem|cento e um|novecentos e noventa e nove|mil|mil quinhentos e trinta|dois mil|uma|duzentas e trinta e duas', 'número por extenso', ext);
  ok(!err.length, 'sem erros de página', err);
  await b.close(); console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
