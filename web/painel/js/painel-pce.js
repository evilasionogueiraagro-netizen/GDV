/* Painel gerencial do GDV — aba "PCE" (Levantamento fitossanitário e Termo de Colheita de Amostras). Usa a API do objeto global Painel (js/painel.js). */
(() => {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, fmt = P.fmt, esc = P.esc, norm = P.norm;
  const COBERTURA_DIAS = 90;

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
    const N = d.semFiltro || {}, lim = P.somaDias(f.ate, -(COBERTURA_DIAS - 1));
    const ultimo = {}, no90 = {};
    const marca = (mun, data) => { const k = norm(mun); if (!k || !data || data > f.ate) return; if (!ultimo[k] || data > ultimo[k]) ultimo[k] = data; if (data >= lim) no90[k] = (no90[k] || 0) + 1; };
    (d.historicoPce || []).forEach(h => marca(h.municipio, h.data));
    (N.levantamentos || d.levantamentos).forEach(l => marca(l.municipio, l.data));
    const noPer = {}, det = {}; d.levantamentos.forEach(l => { const k = norm(l.municipio); noPer[k] = (noPer[k] || 0) + 1; det[k] = (det[k] || 0) + l.deteccoes; });
    let muns = P.municipios;
    if (f.local && f.local.tipo === 'municipio') muns = muns.filter(m => norm(m) === norm(f.local.valor));
    const linhas = muns.map(m => {
      const k = norm(m), u = ultimo[k] || null;
      const sit = no90[k] ? (noPer[k] ? 2 : 1) : (u ? 0 : -1);
      return { municipio: m, periodo: noPer[k] || 0, deteccoes: det[k] || 0, ult90: no90[k] || 0, ultimo: u, dias: u ? P.diasEntre(u, f.ate) : null, sit };
    });
    return { linhas, lim };
  }
  const SIT_COB = { 2: ['bom', 'Coberto no período'], 1: ['bom', `Coberto (${COBERTURA_DIAS} dias)`], 0: ['atencao', `Sem levantamento há + de ${COBERTURA_DIAS} dias`], '-1': ['serio', 'Sem levantamento no último ano'] };

  /* ---------- focos de pragas (praga × município) ---------- */
  function focos(d) {
    const hist = new Set(); (d.historicoPce || []).forEach(h => h.pragas.forEach(pr => hist.add(norm(h.municipio) + '|' + norm(pr))));
    const G = {};
    d.levantamentos.forEach(l => l.culturasLista.forEach(c => {
      if (!c.praga) return;
      const k = norm(l.municipio) + '|' + norm(c.praga);
      const g = G[k] = G[k] || { praga: c.praga, municipio: l.municipio || 'Não informado', deteccoes: 0, levs: new Set(), props: new Set(), culturas: new Set(), primeira: l.data, ultima: l.data, amostras: 0, novo: !hist.has(k) };
      g.deteccoes++; g.levs.add(l.id); g.props.add(chaveProp(l)); g.culturas.add(c.cultura); if (c.coleta) g.amostras++;
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

  /* ---------- render ---------- */
  function render(c, d, f) {
    const p = P.paleta;
    const levs = d.levantamentos, nL = levs.length, itens = itensCultura(levs);
    const comPraga = levs.filter(l => l.detectou).length, det = itens.filter(x => x.praga).length;
    const props = new Set(levs.map(chaveProp)).size;
    const area = levs.reduce((s, l) => s + (l.area || 0), 0);
    const amostras = levs.reduce((s, l) => s + l.nAmostras, 0);
    const tipos = new Set(itens.map(x => x.cultura)).size;
    const termos = d.colheitas, amostrasTermos = termos.reduce((s, t) => s + qtdAmostras(t), 0);
    const cob = cobertura(d, f), nMun = cob.linhas.length;
    const cob90 = cob.linhas.filter(l => l.sit >= 1).length, munPer = cob.linhas.filter(l => l.periodo).length;
    const audBase = d.auditoria.pce || [];
    const audit = f.local && f.local.tipo === 'municipio' ? audBase.filter(a => norm(a.grupo) === norm(f.local.valor)) : audBase;
    const nConf = audit.reduce((s, a) => s + (a.conflitos || 0) + a.duplicados.length, 0);

    const s0 = P.el('p', 'pn-sub', `Período: ${esc(f.rotuloPeriodo)}${f.fiscal ? ' · Servidor: ' + esc(f.fiscal) : ''}${f.local && f.local.tipo === 'municipio' ? ' · Município: ' + esc(f.local.valor) : ''}` +
      (f.local && f.local.tipo === 'barreira' ? ' · (o filtro de barreira não se aplica ao PCE)' : ''));
    s0.style.marginTop = '4px'; c.appendChild(s0);

    /* KPIs */
    const kp = P.secao(c, 'Indicadores do PCE');
    kp.parentNode.classList.add('pn-pce-kpis');
    P.kpis(kp, [
      { rotulo: 'Levantamentos', valor: nL, detalhe: `${fmt.int(munPer)} município(s) no período` },
      { rotulo: 'Propriedades visitadas', valor: props, detalhe: 'distintas (código ou nome da propriedade)' },
      { rotulo: 'Área inspecionada', valor: area ? fmt.ha(area) : '0 ha', detalhe: 'soma das áreas das culturas' },
      { rotulo: 'Culturas inspecionadas', valor: itens.length, detalhe: `${fmt.int(tipos)} cultura(s) diferente(s)` },
      { rotulo: 'Taxa de detecção', valor: nL ? fmt.pct(comPraga / nL, 1) : '—', detalhe: `${fmt.int(comPraga)} levantamento(s) com praga · ${fmt.int(det)} detecção(ões)`,
        status: comPraga ? 'critico' : (nL ? 'bom' : null), titulo: 'Percentual de levantamentos com alguma praga detectada em ao menos uma cultura' },
      { rotulo: 'Amostras coletadas', valor: amostras, detalhe: 'culturas com coleta = Sim' },
      { rotulo: 'Termos de colheita', valor: termos.length, detalhe: `${fmt.int(amostrasTermos)} amostra(s) nos termos${d.colheitasCanceladas.length ? ` · ${d.colheitasCanceladas.length} cancelado(s)` : ''}${nConf ? ` · ${nConf} conflito(s) de nº` : ''}`,
        status: nConf ? 'critico' : null },
      { rotulo: `Cobertura (${COBERTURA_DIAS} dias)`, valor: `${fmt.int(cob90)} / ${fmt.int(nMun)}`, detalhe: `municípios com levantamento de ${fmt.dataCurta(cob.lim)} a ${fmt.dataCurta(f.ate)}`,
        status: nMun && cob90 / nMun < 0.5 ? 'atencao' : null }
    ]);

    /* Alertas */
    const al = alertasPce(d);
    const sa = P.secao(c, 'Alertas do módulo', al.length ? `${al.length} alerta(s) · ordem: crítico → sério → atenção.` : null);
    sa.parentNode.classList.add('pn-pce-alertas');
    P.alertas(P.cartao(sa), al, { max: matchMedia('(max-width: 700px)').matches ? 3 : 5, vazio: 'Nenhum alerta do PCE no período.' });

    /* Mapa */
    const sm = P.secao(c, 'Mapa do Amazonas', 'Levantamentos (laranja com anel = praga detectada, azul = sem praga), calor das detecções, termos de colheita e indicador por município. Use os filtros de praga e cultura do calor.');
    sm.parentNode.classList.add('pn-pce-mapa');
    P.mapa(sm, { id: 'pce', titulo: 'PCE no estado', camadas: ['levantamentos', 'colheitas', 'calor', 'coropletico'], ativas: ['levantamentos', 'colheitas', 'calor'], indicador: 'deteccoes' });

    /* Atividade e detecção */
    const g = P.grade(P.secao(c, 'Levantamentos e detecções', 'Cores fixas em todo o módulo, inclusive no mapa: azul = sem praga, laranja = com praga detectada, verde = termo de colheita.'));
    const ex = eixoTempo(f);
    P.grafico(g, 'pce-tempo', { type: 'bar', titulo: ex.porSemana ? 'Levantamentos por semana' : 'Levantamentos por dia', subtitulo: 'Empilhado por resultado',
      tabelaRotulo: ex.porSemana ? 'Semana iniciada em' : 'Dia', options: pilhaX, vazio: 'Nenhum levantamento no período.',
      data: { labels: ex.rot, datasets: serieDeteccao(ex.rot, ex.chave, levs, l => l.detectou, p) } });
    const pr = P.contar(itens.filter(x => x.praga), 'praga');
    P.grafico(g, 'pce-pragas', { type: 'bar', titulo: 'Detecções por praga', altura: altH(pr.length), subtitulo: 'Nº de culturas com a praga detectada', tabelaRotulo: 'Praga',
      options: horiz(), vazio: 'Nenhuma praga detectada no período.',
      data: { labels: pr.map(x => x[0]), datasets: [{ label: 'Detecções', data: pr.map(x => x[1]), cor: p.serie[1] }] } });
    const mun = P.contar(levs, l => l.municipio || 'Não informado').map(x => x[0]).slice(0, 15);
    P.grafico(g, 'pce-municipio', { type: 'bar', titulo: 'Levantamentos por município', altura: altH(mun.length), subtitulo: mun.length >= 15 ? 'Os 15 municípios com mais levantamentos' : null,
      tabelaRotulo: 'Município', options: pilhaY(), vazio: 'Nenhum levantamento no período.',
      data: { labels: mun, datasets: serieDeteccao(mun, l => l.municipio || 'Não informado', levs, l => l.detectou, p) } });
    const cul = P.contar(itens, 'cultura').map(x => x[0]).slice(0, 15);
    P.grafico(g, 'pce-culturas', { type: 'bar', titulo: 'Culturas inspecionadas', altura: altH(cul.length), subtitulo: 'Nº de vezes que a cultura foi inspecionada, por resultado', tabelaRotulo: 'Cultura',
      options: pilhaY(), vazio: 'Nenhuma cultura inspecionada no período.',
      data: { labels: cul, datasets: serieDeteccao(cul, x => x.cultura, itens, x => !!x.praga, p) } });
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
    const fc = focos(d).sort((a, b) => (b.novo - a.novo) || (b.deteccoes - a.deteccoes) || String(b.ultima).localeCompare(String(a.ultima)));
    P.tabela(sf, [
      { chave: 'novo', rotulo: 'Situação', html: v => v ? selo('critico', 'Novo foco') : selo('atencao', 'Recorrente'), fmt: v => v ? 'Novo foco' : 'Recorrente', csv: v => v ? 'Novo foco' : 'Recorrente', ordem: l => l.novo ? 1 : 0 },
      { chave: 'praga', rotulo: 'Praga / doença' }, { chave: 'municipio', rotulo: 'Município' },
      { chave: 'deteccoes', rotulo: 'Detecções', num: true, fmt: fmt.int }, { chave: 'levantamentos', rotulo: 'Levantam.', num: true, fmt: fmt.int },
      { chave: 'propriedades', rotulo: 'Propriedades', num: true, fmt: fmt.int }, { chave: 'amostras', rotulo: 'Amostras', num: true, fmt: fmt.int },
      { chave: 'culturasTxt', rotulo: 'Culturas' },
      { chave: 'primeira', rotulo: 'Primeira', fmt: fmt.data }, { chave: 'ultima', rotulo: 'Última', fmt: fmt.data }
    ], fc, { id: 'pce-focos', csv: 'pce-focos-de-pragas.csv', ordenar: 'novo', limite: 15, vazio: 'Nenhuma praga detectada no período.' });

    /* Cobertura */
    const sc = P.secao(c, 'Cobertura municipal', `Municípios com e sem levantamento no período e nos últimos ${COBERTURA_DIAS} dias (até ${fmt.data(f.ate)}). Considera todos os servidores e o histórico de 365 dias.`);
    sc.parentNode.classList.add('pn-pce-cobertura');
    const nSit = k => cob.linhas.filter(l => l.sit === k).length;
    P.kpis(sc, [
      { rotulo: 'Com levantamento no período', valor: munPer, detalhe: `de ${fmt.int(nMun)} município(s)` },
      { rotulo: `Cobertos nos últimos ${COBERTURA_DIAS} dias`, valor: cob90, detalhe: nMun ? fmt.pct(cob90 / nMun) + ' do estado' : null, status: nMun && cob90 === nMun ? 'bom' : null },
      { rotulo: `Sem levantamento há + de ${COBERTURA_DIAS} dias`, valor: nSit(0), detalhe: 'tiveram levantamento no último ano', status: nSit(0) ? 'atencao' : null },
      { rotulo: 'Sem levantamento no último ano', valor: nSit(-1), detalhe: 'nenhum registro em 365 dias', status: nSit(-1) ? 'serio' : null }
    ]);
    P.tabela(sc, [
      { chave: 'sit', rotulo: 'Situação', html: v => selo(SIT_COB[v][0], SIT_COB[v][1]), fmt: v => SIT_COB[v][1], csv: v => SIT_COB[v][1] },
      { chave: 'municipio', rotulo: 'Município' },
      { chave: 'periodo', rotulo: 'Levantam. no período', num: true, fmt: fmt.int }, { chave: 'deteccoes', rotulo: 'Detecções no período', num: true, fmt: fmt.int },
      { chave: 'ult90', rotulo: `Levantam. em ${COBERTURA_DIAS} dias`, num: true, fmt: fmt.int },
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
      { chave: 'culturasTxt', rotulo: 'Culturas', fmt: (v, l) => l.culturasLista.map(x => x.cultura + (x.area != null ? ` (${fmt.num(x.area, 1)} ha)` : '')).join(', ') || '—', ordem: l => (l.culturasLista[0] || {}).cultura || '' },
      { chave: 'area', rotulo: 'Área (ha)', num: true, fmt: v => v ? fmt.num(v, 1) : '—' },
      { chave: 'pragasTxt', rotulo: 'Pragas', fmt: (v, l) => l.pragas.join(', ') || 'Nenhuma', html: (v, l) => l.pragas.length ? `${selo('critico', l.pragas.length + ' praga(s)')}<br>${esc(l.pragas.join(', '))}` : selo('bom', 'Nenhuma'),
        ordem: l => l.deteccoes },
      { chave: 'nAmostras', rotulo: 'Amostras', num: true, fmt: fmt.int },
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
      { chave: 'sit', rotulo: 'Situação', fmt: (v, l) => situacaoTermo(l).map(x => x[1]).join(', '), html: (v, l) => situacaoTermo(l).map(x => selo(x[0], x[1])).join('<br>'),
        ordem: l => situacaoTermo(l).map(x => ({ critico: 0, atencao: 2, bom: 3 }[x[0]])).reduce((a, b) => Math.min(a, b), 9) }
    ], termos, { id: 'pce-termos', titulo: 'Termos do período', csv: 'pce-termos-de-colheita.csv', ordenar: 'data', limite: 25, vazio: 'Nenhum termo de colheita válido no período.' });

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
    if (d.colheitasCanceladas.length) {
      P.tabela(st, [
        { chave: 'numeroTxt', rotulo: 'Nº', fmt: (v, l) => numTermo(l), ordem: l => (l.ano || 0) * 1e6 + (l.numero || 0) },
        { chave: 'data', rotulo: 'Data', fmt: fmt.data }, { chave: 'unidade', rotulo: 'Unidade' }, { chave: 'servidor', rotulo: 'Servidor' },
        { chave: 'cultura', rotulo: 'Cultura' }, { chave: 'motivoCancel', rotulo: 'Motivo do cancelamento' }
      ], d.colheitasCanceladas, { id: 'pce-cancelados', titulo: 'Termos cancelados no período', csv: 'pce-termos-cancelados.csv', ordenar: 'data', limite: 10 });
    }
  }

  P.registrarAba({ id: 'pce', titulo: 'PCE', render,
    contador: d => alertasPce(d).filter(a => a.nivel === 'critico').length });
})();
