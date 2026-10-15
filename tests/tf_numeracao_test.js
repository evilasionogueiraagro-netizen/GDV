// Numeração dos TFs: unicidade por barreira/ano e conflitos de número na sincronização (só servidor, sem navegador).
// Complementa o tf_server_test (próximo nº, emissão sob lock, auditoria) com os casos do caminho offline (sync).
const amb = require('./lib/amb');
const assert = require('assert'); const B = amb.API;
const ANO = new Date(Date.now() - 4 * 3600e3).getUTCFullYear();
const post = b => fetch(B + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(B + p).then(r => r.json());
const fn = (nome, ...args) => get('/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args)));
const ativar = async nome => { const g = await get('/__gerar?nome=' + encodeURIComponent(nome)); const r = await post({ action: 'ativar', codigo: g.codigo }); assert.ok(r.ok); return r.token; };
let falhas = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const SUF = { 'BVA-CEASA': 'BVA - CEASA', 'MOVEL-1': 'BM - 01' };
(async () => {
  const A = await ativar('Ana Paula Lima'), Bk = await ativar('Bruno Costa Souza');
  await post({ action: 'sync', key: A, since: 0 });                              // cria a barreira padrão (BVA-CEASA) antes da móvel
  await fetch(B + '/__append?aba=Barreiras&row=' + encodeURIComponent(JSON.stringify(['MOVEL-1', 'Barreira móvel 1', 'BM - 01', 'BR-174', 1])));
  const t0 = Date.now();
  const TF = (id, numero, extra = {}) => {
    const barreira = extra.barreira || 'BVA-CEASA', ano = extra.ano || ANO, criadoEm = extra.criadoEm || t0;
    return { id, barreira, ano, numero, numeroTxt: String(numero).padStart(4, '0') + '/' + ano + ' - ' + SUF[barreira], data: ano + '-10-10', hora: '09:00',
             fiscal: 'x', local: 'BR-319', placa: 'ABC1D23', doc: '52998224725', nome: 'JOSE DA SILVA', procedimento: 'apreensao', auto: 0, advertencia: 0,
             constatacao: 'x', produtos: '[]', cancelado: 0, conflito: 0, numeroSugerido: numero, numeroOrigem: 'provisorio', atualizadoEm: criadoEm, ...extra, criadoEm };
  };
  const sync = (key, tfs) => post({ action: 'sync', key, since: 0, tfs });
  const planilha = async () => Object.fromEntries((await fn('lerLeitura_', 'TFs')).r.map(t => [t.id, t]));
  const prox = async (b = 'BVA-CEASA', ano = ANO) => (await post({ action: 'tfProximoNumero', key: A, barreira: b, ano })).proximo;

  console.log('1) mesmo número em barreiras ou anos diferentes não é conflito');
  await sync(A, [TF('a-ceasa-1', 1, { criadoEm: t0 + 1 }), TF('a-movel-1', 1, { barreira: 'MOVEL-1', criadoEm: t0 + 2 }), TF('a-ceasa-1-ant', 1, { ano: ANO - 1, criadoEm: t0 + 3 })]);
  let p = await planilha();
  ok(['a-ceasa-1', 'a-movel-1', 'a-ceasa-1-ant'].every(id => p[id] && p[id].conflito === 0), 'nº 1 na BVA, nº 1 na móvel e nº 1 do ano anterior: nenhum com conflito');
  ok(await prox() === 2 && await prox('MOVEL-1') === 2 && await prox('BVA-CEASA', ANO - 1) === 2, 'cada sequência avança sozinha (próximo = 2 nas três)');

  console.log('2) dois aparelhos offline com o mesmo número: o TF criado antes vale, chegue quando chegar');
  await sync(Bk, [TF('b-2-novo', 2, { criadoEm: t0 + 200 })]);                       // chega primeiro, mas foi criado depois
  p = await planilha(); ok(p['b-2-novo'].conflito === 0, 'sozinho, o nº 2 do Bruno entra sem conflito');
  const r = await sync(A, [TF('a-2-velho', 2, { criadoEm: t0 + 100 })]);              // chega depois, criado antes
  p = await planilha();
  ok(p['a-2-velho'].conflito === 0 && p['b-2-novo'].conflito === 1, 'o da Ana (criado antes) vale; o do Bruno passa a conflito = 1');
  ok(r.tfs.find(t => t.id === 'a-2-velho').conflito === 0, 'a resposta do sync traz o TF da Ana sem conflito');
  const rb = await sync(Bk, []);
  ok(rb.tfs.find(t => t.id === 'b-2-novo').conflito === 1, 'o aparelho do Bruno recebe o conflito no próximo sync');
  ok(await prox() === 3, 'o número em conflito continua ocupado: próximo = 3');

  console.log('3) empate no horário de criação: desempata pelo id');
  await sync(A, [TF('z-3', 3, { criadoEm: t0 + 300 }), TF('m-3', 3, { criadoEm: t0 + 300 })]);
  p = await planilha(); ok(p['m-3'].conflito === 0 && p['z-3'].conflito === 1, 'mesmo criadoEm no mesmo envio: "m-3" vale, "z-3" fica com conflito');

  console.log('4) reenvio não muda o resultado');
  const em = p['b-2-novo'].emitidoEm;
  await sync(Bk, [{ ...p['b-2-novo'], conflito: 0, atualizadoEm: t0 + 201 }]);       // o aparelho reenvia achando que não há conflito
  p = await planilha(); ok(p['b-2-novo'].conflito === 1 && p['a-2-velho'].conflito === 0, 'reenviar o TF perdedor com conflito = 0 não apaga o conflito');
  ok(p['b-2-novo'].emitidoEm === em, 'reenvio com emitidoEm não troca a data de emissão');

  console.log('5) corrigir o número tira o conflito');
  const livre = await prox();
  await sync(Bk, [{ ...p['b-2-novo'], numero: livre, numeroTxt: String(livre).padStart(4, '0') + '/' + ANO + ' - BVA - CEASA', numeroOrigem: 'editado', atualizadoEm: t0 + 400 }]);
  p = await planilha(); ok(p['b-2-novo'].numero === livre && p['b-2-novo'].conflito === 0, 'o TF do Bruno renumerado para ' + livre + ' fica sem conflito');
  ok(await prox() === livre + 1, 'a sequência segue depois do número corrigido');
  const au = (await fn('auditarSequencia_', 'BVA-CEASA', ANO)).r;
  ok(au.duplicados.map(d => d.numero).join() === '3', 'auditoria: só o nº 3 segue repetido (' + JSON.stringify(au.duplicados.map(d => d.numero)) + ')');

  console.log('6) cancelar não libera o número');
  await sync(A, [{ ...p['m-3'], cancelado: 1, motivoCancel: 'erro', atualizadoEm: t0 + 500 }]);
  p = await planilha(); ok(p['m-3'].cancelado === 1 && p['m-3'].conflito === 0 && p['z-3'].conflito === 1, 'TF cancelado continua dono do nº 3; o outro segue em conflito');

  console.log('7) emissão online não toma número já gravado pelo sync');
  const e = await post({ action: 'tfEmitir', key: A, tf: TF('a-online', 1, { numeroOrigem: 'sistema', criadoEm: t0 + 600 }) });
  ok(e.emitido === false && e.proximo === livre + 1, 'nº 1 recusado na emissão (já veio pelo sync); próximo livre = ' + e.proximo);
  const e2 = await post({ action: 'tfEmitir', key: A, tf: TF('a-movel-2', 2, { barreira: 'MOVEL-1', numeroOrigem: 'sistema', criadoEm: t0 + 600 }) });
  ok(e2.emitido === true, 'o nº 2 da móvel está livre e é emitido');

  console.log('8) o dono do número muda de número: o outro TF deixa de estar em conflito');
  await sync(A, [TF('w-9', 90, { criadoEm: t0 + 700 })]);
  await sync(Bk, [TF('l-9', 90, { criadoEm: t0 + 701 })]);
  p = await planilha(); ok(p['w-9'].conflito === 0 && p['l-9'].conflito === 1, 'nº 90 repetido: o mais antigo vale');
  await sync(A, [{ ...p['w-9'], numero: 91, numeroTxt: '0091/' + ANO + ' - BVA - CEASA', numeroOrigem: 'editado', atualizadoEm: t0 + 800 }]);
  p = await planilha(); ok(p['w-9'].conflito === 0 && p['l-9'].conflito === 0, 'o dono foi para o 91; o outro TF fica sozinho no 90 e sem conflito (conflito do 90 = ' + p['l-9'].conflito + ')');

  console.log(falhas ? 'FALHOU=' + falhas : 'OK');
  if (falhas) process.exitCode = 1;
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
