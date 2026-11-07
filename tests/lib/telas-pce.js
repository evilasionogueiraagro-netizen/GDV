// Fotos das telas do módulo PCE do e-GDV (app do campo no celular e no computador, painel, PDFs e tema escuro).
// Sobe o fakegas (Code.gs real, planilha em memória, nada toca a produção), cria dados fictícios, gera tudo e encerra.
//   cd tests && node lib/telas-pce.js
// Variáveis: GDV_SAIDA_TELAS (pasta de saída; padrão /home/ronald/Documentos/adaf/modulo_pce_telas), GDV_PORTA_WEB (8231), GDV_PORTA_API (8232).
// Rodar de novo substitui as fotos. Fica em tests/lib/ para o run.js não tratar como teste. Só dados fictícios.
process.env.GDV_PORTA_WEB = process.env.GDV_PORTA_WEB || '8231';
process.env.GDV_PORTA_API = process.env.GDV_PORTA_API || '8232';
const fs = require('fs'), path = require('path'), net = require('net'), { spawn, execFileSync } = require('child_process');
const amb = require('./amb');
const U = require('./usuarios');
const F = require('./pce-form');
const { APP, PAINEL } = amb;

const SAIDA = path.resolve(process.env.GDV_SAIDA_TELAS || '/home/ronald/Documentos/adaf/modulo_pce_telas');
const PDFTOPPM = fs.existsSync('/usr/bin/pdftoppm') ? '/usr/bin/pdftoppm' : 'pdftoppm';
const PRODUTOR = { doc: '52998224725', nome: 'Produtor Ficticio Teste', propriedade: 'Propriedade Ficticia Teste', codigo: 'PRP-0001' };
const SERVIDOR = 'Servidor Ficticio Teste';

const fotos = [];       // {arq, desc}
const pulos = [];       // {tela, motivo}
const avisos = [];      // observações para o relatório
const cont = {};
const num = sub => String((cont[sub] = (cont[sub] || 0) + 1)).padStart(2, '0');
const pasta = sub => { const d = path.join(SAIDA, sub); fs.mkdirSync(d, { recursive: true }); return d; };
const slug = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Roda um passo; se falhar, anota e segue. */
async function passo(nome, fn) {
  try { await fn(); console.log('  ok  ' + nome); }
  catch (e) { const m = String(e && e.message || e).split('\n')[0].slice(0, 220); pulos.push({ tela: nome, motivo: m }); console.log('  PULOU ' + nome + ' -> ' + m); }
}

/** Foto: sub = subpasta; nome sem número; alvo = página ou elemento (locator). */
async function foto(sub, nome, desc, alvo, opc = {}) {
  await estavel(alvo.page ? alvo.page() : alvo);
  const arq = `${num(sub)}-${slug(nome)}.png`;
  await alvo.screenshot({ path: path.join(pasta(sub), arq), animations: 'disabled', ...(alvo.page ? {} : { fullPage: true }), ...opc });
  fotos.push({ arq: `${sub}/${arq}`, desc });
}
const estavel = p => p.evaluate(() => Promise.race([document.fonts ? document.fonts.ready : 0, new Promise(r => setTimeout(r, 1500))]).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))));

// ---------------- fakegas ----------------
const livre = porta => new Promise(r => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(porta, () => s.close(() => r(true))); });
async function subirFakegas() {
  if (!(await livre(amb.PORTA_WEB)) || !(await livre(amb.PORTA_API))) throw new Error(`portas ${amb.PORTA_WEB}/${amb.PORTA_API} ocupadas (outro fakegas rodando?)`);
  const p = spawn(process.execPath, [path.join(amb.TESTES, 'fakegas.js')], { cwd: amb.TESTES, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let out = ''; p.stdout.on('data', d => { out += d; });
  const t0 = Date.now();
  while (!/ready/.test(out)) {
    if (p.exitCode !== null) throw new Error('fakegas terminou ao iniciar');
    if (Date.now() - t0 > 20000) { try { process.kill(-p.pid); } catch (e) {} throw new Error('fakegas não ficou pronto em 20 s'); }
    await sleep(100);
  }
  return p;
}
const parar = p => { try { process.kill(-p.pid, 'SIGTERM'); } catch (e) { /* já saiu */ } };

// ---------------- PDF ----------------
/** Transforma o HTML capturado em window.print em PDF (A4) e em PNG por página (pdftoppm). */
async function salvarPdf(b, html, nome, desc) {
  const dir = pasta('pdfs'), base = `${num('pdfs')}-${slug(nome)}`;
  const pg = await b.newPage({ viewport: { width: 800, height: 1200 } });
  try {
    await pg.setContent(html.replace('<head>', `<head><base href="${APP}documentos/">`), { waitUntil: 'load' });
    await pg.evaluate(() => Promise.all([...document.images].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })))));
    await pg.emulateMedia({ media: 'print' });
    await pg.pdf({ path: path.join(dir, base + '.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally { await pg.close(); }
  execFileSync(PDFTOPPM, ['-png', '-r', '80', path.join(dir, base + '.pdf'), path.join(dir, base)]);
  const pngs = fs.readdirSync(dir).filter(f => f.startsWith(base + '-') && f.endsWith('.png')).sort();
  if (pngs.length === 1) { fs.renameSync(path.join(dir, pngs[0]), path.join(dir, base + '.png')); pngs[0] = base + '.png'; }
  fotos.push({ arq: `pdfs/${base}.pdf`, desc: desc + ' (arquivo PDF)' });
  pngs.forEach((f, i) => fotos.push({ arq: `pdfs/${f}`, desc: desc + (pngs.length > 1 ? ` (imagem da página ${i + 1} de ${pngs.length})` : ' (imagem)') }));
}

// ---------------- app ----------------
const HOOK_PRINT = () => { if (window !== window.top) window.print = () => { window.top.__prints = window.top.__prints || []; window.top.__prints.push({ html: document.documentElement.outerHTML, titulo: window.top.document.title, texto: document.body.innerText.replace(/\s+/g, ' ') }); }; };

async function contextoApp(b, token, nome, vp) {
  const c = await b.newContext({ viewport: vp, locale: 'pt-BR', timezoneId: 'America/Manaus', serviceWorkers: 'block', permissions: ['geolocation'], geolocation: { latitude: -3.12, longitude: -60.02, accuracy: 9 } });
  await c.route(u => !/^(localhost|127\.0\.0\.1)$/.test(u.hostname), r => r.abort());      // sem internet de verdade (tiles do mapa, fontes externas)
  await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [token, nome]);
  await c.addInitScript(HOOK_PRINT);
  return c;
}

const ir = (p, view, arg) => p.evaluate(([v, a]) => go(v, a), [view, arg]);
const imprimirVia = async (p, fn) => { await p.evaluate(() => { window.__prints = []; }); await fn(); await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 }); return p.evaluate(() => window.__prints[0]); };
/** Espera um seletor; no caminho, confirma o popup do número (se vier). */
async function aguardar(p, sel, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.locator(sel).count()) return true;
    if (await p.locator('#mon-m-ok').count()) await p.click('#mon-m-ok').catch(() => {});
    else if (await p.locator('#pce-m-ok').count()) await p.click('#pce-m-ok').catch(() => {});
    await sleep(150);
  }
  throw new Error('não apareceu ' + sel + (await p.textContent('#toast').catch(() => '') ? ' (aviso: ' + (await p.textContent('#toast')).trim().slice(0, 150) + ')' : ''));
}
const aviso = p => p.textContent('#toast').then(t => (t || '').trim()).catch(() => '');

/** Marca o que falta no formulário do cadastro: um radio por pergunta (prefere "não"), unidade e responsável técnico. */
async function preencherCadastro(p) {
  const un = p.locator('#mc-unidade'); if (await un.count()) await un.selectOption('Manaus').catch(() => {});
  const nomes = await p.$$eval('#monCadForm input[type=radio]', l => [...new Set(l.map(i => i.name))]);
  for (const n of nomes) {
    if (await p.locator(`#monCadForm input[name="${n}"]:checked`).count()) continue;
    const alvo = (await p.locator(`#monCadForm input[name="${n}"][value="nao"]`).count()) ? 'nao' : null;
    const el = alvo ? p.locator(`#monCadForm label:has(> input[name="${n}"][value="nao"])`) : p.locator(`#monCadForm label:has(> input[name="${n}"])`).first();
    if (await el.count() && await el.first().isVisible()) await el.first().click().catch(() => {});
  }
  for (const [sel, v] of [['#mc-rt-nome', 'Responsavel Tecnico Ficticio'], ['#mc-rt-conselho', 'CREA-AM 00000'], ['#mc-f-destino', 'Feira Ficticia'], ['#mc-f-origemMaterial', 'Viveiro Ficticio'], ['#mc-f-fornecedor', 'Fornecedor Ficticio']]) {
    const el = p.locator(sel); if (await el.count() && await el.isVisible() && !(await el.inputValue())) await el.fill(v).catch(() => {});
  }
  const lin = p.locator('#mc-f-culturas .pc-lin input[data-col=cultivar]'); if (await lin.count()) for (let i = 0; i < await lin.count(); i++) if (!(await lin.nth(i).inputValue())) await lin.nth(i).fill('Cultivar Ficticia').catch(() => {});
}

async function preencherTermo(p) {
  const loc = p.locator('#mt-localAcao'); if (await loc.count() && !(await loc.inputValue())) await loc.fill('Propriedade Ficticia Teste, Ramal Ficticio, km 3, Manaus/AM');
  const un = p.locator('#mt-unidade'); if (await un.count() && !(await un.inputValue())) await un.selectOption('Manaus').catch(() => {});
  const neg = p.locator('#mt-negativa'); if (await neg.count() && await neg.isVisible()) await neg.click().catch(() => {});
  const fr = p.locator('[data-mon=frasescitros]'); if (await fr.count() && await fr.isVisible()) await fr.click().catch(() => {});
  const ac = p.locator('input[name="mt-acoes"][value="Fiscalização"]'); if (await ac.count() && !(await ac.isChecked())) await ac.check().catch(() => {});
  const cons = p.locator('#mt-constatacao'); if (await cons.count() && !(await cons.inputValue())) await cons.fill('Ausencia de sintomas nas plantas avaliadas. Visita fictícia para fins de demonstração.').catch(() => {});
}

async function sincronizar(p) {
  for (let i = 0; i < 25; i++) {
    await p.evaluate(() => Sync.sincronizar()).catch(() => {});
    await sleep(300);
    const n = await p.evaluate(async () => { let t = 0; for (const s of ['levantamentos', 'colheitas', 'propriedades', 'cadastrosPce', 'termosPce', 'pessoas']) t += (await Store.todos(s)).filter(x => x.pendente).length; return t + (await Sync.arquivosPendentes()).length; }).catch(() => 1);
    if (!n) return;
  }
}

// ---------------- roteiro ----------------
(async () => {
  for (const s of ['app-celular', 'app-computador', 'painel', 'pdfs', 'tema-escuro']) fs.rmSync(path.join(SAIDA, s), { recursive: true, force: true });
  fs.rmSync(path.join(SAIDA, 'LEIA-ME.md'), { force: true });
  fs.mkdirSync(SAIDA, { recursive: true });
  const srv = await subirFakegas();
  let b;
  try {
    b = await amb.lancar();
    const f = await U.fiscal(SERVIDOR, { permissoes: U.lista({ veiculos: 1, tf: 1, pce: 1, antigo: 1 }) });
    const c = await contextoApp(b, f.token, SERVIDOR, { width: 400, height: 900 });
    const p = await c.newPage(); p.on('dialog', d => d.accept()); const errosJs = []; p.on('pageerror', e => errosJs.push(e.message));
    const cel = () => p.setViewportSize({ width: 400, height: 900 }), pc = () => p.setViewportSize({ width: 1280, height: 800 });
    const escuro = async fn => { await p.emulateMedia({ colorScheme: 'dark' }); try { await fn(); } finally { await p.emulateMedia({ colorScheme: 'light' }); } };

    // ---- 1. entrada e identificação do servidor ----
    await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]');
    await p.evaluate(() => Sync.sincronizar()).catch(() => {});
    await p.waitForFunction(() => Store.meta('catalogoPce'), null, { timeout: 10000 }).catch(() => {});
    await passo('Módulos (celular)', () => foto('app-celular', 'modulos', 'Tela de módulos do app com o cartão do PCE', p));
    await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
    await passo('Identificação do servidor', () => foto('app-celular', 'identificacao-do-servidor', 'Primeira entrada no PCE: identificação do servidor (cargo, matrícula e lotação)', p));
    await p.selectOption('#pce-s-cargo', { index: 1 }); await p.fill('#pce-s-matricula', '000.000-0'); await p.selectOption('#pce-s-lotacao', 'Manaus');
    await p.click('#pce-s-salvar'); await p.waitForSelector('#pce-novolev');
    await passo('Tela inicial do PCE', () => foto('app-celular', 'tela-inicial-do-pce', 'Tela inicial do PCE (lista de levantamentos ainda vazia)', p));
    await passo('Tela inicial do PCE (computador)', async () => { await pc(); await foto('app-computador', 'tela-inicial-do-pce', 'Tela inicial do PCE no computador (1280 px)', p); await cel(); });
    await passo('Tela inicial do PCE (escuro)', () => escuro(() => foto('tema-escuro', 'tela-inicial-do-pce', 'Tela inicial do PCE no tema escuro', p)));

    // ---- 2. novo levantamento ----
    await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm');
    await p.waitForFunction(() => document.querySelector('#pce-lat').value !== '', null, { timeout: 10000 }).catch(() => {});
    await passo('Novo levantamento vazio', () => foto('app-celular', 'novo-levantamento-vazio', 'Novo levantamento, formulário vazio (GPS, data e hora automáticos)', p));
    await p.fill('#pce-doc', PRODUTOR.doc);
    await p.waitForFunction(() => /Novo cadastro/.test(document.querySelector('#pce-st-doc').textContent), null, { timeout: 10000 }).catch(() => {});
    await p.fill('#pce-nome', PRODUTOR.nome); await p.fill('#pce-telefone', '92 90000-0000'); await p.fill('#pce-email', 'produtor@exemplo.invalid');
    await p.fill('#pce-propriedade', PRODUTOR.propriedade); await p.fill('#pce-codigo', PRODUTOR.codigo); await p.fill('#pce-endereco', 'Ramal Ficticio, km 3');
    await p.selectOption('#pce-municipio', 'Manaus'); await p.selectOption('#pce-situacao', 'Posse'); await p.selectOption('#pce-comercial', 'sim').catch(() => {});
    await p.fill('#pce-obs', 'Visita fictícia para demonstração das telas.').catch(() => {});

    // uma foto por cultura (a mesma cultura vai trocando no card 1)
    await F.cultura(p, 0, 'Soja');
    await passo('Levantamento: soja', () => foto('app-celular', 'levantamento-soja', 'Levantamento com a cultura Soja e as pragas do catálogo', p));
    await passo('Levantamento: banana', async () => { await F.cultura(p, 0, 'Banana'); await foto('app-celular', 'levantamento-banana', 'Levantamento com a cultura Banana (pragas do catálogo, com a Fusariose opcional)', p); });
    await passo('Levantamento: laranja', async () => { await F.cultura(p, 0, 'Laranja'); await foto('app-celular', 'levantamento-laranja-citros', 'Levantamento com a cultura Laranja e o bloco do cadastro de citros', p); });
    await passo('Levantamento: carambola', async () => { await F.cultura(p, 0, 'Carambola'); await foto('app-celular', 'levantamento-carambola', 'Levantamento com a cultura Carambola e a mosca-da-carambola', p); });
    await passo('Erro de validação', async () => {
      await p.click('#pce-salvar'); await p.waitForFunction(() => document.querySelector('#toast') && document.querySelector('#toast').textContent.trim(), null, { timeout: 5000 });
      await p.locator('.pce-pr').first().scrollIntoViewIfNeeded();
      await foto('app-celular', 'erro-de-validacao', 'Erro de validação: resultado obrigatório da praga sem resposta (aviso na parte de baixo da tela)', p, { fullPage: false });
    });

    // visita completa: carambola (card 1, já escolhida) + soja, banana, laranja, mandioca e cacau
    await F.responderObrigatorias(p, 0);
    if (process.env.TELAS_DEBUG) await p.screenshot({ path: process.env.TELAS_DEBUG + '1.png', fullPage: true });
    await F.cultura(p, 1, 'Soja'); await p.fill(`${F.cult(1)} >> .c-area`, '12,5'); await p.fill(`${F.cult(1)} >> .c-espLinha`, '0,5'); await p.fill(`${F.cult(1)} >> .c-espPlanta`, '0,1');
    await F.responder(p, 1, 'Phakopsora pachyrhizi', 'detectada', { tipo: 'Folhas', codigo: 'AM-101', destino: 'Laboratorio Ficticio' }); await F.responderObrigatorias(p, 1);
    await F.cultura(p, 2, 'Banana'); await p.fill(`${F.cult(2)} >> .c-area`, '4');
    await F.responder(p, 2, 'Moko da Bananeira', 'suspeita', { tipo: 'Pseudocaule', codigo: 'AM-102', destino: 'Laboratorio Ficticio' }); await F.responderObrigatorias(p, 2);
    await F.cultura(p, 3, 'Laranja'); await p.fill(`${F.cult(3)} >> .c-area`, '2,5'); await F.responderObrigatorias(p, 3);
    await F.cultura(p, 4, 'Mandioca'); await p.fill(`${F.cult(4)} >> .c-area`, '1,5'); await F.responderObrigatorias(p, 4);
    await F.cultura(p, 5, 'Cacau'); await p.fill(`${F.cult(5)} >> .c-area`, '3'); await F.responderObrigatorias(p, 5);
    for (const k of ['hlb', 'acaro', 'cancro']) await p.click(`#pce-citros label:has(input[name="pce-ci-det-${k}-tem"][value="nao"])`).catch(() => {});
    await p.check('input[name="pce-ci-atividades"][value="frutos"]').catch(() => {});
    await p.click('#pce-ci-addcult').then(async () => {
      const lin = k => `#pce-ci-culturas .pce-ci-cult >> nth=0 >> .ci-${k}`;
      await p.selectOption(lin('atividade'), 'frutos').catch(() => {}); await p.fill(lin('cultivar'), 'Laranja Pera'); await p.fill(lin('area'), '2,5'); await p.fill(lin('idade'), '6'); await p.fill(lin('plantas'), '400'); await p.fill(lin('producao'), '12,5');
    }).catch(() => {});
    await p.fill('#pce-ci-rt-nome', 'Responsavel Tecnico Ficticio').catch(() => {}); await p.fill('#pce-ci-rt-conselho', 'CREA-AM 00000').catch(() => {});
    if (process.env.TELAS_DEBUG) await p.screenshot({ path: process.env.TELAS_DEBUG, fullPage: true });
    await p.click('#pce-salvar');
    await p.waitForSelector('#pce-lev-pronto', { timeout: 15000 }).catch(async () => { throw new Error('o levantamento da visita fictícia não salvou: ' + await aviso(p)); });
    const levId = await p.evaluate(async () => (await Store.todos('levantamentos')).sort((a, b) => b.criadoEm - a.criadoEm)[0].id);
    await passo('Levantamento salvo', () => foto('app-celular', 'levantamento-salvo', 'Levantamento salvo: resumo em tabela, cadastros e Termos de Fiscalização por programa e PDFs por programa', p));
    await passo('Levantamento salvo (computador)', async () => { await pc(); await foto('app-computador', 'levantamento-salvo', 'Levantamento salvo no computador (1280 px)', p); await cel(); });
    await passo('Levantamento salvo (escuro)', () => escuro(() => foto('tema-escuro', 'levantamento-salvo', 'Levantamento salvo no tema escuro', p)));

    // tema escuro do formulário: abre o rascunho por outra cultura (o levantamento já foi salvo, então volta ao formulário novo)
    await passo('Levantamento no tema escuro', async () => {
      await ir(p, 'pcelev'); await p.waitForSelector('#pceLevForm'); await F.cultura(p, 0, 'Soja');
      await escuro(() => foto('tema-escuro', 'levantamento', 'Formulário de levantamento (cultura Soja) no tema escuro', p));
      await p.click('[data-pce=descartarlev]').catch(() => {}); await p.waitForSelector('#pce-novolev', { timeout: 5000 }).catch(() => {});
    });

    // ---- 3. PDFs do levantamento (um por programa) ----
    await ir(p, 'pcelevpronto', levId); await p.waitForSelector('#pce-lev-pronto');
    const rotulosPdf = (await p.locator('[data-pce=imprimirlev]').allTextContents()).map(t => t.replace(/^\s*PDF:\s*/, '').trim());
    console.log('  PDFs do levantamento (programas): ' + rotulosPdf.join(' | '));
    for (let i = 0; i < rotulosPdf.length; i++) {
      await passo('PDF da ficha: ' + rotulosPdf[i], async () => {
        await ir(p, 'pcelevpronto', levId); await p.waitForSelector('[data-pce=imprimirlev]');
        const pr = await imprimirVia(p, () => p.locator('[data-pce=imprimirlev]').nth(i).click());
        await salvarPdf(b, pr.html, 'ficha-levantamento-' + rotulosPdf[i], 'Ficha do levantamento do programa ' + rotulosPdf[i]);
      });
    }

    // ---- 4. cadastros por modelo (um por modelo que a visita pede) ----
    await ir(p, 'pcelevpronto', levId); await p.waitForSelector('#pce-lev-pronto');
    const modelos = await p.$$eval('[data-pce=cadvisita]', l => l.map(x => x.dataset.modelo));
    console.log('  Cadastros pedidos pela visita: ' + modelos.join(', '));
    for (const m of modelos) {
      await passo('Cadastro: ' + m, async () => {
        await ir(p, 'pcelevpronto', levId); await p.waitForSelector(`[data-pce=cadvisita][data-modelo=${m}]`);
        await p.click(`[data-pce=cadvisita][data-modelo=${m}]`); await p.waitForSelector('#monCadForm'); await sleep(300);
        await foto('app-celular', 'cadastro-' + m, 'Formulário de cadastro do modelo ' + m + ', aberto a partir da visita (dados do levantamento já vêm preenchidos)', p);
        await preencherCadastro(p);
        await p.click('#mc-salvar');
        try { await aguardar(p, '#pce-lev-pronto'); } catch (e) { await foto('app-celular', 'cadastro-' + m + '-erro', 'ERRO ao salvar o cadastro ' + m + ': ' + await aviso(p), p, { fullPage: false }).catch(() => {}); throw e; }
      });
    }

    // ---- 5. Termos de Fiscalização por programa ----
    await ir(p, 'pcelevpronto', levId); await p.waitForSelector('#pce-lev-pronto');
    const progs = await p.$$eval('[data-pce=tfvisita]', l => l.map(x => x.dataset.programa));
    console.log('  Termos de Fiscalização pedidos pela visita: ' + progs.join(', '));
    for (const g of progs) {
      await passo('Termo de Fiscalização: ' + g, async () => {
        await ir(p, 'pcelevpronto', levId); await p.waitForSelector(`[data-pce=tfvisita][data-programa="${g}"]`);
        await p.click(`[data-pce=tfvisita][data-programa="${g}"]`); await p.waitForSelector('#monTfForm'); await sleep(300);
        await foto('app-celular', 'termo-de-fiscalizacao-' + g, 'Termo de Fiscalização do programa ' + g + ', ligado à visita', p);
        await preencherTermo(p);
        await p.click('#mt-salvar');
        try { await aguardar(p, '#mon-pronto'); } catch (e) { await foto('app-celular', 'termo-de-fiscalizacao-' + g + '-erro', 'ERRO ao salvar o Termo ' + g + ': ' + await aviso(p), p, { fullPage: false }).catch(() => {}); throw e; }
      });
    }

    // ---- 6. Termo de Colheita ----
    await passo('Termo de Colheita (formulário)', async () => {
      await ir(p, 'pcelevpronto', levId); await p.waitForSelector('#pce-pronto-termo');
      await p.click('#pce-pronto-termo'); await p.waitForSelector('#pceTermoForm'); await sleep(300);
      await p.fill('#pce-t-quantidade', '3'); await p.fill('#pce-t-analise', 'fitopatológica');
      await p.locator('input[name=pce-t-parte]').first().check().catch(() => {});
      await foto('app-celular', 'termo-de-colheita-formulario', 'Formulário do Termo de Colheita de Amostras, a partir do levantamento', p);
      await p.click('#pce-t-gerar'); await aguardar(p, '#pce-pronto');
      await foto('app-celular', 'termo-de-colheita-gerado', 'Termo de Colheita gerado (número confirmado, botões de imprimir)', p);
      const pr = await imprimirVia(p, () => p.click('#pce-imprimir'));
      await salvarPdf(b, pr.html, 'termo-de-colheita', 'Termo de Colheita de Amostras (duas vias)');
    });
    await passo('Lista de Termos de Colheita', async () => { await ir(p, 'pcetermos'); await p.waitForSelector('.item.pce-termo'); await foto('app-celular', 'lista-de-termos-de-colheita', 'Lista de Termos de Colheita', p); });

    // ---- 7. lista de levantamentos, Propriedades, Termos, Relatório, Perto de mim, Dados Offline ----
    await passo('Lista de levantamentos', async () => {
      await ir(p, 'pce'); await p.waitForSelector('.item.pce-lev');
      await foto('app-celular', 'lista-de-levantamentos', 'Lista de levantamentos com registros (agrupada por município)', p);
      await pc(); await foto('app-computador', 'lista-de-levantamentos', 'Lista de levantamentos no computador (1280 px)', p); await cel();
    });
    await passo('Propriedades', async () => {
      await ir(p, 'pcecads'); await p.waitForSelector('#mon-modelo'); await p.waitForSelector('.mon-item');
      await foto('app-celular', 'propriedades', 'Propriedades: lista de cadastros com o programa de cada um e o seletor do modelo para novo cadastro', p);
    });
    for (const g of ['pcetfs']) await passo('Lista de Termos de Fiscalização', async () => {
      await ir(p, g); await p.waitForSelector('.mon-item, .item, .card', { timeout: 8000 }); await foto('app-celular', 'lista-de-termos-de-fiscalizacao', 'Lista de Termos de Fiscalização por programa', p);
    });
    await passo('Relatório de atividades', async () => { await ir(p, 'pcerel'); await sleep(500); await p.waitForSelector('#view .card, #view form', { timeout: 8000 }); await foto('app-celular', 'relatorio-de-atividades', 'Relatório de atividades do PCE (período, unidade, convênio)', p); });
    await passo('Perto de mim', async () => {
      await ir(p, 'pcemapa'); await p.waitForSelector('.leaflet-container', { timeout: 10000 }).catch(() => {}); await sleep(800);
      await foto('app-celular', 'perto-de-mim', 'Perto de mim: mapa das propriedades (os blocos do mapa vêm da internet e ficam bloqueados nestas fotos; o fundo aparece cinza)', p);
      avisos.push('Perto de mim: sem os blocos do mapa (internet bloqueada de propósito); só os marcadores e o fundo cinza aparecem.');
    });
    await passo('Dados Offline', async () => { await ir(p, 'pcecampo'); await p.waitForSelector('#view .card, #view h3', { timeout: 8000 }); await sleep(500); await foto('app-celular', 'dados-offline', 'Dados Offline: baixar os dados de municípios para consultar sem internet', p); });

    // ---- 8. PDFs dos cadastros e dos Termos de Fiscalização ----
    const regs = await p.evaluate(async () => ({
      cads: (await Store.todos('cadastrosPce')).filter(x => !x.excluido).map(x => ({ id: x.id, programa: x.programa || 'moniliase' })),
      tfs: (await Store.todos('termosPce')).filter(x => !x.excluido).map(x => ({ id: x.id, programa: x.programaVisita || x.programa || '' }))
    }));
    for (const x of regs.cads) {
      await passo('PDF do cadastro: ' + x.programa, async () => {
        const pr = await imprimirVia(p, () => p.evaluate(id => PCEMon.imprimir('cadastro', id), x.id));
        await salvarPdf(b, pr.html, 'cadastro-' + x.programa, 'PDF do cadastro do modelo ' + x.programa);
      });
    }
    for (const t of regs.tfs) {
      await passo('PDF do Termo de Fiscalização: ' + t.programa, async () => {
        const pr = await imprimirVia(p, () => p.evaluate(id => PCEMon.imprimir('termo', id), t.id));
        await salvarPdf(b, pr.html, 'termo-de-fiscalizacao-' + t.programa, 'PDF do Termo de Fiscalização do programa ' + t.programa);
      });
    }
    if (!regs.tfs.some(t => /citros/i.test(t.programa))) pulos.push({ tela: 'PDF do Termo de Fiscalização de citros', motivo: 'a visita não gerou o Termo de citros' });

    // ---- 9. painel ----
    await passo('Painel', async () => {
      await sincronizar(p);
      const g = await amb.gerente('Gerente Ficticio Teste');
      const cx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block' });
      await cx.route(u => !/^(localhost|127\.0\.0\.1)$/.test(u.hostname), r => r.abort());
      await cx.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.painel.token', i.t); localStorage.setItem('gdv.painel.nome', i.n); localStorage.setItem('pn.pce.visao', 'indicadores'); } }, { t: g.token, n: 'Gerente Ficticio Teste' });
      const pg = await cx.newPage(); pg.on('dialog', d => d.accept());
      await pg.goto(PAINEL); await pg.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 30000 });
      await pg.click('#pn-aba-pce'); await pg.waitForSelector('[data-pce-visao]', { timeout: 15000 }); await pg.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 15000 });
      await sleep(1000);
      await passo('Painel: indicadores e mapa', () => foto('painel', 'aba-pce-indicadores-e-mapa', 'Aba PCE do painel: indicadores e mapa (blocos do mapa bloqueados nestas fotos)', pg));
      await passo('Painel: lista de cadastros', async () => {
        const T = pg.locator('.pn-tab', { hasText: 'Cadastros de imóvel' }).first(); await T.waitFor({ timeout: 10000 }); await T.scrollIntoViewIfNeeded();
        await foto('painel', 'cadastros-de-imovel-com-programa', 'Painel: lista de cadastros de imóvel de todos os programas, com a coluna Programa', T);
      });
      for (const [v, nome, desc] of [['culturas', 'culturas', 'Painel, aba PCE, Culturas (catálogo)'], ['pragas', 'doencas-e-pragas', 'Painel, aba PCE, Doenças e pragas (catálogo)']]) {
        await passo('Painel: ' + nome, async () => {
          await pg.click(`[data-pce-visao=${v}]`); await pg.waitForSelector('.pn-cat', { timeout: 10000 }); await sleep(700);
          await foto('painel', nome, desc, pg);
        });
      }
      await cx.close();
    });

    if (errosJs.length) avisos.push('Erros de JavaScript no app durante o roteiro: ' + [...new Set(errosJs)].slice(0, 3).join(' | '));
  } finally {
    if (b) await b.close().catch(() => {});
    parar(srv);
  }

  // ---------------- LEIA-ME ----------------
  const L = ['# Telas do módulo PCE (e-GDV)', '',
    'Fotos geradas por `tests/lib/telas-pce.js`, com dados claramente fictícios (produtor "Produtor Ficticio Teste", CPF 529.982.247-25), num sistema local em memória que não toca a produção.', '',
    '## Como regerar', '', '```sh', 'cd tests && node lib/telas-pce.js', '```', '',
    'Substitui as fotos desta pasta. Para outra pasta: `GDV_SAIDA_TELAS=/caminho node lib/telas-pce.js`. Portas usadas: 8231 (web) e 8232 (API), configuráveis por `GDV_PORTA_WEB` e `GDV_PORTA_API`.', ''];
  const secoes = [['app-celular', 'App no celular (400 px, página inteira)'], ['app-computador', 'App no computador (1280 px)'], ['painel', 'Painel (1440 px)'], ['pdfs', 'PDFs (arquivo .pdf e imagem .png de cada página)'], ['tema-escuro', 'Tema escuro (app no celular)']];
  for (const [sub, titulo] of secoes) {
    const l = fotos.filter(x => x.arq.startsWith(sub + '/')); if (!l.length) continue;
    L.push('## ' + titulo, '', ...l.map(x => `- \`${x.arq}\`: ${x.desc}`), '');
  }
  if (pulos.length) L.push('## Telas que não saíram', '', ...pulos.map(x => `- ${x.tela}: ${x.motivo}`), '');
  if (avisos.length) L.push('## Observações', '', ...avisos.map(x => `- ${x}`), '');
  fs.writeFileSync(path.join(SAIDA, 'LEIA-ME.md'), L.join('\n'));
  const nPng = fotos.filter(x => x.arq.endsWith('.png')).length, nPdf = fotos.filter(x => x.arq.endsWith('.pdf')).length;
  console.log(`\nPasta: ${SAIDA}\nImagens: ${nPng} (PNG)  PDFs: ${nPdf}  Puladas: ${pulos.length}`);
  pulos.forEach(x => console.log('  - ' + x.tela + ': ' + x.motivo));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
