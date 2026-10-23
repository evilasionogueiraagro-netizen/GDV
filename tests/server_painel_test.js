const amb = require('./lib/amb');
// Testes do backend do painel (painelDados, painelSair e o resto do painel, painel.gs e Code.gs reais via fakegas na porta 8082).
// O painel entra com matrícula e senha (usuarios.gs): entrar, limite de tentativas, sair, permissões e revogação ficam em
// usuarios_server_test.js. Aqui: a leitura com token de gerente (amb.gerente), os dados semeados por sync com o token de carga
// (amb.carga), a recusa de quem não tem a permissão painel, de token inválido e da ACCESS_KEY (que já não vale), e painelSair.
// Todos os dados são fictícios.
const B = amb.API;
const post = b => fetch(B + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(B + p).then(r => r.json());
const fn = (nome, ...args) => get('/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args)));
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const manaus = (d = 0) => new Date(Date.now() - 4 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const HOJE = manaus();
const SESSAO_PAINEL_INVALIDA = /Sessão do painel inválida ou revogada/;

(async () => {
  const agora = Date.now();
  const T = (id, data, extra = {}) => ({ id, numeroTF: 'TF-' + id, data, letra: 'A', inicio: '06:00', fim: '14:00', fiscal: 'João Silva e Maria Souza', local: 'Barreira Porto CEASA',
    unidade: 'MANAUS', posto: 'Fixa', encerrado: 1, criadoEm: agora, atualizadoEm: agora, latIni: '-3.119028', lngIni: '-60.021731', precIni: '12', latFim: '-3.119100', lngFim: '-60.021800', precFim: '9', ...extra });
  const V = (id, t, hora, placa, tipo, p, exc = 0) => ({ id, turnoId: t, hora, placa, tipo, pessoas: p, obs: 'observação privada', excluido: exc, criadoEm: agora, atualizadoEm: agora });
  const CPF = '12345678901', CNPJ = '12345678000199';
  const TF = (id, data, extra = {}) => ({ id, barreira: 'BVA-CEASA', ano: Number(data.slice(0, 4)), numero: 1, numeroTxt: '', turnoId: 's1', veiculoId: 'v1', data, hora: '08:15', fiscal: 'João Silva',
    local: 'Barreira Porto CEASA', placa: 'AAA1A11', origem: 'Manacapuru', destino: 'Manaus', doc: CPF, nome: 'Fulano de Tal', rg: 'RG-9988776', endereco: 'Rua Secreta, 123',
    municipio: 'Manaus', uf: 'AM', telefone: '92 99999-1234', relacao: 'Motorista', inspecao: 1, coleta: 0, amostras: 0, procedimento: 'apreensao', fiel: 0, auto: 1, advertencia: 0,
    documentos: JSON.stringify({ nf: '123456', ptv: '', gta: 'GTA-55' }), produtos: JSON.stringify(['CARAMBOLA - 1.500,5 Kg', 'ACEROLA - 3 Caixas']), constatacao: 'texto da constatação',
    enquadramento: 'Art. 1º', reincidente: 1, tfsAnteriores: 2, cancelado: 0, motivoCancel: '', criadoEm: agora, atualizadoEm: agora, ...extra });
  const cult = (c, praga, coleta = 'Não', area = '1,5') => ({ cultura: c, area, espLinha: '3', espPlanta: '2', praga, coleta, tipoMaterial: coleta === 'Sim' ? 'Folha' : '', codigoAmostra: coleta === 'Sim' ? 'AM-1' : '', destinoAmostra: '' });
  const LEV = (id, data, extra = {}) => ({ id, data, hora: '09:00', servidor: 'Ana Pereira', cargo: 'Fiscal Agropecuário', matricula: 'MAT-777', lotacao: 'IDAM Tabatinga', doc: CNPJ, nome: 'Sítio Bom Jesus Ltda',
    telefone: '97 98888-0000', email: 'produtor@exemplo.com', propriedade: 'Sítio Bom Jesus', codigoPropriedade: 'P-001', situacaoFundiaria: 'Própria', municipio: 'Tabatinga',
    lat: '-4,2347', lon: '-69.9386', precisao: '8', culturas: JSON.stringify([cult('Banana', 'Moko da bananeira', 'Sim'), cult('Mandioca', '')]), fotos: JSON.stringify(['foto-id-1', 'foto-id-2']),
    assinaturas: JSON.stringify({ servidor: 'ass-id-1', produtor: 'ass-id-2' }), obs: 'obs privada', excluido: 0, criadoEm: agora, atualizadoEm: agora, ...extra });
  const COL = (id, data, extra = {}) => ({ id, unidade: 'IDAM TABATINGA', ano: Number(data.slice(0, 4)), numero: 1, numeroTxt: '', levantamentoId: 'l1', data, hora: '10:00', servidor: 'Ana Pereira',
    cargo: 'Fiscal', matricula: 'MAT-777', lotacao: 'IDAM Tabatinga', municipio: 'Tabatinga', doc: CPF, nome: 'Beltrano', endereco: 'Estrada X km 2', lat: '-4.2347', lon: '-69.9386', precisao: '5',
    cultura: 'Banana', quantidade: '3 kg', analise: 'Fitopatológica', partes: 'Folhas', descricao: 'descrição', fotos: JSON.stringify(['foto-c1']), testemunha1Nome: 'Testemunha Um',
    testemunha1Doc: '99988877766', testemunha2Nome: '', testemunha2Doc: '', assinaturas: JSON.stringify({ servidor: 'ass-c1' }), local: 'Sítio', cancelado: 0, motivoCancel: '', excluido: 0,
    criadoEm: agora, atualizadoEm: agora, ...extra });

  // dados semeados pelo sync com o token de carga (gerente); o painel lê com o token de gerente deste teste
  const CARGA = await amb.carga();
  const r = await post({ action: 'sync', key: CARGA, since: 0,
    turnos: [T('s1', manaus(-3)), T('s2', manaus(-40)), T('s3', manaus(-60), { encerrado: 0, fim: '' }), T('s4', HOJE, { encerrado: 0, fim: '', latIni: '-4.2347', lngIni: '-69.9386', latFim: '', lngFim: '' }),
      T('s5', manaus(-2), { inicio: '22:00', fim: '02:00', latIni: '', lngIni: '', latFim: '', lngFim: '' })],
    veiculos: [V('v1', 's1', '08:10', 'AAA1A11', 'PA', 4), V('v2', 's1', '08:30', 'BBB2B22', 'ON', 40), V('v3', 's1', '09:00', 'CCC3C33', 'MT', 2, 1), V('v4', 's2', '10:00', 'AAA1A11', 'PA', 4),
      V('v5', 's4', '05:00', 'DDD4D44', 'CC', 1), V('v6', 's3', '07:00', 'EEE5E55', 'UT', 3)],
    tfs: [TF('tf1', manaus(-3)), TF('tf2', manaus(-3), { numero: 3, procedimento: 'liberacao', doc: CNPJ, reincidente: 0, cancelado: 1, motivoCancel: 'erro de digitação' }), TF('tf3', manaus(-40), { numero: 2 })],
    levantamentos: [LEV('l1', manaus(-5)), LEV('l2', manaus(-5), { excluido: 1, nome: 'EXCLUIDO' }), LEV('l3', manaus(-100), { municipio: 'Parintins', culturas: JSON.stringify([cult('Cacau', 'Vassoura-de-bruxa')]) }),
      LEV('l4', manaus(-400), { municipio: 'Coari' }), LEV('l5', manaus(-1), { lat: '', lon: '', municipio: 'Manaus', culturas: JSON.stringify([cult('Açaí', '')]), doc: 'abc' })],
    colheitas: [COL('c1', manaus(-5)), COL('c2', manaus(-4), { numero: 2, cancelado: 1, motivoCancel: 'duplicado' }), COL('c3', manaus(-4), { excluido: 1 })] });
  ok(r.ok, 'sync de preparação (token de carga)', r.erro);
  // s3 (aberto há 60 dias) testa "abertos de qualquer data": sem o encerramento automático de 12 h (testado no rotinas_test.js)
  ok((await (await fetch(amb.API + '/__fn?nome=desativarRotinasAutomaticas_')).json()).r === 0, 'rotinas automáticas desativadas');
  const TOK = (await amb.gerente('Gerente Painel Teste')).token;   // gerência: lê e grava o painel

  // ---------- mesma BVA com nomes diferentes ----------
  console.log('Apelidos de BVA');
  const canon = {};
  for (const n of ['BVA Porto da Ceasa', 'Barreira Porto CEASA', 'Barreira Porto da CEASA', 'BVA - CEASA', 'bva-ceasa', 'BVA - JUNDIÁ', 'Barreira Estrada Porto da Ceasa', '']) canon[n] = (await fn('localCanon_', n)).r;
  ok(canon['BVA Porto da Ceasa'] === 'BVA - CEASA' && canon['Barreira Porto CEASA'] === 'BVA - CEASA' && canon['Barreira Porto da CEASA'] === 'BVA - CEASA' && canon['BVA - CEASA'] === 'BVA - CEASA' && canon['bva-ceasa'] === 'BVA - CEASA',
    'BVA Porto da Ceasa / Barreira Porto (da) CEASA → BVA - CEASA', canon);
  const vig = (await fn('vigApurar_', { ancora: '2025-01-05', ciclo: 9, postos: [{ id: 'p-ceasa', nome: 'MANAUS - CEASA', municipio: 'Manaus', tipo: 'fixa', locais: ['Barreira Porto da CEASA'] }] }, manaus(-10), HOJE)).r || {};
  const vigTurnos = k => Object.values((vig.porMes || {})[k] || {}).reduce((t, x) => t + x.turnos, 0);
  ok(vigTurnos('p-ceasa') > 0 && !vigTurnos('_outras-fixas'), 'VIGIFITO: posto configurado com "Barreira Porto da CEASA" continua pegando os turnos (agora BVA - CEASA)', { posto: vigTurnos('p-ceasa'), outras: vigTurnos('_outras-fixas') });
  ok(canon['BVA - JUNDIÁ'] === 'BVA - JUNDIÁ' && canon['Barreira Estrada Porto da Ceasa'] === 'Barreira Estrada Porto da Ceasa' && canon[''] === '', 'outros locais ficam como estão', canon);

  // ---------- doGet ----------
  console.log('doGet');
  const dg = await get('/__doget?p=painel'); ok(/"ok":true/.test(dg.json || '') && /"versao"/.test(dg.json || ''), 'doGet com ?p=painel (rota antiga, removida) responde só o JSON da versão, sem página HTML', dg);
  const dg2 = await get('/__doget?p='); ok(/"ok":true/.test(dg2.json || ''), 'doGet sem parâmetro responde JSON');

  // ---------- painelDados: credenciais ----------
  console.log('painelDados: credenciais');
  let d = await post({ action: 'painelDados', key: '' }); ok(!d.ok && /Entre com sua matrícula e senha/.test(d.erro), 'sem token: pede matrícula e senha', d.erro);
  for (const tk of ['qualquer-coisa', 'tok-antigo', 'u.' + '0'.repeat(64)]) { d = await post({ action: 'painelDados', key: tk }); ok(!d.ok && SESSAO_PAINEL_INVALIDA.test(d.erro), `token "${tk}" recusado`, d.erro); }
  d = await post({ action: 'painelDados', key: 'segredo' }); ok(!d.ok && SESSAO_PAINEL_INVALIDA.test(d.erro), 'ACCESS_KEY (chave antiga) não lê mais o painel', d.erro);
  d = await post({ action: 'painelAtivar', key: TOK, codigo: '123456' }); ok(!d.ok && /Ação inválida/.test(d.erro), 'painelAtivar (código de ativação) saiu do back: ação inválida', d.erro);
  const FIS = await amb.usuario('Fiscal Sem Painel Teste', { permissoes: ['campo'], aplicativo: 'campo' });
  d = await post({ action: 'painelDados', key: FIS.token }); ok(!d.ok && /Seu acesso não inclui o painel/.test(d.erro), 'conta só de campo: token recusado no painel', d.erro);
  d = await post({ action: 'painelDados', key: TOK }); ok(d.ok && d.admin === 'Gerente Painel Teste', 'token de gerente lê o painel (admin = nome de quem entrou)', d.admin);
  d = await post({ action: 'sync', key: TOK, since: 0 }); ok(d.ok, 'token de gerente também sincroniza no app (sync)');

  // ---------- período ----------
  console.log('painelDados: período');
  d = await post({ action: 'painelDados', key: TOK });
  ok(d.ok && d.periodo.dias === 30 && d.periodo.ate === HOJE && d.periodo.de === manaus(-29), 'sem datas: últimos 30 dias até hoje (Manaus)', d.periodo);
  const D30 = d;
  d = await post({ action: 'painelDados', key: TOK, de: manaus(-9) }); ok(d.ok && d.periodo.ate === HOJE && d.periodo.dias === 10, 'só "de": até hoje', d.periodo);
  d = await post({ action: 'painelDados', key: TOK, ate: '2026-03-31' }); ok(d.ok && d.periodo.de === '2026-03-02' && d.periodo.dias === 30, 'só "ate": 30 dias terminando em ate', d.periodo);
  for (const [de, ate, re, msg] of [['2026-13-01', '2026-12-31', /formato aaaa-mm-dd/, 'mês inválido'], ['2026-02-30', '2026-03-10', /formato aaaa-mm-dd/, 'data impossível 30/02'],
    ['01/09/2026', '2026-10-01', /formato/, 'formato dd/mm/aaaa'], ['2026-10-05', '2026-10-01', /posterior/, 'início depois do fim'], ['2025-01-01', '2026-01-02', /longo demais/, '367 dias']]) {
    d = await post({ action: 'painelDados', key: TOK, de, ate }); ok(!d.ok && re.test(d.erro), 'período recusado: ' + msg, d.erro);
  }
  d = await post({ action: 'painelDados', key: TOK, de: '2025-01-01', ate: '2026-01-01' }); ok(d.ok && d.periodo.dias === 366, '366 dias aceitos');

  // ---------- turnos e veículos ----------
  console.log('painelDados: turnos e veículos');
  let ids = D30.turnos.map(t => t.id).filter(i => i !== 'antigo-1').sort();   // antigo-1: linha pré-existente do fakegas
  ok(JSON.stringify(ids) === JSON.stringify(['s1', 's3', 's4', 's5']), '30 dias: turnos do período + abertos de qualquer data (s3 aberto há 60 dias)', ids);
  d = await post({ action: 'painelDados', key: TOK, de: '2025-01-01', ate: '2025-01-31' });
  ids = d.turnos.map(t => t.id).sort(); ok(JSON.stringify(ids) === JSON.stringify(['s3', 's4']), 'período antigo: só os turnos em andamento vêm', ids);
  ok(d.veiculos.map(v => v.id).sort().join() === 'v5,v6', 'veículos dos turnos em andamento vêm junto', d.veiculos.map(v => v.id));
  const s1 = D30.turnos.find(t => t.id === 's1'), s4 = D30.turnos.find(t => t.id === 's4'), s5 = D30.turnos.find(t => t.id === 's5');
  ok(s1.nVeiculos === 2 && s1.nPessoas === 44, 'veículo excluído não conta (nVeiculos/nPessoas)', [s1.nVeiculos, s1.nPessoas]);
  ok(!D30.veiculos.some(v => v.id === 'v3') && !D30.veiculos.some(v => v.id === 'v4'), 'veículo excluído e de turno fora do período não vêm');
  ok(!D30.veiculos.some(v => 'obs' in v), 'veículos sem observação');
  ok(s1.latIni === -3.119028 && s1.lngIni === -60.021731 && typeof s1.latFim === 'number', 'coordenadas numéricas', [s1.latIni, s1.lngIni]);
  ok(s5.latIni === null && s4.latFim === null, 'coordenada vazia → null');
  ok(s1.encerrado === 1 && !s1.emAndamento && s4.encerrado === 0 && s4.emAndamento, 'encerrado/emAndamento');
  ok(s1.inicioTs === Date.parse(manaus(-3) + 'T06:00:00-04:00') && s1.fimTs - s1.inicioTs === 8 * 3600e3, 'inicioTs/fimTs no horário de Manaus');
  ok(s5.fimTs - s5.inicioTs === 4 * 3600e3, 'turno que passa da meia-noite: fim no dia seguinte');
  ok(s4.ultimoVeiculoHora === '05:00' && s4.ultimoSinal >= agora - 60e3, 'último veículo e último sinal', [s4.ultimoVeiculoHora, s4.ultimoSinal]);

  // ---------- TFs ----------
  console.log('painelDados: TFs');
  ok(D30.tfs.map(t => t.id).sort().join() === 'tf1,tf2', 'TFs do período (cancelado incluído com a marca)', D30.tfs.map(t => t.id));
  const tf1 = D30.tfs.find(t => t.id === 'tf1'), tf2 = D30.tfs.find(t => t.id === 'tf2');
  ok(tf1.doc === '***.456.789-**' && tf1.tipoDoc === 'CPF', 'CPF mascarado', tf1.doc);
  ok(tf2.doc === '**.345.678/0001-**' && tf2.tipoDoc === 'CNPJ' && tf2.cancelado === 1 && tf2.motivoCancel === 'erro de digitação', 'CNPJ mascarado e cancelado com motivo', tf2.doc);
  ok(JSON.stringify(tf1.documentos) === '["nf","gta"]', 'documentos: só os tipos preenchidos, sem números', tf1.documentos);
  ok(tf1.produtos.length === 2 && tf1.produtos[0].produto === 'CARAMBOLA' && tf1.produtos[0].quantidade === 1500.5 && tf1.produtos[0].unidade === 'Kg' && tf1.produtos[1].quantidade === 3,
    'produtos interpretados (1.500,5 Kg → 1500.5)', tf1.produtos[0]);
  for (const k of ['rg', 'endereco', 'telefone', 'constatacao', 'enquadramento']) ok(!(k in tf1), `TF sem "${k}"`);

  // ---------- levantamentos / historicoPce ----------
  console.log('painelDados: PCE');
  ok(D30.levantamentos.map(l => l.id).sort().join() === 'l1,l5', 'levantamentos do período, sem o excluído', D30.levantamentos.map(l => l.id));
  const l1 = D30.levantamentos.find(l => l.id === 'l1'), l5 = D30.levantamentos.find(l => l.id === 'l5');
  ok(l1.doc === '**.345.678/0001-**' && l5.doc === '***', 'documento do produtor mascarado (CNPJ e valor estranho)', [l1.doc, l5.doc]);
  ok(l1.lat === -4.2347 && l1.lon === -69.9386 && l5.lat === null, 'lat com vírgula decimal aceita; vazia → null', [l1.lat, l1.lon]);
  ok(l1.culturas.length === 2 && l1.culturas[0].area === 1.5 && l1.culturas[0].coleta === 'Sim' && JSON.stringify(l1.pragas) === '["Moko da bananeira"]', 'culturas e pragas', l1.pragas);
  ok(l1.nFotos === 2 && l1.nAssinaturas === 2, 'fotos/assinaturas só como contagem', [l1.nFotos, l1.nAssinaturas]);
  for (const k of ['telefone', 'email', 'matricula', 'obs', 'fotos', 'assinaturas']) ok(!(k in l1), `levantamento sem "${k}"`);
  ok(D30.historicoPce.length === 1 && D30.historicoPce[0].municipio === 'Parintins' && D30.historicoPce[0].pragas[0] === 'Vassoura-de-bruxa', 'historicoPce: 365 dias antes do período (sem o de 400 dias)', D30.historicoPce);
  ok(Object.keys(D30.historicoPce[0]).sort().join() === 'data,municipio,pragas', 'historicoPce sem dados pessoais', Object.keys(D30.historicoPce[0]));

  // ---------- colheitas ----------
  ok(D30.colheitas.map(c => c.id).sort().join() === 'c1,c2', 'termos do período sem o excluído; cancelado incluído', D30.colheitas.map(c => c.id));
  const c1 = D30.colheitas.find(c => c.id === 'c1');
  ok(c1.doc === '***.456.789-**' && c1.nFotos === 1 && c1.lat === -4.2347, 'termo: doc mascarado, nFotos, lat numérica');
  for (const k of ['endereco', 'matricula', 'cargo', 'descricao', 'testemunha1Nome', 'testemunha1Doc', 'assinaturas', 'fotos']) ok(!(k in c1), `termo sem "${k}"`);

  // ---------- nada sensível em lugar nenhum ----------
  const txt = JSON.stringify(D30);
  for (const s of [CPF, CNPJ, '99999-1234', '98888-0000', 'produtor@exemplo.com', 'Rua Secreta', 'Estrada X', 'RG-9988776', 'MAT-777', 'foto-id-1', 'ass-id-1', 'foto-c1', 'Testemunha Um', '99988877766', 'observação privada', 'obs privada', 'EXCLUIDO'])
    ok(!txt.includes(s), 'resposta não contém ' + JSON.stringify(s));

  // ---------- barreiras e auditoria ----------
  ok(D30.barreiras.some(b => b.id === 'BVA-CEASA' && b.ativo === true), 'barreiras cadastradas', D30.barreiras);
  const aTF = D30.auditoria.tf.find(a => a.grupo === 'BVA-CEASA');
  ok(aTF && aTF.total === 3 && JSON.stringify(aTF.lacunas) === '[]' && aTF.cancelados === 1, 'auditoria TF sobre o ano inteiro (inclui TF fora do período)', aTF);
  const aP = D30.auditoria.pce.find(a => a.grupo === 'IDAM TABATINGA');
  ok(aP && aP.total === 2 && aP.cancelados === 1, 'auditoria dos termos por unidade/ano', aP);

  // ---------- atualização ao vivo (aoVivo) ----------
  console.log('painelDados aoVivo');
  d = await post({ action: 'painelDados', key: TOK, aoVivo: true, ids: ['s1'] });
  ok(d.ok && d.aoVivo === true && d.turnos.map(t => t.id).sort().join() === 's1,s3,s4', 'aoVivo: turnos abertos + os ids pedidos (para saber se encerraram)', d.turnos && d.turnos.map(t => t.id));
  ok(d.veiculos.map(v => v.id).sort().join() === 'v1,v2,v5,v6', 'aoVivo: veículos só desses turnos', d.veiculos && d.veiculos.map(v => v.id));
  ok(!('tfs' in d) && !('levantamentos' in d) && !('colheitas' in d) && !('auditoria' in d), 'aoVivo: não relê TFs, levantamentos, termos nem auditoria');
  d = await post({ action: 'painelDados', key: FIS.token, aoVivo: true }); ok(!d.ok && /Seu acesso não inclui o painel/.test(d.erro), 'aoVivo também recusa token sem a permissão painel', d.erro);

  // ---------- Sair (painelSair = sair): encerra só esta sessão ----------
  console.log('painelSair');
  const S = await amb.gerente('Gerente Painel Teste');   // outra sessão da mesma conta
  d = await post({ action: 'painelDados', key: S.token }); ok(d.ok, 'nova sessão lê o painel');
  d = await post({ action: 'painelSair', key: S.token }); ok(d.ok, 'painelSair responde ok');
  d = await post({ action: 'painelDados', key: S.token }); ok(!d.ok && SESSAO_PAINEL_INVALIDA.test(d.erro), 'depois de Sair, a mesma credencial (copiada) não lê mais o painel', d.erro);
  d = await post({ action: 'painelDados', key: TOK }); ok(d.ok, 'a outra sessão da mesma conta continua valendo (Sair encerra só a sua)');
  d = await post({ action: 'painelSair', key: 'segredo' }); ok(d.ok, 'painelSair com ACCESS_KEY responde ok');
  d = await post({ action: 'painelDados', key: TOK }); ok(d.ok, 'painelSair com credencial que não é de sessão não afeta a sessão do gerente');

  // ---------- revogação: conta desativada pela gerência ----------
  console.log('revogação');
  const R = await amb.gerente('Gerente Revogado Teste');
  d = await post({ action: 'painelDados', key: R.token }); ok(d.ok, 'conta antes de ser desativada lê o painel');
  const L = await post({ action: 'usuariosListar', key: TOK });
  const uid = ((L.usuarios || []).find(u => u.nome === 'Gerente Revogado Teste') || {}).id;
  d = await post({ action: 'usuarioAtivar', key: TOK, usuarioId: uid, ativo: 0 }); ok(d.ok, 'gerência desativa a conta (usuarioAtivar)', d.erro);
  d = await post({ action: 'painelDados', key: R.token }); ok(!d.ok && SESSAO_PAINEL_INVALIDA.test(d.erro), 'credencial da conta desativada não vale mais no painel', d.erro);
  d = await post({ action: 'painelDados', key: TOK, de: HOJE, ate: HOJE }); ok(d.ok, 'a gerência continua lendo o painel');

  console.log(falhas ? 'FALHOU=' + falhas : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('FALHOU=1', e.stack); process.exit(1); });
