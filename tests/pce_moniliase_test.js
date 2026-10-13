const amb = require('./lib/amb');
// PCE — monilíase: Cadastro de imóvel, Termo de Fiscalização do PCE e Relatório de atividades (app real + Code.gs real no fakegas).
// Dados reais do relatório de Autazes (julho/2026): 2 cadastros e 2 termos digitados do papel pela estagiária, termo de campo sem internet,
// permissão "Digitar do papel", PDFs (impressão e arquivo gerado no aparelho), relatório do período e painel.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { API, APP, PAINEL } = amb;
const get = p => fetch(API + p).then(r => r.json());
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const ler = async aba => (await get('/__fn?nome=lerLeitura_&args=' + encodeURIComponent(JSON.stringify([aba])))).r || [];
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };
const SAIDA_EXTRA = process.env.GDV_SAIDA_MONILIASE || '';
const salvar = (nome, buf) => { fs.writeFileSync(amb.saida(nome), buf); if (SAIDA_EXTRA) { fs.mkdirSync(SAIDA_EXTRA, { recursive: true }); fs.writeFileSync(path.join(SAIDA_EXTRA, nome), buf); } };
const shot = async (p, nome, full = true) => { await p.screenshot({ path: amb.saida(nome), fullPage: full }); if (SAIDA_EXTRA) fs.copyFileSync(amb.saida(nome), path.join(SAIDA_EXTRA, nome)); };
const ANO = new Date().getFullYear();
const SEM_ANT = 'Sem autorização para digitar registros antigos (do papel). Fale com a gerência.';

(async () => {
  const b = await amb.lancar();
  const gerar = (nome, perfil = '') => get('/__gerar?nome=' + encodeURIComponent(nome) + '&perfil=' + perfil);
  const credencial = async nome => { const g = await gerar(nome); const r = await post({ action: 'ativar', codigo: g.codigo }); return { token: r.token, nome }; };
  const aparelho = async ({ token, nome }, vp = { width: 1366, height: 800 }) => {
    const c = await b.newContext({ viewport: vp, permissions: ['geolocation'], geolocation: { latitude: -3.57, longitude: -59.13, accuracy: 9 }, acceptDownloads: true });
    await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [token, nome]);
    await c.addInitScript(() => { if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' '), html: d.body.innerHTML, paginas: d.querySelectorAll('.a4').length, titulo: window.top.document.title }); }; });
    const p = await c.newPage(); p.err = []; p.dialogs = [];
    p.on('pageerror', e => p.err.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && p.err.push(m.text()));
    p.on('dialog', d => { p.dialogs.push(d.message()); d.accept(); }); p.ctx = c;
    await p.goto(APP); await p.waitForSelector('#view *', { state: 'attached' }); await p.waitForTimeout(600); return p;
  };
  const sim = (p, nome, v) => p.click(`label:has(> input[name="${nome}"][value="${v}"])`);
  const marcar = (p, nome, v) => p.check(`input[name="${nome}"][value="${v}"]`);
  const imprimir = async (p, fn) => { await p.evaluate(() => { window.__prints = []; }); await fn(); await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 }); return p.evaluate(() => window.__prints[0]); };
  const pdfArquivo = async (p, tipo, id) => Buffer.from(await p.evaluate(async ([t, i]) => { const f = await PCEMon.imprimir(t, i, 'arquivo'); const u = new Uint8Array(await f.arrayBuffer()); let s = ''; u.forEach(x => { s += String.fromCharCode(x); }); return btoa(s); }, [tipo, id]), 'base64');
  const paginasPdf = buf => { try { const f = amb.saida('_tmp.pdf'); fs.writeFileSync(f, buf); return Number(execFileSync('python3', ['-c', 'import sys,pypdf;print(len(pypdf.PdfReader(sys.argv[1]).pages))', f]).toString().trim()); } catch (e) { return null; } };
  const sync = async p => { for (let i = 0; i < 25; i++) { await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(400); const n = await p.evaluate(async () => (await Store.todos('termosPce')).filter(x => x.pendente).length + (await Store.todos('cadastrosPce')).filter(x => x.pendente).length); if (!n && await p.evaluate(() => Sync.estado().tipo === 'ok')) return; } throw new Error('sync não terminou'); };

  /* ================= 1. leitura de coordenadas e do número do papel ================= */
  console.log('1) coordenadas por campo e número do papel');
  const adm = await gerar('Gestor Moniliase Painel', 'admin'), TOK = (await post({ action: 'painelAtivar', codigo: adm.codigo })).token;
  const E = await credencial('Carla Mendes Estagiaria');
  let r = await post({ action: 'painelPermissoes', key: TOK, nome: E.nome, veiculos: 0, tf: 0, pce: 1, antigo: 1 });
  ok(r.ok && r.permissoes.antigo === 1, 'painel: estagiária com PCE + Digitar do papel');
  const A = await aparelho(E);
  const C = await A.evaluate(() => { const L = PCEMon.lerEixo, N = PCEMon.lerNumeroDoc;
    return { a: L('-3,57495', 'lat'), b: L('-3.57495', 'lat'), c: L('3,57495S', 'lat'), d: L('-59,12784W', 'lon'), e: L('59,12784', 'lon'), f: L(`3°34'29,8"S`, 'lat'),
      g: L('S 3 34 29.8', 'lat'), h: L('3,5N', 'lon'), par: PCEMon.lerPar('-3,57495', '-59,12784W'), fora: PCEMon.lerPar('-15,7', '-47,8'),
      n1: N('001.2026.AUTAZES', 'Autazes', '2026-07-08'), n2: N('001-2026-AUTAZES', 'Autazes', '2026-07-08'), n3: N('1', 'Autazes', '2026-07-08'), n4: N('001/2025/AUTAZES', 'Autazes', '2026-07-08'),
      n5: N('7.2026.MANAUS', 'Autazes', '2026-07-08'), n6: N('Nº 12', 'Autazes', '2026-07-08'), i1: PCEMon.numero('08 anos'), i2: PCEMon.numero('2,5'), i3: PCEMon.numero('1.234') }; });
  ok([C.a, C.b].every(x => x.v === -3.57495) && C.c.v === -3.57495 && C.d.v === -59.12784 && C.e.v === -59.12784 && C.e.oeste, 'lat/lon: "-3,57495", "-3.57495", "3,57495S", "-59,12784W" e "59,12784" (Oeste)', C);
  ok(Math.abs(C.f.v + (3 + 34 / 60 + 29.8 / 3600)) < 1e-6 && Math.abs(C.g.v - C.f.v) < 1e-6 && C.h.erro, 'GMS (3°34\'29,8"S e S 3 34 29.8); hemisfério errado recusado', [C.f, C.g, C.h]);
  ok(C.par.lat === -3.57495 && C.par.lon === -59.12784 && /fora do Amazonas/.test(C.fora.erro || ''), 'par dentro do Amazonas; fora do AM recusado', [C.par, C.fora]);
  ok(C.n1.n === 1 && C.n2.n === 1 && C.n3.n === 1 && C.n3.ano === 2026 && C.n1.unidade === 'AUTAZES' && C.n6.n === 12, 'nº do papel: 001.2026.AUTAZES, 001-2026-AUTAZES, 1, Nº 12', [C.n1, C.n3]);
  ok(/ano/.test(C.n4.erro || '') && /unidade/.test(C.n5.erro || ''), 'nº do papel: ano diferente da data e outra unidade recusados', [C.n4, C.n5]);
  ok(C.i1 === 8 && C.i2 === 2.5 && C.i3 === 1234, 'idade "08 anos" → 8; "2,5" → 2,5; "1.234" → 1234', [C.i1, C.i2, C.i3]);

  /* ================= 2. estagiária digita 2 cadastros do papel ================= */
  console.log('2) cadastros de imóvel digitados do papel (Autazes, maio/2025)');
  await A.evaluate(() => Sync.sincronizar()); await A.waitForTimeout(800); await A.reload(); await A.waitForTimeout(700);
  if (!(await A.locator('.modulo').count())) await A.click('nav [data-v=modulos]');
  await A.click('.modulo[data-v=pce]'); await A.waitForSelector('#pceServForm');
  await A.check('#pce-s-digitacao'); await A.click('#pce-s-salvar'); await A.waitForSelector('#pce-cads');
  ok(await A.locator('#pce-tfs').count() === 1 && await A.locator('#pce-rel').count() === 1, 'lista do PCE: Cadastro de imóvel, Termo de Fiscalização e Relatório de atividades');
  await A.click('#pce-cads'); await A.waitForSelector('#mon-novo-papel');
  ok(await A.locator('#mon-novo').count() === 0, 'quem só digita: só "Digitar do papel"');
  await A.click('#mon-novo-papel'); await A.waitForSelector('#monCadForm.pce-antigo');
  ok(await A.locator('.pce-canvas').count() === 0 && await A.locator('[data-mon=gps]').count() === 0, 'papel: sem assinaturas e sem GPS');
  await shot(A, 'mon_cadastro_pc_vazio.png');
  const servidorPapel = async (p, pref) => { await p.fill(`#${pref}snome`, 'Wellington Soares da Silva'); await p.selectOption(`#${pref}scargo`, 'Fiscal Agropecuário Engenheiro Agrônomo');
    await p.fill(`#${pref}smatricula`, '269.024-1 A'); await p.selectOption(`#${pref}slotacao`, 'Autazes'); };
  await servidorPapel(A, 'mc-');
  await A.selectOption('#mc-unidade', 'Autazes'); await A.fill('#mc-data', '2025-05-26'); await A.fill('#mc-numpapel', '001-2025-AUTAZES'); await A.fill('#mc-local', 'Autazes');
  await A.waitForTimeout(200);
  ok(/001-2025-AUTAZES/.test(await A.textContent('#mc-numpapel-st')), 'nº do papel conferido na tela', await A.textContent('#mc-numpapel-st'));
  await sim(A, 'mc-comercial', 'nao'); await sim(A, 'mc-tipoNaoComercial', 'sitio');
  await A.fill('#mc-nome', 'Valdeniza Figueiredo Ramos'); await A.fill('#mc-doc', '134.034.782-20'); await A.fill('#mc-propriedade', 'Sítio Nova Alvorada');
  await A.fill('#mc-lat', '-3,73175'); await A.fill('#mc-lon', '-59,12020W'); await sim(A, 'mc-viaAcesso', 'terrestre');
  await A.fill('#mc-endereco', 'Ramal do Fausto Queiroz, Comunidade do Sampaio'); await A.selectOption('#mc-municipio', 'Autazes');
  await A.fill('#mc-pl-cupuacu', '20'); await sim(A, 'mc-areaAbandonada', 'nao'); await A.fill('#mc-areaProducao', '05'); await A.fill('#mc-idadeProducao', '08 anos');
  await sim(A, 'mc-origem', 'proprias'); await A.fill('#mc-producao', '50'); await A.fill('#mc-destino', 'Mercado local'); await sim(A, 'mc-sacaria', 'nova');
  await sim(A, 'mc-assistencia', 'nao'); await sim(A, 'mc-frutosSaem', 'nao');
  for (const k of ['vassoura', 'podridao', 'lazio']) await sim(A, `mc-f-${k}-tem`, 'nao');
  await sim(A, 'mc-sintomas', 'nao'); await sim(A, 'mc-camaraUmida', 'nao');
  ok((await A.textContent('#mc-total')).trim() === '20', 'total de plantas calculado (20)');
  ok(/-3,73175/.test(await A.textContent('#mc-coord-st')) && /-59,1202/.test(await A.textContent('#mc-coord-st')), 'coordenada do papel convertida', await A.textContent('#mc-coord-st'));
  await sim(A, 'mc-camaraUmida', 'nao'); await A.waitForTimeout(100);
  ok(!(await A.isChecked('input[name="mc-camaraUmida"][value="nao"]')), 'tocar de novo no botão marcado desmarca (campo em branco no papel)');
  await sim(A, 'mc-camaraUmida', 'nao');
  await shot(A, 'mon_cadastro_pc_preenchido.png');
  await A.click('#mc-salvar-outro'); await A.waitForSelector('#mon-m-ok', { timeout: 15000 });
  ok(/001-2025-AUTAZES/.test(await A.textContent('#mon-papel-num')) && /Dentro da sequência|próximo da sequência|maior/.test(await A.textContent('#mon-modal')), 'popup do papel: número e efeito na sequência', await A.textContent('#mon-modal'));
  await A.click('#mon-m-ok'); await A.waitForSelector('#monCadForm.pce-antigo #mc-numpapel');
  await A.waitForFunction(() => document.querySelector('#mc-numpapel').value === '');
  ok((await A.inputValue('#mc-snome')) === 'Wellington Soares da Silva' && (await A.inputValue('#mc-data')) === '2025-05-26' && (await A.inputValue('#mc-municipio')) === 'Autazes',
    '"Salvar e digitar outro": mantém servidor, data e município');
  await A.fill('#mc-numpapel', '3'); await sim(A, 'mc-comercial', 'nao'); await sim(A, 'mc-tipoNaoComercial', 'residencia');
  await A.fill('#mc-nome', 'Antonio Carlos Morais Muniz'); await A.fill('#mc-doc', '435.660.222-68');
  await A.fill('#mc-lat', '-3,57495'); await A.fill('#mc-lon', '-59,12784W'); await sim(A, 'mc-viaAcesso', 'terrestre');
  await A.fill('#mc-endereco', 'R. Manoel da Costa, 221 - Aparecida'); await A.fill('#mc-pl-cupuacu', '01'); await A.fill('#mc-areaProducao', '7');
  await sim(A, 'mc-origem', 'proprias'); await A.fill('#mc-producao', '15'); await sim(A, 'mc-sacaria', 'nova'); await sim(A, 'mc-assistencia', 'nao'); await sim(A, 'mc-frutosSaem', 'nao');
  await sim(A, 'mc-f-vassoura-tem', 'sim'); await sim(A, 'mc-f-podridao-tem', 'nao'); await sim(A, 'mc-f-lazio-tem', 'nao'); await sim(A, 'mc-sintomas', 'nao');
  await A.click('#mc-salvar'); await A.waitForSelector('#mon-m-ok', { timeout: 15000 }); await A.click('#mon-m-ok');
  await A.waitForSelector('#mon-pronto', { timeout: 15000 });
  ok((await A.textContent('#mon-pronto-num')).trim() === '003-2025-AUTAZES', 'nº "3" do papel gravado como 003-2025-AUTAZES', await A.textContent('#mon-pronto-num'));
  let cads = await ler('CadastrosPCE');
  const cV = cads.find(c => /VALDENIZA/.test(c.nome)), cA = cads.find(c => /ANTONIO/.test(c.nome));
  ok(cads.length === 2 && cV && cA && cV.numeroTxt === '001-2025-AUTAZES' && cA.numeroTxt === '003-2025-AUTAZES' && cV.numeroOrigem === 'papel' && cV.registroAntigo === 1,
    'planilha (CadastrosPCE): 2 cadastros com os números do papel (numeroOrigem = papel)', cads.map(c => [c.numeroTxt, c.numeroOrigem]));
  const dV = JSON.parse(cV.dados || '{}');
  ok(Number(cV.lat) === -3.73175 && Number(cV.lon) === -59.1202 && cV.totalPlantas === 20 && dV.idadeProducao === 8 && dV.plantas.cupuacu === 20 && dV.tipoNaoComercial === 'sitio' && dV.viaAcesso === 'terrestre',
    'cadastro: coordenadas, total de plantas, idade "08 anos" → 8, sítio, via terrestre', [cV.lat, cV.lon, cV.totalPlantas, dV.idadeProducao]);
  ok(cV.servidor === 'Wellington Soares da Silva' && cV.matricula === '269.024-1 A' && cV.usuario === E.nome && cV.data === '2025-05-26', 'servidor do papel e quem digitou (usuario)');
  const props = await ler('Propriedades'), pV = props.find(x => x.id === cV.propriedadeId);
  ok(pV && pV.viaAcesso === 'terrestre' && pV.comercial === 'nao' && pV.tipoPropriedade === 'sitio' && pV.municipio === 'Autazes', 'Propriedades: campos comuns do cadastro (via, comercial, tipo)', pV);

  /* ================= 3. termos do papel, ligados ao cadastro ================= */
  console.log('3) Termos de Fiscalização digitados do papel (08/07/2026)');
  await A.evaluate(() => go('pcetfs')); await A.waitForSelector('#mon-novo-papel'); await A.click('#mon-novo-papel'); await A.waitForSelector('#monTfForm.pce-antigo');
  await A.fill('#mt-snome', 'Wellington Soares da Silva'); await A.dispatchEvent('#mt-snome', 'change'); await A.waitForTimeout(300);
  ok((await A.inputValue('#mt-smatricula')) === '269.024-1 A', 'servidor lembrado: escolher o nome completa cargo/matrícula/lotação');
  await A.selectOption('#mt-unidade', 'Autazes'); await A.fill('#mt-data', '2026-07-08'); await A.fill('#mt-hora', '14:20'); await A.fill('#mt-numpapel', '001.2026.AUTAZES');
  await A.fill('#mt-busca', '435.660'); await A.waitForSelector('[data-mon=usarcad]'); await A.click('[data-mon=usarcad]');
  await A.waitForSelector('#mt-cadinfo');
  ok(/003-2025-AUTAZES/.test(await A.textContent('#mt-cadinfo')) && /ANTONIO/.test(await A.inputValue('#mt-nome')) && (await A.inputValue('#mt-plantas')) === '1', 'termo ligado ao cadastro por CPF: nome, plantas = total do cadastro', await A.textContent('#mt-cadinfo'));
  await A.fill('#mt-lat', '-3,57495'); await A.fill('#mt-lon', '-59,12784W');
  ok(await A.isChecked('input[name="mt-pragas"][value="Monilíase"]'), 'Monilíase marcada por padrão');
  await marcar(A, 'mt-acoes', 'Fiscalização'); await A.click('#mt-negativa');
  ok(await A.locator('#mt-material').count() === 0, 'termo sem "material educativo" (folders só no relatório)');
  await A.fill('#mt-plantas', '75'); await sim(A, 'mt-amostra', 'nao');
  await shot(A, 'mon_termo_pc_preenchido.png');
  await A.click('#mt-salvar-outro'); await A.waitForSelector('#mon-m-ok', { timeout: 15000 }); await A.click('#mon-m-ok');
  await A.waitForFunction(() => document.querySelector('#mt-numpapel') && document.querySelector('#mt-numpapel').value === '' && !document.querySelector('#mon-modal'), null, { timeout: 15000 });
  await A.fill('#mt-numpapel', '2'); await A.fill('#mt-hora', '15:50');
  await A.fill('#mt-busca', 'valdeniza'); await A.waitForSelector('[data-mon=usarcad]'); await A.click('[data-mon=usarcad]'); await A.waitForSelector('#mt-cadinfo');
  ok((await A.inputValue('#mt-plantas')) === '20' && (await A.inputValue('#mt-data')) === '2026-07-08', 'segundo termo: data mantida e plantas = 20 (cadastro)');
  await A.fill('#mt-lat', '-3,73175'); await A.fill('#mt-lon', '-59,1202W'); await marcar(A, 'mt-acoes', 'Fiscalização'); await marcar(A, 'mt-acoes', 'Educação Sanitária'); await A.click('#mt-negativa');
  await A.click('#mt-salvar'); await A.waitForSelector('#mon-m-ok', { timeout: 15000 }); await A.click('#mon-m-ok'); await A.waitForSelector('#mon-pronto', { timeout: 15000 });
  ok((await A.textContent('#mon-pronto-num')).trim() === '002.2026.AUTAZES', 'nº "2" do papel gravado como 002.2026.AUTAZES');
  // número repetido: recusado
  await A.evaluate(() => go('pcetf', { antigo: true })); await A.waitForSelector('#monTfForm.pce-antigo');
  await A.fill('#mt-snome', 'Wellington Soares da Silva'); await A.dispatchEvent('#mt-snome', 'change'); await A.selectOption('#mt-unidade', 'Autazes');
  await A.fill('#mt-data', '2026-07-09'); await A.fill('#mt-hora', '09:00'); await A.fill('#mt-numpapel', '001.2026.AUTAZES'); await A.fill('#mt-nome', 'Outra Pessoa');
  await A.selectOption('#mt-municipio', 'Autazes'); await marcar(A, 'mt-acoes', 'Fiscalização');
  await A.click('#mt-salvar'); await A.waitForTimeout(800);
  ok(/já está/.test(await A.textContent('#toast')) && await A.locator('#mon-modal').count() === 0, 'nº do papel já usado: recusado com aviso', await A.textContent('#toast'));
  await A.click('[data-mon=descartar]'); await A.waitForSelector('#mon-novo-papel');
  let termos = await ler('TermosPCE');
  const t1 = termos.find(t => t.numero === 1), t2 = termos.find(t => t.numero === 2);
  ok(termos.length === 2 && t1 && t2 && t1.numeroTxt === '001.2026.AUTAZES' && t2.numeroTxt === '002.2026.AUTAZES' && t1.numeroOrigem === 'papel' && t1.unidade === 'AUTAZES',
    'planilha (TermosPCE): 2 termos com os números do papel', termos.map(t => [t.numeroTxt, t.numeroOrigem]));
  ok(t1.cadastroId === cA.id && t2.cadastroId === cV.id && t1.propriedadeId === cA.propriedadeId && t2.propriedadeId === cV.propriedadeId, 'ligação termo ↔ cadastro e propriedade (por id)');
  ok(Number(t1.lat) === -3.57495 && Number(t1.lon) === -59.12784 && t1.data === '2026-07-08' && t1.hora === '14:20' && t1.plantasInspecionadas === 75 && t2.plantasInspecionadas === 20 && !('materialEducativo' in t1),
    'termo: coordenadas -3,57495 / -59,12784W, data/hora e plantas inspecionadas', [t1.lat, t1.lon, t1.plantasInspecionadas, t2.plantasInspecionadas]);
  ok(JSON.parse(t1.pragas).join() === 'Monilíase' && JSON.parse(t1.acoes).join() === 'Fiscalização' && /Não constatei a presença da monilíase/.test(t1.constatacao), 'praga, ação e constatação');

  /* ================= 4. PDFs ================= */
  console.log('4) PDFs: termo e cadastro (impressão e arquivo gerado no aparelho)');
  const idT1 = t1.id, idCV = cV.id;
  let pr = await imprimir(A, () => A.evaluate(id => PCEMon.imprimir('termo', id), idT1));
  ok(/TERMO DE FISCALIZAÇÃO Nº 001\.2026\.AUTAZES/.test(pr.texto) && /ANTONIO CARLOS MORAIS MUNIZ/.test(pr.texto) && /435\.660\.222-68/.test(pr.texto) && /-3,57495 \/ -59,12784/.test(pr.texto)
    && /Não constatei a presença da monilíase/.test(pr.texto) && /1ª via: Interessado/.test(pr.texto) && pr.paginas === 1, 'PDF do termo: número, interessado, CPF, coordenadas, constatação, vias (1 folha)', pr.texto.slice(0, 300));
  ok(/class="cx on" data-x="pragas=Monilíase"/.test(pr.html) && /class="cx on" data-x="acoes=Fiscalização"/.test(pr.html) && !/class="cx on" data-x="acoes=Levantamento"/.test(pr.html), 'caixas marcadas: Monilíase e Fiscalização');
  pr = await imprimir(A, () => A.evaluate(id => PCEMon.imprimir('cadastro', id), idCV));
  ok(/CADASTRO DE IMÓVEIS COM HOSPEDEIROS DA MONILÍASE Nº 001-2025-AUTAZES/.test(pr.texto) && /VALDENIZA FIGUEIREDO RAMOS/.test(pr.texto) && /Sítio Nova Alvorada/.test(pr.texto)
    && /Wellington Soares da Silva/.test(pr.texto) && /26\/05\/2025/.test(pr.texto) && /\(X\) sítio/.test(pr.texto) && /\(X\) Terrestre/.test(pr.texto) && /Mercado local/.test(pr.texto), 'PDF do cadastro: nº, produtor, propriedade, servidor, data, marcações (X)', pr.texto.slice(0, 400));
  const pdfT = await pdfArquivo(A, 'termo', idT1), pdfC = await pdfArquivo(A, 'cadastro', idCV);
  salvar('mon_termo_001.2026.AUTAZES.pdf', pdfT); salvar('mon_cadastro_001-2025-AUTAZES.pdf', pdfC);
  ok(pdfT.slice(0, 5).toString() === '%PDF-' && pdfT.length > 30000 && pdfC.slice(0, 5).toString() === '%PDF-', 'PDF gerado no aparelho (termo e cadastro)', [pdfT.length, pdfC.length]);
  const np = paginasPdf(pdfT); if (np != null) ok(np === 1 && paginasPdf(pdfC) === 1, 'pypdf: termo e cadastro com 1 página cada', [np, paginasPdf(pdfC)]);

  /* ================= 5. relatório de atividades ================= */
  console.log('5) Relatório de atividades 08–10/07/2026, Autazes');
  await A.evaluate(() => go('pcerel')); await A.waitForSelector('#monRelForm');
  await A.fill('#mr-de', '2026-07-08'); await A.fill('#mr-ate', '2026-07-10'); await A.selectOption('#mr-mun', 'Autazes'); await A.waitForTimeout(600);
  ok((await A.textContent('#mr-ntermos')) === '02 termos.' && (await A.textContent('#mr-plantas')) === '95 plantas' && (await A.textContent('#mr-folders')) === '1 ação(ões)',
    'prévia: TFs emitidos = 2, plantas = 75 + 20, Educação Sanitária = 1 termo com a ação (sem folders digitados)', [await A.textContent('#mr-ntermos'), await A.textContent('#mr-plantas'), await A.textContent('#mr-folders')]);
  ok(await A.evaluate(() => PCEDocs.calcularRelatorio([{ id: 'x', data: '2026-07-08', acoes: '["Fiscalização"]' }], [], {}).textos.educacao) === 'não realizada', 'sem ação de Educação Sanitária e sem folders: "não realizada"');
  await A.fill('#mr-folders-n', '72'); await A.waitForTimeout(400);
  ok((await A.textContent('#mr-folders')) === '1 ação(ões); distribuição orientada de 72 folders e flyers', 'folders digitados na geração do relatório', await A.textContent('#mr-folders'));
  await A.fill('#mr-conv', '00991272/2025'); await A.fill('#mr-etapa', '1.4');
  await A.fill('#mr-servs', 'Wellington Soares da Silva - Coordenador de Unidade\nJoel Paula Freitas - Motorista'); await A.fill('#mr-resp', 'Wellington Soares da Silva - Coordenador de Unidade');
  await A.fill('#mr-desl', 'Manaus/AM x Autazes/AM x Manaus/AM');
  ok((await A.inputValue('#mr-local')) === 'Autazes/AM' && /Monilíase/.test(await A.inputValue('#mr-obj')), 'local e objetivo sugeridos');
  await shot(A, 'mon_relatorio_pc_form.png');
  pr = await imprimir(A, () => A.click('#mr-imprimir'));
  ok(/CONVÊNIO Nº 00991272\/2025/.test(pr.texto) && /ETAPA 1\.4/.test(pr.texto) && /Joel Paula Freitas - Motorista/.test(pr.texto) && /Período: 08\/07\/2026 a 10\/07\/2026/.test(pr.texto)
    && /Local: Autazes\/AM/.test(pr.texto) && /Plantas inspecionadas: 95 plantas/.test(pr.texto) && /Educação Sanitária: 1 ação\(ões\); distribuição orientada de 72 folders e flyers/.test(pr.texto)
    && /Termo de Fiscalização emitidos: 02 termos/.test(pr.texto) && /Não houve coleta de amostra/.test(pr.texto) && /Deslocamento: Manaus\/AM x Autazes\/AM x Manaus\/AM/.test(pr.texto),
    'relatório: convênio, etapa, servidores, período, local, plantas, educação sanitária (ações + folders), termos emitidos', pr.texto.slice(0, 900));
  ok(pr.paginas === 5 && (pr.html.match(/class="a4 doc-termo anexo"/g) || []).length === 2 && (pr.html.match(/class="a4 doc-cad anexo"/g) || []).length === 2,
    'relatório com os 2 termos e os 2 cadastros anexados (5 folhas)', pr.paginas);
  await A.evaluate(() => { window.__pdfRel = null; PDF.baixar = f => { window.__pdfRel = f; }; });
  await A.click('#mr-arquivo'); await A.waitForFunction(() => window.__pdfRel, null, { timeout: 60000 });
  const pdfR = Buffer.from(await A.evaluate(async () => { const u = new Uint8Array(await window.__pdfRel.arrayBuffer()); let s = ''; u.forEach(x => { s += String.fromCharCode(x); }); return btoa(s); }), 'base64');
  salvar('mon_relatorio_autazes_2026-07.pdf', pdfR);
  ok(pdfR.slice(0, 5).toString() === '%PDF-', 'PDF do relatório gerado no aparelho', pdfR.length);
  const npR = paginasPdf(pdfR); if (npR != null) ok(npR === 5, 'pypdf: relatório + 4 anexos = 5 páginas', npR);
  await A.evaluate(() => go('pce')); await A.evaluate(() => go('pcerel')); await A.waitForSelector('#monRelForm');
  ok((await A.inputValue('#mr-folders-n')) === '', 'nº de folders não é lembrado');
  ok((await A.inputValue('#mr-conv')) === '00991272/2025' && (await A.inputValue('#mr-etapa')) === '1.4' && /Joel/.test(await A.inputValue('#mr-servs')), 'convênio, etapa e servidores lembrados');
  ok(!A.err.length, 'sem erros no app da estagiária', A.err);

  /* ================= 6. permissão "Digitar do papel" ================= */
  console.log('6) permissão Papel');
  const W = await credencial('Wellington Soares da Silva');
  const idx = require('crypto').randomUUID();
  r = await post({ action: 'sync', key: W.token, since: Date.now(), termosPce: [{ id: idx, unidade: 'AUTAZES', ano: 2026, numero: 50, data: '2026-07-01', hora: '08:00', nome: 'X', registroAntigo: 1, criadoEm: 1, atualizadoEm: 1 }] });
  ok(r.ok && (r.recusados.termosPce || []).includes(idx) && !(await ler('TermosPCE')).some(t => t.id === idx), 'sync sem permissão: termo do papel recusado (fica no aparelho)');
  r = await post({ action: 'pceDocRegistrar', key: W.token, tipo: 'cadastro', registro: { id: idx, unidade: 'AUTAZES', ano: 2026, numero: 9, registroAntigo: 1 } });
  ok(!r.ok && r.erro === SEM_ANT && r.semPermissao === 'antigo', 'pceDocRegistrar: cadastro do papel recusado sem permissão', r.erro);
  r = await post({ action: 'pceDocNumero', key: W.token, tipo: 'termo', unidade: 'Autazes', ano: 2026 });
  ok(r.ok && r.ultimo === 2 && r.proximo === 3 && r.ultimoReg && r.ultimoReg.numeroTxt === '002.2026.AUTAZES', 'próximo nº do termo em Autazes/2026 = 003 (papel conta na sequência)', r);

  /* ================= 7. fiscal em campo: termo sem internet, sincronização ================= */
  console.log('7) Termo de Fiscalização em campo (celular 360 px, sem internet)');
  const Wp = await aparelho(W, { width: 360, height: 760 });
  await Wp.evaluate(() => Store.setMeta('pceServidor', { nome: 'Wellington Soares da Silva', cargo: 'Fiscal Agropecuário Engenheiro Agrônomo', matricula: '269.024-1 A', lotacao: 'Autazes' }));
  await Wp.evaluate(() => Sync.sincronizar()); await Wp.waitForTimeout(900);
  const baixados = await Wp.evaluate(async () => { await Campo.baixar(['Autazes']); return (await Store.todos('cadastrosPce')).map(c => c.numeroTxt).sort(); });
  ok(JSON.stringify(baixados) === '["001-2025-AUTAZES","003-2025-AUTAZES"]', '"Dados para o campo": cadastros de monilíase de Autazes no aparelho', baixados);
  const pAut = await Wp.evaluate(async () => (await Store.todos('propriedades')).filter(p => p.campoMun).map(p => ({ id: p.id, ult: p.ultimoTermoPce && p.ultimoTermoPce.numeroTxt })));
  ok(pAut.length === 2 && pAut.every(x => /^00[12]\.2026\.AUTAZES$/.test(x.ult || '')), 'propriedades baixadas com o último termo de fiscalização', pAut);
  await Wp.evaluate(() => go('pce')); await Wp.waitForSelector('#pce-tfs'); await shot(Wp, 'mon_lista_pce_celular.png', false);
  await Wp.click('#pce-tfs'); await Wp.waitForSelector('#mon-novo');
  ok(await Wp.locator('#mon-novo-papel').count() === 0, 'sem a permissão Papel: sem "Digitar do papel"');
  await Wp.ctx.setOffline(true);
  await Wp.click('#mon-novo'); await Wp.waitForSelector('#monTfForm:not(.pce-antigo)');
  ok(await Wp.locator('.pce-canvas').count() === 4 && await Wp.locator('[data-mon=gps]').count() === 1, 'campo: assinaturas (interessado, servidor, 2 testemunhas) e GPS');
  await shot(Wp, 'mon_termo_celular_vazio.png');
  await Wp.fill('#mt-busca', 'valdeniza'); await Wp.waitForSelector('[data-mon=usarcad]'); await Wp.click('[data-mon=usarcad]'); await Wp.waitForSelector('#mt-cadinfo');
  await Wp.click('#mt-negativa');
  await shot(Wp, 'mon_termo_celular_preenchido.png');
  await Wp.click('#mt-salvar'); await Wp.waitForSelector('#mon-num-m', { timeout: 15000 });
  const esperado = ANO === 2026 ? 3 : 1;
  ok(+(await Wp.inputValue('#mon-num-m')) === esperado && /provisório/.test(await Wp.textContent('#mon-modal')), `sem internet: número provisório ${esperado} (último conhecido + 1)`, await Wp.inputValue('#mon-num-m'));
  await Wp.click('#mon-m-ok'); await Wp.waitForSelector('#mon-pronto');
  ok(/Aguardando envio/.test(await Wp.textContent('#mon-pronto')), 'termo guardado no aparelho, aguardando envio');
  await shot(Wp, 'mon_termo_celular_salvo.png', false);
  await Wp.ctx.setOffline(false); await sync(Wp);
  termos = await ler('TermosPCE');
  const t3 = termos.find(t => t.usuario === W.nome);
  ok(t3 && t3.numero === esperado && t3.numeroOrigem === 'provisorio' && t3.conflito === 0 && t3.cadastroId === cV.id && t3.registroAntigo === 0,
    'sincronizado: termo de campo na planilha, ligado ao cadastro, sem conflito', t3 && [t3.numeroTxt, t3.numeroOrigem, t3.conflito]);
  pr = await imprimir(Wp, () => Wp.evaluate(id => PCEMon.imprimir('termo', id), t3.id));
  ok(/Wellington Soares da Silva · Fiscal Agropecuário Engenheiro Agrônomo · Mat\. 269\.024-1 A · Autazes/.test(pr.texto), 'PDF do termo de campo: identificação do servidor', pr.texto.slice(-300));
  // "Termo aqui" para propriedade sem cadastro: oferece criar
  await Wp.evaluate(() => Store.gravar('propriedades', { id: 'PROP-TESTE', nome: 'Sítio Sem Cadastro', doc: '52998224725', municipio: 'Autazes', lat: -3.6, lon: -59.2, criadoEm: 1, atualizadoEm: 1, pendente: 0 }));
  await Wp.evaluate(() => go('pcetf', { propId: 'PROP-TESTE' })); await Wp.waitForSelector('#mt-criarcad'); await Wp.waitForFunction(() => /52998224725|529\.982/.test(document.querySelector('#mt-doc').value));
  ok(/Sítio|propriedade ainda não tem/.test(await Wp.textContent('#mt-semcad')), 'propriedade sem cadastro: oferece criar');
  await Wp.click('#mt-criarcad'); await Wp.waitForSelector('#monCadForm');
  ok((await Wp.inputValue('#mc-doc')) === '529.982.247-25' && /Ao salvar, volta para o Termo/.test(await Wp.textContent('#monCadForm')), 'cadastro aberto já com o produtor do termo');
  await shot(Wp, 'mon_cadastro_celular.png');
  await Wp.click('[data-mon=descartar]'); await Wp.waitForSelector('#monTfForm');
  ok(true, 'descartar o cadastro volta ao termo (rascunho retomado)');
  await Wp.click('[data-mon=descartar]'); await Wp.waitForSelector('#mon-novo');
  ok(!Wp.err.length, 'sem erros no celular do fiscal', Wp.err);

  /* ================= 8. painel ================= */
  console.log('8) Painel: aba PCE e relatório de atividades');
  const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR' });
  await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
  await c.addInitScript(t => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', 1); localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.painel.token', t);
    localStorage.setItem('gdv.painel.nome', 'Gestor Moniliase Painel'); localStorage.setItem('gdv.painel.aba', 'pce');
    localStorage.setItem('gdv.painel.filtro', JSON.stringify({ preset: 'custom', de: '2026-07-08', ate: '2026-07-10', fiscal: '', local: 'm:Autazes' })); } }, TOK);
  await c.addInitScript(() => { if (window !== window.top) window.print = () => { window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: document.body.innerText.replace(/\s+/g, ' '), paginas: document.querySelectorAll('.a4').length }); }; });
  const pn = await c.newPage(); pn.err = []; pn.on('pageerror', e => pn.err.push(e.message)); pn.on('console', m => m.type() === 'error' && pn.err.push(m.text()));
  await pn.goto(PAINEL); await pn.waitForSelector('#pn-conteudo .pn-pce-kpis .pn-kpi', { timeout: 25000 }); await pn.waitForTimeout(600);
  const kp = await pn.locator('.pn-pce-kpis .pn-kpis').first().evaluate(g => Object.fromEntries([...g.querySelectorAll('.pn-kpi')].map(k => [k.querySelector('.pn-kpi-rot').textContent.trim(), k.querySelector('.pn-kpi-val').textContent.trim()])));
  ok(kp['Termos de fiscalização'] === '2', 'painel: KPI "Termos de fiscalização" = 2 (Autazes, 08–10/07/2026)', kp);
  const corte = await pn.evaluate(() => [...document.querySelectorAll('.pn-pce-kpis .pn-kpi-rot')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
  ok(!corte.length, 'rótulos dos KPIs do PCE sem corte', corte);
  const tab = await pn.locator('.pn-pce-mon').textContent();
  ok(/001\.2026\.AUTAZES/.test(tab) && /002\.2026\.AUTAZES/.test(tab) && !/435\.660\.222-68/.test(tab), 'painel: tabela dos termos (documento mascarado)');
  await pn.locator('.pn-pce-mon').scrollIntoViewIfNeeded(); await shot(pn, 'mon_painel_pce.png');
  await pn.click('#pn-pce-relatorio'); await pn.waitForSelector('#pn-relatorio[open]');
  ok(/2 termo\(s\) · 95 plantas · Educação Sanitária: 1 ação/.test(await pn.textContent('#pn-rel-resumo')), 'painel: resumo do relatório', await pn.textContent('#pn-rel-resumo'));
  await pn.fill('#pn-rel-conv', '00991272/2025'); await pn.fill('#pn-rel-etapa', '1.4'); await pn.fill('#pn-rel-folders', '72');
  await pn.evaluate(() => { window.__prints = []; }); await pn.click('#pn-rel-ok');
  await pn.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 });
  const prp = await pn.evaluate(() => window.__prints[0]);
  ok(/CONVÊNIO Nº 00991272\/2025/.test(prp.texto) && /Termo de Fiscalização emitidos: 02 termos/.test(prp.texto) && /95 plantas/.test(prp.texto) && /distribuição orientada de 72 folders e flyers/.test(prp.texto) && prp.paginas === 5, 'painel: relatório impresso com os anexos', [prp.paginas, prp.texto.slice(0, 200)]);
  const audit = await post({ action: 'painelDados', key: TOK, de: '2026-07-01', ate: '2026-07-31' });
  const aud = (audit.auditoria.termosPce || []).find(a => a.grupo === 'AUTAZES');
  ok(aud && aud.total === (ANO === 2026 ? 3 : 2) && aud.editados.filter(e => e.origem === 'papel').length === 2 && !aud.duplicados.length && !aud.lacunas.length,
    'auditoria da numeração: termos do papel (origem "papel") e o de campo na mesma sequência, sem lacunas nem duplicados', aud);
  ok(!pn.err.length, 'sem erros no painel', pn.err);

  await b.close();
  console.log('FALHOU=' + falhas);
  if (falhas) process.exitCode = 1;
})().catch(e => { console.error('✗ erro:', e); process.exit(1); });
