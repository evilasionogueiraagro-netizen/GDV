const amb = require('./lib/amb');
// Login com matrícula e senha (apps-script/usuarios.gs, Code.gs real via fakegas), só por HTTP: primeiro gerente (gancho /__gerente = o
// mesmo criarGerente_ do menu), validação de matrícula e nome, entrar com senha provisória e troca obrigatória conferida no servidor,
// trocar senha, permissões, último gerente, nova senha provisória, desativar, sessões, limite de tentativas, sync/tfEmitir/painel/portal
// com o token novo. Os acessos antigos (código de 6 dígitos, código de administrador, ACCESS_KEY) não existem mais: a última seção
// confere que não respondem. Todos os dados são fictícios.
const crypto = require('crypto');
const { API } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const fn = (nome, ...args) => get('/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args)));
const gerente = (matricula, nome) => get('/__gerente?matricula=' + encodeURIComponent(matricula) + '&nome=' + encodeURIComponent(nome));
const aba = async nome => (await get('/__aba?nome=' + nome)) || [];
const linhasDe = async nome => { const t = await aba(nome); return t.slice(1).map(l => Object.fromEntries(t[0].map((c, i) => [c, l[i]]))); };
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 600))); if (!c) falhas++; };
const entrar = (matricula, senha, aplicativo = 'campo', extra = {}) => post({ action: 'entrar', matricula, senha, aplicativo, ...extra });
const trocar = (key, senhaAtual, senhaNova) => post({ action: 'trocarSenha', key, senhaAtual, senhaNova });
// os contadores do limite de tentativas ficam no cache (o do fakegas não expira): zera por matrícula e o total
const zerarTentativas = async (...matriculas) => {
  for (const m of matriculas) await fetch(API + '/__cache?del=falhas_usuarios_m_' + encodeURIComponent(m.toLowerCase()));
  await fetch(API + '/__cache?del=falhas_usuarios_total');
};
const SENHA = 'Senha-Boa-123';
const MSG_ENTRE = 'Entre com sua matrícula e senha.';

(async () => {
  const ANO = new Date(Date.now() - 4 * 3600e3).getUTCFullYear(), agora = Date.now(), hoje = new Date(agora - 4 * 3600e3).toISOString().slice(0, 10);
  await fn('desativarRotinasAutomaticas_');

  /* ================= 1. primeiro gerente (menu) e matrícula gerada ================= */
  console.log('1. Primeiro gerente pela função do menu; matrícula');
  let r = await get('/__aba?nome=Usuarios'); ok(r === null, 'nenhuma conta antes do primeiro gerente (aba nem existe)');
  r = await post({ action: 'usuariosListar', key: 'nada' }); ok(!r.ok, 'sem credencial não lista', r.erro);
  const G1 = await gerente('', 'Gerente Ficticio Teste');
  ok(G1.usuario && G1.usuario.matricula === 'GDV0001' && G1.usuario.nome === 'Gerente Ficticio Teste', 'matrícula gerada: GDV0001', G1);
  ok(/^[A-HJ-NP-Za-km-z2-9]{8}$/.test(G1.senhaProvisoria), 'senha provisória: 8 caracteres, alfabeto sem 0/O/1/l/I', G1.senhaProvisoria);
  ok(G1.usuario.permissoes.length === 8 && ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'pce', 'digitarDoPapel', 'painel', 'administracao', 'gerencia'].every(p => G1.usuario.permissoes.includes(p)), 'Criar gerente: todas as permissões');
  r = await gerente('', 'Segundo Gerente Ficticio'); ok(!r.usuario && /Já existe gerente ativo/.test(r.erro), 'o menu cria só o primeiro gerente: com um ativo, recusa', r);

  /* ================= 2. entrar com senha provisória; troca obrigatória conferida no servidor ================= */
  console.log('2. Entrar com a senha provisória; troca obrigatória');
  r = await entrar('GDV0001', 'errada-errada', 'painel'); ok(!r.ok && r.erro === 'Matrícula ou senha incorreta.', 'senha errada: mensagem única', r.erro);
  r = await entrar('NAOEXISTE', 'errada-errada', 'painel'); ok(!r.ok && r.erro === 'Matrícula ou senha incorreta.', 'matrícula inexistente: a mesma mensagem (não revela qual errou)', r.erro);
  r = await entrar('GDV0001', G1.senhaProvisoria, 'celular'); ok(!r.ok && /Aplicativo inválido/.test(r.erro), 'aplicativo desconhecido recusado', r.erro);
  r = await entrar('', '', 'painel'); ok(!r.ok && /Informe a matrícula e a senha/.test(r.erro), 'sem matrícula e senha: pede os dois', r.erro);
  await zerarTentativas('GDV0001', 'naoexiste');
  const E1 = await entrar('  gdv0001 ', G1.senhaProvisoria, 'painel', { aparelhoId: 'aparelho-gerente-1' });
  ok(E1.ok && /^u\.[0-9a-f]{64}$/.test(E1.token) && E1.trocarSenha === 1, 'entra com a provisória (matrícula sem diferenciar maiúscula nem espaços): trocarSenha = 1', E1);
  ok(E1.usuario.id && E1.usuario.matricula === 'GDV0001' && E1.usuario.nome === 'Gerente Ficticio Teste' && E1.permissoes.length === 8 && JSON.stringify(E1.modulos) === '{"veiculos":1,"tf":1,"pce":1,"antigo":1}',
    'resposta: usuario, permissões (lista) e módulos {veiculos,tf,pce,antigo}', E1);
  // a troca é obrigatória: o servidor recusa qualquer outra action com esta sessão
  for (const [acao, corpo] of [['sync', { since: 0 }], ['ping', {}], ['painelDados', {}], ['usuariosListar', {}], ['usuarioCriar', { nome: 'Outro Ficticio Teste', permissoes: ['campo'] }]]) {
    r = await post({ action: acao, key: E1.token, ...corpo });
    ok(!r.ok && r.trocarSenha === 1 && r.erro === 'Troque a senha provisória para continuar.', `senha provisória pendente: ${acao} recusado com trocarSenha`, r);
  }
  r = await post({ action: 'admDados', sessao: E1.token }); ok(!r.ok && r.trocarSenha === 1, 'senha provisória pendente: o portal também recusa', r);
  r = await post({ action: 'minhaSessao', key: E1.token }); ok(r.ok && r.trocarSenha === 1 && r.usuario.matricula === 'GDV0001', 'minhaSessao responde com a senha provisória pendente', r);

  /* ================= 3. trocar a senha ================= */
  console.log('3. Trocar a senha (mínimo de 8, diferente da atual)');
  const E1b = await entrar('GDV0001', G1.senhaProvisoria, 'campo');   // segunda sessão do mesmo usuário (outro aplicativo, sem aparelhoId)
  r = await trocar(E1.token, G1.senhaProvisoria, 'curta1'); ok(!r.ok && /pelo menos 8/.test(r.erro), 'senha nova com menos de 8 caracteres recusada', r.erro);
  r = await trocar(E1.token, G1.senhaProvisoria, G1.senhaProvisoria); ok(!r.ok && /diferente da atual/.test(r.erro), 'senha nova igual à atual recusada', r.erro);
  r = await trocar(E1.token, 'nao-e-a-atual', SENHA); ok(!r.ok && /senha atual não confere/.test(r.erro), 'senha atual errada recusada', r.erro);
  r = await trocar('u.' + '0'.repeat(64), G1.senhaProvisoria, SENHA); ok(!r.ok && /Sessão encerrada ou inválida/.test(r.erro), 'sessão inexistente recusada', r.erro);
  r = await trocar('token-antigo', G1.senhaProvisoria, SENHA); ok(!r.ok, 'credencial antiga não troca senha', r.erro);
  r = await trocar(E1.token, G1.senhaProvisoria, SENHA);
  ok(r.ok && r.permissoes.length === 8 && r.modulos.pce === 1, 'troca com a senha provisória como atual: ok, devolve permissões e módulos', r);
  r = await post({ action: 'ping', key: E1b.token }); ok(!r.ok && /Acesso revogado ou inválido/.test(r.erro), 'a troca encerrou as outras sessões do usuário', r.erro);
  r = await post({ action: 'minhaSessao', key: E1.token }); ok(r.ok && r.trocarSenha === 0, 'a sessão em que a troca foi feita continua valendo (trocarSenha = 0)', r);
  r = await entrar('GDV0001', G1.senhaProvisoria, 'painel'); ok(!r.ok, 'a senha provisória antiga não entra mais', r.erro);
  await zerarTentativas('GDV0001');
  const T1 = await entrar('GDV0001', SENHA, 'painel', { aparelhoId: 'aparelho-gerente-1' });
  ok(T1.ok && T1.trocarSenha === 0, 'entra com a senha nova (trocarSenha = 0)', T1);
  r = await post({ action: 'minhaSessao', key: E1.token }); ok(!r.ok, 'uma sessão por aparelho: o novo login no mesmo aparelho encerrou a anterior', r);
  const GT = T1.token;   // token do gerente GDV0001 (painel)
  let ses = await linhasDe('SessoesDosUsuarios');
  ok(ses.every(s => /^[0-9a-f]{64}$/.test(s.tokenHash)) && !JSON.stringify(ses).includes(GT) && ses.some(s => s.tokenHash === sha(GT)), 'planilha guarda só o SHA-256 do token', ses.length);
  ok(ses.filter(s => s.motivoDoEncerramento === 'senha trocada').length === 1 && ses.filter(s => s.motivoDoEncerramento === 'novo login no aparelho').length === 1 && ses.every(s => !s.encerradaEm || s.encerradaPor),
    'sessões encerradas guardam motivo e quem encerrou', ses.map(s => [s.aplicativo, s.motivoDoEncerramento, s.encerradaPor]));
  const us = await linhasDe('Usuarios'), u1 = us.find(u => u.matricula === 'GDV0001');
  const tudo = JSON.stringify(await get('/__tudo'));
  ok(/^\$2a\$04\$.{53}$/.test(u1.senhaHash) && u1.senhaSal === '' && u1.senhaProvisoria === 0 && u1.senhaAlteradaEm > 0 && !tudo.includes(SENHA) && !tudo.includes(G1.senhaProvisoria),
    'planilha: hash bcrypt (custo da propriedade SENHA_CUSTO, sal dentro do hash), nenhuma senha em claro', { hash: u1.senhaHash, sal: u1.senhaSal });
  // hash de antes do bcrypt (SHA-256 com senhaSal): não entra mais; o gerente gera senha nova
  const editarU1 = (col, v) => fetch(API + '/__editar?aba=Usuarios&col=' + col + '&valor=' + encodeURIComponent(JSON.stringify(v)) + '&onde=matricula:GDV0001');
  await editarU1('senhaHash', sha(SENHA)); await editarU1('senhaSal', 'ab'.repeat(16));
  r = await entrar('GDV0001', SENHA, 'painel'); ok(!r.ok && r.erro === 'Matrícula ou senha incorreta.', 'hash SHA-256 antigo: a senha não entra mais', r);
  await editarU1('senhaHash', u1.senhaHash); await editarU1('senhaSal', '');
  r = await entrar('GDV0001', SENHA, 'painel'); ok(r.ok, 'de volta ao bcrypt: entra', r);
  await zerarTentativas('GDV0001');
  ok(us.length === 1 && u1.criadoPor === 'planilha', 'a conta do menu: criadoPor = planilha (e o segundo gerente não foi gravado)');

  /* ================= 4. permissões, matrícula e nome ================= */
  console.log('4. Permissões (lista exata), digitarDoPapel exige pce, gerencia vale tudo; matrícula e nome');
  const cria = (nome, permissoes, extra = {}) => post({ action: 'usuarioCriar', key: GT, nome, permissoes, ...extra });
  r = await cria('Fulano Ficticio Campo', ['campo', 'pce', 'digitarDoPapel', 'inventada']); ok(!r.ok && /Permissão desconhecida: inventada/.test(r.erro), 'permissão desconhecida recusada', r.erro);
  r = await cria('Fulano Ficticio Campo', ['campo', 'digitarDoPapel']); ok(!r.ok && /só vale com o módulo PCE/.test(r.erro), 'digitarDoPapel sem pce recusado com mensagem clara', r.erro);
  r = await cria('Fulano Ficticio Campo', []); ok(!r.ok && /pelo menos uma permissão/.test(r.erro), 'sem nenhuma permissão recusado', r.erro);
  r = await cria('Fulano Ficticio Campo', 'campo'); ok(!r.ok, 'permissões que não são lista recusadas', r.erro);
  r = await cria('Fulano Ficticio Campo', ['campo'], { matricula: 'abc def' }); ok(!r.ok && /Matrícula inválida/.test(r.erro), 'usuarioCriar valida a matrícula', r.erro);
  for (const [m, motivo] of [['AB', 'curta'], ['abc def', 'com espaço'], ['abc_def', 'com símbolo'], ['A'.repeat(21), 'com mais de 20 caracteres']]) {
    r = await cria('Matricula Invalida Teste', ['campo'], { matricula: m }); ok(/Matrícula inválida/.test(r.erro), 'matrícula ' + motivo + ' recusada', r.erro);
  }
  r = await cria('Fulano 2 Numero', ['campo']); ok(/só letras/.test(r.erro), 'nome com número recusado (nomeServidor_)', r.erro);
  r = await cria('Fulano', ['campo']); ok(/nome completo/.test(r.erro), 'nome sem sobrenome recusado', r.erro);
  r = await cria('Repetido Ficticio Teste', ['campo'], { matricula: ' gdv0001 ' }); ok(/Já existe/.test(r.erro), 'matrícula repetida recusada (caixa e espaços não contam)', r.erro);
  ok((await linhasDe('Usuarios')).length === 1, 'nada foi gravado pelas tentativas recusadas');
  const PF = await cria('Fulano Ficticio Campo', ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'pce', 'digitarDoPapel'], { matricula: 'campo1' });
  ok(PF.ok && PF.usuario.matricula === 'campo1' && PF.usuario.nome === 'Fulano Ficticio Campo' && /^[A-HJ-NP-Za-km-z2-9]{8}$/.test(PF.senhaProvisoria) && !('senhaHash' in PF.usuario), 'conta de campo criada: matrícula e senha provisória (texto só nesta resposta)', PF);
  r = await cria('Outra Pessoa Ficticia', ['campo'], { matricula: ' CAMPO1 ' }); ok(!r.ok && /Já existe/.test(r.erro), 'usuarioCriar: matrícula repetida recusada (caixa e espaços)', r.erro);
  const PM = await cria('Beltrana Ficticia Modulos', ['campo', 'fiscalizacaoDeTransito'], { matricula: 'campo2' });
  const P3 = await cria('Ciclano Ficticio Termos', ['campo', 'termoDeBarreira', 'pce'], { matricula: 'campo3' });
  const PP = await cria('Painel Somente Leitura', ['painel'], { matricula: 'tv1' });
  const PA = await cria('Portal Ficticio Teste', ['administracao'], { matricula: 'portal1' });
  const PG = await cria('Gerencia Apenas Ficticia', ['gerencia'], { matricula: 'gerencia2' });
  const PS = await cria('Sem Campo Ficticio', ['painel', 'termoDeBarreira'], { matricula: 'semcampo' });
  const PX = await cria('Sem Matricula Ficticia', ['campo']);
  const PMAT = await cria('Terceiro Gerente Ficticio', ['gerencia'], { matricula: 'mat.1-ok' });
  const FA = await cria('Fiscal Aguardando Ficticio', ['campo', 'fiscalizacaoDeTransito'], { matricula: 'fiscal1' });
  ok(PM.ok && P3.ok && PP.ok && PA.ok && PG.ok && PS.ok && PX.ok && PX.usuario.matricula === 'GDV0002' && PMAT.ok && PMAT.usuario.matricula === 'mat.1-ok' && FA.ok,
    'contas criadas: módulos parciais, TV (só painel), portal, só gerencia, sem campo, conta de fiscal aguardando; sem matrícula = GDV0002', PX);
  // cada um troca a senha provisória e entra no aplicativo indicado
  const pronta = async (c, app, extra = {}) => {
    const e = await entrar(c.usuario.matricula, c.senhaProvisoria, app, extra);
    const t = await trocar(e.token, c.senhaProvisoria, SENHA);
    if (!t.ok) throw new Error('troca de ' + c.usuario.matricula + ': ' + (t.erro || e.erro));
    return entrar(c.usuario.matricula, SENHA, app, extra);
  };
  const eF = await pronta(PF, 'campo'), eM = await pronta(PM, 'campo'), e3 = await pronta(P3, 'campo'), eP = await pronta(PP, 'painel'), eA = await pronta(PA, 'administracao');
  const eG = await pronta(PG, 'campo'), eS = await pronta(PS, 'painel'), eFA = await pronta(FA, 'campo');
  ok(JSON.stringify(eF.modulos) === '{"veiculos":1,"tf":1,"pce":1,"antigo":1}' && eF.permissoes.join() === 'campo,fiscalizacaoDeTransito,termoDeBarreira,pce,digitarDoPapel',
    'mapeamento: veiculos = fiscalizacaoDeTransito, tf = termoDeBarreira, pce, antigo = digitarDoPapel', eF);
  ok(JSON.stringify(eM.modulos) === '{"veiculos":1,"tf":0,"pce":0,"antigo":0}', 'só fiscalizacaoDeTransito: {veiculos:1, tf:0, pce:0, antigo:0}', eM.modulos);
  ok(JSON.stringify(e3.modulos) === '{"veiculos":0,"tf":1,"pce":1,"antigo":0}', 'termoDeBarreira + pce sem digitarDoPapel: antigo = 0', e3.modulos);
  ok(JSON.stringify(eG.modulos) === '{"veiculos":1,"tf":1,"pce":1,"antigo":1}' && eG.permissoes.length === 8, 'gerencia vale como todas (permissões e módulos)', eG);
  r = await entrar('portal1', SENHA, 'campo'); ok(!r.ok && /não inclui o app de campo/.test(r.erro), 'conta só do portal não entra no campo', r.erro);
  r = await entrar('campo1', SENHA, 'painel'); ok(!r.ok && /não inclui o painel/.test(r.erro), 'conta de campo não entra no painel', r.erro);
  r = await entrar('gerencia2', SENHA, 'administracao'); ok(r.ok, 'gerencia entra em qualquer aplicativo');
  const L = await post({ action: 'usuariosListar', key: GT });
  const lu = m => L.usuarios.find(u => u.matricula === m);
  ok(L.ok && L.usuarios.length === 11, 'usuariosListar: as 11 contas', L.usuarios && L.usuarios.map(u => u.matricula));
  ok(lu('campo1').permissoes.join() === 'campo,fiscalizacaoDeTransito,termoDeBarreira,pce,digitarDoPapel' && lu('tv1').permissoes.join() === 'painel' && lu('campo1').senhaProvisoria === 0 && lu('campo1').ativo === 1 &&
    lu('campo1').sessoesAbertas >= 1 && lu('campo1').ultimoAcesso > 0 && lu('campo1').criadoEm > 0 && lu('GDV0002').senhaProvisoria === 1 && lu('GDV0002').sessoesAbertas === 0, 'lista com permissões, ativo, senhaProvisoria, criadoEm, ultimoAcesso e sessoesAbertas', lu('campo1'));
  ok(!JSON.stringify(L).includes('senhaHash') && !JSON.stringify(L).includes('senhaSal') && !JSON.stringify(L).includes('tokenHash'), 'a lista nunca traz hash nem sal');
  r = await post({ action: 'usuariosListar', key: eF.token }); ok(!r.ok && /só da gerência/.test(r.erro), 'conta sem gerência não lista usuários', r.erro);
  r = await post({ action: 'usuarioCriar', key: eP.token, nome: 'Intruso Ficticio Teste', permissoes: ['campo'] }); ok(!r.ok, 'conta só com painel não cria usuário', r.erro);
  // lista exata
  r = await post({ action: 'usuarioPermissoes', key: GT, usuarioId: PF.usuario.id, permissoes: ['campo', 'pce', 'digitarDoPapel', 'painel'] });
  ok(r.ok && r.permissoes.join() === 'campo,pce,digitarDoPapel,painel', 'usuarioPermissoes: lista exata devolvida', r);
  let pl = (await linhasDe('PermissoesDosUsuarios')).filter(p => p.usuarioId === PF.usuario.id);
  ok(pl.filter(p => !p.revogadaEm).map(p => p.permissao).sort().join() === 'campo,digitarDoPapel,painel,pce' && pl.filter(p => p.revogadaEm).map(p => p.permissao).sort().join() === 'fiscalizacaoDeTransito,termoDeBarreira' &&
    pl.filter(p => p.revogadaEm).every(p => p.revogadaPor === u1.id) && pl.every(p => p.concedidaPor), 'planilha: as que saíram ganham revogadaEm/revogadaPor; as novas, uma linha própria', pl.map(p => p.permissao + (p.revogadaEm ? '(rev)' : '')));
  r = await post({ action: 'usuarioPermissoes', key: GT, usuarioId: PF.usuario.id, permissoes: ['campo', 'digitarDoPapel'] }); ok(!r.ok && /só vale com o módulo PCE/.test(r.erro), 'usuarioPermissoes também recusa digitarDoPapel sem pce', r.erro);
  r = await post({ action: 'usuarioPermissoes', key: GT, usuarioId: 'nao-existe', permissoes: ['campo'] }); ok(!r.ok && /não encontrado/.test(r.erro), 'usuário inexistente', r.erro);
  r = await post({ action: 'ping', key: eF.token }); ok(r.ok, 'a permissão mudou e a sessão continua (vale na hora, sem novo login)');
  r = await post({ action: 'minhaSessao', key: eF.token }); ok(r.ok && r.modulos.tf === 0 && r.modulos.veiculos === 0 && r.permissoes.includes('painel'), 'minhaSessao já mostra as permissões novas', r);
  r = await post({ action: 'usuarioPermissoes', key: GT, usuarioId: PF.usuario.id, permissoes: ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'pce', 'digitarDoPapel'] });
  pl = (await linhasDe('PermissoesDosUsuarios')).filter(p => p.usuarioId === PF.usuario.id);
  ok(r.ok && pl.filter(p => p.permissao === 'fiscalizacaoDeTransito').length === 2 && pl.filter(p => p.permissao === 'painel' && p.revogadaEm).length === 1, 'voltar a conceder uma permissão revogada cria linha nova (a revogada fica como histórico)');

  /* ================= 5. último gerente ================= */
  console.log('5. Nunca tirar o último gerente');
  const gerentes = L.usuarios.filter(u => u.permissoes.includes('gerencia')).map(u => u.matricula).sort();
  ok(gerentes.join() === 'GDV0001,gerencia2,mat.1-ok', 'três gerentes: GDV0001 (menu), gerencia2 e mat.1-ok', gerentes);
  r = await post({ action: 'usuarioAtivar', key: GT, usuarioId: lu('mat.1-ok').id, ativo: 0 }); ok(r.ok, 'com outros gerentes ativos, desativar um é permitido');
  r = await post({ action: 'usuarioPermissoes', key: GT, usuarioId: lu('gerencia2').id, permissoes: ['campo'] }); ok(r.ok, 'tirar a gerência de gerencia2 é permitido (ainda há outros)');
  r = await post({ action: 'usuarioAtivar', key: GT, usuarioId: lu('GDV0002').id, ativo: 0 }); ok(r.ok, 'desativar uma conta comum (GDV0002) é permitido');
  r = await post({ action: 'usuarioPermissoes', key: GT, usuarioId: u1.id, permissoes: ['painel', 'campo'] }); ok(!r.ok && /último gerente/.test(r.erro), 'tirar a gerência do último gerente recusado', r.erro);
  r = await post({ action: 'usuarioAtivar', key: GT, usuarioId: u1.id, ativo: 0 }); ok(!r.ok && /último gerente/.test(r.erro), 'desativar o último gerente recusado', r.erro);
  r = await post({ action: 'usuarioAtivar', key: GT, usuarioId: u1.id, ativo: 'talvez' }); ok(!r.ok && /ativo: 1/.test(r.erro), 'ativo precisa ser 0 ou 1', r.erro);
  r = await post({ action: 'minhaSessao', key: GT }); ok(r.ok && r.permissoes.includes('gerencia'), 'o último gerente continua com a gerência e a sessão');
  r = await post({ action: 'usuarioAtivar', key: GT, usuarioId: lu('mat.1-ok').id, ativo: 1 }); ok(r.ok, 'reativar um gerente');
  r = await post({ action: 'usuarioAtivar', key: GT, usuarioId: lu('mat.1-ok').id, ativo: 1 }); ok(r.ok, 'ativar quem já está ativo: ok, sem efeito');
  r = await post({ action: 'usuarioAtivar', key: GT, usuarioId: 'nao-existe', ativo: 0 }); ok(!r.ok && /não encontrado/.test(r.erro), 'usuário inexistente');

  /* ================= 6. nova senha provisória, desativar, sessões ================= */
  console.log('6. Nova senha provisória e desativar encerram as sessões; sessoesListar e sessaoEncerrar');
  const M2 = await entrar('campo2', SENHA, 'campo', { aparelhoId: 'aparelho-segundo-02' });   // segunda sessão de campo2, em outro aparelho
  r = await post({ action: 'sessoesListar', key: GT, usuarioId: PM.usuario.id });
  ok(r.ok && r.sessoes.length >= 2 && r.sessoes.every(s => s.usuarioId === PM.usuario.id && s.nome === 'Beltrana Ficticia Modulos' && s.aplicativo === 'campo' && s.criadaEm > 0 && s.ultimoUso > 0 && 'aparelhoId' in s) &&
    r.sessoes.some(s => s.aparelhoId === 'aparelho-segundo-02') && !JSON.stringify(r).includes('tokenHash'), 'sessoesListar de um usuário: só as abertas, sem hash', r);
  r = await post({ action: 'sessoesListar', key: GT }); ok(r.ok && r.sessoes.length >= 8 && r.sessoes.every(s => !s.encerradaEm), 'sessoesListar sem filtro: todas as abertas', r.sessoes.length);
  const alvo = (await post({ action: 'sessoesListar', key: GT, usuarioId: PM.usuario.id })).sessoes.find(s => s.aparelhoId === 'aparelho-segundo-02');
  r = await post({ action: 'sessaoEncerrar', key: GT, sessaoId: 'nao-existe' }); ok(!r.ok && /não encontrada/.test(r.erro), 'sessaoEncerrar: sessão inexistente', r.erro);
  r = await post({ action: 'sessaoEncerrar', key: eM.token, sessaoId: alvo.id }); ok(!r.ok, 'sem gerência não encerra sessão de ninguém', r.erro);
  r = await post({ action: 'sessaoEncerrar', key: GT, sessaoId: alvo.id }); ok(r.ok, 'sessaoEncerrar');
  r = await post({ action: 'ping', key: M2.token }); ok(!r.ok && /Acesso revogado ou inválido/.test(r.erro), 'a sessão encerrada deixa de valer na hora', r.erro);
  r = await post({ action: 'ping', key: eM.token }); ok(r.ok, 'a outra sessão do usuário continua');
  r = await post({ action: 'sessaoEncerrar', key: GT, sessaoId: alvo.id }); ok(r.ok, 'encerrar de novo: ok, sem efeito');
  ses = await linhasDe('SessoesDosUsuarios');
  ok(ses.find(s => s.id === alvo.id).motivoDoEncerramento === 'encerrada pela gerência' && ses.find(s => s.id === alvo.id).encerradaPor === u1.id, 'sessão encerrada pela gerência: motivo e quem');
  // nova senha provisória
  const M3 = await entrar('campo2', SENHA, 'campo', { aparelhoId: 'aparelho-terceiro-3' });
  r = await post({ action: 'usuarioNovaSenha', key: eM.token, usuarioId: PM.usuario.id }); ok(!r.ok, 'sem gerência não gera senha', r.erro);
  r = await post({ action: 'usuarioNovaSenha', key: GT, usuarioId: 'nao-existe' }); ok(!r.ok && /não encontrado/.test(r.erro), 'usuarioNovaSenha: usuário inexistente', r.erro);
  const NS = await post({ action: 'usuarioNovaSenha', key: GT, usuarioId: PM.usuario.id });
  ok(NS.ok && /^[A-HJ-NP-Za-km-z2-9]{8}$/.test(NS.senhaProvisoria) && NS.senhaProvisoria !== PM.senhaProvisoria, 'usuarioNovaSenha devolve a senha provisória (uma vez)', NS);
  r = await post({ action: 'ping', key: eM.token }); const r2 = await post({ action: 'ping', key: M3.token });
  ok(!r.ok && !r2.ok, 'a nova senha provisória encerrou todas as sessões do usuário');
  await zerarTentativas('campo2');
  r = await entrar('campo2', SENHA, 'campo'); ok(!r.ok && /Matrícula ou senha incorreta/.test(r.erro), 'a senha antiga deixou de valer', r.erro);
  const M4 = await entrar('campo2', NS.senhaProvisoria, 'campo'); ok(M4.ok && M4.trocarSenha === 1, 'entra com a nova provisória e a troca é obrigatória', M4);
  r = await post({ action: 'sync', key: M4.token, since: 0 }); ok(!r.ok && r.trocarSenha === 1, 'enquanto não troca, nada funciona');
  r = await trocar(M4.token, NS.senhaProvisoria, SENHA); ok(r.ok, 'troca a senha');
  const eM2 = await entrar('campo2', SENHA, 'campo'); ok(eM2.ok && eM2.trocarSenha === 0, 'volta a entrar normalmente');
  // menu "Redefinir senha de gerente": vale para gerente (matrícula sem diferenciar caixa); não vale para conta comum
  r = await fn('novaSenhaGerente_', 'MAT.1-OK'); ok(r.r && r.r.usuario.matricula === 'mat.1-ok' && /^[A-HJ-NP-Za-km-z2-9]{8}$/.test(r.r.senhaProvisoria), 'menu Redefinir senha de gerente: vale para gerente (matrícula sem diferenciar caixa)', r);
  r = await fn('novaSenhaGerente_', 'naoexiste'); ok(r.erro && /não é de um gerente ativo/.test(r.erro), 'menu: matrícula que não é de gerente ativo', r.erro);
  r = await fn('novaSenhaGerente_', '  '); ok(r.erro && /Informe a matrícula/.test(r.erro), 'menu: matrícula vazia', r.erro);
  // desativar
  const TV = eP.token;
  r = await post({ action: 'painelDados', key: TV, de: hoje, ate: hoje }); ok(r.ok, 'painel (só painel) lê antes de ser desativado');
  r = await post({ action: 'usuarioAtivar', key: eP.token, usuarioId: PP.usuario.id, ativo: 0 }); ok(!r.ok, 'sem gerência não desativa', r.erro);
  r = await post({ action: 'usuarioAtivar', key: GT, usuarioId: PP.usuario.id, ativo: 0 }); ok(r.ok, 'usuarioAtivar ativo = 0');
  r = await post({ action: 'painelDados', key: TV, de: hoje, ate: hoje }); ok(!r.ok && /Sessão do painel inválida ou revogada/.test(r.erro), 'desativar encerrou as sessões na hora', r.erro);
  ses = await linhasDe('SessoesDosUsuarios');
  ok(ses.filter(s => s.usuarioId === PP.usuario.id).every(s => s.encerradaEm && s.motivoDoEncerramento === 'conta desativada' && s.encerradaPor === u1.id), 'planilha: sessões da conta desativada com motivo e quem');
  r = await entrar('tv1', 'senha-errada-x', 'painel'); ok(!r.ok && r.erro === 'Matrícula ou senha incorreta.', 'conta desativada com senha errada: mensagem única');
  r = await entrar('tv1', SENHA, 'painel'); ok(!r.ok && /Acesso desativado/.test(r.erro), 'conta desativada com a senha certa: avisa que está desativada', r.erro);
  r = await post({ action: 'usuarioAtivar', key: GT, usuarioId: PP.usuario.id, ativo: 1 }); ok(r.ok, 'reativar');
  const eP2 = await entrar('tv1', SENHA, 'painel'); ok(eP2.ok && eP2.trocarSenha === 0, 'a conta reativada entra com a mesma senha');
  await zerarTentativas('tv1');

  /* ================= 7. limite de tentativas ================= */
  console.log('7. Limite de tentativas');
  for (let i = 0; i < 9; i++) await entrar('campo3', 'errada-' + i, 'campo');
  r = await entrar('campo3', SENHA, 'campo'); ok(r.ok, '9 erros e depois a senha certa: entra');
  for (let i = 0; i < 9; i++) await entrar('campo3', 'errada-' + i, 'campo');
  r = await entrar('campo3', SENHA, 'campo'); ok(r.ok, 'senha certa zera o contador da matrícula (mais 9 erros não bloqueiam)');
  for (let i = 0; i < 10; i++) { r = await entrar('campo3', 'errada-' + i, 'campo'); if (r.erro !== 'Matrícula ou senha incorreta.') ok(false, 'erro ' + i + ' com mensagem diferente', r.erro); }
  r = await entrar('campo3', SENHA, 'campo'); ok(!r.ok && /Muitas tentativas/.test(r.erro) && /15 minutos/.test(r.erro), '10 erros bloqueiam a matrícula: até a senha certa é recusada', r.erro);
  r = await entrar('CAMPO3', SENHA, 'campo'); ok(!r.ok && /Muitas tentativas/.test(r.erro), 'o bloqueio vale para a matrícula sem diferenciar a caixa');
  r = await entrar('campo2', SENHA, 'campo'); ok(r.ok, 'outra matrícula não é afetada');
  r = await entrar('naoexiste-9', 'x1234567', 'campo'); ok(r.erro === 'Matrícula ou senha incorreta.', 'matrícula inexistente conta e responde igual');
  await zerarTentativas('campo3', 'naoexiste-9');
  r = await entrar('campo3', SENHA, 'campo'); ok(r.ok, 'passados os 15 minutos (contador zerado) entra de novo');
  // trocar senha também conta (token roubado não adivinha a senha atual)
  for (let i = 0; i < 10; i++) await trocar(r.token, 'errada-' + i, 'Nova-Senha-123');
  const bloq = await trocar(r.token, SENHA, 'Nova-Senha-123'); ok(!bloq.ok && /Muitas tentativas/.test(bloq.erro), 'trocarSenha com senha atual errada 10 vezes bloqueia a matrícula', bloq.erro);
  await zerarTentativas('campo3');
  // limite geral
  for (let i = 0; i < 50; i++) await entrar('inexistente-' + i, 'x1234567', 'campo');
  r = await entrar('campo2', SENHA, 'campo'); ok(!r.ok && /Muitas tentativas/.test(r.erro), '50 erros no total bloqueiam todas as matrículas', r.erro);
  await zerarTentativas();
  r = await entrar('campo2', SENHA, 'campo'); ok(r.ok, 'sem o bloqueio geral, entra');

  /* ================= 8. app de campo: sync e tfEmitir com o token novo ================= */
  console.log('8. sync e tfEmitir com token novo (permissão campo e módulos)');
  const PG3 = await cria('Gerencia Tres Ficticia', ['gerencia'], { matricula: 'gerencia3' }), eG3 = await pronta(PG3, 'campo');
  const tokF = (await entrar('campo1', SENHA, 'campo', { aparelhoId: 'aparelho-campo-001' })).token;
  const tokM = (await entrar('campo2', SENHA, 'campo', { aparelhoId: 'aparelho-campo-002' })).token;
  const tok3 = (await entrar('campo3', SENHA, 'campo', { aparelhoId: 'aparelho-campo-003' })).token;
  const turno = id => ({ id, numeroTF: 'TF-' + id, data: hoje, letra: 'A', inicio: '06:00', fim: '', fiscal: 'x', local: 'BR-319 PORTO DA CEASA', unidade: 'MANAUS', posto: 'Fixa', encerrado: 0, criadoEm: agora, atualizadoEm: agora });
  const veic = (id, t) => ({ id, turnoId: t, hora: '06:10', placa: 'ABC1D23', tipo: 'PA', pessoas: 1, obs: '', excluido: 0, criadoEm: agora, atualizadoEm: agora });
  const TF = (id, numero, extra = {}) => ({ id, barreira: 'BVA-CEASA', ano: ANO, numero, numeroTxt: String(numero).padStart(4, '0') + '/' + ANO + ' - BVA - CEASA', data: hoje, hora: '09:00', fiscal: 'x', local: 'BR-319 PORTO DA CEASA', placa: 'ABC1D23',
    doc: '52998224725', nome: 'FULANO FICTICIO TESTE', procedimento: 'apreensao', constatacao: 'x', produtos: '["MANGA - 10 Kg"]', cancelado: 0, conflito: 0, numeroSugerido: numero, numeroOrigem: 'sistema', criadoEm: agora + numero, atualizadoEm: agora + numero, ...extra });
  const LEV = id => ({ id, data: hoje, hora: '08:00', servidor: 'Fulano', doc: '52998224725', nome: 'FULANO FICTICIO TESTE', municipio: 'MANAUS', culturas: '[]', fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: agora, atualizadoEm: agora });
  r = await post({ action: 'sync', key: tokF, since: 0, turnos: [turno('lg-t1')], veiculos: [veic('lg-v1', 'lg-t1')], tfs: [TF('lg-f1', 1)], levantamentos: [LEV('lg-l1')],
    aparelho: { id: 'aparelho-campo-001', versao: 'teste', plataforma: 'android', online: true, standalone: true } });
  ok(r.ok && JSON.stringify(r.permissoes) === '{"veiculos":1,"tf":1,"pce":1,"antigo":1}' && JSON.stringify(r.recusados) === '{}' && r.turnos.length === 1 && r.turnos[0].usuario === 'Fulano Ficticio Campo', 'sync com todos os módulos: grava tudo, devolve as permissões no formato do app e registra o usuário', { p: r.permissoes, rec: r.recusados });
  r = await post({ action: 'sync', key: tokM, since: 0, turnos: [turno('lg-t2')], veiculos: [veic('lg-v2', 'lg-t2')], tfs: [TF('lg-f2', 2)], levantamentos: [LEV('lg-l2')] });
  ok(r.ok && JSON.stringify(r.permissoes) === '{"veiculos":1,"tf":0,"pce":0,"antigo":0}' && r.recusados.tfs[0] === 'lg-f2' && r.recusados.levantamentos[0] === 'lg-l2' && !r.recusados.turnos && r.turnos.length === 1 && r.turnos[0].id === 'lg-t2',
    'sync de quem só tem fiscalizacaoDeTransito: turno e veículo entram; TF e levantamento voltam em recusados; só recebe os próprios', { p: r.permissoes, rec: r.recusados });
  ok(!(await fn('lerLeitura_', 'TFs')).r.some(t => t.id === 'lg-f2') && !(await fn('lerLeitura_', 'Levantamentos')).r.some(t => t.id === 'lg-l2'), 'os registros recusados não foram gravados na planilha');
  r = await post({ action: 'tfEmitir', key: tokM, tf: TF('lg-f3', 3) }); ok(!r.ok && r.semPermissao === 'tf' && r.permissoes.tf === 0 && /Sem autorização para o módulo/.test(r.erro), 'tfEmitir sem termoDeBarreira: semPermissao = tf', r);
  r = await post({ action: 'pceProximoNumero', key: tokM, unidade: 'MANAUS', ano: ANO }); ok(!r.ok && r.semPermissao === 'pce', 'action do PCE sem o módulo pce: semPermissao = pce', r.erro);
  r = await post({ action: 'tfEmitir', key: tokF, tf: TF('lg-f3', 3) }); ok(r.emitido === true && r.numero === 3, 'tfEmitir com termoDeBarreira emite', r);
  r = await post({ action: 'tfProximoNumero', key: tokF, barreira: 'BVA-CEASA', ano: ANO }); ok(r.ok && r.proximo === 4, 'tfProximoNumero com o token novo', r);
  r = await post({ action: 'tfEmitir', key: tok3, tf: TF('lg-f4', 4, { registroAntigo: 1 }) }); ok(!r.ok && r.semPermissao === 'antigo', 'TF do papel sem digitarDoPapel: recusado (semPermissao = antigo)', r);
  r = await post({ action: 'tfEmitir', key: tokF, tf: TF('lg-f4', 4, { registroAntigo: 1 }) }); ok(r.emitido === true, 'TF do papel com digitarDoPapel (e pce): emitido', r);
  r = await post({ action: 'sync', key: tok3, since: 0, tfs: [TF('lg-f5', 5, { registroAntigo: 1 }), TF('lg-f6', 6)] });
  ok(r.ok && r.recusados.tfs.length === 1 && r.recusados.tfs[0] === 'lg-f5' && r.tfs.some(t => t.id === 'lg-f6'), 'sync: registro antigo sem digitarDoPapel volta em recusados; o normal do mesmo lote entra', r.recusados);
  r = await post({ action: 'sync', key: eS.token, since: 0 }); ok(!r.ok && /não inclui o app de campo/.test(r.erro), 'quem não tem a permissão campo não sincroniza (mesmo com módulos)', r.erro);
  r = await post({ action: 'tfEmitir', key: eS.token, tf: TF('lg-f7', 7) }); ok(!r.ok && /não inclui o app de campo/.test(r.erro), 'nem emite TF', r.erro);
  r = await post({ action: 'sync', key: eG3.token, since: 0 }); ok(r.ok && r.permissoes.antigo === 1, 'gerencia sincroniza com tudo liberado', r.permissoes);
  const ap = (await linhasDe('Aparelhos')).find(a => a.id === 'aparelho-campo-001');
  ok(ap && ap.usuario === 'Fulano Ficticio Campo' && ap.cred === 'u.' + sha(tokF).slice(0, 6) && ap.cred !== tokF.slice(0, 8), 'Aparelhos.cred não guarda o início do token (só parte do SHA-256)', ap && ap.cred);
  // ultimoUso: grava no máximo uma vez a cada 5 minutos por sessão
  const hashF = sha(tokF), usoDe = async () => (await linhasDe('SessoesDosUsuarios')).find(s => s.tokenHash === hashF).ultimoUso;
  const uso0 = await usoDe();
  await post({ action: 'ping', key: tokF }); await post({ action: 'ping', key: tokF });
  ok(await usoDe() === uso0, 'chamadas seguidas não regravam o ultimoUso (limite de uma vez a cada 5 min)', uso0);
  await get('/__editar?aba=SessoesDosUsuarios&col=ultimoUso&valor=1&onde=tokenHash:' + hashF);
  await post({ action: 'ping', key: tokF });
  ok(await usoDe() > 1e12, 'passados 5 minutos o ultimoUso é regravado');

  /* ================= 9. painel (só leitura x gerência) e portal ================= */
  console.log('9. Painel: quem só tem painel lê e não grava; portal com administracao');
  const TVok = eP2.token;
  const leituras = [['painelDados', { de: hoje, ate: hoje }], ['painelDados', { aoVivo: true, ids: [] }], ['painelPublicoConfig', {}], ['painelConvenios', {}],
    ['painelRelGdv', { ano: ANO }], ['painelVigDados', { ano: ANO }], ['painelConvApuracao', { convenio: '991272-2025' }], ['painelRelGdvApuracao', { de: hoje, ate: hoje }]];
  for (const [a, c] of leituras) { r = await post({ action: a, key: TVok, ...c }); ok(r.ok, `painel só leitura: ${a} funciona`, r.erro); }
  // gravações do painel: só a gerência (MSG_SO_GERENCIA_)
  const escritas = [['painelEncerrarTurno', { turnoId: 'x', fim: '10:00' }], ['painelPublicoSalvar', { config: {} }], ['painelPceLaudo', { id: 'x', laboratorio: {} }],
    ['painelConvSalvar', { convenio: '991272-2025', config: {} }], ['painelRelGdvSalvar', { ano: ANO, tipo: 'mensal', mes: '09', textos: {} }], ['painelVigConfigSalvar', { config: {} }]];
  for (const [a, c] of escritas) { r = await post({ action: a, key: TVok, ...c }); ok(!r.ok && /Só a gerência pode fazer esta alteração/.test(r.erro), `painel só leitura: ${a} é recusado`, r.erro); }
  // lançamentos do convênio: só no Portal do Administrativo (MSG_PORTAL)
  for (const a of ['painelConvLancar', 'painelConvFinLancar', 'painelConvFinImportar', 'painelConvExcluir']) {
    r = await post({ action: a, key: GT, lancamento: {}, id: 'x' }); ok(!r.ok && /Portal do Administrativo/.test(r.erro), `${a}: o lançamento é do portal, não do painel`, r.erro);
  }
  r = await post({ action: 'painelEncerrarTurno', key: GT, turnoId: 'nao-existe', fim: '10:00' }); ok(!r.ok && /Turno não encontrado/.test(r.erro), 'gerência passa pela exigência (o erro é do turno inexistente)', r.erro);
  r = await post({ action: 'painelPublicoSalvar', key: GT, config: { titulo: 'Titulo Ficticio' } }); ok(r.ok && r.config.atualizadoPor === 'Gerente Ficticio Teste', 'gerência salva o dashboard público', r.erro);
  r = await post({ action: 'painelDados', key: eF.token, de: hoje, ate: hoje }); ok(!r.ok && /não inclui o painel/.test(r.erro), 'quem só tem campo não lê o painel', r.erro);
  r = await post({ action: 'painelDados', key: eFA.token, de: hoje, ate: hoje }); ok(!r.ok && /não inclui o painel/.test(r.erro), 'conta de fiscal aguardando (campo) não lê o painel', r.erro);
  r = await post({ action: 'painelDados', key: tokF, de: hoje, ate: hoje }); ok(!r.ok && /não inclui o painel/.test(r.erro), 'token de campo não vale no painel (sem a permissão painel)');
  r = await post({ action: 'painelDados', key: eG3.token, de: hoje, ate: hoje }); ok(r.ok, 'gerencia lê o painel com um token de campo (vale tudo)');
  // portal
  r = await post({ action: 'admDados', sessao: eA.token }); ok(r.ok && r.nome === 'Portal Ficticio Teste' && r.email === '' && r.expiraEm === 0, 'portal com administracao: admDados', r.erro);
  r = await post({ action: 'admRelLancar', sessao: eA.token, ano: ANO, lancamentos: [{ mes: '09', chave: 'pce.capacitacao', valor: 9 }] }); ok(r.ok, 'portal grava', r.erro);
  const rl = (await fn('lerLeitura_', 'RelGdvLancamentos')).r.find(x => x.chave === 'pce.capacitacao');
  ok(rl && rl.admId === PA.usuario.id && rl.usuario === 'Portal Ficticio Teste', 'o lançamento guarda quem lançou (admId = id do usuário)', rl);
  r = await post({ action: 'admHistorico', sessao: eA.token }); ok(r.ok && r.historico.length >= 1 && r.historico[0].nome === 'Portal Ficticio Teste', 'AdmHistorico registra o nome do usuário do portal');
  r = await post({ action: 'admDados', sessao: GT }); ok(r.ok, 'gerencia entra no portal');
  r = await post({ action: 'admDados', sessao: eP2.token }); ok(!r.ok && /não inclui o Portal do Administrativo/.test(r.erro), 'quem só tem painel não entra no portal', r.erro);
  r = await post({ action: 'admDados', sessao: tokF }); ok(!r.ok && /não inclui o Portal/.test(r.erro), 'token de campo não vale no portal', r.erro);
  r = await post({ action: 'admDados', sessao: 'u.curto' }); ok(!r.ok && /Sessão do portal encerrada/.test(r.erro), 'token malformado no portal', r.erro);
  r = await post({ action: 'painelConvenios', key: eA.token }); ok(!r.ok && /não inclui o painel/.test(r.erro), 'quem só tem administracao não lê o painel');
  r = await post({ action: 'admSair', sessao: eA.token }); ok(r.ok, 'admSair com o token novo');
  r = await post({ action: 'admDados', sessao: eA.token }); ok(!r.ok && /Sessão do portal encerrada/.test(r.erro), 'depois do admSair a sessão não vale mais', r.erro);
  r = await post({ action: 'painelSair', key: eP2.token }); ok(r.ok, 'painelSair com o token novo');
  r = await post({ action: 'painelDados', key: eP2.token, de: hoje, ate: hoje }); ok(!r.ok && /Sessão do painel inválida/.test(r.erro), 'depois do painelSair a sessão não vale mais', r.erro);
  r = await post({ action: 'sair', key: tokM }); ok(r.ok, 'sair');
  r = await post({ action: 'sync', key: tokM, since: 0 }); ok(!r.ok && /Acesso revogado ou inválido/.test(r.erro), 'depois do sair a sessão não vale mais', r.erro);
  r = await post({ action: 'sair', key: tokM }); ok(r.ok, 'sair de novo (ou com token qualquer) responde ok');
  r = await post({ action: 'sair', key: 'qualquer' }); ok(r.ok, 'sair com token que não é de sessão: ok');
  ses = await linhasDe('SessoesDosUsuarios');
  ok(ses.find(s => s.tokenHash === sha(tokM)).motivoDoEncerramento === 'sair', 'sair registra o motivo');

  /* ================= 10. acessos antigos não existem ================= */
  console.log('10. Acessos antigos (código de 6 dígitos, código de administrador, ACCESS_KEY) não existem mais');
  // as actions saíram do back: sem sessão, a resposta é a de quem não entrou; com sessão válida, "Ação inválida."
  let x = await post({ action: 'ativar', codigo: '123456' }); ok(!x.ok && x.erro === MSG_ENTRE, 'ativar (código de 6 dígitos) não existe: sem sessão, pede matrícula e senha', x.erro);
  x = await post({ action: 'painelAtivar', codigo: '123456' }); ok(!x.ok && x.erro === MSG_ENTRE, 'painelAtivar (código de administrador) não existe: sem sessão, pede matrícula e senha', x.erro);
  x = await post({ action: 'ativar', codigo: '123456', key: GT }); ok(!x.ok && x.erro === 'Ação inválida.', 'com sessão válida, ativar é ação inexistente', x.erro);
  x = await post({ action: 'painelAtivar', codigo: '123456', key: GT }); ok(!x.ok && x.erro === 'Ação inválida.', 'com sessão válida, painelAtivar é ação inexistente', x.erro);
  x = await post({ action: 'admCodigo', codigo: '123456' }); ok(!x.ok && x.erro === 'Ação inválida.', 'código do portal (admCodigo) não existe', x.erro);
  // a ACCESS_KEY ('segredo') não vale em nenhum lugar
  x = await post({ action: 'sync', key: 'segredo', since: 0 }); ok(!x.ok && /Acesso revogado ou inválido/.test(x.erro), 'ACCESS_KEY recusada no app (sync)', x.erro);
  x = await post({ action: 'painelDados', key: 'segredo', de: hoje, ate: hoje }); ok(!x.ok && /Sessão do painel inválida ou revogada/.test(x.erro), 'ACCESS_KEY recusada no painel', x.erro);
  x = await post({ action: 'usuariosListar', key: 'segredo' }); ok(!x.ok && /Sessão encerrada ou inválida/.test(x.erro), 'ACCESS_KEY recusada nas actions de gerência', x.erro);
  x = await post({ action: 'usuarioCriar', key: 'segredo', nome: 'Criada Pela Chave Teste', permissoes: ['campo'] }); ok(!x.ok && !x.usuario, 'ACCESS_KEY não cria conta', x.erro);
  x = await post({ action: 'admDados', sessao: 'segredo' }); ok(!x.ok && /Sessão do portal encerrada/.test(x.erro), 'ACCESS_KEY recusada no portal', x.erro);
  x = await post({ action: 'ping', key: GT }); ok(x.ok, 'a sessão da gerência continua valendo');

  /* ================= 11. histórico, nada sensível na planilha ================= */
  console.log('11. Histórico de alterações; nada sensível na planilha');
  const H = await linhasDe('HistoricoDeAlteracoes'), acoes = new Set(H.map(h => h.acao));
  for (const a of ['usuario.criar', 'usuario.trocarSenha', 'usuario.permissoes', 'usuario.novaSenha', 'usuario.desativar', 'usuario.ativar', 'sessao.encerrar']) {
    ok(acoes.has(a), 'histórico tem a ação ' + a);
  }
  ok(H.every(h => h.id && h.em > 1e12 && h.usuarioId && h.tabela && h.registroId), 'toda linha do histórico tem id, quando, quem, aba e registro');
  const perm = H.find(h => h.acao === 'usuario.permissoes' && h.registroId === PF.usuario.id);
  ok(perm && JSON.parse(perm.antes).permissoes.includes('fiscalizacaoDeTransito') && !JSON.parse(perm.depois).permissoes.includes('fiscalizacaoDeTransito') && perm.usuarioId === u1.id, 'permissões: antes e depois em JSON e quem mudou', perm);
  const todosUs = await linhasDe('Usuarios');
  const segredos = todosUs.flatMap(u => [u.senhaHash, u.senhaSal]).filter(Boolean).concat([SENHA, G1.senhaProvisoria, PF.senhaProvisoria, NS.senhaProvisoria]);
  const textoH = JSON.stringify(H);
  ok(segredos.every(s => s && !textoH.includes(s)), 'o histórico nunca traz hash, sal nem senha');
  const sesTudo = JSON.stringify(await linhasDe('SessoesDosUsuarios'));
  ok([GT, tokF, tokM, tok3].every(t => !sesTudo.includes(t)), 'as sessões não guardam token em claro');
  // abas novas: cabeçalhos exatamente como no contrato
  ok((await aba('Usuarios'))[0].join() === 'id,matricula,nome,senhaHash,senhaSal,senhaProvisoria,senhaAlteradaEm,ativo,criadoEm,criadoPor,atualizadoEm,atualizadoPor' &&
    (await aba('PermissoesDosUsuarios'))[0].join() === 'id,usuarioId,permissao,concedidaEm,concedidaPor,revogadaEm,revogadaPor' &&
    (await aba('SessoesDosUsuarios'))[0].join() === 'id,usuarioId,tokenHash,aplicativo,aparelhoId,criadaEm,ultimoUso,encerradaEm,encerradaPor,motivoDoEncerramento' &&
    (await aba('HistoricoDeAlteracoes'))[0].join() === 'id,em,usuarioId,acao,tabela,registroId,antes,depois', 'cabeçalhos das quatro abas novas');
  const VERSAO = (require('fs').readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8').match(/const VERSAO_CODIGO = '([^']+)'/) || [])[1];
  r = await get('/__doget?p='); ok(VERSAO && JSON.parse(r.json).versao === VERSAO, 'GET /exec mostra o VERSAO_CODIGO do Code.gs', r.json);
  console.log(falhas ? 'FALHOU=' + falhas : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
