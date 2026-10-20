// Relatório VIGIFITO (Programa de Vigilância Fitossanitária) — os 24 indicadores da planilha de controle (28 linhas, com as de t) por
// POSTO: mensal (indicadores × postos do mês), período de 10 dias da escala, semestral e anual (postos × meses, com 1º e 2º semestres
// e total; totais por município, BVAs fixas, volantes e geral). Mesmo conteúdo em Word (DocxMin) e PDF (relgdv-relatorio.html), e
// em .xlsx como exportação dos dados (SheetJS vendorizada). Números: apuração do servidor (painelVigDados/admVigDados →
// vigApurar_: turnos, veículos e TFs por posto) + valores lançados no Portal do Administrativo (linhas manuais e substituições do
// automático), juntados pela regra única de documentos/indicadores.js (Indicadores.valorVig).
// Regra do período de 10 dias: a escala começa na data-âncora (padrão 05/01/2025) e troca a cada 9 dias (ciclo); o rótulo é
// "05/01 A 14/01/2025" — o dia da troca aparece nos dois rótulos, mas cada registro conta UMA vez, pela data de INÍCIO do turno: o
// turno que começa no dia da troca pertence ao período que começa nesse dia.
const VigDocs = (() => {
  'use strict';
  const IND = typeof Indicadores !== 'undefined' ? Indicadores : (typeof window !== 'undefined' ? window.Indicadores : require('./indicadores.js'));
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const INI = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const pad2 = n => String(n).padStart(2, '0');
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const NF = (c, min) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: c, minimumFractionDigits: min || 0 });
  const fmtData = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
  const extenso = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}` : ''; };
  const valorTxt = (v, u) => v == null ? '—' : u === 'nº' ? NF(0).format(Math.round(v)) : NF(3).format(v);
  const somaDias = (dia, n) => new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10)) + n * 864e5).toISOString().slice(0, 10);
  const fimDoMes = (a, m) => `${a}-${pad2(m)}-${pad2(new Date(Date.UTC(a, m, 0)).getUTCDate())}`;
  const MARCA = { lancado: ' †', substituido: ' ‡' };

  /** Início do período de 10 dias que contém o dia (âncora + k × ciclo). */
  function periodoDe(ancora, ciclo, dia) {
    const d0 = Date.UTC(+ancora.slice(0, 4), +ancora.slice(5, 7) - 1, +ancora.slice(8, 10)), d = Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10));
    return somaDias(ancora, Math.floor(Math.round((d - d0) / 864e5) / ciclo) * ciclo);
  }
  /** Períodos que começam no ano: [{inicio, fim (= início do seguinte), rotulo "05/01 A 14/01/2025"}]. */
  function periodosDoAno(ancora, ciclo, ano) {
    const out = []; let p = periodoDe(ancora, ciclo, `${ano}-01-01`);
    if (p < `${ano}-01-01`) p = somaDias(p, ciclo);
    for (; p <= `${ano}-12-31` && out.length < 400; p = somaDias(p, ciclo)) out.push({ inicio: p, fim: somaDias(p, ciclo), rotulo: rotuloPeriodo(p, somaDias(p, ciclo)) });
    return out;
  }
  const rotuloPeriodo = (ini, fim) => `${ini.slice(8, 10)}/${ini.slice(5, 7)} A ${fim.slice(8, 10)}/${fim.slice(5, 7)}/${fim.slice(0, 4)}`;

  /* ================= cálculo ================= */
  /**
   * o = {tipo: 'mensal'|'periodo'|'semestral'|'anual', ano, mes (1–12), periodo ('AAAA-MM-DD', início), semestre (1|2),
   *      dados: resposta de painelVigDados/admVigDados ({cfg, lancamentos, apuracao}), hoje: 'AAAA-MM-DD'}.
   */
  function calcular(o) {
    const D = o.dados || {}, cfg = D.cfg || { ancora: '2025-01-05', ciclo: 9, postos: [] }, ap = D.apuracao || { postos: cfg.postos, porMes: {}, porPeriodo: {}, naoMapeados: [] };
    const tipo = ['mensal', 'periodo', 'semestral', 'anual'].includes(o.tipo) ? o.tipo : 'anual', ano = Number(o.ano), hoje = String(o.hoje || '9999-12-31');
    const postos = (ap.postos || cfg.postos).map(p => ({ ...p }));
    const L = {}; (D.lancamentos || []).forEach(l => { L[`${l.periodo}|${l.posto}|${l.indicador}`] = l; });
    // colunas do relatório (chaves de período): meses AAAA-MM ou P<início>
    const meses = [...Array(12).keys()].map(i => `${ano}-${pad2(i + 1)}`);
    let colunas, rotulo, de, ate;
    if (tipo === 'mensal') { const m = Number(o.mes) || 1; colunas = [`${ano}-${pad2(m)}`]; rotulo = `${MESES[m - 1]}/${ano}`; de = `${ano}-${pad2(m)}-01`; ate = fimDoMes(ano, m); }
    else if (tipo === 'periodo') { const p = o.periodo || periodoDe(cfg.ancora, cfg.ciclo, hoje); colunas = ['P' + p]; rotulo = `período de 10 dias ${rotuloPeriodo(p, somaDias(p, cfg.ciclo))}`; de = p; ate = somaDias(p, cfg.ciclo - 1); }
    else if (tipo === 'semestral') { const s = Number(o.semestre) === 2 ? 2 : 1; colunas = meses.slice((s - 1) * 6, s * 6); rotulo = `${s}º semestre de ${ano}`; de = `${ano}-${s === 1 ? '01' : '07'}-01`; ate = s === 1 ? `${ano}-06-30` : `${ano}-12-31`; }
    else { colunas = meses; rotulo = String(ano); de = `${ano}-01-01`; ate = `${ano}-12-31`; }
    const inicioCol = c => (c.charAt(0) === 'P' ? c.slice(1) : c + '-01');
    const futuro = c => inicioCol(c) > hoje;
    const apCol = (pid, c) => { const G = c.charAt(0) === 'P' ? (ap.porPeriodo || {})[pid] : (ap.porMes || {})[pid]; const x = G && G[c.charAt(0) === 'P' ? c.slice(1) : c]; return x || null; };
    /** Célula: {v, origem, auto, lanc} do indicador k no posto e coluna. Sem turno no período passado = 0 (o posto não teve registro). */
    const cache = {};
    function cel(pid, k, c) {
      const ch = pid + '|' + k + '|' + c; if (ch in cache) return cache[ch];
      if (futuro(c)) return (cache[ch] = { v: null, origem: null });
      const x = apCol(pid, c) || (IND.PORK[k].fonte === 'auto' ? {} : null);
      return (cache[ch] = IND.valorVig(k, x, L[`${c}|${pid}|${k}`] || null));
    }
    /** Soma de células (null se todas vazias) e as origens presentes. */
    const somaCels = cs => { let v = null; const og = {}; cs.forEach(x => { if (x.v != null) v = (v || 0) + x.v; if (x.origem) og[x.origem] = 1; }); return { v: v == null ? null : Math.round(v * 1000) / 1000, origens: og }; };
    const tot = (pids, k, cols) => somaCels([].concat(...pids.map(p => (cols || colunas).map(c => cel(p, k, c)))));
    // grupos de exibição: postos na ordem da configuração; município com 2+ postos ganha a coluna "<MUNICÍPIO> - TOTAL"
    const grupos = [], porMun = new Map();
    postos.forEach(p => { if (p.id.charAt(0) === '_' || !p.municipio) return; const k = norm(p.municipio); if (!porMun.has(k)) porMun.set(k, []); porMun.get(k).push(p); });
    const feitos = new Set();
    postos.forEach(p => {
      grupos.push({ tipo: 'posto', id: p.id, rotulo: p.nome, ids: [p.id], posto: p });
      const k = norm(p.municipio), lst = porMun.get(k);
      if (lst && lst.length > 1 && lst[lst.length - 1].id === p.id && !feitos.has(k)) { feitos.add(k); grupos.push({ tipo: 'mun', id: 'mun:' + k, rotulo: `${String(p.municipio).toUpperCase()} - TOTAL`, ids: lst.map(x => x.id) }); }
    });
    const fixas = postos.filter(p => p.tipo === 'fixa').map(p => p.id), volantes = postos.filter(p => p.tipo === 'volante').map(p => p.id), todos = postos.map(p => p.id);
    grupos.push({ tipo: 'tot', id: 'fixas', rotulo: 'TOTAL FIXAS', ids: fixas }, { tipo: 'tot', id: 'volantes', rotulo: 'TOTAL VOLANTES', ids: volantes }, { tipo: 'tot', id: 'total', rotulo: 'TOTAL', ids: todos });

    /* ---- avisos ---- */
    const avisos = [], substituicoes = [];
    if ((ap.naoMapeados || []).length) avisos.push({ nivel: 'atencao', titulo: `${ap.naoMapeados.reduce((s, n) => s + n.turnos, 0)} turno(s) do ano sem posto do VIGIFITO`,
      detalhe: ap.naoMapeados.slice(0, 8).map(n => `${n.local || '(sem local)'}${n.unidade ? ' / ' + n.unidade : ''} (${n.tipo}, ${n.turnos} turno(s))`).join('; ') + '. Entram em "OUTRAS … (não mapeadas)"; ajuste em "Postos do VIGIFITO" (correspondência posto → BVA/município).' });
    const outrasUn = {};
    postos.forEach(p => colunas.forEach(c => { const x = apCol(p.id, c); if (!x || !x.outrasUnidades) return; Object.keys(x.outrasUnidades).forEach(pr => Object.keys(x.outrasUnidades[pr]).forEach(u => { const kk = `${pr === 'apreensao' ? 'Apreensão' : pr === 'carga' ? 'Cargas interestaduais (TF)' : 'Liberação'}|${u}`; outrasUn[kk] = (outrasUn[kk] || 0) + x.outrasUnidades[pr][u]; })); }));
    if (Object.keys(outrasUn).length) avisos.push({ nivel: 'info', titulo: 'Cargas, liberações ou apreensões em unidades que não são de massa', detalhe: Object.keys(outrasUn).map(k => `${k.split('|')[0]}: ${NF(2).format(outrasUn[k])} ${k.split('|')[1]}`).join('; ') + '. Fora das toneladas, sem conversão.' });
    // substituições e valores fora do padrão (t e m³ muito acima da média do posto nos outros meses do ano)
    postos.forEach(p => IND.VIGIFITO.forEach(d => colunas.forEach(c => {
      const x = cel(p.id, d.k, c);
      if (x.origem === 'substituido') substituicoes.push({ posto: p.nome, periodo: c, indicador: d, auto: x.auto, valor: x.v, justificativa: x.lanc.justificativa, por: x.lanc.usuario, em: x.lanc.atualizadoEm });
      if (d.unid !== 'nº' && x.v > 1 && c.charAt(0) !== 'P') {
        const outros = meses.filter(m => m !== c && !futuro(m)).map(m => cel(p.id, d.k, m).v).filter(v => v != null && v > 0);
        const media = outros.length >= 2 ? outros.reduce((s, v) => s + v, 0) / outros.length : null;
        if (media && x.v > 3 * media && x.v - media > 1) avisos.push({ nivel: 'atencao', titulo: `Valor fora do padrão: ${p.nome} – ${d.rotulo} (${d.unid}) em ${rotuloCol(c)}`,
          detalhe: `${valorTxt(x.v, d.unid)} ${d.unid} × média de ${valorTxt(media, d.unid)} nos outros meses. Confira se não foi lançado em kg (deve ser t).` });
      }
    })));
    if (substituicoes.length) avisos.push({ nivel: 'info', titulo: `${substituicoes.length} valor(es) lançado(s) substituem o apurado pelo e-GDV`, detalhe: substituicoes.slice(0, 6).map(s => `${s.posto}, ${s.indicador.rotulo}${s.indicador.unid !== 'nº' ? ' (' + s.indicador.unid + ')' : ''}, ${rotuloCol(s.periodo)}: ${valorTxt(s.valor, s.indicador.unid)} no lugar de ${valorTxt(s.auto, s.indicador.unid)}`).join('; ') + '.' });
    const manVazias = postos.filter(p => p.id.charAt(0) !== '_').reduce((n, p) => n + IND.VIGIFITO.filter(d => d.fonte === 'manual' && colunas.filter(c => !futuro(c)).every(c => cel(p.id, d.k, c).v == null)).length, 0);
    if (manVazias) avisos.push({ nivel: 'info', titulo: `${manVazias} linha(s) manual(is) × posto sem lançamento em ${rotulo}`, detalhe: 'Saem com "—". Lançamentos no Portal do Administrativo (aba VIGIFITO), por posto e mês.' });
    return { tipo, ano, mes: Number(o.mes) || null, periodo: o.periodo || null, semestre: Number(o.semestre) || null, rotulo, de, ate, cfg, postos, grupos, colunas, meses,
      fixas, volantes, todos, cel, tot, avisos, substituicoes, outrasUn, naoMapeados: ap.naoMapeados || [], futuro, apuradoEm: ap.apuradoEm };
  }
  const rotuloCol = c => c.charAt(0) === 'P' ? `período ${fmtData(c.slice(1))}` : `${MESES[+c.slice(5, 7) - 1]}/${c.slice(0, 4)}`;

  /* ================= blocos (Word/PDF) ================= */
  const TEXTO_PADRAO = {
    vig_intro: 'O Programa de Vigilância Fitossanitária (VIGIFITO) reúne as ações de fiscalização do trânsito de vegetais, suas partes e produtos nas Barreiras de Vigilância Agropecuária (BVA) fixas e nas ações volantes da ADAF. Este relatório apresenta os indicadores de {periodo} por posto (BVA fixas e volantes), com os totais por município, das fixas, das volantes e o total geral: os números das abordagens, dos Termos de Fiscalização e das amostras são apurados no e-GDV a partir dos registros de campo; as demais linhas são lançadas pelo Administrativo da GDV.',
    vig_obs: ''
  };
  const paras = (txt, M) => String(txt || '').replace(/\{(\w+)\}/g, (m, k) => (k in M ? M[k] : m)).split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).map(t => ({ t: 'p', texto: t }));
  const celTxt = (x, u) => valorTxt(x.v, u) + (x.v != null && x.origens ? (x.origens.substituido ? ' ‡' : x.origens.lancado && !x.origens.auto ? ' †' : '') : (MARCA[x.origem] || ''));
  const linhaLabel = d => (d.rotuloPlanilha === null ? `   (${d.unid})` : d.rotulo);
  /** Quadro indicadores × colunas (cols = [{rotulo, f(d) → {v, origens}}]). */
  function quadro(R, titulo, cols, mini) {
    const larg = Math.max(3.4, Math.min(12, (100 - 26) / cols.length));
    return { t: 'tabela', titulo, mini: mini !== false, pequena: mini === false, colunas: [{ rotulo: 'Indicador', largura: 22 }, { rotulo: 'Unid.', largura: 4 }].concat(cols.map(c => ({ rotulo: c.rotulo, largura: larg }))),
      linhas: IND.VIGIFITO.map(d => [{ texto: linhaLabel(d) }, { texto: d.unid, alinhar: 'c' }].concat(cols.map(c => ({ texto: celTxt(c.f(d), d.unid), alinhar: 'd', negrito: !!c.negrito })))) };
  }
  const colGrupos = R => R.grupos.map(g => ({ rotulo: g.rotulo, negrito: g.tipo !== 'posto', f: d => R.tot(g.ids, d.k) }));
  const colMeses = (R, ids, ms) => ms.map(m => ({ rotulo: INI[+m.slice(5, 7) - 1], f: d => R.tot(ids, d.k, [m]) }));
  /** Colunas J..D com 1º/2º semestre e total (como a aba VIGIFITO da planilha). */
  const colAno = (R, ids) => colMeses(R, ids, R.meses.slice(0, 6)).concat([{ rotulo: '1º SEM', negrito: true, f: d => R.tot(ids, d.k, R.meses.slice(0, 6)) }])
    .concat(colMeses(R, ids, R.meses.slice(6))).concat([{ rotulo: '2º SEM', negrito: true, f: d => R.tot(ids, d.k, R.meses.slice(6)) }, { rotulo: 'TOTAL', negrito: true, f: d => R.tot(ids, d.k, R.meses) }]);
  const NOTA = 'Sem marca: apurado pelo e-GDV (turnos, veículos e Termos de Fiscalização do posto). † lançado pelo Administrativo. ‡ valor lançado que SUBSTITUI o apurado pelo e-GDV (justificativa na lista de substituições). "—" = sem lançamento. Medida de Educação Sanitária = veículos orientados. Partidas, inspeção, cargas, internalização, importação/exportação (t) e medida fitossanitária: registro do veículo (carga, UF de origem/destino). Toneladas: produtos em kg (÷ 1.000) ou t; outras unidades não são convertidas. Período de 10 dias: cada registro conta pela data de início do turno (o turno que começa no dia da troca da escala pertence ao período que começa nesse dia).';
  /**
   * R = calcular(...); t = textos ({vig_intro, vig_obs, assinaturas, local}); o = {dataEmissao, secao (true = blocos para a Seção II do
   * consolidado, sem capa nem assinaturas), semOrientacao (o chamador já está em paisagem)}.
   */
  function blocos(R, t, o) {
    t = Object.assign({}, TEXTO_PADRAO, t || {}); o = o || {};
    const M = { periodo: R.rotulo, ano: String(R.ano) }, B = [], anual = R.tipo === 'anual';
    if (!o.secao) {
      B.push({ t: 'titulo', texto: `RELATÓRIO VIGIFITO — ${R.rotulo.toUpperCase()}` }, { t: 'titulo2', texto: 'Programa de Vigilância Fitossanitária · Gerência de Defesa Vegetal – GDV/ADAF' },
        { t: 'p', rotulo: 'Período', texto: `${fmtData(R.de)} a ${fmtData(R.ate)}` }, { t: 'h', texto: 'APRESENTAÇÃO' }, ...paras(t.vig_intro, M));
    }
    if (!o.semOrientacao) B.push({ t: 'orientacao', paisagem: true });
    if (anual) {
      if (!o.secao) B.push({ t: 'h', texto: 'QUADROS MENSAIS CONSOLIDADOS' });
      [['total', R.todos, 'VIGIFITO – TOTAL CONSOLIDADO (BVA fixas + volantes)'], ['fixa', R.fixas, 'VIGIFITO – BVA FIXAS'], ['volante', R.volantes, 'VIGIFITO – BVA VOLANTES']]
        .forEach(([, ids, tit]) => B.push(quadro(R, `${tit} – ${R.ano}`, colMeses(R, ids, R.meses).concat([{ rotulo: 'TOTAL', negrito: true, f: d => R.tot(ids, d.k, R.meses) }]))));
      B.push(quadro(R, `VIGIFITO CONSOLIDADO POR POSTO – ${R.ano} (totais do ano; municípios, BVA fixas, volantes e geral)`, colGrupos(R)));
      if (!o.secao) {
        B.push({ t: 'quebra' }, { t: 'h', texto: 'QUADROS POR POSTO (MÊS A MÊS)' });
        R.postos.forEach((p, i) => { if (i) B.push({ t: 'quebra' }); B.push(quadro(R, `${p.nome} – ${R.ano}`, colAno(R, [p.id]))); });
        // períodos de 10 dias das BVAs fixas com dado (como a aba "JUNDIÁ"), em tabelas de até 14 períodos
        const pers = periodosDoAno(R.cfg.ancora, R.cfg.ciclo, R.ano);
        R.postos.filter(p => p.tipo === 'fixa' && p.id.charAt(0) !== '_' && pers.some(pp => IND.VIGIFITO.some(d => { const x = R.cel(p.id, d.k, 'P' + pp.inicio); return x.v != null && (x.v !== 0 || x.origem !== 'auto'); })))
          .forEach(p => { for (let i = 0; i < pers.length; i += 14) { const fatia = pers.slice(i, i + 14);
            B.push({ t: 'quebra' }, quadro(R, `${p.nome} – períodos de 10 dias ${i + 1} a ${i + fatia.length} (${R.ano})`, fatia.map(pp => ({ rotulo: `${pp.inicio.slice(8, 10)}/${pp.inicio.slice(5, 7)}–${pp.fim.slice(8, 10)}/${pp.fim.slice(5, 7)}`, f: d => R.tot([p.id], d.k, ['P' + pp.inicio]) })))); } });
      }
    } else if (R.tipo === 'semestral') {
      B.push(quadro(R, `VIGIFITO CONSOLIDADO POR POSTO – ${R.rotulo}`, colGrupos(R)));
      B.push(quadro(R, `VIGIFITO – TOTAL CONSOLIDADO MÊS A MÊS – ${R.rotulo}`, colMeses(R, R.todos, R.colunas).concat([{ rotulo: 'TOTAL', negrito: true, f: d => R.tot(R.todos, d.k) }])));
    } else B.push(quadro(R, `VIGIFITO – ${R.rotulo} – por posto`, colGrupos(R)));
    B.push({ t: 'p', pequeno: true, texto: NOTA });
    if (!o.semOrientacao) B.push({ t: 'orientacao', paisagem: false });
    if (!o.secao) {
      if (R.substituicoes.length) {
        B.push({ t: 'h', texto: 'VALORES QUE SUBSTITUEM O APURADO PELO e-GDV' });
        B.push({ t: 'tabela', pequena: true, colunas: [{ rotulo: 'Posto', largura: 24 }, { rotulo: 'Período', largura: 13 }, { rotulo: 'Indicador', largura: 20 }, { rotulo: 'e-GDV', largura: 8 }, { rotulo: 'Lançado', largura: 8 }, { rotulo: 'Justificativa', largura: 27 }],
          linhas: R.substituicoes.map(s => [s.posto, rotuloCol(s.periodo), s.indicador.rotulo + (s.indicador.unid !== 'nº' ? ` (${s.indicador.unid})` : ''), valorTxt(s.auto, s.indicador.unid), valorTxt(s.valor, s.indicador.unid), s.justificativa || '—'].map((v, j) => ({ texto: v, alinhar: j === 3 || j === 4 ? 'd' : null }))) });
      }
      if (String(t.vig_obs || '').trim()) B.push({ t: 'h', texto: 'OBSERVAÇÕES' }, ...paras(t.vig_obs, M));
      B.push({ t: 'p', alinhar: 'd', espaco: true, texto: `${t.local || 'Manaus/AM'}, ${extenso(o.dataEmissao || '')}.` });
      const ass = (t.assinaturas || []).filter(a => a && (a.nome || a.cargo));
      if (ass.length) B.push({ t: 'assinaturas', itens: ass.map(a => ({ nome: a.nome || ' ', cargo: a.cargo || '' })) });
    }
    return B;
  }

  /* ================= .xlsx: exportação dos dados (SheetJS) ================= */
  const num = x => (x.v == null ? null : x.v);
  /** Linhas dos indicadores: [rótulo (null na 2ª linha do mesmo indicador), unidade, ...valores]. */
  const linhasInd = f => IND.VIGIFITO.map(d => [d.rotuloPlanilha === null ? null : d.rotulo, d.unid].concat(f(d)));
  function folhaCols(X, titulo, cols) {
    const aoa = [[titulo, 'Unid.'].concat(cols.map(c => c.rotulo))].concat(linhasInd(d => cols.map(c => num(c.f(d)))));
    const ws = X.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 48 }, { wch: 6 }].concat(cols.map(() => ({ wch: 14 })));
    return ws;
  }
  /**
   * Workbook no layout do relatório VIGIFITO da GDV (a própria planilha "RELATÓRIOS CONSOLIDADOS - VIGIFITO"). Anual: abas VIGIFITO
   * (posto × J..D, 1º SEMESTRE, 2º SEMESTRE, TOTAL; 2º bloco com os totais por município), uma aba de períodos de 10 dias por BVA fixa
   * (como "JUNDIÁ": PERÍODO 1… com "05/01 A 14/01/2025"), "1 semestre", "2 semestre", "Anual" (postos + totais por município, TOTAL FIXAS, TOTAL VOLANTES, TOTAL) e
   * ANUAL-MES (total consolidado por mês + blocos de fixas e volantes). Mensal/período/semestral: uma aba no layout da "Anual".
   */
  function xlsx(R, X) {
    const wb = X.utils.book_new();
    if (R.tipo === 'anual') {
      const cab1 = ['VIGIFITO CONSOLIDADO', 'Unid.'], cab2 = [null, null], merges = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }];
      const SUB = ['J', 'F', 'M', 'A', 'M', 'J', '1º SEMESTRE', 'J', 'A', 'S', 'O', 'N', 'D', '2º SEMESTRE', 'TOTAL'];
      const blocoAno = (ids, d) => { const v = m => num(R.tot(ids, d.k, [m])); const s1 = num(R.tot(ids, d.k, R.meses.slice(0, 6))), s2 = num(R.tot(ids, d.k, R.meses.slice(6)));
        return R.meses.slice(0, 6).map(v).concat([s1]).concat(R.meses.slice(6).map(v)).concat([s2, num(R.tot(ids, d.k, R.meses))]); };
      const montar = (lista, titulo, linha0) => {
        const c1 = cab1.slice(), c2 = cab2.slice(); c1[0] = titulo;
        lista.forEach((g, i) => { const col = 2 + i * 16; c1[col] = g.rotulo; SUB.forEach((s, j) => { c2[col + j] = s; }); merges.push({ s: { r: linha0, c: col }, e: { r: linha0, c: col + 14 } }); });
        return [c1, c2].concat(linhasInd(d => { const out = []; lista.forEach((g, i) => { blocoAno(g.ids, d).forEach((v, j) => { out[i * 16 + j] = v; }); }); return out; }));
      };
      const postosG = R.grupos.filter(g => g.tipo === 'posto'), munG = R.grupos.filter(g => g.tipo === 'mun');
      let aoa = montar(postosG, 'VIGIFITO CONSOLIDADO', 0);
      if (munG.length) { const l0 = aoa.length + 1; merges.push({ s: { r: l0, c: 0 }, e: { r: l0 + 1, c: 0 } }, { s: { r: l0, c: 1 }, e: { r: l0 + 1, c: 1 } }); aoa = aoa.concat([[]], montar(munG, 'VIGIFITO CONSOLIDADO', l0)); }
      const ws = X.utils.aoa_to_sheet(aoa); ws['!merges'] = merges; ws['!cols'] = [{ wch: 48 }, { wch: 6 }];
      X.utils.book_append_sheet(wb, ws, 'VIGIFITO');
      // abas de períodos de 10 dias (como "JUNDIÁ"): uma por BVA fixa com dado em algum período (no mínimo a primeira fixa)
      const pers = periodosDoAno(R.cfg.ancora, R.cfg.ciclo, R.ano);
      const fixasP = R.postos.filter(p => p.tipo === 'fixa' && p.id.charAt(0) !== '_');
      const comDado = fixasP.filter(p => pers.some(pp => IND.VIGIFITO.some(d => { const x = R.cel(p.id, d.k, 'P' + pp.inicio); return x.v != null && (x.v !== 0 || x.origem !== 'auto'); })));
      (comDado.length ? comDado : fixasP.slice(0, 1)).forEach(p => {
        const curto = (String(p.nome).split(/\s+-\s+/).pop() || p.nome).replace(/^BVA\s+/i, '').trim().toUpperCase();
        const aoaP = [[curto, 'Unid.'].concat(pers.map((pp, i) => `PERÍODO ${i + 1}`)), [null, null].concat(pers.map(pp => pp.rotulo))]
          .concat(linhasInd(d => pers.map(pp => num(R.cel(p.id, d.k, 'P' + pp.inicio)))));
        const wsP = X.utils.aoa_to_sheet(aoaP); wsP['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }]; wsP['!cols'] = [{ wch: 48 }, { wch: 6 }];
        let nome = curto.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31); while (wb.SheetNames.includes(nome)) nome = nome.slice(0, 28) + ' ' + (wb.SheetNames.length);
        X.utils.book_append_sheet(wb, wsP, nome);
      });
      [['1 semestre', R.meses.slice(0, 6)], ['2 semestre', R.meses.slice(6)], ['Anual', R.meses]].forEach(([nome, ms]) =>
        X.utils.book_append_sheet(wb, folhaCols(X, 'VIGIFITO CONSOLIDADO', R.grupos.map(g => ({ rotulo: g.rotulo, f: d => R.tot(g.ids, d.k, ms) }))), nome));
      // ANUAL-MES: total consolidado por mês e os blocos de fixas e volantes
      const blocoMes = (titulo, ids) => [[titulo, 'Unid.'].concat(INI).concat(['TOTAL'])].concat(linhasInd(d => R.meses.map(m => num(R.tot(ids, d.k, [m]))).concat([num(R.tot(ids, d.k, R.meses))])));
      const am = blocoMes('VIGIFITO TOTAL CONSOLIDADO', R.todos).concat([['PNEMC', 'nº']]).concat([[]], blocoMes('VIGIFITO BVA FIXAS - CONSOLIDADO', R.fixas), [[]], blocoMes('VIGIFITO BVAS VOLANTES - CONSOLIDADO', R.volantes));
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(am), 'ANUAL-MES');
    } else {
      const nome = R.tipo === 'mensal' ? `VIGIFITO ${CURTOS[R.mes - 1].toUpperCase()} ${R.ano}` : R.tipo === 'semestral' ? `${R.semestre} semestre` : `PERÍODO ${R.colunas[0].slice(6, 11).replace('-', '.')}`;
      X.utils.book_append_sheet(wb, folhaCols(X, 'VIGIFITO CONSOLIDADO', R.grupos.map(g => ({ rotulo: g.rotulo, f: d => R.tot(g.ids, d.k) }))), nome.slice(0, 31));
    }
    return wb;
  }
  const nomeArquivo = (R, ext) => `Relatorio_VIGIFITO_${R.tipo === 'mensal' ? `${R.ano}-${pad2(R.mes)}` : R.tipo === 'periodo' ? 'periodo_' + R.colunas[0].slice(1) : R.tipo === 'semestral' ? `${R.ano}_${R.semestre}o_semestre` : R.ano}.${ext}`;

  return { calcular, blocos, xlsx, nomeArquivo, periodoDe, periodosDoAno, rotuloPeriodo, rotuloCol, valorTxt, TEXTO_PADRAO, MESES, CURTOS, NOTA };
})();
if (typeof window !== 'undefined') window.VigDocs = VigDocs;
if (typeof module !== 'undefined' && module.exports) module.exports = VigDocs;
