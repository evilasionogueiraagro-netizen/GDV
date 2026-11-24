// Painel, regras puras (web/painel/js/painel.js e painel-tf.js no vm, sem fakegas nem navegador): o mesmo servidor digitado de jeitos
// diferentes vira um nome só (a grafia mais usada), quantidades do TF ("12.723 Ton" = 12,723 t; "1.500 Kg" =
// 1.500 kg) e o alerta de quantidade fora do comum (mais de 60 t num produto). Os gráficos, a tabela "Desempenho por barreira" e o
// filtro de fiscal na tela ficam em tests/nomes_painel_test.js. Dados fictícios.
'use strict';
const L = require('./vm_loader');
const { ok, fim } = L.verificador();
// setTimeout inerte: o painel.js agenda a própria inicialização (login, eventos da tela), que não interessa aqui
const W = L.carregar(['web/js/config.js', 'web/painel/js/painel.js', 'web/painel/js/painel-tf.js'], ['Painel'], { globais: { setTimeout: () => 0 } });
const P = W.Painel, TF = P.aba('tf');

// 1. nomes canônicos
const canon = P.nomesCanonicos({
  tfs: [{ fiscal: 'FULANO FICTICIO TESTE' }, { fiscal: 'FULANO FICTICIO TESTE' }, { fiscal: 'Fulano  Fictício Teste' }, { fiscal: 'Beltrano Ficticio Teste e fulano ficticio teste' }, { fiscal: 'BELTRANO FICTICIO TESTE' }],
  turnos: [{ fiscal: 'Fulano Ficticio Teste' }, { fiscal: 'FULANO FICTICIO TESTE e Beltrano Ficticio Teste' }],
  termosPce: [{ servidor: 'Pessoa Ficticia Alfa' }, { servidor: 'pessoa ficticia alfa' }, { servidor: 'PESSOA FICTÍCIA ALFA' }, { servidor: 'Pessoa Ficticia Alfa' }]
});
ok(['Fulano  Fictício Teste', 'fulano ficticio teste', 'Fulano Ficticio Teste', ' FULANO FICTICIO TESTE '].every(n => canon(n) === 'FULANO FICTICIO TESTE'),
  'Fulano em 4 grafias (maiúsculas, acento, espaço a mais) vira a grafia mais usada', ['Fulano  Fictício Teste', 'fulano ficticio teste'].map(canon));
ok(canon('BELTRANO FICTICIO TESTE') === canon('Beltrano Ficticio Teste'), 'Beltrano: uma grafia só (a mais usada)', [canon('BELTRANO FICTICIO TESTE'), canon('Beltrano Ficticio Teste')]);
ok(canon('beltrano ficticio teste e Fulano Ficticio Teste') === canon('Beltrano Ficticio Teste') + ' e FULANO FICTICIO TESTE', 'dupla ("A e B") normaliza cada nome', canon('beltrano ficticio teste e Fulano Ficticio Teste'));
ok(canon('pessoa ficticia alfa') === 'Pessoa Ficticia Alfa', 'servidor do PCE entra na contagem (termosPce)', canon('pessoa ficticia alfa'));
ok(canon('Pessoa Ficticia Desconhecida') === 'Pessoa Ficticia Desconhecida' && canon('') === '', 'nome sem registro fica como está');

// 2. quantidades do TF
const q = arr => L.copia(P.parseProdutos(JSON.stringify(arr)));
const pr = q(['LARANJA - 12.723 Ton', 'MANGA - 1.500 Kg', 'LIMÃO - 80 Ton', 'GOIABA - 1.500,5 Kg', 'COCO - 2.000 Caixas', 'TOMATE - 0,5 Ton', 'BANANA']);
const qtd = Object.fromEntries(pr.map(x => [x.produto, x.qtd]));
ok(qtd.LARANJA === 12.723, '"12.723 Ton" = 12,723 t (em tonelada, um ponto só é decimal)', qtd.LARANJA);
ok(qtd.MANGA === 1500 && qtd['GOIABA'] === 1500.5 && qtd.COCO === 2000, '"1.500 Kg" = 1.500; "1.500,5 Kg" = 1.500,5; "2.000 Caixas" = 2.000 (ponto de milhar)', qtd);
ok(qtd['LIMÃO'] === 80 && qtd.TOMATE === 0.5 && qtd.BANANA === null, '"80 Ton" = 80; "0,5 Ton" = 0,5; sem quantidade = null', qtd);
ok(L.copia(P.parseProdutos(JSON.stringify([{ p: 'ABIU', q: '3', u: 'Kg' }])))[0].qtd === 3, 'formato novo (objeto {p, q, u}) também lido');
ok(L.copia(TF.unidade('Ton')).join() === 'kg,1000' && L.copia(TF.unidade('quilos')).join() === 'kg,1' && L.copia(TF.unidade('CX'))[0] === 'caixas', 'unidade canônica: Ton x 1000 em kg; caixas à parte');

// 3. alerta de quantidade fora do comum (> 60 t num produto)
const tf = arr => ({ produtosLista: q(arr) });
ok(TF.QTD_MAX_KG === 60000, 'limite do alerta: 60 t');
ok(!TF.qtdForaDoComum(tf(['LARANJA - 12.723 Ton'])), '12,723 t não entra no alerta');
ok(TF.qtdForaDoComum(tf(['MANGA - 1.500 Kg', 'LIMÃO - 80 Ton'])), '80 t num produto entra no alerta');
ok(!TF.qtdForaDoComum(tf(['MANGA - 60 Ton'])) && TF.qtdForaDoComum(tf(['MANGA - 60.001 Kg'])), 'no limite (60 t) não alerta; 60.001 kg alerta');
ok(!TF.qtdForaDoComum(tf(['COCO - 90.000 Caixas'])), 'caixas não entram no alerta (não são massa)');
fim();
