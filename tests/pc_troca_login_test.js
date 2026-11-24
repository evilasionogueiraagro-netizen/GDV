const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// PC da base com vários logins (Sync.entrar): quem entra depois de outra pessoa recebe tudo do próprio login, inclusive o turno que abriu
// no celular antes da última sincronização do PC. Antes, o aparelho guardava a hora da última sincronização da pessoa anterior e o
// turno aberto no celular nunca chegava ao PC ("Iniciar turno" continuava na tela). Também: o turno em andamento da pessoa anterior
// não vira o turno de quem entrou. App real (Chromium) + Code.gs real. Dados fictícios.
const { API, APP } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 400))); if (!c) falhas++; };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);

(async () => {
  const b = await amb.lancar();
  try {
    const A = await U.fiscal('Fulano Ficticio Teste'), B = await U.fiscal('Beltrano Ficticio Teste');
    const c = await b.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: 'America/Manaus' });
    await c.route(u => !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u)), r => r.abort());
    await c.addInitScript(i => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, B.ls);
    const p = await c.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message)); p.on('dialog', d => d.accept());

    console.log('1) PC com o login do Beltrano: turno aberto dele e sincronizado');
    await p.goto(APP); await p.waitForSelector('.modulo'); await p.evaluate(() => Sync.sincronizar());
    const ag = Date.now(), T = (id, n, extra) => ({ id, numeroTF: `TF-0${n}-A-${hoje.slice(0, 4)}`, data: hoje, letra: 'A', inicio: '07:00', fim: '', local: 'BVA - JUNDIÁ', unidade: 'BVA - JUNDIÁ',
      posto: 'Fixa', encerrado: 0, criadoEm: ag, atualizadoEm: ag, ...extra });
    await p.evaluate(t => Store.gravar('turnos', { ...t, pendente: 1 }).then(() => Store.setMeta('turnoAtual', t.id)), T('turno-do-beltrano', 61, { fiscal: B.nome }));
    await p.evaluate(() => Sync.sincronizar());

    console.log('2) Fulano abre turno no celular (antes da troca de login no PC)');
    let r = await post({ action: 'sync', key: A.token, since: 0, turnos: [T('turno-do-fulano', 62, { fiscal: A.nome, criadoEm: ag - 60e3, atualizadoEm: ag - 60e3 })],
      veiculos: [{ id: 'veic-cel-1', turnoId: 'turno-do-fulano', placa: 'ABC1D23', data: hoje, hora: '07:10', criadoEm: ag, atualizadoEm: ag }] });
    ok(r.ok, 'turno e veículo do celular na planilha', r.erro);
    await p.evaluate(() => Sync.sincronizar());   // o PC (ainda com o Beltrano) sincroniza depois: a hora da última sincronização passa da do turno do Fulano

    console.log('3) No PC, Fulano entra com a matrícula e a senha dele');
    await p.evaluate(async ({ m, s }) => { await Sync.entrar(m, s); await Sync.sincronizar(); go('home'); }, { m: A.matricula, s: A.senha });
    await p.waitForSelector('.contador', { timeout: 15000 }).catch(() => {});
    const tela = await p.textContent('#view');
    ok(/TF-062-A/.test(tela) && !/TF-061-A/.test(tela), 'o PC mostra o turno que o Fulano abriu no celular (não o do Beltrano, nem "Iniciar turno")', tela.replace(/\s+/g, ' ').slice(0, 200));
    ok((await p.textContent('.contador h1').catch(() => '')).trim() === '1', 'com o veículo lançado no celular');
    ok(!erros.length, 'sem erros de página', erros);
  } finally { await b.close(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
