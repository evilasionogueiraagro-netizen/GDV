// Relatório GDV, regras puras do front (web/documentos/relgdv-docs.js no vm, sem fakegas nem navegador): quadro PCE mensal (mês e
// acumulado) e anual (jan-dez e total), lançamentos manuais somados por mês, colunas derivadas, VIGIFITO total = fixas + volantes, mês
// futuro em branco, marcadores dos textos e textos iniciais (salvo, do relatório anterior ou padrão). A apuração do servidor, a aba, o
// PDF e o Word ficam em tests/relgdv_test.js. Dados fictícios.
'use strict';
const L = require('./vm_loader');
const { ok, fim } = L.verificador();
const W = L.carregar(['web/js/config.js', 'web/documentos/indicadores.js', 'web/documentos/conv-docs.js', 'web/documentos/relgdv-docs.js'], ['RelGdvDocs', 'CONFIG']);
const RD = W.RelGdvDocs, A = 2025;

// apuração mínima no formato de painelRelGdvApuracao
const comCol = x => ({ porCol: {}, outras: 0, ...x });   // cada mês/total traz as colunas de levantamento por grupo (porCol) e "outras pragas"
const quadro = (porMes, total) => ({ porMes: Object.fromEntries(Object.entries(porMes).map(([k, v]) => [k, comCol(v)])), total: comCol(total) });
const apAno = { de: `${A}-01-01`, ate: `${A}-12-31`, grupos: [],
  quadro: quadro({ [`${A}-01`]: { propVisitadas: 1, area: 2, inspecoes: 1, porCol: { '0:0': 1 } }, [`${A}-03`]: { propVisitadas: 7, area: 20, inspecoes: 8 }, [`${A}-06`]: { propVisitadas: 1, area: 4, inspecoes: 1 } },
    { propVisitadas: 9, area: 26, inspecoes: 10, porCol: { '0:0': 1 } }),
  vigifito: { fixa: { [`${A}-01`]: { veiculos: 3, apreensaoT: 0.25 }, [`${A}-03`]: { veiculos: 1 } }, volante: { [`${A}-02`]: { veiculos: 2, apreensaoT: 0.5, abordagem: 1 } } } };
const apMar = { ...apAno, de: `${A}-03-01`, ate: `${A}-03-31`, quadro: quadro(apAno.quadro.porMes, { propVisitadas: 7, area: 20, inspecoes: 8 }) };
const lanc = [{ mes: '03', chave: 'pce.capacitacao', valor: 2 }, { mes: '06', chave: 'pce.capacitacao', valor: 1 }, { mes: '03', chave: 'mun.carambola.armadilhas|Manaus', valor: 4 },
  { mes: '03', chave: 'mun.carambola.armadilhas|Iranduba', valor: 1 }, { mes: '03', chave: 'tab.cfo', lista: [{ produto: 'BANANA COMPRIDA', documentos: 3, quantidade: 10, unidade: 't' }] }];
const linha = (R, ch) => L.copia(R.quadroPce.find(x => x.chave === ch));
const vigT = (R, ch) => L.copia(R.vig.total.find(x => x.chave === ch));

const M = RD.calcular({ tipo: 'mensal', ano: A, mes: 3, ap: apMar, apAno, lancamentos: lanc, hoje: `${A + 1}-01-10` });
ok(linha(M, 'propVisitadas').mes === 7 && linha(M, 'propVisitadas').acum === 9, 'mensal (março): propriedades no mês 7; acumulado = total do ano apurado (distintas, não soma)', linha(M, 'propVisitadas'));
ok(linha(M, 'pce.capacitacao').mes === 2 && linha(M, 'pce.capacitacao').acum === 2, 'manual: capacitação de março 2; acumulado jan-mar 2 (junho fora)', linha(M, 'pce.capacitacao'));
ok(linha(M, 'armadilhas').mes === 5, 'derivada: armadilhas = soma das colunas por município (4 + 1)', linha(M, 'armadilhas'));
const An = RD.calcular({ tipo: 'anual', ano: A, ap: apAno, lancamentos: lanc, hoje: `${A + 1}-01-10` });
ok(linha(An, 'propVisitadas').total === 9 && linha(An, 'propVisitadas').valores['03'] === 7 && linha(An, 'area').total === 26, 'anual: jan-dez + total (9 propriedades distintas; área 26 ha)', linha(An, 'propVisitadas'));
ok(linha(An, 'pce.capacitacao').total === 3 && linha(An, 'pce.capacitacao').valores['03'] === 2 && linha(An, 'pce.capacitacao').valores['01'] === null, 'anual: capacitação = soma dos meses (2 + 1); mês sem lançamento em branco', linha(An, 'pce.capacitacao'));
ok(An.quadroPce.filter(x => x.porCol === '0:0').every(x => x.total === 1 && x.valores['01'] === 1 && x.valores['02'] === 0), 'coluna de levantamento por grupo (porCol): total e mês a mês do apurado', An.quadroPce.filter(x => x.porCol === '0:0').map(x => x.rotulo));
ok(vigT(An, 'veiculos').total === 6 && Math.abs(vigT(An, 'apreensaoT').total - 0.75) < 1e-9 && vigT(An, 'abordagem').total === 1, 'VIGIFITO anual: total = fixas + volantes (6 veículos; 0,75 t; 1 abordagem)', vigT(An, 'veiculos'));
const F = RD.calcular({ tipo: 'anual', ano: A, ap: apAno, lancamentos: lanc, hoje: `${A}-04-15` });
ok(linha(F, 'pce.capacitacao').valores['06'] === null && linha(F, 'propVisitadas').valores['06'] === null && vigT(F, 'veiculos').valores['03'] === 1, 'ano em curso: meses futuros em branco (nem lançado nem apurado)', linha(F, 'pce.capacitacao').valores);

// textos
ok(RD.aplicarMarcadores('Em {periodo} foram {levantamentos} levantamentos; {desconhecido}.', { periodo: 'março/2025', levantamentos: 10 }) === 'Em março/2025 foram 10 levantamentos; {desconhecido}.', 'marcadores substituídos; desconhecido fica como está');
const salvos = [{ tipo: 'mensal', ano: A, mes: '02', textos: { introducao: 'Texto de fevereiro', anexo: 1 } }, { tipo: 'anual', ano: A - 1, mes: '', textos: { introducao: 'Texto do ano anterior' } }];
const t3 = L.copia(RD.textosIniciais(salvos, 'mensal', A, 3)), t2 = L.copia(RD.textosIniciais(salvos, 'mensal', A, 2)), t1 = L.copia(RD.textosIniciais(salvos, 'mensal', A, 1));
ok(t3.origem === 'anterior' && t3.textos.introducao === 'Texto de fevereiro' && t3.textos.anexo === 0 && t3.anterior === `fevereiro/${A}`, 'mês sem texto salvo: parte do relatório anterior (sem herdar o anexo)', t3);
ok(t2.origem === 'salvo' && t2.textos.anexo === 1 && t1.origem === 'padrao' && t1.textos.introducao === RD.TEXTOS_PADRAO.introducao, 'texto salvo do próprio mês; sem anterior, o padrão');
const ta = L.copia(RD.textosIniciais(salvos, 'anual', A));
ok(ta.origem === 'anterior' && ta.textos.anexo === 1 && Array.isArray(ta.textos.assinaturas) && ta.textos.assinaturas.length > 0, 'anual: anexo marcado por padrão; assinaturas da configuração', ta.textos.anexo);
ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(JSON.stringify(RD.TEXTOS_PADRAO)), 'textos padrão sem nenhum CPF');
fim();
