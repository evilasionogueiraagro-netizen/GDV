const amb = require('./lib/amb');
// Convênios → importação da planilha de movimentação financeira (.xlsx) e metas acompanhando o desembolso (físico × financeiro).
// Gera no próprio teste uma planilha SINTÉTICA no layout da planilha do gestor (abas "SUBETAPA x.y.z", cabeçalho "VALOR DA SUBETAPA",
// linha de total sem data, uma linha sem data/memo de valor avulso, memo repetido, data antes do início da execução, data fora da
// vigência, subetapa fora do plano, aba SOMA e aba CONSOLIDADA desatualizada) com NOMES FICTÍCIOS na coluna NOME; importa pelo painel
// (setInputFiles) — no Portal do Administrativo (a importação saiu do painel) —, confere a prévia (contagens, avisos, totais, SOMA), grava (action painelConvFinImportar), confere o Financeiro,
// reimporta sem duplicar, altera um valor e tira um memo (atualiza; o ausente só sai se marcado), e confere que nenhum nome chegou ao
// servidor (requisições e aba ConvFinanceiro) nem ao relatório. Metas: % financeiro, diárias usadas/previstas, "financeiro à frente do
// físico", custo por unidade, projeção do saldo; relatório mensal (impressão/PDF e .docx) com a tabela "Físico × Financeiro por etapa".
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const X = require(path.join(amb.RAIZ, 'web/painel/vendor/xlsx/xlsx.mini.min.js'));
const { API } = amb;
const PORTAL = require('./lib/portal');
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const gerar = (nome, perfil) => get('/__gerar?nome=' + encodeURIComponent(nome) + (perfil ? '&perfil=' + perfil : ''));
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 700))); if (!c) falhas++; };
const SAIDA = process.env.GDV_SAIDA_CONVFIN || '';
if (SAIDA) fs.mkdirSync(SAIDA, { recursive: true });
const shot = async (p, nome, full = true) => { await p.screenshot({ path: amb.saida('convfin_' + nome + '.png'), fullPage: full }); if (SAIDA) fs.copyFileSync(amb.saida('convfin_' + nome + '.png'), path.join(SAIDA, nome + '.png')); };
const py = (codigo, ...args) => { try { return execFileSync('python3', ['-c', codigo, ...args], { timeout: 60000 }).toString().trim(); } catch (e) { return null; } };
const quase = (a, b) => Math.abs(a - b) < 0.005;

// nomes fictícios na coluna NOME: nenhum pode sair do navegador
const NOMES = ['Fulano Fictício de Teste', 'Beltrana Imaginária Silva', 'Cicrano Inventado Souza', 'Servidora Exemplo Lima'];
const serial = iso => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
/** Aba no layout do gestor. linhas = [[data|null, memo|null, tipo, valor]]; total = linha final sem data (soma de tudo). */
function aba(cod, etapa, previsto, linhas, o = {}) {
  const soma = linhas.reduce((s, l) => s + l[3], 0), exec = o.executado != null ? o.executado : soma;
  const aoa = [['MOVIMENTAÇÃO FINANCEIRA CONVÊNIO VEGETAL', null, null, null, null, 'SALDO TOTAL', etapa],
    ['VALOR DA SUBETAPA', null, null, previsto, exec, previsto - exec, 'Descrição da etapa no plano de trabalho (texto do plano).'],
    ['DATA EMISSÃO', 'MEMO Nº', 'TIPO', 'SUBETAPA', 'NOME', 'Valor Original (R$)']];
  linhas.forEach((l, i) => aoa.push([l[0] ? serial(l[0]) : null, l[1], l[2], cod, NOMES[i % NOMES.length], l[3]]));
  aoa.push([null, null, 'DIÁRIA NM', cod, null, 0], [null, null, 'DIÁRIA NM', cod, null, null]);   // linhas vazias com 0
  aoa.push([null, null, null, null, NOMES[0], soma]);                                               // total da aba (sem data)
  return aoa;
}
function planilha(var2) {
  const A = {
    'SUBETAPA 1.4.3': aba('1.4.3', '1.4', 22680, [['2026-09-10', '300/2026', 'DIÁRIA NM', 600]], { executado: 700 }),          // cabeçalho ≠ total
    'SUBETAPA 1.4.4': aba('1.4.4', '1.4', 9240, [['2026-09-12', '303/2026', 'DIÁRIA NS', 9240]]),                              // item esgotado
    'SUBETAPA 1.5.4': aba('1.5.4', '1.5', 259200, [['2027-06-01', '500/2026', 'DIÁRIA TERCEIROS', 240], ['2026-08-10', '501/2026', 'DIÁRIA TERCEIROS', 1200]]),
    'SUBETAPA 1.10.3': aba('1.10.3', '1.10', 65520, [['2026-09-01', '200/2026', 'DIÁRIA NS', 25200], ['2026-10-01', '201/2026', 'DIÁRIA NS', 25200]]),
    'SUBETAPA 1.10.4': aba('1.10.4', '1.10', 159600, [[null, null, 'DIÁRIA NM', 2100], ['2026-02-23', '089/2026', 'DIÁRIA NM', 2100], ['2026-03-10', '090/2026', 'DIÁRIA NM', 1050],
      ['2026-04-02', '112/2026', 'DIÁRIA NM', 2100], ['2026-04-02', '112/2026', 'DIÁRIA NM', 2100], ['2026-09-15', '120/2026', 'DIÁRIA NM', var2 ? 4410 : 4200]]
      .concat(var2 ? [] : [['2026-10-05', '121/2026', 'DIÁRIA NM', 105]])),
    'SUBETAPA 1.10.5': aba('1.10.5', '1.10', 136080, [['2026-08-05', '700/2026', 'DIÁRIA NM', 45000], ['2026-09-05', '701/2026', 'DIÁRIA NM', 45000], ['2026-10-05', '702/2026', 'DIÁRIA NM', 45000]]),
    'SUBETAPA 1.14.5': aba('1.14.5', '1.14', 1512, [['2026-09-21', '602/2026', 'DIÁRIA NS', 1512]]),
    'SUBETAPA 1.14.6': aba('1.14.6', '1.14', 2520, [['2026-09-20', '600/2026', 'DIÁRIA NM', 2100], ['2026-10-02', '601/2026', 'DIÁRIA NM', 630]]),   // acima do previsto
    'SUBETAPA 9.9.9': aba('9.9.9', '9.9', 1000, [['2026-09-01', '400/2026', 'DIÁRIA NM', 100]])                                // fora do plano
  };
  const somaEt = {}; Object.values(A).forEach(a => { const et = a[0][6]; somaEt[et] = (somaEt[et] || 0) + a[a.length - 1][5]; });
  const soma = [['SUBETAPA', null, 'EXECUTADO', null]].concat(['1.4', '1.5', '1.10', '1.14'].map(e => [e, null, somaEt[e], null]));
  soma.push(['TOTAL', null, Object.values(somaEt).reduce((s, v) => s + v, 0), null]);
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['CONSOLIDADA (desatualizada)'], ['1.10.4', NOMES[1], 999999]]), 'CONSOLIDADA');
  Object.entries(A).forEach(([n, aoa], i) => { X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), n); if (i === 0) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(soma), 'SOMA '); });
  return { buf: X.write(wb, { type: 'buffer', bookType: 'xlsx' }), total: Object.values(somaEt).reduce((s, v) => s + v, 0) };
}

(async () => {
  console.log('1. Servidor: action admConvFinImportar do portal (validações e permissões)');
  await fetch(API + '/__fn?nome=desativarRotinasAutomaticas_');
  const adm = await gerar('Gerente Importação', 'admin'), TOK = (await post({ action: 'painelAtivar', codigo: adm.codigo })).token;
  const fis = await gerar('Fiscal Comum'), TOKF = (await post({ action: 'ativar', codigo: fis.codigo })).token;
  const SA = await PORTAL.sessao(TOK, 'importacao.adm@gmail.com', 'Iara Importadora Administrativa');
  const IMP = (itens, extra = {}) => post({ action: 'admConvFinImportar', sessao: SA.sessao, convenio: '991272-2025', arquivo: 'teste.xlsx', itens, ...extra });
  const L0 = { chave: 'imp|991272-2025|1.14.3|1/2026', item: '1.14.3', etapa: '1.14', data: '2026-09-01', valor: 120, documento: 'Memo nº 1/2026', quantidade: 1, fonte: 'concedente', descricao: 'Diária NM' };
  let d = await post({ action: 'painelConvFinImportar', key: TOKF, convenio: '991272-2025', itens: [L0] }); ok(!d.ok && /Acesso restrito/.test(d.erro), 'fiscal comum recusado', d.erro);
  d = await post({ action: 'painelConvFinImportar', key: TOK, convenio: '991272-2025', itens: [L0] }); ok(!d.ok && /Portal do Administrativo/.test(d.erro), 'painel não importa mais (só o portal)', d.erro);
  d = await post({ action: 'admConvFinImportar', sessao: TOKF, convenio: '991272-2025', itens: [L0] }); ok(!d.ok && /Sessão do portal/.test(d.erro), 'credencial de fiscal não vale no portal', d.erro);
  const erros = [
    [[{ ...L0, chave: 'outra|1' }], /chave de importação inválida/], [[{ ...L0, item: '1.4.3' }], /não existe na etapa/], [[{ ...L0, data: '2028-01-01' }], /fora da vigência/],
    [[{ ...L0, valor: -5 }], /valor inválido/], [[{ ...L0, descricao: 'Diária de 529.982.247-25' }], /CPF/], [[L0, L0], /chave repetida/],
    [Array.from({ length: 501 }, (_, i) => ({ ...L0, chave: L0.chave + i })), /No máximo 500/], [[], /Nada a importar/]];
  for (const [itens, re] of erros) { d = await IMP(itens); ok(!d.ok && re.test(d.erro), 'validação: ' + re.source, d.erro || d); }
  d = await post({ action: 'admConvLancar', sessao: SA.sessao, lancamento: { convenio: '991272-2025', etapa: '1.14', submeta: 'jundia', data: '2026-09-20', quantidade: 2, descricao: 'Supervisões na BVA' } });
  ok(d.ok, 'execução física: 2 supervisões (1.14) para o custo por unidade');

  const P1 = planilha(false), ARQ = amb.saida('convfin_MOVIMENTACAO_teste.xlsx'); fs.writeFileSync(ARQ, Buffer.from(P1.buf));
  const P2 = planilha(true), ARQ2 = amb.saida('convfin_MOVIMENTACAO_teste_v2.xlsx'); fs.writeFileSync(ARQ2, Buffer.from(P2.buf));
  ok(Buffer.from(P1.buf).slice(0, 2).toString() === 'PK', 'planilha sintética gerada (.xlsx, SheetJS vendorizada no Node)', ARQ);

  /* ================= painel ================= */
  console.log('2. Portal do Administrativo → Desembolso → importar a planilha');
  const b = await amb.lancar(), errosPag = [], corpos = [];
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
  await ctx.addInitScript(([tok, url]) => {
    if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', url); localStorage.setItem('gdv.painel.token', tok); localStorage.setItem('gdv.painel.nome', 'Gerente Importação'); }
    if (window !== window.top) window.print = () => { window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: document.body.innerText.replace(/\s+/g, ' ') }); };
  }, [TOK, amb.API_URL]);
  const p = await ctx.newPage();
  p.on('pageerror', e => errosPag.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errosPag.push(m.text()); });
  p.on('dialog', dl => dl.accept());
  const xlsxBaixado = [];
  p.on('request', r => { if (r.postData()) corpos.push(r.postData()); if (/xlsx\.mini/.test(r.url())) xlsxBaixado.push(r.url()); });
  await p.goto(amb.PAINEL);
  await p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 30000 });
  await p.click('.pn-aba[data-aba=convenios]'); await p.waitForSelector('.pn-conv-etapa', { timeout: 20000 });
  await p.selectOption('#pn-conv-mes', '2026-10');
  await p.waitForFunction(() => { const s = Painel.aba('convenios').estado(); return s.R && s.R.mes === '2026-10'; }, null, { timeout: 20000 });
  await p.click('[data-conv=visao][data-v=fin]'); await p.waitForSelector('#pn-conv-portal');
  ok(!(await p.$('#pn-conv-imp-arq')) && /Portal do Administrativo/.test(await p.textContent('#pn-conv-visao')), 'painel → Financeiro: a importação saiu do painel (aviso e link para o portal)');
  const recarregarPainel = async () => { await p.evaluate(() => Painel.aba('convenios').recarregar()); await p.waitForFunction(() => { const s = Painel.aba('convenios').estado(); return s.R && s.R.mes === '2026-10'; }, null, { timeout: 20000 }); };
  const pa = await PORTAL.abrir(b, SA, { aba: 'desembolso' });
  pa.on('request', r => { if (r.postData()) corpos.push(r.postData()); if (/xlsx\.mini/.test(r.url())) xlsxBaixado.push(r.url()); });
  await pa.waitForSelector('#pn-conv-imp-arq', { state: 'attached', timeout: 20000 });
  ok(!xlsxBaixado.length && await pa.evaluate(() => typeof window.XLSX === 'undefined'), 'SheetJS não é carregada com o portal (só no clique)');
  ok(/Importar planilha de movimentação \(\.xlsx\)/.test(await pa.textContent('.pn-conv-imp-btn')), 'botão "📥 Importar planilha de movimentação (.xlsx)" no Desembolso do portal');
  await pa.setInputFiles('#pn-conv-imp-arq', ARQ);
  await pa.waitForSelector('#pn-conv-imp-pv', { timeout: 20000 });
  ok(xlsxBaixado.length === 1 && /vendor\/xlsx\/xlsx\.mini\.min\.js/.test(xlsxBaixado[0]), 'SheetJS carregada da pasta vendor ao importar', xlsxBaixado);
  const pv = () => pa.evaluate(() => AdmConvenio.estado().imp);
  let V = await pv();
  const T = V.totais;
  ok(T.linhas === 20 && T.novos === 17 && T.iguais === 0 && T.alterados === 0, 'prévia: 20 lançamentos na planilha (total da aba e linhas zeradas fora), 17 novos', T);
  ok(T.repetidas === 1 && T.repetidasFora === 1 && T.semData === 1 && T.bloqueadas === 2 && T.antesInicio === 2, 'prévia: 1 memo repetido (fora por padrão), 1 sem data, 2 bloqueadas (fora da vigência, subetapa fora do plano), 2 antes do início', T);
  ok(quase(T.valorPlanilha, P1.total) && quase(T.valorGravar, 212337), 'prévia: total da planilha = aba SOMA; a gravar R$ 212.337,00', [T.valorPlanilha, P1.total, T.valorGravar]);
  ok(V.soma && V.soma.total.ok && V.soma.etapas.filter(e => e.etapa !== '9.9').every(e => e.ok), 'conferência com a aba SOMA (total e por etapa)', V.soma);
  ok(V.abasIgnoradas.includes('CONSOLIDADA'), 'aba CONSOLIDADA (desatualizada) não usada', V.abasIgnoradas);
  const sd = V.linhas.find(l => !l.dataPlanilha);
  ok(sd && sd.data === '2026-02-23' && sd.aba === 'SUBETAPA 1.10.4' && sd.importar && sd.chave === 'imp|991272-2025|1.10.4||2100.00|1', 'linha sem data: data padrão = 1º lançamento datado da aba; chave sem memo', sd);
  const rp = V.linhas.find(l => l.repetido);
  ok(rp && rp.memo === '112/2026' && rp.status === 'repetida' && !rp.importar, 'memo 112/2026 repetido: marcado e não importado por padrão', rp);
  const l089 = V.linhas.find(l => l.memo === '89/2026');
  ok(l089 && l089.chave === 'imp|991272-2025|1.10.4|89/2026' && l089.documento === 'Memo nº 89/2026' && l089.descricao === 'Diária NM' && l089.quantidade === 10 && l089.avisos.includes('antes do início da execução'),
    'memo 089/2026: chave sem zeros à esquerda, documento, "Diária NM", 10 diárias (2.100 ÷ 210), aviso de antes do início', l089);
  ok(V.linhas.find(l => l.memo === '500/2026').bloqueio === 'data fora da vigência' && /não existe no plano/.test(V.linhas.find(l => l.sub === '9.9.9').bloqueio), 'bloqueios: data fora da vigência; subetapa 9.9.9 fora do plano', V.linhas.filter(l => l.bloqueio).map(l => l.bloqueio));
  const it = id => V.itens.find(y => y.id === id);
  ok(it('1.4.3').avisos.some(a => /total da aba .* ≠ executado do cabeçalho/.test(a)) && it('1.14.6').avisos.some(a => /acima do previsto/.test(a)), 'avisos: total da aba ≠ cabeçalho (1.4.3); executado > previsto (1.14.6)', [it('1.4.3').avisos, it('1.14.6').avisos]);
  ok(it('1.10.5').diarias === 1125 && it('1.5.4').diarias === 10 && quase(it('1.10.4').gravar, 11655), 'diárias equivalentes por item (1.10.5: 1.125; 1.5.4: 10) e soma importada da 1.10.4 (R$ 11.655,00)', [it('1.10.5'), it('1.10.4').gravar]);
  const telaPv = await pa.textContent('#pn-conv-imp-pv');
  ok(/memorando\(s\) repetido/.test(telaPv) && /Conferência com a aba SOMA/.test(telaPv) && /Linhas que pedem decisão/.test(telaPv) && /Gravar 17 lançamento/.test(telaPv), 'prévia na tela: avisos, SOMA, decisões e botão "Gravar 17"');
  ok(!NOMES.some(n => telaPv.includes(n)) && !NOMES.some(n => JSON.stringify(V).includes(n)), 'prévia sem nenhum nome da coluna NOME (nem na tela nem no estado)');
  // escolher a data da linha sem data
  await pa.fill('[data-imp-data]', '2026-03-05'); await pa.dispatchEvent('[data-imp-data]', 'change');
  await pa.waitForFunction(() => AdmConvenio.estado().imp.linhas.find(l => !l.dataPlanilha).data === '2026-03-05', null, { timeout: 5000 });
  V = await pv();
  ok(V.totais.antesInicio === 1, 'data escolhida para a linha sem data (05/03/2026): sai do aviso de antes do início', V.totais.antesInicio);
  await pa.click('#pn-conv-imp-pv summary');
  await shot(p, 'previa_importacao');
  // gravar
  await pa.click('#pn-conv-imp-gravar');
  await pa.waitForFunction(() => /Importado/.test((document.querySelector('[data-msg=imp]') || {}).textContent || ''), null, { timeout: 30000 });
  await pa.waitForFunction(() => { const s = AdmConvenio.estado(); return !s.imp && s.dados && s.dados.financeiro.length >= 17; }, null, { timeout: 30000 });
  await recarregarPainel();
  let aba = await get('/__aba?nome=ConvFinanceiro');
  const cab = aba[0], col = c => cab.indexOf(c), vivas = () => aba.slice(1).filter(r => r[col('excluido')] !== 1);
  ok(vivas().length === 17 && vivas().every(r => r[col('origem')] === 'planilha' && /^imp\|991272-2025\|/.test(r[col('chave')]) && r[col('arquivo')] === 'convfin_MOVIMENTACAO_teste.xlsx' && r[col('importadoEm')] > 0 && r[col('usuario')] === 'Iara Importadora Administrativa'),
    'ConvFinanceiro: 17 linhas com origem "planilha", chave, arquivo, quando e quem importou', aba.slice(0, 3));
  const rSd = vivas().find(r => r[col('chave')] === 'imp|991272-2025|1.10.4||2100.00|1');
  ok(rSd && rSd[col('data')] === '2026-03-05' && rSd[col('fonte')] === 'concedente' && rSd[col('natureza')] === '33.90.14', 'linha sem data gravada com a data escolhida; fonte = repasse; natureza do item', rSd);
  const abaTxt = JSON.stringify(aba);
  ok(!NOMES.some(n => abaTxt.includes(n)), 'nenhum nome fictício gravado na planilha do servidor');
  ok(!NOMES.some(n => corpos.some(c => c.includes(n))), 'nenhum nome fictício em requisição alguma do navegador', corpos.length);
  const S = await p.evaluate(() => ({ fin: Painel.aba('convenios').estado().R.fin }));
  Object.assign(S, await pa.evaluate(() => ({ msg: document.querySelector('[data-msg=imp]').textContent, resumo: AdmConvenio.estado().impResumo })));
  const fe = id => S.fin.etapas.find(e => e.id === id), nat = n => S.fin.naturezas.find(x => x.natureza === n);
  ok(quase(fe('1.10').acum, 197055) && quase(fe('1.4').acum, 9840) && quase(fe('1.14').acum, 4242) && quase(fe('1.5').acum, 1200) && quase(S.fin.total.acum, 212337),
    'Financeiro recarregado: 1.10 R$ 197.055,00; 1.4 R$ 9.840,00; 1.14 R$ 4.242,00; 1.5 R$ 1.200,00; total R$ 212.337,00', S.fin.etapas.map(e => [e.id, e.acum]));
  ok(quase(nat('33.90.14').acum, 211137) && quase(nat('33.90.36').acum, 1200) && quase(S.fin.fonte.concedente.acum, 212337), 'por natureza: 33.90.14 R$ 211.137,00; 33.90.36 R$ 1.200,00; tudo no repasse', [nat('33.90.14').acum, nat('33.90.36').acum]);
  ok(S.resumo && S.resumo.novos === 17 && /17 novo/.test(S.msg), 'resumo depois de gravar (17 novos)', S.msg);
  const telaFin = await pa.textContent('#pn-conv-visao');
  ok(/Memo nº 702\/2026/.test(telaFin) && /Planilha/.test(telaFin) && /Última importação/.test(telaFin), 'lista de lançamentos com memo e origem "Planilha"');
  await shot(p, 'financeiro_depois');

  console.log('3. Reimportar (não duplica), alterar valor e tirar um memo');
  await pa.setInputFiles('#pn-conv-imp-arq', ARQ); await pa.waitForSelector('#pn-conv-imp-pv', { timeout: 20000 });
  V = await pv();
  ok(V.totais.novos === 0 && V.totais.iguais === 17 && V.totais.alterados === 0 && V.envio.length === 0, 'mesma planilha de novo: 0 novos, 17 iguais (a linha sem data mantém a data escolhida)', V.totais);
  ok(await pa.isDisabled('#pn-conv-imp-gravar') && /Nada novo/.test(await pa.textContent('#pn-conv-imp-gravar')), 'botão "Nada novo para gravar"');
  await pa.click('[data-conv=imp-cancelar]');
  await pa.setInputFiles('#pn-conv-imp-arq', ARQ2); await pa.waitForSelector('#pn-conv-imp-pv', { timeout: 20000 });
  V = await pv();
  ok(V.totais.alterados === 1 && V.totais.novos === 0 && V.totais.iguais === 15 && V.ausentes.length === 1 && V.ausentes[0].documento === 'Memo nº 121/2026',
    'planilha alterada: memo 120 com valor novo = alterado; memo 121 sumiu = "no sistema mas não na planilha"', [V.totais, V.ausentes.map(a => a.documento)]);
  ok(/No sistema mas não na planilha/.test(await pa.textContent('#pn-conv-imp-pv')), 'prévia lista o lançamento ausente com opção de excluir');
  await pa.check('[data-imp-exc]');
  await pa.waitForFunction(() => AdmConvenio.estado().imp.excluir.length === 1, null, { timeout: 5000 });
  const id120 = vivas().find(r => r[col('chave')] === 'imp|991272-2025|1.10.4|120/2026')[col('id')];
  await pa.click('#pn-conv-imp-gravar');
  await pa.waitForFunction(() => { const s = AdmConvenio.estado(); return !s.imp && s.impResumo && s.impResumo.atualizados === 1; }, null, { timeout: 30000 });
  await recarregarPainel();
  aba = await get('/__aba?nome=ConvFinanceiro');
  const r120 = aba.find(r => r[col('chave')] === 'imp|991272-2025|1.10.4|120/2026'), r121 = aba.find(r => r[col('chave')] === 'imp|991272-2025|1.10.4|121/2026');
  ok(aba.length - 1 === 17 && vivas().length === 16, 'nenhuma linha nova na planilha do servidor (17 linhas; 16 valendo)', [aba.length - 1, vivas().length]);
  ok(r120[col('id')] === id120 && Number(r120[col('valor')]) === 4410 && Number(r120[col('quantidade')]) === 21, 'memo 120/2026 atualizado na mesma linha (R$ 4.410,00; 21 diárias)', r120);
  ok(r121[col('excluido')] === 1, 'memo 121/2026 marcado: exclusão lógica', r121);
  ok(!NOMES.some(n => JSON.stringify(aba).includes(n) || corpos.some(c => c.includes(n))), 'segunda importação também sem nomes no servidor');

  console.log('4. Metas: físico × financeiro, diárias, custo por unidade e projeção');
  await p.click('[data-conv=visao][data-v=metas]'); await p.waitForSelector('.pn-conv-ff');
  const M = await p.evaluate(() => { const R = Painel.aba('convenios').estado().R; return { ff: R.ff, alertas: R.alertas, e: Object.fromEntries(R.etapas.map(r => [r.id, { pct: r.pct, ff: r.ff }])) }; });
  const e110 = M.e['1.10'].ff, e114 = M.e['1.14'].ff, e14 = M.e['1.4'].ff;
  ok(quase(e110.financeiro, 197160 / 409200) && e110.fisico === 0 && e110.situacao === 'financeiro' && e110.alerta, '1.10: financeiro 48,18% × físico 0% → "financeiro à frente do físico" (alerta)', e110 && [e110.financeiro, e110.fisico, e110.situacao]);
  ok(M.alertas.some(a => /Etapa 1\.10: financeiro à frente do físico/.test(a.titulo) && /gasto de diárias adiantado em relação à execução/.test(a.detalhe)), 'alerta "gasto de diárias adiantado em relação à execução"', M.alertas.map(a => a.titulo));
  ok(quase(e110.diarias.usadas, 200 + 56 + 1125) && e110.diarias.previstas === 260 + 760 + 1134, '1.10: diárias usadas 1.381 de 2.154 previstas (33.90.14)', e110.diarias);
  ok(quase(M.ff.diariasUsadas, 1381 + 5 + 70 + 10 + 6 + 13) && M.ff.frente === 1, 'resumo: diárias usadas no convênio e 1 etapa com financeiro à frente', M.ff);
  ok(e114.situacao === 'fisico' && quase(e114.custo.real, 4242 / 2) && quase(e114.custo.previsto, 25512 / 6) && quase(e114.custo.razao, (4242 / 2) / (25512 / 6)),
    '1.14: físico à frente; custo por supervisão R$ 2.121,00 × previsto R$ 4.252,00', e114.custo);
  ok(e110.custo.real === null && quase(e110.custo.previsto, 409200 / 18000), '1.10 sem veículos: custo real "—"; previsto R$ 22,73 por veículo', e110.custo);
  // ritmo da 1.10 (ago–out): ago 45.000; set 25.200 + 4.410 + 45.000; out 25.200 + 45.000 (121 excluído) → 63.270/mês; saldo 212.040 → 4 meses → fev/2027
  ok(quase(e110.projecao.ritmo, 189810 / 3) && e110.projecao.mesFim === '2027-02' && e110.projecao.antes, '1.10: projeção — saldo acaba em fev/2027, antes do fim da vigência', e110.projecao);
  ok(M.alertas.some(a => /Etapa 1\.10: no ritmo atual o saldo acaba em fevereiro\/2027/.test(a.titulo)), 'alerta da projeção do saldo', M.alertas.map(a => a.titulo));
  ok(e14.itens.find(i => i.id === '1.4.4').situacao === 'esgotado' && e14.situacao === 'equilibrado', '1.4.4 esgotado (projeção por item); 1.4 equilibrado (7,0% × 0%)', [e14.itens.find(i => i.id === '1.4.4'), e14.situacao]);
  const kp = await p.textContent('.pn-kpis');
  ok(/Financeiro à frente do físico/.test(kp) && /1 de 7/.test(kp) && /Diárias usadas/.test(kp), 'KPIs no topo: financeiro à frente (1 de 7) e diárias usadas', kp.slice(0, 400));
  const tff = await p.textContent('#pn-conv-visao');
  ok(/Físico × financeiro/.test(tff) && /Financeiro à frente do físico/.test(tff) && /acaba em fevereiro\/2027 \(antes do fim da vigência\)/.test(tff) && /R\$\s?2\.121,00 \/ supervisões/.test(tff), 'tabela físico × financeiro na tela (situação, custo por unidade, projeção)');
  ok(/Financeiro\s*48,18%/.test(await p.textContent('.pn-conv-etapa[data-etapa="1.10"] .pn-conv-ff')), 'cartão da etapa 1.10: % financeiro e situação');
  await p.click('.pn-conv-etapa[data-etapa="1.10"] summary');
  await p.waitForFunction(() => document.querySelectorAll('.pn-conv-etapa[data-etapa="1.10"] canvas').length === 2, null, { timeout: 10000 });
  ok(/Físico × financeiro \(% acumulado\)/.test(await p.textContent('.pn-conv-etapa[data-etapa="1.10"] .pn-conv-det-corpo')), 'detalhe da etapa: gráfico "Físico × financeiro (% acumulado)" e projeção por item');
  await p.waitForTimeout(1500); await shot(p, 'metas_fisico_financeiro');
  // recorte da etapa (sem redimensionar a janela: os gráficos não ficam no meio da animação de redimensionamento)
  await p.locator('.pn-conv-etapa[data-etapa="1.10"]').screenshot({ path: amb.saida('convfin_metas_etapa_1_10.png') });
  if (SAIDA) fs.copyFileSync(amb.saida('convfin_metas_etapa_1_10.png'), path.join(SAIDA, 'metas_etapa_1_10.png'));

  console.log('5. Relatório mensal com a tabela Físico × Financeiro');
  await p.click('[data-conv=visao][data-v=rel]'); await p.click('#pn-conv-rel-abrir'); await p.waitForSelector('#pn-conv-rel-form');
  await p.evaluate(() => { window.__prints = []; });
  await p.click('#pn-cr-imprimir');
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 20000 });
  const tx = (await p.evaluate(() => window.__prints[0])).texto;
  ok(/Físico × Financeiro por etapa/.test(tx) && /Físico × financeiro: a etapa 1\.10 \(financeiro 48,18% × físico 0,00%; \+48,2 p\.p\.\) apresenta desembolso adiantado/.test(tx), 'relatório (PDF/impressão): tabela e frase automática da etapa com financeiro adiantado', (tx.match(/Físico × financeiro:.{0,200}/) || [''])[0]);
  ok(/R\$ 2\.121,00 × R\$ 4\.252,00/.test(tx) && /Financeiro à frente do físico/.test(tx), 'relatório: custo por unidade (real × previsto) e situação');
  ok(!NOMES.some(n => tx.includes(n)), 'relatório sem nomes');
  const [dlPdf] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.click('#pn-cr-pdf')]);
  const pdfArq = amb.saida('convfin_' + dlPdf.suggestedFilename()); fs.writeFileSync(pdfArq, fs.readFileSync(await dlPdf.path()));
  const npag = Number(py('import sys,pypdf;print(len(pypdf.PdfReader(sys.argv[1]).pages))', pdfArq));
  ok(fs.readFileSync(pdfArq).slice(0, 5).toString() === '%PDF-' && (npag >= 4 || isNaN(npag)), 'PDF baixado', [pdfArq, npag]);
  const [dlDoc] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#pn-cr-docx')]);
  const docArq = amb.saida('convfin_' + dlDoc.suggestedFilename()); fs.writeFileSync(docArq, fs.readFileSync(await dlDoc.path()));
  const info = py(`import sys,json,docx
d=docx.Document(sys.argv[1])
print(json.dumps({'n':len(d.tables),'txt':'\\n'.join(p.text for p in d.paragraphs),'cel':[c.text for t in d.tables for r in t.rows for c in r.cells]}))`, docArq);
  const W = info ? JSON.parse(info) : null;
  if (W) {
    const cel = W.cel.join(' | ');
    ok(W.n === 5 && /% financeiro/.test(cel) && /Financeiro à frente do físico/.test(cel) && /48,18%/.test(cel) && /Físico × financeiro: a etapa 1\.10/.test(W.txt), 'Word: 5 tabelas, com a Físico × Financeiro e a frase automática', [W.n, cel.slice(0, 200)]);
    ok(!NOMES.some(n => (W.txt + cel).includes(n)), 'Word sem nomes');
  } else console.log('  (python-docx indisponível: .docx não conferido por dentro)');

  console.log('6. Celular (390 px): prévia sem rolagem horizontal');
  const pc = await PORTAL.abrir(b, SA, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, aba: 'desembolso' });
  await pc.waitForSelector('#pn-conv-imp-arq', { state: 'attached', timeout: 20000 });
  await pc.setInputFiles('#pn-conv-imp-arq', ARQ); await pc.waitForSelector('#pn-conv-imp-pv', { timeout: 20000 });
  ok(await pc.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'celular: prévia sem rolagem horizontal',
    await pc.evaluate(() => [document.documentElement.scrollWidth, ...[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 391 && !(e.parentElement && e.parentElement.closest('.pn-tab-rolo')))].slice(0, 8).map(e => typeof e === 'number' ? e : e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right) + ' ' + (e.textContent || '').slice(0, 40))));
  await shot(pc, 'celular_previa');
  ok(!errosPag.length && !pa.errosPag.length, 'sem erros de JavaScript nas páginas', errosPag.concat(pa.errosPag).slice(0, 5));
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
