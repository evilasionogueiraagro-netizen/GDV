// VIGIFITO, motor sem navegador: a apuração por posto do back (vigApurar_ do apps-script/vigifito.gs, com a leitura da planilha trocada
// por turnos e TFs prontos, no formato do motorBarreira_) e o relatório do front (VigDocs.calcular, Indicadores.valorVig, VigDocs.xlsx
// e VigDocs.blocos + DocxMin, no Node): posto fixo pelo local (e apelido da CEASA), volante pelo município, turno sem posto em "OUTRAS",
// período de 10 dias pela data de início, mensal/período/semestral/anual, lançado x substituído x e-GDV, totais por município, fixas e
// volantes, avisos, abas do .xlsx e Word anual em paisagem. As regras de cada número a partir dos registros (motorBarreira_) e as telas
// ficam em tests/vigifito_test.js. Dados fictícios.
'use strict';
const path = require('path');
const L = require('./vm_loader');
const { ok, fim } = L.verificador();
const X = require(path.join(L.RAIZ, 'web/painel/vendor/xlsx/xlsx.mini.min.js'));
const quase = (a, b) => Math.abs(a - b) < 0.0005;

(async () => {
  /* ---------- back: apuração por posto ---------- */
  const B = L.carregarBack(['vigApurar_', 'vigSemente_', 'vigZero_', 'vigPeriodo_']);
  const A = 2025, d = (m, dia) => `${A}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const T = (id, tipo, local, unidade, data, x = {}) => ({ id, tipo, local, unidade, data, veiculos: 0, pessoas: 0, educacao: 0, internN: 0, cargasEstados: 0, papel: null, ...x });
  const F = (turnoId, data, x = {}) => ({ turnoId, data, barreira: '', local: '', tipo: 'fixa', documentos: 0, inspecao: 0, sentido: '', cargaT: 0, outrasCarga: {}, advertencia: 0, fiel: 0, auto: 0,
    procedimento: 'liberacao', liberacaoT: 0, apreensaoT: 0, coleta: 0, amostras: 0, outras: {}, ...x });
  const turnos = [T('j1', 'fixa', 'BVA - JUNDIÁ', 'BVA - JUNDIÁ', d(1, 14), { veiculos: 3, pessoas: 11, educacao: 11, internN: 1 }), T('j2', 'fixa', 'BVA - JUNDIÁ', '', d(1, 13), { veiculos: 2, educacao: 4 }),
    T('c1', 'fixa', 'Barreira Porto da CEASA', 'MANAUS', d(4, 6), { veiculos: 1, educacao: 3 }), T('v1', 'volante', 'Porto de Tabatinga', 'TABATINGA', d(2, 5), { veiculos: 2, educacao: 42 }),
    T('v2', 'volante', 'Comunidade Ficticia', 'Iranduba - AM', d(2, 6), { veiculos: 1 }), T('x1', 'fixa', 'BVA - FICTÍCIA DO TESTE', '', d(3, 5), { veiculos: 2 })];
  const tfs = [F('j1', d(1, 14), { documentos: 1, inspecao: 1, sentido: 'intern', cargaT: 3.5, outrasCarga: { Caixas: 20 }, liberacaoT: 3.5 }),
    F('j1', d(1, 14), { procedimento: 'apreensao', sentido: 'estados', cargaT: 0.25, apreensaoT: 0.25, outras: { Caixas: 10 } }),
    F('j2', d(1, 13), { coleta: 1, amostras: 2, inspecao: 1 }), F('v1', d(2, 5), { procedimento: 'apreensao', fiel: 1, auto: 1, sentido: 'intern', cargaT: 0.5, apreensaoT: 0.5 }),
    F('', d(3, 10), { local: 'BVA - JUNDIÁ', procedimento: 'rechaco', advertencia: 1 })];   // TF do papel, sem turno: posto pelo local
  B.ctx.motorBarreira_ = () => ({ turnos, tfs });
  B.ctx.lerLeitura_ = () => [];
  const cfg = L.copia(B.vigSemente_()), ap = L.copia(B.vigApurar_(cfg, d(1, 1), d(12, 31)));
  const pm = (p, m) => ((ap.porMes[p] || {})[`${A}-${String(m).padStart(2, '0')}`]) || {};
  const J1 = pm('pf-jundia', 1);
  ok(J1.turnos === 2 && J1.veiculos === 5 && J1.educacao === 15 && J1.tfs === 3 && J1.medidaFito === 3 && J1.partidas === 3, 'Jundiá/janeiro: 2 turnos, 5 veículos, educação 15, 3 TFs = medida fitossanitária = partidas', J1);
  ok(J1.internN === 2 && quase(J1.internT, 3.5) && quase(J1.importT, 3.5) && J1.cargasEstados === 1 && quase(J1.exportT, 0.25) && J1.outrasUnidades.carga.Caixas === 20,
    'internalização: veículo sem TF (motor) + TF RR->AM (3,5 t); carga para outro estado 0,25 t; caixas à parte', J1);
  ok(J1.documentos === 1 && J1.inspecaoFito === 2 && J1.coleta === 1 && J1.amostras === 2 && J1.autoDestN === 1 && quase(J1.autoDestT, 0.25) && J1.outrasUnidades.apreensao.Caixas === 10,
    'documentos, inspeção, coleta com 2 amostras, auto de destruição = apreensão (0,25 t)', J1);
  ok(pm('pf-jundia', 3).rechaco === 1 && pm('pf-jundia', 3).advertencia === 1 && pm('pf-jundia', 3).turnos === 0, 'TF do papel sem turno: posto pelo local (Jundiá/março)', pm('pf-jundia', 3));
  ok(pm('manaus-ceasa', 4).veiculos === 1 && pm('manaus-ceasa', 4).educacao === 3, 'apelido "Barreira Porto da CEASA" cai no posto da CEASA', pm('manaus-ceasa', 4));
  ok(pm('tabatinga-volante', 2).abordagem === 1 && pm('tabatinga-volante', 2).infracao === 1 && pm('tabatinga-volante', 2).fiel === 1 && pm('iranduba-volante', 2).abordagem === 1,
    'volante pelo município da unidade ("TABATINGA", "Iranduba - AM"); abordagem itinerante = turnos volantes', [pm('tabatinga-volante', 2), pm('iranduba-volante', 2)]);
  ok(pm('_outras-fixas', 3).veiculos === 2 && ap.naoMapeados.some(n => n.local === 'BVA - FICTÍCIA DO TESTE' && n.turnos === 1) && ap.postos.some(p => p.id === '_outras-fixas'),
    'BVA sem posto: "OUTRAS BVA FIXAS (não mapeadas)" + aviso', ap.naoMapeados);
  const P1 = B.vigPeriodo_(cfg, d(1, 13)), P2 = B.vigPeriodo_(cfg, d(1, 14));
  ok(P2 === d(1, 14) && P1 < P2 && ap.porPeriodo['pf-jundia'][P1].veiculos === 2 && ap.porPeriodo['pf-jundia'][P2].veiculos === 3,
    `período de 10 dias pela data de início do turno: ${d(1, 14)} (dia da troca) abre um período`, ap.porPeriodo['pf-jundia']);

  /* ---------- front: VigDocs.calcular (mesmo período que o back) ---------- */
  const W = L.carregar(['web/documentos/indicadores.js', 'web/documentos/vigifito-docs.js', 'web/painel/js/docx.js'], ['Indicadores', 'VigDocs', 'DocxMin']);
  const I = W.Indicadores, V = W.VigDocs;
  ok(V.periodoDe(cfg.ancora, cfg.ciclo, d(1, 13)) === P1 && V.periodoDe(cfg.ancora, cfg.ciclo, d(1, 14)) === P2, 'mesma regra de período no back e no front');
  const pers = L.copia(V.periodosDoAno(cfg.ancora, cfg.ciclo, A));
  ok(pers[0].inicio >= `${A}-01-01` && pers.every((p, i) => !i || p.inicio === pers[i - 1].fim) && /^\d{2}\/\d{2} A \d{2}\/\d{2}\/\d{4}$/.test(pers[0].rotulo), 'períodos do ano encadeados, rótulo "05/01 A 14/01/2025"', pers.slice(0, 2));
  // valorVig: manual, automático e substituição
  ok(I.valorVig('capacitacao', { capacitacao: 9 }, { valor: 3 }).v === 3 && I.valorVig('capacitacao', null, null).v === null && I.valorVig('capacitacao', null, { valor: 3 }).origem === 'lancado', 'manual: só o lançado; sem lançamento = "—"');
  ok(I.valorVig('veiculos', { veiculos: 5 }, { valor: 500 }).v === 5 && I.valorVig('veiculos', { veiculos: 5 }, { valor: 500, substitui: 1 }).origem === 'substituido' && I.valorVig('veiculos', {}, null).v === 0,
    'automático: lançado sem "substitui" não vale; com "substitui" troca o e-GDV; sem registro = 0');
  const lanc = [{ periodo: `${A}-01`, posto: 'pf-jundia', indicador: 'capacitacao', valor: 2 }, { periodo: `${A}-12`, posto: 'pf-jundia', indicador: 'veiculos', valor: 500, substitui: 1, justificativa: 'Contagem manual ficticia', usuario: 'Pessoa Ficticia Alfa' },
    { periodo: `${A}-01`, posto: 'humaita-fixa', indicador: 'veiculos', valor: 100, substitui: 1, justificativa: 'Planilha' },
    ...[1, 2, 3].map(m => ({ periodo: `${A}-0${m}`, posto: 'pf-jundia', indicador: 'madeira', valor: 10 + m })), { periodo: `${A}-04`, posto: 'pf-jundia', indicador: 'madeira', valor: 300 },
    { periodo: 'P' + P1, posto: 'pf-jundia', indicador: 'partidas', valor: 11, substitui: 1, justificativa: 'Histórico' }];
  const dados = { cfg, lancamentos: lanc, apuracao: ap };
  const R = (tipo, o = {}) => V.calcular({ tipo, ano: A, dados, hoje: `${A + 1}-06-01`, ...o });
  const tot = (Rx, g, k, cols) => { const gr = Rx.grupos.find(x => x.id === g); return L.copia(Rx.tot(gr.ids, k, cols)); };
  const M = R('mensal', { mes: 1 });
  ok(tot(M, 'pf-jundia', 'veiculos').v === 5 && Object.keys(tot(M, 'pf-jundia', 'veiculos').origens).join() === 'auto' && tot(M, 'pf-jundia', 'capacitacao').v === 2, 'mensal (janeiro): Jundiá 5 veículos (e-GDV) e capacitação 2 (lançada)', tot(M, 'pf-jundia', 'veiculos'));
  ok(tot(M, 'humaita-fixa', 'veiculos').v === 100 && tot(M, 'humaita-fixa', 'veiculos').origens.substituido, 'mensal: Humaitá substituído (100)', tot(M, 'humaita-fixa', 'veiculos'));
  ok(tot(M, 'total', 'veiculos').v === tot(M, 'fixas', 'veiculos').v + tot(M, 'volantes', 'veiculos').v && tot(M, 'fixas', 'veiculos').v === 105, 'total = fixas + volantes (105 + 0)', [tot(M, 'fixas', 'veiculos'), tot(M, 'volantes', 'veiculos')]);
  ok(tot(M, 'mun:presidente figueiredo', 'veiculos').v === 5 && M.grupos.some(g => g.rotulo === 'PRESIDENTE FIGUEIREDO - TOTAL'), 'total por município (BVA Jundiá + volante)');
  const Pp = R('periodo', { periodo: P1 });
  ok(tot(Pp, 'pf-jundia', 'veiculos').v === 2 && tot(Pp, 'pf-jundia', 'partidas').v === 11 && tot(Pp, 'pf-jundia', 'partidas').origens.substituido && /período de 10 dias \d{2}\/01 A/.test(Pp.rotulo),
    `período ${P1}: 2 veículos (e-GDV) e partidas substituídas pelo histórico (11)`, [tot(Pp, 'pf-jundia', 'veiculos'), Pp.rotulo]);
  ok(tot(R('semestral', { semestre: 1 }), 'pf-jundia', 'veiculos').v === 5, '1º semestre: Jundiá 5 veículos');
  const An = R('anual');
  ok(tot(An, 'pf-jundia', 'veiculos').v === 505 && Object.keys(tot(An, 'pf-jundia', 'veiculos').origens).sort().join() === 'auto,substituido', 'anual: Jundiá 505 (5 do e-GDV + 500 em dezembro, substituído)', tot(An, 'pf-jundia', 'veiculos'));
  const av = L.copia(An.avisos).map(a => a.titulo);
  ok(av.some(a => /sem posto do VIGIFITO/.test(a)) && av.some(a => /fora do padrão/.test(a)) && av.some(a => /substituem/.test(a)) && av.some(a => /não são de massa/.test(a)), 'avisos: sem posto, fora do padrão (300 m³), substituições, outras unidades', av);
  const ruins = [];
  An.grupos.forEach(g => I.VIGIFITO.forEach(dd => { const x = An.tot(g.ids, dd.k); if (x.v != null && (x.v < 0 || (dd.unid === 'nº' && Math.round(x.v) !== x.v))) ruins.push([g.id, dd.k, x.v]); }));
  ok(!ruins.length, 'anual: nenhum negativo nem decimal em contagem em nenhum posto/total', ruins);
  ok(V.calcular({ tipo: 'mensal', ano: A, mes: 12, dados, hoje: `${A}-11-20` }).tot(['pf-jundia'], 'veiculos').v === null, 'mês futuro: sem valor ("—"), nem o substituído');

  /* ---------- .xlsx anual (SheetJS no Node) ---------- */
  const wb = V.xlsx(An, X), aba = n => X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
  ok(['VIGIFITO', 'JUNDIÁ', '1 semestre', '2 semestre', 'Anual', 'ANUAL-MES'].every(n => wb.SheetNames.includes(n)), '.xlsx anual: abas VIGIFITO, JUNDIÁ, 1 e 2 semestre, Anual e ANUAL-MES', wb.SheetNames);
  const vg = aba('VIGIFITO');
  ok(vg[0][2] === 'PRESIDENTE FIGUEIREDO - BVA JUNDIÁ' && vg[1][2] === 'J' && vg[1][8] === '1º SEMESTRE' && vg[1][16] === 'TOTAL' && vg[2][0] === 'Veículos parados pela fiscalização' && vg[2][2] === 5 && vg[2][16] === 505,
    'aba VIGIFITO: posto x J..D, semestre e total (Jundiá: jan 5, total 505)', [vg[0].slice(0, 3), vg[2].slice(0, 17)]);
  const an = aba('Anual'), ci = n => an[0].indexOf(n);
  ok(ci('TOTAL FIXAS') > 0 && an[1][ci('TOTAL')] === an[1][ci('TOTAL FIXAS')] + an[1][ci('TOTAL VOLANTES')] && an.length === 29, 'aba Anual: TOTAL = FIXAS + VOLANTES, 28 linhas de indicadores', an[0].slice(-4));
  const ju = aba('JUNDIÁ');
  ok(ju[0][2] === 'PERÍODO 1' && /^\d{2}\/\d{2} A \d{2}\/\d{2}\/\d{4}$/.test(ju[1][2]) && ju.length === 30, 'aba JUNDIÁ: períodos de 10 dias com rótulo', ju[1].slice(0, 4));
  ok(V.xlsx(M, X).SheetNames[0] === `VIGIFITO JAN ${A}`, '.xlsx mensal: uma aba "VIGIFITO JAN AAAA"', V.xlsx(M, X).SheetNames);

  /* ---------- Word anual (VigDocs.blocos + DocxMin, no Node) ---------- */
  const blocos = V.blocos(An, {}, { dataEmissao: `${A + 1}-01-10` });
  const doc = Buffer.from(await W.DocxMin.criar({ blocos, titulo: blocos[0].texto, autor: 'e-GDV' }).arrayBuffer());
  const xml = doc.toString('utf8');   // zip "store" (sem compressão): o XML fica legível no arquivo
  ok(doc.slice(0, 2).toString() === 'PK' && /word\/document\.xml/.test(xml), 'Word anual: pacote zip com word/document.xml');
  ok((xml.match(/<w:tbl>/g) || []).length >= 10 && /w:orient="landscape"/.test(xml) && xml.includes('PRESIDENTE FIGUEIREDO - BVA JUNDI') && !/Pessoa Ficticia Alfa/.test(xml),
    'Word anual: tabelas por posto, seções em paisagem, sem quem lançou', (xml.match(/<w:tbl>/g) || []).length);
  fim();
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exitCode = 1; });
