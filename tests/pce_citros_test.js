const amb = require('./lib/amb');
// PCE — formulário de cítricos no levantamento por praga ("🍊 Dados de citros"; IN 21/2018 e Portaria 317/2021): o card só aparece com card de
// praga de citros (da lista ou "Outra" digitada com citr/cancro/hlb/leprose…), praga de citros detectada pré-marca "Sim" na detecção (sem
// sobrescrever o que o fiscal marcou), comercial "não" esconde atividade/cultura/comercialização/propagação, tabela "Cultura do citros"
// com 2 linhas, salvar, sincronizar (coluna "citros" = JSON na aba Levantamentos), reabrir, PDF da praga de citros com "Dados de citros"
// (e o das outras pragas sem), remover a praga de citros (o card some, os dados ficam enquanto o formulário está aberto e a coluna fica
// vazia ao salvar), registro antigo sem a coluna (bloco vazio) e a validação do servidor (21 linhas, número negativo, opção desconhecida,
// texto longo). Só dados fictícios. Com GDV_SAIDA_CITROS=<pasta> copia a captura do card.
const fs = require('fs'), path = require('path');
const { API, APP } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 600))); if (!c) falhas++; };
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const linhaDe = async (aba, id) => { const t = await get('/__aba?nome=' + aba); const i = t[0].indexOf('id'); const l = t.find(r => r[i] === id); return l ? Object.fromEntries(t[0].map((c, k) => [c, l[k]])) : null; };
const json = v => { try { return JSON.parse(v); } catch (e) { return null; } };

(async () => {
  const b = await amb.lancar(), err = [];
  const g = await get('/__gerar?nome=' + encodeURIComponent('Ciclano Ficticio Teste'));
  const TOKF = (await post({ action: 'ativar', codigo: g.codigo })).token;
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.12, longitude: -60.02, accuracy: 9 }, timezoneId: 'America/Manaus' });
  await c.addInitScript(([t]) => {
    if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Ciclano Ficticio Teste'); localStorage.setItem('gdv.semInstalar', '1'); }
    if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' ') }); };
  }, [TOKF]);
  const p = await c.newPage(); p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  const sync = async () => { await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(900); };
  const visivel = () => p.isVisible('#pce-citros');
  const op = (k, v) => p.click(`#pce-citros label:has(input[name="pce-ci-${k}"][value="${v}"])`);
  const marcado = (k, v) => p.isChecked(`input[name="pce-ci-${k}"][value="${v}"]`);
  const card = i => `.pce-praga >> nth=${i}`;

  console.log('1. Card aparece só com praga de citros');
  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]'); await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
  await p.selectOption('#pce-s-cargo', { index: 1 }); await p.selectOption('#pce-s-lotacao', 'Manaus'); await p.click('#pce-s-salvar'); await p.waitForSelector('#pce-novolev');
  await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm');
  const pragas = await p.$$eval('.pce-praga >> nth=0 >> .p-praga option', os => os.map(o => o.textContent));
  ok(pragas.includes('Pinta Preta dos Citros') && pragas.includes('Leprose dos Citros') && pragas.includes('HLB / Greening'), 'lista de pragas com Pinta Preta e Leprose dos Citros (as anteriores continuam)');
  ok(await p.locator('#pce-citros').count() === 1 && !(await visivel()), 'formulário novo: card de citros escondido');
  await p.fill('#pce-doc', '52998224725'); await p.fill('#pce-nome', 'Fulano Ficticio Teste'); await p.fill('#pce-propriedade', 'Sítio Ficticio'); await p.fill('#pce-codigo', 'PRP-CIT-1');
  await p.selectOption(card(0) + ' >> .p-praga', 'Bactrocera carambolae');
  await p.selectOption(card(0) + ' >> .pce-cult >> nth=0 >> .c-cultura', 'Laranja'); await p.click(card(0) + ' >> .pce-cult >> nth=0 >> .pce-res-nao_detectada');
  ok(!(await visivel()), 'praga que não é de citros (Bactrocera carambolae): card ausente');
  await p.selectOption(card(0) + ' >> .p-praga', '__outra'); await p.fill(card(0) + ' >> .p-outra', 'Leprose em limoeiro');
  ok(await visivel(), '"Outra" digitada com "leprose": card aparece');
  await p.fill(card(0) + ' >> .p-outra', 'Cochonilha'); ok(!(await visivel()), '"Outra" sem termo de citros: card some');
  await p.selectOption(card(0) + ' >> .p-praga', 'Bactrocera carambolae');
  await p.click('#pce-addpraga'); await p.selectOption(card(1) + ' >> .p-praga', 'HLB / Greening');
  ok(await visivel(), 'card "HLB / Greening" adicionado: "Dados de citros" aparece');
  ok(/IN 21\/2018 e Portaria 317\/2021/.test(await p.textContent('#pce-citros h3')), 'título do card cita IN 21/2018 e Portaria 317/2021');
  await p.selectOption(card(1) + ' >> .pce-cult >> nth=0 >> .c-cultura', 'Laranja');
  ok(!(await marcado('det-hlb-tem', 'sim')), 'antes do resultado: detecção de HLB em branco');
  await p.click(card(1) + ' >> .pce-cult >> nth=0 >> .pce-res-detectada');
  ok(await marcado('det-hlb-tem', 'sim') && !(await marcado('det-cancro-tem', 'sim')) && !(await marcado('det-cancro-tem', 'nao')), 'HLB detectada: detecção de HLB pré-marcada "Sim" (cancro continua em branco)');

  console.log('2. Preencher o card (dados fictícios)');
  await op('comercial', 'sim');
  await p.fill('#pce-ci-cnpj', '11222333000181'); await p.press('#pce-ci-cnpj', 'Tab');
  ok(await p.inputValue('#pce-ci-cnpj') === '11.222.333/0001-81' && !(await p.textContent('#pce-ci-st-cnpj')).trim(), 'CNPJ formatado e aceito', await p.inputValue('#pce-ci-cnpj'));
  await p.fill('#pce-ci-endereco', 'Ramal Ficticio, km 3'); await p.fill('#pce-ci-uf', 'am');
  for (const v of ['viveiro_mudas', 'frutos', 'outros']) await p.check(`input[name="pce-ci-atividades"][value="${v}"]`);
  ok(await p.isVisible('#pce-ci-atividadeOutros'), 'atividade "Outros" abre o campo para especificar');
  await p.fill('#pce-ci-atividadeOutros', 'Pomar experimental');
  await op('situacao', 'arrendatario');
  await p.click('#pce-ci-addcult'); await p.click('#pce-ci-addcult');
  const lin = (i, k) => `#pce-ci-culturas .pce-ci-cult >> nth=${i} >> .ci-${k}`;
  const preencher = async (i, a, cv, ar, id, pl, pr) => { await p.selectOption(lin(i, 'atividade'), a); await p.fill(lin(i, 'cultivar'), cv); await p.fill(lin(i, 'area'), ar);
    await p.fill(lin(i, 'idade'), id); await p.fill(lin(i, 'plantas'), pl); await p.fill(lin(i, 'producao'), pr); };
  await preencher(0, 'frutos', 'Laranja Pera', '2,5', '6', '400', '12,5');
  await preencher(1, 'viveiro_mudas', 'Limão Tahiti', '1', '3', '150', '4');
  ok(await p.$$eval('#pce-ci-cultivares option', os => os.some(o => o.value === 'Tangerina Ponkan')), 'cultivar com sugestões (datalist)');
  await op('entrega', 'sim');
  for (const v of ['caixa', 'granel']) await p.check(`input[name="pce-ci-formasEntrega"][value="${v}"]`);
  for (const v of ['feira', 'outros']) await p.check(`input[name="pce-ci-compradores"][value="${v}"]`);
  await p.fill('#pce-ci-compradorOutros', 'Restaurante Ficticio');
  await op('beneficia', 'sim'); await p.fill('#pce-ci-beneficiaTipo', 'Lavagem e seleção');
  for (const v of ['muda', 'borbulha']) await p.check(`input[name="pce-ci-materiais"][value="${v}"]`);
  await p.fill('#pce-ci-origemMaterial', 'Viveiro Ficticio Registrado');
  await op('del-pintapreta-tem', 'nao');
  await op('det-cancro-tem', 'nao'); await p.fill('#pce-ci-det-hlb-tempo', '2 meses'); await op('det-acaro-tem', 'nao');
  await p.fill('#pce-ci-rt-nome', 'Fulano Ficticio Teste'); await p.fill('#pce-ci-rt-conselho', 'CREA-AM 00000');
  // comercial "não": esconde atividade/cultura/comercialização/propagação e mostra o tipo não comercial e a dica
  await op('comercial', 'nao');
  ok(await p.isHidden('#pce-ci-comercial-blocos') && await p.isVisible('#pce-ci-naocom') && /preencher só identificação, delimitação e detecção/.test(await p.textContent('#pce-ci-naocom')),
    'comercial "Não": esconde os blocos e mostra o tipo + a dica do papel');
  ok(await p.isVisible('#pce-ci-cnpj') && await p.isVisible('#pce-ci-det-hlb-tempo') && await p.isVisible('#pce-ci-rt-nome'), 'comercial "Não": identificação, delimitação, detecção e RT continuam');
  await op('comercial', 'sim');
  ok(await p.isVisible('#pce-ci-comercial-blocos') && await p.isHidden('#pce-ci-naocom') && await p.inputValue(lin(1, 'cultivar')) === 'Limão Tahiti', 'comercial "Sim" de novo: blocos voltam com o que foi digitado');
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  // captura só do card (cabeçalho, menu e aviso fixos escondidos para não cobrirem o card)
  const tira = await p.addStyleTag({ content: 'header, #nav, nav, #toast { visibility:hidden !important; }' });
  await p.locator('#pce-citros').screenshot({ path: amb.saida('pce_citros_card.png') });
  await tira.evaluate(e => e.remove());
  if (process.env.GDV_SAIDA_CITROS) { fs.mkdirSync(process.env.GDV_SAIDA_CITROS, { recursive: true }); fs.copyFileSync(amb.saida('pce_citros_card.png'), path.join(process.env.GDV_SAIDA_CITROS, 'card.png')); }

  console.log('3. Salvar e sincronizar: coluna "citros" na planilha');
  await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto');
  await sync();
  const lid = await p.evaluate(async () => (await Store.todos('levantamentos'))[0].id);
  const cab = (await get('/__aba?nome=Levantamentos'))[0];
  ok(cab[cab.length - 1] === 'citros' && cab[cab.length - 2] === 'origemVisita', 'aba Levantamentos: coluna "citros" no fim', cab.slice(-3));
  let L = await linhaDe('Levantamentos', lid), J = json(L && L.citros);
  ok(J && J.v === 1 && J.comercial === 'sim' && J.cnpj === '11222333000181' && J.endereco === 'Ramal Ficticio, km 3' && J.uf === 'AM', 'citros: comercial, CNPJ (só dígitos), endereço e UF', J);
  ok(J && J.atividades.join() === 'viveiro_mudas,frutos,outros' && J.atividadeOutros === 'Pomar experimental' && J.situacao === 'arrendatario', 'citros: atividades, "outros" e situação fundiária', J && [J.atividades, J.situacao]);
  ok(J && J.culturas.length === 2 && J.culturas[0].atividade === 'frutos' && J.culturas[0].cultivar === 'Laranja Pera' && J.culturas[0].area === 2.5 && J.culturas[0].idade === 6 && J.culturas[0].plantas === 400 && J.culturas[0].producao === 12.5
    && J.culturas[1].cultivar === 'Limão Tahiti' && J.culturas[1].plantas === 150, 'citros: 2 linhas da cultura do citros com números', J && J.culturas);
  ok(J && J.entrega === 'sim' && J.formasEntrega.join() === 'caixa,granel' && J.compradores.join() === 'feira,outros' && J.compradorOutros === 'Restaurante Ficticio'
    && J.beneficia === 'sim' && J.beneficiaTipo === 'Lavagem e seleção' && J.materiais.join() === 'muda,borbulha' && J.origemMaterial === 'Viveiro Ficticio Registrado', 'citros: comercialização e material de propagação', J);
  ok(J && J.delimitacao.pintapreta.tem === 'nao' && J.deteccao.hlb.tem === 'sim' && J.deteccao.hlb.tempo === '2 meses' && J.deteccao.cancro.tem === 'nao' && J.deteccao.acaro.tem === 'nao'
    && J.rt.nome === 'Fulano Ficticio Teste' && J.rt.conselho === 'CREA-AM 00000', 'citros: delimitação, detecção e responsável técnico', J && [J.delimitacao, J.deteccao, J.rt]);

  console.log('4. Reabrir: o bloco volta preenchido');
  await p.evaluate(id => go('pcelev', id), lid); await p.waitForSelector('#pceLevForm');
  ok(await visivel() && await p.inputValue('#pce-ci-cnpj') === '11.222.333/0001-81', 'reaberto: card visível com o CNPJ (formatado)', await p.inputValue('#pce-ci-cnpj'));
  ok(await p.locator('#pce-ci-culturas .pce-ci-cult').count() === 2 && await p.inputValue(lin(0, 'cultivar')) === 'Laranja Pera' && await p.inputValue(lin(0, 'area')) === '2,5'
    && await p.inputValue(lin(0, 'atividade')) === 'frutos' && await p.inputValue(lin(1, 'plantas')) === '150', 'reaberto: tabela da cultura do citros (2 linhas, área com vírgula)');
  ok(await marcado('comercial', 'sim') && await marcado('det-hlb-tem', 'sim') && await marcado('det-cancro-tem', 'nao') && await marcado('situacao', 'arrendatario')
    && await p.isChecked('input[name="pce-ci-compradores"][value="outros"]') && await p.inputValue('#pce-ci-compradorOutros') === 'Restaurante Ficticio' && await p.inputValue('#pce-ci-rt-nome') === 'Fulano Ficticio Teste',
    'reaberto: opções, "outros" e RT preenchidos');
  await p.click('[data-pce=descartarlev]'); await p.waitForSelector('#pce-novolev');

  console.log('5. PDF: "Dados de citros" só no PDF da praga de citros');
  await p.evaluate(id => PCEUI.levPronto(id), lid); await p.waitForSelector('#pce-lev-pronto');
  const pdf = async i => { await p.evaluate(() => { window.__prints = []; }); await p.click(`.pce-pdf >> nth=${i}`); await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 }); return (await p.evaluate(() => window.__prints[0])).texto; };
  const tHlb = await pdf(1), tBac = await pdf(0);
  ok(/HLB \/ Greening/.test(tHlb) && /Dados de citros/.test(tHlb) && /Laranja Pera/.test(tHlb) && /Limão Tahiti/.test(tHlb) && /Restaurante Ficticio/.test(tHlb) && /11\.222\.333\/0001-81/.test(tHlb)
    && /Produção comercial de frutos/.test(tHlb) && /Detecção – HLB Sim · há 2 meses/.test(tHlb), 'PDF de HLB: seção "Dados de citros" com campos e a tabela da cultura do citros', tHlb.slice(tHlb.indexOf('Dados de citros'), tHlb.indexOf('Dados de citros') + 500));
  ok(/Detecção – Ácaro Hindustânico Não/.test(tHlb) && /Delimitação – Pinta Preta Não/.test(tHlb) && !/Tipo \(não comercial\)/.test(tHlb), 'PDF de HLB: só o que foi preenchido (sem "Tipo (não comercial)")');
  ok(/Bactrocera carambolae/.test(tBac) && !/Dados de citros/.test(tBac), 'PDF de Bactrocera (não é de citros): sem "Dados de citros"');

  console.log('6. Remover a praga de citros: o card some; os dados ficam enquanto o formulário está aberto');
  await p.evaluate(id => go('pcelev', id), lid); await p.waitForSelector('#pceLevForm');
  await p.click(card(1) + ' >> [data-pce=delpraga]');
  ok(!(await visivel()) && await p.inputValue('#pce-ci-rt-nome') === 'Fulano Ficticio Teste', 'praga de citros removida: card some, o digitado continua no formulário');
  await p.click('#pce-addpraga'); await p.selectOption(card(1) + ' >> .p-praga', 'Cancro Cítrico');
  await p.selectOption(card(1) + ' >> .pce-cult >> nth=0 >> .c-cultura', 'Limão'); await p.click(card(1) + ' >> .pce-cult >> nth=0 >> .pce-res-detectada');
  ok(await visivel() && await p.inputValue(lin(0, 'cultivar')) === 'Laranja Pera' && await marcado('det-cancro-tem', 'nao'), 'outra praga de citros (Cancro detectado): card volta com os dados; detecção de cancro marcada "Não" pelo fiscal não é sobrescrita');
  const rasc = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 700)); const r = await Store.meta('pceLevRascunho'); return r && r.dados && r.dados.citros; });
  ok(rasc && rasc.rt && rasc.rt.nome === 'Fulano Ficticio Teste' && rasc.culturas.length === 2, 'rascunho guarda os dados de citros', rasc && rasc.rt);
  await p.click(card(1) + ' >> [data-pce=delpraga]'); ok(!(await visivel()), 'sem praga de citros de novo: card some');
  await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto'); await sync();
  L = await linhaDe('Levantamentos', lid);
  ok(L && L.citros === '', 'salvo sem praga de citros: coluna "citros" vazia', L && L.citros);
  ok(await p.evaluate(async id => (await Store.obter('levantamentos', id)).citros, lid) === '', 'aparelho: registro sem dados de citros');

  console.log('7. Registro antigo sem a coluna: bloco vazio');
  const agora = Date.now();
  const VELHO = { id: 'lev-citros-velho', data: '2026-03-10', hora: '09:00', servidor: 'Ciclano Ficticio Teste', cargo: 'Fiscal Agropecuário Engenheiro Agrônomo', lotacao: 'Manaus', doc: '52998224725',
    nome: 'FULANO FICTICIO TESTE', municipio: 'Manaus', culturas: '[]', fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: agora, atualizadoEm: agora,
    pragas: JSON.stringify([{ praga: 'Cancro Cítrico', culturas: [{ cultura: 'Limão', resultado: 'nao_detectada', coleta: 'Não', fotos: [] }] }]) };
  let r = await post({ action: 'sync', key: TOKF, since: 0, levantamentos: [VELHO] });
  ok(r.ok && (await linhaDe('Levantamentos', VELHO.id)).citros === '', 'registro enviado sem o campo "citros": coluna vazia', r.erro);
  await sync();
  await p.evaluate(id => go('pcelev', id), VELHO.id); await p.waitForSelector('#pceLevForm');
  ok(await visivel() && await p.inputValue('#pce-ci-cnpj') === '' && await p.locator('#pce-ci-culturas .pce-ci-cult').count() === 0 && !(await p.isChecked('input[name="pce-ci-comercial"][value="sim"]')),
    'reaberto (praga de citros, sem dados de citros): card visível e vazio');
  await p.click('[data-pce=descartarlev]'); await p.waitForSelector('#pce-novolev');

  console.log('8. Validação do servidor');
  const linha = i => ({ atividade: 'frutos', cultivar: 'Cultivar ' + i, area: i === 0 ? -3 : '1.5', idade: '2.6', plantas: i === 1 ? '-10' : 10, producao: 'abc' });
  const sujo = { comercial: 'talvez', cnpj: '123', uf: 'amazonas', endereco: '=' + 'x'.repeat(300), atividades: ['frutos', 'inventada', 'frutos'], situacao: 'dono',
    culturas: Array.from({ length: 21 }, (_, i) => linha(i)), deteccao: { hlb: { tem: 'sim', tempo: 'y'.repeat(250) }, outra: { tem: 'sim' } }, extra: 'ignorado', rt: { nome: 'Fulano Ficticio Teste' } };
  r = await post({ action: 'sync', key: TOKF, since: 0, levantamentos: [{ ...VELHO, id: 'lev-citros-sujo', atualizadoEm: Date.now(), citros: JSON.stringify(sujo) }] });
  const S = json((await linhaDe('Levantamentos', 'lev-citros-sujo')).citros);
  ok(r.ok && S && S.culturas.length === 20, 'tabela com 21 linhas: gravadas só 20', S && S.culturas.length);
  ok(S && S.culturas[0].area === '' && S.culturas[1].plantas === '' && S.culturas[2].area === 1.5 && S.culturas[2].idade === 3 && S.culturas[2].producao === '', 'número negativo ou inválido: vazio; idade inteira', S && S.culturas.slice(0, 3));
  ok(S && S.comercial === '' && S.situacao === '' && S.atividades.join() === 'frutos' && S.cnpj === '' && S.uf === 'AM', 'opções desconhecidas descartadas; CNPJ incompleto vazio; UF com 2 letras', S && [S.comercial, S.situacao, S.atividades, S.cnpj, S.uf]);
  ok(S && S.endereco.length === 200 && !/^=/.test(S.endereco) && S.deteccao.hlb.tempo.length === 200 && !('outra' in S.deteccao) && !('extra' in S), 'textos com até 200 caracteres (sem "=" no início); chaves desconhecidas fora', S && [S.endereco.length, Object.keys(S.deteccao)]);
  r = await post({ action: 'sync', key: TOKF, since: 0, levantamentos: [{ ...VELHO, id: 'lev-citros-lixo', atualizadoEm: Date.now(), citros: 'não é JSON' }, { ...VELHO, id: 'lev-citros-vazio', atualizadoEm: Date.now(), citros: JSON.stringify({ comercial: '', culturas: [{}] }) }] });
  ok(r.ok && (await linhaDe('Levantamentos', 'lev-citros-lixo')).citros === '' && (await linhaDe('Levantamentos', 'lev-citros-vazio')).citros === '', 'texto que não é JSON ou JSON sem nada preenchido: coluna vazia');
  // app: número negativo na tabela é recusado ao salvar
  await p.evaluate(id => go('pcelev', id), VELHO.id); await p.waitForSelector('#pceLevForm');
  await p.click('#pce-ci-addcult'); await p.fill(lin(0, 'area'), '-2');
  await p.click('#pce-salvar'); await p.waitForTimeout(300);
  ok(/não pode ser negativa/.test(await p.textContent('#toast')) && await p.locator('#pceLevForm').count() === 1, 'app: área negativa recusada ao salvar', await p.textContent('#toast'));
  await p.fill(lin(0, 'area'), '2'); await p.fill('#pce-ci-cnpj', '1234');
  await p.click('#pce-salvar'); await p.waitForTimeout(300);
  ok(/14 dígitos/.test(await p.textContent('#toast')), 'app: CNPJ incompleto recusado ao salvar', await p.textContent('#toast'));
  const lim = await p.evaluate(async () => { for (let i = 0; i < 25; i++) document.querySelector('#pce-ci-addcult').click(); await new Promise(r => setTimeout(r, 100)); return document.querySelectorAll('#pce-ci-culturas .pce-ci-cult').length; });
  ok(lim === 20, 'app: no máximo 20 linhas na cultura do citros', lim);

  ok(!err.length, 'sem erros de JavaScript', err.slice(0, 4));
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
