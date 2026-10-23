const amb = require('./lib/amb');
// Relatório de plantão do papel (Portal do Administrativo → VIGIFITO → "Importar relatório de plantão"): um .xls SINTÉTICO (gerado aqui,
// dados fictícios; 4º dia zerado, como o dia da troca) no layout do "Relatório Diário de Trânsito Interestadual" da BVA — cabeçalho "BVA: Jundiá/RR", quadro de veículos por
// tipo com dias em colunas mescladas, educação sanitária e a lista de cargas (placa, transportador, produto, documento, ação, nº do TF).
// Confere: leitura (js/plantao-planilha.js), importação pelo portal no navegador (prévia e gravar), o que fica nas abas Turnos/Veiculos
// (placa, transportador, medida, nº do TF), os indicadores do VIGIFITO saídos do motor (veículos, educação, partidas, liberação/apreensão
// com toneladas, TFs, documentos, internalização, auto de destruição), a etapa 1.10 do convênio, reimportação (recusada; substituir
// não duplica), validações do servidor e que nada pessoal sai na apuração.
const path = require('path');
const X = require(path.join(amb.RAIZ, 'web/painel/vendor/xlsx/xlsx.core.min.js'));
const PP = require(path.join(amb.RAIZ, 'web/administrativo/js/plantao-planilha.js'));
global.VigDocs = require(path.join(amb.RAIZ, 'web/documentos/vigifito-docs.js'));
const PORTAL = require('./lib/portal');
const { API } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 700))); if (!c) falhas++; };
const quase = (a, b) => Math.abs(a - b) < 0.0005;

const A = new Date(Date.now() - 4 * 3600e3).getUTCFullYear() - 1;                  // ano anterior: o plantão está todo no passado
const P0 = VigDocs.periodosDoAno('2025-01-05', 9, A)[5].inicio;                       // o plantão começa num início de período da escala
const dia = n => new Date(Date.parse(P0 + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dm = d => d.slice(8, 10) + '/' + d.slice(5, 7);

/** .xls (BIFF8) no layout do relatório: 3 dias; 1º e 3º dia em 2 colunas mescladas. */
function relatorio() {
  const L = [];
  L[0] = ['GOVERNO DO ESTADO DO AMAZONAS'];
  L[1] = ['Relatório Diário de Trânsito Interestadual'];
  L[2] = ['BVA: Jundiá/RR', null, null, null, 'ULSAV:', 'Presidente Figueiredo', 'Mês:', 'XXX', 'Ano: ', A, 'Período:', `${dm(dia(0))} A ${dm(dia(3))}`];
  L[3] = ['1.', ' Veículos Fiscalizados', 'Periodo'];
  L[4] = [null, null, '1º dia', null, '2° dia', '3º  dia', null, '4º dia', 'Total do Plantão'];
  L[5] = ['1.1', 'Passeio (PA)', 3, 2, 4, 1, 1, 0, 11];
  L[6] = ['1.2', 'Utilitário (UT)', 1, 0, 2, 0, 1, 0, 4];
  L[7] = ['1.3', 'Caminhão/Carreta (CC)', 1, 1, 0, 1, 0, 0, 3];
  L[8] = ['1.4', 'Caminhão e Carreta Baú (CB)', 2, 0, 1, 1, 1, 0, 5];
  L[9] = ['1.5', 'Ônibus (ON)', 0, 0, 0, 0, 0, 0, 0];
  L[10] = ['1.6', 'Moto (MO)', 0, 1, 0, 0, 0, 0, 1];
  L[11] = [null, 'Total', 11, null, 7, 6, null, 0, 24];
  L[12] = ['2.', 'Eventos'];
  L[13] = [null, null, '1º dia', null, '2° dia', '3º  dia', null, '4º dia', 'Total'];
  L[14] = ['2.1', 'Educação Sanitária', 2, 1, 3, 1, 0, 0, 7];
  L[15] = [];
  L[16] = ['dia/mês', 'Hora', 'Município-UF', null, 'Transporte', null, null, 'Produto', null, null, 'Documentação apresentada', null, 'Ação', null, 'Nº TF'];
  L[17] = [null, null, null, null, null, null, null, null, null, null, null, null, 'Liberação', 'Apreensão'];
  L[18] = [null, null, 'Origem ', 'Destino', 'Tipo', 'Placa', 'Identificação do transportador', 'Discriminação', 'Vol', 'Und', 'Disc', 'Nº'];
  const C = (d, h, o, de, t, pl, tr, pr, vol, doc, num, lib, apr, tf) => [dm(d), h, o, de, t, pl, tr, pr, vol, 'T', doc, num, lib, apr, tf];
  L[19] = C(dia(0), '15:00', 'BOA VISTA', 'MANAUS', 'CB', 'ABC1D23', 'Fulano Ficticio Teste', 'BANANA', 10.5, 'NF', '123', 'X', null, null);
  L[20] = C(dia(1), '02:30', 'CAROEBE', 'MANAUS', 'CC', 'ABC1D24', 'Transportadora Ficticia Teste', 'MELANCIA', 8, null, null, null, null, null);   // madrugada: plantão do 1º dia; sem ação = liberação
  L[21] = C(dia(1), '09:00', 'RORAINÓPOLIS/RR', 'MANAUS/AM', 'CB', 'ABC1D25', 'Ciclano Ficticio Teste', 'LARANJA', 0.05, null, null, null, 'X', 900);
  L[22] = C(dia(2), '08:00', 'PORTO VELHO/RO', 'MANAUS', 'UT', 'ABC-1D26', 'Beltrano Ficticio Teste', 'BATATA', 1.2, 'PTV', '55', 'X', null, 901);   // liberação com TF
  L[23] = C(dia(2), '10:00', 'BOA VISTA', 'MANAUS', 'CB', 'ABC1D27', 'Fulano Ficticio Teste', 'PUPUNHA', 3, null, null, 'X', null, null);
  const ws = X.utils.aoa_to_sheet(L.map(l => l || []));
  ws['!merges'] = [4, 13].flatMap(r => [{ s: { r, c: 2 }, e: { r, c: 3 } }, { s: { r, c: 5 }, e: { r, c: 6 } }]);
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Rel Veg BVA Terr.');
  return Buffer.from(X.write(wb, { type: 'array', bookType: 'biff8' }));
}

(async () => {
  console.log(`1. Leitura do relatório (.xls sintético, plantão ${dia(0)} a ${dia(3)})`);
  const buf = relatorio();
  const lv = PP.lerLivro(X, X.read(buf, { type: 'buffer' })), R = PP.extrair(lv, { anoPadrao: A + 1 });
  ok(!R.erros.length && R.bva === 'Jundiá' && R.ufBva === 'RR' && R.ano === A && R.de === dia(0) && R.ate === dia(3), 'cabeçalho: BVA Jundiá/RR, ano e período', [R.erros, R.bva, R.ano, R.de, R.ate]);
  ok(R.dias.map(d => d.total).join() === '11,7,6,0' && R.dias[0].tipos.PA === 5 && R.dias[0].tipos.MT === 1 && R.dias.map(d => d.educacao).join() === '3,3,1,0',
    'quadro: veículos por tipo somando as colunas mescladas do dia (Moto MO → MT); educação sanitária por dia', R.dias);
  ok(R.cargas.length === 5 && R.cargas[1].medida === 'liberacao' && R.cargas[1].semAcao && R.cargas[2].medida === 'apreensao' && R.cargas[2].tf === '900'
    && R.cargas[3].placa === 'ABC1D26' && R.cargas[3].ufOrigem === 'RO' && R.cargas[0].ufOrigem === 'RR' && R.cargas[0].ufDestino === 'AM' && R.cargas[0].documento === 'NF 123' && R.cargas[0].unidade === 't',
    'cargas: sem ação = liberação, apreensão com nº do TF, placa sem hífen, UF do texto ou a da BVA, destino AM, documento, tonelada', R.cargas);
  ok(R.avisos.some(a => /1 carga\(s\) sem Liberação nem Apreensão/.test(a.texto)), 'aviso: carga sem ação entra como liberação', R.avisos);
  const PV = PP.previa(R, { troca: '07:00', posto: 'pf-jundia' });
  ok(PV.totais.veiculos === 24 && PV.totais.cargas === 5 && PV.totais.liberacao === 1 && PV.totais.apreensao === 1 && PV.totais.tfs === 2 && quase(PV.totais.toneladas, 22.75) && !PV.foraDoPlantao.length && PV.totais.diasVazios === 1,
    'prévia: 24 veículos, 5 cargas (22,75 t), 2 com TF (1 liberação, 1 apreensão); a carga das 02:30 fica no plantão do 1º dia; o 4º dia zerado não vira turno', PV.totais);
  ok(PV.avisos.some(a => /3 carga\(s\) sem nº de TF/.test(a.texto)), 'prévia avisa: cargas sem nº de TF só contam em veículos e internalização', PV.avisos);
  const PVm = PP.previa(R, { troca: '00:00' });
  ok(PVm.avisos.some(a => /carga\(s\) CC na lista e 0 no quadro/.test(a.texto)), 'com a troca à meia-noite, a carga das 02:30 cai no 2º dia e a conferência com o quadro avisa', PVm.avisos);
  ok(PP.postoProvavel([{ id: 'pf-jundia', nome: 'PRESIDENTE FIGUEIREDO - BVA JUNDIÁ', tipo: 'fixa', locais: ['BVA - JUNDIÁ'] }, { id: 'v', nome: 'JUNDIÁ VOLANTE', tipo: 'volante' }], 'Jundiá') === 'pf-jundia', 'posto provável: o fixo com Jundiá no nome');

  console.log('2. Importação pelo portal (navegador)');
  await fetch(API + '/__fn?nome=desativarRotinasAutomaticas_');
  const TOK = (await amb.gerente('Gerente Plantao Teste')).token;
  const SA = await PORTAL.sessao(TOK, 'plantao.adm@gmail.com', 'Fulano Ficticio Teste');
  const b = await amb.lancar();
  try {
    const p = await PORTAL.abrir(b, SA, { aba: 'vigifito' });
    await p.waitForSelector('#adm-plt-arq', { state: 'attached', timeout: 20000 });
    await p.setInputFiles('#adm-plt-arq', { name: 'relatorio-plantao-teste.xls', mimeType: 'application/vnd.ms-excel', buffer: buf });
    await p.waitForSelector('#adm-plt-pv', { timeout: 20000 });
    const txt = await p.textContent('#adm-plt-pv');
    ok(/BVA Jundiá\/RR/.test(txt) && /24/.test(txt) && await p.$eval('#adm-plt-posto', s => s.value) === 'pf-jundia' && await p.$eval('#adm-plt-uf', s => s.value) === 'RR',
      'prévia no portal: BVA do cabeçalho, posto Jundiá e UF RR já escolhidos', txt.slice(0, 300));
    ok(await p.$eval('#adm-plt-gravar', x => !x.disabled), 'botão Gravar liberado (sem erros)');
    await (await p.$('#adm-plt-pv')).screenshot({ path: amb.saida('plantao_previa.png') });
    await p.click('#adm-plt-gravar');
    await p.waitForFunction(() => /Importado ✓/.test((document.querySelector('[data-msg=pltimp]') || {}).textContent || ''), null, { timeout: 30000 });
    const msg = await p.textContent('[data-msg=pltimp]');
    ok(/3 turno\(s\), 24 veículo\(s\), 5 carga\(s\) \(1 liberação, 1 apreensão, 2 TF\)/.test(msg), 'importado pelo portal: 3 turnos, 24 veículos, 5 cargas', msg);
    ok(!p.errosPag.length, 'portal sem erros de página', p.errosPag);
    await p.context().close();
  } finally { await b.close(); }

  console.log('3. O que ficou no banco e os indicadores');
  const tur = await get('/__aba?nome=Turnos'), tc = tur[0], tl = tur.slice(1).filter(l => String(l[tc.indexOf('id')]).indexOf('pl-pf-jundia-') === 0);
  const col = (l, c) => l[tc.indexOf(c)];
  ok(tl.length === 3 && tl.every(l => col(l, 'local') === 'BVA - JUNDIÁ' && col(l, 'posto') === 'Fixa' && col(l, 'inicio') === '07:00' && col(l, 'fim') === '06:59' && Number(col(l, 'encerrado')) === 1 && Number(col(l, 'semPlaca')) === 1 && col(l, 'importacao') === 'pl|pf-jundia|' + dia(0)),
    'Turnos: um por dia na BVA - JUNDIÁ, das 07:00 às 06:59, encerrado, placa opcional, com o id da importação', tl.map(l => [col(l, 'data'), col(l, 'inicio'), col(l, 'fim')]));
  const vei = await get('/__aba?nome=Veiculos'), vc = vei[0], vl = vei.slice(1).filter(l => /^pl/.test(l[0])), vcol = (l, c) => l[vc.indexOf(c)];
  const carga = vl.find(l => vcol(l, 'placa') === 'ABC1D25');
  ok(vl.length === 24 && vl.filter(l => vcol(l, 'medidaPapel')).length === 5 && vl.filter(l => !vcol(l, 'placa')).length === 19, 'Veiculos: 24 (5 cargas com placa + 19 do quadro sem placa)', vl.length);
  ok(carga && vcol(carga, 'transportador') === 'Ciclano Ficticio Teste' && vcol(carga, 'medidaPapel') === 'apreensao' && vcol(carga, 'tfPapel') === '900' && vcol(carga, 'origemMun') === 'RORAINÓPOLIS'
    && vcol(carga, 'ufOrigem') === 'RR' && vcol(carga, 'ufDestino') === 'AM' && JSON.parse(vcol(carga, 'cargaPapel'))[0].p === 'LARANJA' && vcol(carga, 'hora') === '09:00',
    'carga gravada com placa, transportador, origem, medida, nº do TF e produto', carga && vc.reduce((o, c, i) => Object.assign(o, { [c]: carga[i] }), {}));
  const madr = vl.find(l => vcol(l, 'placa') === 'ABC1D24');
  ok(madr && vcol(madr, 'turnoId') === 'pl-pf-jundia-' + dia(0).replace(/-/g, '') && vcol(madr, 'medidaPapel') === 'liberacao', 'carga das 02:30 no turno do 1º dia, como liberação');
  ok(vl.reduce((s, l) => s + Number(vcol(l, 'pessoas')), 0) === 7, 'pessoas (educação sanitária) = 7, como no papel');
  const VD = await post({ action: 'painelVigDados', key: TOK, ano: A }), J = ((VD.apuracao.porPeriodo || {})['pf-jundia'] || {})[P0] || {};
  ok(J.veiculos === 24 && J.educacao === 7 && J.turnos === 3, 'VIGIFITO Jundiá no período: 24 veículos, educação sanitária 7, 3 turnos', J);
  ok(J.partidas === 2 && J.medidaFito === 2 && J.tfs === 2 && J.documentos === 1, 'só as cargas com nº do TF no papel: 2 TFs = 2 partidas e 2 medidas fitossanitárias; documentos = 1 (a com TF e PTV)', J);
  ok(J.liberacao === 1 && quase(J.liberacaoT, 1.2) && J.apreensao === 1 && quase(J.apreensaoT, 0.05) && J.autoDestN === 1 && quase(J.autoDestT, 0.05), 'liberação 1 (1,2 t, a com TF; as 3 sem TF não contam), apreensão 1 (0,05 t) = auto de destruição', J);
  ok(J.internN === 5 && quase(J.internT, 22.75) && quase(J.importT, 22.75) && J.cargasEstados === 0, 'internalização: 5 cargas de RR/RO para o AM, 22,75 t (importação)', J);
  ok(!/Ficticio|ABC1D2/.test(JSON.stringify(VD)), 'apuração sem nomes nem placas');
  const CA = await post({ action: 'painelConvApuracao', key: TOK, convenio: '991272-2025', de: dia(0), ate: dia(2) });
  const bj = CA.ok && CA.etapas['1.10'] && (CA.etapas['1.10'].porBva || []).find(x => x.bva === 'BVA - JUNDIÁ');
  ok(!CA.ok || (bj && bj.total.veiculos === 24), 'convênio 1.10: os mesmos 24 veículos da BVA Jundiá', CA.ok ? bj : CA.erro);

  console.log('4. Reimportação e validações do servidor');
  const env = Object.assign({ action: 'admPlantaoImportar', sessao: SA.sessao, arquivo: 'relatorio-plantao-teste.xls' }, PV.envio);
  let r = await post(env);
  ok(r.ok === false && r.jaImportado && r.por === 'Fulano Ficticio Teste' && r.resumo.veiculos === 24, 'mesmo plantão de novo: recusado (já importado, por quem)', r);
  r = await post(Object.assign({}, env, { substituir: 1 }));
  ok(r.ok && r.substituidos === 24 && r.veiculos === 24, 'substituir: os 24 veículos anteriores ficam excluídos e entram os novos', r);
  const J2 = (await post({ action: 'painelVigDados', key: TOK, ano: A })).apuracao.porPeriodo['pf-jundia'][P0];
  ok(J2.veiculos === 24 && J2.partidas === 2 && J2.turnos === 3, 'depois de substituir: os números não dobram', J2);
  const vei2 = await get('/__aba?nome=Veiculos');
  ok(vei2.slice(1).filter(l => /^pl/.test(l[0])).length === 48 && vei2.slice(1).filter(l => /^pl/.test(l[0]) && Number(l[vc.indexOf('excluido')]) === 1).length === 24, 'nada apagado: 24 excluídos (lógico) + 24 novos');
  const erro = async (mud, re, m) => { const x = await post(Object.assign({}, env, { substituir: 1 }, mud)); ok(!x.ok && re.test(x.erro || ''), m, x.erro || x); };
  await erro({ cargas: PV.envio.cargas.map((c, i) => i ? c : Object.assign({}, c, { data: dia(5) })) }, /Carga 1 .*fora dos dias do plantão/, 'carga fora dos dias do plantão: recusada');
  await erro({ cargas: PV.envio.cargas.map((c, i) => i ? c : Object.assign({}, c, { tipo: 'XX' })) }, /tipo de veículo inválido/, 'tipo de veículo inválido: recusado');
  await erro({ posto: 'tabatinga-volante' }, /posto fixo/, 'posto volante: recusado (só BVA fixa)');
  await erro({ troca: '7h' }, /troca do plantão/, 'troca do plantão inválida: recusada');
  await erro({ dias: PV.envio.dias.map((d, i) => i ? d : Object.assign({}, d, { educacao: 1.5 })) }, /educação sanitária: número inteiro/, 'educação com decimal: recusada');
  await erro({ dias: [{ data: '2999-01-01', tipos: {}, educacao: 0 }], cargas: [] }, /futuro/, 'dia no futuro: recusado');
  const SO_PAINEL = (await amb.usuario('Visitante Painel Plantao', { aplicativo: 'painel', permissoes: ['painel'] })).token;   // a gerência vale em tudo; só leitura não
  r = await post(Object.assign({}, env, { sessao: SO_PAINEL }));
  ok(!r.ok && /não inclui o Portal do Administrativo/.test(r.erro), 'conta só do painel não importa (precisa do Portal do Administrativo)', r.erro);

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
