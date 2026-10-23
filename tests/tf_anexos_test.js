const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// TF de Barreira: fotos, assinatura na tela, recusa, QR code de autenticidade (verificar.html) e índice de reincidência sem internet.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { API, APP } = amb;
const ANO = new Date(Date.now() - 4 * 3600e3).getUTCFullYear();
const get = p => fetch(API + p).then(r => r.json());
const post = corpo => fetch(API, { method: 'POST', body: JSON.stringify(corpo) }).then(r => r.json());
const fn = (nome, args) => get('/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args || [])));
let falhas = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const qrcode = require(path.join(amb.RAIZ, 'web', 'vendor', 'qrcode.js'));
const h16 = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 16);

(async () => {
  const b = await amb.lancar();
  const credencial = async nome => { const r = await U.fiscal(nome); return { token: r.token, nome, uid: r.usuario.id }; };
  const aparelho = async ({ token, nome }) => {
    const c = await b.newContext({ viewport: { width: 400, height: 900 } });
    await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [token, nome]);
    // impressão: guarda o HTML do documento e um resumo (o PDF de verdade é gerado à parte, com page.pdf)
    await c.addInitScript(() => { if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || [];
      window.top.__prints.push({ html: d.documentElement.outerHTML, texto: d.body.innerText.replace(/\s+/g, ' '), paginas: d.querySelectorAll('.a4').length, vias: [...d.querySelectorAll('.via')].map(v => v.textContent),
        assImgs: d.querySelectorAll('.ass-img img').length, anexo: d.querySelectorAll('.anexo .anexo-fotos figure img').length,
        qr: [...d.querySelectorAll('.verif')].map(v => ({ url: v.getAttribute('data-url'), svg: (v.querySelector('svg') || {}).outerHTML || '', vis: !v.hidden })) }); }; });
    const p = await c.newPage(); p.err = []; p.on('pageerror', e => p.err.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && p.err.push(m.text()));
    p.on('dialog', d => d.type() === 'prompt' ? d.accept('digitação errada') : d.accept()); p.ctx = c;
    await p.goto(APP); await p.waitForSelector('#view *', { state: 'attached' }); await p.waitForTimeout(700); return p;
  };
  const sync = async p => { await p.evaluate(() => Sync.sincronizar()); await p.waitForFunction(() => ['ok', 'idle'].includes(Sync.estado().tipo) && !Sync.estado().pend, null, { timeout: 20000 }); };
  const irTF = async p => {
    if (await p.locator('nav [data-v=tf]').count()) await p.click('nav [data-v=tf]');
    else { if (!(await p.locator('.modulo').count())) await p.click('nav [data-v=modulos]'); await p.click('.modulo[data-v=tf]'); }
    await p.waitForSelector('button[data-tf=novo]');
  };
  const novoTF = async p => { await p.click('button[data-tf=novo]'); await p.waitForSelector('#tfForm'); await p.waitForFunction(() => document.querySelector('#tf-numero b'), null, { timeout: 10000 }); };
  async function preencher(p, { doc, nome, placa, produto = 'MANGA', proc = 'apreensao' }) {
    await p.fill('#tf-doc', doc); await p.waitForFunction(() => /Novo cadastro|Cadastro encontrado/.test(document.querySelector('#tf-st-doc').textContent), null, { timeout: 8000 });
    if (nome) await p.fill('#tf-nome', nome);
    await p.fill('#tf-endereco', 'RUA DAS FLORES 10'); await p.fill('#tf-municipio', 'MANAUS'); await p.fill('#tf-uf', 'am'); await p.fill('#tf-telefone', '92999990000');
    if (placa) await p.fill('#tf-placa', placa);
    await p.check(`input[name=tf-proc][value=${proc}]`);
    await p.selectOption('#tf-produtos .prod select >> nth=0', produto); await p.fill('#tf-produtos .prod input', '10');
  }
  const gerar = async p => { await p.click('#tfForm button[type=submit]'); await p.waitForSelector('#tf-num-m', { timeout: 15000 }); await p.click('#tf-m-ok'); await p.waitForSelector('text=TF gerado', { timeout: 10000 }); };
  const imagem = (p, w, h, cor) => p.evaluate(([w, h, cor]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = cor; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(w / 4, h / 4, w / 2, h / 2); return c.toDataURL('image/jpeg', 0.9).split(',')[1]; }, [w, h, cor]).then(s => Buffer.from(s, 'base64'));
  // assina na janela do canvas: toca em "Assinar na tela" do papel, desenha e salva
  const assinar = async (p, papel) => {
    await p.click(`[data-tf=assinar][data-papel=${papel}]`); await p.waitForSelector('#tf-canvas');
    const bb = await p.locator('#tf-canvas').boundingBox();
    await p.mouse.move(bb.x + 20, bb.y + 30); await p.mouse.down(); await p.mouse.move(bb.x + 140, bb.y + 120, { steps: 8 }); await p.mouse.move(bb.x + 260, bb.y + 40, { steps: 8 }); await p.mouse.up();
    await p.click('#tf-c-ok'); await p.waitForSelector('#tf-canvas', { state: 'detached' });
  };
  const imprimir = async p => { await p.evaluate(() => { window.__prints = []; }); await p.click('[data-tf=imprimir]'); await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 10000 }); return p.evaluate(() => window.__prints[0]); };
  const tfsPlanilha = async () => (await fn('lerLeitura_', ['TFs'])).r;
  const json = (v, pad) => { try { return JSON.parse(v); } catch (e) { return pad; } };

  const fA = await credencial('Ana Paula Lima'), fB = await credencial('Bruno Costa Souza');

  console.log('A) fotos + assinaturas no formulário do TF (rascunho guarda tudo)');
  const A = await aparelho(fA); await irTF(A); await novoTF(A);
  ok(await A.locator('#tf-fotos').count() === 1 && /Fotos \(opcional\)/.test(await A.textContent('#tfForm')) && await A.locator('[data-tf=assinar][data-papel=fiscalizado]').count() === 1
    && await A.locator('[data-tf=assinar][data-papel=servidor]').count() === 1 && await A.locator('#tf-recusa').count() === 1, 'formulário tem "Fotos (opcional)", "Assinar na tela" (fiscalizado e servidor) e a opção de recusa');
  await preencher(A, { doc: '529.982.247-25', nome: 'josé da silva', placa: 'abc-1d23' });
  await A.setInputFiles('#tf-fotos', [{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await imagem(A, 2400, 1800, '#a52') }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: await imagem(A, 800, 600, '#25a') }]);
  await A.waitForFunction(() => document.querySelectorAll('#tf-fotos-prev .pce-foto img').length === 2, null, { timeout: 10000 });
  const fotoInfo = await A.evaluate(async () => { const ids = [...document.querySelectorAll('#tf-fotos-prev .pce-foto')].map(e => e.dataset.id); const a = await Store.obter('arquivos', ids[0]);
    const im = new Image(); im.src = a.dados; await im.decode(); return { n: ids.length, dono: a.dono, tipo: a.tipo, mime: a.mime, lado: Math.max(im.naturalWidth, im.naturalHeight) }; });
  ok(fotoInfo.n === 2 && fotoInfo.dono === 'tfs' && fotoInfo.tipo === 'foto' && fotoInfo.mime === 'image/jpeg' && fotoInfo.lado === 1600, 'fotos guardadas no aparelho (store arquivos, dono "tfs") e reduzidas como no PCE (lado maior 1600 px): ' + JSON.stringify(fotoInfo));
  await assinar(A, 'fiscalizado'); await assinar(A, 'servidor');
  ok(await A.locator('#tf-ass-card .tf-ass-img').count() === 2, 'as duas assinaturas aparecem no formulário');
  await A.waitForTimeout(700);
  // sai e volta: o rascunho traz as fotos e as assinaturas
  await A.click('nav [data-v=tf]'); await A.waitForSelector('button[data-tf=novo]'); await novoTF(A);
  await A.waitForFunction(() => document.querySelectorAll('#tf-fotos-prev .pce-foto img').length === 2, null, { timeout: 8000 }).catch(() => {});
  ok(await A.locator('#tf-fotos-prev .pce-foto img').count() === 2 && await A.locator('#tf-ass-card .tf-ass-img').count() === 2 && (await A.inputValue('#tf-nome')).toUpperCase() === 'JOSÉ DA SILVA',
    'rascunho restaurado com as 2 fotos e as 2 assinaturas');
  // limite de fotos: CONFIG.TF.maxFotos
  ok(await A.evaluate(() => CONFIG.TF.maxFotos) === 10, 'limite de fotos por TF em CONFIG.TF.maxFotos (padrão 10)');
  await gerar(A);
  const tfs1 = await tfsPlanilha(), t1 = tfs1[0];
  const ass1 = json(t1.assinaturas, {}), fotos1 = json(t1.fotos, []);
  ok(tfs1.length === 1 && fotos1.length === 2 && ass1.fiscalizado && ass1.servidor && t1.recusaAssinatura === 0, 'planilha (aba TFs): colunas fotos (2 ids), assinaturas {fiscalizado, servidor} e recusaAssinatura = 0');
  const cab = (await get('/__aba?nome=TFs'))[0];
  ok(cab.slice(-7).join(',') === 'fotos,assinaturas,recusaAssinatura,ufOrigem,ufDestino,registroAntigo,pdfs', 'colunas novas no fim da aba TFs (as do TF do papel por último): ' + cab.slice(-8).join(','));
  await sync(A);
  const dr = await get('/__drive'), noTF = dr.arquivos.filter(x => x.caminho === `GDV - Arquivos/TF/${ANO}`);
  ok(noTF.length === 4 && noTF.filter(x => x.mime === 'image/jpeg').length === 2 && noTF.filter(x => x.mime === 'image/png').length === 2 && noTF.every(x => !x.compartilhado && x.nome.startsWith(t1.id)),
    `Drive falso recebeu 2 fotos e 2 assinaturas em "GDV - Arquivos/TF/${ANO}" (sem compartilhar): ` + noTF.map(x => x.nome.slice(37)).join(' | '));
  ok(!dr.pastas.some(x => /PCE\/\d{4}\/tfs/.test(x)), 'nada do TF na pasta do PCE');
  const arqAba = (await fn('lerLeitura_', ['Arquivos'])).r.filter(x => x.dono === 'tfs');
  ok(arqAba.length === 4 && arqAba.some(x => x.papel === 'fiscalizado') && arqAba.some(x => x.papel === 'servidor'), 'aba Arquivos: 4 registros do TF (papéis fiscalizado e servidor)');
  ok(await A.evaluate(async () => (await Sync.arquivosPendentes()).length) === 0, 'nada pendente no aparelho depois de sincronizar');

  console.log('B) PDF/HTML do TF: assinaturas nas duas vias, anexo fotográfico no fim e QR code de autenticidade');
  const pr = await imprimir(A);
  const urlEsperada = APP + 'verificar.html?t=' + t1.id;
  ok(pr.paginas === 3 && pr.vias.join('|') === '1ª via|2ª via|Anexo', '2 vias + 1 folha de anexo (o anexo vai uma vez, no fim): ' + pr.vias.join('|'));
  ok(pr.assImgs === 4, 'assinatura na tela no lugar da linha, nas duas vias (2 imagens × 2 vias)');
  ok(pr.anexo === 2 && pr.texto.includes(`Anexo fotográfico — TF nº ${t1.numeroTxt}`) && /Foto 1 de 2 — \d\d\/\d\d\/\d{4}/.test(pr.texto), 'anexo fotográfico: título com o nº do TF e legenda nº/data');
  ok(pr.qr.length === 3 - 1 && pr.qr.every(q => q.vis && q.url === urlEsperada && /<svg/.test(q.svg)), 'QR code nas duas vias com a URL de verificação: ' + (pr.qr[0] || {}).url);
  { const q = qrcode(0, 'M'); q.addData(urlEsperada); q.make(); const caminho = s => (/ d="([^"]+)"/.exec(s) || [])[1];
    ok(caminho(q.createSvgTag({ cellSize: 2, margin: 4, scalable: true })) === caminho(pr.qr[0].svg), 'o desenho do QR é o da URL de verificação (mesma matriz gerada pela biblioteca)'); }
  ok(pr.texto.includes('Verifique a autenticidade:') && pr.texto.includes('localhost:' + amb.PORTA_WEB + '/verificar.html') && pr.texto.includes('Código: ' + t1.id), 'texto "Verifique a autenticidade: <endereço>" e o código do TF');
  // PDF de verdade: cada via continua numa folha A4, com testemunhas e rodapé; o anexo fica nas folhas seguintes
  { const html = pr.html.replace('<head>', '<head><base href="' + APP + 'documentos/">');
    const q = await A.ctx.newPage(); await q.setContent(html, { waitUntil: 'load' }); await q.waitForTimeout(400);
    await q.pdf({ path: amb.saida('tf_anexos.pdf'), preferCSSPageSize: true, printBackground: true }); await q.close();
    let pags = null;
    try { pags = JSON.parse(require('child_process').execFileSync('python3', ['-c', `
import sys, json, pypdf
r = pypdf.PdfReader(sys.argv[1])
print(json.dumps([[('Testemunha' in pg.extract_text()), ('Anexo fotogr' in pg.extract_text())] for pg in r.pages]))`, amb.saida('tf_anexos.pdf')]).toString()); } catch (e) { console.log('   (pypdf indisponível: ' + e.message.split('\n')[0] + ')'); }
    if (pags) ok(pags.length === 3 && pags[0][0] && pags[1][0] && !pags[2][0] && pags[2][1], 'PDF: via 1 e via 2 numa folha cada (com testemunhas) + anexo na 3ª folha: ' + JSON.stringify(pags)); }

  console.log('C) recusa de assinatura e assinatura na tela de detalhes (depois de gerar)');
  await A.click('[data-tf=novo]'); await A.waitForSelector('#tfForm'); await A.waitForFunction(() => document.querySelector('#tf-numero b'));
  await preencher(A, { doc: '111.444.777-35', nome: 'Maria Souza', proc: 'liberacao', produto: 'CAJU' });
  await A.check('#tf-recusa'); await A.waitForTimeout(300);
  ok(await A.locator('[data-tf=assinar][data-papel=fiscalizado]').count() === 0 && /Recusou-se a assinar/.test(await A.textContent('#tf-ass-fiscalizado')), 'com a recusa marcada, o fiscalizado não assina na tela');
  await gerar(A);
  ok(await A.locator('#tf-ass-card').count() === 1 && await A.locator('[data-tf=assinar][data-papel=servidor]').count() === 1, 'tela do TF gerado: assinaturas antes de imprimir');
  await assinar(A, 'servidor'); await A.waitForFunction(() => document.querySelectorAll('#tf-ass-card .tf-ass-img').length === 1);
  const pr2 = await imprimir(A);
  ok(pr2.paginas === 2 && pr2.assImgs === 2 && (pr2.texto.match(/Recusou-se a assinar/g) || []).length === 2 && pr2.texto.includes('Atestado por Ana Paula Lima'), 'PDF: "Recusou-se a assinar" + servidor e hora no lugar da assinatura do fiscalizado (2 vias) e a assinatura do servidor feita depois');
  await sync(A);
  const t2 = (await tfsPlanilha()).find(t => t.doc === '11144477735');
  ok(t2 && t2.recusaAssinatura === 1 && json(t2.assinaturas, {}).servidor && !json(t2.assinaturas, {}).fiscalizado, 'planilha: recusaAssinatura = 1 e a assinatura do servidor (feita na tela de detalhes) chegou');
  ok((await get('/__drive')).arquivos.filter(x => x.caminho === `GDV - Arquivos/TF/${ANO}`).length === 5, 'assinatura feita depois também foi para o Drive');
  // sem foto: o PDF não ganha anexo
  ok(!/Anexo fotográfico/.test(pr2.texto), 'TF sem fotos: sem folha de anexo');

  console.log('D) painel: só contagens (nFotos, assinado), nunca ids/imagens');
  const pd = await post({ action: 'painelDados', key: 'segredo', de: new Date(Date.now() - 4 * 3600e3 - 5 * 864e5).toISOString().slice(0, 10), ate: new Date(Date.now() - 4 * 3600e3 + 864e5).toISOString().slice(0, 10) });
  const p1 = (pd.tfs || []).find(x => x.id === t1.id), p2 = (pd.tfs || []).find(x => x.id === t2.id);
  ok(p1 && p1.nFotos === 2 && p1.assinado === 1 && p2 && p2.nFotos === 0 && p2.assinado === 1 && !('fotos' in p1) && !('assinaturas' in p1) && !JSON.stringify(pd.tfs).includes(fotos1[0]), 'painelDados: nFotos/assinado sem ids de arquivos');

  console.log('E) verificar.html: autêntico / não encontrado / cancelado, sem dados pessoais');
  const V = await b.newContext({ viewport: { width: 390, height: 800 } }); await V.addInitScript(() => { localStorage.setItem('gdv.url', window.__GDV_API); });
  const vp = await V.newPage(); vp.err = []; vp.on('pageerror', e => vp.err.push(e.message));
  const verificar = async id => { await vp.goto(APP + 'verificar.html?t=' + encodeURIComponent(id)); await vp.waitForFunction(() => /autêntico|Não encontrado|CANCELADO|Muitas consultas/.test(document.querySelector('#resultado').textContent), null, { timeout: 10000 }); return vp.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')); };
  const PESSOAIS = ['529.982.247-25', '52998224725', 'JOSÉ', 'RUA DAS FLORES', '92999990000', 'MANGA', 'ABC1D23', 'ABC-1D23'];
  let txt = await verificar(t1.id);
  ok(/Documento autêntico/.test(txt) && txt.includes(t1.numeroTxt) && txt.includes('Ana Paula Lima') && /Apreensão/.test(txt) && txt.includes('Barreira Porto da CEASA') && /Válido/.test(txt) && txt.includes('ABC***3'), 'autêntico: nº, data/hora, barreira, procedimento, servidor, situação e placa mascarada');
  ok(PESSOAIS.every(x => !txt.includes(x)), 'sem CPF, nome, endereço, telefone, produtos nem placa completa');
  await vp.screenshot({ path: amb.saida('verificar_autentico.png') });
  txt = await verificar(crypto.randomUUID());
  ok(/Não encontrado/.test(txt) && /não ter sido sincronizado \(TF emitido sem internet\)/.test(txt) && /Confirme com a ADAF/.test(txt), 'id desconhecido: "Não encontrado — pode ainda não ter sido sincronizado…"');
  await irTF(A); await A.locator(`#tfItens .item:has-text("${t2.numeroTxt}") [data-tf=cancelar]`).click(); await A.waitForFunction(() => /CANCELADO/.test(document.querySelector('#tfItens').textContent)); await sync(A);
  txt = await verificar(t2.id);
  ok(/TF CANCELADO/.test(txt) && /digitação errada/.test(txt) && await vp.locator('.selo.cancelado').count() === 1 && !txt.includes('11144477735') && !txt.includes('Maria'), 'cancelado: destaque vermelho com o motivo, sem dados pessoais');
  await vp.screenshot({ path: amb.saida('verificar_cancelado.png') });
  const rv = await post({ action: 'tfVerificar', id: t1.id });
  ok(rv.ok && rv.encontrado && Object.keys(rv.tf).sort().join(',') === 'barreira,data,emitidoEm,hora,motivoCancel,numeroTxt,placa,procedimento,servidor,situacao', 'tfVerificar responde sem credencial e só com os campos públicos: ' + Object.keys(rv.tf).join(','));
  ok(!vp.err.length, 'verificar.html sem erros: ' + JSON.stringify(vp.err));

  console.log('F) índice de reincidência: sem dados pessoais em claro');
  const ix = await post({ action: 'tfIndiceReincidencia', key: fB.token, desde: 0 });
  const eDoc = (ix.itens || []).find(x => x.h === h16('doc:52998224725')), ePl = (ix.itens || []).find(x => x.h === h16('placa:ABC1D23'));
  ok(ix.ok && eDoc && eDoc.n === 1 && eDoc.ap === 1 && ePl && ePl.ap === 1 && /^\d{4}-\d\d-\d\d$/.test(eDoc.ult), 'índice: chave = SHA-256("doc:"+dígitos) e SHA-256("placa:"+placa) (16 hex), com apreensões e último TF');
  ok(!(ix.itens || []).some(x => x.h === h16('doc:11144477735')) && !/52998224725|ABC1D23|JOS|Maria/.test(JSON.stringify(ix)), 'TF cancelado fora do índice; nenhum CPF/placa/nome em claro');
  const inc = await post({ action: 'tfIndiceReincidencia', key: fB.token, desde: Date.now() + 5000 });
  ok(inc.ok && inc.completo === false && inc.itens.length === 0, 'incremental (desde): só o que mudou depois (nada)');

  console.log('G) consulta de reincidência sem internet (Bruno, outro aparelho)');
  const Bd = await aparelho(fB); await sync(Bd);
  await Bd.waitForFunction(async () => !!(await Store.meta('tfIndice')), null, { timeout: 10000 });
  ok(await Bd.evaluate(async () => Object.keys((await Store.meta('tfIndice')).itens).length) >= 2, 'índice baixado na sincronização (meta "tfIndice")');
  await irTF(Bd); await Bd.ctx.setOffline(true); await Bd.evaluate(() => window.dispatchEvent(new Event('offline')));
  await novoTF(Bd);
  await Bd.fill('#tf-doc', '529.982.247-25'); await Bd.waitForFunction(() => /TF(\(s\))? anterior/.test(document.querySelector('#tf-st-doc').textContent), null, { timeout: 8000 });
  let st = await Bd.textContent('#tf-st-doc');
  ok(/REINCIDENTE/.test(st) && /1 TF\(s\) anterior\(es\)/.test(st) && /sem conexão: histórico até \d\d:\d\d de \d\d\/\d\d \+ este aparelho/.test(st), 'offline: CPF de TF de outro aparelho aparece REINCIDENTE, com "(sem conexão: histórico até HH:MM de DD/MM + este aparelho)"');
  await Bd.fill('#tf-placa', 'ABC1D23'); await Bd.waitForFunction(() => /REINCIDENTE/.test(document.querySelector('#tf-st-placa').textContent), null, { timeout: 8000 });
  ok(/sem conexão: histórico até/.test(await Bd.textContent('#tf-st-placa')), 'offline: a placa também é reconhecida pelo índice');
  await Bd.fill('#tf-placa', '');
  // TF gerado sem internet neste aparelho: soma ao índice (sem contar em dobro depois de sincronizar)
  await Bd.fill('#tf-nome', 'JOSE DA SILVA'); await Bd.fill('#tf-local', 'BR-319'); await Bd.check('input[name=tf-proc][value=liberacao]'); await gerar(Bd);
  const contar = async () => { await Bd.click('nav [data-v=tf]'); await Bd.waitForSelector('button[data-tf=novo]'); await novoTF(Bd); await Bd.fill('#tf-doc', '529.982.247-25');
    await Bd.waitForFunction(() => /TF(\(s\))? anterior/.test(document.querySelector('#tf-st-doc').textContent), null, { timeout: 8000 }); const s = await Bd.textContent('#tf-st-doc');
    await Bd.click('[data-tf=descartar]'); await Bd.waitForSelector('button[data-tf=novo]'); return s; };
  st = await contar();
  ok(/2 TF\(s\) anterior\(es\)/.test(st) && /1 apreensão/.test(st) && /1 liberação/.test(st), 'offline: índice (1) + TF ainda não enviado deste aparelho (1) = 2');
  await Bd.ctx.setOffline(false); await Bd.evaluate(() => window.dispatchEvent(new Event('online'))); await sync(Bd);
  await Bd.ctx.setOffline(true); await Bd.evaluate(() => window.dispatchEvent(new Event('offline')));
  st = await contar(); ok(/2 TF\(s\) anterior\(es\)/.test(st), 'depois de enviar (índice ainda antigo): continua 2');
  await Bd.ctx.setOffline(false); await Bd.evaluate(() => window.dispatchEvent(new Event('online'))); await sync(Bd);
  ok(await Bd.evaluate(() => Sync.atualizarIndice(true)) === true, 'índice atualizado (incremental)');
  await Bd.ctx.setOffline(true); await Bd.evaluate(() => window.dispatchEvent(new Event('offline')));
  st = await contar(); ok(/2 TF\(s\) anterior\(es\)/.test(st), 'com o índice novo (já com o TF deste aparelho): 2, sem contar em dobro');
  await Bd.ctx.setOffline(false); await Bd.evaluate(() => window.dispatchEvent(new Event('online')));
  // online volta a consultar o servidor (histórico completo, sem a nota de "sem conexão")
  await novoTF(Bd); await Bd.fill('#tf-doc', '529.982.247-25'); await Bd.waitForFunction(() => /TF(\(s\))? anterior/.test(document.querySelector('#tf-st-doc').textContent), null, { timeout: 8000 });
  st = await Bd.textContent('#tf-st-doc'); ok(/2 TF\(s\)/.test(st) && !/sem conexão/.test(st) && /0001\//.test(st), 'online: histórico do servidor com os últimos TFs detalhados');
  await Bd.click('[data-tf=descartar]'); await Bd.waitForSelector('button[data-tf=novo]');

  console.log('H) servidor: permissões e limites');
  await U.permissoes(fB.uid, U.lista({ veiculos: 1, tf: 0, pce: 1 }));
  const foto = (await imagem(A, 50, 50, '#000')).toString('base64');
  const arq = dono => post({ action: 'arquivoEnviar', key: fB.token, arquivo: { id: crypto.randomUUID(), dono, donoId: 'x1', tipo: 'foto', papel: '', mime: 'image/jpeg' }, base64: foto });
  let r1 = await arq('tfs'), r2 = await arq('levantamentos');
  ok(!r1.ok && r1.semPermissao === 'tf' && r2.ok, 'arquivoEnviar: foto de TF exige o módulo TF (a do PCE continua pelo PCE)');
  r1 = await post({ action: 'tfIndiceReincidencia', key: fB.token }); ok(!r1.ok && r1.semPermissao === 'tf', 'tfIndiceReincidencia exige o módulo TF');
  r1 = await post({ action: 'arquivoEnviar', key: fA.token, arquivo: { id: crypto.randomUUID(), dono: 'tfs', donoId: 'x1', tipo: 'documento', papel: '', mime: 'application/pdf' }, base64: Buffer.from('%PDF-1.4 x').toString('base64') });
  ok(!r1.ok && r1.semPermissao === 'antigo', 'PDF de TF só com "Digitar do papel" (TF do papel): ' + r1.erro);
  let bloqueou = 0;
  for (let i = 0; i < 70 && !bloqueou; i++) { const r = await post({ action: 'tfVerificar', id: 'nao-existe-' + i }); if (!r.ok && /Muitas consultas/.test(r.erro)) bloqueou = i + 1; }
  ok(bloqueou >= 29 && bloqueou <= 61, `tfVerificar: depois de 30 consultas inválidas no minuto (somando a do item E), recusa ("Muitas consultas") — bloqueou na ${bloqueou}ª`);

  ok(![A, Bd].some(p => p.err.length), 'sem erros de console/página: ' + JSON.stringify([...A.err, ...Bd.err]));
  console.log('FALHOU=' + falhas);
  await b.close();
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error('✗ erro', e); process.exit(1); });
