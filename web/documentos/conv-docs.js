// Convênios — apuração das metas, execução financeira e conteúdo do Relatório Circunstancial Técnico (mensal).
// Usado no painel (aba Convênios: cartões, tabelas e gráficos) e nos dois formatos do relatório: o modelo HTML
// (conv-relatorio.html → PDF) e o Word (.docx, painel/js/docx.js). O relatório é montado uma vez como uma lista de blocos neutros
// (título, parágrafo, tabela, assinaturas) e cada formato só desenha os blocos: Word e PDF têm sempre o mesmo conteúdo.
// Sem dependências; só contagens por município/BVA/sub-meta (nada de CPF/CNPJ, nomes de produtores, placas ou coordenadas).
const ConvDocs = (() => {
  'use strict';
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const NF = (casas, min) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: min == null ? 0 : min });
  const fmt = {
    int: v => v == null || !isFinite(v) ? '—' : NF(0).format(Math.round(v)),
    num: (v, c = 2) => v == null || !isFinite(v) ? '—' : NF(c).format(v),
    pct: v => v == null || !isFinite(v) ? '—' : NF(2, 2).format(v * 100) + '%',
    moeda: v => v == null || !isFinite(v) ? '—' : 'R$ ' + NF(2, 2).format(v),
    data: s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; },
    mes: m => { const [a, b] = String(m || '').split('-'); return a && b ? `${MESES[+b - 1]}/${a}` : '—'; },
    mesCurto: m => { const [a, b] = String(m || '').split('-'); return a && b ? `${MESES[+b - 1].slice(0, 3)}/${a.slice(2)}` : '—'; },
    extenso: iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}` : ''; }
  };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const pad2 = n => String(n).padStart(2, '0');
  const fimDoMes = m => { const [a, b] = m.split('-').map(Number); return `${m}-${pad2(new Date(Date.UTC(a, b, 0)).getUTCDate())}`; };
  const proxMes = m => { const [a, b] = m.split('-').map(Number); return b === 12 ? `${a + 1}-01` : `${a}-${pad2(b + 1)}`; };
  const dias = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  const listaE = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : (l[0] || '');
  const plural = (n, s, p) => `${fmt.int(n)} ${Math.abs(n) === 1 ? s : (p || s + 's')}`;
  const SIT_BEM = { previsto: 'Previsto', em_aquisicao: 'Em aquisição', adquirido: 'Adquirido', entregue: 'Entregue' };
  const NATUREZAS = { '33.90.14': 'Diárias – civil', '33.90.30': 'Material de consumo (combustível e passagem fluvial)', '33.90.33': 'Passagens e despesas com locomoção',
    '33.90.36': 'Outros serviços de terceiros – PF (diárias de terceiros)', '44.90.52': 'Equipamentos e material permanente' };
  const SITUACAO = { adiantada: 'Adiantada', ritmo: 'No ritmo', atrasada: 'Atrasada' };

  /** Meses AAAA-MM do início da execução até o fim da vigência (ou até "ate"). */
  function mesesDe(cfg, ate) {
    const out = [], fim = ate && ate < cfg.vigencia.fim.slice(0, 7) ? ate : cfg.vigencia.fim.slice(0, 7);
    for (let m = cfg.inicioExecucao.slice(0, 7); m <= fim && out.length < 60; m = proxMes(m)) out.push(m);
    return out;
  }
  /** Fração esperada pelo tempo (linear entre o início da execução e o fim da vigência) ao fim do mês m. */
  function esperadoEm(cfg, m) {
    const ini = cfg.inicioExecucao, fim = cfg.vigencia.fim, d = fimDoMes(m) < fim ? fimDoMes(m) : fim;
    return Math.max(0, Math.min(1, (dias(ini, d) + 1) / (dias(ini, fim) + 1)));
  }
  /** Número "Parcial N" automático: ordem do mês desde o início da execução. */
  const numeroAuto = (cfg, mes) => Math.max(1, mesesDe(cfg, mes).length);

  /* ================= apuração ================= */
  /**
   * cfg = configuração do convênio; apur = resposta do painelConvApuracao ([início da execução, fim do mês]); lancs/fin = lançamentos;
   * mes = AAAA-MM de referência; o.municipio = função que dá o nome canônico do município (opcional); o.hoje = AAAA-MM-DD.
   */
  function calcular(cfg, apur, lancs, fin, mes, o) {
    o = o || {};
    const canon = n => (o.municipio && o.municipio(n)) || String(n || '').trim();
    const fim = fimDoMes(mes), meses = mesesDe(cfg, mes), mesIni = meses[0] || mes;
    const hojeMes = String(o.hoje || '').slice(0, 7) || mes;
    const bucket = d => { const m = String(d).slice(0, 7); return m < mesIni ? mesIni : m; };
    const L = (lancs || []).filter(l => l.convenio === cfg.id && !Number(l.excluido) && l.data <= fim);
    const A = (apur && apur.etapas) || {};
    const esp = esperadoEm(cfg, mes);
    const R = { cfg, mes, meses, fim, esperado: esp, etapas: [], alertas: [],
      prazo: Math.max(0, Math.min(1, dias(cfg.vigencia.inicio, fim < cfg.vigencia.fim ? fim : cfg.vigencia.fim) / dias(cfg.vigencia.inicio, cfg.vigencia.fim))) };

    cfg.etapas.forEach(e => {
      const LE = L.filter(l => l.etapa === e.id);
      const aj = LE.filter(l => l.tipo === 'ajuste');
      const ajMes = aj.filter(l => l.data.slice(0, 7) === mes).reduce((s, l) => s + Number(l.quantidade || 0), 0);
      const ajAcum = aj.reduce((s, l) => s + Number(l.quantidade || 0), 0);
      const ajPorMes = {}; aj.forEach(l => { const b = bucket(l.data); ajPorMes[b] = (ajPorMes[b] || 0) + Number(l.quantidade || 0); });
      const r = { id: e.id, nome: e.nome, nomeCurto: e.nomeCurto || e.nome, apuracao: e.apuracao, unidade: e.unidade, meta: Number(e.meta) || 0, valor: e.valor,
        auto: ['pce', 'volante', 'bva'].includes(e.apuracao), obs: e.obs || '', linhas: [], ajustes: aj, serie: [], mes: 0, acum: 0, pct: 0, memoria: '', execTexto: '' };
      const porMes = {}; meses.forEach(m => { porMes[m] = 0; });
      const soma = (m, v) => { if (porMes[m] != null) porMes[m] += v; };

      if (e.apuracao === 'bens') {
        const bens = (e.bens || []).map(b => {
          const ls = LE.filter(l => l.tipo === 'bem' && l.submeta === b.id).sort((x, y) => x.data.localeCompare(y.data) || (x.atualizadoEm || 0) - (y.atualizadoEm || 0));
          const ult = ls[ls.length - 1], sit = ult ? ult.situacao : 'previsto', exec = sit === 'adquirido' || sit === 'entregue';
          const prim = exec ? ls.filter(l => l.situacao === 'adquirido' || l.situacao === 'entregue')[0] : null;
          return { b, sit, exec, data: ult ? ult.data : '', doc: ult ? ult.documento : '', desde: prim ? prim.data : '' };
        });
        bens.forEach(x => { if (x.exec) soma(bucket(x.desde), 1); });
        r.acum = bens.filter(x => x.exec).length; r.mes = bens.filter(x => x.exec && x.desde.slice(0, 7) === mes).length;
        r.linhas = bens.map(x => ({ rotulo: `${x.b.nome} – ${x.b.local}`, previsto: 1, mes: x.exec && x.desde.slice(0, 7) === mes ? 1 : 0, acum: x.exec ? 1 : 0,
          pct: x.exec ? 1 : 0, extra: [SIT_BEM[x.sit] || x.sit, x.data ? fmt.data(x.data) : '', x.doc].filter(Boolean).join(' · '), situacao: x.sit }));
        r.bens = bens;
        const porSit = {}; bens.forEach(x => { porSit[x.sit] = (porSit[x.sit] || 0) + 1; });
        r.memoria = `Situação dos ${plural(bens.length, 'bem', 'bens')} previstos até ${fmt.mes(mes)}: ` +
          Object.keys(SIT_BEM).filter(k => porSit[k]).map(k => `${SIT_BEM[k].toLowerCase()}: ${fmt.int(porSit[k])}`).join('; ') + '. ' +
          (bens.filter(x => x.sit !== 'previsto').map(x => `${x.b.nome} (${x.b.local}): ${SIT_BEM[x.sit].toLowerCase()}${x.data ? ' em ' + fmt.data(x.data) : ''}${x.doc ? ' – ' + x.doc : ''}`).join('; ') || 'Nenhum bem com aquisição registrada.');
        r.execTexto = `${fmt.int(r.acum)} de ${fmt.int(bens.length)} bens adquiridos ou entregues.`;
      } else if (e.apuracao === 'manual') {
        const ex = LE.filter(l => l.tipo === 'execucao');
        const subs = (e.submetas || []).length ? e.submetas : [{ id: '', nome: e.nomeCurto || e.nome, meta: e.meta, unidade: e.unidade, contagem: 'soma' }];
        const linhaDe = s => {
          const ls = ex.filter(l => (l.submeta || '') === s.id);
          const doMes = ls.filter(l => l.data.slice(0, 7) === mes);
          let vMes, vAcum, extra = '';
          if (s.contagem === 'municipios') {
            const mun = new Map();
            ls.forEach(l => { const k = norm(l.municipio); if (!k) return; const x = mun.get(k) || { nome: canon(l.municipio), props: 0, primeiro: l.data }; x.props += Number(l.propriedades || 0); if (l.data < x.primeiro) x.primeiro = l.data; mun.set(k, x); });
            vAcum = mun.size; vMes = new Set(doMes.map(l => norm(l.municipio)).filter(Boolean)).size;
            [...mun.values()].forEach(x => soma(bucket(x.primeiro), 1));
            extra = [...mun.values()].map(x => `${x.nome}${x.props ? ` (${plural(x.props, 'propriedade')})` : ''}`).join(', ');
            return { rotulo: s.nome, s, previsto: s.meta, mes: vMes, acum: vAcum, pct: s.meta ? vAcum / s.meta : null, extra, municipios: [...mun.values()] };
          }
          vAcum = ls.reduce((t, l) => t + Number(l.quantidade || 0), 0); vMes = doMes.reduce((t, l) => t + Number(l.quantidade || 0), 0);
          ls.forEach(l => soma(bucket(l.data), Number(l.quantidade || 0)));
          const arm = ls.reduce((t, l) => t + Number(l.armadilhas || 0), 0), props = ls.reduce((t, l) => t + Number(l.propriedades || 0), 0);
          extra = [arm ? plural(arm, 'armadilha') : '', props ? plural(props, 'propriedade') : ''].filter(Boolean).join(', ');
          return { rotulo: s.nome, s, previsto: s.meta, mes: vMes, acum: vAcum, pct: s.meta ? vAcum / s.meta : null, extra, armadilhas: arm, propriedades: props };
        };
        r.linhas = subs.map(linhaDe);
        if (e.modo === 'media') {
          const com = r.linhas.filter(x => x.previsto > 0);
          r.pct = com.length ? com.reduce((t, x) => t + Math.min(1, x.acum / x.previsto), 0) / com.length : 0;
          const un = {}; r.linhas.forEach(x => { const u = x.s.unidade || e.unidade; un[u] = un[u] || { meta: 0, mes: 0, acum: 0 }; un[u].meta += Number(x.previsto || 0); un[u].mes += x.mes; un[u].acum += x.acum; });
          const txt = k => Object.keys(un).map(u => `${fmt.int(un[u][k])} ${u}`).join(' + ');
          r.previstoTxt = txt('meta'); r.mesTxt = txt('mes'); r.acumTxt = txt('acum'); r.media = true;
          r.mes = r.linhas.reduce((t, x) => t + x.mes, 0); r.acum = r.linhas.reduce((t, x) => t + x.acum, 0);
        } else {
          r.mes = r.linhas.reduce((t, x) => t + x.mes, 0); r.acum = r.linhas.reduce((t, x) => t + x.acum, 0);
        }
        r.memoria = r.linhas.map(x => `${x.rotulo}: ${fmt.int(x.acum)} ${x.s.unidade || e.unidade}${x.previsto ? ` de ${fmt.int(x.previsto)}` : ''}${x.extra ? ` (${x.extra})` : ''}`).join('; ') + '.';
        const desc = ex.filter(l => l.descricao && l.data.slice(0, 7) === mes).map(l => l.descricao);
        if (desc.length) r.memoria += ` Registros do mês: ${desc.slice(0, 6).join('; ')}${desc.length > 6 ? '…' : ''}.`;
        r.execTexto = r.media ? `${r.acumTxt} (previsto: ${r.previstoTxt}).` : `${fmt.int(r.acum)} ${e.unidade} de ${fmt.int(r.meta)} previstas.`;
      } else if (e.apuracao === 'pce') {
        const a = A[e.id] || { meses: {}, porMunicipio: [] };
        const mun = new Map();
        (a.porMunicipio || []).forEach(x => {
          const k = norm(canon(x.municipio)), y = mun.get(k) || { nome: canon(x.municipio), propriedades: 0, registros: 0, primeiro: x.primeiro, meses: {} };
          y.propriedades += x.propriedades; y.registros += x.registros; if (x.primeiro < y.primeiro) y.primeiro = x.primeiro;
          Object.keys(x.meses || {}).forEach(m => { const z = y.meses[m] = y.meses[m] || { propriedades: 0, registros: 0 }; z.propriedades += x.meses[m].propriedades; z.registros += x.meses[m].registros; });
          mun.set(k, y);
        });
        const lst = [...mun.values()].filter(x => x.primeiro <= fim).sort((x, y) => y.propriedades - x.propriedades || x.nome.localeCompare(y.nome, 'pt-BR'));
        lst.forEach(x => soma(bucket(x.primeiro), 1));
        const doMes = lst.filter(x => x.meses[mes]);
        r.mesBruto = doMes.length; r.mes = doMes.length + ajMes; r.acum = lst.length + ajAcum;
        r.linhas = lst.map(x => ({ rotulo: x.nome, previsto: null, mes: x.meses[mes] ? x.meses[mes].propriedades : 0, acum: x.propriedades, registros: x.registros,
          registrosMes: x.meses[mes] ? x.meses[mes].registros : 0, primeiro: x.primeiro, extra: `${plural(x.registros, 'registro')} · 1º em ${fmt.data(x.primeiro)}` }));
        r.municipios = lst;
        r.memoria = lst.length
          ? `Foram realizados levantamentos de detecção/verificação de Monilíase do Cacau e Cupuaçu nos municípios: ${lst.map(x => `${x.nome} (${plural(x.propriedades, 'propriedade')})`).join(', ')}.` +
            (doMes.length ? ` Em ${fmt.mes(mes)}: ${doMes.map(x => `${x.nome} (${plural(x.meses[mes].propriedades, 'propriedade')})`).join(', ')}.` : ` Sem levantamento registrado em ${fmt.mes(mes)}.`)
          : 'Nenhum levantamento de monilíase registrado no e-GDV no período.';
        r.execTexto = `${plural(r.acum, 'município levantado', 'municípios levantados')} (${lst.reduce((t, x) => t + x.propriedades, 0)} propriedades)${lst.length ? ': ' + listaE(lst.map(x => x.nome)) : ''}.`;
      } else if (e.apuracao === 'volante') {
        const a = A[e.id] || { meses: {}, porMunicipio: [] };
        Object.keys(a.meses || {}).forEach(m => soma(bucket(m + '-01'), a.meses[m].turnos));
        const tot = { turnos: 0, veiculos: 0, tfs: 0 }; (a.porMunicipio || []).forEach(x => { tot.turnos += x.total.turnos; tot.veiculos += x.total.veiculos; tot.tfs += x.total.tfs; });
        const mm = (a.meses || {})[mes] || { turnos: 0, veiculos: 0, tfs: 0 };
        r.mesBruto = mm.turnos; r.mes = mm.turnos + ajMes; r.acum = tot.turnos + ajAcum; r.totais = tot; r.totaisMes = mm;
        const muns = (a.porMunicipio || []).length ? a.porMunicipio : (e.municipios || []).map(m => ({ municipio: m, total: { turnos: 0, veiculos: 0, tfs: 0 }, meses: {} }));
        r.linhas = muns.map(x => { const z = (x.meses || {})[mes] || { turnos: 0, veiculos: 0, tfs: 0 };
          return { rotulo: x.municipio, previsto: r.meta, mes: z.turnos, acum: x.total.turnos, tfs: x.total.tfs, tfsMes: z.tfs, veiculos: x.total.veiculos, veiculosMes: z.veiculos,
            extra: `${plural(x.total.tfs, 'TF')} · ${plural(x.total.veiculos, 'veículo')}` }; });
        r.memoria = `Fiscalização móvel do trânsito de vegetais (barreira volante) em ${listaE(e.municipios || [])}: ${plural(tot.turnos, 'ação', 'ações')}, com ${plural(tot.tfs, 'Termo de Fiscalização', 'Termos de Fiscalização')} emitidos e ${plural(tot.veiculos, 'veículo')} abordados. Em ${fmt.mes(mes)}: ${plural(mm.turnos, 'ação', 'ações')} e ${plural(mm.tfs, 'TF')}.`;
        r.execTexto = `${plural(r.acum, 'ação', 'ações')} de fiscalização, com emissão de ${plural(tot.tfs, 'Termo de Fiscalização', 'Termos de Fiscalização')}.`;
      } else if (e.apuracao === 'bva') {
        const a = A[e.id] || { meses: {}, porBva: [] };
        Object.keys(a.meses || {}).forEach(m => soma(bucket(m + '-01'), a.meses[m].veiculos));
        const bvas = (a.porBva || []).length ? a.porBva : (e.bvas || []).map(b => ({ bva: b, total: { turnos: 0, veiculos: 0, tfs: 0, apreensoes: 0, rechacos: 0 }, meses: {} }));
        const z0 = { turnos: 0, veiculos: 0, tfs: 0, apreensoes: 0, rechacos: 0 };
        const tot = { ...z0 }; bvas.forEach(x => Object.keys(z0).forEach(k => { tot[k] += x.total[k] || 0; }));
        const mm = (a.meses || {})[mes] || z0;
        r.mesBruto = mm.veiculos; r.mes = mm.veiculos + ajMes; r.acum = tot.veiculos + ajAcum; r.totais = tot; r.totaisMes = mm;
        r.linhas = bvas.map(x => { const z = (x.meses || {})[mes] || z0;
          return { rotulo: x.bva, previsto: null, mes: z.veiculos, acum: x.total.veiculos, tfs: x.total.tfs, apreensoes: x.total.apreensoes, rechacos: x.total.rechacos, turnos: x.total.turnos,
            tfsMes: z.tfs, extra: `${plural(x.total.tfs, 'TF')} · ${plural(x.total.apreensoes, 'apreensão', 'apreensões')} · ${plural(x.total.rechacos, 'rechaço')}` }; });
        r.memoria = bvas.map(x => `${x.bva}: ${plural(x.total.veiculos, 'veículo')} abordados, ${plural(x.total.tfs, 'Termo de Fiscalização', 'Termos de Fiscalização')}, ${plural(x.total.apreensoes, 'apreensão', 'apreensões')} e ${plural(x.total.rechacos, 'rechaço')}`).join('; ') +
          `. Resultado consolidado: ${plural(tot.veiculos, 'veículo')} abordados (${fmt.mes(mes)}: ${fmt.int(mm.veiculos)}).`;
        r.execTexto = `${plural(r.acum, 'veículo')} abordados nas barreiras fixas.`;
      }
      if (aj.length) {
        Object.keys(ajPorMes).forEach(m => soma(m, ajPorMes[m]));
        r.linhas.push({ rotulo: 'Ajuste manual', ajuste: true, previsto: null, mes: ajMes, acum: ajAcum, extra: aj.map(l => `${l.quantidade > 0 ? '+' : ''}${fmt.int(l.quantidade)} em ${fmt.data(l.data)}: ${l.descricao}`).join('; ') });
        r.memoria += ` Inclui ajuste manual de ${ajAcum > 0 ? '+' : ''}${fmt.int(ajAcum)} (${aj.map(l => l.descricao).join('; ')}).`;
      }
      if (!r.media) r.pct = r.meta ? r.acum / r.meta : 0;
      r.pctMes = r.media ? null : (r.meta ? r.mes / r.meta : 0);
      r.esperado = esp;
      const dif = Math.min(1, r.pct) - esp;
      r.situacao = r.pct >= 1 || dif >= 0.05 ? 'adiantada' : dif < -0.05 ? 'atrasada' : 'ritmo';
      r.situacaoTxt = SITUACAO[r.situacao];
      if (!r.media) { r.previstoTxt = `${fmt.int(r.meta)} ${e.unidade}`; r.mesTxt = fmt.int(r.mes); r.acumTxt = fmt.int(r.acum); }
      // série mensal: executado no mês, acumulado e esperado (etapa por média de sub-metas: em % da meta)
      let ac = 0;
      r.serie = meses.map(m => {
        ac += porMes[m];
        const esM = esperadoEm(cfg, m);
        if (r.media) {
          const pm = fimDoMes(m), com = r.linhas.filter(x => x.previsto > 0);
          const pctAte = com.length ? com.reduce((t, x) => {
            const ls = LE.filter(l => l.tipo === 'execucao' && l.submeta === x.s.id && l.data <= pm);
            const v = x.s.contagem === 'municipios' ? new Set(ls.map(l => norm(l.municipio)).filter(Boolean)).size : ls.reduce((s, l) => s + Number(l.quantidade || 0), 0);
            return t + Math.min(1, v / x.previsto); }, 0) / com.length : 0;
          return { mes: m, valor: null, acum: pctAte * 100, esperado: esM * 100 };
        }
        return { mes: m, valor: porMes[m], acum: ac, esperado: esM * r.meta };
      });
      if (dif < -0.15) R.alertas.push({ nivel: 'serio', etapa: e.id, titulo: `Etapa ${e.id} atrasada: ${fmt.pct(r.pct)} executado, esperado ${fmt.pct(esp)}`,
        detalhe: `${r.nomeCurto}: ${Math.round((esp - Math.min(1, r.pct)) * 100)} p.p. abaixo do ritmo linear até o fim da vigência (${fmt.data(cfg.vigencia.fim)}).` });
      if (r.auto && !r.mesBruto && mes <= hojeMes) R.alertas.push({ nivel: 'atencao', etapa: e.id, titulo: `Etapa ${e.id} sem nenhum registro em ${fmt.mes(mes)}`,
        detalhe: `${r.nomeCurto}: a apuração automática não encontrou ${e.apuracao === 'pce' ? 'levantamento ou termo de monilíase' : e.apuracao === 'volante' ? 'turno de barreira volante em ' + listaE(e.municipios || []) : 'turno nas BVAs ' + listaE(e.bvas || [])} neste mês.` });
      R.etapas.push(r);
    });
    R.fin = financeiro(cfg, fin, mes);
    fisicoFinanceiro(R, cfg);
    return R;
  }

  /* ================= físico × financeiro ================= */
  const NAT_DIARIAS = ['33.90.14', '33.90.36'];
  const FF_FAIXA = 0.10, FF_ALERTA = 0.20;            // |financeiro − físico| ≤ 10 p.p. = equilibrado; financeiro > 20 p.p. à frente = alerta
  const FF_SIT = { financeiro: 'Financeiro à frente do físico', equilibrado: 'Equilibrado', fisico: 'Físico à frente do financeiro', semgasto: 'Sem gasto' };
  const somaMeses = (m, n) => { let x = m; for (let i = 0; i < n; i++) x = proxMes(x); return x; };
  /**
   * Projeção do saldo no ritmo de gasto atual: ritmo = média mensal dos últimos 3 meses (até o mês de referência, desde o início da
   * execução); acaba em = mês de referência + ⌈saldo ÷ ritmo⌉ meses; "antes" = acaba antes do mês do fim da vigência.
   */
  function projecao(cfg, R, previsto, porMes, acum) {
    const ult = R.meses.slice(-3), ritmo = ult.length ? ult.reduce((s, m) => s + (porMes[m] || 0), 0) / ult.length : 0;
    const saldo = previsto - acum, fimVig = cfg.vigencia.fim.slice(0, 7);
    if (previsto <= 0) return { ritmo, saldo, mesFim: '', situacao: 'semprevisto', antes: false };
    if (saldo <= 0.005) return { ritmo, saldo, mesFim: R.mes, situacao: 'esgotado', antes: R.mes < fimVig };
    if (!(ritmo > 0)) return { ritmo, saldo, mesFim: '', situacao: 'semritmo', antes: false, meses: null };
    const meses = Math.ceil(saldo / ritmo - 1e-9), mesFim = somaMeses(R.mes, meses);
    return { ritmo, saldo, meses, mesFim, situacao: mesFim < fimVig ? 'antes' : 'ok', antes: mesFim < fimVig };
  }
  /** Por etapa: % financeiro, diárias usadas × previstas, físico × financeiro (p.p. e situação), custo por unidade física e projeção. */
  function fisicoFinanceiro(R, cfg) {
    const F = R.fin, mesIni = R.meses[0] || R.mes;
    const bucket = d => { const m = String(d).slice(0, 7); return m < mesIni ? mesIni : m; };
    const tot = { diariasPrev: 0, diariasUsadas: 0, valorDiariasPrev: 0, valorDiarias: 0, frente: 0 };
    R.etapas.forEach(r => {
      const e = cfg.etapas.find(x => x.id === r.id), fe = F.etapas.find(x => x.id === r.id) || { previsto: 0, acum: 0, itens: [] };
      const ls = F.lancamentos.filter(l => l.etapa === r.id);
      const porMes = {}; ls.forEach(l => { const b = bucket(l.data); porMes[b] = (porMes[b] || 0) + Number(l.valor || 0); });
      // diárias (33.90.14 e 33.90.36): quantidade lançada; sem quantidade, valor ÷ valor unitário do item
      const its = (e.itens || []).filter(it => NAT_DIARIAS.includes(it.natureza));
      const d = { previstas: 0, usadas: 0, valorPrevisto: 0, valor: 0 };
      its.forEach(it => {
        d.previstas += Number(it.quantidade) || 0; d.valorPrevisto += Number(it.total) || 0;
        ls.filter(l => l.item === it.id).forEach(l => { const v = Number(l.valor || 0); d.valor += v;
          d.usadas += l.quantidade != null && l.quantidade !== '' ? Number(l.quantidade) : (Number(it.valorUnitario) ? v / Number(it.valorUnitario) : 0); });
      });
      d.pct = d.previstas ? d.usadas / d.previstas : null;
      const fis = Math.min(1, r.pct), finPct = fe.previsto ? fe.acum / fe.previsto : 0, dif = finPct - fis;
      const situacao = !fe.acum ? 'semgasto' : dif > FF_FAIXA ? 'financeiro' : dif < -FF_FAIXA ? 'fisico' : 'equilibrado';
      // custo por unidade física (etapa por média de sub-metas: unidades equivalentes = % × meta)
      const unidades = r.media ? r.pct * r.meta : r.acum;
      const custo = { gasto: fe.acum, unidades, real: unidades > 0 ? fe.acum / unidades : null, previsto: r.meta > 0 ? fe.previsto / r.meta : null, unidade: r.unidade };
      custo.razao = custo.real != null && custo.previsto ? custo.real / custo.previsto : null;
      // séries mensais em % acumulado (físico e financeiro)
      let ac = 0;
      const serie = r.serie.map(s => { ac += porMes[s.mes] || 0;
        return { mes: s.mes, fisico: r.media ? s.acum : (r.meta ? s.acum / r.meta * 100 : 0), financeiro: fe.previsto ? ac / fe.previsto * 100 : 0, esperado: r.media ? s.esperado : (r.meta ? s.esperado / r.meta * 100 : 0) }; });
      const proj = projecao(cfg, R, fe.previsto, porMes, fe.acum);
      const itens = (fe.itens || []).map(it => {
        const li = ls.filter(l => l.item === it.id), pm = {}; li.forEach(l => { const b = bucket(l.data); pm[b] = (pm[b] || 0) + Number(l.valor || 0); });
        return Object.assign({ id: it.id, nome: it.nome, natureza: it.natureza, previsto: it.previsto, acum: it.acum, pct: it.previsto ? it.acum / it.previsto : 0 }, projecao(cfg, R, it.previsto, pm, it.acum));
      });
      r.ff = { fisico: fis, financeiro: finPct, difPP: dif * 100, situacao, situacaoTxt: FF_SIT[situacao], alerta: !!fe.acum && dif > FF_ALERTA, diarias: d, custo, serie, projecao: proj, itens,
        previsto: fe.previsto, acum: fe.acum };
      tot.diariasPrev += d.previstas; tot.diariasUsadas += d.usadas; tot.valorDiariasPrev += d.valorPrevisto; tot.valorDiarias += d.valor;
      if (r.ff.alerta) {
        tot.frente++;
        R.alertas.push({ nivel: 'atencao', etapa: r.id, titulo: `Etapa ${r.id}: financeiro à frente do físico (+${fmt.num(dif * 100, 1)} p.p.)`,
          detalhe: `${r.nomeCurto}: ${fmt.pct(finPct)} do previsto gasto × ${fmt.pct(fis)} da meta física.` + (d.valor > 0 ? ` Diárias: ${fmt.num(d.usadas, 1)} de ${fmt.int(d.previstas)} (${fmt.pct(d.pct)}) — gasto de diárias adiantado em relação à execução.` : ' Gasto adiantado em relação à execução.') });
      }
      if (proj.antes && proj.situacao === 'antes') R.alertas.push({ nivel: 'atencao', etapa: r.id, titulo: `Etapa ${r.id}: no ritmo atual o saldo acaba em ${fmt.mes(proj.mesFim)}`,
        detalhe: `${r.nomeCurto}: saldo ${fmt.moeda(proj.saldo)}, gasto médio de ${fmt.moeda(proj.ritmo)}/mês nos últimos 3 meses; a vigência vai até ${fmt.data(cfg.vigencia.fim)}.` });
    });
    tot.diariasPct = tot.diariasPrev ? tot.diariasUsadas / tot.diariasPrev : null;
    R.ff = tot;
    return R;
  }

  /** Execução financeira: previsto (plano de aplicação) × executado no mês e acumulado, por etapa, item, natureza e fonte. */
  function financeiro(cfg, fin, mes) {
    const fim = fimDoMes(mes), F = (fin || []).filter(l => l.convenio === cfg.id && !Number(l.excluido) && l.data <= fim);
    const z = () => ({ previsto: 0, mes: 0, acum: 0 });
    const etapas = [], nat = {}, fonte = { concedente: { previsto: Number((cfg.valores || {}).repasse) || 0, mes: 0, acum: 0 }, contrapartida: { previsto: Number((cfg.valores || {}).contrapartida) || 0, mes: 0, acum: 0 } };
    const tot = z();
    cfg.etapas.forEach(e => {
      const r = { id: e.id, nome: e.nomeCurto || e.nome, ...z(), itens: [] };
      (e.itens || []).forEach(it => {
        const ls = F.filter(l => l.etapa === e.id && l.item === it.id), mesV = ls.filter(l => l.data.slice(0, 7) === mes).reduce((s, l) => s + Number(l.valor || 0), 0);
        const acum = ls.reduce((s, l) => s + Number(l.valor || 0), 0), qtd = ls.reduce((s, l) => s + Number(l.quantidade || 0), 0);
        const x = { id: it.id, nome: it.nome, natureza: it.natureza, unidade: it.unidade, quantidadePrevista: it.quantidade, quantidade: qtd, previsto: Number(it.total) || 0, mes: mesV, acum };
        r.itens.push(x); r.previsto += x.previsto; r.mes += mesV; r.acum += acum;
        const n = nat[it.natureza] = nat[it.natureza] || { natureza: it.natureza, nome: NATUREZAS[it.natureza] || it.natureza, ...z() };
        n.previsto += x.previsto; n.mes += mesV; n.acum += acum;
      });
      r.saldo = r.previsto - r.acum; r.pct = r.previsto ? r.acum / r.previsto : 0;
      tot.previsto += r.previsto; tot.mes += r.mes; tot.acum += r.acum;
      etapas.push(r);
    });
    F.forEach(l => { const f = fonte[l.fonte] || fonte.concedente; f.acum += Number(l.valor || 0); if (l.data.slice(0, 7) === mes) f.mes += Number(l.valor || 0); });
    const fin2 = x => Object.assign(x, { saldo: x.previsto - x.acum, pct: x.previsto ? x.acum / x.previsto : 0 });
    Object.values(fonte).forEach(fin2); fin2(tot);
    return { etapas, naturezas: Object.values(nat).map(fin2).sort((a, b) => a.natureza.localeCompare(b.natureza)), fonte, total: tot, lancamentos: F };
  }

  /* ================= textos ================= */
  const TEXTOS_PADRAO = {
    etapas: {
      '1.1': { evidencias: 'Processos de aquisição, notas de empenho, notas fiscais e termos de recebimento dos bens.',
        justificativa: 'A aquisição dos bens segue o rito do processo licitatório e o cronograma de desembolso do convênio.',
        fator: 'Prazos dos processos licitatórios e de entrega pelos fornecedores.', providencia: 'Acompanhamento dos processos de aquisição junto ao setor de compras da ADAF.',
        situacao: 'em execução, com aquisições em andamento.' },
      '1.3': { evidencias: 'Registros dos monitoramentos e levantamentos realizados pelas equipes responsáveis, incluindo os respectivos registros operacionais e documentos de fiscalização/vigilância produzidos em campo.',
        justificativa: 'A execução das atividades ocorre de forma programada e escalonada, considerando a distribuição territorial dos municípios, as condições de acesso e a disponibilidade das equipes.',
        fator: 'Ocorrência da Mosca-da-Carambola no município de Itacoatiara, exigindo atuação conjunta de servidores da SFA/AM, ADAF e ADERR.',
        providencia: 'Manutenção dos monitoramentos conjuntos em Itacoatiara e programação das atividades nos municípios de Novo Aripuanã, Borba, Manicoré e Nova Olinda do Norte para os próximos ciclos operacionais.',
        situacao: 'em execução, com continuidade prevista no exercício.' },
      '1.4': { evidencias: 'Registros dos levantamentos fitossanitários realizados pelas equipes (e-GDV), relatórios e demais documentos técnicos produzidos durante as atividades.',
        justificativa: 'O quantitativo executado corresponde ao período de execução do convênio e à programação anual das atividades.',
        fator: 'Limitação do número de servidores disponíveis em determinadas unidades locais, especialmente para atendimento simultâneo das demandas de campo.',
        providencia: 'A Gerência de Defesa Vegetal/Central realizou apoio técnico e operacional às unidades, inclusive mediante deslocamento de servidores para os municípios com necessidade de reforço de equipe.',
        situacao: 'em execução, com continuidade programada para os próximos ciclos.' },
      '1.5': { evidencias: 'Registros das inspeções e ações de controle realizadas em campo, documentos de orientação e acompanhamento das propriedades e demais registros técnicos correspondentes.',
        justificativa: 'A meta possui execução continuada ao longo do exercício, sendo as ações realizadas de acordo com a necessidade identificada nas áreas monitoradas e com a programação operacional.',
        fator: 'Condições de acesso às propriedades, distribuição geográfica das áreas atendidas e disponibilidade operacional das equipes.',
        providencia: 'Continuidade do acompanhamento das áreas afetadas e programação das ações remanescentes para os próximos ciclos.',
        situacao: 'execução em andamento.' },
      '1.9': { evidencias: 'Termos de Fiscalização emitidos e respectivos registros operacionais das ações realizadas (e-GDV).',
        justificativa: 'As operações são executadas de forma programada e contínua, de acordo com o planejamento operacional e a disponibilidade das equipes.',
        fator: 'Quantitativo limitado de servidores disponíveis na unidade local de Tabatinga.',
        providencia: 'Mobilização de servidores de outras unidades locais e da Gerência de Defesa Vegetal/Central, inclusive com deslocamento de pessoal para apoiar as operações.',
        situacao: 'execução em andamento.' },
      '1.10': { evidencias: 'Registros de abordagem, Termos de Fiscalização emitidos, registros de apreensão e rechaço e demais documentos produzidos pelas barreiras (e-GDV).',
        justificativa: 'A meta é anual e de execução contínua nas barreiras fixas.',
        fator: 'Necessidade de atuação permanente e integrada das equipes nas barreiras, considerando o fluxo de veículos e a necessidade de manutenção da fiscalização.',
        providencia: 'Manutenção das operações nas duas barreiras, com atuação das unidades responsáveis e integração entre ADAF e ADERR na Barreira do Jundiá.',
        situacao: 'execução em andamento.' },
      '1.14': { evidencias: 'Registros e relatórios de supervisão técnica das unidades visitadas.',
        justificativa: 'As supervisões previstas são distribuídas ao longo do exercício.',
        fator: 'Necessidade de compatibilização das agendas de supervisão com as demais atividades operacionais e com os deslocamentos para as unidades localizadas em municípios distantes.',
        providencia: 'Programação das supervisões remanescentes para os próximos ciclos de execução.',
        situacao: 'execução parcial.' }
    },
    gerais: {
      fatores: 'A execução das ações no período foi influenciada pelos seguintes fatores: grande extensão territorial do Estado do Amazonas; dispersão dos municípios e das propriedades rurais; necessidade de transporte fluvial para acesso a determinadas localidades; condições climáticas e regime de cheia dos rios; dificuldades de acesso e deslocamento em áreas rurais; disponibilidade limitada de servidores em algumas unidades; necessidade de apoio e deslocamento de equipes da Gerência de Defesa Vegetal/Central; necessidade de reposição de insumos e suprimentos; necessidade de disponibilidade de combustível para deslocamentos e operações de campo; compatibilização das atividades do convênio com as demais atribuições institucionais da ADAF.',
      providencias: 'Deslocamento de servidores da Gerência de Defesa Vegetal/Central para apoio às unidades locais;\nApoio entre diferentes unidades operacionais;\nRealização de ações conjuntas com outros órgãos de defesa agropecuária;\nManutenção das operações de fiscalização nas barreiras fixas e móveis;\nProgramação das atividades pendentes para os ciclos seguintes;\nContinuidade do monitoramento das áreas de ocorrência ou risco fitossanitário;\nAcompanhamento das propriedades afetadas pela Monilíase;\nManutenção das supervisões técnicas das unidades operacionais.',
      analise: 'As etapas com percentuais inferiores a 50% apresentam justificativa relacionada principalmente ao caráter parcial do período de referência, à programação escalonada das atividades, à disponibilidade de equipes e às condições logísticas do Estado.\nNão foram identificados, no período analisado, desvio de finalidade, alteração do objeto pactuado ou situação que indique inviabilidade do cumprimento das metas previstas.\nA execução parcial registrada não deve ser interpretada isoladamente como insuficiência de execução, uma vez que as metas são distribuídas ao longo da vigência do convênio.',
      conclusao: 'Os resultados demonstram que as atividades vêm sendo executadas de forma compatível com a programação operacional, observadas as particularidades territoriais, logísticas e de disponibilidade de equipes do Estado do Amazonas.\nAs etapas ainda não concluídas permanecem programadas para continuidade nos próximos ciclos de execução, com adoção de medidas de apoio operacional e redistribuição de equipes quando necessário.\nDessa forma, para fins de acompanhamento e auditoria, registra-se que a execução física da Meta 1, no período de referência, é comprovável por meio dos registros operacionais, termos de fiscalização, registros de abordagens, apreensões, supervisões e demais documentos técnicos produzidos pelas unidades executoras.'
    }
  };
  const ROTULOS_TXT = { evidencias: 'Evidências da execução', justificativa: 'Justificativa para execução parcial', fator: 'Fator interveniente', providencia: 'Providência adotada', situacao: 'Situação da etapa' };
  const ROTULOS_GERAIS = { fatores: 'Fatores intervenientes gerais', providencias: 'Providências adotadas pela ADAF', analise: 'Análise (texto livre)', conclusao: 'Conclusão (texto livre)' };

  /**
   * Textos iniciais do relatório de "mes": os salvos deste mês; senão os do último relatório salvo antes dele; senão os textos-padrão
   * (tirados do relatório parcial de referência). Campos vazios caem no padrão.
   */
  function textosIniciais(cfg, relatorios, mes) {
    const rs = (relatorios || []).filter(r => r.convenio === cfg.id).sort((a, b) => a.mes.localeCompare(b.mes));
    const deste = rs.find(r => r.mes === mes), anterior = rs.filter(r => r.mes < mes).pop();
    const base = deste || anterior, t = (base && base.textos) || {};
    const out = { etapas: {}, gerais: {} };
    cfg.etapas.forEach(e => { out.etapas[e.id] = {}; Object.keys(ROTULOS_TXT).forEach(k => {
      const v = ((t.etapas || {})[e.id] || {})[k]; out.etapas[e.id][k] = v != null && v !== '' ? v : ((TEXTOS_PADRAO.etapas[e.id] || {})[k] || ''); }); });
    Object.keys(ROTULOS_GERAIS).forEach(k => { const v = (t.gerais || {})[k]; out.gerais[k] = v != null && v !== '' ? v : TEXTOS_PADRAO.gerais[k]; });
    return { textos: out, numero: deste ? Number(deste.numero) : numeroAuto(cfg, mes), salvo: !!deste, origem: deste ? 'salvo' : anterior ? 'anterior' : 'padrao', anterior: anterior ? anterior.mes : '' };
  }

  /* ================= relatório: blocos ================= */
  const P = (texto, o) => Object.assign({ t: 'p', texto }, o || {});
  const linhasDe = txt => String(txt || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const pctTxt = r => fmt.pct(r.pct);

  /** Tabela-resumo (como a do relatório parcial): etapa, descrição, município/BVA/sub-meta, prevista, executada no mês, acumulada, % alcançado. */
  function tabelaResumo(R) {
    const linhas = [];
    R.etapas.forEach(r => {
      let sub;
      if (r.apuracao === 'pce') sub = [[r.municipios && r.municipios.length ? r.municipios.map(x => x.nome).join(', ') : '—', `${fmt.int(r.meta)} ${r.unidade}`, fmt.int(r.mes), fmt.int(r.acum), pctTxt(r)]];
      else if (r.apuracao === 'bens') sub = [[`${fmt.int(r.linhas.length)} bens (${r.linhas.map(x => x.rotulo.split(' – ')[1]).filter((v, i, a) => a.indexOf(v) === i).join(', ')})`, `${fmt.int(r.meta)} ${r.unidade}`, fmt.int(r.mes), fmt.int(r.acum), pctTxt(r)]];
      else if (r.apuracao === 'volante') sub = [[(R.cfg.etapas.find(e => e.id === r.id).municipios || []).join(', '), `${fmt.int(r.meta)} ${r.unidade}`, fmt.int(r.mes), fmt.int(r.acum), pctTxt(r)]];
      else {
        const ls = r.linhas.filter(x => !x.ajuste);
        sub = ls.map(x => [x.rotulo, x.previsto ? `${fmt.int(x.previsto)} ${x.s ? x.s.unidade : r.unidade}` : (r.apuracao === 'bva' ? '' : '—'), fmt.int(x.mes), fmt.int(x.acum),
          r.apuracao === 'bva' ? '' : (x.previsto ? fmt.pct(x.acum / x.previsto) : '')]);
        if (r.apuracao === 'bva') { sub[0][1] = `${fmt.int(r.meta)} ${r.unidade}`; sub[0][4] = pctTxt(r); sub.push(['TOTAL', '', fmt.int(r.mes), fmt.int(r.acum), '']); }
        if (r.apuracao === 'manual' && !r.media && r.linhas.some(x => !x.previsto)) { sub.forEach(s => { s[1] = ''; s[4] = ''; }); sub[0][1] = `${fmt.int(r.meta)} ${r.unidade}`; sub[0][4] = pctTxt(r); }
        if (r.media) sub.push(['Etapa (média das sub-metas)', r.previstoTxt, '', '', pctTxt(r)]);
        if (!sub.length) sub = [['—', `${fmt.int(r.meta)} ${r.unidade}`, fmt.int(r.mes), fmt.int(r.acum), pctTxt(r)]];
      }
      const aj = r.linhas.find(x => x.ajuste);
      if (aj && r.apuracao !== 'pce' && r.apuracao !== 'volante') sub.push(['Ajuste manual', '', fmt.int(aj.mes), fmt.int(aj.acum), '']);
      // prevista e % da etapa inteira (BVAs, ações por município): uma célula só, mesclada na vertical
      const daEtapa = sub.length > 1 && (r.apuracao === 'bva' || (r.apuracao === 'manual' && !r.media && r.linhas.some(x => !x.previsto)));
      sub.forEach((s, i) => linhas.push([i === 0 ? { texto: r.id, rowspan: sub.length, negrito: true, alinhar: 'c' } : null,
        i === 0 ? { texto: r.nome, rowspan: sub.length } : null, s[0],
        daEtapa ? (i === 0 ? { texto: s[1], alinhar: 'c', rowspan: sub.length } : null) : { texto: s[1], alinhar: 'c' },
        { texto: s[2], alinhar: 'd' }, { texto: s[3], alinhar: 'd' },
        daEtapa ? (i === 0 ? { texto: s[4], alinhar: 'd', negrito: true, rowspan: sub.length } : null) : { texto: s[4], alinhar: 'd', negrito: true }]));
    });
    return { t: 'tabela', titulo: `RESUMO DE EXECUÇÃO DE METAS DO ${(R.cfg.nome || '').toUpperCase()}`, pequena: true,
      colunas: [{ rotulo: 'Etapa', largura: 6 }, { rotulo: 'Descrição', largura: 22 }, { rotulo: 'Município / BVA / sub-meta', largura: 24 }, { rotulo: 'Prevista', largura: 14 },
        { rotulo: `Exec. ${fmt.mesCurto(R.mes)}`, largura: 10 }, { rotulo: 'Exec. acumulada', largura: 12 }, { rotulo: '% alcançado', largura: 12 }], linhas };
  }
  function tabelaFin(titulo, primeira, lst, total) {
    const lin = lst.map(x => [x.rotulo, { texto: fmt.moeda(x.previsto), alinhar: 'd' }, { texto: fmt.moeda(x.mes), alinhar: 'd' }, { texto: fmt.moeda(x.acum), alinhar: 'd' },
      { texto: fmt.moeda(x.previsto - x.acum), alinhar: 'd' }, { texto: x.previsto ? fmt.pct(x.acum / x.previsto) : '—', alinhar: 'd' }]);
    if (total) lin.push([{ texto: 'TOTAL', negrito: true }, { texto: fmt.moeda(total.previsto), alinhar: 'd', negrito: true }, { texto: fmt.moeda(total.mes), alinhar: 'd', negrito: true },
      { texto: fmt.moeda(total.acum), alinhar: 'd', negrito: true }, { texto: fmt.moeda(total.previsto - total.acum), alinhar: 'd', negrito: true },
      { texto: total.previsto ? fmt.pct(total.acum / total.previsto) : '—', alinhar: 'd', negrito: true }]);
    return { t: 'tabela', titulo, pequena: true, colunas: [{ rotulo: primeira, largura: 30 }, { rotulo: 'Previsto', largura: 15 }, { rotulo: 'Executado no mês', largura: 14 },
      { rotulo: 'Executado acumulado', largura: 15 }, { rotulo: 'Saldo', largura: 15 }, { rotulo: '% executado', largura: 11 }], linhas: lin };
  }

  /** Tabela "Físico × Financeiro por etapa" (relatório: seção 8). */
  function tabelaFisFin(R) {
    const lin = R.etapas.map(r => { const f = r.ff, c = f.custo, dd = f.diarias;
      return [{ texto: r.id, negrito: true, alinhar: 'c' }, r.nomeCurto, { texto: fmt.pct(f.fisico), alinhar: 'd' }, { texto: fmt.pct(f.financeiro), alinhar: 'd' },
        { texto: (f.difPP > 0 ? '+' : '') + fmt.num(f.difPP, 1), alinhar: 'd' },
        { texto: dd.previstas ? `${fmt.num(dd.usadas, 1)} de ${fmt.int(dd.previstas)}` : '—', alinhar: 'd' },
        { texto: c.real != null ? `${fmt.moeda(c.real)} × ${fmt.moeda(c.previsto)}` : `— × ${fmt.moeda(c.previsto)}`, alinhar: 'd' }, f.situacaoTxt]; });
    return { t: 'tabela', titulo: 'Físico × Financeiro por etapa', pequena: true,
      colunas: [{ rotulo: 'Etapa', largura: 6 }, { rotulo: 'Descrição', largura: 18 }, { rotulo: '% físico', largura: 9 }, { rotulo: '% financeiro', largura: 10 },
        { rotulo: 'Dif. (p.p.)', largura: 8 }, { rotulo: 'Diárias usadas / previstas', largura: 13 }, { rotulo: 'Custo por unidade (real × previsto)', largura: 20 }, { rotulo: 'Situação', largura: 16 }], linhas: lin };
  }
  /** Frase automática sobre as etapas com financeiro adiantado (> 20 p.p. à frente do físico). */
  function fraseFisFin(R) {
    const fr = R.etapas.filter(r => r.ff && r.ff.alerta);
    return fr.length
      ? `Físico × financeiro: ${fr.length === 1 ? 'a etapa' : 'as etapas'} ${listaE(fr.map(r => `${r.id} (financeiro ${fmt.pct(r.ff.financeiro)} × físico ${fmt.pct(r.ff.fisico)}; +${fmt.num(r.ff.difPP, 1)} p.p.)`))} ${fr.length === 1 ? 'apresenta' : 'apresentam'} desembolso adiantado em relação à execução física (gasto de diárias à frente da meta); a programação das próximas ações deve recuperar o ritmo físico ou rever o uso das diárias.`
      : `Físico × financeiro: nenhuma etapa com desembolso mais de ${Math.round(FF_ALERTA * 100)} p.p. à frente da execução física.`;
  }

  /**
   * Blocos do relatório. R = calcular(...); t = textos {etapas, gerais}; o = {numero, dataEmissao (AAAA-MM-DD)}.
   */
  function blocos(R, t, o) {
    o = o || {}; t = t || textosIniciais(R.cfg, [], R.mes).textos;
    // o.consolidado: total desde o início da execução até o.ate (sem as colunas e frases "no mês")
    const consol = !!o.consolidado, ateD = o.ate || R.fim;
    const c = R.cfg, B = [], mes = fmt.mes(R.mes), ini = fmt.mes(R.meses[0]);
    const per = consol ? `${fmt.data(c.inicioExecucao)} a ${fmt.data(ateD)}` : R.meses[0] === R.mes ? mes : `${ini} a ${mes}`;
    const ateTxt = consol ? fmt.data(ateD) : mes;
    const semMes = (tab, i) => { tab.colunas.splice(i, 1); tab.linhas.forEach(l => l.splice(i, 1)); return tab; };
    B.push({ t: 'titulo', texto: consol ? `${c.titulo} – CONSOLIDADO ATÉ ${fmt.data(ateD)}` : `${c.titulo} – PARCIAL ${o.numero || numeroAuto(c, R.mes)}` });
    B.push({ t: 'titulo2', texto: c.nome });
    B.push(P(c.convenente, { rotulo: 'Convenente' }), P(c.objeto, { rotulo: 'Objeto' }), P(c.meta, { negrito: true }),
      P(consol ? `consolidado desde o início da execução: ${per}` : `${mes} (${fmt.data(R.mes + '-01')} a ${fmt.data(R.fim)}); acumulado desde o início da execução: ${per} (${fmt.data(c.inicioExecucao)} a ${fmt.data(R.fim)})`, { rotulo: 'Período de referência' }));
    B.push({ t: 'h', texto: '1. OBJETIVO DO RELATÓRIO' });
    B.push(P(`O presente relatório tem por objetivo registrar e demonstrar, de forma circunstanciada, a execução física da ${c.meta.replace(/:\s*/, ' – ')}, prevista no ${c.nome}, celebrado entre o Ministério da Agricultura e Pecuária – MAPA e a ${c.convenente}.`));
    B.push(P(consol ? `O período analisado é o consolidado de ${per}, desde ${fmt.data(c.inicioExecucao)}, data de início da execução das ações com utilização dos recursos do convênio.`
      : `O período analisado é o mês de ${mes}, com o acumulado desde ${fmt.data(c.inicioExecucao)}, data de início da execução das ações com utilização dos recursos do convênio.`));
    B.push(P('As informações apresentadas estão organizadas por etapa, com indicação dos quantitativos realizados, percentual de execução, evidências da atividade, fatores que influenciaram a execução, justificativas para eventual execução parcial e providências adotadas pela ADAF.'));
    B.push({ t: 'h', texto: '2. SÍNTESE DA EXECUÇÃO FÍSICA' });
    B.push(P(`No período de ${per}, foram executadas ações de vigilância fitossanitária, levantamentos para detecção de pragas, controle e supressão da Monilíase, fiscalização móvel e fixa do trânsito de vegetais e supervisão das unidades operacionais. Os principais resultados registrados foram:`));
    B.push(consol ? semMes(tabelaResumo(R), 4) : tabelaResumo(R));
    B.push(P(`Os percentuais representam a relação entre a execução acumulada registrada e a respectiva meta prevista no Plano de Trabalho. Esperado pelo tempo decorrido (linear de ${fmt.data(c.inicioExecucao)} a ${fmt.data(c.vigencia.fim)}): ${fmt.pct(R.esperado)}.`, { pequeno: true }));
    B.push({ t: 'h2', texto: 'Memória descritiva' });
    R.etapas.forEach(r => B.push(P(r.memoria, { rotulo: `Etapa ${r.id}` })));
    B.push({ t: 'h', texto: '3. EXECUÇÃO CIRCUNSTANCIADA POR ETAPA' });
    R.etapas.forEach((r, i) => {
      const x = (t.etapas || {})[r.id] || {};
      B.push({ t: 'h2', texto: `3.${i + 1} Etapa ${r.id} – ${r.nome}` });
      B.push(P(consol ? `${per} (consolidado).` : `${mes} (acumulado: ${per}).`, { rotulo: 'Período' }));
      B.push(P(r.execTexto + (r.media || consol ? '' : ` No mês: ${fmt.int(r.mes)}.`), { rotulo: 'Execução registrada' }));
      B.push(P(r.media ? r.previstoTxt : `${fmt.int(r.meta)} ${r.unidade}.${r.obs ? ' ' + r.obs : ''}`, { rotulo: 'Meta' }));
      B.push(P(`${fmt.pct(r.pct)}${r.media ? ' (média das sub-metas)' : ''} · esperado pelo tempo: ${fmt.pct(r.esperado)} · situação: ${r.situacaoTxt.toLowerCase()}.`, { rotulo: 'Percentual de execução' }));
      ['evidencias', 'justificativa', 'fator', 'providencia', 'situacao'].forEach(k => { if (x[k]) B.push(P(x[k], { rotulo: ROTULOS_TXT[k] })); });
    });
    B.push({ t: 'h', texto: '4. FATORES INTERVENIENTES GERAIS' });
    linhasDe(t.gerais.fatores).forEach(l => B.push(P(l)));
    B.push({ t: 'h', texto: '5. PROVIDÊNCIAS ADOTADAS PELA ADAF' });
    B.push(P('Para reduzir os impactos dos fatores intervenientes, foram adotadas, no período, as seguintes providências:'));
    B.push({ t: 'lista', itens: linhasDe(t.gerais.providencias) });
    B.push({ t: 'h', texto: '6. ANÁLISE DA EXECUÇÃO DA META' });
    const ord = R.etapas.slice().sort((a, b) => b.pct - a.pct), top = ord.filter(r => r.pct > 0).slice(0, 3), baixo = ord.filter(r => r.pct < 0.5);
    B.push(P(`Considerando o acumulado até ${ateTxt}, os maiores percentuais registrados foram:`));
    B.push({ t: 'lista', itens: top.length ? top.map(r => `${fmt.pct(r.pct)} – ${r.nomeCurto.toLowerCase()} (etapa ${r.id})`) : ['nenhuma etapa com execução registrada.'] });
    B.push(P(baixo.length ? `Etapas com percentual inferior a 50%: ${baixo.map(r => `${r.id} (${fmt.pct(r.pct)})`).join(', ')}.` : 'Todas as etapas estão com 50% ou mais da meta executada.'));
    const atras = R.etapas.filter(r => r.situacao === 'atrasada');
    B.push(P(atras.length ? `Em relação ao esperado pelo tempo decorrido (${fmt.pct(R.esperado)}), estão abaixo do ritmo: ${atras.map(r => `${r.id} (${fmt.pct(r.pct)})`).join(', ')}.` : `Todas as etapas estão no ritmo ou adiantadas em relação ao esperado pelo tempo decorrido (${fmt.pct(R.esperado)}).`));
    B.push(P(fraseFisFin(R)));
    linhasDe(t.gerais.analise).forEach(l => B.push(P(l)));
    B.push({ t: 'h', texto: '7. CONCLUSÃO TÉCNICA' });
    const num = id => R.etapas.find(r => r.id === id);
    const partes = R.etapas.filter(r => r.acum > 0 && !r.media).map(r => `${fmt.int(r.acum)} ${r.unidade} (etapa ${r.id})`);
    B.push(P(`Com base nos registros de execução até ${ateTxt}, conclui-se que a ${c.meta.replace(/:\s*/, ' – ')} encontra-se em execução${partes.length ? ', tendo sido registrados ' + listaE(partes) : ''}${num('1.3') && num('1.3').acum ? ', além dos monitoramentos e da vigilância em áreas de risco fitossanitário (etapa 1.3)' : ''}.`));
    linhasDe(t.gerais.conclusao).forEach(l => B.push(P(l)));
    B.push({ t: 'h', texto: '8. EXECUÇÃO FINANCEIRA' });
    const F = R.fin;
    B.push(P(`Valor global ${fmt.moeda(c.valores.global)}: repasse ${fmt.moeda(c.valores.repasse)} (custeio ${fmt.moeda(c.valores.repasseCusteio)}, investimento ${fmt.moeda(c.valores.repasseInvestimento)}) e contrapartida ${fmt.moeda(c.valores.contrapartida)}. Executado até ${ateTxt}: ${fmt.moeda(F.total.acum)} (${fmt.pct(F.total.pct)}); saldo ${fmt.moeda(F.total.saldo)}.`));
    const tf = tab => consol ? semMes(tab, 2) : tab;
    B.push(tf(tabelaFin('Por etapa', 'Etapa', F.etapas.map(x => ({ rotulo: `${x.id} ${x.nome}`, previsto: x.previsto, mes: x.mes, acum: x.acum })), F.total)));
    B.push(tf(tabelaFin('Por natureza de despesa', 'Natureza', F.naturezas.map(x => ({ rotulo: `${x.natureza} – ${x.nome}`, previsto: x.previsto, mes: x.mes, acum: x.acum })), F.total)));
    B.push(tf(tabelaFin('Por fonte de recurso', 'Fonte', [{ rotulo: 'Repasse (concedente)', ...F.fonte.concedente }, { rotulo: 'Contrapartida (convenente)', ...F.fonte.contrapartida }],
      { previsto: F.fonte.concedente.previsto + F.fonte.contrapartida.previsto, mes: F.fonte.concedente.mes + F.fonte.contrapartida.mes, acum: F.fonte.concedente.acum + F.fonte.contrapartida.acum })));
    B.push(tabelaFisFin(R));
    B.push(P(`% físico = execução acumulada ÷ meta (limitado a 100%); % financeiro = executado acumulado ÷ previsto da etapa; diárias = itens de natureza 33.90.14 e 33.90.36 (quantidade lançada ou valor ÷ valor unitário); custo por unidade = gasto ÷ unidades físicas executadas × previsto ÷ meta. ${fraseFisFin(R)}`, { pequeno: true }));
    B.push(P(`${c.local}, ${fmt.extenso(o.dataEmissao || R.fim)}.`, { alinhar: 'd', espaco: true }));
    B.push({ t: 'assinaturas', itens: (c.assinaturas || []).filter(a => a.nome || a.cargo) });
    return B;
  }

  /* ================= relatório: HTML (modelo conv-relatorio.html → PDF) ================= */
  function html(doc, raiz, B) {
    const el = (tag, cls, txt) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    raiz.textContent = '';
    B.forEach(b => {
      if (b.t === 'titulo' || b.t === 'titulo2') raiz.append(el(b.t === 'titulo' ? 'h1' : 'h2', b.t, b.texto));
      else if (b.t === 'h') raiz.append(el('h3', 'sec', b.texto));
      else if (b.t === 'h2') raiz.append(el('h4', 'sub', b.texto));
      else if (b.t === 'p') {
        const p = el('p', [b.negrito ? 'neg' : '', b.pequeno ? 'peq' : '', b.alinhar === 'd' ? 'dir' : '', b.espaco ? 'esp' : ''].filter(Boolean).join(' '));
        if (b.rotulo) { p.append(el('b', null, b.rotulo + ': ')); }
        p.append(doc.createTextNode(b.texto)); raiz.append(p);
      } else if (b.t === 'lista') { const ul = el('ul'); b.itens.forEach(i => ul.append(el('li', null, i))); raiz.append(ul); }
      else if (b.t === 'imagem') {
        const f = el('figure', 'fig'), im = el('img'); im.src = b.src || ''; im.alt = b.legenda || '';
        if (b.larguraCm) im.style.width = Math.min(18, b.larguraCm) + 'cm';
        f.append(im); if (b.legenda) f.append(el('figcaption', null, b.legenda)); raiz.append(f);
      }
      else if (b.t === 'tabela') {
        const wrap = el('div', 'tab'); if (b.titulo) wrap.append(el('div', 'tab-tit', b.titulo));
        const tb = el('table', b.mini ? 'mini' : b.pequena ? 'peq' : ''), cg = el('colgroup'), soma = b.colunas.reduce((s, x) => s + x.largura, 0);
        b.colunas.forEach(x => { const col = el('col'); col.style.width = (100 * x.largura / soma).toFixed(2) + '%'; cg.append(col); });
        tb.append(cg);
        const th = el('thead'), tr = el('tr'); b.colunas.forEach(x => tr.append(el('th', null, x.rotulo))); th.append(tr); tb.append(th);
        const tbo = el('tbody');
        b.linhas.forEach(l => { const r = el('tr'); l.forEach(cel => { if (cel === null) return; const o = typeof cel === 'object' ? cel : { texto: cel };
          const td = el('td', [o.alinhar === 'd' ? 'dir' : o.alinhar === 'c' ? 'cen' : '', o.negrito ? 'neg' : ''].filter(Boolean).join(' '), o.texto == null ? '' : String(o.texto));
          if (o.rowspan > 1) td.rowSpan = o.rowspan; r.append(td); }); tbo.append(r); });
        tb.append(tbo); wrap.append(tb); raiz.append(wrap);
      } else if (b.t === 'assinaturas') {
        const g = el('div', 'assins');
        b.itens.forEach(a => { const d = el('div', 'assin'); d.append(el('div', 'linha'), el('b', null, a.nome), el('small', null, a.cargo)); g.append(d); });
        raiz.append(g);
      }
    });
  }

  return { calcular, financeiro, fisicoFinanceiro, tabelaFisFin, fraseFisFin, FF_SIT, FF_ALERTA, NAT_DIARIAS, blocos, html, textosIniciais, numeroAuto, mesesDe, esperadoEm, fimDoMes, fmt, TEXTOS_PADRAO, ROTULOS_TXT, ROTULOS_GERAIS, SIT_BEM, NATUREZAS, SITUACAO };
})();
if (typeof window !== 'undefined') window.ConvDocs = ConvDocs;
