/* Painel gerencial do GDV — aba "PCE" (Programa de Controle e Erradicação: levantamento fitossanitário e Termo de Colheita de Amostras). Usa a API do objeto global Painel (js/painel.js). */
(() => {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, fmt = P.fmt, esc = P.esc, norm = P.norm;
  // Cobertura municipal: anual (de 1º de janeiro até o fim do período), como a meta do programa

  /* ---------- auxiliares ---------- */
  const selo = (cls, txt) => `<span class="pn-selo ${cls}">${esc(txt)}</span>`;
  const altH = n => Math.max(170, Math.min(620, n * 30 + 90));           // barras horizontais: espaço para todos os rótulos
  /** Eixo de categorias das barras horizontais: corta rótulos longos (mais curto no celular) para não vazar à esquerda. */
  const eixoRotulos = extra => Object.assign({ ticks: { color: P.paleta.eixo, autoSkip: false, callback: function (v) {
    const l = String(this.getLabelForValue(v)), max = innerWidth < 560 ? 16 : 26; return l.length > max ? l.slice(0, max - 1) + '…' : l; } } }, extra || {});
  const horiz = () => ({ indexAxis: 'y', scales: { y: eixoRotulos() } });
  const pilhaY = () => ({ indexAxis: 'y', scales: { x: { stacked: true }, y: eixoRotulos({ stacked: true }) } });
  const pilhaX = { scales: { x: { stacked: true }, y: { stacked: true } } };
  const chaveProp = l => l.chaveProp;                 // mesma chave da Visão geral (calculada em Painel.normalizar)
  const temCoord = x => x.lat != null && x.lon != null;
  const qtdAmostras = c => { const n = parseFloat(String(c.quantidade == null ? '' : c.quantidade).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; };
  const numTermo = t => t.numeroTxt || (t.numero != null ? String(t.numero) : '—');
  const lista = (arr, max) => arr.length ? esc(arr.slice(0, max).join(', ')) + (arr.length > max ? ` <span class="pn-sub">+${arr.length - max}</span>` : '') : '—';

  /** Eixo de tempo: por dia até 92 dias; por semana acima disso. */
  function eixoTempo(f) {
    if (f.dias > 92) {
      const nb = Math.ceil(f.dias / 7), rot = [...Array(nb).keys()].map(i => fmt.dataCurta(P.somaDias(f.de, i * 7)));
      return { rot, chave: x => x.data && x.data >= f.de && x.data <= f.ate ? rot[Math.floor(P.diasEntre(f.de, x.data) / 7)] : null, porSemana: true };
    }
    const s = P.porDia([], f.de, f.ate), ix = {}; s.dias.forEach((d, i) => { ix[d] = s.labels[i]; });
    return { rot: s.labels, chave: x => ix[x.data] || null, porSemana: false };
  }
  /** Séries "Sem praga" / "Com praga" (cores fixas por entidade: série 1 e série 2). */
  function serieDeteccao(rotulos, chaveDe, regs, comPraga, p, rotSem, rotCom) {
    const idx = new Map(rotulos.map((r, i) => [r, i])), sem = rotulos.map(() => 0), com = rotulos.map(() => 0);
    regs.forEach(x => [].concat(chaveDe(x)).forEach(k => { const i = idx.get(k); if (i == null) return; (comPraga(x) ? com : sem)[i]++; }));
    return [{ label: rotSem || 'Sem praga', data: sem, cor: p.serie[0] }, { label: rotCom || 'Com praga', data: com, cor: p.serie[1] }];
  }
  /** Culturas (uma linha por cultura informada) com o levantamento de origem. */
  const itensCultura = levs => levs.flatMap(l => l.culturasLista.map(c => ({ ...c, lev: l, data: l.data, municipio: l.municipio })));

  /* ---------- cobertura municipal ---------- */
  function cobertura(d, f) {
    const N = d.semFiltro || {}, ano = String(f.ate).slice(0, 4), lim = ano + '-01-01';
    const ultimo = {}, noAno = {};
    const marca = (mun, data) => { const k = norm(mun); if (!k || !data || data > f.ate) return; if (!ultimo[k] || data > ultimo[k]) ultimo[k] = data; if (data >= lim) noAno[k] = (noAno[k] || 0) + 1; };
    (d.historicoPce || []).forEach(h => marca(h.municipio, h.data));
    (N.levantamentos || d.levantamentos).forEach(l => marca(l.municipio, l.data));
    const noPer = {}, det = {}; d.levantamentos.forEach(l => { const k = norm(l.municipio); noPer[k] = (noPer[k] || 0) + 1; det[k] = (det[k] || 0) + l.deteccoes; });
    let muns = P.municipios;
    if (f.local && f.local.tipo === 'municipio') muns = muns.filter(m => norm(m) === norm(f.local.valor));
    const linhas = muns.map(m => {
      const k = norm(m), u = ultimo[k] || null;
      const sit = noAno[k] ? (noPer[k] ? 2 : 1) : (u ? 0 : -1);
      return { municipio: m, periodo: noPer[k] || 0, deteccoes: det[k] || 0, ultAno: noAno[k] || 0, ultimo: u, dias: u ? P.diasEntre(u, f.ate) : null, sit };
    });
    return { linhas, lim, ano };
  }
  const SIT_COB = { 2: ['bom', 'Coberto no período'], 1: ['bom', 'Coberto no ano'], 0: ['atencao', 'Sem levantamento no ano'], '-1': ['serio', 'Sem levantamento em 365 dias'] };

  /* ---------- focos de pragas (praga × município) ---------- */
  function focos(d) {
    const hist = new Set(); (d.historicoPce || []).forEach(h => h.pragas.forEach(pr => hist.add(norm(h.municipio) + '|' + norm(pr))));
    const G = {};
    d.levantamentos.forEach(l => l.culturasLista.forEach(c => {
      if (!c.praga) return;
      const k = norm(l.municipio) + '|' + norm(c.praga);
      const g = G[k] = G[k] || { praga: c.praga, municipio: l.municipio || 'Não informado', deteccoes: 0, suspeitas: 0, levs: new Set(), props: new Set(), culturas: new Set(), primeira: l.data, ultima: l.data, amostras: 0, novo: !hist.has(k) };
      g.deteccoes++; if (c.suspeita) g.suspeitas = (g.suspeitas || 0) + 1; g.levs.add(l.id); g.props.add(chaveProp(l)); g.culturas.add(c.cultura); if (c.coleta) g.amostras++;
      if (l.data && (!g.primeira || l.data < g.primeira)) g.primeira = l.data; if (l.data && (!g.ultima || l.data > g.ultima)) g.ultima = l.data;
    }));
    return Object.values(G).map(g => ({ ...g, levantamentos: g.levs.size, propriedades: g.props.size, culturasTxt: [...g.culturas].sort().join(', ') }));
  }

  /* ---------- alertas próprios do módulo ---------- */
  function alertasPce(d) {
    const A = P.alertasGerais(d).filter(a => a.aba === 'pce').map(a => ({ ...a, aba: undefined }));
    const semColeta = itensCultura(d.levantamentos).filter(c => c.praga && !c.coleta);
    if (semColeta.length) A.push({ nivel: 'atencao', titulo: `${semColeta.length} detecção(ões) de praga sem coleta de amostra`,
      detalhe: semColeta.slice(0, 8).map(c => `${c.praga} em ${c.cultura} · ${c.municipio || '?'} (${fmt.dataCurta(c.data)})`).join('; ') + '. Sem amostra não há confirmação laboratorial.' });
    // termos válidos (não cancelados) de qualquer servidor: o termo pode ter sido emitido por outro servidor que não o do filtro
    const comTermo = new Set(((d.semFiltro && d.semFiltro.colheitasTodas) || d.colheitasTodas).filter(t => !t.cancelado).map(t => t.levantamentoId).filter(Boolean));
    const semTermo = d.levantamentos.filter(l => l.nAmostras && !comTermo.has(l.id));
    if (semTermo.length) A.push({ nivel: 'atencao', titulo: `${semTermo.length} levantamento(s) com amostra coletada e sem Termo de Colheita no período`,
      detalhe: semTermo.slice(0, 8).map(l => `${l.propriedade || 'Propriedade'} · ${l.municipio || '?'} (${fmt.dataCurta(l.data)}, ${l.servidor || '?'})`).join('; ') + '. Conferir se o termo foi emitido.' });
    const semC = d.levantamentos.filter(l => !temCoord(l)).length + d.colheitas.filter(c => !temCoord(c)).length;
    if (semC) A.push({ nivel: 'info', titulo: `${semC} registro(s) do PCE sem coordenada`,
      detalhe: 'Contam nos números, mas não aparecem no mapa nem no calor de detecções. Orientar a captura do GPS no local.' });
    return A;
  }

  /** Auditoria da numeração dos termos respeitando o filtro de município. */
  function auditoriaFiltrada(d, f) {
    const audBase = d.auditoria.pce || [];
    return f.local && f.local.tipo === 'municipio' ? audBase.filter(a => norm(a.grupo) === norm(f.local.valor)) : audBase;
  }

  /** Indicadores do módulo (aba e modo TV). Cada item: {chave, rotulo, valor, detalhe, status}. */
  function indicadores(d, f) {
    const levs = d.levantamentos, nL = levs.length, itens = itensCultura(levs);
    const comPraga = levs.filter(l => l.detectou).length, det = itens.filter(x => x.praga).length, susp = itens.filter(x => x.praga && x.suspeita).length;
    const neg = levs.filter(l => l.negativo).length, avalNeg = itens.filter(x => x.resultado === 'nao_detectada').length;
    const props = new Set(levs.map(chaveProp)).size;
    const area = levs.reduce((s, l) => s + (l.area || 0), 0);
    const amostras = levs.reduce((s, l) => s + l.nAmostras, 0);
    const nCult = levs.reduce((s, l) => s + l.culturasUnicas.length, 0);   // a mesma cultura avaliada para várias pragas conta uma vez
    const tipos = new Set(itens.map(x => x.cultura)).size;
    const termos = d.colheitas, amostrasTermos = termos.reduce((s, t) => s + qtdAmostras(t), 0);
    const cob = cobertura(d, f), nMun = cob.linhas.length;
    const cobAno = cob.linhas.filter(l => l.sit >= 1).length, munPer = cob.linhas.filter(l => l.periodo).length;
    const nConf = auditoriaFiltrada(d, f).reduce((s, a) => s + (a.conflitos || 0) + a.duplicados.length, 0);
    return [
      { chave: 'levantamentos', rotulo: 'Levantamentos', valor: nL, detalhe: `${fmt.int(munPer)} município(s) no período` },
      { chave: 'propriedades', rotulo: 'Propriedades visitadas', valor: props, detalhe: 'distintas (código ou nome da propriedade)' },
      { chave: 'area', rotulo: 'Área inspecionada', valor: area ? fmt.ha(area) : '0 ha', detalhe: 'soma das áreas das culturas' },
      { chave: 'culturas', rotulo: 'Culturas inspecionadas', valor: nCult, detalhe: `${fmt.int(tipos)} cultura(s) diferente(s) · ${fmt.int(itens.length)} avaliação(ões) cultura × praga` },
      { chave: 'taxa', rotulo: 'Taxa de detecção', valor: nL ? fmt.pct(comPraga / nL, 1) : '—', detalhe: `${fmt.int(comPraga)} levantamento(s) com praga · ${fmt.int(det)} detecção(ões)${susp ? ` (${fmt.int(susp)} suspeita(s))` : ''}`,
        status: comPraga ? 'critico' : (nL ? 'bom' : null), titulo: 'Percentual de levantamentos com alguma praga detectada ou suspeita em ao menos uma cultura' },
      { chave: 'suspeitas', rotulo: 'Suspeitas', valor: susp, detalhe: 'culturas com resultado “suspeita” (já incluídas nas detecções)', status: susp ? 'atencao' : null },
      { chave: 'negativos', rotulo: 'Levantamentos negativos', valor: neg, detalhe: `sem praga detectada nem suspeita · ${fmt.int(avalNeg)} avaliação(ões) “não detectada”`, status: nL && neg === nL ? 'bom' : null },
      { chave: 'amostras', rotulo: 'Amostras coletadas', valor: amostras, detalhe: 'culturas com coleta = Sim' },
      { chave: 'termos', rotulo: 'Termos de colheita', valor: termos.length, detalhe: `${fmt.int(amostrasTermos)} amostra(s) nos termos${d.colheitasCanceladas.length ? ` · ${d.colheitasCanceladas.length} cancelado(s)` : ''}${nConf ? ` · ${nConf} conflito(s) de nº` : ''}`,
        status: nConf ? 'critico' : null },
      { chave: 'termosPce', rotulo: 'Termos de fiscalização', valor: (d.termosPce || []).length,
        detalhe: `${fmt.int((d.termosPce || []).reduce((s, t) => s + (t.plantasInspecionadas || 0), 0))} plantas inspecionadas` },
      { chave: 'cadastrosPce', rotulo: 'Cadastros monilíase', valor: (d.cadastrosPce || []).filter(c => c.data >= f.de && c.data <= f.ate).length,
        detalhe: 'imóveis com hospedeiros cadastrados no período' },
      { chave: 'cobertura', rotulo: `Cobertura (${cob.ano})`, valor: `${fmt.int(cobAno)} / ${fmt.int(nMun)}`, detalhe: `municípios com levantamento de ${fmt.dataCurta(cob.lim)} a ${fmt.dataCurta(f.ate)}`,
        status: nMun && cobAno / nMun < 0.5 ? 'atencao' : null, cobertos: cobAno, total: nMun }
    ];
  }

  /** Cálculos do módulo para o modo TV e a aba: detecções por praga, focos (novo × recorrente) e cobertura municipal. */
  function calculos(d, f) {
    const itens = itensCultura(d.levantamentos);
    const cob = cobertura(d, f), nSit = k => cob.linhas.filter(l => l.sit === k).length;
    const pragas = P.contar(itens.filter(x => x.praga), 'praga');
    const suspPorPraga = pragas.map(([pr]) => itens.filter(x => x.praga === pr && x.suspeita).length);
    return { itens, pragas, suspPorPraga, cobertura: cob, focos: focos(d),
             cob: { cobertos: cob.linhas.filter(l => l.sit >= 1).length, total: cob.linhas.length, semVisitaNoAno: nSit(0), semVisitaAno: nSit(-1), noPeriodo: cob.linhas.filter(l => l.periodo).length } };
  }

  /* ---------- render ---------- */
  function render(c, d, f) {
    const p = P.paleta;
    const levs = d.levantamentos, termos = d.colheitas;
    const K = calculos(d, f), itens = K.itens, cob = K.cobertura, nMun = cob.linhas.length;
    const cobAno = K.cob.cobertos, munPer = K.cob.noPeriodo;
    const audit = auditoriaFiltrada(d, f);

    const s0 = P.el('p', 'pn-sub', `Período: ${esc(f.rotuloPeriodo)}${f.fiscal ? ' · Servidor: ' + esc(f.fiscal) : ''}${f.local && f.local.tipo === 'municipio' ? ' · Município: ' + esc(f.local.valor) : ''}` +
      (f.local && f.local.tipo === 'barreira' ? ' · (o filtro de barreira não se aplica ao PCE)' : ''));
    s0.style.marginTop = '4px'; c.appendChild(s0);

    /* KPIs */
    const kp = P.secao(c, 'Indicadores do PCE');
    kp.parentNode.classList.add('pn-pce-kpis');
    P.kpis(kp, indicadores(d, f));

    /* Alertas */
    const al = alertasPce(d);
    const sa = P.secao(c, 'Alertas do módulo', al.length ? `${al.length} alerta(s) · ordem: crítico → sério → atenção.` : null);
    sa.parentNode.classList.add('pn-pce-alertas');
    P.alertas(P.cartao(sa), al, { max: matchMedia('(max-width: 700px)').matches ? 3 : 5, vazio: 'Nenhum alerta do PCE no período.' });

    /* Mapa */
    const sm = P.secao(c, 'Mapa do Amazonas', 'Levantamentos (laranja com anel = praga detectada ou suspeita, azul = negativo), calor das detecções (detectada + suspeita), termos de colheita e indicador por município. Use os filtros de praga e cultura do calor.');
    sm.parentNode.classList.add('pn-pce-mapa');
    P.mapa(sm, { id: 'pce', titulo: 'PCE no estado', camadas: ['levantamentos', 'colheitas', 'calor', 'coropletico'], ativas: ['levantamentos', 'colheitas', 'calor'], indicador: 'deteccoes' });

    /* Atividade e detecção */
    const g = P.grade(P.secao(c, 'Levantamentos e detecções', 'Cores fixas em todo o módulo, inclusive no mapa: azul = negativo (sem praga), laranja = com praga detectada ou suspeita, amarelo = suspeita, verde = termo de colheita.'));
    const ex = eixoTempo(f);
    P.grafico(g, 'pce-tempo', { type: 'bar', titulo: ex.porSemana ? 'Levantamentos por semana' : 'Levantamentos por dia', subtitulo: 'Empilhado por resultado',
      tabelaRotulo: ex.porSemana ? 'Semana iniciada em' : 'Dia', options: pilhaX, vazio: 'Nenhum levantamento no período.',
      data: { labels: ex.rot, datasets: serieDeteccao(ex.rot, ex.chave, levs, l => l.detectou, p, 'Negativo', 'Com praga') } });
    const pr = K.pragas;
    P.grafico(g, 'pce-pragas', { type: 'bar', titulo: 'Detecções por praga', altura: altH(pr.length), subtitulo: 'Nº de culturas com a praga detectada ou suspeita', tabelaRotulo: 'Praga',
      options: pilhaY(), vazio: 'Nenhuma praga detectada no período.',
      data: { labels: pr.map(x => x[0]), datasets: [{ label: 'Detectada', data: pr.map((x, i) => x[1] - K.suspPorPraga[i]), cor: p.serie[1] },
        { label: 'Suspeita', data: K.suspPorPraga, cor: p.serie[3] }] } });
    const mun = P.contar(levs, l => l.municipio || 'Não informado').map(x => x[0]).slice(0, 15);
    P.grafico(g, 'pce-municipio', { type: 'bar', titulo: 'Levantamentos por município', altura: altH(mun.length), subtitulo: mun.length >= 15 ? 'Os 15 municípios com mais levantamentos' : null,
      tabelaRotulo: 'Município', options: pilhaY(), vazio: 'Nenhum levantamento no período.',
      data: { labels: mun, datasets: serieDeteccao(mun, l => l.municipio || 'Não informado', levs, l => l.detectou, p) } });
    const cul = P.contar(itens, 'cultura').map(x => x[0]).slice(0, 15);
    P.grafico(g, 'pce-culturas', { type: 'bar', titulo: 'Culturas inspecionadas', altura: altH(cul.length), subtitulo: 'Nº de avaliações da cultura (cultura × praga), por resultado', tabelaRotulo: 'Cultura',
      options: pilhaY(), vazio: 'Nenhuma cultura inspecionada no período.',
      data: { labels: cul, datasets: serieDeteccao(cul, x => x.cultura, itens, x => !!x.praga, p, 'Não detectada', 'Detectada ou suspeita') } });
    // culturas × pragas
    const pragasM = pr.map(x => x[0]), culM = P.contar(itens.filter(x => x.praga), 'cultura').map(x => x[0]);
    const M = culM.map(cu => pragasM.map(pg => itens.filter(x => x.cultura === cu && x.praga === pg).length));
    const mc = P.matriz(g, { id: 'pce-cultura-praga', titulo: 'Culturas × pragas', subtitulo: 'Detecções por cultura hospedeira e praga', linhas: culM, colunas: pragasM, valores: M,
      larguraRotulo: '120px', rotuloValor: 'detecções', rotuloLinha: 'Cultura', mostrarValores: true, vazio: 'Nenhuma praga detectada no período.' });
    mc.classList.add('pn-pce-matriz');
    mc.querySelectorAll('.pn-mtz-col').forEach((e, j) => {                    // nomes de praga longos: rótulo vertical
      Object.assign(e.style, { writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: '120px', overflow: 'hidden', textOverflow: 'ellipsis', justifySelf: 'center', paddingTop: '4px' });
      if (pragasM[j]) e.title = pragasM[j];
    });
    // por servidor
    const nomesServ = x => String(x.servidor || '').trim() || 'Não informado';
    const serv = P.contar(levs.concat(termos), nomesServ).map(x => x[0]).slice(0, 15);
    const ixS = new Map(serv.map((s, i) => [s, i])), vL = serv.map(() => 0), vD = serv.map(() => 0), vT = serv.map(() => 0);
    levs.forEach(l => { const i = ixS.get(nomesServ(l)); if (i != null) { vL[i]++; if (l.detectou) vD[i]++; } });
    termos.forEach(t => { const i = ixS.get(nomesServ(t)); if (i != null) vT[i]++; });
    P.grafico(g, 'pce-servidor', { type: 'bar', titulo: 'Por servidor', altura: altH(serv.length) + serv.length * 12, subtitulo: 'Produtividade: levantamentos, quantos com praga e termos de colheita emitidos', tabelaRotulo: 'Servidor',
      options: horiz(), vazio: 'Nenhum registro no período.',
      data: { labels: serv, datasets: [{ label: 'Levantamentos (total)', data: vL, cor: p.serie[6] }, { label: 'Com praga', data: vD, cor: p.serie[1] }, { label: 'Termos de colheita', data: vT, cor: p.serie[2] }] } });

    /* Focos de pragas */
    const sf = P.secao(c, 'Focos de pragas e doenças', 'Cada praga por município no período. "Novo foco" = sem registro desta praga no município nos 365 dias anteriores ao período.');
    const fc = K.focos.sort((a, b) => (b.novo - a.novo) || (b.deteccoes - a.deteccoes) || String(b.ultima).localeCompare(String(a.ultima)));
    P.tabela(sf, [
      { chave: 'novo', rotulo: 'Situação', html: v => v ? selo('critico', 'Novo foco') : selo('atencao', 'Recorrente'), fmt: v => v ? 'Novo foco' : 'Recorrente', csv: v => v ? 'Novo foco' : 'Recorrente', ordem: l => l.novo ? 1 : 0 },
      { chave: 'praga', rotulo: 'Praga / doença' }, { chave: 'municipio', rotulo: 'Município' },
      { chave: 'deteccoes', rotulo: 'Detecções', num: true, fmt: fmt.int }, { chave: 'suspeitas', rotulo: 'Suspeitas', num: true, fmt: fmt.int },
      { chave: 'levantamentos', rotulo: 'Levantam.', num: true, fmt: fmt.int },
      { chave: 'propriedades', rotulo: 'Propriedades', num: true, fmt: fmt.int }, { chave: 'amostras', rotulo: 'Amostras', num: true, fmt: fmt.int },
      { chave: 'culturasTxt', rotulo: 'Culturas' },
      { chave: 'primeira', rotulo: 'Primeira', fmt: fmt.data }, { chave: 'ultima', rotulo: 'Última', fmt: fmt.data }
    ], fc, { id: 'pce-focos', csv: 'pce-focos-de-pragas.csv', ordenar: 'novo', limite: 15, vazio: 'Nenhuma praga detectada no período.' });

    /* Cobertura */
    const sc = P.secao(c, 'Cobertura municipal', `Municípios com e sem levantamento no período e no ano de ${cob.ano} (de ${fmt.data(cob.lim)} a ${fmt.data(f.ate)}). Considera todos os servidores e o histórico de 365 dias.`);
    sc.parentNode.classList.add('pn-pce-cobertura');
    const nSit = k => cob.linhas.filter(l => l.sit === k).length;
    P.kpis(sc, [
      { rotulo: 'Com levantamento no período', valor: munPer, detalhe: `de ${fmt.int(nMun)} município(s)` },
      { rotulo: `Cobertos em ${cob.ano}`, valor: cobAno, detalhe: nMun ? fmt.pct(cobAno / nMun) + ' do estado' : null, status: nMun && cobAno === nMun ? 'bom' : null },
      { rotulo: `Sem levantamento em ${cob.ano}`, valor: nSit(0), detalhe: 'tiveram levantamento nos últimos 365 dias', status: nSit(0) ? 'atencao' : null },
      { rotulo: 'Sem levantamento em 365 dias', valor: nSit(-1), detalhe: 'nenhum registro em 365 dias', status: nSit(-1) ? 'serio' : null }
    ]);
    P.tabela(sc, [
      { chave: 'sit', rotulo: 'Situação', html: v => selo(SIT_COB[v][0], SIT_COB[v][1]), fmt: v => SIT_COB[v][1], csv: v => SIT_COB[v][1] },
      { chave: 'municipio', rotulo: 'Município' },
      { chave: 'periodo', rotulo: 'Levantam. no período', num: true, fmt: fmt.int }, { chave: 'deteccoes', rotulo: 'Detecções no período', num: true, fmt: fmt.int },
      { chave: 'ultAno', rotulo: `Levantam. em ${cob.ano}`, num: true, fmt: fmt.int },
      { chave: 'ultimo', rotulo: 'Último levantamento', fmt: v => v ? fmt.data(v) : 'há mais de 1 ano', ordem: l => l.ultimo || '' },
      { chave: 'dias', rotulo: 'Dias sem visita', num: true, fmt: v => v == null ? '> 365' : fmt.int(v), csv: v => v == null ? '' : v, ordem: l => l.dias == null ? 9999 : l.dias }
    ], cob.linhas, { id: 'pce-cobertura', csv: 'pce-cobertura-municipal.csv', ordenar: 'dias', limite: 15, vazio: 'Nenhum município.' });

    /* Levantamentos */
    const sl = P.secao(c, 'Levantamentos do período', 'Documento do produtor mascarado (LGPD). Busque por propriedade, município, cultura, praga ou servidor.');
    P.tabela(sl, [
      { chave: 'data', rotulo: 'Data', fmt: (v, l) => `${fmt.data(v)}${l.hora ? ' ' + l.hora : ''}`, csv: v => fmt.data(v), ordem: l => (l.data || '') + (l.hora || '') },
      { chave: 'municipio', rotulo: 'Município' },
      { chave: 'propriedade', rotulo: 'Propriedade', fmt: (v, l) => [v, l.codigoPropriedade].filter(Boolean).join(' · ') || '—' },
      { chave: 'nome', rotulo: 'Produtor', fmt: (v, l) => [v, l.doc].filter(Boolean).join(' · ') || '—', html: (v, l) => `${esc(v || '—')}${l.doc ? `<br><span class="pn-sub">${esc(l.doc)}</span>` : ''}` },
      { chave: 'culturasTxt', rotulo: 'Culturas', fmt: (v, l) => l.culturasUnicas.map(cu => { const x = l.culturasLista.find(c => c.cultura === cu); return cu + (x && x.area != null ? ` (${fmt.num(x.area, 1)} ha)` : ''); }).join(', ') || '—', ordem: l => (l.culturasLista[0] || {}).cultura || '' },
      { chave: 'area', rotulo: 'Área (ha)', num: true, fmt: v => v ? fmt.num(v, 1) : '—' },
      { chave: 'pragasTxt', rotulo: 'Pragas', fmt: (v, l) => P.pragasTexto(l) || 'Negativo' + (l.pragasAvaliadas.length ? ` (avaliadas: ${l.pragasAvaliadas.join(', ')})` : ''),
        html: (v, l) => l.pragas.length ? `${selo(l.suspeitas === l.deteccoes ? 'atencao' : 'critico', l.pragas.length + ' praga(s)')}<br>${esc(P.pragasTexto(l))}`
          : `${selo('bom', 'Negativo')}${l.pragasAvaliadas.length ? `<br><span class="pn-sub">avaliadas: ${esc(l.pragasAvaliadas.join(', '))}</span>` : ''}`,
        ordem: l => l.deteccoes },
      { chave: 'nAmostras', rotulo: 'Amostras', num: true, fmt: fmt.int },
      { chave: 'tipoLocal', rotulo: 'Tipo de local', fmt: v => v || 'não informado' },
      { chave: 'origemVisita', rotulo: 'Origem da visita', fmt: v => v || 'não informada' },
      { chave: 'servidor', rotulo: 'Servidor' },
      { chave: 'coord', rotulo: 'GPS', fmt: (v, l) => temCoord(l) ? 'Sim' : 'Não', html: (v, l) => temCoord(l) ? 'Sim' : selo('atencao', 'Não'), ordem: l => temCoord(l) ? 1 : 0 },
      { chave: 'nFotos', rotulo: 'Fotos', num: true, fmt: fmt.int }
    ], levs, { id: 'pce-levantamentos', csv: 'pce-levantamentos.csv', ordenar: 'data', limite: 25, vazio: 'Nenhum levantamento no período.' });

    /* Termos de colheita */
    const st = P.secao(c, 'Termos de Colheita de Amostras', 'Termos válidos do período. A auditoria da numeração considera todos os termos do ano de cada unidade.');
    const gt = P.grade(st);
    const tc = P.contar(termos, t => t.cultura || 'Não informada');
    P.grafico(gt, 'pce-termos-cultura', { type: 'bar', titulo: 'Termos por cultura', altura: altH(tc.length), subtitulo: 'Termos de colheita válidos no período', tabelaRotulo: 'Cultura',
      options: horiz(), vazio: 'Nenhum termo de colheita no período.', data: { labels: tc.map(x => x[0]), datasets: [{ label: 'Termos', data: tc.map(x => x[1]), cor: p.serie[2] }] } });
    const ta = P.topN(P.contar(termos, t => String(t.analise || '').trim() || 'Não informada'), 8, 'Outras');
    P.grafico(gt, 'pce-termos-analise', { type: 'bar', titulo: 'Tipo de análise solicitada', altura: altH(ta.length), subtitulo: 'Termos por análise', tabelaRotulo: 'Análise',
      options: horiz(), vazio: 'Nenhum termo de colheita no período.', data: { labels: ta.map(x => x[0]), datasets: [{ label: 'Termos', data: ta.map(x => x[1]), cor: p.serie[2] }] } });
    const situacaoTermo = t => { const s = [];
      if (t.conflito) s.push(['critico', 'Conflito de nº']);
      if (t.numeroOrigem === 'editado') s.push(['atencao', 'Nº editado']);
      if (t.numeroOrigem === 'provisorio') s.push(['atencao', 'Nº provisório']);
      if (!s.length) s.push(['bom', 'Regular']); return s; };
    const levIds = new Set(((d.semFiltro && d.semFiltro.levantamentos) || levs).map(l => l.id));
    P.tabela(st, [
      { chave: 'numeroTxt', rotulo: 'Nº', fmt: (v, l) => numTermo(l), ordem: l => (l.ano || 0) * 1e6 + (l.numero || 0) },
      { chave: 'data', rotulo: 'Data', fmt: (v, l) => `${fmt.data(v)}${l.hora ? ' ' + l.hora : ''}`, csv: v => fmt.data(v), ordem: l => (l.data || '') + (l.hora || '') },
      { chave: 'unidade', rotulo: 'Unidade' }, { chave: 'municipio', rotulo: 'Município' }, { chave: 'cultura', rotulo: 'Cultura' },
      { chave: 'quantidade', rotulo: 'Amostras', num: true, fmt: v => v == null || v === '' ? '—' : String(v), ordem: qtdAmostras },
      { chave: 'analise', rotulo: 'Análise' }, { chave: 'partes', rotulo: 'Partes' }, { chave: 'servidor', rotulo: 'Servidor' },
      { chave: 'nome', rotulo: 'Produtor', fmt: (v, l) => [v, l.doc].filter(Boolean).join(' · ') || '—', html: (v, l) => `${esc(v || '—')}${l.doc ? `<br><span class="pn-sub">${esc(l.doc)}</span>` : ''}` },
      { chave: 'levantamentoId', rotulo: 'Levantamento', fmt: v => v ? (levIds.has(v) ? 'Vinculado' : 'Vinculado (fora do período)') : 'Avulso' },
      { chave: 'laboratorio', rotulo: 'Resultado', fmt: v => labTexto(v), html: (v, l) => `${seloLab(v)}${P.gerencia ? `<br><button type="button" class="pn-btn pn-btn-mini" data-laudo="${esc(l.id)}">${icone('amostra')} Registrar</button>` : ''}`,
        ordem: l => ['positivo', 'aguardando', 'inconclusivo', 'inviavel', 'negativo'].indexOf(l.laboratorio ? l.laboratorio.resultado : 'aguardando') },
      { chave: 'sit', rotulo: 'Situação', fmt: (v, l) => situacaoTermo(l).map(x => x[1]).join(', '), html: (v, l) => situacaoTermo(l).map(x => selo(x[0], x[1])).join('<br>'),
        ordem: l => situacaoTermo(l).map(x => ({ critico: 0, atencao: 2, bom: 3 }[x[0]])).reduce((a, b) => Math.min(a, b), 9) }
    ], termos, { id: 'pce-termos', titulo: 'Termos do período', csv: 'pce-termos-de-colheita.csv', ordenar: 'data', limite: 25, vazio: 'Nenhum termo de colheita válido no período.' });
    st.addEventListener('click', ev => { const b = ev.target.closest('[data-laudo]'); if (b) dialogoLaudo(termos.find(t => t.id === b.dataset.laudo)); });

    const linA = audit.map(a => ({ ...a, nDup: a.duplicados.length, nEd: a.editados.length, nProv: a.provisorios.length,
      sit: a.conflitos || a.duplicados.length ? 0 : (a.lacunasTotal || a.editados.length || a.provisorios.length ? 1 : 2) }));
    P.tabela(st, [
      { chave: 'sit', rotulo: 'Situação', html: v => v === 0 ? selo('critico', 'Conflito') : v === 1 ? selo('atencao', 'Verificar') : selo('bom', 'OK'), csv: v => ['Conflito', 'Verificar', 'OK'][v], fmt: v => ['Conflito', 'Verificar', 'OK'][v] },
      { chave: 'grupo', rotulo: 'Unidade' }, { chave: 'ano', rotulo: 'Ano', fmt: v => v == null ? '—' : String(v) },
      { chave: 'total', rotulo: 'Termos no ano', num: true, fmt: fmt.int }, { chave: 'primeiro', rotulo: 'Primeiro nº', num: true, fmt: fmt.int }, { chave: 'ultimo', rotulo: 'Último nº', num: true, fmt: fmt.int },
      { chave: 'lacunasTotal', rotulo: 'Lacunas', num: true, fmt: fmt.int },
      { chave: 'lacunas', rotulo: 'Números faltando', html: v => lista(v || [], 12), csv: v => (v || []).join(' '), fmt: v => (v || []).join(', '), ordem: l => l.lacunasTotal },
      { chave: 'duplicados', rotulo: 'Duplicados', html: v => lista(v || [], 8), csv: v => (v || []).join(' '), fmt: v => (v || []).join(', '), ordem: l => l.nDup },
      { chave: 'editados', rotulo: 'Editados à mão', html: v => lista((v || []).map(e => e.numero + (e.sugerido && e.sugerido !== e.numero ? ` (sug. ${e.sugerido})` : '')), 6),
        csv: v => (v || []).map(e => e.numero).join(' '), fmt: v => (v || []).map(e => e.numero).join(', '), ordem: l => l.nEd },
      { chave: 'provisorios', rotulo: 'Provisórios', html: v => lista((v || []).map(e => e.numero), 6), csv: v => (v || []).map(e => e.numero).join(' '), fmt: v => (v || []).map(e => e.numero).join(', '), ordem: l => l.nProv },
      { chave: 'conflitos', rotulo: 'Conflitos', num: true, fmt: fmt.int }, { chave: 'cancelados', rotulo: 'Cancelados', num: true, fmt: fmt.int }
    ], linA, { id: 'pce-auditoria', titulo: 'Auditoria da numeração', subtitulo: 'Por unidade e ano. Lacuna = número sem termo; duplicado = mesmo número em dois termos.',
      csv: 'pce-auditoria-numeracao.csv', ordenar: 'sit', desc: false, vazio: 'Nenhum termo numerado no período.' });
    secaoMoniliase(c, d, f);
    if (d.colheitasCanceladas.length) {
      P.tabela(st, [
        { chave: 'numeroTxt', rotulo: 'Nº', fmt: (v, l) => numTermo(l), ordem: l => (l.ano || 0) * 1e6 + (l.numero || 0) },
        { chave: 'data', rotulo: 'Data', fmt: fmt.data }, { chave: 'unidade', rotulo: 'Unidade' }, { chave: 'servidor', rotulo: 'Servidor' },
        { chave: 'cultura', rotulo: 'Cultura' }, { chave: 'motivoCancel', rotulo: 'Motivo do cancelamento' }
      ], d.colheitasCanceladas, { id: 'pce-cancelados', titulo: 'Termos cancelados no período', csv: 'pce-termos-cancelados.csv', ordenar: 'data', limite: 10 });
    }
  }

  /* ---------- Resultado do laboratório (Termo de Colheita): o administrador registra pelo painel (action painelPceLaudo) ---------- */
  const LABC = (typeof CONFIG !== 'undefined' && CONFIG.PCE && CONFIG.PCE.laboratorio) || { laboratorios: ['Outro'], resultados: [['aguardando', 'Aguardando']] };
  const RES_LAB = Object.fromEntries(LABC.resultados);
  const SELO_LAB = { positivo: 'critico', negativo: 'bom', aguardando: 'info', inconclusivo: 'atencao', inviavel: 'atencao' };
  const labTexto = v => v ? `${RES_LAB[v.resultado] || 'Aguardando'}${v.resultado === 'positivo' && v.praga ? ': ' + v.praga : ''}${v.laboratorio ? ' · ' + v.laboratorio : ''}${v.laudo ? ' · laudo ' + v.laudo : ''}` : 'Sem registro';
  const seloLab = v => v ? selo(SELO_LAB[v.resultado] || 'info', labTexto(v)) : selo('info', 'Sem registro');
  function dialogoLaudo(t) {
    if (!t) return;
    const velho = document.getElementById('pn-laudo'); if (velho) velho.remove();
    const L0 = t.laboratorio || {}, outro = !!L0.laboratorio && !LABC.laboratorios.includes(L0.laboratorio);
    const dlg = P.el('dialog', 'pn-dlg'); dlg.id = 'pn-laudo';
    dlg.innerHTML = `<form method="dialog" class="pn-dlg-form" novalidate><h3>${icone('amostra')} Resultado do laboratório</h3>
      <p class="pn-sub">Termo ${esc(numTermo(t))} · ${esc(t.cultura || '')} · ${esc(t.municipio || '')} · ${esc(t.quantidade || '')} amostra(s). Grava só o resultado (o termo não muda).</p>
      <label class="pn-dlg-campo">Laboratório<select id="pn-lab-lab"><option value="">Selecione</option>${LABC.laboratorios.map(x => `<option ${(outro ? 'Outro' : L0.laboratorio) === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="pn-dlg-campo" id="pn-lab-outro-l" ${outro ? '' : 'hidden'}>Nome do laboratório<input id="pn-lab-outro" maxlength="80" value="${esc(outro ? L0.laboratorio : '')}"></label>
      <label class="pn-dlg-campo">Data de envio<input id="pn-lab-envio" type="date" value="${esc(L0.envio || '')}"></label>
      <label class="pn-dlg-campo">Nº do laudo<input id="pn-lab-laudo" maxlength="60" value="${esc(L0.laudo || '')}"></label>
      <label class="pn-dlg-campo">Resultado<select id="pn-lab-res">${LABC.resultados.map(([v, r]) => `<option value="${v}" ${(L0.resultado || 'aguardando') === v ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
      <label class="pn-dlg-campo">Data do resultado<input id="pn-lab-data" type="date" value="${esc(L0.dataResultado || '')}"></label>
      <label class="pn-dlg-campo" id="pn-lab-praga-l" ${L0.resultado === 'positivo' ? '' : 'hidden'}>Praga confirmada<input id="pn-lab-praga" maxlength="120" list="pn-lab-pragas" value="${esc(L0.praga || t.pragaTermo || '')}"></label>
      <datalist id="pn-lab-pragas">${((CONFIG.PCE || {}).pragas || []).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <label class="pn-dlg-campo">Observação<textarea id="pn-lab-obs" rows="2" maxlength="500">${esc(L0.obs || '')}</textarea></label>
      ${L0.por ? `<p class="pn-sub">Último registro: ${esc(L0.por)}${L0.atualizadoEm ? ' em ' + esc(fmt.dataHora(L0.atualizadoEm)) : ''}.</p>` : ''}
      <p class="pn-dlg-erro" id="pn-lab-erro" role="alert"></p>
      <div class="pn-dlg-botoes"><button type="button" class="pn-btn" id="pn-lab-cancelar">Cancelar</button><button type="submit" class="pn-btn pn-btn-prim" id="pn-lab-salvar">Salvar resultado</button></div></form>`;
    document.body.appendChild(dlg);
    const q = id => dlg.querySelector('#' + id);
    q('pn-lab-lab').onchange = () => { q('pn-lab-outro-l').hidden = q('pn-lab-lab').value !== 'Outro'; };
    q('pn-lab-res').onchange = () => { q('pn-lab-praga-l').hidden = q('pn-lab-res').value !== 'positivo'; };
    q('pn-lab-cancelar').onclick = () => dlg.close();
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('form').addEventListener('submit', async ev => {
      ev.preventDefault();
      const v = id => q(id).value.trim(), res = v('pn-lab-res');
      const lab = { laboratorio: v('pn-lab-lab') === 'Outro' ? (v('pn-lab-outro') || 'Outro') : v('pn-lab-lab'), laboratorioOutro: v('pn-lab-lab') === 'Outro' ? v('pn-lab-outro') : '',
        envio: v('pn-lab-envio'), laudo: v('pn-lab-laudo'), dataResultado: v('pn-lab-data'), resultado: res, praga: res === 'positivo' ? v('pn-lab-praga') : '', obs: v('pn-lab-obs') };
      const b = q('pn-lab-salvar'); b.disabled = true; q('pn-lab-erro').textContent = '';
      try { await P.chamar({ action: 'painelPceLaudo', id: t.id, laboratorio: lab }); dlg.close(); P.recarregar(); }
      catch (e) { if (!P.logado) return; q('pn-lab-erro').textContent = 'Não salvou: ' + e.message; b.disabled = false; }
    });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }

  /* ---------- Monilíase: Termos de Fiscalização do PCE, Cadastros de imóvel e Relatório de atividades ---------- */
  function secaoMoniliase(c, d, f) {
    const termos = d.termosPceTodos || [], cads = d.cadastrosPce || [];
    const sm = P.secao(c, 'Monilíase: termos e cadastros', 'Termos de Fiscalização do PCE (um por visita) e Cadastros de imóvel com hospedeiros. O relatório de atividades usa os filtros de período, município e servidor.');
    sm.parentNode.classList.add('pn-pce-mon');
    const bar = P.el('div', 'pn-mon-acoes');
    const b = P.el('button', 'pn-btn pn-btn-prim', 'Relatório de atividades'); b.type = 'button'; b.id = 'pn-pce-relatorio';
    b.onclick = () => dialogoRelatorio(d, f); bar.appendChild(b); sm.appendChild(bar);
    const sit = t => [t.cancelado ? 'Cancelado' : '', t.conflito ? 'Conflito de nº' : '', t.numeroOrigem === 'papel' ? 'Do papel' : '', t.numeroOrigem === 'provisorio' ? 'Nº provisório' : ''].filter(Boolean).join(', ') || 'Regular';
    P.tabela(sm, [
      { chave: 'numeroTxt', rotulo: 'Nº', ordem: l => (l.ano || 0) * 1e6 + (l.numero || 0) },
      { chave: 'data', rotulo: 'Data', fmt: (v, l) => `${fmt.data(v)}${l.hora ? ' ' + l.hora : ''}`, csv: v => fmt.data(v), ordem: l => (l.data || '') + (l.hora || '') },
      { chave: 'municipio', rotulo: 'Município' }, { chave: 'nome', rotulo: 'Interessado', fmt: (v, l) => [v, l.doc].filter(Boolean).join(' · ') || '—' },
      { chave: 'plantasInspecionadas', rotulo: 'Plantas', num: true, fmt: fmt.int },
      { chave: 'acoes', rotulo: 'Ações', fmt: v => (Array.isArray(v) ? v : []).join(', ') || '—' },
      { chave: 'amostra', rotulo: 'Amostra', fmt: v => v === 'sim' ? 'Sim' : 'Não' }, { chave: 'servidor', rotulo: 'Servidor' },
      { chave: 'cadastroId', rotulo: 'Cadastro', fmt: v => v ? 'Ligado' : '—' }, { chave: 'sit', rotulo: 'Situação', fmt: (v, l) => sit(l) }
    ], termos, { id: 'pce-termos-fisc', titulo: 'Termos de Fiscalização', csv: 'pce-termos-fiscalizacao.csv', ordenar: 'numeroTxt', limite: 15, vazio: 'Nenhum Termo de Fiscalização no período.' });
    P.tabela(sm, [
      { chave: 'numeroTxt', rotulo: 'Nº', ordem: l => (l.ano || 0) * 1e6 + (l.numero || 0) }, { chave: 'data', rotulo: 'Data', fmt: fmt.data },
      { chave: 'municipio', rotulo: 'Município' }, { chave: 'nome', rotulo: 'Produtor', fmt: (v, l) => [v, l.doc].filter(Boolean).join(' · ') || '—' },
      { chave: 'propriedade', rotulo: 'Propriedade', fmt: v => v || '—' }, { chave: 'totalPlantas', rotulo: 'Plantas', num: true, fmt: fmt.int },
      { chave: 'sintomas', rotulo: 'Sintomas', fmt: (v, l) => (l.dados && l.dados.sintomas === 'sim') ? 'Sim' : 'Não' }, { chave: 'servidor', rotulo: 'Servidor' }
    ], cads, { id: 'pce-cadastros-mon', titulo: 'Cadastros de imóvel (monilíase)', csv: 'pce-cadastros-moniliase.csv', ordenar: 'numeroTxt', limite: 15, vazio: 'Nenhum cadastro no período.' });
  }
  const REL_LS = 'gdv.painel.relatorioPce';
  function dialogoRelatorio(d, f) {
    if (typeof PCEDocs === 'undefined') return alert('Atualize o painel (falta o gerador do relatório).');
    const velho = document.getElementById('pn-relatorio'); if (velho) velho.remove();
    let m = {}; try { m = JSON.parse(localStorage.getItem(REL_LS) || '{}') || {}; } catch (e) { m = {}; }
    const mun = f.local && f.local.tipo === 'municipio' ? f.local.valor : '';
    const pragas = (CONFIG.PCE.termo && CONFIG.PCE.termo.pragas) || ['Monilíase'];
    const calc = (praga, folders) => PCEDocs.calcularRelatorio(d.termosPceTodos || [], d.cadastrosPce || [], { de: f.de, ate: f.ate, municipio: mun, praga, servidores: f.fiscal ? [f.fiscal] : [], folders });
    let R = calc(m.praga || 'Monilíase');
    const servTxt = R => R.servidores.map(x => [x.nome, x.funcao].filter(Boolean).join(' - ')).join('\n');
    const objetivo = pr => ((CONFIG.PCE.termo || {}).objetivos || {})[pr] || `Executar Ações de Levantamento Fitossanitário de detecção da praga ${pr}, visando a prevenção e ação imediata de contingência.`;
    const dlg = P.el('dialog', 'pn-dlg pn-dlg-rel'); dlg.id = 'pn-relatorio';
    const campo = (id, rot, v, tag) => `<label class="pn-dlg-campo">${esc(rot)}${tag === 'ta' ? `<textarea id="${id}" rows="3">${esc(v)}</textarea>` : `<input id="${id}" value="${esc(v)}">`}</label>`;
    dlg.innerHTML = `<form method="dialog" class="pn-dlg-form" novalidate><h3>Relatório de atividades</h3>
      <div class="pn-dlg-info"><b>${esc(f.rotuloPeriodo)}${mun ? ' · ' + esc(mun) : ''}${f.fiscal ? ' · ' + esc(f.fiscal) : ''}</b><span id="pn-rel-resumo"></span></div>
      <label class="pn-dlg-campo">Praga/programa<select id="pn-rel-praga">${pragas.map(x => `<option ${x === (m.praga || 'Monilíase') ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      ${campo('pn-rel-conv', 'Convênio nº', m.convenio || '')}${campo('pn-rel-etapa', 'Etapa', m.etapa || '')}
      ${campo('pn-rel-servs', 'Nome dos servidores (Nome - Função, um por linha; inclua o motorista)', servTxt(R), 'ta')}
      ${campo('pn-rel-resp', 'Responsável pela equipe', R.servidores[0] ? [R.servidores[0].nome, R.servidores[0].funcao].filter(Boolean).join(' - ') : '')}
      ${campo('pn-rel-local', 'Local', mun ? mun + '/AM' : R.municipios.map(x => x + '/AM').join(', '))}
      ${campo('pn-rel-obj', 'Objetivo', objetivo(m.praga || 'Monilíase'), 'ta')}${campo('pn-rel-desl', 'Deslocamento', m.deslocamento || '')}
      ${campo('pn-rel-folders', 'Educação Sanitária: nº de folders e flyers distribuídos', '')}
      ${campo('pn-rel-obs', 'OBS', m.obs != null ? m.obs : 'Anexo Termo de Fiscalização e Cadastro de imóveis', 'ta')}
      <label><input type="checkbox" id="pn-rel-anexos" ${m.anexos === false ? '' : 'checked'}> Anexar os Termos de Fiscalização e os Cadastros ligados (CPF mascarado)</label>
      <div class="pn-dlg-botoes"><button type="button" class="pn-btn" id="pn-rel-cancelar">Cancelar</button><button type="submit" class="pn-btn pn-btn-prim" id="pn-rel-ok">${icone('imprimir')} Imprimir / PDF</button></div></form>`;
    document.body.appendChild(dlg);
    const q = id => dlg.querySelector('#' + id);
    const resumo = () => { q('pn-rel-resumo').textContent = `${R.nTermos} termo(s) · ${R.textos.plantas} · Educação Sanitária: ${R.textos.educacao} · ${R.cadastros.length} cadastro(s)`; };
    const recalc = () => { R = calc(q('pn-rel-praga').value, Number(String(q('pn-rel-folders').value).replace(/\D/g, '')) || 0); resumo(); };
    resumo();
    q('pn-rel-praga').onchange = () => { recalc(); q('pn-rel-obj').value = objetivo(q('pn-rel-praga').value); };
    q('pn-rel-folders').oninput = recalc;
    q('pn-rel-cancelar').onclick = () => dlg.close();
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('form').addEventListener('submit', async ev => {
      ev.preventDefault(); recalc();
      const v = id => q(id).value.trim(), anexar = q('pn-rel-anexos').checked;
      const rel = { convenio: v('pn-rel-conv'), etapa: v('pn-rel-etapa'), responsavel: v('pn-rel-resp'), de: f.de, ate: f.ate, local: v('pn-rel-local'), objetivo: v('pn-rel-obj'),
        deslocamento: v('pn-rel-desl'), praga: q('pn-rel-praga').value, obs: v('pn-rel-obs'), calc: R,
        servidores: v('pn-rel-servs').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [nome, ...r] = l.split(/\s+-\s+/); return { nome, funcao: r.join(' - ') }; }) };
      try { localStorage.setItem(REL_LS, JSON.stringify({ praga: rel.praga, convenio: rel.convenio, etapa: rel.etapa, deslocamento: rel.deslocamento, obs: rel.obs, anexos: anexar })); } catch (e) { /* sem armazenamento */ }
      dlg.close();
      await imprimirRelatorio(rel, anexar ? { termos: R.termos, cadastros: R.cadastros } : null);
    });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  /** Imprime o relatório (modelo ../documentos/pce-relatorio.html num iframe, como no app). */
  async function imprimirRelatorio(rel, anexos) {
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:0';
    await new Promise((ok, no) => { fr.onload = ok; fr.onerror = no; fr.src = '../documentos/pce-relatorio.html'; document.body.appendChild(fr); });
    const w = fr.contentWindow;
    for (let i = 0; i < 50 && !w.PCEDocs; i++) await new Promise(r => setTimeout(r, 50));
    await w.PCEDocs.montar(fr.contentDocument, 'relatorio', rel, { anexos });
    const titulo = document.title, nome = `Relatorio_Atividades_${String(rel.local || '').replace(/[^\w]+/g, '_')}_${rel.de}_a_${rel.ate}`;
    document.title = nome; fr.contentDocument.title = nome;
    w.addEventListener('afterprint', () => { document.title = titulo; fr.remove(); });
    w.focus(); w.print();
  }

  P.registrarAba({ id: 'pce', titulo: 'PCE', render, indicadores, calculos,
    contador: d => alertasPce(d).filter(a => a.nivel === 'critico').length });
})();
