// Termo de Educação Sanitária (módulo próprio: educacao.gs, web/js/educacao.js, documentos/educacao-termo.html): app real (Chromium) + Code.gs real (fakegas).
// Confere: módulo liberado para todos (com ou sem a permissão antiga educacaoSanitaria), número "NNN.AAAA.UNIDADE" confirmado sob lock (online) e provisório (offline) com conflito,
// obrigatórios, rascunho, cancelamento com motivo, impressão e PDF, linha na aba TermosEducacao com servidor e usuario. Dados fictícios.
const amb = require('./lib/amb');
const sincronizar = require('./lib/sincronizar');
const U = require('./lib/usuarios');
const { API, APP } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const aba = async nome => { const l = await (await fetch(API + '/__aba?nome=' + nome)).json(); if (!l) return []; return l.slice(1).map(r => Object.fromEntries(l[0].map((k, i) => [k, r[i]]))); };
const ANO = new Date(Date.now() - 4 * 3600e3).getUTCFullYear();     // Manaus = UTC-4
const reg = (id, o = {}) => ({ id, unidade: 'Manaus', ano: ANO, numero: 1, data: new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), hora: '09:30', municipio: 'Manaus',
  local: 'Escola Municipal Fictícia', tipoMedida: 'Palestra', publicoAlvo: ['Estudantes'], programas: ['Pragas dos Citros'], descricao: 'Palestra sobre pragas dos citros.',
  pessoas: 30, folders: 12, servidor: 'Pessoa Ficticia Edu', cargo: 'Fiscal Agropecuário Engenheiro Agrônomo', matricula: '12345', lotacao: 'Manaus', criadoEm: Date.now(), atualizadoEm: Date.now(), ...o });

(async () => {
  console.log('1. Servidor: permissão, número, obrigatórios, dono');
  const sem = await U.fiscal('Pessoa Ficticia Edu Sem', { permissoes: ['campo', 'pce', 'fiscalizacaoDeTransito'] });
  const com = await U.fiscal('Pessoa Ficticia Edu Com', { permissoes: ['campo', 'educacaoSanitaria'] });
  ok(sem.modulos.educacao === 1 && com.modulos.educacao === 1, 'módulo "educacao" liberado para todos (com ou sem a permissão antiga educacaoSanitaria)', [sem.modulos, com.modulos]);
  let r = await post({ action: 'educacaoProximoNumero', key: sem.token, unidade: 'Manaus', ano: ANO });
  ok(r.ok && r.proximo === 1, 'conta sem educacaoSanitaria: educacaoProximoNumero aceito', r);
  r = await post({ action: 'educacaoProximoNumero', unidade: 'Manaus', ano: ANO });
  ok(!r.ok, 'sem login: educacaoProximoNumero recusado', r);

  r = await post({ action: 'educacaoProximoNumero', key: com.token, unidade: 'manaus', ano: ANO });
  ok(r.ok && r.unidade === 'MANAUS' && r.proximo === 1 && r.ultimo === 0, 'próximo número da unidade/ano: 1', r);
  r = await post({ action: 'educacaoRegistrar', key: com.token, registro: reg('edu-a-1') });
  ok(r.ok && r.emitido === true && r.numeroTxt === `001.${ANO}.MANAUS`, 'registrar: número confirmado 001.AAAA.UNIDADE', r);
  let linhas = await aba('TermosEducacao');
  const l1 = linhas.find(x => x.id === 'edu-a-1') || {};
  ok(l1.usuario === 'Pessoa Ficticia Edu Com' && l1.servidor === 'Pessoa Ficticia Edu' && l1.unidade === 'MANAUS' && l1.numeroTxt === `001.${ANO}.MANAUS` && l1.publicoAlvo === '["Estudantes"]' && Number(l1.pessoas) === 30 && Number(l1.excluido) === 0,
    'aba TermosEducacao: linha com servidor, usuario (quem fez), número e listas em JSON', l1);
  r = await post({ action: 'educacaoRegistrar', key: com.token, registro: reg('edu-a-2') });
  ok(r.ok && r.emitido === false && r.proximo === 2 && r.ocupadoPor.numeroTxt === `001.${ANO}.MANAUS`, 'número ocupado: recusado com o próximo livre (2)', r);
  r = await post({ action: 'educacaoRegistrar', key: com.token, registro: reg('edu-a-2', { numero: 2 }) });
  ok(r.ok && r.emitido === true && r.numeroTxt === `002.${ANO}.MANAUS`, 'segundo termo: 002', r);
  r = await post({ action: 'educacaoRegistrar', key: com.token, registro: reg('edu-b-1', { unidade: 'Autazes', lotacao: 'Autazes', numero: 1 }) });
  ok(r.ok && r.numeroTxt === `001.${ANO}.AUTAZES`, 'sequência por unidade: Autazes recomeça em 001', r);
  for (const [campo, valor, msg] of [['descricao', '', /Descreva a ação/], ['local', '', /local/], ['tipoMedida', 'Invento', /tipo de medida/], ['publicoAlvo', [], /público-alvo/],
    ['programas', [], /programas/], ['pessoas', '', /pessoas orientadas/], ['pessoas', -3, /pessoas orientadas/], ['folders', 2.5, /folders/], ['hora', '', /hora/], ['data', '2026-13-45', /data/],
    ['tipoMedida', 'Outro', /Outro/], ['cargo', '', /servidor/]]) {
    r = await post({ action: 'educacaoRegistrar', key: com.token, registro: reg('edu-inv', { numero: 9, [campo]: valor }) });
    ok(!r.ok && msg.test(r.erro), `obrigatório/válido no servidor: ${campo} = ${JSON.stringify(valor)} recusado`, r.erro);
  }
  ok(!(await aba('TermosEducacao')).some(x => x.id === 'edu-inv'), 'termo inválido não chega à planilha');
  const outro = await U.fiscal('Pessoa Ficticia Edu Outra', { permissoes: ['campo', 'educacaoSanitaria'] });
  r = await post({ action: 'educacaoRegistrar', key: outro.token, registro: reg('edu-a-1', { numero: 7, descricao: 'troca indevida' }) });
  ok(!r.ok && /outro servidor/.test(r.erro), 'termo de outro servidor não é alterado (educacaoRegistrar)', r.erro);
  r = await post({ action: 'sync', key: outro.token, since: 0, termosEducacao: [reg('edu-a-1', { descricao: 'troca indevida', atualizadoEm: Date.now() + 1000 })] });
  ok(r.ok && r.recusados.termosEducacao.includes('edu-a-1') && (await aba('TermosEducacao')).find(x => x.id === 'edu-a-1').descricao === 'Palestra sobre pragas dos citros.', 'termo de outro servidor não é alterado (sync: recusados)', r.recusados);
  r = await post({ action: 'sync', key: com.token, since: 0 });
  ok(r.ok && r.termosEducacao.length === 3 && r.termosEducacao.every(t => t.usuario === 'Pessoa Ficticia Edu Com') && r.ultimosEducacao[`MANAUS|${ANO}`] === 2, 'sync devolve só os termos do próprio servidor e o último nº por unidade/ano', [r.termosEducacao.length, r.ultimosEducacao]);
  r = await post({ action: 'sync', key: outro.token, since: 0 }); ok(r.termosEducacao.length === 0, 'outro servidor não recebe os termos alheios');
  r = await post({ action: 'sync', key: com.token, since: 0, termosEducacao: [reg('edu-a-2', { numero: 2, cancelado: 1, motivoCancel: 'Lançado por engano (teste)', atualizadoEm: Date.now() + 5000 })] });
  const l2 = (await aba('TermosEducacao')).find(x => x.id === 'edu-a-2');
  ok(Number(l2.cancelado) === 1 && l2.motivoCancel === 'Lançado por engano (teste)' && Number(l2.excluido) === 0 && l2.numeroTxt === `002.${ANO}.MANAUS`, 'cancelar: cancelado 1 com motivo, sem apagar, número continua usado', l2);
  r = await post({ action: 'educacaoRegistrar', key: com.token, registro: reg('edu-a-3', { numero: 2 }) });
  ok(r.ok && r.emitido === false && r.proximo === 3, 'número de termo cancelado continua ocupado', r);

  console.log('2. App: cartão, permissão, Meus dados, formulário, número, rascunho');
  const b = await amb.lancar();
  const aparelho = async (f, extra) => {
    const c = await b.newContext({ viewport: { width: 400, height: 900 }, acceptDownloads: true });
    await c.addInitScript(i => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } } catch (e) { /* sem armazenamento */ } }, f.ls);
    await c.addInitScript(() => { if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || [];
      window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' '), paginas: d.querySelectorAll('.a4').length, html: d.documentElement.outerHTML }); }; });
    const p = await c.newPage(); p.err = []; p.ctx = c;
    p.on('pageerror', e => p.err.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && p.err.push(m.text()));
    p.motivo = 'Termo lançado em duplicidade (teste)';
    p.on('dialog', d => d.accept(d.type() === 'prompt' ? p.motivo : undefined));
    await p.goto(APP); await p.waitForSelector('.modulo');
    await p.evaluate(() => Sync.sincronizar()); await p.waitForFunction(() => Sync.estado().tipo === 'ok', null, { timeout: 20000 });   // as permissões vêm do servidor
    await p.evaluate(() => go('modulos')); await p.waitForTimeout(300);
    return p;
  };
  const pSem = await aparelho(sem);
  ok(await pSem.locator('.modulo[data-v=educacao]').count() === 1 && await pSem.locator('.modulo[data-v=pce]').count() === 1, 'conta sem educacaoSanitaria: o cartão "Educação Sanitária" aparece junto com os outros módulos');
  const nomes = await pSem.locator('.modulo b').allTextContents();
  ok(nomes.includes('Fiscalização de Trânsito') && nomes.includes('Educação Sanitária'), 'cartões "Fiscalização de Trânsito" e "Educação Sanitária"', nomes);
  await pSem.close();

  const p = await aparelho(com);
  ok(await p.locator('.modulo[data-v=educacao]').count() === 1 && /Educação Sanitária/.test(await p.textContent('.modulo[data-v=educacao] b')), 'cartão "Educação Sanitária" na tela de módulos');
  ok(await p.locator('.modulo[data-v=veiculos], .modulo[data-v=home]').count() === 0, 'conta só com o app de campo: os outros cartões não aparecem');
  await p.click('.modulo[data-v=educacao]'); await p.waitForSelector('#eduServForm');
  await p.click('#edu-s-salvar');
  ok(await p.isVisible('#eduServForm'), 'Meus dados: sem cargo e lotação não salva');
  ok(await p.locator('#edu-s-cargo option', { hasText: 'Coordenador de Unidade' }).count() === 1, 'cargo: opção "Coordenador de Unidade"');
  await p.fill('#edu-s-nome', 'Pessoa Ficticia Edu'); await p.selectOption('#edu-s-cargo', { index: 1 }); await p.fill('#edu-s-matricula', '12345'); await p.selectOption('#edu-s-lotacao', 'Manaus');
  await p.click('#edu-s-salvar'); await p.waitForSelector('#edu-novo');
  ok(/Meus termos de educação sanitária/.test(await p.textContent('#view')) && await p.locator('.edu-item').count() === 3, 'lista "Meus termos de educação sanitária": os 3 termos que a planilha já tinha deste servidor');
  await p.click('#edu-novo'); await p.waitForSelector('#eduForm');
  // obrigatórios, um de cada vez
  const aviso = async () => (await p.textContent('#toast')).trim();
  const tenta = async txt => { await p.click('#edu-gravar'); await p.waitForTimeout(150); const a = await aviso(); ok(txt.test(a), 'obrigatório: ' + txt, a); };
  await p.fill('#edu-data', ''); await tenta(/Informe a data/);
  await p.fill('#edu-data', '2099-01-01').catch(() => {}); await p.evaluate(() => { document.querySelector('#edu-data').value = '2099-01-01'; }); await tenta(/não pode ser futura/);
  await p.evaluate(() => { document.querySelector('#edu-data').value = hojeISO(); });
  await p.selectOption('#edu-municipio', ''); await tenta(/município/);
  await p.selectOption('#edu-municipio', 'Manaus'); await tenta(/local da ação/);
  await p.fill('#edu-local', 'Feira da Banana Fictícia'); await tenta(/tipo de medida/);
  await p.selectOption('#edu-medida', 'Outro'); ok(await p.isVisible('#edu-medida-outro'), 'tipo "Outro" pede o texto'); await tenta(/Descreva o tipo de medida/);
  await p.fill('#edu-medida-outro', 'Visita em barco fictícia'); await tenta(/público-alvo/);
  await p.check('input[name=edu-publico][value="Outro"]'); await p.check('input[name=edu-publico][value="Feirantes"]'); await tenta(/Descreva o público-alvo/);
  await p.fill('#edu-publico-outro', 'Ribeirinhos'); await tenta(/programas/);
  await p.check('input[name=edu-programa][value="Pragas dos Citros"]'); await p.check('input[name=edu-programa][value="Outro"]'); await tenta(/Descreva o programa/);
  await p.fill('#edu-programa-outro', 'Praga fictícia'); await tenta(/Descreva a ação/);
  await p.fill('#edu-descricao', 'Orientação sobre o trânsito de mudas e frutos.'); await tenta(/pessoas orientadas/);
  await p.fill('#edu-pessoas', '-2'); await tenta(/pessoas orientadas/);
  await p.fill('#edu-pessoas', '18'); await p.fill('#edu-folders', '1.5'); await tenta(/folders/);
  ok((await p.locator('input[name=edu-programa]').allTextContents()).length >= 0 && await p.locator('input[name=edu-programa]').count() === 7, 'programas: os 6 do catálogo do PCE + Outro', await p.locator('input[name=edu-programa]').count());
  // rascunho automático: sai sem gravar e volta
  await p.fill('#edu-folders', '25'); await p.fill('#edu-obs', 'Observação fictícia'); await p.waitForTimeout(700);
  const rasc = await p.evaluate(() => Store.meta('educacaoRascunho'));
  ok(rasc && rasc.v.local === 'Feira da Banana Fictícia' && rasc.v.publicoAlvo.includes('Ribeirinhos') === false && rasc.v.publicoAlvo.includes('Outro') && rasc.v.pessoas === '18', 'rascunho salvo no aparelho enquanto preenche', rasc && rasc.v);
  await p.click('#edu-voltar'); await p.waitForSelector('#edu-novo'); await p.click('#edu-novo'); await p.waitForSelector('#edu-rascunho');
  ok(await p.inputValue('#edu-local') === 'Feira da Banana Fictícia' && await p.inputValue('#edu-pessoas') === '18' && await p.isChecked('input[name=edu-publico][value="Feirantes"]') && await p.inputValue('#edu-publico-outro') === 'Ribeirinhos' && await p.inputValue('#edu-obs') === 'Observação fictícia', 'ao reabrir o formulário o rascunho volta preenchido');
  await p.click('#edu-gravar'); await p.waitForSelector('#edu-termo-num');
  // o servidor já tinha 001 e 002 (e 003 não existe): o próximo é 003? 002 está cancelado e continua ocupando; 001 e 002 usados → 003
  const num1 = await p.textContent('#edu-termo-num');
  ok(num1 === `003.${ANO}.MANAUS`, 'online: número confirmado pela planilha (próximo livre da unidade)', num1);
  ok(/Número confirmado na planilha/.test(await p.textContent('#edu-termo')) && !(await p.evaluate(() => Store.meta('educacaoRascunho'))), 'termo gravado e confirmado; o rascunho é apagado');
  linhas = await aba('TermosEducacao');
  const l3 = linhas.find(x => x.numeroTxt === `003.${ANO}.MANAUS`) || {};
  ok(l3.usuario === 'Pessoa Ficticia Edu Com' && l3.servidor === 'Pessoa Ficticia Edu' && l3.cargo && l3.matricula === '12345' && l3.lotacao === 'Manaus' && l3.municipio === 'Manaus' && l3.local === 'Feira da Banana Fictícia'
    && l3.tipoMedida === 'Outro' && l3.tipoMedidaOutro === 'Visita em barco fictícia' && l3.publicoAlvo === '["Feirantes","Outro"]' && l3.publicoOutro === 'Ribeirinhos' && l3.programas === '["Pragas dos Citros","Outro"]' && l3.programaOutro === 'Praga fictícia'
    && Number(l3.pessoas) === 18 && Number(l3.folders) === 25 && l3.obs === 'Observação fictícia' && Number(l3.cancelado) === 0 && Number(l3.excluido) === 0 && Number(l3.conflito) === 0, 'aba TermosEducacao: todos os campos do formulário, servidor e usuario', l3);

  console.log('3. App: impressão e PDF');
  const imp = async () => { await p.evaluate(() => { window.__prints = []; }); await p.click('#edu-imprimir'); await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 }); return p.evaluate(() => window.__prints[window.__prints.length - 1]); };
  const pr = await imp();
  ok(pr.paginas === 1 && /TERMO DE EDUCAÇÃO SANITÁRIA Nº/.test(pr.texto) && /003/.test(pr.texto) && new RegExp(String(ANO)).test(pr.texto) && /MANAUS/.test(pr.texto), 'impressão: título, número (003 - ano - unidade) e uma folha', pr.texto.slice(0, 200));
  ok(['Feira da Banana Fictícia', 'Visita em barco fictícia', 'Ribeirinhos', 'Praga fictícia', 'Orientação sobre o trânsito de mudas e frutos.', 'Observação fictícia', 'Pessoa Ficticia Edu', 'Mat. 12345']
    .every(t => pr.texto.includes(t)) && /Pessoas orientadas:\s*18/.test(pr.texto) && /Folders \/ flyers entregues:\s*25/.test(pr.texto), 'impressão: local, medida, público, programas, descrição, pessoas, folders, observações e servidor', pr.texto);
  const marcadas = [...pr.html.matchAll(/<span class="op"><span class="cx on"><\/span>([^<]+)/g)].map(m => m[1].replace(/: $/, ''));
  ok(['Outro', 'Feirantes', 'Pragas dos Citros'].every(t => marcadas.includes(t)) && !marcadas.includes('Palestra') && /ADAF/.test(pr.texto) && /Assinatura e identificação do servidor/.test(pr.texto)
    && ['brasao.png', 'logo-adaf.png', 'sepror.png'].every(n => pr.html.includes(n)), 'impressão: caixas marcadas certas, cabeçalho e rodapé com logos (brasão, ADAF, SEPROR) e assinatura do servidor', marcadas);
  await require('./lib/pce-app').salvarPdf(p, pr, 'educacao-termo.html', 'educacao_termo');
  const baixou = p.waitForEvent('download', { timeout: 60000 });
  await p.click('#edu-arquivo');
  const dl = await baixou;
  ok(/^Termo_Educacao_Sanitaria_003\.\d{4}\.MANAUS\.pdf$/.test(dl.suggestedFilename()), 'Gerar arquivo PDF: baixa o PDF do termo', dl.suggestedFilename());
  const arq = amb.saida('educacao_arquivo.pdf'); await dl.saveAs(arq);
  ok(require('fs').readFileSync(arq).slice(0, 5).toString() === '%PDF-', 'o arquivo gerado é um PDF');

  console.log('4. App: sem internet (número provisório), conflito, cancelar, permissão tirada');
  await p.evaluate(() => go('educacao')); await p.waitForSelector('#edu-novo');
  // outro servidor usa o 004 antes de este aparelho saber (ele não sincroniza mais até ficar sem internet); o registro do outro é mais antigo e vale
  r = await post({ action: 'educacaoRegistrar', key: outro.token, registro: reg('edu-c-4', { numero: 4, lotacao: 'Manaus', servidor: 'Pessoa Ficticia Edu Outra', criadoEm: 1000, atualizadoEm: Date.now() }) });
  ok(r.ok && r.emitido, 'outro servidor registra o 004 na planilha', r);
  await p.ctx.setOffline(true); await fetch(API + '/__off'); await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await p.click('#edu-novo'); await p.waitForSelector('#eduForm');
  await p.fill('#edu-local', 'Porto Fictício'); await p.selectOption('#edu-medida', 'Abordagem'); await p.check('input[name=edu-publico][value="Produtores"]');
  await p.check('input[name=edu-programa][value="Pragas dos Citros"]'); await p.fill('#edu-descricao', 'Abordagem sem internet.'); await p.fill('#edu-pessoas', '0');
  await p.click('#edu-gravar'); await p.waitForSelector('#edu-termo-num');
  const num2 = await p.textContent('#edu-termo-num');
  ok(num2 === `004.${ANO}.MANAUS`, 'sem internet: número provisório (último conhecido + 1)', num2);
  const loc = await p.evaluate(async () => (await Store.todos('termosEducacao')).find(t => t.local === 'Porto Fictício'));
  ok(loc.pendente === 1 && loc.provisorio === 1 && loc.numeroOrigem === 'provisorio' && Number(loc.folders) === 0, 'registro guardado no aparelho como pendente e provisório', loc);
  ok(/número provisório/.test(await p.textContent('#edu-termo')) && !(await aba('TermosEducacao')).some(x => x.local === 'Porto Fictício'), 'a planilha ainda não tem o termo');
  await fetch(API + '/__on');
  await p.ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await sincronizar(p); await amb.esperar(p, () => Store.todos('termosEducacao').then(l => l.every(t => !t.pendente)), null, 20000);
  const sinc = await p.evaluate(async () => (await Store.todos('termosEducacao')).find(t => t.local === 'Porto Fictício'));
  const l4 = (await aba('TermosEducacao')).find(x => x.local === 'Porto Fictício') || {};
  ok(l4.numeroTxt === `004.${ANO}.MANAUS` && l4.usuario === 'Pessoa Ficticia Edu Com' && Number(l4.conflito) === 1, 'ao sincronizar: o termo sobe com o número provisório e a planilha marca o conflito (o mais antigo vale)', l4);
  ok(sinc && Number(sinc.conflito) === 1 && !sinc.pendente, 'o aparelho recebe a marca de conflito', sinc);
  await p.evaluate(() => go('educacao')); await p.waitForSelector('.edu-item');
  const ordem = await p.locator('.edu-item .placa').allTextContents();
  ok(ordem.length === 5 && ordem.slice(0, 2).join() === `004.${ANO}.MANAUS,003.${ANO}.MANAUS`, 'lista: mais recentes primeiro (só os termos deste servidor)', ordem);
  ok(/Número duplicado na planilha/.test(await p.textContent('#eduItens')), 'lista mostra o aviso de número duplicado');
  // cancelar com motivo
  await p.locator('.edu-item', { hasText: `003.${ANO}.MANAUS` }).click(); await p.waitForSelector('#edu-cancelar');
  p.motivo = '   ';
  await p.click('#edu-cancelar'); await p.waitForTimeout(300);
  ok(/Informe o motivo/.test(await aviso()) && Number((await aba('TermosEducacao')).find(x => x.numeroTxt === `003.${ANO}.MANAUS`).cancelado) === 0, 'cancelar sem motivo: não cancela');
  p.motivo = 'Termo lançado em duplicidade (teste)';
  await p.click('#edu-cancelar'); await p.waitForFunction(() => /CANCELADO/.test(document.querySelector('#view').textContent), null, { timeout: 15000 });
  await amb.esperar(p, () => Store.todos('termosEducacao').then(l => l.every(t => !t.pendente)), null, 20000);
  const lc = (await aba('TermosEducacao')).find(x => x.numeroTxt === `003.${ANO}.MANAUS`);
  ok(Number(lc.cancelado) === 1 && lc.motivoCancel === 'Termo lançado em duplicidade (teste)' && Number(lc.excluido) === 0 && lc.usuario === 'Pessoa Ficticia Edu Com', 'cancelado com motivo na planilha (sem apagar; quem cancelou: usuario)', lc);
  ok(await p.locator('#edu-cancelar').count() === 0 && /CANCELADO: Termo lançado/.test(await p.textContent('#edu-termo')), 'tela do termo mostra CANCELADO e o motivo');
  const pc = await imp();
  ok(/CANCELADO: Termo lançado em duplicidade/.test(pr.texto) === false && /CANCELADO: Termo lançado em duplicidade/.test(pc.texto), 'o PDF do termo cancelado sai com a faixa CANCELADO e o motivo');
  // gerência grava as permissões sem educacaoSanitaria: o módulo continua (liberado para todos) e os registros ficam guardados
  const pe = await p.evaluate(() => Store.todos('termosEducacao').then(l => l.length));
  const uid = com.usuario.id;
  r = await U.permissoes(uid, ['campo']); ok(r.ok, 'gerência grava as permissões sem educacaoSanitaria', r);
  await p.evaluate(() => Sync.sincronizar()).catch(() => {}); await p.waitForSelector('.modulo, #semModulos', { timeout: 15000 }).catch(() => {});
  await p.evaluate(() => go('modulos')); await p.waitForTimeout(500);
  ok(await p.locator('.modulo[data-v=educacao]').count() === 1 && await p.evaluate(() => Store.todos('termosEducacao').then(l => l.length)) === pe, 'sem a permissão antiga: o cartão continua e os termos continuam guardados no aparelho');
  r = await post({ action: 'educacaoProximoNumero', key: com.token, unidade: 'Manaus', ano: ANO });
  ok(r.ok, 'sem a permissão antiga o servidor continua aceitando', r);
  ok(p.err.length === 0, 'sem erros de JavaScript', p.err);
  await b.close();
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
