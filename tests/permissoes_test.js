const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Módulos liberados por conta (matrícula e senha; permissões em PermissoesDosUsuarios): servidor (Code.gs real via fakegas), tela de
// Usuários do painel (permissões por conta e "Digitar do papel" amarrado ao PCE) e o que o app de campo recebe no sync.
// Os códigos de ativação, a ACCESS_KEY e a aba Permissoes (agora só histórico) não valem mais. Dados fictícios.
const { chromium } = require('playwright-core');
const { API, PAINEL, APP } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const semRevogado = m => !/revogad|inv[aá]lid|n[aã]o autorizado/i.test(m || '');
const tabela = async nome => { const t = (await get('/__aba?nome=' + nome)) || []; return t.slice(1).map(l => Object.fromEntries(t[0].map((c, i) => [c, l[i]]))); };
// permissões ativas (sem revogadaEm) de uma conta, em ordem alfabética, na planilha
const permAtivas = async uid => (await tabela('PermissoesDosUsuarios')).filter(p => p.usuarioId === uid && !p.revogadaEm).map(p => p.permissao).sort().join();
const idDe = async nome => ((await tabela('Usuarios')).find(u => u.nome === nome) || {}).id;
const MODS = m => JSON.stringify(m);

(async () => {
  const ag = Date.now(), hoje = new Date(ag - 4 * 3600e3).toISOString().slice(0, 10), ANO = new Date().getFullYear();
  /* ================= servidor ================= */
  console.log('1. Servidor');
  const GT = (await U.gerente()).token;
  const A = await U.fiscal('Ana Permissao Lima', { permissoes: U.lista({ veiculos: 1, tf: 1, pce: 1, antigo: 0 }) });
  const ANA = A.usuario.id;
  ok(!!GT && !!ANA, 'conta de gerência e conta de fiscal (campo, fiscalização, TF e PCE)');
  let d = await post({ action: 'sync', key: A.token, since: 0 });
  ok(d.ok && MODS(d.permissoes) === '{"veiculos":1,"tf":1,"pce":1,"antigo":0}' && MODS(d.recusados) === '{}', 'conta com os três módulos: liberados no sync, nada recusado', d.permissoes);
  const C0 = await U.fiscal('Carla Campo Sem Modulos', { permissoes: ['campo'] });
  d = await post({ action: 'sync', key: C0.token, since: 0 });
  ok(d.ok && MODS(d.permissoes) === '{"veiculos":0,"tf":0,"pce":0,"antigo":0}', 'conta só com "App de campo": nenhum módulo liberado', d.permissoes);
  d = await post({ action: 'sync', key: 'segredo', since: 0 });
  ok(!d.ok, 'a antiga chave mestra (ACCESS_KEY) não vale mais', d.erro);
  d = await post({ action: 'sync', key: GT, since: 0 });
  ok(MODS(d.permissoes) === '{"veiculos":1,"tf":1,"pce":1,"antigo":1}', 'gerência: tudo liberado (inclusive Digitar do papel)', d.permissoes);
  d = await post({ action: 'usuariosListar', key: GT });
  const acA = d.usuarios.find(u => u.id === ANA);
  ok(acA && acA.permissoes.join() === 'campo,fiscalizacaoDeTransito,termoDeBarreira,pce', 'usuariosListar devolve as permissões de cada conta', acA && acA.permissoes);

  // quem pode alterar
  d = await post({ action: 'usuarioPermissoes', key: A.token, usuarioId: ANA, permissoes: ['campo'] });
  ok(!d.ok && /só da gerência/.test(d.erro) && semRevogado(d.erro), 'fiscal NÃO altera permissões', d.erro);
  d = await post({ action: 'usuarioPermissoes', key: 'xyz', usuarioId: ANA, permissoes: ['campo'] });
  ok(!d.ok, 'credencial inválida recusada', d.erro);
  d = await post({ action: 'usuarioPermissoes', key: GT, usuarioId: ANA, permissoes: [] });
  ok(!d.ok && /pelo menos uma permissão/.test(d.erro) && /desative a conta/.test(d.erro), 'nenhuma permissão: recusado (aponta para desativar a conta)', d.erro);
  d = await post({ action: 'usuarioPermissoes', key: GT, usuarioId: 'nao-existe', permissoes: ['campo'] });
  ok(!d.ok && /não encontrado/.test(d.erro), 'usuário inexistente recusado', d.erro);
  ok(await permAtivas(ANA) === 'campo,fiscalizacaoDeTransito,pce,termoDeBarreira', 'nada foi gravado pelas tentativas recusadas');

  // a gerência muda: fiscalização e TF saem, PCE fica
  d = await U.permissoes(ANA, U.lista({ veiculos: 0, tf: 0, pce: 1, antigo: 0 }));
  ok(d.ok && d.permissoes.join() === 'campo,pce', 'gerência tira fiscalização e TF: lista exata devolvida', d);
  let rows = await tabela('PermissoesDosUsuarios');
  ok(await permAtivas(ANA) === 'campo,pce' && rows.some(p => p.usuarioId === ANA && p.permissao === 'termoDeBarreira' && p.revogadaEm) && rows.some(p => p.usuarioId === ANA && p.permissao === 'fiscalizacaoDeTransito' && p.revogadaEm),
    'planilha: só as permissões ativas valem; as retiradas ficam como histórico (revogadaEm)');
  d = await post({ action: 'sync', key: A.token, since: 0 });
  ok(MODS(d.permissoes) === '{"veiculos":0,"tf":0,"pce":1,"antigo":0}', 'sync devolve os módulos novos (sem novo login)', d.permissoes);

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
  d = await post({ action: 'sync', key: A.token, since: 0, ...tudo });
  ok(d.ok && MODS(d.permissoes) === '{"veiculos":0,"tf":0,"pce":1,"antigo":0}', 'sync devolve as permissões do servidor', d.permissoes);
  ok(MODS(d.recusados) === MODS({ turnos: ['pt-t1'], veiculos: ['pt-v1'], tfs: ['pt-f1'], placas: ['ABC1D23'] }), 'recusados: turnos/veículos (sem fiscalização), TF/placas (sem TF)', d.recusados);
  ok(!(await tabela('Turnos')).some(r => r.id === 'pt-t1') && !(await tabela('Veiculos')).some(r => r.id === 'pt-v1') && !(await tabela('TFs')).some(r => r.id === 'pt-f1') && !(await tabela('Placas')).some(r => r.id === 'ABC1D23'), 'nada desses módulos foi gravado na planilha');
  const tem = async (aba, id) => (await tabela(aba)).some(r => r.id === id);
  ok(await tem('Levantamentos', 'pt-g1') && await tem('Colheitas', 'pt-c1') && await tem('Propriedades', 'pt-r1') && await tem('Pessoas', '52998224725'), 'PCE liberado: levantamento, termo, propriedade e pessoa gravados');

  // actions do TF recusadas
  for (const [acao, corpo] of [['tfProximoNumero', { barreira: 'BVA-CEASA', ano: ANO }], ['tfEmitir', { tf: { ...tf, id: 'pt-f2' }, pessoa }], ['tfConsultar', { doc: '52998224725' }],
    ['tfAndamento', { estado: 'preenchendo', rascunhoId: 'r1' }]]) {
    d = await post({ action: acao, key: A.token, ...corpo });
    ok(!d.ok && /Sem autorização para o módulo TF de Barreira/.test(d.erro) && semRevogado(d.erro) && d.semPermissao === 'tf' && d.permissoes && d.permissoes.tf === 0,
      acao + ' recusado (mensagem clara, sem "revogado"/"inválido")', d.erro);
  }
  ok(!(await tabela('TFs')).some(r => r.id === 'pt-f2'), 'tfEmitir recusado não gravou o TF');
  d = await post({ action: 'pceProximoNumero', key: A.token, unidade: 'MANAUS', ano: ANO }); ok(d.ok, 'PCE liberado: pceProximoNumero responde');

  // PCE desligado, TF ligado (de novo)
  d = await U.permissoes(ANA, U.lista({ veiculos: 1, tf: 1, pce: 0 }));
  ok(d.ok && await permAtivas(ANA) === 'campo,fiscalizacaoDeTransito,termoDeBarreira' && (await tabela('PermissoesDosUsuarios')).filter(p => p.usuarioId === ANA && !p.revogadaEm).length === 3,
    'gerência liga fiscalização + TF: uma linha ativa por permissão (sem duplicar)');
  const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  for (const [acao, corpo] of [['pceProximoNumero', { unidade: 'MANAUS', ano: ANO }], ['pceEmitir', { colheita: { ...col, id: 'pt-c2', numero: 5 } }], ['pceConsultar', { doc: '52998224725' }],
    ['arquivoEnviar', { arquivo: { id: '0b9f6a2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', dono: 'levantamentos', donoId: 'pt-g1', tipo: 'foto', papel: '', mime: 'image/jpeg' }, base64: JPG }]]) {
    d = await post({ action: acao, key: A.token, ...corpo });
    ok(!d.ok && /Sem autorização para o módulo PCE/.test(d.erro) && semRevogado(d.erro) && d.semPermissao === 'pce', acao + ' recusado com pce=0', d.erro);
  }
  ok(!(await tem('Colheitas', 'pt-c2')) && !(await tabela('Arquivos')).some(r => r.id === '0b9f6a2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'), 'nada do PCE gravado');
  const lev2 = { ...lev, id: 'pt-g2' }, pes2 = { ...pessoa, id: '11144477735' };
  d = await post({ action: 'sync', key: A.token, since: 0, levantamentos: [lev2], pessoas: [pes2], turnos: [turno], veiculos: [veic] });
  ok(MODS(d.recusados) === MODS({ levantamentos: ['pt-g2'] }), 'pce=0: levantamento recusado; pessoa aceita (TF liberado); turno/veículo aceitos', d.recusados);
  ok(!(await tem('Levantamentos', 'pt-g2')) && await tem('Pessoas', '11144477735') && await tem('Turnos', 'pt-t1') && await tem('Veiculos', 'pt-v1'), 'planilha confere');
  d = await post({ action: 'tfProximoNumero', key: A.token, barreira: 'BVA-CEASA', ano: ANO }); ok(d.ok, 'TF liberado: tfProximoNumero responde');

  // só fiscalização: pessoas (TF/PCE) recusadas
  await U.permissoes(ANA, U.lista({ veiculos: 1 }));
  d = await post({ action: 'sync', key: A.token, since: 0, pessoas: [{ ...pessoa, id: '39053344705' }] });
  ok(MODS(d.recusados) === MODS({ pessoas: ['39053344705'] }) && !(await tem('Pessoas', '39053344705')), 'só fiscalização: pessoa recusada (nem TF nem PCE liberados)', d.recusados);

  // tudo liberado de novo: os recusados sobem no reenvio
  await U.permissoes(ANA, U.lista({ veiculos: 1, tf: 1, pce: 1, antigo: 0 }));
  d = await post({ action: 'sync', key: A.token, since: 0, ...tudo, levantamentos: [lev, lev2] });
  ok(MODS(d.recusados) === '{}' && await tem('TFs', 'pt-f1') && await tem('Placas', 'ABC1D23') && await tem('Levantamentos', 'pt-g2'), 'liberado de novo: o que foi recusado é gravado no reenvio', d.recusados);

  // conta nova: os módulos saem já no login (o app recebe no entrar)
  const B = await U.fiscal('Bruno Modulo Costa', { permissoes: U.lista({ veiculos: 1 }) });
  d = await post({ action: 'sync', key: B.token, since: 0 });
  ok(MODS(d.permissoes) === '{"veiculos":1,"tf":0,"pce":0,"antigo":0}' && MODS(B.modulos) === '{"veiculos":1,"tf":0,"pce":0,"antigo":0}', 'conta criada só com fiscalização: entrar e sync trazem só esse módulo', d.permissoes);
  d = await post({ action: 'usuarioCriar', key: GT, nome: 'Sem Permissao Ficticio', permissoes: [] });
  ok(!d.ok && /pelo menos uma permissão/.test(d.erro) && (await tabela('Usuarios')).every(u => u.nome !== 'Sem Permissao Ficticio'), 'criar conta sem nenhuma permissão: recusado e nada criado', d.erro);

  // 4ª permissão "digitarDoPapel": padrão desligado, exige pce, não é módulo sozinha
  console.log('1b. Permissão "Digitar do papel" (digitarDoPapel)');
  d = await U.permissoes(ANA, U.lista({ veiculos: 1, tf: 1, pce: 1, antigo: 0 }));
  d = await post({ action: 'sync', key: A.token, since: 0 }); ok(d.permissoes.antigo === 0, 'digitarDoPapel desligado por padrão', d.permissoes);
  d = await post({ action: 'usuarioPermissoes', key: GT, usuarioId: ANA, permissoes: ['campo', 'fiscalizacaoDeTransito', 'digitarDoPapel'] });
  ok(!d.ok && /PCE/.test(d.erro) && await permAtivas(ANA) === 'campo,fiscalizacaoDeTransito,pce,termoDeBarreira', '"Digitar do papel" sem PCE: recusado com mensagem clara (nada gravado)', d.erro);
  d = await post({ action: 'usuarioPermissoes', key: GT, usuarioId: ANA, permissoes: ['digitarDoPapel'] });
  ok(!d.ok && /só vale com o módulo PCE/.test(d.erro), '"Digitar do papel" sozinha não vale', d.erro);
  d = await U.permissoes(ANA, ['campo', 'pce', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'digitarDoPapel']);
  ok(d.ok && d.permissoes.includes('pce') && d.permissoes.includes('digitarDoPapel'), 'PCE + Digitar do papel: gravado', d.permissoes);
  d = await post({ action: 'sync', key: A.token, since: 0 }); ok(d.permissoes.antigo === 1, 'sync devolve antigo=1', d.permissoes);
  d = await post({ action: 'usuariosListar', key: GT }); ok(d.usuarios.find(u => u.id === ANA).permissoes.includes('digitarDoPapel'), 'usuariosListar traz digitarDoPapel');
  d = await U.permissoes(ANA, ['campo', 'pce', 'fiscalizacaoDeTransito', 'termoDeBarreira']);
  d = await post({ action: 'usuarioPermissoes', key: GT, usuarioId: ANA, permissoes: ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'digitarDoPapel'] });
  ok(!d.ok && /PCE/.test(d.erro) && await permAtivas(ANA).then(s => s.includes('pce')), 'tirar o PCE com "Digitar do papel" marcada: recusado (a tela desmarca as duas juntas)', d.erro);
  d = await U.permissoes(ANA, ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira']);
  d = await post({ action: 'sync', key: A.token, since: 0 });
  ok(MODS(d.permissoes) === '{"veiculos":1,"tf":1,"pce":0,"antigo":0}' && await permAtivas(ANA) === 'campo,fiscalizacaoDeTransito,termoDeBarreira', 'PCE tirado: "Digitar do papel" sai junto (sem linha ativa)', d.permissoes);
  await U.permissoes(ANA, ['campo', 'pce', 'fiscalizacaoDeTransito', 'termoDeBarreira']);
  d = await post({ action: 'sync', key: A.token, since: 0 }); ok(d.permissoes.antigo === 0 && d.permissoes.pce === 1, 'sem Digitar do papel: antigo = 0', d.permissoes);
  const lv = { id: 'pt-ant1', data: hoje, hora: '08:00', doc: '52998224725', nome: 'PAPEL', municipio: 'Manaus', culturas: '[]', fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: ag, atualizadoEm: ag, registroAntigo: 1 };
  const lvn = { ...lv, id: 'pt-ant2', registroAntigo: 0 };
  d = await post({ action: 'sync', key: A.token, since: 0, levantamentos: [lv, lvn] });
  ok(MODS(d.recusados) === '{"levantamentos":["pt-ant1"]}' && !(await tem('Levantamentos', 'pt-ant1')) && await tem('Levantamentos', 'pt-ant2'), 'sync: só o registro antigo é recusado; o normal do mesmo lote entra', d.recusados);
  d = await post({ action: 'pceEmitir', key: A.token, colheita: { id: 'pt-ant-c1', unidade: 'MANAUS', ano: ANO, numero: 77, registroAntigo: 1, data: hoje } });
  ok(!d.ok && /Sem autorização para digitar registros antigos \(do papel\)\. Fale com a gerência\./.test(d.erro) && semRevogado(d.erro) && d.semPermissao === 'antigo', 'pceEmitir de termo antigo recusado', d.erro);
  d = await post({ action: 'arquivoEnviar', key: A.token, arquivo: { id: require('crypto').randomUUID(), dono: 'levantamentos', donoId: 'pt-ant2', tipo: 'documento', papel: '', mime: 'application/pdf' }, base64: Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64') });
  ok(!d.ok && /registros antigos/.test(d.erro) && semRevogado(d.erro) && d.semPermissao === 'antigo', 'arquivoEnviar de PDF recusado', d.erro);
  await U.permissoes(ANA, ['campo', 'pce', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'digitarDoPapel']);
  d = await post({ action: 'sync', key: A.token, since: 0, levantamentos: [lv] });
  ok(MODS(d.recusados) === '{}' && await tem('Levantamentos', 'pt-ant1'), 'com a permissão: registro antigo gravado', d.recusados);
  d = await post({ action: 'usuarioCriar', key: GT, nome: 'Estagiario Papel Silva', permissoes: ['digitarDoPapel'] });
  ok(!d.ok && /só vale com o módulo PCE/.test(d.erro) && (await tabela('Usuarios')).every(u => u.nome !== 'Estagiario Papel Silva'), 'criar conta só com "Digitar do papel": recusado e nada criado', d.erro);
  const E = await U.fiscal('Estagiario Papel Silva', { permissoes: ['campo', 'pce', 'digitarDoPapel'] });
  ok(MODS(E.modulos) === '{"veiculos":0,"tf":0,"pce":1,"antigo":1}', 'conta com PCE + Digitar do papel: módulos no login', E.modulos);
  // a aba Permissoes (planilha antiga) não é mais gravada
  ok(!(await get('/__aba?nome=Permissoes')), 'nada gravado na aba Permissoes (histórico): a permissão está em PermissoesDosUsuarios');

  /* ================= navegador ================= */
  const b = await amb.lancar();
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const erros = [];
  const vigiar = (p, rotulo) => {
    p.on('pageerror', e => erros.push(rotulo + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) erros.push(rotulo + ': ' + m.text()); });
    p.dialogos = []; p.on('dialog', dg => { p.dialogos.push(dg.message()); dg.accept(); });
  };

  console.log('2. Painel (aba Usuários)');
  const G = await U.fiscal('Gestora Permissoes Teste', { permissoes: ['painel', 'gerencia'], aplicativo: 'painel' });
  const cp = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block' });
  await cp.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await cp.addInitScript(() => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', 1); localStorage.setItem('gdv.url', window.__GDV_API); } });
  const p = await cp.newPage(); vigiar(p, 'painel');
  await p.goto(PAINEL);
  await p.fill('#pn-matricula', G.matricula); await p.fill('#pn-senha', G.senha); await p.click('#pn-entrar-senha');
  await p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 });
  await p.click('.pn-aba[data-aba=usuarios]'); await p.waitForSelector('#pn-us-lista table', { timeout: 15000 });
  const th = await p.$$eval('#pn-us-lista th', t => t.map(x => x.textContent));
  ok(th.includes('Permissões'), 'coluna "Permissões" na tabela de usuários', th);
  const linhaDe = nome => p.locator('#pn-us-lista tr', { hasText: nome });
  const marcadas = () => p.$$eval('#pn-us-form input[data-perm]', is => is.filter(i => i.checked).map(i => i.dataset.perm).sort().join());
  const salvo = async txt => { await p.waitForFunction(t => (document.querySelector('#pn-us-form [data-msg=form]') || {}).textContent?.includes(t), txt, { timeout: 8000 }); };
  const abrirPermissoes = async nome => {
    await linhaDe(nome).locator('button[data-us=permissoes]').click();
    await p.waitForFunction(n => /Permissões de/.test(document.querySelector('#pn-us-form-tit').textContent) && document.querySelector('#pn-us-form-tit').textContent.includes(n), nome, { timeout: 8000 });
  };
  const msgForm = () => p.textContent('#pn-us-form [data-msg=form]');

  
  await p.waitForFunction(() => [...document.querySelectorAll('#pn-us-lista tr')].some(r => r.textContent.includes('Bruno Modulo Costa')), null, { timeout: 8000 });
  ok(/Fiscalização de trânsito/.test(await linhaDe('Bruno Modulo Costa').textContent()) && !/PCE/.test(await linhaDe('Bruno Modulo Costa').textContent()), 'lista: permissões de Bruno (só fiscalização)', await linhaDe('Bruno Modulo Costa').textContent());

  // editar: as caixas refletem a conta; salvar grava na planilha
  await abrirPermissoes('Bruno Modulo Costa');
  ok(await p.isDisabled('#pn-us-matricula') && await p.isDisabled('#pn-us-nome'), 'edição: matrícula e nome não mudam');
  ok(await marcadas() === 'campo,fiscalizacaoDeTransito', 'caixas refletem as permissões gravadas', await marcadas());
  await p.check('#pn-us-perm-termoDeBarreira'); await p.click('#pn-us-salvar'); await salvo('salvas');
  ok(await permAtivas(B.usuario.id) === 'campo,fiscalizacaoDeTransito,termoDeBarreira', 'planilha: TF liberado para Bruno', await permAtivas(B.usuario.id));

  // "Digitar do papel" amarrado ao PCE
  await abrirPermissoes('Bruno Modulo Costa');
  await p.check('#pn-us-perm-digitarDoPapel');
  ok(await p.isChecked('#pn-us-perm-pce'), 'marcar "Digitar do papel" marca o PCE');
  await p.uncheck('#pn-us-perm-pce');
  ok(!(await p.isChecked('#pn-us-perm-digitarDoPapel')), 'desmarcar o PCE desmarca "Digitar do papel"');
  await p.check('#pn-us-perm-digitarDoPapel'); await p.click('#pn-us-salvar'); await salvo('salvas');
  ok(await permAtivas(B.usuario.id) === 'campo,digitarDoPapel,fiscalizacaoDeTransito,pce,termoDeBarreira', 'planilha: PCE e Digitar do papel gravados juntos', await permAtivas(B.usuario.id));

  // nenhuma permissão: aviso no formulário, sem gravar
  await abrirPermissoes('Bruno Modulo Costa');
  await p.$$eval('#pn-us-form input[data-perm]', is => is.forEach(i => { i.checked = false; }));
  await p.click('#pn-us-salvar');
  ok(/Marque pelo menos uma permissão/.test(await msgForm()) && await permAtivas(B.usuario.id).then(s => s.includes('pce')), 'sem nenhuma permissão: aviso e nada gravado', await msgForm());

  // erro do servidor: mostra a mensagem e a conta continua editável
  await p.check('#pn-us-perm-campo');
  await p.route(amb.API + '/**', rt => rt.request().postData() && rt.request().postData().includes('usuarioPermissoes')
    ? rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, erro: 'Falha simulada na planilha.' }) }) : rt.continue());
  await p.click('#pn-us-salvar');
  await p.waitForFunction(() => /Falha simulada/.test((document.querySelector('#pn-us-form [data-msg=form]') || {}).textContent || ''), null, { timeout: 8000 });
  ok(await p.isVisible('#pn-app') && await p.isVisible('#pn-us-form'), 'erro ao salvar: a mensagem do servidor aparece e a sessão continua');
  await p.unroute(amb.API + '/**');
  await p.click('#pn-us-cancelar');
  ok(await p.isHidden('#pn-us-cancelar') && await marcadas() === '', 'cancelar: formulário volta ao modo "Novo usuário" sem marcações');

  // criar: nada marcado por padrão; "Digitar do papel" marca o PCE; matrícula gerada
  ok(await p.isEnabled('#pn-us-matricula') && await marcadas() === '', 'novo usuário: nenhuma permissão marcada por padrão');
  await p.fill('#pn-us-nome', 'Daniela Campo Nunes');
  await p.click('#pn-us-salvar');
  ok(/Marque pelo menos uma permissão/.test(await msgForm()), 'criar sem permissão: aviso no formulário', await msgForm());
  await p.check('#pn-us-perm-campo'); await p.check('#pn-us-perm-pce');
  await p.click('#pn-us-salvar');
  await p.waitForSelector('#pn-us-res:not([hidden]) #pn-us-senha-txt', { timeout: 8000 });
  ok(/^[A-HJ-NP-Za-km-z2-9]{8}$/.test(await p.textContent('#pn-us-senha-txt')) && /^GDV\d{4}$/.test(await p.textContent('#pn-us-res-mat')), 'conta criada: senha provisória e matrícula GDV#### mostradas uma vez', await p.textContent('#pn-us-res-mat'));
  const idD = await idDe('Daniela Campo Nunes');
  ok(await permAtivas(idD) === 'campo,pce', 'planilha: permissões da conta nova (campo e PCE)', await permAtivas(idD));
  ok(await marcadas() === '' && await p.inputValue('#pn-us-nome') === '', 'formulário volta ao padrão depois de criar');
  await p.click('#pn-us-fechar');

  await p.fill('#pn-us-nome', 'Elisa Papel Ramos');
  await p.check('#pn-us-perm-campo'); await p.check('#pn-us-perm-digitarDoPapel');
  ok(await p.isChecked('#pn-us-perm-pce'), 'criar com "Digitar do papel": PCE marcado junto');
  await p.click('#pn-us-salvar');
  await p.waitForFunction(() => /Elisa Papel Ramos/.test((document.querySelector('#pn-us-res:not([hidden])') || {}).textContent || ''), null, { timeout: 8000 });
  const idE = await idDe('Elisa Papel Ramos');
  ok(await permAtivas(idE) === 'campo,digitarDoPapel,pce', 'planilha: conta com PCE + Digitar do papel', await permAtivas(idE));
  await p.click('#pn-us-fechar');

  // celular
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
  const cel = await p.evaluate(() => ({ semRolagem: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    form: (() => { const f = document.querySelector('#pn-us-form'); return f.scrollWidth <= f.clientWidth + 1; })() }));
  ok(cel.semRolagem && cel.form, '390 px: sem rolagem horizontal (lista e formulário)', cel);
  await p.screenshot({ path: amb.saida('permissoes_painel_celular.png'), fullPage: true });
  await p.setViewportSize({ width: 1366, height: 900 }); await p.waitForTimeout(300);
  await p.screenshot({ path: amb.saida('permissoes_painel.png'), fullPage: true });

  const errs = [...new Set(erros)];
  ok(!errs.length, 'sem erros de console/página', errs);
  await b.close();
  console.log(falhas ? 'FALHOU=' + falhas : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('FALHOU=1', e.stack); process.exit(1); });
