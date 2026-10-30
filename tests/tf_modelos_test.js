const amb = require('./lib/amb'); const U = require('./lib/usuarios');
// Textos sugeridos do TF por BVA, produto e destino (CONFIG.TF.modelos): citros (limão, laranja, tangerina) na BVA - HUMAITÁ com destino
// Manaus → constatação e enquadramento do modelo de Humaitá (apreensão/rechaço) e "sem irregularidades" na liberação; nos demais, os gerais.
const { APP, API } = amb;
let falhas = 0;
const ok = (c, m, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); if (!c) falhas++; };
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
(async () => {
  await fetch(API + '/__fn?nome=listarBarreiras_&args=[]');                       // planilha nova: a barreira da CEASA (semente) antes da Humaitá
  const g = await amb.gerente('Gestora Ficticia Teste');
  let r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { nome: 'HUMAITÁ', municipio: 'Humaitá', endereco: 'BR-319 (fictício)', placa: true, ficha: false, ativo: true } });
  ok(r.ok, 'BVA - HUMAITÁ cadastrada no painel', r.erro);
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
  ok(/plantas cítricas/.test(t.c) && /retornou à origem/.test(t.c) && /IN Nº 21 de 25\/04\/2018/.test(t.e) && !/Mosca/.test(t.c), 'citros + Humaitá + Manaus + rechaço: constatação e enquadramento do modelo de Humaitá', t.c.slice(0, 80));
  await p.check('input[name=tf-proc][value=apreensao]'); t = await textos();
  ok(/plantas cítricas/.test(t.c) && /foi apreendido/.test(t.c) && /Dec. Nº 5.741/.test(t.e), 'apreensão: texto do modelo, com a apreensão');
  await p.check('input[name=tf-proc][value=liberacao]'); t = await textos();
  ok(/não foram constatadas irregularidades/.test(t.c) && t.e === '', 'liberação: "sem irregularidades" e enquadramento em branco', t);
  await p.check('input[name=tf-proc][value=rechaco]');
  await p.selectOption('#tf-produtos .prod select >> nth=0', 'MANGA'); t = await textos();
  ok(!/Mosca/.test(t.c) && /SEM a devida documentação/.test(t.c) && /Dec. Nº 5.741/.test(t.e) && !/IN Nº 21/.test(t.e), 'Humaitá com manga: texto sem a mosca (e sem a IN de citros)', t);
  await p.selectOption('#tf-produtos .prod select >> nth=0', 'TANGERINA'); await p.fill('#tf-destino', 'PORTO VELHO'); await p.dispatchEvent('#tf-destino', 'change'); t = await textos();
  ok(!/Mosca/.test(t.c) && !/plantas cítricas/.test(t.c), 'Humaitá, citros com destino fora de Manaus: texto sem a mosca', t.c.slice(0, 80));
  // outra BVA: continua o texto geral (mosca)
  await p.selectOption('#tf-barreira', 'BVA-CEASA'); t = await textos();
  ok(/Mosca-da-Carambola/.test(t.c) && /PORTARIA SDA\/MAPA/.test(t.e), 'outra BVA (CEASA): texto geral, com a mosca', t.c.slice(0, 80));
  await p.selectOption('#tf-barreira', 'BVA-HUMAITA');
  await p.fill('#tf-destino', 'Manaus/AM'); await p.dispatchEvent('#tf-destino', 'change');
  await p.fill('#tf-constatacao', 'Texto escrito pelo fiscal.'); await p.check('input[name=tf-proc][value=apreensao]'); t = await textos();
  ok(t.c === 'Texto escrito pelo fiscal.' && /IN Nº 21/.test(t.e), 'texto editado pelo fiscal não é trocado (o enquadramento sugerido entra)', t);
  ok(!err.length, 'sem erros de página', err);
  await b.close(); console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
