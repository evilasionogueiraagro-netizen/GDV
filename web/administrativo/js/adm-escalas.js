/* Portal do Administrativo — "Diárias das escalas": cada fiscal de cada escala de plantão publicada (pela coordenação de barreira e
   trânsito no app, ou editada pela gerência no painel) é uma solicitação de diárias: "Pendente de solicitação de diárias" até o
   Administrativo marcar a PCDP concluída (MEMO ou nº do processo, opcional; coluna pcdp). Desfazer volta a pendente. Quem e quando ficam na aba EscalaPcdp e no
   Histórico. Escala alterada depois da PCDP concluída e fiscal tirado da escala depois aparecem marcados para conferir.
   Filtro no navegador, sobre as escalas já carregadas: período (a escala entra se cruza o intervalo), fiscal e BVA.
   Actions admEscalas / admEscalaPcdp (escalas.gs). */
(() => {
  'use strict';
  if (typeof Adm === 'undefined') return;
  const A = Adm, esc = A.esc, F = A.fmt;
  const E = { dados: null, erro: '', filtro: 'pendentes', raiz: null, ocupado: '', f: { de: '', ate: '', fiscal: '', bva: '' } };

  async function carregar() {
    try { E.dados = await A.chamar({ action: 'admEscalas' }); E.erro = ''; } catch (e) { E.erro = e.message; }
    desenhar();
  }
  const pendentes = () => ((E.dados && E.dados.escalas) || []).reduce((n, e) => n + e.fiscais.filter(f => f.naEscala && !f.concluida).length, 0);

  function desenhar() {
    const r = E.raiz; if (!r) return;
    if (!E.dados) { r.innerHTML = E.erro ? `<p class="pn-erro" role="alert">${esc(E.erro)}</p>` : '<div class="pn-cartao"><p class="pn-sub">Carregando as escalas…</p></div>'; return; }
    const todas = E.dados.escalas, h = E.dados.hoje;
    const fl = E.f, nomes = [...new Set(todas.flatMap(e => e.fiscais.map(f => f.nome)))].sort((a, b) => a.localeCompare(b, 'pt-BR')), bvas = [...new Set(todas.map(e => e.bva))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (fl.fiscal && !nomes.includes(fl.fiscal)) fl.fiscal = '';
    if (fl.bva && !bvas.includes(fl.bva)) fl.bva = '';
    const invertido = !!(fl.de && fl.ate && fl.de > fl.ate), filtrando = !!(fl.de || fl.ate || fl.fiscal || fl.bva);
    const doFiltro = invertido ? [] : todas.filter(e => (!fl.bva || e.bva === fl.bva) && (!fl.de || e.fim >= fl.de) && (!fl.ate || e.inicio <= fl.ate))
      .map(e => fl.fiscal ? Object.assign({}, e, { fiscais: e.fiscais.filter(f => f.nome === fl.fiscal) }) : e).filter(e => e.fiscais.length);
    const vis = doFiltro.filter(e => E.filtro === 'todas' || e.fiscais.some(f => (f.naEscala && !f.concluida) || f.alterada || !f.naEscala));
    const opcoes = (lista, atual) => lista.map(v => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const nPend = pendentes(), nConf = todas.reduce((n, e) => n + e.fiscais.filter(f => f.alterada || (!f.naEscala && f.concluida)).length, 0);
    r.innerHTML = `<div class="pn-cartao adm-esc-topo"><h3 class="pn-conv-nome">Diárias das escalas de plantão</h3>
        <p class="pn-sub">As escalas publicadas pela coordenação de barreira e trânsito (ou editadas pela gerência) chegam aqui. Cada fiscal fica <b>pendente de solicitação de diárias</b> até você marcar a <b>PCDP concluída</b>.</p>
        <div class="pn-conv-sel"><label>Mostrar<select id="adm-esc-filtro"><option value="pendentes" ${E.filtro === 'pendentes' ? 'selected' : ''}>Pendentes e a conferir</option><option value="todas" ${E.filtro === 'todas' ? 'selected' : ''}>Todas (últimos 120 dias e as próximas)</option></select></label>
        <button type="button" class="pn-btn" id="adm-esc-atualizar">Atualizar</button></div></div>
      <div class="pn-cartao adm-filtro" id="adm-esc-filtros" role="group" aria-label="Filtros das escalas">
        <label class="pn-conv-campo">De<input type="date" id="adm-esc-de" value="${esc(fl.de)}"></label>
        <label class="pn-conv-campo">Até<input type="date" id="adm-esc-ate" value="${esc(fl.ate)}"></label>
        <label class="pn-conv-campo">Fiscal<select id="adm-esc-fiscal"><option value="">Todos</option>${opcoes(nomes, fl.fiscal)}</select></label>
        <label class="pn-conv-campo">Barreira<select id="adm-esc-bva"><option value="">Todas</option>${opcoes(bvas, fl.bva)}</select></label>
        <button type="button" class="pn-btn" id="adm-esc-limpar" ${filtrando ? '' : 'disabled'}>Limpar filtros</button>
        <p class="pn-sub adm-filtro-info" id="adm-esc-info" role="status">${invertido ? 'A data inicial é depois da final.' : filtrando ? `${doFiltro.length} de ${todas.length} escala(s) no filtro.` : ''}</p></div>
      ${E.erro ? `<p class="pn-erro" role="alert">${esc(E.erro)}</p>` : ''}<div id="adm-esc-kpis"></div><div id="adm-esc-lista"></div>`;
    A.kpis(r.querySelector('#adm-esc-kpis'), [
      { rotulo: 'Pendentes de solicitação', valor: nPend, detalhe: 'fiscal × escala sem PCDP concluída', status: nPend ? 'atencao' : null, id: 'adm-esc-npend' },
      { rotulo: 'Escalas publicadas', valor: todas.length, detalhe: 'últimos 120 dias e as próximas' },
      { rotulo: 'A conferir', valor: nConf, detalhe: 'escala alterada depois da PCDP', status: nConf ? 'atencao' : null }
    ]);
    const L = r.querySelector('#adm-esc-lista');
    if (!vis.length) { A.vazio(L, filtrando ? 'Nenhuma escala com esses filtros.' : E.filtro === 'pendentes' ? 'Nenhuma diária pendente. ✓' : 'Nenhuma escala publicada.'); return; }
    L.innerHTML = vis.map(e => `<div class="pn-cartao adm-esc" data-escala="${esc(e.id)}">
      <div class="adm-esc-cab"><div><h3>${esc(e.bva)} · ${F.data(e.inicio)} a ${F.data(e.fim)}</h3>
        <p class="pn-sub">${e.dias} dia(s)${e.inicio <= h && e.fim >= h ? ' · em andamento' : e.inicio > h ? ' · ainda vai começar' : ' · encerrada'} · publicada por ${esc(e.publicadaPor || '—')}${e.atualizadoPor && e.atualizadoPor !== e.publicadaPor ? ` · última alteração: ${esc(e.atualizadoPor)} em ${F.dataHora(e.atualizadoEm)}` : ''}</p></div></div>
      <div class="pn-tab"><div class="pn-tab-rolo"><table><thead><tr><th scope="col">Fiscal</th><th scope="col">Situação</th><th scope="col">MEMO ou nº do processo</th><th scope="col">Ação</th></tr></thead><tbody>
      ${e.fiscais.map(f => `<tr data-fiscal="${esc(f.usuarioId)}"><td>${esc(f.nome)}${f.semLogin ? ' <small>(sem login)</small>' : ''}${f.naEscala ? '' : ' <span class="pn-selo atencao">saiu da escala depois</span>'}</td>
        <td>${f.concluida ? `<span class="pn-selo bom">PCDP concluída</span> <small>${esc(f.por)} · ${F.dataHora(f.em)}</small>${f.alterada ? ' <span class="pn-selo atencao">escala alterada depois: confira</span>' : ''}`
          : '<span class="pn-selo atencao">Pendente de solicitação de diárias</span>'}</td>
        <td>${f.concluida ? esc(f.pcdp || '—') : `<input class="adm-esc-pcdp" maxlength="60" placeholder="ex.: MEMO 123/2026" aria-label="MEMO ou nº do processo de ${esc(f.nome)}">`}</td>
        <td>${f.concluida ? `<button type="button" class="pn-btn pn-btn-mini" data-pcdp="desfazer">Desfazer</button>`
          : `<button type="button" class="pn-btn pn-btn-prim pn-btn-mini" data-pcdp="concluir" ${f.naEscala ? '' : 'disabled'}>Marcar PCDP concluída</button>`}</td></tr>`).join('')}
      </tbody></table></div></div></div>`).join('');
  }

  async function marcar(b) {
    const tr = b.closest('tr'), card = b.closest('[data-escala]'), concluida = b.dataset.pcdp === 'concluir';
    const e = E.dados.escalas.find(x => x.id === card.dataset.escala), f = e && e.fiscais.find(x => x.usuarioId === tr.dataset.fiscal); if (!f) return;
    if (!concluida && !confirm(`Desfazer a PCDP concluída de ${f.nome} (${e.bva}, ${F.data(e.inicio)} a ${F.data(e.fim)})? Volta a pendente.`)) return;
    const inp = tr.querySelector('.adm-esc-pcdp'), pcdp = inp ? inp.value.trim() : '';
    b.disabled = true;
    try {
      const r = await A.chamar({ action: 'admEscalaPcdp', escalaId: e.id, usuarioId: f.usuarioId, concluida, pcdp });
      Object.assign(f, { concluida: r.situacao === 'concluida', pcdp: r.pcdp, em: r.em, por: r.por, alterada: false });
      if (!f.concluida && !f.naEscala) e.fiscais = e.fiscais.filter(x => x !== f);
      desenhar();
    } catch (err) { b.disabled = false; alert(err.message || 'Não foi possível gravar.'); }
  }

  function montar() {
    const r = A.el('div', 'adm-esc-raiz'); r.id = 'adm-esc';
    r.addEventListener('click', ev => {
      const b = ev.target.closest('[data-pcdp]'); if (b) return marcar(b);
      if (ev.target.closest('#adm-esc-limpar')) { E.f = { de: '', ate: '', fiscal: '', bva: '' }; return desenhar(); }
      if (ev.target.closest('#adm-esc-atualizar')) { E.dados = null; desenhar(); carregar(); }
    });
    const chave = { 'adm-esc-de': 'de', 'adm-esc-ate': 'ate', 'adm-esc-fiscal': 'fiscal', 'adm-esc-bva': 'bva' };
    r.addEventListener('change', ev => {
      if (ev.target.id === 'adm-esc-filtro') { E.filtro = ev.target.value; desenhar(); }
      else if (chave[ev.target.id]) { E.f[chave[ev.target.id]] = ev.target.value; desenhar(); }
    });
    return r;
  }
  A.registrarAba({ id: 'escalas', titulo: 'Diárias das escalas', render: c => {
    if (!E.raiz) E.raiz = montar();
    c.appendChild(E.raiz);
    desenhar(); carregar();
  } });
  window.AdmEscalas = { estado: () => ({ dados: E.dados, filtro: E.filtro, filtros: E.f, pendentes: pendentes() }) };
})();
