const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Medição de desempenho (desempenho.gs): cada chamada ao doPost vira uma amostra no cache; ao fechar o lote, uma linha por hora e action na
// aba Desempenho (média, p50, p90, máximo, erros, espera do lock, leituras). Code.gs real (fakegas). Dados fictícios.
const B = amb.API;
const post = b => fetch(B + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(B + p).then(r => r.json());
const fn = (nome, ...args) => get('/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args)));
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };
const aba = async n => { const rows = (await get('/__aba?nome=' + n)) || []; const cab = rows[0] || []; return rows.slice(1).map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]))); };

(async () => {
  const F = await U.fiscal('Fulano Ficticio Teste');
  await fn('cacheApagar_', 'des_amostras');
  const antes = (await aba('Desempenho')).length;

  console.log('1) chamadas viram amostras no cache, sem gravar na planilha a cada chamada');
  for (let i = 0; i < 5; i++) await post({ action: 'sync', key: F.token, since: 0 });
  await post({ action: 'acaoQueNaoExiste', key: F.token });
  const cache = JSON.parse((await fn('cacheLer_', 'des_amostras')).r || '[]');
  ok(cache.length === 6 && cache.filter(a => a[1] === 'sync').length === 5, '6 amostras no cache (5 sync, 1 com erro)', cache.map(a => a[1]));
  ok(cache.every(a => a[2] >= 0 && a[3] >= 0) && cache.filter(a => a[1] === 'sync').every(a => a[6] > 0), 'cada amostra tem tempo total, espera do lock e leituras de aba', cache[0]);
  ok((await aba('Desempenho')).length === antes, 'nada gravado na aba ainda (lote aberto)');

  console.log('2) lote fechado: resumo por hora e action na aba Desempenho');
  const lote = (await fn('cacheLer_', 'des_amostras')).r;
  const velho = JSON.parse(lote); velho[0][0] -= 16 * 60e3;                       // primeira amostra há 16 min: a janela de 15 min fechou
  await fn('cacheGravar_', 'des_amostras', JSON.stringify(velho), 3600);
  await post({ action: 'sync', key: F.token, since: 0 });
  const linhas = (await aba('Desempenho')).slice(antes);
  const s = linhas.find(l => l.acao === 'sync'), e = linhas.find(l => l.acao === 'acaoQueNaoExiste');
  ok(s && Number(s.n) + (linhas.filter(l => l.acao === 'sync' && l !== s).reduce((t, l) => t + Number(l.n), 0)) === 6, 'sync: 6 chamadas resumidas', linhas);
  ok(s && /^\d{4}-\d\d-\d\d \d\dh$/.test(s.hora) && Number(s.p90Ms) >= Number(s.p50Ms) && Number(s.maxMs) >= Number(s.p90Ms) && Number(s.leiturasMedia) > 0 && s.versao,
    'linha com hora de Manaus, p50 ≤ p90 ≤ máximo, leituras e versão do código', s);
  ok(e && Number(e.erros) === 1, 'action inválida conta como erro', e);
  ok(!(await fn('cacheLer_', 'des_amostras')).r, 'cache esvaziado: começa outro lote');

  console.log('2b) fila de gravação ocupada: o resumo não segura a resposta, as amostras voltam ao cache');
  await get('/__lockfalha?n=1').catch(() => {});
  const g = await fn('gravarDesempenho_', [[Date.now(), 'sync', 10, 0, 0, 0, 1, 1, 0]], Date.now());
  const volta = JSON.parse((await fn('cacheLer_', 'des_amostras')).r || '[]');
  ok(Array.isArray(g.r) && !g.r.length && volta.length === 1, 'lock ocupado: nada gravado agora e a amostra fica para o próximo lote', [g, volta]);
  await fn('cacheApagar_', 'des_amostras');

  console.log('3) desligar pela propriedade do script');
  await fn('setProp_', 'DESEMPENHO_DESLIGADO', '1');
  await post({ action: 'sync', key: F.token, since: 0 });
  ok(!(await fn('cacheLer_', 'des_amostras')).r, 'com DESEMPENHO_DESLIGADO = 1 não mede');
  await fn('delProp_', 'DESEMPENHO_DESLIGADO');
  const r = await post({ action: 'sync', key: F.token, since: 0 });
  ok(r.ok, 'a resposta da API continua normal com a medição ligada', r.erro);

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
