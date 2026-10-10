/* Painel gerencial do GDV — aba "TF de Barreira" (Termos de Fiscalização). Usa a API do objeto global Painel (js/painel.js). */
(() => {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, fmt = P.fmt, esc = P.esc, norm = P.norm;

  /* Procedimentos na ordem fixa do app (CONFIG.TF.procedimentos) + "não informado". A cor segue o procedimento, nunca a posição. */
  const PROCS = Object.keys(P.PROC);                               // ['liberacao','apreensao','rechaco']
  const SEM = '_sem';
  const nomeProc = k => k === SEM ? 'Sem procedimento' : (P.PROC[k] || k);
  const curtoProc = k => ({ liberacao: 'Liberação', apreensao: 'Apreensão', rechaco: 'Rechaço' }[k] || nomeProc(k));
  const procDe = t => PROCS.includes(t.procedimento) ? t.procedimento : SEM;
  const corProc = (k, p) => k === SEM ? p.mut : p.cor(Math.max(0, PROCS.indexOf(k)));
  const DOCS = { nf: 'Nota fiscal', ptv: 'PTV', gta: 'GTA', sif: 'SIF', sie: 'SIE', sim: 'SIM', lacre: 'Lacre', outros: 'Outros' };
  const separarNomes = s => String(s || '').split(/\s+e\s+|,|;|\//).map(x => x.trim()).filter(Boolean);
  let camadaTF = true;                                             // camada "TFs por local" do mapa (lembrada entre atualizações)

  /* ---------- auxiliares ---------- */
  function documentos(t) {
    const v = t.documentos;
    let o = Array.isArray(v) ? v : P.lerJSON(v, null);
    if (o && !Array.isArray(o) && typeof o === 'object') o = Object.keys(o).filter(k => String(o[k] || '').trim());
    return Array.isArray(o) ? o.map(x => String(x).trim().toLowerCase()).filter(Boolean) : [];
  }
  /** Unidade canônica: Kg e Ton viram kg (Ton × 1000); demais ficam como estão. */
  function unidade(u) {
    const n = norm(u);
    if (/^(kg|kgs|quilo|quilos|kilo|kilos|quilograma|quilogramas)$/.test(n)) return ['kg', 1];
    if (/^(t|ton|tons|tonelada|toneladas)$/.test(n)) return ['kg', 1000];
    if (/^(cx|cxs|caixa|caixas)$/.test(n)) return ['caixas', 1];
    if (/^(saco|sacos|sc)$/.test(n)) return ['sacos', 1];
    if (/^(un|und|unid|unidade|unidades)$/.test(n)) return ['unidades', 1];
    if (/^(muda|mudas)$/.test(n)) return ['mudas', 1];
    return [n || 'sem unidade', 1];
  }
  /** Local (texto livre) com nome canônico do município do AM quando casa; senão o texto aparado. */
  function lugar(txt) {
    const s = String(txt || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    return P.municipioNome(s) || s;
  }
  function serieEmpilhada(rotulos, chaveDe, lista, p) {
    const idx = new Map(rotulos.map((r, i) => [r, i]));
    const ks = PROCS.concat(SEM);
    const series = ks.map(k => ({ k, v: rotulos.map(() => 0) }));
    lista.forEach(t => { const keys = [].concat(chaveDe(t)); keys.forEach(r => { const i = idx.get(r); if (i != null) series[ks.indexOf(procDe(t))].v[i]++; }); });
    return series.filter(s => s.v.some(Boolean)).map(s => ({ label: curtoProc(s.k), data: s.v, cor: corProc(s.k, p) }));
  }
  const pilhaY = { indexAxis: 'y', scales: { x: { stacked: true }, y: { stacked: true } } };
  const pilhaX = { scales: { x: { stacked: true }, y: { stacked: true } } };
  const altH = n => Math.max(170, Math.min(620, n * 30 + 90));       // barras horizontais com legenda: espaço para todos os rótulos
  const selo = (cls, txt) => `<span class="pn-selo ${cls}">${esc(txt)}</span>`;

  function situacaoTF(t) {
    const s = [];
    if (t.conflito) s.push(['critico', 'Conflito de nº']);
    if (t.numeroOrigem === 'editado') s.push(['atencao', 'Nº editado']);
    if (t.numeroOrigem === 'provisorio') s.push(['atencao', 'Nº provisório']);
    if (t.reincidente) s.push(['serio', 'Reincidente']);
    if (!s.length) s.push(['bom', 'Regular']);
    return s;
  }

  /* ---------- alertas próprios do módulo ---------- */
  function alertasTF(d) {
    const A = P.alertasGerais(d).filter(a => a.aba === 'tf');
    const sem = d.tfs.filter(t => procDe(t) === SEM);
    if (sem.length) A.push({ nivel: 'atencao', titulo: `${sem.length} TF(s) sem procedimento marcado`,
      detalhe: sem.slice(0, 10).map(t => `${t.numeroTxt || t.numero || '?'} (${fmt.dataCurta(t.data)})`).join(', ') + '. Conferir se foi liberação, apreensão ou rechaço.' });
    const reincRech = d.tfs.filter(t => t.reincidente && t.procedimento === 'rechaco');
    if (reincRech.length) A.push({ nivel: 'atencao', titulo: `${reincRech.length} reincidente(s) com novo rechaço no período`,
      detalhe: reincRech.slice(0, 8).map(t => `TF ${t.numeroTxt || t.numero} · ${t.placa || 's/ placa'} · ${t.doc || ''}`).join('; ') });
    return A;
  }

  /* ---------- camada extra do mapa: TFs por local da barreira ---------- */
  function camadaTFs(m, d, p) {
    if (!m || typeof L === 'undefined') return;
    const turnoPorId = {}; ((d.semFiltro && d.semFiltro.turnosTodos) || d.turnos).forEach(t => { turnoPorId[t.id] = t; });
    const G = {}; let semCoord = 0;
    d.tfs.forEach(t => {
      const tr = turnoPorId[t.turnoId];
      if (!tr || tr.lat == null || tr.lon == null) { semCoord++; return; }
      const k = tr.lat.toFixed(3) + ',' + tr.lon.toFixed(3);
      const g = G[k] = G[k] || { lat: tr.lat, lon: tr.lon, local: t.barreiraNome || tr.local || 'Barreira', mun: tr.municipio || '', n: 0, proc: {} };
      g.n++; const pk = procDe(t); g.proc[pk] = (g.proc[pk] || 0) + 1;
    });
    const grupos = Object.values(G), maxN = Math.max(1, ...grupos.map(g => g.n));
    const camada = L.layerGroup();
    const cor = p.serie[1];
    grupos.sort((a, b) => b.n - a.n).forEach(g => {
      const linhas = PROCS.concat(SEM).filter(k => g.proc[k]).map(k => `<dt>${esc(curtoProc(k))}</dt><dd>${fmt.int(g.proc[k])}</dd>`).join('');
      L.circleMarker([g.lat, g.lon], { radius: 6 + 16 * Math.sqrt(g.n / maxN), color: cor, weight: 2, fillColor: cor, fillOpacity: 0.35 })
        .bindPopup(`<div class="pn-pop"><h4>${esc(g.local)}</h4><dl><dt>Município</dt><dd>${esc(g.mun || '—')}</dd><dt>TFs no período</dt><dd>${fmt.int(g.n)}</dd>${linhas}</dl></div>`)
        .addTo(camada);
    });
    const card = m.map.getContainer().closest('.pn-mapa');
    const ctl = card && card.querySelector('.pn-mapa-ctl');
    const leg = P.el('div', 'pn-legenda pn-tf-legenda');
    const aplicar = () => {
      if (camadaTF) { if (!m.map.hasLayer(camada)) camada.addTo(m.map); } else if (m.map.hasLayer(camada)) m.map.removeLayer(camada);
      leg.hidden = !camadaTF;
    };
    if (ctl) {
      const lab = P.el('label', 'pn-chip', `<input type="checkbox" data-tf-camada="tfs" ${camadaTF ? 'checked' : ''}> TFs por local`);
      ctl.insertBefore(lab, ctl.firstChild);
      lab.querySelector('input').addEventListener('change', e => { camadaTF = e.target.checked; aplicar(); });
    }
    leg.innerHTML = `<span><i class="pn-lg-pto" style="background:${p.alfa(cor, .35)};box-shadow:0 0 0 2px ${cor}"></i>TFs por local de barreira (tamanho = nº de TFs: ${fmt.int(d.tfs.length - semCoord)} no mapa)</span>` +
      (semCoord ? `<span>${fmt.int(semCoord)} TF(s) sem coordenada do turno</span>` : '');
    if (card) card.appendChild(leg);
    aplicar();
  }

  /* ---------- render ---------- */
  function render(c, d, f) {
    const p = P.paleta;
    const tfs = d.tfs, n = tfs.length;
    const nProc = k => tfs.filter(t => procDe(t) === k).length;
    const pct = v => n ? fmt.pct(v / n) + ' dos TFs' : null;
    const autos = tfs.filter(t => t.auto).length, adv = tfs.filter(t => t.advertencia).length, fiel = tfs.filter(t => Number(t.fiel) === 1 || t.fiel === true).length;
    const reinc = tfs.filter(t => t.reincidente), reincAp = reinc.filter(t => t.procedimento === 'apreensao').length;
    const canc = d.tfsCancelados.length, emit = d.tfsTodos.length;
    const coleta = tfs.filter(t => Number(t.coleta) === 1 || t.coleta === true).length;
    const audBase = d.auditoria.tf || [];
    const audit = f.local && f.local.tipo === 'barreira'
      ? audBase.filter(a => norm(a.grupo) === norm(f.local.valor) || norm(a.grupoId) === norm(f.local.valor)) : audBase;
    const nConf = audit.reduce((s, a) => s + (a.conflitos || 0) + a.duplicados.length, 0);
    const nLac = audit.reduce((s, a) => s + (a.lacunasTotal || 0), 0);
    const nEd = audit.reduce((s, a) => s + a.editados.length + a.provisorios.length, 0);

    const s0 = P.el('p', 'pn-sub', `Período: ${esc(f.rotuloPeriodo)}${f.fiscal ? ' · Fiscal: ' + esc(f.fiscal) : ''}${f.local ? ` · ${f.local.tipo === 'barreira' ? 'Barreira' : 'Município'}: ${esc(f.local.valor)}` : ''}`);
    s0.style.marginTop = '4px'; c.appendChild(s0);

    /* KPIs */
    P.kpis(P.secao(c, 'Indicadores do TF de Barreira'), [
      { rotulo: 'TFs emitidos', valor: n, detalhe: d.veiculos.length ? `${fmt.num(n / d.veiculos.length * 100, 1)} por 100 veículos abordados` : (coleta ? `${coleta} com coleta de amostra` : 'válidos (sem cancelados)') },
      { rotulo: 'Liberações', valor: nProc('liberacao'), detalhe: pct(nProc('liberacao')) },
      { rotulo: 'Apreensões p/ destruição', valor: nProc('apreensao'), detalhe: pct(nProc('apreensao')) },
      { rotulo: 'Rechaços (retorno à origem)', valor: nProc('rechaco'), detalhe: pct(nProc('rechaco')) },
      { rotulo: 'Autos de infração', valor: autos, detalhe: `${fmt.int(adv)} advertência(s) · ${fmt.int(fiel)} com fiel depositário` },
      { rotulo: 'Reincidentes', valor: reinc.length, detalhe: reinc.length ? `${fmt.int(reincAp)} com nova apreensão` : 'nenhum no período', status: reincAp ? 'serio' : null },
      { rotulo: 'Cancelados', valor: canc, detalhe: emit ? `${fmt.pct(canc / emit, 1)} dos ${fmt.int(emit)} emitidos` : null },
      { rotulo: 'Conflitos de numeração', valor: nConf, detalhe: `${fmt.int(nLac)} lacuna(s) · ${fmt.int(nEd)} nº editado(s) ou provisório(s)`,
        status: nConf ? 'critico' : (nLac || nEd ? 'atencao' : 'bom'), titulo: 'Auditoria da numeração (ano inteiro de cada barreira presente no período)' }
    ]);

    /* Alertas do módulo */
    const al = alertasTF(d);
    const sa = P.secao(c, 'Alertas do módulo', al.length ? `${al.length} alerta(s) · ordem: crítico → sério → atenção.` : null);
    const ca = P.cartao(sa); P.alertas(ca, al, { max: matchMedia('(max-width: 700px)').matches ? 3 : 5, vazio: 'Nenhum alerta de TF no período.' });

    /* Gráficos */
    const g = P.grade(P.secao(c, 'Emissão e procedimentos', 'Somente TFs válidos (cancelados ficam na auditoria). Cores por procedimento: liberação, apreensão, rechaço.'));
    // por dia (ou semana, em períodos longos)
    let rotDia, chaveDia, tituloDia;
    if (f.dias > 92) {
      const nb = Math.ceil(f.dias / 7);
      rotDia = [...Array(nb).keys()].map(i => fmt.dataCurta(P.somaDias(f.de, i * 7)));
      chaveDia = t => t.data ? rotDia[Math.floor(P.diasEntre(f.de, t.data) / 7)] : null; tituloDia = 'TFs por semana';
    } else {
      rotDia = P.porDia([], f.de, f.ate).labels; const dias = P.porDia([], f.de, f.ate).dias, ix = {}; dias.forEach((x, i) => { ix[x] = rotDia[i]; });
      chaveDia = t => ix[t.data]; tituloDia = 'TFs por dia';
    }
    P.grafico(g, 'tf-dia', { type: 'bar', titulo: tituloDia, subtitulo: 'Empilhado por procedimento', tabelaRotulo: f.dias > 92 ? 'Semana iniciada em' : 'Dia',
      options: pilhaX, data: { labels: rotDia, datasets: serieEmpilhada(rotDia, chaveDia, tfs, p) } });
    // por procedimento
    const pk = PROCS.concat(SEM).filter(k => nProc(k));
    P.grafico(g, 'tf-proc', { type: 'bar', titulo: 'Por procedimento', subtitulo: `${fmt.int(n)} TF(s) válido(s) no período`, options: { indexAxis: 'y' }, tabelaRotulo: 'Procedimento',
      data: { labels: pk.map(nomeProc), datasets: [{ label: 'TFs', data: pk.map(nProc), backgroundColor: pk.map(k => corProc(k, p)) }] } });
    // por barreira
    const bars = P.contar(tfs, t => t.barreiraNome || t.local || 'Sem barreira').map(x => x[0]).slice(0, 15);
    P.grafico(g, 'tf-barreira', { type: 'bar', titulo: 'Por barreira', altura: altH(bars.length), subtitulo: bars.length >= 15 ? 'As 15 barreiras com mais TFs' : null, tabelaRotulo: 'Barreira',
      options: pilhaY, data: { labels: bars, datasets: serieEmpilhada(bars, t => t.barreiraNome || t.local || 'Sem barreira', tfs, p) } });
    // por fiscal
    const fis = P.contar(tfs, t => separarNomes(t.fiscal).length ? separarNomes(t.fiscal) : 'Não informado').map(x => x[0]).slice(0, 15);
    P.grafico(g, 'tf-fiscal', { type: 'bar', titulo: 'Por fiscal', altura: altH(fis.length), subtitulo: 'Produtividade: TFs em que o fiscal consta como emissor', tabelaRotulo: 'Fiscal',
      options: pilhaY, data: { labels: fis, datasets: serieEmpilhada(fis, t => separarNomes(t.fiscal).length ? separarNomes(t.fiscal) : 'Não informado', tfs, p) } });

    /* Produtos e rotas */
    const g2 = P.grade(P.secao(c, 'Produtos e rotas', 'Produtos e trajetos que mais geram apreensão ou rechaço — onde concentrar a fiscalização.'));
    const retidos = tfs.filter(t => t.procedimento === 'apreensao' || t.procedimento === 'rechaco');
    const prodDe = t => [...new Set(t.produtosLista.map(x => String(x.produto).toUpperCase()))];
    const topProd = P.contar(retidos, prodDe).map(x => x[0]).slice(0, 12);
    P.grafico(g2, 'tf-produtos', { type: 'bar', titulo: 'Produtos mais apreendidos ou rechaçados', altura: altH(topProd.length), subtitulo: 'Nº de TFs em que o produto aparece (unidades diferentes não são somadas aqui; veja a tabela de quantidades)',
      tabelaRotulo: 'Produto', options: pilhaY, vazio: 'Nenhuma apreensão ou rechaço no período.',
      data: { labels: topProd, datasets: serieEmpilhada(topProd, prodDe, retidos, p) } });
    const rota = t => { const o = lugar(t.origem), de = lugar(t.destino); return o || de ? `${o || '?'} → ${de || '?'}` : null; };
    const topRotas = P.contar(tfs, rota).map(x => x[0]).slice(0, 10);
    P.grafico(g2, 'tf-rotas', { type: 'bar', titulo: 'Principais rotas (origem → destino)', altura: altH(topRotas.length), subtitulo: 'As 10 rotas com mais TFs, por procedimento', tabelaRotulo: 'Rota',
      options: pilhaY, vazio: 'Origem e destino não informados nos TFs do período.', data: { labels: topRotas, datasets: serieEmpilhada(topRotas, rota, tfs, p) } });
    const topOrig = P.contar(retidos, t => lugar(t.origem) || 'Não informada');
    const orig = P.topN(topOrig, 10, 'Outras origens');
    P.grafico(g2, 'tf-origem', { type: 'bar', titulo: 'Origem das cargas retidas', subtitulo: 'Apreensões + rechaços por local de origem', tabelaRotulo: 'Origem', options: { indexAxis: 'y' },
      vazio: 'Nenhuma apreensão ou rechaço no período.', data: { labels: orig.map(x => x[0]), datasets: [{ label: 'TFs', data: orig.map(x => x[1]), cor: p.serie[1] }] } });
    // documentos apresentados
    const docs = P.contar(tfs, t => { const l = documentos(t); return l.length ? l.map(k => DOCS[k] || k.toUpperCase()) : 'Nenhum documento'; });
    P.grafico(g2, 'tf-docs', { type: 'bar', titulo: 'Documentos apresentados', subtitulo: 'Nº de TFs com cada documento informado (um TF pode ter vários)', tabelaRotulo: 'Documento',
      options: { indexAxis: 'y' }, data: { labels: docs.map(x => x[0]), datasets: [{ label: 'TFs', data: docs.map(x => x[1]) }] } });
    // dia da semana × hora
    const M = P.DIAS_SEMANA.map(() => Array(24).fill(0));
    tfs.forEach(t => { const h = (String(t.hora || '').match(/^(\d{1,2})/) || [])[1]; if (!t.data || h == null || +h > 23) return;
      const [a, mm, dd] = t.data.split('-').map(Number); M[new Date(a, mm - 1, dd).getDay()][+h]++; });
    P.matriz(g2, { id: 'tf-semana-hora', titulo: 'Quando os TFs são lavrados', subtitulo: 'Dia da semana × hora do TF', linhas: P.DIAS_SEMANA, colunas: [...Array(24).keys()], valores: M,
      rotuloColuna: h => h + 'h', passoColuna: 3, larguraRotulo: '40px', rotuloValor: 'TFs', rotuloLinha: 'Dia' });

    /* Mapa */
    const sm = P.secao(c, 'Mapa do Amazonas', 'TFs por local da barreira, barreiras em andamento e indicador por município (padrão: TFs por município de origem da carga).');
    const m = P.mapa(sm, { id: 'tf', titulo: 'TFs no estado', camadas: ['andamento', 'realizadas', 'coropletico'], ativas: ['andamento', 'coropletico'], indicador: 'tfsOrigem' });
    camadaTFs(m, d, p);

    /* Desempenho por barreira */
    const sb = P.secao(c, 'Desempenho por barreira', 'Cruza o controle de veículos com os TFs: taxa de TF e de retenção por veículo abordado.');
    const B = {};
    const bget = nome => { const k = norm(nome) || '—'; return B[k] = B[k] || { barreira: nome || 'Sem barreira', turnos: 0, minutos: 0, veiculos: 0, tfs: 0, liberacao: 0, apreensao: 0, rechaco: 0, autos: 0, reinc: 0 }; };
    d.turnos.forEach(t => { const b = bget(t.local); b.turnos++; b.minutos += t.duracaoContabilMin || 0; b.veiculos += t.nVeiculos; });
    // TF agrupado pelo local do turno em que foi lavrado (mesma chave dos turnos); sem turno, local digitado ou barreira do cadastro
    tfs.forEach(t => { const b = bget(t.localBarreira); b.tfs++; if (b[t.procedimento] != null) b[t.procedimento]++; if (t.auto) b.autos++; if (t.reincidente) b.reinc++; });
    const linB = Object.values(B).filter(b => b.tfs || b.veiculos).map(b => Object.assign(b, {
      taxa: b.veiculos ? b.tfs / b.veiculos * 100 : null, retencao: b.veiculos ? (b.apreensao + b.rechaco) / b.veiculos * 100 : null }));
    const n1 = v => v == null ? '—' : fmt.num(v, 1);
    P.tabela(sb, [
      { chave: 'barreira', rotulo: 'Barreira' }, { chave: 'turnos', rotulo: 'Turnos', num: true, fmt: fmt.int }, { chave: 'minutos', rotulo: 'Horas', num: true, fmt: fmt.horas, csv: v => Math.round(v / 6) / 10 },
      { chave: 'veiculos', rotulo: 'Veículos', num: true, fmt: fmt.int }, { chave: 'tfs', rotulo: 'TFs', num: true, fmt: fmt.int },
      { chave: 'liberacao', rotulo: 'Liberações', num: true, fmt: fmt.int }, { chave: 'apreensao', rotulo: 'Apreensões', num: true, fmt: fmt.int }, { chave: 'rechaco', rotulo: 'Rechaços', num: true, fmt: fmt.int },
      { chave: 'autos', rotulo: 'Autos', num: true, fmt: fmt.int }, { chave: 'reinc', rotulo: 'Reincid.', num: true, fmt: fmt.int },
      { chave: 'taxa', rotulo: 'TFs / 100 veíc.', num: true, fmt: n1, ordem: l => l.taxa == null ? -1 : l.taxa }, { chave: 'retencao', rotulo: 'Retidos / 100 veíc.', num: true, fmt: n1, ordem: l => l.retencao == null ? -1 : l.retencao }
    ], linB, { id: 'tf-desempenho', csv: 'tf-desempenho-por-barreira.csv', ordenar: 'tfs', vazio: 'Nenhum turno ou TF no período.' });

    /* Quantidades por produto */
    const sq = P.secao(c, 'Quantidades por produto', 'Soma das quantidades declaradas por unidade (toneladas convertidas para kg). Itens sem quantidade contam só no nº de TFs.');
    const Q = {};
    tfs.forEach(t => t.produtosLista.forEach(x => {
      const [u, fat] = unidade(x.unidade), prod = String(x.produto).toUpperCase(), k = prod + '|' + u;
      const q = Q[k] = Q[k] || { produto: prod, unidade: u, tfs: new Set(), liberacao: 0, apreensao: 0, rechaco: 0, semProc: 0 };
      q.tfs.add(t.id); const v = x.qtd != null ? x.qtd * fat : 0; const pr = procDe(t);
      if (pr === SEM) q.semProc += v; else q[pr] += v;
    }));
    const linQ = Object.values(Q).map(q => ({ ...q, nTfs: q.tfs.size, retido: q.apreensao + q.rechaco, total: q.liberacao + q.apreensao + q.rechaco + q.semProc }));
    const nq = v => v ? fmt.num(v, 1) : '—';
    P.tabela(sq, [
      { chave: 'produto', rotulo: 'Produto' }, { chave: 'unidade', rotulo: 'Unidade' }, { chave: 'nTfs', rotulo: 'TFs', num: true, fmt: fmt.int },
      { chave: 'liberacao', rotulo: 'Liberado', num: true, fmt: nq }, { chave: 'apreensao', rotulo: 'Apreendido', num: true, fmt: nq }, { chave: 'rechaco', rotulo: 'Rechaçado', num: true, fmt: nq },
      { chave: 'retido', rotulo: 'Retido (apr. + rech.)', num: true, fmt: nq }, { chave: 'total', rotulo: 'Total fiscalizado', num: true, fmt: nq }
    ], linQ, { id: 'tf-quantidades', csv: 'tf-quantidades-por-produto.csv', ordenar: 'retido', limite: 15, vazio: 'Nenhum produto informado nos TFs do período.' });

    /* Auditoria da numeração */
    const sau = P.secao(c, 'Auditoria da numeração', 'Por barreira e ano, sobre todos os TFs do ano (não só do período). Lacuna = número sem TF; duplicado = mesmo número em dois TFs.');
    const lista = (arr, max) => arr.length ? esc(arr.slice(0, max).join(', ')) + (arr.length > max ? ` <span class="pn-sub">+${arr.length - max}</span>` : '') : '—';
    const linA = audit.map(a => ({ ...a, nDup: a.duplicados.length, nEd: a.editados.length, nProv: a.provisorios.length,
      sit: a.conflitos || a.duplicados.length ? 0 : (a.lacunasTotal || a.editados.length || a.provisorios.length ? 1 : 2) }));
    P.tabela(sau, [
      { chave: 'sit', rotulo: 'Situação', html: v => v === 0 ? selo('critico', 'Conflito') : v === 1 ? selo('atencao', 'Verificar') : selo('bom', 'OK'), csv: v => ['Conflito', 'Verificar', 'OK'][v], fmt: v => ['Conflito', 'Verificar', 'OK'][v] },
      { chave: 'grupo', rotulo: 'Barreira' }, { chave: 'ano', rotulo: 'Ano', fmt: v => v == null ? '—' : String(v) },
      { chave: 'total', rotulo: 'TFs no ano', num: true, fmt: fmt.int }, { chave: 'primeiro', rotulo: 'Primeiro nº', num: true, fmt: fmt.int }, { chave: 'ultimo', rotulo: 'Último nº', num: true, fmt: fmt.int },
      { chave: 'lacunasTotal', rotulo: 'Lacunas', num: true, fmt: fmt.int }, { chave: 'lacunas', rotulo: 'Números faltando', html: v => lista(v || [], 12), csv: v => (v || []).join(' '), fmt: v => (v || []).join(', '), ordem: l => l.lacunasTotal },
      { chave: 'duplicados', rotulo: 'Duplicados', html: v => lista(v || [], 8), csv: v => (v || []).join(' '), fmt: v => (v || []).join(', '), ordem: l => l.nDup },
      { chave: 'editados', rotulo: 'Editados à mão', html: v => lista((v || []).map(e => e.numero + (e.sugerido && e.sugerido !== e.numero ? ` (sug. ${e.sugerido})` : '')), 6),
        csv: v => (v || []).map(e => e.numero).join(' '), fmt: v => (v || []).map(e => e.numero).join(', '), ordem: l => l.nEd },
      { chave: 'provisorios', rotulo: 'Provisórios', html: v => lista((v || []).map(e => e.numero), 6), csv: v => (v || []).map(e => e.numero).join(' '), fmt: v => (v || []).map(e => e.numero).join(', '), ordem: l => l.nProv },
      { chave: 'conflitos', rotulo: 'Conflitos', num: true, fmt: fmt.int }, { chave: 'cancelados', rotulo: 'Cancelados', num: true, fmt: fmt.int }
    ], linA, { id: 'tf-auditoria', csv: 'tf-auditoria-numeracao.csv', ordenar: 'sit', desc: false, vazio: 'Nenhum TF numerado no período.' });
    if (d.tfsCancelados.length) {
      P.tabela(sau, [
        { chave: 'numeroTxt', rotulo: 'Nº', fmt: (v, l) => v || (l.numero != null ? String(l.numero) : '—'), ordem: l => (l.ano || 0) * 1e6 + (l.numero || 0) },
        { chave: 'data', rotulo: 'Data', fmt: fmt.data }, { chave: 'barreiraNome', rotulo: 'Barreira' }, { chave: 'fiscal', rotulo: 'Fiscal' },
        { chave: 'procedimento', rotulo: 'Procedimento', fmt: (v, l) => curtoProc(procDe(l)) }, { chave: 'motivoCancel', rotulo: 'Motivo do cancelamento' }
      ], d.tfsCancelados, { id: 'tf-cancelados', titulo: 'TFs cancelados no período', csv: 'tf-cancelados.csv', ordenar: 'data', limite: 10 });
    }

    /* Tabela de TFs */
    const st = P.secao(c, 'Termos de Fiscalização do período', 'Documento do fiscalizado mascarado (LGPD). Busque por nº, placa, produto, fiscal ou nome.');
    P.tabela(st, [
      { chave: 'numeroTxt', rotulo: 'Nº', fmt: (v, l) => v || (l.numero != null ? String(l.numero) : '—'), ordem: l => (l.ano || 0) * 1e6 + (l.numero || 0) },
      { chave: 'data', rotulo: 'Data', fmt: (v, l) => `${fmt.data(v)}${l.hora ? ' ' + l.hora : ''}`, csv: v => fmt.data(v), ordem: l => (l.data || '') + (l.hora || '') },
      { chave: 'barreiraNome', rotulo: 'Barreira' }, { chave: 'fiscal', rotulo: 'Fiscal' },
      { chave: 'procedimento', rotulo: 'Procedimento', fmt: (v, l) => curtoProc(procDe(l)) + (l.auto ? ' + auto' : '') + (l.advertencia ? ' + advertência' : '') },
      { chave: 'placa', rotulo: 'Placa' },
      { chave: 'rota', rotulo: 'Origem → destino', fmt: (v, l) => rota(l) || '—', ordem: l => rota(l) || '' },
      { chave: 'produtosTxt', rotulo: 'Produtos', fmt: (v, l) => l.produtosLista.map(x => `${x.produto}${x.qtd != null ? ' ' + fmt.num(x.qtd, 1) : ''}${x.unidade ? ' ' + x.unidade : ''}`).join('; ') || '—', ordem: l => (l.produtosLista[0] || {}).produto || '' },
      { chave: 'nome', rotulo: 'Fiscalizado', fmt: (v, l) => [v, l.doc].filter(Boolean).join(' · ') || '—',
        html: (v, l) => `${esc(v || '—')}${l.doc ? `<br><span class="pn-sub">${esc(l.doc)}</span>` : ''}` },
      { chave: 'sit', rotulo: 'Situação', fmt: (v, l) => situacaoTF(l).map(x => x[1]).join(', '), html: (v, l) => situacaoTF(l).map(x => selo(x[0], x[1])).join('<br>'),
        ordem: l => situacaoTF(l).map(x => ({ critico: 0, serio: 1, atencao: 2, bom: 3 }[x[0]])).reduce((a, b) => Math.min(a, b), 9) }
    ], tfs, { id: 'tf-lista', csv: 'tfs.csv', ordenar: 'data', limite: 25, vazio: 'Nenhum TF válido no período.' });
  }

  P.registrarAba({ id: 'tf', titulo: 'TF de Barreira', render,
    contador: d => alertasTF(d).filter(a => a.nivel === 'critico').length });
})();
