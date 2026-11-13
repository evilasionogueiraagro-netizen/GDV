const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Barreira do TF lavrado no turno (tf.js: barreiraDoLocal): o TF vem com a barreira da BVA do turno, mesmo que o aparelho tenha usado
// outra barreira por último (antes, um TF no turno do Jundiá saía com o nº da CEASA). BVA fixa sem barreira no cadastro: aviso no
// formulário. App real (Chromium) + Code.gs real. Dados fictícios.
const { API, APP } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 400))); if (!c) falhas++; };
const fn = (nome, args) => fetch(API + '/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args))).then(r => r.json());

(async () => {
  const b = await amb.lancar();
  try {
    await fn('listarBarreiras_', []);   // cria a barreira padrão (CEASA) se a aba estiver vazia
    const ins = await fn('inserir_', ['Barreiras', [{ id: 'BVA-JUNDIA', nome: 'BVA-JUNDIÁ', sufixo: 'BVA - JUNDIÁ', local: 'BR-174, km 75', ativo: 1 }]]);
    ok(ins && !ins.erro, 'barreira do Jundiá no cadastro (aba Barreiras)', ins);
    const F = await U.fiscal('Fulano Ficticio Teste');
    const c = await b.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'America/Manaus', permissions: ['geolocation'], geolocation: { latitude: -2.05, longitude: -60.02, accuracy: 10 } });
    await c.route(u => !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u)), r => r.abort());
    await c.addInitScript(i => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); localStorage.setItem('gdv.barreira', 'BVA-CEASA'); } }, F.ls);
    const p = await c.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(APP); await p.waitForSelector('.modulo'); await p.evaluate(() => Sync.sincronizar());

    const turnoComTF = async (local, n) => {
      await p.click('nav [data-v=modulos]').catch(() => {}); await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno');
      await p.selectOption('#nPosto', 'Fixa'); await p.selectOption('#nLocal', local); await p.fill('#nTF', String(n));
      await p.click('#fTurno button[type=submit]'); await p.waitForSelector('.contador', { timeout: 20000 });
      await p.waitForTimeout(300); await p.click('nav [data-v=registrar]'); await p.waitForSelector('#fVeic'); await p.fill('#placa', 'ABC1D23'); await p.click('#fVeic > button'); await p.waitForTimeout(400);
      await p.click('nav [data-v=lista]'); await p.waitForSelector('[data-tfveic]'); await p.locator('[data-tfveic]').first().click(); await p.waitForSelector('#tfForm');
      await p.waitForTimeout(500);
      return { barreira: await p.inputValue('#tf-barreira'), aviso: await p.$('#tf-sembarreira') ? await p.textContent('#tf-sembarreira') : '' };
    };
    const encerrar = async () => {
      await p.click('[data-tf=descartar]').catch(() => {}); await p.waitForTimeout(300);
      await p.click('nav [data-v=resumo]'); await p.waitForSelector('#encerrar'); await p.click('#encerrar'); await p.waitForSelector('[data-doc=termo]', { timeout: 15000 });
    };

    const j = await turnoComTF('BVA - JUNDIÁ', 5);
    ok(j.barreira === 'BVA-JUNDIA' && !j.aviso, 'turno do Jundiá: o TF vem com a barreira do Jundiá (o aparelho tinha usado a CEASA)', j);
    await p.screenshot({ path: amb.saida('tf_barreira_turno.png'), fullPage: true });
    await encerrar();
    const a = await turnoComTF('BVA - AEROPORTO', 6);
    ok(/BVA - AEROPORTO \(BVA do turno\) não está na lista de barreiras/.test(a.aviso), 'BVA fixa sem barreira no cadastro: aviso para conferir a barreira', a);
    ok(!erros.length, 'sem erros de página', erros);
  } finally { await b.close(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
