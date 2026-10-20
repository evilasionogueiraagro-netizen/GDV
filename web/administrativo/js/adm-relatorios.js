/* Portal do Administrativo — "Linhas dos relatórios": os números lançados à mão do Relatório GDV (antes no painel), por mês:
   linhas manuais do quadro PCE (área controlada, capacitação, medida fitossanitária, UP/UC cadastradas, RT, exame de documentos, termos
   e autos…), colunas por município dos grupos de pragas (poda drástica, monitoramento de armadilhas, vazio sanitário), armadilhas
   para Diaphorina citri (HLB) e as tabelas de CFO/CFOC, PTV e educação sanitária. Grava pela action admRelLancar (uma linha por
   mês e linha na aba RelGdvLancamentos, com quem/quando; contagens inteiras, sem negativos). Os textos dos relatórios continuam no
   painel (o gerente redige); o VIGIFITO por posto fica na aba VIGIFITO. Campos com os mesmos atributos da antiga tela do painel
   (.pn-rg-in[data-mes][data-chave], [data-tab][data-campo], data-rg). */
(() => {
  'use strict';
  if (typeof Adm === 'undefined' || typeof RelGdvDocs === 'undefined') return;
  const A = Adm, esc = A.esc, RD = RelGdvDocs, F = A.fmt;
  const pad2 = n => String(n).padStart(2, '0');
  const anoHoje = () => Number(A.hoje().slice(0, 4)), mesHoje = () => Number(A.hoje().slice(5, 7));
  const E = { ano: anoHoje(), mes: mesHoje(), dados: {}, L: null, listas: null, meta: {}, munExtra: {}, msg: { t: '', cls: '' }, raiz: null, erro: '' };
  const cfgRel = () => (typeof CONFIG !== 'undefined' && CONFIG.RELGDV) || { grupos: [] };
  const numSimples = v => { const s = String(v == null ? '' : v).trim(); if (!s) return null; const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(n) ? n : NaN; };
  const inteiro = chave => chave !== 'pce.areaControlada';

  async function carregar(c, forcar) {
    E.erro = '';
    try {
      if (!E.dados[E.ano] || forcar) E.dados[E.ano] = await A.chamar({ action: 'admRelDados', ano: E.ano });
      iniciar();
    } catch (e) { E.erro = e.message; }
    desenhar(c);
  }
  function iniciar() {
    E.L = {}; E.listas = {}; E.meta = {};
    (E.dados[E.ano].lancamentos || []).forEach(l => {
      E.meta[l.mes + '|' + l.chave] = { usuario: l.usuario, em: l.atualizadoEm };
      if (RD.TABS[l.chave]) { (E.listas[l.chave] = E.listas[l.chave] || {})[l.mes] = (l.lista || []).map(x => ({ ...x })); return; }
      if (l.valor != null) (E.L[l.mes] = E.L[l.mes] || {})[l.chave] = String(l.valor).replace('.', ',');
    });
  }
  const quem = (m, chave) => { const x = E.meta[m + '|' + chave]; return x ? `lançado por ${x.usuario} em ${F.dataHora(x.em)}` : 'sem lançamento'; };
  const inp = (m, chave, rot) => `<input class="pn-rg-in" inputmode="decimal" maxlength="12" data-mes="${m}" data-chave="${esc(chave)}" aria-label="${esc(rot)}" title="${esc(quem(m, chave))}" value="${esc(((E.L[m] || {})[chave]) || '')}">`;
  const tabela = (cab, linhas) => `<div class="pn-tab pn-rg-tab"><div class="pn-tab-rolo"><table><thead><tr>${cab.map(h => `<th scope="col" class="${h.num ? 'num' : ''}">${esc(h.r)}</th>`).join('')}</tr></thead>` +
    `<tbody>${linhas.map(l => `<tr>${l.map((x, i) => `<td class="${cab[i] && cab[i].num ? 'num' : ''}">${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;

  function desenhar(c) {
    const r = E.raiz; if (!r) return;
    const anos = [anoHoje() - 2, anoHoje() - 1, anoHoje()], meses = RD.MESES.map((n, i) => [i + 1, n]).filter(([i]) => E.ano < anoHoje() || i <= mesHoje());
    if (!meses.some(([i]) => i === E.mes)) E.mes = meses[meses.length - 1][0];
    const mm = pad2(E.mes);
    r.innerHTML = `<div class="pn-cartao pn-rg-topo"><div class="pn-conv-sel">
        <label>Ano<select id="pn-rg-ano">${anos.map(a => `<option ${a === E.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label>Mês<select id="pn-rg-mes">${meses.map(([i, n]) => `<option value="${i}" ${i === E.mes ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label></div>
        <h3 class="pn-conv-nome">Linhas manuais do Relatório GDV — ${esc(RD.MESES[E.mes - 1])}/${E.ano}</h3>
        <p class="pn-sub">Valores do mês (o relatório anual soma os meses). Contagens em números inteiros, sem negativos; deixe em branco o que não houve lançamento. O que vem do app de campo é apurado sozinho e não aparece aqui.</p></div>
      ${E.erro ? `<p class="pn-erro" role="alert">${esc(E.erro)}</p>` : ''}<div id="adm-rel-corpo"></div>`;
    const corpo = r.querySelector('#adm-rel-corpo');
    if (!E.L) { A.vazio(corpo, E.erro ? 'Sem dados.' : 'Carregando…'); return; }
    // quadro PCE
    const s1 = A.secao(corpo, 'Quadro PCE — linhas lançadas', 'Seção II do relatório (Programa de Prevenção, Controle e Erradicação de Pragas).');
    const k1 = A.el('div', 'pn-cartao'); k1.innerHTML = tabela([{ r: 'Linha' }, { r: 'Unid.' }, { r: `${RD.MESES_CURTOS[E.mes - 1]}/${E.ano}`, num: true }, { r: 'Lançado' }],
      RD.LINHAS_MANUAIS_PCE.map(d => [esc(d.rotulo), esc(d.unid), inp(mm, d.chave, d.rotulo), `<small class="pn-sub">${esc(quem(mm, d.chave))}</small>`]));
    s1.appendChild(k1);
    // colunas por município
    const gm = (cfgRel().grupos || []).filter(g => (g.manuais || []).length);
    if (gm.length) {
      const s2 = A.secao(corpo, 'Seção I — colunas lançadas por município', 'Ex.: poda drástica (monilíase), monitoramento de armadilhas (mosca-da-carambola), fiscalizações do vazio sanitário (soja).');
      gm.forEach(g => {
        const muns = new Set([...(E.munExtra[g.id] || [])]);
        Object.keys(E.L[mm] || {}).forEach(k => g.manuais.forEach(mn => { const p = `mun.${g.id}.${mn.chave}|`; if (k.indexOf(p) === 0) muns.add(k.slice(p.length)); }));
        const card = A.el('div', 'pn-cartao pn-rg-grupo'); card.dataset.grupo = g.id;
        const lst = [...muns].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        card.innerHTML = `<h3>${esc(g.nome)}</h3>` + (lst.length ? tabela([{ r: 'Município' }].concat(g.manuais.map(mn => ({ r: mn.rotulo, num: true }))),
          lst.map(m => [esc(m)].concat(g.manuais.map(mn => inp(mm, `mun.${g.id}.${mn.chave}|${m}`, `${mn.rotulo} – ${m}`))))) : '<p class="pn-vazio">Nenhum município lançado neste mês.</p>') +
          `<div class="pn-rg-addmun"><label>Município<select data-mun-novo="${esc(g.id)}"><option value="">Escolha</option>${A.municipios.filter(m => !muns.has(m)).map(m => `<option>${esc(m)}</option>`).join('')}</select></label><button type="button" class="pn-btn pn-btn-mini" data-rg="add-mun" data-grupo="${esc(g.id)}">Adicionar</button></div>`;
        s2.appendChild(card);
      });
    }
    // HLB
    const s6 = A.secao(corpo, 'Seção VI — Plano de contingência do HLB', 'Armadilhas para Diaphorina citri (monitoramento) no mês.');
    const k6 = A.el('div', 'pn-cartao'); k6.innerHTML = tabela([{ r: 'Linha' }, { r: 'Valor', num: true }, { r: 'Lançado' }], [['Armadilhas para Diaphorina citri', inp(mm, 'hlb.armadilhas', 'Armadilhas para Diaphorina citri'), `<small class="pn-sub">${esc(quem(mm, 'hlb.armadilhas'))}</small>`]]);
    s6.appendChild(k6);
    // tabelas
    const s3 = A.secao(corpo, 'Seções III, IV e V — CFO/CFOC, PTV e educação sanitária', `Linhas de ${RD.MESES[E.mes - 1]}/${E.ano}. A educação sanitária nas barreiras (veículos orientados) vem do VIGIFITO, apurada pelo e-GDV a partir do registro dos veículos.`);
    [['tab.cfo', 'CFO/CFOC emitidos (Seção III)'], ['tab.ptv', 'PTV emitidas (Seção IV)'], ['tab.educacao', 'Ações de educação sanitária (Seção V)']].forEach(([chave, tit]) => {
      const C = RD.TABS[chave], k = A.el('div', 'pn-cartao pn-rg-lista'); k.dataset.tab = chave;
      const lin = ((E.listas[chave] || {})[mm] || []).map((x, i) => C.map(([campo, rot, n]) => `<input data-tab="${chave}" data-mes="${mm}" data-i="${i}" data-campo="${campo}" ${n ? 'inputmode="decimal"' : ''} maxlength="${campo === 'descricao' ? 1000 : 200}" aria-label="${esc(rot)}" value="${esc(x[campo] == null ? '' : String(x[campo]))}">`)
        .concat([`<button type="button" class="pn-btn pn-btn-mini" data-rg="del-linha" data-tab="${chave}" data-mes="${mm}" data-i="${i}" aria-label="Remover linha">${icone('fechar')}</button>`]));
      k.innerHTML = `<h3>${esc(tit)}</h3><p class="pn-sub">${esc(quem(mm, chave))}</p>` + (lin.length ? tabela(C.map(([, r, n]) => ({ r, num: !!n })).concat([{ r: '' }]), lin) : '<p class="pn-vazio">Nenhuma linha lançada.</p>') +
        `<div class="pn-rg-addmun"><button type="button" class="pn-btn pn-btn-mini" data-rg="add-linha" data-tab="${chave}">+ Adicionar linha</button></div>`;
      s3.appendChild(k);
    });
    const bar = A.el('div', 'pn-cartao pn-conv-rel-acoes pn-rg-acoes');
    bar.innerHTML = `<button type="button" class="pn-btn pn-btn-prim" data-rg="salvar" id="pn-rg-salvar">Gravar lançamentos de ${esc(RD.MESES[E.mes - 1])}</button>
      <span class="pn-pub-msg${E.msg.cls ? ' ' + E.msg.cls : ''}" data-msg="rg" role="status">${esc(E.msg.t)}</span>`;
    corpo.appendChild(bar);
  }
  function setMsg(t, cls) { E.msg = { t, cls }; const m = E.raiz && E.raiz.querySelector('[data-msg=rg]'); if (m) { m.textContent = t; m.className = 'pn-pub-msg' + (cls ? ' ' + cls : ''); } }
  /** Lançamentos do mês na tela → formato da action (valores numéricos; vazio = sem lançamento). */
  function lancamentosDoMes() {
    const mm = pad2(E.mes), out = [];
    Object.keys(E.L[mm] || {}).forEach(chave => { const v = numSimples(E.L[mm][chave]); out.push({ mes: mm, chave, valor: v == null ? '' : v }); });
    Object.keys(E.listas).forEach(chave => { if ((E.listas[chave] || {})[mm]) out.push({ mes: mm, chave, lista: E.listas[chave][mm].map(x => { const y = {};
      RD.TABS[chave].forEach(([k, , n]) => { const v = numSimples(x[k]); y[k] = n ? (v == null || isNaN(v) ? null : v) : String(x[k] || '').trim(); }); return y; }) }); });
    return out;
  }
  async function salvar() {
    const lancs = lancamentosDoMes();
    const ruim = lancs.find(l => !RD.TABS[l.chave] && l.valor !== '' && (isNaN(l.valor) || l.valor < 0 || (inteiro(l.chave) && Math.round(l.valor) !== l.valor)));
    if (ruim) return setMsg(`Valor inválido em "${ruim.chave}": use números inteiros de 0 em diante${inteiro(ruim.chave) ? '' : ' (ha: até 3 casas)'}.`, 'erro');
    const ruimT = lancs.find(l => l.lista && l.lista.some(x => ['documentos', 'atingido'].some(k => x[k] != null && (x[k] < 0 || Math.round(x[k]) !== x[k])) || (x.quantidade != null && x.quantidade < 0)));
    if (ruimT) return setMsg(`Tabela ${ruimT.chave.replace('tab.', '').toUpperCase()}: nº de documentos e público atingido são inteiros, sem negativos.`, 'erro');
    if (!lancs.length) return setMsg('Nada a gravar neste mês.', 'erro');
    setMsg('Gravando…', '');
    try {
      const j = await A.chamar({ action: 'admRelLancar', ano: E.ano, lancamentos: lancs });
      E.dados[E.ano] = await A.chamar({ action: 'admRelDados', ano: E.ano }); iniciar();
      E.msg = { t: `Gravado ${icone('check')} (${j.gravados} linha(s) alterada(s))`, cls: 'ok' }; desenhar();
    } catch (e) { if (A.logado) setMsg('Não gravou: ' + e.message, 'erro'); }
  }
  function montar() {
    const r = A.el('div', 'pn-rg adm-rel'); r.id = 'pn-rg';
    r.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'pn-rg-ano' || t.id === 'pn-rg-mes') {
        const novoAno = Number(r.querySelector('#pn-rg-ano').value); E.mes = Number(r.querySelector('#pn-rg-mes').value) || 1; E.msg = { t: '', cls: '' };
        if (novoAno !== E.ano) { E.ano = novoAno; E.L = null; carregar(); } else desenhar();
      }
    });
    r.addEventListener('input', e => {
      const t = e.target;
      if (t.classList.contains('pn-rg-in')) { (E.L[t.dataset.mes] = E.L[t.dataset.mes] || {})[t.dataset.chave] = t.value; setMsg('Alterações não gravadas.', ''); }
      else if (t.dataset.tab && t.dataset.campo) { E.listas[t.dataset.tab][t.dataset.mes][+t.dataset.i][t.dataset.campo] = t.value; setMsg('Alterações não gravadas.', ''); }
    });
    r.addEventListener('click', e => {
      const b = e.target.closest('[data-rg]'); if (!b) return;
      const a = b.dataset.rg, mm = pad2(E.mes);
      if (a === 'salvar') salvar();
      else if (a === 'add-linha') { const L = E.listas[b.dataset.tab] = E.listas[b.dataset.tab] || {}; (L[mm] = L[mm] || []).push({}); desenhar(); }
      else if (a === 'del-linha') { E.listas[b.dataset.tab][b.dataset.mes].splice(+b.dataset.i, 1); desenhar(); setMsg('Alterações não gravadas.', ''); }
      else if (a === 'add-mun') { const s = r.querySelector(`[data-mun-novo="${b.dataset.grupo}"]`); if (!s || !s.value) return; (E.munExtra[b.dataset.grupo] = E.munExtra[b.dataset.grupo] || new Set()).add(s.value); desenhar(); }
    });
    return r;
  }
  A.registrarAba({ id: 'relatorios', titulo: 'Linhas dos relatórios', render: c => {
    if (!E.raiz) E.raiz = montar();
    c.appendChild(E.raiz);
    if (!E.dados[E.ano]) { E.L = null; desenhar(); carregar(); } else desenhar();
  } });
  window.AdmRelatorios = { estado: () => ({ ano: E.ano, mes: E.mes, L: E.L, listas: E.listas }) };
})();
