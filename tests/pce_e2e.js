const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const F = require('./lib/pce-form');
// Módulo PCE de ponta a ponta (levantamento por cultura, um PDF por programa): app real (Chromium) + Code.gs real (fakegas, com Drive falso).
const { chromium } = require('playwright-core');
const { API, APP } = amb;
const get = p => fetch(API + p).then(r => r.json());
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const ler = async aba => (await get('/__fn?nome=lerLeitura_&args=' + encodeURIComponent(JSON.stringify([aba])))).r;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) throw new Error(m); };
const ANO = new Date().getFullYear();
(async () => {
  const b = await amb.lancar();
  const credencial = async nome => { const r = await U.fiscal(nome); return { token: r.token, nome }; };
  const aparelho = async ({ token, nome }) => {
    const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.1234567, longitude: -58.4432, accuracy: 9 } });
    await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [token, nome]);
    await c.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { if (window === window.top && typeof CONFIG !== 'undefined') CONFIG.assinaturaNaTela = true; }));   // assinatura na tela está desligada no app (CONFIG.assinaturaNaTela); o teste liga para seguir conferindo esse código
    await c.addInitScript(() => { if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' '), paginas: d.querySelectorAll('.a4').length, vias: [...d.querySelectorAll('.via')].map(v => v.textContent), titulo: window.top.document.title, cancelado: !!d.querySelector('.cancelado-faixa'), imgs: [...d.querySelectorAll('img')].filter(i => i.src.startsWith('data:image')).length, semFoto: d.querySelectorAll('.sem-foto').length, html: d.documentElement.outerHTML }); }; });
    const p = await c.newPage(); p.err = []; p.on('pageerror', e => p.err.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && p.err.push(m.text()));
    p.on('dialog', d => d.type() === 'prompt' ? d.accept('digitação errada') : d.accept()); p.ctx = c;
    await p.goto(APP); await p.waitForSelector('#view *', { state: 'attached' }); await p.waitForTimeout(700); return p;
  };
  const pendentes = p => p.evaluate(async () => { const n = ['turnos', 'veiculos', 'tfs', 'pessoas', 'placas', 'levantamentos', 'colheitas', 'propriedades'];
    let t = 0; for (const s of n) t += (await Store.todos(s)).filter(x => x.pendente).length; return t + (await Sync.arquivosPendentes()).length; });
  const sync = async p => { for (let i = 0; i < 20; i++) { await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(300); if ((await pendentes(p)) === 0 && await p.evaluate(() => Sync.estado().tipo === 'ok')) return; } throw new Error('sync não terminou'); };
  const imprimir = async (p, sel) => { await p.evaluate(() => { window.__prints = []; }); await p.locator(sel).first().click(); await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 10000 }); return p.evaluate(() => window.__prints[0]); };
  const imagem = (p, w, h, cor) => p.evaluate(([w, h, cor]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = cor; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(w / 4, h / 4, w / 2, h / 2); return c.toDataURL('image/jpeg', 0.9).split(',')[1]; }, [w, h, cor]).then(s => Buffer.from(s, 'base64'));
  const assinar = async (p, sel) => { const cv = p.locator(sel); await cv.scrollIntoViewIfNeeded(); const bb = await cv.boundingBox();
    await p.mouse.move(bb.x + 20, bb.y + 30); await p.mouse.down(); await p.mouse.move(bb.x + 140, bb.y + 90, { steps: 8 }); await p.mouse.move(bb.x + 220, bb.y + 40, { steps: 8 }); await p.mouse.up(); };
  const irPCE = async p => { if (!(await p.locator('.modulo').count())) await p.click('nav [data-v=modulos]'); await p.waitForSelector('.modulo[data-v=pce]'); await p.click('.modulo[data-v=pce]'); };
  const identificar = async (p, cargoIdx = 1) => {
    await p.waitForSelector('#pceServForm');
    await p.selectOption('#pce-s-cargo', { index: cargoIdx }); await p.fill('#pce-s-matricula', '12345'); await p.selectOption('#pce-s-lotacao', 'Manaus');
    await p.click('#pce-s-salvar'); await p.waitForSelector('#pce-novolev');
  };
  const CU = F.cult;                                                      // card i de cultura
  const PRG = (i, nome) => `${CU(i)} >> .pce-pr[data-nome="${nome}"]`;      // praga do catálogo no card i
  const OUTRA = i => `${CU(i)} >> .pce-pr[data-ligada=""]`;                // praga somada em "+ Outra praga/doença"
  // grava o documento impresso (HTML capturado em window.print) como PDF e PNG em saida/, para conferência visual
  const salvarPdf = async (p, pr, nome) => {
    const pg = await p.context().newPage(); await pg.goto(APP + 'documentos/pce-levantamento.html');
    await pg.setContent(pr.html.replace('<head>', `<head><base href="${APP}documentos/">`)); await pg.waitForTimeout(300);
    await pg.pdf({ path: amb.saida(nome + '.pdf'), format: 'A4', printBackground: true, margin: { top: '8mm', bottom: '8mm', left: '7mm', right: '7mm' } });
    await pg.setViewportSize({ width: 800, height: 1100 }); await pg.screenshot({ path: amb.saida(nome + '.png'), fullPage: true }); await pg.close();
  };
  const novoTermo = async p => { await p.click('nav [data-v=pcetermos]'); await p.waitForSelector('#pce-novotermo'); await p.click('#pce-novotermo'); await p.waitForSelector('#pceTermoForm'); };   // "Novo termo" saiu do menu: fica na lista de termos
  const statusDoc = (p, pref, re) => p.waitForFunction(([pref, re]) => new RegExp(re).test(document.querySelector('#' + pref + 'st-doc').textContent), [pref, re.source], { timeout: 10000 });

  const fA = await credencial('Pessoa Ficticia Alfa'), fB = await credencial('Pessoa Ficticia Beta');

  console.log('0) hub com 3 módulos');
  const A = await aparelho(fA);
  const tit = await A.locator('.modulo b').allTextContents();
  ok(tit.length === 3 && /Educação Sanitária\/Fiscalização de Trânsito/.test(tit[0]) && /Termo de Fiscalização/.test(tit[1]) && tit[2] === 'PCE', 'três módulos: ' + tit.join(' | '));
  ok(/Programa de Controle e Erradicação — levantamento fitossanitário e Termo de Colheita de Amostras/.test(await A.textContent('.modulo[data-v=pce]')) && (await A.textContent('.modulo[data-v=pce] .pce-status')) === 'Nenhum registro', 'cartão PCE com subtítulo e status "Nenhum registro"');

  console.log('1) identificação do servidor na 1ª entrada');
  await irPCE(A); await A.waitForSelector('#pceServForm');
  ok((await A.inputValue('#pce-s-nome')) === 'Pessoa Ficticia Alfa', 'nome do servidor vem da conta');
  ok(await A.locator('#nav [data-v=pcelev]').count() === 1 && await A.locator('#nav [data-v=pcetermos]').count() === 1, 'menu do módulo PCE (Levantamentos / Novo levantamento / Termos / Novo termo)');
  await A.click('#pce-s-salvar'); await A.waitForTimeout(200); ok(/cargo/i.test(await A.textContent('#toast')) && await A.locator('#pceServForm').count() === 1, 'sem cargo não salva');
  await identificar(A);
  ok(/Pessoa Ficticia Alfa/.test(await A.textContent('.pce-serv')) && /Manaus/.test(await A.textContent('.pce-serv')), 'lista mostra o servidor identificado');
  ok(/Nenhum levantamento/.test(await A.textContent('#pceItens')), 'lista vazia');

  console.log('2) novo levantamento SEM internet: 2 culturas (cards) com as pragas do catálogo, resultados, amostras e fotos por cultura, assinatura');
  await A.ctx.setOffline(true); await A.evaluate(() => window.dispatchEvent(new Event('offline')));
  await A.click('#pce-novolev'); await A.waitForSelector('#pceLevForm');
  await A.waitForFunction(() => document.querySelector('#pce-lat').value !== '', null, { timeout: 10000 });
  ok((await A.inputValue('#pce-lat')).startsWith('-3.12') && await A.getAttribute('#pce-lat', 'readonly') !== null, 'GPS automático ao abrir (lat/lon somente leitura): ' + await A.inputValue('#pce-lat') + ', ' + await A.inputValue('#pce-lon'));
  ok((await A.inputValue('#pce-data')) && (await A.inputValue('#pce-hora')) && (await A.inputValue('#pce-municipio')) === 'Manaus', 'data/hora preenchidas; município = lotação');
  ok(await A.locator('.pce-cultura').count() === 1 && (await A.inputValue(CU(0) + ' >> .c-cultura')) === '' && await A.locator('.pce-pr').count() === 0 && /Escolha a cultura/.test(await A.textContent(CU(0))),
    'formulário começa com 1 card de cultura, sem cultura escolhida e sem pragas (elas aparecem ao escolher a cultura)');
  await A.fill('#pce-doc', '52998224725'); await statusDoc(A, 'pce-', /Novo cadastro/);
  await A.fill('#pce-nome', 'josé da silva'); await A.fill('#pce-telefone', '92 98888-7777'); await A.fill('#pce-email', 'jose@exemplo.com');
  await A.fill('#pce-propriedade', 'Sítio Boa Vista'); await A.fill('#pce-codigo', ''); await A.selectOption('#pce-situacao', 'Posse');
  // card 1: Cacau — Monilíase do catálogo (obrigatória, não detectada, com amostra); espaçamento em cm
  await F.cultura(A, 0, 'Cacau');
  ok(await A.locator(PRG(0, 'Monilíase do Cacaueiro')).count() === 1 && await A.locator(CU(0) + ' >> .pce-pr').count() === 1 && /\*/.test(await A.textContent(PRG(0, 'Monilíase do Cacaueiro') + ' >> legend')),
    'ao escolher Cacau, a Monilíase do catálogo aparece sozinha e o resultado é obrigatório (*)');
  await A.click(CU(0) + ' >> .pce-esp-un label:has(input[value=cm])'); await A.fill(CU(0) + ' >> .c-espLinha', '300'); await A.fill(CU(0) + ' >> .c-espPlanta', '300');
  await A.evaluate(() => { const i = document.querySelectorAll('.pce-cultura')[0].querySelector('.c-espUnidade:checked'); if (i) i.checked = false; });
  await A.click('#pce-salvar'); await A.waitForTimeout(250);
  ok(/Escolha a unidade do espaçamento \(metros ou centímetros\) de Cacau/.test(await A.textContent('#toast')), 'espaçamento sem unidade não salva: ' + await A.textContent('#toast'));
  await A.click(CU(0) + ' >> .pce-esp-un label:has(input[value=cm])'); await A.click('#pce-salvar'); await A.waitForTimeout(250);
  ok(/Informe o resultado de Monilíase do Cacaueiro em Cacau/.test(await A.textContent('#toast')) && await A.locator('#pceLevForm').count() === 1, 'a praga do catálogo sem resultado não salva: ' + await A.textContent('#toast'));
  await A.click(PRG(0, 'Monilíase do Cacaueiro') + ' >> .pce-res-nao_detectada');
  ok(await A.isDisabled(PRG(0, 'Monilíase do Cacaueiro') + ' >> .r-tipoMaterial') && await A.isDisabled(PRG(0, 'Monilíase do Cacaueiro') + ' >> .r-codigoAmostra'), 'coleta = Não: campos de amostra desabilitados');
  await A.selectOption(PRG(0, 'Monilíase do Cacaueiro') + ' >> .r-coleta', 'Sim');
  ok(!(await A.isDisabled(PRG(0, 'Monilíase do Cacaueiro') + ' >> .r-tipoMaterial')) && !(await A.isDisabled(PRG(0, 'Monilíase do Cacaueiro') + ' >> .r-destinoAmostra')), 'coleta = Sim: campos de amostra habilitados');
  await A.fill(PRG(0, 'Monilíase do Cacaueiro') + ' >> .r-tipoMaterial', 'Folhas'); await A.fill(PRG(0, 'Monilíase do Cacaueiro') + ' >> .r-codigoAmostra', 'AM-002'); await A.fill(PRG(0, 'Monilíase do Cacaueiro') + ' >> .r-destinoAmostra', 'LAB ADAF');
  // card 2: Banana — Fusariose (opcional do catálogo, detectada) + "Outra" digitada (suspeita, amostra); área, espaçamento em m e foto
  await A.click('#pce-addcult'); ok(await A.locator('.pce-cultura').count() === 2, '2º card de cultura adicionado');
  await F.cultura(A, 1, 'Banana'); await A.fill(CU(1) + ' >> .c-area', '2,5');
  ok(await A.locator(PRG(1, 'Fusarium R4T') + ' small.pce-pr-cat').textContent() === 'opcional' && !/\*/.test(await A.textContent(PRG(1, 'Fusarium R4T') + ' >> legend')) && /opcional/.test(await A.textContent(PRG(1, 'Fusarium R4T') + ' >> legend')),
    'Banana: a Fusariose (FOC R4T) vem do catálogo como opcional (resposta não obrigatória)');
  await F.responder(A, 1, 'Fusarium R4T', 'detectada');
  ok(await A.locator(CU(1) + ' >> .c-espUnidade:checked').getAttribute('value') === 'm', 'espaçamento: seletor de unidade visível, começa em m');
  await A.fill(CU(1) + ' >> .c-espLinha', '3 metros'); await A.fill(CU(1) + ' >> .c-espPlanta', '2,5,0');
  ok(await A.inputValue(CU(1) + ' >> .c-espLinha') === '3' && await A.inputValue(CU(1) + ' >> .c-espPlanta') === '2,50', 'espaçamento: só número, um separador decimal');
  ok((await A.inputValue(CU(0) + ' >> .c-cultura')) === 'Cacau' && await A.locator(PRG(0, 'Monilíase do Cacaueiro') + ' >> .r-res:checked').getAttribute('value') === 'nao_detectada', 'adicionar cultura não apaga a anterior (cultura e resultado)');
  const foto = await imagem(A, 2400, 1800, '#2a7');
  await A.setInputFiles(CU(1) + ' >> .c-fotos', [{ name: 'lavoura.jpg', mimeType: 'image/jpeg', buffer: foto }]);
  await A.waitForSelector(CU(1) + ' >> .pce-fotos .pce-foto img');
  const dims = await A.evaluate(async () => { const a = (await Store.todos('arquivos'))[0]; const i = new Image(); await new Promise(r => { i.onload = r; i.src = a.dados; }); return { w: i.naturalWidth, h: i.naturalHeight, mime: a.mime, enviado: a.enviado, rotulo: a.rotulo }; });
  ok(dims.w === 1600 && dims.h === 1200 && dims.mime === 'image/jpeg' && dims.enviado === 0, 'foto reduzida no aparelho (2400×1800 → ' + dims.w + '×' + dims.h + ', JPEG)');
  ok(dims.rotulo === 'Banana', 'foto ligada à cultura do card: ' + dims.rotulo);
  ok(await A.locator(CU(0) + ' >> .pce-foto img').count() === 0, 'a foto fica só na cultura em que foi tirada');
  await A.setInputFiles(CU(0) + ' >> .c-fotos', [{ name: 'fruto.jpg', mimeType: 'image/jpeg', buffer: await imagem(A, 900, 700, '#c52') }]);
  await A.waitForSelector(CU(0) + ' >> .pce-fotos .pce-foto img');
  await A.click(CU(1) + ' >> .pce-addpraga');
  ok(await A.locator(OUTRA(1)).count() === 1 && await A.locator(OUTRA(1) + ' >> .r-outra-l').isHidden(), 'campo "nome da praga" escondido até escolher "Outra"');
  await A.selectOption(OUTRA(1) + ' >> .r-praga', '__outra'); ok(await A.locator(OUTRA(1) + ' >> .r-outra').isVisible(), '"Outra (digitar o nome)" mostra o campo do nome');
  await A.click('#pce-salvar'); await A.waitForTimeout(250);
  ok(/digite o nome da praga/i.test(await A.textContent('#toast')) && await A.locator('#pceLevForm').count() === 1, '"Outra" sem nome não salva: ' + await A.textContent('#toast'));
  await A.fill(OUTRA(1) + ' >> .r-outra', 'Mosca-negra-dos-citros');
  await A.click('#pce-salvar'); await A.waitForTimeout(250);
  ok(/Informe o resultado de Mosca-negra-dos-citros em Banana/.test(await A.textContent('#toast')), 'praga somada sem resultado não salva: ' + await A.textContent('#toast'));
  await A.click(OUTRA(1) + ' >> .pce-res-suspeita'); await A.selectOption(OUTRA(1) + ' >> .r-coleta', 'Sim');
  await A.fill(OUTRA(1) + ' >> .r-tipoMaterial', 'Frutos'); await A.fill(OUTRA(1) + ' >> .r-codigoAmostra', 'AM-001'); await A.fill(OUTRA(1) + ' >> .r-destinoAmostra', 'LAB ADAF');
  // card 3 repetindo a cultura do card 2: recusado (junta numa só); depois removido
  await A.click('#pce-addcult'); await F.cultura(A, 2, 'Banana');
  await A.click('#pce-salvar'); await A.waitForTimeout(250);
  ok(/Banana está em dois cards/.test(await A.textContent('#toast')), 'a mesma cultura em dois cards é recusada: ' + await A.textContent('#toast'));
  await A.click(CU(2) + ' >> [data-pce=delcult]'); ok(await A.locator('.pce-cultura').count() === 2, 'card repetido removido');
  await A.setViewportSize({ width: 390, height: 844 }); await A.locator(CU(0)).scrollIntoViewIfNeeded();
  await A.screenshot({ path: amb.saida('pce_form_cultura_390.png'), fullPage: true }); await A.setViewportSize({ width: 400, height: 900 });
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'formulário sem rolagem horizontal no celular');
  await assinar(A, '#pce-ass-servidor'); await A.waitForTimeout(700);
  await A.fill('#pce-obs', 'Plantas com sintomas de murcha.');
  for (const k of ['hlb', 'acaro', 'cancro']) await A.click(`#pce-citros label:has(input[name="pce-ci-det-${k}-tem"][value="nao"])`);   // praga de citros: detecção obrigatória
  await A.click('#pce-salvar'); await A.waitForSelector('#pce-lev-pronto');
  ok(await A.locator('#pce-lev-pronto').count() === 1 && /Fusarium R4T/.test(await A.textContent('#pce-lev-pronto')) && /Mosca-negra-dos-citros/.test(await A.textContent('#pce-lev-pronto')) && await A.locator('#pce-pronto-res .pce-res-cultura').count() === 2,
    'depois de salvar: tela com o resumo por cultura e praga');
  const botoesPdf = await A.locator('[data-pce=imprimirlev]').allTextContents();
  ok(botoesPdf.length === 3 && /PDF: Monilíase do Cacaueiro e Cupuaçuzeiro/.test(botoesPdf[0]) && /PDF: Pragas da Bananeira/.test(botoesPdf[1]) && /PDF: Mosca-negra-dos-citros/.test(botoesPdf[2]) && await A.locator('[data-pce=imprimirtodos]').count() === 1,
    'botões "PDF: <programa>" (um por programa, como o Termo; a praga digitada é um programa à parte) e "Imprimir todos": ' + botoesPdf.join(' | '));
  ok(await A.locator('#pce-pronto-termo').count() === 1 && /2 amostra/.test(await A.textContent('#pce-pronto-termo')), 'atalho para o Termo de colheita (2 amostras)');
  await A.screenshot({ path: amb.saida('pce_lev_pronto.png'), fullPage: true });
  await A.click('#pce-pronto-lista'); await A.waitForSelector('.item.pce-lev');
  ok(/JOSÉ DA SILVA/.test(await A.textContent('#pceItens')) && /3 praga\(s\)\/doença\(s\) · 3 cultura\(s\) avaliada\(s\) · 2 com coleta · 2 foto\(s\)/.test(await A.textContent('#pceItens')), 'levantamento na lista: ' + (await A.textContent('.item.pce-lev .info')).trim());
  ok(await A.locator('.item.pce-lev [data-pce=imprimirlev]').count() === 3 && await A.locator('.item.pce-lev [data-pce=imprimirtodos]').count() === 1, 'lista: um botão de PDF por programa + Imprimir todos');
  ok(/Fusarium R4T Detectada/.test(await A.textContent('.item.pce-lev .pce-res-resumo')) && /Mosca-negra-dos-citros Suspeita/.test(await A.textContent('.item.pce-lev .pce-res-resumo')), 'lista: resultado de cada praga');
  ok(await A.locator('.item.pce-lev .info.pend').count() === 1, 'pendente de envio (sem internet)');
  ok(await A.locator('#pceItens .pce-lev-grupo').count() === 1 && /levantamento\(s\)/.test(await A.textContent('#pceItens .pce-lev-grupo')), 'lista organizada por município (padrão)');
  await A.selectOption('#pce-ordem', 'data');
  ok(await A.locator('#pceItens .pce-lev-grupo').count() === 0 && await A.locator('.item.pce-lev').count() === 1, 'organizar por data: sem os títulos de município');
  await A.selectOption('#pce-ordem', 'municipio'); await A.waitForSelector('#pceItens .pce-lev-grupo');
  const loc = await A.evaluate(async () => ({ lev: (await Store.todos('levantamentos'))[0], pes: await Store.obter('pessoas', '52998224725'), props: await Store.todos('propriedades'), arqs: (await Store.todos('arquivos')).map(a => ({ id: a.id, tipo: a.tipo, papel: a.papel, mime: a.mime, enviado: a.enviado, rotulo: a.rotulo })) }));
  const prg = JSON.parse(loc.lev.pragas), cult = JSON.parse(loc.lev.culturas), ass = JSON.parse(loc.lev.assinaturas), fotosLev = JSON.parse(loc.lev.fotos);
  const espSalvo = [...new Map(prg.flatMap(g => g.culturas).map(c => [c.cultura, `${c.cultura}:${c.espLinha}x${c.espPlanta} ${c.espUnidade}`])).values()].join('|');
  ok(espSalvo === 'Cacau:300x300 cm|Banana:3x2,50 m', 'espaçamento gravado com a unidade: ' + espSalvo);
  ok(prg.length === 3 && prg[0].praga === 'Monilíase do Cacaueiro' && prg[0].culturas.length === 1 && prg[0].culturas[0].cultura === 'Cacau' && prg[1].praga === 'Fusarium R4T' && prg[1].culturas[0].cultura === 'Banana'
    && prg[2].praga === 'Mosca-negra-dos-citros' && prg[2].culturas[0].cultura === 'Banana', 'pragas gravadas como JSON (praga → culturas): as do catálogo e a somada, cada uma com a cultura do card');
  ok(prg[0].culturas[0].resultado === 'nao_detectada' && prg[1].culturas[0].resultado === 'detectada' && prg[2].culturas[0].resultado === 'suspeita', 'resultado de cada praga na cultura (não detectada / detectada / suspeita)');
  ok(prg[0].culturas[0].fotos.length === 1 && prg[1].culturas[0].fotos.length === 1 && prg[2].culturas[0].fotos.join() === prg[1].culturas[0].fotos.join() && fotosLev.length === 2 && fotosLev.includes(prg[0].culturas[0].fotos[0]) && fotosLev.includes(prg[1].culturas[0].fotos[0]),
    'fotos por cultura (as pragas da mesma cultura dividem as dela); "fotos" do registro = todas');
  ok(prg[0].culturas[0].coleta === 'Sim' && prg[0].culturas[0].codigoAmostra === 'AM-002' && prg[1].culturas[0].coleta === 'Não' && prg[1].culturas[0].codigoAmostra === '' && prg[2].culturas[0].codigoAmostra === 'AM-001', 'amostra só nas pragas com coleta');
  ok(cult.length === 3 && cult[0].praga === '' && cult[0].pragaAvaliada === 'Monilíase do Cacaueiro' && cult[1].praga === 'Fusarium R4T' && cult[2].praga === 'Mosca-negra-dos-citros' && cult[2].resultado === 'suspeita', 'culturas derivadas (uma por cultura × praga; praga só se detectada/suspeita)');
  const ls = await A.evaluate(async () => ({ cult: (await Store.todos('culturasAvaliadas')).map(c => c.cultura).sort(), res: (await Store.todos('resultados')).map(r => r.praga + ':' + r.resultado).sort() }));
  ok(ls.cult.join() === 'Banana,Cacau' && ls.res.join() === 'Fusarium R4T:detectada,Monilíase do Cacaueiro:nao_detectada,Mosca-negra-dos-citros:suspeita', 'culturas avaliadas e resultados da visita (uma linha por cultura e por cultura × praga) gravados no aparelho', ls);
  ok(loc.lev.servidor === 'Pessoa Ficticia Alfa' && loc.lev.lotacao === 'Manaus' && loc.lev.matricula === '12345' && loc.lev.nome === 'JOSÉ DA SILVA' && loc.lev.doc === '52998224725', 'dados do servidor copiados para o registro; nome em maiúsculas; doc só dígitos');
  ok(ass.servidor && !ass.produtor && loc.arqs.length === 3 && loc.arqs.some(a => a.tipo === 'assinatura' && a.papel === 'servidor' && a.mime === 'image/png'), 'assinatura do servidor virou arquivo PNG; a do produtor (não desenhada) não');
  ok(loc.arqs.filter(a => a.tipo === 'foto').map(a => a.rotulo).sort().join('|') === 'Banana|Cacau', 'cada foto guarda a cultura (rótulo)');
  ok(loc.pes && loc.pes.email === 'jose@exemplo.com' && loc.pes.telefone === '92 98888-7777' && loc.props.length === 1 && loc.props[0].id === '52998224725|SITIO BOA VISTA' && loc.props[0].situacaoFundiaria === 'Posse', 'produtor (com e-mail) e propriedade gravados no aparelho');
  const nPend = await pendentes(A); ok(nPend === 6, 'pendentes: levantamento + pessoa + propriedade + 3 arquivos = ' + nPend);
  await A.waitForFunction(() => /6 a enviar/.test(document.querySelector('#sync').textContent), null, { timeout: 5000 }); ok(true, 'selo: ' + await A.textContent('#sync'));
  await A.click('nav [data-v=modulos]'); await A.waitForSelector('.modulo[data-v=pce]');
  ok(/1 levantamento\(s\) · 0 termo\(s\) · 4 aguardando envio/.test(await A.textContent('.modulo[data-v=pce] .pce-status')), 'cartão do hub: ' + await A.textContent('.modulo[data-v=pce] .pce-status'));

  console.log('3) volta a internet: sincroniza e envia as fotos ao Drive');
  await A.ctx.setOffline(false); await A.evaluate(() => window.dispatchEvent(new Event('online'))); await sync(A);
  const levs = await ler('Levantamentos');
  ok(levs.length === 1 && levs[0].usuario === 'Pessoa Ficticia Alfa' && JSON.parse(levs[0].culturas).length === 3 && JSON.parse(levs[0].pragas).length === 3 && levs[0].email === 'jose@exemplo.com', 'planilha: levantamento gravado (usuário, pragas, culturas derivadas, e-mail)');
  const pes = (await ler('Pessoas')).find(x => x.id === '52998224725'); ok(pes && pes.email === 'jose@exemplo.com', 'planilha: pessoa com e-mail');
  ok((await ler('Propriedades')).some(x => x.id === '52998224725|SITIO BOA VISTA'), 'planilha: propriedade');
  let arqS = await ler('Arquivos'), drive = await get('/__drive');
  ok(arqS.length === 3 && drive.arquivos.length === 3 && drive.arquivos.every(a => a.caminho === `GDV - Arquivos/PCE/${ANO}/levantamentos` && !a.compartilhado), 'Drive falso recebeu 2 fotos e a assinatura: ' + drive.arquivos.map(a => a.nome.slice(0, 70)).join(' ; '));
  ok(drive.arquivos.some(a => /_foto_\d_Banana_/.test(a.nome)) && drive.arquivos.some(a => /_foto_\d_Cacau_/.test(a.nome)) && arqS.filter(a => a.rotulo).length === 2, 'fotos no Drive com a cultura no nome; rótulo na aba Arquivos');
  const locArq = await A.evaluate(async () => (await Store.todos('arquivos')).map(a => ({ enviado: a.enviado, url: a.url, temDados: !!a.dados })));
  ok(locArq.every(a => a.enviado === 1 && /drive\.google\.com/.test(a.url) && a.temDados), 'arquivos marcados enviado=1 com link; imagem mantida no aparelho');
  ok((await pendentes(A)) === 0 && !/a enviar/.test(await A.textContent('#sync')), 'nada pendente; selo: ' + await A.textContent('#sync'));
  await irPCE(A); await A.waitForSelector('.item.pce-lev'); ok(await A.locator('.item.pce-lev .info.pend').count() === 0, 'lista sem "aguardando envio"');

  console.log('4) um PDF por programa (como o Termo de Fiscalização)');
  let pr = await imprimir(A, '.item.pce-lev [data-pce=imprimirlev][data-g="0"]');
  ok(/Ficha de Levantamento Fitossanit/i.test(pr.texto) && pr.texto.includes('JOSÉ DA SILVA') && pr.texto.includes('529.982.247-25') && pr.texto.includes('Sítio Boa Vista') && pr.texto.includes('jose@exemplo.com'), 'PDF 1: título, produtor, CPF formatado, propriedade, e-mail');
  ok(/PROGRAMA Monilíase do Cacaueiro e Cupuaçuzeiro/.test(pr.texto) && /FICHA 1 de 3/.test(pr.texto) && /1 Cacau 300 cm 300 cm Não detectada Sim Folhas AM-002 LAB ADAF/.test(pr.texto),
    'PDF 1 (programa da Monilíase): ficha 1 de 3, a cultura Cacau com resultado, espaçamento e amostra');
  ok(!pr.texto.includes('Banana') && !pr.texto.includes('AM-001') && !/Suspeita|Detectada/.test(pr.texto.replace(/Não detectada/g, '')), 'PDF 1 não traz as outras culturas, programas nem amostras');
  ok(/3°07'/.test(pr.texto) && /-3\.12345/.test(pr.texto) && pr.texto.includes('Pessoa Ficticia Alfa') && pr.texto.includes('Plantas com sintomas de murcha.'), 'PDF 1: coordenadas (decimal e GMS), servidor, observações');
  ok(pr.imgs === 2 && pr.semFoto === 0 && /Cultura 1: Cacau · Não detectada · 1 foto\(s\)/.test(pr.texto) && /Cacau – foto 1/.test(pr.texto), 'PDF 1: só a foto do Cacau (agrupada por cultura, com legenda) + assinatura (' + pr.imgs + ' imagens)');
  ok(/^Levantamento_JOSE_DA_SILVA_Moniliase_do_Cacaueiro_e_Cupuacuzeiro_\d\d-\d\d-\d{4}$/.test(pr.titulo), 'nome sugerido do PDF 1: ' + pr.titulo);
  await salvarPdf(A, pr, 'pce_lev_pdf_moniliase');
  pr = await imprimir(A, '.item.pce-lev [data-pce=imprimirlev][data-g="1"]');
  ok(/PROGRAMA Pragas da Bananeira/.test(pr.texto) && /FICHA 2 de 3/.test(pr.texto) && /1 Banana – Fusarium R4T 2,5 3 m 2,50 m Detectada Não/.test(pr.texto) && !pr.texto.includes('Cacau') && !pr.texto.includes('AM-002') && !pr.texto.includes('AM-001'),
    'PDF 2 (Pragas da Bananeira, com a Fusariose opcional): só a Banana detectada (com a praga na linha: o nome do programa não a diz), com o espaçamento e a unidade junto do valor (m)');
  ok(pr.imgs === 2 && /Banana – foto 1/.test(pr.texto) && /^Levantamento_JOSE_DA_SILVA_Pragas_da_Bananeira_\d\d-\d\d-\d{4}$/.test(pr.titulo), 'PDF 2: a foto da Banana + assinatura; nome ' + pr.titulo);
  await salvarPdf(A, pr, 'pce_lev_pdf_bananeira');
  pr = await imprimir(A, '.item.pce-lev [data-pce=imprimirlev][data-g="2"]');
  ok(/PROGRAMA Mosca-negra-dos-citros/.test(pr.texto) && /FICHA 3 de 3/.test(pr.texto) && /1 Banana 2,5 3 m 2,50 m Suspeita Sim Frutos AM-001 LAB ADAF/.test(pr.texto) && !pr.texto.includes('Cacau') && !pr.texto.includes('AM-002'),
    'PDF 3 (praga digitada, programa próprio): só a Banana suspeita e a amostra dela');
  ok(pr.imgs === 2 && /Banana – foto 1/.test(pr.texto) && /^Levantamento_JOSE_DA_SILVA_Mosca-negra-dos-citros_\d\d-\d\d-\d{4}$/.test(pr.titulo), 'PDF 3: a foto da Banana + assinatura; nome ' + pr.titulo);
  await salvarPdf(A, pr, 'pce_lev_pdf_mosca');
  // Imprimir todos: o 1º sai já; os seguintes um a um, com um toque (no celular cada um abre a sua janela de impressão)
  await A.evaluate(() => { window.__prints = []; }); await A.click('.item.pce-lev [data-pce=imprimirtodos]');
  await A.waitForSelector('#pce-modal-todos #pce-todos-prox');
  ok((await A.evaluate(() => window.__prints.length)) === 1 && /PDF 1 de 3 gerado: Monilíase do Cacaueiro e Cupuaçuzeiro/.test(await A.textContent('#pce-modal-todos')) && /Pragas da Bananeira/.test(await A.textContent('#pce-todos-prox')), 'Imprimir todos: PDF 1 de 3 e botão para o próximo');
  await A.click('#pce-todos-prox'); await A.waitForFunction(() => window.__prints.length === 2);
  await A.click('#pce-todos-prox'); await A.waitForFunction(() => window.__prints.length === 3 && /Todos os 3 PDFs/.test(document.querySelector('#pce-modal-todos')?.textContent || ''));
  const todos = await A.evaluate(() => window.__prints.map(x => x.titulo));
  ok(/_Moniliase_do_Cacaueiro/.test(todos[0]) && /_Pragas_da_Bananeira_/.test(todos[1]) && /_Mosca-negra-dos-citros_/.test(todos[2]), 'Imprimir todos: os 3 PDFs, um por programa, em sequência: ' + todos.join(' | '));
  await A.click('#pce-todos-fechar'); ok(await A.locator('#pce-modal-todos').count() === 0, 'Imprimir todos: fechar');

  console.log('5) termo de colheita a partir do levantamento');
  await A.click('[data-pce=termodelev]'); await A.waitForSelector('#pceTermoForm');
  ok((await A.inputValue('#pce-t-doc')) === '529.982.247-25' && (await A.inputValue('#pce-t-nome')) === 'JOSÉ DA SILVA' && (await A.inputValue('#pce-t-municipio')) === 'Manaus', 'pré-preenchido: produtor e município do levantamento');
  ok((await A.inputValue('#pce-t-cultura')) === 'Cacau' && (await A.inputValue('#pce-t-lat')).startsWith('-3.12') && /Sítio Boa Vista/.test(await A.inputValue('#pce-t-endereco')) && (await A.inputValue('#pce-t-unidade')) === 'Manaus', 'cultura com coleta = Sim (a 1ª), coordenadas, propriedade e unidade (lotação)');
  const opAm = await A.locator('#pce-t-amostra option').allTextContents();
  ok(opAm.length === 2 && /Cacau — Monilíase do Cacaueiro · cód\. AM-002/.test(opAm[0]) && /Banana — Mosca-negra-dos-citros · cód\. AM-001/.test(opAm[1]), 'duas culturas/pragas com coleta: o termo deixa escolher a amostra: ' + opAm.join(' | '));
  ok(await A.isChecked('input[name=pce-t-parte][value=folhas]') && !(await A.isChecked('input[name=pce-t-parte][value=frutos]')), 'partes da planta vêm do tipo de material (Folhas)');
  await A.selectOption('#pce-t-amostra', '1');
  ok((await A.inputValue('#pce-t-cultura')) === 'Banana' && await A.isChecked('input[name=pce-t-parte][value=frutos]') && !(await A.isChecked('input[name=pce-t-parte][value=folhas]')), 'escolhida a amostra da Banana (Mosca-negra): cultura e partes (Frutos) acompanham');
  ok(/definido ao gerar/.test(await A.textContent('#pce-t-numero')), 'número só é definido ao gerar');
  await A.fill('#pce-t-quantidade', '3'); await A.fill('#pce-t-analise', 'fitopatológica');
  await A.check('input[name=pce-t-parte][value=folhas]'); await A.check('input[name=pce-t-parte][value=frutos]');
  const desc = await A.inputValue('#pce-t-descricao');
  ok(/^Em \d+ de \w+ de \d{4}, às \d\dh\d\d, o\(a\) servidor\(a\) Pessoa Ficticia Alfa, da Agência de Defesa Agropecuária e Florestal do Estado do Amazonas – ADAF, realizou a coleta de 3 amostra\(s\) de folhas, frutos da cultura de Banana, destinadas à análise fitopatológica\.$/.test(desc), 'texto oficial gerado: ' + desc);
  await A.fill('#pce-t-descricao', desc + ' Texto complementado à mão.'); await A.fill('#pce-t-quantidade', '4');
  ok((await A.inputValue('#pce-t-descricao')).endsWith('à mão.') && (await A.inputValue('#pce-t-descricao')).includes('3 amostra'), 'texto editado à mão não é sobrescrito');
  await A.click('#pce-t-gerartexto'); ok((await A.inputValue('#pce-t-descricao')).includes('4 amostra(s)'), 'botão "Gerar texto oficial" refaz o texto');
  await A.fill('#pce-t-t1nome', 'Carlos Testemunha'); await A.fill('#pce-t-t1doc', '1234567');
  await A.setInputFiles('#pce-t-fotos', [{ name: 'amostra.jpg', mimeType: 'image/jpeg', buffer: await imagem(A, 800, 600, '#a52') }]); await A.waitForSelector('#pce-t-fotos-prev .pce-foto img');
  await assinar(A, '#pce-ass-produtor'); await A.waitForTimeout(600);
  await A.click('#pce-t-gerar'); await A.waitForSelector('#pce-num-m', { timeout: 15000 });
  ok(+(await A.inputValue('#pce-num-m')) === 1 && /Número obtido na planilha agora/.test(await A.textContent('.tf-modal-box')) && /Nenhum Termo de Colheita anterior/.test(await A.textContent('.tf-modal-box')), 'popup: nº 1 da planilha, sem termo anterior');
  ok((await A.textContent('#pce-num-prev')) === `001/${ANO}/MANAUS`, 'prévia do número: ' + await A.textContent('#pce-num-prev'));
  await A.click('#pce-m-ok'); await A.waitForSelector('#pce-pronto', { timeout: 10000 });
  ok((await A.textContent('#pce-pronto-num')) === `001/${ANO}/MANAUS` && /Número confirmado na planilha/.test(await A.textContent('#pce-pronto')), 'termo 001 gerado e confirmado na planilha');
  let cols = await ler('Colheitas'); const c1 = cols.find(c => c.numero === 1);
  ok(cols.length === 1 && c1.numeroOrigem === 'sistema' && c1.usuario === 'Pessoa Ficticia Alfa' && c1.levantamentoId === levs[0].id && c1.emitidoEm > 0 && c1.partes === 'folhas, frutos' && c1.testemunha1Nome === 'Carlos Testemunha', 'planilha já tem o termo (origem sistema, ligado ao levantamento) sem esperar o sync');
  pr = await imprimir(A, '#pce-imprimir');
  ok(pr.paginas === 2 && pr.vias.join('|') === 'Via da ADAF|Via do produtor', 'PDF em 2 vias: ' + pr.vias.join(' | '));
  ok(pr.texto.includes(`001/${ANO}/MANAUS`) && /Termo de Colheita de Amostras/i.test(pr.texto) && pr.texto.includes('JOSÉ DA SILVA') && pr.texto.includes('Banana') && pr.texto.includes('Texto complementado') === false && pr.texto.includes('4 amostra(s)') && pr.texto.includes('Carlos Testemunha'), 'termo: número, produtor, cultura, texto oficial, testemunha');
  ok(pr.imgs === 4 && !pr.cancelado, 'termo: foto e assinatura nas 2 vias (' + pr.imgs + ' imagens), sem faixa de cancelado');
  ok(pr.titulo === `Termo_Colheita_001_${ANO}_MANAUS`, 'nome sugerido do PDF: ' + pr.titulo);
  await sync(A); drive = await get('/__drive');
  ok(drive.arquivos.filter(a => a.caminho.endsWith('/colheitas')).length === 2, 'foto e assinatura do termo enviadas ao Drive (pasta colheitas)');

  console.log('6) segundo aparelho (Bruno): números sequenciais e número ocupado');
  const Bd = await aparelho(fB); await irPCE(Bd); await identificar(Bd, 2);
  await novoTermo(Bd);
  await Bd.fill('#pce-t-doc', '529.982.247-25'); await statusDoc(Bd, 'pce-t-', /Cadastro encontrado/);
  ok((await Bd.inputValue('#pce-t-nome')) === 'JOSÉ DA SILVA' && /1 levantamento\(s\) e 1 termo\(s\)/.test(await Bd.textContent('#pce-t-st-doc')), 'consulta no servidor: cadastro de Ana encontrado, com histórico: ' + (await Bd.textContent('#pce-t-st-doc')).trim().slice(0, 140));
  await Bd.selectOption('#pce-t-cultura', 'Banana'); await Bd.fill('#pce-t-quantidade', '1'); await Bd.check('input[name=pce-t-parte][value=folhas]');
  await Bd.click('#pce-t-gerar'); await Bd.waitForSelector('#pce-num-m', { timeout: 15000 });
  ok(+(await Bd.inputValue('#pce-num-m')) === 2 && new RegExp(`001/${ANO}/MANAUS`).test(await Bd.textContent('.tf-modal-box')) && /Pessoa Ficticia Alfa/.test(await Bd.textContent('.tf-modal-box')), 'popup de Bruno: nº 2 e último usado 001 (Pessoa Ficticia Alfa)');
  const outro = await post({ action: 'pceEmitir', key: fA.token, colheita: { id: 'corrida', unidade: 'MANAUS', ano: ANO, numero: 2, data: '2026-10-10', hora: '10:00', nome: 'FULANO', doc: '11144477735', cultura: 'Milho', quantidade: 1, cancelado: 0, criadoEm: Date.now(), atualizadoEm: Date.now() } });
  ok(outro.emitido === true, 'Ana emitiu o 002 por fora enquanto o popup de Bruno está aberto');
  await Bd.click('#pce-m-ok'); await Bd.waitForFunction(() => /acabou de ser usado/.test(document.querySelector('.tf-modal-box')?.textContent || ''), null, { timeout: 10000 });
  ok(+(await Bd.inputValue('#pce-num-m')) === 3 && /Pessoa Ficticia Alfa/.test(await Bd.textContent('.tf-modal-box')), 'Bruno avisado antes do PDF: 002 já usado; nova sugestão 3');
  await Bd.fill('#pce-num-m', '5'); ok(/Número alterado \(o sistema sugeriu 003\)/.test(await Bd.textContent('#pce-num-edit')), 'edição do número fica registrada');
  await Bd.click('#pce-m-ok'); await Bd.waitForSelector('#pce-pronto', { timeout: 10000 });
  ok((await Bd.textContent('#pce-pronto-num')) === `005/${ANO}/MANAUS` && /alterado manualmente \(o sistema sugeriu 003\)/.test(await Bd.textContent('#pce-pronto')), 'termo 005 gerado, marcado como editado');
  const c5 = (await ler('Colheitas')).find(c => c.numero === 5); ok(c5 && c5.numeroOrigem === 'editado' && c5.numeroSugerido === 3 && c5.usuario === 'Pessoa Ficticia Beta', 'planilha: 005 editado, sugerido 3');
  await Bd.click('[data-v=pcetermos]'); await Bd.waitForSelector('.item.pce-termo'); ok(await Bd.locator('.item.pce-termo').count() === 1, 'lista de Bruno só tem os termos dele');

  console.log('7) Ana sem internet: número provisório e duplicidade apontada ao sincronizar');
  await sync(A); ok((await A.evaluate(() => Store.meta('ultimoVistoPce')))['MANAUS|' + ANO] === 5, 'aparelho de Ana conhece o último nº da unidade (5)');
  await A.ctx.setOffline(true); await A.evaluate(() => window.dispatchEvent(new Event('offline')));
  await novoTermo(A);
  await A.fill('#pce-t-doc', '111.444.777-35'); await statusDoc(A, 'pce-t-', /Novo cadastro/);
  await A.fill('#pce-t-nome', 'Maria Souza'); await A.selectOption('#pce-t-cultura', 'Milho'); await A.fill('#pce-t-quantidade', '2');
  await A.click('#pce-t-gerar'); await A.waitForSelector('#pce-num-m');
  ok(+(await A.inputValue('#pce-num-m')) === 6 && /Sem conexão/.test(await A.textContent('.tf-modal-box')), 'offline: popup propõe 6 (último conhecido 5) como provisório');
  await A.fill('#pce-num-m', '2'); await A.click('#pce-m-ok'); await A.waitForTimeout(400);
  ok(/já gerou o termo nº 002/.test(await A.textContent('.tf-modal-box')), 'o aparelho recusa um número que ele mesmo já usou (002)');
  await A.fill('#pce-num-m', '5'); await A.click('#pce-m-ok'); await A.waitForSelector('#pce-pronto', { timeout: 10000 });
  ok(/provisório/.test(await A.textContent('#pce-pronto')), 'termo 005 gerado offline com aviso de número provisório');
  pr = await imprimir(A, '#pce-imprimir'); ok(pr.paginas === 2 && pr.texto.includes(`005/${ANO}/MANAUS`) && pr.texto.includes('MARIA SOUZA'), 'impressão funciona sem internet');
  await A.click('nav [data-v=pcetermos]'); await A.waitForSelector('.item.pce-termo');
  ok(/número provisório/.test(await A.textContent('#pceTItens')), 'lista: termo com número provisório pendente');
  ok((await pendentes(A)) >= 2, 'termo e cadastro novos pendentes: ' + await pendentes(A));
  await A.ctx.setOffline(false); await A.evaluate(() => window.dispatchEvent(new Event('online'))); await sync(A);
  await A.click('nav [data-v=pcetermos]'); await A.waitForSelector('.item.pce-termo');
  ok(/Número duplicado/.test(await A.textContent('#pceTItens')) && !/provisório/.test(await A.textContent('#pceTItens')), 'após sincronizar, o 005 repetido aparece com aviso de duplicidade');
  const au = (await get('/__fn?nome=auditarSequencia_&args=' + encodeURIComponent(JSON.stringify(['MANAUS', ANO, 'PCE'])))).r;
  ok(au.duplicados.some(d => d.numero === 5) && JSON.stringify(au.lacunas) === '[3,4]' && au.editados.some(e => e.origem === 'provisorio'), 'auditoria PCE: duplicado 5, lacunas ' + JSON.stringify(au.lacunas));
  ok((await ler('Pessoas')).some(p => p.id === '11144477735' && p.nome === 'MARIA SOUZA'), 'cadastro novo do produtor sincronizado');

  console.log('8) cancelar termo (mantém o número)');
  const nAntes = await A.locator('.item.pce-termo').count();
  await A.locator('.item.pce-termo').filter({ hasText: `001/${ANO}/MANAUS` }).locator('[data-pce=cancelartermo]').click();
  await A.waitForFunction(() => /CANCELADO: digitação errada/.test(document.querySelector('#pceTItens').textContent));
  ok(await A.locator('.item.pce-termo').count() === nAntes && await A.locator('.item.pce-termo').filter({ hasText: `001/${ANO}/MANAUS` }).locator('[data-pce=cancelartermo]').count() === 0, 'termo 001 cancelado continua na lista, sem botão de cancelar');
  await sync(A);
  const c1b = (await ler('Colheitas')).find(c => c.numero === 1); ok(c1b.cancelado === 1 && c1b.motivoCancel === 'digitação errada' && c1b.emitidoEm === c1.emitidoEm, 'planilha: cancelado com motivo; emitidoEm mantido');
  ok((await post({ action: 'pceProximoNumero', key: fA.token, unidade: 'MANAUS', ano: ANO })).proximo === 6, 'próximo número continua 6 (cancelado não libera o número)');
  pr = await imprimir(A, `.item.pce-termo:has-text("001/${ANO}/MANAUS") [data-pce=imprimirtermo]`);
  ok(pr.cancelado && /TERMO CANCELADO – digitação errada/.test(pr.texto) && pr.paginas === 2, 'PDF do cancelado com faixa CANCELADO nas 2 vias');

  console.log('9) rascunhos automáticos');
  await A.click('nav [data-v=pcelev]'); await A.waitForSelector('#pceLevForm');
  await A.fill('#pce-doc', '12345678909'); await A.fill('#pce-nome', 'RASCUNHO PCE');   // os dados do produtor abrem depois do CPF/CNPJ
  await F.cultura(A, 0, 'Milho'); await F.responder(A, 0, 'Amaranthus palmeri', 'suspeita');   // Milho não tem praga ligada no catálogo: a somada em "+ Outra praga/doença"
  await A.setInputFiles(CU(0) + ' >> .c-fotos', [{ name: 'r.jpg', mimeType: 'image/jpeg', buffer: await imagem(A, 300, 200, '#33c') }]); await A.waitForSelector(CU(0) + ' >> .pce-foto img');
  await A.waitForTimeout(900);
  ok((await pendentes(A)) === 0, 'foto de rascunho não conta como pendente');
  await A.click('nav [data-v=pce]'); await A.waitForSelector('#pce-novolev'); await A.click('#pce-novolev'); await A.waitForSelector('#pceLevForm');
  await A.waitForSelector(CU(0) + ' >> .pce-foto img');
  ok((await A.inputValue('#pce-nome')) === 'RASCUNHO PCE' && (await A.inputValue(CU(0) + ' >> .c-cultura')) === 'Milho' && (await A.inputValue(OUTRA(0) + ' >> .r-praga')) === 'amaranthus-palmeri'
    && await A.locator(OUTRA(0) + ' >> .r-res:checked').getAttribute('value') === 'suspeita' && await A.locator(CU(0) + ' >> .pce-foto img').count() === 1, 'rascunho do levantamento restaurado (nome, cultura, praga somada, resultado e foto da cultura)');
  let nArq = await A.evaluate(async () => (await Store.todos('arquivos')).length);
  await A.click('[data-pce=descartarlev]'); await A.waitForSelector('#pce-novolev');
  ok((await A.evaluate(async () => (await Store.todos('arquivos')).length)) === nArq - 1 && !(await A.evaluate(() => Store.meta('pceLevRascunho'))), 'descartar apaga o rascunho e a foto que só existia nele');
  // rascunho da versão anterior do app (culturas com praga + fotos do levantamento inteiro): abre convertido em cards
  await A.evaluate(async () => {
    const t = Date.now(), c = document.createElement('canvas'); c.width = c.height = 24; const jpg = c.toDataURL('image/jpeg');
    await Store.gravar('arquivos', { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', dono: 'levantamentos', donoId: 'rasc-velho', tipo: 'foto', papel: '', mime: 'image/jpeg', dados: jpg, tamanho: 10, criadoEm: t, enviado: 0, url: '', driveId: '' });
    await Store.setMeta('pceLevRascunho', { dados: { doc: '', nome: 'RASCUNHO VELHO', telefone: '', email: '', propriedade: '', codigoPropriedade: '', situacaoFundiaria: '', municipio: 'Manaus', lat: '', lon: '', precisao: '', data: '2026-10-01', hora: '08:00', obs: '',
      culturas: [{ cultura: 'Banana', area: '1', espLinha: '', espPlanta: '', praga: 'Moko da bananeira', coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '' }, { cultura: 'Mandioca', area: '2', espLinha: '', espPlanta: '', praga: '', coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '' }] },
      id: 'rasc-velho', novo: true, fotos: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], docs: [], antigo: 0, ass: {}, assNovas: {}, em: t });
  });
  await A.click('nav [data-v=pce]'); await A.waitForSelector('#pce-novolev'); await A.click('#pce-novolev'); await A.waitForSelector('#pceLevForm'); await A.waitForSelector('#pce-fotos-gerais .pce-foto img');
  ok((await A.inputValue('#pce-nome')) === 'RASCUNHO VELHO' && await A.locator('.pce-cultura').count() === 2 && (await A.inputValue(CU(0) + ' >> .c-cultura')) === 'Banana' && (await A.inputValue(CU(1) + ' >> .c-cultura')) === 'Mandioca'
    && await A.locator(CU(0) + ' >> .pce-pr[data-ligada="1"][data-nome*="Moko"] >> .r-res:checked').getAttribute('value') === 'detectada', 'rascunho antigo: culturas com praga viram cards por cultura (a praga do catálogo, Moko, com resultado detectada)');
  ok(await A.locator(CU(1) + ' >> .pce-pr[data-legado="1"] >> .r-res:checked').getAttribute('value') === 'nao_detectada' && /Sem praga informada \(registro anterior\)/.test(await A.textContent(CU(1) + ' >> .pce-pr[data-legado="1"] >> .r-praga option >> nth=0'))
    && await A.locator(CU(1) + ' >> .pce-pr[data-ligada="1"][data-nome*="Vassoura"] >> .r-res:checked').count() === 0,
    'rascunho antigo: cultura sem praga vira "Sem praga informada" (não detectada) e ganha a praga do catálogo (Vassoura-de-bruxa), ainda sem resultado');
  ok(await A.locator('#pce-gerais-card .pce-foto img').count() === 1 && /Fotos gerais \(registro anterior\)/.test(await A.textContent('#pce-gerais-card')), 'rascunho antigo: fotos do levantamento inteiro em "Fotos gerais (registro anterior)"');
  nArq = await A.evaluate(async () => (await Store.todos('arquivos')).length);
  await A.click('[data-pce=descartarlev]'); await A.waitForSelector('#pce-novolev');
  ok((await A.evaluate(async () => (await Store.todos('arquivos')).length)) === nArq - 1, 'descartar o rascunho antigo apaga a foto dele');
  await novoTermo(A); await A.fill('#pce-t-nome', 'TERMO RASCUNHO'); await A.waitForTimeout(800);
  await A.click('nav [data-v=pce]'); await A.waitForSelector('#pce-novolev'); await novoTermo(A);
  ok((await A.inputValue('#pce-t-nome')) === 'TERMO RASCUNHO', 'rascunho do termo restaurado');
  await A.click('[data-pce=descartartermo]'); await A.waitForSelector('#pce-novotermo');

  console.log('10) editar levantamento, "Meus dados" e excluir');
  await A.click('nav [data-v=pce]'); await A.waitForSelector('.item.pce-lev'); await A.click('[data-pce=abrirlev]'); await A.waitForSelector('#pceLevForm'); await A.waitForSelector(CU(1) + ' >> .pce-foto img');
  ok((await A.inputValue('#pce-nome')) === 'JOSÉ DA SILVA' && await A.locator('.pce-cultura').count() === 2 && (await A.inputValue(CU(0) + ' >> .c-cultura')) === 'Cacau' && (await A.inputValue(CU(1) + ' >> .c-cultura')) === 'Banana'
    && await A.locator(CU(0) + ' >> .pce-foto img').count() === 1 && await A.locator(CU(1) + ' >> .pce-foto img').count() === 1 && (await A.inputValue(OUTRA(1) + ' >> .r-praga')) === '__outra' && (await A.inputValue(OUTRA(1) + ' >> .r-outra')) === 'Mosca-negra-dos-citros'
    && await A.locator(PRG(1, 'Fusarium R4T') + ' >> .r-res:checked').getAttribute('value') === 'detectada' && await A.locator('#pce-gerais-card').count() === 0,
    'levantamento reaberto: cards de cultura com as pragas do catálogo, a somada ("Outra" com o nome), resultados e fotos de cada cultura');
  await A.click(CU(1) + ' >> [data-pce=delfoto]'); await A.fill('#pce-obs', 'Observação revisada.'); await A.click('#pce-salvar'); await A.waitForSelector('#pce-lev-pronto');
  await A.click('#pce-pronto-lista'); await A.waitForSelector('.item.pce-lev');
  ok(/1 foto\(s\)/.test(await A.textContent('#pceItens')), 'foto da Banana removida do registro; a do Cacau fica');
  ok((await A.evaluate(async () => (await Store.todos('arquivos')).filter(a => a.dono === 'levantamentos').length)) === 3, 'foto já enviada fica no aparelho/Drive (auditoria): só sai do registro');
  await sync(A); const lv = (await ler('Levantamentos'))[0];
  ok(lv.obs === 'Observação revisada.' && JSON.parse(lv.fotos).length === 1 && JSON.parse(lv.pragas)[0].culturas[0].fotos.length === 1 && JSON.parse(lv.pragas)[1].culturas[0].fotos.length === 0 && JSON.parse(lv.pragas)[2].culturas[0].fotos.length === 0, 'edição sincronizada (fotos por cultura: Cacau com 1; Banana sem)');
  await A.click('#pce-meusdados'); await A.waitForSelector('#pceServForm'); await A.selectOption('#pce-s-lotacao', 'Parintins'); await A.click('#pce-s-salvar'); await A.waitForSelector('#pce-novolev');
  ok(/Parintins/.test(await A.textContent('.pce-serv')), '"Meus dados" altera a lotação');
  await novoTermo(A); ok((await A.inputValue('#pce-t-unidade')) === 'Parintins', 'novo termo usa a nova lotação como unidade'); await A.click('[data-pce=descartartermo]'); await A.waitForSelector('#pce-novotermo');
  await A.click('nav [data-v=pce]'); await A.waitForSelector('.item.pce-lev'); await A.click('[data-pce=excluirlev]'); await A.waitForSelector('#pceItens .vazio');
  await sync(A); ok((await ler('Levantamentos'))[0].excluido === 1, 'levantamento excluído (soft delete) na planilha');

  console.log('11) hub e erros');
  await A.click('nav [data-v=modulos]'); await A.waitForSelector('.modulo[data-v=pce]');
  ok(/0 levantamento\(s\) · 3 termo\(s\)$/.test(await A.textContent('.modulo[data-v=pce] .pce-status')), 'status do hub: ' + await A.textContent('.modulo[data-v=pce] .pce-status'));
  ok(![A, Bd].some(p => p.err.length), 'sem erros de console/página: ' + JSON.stringify([...A.err, ...Bd.err]));

  console.log('12) achados da revisão');
  const fC = await credencial('Pessoa Ficticia Gama'), Cd = await aparelho(fC); Cd.msgs = []; Cd.on('dialog', d => Cd.msgs.push(d.message()));
  await irPCE(Cd); await identificar(Cd);
  // ids sempre UUID v4, mesmo sem crypto.randomUUID (o servidor recusa arquivos com outro formato)
  const idSem = await Cd.evaluate(() => { Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }); const id = Store.novoId(); delete crypto.randomUUID; return id; });
  ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(idSem), 'sem crypto.randomUUID: id ainda é UUID v4 (' + idSem + ')');
  // um arquivo recusado pelo servidor não trava a fila dos outros
  await Cd.evaluate(async () => {
    const t = Date.now(), base = { dono: 'levantamentos', donoId: 'gFila', tipo: 'foto', papel: '', tamanho: 10, criadoEm: t, enviado: 0, url: '', driveId: '' };
    const c = document.createElement('canvas'); c.width = c.height = 8; const jpg = c.toDataURL('image/jpeg');
    await Store.gravar('arquivos', { ...base, id: '00000000-0000-4000-8000-000000000000', mime: 'image/gif', dados: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
    await Store.gravar('arquivos', { ...base, id: 'ffffffff-ffff-4fff-bfff-ffffffffffff', mime: 'image/jpeg', dados: jpg });
    await Store.salvar('levantamentos', { id: 'gFila', data: '2026-10-10', hora: '10:00', doc: '52998224725', nome: 'FILA', municipio: 'Manaus', culturas: '[{"cultura":"Banana"}]',
      fotos: JSON.stringify(['00000000-0000-4000-8000-000000000000', 'ffffffff-ffff-4fff-bfff-ffffffffffff']), assinaturas: '{}', excluido: 0 });
  });
  for (let i = 0; i < 3; i++) { await Cd.evaluate(() => Sync.sincronizar()); await Cd.waitForFunction(() => Sync.estado().tipo !== 'sync', null, { timeout: 15000 }); }
  const fila = await Cd.evaluate(async () => ({ ruim: (await Store.obter('arquivos', '00000000-0000-4000-8000-000000000000')).enviado, bom: (await Store.obter('arquivos', 'ffffffff-ffff-4fff-bfff-ffffffffffff')).enviado, est: Sync.estado() }));
  ok(fila.bom === 1 && fila.ruim === 0 && /JPEG, PNG ou PDF/.test(fila.est.msg), 'arquivo recusado (gif) fica pendente, mas o de trás é enviado; aviso: ' + fila.est.msg);
  ok((await ler('Levantamentos')).some(l => l.id === 'gFila'), 'o levantamento em si foi sincronizado');
  await Cd.evaluate(() => Store.apagar('arquivos', ['00000000-0000-4000-8000-000000000000']));
  // levantamento: data/hora obrigatórias; propriedade com nome longo (id <= 64); acessibilidade
  await Cd.click('nav [data-v=pcelev]'); await Cd.waitForSelector('#pceLevForm');
  ok((await Cd.getAttribute('#pce-obs', 'aria-label')) === 'Observações', 'campo de observações com nome acessível');
  await Cd.fill('#pce-doc', '11.222.333/0001-81'); await statusDoc(Cd, 'pce-', /Novo cadastro/);
  await Cd.fill('#pce-nome', 'Agro Longo Ltda'); await Cd.fill('#pce-propriedade', 'Sítio Nossa Senhora Aparecida do Rio Preto da Eva km 32 ramal do Pau Rosa');
  await F.cultura(Cd, 0, 'Coco'); await F.responder(Cd, 0, 'Mosca-negra-dos-citros', 'nao_detectada');
  ok(await Cd.getAttribute(CU(0) + ' >> .c-area', 'maxlength') === '60' && await Cd.getAttribute(OUTRA(0) + ' >> .r-outra', 'maxlength') === '80', 'campos livres das culturas e da praga com tamanho máximo');
  for (const k of ['hlb', 'acaro', 'cancro']) await Cd.click(`#pce-citros label:has(input[name="pce-ci-det-${k}-tem"][value="nao"])`);   // praga de citros: detecção obrigatória
  await Cd.fill('#pce-data', ''); await Cd.click('#pce-salvar'); await Cd.waitForTimeout(300);
  ok(/Informe a data/.test(await Cd.textContent('#toast')) && await Cd.locator('#pceLevForm').count() === 1, 'levantamento sem data não é salvo');
  await Cd.fill('#pce-data', '2026-10-09');
  // assinatura: girar o celular (canvas mais largo) e dois dedos
  await Cd.setViewportSize({ width: 820, height: 900 }); await Cd.waitForTimeout(200);
  const px = await Cd.evaluate(() => {
    const cv = document.querySelector('#pce-ass-produtor'), r = cv.getBoundingClientRect(), ev = (t, id, fx, fy) => cv.dispatchEvent(new PointerEvent(t, { pointerId: id, bubbles: true, cancelable: true, clientX: r.left + fx * r.width, clientY: r.top + fy * r.height }));
    ev('pointerdown', 1, 0.5, 0.5); ev('pointermove', 1, 0.52, 0.5); ev('pointerup', 1, 0.52, 0.5);
    const tinta = (fx, fy) => { const d = cv.getContext('2d').getImageData(Math.round(fx * cv.width) - 3, Math.round(fy * cv.height) - 3, 6, 6).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; };
    const meio = tinta(0.51, 0.5);
    const cv2 = document.querySelector('#pce-ass-servidor'), r2 = cv2.getBoundingClientRect(), ev2 = (t, id, fx, fy) => cv2.dispatchEvent(new PointerEvent(t, { pointerId: id, bubbles: true, cancelable: true, clientX: r2.left + fx * r2.width, clientY: r2.top + fy * r2.height }));
    ev2('pointerdown', 1, 0.05, 0.1); ev2('pointerdown', 2, 0.9, 0.9); ev2('pointermove', 2, 0.92, 0.9); ev2('pointermove', 1, 0.07, 0.12); ev2('pointerup', 2, 0.92, 0.9); ev2('pointerup', 1, 0.07, 0.12);
    const d2 = (fx, fy) => { const d = cv2.getContext('2d').getImageData(Math.round(fx * cv2.width) - 3, Math.round(fy * cv2.height) - 3, 6, 6).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; };
    return { meio, zigue: d2(0.5, 0.5) };
  });
  await Cd.setViewportSize({ width: 400, height: 900 });
  ok(px.meio, 'depois de girar o celular, o traço sai embaixo do dedo (meio do quadro)');
  ok(!px.zigue, 'segundo dedo/palma não desenha linha atravessando o quadro');
  await Cd.click('#pce-salvar'); await Cd.waitForSelector('#pce-lev-pronto');
  ok(await Cd.locator('[data-pce=imprimirlev]').count() === 1 && await Cd.locator('[data-pce=imprimirtodos]').count() === 0 && await Cd.locator('#pce-pronto-termo').count() === 0, 'uma praga só: um PDF, sem "Imprimir todos"; sem coleta, sem atalho do termo');
  // registro da versão anterior (sem "pragas"): lista, PDFs por praga e edição no formulário novo
  await Cd.evaluate(async () => {
    const t = Date.now(), c = document.createElement('canvas'); c.width = 40; c.height = 30; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 40, 30); const jpg = c.toDataURL('image/jpeg');
    await Store.gravar('arquivos', { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', dono: 'levantamentos', donoId: 'lev-velho', tipo: 'foto', papel: '', mime: 'image/jpeg', dados: jpg, tamanho: 10, criadoEm: t, enviado: 1, url: 'https://drive.google.com/x', driveId: 'x' });
    await Store.gravar('levantamentos', { id: 'lev-velho', data: '2026-09-20', hora: '10:00', servidor: 'Pessoa Ficticia Gama', cargo: 'Fiscal', matricula: '', lotacao: 'Manaus', doc: '52998224725', nome: 'PRODUTOR VELHO', telefone: '', email: '',
      propriedade: 'Sítio Antigo', codigoPropriedade: '', situacaoFundiaria: '', municipio: 'Manaus', lat: -3.1, lon: -60, precisao: '',
      culturas: JSON.stringify([{ cultura: 'Banana', area: '2', espLinha: '3', espPlanta: '2', praga: 'Moko da bananeira', coleta: 'Sim', tipoMaterial: 'Folha', codigoAmostra: 'V-1', destinoAmostra: 'LAB' },
        { cultura: 'Mandioca', area: '1', espLinha: '', espPlanta: '', praga: '', coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '' }]),
      fotos: JSON.stringify(['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']), assinaturas: '{}', obs: '', excluido: 0, criadoEm: t, atualizadoEm: t, pendente: 0 });
  });
  await Cd.click('#pce-pronto-lista'); await Cd.waitForSelector('.item.pce-lev[data-lev="lev-velho"]');
  const itV = '.item.pce-lev[data-lev="lev-velho"]';
  ok((await Cd.locator(itV + ' [data-pce=imprimirlev]').allTextContents()).join('|') === 'PDF: Pragas da Bananeira|PDF: Sem praga informada' && await Cd.locator(itV + ' [data-pce=imprimirtodos]').count() === 1,
    'registro anterior na lista: um PDF por programa (o Moko cai em Pragas da Bananeira; cultura sem praga = "Sem praga informada")');
  let prV = await imprimir(Cd, itV + ' [data-pce=imprimirlev][data-g="0"]');
  ok(/PROGRAMA Pragas da Bananeira/.test(prV.texto) && prV.texto.includes('V-1') && /Detectada/.test(prV.texto) && !prV.texto.includes('Mandioca') && /Fotos gerais \(registro anterior\)/.test(prV.texto) && prV.imgs === 1,
    'registro anterior: PDF do programa com a cultura dele e as fotos gerais');
  prV = await imprimir(Cd, itV + ' [data-pce=imprimirlev][data-g="1"]');
  ok(/PROGRAMA Sem praga informada/.test(prV.texto) && prV.texto.includes('Mandioca') && /Não detectada/.test(prV.texto) && !prV.texto.includes('V-1') && prV.imgs === 1 && /_Sem_praga_informada_20-09-2026$/.test(prV.titulo),
    'registro anterior: PDF "Sem praga informada" (não detectada) também traz as fotos gerais: ' + prV.titulo);
  await Cd.click(itV + ' [data-pce=abrirlev]'); await Cd.waitForSelector('#pceLevForm'); await Cd.waitForSelector('#pce-fotos-gerais .pce-foto img');
  ok(await Cd.locator('.pce-cultura').count() === 2 && (await Cd.inputValue(CU(0) + ' >> .c-cultura')) === 'Banana' && (await Cd.inputValue(CU(0) + ' >> .pce-pr[data-ligada="1"][data-nome*="Moko"] >> .r-codigoAmostra')) === 'V-1'
    && (await Cd.inputValue(CU(1) + ' >> .c-cultura')) === 'Mandioca' && await Cd.locator(CU(1) + ' >> .pce-pr[data-legado="1"] >> .r-res:checked').getAttribute('value') === 'nao_detectada', 'registro anterior aberto no formulário novo (cards por cultura; "Sem praga informada" mantida)');
  await F.responderObrigatorias(Cd, 1);                                // a praga do catálogo da Mandioca (Vassoura-de-bruxa) agora exige resultado
  await Cd.click('#pce-salvar'); await Cd.waitForSelector('#pce-lev-pronto');
  const velho = await Cd.evaluate(async () => await Store.obter('levantamentos', 'lev-velho'));
  ok((n => n.length === 3 && n.some(x => /Moko/i.test(x)) && n.some(x => /Vassoura/.test(x)) && n.includes(''))(JSON.parse(velho.pragas).map(g => g.praga)) && JSON.parse(velho.fotos).join() === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' && JSON.parse(velho.culturas).length === 3,
    'salvo de novo: ganha "pragas" (Moko, a Vassoura-de-bruxa do catálogo e a "Sem praga informada"), culturas derivadas por cultura × praga e mantém as fotos gerais em "fotos"');
  await Cd.click('#pce-pronto-lista'); await Cd.waitForSelector('.item.pce-lev');
  const propL = await Cd.evaluate(async () => (await Store.todos('propriedades')).map(p => p.id).filter(id => id.startsWith('11222333000181')));
  ok(propL.length === 1 && propL[0].length <= 64 && propL[0].startsWith('11222333000181|SITIO NOSSA'), 'id da propriedade limitado a 64 caracteres: ' + propL[0]);
  await sync(Cd); ok((await ler('Propriedades')).some(p => p.id === propL[0]), 'propriedade de nome longo chegou à planilha');
  // rascunho de termo de OUTRO levantamento: pergunta explícita, e abre o selecionado
  await novoTermo(Cd); await Cd.fill('#pce-t-nome', 'RASCUNHO DE OUTRO'); await Cd.waitForTimeout(800);
  await Cd.click('nav [data-v=pce]'); await Cd.waitForSelector('.item.pce-lev'); Cd.msgs = [];
  await Cd.locator('.item.pce-lev').filter({ hasText: 'AGRO LONGO' }).locator('[data-pce=termodelev]').click(); await Cd.waitForSelector('#pceTermoForm');
  ok(/outro levantamento/.test(Cd.msgs.join(' ')) && (await Cd.inputValue('#pce-t-nome')) === 'AGRO LONGO LTDA', 'rascunho de outro levantamento: aviso explícito e abre o termo do levantamento escolhido');
  ok(await Cd.locator('fieldset legend', { hasText: 'Partes da planta coletadas' }).count() === 1, 'partes da planta agrupadas (fieldset/legend)');
  // dado de outro usuário no popup não vira HTML; termo sem hora não é gerado; sem segundo fluxo de numeração
  await post({ action: 'sync', key: fB.token, since: 0, colheitas: [{ id: 'xss', unidade: 'MANAUS', ano: ANO, numero: 50, numeroTxt: `050/${ANO}/MANAUS`, data: '<img src=x onerror="window.__xss=1">', hora: '10:00',
    nome: 'X', doc: '11144477735', cultura: 'Milho', quantidade: 1, cancelado: 0, excluido: 0, criadoEm: Date.now(), atualizadoEm: Date.now() }] });
  await Cd.fill('#pce-t-quantidade', '1'); await Cd.fill('#pce-t-hora', ''); await Cd.click('#pce-t-gerar'); await Cd.waitForTimeout(300);
  ok(/Informe a hora/.test(await Cd.textContent('#toast')) && await Cd.locator('#pce-modal').count() === 0, 'termo sem hora não é gerado');
  await Cd.fill('#pce-t-hora', '11:00'); await Cd.click('#pce-t-gerar'); await Cd.waitForSelector('#pce-num-m', { timeout: 15000 });
  ok(+(await Cd.inputValue('#pce-num-m')) === 51 && (await Cd.textContent('.tf-modal-box')).includes('<img src=x') && !(await Cd.evaluate(() => window.__xss)) && await Cd.locator('.tf-modal-box img').count() === 0, 'data vinda da planilha aparece como texto no popup (sem HTML/script)');
  ok(await Cd.isDisabled('#pce-t-gerar'), 'botão "Gerar" fica desabilitado enquanto o número está sendo definido');
  await Cd.evaluate(() => document.querySelector('#pceTermoForm').requestSubmit()); await Cd.waitForTimeout(400);
  ok(await Cd.locator('#pce-modal').count() === 1, 'segundo envio do formulário não abre outra numeração');
  await Cd.click('#pce-m-ok'); await Cd.waitForSelector('#pce-pronto', { timeout: 10000 });
  ok((await Cd.textContent('#pce-pronto-num')) === `051/${ANO}/MANAUS` && (await ler('Colheitas')).filter(c => c.numero === 51).length === 1, 'termo 051 gerado uma única vez');
  ok(!Cd.err.length, 'sem erros de console/página (aparelho 3): ' + JSON.stringify(Cd.err));
  // migração do banco local com outra janela aberta na versão antiga (v2): avisa em vez de travar calado
  const ctxM = await b.newContext({ viewport: { width: 400, height: 900 } });
  const velha = await ctxM.newPage(); await velha.goto(APP + 'manifest.webmanifest').catch(() => {});
  await velha.evaluate(() => new Promise(ok => { const rq = indexedDB.open('gdv', 2); rq.onupgradeneeded = () => rq.result.createObjectStore('meta', { keyPath: 'k' }); rq.onsuccess = () => { window.__velha = rq.result; ok(); }; }));
  const nova = await ctxM.newPage(); await nova.goto(APP);
  await nova.waitForSelector('#gdv-aviso-db', { timeout: 8000 });
  ok(/Feche as outras janelas/.test(await nova.textContent('#gdv-aviso-db')), 'outra janela com o banco antigo: aviso "Feche as outras janelas…"');
  await velha.evaluate(() => window.__velha.close());
  await nova.waitForSelector('#gdv-aviso-db', { state: 'detached', timeout: 8000 }); await nova.waitForSelector('#view *', { state: 'attached' });
  ok(true, 'fechada a janela antiga, a atualização conclui e o aviso some');
  await velha.evaluate(() => new Promise(ok => { const rq = indexedDB.open('gdv', 6); rq.onupgradeneeded = () => {}; rq.onsuccess = () => { rq.result.close(); ok(); }; rq.onblocked = () => {}; }));
  await nova.waitForSelector('#gdv-aviso-db', { timeout: 8000 });
  ok(/atualizado em outra janela/.test(await nova.textContent('#gdv-aviso-db')), 'versão mais nova em outra janela: esta libera o banco (sem travar a outra) e pede para recarregar');
  await ctxM.close();
  console.log('OK'); await b.close();
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
