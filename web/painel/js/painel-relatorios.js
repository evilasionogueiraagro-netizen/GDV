/* Painel gerencial do GDV — aba "Relatórios" (só administrador; não aparece no Modo TV; não usa o período nem os filtros do painel).
   Relatório Técnico da Gerência de Defesa Vegetal: parcial MENSAL e consolidado ANUAL, no modelo do relatório técnico anual da GDV.
   Apuração no servidor (painelRelGdvApuracao, só agregados + anexo mascarado; o ano inteiro é apurado mesmo que o painel tenha carregado
   só 30 dias), lançamentos manuais por mês e textos editáveis (painelRelGdv / painelRelGdvSalvar). Cálculo e conteúdo do relatório:
   ../documentos/relgdv-docs.js (RelGdvDocs); Word: js/docx.js (DocxMin); PDF: ../documentos/relgdv-relatorio.html + ../js/pdf.js. */
(() => {
  'use strict';
  if (typeof Painel === 'undefined' || typeof RelGdvDocs === 'undefined') return;
  const P = Painel, esc = P.esc, RD = RelGdvDocs, F = RD.fmt;
  const LS = 'gdv.painel.relgdv';
  const lembrado = (() => { try { return JSON.parse(P.ls.get(LS) || '{}') || {}; } catch (e) { return {}; } })();
  const hoje = () => P.hoje();
  const pad2 = n => String(n).padStart(2, '0');
  const anoHoje = () => Number(hoje().slice(0, 4)), mesHoje = () => Number(hoje().slice(5, 7));
  const E = { raiz: null, tipo: lembrado.tipo === 'anual' ? 'anual' : 'mensal', ano: Number(lembrado.ano) || anoHoje(), mes: Number(lembrado.mes) || mesHoje(),
              dados: {}, ap: {}, R: null, carregando: false, erro: '', textos: null, txtInfo: null, chaveTxt: '', L: null, listas: null, anoEstado: 0,
              munExtra: {}, msg: { t: '', cls: '' }, gerando: false };
  const cfg = () => (typeof CONFIG !== 'undefined' && CONFIG.RELGDV) || { grupos: [], assinaturas: [], local: 'Manaus/AM' };
  const numSimples = v => { const s = String(v == null ? '' : v).trim(); if (!s) return null; const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(n) ? n : NaN; };
  const periodo = () => {
    const a = E.ano, m = pad2(E.mes);
    return E.tipo === 'mensal' ? { de: `${a}-${m}-01`, ate: RD.fimDoMes(a, E.mes), deAno: `${a}-01-01` } : { de: `${a}-01-01`, ate: `${a}-12-31`, deAno: `${a}-01-01` };
  };
  const gruposReq = () => (cfg().grupos || []).map(g => ({ id: g.id, colunas: (g.colunas || []).map(c => ({ rotulo: c.rotulo, pragas: c.pragas })) }));

  /* ---------------- carga ---------------- */
  async function apurar(de, ate, forcar) {
    const k = `${de}|${ate}`;
    if (!E.ap[k] || forcar) E.ap[k] = await P.chamar({ action: 'painelRelGdvApuracao', de, ate, grupos: gruposReq() });
    return E.ap[k];
  }
  async function carregar(forcar) {
    if (E.carregando) return;
    E.carregando = true; E.erro = ''; E.R = null;
    try {
      desenhar();
      if (!E.dados[E.ano] || forcar) E.dados[E.ano] = await P.chamar({ action: 'painelRelGdv', ano: E.ano });
      const p = periodo();
      await apurar(p.de, p.ate, forcar);
      if (E.tipo === 'mensal') await apurar(p.deAno, p.ate, forcar);
      if (E.anoEstado !== E.ano || forcar) iniciarLancamentos();
      iniciarTextos(forcar);
    } catch (e) { E.erro = e.message; }
    finally { E.carregando = false; }
    recalcular(); desenhar();
  }
  /** Lançamentos do ano no estado da tela: L[MM][chave] = texto digitado; listas[chave][MM] = [linhas]. */
  function iniciarLancamentos() {
    E.L = {}; E.listas = {}; E.anoEstado = E.ano; E.munExtra = {};
    (E.dados[E.ano].lancamentos || []).forEach(l => {
      if (RD.TABS[l.chave]) { (E.listas[l.chave] = E.listas[l.chave] || {})[l.mes] = (l.lista || []).map(x => ({ ...x })); return; }
      if (l.valor != null) (E.L[l.mes] = E.L[l.mes] || {})[l.chave] = String(l.valor).replace('.', ',');
    });
  }
  function iniciarTextos(forcar) {
    const chave = `${E.tipo}|${E.ano}|${E.tipo === 'mensal' ? E.mes : ''}`;
    if (E.chaveTxt === chave && E.textos && !forcar) return;
    const t = RD.textosIniciais(E.dados[E.ano].textos, E.tipo, E.ano, E.mes, cfg());
    E.textos = t.textos; E.txtInfo = t; E.chaveTxt = chave;
  }
  /** Lançamentos do estado → formato da apuração/servidor (valores numéricos). */
  function lancamentos() {
    const out = [];
    Object.keys(E.L || {}).forEach(m => Object.keys(E.L[m]).forEach(chave => { const v = numSimples(E.L[m][chave]); out.push({ mes: m, chave, valor: v == null || isNaN(v) ? '' : v }); }));
    Object.keys(E.listas || {}).forEach(chave => Object.keys(E.listas[chave]).forEach(m => out.push({ mes: m, chave, lista: E.listas[chave][m].map(limparLinha(chave)) })));
    return out;
  }
  const limparLinha = chave => x => { const y = {}; RD.TABS[chave].forEach(([k, , n]) => { y[k] = n ? (numSimples(x[k]) == null || isNaN(numSimples(x[k])) ? null : numSimples(x[k])) : String(x[k] || '').trim(); }); return y; };
  function recalcular() {
    const p = periodo(), ap = E.ap[`${p.de}|${p.ate}`];
    if (!ap || !E.dados[E.ano]) { E.R = null; return; }
    E.R = RD.calcular({ tipo: E.tipo, ano: E.ano, mes: E.mes, ap, apAno: E.tipo === 'mensal' ? E.ap[`${p.deAno}|${p.ate}`] : ap, lancamentos: lancamentos(),
      cfg: cfg(), hoje: hoje(), municipio: n => P.municipioNome(n) || n });
  }

  /* ---------------- estrutura e eventos ---------------- */
  function montar() {
    const r = P.el('div', 'pn-rg'); r.id = 'pn-rg';
    r.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'pn-rg-tipo' || t.id === 'pn-rg-ano' || t.id === 'pn-rg-mes') {
        E.tipo = r.querySelector('#pn-rg-tipo').value; E.ano = Number(r.querySelector('#pn-rg-ano').value); E.mes = Number(r.querySelector('#pn-rg-mes').value) || 1;
        P.ls.set(LS, JSON.stringify({ tipo: E.tipo, ano: E.ano, mes: E.mes })); E.msg = { t: '', cls: '' }; carregar();
      } else if (t.matches('[data-tab][data-campo="mes"]')) {                       // anual: linha da tabela trocada de mês
        const l = E.listas[t.dataset.tab][t.dataset.mes].splice(+t.dataset.i, 1)[0];
        (E.listas[t.dataset.tab][t.value] = E.listas[t.dataset.tab][t.value] || []).push(l); desenharEdicao();
      } else if (t.id === 'pn-rg-anexo') E.textos.anexo = t.checked ? 1 : 0;
    });
    r.addEventListener('input', e => {
      const t = e.target;
      if (t.classList.contains('pn-rg-in')) { (E.L[t.dataset.mes] = E.L[t.dataset.mes] || {})[t.dataset.chave] = t.value; marcarSujo(); }
      else if (t.dataset.tab && t.dataset.campo && t.dataset.campo !== 'mes') { E.listas[t.dataset.tab][t.dataset.mes][+t.dataset.i][t.dataset.campo] = t.value; marcarSujo(); }
      else if (t.dataset.txt) { E.textos[t.dataset.txt] = t.value; marcarSujo(); }
      else if (t.dataset.ass) { const [i, k] = t.dataset.ass.split(':'); E.textos.assinaturas = (E.textos.assinaturas || []).slice(); while (E.textos.assinaturas.length < 3) E.textos.assinaturas.push({ nome: '', cargo: '' });
        E.textos.assinaturas[+i] = { ...E.textos.assinaturas[+i], [k]: t.value }; marcarSujo(); }
    });
    r.addEventListener('click', e => {
      const b = e.target.closest('[data-rg]'); if (!b) return;
      const a = b.dataset.rg;
      if (a === 'atualizar') carregar(true);
      else if (a === 'salvar') salvar();
      else if (a === 'docx' || a === 'pdf' || a === 'imprimir') gerar(a);
      else if (a === 'add-linha') { const m = E.tipo === 'mensal' ? pad2(E.mes) : (r.querySelector(`[data-mes-nova="${b.dataset.tab}"]`) || {}).value || pad2(E.mes);
        const L = E.listas[b.dataset.tab] = E.listas[b.dataset.tab] || {}; (L[m] = L[m] || []).push({}); desenharEdicao(); }
      else if (a === 'del-linha') { E.listas[b.dataset.tab][b.dataset.mes].splice(+b.dataset.i, 1); marcarSujo(); desenharEdicao(); }
      else if (a === 'add-mun') { const s = r.querySelector(`[data-mun-novo="${b.dataset.grupo}"]`); if (!s || !s.value) return;
        (E.munExtra[b.dataset.grupo] = E.munExtra[b.dataset.grupo] || new Set()).add(s.value); desenharEdicao(); }
      else if (a === 'padrao') { if (!confirm('Trocar todos os textos pelos textos-padrão?')) return; Object.assign(E.textos, RD.TEXTOS_PADRAO); desenharEdicao(); marcarSujo(); }
    });
    return r;
  }
  function marcarSujo() { setMsg('Alterações não salvas.', ''); }
  function setMsg(t, cls) { E.msg = { t, cls }; const m = E.raiz && E.raiz.querySelector('[data-msg=rg]'); if (m) { m.textContent = t; m.className = 'pn-pub-msg' + (cls ? ' ' + cls : ''); } }

  function desenhar() {
    const r = E.raiz; if (!r) return;
    const anos = [anoHoje() - 2, anoHoje() - 1, anoHoje()], meses = RD.MESES.map((n, i) => [i + 1, n]).filter(([i]) => E.ano < anoHoje() || i <= mesHoje());
    if (!meses.some(([i]) => i === E.mes)) E.mes = meses[meses.length - 1][0];
    const R = E.R, tit = E.tipo === 'mensal' ? `Relatório Técnico Parcial — ${RD.MESES[E.mes - 1]}/${E.ano}` : `Relatório Técnico ${E.ano} — Consolidado`;
    r.innerHTML = `
      <div class="pn-cartao pn-rg-topo">
        <div class="pn-conv-sel">
          <label>Tipo<select id="pn-rg-tipo"><option value="mensal" ${E.tipo === 'mensal' ? 'selected' : ''}>Parcial mensal</option><option value="anual" ${E.tipo === 'anual' ? 'selected' : ''}>Consolidado anual</option></select></label>
          <label>Ano<select id="pn-rg-ano">${anos.map(a => `<option ${a === E.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
          <label ${E.tipo === 'anual' ? 'hidden' : ''}>Mês<select id="pn-rg-mes">${meses.map(([i, n]) => `<option value="${i}" ${i === E.mes ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
          <div class="pn-conv-botoes"><button type="button" class="pn-btn" data-rg="atualizar" id="pn-rg-atualizar">Atualizar</button></div>
        </div>
        <h3 class="pn-conv-nome" id="pn-rg-titulo">${esc(tit)}</h3>
        <p class="pn-sub">Apuração no servidor (${E.tipo === 'mensal' ? 'o mês e o acumulado desde 1º de janeiro' : 'o ano inteiro'}), independente do período carregado nas outras abas. Linhas com † são lançadas aqui, por mês; as demais vêm do e-GDV.${R && E.ap[`${periodo().de}|${periodo().ate}`] ? ` Apurado em ${esc(P.fmt.dataHora(E.ap[`${periodo().de}|${periodo().ate}`].apuradoEm))}.` : ''}</p>
      </div>
      ${E.erro ? `<p class="pn-erro" role="alert">${esc(E.erro)}${/a[çc][ãa]o inv[áa]lida/i.test(E.erro) ? ' — o servidor ainda está com o Code.gs antigo: cole o Code.gs novo e crie uma nova versão da implantação.' : ''}</p>` : ''}
      <div id="pn-rg-corpo" class="${E.carregando ? 'carregando' : ''}"></div>`;
    const c = r.querySelector('#pn-rg-corpo');
    if (!R) { P.vazio(c, E.carregando ? 'Apurando o relatório…' : 'Sem apuração.'); return; }
    desenharCorpo(c);
  }
  function desenharEdicao() { recalcular(); const c = E.raiz && E.raiz.querySelector('#pn-rg-corpo'); if (c) { const y = window.scrollY; desenharCorpo(c); window.scrollTo(0, y); } }

  /* ---------------- corpo (pré-visualização + lançamentos + textos) ---------------- */
  const tabela = (cab, linhas, extra) => `<div class="pn-tab pn-rg-tab ${extra || ''}"><div class="pn-tab-rolo"><table><thead><tr>${cab.map(h => `<th scope="col" class="${h.num ? 'num' : ''}">${esc(h.r)}</th>`).join('')}</tr></thead>` +
    `<tbody>${linhas.map(l => `<tr class="${l.cls || ''}">${l.c.map((x, i) => `<td class="${cab[i] && cab[i].num ? 'num' : ''}">${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  const inp = (m, chave, rot) => `<input class="pn-rg-in" inputmode="decimal" maxlength="12" data-mes="${m}" data-chave="${esc(chave)}" aria-label="${esc(rot)}" value="${esc(((E.L[m] || {})[chave]) || '')}">`;
  const val = (v, u) => esc(RD.valorTxt(v, u || 'nº'));
  const seloFonte = f => f === 'auto' ? '<span class="pn-selo bom">e-GDV</span>' : '<span class="pn-selo info">lançado</span>';
  function desenharCorpo(c) {
    const R = E.R, M = R.marcadores, anual = R.tipo === 'anual', mm = R.mm;
    c.innerHTML = '';
    P.kpis(c, [
      { rotulo: 'Municípios com levantamento', valor: R.resumo.municipiosLevantados || 0 },
      { rotulo: 'Propriedades visitadas', valor: (anual ? R.quadroPce.find(x => x.chave === 'propVisitadas').total : R.quadroPce.find(x => x.chave === 'propVisitadas').mes) || 0, detalhe: 'distintas no período' },
      { rotulo: 'Levantamentos', valor: R.resumo.levantamentos || 0, detalhe: `${F.int(R.resumo.deteccoes || 0)} detecção(ões)/suspeita(s)` },
      { rotulo: 'Termos de colheita', valor: R.lab.total.termos, detalhe: `${F.int(R.lab.total.amostras)} amostra(s) · ${F.int(R.lab.total.positivo)} positiva(s)`, status: R.lab.total.positivo ? 'critico' : null },
      { rotulo: 'Veículos abordados', valor: Number(String(M.veiculos).replace(/\./g, '')) || 0, detalhe: `${M.tfs} TF(s) · ${M.pessoas} pessoas orientadas` }
    ]);
    P.alertas(P.secao(c, 'Avisos de consistência', 'Antes de gerar: linhas manuais vazias, amostras sem resultado, campos opcionais e unidades sem conversão.'), R.avisos, { vazio: 'Nenhum aviso. ✓', max: 6 });

    /* Seção I */
    const s1 = P.secao(c, 'Seção I — Levantamentos por grupo de pragas', 'Tabelas por município (propriedades distintas; detecções por praga; "–" = zero). O total fecha por construção (soma das linhas). Colunas † por município são lançadas aqui.');
    R.grupos.forEach(G => {
      const g = G.g, card = P.el('div', 'pn-cartao pn-rg-grupo'); card.dataset.grupo = g.id;
      const cab = [{ r: 'Município' }, { r: 'Propriedades', num: true }].concat((g.colunas || []).map(x => ({ r: x.rotulo, num: true })))
        .concat(G.extras.map(x => ({ r: x === 'suspeitas' ? 'Suspeitas' : 'Amostras', num: true }))).concat(G.manuais.map(x => ({ r: x.rotulo + ' †', num: true })));
      const munsManual = new Set(G.linhas.map(r => r.municipio).concat([...(E.munExtra[g.id] || [])]));
      const linhasMun = [...munsManual].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(nome => G.linhas.find(r => r.municipio === nome) || { municipio: nome, propriedades: 0, det: (g.colunas || []).map(() => 0), susp: (g.colunas || []).map(() => 0), suspeitas: 0, amostras: 0, manual: {} });
      const meses = anual ? null : [mm];
      const linhas = linhasMun.map(r => ({ c: [esc(r.municipio), esc(F.int(r.propriedades))]
        .concat(r.det.map((v, j) => esc(v ? F.int(v) : '–') + (r.susp[j] && !G.extras.includes('suspeitas') ? ` <small>(+${F.int(r.susp[j])} susp.)</small>` : '')))
        .concat(G.extras.map(x => esc((x === 'suspeitas' ? r.suspeitas : r.amostras) ? F.int(x === 'suspeitas' ? r.suspeitas : r.amostras) : '–')))
        .concat(G.manuais.map(mn => meses ? inp(mm, `mun.${g.id}.${mn.chave}|${r.municipio}`, `${mn.rotulo} – ${r.municipio}`) : esc(r.manual[mn.chave] != null ? F.int(r.manual[mn.chave]) : '–'))) }))
        .concat([{ cls: 'pn-rg-total', c: ['<b>TOTAL</b>', `<b>${esc(F.int(G.total.propriedades))}</b>`].concat(G.total.det.map(v => `<b>${esc(v ? F.int(v) : '–')}</b>`))
          .concat(G.extras.map(x => `<b>${esc(F.int(x === 'suspeitas' ? G.total.suspeitas : G.total.amostras))}</b>`)).concat(G.manuais.map(mn => `<b>${esc(G.total.manual[mn.chave] != null ? F.int(G.total.manual[mn.chave]) : '–')}</b>`)) }]);
      card.innerHTML = `<h3>${esc(g.nome)}</h3><p class="pn-sub">${esc(F.int(G.levantamentos || 0))} levantamento(s) · ${esc(F.int(G.propriedades || 0))} propriedade(s) · ${Object.keys(G.niveis).length} município(s) no mapa</p>` +
        tabela(cab, linhas) +
        (G.manuais.length && !anual ? `<div class="pn-rg-addmun"><label>Lançar ${esc(G.manuais.map(x => x.rotulo.toLowerCase()).join(' / '))} em outro município<select data-mun-novo="${esc(g.id)}"><option value="">Escolha</option>${P.municipios.filter(m => !munsManual.has(m)).map(m => `<option>${esc(m)}</option>`).join('')}</select></label><button type="button" class="pn-btn pn-btn-mini" data-rg="add-mun" data-grupo="${esc(g.id)}">Adicionar</button></div>` : '') +
        (G.manuais.length && anual ? '<p class="pn-sub">No anual, as colunas † somam os meses; lance-as nos relatórios mensais.</p>' : '');
      s1.appendChild(card);
    });
    const labCab = ['Praga', 'Termos', 'Amostras', 'Enviadas', 'Aguardando', 'Negativo', 'Positivo', 'Inconclusivo', 'Inviável'].map((r, i) => ({ r, num: i > 0 }));
    const labK = ['termos', 'amostras', 'enviadas', 'aguardando', 'negativo', 'positivo', 'inconclusivo', 'inviavel'];
    const lab = P.el('div', 'pn-cartao'); lab.innerHTML = '<h3>Amostras e resultados de laboratório</h3>' + tabela(labCab, R.lab.porPraga.map(x => ({ c: [esc(x.praga)].concat(labK.map(k => esc(F.int(x[k] || 0)))) }))
      .concat([{ cls: 'pn-rg-total', c: ['<b>TOTAL</b>'].concat(labK.map(k => `<b>${esc(F.int(R.lab.total[k]))}</b>`)) }]));
    s1.appendChild(lab);

    /* Seção II: quadro PCE */
    const s2 = P.secao(c, 'Seção II — Quadro PCE', anual ? 'Jan–dez e total. As linhas "lançado" aceitam valor em cada mês (o total soma os meses). Propriedades e área: o total usa propriedades distintas no ano.' : `Mês e acumulado no ano (1º de janeiro a ${RD.MESES[E.mes - 1]}). As linhas "lançado" aceitam o valor do mês.`);
    const ML = R.meses.map(m => RD.MESES_CURTOS[+m - 1]);
    const celulaMes = (r, m, chaveLanc) => (r.fonte === 'manual' && !R.futuro(m) ? inp(m, chaveLanc || r.chave, `${r.rotulo} – ${RD.MESES_CURTOS[+m - 1]}`) : esc(R.futuro(m) ? '' : RD.valorTxt(r.valores[m], r.unid)));
    const cabQ = anual ? [{ r: 'Ação' }, { r: 'Unid.' }, { r: 'Fonte' }].concat(ML.map(m => ({ r: m, num: true }))).concat([{ r: 'Total', num: true }])
      : [{ r: 'Ação' }, { r: 'Unid.' }, { r: 'Fonte' }, { r: `${RD.MESES_CURTOS[E.mes - 1]}/${E.ano}`, num: true }, { r: 'Acumulado no ano', num: true }];
    const linhaQ = (r, chaveLanc) => ({ c: [esc(r.rotulo), esc(r.unid), seloFonte(r.fonte)].concat(anual ? R.meses.map(m => celulaMes(r, m, chaveLanc)).concat([`<b>${val(r.total, r.unid)}</b>`])
      : [celulaMes(r, mm, chaveLanc), `<b>${val(r.acum, r.unid)}</b>`]) });
    const qp = P.el('div', 'pn-cartao'); qp.innerHTML = '<h3>Programa de Prevenção, Controle e Erradicação de Pragas – PCE</h3>' + tabela(cabQ, R.quadroPce.map(r => linhaQ(r)), 'pn-rg-quadro');
    s2.appendChild(qp);
    // VIGIFITO
    const sv = P.secao(c, 'Seção II — VIGIFITO (barreiras)', 'Total = BVA fixas + BVA volantes (por construção). Toneladas: só produtos em kg ou t; as outras unidades aparecem nos avisos. As linhas "lançado" são preenchidas para fixas e volantes.');
    if (anual) {
      [['fixa', 'BVA fixas'], ['volante', 'BVA volantes'], ['total', 'Total consolidado']].forEach(([b, t]) => {
        const k = P.el('div', 'pn-cartao'); k.innerHTML = `<h3>VIGIFITO – ${esc(t)}</h3>` + tabela(cabQ, R.vig[b].map(r => (b === 'total' ? { c: [esc(r.rotulo), esc(r.unid), seloFonte(r.fonte)].concat(R.meses.map(m => esc(R.futuro(m) ? '' : RD.valorTxt(r.valores[m], r.unid)))).concat([`<b>${val(r.total, r.unid)}</b>`]) }
          : linhaQ(r, r.chaveLanc))), 'pn-rg-quadro'); sv.appendChild(k);
      });
    } else {
      const cabV = [{ r: 'Ação' }, { r: 'Unid.' }, { r: 'Fonte' }, { r: 'BVA fixas', num: true }, { r: 'BVA volantes', num: true }, { r: 'Total no mês', num: true }, { r: 'Acumulado no ano', num: true }];
      const k = P.el('div', 'pn-cartao'); k.innerHTML = '<h3>Programa de Vigilância Fitossanitária – VIGIFITO</h3>' + tabela(cabV, R.vig.total.map((r, i) => {
        const fx = R.vig.fixa[i], vo = R.vig.volante[i];
        return { c: [esc(r.rotulo), esc(r.unid), seloFonte(r.fonte), r.fonte === 'manual' ? inp(mm, fx.chaveLanc, `${r.rotulo} – fixas`) : val(fx.mes, r.unid),
          r.fonte === 'manual' ? inp(mm, vo.chaveLanc, `${r.rotulo} – volantes`) : val(vo.mes, r.unid), `<b>${val(r.mes, r.unid)}</b>`, val(r.acum, r.unid)] };
      }), 'pn-rg-quadro'); sv.appendChild(k);
    }

    /* Seções III, IV e V: tabelas lançadas */
    const s3 = P.secao(c, 'Seções III, IV e V — CFO/CFOC, PTV e educação sanitária', anual ? 'Linhas de todos os meses (escolha o mês de cada linha). A linha "barreiras: pessoas orientadas" da educação sanitária vem do VIGIFITO.' : `Linhas de ${RD.MESES[E.mes - 1]}/${E.ano}. A linha "barreiras: pessoas orientadas" da educação sanitária vem do VIGIFITO.`);
    [['tab.cfo', 'CFO/CFOC emitidos (Seção III)'], ['tab.ptv', 'PTV emitidas (Seção IV)'], ['tab.educacao', 'Ações de educação sanitária (Seção V)']].forEach(([chave, tit]) => {
      const C = RD.TABS[chave], k = P.el('div', 'pn-cartao pn-rg-lista'); k.dataset.tab = chave;
      const meses = anual ? R.meses : [mm], linhas = [];
      meses.forEach(m => ((E.listas[chave] || {})[m] || []).forEach((x, i) => linhas.push({ c: (anual ? [`<select data-tab="${chave}" data-mes="${m}" data-i="${i}" data-campo="mes" aria-label="Mês">${R.meses.map(mm2 => `<option value="${mm2}" ${mm2 === m ? 'selected' : ''}>${RD.MESES_CURTOS[+mm2 - 1]}</option>`).join('')}</select>`] : [])
        .concat(C.map(([campo, rot, n]) => `<input data-tab="${chave}" data-mes="${m}" data-i="${i}" data-campo="${campo}" ${n ? 'inputmode="decimal"' : ''} maxlength="${campo === 'descricao' ? 1000 : 200}" aria-label="${esc(rot)}" value="${esc(x[campo] == null ? '' : String(x[campo]))}">`))
        .concat([`<button type="button" class="pn-btn pn-btn-mini" data-rg="del-linha" data-tab="${chave}" data-mes="${m}" data-i="${i}" aria-label="Remover linha">✕</button>`]) })));
      k.innerHTML = `<h3>${esc(tit)} †</h3>` + (linhas.length ? tabela((anual ? [{ r: 'Mês' }] : []).concat(C.map(([, r, n]) => ({ r, num: !!n }))).concat([{ r: '' }]), linhas) : '<p class="pn-vazio">Nenhuma linha lançada.</p>') +
        `<div class="pn-rg-addmun">${anual ? `<label>Mês<select data-mes-nova="${chave}">${R.meses.map(m => `<option value="${m}">${RD.MESES_CURTOS[+m - 1]}</option>`).join('')}</select></label>` : ''}<button type="button" class="pn-btn pn-btn-mini" data-rg="add-linha" data-tab="${chave}">+ Adicionar linha</button></div>`;
      s3.appendChild(k);
    });

    /* Seção VI: HLB */
    const s6 = P.secao(c, 'Seção VI — Plano de contingência HLB', 'Números do e-GDV (grupo Citros) e armadilhas para Diaphorina citri (lançado).');
    const H = R.hlb, h = P.el('div', 'pn-cartao');
    h.innerHTML = tabela([{ r: 'Indicador' }, { r: 'Valor', num: true }, { r: 'Fonte' }], [['Levantamentos de pragas dos citros', H.levantamentos, 'auto'], ['Viveiros inspecionados', H.viveiros, 'auto'],
      ['Propriedades com HLB detectado ou suspeito', H.hlb, 'auto'], ['Propriedades com Diaphorina citri detectada ou suspeita', H.diaphorina, 'auto']]
      .map(([a, v, f]) => ({ c: [esc(a), esc(F.int(v || 0)), seloFonte(f)] }))
      .concat([{ c: ['Armadilhas para Diaphorina citri † ' + (anual ? '(soma dos meses)' : ''), anual ? esc(H.armadilhas == null ? '—' : F.int(H.armadilhas)) : inp(mm, 'hlb.armadilhas', 'Armadilhas para Diaphorina citri'), seloFonte('manual')] }]));
    s6.appendChild(h);

    /* Textos */
    const st = P.secao(c, 'Textos do relatório', `${E.txtInfo.salvo ? 'Textos salvos deste relatório.' : E.txtInfo.origem === 'anterior' ? `Pré-preenchidos com os do relatório de ${E.txtInfo.anterior}.` : 'Textos-padrão (genéricos).'} Marcadores substituídos na geração: ${Object.keys(RD.MARCADORES).map(k => `{${k}}`).join(' ')}.`);
    const T = E.textos, form = P.el('div', 'pn-cartao pn-rg-textos');
    const ta = (k, rot, rows) => `<label class="pn-conv-campo pn-conv-largo">${esc(rot)}<textarea data-txt="${esc(k)}" rows="${rows || 3}" maxlength="8000">${esc(T[k] == null ? '' : T[k])}</textarea></label>`;
    const ass = (T.assinaturas || []).concat([{}, {}, {}]).slice(0, 3);
    form.innerHTML = `<details class="pn-rg-marc"><summary>Marcadores automáticos (valores deste relatório)</summary><dl>${Object.entries(RD.MARCADORES).map(([k, d]) => `<div><dt>{${esc(k)}}</dt><dd>${esc(d)} = <b>${esc(M[k])}</b></dd></div>`).join('')}</dl></details>` +
      Object.entries(RD.ROTULOS_TXT).slice(0, 4).map(([k, r]) => ta(k, r, k === 'introducao' ? 5 : 3)).join('') +
      (cfg().grupos || []).map(g => { if (T['grupo_' + g.id] == null) T['grupo_' + g.id] = RD.textoGrupo(T, g); return ta('grupo_' + g.id, `1.2 – ${g.nome}`, 3); }).join('') +
      Object.entries(RD.ROTULOS_TXT).slice(4).map(([k, r]) => ta(k, r, k === 'conclusao' ? 5 : 3)).join('') +
      `<fieldset class="pn-conv-cfg-etapa"><legend>Local, assinaturas e anexo</legend>
        <label class="pn-conv-campo">Local (data por extenso na geração)<input data-txt="local" maxlength="80" value="${esc(T.local || '')}"></label>
        ${ass.map((a, i) => `<div class="pn-conv-ass"><label class="pn-conv-campo">Nome ${i + 1}<input data-ass="${i}:nome" maxlength="100" value="${esc(a.nome || '')}"></label><label class="pn-conv-campo">Cargo<input data-ass="${i}:cargo" maxlength="140" value="${esc(a.cargo || '')}"></label></div>`).join('')}
        <label class="pn-rg-chk"><input type="checkbox" id="pn-rg-anexo" ${T.anexo ? 'checked' : ''}> Incluir o anexo por propriedade (produtor só com iniciais, CPF/CNPJ mascarado, coordenadas a 2 casas)</label></fieldset>`;
    st.appendChild(form);
    const bar = P.el('div', 'pn-cartao pn-conv-rel-acoes pn-rg-acoes');
    bar.innerHTML = `<button type="button" class="pn-btn" data-rg="salvar" id="pn-rg-salvar">Salvar lançamentos e textos</button>
      <button type="button" class="pn-btn pn-btn-prim" data-rg="docx" id="pn-rg-docx">Baixar Word (.docx)</button>
      <button type="button" class="pn-btn pn-btn-prim" data-rg="pdf" id="pn-rg-pdf">Baixar PDF</button>
      <button type="button" class="pn-btn" data-rg="imprimir" id="pn-rg-imprimir">Imprimir</button>
      <button type="button" class="pn-link" data-rg="padrao">Usar textos-padrão</button>
      <span class="pn-pub-msg${E.msg.cls ? ' ' + E.msg.cls : ''}" data-msg="rg" role="status">${esc(E.msg.t)}</span>`;
    c.appendChild(bar);
  }

  /* ---------------- salvar e gerar ---------------- */
  async function salvar(silencioso) {
    const lancs = lancamentos(), ruim = lancs.find(l => !RD.TABS[l.chave] && l.valor !== '' && (isNaN(l.valor) || l.valor < 0));
    if (ruim) { setMsg(`Valor inválido em "${ruim.chave}" (${ruim.mes}). Use números (ex.: 12 ou 3,5).`, 'erro'); return false; }
    const bruto = []; Object.keys(E.L).forEach(m => Object.keys(E.L[m]).forEach(ch => { const v = numSimples(E.L[m][ch]); if (v != null && isNaN(v)) bruto.push(ch); }));
    if (bruto.length) { setMsg(`Valor inválido em "${bruto[0]}". Use números (ex.: 12 ou 3,5).`, 'erro'); return false; }
    if (!silencioso) setMsg('Salvando…', '');
    try {
      const t = { ...E.textos, assinaturas: (E.textos.assinaturas || []).slice(0, 3) };
      const j = await P.chamar({ action: 'painelRelGdvSalvar', ano: E.ano, tipo: E.tipo, mes: pad2(E.mes), textos: t, lancamentos: lancs });
      const d = E.dados[E.ano];
      if (j.textos) { const i = d.textos.findIndex(x => x.id === j.textos.id); if (i >= 0) d.textos[i] = j.textos; else d.textos.push(j.textos); E.txtInfo = { ...E.txtInfo, salvo: true, origem: 'salvo' }; }
      d.lancamentos = lancs.filter(l => l.valor !== '' || (l.lista && l.lista.length)).map(l => ({ ...l, usuario: j.usuario, atualizadoEm: j.atualizadoEm }));
      setMsg(silencioso ? 'Salvo ✓' : `Salvo ✓ (${j.gravados} linha(s) alterada(s))`, 'ok');
      if (!silencioso) desenharEdicao();
      return true;
    } catch (e) { if (P.logado) setMsg('Não salvou: ' + e.message, 'erro'); return false; }
  }
  const nomeArq = ext => (E.tipo === 'mensal' ? `Relatorio_GDV_Parcial_${E.ano}-${pad2(E.mes)}` : `Relatorio_GDV_${E.ano}_Consolidado`) + '.' + ext;
  function baixarBlob(blob, nome) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000); }
  const bytes = async url => new Uint8Array(await (await fetch(url)).arrayBuffer());
  const script = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { s.remove(); no(new Error('Não foi possível carregar ' + src)); }; document.head.appendChild(s); });
  /** Blocos do relatório com os mapas dos grupos (PNG desenhado no navegador a partir da malha municipal). */
  async function montarBlocos() {
    recalcular();
    const geo = await P.carregarGeo(), mapas = {};
    E.R.grupos.forEach(G => { if (Object.keys(G.niveis).length) mapas[G.g.id] = RD.mapa(geo, G.niveis); });
    return RD.blocos(E.R, E.textos, { dataEmissao: hoje(), mapas, anexo: !!E.textos.anexo });
  }
  async function gerar(tipo) {
    if (E.gerando || !E.R) return; E.gerando = true;
    const botoes = [...E.raiz.querySelectorAll('.pn-rg-acoes button')]; botoes.forEach(b => { b.disabled = true; });
    try {
      if (!(await salvar(true))) return;
      const B = await montarBlocos();
      E.ultimosBlocos = B;
      if (tipo === 'docx') {
        setMsg('Gerando o Word…', '');
        const [cab, adaf, sepror] = await Promise.all([bytes('../img/brasao.png'), bytes('../img/logo-adaf.png'), bytes('../img/sepror.png')]);
        const blob = DocxMin.criar({ blocos: B, titulo: B[0].texto, autor: P.usuario || 'e-GDV', cabecalho: cab, rodape: [adaf, sepror],
          cabecalhoTexto: ['GOVERNO DO ESTADO DO AMAZONAS', 'Agência de Defesa Agropecuária e Florestal do Estado do Amazonas – ADAF'] });
        baixarBlob(blob, nomeArq('docx')); setMsg('Word gerado ✓', 'ok');
      } else {
        setMsg(tipo === 'pdf' ? 'Gerando o PDF…' : 'Abrindo a impressão…', '');
        const fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:0'; fr.title = 'Relatório GDV';
        await new Promise((ok, no) => { fr.onload = ok; fr.onerror = no; fr.src = '../documentos/relgdv-relatorio.html'; document.body.appendChild(fr); });
        const w = fr.contentWindow, d = fr.contentDocument;
        for (let i = 0; i < 50 && !w.RelGdvDocs; i++) await new Promise(r => setTimeout(r, 50));
        w.RelGdvDocs.html(d, B);
        await Promise.all([...d.images].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))));
        const nome = nomeArq('pdf').replace(/\.pdf$/, ''); d.title = nome;
        if (tipo === 'imprimir') {
          const titulo = document.title; document.title = nome;
          w.addEventListener('afterprint', () => { document.title = titulo; fr.remove(); });
          w.focus(); w.print(); setMsg('', '');
        } else {
          if (typeof window.html2canvas !== 'function') await script('../vendor/html2canvas.min.js');
          if (typeof PDF === 'undefined') await script('../js/pdf.js');
          const arq = await PDF.deFrame(fr, nome);
          baixarBlob(arq, arq.name); setMsg('PDF gerado ✓', 'ok');
        }
      }
    } catch (e) { setMsg('Falha ao gerar: ' + e.message, 'erro'); }
    finally { E.gerando = false; botoes.forEach(b => { b.disabled = false; }); }
  }

  /* ---------------- registro ---------------- */
  function render(c) {
    if (!E.raiz) { E.raiz = montar(); desenhar(); }
    c.appendChild(E.raiz);
    if (!E.dados[E.ano] && !E.carregando && !E.erro) carregar();
  }
  P.aoSair(() => { if (E.raiz) E.raiz.remove(); Object.assign(E, { raiz: null, dados: {}, ap: {}, R: null, erro: '', textos: null, chaveTxt: '', L: null, listas: null, anoEstado: 0, msg: { t: '', cls: '' } }); });
  P.registrarAba({ id: 'relatorios', titulo: 'Relatórios', render, semFiltros: true,
    contador: () => (E.R ? E.R.avisos.filter(a => a.nivel === 'critico').length : 0),
    /** usados pelos testes: estado calculado, blocos do último relatório gerado e recarga */
    estado: () => ({ R: E.R, tipo: E.tipo, ano: E.ano, mes: E.mes, textos: E.textos, L: E.L, listas: E.listas, dados: E.dados[E.ano], blocos: E.ultimosBlocos }),
    montarBlocos, recarregar: () => carregar(true) });
})();
