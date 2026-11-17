// Termo de Educação Sanitária: preenche o modelo educacao-termo.html (usado pelo app de campo: docs.js abre o modelo num iframe e chama
// EducacaoDocs.montar). Sem dependências além de documento-base.js. Campos [data-c="nome"] recebem o texto do registro; [data-opcoes="medidas|publicos|programas"]
// recebem as caixas de marcar (lista fixa + "Outro: texto"), como nos outros modelos do e-GDV.
const EducacaoDocs = (() => {
  const lerJSON = (v, pad) => { if (Array.isArray(v)) return v; try { const r = JSON.parse(v); return Array.isArray(r) ? r : pad; } catch (e) { return pad; } };
  const dataBR = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || ''); };
  const NIVEIS = [[], ['compacta', 'c1'], ['compacta', 'c2'], ['compacta', 'c3'], ['compacta', 'c4'], ['compacta', 'c5']];
  const MEDIDAS = ['Abordagem', 'Palestra', 'Oficina', 'Dia de campo', 'Distribuição de material', 'Exposição/feira', 'Reunião', 'Visita', 'Outro'];
  const PUBLICOS = ['Produtores', 'Feirantes', 'Condutores/passageiros/transportadores', 'Estudantes', 'Público em geral', 'Outro'];

  /** Valores exibidos no modelo. programasLista = as opções de programas/pragas (do CONFIG do app). */
  function valores(t) {
    const c = Number(t.cancelado) === 1;
    return { ...t, dataTxt: dataBR(t.data), hora: String(t.hora || '').slice(0, 5), pessoas: String(Number(t.pessoas) || 0), folders: String(Number(t.folders) || 0),
      servidorIdent: [t.cargo, t.matricula && 'Mat. ' + t.matricula, t.lotacao].filter(Boolean).join(' · '),
      canceladoTxt: c ? 'CANCELADO' + (t.motivoCancel ? ': ' + t.motivoCancel : '') : '' };
  }
  /** Caixas de marcar: cada opção da lista fixa; "Outro" mostra o texto digitado. Escolha fora da lista (dado antigo) também aparece. */
  function caixas(doc, alvo, lista, marcados, outro) {
    alvo.textContent = '';
    const todos = lista.concat(marcados.filter(m => !lista.includes(m)));
    todos.forEach(o => {
      const op = doc.createElement('span'), cx = doc.createElement('span');
      op.className = 'op'; cx.className = 'cx' + (marcados.includes(o) ? ' on' : '');
      op.append(cx, o);
      if (o === 'Outro') { const v = doc.createElement('span'); v.className = 'v curto'; v.textContent = marcados.includes('Outro') ? outro || '' : ''; op.append(': ', v); }
      alvo.append(op);
    });
  }
  function nivel(pg, n) {
    pg.classList.remove('compacta', 'c1', 'c2', 'c3', 'c4', 'c5'); pg.classList.add(...NIVEIS[n]);
    pg.querySelectorAll('.linhas').forEach(x => DocumentoBase.pautar(x));
  }
  /** Corpo de 11 pt; se passar do rodapé, desce de nível (até 8,5 pt). */
  function ajustar(pg) { NIVEIS.some((_, n) => (nivel(pg, n), DocumentoBase.cabe(pg))); }

  /** doc = documento do modelo; t = registro (TermosEducacao); op.programas = lista de programas/pragas do app. */
  function montar(doc, t, op) {
    op = op || {};
    const pg = doc.querySelector('.a4'), v = valores(t);
    pg.querySelectorAll('[data-c]').forEach(e => { const x = v[e.getAttribute('data-c')]; e.textContent = x == null ? '' : String(x); });
    if (Number(t.cancelado) !== 1) { const f = pg.querySelector('.cancelado-faixa'); if (f) f.remove(); }
    caixas(doc, pg.querySelector('[data-opcoes=medidas]'), MEDIDAS, t.tipoMedida ? [t.tipoMedida] : [], t.tipoMedidaOutro);
    caixas(doc, pg.querySelector('[data-opcoes=publicos]'), PUBLICOS, lerJSON(t.publicoAlvo, []), t.publicoOutro);
    caixas(doc, pg.querySelector('[data-opcoes=programas]'), (op.programas || []).concat('Outro'), lerJSON(t.programas, []), t.programaOutro);
    DocumentoBase.montar(pg, { numero: t.numeroTxt });
    ajustar(pg);
    return pg;
  }
  return { montar, valores, MEDIDAS, PUBLICOS };
})();
if (typeof window !== 'undefined') window.EducacaoDocs = EducacaoDocs;
