const amb = require('./lib/amb');
// Módulos autorizados por servidor (aba Permissoes): servidor (Code.gs real via fakegas) + painel (aba Servidores) + app do fiscal.
const { chromium } = require('playwright-core');
const { API, PAINEL, APP } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const gerar = (nome, perfil) => get('/__gerar?nome=' + encodeURIComponent(nome) + (perfil ? '&perfil=' + perfil : ''));
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const semRevogado = m => !/revogad|inv[aá]lid|n[aã]o autorizado/i.test(m || '');
const credencial = async nome => { const g = await gerar(nome); const r = await post({ action: 'ativar', codigo: g.codigo }); return r.token; };
const linhas = async aba => (await get('/__aba?nome=' + aba)) || [];
const temId = async (aba, id) => (await linhas(aba)).some((r, i) => i > 0 && r[0] === id);

(async () => {
  const ag = Date.now(), hoje = new Date(ag - 4 * 3600e3).toISOString().slice(0, 10), ANO = new Date().getFullYear();
  /* ================= servidor ================= */
  console.log('1. Servidor');
  const adm = await gerar('Gestora Permissoes', 'admin');
  const TOK = (await post({ action: 'painelAtivar', codigo: adm.codigo })).token;
  ok(!!TOK, 'credencial de administrador');
  const A = await credencial('Ana Permissao Lima');
  let d = await post({ action: 'sync', key: A, since: 0 });
  ok(d.ok && JSON.stringify(d.permissoes) === '{"veiculos":1,"tf":1,"pce":1,"antigo":0}' && JSON.stringify(d.recusados) === '{}', 'padrão: servidor sem linha = os três módulos liberados', d.permissoes);
  d = await post({ action: 'sync', key: 'segredo', since: 0 });
  ok(JSON.stringify(d.permissoes) === '{"veiculos":1,"tf":1,"pce":1,"antigo":1}', 'chave mestra: tudo liberado (inclusive Digitar do papel)');
  d = await post({ action: 'painelAcessos', key: TOK });
  const acA = l => l.acessos.find(a => a.nome === 'Ana Permissao Lima');
  ok(JSON.stringify(acA(d).permissoes) === '{"veiculos":1,"tf":1,"pce":1,"antigo":0}', 'painelAcessos devolve as permissões (padrão: todas)', acA(d));
  ok(d.acessos.filter(a => a.perfil === 'admin').every(a => !('permissoes' in a)), 'administradores sem permissões na lista');

  // quem pode alterar
  d = await post({ action: 'painelPermissoes', key: A, nome: 'Ana Permissao Lima', veiculos: 1, tf: 1, pce: 1 });
  ok(!d.ok && /Acesso restrito/.test(d.erro), 'fiscal NÃO altera permissões', d.erro);
  d = await post({ action: 'painelPermissoes', key: 'xyz', nome: 'Ana Permissao Lima', veiculos: 1, tf: 1, pce: 1 });
  ok(!d.ok && /Sessão do painel inválida/.test(d.erro), 'credencial inválida recusada', d.erro);
  d = await post({ action: 'painelPermissoes', key: TOK, nome: 'Ana Permissao Lima', veiculos: 0, tf: 0, pce: 0 });
  ok(!d.ok && /pelo menos um módulo/.test(d.erro) && /Revogar/.test(d.erro) && !/revogad/i.test(d.erro), 'nenhum módulo marcado: recusado (aponta para Revogar)', d.erro);
  d = await post({ action: 'painelPermissoes', key: TOK, nome: 'Ninguem Existe Aqui', veiculos: 1, tf: 0, pce: 0 });
  ok(!d.ok && /não encontrado/.test(d.erro), 'servidor inexistente recusado', d.erro);
  d = await post({ action: 'painelPermissoes', key: TOK, nome: 'Gestora Permissoes', veiculos: 1, tf: 0, pce: 0 });
  ok(!d.ok && /Administrador não tem restrição/.test(d.erro) && semRevogado(d.erro), 'administrador sem restrição de módulos', d.erro);
  ok(!(await get('/__aba?nome=Permissoes')), 'nada gravado até aqui (aba Permissoes nem criada)');

  d = await post({ action: 'painelPermissoes', key: TOK, nome: '  ana  PERMISSAO lima ', veiculos: 0, tf: 0, pce: 1 });
  ok(d.ok && d.nome === 'Ana Permissao Lima' && JSON.stringify(d.permissoes) === '{"veiculos":0,"tf":0,"pce":1,"antigo":0}' && d.atualizadoPor === 'Gestora Permissoes', 'admin altera (nome sem diferenciar maiúsculas/espaços)', d);
  let P = await linhas('Permissoes');
  ok(P[0].join() === 'nome,veiculos,tf,pce,atualizadoEm,atualizadoPor,antigo' && P[1][6] === 0 && P.length === 2 && P[1][0] === 'Ana Permissao Lima' && P[1][1] === 0 && P[1][3] === 1 && P[1][5] === 'Gestora Permissoes', 'aba Permissoes: uma linha por servidor', P);
  d = await post({ action: 'painelAcessos', key: TOK });
  ok(JSON.stringify(acA(d).permissoes) === '{"veiculos":0,"tf":0,"pce":1,"antigo":0}', 'painelAcessos reflete a alteração');

  // sync ignora módulos não permitidos e sinaliza
  const turno = { id: 'pt-t1', numeroTF: 'TF-001-A-' + ANO, data: hoje, letra: 'A', inicio: '06:00', fim: '', fiscal: 'Ana Permissao Lima', local: 'X', unidade: 'MANAUS', posto: 'Fixa', encerrado: 0, criadoEm: ag, atualizadoEm: ag };
  const veic = { id: 'pt-v1', turnoId: 'pt-t1', hora: '06:10', placa: 'ABC1D23', tipo: 'PA', pessoas: 1, obs: '', excluido: 0, criadoEm: ag, atualizadoEm: ag };
  const tf = { id: 'pt-f1', barreira: 'BVA-CEASA', ano: ANO, numero: 901, numeroTxt: '0901/' + ANO, data: hoje, hora: '07:00', doc: '52998224725', nome: 'FULANO', criadoEm: ag, atualizadoEm: ag };
  const placa = { id: 'ABC1D23', doc: '52998224725', nome: 'FULANO', criadoEm: ag, atualizadoEm: ag };
  const pessoa = { id: '52998224725', tipo: 'PF', nome: 'FULANO', criadoEm: ag, atualizadoEm: ag };
  const lev = { id: 'pt-g1', data: hoje, hora: '08:00', servidor: 'Ana', doc: '52998224725', nome: 'FULANO', municipio: 'MANAUS', culturas: '[]', fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: ag, atualizadoEm: ag };
  const col = { id: 'pt-c1', unidade: 'MANAUS', ano: ANO, numero: 0, data: hoje, hora: '08:30', doc: '52998224725', nome: 'FULANO', fotos: '[]', assinaturas: '{}', criadoEm: ag, atualizadoEm: ag };
  const prop = { id: 'pt-r1', codigo: 'P1', nome: 'SITIO', doc: '52998224725', municipio: 'MANAUS', criadoEm: ag, atualizadoEm: ag };
  const tudo = { turnos: [turno], veiculos: [veic], tfs: [tf], placas: [placa], pessoas: [pessoa], levantamentos: [lev], colheitas: [col], propriedades: [prop] };
  d = await post({ action: 'sync', key: A, since: 0, ...tudo });
  ok(d.ok && JSON.stringify(d.permissoes) === '{"veiculos":0,"tf":0,"pce":1,"antigo":0}', 'sync devolve as permissões do servidor', d.permissoes);
  ok(JSON.stringify(d.recusados) === JSON.stringify({ turnos: ['pt-t1'], veiculos: ['pt-v1'], tfs: ['pt-f1'], placas: ['ABC1D23'] }), 'recusados: turnos/veículos (veiculos=0), TF/placas (tf=0)', d.recusados);
  ok(!(await temId('Turnos', 'pt-t1')) && !(await temId('Veiculos', 'pt-v1')) && !(await temId('TFs', 'pt-f1')) && !(await temId('Placas', 'ABC1D23')), 'nada desses módulos foi gravado na planilha');
  ok(await temId('Levantamentos', 'pt-g1') && await temId('Colheitas', 'pt-c1') && await temId('Propriedades', 'pt-r1') && await temId('Pessoas', '52998224725'), 'PCE liberado: levantamento, termo, propriedade e pessoa gravados');

  // actions do TF recusadas
  for (const [acao, corpo] of [['tfProximoNumero', { barreira: 'BVA-CEASA', ano: ANO }], ['tfEmitir', { tf: { ...tf, id: 'pt-f2' }, pessoa }], ['tfConsultar', { doc: '52998224725' }],
    ['tfAndamento', { estado: 'preenchendo', rascunhoId: 'r1' }]]) {
    d = await post({ action: acao, key: A, ...corpo });
    ok(!d.ok && /Sem autorização para o módulo TF de Barreira/.test(d.erro) && semRevogado(d.erro) && d.semPermissao === 'tf' && d.permissoes && d.permissoes.tf === 0,
      acao + ' recusado (mensagem clara, sem "revogado"/"inválido")', d.erro);
  }
  ok(!(await temId('TFs', 'pt-f2')), 'tfEmitir recusado não gravou o TF');
  ok(!((await linhas('Andamento')).some(r => String(r[0]).startsWith('Ana Permissao Lima|'))), 'tfAndamento recusado não gravou');
  d = await post({ action: 'pceProximoNumero', key: A, unidade: 'MANAUS', ano: ANO }); ok(d.ok, 'PCE liberado: pceProximoNumero responde');

  // PCE desligado, TF ligado
  d = await post({ action: 'painelPermissoes', key: TOK, nome: 'Ana Permissao Lima', veiculos: 1, tf: 1, pce: 0 }); ok(d.ok, 'admin troca para veículos + TF');
  P = await linhas('Permissoes'); ok(P.length === 2 && P[1][2] === 1 && P[1][3] === 0, 'atualiza a mesma linha (sem duplicar)', P);
  const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  for (const [acao, corpo] of [['pceProximoNumero', { unidade: 'MANAUS', ano: ANO }], ['pceEmitir', { colheita: { ...col, id: 'pt-c2', numero: 5 } }], ['pceConsultar', { doc: '52998224725' }],
    ['arquivoEnviar', { arquivo: { id: '0b9f6a2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', dono: 'levantamentos', donoId: 'pt-g1', tipo: 'foto', papel: '', mime: 'image/jpeg' }, base64: JPG }]]) {
    d = await post({ action: acao, key: A, ...corpo });
    ok(!d.ok && /Sem autorização para o módulo PCE/.test(d.erro) && semRevogado(d.erro) && d.semPermissao === 'pce', acao + ' recusado com pce=0', d.erro);
  }
  ok(!(await temId('Colheitas', 'pt-c2')) && !(await linhas('Arquivos')).some(r => r[0] === '0b9f6a2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'), 'nada do PCE gravado');
  const lev2 = { ...lev, id: 'pt-g2' }, pes2 = { ...pessoa, id: '11144477735' };
  d = await post({ action: 'sync', key: A, since: 0, levantamentos: [lev2], pessoas: [pes2], turnos: [turno], veiculos: [veic] });
  ok(JSON.stringify(d.recusados) === JSON.stringify({ levantamentos: ['pt-g2'] }), 'pce=0: levantamento recusado; pessoa aceita (TF liberado); turno/veículo aceitos', d.recusados);
  ok(!(await temId('Levantamentos', 'pt-g2')) && await temId('Pessoas', '11144477735') && await temId('Turnos', 'pt-t1') && await temId('Veiculos', 'pt-v1'), 'planilha confere');
  d = await post({ action: 'tfProximoNumero', key: A, barreira: 'BVA-CEASA', ano: ANO }); ok(d.ok, 'TF liberado de novo: tfProximoNumero responde');

  // só veículos: pessoas (TF/PCE) recusadas
  await post({ action: 'painelPermissoes', key: TOK, nome: 'Ana Permissao Lima', veiculos: 1, tf: 0, pce: 0 });
  d = await post({ action: 'sync', key: A, since: 0, pessoas: [{ ...pessoa, id: '39053344705' }] });
  ok(JSON.stringify(d.recusados) === JSON.stringify({ pessoas: ['39053344705'] }) && !(await temId('Pessoas', '39053344705')), 'só veículos: pessoa recusada (nem TF nem PCE liberados)', d.recusados);

  // tudo liberado de novo: os recusados sobem
  await post({ action: 'painelPermissoes', key: TOK, nome: 'Ana Permissao Lima', veiculos: true, tf: true, pce: true });
  d = await post({ action: 'sync', key: A, since: 0, ...tudo, levantamentos: [lev, lev2] });
  ok(JSON.stringify(d.recusados) === '{}' && await temId('TFs', 'pt-f1') && await temId('Placas', 'ABC1D23') && await temId('Levantamentos', 'pt-g2'), 'liberado de novo: o que foi recusado é gravado no reenvio', d.recusados);

  // edição à mão na planilha: vazio = liberado, "não" = bloqueado
  await fetch(API + '/__editar?aba=Permissoes&col=tf&valor=' + encodeURIComponent('""') + '&onde=nome:Ana Permissao Lima');
  await fetch(API + '/__editar?aba=Permissoes&col=pce&valor=' + encodeURIComponent('"não"') + '&onde=nome:Ana Permissao Lima');
  d = await post({ action: 'sync', key: A, since: 0 });
  ok(JSON.stringify(d.permissoes) === '{"veiculos":1,"tf":1,"pce":0,"antigo":0}', 'planilha editada à mão: vazio = liberado, "não" = bloqueado', d.permissoes);

  // gerar chave com módulos
  const nFis = (await linhas('Fiscais')).length;
  d = await post({ action: 'painelGerarCodigo', key: TOK, nome: 'Bruno Modulo Costa', modulos: { veiculos: 0, tf: 0, pce: 0 } });
  ok(!d.ok && /pelo menos um módulo/.test(d.erro) && (await linhas('Fiscais')).length === nFis, 'gerar sem nenhum módulo: recusado e nenhum código criado', d.erro);
  d = await post({ action: 'painelGerarCodigo', key: TOK, nome: 'Bruno Modulo Costa', modulos: { veiculos: 1, tf: 0, pce: 0 } });
  ok(d.ok && /^\d{6}$/.test(d.codigo) && JSON.stringify({ v: d.permissoes.veiculos, t: d.permissoes.tf, p: d.permissoes.pce }) === '{"v":1,"t":0,"p":0}', 'gerar chave com módulos: grava junto', d);
  const B = (await post({ action: 'ativar', codigo: d.codigo })).token;
  d = await post({ action: 'sync', key: B, since: 0 }); ok(JSON.stringify(d.permissoes) === '{"veiculos":1,"tf":0,"pce":0,"antigo":0}', 'aparelho ativado com a chave já recebe os módulos', d.permissoes);
  d = await post({ action: 'painelGerarCodigo', key: TOK, nome: 'Sem Modulos Informados' });
  ok(d.ok && Object.keys(d).sort().join() === 'codigo,expiraEm,nome,ok', 'gerar sem "modulos" (compatível): resposta igual à de antes');
  ok(!(await linhas('Permissoes')).some(r => r[0] === 'Sem Modulos Informados'), 'sem "modulos": nenhuma linha em Permissoes (padrão: tudo)');

  // 4ª permissão "antigo" (Digitar do papel): padrão desligado, exige PCE, não conta para "pelo menos um módulo"
  console.log('1b. Permissão "Digitar do papel" (antigo)');
  const linhaAna = async () => (await linhas('Permissoes')).find(r => r[0] === 'Ana Permissao Lima');
  await post({ action: 'painelPermissoes', key: TOK, nome: 'Ana Permissao Lima', veiculos: 1, tf: 1, pce: 1 });
  d = await post({ action: 'sync', key: A, since: 0 }); ok(d.permissoes.antigo === 0, 'antigo desligado por padrão (linha com antigo vazio)', d.permissoes);
  d = await post({ action: 'painelPermissoes', key: TOK, nome: 'Ana Permissao Lima', veiculos: 1, tf: 1, pce: 0, antigo: 1 });
  ok(!d.ok && /PCE/.test(d.erro) && (await linhaAna())[3] === 1, '"Digitar do papel" sem PCE: recusado com mensagem clara (nada gravado)', d.erro);
  d = await post({ action: 'painelPermissoes', key: TOK, nome: 'Ana Permissao Lima', veiculos: 0, tf: 0, pce: 0, antigo: 1 });
  ok(!d.ok && /pelo menos um módulo/.test(d.erro), 'só "Digitar do papel" não conta como módulo', d.erro);
  d = await post({ action: 'painelPermissoes', key: TOK, nome: 'Ana Permissao Lima', veiculos: 0, tf: 0, pce: 1, antigo: true });
  ok(d.ok && JSON.stringify(d.permissoes) === '{"veiculos":0,"tf":0,"pce":1,"antigo":1}' && (await linhaAna())[6] === 1, 'PCE + Digitar do papel: gravado (coluna antigo no fim)', d);
  d = await post({ action: 'sync', key: A, since: 0 }); ok(d.permissoes.antigo === 1, 'sync devolve antigo=1', d.permissoes);
  d = await post({ action: 'painelAcessos', key: TOK }); ok(acA(d).permissoes.antigo === 1, 'painelAcessos devolve antigo', acA(d).permissoes);
  d = await post({ action: 'painelPermissoes', key: TOK, nome: 'Ana Permissao Lima', veiculos: 1, tf: 0, pce: 1 });
  ok(d.ok && d.permissoes.antigo === 1, 'chamada sem "antigo" (painel antigo) mantém o valor gravado', d.permissoes);
  d = await post({ action: 'painelPermissoes', key: TOK, nome: 'Ana Permissao Lima', veiculos: 1, tf: 0, pce: 0 });
  ok(d.ok && d.permissoes.antigo === 0 && (await linhaAna())[6] === 0, 'PCE tirado: "Digitar do papel" sai junto', d.permissoes);
  await post({ action: 'painelPermissoes', key: TOK, nome: 'Ana Permissao Lima', veiculos: 1, tf: 1, pce: 1 });
  await fetch(API + '/__editar?aba=Permissoes&col=antigo&valor=' + encodeURIComponent('"sim"') + '&onde=nome:Ana Permissao Lima');
  d = await post({ action: 'sync', key: A, since: 0 }); ok(d.permissoes.antigo === 1, 'planilha editada à mão: "sim" autoriza', d.permissoes);
  await fetch(API + '/__editar?aba=Permissoes&col=pce&valor=' + encodeURIComponent('0') + '&onde=nome:Ana Permissao Lima');
  d = await post({ action: 'sync', key: A, since: 0 }); ok(d.permissoes.antigo === 0 && d.permissoes.pce === 0, 'à mão: antigo=1 com pce=0 vale como 0', d.permissoes);
  await fetch(API + '/__editar?aba=Permissoes&col=pce&valor=' + encodeURIComponent('1') + '&onde=nome:Ana Permissao Lima');
  await fetch(API + '/__editar?aba=Permissoes&col=antigo&valor=' + encodeURIComponent('""') + '&onde=nome:Ana Permissao Lima');
  d = await post({ action: 'sync', key: A, since: 0 }); ok(d.permissoes.antigo === 0 && d.permissoes.pce === 1, 'à mão: antigo vazio = não autorizado', d.permissoes);
  const lv = { id: 'pt-ant1', data: hoje, hora: '08:00', doc: '52998224725', nome: 'PAPEL', municipio: 'Manaus', culturas: '[]', fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: ag, atualizadoEm: ag, registroAntigo: 1 };
  const lvn = { ...lv, id: 'pt-ant2', registroAntigo: 0 };
  d = await post({ action: 'sync', key: A, since: 0, levantamentos: [lv, lvn] });
  ok(JSON.stringify(d.recusados) === '{"levantamentos":["pt-ant1"]}' && !(await temId('Levantamentos', 'pt-ant1')) && await temId('Levantamentos', 'pt-ant2'), 'sync: só o registro antigo é recusado; o normal do mesmo lote entra', d.recusados);
  d = await post({ action: 'pceEmitir', key: A, colheita: { id: 'pt-ant-c1', unidade: 'MANAUS', ano: ANO, numero: 77, registroAntigo: 1, data: hoje } });
  ok(!d.ok && /Sem autorização para digitar registros antigos \(do papel\)\. Fale com a gerência\./.test(d.erro) && semRevogado(d.erro) && d.semPermissao === 'antigo', 'pceEmitir de termo antigo recusado', d.erro);
  d = await post({ action: 'arquivoEnviar', key: A, arquivo: { id: require('crypto').randomUUID(), dono: 'levantamentos', donoId: 'pt-ant2', tipo: 'documento', papel: '', mime: 'application/pdf' }, base64: Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64') });
  ok(!d.ok && /registros antigos/.test(d.erro) && semRevogado(d.erro) && d.semPermissao === 'antigo', 'arquivoEnviar de PDF recusado', d.erro);
  await post({ action: 'painelPermissoes', key: TOK, nome: 'Ana Permissao Lima', veiculos: 1, tf: 1, pce: 1, antigo: 1 });
  d = await post({ action: 'sync', key: A, since: 0, levantamentos: [lv] });
  ok(JSON.stringify(d.recusados) === '{}' && await temId('Levantamentos', 'pt-ant1'), 'com a permissão: registro antigo gravado', d.recusados);
  d = await post({ action: 'painelGerarCodigo', key: TOK, nome: 'Estagiario Papel Silva', modulos: { veiculos: 0, tf: 0, pce: 0, antigo: 1 } });
  ok(!d.ok && /pelo menos um módulo/.test(d.erro), 'gerar só com "Digitar do papel": recusado', d.erro);
  d = await post({ action: 'painelGerarCodigo', key: TOK, nome: 'Estagiario Papel Silva', modulos: { veiculos: 1, tf: 0, pce: 0, antigo: 1 } });
  ok(!d.ok && /PCE/.test(d.erro) && !(await linhas('Fiscais')).some(r => r[0] === 'Estagiario Papel Silva'), 'gerar "Digitar do papel" sem PCE: recusado e nenhum código criado', d.erro);
  d = await post({ action: 'painelGerarCodigo', key: TOK, nome: 'Estagiario Papel Silva', modulos: { veiculos: 0, tf: 0, pce: 1, antigo: 1 } });
  ok(d.ok && d.permissoes.antigo === 1 && d.permissoes.pce === 1, 'gerar chave com PCE + Digitar do papel', d.permissoes);

  /* ================= navegador ================= */
  const b = await amb.lancar();
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const erros = [];
  const vigiar = (p, rotulo) => {
    p.on('pageerror', e => erros.push(rotulo + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) erros.push(rotulo + ': ' + m.text()); });
    p.dialogos = []; p.on('dialog', dg => { p.dialogos.push(dg.message()); dg.accept(); });
  };

  console.log('2. Painel');
  const adm2 = await gerar('Gerente Modulos', 'admin');
  const cp = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block' });
  await cp.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await cp.addInitScript(() => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', 1); localStorage.setItem('gdv.url', window.__GDV_API); } });
  const p = await cp.newPage(); vigiar(p, 'painel');
  await p.goto(PAINEL);
  await p.fill('#pn-codigo', adm2.codigo); await p.click('#pn-entrar');
  await p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 });
  await p.click('.pn-aba[data-aba=acessos]'); await p.waitForSelector('#pn-ac-tab table', { timeout: 15000 });
  const th = await p.$$eval('#pn-ac-tab th', t => t.map(x => x.textContent));
  ok(th[2] === 'Módulos', 'coluna "Módulos" na tabela', th);
  const caixas = (pg, nome) => pg.$$eval(`#pn-ac-tab .pn-ac-perm[data-nome="${nome}"]`, gs => gs.map(g => [...g.querySelectorAll('input')].map(i => i.dataset.perm + '=' + (i.checked ? 1 : 0)).join(',')));
  ok((await caixas(p, 'Bruno Modulo Costa'))[0] === 'veiculos=1,tf=0,pce=0,antigo=0', 'caixas refletem a permissão gravada', await caixas(p, 'Bruno Modulo Costa'));
  ok((await caixas(p, 'Sem Modulos Informados'))[0] === 'veiculos=1,tf=1,pce=1,antigo=0', 'servidor sem linha: tudo marcado');
  ok(!(await p.$('#pn-ac-tab .pn-ac-perm[data-nome="Gerente Modulos"]')), 'administrador sem caixas');
  // marcar TF de Bruno: salva na hora
  const sel = (nome, k) => `#pn-ac-tab .pn-ac-perm[data-nome="${nome}"] input[data-perm=${k}]`;
  await p.check(sel('Bruno Modulo Costa', 'tf'));
  await p.waitForFunction(() => /Salvo/.test(document.querySelector('#pn-ac-tab .pn-ac-perm[data-nome="Bruno Modulo Costa"] .pn-ac-perm-st').textContent), null, { timeout: 8000 });
  ok(true, 'indicação "Salvo ✓" ao marcar');
  let rowB = (await linhas('Permissoes')).find(r => r[0] === 'Bruno Modulo Costa');
  ok(rowB[1] === 1 && rowB[2] === 1 && rowB[3] === 0 && rowB[5] === 'Gerente Modulos', 'planilha: TF liberado para Bruno, atualizadoPor = administrador logado', rowB);
  // desmarcar todos: recusado no próprio painel
  await p.uncheck(sel('Bruno Modulo Costa', 'tf')); await p.waitForFunction(() => /Salvo/.test(document.querySelector('#pn-ac-tab .pn-ac-perm[data-nome="Bruno Modulo Costa"] .pn-ac-perm-st').textContent), null, { timeout: 8000 });
  await p.click(sel('Bruno Modulo Costa', 'veiculos')); await p.waitForTimeout(300);
  const st = await p.textContent('#pn-ac-tab .pn-ac-perm[data-nome="Bruno Modulo Costa"] .pn-ac-perm-st');
  ok(/pelo menos um módulo/.test(st) && (await caixas(p, 'Bruno Modulo Costa'))[0] === 'veiculos=1,tf=0,pce=0,antigo=0', 'desmarcar o último: aviso e a caixa volta marcada', st);
  rowB = (await linhas('Permissoes')).find(r => r[0] === 'Bruno Modulo Costa'); ok(rowB[1] === 1, 'planilha intacta');
  // vários aparelhos do mesmo servidor: todas as linhas mudam juntas
  await post({ action: 'painelGerarCodigo', key: TOK, nome: 'Bruno Modulo Costa' });
  await p.click('#pn-ac-recarregar'); await p.waitForFunction(() => document.querySelectorAll('#pn-ac-tab .pn-ac-perm[data-nome="Bruno Modulo Costa"]').length === 2, null, { timeout: 8000 });
  await p.check(sel('Bruno Modulo Costa', 'pce') + ' >> nth=0');
  await p.waitForFunction(() => /Salvo/.test(document.querySelector('#pn-ac-tab .pn-ac-perm[data-nome="Bruno Modulo Costa"] .pn-ac-perm-st').textContent), null, { timeout: 8000 });
  ok((await caixas(p, 'Bruno Modulo Costa')).every(x => x === 'veiculos=1,tf=0,pce=1,antigo=0'), 'duas linhas (dois aparelhos) do mesmo servidor ficam iguais', await caixas(p, 'Bruno Modulo Costa'));
  // erro do servidor: volta ao estado anterior e mostra o erro
  await p.route(amb.API + '/**', rt => rt.request().postData() && rt.request().postData().includes('painelPermissoes')
    ? rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, erro: 'Falha simulada na planilha.' }) }) : rt.continue());
  await p.click(sel('Sem Modulos Informados', 'tf'));
  await p.waitForFunction(() => /Não salvou/.test(document.querySelector('#pn-ac-tab .pn-ac-perm[data-nome="Sem Modulos Informados"] .pn-ac-perm-st').textContent), null, { timeout: 8000 });
  ok((await caixas(p, 'Sem Modulos Informados'))[0] === 'veiculos=1,tf=1,pce=1,antigo=0' && await p.isVisible('#pn-app'), 'erro ao salvar: "Não salvou: …", caixa volta e a sessão continua');
  await p.unroute(amb.API + '/**');
  // persistem ao recarregar
  await p.reload(); await p.waitForSelector('#pn-ac-tab table', { timeout: 20000 });
  await p.waitForFunction(() => document.querySelector('#pn-ac-tab .pn-ac-perm[data-nome="Bruno Modulo Costa"]'), null, { timeout: 8000 });
  ok((await caixas(p, 'Bruno Modulo Costa'))[0] === 'veiculos=1,tf=0,pce=1,antigo=0', 'após recarregar a página: caixas como foram salvas');
  // "Digitar do papel" na tabela: salva na hora; exige PCE (desmarcar PCE desmarca Papel; marcar Papel marca PCE)
  const salvo = async nome => { await p.waitForFunction(n => /Salvo/.test(document.querySelector(`#pn-ac-tab .pn-ac-perm[data-nome="${n}"] .pn-ac-perm-st`).textContent), nome, { timeout: 8000 }); };
  const limparSt = () => p.evaluate(() => document.querySelectorAll('.pn-ac-perm-st').forEach(s => { s.textContent = ''; s.className = 'pn-ac-perm-st'; }));
  ok(/Digitar do papel/.test(await p.textContent('#pn-ac-tab .pn-ac-perm[data-nome="Bruno Modulo Costa"]')), 'caixa "Digitar do papel" na coluna Módulos');
  await limparSt(); await p.check(sel('Bruno Modulo Costa', 'antigo')); await salvo('Bruno Modulo Costa');
  rowB = (await linhas('Permissoes')).find(r => r[0] === 'Bruno Modulo Costa');
  ok(rowB[3] === 1 && rowB[6] === 1, 'marcar Papel: salvo na planilha (coluna antigo = 1)', rowB);
  await limparSt(); await p.uncheck(sel('Bruno Modulo Costa', 'pce')); await salvo('Bruno Modulo Costa');
  rowB = (await linhas('Permissoes')).find(r => r[0] === 'Bruno Modulo Costa');
  ok((await caixas(p, 'Bruno Modulo Costa'))[0] === 'veiculos=1,tf=0,pce=0,antigo=0' && rowB[3] === 0 && rowB[6] === 0, 'desmarcar PCE desmarca "Digitar do papel" junto', rowB);
  await limparSt(); await p.check(sel('Bruno Modulo Costa', 'antigo')); await salvo('Bruno Modulo Costa');
  rowB = (await linhas('Permissoes')).find(r => r[0] === 'Bruno Modulo Costa');
  ok((await caixas(p, 'Bruno Modulo Costa'))[0] === 'veiculos=1,tf=0,pce=1,antigo=1' && rowB[3] === 1 && rowB[6] === 1, 'marcar "Digitar do papel" sem PCE marca o PCE junto', rowB);
  await limparSt(); await p.uncheck(sel('Bruno Modulo Costa', 'antigo')); await salvo('Bruno Modulo Costa');
  ok((await caixas(p, 'Bruno Modulo Costa'))[0] === 'veiculos=1,tf=0,pce=1,antigo=0', 'desmarcar Papel: PCE continua');
  // formulário "Gerar chave" com módulos
  ok(await p.isChecked('#pn-ac-mod-veiculos') && await p.isChecked('#pn-ac-mod-tf') && await p.isChecked('#pn-ac-mod-pce'), 'formulário: três módulos marcados por padrão');
  ok(await p.isVisible('#pn-ac-mod-antigo') && !(await p.isChecked('#pn-ac-mod-antigo')) && /Digitar do papel/.test(await p.textContent('#pn-ac-mods')), 'formulário: "Digitar do papel" desmarcada por padrão');
  await p.uncheck('#pn-ac-mod-pce'); await p.check('#pn-ac-mod-antigo');
  ok(await p.isChecked('#pn-ac-mod-pce'), 'formulário: marcar "Digitar do papel" marca o PCE');
  await p.uncheck('#pn-ac-mod-pce');
  ok(!(await p.isChecked('#pn-ac-mod-antigo')), 'formulário: desmarcar o PCE desmarca "Digitar do papel"');
  await p.check('#pn-ac-mod-pce');
  await p.fill('#pn-ac-nome', 'bruno modulo costa');
  ok(!(await p.isChecked('#pn-ac-mod-tf')) && await p.isChecked('#pn-ac-mod-pce') && /já cadastrado/.test(await p.textContent('#pn-ac-mods-dica')), 'nome já cadastrado: formulário mostra os módulos atuais dele');
  await p.fill('#pn-ac-nome', 'Daniela Campo Nunes');
  ok(await p.isChecked('#pn-ac-mod-tf'), 'nome novo: volta ao padrão (tudo marcado)');
  await p.uncheck('#pn-ac-mod-veiculos'); await p.uncheck('#pn-ac-mod-tf'); await p.uncheck('#pn-ac-mod-pce'); await p.click('#pn-ac-gerar');
  ok(/pelo menos um módulo/.test(await p.textContent('#pn-ac-erro')) && await p.isHidden('#pn-ac-res'), 'gerar sem módulo: aviso no formulário');
  await p.check('#pn-ac-mod-pce'); await p.click('#pn-ac-gerar');
  await p.waitForSelector('#pn-ac-res:not([hidden]) #pn-ac-res-mods');
  ok(/PCE/.test(await p.textContent('#pn-ac-res-mods')) && !/TF de Barreira|Educação/.test(await p.textContent('#pn-ac-res-mods')), 'resultado mostra os módulos', await p.textContent('#pn-ac-res-mods'));
  const rowD = (await linhas('Permissoes')).find(r => r[0] === 'Daniela Campo Nunes');
  ok(rowD && rowD[1] === 0 && rowD[2] === 0 && rowD[3] === 1 && rowD[6] === 0, 'planilha: código e módulos gravados juntos (antigo=0)', rowD);
  // gerar com "Digitar do papel"
  await p.fill('#pn-ac-nome', 'Elisa Papel Ramos'); await p.uncheck('#pn-ac-mod-veiculos'); await p.uncheck('#pn-ac-mod-tf'); await p.check('#pn-ac-mod-antigo'); await p.click('#pn-ac-gerar');
  await p.waitForFunction(() => /Elisa Papel Ramos/.test((document.querySelector('#pn-ac-res:not([hidden])') || {}).textContent || ''), null, { timeout: 8000 });
  ok(/Digitar do papel/.test(await p.textContent('#pn-ac-res-mods')), 'resultado mostra "Digitar do papel"', await p.textContent('#pn-ac-res-mods'));
  const rowE = (await linhas('Permissoes')).find(r => r[0] === 'Elisa Papel Ramos');
  ok(rowE && rowE[3] === 1 && rowE[6] === 1, 'planilha: chave gerada com PCE + Digitar do papel', rowE);
  ok(!(await p.isChecked('#pn-ac-mod-antigo')), 'formulário volta ao padrão (Papel desmarcada)');
  await p.waitForFunction(() => document.querySelector('#pn-ac-tab .pn-ac-perm[data-nome="Daniela Campo Nunes"]'), null, { timeout: 8000 });
  ok((await caixas(p, 'Daniela Campo Nunes'))[0] === 'veiculos=0,tf=0,pce=1,antigo=0', 'lista mostra o novo servidor só com PCE');
  ok(await p.isChecked('#pn-ac-mod-veiculos'), 'formulário volta ao padrão depois de gerar');
  await p.fill('#pn-ac-busca', 'Modulo Costa'); await p.waitForTimeout(200);
  await p.screenshot({ path: amb.saida('permissoes_painel.png'), fullPage: true });
  await p.fill('#pn-ac-busca', '');
  // celular
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
  const cel = await p.evaluate(() => ({ semRolagem: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    rolo: (() => { const r = document.querySelector('#pn-ac-tab .pn-tab-rolo'); return r.scrollWidth <= r.clientWidth + 1; })(), larg: (() => { const r = document.querySelector('#pn-ac-tab .pn-tab-rolo'); return [r.scrollWidth, r.clientWidth, ...[...document.querySelectorAll('#pn-ac-tab tr:nth-child(1) td')].map(td => Math.round(td.getBoundingClientRect().width))]; })(),
    th: [...document.querySelectorAll('#pn-ac-tab th')].filter(x => x.offsetParent).map(x => x.textContent) }));
  ok(cel.semRolagem && cel.rolo && cel.th.join() === 'Servidor,Situação,Módulos,Código,', '390 px: módulos visíveis, sem rolagem horizontal', cel);
  const papelCel = await p.$$eval('#pn-ac-tab .pn-ac-perm .pn-ac-perm-m', xs => xs.filter(x => x.offsetParent).map(x => x.textContent));
  ok(papelCel.includes('Papel') && papelCel.includes('PCE'), '390 px: rótulo curto "Papel"', papelCel.slice(0, 4));
  const formCel = await p.evaluate(() => { const f = document.querySelector('#pn-ac-form'); return f.scrollWidth <= f.clientWidth + 1; });
  ok(formCel, '390 px: formulário de gerar chave sem rolagem horizontal');
  await p.fill('#pn-ac-busca', 'Modulo Costa'); await p.waitForTimeout(200);
  await p.screenshot({ path: amb.saida('permissoes_painel_celular.png'), fullPage: true });

  console.log('3. App do fiscal');
  const nomeC = 'Carlos App Souza', C = await credencial(nomeC);
  const ca = await b.newContext({ viewport: { width: 400, height: 860 }, permissions: ['geolocation'], geolocation: { latitude: -3.119, longitude: -60.0217, accuracy: 10 }, serviceWorkers: 'block' });
  await ca.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [C, nomeC]);
  const a = await ca.newPage(); vigiar(a, 'app');
  const corpos = []; a.on('request', rq => { if (rq.method() === 'POST' && rq.url().startsWith(amb.API)) corpos.push(rq.postData() || ''); });
  const sync = async () => { await a.evaluate(() => Sync.sincronizar()); await a.waitForFunction(() => ['ok', 'idle', 'erro'].includes(Sync.estado().tipo), null, { timeout: 15000 }); await a.waitForTimeout(400); };
  const perm = (v, t, pc) => post({ action: 'painelPermissoes', key: TOK, nome: nomeC, veiculos: v, tf: t, pce: pc });
  await a.goto(APP); await a.waitForSelector('.modulo'); await sync();
  ok(await a.locator('.modulo.bloqueado').count() === 0 && await a.locator('.modulo[data-v]').count() === 3, 'tudo liberado: três módulos ativos');
  ok(JSON.stringify(await a.evaluate(() => Store.meta('permissoes'))) === '{"veiculos":1,"tf":1,"pce":1,"antigo":0}', 'permissões guardadas no aparelho (meta "permissoes")');
  ok(await a.evaluate(() => Sync.pode('antigo') === false), 'app: Digitar do papel desligado por padrão');
  // turno + veículo
  await a.click('.modulo[data-v=home]'); await a.waitForSelector('#fTurno');
  await a.fill('#nTF', '5'); await a.selectOption('#nPosto', 'Móvel'); await a.fill('#nLocal', 'BR-174 km 10'); await a.click('#fTurno button[type=submit]');
  await a.waitForSelector('.contador');
  ok(await a.locator('[data-go=tfnovo]').count() === 1, 'TF liberado: "Lavrar TF neste turno" aparece');
  await a.click('[data-go=registrar]'); await a.waitForSelector('#fVeic'); await a.fill('#placa', 'AAA1B22'); await a.click('#fVeic button');
  await a.waitForFunction(() => /registrado/.test(document.querySelector('#toast').textContent)); await sync();
  await a.click('nav [data-v=lista]'); await a.waitForSelector('.item');
  ok(await a.locator('[data-tfveic]').count() === 1, 'TF liberado: "Lavrar TF" no veículo');
  // gerência tira o TF
  await perm(1, 0, 1); await sync();
  ok(await a.locator('[data-tfveic]').count() === 0 && await a.locator('.item').count() === 1, 'tf=0: "Lavrar TF" some da lista (ao próximo sync, sem recarregar)');
  await a.click('nav [data-v=home]'); await a.waitForSelector('.contador');
  ok(await a.locator('[data-go=tfnovo]').count() === 0, 'tf=0: "Lavrar TF neste turno" some');
  await a.screenshot({ path: amb.saida('permissoes_app_turno_semtf.png'), fullPage: true });
  await a.evaluate(() => go('tfnovo')); await a.waitForSelector('.modulo'); await a.waitForTimeout(300);
  ok(await a.locator('.modulo').count() === 3 && /Sem autorização/.test(await a.textContent('#toast')), 'abrir o TF por outro caminho: volta para os módulos com aviso');
  ok(await a.locator('.modulo.bloqueado[data-bloq=tf]').count() === 1 && /Sem autorização — fale com a gerência/.test(await a.textContent('.modulo.bloqueado')), 'cartão do TF cinza: "Sem autorização — fale com a gerência"');
  await a.evaluate(() => { document.querySelector('#toast').textContent = ''; }); await a.click('.modulo.bloqueado[data-bloq=tf]', { force: true }); await a.waitForTimeout(300);
  ok(await a.locator('.modulo').count() === 3 && /Sem autorização/.test(await a.textContent('#toast')), 'tocar no cartão bloqueado não abre o módulo');
  ok(!(/Lavrar TF/.test(await a.textContent('#view'))), 'dica de "Lavrar TF" some da tela de módulos');
  // dentro do Controle de veículos, sem internet: registra; gerência tira o módulo; ao sincronizar volta para os módulos sem perder nada
  await a.click('.modulo[data-v=home]'); await a.waitForSelector('.contador');
  await ca.setOffline(true); await a.evaluate(() => window.dispatchEvent(new Event('offline')));
  await a.click('[data-go=registrar]'); await a.waitForSelector('#fVeic'); await a.fill('#placa', 'OFF1L23'); await a.click('#fVeic button');
  await a.waitForFunction(() => /OFF1L23 registrado/.test(document.querySelector('#toast').textContent));
  await a.click('nav [data-v=lista]'); await a.waitForSelector('.item');
  await perm(0, 0, 1);
  await ca.setOffline(false); await a.evaluate(() => window.dispatchEvent(new Event('online')));
  await a.waitForFunction(() => VIEW === 'modulos' && document.querySelector('.modulo.bloqueado[data-bloq=veiculos]'), null, { timeout: 15000 });
  ok(true, 'veiculos=0 com o fiscal dentro do módulo: ao sincronizar volta para a tela de módulos');
  await a.waitForFunction(() => document.querySelector('#avisoPerm'), null, { timeout: 8000 });
  ok(/Sem autorização para o módulo Educação Sanitária\/Fiscalização de Trânsito — fale com a gerência/.test(await a.textContent('#avisoPerm')), 'aviso: "Sem autorização para o módulo Educação Sanitária/Fiscalização de Trânsito — fale com a gerência"', await a.textContent('#avisoPerm'));
  ok(/Turno em andamento · 2 veículo\(s\).*guardado neste aparelho/.test(await a.textContent('.modulo[data-bloq=veiculos]')), 'cartão de veículos: turno em andamento guardado no aparelho');
  let loc = await a.evaluate(async () => (await Store.todos('veiculos')).filter(v => ['AAA1B22', 'OFF1L23'].includes(v.placa)).map(v => v.placa + ':' + v.pendente).sort().join());
  ok(loc === 'AAA1B22:0,OFF1L23:1', 'veículo registrado sem internet continua no aparelho, pendente', loc);
  ok(!(await linhas('Veiculos')).some(r => r[3] === 'OFF1L23'), 'e não foi gravado na planilha');
  await a.waitForFunction(() => /a enviar/.test(document.querySelector('#sync').textContent), null, { timeout: 10000 }).catch(() => {});   // pode estar no meio de um sync ("Sincronizando…")
  ok(/a enviar/.test(await a.textContent('#sync')), 'selo mostra pendentes a enviar', await a.textContent('#sync'));
  await a.screenshot({ path: amb.saida('permissoes_app_bloqueado.png'), fullPage: true });
  await a.evaluate(() => go('registrar'));
  ok(await a.evaluate(() => VIEW) === 'modulos' && !(await a.$('#fVeic')), 'não deixa registrar novos veículos (tela não abre)');
  // próximo sync: os registros do módulo bloqueado nem sobem
  corpos.length = 0; await sync();
  const enviou = corpos.filter(c => c.includes('"action":"sync"'));
  ok(enviou.length >= 1 && enviou.every(c => !c.includes('OFF1L23')), 'sync seguinte não reenvia os registros do módulo bloqueado');
  ok(await a.evaluate(async () => (await Store.todos('veiculos')).find(v => v.placa === 'OFF1L23').pendente) === 1, 'continuam pendentes');
  // sem internet, usa a última permissão conhecida
  await a.route(amb.API + '/**', rt => rt.abort());
  await a.reload(); await a.waitForSelector('.modulo');
  ok(await a.locator('.modulo.bloqueado').count() === 2 && await a.locator('.modulo[data-v=pce]').count() === 1, 'recarregado sem internet: usa a última permissão conhecida (veículos e TF bloqueados, PCE liberado)');
  await a.unroute(amb.API + '/**');
  // gerência libera de novo: o que estava guardado sobe
  await perm(1, 1, 1); await sync();
  await a.waitForFunction(() => !document.querySelector('.modulo.bloqueado') && !document.querySelector('#avisoPerm'), null, { timeout: 10000 });
  ok(true, 'liberado de novo: cartões normais, aviso some');
  loc = await a.evaluate(async () => (await Store.todos('veiculos')).filter(v => ['AAA1B22', 'OFF1L23'].includes(v.placa)).map(v => v.placa + ':' + v.pendente).sort().join());
  ok(loc === 'AAA1B22:0,OFF1L23:0', 'registro guardado foi enviado (não pendente)', loc);
  ok((await linhas('Veiculos')).some(r => r[3] === 'OFF1L23'), 'e está na planilha');
  await a.click('.modulo[data-v=home]'); await a.waitForSelector('.contador');
  ok(await a.locator('[data-go=tfnovo]').count() === 1, '"Lavrar TF neste turno" volta');
  // TF tirado com o formulário de TF aberto: volta para os módulos e o rascunho fica guardado
  await a.click('[data-go=tfnovo]'); await a.waitForSelector('#tfForm'); await a.fill('#tf-nome', 'RASCUNHO GUARDADO'); await a.waitForTimeout(800);
  await perm(1, 0, 1); await sync();
  await a.waitForFunction(() => VIEW === 'modulos', null, { timeout: 10000 });
  const rasc = await a.evaluate(() => Store.meta('tfRascunho'));
  ok(rasc && rasc.dados && rasc.dados.nome === 'RASCUNHO GUARDADO', 'formulário de TF aberto quando o TF é retirado: volta aos módulos e o rascunho fica guardado');
  // PCE: botão "Termo de colheita" some com pce=0 (não chega a abrir o módulo)
  await perm(1, 1, 0); await sync();
  ok(await a.locator('.modulo.bloqueado[data-bloq=pce]').count() === 1, 'pce=0: cartão do PCE bloqueado');
  await a.screenshot({ path: amb.saida('permissoes_app_pce.png'), fullPage: true });
  await perm(1, 1, 1); await sync();

  const errs = [...new Set(erros)];
  ok(!errs.length, 'sem erros de console/página', errs);
  await b.close();
  console.log(falhas ? 'FALHOU=' + falhas : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('FALHOU=1', e.stack); process.exit(1); });
