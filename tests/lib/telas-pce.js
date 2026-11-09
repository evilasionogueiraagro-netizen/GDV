// Fotos das telas do módulo PCE do e-GDV (app do campo no celular e no computador, painel, PDFs e tema escuro): Produtores, tela do produtor, Nova visita em
// passos, Termos, fichas oficiais, Termo do papel e levantamento antigo (só leitura).
// Sobe o fakegas (Code.gs real, planilha em memória, nada toca a produção), cria dados fictícios, gera tudo e encerra.
//   cd tests && node lib/telas-pce.js
// Variáveis: GDV_SAIDA_TELAS (pasta de saída; padrão /home/ronald/Documentos/adaf/modulo_pce_telas), GDV_PORTA_WEB (8231), GDV_PORTA_API (8232).
// Rodar de novo substitui as fotos. Fica em tests/lib/ para o run.js não tratar como teste. Só dados fictícios.
process.env.GDV_PORTA_WEB = process.env.GDV_PORTA_WEB || '8231';
process.env.GDV_PORTA_API = process.env.GDV_PORTA_API || '8232';
const fs = require('fs'), path = require('path'), net = require('net'), { spawn, execFileSync } = require('child_process');
const amb = require('./amb');
const U = require('./usuarios');
const A = require('./pce-app');
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
  const pag = alvo.page ? alvo.page() : alvo, inteira = !alvo.page && opc.fullPage !== false;
  // página inteira: o cabeçalho e o menu de baixo são fixos e aparecem no meio da foto; ficam no lugar de origem e o aviso some (só a foto do erro mostra o aviso)
  const css = inteira ? await pag.addStyleTag({ content: 'header{position:static!important}nav{position:static!important}#toast{display:none!important}' }) : null;
  if (inteira) { await pag.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => requestAnimationFrame(r)); } window.scrollTo(0, 0); }); await estavel(pag); }   // percorre a página para pintar tudo antes da foto
  try { await alvo.screenshot({ path: path.join(pasta(sub), arq), animations: 'disabled', ...(alvo.page ? {} : { fullPage: true }), ...opc }); }
  finally { if (css) await css.evaluate(e => e.remove()).catch(() => {}); }
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
    /** Foto da tela atual no celular e, se pedido, no computador e no tema escuro. */
    const tela = async (sub, nome, desc, o = {}) => {
      await foto('app-celular', nome, desc, p, o.opc || {});
      if (o.pc) await passo(nome + ' (computador)', async () => { await pc(); await foto('app-computador', nome, desc + ' no computador (1280 px)', p); await cel(); });
      if (o.escuro) await passo(nome + ' (escuro)', () => escuro(() => foto('tema-escuro', nome, desc + ' no tema escuro', p)));
    };

    // ---- 1. entrada, identificação do servidor e lista de produtores ----
    await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]');
    await p.evaluate(() => Sync.sincronizar()).catch(() => {});
    await p.waitForFunction(() => Store.meta('catalogoPce'), null, { timeout: 10000 }).catch(() => {});
    await passo('Módulos (celular)', () => foto('app-celular', 'modulos', 'Tela de módulos do app com o cartão do PCE', p));
    await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
    await passo('Identificação do servidor', () => foto('app-celular', 'identificacao-do-servidor', 'Primeira entrada no PCE: identificação do servidor (cargo, matrícula e lotação)', p));
    await p.selectOption('#pce-s-cargo', { index: 1 }); await p.fill('#pce-s-matricula', '000.000-0'); await p.selectOption('#pce-s-lotacao', 'Manaus');
    await p.click('#pce-s-salvar'); await p.waitForSelector('#campo-novo');
    await passo('Produtores (lista vazia)', () => tela('app', 'produtores-lista-vazia', 'Produtores: busca, "Novo produtor" e "Baixar dados para o campo" (menu Módulos | Produtores | Termos)', { pc: true, escuro: true }));

    // ---- 2. cadastro do produtor, da propriedade e dos frutos ----
    await p.click('#campo-novo'); await p.waitForSelector('#pceProdForm');
    await passo('Novo produtor (vazio)', () => foto('app-celular', 'novo-produtor-vazio', 'Novo produtor: dados do produtor, da propriedade e lista de frutos num formulário só', p));
    await p.fill('#pp-doc', PRODUTOR.doc); await p.fill('#pp-nome', PRODUTOR.nome); await p.fill('#pp-prop', PRODUTOR.propriedade); await p.fill('#pp-codigo', PRODUTOR.codigo);
    await p.selectOption('#pp-municipio', 'Manaus');
    for (const [i, fr] of [{ cultura: 'Cacau', cultivar: 'Comum', area: '3', quantidade: '120' }, { cultura: 'Laranja', cultivar: 'Pera', area: '2,5', quantidade: '400' },
      { cultura: 'Banana', cultivar: 'Prata', area: '4', quantidade: '300' }, { cultura: 'Soja', cultivar: 'Safra', area: '12,5', quantidade: '' }].entries()) {
      await p.click('#pp-addfruto'); const bl = p.locator('.pc-fruto').nth(i);
      await bl.locator('.f-cultura').selectOption(fr.cultura); await bl.locator('.f-cultivar').fill(fr.cultivar); await bl.locator('.f-area').fill(fr.area);
      if (fr.quantidade) await bl.locator('.f-quantidade').fill(fr.quantidade);
    }
    await passo('Novo produtor (preenchido)', () => foto('app-celular', 'novo-produtor-preenchido', 'Novo produtor preenchido, com quatro frutos (cultura do catálogo, cultivar, área, plantas)', p));
    await p.click('#pp-salvar'); await p.waitForSelector('#pce-produtor');
    await passo('Tela do produtor', () => tela('app', 'tela-do-produtor', 'Tela do produtor: frutos, "Nova visita", fichas oficiais por modelo e a lista de visitas', { pc: true, escuro: true }));
    await passo('Produtores (com um produtor)', async () => { await ir(p, 'pce'); await p.waitForSelector('.campo-res-item'); await p.fill('#campoQ', 'ficticio'); await p.waitForSelector('.campo-res-item');
      await foto('app-celular', 'produtores-busca', 'Produtores: busca por nome, CPF/CNPJ ou propriedade (funciona sem internet com os dados baixados)', p); });

    // ---- 3. Nova visita em passos: Cacau (monilíase detectada, com amostra), Laranja (citros negativo) e Banana (Moko suspeita) ----
    await ir(p, 'pceprodutor', PRODUTOR.doc); await p.waitForSelector('#pce-novavisita');
    const jpg = await A.imagem(p, 1600, 1200, '#2a7');
    await A.visita(p, { frutos: ['Cacau', 'Laranja', 'Banana'], padrao: 'nao_detectada', resultados: { Cacau: { 'Monilíase do Cacaueiro': 'detectada' }, Banana: { 'Moko da Bananeira': 'suspeita' } },
      amostra: { Cacau: { tipo: 'Folhas e frutos', codigo: 'AM-101', destino: 'Laboratorio Ficticio', qtd: 2 } }, plantas: { Cacau: 120, Laranja: 80, Banana: 60 },
      fotos: { Cacau: [{ name: 'fruto.jpg', mimeType: 'image/jpeg', buffer: jpg }] },
      aoPasso: async n => {
        if (n === 1) return passo('Nova visita, passo 1', () => foto('app-celular', 'visita-passo-1-frutos', 'Nova visita, passo 1: frutos avaliados (marcados entre os do cadastro; dá para acrescentar fruto)', p));
        if (n === '2-vazio') {
          await passo('Nova visita, passo 2 (vazio)', () => foto('app-celular', 'visita-passo-2-pragas', 'Nova visita, passo 2: pragas do catálogo de cada fruto, resultado a marcar (as opcionais não obrigam)', p));
          return passo('Nova visita, erro de validação', async () => {
            await p.click('#vi-continuar'); await p.waitForFunction(() => document.querySelector('#toast') && document.querySelector('#toast').textContent.trim(), null, { timeout: 5000 });
            await p.locator('.pce-pr').first().scrollIntoViewIfNeeded();
            await foto('app-celular', 'visita-erro-de-validacao', 'Erro de validação: resultado obrigatório da praga sem resposta (aviso na parte de baixo da tela)', p, { fullPage: false });
          });
        }
        if (n === 2) return passo('Nova visita, passo 2 (respondido)', async () => { await foto('app-celular', 'visita-passo-2-respondido', 'Nova visita, passo 2 respondido: Monilíase detectada (há quanto tempo, controle) e Moko suspeito', p);
          await escuro(() => foto('tema-escuro', 'visita-passo-2', 'Nova visita, passo 2, no tema escuro', p)); });
        if (n === 3) return passo('Nova visita, passo 3', () => foto('app-celular', 'visita-passo-3-amostra-e-deteccao', 'Nova visita, passo 3: plantas inspecionadas, sintomas, coleta de amostra, perguntas de detecção da monilíase e fotos do fruto', p));
        if (n === 4) return passo('Nova visita, passo 4', () => foto('app-celular', 'visita-passo-4-acoes-e-constatacao', 'Nova visita, passo 4: ação, local, situação constatada por programa e enquadramento legal da planilha da GDV', p));
        if (n === 5) {
          await passo('Nova visita, passo 5', () => foto('app-celular', 'visita-passo-5-assinaturas', 'Nova visita, passo 5: assinaturas no papel e o resumo do que sai (um Termo por programa e o Termo de Colheita)', p));
          return passo('Nova visita, produtor não assina', async () => {
            await p.check('#pce-naoassina'); await p.locator('#pce-docprod').scrollIntoViewIfNeeded();
            await foto('app-celular', 'visita-passo-5-produtor-nao-assina', 'Passo 5 com "Produtor não assina": foto do produtor com documento oficial e testemunhas', p);
            await p.uncheck('#pce-naoassina'); await p.waitForFunction(() => document.querySelector('#pce-docprod').hidden);
          });
        }
        if (n === 'pronta') return passo('Visita pronta', () => tela('app', 'visita-pronta-termos', 'Visita concluída: um Termo de Fiscalização por programa (número, PDF, envio) e o Termo de Colheita da amostra', { pc: true, escuro: true }));
      } });

    // ---- 4. PDFs: um Termo por programa e o Termo de Colheita ----
    await ir(p, 'pcevisitapronto', await p.evaluate(async () => (await Store.todos('termosPce')).sort((x, y) => y.criadoEm - x.criadoEm)[0].visitaId)); await p.waitForSelector('#pce-visita-pronta');
    const nTermos = await p.locator('.pce-termo-pronto').count();
    for (let i = 0; i < nTermos; i++) {
      await passo('PDF do Termo ' + (i + 1), async () => {
        const cartao = (await p.locator('.pce-termo-pronto').nth(i).textContent()).replace(/\s+/g, ' ');
        const prog = (cartao.match(/Monilíase|Citros|Bananeira|Carambola|Soja/i) || ['programa'])[0];
        const pr = await imprimirVia(p, () => p.locator('.pce-termo-pronto').nth(i).locator('[data-mon=imprimir]').click());
        await salvarPdf(b, pr.html, 'termo-de-fiscalizacao-' + prog, 'PDF do Termo de Fiscalização do programa ' + prog + ' (modelo único, um por programa da visita)');
      });
    }
    await passo('PDF do Termo de Colheita', async () => {
      const pr = await imprimirVia(p, () => p.locator('.pce-colheita-pronta [data-pce=imprimirtermo]').first().click());
      await salvarPdf(b, pr.html, 'termo-de-colheita', 'PDF do Termo de Colheita de Amostras (duas vias)');
    });

    // ---- 5. Termos (Fiscalização e Colheita numa lista só) ----
    await passo('Termos (lista)', async () => { await ir(p, 'pcetermos'); await p.waitForSelector('#pceTItens .item'); await tela('app', 'termos-lista', 'Termos: Fiscalização e Colheita numa lista só, com pesquisa e filtro por tipo', { pc: true, escuro: true }); });

    // ---- 6. fichas oficiais ----
    await ir(p, 'pceprodutor', PRODUTOR.doc); await p.waitForSelector('#pce-produtor');
    for (const m of ['moniliase', 'citros']) {
      await passo('Ficha oficial: ' + m, async () => {
        await ir(p, 'pceprodutor', PRODUTOR.doc); await p.waitForSelector(`.pce-visita-termo[data-modelo=${m}] [data-cad=ficha]`);
        await p.locator(`.pce-visita-termo[data-modelo=${m}] [data-cad=ficha]`).click(); await p.waitForSelector('#pceFichaForm');
        await foto('app-celular', 'ficha-' + m, 'Ficha oficial do modelo ' + m + ': só as perguntas próprias do modelo que a visita e o cadastro ainda não responderam', p);
        await p.click('#fi-salvar'); await p.waitForSelector('#pce-produtor');
        const pr = await imprimirVia(p, () => p.locator(`.pce-visita-termo[data-modelo=${m}] [data-cad=pdfficha]`).first().click());
        await salvarPdf(b, pr.html, 'ficha-oficial-' + m, 'PDF da ficha oficial do modelo ' + m + ' (modelo único, preenchida do cadastro e da visita)');
      });
    }
    await passo('Tela do produtor com fichas geradas', () => foto('app-celular', 'tela-do-produtor-com-fichas', 'Tela do produtor depois das fichas geradas (número por programa) e com os Termos da visita na lista', p));

    // ---- 7. Termo de Fiscalização e Termo de Colheita do papel ----
    await ir(p, 'pcetermos'); await p.waitForSelector('#mon-novo-papel');
    await passo('Termo do papel (formulário)', async () => {
      await p.click('#mon-novo-papel'); await p.waitForSelector('#monTfForm.pce-antigo');
      await foto('app-celular', 'termo-do-papel-vazio', 'Termo de Fiscalização do papel (digitação): servidor da vistoria, número do papel, interessado, descrição da ação, enquadramento e PDF escaneado', p);
      await p.fill('#mt-snome', 'Servidor Ficticio Teste'); await p.dispatchEvent('#mt-snome', 'change'); await p.selectOption('#mt-scargo', { index: 1 }); await p.fill('#mt-smatricula', '000.000-0'); await p.selectOption('#mt-slotacao', 'Autazes');
      await p.selectOption('#mt-unidade', 'Autazes'); await p.fill('#mt-numpapel', '1'); await p.fill('#mt-data', '2026-07-08'); await p.fill('#mt-hora', '14:20');
      await p.fill('#mt-nome', 'Produtor Papel Ficticio'); await p.fill('#mt-doc', '391.246.587-82'); await p.selectOption('#mt-municipio', 'Autazes'); await p.fill('#mt-lat', '-3,60033'); await p.fill('#mt-lon', '-59,15044W');
      await p.check('input[name="mt-acoes"][value="Fiscalização"]'); await p.click('#mt-negativa'); await p.fill('#mt-plantas', '75');
      await foto('app-celular', 'termo-do-papel-preenchido', 'Termo de Fiscalização do papel preenchido (número do papel conferido, coordenada convertida)', p);
      await p.click('#mt-salvar'); await aguardar(p, '#mon-pronto');
      await foto('app-celular', 'termo-do-papel-gravado', 'Termo do papel gravado com o número do papel', p);
      const pr = await imprimirVia(p, () => p.click('#mon-imprimir'));
      await salvarPdf(b, pr.html, 'termo-de-fiscalizacao-do-papel', 'PDF do Termo de Fiscalização digitado do papel (mesmo modelo único)');
    });
    await passo('Termo de Colheita do papel (formulário)', async () => {
      await ir(p, 'pcetermos'); await p.waitForSelector('#pce-novotermoantigo'); await p.click('#pce-novotermoantigo'); await p.waitForSelector('#pceTermoForm.pce-antigo');
      await foto('app-celular', 'termo-de-colheita-do-papel', 'Termo de Colheita do papel (digitação): número do papel, produtor, cultura, partes, análise e PDF escaneado', p);
      await p.click('[data-pce=descartartermo]').catch(() => {});
    });

    // ---- 8. levantamento antigo: só leitura ----
    await passo('Levantamento antigo (só leitura)', async () => {
      const id = await p.evaluate(async doc => {   // levantamento de antes da mudança, já na planilha (aqui gravado direto no aparelho)
        const id = Store.novoId(), cult = r => ({ cultura: 'Banana', area: '2', espLinha: '', espPlanta: '', espUnidade: 'm', resultado: r, coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '', fotos: [] });
        await Store.gravar('levantamentos', { id, data: '2026-03-10', hora: '09:30', doc, nome: 'PRODUTOR FICTICIO TESTE', propriedade: 'Propriedade Ficticia Teste', codigoPropriedade: 'PRP-0001', municipio: 'Manaus', uf: 'AM',
          servidor: 'Servidor Ficticio Teste', cargo: 'Fiscal', matricula: '1', lotacao: 'Manaus', lat: -3.12, lon: -60.02, fotos: '[]', assinaturas: '{}', culturas: '[]', excluido: 0, criadoEm: 1, atualizadoEm: 1, pendente: 0,
          pragas: JSON.stringify([{ praga: 'Moko da Bananeira', culturas: [cult('nao_detectada')] }, { praga: 'Fusarium R4T', culturas: [cult('nao_detectada')] }]) });
        return id; }, PRODUTOR.doc);
      await ir(p, 'pceprodutor', PRODUTOR.doc); await p.waitForSelector('#pce-visitas');
      await p.locator('#pce-visitas').scrollIntoViewIfNeeded();
      await foto('app-celular', 'tela-do-produtor-levantamento-antigo', 'Tela do produtor com um levantamento antigo na lista de visitas (identificado como "Levantamento antigo")', p);
      await ir(p, 'pcelevver', id); await p.waitForSelector('#pce-lev-ver');
      await tela('app', 'levantamento-antigo-so-leitura', 'Levantamento antigo aberto só para leitura, com o PDF por programa', { escuro: true });
      const pr = await imprimirVia(p, () => p.locator('.pce-pdf').first().click());
      await salvarPdf(b, pr.html, 'levantamento-antigo', 'PDF do levantamento antigo (só leitura; modelo antigo, por programa)');
    });

    // ---- 9. relatório de atividades e dados para o campo ----
    await passo('Relatório de atividades', async () => { await ir(p, 'pcerel'); await p.waitForSelector('#monRelForm', { timeout: 8000 }); await sleep(500); await foto('app-celular', 'relatorio-de-atividades', 'Relatório de atividades do PCE (período, município, servidores, folders, anexos)', p); });
    await passo('Dados para o campo', async () => { await ir(p, 'pcecampo'); await p.waitForSelector('#view .card, #view h3', { timeout: 8000 }); await sleep(500); await foto('app-celular', 'dados-para-o-campo', 'Baixar dados para o campo: municípios para consultar produtores e propriedades sem internet', p); });

    // ---- 10. painel ----
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
      await passo('Painel: lista de fichas', async () => {
        const T = pg.locator('.pn-tab', { hasText: 'Cadastros de imóvel' }).first(); await T.waitFor({ timeout: 10000 }); await T.scrollIntoViewIfNeeded();
        await foto('painel', 'fichas-de-imovel-com-programa', 'Painel: lista de fichas/cadastros de imóvel de todos os programas, com a coluna Programa', T);
      });
      for (const [v, nome, desc] of [['culturas', 'culturas', 'Painel, aba PCE, Culturas (catálogo)'], ['pragas', 'doencas-e-pragas', 'Painel, aba PCE, Doenças e pragas (catálogo)']]) {
        await passo('Painel: ' + nome, async () => {
          await pg.click(`[data-pce-visao=${v}]`); await pg.waitForSelector('.pn-cat', { timeout: 10000 }); await sleep(700);
          await foto('painel', nome, desc, pg);
        });
      }
      await cx.close();
    });

    avisos.push('PDFs: as imagens vêm do HTML de impressão aberto numa página nova do navegador de teste (fonte Arial trocada por equivalente); no Termo e na ficha o rodapé da folha aparece sobre a última linha de assinaturas e perguntas. Conferir no PDF gerado pelo aparelho antes de dar como defeito do modelo.');
    if (errosJs.length) avisos.push('Erros de JavaScript no app durante o roteiro: ' + [...new Set(errosJs)].slice(0, 3).join(' | '));
  } finally {
    if (b) await b.close().catch(() => {});
    parar(srv);
  }

  // ---------------- LEIA-ME ----------------
  const L = ['# Telas do módulo PCE (e-GDV)', '',
    'Fotos geradas por `tests/lib/telas-pce.js`, do fluxo atual do PCE (Produtores, tela do produtor, Nova visita em 5 passos, Termos, fichas oficiais, Termo do papel e levantamento antigo só leitura), com dados claramente fictícios (produtor "Produtor Ficticio Teste", CPF 529.982.247-25), num sistema local em memória que não toca a produção.', '',
    '## Como regerar', '', '```sh', 'cd tests && node lib/telas-pce.js', '```', '',
    'Substitui as fotos desta pasta. Para outra pasta: `GDV_SAIDA_TELAS=/caminho node lib/telas-pce.js`. Portas usadas: 8231 (web) e 8232 (API), configuráveis por `GDV_PORTA_WEB` e `GDV_PORTA_API`.', ''];
  const secoes = [['app-celular', 'App no celular (400 px, página inteira; menu Módulos | Produtores | Termos)'], ['app-computador', 'App no computador (1280 px)'], ['painel', 'Painel (1440 px)'], ['pdfs', 'PDFs (arquivo .pdf e imagem .png de cada página)'], ['tema-escuro', 'Tema escuro (app no celular)']];
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
