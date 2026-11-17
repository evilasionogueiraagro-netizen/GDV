const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// PCE simplificado no servidor (Code.gs real no fakegas): Termo por programa da visita (chave única visitaId + programaVisita), visitas contáveis
// dos relatórios (levantamentos antigos + Termos do fluxo novo, sem data de corte), frutos da propriedade (mesclados, nunca somem) e sugestão de
// frutos dos levantamentos antigos. Dados fictícios.
const B = amb.API;
const post = b => fetch(B + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(B + p).then(r => r.json());
const fn = (nome, ...args) => get('/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args)));
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
const agora = Date.now(), ANO = new Date().getFullYear(), d = (m, dia) => `${ANO}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
const CPF = '52998224725';
const MON = 'Monilíase do Cacaueiro e Cupuaçuzeiro', MOS = 'Mosca-da-Carambola', CIT = 'Citros';

const LEV = (id, data, mun, praga, resultado, extra = {}) => ({ id, data, hora: '09:00', servidor: 'Pessoa Ficticia Alfa', doc: CPF, nome: 'Raimundo Ficticio', propriedade: 'Sitio Alfa',
  codigoPropriedade: 'PRP-1', municipio: mun, lat: '-3.1', lon: '-60.0', culturas: '[]', fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: agora, atualizadoEm: agora,
  pragas: JSON.stringify([{ praga, culturas: [{ cultura: 'Cacau', area: '2', espLinha: '4', espPlanta: '3', espUnidade: 'm', resultado, coleta: 'Não' }] }]), ...extra });
let seq = 0;
const cultura = (nome, pragas, extra = {}) => ({ cultura: nome, area: 1.5, pragas, coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '', fotos: [], ...extra });
const praga = (nome, resultado) => ({ praga: nome, resultado, haQuantoTempo: '', controle: '', qualControle: '' });
const TERMO = (visitaId, programaVisita, data, mun, culturas, extra = {}) => { seq++; return { id: 't' + seq, unidade: mun.toUpperCase(), ano: ANO, numero: seq, numeroSugerido: seq, numeroOrigem: 'sistema', conflito: 0,
  propriedadeId: 'P1', programa: 'moniliase', doc: CPF, nome: 'Raimundo Ficticio', municipio: mun, data, hora: '10:00', servidor: 'Pessoa Ficticia Alfa', pragas: '[]', acoes: '[]', tipoLocal: '["Sitio"]',
  testemunhas: '[]', cancelado: 0, excluido: 0, criadoEm: agora + seq, atualizadoEm: agora + seq, visitaId, programaVisita, culturas: JSON.stringify(culturas), ...extra }; };

(async () => {
  const A = (await U.fiscal('Pessoa Ficticia Alfa')).token, Bk = (await U.fiscal('Pessoa Ficticia Beta')).token, SEM = (await U.fiscal('Sem Modulo Teste', { permissoes: ['campo'] })).token;
  const ADM = (await amb.gerente('Gerente Visitas Teste')).token;
  await fetch(B + '/__fn?nome=desativarRotinasAutomaticas_');

  console.log('1) tabelas: sem CulturasAvaliadas e Resultados; TermosPCE com visitaId; Propriedades com frutos no fim');
  let r = await post({ action: 'sync', key: A, since: 0, propriedades: [{ id: 'P0', nome: 'Inicio', doc: CPF, criadoEm: agora, atualizadoEm: agora }], termosPce: [], culturasAvaliadas: [{ id: 'x|y', levantamentoId: 'x' }], resultados: [{ id: 'x|y|z' }] });
  ok(r.ok && !('culturasAvaliadas' in r) && !('resultados' in r), 'sync não devolve mais culturasAvaliadas nem resultados', Object.keys(r));
  const tudo = await get('/__tudo'), nomes = Object.keys(tudo.abas || tudo);
  ok(!nomes.includes('CulturasAvaliadas') && !nomes.includes('Resultados'), 'abas CulturasAvaliadas e Resultados não são criadas (o envio antigo delas é ignorado)', nomes);
  r = await post({ action: 'pceMapaGeral', key: A });
  ok(!r.ok && /Ação inválida/.test(r.erro), 'pceMapaGeral foi removida', r.erro);

  console.log('2) Termo por programa: chave única (visitaId, programaVisita)');
  const t1 = TERMO('v-x', MON, d(9, 1), 'Manaus', [cultura('Cacau', [praga('Monilíase do Cacaueiro', 'nao_detectada')])]);
  r = await post({ action: 'sync', key: A, since: 0, termosPce: [t1] });
  ok(r.ok && !(r.recusados.termosPce || []).length, 'Termo da visita gravado');
  const lt = async () => (await fn('lerLeitura_', 'TermosPCE')).r;
  let g = (await lt()).find(x => x.id === t1.id);
  ok(g.visitaId === 'v-x' && g.programaVisita === MON && g.amostra === 'nao' && g.sintomas === 'nao' && JSON.parse(g.culturas)[0].pragas[0].resultado === 'nao_detectada',
    'visitaId, programaVisita e culturas gravados; amostra e sintomas derivados (nao/nao)', g);
  const tOp = TERMO('v-op', 'Pragas da Bananeira', d(9, 1), 'Manaus', [cultura('Banana', [{ ...praga('Moko da Bananeira', 'detectada'), opcional: 1 }, praga('Sigatoka Negra', 'nao_detectada')])], { excluido: 1 });   // excluído: não entra nas contagens abaixo
  r = await post({ action: 'sync', key: A, since: 0, termosPce: [tOp] });
  const pgOp = JSON.parse((await lt()).find(x => x.id === tOp.id).culturas)[0].pragas;
  ok(r.ok && pgOp[0].opcional === 1 && !('opcional' in pgOp[1]), 'culturas guardam opcional = 1 só na praga de registro (o Termo impresso não mostra Suspeita nela)', pgOp);
  const dup = TERMO('v-x', MON, d(9, 1), 'Manaus', [cultura('Cacau', [praga('Monilíase do Cacaueiro', 'nao_detectada')])]);
  r = await post({ action: 'sync', key: Bk, since: 0, termosPce: [dup] });
  ok(r.ok && (r.recusados.termosPce || []).includes(dup.id) && !(await lt()).some(x => x.id === dup.id), 'segundo Termo do mesmo programa na mesma visita (outro id): recusado, não gravado');
  const outro = TERMO('v-x', MOS, d(9, 1), 'Manaus', [cultura('Carambola', [praga('Bactrocera carambolae', 'nao_detectada')])]);
  r = await post({ action: 'sync', key: A, since: 0, termosPce: [outro] });
  ok(r.ok && !(r.recusados.termosPce || []).length, 'outro programa da mesma visita: aceito');
  const t1b = { ...t1, atualizadoEm: agora + 99, constatacao: 'ajustada' };
  r = await post({ action: 'sync', key: A, since: 0, termosPce: [t1b] });
  ok(r.ok && !(r.recusados.termosPce || []).length, 'reenvio/edição do mesmo Termo (mesmo id): aceito');
  const canc = { ...t1, atualizadoEm: agora + 150, cancelado: 1, motivoCancel: 'erro' };
  await post({ action: 'sync', key: A, since: 0, termosPce: [canc] });
  r = await post({ action: 'sync', key: Bk, since: 0, termosPce: [dup] });
  ok(r.ok && !(r.recusados.termosPce || []).length, 'Termo cancelado libera a chave: o programa pode ser refeito na visita');
  const sem = { ...TERMO('', MON, d(9, 2), 'Manaus', []), programaVisita: 'lixo', culturas: '[{"cultura":"Cacau"}]' };
  await post({ action: 'sync', key: A, since: 0, termosPce: [sem] });
  g = (await lt()).find(x => x.id === sem.id);
  ok(g && g.visitaId === '' && g.programaVisita === '' && g.culturas === '', 'Termo sem visitaId segue como Termo antigo (programa e culturas da visita limpos)', g);
  const enorme = TERMO('v-grande', CIT, d(9, 3), 'Manaus', [cultura('Laranja', [praga('HLB', 'detectada')], { fotos: Array.from({ length: 200 }, (_, i) => 'f' + i) })]);
  r = await post({ action: 'sync', key: A, since: 0, termosPce: [enorme] });
  g = (await lt()).find(x => x.id === enorme.id);
  ok(g && JSON.parse(g.culturas)[0].fotos.length === 20, 'lista de fotos da cultura limitada a 20 (JSON sempre válido)');
  r = await post({ action: 'pceDocRegistrar', key: A, tipo: 'termo', registro: TERMO('v-x', MOS, d(9, 1), 'Manaus', [cultura('Carambola', [])], { unidade: 'MANAUS', numero: 77, numeroSugerido: 77 }) });
  ok(r.ok && r.emitido === false && r.termoDaVisita && r.termoDaVisita.programaVisita === MOS, 'pceDocRegistrar também respeita o Termo único por programa da visita', r);

  console.log('3) visitas contáveis (sem data de corte)');
  const reg = [
    LEV('L1', d(9, 3), 'Manaus', 'Monilíase do Cacaueiro', 'detectada'),
    LEV('L2', d(9, 4), 'Manaus', 'Monilíase do Cacaueiro', 'detectada', { excluido: 1 }),
    LEV('L3', d(1, 10), 'Parintins', 'Monilíase do Cacaueiro', 'nao_detectada'),       // levantamento bem antigo: conta (sem corte)
  ];
  const termos = [
    TERMO('v-neg', CIT, d(9, 8), 'Autazes', [cultura('Laranja', [praga('HLB', 'nao_detectada'), praga('Cancro Cítrico', 'nao_detectada')])]),       // visita nova negativa
    TERMO('v-det', CIT, d(9, 12), 'Manacapuru', [cultura('Limão', [praga('HLB', 'detectada')], { coleta: 'Sim' })]),
    TERMO('v-vazia', CIT, d(9, 13), 'Manacapuru', [cultura('Banana', [])]),                                                                 // cultura sem praga respondida: negativa, a área entra
    TERMO('v-canc', CIT, d(9, 14), 'Coari', [cultura('Laranja', [praga('HLB', 'detectada')])], { cancelado: 1, motivoCancel: 'erro' }),
    TERMO('v-excl', CIT, d(9, 15), 'Coari', [cultura('Laranja', [praga('HLB', 'detectada')])], { excluido: 1 }),
    TERMO('v-sem-cult', CIT, d(9, 16), 'Coari', []),                                                                                         // sem culturas: não é visita
    TERMO('', MON, d(9, 17), 'Tabatinga', [], { programa: 'moniliase', pragas: JSON.stringify(['Monilíase']) }),                             // Termo antigo (sem visitaId): não conta
  ];
  r = await post({ action: 'sync', key: A, since: 0, levantamentos: reg, termosPce: termos,
    propriedades: [{ id: 'P1', codigo: 'PRP-1', nome: 'Sitio Alfa', doc: CPF, municipio: 'Manaus', criadoEm: agora, atualizadoEm: agora }] });
  ok(r.ok, 'dados sincronizados (levantamentos antigos e Termos novos e antigos)', r.erro || r.recusados);
  const V = (await fn('visitasPce_')).r, ids = V.map(v => v.id).sort();
  ok(JSON.stringify(ids) === JSON.stringify(['L1', 'L3', 'v-det', 'v-grande', 'v-neg', 'v-vazia', 'v-x']), 'conta: levantamentos antigos (inclusive o de janeiro) e visitas novas; fora: excluído, Termo antigo sem visitaId, cancelado, excluído e sem culturas', ids);
  const vx = V.find(v => v.id === 'v-x');
  ok(vx.origem === 'termo' && vx.partes.length === 2 && vx.termos.length === 2, 'dois Termos da mesma visita: uma visita com duas partes (Termo por programa)', [vx.partes.length, vx.programas]);
  const neg = V.find(v => v.id === 'v-neg'), vaz = V.find(v => v.id === 'v-vazia');
  ok(neg.propriedade === '' || neg.propriedade === 'Sitio Alfa', 'visita nova lê a propriedade pelo cadastro');
  ok(JSON.parse(neg.pragas).every(gp => gp.culturas.every(c => c.resultado === 'nao_detectada')) && JSON.parse(vaz.pragas)[0].praga === '' && JSON.parse(vaz.pragas)[0].culturas[0].area === 1.5,
    'visita nova negativa é negativa (nenhuma detecção); cultura sem praga respondida entra como negativa com a área');

  const P = await post({ action: 'painelDados', key: ADM, de: d(1, 1), ate: d(12, 31) });
  const levs = P.levantamentos || [];
  ok(P.ok && levs.length === 7 && levs.filter(l => l.origem === 'termo').length === 5 && levs.filter(l => l.origem === 'levantamento').length === 2, 'painel: 7 visitas (2 levantamentos antigos + 5 pelos Termos)', P.erro || levs.map(l => l.id));
  const lv = id => levs.find(l => l.id === id);
  ok(lv('L1').pragas.length === 1 && lv('v-det').pragas.join() === 'HLB' && lv('v-neg').pragas.length === 0 && lv('v-vazia').pragas.length === 0 && lv('v-x').pragas.length === 0,
    'painel: pragas detectadas/suspeitas por visita (HLB só na v-det; as negativas sem praga)', levs.map(l => [l.id, l.pragas]));
  const col = { id: 'k1', unidade: 'MANACAPURU', ano: ANO, numero: 1, numeroTxt: '001/' + ANO + '/MANACAPURU', numeroOrigem: 'sistema', levantamentoId: 'v-det', data: d(9, 12), hora: '10:30', servidor: 'Pessoa Ficticia Alfa',
    municipio: 'Manacapuru', doc: CPF, nome: 'Raimundo Ficticio', cultura: 'Limão', quantidade: 1, analise: 'fitopatológica', cancelado: 0, excluido: 0, criadoEm: agora, atualizadoEm: agora };
  await post({ action: 'sync', key: A, since: 0, colheitas: [col] });
  const P3 = await post({ action: 'painelDados', key: ADM, de: d(1, 1), ate: d(12, 31) });
  ok((P3.colheitas || []).find(c => c.id === 'k1').pragaTermo === 'HLB', 'Termo de Colheita com levantamentoId = visitaId acha a praga da amostra na visita nova (HLB)', (P3.colheitas || []).map(c => c.pragaTermo));
  const ag = (await fn('agregarRelatorio_', { turnos: [], tfs: [], colheitas: [], levantamentos: levs }, d(1, 1), d(12, 31), Date.now())).r;
  ok(ag.pce.levantamentos === 7 && ag.pce.comPraga === 3 && ag.pce.negativos === 4 && ag.pce.pragas.length === 2 && ag.pce.municipios === 4,
    'relatório de rotina: 7 visitas, 3 com praga, 4 negativas; 2 pragas e 4 municípios', ag.pce);

  const GRUPOS = [{ id: 'moniliase', colunas: [{ rotulo: 'Monilíase', pragas: ['Monilíase'] }] }, { id: 'carambola', colunas: [{ rotulo: 'Mosca', pragas: ['Bactrocera'] }] },
    { id: 'citros', colunas: [{ rotulo: 'HLB', pragas: ['HLB'] }, { rotulo: 'Cancro', pragas: ['Cancro'] }] }];
  const AP = await post({ action: 'painelRelGdvApuracao', key: ADM, de: d(1, 1), ate: d(12, 31), grupos: GRUPOS });
  const Gp = Object.fromEntries((AP.grupos || []).map(x => [x.id, x]));
  ok(AP.ok && AP.quadro.total.inspecoes === 7 && AP.resumo.levantamentos === 7, 'Relatório GDV: total de visitas = 7 (dois Termos da visita contam uma vez)', AP.erro || [AP.quadro && AP.quadro.total.inspecoes]);
  ok(Gp.moniliase.levantamentos === 3 && Gp.carambola.levantamentos === 1 && Gp.citros.levantamentos === 3,
    'Relatório GDV por programa conta Termos: monilíase 3 (2 levantamentos + 1 Termo da visita v-x), carambola 1 (outro Termo de v-x), citros 3 (v-neg, v-det, v-grande; a v-vazia não tem praga de grupo)', [Gp.moniliase.levantamentos, Gp.carambola.levantamentos, Gp.citros.levantamentos]);
  ok(AP.resumo.deteccoes === 3 && AP.quadro.total.porCol['2:0'] === 3, 'Relatório GDV: 3 detecções (monilíase do L1, HLB da v-det e da v-grande); HLB avaliado em 3 visitas', [AP.resumo.deteccoes, AP.quadro.total.porCol]);

  const CV = await post({ action: 'painelConvApuracao', key: ADM, convenio: '991272-2025', de: d(1, 1), ate: d(12, 31) });
  const a14 = CV.etapas && CV.etapas['1.4'];
  const reg14 = a14 ? Object.fromEntries(a14.porMunicipio.map(x => [x.municipio, x.registros])) : {};
  ok(a14 && reg14.Tabatinga === 1 && reg14.Parintins === 1 && reg14.Manaus === 5,
    'Convênio 1.4 soma levantamentos e TODOS os Termos de monilíase, inclusive o Termo antigo sem visitaId (Tabatinga) e o levantamento de janeiro (Parintins): número já apurado não muda', reg14);
  ok(a14 && reg14.Manaus === 5 && reg14.Coari === 1 && reg14.Autazes === 1 && reg14.Manacapuru === 2,
    'Convênio 1.4: Manaus 5 (o levantamento L1 e 4 Termos ativos; o cancelado v-x fica de fora), Coari só o Termo ativo (cancelado e excluído não contam), Autazes 1, Manacapuru 2', reg14);

  await post({ action: 'painelPublicoSalvar', key: ADM, config: { ativo: true, blocos: { levantamentos: true, deteccoes: true, municipios: true } } });
  const PUB = await post({ action: 'publicoDados', periodo: 'ano', previa: true, key: ADM });
  const N = PUB.numeros || (PUB.dados && PUB.dados.numeros) || {};
  ok(PUB.ok && N.levantamentos === 7 && N.deteccoes === 3 && N.levNegativos === 4, 'dashboard público: 7 visitas, 3 detecções, 4 negativas', PUB.erro || N);
  ok(!JSON.stringify(PUB).includes(CPF) && !JSON.stringify(PUB).includes('Ficticio'), 'dashboard público sem CPF nem nome');

  console.log('4) frutos da propriedade');
  const F = (id, cultura, extra = {}) => ({ id, cultura, cultivar: 'Comum', area: '2,5', espLinha: 4, espPlanta: 3, espUnidade: 'm', idade: 5, quantidade: 800, producao: '12', destino: 'Feira', ...extra });
  const P2 = (frutos, atualizadoEm, extra = {}) => ({ id: 'P2', codigo: 'PRP-2', nome: 'Sitio Beta', doc: CPF, municipio: 'Manaus', criadoEm: agora, atualizadoEm, frutos, ...extra });
  const prop = async () => (await fn('lerTodasColunas_', 'Propriedades')).r.find(p => p.id === 'P2');
  const fr = async () => JSON.parse((await prop()).frutos || '[]');
  r = await post({ action: 'sync', key: SEM, since: 0, propriedades: [P2([F('f1', 'Laranja')], agora)] });
  ok(r.ok && (r.recusados.propriedades || []).includes('P2') && !(await prop()), 'sem o módulo PCE: propriedade com frutos recusada e não gravada', r.recusados);
  r = await post({ action: 'sync', key: A, since: 0, propriedades: [P2([F('f1', 'Laranja'), F('f2', 'Limão', { area: -3, espUnidade: 'km' })], agora + 10)] });
  let f = await fr();
  ok(r.ok && f.length === 2 && f[0].area === 2.5 && f[0].quantidade === 800 && f[1].area === '' && f[1].espUnidade === '' && f.every(x => x.em > 0 && x.por === 'Pessoa Ficticia Alfa'),
    'propriedade com frutos salva pelo sync: números normalizados e quem/quando carimbados pelo servidor', f);
  ok(r.propriedadesGravadas.length === 1 && !('usuario' in r.propriedadesGravadas[0]) && !r.propriedadesGravadas[0].frutos.includes('Pessoa Ficticia Alfa') && JSON.parse(r.propriedadesGravadas[0].frutos).length === 2,
    'resposta traz a propriedade mesclada (sem o login nos frutos)', r.propriedadesGravadas);
  r = await post({ action: 'sync', key: Bk, since: 0, propriedades: [P2([F('f3', 'Banana')], agora + 5, { municipio: 'Parintins' })] });
  f = await fr();
  ok(f.map(x => x.id).join() === 'f1,f2,f3' && (await prop()).municipio === 'Manaus', 'aparelho desatualizado (atualizadoEm menor): o fruto novo entra, os existentes ficam e o resto da propriedade não muda', f.map(x => x.id));
  ok(f.find(x => x.id === 'f3').por === 'Pessoa Ficticia Beta', 'o fruto leva o nome de quem o incluiu');
  r = await post({ action: 'sync', key: Bk, since: 0, propriedades: [P2([F('f1', 'Laranja', { area: '9' })], agora + 6)] });
  ok((await fr()).find(x => x.id === 'f1').area === 2.5, 'reenvio desatualizado não altera fruto existente');
  r = await post({ action: 'sync', key: Bk, since: 0, propriedades: [P2([F('f1', 'Laranja', { area: '9' })], agora + 20)] });
  f = await fr();
  ok(f.find(x => x.id === 'f1').area === 9 && f.find(x => x.id === 'f1').por === 'Pessoa Ficticia Beta' && f.length === 3, 'reenvio mais novo altera o fruto (quem alterou) e não apaga os demais (f2, f3 continuam)');
  r = await post({ action: 'sync', key: A, since: 0, propriedades: [P2([F('f2', 'Limão', { excluido: 1 })], agora + 30)] });
  f = await fr();
  ok(f.find(x => x.id === 'f2').excluido === 1 && f.length === 3, 'remover fruto = excluido 1 (o fruto continua na planilha)');
  r = await post({ action: 'sync', key: A, since: 0, propriedades: [{ ...P2(null, agora + 40), frutos: undefined }] });
  ok((await fr()).length === 3, 'propriedade enviada sem o campo frutos mantém os frutos');
  r = await post({ action: 'sync', key: A, since: 0, propriedades: [P2(JSON.stringify(Array.from({ length: 70 }, (_, i) => F('m' + i, 'Cultura ' + i))), agora + 50)] });
  ok((await fr()).length === 60, 'no máximo 60 frutos por propriedade');
  const dl = await post({ action: 'pceBaixarMunicipio', key: A, municipios: ['Manaus'] });
  const pDl = dl.propriedades.find(p => p.id === 'P2');
  ok(dl.ok && !pDl.frutos.includes('Pessoa Ficticia Alfa') && JSON.parse(pDl.frutos).length === 60 && pDl.frutosSugeridos.length === 0, 'baixar dados: frutos sem o login e sem sugestão (a propriedade já tem frutos)');

  console.log('5) sugestão de frutos dos levantamentos antigos (só leitura, só insere)');
  const dl1 = dl.propriedades.find(p => p.id === 'P1');
  const sug = dl1.frutosSugeridos;
  ok(dl1.frutos === '' && sug.length === 1 && sug[0].id === 'sug-cacau' && sug[0].cultura === 'Cacau' && sug[0].area === 2 && sug[0].espLinha === 4 && sug[0].espPlanta === 3 && sug[0].sugerido === 1,
    'propriedade sem frutos: sugestão de Cacau derivada do levantamento antigo (área e espaçamento); o Termo novo não entra', sug);
  ok((await fn('lerLeitura_', 'Propriedades')).r.find(p => p.id === 'P1').frutos === '', 'a sugestão não grava nada na planilha');
  const co = await post({ action: 'pceConsultar', key: A, doc: CPF });
  ok(co.ok && co.propriedades.find(p => p.id === 'P1').frutosSugeridos.length === 1 && co.levantamentos === 7, 'pceConsultar também traz a sugestão; conta as visitas contáveis do produtor (7)', co.levantamentos);
  r = await post({ action: 'sync', key: A, since: 0, propriedades: [{ id: 'P1', codigo: 'PRP-1', nome: 'Sitio Alfa', doc: CPF, municipio: 'Manaus', criadoEm: agora, atualizadoEm: agora + 60, frutos: [{ ...sug[0], area: 3 }] }] });
  const sal = JSON.parse((await fn('lerLeitura_', 'Propriedades')).r.find(p => p.id === 'P1').frutos);
  ok(sal.length === 1 && sal[0].id === 'sug-cacau' && sal[0].area === 3, 'o fiscal salvou a sugestão (lista em vez de texto também vale): vira fruto do cadastro');
  const dl2 = await post({ action: 'pceBaixarMunicipio', key: A, municipios: ['Manaus'] });
  ok(dl2.propriedades.find(p => p.id === 'P1').frutosSugeridos.length === 0, 'depois de salva, a sugestão some; nada é sobrescrito por ela');

  console.log('6) levantamento enviado por aparelho com pendência continua aceito');
  r = await post({ action: 'sync', key: A, since: 0, levantamentos: [LEV('L9', d(10, 1), 'Manaus', 'Monilíase do Cacaueiro', 'nao_detectada')] });
  ok(r.ok && !(r.recusados.levantamentos || []).length && (await fn('lerLeitura_', 'Levantamentos')).r.some(l => l.id === 'L9'), 'Levantamentos continua gravando');
  ok((await fn('visitasPce_')).r.some(v => v.id === 'L9'), 'e conta como visita');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
