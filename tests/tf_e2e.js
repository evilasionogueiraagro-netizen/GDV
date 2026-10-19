const amb = require('./lib/amb');
const { chromium } = require('playwright-core'); const assert = require('assert');
const { API, APP } = amb;
const ANO = new Date(Date.now() - 4 * 3600e3).getUTCFullYear();   // ano corrente em Manaus (o app numera TF/turno pelo ano)
const get = p => fetch(API + p).then(r => r.json());
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) throw new Error(m); };
(async () => {
  const b = await amb.lancar();
  const credencial = async nome => { const g = await get('/__gerar?nome=' + encodeURIComponent(nome)); const r = await (await fetch(API, { method: 'POST', body: JSON.stringify({ action: 'ativar', codigo: g.codigo }) })).json(); return { token: r.token, nome }; };
  const aparelho = async ({ token, nome }) => {
    const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.119, longitude: -60.0217, accuracy: 10 } });
    await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [token, nome]);
    await c.addInitScript(() => { if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' '), paginas: d.querySelectorAll('.a4').length, vias: [...d.querySelectorAll('.via')].map(v => v.textContent), titulo: window.top.document.title, cancelado: !!d.querySelector('.cancelado-faixa') }); }; });
    const p = await c.newPage(); p.err = []; p.on('pageerror', e => p.err.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && p.err.push(m.text()));
    p.on('dialog', d => d.type() === 'prompt' ? d.accept('digitação errada') : d.accept()); p.ctx = c;
    await p.goto(APP); await p.waitForSelector('#view *', { state: 'attached' }); await p.waitForTimeout(700); return p;
  };
  const sync = async p => { await p.evaluate(() => Sync.sincronizar()); await p.waitForFunction(() => ['ok', 'idle'].includes(Sync.estado().tipo) && !Sync.estado().pend, null, { timeout: 15000 }); };
  const irTF = async p => {
    if (await p.locator('nav [data-v=tf]').count()) await p.click('nav [data-v=tf]');                    // já no módulo TF
    else { if (!(await p.locator('.modulo').count())) await p.click('nav [data-v=modulos]'); await p.click('.modulo[data-v=tf]'); }
    await p.waitForSelector('button[data-tf=novo]');
  };
  const novoTF = async p => { await p.click('button[data-tf=novo]'); await p.waitForSelector('#tfForm'); await p.waitForFunction(() => document.querySelector('#tf-num') && !/Consultando/.test(document.querySelector('#tf-num-dica').textContent), null, { timeout: 10000 }); };
  const numeroTela = p => p.textContent('#tf-numero');
  async function preencher(p, { doc, nome, placa, produto = 'MANGA', proc = 'apreensao', extra = {} }) {
    await p.fill('#tf-doc', doc); await p.waitForFunction(() => /Novo cadastro|Cadastro encontrado/.test(document.querySelector('#tf-st-doc').textContent), null, { timeout: 8000 });
    if (nome) await p.fill('#tf-nome', nome);
    await p.fill('#tf-endereco', 'RUA DAS FLORES 10'); await p.fill('#tf-municipio', 'MANAUS'); await p.fill('#tf-uf', 'am'); await p.fill('#tf-telefone', '92999990000');
    if (placa) await p.fill('#tf-placa', placa);
    await p.fill('#tf-origem', 'ITACOATIARA'); await p.fill('#tf-destino', 'MANAUS');
    await p.check(`input[name=tf-proc][value=${proc}]`);
    await p.selectOption('#tf-produtos .prod select >> nth=0', produto); await p.fill('#tf-produtos .prod input', '10');
    for (const [k, v] of Object.entries(extra)) await p.fill(k, v);
  }
  async function gerar(p, numeroEsperado, trocarPor) {
    await p.click('#tfForm button[type=submit]'); await p.waitForSelector('#tf-num-m');
    const sugerido = await p.inputValue('#tf-num-m'); if (numeroEsperado != null) ok(+sugerido === numeroEsperado, `modal sugere o nº ${numeroEsperado} (veio ${sugerido})`);
    if (trocarPor != null) await p.fill('#tf-num-m', String(trocarPor));
    await p.click('#tf-m-ok'); await p.waitForSelector('text=TF gerado', { timeout: 8000 });
  }
  const imprimir = async p => { await p.evaluate(() => { window.__prints = []; }); await p.click('[data-tf=imprimir]'); await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 8000 }); return p.evaluate(() => window.__prints[0]); };

  const fA = await credencial('Ana Paula Lima'), fB = await credencial('Bruno Costa Souza');
  const tfsPlanilha = async () => (await get('/__fn?nome=lerLeitura_&args=' + encodeURIComponent(JSON.stringify(['TFs'])))).r;
  const abrirPopup = async p => { await p.click('#tfForm button[type=submit]'); await p.waitForSelector('#tf-num-m', { timeout: 15000 }); };
  const confirmar = async p => { await p.click('#tf-m-ok'); };

  console.log('0) tela de módulos');
  { const P = await aparelho(fA); const tit = await P.locator('.modulo b').allTextContents(); ok(tit.length === 3 && /Educação Sanitária\/Fiscalização de Trânsito/.test(tit[0]) && /Termo de Fiscalização/.test(tit[1]) && tit[2] === 'PCE', 'após ativar: três módulos (veículos, TF, PCE) — ' + tit.join(' | ')); ok(/Olá, Ana/.test(await P.textContent('#view')), 'saudação com o nome vinculado'); await P.ctx.close(); }
  console.log('A) Ana: o número vem da planilha na hora de gerar, num popup editável, antes do PDF');
  const A = await aparelho(fA); await irTF(A); await novoTF(A);
  ok((await A.inputValue('#tf-num')) === '1' && /Próximo nº pela planilha/.test(await numeroTela(A)) && /Nenhum TF desta barreira/.test(await numeroTela(A)), 'no formulário o nº já aparece (1, pela planilha) e é editável: "' + await numeroTela(A) + '"');
  ok((await A.inputValue('#tf-local')) === 'BR-319 PORTO DA CEASA', 'local sugerido pela barreira');
  await A.screenshot({ path: amb.saida('tf_form_topo.png') });
  await preencher(A, { doc: '529.982.247-25', nome: 'josé da silva', placa: 'abc-1d23' });
  ok((await A.inputValue('#tf-ufOrigem')) === '' && (await A.$$eval('#tf-ufDestino option', os => os.length)) === 29, 'UF de origem/destino: selects opcionais (vazio + 27 UFs + Exterior)');
  await A.selectOption('#tf-ufOrigem', 'AM'); await A.selectOption('#tf-ufDestino', 'AM');
  ok(/Novo cadastro/.test(await A.textContent('#tf-st-doc')) && /Sem TF anterior/.test(await A.textContent('#tf-st-doc')), 'CPF novo, sem histórico');
  ok((await A.inputValue('#tf-constatacao')).includes('SEM a devida documentação') && (await A.inputValue('#tf-enquadramento')).includes('Lei Federal 9.712'), 'textos sugeridos para apreensão');
  await A.fill('#tf-doc', '123.456.789-00'); await A.waitForTimeout(700); ok(/dígitos inválidos/.test(await A.textContent('#tf-st-doc')), 'CPF com dígitos inválidos é sinalizado');
  await A.fill('#tf-doc', '529.982.247-25'); await A.waitForTimeout(700);
  await abrirPopup(A);
  ok(+(await A.inputValue('#tf-num-m')) === 1 && /Número obtido na planilha agora/.test(await A.textContent('.tf-modal-box')) && /Nenhum TF anterior/.test(await A.textContent('.tf-modal-box')), 'popup: nº 1 obtido na planilha, sem TF anterior');
  await A.screenshot({ path: amb.saida('tf_popup.png') });
  await confirmar(A); await A.waitForSelector('text=TF gerado', { timeout: 10000 });
  ok(new RegExp(`0001/${ANO} - BVA - CEASA`).test(await A.textContent('#view')) && /Número confirmado na planilha/.test(await A.textContent('#view')), `TF 0001/${ANO} gerado e confirmado na planilha`);
  let linhas = await tfsPlanilha();
  ok(linhas.length === 1 && linhas[0].numero === 1 && linhas[0].numeroOrigem === 'sistema' && linhas[0].emitidoEm > 0 && linhas[0].usuario === 'Ana Paula Lima', 'planilha já tem o TF 1 (origem "sistema", emitidoEm e usuário gravados), sem esperar a sincronização');
  ok(linhas[0].origem === 'ITACOATIARA' && linhas[0].ufOrigem === 'AM' && linhas[0].ufDestino === 'AM', 'planilha: UF de origem/destino gravadas nas colunas novas (ufOrigem/ufDestino)');
  let pr = await imprimir(A);
  ok(pr.texto.includes('ITACOATIARA/AM') && pr.texto.includes('MANAUS/AM'), 'PDF: origem e destino com a UF ("ITACOATIARA/AM", "MANAUS/AM")');
  ok(pr.paginas === 2 && pr.vias.join('|') === '1ª via|2ª via' && pr.texto.includes(`0001/${ANO} - BVA - CEASA`) && pr.texto.includes('JOSÉ DA SILVA') && pr.texto.includes('529.982.247-25') && pr.texto.includes('MANGA - 10 Kg') && pr.texto.includes('☑ Apreensão p/ destruição'), 'PDF em 2 vias com número, nome, CPF formatado, produto e procedimento');
  ok(new RegExp(`TF 0001-${ANO} - BVA - CEASA MANGA APREENSAO`).test(pr.titulo), 'nome sugerido do PDF: ' + pr.titulo);

  console.log('B) Bruno: outro fiscal usa o número enquanto o popup está aberto; edição manual fica registrada');
  const Bd = await aparelho(fB); await irTF(Bd); await novoTF(Bd);
  await Bd.fill('#tf-doc', '529.982.247-25'); await Bd.waitForFunction(() => /REINCIDENTE/.test(document.querySelector('#tf-st-doc').textContent), null, { timeout: 8000 });
  ok((await Bd.inputValue('#tf-nome')) === 'JOSÉ DA SILVA', 'cadastro preenchido pelo servidor; alerta de reincidência exibido');
  await Bd.check('input[name=tf-proc][value=rechaco]'); await Bd.selectOption('#tf-produtos .prod select >> nth=0', 'TOMATE'); await Bd.fill('#tf-produtos .prod input', '5');
  await abrirPopup(Bd);
  ok(+(await Bd.inputValue('#tf-num-m')) === 2 && new RegExp(`0001/${ANO} - BVA - CEASA`).test(await Bd.textContent('.tf-modal-box')) && /Ana Paula Lima/.test(await Bd.textContent('.tf-modal-box')), `popup de Bruno: nº 2 e "último usado: 0001/${ANO} (Ana Paula Lima)"`);
  // enquanto o popup de Bruno está aberto, Ana emite o nº 2 por outro caminho
  const outro = await (await fetch(API, { method: 'POST', body: JSON.stringify({ action: 'tfEmitir', key: fA.token, tf: { id: 'tf-corrida', barreira: 'BVA-CEASA', ano: ANO, numero: 2, numeroTxt: `0002/${ANO} - BVA - CEASA`, data: '2026-10-10', hora: '09:40', nome: 'FULANO', doc: '11144477735', procedimento: 'liberacao', cancelado: 0, criadoEm: Date.now(), atualizadoEm: Date.now() } }) })).json();
  ok(outro.emitido === true, 'Ana emitiu o nº 2 (por fora) enquanto Bruno decide');
  await confirmar(Bd); await Bd.waitForFunction(() => /acabou de ser usado/.test(document.querySelector('.tf-modal-box')?.textContent || ''), null, { timeout: 10000 });
  ok(+(await Bd.inputValue('#tf-num-m')) === 3 && /Ana Paula Lima/.test(await Bd.textContent('.tf-modal-box')), 'Bruno é avisado ANTES do PDF: nº 2 já usado por Ana; nova sugestão = 3');
  await Bd.fill('#tf-num-m', '7'); ok(/Número alterado \(o sistema sugeriu 0003\)/.test(await Bd.textContent('#tf-num-edit')), 'ao editar, o popup avisa que a alteração fica registrada');
  await confirmar(Bd); await Bd.waitForSelector('text=TF gerado', { timeout: 10000 });
  ok(/alterado manualmente \(o sistema sugeriu 0003\)/.test(await Bd.textContent('#view')) && /reincidente: 1 TF/.test(await Bd.textContent('#view')), 'TF 0007 gerado; marcado como alterado e como reincidente');
  linhas = await tfsPlanilha(); const l7 = linhas.find(t => t.numero === 7);
  ok(l7 && l7.numeroOrigem === 'editado' && l7.numeroSugerido === 3 && l7.usuario === 'Bruno Costa Souza', 'planilha: nº 7, origem "editado", sugerido 3 (auditoria)');
  await Bd.click('button[data-go=tf]'); await Bd.waitForSelector('#tfItens .item'); ok(await Bd.locator('#tfItens .item').count() === 1, 'lista de Bruno só tem os TFs dele');

  console.log('C) Ana sem internet: número provisório e duplicidade apontada ao sincronizar');
  await sync(A); await irTF(A);
  await A.ctx.setOffline(true); await A.evaluate(() => window.dispatchEvent(new Event('offline')));
  await novoTF(A); await preencher(A, { doc: '111.444.777-35', nome: 'Maria Souza', produto: 'CAJU', proc: 'liberacao' });
  await abrirPopup(A);
  ok(+(await A.inputValue('#tf-num-m')) === 8 && /Sem conexão/.test(await A.textContent('.tf-modal-box')), 'offline: popup propõe o nº 8 (último conhecido = 7) com aviso de número provisório');
  await A.fill('#tf-num-m', '7'); await confirmar(A); await A.waitForSelector('text=TF gerado', { timeout: 10000 });
  ok(/provisório|aguardando envio/.test(await A.textContent('#view')), 'TF gerado offline, com aviso de que será conferido ao sincronizar');
  await A.ctx.setOffline(false); await A.evaluate(() => window.dispatchEvent(new Event('online'))); await sync(A);
  await A.click('button[data-go=tf]'); await A.waitForSelector('#tfItens .item'); ok(/Número duplicado/.test(await A.textContent('#tfItens')), 'após sincronizar, o nº 7 repetido aparece com aviso de duplicidade');
  const au = (await get('/__fn?nome=auditarSequencia_&args=' + encodeURIComponent(JSON.stringify(['BVA-CEASA', ANO])))).r;
  ok(au.duplicados.some(d => d.numero === 7) && au.lacunas.includes(4) && au.editados.length >= 2, 'auditoria na planilha: duplicado = 7, lacunas = ' + JSON.stringify(au.lacunas));

  console.log('D) TF ligado ao turno e listado no Termo do turno');
  await A.click('nav [data-v=modulos]'); await A.click('.modulo[data-v=home]'); await A.waitForSelector('#fTurno');
  await A.fill('#nTF', '30'); await A.selectOption('#nPosto', 'Móvel'); await A.fill('#nLocal', 'BR-319 PORTO DA CEASA'); await A.fill('#nUnidade', 'MANAUS'); await A.click('#fTurno button[type=submit]'); await A.waitForSelector('.contador');
  await A.click('[data-go=tfnovo]'); await A.waitForSelector('#tfForm'); ok((await A.inputValue('#tf-local')) === 'BR-319 PORTO DA CEASA' && await A.locator('nav [data-v=home]').count() === 1, '"Lavrar TF neste turno" abre o TF dentro do módulo de veículos (o menu de veículos continua) com o local do turno'); await A.click('nav [data-v=home]'); await A.waitForSelector('.contador'); await A.waitForTimeout(300);
  await A.click('nav [data-v=registrar]'); await A.waitForSelector('#fVeic'); await A.fill('#placa', 'ZZZ9Z99'); await A.click('#fVeic > button'); await A.waitForTimeout(500);
  await A.click('nav [data-v=lista]'); await A.waitForSelector('[data-tfveic]'); await A.click('[data-tfveic]'); await A.waitForSelector('#tfForm');
  ok((await A.inputValue('#tf-placa')) === 'ZZZ9Z99' && (await A.inputValue('#tf-local')) === 'BR-319 PORTO DA CEASA', '"Lavrar TF" traz a placa do veículo e o local do turno');
  await preencher(A, { doc: '111.444.777-35', proc: 'liberacao', produto: 'LARANJA' }); await A.fill('#tf-placa', 'ZZZ9Z99');
  await abrirPopup(A); await confirmar(A); await A.waitForSelector('text=TF gerado', { timeout: 10000 }); const numLigado = (await A.textContent('.tf-num b')).trim();
  ok(await A.locator('button[data-go=lista]').count() === 1 && await A.locator('button[data-go=tf]').count() === 0, 'TF aberto a partir do veículo: o botão volta para a lista de veículos (TF embutido no módulo)');
  await A.click('nav [data-v=resumo]'); await A.waitForSelector('#encerrar'); await A.click('#encerrar'); await A.waitForSelector('[data-doc=termo]');
  await A.evaluate(() => { window.__prints = []; }); await A.click('[data-doc=termo]'); await A.waitForFunction(() => window.__prints && window.__prints.length);
  const termo = (await A.evaluate(() => window.__prints[0])).texto; ok(termo.includes('Termos de Barreira Lavrados: ' + numLigado), `Termo do turno lista o TF ligado: "${numLigado}"`);

  console.log('D2) nº editado no formulário (talão de papel à frente do sistema): os próximos seguem a partir dele');
  await irTF(A); await novoTF(A);
  const sugForm = +(await A.inputValue('#tf-num')); ok(sugForm > 7 && /Próximo nº pela planilha/.test(await numeroTela(A)), 'formulário propõe o próximo da barreira: ' + sugForm);
  await A.fill('#tf-num', '150');
  await preencher(A, { doc: '529.982.247-25', proc: 'liberacao', produto: 'LARANJA' });
  ok((await A.inputValue('#tf-num')) === '150', 'nº digitado continua no campo depois de preencher o resto');
  await abrirPopup(A);
  ok(+(await A.inputValue('#tf-num-m')) === 150 && /Número alterado/.test(await A.textContent('#tf-num-edit')), 'popup já vem com o nº digitado (150), marcado como alterado');
  await confirmar(A); await A.waitForSelector('text=TF gerado', { timeout: 10000 });
  linhas = await tfsPlanilha(); const t150 = linhas.find(l => l.numero === 150);
  ok(t150 && t150.numeroOrigem === 'editado' && t150.numeroSugerido > 0 && t150.numeroSugerido !== 150, 'planilha: TF 150 com origem "editado" e a sugestão do sistema guardada para auditoria', t150 && [t150.numeroOrigem, t150.numeroSugerido]);
  await irTF(A); await novoTF(A);
  ok((await A.inputValue('#tf-num')) === '151' && /0150/.test(await numeroTela(A)), 'TF seguinte: o formulário já traz 151 (continua do talão)', await numeroTela(A));
  await A.screenshot({ path: amb.saida('tf_form_numero.png') });
  await preencher(A, { doc: '529.982.247-25', proc: 'liberacao', produto: 'LARANJA' });
  await abrirPopup(A);
  ok(+(await A.inputValue('#tf-num-m')) === 151, 'popup do TF seguinte, sem edição: 151');
  await A.click('#tf-m-cancel'); await A.click('[data-tf=descartar]'); await A.waitForSelector('button[data-tf=novo]');

  console.log('E) cancelamento e rascunho');
  await irTF(A); await A.waitForSelector('#tfItens .item'); const antes = await A.locator('#tfItens .item').count();
  await A.locator('[data-tf=cancelar]').first().click(); await A.waitForFunction(() => /CANCELADO/.test(document.querySelector('#tfItens').textContent));
  ok(/digitação errada/.test(await A.textContent('#tfItens')), 'TF cancelado mostra o motivo');
  await A.locator('[data-tf=imprimir]').first().click().catch(() => {}); 
  await novoTF(A); await A.fill('#tf-nome', 'RASCUNHO TESTE'); await A.waitForTimeout(800);
  await A.click('nav [data-v=tf]'); await A.waitForTimeout(300); await irTF(A); await novoTF(A);
  ok((await A.inputValue('#tf-nome')) === 'RASCUNHO TESTE', 'rascunho restaurado ao reabrir (confirmado)');
  await A.click('[data-tf=descartar]'); await A.waitForSelector('button[data-tf=novo]');

  console.log('F) sem ativação não abre o TF');
  const c0 = await b.newContext({ viewport: { width: 400, height: 900 } }); const p0 = await c0.newPage(); await p0.addInitScript(() => localStorage.setItem('gdv.semInstalar', '1')); await p0.goto(APP); await p0.waitForSelector('#view *', { state: 'attached' });
  await p0.waitForTimeout(600); ok(await p0.locator('#fAtivar').count() === 1 && await p0.locator('.modulo').count() === 0 && await p0.locator('#tfForm').count() === 0, 'sem ativação não há módulos: aparece só o cartão de ativação');

  ok(![A, Bd].some(p => p.err.length), 'sem erros de console/página: ' + JSON.stringify([...A.err, ...Bd.err]));
  console.log('OK'); await b.close();
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
