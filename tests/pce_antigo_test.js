const amb = require('./lib/amb');
// PCE — modo "Registro antigo (digitação do papel)": app real (Chromium) + Code.gs real (fakegas, Drive falso).
const { chromium } = require('playwright-core');
const { API, APP } = amb;
const DIR = amb.SAIDA + '/';
const get = p => fetch(API + p).then(r => r.json());
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const ler = async aba => (await get('/__fn?nome=lerLeitura_&args=' + encodeURIComponent(JSON.stringify([aba])))).r;
let falhas = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const ANO = new Date().getFullYear();
const pad = n => String(n).padStart(2, '0');
const hojeL = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const amanha = () => { const d = new Date(Date.now() + 86400e3); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const pdfBuf = (kb = 40, marca = 'teste') => { const cab = `%PDF-1.4\n% ${marca}\n1 0 obj << /Type /Catalog >> endobj\n`, fim = '\ntrailer << /Root 1 0 R >>\n%%EOF\n';
  return Buffer.concat([Buffer.from(cab), Buffer.alloc(Math.max(0, kb * 1024 - cab.length - fim.length), 0x20), Buffer.from(fim)]); };
const uuid = () => require('crypto').randomUUID();

(async () => {
  const b = await amb.lancar();
  const gerar = async (nome, perfil = '') => get('/__gerar?nome=' + encodeURIComponent(nome) + '&perfil=' + perfil);
  const credencial = async nome => { const g = await gerar(nome); const r = await post({ action: 'ativar', codigo: g.codigo }); return { token: r.token, nome }; };
  const aparelho = async ({ token, nome }, vp = { width: 1366, height: 768 }) => {
    const c = await b.newContext({ viewport: vp, permissions: ['geolocation'], geolocation: { latitude: -3.5, longitude: -59.5, accuracy: 9 } });
    await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [token, nome]);
    await c.addInitScript(() => { if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' '), html: d.body.innerHTML }); }; });
    const p = await c.newPage(); p.err = []; p.dialogs = [];
    p.on('pageerror', e => p.err.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && p.err.push(m.text()));
    p.on('dialog', d => { p.dialogs.push(d.message()); d.accept(); }); p.ctx = c;
    await p.goto(APP); await p.waitForSelector('#view *', { state: 'attached' }); await p.waitForTimeout(700); return p;
  };
  const pendentes = p => p.evaluate(async () => { const n = ['turnos', 'veiculos', 'tfs', 'pessoas', 'placas', 'levantamentos', 'colheitas', 'propriedades'];
    let t = 0; for (const s of n) t += (await Store.todos(s)).filter(x => x.pendente).length; return t + (await Sync.arquivosPendentes()).length; });
  const sync = async p => { for (let i = 0; i < 30; i++) { await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(400); if ((await pendentes(p)) === 0 && await p.evaluate(() => Sync.estado().tipo === 'ok')) return; } throw new Error('sync não terminou'); };
  const imprimir = async (p, sel) => { await p.evaluate(() => { window.__prints = []; }); await p.locator(sel).first().click(); await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 10000 }); return p.evaluate(() => window.__prints[0]); };
  const toast = p => p.textContent('#toast');

  /* ================= 1. parser de coordenadas e do nº do papel ================= */
  console.log('1) parser de coordenadas (graus decimais e GMS)');
  const F = await credencial('Fiscal Ana Paula Lima');
  const P0 = await aparelho(F);
  const casos = await P0.evaluate(() => {
    const L = PCEUI.lerCoordenadas, t = {};
    ['-3.1190, -60.0217', '-3,1190 -60,0217', '-3,1190, -60,0217', '-3.1190;-60.0217', ' -3.1190 , -60.0217 ', 'Lat: -3.1190  Long: -60.0217', '3.1190 S 60.0217 W', '−3.1190, −60.0217',
     `3°07'08,4"S 60°01'18,1"W`, `3º 07' 08.4'' S, 60º 01' 18.1'' W`, `03°07′08.4″S 060°01′18.1″O`, `S 3°07'08,4" W 60°01'18,1"`, '3 07 08.4 S 60 01 18.1 W',
     `-3°07'08.4" -60°01'18.1"`, `60°01'18,1"W 3°07'08,4"S`, `3°07,14'S 60°01,3'O`, `3° 7' 8,4" sul 60° 1' 18,1" oeste`, `3°07'08,4" S / 60°01'18,1" W`,
     'abc', '-3.1190', `3°75'00"S 60°01'18"W`, `3°07'08"S 4°01'18"S`, '-60.0217, -3.1190', '-3.1190, 60.0217', '-15.79, -47.88', '', '1 2 3', `3°07'08"N 60°01'18"X`, `-3°07'08"N 60°01'18"W`
    ].forEach(s => { t[s] = L(s); });
    return t;
  });
  const perto = (r, la, lo, tol = 2e-6) => r && !r.erro && Math.abs(r.lat - la) < tol && Math.abs(r.lon - lo) < tol;
  const GLA = -(3 + 7 / 60 + 8.4 / 3600), GLO = -(60 + 1 / 60 + 18.1 / 3600);
  for (const s of ['-3.1190, -60.0217', '-3,1190 -60,0217', '-3,1190, -60,0217', '-3.1190;-60.0217', ' -3.1190 , -60.0217 ', 'Lat: -3.1190  Long: -60.0217', '3.1190 S 60.0217 W', '−3.1190, −60.0217'])
    ok(perto(casos[s], -3.119, -60.0217), `decimal "${s}" → ${JSON.stringify(casos[s])}`);
  for (const s of [`3°07'08,4"S 60°01'18,1"W`, `3º 07' 08.4'' S, 60º 01' 18.1'' W`, `03°07′08.4″S 060°01′18.1″O`, `S 3°07'08,4" W 60°01'18,1"`, '3 07 08.4 S 60 01 18.1 W',
    `-3°07'08.4" -60°01'18.1"`, `60°01'18,1"W 3°07'08,4"S`, `3° 7' 8,4" sul 60° 1' 18,1" oeste`, `3°07'08,4" S / 60°01'18,1" W`])
    ok(perto(casos[s], GLA, GLO, 1e-6), `GMS "${s}" → ${JSON.stringify(casos[s])}`);
  ok(perto(casos[`3°07,14'S 60°01,3'O`], -(3 + 7.14 / 60), -(60 + 1.3 / 60), 1e-6), 'graus e minutos decimais (3°07,14\'S 60°01,3\'O) → ' + JSON.stringify(casos[`3°07,14'S 60°01,3'O`]));
  for (const s of ['abc', '-3.1190', `3°75'00"S 60°01'18"W`, `3°07'08"S 4°01'18"S`, '1 2 3', `3°07'08"N 60°01'18"X`, `-3°07'08"N 60°01'18"W`]) ok(casos[s] && casos[s].erro, `inválido "${s}": ${casos[s] && casos[s].erro}`);
  ok(/trocadas/.test(casos['-60.0217, -3.1190'].erro), 'lat/lon trocadas: ' + casos['-60.0217, -3.1190'].erro);
  ok(/fora do Amazonas/.test(casos['-3.1190, 60.0217'].erro) && /Oeste/.test(casos['-3.1190, 60.0217'].erro), 'longitude positiva: ' + casos['-3.1190, 60.0217'].erro);
  ok(/fora do Amazonas/.test(casos['-15.79, -47.88'].erro), 'Brasília fora do AM: ' + casos['-15.79, -47.88'].erro);
  ok(casos[''].vazio === true, 'vazio = sem coordenada (opcional)');
  const nums = await P0.evaluate(a => { const N = PCEUI.lerNumeroPapel; return {
    a: N(`007/${a}/MANAUS`, 'Manaus', `${a}-03-01`), b: N('7', 'Manaus', `${a}-03-01`), c: N(`Nº 12/${a}/Manaus`, 'Manaus', `${a}-03-01`), d: N(`007/${a - 1}/MANAUS`, 'Manaus', `${a}-03-01`),
    e: N(`007/${a}/PARINTINS`, 'Manaus', `${a}-03-01`), f: N('', 'Manaus', `${a}-03-01`), g: N('abc', 'Manaus', `${a}-03-01`), h: N(`5/${a}/LABREA`, 'Lábrea', `${a}-03-01`), i: N('0', 'Manaus', `${a}-03-01`) }; }, ANO);
  ok(nums.a.n === 7 && nums.a.ano === ANO && nums.a.unidade === 'MANAUS' && nums.b.n === 7 && nums.c.n === 12 && nums.h.n === 5, 'nº do papel: 007/ANO/MANAUS, 7, "Nº 12/ANO/Manaus", LABREA = Lábrea');
  ok(/ano/.test(nums.d.erro) && /unidade/.test(nums.e.erro) && nums.f.erro && nums.g.erro && nums.i.erro, 'nº do papel: ano diferente da data, outra unidade, vazio, texto e zero recusados');
  await P0.ctx.close();

  /* ================= 2. arquivoEnviar aceita PDF ================= */
  console.log('2) servidor: arquivoEnviar com PDF');
  const enviar = (key, arq, buf) => post({ action: 'arquivoEnviar', key, arquivo: { id: uuid(), dono: 'levantamentos', donoId: 'lev-x', tipo: 'documento', papel: '', mime: 'application/pdf', ...arq }, base64: buf.toString('base64') });
  const adm = await gerar('Gestora Digitacao', 'admin'), TOK = (await post({ action: 'painelAtivar', codigo: adm.codigo })).token;
  const SEM_ANT = 'Sem autorização para digitar registros antigos (do papel). Fale com a gerência.';
  // permissão "Digitar do papel" (antigo): padrão desligado, inclusive sem linha na aba Permissoes
  let r = await post({ action: 'sync', key: F.token, since: 0 });
  ok(r.ok && r.permissoes && r.permissoes.antigo === 0 && r.permissoes.pce === 1, 'padrão: sem linha na aba Permissoes → antigo=0 (módulos liberados): ' + JSON.stringify(r.permissoes));
  r = await enviar(F.token, {}, pdfBuf(30));
  ok(!r.ok && r.erro === SEM_ANT && r.semPermissao === 'antigo' && r.permissoes && r.permissoes.antigo === 0 && !/revogad|inv[aá]lid/i.test(r.erro), 'sem permissão: PDF (documento) recusado: ' + r.erro);
  r = await post({ action: 'painelPermissoes', key: TOK, nome: 'Fiscal Ana Paula Lima', veiculos: 1, tf: 1, pce: 0, antigo: 1 });
  ok(!r.ok && /PCE/.test(r.erro), 'painel: "Digitar do papel" sem PCE recusado: ' + r.erro);
  r = await post({ action: 'painelPermissoes', key: TOK, nome: 'Fiscal Ana Paula Lima', veiculos: 1, tf: 1, pce: 1, antigo: 1 });
  ok(r.ok && r.permissoes.antigo === 1 && r.permissoes.pce === 1, 'painel: Digitar do papel liberado para a fiscal (com PCE)');
  r = await enviar(F.token, {}, pdfBuf(30));
  ok(r.ok && /drive\.google\.com/.test(r.url), 'PDF válido aceito: ' + (r.erro || r.url));
  let drive = await get('/__drive'), dpdf = drive.arquivos.find(a => /\.pdf$/.test(a.nome));
  ok(dpdf && dpdf.mime === 'application/pdf' && dpdf.caminho === `GDV - Arquivos/PCE/${ANO}/levantamentos` && /_documento_1_/.test(dpdf.nome) && !dpdf.compartilhado, 'Drive: ' + (dpdf && dpdf.caminho + '/' + dpdf.nome));
  r = await enviar(F.token, {}, pdfBuf(6 * 1024)); ok(r.ok, 'PDF de 6 MB aceito (acima do limite de 4 MB das fotos)');
  r = await enviar(F.token, {}, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500)])); ok(!r.ok && /não corresponde/.test(r.erro), 'PDF falso (conteúdo JPEG) recusado: ' + r.erro);
  r = await enviar(F.token, {}, Buffer.from('<html>%PDF-1.4</html>')); ok(!r.ok && /não corresponde/.test(r.erro), 'arquivo sem assinatura %PDF- no início recusado');
  r = await enviar(F.token, {}, pdfBuf(10 * 1024 + 1)); ok(!r.ok && /10 MB/.test(r.erro), 'PDF maior que 10 MB recusado: ' + r.erro);
  r = await enviar(F.token, { tipo: 'foto' }, pdfBuf(10)); ok(!r.ok && /documento/.test(r.erro), 'PDF como "foto" recusado: ' + r.erro);
  r = await enviar(F.token, { mime: 'image/jpeg' }, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(50)])); ok(!r.ok && /PDF/.test(r.erro), 'documento JPEG recusado: ' + r.erro);
  r = await enviar(F.token, { papel: 'servidor' }, pdfBuf(10)); ok(!r.ok, 'documento com papel de assinatura recusado');
  r = await enviar(F.token, { mime: 'application/zip' }, pdfBuf(10)); ok(!r.ok && /JPEG, PNG ou PDF/.test(r.erro), 'outro formato recusado: ' + r.erro);
  const fotoOk = await post({ action: 'arquivoEnviar', key: F.token, arquivo: { id: uuid(), dono: 'levantamentos', donoId: 'lev-x', tipo: 'foto', papel: '', mime: 'image/jpeg' }, base64: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(50)]).toString('base64') });
  ok(fotoOk.ok, 'fotos JPEG continuam aceitas');

  /* ================= 3. estagiária (só PCE) digita levantamentos do papel ================= */
  console.log('3) estagiária só com PCE: identificação de quem só digita');
  const E = await credencial('Carla Mendes Estagiaria');
  r = await post({ action: 'painelPermissoes', key: TOK, nome: 'Carla Mendes Estagiaria', veiculos: 0, tf: 0, pce: 1 }); ok(r.ok && r.permissoes.antigo === 0, 'painel: chave da estagiária só com PCE (sem "Digitar do papel")');
  const A = await aparelho(E);
  await A.evaluate(() => Sync.sincronizar()); await A.waitForTimeout(800); await A.reload(); await A.waitForTimeout(800);
  ok(await A.evaluate(() => JSON.stringify(Sync.permissoes())) === '{"veiculos":0,"tf":0,"pce":1,"antigo":0}', 'app recebeu permissões: só PCE, antigo=0');
  if (!(await A.locator('.modulo').count())) await A.click('nav [data-v=modulos]');
  await A.click('.modulo[data-v=pce]'); await A.waitForSelector('#pceServForm');
  ok(await A.locator('#pce-s-digitacao').count() === 0, 'sem permissão: identificação sem "Só vou digitar registros antigos do papel"');
  // servidor recusa registro antigo sem a permissão (sync e pceEmitir)
  const levAntigo = { id: uuid(), data: `${ANO}-01-10`, hora: '08:00', servidor: 'X Y', cargo: 'Fiscal', lotacao: 'Manaus', doc: '52998224725', nome: 'TESTE PAPEL', municipio: 'Manaus',
    culturas: '[]', fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: Date.now(), atualizadoEm: Date.now(), registroAntigo: 1, documentos: '[]' };
  r = await post({ action: 'sync', key: E.token, since: Date.now(), levantamentos: [levAntigo] });
  ok(r.ok && (r.recusados.levantamentos || []).includes(levAntigo.id) && !(await ler('Levantamentos')).some(x => x.id === levAntigo.id), 'sync: levantamento com registroAntigo=1 recusado (recusados) e não gravado');
  r = await post({ action: 'pceEmitir', key: E.token, colheita: { id: uuid(), unidade: 'MANAUS', ano: ANO, numero: 90, registroAntigo: 1, data: `${ANO}-01-10` } });
  ok(!r.ok && r.erro === SEM_ANT && r.semPermissao === 'antigo' && !(await ler('Colheitas')).some(c => c.numero === 90), 'pceEmitir: termo antigo recusado sem permissão: ' + r.erro);
  r = await post({ action: 'painelPermissoes', key: TOK, nome: 'Carla Mendes Estagiaria', veiculos: 0, tf: 0, pce: 1, antigo: 1 }); ok(r.ok && r.permissoes.antigo === 1, 'painel: estagiária com PCE + Digitar do papel');
  const acs = await post({ action: 'painelAcessos', key: TOK });
  ok(acs.acessos.find(a => a.nome === 'Carla Mendes Estagiaria').permissoes.antigo === 1, 'painelAcessos devolve antigo=1');
  await A.evaluate(() => Sync.sincronizar()); await A.waitForTimeout(800); await A.reload(); await A.waitForTimeout(800);
  ok(await A.evaluate(() => Sync.pode('antigo')), 'app recebeu antigo=1');
  if (!(await A.locator('.modulo').count())) await A.click('nav [data-v=modulos]');
  await A.click('.modulo[data-v=pce]'); await A.waitForSelector('#pceServForm');
  await A.check('#pce-s-digitacao'); await A.click('#pce-s-salvar');
  await A.waitForSelector('#pce-novolevantigo');
  ok(await A.locator('#pce-novolev').count() === 0 && /Digitação de registros do papel/.test(await A.textContent('.pce-serv')), 'quem só digita: sem cargo/lotação, lista só com "Registro antigo"');

  console.log('4) levantamento antigo: formulário');
  await A.click('#pce-novolevantigo'); await A.waitForSelector('#pceLevForm.pce-antigo');
  ok((await A.inputValue('#pce-data')) === '' && (await A.inputValue('#pce-hora')) === '' && (await A.inputValue('#pce-snome')) === '' && (await A.inputValue('#pce-municipio')) === '', 'data, hora, servidor e município vazios (nada de "agora" nem do perfil)');
  ok(await A.locator('.pce-canvas').count() === 0 && await A.locator('[data-pce=gps]').count() === 0 && await A.getAttribute('#pce-lat', 'type') === 'hidden', 'sem assinaturas e sem GPS');
  ok((await A.getAttribute('#pce-data', 'max')) === hojeL(), 'campo data com máximo = hoje');
  await A.waitForTimeout(1500); ok((await A.inputValue('#pce-lat')) === '', 'GPS não preenche nada');
  await A.screenshot({ path: DIR + 'pce_antigo_desktop_vazio.png', fullPage: false });
  await A.fill('#pce-snome', 'Maria Souza Lima'); await A.selectOption('#pce-scargo', { index: 1 }); await A.fill('#pce-smatricula', '777'); await A.selectOption('#pce-slotacao', 'Itacoatiara');
  await A.fill('#pce-doc', '52998224725'); await A.waitForTimeout(600); await A.fill('#pce-nome', 'josé da silva'); await A.fill('#pce-propriedade', 'Sítio Esperança');
  await A.selectOption('#pce-municipio', 'Itacoatiara');
  await A.selectOption('.pce-cult >> nth=0 >> .c-cultura', 'Banana'); await A.selectOption('.pce-cult >> nth=0 >> .c-praga', 'Fusarium R4T');
  await A.fill('#pce-coord', `3°07'08,4"S 60°01'18,1"W`);
  ok(/Latitude -3\.119 · Longitude -60\.021694(?!\d)/.test(await A.innerText('#pce-coord-st')) && /3°07'08,4" S/.test(await A.innerText('#pce-coord-st')), 'conversão mostrada: ' + (await A.innerText('#pce-coord-st')).trim());
  await A.fill('#pce-coord', '-60.0217, -3.1190'); ok(/trocadas/.test(await A.textContent('#pce-coord-st')) && (await A.inputValue('#pce-lat')) === '', 'coordenada fora do AM: aviso e nada nos campos');
  await A.fill('#pce-coord', ''); ok(/Sem coordenadas/.test(await A.textContent('#pce-coord-st')), 'sem coordenada: aviso');
  await A.fill('#pce-coord', '-60.0217, -3.1190'); await A.fill('#pce-data', `${ANO}-03-15`); await A.fill('#pce-hora', '08:30');
  await A.click('#pce-salvar'); await A.waitForTimeout(300);
  ok(/Coordenadas: .*fora do Amazonas/.test(await toast(A)) && await A.locator('#pceLevForm').count() === 1, 'coordenada fora do AM impede salvar');
  await A.fill('#pce-coord', `3°07'08,4"S 60°01'18,1"W`);
  await A.fill('#pce-data', amanha()); await A.click('#pce-salvar'); await A.waitForTimeout(300);
  ok(/futuro/.test(await toast(A)) && await A.locator('#pceLevForm').count() === 1, 'data futura recusada: ' + await toast(A));
  await A.fill('#pce-data', hojeL()); await A.fill('#pce-hora', '23:59'); await A.click('#pce-salvar'); await A.waitForTimeout(300);
  const hm = await A.evaluate(() => agoraHM());
  ok(hm === '23:59' || /futuro/.test(await toast(A)), 'hora futura (hoje 23:59) recusada');
  await A.fill('#pce-data', `${ANO}-03-15`); await A.fill('#pce-hora', '08:30');
  await A.fill('#pce-snome', 'Maria'); await A.click('#pce-salvar'); await A.waitForTimeout(300);
  ok(/nome completo do servidor/.test(await toast(A)), 'servidor da vistoria: nome completo obrigatório');
  await A.fill('#pce-snome', 'Maria Souza Lima');
  // PDFs: um válido, um falso, um grande demais
  await A.setInputFiles('#pce-pdfs', [{ name: 'ficha_015.pdf', mimeType: 'application/pdf', buffer: pdfBuf(60, 'ficha 15') }]);
  await A.waitForSelector('#pce-pdfs-lista .pce-doc');
  ok(/ficha_015\.pdf/.test(await A.textContent('#pce-pdfs-lista')), 'PDF anexado: ' + (await A.textContent('#pce-pdfs-lista .pce-doc')).replace(/\s+/g, ' ').trim());
  await A.setInputFiles('#pce-pdfs', [{ name: 'foto.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)]) }]); await A.waitForTimeout(300);
  ok(/não é um PDF válido/.test(await toast(A)), 'arquivo que não é PDF recusado no app: ' + await toast(A));
  await A.setInputFiles('#pce-pdfs', [{ name: 'enorme.pdf', mimeType: 'application/pdf', buffer: pdfBuf(10 * 1024 + 50) }]); await A.waitForTimeout(300);
  ok(/limite de 10 MB/.test(await toast(A)) && await A.locator('#pce-pdfs-lista .pce-doc').count() === 1, 'PDF > 10 MB: aviso no app e não anexa: ' + await toast(A));
  const arqPdf = await A.evaluate(async () => (await Store.todos('arquivos')).filter(a => a.tipo === 'documento').map(a => ({ mime: a.mime, ini: a.dados.slice(0, 40), tam: a.tamanho, nome: a.nomeOriginal })));
  ok(arqPdf.length === 1 && arqPdf[0].mime === 'application/pdf' && arqPdf[0].ini.startsWith('data:application/pdf;base64,JVBERi0') && arqPdf[0].tam === 60 * 1024, 'PDF guardado sem alteração (sem redimensionar): ' + JSON.stringify(arqPdf[0]));
  await A.screenshot({ path: DIR + 'pce_antigo_desktop.png', fullPage: true });
  await A.click('#pce-salvar-outro');
  await A.waitForFunction(() => document.querySelector('#pceLevForm.pce-antigo') && document.querySelector('#pce-doc') && document.querySelector('#pce-doc').value === '', null, { timeout: 10000 });
  ok(/Digite o próximo/.test(await toast(A)), '"Salvar e digitar outro": ' + await toast(A));
  ok((await A.inputValue('#pce-snome')) === 'Maria Souza Lima' && (await A.inputValue('#pce-slotacao')) === 'Itacoatiara' && (await A.inputValue('#pce-smatricula')) === '777' && (await A.inputValue('#pce-scargo')) !== '',
    'mantém servidor (nome, cargo, matrícula, lotação)');
  ok((await A.inputValue('#pce-municipio')) === 'Itacoatiara' && (await A.inputValue('#pce-data')) === `${ANO}-03-15`, 'mantém município e data');
  ok((await A.inputValue('#pce-hora')) === '' && (await A.inputValue('#pce-nome')) === '' && (await A.inputValue('#pce-coord')) === '' && await A.locator('#pce-pdfs-lista .pce-doc').count() === 0
    && (await A.inputValue('.pce-cult >> nth=0 >> .c-cultura')) === '', 'limpa o resto (hora, produtor, coordenadas, culturas, PDFs)');
  ok(await A.evaluate(() => document.activeElement && document.activeElement.id) === 'pce-hora', 'foco na hora (próximo campo a digitar)');
  ok(await A.locator('#pce-snome-servs option, #pce-servs option').count() >= 1 && await A.evaluate(() => [...document.querySelectorAll('datalist option')].some(o => o.value === 'Maria Souza Lima')), 'datalist lembra "Maria Souza Lima"');
  // 2º registro: outro servidor escolhido da lista, sem coordenada (confirma)
  await A.fill('#pce-snome', 'João Pereira Alves'); await A.selectOption('#pce-scargo', { index: 2 }); await A.fill('#pce-smatricula', ''); await A.selectOption('#pce-slotacao', 'Manaus');
  await A.fill('#pce-hora', '14:10'); await A.fill('#pce-doc', '11144477735'); await A.waitForTimeout(600); await A.fill('#pce-nome', 'Maria Produtora');
  await A.selectOption('.pce-cult >> nth=0 >> .c-cultura', 'Cacau');
  A.dialogs.length = 0;
  await A.click('#pce-salvar'); await A.waitForSelector('.item.pce-lev');
  ok(A.dialogs.some(m => /Sem coordenadas/.test(m)), 'sem coordenadas: pediu confirmação antes de salvar');
  ok(await A.locator('.item.pce-lev').count() === 2, 'lista com os 2 levantamentos digitados');
  // 3º: nome da lista completa cargo/matrícula/lotação
  await A.click('#pce-novolevantigo'); await A.waitForSelector('#pceLevForm.pce-antigo');
  await A.fill('#pce-snome', 'Maria Souza Lima'); await A.dispatchEvent('#pce-snome', 'change'); await A.waitForTimeout(300);
  ok((await A.inputValue('#pce-slotacao')) === 'Itacoatiara' && (await A.inputValue('#pce-smatricula')) === '777', 'nome escolhido da lista completa matrícula e lotação');
  await A.click('[data-pce=descartarlev]'); await A.waitForSelector('#pce-novolevantigo');

  console.log('5) sincroniza: planilha e Drive');
  await sync(A);
  const levs = await ler('Levantamentos'), l1 = levs.find(x => x.nome === 'JOSÉ DA SILVA'), l2 = levs.find(x => x.nome === 'MARIA PRODUTORA');
  ok(l1 && l1.servidor === 'Maria Souza Lima' && l1.matricula === '777' && l1.lotacao === 'Itacoatiara' && l1.usuario === 'Carla Mendes Estagiaria', 'servidor digitado gravado (não o perfil); usuario = quem digitou');
  ok(l1.data === `${ANO}-03-15` && l1.hora === '08:30' && Math.abs(Number(l1.lat) - GLA) < 1e-6 && Math.abs(Number(l1.lon) - GLO) < 1e-6 && l1.precisao === '', 'data/hora do papel, coordenada convertida, sem precisão: ' + l1.lat + ', ' + l1.lon);
  ok(l1.registroAntigo === 1 && JSON.parse(l1.documentos).length === 1 && JSON.parse(l1.fotos).length === 0 && l1.assinaturas === '{}', 'campos técnicos: registroAntigo=1, documentos=[1 PDF]');
  ok(l2 && l2.servidor === 'João Pereira Alves' && l2.lat === '' && l2.registroAntigo === 1, '2º registro: outro servidor, sem coordenada');
  const arqs = await ler('Arquivos'), aPdf = arqs.find(a => a.id === JSON.parse(l1.documentos)[0]);
  drive = await get('/__drive'); const dLev = drive.arquivos.find(a => aPdf && a.nome === aPdf.nome);
  ok(aPdf && aPdf.tipo === 'documento' && aPdf.mime === 'application/pdf' && aPdf.tamanho === 60 * 1024 && aPdf.usuario === 'Carla Mendes Estagiaria', 'aba Arquivos: documento PDF de 60 KB');
  ok(dLev && dLev.caminho === `GDV - Arquivos/PCE/${ANO}/levantamentos` && dLev.mime === 'application/pdf' && dLev.tamanho === 60 * 1024 && !dLev.lixeira, 'Drive falso recebeu o PDF: ' + (dLev && dLev.nome));
  const loc = await A.evaluate(async () => (await Store.todos('arquivos')).filter(a => a.tipo === 'documento').map(a => ({ enviado: a.enviado, dados: a.dados, url: a.url })));
  ok(loc.length === 1 && loc[0].enviado === 1 && loc[0].dados === '' && /drive/.test(loc[0].url), 'PDF enviado sai do aparelho (fica só o link)');

  console.log('6) reabrir/editar o registro antigo');
  await A.click(`.item.pce-lev[data-lev="${l1.id}"] [data-pce=abrirlev]`); await A.waitForSelector('#pceLevForm.pce-antigo');
  ok((await A.inputValue('#pce-snome')) === 'Maria Souza Lima' && (await A.inputValue('#pce-data')) === `${ANO}-03-15` && /^-3\.119/.test(await A.inputValue('#pce-coord')), 'reabre no formulário de registro antigo (servidor, data e coordenada)');
  ok(/Abrir no Drive/.test(await A.textContent('#pce-pdfs-lista')) && await A.locator('#pce-salvar-outro').count() === 0, 'PDF listado com link do Drive; edição sem "Salvar e digitar outro"');
  await A.fill('#pce-obs', 'Corrigido.'); await A.click('#pce-salvar'); await A.waitForSelector('.item.pce-lev');
  await sync(A);
  const l1b = (await ler('Levantamentos')).find(x => x.id === l1.id);
  ok(l1b.obs === 'Corrigido.' && l1b.servidor === 'Maria Souza Lima' && l1b.registroAntigo === 1 && JSON.parse(l1b.documentos).length === 1, 'edição mantém servidor digitado, registroAntigo e o PDF');

  console.log('7) ficha impressa sem marca de registro antigo');
  let pr = await imprimir(A, `.item.pce-lev[data-lev="${l1.id}"] [data-pce=imprimirlev]`);
  ok(pr.texto.includes('Maria Souza Lima') && pr.texto.includes('JOSÉ DA SILVA') && /3°07'08,4" S/.test(pr.texto), 'ficha: servidor do papel, produtor e coordenada');
  ok(!/antig|papel|digitad|escanead|registroAntigo/i.test(pr.texto) && !/±/.test(pr.texto), 'ficha sem "registro antigo"/"papel"/"digitado" e sem precisão de GPS');

  /* ================= 8. termo de colheita antigo ================= */
  console.log('8) termo de colheita antigo: número do papel');
  const C = (numero, extra = {}) => ({ id: uuid(), unidade: 'MANAUS', ano: ANO, numero, numeroTxt: '', numeroSugerido: numero, numeroOrigem: 'sistema', conflito: 0, levantamentoId: '',
    data: hojeL(), hora: '09:00', servidor: 'Fiscal Ana Paula Lima', cargo: 'Fiscal', matricula: '1', lotacao: 'Manaus', municipio: 'Manaus', doc: '52998224725', nome: 'JOSE', endereco: '',
    lat: -3.1, lon: -60.02, precisao: 10, cultura: 'Banana', quantidade: 1, analise: '', partes: 'folhas', descricao: 'x', fotos: '[]', testemunha1Nome: '', testemunha1Doc: '',
    testemunha2Nome: '', testemunha2Doc: '', assinaturas: '{}', local: 'Manaus/AM', cancelado: 0, motivoCancel: '', excluido: 0, criadoEm: Date.now(), atualizadoEm: Date.now(), ...extra });
  ok((await post({ action: 'pceEmitir', key: F.token, colheita: C(1) })).emitido && (await post({ action: 'pceEmitir', key: F.token, colheita: C(2) })).emitido, 'fiscal em campo já emitiu 001 e 002');
  await A.click('nav [data-v=pcetermos]'); await A.waitForSelector('#pce-novotermoantigo');
  ok(await A.locator('#pce-novotermo').count() === 0, 'quem só digita: lista de termos só com "Termo antigo"');
  await A.click('#pce-novotermoantigo'); await A.waitForSelector('#pceTermoForm.pce-antigo');
  ok(await A.locator('.pce-canvas').count() === 0 && (await A.inputValue('#pce-t-data')) === '' && (await A.inputValue('#pce-t-unidade')) === '' && await A.locator('#pce-t-numero').count() === 0, 'termo antigo: sem assinaturas, sem data, número digitado (sem consulta automática)');
  const preencherTermo = async (num, data, doc = '52998224725') => {
    await A.selectOption('#pce-t-unidade', 'Manaus'); await A.fill('#pce-t-numpapel', num);
    await A.fill('#pce-t-snome', 'Maria Souza Lima'); await A.dispatchEvent('#pce-t-snome', 'change'); await A.waitForTimeout(200);
    await A.fill('#pce-t-data', data); await A.fill('#pce-t-hora', '10:00');
    await A.selectOption('#pce-t-municipio', 'Manaus'); await A.fill('#pce-t-doc', doc); await A.waitForTimeout(600); await A.fill('#pce-t-nome', 'José da Silva');
    await A.selectOption('#pce-t-cultura', 'Banana'); await A.fill('#pce-t-quantidade', '2'); await A.check('input[name=pce-t-parte][value=folhas]');
    await A.fill('#pce-t-coord', '-3.1190, -60.0217');
  };
  await preencherTermo(`005/${ANO - 1}/MANAUS`, `${ANO}-04-02`);
  ok(/ano do número/.test(await A.textContent('#pce-t-numpapel-st')), 'ano do número ≠ ano da data: aviso ' + (await A.textContent('#pce-t-numpapel-st')).trim());
  ok((await A.inputValue('#pce-t-scargo')) !== '' && (await A.inputValue('#pce-t-slotacao')) === 'Itacoatiara', 'servidor escolhido da lista completa cargo/lotação no termo');
  await A.fill('#pce-t-numpapel', `005/${ANO}/MANAUS`);
  ok((await A.textContent('#pce-t-numpapel-st')).includes(`005/${ANO}/MANAUS`), 'prévia do número: ' + (await A.textContent('#pce-t-numpapel-st')).trim());
  ok((await A.inputValue('#pce-t-descricao')).includes('Maria Souza Lima') && /2 de abril de/.test(await A.inputValue('#pce-t-descricao')), 'texto oficial com o servidor e a data do papel');
  await A.setInputFiles('#pce-t-pdfs', [{ name: 'termo_005.pdf', mimeType: 'application/pdf', buffer: pdfBuf(25, 'termo 5') }]); await A.waitForSelector('#pce-t-pdfs-lista .pce-doc');
  await A.fill('#pce-t-data', amanha()); await A.click('#pce-t-gerar'); await A.waitForTimeout(300);
  ok(/futuro/.test(await toast(A)) && !(await A.locator('#pce-modal').count()), 'termo: data futura recusada');
  await A.fill('#pce-t-data', `${ANO}-04-02`);
  await A.click('#pce-t-gerar'); await A.waitForSelector('#pce-modal', { timeout: 10000 });
  const modal = await A.textContent('#pce-modal');
  ok((await A.textContent('#pce-antigo-num')) === `005/${ANO}/MANAUS` && modal.includes(`002/${ANO}/MANAUS`) && /maior/.test(modal) && modal.includes('006'), 'popup: nº do papel, último usado (002) e aviso de que a sequência continua do 006');
  await A.screenshot({ path: DIR + 'pce_antigo_popup.png' });
  await A.click('#pce-m-ok'); await A.waitForSelector('#pce-pronto', { timeout: 10000 });
  ok((await A.textContent('#pce-pronto-num')) === `005/${ANO}/MANAUS` && !/alterado manualmente/.test(await A.textContent('#pce-pronto')), 'termo 005 gravado (sem aviso de "alterado manualmente")');
  let cols = await ler('Colheitas'); const c5 = cols.find(c => c.numero === 5);
  ok(c5 && c5.servidor === 'Maria Souza Lima' && c5.data === `${ANO}-04-02` && c5.ano === ANO && c5.registroAntigo === 1 && c5.usuario === 'Carla Mendes Estagiaria' && c5.numeroSugerido === 3 && c5.numeroOrigem === 'editado' && c5.assinaturas === '{}',
    'planilha: termo 005 com servidor/data do papel (sugerido 3, origem editado, registroAntigo=1)');
  r = await post({ action: 'pceProximoNumero', key: F.token, unidade: 'MANAUS', ano: ANO });
  ok(r.ultimo === 5 && r.proximo === 6, 'sequência continua do número digitado (maior que o último): próximo = 6');
  // número já usado
  await A.click('[data-pce=novotermoantigo]'); await A.waitForSelector('#pceTermoForm.pce-antigo');
  await preencherTermo('2', `${ANO}-04-03`);
  await A.click('#pce-t-gerar'); await A.waitForSelector('#pce-modal'); await A.click('#pce-m-ok');
  await A.waitForFunction(() => /já está registrado/.test(document.querySelector('#pce-t-numpapel-st').textContent), null, { timeout: 10000 });
  ok(/Fiscal Ana Paula Lima/.test(await A.textContent('#pce-t-numpapel-st')) && await A.locator('#pceTermoForm').count() === 1, 'nº 002 já usado: recusado mostrando quem usou — ' + (await A.textContent('#pce-t-numpapel-st')).trim());
  ok((await ler('Colheitas')).length === 3, 'nada gravado para o número duplicado');
  // número livre abaixo do último: aceito, não muda a sequência; "Gravar e digitar outro"
  await A.fill('#pce-t-numpapel', `004/${ANO}/Manaus`);
  await A.click('#pce-t-gravar-outro'); await A.waitForSelector('#pce-modal');
  ok(/dentro da sequência/.test(await A.textContent('#pce-modal')) && (await A.textContent('#pce-modal')).includes('006'), 'popup: nº 004 dentro da sequência (próximo continua 006)');
  await A.click('#pce-m-ok');
  await A.waitForFunction(() => document.querySelector('#pceTermoForm.pce-antigo') && document.querySelector('#pce-t-numpapel').value === '', null, { timeout: 10000 });
  ok(/004\/\d{4}\/MANAUS gravado/.test(await toast(A)), '"Gravar e digitar outro": ' + await toast(A));
  ok((await A.inputValue('#pce-t-snome')) === 'Maria Souza Lima' && (await A.inputValue('#pce-t-unidade')) === 'Manaus' && (await A.inputValue('#pce-t-data')) === `${ANO}-04-03` && (await A.inputValue('#pce-t-municipio')) === 'Manaus'
    && (await A.inputValue('#pce-t-doc')) === '' && (await A.inputValue('#pce-t-hora')) === '' && (await A.inputValue('#pce-t-coord')) === '', 'novo termo mantém servidor/unidade/município/data e limpa o resto');
  r = await post({ action: 'pceProximoNumero', key: F.token, unidade: 'MANAUS', ano: ANO }); ok(r.proximo === 6, 'nº livre abaixo do último não altera o próximo (6)');
  await A.screenshot({ path: DIR + 'pce_antigo_termo.png', fullPage: true });
  await A.click('[data-pce=descartartermo]'); await A.waitForSelector('#pce-novotermoantigo');
  await sync(A);
  drive = await get('/__drive');
  ok(drive.arquivos.some(a => a.caminho === `GDV - Arquivos/PCE/${ANO}/colheitas` && a.mime === 'application/pdf' && a.tamanho === 25 * 1024), 'PDF do termo no Drive (pasta colheitas)');
  pr = await imprimir(A, `.item.pce-termo [data-pce=imprimirtermo]`);
  ok(/00[45]\/\d{4}\/MANAUS/.test(pr.texto) && pr.texto.includes('Maria Souza Lima') && !/antig|papel|digitad|escanead/i.test(pr.texto), 'termo impresso: número e servidor do papel, sem marca de registro antigo');

  console.log('9) fiscal em campo: o próximo número continua normal (006)');
  const Fp = await aparelho(F, { width: 400, height: 900 });
  await Fp.evaluate(() => Store.setMeta('pceServidor', { nome: 'Fiscal Ana Paula Lima', cargo: 'Fiscal Agropecuário Engenheiro Agrônomo', matricula: '1', lotacao: 'Manaus' }));
  await Fp.click('nav [data-v=modulos]').catch(() => {}); await Fp.waitForSelector('.modulo[data-v=pce]'); await Fp.click('.modulo[data-v=pce]'); await Fp.waitForSelector('#pce-novolev');
  ok(await Fp.locator('#pce-novolevantigo').count() === 1, 'fiscal também vê "Registro antigo (digitar do papel)"');
  await Fp.click('nav [data-v=pcetermo]'); await Fp.waitForSelector('#pceTermoForm:not(.pce-antigo)');
  await Fp.fill('#pce-t-doc', '52998224725'); await Fp.waitForTimeout(500); await Fp.fill('#pce-t-nome', 'Jose'); await Fp.selectOption('#pce-t-cultura', 'Banana'); await Fp.fill('#pce-t-quantidade', '1');
  await Fp.click('#pce-t-gerar'); await Fp.waitForSelector('#pce-num-m', { timeout: 15000 });
  ok(+(await Fp.inputValue('#pce-num-m')) === 6, 'termo novo do fiscal: sugestão 006');
  await Fp.click('#pce-m-cancel');
  // celular: formulário antigo
  await Fp.click('nav [data-v=pce]'); await Fp.waitForSelector('#pce-novolevantigo'); await Fp.click('#pce-novolevantigo'); await Fp.waitForSelector('#pceLevForm.pce-antigo');
  await Fp.fill('#pce-coord', `3°07'08,4"S 60°01'18,1"W`);
  await Fp.screenshot({ path: DIR + 'pce_antigo_celular.png', fullPage: true });
  const largura = await Fp.evaluate(() => document.documentElement.scrollWidth); ok(largura <= 400, 'celular sem rolagem horizontal (' + largura + ' px)');
  await Fp.click('[data-pce=descartarlev]');

  console.log('9b) fiscal sem a permissão "Digitar do papel" (padrão): nada do papel aparece');
  const G = await credencial('Fiscal Bruno Sem Papel');
  r = await post({ action: 'sync', key: G.token, since: Date.now(), levantamentos: [{ ...levAntigo, id: uuid() }] });
  ok(r.ok && r.permissoes.antigo === 0 && (r.recusados.levantamentos || []).length === 1, 'sem linha na aba Permissoes: registro antigo recusado no sync');
  const Gp = await aparelho(G, { width: 390, height: 844 });
  await Gp.evaluate(() => Store.setMeta('pceServidor', { nome: 'Fiscal Bruno Sem Papel', cargo: 'Fiscal Agropecuário Engenheiro Agrônomo', matricula: '2', lotacao: 'Manaus' }));
  await Gp.evaluate(() => Sync.sincronizar()); await Gp.waitForTimeout(800);
  ok(await Gp.evaluate(() => Sync.pode('antigo') === false && Sync.pode('pce') === true), 'app: pode("antigo") = false por padrão');
  await Gp.click('nav [data-v=modulos]').catch(() => {}); await Gp.waitForSelector('.modulo[data-v=pce]'); await Gp.click('.modulo[data-v=pce]'); await Gp.waitForSelector('#pce-novolev');
  ok(await Gp.locator('#pce-novolevantigo').count() === 0, 'sem permissão: sem "Registro antigo (digitar do papel)"');
  await Gp.click('nav [data-v=pcetermos]'); await Gp.waitForSelector('#pce-novotermo');
  ok(await Gp.locator('#pce-novotermoantigo').count() === 0, 'sem permissão: sem "Termo antigo (digitar do papel)"');
  await Gp.click('nav [data-v=pce]'); await Gp.waitForSelector('#pce-meusdados'); await Gp.click('#pce-meusdados'); await Gp.waitForSelector('#pceServForm');
  ok(await Gp.locator('#pce-s-digitacao').count() === 0, 'sem permissão: sem a opção "Só vou digitar registros antigos do papel"');
  await Gp.evaluate(() => go('pcelev', { antigo: true })); await Gp.waitForTimeout(400);
  ok(await Gp.locator('#pceLevForm.pce-antigo').count() === 0 && /digitar registros antigos/.test(await toast(Gp)), 'abrir o modo papel à força: recusado com aviso');
  ok(!Gp.err.length, 'console limpo (fiscal sem permissão) ' + JSON.stringify(Gp.err).slice(0, 200));
  await Gp.ctx.close();

  console.log('9c) gerência tira a permissão com registro do papel pendente: fica guardado com aviso');
  await A.click('nav [data-v=pce]'); await A.waitForSelector('#pce-novolevantigo'); await A.click('#pce-novolevantigo'); await A.waitForSelector('#pceLevForm.pce-antigo');
  await A.fill('#pce-snome', 'Maria Souza Lima'); await A.dispatchEvent('#pce-snome', 'change'); await A.waitForTimeout(200);
  await A.fill('#pce-hora', '07:45'); await A.fill('#pce-data', `${ANO}-02-20`); await A.fill('#pce-doc', '11144477735'); await A.waitForTimeout(600); await A.fill('#pce-nome', 'Produtor Pendente');
  await A.selectOption('#pce-municipio', 'Manaus'); await A.selectOption('.pce-cult >> nth=0 >> .c-cultura', 'Banana'); await A.fill('#pce-coord', '-3.1190, -60.0217');
  r = await post({ action: 'painelPermissoes', key: TOK, nome: 'Carla Mendes Estagiaria', veiculos: 0, tf: 0, pce: 1, antigo: 0 }); ok(r.ok && r.permissoes.antigo === 0, 'painel: tirou "Digitar do papel"');
  await A.click('#pce-salvar'); await A.waitForSelector('.item.pce-lev');
  await A.waitForFunction(() => !Sync.pode('antigo'), null, { timeout: 10000 });
  await A.waitForTimeout(800);
  const pendLoc = await A.evaluate(async () => (await Store.todos('levantamentos')).filter(x => x.nome === 'PRODUTOR PENDENTE').map(x => x.pendente));
  ok(pendLoc.length === 1 && pendLoc[0] === 1 && !(await ler('Levantamentos')).some(x => x.nome === 'PRODUTOR PENDENTE'), 'registro do papel continua pendente no aparelho e não foi gravado na planilha');
  await A.click('nav [data-v=pce]'); await A.waitForSelector('#pce-sem-antigo');
  ok(await A.locator('#pce-novolevantigo').count() === 0 && /sem autorização/.test(await A.textContent('.item.pce-lev:has-text("PRODUTOR PENDENTE")')) && await A.locator('.item.pce-lev:has-text("PRODUTOR PENDENTE") [data-pce=abrirlev]').count() === 0,
    'lista: aviso, sem botão do papel; registro pendente marcado "sem autorização" e sem "Abrir"');
  await A.click('nav [data-v=modulos]'); await A.waitForSelector('#avisoPerm');
  ok(/digitar registros antigos \(do papel\).*guardados neste aparelho/.test(await A.textContent('#avisoPerm')), 'tela de módulos: ' + (await A.textContent('#avisoPerm')).trim());
  await A.evaluate(() => go('pcetermo', { antigo: true })); await A.waitForTimeout(400);
  ok(await A.locator('#pceTermoForm').count() === 0 && /digitar registros antigos/.test(await toast(A)), 'termo do papel sem permissão: não abre (aviso)');
  r = await post({ action: 'painelPermissoes', key: TOK, nome: 'Carla Mendes Estagiaria', veiculos: 0, tf: 0, pce: 1, antigo: 1 }); ok(r.ok, 'painel: devolveu a permissão');
  await sync(A);
  ok((await ler('Levantamentos')).some(x => x.nome === 'PRODUTOR PENDENTE' && x.registroAntigo === 1), 'permissão de volta: o registro guardado subiu sozinho');
  await A.click('nav [data-v=pce]'); await A.waitForSelector('#pce-novolevantigo');
  ok(await A.locator('#pce-sem-antigo').count() === 0, 'botão do papel de volta, sem aviso');

  console.log('10) painel: registros entram normalmente, sem marca de registro antigo');
  const pd = await post({ action: 'painelDados', key: TOK, de: `${ANO}-01-01`, ate: hojeL() });
  const pl = (pd.levantamentos || []).find(x => x.id === l1.id), pc = (pd.colheitas || []).find(x => x.numero === 5);
  ok(pd.ok && pl && pl.servidor === 'Maria Souza Lima' && pl.lat !== null && pl.nFotos === 0 && pl.nDocumentos === 1, 'painel: levantamento com servidor do papel, coordenada, nFotos 0, nDocumentos 1');
  ok(pc && pc.servidor === 'Maria Souza Lima' && pc.nDocumentos === 1, 'painel: termo 005 (nDocumentos 1)');
  ok(!/registroAntigo|antigo|papel|digitad/i.test(JSON.stringify({ l: pd.levantamentos, c: pd.colheitas })), 'painel sem campo/texto de registro antigo');

  console.log('11) sem erros de console');
  ok(!A.err.length && !Fp.err.length, 'console limpo ' + JSON.stringify([...A.err, ...Fp.err]).slice(0, 300));
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO', e); console.log('FALHOU=1'); process.exit(1); });
