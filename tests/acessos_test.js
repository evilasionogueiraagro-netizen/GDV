const amb = require('./lib/amb');
const Login = require('./lib/login');
// Acessos com matrícula e senha (a antiga aba Servidores, com códigos de ativação, saiu): lista de usuários e aparelhos (sessões),
// permissões, sessões encerradas pela gerência, desativar e reativar. Quem não é gerente não lê nem grava (servidor); no painel a aba
// Usuários só aparece para a gerência, no celular cabe sem rolagem e no Modo TV não existe. Códigos de ativação, código de
// administrador e ACCESS_KEY: cobertos em usuarios_server_test (seções 1 a 6) e login_painel_test (seções 3 a 5 e 8).
const { API, PAINEL } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

(async () => {
  /* ================= 1. servidor ================= */
  console.log('1. Servidor: lista de usuários, quem pode ver');
  const GER = await Login.criar('Gerente Acessos Silva', { matricula: 'ger.acessos', permissoes: ['gerencia'] });
  const FIS = await Login.campo('Fiscal Acessos Lima', { matricula: 'fis.acessos' });
  const VIS = await Login.soLeitura('Visitante Acessos Costa', { matricula: 'ver.acessos' });
  const REV = await Login.campo('Revogada Acessos Dias', { matricula: 'rev.acessos' });
  const NOVO = await Login.criar('Nova Acessos Pereira', { matricula: 'novo.acessos', permissoes: ['campo'], trocar: false });
  const T = GER.token;
  const lista = async () => (await post({ action: 'usuariosListar', key: T })).usuarios;
  const achar = (L, m) => L.find(u => u.matricula.toLowerCase() === m) || {};

  let d = await post({ action: 'usuariosListar', key: 'xyz' }); ok(!d.ok, 'credencial inválida não lista usuários', d.erro);
  d = await post({ action: 'usuariosListar', key: FIS.token }); ok(!d.ok && /só da gerência/.test(d.erro), 'fiscal (sem gerência) não lista usuários', d.erro);
  d = await post({ action: 'usuariosListar', key: VIS.token }); ok(!d.ok && /só da gerência/.test(d.erro), 'visitante (só painel) não lista usuários', d.erro);
  d = await post({ action: 'usuarioCriar', key: FIS.token, nome: 'Intruso Acessos Teste', permissoes: ['campo'] }); ok(!d.ok, 'fiscal não cria usuário', d.erro);
  d = await post({ action: 'sessoesListar', key: VIS.token, usuarioId: FIS.id }); ok(!d.ok, 'visitante não vê as sessões de outro usuário', d.erro);
  for (const [nome, re] of [['Ana 2 Souza', /só letras/], ['Maria', /nome completo/]]) {
    d = await post({ action: 'usuarioCriar', key: T, nome, permissoes: ['campo'] }); ok(!d.ok && re.test(d.erro), 'nome inválido recusado: ' + nome, d.erro);
  }

  const L = await lista();
  const txt = JSON.stringify(L);
  ok(!/senhaHash|senhaSal|tokenHash/.test(txt) && ![GER, FIS, VIS].some(x => txt.includes(x.token)), 'a lista nunca traz senha, hash nem token');
  const f = achar(L, 'fis.acessos');
  ok(f.nome === 'Fiscal Acessos Lima' && f.ativo === 1 && f.senhaProvisoria === 0 && f.ultimoAcesso > 0 && f.sessoesAbertas >= 1 && f.permissoes.includes('campo'),
    'quem já entrou: nome, ativo, último acesso e sessões abertas', f);
  const n = achar(L, 'novo.acessos');
  ok(n.senhaProvisoria === 1 && n.ultimoAcesso === 0 && n.sessoesAbertas === 0 && n.ativo === 1, 'conta criada e ainda não entrada: senha provisória pendente, sem último acesso', n);

  /* ================= 2. sessões (aparelhos) ================= */
  console.log('2. Sessões: lista por usuário e encerrar uma só');
  const entrar = (matricula, senha, aplicativo, aparelhoId) => post({ action: 'entrar', matricula, senha, aplicativo, aparelhoId });
  const s1 = await entrar('fis.acessos', FIS.senha, 'campo', 'Celular-Acessos');
  ok(s1.ok, 'o mesmo usuário entra em outro aparelho', s1.erro);
  let S = (await post({ action: 'sessoesListar', key: T, usuarioId: FIS.id })).sessoes;
  ok(S.length >= 2 && S.every(s => s.aplicativo === 'campo') && S.some(s => s.aparelhoId === 'Celular-Acessos'), 'sessoesListar: as sessões abertas, com aplicativo e aparelho', S.map(s => [s.aplicativo, s.aparelhoId]));
  const sCel = S.find(s => s.aparelhoId === 'Celular-Acessos');
  d = await post({ action: 'sessaoEncerrar', key: T, sessaoId: sCel.id });
  ok(d.ok && !(await post({ action: 'minhaSessao', key: s1.token })).ok && (await post({ action: 'minhaSessao', key: FIS.token })).ok,
    'encerrar uma sessão: só aquele aparelho cai; o outro segue valendo');

  /* ================= 3. permissões ================= */
  console.log('3. Permissões: a lista mostra a mudança e vale na hora');
  d = await post({ action: 'usuarioPermissoes', key: T, usuarioId: REV.id, permissoes: ['campo', 'pce'] });
  ok(d.ok && [...d.permissoes].sort().join() === 'campo,pce', 'gerência troca a lista de permissões', d.permissoes);
  ok([...achar(await lista(), 'rev.acessos').permissoes].sort().join() === 'campo,pce', 'a lista traz as permissões novas');
  ok((await post({ action: 'ping', key: REV.token })).ok, 'a sessão da pessoa continua e já pega a permissão nova');

  /* ================= 4. desativar e reativar ================= */
  console.log('4. Desativar e reativar: as sessões caem na hora');
  const sRev = await entrar('rev.acessos', REV.senha, 'campo', 'Aparelho-Rev');
  d = await post({ action: 'usuarioAtivar', key: T, usuarioId: REV.id, ativo: 0 }); ok(d.ok, 'desativar', d.erro);
  ok(!(await post({ action: 'minhaSessao', key: sRev.token })).ok && !(await post({ action: 'minhaSessao', key: REV.token })).ok, 'desativado: todas as sessões caem na hora');
  ok(!(await entrar('rev.acessos', REV.senha, 'campo')).ok, 'desativado não entra mais');
  ok(achar(await lista(), 'rev.acessos').ativo === 0, 'lista: situação desativada');
  ok((await post({ action: 'sessoesListar', key: T, usuarioId: REV.id })).sessoes.length === 0, 'sem sessões abertas depois de desativar');
  d = await post({ action: 'usuarioAtivar', key: T, usuarioId: REV.id, ativo: 1 }); ok(d.ok, 'reativar', d.erro);
  ok((await entrar('rev.acessos', REV.senha, 'campo')).ok, 'reativado: volta a entrar com a mesma senha');

  /* ================= 5. painel: aba Usuários ================= */
  console.log('5. Painel: aba Usuários (gerência), sessões, desativar e permissões');
  const b = await amb.lancar();
  const erros = [];
  async function abrir(o = {}) {
    const c = await b.newContext({ viewport: o.viewport || { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block' });
    await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await c.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, o.ls || {});
    const p = await c.newPage(); p.erros = []; p.dialogos = []; p.reqs = [];
    const anota = m => { p.erros.push(m); erros.push(m); };
    p.on('pageerror', e => anota('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') anota(m.text()); });
    p.on('response', rs => { if (rs.status() >= 400) anota(rs.status() + ' ' + rs.url()); });
    p.on('request', rq => { if (rq.method() === 'POST' && rq.url().startsWith(API)) p.reqs.push(rq.postData() || ''); });
    p.on('dialog', dg => { p.dialogos.push(dg.message()); dg.accept(); });
    await p.goto(o.url || PAINEL); return p;
  }
  const esperarDados = p => p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 }).then(() => p.waitForTimeout(300));
  const aba = async (p, id) => { await p.click(`.pn-aba[data-aba=${id}]`); await p.waitForFunction(i => document.querySelector(`.pn-aba[data-aba=${i}]`).getAttribute('aria-selected') === 'true', id); await p.waitForTimeout(300); };
  const linhas = p => p.$$eval('#pn-us-lista tbody tr', trs => trs.map(t => t.textContent.replace(/\s+/g, ' ')));
  const trDe = m => `#pn-us-lista tbody tr:has-text("${m}")`;
  const semRolagem = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

  const p = await abrir({ ls: Login.lsPainel(GER) });
  await esperarDados(p);
  const abas = await p.$$eval('.pn-aba', a => a.map(x => x.dataset.aba));
  ok(abas.includes('usuarios') && !abas.includes('acessos'), 'gerência vê a aba Usuários (e não há mais a aba Servidores)', abas);
  await aba(p, 'usuarios'); await p.waitForSelector('#pn-us-lista table', { timeout: 20000 });
  let R = await linhas(p);
  ok(['fis.acessos', 'rev.acessos', 'ver.acessos', 'novo.acessos'].every(m => R.some(l => l.includes(m))), 'lista: matrícula, nome, permissões, situação, último acesso e sessões', R.map(l => l.slice(0, 70)));
  ok(/Senha provisória/.test(R.find(l => l.includes('novo.acessos')) || '') && !/Senha provisória/.test(R.find(l => l.includes('fis.acessos')) || ''), 'senha provisória marcada só em quem ainda não criou a própria');
  ok(/App de campo/.test(R.find(l => l.includes('fis.acessos')) || '') && /Painel gerencial: só consulta/.test(R.find(l => l.includes('ver.acessos')) || ''), 'permissões com rótulo legível');

  await p.click(trDe('fis.acessos') + ' [data-us=sessoes]');
  await p.waitForSelector('#pn-us-sessoes-cartao tbody tr', { timeout: 15000 });
  const sl = await p.$$eval('#pn-us-sessoes-cartao tbody tr', trs => trs.map(t => t.textContent.replace(/\s+/g, ' ')));
  ok(sl.length === 1 && /App de campo/.test(sl[0]) && /Teste-aparelho/.test(sl[0]), 'sessões do fiscal: aplicativo e aparelho (o que sobrou)', sl);
  await p.click('[data-us=fechar-sessoes]'); ok(await p.isHidden('#pn-us-sessoes'), 'fechar a lista de sessões');

  await p.click(trDe('rev.acessos') + ' [data-us=desativar]');
  await p.waitForFunction(() => [...document.querySelectorAll('#pn-us-lista tbody tr')].some(t => t.textContent.includes('rev.acessos') && /Desativado/.test(t.textContent)), null, { timeout: 15000 });
  ok(p.dialogos.some(m => /Desativar Revogada Acessos Dias/.test(m)) && !(await post({ action: 'minhaSessao', key: REV.token })).ok, 'Desativar: confirma, mostra "Desativado" e encerra as sessões');
  await p.click(trDe('rev.acessos') + ' [data-us=reativar]');
  await p.waitForFunction(() => [...document.querySelectorAll('#pn-us-lista tbody tr')].some(t => t.textContent.includes('rev.acessos') && /Ativo/.test(t.textContent)), null, { timeout: 15000 });
  ok(achar(await lista(), 'rev.acessos').ativo === 1, 'Reativar: volta a ativo');

  await p.click(trDe('fis.acessos') + ' [data-us=permissoes]');
  ok(/Permiss.es de Fiscal Acessos Lima/.test(await p.textContent('#pn-us-form-tit')) && await p.isDisabled('#pn-us-nome') && await p.isChecked('#pn-us-perm-pce'), 'Permissões: o formulário carrega as atuais (nome travado)');
  await p.uncheck('#pn-us-perm-termoDeBarreira'); await p.click('#pn-us-salvar');
  await p.waitForFunction(() => /salvas/.test(document.querySelector('[data-msg=form]').textContent), null, { timeout: 15000 });
  ok(!(achar(await lista(), 'fis.acessos').permissoes || []).includes('termoDeBarreira') && (achar(await lista(), 'fis.acessos').permissoes || []).includes('pce'), 'permissão retirada pela tela e gravada no servidor');
  await p.screenshot({ path: amb.saida('acessos_usuarios.png'), fullPage: true });
  ok(p.erros.length === 0, 'aba Usuários: sem erros de console', p.erros);

  /* ================= 6. quem não é gerente ================= */
  console.log('6. Visitante (só Painel): sem a aba Usuários');
  const pv = await abrir({ ls: Login.lsPainel(VIS) });
  await esperarDados(pv);
  const abasV = await pv.$$eval('.pn-aba', a => a.map(x => x.dataset.aba));
  ok(!abasV.includes('usuarios') && !abasV.includes('publico') && abasV.includes('geral'), 'só leitura: não vê Usuários nem Dashboard público', abasV);
  ok(!(await pv.$('#pn-us')), 'o bloco Usuários nem existe na página');

  /* ================= 7. celular ================= */
  console.log('7. Celular (390 px): a aba Usuários cabe sem rolagem');
  const pc = await abrir({ viewport: { width: 390, height: 844 }, ls: Login.lsPainel(GER) });
  await esperarDados(pc); await aba(pc, 'usuarios'); await pc.waitForSelector('#pn-us-lista table', { timeout: 20000 }); await pc.waitForTimeout(500);
  ok(await semRolagem(pc), '390 px sem rolagem horizontal na aba Usuários');
  await pc.screenshot({ path: amb.saida('acessos_celular.png'), fullPage: true });

  /* ================= 8. Modo TV ================= */
  console.log('8. Modo TV: sem a aba Usuários e sem listar usuários');
  const pt = await abrir({ viewport: { width: 1920, height: 1080 }, ls: Login.lsPainel(GER, { 'gdv.painel.aba': 'usuarios' }), url: PAINEL + '?tv=1&rotacao=300&rotacaoAoVivo=300' });
  await pt.waitForSelector('#tv-palco .tv-kpi', { timeout: 20000 }); await pt.waitForTimeout(1500);
  const tv = await pt.evaluate(() => ({ visAba: [...document.querySelectorAll('.pn-aba')].some(e => e.offsetParent !== null), us: !!document.querySelector('#pn-us') }));
  ok(!tv.visAba && !tv.us, 'Modo TV: sem abas e sem o bloco Usuários, mesmo com a aba lembrada', tv);
  const telas = await pt.evaluate(() => PainelTV.opcoes.telas).catch(() => null);
  ok(Array.isArray(telas) && telas.length && !telas.includes('usuarios'), 'Modo TV: Usuários fora da rotação', telas);
  ok(!pt.reqs.some(r => /usuariosListar|sessoesListar/.test(r)), 'Modo TV não chama a lista de usuários', pt.reqs.map(r => r.slice(0, 40)));
  ok(pt.erros.length === 0, 'Modo TV: sem erros de console', pt.erros);

  const errs = [...new Set(erros)];
  ok(!errs.length, 'sem erros de console/página/HTTP', errs);
  await b.close();
  console.log(falhas ? 'FALHOU=' + falhas : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('FALHOU=1', e.stack); process.exit(1); });
