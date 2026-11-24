// Planilha SINTÉTICA de movimentação financeira do convênio (layout da planilha do gestor), usada pelo tests/convfin_test.js (importação
// pelo Portal do Administrativo) e pelo tests/unit/conv_planilha_unit_test.js (prévia pura, sem navegador). NOMES FICTÍCIOS na coluna NOME.
const path = require('path');
const X = require(path.join(__dirname, '..', '..', 'web/painel/vendor/xlsx/xlsx.mini.min.js'));
// nomes fictícios na coluna NOME: nenhum pode sair do navegador
const NOMES = ['Fulano Fictício de Teste', 'Beltrana Imaginária Silva', 'Cicrano Inventado Souza', 'Servidora Exemplo Lima'];
const serial = iso => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
/** Aba no layout do gestor. linhas = [[data|null, memo|null, tipo, valor]]; total = linha final sem data (soma de tudo). */
function aba(cod, etapa, previsto, linhas, o = {}) {
  const soma = linhas.reduce((s, l) => s + l[3], 0), exec = o.executado != null ? o.executado : soma;
  const aoa = [['MOVIMENTAÇÃO FINANCEIRA CONVÊNIO VEGETAL', null, null, null, null, 'SALDO TOTAL', etapa],
    ['VALOR DA SUBETAPA', null, null, previsto, exec, previsto - exec, 'Descrição da etapa no plano de trabalho (texto do plano).'],
    ['DATA EMISSÃO', 'MEMO Nº', 'TIPO', 'SUBETAPA', 'NOME', 'Valor Original (R$)']];
  linhas.forEach((l, i) => aoa.push([l[0] ? serial(l[0]) : null, l[1], l[2], cod, NOMES[i % NOMES.length], l[3]]));
  aoa.push([null, null, 'DIÁRIA NM', cod, null, 0], [null, null, 'DIÁRIA NM', cod, null, null]);   // linhas vazias com 0
  aoa.push([null, null, null, null, NOMES[0], soma]);                                               // total da aba (sem data)
  return aoa;
}
function planilha(var2) {
  const A = {
    'SUBETAPA 1.4.3': aba('1.4.3', '1.4', 22680, [['2026-09-10', '300/2026', 'DIÁRIA NM', 600]], { executado: 700 }),          // cabeçalho ≠ total
    'SUBETAPA 1.4.4': aba('1.4.4', '1.4', 9240, [['2026-09-12', '303/2026', 'DIÁRIA NS', 9240]]),                              // item esgotado
    'SUBETAPA 1.5.4': aba('1.5.4', '1.5', 259200, [['2027-06-01', '500/2026', 'DIÁRIA TERCEIROS', 240], ['2026-08-10', '501/2026', 'DIÁRIA TERCEIROS', 1200]]),
    'SUBETAPA 1.10.3': aba('1.10.3', '1.10', 65520, [['2026-09-01', '200/2026', 'DIÁRIA NS', 25200], ['2026-10-01', '201/2026', 'DIÁRIA NS', 25200]]),
    'SUBETAPA 1.10.4': aba('1.10.4', '1.10', 159600, [[null, null, 'DIÁRIA NM', 2100], ['2026-02-23', '089/2026', 'DIÁRIA NM', 2100], ['2026-03-10', '090/2026', 'DIÁRIA NM', 1050],
      ['2026-04-02', '112/2026', 'DIÁRIA NM', 2100], ['2026-04-02', '112/2026', 'DIÁRIA NM', 2100], ['2026-09-15', '120/2026', 'DIÁRIA NM', var2 ? 4410 : 4200]]
      .concat(var2 ? [] : [['2026-10-05', '121/2026', 'DIÁRIA NM', 105]])),
    'SUBETAPA 1.10.5': aba('1.10.5', '1.10', 136080, [['2026-08-05', '700/2026', 'DIÁRIA NM', 45000], ['2026-09-05', '701/2026', 'DIÁRIA NM', 45000], ['2026-10-05', '702/2026', 'DIÁRIA NM', 45000]]),
    'SUBETAPA 1.14.5': aba('1.14.5', '1.14', 1512, [['2026-09-21', '602/2026', 'DIÁRIA NS', 1512]]),
    'SUBETAPA 1.14.6': aba('1.14.6', '1.14', 2520, [['2026-09-20', '600/2026', 'DIÁRIA NM', 2100], ['2026-10-02', '601/2026', 'DIÁRIA NM', 630]]),   // acima do previsto
    'SUBETAPA 9.9.9': aba('9.9.9', '9.9', 1000, [['2026-09-01', '400/2026', 'DIÁRIA NM', 100]])                                // fora do plano
  };
  const somaEt = {}; Object.values(A).forEach(a => { const et = a[0][6]; somaEt[et] = (somaEt[et] || 0) + a[a.length - 1][5]; });
  const soma = [['SUBETAPA', null, 'EXECUTADO', null]].concat(['1.4', '1.5', '1.10', '1.14'].map(e => [e, null, somaEt[e], null]));
  soma.push(['TOTAL', null, Object.values(somaEt).reduce((s, v) => s + v, 0), null]);
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['CONSOLIDADA (desatualizada)'], ['1.10.4', NOMES[1], 999999]]), 'CONSOLIDADA');
  Object.entries(A).forEach(([n, aoa], i) => { X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), n); if (i === 0) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(soma), 'SOMA '); });
  return { buf: X.write(wb, { type: 'buffer', bookType: 'xlsx' }), total: Object.values(somaEt).reduce((s, v) => s + v, 0) };
}

module.exports = { NOMES, serial, aba, planilha, X };
