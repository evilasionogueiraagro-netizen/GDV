const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Auto de infração no TF de Barreira: caixa "Auto de infração" (qualquer procedimento) abre o cartão do auto; nº numa sequência própria por
// barreira/ano (planilha confere; sem internet, provisório e conflito marcado ao sincronizar); PDF do auto em 3 vias (documentos/auto.html).
const { API, APP } = amb;
const ANO = new Date(Date.now() - 4 * 3600e3).getUTCFullYear();
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (c, m, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!c) falhas++; };
const fn = (nome, ...args) => get('/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args)));

(async () => {
  const b = await amb.lancar();
  const aparelho = async ({ token, nome }) => {
    const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.119, longitude: -60.0217, accuracy: 10 } });
    await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [token, nome]);
    // impressão capturada: texto, folhas, via destacada, caixas marcadas e o HTML (para gerar o PDF de conferência)
    await c.addInitScript(() => { if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || [];
      window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' '), paginas: d.querySelectorAll('.a4').length, titulo: window.top.document.title,
        vias: [...d.querySelectorAll('.a4')].map(p => (p.querySelector('[data-via].atual') || {}).textContent || ''),
        marcas: Object.fromEntries([...d.querySelectorAll('.a4:first-child [data-marca]')].map(e => [e.getAttribute('data-marca'), e.textContent])),
        campos: Object.fromEntries([...d.querySelectorAll('.a4:first-child [data-campo]')].map(e => [e.getAttribute('data-campo'), e.textContent])),
        html: d.documentElement.outerHTML }); }; });
    const p = await c.newPage(); p.err = []; p.on('pageerror', e => p.err.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && p.err.push(m.text()));
    p.on('dialog', d => d.accept()); p.ctx = c;
    await p.goto(APP); await p.waitForSelector('#view *', { state: 'attached' }); await p.waitForTimeout(700); return p;
  };
  const sync = async p => { await p.evaluate(() => Sync.sincronizar()); await p.waitForFunction(() => ['ok', 'idle'].includes(Sync.estado().tipo) && !Sync.estado().pend, null, { timeout: 15000 }); };
  const irTF = async p => {
    if (await p.locator('nav [data-v=tf]').count()) await p.click('nav [data-v=tf]');
    else { if (!(await p.locator('.modulo').count())) await p.click('nav [data-v=modulos]'); await p.click('.modulo[data-v=tf]'); }
    await p.waitForSelector('button[data-tf=novo]');
  };
  const novoTF = async p => { await p.click('button[data-tf=novo]'); await p.waitForSelector('#tfForm'); await p.waitForFunction(() => document.querySelector('#tf-num') && !/Consultando/.test(document.querySelector('#tf-num-dica').textContent), null, { timeout: 10000 }); };
  async function preencher(p, { doc, nome, proc = 'apreensao', relacao = 'Motorista' }) {
    await p.fill('#tf-doc', doc); await p.waitForFunction(() => /Novo cadastro|Cadastro encontrado/.test(document.querySelector('#tf-st-doc').textContent), null, { timeout: 8000 });
    await p.fill('#tf-nome', nome); await p.fill('#tf-endereco', 'RUA FICTICIA 10'); await p.fill('#tf-municipio', 'MANAUS'); await p.fill('#tf-uf', 'AM');
    await p.selectOption('#tf-relacao', relacao);
    await p.fill('#tf-placa', 'ABC1D23'); await p.fill('#tf-origem', 'ITACOATIARA'); await p.fill('#tf-destino', 'MANAUS');
    await p.check(`input[name=tf-proc][value=${proc}]`);
    await p.selectOption('#tf-produtos .prod select >> nth=0', 'MANGA'); await p.fill('#tf-produtos .prod input', '10');
  }
  const gerar = async p => { await p.click('#tfForm button[type=submit]'); await p.waitForSelector('#tf-num-m', { timeout: 15000 }); await p.click('#tf-m-ok'); await p.waitForSelector('text=TF gerado', { timeout: 10000 }); };
  const tfs = async () => (await fn('lerLeitura_', 'TFs')).r;

  const fA = await U.fiscal('Ana Paula Lima'), fB = await U.fiscal('Bruno Costa Souza');
  const A = await aparelho({ token: fA.token, nome: fA.nome });

  console.log('1) caixa "Auto de infração" abre o cartão do auto, com os textos do TF');
  await irTF(A); await novoTF(A);
  ok(await A.isHidden('#tf-ai-card'), 'sem a caixa marcada, o cartão do auto fica escondido');
  await preencher(A, { doc: '529.982.247-25', nome: 'Fulano Ficticio Teste', proc: 'rechaco' });
  await A.check('#tf-auto'); await A.waitForSelector('#tf-ai-card:not([hidden])');
  ok(await A.isVisible('#tf-ai-fatos'), 'com a caixa marcada (procedimento: rechaço), o cartão do auto aparece');
  const fatos0 = await A.inputValue('#tf-ai-fatos'), enq0 = await A.inputValue('#tf-ai-enquadramento');
  ok(fatos0 && fatos0 === await A.inputValue('#tf-constatacao') && enq0 === await A.inputValue('#tf-enquadramento'), 'fatos e enquadramento começam com a constatação e o enquadramento do TF', fatos0.slice(0, 60));
  ok((await A.inputValue('#tf-ai-condutor')) === 'Fulano Ficticio Teste' && /529/.test(await A.inputValue('#tf-ai-condutorCpf')), 'relação "Motorista": condutor = fiscalizado');
  ok(await A.isChecked('input[name=tf-ai-ocorrencia][value=barreira]'), 'ocorrência padrão: Em Barreira Fitossanitária');
  await A.fill('#tf-ai-fatos', 'Transporte de MANGA sem PTV (texto do auto, editado).');
  await A.fill('#tf-ai-cep', '69000-000'); await A.fill('#tf-ai-renavam', '00000000000'); await A.fill('#tf-ai-nomeComercial', 'Comercio Ficticio Teste');
  await A.check('input[name=tf-ai-ciencia][value=autuado]');
  await A.fill('#tf-ai-t1-nome', 'Beltrano Ficticio Teste'); await A.fill('#tf-ai-t1-cpf', '111.444.777-35'); await A.fill('#tf-ai-t1-telefone', '92900000000');
  ok((await A.inputValue('#tf-constatacao')) !== 'Transporte de MANGA sem PTV (texto do auto, editado).', 'editar o auto não muda a constatação do TF');
  await A.screenshot({ path: amb.saida('auto_form.png'), fullPage: true });
  await gerar(A);
  const info = await A.textContent('#tf-auto-info').catch(() => '');
  ok(new RegExp(`0001-${ANO}-BVA - CEASA`).test(info), 'tela do TF: auto nº 0001-ANO-BVA - CEASA', info);
  let L = await tfs(); const t1 = L.find(t => t.nome === 'FULANO FICTICIO TESTE');
  const d1 = JSON.parse((t1 && t1.autoDados) || '{}');
  ok(t1 && t1.auto === 1 && t1.autoNumero === 1 && t1.autoNumeroTxt === `0001-${ANO}-BVA - CEASA` && t1.autoNumeroOrigem === 'sistema', 'planilha: auto = 1, autoNumero 1 pela planilha', t1 && [t1.autoNumero, t1.autoNumeroTxt, t1.autoNumeroOrigem]);
  ok(d1.fatos === 'Transporte de MANGA sem PTV (texto do auto, editado).' && d1.ciencia === 'autuado' && d1.t1.nome === 'Beltrano Ficticio Teste' && Math.abs(+d1.lat + 3.119) < 0.01, 'autoDados: fatos, ciência, testemunha e coordenada', d1);

  console.log('2) PDF do auto: 3 vias, campos do TF e do auto');
  await A.evaluate(() => { window.__prints = []; }); await A.click('[data-tf=imprimirauto]');
  await A.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 10000 });
  const pr = await A.evaluate(() => window.__prints[0]);
  ok(pr.paginas === 3 && pr.vias.join('|') === '1ª via: Interessado|2ª via: ADAF Central|3ª via: Unidade Local', '3 folhas, cada uma com a sua via destacada', pr.vias);
  ok(pr.campos.num_seq === '0001' && pr.campos.num_ano === String(ANO) && pr.campos.num_unidade === 'BVA - CEASA', 'nº: sequencial, ano e unidade nos três espaços', [pr.campos.num_seq, pr.campos.num_ano, pr.campos.num_unidade]);
  ok(pr.campos.nome === 'FULANO FICTICIO TESTE' && pr.campos.doc === '529.982.247-25' && pr.campos.placa === 'ABC1D23' && pr.campos.procedencia === 'ITACOATIARA' && pr.campos.cep === '69000-000', 'autuado, CPF, placa, procedência e CEP', pr.campos);
  ok(pr.marcas.oc_barreira === '☑' && pr.marcas.oc_unidade === '☐' && pr.marcas.ci_autuado === '☑' && pr.marcas.ci_recusou === '☐', 'caixas: ocorrência em barreira e ciência do autuado', pr.marcas);
  ok(/AUTO DE INFRAÇÃO/.test(pr.texto) && /DECRETO FEDERAL N° 24.114/.test(pr.texto) && /PRAZO DE 15 \(QUINZE\) DIAS/.test(pr.texto) && /Beltrano Ficticio Teste/.test(pr.texto) && /Ana Paula Lima/.test(pr.texto), 'texto do modelo, testemunha e autoridade autuante', pr.texto.slice(0, 120));
  ok(/^Auto de Infracao 0001-/.test(pr.titulo), 'nome do arquivo: "Auto de Infracao 0001-…"', pr.titulo);
  { // PDF de conferência (saida/auto_infracao.pdf) e imagem da 1ª via
    const c = await b.newContext({ viewport: { width: 800, height: 1130 } }), v = await c.newPage();
    await v.goto(APP + 'documentos/auto.html'); await v.setContent(pr.html.replace('<head>', `<head><base href="${APP}documentos/">`)); await v.waitForTimeout(500);
    await v.pdf({ path: amb.saida('auto_infracao.pdf'), format: 'A4', printBackground: true });
    const alt = await v.evaluate(() => [...document.querySelectorAll('.a4')].map(p => Math.round(p.getBoundingClientRect().height)));
    ok(alt.every(h => h <= 294 * 96 / 25.4 + 2), 'cada via cabe numa folha A4', alt);
    await v.screenshot({ path: amb.saida('auto_infracao.png'), clip: { x: 0, y: 0, width: 800, height: 1130 } }); await c.close();
  }

  console.log('3) segundo auto na barreira: nº 2; TF sem a caixa: sem auto');
  await A.click('[data-tf=novo]'); await A.waitForSelector('#tfForm'); await A.waitForFunction(() => document.querySelector('#tf-num') && !/Consultando/.test(document.querySelector('#tf-num-dica').textContent), null, { timeout: 10000 });
  await preencher(A, { doc: '111.444.777-35', nome: 'Sicrano Ficticio Teste', relacao: 'Proprietário' });
  await A.check('#tf-auto'); ok((await A.inputValue('#tf-ai-condutor')) === '', 'relação "Proprietário": condutor em branco');
  await A.fill('#tf-ai-fatos', ''); await A.click('#tfForm button[type=submit]'); await A.waitForTimeout(400);
  ok(!(await A.locator('#tf-num-m').count()) && await A.evaluate(() => document.activeElement && document.activeElement.id) === 'tf-ai-fatos', 'auto sem descrição dos fatos: não gera e leva ao campo');
  await A.fill('#tf-ai-fatos', 'Segundo auto ficticio.'); await gerar(A);
  await A.click('[data-tf=novo]'); await A.waitForSelector('#tfForm'); await A.waitForFunction(() => document.querySelector('#tf-num') && !/Consultando/.test(document.querySelector('#tf-num-dica').textContent), null, { timeout: 10000 });
  await preencher(A, { doc: '529.982.247-25', nome: 'Fulano Ficticio Teste', proc: 'liberacao' }); await gerar(A);
  ok(!(await A.locator('[data-tf=imprimirauto]').count()), 'TF sem auto: sem o botão do auto');
  L = await tfs();
  ok(L.find(t => t.nome === 'SICRANO FICTICIO TESTE').autoNumero === 2 && L.filter(t => t.procedimento === 'liberacao').every(t => !t.autoNumero && !t.autoDados), 'planilha: segundo auto = 2; TF sem auto sem número nem dados');

  console.log('4) sem internet: auto provisório; nº repetido marcado ao sincronizar');
  const B = await aparelho({ token: fB.token, nome: fB.nome }); await irTF(B); await sync(B);
  await B.ctx.setOffline(true); await B.evaluate(() => window.dispatchEvent(new Event('offline')));
  await B.evaluate(() => Store.setMeta('ultimoVisto', {}));                                // aparelho que não viu os autos de Ana
  await novoTF(B); await preencher(B, { doc: '529.982.247-25', nome: 'Fulano Ficticio Teste' }); await B.check('#tf-auto'); await B.fill('#tf-num', '50'); await B.dispatchEvent('#tf-num', 'input'); await gerar(B);
  ok(/provisório/.test(await B.textContent('#tf-auto-info')) && /0001-/.test(await B.textContent('#tf-auto-info')), 'offline: auto 0001 provisório', await B.textContent('#tf-auto-info'));
  await B.ctx.setOffline(false); await B.evaluate(() => window.dispatchEvent(new Event('online'))); await sync(B);
  L = await tfs(); const rep = L.filter(t => t.autoNumero === 1);
  ok(rep.length === 2 && rep.find(t => t.usuario === 'Bruno Costa Souza').autoConflito === 1 && rep.find(t => t.usuario === 'Ana Paula Lima').autoConflito === 0, 'planilha: o auto 1 repetido fica com autoConflito no mais novo', rep.map(t => [t.usuario, t.autoConflito]));
  const au = (await fn('auditarSequencia_', 'BVA-CEASA', ANO, 'AI')).r;
  ok(au.total === 3 && au.duplicados.some(d => d.numero === 1) && au.conflitos === 1, 'auditoria da sequência de autos: 3 autos, nº 1 repetido', au);

  console.log('5) ponto de partida da sequência de autos (menu da planilha)');
  ok((await fn('definirSequencia_', 'BVA-CEASA', ANO, 40, 'AI')).r === 40, 'definirSequencia_ (AI): último usado = 40');
  const px = await A.evaluate(([a]) => Sync.proximoNumero('BVA-CEASA', a), [ANO]);
  ok(px.autoUltimo === 40, 'tfProximoNumero devolve o último auto (40)', px.autoUltimo);
  ok((await fn('definirSequencia_', 'NAO-EXISTE', ANO, 1, 'AI')).erro, 'auto: barreira desconhecida recusada');

  ok(!A.err.length && !B.err.length, 'sem erros de console', A.err.concat(B.err));
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
