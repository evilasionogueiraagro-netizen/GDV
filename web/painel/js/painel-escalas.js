/* Aba Escalas: escalas de plantão por BVA (montadas pela coordenação de barreira e trânsito no app de campo; a gerência também
   edita aqui). Mostra a anterior, a atual e a próxima de cada BVA, e cruza a escala de hoje com os turnos em andamento: quem está
   em turno, quem ainda não abriu e quem abriu em outra BVA ("fora da escala"). Actions painelEscalas / painelEscalaSalvar /
   painelEscalaExcluir (escalas.gs). */
(function () {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, esc = P.esc;
  const RECARREGAR_MS = 60 * 1000;
  const E = { dados: null, lidoEm: 0, carregando: false, erro: '', avisos: [] };
  const dBR = d => String(d || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
  const nl = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const somar = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const dias = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  const sobrepoe = (a, b) => CONFIG.sobrepoeEscala(a, b);                 // encostar só no dia da troca não conta
  const nomeF = f => f.nome + (f.id ? '' : ' (sem login)');
  const bvas = () => { const l = ((typeof CONFIG !== 'undefined' && CONFIG.bvas) || []).map(b => b.nome);
    ((E.dados && E.dados.escalas) || []).forEach(e => { if (!l.some(x => nl(x) === nl(e.bva))) l.push(e.bva); }); return l; };
  const hoje = () => (E.dados && E.dados.hoje) || P.diaManaus(Date.now());

  async function carregar() {
    if (E.carregando) return; E.carregando = true;
    try { E.dados = await P.chamar({ action: 'painelEscalas' }); E.erro = ''; E.lidoEm = Date.now(); }
    catch (e) { E.erro = e.message; }
    finally { E.carregando = false; if (P.logado && P.abaAtual && P.abaAtual() === 'escalas') P.redesenhar(); }
  }

  /** Hoje: escalados × turnos em andamento (pelo nome do fiscal no turno, colegas incluídos). */
  function cruzar(D) {
    const h = hoje(), pub = E.dados.escalas.filter(e => e.situacao === 'publicada' && e.inicio <= h && e.fim >= h);
    const turnos = ((D && (D.semFiltro || D).turnosTodos) || []).filter(t => t.emAndamento);
    const emTurno = {};                                                 // nome → BVA/local do turno aberto
    turnos.forEach(t => (t.fiscais && t.fiscais.length ? t.fiscais : [t.fiscal]).forEach(n => { if (n) emTurno[nl(n)] = t.local || ''; }));
    const escalaDe = {};                                                // nome → BVA da escala de hoje
    pub.forEach(e => e.fiscais.forEach(f => { escalaDe[nl(f.nome)] = e.bva; }));
    const porBva = bvas().map(b => {
      const e = pub.find(x => nl(x.bva) === nl(b)), nomes = e ? e.fiscais.map(f => f.nome) : [];
      return { bva: b, escala: e, em: nomes.filter(n => nl(emTurno[nl(n)]) === nl(b)), sem: nomes.filter(n => !(nl(n) in emTurno)) };
    });
    const fora = [];
    turnos.forEach(t => (t.fiscais && t.fiscais.length ? t.fiscais : [t.fiscal]).forEach(n => {
      const e = escalaDe[nl(n)]; if (n && e && nl(e) !== nl(t.local)) fora.push({ nome: n, local: t.local, escalado: e, inicio: t.inicio });
    }));
    return { pub, porBva, fora, escalados: Object.keys(escalaDe).length, emTurnoEscalados: Object.keys(escalaDe).filter(k => k in emTurno).length };
  }

  const celula = (e, cls) => !e ? `<td class="${cls || ''}"><span class="pn-sub">—</span></td>`
    : `<td class="${cls || ''}"><button type="button" class="pn-esc-cel" data-esc="${esc(e.id)}" ${P.pode('gerencia') ? '' : 'disabled'}>
        <b>${dBR(e.inicio).slice(0, 5)} a ${dBR(e.fim)}</b> <span class="pn-selo ${e.situacao === 'publicada' ? 'bom' : 'atencao'}">${e.situacao === 'publicada' ? 'publicada' : 'rascunho'}</span>
        <span>${e.fiscais.length ? esc(e.fiscais.map(nomeF).join(', ')) : '<i>sem fiscais</i>'}</span></button></td>`;

  function render(c, D) {
    if (!E.dados || Date.now() - E.lidoEm > RECARREGAR_MS) { if (!E.carregando) carregar(); }
    if (!E.dados) { c.appendChild(P.el('div', 'pn-cartao', E.erro ? `<p class="pn-erro" role="alert">${esc(E.erro)}</p>` : '<p class="pn-sub">Carregando as escalas…</p>')); return; }
    const h = hoje(), X = cruzar(D), semEscala = X.porBva.filter(b => !b.escala).map(b => b.bva);
    const topo = P.el('div', 'pn-cartao pn-esc-topo');
    topo.innerHTML = `<div><h2 class="pn-conv-nome">Escalas de plantão</h2>
        <p class="pn-sub">Montadas pela coordenação de barreira e trânsito no app de campo${P.pode('gerencia') ? '; a gerência também edita aqui (toque numa escala)' : ''}. Só a publicada vale para os fiscais.</p></div>
      ${P.pode('gerencia') ? '<div class="pn-esc-botoes"><button type="button" class="pn-btn" id="pn-esc-gerar">Gerar períodos</button><button type="button" class="pn-btn pn-btn-prim" id="pn-esc-nova">Nova escala</button></div>' : ''}`;
    c.appendChild(topo);
    if (E.avisos.length) c.appendChild(P.el('div', 'pn-cartao pn-esc-avisos', `<b>Atenção</b><ul>${E.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`));
    P.kpis(c, [
      { rotulo: 'Escalados hoje', valor: X.escalados, detalhe: dBR(h) },
      { rotulo: 'BVAs com escala hoje', valor: `${X.porBva.length - semEscala.length} de ${X.porBva.length}`, detalhe: semEscala.length ? 'sem escala: ' + semEscala.join(', ') : 'todas cobertas', status: semEscala.length ? 'atencao' : null },
      { rotulo: 'Escalados em turno agora', valor: X.emTurnoEscalados, detalhe: `de ${X.escalados} escalado(s) hoje` },
      { rotulo: 'Fora da escala', valor: X.fora.length, detalhe: 'turno aberto em outra BVA', status: X.fora.length ? 'atencao' : null }
    ]);
    // por BVA: anterior, atual e próxima (os períodos variam por BVA)
    const s = P.secao(c, 'Escala por BVA', 'Anterior, atual e próxima de cada BVA. Rascunho ainda não aparece para os fiscais.');
    const linhas = bvas().map(b => {
      const es = E.dados.escalas.filter(e => nl(e.bva) === nl(b)).sort((x, y) => x.inicio.localeCompare(y.inicio));
      const atual = es.find(e => e.inicio <= h && e.fim >= h), ant = es.filter(e => e.fim < h).pop(), prox = es.find(e => e.inicio > h);
      return `<tr><th scope="row">${esc(b)}</th>${celula(ant, 'pn-esc-ant')}${celula(atual, 'pn-esc-atual')}${celula(prox)}</tr>`;
    }).join('');
    const k = P.el('div', 'pn-cartao');
    k.innerHTML = `<div class="pn-tab"><div class="pn-tab-rolo"><table class="pn-esc-tab" id="pn-esc-tab"><thead><tr><th scope="col">BVA</th><th scope="col">Anterior</th><th scope="col">Atual</th><th scope="col">Próxima</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
    s.appendChild(k);
    // hoje: escalados × turnos
    const s2 = P.secao(c, 'Hoje: escalados × quem abriu turno', 'Pelo nome do fiscal no turno em andamento (colegas do turno compartilhado incluídos).');
    const g = P.el('div', 'pn-esc-hoje'); g.id = 'pn-esc-hoje';
    g.innerHTML = X.porBva.map(b => `<div class="pn-cartao"><h3>${esc(b.bva)}</h3>${!b.escala ? '<p class="pn-sub">Sem escala publicada hoje.</p>'
        : `<p><b class="pn-esc-em">Em turno</b> ${b.em.length ? esc(b.em.join(', ')) : '—'}</p><p><b class="pn-esc-sem">Sem turno</b> ${b.sem.length ? esc(b.sem.join(', ')) : '—'}</p>`}</div>`).join('') +
      `<div class="pn-cartao${X.fora.length ? ' pn-esc-fora' : ''}"><h3>Fora da escala</h3>${X.fora.length ? X.fora.map(f => `<p><b>${esc(f.nome)}</b> abriu turno na <b>${esc(f.local)}</b>${f.inicio ? ' às ' + esc(f.inicio) : ''}; escalado na ${esc(f.escalado)}.</p>`).join('') : '<p class="pn-sub">Ninguém.</p>'}</div>`;
    s2.appendChild(g);
    E.avisos = [];
    c.onclick = ev => {
      if (ev.target.closest('#pn-esc-nova')) return dialogo(null);
      if (ev.target.closest('#pn-esc-gerar')) return dialogoGerar();
      const b = ev.target.closest('[data-esc]'); if (b && P.pode('gerencia')) dialogo(E.dados.escalas.find(e => e.id === b.dataset.esc));
    };
  }

  /** Gerência: criar/editar uma escala (BVA, período, fiscais), publicar ou excluir. */
  function dialogo(e) {
    const velho = document.getElementById('pn-esc-dlg'); if (velho) velho.remove();
    const D = E.dados, b0 = e ? e.bva : bvas()[0];
    // como no app: início depois da última da BVA; fim pelo regime da BVA (ajustável: a mesma duração da última)
    const sugerir = b => { const ult = D.escalas.filter(x => nl(x.bva) === nl(b)).sort((x, y) => x.fim.localeCompare(y.fim)).pop();
      const ini = ult && ult.fim >= hoje() ? CONFIG.proximoInicioEscala(b, ult) : hoje();
      return { inicio: ini, fim: CONFIG.fimEscala(b, ini) || (ult ? somar(ini, dias(ult.inicio, ult.fim)) : ini) }; };
    const textoRegime = b => CONFIG.regimeEscala(b).regime === 'ajustavel' ? 'Período ajustável: escolha o fim.' : `${CONFIG.textoRegimeEscala(b)}: o fim vem sugerido pelo início.`;
    const p0 = e || sugerir(b0), marc = new Set(e ? e.fiscais.map(f => f.id) : []);
    const dlg = P.el('dialog', 'pn-dlg pn-esc-dlg'); dlg.id = 'pn-esc-dlg';
    dlg.innerHTML = `<form method="dialog" class="pn-dlg-form" novalidate><h3>${e ? 'Editar escala' : 'Nova escala'}</h3>
      <label class="pn-conv-campo">BVA<select id="pn-esc-bva" ${e ? 'disabled' : ''}>${bvas().map(b => `<option ${b === b0 ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
      <div class="pn-conv-cfg-grade"><label class="pn-conv-campo">Início<input type="date" id="pn-esc-ini" value="${esc(p0.inicio)}"></label><label class="pn-conv-campo">Fim<input type="date" id="pn-esc-fim" value="${esc(p0.fim)}"></label></div>
      <p class="pn-sub" id="pn-esc-regime">${esc(textoRegime(b0))}</p>
      <div class="pn-conv-cfg-grade"><label class="pn-conv-campo">Fiscal que ainda não tem login<input id="pn-esc-semnome" maxlength="80" autocomplete="off"></label><button type="button" class="pn-btn pn-btn-mini" id="pn-esc-semadd">Incluir sem login</button></div>
      <div class="pn-esc-sem" id="pn-esc-semlista">${(e ? e.fiscais.filter(f => !f.id) : []).map(f => chipSem(f.nome)).join('')}</div>
      <div class="pn-esc-fiscais" id="pn-esc-fiscais">${D.fiscais.map(f => `<label class="pn-rg-chk"><input type="checkbox" data-fiscal="${esc(f.id)}" ${marc.has(f.id) ? 'checked' : ''}> ${esc(f.nome)} <small data-st="${esc(f.id)}"></small></label>`).join('')}</div>
      ${e ? `<p class="pn-sub">Última alteração: ${esc(e.atualizadoPor || '—')}${e.publicadaPor ? ` · publicada por ${esc(e.publicadaPor)}` : ''}</p>` : ''}
      <p class="pn-dlg-erro" id="pn-esc-erro" role="alert"></p>
      <div class="pn-dlg-botoes">${e ? '<button type="button" class="pn-btn" id="pn-esc-excluir">Excluir</button>' : ''}<button type="button" class="pn-btn" id="pn-esc-cancelar">Cancelar</button>
        <button type="button" class="pn-btn" id="pn-esc-rascunho">Salvar rascunho</button><button type="button" class="pn-btn pn-btn-prim" id="pn-esc-publicar">Publicar</button></div></form>`;
    document.body.appendChild(dlg);
    const q = s => dlg.querySelector(s), bva = () => e ? e.bva : q('#pn-esc-bva').value;
    const situar = () => {
      const p = { inicio: q('#pn-esc-ini').value, fim: q('#pn-esc-fim').value };
      const outras = p.inicio && p.fim ? D.escalas.filter(x => (!e || x.id !== e.id) && sobrepoe(x, p)) : [];
      D.fiscais.forEach(f => { const em = outras.filter(x => x.fiscais.some(y => y.id === f.id)), st = q(`[data-st="${f.id}"]`);
        if (st) { st.textContent = em.length ? '· também na ' + em.map(x => x.bva).join(', ') : ''; st.className = em.length ? 'pn-esc-ocupado' : ''; } });
    };
    if (!e) q('#pn-esc-bva').onchange = () => { const s = sugerir(q('#pn-esc-bva').value); q('#pn-esc-ini').value = s.inicio; q('#pn-esc-fim').value = s.fim; q('#pn-esc-regime').textContent = textoRegime(q('#pn-esc-bva').value); situar(); };
    q('#pn-esc-ini').onchange = () => { const f = CONFIG.fimEscala(bva(), q('#pn-esc-ini').value); if (f) q('#pn-esc-fim').value = f; situar(); };
    q('#pn-esc-fim').onchange = situar; situar();
    q('#pn-esc-semadd').onclick = () => { const n = q('#pn-esc-semnome').value.trim().replace(/\s+/g, ' '); if (n.length < 3) return;
      q('#pn-esc-semlista').insertAdjacentHTML('beforeend', chipSem(n)); q('#pn-esc-semnome').value = ''; };
    q('#pn-esc-semlista').onclick = ev => { const b = ev.target.closest('[data-semrm]'); if (b) b.closest('[data-sem]').remove(); };
    q('#pn-esc-cancelar').onclick = () => dlg.close();
    dlg.addEventListener('close', () => dlg.remove());
    const gravar = async situacao => {
      const fiscais = [...dlg.querySelectorAll('#pn-esc-fiscais input:checked')].map(i => i.dataset.fiscal)
        .concat([...dlg.querySelectorAll('#pn-esc-semlista [data-sem]')].map(x => ({ nome: x.dataset.sem })));
      dlg.querySelectorAll('button').forEach(b => { b.disabled = true; });
      try {
        const r = await P.chamar({ action: 'painelEscalaSalvar', escala: { id: e ? e.id : '', bva: bva(), inicio: q('#pn-esc-ini').value, fim: q('#pn-esc-fim').value, fiscais, situacao } });
        E.avisos = r.avisos || []; dlg.close(); P.toast(situacao === 'publicada' ? 'Escala publicada.' : 'Rascunho salvo.'); E.lidoEm = 0; await carregar();
      } catch (err) { q('#pn-esc-erro').textContent = err.message; dlg.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
    };
    q('#pn-esc-rascunho').onclick = () => gravar('rascunho');
    q('#pn-esc-publicar').onclick = () => gravar('publicada');
    if (e) q('#pn-esc-excluir').onclick = async () => {
      if (!confirm(`Excluir a escala da ${e.bva} (${dBR(e.inicio)} a ${dBR(e.fim)})? Fica registrada no histórico.`)) return;
      try { await P.chamar({ action: 'painelEscalaExcluir', id: e.id }); dlg.close(); P.toast('Escala excluída.'); E.lidoEm = 0; await carregar(); }
      catch (err) { q('#pn-esc-erro').textContent = err.message; }
    };
    dlg.showModal();
  }

  const chipSem = n => `<span class="pn-esc-chip" data-sem="${esc(n)}">${esc(n)} <small>sem login</small> <button type="button" class="pn-btn pn-btn-mini" data-semrm aria-label="Tirar ${esc(n)}">×</button></span>`;

  /** Gerência: gerar os períodos de uma BVA pelo regime dela, até a data final (padrão: fim do convênio), como rascunhos sem fiscais. */
  function dialogoGerar() {
    const velho = document.getElementById('pn-esc-ger'); if (velho) velho.remove();
    const D = E.dados, fixos = bvas().filter(b => CONFIG.regimeEscala(b).regime !== 'ajustavel');
    if (!fixos.length) return P.toast('Nenhuma BVA com regime fixo (cadastro de BVAs).');
    const dlg = P.el('dialog', 'pn-dlg'); dlg.id = 'pn-esc-ger';
    dlg.innerHTML = `<form method="dialog" class="pn-dlg-form" novalidate><h3>Gerar períodos</h3>
      <p class="pn-sub">Pelo regime da BVA, como rascunhos sem fiscais; os que já têm escala são pulados.</p>
      <label class="pn-conv-campo">BVA<select id="pn-ger-bva">${fixos.map(b => `<option>${esc(b)}</option>`).join('')}</select></label>
      <div class="pn-conv-cfg-grade"><label class="pn-conv-campo">Primeiro começa em<input type="date" id="pn-ger-ini"></label><label class="pn-conv-campo">Até<input type="date" id="pn-ger-ate"></label></div>
      <p class="pn-sub" id="pn-ger-previa"></p><p class="pn-dlg-erro" id="pn-ger-erro" role="alert"></p>
      <div class="pn-dlg-botoes"><button type="button" class="pn-btn" id="pn-ger-cancelar">Cancelar</button><button type="button" class="pn-btn pn-btn-prim" id="pn-ger-ok">Gerar</button></div></form>`;
    document.body.appendChild(dlg);
    const q = s => dlg.querySelector(s); let lista = [];
    const inicial = () => { const b = q('#pn-ger-bva').value, ult = D.escalas.filter(x => nl(x.bva) === nl(b)).sort((x, y) => x.fim.localeCompare(y.fim)).pop();
      q('#pn-ger-ini').value = ult ? CONFIG.proximoInicioEscala(b, ult) : hoje(); q('#pn-ger-ate').value = D.fimConvenio && D.fimConvenio > q('#pn-ger-ini').value ? D.fimConvenio : somar(q('#pn-ger-ini').value, 90); previa(); };
    const previa = () => { const b = q('#pn-ger-bva').value, es = D.escalas.filter(x => nl(x.bva) === nl(b));
      lista = CONFIG.gerarPeriodosEscala(b, q('#pn-ger-ini').value, q('#pn-ger-ate').value).filter(p => !es.some(x => sobrepoe(x, p)));
      q('#pn-ger-previa').textContent = lista.length ? `${lista.length} período(s): ${dBR(lista[0].inicio)} a ${dBR(lista[lista.length - 1].fim)} (${CONFIG.textoRegimeEscala(b)}).` : 'Nenhum período novo nesse intervalo.';
      q('#pn-ger-ok').disabled = !lista.length; };
    q('#pn-ger-bva').onchange = inicial; q('#pn-ger-ini').onchange = q('#pn-ger-ate').onchange = previa; inicial();
    q('#pn-ger-cancelar').onclick = () => dlg.close(); dlg.addEventListener('close', () => dlg.remove());
    q('#pn-ger-ok').onclick = async () => {
      q('#pn-ger-ok').disabled = true;
      try { const r = await P.chamar({ action: 'painelEscalaGerar', bva: q('#pn-ger-bva').value, periodos: lista });
        dlg.close(); P.toast(`${r.criados} período(s) criado(s) como rascunho.`); E.lidoEm = 0; await carregar(); }
      catch (err) { q('#pn-ger-erro').textContent = err.message; q('#pn-ger-ok').disabled = false; }
    };
    dlg.showModal();
  }

  P.aoSair(() => { Object.assign(E, { dados: null, lidoEm: 0, erro: '', avisos: [] }); const d = document.getElementById('pn-esc-dlg'); if (d) d.remove(); });
  P.registrarAba({ id: 'escalas', titulo: 'Escalas', render, semFiltros: true });
})();
