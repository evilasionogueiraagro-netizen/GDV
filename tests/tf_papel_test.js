const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// TF antigo (digitado do papel, permissão "Digitar do papel"): app real (Chromium) + Code.gs real (fakegas). Dados fictícios.
// Confere: botão só com a permissão; formulário do papel (sem data/hora de agora, servidor digitado, fiscalizado opcional, PDF no lugar de
// fotos/assinaturas); gravação com o nº do papel (numeroOrigem "papel", registroAntigo, pdfs) e o PDF no Drive; a sequência da barreira
// continua do maior número; número já usado, data no futuro, ano ≠ data e falta da permissão recusados pelo servidor; e que a carga do
// relatório de plantão com o mesmo nº/placa passa a contar pelo TF (sem contar duas vezes no VIGIFITO).
const crypto = require('crypto');
const PORTAL = require('./lib/portal');
const { API, APP } = amb;
const get = p => fetch(API + p).then(r => r.json());
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const ler = async aba => (await get('/__fn?nome=lerLeitura_&args=' + encodeURIComponent(JSON.stringify([aba])))).r;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 600))); if (!c) falhas++; };
const diaManaus = ms => new Date(ms - 4 * 3600e3).toISOString().slice(0, 10);
const ONTEM = diaManaus(Date.now() - 86400e3), AMANHA = diaManaus(Date.now() + 86400e3), ANO = Number(ONTEM.slice(0, 4));
const pdfBuf = () => Buffer.from('%PDF-1.4\n% tf do papel ficticio\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

(async () => {
  const b = await amb.lancar();
  try {
    const gerar = async (nome, perfil = '') => perfil === 'admin' ? amb.gerente(nome) : amb.usuario(nome);   // conta pronta e token (atalho /__usuario)
    const UIDS = {}, credencial = async (nome, perm = { veiculos: 1, tf: 1, pce: 1, antigo: 0 }) => { const f = await U.fiscal(nome, { permissoes: U.lista(perm) }); UIDS[f.nome] = f.usuario.id; return { token: f.token, nome: f.nome }; };
    const aparelho = async ({ token, nome }) => {
      const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
      await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [token, nome]);
      const p = await c.newPage(); p.err = []; p.dialogs = [];
      p.on('pageerror', e => p.err.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && p.err.push(m.text()));
      p.on('dialog', d => { p.dialogs.push(d.message()); d.accept(); }); p.ctx = c;
      await p.goto(APP); await p.waitForSelector('#view *', { state: 'attached' }); await p.waitForTimeout(700); return p;
    };
    const sync = async p => { for (let i = 0; i < 30; i++) { await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(400); if (await p.evaluate(async () => Sync.estado().tipo === 'ok' && !(await Sync.arquivosPendentes()).length)) return; } throw new Error('sync não terminou'); };
    const irTF = async p => { if (!(await p.locator('.modulo').count())) await p.click('nav [data-v=modulos]'); await p.click('.modulo[data-v=tf]'); await p.waitForSelector('button[data-tf=novo]'); };

    const adm = await gerar('Gestora Ficticia Teste', 'admin'), TOK = adm.token;
    const F = await credencial('Digitadora Ficticia Teste'), G = await credencial('Fiscal Sem Papel Teste');

    console.log('1) sem a permissão "Digitar do papel": sem botão e o servidor recusa');
    let P = await aparelho(F); await irTF(P);
    ok(!(await P.locator('#tf-novoantigo').count()), 'sem a permissão, a lista de TFs não mostra "TF antigo (digitar do papel)"');
    await P.ctx.close();
    const tfBase = (extra = {}) => ({ id: crypto.randomUUID(), barreira: 'BVA-CEASA', ano: ANO, numero: 700, numeroTxt: `0700/${ANO} - BVA - CEASA`, data: ONTEM, hora: '10:00',
      fiscal: 'Fulano Ficticio Teste', local: 'BVA - CEASA', placa: 'ABC1D23', nome: 'NÃO IDENTIFICADO', doc: '', procedimento: 'apreensao', produtos: '["LARANJA - 2 Kg"]',
      registroAntigo: 1, numeroOrigem: 'papel', pdfs: '[]', fotos: '[]', assinaturas: '{}', cancelado: 0, criadoEm: Date.now(), atualizadoEm: Date.now(), ...extra });
    let r = await post({ action: 'tfEmitir', key: G.token, tf: tfBase() });
    ok(!r.ok && r.semPermissao === 'antigo', 'tfEmitir de TF do papel sem "Digitar do papel": recusado', r);
    r = await post({ action: 'arquivoEnviar', key: G.token, arquivo: { id: crypto.randomUUID(), dono: 'tfs', donoId: 'x', tipo: 'documento', papel: '', mime: 'application/pdf' }, base64: pdfBuf().toString('base64') });
    ok(!r.ok && r.semPermissao === 'antigo', 'PDF de TF sem "Digitar do papel": recusado', r);
    r = await U.permissoes(UIDS[F.nome], U.lista({ veiculos: 1, tf: 1, pce: 1, antigo: 1 }));
    ok(r.ok && r.permissoes.includes('digitarDoPapel') && r.permissoes.includes('termoDeBarreira'), 'painel: TF + PCE + Digitar do papel para a digitadora', r);
    r = await post({ action: 'tfEmitir', key: F.token, tf: tfBase({ data: AMANHA }) });
    ok(!r.ok && /futuro/.test(r.erro), 'TF do papel com data no futuro: recusado', r.erro);
    r = await post({ action: 'tfEmitir', key: F.token, tf: tfBase({ ano: ANO - 1 }) });
    ok(!r.ok && /ano/.test(r.erro), 'TF do papel com ano do número ≠ ano da data: recusado', r.erro);

    console.log('2) app: formulário do papel e gravação');
    P = await aparelho(F); await P.evaluate(() => Sync.sincronizar()); await P.waitForTimeout(1500); await P.reload(); await P.waitForTimeout(700);
    await irTF(P);
    ok(await P.locator('#tf-novoantigo').count() === 1, 'com a permissão: botão "📄 TF antigo (digitar do papel)" na lista');
    await P.click('#tf-novoantigo'); await P.waitForSelector('#tfForm.tf-papel');
    await P.waitForFunction(() => document.querySelector('#tf-num') && !/Consultando/.test(document.querySelector('#tf-num-dica').textContent), null, { timeout: 10000 });
    ok((await P.inputValue('#tf-data')) === '' && (await P.inputValue('#tf-hora')) === '' && (await P.inputValue('#tf-num')) === '', 'papel: data, hora e nº vêm vazios (nada de "agora" nem nº sugerido)');
    ok(await P.locator('#tf-pdfs').count() === 1 && !(await P.locator('#tf-ass-card').count()) && !(await P.locator('#tf-fotos').count()), 'papel: campo de PDF no lugar de fotos e assinaturas');
    await P.fill('#tf-data', ONTEM); await P.dispatchEvent('#tf-data', 'change'); await P.waitForTimeout(400);
    await P.fill('#tf-hora', '07:33'); await P.fill('#tf-num', '543');
    await P.fill('#tf-servidor', 'Fulano Ficticio Teste'); await P.fill('#tf-local', 'BVA - JUNDIÁ');
    await P.fill('#tf-placa', 'ABC1D25'); await P.fill('#tf-origem', 'BOA VISTA'); await P.fill('#tf-destino', 'MANAUS');
    await P.selectOption('#tf-ufOrigem', 'RR'); await P.selectOption('#tf-ufDestino', 'AM');
    await P.check('#tf-inspecao'); await P.check('input[name=tf-proc][value=apreensao]');
    await P.selectOption('#tf-produtos .prod select >> nth=0', 'LARANJA'); await P.fill('#tf-produtos .prod input', '17.3');
    await P.setInputFiles('#tf-pdfs', { name: 'TF_0543_ficticio.pdf', mimeType: 'application/pdf', buffer: pdfBuf() });
    await P.waitForSelector('#tf-pdfs-lista .pce-doc');
    await P.screenshot({ path: amb.saida('tf_papel_form.png'), fullPage: true });
    await P.click('#tfForm button[type=submit]');
    await P.waitForSelector('text=TF do papel gravado', { timeout: 15000 });
    ok(P.dialogs.some(d => /Gravar o TF 0543\/\d{4} .*digitado do papel/.test(d) && /continua a partir dele/.test(d) && /0544/.test(d)), 'confirmação mostra o número e que a sequência da barreira continua dele', P.dialogs);
    ok(/Digitado do papel/.test(await P.textContent('#tf-papel-info')) && await P.locator('#tf-pdfs-pronto .pce-doc').count() === 1, 'tela do TF: "Digitado do papel", servidor e o PDF');
    await sync(P);
    const tf = (await ler('TFs')).find(t => t.numero === 543);
    ok(tf && tf.registroAntigo === 1 && tf.numeroOrigem === 'papel' && tf.fiscal === 'Fulano Ficticio Teste' && tf.nome === 'NÃO IDENTIFICADO' && tf.doc === '' && tf.data === ONTEM && tf.hora === '07:33'
      && tf.inspecao === 1 && tf.procedimento === 'apreensao' && tf.turnoId === '' && tf.ufOrigem === 'RR' && JSON.parse(tf.pdfs).length === 1,
      'planilha: TF 543 do papel (registroAntigo, numeroOrigem "papel", servidor digitado, NÃO IDENTIFICADO, data/hora do papel, inspeção, apreensão, 1 PDF)', tf);
    const arq = (await ler('Arquivos')).filter(a => a.dono === 'tfs' && a.donoId === (tf && tf.id));
    ok(arq.length === 1 && arq[0].tipo === 'documento' && arq[0].mime === 'application/pdf', 'PDF do TF no Drive (aba Arquivos, tipo documento)', arq);
    r = await post({ action: 'tfProximoNumero', key: F.token, barreira: 'BVA-CEASA', ano: ANO });
    ok(r.ok && r.ultimo === 543 && r.proximo === 544, 'a sequência da barreira continua do nº do papel (próximo 544)', r);
    r = await post({ action: 'tfEmitir', key: F.token, tf: tfBase({ numero: 543 }) });
    ok(r.ok && r.emitido === false && r.ocupadoPor && /0543/.test(r.ocupadoPor.numeroTxt), 'mesmo número de novo: não grava e diz quem usou', r);
    await irTF(P);
    ok(/📄 do papel/.test(await P.textContent('#tfItens')), 'lista de TFs marca "📄 do papel"');
    ok(!P.err.length, 'sem erros de página', P.err);
    await P.ctx.close();

    console.log('3) plantão do papel com a mesma carga: conta pelo TF, uma vez só');
    const SA = await PORTAL.sessao(TOK, 'papel.adm@gmail.com', 'Fulano Ficticio Teste');
    r = await post({ action: 'admPlantaoImportar', sessao: SA.sessao, posto: 'pf-jundia', troca: '00:00', fiscal: '', arquivo: 'plantao-ficticio.xls',
      dias: [{ data: ONTEM, tipos: { CB: 3 }, educacao: 0 }],
      cargas: [{ data: ONTEM, hora: '07:33', tipo: 'CB', placa: 'ABC1D25', origemMun: 'BOA VISTA', ufOrigem: 'RR', destinoMun: 'MANAUS', ufDestino: 'AM', transportador: 'Ciclano Ficticio Teste',
        produto: 'LARANJA', quantidade: 0.0173, unidade: 't', documento: '', medida: 'apreensao', tf: '543' }] });
    ok(r.ok && r.veiculos === 3 && r.tfs === 1, 'plantão importado (3 veículos, 1 carga com o TF 543)', r);
    const VD = await post({ action: 'painelVigDados', key: TOK, ano: ANO }), J = ((VD.apuracao.porMes || {})['pf-jundia'] || {})[ONTEM.slice(0, 7)] || {};
    ok(J.veiculos === 3 && J.tfs === 1 && J.partidas === 1 && J.apreensao === 1 && J.internN === 1 && J.inspecaoFito === 1 && J.inspecao === 1,
      'VIGIFITO Jundiá: 3 veículos; TF, partida, apreensão e internalização = 1 (a carga conta pelo TF do papel, não duas vezes); inspeção do TF = 1', J);
  } finally { await b.close(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
