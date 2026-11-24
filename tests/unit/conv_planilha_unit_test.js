// Convênios: importação da planilha de movimentação financeira, prévia pura (web/painel/js/conv-planilha.js no Node, sem fakegas nem
// navegador), com a planilha SINTÉTICA de tests/lib/planilha-convfin.js e o plano de trabalho semente do back (convSemente_ do
// apps-script/convenios.gs). A tela do portal, a gravação, a reimportação e o relatório ficam em tests/convfin_test.js.
'use strict';
const path = require('path');
const L = require('./vm_loader');
const { NOMES, planilha, X } = require('../lib/planilha-convfin');
const CP = require(path.join(L.RAIZ, 'web/painel/js/conv-planilha.js'));
const { ok, fim } = L.verificador();
const quase = (a, b) => Math.abs(a - b) < 0.005;

const cfg = L.copia(L.carregar(L.gs('dashboard-publico', 'convenios'), ['convSemente_']).convSemente_());
ok(cfg.id === '991272-2025' && cfg.etapas.length === 7, 'plano de trabalho semente do back (7 etapas)', cfg.etapas.map(e => e.id));
const P1 = planilha(false), abas = CP.abasDoLivro(X, X.read(P1.buf));
const ext = CP.extrair(abas, { nomes: true }), V = CP.previa(ext, cfg, []), T = V.totais;
ok(T.linhas === 20 && T.novos === 17 && T.iguais === 0 && T.alterados === 0, 'prévia: 20 lançamentos na planilha (total da aba e linhas zeradas fora), 17 novos', T);
ok(T.repetidas === 1 && T.repetidasFora === 1 && T.semData === 1 && T.bloqueadas === 2 && T.antesInicio === 2, 'prévia: 1 memo repetido (fora por padrão), 1 sem data, 2 bloqueadas, 2 antes do início', T);
ok(quase(T.valorPlanilha, P1.total) && quase(T.valorGravar, 212337), 'prévia: total da planilha = aba SOMA; a gravar R$ 212.337,00', [T.valorPlanilha, P1.total, T.valorGravar]);
ok(V.soma && V.soma.total.ok && V.soma.etapas.filter(e => e.etapa !== '9.9').every(e => e.ok), 'conferência com a aba SOMA (total e por etapa)', V.soma);
ok(V.abasIgnoradas.includes('CONSOLIDADA'), 'aba CONSOLIDADA (desatualizada) não usada', V.abasIgnoradas);
const sd = V.linhas.find(l => !l.dataPlanilha);
ok(sd && sd.data === '2026-02-23' && sd.aba === 'SUBETAPA 1.10.4' && sd.importar && sd.chave === 'imp|991272-2025|1.10.4||2100.00|1', 'linha sem data: data padrão = 1º lançamento datado da aba; chave sem memo', sd);
const rp = V.linhas.find(l => l.repetido);
ok(rp && rp.memo === '112/2026' && rp.status === 'repetida' && !rp.importar, 'memo 112/2026 repetido: marcado e não importado por padrão', rp);
const l089 = V.linhas.find(l => l.memo === '89/2026');
ok(l089 && l089.chave === 'imp|991272-2025|1.10.4|89/2026' && l089.documento === 'Memo nº 89/2026' && l089.descricao === 'Diária NM' && l089.quantidade === 10 && l089.avisos.includes('antes do início da execução'),
  'memo 089/2026: chave sem zeros à esquerda, documento, "Diária NM", 10 diárias (2.100 / 210), aviso de antes do início', l089);
ok(V.linhas.find(l => l.memo === '500/2026').bloqueio === 'data fora da vigência' && /não existe no plano/.test(V.linhas.find(l => l.sub === '9.9.9').bloqueio), 'bloqueios: data fora da vigência; subetapa 9.9.9 fora do plano');
const it = id => V.itens.find(y => y.id === id);
ok(it('1.4.3').avisos.some(a => /total da aba .* ≠ executado do cabeçalho/.test(a)) && it('1.14.6').avisos.some(a => /acima do previsto/.test(a)), 'avisos: total da aba ≠ cabeçalho (1.4.3); executado > previsto (1.14.6)', [it('1.4.3').avisos, it('1.14.6').avisos]);
ok(it('1.10.5').diarias === 1125 && it('1.5.4').diarias === 10 && quase(it('1.10.4').gravar, 11655), 'diárias equivalentes por item (1.10.5: 1.125; 1.5.4: 10) e soma importada da 1.10.4 (R$ 11.655,00)', [it('1.10.5'), it('1.10.4').gravar]);
ok(V.linhas.filter(l => l.servidorNome).every(l => NOMES.includes(l.servidorNome)) && V.linhas.some(l => l.servidorNome === NOMES[1]), 'portal ({nomes: true}): a prévia traz o servidor de cada diária (coluna NOME)');
const semNomes = CP.previa(CP.extrair(abas), cfg, []);
ok(!JSON.stringify(semNomes).includes(NOMES[0]) && !JSON.stringify(semNomes).includes(NOMES[1]), 'sem {nomes: true} (painel/relatórios): nenhum nome da coluna NOME sai da leitura');

// decisões: data escolhida, linha ignorada e repetida importada mesmo assim
const V2 = CP.previa(ext, cfg, [], { datas: { [sd.lid]: '2026-03-05' }, ignorar: { [l089.lid]: true }, repetidos: { [rp.lid]: true } });
const sd2 = V2.linhas.find(l => l.lid === sd.lid), l2 = V2.linhas.find(l => l.lid === l089.lid), r2 = V2.linhas.find(l => l.lid === rp.lid);
ok(sd2.data === '2026-03-05' && !l2.importar && r2.importar && V2.totais.novos === 17, 'decisões: data da linha sem data, ignorar uma linha e importar a repetida', [sd2.data, l2.importar, r2.importar, V2.totais.novos]);

// reimportação: o que já está no sistema (mesma chave e valor) vira "igual"; valor diferente vira "alterado"; o que sumiu da planilha aparece
const noSistema = V.envio.map((e, i) => ({ id: 'f' + i, convenio: cfg.id, ...e, excluido: 0 }));
const R = CP.previa(ext, cfg, noSistema);
ok(R.totais.novos === 0 && R.totais.iguais === 17 && R.totais.alterados === 0, 'reimportar a mesma planilha: nada novo (idempotente)', R.totais);
const V3 = CP.previa(CP.extrair(CP.abasDoLivro(X, X.read(planilha(true).buf)), { nomes: true }), cfg, noSistema);
ok(V3.totais.alterados === 1 && V3.linhas.some(l => l.memo === '120/2026' && l.status === 'alterado') && (V3.ausentes || []).some(a => /121\/2026/.test(a.documento || '')),
  'planilha alterada: memo 120 com valor novo = alterado; memo 121 sumiu = "no sistema mas não na planilha"', [V3.totais, (V3.ausentes || []).map(a => a.documento)]);
fim();
