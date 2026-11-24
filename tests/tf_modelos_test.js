const amb = require('./lib/amb'); const U = require('./lib/usuarios');
// Textos sugeridos do TF na tela: a BVA cadastrada no painel aparece no formulário e, ao marcar o procedimento ou trocar produto, barreira,
// origem e destino, a constatação e o enquadramento são os da regra (TFUI.textosSugeridos); texto editado pelo fiscal não é trocado.
// A matriz BVA x produto x rota x procedimento (CONFIG.TF.modelos e CONFIG.TF.enquadramento) fica em tests/unit/tf_modelos_unit_test.js.
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
  // o que a tela mostra = a regra pura, com os mesmos campos
  const regra = proc => p.evaluate(pr => { const v = id => document.querySelector('#tf-' + id).value, sel = document.querySelector('#tf-barreira');
    return TFUI.textosSugeridos(pr, { barreira: sel.selectedOptions[0].textContent, produtos: [...document.querySelectorAll('#tf-produtos .prod select:first-of-type')].map(x => x.value),
      origem: v('origem'), destino: v('destino'), ufOrigem: v('ufOrigem'), ufDestino: v('ufDestino') }); }, proc);
  const igual = async proc => { const t = await textos(), r = await regra(proc); return t.c === r.constatacao && t.e === r.enquadramento ? t : { tela: t, regra: r }; };
  await p.check('input[name=tf-proc][value=rechaco]'); let t = await igual('rechaco');
  ok(t.c && /plantas cítricas/.test(t.c) && /1\.326/.test(t.e), 'Humaitá, laranja para Manaus, rechaço: a tela mostra o modelo de citros e o enquadramento da regra', t);
  await p.check('input[name=tf-proc][value=liberacao]'); t = await igual('liberacao');
  ok(t.c && /não foram constatadas irregularidades/.test(t.c) && t.e === '', 'trocar para liberação: textos da liberação e enquadramento em branco', t);
  await p.check('input[name=tf-proc][value=rechaco]');
  await p.selectOption('#tf-produtos .prod select >> nth=0', 'MANGA'); t = await igual('rechaco');
  ok(t.c && !/1\.326/.test(t.e), 'trocar o produto atualiza os textos (manga: sem cancro/HLB)', t);
  await p.selectOption('#tf-barreira', 'BVA-CEASA'); await p.fill('#tf-origem', 'Manaus'); await p.fill('#tf-destino', 'Parintins'); await p.dispatchEvent('#tf-destino', 'change'); t = await igual('rechaco');
  ok(t.c && /1\.675/.test(t.e), 'trocar barreira, origem e destino atualiza os textos (CEASA, manga saindo de Manaus: mosca)', t);
  await p.click('button[data-tf=addprod]'); await p.waitForSelector('#tf-produtos .prod >> nth=1');
  await p.selectOption('#tf-produtos .prod >> nth=1 >> select >> nth=0', 'LARANJA'); t = await igual('rechaco');
  ok(t.c && t.e, 'segundo produto entra na regra (carga mista)', t);
  await p.click('button[data-tf=delprod] >> nth=1'); await p.selectOption('#tf-produtos .prod select >> nth=0', 'LARANJA');

  await p.selectOption('#tf-barreira', 'BVA-HUMAITA'); await p.fill('#tf-origem', 'Porto Velho/RO');
  await p.fill('#tf-destino', 'Manaus/AM'); await p.dispatchEvent('#tf-destino', 'change');
  await p.fill('#tf-constatacao', 'Texto escrito pelo fiscal.'); await p.check('input[name=tf-proc][value=apreensao]'); t = await textos();
  ok(t.c === 'Texto escrito pelo fiscal.' && /1\.326/.test(t.e), 'texto editado pelo fiscal não é trocado (o enquadramento sugerido entra)', t);
  ok(!err.length, 'sem erros de página', err);
  await b.close(); console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
