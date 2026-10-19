const amb = require('./lib/amb');
// Planilha real (out/2026): a aba Levantamentos tinha cópias antigas de colunas do sistema ("registroAntigo", "documentos") logo depois de
// "pragas" (coluna 31+). A versão com "tipoLocal"/"origemVisita" na coluna 31 travava todos os envios com
// 'Cabeçalho da aba Levantamentos diferente do esperado na coluna 31 (coluna "registroAntigo" repetida)'.
// Agora a cópia anda para a direita com os dados e o que só existia nela vai para a coluna oficial.
const { API } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? ' -> ' + JSON.stringify(x).slice(0, 400) : '')); if (!c) falhas++; };
(async () => {
  const BASE = ['id', 'data', 'hora', 'servidor', 'cargo', 'matricula', 'lotacao', 'doc', 'nome', 'telefone', 'email', 'propriedade', 'codigoPropriedade',
    'situacaoFundiaria', 'municipio', 'lat', 'lon', 'precisao', 'culturas', 'fotos', 'assinaturas', 'obs', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
    'registroAntigo', 'documentos', 'pragas'];
  const ap = (aba, row) => fetch(API + '/__append?aba=' + aba + '&row=' + encodeURIComponent(JSON.stringify(row)));
  await ap('Levantamentos', BASE.concat(['registroAntigo', 'documentos']));
  const lin = (id, oficial, copia) => BASE.map(c => c === 'id' ? id : c === 'data' ? '2026-03-10' : c === 'municipio' ? 'Autazes' : c === 'excluido' ? 0 : c === 'registroAntigo' ? oficial : '');
  await ap('Levantamentos', lin('lev-a', '', '').concat(['1', '["doc-1"]']));       // valor só na cópia
  await ap('Levantamentos', lin('lev-b', '0', '').concat(['1', '']));              // oficial preenchido: não muda
  const agora = Date.now();
  const d = await post({ action: 'sync', key: 'segredo', since: 0, turnos: [{ id: 'c1', numeroTF: 'TF-1', data: '2026-10-14', letra: 'A', inicio: '05:52', fim: '', fiscal: 'Fulano de Tal',
    local: 'BVA - CEASA', unidade: 'MANAUS', posto: 'Fixa', encerrado: 0, criadoEm: agora, atualizadoEm: agora }] });
  ok(d.ok, 'envio não trava com "registroAntigo"/"documentos" repetidos na coluna 31', d.erro);
  const L = await (await fetch(API + '/__aba?nome=Levantamentos')).json();
  ok(L[0][30] === 'tipoLocal' && L[0][31] === 'origemVisita' && L[0][32] === 'citros' && L[0][33] === 'registroAntigo' && L[0][34] === 'documentos', 'cabeçalho: tipoLocal, origemVisita e citros nas colunas 31–33; as cópias andaram para 34–35', L[0].slice(27));
  const a = L.find(r => r[0] === 'lev-a'), b = L.find(r => r[0] === 'lev-b');
  ok(String(a[27]) === '1' && a[28] === '["doc-1"]' && a[33] === '1', 'valor que só existia na cópia foi para a coluna oficial (e a cópia continua lá)', a.slice(27));
  ok(String(b[27]) === '0', 'coluna oficial já preenchida não é sobrescrita pela cópia', b.slice(27));
  const d2 = await post({ action: 'sync', key: 'segredo', since: 0 });
  const L2 = await (await fetch(API + '/__aba?nome=Levantamentos')).json();
  ok(d2.ok && L2[0].length === L[0].length && L2[0][30] === 'tipoLocal', 'segunda sincronização normal, sem mexer de novo no cabeçalho', d2.erro || L2[0].slice(27));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
