const amb = require('./lib/amb');
// Login do app de campo (matrícula e senha): Entrar, Trocar senha, Sair, módulos, offline, registros de quem fez e transição do código antigo.
// Contrato da API: actions entrar, trocarSenha, sair, minhaSessao (token "u." no campo key). Se o servidor ainda não tem a action
// "entrar", o teste simula o contrato na rota do navegador (MOCK) e repassa o resto ao fakegas; com o servidor pronto usa o real.
const crypto = require('crypto');
const { API, APP } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) { falhas++; process.exitCode = 1; } };
const aba = async n => { const rows = await get('/__aba?nome=' + n); if (!rows) return []; const cab = rows[0]; return rows.slice(1).map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]))); };
const esperar = async (f, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await new Promise(r => setTimeout(r, 200)); } return false; };

/* ---------- servidor simulado (só quando o real ainda não tem "entrar") ---------- */
let REAL = false;
const mock = { usuarios: new Map(), tokens: new Map(), legados: new Map(), antigosOff: false };
const MODULO_DA_PERMISSAO = { fiscalizacaoDeTransito: 'veiculos', termoDeBarreira: 'tf', pce: 'pce', digitarDoPapel: 'antigo' };
const modulosDe = perms => { const r = { veiculos: 0, tf: 0, pce: 0, antigo: 0 }; Object.entries(MODULO_DA_PERMISSAO).forEach(([p, m]) => { if (perms.includes('gerencia') || perms.includes(p)) r[m] = 1; }); return r; };
const SEM_ACESSO = { ok: false, erro: 'Acesso revogado ou inválido. Entre com sua matrícula e senha.' };
async function tokenLegado(nome) {                                        // o fakegas só conhece a credencial antiga: o simulador repassa com ela
  if (!mock.legados.has(nome)) { const g = await get('/__gerar?nome=' + encodeURIComponent(nome)); mock.legados.set(nome, (await post({ action: 'ativar', codigo: g.codigo })).token); }
  return mock.legados.get(nome);
}
async function mockAcao(c) {
  const u = String(c.key || '').startsWith('u.') ? mock.tokens.get(c.key) : null;
  if (c.action === 'entrar') {
    const us = mock.usuarios.get(String(c.matricula || '').trim().toLowerCase());
    if (!us || !us.ativo || us.senha !== c.senha) return { ok: false, erro: 'Matrícula ou senha incorreta.' };
    if (c.aplicativo !== 'campo' || !(us.permissoes.includes('campo') || us.permissoes.includes('gerencia'))) return { ok: false, erro: 'Você não tem permissão para entrar neste aplicativo.' };
    const token = 'u.' + crypto.randomBytes(32).toString('hex'); mock.tokens.set(token, us);
    return { ok: true, token, usuario: { id: us.id, matricula: us.matricula, nome: us.nome }, permissoes: us.permissoes, modulos: modulosDe(us.permissoes), trocarSenha: us.provisoria ? 1 : 0 };
  }
  if (c.action === 'trocarSenha') {
    if (!u) return SEM_ACESSO;
    if (u.senha !== c.senhaAtual) return { ok: false, erro: 'Senha atual incorreta.' };
    if (String(c.senhaNova || '').length < 8) return { ok: false, erro: 'A nova senha precisa ter pelo menos 8 caracteres.' };
    if (c.senhaNova === u.senha) return { ok: false, erro: 'A nova senha não pode ser igual à atual.' };
    u.senha = c.senhaNova; u.provisoria = false;
    mock.tokens.forEach((v, t) => { if (v === u && t !== c.key) mock.tokens.delete(t); });   // encerra as outras sessões
    return { ok: true, permissoes: u.permissoes, modulos: modulosDe(u.permissoes) };
  }
  if (c.action === 'sair') { if (!u) return SEM_ACESSO; mock.tokens.delete(c.key); return { ok: true }; }
  if (c.action === 'minhaSessao') return u ? { ok: true, usuario: { id: u.id, matricula: u.matricula, nome: u.nome }, permissoes: u.permissoes, modulos: modulosDe(u.permissoes), trocarSenha: u.provisoria ? 1 : 0 } : SEM_ACESSO;
  if (String(c.key || '').startsWith('u.')) {                              // demais actions com a sessão nova
    if (!u) return SEM_ACESSO;
    if (u.provisoria) return { ok: false, erro: 'Troque a senha provisória para continuar.', trocarSenha: 1 };
    const r = await post({ ...c, key: await tokenLegado(u.nome) });
    if (r.permissoes) r.permissoes = modulosDe(u.permissoes);
    return r;
  }
  if (mock.antigosOff && c.action !== 'ping') return { ok: false, erro: 'Entre com sua matrícula e senha.' };   // acessos antigos desligados
  return post(c);
}
const api = c => (REAL ? post(c) : mockAcao(c));

/* ---------- administração (real: actions da gerência; simulado: direto no estado) ---------- */
let chaveGer = null;
const chaveGerencia = async () => chaveGer || (chaveGer = (await post({ action: 'painelAtivar', codigo: (await get('/__gerar?nome=' + encodeURIComponent('Gerente Teste Login') + '&perfil=admin')).codigo })).token);
async function criarUsuario(nome, matricula, permissoes) {
  if (REAL) {
    const r = await post({ action: 'usuarioCriar', key: await chaveGerencia(), matricula, nome, permissoes });
    if (!r.ok) throw new Error('usuarioCriar: ' + r.erro);
    return { id: r.usuario.id, matricula: r.usuario.matricula, nome, senha: r.senhaProvisoria };
  }
  const us = { id: 'u-' + matricula, matricula, nome, permissoes, ativo: true, provisoria: true, senha: crypto.randomBytes(4).toString('hex') };
  mock.usuarios.set(matricula.toLowerCase(), us);
  return { id: us.id, matricula, nome, senha: us.senha };
}
/** Cria a conta e já troca a senha provisória pela API, para o teste entrar direto pela tela. */
async function usuarioPronto(nome, matricula, permissoes) {
  const u = await criarUsuario(nome, matricula, permissoes), nova = 'SenhaForte' + matricula;
  const e = await api({ action: 'entrar', matricula, senha: u.senha, aplicativo: 'campo' });
  const t = await api({ action: 'trocarSenha', key: e.token, senhaAtual: u.senha, senhaNova: nova });
  if (!e.ok || !t.ok) throw new Error('preparar ' + matricula + ': ' + (e.erro || t.erro));
  await api({ action: 'sair', key: e.token });
  return { ...u, senha: nova };
}
async function encerrarSessoes(usuario) {
  if (REAL) {
    const l = await post({ action: 'sessoesListar', key: await chaveGerencia(), usuarioId: usuario.id });
    for (const s of l.sessoes || []) await post({ action: 'sessaoEncerrar', key: await chaveGerencia(), sessaoId: s.id });
  } else mock.tokens.forEach((v, t) => { if (v.id === usuario.id) mock.tokens.delete(t); });
}
async function desligarAcessosAntigos() {
  if (!REAL) { mock.antigosOff = true; return; }
  const g = await usuarioPronto('Gerente Sessao Nova', 'GER900', ['gerencia']);
  const e = await post({ action: 'entrar', matricula: g.matricula, senha: g.senha, aplicativo: 'painel' });
  const r = await post({ action: 'acessosAntigosDesligar', key: e.token, desligar: 1 });
  if (!r.ok) throw new Error('acessosAntigosDesligar: ' + r.erro);
}

/* ---------- aparelho (navegador) ---------- */
(async () => {
  const b = await amb.lancar();
  const sonda = await post({ action: 'entrar', matricula: 'sonda', senha: 'sondasonda', aplicativo: 'campo' });
  REAL = /matr[ií]cula ou senha incorreta/i.test(sonda.erro || '');
  console.log(REAL ? 'Servidor real com a action "entrar".' : 'AVISO: o servidor ainda não tem "entrar"; usando o contrato simulado (MOCK). Rode de novo com o servidor pronto.');
  const erros = [];
  const estado = { falharSync: false, servidorFora: false, ultimoEntrar: null, trocarSenhaNaProxima: false, log: [] };

  async function aparelho(opts = {}) {
    const c = await b.newContext({ viewport: { width: 400, height: 820 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: opts.sw ? 'allow' : 'block',
      permissions: ['geolocation'], geolocation: { latitude: -3.119, longitude: -60.021, accuracy: 10 } });
    await c.route('https://nominatim.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await c.route(u => u.origin === new URL(API).origin, async route => {
      const corpo = JSON.parse(route.request().postData() || '{}');
      if (corpo.action === 'entrar') estado.ultimoEntrar = corpo;
      estado.log.push(corpo.action + ' ' + String(corpo.key || '').slice(0, 5) + '…' + String(corpo.key || '').slice(-4));
      const responde = o => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
      if (estado.servidorFora) return route.abort('internetdisconnected');
      if (estado.trocarSenhaNaProxima && corpo.action === 'sync') { estado.trocarSenhaNaProxima = false; return responde({ ok: false, erro: 'Troque a senha provisória para continuar.', trocarSenha: 1 }); }
      if (estado.falharSync && corpo.action === 'sync') return responde({ ok: false, erro: 'Falha simulada do servidor.' });
      if (REAL) return route.continue();
      return responde(await mockAcao(corpo));
    });
    await c.addInitScript(legado => { try { if (!localStorage.getItem('__ini')) { localStorage.setItem('__ini', '1'); localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.semInstalar', '1');
      if (legado) { localStorage.setItem('gdv.key', legado); localStorage.setItem('gdv.nome', 'Fiscal Antigo Silva'); } } } catch (e) {} }, opts.legado || '');
    const p = await c.newPage();
    p.dialogos = []; p.aceitar = true;
    p.on('pageerror', e => erros.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|Failed to fetch/.test(m.text())) erros.push(m.text()); });
    p.on('dialog', d => { p.dialogos.push(d.message()); return p.aceitar ? d.accept() : d.dismiss(); });
    await p.goto(APP);
    return { c, p };
  }
  const semRede = async (ap, sim) => { await ap.c.setOffline(sim); estado.servidorFora = sim; };   // a rota simulada responderia mesmo offline
  const ls = (p, k) => p.evaluate(k => localStorage.getItem(k), k);
  const toast = p => p.textContent('#toast');
  const esperaToast = (p, re) => p.waitForFunction(s => new RegExp(s, 'i').test(document.querySelector('#toast').textContent), re.source, { timeout: 12000 }).then(() => true, () => false);
  const entrar = async (p, mat, senha) => { await p.waitForSelector('#fEntrar'); await p.fill('#eMat', mat); await p.fill('#eSenha', senha); await p.click('#fEntrar button'); };
  const iniciarTurno = async (p, n) => {
    await p.click('nav [data-v=modulos]').catch(() => {}); await p.waitForSelector('.modulo[data-v=home]'); await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno');
    await p.fill('#nTF', String(n)); await p.selectOption('#nPosto', 'Fixa'); await p.click('#fTurno button[type=submit]'); await p.waitForSelector('.contador');
    return p.evaluate(() => Store.meta('turnoAtual'));
  };
  const registrar = async (p, placa) => {
    await p.waitForTimeout(400); await p.click('nav [data-v=registrar]'); await p.waitForSelector('#fVeic'); await p.waitForTimeout(400);
    for (let i = 0; i < 5 && await p.inputValue('#placa').catch(() => '') !== placa; i++) { await p.fill('#placa', placa); await p.waitForTimeout(250); }
    await p.click('#fVeic > button'); await esperaToast(p, new RegExp(placa));
  };
  const sincronizar = p => p.evaluate(async () => { for (let i = 0; i < 40 && Sync.estado().tipo === 'sync'; i++) await new Promise(r => setTimeout(r, 150)); await Sync.sincronizar(); return Sync.estado(); });
  const abrirStatus = async p => { await p.click('nav [data-v=modulos]'); await p.click('nav [data-v=config]'); await p.waitForSelector('#cEst'); };

  const MODULOS_TODOS = ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'pce'];
  const ana = await criarUsuario('Ana Fiscal Campo', 'FIS001', MODULOS_TODOS);                      // senha provisória (testa a troca pela tela)
  const beto = await usuarioPronto('Beto Barreira Souza', 'FIS002', ['campo', 'termoDeBarreira']);  // só TF
  const cida = await usuarioPronto('Cida Campo Lima', 'FIS003', MODULOS_TODOS);

  /* ================= 1. Tela de entrar ================= */
  console.log('1. Tela de entrar');
  let A = await aparelho(), p = A.p;
  await p.waitForSelector('#fEntrar');
  ok(await p.locator('#eMat').count() === 1 && await p.getAttribute('#eSenha', 'type') === 'password', 'sem credencial: formulário com matrícula e senha (campo de senha oculto)');
  ok(await p.locator('.modulo').count() === 0 && await p.locator('#fTurno').count() === 0, 'sem credencial: nenhum módulo nem turno');
  ok(await p.locator('#fAtivar').count() === 1, 'transição: o código de ativação antigo continua disponível, em separado');
  ok(!/🔑|⛔|✅/u.test(await p.textContent('#view')), 'telas de acesso sem emoji');
  await entrar(p, ana.matricula, 'senha-errada-123');
  ok(await esperaToast(p, /Matr[ií]cula ou senha incorreta/), 'senha errada: mensagem única do servidor', await toast(p));
  ok(!(await ls(p, 'gdv.key')) && await p.locator('#fEntrar').count() === 1, 'senha errada: nada é guardado e a tela continua');
  // sem internet
  await semRede(A, true);
  await p.waitForTimeout(300);
  await p.fill('#eSenha', ana.senha); await p.click('#fEntrar button');
  ok(await esperaToast(p, /Sem internet.*Entrar precisa de conex/), 'sem internet: mensagem clara de que Entrar precisa de conexão', await toast(p));
  ok(!(await ls(p, 'gdv.key')), 'sem internet: nada é guardado');
  await semRede(A, false);

  /* ================= 2. Senha provisória ================= */
  console.log('2. Senha provisória e troca de senha');
  await p.waitForTimeout(300);
  await p.fill('#eSenha', ana.senha); await p.click('#fEntrar button');
  await p.waitForSelector('#fTrocarSenha');
  ok(estado.ultimoEntrar && estado.ultimoEntrar.aplicativo === 'campo' && estado.ultimoEntrar.matricula === ana.matricula, 'entrar manda a matrícula e aplicativo "campo"', { ...estado.ultimoEntrar, senha: '…' });
  ok(typeof estado.ultimoEntrar.aparelhoId === 'string' && estado.ultimoEntrar.aparelhoId.length > 8, 'entrar manda o aparelhoId do app');
  ok(/^u\.[0-9a-f]{64}$/.test(await ls(p, 'gdv.key')) || /^u\./.test(await ls(p, 'gdv.key')), 'o token "u." fica onde ficava a credencial (gdv.key)');
  ok((await ls(p, 'gdv.nome')) === 'Ana Fiscal Campo' && JSON.parse(await ls(p, 'gdv.usuario')).matricula === ana.matricula, 'usuário (id, matrícula, nome) guardado');
  ok(await p.locator('.modulo').count() === 0 && await p.locator('#fEntrar').count() === 0, 'trocarSenha = 1: o app não libera os módulos, só a tela de trocar a senha');
  await p.reload(); await p.waitForSelector('#fTrocarSenha');
  ok(await p.locator('.modulo').count() === 0, 'fechar e abrir o app não pula a troca de senha');
  await sincronizar(p);
  ok(await p.locator('#fTrocarSenha').count() === 1, 'sincronizar com troca pendente não libera nada');
  const preencher = async (atual, nova, rep) => { await p.fill('#tAtual', atual); await p.fill('#tNova', nova); await p.fill('#tRepete', rep); await p.click('#fTrocarSenha button:not([type=button])'); };
  await preencher(ana.senha, 'curta', 'curta');
  ok(await esperaToast(p, /pelo menos 8/), 'senha com menos de 8 caracteres: recusada na tela', await toast(p));
  await preencher(ana.senha, 'NovaSenha2026', 'OutraSenha2026');
  ok(await esperaToast(p, /n[aã]o confere/), 'repetição diferente: recusada na tela', await toast(p));
  await preencher(ana.senha, ana.senha, ana.senha);
  ok(await esperaToast(p, /igual à atual/), 'nova igual à atual: recusada', await toast(p));
  await preencher('senha-atual-errada', 'NovaSenha2026', 'NovaSenha2026');
  await p.waitForTimeout(800);
  ok(await p.locator('#fTrocarSenha').count() === 1 && await p.locator('.modulo').count() === 0 && /incorret|atual/i.test(await toast(p)), 'senha atual errada: o servidor recusa e a tela continua', await toast(p));
  await semRede(A, true); await p.waitForTimeout(300);
  await preencher(ana.senha, 'NovaSenha2026', 'NovaSenha2026');
  ok(await esperaToast(p, /Sem internet.*Trocar a senha precisa de conex/), 'sem internet: mensagem clara ao trocar a senha', await toast(p));
  await semRede(A, false); await p.waitForTimeout(300);
  await preencher(ana.senha, 'NovaSenha2026', 'NovaSenha2026');
  await p.waitForSelector('.modulo', { timeout: 12000 });
  ana.senha = 'NovaSenha2026';
  ok(await p.locator('.modulo').count() === 3 && !(await ls(p, 'gdv.revogado')), 'senha trocada: os três módulos liberados');
  ok(/Olá, Ana/.test(await p.textContent('#view')), 'saudação com o primeiro nome do usuário');

  /* ================= 3. Turno com o usuário logado ================= */
  console.log('3. Turno, módulos e registros');
  const turno1 = await iniciarTurno(p, 31);
  ok(await p.evaluate(() => Store.meta('turnoAtual')) === turno1 && (await p.evaluate(() => Store.todos('turnos')))[0].fiscal === 'Ana Fiscal Campo', 'o Fiscal 1 do turno é o nome do usuário logado');
  await p.click('nav [data-v=modulos]'); await p.click('.modulo[data-v=home]');
  await registrar(p, 'LOG1A11'); await sincronizar(p);
  let veic = (await aba('Veiculos')).find(v => v.placa === 'LOG1A11');
  ok(veic && veic.usuario === 'Ana Fiscal Campo', 'o veículo chega à planilha em nome do usuário logado', veic && veic.usuario);
  ok((await p.evaluate(() => Store.meta('cred'))).usuarioId === ana.id, 'a cópia da credencial (service worker) leva o id do usuário');
  // fiscal sem módulos: cartão cinza
  const B = await aparelho(); await entrar(B.p, beto.matricula, beto.senha); await B.p.waitForSelector('.modulo');
  ok(await B.p.locator('.modulo.bloqueado').count() === 2 && await B.p.locator('.modulo[data-v=tf]:not(.bloqueado)').count() === 1, 'permissão só de TF: Educação Sanitária e PCE ficam cinza, TF abre', await B.p.locator('.modulo.bloqueado').count());
  ok(await B.p.locator('.modulo.bloqueado .sem-aut').count() === 2, 'cartão cinza com o aviso de que falta autorização');
  await B.c.close();

  /* ================= 4. Sair ================= */
  console.log('4. Sair, registros que ficam e quem os fez');
  // 4a. com turno aberto não sai
  await abrirStatus(p); p.dialogos.length = 0;
  ok(await p.locator('[data-sair]').count() === 1 && /Entrou como: Ana Fiscal Campo \(matrícula FIS001\)/.test(await p.textContent('#view')), 'Status mostra quem entrou e o botão Sair');
  await p.click('[data-sair]');
  ok(await esperaToast(p, /turno em andamento/), 'com turno aberto: não deixa sair', await toast(p));
  ok(p.dialogos.length === 0 && !!(await ls(p, 'gdv.key')), 'com turno aberto: nenhuma confirmação e o acesso continua');
  // 4b. registro que não sobe e turno encerrado: sair pede confirmação e explica
  estado.falharSync = true;
  await p.click('nav [data-v=modulos]'); await p.click('.modulo[data-v=home]');
  await registrar(p, 'LOG2B22');
  await p.click('nav [data-v=resumo]'); await p.waitForSelector('#encerrar'); await p.click('#encerrar'); await p.waitForSelector('[data-doc=termo]');
  ok(await p.evaluate(async () => (await Envio.pendentes()).total) >= 2, 'sem conseguir enviar: registro e encerramento ficam pendentes no aparelho');
  await abrirStatus(p); p.dialogos.length = 0;
  await semRede(A, true); await p.waitForTimeout(300);
  await p.click('[data-sair]');
  ok(await esperaToast(p, /Sem internet.*sair/i), 'sem internet: não deixa sair e explica', await toast(p));
  ok(!!(await ls(p, 'gdv.key')) && p.dialogos.length === 0, 'sem internet: continua com o acesso');
  await semRede(A, false); await p.waitForTimeout(300);
  p.aceitar = false;
  await p.click('[data-sair]'); await esperar(async () => p.dialogos.length > 0);
  ok(p.dialogos.length === 1 && /registro\(s\) seu\(s\) que ainda não foram enviados/.test(p.dialogos[0]) && /em seu nome/.test(p.dialogos[0]) && /outra pessoa/.test(p.dialogos[0]), 'com pendentes: avisa que ficam no aparelho, em nome de quem os fez', p.dialogos[0] && p.dialogos[0].slice(0, 80));
  await p.waitForTimeout(400);
  ok(!!(await ls(p, 'gdv.key')), 'cancelando a confirmação: continua com o acesso');
  p.aceitar = true; p.dialogos.length = 0;
  await p.click('[data-sair]'); await p.waitForSelector('#fEntrar', { timeout: 15000 });
  ok(p.dialogos.length === 1 && /registro\(s\) seu\(s\)/.test(p.dialogos[0]), 'confirmando: sai');
  ok(!(await ls(p, 'gdv.key')) && !(await ls(p, 'gdv.nome')) && await p.locator('.modulo').count() === 0, 'Sair: apaga a credencial e volta para a tela de entrar');
  ok(!(await p.evaluate(() => Store.meta('cred'))), 'Sair: a cópia da credencial do service worker também é apagada');
  if (!REAL) ok(![...mock.tokens.keys()].some(t => mock.tokens.get(t).id === ana.id), 'Sair: o servidor encerrou o acesso (sair)');
  else ok((await post({ action: 'minhaSessao', key: 'u.' + '0'.repeat(64) })).ok === false, 'Sair: token inválido não abre sessão');
  ok((await p.evaluate(() => Store.todos('veiculos'))).some(v => v.placa === 'LOG2B22' && v.pendente === 1), 'Sair: o registro não enviado continua guardado');
  // 4c. outra pessoa entra no mesmo aparelho: o que a Ana deixou não sobe no nome dela
  estado.falharSync = false;
  const antes = (await aba('Veiculos')).length;
  await entrar(p, cida.matricula, cida.senha); await p.waitForSelector('.modulo');
  await sincronizar(p); await p.waitForTimeout(500);
  ok((await aba('Veiculos')).length === antes && !(await aba('Veiculos')).some(v => v.placa === 'LOG2B22'), 'outra pessoa entra e sincroniza: o registro da Ana NÃO sobe com o acesso dela');
  const turnoAna = (await aba('Turnos')).find(t => t.id === turno1);
  ok(turnoAna && Number(turnoAna.encerrado) === 0, 'o encerramento do turno da Ana também fica no aparelho');
  ok((await p.evaluate(() => Envio.pendentes())).total >= 2, 'os registros continuam pendentes no aparelho');
  await abrirStatus(p);
  ok(/de outras pessoas.*Ana Fiscal Campo \(\d+\)/.test(await p.textContent('#view')), 'Status avisa que há registros de outra pessoa guardados aqui');
  ok(/Entrou como: Cida Campo Lima/.test(await p.textContent('#view')), 'Status mostra a nova pessoa');
  p.dialogos.length = 0;
  await p.click('[data-sair]'); await p.waitForSelector('#fEntrar', { timeout: 15000 });   // sem registros seus: só confirma
  ok(p.dialogos.length === 1 && /Sair deste aparelho\?/.test(p.dialogos[0]) && !/registro\(s\)/.test(p.dialogos[0]), 'sem pendentes próprios: confirmação simples (não conta os da Ana)', p.dialogos[0]);
  // 4d. a Ana volta: o que era dela sobe, com o nome dela
  await entrar(p, ana.matricula, ana.senha); await p.waitForSelector('.modulo');
  await esperar(async () => (await aba('Veiculos')).some(v => v.placa === 'LOG2B22'));
  veic = (await aba('Veiculos')).find(v => v.placa === 'LOG2B22');
  ok(veic && veic.usuario === 'Ana Fiscal Campo', 'a Ana entra de novo: o registro dela sobe, em nome dela', veic && veic.usuario);
  ok(Number((await aba('Turnos')).find(t => t.id === turno1).encerrado) === 1, 'e o encerramento do turno chega à planilha');
  await esperar(async () => (await p.evaluate(() => Envio.pendentes())).total === 0);
  ok((await p.evaluate(() => Envio.pendentes())).total === 0 && !(await p.evaluate(() => Sync.retidos())).length, 'nada mais pendente nem retido');
  await A.c.close();

  /* ================= 5. Acesso encerrado pelo servidor ================= */
  console.log('5. Acesso encerrado e senha provisória pedida em qualquer chamada');
  A = await aparelho(); p = A.p;
  await entrar(p, cida.matricula, cida.senha); await p.waitForSelector('.modulo');
  await encerrarSessoes(cida);
  await sincronizar(p); await p.waitForTimeout(400);
  await p.click('nav [data-v=config]').catch(() => {});
  await p.waitForSelector('#fEntrar', { timeout: 8000 });
  ok(/Acesso revogado/.test(await p.textContent('#view')) && await ls(p, 'gdv.revogado') === '1', 'sessão encerrada pelo servidor: o app mostra a tela de entrar com o aviso');
  ok(await p.locator('.modulo').count() === 0, 'sessão encerrada: módulos fechados');
  await entrar(p, cida.matricula, cida.senha);
  await p.waitForFunction(() => !document.querySelector('#fEntrar'), null, { timeout: 12000 }).catch(async e => { console.log('TOAST:', await toast(p), '| revogado:', await ls(p, 'gdv.revogado'), '| estado:', JSON.stringify(await p.evaluate(() => Sync.estado())), '| log:', estado.log.slice(-8).join(' ; ')); throw e; });
  await p.click('nav [data-v=modulos]'); await p.waitForSelector('.modulo');
  ok(!(await ls(p, 'gdv.revogado')) && await p.locator('.modulo').count() === 3, 'entrando de novo: tudo liberado');
  estado.trocarSenhaNaProxima = true;
  await sincronizar(p);
  await p.waitForSelector('#fTrocarSenha', { timeout: 8000 }).catch(() => {});
  ok(await p.locator('#fTrocarSenha').count() === 1 && await ls(p, 'gdv.revogado') === 'senha', 'qualquer chamada que responda trocarSenha = 1 leva à tela de trocar a senha');
  await p.click('[data-sair]'); await p.waitForSelector('#fEntrar', { timeout: 15000 });
  ok(!(await ls(p, 'gdv.key')), 'da tela de trocar a senha dá para sair e entrar com outra matrícula');
  await A.c.close();

  /* ================= 6. Offline com login feito ================= */
  console.log('6. Sem internet depois de entrar');
  A = await aparelho({ sw: true }); p = A.p;
  await entrar(p, cida.matricula, cida.senha); await p.waitForSelector('.modulo');
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => p.reload().then(() => p.waitForSelector('.modulo')));
  await sincronizar(p);
  await semRede(A, true);
  await p.reload(); await p.waitForSelector('.modulo', { timeout: 12000 });
  ok(await p.locator('#fEntrar').count() === 0 && await p.locator('.modulo').count() === 3, 'sem internet: o app abre direto nos módulos, sem pedir login');
  await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno');
  ok(await p.inputValue('#nFiscal1') === 'Cida Campo Lima' && await p.getAttribute('#nFiscal1', 'readonly') !== null, 'sem internet: Fiscal 1 continua vindo do usuário logado');
  await semRede(A, false);
  await A.c.close();

  /* ================= 7. Transição: acesso antigo ================= */
  console.log('7. Transição do código antigo');
  A = await aparelho({ legado: 'segredo' }); p = A.p;
  await p.waitForSelector('.modulo');
  ok(await p.locator('#fEntrar').count() === 0 && await p.locator('.modulo').count() === 3, 'aparelho ativado com a credencial antiga: segue sem pedir login');
  await abrirStatus(p);
  ok(await p.locator('#desativar').count() === 1 && await p.locator('[data-sair]').count() === 0, 'acesso antigo: segue com "Desativar este aparelho" (não há Sair)');
  await desligarAcessosAntigos();
  await sincronizar(p); await p.waitForTimeout(400);
  await p.click('nav [data-v=modulos]').catch(() => {});
  await p.waitForSelector('#fEntrar', { timeout: 8000 });
  ok(/Acesso revogado/.test(await p.textContent('#view')) && await ls(p, 'gdv.semCodigo') === '1', 'acessos antigos desligados: a credencial antiga cai na tela de entrar');
  ok(await p.locator('#fAtivar').count() === 0, 'e o campo do código de ativação some');
  await A.c.close();
  A = await aparelho(); p = A.p; await p.waitForSelector('#fAtivar');
  await p.fill('#aCod', '123456'); await p.click('#fAtivar button');
  ok(await esperaToast(p, /Entre com sua matr[ií]cula e senha/), 'código de ativação com os acessos antigos desligados: manda entrar com matrícula e senha', await toast(p));
  await p.waitForTimeout(400);
  ok(await p.locator('#fAtivar').count() === 0 && await p.locator('#fEntrar').count() === 1, 'o campo do código some e fica só Entrar');
  await A.c.close();

  ok(erros.length === 0, 'sem erros de página nem de console', erros.slice(0, 3));
  await b.close();
  if (falhas) { console.log('FALHOU=' + falhas); process.exit(1); }
})().catch(e => { console.error('✗ FALHOU', e); process.exit(1); });
