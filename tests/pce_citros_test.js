const amb = require('./lib/amb');
// PCE — citros no levantamento por praga (cadastro de cítricos: IN 21/2018 e Portaria 317/2021) e a visita completa:
// CPF/CNPJ primeiro (produtor já cadastrado no servidor: autopreenche produtor e propriedade, inclusive CNPJ, empresa, endereço e UF; CPF novo:
// libera os campos), ordem dos cards (Dados do produtor → Localização → Local e origem → Pragas e doenças), bloco "🍊 Cultura do citros" único
// dentro de "Pragas e doenças" (só com praga de citros, um só com duas pragas de citros), detecção de HLB, Ácaro Hindustânico e Cancro Cítrico
// obrigatória (ausência/presença; praga detectada pré-marca presença), Cadastro de citros (numeração do programa "citros") e Termo de Fiscalização
// da visita já preenchido (identificação, data/hora, local, frases de ausência/presença, enquadramento), PDF no modelo do papel (cadastro + TF),
// planilha (Levantamentos, CadastrosPCE, TermosPCE), reabrir, sem internet e validação do servidor. Só dados fictícios.
// Com GDV_SAIDA_CITROS=<pasta> copia as capturas (formulário a 400 px e as páginas do PDF).
const fs = require('fs'), path = require('path');
const { API, APP } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 700))); if (!c) falhas++; };
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const linhaDe = async (aba, id) => { const t = await get('/__aba?nome=' + aba); const i = t[0].indexOf('id'); const l = t.find(r => r[i] === id); return l ? Object.fromEntries(t[0].map((c, k) => [c, l[k]])) : null; };
const linhas = async aba => { const t = await get('/__aba?nome=' + aba); return t.slice(1).map(l => Object.fromEntries(t[0].map((c, k) => [c, l[k]]))); };
const json = v => { try { return JSON.parse(v); } catch (e) { return null; } };
const COPIA = process.env.GDV_SAIDA_CITROS;
const guardar = nome => { if (COPIA) { fs.mkdirSync(COPIA, { recursive: true }); fs.copyFileSync(amb.saida(nome), path.join(COPIA, nome)); } };

(async () => {
  const b = await amb.lancar(), err = [];
  const g = await get('/__gerar?nome=' + encodeURIComponent('Ciclano Ficticio Teste'));
  const TOKF = (await post({ action: 'ativar', codigo: g.codigo })).token;
  const agora = Date.now();
  // produtor e propriedade já no banco (cadastro anterior): o levantamento novo autopreenche pelo CPF
  let r = await post({ action: 'sync', key: TOKF, since: 0,
    pessoas: [{ id: '52998224725', tipo: 'PF', nome: 'FULANO FICTICIO TESTE', telefone: '92 90000-0000', endereco: 'Ramal Ficticio, km 3', municipio: 'Manaus', uf: 'AM', criadoEm: agora, atualizadoEm: agora }],
    propriedades: [{ id: 'PRP-CIT-1', codigo: 'PRP-CIT-1', nome: 'Sítio Ficticio', doc: '52998224725', municipio: 'Manaus', situacaoFundiaria: 'Posse', cnpj: '11222333000181',
      empresa: 'Citros Ficticio Ltda', endereco: 'Ramal Ficticio, km 3', uf: 'AM', criadoEm: agora, atualizadoEm: agora }] });
  ok(r.ok, 'servidor: produtor e propriedade fictícios cadastrados', r.erro);
  r = await post({ action: 'pceConsultar', key: TOKF, doc: '529.982.247-25' });
  ok(r.ok && r.pessoa && r.propriedades.length === 1 && r.propriedades[0].cnpj === '11222333000181' && r.propriedades[0].empresa === 'Citros Ficticio Ltda' && r.propriedades[0].endereco === 'Ramal Ficticio, km 3',
    'pceConsultar devolve também CNPJ, empresa e endereço da propriedade', r.propriedades);

  const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.12, longitude: -60.02, accuracy: 9 }, timezoneId: 'America/Manaus' });
  await c.addInitScript(([t]) => {
    if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Ciclano Ficticio Teste'); localStorage.setItem('gdv.semInstalar', '1'); }
    if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || [];
      window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' '), html: d.documentElement.outerHTML, paginas: d.querySelectorAll('.a4').length, titulo: window.top.document.title,
        classes: [...d.querySelectorAll('.a4')].map(x => x.className),
        marcas: [...d.querySelectorAll('.a4')].map(pg => [...pg.querySelectorAll('.on')].map(e => e.getAttribute('data-x') || e.getAttribute('data-m')).filter(Boolean)) }); };
  }, [TOKF]);
  const p = await c.newPage(); p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  const sync = async () => { await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(900); };
  const toast = () => p.textContent('#toast');
  const visivel = () => p.isVisible('#pce-citros');
  const op = (k, v) => p.click(`#pce-citros label:has(input[name="pce-ci-${k}"][value="${v}"])`);
  const marcado = (k, v) => p.isChecked(`input[name="pce-ci-${k}"][value="${v}"]`);
  const card = i => `.pce-praga >> nth=${i}`;
  const cult = (i, k) => `${card(i)} >> .pce-cult >> nth=${k}`;
  const confirmarNumeros = async alvo => { for (let i = 0; i < 50 && !(await p.locator(alvo).count()); i++) { if (await p.locator('#mon-m-ok').count()) await p.click('#mon-m-ok'); await p.waitForTimeout(250); } };
  const imprimir = async fn => { await p.evaluate(() => { window.__prints = []; }); await fn(); await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 }); return p.evaluate(() => window.__prints[0]); };

  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]'); await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
  await p.selectOption('#pce-s-cargo', { index: 1 }); await p.selectOption('#pce-s-lotacao', 'Manaus'); await p.click('#pce-s-salvar'); await p.waitForSelector('#pce-novolev');

  console.log('1. CPF novo: campos liberados para preencher');
  await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm');
  ok(await p.locator('#pce-prod[disabled]').count() === 1 && await p.isDisabled('#pce-nome') && await p.isEnabled('#pce-doc'), 'formulário novo: só o CPF/CNPJ aberto; dados do produtor fechados');
  ok(/Informe o CPF\/CNPJ/.test(await p.textContent('#pce-st-doc')), 'dica: informar o CPF/CNPJ para buscar o cadastro');
  const ordem = await p.$$eval('#pceLevForm > .card > h3', hs => hs.map(h => h.textContent.trim()));
  const ix = t => ordem.findIndex(x => x.startsWith(t));
  ok(ix('Dados do produtor') >= 0 && ix('Dados do produtor') < ix('Localização') && ix('Localização') < ix('Local e origem da visita') && ix('Local e origem da visita') < ix('Pragas e doenças'),
    'ordem: Dados do produtor → Localização → Local e origem da visita → Pragas e doenças', ordem);
  ok(await p.$eval('#pce-prod-card', el => el.firstElementChild.nextElementSibling.contains(document.querySelector('#pce-doc'))), 'CPF/CNPJ é o primeiro campo dos dados do produtor');
  await p.fill('#pce-doc', '11144477735');
  await p.waitForFunction(() => /Novo cadastro/.test(document.querySelector('#pce-st-doc').textContent), null, { timeout: 10000 });
  ok(await p.isEnabled('#pce-nome') && await p.isEnabled('#pce-cnpj') && await p.isEnabled('#pce-empresa') && (await p.inputValue('#pce-nome')) === '', 'CPF sem cadastro: "Novo cadastro" e campos liberados (vazios)');
  await p.click('[data-pce=descartarlev]'); await p.waitForSelector('#pce-novolev');

  console.log('2. CPF já cadastrado: autopreenche produtor e propriedade');
  await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm');
  await p.fill('#pce-doc', '52998224725');
  await p.waitForFunction(() => /Cadastro encontrado/.test(document.querySelector('#pce-st-doc').textContent) && document.querySelector('#pce-propriedade').value, null, { timeout: 10000 });
  const v = async id => p.inputValue('#pce-' + id);
  ok(await p.isEnabled('#pce-nome') && await v('nome') === 'FULANO FICTICIO TESTE' && await v('telefone') === '92 90000-0000', 'produtor preenchido (nome, telefone) e campos liberados', [await v('nome'), await v('telefone')]);
  ok(await v('propriedade') === 'Sítio Ficticio' && await v('codigo') === 'PRP-CIT-1' && await v('situacao') === 'Posse' && await v('municipio') === 'Manaus',
    'propriedade preenchida (nome, código IN 33/2016, situação, município)');
  ok(await v('cnpj') === '11.222.333/0001-81' && await v('empresa') === 'Citros Ficticio Ltda' && await v('endereco') === 'Ramal Ficticio, km 3' && await v('uf') === 'AM',
    'CNPJ, empresa/nome fantasia, endereço e UF preenchidos do banco', [await v('cnpj'), await v('empresa'), await v('endereco'), await v('uf')]);
  await p.waitForFunction(() => document.querySelector('#pce-lat').value !== '', null, { timeout: 5000 }).catch(() => {});
  const tira0 = await p.addStyleTag({ content: 'header, #nav, nav, #toast { visibility:hidden !important; }' });
  await p.locator('#pce-prod-card').screenshot({ path: amb.saida('citros_1_produtor_autopreenchido.png') }); guardar('citros_1_produtor_autopreenchido.png');
  await tira0.evaluate(e => e.remove());

  console.log('3. Pragas: bloco de citros só com praga de citros, um só para o levantamento');
  await p.selectOption(card(0) + ' >> .p-praga', 'Bactrocera carambolae');
  await p.selectOption(cult(0, 0) + ' >> .c-cultura', 'Laranja'); await p.click(cult(0, 0) + ' >> .pce-res-nao_detectada');
  ok(await p.locator('#pce-citros').count() === 1 && !(await visivel()), 'praga que não é de citros (Bactrocera carambolae): sem bloco de citros');
  await p.click('#pce-addpraga'); await p.selectOption(card(1) + ' >> .p-praga', 'HLB / Greening');
  await p.selectOption(cult(1, 0) + ' >> .c-cultura', 'Laranja'); await p.click(cult(1, 0) + ' >> .pce-res-nao_detectada');
  ok(await visivel(), 'praga de citros (HLB / Greening): bloco "Cultura do citros" aparece');
  ok(await p.$eval('#pce-citros', el => !!el.closest('#pce-pragas-card') && !el.closest('.pce-praga')), 'o bloco fica dentro do card "Pragas e doenças" (não é um card solto)');
  await p.click('#pce-addpraga'); await p.selectOption(card(2) + ' >> .p-praga', 'Cancro Cítrico');
  await p.selectOption(cult(2, 0) + ' >> .c-cultura', 'Limão');
  ok(await p.locator('.pce-citros').count() === 1 && await visivel(), 'duas pragas de citros (HLB e Cancro): continua UM bloco só');
  ok(!(await marcado('det-cancro-tem', 'sim')) && !(await marcado('det-cancro-tem', 'nao')), 'antes do resultado: detecção do cancro em branco');
  await p.click(cult(2, 0) + ' >> .pce-res-detectada');
  ok(await marcado('det-cancro-tem', 'sim') && !(await marcado('det-hlb-tem', 'sim')) && await p.isVisible('#pce-ci-det-cancro-tempo'), 'Cancro detectado: "Presença" pré-marcada (com "há quanto tempo"); HLB continua em branco');
  ok(/Ausência/.test(await p.textContent('#pce-ci-det')) && /Presença/.test(await p.textContent('#pce-ci-det')) && /obrigatório/.test(await p.textContent('#pce-citros')), 'detecção: botões Ausência/Presença, obrigatória');

  console.log('4. Obrigatórias: HLB, Ácaro Hindustânico e Cancro Cítrico');
  await p.click('#pce-salvar'); await p.waitForTimeout(300);
  ok(/HLB e Ácaro Hindustânico/.test(await toast()) && await p.locator('#pceLevForm').count() === 1, 'sem HLB e ácaro: não salva (mensagem cita as que faltam)', await toast());
  await op('det-hlb-tem', 'nao');
  await p.click('#pce-salvar'); await p.waitForTimeout(300);
  ok(/Ácaro Hindustânico/.test(await toast()) && !/HLB/.test(await toast()) && await p.locator('#pceLevForm').count() === 1, 'só o ácaro faltando: ainda não salva', await toast());
  await op('det-acaro-tem', 'nao'); await p.fill('#pce-ci-det-cancro-tempo', '3 semanas');

  console.log('5. Particularidades do cadastro (dados fictícios)');
  await op('comercial', 'sim');
  for (const x of ['frutos', 'outros']) await p.check(`input[name="pce-ci-atividades"][value="${x}"]`);
  await p.fill('#pce-ci-atividadeOutros', 'Pomar experimental');
  await op('situacao', 'proprietario');
  await p.click('#pce-ci-addcult'); await p.click('#pce-ci-addcult');
  const lin = (i, k) => `#pce-ci-culturas .pce-ci-cult >> nth=${i} >> .ci-${k}`;
  const linha = async (i, a, cv, ar, id, pl, pr) => { await p.selectOption(lin(i, 'atividade'), a); await p.fill(lin(i, 'cultivar'), cv); await p.fill(lin(i, 'area'), ar);
    await p.fill(lin(i, 'idade'), id); await p.fill(lin(i, 'plantas'), pl); await p.fill(lin(i, 'producao'), pr); };
  await linha(0, 'frutos', 'Laranja Pera', '2,5', '6', '400', '12,5');
  await linha(1, 'frutos', 'Limão Tahiti', '1', '3', '150', '4');
  await op('entrega', 'sim'); await p.check('input[name="pce-ci-formasEntrega"][value="caixa"]');
  for (const x of ['feira', 'outros']) await p.check(`input[name="pce-ci-compradores"][value="${x}"]`);
  await p.fill('#pce-ci-compradorOutros', 'Restaurante Ficticio');
  await op('beneficia', 'nao');
  for (const x of ['muda', 'borbulha']) await p.check(`input[name="pce-ci-materiais"][value="${x}"]`);
  await p.fill('#pce-ci-origemMaterial', 'Viveiro Ficticio Registrado');
  await op('del-pintapreta-tem', 'nao');
  await p.fill('#pce-ci-rt-nome', 'Beltrano Ficticio Teste'); await p.fill('#pce-ci-rt-conselho', 'CREA-AM 00000');
  ok(await p.locator('#pce-ci-cnpj, #pce-ci-endereco, #pce-ci-uf').count() === 0, 'sem campos repetidos no bloco (CNPJ, endereço e UF ficam nos dados do produtor/localização)');
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  const tira = await p.addStyleTag({ content: 'header, #nav, nav, #toast { visibility:hidden !important; }' });
  await p.locator('#pce-pragas-card').screenshot({ path: amb.saida('citros_2_bloco_nas_pragas.png') }); guardar('citros_2_bloco_nas_pragas.png');
  await p.locator('#pce-ci-det').screenshot({ path: amb.saida('citros_3_ausencia_presenca.png') }); guardar('citros_3_ausencia_presenca.png');
  await p.screenshot({ path: amb.saida('citros_0_formulario_completo.png'), fullPage: true }); guardar('citros_0_formulario_completo.png');
  await tira.evaluate(e => e.remove());

  console.log('6. Salvar e sincronizar o levantamento');
  await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto');
  const lid = await p.evaluate(async () => (await Store.todos('levantamentos'))[0].id);
  const lev = await p.evaluate(id => Store.obter('levantamentos', id), lid);
  await sync();
  const cab = (await get('/__aba?nome=Levantamentos'))[0];
  ok(cab.slice(-5).join() === 'citros,cnpj,empresa,endereco,uf', 'aba Levantamentos: colunas novas no fim (cnpj, empresa, endereco, uf)', cab.slice(-6));
  let L = await linhaDe('Levantamentos', lid), J = json(L && L.citros);
  ok(L && L.cnpj === '11222333000181' && L.empresa === 'Citros Ficticio Ltda' && L.endereco === 'Ramal Ficticio, km 3' && L.uf === 'AM', 'planilha: CNPJ (só dígitos), empresa, endereço e UF do levantamento', L && [L.cnpj, L.empresa, L.endereco, L.uf]);
  ok(J && J.deteccao.hlb.tem === 'nao' && J.deteccao.acaro.tem === 'nao' && J.deteccao.cancro.tem === 'sim' && J.deteccao.cancro.tempo === '3 semanas' && J.deteccao.hlb.tempo === '',
    'planilha (citros): detecção HLB ausência, ácaro ausência, cancro presença há 3 semanas', J && J.deteccao);
  ok(J && J.comercial === 'sim' && J.atividades.join() === 'frutos,outros' && J.situacao === 'proprietario' && J.culturas.length === 2 && J.culturas[0].plantas === 400
    && J.compradorOutros === 'Restaurante Ficticio' && J.rt.nome === 'Beltrano Ficticio Teste' && !('cnpj' in J), 'planilha (citros): particularidades do cadastro, sem identificação repetida', J);
  ok(/Cadastro de citros/.test(await p.textContent('#pce-pronto-cad')) && /Cadastro de citros sai deste levantamento/.test(await p.textContent('.pce-visita')), 'próximo passo: "🍊 Cadastro de citros e fazer o Termo"');

  console.log('7. Cadastro de citros (numeração do programa citros) → Termo de Fiscalização da visita');
  await p.click('#pce-pronto-cad'); await p.waitForSelector('#monCadForm[data-programa=citros]');
  const telaCad = (await p.innerText('#monCadForm')).replace(/\s+/g, ' ');
  ok(/FULANO FICTICIO TESTE/.test(telaCad) && /11\.222\.333\/0001-81/.test(telaCad) && /PRP-CIT-1/.test(telaCad) && /Detecção – Cancro Cítrico Presença · há 3 semanas/.test(telaCad) && /Laranja Pera/.test(telaCad),
    'tela do cadastro de citros: dados do levantamento para conferir (produtor, CNPJ, código, detecção, cultura)', telaCad.slice(0, 400));
  await p.click('#mc-salvar'); await confirmarNumeros('#monTfForm');
  ok(await p.locator('#monTfForm').count() === 1 && /citros/.test(await p.textContent('#monTfForm h3')), 'depois do cadastro: abre o Termo de Fiscalização (citros)', await toast());
  const t = async id => p.inputValue('#mt-' + id);
  ok(await t('nome') === 'FULANO FICTICIO TESTE' && /529\.982\.247-25/.test(await t('doc')) && await t('empresa') === 'Citros Ficticio Ltda' && await t('cnpj') === '11.222.333/0001-81'
    && await t('endereco') === 'Ramal Ficticio, km 3' && await t('municipio') === 'Manaus' && await t('uf') === 'AM' && await t('telefone') === '92 90000-0000',
    'Termo: identificação vem do levantamento/cadastro (nome, CPF, empresa, CNPJ, endereço, município, UF, telefone)', [await t('nome'), await t('doc'), await t('empresa'), await t('cnpj'), await t('telefone')]);
  ok(await t('lat') !== '' && await t('lon') !== '' && await t('data') === lev.data && await t('hora') === lev.hora.slice(0, 5), 'Termo: coordenadas, data e hora da visita', [await t('lat'), await t('data'), await t('hora'), lev.data, lev.hora]);
  ok(/Sítio Ficticio/.test(await t('localAcao')) && /Manaus\/AM/.test(await t('localAcao')), 'Termo: local da fiscalização (especificar o local) preenchido', await t('localAcao'));
  const desc = await t('constatacao');
  ok(desc.split('\n')[0] === 'Ausência de sintomas de HLB nos frutos e folhas da cultura Laranja e Limão.' && /^Ausência de sintomas de Ácaro Hindustânico nos frutos e folhas da cultura/m.test(desc)
    && /^Presença de sintomas de Cancro Cítrico nos frutos e folhas da cultura Laranja e Limão\.$/m.test(desc), 'Termo: uma frase por doença (ausência/presença), com as culturas de citros', desc);
  ok(await t('enquadramento') === 'PORTARIA MAPA SDA Nº 1326, DE 4 DE JULHO DE 2025, ART. 23, INCISOS I E II, E ART. 26.', 'Termo: enquadramento legal padrão de citros (editável)', await t('enquadramento'));
  ok(await t('atividade') === 'Produção comercial de frutos; Pomar experimental' && await t('plantas') === '550' && await p.isChecked('input[name="mt-sintomas"][value="sim"]'),
    'Termo: atividade, plantas (soma da cultura do citros) e "presença de sintomas" para o relatório', [await t('atividade'), await t('plantas')]);
  ok(await p.isHidden('input[name="mt-pragas"]') && (await p.$$eval('input[name="mt-pragas"]:checked', l => l.map(x => x.value).sort())).join() === 'Cancro Cítrico,HLB,Mosca-da-Carambola,Ácaro Hindustânico',
    'Termo de citros: sem o quadro de pragas do outro modelo (pragas guardadas para o relatório)', await p.$$eval('input[name="mt-pragas"]:checked', l => l.map(x => x.value)));
  await p.fill('#mt-constatacao', desc + '\nOrientado o produtor sobre o controle do cancro.');
  await p.fill('#mt-enquadramento', '');
  await p.fill('#mt-localAcao', '');
  await p.click('#mt-salvar'); await p.waitForTimeout(300);
  ok(/local da fiscalização/.test(await toast()), 'Termo de citros: local obrigatório', await toast());
  await p.fill('#mt-localAcao', 'Propriedade Sítio Ficticio, Ramal Ficticio, km 3, Manaus/AM');
  await p.fill('#mt-enquadramento', 'PORTARIA MAPA SDA Nº 1326, DE 4 DE JULHO DE 2025, ART. 23, INCISOS I E II, E ART. 26.');
  await p.click('[data-mon=frasescitros]');
  ok((await t('constatacao')).split('\n').length === 4 && /Orientado o produtor/.test(await t('constatacao')), '"Refazer as frases": troca só as frases (o texto do fiscal continua)', await t('constatacao'));
  await p.click('#mt-salvar'); await confirmarNumeros('#mon-pronto');
  ok(await p.locator('#mon-pronto').count() === 1, 'Termo de Fiscalização salvo', await toast());

  console.log('8. PDF: cadastro de citros (modelo do papel) + Termo de Fiscalização da visita');
  const pr = await imprimir(() => p.click('#mon-imprimir'));
  ok(pr.paginas === 2 && /doc-cci/.test(pr.classes[0]) && /doc-tci/.test(pr.classes[1]) && /^TF_Citros_\d{3}\.\d{4}\.MANAUS_FULANO_FICTICIO_TESTE/.test(pr.titulo),
    'imprimir o Termo: 2 páginas (cadastro de citros e o Termo), nome TF_Citros_…', [pr.paginas, pr.classes, pr.titulo]);
  const T0 = pr.texto;
  ok(/CADASTRO DE IMÓVEIS DE PRODUÇÃO COMERCIAL DE CÍTRICOS/.test(T0) && /CADASTRO DA PROPRIEDADE Nº \d{3}-\d{4}-MANAUS/.test(T0) && /ATENDIMENTO A IN N°21 DE 25\/04\/2018/.test(T0)
    && /LEVANTAMENTO FITOSSANITÁRIO DE PRAGAS QUARENTENÁRIAS DE CITROS/.test(T0) && /Marcada opção “NÃO” preencher apenas itens 1, 4 e 5/.test(T0), 'cadastro: títulos do modelo e nº do cadastro (sequência de citros)');
  ok(/1\. DADOS DO PRODUTOR\/PROPRIETÁRIO/.test(T0) && /2\. TIPO DE ATIVIDADE/.test(T0) && /3\. CULTURA DO CITROS/.test(T0) && /4\. LEVANTAMENTO DE DELIMITAÇÃO/.test(T0) && /5\. LEVANTAMENTO DE DETECÇÃO/.test(T0)
    && /CÓDIGO DA PROPRIEDADE \(CONFORME IN N°33\/2016\): PRP-CIT-1/.test(T0) && /NOME DO RESPONSAVEL TÉCNICO: Beltrano Ficticio Teste/.test(T0) && /1ª via: Unidade Local 2ª via: ADAF Central \(E-mail\)/.test(T0),
    'cadastro: itens 1 a 5, código IN 33/2016, responsável técnico e vias');
  const M = pr.marcas[0];
  ok(['d.comercial=sim', 'd.atividades=frutos', 'd.atividades=outros', 'd.situacao=proprietario', 'd.entrega=sim', 'd.formasEntrega=caixa', 'd.compradores=feira', 'd.compradores=outros',
    'd.beneficia=nao', 'd.materiais=muda', 'd.materiais=borbulha', 'd.delimitacao.pintapreta.tem=nao', 'd.deteccao.cancro.tem=sim', 'd.deteccao.hlb.tem=nao', 'd.deteccao.acaro.tem=nao'].every(x => M.includes(x))
    && !M.includes('d.comercial=nao') && !M.includes('d.deteccao.cancro.tem=nao') && !M.includes('d.atividades=viveiro_mudas'), 'cadastro: marcações (X) do que foi escolhido, e só delas', M);
  ok(/Laranja Pera/.test(T0) && /Limão Tahiti/.test(T0) && /12,5/.test(T0) && /Restaurante Ficticio/.test(T0) && /Há quanto tempo: 3 semanas/.test(T0), 'cadastro: tabela da cultura do citros e textos');
  ok(/TERMO DE FISCALIZAÇÃO N° \d{3}\.\d{4}\.MANAUS/.test(T0) && /Nome: FULANO FICTICIO TESTE/.test(T0) && /CPF: 529\.982\.247-25/.test(T0) && /Empresa \/ Fantasia: Citros Ficticio Ltda/.test(T0)
    && /CNPJ: 11\.222\.333\/0001-81/.test(T0) && /Endereço: Ramal Ficticio, km 3/.test(T0) && /Telefone: 92 90000-0000/.test(T0) && /Coordenadas Geográficas: -3,12/.test(T0),
    'Termo: identificação (nome, CPF, empresa, CNPJ, endereço, telefone, coordenadas)');
  const [aa, mm, dd] = lev.data.split('-');
  ok(new RegExp(`Em ${dd}/${mm}/${aa} às ${lev.hora.slice(0, 2)} : ${lev.hora.slice(3, 5)} hora\\(s\\) ao realizar fiscalização no\\(a\\) Propriedade Sítio Ficticio, Ramal Ficticio, km 3, Manaus/AM constatei`).test(T0),
    'Termo: "Em data às hora ao realizar fiscalização no(a) local constatei"', T0.slice(T0.indexOf('Em '), T0.indexOf('Em ') + 200));
  ok(/Ausência de sintomas de HLB nos frutos e folhas da cultura/.test(T0) && /Presença de sintomas de Cancro Cítrico nos frutos e folhas da cultura/.test(T0) && /Orientado o produtor/.test(T0)
    && /PORTARIA MAPA SDA Nº 1326, DE 4 DE JULHO DE 2025, ART\. 23, INCISOS I E II, E ART\. 26\./.test(T0), 'Termo: frases de ausência/presença, texto do fiscal e enquadramento');
  ok(/4 – Testemunhas/.test(T0) && /Recebi a 2ª via deste Termo em:/.test(T0) && /1ª via: Interessado 2ª via: ADAF Central 3ª via: Unidade Local/.test(T0), 'Termo: testemunhas, "Recebi a 2ª via" e as 3 vias');
  ok(!/Monilíase|Mosca-da-Carambola|ao realizar ações de/.test(T0.slice(T0.indexOf('TERMO DE FISCALIZAÇÃO'))), 'Termo de citros: sem o quadro de pragas/ações do Termo de monilíase');
  // páginas renderizadas (para comparar com o modelo) e o PDF do Chromium
  const pg = await b.newPage({ viewport: { width: 800, height: 1200 } });
  await pg.setContent(pr.html.replace('<head>', `<head><base href="${APP}documentos/">`), { waitUntil: 'load' });
  await pg.evaluate(() => Promise.all([...document.images].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })))));
  await pg.locator('.a4 >> nth=0').screenshot({ path: amb.saida('citros_4_pdf_cadastro.png') }); guardar('citros_4_pdf_cadastro.png');
  await pg.locator('.a4 >> nth=1').screenshot({ path: amb.saida('citros_5_pdf_termo.png') }); guardar('citros_5_pdf_termo.png');
  await pg.emulateMedia({ media: 'print' });
  const altura = await pg.evaluate(() => [...document.querySelectorAll('.a4')].map(x => x.getBoundingClientRect().height));
  ok(altura.every(h => h < 1065), 'cada página cabe numa folha A4 (281 mm de área útil)', altura);
  await pg.pdf({ path: amb.saida('citros_cadastro_e_tf.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true }); guardar('citros_cadastro_e_tf.pdf');
  await pg.close();
  // imprimir o cadastro (lista de cadastros): cadastro + o Termo do mesmo dia
  await p.evaluate(() => go('pcecads')); await p.waitForSelector('.mon-item');
  ok(/🍊 Citros/.test(await p.textContent('.mon-item')), 'lista de cadastros: cadastro de citros marcado "🍊 Citros"');
  const pc = await imprimir(() => p.click('.mon-item [data-mon=imprimir]'));
  ok(pc.paginas === 2 && /doc-cci/.test(pc.classes[0]) && /doc-tci/.test(pc.classes[1]) && /^Cadastro_Citros_\d{3}-\d{4}-MANAUS_FULANO_FICTICIO_TESTE/.test(pc.titulo), 'imprimir o cadastro: cadastro + Termo da visita, nome Cadastro_Citros_…', [pc.paginas, pc.titulo]);
  // enviar ao produtor: só o Termo (PDF gerado no aparelho)
  const so = await p.evaluate(async () => { const t = (await Store.todos('termosPce'))[0]; const f = await PCEMon.imprimir('termo', t.id, 'arquivo'); return { nome: f.name, tam: f.size }; });
  ok(/^TF_Citros_.*\.pdf$/.test(so.nome) && so.tam > 1000, 'enviar ao produtor: PDF do Termo gerado no aparelho', so);

  console.log('9. Planilha: CadastrosPCE (programa citros) e TermosPCE');
  await sync();
  const cads = (await linhas('CadastrosPCE')).filter(x => x.programa === 'citros'), tfs = (await linhas('TermosPCE')).filter(x => x.programa === 'citros');
  const CD = cads[0] && json(cads[0].dados), TF0 = tfs[0];
  ok(cads.length === 1 && /^001-\d{4}-MANAUS$/.test(cads[0].numeroTxt) && cads[0].doc === '52998224725' && cads[0].cnpj === '11222333000181' && cads[0].totalPlantas === 550,
    'CadastrosPCE: 1 cadastro de citros nº 001 (sequência própria), CPF, CNPJ e total de plantas', cads[0] && [cads[0].numeroTxt, cads[0].cnpj, cads[0].totalPlantas]);
  ok(CD && CD.levantamentoId === lid && CD.codigoPropriedade === 'PRP-CIT-1' && CD.deteccao.cancro.tem === 'sim' && CD.culturas.length === 2 && CD.culturasAvaliadas.join() === 'Laranja,Limão',
    'CadastrosPCE.dados: cópia do bloco de citros + levantamento, código e culturas avaliadas', CD);
  ok(tfs.length === 1 && TF0.cadastroId === cads[0].id && json(TF0.tipoLocal)[0] === 'Propriedade Sítio Ficticio, Ramal Ficticio, km 3, Manaus/AM' && /Presença de sintomas de Cancro Cítrico/.test(TF0.constatacao)
    && /ART\. 26\./.test(TF0.enquadramento) && TF0.empresa === 'Citros Ficticio Ltda' && TF0.sintomas === 'sim' && TF0.plantasInspecionadas === 550, 'TermosPCE: termo de citros ligado ao cadastro, local, frases, enquadramento, empresa e números do relatório',
    TF0 && [TF0.cadastroId, TF0.tipoLocal, TF0.sintomas, TF0.plantasInspecionadas]);

  console.log('10. Reabrir');
  await p.evaluate(id => go('pcelev', id), lid); await p.waitForSelector('#pceLevForm');
  ok(await p.isEnabled('#pce-nome') && await v('cnpj') === '11.222.333/0001-81' && await v('empresa') === 'Citros Ficticio Ltda' && await v('endereco') === 'Ramal Ficticio, km 3', 'levantamento reaberto: campos liberados com CNPJ, empresa e endereço');
  ok(await visivel() && await marcado('det-cancro-tem', 'sim') && await marcado('det-hlb-tem', 'nao') && await marcado('det-acaro-tem', 'nao') && await p.inputValue('#pce-ci-det-cancro-tempo') === '3 semanas'
    && await p.locator('#pce-ci-culturas .pce-ci-cult').count() === 2 && await marcado('situacao', 'proprietario'), 'levantamento reaberto: bloco de citros com detecção e cultura');
  await p.click('[data-pce=descartarlev]'); await p.waitForSelector('#pce-novolev');
  await p.evaluate(() => go('pcetfs')); await p.waitForSelector('.mon-item');
  await p.click('.mon-item [data-mon=abrir]'); await p.waitForSelector('#monTfForm');
  ok(await p.locator('#mt-desc-citros').count() === 1 && await t('localAcao') === 'Propriedade Sítio Ficticio, Ramal Ficticio, km 3, Manaus/AM' && /Orientado o produtor/.test(await t('constatacao')), 'Termo reaberto: modo citros com local e descrição');
  await p.click('#monTfForm [data-mon=descartar]'); await p.waitForTimeout(300);
  await p.evaluate(id => PCEUI.levPronto(id), lid); await p.waitForSelector('#pce-lev-pronto');
  ok(await p.locator('#pce-pronto-cad').count() === 0 && /cadastro de citros \d{3}-\d{4}-MANAUS/.test(await p.textContent('.pce-visita')) && /Termo de Fiscalização \d{3}\.\d{4}\.MANAUS/.test(await p.textContent('#pce-pronto-tf')),
    'visita: cadastro de citros e Termo já feitos (sem pedir de novo)', (await p.textContent('.pce-visita')).replace(/\s+/g, ' '));

  console.log('11. Sem internet: o CPF busca no aparelho; praga só de outro programa sem bloco');
  await c.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await p.evaluate(() => go('pcelev')); await p.waitForSelector('#pceLevForm');
  await p.fill('#pce-doc', '529.982.247-25');
  await p.waitForFunction(() => /Cadastro encontrado/.test(document.querySelector('#pce-st-doc').textContent), null, { timeout: 10000 });
  ok(/Sem conexão/.test(await p.textContent('#pce-st-doc')) && await v('nome') === 'FULANO FICTICIO TESTE' && await v('cnpj') === '11.222.333/0001-81' && await v('empresa') === 'Citros Ficticio Ltda',
    'sem internet: produtor e propriedade (com CNPJ e empresa) do aparelho', (await p.textContent('#pce-st-doc')).replace(/\s+/g, ' '));
  await p.selectOption(card(0) + ' >> .p-praga', 'Monilíase do Cacaueiro'); await p.selectOption(cult(0, 0) + ' >> .c-cultura', 'Cacau'); await p.click(cult(0, 0) + ' >> .pce-res-nao_detectada');
  ok(!(await visivel()), 'monilíase: sem bloco de citros');
  await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto');
  ok(/Cadastrar a propriedade/.test(await p.textContent('#pce-pronto-cad')), 'levantamento de monilíase: o cadastro sugerido é o de monilíase (não o de citros)');
  const lid2 = await p.evaluate(async () => (await Store.todos('levantamentos')).find(x => /Moni/.test(x.pragas)).id);
  await c.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online'))); await sync();
  ok((await linhaDe('Levantamentos', lid2)).citros === '', 'levantamento sem praga de citros: coluna "citros" vazia');

  console.log('12. Validação do servidor (identificação do levantamento)');
  const VELHO = { id: 'lev-citros-ident', data: '2026-03-10', hora: '09:00', servidor: 'Ciclano Ficticio Teste', cargo: 'Fiscal Agropecuário Engenheiro Agrônomo', lotacao: 'Manaus', doc: '52998224725',
    nome: 'FULANO FICTICIO TESTE', municipio: 'Manaus', culturas: '[]', fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: agora, atualizadoEm: Date.now(),
    pragas: JSON.stringify([{ praga: 'Cancro Cítrico', culturas: [{ cultura: 'Limão', resultado: 'nao_detectada', coleta: 'Não', fotos: [] }] }]),
    cnpj: '11.222.333/0001', uf: 'amazonas', empresa: '=' + 'x'.repeat(200), endereco: 'Rua\nFicticia' };
  r = await post({ action: 'sync', key: TOKF, since: 0, levantamentos: [VELHO] });
  const V = await linhaDe('Levantamentos', VELHO.id);
  ok(r.ok && V.cnpj === '' && V.uf === 'AM' && V.empresa.length === 120 && !/^=/.test(V.empresa) && V.endereco === 'Rua Ficticia', 'CNPJ incompleto vazio, UF com 2 letras, textos curtos (sem "=" no início nem quebra de linha)', V && [V.cnpj, V.uf, V.empresa.length, V.endereco]);
  const { cnpj: _c, uf: _u, empresa: _e, endereco: _d, ...semIdent } = VELHO;
  r = await post({ action: 'sync', key: TOKF, since: 0, levantamentos: [{ ...semIdent, id: 'lev-citros-app-antigo', atualizadoEm: Date.now() }] });
  ok(r.ok && (await linhaDe('Levantamentos', 'lev-citros-app-antigo')).cnpj === '', 'app antigo (sem os campos novos): grava normalmente');
  // registro da versão anterior: CNPJ/endereço/UF dentro do JSON de citros aparecem nos dados do produtor ao reabrir
  const ANT = { ...semIdent, id: 'lev-citros-v1', atualizadoEm: Date.now(), citros: JSON.stringify({ v: 1, comercial: 'sim', cnpj: '11222333000181', endereco: 'Estrada Ficticia', uf: 'AM' }) };
  r = await post({ action: 'sync', key: TOKF, since: 0, levantamentos: [ANT] }); await sync();
  await p.evaluate(id => go('pcelev', id), ANT.id); await p.waitForSelector('#pceLevForm');
  ok(await v('cnpj') === '11.222.333/0001-81' && await v('endereco') === 'Estrada Ficticia' && await visivel() && !(await marcado('det-hlb-tem', 'sim')) && !(await marcado('det-hlb-tem', 'nao')),
    'registro da versão anterior: CNPJ/endereço vêm para os dados do produtor; detecção em branco', [await v('cnpj'), await v('endereco')]);
  await p.click('[data-pce=descartarlev]'); await p.waitForSelector('#pce-novolev');
  await p.evaluate(id => PCEUI.levPronto(id), ANT.id); await p.waitForSelector('#pce-lev-pronto');
  await p.click('#pce-pronto-tf'); await p.waitForTimeout(400);
  ok(/marque Ausência ou Presença de sintomas de HLB, Ácaro Hindustânico e Cancro Cítrico/.test(await toast()) && await p.locator('#monTfForm, #monCadForm').count() === 0, 'sem a detecção completa: não gera cadastro/termo de citros', await toast());
  // app: número negativo e CNPJ incompleto recusados ao salvar
  await p.evaluate(id => go('pcelev', id), ANT.id); await p.waitForSelector('#pceLevForm');
  for (const k of ['hlb', 'acaro', 'cancro']) await op(`det-${k}-tem`, 'nao');
  await p.click('#pce-ci-addcult'); await p.fill(lin(0, 'area'), '-2');
  await p.click('#pce-salvar'); await p.waitForTimeout(300);
  ok(/não pode ser negativa/.test(await toast()) && await p.locator('#pceLevForm').count() === 1, 'app: área negativa recusada ao salvar', await toast());
  await p.fill(lin(0, 'area'), '2'); await p.fill('#pce-cnpj', '1234');
  await p.click('#pce-salvar'); await p.waitForTimeout(300);
  ok(/14 dígitos/.test(await toast()), 'app: CNPJ incompleto recusado ao salvar', await toast());
  const lim = await p.evaluate(async () => { for (let i = 0; i < 25; i++) document.querySelector('#pce-ci-addcult').click(); await new Promise(r => setTimeout(r, 100)); return document.querySelectorAll('#pce-ci-culturas .pce-ci-cult').length; });
  ok(lim === 20, 'app: no máximo 20 linhas na cultura do citros', lim);
  await p.click('[data-pce=descartarlev]'); await p.waitForSelector('#pce-novolev');

  ok(!err.length, 'sem erros de JavaScript', err.slice(0, 4));
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
