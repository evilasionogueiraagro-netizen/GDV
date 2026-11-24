// Textos sugeridos do TF, sem tela: constatação por BVA, produto e destino (CONFIG.TF.modelos) e enquadramento por BVA, sentido da rota
// e produto (CONFIG.TF.enquadramento, planilha da GDV), pela regra pura TFUI.textosSugeridos (web/js/tf.js). Liberação: enquadramento
// em branco. A tela (lista de barreiras, textos aparecendo ao marcar o procedimento, texto editado pelo fiscal) fica em tests/tf_modelos_test.js
// e tests/tf_textos_test.js.
'use strict';
const L = require('./vm_loader');
const { ok, fim } = L.verificador();
const W = L.carregar(['web/js/config.js', 'web/js/tf.js'], ['CONFIG', 'TFUI']);
const txt = (proc, c) => L.copia(W.TFUI.textosSugeridos(proc, { origem: '', destino: '', ufOrigem: '', ufDestino: '', ...c }));
const H = { barreira: 'BVA - HUMAITÁ' }, C = { barreira: 'BVA - CEASA' }, J = { barreira: 'BVA - JUNDIÁ' };

// Humaitá
let t = txt('rechaco', { ...H, produtos: ['LARANJA'], destino: 'MANAUS' });
ok(/plantas cítricas/.test(t.constatacao) && /retornou à origem/.test(t.constatacao) && /Portaria SDA\/MAPA nº 1\.326 de 04\/07\/2025 \(HLB\)\.$/.test(t.enquadramento) && /IN nº 28\/2016;/.test(t.enquadramento)
  && !/IN nº 21|5\.741|1\.503/.test(t.enquadramento) && !/Mosca/.test(t.constatacao), 'citros + Humaitá + Manaus (entrada) + rechaço: constatação do modelo e enquadramento de cancro/HLB', t);
t = txt('apreensao', { ...H, produtos: ['LARANJA'], destino: 'MANAUS' });
ok(/plantas cítricas/.test(t.constatacao) && /foi apreendido/.test(t.constatacao) && /1\.326/.test(t.enquadramento), 'apreensão: texto do modelo, com a apreensão e o mesmo enquadramento', t);
t = txt('liberacao', { ...H, produtos: ['LARANJA'], destino: 'MANAUS' });
ok(/não foram constatadas irregularidades/.test(t.constatacao) && t.enquadramento === '', 'liberação: "sem irregularidades" e enquadramento em branco', t);
t = txt('rechaco', { ...H, produtos: ['MANGA'], destino: 'MANAUS' });
ok(!/Mosca/.test(t.constatacao) && /SEM a devida documentação/.test(t.constatacao) && /IN nº 38/.test(t.enquadramento) && !/1\.326|1\.675/.test(t.enquadramento),
  'Humaitá, manga entrando: texto sem a mosca e só as normas comuns (a planilha não tem a linha)', t);
t = txt('rechaco', { ...H, produtos: ['TANGERINA'], destino: 'PORTO VELHO' });
ok(!/Mosca/.test(t.constatacao) && !/plantas cítricas/.test(t.constatacao) && /1\.675 de 26\/08\/2026/.test(t.enquadramento) && !/1\.326/.test(t.enquadramento),
  'Humaitá, citros para Porto Velho (saída): texto sem a mosca, enquadramento da mosca', t);
t = txt('apreensao', { ...H, produtos: ['LARANJA'], origem: 'Porto Velho/RO', destino: 'Manaus/AM' });
ok(/1\.326/.test(t.enquadramento), 'Humaitá, "Porto Velho/RO" para "Manaus/AM": entrada (cancro/HLB)', t.enquadramento);

// CEASA (BVA de Manaus: o sentido é pelo município Manaus)
t = txt('rechaco', { ...C, produtos: ['TANGERINA'], origem: 'Porto Velho', destino: 'Manaus' });
ok(/1\.326/.test(t.enquadramento) && !/1\.675/.test(t.enquadramento), 'CEASA, tangerina entrando em Manaus: cancro/HLB', t.enquadramento);
ok(/Cancro Cítrico e do HLB/.test(t.constatacao) && !/Mosca/.test(t.constatacao) && /retornou à origem/.test(t.constatacao), 'CEASA, tangerina entrando: constatação de cancro/HLB, sem a mosca', t.constatacao);
t = txt('rechaco', { ...C, produtos: ['MANGA'], origem: 'Manaus', destino: 'Parintins' });
ok(/1\.188/.test(t.enquadramento) && /776/.test(t.enquadramento) && /1\.675/.test(t.enquadramento) && !/1\.326/.test(t.enquadramento), 'CEASA, manga saindo de Manaus: hospedeiros da mosca', t.enquadramento);
ok(/Mosca-da-Carambola/.test(t.constatacao), 'CEASA: constatação geral, com a mosca', t.constatacao.slice(0, 80));
t = txt('rechaco', { ...C, produtos: ['MANGA'] });
ok(/IN nº 38/.test(t.enquadramento) && !/1\.675|1\.326/.test(t.enquadramento), 'CEASA sem origem nem destino (sentido desconhecido): só as normas comuns', t.enquadramento);
t = txt('rechaco', { ...C, produtos: ['MANGA'], ufOrigem: 'AM', ufDestino: 'PA' });
ok(/1\.675/.test(t.enquadramento), 'CEASA, só UF de destino fora do AM: saída', t.enquadramento);

// Jundiá (sem sentido): limão = ácaro hindustânico; laranja = citros; carga mista junta as normas sem repetir
t = txt('rechaco', { ...J, produtos: ['LIMÃO'], origem: 'Manaus', destino: 'Parintins' });
ok(/IN nº 8 de 17\/04\/2012/.test(t.enquadramento) && !/IN nº 28|776|IN nº 21/.test(t.enquadramento), 'Jundiá, limão: ácaro hindustânico', t.enquadramento);
const lar = txt('rechaco', { ...J, produtos: ['LARANJA'] });
ok(/IN nº 21 de 25\/04\/2018/.test(lar.enquadramento) && /Portaria nº 780/.test(lar.enquadramento) && /IN nº 8/.test(lar.enquadramento), 'Jundiá, laranja: citros (IN 8, IN 21, Portaria 780)', lar.enquadramento);
const n = lar.enquadramento.split('; ').length;
t = txt('rechaco', { ...J, produtos: ['LARANJA', 'LIMÃO'] });
ok(t.enquadramento.split('; ').length === n && new Set(t.enquadramento.split('; ')).size === n && /IN nº 21/.test(t.enquadramento), 'Jundiá, laranja + limão: normas juntas, sem repetir', t.enquadramento);
t = txt('rechaco', { ...J, produtos: ['COCO'] });
ok(/ácaro hindustânico/.test(t.constatacao) && /retornou à origem/.test(t.constatacao) && /IN nº 8/.test(t.enquadramento) && /1\.188/.test(t.enquadramento), 'Jundiá, coco: constatação do ácaro hindustânico (modelo) e enquadramento do ácaro', t);
t = txt('rechaco', { ...C, produtos: ['COCO'] });
ok(!/ácaro/.test(t.constatacao), 'coco em outra BVA: o modelo do Jundiá não vale', t.constatacao.slice(0, 80));
t = txt('rechaco', { ...J, produtos: ['', 'LIMÃO'] });
ok(/IN nº 8/.test(t.enquadramento), 'linha de produto vazia é ignorada', t.enquadramento);

// textos gerais e matriz: todo procedimento de toda BVA dá constatação; enquadramento termina em ponto e só usa normas conhecidas
const E = W.CONFIG.TF.enquadramento, normas = new Set(Object.values(E.normas));
const bvas = ['BVA - HUMAITÁ', 'BVA - CEASA', 'BVA - AEROPORTO', 'BVA - JUNDIÁ', 'BVA - PARINTINS', 'BVA - FICTÍCIA'], erros = [];
for (const barreira of bvas) for (const p of W.CONFIG.TF.produtos) for (const [origem, destino] of [['Manaus', 'Porto Velho'], ['Porto Velho', 'Manaus'], ['', '']]) for (const proc of ['liberacao', 'apreensao', 'rechaco']) {
  const x = txt(proc, { barreira, produtos: [p], origem, destino });
  if (!x.constatacao) erros.push([barreira, p, proc, 'sem constatação']);
  if (proc === 'liberacao' ? x.enquadramento !== '' : !(x.enquadramento.endsWith('.') && x.enquadramento.slice(0, -1).split('; ').every(s => normas.has(s)))) erros.push([barreira, p, proc, x.enquadramento.slice(0, 60)]);
}
ok(!erros.length, `matriz ${bvas.length} BVAs x ${W.CONFIG.TF.produtos.length} produtos x 3 rotas x 3 procedimentos: constatação sempre preenchida e enquadramento só com normas da tabela`, erros.slice(0, 5));
const geral = txt('rechaco', { barreira: 'BVA - FICTÍCIA', produtos: ['MANGA'] });
ok(geral.constatacao === W.CONFIG.TF.constatacao.rechaco && geral.enquadramento === E.comum.map(k => E.normas[k]).join('; ') + '.', 'BVA sem modelo nem regra: textos gerais e normas comuns', geral);
fim();
