const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Login do app de campo (matrícula e senha), contra o servidor real (apps-script/usuarios.gs no fakegas): Entrar, Trocar senha, Sair,
// módulos, offline, sessão encerrada sem perder registros pendentes e registros de quem fez. Só o corte de rede e a falha de sync
// são simulados na rota do navegador. Dados fictícios.
const { API, APP } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) { falhas++; process.exitCode = 1; } };
const aba = async n => { const rows = await get('/__aba?nome=' + n); if (!rows) return []; const cab = rows[0]; return rows.slice(1).map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]))); };
const esperar = async (f, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await new Promise(r => setTimeout(r, 200)); } return false; };

/* ---------- contas e sessões (servidor real; lib/usuarios.js) ---------- */
const criarUsuario = async (nome, matricula, permissoes) => { const c = await U.criar(nome, permissoes, matricula); return { id: c.usuario.id, matricula: c.usuario.matricula, nome, senha: c.senhaProvisoria }; };
/** Cria a conta e já troca a senha provisória pela API, para o teste entrar direto pela tela. */
async function usuarioPronto(nome, matricula, permissoes) {
  const u = await criarUsuario(nome, matricula, permissoes), nova = 'SenhaForte' + matricula;
  const e = await post({ action: 'entrar', matricula, senha: u.senha, aplicativo: 'campo' });
  const t = await post({ action: 'trocarSenha', key: e.token, senhaAtual: u.senha, senhaNova: nova });
  if (!e.ok || !t.ok) throw new Error('preparar ' + matricula + ': ' + (e.erro || t.erro));
  await post({ action: 'sair', key: e.token });
  return { ...u, senha: nova };
}
const encerrarSessoes = usuario => U.revogar(usuario.id);

/* ---------- aparelho (navegador) ---------- */
(async () => {
  const b = await amb.lancar();
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
      return route.continue();
    });
    await c.addInitScript(legado => { try { if (!localStorage.getItem('__ini')) { localStorage.setItem('__ini', '1'); localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.semInstalar', '1');
      if (legado) { localStorage.setItem('gdv.key', legado); localStorage.setItem('gdv.nome', 'Fiscal Antigo Silva'); } } } catch (e) {} }, opts.credencialAntiga || '');
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
  ok(await p.locator('#fAtivar, #aCod').count() === 0, 'não existe campo de código de ativação');
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
  ok(/^u\.[0-9a-f]{64}$/.test(await ls(p, 'gdv.key')), 'o token "u." fica onde ficava a credencial (gdv.key)');
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
  // conta sem alguns módulos: eles somem do menu
  const B = await aparelho(); await entrar(B.p, beto.matricula, beto.senha); await B.p.waitForSelector('.modulo');
  ok(await B.p.locator('.modulo').count() === 1 && await B.p.locator('.modulo[data-v=tf]').count() === 1, 'permissão só de TF: Educação Sanitária e PCE somem do menu, só o TF aparece', await B.p.locator('.modulo').count());
  await B.c.close();
  const SM = await usuarioPronto('Sem Modulo Silva', 'FIS004', ['campo']);
  const Sm = await aparelho(); await entrar(Sm.p, SM.matricula, SM.senha); await Sm.p.waitForSelector('#semModulos');
  ok(await Sm.p.locator('.modulo').count() === 0, 'conta sem nenhum módulo: menu vazio com o aviso para falar com a gerência');
  await Sm.c.close();

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
  ok(!((await post({ action: 'sessoesListar', key: (await U.gerente()).token, usuarioId: ana.id })).sessoes || []).length, 'Sair: o servidor encerrou a sessão (nenhuma sessão aberta da Ana)');
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
  await p.evaluate(() => Store.salvar('veiculos', { id: 'v-rev-pend', turnoId: 'sem-turno-rev', hora: '10:00', placa: 'REV1A11', tipo: 'PA', pessoas: 1, excluido: 0, criadoEm: Date.now(), atualizadoEm: Date.now(), pendente: 1 }));   // registro ainda não enviado
  await encerrarSessoes(cida);
  await sincronizar(p); await p.waitForTimeout(400);
  await p.click('nav [data-v=modulos]');      // dentro de um formulário nada some do nada: ao navegar, o app pede a entrada
  await p.waitForSelector('#fEntrar', { timeout: 8000 });
  ok(/Acesso revogado/.test(await p.textContent('#view')) && await ls(p, 'gdv.revogado') === '1', 'sessão encerrada pelo servidor: o app mostra a tela de entrar com o aviso');
  ok(await p.locator('.modulo').count() === 0, 'sessão encerrada: módulos fechados');
  ok((await p.evaluate(() => Store.todos('veiculos'))).some(v => v.placa === 'REV1A11' && v.pendente === 1) && !(await aba('Veiculos')).some(v => v.placa === 'REV1A11'), 'sessão encerrada: o registro pendente continua no aparelho (IndexedDB), ainda fora da planilha');
  await entrar(p, cida.matricula, cida.senha);
  await p.waitForFunction(() => !document.querySelector('#fEntrar'), null, { timeout: 12000 }).catch(async e => { console.log('TOAST:', await toast(p), '| revogado:', await ls(p, 'gdv.revogado'), '| estado:', JSON.stringify(await p.evaluate(() => Sync.estado())), '| log:', estado.log.slice(-8).join(' ; ')); throw e; });
  await p.click('nav [data-v=modulos]'); await p.waitForSelector('.modulo');
  ok(!(await ls(p, 'gdv.revogado')) && await p.locator('.modulo').count() === 3, 'entrando de novo: tudo liberado');
  await esperar(async () => (await aba('Veiculos')).some(v => v.placa === 'REV1A11'));
  veic = (await aba('Veiculos')).find(v => v.placa === 'REV1A11');
  ok(veic && veic.usuario === 'Cida Campo Lima', 'depois do novo login o pendente sobe, em nome de quem o fez', veic && veic.usuario);
  estado.trocarSenhaNaProxima = true;
  await sincronizar(p);
  await p.waitForSelector('#fTrocarSenha', { timeout: 8000 }).catch(() => {});
  ok(await p.locator('#fTrocarSenha').count() === 1 && await ls(p, 'gdv.revogado') === 'senha', 'qualquer chamada que responda trocarSenha = 1 leva à tela de trocar a senha');
  await p.click('[data-sair]'); await p.waitForSelector('#fEntrar', { timeout: 15000 }).catch(async e => { console.log('DBG', await toast(p), p.dialogos.join('|'), JSON.stringify(await p.evaluate(async () => (await Envio.pendentes()).total))); throw e; });
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

  /* ================= 7. Credencial de versão anterior ================= */
  console.log('7. Aparelho com a credencial de uma versão anterior (código de ativação)');
  A = await aparelho({ credencialAntiga: 'credencial-antiga-123' }); p = A.p;
  await p.waitForSelector('#fEntrar', { timeout: 8000 });
  ok(await p.locator('.modulo').count() === 0 && await p.locator('#fAtivar, #aCod').count() === 0, 'credencial antiga (sem token de sessão): o app pede matrícula e senha, sem código de ativação');
  ok(!(await ls(p, 'gdv.key')) && !(await ls(p, 'gdv.nome')), 'a credencial antiga é apagada do aparelho');
  await p.evaluate(() => Store.salvar('veiculos', { id: 'v-antigo-pend', turnoId: 'x', placa: 'ANT1G011', tipo: 'PA', pessoas: 1, criadoEm: Date.now(), atualizadoEm: Date.now(), pendente: 1 }));
  await entrar(p, cida.matricula, cida.senha); await p.waitForSelector('.modulo');
  ok((await p.evaluate(() => Store.todos('veiculos'))).some(v => v.id === 'v-antigo-pend'), 'o registro pendente da versão anterior continua no aparelho depois de entrar');
  await A.c.close();

  ok(erros.length === 0, 'sem erros de página nem de console', erros.slice(0, 3));
  await b.close();
  if (falhas) { console.log('FALHOU=' + falhas); process.exit(1); }
})().catch(e => { console.error('✗ FALHOU', e); process.exit(1); });
