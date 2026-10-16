const amb = require('./lib/amb');
// Login com usuário e senha (aba Usuarios/Sessoes): servidor (Code.gs real via fakegas) + app do fiscal + painel (aba Usuários) + portal.
const { API, PAINEL, APP, ORIGEM } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const erro = (j, re) => j && j.ok === false && re.test(j.erro || '');

(async () => {
  /* ================= servidor ================= */
  console.log('1. Servidor: o gerente cria os usuários');
  const g = await get('/__gerar?nome=' + encodeURIComponent('Gerente Legado') + '&perfil=admin');
  const LEG = (await post({ action: 'painelAtivar', codigo: g.codigo })).token;
  const salvar = b => post({ action: 'painelUsuarioSalvar', key: LEG, ...b });
  let r = await salvar({ login: 'Ger.Teste', nome: 'Gerente Teste Silva', perfis: ['gerente'], senha: 'provisoria1' });
  ok(r.ok && r.novo && r.usuario.login === 'ger.teste' && r.usuario.trocarSenha === 1, 'gerente (credencial antiga do painel) cria usuário; login em minúsculas; senha provisória', r.usuario || r.erro);
  const fis = await salvar({ login: 'fis.teste', nome: 'Fiscal Teste Souza', perfis: ['fiscal'], modulos: { veiculos: 1, tf: 0, pce: 1, antigo: 0 }, senha: 'provisoria2' });
  const adm = await salvar({ login: 'adm.teste', nome: 'Administrativo Teste Lima', perfis: ['administrativo'], senha: 'provisoria3' });
  ok(fis.ok && adm.ok, 'fiscal (Veículos e PCE) e administrativo criados');
  ok(erro(await salvar({ login: 'fis.teste', nome: 'Outro Fiscal Nome', perfis: ['fiscal'], modulos: { veiculos: 1 }, senha: 'provisoria9' }), /Já existe/), 'login repetido recusado');
  ok(erro(await salvar({ login: 'novo.um', nome: 'Novo Um Teste', perfis: ['fiscal'], modulos: { veiculos: 1 } }), /senha provis/), 'usuário novo sem senha recusado');
  ok(erro(await salvar({ login: 'novo.dois', nome: 'Novo Dois Teste', perfis: ['fiscal'], modulos: { veiculos: 1 }, senha: 'curta' }), /8 caracteres/), 'senha curta recusada');
  ok(erro(await salvar({ login: 'a', nome: 'Login Curto Teste', perfis: ['fiscal'], modulos: { veiculos: 1 }, senha: 'provisoria4' }), /Usuário inválido/), 'login inválido recusado');
  ok(erro(await post({ action: 'painelUsuarioSalvar', key: 'x'.repeat(64), login: 'z.z', nome: 'Z Z', perfis: ['fiscal'], senha: 'provisoria5' }), /Sess|inv/i), 'sem credencial de gerente: recusado');
  const linhas = (await get('/__aba?nome=Usuarios')) || [];
  ok(linhas.length === 4 && !JSON.stringify(linhas).includes('provisoria'), 'planilha: 3 usuários e nenhuma senha em texto puro');
  const perm = ((await get('/__aba?nome=Permissoes')) || []).find(l => l[0] === 'Fiscal Teste Souza');
  ok(perm && perm[1] === 1 && perm[2] === 0 && perm[3] === 1, 'módulos do fiscal gravados na aba Permissoes', perm);

  console.log('2. Login, senha provisória e troca');
  ok(erro(await post({ action: 'login', login: 'fis.teste', senha: 'errada123' }), /incorretos/), 'senha errada recusada');
  r = await post({ action: 'login', login: 'FIS.TESTE', senha: 'provisoria2', aparelho: 'teste' });
  ok(r.ok && /^[0-9a-f]{64}$/.test(r.token) && r.trocarSenha === true && r.nome === 'Fiscal Teste Souza' && r.perfis.join() === 'fiscal', 'login certo: token, senha provisória a trocar', r);
  const F1 = r.token;
  ok(erro(await post({ action: 'trocarSenha', key: F1, atual: 'errada', nova: 'minhasenha1' }), /atual não confere/), 'troca com a senha atual errada recusada');
  r = await post({ action: 'trocarSenha', key: F1, atual: 'provisoria2', nova: 'minhasenha1' });
  ok(r.ok, 'senha trocada');
  ok(erro(await post({ action: 'login', login: 'fis.teste', senha: 'provisoria2' }), /incorretos/) && (await post({ action: 'login', login: 'fis.teste', senha: 'minhasenha1' })).trocarSenha === false,
    'depois da troca: a provisória não vale mais; a nova entra sem pedir troca');
  const sessoes = (await get('/__aba?nome=Sessoes')) || [];
  ok(sessoes.length >= 3 && !JSON.stringify(sessoes).includes(F1), 'sessões guardadas só como hash');

  console.log('3. Perfis: cada login abre só o que é dele');
  r = await post({ action: 'sync', key: F1, since: 0 });
  ok(r.ok && JSON.stringify(r.permissoes) === '{"veiculos":1,"tf":0,"pce":1,"antigo":0}', 'fiscal sincroniza com os módulos do usuário', r.permissoes || r.erro);
  ok(erro(await post({ action: 'painelDados', key: F1, de: '2026-01-01', ate: '2026-01-02' }), /gerente/), 'fiscal não abre o painel');
  ok(erro(await post({ action: 'admDados', sessao: F1 }), /administrativo/), 'fiscal não abre o portal');
  const G = (await post({ action: 'login', login: 'ger.teste', senha: 'provisoria1' })).token;
  ok((await post({ action: 'painelUsuarios', key: G })).usuarios.length === 3, 'gerente (usuário e senha) lista os usuários');
  ok(erro(await post({ action: 'ping', key: G }), /perfil de fiscal/), 'gerente sem perfil fiscal não usa o app');
  const A = (await post({ action: 'login', login: 'adm.teste', senha: 'provisoria3' })).token;
  r = await post({ action: 'admDados', sessao: A });
  ok(r.ok && r.nome === 'Administrativo Teste Lima', 'administrativo abre o portal com o mesmo token', r.erro);
  ok(erro(await post({ action: 'painelUsuarios', key: A }), /gerente/), 'administrativo não controla acessos');

  console.log('4. Controle de acesso do gerente');
  const idFis = fis.usuario.id;
  r = await post({ action: 'painelUsuarioSalvar', key: G, id: idFis, login: 'fis.teste', nome: 'Fiscal Teste Souza', perfis: ['fiscal'], modulos: { veiculos: 1, tf: 0, pce: 1 }, ativo: 0 });
  ok(r.ok && r.usuario.ativo === 0, 'gerente desativa o fiscal');
  r = await post({ action: 'ping', key: F1 });
  ok(erro(r, /revogado|inv[aá]lido/), 'aparelho do fiscal desativado perde o acesso (o app mostra "acesso revogado")', r.erro);
  ok(erro(await post({ action: 'login', login: 'fis.teste', senha: 'minhasenha1' }), /desativado/), 'desativado não entra');
  await post({ action: 'painelUsuarioSalvar', key: G, id: idFis, login: 'fis.teste', nome: 'Fiscal Teste Souza', perfis: ['fiscal'], modulos: { veiculos: 1, tf: 0, pce: 1 }, ativo: 1, senha: 'redefinida1' });
  r = await post({ action: 'login', login: 'fis.teste', senha: 'redefinida1' });
  ok(r.ok && r.trocarSenha === true, 'reativado com senha nova provisória (troca obrigatória de novo)');
  ok(erro(await post({ action: 'ping', key: F1 }), /revogado|inv[aá]lido/), 'sessão antiga continua encerrada');
  r = await post({ action: 'sair', key: r.token });
  ok(r.ok && r.saiu === true, 'Sair encerra a sessão no servidor');
  for (let i = 0; i < 10; i++) await post({ action: 'login', login: 'adm.teste', senha: 'errada' + i });
  ok(erro(await post({ action: 'login', login: 'adm.teste', senha: 'provisoria3' }), /Aguarde 15 minutos/), '10 senhas erradas: o usuário espera 15 min (mesmo com a senha certa)');
  ok(erro(await post({ action: 'login', login: 'ger.teste', senha: 'errada' }), /incorretos/), 'o bloqueio é por usuário: outro usuário segue normal');
  ok((await post({ action: 'painelUsuarios', key: LEG })).ok, 'credencial antiga do painel continua valendo');

  /* ================= telas ================= */
  const b = await amb.lancar();
  const pagina = async (url, w = 420) => {
    const c = await b.newContext({ viewport: { width: w, height: 900 } });
    await c.addInitScript(u => { localStorage.setItem('gdv.url', u); localStorage.setItem('gdv.semInstalar', '1'); }, amb.API_URL);
    const p = await c.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(url); return p;
  };
  console.log('5. App do fiscal: entrar e criar a senha');
  await salvar({ login: 'campo.um', nome: 'Fiscal Campo Um', perfis: ['fiscal'], modulos: { veiculos: 1, tf: 1, pce: 1 }, senha: 'provisoria6' });
  let p = await pagina(APP);
  await p.waitForSelector('#fLogin', { timeout: 15000 });
  ok(await p.isVisible('#fAtivar'), 'o formulário de código continua (para quem ainda tem um)');
  await p.fill('#lUser', 'campo.um'); await p.fill('#lSenha', 'provisoria6'); await p.click('#fLogin button');
  await p.waitForSelector('#fTrocaSenha', { timeout: 15000 });
  ok(!(await p.evaluate(() => localStorage.getItem('gdv.key'))), 'senha provisória: o aparelho ainda não guarda a credencial');
  await p.fill('#tsNova', 'campoum123'); await p.fill('#tsNova2', 'campoum123'); await p.click('#fTrocaSenha button');
  await p.waitForFunction(() => !!localStorage.getItem('gdv.key') && !document.querySelector('#fLogin'), null, { timeout: 15000 });
  ok(await p.evaluate(() => localStorage.getItem('gdv.nome')) === 'Fiscal Campo Um', 'senha criada: aparelho lembrado com o nome do fiscal');
  ok((await post({ action: 'login', login: 'campo.um', senha: 'campoum123' })).ok, 'a senha criada no app vale no servidor');
  ok(!p.erros.length, 'app sem erros de JavaScript', p.erros);
  await p.context().close();

  console.log('6. Painel: entrar como gerente e criar usuário pela aba Usuários');
  p = await pagina(PAINEL, 1280);
  await p.waitForSelector('#pn-login-senha', { timeout: 15000 });
  await p.fill('#pn-login-usuario', 'ger.teste'); await p.fill('#pn-senha', 'provisoria1'); await p.click('#pn-entrar-senha');
  await p.waitForSelector('#pn-troca:not([hidden])', { timeout: 15000 });
  await p.fill('#pn-senha-nova', 'gerente123'); await p.fill('#pn-senha-nova2', 'gerente123'); await p.click('#pn-entrar-senha');
  await p.waitForSelector('#pn-app:not([hidden])', { timeout: 20000 });
  ok(/Gerente Teste Silva/.test(await p.textContent('#pn-nome')), 'painel aberto com o nome do gerente');
  await p.click('.pn-aba[data-aba=usuarios]'); await p.waitForSelector('#pn-us-form');
  await p.waitForFunction(() => /fis\.teste/.test(document.querySelector('#pn-us').textContent), null, { timeout: 15000 });
  ok(await p.isVisible('#pn-us-mods'), 'módulos aparecem para o perfil fiscal');
  await p.fill('#pn-us-login', 'campo.dois'); await p.fill('#pn-us-nome', 'Fiscal Campo Dois'); await p.fill('#pn-us-senha', 'provisoria7');
  await p.click('#pn-us-salvar');
  await p.waitForFunction(() => /campo\.dois/.test(document.querySelector('#pn-us').textContent), null, { timeout: 15000 });
  ok((await post({ action: 'login', login: 'campo.dois', senha: 'provisoria7' })).trocarSenha === true, 'usuário criado pela tela entra com a senha provisória');
  await p.locator('[data-us=desativar]').first().click();
  await p.waitForFunction(() => /desativado/.test(document.querySelector('#pn-us-msg').textContent), null, { timeout: 15000 });
  ok(/Desativado/.test(await p.textContent('#pn-us')), 'gerente desativa pela tela');
  ok(!p.erros.length, 'painel sem erros de JavaScript', p.erros);
  await p.context().close();

  console.log('7. Portal: entrar como administrativo');
  await salvar({ login: 'adm.dois', nome: 'Administrativo Dois Teste', perfis: ['administrativo'], senha: 'provisoria8' });
  p = await pagina(ORIGEM + '/administrativo/', 1280);
  await p.waitForSelector('#adm-senha-form', { timeout: 15000 });
  await p.fill('#adm-login-usuario', 'adm.dois'); await p.fill('#adm-senha', 'provisoria8'); await p.click('#adm-entrar-senha');
  await p.waitForSelector('#adm-troca:not([hidden])', { timeout: 15000 });
  await p.fill('#adm-senha-nova', 'admdois123'); await p.fill('#adm-senha-nova2', 'admdois123'); await p.click('#adm-entrar-senha');
  await p.waitForSelector('#adm-app:not([hidden])', { timeout: 20000 });
  ok(await p.isVisible('#adm-app'), 'portal aberto para o administrativo');
  ok(!p.erros.length, 'portal sem erros de JavaScript', p.erros);
  await b.close();

  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
