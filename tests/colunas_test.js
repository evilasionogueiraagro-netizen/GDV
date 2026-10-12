const amb = require('./lib/amb');
// Planilha com uma coluna acrescentada à mão no lugar de uma coluna nova do sistema (ex.: anotação na coluna AD de Levantamentos,
// onde a versão nova põe "pragas"): o envio não pode travar; a coluna de fora anda para a direita com os dados e a do sistema entra no lugar.
const { API } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? ' -> ' + JSON.stringify(x).slice(0, 400) : '')); if (!c) falhas++; };
(async () => {
  const VELHAS = ['id', 'data', 'hora', 'servidor', 'cargo', 'matricula', 'lotacao', 'doc', 'nome', 'telefone', 'email', 'propriedade', 'codigoPropriedade',
    'situacaoFundiaria', 'municipio', 'lat', 'lon', 'precisao', 'culturas', 'fotos', 'assinaturas', 'obs', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
    'registroAntigo', 'documentos'];
  const ap = (aba, row) => fetch(API + '/__append?aba=' + aba + '&row=' + encodeURIComponent(JSON.stringify(row)));
  await ap('Levantamentos', VELHAS.concat(['Anotação da gerência']));
  const lin = VELHAS.map(c => c === 'id' ? 'lev-velho' : c === 'data' ? '2026-01-10' : c === 'municipio' ? 'Manaus' : c === 'excluido' ? 0 : '');
  await ap('Levantamentos', lin.concat(['conferido pelo chefe']));
  const agora = Date.now();
  const d = await post({ action: 'sync', key: 'segredo', since: 0, turnos: [{ id: 'c1', numeroTF: 'TF-1', data: '2026-10-12', letra: 'A', inicio: '08:00', fim: '', fiscal: 'Fulano de Tal',
    local: 'BVA - CEASA', unidade: 'MANAUS', posto: 'Fixa', encerrado: 0, criadoEm: agora, atualizadoEm: agora }] });
  ok(d.ok, 'sincronização não trava com a coluna de fora na posição 30', d.erro);
  const L = await (await fetch(API + '/__aba?nome=Levantamentos')).json();
  ok(L[0][29] === 'pragas' && L[0][30] === 'Anotação da gerência', 'cabeçalho: "pragas" na coluna 30, a anotação andou para a 31', L[0].slice(27));
  ok(L[1][0] === 'lev-velho' && L[1][30] === 'conferido pelo chefe' && L[1][29] === '', 'dados da anotação continuam na coluna dela; "pragas" vazio no registro antigo', L[1].slice(27));
  const d2 = await post({ action: 'sync', key: 'segredo', since: 0 });
  ok(d2.ok, 'segunda sincronização normal', d2.erro);
  const L2 = await (await fetch(API + '/__aba?nome=Levantamentos')).json();
  ok(L2[0].filter(c => c === 'pragas').length === 1 && L2[0][30] === 'Anotação da gerência', 'nada muda de novo na segunda vez (sem coluna duplicada)', L2[0].slice(27));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
