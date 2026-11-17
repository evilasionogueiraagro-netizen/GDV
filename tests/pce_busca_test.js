const amb = require('./lib/amb');
const A = require('./lib/pce-app');
const path = require('path'), { spawn } = require('child_process');
// PCE — aparelho e planilha deixados explícitos: a busca de produtor (Produtores e Novo termo) procura sozinha na planilha com internet e avisa
// sem internet; o Relatório de atividades abre no programa que tem Termo e avisa o Termo que ainda não subiu, com
// "Enviar agora". E o local.js (GDV_LOCAL=1) aponta as páginas para o servidor local sem mudar o fakegas da suíte.
// App real + Code.gs real no fakegas. Dados fictícios.
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' -> ' + JSON.stringify(x).slice(0, 300))); if (!c) throw new Error(m); };
const texto = (p, sel) => p.evaluate(s => (document.querySelector(s) || {}).textContent || '', sel);
(async () => {
  const b = await amb.lancar();

  console.log('1) produtor cadastrado só na planilha (outro aparelho)');
  const pA = await A.aparelho(b, 'Pessoa Ficticia Busca Alfa');
  await A.identificar(pA);
  await A.novoProdutor(pA, { doc: '52998224725', nome: 'Fulano Ficticio Teste', propriedade: 'Sitio Busca Ficticio', codigo: 'PRP-BUS-1', municipio: 'Manaus',
    frutos: [{ cultura: 'Laranja', area: 1, quantidade: 50 }] });
  await A.sync(pA);

  console.log('2) Produtores: aparelho na hora, planilha sozinha, sem botão');
  const pB = await A.aparelho(b, 'Pessoa Ficticia Busca Beta');
  await A.identificar(pB);
  await pB.fill('#campoQ', 'sitio busca');
  await pB.waitForSelector('#campoSrv [data-campo=trazer]', { timeout: 15000 });
  ok(/Nenhum produtor encontrado neste aparelho/.test(await texto(pB, '#campoRes')) && await pB.locator('#campoRes .tf-novo').count() === 0,
    'com internet, "nada no aparelho" é texto discreto (sem aviso amarelo)', await texto(pB, '#campoRes'));
  ok(/Na planilha/.test(await texto(pB, '#campoSrv')) && /Fulano Ficticio Teste/i.test(await texto(pB, '#campoSrv')) && await pB.locator('#campo-servidor, #nt-planilha').count() === 0,
    'a planilha responde sozinha, sem o botão "Procurar no servidor"', await texto(pB, '#campoSrv'));
  await pB.click('#campoSrv [data-campo=trazer]'); await pB.waitForSelector('#pce-produtor');
  ok(/Sitio Busca Ficticio/i.test(await texto(pB, '#view')), 'tocar no resultado da planilha traz o cadastro e abre o produtor');
  await pB.click('nav [data-v=pce]'); await pB.waitForSelector('#campoQ'); await pB.fill('#campoQ', 'sitio busca');
  await pB.waitForFunction(() => /Nada além do que já está neste aparelho/.test(document.querySelector('#campoSrv').textContent), null, { timeout: 15000 });
  ok(await pB.locator('#campoRes [data-campo=abrir]').count() === 1 && await pB.locator('#campoSrv [data-campo=trazer]').count() === 0,
    'já no aparelho: aparece uma vez só (a planilha não repete)');
  await pB.fill('#campoQ', 'ninguem ficticio zzz');
  await pB.waitForFunction(() => /Nenhum produtor encontrado na planilha/.test(document.querySelector('#campoSrv').textContent), null, { timeout: 15000 });
  ok(true, 'sem resultado em nenhum dos dois: a planilha diz que não achou');

  console.log('3) Novo termo: a mesma busca');
  await pB.evaluate(() => go('pcenovotermo')); await pB.waitForSelector('#ntQ');
  await pB.fill('#ntQ', 'sitio busca');
  await pB.waitForFunction(() => /Nada além do que já está neste aparelho/.test(document.querySelector('#ntSrv').textContent), null, { timeout: 15000 });
  ok(await pB.locator('#ntLocal [data-campo=abrir]').count() === 1 && await pB.locator('#nt-planilha').count() === 0, 'Novo termo: aparelho + planilha automática, sem botão');

  console.log('4) sem internet: avisa que olhou só o aparelho');
  await pB.ctx.setOffline(true); await pB.evaluate(() => window.dispatchEvent(new Event('offline')));
  await pB.click('nav [data-v=pce]'); await pB.waitForSelector('#campoQ'); await pB.fill('#campoQ', 'outro ficticio');
  await pB.waitForSelector('#campo-sem-internet');
  ok(/olhou só este aparelho/.test(await texto(pB, '#campo-sem-internet')) && /Baixe os dados do município/.test(await texto(pB, '#campoRes .tf-novo')),
    'sem internet: aviso amarelo no aparelho e aviso de que a planilha não foi consultada');
  await pB.ctx.setOffline(false); await pB.evaluate(() => window.dispatchEvent(new Event('online')));

  console.log('5) Relatório de atividades: nome, programa do Termo e Termo que não subiu');
  await pA.evaluate(() => go('pcetermos')); await pA.waitForSelector('#mon-ir-rel');
  ok(/^\s*Relatório de atividades\s*$/.test(await pA.locator('#mon-ir-rel').textContent()), 'aba Termos: botão "Relatório de atividades"');
  await A.abrirProdutor(pA, 'sitio busca');
  // visita sem internet: o Termo fica no aparelho, com número provisório; a planilha continua fora quando a internet volta
  await fetch(amb.API + '/__off'); await pA.ctx.setOffline(true); await pA.evaluate(() => window.dispatchEvent(new Event('offline')));
  await A.visita(pA, { frutos: ['Laranja'], padrao: 'nao_detectada' });
  await pA.ctx.setOffline(false); await pA.evaluate(() => window.dispatchEvent(new Event('online')));
  await pA.evaluate(() => go('pcerel')); await pA.waitForSelector('#monRelForm');
  ok(/^\s*Relatório de atividades\s*$/.test(await pA.locator('#monRelForm h3').first().textContent()), 'tela com o título "Relatório de atividades"');
  ok(await pA.inputValue('#mr-praga') === 'citros', 'abre no programa que tem Termo no período (citros), não em Monilíase', await pA.inputValue('#mr-praga'));
  await pA.waitForSelector('#mr-pendentes');
  ok(/1 de 1 Termo\(s\) deste relatório ainda não subiram/.test(await texto(pA, '#mr-pendentes')) && await pA.locator('#mr-enviar').count() === 1,
    'Termo não enviado: aviso com a contagem e "Enviar agora"', await texto(pA, '#mr-pendentes'));
  await pA.click('#mr-enviar'); await pA.waitForSelector('#mr-enviar:not([disabled])', { timeout: 45000 });
  ok(await pA.locator('#mr-pendentes').count() === 1, 'planilha fora do ar: "Enviar agora" não some com o aviso');
  await fetch(amb.API + '/__on');
  if (await pA.locator('#mr-enviar').count()) await pA.click('#mr-enviar').catch(() => {});   // o envio automático pode chegar antes do clique
  await pA.waitForSelector('#mr-enviados', { timeout: 45000 });
  ok(/Todos os 1 Termo\(s\) deste relatório já estão na planilha/.test(await texto(pA, '#mr-enviados')) && await pA.locator('#mr-pendentes').count() === 0,
    'depois do envio: todos os Termos na planilha', await texto(pA, '#mr-enviados'));

  console.log('6) servidor local (local.js) e suíte');
  const html = await (await fetch(amb.APP)).text();
  ok(!/setItem\('gdv\.url'/.test(html), 'fakegas da suíte entrega as páginas sem mudar nada (sem GDV_LOCAL)');
  const srv = spawn(process.execPath, [path.join(__dirname, 'fakegas.js')], { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, GDV_LOCAL: '1', GDV_PORTA_WEB: '8191', GDV_PORTA_API: '8192' } });
  try {
    await new Promise((res, rej) => { srv.stdout.on('data', d => { if (String(d).includes('ready')) res(); }); srv.on('exit', c => rej(new Error('fakegas saiu: ' + c))); });
    const loc = await (await fetch('http://localhost:8191/painel/')).text();
    ok(/<head><script>try \{ localStorage\.setItem\('gdv\.url', 'http:\/\/localhost:8192\/'\)/.test(loc), 'com GDV_LOCAL=1 toda página já aponta para a API local (não cai na produção)');
  } finally { srv.kill(); }

  const erros = [...pA.err, ...pB.err].filter(e => !/fetch|rede|network|internet|resposta|offline/i.test(e));   // as quedas de rede são provocadas pelo teste
  ok(!erros.length, 'sem erros de código nos aparelhos', erros);
  await b.close();
})().catch(e => { console.error(e); process.exitCode = 1; process.exit(1); });
