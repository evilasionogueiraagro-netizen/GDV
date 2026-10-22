const amb = require('./lib/amb');
// Reincidência do TF de Barreira só por CPF/CNPJ válido e placa válida: o 000.000.000-00 do talão ("não identificado") e placas fora do
// padrão ("XXX") não ligam TFs de pessoas/veículos diferentes. O painel recalcula a reincidência de todos os TFs (inclusive os antigos,
// gravados com a regra anterior); a consulta (tfConsultar) e o índice offline (tfIndiceReincidencia) seguem a mesma regra. Dados fictícios.
const { API } = amb;
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 500))); if (!c) falhas++; };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), ANO = Number(hoje.slice(0, 4));
const ag = Date.now();
// TFs gravados com a regra antiga: todos marcados reincidente = 1 (como os do print do painel)
const TF = (n, doc, placa, proc, hora) => ({ id: 'r' + n, barreira: 'BVA-CEASA', ano: ANO, numero: n, numeroTxt: `${String(n).padStart(4, '0')}/${ANO} - BVA - CEASA`, data: hoje, hora,
  fiscal: 'Fulano Ficticio Teste', local: 'BVA - CEASA', placa, doc, nome: doc === '00000000000' ? 'NÃO IDENTIFICADO' : 'Ciclano Ficticio Teste', procedimento: proc,
  produtos: '[]', reincidente: 1, tfsAnteriores: 9, cancelado: 0, criadoEm: ag + n, atualizadoEm: ag + n, emitidoEm: ag + n });

(async () => {
  console.log('1) painel: reincidência recalculada');
  const tfs = [TF(1, '00000000000', 'ABC1D11', 'apreensao', '08:00'), TF(2, '00000000000', 'ABC1D12', 'apreensao', '09:00'), TF(3, '00000000000', 'XXX', 'apreensao', '10:00'),
    TF(4, '00000000000', 'XXX', 'apreensao', '11:00'),                                  // mesmo "000" e mesma placa inválida: NÃO é reincidente
    TF(5, '52998224725', 'ABC1D20', 'apreensao', '12:00'), TF(6, '52998224725', 'ABC1D21', 'liberacao', '13:00'),   // mesmo CPF válido: reincidente
    TF(7, '00000000000', 'ABC1D11', 'liberacao', '14:00'),                              // mesma placa válida do TF 1 (apreensão): reincidente
    TF(8, '11111111111', 'QQQ1A11', 'apreensao', '15:00'), TF(9, '11111111111', 'QQQ1A12', 'apreensao', '16:00')];  // CPF com dígitos iguais: não liga
  let r = await post({ action: 'sync', key: 'segredo', since: 0, tfs });
  ok(r.ok, 'TFs gravados', r.erro);
  const d = await post({ action: 'painelDados', key: 'segredo', de: hoje, ate: hoje });
  const R = Object.fromEntries((d.tfs || []).map(t => [t.numero, t]));
  ok([1, 2, 3, 4, 8, 9].every(n => R[n].reincidente === 0 && R[n].tfsAnteriores === 0), 'CPF 000.000.000-00, CPF com dígitos iguais e placa "XXX" não ligam TFs (nem os gravados antes como reincidentes)',
    [1, 2, 3, 4, 8, 9].map(n => [n, R[n].reincidente, R[n].tfsAnteriores]));
  ok(R[5].reincidente === 0 && R[6].reincidente === 1 && R[6].tfsAnteriores === 1, 'mesmo CPF válido: o 2º TF é reincidente (1 anterior com apreensão)', [R[5], R[6]].map(t => [t.reincidente, t.tfsAnteriores]));
  ok(R[7].reincidente === 1 && R[7].tfsAnteriores === 1, 'mesma placa válida (com o CPF 000): reincidente pela placa', [R[7].reincidente, R[7].tfsAnteriores]);

  console.log('2) consulta no app e índice offline');
  let c = await post({ action: 'tfConsultar', key: 'segredo', doc: '000.000.000-00', placa: 'XXX1111' });
  ok(c.ok && c.historicoDoc === null, 'tfConsultar com 000.000.000-00: sem histórico do documento', c.historicoDoc);
  c = await post({ action: 'tfConsultar', key: 'segredo', doc: '529.982.247-25', placa: 'ABC1D11' });
  ok(c.ok && c.historicoDoc.total === 2 && c.historicoDoc.reincidente === true && c.historicoPlaca.total === 2, 'CPF válido e placa válida: histórico normal', [c.historicoDoc, c.historicoPlaca].map(h => h && h.total));
  const ix = await post({ action: 'tfIndiceReincidencia', key: 'segredo' });
  const crypto = require('crypto'), h = t => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16), hs = new Set((ix.itens || []).map(i => i.h));
  ok(ix.ok && !hs.has(h('doc:00000000000')) && !hs.has(h('doc:11111111111')) && !hs.has(h('placa:XXX')) && hs.has(h('doc:52998224725')) && hs.has(h('placa:ABC1D11')),
    'índice offline: sem as chaves do documento padrão/inválido e da placa inválida');
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
