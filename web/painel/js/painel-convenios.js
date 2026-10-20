/* Painel gerencial do GDV — aba "Convênios" (só administrador; não aparece no Modo TV). Convênio SUASA nº 991272/2025 – MAPA/ADAF:
   metas físicas por etapa (previsto, executado no mês, acumulado, % alcançado, esperado pelo tempo e situação), lançamentos manuais
   (etapas manuais, bens da 1.1 e ajustes — só leitura: lançados no Portal do Administrativo), execução financeira (previsto × executado,
   CSV; sem nomes de servidores) e o relatório mensal
   (textos editáveis por etapa → Word .docx e PDF). Cálculos e conteúdo do relatório: ../documentos/conv-docs.js (ConvDocs);
   Word: js/docx.js (DocxMin); PDF: modelo ../documentos/conv-relatorio.html + ../js/pdf.js (o mesmo gerador do app de campo).
   O acumulado vem da action painelConvApuracao com o intervalo [início da execução, fim do mês escolhido] — independe do período
   carregado nas outras abas. Não usa o período nem os filtros do painel.
   Os lançamentos (físicos, financeiros e a importação da planilha de movimentação) passaram para o Portal do Administrativo
   (../administrativo/): aqui só aparecem, com quem lançou e quando. Metas: físico × financeiro por etapa (ConvDocs.fisicoFinanceiro). */
(() => {
  'use strict';
  if (typeof Painel === 'undefined' || typeof ConvDocs === 'undefined') return;
  const P = Painel, esc = P.esc, CD = ConvDocs, F = CD.fmt;
  const LS_VISAO = 'gdv.painel.conv.visao', LS_MES = 'gdv.painel.conv.mes';
  const VISOES = [['metas', 'Metas'], ['lanc', 'Lançamentos'], ['fin', 'Financeiro'], ['rel', 'Relatório']];
  const SELO = { adiantada: 'bom', ritmo: 'info', atrasada: 'serio' };
  const E = { raiz: null, dados: null, convId: '', mes: P.ls.get(LS_MES) || '', visao: P.ls.get(LS_VISAO) || 'metas', apur: {}, R: null, carregando: false, erro: '',
              abertos: new Set(), finEtapa: '', finItem: '', relAberto: false, textos: null, numero: null, msg: {}, gerando: false };
  const cfg = () => E.dados ? (E.dados.convenios.find(c => c.id === E.convId) || E.dados.convenios[0]) : null;
  const hoje = () => P.hoje();
  const mesesDisponiveis = c => { const ate = hoje().slice(0, 7); const l = CD.mesesDe(c).filter(m => m <= ate); return l.length ? l : [CD.mesesDe(c)[0]]; };
  // "total" = consolidado desde o início da execução até hoje (como em Relatórios → Convênio): a apuração vai até hoje e o motor usa
  // o último mês disponível; a tela e o relatório escondem o que é "no mês"
  const consol = () => E.mes === 'total';
  const mesEf = c => { if (!consol()) return E.mes; const ms = mesesDisponiveis(c); return ms[ms.length - 1]; };
  const chaveApur = (c, m) => `${c.id}|${m === 'total' ? hoje() : CD.fimDoMes(m)}|${c.versao || 0}`;
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
      if (!consol() && !ms.includes(E.mes)) E.mes = ms[ms.length - 1];
      if (forcar) E.apur = {};
      const k = chaveApur(c, E.mes);
      if (!E.apur[k]) E.apur[k] = await P.chamar({ action: 'painelConvApuracao', convenio: c.id, de: c.inicioExecucao, ate: consol() ? hoje() : CD.fimDoMes(E.mes) });
    } catch (e) { E.erro = e.message; }
    finally { E.carregando = false; }
    recalcular(); desenhar();
  }
  function recalcular() {
    const c = cfg(); if (!c) { E.R = null; return; }
    const ap = E.apur[chaveApur(c, E.mes)];
    E.R = ap ? CD.calcular(c, ap, E.dados.lancamentos, E.dados.financeiro, mesEf(c), { hoje: hoje(), municipio: n => P.municipioNome(n) || n }) : null;
  }

  /* ---------------- estrutura ---------------- */
  function montar() {
    const r = P.el('div', 'pn-conv'); r.id = 'pn-conv';
    r.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'pn-conv-sel') { E.convId = t.value; E.textos = null; carregar(); }
      if (t.id === 'pn-conv-mes') { E.mes = t.value; P.ls.set(LS_MES, E.mes); E.textos = null; E.relAberto = false; carregar(); }
    });
    r.addEventListener('input', e => { if (e.target.closest('#pn-conv-rel-form')) { E.textosSujos = true; msg('rel', consol() ? 'Alterações valem só para o arquivo gerado agora.' : 'Alterações não salvas.', ''); } });
    r.addEventListener('click', e => {
      const b = e.target.closest('[data-conv]'); if (!b) return;
      const a = b.dataset.conv;
      if (a === 'visao') { E.visao = b.dataset.v; P.ls.set(LS_VISAO, E.visao); desenhar(); }
      else if (a === 'atualizar') carregar(true);
      else if (a === 'editar-conv') dialogoConfig();
      else if (a === 'rel-abrir') { E.relAberto = true; desenharVisao(); }
      else if (a === 'rel-salvar') salvarTextos();
      else if (a === 'rel-docx') gerar('docx');
      else if (a === 'rel-pdf') gerar('pdf');
      else if (a === 'rel-imprimir') gerar('imprimir');
      else if (a === 'rel-padrao') { if (confirm('Trocar todos os textos pelos textos-padrão do relatório de referência?')) { E.textos = { textos: JSON.parse(JSON.stringify(CD.TEXTOS_PADRAO)), numero: E.textos.numero, origem: 'padrao' }; desenharVisao(); } }
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
          <label>Mês de referência<select id="pn-conv-mes"><option value="total" ${consol() ? 'selected' : ''}>Total (consolidado até hoje)</option>${ms.slice().reverse().map(m => `<option value="${m}" ${m === E.mes ? 'selected' : ''}>${esc(F.mes(m))}</option>`).join('')}</select></label>
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
    const sm = P.secao(v, `Metas físicas — ${consol() ? 'consolidado até ' + F.data(hoje()) : F.mes(R.mes)}`, 'Acumulado desde o início da execução. A marca na barra é o esperado pelo tempo decorrido. Abra uma etapa para ver a quebra por município/BVA/sub-meta e o gráfico mensal.');
    const g = P.el('div', 'pn-conv-etapas'); sm.appendChild(g);
    R.etapas.forEach(r => {
      const card = P.el('article', 'pn-cartao pn-conv-etapa'); card.dataset.etapa = r.id;
      const cls = r.situacao === 'atrasada' && Math.min(1, r.pct) < r.esperado - 0.15 ? 'critico' : SELO[r.situacao];
      card.innerHTML = `<div class="pn-conv-etapa-cab"><h3><span class="pn-conv-id">${esc(r.id)}</span> ${esc(r.nomeCurto)}</h3><span class="pn-selo ${cls}">${esc(r.situacaoTxt)}</span></div>
        <div class="pn-conv-pct"><b>${F.pct(r.pct)}</b><span>${r.media ? 'média das sub-metas' : 'da meta'} · esperado ${F.pct(r.esperado)}</span></div>
        ${barra(r.pct, r.esperado)}
        <dl class="pn-conv-nums"><div><dt>Previsto</dt><dd>${esc(r.previstoTxt)}</dd></div>${consol() ? '' : `<div><dt>No mês</dt><dd>${esc(r.mesTxt)}</dd></div>`}<div><dt>Acumulado</dt><dd>${esc(r.acumTxt)}</dd></div></dl>
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
    P.tabela(corpo, cols.filter(x => !(consol() && x.chave === 'mes')), r.linhas, { id: 'conv-quebra-' + r.id, simples: true, limite: 60, vazio: 'Nenhum registro até este mês.' });
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

  /* ---------------- Lançamentos (só leitura: lançados no Portal do Administrativo) ---------------- */
  const PORTAL_URL = '../administrativo/';
  function avisoPortal(v, oque) {
    const k = P.el('div', 'pn-cartao pn-conv-portal');
    k.innerHTML = `<p><b>Lançamentos são feitos no Portal do Administrativo.</b> ${esc(oque)} O painel mostra os dados e gera os relatórios; quem lançou e quando aparece em cada linha.</p>
      <a class="pn-btn pn-btn-prim" href="${PORTAL_URL}" target="_blank" rel="noopener" id="pn-conv-portal">Abrir o Portal do Administrativo ↗</a>`;
    v.appendChild(k);
  }
  const lancadoEm = (v, l) => l.atualizadoEm ? `${l.usuario || '—'} em ${P.fmt.data(P.diaManaus(l.atualizadoEm))} ${P.horaManaus(l.atualizadoEm)}` : (l.usuario || '—');
  function visaoLanc(v) {
    const c = cfg(), R = E.R;
    avisoPortal(v, 'Execução física das etapas manuais (1.3, 1.5, 1.14), situação dos bens (1.1) e ajustes das etapas automáticas.');
    const rb = R.etapas.find(r => r.apuracao === 'bens');
    if (rb) {
      const sb = P.secao(v, `Bens da etapa ${rb.id}`, `Situação em ${consol() ? F.data(hoje()) : F.mes(R.mes)} (último lançamento de cada bem).`);
      P.tabela(sb, [{ chave: 'nome', rotulo: 'Bem' }, { chave: 'local', rotulo: 'Unidade' }, { chave: 'sit', rotulo: 'Situação', html: (x, l) => `<span class="pn-selo ${l.exec ? 'bom' : l.sit === 'em_aquisicao' ? 'atencao' : 'info'}">${esc(CD.SIT_BEM[x] || x)}</span>` },
        { chave: 'data', rotulo: 'Data', fmt: v => v ? F.data(v) : '—' }, { chave: 'doc', rotulo: 'Documento', fmt: v => v || '—' }],
        rb.bens.map(x => ({ id: x.b.id, nome: x.b.nome, local: x.b.local, sit: x.sit, exec: x.exec, data: x.data, doc: x.doc })), { id: 'conv-bens', titulo: '', limite: 20, busca: false });
    }
    const sl = P.secao(v, 'Lançamentos', 'Todos os lançamentos do convênio (mais recentes primeiro), lançados pelo Administrativo.');
    const subNome = l => { const e = etapa(l.etapa); if (!e) return l.submeta; if (l.tipo === 'bem') { const b = (e.bens || []).find(x => x.id === l.submeta); return b ? `${b.nome} – ${b.local}` : l.submeta; }
      const s = (e.submetas || []).find(x => x.id === l.submeta); return s ? s.nome : (l.submeta || ''); };
    const lst = E.dados.lancamentos.filter(l => l.convenio === c.id).slice().sort((a, b) => b.data.localeCompare(a.data) || (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
    // bem adquirido/entregue: valor e quantidade do desembolso da aquisição (Financeiro, chave bem|<convênio>|<bem>)
    const aquisicaoSit = l => l.tipo === 'bem' && (l.situacao === 'adquirido' || l.situacao === 'entregue');
    const aquisicao = l => aquisicaoSit(l) ? E.dados.financeiro.find(f => f.chave === `bem|${c.id}|${l.submeta}`) : null;
    P.tabela(sl, [
      { chave: 'data', rotulo: 'Data', fmt: F.data }, { chave: 'etapa', rotulo: 'Etapa' },
      { chave: 'tipo', rotulo: 'Tipo', fmt: (v, l) => v === 'ajuste' ? 'Ajuste' : v === 'bem' ? 'Bem: ' + (CD.SIT_BEM[l.situacao] || l.situacao) : 'Execução' },
      { chave: 'submeta', rotulo: 'Sub-meta / município', fmt: (v, l) => { const n = subNome(l) || ''; return [n, l.municipio && !n.includes(l.municipio) ? l.municipio : ''].filter(Boolean).join(' · ') || '—'; } },
      { chave: 'quantidade', rotulo: 'Qtd.', num: true, fmt: (v, l) => { if (l.tipo !== 'bem') return (v > 0 && l.tipo === 'ajuste' ? '+' : '') + F.num(v); const f = aquisicao(l); return f && f.quantidade != null ? F.num(f.quantidade) : '—'; } },
      { chave: 'valor', rotulo: 'Valor', num: true, ordem: l => (aquisicao(l) || {}).valor || 0, csv: (v, l) => (aquisicao(l) || {}).valor || '',
        html: (v, l) => { const f = aquisicao(l); return f ? esc(F.moeda(f.valor)) : aquisicaoSit(l) ? '<span class="pn-selo atencao">sem valor</span>' : '—'; } },
      { chave: 'descricao', rotulo: 'Descrição', fmt: (v, l) => [v, l.armadilhas ? l.armadilhas + ' armadilhas' : '', l.propriedades ? l.propriedades + ' propriedades' : ''].filter(Boolean).join(' · ') || '—' },
      { chave: 'documento', rotulo: 'Documento', fmt: v => v || '—' }, { chave: 'usuario', rotulo: 'Lançado pelo Administrativo', fmt: lancadoEm }
    ], lst, { id: 'conv-lancamentos', csv: `convenio-${c.id}-lancamentos.csv`, limite: 30, vazio: 'Nenhum lançamento ainda.' });
  }

  /* ---------------- Financeiro (só leitura; sem nomes de servidores) ---------------- */
  function visaoFin(v) {
    const c = cfg(), Fn = E.R.fin;
    P.kpis(v, [
      { rotulo: 'Executado acumulado', valor: F.moeda(Fn.total.acum), detalhe: `${F.pct(Fn.total.pct)} de ${F.moeda(Fn.total.previsto)}` }]
      .concat(consol() ? [] : [{ rotulo: `Executado em ${F.mes(E.mes)}`, valor: F.moeda(Fn.total.mes) }]).concat([
      { rotulo: 'Saldo', valor: F.moeda(Fn.total.saldo) },
      { rotulo: 'Repasse × contrapartida', valor: `${F.pct(Fn.fonte.concedente.pct)} · ${F.pct(Fn.fonte.contrapartida.pct)}`,
        detalhe: `repasse ${F.moeda(Fn.fonte.concedente.acum)} de ${F.moeda(Fn.fonte.concedente.previsto)}; contrapartida ${F.moeda(Fn.fonte.contrapartida.acum)} de ${F.moeda(Fn.fonte.contrapartida.previsto)}` }
    ]));
    avisoPortal(v, 'Desembolso (memorandos, empenhos, NF, PCDP, OB e diárias) e a importação da planilha de movimentação.');
    const colsFin = primeira => [{ chave: 'rotulo', rotulo: primeira }, { chave: 'previsto', rotulo: 'Previsto', num: true, fmt: F.moeda }].concat(consol() ? [] : [{ chave: 'mes', rotulo: 'No mês', num: true, fmt: F.moeda }]).concat([
      { chave: 'acum', rotulo: 'Acumulado', num: true, fmt: F.moeda }, { chave: 'saldo', rotulo: 'Saldo', num: true, fmt: F.moeda },
      { chave: 'pct', rotulo: '% exec.', num: true, html: (x) => `<span class="pn-conv-pctcel">${F.pct(x)}<span class="pn-conv-barra mini" aria-hidden="true"><i style="width:${Math.min(100, x * 100).toFixed(1)}%"></i></span></span>`, csv: x => Math.round(x * 10000) / 100 }]);
    const sp = P.secao(v, 'Previsto × executado', `Plano de aplicação × lançamentos até ${consol() ? F.data(hoje()) : F.mes(E.mes)}. Totais: custeio ${F.moeda(c.valores.repasseCusteio)}, investimento ${F.moeda(c.valores.repasseInvestimento + c.valores.contrapartida)}.`);
    P.tabela(sp, colsFin('Etapa'), Fn.etapas.map(x => ({ rotulo: `${x.id} ${x.nome}`, previsto: x.previsto, mes: x.mes, acum: x.acum, saldo: x.saldo, pct: x.pct })).concat([{ rotulo: 'TOTAL', ...Fn.total }]),
      { id: 'conv-fin-etapa', titulo: 'Por etapa', csv: `convenio-${c.id}-financeiro-etapa.csv`, limite: 20, busca: false });
    P.tabela(sp, colsFin('Natureza'), Fn.naturezas.map(x => ({ rotulo: `${x.natureza} – ${x.nome}`, previsto: x.previsto, mes: x.mes, acum: x.acum, saldo: x.saldo, pct: x.pct })),
      { id: 'conv-fin-nat', titulo: 'Por natureza de despesa', csv: `convenio-${c.id}-financeiro-natureza.csv`, limite: 20, busca: false });
    const sl = P.secao(v, 'Lançamentos financeiros', 'Escolha a etapa e, se quiser, o item (mais recentes primeiro). O nome do servidor da diária aparece aqui e no CSV; os relatórios (Word/PDF) não trazem nomes.');
    const filtro = P.el('div', 'pn-conv-filtro'), lista = P.el('div');
    sl.appendChild(filtro); sl.appendChild(lista);
    lancFin(c, filtro, lista);
  }
  /* Lançamentos financeiros separados por etapa (chips com nº e total) e filtro por item; "Todas" junta tudo (CSV completo). */
  function lancFin(c, filtro, lista) {
    const todos = E.dados.financeiro.filter(l => l.convenio === c.id);
    const soma = a => a.reduce((t, l) => t + (Number(l.valor) || 0), 0);
    const etapas = c.etapas.map(e => ({ e, ls: todos.filter(l => l.etapa === e.id) })).filter(x => x.ls.length);
    if (E.finEtapa !== '*' && !etapas.some(x => x.e.id === E.finEtapa)) { E.finEtapa = etapas.length ? etapas[0].e.id : ''; E.finItem = ''; }   // '' = ainda sem lançamentos
    const sel = etapas.find(x => x.e.id === E.finEtapa) || null;
    const itens = sel ? (sel.e.itens || []).map(it => ({ it, ls: sel.ls.filter(l => l.item === it.id) })).filter(x => x.ls.length) : [];
    if (E.finItem && !itens.some(x => x.it.id === E.finItem)) E.finItem = '';
    const chip = (id, rot, ls) => `<button type="button" class="pn-chip" data-fin-etapa="${esc(id)}" aria-pressed="${(E.finEtapa || '*') === id}">${esc(rot)} <span class="pn-conv-chipn">${ls.length} · ${F.moeda(soma(ls))}</span></button>`;
    filtro.innerHTML = `<div class="pn-conv-nav" role="group" aria-label="Etapa">${etapas.map(x => chip(x.e.id, 'Etapa ' + x.e.id, x.ls)).join('')}${chip('*', 'Todas', todos)}</div>
      ${sel ? `<label class="pn-conv-campo pn-conv-filtro-item">Item<select id="pn-conv-fin-item"><option value="">Todos os itens da etapa ${esc(sel.e.id)}</option>${itens.map(x => `<option value="${esc(x.it.id)}" ${E.finItem === x.it.id ? 'selected' : ''}>${esc(x.it.id + ' ' + x.it.nome)} (${x.ls.length})</option>`).join('')}</select></label>` : ''}`;
    filtro.onclick = e => { const b = e.target.closest('[data-fin-etapa]'); if (!b) return; E.finEtapa = b.dataset.finEtapa; E.finItem = ''; lancFin(c, filtro, lista); };
    filtro.onchange = e => { if (e.target.id === 'pn-conv-fin-item') { E.finItem = e.target.value; lancFin(c, filtro, lista); } };
    const itemNome = l => { const e = etapa(l.etapa), it = e && (e.itens || []).find(x => x.id === l.item); return it ? `${it.id} ${it.nome}` : l.item; };
    let lst = sel ? sel.ls : todos;
    if (sel && E.finItem) lst = lst.filter(l => l.item === E.finItem);
    lst = lst.slice().sort((a, b) => sel ? (b.data.localeCompare(a.data) || (b.atualizadoEm || 0) - (a.atualizadoEm || 0))
      : (String(a.etapa).localeCompare(String(b.etapa), 'pt-BR', { numeric: true }) || b.data.localeCompare(a.data)));
    const diarias = lst.reduce((t, l) => t + (/^33\.90\.(14|36)/.test(l.natureza || '') ? Number(l.quantidade) || 0 : 0), 0);
    const titulo = !sel ? 'Todas as etapas' : E.finItem ? itemNome({ etapa: sel.e.id, item: E.finItem }) : `Etapa ${sel.e.id} – ${sel.e.nome}`;
    lista.innerHTML = '';
    P.tabela(lista, [{ chave: 'data', rotulo: 'Data', fmt: F.data }].concat(sel ? [] : [{ chave: 'etapa', rotulo: 'Etapa' }]).concat(sel && E.finItem ? [] : [{ chave: 'item', rotulo: 'Item', fmt: (v, l) => itemNome(l) }]).concat([
      { chave: 'natureza', rotulo: 'Natureza' }, { chave: 'quantidade', rotulo: 'Qtd.', num: true, fmt: v => v == null ? '—' : F.num(v) },
      { chave: 'valor', rotulo: 'Valor', num: true, fmt: F.moeda, csv: v => v }, { chave: 'municipio', rotulo: 'Município', fmt: v => v || '—' }, { chave: 'documento', rotulo: 'Documento', fmt: v => v || '—' },
      { chave: 'fonte', rotulo: 'Fonte', fmt: v => v === 'contrapartida' ? 'Contrapartida' : 'Repasse' }, { chave: 'servidorNome', rotulo: 'Servidor', fmt: v => v || '—' }, { chave: 'descricao', rotulo: 'Descrição', fmt: v => v || '—' },
      { chave: 'origem', rotulo: 'Origem', fmt: (v, l) => v === 'planilha' ? `Planilha${l.importadoEm ? ' ' + F.data(new Date(l.importadoEm - 4 * 3600e3).toISOString()) : ''}` : v === 'bem' ? 'Bem (aquisição)' : 'Manual' },
      { chave: 'usuario', rotulo: 'Lançado pelo Administrativo', fmt: lancadoEm }]),
      lst, { id: 'conv-fin-lanc', titulo, subtitulo: `${lst.length} lançamento${lst.length === 1 ? '' : 's'} · ${F.moeda(soma(lst))}${diarias ? ` · ${F.num(diarias, 1)} diárias` : ''}`,
        csv: `convenio-${c.id}-financeiro-lancamentos${sel ? '-' + sel.e.id + (E.finItem ? '-' + E.finItem : '') : ''}.csv`, limite: 30, vazio: 'Nenhum lançamento financeiro ainda.' });
  }

  /* ---------------- Relatório ---------------- */
  function visaoRel(v) {
    const c = cfg(), R = E.R;
    // consolidado: os textos são os do último mês (os mesmos que Relatórios → Convênio usa) e não são salvos daqui
    if (!E.textos || E.textos.mes !== E.mes || E.textos.conv !== c.id) { E.textos = Object.assign(CD.textosIniciais(c, E.dados.relatorios, mesEf(c)), { mes: E.mes, conv: c.id }); E.textosSujos = false; }
    const T = E.textos, rotulo = consol() ? `consolidado até ${F.data(hoje())}` : F.mes(E.mes);
    const s0 = P.secao(v, `Relatório circunstancial — ${rotulo}`, consol()
      ? 'Total desde o início da execução até hoje: tabela-resumo e memória descritiva geradas pela apuração, sem as colunas do mês.'
      : 'Modelo do relatório parcial de referência: tabela-resumo e memória descritiva geradas pela apuração; textos por etapa editáveis.');
    const topo = P.el('div', 'pn-cartao pn-conv-rel-topo');
    topo.innerHTML = `<p>${consol() ? `Textos do relatório de ${esc(F.mes(mesEf(c)))}${T.salvo ? '' : ' (pré-preenchidos)'}; para mudá-los de vez, escolha o mês e salve.`
      : T.salvo ? `Textos salvos para ${esc(F.mes(E.mes))}.` : T.origem === 'anterior' ? `Textos pré-preenchidos com o relatório de ${esc(F.mes(T.anterior))}.` : 'Textos pré-preenchidos com os do relatório parcial de referência.'}
      Executado: ${R.etapas.map(r => `<b>${esc(r.id)}</b> ${F.pct(r.pct)}`).join(' · ')}</p>
      ${E.relAberto ? '' : `<button type="button" class="pn-btn pn-btn-prim" data-conv="rel-abrir" id="pn-conv-rel-abrir">Gerar relatório ${consol() ? esc(rotulo) : 'de ' + esc(rotulo)}</button>`}`;
    s0.appendChild(topo);
    if (!E.relAberto) return;
    const form = P.el('form', 'pn-conv-rel-form'); form.id = 'pn-conv-rel-form'; form.noValidate = true;
    const ta = (id, rot, val, rows) => `<label class="pn-conv-campo pn-conv-largo">${esc(rot)}<textarea id="${id}" rows="${rows || 2}" maxlength="4000">${esc(val || '')}</textarea></label>`;
    form.innerHTML = `
      ${consol() ? '' : `<div class="pn-cartao pn-conv-rel-num"><label class="pn-conv-campo">Parcial nº<input id="pn-cr-numero" inputmode="numeric" maxlength="2" value="${esc(T.numero)}"></label>
        <p class="pn-sub">Automático pela ordem do mês desde o início da execução (${esc(F.mes(c.inicioExecucao.slice(0, 7)))} = 1); pode mudar.</p></div>`}
      ${R.etapas.map(r => `<fieldset class="pn-cartao pn-conv-rel-etapa"><legend>Etapa ${esc(r.id)} – ${esc(r.nomeCurto)} <span class="pn-sub">${F.pct(r.pct)}</span></legend>
        <p class="pn-sub"><b>Execução registrada (automática):</b> ${esc(r.execTexto)}</p>
        ${Object.entries(CD.ROTULOS_TXT).map(([k, rot]) => ta(`pn-cr-${r.id.replace('.', '_')}-${k}`, rot, (T.textos.etapas[r.id] || {})[k])).join('')}</fieldset>`).join('')}
      <fieldset class="pn-cartao pn-conv-rel-etapa"><legend>Textos gerais</legend>
        ${Object.entries(CD.ROTULOS_GERAIS).map(([k, rot]) => ta(`pn-cr-g-${k}`, rot + (k === 'providencias' ? ' (uma por linha)' : ''), T.textos.gerais[k], 4)).join('')}</fieldset>
      <div class="pn-cartao pn-conv-rel-acoes">
        ${consol() ? '' : '<button type="button" class="pn-btn" data-conv="rel-salvar" id="pn-cr-salvar">Salvar textos</button>'}
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
    return { numero: n >= 1 && n <= 99 ? n : CD.numeroAuto(cfg(), mesEf(cfg())), textos: t };
  }
  async function salvarTextos(silencioso) {
    if (consol()) return false;                                 // o consolidado não tem mês próprio para guardar textos
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
  const nomeArq = (num, ext) => `Relatorio_Convenio_${cfg().numero.replace(/\W+/g, '-')}_${consol() ? `Consolidado_ate_${hoje()}` : `Parcial_${num}_${E.mes}`}.${ext}`;
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
      const B = CD.blocos(E.R, x.textos, { numero: x.numero, dataEmissao: hoje(), consolidado: consol(), ate: hoje() });
      if (tipo === 'docx') {
        msg('rel', 'Gerando o Word…', '');
        const [cab, adaf, sepror] = await Promise.all([bytes('../img/brasao.png'), bytes('../img/logo-adaf.png'), bytes('../img/sepror.png')]);
        const blob = DocxMin.criar({ blocos: B, titulo: `${cfg().titulo} – ${consol() ? 'Consolidado até ' + F.data(hoje()) : `Parcial ${x.numero} – ${F.mes(E.mes)}`}`, autor: P.usuario || 'e-GDV', cabecalho: cab, rodape: [adaf, sepror],
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
    // BVAs do app (CONFIG.bvas) + barreiras do cadastro do TF; a barreira cujo id/nome/sufixo é o de uma BVA do app é a mesma
    // (ex.: "Barreira Porto da CEASA", sufixo "BVA - CEASA" = "BVA - CEASA") e aparece uma vez só, com o nome do app
    const nBva = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const bvasApp = ((typeof CONFIG !== 'undefined' && CONFIG.bvas) || []).map(b => b.nome), apelido = {};
    bvasApp.forEach(n => { apelido[nBva(n)] = n; });
    ((P.todos && P.todos.barreiras) || []).forEach(b => {
      const nomes = [b.id, b.nome, b.sufixo].filter(Boolean), canon = nomes.map(x => apelido[nBva(x)]).find(Boolean) || b.nome;
      if (canon) nomes.forEach(x => { if (!apelido[nBva(x)]) apelido[nBva(x)] = canon; });
    });
    const canonBva = n => apelido[nBva(n)] || n;
    const bvasConhecidas = [...new Set(bvasApp.concat(((P.todos && P.todos.barreiras) || []).map(b => canonBva(b.nome)).filter(Boolean)))];
    const secEtapa = e => {
      let x = `<fieldset class="pn-conv-cfg-etapa" data-etapa="${esc(e.id)}"><legend>Etapa ${esc(e.id)}</legend>
        ${inp(`pn-cc-nome-${e.id.replace('.', '_')}`, 'Nome curto', e.nomeCurto, 'maxlength="80"')}
        ${inp(`pn-cc-meta-${e.id.replace('.', '_')}`, `Meta (${e.unidade})`, e.meta, 'inputmode="decimal" maxlength="10"')}`;
      if (e.apuracao === 'bva') {
        const marcadas = (e.bvas || []).map(canonBva), todas = [...new Set(bvasConhecidas.concat(marcadas))];
        x += `<div class="pn-conv-campo pn-conv-largo">BVAs fixas apuradas<div class="pn-conv-checks">${todas.map(b => `<label><input type="checkbox" data-bva value="${esc(b)}" ${marcadas.includes(b) ? 'checked' : ''}> ${esc(b)}</label>`).join('')}</div></div>`;
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
  P.aoSair(() => { if (E.raiz) E.raiz.remove(); Object.assign(E, { raiz: null, dados: null, apur: {}, R: null, erro: '', textos: null, relAberto: false, msg: {} }); });
  P.registrarAba({ id: 'convenios', titulo: 'Convênios', render, semFiltros: true,
    contador: () => E.R ? E.R.alertas.filter(a => a.nivel === 'serio').length : 0,
    /** usados pelos testes: estado calculado e recarga */
    estado: () => ({ R: E.R, dados: E.dados, mes: E.mes, visao: E.visao }), recarregar: () => carregar(true) });
})();
