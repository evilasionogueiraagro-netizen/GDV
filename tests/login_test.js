const amb = require('./lib/amb');
const crypto = require('crypto');
// Conta única com código de acesso (abas Administrativo/AdmSessoes): servidor (Code.gs real via fakegas) + app do fiscal + painel (aba Servidores) + portal.
// Um código por pessoa, sem expirar, revogável; o perfil decide o que cada um abre e a sessão vale só no app em que foi aberta.
const { API, PAINEL, APP, ORIGEM } = amb;

const hexSha = s => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const tokensConhecidos = new Set(['segredo']);
let leakHashEncontrado = false;

function checarLeak(obj) {
  const str = JSON.stringify(obj || {});
  if (str.includes('codigoHash')) {
    leakHashEncontrado = true;
    console.error('LEAK codigoHash detectado na resposta da API:', str);
  }
  for (const t of tokensConhecidos) {
    const h = hexSha(t);
    if (str.includes(h)) {
      leakHashEncontrado = true;
      console.error('LEAK hash de token detectado na resposta da API:', h, str);
    }
  }
}

const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json()).then(r => {
  if (r && r.token) tokensConhecidos.add(r.token);
  if (r && r.sessao) tokensConhecidos.add(r.sessao);
  checarLeak(r);
  return r;
});
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const erro = (j, re) => j && j.ok === false && re.test(j.erro || '');
const entrar = (codigo, escopo) => post({ action: 'entrar', codigo, escopo, aparelho: 'teste ' + escopo });

(async () => {
  console.log('1. Contas: o gerente cria, o código sai uma vez só');
  const g = await get('/__gerar?nome=' + encodeURIComponent('Gerente Legado') + '&perfil=admin');
  const LEG = (await post({ action: 'painelAtivar', codigo: g.codigo })).token;
  const criar = (key, b) => post({ action: 'painelUsuarioSalvar', key, ...b });
  ok(erro(await criar(LEG, { nome: 'Gerente Ficticio Teste', perfis: ['gerente'] }), /próprio código/), 'credencial antiga de administrador não cria gerente');
  const menu = await get('/__fn?nome=salvarUsuario_&args=' + encodeURIComponent(JSON.stringify([{ nome: 'planilha', id: '', perfis: [], conta: false, planilha: true }, { nome: 'Gerente Ficticio Teste', perfis: ['gerente'] }])));
  ok(menu.r && /^\d{6}$/.test(menu.r.codigo) && menu.r.usuario.temCodigo, 'menu da planilha cria a conta do gerente e mostra o código', menu.r && menu.r.usuario);
  const COD_G = menu.r.codigo;
  let r = await entrar(COD_G, 'painel');
  ok(r.ok && r.conta && /^[0-9a-f]{64}$/.test(r.token) && r.nome === 'Gerente Ficticio Teste', 'gerente entra no painel com o código');
  const G = r.token;
  r = await criar(G, { nome: 'Fiscal Ficticio Teste', perfis: ['fiscal'], modulos: { veiculos: 1, tf: 0, pce: 1, antigo: 0 } });
  ok(r.ok && r.novo && /^\d{6}$/.test(r.codigo), 'gerente cria o fiscal e recebe o código', r.erro);
  const COD_F = r.codigo, idFis = r.usuario.id;
  r = await criar(G, { nome: 'Administrativo Ficticio Teste', perfis: ['administrativo'] });
  const COD_A = r.codigo, idAdm = r.usuario.id;
  ok(r.ok && COD_A !== COD_F, 'administrativo criado com outro código');
  ok(erro(await criar(G, { nome: 'fiscal  FICTÍCIO teste', perfis: ['fiscal'], modulos: { veiculos: 1 } }), /Já existe uma conta/), 'nome repetido (sem acento/maiúsculas/espaços) recusado: uma pessoa, uma conta');
  ok(erro(await criar(G, { nome: 'Dev Ficticio Teste', perfis: ['dev'] }), /Só um dev/), 'gerente não cria dev');
  const linhas = JSON.stringify((await get('/__aba?nome=Administrativo')) || []);
  ok(!linhas.includes(COD_F) && !linhas.includes(COD_G) && !linhas.includes(COD_A), 'planilha: nenhum código em texto, só o hash');
  const perm = ((await get('/__aba?nome=Permissoes')) || []).find(l => l[0] === 'Fiscal Ficticio Teste');
  ok(perm && perm[1] === 1 && perm[2] === 0 && perm[3] === 1, 'módulos do fiscal gravados na aba Permissoes', perm);

  console.log('2. Controle de acesso por app');
  r = await entrar(COD_F, 'app');
  ok(r.ok && r.nome === 'Fiscal Ficticio Teste' && JSON.stringify(r.perfis) === '["fiscal"]', 'fiscal entra no app de campo');
  const F1 = r.token;
  ok((await post({ action: 'ping', key: F1 })).ok, 'token do fiscal vale no app');
  ok(erro(await entrar(COD_F, 'painel'), /não inclui o painel/), 'fiscal não entra no painel');
  ok(erro(await entrar(COD_F, 'portal'), /não inclui o Portal/), 'fiscal não entra no portal');
  ok(erro(await post({ action: 'painelDados', key: F1 }), /inválida|revogada|restrito/), 'token do app não abre o painel');
  ok(erro(await entrar(COD_A, 'app'), /não inclui o app de campo/), 'administrativo não entra no app de campo');
  r = await entrar(COD_A, 'portal');
  ok(r.ok && r.sessao === r.token, 'administrativo entra no portal (sessão = token da conta)');
  ok((await post({ action: 'admDados', sessao: r.sessao })).ok !== false, 'sessão do portal vale nas ações do portal');
  r = await criar(G, { nome: 'Gerente E Fiscal Teste', perfis: ['gerente', 'fiscal'], modulos: { veiculos: 1, tf: 1, pce: 1 } });
  const COD_GF = r.codigo;
  const tApp = (await entrar(COD_GF, 'app')).token;
  ok(erro(await post({ action: 'painelUsuarios', key: tApp }), /inválida|revogada/), 'mesmo com os dois perfis, a sessão aberta no app não abre o painel');
  ok((await post({ action: 'painelUsuarios', key: (await entrar(COD_GF, 'painel')).token })).ok, 'entrando pelo painel, abre o painel');

  console.log('3. Revogar, gerar outro código, aparelhos');
  r = await post({ action: 'painelUsuarios', key: G });
  const fis = r.usuarios.find(u => u.id === idFis);
  ok(r.ok && fis.aparelhos.length === 1 && fis.aparelhos[0].escopo === 'app' && !JSON.stringify(r).includes('codigoHash'), 'lista: aparelhos de cada conta, sem hash', fis && fis.aparelhos);
  r = await post({ action: 'painelUsuarioCodigo', key: G, id: idFis });
  ok(r.ok && /^\d{6}$/.test(r.codigo) && r.codigo !== COD_F, 'gerar outro código');
  const COD_F2 = r.codigo;
  ok(erro(await entrar(COD_F, 'app'), /./) && (await entrar(COD_F2, 'app')).ok, 'o código antigo parou de valer; o novo entra');
  ok((await post({ action: 'ping', key: F1 })).ok, 'aparelho já conectado continua (trocar o código não derruba)');
  const ap = (await post({ action: 'painelUsuarios', key: G })).usuarios.find(u => u.id === idFis).aparelhos;
  r = await post({ action: 'painelSessaoRevogar', key: G, id: ap[0].id });
  ok(r.ok && erro(await post({ action: 'ping', key: ap[0].id === ap[0].id ? F1 : '' }), /revogado|inv[aá]lido/), 'tirar um aparelho: ele perde o acesso');

  const sessoesLinhas = (await get('/__aba?nome=AdmSessoes')) || [];
  const colsSes = sessoesLinhas[0];
  const linhaSes = sessoesLinhas.slice(1).find(l => l[colsSes.indexOf('id')] === ap[0].id);
  ok(
    linhaSes &&
    linhaSes[colsSes.indexOf('revogado')] === 1 &&
    Number(linhaSes[colsSes.indexOf('revogadoEm')]) > 0 &&
    !!linhaSes[colsSes.indexOf('revogadoPor')],
    'AdmSessoes: revogado=1, revogadoEm>0 e revogadoPor preenchido após revogação',
    linhaSes
  );

  r = await criar(G, { id: idAdm, nome: 'Administrativo Ficticio Teste', perfis: ['administrativo', 'fiscal'], modulos: { veiculos: 1, tf: 0, pce: 0 } });
  ok(r.ok && r.usuario.perfis.includes('fiscal'), 'gerente altera perfil do usuário');

  r = await criar(G, { id: idFis, nome: 'Fiscal Ficticio Teste', perfis: ['fiscal'], modulos: { veiculos: 1, tf: 0, pce: 1 }, ativo: 0 });
  ok(r.ok && r.usuario.ativo === 0, 'gerente revoga o acesso do fiscal');
  ok(erro(await entrar(COD_F2, 'app'), /revogado/), 'código de conta revogada não entra');
  r = await criar(G, { id: idFis, nome: 'Fiscal Ficticio Teste', perfis: ['fiscal'], modulos: { veiculos: 1, tf: 0, pce: 1 } });
  ok(r.ok && r.usuario.ativo === 0, 'editar sem mandar "ativo" não reativa');

  const histLinhas = (await get('/__aba?nome=AdmHistorico')) || [];
  const colsH = histLinhas[0];
  const colunasEsperadas = ['em', 'admId', 'nome', 'acao', 'aba', 'registro', 'antes', 'depois'];
  ok(JSON.stringify(colsH) === JSON.stringify(colunasEsperadas), 'AdmHistorico: colunas corretas (em, admId, nome, acao, aba, registro, antes, depois)', colsH);
  const idxHAcao = colsH.indexOf('acao'), idxHReg = colsH.indexOf('registro'), idxHAdmId = colsH.indexOf('admId'), idxHEm = colsH.indexOf('em');

  const hCodigo = histLinhas.slice(1).find(l => l[idxHAcao] === 'usuario_codigo' && l[idxHReg] === idFis);
  ok(hCodigo && Number(hCodigo[idxHEm]) > 0 && !!hCodigo[idxHAdmId], 'AdmHistorico registra gerar código', hCodigo);

  const hRevogar = histLinhas.slice(1).find(l => l[idxHAcao] === 'sessao_revogar' && l[idxHReg] === ap[0].id);
  ok(hRevogar && Number(hRevogar[idxHEm]) > 0 && !!hRevogar[idxHAdmId], 'AdmHistorico registra revogar aparelho', hRevogar);

  const hPerfil = histLinhas.slice(1).find(l => l[idxHAcao] === 'usuario_editar' && l[idxHReg] === idAdm);
  ok(hPerfil && Number(hPerfil[idxHEm]) > 0 && !!hPerfil[idxHAdmId], 'AdmHistorico registra mudar perfil', hPerfil);

  const hDesativar = histLinhas.slice(1).find(l => l[idxHAcao] === 'usuario_editar' && l[idxHReg] === idFis);
  ok(hDesativar && Number(hDesativar[idxHEm]) > 0 && !!hDesativar[idxHAdmId], 'AdmHistorico registra desativar', hDesativar);

  r = await post({ action: 'sair', key: (await entrar(COD_GF, 'painel')).token });
  ok(r.ok && r.saiu === true, 'Sair encerra a sessão no servidor');

  console.log('4. Proteções');
  const idG = (await post({ action: 'painelUsuarios', key: G })).usuarios.find(u => u.nome === 'Gerente Ficticio Teste').id;
  ok(erro(await criar(G, { id: idG, nome: 'Gerente Ficticio Teste', perfis: ['gerente'], ativo: 0 }), /próprio acesso/), 'gerente não revoga a si mesmo');
  ok(erro(await criar(G, { id: idG, nome: 'Gerente Ficticio Teste', perfis: ['fiscal'], modulos: { veiculos: 1 } }), /próprio acesso/), 'gerente não tira o próprio perfil de gerente');
  ok(erro(await post({ action: 'painelUsuarioCodigo', key: LEG, id: idG }), /próprio código/), 'credencial antiga não troca o código de um gerente');
  for (let i = 0; i < 20; i++) await entrar(String(100000 + i), 'app');
  ok(erro(await entrar(COD_A, 'portal'), /Aguarde 15 minutos/), '20 códigos errados: entrada por código bloqueada por 15 min (1 milhão de combinações)');
  await fetch(API + '/__cache?del=falhas_codigo'); await fetch(API + '/__cache?del=falhas_ativacao');   // as tentativas também contam no bloqueio dos códigos antigos
  ok((await entrar(COD_A, 'portal')).ok, 'passado o bloqueio, o código certo entra');
  ok((await post({ action: 'painelUsuarios', key: LEG })).ok, 'credencial antiga do painel continua valendo');

  console.log('5. Acessos antigos: o mesmo "entrar" aceita e o painel traz para as contas');
  const velho = await get('/__gerar?nome=' + encodeURIComponent('Fiscal Antigo Teste'));
  r = await entrar(velho.codigo, 'app');
  ok(r.ok && !r.conta && r.nome === 'Fiscal Antigo Teste', 'código antigo de fiscal entra pelo mesmo "entrar" do app');
  r = await post({ action: 'painelUsuariosImportar', key: G });
  ok(r.ok && r.criados.includes('Fiscal Antigo Teste'), 'trazer os acessos antigos: cria a conta do fiscal antigo', r);
  const imp = (await post({ action: 'painelUsuarios', key: G })).usuarios.find(u => u.nome === 'Fiscal Antigo Teste');
  ok(imp && imp.temCodigo === false && imp.perfis.join() === 'fiscal', 'conta trazida sem código (o gerente gera)');
  ok((await post({ action: 'painelUsuariosImportar', key: G })).criados.length === 0, 'rodar de novo não duplica');

  ok(!leakHashEncontrado, 'nenhuma resposta da API contém codigoHash ou hash de token');

  console.log('6. Rastreabilidade: autor e edições em Turnos auditados no AdmHistorico');
  const rRast = await criar(G, { nome: 'Fiscal Rastreavel Teste', perfis: ['fiscal'], modulos: { veiculos: 1, tf: 1, pce: 1 } });
  const codRast = rRast.codigo, idRast = rRast.usuario.id;
  const tFis = (await entrar(codRast, 'app')).token;
  const idTurno = 'turno-rastreavel-' + Date.now();
  const agoraT = Date.now();
  const turnoNovo = {
    id: idTurno,
    numeroTF: 'TF-001-A-2026',
    data: '2026-10-21',
    letra: 'A',
    inicio: '08:00',
    fim: '16:00',
    fiscal: 'Fiscal Rastreavel Teste',
    local: 'CEASA',
    unidade: 'MANAUS',
    posto: 'Fixa',
    encerrado: 0,
    criadoEm: agoraT,
    atualizadoEm: agoraT
  };
  const sync1 = await post({ action: 'sync', key: tFis, turnos: [turnoNovo] });
  ok(sync1.ok, 'fiscal sincroniza turno criado');

  const turnosAba1 = (await get('/__aba?nome=Turnos')) || [];
  const colsT = turnosAba1[0];
  const idxTId = colsT.indexOf('id'), idxTUs = colsT.indexOf('usuario'), idxTUId = colsT.indexOf('usuarioId');
  const rowT1 = turnosAba1.slice(1).find(l => l[idxTId] === idTurno);
  ok(rowT1 && rowT1[idxTUs] === 'Fiscal Rastreavel Teste' && rowT1[idxTUId] === idRast, 'Turnos: usuario = nome e usuarioId = id da conta', rowT1);

  const turnoEditado = Object.assign({}, turnoNovo, {
    fim: '17:00',
    atualizadoEm: agoraT + 5000
  });
  const sync2 = await post({ action: 'sync', key: 'segredo', turnos: [turnoEditado] });
  ok(sync2.ok, 'dev com key segredo sincroniza edição no turno');

  const turnosAba2 = (await get('/__aba?nome=Turnos')) || [];
  const rowT2 = turnosAba2.slice(1).find(l => l[idxTId] === idTurno);
  ok(rowT2 && rowT2[idxTUs] === 'Fiscal Rastreavel Teste' && rowT2[idxTUId] === idRast, 'usuario/usuarioId continuam os do autor após edição por dev segredo', rowT2);

  const histAba = (await get('/__aba?nome=AdmHistorico')) || [];
  const colsHAba = histAba[0];
  const hEdicaoTurno = histAba.slice(1).find(l =>
    l[colsHAba.indexOf('acao')] === 'editar_registro' &&
    l[colsHAba.indexOf('aba')] === 'Turnos' &&
    l[colsHAba.indexOf('registro')] === idTurno
  );
  ok(hEdicaoTurno && hEdicaoTurno[colsHAba.indexOf('admId')] === 'dev-ronald' && hEdicaoTurno[colsHAba.indexOf('nome')] === 'Administrador', 'AdmHistorico ganha linha acao editar_registro aba Turnos com admId dev-ronald e nome Administrador', hEdicaoTurno);

  /* ================= telas ================= */
  const b = await amb.lancar();
  const pagina = async (url, w = 420) => {
    const c = await b.newContext({ viewport: { width: w, height: 900 } });
    await c.addInitScript(u => { localStorage.setItem('gdv.url', u); localStorage.setItem('gdv.semInstalar', '1'); }, amb.API_URL);
    const p = await c.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(url); return p;
  };
  console.log('7. App do fiscal: entrar com o código');
  r = await criar(G, { nome: 'Fiscal Campo Teste', perfis: ['fiscal'], modulos: { veiculos: 1, tf: 1, pce: 1 } });
  let p = await pagina(APP);
  await p.waitForSelector('#fAtivar', { timeout: 15000 });
  ok(await p.locator('#lUser, #lSenha').count() === 0, 'sem usuário e senha: só o código de acesso');
  await p.fill('#aCod', r.codigo); await p.click('#fAtivar button');
  await p.waitForFunction(() => !!localStorage.getItem('gdv.key') && !document.querySelector('#fAtivar'), null, { timeout: 15000 });
  ok(await p.evaluate(() => localStorage.getItem('gdv.nome')) === 'Fiscal Campo Teste', 'aparelho lembrado com o nome do fiscal');
  ok(!p.erros.length, 'app sem erros de JavaScript', p.erros);
  await p.context().close();

  console.log('8. Painel: entrar como gerente, criar conta e ver o código');
  p = await pagina(PAINEL, 1280);
  await p.waitForSelector('#pn-login-form', { timeout: 15000 });
  await p.fill('#pn-codigo', COD_G); await p.click('#pn-entrar');
  await p.waitForSelector('#pn-app:not([hidden])', { timeout: 20000 });
  await p.click('.pn-aba[data-aba=acessos]'); await p.waitForSelector('#pn-us-form');
  await p.waitForFunction(() => /Fiscal Ficticio Teste/.test(document.querySelector('#pn-us').textContent), null, { timeout: 15000 });
  ok(await p.isVisible('#pn-us-mods') && await p.locator('#pn-us-login, #pn-us-senha').count() === 0, 'formulário só com nome, perfis e módulos');
  await p.fill('#pn-us-nome', 'Fiscal Tela Teste'); await p.click('#pn-us-salvar');
  await p.waitForSelector('#pn-us-codigo', { timeout: 15000 });
  const codTela = (await p.textContent('#pn-us-codigo-num')).replace(/\D/g, '');
  ok(/^\d{6}$/.test(codTela) && (await entrar(codTela, 'app')).ok, 'conta criada pela tela: código mostrado e válido no app');
  await p.click('[data-us=fechar-codigo]');
  ok(await p.locator('#pn-us-codigo').count() === 0, '"Já enviei" esconde o código');
  ok(!p.erros.length, 'painel sem erros de JavaScript', p.erros);
  await p.context().close();

  console.log('9. Portal: entrar como administrativo');
  p = await pagina(ORIGEM + '/administrativo/', 1280);
  await p.waitForSelector('#adm-cod-form', { state: 'attached', timeout: 15000 });
  await p.evaluate(() => { const d = document.querySelector('#adm-cod-form').closest('details'); if (d) d.open = true; });
  await p.fill('#adm-codigo', COD_A); await p.click('#adm-entrar');
  await p.waitForSelector('#adm-app:not([hidden])', { timeout: 20000 });
  ok(await p.isVisible('#adm-app'), 'portal aberto para o administrativo');
  ok(!p.erros.length, 'portal sem erros de JavaScript', p.erros);
  await b.close();

  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
