// PCE: Relatório de atividades, cálculo puro (PCEDocs.calcularRelatorio e programasRelatorio de web/documentos/pce-docs.js no vm, sem
// fakegas nem navegador): filtro por período, município, servidor e programa; cancelados e excluídos fora; números dos Termos, plantas,
// educação sanitária (ações + folders), coleta, sintomas e culturas avaliadas (hospedeiros). A prévia e o PDF na tela ficam em
// tests/pce_moniliase_test.js. Dados fictícios.
'use strict';
const L = require('./vm_loader');
const { ok, fim } = L.verificador();
const W = L.carregar(['web/js/config.js', 'web/documentos/pce-docs.js'], ['CONFIG', 'PCEDocs']);
const D = W.PCEDocs, calc = (t, c, f) => L.copia(D.calcularRelatorio(t, c, f));

// sem ação de Educação Sanitária e sem folders
ok(calc([{ id: 'x', data: '2026-07-08', acoes: '["Fiscalização"]' }], [], {}).textos.educacao === 'não realizada', 'sem ação de Educação Sanitária e sem folders: "não realizada"');

// programa: o Termo entra pela caixa de praga, pelo nome do programa por extenso ou (sem caixa marcada) pelo modelo gravado
const t = (id, o) => ({ id, data: '2026-07-08', numero: 1, ano: 2026, acoes: '[]', hospedeiros: '["Laranja"]', ...o });
const termos = [t('a', { pragas: '["HLB"]' }), t('b', { pragas: '[]', programaVisita: 'Pragas dos Citros', numero: 2 }), t('c', { pragas: '["Monilíase"]', numero: 3 }), t('d', { pragas: '[]', programa: 'citros', numero: 4 })];
const c = calc(termos, [], { programa: 'citros' });
ok(c.termos.map(x => x.id).join('') === 'abd' && c.textos.hospedeiros === 'Laranja' && c.textos.numeros === '(Nº dos termos: 001/2026; 002/2026; 004/2026)',
  'relatório por programa (citros): Termo pela caixa de praga, pelo nome do programa ou pelo modelo; Monilíase fora', c.textos);
ok(/detecção das pragas dos Citros, visando/.test(D.objetivoRelatorio({ programa: 'citros' })) && L.copia(D.programasRelatorio()).length === 6,
  'objetivo com o texto do programa; 6 programas no relatório', D.objetivoRelatorio({ programa: 'citros' }));

// filtros e agregados
const T2 = [
  { id: 'm1', data: '2026-07-08', hora: '09:00', numero: 1, ano: 2026, municipio: 'Autazes', servidor: 'Pessoa Ficticia Alfa', cargo: 'Fiscal', pragas: '["Monilíase"]', acoes: '["Fiscalização","Educação Sanitária"]',
    plantasInspecionadas: 75, amostra: 'sim', sintomas: 'nao', hospedeiros: '["Cacau"]' },
  { id: 'm2', data: '2026-07-10', hora: '10:00', numero: 2, ano: 2026, municipio: 'AUTAZES', servidor: 'pessoa ficticia alfa', pragas: '["Monilíase"]', acoes: '["Fiscalização"]',
    plantasInspecionadas: '20', amostra: 'nao', sintomas: 'sim', hospedeiros: '["Cupuaçu"]', cadastroId: 'cad1' },
  { id: 'm3', data: '2026-07-09', numero: 3, ano: 2026, municipio: 'Autazes', servidor: 'Pessoa Ficticia Beta', pragas: '["Monilíase"]', acoes: '[]', cancelado: 1, plantasInspecionadas: 999 },
  { id: 'm4', data: '2026-07-09', numero: 4, ano: 2026, municipio: 'Autazes', servidor: 'Pessoa Ficticia Beta', pragas: '["Monilíase"]', acoes: '[]', excluido: 1, plantasInspecionadas: 999 },
  { id: 'm5', data: '2026-07-11', numero: 5, ano: 2026, municipio: 'Autazes', servidor: 'Pessoa Ficticia Beta', pragas: '["Monilíase"]', acoes: '[]', plantasInspecionadas: 5 },
  { id: 'm6', data: '2026-07-09', numero: 6, ano: 2026, municipio: 'Manaus', servidor: 'Pessoa Ficticia Alfa', pragas: '["Monilíase"]', acoes: '[]', plantasInspecionadas: 7 }
];
const cads = [{ id: 'cad1', data: '2026-07-01', numero: 1, dados: JSON.stringify({ plantas: { cupuacu: 3, cacau: 10, macambo: 0 } }) }, { id: 'cad-solto', data: '2026-07-01', numero: 2 }];
const R = calc(T2, cads, { de: '2026-07-08', ate: '2026-07-10', municipio: 'Autazes', programa: 'moniliase', folders: 72 });
ok(R.nTermos === 2 && R.termos.map(x => x.id).join() === 'm1,m2', 'período e município (sem diferença de maiúsculas); cancelado, excluído, fora do período e outro município ficam de fora', R.termos.map(x => x.id));
ok(R.plantas === 95 && R.textos.plantas === '95 plantas' && R.textos.termos === '02 termos.', 'plantas = 75 + 20 (texto ou número); "02 termos."', R.textos);
ok(R.textos.educacao === '1 ação(ões); distribuição orientada de 72 folders e flyers', 'educação sanitária: termos com a ação + folders digitados', R.textos.educacao);
ok(R.textos.coleta === 'Houve coleta de amostra (1 termo)' && R.textos.sintomas === 'Houve presença de sintomas (1 termo)', 'coleta e sintomas contados por Termo', [R.textos.coleta, R.textos.sintomas]);
ok(R.cadastros.length === 1 && R.cadastros[0].id === 'cad1', 'só o cadastro ligado aos Termos do relatório', R.cadastros.map(x => x.id));
ok(R.hospedeiros.join() === 'Cupuaçu,Cacau' && R.textos.hospedeiros === 'Cupuaçu ou cacau', 'culturas: as do cacau/cupuaçu na ordem do papel (Termo + plantas do cadastro), sem as zeradas', R.hospedeiros);
ok(R.servidores.length === 1 && R.servidores[0].funcao === 'Fiscal' && R.municipios.join() === 'Autazes,AUTAZES', 'servidor distinto sem diferença de maiúsculas; municípios como digitados', [R.servidores, R.municipios]);
const S = calc(T2, cads, { servidores: ['PESSOA FICTICIA BETA'] });
ok(S.termos.map(x => x.id).join() === 'm5', 'filtro por servidor (sem diferença de maiúsculas)', S.termos.map(x => x.id));
ok(calc(T2, [], { praga: 'Monilíase', de: '2026-07-09', ate: '2026-07-09' }).termos.map(x => x.id).join() === 'm6', 'relatório antigo por praga (f.praga) e dia único', null);
ok(calc(T2, [], { folders: -3.7, de: '2030-01-01' }).textos.educacao === 'não realizada' && calc([], [], {}).textos.numeros === '', 'folders negativo vira 0; sem Termos, sem números');
fim();
