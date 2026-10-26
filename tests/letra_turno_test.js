const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Letra do turno pela ordem do nº: o fiscal digita o nº do Termo de Fiscalização; o 1º turno com aquele nº (mesma BVA, mesmo ano) é A,
// o 2º B, o 3º C — também quando cada turno vem de um login diferente (o servidor confere com todos e corrige). Depois de gravada, a
// letra não muda com novo envio do aparelho. Outra BVA ou outro nº recomeçam no A. Dados fictícios.
const { API } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };
const aba = async n => { const rows = await get('/__aba?nome=' + n); const cab = rows[0]; return rows.slice(1).map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]))); };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), ANO = hoje.slice(0, 4), ag = Date.now();
const T = (id, n, letra, local = 'BVA - JUNDIÁ', extra = {}) => ({ id, numeroTF: `TF-${String(n).padStart(3, '0')}-${letra}-${ANO}`, data: hoje, letra, inicio: '00:00', fim: '',
  fiscal: 'Fiscal Ficticio Teste', local, unidade: local, posto: 'Fixa', encerrado: 0, criadoEm: ag, atualizadoEm: ag, ...extra });

(async () => {
  const A = await U.fiscal('Fulano Ficticio Teste'), B = await U.fiscal('Beltrano Ficticio Teste'), C = await U.fiscal('Ciclano Ficticio Teste');
  // cada aparelho, sem saber dos outros, propõe "A" para o nº 12 do Jundiá
  let r = await post({ action: 'sync', key: A.token, since: 0, turnos: [T('lt1', 12, 'A')] }); ok(r.ok, '1º turno do nº 12 gravado', r.erro);
  r = await post({ action: 'sync', key: B.token, since: 0, turnos: [T('lt2', 12, 'A')] }); ok(r.ok, '2º turno do nº 12 (outro login) gravado', r.erro);
  r = await post({ action: 'sync', key: C.token, since: 0, turnos: [T('lt3', 12, 'A'), T('lt4', 12, 'A', 'BVA - CEASA'), T('lt5', 13, 'A')] }); ok(r.ok, '3º turno do nº 12, nº 12 na CEASA e nº 13', r.erro);
  const L = Object.fromEntries((await aba('Turnos')).filter(t => /^lt/.test(t.id)).map(t => [t.id, t]));
  ok(L.lt1.letra === 'A' && L.lt1.numeroTF === `TF-012-A-${ANO}`, '1º turno com o nº 12: A', L.lt1.numeroTF);
  ok(L.lt2.letra === 'B' && L.lt2.numeroTF === `TF-012-B-${ANO}`, '2º turno com o nº 12: B (o aparelho propôs A)', L.lt2.numeroTF);
  ok(L.lt3.letra === 'C' && L.lt3.numeroTF === `TF-012-C-${ANO}`, '3º turno com o nº 12: C', L.lt3.numeroTF);
  ok(L.lt4.letra === 'A' && L.lt5.letra === 'A', 'outra BVA ou outro nº recomeçam no A', [L.lt4.numeroTF, L.lt5.numeroTF]);
  ok(r.turnos.some(t => t.id === 'lt3' && t.numeroTF === `TF-012-C-${ANO}`), 'o aparelho recebe a letra corrigida na sincronização', r.turnos.map(t => t.numeroTF));
  // reenvio (encerramento) com a letra antiga do aparelho: a letra gravada fica
  r = await post({ action: 'sync', key: B.token, since: 0, turnos: [T('lt2', 12, 'A', 'BVA - JUNDIÁ', { encerrado: 1, fim: '12:00', atualizadoEm: ag + 5000 })] });
  const l2 = (await aba('Turnos')).find(t => t.id === 'lt2');
  ok(l2.letra === 'B' && l2.numeroTF === `TF-012-B-${ANO}` && String(l2.encerrado) === '1', 'reenvio do aparelho (encerrar) não muda a letra', l2);
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
