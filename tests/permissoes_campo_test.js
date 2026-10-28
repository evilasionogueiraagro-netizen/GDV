const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Módulos liberados por conta no app de campo (permissões fiscalizacaoDeTransito, termoDeBarreira, pce): o módulo sem permissão some do
// menu; a gerência tira ou devolve o módulo e o app obedece no próximo sync; o que estava guardado no aparelho não se perde.
const { APP } = amb;
const post = b => fetch(amb.API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(amb.API + p).then(r => r.json());
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const linhas = async aba => (await get('/__aba?nome=' + aba)) || [];

(async () => {
  const b = await amb.lancar();
  const erros = [];
  const vigiar = (p, rotulo) => {
    p.on('pageerror', e => erros.push(rotulo + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) erros.push(rotulo + ': ' + m.text()); });
    p.dialogos = []; p.on('dialog', dg => { p.dialogos.push(dg.message()); dg.accept(); });
  };
  console.log('Módulos liberados no app de campo (permissões da conta)');
  const C = await U.fiscal('Carlos App Souza', { permissoes: U.lista({ veiculos: 1, tf: 1, pce: 1, antigo: 0 }) });
  const ca = await b.newContext({ viewport: { width: 400, height: 860 }, permissions: ['geolocation'], geolocation: { latitude: -3.119, longitude: -60.0217, accuracy: 10 }, serviceWorkers: 'block' });
  await U.semear(ca, C);
  const a = await ca.newPage(); vigiar(a, 'app');
  const corpos = []; a.on('request', rq => { if (rq.method() === 'POST' && rq.url().startsWith(amb.API)) corpos.push(rq.postData() || ''); });
  const sync = async () => { await a.evaluate(() => Sync.sincronizar()); await a.waitForFunction(() => ['ok', 'idle', 'erro'].includes(Sync.estado().tipo), null, { timeout: 15000 }); await a.waitForTimeout(400); };
  const perm = (v, t, pc) => U.permissoes(C.usuario.id, U.lista({ veiculos: v, tf: t, pce: pc }));
  await a.goto(APP); await a.waitForSelector('.modulo'); await sync();
  ok(await a.locator('.modulo[data-v]').count() === 3, 'tudo liberado: três módulos no menu');
  ok(JSON.stringify(await a.evaluate(() => Store.meta('permissoes'))) === '{"veiculos":1,"tf":1,"pce":1,"antigo":0,"escala":0}', 'permissões guardadas no aparelho (meta "permissoes")');
  ok(await a.evaluate(() => Sync.pode('antigo') === false), 'app: Digitar do papel desligado por padrão');
  // turno + veículo
  await a.click('.modulo[data-v=home]'); await a.waitForSelector('#fTurno');
  await a.fill('#nTF', '5'); await a.selectOption('#nPosto', 'Móvel'); await a.fill('#nLocal', 'BR-174 km 10'); await a.fill('#nUnidade', 'MANAUS'); await a.click('#fTurno button[type=submit]');
  await a.waitForSelector('.contador');
  ok(await a.locator('[data-go=tfnovo]').count() === 0, 'tela do turno sem o botão "Lavrar TF neste turno" (o TF sai pelo veículo ou pelo módulo de TF)');
  await a.click('[data-go=registrar]'); await a.waitForSelector('#fVeic'); await a.fill('#placa', 'AAA1B22'); await a.click('#fVeic > button');
  await a.waitForFunction(() => /registrado/.test(document.querySelector('#toast').textContent)); await sync();
  await a.click('nav [data-v=lista]'); await a.waitForSelector('.item');
  ok(await a.locator('[data-tfveic]').count() === 1, 'TF liberado: "Lavrar TF" no veículo');
  // gerência tira o TF
  await perm(1, 0, 1); await sync();
  ok(await a.locator('[data-tfveic]').count() === 0 && await a.locator('.item').count() === 1, 'tf=0: "Lavrar TF" some da lista (ao próximo sync, sem recarregar)');
  await a.click('nav [data-v=home]'); await a.waitForSelector('.contador');
  ok(await a.locator('[data-go=tfnovo]').count() === 0, 'tf=0: "Lavrar TF neste turno" some');
  await a.screenshot({ path: amb.saida('permissoes_app_turno_semtf.png'), fullPage: true });
  await a.evaluate(() => go('tfnovo')); await a.waitForSelector('.modulo'); await a.waitForTimeout(300);
  ok(await a.locator('.modulo').count() === 2 && /Sem autorização/.test(await a.textContent('#toast')), 'abrir o TF por outro caminho: volta para os módulos com aviso');
  ok(await a.locator('.modulo[data-v=tf]').count() === 0 && await a.locator('.modulo.bloqueado, [data-bloq]').count() === 0, 'o módulo TF some do menu (sem cartão cinza)');
  ok(!(/Lavrar TF/.test(await a.textContent('#view'))), 'dica de "Lavrar TF" some da tela de módulos');
  // dentro do Controle de veículos, sem internet: registra; gerência tira o módulo; ao sincronizar volta para os módulos sem perder nada
  await a.click('.modulo[data-v=home]'); await a.waitForSelector('.contador');
  await ca.setOffline(true); await a.evaluate(() => window.dispatchEvent(new Event('offline')));
  await a.click('[data-go=registrar]'); await a.waitForSelector('#fVeic'); await a.fill('#placa', 'OFF1L23'); await a.click('#fVeic > button');
  await a.waitForFunction(() => /OFF1L23 registrado/.test(document.querySelector('#toast').textContent));
  await a.click('nav [data-v=lista]'); await a.waitForSelector('.item');
  await perm(0, 0, 1);
  await ca.setOffline(false); await a.evaluate(() => window.dispatchEvent(new Event('online')));
  await a.waitForFunction(() => VIEW === 'modulos' && !document.querySelector('.modulo[data-v=home]'), null, { timeout: 15000 });
  ok(true, 'veiculos=0 com o fiscal dentro do módulo: ao sincronizar volta para a tela de módulos');
  await a.waitForFunction(() => document.querySelector('#avisoPerm'), null, { timeout: 8000 });
  ok(/Sem autorização para o módulo Educação Sanitária\/Fiscalização de Trânsito — fale com a gerência/.test(await a.textContent('#avisoPerm')), 'aviso: "Sem autorização para o módulo Educação Sanitária/Fiscalização de Trânsito — fale com a gerência"', await a.textContent('#avisoPerm'));
  ok(await a.locator('.modulo[data-v=home]').count() === 0, 'cartão de veículos some do menu (o turno em andamento fica guardado no aparelho)');
  let loc = await a.evaluate(async () => (await Store.todos('veiculos')).filter(v => ['AAA1B22', 'OFF1L23'].includes(v.placa)).map(v => v.placa + ':' + v.pendente).sort().join());
  ok(loc === 'AAA1B22:0,OFF1L23:1', 'veículo registrado sem internet continua no aparelho, pendente', loc);
  ok(!(await linhas('Veiculos')).some(r => r[3] === 'OFF1L23'), 'e não foi gravado na planilha');
  await a.waitForFunction(() => /a enviar/.test(document.querySelector('#sync').textContent), null, { timeout: 10000 }).catch(() => {});   // pode estar no meio de um sync ("Sincronizando…")
  ok(/a enviar/.test(await a.textContent('#sync')), 'selo mostra pendentes a enviar', await a.textContent('#sync'));
  await a.screenshot({ path: amb.saida('permissoes_app_bloqueado.png'), fullPage: true });
  await a.evaluate(() => go('registrar'));
  ok(await a.evaluate(() => VIEW) === 'modulos' && !(await a.$('#fVeic')), 'não deixa registrar novos veículos (tela não abre)');
  // próximo sync: os registros do módulo bloqueado nem sobem
  corpos.length = 0; await sync();
  const enviou = corpos.filter(c => c.includes('"action":"sync"'));
  ok(enviou.length >= 1 && enviou.every(c => !c.includes('OFF1L23')), 'sync seguinte não reenvia os registros do módulo bloqueado');
  ok(await a.evaluate(async () => (await Store.todos('veiculos')).find(v => v.placa === 'OFF1L23').pendente) === 1, 'continuam pendentes');
  // sem internet, usa a última permissão conhecida
  await a.route(amb.API + '/**', rt => rt.abort());
  await a.reload(); await a.waitForSelector('.modulo');
  ok(await a.locator('.modulo[data-v]').count() === 1 && await a.locator('.modulo[data-v=pce]').count() === 1, 'recarregado sem internet: usa a última permissão conhecida (só o PCE no menu)');
  await a.unroute(amb.API + '/**');
  // gerência libera de novo: o que estava guardado sobe
  await perm(1, 1, 1); await sync();
  await a.waitForFunction(() => document.querySelectorAll('.modulo[data-v]').length === 3 && !document.querySelector('#avisoPerm'), null, { timeout: 10000 });
  ok(true, 'liberado de novo: três módulos no menu, aviso some');
  loc = await a.evaluate(async () => (await Store.todos('veiculos')).filter(v => ['AAA1B22', 'OFF1L23'].includes(v.placa)).map(v => v.placa + ':' + v.pendente).sort().join());
  ok(loc === 'AAA1B22:0,OFF1L23:0', 'registro guardado foi enviado (não pendente)', loc);
  ok((await linhas('Veiculos')).some(r => r[3] === 'OFF1L23'), 'e está na planilha');
  await a.click('.modulo[data-v=home]'); await a.waitForSelector('.contador');
  ok(await a.locator('[data-go=tfnovo]').count() === 0, 'tela do turno continua sem "Lavrar TF neste turno"');
  // TF tirado com o formulário de TF aberto: volta para os módulos e o rascunho fica guardado
  await a.evaluate(() => go('tfnovo')); await a.waitForSelector('#tfForm'); await a.fill('#tf-nome', 'RASCUNHO GUARDADO'); await a.waitForTimeout(800);
  await perm(1, 0, 1); await sync();
  await a.waitForFunction(() => VIEW === 'modulos', null, { timeout: 10000 });
  const rasc = await a.evaluate(() => Store.meta('tfRascunho'));
  ok(rasc && rasc.dados && rasc.dados.nome === 'RASCUNHO GUARDADO', 'formulário de TF aberto quando o TF é retirado: volta aos módulos e o rascunho fica guardado');
  // PCE: botão "Termo de colheita" some com pce=0 (não chega a abrir o módulo)
  await perm(1, 1, 0); await sync();
  ok(await a.locator('.modulo[data-v=pce]').count() === 0, 'pce=0: o PCE some do menu');
  await a.screenshot({ path: amb.saida('permissoes_app_pce.png'), fullPage: true });
  await perm(1, 1, 1); await sync();


  const errs = [...new Set(erros)];
  ok(!errs.length, 'sem erros de console/página', errs);
  await b.close();
  console.log(falhas ? 'FALHOU=' + falhas : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('FALHOU=1', e.stack); process.exit(1); });
