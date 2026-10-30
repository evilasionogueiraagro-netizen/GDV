const amb = require('./lib/amb'); const U = require('./lib/usuarios');
// Impressão no celular (Android): o print() dentro do iframe imprimia a tela do app (Histórico/Resumo) em vez do Termo. Agora o documento
// pronto vai para a própria página (#gdv-impressao, shadow root) e, na impressão, só ele aparece. Dados fictícios.
const { APP } = amb;
let falhas = 0;
const ok = (c, m, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); if (!c) falhas++; };
const ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
(async () => {
  const b = await amb.lancar(), A = await U.fiscal('Fulano Ficticio Teste');
  const c = await b.newContext({ viewport: { width: 400, height: 860 }, userAgent: ANDROID, isMobile: true, hasTouch: true, permissions: ['geolocation'], geolocation: { latitude: -3.119, longitude: -60.0217, accuracy: 10 } });
  await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [A.token, A.nome]);
  // print() da página principal: registra o que está no documento de impressão nesse momento (no iframe não deve ser chamado)
  await c.addInitScript(() => { window.print = function () { const h = document.getElementById('gdv-impressao'), r = h && h.shadowRoot;
    (window.top.__prints = window.top.__prints || []).push({ quem: window === window.top ? 'pagina' : 'iframe', titulo: document.title,
      texto: r ? r.textContent.replace(/\s+/g, ' ') : '', folhas: r ? r.querySelectorAll('.a4').length : 0,
      imgs: r ? [...r.querySelectorAll('img')].map(i => ({ src: i.getAttribute('src').slice(0, 60), ok: i.complete && i.naturalWidth > 0 })) : [] }); }; });
  const p = await c.newPage(), err = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(APP); await p.waitForSelector('.modulo', { timeout: 15000 });
  await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno');
  await p.fill('#nTF', '30'); await p.selectOption('#nPosto', 'Fixa').catch(() => {}); await p.selectOption('#nLocal', 'BVA - CEASA').catch(() => {});
  await p.click('#fTurno button[type=submit]'); await p.waitForSelector('.contador');
  await p.click('nav [data-v=registrar]'); await p.waitForSelector('#fVeic'); await p.fill('#placa', 'AAA1A11'); await p.click('#fVeic > button'); await p.waitForTimeout(400);
  await p.click('nav [data-v=home]'); await p.click('#encerrar'); await p.waitForSelector('[data-doc=termo]');
  await p.evaluate(() => { window.__prints = []; }); await p.click('[data-doc=termo]');
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 });
  const pr = await p.evaluate(() => window.__prints[0]);
  ok(pr.quem === 'pagina' && /TERMO DE FISCALIZAÇÃO/.test(pr.texto) && /Fulano Ficticio Teste/.test(pr.texto), 'celular: imprime a página com o Termo dentro (não o iframe)', pr.texto.slice(0, 120));
  ok(pr.imgs.length > 0 && pr.imgs.every(i => i.ok && /^https?:|^data:/.test(i.src)), 'imagens do modelo (brasão, logos) com endereço completo e carregadas', pr.imgs);
  ok(/^Termo /.test(pr.titulo), 'título = nome do PDF ("Termo …")', pr.titulo);
  ok(!(await p.locator('iframe').count()), 'o iframe do modelo sai da página');
  await p.emulateMedia({ media: 'print' });
  const vis = await p.evaluate(() => ({ app: [...document.body.children].filter(e => e.id !== 'gdv-impressao' && getComputedStyle(e).display !== 'none').map(e => e.id || e.tagName),
    doc: getComputedStyle(document.getElementById('gdv-impressao')).display }));
  ok(!vis.app.length && vis.doc === 'block', 'na impressão só o documento aparece (a tela do app fica escondida)', vis);
  await p.pdf({ path: amb.saida('termo_celular.pdf'), format: 'A4', printBackground: true });
  await p.emulateMedia({ media: 'screen' });
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('gdv-impressao')).display) === 'none', 'na tela o documento não aparece (o app continua igual)');
  await p.click('nav [data-v=historico]'); await p.waitForTimeout(400);
  ok(!(await p.evaluate(() => !!document.getElementById('gdv-impressao'))), 'trocar de tela tira o documento da página');
  ok(!err.length, 'sem erros de página', err);
  await b.close(); console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
