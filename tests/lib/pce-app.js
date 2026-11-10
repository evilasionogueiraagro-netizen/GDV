// Roteiro do app de campo do PCE (web/js/campo.js, pce-cadastros.js, moniliase.js): identificar o servidor, cadastrar produtor, propriedade e frutos,
// fazer a visita em passos. Usado pelos testes do PCE. Dados sempre fictícios.
const amb = require('./amb');
const U = require('./usuarios');

/** Aparelho (contexto a 400 px, com GPS) já com a conta do fiscal; devolve a página no módulo de módulos. */
async function aparelho(b, nome, o = {}) {
  const f = await U.fiscal(nome, o.conta);
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.1234567, longitude: -58.4432, accuracy: 9 } });
  await c.addInitScript(i => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } } catch (e) { /* sem armazenamento */ } }, f.ls);
  if (o.assinaturaNaTela) await c.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { if (window === window.top && typeof CONFIG !== 'undefined') CONFIG.assinaturaNaTela = true; }));
  // captura o que o app manda imprimir (o modelo roda num iframe): texto, HTML e quantidade de folhas
  await c.addInitScript(() => { if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || [];
    window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' '), paginas: d.querySelectorAll('.a4').length, html: d.documentElement.outerHTML, docImg: !!d.querySelector('.assinatura[data-papel=produtor] .area.doc img, [data-ass=produtor] .ass-img.doc img') }); }; });
  const p = await c.newPage(); p.err = []; p.ctx = c; p.conta = f;
  p.on('pageerror', e => p.err.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && p.err.push(m.text()));
  p.on('dialog', d => (d.type() === 'prompt' ? d.accept('digitação errada') : d.accept()));
  await p.goto(amb.APP); await p.waitForSelector('.modulo[data-v=pce]');
  return p;
}
/** Abre o módulo PCE e, na primeira vez, identifica o servidor (cargo e lotação). Termina na lista de produtores. */
async function identificar(p, lotacao = 'Manaus') {
  if (!(await p.locator('.modulo[data-v=pce]').count())) await p.click('nav [data-v=modulos]');
  await p.click('.modulo[data-v=pce]');
  await p.waitForSelector('#pceServForm, #campo-novo');
  if (await p.locator('#pceServForm').count()) {
    await p.selectOption('#pce-s-cargo', { index: 1 }); await p.fill('#pce-s-matricula', '12345'); await p.selectOption('#pce-s-lotacao', lotacao);
    await p.click('#pce-s-salvar'); await p.waitForSelector('#campo-novo');
  }
}
const aba = async (nome) => { const l = await (await fetch(amb.API + '/__aba?nome=' + nome)).json(); return l.slice(1).map(r => Object.fromEntries(l[0].map((k, i) => [k, r[i]]))); };
/** Produtor novo: {doc, nome, propriedade, codigo, municipio, frutos:[{cultura, cultivar, area, quantidade}]}; termina na tela do produtor. */
async function novoProdutor(p, o) {
  await p.click('nav [data-v=pce]'); await p.waitForSelector('#campo-novo'); await p.click('#campo-novo'); await p.waitForSelector('#pceProdForm');
  await p.fill('#pp-doc', o.doc); await p.fill('#pp-nome', o.nome); await p.fill('#pp-prop', o.propriedade || ''); await p.fill('#pp-codigo', o.codigo || '');
  await p.selectOption('#pp-municipio', o.municipio || 'Manaus');
  for (const [i, f] of (o.frutos || []).entries()) {
    await p.click('#pp-addfruto');
    const b = p.locator('.pc-fruto').nth(i);
    await b.locator('.f-cultura').selectOption(f.cultura);
    if (f.cultivar) await b.locator('.f-cultivar').fill(f.cultivar);
    if (f.area) await b.locator('.f-area').fill(String(f.area));
    if (f.quantidade) await b.locator('.f-quantidade').fill(String(f.quantidade));
  }
  await p.click('#pp-salvar'); await p.waitForSelector('#pce-produtor');
}
/** Abre a tela do produtor pela busca da lista (como o fiscal faz). */
async function abrirProdutor(p, busca) {
  await p.click('nav [data-v=pce]'); await p.waitForSelector('#campoQ');
  await p.fill('#campoQ', busca); await p.waitForSelector('.campo-res-item'); await p.locator('.campo-res-item').first().click(); await p.waitForSelector('#pce-produtor');
}
const bloco = (p, cultura) => p.locator('.pce-cultura', { has: p.locator('b', { hasText: cultura }) }).first();
/**
 * Visita completa. o = {frutos: [cultura...], resultados: {cultura: {praga: resultado}}, padrao: 'nao_detectada' (obrigatórias sem resposta; a opcional já vem marcada "Não tem" e só é tocada se estiver em resultados),
 * amostra: {cultura: {tipo, codigo, destino, qtd}}, plantas: {cultura: n}, fotos: {cultura: [arquivos]}, naoAssina: false, parar: 'passo' (para antes de concluir),
 * aoPasso: async passo => {} (chamado com 1, '2-vazio', 2, 3, 4, 5 e 'pronta', para quem fotografa as telas)}.
 * Parte da tela do produtor (#pce-novavisita) e termina na tela da visita concluída (#pce-visita-pronta).
 */
async function visita(p, o) {
  await p.locator('#pce-novavisita').first().click(); await p.waitForSelector('#pceVisitaForm');
  for (const c of o.frutos) await p.locator('label.vi-fruto', { hasText: c }).locator('input').check();
  if (o.aoPasso) await o.aoPasso(1);
  await p.click('#vi-continuar'); await p.waitForSelector('.pce-pr');
  if (o.aoPasso) await o.aoPasso('2-vazio');
  const n = await p.locator('.pce-pr').count();
  for (let i = 0; i < n; i++) {
    const e = p.locator('.pce-pr').nth(i), nome = await e.getAttribute('data-nome'), cult = (await e.locator('xpath=ancestor::div[contains(@class,"pce-cultura")]//b').first().textContent()).trim().replace(/\s*\(.*\)$/, '');   // sem a cultivar
    const res = ((o.resultados || {})[cult] || {})[nome] || (await e.getAttribute('data-opcional') ? '' : (o.padrao || 'nao_detectada'));
    if (res) await e.locator('.pce-res-' + res).click();
  }
  if (o.aoPasso) await o.aoPasso(2);
  if (o.parar === 2) return;
  await p.click('#vi-continuar'); await p.waitForSelector('.v-plantas');
  for (const [cult, a] of Object.entries(o.amostra || {})) {
    const b = bloco(p, cult);
    await b.locator('fieldset[data-k=c] label:has(input[value=sim])').click();
    if (a.tipo) await b.locator('.v-tipoMaterial').fill(a.tipo);
    if (a.codigo) await b.locator('.v-codigoAmostra').fill(a.codigo);
    if (a.destino) await b.locator('.v-destinoAmostra').fill(a.destino);
    if (a.qtd) await b.locator('.v-qtd').fill(String(a.qtd));
  }
  for (const [cult, n2] of Object.entries(o.plantas || {})) await bloco(p, cult).locator('.v-plantas').fill(String(n2));
  for (const [cult, arqs] of Object.entries(o.fotos || {})) { await bloco(p, cult).locator('.v-fotos').setInputFiles(arqs); await bloco(p, cult).locator('.pce-foto img').first().waitFor(); }
  if (o.aoPasso) await o.aoPasso(3);
  if (o.parar === 3) return;
  await p.click('#vi-continuar'); await p.waitForSelector('#vi-local');
  if (o.aoPasso) await o.aoPasso(4);
  if (o.parar === 4) return;
  await p.click('#vi-continuar'); await p.waitForSelector('#vi-resumo');
  if (o.aoPasso) await o.aoPasso(5);
  if (o.parar === 5) return;
  await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta', { timeout: 20000 });
  if (o.aoPasso) await o.aoPasso('pronta');
}
const imagem = (p, w, h, cor) => p.evaluate(([w, h, cor]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = cor; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(w / 4, h / 4, w / 2, h / 2); return c.toDataURL('image/jpeg', 0.9).split(',')[1]; }, [w, h, cor]).then(s => Buffer.from(s, 'base64'));
/** Sincroniza até não haver pendência (registros e arquivos). */
async function sync(p) {
  for (let i = 0; i < 25; i++) {
    await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(250);
    const pend = await p.evaluate(async () => { let t = 0; for (const s of ['pessoas', 'levantamentos', 'colheitas', 'propriedades', 'cadastrosPce', 'termosPce']) t += (await Store.todos(s)).filter(x => x.pendente).length; return t + (await Sync.arquivosPendentes()).length; });
    if (!pend && await p.evaluate(() => Sync.estado().tipo === 'ok')) return;
  }
  throw new Error('sync não terminou');
}
/** Clica no botão que manda imprimir e devolve o que foi impresso. */
async function imprimir(p, sel) {
  await p.evaluate(() => { window.__prints = []; });
  await p.locator(sel).first().click();
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 });
  return p.evaluate(() => window.__prints[window.__prints.length - 1]);
}
/** Grava o HTML impresso como PDF e PNG em saida/, para conferência visual. */
async function salvarPdf(p, pr, modelo, nome) {
  const pg = await p.context().newPage(); await pg.goto(amb.APP + 'documentos/' + modelo);
  // o outerHTML capturado vem sem o doctype: sem ele a cópia abre em modo de compatibilidade e as tabelas perdem a fonte da folha
  await pg.setContent('<!doctype html>' + pr.html.replace('<head>', `<head><base href="${amb.APP}documentos/">`), { waitUntil: 'load' });
  await pg.emulateMedia({ media: 'print' });   // como a impressão do app: folha A4 do @page, sem margem extra
  await pg.pdf({ path: amb.saida(nome + '.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true }); await pg.emulateMedia({ media: 'screen' });
  await pg.setViewportSize({ width: 800, height: 1100 }); await pg.screenshot({ path: amb.saida(nome + '.png'), fullPage: true }); await pg.close();
}
/** Caixas das pragas do Termo impresso (html do documento de impressão): [{linha: 'HLB (Laranja):', caixas: ['Presença', 'Ausência', 'Suspeita'], marcadas: ['Ausência']}]. Vazio = Termo sem as caixas (antigo, ou só o texto). */
function caixasDoTermo(html) {
  return (String(html).split('<div class="pr">').slice(1)).map(trecho => {
    const bloco = trecho.split('</div>')[0], linha = ((/<span class="pr-n">(.*?)<\/span>/.exec(bloco) || [])[1] || '').replace(/&amp;/g, '&');
    const ops = [...bloco.matchAll(/<span class="op"><span class="cx( on)?"><\/span>([^<]+)<\/span>/g)];
    return { linha, caixas: ops.map(m => m[2]), marcadas: ops.filter(m => m[1]).map(m => m[2]) };
  });
}
module.exports = { caixasDoTermo, aparelho, identificar, novoProdutor, abrirProdutor, visita, bloco, imagem, sync, imprimir, salvarPdf, aba };
