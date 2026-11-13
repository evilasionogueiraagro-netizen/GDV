const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const PA = require('./lib/pce-app');
// PCE — monilíase: Termo de Fiscalização do PCE (digitado do papel e feito em campo na Nova visita, com as perguntas de detecção e a coordenada da
// planta), ficha oficial da monilíase e Relatório de atividades (app real + Code.gs real no fakegas).
// Dados fictícios no formato do relatório de Autazes (julho/2026): 2 Termos digitados do papel pela estagiária, Termo de campo sem internet,
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
  const gerar = (nome, perfil = '') => perfil === 'admin' ? amb.gerente(nome) : amb.usuario(nome);   // conta pronta e token (atalho /__usuario)
  const UIDS = {}, credencial = async (nome, perm = { veiculos: 1, tf: 1, pce: 1, antigo: 0 }) => { const f = await U.fiscal(nome, { permissoes: U.lista(perm) }); UIDS[f.nome] = f.usuario.id; return { token: f.token, nome: f.nome }; };
  const aparelho = async ({ token, nome }, vp = { width: 1366, height: 800 }) => {
    const c = await b.newContext({ viewport: vp, permissions: ['geolocation'], geolocation: { latitude: -3.60, longitude: -59.15, accuracy: 9 }, acceptDownloads: true });
    await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [token, nome]);
    await c.addInitScript(() => { if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' '), html: d.body.innerHTML, paginas: d.querySelectorAll('.a4').length, titulo: window.top.document.title }); }; });
    const p = await c.newPage(); p.err = []; p.dialogs = [];
    p.on('pageerror', e => p.err.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && p.err.push(m.text()));
    p.on('dialog', d => { p.dialogs.push(d.message()); d.accept(); }); p.ctx = c;
    await p.goto(APP); await p.waitForSelector('#view *', { state: 'attached' }); await p.waitForFunction(() => typeof Sync !== 'undefined' && Sync.ativado()); return p;
  };
  const sim = (p, nome, v) => p.click(`label:has(> input[name="${nome}"][value="${v}"])`);
  const marcar = (p, nome, v) => p.check(`input[name="${nome}"][value="${v}"]`);
  const imprimir = async (p, fn) => { await p.evaluate(() => { window.__prints = []; }); await fn(); await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 }); return p.evaluate(() => window.__prints[0]); };
  const pdfArquivo = async (p, id) => Buffer.from(await p.evaluate(async i => { const f = await PCEMon.imprimir('termo', i, 'arquivo'); const u = new Uint8Array(await f.arrayBuffer()); let s = ''; u.forEach(x => { s += String.fromCharCode(x); }); return btoa(s); }, id), 'base64');
  const paginasPdf = buf => { try { const f = amb.saida('_tmp.pdf'); fs.writeFileSync(f, buf); return Number(execFileSync('python3', ['-c', 'import sys,pypdf;print(len(pypdf.PdfReader(sys.argv[1]).pages))', f]).toString().trim()); } catch (e) { return null; } };
  const sync = async p => { for (let i = 0; i < 25; i++) { await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(400); const n = await p.evaluate(async () => (await Store.todos('termosPce')).filter(x => x.pendente).length + (await Store.todos('propriedades')).filter(x => x.pendente).length); if (!n && await p.evaluate(() => Sync.estado().tipo === 'ok')) return; } throw new Error('sync não terminou'); };

  /* ================= 1. leitura de coordenadas e do número do papel ================= */
  console.log('1) coordenadas por campo e número do papel');
  const adm = await gerar('Gestor Moniliase Painel', 'admin'), TOK = adm.token;
  const E = await credencial('Pessoa Ficticia Delta Estagiaria', { pce: 1 });
  let r = await U.permissoes(UIDS[E.nome], U.lista({ veiculos: 0, tf: 0, pce: 1, antigo: 1 }));
  ok(r.ok && r.permissoes.includes('digitarDoPapel'), 'painel: estagiária com PCE + Digitar do papel');
  const A = await aparelho(E);
  const C = await A.evaluate(() => { const L = PCEMon.lerEixo, N = PCEMon.lerNumeroDoc;
    return { a: L('-3,60033', 'lat'), b: L('-3.60033', 'lat'), c: L('3,60033S', 'lat'), d: L('-59,15044W', 'lon'), e: L('59,15044', 'lon'), f: L(`3°36'01,2"S`, 'lat'),
      g: L('S 3 36 1.2', 'lat'), h: L('3,5N', 'lon'), par: PCEMon.lerPar('-3,60033', '-59,15044W'), fora: PCEMon.lerPar('-15,7', '-47,8'),
      n1: N('001.2026.AUTAZES', 'Autazes', '2026-07-08'), n2: N('001-2026-AUTAZES', 'Autazes', '2026-07-08'), n3: N('1', 'Autazes', '2026-07-08'), n4: N('001/2025/AUTAZES', 'Autazes', '2026-07-08'),
      n5: N('7.2026.MANAUS', 'Autazes', '2026-07-08'), n6: N('Nº 12', 'Autazes', '2026-07-08'), i1: PCEMon.numero('08 anos'), i2: PCEMon.numero('2,5'), i3: PCEMon.numero('1.234') }; });
  ok([C.a, C.b].every(x => x.v === -3.60033) && C.c.v === -3.60033 && C.d.v === -59.15044 && C.e.v === -59.15044 && C.e.oeste, 'lat/lon: "-3,60033", "-3.60033", "3,60033S", "-59,15044W" e "59,15044" (Oeste)', C);
  ok(Math.abs(C.f.v + (3 + 36 / 60 + 1.2 / 3600)) < 1e-6 && Math.abs(C.g.v - C.f.v) < 1e-6 && C.h.erro, 'GMS (3°36\'01,2"S e S 3 36 1.2); hemisfério errado recusado', [C.f, C.g, C.h]);
  ok(C.par.lat === -3.60033 && C.par.lon === -59.15044 && /fora do Amazonas/.test(C.fora.erro || ''), 'par dentro do Amazonas; fora do AM recusado', [C.par, C.fora]);
  ok(C.n1.n === 1 && C.n2.n === 1 && C.n3.n === 1 && C.n3.ano === 2026 && C.n1.unidade === 'AUTAZES' && C.n6.n === 12, 'nº do papel: 001.2026.AUTAZES, 001-2026-AUTAZES, 1, Nº 12', [C.n1, C.n3]);
  ok(/ano/.test(C.n4.erro || '') && /unidade/.test(C.n5.erro || ''), 'nº do papel: ano diferente da data e outra unidade recusados', [C.n4, C.n5]);
  ok(C.i1 === 8 && C.i2 === 2.5 && C.i3 === 1234, 'idade "08 anos" → 8; "2,5" → 2,5; "1.234" → 1234', [C.i1, C.i2, C.i3]);

  /* ================= 2. estagiária digita 2 Termos do papel ================= */
  console.log('2) Termos de Fiscalização digitados do papel (08/07/2026)');
  await A.evaluate(() => Sync.sincronizar()); await A.reload(); await A.waitForFunction(() => typeof Sync !== 'undefined' && Sync.ativado());
  if (!(await A.locator('.modulo').count())) await A.click('nav [data-v=modulos]');
  await A.click('.modulo[data-v=pce]'); await A.waitForSelector('#pceServForm');
  await A.check('#pce-s-digitacao'); await A.click('#pce-s-salvar'); await A.waitForSelector('#campo-novo');
  await A.click('nav [data-v=pcetermos]'); await A.waitForSelector('#mon-novo-papel');
  ok(await A.locator('#pce-rel').count() === 0 && await A.locator('#mon-ir-rel').count() === 1 && await A.locator('#mon-novo').count() === 0, 'lista de Termos: "Digitar do papel" e "Relatório de atividades" (sem Termo de campo para quem só digita)');
  await A.click('#mon-novo-papel'); await A.waitForSelector('#monTfForm.pce-antigo');
  ok(await A.locator('.pce-canvas').count() === 0 && await A.locator('[data-mon=gps]').count() === 0, 'papel: sem assinaturas e sem GPS');
  const servidorPapel = async (p, pref) => { await p.fill(`#${pref}snome`, 'Servidor Ficticio Teste'); await p.selectOption(`#${pref}scargo`, 'Fiscal Agropecuário Engenheiro Agrônomo');
    await p.fill(`#${pref}smatricula`, '000.000-0 A'); await p.selectOption(`#${pref}slotacao`, 'Autazes'); };
  await servidorPapel(A, 'mt-');
  await A.selectOption('#mt-unidade', 'Autazes'); await A.fill('#mt-data', '2026-07-08'); await A.fill('#mt-hora', '14:20'); await A.fill('#mt-numpapel', '001.2026.AUTAZES');
  await A.waitForSelector('#mt-numpapel-st .tf-ok');
  ok(/001\.2026\.AUTAZES/.test(await A.textContent('#mt-numpapel-st')), 'nº do papel conferido na tela', await A.textContent('#mt-numpapel-st'));
  await A.fill('#mt-nome', 'Joao Ficticio Teste'); await A.fill('#mt-doc', '702.815.364-90'); await A.selectOption('#mt-municipio', 'Autazes'); await A.fill('#mt-endereco', 'Rua Ficticia, 100 - Centro');
  await A.fill('#mt-lat', '-3,60033'); await A.fill('#mt-lon', '-59,15044W');
  ok(/-3,60033/.test(await A.textContent('#mt-coord-st')) && /-59,15044/.test(await A.textContent('#mt-coord-st')), 'coordenada do papel convertida', await A.textContent('#mt-coord-st'));
  ok(await A.isChecked('input[name="mt-pragas"][value="Monilíase"]'), 'Monilíase marcada por padrão');
  await A.uncheck('input[name="mt-pragas"][value="Monilíase"]'); ok(await A.isHidden('#mt-negativa'), 'sem Monilíase marcada: sem a frase pronta de "não constatei a monilíase"');
  await marcar(A, 'mt-pragas', 'Monilíase');
  await marcar(A, 'mt-acoes', 'Fiscalização'); await A.click('#mt-negativa');
  ok(await A.locator('#mt-material').count() === 0, 'termo sem "material educativo" (folders só no relatório)');
  await A.fill('#mt-plantas', '75'); await sim(A, 'mt-amostra', 'nao');
  await shot(A, 'mon_termo_pc_preenchido.png');
  await A.click('#mt-salvar-outro'); await A.waitForSelector('#mon-m-ok', { timeout: 15000 });
  ok(/001\.2026\.AUTAZES/.test(await A.textContent('#mon-papel-num')) && /Dentro da sequência|próximo da sequência|maior/.test(await A.textContent('#mon-modal')), 'popup do papel: número e efeito na sequência', await A.textContent('#mon-modal'));
  await A.click('#mon-m-ok');
  await A.waitForFunction(() => document.querySelector('#mt-numpapel') && document.querySelector('#mt-numpapel').value === '' && !document.querySelector('#mon-modal'), null, { timeout: 15000 });
  ok((await A.inputValue('#mt-snome')) === 'Servidor Ficticio Teste' && (await A.inputValue('#mt-data')) === '2026-07-08' && (await A.inputValue('#mt-municipio')) === 'Autazes', '"Salvar e digitar outro": mantém servidor, data e município');
  await A.fill('#mt-numpapel', '2'); await A.fill('#mt-hora', '15:50'); await A.fill('#mt-nome', 'Maria Ficticia Teste'); await A.fill('#mt-doc', '391.246.587-82'); await A.fill('#mt-plantas', '20');
  await A.fill('#mt-lat', '-3,70011'); await A.fill('#mt-lon', '-59,10022W'); await marcar(A, 'mt-acoes', 'Fiscalização'); await marcar(A, 'mt-acoes', 'Educação Sanitária'); await A.click('#mt-negativa');
  await A.click('#mt-salvar'); await A.waitForSelector('#mon-m-ok', { timeout: 15000 }); await A.click('#mon-m-ok'); await A.waitForSelector('#mon-pronto', { timeout: 15000 });
  ok((await A.textContent('#mon-pronto-num')).trim() === '002.2026.AUTAZES', 'nº "2" do papel gravado como 002.2026.AUTAZES');
  // número repetido: recusado
  await A.evaluate(() => go('pcetf', { antigo: true })); await A.waitForSelector('#monTfForm.pce-antigo');
  await A.fill('#mt-snome', 'Servidor Ficticio Teste'); await A.dispatchEvent('#mt-snome', 'change'); await A.selectOption('#mt-unidade', 'Autazes');
  await A.fill('#mt-data', '2026-07-09'); await A.fill('#mt-hora', '09:00'); await A.fill('#mt-numpapel', '001.2026.AUTAZES'); await A.fill('#mt-nome', 'Outra Pessoa');
  await A.selectOption('#mt-municipio', 'Autazes'); await marcar(A, 'mt-acoes', 'Fiscalização');
  await A.click('#mt-salvar'); await A.waitForFunction(() => /já está/.test(document.querySelector('#toast').textContent));
  ok(/já está/.test(await A.textContent('#toast')) && await A.locator('#mon-modal').count() === 0, 'nº do papel já usado: recusado com aviso', await A.textContent('#toast'));
  await A.click('[data-mon=descartar]'); await A.waitForSelector('#mon-novo-papel');
  let termos = await ler('TermosPCE');
  const t1 = termos.find(t => t.numero === 1), t2 = termos.find(t => t.numero === 2);
  ok(termos.length === 2 && t1 && t2 && t1.numeroTxt === '001.2026.AUTAZES' && t2.numeroTxt === '002.2026.AUTAZES' && t1.numeroOrigem === 'papel' && t1.unidade === 'AUTAZES' && !t1.visitaId,
    'planilha (TermosPCE): 2 termos com os números do papel (numeroOrigem = papel, sem visitaId)', termos.map(t => [t.numeroTxt, t.numeroOrigem]));
  ok(t1.propriedadeId && t2.propriedadeId && t1.propriedadeId !== t2.propriedadeId && t1.servidor === 'Servidor Ficticio Teste' && t1.usuario === E.nome, 'cada Termo leva a propriedade do interessado e quem digitou');
  ok(Number(t1.lat) === -3.60033 && Number(t1.lon) === -59.15044 && t1.data === '2026-07-08' && t1.hora === '14:20' && t1.plantasInspecionadas === 75 && t2.plantasInspecionadas === 20 && !('materialEducativo' in t1),
    'termo: coordenadas -3,60033 / -59,15044W, data/hora e plantas inspecionadas', [t1.lat, t1.lon, t1.plantasInspecionadas, t2.plantasInspecionadas]);
  ok(JSON.parse(t1.pragas).join() === 'Monilíase' && JSON.parse(t1.acoes).join() === 'Fiscalização' && /Não constatei a presença da monilíase/.test(t1.constatacao), 'praga, ação e constatação');

  /* ================= 3. PDFs ================= */
  console.log('3) PDFs: Termo (impressão e arquivo gerado no aparelho)');
  const idT1 = t1.id;
  await A.click('nav [data-v=pcetermos]'); await A.waitForSelector('#pceTItens .item');
  let pr = await imprimir(A, () => A.evaluate(id => PCEMon.imprimir('termo', id), idT1));
  ok(/TERMO DE FISCALIZAÇÃO Nº 001/.test(pr.texto) && new RegExp(`${ANO} Ano - AUTAZES Unidade`).test(pr.texto) && /JOAO FICTICIO TESTE/.test(pr.texto) && /702\.815\.364-90/.test(pr.texto) && /-3,60033/.test(pr.texto)
    && /Não constatei a presença da monilíase/.test(pr.texto) && /1ª via: Interessado/.test(pr.texto) && pr.paginas === 1, 'PDF do termo: número, interessado, CPF, coordenadas, constatação, vias (1 folha)', pr.texto.slice(0, 500));
  ok(/data-c="programaTxt">[^<]*Monilíase/.test(pr.html) && /class="cx on" data-x="acoes=Fiscalização"/.test(pr.html) && !/class="cx on" data-x="acoes=Levantamento"/.test(pr.html), 'programa/praga Monilíase no quadro e caixa Fiscalização marcada');
  const pdfT = await pdfArquivo(A, idT1);
  salvar('mon_termo_001.2026.AUTAZES.pdf', pdfT);
  ok(pdfT.slice(0, 5).toString() === '%PDF-' && pdfT.length > 30000, 'PDF gerado no aparelho', pdfT.length);
  const np = paginasPdf(pdfT); if (np != null) ok(np === 1, 'pypdf: termo com 1 página', np);

  /* ================= 4. relatório de atividades ================= */
  console.log('4) Relatório de atividades 08–10/07/2026, Autazes');
  await A.click('nav [data-v=pcetermos]'); await A.click('#mon-ir-rel'); await A.waitForSelector('#monRelForm');
  await A.fill('#mr-de', '2026-07-08'); await A.fill('#mr-ate', '2026-07-10'); await A.selectOption('#mr-mun', 'Autazes');
  await A.waitForFunction(() => document.querySelector('#mr-ntermos') && /^02 termos/.test(document.querySelector('#mr-ntermos').textContent));
  ok((await A.textContent('#mr-ntermos')) === '02 termos.' && (await A.textContent('#mr-plantas')) === '95 plantas' && (await A.textContent('#mr-folders')) === '1 ação(ões)',
    'prévia: TFs emitidos = 2, plantas = 75 + 20, Educação Sanitária = 1 termo com a ação (sem folders digitados)', [await A.textContent('#mr-ntermos'), await A.textContent('#mr-plantas'), await A.textContent('#mr-folders')]);
  ok(await A.evaluate(() => PCEDocs.calcularRelatorio([{ id: 'x', data: '2026-07-08', acoes: '["Fiscalização"]' }], [], {}).textos.educacao) === 'não realizada', 'sem ação de Educação Sanitária e sem folders: "não realizada"');
  await A.fill('#mr-folders-n', '72'); await A.waitForFunction(() => /72 folders/.test(document.querySelector('#mr-folders').textContent));
  ok((await A.textContent('#mr-folders')) === '1 ação(ões); distribuição orientada de 72 folders e flyers', 'folders digitados na geração do relatório', await A.textContent('#mr-folders'));
  await A.fill('#mr-conv', '00991272/2025'); await A.fill('#mr-etapa', '1.4');
  await A.fill('#mr-servs', 'Servidor Ficticio Teste - Coordenador de Unidade\nMotorista Ficticio Teste - Motorista'); await A.fill('#mr-resp', 'Servidor Ficticio Teste - Coordenador de Unidade');
  await A.fill('#mr-desl', 'Manaus/AM x Autazes/AM x Manaus/AM');
  ok((await A.inputValue('#mr-local')) === 'Autazes/AM' && /Monilíase/.test(await A.inputValue('#mr-obj')), 'local e objetivo sugeridos');
  await shot(A, 'mon_relatorio_pc_form.png');
  pr = await imprimir(A, () => A.click('#mr-imprimir'));
  ok(/CONVÊNIO Nº 00991272\/2025/.test(pr.texto) && /ETAPA 1\.4/.test(pr.texto) && /Motorista Ficticio Teste - Motorista/.test(pr.texto) && /Período: 08\/07\/2026 a 10\/07\/2026/.test(pr.texto)
    && /Local: Autazes\/AM/.test(pr.texto) && /Plantas inspecionadas: 95 plantas/.test(pr.texto) && /Educação Sanitária: 1 ação\(ões\); distribuição orientada de 72 folders e flyers/.test(pr.texto)
    && /Termo de Fiscalização emitidos: 02 termos/.test(pr.texto) && /Não houve coleta de amostra/.test(pr.texto) && /Deslocamento: Manaus\/AM x Autazes\/AM x Manaus\/AM/.test(pr.texto),
    'relatório: convênio, etapa, servidores, período, local, plantas, educação sanitária (ações + folders), termos emitidos', pr.texto.slice(0, 900));
  ok(pr.paginas === 3 && (pr.html.match(/class="a4 [^"]*termo[^"]*"/g) || []).length === 2, 'relatório com os 2 Termos anexados (3 folhas, sem fichas ligadas)', [pr.paginas, (pr.html.match(/class="a4 [^"]*"/g) || [])]);
  ok(/Nº dos termos: 001\/2026; 002\/2026\)/.test(pr.texto) && /Hospedeiros Inspecionados:/.test(pr.texto) && /Levantamentos Fitossanitário da praga Monilíase, realizou-se/.test(pr.texto) && /SEPROR\/AM/.test(pr.texto),
    'relatório no modelo do levantamento: números dos Termos, frase do programa e rodapé na folha', pr.texto.slice(0, 1200));
  const gen = await A.evaluate(() => {
    const t = (id, o) => ({ id, data: '2026-07-08', numero: 1, ano: 2026, acoes: '[]', hospedeiros: '["Laranja"]', ...o });
    const termos = [t('a', { pragas: '["HLB"]' }), t('b', { pragas: '[]', programaVisita: 'Pragas dos Citros', numero: 2 }), t('c', { pragas: '["Monilíase"]', numero: 3 }), t('d', { pragas: '[]', programa: 'citros', numero: 4 })];
    const c = PCEDocs.calcularRelatorio(termos, [], { programa: 'citros' });
    return { ids: c.termos.map(x => x.id).join(''), hosp: c.textos.hospedeiros, nums: c.textos.numeros, obj: PCEDocs.objetivoRelatorio({ programa: 'citros' }), progs: PCEDocs.programasRelatorio().length,
      ops: [...document.querySelectorAll('#mr-praga option')].length };
  });
  ok(gen.ids === 'abd' && gen.hosp === 'Laranja' && gen.nums === '(Nº dos termos: 001/2026; 002/2026; 004/2026)' && /detecção das pragas dos Citros, visando/.test(gen.obj) && gen.progs === 6 && gen.ops === 6,
    'relatório genérico por programa: o mesmo cálculo e os mesmos textos, só o nome muda (Termo entra pela caixa de praga, pelo nome do programa ou pelo modelo)', gen);
  await A.evaluate(() => { window.__pdfRel = null; PDF.baixar = f => { window.__pdfRel = f; }; });
  await A.click('#mr-arquivo'); await A.waitForFunction(() => window.__pdfRel, null, { timeout: 60000 });
  const pdfR = Buffer.from(await A.evaluate(async () => { const u = new Uint8Array(await window.__pdfRel.arrayBuffer()); let s = ''; u.forEach(x => { s += String.fromCharCode(x); }); return btoa(s); }), 'base64');
  salvar('mon_relatorio_autazes_2026-07.pdf', pdfR);
  ok(pdfR.slice(0, 5).toString() === '%PDF-', 'PDF do relatório gerado no aparelho', pdfR.length);
  const npR = paginasPdf(pdfR); if (npR != null) ok(npR === 3, 'pypdf: relatório + 2 anexos = 3 páginas', npR);
  await A.evaluate(() => go('pcetermos')); await A.evaluate(() => go('pcerel')); await A.waitForSelector('#monRelForm');
  ok((await A.inputValue('#mr-folders-n')) === '', 'nº de folders não é lembrado');
  ok((await A.inputValue('#mr-conv')) === '00991272/2025' && (await A.inputValue('#mr-etapa')) === '1.4' && /Motorista Ficticio/.test(await A.inputValue('#mr-servs')), 'convênio, etapa e servidores lembrados');
  ok(!A.err.length, 'sem erros no app da estagiária', A.err);

  /* ================= 5. permissão "Digitar do papel" ================= */
  console.log('5) permissão Papel');
  const W = await credencial('Servidor Ficticio Teste');
  const idx = require('crypto').randomUUID();
  r = await post({ action: 'sync', key: W.token, since: Date.now(), termosPce: [{ id: idx, unidade: 'AUTAZES', ano: 2026, numero: 50, data: '2026-07-01', hora: '08:00', nome: 'X', registroAntigo: 1, criadoEm: 1, atualizadoEm: 1 }] });
  ok(r.ok && (r.recusados.termosPce || []).includes(idx) && !(await ler('TermosPCE')).some(t => t.id === idx), 'sync sem permissão: termo do papel recusado (fica no aparelho)');
  r = await post({ action: 'pceDocRegistrar', key: W.token, tipo: 'cadastro', registro: { id: idx, unidade: 'AUTAZES', ano: 2026, numero: 9, registroAntigo: 1 } });
  ok(!r.ok && r.erro === SEM_ANT && r.semPermissao === 'antigo', 'pceDocRegistrar: ficha do papel recusada sem permissão', r.erro);
  r = await post({ action: 'pceDocNumero', key: W.token, tipo: 'termo', unidade: 'Autazes', ano: 2026 });
  ok(r.ok && r.ultimo === 2 && r.proximo === 3 && r.ultimoReg && r.ultimoReg.numeroTxt === '002.2026.AUTAZES', 'próximo nº do termo em Autazes/2026 = 003 (papel conta na sequência)', r);

  /* ================= 6. fiscal em campo: visita de monilíase sem internet ================= */
  console.log('6) Nova visita de monilíase em campo (celular 360 px, sem internet): perguntas de detecção e coordenada da planta');
  const Wp = await aparelho(W, { width: 360, height: 760 });
  await Wp.evaluate(() => Store.setMeta('pceServidor', { nome: 'Servidor Ficticio Teste', cargo: 'Fiscal Agropecuário Engenheiro Agrônomo', matricula: '000.000-0 A', lotacao: 'Autazes' }));
  await Wp.click('nav [data-v=modulos]').catch(() => {}); await Wp.waitForSelector('.modulo[data-v=pce]'); await Wp.click('.modulo[data-v=pce]'); await Wp.waitForSelector('#campo-novo');
  await PA.novoProdutor(Wp, { doc: '529.982.247-25', nome: 'Sebastiao Ficticio', propriedade: 'Sitio Ficticio Cacau', codigo: 'PRP-MON-1', municipio: 'Autazes', frutos: [{ cultura: 'Cacau', cultivar: 'Comum', area: 3, quantidade: 120 }] });
  await sync(Wp);
  ok((await ler('Propriedades')).some(p => p.id === 'PRP-MON-1' && JSON.parse(p.frutos).length === 1), 'planilha: propriedade de Autazes com o fruto Cacau');
  await Wp.ctx.setOffline(true); await Wp.evaluate(() => window.dispatchEvent(new Event('offline')));
  await Wp.locator('#pce-novavisita').click(); await Wp.waitForSelector('#pceVisitaForm');
  ok(await Wp.locator('label.vi-fruto').count() === 1, 'a visita oferece os frutos do cadastro (sem internet)');
  await shot(Wp, 'mon_visita_celular_passo1.png', false);
  await Wp.locator('label.vi-fruto', { hasText: 'Cacau' }).locator('input').check(); await Wp.click('#vi-continuar'); await Wp.waitForSelector('.pce-pr');
  await Wp.locator('.pce-pr[data-nome="Monilíase do Cacaueiro"] .pce-res-detectada').click();
  await Wp.click('#vi-continuar'); await Wp.waitForSelector('.v-plantas');
  const cac = PA.bloco(Wp, 'Cacau');
  ok(await cac.locator('.vi-deteccao').count() === 1, 'perguntas de detecção da monilíase aparecem quando a praga é detectada');
  const enun = await cac.locator('.vi-deteccao').textContent();
  ok(/Câmara Úmida/i.test(enun) && /hospedeiro suspeito/i.test(enun) && /coordenada/i.test(enun), 'perguntas: câmara úmida, hospedeiro suspeito e coordenada da planta', enun.replace(/\s+/g, ' ').slice(0, 300));
  await cac.locator('input[id$=sintomaLat]').fill('15,7S'); await cac.locator('input[id$=sintomaLon]').fill('47,8W');
  await Wp.click('#vi-continuar'); await Wp.waitForFunction(() => /fora do Amazonas/.test(document.querySelector('#toast').textContent));
  ok(true, 'coordenada da planta fora do Amazonas recusada');
  await cac.locator('input[id$=sintomaLat]').fill(`3°36'01,2"S`); await cac.locator('input[id$=sintomaLon]').fill(`59°09'01,6"W`);
  await cac.locator('fieldset[data-k=camaraUmida] label:has(input[value=sim])').click(); await cac.locator('fieldset[data-k=camaraMr] label:has(input[value=sim])').click(); await cac.locator('input[name$=suspeitos][value=cacau]').check();
  await cac.locator('.v-plantas').fill('120');
  await shot(Wp, 'mon_visita_celular_passo3.png', false);
  await Wp.click('#vi-continuar'); await Wp.waitForSelector('#vi-local');
  await Wp.click('#vi-continuar'); await Wp.waitForSelector('#vi-resumo');
  await Wp.click('#vi-concluir'); await Wp.waitForSelector('#pce-visita-pronta', { timeout: 20000 });
  const nCampo = await Wp.locator('.pce-termo-pronto .tf-num-inline').first().textContent();
  const esperado = ANO === 2026 ? `003.${ANO}.AUTAZES` : `001.${ANO}.AUTAZES`;
  ok(nCampo === esperado && /Aguardando envio \/ número provisório/.test(await Wp.textContent('#pce-visita-pronta')), `sem internet: número provisório ${esperado} (último conhecido + 1), aguardando envio`, nCampo);
  await shot(Wp, 'mon_termo_celular_salvo.png', false);
  const tCampo = await Wp.evaluate(async () => (await Store.todos('termosPce')).find(t => t.visitaId));
  const cult = JSON.parse(tCampo.culturas)[0];
  ok(tCampo.provisorio === 1 && tCampo.numeroOrigem === 'provisorio' && tCampo.unidade === 'AUTAZES' && tCampo.programaVisita === 'Monilíase do Cacaueiro e Cupuaçuzeiro' && tCampo.propriedadeId === 'PRP-MON-1', 'Termo de campo: provisório, unidade da lotação, programa da monilíase e propriedade do cadastro');
  ok(cult.cultura === 'Cacau' && cult.pragas[0].resultado === 'detectada' && cult.dados.camaraUmida === 'sim' && cult.dados.camaraMr === 'sim' && cult.dados.suspeitos === '["cacau"]' && Math.abs(Number(cult.dados.sintomaLat) - -(3 + 36 / 60 + 1.2 / 3600)) < 1e-6 && Math.abs(Number(cult.dados.sintomaLon) - -(59 + 9 / 60 + 1.6 / 3600)) < 1e-6,
    'respostas de detecção no Termo (culturas[].dados): câmara úmida (e comportamento do fungo), hospedeiro e coordenada da planta convertida do GMS', cult.dados);
  ok(Number(tCampo.lat) === -3.6 && Number(tCampo.lon) === -59.15 && tCampo.plantasInspecionadas === 120 && tCampo.sintomas === 'sim', 'coordenada do GPS do aparelho, plantas inspecionadas (120) e sintomas (sim pela detecção)', [tCampo.lat, tCampo.lon, tCampo.plantasInspecionadas, tCampo.sintomas]);
  await Wp.ctx.setOffline(false); await Wp.evaluate(() => window.dispatchEvent(new Event('online'))); await sync(Wp);
  termos = await ler('TermosPCE');
  const t3 = termos.find(t => t.usuario === W.nome);
  ok(t3 && t3.numero === (ANO === 2026 ? 3 : 1) && t3.numeroOrigem === 'provisorio' && Number(t3.conflito) === 0 && t3.visitaId === tCampo.visitaId && !Number(t3.registroAntigo), 'sincronizado: Termo de campo na planilha, com visitaId, sem conflito e fora do papel', t3 && [t3.numeroTxt, t3.numeroOrigem, t3.conflito]);
  ok(JSON.parse(t3.culturas)[0].dados.camaraUmida === 'sim' && JSON.parse(t3.culturas)[0].dados.suspeitos === '["cacau"]', 'planilha: respostas de detecção guardadas no Termo');
  pr = await imprimir(Wp, () => Wp.locator('.pce-termo-pronto [data-mon=imprimir]').first().click());
  ok(/Servidor Ficticio Teste · Fiscal Agropecuário Engenheiro Agrônomo · Mat\. 000\.000-0 A · Autazes/.test(pr.texto) && !/Constatei a presença/.test(pr.texto), 'PDF do Termo de campo: identificação do servidor e sem frase pronta de constatação', pr.texto.slice(-300));
  const cxCampo = PA.caixasDoTermo(pr.html);
  ok(cxCampo.length === 1 && cxCampo[0].linha === 'Monilíase (Cacau):' && cxCampo[0].marcadas.join() === 'Presença' && cxCampo[0].caixas.join() === 'Presença,Ausência,Suspeita', 'PDF do Termo de campo: Monilíase em Presença (obrigatória, com a caixa Suspeita)', cxCampo);
  const pAut = await Wp.evaluate(async () => { await Campo.baixar(['Autazes']); return (await Store.todos('propriedades')).filter(p => p.campoMun).map(p => ({ id: p.id, ult: p.ultimoTermoPce && p.ultimoTermoPce.numeroTxt })); });
  ok(pAut.some(p => p.id === 'PRP-MON-1' && p.ult === t3.numeroTxt), '"Dados para o campo": a propriedade baixada traz o último Termo de fiscalização', pAut);

  console.log('6b) ficha oficial da monilíase lê as respostas de detecção da visita');
  await Wp.evaluate(() => go('pceprodutor', '52998224725')); await Wp.waitForSelector('#pce-produtor');
  await Wp.locator('.pce-visita-termo[data-modelo=moniliase] [data-cad=ficha]').click(); await Wp.waitForSelector('#pceFichaForm');
  const perg = await Wp.locator('#pceFichaForm').textContent();
  ok(!/Câmara Úmida/.test(perg) && !/HOSPEDEIRO SUSPEITO/.test(perg) && !/coordenada da planta/.test(perg), 'a ficha não pergunta de novo o que a visita respondeu (câmara úmida, hospedeiro, coordenada)', perg.replace(/\s+/g, ' ').slice(0, 1500));
  await Wp.click('#fi-salvar'); await Wp.waitForSelector('#pce-produtor');
  const pf = await PA.imprimir(Wp, '.pce-visita-termo[data-modelo=moniliase] [data-cad=pdfficha]');
  ok(/FICHA DE CADASTRO E LEVANTAMENTO DE CACAU E CUPUAÇU/.test(pf.texto) && /Sebastiao Ficticio|SEBASTIAO FICTICIO/i.test(pf.texto) && /Sitio Ficticio Cacau/.test(pf.texto), 'PDF da ficha da monilíase: título, produtor e propriedade', pf.texto.slice(0, 300));
  ok(/-3,600333|-3,6003/.test(pf.texto) && /-59,150444|-59,1504/.test(pf.texto), 'PDF da ficha: coordenada da planta com sintomas vinda da visita', pf.texto.replace(/\s+/g, ' ').slice(0, 1200));
  await shot(Wp, 'mon_lista_pce_celular.png', false);
  ok(!Wp.err.length, 'sem erros no celular do fiscal', Wp.err);

  /* ================= 7. painel ================= */
  console.log('7) Painel: aba PCE e relatório de atividades');
  const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR' });
  await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
  await c.addInitScript(t => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', 1); localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.painel.token', t);
    localStorage.setItem('gdv.painel.nome', 'Gestor Moniliase Painel'); localStorage.setItem('gdv.painel.aba', 'pce');
    localStorage.setItem('gdv.painel.filtro', JSON.stringify({ preset: 'custom', de: '2026-07-08', ate: '2026-07-10', fiscal: '', local: 'm:Autazes' })); } }, TOK);
  await c.addInitScript(() => { if (window !== window.top) window.print = () => { window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: document.body.innerText.replace(/\s+/g, ' '), paginas: document.querySelectorAll('.a4').length }); }; });
  const pn = await c.newPage(); pn.err = []; pn.on('pageerror', e => pn.err.push(e.message)); pn.on('console', m => m.type() === 'error' && pn.err.push(m.text()));
  await pn.goto(PAINEL); await pn.waitForSelector('#pn-conteudo .pn-pce-kpis .pn-kpi', { timeout: 25000 });
  const kp = await pn.locator('.pn-pce-kpis .pn-kpis').first().evaluate(g => Object.fromEntries([...g.querySelectorAll('.pn-kpi')].map(k => [k.querySelector('.pn-kpi-rot').textContent.trim(), k.querySelector('.pn-kpi-val').textContent.trim()])));
  ok(kp['Termos de fiscalização'] === '2', 'painel: KPI "Termos de fiscalização" = 2 (Autazes, 08–10/07/2026)', kp);
  const corte = await pn.evaluate(() => [...document.querySelectorAll('.pn-pce-kpis .pn-kpi-rot')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
  ok(!corte.length, 'rótulos dos KPIs do PCE sem corte', corte);
  const tab = await pn.locator('.pn-pce-mon').textContent();
  ok(/001\.2026\.AUTAZES/.test(tab) && /002\.2026\.AUTAZES/.test(tab) && !/702\.815\.364-90/.test(tab), 'painel: tabela dos termos (documento mascarado)');
  await pn.locator('.pn-pce-mon').scrollIntoViewIfNeeded(); await shot(pn, 'mon_painel_pce.png');
  await pn.click('#pn-pce-relatorio'); await pn.waitForSelector('#pn-relatorio[open]');
  await pn.waitForFunction(() => /2 termo\(s\)/.test(document.querySelector('#pn-rel-resumo').textContent));
  ok(/2 termo\(s\) · 95 plantas · Educação Sanitária: 1 ação/.test(await pn.textContent('#pn-rel-resumo')), 'painel: resumo do relatório', await pn.textContent('#pn-rel-resumo'));
  await pn.fill('#pn-rel-conv', '00991272/2025'); await pn.fill('#pn-rel-etapa', '1.4'); await pn.fill('#pn-rel-folders', '72');
  await pn.evaluate(() => { window.__prints = []; }); await pn.click('#pn-rel-ok');
  await pn.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 });
  const prp = await pn.evaluate(() => window.__prints[0]);
  ok(/CONVÊNIO Nº 00991272\/2025/.test(prp.texto) && /Termo de Fiscalização emitidos: 02 termos/.test(prp.texto) && /95 plantas/.test(prp.texto) && /distribuição orientada de 72 folders e flyers/.test(prp.texto) && prp.paginas === 3, 'painel: relatório impresso com os anexos', [prp.paginas, prp.texto.slice(0, 200)]);
  const audit = await post({ action: 'painelDados', key: TOK, de: '2026-07-01', ate: '2026-12-31' });
  const aud = (audit.auditoria.termosPce || []).find(a => a.grupo === 'AUTAZES');
  ok(aud && aud.total === (ANO === 2026 ? 3 : 2) && aud.editados.filter(e => e.origem === 'papel').length === 2 && !aud.duplicados.length && !aud.lacunas.length,
    'auditoria da numeração: termos do papel (origem "papel") e o de campo na mesma sequência, sem lacunas nem duplicados', aud);
  ok(!pn.err.length, 'sem erros no painel', pn.err);

  await b.close();
  console.log('FALHOU=' + falhas);
  if (falhas) process.exitCode = 1;
})().catch(e => { console.error('✗ erro:', e); process.exit(1); });
