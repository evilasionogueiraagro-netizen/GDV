/* Painel gerencial do GDV — aba "Convênios" (só administrador; não aparece no Modo TV). Convênio SUASA nº 991272/2025 – MAPA/ADAF:
   metas físicas por etapa (previsto, executado no mês, acumulado, % alcançado, esperado pelo tempo e situação), lançamentos manuais
   (etapas manuais, bens da 1.1 e ajustes das etapas automáticas), execução financeira (previsto × executado, CSV) e o relatório mensal
   (textos editáveis por etapa → Word .docx e PDF). Cálculos e conteúdo do relatório: ../documentos/conv-docs.js (ConvDocs);
   Word: js/docx.js (DocxMin); PDF: modelo ../documentos/conv-relatorio.html + ../js/pdf.js (o mesmo gerador do app de campo).
   O acumulado vem da action painelConvApuracao com o intervalo [início da execução, fim do mês escolhido] — independe do período
   carregado nas outras abas. Não usa o período nem os filtros do painel.
   Financeiro → "Importar planilha de movimentação (.xlsx)": lê o .xlsx no navegador (SheetJS em vendor/xlsx, carregada só no clique),
   js/conv-planilha.js (ConvPlanilha) monta a prévia e grava em lotes pela action painelConvFinImportar (idempotente pela chave).
   A coluna NOME da planilha nunca é lida. Metas: físico × financeiro por etapa (ConvDocs.fisicoFinanceiro). */
(() => {
  'use strict';
  if (typeof Painel === 'undefined' || typeof ConvDocs === 'undefined') return;
  const P = Painel, esc = P.esc, CD = ConvDocs, F = CD.fmt;
  const LS_VISAO = 'gdv.painel.conv.visao', LS_MES = 'gdv.painel.conv.mes';
  const VISOES = [['metas', 'Metas'], ['lanc', 'Lançamentos'], ['fin', 'Financeiro'], ['rel', 'Relatório']];
  const SELO = { adiantada: 'bom', ritmo: 'info', atrasada: 'serio' };
  const XLSX_SRC = 'vendor/xlsx/xlsx.mini.min.js', IMP_LOTE = 200;
  const E = { imp: null, raiz: null, dados: null, convId: '', mes: P.ls.get(LS_MES) || '', visao: P.ls.get(LS_VISAO) || 'metas', apur: {}, R: null, carregando: false, erro: '',
              abertos: new Set(), editando: null, editandoFin: null, relAberto: false, textos: null, numero: null, msg: {}, gerando: false };
  const cfg = () => E.dados ? (E.dados.convenios.find(c => c.id === E.convId) || E.dados.convenios[0]) : null;
  const hoje = () => P.hoje();
  const mesesDisponiveis = c => { const ate = hoje().slice(0, 7); const l = CD.mesesDe(c).filter(m => m <= ate); return l.length ? l : [CD.mesesDe(c)[0]]; };
  const chaveApur = (c, m) => `${c.id}|${CD.fimDoMes(m)}|${c.versao || 0}`;
  const etapa = id => cfg().etapas.find(e => e.id === id);
  const AUTO = ['pce', 'volante', 'bva'];
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : null; };
  const numSimples = v => { const s = String(v == null ? '' : v).trim(); if (!s) return null; const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(n) ? n : null; };

  /* ---------------- carga ---------------- */
  async function carregar(forcar) {
    if (E.carregando) return; E.carregando = true; E.erro = '';
    desenhar();
    try {
      if (!E.dados || forcar) {
        E.dados = await P.chamar({ action: 'painelConvenios' });
        if (!E.dados.convenios.some(c => c.id === E.convId)) E.convId = E.dados.convenios[0].id;
      }
      const c = cfg(), ms = mesesDisponiveis(c);
      if (!ms.includes(E.mes)) E.mes = ms[ms.length - 1];
      if (forcar) E.apur = {};
      const k = chaveApur(c, E.mes);
      if (!E.apur[k]) E.apur[k] = await P.chamar({ action: 'painelConvApuracao', convenio: c.id, de: c.inicioExecucao, ate: CD.fimDoMes(E.mes) });
    } catch (e) { E.erro = e.message; }
    finally { E.carregando = false; }
    recalcular(); desenhar();
  }
  function recalcular() {
    const c = cfg(); if (!c) { E.R = null; return; }
    const ap = E.apur[chaveApur(c, E.mes)];
    E.R = ap ? CD.calcular(c, ap, E.dados.lancamentos, E.dados.financeiro, E.mes, { hoje: hoje(), municipio: n => P.municipioNome(n) || n }) : null;
  }

  /* ---------------- estrutura ---------------- */
  function montar() {
    const r = P.el('div', 'pn-conv'); r.id = 'pn-conv';
    r.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'pn-conv-sel') { E.convId = t.value; E.textos = null; carregar(); }
      if (t.id === 'pn-conv-mes') { E.mes = t.value; P.ls.set(LS_MES, E.mes); E.textos = null; E.relAberto = false; carregar(); }
      if (t.id === 'pn-cl-etapa' || t.id === 'pn-cl-sub') ajustarFormLanc(t.id === 'pn-cl-etapa');
      if (t.id === 'pn-cf-etapa') ajustarFormFin();
      if (t.id === 'pn-conv-imp-arq' && t.files && t.files[0]) { lerPlanilha(t.files[0]); t.value = ''; }
      if (E.imp && t.closest && t.closest('#pn-conv-imp-previa')) {
        const op = E.imp.op, lid = t.dataset.lid;
        if (t.matches('[data-imp-data]')) { if (t.value) op.datas[lid] = t.value; else delete op.datas[lid]; }
        else if (t.matches('[data-imp-ign]')) { if (t.checked) op.ignorar[lid] = true; else delete op.ignorar[lid]; }
        else if (t.matches('[data-imp-rep]')) { if (t.checked) op.repetidos[lid] = true; else delete op.repetidos[lid]; }
        else if (t.matches('[data-imp-exc]')) { if (t.checked) op.excluir[t.dataset.id] = true; else delete op.excluir[t.dataset.id]; }
        else return;
        previaImp(); desenharImp();
      }
    });
    r.addEventListener('input', e => { if (e.target.closest('#pn-conv-rel-form')) { E.textosSujos = true; msg('rel', 'Alterações não salvas.', ''); } });
    r.addEventListener('click', e => {
      const b = e.target.closest('[data-conv]'); if (!b) return;
      const a = b.dataset.conv, id = b.dataset.id;
      if (a === 'visao') { E.visao = b.dataset.v; P.ls.set(LS_VISAO, E.visao); desenhar(); }
      else if (a === 'atualizar') carregar(true);
      else if (a === 'editar-conv') dialogoConfig();
      else if (a === 'lanc-editar') editarLanc(id);
      else if (a === 'lanc-excluir') excluir('lanc', id);
      else if (a === 'fin-editar') editarFin(id);
      else if (a === 'fin-excluir') excluir('fin', id);
      else if (a === 'lanc-cancelar') { E.editando = null; desenharVisao(); }
      else if (a === 'fin-cancelar') { E.editandoFin = null; desenharVisao(); }
      else if (a === 'imp-gravar') gravarImp();
      else if (a === 'imp-cancelar') { E.imp = null; desenharImp(); }
      else if (a === 'bem') { E.editando = null; desenharVisao(); preencherBem(id); }
      else if (a === 'rel-abrir') { E.relAberto = true; desenharVisao(); }
      else if (a === 'rel-salvar') salvarTextos();
      else if (a === 'rel-docx') gerar('docx');
      else if (a === 'rel-pdf') gerar('pdf');
      else if (a === 'rel-imprimir') gerar('imprimir');
      else if (a === 'rel-padrao') { if (confirm('Trocar todos os textos pelos textos-padrão do relatório de referência?')) { E.textos = { textos: JSON.parse(JSON.stringify(CD.TEXTOS_PADRAO)), numero: E.textos.numero, origem: 'padrao' }; desenharVisao(); } }
    });
    r.addEventListener('submit', e => {
      e.preventDefault();
      if (e.target.id === 'pn-conv-lanc-form') salvarLanc();
      if (e.target.id === 'pn-conv-fin-form') salvarFin();
    });
    r.addEventListener('toggle', e => {
      const d = e.target; if (!d.matches || !d.matches('details[data-etapa]')) return;
      if (d.open) { E.abertos.add(d.dataset.etapa); detalheEtapa(d); } else E.abertos.delete(d.dataset.etapa);
    }, true);
    return r;
  }
  function msg(k, t, cls) { E.msg[k] = { t, cls }; const el = E.raiz && E.raiz.querySelector(`[data-msg="${k}"]`); if (el) { el.textContent = t; el.className = 'pn-pub-msg' + (cls ? ' ' + cls : ''); } }
  const msgHtml = k => { const m = E.msg[k] || { t: '', cls: '' }; return `<span class="pn-pub-msg${m.cls ? ' ' + m.cls : ''}" data-msg="${k}" role="status">${esc(m.t)}</span>`; };

  function desenhar() {
    const r = E.raiz; if (!r) return;
    const c = cfg();
    if (!c) {
      r.innerHTML = `<div class="pn-cartao">${E.erro ? `<p class="pn-erro">Não foi possível ler os convênios: ${esc(E.erro)}</p>${/a[çc][ãa]o inv[áa]lida/i.test(E.erro) ? '<p class="pn-sub">O servidor ainda está com o <b>Code.gs antigo</b>. No Apps Script: cole o <code>Code.gs</code> novo, salve e crie uma <b>nova versão</b> da implantação.</p>' : ''}<button type="button" class="pn-btn" data-conv="atualizar">Tentar de novo</button>` : '<div class="pn-vazio">Carregando os convênios…</div>'}</div>`;
      return;
    }
    const ms = mesesDisponiveis(c), h = hoje();
    const prazo = Math.max(0, Math.min(1, P.diasEntre(c.vigencia.inicio, h) / P.diasEntre(c.vigencia.inicio, c.vigencia.fim)));
    r.innerHTML = `
      <div class="pn-cartao pn-conv-topo">
        <div class="pn-conv-sel">
          <label>Convênio<select id="pn-conv-sel">${E.dados.convenios.map(x => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.numero || x.id)}</option>`).join('')}</select></label>
          <label>Mês de referência<select id="pn-conv-mes">${ms.slice().reverse().map(m => `<option value="${m}" ${m === E.mes ? 'selected' : ''}>${esc(F.mes(m))}</option>`).join('')}</select></label>
          <div class="pn-conv-botoes"><button type="button" class="pn-btn" data-conv="atualizar">Atualizar</button><button type="button" class="pn-btn" data-conv="editar-conv" id="pn-conv-editar">Editar convênio</button></div>
        </div>
        <h3 class="pn-conv-nome">${esc(c.nome)}</h3>
        <p class="pn-sub">${esc(c.objeto)} · ${esc(c.meta)}</p>
        <dl class="pn-conv-ficha">
          <div><dt>Vigência</dt><dd>${F.data(c.vigencia.inicio)} a ${F.data(c.vigencia.fim)}</dd></div>
          <div><dt>Início da execução</dt><dd>${F.data(c.inicioExecucao)}</dd></div>
          <div><dt>Prazo decorrido</dt><dd>${F.pct(prazo)}<span class="pn-conv-barra mini" aria-hidden="true"><i style="width:${(prazo * 100).toFixed(1)}%"></i></span></dd></div>
          <div><dt>Valor global</dt><dd>${F.moeda(c.valores.global)}</dd></div>
        </dl>
      </div>
      <div class="pn-conv-nav" role="tablist" aria-label="Partes do convênio">${VISOES.map(([k, t]) => `<button type="button" class="pn-chip" role="tab" data-conv="visao" data-v="${k}" aria-pressed="${E.visao === k}" aria-selected="${E.visao === k}">${t}</button>`).join('')}</div>
      ${E.erro ? `<p class="pn-erro" role="alert">${esc(E.erro)}</p>` : ''}
      <div id="pn-conv-visao" class="pn-conv-visao${E.carregando ? ' carregando' : ''}"></div>`;
    desenharVisao();
  }
  function desenharVisao() {
    const v = E.raiz && E.raiz.querySelector('#pn-conv-visao'); if (!v) return;
    v.innerHTML = '';
    if (!E.R) { P.vazio(v, E.carregando ? 'Apurando as metas…' : 'Sem apuração.'); return; }
    if (E.visao === 'lanc') visaoLanc(v);
    else if (E.visao === 'fin') visaoFin(v);
    else if (E.visao === 'rel') visaoRel(v);
    else visaoMetas(v);
  }

  /* ---------------- Metas ---------------- */
  const barra = (pct, esp) => `<div class="pn-conv-barra" role="img" aria-label="Executado ${F.pct(pct)}; esperado ${F.pct(esp)}"><i style="width:${Math.min(100, pct * 100).toFixed(1)}%"></i><b style="left:${Math.min(100, esp * 100).toFixed(1)}%" title="Esperado pelo tempo: ${F.pct(esp)}"></b></div>`;
  function visaoMetas(v) {
    const R = E.R, c = R.cfg;
    const n = s => R.etapas.filter(r => r.situacao === s).length;
    P.kpis(v, [
      { rotulo: 'Etapas no ritmo ou adiantadas', valor: `${n('ritmo') + n('adiantada')} de ${R.etapas.length}`, status: n('atrasada') ? null : 'bom' },
      { rotulo: 'Etapas atrasadas', valor: n('atrasada'), detalhe: '> 5 p.p. abaixo do esperado', status: R.alertas.some(a => a.nivel === 'serio') ? 'serio' : n('atrasada') ? 'atencao' : null },
      { rotulo: 'Esperado pelo tempo', valor: F.pct(R.esperado), detalhe: `fim de ${F.mes(R.mes)} (linear até ${F.data(c.vigencia.fim)})` },
      { rotulo: 'Execução financeira', valor: F.pct(R.fin.total.pct), detalhe: `${F.moeda(R.fin.total.acum)} de ${F.moeda(R.fin.total.previsto)}` },
      { rotulo: 'Financeiro à frente do físico', valor: `${R.ff.frente} de ${R.etapas.length}`, detalhe: `etapas com gasto > ${Math.round(CD.FF_ALERTA * 100)} p.p. acima do % físico`, status: R.ff.frente ? 'atencao' : 'bom' },
      { rotulo: 'Diárias usadas', valor: `${F.num(R.ff.diariasUsadas, 1)} de ${F.int(R.ff.diariasPrev)}`, detalhe: `${F.pct(R.ff.diariasPct)} das diárias previstas · ${F.moeda(R.ff.valorDiarias)} de ${F.moeda(R.ff.valorDiariasPrev)}` }
    ]);
    const sa = P.secao(v, 'Alertas', `Etapa atrasada mais de 15 p.p. do esperado e mês sem nenhum registro numa etapa automática (${F.mes(R.mes)}).`);
    P.alertas(sa, R.alertas, { vazio: 'Nenhum alerta neste mês. ✓' });
    secaoFisFin(v);
    const sm = P.secao(v, `Metas físicas — ${F.mes(R.mes)}`, 'Acumulado desde o início da execução. A marca na barra é o esperado pelo tempo decorrido. Abra uma etapa para ver a quebra por município/BVA/sub-meta e o gráfico mensal.');
    const g = P.el('div', 'pn-conv-etapas'); sm.appendChild(g);
    R.etapas.forEach(r => {
      const card = P.el('article', 'pn-cartao pn-conv-etapa'); card.dataset.etapa = r.id;
      const cls = r.situacao === 'atrasada' && Math.min(1, r.pct) < r.esperado - 0.15 ? 'critico' : SELO[r.situacao];
      card.innerHTML = `<div class="pn-conv-etapa-cab"><h3><span class="pn-conv-id">${esc(r.id)}</span> ${esc(r.nomeCurto)}</h3><span class="pn-selo ${cls}">${esc(r.situacaoTxt)}</span></div>
        <div class="pn-conv-pct"><b>${F.pct(r.pct)}</b><span>${r.media ? 'média das sub-metas' : 'da meta'} · esperado ${F.pct(r.esperado)}</span></div>
        ${barra(r.pct, r.esperado)}
        <dl class="pn-conv-nums"><div><dt>Previsto</dt><dd>${esc(r.previstoTxt)}</dd></div><div><dt>No mês</dt><dd>${esc(r.mesTxt)}</dd></div><div><dt>Acumulado</dt><dd>${esc(r.acumTxt)}</dd></div></dl>
        <p class="pn-conv-ff" data-ff="${esc(r.id)}"><span>Financeiro <b>${F.pct(r.ff.financeiro)}</b></span>${r.ff.diarias.previstas ? `<span>Diárias <b>${F.num(r.ff.diarias.usadas, 1)}</b> de ${F.int(r.ff.diarias.previstas)}</span>` : ''}<span class="pn-selo ${SELO_FF[r.ff.situacao]}">${esc(r.ff.situacaoTxt)}${r.ff.situacao === 'semgasto' ? '' : ` (${r.ff.difPP > 0 ? '+' : ''}${F.num(r.ff.difPP, 1)} p.p.)`}</span></p>
        <p class="pn-sub pn-conv-apur">${r.auto ? 'Apuração automática (e-GDV)' : r.apuracao === 'bens' ? 'Situação dos bens (lançamento manual)' : 'Lançamento manual no painel'}${r.ajustes.length ? ` · ${r.ajustes.length} ajuste(s)` : ''}</p>`;
      const d = P.el('details', 'pn-conv-det'); d.dataset.etapa = r.id;
      d.innerHTML = `<summary>Detalhes e gráfico</summary><div class="pn-conv-det-corpo"></div>`;
      card.appendChild(d); g.appendChild(card);
      if (E.abertos.has(r.id)) { d.open = true; detalheEtapa(d); }
    });
  }
  const SELO_FF = { financeiro: 'atencao', equilibrado: 'bom', fisico: 'info', semgasto: 'info' };
  const projTxt = x => x.situacao === 'esgotado' ? 'saldo esgotado' : x.situacao === 'semritmo' ? 'sem gasto nos últimos 3 meses' : x.situacao === 'semprevisto' ? '—'
    : x.antes ? `acaba em ${F.mes(x.mesFim)} (antes do fim da vigência)` : x.meses > 60 ? 'dura além do fim da vigência' : `acaba em ${F.mes(x.mesFim)} (depois do fim da vigência)`;
  /** Físico × financeiro por etapa: % físico, % financeiro, diferença, diárias, custo por unidade e projeção do saldo. */
  function secaoFisFin(v) {
    const R = E.R, c = R.cfg;
    const s = P.secao(v, 'Físico × financeiro', `% físico (acumulado ÷ meta, até 100%) × % financeiro (gasto acumulado ÷ previsto da etapa). Diferença acima de ${Math.round(CD.FF_ALERTA * 100)} p.p. = financeiro à frente (alerta). Projeção: no ritmo médio dos últimos 3 meses, quando o saldo acaba × fim da vigência (${F.data(c.vigencia.fim)}).`);
    P.tabela(s, [
      { chave: 'rotulo', rotulo: 'Etapa' },
      { chave: 'fis', rotulo: '% físico', num: true, fmt: F.pct, csv: x => Math.round(x * 10000) / 100 },
      { chave: 'fin', rotulo: '% financeiro', num: true, fmt: F.pct, csv: x => Math.round(x * 10000) / 100 },
      { chave: 'dif', rotulo: 'Dif. (p.p.)', num: true, fmt: x => (x > 0 ? '+' : '') + F.num(x, 1) },
      { chave: 'sit', rotulo: 'Situação', html: (x, l) => `<span class="pn-selo ${SELO_FF[l.sitK]}">${esc(x)}</span>`, csv: x => x },
      { chave: 'diarias', rotulo: 'Diárias usadas / previstas', fmt: x => x || '—' },
      { chave: 'custoReal', rotulo: 'Custo por unidade', num: true, fmt: (x, l) => x == null ? '—' : `${F.moeda(x)} / ${l.unidade}` },
      { chave: 'custoPrev', rotulo: 'Previsto por unidade', num: true, fmt: F.moeda },
      { chave: 'razao', rotulo: 'Real ÷ previsto', num: true, fmt: x => x == null ? '—' : F.num(x, 2) + '×' },
      { chave: 'proj', rotulo: 'Projeção do saldo', fmt: x => x }
    ], R.etapas.map(r => { const f = r.ff; return { rotulo: `${r.id} ${r.nomeCurto}`, fis: f.fisico, fin: f.financeiro, dif: f.difPP, sit: f.situacaoTxt, sitK: f.situacao,
      diarias: f.diarias.previstas ? `${F.num(f.diarias.usadas, 1)} de ${F.int(f.diarias.previstas)} (${F.pct(f.diarias.pct)})` : '', custoReal: f.custo.real, custoPrev: f.custo.previsto,
      unidade: r.unidade, razao: f.custo.razao, proj: projTxt(f.projecao) }; }), { id: 'conv-fisfin', csv: `convenio-${c.id}-fisico-financeiro.csv`, limite: 20, busca: false });
  }
  function detalheEtapa(d) {
    const r = E.R && E.R.etapas.find(x => x.id === d.dataset.etapa); if (!r) return;
    const corpo = d.querySelector('.pn-conv-det-corpo'); corpo.innerHTML = '';
    corpo.appendChild(P.el('p', 'pn-sub', esc(r.memoria)));
    const cols = r.apuracao === 'pce'
      ? [{ chave: 'rotulo', rotulo: 'Município' }, { chave: 'mes', rotulo: 'Prop. no mês', num: true, fmt: F.int }, { chave: 'acum', rotulo: 'Prop. acum.', num: true, fmt: F.int },
         { chave: 'registros', rotulo: 'Registros', num: true, fmt: F.int }, { chave: 'primeiro', rotulo: '1º registro', fmt: (v, l) => l.ajuste ? l.extra : F.data(v) }]
      : r.apuracao === 'bva'
        ? [{ chave: 'rotulo', rotulo: 'BVA' }, { chave: 'mes', rotulo: 'Veíc. no mês', num: true, fmt: F.int }, { chave: 'acum', rotulo: 'Veíc. acum.', num: true, fmt: F.int },
           { chave: 'tfs', rotulo: 'TFs', num: true, fmt: F.int }, { chave: 'apreensoes', rotulo: 'Apreensões', num: true, fmt: F.int }, { chave: 'rechacos', rotulo: 'Rechaços', num: true, fmt: F.int }]
        : r.apuracao === 'volante'
          ? [{ chave: 'rotulo', rotulo: 'Município' }, { chave: 'mes', rotulo: 'Ações no mês', num: true, fmt: F.int }, { chave: 'acum', rotulo: 'Ações acum.', num: true, fmt: F.int },
             { chave: 'tfs', rotulo: 'TFs', num: true, fmt: F.int }, { chave: 'veiculos', rotulo: 'Veículos', num: true, fmt: F.int }]
          : [{ chave: 'rotulo', rotulo: r.apuracao === 'bens' ? 'Bem' : 'Sub-meta' }, { chave: 'previsto', rotulo: 'Previsto', num: true, fmt: v => v == null ? '—' : F.int(v) },
             { chave: 'mes', rotulo: 'No mês', num: true, fmt: F.int }, { chave: 'acum', rotulo: 'Acum.', num: true, fmt: F.int },
             { chave: 'pct', rotulo: '%', num: true, fmt: v => v == null ? '—' : F.pct(v) }, { chave: 'extra', rotulo: 'Detalhe', fmt: v => v || '—' }];
    P.tabela(corpo, cols, r.linhas, { id: 'conv-quebra-' + r.id, simples: true, limite: 60, vazio: 'Nenhum registro até este mês.' });
    const p = P.paleta, rot = r.serie.map(s => F.mesCurto(s.mes));
    const tracejada = { type: 'line', borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 4, cor: p.eixo, backgroundColor: 'transparent' };
    const ds = r.media
      ? [{ type: 'line', label: 'Acumulado (% da meta)', data: r.serie.map(s => +s.acum.toFixed(1)), cor: p.serie[0] }, { ...tracejada, label: 'Esperado pelo tempo (%)', data: r.serie.map(s => +s.esperado.toFixed(1)) }]
      : [{ label: 'Executado no mês', data: r.serie.map(s => s.valor), cor: p.serie[0] }, { type: 'line', label: 'Acumulado', data: r.serie.map(s => s.acum), cor: p.serie[1] },
         { ...tracejada, label: 'Esperado pelo tempo', data: r.serie.map(s => Math.round(s.esperado)) }];
    P.grafico(corpo, 'conv-graf-' + r.id, { type: r.media ? 'line' : 'bar', titulo: `Etapa ${r.id} por mês`, subtitulo: r.media ? '% da meta (média das sub-metas)' : `${r.unidade}; meta ${F.int(r.meta)}`,
      altura: 220, tabelaRotulo: 'Mês', data: { labels: rot, datasets: ds } });
    // físico × financeiro em % acumulado (um eixo só, em %): físico, financeiro e o esperado pelo tempo
    const ff = r.ff;
    P.grafico(corpo, 'conv-ff-' + r.id, { type: 'line', titulo: `Físico × financeiro (% acumulado) — etapa ${r.id}`,
      subtitulo: `financeiro ${F.pct(ff.financeiro)} × físico ${F.pct(ff.fisico)} · ${ff.situacaoTxt.toLowerCase()}`, altura: 220, tabelaRotulo: 'Mês',
      options: { scales: { y: { ticks: { color: p.eixo, padding: 6, callback: x => x + '%' } } } },
      data: { labels: rot, datasets: [{ label: 'Físico (% da meta)', data: ff.serie.map(s => +s.fisico.toFixed(1)), cor: p.serie[0] },
        { label: 'Financeiro (% do previsto)', data: ff.serie.map(s => +s.financeiro.toFixed(1)), cor: p.serie[1] },
        { ...tracejada, label: 'Esperado pelo tempo (%)', data: ff.serie.map(s => +s.esperado.toFixed(1)) }] } });
    corpo.appendChild(P.el('p', 'pn-sub', esc(`Custo por unidade: ${ff.custo.real == null ? 'sem execução física registrada' : `${F.moeda(ff.custo.real)} por unidade (${ff.custo.unidade})`} × previsto ${F.moeda(ff.custo.previsto)} (gasto ${F.moeda(ff.custo.gasto)} ÷ ${F.num(ff.custo.unidades, 1)} ${ff.custo.unidade}). Projeção da etapa: ${projTxt(ff.projecao)}${ff.projecao.ritmo ? `; ritmo ${F.moeda(ff.projecao.ritmo)}/mês` : ''}.`)));
    P.tabela(corpo, [{ chave: 'rotulo', rotulo: 'Item' }, { chave: 'previsto', rotulo: 'Previsto', num: true, fmt: F.moeda }, { chave: 'acum', rotulo: 'Gasto', num: true, fmt: F.moeda },
      { chave: 'pct', rotulo: '%', num: true, fmt: F.pct }, { chave: 'ritmo', rotulo: 'Ritmo (3 meses)', num: true, fmt: x => x ? F.moeda(x) + '/mês' : '—' },
      { chave: 'proj', rotulo: 'Saldo acaba', html: (x, l) => l.antes ? `<span class="pn-selo atencao">${esc(x)}</span>` : esc(x) }],
      ff.itens.map(it => ({ rotulo: `${it.id} ${it.nome}`, previsto: it.previsto, acum: it.acum, pct: it.pct, ritmo: it.ritmo, proj: projTxt(it), antes: it.antes })),
      { id: 'conv-proj-' + r.id, simples: true, limite: 20 });
  }

  /* ---------------- Lançamentos ---------------- */
  function visaoLanc(v) {
    const c = cfg(), R = E.R;
    const sf = P.secao(v, E.editando ? 'Editar lançamento' : 'Novo lançamento', 'Etapas manuais (1.3, 1.5, 1.14), situação dos bens (1.1) e ajustes +/− das etapas automáticas (1.4, 1.9, 1.10), com justificativa.');
    const form = P.el('form', 'pn-cartao pn-conv-form'); form.id = 'pn-conv-lanc-form'; form.noValidate = true;
    form.innerHTML = `
      <label class="pn-conv-campo">Etapa<select id="pn-cl-etapa">${c.etapas.map(e => `<option value="${esc(e.id)}">${esc(e.id)} – ${esc(e.nomeCurto || e.nome)}${AUTO.includes(e.apuracao) ? ' (ajuste)' : ''}</option>`).join('')}</select></label>
      <label class="pn-conv-campo" data-se="sub">Sub-meta<select id="pn-cl-sub"></select></label>
      <label class="pn-conv-campo" data-se="bem">Bem<select id="pn-cl-bem"></select></label>
      <label class="pn-conv-campo" data-se="sit">Situação<select id="pn-cl-sit">${Object.entries(CD.SIT_BEM).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
      <label class="pn-conv-campo" data-se="mun">Município<input id="pn-cl-mun" list="pn-conv-muns" maxlength="80" autocomplete="off"></label>
      <label class="pn-conv-campo">Data<input id="pn-cl-data" type="date" min="${c.vigencia.inicio}" max="${c.vigencia.fim}" value="${hoje() <= CD.fimDoMes(E.mes) && hoje() >= E.mes + '-01' ? hoje() : E.mes + '-01'}"></label>
      <label class="pn-conv-campo" data-se="qtd"><span id="pn-cl-qtd-rot">Quantidade</span><input id="pn-cl-qtd" inputmode="decimal" maxlength="12"></label>
      <label class="pn-conv-campo" data-se="arm">Nº de armadilhas<input id="pn-cl-arm" inputmode="numeric" maxlength="6"></label>
      <label class="pn-conv-campo" data-se="prop">Propriedades<input id="pn-cl-prop" inputmode="numeric" maxlength="6"></label>
      <label class="pn-conv-campo pn-conv-largo"><span id="pn-cl-desc-rot">Descrição / evidência</span><textarea id="pn-cl-desc" rows="2" maxlength="2000"></textarea></label>
      <label class="pn-conv-campo">Documento<input id="pn-cl-doc" maxlength="120" placeholder="Relatório, ofício, NF…"></label>
      <p class="pn-sub pn-conv-largo" id="pn-cl-dica"></p>
      <div class="pn-conv-acoes pn-conv-largo"><button type="submit" class="pn-btn pn-btn-prim" id="pn-cl-salvar">${E.editando ? 'Salvar alteração' : 'Lançar'}</button>
        ${E.editando ? '<button type="button" class="pn-btn" data-conv="lanc-cancelar">Cancelar edição</button>' : ''}${msgHtml('lanc')}</div>
      <datalist id="pn-conv-muns">${P.municipios.map(m => `<option value="${esc(m)}">`).join('')}</datalist>`;
    sf.appendChild(form);
    if (E.editando) preencherLanc(E.editando); else ajustarFormLanc(true);
    // bens da etapa 1.1
    const rb = R.etapas.find(r => r.apuracao === 'bens');
    if (rb) {
      const sb = P.secao(v, `Bens da etapa ${rb.id}`, `Situação em ${F.mes(R.mes)} (último lançamento de cada bem). Toque em “Atualizar” para lançar a nova situação.`);
      P.tabela(sb, [{ chave: 'nome', rotulo: 'Bem' }, { chave: 'local', rotulo: 'Unidade' }, { chave: 'sit', rotulo: 'Situação', html: (x, l) => `<span class="pn-selo ${l.exec ? 'bom' : l.sit === 'em_aquisicao' ? 'atencao' : 'info'}">${esc(CD.SIT_BEM[x] || x)}</span>` },
        { chave: 'data', rotulo: 'Data', fmt: v => v ? F.data(v) : '—' }, { chave: 'doc', rotulo: 'Documento', fmt: v => v || '—' },
        { chave: 'id', rotulo: '', html: x => `<button type="button" class="pn-btn pn-btn-mini" data-conv="bem" data-id="${esc(x)}">Atualizar</button>` }],
        rb.bens.map(x => ({ id: x.b.id, nome: x.b.nome, local: x.b.local, sit: x.sit, exec: x.exec, data: x.data, doc: x.doc })), { id: 'conv-bens', titulo: '', limite: 20, busca: false });
    }
    const sl = P.secao(v, 'Lançamentos', 'Todos os lançamentos do convênio (mais recentes primeiro). Excluir é lógico: a linha fica na planilha com quem excluiu.');
    const subNome = l => { const e = etapa(l.etapa); if (!e) return l.submeta; if (l.tipo === 'bem') { const b = (e.bens || []).find(x => x.id === l.submeta); return b ? `${b.nome} – ${b.local}` : l.submeta; }
      const s = (e.submetas || []).find(x => x.id === l.submeta); return s ? s.nome : (l.submeta || ''); };
    const lst = E.dados.lancamentos.filter(l => l.convenio === c.id).slice().sort((a, b) => b.data.localeCompare(a.data) || (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
    P.tabela(sl, [
      { chave: 'data', rotulo: 'Data', fmt: F.data }, { chave: 'etapa', rotulo: 'Etapa' },
      { chave: 'tipo', rotulo: 'Tipo', fmt: (v, l) => v === 'ajuste' ? 'Ajuste' : v === 'bem' ? 'Bem: ' + (CD.SIT_BEM[l.situacao] || l.situacao) : 'Execução' },
      { chave: 'submeta', rotulo: 'Sub-meta / município', fmt: (v, l) => { const n = subNome(l) || ''; return [n, l.municipio && !n.includes(l.municipio) ? l.municipio : ''].filter(Boolean).join(' · ') || '—'; } },
      { chave: 'quantidade', rotulo: 'Qtd.', num: true, fmt: (v, l) => l.tipo === 'bem' ? '—' : (v > 0 && l.tipo === 'ajuste' ? '+' : '') + F.num(v) },
      { chave: 'descricao', rotulo: 'Descrição', fmt: (v, l) => [v, l.armadilhas ? l.armadilhas + ' armadilhas' : '', l.propriedades ? l.propriedades + ' propriedades' : ''].filter(Boolean).join(' · ') || '—' },
      { chave: 'documento', rotulo: 'Documento', fmt: v => v || '—' }, { chave: 'usuario', rotulo: 'Por' },
      { chave: 'id', rotulo: 'Ações', html: x => `<span class="pn-conv-acoes-lin"><button type="button" class="pn-btn pn-btn-mini" data-conv="lanc-editar" data-id="${esc(x)}">Editar</button><button type="button" class="pn-btn pn-btn-mini pn-btn-encerrar" data-conv="lanc-excluir" data-id="${esc(x)}">Excluir</button></span>` }
    ], lst, { id: 'conv-lancamentos', csv: `convenio-${c.id}-lancamentos.csv`, limite: 30, vazio: 'Nenhum lançamento ainda.' });
  }
  function ajustarFormLanc(etapaMudou) {
    const f = E.raiz.querySelector('#pn-conv-lanc-form'); if (!f) return;
    const q = s => f.querySelector(s), e = etapa(q('#pn-cl-etapa').value), auto = AUTO.includes(e.apuracao), bens = e.apuracao === 'bens';
    if (etapaMudou) {
      q('#pn-cl-sub').innerHTML = (e.submetas || []).map(s => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join('');
      q('#pn-cl-bem').innerHTML = (e.bens || []).map(b => `<option value="${esc(b.id)}">${esc(b.nome)} – ${esc(b.local)}</option>`).join('');
    }
    const s = (e.submetas || []).find(x => x.id === q('#pn-cl-sub').value);
    const mostra = (k, sim) => { f.querySelector(`[data-se="${k}"]`).hidden = !sim; };
    mostra('sub', !bens && !auto && (e.submetas || []).length > 0); mostra('bem', bens); mostra('sit', bens); mostra('qtd', !bens);
    mostra('mun', !bens); mostra('arm', e.id === '1.3' && !auto && (!s || s.contagem !== 'municipios')); mostra('prop', !bens && !auto);
    if (s && !E.editando && (etapaMudou || !q('#pn-cl-mun').dataset.digitado)) q('#pn-cl-mun').value = s.municipio || '';
    q('#pn-cl-qtd-rot').textContent = auto ? 'Ajuste (+/−)' : `Quantidade${s ? ' (' + (s.contagem === 'municipios' ? 'levantamentos' : s.unidade) + ')' : ' (' + e.unidade + ')'}`;
    q('#pn-cl-desc-rot').textContent = auto ? 'Justificativa (obrigatória)' : 'Descrição / evidência';
    q('#pn-cl-dica').textContent = auto ? `Etapa apurada automaticamente pelo e-GDV. Use o ajuste só para registros que não estão no sistema (ex.: antes do e-GDV); negativo para corrigir.`
      : bens ? 'Lance cada mudança de situação do bem (em aquisição, adquirido, entregue). Adquirido ou entregue conta como executado.'
      : s && s.contagem === 'municipios' ? `Sub-meta contada por municípios distintos (${(s.municipios || []).join(', ')}); informe o município e as propriedades.` : '';
  }
  function preencherBem(id) {
    const f = E.raiz.querySelector('#pn-conv-lanc-form'); if (!f) return;
    const e = cfg().etapas.find(x => x.apuracao === 'bens'); f.querySelector('#pn-cl-etapa').value = e.id; ajustarFormLanc(true);
    f.querySelector('#pn-cl-bem').value = id; f.scrollIntoView({ block: 'start' }); f.querySelector('#pn-cl-sit').focus();
  }
  function editarLanc(id) { E.editando = id; E.visao = 'lanc'; desenharVisao(); const f = E.raiz.querySelector('#pn-conv-lanc-form'); if (f) f.scrollIntoView({ block: 'start' }); }
  function preencherLanc(id) {
    const l = E.dados.lancamentos.find(x => x.id === id), f = E.raiz.querySelector('#pn-conv-lanc-form'); if (!l || !f) return;
    const q = s => f.querySelector(s);
    q('#pn-cl-etapa').value = l.etapa; ajustarFormLanc(true);
    if (l.tipo === 'bem') { q('#pn-cl-bem').value = l.submeta; q('#pn-cl-sit').value = l.situacao; } else q('#pn-cl-sub').value = l.submeta;
    ajustarFormLanc(false);
    q('#pn-cl-mun').value = l.municipio || ''; q('#pn-cl-data').value = l.data; q('#pn-cl-qtd').value = l.tipo === 'bem' ? '' : String(l.quantidade).replace('.', ',');
    q('#pn-cl-arm').value = l.armadilhas == null ? '' : l.armadilhas; q('#pn-cl-prop').value = l.propriedades == null ? '' : l.propriedades;
    q('#pn-cl-desc').value = l.descricao || ''; q('#pn-cl-doc').value = l.documento || '';
  }
  async function salvarLanc() {
    const f = E.raiz.querySelector('#pn-conv-lanc-form'), q = s => f.querySelector(s), e = etapa(q('#pn-cl-etapa').value);
    const bens = e.apuracao === 'bens', auto = AUTO.includes(e.apuracao);
    const l = { id: E.editando || '', convenio: cfg().id, etapa: e.id, tipo: bens ? 'bem' : auto ? 'ajuste' : 'execucao', data: q('#pn-cl-data').value,
      submeta: bens ? q('#pn-cl-bem').value : auto ? '' : q('#pn-cl-sub').value, situacao: bens ? q('#pn-cl-sit').value : '',
      municipio: bens ? '' : q('#pn-cl-mun').value.trim(), quantidade: bens ? 1 : numSimples(q('#pn-cl-qtd').value),
      armadilhas: q('[data-se="arm"]').hidden ? '' : numSimples(q('#pn-cl-arm').value), propriedades: q('[data-se="prop"]').hidden ? '' : numSimples(q('#pn-cl-prop').value),
      descricao: q('#pn-cl-desc').value.trim(), documento: q('#pn-cl-doc').value.trim() };
    if (!bens && (l.quantidade == null || (!auto && !(l.quantidade > 0)) || l.quantidade === 0)) return msg('lanc', auto ? 'Informe o ajuste (ex.: 3 ou -2).' : 'Informe a quantidade (maior que zero).', 'erro');
    if (auto && l.descricao.length < 5) return msg('lanc', 'Ajuste exige justificativa.', 'erro');
    const b = q('#pn-cl-salvar'); b.disabled = true; msg('lanc', 'Salvando…', '');
    try {
      const j = await P.chamar({ action: 'painelConvLancar', lancamento: l });
      const i = E.dados.lancamentos.findIndex(x => x.id === j.lancamento.id);
      if (i >= 0) E.dados.lancamentos[i] = j.lancamento; else E.dados.lancamentos.push(j.lancamento);
      E.editando = null; E.msg.lanc = { t: `Lançado ✓ (etapa ${e.id})`, cls: 'ok' };
      recalcular(); desenharVisao();
    } catch (err) { if (!P.logado) return; msg('lanc', 'Não salvou: ' + err.message, 'erro'); b.disabled = false; }
  }
  async function excluir(tipo, id) {
    if (!confirm('Excluir este lançamento? (fica registrado na planilha como excluído)')) return;
    try {
      await P.chamar({ action: tipo === 'fin' ? 'painelConvFinExcluir' : 'painelConvExcluir', id });
      const lista = tipo === 'fin' ? E.dados.financeiro : E.dados.lancamentos, i = lista.findIndex(x => x.id === id); if (i >= 0) lista.splice(i, 1);
      E.msg[tipo === 'fin' ? 'fin' : 'lanc'] = { t: 'Excluído ✓', cls: 'ok' };
      recalcular(); desenharVisao();
    } catch (err) { if (P.logado) alert('Não excluiu: ' + err.message); }
  }

  /* ---------------- Financeiro ---------------- */
  function visaoFin(v) {
    const c = cfg(), Fn = E.R.fin;
    P.kpis(v, [
      { rotulo: 'Executado acumulado', valor: F.moeda(Fn.total.acum), detalhe: `${F.pct(Fn.total.pct)} de ${F.moeda(Fn.total.previsto)}` },
      { rotulo: `Executado em ${F.mes(E.mes)}`, valor: F.moeda(Fn.total.mes) },
      { rotulo: 'Saldo', valor: F.moeda(Fn.total.saldo) },
      { rotulo: 'Repasse × contrapartida', valor: `${F.pct(Fn.fonte.concedente.pct)} · ${F.pct(Fn.fonte.contrapartida.pct)}`,
        detalhe: `repasse ${F.moeda(Fn.fonte.concedente.acum)} de ${F.moeda(Fn.fonte.concedente.previsto)}; contrapartida ${F.moeda(Fn.fonte.contrapartida.acum)} de ${F.moeda(Fn.fonte.contrapartida.previsto)}` }
    ]);
    secaoImp(v);
    const colsFin = primeira => [{ chave: 'rotulo', rotulo: primeira }, { chave: 'previsto', rotulo: 'Previsto', num: true, fmt: F.moeda }, { chave: 'mes', rotulo: 'No mês', num: true, fmt: F.moeda },
      { chave: 'acum', rotulo: 'Acumulado', num: true, fmt: F.moeda }, { chave: 'saldo', rotulo: 'Saldo', num: true, fmt: F.moeda },
      { chave: 'pct', rotulo: '% exec.', num: true, html: (x) => `<span class="pn-conv-pctcel">${F.pct(x)}<span class="pn-conv-barra mini" aria-hidden="true"><i style="width:${Math.min(100, x * 100).toFixed(1)}%"></i></span></span>`, csv: x => Math.round(x * 10000) / 100 }];
    const sp = P.secao(v, 'Previsto × executado', `Plano de aplicação × lançamentos até ${F.mes(E.mes)}. Totais: custeio ${F.moeda(c.valores.repasseCusteio)}, investimento ${F.moeda(c.valores.repasseInvestimento + c.valores.contrapartida)}.`);
    P.tabela(sp, colsFin('Etapa'), Fn.etapas.map(x => ({ rotulo: `${x.id} ${x.nome}`, previsto: x.previsto, mes: x.mes, acum: x.acum, saldo: x.saldo, pct: x.pct })).concat([{ rotulo: 'TOTAL', ...Fn.total }]),
      { id: 'conv-fin-etapa', titulo: 'Por etapa', csv: `convenio-${c.id}-financeiro-etapa.csv`, limite: 20, busca: false });
    P.tabela(sp, colsFin('Natureza'), Fn.naturezas.map(x => ({ rotulo: `${x.natureza} – ${x.nome}`, previsto: x.previsto, mes: x.mes, acum: x.acum, saldo: x.saldo, pct: x.pct })),
      { id: 'conv-fin-nat', titulo: 'Por natureza de despesa', csv: `convenio-${c.id}-financeiro-natureza.csv`, limite: 20, busca: false });
    const sf = P.secao(v, E.editandoFin ? 'Editar lançamento financeiro' : 'Novo lançamento financeiro', 'Empenho, nota fiscal, PCDP ou ordem bancária. Não informe CPF do favorecido.');
    const form = P.el('form', 'pn-cartao pn-conv-form'); form.id = 'pn-conv-fin-form'; form.noValidate = true;
    form.innerHTML = `
      <label class="pn-conv-campo">Etapa<select id="pn-cf-etapa">${c.etapas.map(e => `<option value="${esc(e.id)}">${esc(e.id)} – ${esc(e.nomeCurto || e.nome)}</option>`).join('')}</select></label>
      <label class="pn-conv-campo pn-conv-largo2">Item do plano<select id="pn-cf-item"></select></label>
      <label class="pn-conv-campo">Data<input id="pn-cf-data" type="date" min="${c.vigencia.inicio}" max="${c.vigencia.fim}" value="${hoje() <= CD.fimDoMes(E.mes) && hoje() >= E.mes + '-01' ? hoje() : E.mes + '-01'}"></label>
      <label class="pn-conv-campo">Quantidade<input id="pn-cf-qtd" inputmode="decimal" maxlength="12"></label>
      <label class="pn-conv-campo">Valor (R$)<input id="pn-cf-valor" inputmode="decimal" maxlength="16" placeholder="0,00"></label>
      <label class="pn-conv-campo">Fonte<select id="pn-cf-fonte"><option value="concedente">Repasse (concedente)</option><option value="contrapartida">Contrapartida</option></select></label>
      <label class="pn-conv-campo">Documento<input id="pn-cf-doc" maxlength="120" placeholder="Nº empenho / NF / PCDP / OB"></label>
      <label class="pn-conv-campo pn-conv-largo">Descrição<textarea id="pn-cf-desc" rows="2" maxlength="1000"></textarea></label>
      <div class="pn-conv-acoes pn-conv-largo"><button type="submit" class="pn-btn pn-btn-prim" id="pn-cf-salvar">${E.editandoFin ? 'Salvar alteração' : 'Lançar'}</button>
        ${E.editandoFin ? '<button type="button" class="pn-btn" data-conv="fin-cancelar">Cancelar edição</button>' : ''}${msgHtml('fin')}</div>`;
    sf.appendChild(form);
    ajustarFormFin();
    if (E.editandoFin) {
      const l = E.dados.financeiro.find(x => x.id === E.editandoFin);
      if (l) { const q = s => form.querySelector(s); q('#pn-cf-etapa').value = l.etapa; ajustarFormFin(); q('#pn-cf-item').value = l.item; q('#pn-cf-data').value = l.data;
        q('#pn-cf-qtd').value = l.quantidade == null ? '' : String(l.quantidade).replace('.', ','); q('#pn-cf-valor').value = F.num(l.valor, 2).replace(/\./g, '');
        q('#pn-cf-fonte').value = l.fonte; q('#pn-cf-doc').value = l.documento || ''; q('#pn-cf-desc').value = l.descricao || ''; }
    }
    const sl = P.secao(v, 'Lançamentos financeiros', 'Todos os lançamentos (mais recentes primeiro).');
    const itemNome = l => { const e = etapa(l.etapa), it = e && (e.itens || []).find(x => x.id === l.item); return it ? `${it.id} ${it.nome}` : l.item; };
    const lst = E.dados.financeiro.filter(l => l.convenio === c.id).slice().sort((a, b) => b.data.localeCompare(a.data) || (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
    P.tabela(sl, [{ chave: 'data', rotulo: 'Data', fmt: F.data }, { chave: 'etapa', rotulo: 'Etapa' }, { chave: 'item', rotulo: 'Item', fmt: (v, l) => itemNome(l) },
      { chave: 'natureza', rotulo: 'Natureza' }, { chave: 'quantidade', rotulo: 'Qtd.', num: true, fmt: v => v == null ? '—' : F.num(v) },
      { chave: 'valor', rotulo: 'Valor', num: true, fmt: F.moeda, csv: v => v }, { chave: 'documento', rotulo: 'Documento', fmt: v => v || '—' },
      { chave: 'fonte', rotulo: 'Fonte', fmt: v => v === 'contrapartida' ? 'Contrapartida' : 'Repasse' }, { chave: 'descricao', rotulo: 'Descrição', fmt: v => v || '—' },
      { chave: 'origem', rotulo: 'Origem', fmt: (v, l) => v === 'planilha' ? `Planilha${l.importadoEm ? ' ' + F.data(new Date(l.importadoEm - 4 * 3600e3).toISOString()) : ''}` : 'Manual' }, { chave: 'usuario', rotulo: 'Por' },
      { chave: 'id', rotulo: 'Ações', csv: () => '', html: x => `<span class="pn-conv-acoes-lin"><button type="button" class="pn-btn pn-btn-mini" data-conv="fin-editar" data-id="${esc(x)}">Editar</button><button type="button" class="pn-btn pn-btn-mini pn-btn-encerrar" data-conv="fin-excluir" data-id="${esc(x)}">Excluir</button></span>` }],
      lst, { id: 'conv-fin-lanc', csv: `convenio-${c.id}-financeiro-lancamentos.csv`, limite: 30, vazio: 'Nenhum lançamento financeiro ainda.' });
  }
  /* ---------------- importação da planilha de movimentação ---------------- */
  function secaoImp(v) {
    const s = P.secao(v, 'Importar planilha de movimentação', 'Planilha do gestor (.xlsx; uma aba "SUBETAPA x.y.z" por item do plano). Lida aqui no navegador; a coluna NOME não é lida nem enviada. Pode repetir todo mês: o que já foi importado não duplica.');
    const box = P.el('div', 'pn-cartao pn-conv-imp');
    box.innerHTML = `<div class="pn-conv-acoes"><label class="pn-btn pn-btn-prim pn-conv-imp-btn" for="pn-conv-imp-arq">📥 Importar planilha de movimentação (.xlsx)</label>
      <input type="file" id="pn-conv-imp-arq" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="pn-conv-imp-arq">${msgHtml('imp')}</div>
      <div id="pn-conv-imp-previa"></div>`;
    s.appendChild(box);
    desenharImp();
  }
  async function lerPlanilha(arq) {
    msg('imp', `Lendo ${arq.name}…`, '');
    try {
      if (!/\.xlsx$/i.test(arq.name)) throw new Error('escolha um arquivo .xlsx');
      if (arq.size > 15e6) throw new Error('arquivo grande demais (máx. 15 MB)');
      if (typeof window.XLSX === 'undefined') await script(XLSX_SRC);
      const wb = window.XLSX.read(new Uint8Array(await arq.arrayBuffer()), { type: 'array', cellFormula: false, cellHTML: false, cellText: false, cellStyles: false });
      const ext = ConvPlanilha.extrair(ConvPlanilha.abasDoLivro(window.XLSX, wb));     // só data, memo, tipo, subetapa e valor (sem NOME)
      E.imp = { arquivo: arq.name, ext, op: { datas: {}, ignorar: {}, repetidos: {}, excluir: {} }, P: null, resumo: null };
      previaImp();
      msg('imp', `${arq.name}: ${E.imp.P.totais.linhas} lançamento(s) em ${ext.abas.length} aba(s). Confira a prévia e grave.`, 'ok');
    } catch (e) { E.imp = null; msg('imp', 'Não foi possível ler a planilha: ' + e.message, 'erro'); }
    desenharImp();
  }
  function previaImp() { const c = cfg(); E.imp.P = ConvPlanilha.previa(E.imp.ext, c, E.dados.financeiro, E.imp.op); }
  const dataBR = d => d ? F.data(d) : '—';
  function desenharImp() {
    const box = E.raiz && E.raiz.querySelector('#pn-conv-imp-previa'); if (!box) return;
    box.innerHTML = '';
    if (E.impResumo) { const r = E.impResumo;
      box.appendChild(P.el('p', 'pn-conv-imp-resumo', esc(`Última importação (${r.arquivo}): ${r.novos} novo(s), ${r.atualizados} atualizado(s), ${r.iguais} igual(is) já no sistema, ${r.excluidos} excluído(s) — ${F.moeda(r.valor)} gravados.`))); }
    if (!E.imp) return;
    const X = E.imp.P, T = X.totais, c = cfg();
    const pv = P.el('div', 'pn-conv-imp-pv'); pv.id = 'pn-conv-imp-pv'; box.appendChild(pv);
    pv.appendChild(P.el('h3', null, esc(`Prévia — ${E.imp.arquivo}`)));
    P.kpis(pv, [
      { rotulo: 'Na planilha', valor: F.moeda(T.valorPlanilha), detalhe: `${T.linhas} lançamento(s)${X.abasIgnoradas.length ? ` · abas fora: ${X.abasIgnoradas.join(', ')}` : ''}` },
      { rotulo: 'Novos', valor: T.novos, detalhe: 'serão gravados' }, { rotulo: 'Alterados', valor: T.alterados, detalhe: 'valor/data mudou: serão atualizados', status: T.alterados ? 'atencao' : null },
      { rotulo: 'Iguais', valor: T.iguais, detalhe: 'já importados (não duplica)' },
      { rotulo: 'A gravar', valor: F.moeda(T.valorGravar), detalhe: `${T.repetidasFora} repetido(s) fora · ${T.ignoradas} ignorado(s) · ${T.bloqueadas} bloqueado(s)`, status: T.bloqueadas ? 'serio' : null }
    ]);
    P.alertas(pv, X.avisos.map(a => ({ nivel: a.nivel, titulo: a.texto })), { vazio: 'Nenhum aviso. ✓', max: 12 });
    P.tabela(pv, [{ chave: 'rotulo', rotulo: 'Subetapa / item' }, { chave: 'previsto', rotulo: 'Previsto (plano)', num: true, fmt: F.moeda },
      { chave: 'cabExecutado', rotulo: 'Executado (cabeçalho)', num: true, fmt: F.moeda }, { chave: 'planilha', rotulo: 'Soma na planilha', num: true, fmt: F.moeda },
      { chave: 'gravar', rotulo: 'Importado', num: true, fmt: F.moeda }, { chave: 'sistema', rotulo: 'Já no sistema', num: true, fmt: F.moeda },
      { chave: 'novos', rotulo: 'Novos', num: true, fmt: F.int }, { chave: 'iguais', rotulo: 'Iguais', num: true, fmt: F.int }, { chave: 'alterados', rotulo: 'Alterados', num: true, fmt: F.int },
      { chave: 'diarias', rotulo: 'Diárias equiv.', num: true, fmt: (x, l) => `${F.num(x, 1)} de ${F.int(l.quantidadePrevista)}` },
      { chave: 'avisos', rotulo: 'Avisos', fmt: x => x.length ? x.join('; ') : '—' }],
      X.itens.map(y => Object.assign({ rotulo: `${y.id} ${y.nome}` }, y)), { id: 'conv-imp-itens', titulo: 'Por subetapa (item do plano)', limite: 40, busca: false, simples: false });
    if (X.soma) P.tabela(pv, [{ chave: 'etapa', rotulo: 'Etapa' }, { chave: 'soma', rotulo: 'Aba SOMA', num: true, fmt: F.moeda }, { chave: 'planilha', rotulo: 'Soma das abas', num: true, fmt: F.moeda },
      { chave: 'ok', rotulo: 'Confere', html: x => x ? '<span class="pn-selo bom">confere</span>' : '<span class="pn-selo atencao">diverge</span>' }],
      X.soma.etapas.concat([{ etapa: 'TOTAL', soma: X.soma.total.soma, planilha: X.soma.total.planilha, ok: X.soma.total.ok }]), { id: 'conv-imp-soma', titulo: 'Conferência com a aba SOMA', limite: 20, busca: false });
    // decisões: sem data, repetidos, bloqueados
    const dec = X.linhas.filter(l => !l.dataPlanilha || l.repetido || l.status === 'bloqueada');
    if (dec.length) {
      const d = P.el('div', 'pn-cartao pn-conv-imp-dec'); d.id = 'pn-conv-imp-dec';
      d.innerHTML = `<h3>Linhas que pedem decisão</h3><ul>${dec.map(l => {
        const id = esc(l.lid), base = `<b>${esc(l.aba)}</b>, linha ${l.linha} · memo ${esc(l.memo || '—')} · ${esc(l.tipo || '—')} · ${F.moeda(l.valor)}`;
        if (l.status === 'bloqueada' && l.bloqueio !== 'escolha a data') return `<li data-lid="${id}">${base} · data ${dataBR(l.data)} — <span class="pn-selo serio">bloqueada: ${esc(l.bloqueio)}</span></li>`;
        if (!l.dataPlanilha) return `<li data-lid="${id}">${base} — <span class="pn-selo atencao">sem data</span> <label>Data <input type="date" data-imp-data data-lid="${id}" min="${c.vigencia.inicio}" max="${c.vigencia.fim}" value="${esc(l.data || '')}"></label>
          <label><input type="checkbox" data-imp-ign data-lid="${id}" ${E.imp.op.ignorar[l.lid] ? 'checked' : ''}> ignorar</label></li>`;
        return `<li data-lid="${id}">${base} · data ${dataBR(l.data)} — <span class="pn-selo atencao">memorando repetido</span> <label><input type="checkbox" data-imp-rep data-lid="${id}" ${E.imp.op.repetidos[l.lid] ? 'checked' : ''}> importar mesmo assim</label></li>`;
      }).join('')}</ul>`;
      pv.appendChild(d);
    }
    if (X.ausentes.length) {
      const d = P.el('div', 'pn-cartao pn-conv-imp-dec'); d.id = 'pn-conv-imp-ausentes';
      d.innerHTML = `<h3>No sistema mas não na planilha</h3><p class="pn-sub">Importados antes e que não estão mais na planilha. Não são apagados sozinhos: marque para excluir.</p><ul>${X.ausentes.map(f =>
        `<li>${esc(f.item)} · ${esc(f.documento || '—')} · ${dataBR(f.data)} · ${F.moeda(f.valor)} <label><input type="checkbox" data-imp-exc data-id="${esc(f.id)}" ${f.excluir ? 'checked' : ''}> excluir</label></li>`).join('')}</ul>`;
      pv.appendChild(d);
    }
    const det = P.el('details', 'pn-conv-imp-linhas'); det.innerHTML = `<summary>Ver os ${T.linhas} lançamentos da planilha</summary>`; pv.appendChild(det);
    const ST = { novo: 'Novo', igual: 'Igual (já importado)', alterado: 'Alterado', repetida: 'Repetido (fora)', bloqueada: 'Bloqueado', ignorada: 'Ignorado' };
    P.tabela(det, [{ chave: 'aba', rotulo: 'Aba' }, { chave: 'linha', rotulo: 'Linha', num: true, fmt: F.int }, { chave: 'data', rotulo: 'Data', fmt: dataBR },
      { chave: 'memo', rotulo: 'Memo', fmt: x => x || '—' }, { chave: 'tipo', rotulo: 'Tipo', fmt: x => x || '—' }, { chave: 'sub', rotulo: 'Subetapa' },
      { chave: 'valor', rotulo: 'Valor', num: true, fmt: F.moeda }, { chave: 'quantidade', rotulo: 'Diárias', num: true, fmt: x => x == null ? '—' : F.num(x, 1) },
      { chave: 'status', rotulo: 'Situação', fmt: x => ST[x] || x }, { chave: 'avisos', rotulo: 'Avisos', fmt: (x, l) => [l.bloqueio].concat(x).filter(Boolean).join('; ') || '—' }],
      X.linhas, { id: 'conv-imp-linhas', limite: 30, simples: true });
    const n = X.envio.length, ac = P.el('div', 'pn-conv-acoes pn-conv-imp-acoes');
    ac.innerHTML = `<button type="button" class="pn-btn pn-btn-prim" data-conv="imp-gravar" id="pn-conv-imp-gravar" ${n || X.excluir.length ? '' : 'disabled'}>${n ? `Gravar ${n} lançamento(s)` : 'Nada novo para gravar'}${X.excluir.length ? ` e excluir ${X.excluir.length}` : ''}</button>
      <button type="button" class="pn-btn" data-conv="imp-cancelar">Cancelar</button>`;
    pv.appendChild(ac);
  }
  async function gravarImp() {
    if (!E.imp || E.imp.enviando) return;
    const X = E.imp.P, c = cfg(), lotes = [];
    for (let i = 0; i < X.envio.length; i += IMP_LOTE) lotes.push(X.envio.slice(i, i + IMP_LOTE));
    if (!lotes.length) lotes.push([]);
    const tot = { novos: 0, atualizados: 0, iguais: 0, excluidos: 0, valor: 0, arquivo: E.imp.arquivo };
    E.imp.enviando = true; const b = E.raiz.querySelector('#pn-conv-imp-gravar'); if (b) b.disabled = true;
    try {
      for (let i = 0; i < lotes.length; i++) {
        msg('imp', `Gravando… lote ${i + 1} de ${lotes.length}`, '');
        const j = await P.chamar({ action: 'painelConvFinImportar', convenio: c.id, arquivo: E.imp.arquivo, itens: lotes[i], excluir: i === lotes.length - 1 ? X.excluir : [] });
        ['novos', 'atualizados', 'iguais', 'excluidos'].forEach(k => { tot[k] += j[k] || 0; });
        tot.valor += (j.lancamentos || []).reduce((s, l) => s + Number(l.valor || 0), 0);
      }
      tot.iguais += X.totais.iguais;
      E.impResumo = tot; E.imp = null;
      msg('imp', `Importado ✓ ${tot.novos} novo(s), ${tot.atualizados} atualizado(s), ${tot.excluidos} excluído(s).`, 'ok');
      await carregar(true);
    } catch (err) {
      if (!P.logado) return;
      E.imp.enviando = false; msg('imp', 'Não gravou: ' + err.message + ' (o que já foi gravado não duplica ao repetir).', 'erro'); if (b) b.disabled = false;
    }
  }
  function ajustarFormFin() {
    const f = E.raiz.querySelector('#pn-conv-fin-form'); if (!f) return;
    const e = etapa(f.querySelector('#pn-cf-etapa').value);
    f.querySelector('#pn-cf-item').innerHTML = (e.itens || []).map(it => `<option value="${esc(it.id)}">${esc(it.id)} ${esc(it.nome)} (${esc(it.natureza)}; previsto ${F.moeda(it.total)})</option>`).join('');
    f.querySelector('#pn-cf-fonte').value = e.apuracao === 'bens' ? f.querySelector('#pn-cf-fonte').value : 'concedente';
  }
  function editarFin(id) { E.editandoFin = id; desenharVisao(); const f = E.raiz.querySelector('#pn-conv-fin-form'); if (f) f.scrollIntoView({ block: 'start' }); }
  async function salvarFin() {
    const f = E.raiz.querySelector('#pn-conv-fin-form'), q = s => f.querySelector(s);
    const valor = num(q('#pn-cf-valor').value);
    if (valor == null || valor === 0) return msg('fin', 'Informe o valor (ex.: 1.234,56).', 'erro');
    const l = { id: E.editandoFin || '', convenio: cfg().id, etapa: q('#pn-cf-etapa').value, item: q('#pn-cf-item').value, data: q('#pn-cf-data').value,
      quantidade: numSimples(q('#pn-cf-qtd').value), valor, fonte: q('#pn-cf-fonte').value, documento: q('#pn-cf-doc').value.trim(), descricao: q('#pn-cf-desc').value.trim() };
    const b = q('#pn-cf-salvar'); b.disabled = true; msg('fin', 'Salvando…', '');
    try {
      const j = await P.chamar({ action: 'painelConvFinLancar', lancamento: l });
      const i = E.dados.financeiro.findIndex(x => x.id === j.lancamento.id);
      if (i >= 0) E.dados.financeiro[i] = j.lancamento; else E.dados.financeiro.push(j.lancamento);
      E.editandoFin = null; E.msg.fin = { t: `Lançado ✓ (${F.moeda(j.lancamento.valor)})`, cls: 'ok' };
      recalcular(); desenharVisao();
    } catch (err) { if (!P.logado) return; msg('fin', 'Não salvou: ' + err.message, 'erro'); b.disabled = false; }
  }

  /* ---------------- Relatório ---------------- */
  function visaoRel(v) {
    const c = cfg(), R = E.R;
    if (!E.textos || E.textos.mes !== E.mes || E.textos.conv !== c.id) { E.textos = Object.assign(CD.textosIniciais(c, E.dados.relatorios, E.mes), { mes: E.mes, conv: c.id }); E.textosSujos = false; }
    const T = E.textos;
    const s0 = P.secao(v, `Relatório circunstancial — ${F.mes(E.mes)}`, 'Modelo do relatório parcial de referência: tabela-resumo e memória descritiva geradas pela apuração; textos por etapa editáveis.');
    const topo = P.el('div', 'pn-cartao pn-conv-rel-topo');
    topo.innerHTML = `<p>${T.salvo ? `Textos salvos para ${esc(F.mes(E.mes))}.` : T.origem === 'anterior' ? `Textos pré-preenchidos com o relatório de ${esc(F.mes(T.anterior))}.` : 'Textos pré-preenchidos com os do relatório parcial de referência.'}
      Executado: ${R.etapas.map(r => `<b>${esc(r.id)}</b> ${F.pct(r.pct)}`).join(' · ')}</p>
      ${E.relAberto ? '' : `<button type="button" class="pn-btn pn-btn-prim" data-conv="rel-abrir" id="pn-conv-rel-abrir">Gerar relatório de ${esc(F.mes(E.mes))}</button>`}`;
    s0.appendChild(topo);
    if (!E.relAberto) return;
    const form = P.el('form', 'pn-conv-rel-form'); form.id = 'pn-conv-rel-form'; form.noValidate = true;
    const ta = (id, rot, val, rows) => `<label class="pn-conv-campo pn-conv-largo">${esc(rot)}<textarea id="${id}" rows="${rows || 2}" maxlength="4000">${esc(val || '')}</textarea></label>`;
    form.innerHTML = `
      <div class="pn-cartao pn-conv-rel-num"><label class="pn-conv-campo">Parcial nº<input id="pn-cr-numero" inputmode="numeric" maxlength="2" value="${esc(T.numero)}"></label>
        <p class="pn-sub">Automático pela ordem do mês desde o início da execução (${esc(F.mes(c.inicioExecucao.slice(0, 7)))} = 1); pode mudar.</p></div>
      ${R.etapas.map(r => `<fieldset class="pn-cartao pn-conv-rel-etapa"><legend>Etapa ${esc(r.id)} – ${esc(r.nomeCurto)} <span class="pn-sub">${F.pct(r.pct)}</span></legend>
        <p class="pn-sub"><b>Execução registrada (automática):</b> ${esc(r.execTexto)}</p>
        ${Object.entries(CD.ROTULOS_TXT).map(([k, rot]) => ta(`pn-cr-${r.id.replace('.', '_')}-${k}`, rot, (T.textos.etapas[r.id] || {})[k])).join('')}</fieldset>`).join('')}
      <fieldset class="pn-cartao pn-conv-rel-etapa"><legend>Textos gerais</legend>
        ${Object.entries(CD.ROTULOS_GERAIS).map(([k, rot]) => ta(`pn-cr-g-${k}`, rot + (k === 'providencias' ? ' (uma por linha)' : ''), T.textos.gerais[k], 4)).join('')}</fieldset>
      <div class="pn-cartao pn-conv-rel-acoes">
        <button type="button" class="pn-btn" data-conv="rel-salvar" id="pn-cr-salvar">Salvar textos</button>
        <button type="button" class="pn-btn pn-btn-prim" data-conv="rel-docx" id="pn-cr-docx">Baixar Word (.docx)</button>
        <button type="button" class="pn-btn pn-btn-prim" data-conv="rel-pdf" id="pn-cr-pdf">Baixar PDF</button>
        <button type="button" class="pn-btn" data-conv="rel-imprimir" id="pn-cr-imprimir">Imprimir</button>
        <button type="button" class="pn-link" data-conv="rel-padrao">Usar textos-padrão</button>
        ${msgHtml('rel')}
      </div>`;
    s0.appendChild(form);
  }
  /** Textos da tela → {numero, textos}. */
  function lerTextos() {
    const f = E.raiz.querySelector('#pn-conv-rel-form'); if (!f) return { numero: E.textos.numero, textos: E.textos.textos };
    const val = id => { const el = f.querySelector('#' + id); return el ? el.value.trim() : ''; };
    const t = { etapas: {}, gerais: {} };
    E.R.etapas.forEach(r => { t.etapas[r.id] = {}; Object.keys(CD.ROTULOS_TXT).forEach(k => { t.etapas[r.id][k] = val(`pn-cr-${r.id.replace('.', '_')}-${k}`); }); });
    Object.keys(CD.ROTULOS_GERAIS).forEach(k => { t.gerais[k] = val(`pn-cr-g-${k}`); });
    const n = parseInt(val('pn-cr-numero'), 10);
    return { numero: n >= 1 && n <= 99 ? n : CD.numeroAuto(cfg(), E.mes), textos: t };
  }
  async function salvarTextos(silencioso) {
    const x = lerTextos(); E.textos.textos = x.textos; E.textos.numero = x.numero;
    if (!silencioso) msg('rel', 'Salvando…', '');
    try {
      const j = await P.chamar({ action: 'painelConvRelSalvar', convenio: cfg().id, mes: E.mes, numero: x.numero, textos: x.textos });
      const i = E.dados.relatorios.findIndex(r => r.id === j.relatorio.id);
      if (i >= 0) E.dados.relatorios[i] = j.relatorio; else E.dados.relatorios.push(j.relatorio);
      E.textos.salvo = true; E.textosSujos = false;
      msg('rel', silencioso ? 'Textos salvos ✓' : 'Salvo ✓', 'ok');
      return true;
    } catch (e) { if (P.logado) msg('rel', 'Textos não salvos: ' + e.message, 'erro'); return false; }
  }
  const nomeArq = (num, ext) => `Relatorio_Convenio_${cfg().numero.replace(/\W+/g, '-')}_Parcial_${num}_${E.mes}.${ext}`;
  function baixarBlob(blob, nome) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
  }
  const bytes = async url => new Uint8Array(await (await fetch(url)).arrayBuffer());
  const script = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { s.remove(); no(new Error('Não foi possível carregar ' + src)); }; document.head.appendChild(s); });
  async function moldePronto() {
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:0'; fr.title = 'Relatório';
    await new Promise((ok, no) => { fr.onload = ok; fr.onerror = no; fr.src = '../documentos/conv-relatorio.html'; document.body.appendChild(fr); });
    const w = fr.contentWindow; for (let i = 0; i < 50 && !w.ConvDocs; i++) await new Promise(r => setTimeout(r, 50));
    return fr;
  }
  /** Gera o relatório no formato pedido: docx (DocxMin), pdf (modelo HTML → js/pdf.js) ou imprimir (diálogo de impressão do navegador). */
  async function gerar(tipo) {
    if (E.gerando) return; E.gerando = true;
    const botoes = [...E.raiz.querySelectorAll('.pn-conv-rel-acoes button')]; botoes.forEach(b => { b.disabled = true; });
    try {
      const x = lerTextos();
      await salvarTextos(true);
      const B = CD.blocos(E.R, x.textos, { numero: x.numero, dataEmissao: hoje() });
      if (tipo === 'docx') {
        msg('rel', 'Gerando o Word…', '');
        const [cab, adaf, sepror] = await Promise.all([bytes('../img/brasao.png'), bytes('../img/logo-adaf.png'), bytes('../img/sepror.png')]);
        const blob = DocxMin.criar({ blocos: B, titulo: `${cfg().titulo} – Parcial ${x.numero} – ${F.mes(E.mes)}`, autor: P.usuario || 'e-GDV', cabecalho: cab, rodape: [adaf, sepror],
          cabecalhoTexto: ['GOVERNO DO ESTADO DO AMAZONAS', 'Agência de Defesa Agropecuária e Florestal do Estado do Amazonas – ADAF'] });
        baixarBlob(blob, nomeArq(x.numero, 'docx'));
        msg('rel', 'Word gerado ✓', 'ok');
      } else {
        msg('rel', tipo === 'pdf' ? 'Gerando o PDF…' : 'Abrindo a impressão…', '');
        const fr = await moldePronto(), w = fr.contentWindow, d = fr.contentDocument;
        w.ConvDocs.html(d, d.getElementById('corpo'), B);
        const nome = nomeArq(x.numero, 'pdf').replace(/\.pdf$/, '');
        d.title = nome;
        if (tipo === 'imprimir') {
          const titulo = document.title; document.title = nome;
          w.addEventListener('afterprint', () => { document.title = titulo; fr.remove(); });
          w.focus(); w.print(); msg('rel', '', '');
        } else {
          if (typeof window.html2canvas !== 'function') await script('../vendor/html2canvas.min.js');
          if (typeof PDF === 'undefined') await script('../js/pdf.js');      // const global do pdf.js (não fica em window)
          const arq = await PDF.deFrame(fr, nome);
          baixarBlob(arq, arq.name);
          msg('rel', 'PDF gerado ✓', 'ok');
        }
      }
    } catch (e) { msg('rel', 'Falha ao gerar: ' + e.message, 'erro'); }
    finally { E.gerando = false; botoes.forEach(b => { b.disabled = false; }); }
  }

  /* ---------------- Editar convênio ---------------- */
  function dialogoConfig() {
    const c = cfg(); if (!c) return;
    const velho = document.getElementById('pn-conv-cfg'); if (velho) velho.remove();
    const dlg = P.el('dialog', 'pn-dlg pn-conv-dlg'); dlg.id = 'pn-conv-cfg';
    const inp = (id, rot, v, extra) => `<label class="pn-conv-campo">${esc(rot)}<input id="${id}" value="${esc(v == null ? '' : v)}" ${extra || ''}></label>`;
    const bvasConhecidas = [...new Set(((typeof CONFIG !== 'undefined' && CONFIG.bvas) || []).map(b => b.nome).concat(((P.todos && P.todos.barreiras) || []).map(b => b.nome).filter(Boolean)))];
    const secEtapa = e => {
      let x = `<fieldset class="pn-conv-cfg-etapa" data-etapa="${esc(e.id)}"><legend>Etapa ${esc(e.id)}</legend>
        ${inp(`pn-cc-nome-${e.id.replace('.', '_')}`, 'Nome curto', e.nomeCurto, 'maxlength="80"')}
        ${inp(`pn-cc-meta-${e.id.replace('.', '_')}`, `Meta (${e.unidade})`, e.meta, 'inputmode="decimal" maxlength="10"')}`;
      if (e.apuracao === 'bva') {
        const todas = [...new Set(bvasConhecidas.concat(e.bvas || []))];
        x += `<div class="pn-conv-campo pn-conv-largo">BVAs fixas apuradas<div class="pn-conv-checks">${todas.map(b => `<label><input type="checkbox" data-bva value="${esc(b)}" ${(e.bvas || []).includes(b) ? 'checked' : ''}> ${esc(b)}</label>`).join('')}</div></div>`;
      }
      if (e.apuracao === 'volante') x += `<label class="pn-conv-campo pn-conv-largo">Municípios da barreira volante (um por linha)<textarea data-lista="municipios" rows="2">${esc((e.municipios || []).join('\n'))}</textarea></label>`;
      if (e.apuracao === 'pce') x += `<label class="pn-conv-campo pn-conv-largo">Nomes da praga nos registros do PCE (um por linha; basta conter)<textarea data-lista="pragas" rows="2">${esc((e.pragas || []).join('\n'))}</textarea></label>`;
      if (e.apuracao === 'manual') x += `<div class="pn-conv-campo pn-conv-largo">Sub-metas<div class="pn-conv-subs">${(e.submetas || []).map((s, i) => linhaSub(s, i)).join('')}</div>
        <button type="button" class="pn-btn pn-btn-mini" data-add-sub>Adicionar sub-meta</button></div>`;
      if ((e.itens || []).length) x += `<details class="pn-conv-largo"><summary>Plano de aplicação (previsto)</summary><div class="pn-conv-itens">${e.itens.map(it => `<div class="pn-conv-item" data-item="${esc(it.id)}"><span>${esc(it.id)} ${esc(it.nome)} <small>${esc(it.natureza)}</small></span>
        <label>Qtd.<input data-k="quantidade" inputmode="decimal" value="${esc(String(it.quantidade).replace('.', ','))}"></label><label>Unit. (R$)<input data-k="valorUnitario" inputmode="decimal" value="${esc(String(it.valorUnitario).replace('.', ','))}"></label>
        <label>Total (R$)<input data-k="total" inputmode="decimal" value="${esc(String(it.total).replace('.', ','))}"></label></div>`).join('')}</div></details>`;
      return x + '</fieldset>';
    };
    dlg.innerHTML = `<form method="dialog" class="pn-dlg-form" novalidate><h3>Editar convênio</h3>
      <div class="pn-conv-cfg-grade">
        ${inp('pn-cc-titulo', 'Título do relatório', c.titulo, 'maxlength="200"')}${inp('pn-cc-objeto', 'Objeto', c.objeto, 'maxlength="600"')}
        ${inp('pn-cc-meta', 'Meta', c.meta, 'maxlength="300"')}${inp('pn-cc-local', 'Local (assinatura)', c.local, 'maxlength="80"')}
        ${inp('pn-cc-vi', 'Vigência: início', c.vigencia.inicio, 'type="date"')}${inp('pn-cc-vf', 'Vigência: fim', c.vigencia.fim, 'type="date"')}
        ${inp('pn-cc-ie', 'Início da execução', c.inicioExecucao, 'type="date"')}
      </div>
      <fieldset class="pn-conv-cfg-etapa"><legend>Assinaturas</legend>${[0, 1, 2].map(i => `<div class="pn-conv-ass">${inp('pn-cc-an' + i, 'Nome ' + (i + 1), (c.assinaturas[i] || {}).nome, 'maxlength="100"')}${inp('pn-cc-ac' + i, 'Cargo', (c.assinaturas[i] || {}).cargo, 'maxlength="120"')}</div>`).join('')}</fieldset>
      ${c.etapas.map(secEtapa).join('')}
      <p class="pn-dlg-erro" id="pn-cc-erro" role="alert"></p>
      <div class="pn-dlg-botoes"><button type="button" class="pn-btn" id="pn-cc-cancelar">Cancelar</button><button type="submit" class="pn-btn pn-btn-prim" id="pn-cc-salvar">Salvar</button></div></form>`;
    document.body.appendChild(dlg);
    const q = s => dlg.querySelector(s);
    dlg.addEventListener('click', e => {
      const add = e.target.closest('[data-add-sub]'); if (add) { const box = add.parentNode.querySelector('.pn-conv-subs'); box.insertAdjacentHTML('beforeend', linhaSub({ nome: '', municipio: '', meta: '', contagem: 'soma' }, box.children.length)); }
      const rm = e.target.closest('[data-rm-sub]'); if (rm) rm.closest('.pn-conv-sub').remove();
    });
    q('#pn-cc-cancelar').onclick = () => dlg.close();
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('form').addEventListener('submit', async ev => {
      ev.preventDefault();
      const etapas = c.etapas.map(e => {
        const fs = dlg.querySelector(`fieldset[data-etapa="${e.id}"]`), o = { id: e.id, nomeCurto: fs.querySelector(`#pn-cc-nome-${e.id.replace('.', '_')}`).value, meta: numSimples(fs.querySelector(`#pn-cc-meta-${e.id.replace('.', '_')}`).value) };
        if (e.apuracao === 'bva') o.bvas = [...fs.querySelectorAll('[data-bva]:checked')].map(i => i.value);
        fs.querySelectorAll('[data-lista]').forEach(t => { o[t.dataset.lista] = t.value.split('\n').map(s => s.trim()).filter(Boolean); });
        if (e.apuracao === 'manual') o.submetas = [...fs.querySelectorAll('.pn-conv-sub')].map(d => ({ id: d.dataset.id || '', nome: d.querySelector('[data-k=nome]').value, municipio: d.querySelector('[data-k=municipio]').value,
          meta: d.querySelector('[data-k=meta]').value === '' ? null : numSimples(d.querySelector('[data-k=meta]').value), contagem: d.querySelector('[data-k=contagem]').value,
          unidade: d.dataset.unidade || '', municipios: d.dataset.municipios ? d.dataset.municipios.split('|') : [] }));
        o.itens = [...fs.querySelectorAll('[data-item]')].map(d => ({ id: d.dataset.item, quantidade: numSimples(d.querySelector('[data-k=quantidade]').value),
          valorUnitario: numSimples(d.querySelector('[data-k=valorUnitario]').value), total: numSimples(d.querySelector('[data-k=total]').value) }));
        return o;
      });
      const config = { titulo: q('#pn-cc-titulo').value, objeto: q('#pn-cc-objeto').value, meta: q('#pn-cc-meta').value, local: q('#pn-cc-local').value,
        vigencia: { inicio: q('#pn-cc-vi').value, fim: q('#pn-cc-vf').value }, inicioExecucao: q('#pn-cc-ie').value,
        assinaturas: [0, 1, 2].map(i => ({ nome: q('#pn-cc-an' + i).value, cargo: q('#pn-cc-ac' + i).value })), etapas };
      const b = q('#pn-cc-salvar'); b.disabled = true; b.textContent = 'Salvando…'; q('#pn-cc-erro').textContent = '';
      try {
        const j = await P.chamar({ action: 'painelConvSalvar', convenio: c.id, config });
        const i = E.dados.convenios.findIndex(x => x.id === c.id); E.dados.convenios[i] = j.config;
        dlg.close(); E.textos = null; carregar();
      } catch (err) { if (!P.logado) return; q('#pn-cc-erro').textContent = 'Não salvou: ' + err.message; b.disabled = false; b.textContent = 'Salvar'; }
    });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  const linhaSub = (s, i) => `<div class="pn-conv-sub" data-id="${esc(s.id || '')}" data-unidade="${esc(s.unidade || '')}" data-municipios="${esc((s.municipios || []).join('|'))}">
    <label>Nome<input data-k="nome" maxlength="120" value="${esc(s.nome || '')}"></label><label>Município<input data-k="municipio" maxlength="80" value="${esc(s.municipio || '')}"></label>
    <label>Meta<input data-k="meta" inputmode="decimal" maxlength="8" value="${esc(s.meta == null ? '' : s.meta)}"></label>
    <label>Conta<select data-k="contagem"><option value="soma" ${s.contagem !== 'municipios' ? 'selected' : ''}>Quantidade</option><option value="municipios" ${s.contagem === 'municipios' ? 'selected' : ''}>Municípios</option></select></label>
    <button type="button" class="pn-btn pn-btn-mini" data-rm-sub aria-label="Remover sub-meta ${i + 1}">Remover</button></div>`;

  /* ---------------- registro ---------------- */
  function render(c) {
    if (!E.raiz) { E.raiz = montar(); desenhar(); }
    c.appendChild(E.raiz);
    if (!E.dados && !E.carregando && !E.erro) carregar();
    else if (E.visao === 'metas' && E.R) desenharVisao();      // o painel destrói os gráficos a cada atualização: redesenha (sem perder formulários das outras partes)
  }
  P.aoSair(() => { if (E.raiz) E.raiz.remove(); Object.assign(E, { imp: null, impResumo: null, raiz: null, dados: null, apur: {}, R: null, erro: '', textos: null, editando: null, editandoFin: null, relAberto: false, msg: {} }); });
  P.registrarAba({ id: 'convenios', titulo: 'Convênios', render, semFiltros: true,
    contador: () => E.R ? E.R.alertas.filter(a => a.nivel === 'serio').length : 0,
    /** usados pelos testes: estado calculado e recarga */
    estado: () => ({ R: E.R, dados: E.dados, mes: E.mes, visao: E.visao, imp: E.imp && E.imp.P, impResumo: E.impResumo }), recarregar: () => carregar(true) });
})();
