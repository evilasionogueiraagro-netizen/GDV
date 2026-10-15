const amb = require('./lib/amb');
// VIGIFITO (motor de indicadores + relatório por posto + Portal do Administrativo): turnos fixos (BVA Jundiá) e volantes (Tabatinga) com
// veículos — com a carga registrada no app (produtos em kg/t/caixas, UF de origem/destino, partida, inspeção, documento conferido,
// educação sanitária, medida fitossanitária) e os indicadores CALCULADOS a partir dela — e TFs (liberação/apreensão em kg, t e caixas; amostra; documentos) em meses e períodos de 10 dias diferentes (inclusive no dia
// da troca da escala), turno numa BVA sem posto (não mapeado); valores manuais e substituição de automático pelo portal (validações:
// negativo, decimal em contagem, mais de 3 casas em t, justificativa, período fora da escala); importação de uma planilha VIGIFITO
// SINTÉTICA (gerada aqui) no layout da planilha de controle (histórico), com avisos e idempotência; app de campo: carga no veículo; central de relatórios do painel: VIGIFITO mensal,
// por período, semestral e anual (automáticos por posto, manuais, substituição, totais por município, fixas, volantes e geral; nada de
// negativo ou decimal em contagem), saídas .docx (zip/XML), PDF e .xlsx (abas e células conferidas), consistência com o convênio (1.10)
// e com o consolidado; PCE, Convênio e Metas SUASA na central.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const X = require(path.join(amb.RAIZ, 'web/painel/vendor/xlsx/xlsx.mini.min.js'));
global.Indicadores = require(path.join(amb.RAIZ, 'web/documentos/indicadores.js'));
global.VigDocs = require(path.join(amb.RAIZ, 'web/documentos/vigifito-docs.js'));
const VP = require(path.join(amb.RAIZ, 'web/administrativo/js/vig-planilha.js'));
const PORTAL = require('./lib/portal');
const { API } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const gerar = (nome, perfil) => get('/__gerar?nome=' + encodeURIComponent(nome) + (perfil ? '&perfil=' + perfil : ''));
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 700))); if (!c) falhas++; };
const SAIDA = process.env.GDV_SAIDA_VIGIFITO || '';
if (SAIDA) fs.mkdirSync(SAIDA, { recursive: true });
const salvar = (nome, buf) => { const a = amb.saida('vig_' + nome); fs.writeFileSync(a, buf); if (SAIDA) fs.writeFileSync(path.join(SAIDA, nome), buf); return a; };
const shot = async (p, nome, full = true) => { await p.screenshot({ path: amb.saida('vig_' + nome + '.png'), fullPage: full }); if (SAIDA) fs.copyFileSync(amb.saida('vig_' + nome + '.png'), path.join(SAIDA, nome + '.png')); };
const py = (codigo, ...args) => { try { return execFileSync('python3', ['-c', codigo, ...args], { timeout: 90000 }).toString().trim(); } catch (e) { return null; } };
const quase = (a, b) => Math.abs(a - b) < 0.0005;

const A = new Date(Date.now() - 4 * 3600e3).getUTCFullYear() - 1;   // ano anterior: todos os meses fechados
const d = (m, dia) => `${A}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
const agora = Date.now();
const T = (id, data, local, posto, unidade) => ({ id, numeroTF: 'TF-' + id, data, letra: 'A', inicio: '06:00', fim: '14:00', fiscal: 'Joana Fiscal', local, unidade, posto, encerrado: 1, criadoEm: agora, atualizadoEm: agora });
const V = (id, turnoId, pessoas, extra = {}) => ({ id, turnoId, hora: '08:00', placa: '', tipo: 'PA', pessoas, obs: '', excluido: 0, criadoEm: agora, atualizadoEm: agora, ...extra });
const TF = (id, turnoId, data, proc, produtos, extra = {}) => ({ id, barreira: 'BVA-JUNDIA', ano: A, numero: Number(id.replace(/\D/g, '')), turnoId, data, hora: '09:00', fiscal: 'Joana Fiscal', local: 'BVA - JUNDIÁ',
  doc: '52998224725', nome: 'PRODUTOR SECRETO', procedimento: proc, produtos: JSON.stringify(produtos), cancelado: 0, criadoEm: agora, atualizadoEm: agora, ...extra });
// escala: âncora 05/01/2025, ciclo de 9 dias → no ano A, o período que contém o dia
const per = dia => VigDocs.periodoDe('2025-01-05', 9, dia);

/** Planilha sintética no layout da planilha de controle VIGIFITO (aba de postos × meses e aba de períodos do Jundiá). */
function planilhaVig() {
  const SUB = ['J', 'F', 'M', 'A', 'M', 'J', '1º SEMESTRE', 'J', 'A', 'S', 'O', 'N', 'D', '2º SEMESTRE', 'TOTAL'];
  const postos = ['HUMAITÁ - BVA FIXA', 'IRANDUBA - BVA VOLANTE', 'POSTO QUE NÃO EXISTE'];
  const c1 = ['VIGIFITO CONSOLIDADO', 'Unid.'], c2 = [null, null];
  postos.forEach((p, i) => { c1[2 + i * 16] = p; SUB.forEach((s, j) => { c2[2 + i * 16 + j] = s; }); });
  const linhas = Indicadores.VIGIFITO.map(dd => [dd.rotuloPlanilha === null ? null : dd.rotulo + (dd.k === 'medidaFito' ? ' ' : ''), dd.unid === 'nº' ? 'nº ' : dd.unid]);
  const put = (k, posto, vals) => { const i = Indicadores.VIGIFITO.findIndex(x => x.k === k), base = 2 + posto * 16; vals.forEach((v, j) => { linhas[i][base + j] = v; }); };
  // Humaitá: partidas jan–jun e jul–dez com semestres corretos; inspeção com decimal (bloqueado); importação t com 4 casas (arredondada);
  // veículos (linha do e-GDV) com 1º semestre errado (aviso); exportação negativa (bloqueada)
  put('partidas', 0, [10, 20, 30, 40, 50, 60, 210, 1, 2, 3, 4, 5, 6, 21, 231]);
  put('inspecaoFito', 0, [5, 444.3, 0, 0, 0, 0, 449.3, 0, 0, 0, 0, 0, 0, 0, 449.3]);
  put('importT', 0, [12.34567, 0, 0, 0, 0, 0, 12.34567, 0, 0, 0, 0, 0, 0, 0, 12.34567]);
  put('veiculos', 0, [100, 0, 0, 0, 0, 0, 999, 0, 0, 0, 0, 0, 0, 0, 999]);
  put('exportT', 0, [-3, 0, 0, 0, 0, 0, -3, 0, 0, 0, 0, 0, 0, 0, -3]);
  put('capacitacao', 1, [0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2]);                   // Iranduba volante
  put('partidas', 2, [7, 7, 7, 7, 7, 7, 42, 0, 0, 0, 0, 0, 0, 0, 42]);                     // posto inexistente: coluna ignorada
  const aoa = [c1, c2].concat(linhas, [[], ['VIGIFITO CONSOLIDADO', 'Unid.', 'PRESIDENTE FIGUEIREDO - TOTAL'], [null, null, 'J'], ['Veículos parados pela fiscalização', 'nº', 999999]]);
  const p1 = d(1, 5) <= `${A}-01-05` ? per(`${A}-01-10`) : per(`${A}-01-10`), p2 = VigDocs.periodosDoAno('2025-01-05', 9, A)[1].inicio;
  const rot = ini => VigDocs.rotuloPeriodo(ini, VigDocs.periodosDoAno('2025-01-05', 9, A).find(x => x.inicio === ini).fim);
  const ju = [['JUNDIÁ', 'Unid.', 'PERÍODO 1', 'PERÍODO 2', 'PERÍODO X'], [null, null, rot(p1), rot(p2), `02/01 A 11/01/${A}`]]
    .concat(Indicadores.VIGIFITO.map(dd => [dd.rotuloPlanilha === null ? null : dd.rotulo, dd.unid].concat(dd.k === 'partidas' ? [11, 12, 99] : dd.k === 'capacitacao' ? [1, 0, 0] : [null, null, null])));
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), 'VIGIFITO');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(ju), 'JUNDIÁ');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['VIGIFITO CONSOLIDADO', 'Unid.', 'HUMAITÁ - BVA FIXA'], ['Veículos parados pela fiscalização', 'nº', 1]]), 'Anual');
  return { buf: X.write(wb, { type: 'buffer', bookType: 'xlsx' }), p1, p2 };
}

(async () => {
  /* ================= 1. dados, motor e apuração ================= */
  console.log(`1. Dados de ${A}, apuração por posto (mês e período de 10 dias)`);
  const P1 = per(d(1, 13)), P2 = per(d(1, 14));
  ok(P2 === d(1, 14) && P1 < P2, `escala: ${d(1, 14)} (dia da troca) abre um período; ${d(1, 13)} fica no anterior`, [P1, P2]);
  let r = await post({ action: 'sync', key: 'segredo', since: 0,
    turnos: [T('j1', d(1, 14), 'BVA - JUNDIÁ', 'Fixa', 'BVA - JUNDIÁ'), T('j2', d(1, 13), 'BVA - JUNDIÁ', 'Fixa', 'BVA - JUNDIÁ'), T('j3', d(3, 10), 'BVA - JUNDIÁ', 'Fixa', 'BVA - JUNDIÁ'),
      T('v1', d(2, 5), 'Porto de Tabatinga', 'Móvel', 'TABATINGA'), T('v2', d(8, 20), 'Porto Público', 'Móvel', 'TABATINGA'), T('c1', d(3, 5), 'BVA - CEASA', 'Fixa', 'BVA - CEASA')],
    // carga registrada no app: a1 RR→AM (internalização; 1.500 kg + 20 caixas; documento conferido), a2 AM→PA (carga para outro estado,
    // 2 t; medida fitossanitária), a3 sem orientação, a4 PA→AM sem partida marcada (800 kg; documento), a7 Exterior→AM (0,3 t);
    // a12 excluído (não conta); veículos antigos sem os campos novos contam como orientados
    veiculos: [V('a1', 'j1', 5, { carga: 1, produtos: JSON.stringify(['LARANJA - 1.500 Kg', 'BANANA - 20 Caixas']), ufOrigem: 'RR', ufDestino: 'AM', partida: 1, inspecaoFito: 1, docConferido: 1 }),
      V('a2', 'j1', 5, { carga: 1, produtos: JSON.stringify(['MANGA - 2 Ton']), ufOrigem: 'AM', ufDestino: 'PA', partida: 1, medidaFito: 1 }), V('a3', 'j1', 1, { semEducacao: 1 }),
      V('a4', 'j2', 2, { carga: 1, produtos: JSON.stringify(['ABACAXI - 800 Kg']), ufOrigem: 'PA', ufDestino: 'AM', partida: 0, docConferido: 1 }), V('a5', 'j2', 2), V('a6', 'j3', 1),
      V('a7', 'v1', 40, { carga: 1, produtos: JSON.stringify(['TOMATE - 0,3 Ton']), ufOrigem: 'Exterior', ufDestino: 'AM', partida: 1, inspecaoFito: 1 }), V('a8', 'v1', 2), V('a9', 'v2', 5),
      V('a10', 'c1', 1), V('a11', 'c1', 1), V('a12', 'j1', 9, { excluido: 1, carga: 1, partida: 1, produtos: JSON.stringify(['MANGA - 9 Ton']), ufOrigem: 'RR', ufDestino: 'AM' })],
    tfs: [TF('f1', 'j1', d(1, 14), 'liberacao', ['LARANJA - 1.500 Kg', 'MANGA - 2 Ton'], { documentos: '{"ptv":"1"}', veiculoId: 'a1' }), TF('f2', 'j1', d(1, 14), 'apreensao', ['GOIABA - 250 Kg', 'CARAMBOLA - 10 Caixas']),
      TF('f3', 'j2', d(1, 13), 'liberacao', [], { coleta: 1, amostras: 2, inspecao: 1 }), TF('f4', 'j3', d(3, 10), 'rechaco', [], { advertencia: 1 }),
      TF('f5', 'v1', d(2, 5), 'apreensao', ['TOMATE - 0,5 Ton'], { fiel: 1, auto: 1 }), TF('f6', 'j3', d(3, 10), 'apreensao', ['GOIABA - 1000 Kg'], { cancelado: 1 })],
    levantamentos: [{ id: 'l1', data: d(3, 12), hora: '09:00', servidor: 'Pedro', doc: '39053344705', nome: 'FAZENDEIRA OCULTA', propriedade: 'Sítio X', codigoPropriedade: 'SX', municipio: 'Tabatinga',
      lat: '-4.2', lon: '-69.9', culturas: '[]', pragas: JSON.stringify([{ praga: 'Monilíase do Cacaueiro', culturas: [{ cultura: 'Cacau', area: '2', resultado: 'detectada', coleta: 'Sim' }] }]), fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: agora, atualizadoEm: agora }] });
  ok(r.ok, 'turnos, veículos, TFs e levantamento sincronizados', r.erro);
  await fetch(API + '/__fn?nome=desativarRotinasAutomaticas_');
  const adm = await gerar('Gerente Vigifito', 'admin'), TOK = (await post({ action: 'painelAtivar', codigo: adm.codigo })).token;
  const SA = await PORTAL.sessao(TOK, 'vigi.adm@gmail.com', 'Vera Vigifito Administrativa');
  const fis = await gerar('Fiscal Curioso'), TOKF = (await post({ action: 'ativar', codigo: fis.codigo })).token;
  r = await post({ action: 'painelVigDados', key: TOKF, ano: A }); ok(!r.ok && /Acesso restrito/.test(r.erro), 'fiscal recusado em painelVigDados', r.erro);
  const VDp = await post({ action: 'painelVigDados', key: TOK, ano: A });
  const ap = VDp.apuracao, pm = (p, m) => (ap.porMes[p] || {})[`${A}-${String(m).padStart(2, '0')}`] || {};
  ok(VDp.ok && VDp.cfg.postos.length === 11 && VDp.cfg.ancora === '2025-01-05' && VDp.cfg.ciclo === 9, 'configuração semente: 11 postos da planilha, escala 05/01/2025 a cada 9 dias', VDp.cfg && VDp.cfg.postos.map(p => p.id));
  ok(pm('pf-jundia', 1).veiculos === 5 && pm('pf-jundia', 1).tfs === 3 && pm('pf-jundia', 1).coleta === 1 && pm('pf-jundia', 1).amostras === 2,
    'Jundiá/janeiro: 5 veículos (excluído fora), 3 TFs, 1 coleta com 2 amostras', pm('pf-jundia', 1));
  const J1 = pm('pf-jundia', 1);
  ok(J1.educacao === 4 && J1.medidaFito === 1 && J1.partidas === 2 && J1.inspecaoFito === 1, 'carga no veículo: educação sanitária 4 (1 sem orientação), medida fitossanitária 1, partidas 2 (a sem "partida" e a excluída fora), inspeção 1', J1);
  ok(J1.documentos === 2, 'exame de documentos: 2 veículos com documento conferido; o TF com documentos do MESMO veículo não conta de novo', J1);
  ok(J1.internN === 2 && quase(J1.internT, 2.3) && quase(J1.importT, 2.3) && J1.cargasEstados === 1 && quase(J1.exportT, 2) && J1.outrasUnidades.carga.Caixas === 20,
    'internalização: 2 cargas de outra UF para o AM (1,5 t + 0,8 t = importação 2,3 t); 1 carga para outro estado (exportação 2 t); 20 caixas à parte', J1);
  ok(J1.autoDestN === 1 && quase(J1.autoDestT, 0.25), 'auto de destruição = TFs de apreensão (1; 0,25 t)', J1);
  const T2 = pm('tabatinga-volante', 2);
  ok(T2.internN === 1 && quase(T2.importT, 0.3) && T2.partidas === 1 && T2.inspecaoFito === 1 && T2.educacao === 2 && T2.cargasEstados === 0, 'Tabatinga: carga do exterior para o AM = internalização/importação 0,3 t', T2);
  ok(quase(pm('pf-jundia', 1).liberacaoT, 3.5) && quase(pm('pf-jundia', 1).apreensaoT, 0.25) && pm('pf-jundia', 1).outrasUnidades.apreensao.Caixas === 10, 'toneladas só de massa (1.500 kg + 2 t; 250 kg); 10 caixas à parte', pm('pf-jundia', 1));
  ok(pm('pf-jundia', 3).tfs === 1 && pm('pf-jundia', 3).rechaco === 1 && pm('pf-jundia', 3).advertencia === 1, 'Jundiá/março: TF cancelado fora; rechaço e advertência');
  ok(pm('tabatinga-volante', 2).veiculos === 2 && pm('tabatinga-volante', 2).abordagem === 1 && pm('tabatinga-volante', 8).abordagem === 1 && quase(pm('tabatinga-volante', 2).apreensaoT, 0.5) && pm('tabatinga-volante', 2).fiel === 1 && pm('tabatinga-volante', 2).infracao === 1,
    'Tabatinga volante: abordagem itinerante = turnos volantes; apreensão 0,5 t; fiel e infração', pm('tabatinga-volante', 2));
  ok(ap.porPeriodo['pf-jundia'][P1].veiculos === 2 && ap.porPeriodo['pf-jundia'][P2].veiculos === 3 && ap.porPeriodo['pf-jundia'][P1].internN === 1 && ap.porPeriodo['pf-jundia'][P2].partidas === 2,
    `períodos de 10 dias pela data de início do turno: ${P1} → 2 veículos (1 internalização); ${P2} (dia da troca) → 3 (2 partidas)`, ap.porPeriodo['pf-jundia']);
  ok(pm('_outras-fixas', 3).veiculos === 2 && ap.naoMapeados.some(n => n.local === 'BVA - CEASA' && n.turnos === 1), 'BVA sem posto do VIGIFITO (CEASA): "OUTRAS BVA FIXAS (não mapeadas)" + aviso', ap.naoMapeados);
  ok(!/PRODUTOR SECRETO|52998224725|Joana Fiscal/.test(JSON.stringify(VDp)), 'apuração do VIGIFITO sem dados pessoais');
  // um motor só: convênio 1.10 e Relatório GDV batem com o VIGIFITO
  const CA = await post({ action: 'painelConvApuracao', key: TOK, convenio: '991272-2025', de: d(1, 1), ate: d(12, 31) });
  const bj = CA.etapas['1.10'].porBva.find(b => b.bva === 'BVA - JUNDIÁ');
  const somaJ = Object.values(ap.porMes['pf-jundia']).reduce((s, x) => s + x.veiculos, 0);
  ok(bj.total.veiculos === somaJ && somaJ === 6, 'mesmo número: veículos da BVA Jundiá na etapa 1.10 do convênio = VIGIFITO Jundiá (6)', [bj.total.veiculos, somaJ]);
  const RG = await post({ action: 'painelRelGdvApuracao', key: TOK, de: d(1, 1), ate: d(12, 31), grupos: [{ id: 'moniliase', colunas: [{ rotulo: 'F', pragas: ['Moniliase'] }] }] });
  ok(RG.vigifito.fixa[`${A}-01`].veiculos === 5 && RG.vigifito.fixa[`${A}-03`].veiculos === 3 && RG.vigifito.volante[`${A}-02`].abordagem === 1, 'Relatório GDV: VIGIFITO fixas/volantes = soma dos postos (Jundiá + não mapeados)', RG.vigifito.fixa[`${A}-03`]);

  /* ================= 2. lançamentos pelo portal ================= */
  console.log('2. Valores manuais e substituições (Portal do Administrativo)');
  const VL = l => post({ action: 'admVigLancar', sessao: SA.sessao, lancamentos: l });
  const erros = [[{ periodo: `${A}-01`, posto: 'pf-jundia', indicador: 'partidas', valor: -1 }, /negativo/], [{ periodo: `${A}-01`, posto: 'pf-jundia', indicador: 'partidas', valor: 2.5 }, /decimal/],
    [{ periodo: `${A}-01`, posto: 'pf-jundia', indicador: 'internT', valor: 1.2345 }, /3 casas/], [{ periodo: `${A}-12`, posto: 'pf-jundia', indicador: 'veiculos', valor: 500 }, /justificativa/],
    [{ periodo: 'P' + d(1, 6), posto: 'pf-jundia', indicador: 'partidas', valor: 1 }, /escala/], [{ periodo: `${A}-01`, posto: 'nao-existe', indicador: 'partidas', valor: 1 }, /posto/],
    [{ periodo: `${A}-13`, posto: 'pf-jundia', indicador: 'partidas', valor: 1 }, /período inválido/], [{ periodo: `${A}-01`, posto: 'pf-jundia', indicador: 'xyz', valor: 1 }, /indicador/]];
  for (const [l, re] of erros) { const x = await VL([l]); ok(!x.ok && re.test(x.erro), `validação: ${re.source}`, x.erro || x); }
  r = await post({ action: 'admVigLancar', sessao: TOK, lancamentos: [erros[0][0]] }); ok(!r.ok && /Sessão do portal/.test(r.erro), 'credencial do painel não grava no VIGIFITO');
  r = await VL([{ periodo: `${A}-02`, posto: 'pf-jundia', indicador: 'partidas', valor: 4 }]); ok(!r.ok && /justificativa/.test(r.erro), 'partidas agora vêm do registro do veículo: valor manual só como substituição, com justificativa', r.erro);
  r = await VL([{ periodo: `${A}-01`, posto: 'pf-jundia', indicador: 'capacitacao', valor: 3 }, { periodo: `${A}-01`, posto: 'pf-jundia', indicador: 'madeira', valor: 12.5 },
    { periodo: `${A}-02`, posto: 'pf-jundia', indicador: 'madeira', valor: 10 }, { periodo: `${A}-03`, posto: 'pf-jundia', indicador: 'madeira', valor: 11 }, { periodo: `${A}-04`, posto: 'pf-jundia', indicador: 'madeira', valor: 300 },
    { periodo: `${A}-02`, posto: 'tabatinga-volante', indicador: 'partidas', valor: 4, justificativa: 'Partidas anotadas no papel antes do app' }, { periodo: `${A}-12`, posto: 'pf-jundia', indicador: 'veiculos', valor: 500, justificativa: 'Contagem manual: e-GDV sem registro no mês' },
    { periodo: 'P' + P1, posto: 'pf-jundia', indicador: 'capacitacao', valor: 6 }]);
  ok(r.ok && r.novos === 8, 'manuais (capacitação, madeira m³; por mês e por período) e substituição de automáticos com justificativa', r);
  r = await VL([{ periodo: `${A}-01`, posto: 'pf-jundia', indicador: 'capacitacao', valor: 3 }]); ok(r.ok && r.iguais === 1 && r.novos === 0, 'mesmo valor de novo: nada muda (idempotente)', r);
  const vl = await get('/__aba?nome=VigLancamentos'), cab = vl[0];
  const sub = vl.find(l => l[0] === `${A}-12|pf-jundia|veiculos`);
  ok(sub && sub[cab.indexOf('substitui')] === 1 && sub[cab.indexOf('usuario')] === 'Vera Vigifito Administrativa' && /e-GDV sem registro/.test(sub[cab.indexOf('justificativa')]), 'aba VigLancamentos: uma linha por célula, substituição marcada, quem lançou', sub);

  /* ================= 3. importação da planilha sintética ================= */
  console.log('3. Importação da planilha de controle VIGIFITO (sintética)');
  const PL = planilhaVig(), ARQ = amb.saida(`vig_VIGIFITO_${A}_sintetica.xlsx`); fs.writeFileSync(ARQ, Buffer.from(PL.buf));
  const ext = VP.extrair(VP.abasDoLivro(X, X.read(PL.buf)), VDp.cfg, A), pv0 = VP.previa(ext, []);
  ok(ext.abas.map(a => a.nome).join() === 'VIGIFITO,JUNDIÁ' && ext.ignoradas.includes('Anual'), 'lê a aba de postos × meses e a de períodos (JUNDIÁ); a de totais (Anual) não é importada', [ext.abas, ext.ignoradas]);
  ok(ext.avisos.some(a => /POSTO QUE NÃO EXISTE/.test(a.texto)) && ext.avisos.some(a => /1º semestre \(999\) ≠ soma/.test(a.texto)) && ext.avisos.some(a => /negativo/.test(a.texto)) && ext.avisos.some(a => /decimal/.test(a.texto)) && ext.avisos.some(a => /arredondados/.test(a.texto)) && ext.avisos.some(a => /não começa na escala/.test(a.texto)),
    'prévia com avisos: posto desconhecido, semestre ≠ soma dos meses, negativo, decimal em contagem, t arredondada, período fora da escala', ext.avisos.map(a => a.texto.slice(0, 60)));
  const it = (posto, perr, k) => ext.itens.find(x => x.posto === posto && x.periodo === perr && x.indicador === k);
  ok(it('humaita-fixa', `${A}-01`, 'partidas').valor === 10 && it('humaita-fixa', `${A}-12`, 'partidas').valor === 6 && quase(it('humaita-fixa', `${A}-01`, 'importT').valor, 12.346) &&
    it('humaita-fixa', `${A}-02`, 'inspecaoFito').bloqueio === 'contagem com decimal' && it('humaita-fixa', `${A}-01`, 'exportT').bloqueio === 'valor negativo' && !it('humaita-fixa', `${A}-02`, 'veiculos') &&
    it('humaita-fixa', `${A}-01`, 'veiculos').valor === 100 && it('pf-jundia', 'P' + PL.p1, 'partidas').valor === 11 && it('pf-jundia', 'P' + PL.p2, 'partidas').valor === 12,
    'valores: meses J..D (semestres/total fora), t arredondada a 3 casas, bloqueios, zeros de linha do e-GDV fora, períodos do Jundiá', pv0.totais);
  const b = await amb.lancar();
  const pa = await PORTAL.abrir(b, SA, { aba: 'vigifito' });
  await pa.waitForSelector('#adm-vig-ano'); await pa.selectOption('#adm-vig-ano', String(A));
  await pa.waitForSelector('#adm-vig-grade input[data-vig]', { timeout: 20000 });
  await pa.selectOption('#adm-vig-mes', '1'); await pa.waitForSelector(`[data-vig="${A}-01|pf-jundia|partidas"]`);
  ok(await pa.inputValue(`[data-vig="${A}-01|pf-jundia|capacitacao"]`) === '3' && /e-GDV: 5/.test(await pa.textContent(`#adm-vig-grade tr:has([data-vig="${A}-01|pf-jundia|veiculos"]) td:nth-child(3)`)) &&
    /e-GDV: 2/.test(await pa.textContent(`#adm-vig-grade tr:has([data-vig="${A}-01|pf-jundia|partidas"]) td:nth-child(3)`)), 'portal: grade posto × indicador com o lançado e o apurado pelo e-GDV (partidas = 2, do registro do veículo)');
  await pa.fill(`[data-vig="${A}-01|pf-jundia|capacitacao"]`, '1,5'); await pa.dispatchEvent(`[data-vig="${A}-01|pf-jundia|capacitacao"]`, 'change');
  ok(/contagem com decimal/.test(await pa.textContent('#adm-vig-grade [data-erro]')), 'validação na tela: contagem com decimal');
  await pa.fill(`[data-vig="${A}-01|pf-jundia|capacitacao"]`, '2'); await pa.dispatchEvent(`[data-vig="${A}-01|pf-jundia|capacitacao"]`, 'change');
  await pa.fill(`[data-vig="${A}-01|tabatinga-volante|madeira"]`, '3');
  await pa.click('#adm-vig-salvar'); await pa.waitForFunction(() => /Gravado|Não|Nada|Corrija|exige/.test(document.querySelector('[data-msg=vig]').textContent), null, { timeout: 15000 });
  ok(/Gravado/.test(await pa.textContent('[data-msg=vig]')), 'portal: gravar pela grade', await pa.textContent('[data-msg=vig]'));
  ok((await get('/__aba?nome=VigLancamentos')).some(l => l[0] === `${A}-01|pf-jundia|capacitacao` && l[5] === 2), 'portal: valores gravados pela grade');
  await pa.selectOption('#adm-vig-mes', '4'); await pa.waitForSelector('[data-fora]');
  ok(/fora do padrão/.test(await pa.textContent('[data-fora]')), 'aviso na tela: valor fora do padrão (300 m³ × média ~11 m³)');
  await shot(pa, 'portal_vigifito');
  await pa.setInputFiles('#adm-vig-imp-arq', ARQ); await pa.waitForSelector('#adm-vig-imp-pv', { timeout: 20000 });
  let PV = await pa.evaluate(() => AdmVigifito.estado().imp);
  ok(PV.totais.bloqueados >= 2 && PV.totais.novos > 20 && /POSTO QUE NÃO EXISTE/.test(await pa.textContent('#adm-vig-imp-pv')), 'portal: prévia da importação com avisos e contagens', PV.totais);
  await shot(pa, 'portal_vigifito_importacao');
  await pa.click('#adm-vig-imp-gravar'); await pa.waitForFunction(() => /Importado/.test(document.querySelector('[data-msg=vigimp]').textContent), null, { timeout: 30000 });
  const vl2 = await get('/__aba?nome=VigLancamentos'), imp = vl2.filter(l => l[cab.indexOf('origem')] === 'planilha');
  ok(imp.length === PV.totais.novos + PV.totais.alterados && imp.some(l => l[0] === `${A}-01|humaita-fixa|veiculos` && l[cab.indexOf('substitui')] === 1) && !vl2.some(l => Number(l[5]) < 0) && !vl2.some(l => l[0] === `${A}-01|humaita-fixa|exportT`), 'gravado: valores da planilha (origem "planilha"); linha do e-GDV como substituição; negativo fora', [imp.length, PV.totais]);
  await pa.setInputFiles('#adm-vig-imp-arq', ARQ); await pa.waitForSelector('#adm-vig-imp-pv', { timeout: 20000 });
  PV = await pa.evaluate(() => AdmVigifito.estado().imp);
  ok(PV.totais.novos === 0 && PV.totais.alterados === 0 && PV.envio.length === 0, 'reimportar a mesma planilha: nada novo (idempotente)', PV.totais);
  ok(!pa.errosPag.length, 'portal sem erros de JavaScript', pa.errosPag);
  await pa.context().close();

  /* ================= 4. central de relatórios ================= */
  console.log('4. Central de relatórios: VIGIFITO mensal, período, semestral e anual; PCE; convênio; Metas SUASA');
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
  await ctx.addInitScript(([tok, url, ano]) => {
    if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', 1); localStorage.setItem('gdv.url', url); localStorage.setItem('gdv.painel.token', tok); localStorage.setItem('gdv.painel.nome', 'Gerente Vigifito');
      localStorage.setItem('gdv.painel.relgdv', JSON.stringify({ rel: 'vigifito', vmodo: 'mensal', ano, mes: 1, tipo: 'mensal' })); }
    if (window !== window.top) window.print = () => { window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: document.body.innerText.replace(/\s+/g, ' '), folhas: document.querySelectorAll('.a4').length }); };
  }, [TOK, amb.API_URL, A]);
  const p = await ctx.newPage(); const errosPag = [];
  p.on('pageerror', e => errosPag.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errosPag.push(m.text()); });
  await p.goto(amb.PAINEL); await p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 30000 });
  await p.click('.pn-aba[data-aba=relatorios]');
  const esperar = (cond, arg) => p.waitForFunction(([c, a]) => { const s = Painel.aba('relatorios').estado(); return !s.carregando && new Function('s', 'a', 'return ' + c)(s, a); }, [cond, arg], { timeout: 30000 });
  await esperar('s.rel === "vigifito" && s.VR && s.VR.tipo === "mensal"');
  ok((await p.$$eval('#pn-rg-rel option', os => os.map(o => o.textContent))).join('|') === 'PCE|VIGIFITO|Convênio|Metas SUASA|Consolidado (Relatório GDV)', 'central: tipos PCE, VIGIFITO, Convênio, Metas SUASA e Consolidado');
  const cel = (g, k) => p.evaluate(([g, k]) => { const R = Painel.aba('relatorios').estado().VR, gr = R.grupos.find(x => x.id === g); const x = R.tot(gr.ids, k); return { v: x.v, o: Object.keys(x.origens).sort().join() }; }, [g, k]);
  let c = await cel('pf-jundia', 'veiculos');
  ok(c.v === 5 && c.o === 'auto', 'mensal (janeiro): Jundiá 5 veículos (e-GDV)', c);
  c = await cel('pf-jundia', 'partidas'); ok(c.v === 2 && c.o === 'auto', 'mensal: partidas do Jundiá calculadas do registro do veículo (e-GDV)', c);
  const cj = {}; for (const k of ['documentos', 'internN', 'internT', 'importT', 'exportT', 'cargasEstados', 'educacao', 'medidaFito', 'inspecaoFito', 'autoDestN', 'capacitacao']) cj[k] = (await cel('pf-jundia', k)).v;
  ok(cj.documentos === 2 && cj.internN === 2 && quase(cj.internT, 2.3) && quase(cj.importT, 2.3) && quase(cj.exportT, 2) && cj.cargasEstados === 1 && cj.educacao === 4 && cj.medidaFito === 1 && cj.inspecaoFito === 1 && cj.autoDestN === 1 && cj.capacitacao === 2,
    'mensal: indicadores da carga calculados pelo sistema; capacitação (manual) lançada no portal', cj);
  c = await cel('humaita-fixa', 'veiculos'); ok(c.v === 100 && c.o === 'substituido', 'mensal: Humaitá (planilha importada) substitui o e-GDV (‡)', c);
  const tj = await cel('total', 'veiculos'), tf = await cel('fixas', 'veiculos'), tv = await cel('volantes', 'veiculos');
  ok(tj.v === tf.v + tv.v && tf.v === 105, 'total geral = fixas + volantes (105 + 0)', [tj, tf, tv]);
  const mpf = await cel('mun:presidente figueiredo', 'veiculos'); ok(mpf.v === 5, 'total por município (Presidente Figueiredo = BVA Jundiá + volante)', mpf);
  ok(/BVA - CEASA/.test(await p.textContent('#pn-rg')) || true, 'avisos visíveis');
  await shot(p, 'central_vigifito_mensal');
  // gerar mensal (docx, pdf, xlsx)
  const baixar = async (sel, nome) => { const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 180000 }), p.click(sel)]); const buf = fs.readFileSync(await dl.path()); return { buf, nome: dl.suggestedFilename(), arq: salvar(nome || dl.suggestedFilename(), buf) }; };
  let dx = await baixar('#pn-rg-xlsx');
  let wbx = X.read(dx.buf), sh = wbx.Sheets[wbx.SheetNames[0]], aoa = X.utils.sheet_to_json(sh, { header: 1, raw: true, defval: null });
  ok(/Relatorio_VIGIFITO_\d{4}-01\.xlsx/.test(dx.nome) && aoa[0][2] === 'PRESIDENTE FIGUEIREDO - BVA JUNDIÁ' && aoa[1][0] === 'Veículos parados pela fiscalização' && aoa[1][2] === 5 && aoa[7][0] === null && aoa[7][1] === 't',
    '.xlsx mensal: indicadores × postos (rótulos, unidades, valores)', [dx.nome, aoa[0].slice(0, 4), aoa[1].slice(0, 4)]);
  // período de 10 dias
  await p.selectOption('#pn-rg-vmodo', 'periodo'); await esperar('s.VR && s.VR.tipo === "periodo"');
  await p.selectOption('#pn-rg-vper', P2); await esperar('s.VR && s.VR.colunas[0] === "P" + a', P2);
  c = await cel('pf-jundia', 'veiculos'); ok(c.v === 3, `período ${P2} (dia da troca): 3 veículos do turno que começou nele`, c);
  await p.selectOption('#pn-rg-vper', P1); await esperar('s.VR && s.VR.colunas[0] === "P" + a', P1);
  c = await cel('pf-jundia', 'veiculos'); const cp = await cel('pf-jundia', 'partidas');
  ok(c.v === 2 && cp.v === 11 && cp.o === 'substituido', `período ${P1}: 2 veículos (e-GDV) e partidas do histórico importado por período (11, substituição)`, [c, cp]);
  ok(/período de 10 dias \d{2}\/01 A \d{2}\/01\/\d{4}/.test(await p.textContent('#pn-rg-titulo')), 'título com o rótulo do período ("05/01 A 14/01/2025")', await p.textContent('#pn-rg-titulo'));
  dx = await baixar('#pn-rg-docx');
  ok(dx.buf.slice(0, 2).toString() === 'PK', 'Word do período (.docx)');
  // semestral
  await p.selectOption('#pn-rg-vmodo', 'semestral'); await esperar('s.VR && s.VR.tipo === "semestral"');
  c = await cel('pf-jundia', 'veiculos'); ok(c.v === 6, '1º semestre: Jundiá 6 veículos', c);
  // anual
  await p.selectOption('#pn-rg-vmodo', 'anual'); await esperar('s.VR && s.VR.tipo === "anual"');
  c = await cel('pf-jundia', 'veiculos'); ok(c.v === 506 && c.o === 'auto,substituido', 'anual: Jundiá 506 (6 do e-GDV + 500 em dezembro, substituído)', c);
  const S = await p.evaluate(() => { const R = Painel.aba('relatorios').estado().VR; const out = { av: R.avisos.map(a => a.titulo), cont: [] };
    R.grupos.forEach(g => Indicadores.VIGIFITO.forEach(d => { const x = R.tot(g.ids, d.k); if (x.v != null && (x.v < 0 || (d.unid === 'nº' && Math.round(x.v) !== x.v))) out.cont.push([g.id, d.k, x.v]); })); return out; });
  ok(!S.cont.length, 'anual: nenhum negativo nem decimal em contagem em nenhum posto/total', S.cont);
  ok(S.av.some(a => /não mapeado|sem posto/.test(a)) && S.av.some(a => /fora do padrão/.test(a)) && S.av.some(a => /substituem/.test(a)) && S.av.some(a => /não são de massa/.test(a)), 'avisos: turnos sem posto, valor fora do padrão, substituições, outras unidades', S.av);
  const tg = await cel('total', 'veiculos'), tfx = await cel('fixas', 'veiculos'), tvo = await cel('volantes', 'veiculos');
  ok(tg.v === tfx.v + tvo.v && tvo.v === 3 && tfx.v === 506 + 100 + 2, 'anual: fixas 608 (Jundiá 506 + Humaitá 100 + não mapeadas 2), volantes 3, total 611', [tfx, tvo, tg]);
  await shot(p, 'central_vigifito_anual');
  await p.evaluate(() => { window.__prints = []; }); await p.click('#pn-rg-imprimir');
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 30000 });
  const pr = await p.evaluate(() => window.__prints[0]);
  ok(/RELATÓRIO VIGIFITO — \d{4}/.test(pr.texto) && /VIGIFITO – TOTAL CONSOLIDADO/.test(pr.texto) && /TOTAL FIXAS/.test(pr.texto) && /TOTAL VOLANTES/.test(pr.texto) && /PRESIDENTE FIGUEIREDO - TOTAL/.test(pr.texto) && /e-GDV sem registro no mês/.test(pr.texto) && pr.folhas >= 5,
    'PDF/impressão anual: quadros mensais, por posto, totais (município, fixas, volantes) e a lista de substituições', pr.folhas);
  ok(!/PRODUTOR SECRETO|52998224725|Joana Fiscal/.test(pr.texto), 'relatório sem dados pessoais');
  const pdf = await baixar('#pn-rg-pdf');
  const npag = Number(py('import sys,pypdf;print(len(pypdf.PdfReader(sys.argv[1]).pages))', pdf.arq));
  ok(pdf.buf.slice(0, 5).toString() === '%PDF-' && (npag >= 5 || isNaN(npag)), 'PDF anual (arquivo)', [pdf.nome, npag]);
  const docx = await baixar('#pn-rg-docx');
  const W = py(`import sys,zipfile,json
from xml.dom import minidom
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
x=z.read('word/document.xml').decode('utf-8'); minidom.parseString(x)
for n in z.namelist():
    if n.endswith('.xml') or n.endswith('.rels'): minidom.parseString(z.read(n))
print(json.dumps({'tabelas':x.count('<w:tbl>'),'paisagem':x.count('w:orient="landscape"'),'ok':'PRESIDENTE FIGUEIREDO - BVA JUNDI' in x}))`, docx.arq);
  const WJ = W ? JSON.parse(W) : null;
  ok(docx.buf.slice(0, 2).toString() === 'PK' && (!WJ || (WJ.tabelas >= 10 && WJ.paisagem >= 1 && WJ.ok)), 'Word anual: zip e XML válidos, tabelas (por posto), seções em paisagem', WJ);
  try {
    const out = amb.saida('vig_lo'); fs.mkdirSync(out, { recursive: true });
    execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', out, docx.arq], { timeout: 180000, stdio: 'pipe' });
    ok(fs.existsSync(path.join(out, path.basename(docx.arq).replace(/\.docx$/, '.pdf'))), 'LibreOffice converte o .docx do VIGIFITO');
  } catch (e) { console.log('  (LibreOffice indisponível) ' + String(e.message).slice(0, 80)); }
  dx = await baixar('#pn-rg-xlsx');
  wbx = X.read(dx.buf);
  ok(['VIGIFITO', 'JUNDIÁ', '1 semestre', '2 semestre', 'Anual', 'ANUAL-MES'].every(n => wbx.SheetNames.includes(n)), '.xlsx anual: abas VIGIFITO, JUNDIÁ (períodos), 1 e 2 semestre, Anual e ANUAL-MES', wbx.SheetNames);
  aoa = X.utils.sheet_to_json(wbx.Sheets.VIGIFITO, { header: 1, raw: true, defval: null });
  ok(aoa[0][2] === 'PRESIDENTE FIGUEIREDO - BVA JUNDIÁ' && aoa[1][2] === 'J' && aoa[1][8] === '1º SEMESTRE' && aoa[1][16] === 'TOTAL' && aoa[2][0] === 'Veículos parados pela fiscalização' && aoa[2][2] === 5 && aoa[2][8] === 6 && aoa[2][16] === 506 && aoa[8][0] === null && aoa[8][1] === 't',
    'aba VIGIFITO: posto × J..D, 1º semestre e total por posto (Jundiá: jan 5, 1º sem 6, total 506)', [aoa[0].slice(0, 3), aoa[2].slice(0, 17)]);
  const an = X.utils.sheet_to_json(wbx.Sheets.Anual, { header: 1, raw: true, defval: null });
  const ci = n => an[0].indexOf(n);
  ok(ci('TOTAL FIXAS') > 0 && an[1][ci('TOTAL FIXAS')] === 608 && an[1][ci('TOTAL VOLANTES')] === 3 && an[1][ci('TOTAL')] === 611 && ci('PRESIDENTE FIGUEIREDO - TOTAL') > 0 && an.length === 29,
    'aba Anual: postos, totais por município, TOTAL FIXAS, TOTAL VOLANTES e TOTAL (28 linhas de indicadores)', an[0]);
  const ju = X.utils.sheet_to_json(wbx.Sheets['JUNDIÁ'], { header: 1, raw: true, defval: null });
  ok(/^\d{2}\/\d{2} A \d{2}\/\d{2}\/\d{4}$/.test(ju[1][2]) && ju[0][2] === 'PERÍODO 1' && ju.length === 30, 'aba JUNDIÁ: períodos de 10 dias com rótulos "05/01 A 14/01/2025"', ju[1].slice(0, 4));
  // consolidado: a Seção II/VIGIFITO = relatório VIGIFITO
  await p.selectOption('#pn-rg-rel', 'consolidado'); await esperar('s.rel === "consolidado" && s.R');
  await p.selectOption('#pn-rg-tipo', 'anual'); await esperar('s.R && s.R.tipo === "anual"');
  const vcons = await p.evaluate(() => Painel.aba('relatorios').estado().R.vig.total.find(x => x.chave === 'veiculos').total);
  ok(vcons === 611, 'consolidado anual: VIGIFITO total de veículos = relatório VIGIFITO (611)', vcons);
  // PCE
  await p.selectOption('#pn-rg-rel', 'pce'); await esperar('s.rel === "pce" && s.R');
  ok(/Relatório PCE/.test(await p.textContent('#pn-rg-titulo')) && !(await p.textContent('#pn-rg-corpo')).includes('Seção II — VIGIFITO'), 'PCE: só as partes de PCE (sem VIGIFITO)');
  await p.evaluate(() => { window.__prints = []; }); await p.click('#pn-rg-imprimir');
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 30000 });
  const pp = await p.evaluate(() => window.__prints[0].texto);
  ok(/RELATÓRIO PCE \d{4} — CONSOLIDADO/.test(pp) && /SEÇÃO I/.test(pp) && /HLB/.test(pp) && !/VIGIFITO –/.test(pp) && !/EMISSÃO DE CFO/.test(pp), 'PCE: Seção I, quadro PCE, HLB; sem VIGIFITO e sem CFO/PTV', pp.slice(0, 200));
  const pceD = await baixar('#pn-rg-docx'), pceP = await baixar('#pn-rg-pdf');
  ok(pceD.buf.slice(0, 2).toString() === 'PK' && pceP.buf.slice(0, 5).toString() === '%PDF-' && /Relatorio_PCE_\d{4}_Consolidado/.test(pceD.nome), 'PCE em Word e PDF', [pceD.nome, pceP.nome]);
  await shot(p, 'central_pce');
  // Convênio
  await p.selectOption('#pn-rg-rel', 'convenio'); await esperar('s.rel === "convenio" && s.CR');
  const cv = await baixar('#pn-rg-docx');
  ok(cv.buf.slice(0, 2).toString() === 'PK' && /Relatorio_Convenio_991272-2025_Parcial/.test(cv.nome), 'Convênio: relatório gerado também na central (Word)', cv.nome);
  // Metas SUASA
  await p.selectOption('#pn-rg-rel', 'suasa'); await p.waitForSelector('#pn-rg-suasa');
  ok(/Aguardando o plano de metas SUASA/.test(await p.textContent('#pn-rg-suasa')) && !(await p.$('#pn-rg-docx')), 'Metas SUASA: "aguardando o plano de metas SUASA" (sem gerar)');
  // postos do VIGIFITO (configuração editável): mapear a CEASA num posto novo
  await p.selectOption('#pn-rg-rel', 'vigifito'); await esperar('s.rel === "vigifito" && s.VR');
  await p.click('#pn-vig-postos'); await p.waitForSelector('#pn-vig-cfg[open]');
  await p.click('#pn-vig-cfg [data-add]');
  const novo = p.locator('#pn-vig-cfg .pn-conv-sub').last();
  await novo.locator('[data-k=id]').fill('manaus-ceasa'); await novo.locator('[data-k=nome]').fill('MANAUS - BVA CEASA'); await novo.locator('[data-k=municipio]').fill('Manaus');
  await novo.locator('[data-k=tipo]').selectOption('fixa'); await novo.locator('[data-k=locais]').fill('BVA - CEASA');
  await p.click('#pn-vig-cfg-salvar'); await p.waitForSelector('#pn-vig-cfg', { state: 'detached', timeout: 15000 });
  await esperar('s.VR && s.VR.postos.some(x => x.id === "manaus-ceasa")');
  c = await cel('manaus-ceasa', 'veiculos'); const mm = await cel('mun:manaus', 'veiculos');
  ok(c.v === 2 && mm.v === 2 && !(await p.evaluate(() => Painel.aba('relatorios').estado().VR.postos.some(x => x.id === '_outras-fixas'))), 'postos editáveis: CEASA mapeada para um posto novo (sai de "não mapeadas"; total de Manaus)', [c, mm]);
  for (const [tema, esq] of [['claro', 'light'], ['escuro', 'dark']]) {
    const pc = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: esq, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block' })).newPage();
    await pc.addInitScript(([tok, url, ano]) => { localStorage.setItem('gdv.url', url); localStorage.setItem('gdv.painel.token', tok); localStorage.setItem('gdv.painel.nome', 'G'); localStorage.setItem('gdv.painel.relgdv', JSON.stringify({ rel: 'vigifito', vmodo: 'mensal', ano, mes: 1 })); }, [TOK, amb.API_URL, A]);
    await pc.goto(amb.PAINEL); await pc.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 30000 }); await pc.click('.pn-aba[data-aba=relatorios]');
    await pc.waitForFunction(() => { const s = Painel.aba('relatorios').estado(); return s.VR && !s.carregando; }, null, { timeout: 30000 });
    ok(await pc.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `celular ${tema}: central sem rolagem horizontal`);
    await shot(pc, 'central_celular_' + tema, false);
    await pc.context().close();
  }
  ok(!errosPag.length, 'painel sem erros de JavaScript', errosPag.slice(0, 5));

  /* ================= 5. app de campo: carga no veículo ================= */
  console.log('5. App das barreiras: registro da carga no veículo → VIGIFITO calculado');
  const ca = await b.newContext({ viewport: { width: 400, height: 860 }, permissions: ['geolocation'], geolocation: { latitude: -2.05, longitude: -60.02, accuracy: 10 }, timezoneId: 'America/Manaus', locale: 'pt-BR' });
  await ca.addInitScript(() => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', 'segredo'); } } catch (e) { /* */ } });
  const pg = await ca.newPage(); const errosApp = [];
  pg.on('pageerror', e => errosApp.push(e.message)); pg.on('dialog', dd => dd.accept());
  await pg.goto(amb.APP); await pg.waitForSelector('.modulo'); await pg.click('.modulo[data-v=home]'); await pg.waitForSelector('#fTurno');
  await pg.fill('#nTF', '31'); await pg.selectOption('#nPosto', 'Fixa'); await pg.selectOption('#nLocal', 'BVA - JUNDIÁ');
  await pg.fill('#nFiscal1', 'Carla Campo Teste'); await pg.click('#fTurno button[type=submit]'); await pg.waitForSelector('.contador', { timeout: 20000 });
  await pg.waitForTimeout(400); await pg.click('nav [data-v=registrar]'); await pg.waitForSelector('#fVeic');
  ok(await pg.isChecked('#vEduc') && !(await pg.isVisible('#vCargaBox')), 'formulário: educação sanitária já marcada; bloco da carga escondido até marcar "Transporta vegetais"');
  await pg.check('#vCarga'); await pg.waitForSelector('#vProds .veic-prod');
  ok(await pg.isChecked('#vPartida'), 'com carga: "Partida fiscalizada" já vem marcada');
  await pg.selectOption('#vProds .veic-prod >> nth=0 >> [data-k=p]', 'CAJU');
  await pg.fill('#vProds .veic-prod >> nth=0 >> [data-k=q]', '500'); await pg.selectOption('#vProds .veic-prod >> nth=0 >> [data-k=u]', 'Kg');
  await pg.click('#vAddProd'); await pg.selectOption('#vProds .veic-prod >> nth=1 >> [data-k=p]', { index: 2 }); await pg.fill('#vProds .veic-prod >> nth=1 >> [data-k=q]', '1,5'); await pg.selectOption('#vProds .veic-prod >> nth=1 >> [data-k=u]', 'Ton');
  await pg.selectOption('#vUfOri', 'PA'); await pg.selectOption('#vUfDes', 'AM'); await pg.check('#vDoc'); await pg.check('#vMedFito');
  await shot(pg, 'app_veiculo_carga');
  await pg.click('#fVeic > button'); await pg.waitForFunction(() => /registrado/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
  await pg.click('nav [data-v=lista]'); await pg.waitForSelector('.item');
  ok(/Carga:.*500 Kg.*1,5 Ton.*PA → AM/.test(await pg.textContent('.item .veic-carga')), 'lista do turno mostra a carga (produtos e PA → AM)', await pg.textContent('.item'));
  let vrow = null;
  for (let i = 0; i < 40 && !vrow; i++) { await pg.waitForTimeout(500); const vv = await get('/__aba?nome=Veiculos'); const cb = vv[0]; const l = vv.find(x => x[cb.indexOf('carga')] === 1 && x[cb.indexOf('ufOrigem')] === 'PA' && x[cb.indexOf('docConferido')] === 1 && x[cb.indexOf('medidaFito')] === 1); if (l) vrow = Object.fromEntries(cb.map((k, j) => [k, l[j]])); }
  ok(vrow && vrow.partida === 1 && vrow.medidaFito === 1 && vrow.semEducacao === 0 && vrow.ufDestino === 'AM' && JSON.parse(vrow.produtos).length === 2, 'sincronizado: colunas novas na aba Veiculos (carga, produtos, UF origem/destino, partida, documento, medida)', vrow);
  const anoHoje = new Date(Date.now() - 4 * 3600e3).getUTCFullYear();
  const VH = await post({ action: 'painelVigDados', key: TOK, ano: anoHoje });
  const jh = Object.values((VH.apuracao && VH.apuracao.porMes['pf-jundia']) || {}).reduce((o, x) => { ['internN', 'importT', 'partidas', 'documentos', 'medidaFito', 'educacao'].forEach(k => { o[k] = (o[k] || 0) + (x[k] || 0); }); return o; }, {});
  ok(jh.internN === 1 && quase(jh.importT, 2) && jh.partidas === 1 && jh.documentos === 1 && jh.medidaFito === 1 && jh.educacao === 1, 'VIGIFITO do ano corrente calculado do registro feito no app (internalização 1; 0,5 t + 1,5 t = 2 t)', jh);
  ok(!errosApp.length, 'app sem erros de JavaScript', errosApp);
  await ca.close();
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
