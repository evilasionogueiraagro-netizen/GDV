const amb = require('./lib/amb');
const Login = require('./lib/login');
// Painel, Modo TV e aba Usuários com o login por matrícula e senha (único acesso; não há mais código de acesso): tela de entrar (erro do
// servidor, permissão, senha provisória com troca obrigatória), sessão "u." guardada e relida, Sair, aba Usuários só para quem tem
// gerência, o gerente cria/edita/desativa usuários e mostra a senha provisória uma vez (copiar e WhatsApp), vê e encerra sessões,
// sessão antiga de código ignorada, painel só de leitura sem gerência; Modo TV com o usuário da TV só pelo teclado e volta à tela de
// entrar quando o gerente encerra a sessão. O primeiro gerente nasce como no menu da planilha (tests/lib/login.js).
const { API, PAINEL } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500))); if (!c) falhas++; };
const TODAS = ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'pce', 'digitarDoPapel', 'painel', 'administracao', 'gerencia'];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const esperaReal = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  /* ================= 1. servidor: usuários de partida ================= */
  console.log('1. Servidor: o gerente de partida cria os usuários');
  const BASE = (await Login.gerenteBase()).token;
  const G = await Login.criar('Gerente Teste Silva', { matricula: 'ger.teste', permissoes: TODAS, trocar: false });
  const TV = await Login.criar('TV Sala da Gerencia', { matricula: 'tv.sala', permissoes: ['painel'], trocar: false });
  const VER = await Login.criar('Visitante Teste Lima', { matricula: 'ver.teste', permissoes: ['painel'] });
  const CAM = await Login.criar('Fiscal Campo Teste', { matricula: 'campo.teste', permissoes: ['campo', 'fiscalizacaoDeTransito'] });
  ok([G, TV].every(x => typeof x.provisoria === 'string' && x.provisoria.length >= 8) && VER.token && CAM.token, 'usuários criados; gerente e TV com senha provisória, visitante e fiscal já com senha própria');
  G.senhaProvisoria = G.provisoria; TV.senhaProvisoria = TV.provisoria;
  const entrar = (matricula, senha, aplicativo = 'painel', aparelhoId = 'teste') => post({ action: 'entrar', matricula, senha, aplicativo, aparelhoId });
  const idDe = async m => ((await post({ action: 'usuariosListar', key: BASE })).usuarios.find(u => u.matricula.toLowerCase() === m) || {}).id;
  const VSENHA = Login.SENHA, CSENHA = Login.SENHA;

  /* ================= 2. navegador ================= */
  const b = await amb.lancar();
  const erros = [];
  async function abrir(o = {}) {
    const c = await b.newContext({ viewport: o.viewport || { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
    await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await c.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, o.ls || {});
    const p = await c.newPage(); p.erros = []; p.dialogos = []; p.prompt = 'DESLIGAR';
    const anota = m => { p.erros.push(m); erros.push((o.nome || '') + ': ' + m); };
    p.on('pageerror', e => anota('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') anota(m.text()); });
    p.on('response', rs => { if (rs.status() >= 400) anota(rs.status() + ' ' + rs.url()); });
    p.on('dialog', d => { p.dialogos.push({ tipo: d.type(), msg: d.message() }); if (d.type() === 'prompt' && p.prompt === null) d.dismiss(); else d.accept(d.type() === 'prompt' ? p.prompt : undefined); });
    if (o.relogio) await p.clock.install({ time: Date.now() });
    await p.goto(o.url || PAINEL); return p;
  }
  const esperarDados = p => p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 }).then(() => p.waitForTimeout(300));
  const token = p => p.evaluate(() => localStorage.getItem('gdv.painel.token') || '');
  const aba = async (p, id) => { await p.click(`.pn-aba[data-aba=${id}]`); await p.waitForFunction(i => document.querySelector(`.pn-aba[data-aba=${i}]`).getAttribute('aria-selected') === 'true', id); await p.waitForTimeout(300); };
  const entrarNaTela = async (p, matricula, senha) => { await p.fill('#pn-matricula', matricula); await p.fill('#pn-senha', senha); await p.click('#pn-entrar-senha'); };
  const erroLogin = p => p.waitForSelector('#pn-login-erro:not([hidden])', { timeout: 15000 }).then(() => p.textContent('#pn-login-erro'));
  async function ate(p, fn, arg, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.evaluate(fn, arg)) return true; } catch (e) { /* navegando */ } await esperaReal(150); } return false; }

  /* ================= 3. tela de entrar ================= */
  console.log('3. Painel: tela de entrar com matrícula e senha');
  let p = await abrir({ nome: 'entrar' });
  await p.waitForSelector('#pn-login:not([hidden])');
  ok(await p.isHidden('#pn-app') && await p.isVisible('#pn-matricula') && await p.isVisible('#pn-senha') && await p.evaluate(() => document.activeElement.id === 'pn-matricula'),
    'sem sessão: tela de entrar com matrícula e senha (campo da matrícula já focado)');
  ok(!(await p.$('#pn-codigo')) && !(await p.$('#pn-login-form')) && !/c[óo]digo/i.test(await p.textContent('#pn-login')), 'a tela não tem campo de código nem texto sobre código: só matrícula e senha');
  await entrarNaTela(p, 'ger.teste', 'senha-errada');
  ok(/Matr[ií]cula ou senha incorreta/i.test(await erroLogin(p)) && await p.isHidden('#pn-app'), 'senha errada: mensagem do servidor, continua na tela de entrar', await p.textContent('#pn-login-erro'));
  await entrarNaTela(p, 'campo.teste', CSENHA);
  await p.waitForFunction(() => /permiss|painel/i.test(document.getElementById('pn-login-erro').textContent) && !/incorreta/i.test(document.getElementById('pn-login-erro').textContent), null, { timeout: 15000 });
  ok(await p.isHidden('#pn-app'), 'usuário sem a permissão do painel: o servidor recusa e a mensagem aparece', await p.textContent('#pn-login-erro'));
  ok(await p.evaluate(() => document.getElementById('pn-senha').type === 'password'), 'a senha fica escondida');
  await p.click('#pn-ver-senha'); ok(await p.evaluate(() => document.getElementById('pn-senha').type === 'text'), '"Mostrar a senha" revela o campo');
  await p.screenshot({ path: amb.saida('login_painel_entrar.png') });

  console.log('4. Senha provisória: troca obrigatória antes de abrir o painel');
  await entrarNaTela(p, 'GER.TESTE ', G.senhaProvisoria);      // matrícula sem diferença de maiúscula e sem espaços nas pontas
  await p.waitForSelector('#pn-troca:not([hidden])', { timeout: 15000 });
  ok(await p.isHidden('#pn-app') && await p.isHidden('#pn-senha-campos') && !(await token(p)), 'senha provisória: pede a senha nova e ainda não guarda a sessão no aparelho');
  await p.fill('#pn-senha-nova', 'curta'); await p.fill('#pn-senha-nova2', 'curta'); await p.click('#pn-entrar-senha');
  ok(/no m[ií]nimo 8/.test(await erroLogin(p)), 'senha nova curta: recusada na tela');
  await p.fill('#pn-senha-nova', 'gerente-nova1'); await p.fill('#pn-senha-nova2', 'gerente-nova2'); await p.click('#pn-entrar-senha');
  await p.waitForFunction(() => /n[aã]o s[aã]o iguais/.test(document.getElementById('pn-login-erro').textContent), null, { timeout: 15000 });
  ok(true, 'senhas diferentes: recusada na tela');
  await p.fill('#pn-senha-nova', G.senhaProvisoria); await p.fill('#pn-senha-nova2', G.senhaProvisoria); await p.click('#pn-entrar-senha');
  await p.waitForFunction(() => /igual/.test(document.getElementById('pn-login-erro').textContent), null, { timeout: 15000 });
  ok(await p.isHidden('#pn-app'), 'senha nova igual à provisória: recusada');
  await p.click('#pn-troca-voltar');
  ok(await p.isVisible('#pn-senha-campos') && await p.isHidden('#pn-troca'), 'Cancelar volta à matrícula e senha');
  await entrarNaTela(p, 'ger.teste', G.senhaProvisoria); await p.waitForSelector('#pn-troca:not([hidden])', { timeout: 15000 });
  await p.fill('#pn-senha-nova', 'gerente-nova1'); await p.fill('#pn-senha-nova2', 'gerente-nova1'); await p.click('#pn-entrar-senha');
  await esperarDados(p);
  ok(/Gerente Teste Silva/.test(await p.textContent('#pn-nome')), 'senha trocada: painel aberto com o nome do usuário no topo');
  const TOK = await token(p);
  ok(/^u\.[0-9a-f]{64}$/.test(TOK), 'sessão nova guardada no aparelho (token "u." + 64 hex)');
  ok((await post({ action: 'entrar', matricula: 'ger.teste', senha: G.senhaProvisoria, aplicativo: 'painel' })).ok === false, 'a senha provisória não vale mais');
  const abas = await p.$$eval('.pn-aba', a => a.map(x => x.dataset.aba));
  ok(abas.includes('usuarios') && abas.includes('publico') && !abas.includes('acessos'), 'gerente vê a aba Usuários (e o Dashboard público)', abas);
  await p.reload(); await esperarDados(p);
  ok(await p.isVisible('#pn-app'), 'recarregar mantém a sessão');
  ok((await post({ action: 'minhaSessao', key: TOK })).permissoes.length >= 8, 'minhaSessao: o servidor devolve as permissões do gerente');
  const sess = (await post({ action: 'sessoesListar', key: TOK })).sessoes.filter(s => s.nome === 'Gerente Teste Silva');
  ok(sess.some(s => s.aplicativo === 'painel' && /^Painel-[a-z0-9]{4}$/.test(s.aparelhoId)), 'o painel se identifica ao servidor ("Painel-xxxx") para a lista de aparelhos', sess.map(s => s.aparelhoId));

  /* ================= 5. aba Usuários ================= */
  console.log('5. Aba Usuários (criar, senha provisória, editar, desativar)');
  await aba(p, 'usuarios');
  await p.waitForSelector('#pn-us-lista table', { timeout: 20000 });
  const linhas = await p.$$eval('#pn-us-lista tbody tr', trs => trs.map(t => t.textContent.replace(/\s+/g, ' ')));
  ok(['ger.teste', 'tv.sala', 'ver.teste', 'campo.teste'].every(m => linhas.some(l => l.includes(m))), 'lista: matrícula, nome, permissões, situação, último acesso e sessões', linhas.map(l => l.slice(0, 80)));
  ok(/Gerência/.test(linhas.find(l => l.includes('ger.teste')) || '') && /Painel \(ver\)/.test(linhas.find(l => l.includes('tv.sala')) || ''), 'permissões com rótulo legível ("Gerência", "Painel (ver)")');
  ok(/Senha provisória/.test(linhas.find(l => l.includes('tv.sala')) || '') && !/Senha provisória/.test(linhas.find(l => l.includes('ger.teste')) || ''), 'senha provisória pendente marcada só em quem ainda não trocou');
  const rotulos = await p.$$eval('#pn-us-form input[data-perm]', is => is.map(i => i.parentElement.textContent.trim()));
  ok(rotulos.join('|') === 'App de campo|Fiscalização de trânsito|TF de Barreira|PCE|Digitar do papel|Painel (ver)|Portal do Administrativo|Gerência', 'caixas das 8 permissões com os rótulos combinados', rotulos);
  await p.check('#pn-us-perm-digitarDoPapel'); ok(await p.isChecked('#pn-us-perm-pce'), '"Digitar do papel" marca o PCE junto');
  await p.uncheck('#pn-us-perm-pce'); ok(!(await p.isChecked('#pn-us-perm-digitarDoPapel')), 'desmarcar o PCE desmarca "Digitar do papel"');
  await p.click('#pn-us-salvar');
  ok(/nome completo/i.test(await p.textContent('[data-msg=form]')), 'sem nome: a tela pede o nome');
  await p.fill('#pn-us-nome', 'Maria Teste Souza'); await p.click('#pn-us-salvar');
  ok(/pelo menos uma permiss/i.test(await p.textContent('[data-msg=form]')), 'sem permissão: a tela pede ao menos uma');
  await p.fill('#pn-us-matricula', 'a!'); await p.check('#pn-us-perm-campo'); await p.click('#pn-us-salvar');
  ok(/Matr[ií]cula/.test(await p.textContent('[data-msg=form]')), 'matrícula fora da regra: mensagem na tela', await p.textContent('[data-msg=form]'));
  await p.fill('#pn-us-matricula', ''); await p.check('#pn-us-perm-fiscalizacaoDeTransito'); await p.check('#pn-us-perm-termoDeBarreira'); await p.click('#pn-us-salvar');
  await p.waitForSelector('#pn-us-res:not([hidden]) #pn-us-senha-txt', { timeout: 15000 });
  const senhaMaria = (await p.textContent('#pn-us-senha-txt')).trim(), matMaria = (await p.textContent('#pn-us-res-mat')).trim();
  ok(/^GDV\d{4}$/.test(matMaria) && senhaMaria.length >= 8, 'matrícula em branco: o sistema gera (GDV0001…); a senha provisória aparece', [matMaria, senhaMaria.length]);
  ok(/s[óo] agora/.test(await p.textContent('#pn-us-res')), 'o cartão avisa que a senha aparece uma vez só');
  ok((await entrar(matMaria, senhaMaria, 'campo')).trocarSenha === 1, 'a pessoa entra com a senha provisória e é obrigada a trocar (trocarSenha: 1)');
  ok((await p.$$eval('#pn-us-lista tbody tr', trs => trs.map(t => t.textContent)).then(l => l.some(t => t.includes('Maria Teste Souza') && /Senha provisória/.test(t)))) || await ate(p, () => /Maria Teste Souza/.test(document.getElementById('pn-us-lista').textContent), null), 'a lista já mostra o usuário novo');
  await p.click('#pn-us-copiar');
  await p.waitForFunction(() => /copiada/i.test(document.getElementById('pn-us-aviso').textContent), null, { timeout: 5000 });
  const copiado = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok(copiado.includes(senhaMaria) && copiado.includes(matMaria) && /Maria/.test(copiado) && !/painel\//.test(copiado) && /App de campo/.test(copiado), '"Copiar mensagem": matrícula, senha provisória e só o endereço do app de campo (a Maria só tem campo)', copiado.slice(0, 200));
  const wa = await p.getAttribute('#pn-us-whats', 'href');
  ok(/^https:\/\/wa\.me\/\?text=/.test(wa) && decodeURIComponent(wa).includes(senhaMaria), '"Enviar pelo WhatsApp": link com a mensagem e a senha', wa.slice(0, 60));
  await p.screenshot({ path: amb.saida('login_painel_usuarios.png'), fullPage: true });
  await p.click('#pn-us-fechar'); ok(await p.isHidden('#pn-us-res') && !(await p.content()).includes(senhaMaria), 'Fechar: a senha some da tela');

  const trDe = (m) => `#pn-us-lista tbody tr:has-text("${m}")`;
  await p.click(`${trDe(matMaria)} [data-us=permissoes]`);
  ok(/Permiss.es de Maria Teste Souza/.test(await p.textContent('#pn-us-form-tit')) && await p.isDisabled('#pn-us-nome') && await p.isChecked('#pn-us-perm-campo') && !(await p.isChecked('#pn-us-perm-pce')), 'Permissões: o formulário carrega as permissões atuais (nome e matrícula travados)');
  await p.check('#pn-us-perm-pce'); await p.uncheck('#pn-us-perm-termoDeBarreira'); await p.click('#pn-us-salvar');
  await p.waitForFunction(() => /salvas/.test(document.querySelector('[data-msg=form]').textContent), null, { timeout: 15000 });
  const uM = (await post({ action: 'usuariosListar', key: TOK })).usuarios.find(u => u.matricula === matMaria);
  ok([...uM.permissoes].sort().join() === ['campo', 'fiscalizacaoDeTransito', 'pce'].sort().join(), 'permissões gravadas exatamente como marcadas (as que saíram são retiradas)', uM.permissoes);
  const idMaria = uM.id;

  await p.click(`${trDe(matMaria)} [data-us=senha]`);
  await p.waitForSelector('#pn-us-res:not([hidden]) #pn-us-senha-txt', { timeout: 15000 });
  const senha2 = (await p.textContent('#pn-us-senha-txt')).trim();
  ok(p.dialogos.some(d => /nova senha provis/i.test(d.msg)) && senha2 !== senhaMaria && /Nova senha provisória/.test(await p.textContent('#pn-us-res')), 'Nova senha: confirmação, e a senha nova aparece uma vez', senha2.length);
  ok(!(await entrar(matMaria, senhaMaria, 'campo')).ok && (await entrar(matMaria, senha2, 'campo')).trocarSenha === 1, 'a senha antiga deixa de valer; a nova é provisória');
  await p.click('#pn-us-fechar');

  await p.click(`${trDe(matMaria)} [data-us=desativar]`);
  await p.waitForFunction(m => [...document.querySelectorAll('#pn-us-lista tbody tr')].some(t => t.textContent.includes(m) && /Desativado/.test(t.textContent)), matMaria, { timeout: 15000 });
  ok(p.dialogos.some(d => /Desativar Maria/.test(d.msg)) && !(await entrar(matMaria, senha2, 'campo')).ok, 'Desativar: confirmação, situação "Desativado" e a pessoa não entra mais');
  await p.click(`${trDe(matMaria)} [data-us=reativar]`);
  await p.waitForFunction(m => [...document.querySelectorAll('#pn-us-lista tbody tr')].some(t => t.textContent.includes(m) && /Ativo/.test(t.textContent)), matMaria, { timeout: 15000 });
  ok((await entrar(matMaria, senha2, 'campo')).ok, 'Reativar: volta a entrar (com a senha provisória mais recente)');

  console.log('6. Sessões (aparelhos) de um usuário');
  await post({ action: 'sair', key: VER.token });      // a sessão que o preparo abriu: sobram só as duas abaixo
  const s1 = await entrar('ver.teste', VSENHA, 'painel', 'Celular-A'), s2 = await entrar('ver.teste', VSENHA, 'painel', 'TV-Sala-B');
  await p.reload(); await p.waitForSelector('.pn-aba[data-aba=usuarios]', { timeout: 20000 }); await aba(p, 'usuarios'); await p.waitForSelector('#pn-us-lista table', { timeout: 20000 });
  await p.waitForFunction(() => [...document.querySelectorAll('#pn-us-lista tbody tr')].some(t => t.textContent.includes('ver.teste') && /2 \(ver\)/.test(t.textContent)), null, { timeout: 15000 });
  ok(true, 'a lista mostra 2 sessões abertas de ver.teste');
  await p.click(`${trDe('ver.teste')} [data-us=sessoes]`);
  await p.waitForSelector('#pn-us-sessoes-cartao tbody tr', { timeout: 15000 });
  const sl = await p.$$eval('#pn-us-sessoes-cartao tbody tr', trs => trs.map(t => t.textContent.replace(/\s+/g, ' ')));
  ok(sl.length === 2 && sl.some(t => /Celular-A/.test(t)) && sl.some(t => /TV-Sala-B/.test(t)) && sl.every(t => /Painel/.test(t)), 'sessões abertas: aplicativo, aparelho, abertura e último uso', sl);
  await p.click('#pn-us-sessoes-cartao tbody tr:has-text("Celular-A") [data-us=encerrar]');
  await p.waitForFunction(() => document.querySelectorAll('#pn-us-sessoes-cartao tbody tr').length === 1, null, { timeout: 15000 });
  ok(!(await post({ action: 'minhaSessao', key: s1.token })).ok && (await post({ action: 'minhaSessao', key: s2.token })).ok, 'Encerrar: só aquela sessão cai; a outra segue valendo');
  ok(p.dialogos.some(d => /Encerrar esta sess/.test(d.msg)), 'pede confirmação antes de encerrar');
  await p.click('[data-us=fechar-sessoes]'); ok(await p.isHidden('#pn-us-sessoes'), 'fechar a lista de sessões');

  /* ================= 7. quem não é gerente ================= */
  console.log('7. Usuário só com "Painel (ver)": painel só de leitura');
  const pv = await abrir({ nome: 'visitante' });
  await entrarNaTela(pv, 'ver.teste', VSENHA); await esperarDados(pv);
  await pv.waitForTimeout(500);
  const abasV = await pv.$$eval('.pn-aba', a => a.map(x => x.dataset.aba));
  ok(!abasV.includes('usuarios') && !abasV.includes('publico') && abasV.includes('geral') && abasV.includes('barreiras'), 'só leitura: vê as abas de dados, não vê Usuários nem Dashboard público', abasV);
  ok(!(await pv.$('#pn-us')), 'o bloco Usuários nem existe na página');
  await aba(pv, 'convenios'); await pv.waitForSelector('#pn-conv-sel', { timeout: 20000 });
  ok(!(await pv.$('#pn-conv-editar')) && !(await pv.$('#pn-cr-salvar')), 'só leitura: sem "Editar convênio" nem "Salvar textos" (o servidor recusaria)');
  ok((await post({ action: 'painelConvSalvar', key: await token(pv), convenio: 'x', config: {} })).erro.includes('só de leitura'), 'o servidor recusa gravar no painel para quem não tem gerência', '');
  const dv = await post({ action: 'usuariosListar', key: await token(pv) });
  ok(!dv.ok && !!dv.erro, 'o servidor também recusa a lista de usuários para quem só tem Painel (ver)', dv.erro);
  const tokV = await token(pv);
  p.dialogos.length = 0;
  await pv.click('#pn-sair'); await pv.waitForSelector('#pn-login:not([hidden])');
  ok(pv.dialogos.some(d => /entrar de novo com a matr[ií]cula e a senha/.test(d.msg)) && !(await token(pv)), 'Sair: confirma, apaga a sessão do aparelho e volta à tela de entrar');
  await pv.waitForTimeout(500);
  ok(!(await post({ action: 'minhaSessao', key: tokV })).ok, 'Sair encerra a sessão no servidor (cópia do token não vale mais)');
  ok(!pv.erros.length, 'visitante: sem erros de console', pv.erros);

  /* ================= 8. sessão antiga de código ================= */
  console.log('8. Sessão guardada de antes (credencial de código) é ignorada');
  const pl = await abrir({ nome: 'legado', ls: { 'gdv.painel.token': 'a'.repeat(32), 'gdv.painel.nome': 'Gerente Antigo' } });
  await pl.waitForSelector('#pn-login:not([hidden])', { timeout: 20000 });
  ok(await pl.isHidden('#pn-app') && await pl.isVisible('#pn-matricula') && !(await pl.$('#pn-codigo')), 'credencial antiga no aparelho: não abre o painel, pede matrícula e senha');
  await entrarNaTela(pl, 'ver.teste', VSENHA); await esperarDados(pl);
  ok(await pl.isVisible('#pn-app') && /^u\./.test(await token(pl)), 'e dá para entrar com matrícula e senha normalmente');
  // sessão encerrada pelo gerente: na próxima atualização volta à tela de entrar com o motivo
  const sv = (await post({ action: 'sessoesListar', key: TOK, usuarioId: await idDe('ver.teste') })).sessoes.find(x => /^Painel-/.test(x.aparelhoId));
  await post({ action: 'sessaoEncerrar', key: TOK, sessaoId: sv.id });
  await pl.click('#pn-atualizar');
  await pl.waitForSelector('#pn-login:not([hidden])', { timeout: 20000 });
  ok(/sess[aã]o|matr[ií]cula e senha/i.test(await pl.textContent('#pn-login-erro')) && !(await token(pl)), 'sessão encerrada pelo gerente: volta à tela de entrar com a mensagem do servidor e sem sessão guardada', await pl.textContent('#pn-login-erro'));
  await pl.reload(); await pl.waitForSelector('#pn-login:not([hidden])');
  ok(await pl.isVisible('#pn-login-erro') && await pl.isVisible('#pn-matricula'), 'depois de recarregar continua na tela de entrar, com o motivo');

  /* ================= 9. Modo TV ================= */
  console.log('9. Modo TV: o usuário da TV entra só pelo teclado e volta à tela de entrar quando a sessão é encerrada');
  const ptv = await abrir({ nome: 'tv', viewport: { width: 1920, height: 1080 }, url: PAINEL + '?tv=1&rotacao=300&rotacaoAoVivo=300', relogio: true });
  await ptv.waitForSelector('#pn-login:not([hidden])');
  const cab = await ptv.evaluate(() => { const l = document.getElementById('pn-login').getBoundingClientRect(), fs = [...document.querySelectorAll('#pn-login form')].filter(f => f.offsetParent).map(f => f.getBoundingClientRect());
    return { cheia: l.width >= innerWidth - 1 && l.height >= innerHeight - 1, cabe: fs.every(r => r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth), n: fs.length, foco: document.activeElement.id, tv: document.body.classList.contains('tv') }; });
  ok(cab.tv && cab.cheia && cab.cabe && cab.n === 1 && cab.foco === 'pn-matricula', 'TV: tela de entrar em tela cheia, o cartão cabe na altura e a matrícula já está focada', cab);
  await ptv.screenshot({ path: amb.saida('login_painel_tv_entrar.png') });
  await ptv.keyboard.press('ArrowRight'); ok(await ptv.isVisible('#pn-login'), 'teclas de navegação da TV não atrapalham a digitação');
  await ptv.keyboard.type('tv.sala'); await ptv.keyboard.press('Tab'); await ptv.keyboard.type(TV.senhaProvisoria); await ptv.keyboard.press('Enter');
  await ptv.waitForSelector('#pn-troca:not([hidden])', { timeout: 15000 });
  ok(await ptv.evaluate(() => document.activeElement.id === 'pn-senha-nova'), 'TV, só teclado: senha provisória leva à troca, com a senha nova já focada');
  await ptv.keyboard.type('tv-sala-nova1'); await ptv.keyboard.press('Tab'); await ptv.keyboard.type('tv-sala-nova1'); await ptv.keyboard.press('Enter');
  await ptv.waitForSelector('#tv-palco .tv-kpi', { timeout: 20000 }); await ptv.waitForTimeout(600);
  ok(await ptv.isHidden('#pn-login') && await ptv.evaluate(() => PainelTV.estado().ativo && PainelTV.estado().tela === 'aovivo'), 'TV entra nas telas sem tocar no mouse');
  await ptv.keyboard.press('ArrowRight'); await ptv.waitForTimeout(400);
  ok(await ptv.evaluate(() => PainelTV.estado().tela) === 'alertas', 'depois de entrar, as setas voltam a trocar de tela');
  ok(await ptv.isHidden('#pn-sair'), 'na TV não há botão Sair');
  const tokTV = await token(ptv), idTV = await idDe('tv.sala');
  ok(/^u\./.test(tokTV) && (await post({ action: 'minhaSessao', key: tokTV })).permissoes.join() === 'painel', 'a sessão da TV é nova e só tem "painel"', (await post({ action: 'minhaSessao', key: tokTV })).permissoes);
  const stv = (await post({ action: 'sessoesListar', key: TOK, usuarioId: idTV })).sessoes;
  ok(stv.length === 1 && /^Painel-TV-[a-z0-9]{4}$/.test(stv[0].aparelhoId), 'o servidor lista a TV como "Painel-TV-xxxx" (aparelho)', stv.map(s => s.aparelhoId));
  await post({ action: 'sessaoEncerrar', key: TOK, sessaoId: stv[0].id });
  await ptv.clock.fastForward(61000);
  ok(await ate(ptv, () => !document.getElementById('pn-login').hidden, null, 20000), 'gerente encerra a sessão da TV: na próxima atualização volta a tela de entrar');
  ok(/matr[ií]cula e senha|encerrada/i.test(await ptv.textContent('#pn-login-erro')) && await ptv.evaluate(() => document.body.classList.contains('tv')) && !(await token(ptv)), 'continua no Modo TV, com o motivo na tela e sem sessão guardada', await ptv.textContent('#pn-login-erro'));
  await ptv.keyboard.type('tv.sala'); await ptv.keyboard.press('Tab'); await ptv.keyboard.type('tv-sala-nova1'); await ptv.keyboard.press('Enter');
  ok(await ate(ptv, () => !document.getElementById('pn-login').hidden === false && /Atualizado/.test(document.getElementById('tv-atual-txt').textContent), null, 20000), 'TV carrega os dados de novo depois do login');
  ok(await ptv.isHidden('#pn-login'), 'entra de novo só pelo teclado (a senha própria vale; não é mais provisória)');
  ok(!ptv.erros.filter(e => !/40[0-3]/.test(e)).length, 'TV: sem erros de console', ptv.erros);

  const errs = [...new Set(erros)].filter(e => !/Failed to load resource: the server responded with a status of 40[0-3]|^40[0-3] /.test(e));
  ok(!errs.length, 'sem erros de JavaScript em nenhuma tela', errs);
  await b.close();
  console.log(falhas ? 'FALHOU=' + falhas : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('FALHOU=1', e.stack); process.exit(1); });
