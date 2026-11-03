/* ---------- Visita do PCE por cultura e Termo por programa ----------
 * O app manda, junto com o levantamento, culturasAvaliadas (uma por cultura) e resultados (cultura × praga), com id fixo
 * "levantamentoId|culturaId" e "levantamentoId|culturaId|pragaId": reeditar substitui, cultura ou praga removida vem com excluido = 1.
 * Só entram linhas de levantamento gravado no mesmo envio (sem linha órfã); o levantamento segue gravando "pragas" (PDF, painel, relatórios).
 * Termo de Fiscalização da visita: um por programa da praga (como o papel; Citros junta HLB, cancro, ácaro...), chave levantamentoId +
 * programaVisita; um segundo Termo do mesmo programa na mesma visita volta recusado.
 */
const MAX_CULTURAS_TERMO_PCE_ = 40;

/** Grava levantamentos, culturas avaliadas e resultados do lote (dentro do lock do sincronizar_). */
function sincronizarVisitasPce_(T, agora, usuario, alheios, recusados) {
  alheios('levantamentos', gravar_('Levantamentos', T.levantamentos, agora, usuario));
  const ok = {};
  gravados_(T.levantamentos, recusados.levantamentos).forEach(function (l) { if (l && l.id) ok[String(l.id)] = true; });
  [['culturasAvaliadas', 'CulturasAvaliadas'], ['resultados', 'Resultados']].forEach(function (x) {
    const regs = T[x[0]], bons = [], fora = [];
    regs.forEach(function (r) {
      if (!r || !r.id) return;
      const lev = String(r.levantamentoId || ''), certo = ok[lev] && String(r.id).indexOf(lev + '|') === 0
        && (x[0] !== 'resultados' || Number(r.excluido) === 1 || RESULTADOS_PCE.indexOf(r.resultado) >= 0);
      (certo ? bons : fora).push(r);
    });
    alheios(x[0], fora.map(function (r) { return r.id; }));
    alheios(x[0], gravar_(x[1], bons, agora, usuario));
  });
}

/** Termo do PCE: programa e culturas da visita só com levantamento; culturas = lista de nomes (JSON). */
function normalizarTermoPceVisita_(r) {
  if (!String(r.levantamentoId || '').trim()) { r.levantamentoId = ''; r.programaVisita = ''; r.culturas = ''; return; }
  r.levantamentoId = String(r.levantamentoId).slice(0, 64);
  r.programaVisita = String(r.programaVisita || '').trim().slice(0, 60);
  let c = r.culturas;
  if (typeof c === 'string') { try { c = JSON.parse(c || '[]'); } catch (e) { c = []; } }
  r.culturas = Array.isArray(c) ? JSON.stringify(c.map(function (x) { return textoAutor_(String(x || '').trim()).slice(0, 60); }).filter(Boolean).slice(0, MAX_CULTURAS_TERMO_PCE_)) : '';
}

/** Um Termo por programa da visita: o segundo (outro id, mesmo levantamentoId + programaVisita, não excluído) volta recusado. */
function filtrarTermosPceUnicos_(regs, usuario, alheios) {
  const chave = function (t) { return t.levantamentoId && t.programaVisita ? t.levantamentoId + '|' + t.programaVisita : ''; };
  const dono = {};
  lerLeitura_('TermosPCE').forEach(function (t) { const k = chave(t); if (k && Number(t.excluido) !== 1) dono[k] = String(t.id); });
  const repetidos = [];
  const fica = regs.filter(function (r) {
    const k = r && chave(r); if (!k || Number(r.excluido) === 1) return true;
    if (dono[k] && dono[k] !== String(r.id)) { repetidos.push(r.id); return false; }
    dono[k] = String(r.id); return true;
  });
  alheios('termosPce', repetidos);
  return fica;
}
