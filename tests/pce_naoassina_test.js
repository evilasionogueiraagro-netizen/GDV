const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// PCE: produtor que não assina — foto dele segurando um documento de identificação no lugar da assinatura (tela, rascunho, PDF, Drive, edição).
const { API, APP } = amb;
const get = p => fetch(API + p).then(r => r.json());
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const ler = async aba => (await get('/__fn?nome=lerLeitura_&args=' + encodeURIComponent(JSON.stringify([aba])))).r;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
(async () => {
  const b = await amb.lancar();
  const r = await U.fiscal('Ana Paula Lima');
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.12, longitude: -60.02, accuracy: 9 } });
  await c.addInitScript(([t]) => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Ana Paula Lima'); localStorage.setItem('gdv.semInstalar', '1'); } }, [r.token]);
  await c.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { if (window === window.top && typeof CONFIG !== 'undefined') CONFIG.assinaturaNaTela = true; }));   // assinatura na tela está desligada no app (CONFIG.assinaturaNaTela); o teste liga para seguir conferindo esse código
  await c.addInitScript(() => { if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || [];
    window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' '), docImg: !!d.querySelector('.assinatura[data-papel=produtor] .area.doc img'), html: d.documentElement.outerHTML }); }; });
  const p = await c.newPage(); const err = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  const imagem = (w, h, cor) => p.evaluate(([w, h, cor]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = cor; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(w / 4, h / 4, w / 2, h / 2); return c.toDataURL('image/jpeg', 0.9).split(',')[1]; }, [w, h, cor]).then(s => Buffer.from(s, 'base64'));
  const arqsProd = () => p.evaluate(async () => (await Store.todos('arquivos')).filter(a => a.papel === 'produtor').map(a => ({ id: a.id, tipo: a.tipo, mime: a.mime, rotulo: a.rotulo })));
  const toast = () => p.textContent('#toast');

  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]'); await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
  await p.selectOption('#pce-s-cargo', { index: 1 }); await p.selectOption('#pce-s-lotacao', 'Manaus'); await p.click('#pce-s-salvar'); await p.waitForSelector('#pce-novolev');
  await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm');
  await p.fill('#pce-doc', '52998224725'); await p.fill('#pce-nome', 'Raimundo Nonato'); await p.fill('#pce-propriedade', 'Sítio Esperança');
  await p.selectOption('.pce-praga >> nth=0 >> .p-praga', 'Fusarium R4T'); await p.selectOption('.pce-cult >> nth=0 >> .c-cultura', 'Banana'); await p.click('.pce-cult >> nth=0 >> .pce-res-nao_detectada');

  ok(await p.isVisible('#pce-ass-produtor') && await p.isHidden('#pce-docprod') && !(await p.isChecked('#pce-naoassina')), 'começa com a assinatura na tela; opção "não assina" desmarcada');
  await p.check('#pce-naoassina');
  ok(await p.isHidden('#pce-ass-produtor') && await p.isVisible('#pce-docprod') && await p.isVisible('#pce-docprod-btn'), 'marcar "não assina": some a assinatura do produtor, aparece a foto com documento');
  await p.click('#pce-salvar'); await p.waitForTimeout(250);
  ok(/foto/.test(await toast()) && await p.locator('#pceLevForm').count() === 1, 'sem a foto não salva', await toast());
  await p.setInputFiles('#pce-docprod-in', [{ name: 'doc1.jpg', mimeType: 'image/jpeg', buffer: await imagem(2000, 1500, '#258') }]);
  await p.waitForSelector('#pce-docprod-prev img');
  await p.setInputFiles('#pce-docprod-in', [{ name: 'doc2.jpg', mimeType: 'image/jpeg', buffer: await imagem(1200, 1600, '#a52') }]);
  await p.waitForTimeout(300);
  let ap = await arqsProd();
  ok(ap.length === 1 && ap[0].tipo === 'foto' && ap[0].mime === 'image/jpeg' && /documento de identificação/.test(ap[0].rotulo), 'trocar a foto: fica só a última (foto, JPEG, com rótulo)', ap);
  ok(/Trocar a foto/.test(await p.textContent('#pce-docprod-btn')), 'botão vira "Trocar a foto"');
  await p.locator('#pce-docprod').scrollIntoViewIfNeeded(); await p.screenshot({ path: amb.saida('pce_naoassina_form.png') });

  // rascunho: recarregar e continuar mantém a opção e a foto
  await p.waitForTimeout(700); await p.reload(); await p.waitForSelector('#view *', { state: 'attached' });
  await p.evaluate(() => go('pcelev')); await p.waitForSelector('#pceLevForm');
  ok(await p.isChecked('#pce-naoassina') && await p.locator('#pce-docprod-prev img').count() === 1 && await p.isHidden('#pce-ass-produtor'), 'rascunho retomado: "não assina" marcado e a foto continua');

  await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto');
  const lev = await p.evaluate(async () => (await Store.todos('levantamentos'))[0]);
  const ass = JSON.parse(lev.assinaturas);
  ok(ass.produtorDoc === ap[0].id && !ass.produtor, 'salvo: assinaturas.produtorDoc = id da foto, sem assinatura do produtor', ass);

  await p.evaluate(() => { window.__prints = []; }); await p.locator('[data-pce=imprimirlev]').first().click();
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 10000 });
  const pr = await p.evaluate(() => window.__prints[0]);
  ok(pr.docImg && /Não assina: identificado\(a\) por foto com documento de identificação oficial/.test(pr.texto), 'ficha: foto com documento no lugar da assinatura do produtor, com o aviso');
  const pg = await c.newPage(); await pg.goto(APP + 'documentos/pce-levantamento.html');
  await pg.setContent(pr.html.replace('<head>', `<head><base href="${APP}documentos/">`)); await pg.waitForTimeout(300);
  await pg.pdf({ path: amb.saida('pce_naoassina.pdf'), format: 'A4', printBackground: true, margin: { top: '8mm', bottom: '8mm', left: '7mm', right: '7mm' } });
  await pg.setViewportSize({ width: 800, height: 1100 }); await pg.screenshot({ path: amb.saida('pce_naoassina_pdf.png'), fullPage: true }); await pg.close();

  for (let i = 0; i < 20; i++) { await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(300); if (!(await p.evaluate(async () => (await Sync.arquivosPendentes()).length))) break; }
  const arqS = await ler('Arquivos'), levS = (await ler('Levantamentos'))[0];
  ok(arqS.some(a => a.id === ap[0].id && a.tipo === 'foto' && a.papel === 'produtor'), 'foto com documento enviada ao Drive (aba Arquivos: foto, papel produtor)');
  ok(levS && JSON.parse(levS.assinaturas).produtorDoc === ap[0].id, 'planilha: assinaturas com produtorDoc');

  // edição: desmarcar volta a assinatura na tela; ao salvar, a foto sai do registro
  await p.evaluate(id => go('pcelev', id), lev.id); await p.waitForSelector('#pceLevForm');
  ok(await p.isChecked('#pce-naoassina') && await p.locator('#pce-docprod-prev img').count() === 1, 'editar: abre com "não assina" e a foto');
  await p.uncheck('#pce-naoassina');
  ok(await p.isVisible('#pce-ass-produtor') && await p.isHidden('#pce-docprod'), 'desmarcar: volta a assinatura na tela');
  const cv = p.locator('#pce-ass-produtor'); await cv.scrollIntoViewIfNeeded(); const bb = await cv.boundingBox();
  ok(bb && bb.width > 200 && bb.height > 60, 'quadro de assinatura com tamanho normal', bb);
  await p.mouse.move(bb.x + 20, bb.y + 30); await p.mouse.down(); await p.mouse.move(bb.x + 150, bb.y + 80, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(600);
  await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto');
  const ass2 = JSON.parse((await p.evaluate(async id => Store.obter('levantamentos', id), lev.id)).assinaturas);
  ok(ass2.produtor && !ass2.produtorDoc, 'salvo com a assinatura desenhada e sem a foto', ass2);
  ok(err.length === 0, 'sem erros de JavaScript', err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
