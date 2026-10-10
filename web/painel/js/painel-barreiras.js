/* Painel gerencial — aba "Barreiras" (módulo Educação Sanitária/Fiscalização). Usa a API do objeto global Painel (js/painel.js). */
(() => {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, fmt = P.fmt, esc = P.esc;
  const LIMITE_LINHA = 45;                 // períodos maiores que isto: série semanal em vez de diária

  const nomeTipo = c => (P.TIPOS[c] && P.TIPOS[c].nome) || (c ? String(c) : 'Não informado');
  const minDe = hm => { const m = String(hm || '').match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const letraDe = t => { const l = String(t.letra || '').trim().toUpperCase(); if (l === 'A' || l === 'B') return l;
    const h = parseInt(t.inicio, 10); return isNaN(h) ? '' : (h >= 4 && h < 12 ? 'A' : 'B'); };
  // horas de barreira: turno aberto há mais de 14 h (provavelmente esquecido) conta 14 h (duracaoContabilMin, ver Painel.normalizar)
  const horasDe = lista => lista.reduce((s, t) => s + (t.duracaoContabilMin || 0), 0);
  const limitadosTxt = lista => { const n = lista.filter(t => t.horasLimitadas).length; return n ? ` · ${n} turno(s) aberto(s) há mais de 14 h contado(s) com 14 h` : ''; };
  const porHora = (n, min) => min > 0 ? n / (min / 60) : null;
  const temCoord = t => (t.latIni != null && t.lonIni != null) || (t.latFim != null && t.lonFim != null);
  const SITUACAO = { ok: 'Em andamento', semsinal: 'Sem sinal > 30 min', longa: 'Aberta > 14 h', encerrada: 'Encerrada' };


  /** Minutos de barreira aberta em cada hora do relógio (0–23) e em cada dia da semana × hora. */
  function cobertura(turnos) {
    const h24 = Array(24).fill(0), sem = P.DIAS_SEMANA.map(() => Array(24).fill(0));
    turnos.forEach(t => {
      const ini = minDe(t.inicio), dur = t.duracaoContabilMin || 0; if (ini == null || !dur || !t.data) return;
      let dow = new Date(t.data + 'T12:00').getDay(), m = ini, resta = dur;
      while (resta > 0) {
        const h = Math.floor(m / 60) % 24, fimHora = (Math.floor(m / 60) + 1) * 60, pedaco = Math.min(resta, fimHora - m);
        h24[h] += pedaco; sem[dow][h] += pedaco; resta -= pedaco; m += pedaco;
        if (m >= 1440) { m -= 1440; dow = (dow + 1) % 7; }
      }
    });
    return { h24, sem };
  }

  /** Agregado por chave (barreira, fiscal, turno A/B). */
  function agregar(turnos, chaves) {
    const G = new Map();
    turnos.forEach(t => [].concat(chaves(t)).forEach(k => {
      if (!k) return; let g = G.get(k);
      if (!g) G.set(k, g = { chave: k, turnos: 0, abertos: 0, min: 0, veiculos: 0, pessoas: 0, ultimo: '', postos: new Set(), municipios: new Set(), fiscais: new Set() });
      g.turnos++; if (t.emAndamento) g.abertos++; g.min += t.duracaoContabilMin || 0; g.veiculos += t.nVeiculos; g.pessoas += t.nPessoas;
      if (t.data > g.ultimo) g.ultimo = t.data; if (t.posto) g.postos.add(t.posto); if (t.municipio) g.municipios.add(t.municipio);
      t.fiscais.forEach(f => g.fiscais.add(f));
    }));
    return [...G.values()].map(g => ({ ...g, vph: porHora(g.veiculos, g.min), mediaTurno: g.turnos ? g.veiculos / g.turnos : null,
      posto: [...g.postos].join(', '), municipio: [...g.municipios].join(', '), nFiscais: g.fiscais.size }));
  }

  function alertasModulo(d) {
    const A = [];
    d.emAndamento.forEach(t => {
      if (t.abertaLonga) A.push({ nivel: 'critico', titulo: `Aberta há ${fmt.duracao(t.duracaoMin)}: ${t.local || 'sem local'}`,
        detalhe: `Início ${fmt.data(t.data)} ${t.inicio || ''} · ${t.fiscal || 'fiscal não informado'}. Confirme se o turno não ficou sem encerrar no aparelho.` });
      else if (t.semSinal) A.push({ nivel: 'serio', titulo: `Sem sinal ${fmt.rel(t.ultimoSinal)}: ${t.local || 'sem local'}`,
        detalhe: `Último dado recebido ${fmt.dataHora(t.ultimoSinal)} · ${t.fiscal || ''}. O aparelho pode estar sem internet; os registros chegam quando reconectar.` });
    });
    const zerados = d.turnos.filter(t => t.encerrado && !t.nVeiculos);
    if (zerados.length) A.push({ nivel: 'atencao', titulo: `${zerados.length} turno(s) encerrado(s) sem nenhum veículo registrado`,
      detalhe: zerados.slice(0, 8).map(t => `${fmt.dataCurta(t.data)} ${t.local || 'sem local'}`).join('; ') + (zerados.length > 8 ? '…' : '') + '. Verifique se a barreira funcionou ou se os registros não foram sincronizados.' });
    const semC = d.turnos.filter(t => !temCoord(t));
    if (semC.length) A.push({ nivel: 'info', titulo: `${semC.length} turno(s) sem coordenada GPS`,
      detalhe: 'Contam nos números, mas não aparecem no mapa. Oriente o fiscal a permitir a localização ao iniciar e encerrar o turno.' });
    const curtos = d.turnos.filter(t => t.encerrado && t.duracaoMin != null && t.duracaoMin < 60);
    if (curtos.length) A.push({ nivel: 'info', titulo: `${curtos.length} turno(s) com menos de 1 h`,
      detalhe: curtos.slice(0, 8).map(t => `${fmt.dataCurta(t.data)} ${t.local || ''} (${fmt.duracao(t.duracaoMin)})`).join('; ') + (curtos.length > 8 ? '…' : '') });
    return A;
  }

  /** Indicadores do módulo (aba e modo TV). Cada item: {chave, rotulo, valor, detalhe, status}. */
  function indicadores(d) {
    const turnos = d.turnos, veiculos = d.veiculos, abertos = d.emAndamento;
    const min = horasDe(turnos), pessoas = veiculos.reduce((s, v) => s + v.pessoas, 0);
    const encerrados = turnos.filter(t => t.encerrado), ruins = abertos.filter(t => t.situacao !== 'ok');
    const longas = abertos.filter(t => t.situacao === 'longa').length;
    return [
      { chave: 'turnos', rotulo: 'Turnos de barreira', valor: turnos.length, detalhe: `${fmt.int(encerrados.length)} encerrado(s) · ${fmt.int(turnos.length - encerrados.length)} aberto(s)` },
      { chave: 'horas', rotulo: 'Horas de barreira', valor: Math.round(min / 60), detalhe: turnos.length ? `média de ${fmt.duracao(min / turnos.length)} por turno${limitadosTxt(turnos)}` : null },
      { chave: 'veiculos', rotulo: 'Veículos abordados', valor: veiculos.length, detalhe: turnos.length ? `${fmt.num(veiculos.length / turnos.length, 1)} por turno` : null },
      { chave: 'pessoas', rotulo: 'Pessoas impactadas', valor: pessoas, detalhe: veiculos.length ? `${fmt.num(pessoas / veiculos.length, 1)} por veículo (estimativa)` : 'estimativa por veículo' },
      { chave: 'vph', rotulo: 'Veículos por hora de barreira', valor: min ? fmt.num(veiculos.length / (min / 60), 1) : '—', detalhe: 'veículos ÷ horas de turno' + limitadosTxt(turnos) },
      { chave: 'andamento', rotulo: 'Em andamento agora', valor: abertos.length, status: longas ? 'critico' : ruins.length ? 'serio' : abertos.length ? 'bom' : null,
        detalhe: abertos.length ? (ruins.length ? `${ruins.length} com alerta (sem sinal ou > 14 h)` : 'todas com sinal') : 'nenhuma barreira aberta' }
    ];
  }

  /**
   * Séries do módulo (aba e modo TV): veículos por dia/semana empilhados por turno A/B, veículos por hora do relógio,
   * cobertura (minutos de barreira aberta por hora) e o agregado por barreira/local (ranking).
   */
  function calculos(d, f) {
    const turnos = d.turnos, veiculos = d.veiculos;
    const turnoPorId = {}; turnos.concat(d.emAndamento).forEach(t => { turnoPorId[t.id] = t; });
    // barras pela data do turno (v.data): fecham com o KPI "Veículos abordados" mesmo quando o turno passa da meia-noite do último dia
    const serieLetra = L => P.porDia(veiculos.filter(v => letraDe(turnoPorId[v.turnoId] || {}) === L), f.de, f.ate, v => v.data);
    const sA = serieLetra('A'), sB = serieLetra('B'), sX = serieLetra('');
    const semanal = sA.labels.length > LIMITE_LINHA;
    const agrupar = sr => { if (!semanal) return sr; const o = { labels: [], valores: [] };
      for (let i = 0; i < sr.valores.length; i += 7) { o.labels.push(sr.labels[i]); o.valores.push(sr.valores.slice(i, i + 7).reduce((a, b) => a + b, 0)); } return o; };
    const wA = agrupar(sA), wB = agrupar(sB), wX = agrupar(sX);
    const h24 = Array(24).fill(0); veiculos.forEach(v => { if (v.horaNum != null && v.horaNum >= 0 && v.horaNum < 24) h24[v.horaNum]++; });
    return { turnoPorId, semanal, porDia: { labels: wA.labels, A: wA.valores, B: wB.valores, X: wX.valores }, h24, cob: cobertura(turnos),
             porBar: agregar(turnos, t => t.local || 'Sem local').sort((a, b) => b.veiculos - a.veiculos) };
  }

  function render(c, d, f) {
    const turnos = d.turnos, veiculos = d.veiculos, abertos = d.emAndamento;
    const K = calculos(d, f);

    const cab = P.el('p', 'pn-sub pn-bar-periodo', `Período: ${esc(f.rotuloPeriodo)}${f.fiscal ? ' · Fiscal: ' + esc(f.fiscal) : ''}${f.local ? ` · ${f.local.tipo === 'barreira' ? 'Barreira' : 'Município'}: ${esc(f.local.valor)}` : ''}`);
    cab.style.marginTop = '4px'; c.appendChild(cab);

    /* ---------- indicadores ---------- */
    P.kpis(P.secao(c, 'Indicadores de Educação Sanitária/Fiscalização'), indicadores(d));

    /* ---------- ao vivo + alertas ---------- */
    const duo = P.el('div', 'pn-duo pn-bar-vivo'); c.appendChild(duo);
    const sv = P.secao(duo, 'Barreiras em andamento agora', abertos.length ? 'Atualiza sozinho a cada minuto. Toque no local para ver no mapa.' : null);
    if (!abertos.length) P.vazio(sv, 'Nenhuma barreira aberta no momento.');
    else {
      const g = P.el('div', 'pn-vivo');
      abertos.slice().sort((a, b) => P.ordemVivo(a) - P.ordemVivo(b) || (b.duracaoMin || 0) - (a.duracaoMin || 0)).forEach(t => {   // TF em preenchimento primeiro
        const it = P.el('div', 'pn-vivo-item' + (t.tfAndamento ? ' tf' : '')); it.dataset.turno = t.id;
        const vph = porHora(t.nVeiculos, t.duracaoContabilMin);
        it.innerHTML = `${P.seloSituacao(t)}<b>${esc(t.local || 'Sem local')}</b><small>${esc(t.fiscal || '')}${t.municipio ? ' · ' + esc(t.municipio) : ''}${t.posto ? ' · posto ' + esc(t.posto) : ''}</small>
          <small>Início ${esc(fmt.dataCurta(t.data))} ${esc(t.inicio || '')} · ${esc(fmt.duracao(t.duracaoMin))} · último sinal ${esc(fmt.rel(t.ultimoSinal))}</small>
          <div class="pn-vivo-num"><span><strong>${fmt.int(t.nVeiculos)}</strong>veículos</span><span><strong>${fmt.int(t.nPessoas)}</strong>pessoas</span>${vph != null ? `<span><strong>${fmt.num(vph, 1)}</strong>/h</span>` : ''}</div>
          <small>${t.ultimoVeiculo ? `Último veículo às ${esc(t.ultimoVeiculo.hora)} (${esc(nomeTipo(t.ultimoVeiculo.tipo))})` : 'Nenhum veículo registrado ainda'}${t.lat == null ? ' · sem GPS' : ''}</small>`;
        if (t.lat != null && t.lon != null) {
          const b = P.el('button', 'pn-link', 'Ver no mapa'); b.type = 'button';
          b.onclick = () => { const m = window.__pnBarMapa; if (!m) return; m.map.setView([t.lat, t.lon], 11); document.querySelector('.pn-bar-mapa').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
          it.appendChild(b);
        }
        const be = P.botaoEncerrar(t); if (be) { const ac = P.el('div', 'pn-vivo-acoes'); ac.appendChild(be); it.appendChild(ac); }
        g.appendChild(it);
      });
      sv.appendChild(g);
    }
    const la = alertasModulo(d);
    const sa = P.secao(duo, 'Alertas do módulo', la.length ? `${la.length} alerta(s) · ordem: crítico → sério → atenção.` : null);
    const caixa = P.el('div', 'pn-cartao pn-alertas-caixa pn-bar-alertas'); sa.appendChild(caixa);
    P.alertas(caixa, la, { max: 5, vazio: 'Nenhum alerta nas barreiras. ✓' });

    /* ---------- movimento ---------- */
    const sm = P.secao(c, 'Movimento de veículos', 'Quando e quanto passa pelas barreiras — base para escala de fiscais e horários de turno.');
    const g1 = P.grade(sm);
    const vComDia = veiculos.map(v => ({ v, dia: v.dia || v.data }));            // dia real da passagem (Painel.normalizar)
    const semanal = K.semanal;
    const dsDia = [{ label: 'Turno A', data: K.porDia.A }, { label: 'Turno B', data: K.porDia.B }];
    if (K.porDia.X.some(Boolean)) dsDia.push({ label: 'Sem turno', data: K.porDia.X });
    P.grafico(g1, 'bar-vdia', { type: 'bar', titulo: semanal ? 'Veículos por semana' : 'Veículos por dia',
      subtitulo: `Pela data de início do turno (turno que passa da meia-noite conta no dia em que começou). Empilhado por turno: A (04h–12h) e B (12h–20h)${semanal ? '. Cada barra = 7 dias a partir da data indicada.' : ''}`,
      tabelaRotulo: semanal ? 'Semana iniciada em' : 'Dia',
      data: { labels: K.porDia.labels, datasets: dsDia },
      options: { scales: { x: { stacked: true }, y: { stacked: true } } } });

    // fluxo ao longo do dia: veículos por hora do relógio + cobertura
    const cob = K.cob, h24 = K.h24;
    const horas = [...Array(24).keys()];
    P.grafico(g1, 'bar-vhora', { type: 'bar', titulo: 'Fluxo ao longo do dia', subtitulo: 'Veículos por hora do relógio (soma do período). Passe o dedo/mouse para ver a taxa por hora de barreira aberta.',
      tabelaRotulo: 'Hora',
      data: { labels: horas.map(h => String(h).padStart(2, '0') + 'h'), datasets: [{ label: 'Veículos', data: h24 }] },
      options: { plugins: { tooltip: { callbacks: { afterBody: it => { const h = it[0].dataIndex, m = cob.h24[h];
        return m ? [`Barreira aberta: ${fmt.horas(m)}`, `Taxa: ${fmt.num(h24[h] / (m / 60), 1)} veículos/h`] : ['Nenhuma barreira aberta nesta hora']; } } } } } });

    // dia da semana × hora
    const M = P.DIAS_SEMANA.map(() => Array(24).fill(0));
    vComDia.forEach(({ v, dia }) => { if (v.horaNum == null || !dia) return; M[new Date(dia + 'T12:00').getDay()][v.horaNum]++; });
    P.matriz(g1, { id: 'bar-semana-hora', titulo: 'Dia da semana × hora', subtitulo: 'Veículos abordados; células vazias = sem movimento ou sem barreira aberta.',
      linhas: P.DIAS_SEMANA, colunas: horas, valores: M, rotuloColuna: h => h + 'h', passoColuna: 3, larguraRotulo: '40px', rotuloValor: 'veículos', rotuloLinha: 'Dia', mostrarValores: false });

    // turno A × B (comparação de desempenho em tabela — medidas de escalas diferentes não dividem um eixo)
    const ab = agregar(turnos, t => letraDe(t) ? 'Turno ' + letraDe(t) : 'Sem turno');
    const cAB = P.cartao(g1, 'Turno A × Turno B', 'A = início das 04h às 11h59; B = demais horários.');
    cAB.classList.add('pn-bar-ab');
    const abOrd = ab.sort((a, b) => a.chave.localeCompare(b.chave));
    const metr = [['Turnos', x => fmt.int(x.turnos)], ['Horas de barreira', x => fmt.horas(x.min)], ['Veículos', x => fmt.int(x.veiculos)],
      ['Pessoas', x => fmt.int(x.pessoas)], ['Veículos por turno', x => fmt.num(x.mediaTurno, 1)], ['Veículos por hora', x => fmt.num(x.vph, 1)]];
    const linhasAB = metr.map(([r, fn]) => { const o = { ind: r }; abOrd.forEach((x, i) => { o['t' + i] = fn(x); }); return o; });
    P.tabela(cAB, [{ chave: 'ind', rotulo: 'Indicador' }].concat(abOrd.map((x, i) => ({ chave: 't' + i, rotulo: x.chave, num: true }))),
      abOrd.length ? linhasAB : [], { simples: true, csv: 'turno-a-x-b.csv', id: 'bar-ab', vazio: 'Sem turnos no período.' });
    const maxAB = Math.max(1, ...ab.map(x => x.vph || 0));
    if (ab.length) {
      const bar = P.el('div', 'pn-bar-ab-barras');
      bar.innerHTML = ab.map((x, i) => `<div class="pn-bar-ab-l"><span>${esc(x.chave)}</span><span class="pn-bar-ab-trilho"><i style="width:${(100 * (x.vph || 0) / maxAB).toFixed(1)}%;background:${P.paleta.cor(i)}"></i></span><b>${fmt.num(x.vph, 1)}/h</b></div>`).join('');
      const leg = P.el('p', 'pn-sub', 'Veículos por hora de barreira'); leg.style.margin = '10px 0 4px'; cAB.appendChild(leg); cAB.appendChild(bar);
    }

    /* ---------- composição ---------- */
    const sc = P.secao(c, 'Composição e desempenho');
    const g2 = P.grade(sc);
    const tp = P.contar(veiculos, v => nomeTipo(v.tipo)), pesTp = Object.fromEntries(P.contar(veiculos, v => nomeTipo(v.tipo), v => v.pessoas));
    P.grafico(g2, 'bar-tipo', { type: 'bar', titulo: 'Veículos por tipo', subtitulo: 'Pessoas estimadas no detalhe de cada barra.', tabelaRotulo: 'Tipo',
      options: { indexAxis: 'y', plugins: { tooltip: { callbacks: { afterBody: it => [`Pessoas: ${fmt.int(pesTp[it[0].label] || 0)}`] } } } },
      data: { labels: tp.map(x => x[0]), datasets: [{ label: 'Veículos', data: tp.map(x => x[1]) }] } });

    const porBar = K.porBar;
    const topBar = porBar.slice(0, 12);
    P.grafico(g2, 'bar-barreira', { type: 'bar', titulo: 'Veículos por barreira / local', subtitulo: porBar.length > 12 ? `12 locais com mais veículos de ${porBar.length}` : 'Turnos e taxa no detalhe de cada barra.',
      tabelaRotulo: 'Barreira / local',
      options: { indexAxis: 'y', plugins: { tooltip: { callbacks: { afterBody: it => { const x = topBar[it[0].dataIndex];
        return [`Turnos: ${fmt.int(x.turnos)} · ${fmt.horas(x.min)}`, `${fmt.num(x.vph, 1)} veículos/h`]; } } } } },
      data: { labels: topBar.map(x => x.chave), datasets: [{ label: 'Veículos', data: topBar.map(x => x.veiculos) }] } });

    const porFis = agregar(turnos, t => t.fiscais.length ? t.fiscais : ['Não informado']);
    const tfsFis = {}; (d.tfs || []).forEach(t => String(t.fiscal || '').split(/\s+e\s+|,|;|\//).map(x => x.trim()).filter(Boolean).forEach(n => { tfsFis[P.norm(n)] = (tfsFis[P.norm(n)] || 0) + 1; }));
    porFis.forEach(x => { x.tfs = tfsFis[P.norm(x.chave)] || 0; });
    const topFis = porFis.slice().sort((a, b) => b.veiculos - a.veiculos).slice(0, 12);
    P.grafico(g2, 'bar-fiscal', { type: 'bar', titulo: 'Produtividade por fiscal', subtitulo: 'Veículos dos turnos em que o fiscal atuou (turno em dupla conta para os dois).',
      tabelaRotulo: 'Fiscal',
      options: { indexAxis: 'y', plugins: { tooltip: { callbacks: { afterBody: it => { const x = topFis[it[0].dataIndex];
        return [`Turnos: ${fmt.int(x.turnos)} · ${fmt.horas(x.min)}`, `${fmt.num(x.vph, 1)} veículos/h · ${fmt.int(x.tfs)} TF(s)`]; } } } } },
      data: { labels: topFis.map(x => x.chave), datasets: [{ label: 'Veículos', data: topFis.map(x => x.veiculos) }] } });

    const postos = agregar(turnos, t => t.posto || 'Não informado').sort((a, b) => b.veiculos - a.veiculos);
    P.grafico(g2, 'bar-posto', { type: 'bar', titulo: 'Horas de barreira por tipo de posto', subtitulo: 'Fixa × Móvel; veículos e taxa no detalhe.', tabelaRotulo: 'Posto',
      altura: 140 + 30 * postos.length,
      options: { indexAxis: 'y', scales: { x: { ticks: { maxTicksLimit: 5, callback: v => fmt.compacto(v) + ' h' } } },
        plugins: { tooltip: { callbacks: { label: ctx => ` ${fmt.num(ctx.raw, 1)} h`, afterBody: it => { const x = postos[it[0].dataIndex];
          return [`Turnos: ${fmt.int(x.turnos)} · veículos: ${fmt.int(x.veiculos)}`, `${fmt.num(x.vph, 1)} veículos/h`]; } } } } },
      data: { labels: postos.map(x => x.chave), datasets: [{ label: 'Horas', data: postos.map(x => Math.round(x.min / 6) / 10) }] } });

    /* ---------- mapa ---------- */
    const smp = P.secao(c, 'Mapa das barreiras', 'Em andamento (tempo real) e realizadas no período; municípios coloridos pelo indicador escolhido.');
    smp.parentNode.classList.add('pn-bar-mapa');
    window.__pnBarMapa = P.mapa(smp, { id: 'barreiras', titulo: 'Barreiras no Amazonas', camadas: ['andamento', 'realizadas', 'coropletico'], ativas: ['andamento', 'realizadas', 'coropletico'], indicador: 'veiculos' });

    /* ---------- tabelas ---------- */
    const st = P.secao(c, 'Detalhamento');
    P.tabela(st, [
      { chave: 'chave', rotulo: 'Barreira / local' }, { chave: 'municipio', rotulo: 'Município', fmt: v => v || '—' }, { chave: 'posto', rotulo: 'Posto', fmt: v => v || '—' },
      { chave: 'turnos', rotulo: 'Turnos', num: true, fmt: fmt.int }, { chave: 'abertos', rotulo: 'Abertos', num: true, fmt: fmt.int },
      { chave: 'min', rotulo: 'Horas', num: true, fmt: fmt.horas, csv: v => Math.round(v / 6) / 10 }, { chave: 'veiculos', rotulo: 'Veículos', num: true, fmt: fmt.int },
      { chave: 'pessoas', rotulo: 'Pessoas', num: true, fmt: fmt.int }, { chave: 'vph', rotulo: 'Veíc./hora', num: true, fmt: v => fmt.num(v, 1), ordem: l => l.vph || 0 },
      { chave: 'nFiscais', rotulo: 'Fiscais', num: true, fmt: fmt.int }, { chave: 'ultimo', rotulo: 'Último turno', fmt: fmt.data }],
    porBar, { titulo: 'Resumo por barreira', subtitulo: 'Use para comparar a produtividade dos locais e planejar onde reforçar.', csv: 'barreiras-resumo.csv', id: 'bar-resumo', ordenar: 'veiculos' });

    P.tabela(st, [
      { chave: 'chave', rotulo: 'Fiscal' }, { chave: 'turnos', rotulo: 'Turnos', num: true, fmt: fmt.int }, { chave: 'min', rotulo: 'Horas', num: true, fmt: fmt.horas, csv: v => Math.round(v / 6) / 10 },
      { chave: 'veiculos', rotulo: 'Veículos', num: true, fmt: fmt.int }, { chave: 'pessoas', rotulo: 'Pessoas', num: true, fmt: fmt.int },
      { chave: 'vph', rotulo: 'Veíc./hora', num: true, fmt: v => fmt.num(v, 1), ordem: l => l.vph || 0 }, { chave: 'tfs', rotulo: 'TFs', num: true, fmt: fmt.int },
      { chave: 'ultimo', rotulo: 'Último turno', fmt: fmt.data }],
    porFis, { titulo: 'Produtividade por fiscal', subtitulo: 'Turno em dupla conta para os dois fiscais. TFs = TFs válidos lavrados pelo fiscal no período.', csv: 'barreiras-fiscais.csv', id: 'bar-fiscais', ordenar: 'veiculos', limite: 15 });

    const ids = new Set(turnos.map(t => t.id)), todos = turnos.concat(abertos.filter(t => !ids.has(t.id)));
    const sit = t => SITUACAO[t.situacao] || '';
    P.tabela(st, [
      { chave: 'data', rotulo: 'Data', fmt: fmt.data, ordem: l => (l.data || '') + (l.inicio || '') }, { chave: 'letra', rotulo: 'Turno', fmt: (v, l) => letraDe(l) || '—' },
      { chave: 'local', rotulo: 'Barreira / local', fmt: v => v || '—' }, { chave: 'municipio', rotulo: 'Município', fmt: v => v || '—' },
      { chave: 'posto', rotulo: 'Posto', fmt: v => v || '—' }, { chave: 'fiscal', rotulo: 'Fiscais', fmt: v => v || '—' },
      { chave: 'inicio', rotulo: 'Início', fmt: v => v || '—' }, { chave: 'fim', rotulo: 'Fim', fmt: (v, l) => l.emAndamento ? 'aberto' : (v || '—') + (l.encerradoPor ? ' (gerência)' : '') },
      { chave: 'duracaoMin', rotulo: 'Duração', num: true, fmt: fmt.duracao, csv: v => v == null ? '' : Math.round(v) },
      { chave: 'nVeiculos', rotulo: 'Veículos', num: true, fmt: fmt.int }, { chave: 'nPessoas', rotulo: 'Pessoas', num: true, fmt: fmt.int },
      { chave: 'gps', rotulo: 'Coordenadas', fmt: (v, l) => temCoord(l) ? 'Sim' : 'Não', ordem: l => temCoord(l) ? 1 : 0 },
      { chave: 'situacao', rotulo: 'Situação', fmt: (v, l) => sit(l), csv: (v, l) => sit(l),
        html: (v, l) => l.situacao === 'encerrada' ? 'Encerrada' : P.seloSituacao(l) || esc(sit(l)), ordem: l => ({ longa: 0, semsinal: 1, ok: 2, encerrada: 3 })[l.situacao] }],
    todos, { titulo: 'Turnos', subtitulo: 'Turnos do período e todas as barreiras ainda abertas. Duração de turno aberto = até agora.', csv: 'barreiras-turnos.csv', id: 'bar-turnos', ordenar: 'data', limite: 25 });

    P.tabela(st, [
      { chave: 'data', rotulo: 'Data', fmt: fmt.data, ordem: l => (l.data || '') + (l.hora || '') }, { chave: 'hora', rotulo: 'Hora', fmt: v => v || '—' },
      { chave: 'placa', rotulo: 'Placa', fmt: v => v || '—' }, { chave: 'tipo', rotulo: 'Tipo', fmt: v => nomeTipo(v) },
      { chave: 'pessoas', rotulo: 'Pessoas', num: true, fmt: fmt.int }, { chave: 'local', rotulo: 'Barreira / local', fmt: v => v || '—' },
      { chave: 'fiscal', rotulo: 'Fiscais', fmt: v => v || '—' }],
    veiculos, { titulo: 'Veículos registrados', subtitulo: 'Busque por placa para ver as passagens de um veículo. Observações não são exibidas.', csv: 'barreiras-veiculos.csv', id: 'bar-veiculos', ordenar: 'data', limite: 15 });
  }

  // estilos próprios desta aba (poucos; os tokens vêm de css/painel.css)
  const css = document.createElement('style');
  css.textContent = `
    .pn-bar-ab > h3 { margin: 0; font-size: 15px; font-weight: 650; } .pn-bar-ab > .pn-sub { margin-bottom: 4px; } .pn-bar-ab .pn-tab-mais { display: none; } .pn-bar-ab .pn-tab-cab { justify-content: flex-end; }
    .pn-bar-ab-barras { display: flex; flex-direction: column; gap: 6px; }
    .pn-bar-ab-l { display: grid; grid-template-columns: 70px minmax(0, 1fr) 64px; align-items: center; gap: 8px; font-size: 13px; color: var(--ink2); }
    .pn-bar-ab-l b { color: var(--ink); text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    .pn-bar-ab-trilho { height: 12px; background: var(--grade); border-radius: 4px; overflow: hidden; }
    .pn-bar-ab-trilho i { display: block; height: 100%; border-radius: 0 4px 4px 0; }
    .pn-bar-vivo .pn-vivo-item .pn-link { margin-top: 4px; padding: 0; }
    @media (min-width: 1100px) { .pn-bar-vivo { grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr); } .pn-bar-vivo .pn-duo-mapa { order: 0; } }`;
  document.head.appendChild(css);

  P.registrarAba({ id: 'barreiras', titulo: 'Barreiras', render, indicadores, calculos, letraDe,
    contador: d => d.emAndamento.filter(t => t.situacao !== 'ok').length });
})();
