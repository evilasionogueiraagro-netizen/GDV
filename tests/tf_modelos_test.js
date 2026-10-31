const amb = require('./lib/amb'); const U = require('./lib/usuarios');
// Textos sugeridos do TF: constatação por BVA, produto e destino (CONFIG.TF.modelos: citros na BVA - HUMAITÁ com destino Manaus) e
// enquadramento por BVA, sentido da rota e produto (CONFIG.TF.enquadramento, planilha da GDV); liberação com enquadramento em branco.
const { APP, API } = amb;
let falhas = 0;
const ok = (c, m, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); if (!c) falhas++; };
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
(async () => {
  await fetch(API + '/__fn?nome=listarBarreiras_&args=[]');                       // planilha nova: a barreira da CEASA (semente) antes da Humaitá
  const g = await amb.gerente('Gestora Ficticia Teste');
  let r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { nome: 'HUMAITÁ', municipio: 'Humaitá', endereco: 'BR-319 (fictício)', placa: true, ficha: false, ativo: true } });
  ok(r.ok, 'BVA - HUMAITÁ cadastrada no painel', r.erro);
  r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { nome: 'JUNDIÁ', municipio: 'Presidente Figueiredo', endereco: 'BR-174 (fictício)', placa: true, ficha: false, ativo: true } });
  ok(r.ok, 'BVA - JUNDIÁ cadastrada no painel', r.erro);
  const b = await amb.lancar(), A = await U.fiscal('Fulano Ficticio Teste');
  const c = await b.newContext({ viewport: { width: 400, height: 900 } });
  await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [A.token, A.nome]);
  const p = await c.newPage(), err = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(APP); await p.waitForSelector('.modulo', { timeout: 15000 });
  await p.click('.modulo[data-v=tf]'); await p.waitForSelector('button[data-tf=novo]');
  await p.click('button[data-tf=novo]'); await p.waitForSelector('#tfForm');
  const opcoes = await p.$$eval('#tf-barreira option', o => o.map(x => x.value));
  ok(opcoes.includes('BVA-HUMAITA'), 'BVA - HUMAITÁ na lista de barreiras do TF', opcoes);
  await p.selectOption('#tf-barreira', 'BVA-HUMAITA');
  await p.selectOption('#tf-produtos .prod select >> nth=0', 'LARANJA'); await p.fill('#tf-produtos .prod input', '100');
  await p.fill('#tf-destino', 'MANAUS'); await p.dispatchEvent('#tf-destino', 'change');
  const textos = async () => ({ c: await p.inputValue('#tf-constatacao'), e: await p.inputValue('#tf-enquadramento') });
  await p.check('input[name=tf-proc][value=rechaco]'); let t = await textos();
  ok(/plantas cítricas/.test(t.c) && /retornou à origem/.test(t.c) && /Portaria SDA\/MAPA nº 1\.326 de 04\/07\/2025 \(HLB\)\.$/.test(t.e) && /IN nº 28 de 24\/2016/.test(t.e) && !/IN nº 21|5\.741|1\.503/.test(t.e) && !/Mosca/.test(t.c), 'citros + Humaitá + Manaus (entrada) + rechaço: constatação do modelo e enquadramento de cancro/HLB', t.c.slice(0, 80));
  await p.check('input[name=tf-proc][value=apreensao]'); t = await textos();
  ok(/plantas cítricas/.test(t.c) && /foi apreendido/.test(t.c) && /1\.326/.test(t.e), 'apreensão: texto do modelo, com a apreensão e o mesmo enquadramento');
  await p.check('input[name=tf-proc][value=liberacao]'); t = await textos();
  ok(/não foram constatadas irregularidades/.test(t.c) && t.e === '', 'liberação: "sem irregularidades" e enquadramento em branco', t);
  await p.check('input[name=tf-proc][value=rechaco]');
  await p.selectOption('#tf-produtos .prod select >> nth=0', 'MANGA'); t = await textos();
  ok(!/Mosca/.test(t.c) && /SEM a devida documentação/.test(t.c) && /IN nº 38/.test(t.e) && !/1\.326|1\.675/.test(t.e), 'Humaitá, manga entrando: texto sem a mosca e só as normas comuns (a planilha não tem a linha)', t);
  await p.selectOption('#tf-produtos .prod select >> nth=0', 'TANGERINA'); await p.fill('#tf-destino', 'PORTO VELHO'); await p.dispatchEvent('#tf-destino', 'change'); t = await textos();
  ok(!/Mosca/.test(t.c) && !/plantas cítricas/.test(t.c) && /1\.675 de 26\/08\/2026/.test(t.e) && !/1\.326/.test(t.e), 'Humaitá, citros para Porto Velho (saída): texto sem a mosca, enquadramento da mosca', t);
  // CEASA: entrada de citros em Manaus (cancro/HLB) x saída de manga (mosca); carga mista junta as normas sem repetir
  await p.selectOption('#tf-barreira', 'BVA-CEASA');
  await p.fill('#tf-origem', 'Porto Velho'); await p.fill('#tf-destino', 'Manaus'); await p.dispatchEvent('#tf-destino', 'change'); t = await textos();
  ok(/1\.326/.test(t.e) && !/1\.675/.test(t.e), 'CEASA, tangerina entrando em Manaus: cancro/HLB', t.e);
  await p.fill('#tf-origem', 'Manaus'); await p.fill('#tf-destino', 'Parintins'); await p.dispatchEvent('#tf-destino', 'change');
  await p.selectOption('#tf-produtos .prod select >> nth=0', 'MANGA'); t = await textos();
  ok(/1\.188/.test(t.e) && /776/.test(t.e) && /1\.675/.test(t.e) && !/1\.326/.test(t.e), 'CEASA, manga saindo de Manaus: hospedeiros da mosca', t.e);
  ok(/Mosca-da-Carambola/.test(t.c), 'CEASA: constatação geral, com a mosca', t.c.slice(0, 80));
  // Jundiá (sem sentido): limão = ácaro hindustânico; laranja = citros; carga mista junta as normas sem repetir
  await p.selectOption('#tf-barreira', 'BVA-JUNDIA');
  await p.selectOption('#tf-produtos .prod select >> nth=0', 'LIMÃO'); t = await textos();
  ok(/IN nº 8 de 17\/04\/2012/.test(t.e) && !/IN nº 28|776|IN nº 21/.test(t.e), 'Jundiá, limão: ácaro hindustânico', t.e);
  await p.selectOption('#tf-produtos .prod select >> nth=0', 'LARANJA'); t = await textos();
  ok(/IN nº 21 de 25\/04\/2018/.test(t.e) && /Portaria nº 780/.test(t.e) && /IN nº 8/.test(t.e), 'Jundiá, laranja: citros (IN 8, IN 21, Portaria 780)', t.e);
  const n = t.e.split('; ').length;
  await p.click('button[data-tf=addprod]'); await p.waitForSelector('#tf-produtos .prod >> nth=1');
  await p.selectOption('#tf-produtos .prod >> nth=1 >> select >> nth=0', 'LIMÃO'); t = await textos();
  ok(t.e.split('; ').length === n && new Set(t.e.split('; ')).size === n && /IN nº 21/.test(t.e), 'Jundiá, laranja + limão: normas juntas, sem repetir', t.e);
  await p.click('button[data-tf=delprod] >> nth=1');

  await p.selectOption('#tf-barreira', 'BVA-HUMAITA'); await p.fill('#tf-origem', 'Porto Velho/RO');
  await p.fill('#tf-destino', 'Manaus/AM'); await p.dispatchEvent('#tf-destino', 'change');
  await p.fill('#tf-constatacao', 'Texto escrito pelo fiscal.'); await p.check('input[name=tf-proc][value=apreensao]'); t = await textos();
  ok(t.c === 'Texto escrito pelo fiscal.' && /1\.326/.test(t.e), 'texto editado pelo fiscal não é trocado (o enquadramento sugerido entra)', t);
  ok(!err.length, 'sem erros de página', err);
  await b.close(); console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
