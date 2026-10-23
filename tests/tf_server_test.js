const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const assert = require('assert'); const B = amb.API;
const ANO = new Date(Date.now() - 4 * 3600e3).getUTCFullYear();   // o servidor informa o último nº do ano corrente
const post = b => fetch(B + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(B + p).then(r => r.json());
const fn = (nome, ...args) => get('/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args)));
const ativar = async nome => { const r = await U.fiscal(nome); assert.ok(r.token); return r.token; };
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); assert.ok(c, m); };
(async () => {
  const A = await ativar('Ana Paula Lima'), Bk = await ativar('Bruno Costa Souza');
  const agora = Date.now();
  const TF = (id, numero, extra = {}) => ({ id, barreira: 'BVA-CEASA', ano: ANO, numero, numeroTxt: String(numero).padStart(4, '0') + '/' + ANO + ' - BVA - CEASA', data: '2026-10-10', hora: '09:00', fiscal: 'x', local: 'BR-319 PORTO DA CEASA', placa: 'ABC1D23', doc: '52998224725', nome: 'JOSE DA SILVA', procedimento: 'apreensao', auto: 0, advertencia: 0, constatacao: 'x'.repeat(2500), produtos: '["MANGA - 10 Kg"]', cancelado: 0, conflito: 0, numeroSugerido: numero, numeroOrigem: 'sistema', criadoEm: agora + numero, atualizadoEm: agora + numero, ...extra });
  const emitir = (key, tf, extra = {}) => post({ action: 'tfEmitir', key, tf, ...extra });
  const prox = (key, b = 'BVA-CEASA', ano = ANO) => post({ action: 'tfProximoNumero', key, barreira: b, ano });

  console.log('1) próximo número: uma sequência única por barreira/ano');
  let r = await post({ action: 'sync', key: A, since: 0 }); ok(r.barreiras.length === 1 && r.ultimos['BVA-CEASA|' + ANO] === 0, 'sync informa o último nº de cada barreira: ' + JSON.stringify(r.ultimos));
  r = await prox(A); ok(r.proximo === 1 && r.ultimo === 0 && r.ultimoTF === null, 'sem TFs: próximo = 1');
  r = await prox(A, 'NAO-EXISTE'); ok(/desconhecida/.test(r.erro), 'barreira inexistente recusada');
  r = await prox('token-ruim'); ok(!r.ok, 'sem credencial não consulta');

  console.log('2) emissão: o número só é gravado se ainda estiver livre');
  r = await emitir(A, TF('tfA1', 1), { pessoa: { id: '52998224725', tipo: 'PF', nome: 'JOSE DA SILVA', rg: '1', endereco: 'RUA X', municipio: 'MANAUS', uf: 'AM', telefone: '9', criadoEm: agora, atualizadoEm: agora }, placa: { id: 'ABC1D23', doc: '52998224725', nome: 'JOSE DA SILVA', criadoEm: agora, atualizadoEm: agora } });
  ok(r.emitido === true && r.emitidoEm > 0, 'Ana emitiu o nº 1 (emitidoEm gravado)');
  const em1 = r.emitidoEm;
  r = await emitir(Bk, TF('tfB1', 1, { nome: 'OUTRO', criadoEm: agora + 50 }));
  ok(r.emitido === false && r.proximo === 2 && r.ocupadoPor.usuario === 'Ana Paula Lima', 'Bruno tentou o nº 1 (já usado por Ana): recusado, próximo livre = ' + r.proximo + ', ocupado por ' + r.ocupadoPor.usuario);
  let dumpTF = (await fn('lerLeitura_', 'TFs')).r; ok(dumpTF.length === 1, 'o TF recusado NÃO foi gravado na planilha');
  r = await emitir(Bk, TF('tfB1', 2, { nome: 'OUTRO', doc: '11144477735', placa: 'XYZ9K88', criadoEm: agora + 60 })); ok(r.emitido === true, 'Bruno emitiu o nº 2');
  r = await emitir(A, TF('tfA1', 1)); ok(r.emitido === true && r.emitidoEm === em1, 'reenviar o mesmo TF é aceito e não muda a data de emissão (idempotente)');
  r = await prox(A); ok(r.proximo === 3 && r.ultimoTF.usuario === 'Bruno Costa Souza' && r.ultimoTF.numeroTxt.startsWith('0002/' + ANO), 'próximo = 3; último usado: ' + JSON.stringify(r.ultimoTF));
  const [x, y] = await Promise.all([emitir(A, TF('tfA3', 3, { criadoEm: agora + 70 })), emitir(Bk, TF('tfB3', 3, { criadoEm: agora + 71 }))]);
  ok([x.emitido, y.emitido].filter(Boolean).length === 1, 'dois fiscais emitindo o mesmo nº ao mesmo tempo: só um vence');

  console.log('3) cancelado mantém o número; ano novo recomeça');
  const ts = (await fn('lerLeitura_', 'TFs')).r.filter(t => t.numero === 3)[0];
  r = await post({ action: 'sync', key: ts.usuario === 'Ana Paula Lima' ? A : Bk, since: 0, tfs: [{ ...ts, cancelado: 1, motivoCancel: 'erro', atualizadoEm: agora + 9999 }] });
  r = await prox(A); ok(r.proximo === 4, 'TF cancelado continua ocupando o nº 3 → próximo = 4');
  r = await prox(A, 'BVA-CEASA', 2027); ok(r.proximo === 1, 'ano novo recomeça em 1');

  console.log('4) uso offline (provisório) e duplicidade na sincronização');
  r = await post({ action: 'sync', key: Bk, since: 0, tfs: [TF('tfOff', 2, { numeroOrigem: 'provisorio', criadoEm: agora + 500, atualizadoEm: agora + 500 })] });
  const off = r.tfs.find(t => t.id === 'tfOff'); ok(off.conflito === 1 && off.emitidoEm > 0, 'nº 2 repetido enviado pelo caminho offline: fica com conflito = 1 e emitidoEm preenchido');
  ok(r.ultimos['BVA-CEASA|' + ANO] === 3, 'último usado informado ao aparelho: ' + r.ultimos['BVA-CEASA|' + ANO]);

  console.log('5) auditoria da sequência');
  await emitir(A, TF('tfA6', 6, { numeroOrigem: 'editado', numeroSugerido: 4, criadoEm: agora + 800 }));          // pulou 4 e 5 (número editado à mão)
  const au = (await fn('auditarSequencia_', 'BVA-CEASA', ANO)).r;
  ok(JSON.stringify(au.lacunas) === '[4,5]', 'lacunas: ' + JSON.stringify(au.lacunas));
  ok(au.duplicados.length === 1 && au.duplicados[0].numero === 2, 'número repetido: ' + JSON.stringify(au.duplicados.map(d => d.numero)));
  ok(au.editados.some(e => e.numero === 6 && e.origem === 'editado' && e.sugerido === 4) && au.editados.some(e => e.origem === 'provisorio'), 'números editados/provisórios listados com o que o sistema sugeriu: ' + JSON.stringify(au.editados));
  const dump = (await fn('lerLeitura_', 'TFs')).r.find(t => t.id === 'tfA6'); ok(dump.numeroSugerido === 4 && dump.numeroOrigem === 'editado', 'planilha guarda o nº sugerido (4) e o usado (6)');

  console.log('6) ponto de partida definido pelo administrador');
  r = await fn('definirSequencia_', 'BVA-CEASA', ANO, 100); ok(r.r === 100, 'último usado definido = 100');
  r = await prox(A); ok(r.proximo === 101, 'próximo = 101');
  r = await emitir(A, TF('tfA101', 101, { criadoEm: agora + 900 })); ok(r.emitido, 'emite o 101');
  await fetch(B + '/__append?aba=Barreiras&row=' + encodeURIComponent(JSON.stringify(['MOVEL-1', 'Barreira móvel 1', 'BM - 01', 'BR-174', 1])));
  r = await prox(A, 'MOVEL-1'); ok(r.proximo === 1, 'outra barreira tem sequência própria (começa em 1)');
  r = await emitir(A, TF('tfM1', 1, { barreira: 'MOVEL-1', numeroTxt: '0001/' + ANO + ' - BM - 01' })); ok(r.emitido, 'nº 1 da barreira móvel não conflita com o nº 1 da BVA');

  console.log('7) textos longos, visibilidade e reincidência (inalterados)');
  r = await post({ action: 'sync', key: A, since: 0 }); const m = r.tfs.find(t => t.id === 'tfA1'); ok(m.constatacao.length === 2500 && m.usuario === 'Ana Paula Lima', 'texto de 2500 caracteres preservado; usuario gravado pelo servidor');
  ok(r.tfs.every(t => t.usuario === 'Ana Paula Lima'), 'Ana só recebe os próprios TFs');
  let c = await post({ action: 'tfConsultar', key: Bk, doc: '529.982.247-25', placa: '' }); ok(c.historicoDoc.reincidente === true && c.pessoa.nome === 'JOSE DA SILVA', 'reincidência por CPF: ' + c.historicoDoc.apreensoes + ' apreensão(ões)');
  console.log('OK');
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
