// Relatório GDV — relatório técnico PARCIAL (mensal) e CONSOLIDADO (anual) da Gerência de Defesa Vegetal, no modelo do relatório técnico
// anual da GDV/ADAF. Usado pelo painel (aba Relatórios: pré-visualização, lançamentos e textos) e pelos dois formatos de saída: o modelo
// HTML (relgdv-relatorio.html → PDF/impressão) e o Word (.docx, painel/js/docx.js). Como no relatório do convênio, o conteúdo é montado
// uma vez em blocos neutros (título, parágrafo, tabela, imagem, quebra, orientação) e cada formato só desenha os blocos.
// Dados: a apuração do servidor (painelRelGdvApuracao: só agregados + anexo mascarado), os lançamentos manuais (RelGdvLancamentos) e os
// textos editáveis (RelGdvTextos). Grupos de pragas: CONFIG.RELGDV.grupos. Depende de ConvDocs (formatos e desenho HTML dos blocos).
const RelGdvDocs = (() => {
  'use strict';
  const CD = typeof ConvDocs !== 'undefined' ? ConvDocs : (typeof window !== 'undefined' ? window.ConvDocs : null);
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const pad2 = n => String(n).padStart(2, '0');
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const NF = (c, min) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: c, minimumFractionDigits: min || 0 });
  const fmt = {
    int: v => v == null || !isFinite(v) ? '—' : NF(0).format(Math.round(v)),
    num: (v, c = 2) => v == null || !isFinite(v) ? '—' : NF(c).format(v),
    data: s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; },
    extenso: iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}` : ''; }
  };
  /** Valor de um quadro: inteiro ou com casas (área em ha, toneladas, m³). */
  const valorTxt = (v, unid) => v == null ? '—' : /^(ha|t|m³)$/.test(unid) ? fmt.num(v, unid === 't' ? 3 : 2) : fmt.int(v);
  /** Nas tabelas por município: zero vira "–" (como no relatório de referência). */
  const tracoSeZero = v => (!v ? '–' : fmt.int(v));
  const fimDoMes = (ano, m) => `${ano}-${pad2(m)}-${pad2(new Date(Date.UTC(ano, m, 0)).getUTCDate())}`;
  const cfgPadrao = () => (typeof CONFIG !== 'undefined' && CONFIG.RELGDV) || { grupos: [], assinaturas: [], local: 'Manaus/AM' };

  /* ================= textos ================= */
  // Textos-padrão: reescritos de forma genérica a partir do relatório técnico de referência (sem números fixos: os números entram pelos
  // marcadores). Sem nenhum dado pessoal. O gestor edita no painel; ficam salvos por relatório (mensal: por mês; anual: por ano).
  const TEXTOS_PADRAO = {
    introducao: 'A defesa sanitária vegetal é fundamental para prevenir a introdução e a dispersão de pragas que possam causar danos econômicos, sociais e ambientais. No Sistema Unificado de Atenção à Sanidade Agropecuária (SUASA), cabe à ADAF atuar como instância local e intermediária na proteção fitossanitária do Estado do Amazonas. Este relatório apresenta as atividades executadas, supervisionadas e apoiadas pela Gerência de Defesa Vegetal em {periodo}, alinhadas aos Programas Nacionais do Ministério da Agricultura e Pecuária (MAPA).\n\nAs ações abrangem os levantamentos fitossanitários de detecção e delimitação de pragas quarentenárias, o controle do trânsito de vegetais e suas partes nas barreiras, a certificação fitossanitária de origem e trânsito (CFO/CFOC/PTV), a educação sanitária e os planos de contingência. Os números das tabelas foram apurados no e-GDV a partir dos registros de campo; as linhas lançadas manualmente estão indicadas.',
    secao1: 'Esta seção descreve os levantamentos fitossanitários de detecção e de delimitação das pragas quarentenárias de interesse no Estado, realizados em {periodo}. Os levantamentos visam identificar precocemente focos de pragas regulamentadas, mapear a sua distribuição e embasar as ações de controle e erradicação.',
    metodologia: 'Os levantamentos seguiram as diretrizes técnicas dos programas nacionais e as normas do MAPA para as pragas quarentenárias. As inspeções concentraram-se nos locais de maior risco de introdução ou disseminação das pragas alvo: propriedades comerciais, viveiros, áreas urbanas com hospedeiros (quintais e sítios), plantios abandonados ou não comerciais, pontos de venda e rotas de trânsito de vegetais. Em cada local foram registrados no e-GDV os dados da propriedade, as culturas avaliadas, o resultado por praga (detectada, suspeita ou não detectada), as coordenadas geográficas e as amostras coletadas, enviadas a laboratório oficial para diagnóstico quando necessário.',
    resultados: 'Em {periodo} foram realizados {levantamentos} levantamentos fitossanitários em {propriedadesVisitadas} propriedades/localidades distintas de {municipiosLevantados} municípios. Os resultados são apresentados a seguir por grupo de pragas, com a tabela por município e o mapa dos municípios inspecionados.',
    grupo_citros: 'No levantamento das pragas quarentenárias que afetam os citros foram inspecionados pomares comerciais, quintais com citros e viveiros. As pragas alvo incluem o huanglongbing (HLB/greening), o cancro cítrico, o ácaro hindustânico dos citros (Schizotetranychus hindustanicus) e o inseto vetor do HLB, Diaphorina citri.',
    grupo_soja: 'Visando proteger a cultura da soja no Amazonas, foram realizados levantamentos em áreas de produção e propriedades com histórico de plantio. As pragas monitoradas incluem a planta daninha Amaranthus palmeri e a ferrugem asiática da soja (Phakopsora pachyrhizi), além da fiscalização do cumprimento do vazio sanitário.',
    grupo_moniliase: 'A monilíase do cacaueiro e do cupuaçuzeiro (Moniliophthora roreri) é praga quarentenária de alto impacto. Os levantamentos de detecção e de delimitação cobriram os municípios com registro da doença e os municípios vizinhos, de forma preventiva, com aplicação do protocolo de contenção (poda drástica e destruição dos frutos e restos culturais com suspeita de infecção).',
    grupo_carambola: 'A mosca-da-carambola (Bactrocera carambolae) é praga quarentenária regulamentada nacionalmente. As ações incluem o monitoramento por armadilhas, as inspeções em propriedades urbanas e rurais, feiras e pontos de comercialização e a restrição do trânsito de frutos hospedeiros.',
    grupo_banana: 'Para as pragas da bananeira, em especial a raça 4 tropical do mal-do-Panamá (Fusarium oxysporum f. sp. cubense R4T), a vigilância concentrou-se nas áreas de produção de banana, com coleta de amostras diante de suspeita em campo.',
    grupo_padrao: 'Levantamentos fitossanitários de detecção realizados no período para as pragas deste grupo.',
    laboratorio: 'As amostras coletadas nos levantamentos foram registradas em Termos de Colheita de Amostras e enviadas a laboratório oficial para diagnóstico. A tabela resume os termos e as amostras por praga e a situação dos resultados laboratoriais registrados no e-GDV.',
    secao2: 'Nesta seção são apresentadas as ações de defesa sanitária vegetal do Programa de Prevenção, Controle e Erradicação de Pragas (PCE) e da vigilância do trânsito de vegetais (VIGIFITO) realizadas em {periodo}, consolidadas por mês.',
    vigifito: 'As Barreiras de Vigilância Agropecuária (BVA) fixas e as ações volantes fiscalizam o trânsito de vegetais e suas partes. Em {periodo} foram abordados {veiculos} veículos, com {pessoas} medidas de educação sanitária (veículos orientados) e {tfs} Termos de Fiscalização lavrados.',
    cfo: 'O Certificado Fitossanitário de Origem (CFO) e o Certificado Fitossanitário de Origem Consolidado (CFOC) atestam que as partidas de vegetais estão livres de pragas específicas e viabilizam o trânsito interestadual seguro. A tabela resume os certificados emitidos no período, por produto.',
    ptv: 'A Permissão de Trânsito de Vegetais (PTV) é o documento oficial emitido pela ADAF que autoriza o trânsito de vegetais, partes vegetais ou produtos de origem vegetal para fora do Estado, após a verificação da documentação e a inspeção da carga. A tabela resume as PTV emitidas no período, por produto.',
    educacao: 'A educação sanitária promove a participação de produtores, comerciantes e da população na prevenção e no controle de pragas. A tabela relaciona as ações educativas realizadas no período; a orientação nas barreiras é apurada pelo e-GDV.',
    hlb: 'O Plano de Contingência para o Huanglongbing (HLB) estabelece ações preventivas e de preparação para uma eventual detecção da doença no Amazonas: vigilância em pomares, quintais e viveiros, monitoramento do inseto vetor Diaphorina citri e controle do trânsito de material propagativo.',
    conclusao: 'O conjunto de ações executadas pela Gerência de Defesa Vegetal em {periodo} demonstra a atuação contínua e integrada da defesa sanitária vegetal na prevenção, vigilância e resposta aos riscos fitossanitários do Estado, em consonância com as diretrizes do SUASA e dos Programas Nacionais do MAPA. Os dados consolidados neste relatório subsidiam o planejamento das ações seguintes.'
  };
  const ROTULOS_TXT = { introducao: 'Introdução', secao1: 'Seção I – abertura', metodologia: '1.1 Metodologia aplicada', resultados: '1.2 Resultados – abertura',
    laboratorio: 'Amostras e resultados de laboratório', secao2: 'Seção II – abertura (quadro PCE)', vigifito: 'Seção II – VIGIFITO (barreiras)', cfo: 'Seção III – CFO/CFOC',
    ptv: 'Seção IV – PTV', educacao: 'Seção V – Educação sanitária', hlb: 'Seção VI – Plano de contingência HLB', conclusao: 'Conclusão' };
  const MARCADORES = { periodo: 'mês/ano ou ano do relatório', ano: 'ano', mes: 'mês (por extenso)', municipiosLevantados: 'municípios com levantamento',
    propriedadesVisitadas: 'propriedades/localidades visitadas (distintas)', levantamentos: 'levantamentos fitossanitários', deteccoes: 'detecções e suspeitas (culturas)',
    termosColheita: 'termos de colheita', amostras: 'amostras enviadas a laboratório', termosFiscalizacao: 'termos de fiscalização (PCE)', veiculos: 'veículos abordados nas barreiras',
    pessoas: 'medidas de educação sanitária nas barreiras (veículos orientados)', tfs: 'TFs lavrados nas barreiras' };
  const aplicarMarcadores = (txt, M) => String(txt || '').replace(/\{(\w+)\}/g, (m, k) => (k in M ? M[k] : m));

  /* ================= linhas dos quadros ================= */
  // fonte: 'auto' = apurado pelo e-GDV; 'manual' = lançado no painel (por mês); 'deriv' = soma de outros lançamentos (tabelas ou colunas por município)
  const PCE_ANTES = [
    { chave: 'propAntigas', rotulo: 'Propriedades/localidades antigas visitadas', fonte: 'auto' },
    { chave: 'propNovas', rotulo: 'Propriedades/localidades novas cadastradas no mês', fonte: 'auto' },
    { chave: 'armadilhas', rotulo: 'Propriedade/localidade monitorada – armadilhamento (mosca-da-carambola)', fonte: 'deriv', de: 'mun.carambola.armadilhas|' },
    { chave: 'propVisitadas', rotulo: 'Propriedades/localidades visitadas – total (distintas)', fonte: 'auto' }];
  const PCE_DEPOIS = [
    { chave: 'vazio', rotulo: 'Fiscalização do vazio sanitário da soja', fonte: 'deriv', de: 'mun.soja.vazio|' },
    { chave: 'pce.areaControlada', rotulo: 'Área controlada', unid: 'ha', fonte: 'manual' },
    { chave: 'area', rotulo: 'Área monitorada (culturas avaliadas)', unid: 'ha', fonte: 'auto', nota: 'area' },
    { chave: 'pce.capacitacao', rotulo: 'Capacitação técnica', unid: 'treinando', fonte: 'manual' },
    { chave: 'educacao', rotulo: 'Medida de educação sanitária (termos de fiscalização com a ação)', fonte: 'auto' },
    { chave: 'pce.medidaFito', rotulo: 'Medida fitossanitária', fonte: 'manual' },
    { chave: 'pce.upCad', rotulo: 'Unidades de Produção – UP cadastradas', fonte: 'manual' },
    { chave: 'pce.ucCad', rotulo: 'Unidades de Consolidação – UC cadastradas', fonte: 'manual' },
    { chave: 'ptv', rotulo: 'Emissão de Permissão de Trânsito de Vegetais – PTV', fonte: 'deriv', tab: 'tab.ptv' },
    { chave: 'cfo', rotulo: 'Emissão de CFO/CFOC', fonte: 'deriv', tab: 'tab.cfo' },
    { chave: 'upuc', rotulo: 'Fiscalização de Unidades de Produção e de Consolidação (UP/UC)', fonte: 'auto' },
    { chave: 'pce.rt', rotulo: 'Fiscalização de RT emissor de CFO/CFOC', fonte: 'manual' },
    { chave: 'pce.exameDoc', rotulo: 'Exame e análise de documento fiscal e de sanidade', fonte: 'manual' },
    { chave: 'inspecoes', rotulo: 'Inspeção fitossanitária (levantamentos)', fonte: 'auto' },
    { chave: 'colheitas', rotulo: 'Termo de colheita de amostra', fonte: 'auto' },
    { chave: 'amostras', rotulo: 'Envio de amostra para laboratório (amostras)', fonte: 'auto' },
    { chave: 'termosFisc', rotulo: 'Termo de fiscalização (PCE)', fonte: 'auto' },
    { chave: 'pce.termoInspecao', rotulo: 'Termo de inspeção', fonte: 'manual' },
    { chave: 'pce.advertencia', rotulo: 'Termo de advertência', fonte: 'manual' },
    { chave: 'pce.fielDep', rotulo: 'Termo de fiel depositário', fonte: 'manual' },
    { chave: 'pce.liberacao', rotulo: 'Termo de liberação', fonte: 'manual' },
    { chave: 'pce.desinterdicao', rotulo: 'Termo de desinterdição', fonte: 'manual' },
    { chave: 'pce.autoInfracao', rotulo: 'Auto de infração', fonte: 'manual' },
    { chave: 'pce.autoApreensao', rotulo: 'Auto de apreensão', fonte: 'manual' },
    { chave: 'pce.autoInterdicao', rotulo: 'Auto de interdição', fonte: 'manual' },
    { chave: 'pce.autoDestruicao', rotulo: 'Auto de destruição', fonte: 'manual' },
    { chave: 'pce.outros', rotulo: 'Outros (descrever no texto)', fonte: 'manual' }];
  // VIGIFITO: as linhas da planilha de controle, do motor de indicadores (documentos/indicadores.js); valores = soma dos postos do tipo
  // (relatório VIGIFITO, VigDocs) — o consolidado nunca diverge do relatório VIGIFITO.
  const IND = typeof Indicadores !== 'undefined' ? Indicadores : (typeof window !== 'undefined' ? window.Indicadores : null);
  const VIG = (IND ? IND.VIGIFITO : []).map(d => ({ chave: d.k, rotulo: d.rotulo, unid: d.unid === 'm3' ? 'm³' : d.unid, fonte: d.fonte, nota: d.nota }));
  const BLOCOS_VIG = [['fixa', 'BVA fixas'], ['volante', 'BVA volantes']];
  const TABS = {
    'tab.cfo': [['produto', 'Produto'], ['documentos', 'Nº de CFO/CFOC', 'n'], ['quantidade', 'Quantidade', 'n'], ['unidade', 'Unidade']],
    'tab.ptv': [['produto', 'Produto'], ['documentos', 'Nº de PTV', 'n'], ['quantidade', 'Quantidade', 'n'], ['unidade', 'Unidade']],
    'tab.educacao': [['tipo', 'Tipo de medida'], ['descricao', 'Descrição da medida'], ['periodo', 'Período'], ['local', 'Entidade realizadora / local'], ['publico', 'Público-alvo'], ['atingido', 'Público atingido', 'n']]
  };

  /* ================= cálculo ================= */
  /**
   * Monta tudo o que o relatório e a tela mostram.
   * o = {tipo: 'mensal'|'anual', ano, mes (1–12, mensal), ap (apuração do período), apAno (mensal: apuração de 1º/jan até o fim do mês),
   *      lancamentos: [{mes:'MM', chave, valor, lista}], cfg (CONFIG.RELGDV), hoje: 'AAAA-MM-DD', municipio: nome canônico (opcional),
   *      vig: VigDocs.calcular({tipo: 'anual', ano, dados}) — o VIGIFITO por posto do ano (valores e-GDV + lançados no portal)}.
   */
  function calcular(o) {
    const cfg = o.cfg || cfgPadrao(), grupos = cfg.grupos || [], tipo = o.tipo === 'anual' ? 'anual' : 'mensal', ano = Number(o.ano), mesN = Number(o.mes) || 1;
    const ap = o.ap, apAno = tipo === 'mensal' ? (o.apAno || o.ap) : o.ap;
    const canon = n => (o.municipio && o.municipio(n)) || String(n || '').trim();
    const mm = pad2(mesN), meses = tipo === 'anual' ? [...Array(12).keys()].map(i => pad2(i + 1)) : [mm];
    const mesesAcum = [...Array(mesN).keys()].map(i => pad2(i + 1));          // mensal: de janeiro até o mês
    const hojeMes = String(o.hoje || '').slice(0, 7);
    const futuro = m => `${ano}-${m}` > hojeMes && !!hojeMes;
    // lançamentos: L[MM][chave] = valor; listas[chave][MM] = [linhas]
    const L = {}, listas = {};
    (o.lancamentos || []).forEach(l => {
      if (!l || !l.mes) return;
      if (TABS[l.chave]) { (listas[l.chave] = listas[l.chave] || {})[l.mes] = Array.isArray(l.lista) ? l.lista : []; return; }
      if (l.valor != null && l.valor !== '') (L[l.mes] = L[l.mes] || {})[l.chave] = Number(l.valor);
    });
    const lv = (m, chave) => (L[m] && L[m][chave] != null ? L[m][chave] : null);
    const somaPrefixo = (m, pref) => { const x = L[m] || {}; let s = null; Object.keys(x).forEach(k => { if (k.indexOf(pref) === 0) s = (s || 0) + x[k]; }); return s; };
    const somaTab = (m, tab) => { const l = (listas[tab] || {})[m]; return l && l.length ? l.reduce((s, r) => s + (Number(r.documentos) || 0), 0) : null; };
    const pm = m => (apAno && apAno.quadro && apAno.quadro.porMes[`${ano}-${m}`]) || null;

    /* ---- quadro PCE ---- */
    const colunasLev = [];
    grupos.forEach(g => (g.colunas || []).forEach((c, ci) => colunasLev.push({ chave: `lev:${g.id}:${ci}`, porCol: `${grupos.indexOf(g)}:${ci}`,
      rotulo: `Levantamento fitossanitário – ${c.rotulo} (${g.nome})`, fonte: 'auto' })));
    colunasLev.push({ chave: 'lev:outras', rotulo: 'Levantamento fitossanitário – outras pragas', fonte: 'auto', outras: true });
    const linhasPce = PCE_ANTES.concat(colunasLev, PCE_DEPOIS).map(d => ({ ...d, unid: d.unid || 'nº' }));
    const valorPce = (d, m) => {
      if (futuro(m)) return null;
      if (d.fonte === 'manual') return lv(m, d.chave);
      if (d.fonte === 'deriv') return d.tab ? somaTab(m, d.tab) : somaPrefixo(m, d.de);
      const x = pm(m); if (!x) return 0;
      if (d.porCol) return x.porCol[d.porCol] || 0;
      if (d.outras) return x.outras || 0;
      return x[d.chave] || 0;
    };
    const totalAuto = (d, Q) => { if (!Q) return 0; if (d.porCol) return Q.porCol[d.porCol] || 0; if (d.outras) return Q.outras || 0; return Q[d.chave] || 0; };
    const somaMeses = (d, ms, f) => { let s = null; ms.forEach(m => { const v = f(d, m); if (v != null) s = (s || 0) + v; }); return s; };
    const quadroPce = linhasPce.map(d => {
      const valores = {}; meses.forEach(m => { valores[m] = valorPce(d, m); });
      const r = { ...d, valores };
      if (tipo === 'mensal') {
        r.mes = valores[mm];
        r.acum = d.fonte === 'auto' ? totalAuto(d, apAno && apAno.quadro.total) : somaMeses(d, mesesAcum, valorPce);
        if (d.fonte === 'auto' && ap && ap.quadro) r.mes = totalAuto(d, ap.quadro.total);
      } else r.total = d.fonte === 'auto' ? totalAuto(d, ap && ap.quadro.total) : somaMeses(d, meses, valorPce);
      return r;
    });

    /* ---- VIGIFITO ---- */
    const vigMes = (b, m) => (apAno && apAno.vigifito && apAno.vigifito[b] && apAno.vigifito[b][`${ano}-${m}`]) || null;
    const valorVig = (b, d, m) => {
      if (futuro(m)) return null;
      if (o.vig) return o.vig.tot(b === 'fixa' ? o.vig.fixas : o.vig.volantes, d.chave, [`${ano}-${m}`]).v;
      if (d.fonte === 'manual') return null;
      const x = vigMes(b, m); return x ? (x[d.chave] || 0) : 0;
    };
    const soma2 = (a, b) => (a == null && b == null ? null : (a || 0) + (b || 0));
    const vig = {};
    BLOCOS_VIG.forEach(([b]) => {
      vig[b] = VIG.map(d => { const valores = {}; meses.forEach(m => { valores[m] = valorVig(b, d, m); });
        const r = { ...d, unid: d.unid || 'nº', valores, chaveLanc: `vig.${b}.${d.chave}` };
        r.total = somaMeses(d, meses, (dd, m) => valorVig(b, dd, m));
        if (tipo === 'mensal') { r.mes = valores[mm]; r.acum = somaMeses(d, mesesAcum, (dd, m) => valorVig(b, dd, m)); }
        return r; });
    });
    // total = fixas + volantes (por construção)
    vig.total = VIG.map((d, i) => { const f = vig.fixa[i], v = vig.volante[i], valores = {};
      meses.forEach(m => { valores[m] = soma2(f.valores[m], v.valores[m]); });
      return { ...d, unid: d.unid || 'nº', valores, total: soma2(f.total, v.total), mes: soma2(f.mes, v.mes), acum: soma2(f.acum, v.acum) }; });
    // outras unidades de liberação/apreensão (sem conversão para toneladas)
    const outrasUn = {};
    ['fixa', 'volante'].forEach(b => (tipo === 'mensal' ? [mm] : meses).forEach(m => { const x = vigMes(b, m); if (!x) return;
      Object.keys(x.outrasUnidades || {}).forEach(p => Object.keys(x.outrasUnidades[p]).forEach(u => { const k = `${p === 'apreensao' ? 'Apreensão' : p === 'carga' ? 'Cargas interestaduais (TF)' : 'Liberação'}|${u}`; outrasUn[k] = (outrasUn[k] || 0) + x.outrasUnidades[p][u]; })); }));

    /* ---- Seção I: tabelas por grupo e município ---- */
    const mesesGrupo = tipo === 'mensal' ? [mm] : meses;
    const gruposR = grupos.map((g, gi) => {
      const a = (ap && ap.grupos || []).find(x => x.id === g.id) || { municipios: [], anexo: [], levantamentos: 0, propriedades: 0, viveiros: 0 };
      const extras = g.extras || [], manuais = g.manuais || [], nc = (g.colunas || []).length;
      const linhas = new Map();
      a.municipios.forEach(x => { const nome = canon(x.municipio); linhas.set(norm(nome), { municipio: nome, propriedades: x.propriedades, levantamentos: x.levantamentos,
        det: x.det.slice(), susp: x.susp.slice(), suspeitas: x.suspeitas, amostras: x.amostras, manual: {}, auto: true }); });
      // colunas manuais por município (ex.: poda drástica): soma dos meses do relatório; município só com lançamento também entra
      manuais.forEach(mn => mesesGrupo.forEach(m => Object.keys(L[m] || {}).forEach(k => {
        const pref = `mun.${g.id}.${mn.chave}|`; if (k.indexOf(pref) !== 0) return;
        const nome = canon(k.slice(pref.length)), kk = norm(nome);
        if (!linhas.has(kk)) linhas.set(kk, { municipio: nome, propriedades: 0, levantamentos: 0, det: Array(nc).fill(0), susp: Array(nc).fill(0), suspeitas: 0, amostras: 0, manual: {}, auto: false });
        const r = linhas.get(kk); r.manual[mn.chave] = (r.manual[mn.chave] || 0) + L[m][k];
      })));
      const rows = [...linhas.values()].sort((x, y) => x.municipio.localeCompare(y.municipio, 'pt-BR'));
      const tot = { municipio: 'TOTAL', propriedades: 0, levantamentos: 0, det: Array(nc).fill(0), susp: Array(nc).fill(0), suspeitas: 0, amostras: 0, manual: {} };
      rows.forEach(r => { tot.propriedades += r.propriedades; tot.levantamentos += r.levantamentos; tot.suspeitas += r.suspeitas; tot.amostras += r.amostras;
        r.det.forEach((v, i) => { tot.det[i] += v; }); r.susp.forEach((v, i) => { tot.susp[i] += v; });
        manuais.forEach(mn => { if (r.manual[mn.chave] != null) tot.manual[mn.chave] = (tot.manual[mn.chave] || 0) + r.manual[mn.chave]; }); });
      const niveis = {}; rows.forEach(r => { if (r.propriedades) niveis[norm(r.municipio)] = r.det.some(Boolean) || r.susp.some(Boolean) ? 2 : 1; });
      return { g, gi, extras, manuais, linhas: rows, total: tot, anexo: a.anexo || [], levantamentos: a.levantamentos, propriedades: a.propriedades, viveiros: a.viveiros, niveis };
    });

    /* ---- laboratório ---- */
    const labAp = (ap && ap.laboratorio) || { porPraga: [], positivos: [], semResultado: 0, semResultado30: 0 };
    const labTot = { praga: 'TOTAL', termos: 0, amostras: 0, enviadas: 0, aguardando: 0, negativo: 0, positivo: 0, inconclusivo: 0, inviavel: 0 };
    labAp.porPraga.forEach(x => Object.keys(labTot).forEach(k => { if (k !== 'praga') labTot[k] += x[k] || 0; }));

    /* ---- tabelas manuais (CFO/CFOC, PTV, educação) ---- */
    const tabs = {};
    Object.keys(TABS).forEach(t => { tabs[t] = []; (tipo === 'mensal' ? [mm] : meses).forEach(m => ((listas[t] || {})[m] || []).forEach(r => tabs[t].push({ ...r, mes: m }))); });

    /* ---- HLB ---- */
    const gc = gruposR.find(x => x.g.id === 'citros');
    const colIdx = re => gc ? (gc.g.colunas || []).findIndex(c => re.test(norm(c.rotulo))) : -1;
    const iH = colIdx(/hlb|greening/), iD = colIdx(/diaphorina/);
    const hlb = { levantamentos: gc ? gc.levantamentos : 0, propriedades: gc ? gc.propriedades : 0, viveiros: gc ? gc.viveiros : 0,
      hlb: gc && iH >= 0 ? gc.total.det[iH] + gc.total.susp[iH] : 0, diaphorina: gc && iD >= 0 ? gc.total.det[iD] + gc.total.susp[iD] : 0,
      armadilhas: somaMeses({}, tipo === 'mensal' ? [mm] : meses, (d, m) => lv(m, 'hlb.armadilhas')) };

    /* ---- marcadores e resumo ---- */
    const Q = ap && ap.quadro ? ap.quadro.total : {};
    const totV = k => { const r = vig.total.find(x => x.chave === k); return r ? (tipo === 'mensal' ? r.mes : r.total) || 0 : 0; };
    const periodo = tipo === 'mensal' ? `${MESES[mesN - 1]}/${ano}` : String(ano);
    const resumo = (ap && ap.resumo) || { municipiosLevantados: 0, levantamentos: 0, deteccoes: 0, porTipoLocal: {}, porOrigem: {} };
    const marcadores = { periodo, ano: String(ano), mes: tipo === 'mensal' ? MESES[mesN - 1] : '', municipiosLevantados: fmt.int(resumo.municipiosLevantados),
      propriedadesVisitadas: fmt.int(Q.propVisitadas || 0), levantamentos: fmt.int(resumo.levantamentos), deteccoes: fmt.int(resumo.deteccoes),
      termosColheita: fmt.int(Q.colheitas || 0), amostras: fmt.int(Q.amostras || 0), termosFiscalizacao: fmt.int(Q.termosFisc || 0),
      veiculos: fmt.int(totV('veiculos')), pessoas: fmt.int(totV('educacao')), tfs: fmt.int(totV('tfs')) };

    /* ---- avisos de consistência ---- */
    const avisos = [];
    const mesesVer = (tipo === 'mensal' ? [mm] : meses).filter(m => !futuro(m));
    const manuaisVazias = quadroPce.filter(r => r.fonte === 'manual' && mesesVer.every(m => r.valores[m] == null)).map(r => r.rotulo)
      .concat(vig.fixa.filter(r => r.fonte === 'manual' && mesesVer.every(m => r.valores[m] == null) && vig.volante.find(x => x.chave === r.chave && mesesVer.every(m => x.valores[m] == null))).map(r => 'VIGIFITO: ' + r.rotulo + (r.unid !== 'nº' ? ` (${r.unid})` : '')));
    if (o.vig) o.vig.avisos.filter(a => a.nivel !== 'info').forEach(a => avisos.push({ ...a, titulo: 'VIGIFITO: ' + a.titulo }));
    if (manuaisVazias.length) avisos.push({ nivel: 'atencao', titulo: `${manuaisVazias.length} linha(s) manual(is) sem lançamento em ${periodo}`,
      detalhe: manuaisVazias.slice(0, 14).join('; ') + (manuaisVazias.length > 14 ? '…' : '') + '. Sem lançamento, a linha sai com "—" no relatório. Os números manuais são lançados no Portal do Administrativo.' });
    if (labAp.positivos.length) avisos.push({ nivel: 'critico', titulo: `${labAp.positivos.length} amostra(s) positiva(s) no período`, detalhe: labAp.positivos.slice(0, 8).map(x => `${x.praga} em ${x.municipio} (${fmt.data(x.data)})`).join('; ') + '.' });
    if (labAp.semResultado30) avisos.push({ nivel: 'atencao', titulo: `${labAp.semResultado30} termo(s) de colheita sem resultado há mais de 30 dias`, detalhe: 'Registre o resultado na aba PCE (termos de colheita) ou no app; sem resultado, a amostra conta como "aguardando".' });
    const semTipo = (resumo.porTipoLocal || {})['Não informado'] || 0, semOrig = (resumo.porOrigem || {})['Não informada'] || 0;
    if (semTipo || semOrig) avisos.push({ nivel: 'info', titulo: `${semTipo} levantamento(s) sem tipo de local e ${semOrig} sem origem da visita`, detalhe: 'Campos opcionais (registros antigos ficam vazios): não afetam os totais; viveiros e UP/UC só são contados quando o tipo de local é informado.' });
    if (Object.keys(outrasUn).length) avisos.push({ nivel: 'info', titulo: 'Liberações/apreensões em unidades que não são de massa', detalhe: Object.keys(outrasUn).map(k => `${k.split('|')[0]}: ${fmt.num(outrasUn[k], 2)} ${k.split('|')[1]}`).join('; ') + '. Listadas à parte, sem conversão para toneladas.' });

    return { tipo, ano, mes: mesN, mm, meses, mesesAcum, periodo, de: ap ? ap.de : '', ate: ap ? ap.ate : '', cfg, quadroPce, vig, vigR: o.vig || null, outrasUn, grupos: gruposR,
      lab: { porPraga: labAp.porPraga, total: labTot, positivos: labAp.positivos, semResultado30: labAp.semResultado30 }, tabs, hlb, marcadores, resumo, avisos, futuro };
  }

  /* ================= textos iniciais ================= */
  /**
   * Textos do relatório: os salvos para este relatório; senão os do relatório anterior salvo do mesmo tipo (mensal: o mês anterior mais
   * próximo; anual: o ano anterior); senão os textos-padrão. salvos = [{tipo, ano, mes, textos}].
   */
  function textosIniciais(salvos, tipo, ano, mes, cfg) {
    const id = r => `${r.ano}|${r.mes || ''}`, alvo = `${ano}|${tipo === 'mensal' ? pad2(mes) : ''}`;
    const lst = (salvos || []).filter(r => r.tipo === tipo).sort((a, b) => id(a).localeCompare(id(b)));
    const deste = lst.find(r => id(r) === alvo), anterior = lst.filter(r => id(r) < alvo).pop();
    const base = { ...TEXTOS_PADRAO, assinaturas: (cfg || cfgPadrao()).assinaturas || [], local: (cfg || cfgPadrao()).local || 'Manaus/AM', anexo: tipo === 'anual' ? 1 : 0 };
    const usado = deste || anterior;
    const textos = { ...base, ...(usado ? usado.textos : {}) };
    if (!deste && anterior) textos.anexo = base.anexo;
    if (!Array.isArray(textos.assinaturas) || !textos.assinaturas.length) textos.assinaturas = base.assinaturas;
    return { textos, salvo: !!deste, origem: deste ? 'salvo' : anterior ? 'anterior' : 'padrao', anterior: anterior ? (anterior.mes ? `${MESES[+anterior.mes - 1]}/${anterior.ano}` : String(anterior.ano)) : '' };
  }
  const textoGrupo = (t, g) => (t['grupo_' + g.id] != null ? t['grupo_' + g.id] : TEXTOS_PADRAO['grupo_' + g.id] || TEXTOS_PADRAO.grupo_padrao);

  /* ================= mapa (PNG desenhado num canvas, sem tiles) ================= */
  const COR_MAPA = { fundo: '#ffffff', terra: '#f2f1ed', linha: '#8d8c86', nivel1: '#5598e7', nivel2: '#104281', ink: '#0b0b0b', ink2: '#52514e' };
  /**
   * Coroplético simples dos 62 municípios: nível 1 = com levantamento no período; nível 2 = com detecção ou suspeita. geo = GeoJSON
   * (painel/dados/am-municipios.json); niveis = {nome normalizado: 1|2}. Devolve {src: dataURL, png: Uint8Array, w, h}.
   */
  function mapa(geo, niveis, o) {
    o = o || {};
    const W = 1000, H = 760, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    x.fillStyle = COR_MAPA.fundo; x.fillRect(0, 0, W, H);
    const feats = (geo && geo.features) || [];
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    const poli = f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
    feats.forEach(f => poli(f).forEach(p => p[0].forEach(([a, b]) => { x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); })));
    const mx = 30, topo = 20, legH = 130, k = Math.min((W - 2 * mx) / (x1 - x0 || 1), (H - topo - legH) / (y1 - y0 || 1));
    const ox = (W - (x1 - x0) * k) / 2, P = ([a, b]) => [ox + (a - x0) * k, topo + (y1 - b) * k];
    let n1 = 0, n2 = 0;
    feats.forEach(f => {
      const nv = niveis[norm(f.properties.name)] || 0; if (nv === 1) n1++; if (nv === 2) n2++;
      x.beginPath();
      poli(f).forEach(p => p.forEach(anel => anel.forEach((pt, i) => { const [px, py] = P(pt); if (i) x.lineTo(px, py); else x.moveTo(px, py); })));
      x.fillStyle = nv === 2 ? COR_MAPA.nivel2 : nv === 1 ? COR_MAPA.nivel1 : COR_MAPA.terra; x.fill('evenodd');
      x.lineWidth = 1.2; x.strokeStyle = COR_MAPA.linha; x.stroke();
    });
    // legenda (texto em tinta neutra; a cor fica só no quadradinho) e fonte
    const ly = H - legH + 20, item = (i, cor, txt) => { const y = ly + i * 32; x.fillStyle = cor; x.fillRect(mx, y, 28, 24); x.strokeStyle = COR_MAPA.linha; x.lineWidth = 1; x.strokeRect(mx, y, 28, 24);
      x.fillStyle = COR_MAPA.ink; x.font = '21px Arial, Helvetica, sans-serif'; x.textBaseline = 'middle'; x.fillText(txt, mx + 40, y + 13); };
    item(0, COR_MAPA.nivel1, `Município com levantamento, sem detecção (${n1})`);
    item(1, COR_MAPA.nivel2, `Município com detecção ou suspeita (${n2})`);
    item(2, COR_MAPA.terra, 'Sem levantamento no período');
    x.fillStyle = COR_MAPA.ink2; x.font = '17px Arial, Helvetica, sans-serif'; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
    x.fillText(o.fonte || 'Fonte: e-GDV/ADAF · malha municipal do IBGE (simplificada)', W - mx, H - 14);
    const src = cv.toDataURL('image/png'), b = atob(src.split(',')[1]), png = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) png[i] = b.charCodeAt(i);
    return { src, png, w: W, h: H, n1, n2 };
  }

  /* ================= blocos do relatório ================= */
  const paras = (txt, M) => String(aplicarMarcadores(txt, M) || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).map(t => ({ t: 'p', texto: t }));
  const marcaFonte = r => (r.fonte === 'auto' ? '' : ' †');
  /**
   * R = calcular(...); t = textos; o = {dataEmissao, mapas: {grupoId: {src, png}}, anexo: bool, pce: true = só as partes de PCE (relatório
   * PCE: Seção I com tabelas e mapas, amostras e laudos, quadro PCE, HLB e anexo), vigBlocos: blocos do VIGIFITO por posto (VigDocs.blocos
   * com secao) para a Seção II do consolidado}. Devolve a lista de blocos.
   */
  function blocos(R, t, o) {
    o = o || {};
    const M = R.marcadores, B = [], anual = R.tipo === 'anual', soPce = !!o.pce;
    const titulo = soPce ? (anual ? `RELATÓRIO PCE ${R.ano} — CONSOLIDADO` : `RELATÓRIO PCE PARCIAL — ${MESES[R.mes - 1].toUpperCase()}/${R.ano}`)
      : anual ? `RELATÓRIO TÉCNICO ${R.ano} — CONSOLIDADO` : `RELATÓRIO TÉCNICO PARCIAL — ${MESES[R.mes - 1].toUpperCase()}/${R.ano}`;
    B.push({ t: 'titulo', texto: titulo }, { t: 'titulo2', texto: soPce ? 'Programa de Prevenção, Controle e Erradicação de Pragas – PCE · Gerência de Defesa Vegetal – GDV/ADAF' : 'Gerência de Defesa Vegetal – GDV/ADAF' },
      { t: 'p', rotulo: 'Período', texto: `${fmt.data(R.de)} a ${fmt.data(R.ate)}` });
    B.push({ t: 'h', texto: 'INTRODUÇÃO' }, ...paras(t.introducao, M));
    // Seção I
    B.push({ t: 'h', texto: 'SEÇÃO I – LEVANTAMENTO FITOSSANITÁRIO DE DETECÇÃO E DE DELIMITAÇÃO DAS PRAGAS QUARENTENÁRIAS' }, ...paras(t.secao1, M));
    B.push({ t: 'h2', texto: '1.1. Metodologia aplicada' }, ...paras(t.metodologia, M));
    B.push({ t: 'h2', texto: '1.2. Resultados' }, ...paras(t.resultados, M));
    let fig = 0;
    R.grupos.forEach((G, i) => {
      const g = G.g, nc = (g.colunas || []).length;
      B.push({ t: 'h2', texto: `1.2.${i + 1}. ${g.nome}` }, ...paras(textoGrupo(t, g), M));
      const temSuspCol = !G.extras.includes('suspeitas');
      const cols = [{ rotulo: 'Município', largura: 26 }, { rotulo: 'Propriedades inspecionadas', largura: 12 }]
        .concat((g.colunas || []).map(c => ({ rotulo: c.rotulo, largura: 12 })))
        .concat(G.extras.map(e => ({ rotulo: e === 'suspeitas' ? 'Suspeitas' : 'Amostras coletadas', largura: 11 })))
        .concat(G.manuais.map(mn => ({ rotulo: mn.rotulo + ' †', largura: 12 })));
      const linha = (r, neg) => [{ texto: r.municipio, negrito: neg }, { texto: tracoSeZero(r.propriedades), alinhar: 'c', negrito: neg }]
        .concat(r.det.map((v, j) => ({ texto: tracoSeZero(v) + (temSuspCol && r.susp[j] ? ` (+${fmt.int(r.susp[j])} susp.)` : ''), alinhar: 'c', negrito: neg })))
        .concat(G.extras.map(e => ({ texto: tracoSeZero(e === 'suspeitas' ? r.suspeitas : r.amostras), alinhar: 'c', negrito: neg })))
        .concat(G.manuais.map(mn => ({ texto: r.manual[mn.chave] != null ? fmt.int(r.manual[mn.chave]) : '–', alinhar: 'c', negrito: neg })));
      void nc;
      B.push({ t: 'tabela', titulo: `Tabela – ${g.nome} por município (${R.periodo})`, pequena: true, colunas: cols,
        linhas: G.linhas.length ? G.linhas.map(r => linha(r, false)).concat([linha(G.total, true)]) : [[{ texto: 'Nenhum levantamento deste grupo no período.' }].concat(cols.slice(1).map(() => '–'))] });
      B.push({ t: 'p', pequeno: true, texto: 'Colunas das pragas: nº de propriedades com a praga detectada (suspeitas indicadas à parte). "–" = nenhuma. † lançado manualmente no painel.' });
      if (o.mapas && o.mapas[g.id]) { fig++; B.push({ t: 'imagem', src: o.mapas[g.id].src, png: o.mapas[g.id].png, larguraCm: 14,
        legenda: `Figura ${fig} – ${g.nome}: municípios com levantamento em ${R.periodo}` }); }
    });
    B.push({ t: 'h2', texto: '1.3. Amostras e resultados de laboratório' }, ...paras(t.laboratorio, M));
    const lc = ['termos', 'amostras', 'enviadas', 'aguardando', 'negativo', 'positivo', 'inconclusivo', 'inviavel'];
    const lr = (x, neg) => [{ texto: x.praga, negrito: neg }].concat(lc.map(k => ({ texto: fmt.int(x[k] || 0), alinhar: 'c', negrito: neg })));
    B.push({ t: 'tabela', titulo: `Termos de colheita e resultados laboratoriais por praga (${R.periodo})`, pequena: true,
      colunas: [{ rotulo: 'Praga', largura: 24 }, { rotulo: 'Termos', largura: 9 }, { rotulo: 'Amostras', largura: 9 }, { rotulo: 'Enviadas', largura: 9 }, { rotulo: 'Aguardando', largura: 10 },
        { rotulo: 'Negativo', largura: 9 }, { rotulo: 'Positivo', largura: 9 }, { rotulo: 'Inconclusivo', largura: 11 }, { rotulo: 'Inviável', largura: 9 }],
      linhas: R.lab.porPraga.length ? R.lab.porPraga.map(x => lr(x, false)).concat([lr(R.lab.total, true)]) : [[{ texto: 'Nenhum termo de colheita no período.' }, '–', '–', '–', '–', '–', '–', '–', '–']] });
    // Seção II
    B.push({ t: 'h', texto: soPce ? 'SEÇÃO II – QUADRO DE AÇÕES DO PCE' : 'SEÇÃO II – AÇÕES DE DEFESA SANITÁRIA VEGETAL' }, ...paras(t.secao2, M));
    if (anual) B.push({ t: 'orientacao', paisagem: true });
    const ML = R.meses.map(m => MESES_CURTOS[+m - 1]);
    const quadro = (tit, linhas) => anual
      ? { t: 'tabela', titulo: tit, mini: true, colunas: [{ rotulo: 'Ação', largura: 30 }, { rotulo: 'Unid.', largura: 5 }].concat(ML.map(m => ({ rotulo: m, largura: 4.6 }))).concat([{ rotulo: 'TOTAL', largura: 6.5 }]),
          linhas: linhas.map(r => [{ texto: r.rotulo + marcaFonte(r) }, { texto: r.unid, alinhar: 'c' }].concat(R.meses.map(m => ({ texto: R.futuro(m) ? '' : valorTxt(r.valores[m], r.unid), alinhar: 'd' })))
            .concat([{ texto: valorTxt(r.total, r.unid), alinhar: 'd', negrito: true }])) }
      : { t: 'tabela', titulo: tit, pequena: true, colunas: [{ rotulo: 'Ação', largura: 52 }, { rotulo: 'Unid.', largura: 10 }, { rotulo: 'Fonte', largura: 10 },
          { rotulo: `${MESES_CURTOS[R.mes - 1]}/${R.ano}`, largura: 13 }, { rotulo: 'Acumulado no ano', largura: 15 }],
          linhas: linhas.map(r => [{ texto: r.rotulo }, { texto: r.unid, alinhar: 'c' }, { texto: r.fonte === 'auto' ? 'e-GDV' : 'lançado', alinhar: 'c' },
            { texto: valorTxt(r.mes, r.unid), alinhar: 'd' }, { texto: valorTxt(r.acum, r.unid), alinhar: 'd', negrito: true }]) };
    B.push(quadro(`Programa de Prevenção, Controle e Erradicação de Pragas – PCE ${anual ? R.ano : R.periodo}`, R.quadroPce));
    B.push({ t: 'p', pequeno: true, texto: (anual ? '† lançado manualmente no painel; demais linhas apuradas pelo e-GDV. ' : '') +
      'Propriedades visitadas: distintas no mês; no total (ou acumulado), distintas no período inteiro — por isso o total não é a soma dos meses. Novas = cadastradas no mês (data de cadastro da propriedade ou do primeiro levantamento); antigas = visitadas − novas. Área monitorada: soma das áreas das culturas avaliadas; no total, a soma por propriedade distinta no período (a área de uma propriedade visitada em vários meses conta uma vez, como estoque, e não se somam os meses).' });
    if (!soPce) B.push(...paras(t.vigifito, M));
    if (soPce) { /* relatório PCE: sem VIGIFITO (relatório próprio) */ }
    else if (anual && o.vigBlocos) B.push(...o.vigBlocos);
    else if (anual) {
      [['total', 'VIGIFITO – TOTAL CONSOLIDADO (BVA fixas + volantes)'], ['fixa', 'VIGIFITO – BVA FIXAS'], ['volante', 'VIGIFITO – BVA VOLANTES']]
        .forEach(([b, tit]) => B.push(quadro(`${tit} – ${R.ano}`, R.vig[b].map(r => (b === 'total' ? { ...r, fonte: r.fonte } : r)))));
    } else {
      B.push({ t: 'tabela', titulo: `Programa de Vigilância Fitossanitária – VIGIFITO – ${R.periodo}`, pequena: true,
        colunas: [{ rotulo: 'Ação', largura: 42 }, { rotulo: 'Unid.', largura: 8 }, { rotulo: 'Fonte', largura: 9 }, { rotulo: 'BVA fixas', largura: 10 }, { rotulo: 'BVA volantes', largura: 10 },
          { rotulo: 'Total no mês', largura: 10 }, { rotulo: 'Total acumulado no ano', largura: 11 }],
        linhas: R.vig.total.map((r, i) => [{ texto: r.rotulo }, { texto: r.unid, alinhar: 'c' }, { texto: r.fonte === 'auto' ? 'e-GDV' : 'lançado', alinhar: 'c' },
          { texto: valorTxt(R.vig.fixa[i].mes, r.unid), alinhar: 'd' }, { texto: valorTxt(R.vig.volante[i].mes, r.unid), alinhar: 'd' },
          { texto: valorTxt(r.mes, r.unid), alinhar: 'd', negrito: true }, { texto: valorTxt(r.acum, r.unid), alinhar: 'd' }]) });
    }
    if (!anual && !soPce && o.vigBlocos) B.push(...o.vigBlocos);
    const outras = Object.keys(R.outrasUn);
    if (!soPce) B.push({ t: 'p', pequeno: true, texto: 'VIGIFITO = soma dos postos do relatório VIGIFITO (mesmos números). Total = BVA fixas + BVA volantes (postos "Móvel" do e-GDV). Medida de educação sanitária: veículos com orientação (campo do registro do veículo). ' +
      'Toneladas: soma dos produtos dos TFs informados em kg (÷ 1.000) ou toneladas; ' + (outras.length ? 'outras unidades, sem conversão: ' + outras.map(k => `${k.split('|')[0]} ${fmt.num(R.outrasUn[k], 2)} ${k.split('|')[1]}`).join('; ') + '.' : 'não houve produtos em outras unidades.') +
      ' TF sem turno (módulo TF isolado) conta como BVA fixa. Os valores manuais do VIGIFITO são lançados por posto no Portal do Administrativo.' });
    if (anual) B.push({ t: 'orientacao', paisagem: false });
    if (soPce) {
      B.push({ t: 'h', texto: 'SEÇÃO III – RESULTADOS DAS AÇÕES ESTABELECIDAS PELO PLANO DE CONTINGÊNCIA – HLB' }, ...paras(t.hlb, M));
      const H = R.hlb;
      B.push({ t: 'tabela', titulo: `Plano de contingência do HLB – ${R.periodo}`, pequena: true, colunas: [{ rotulo: 'Indicador', largura: 60 }, { rotulo: 'Valor', largura: 20 }, { rotulo: 'Fonte', largura: 20 }],
        linhas: [['Levantamentos de pragas dos citros', H.levantamentos, 'e-GDV'], ['Propriedades/localidades com citros inspecionadas', H.propriedades, 'e-GDV'],
          ['Viveiros inspecionados (tipo de local "Viveiro")', H.viveiros, 'e-GDV'], ['Propriedades com HLB detectado ou suspeito', H.hlb, 'e-GDV'],
          ['Propriedades com Diaphorina citri detectada ou suspeita', H.diaphorina, 'e-GDV'], ['Armadilhas para Diaphorina citri (monitoramento)', H.armadilhas, 'lançado']]
          .map(([a, v, f]) => [{ texto: a }, { texto: v == null ? '—' : fmt.int(v), alinhar: 'd' }, { texto: f, alinhar: 'c' }]) });
      fecho(B, R, t, o, M);
      return B;
    }
    // Seções III e IV
    const tabManual = (chave, tit, vazio) => {
      const C = TABS[chave], lst = R.tabs[chave];
      const cols = (anual ? [{ rotulo: 'Mês', largura: 8 }] : []).concat(C.map(([k, r, n]) => ({ rotulo: r, largura: k === 'descricao' ? 34 : n ? 10 : 16 })));
      const tot = {}; C.forEach(([k, , n]) => { if (n) tot[k] = lst.reduce((s, x) => s + (Number(x[k]) || 0), 0); });
      return { t: 'tabela', titulo: tit, pequena: true, colunas: cols,
        linhas: lst.length ? lst.map(x => (anual ? [{ texto: MESES_CURTOS[+x.mes - 1], alinhar: 'c' }] : []).concat(C.map(([k, , n]) => ({ texto: n ? (x[k] == null ? '—' : fmt.num(x[k], 2)) : (x[k] || '—'), alinhar: n ? 'd' : null }))))
          .concat([(anual ? [{ texto: 'TOTAL', negrito: true }] : []).concat(C.map(([k, , n], j) => (n ? { texto: fmt.num(tot[k], 2), alinhar: 'd', negrito: true } : { texto: !anual && j === 0 ? 'TOTAL' : '', negrito: true })))])
          : [[{ texto: vazio }].concat(cols.slice(1).map(() => '–'))] };
    };
    B.push({ t: 'h', texto: 'SEÇÃO III – RELATÓRIO TÉCNICO DA EMISSÃO DE CFO/CFOC' }, ...paras(t.cfo, M), tabManual('tab.cfo', `Emissão de CFO/CFOC – ${R.periodo} (lançado)`, 'Nenhum CFO/CFOC lançado no período.'));
    B.push({ t: 'h', texto: 'SEÇÃO IV – RELATÓRIO TÉCNICO DA EMISSÃO DE PTV' }, ...paras(t.ptv, M), tabManual('tab.ptv', `Emissão de PTV – ${R.periodo} (lançado)`, 'Nenhuma PTV lançada no período.'));
    // Seção V
    B.push({ t: 'h', texto: 'SEÇÃO V – EDUCAÇÃO SANITÁRIA VOLTADA PARA OS PROGRAMAS NACIONAIS DE SANIDADE VEGETAL' }, ...paras(t.educacao, M));
    const ed = tabManual('tab.educacao', `Relatório de educação fitossanitária – ${R.periodo}`, 'Nenhuma ação educativa lançada no período.');
    const pessoas = (R.vig.total.find(r => r.chave === 'educacao') || {});
    const nPess = anual ? pessoas.total : pessoas.mes;
    const linhaAuto = (anual ? [{ texto: '—', alinhar: 'c' }] : []).concat([{ texto: 'Medida de educação sanitária (e-GDV)' }, { texto: 'Veículos abordados nas barreiras (BVA fixas e volantes) com orientação sobre as pragas quarentenárias' },
      { texto: R.periodo }, { texto: 'BVA fixas e volantes' }, { texto: 'Condutores, passageiros e transportadores' }, { texto: fmt.int(nPess || 0), alinhar: 'd' }]);
    if (R.tabs['tab.educacao'].length) ed.linhas.splice(ed.linhas.length - 1, 0, linhaAuto); else ed.linhas = [linhaAuto];
    B.push(ed);
    // Seção VI
    B.push({ t: 'h', texto: 'SEÇÃO VI – RESULTADOS DAS AÇÕES ESTABELECIDAS PELO PLANO DE CONTINGÊNCIA – HLB' }, ...paras(t.hlb, M));
    const H = R.hlb;
    B.push({ t: 'tabela', titulo: `Plano de contingência do HLB – ${R.periodo}`, pequena: true, colunas: [{ rotulo: 'Indicador', largura: 60 }, { rotulo: 'Valor', largura: 20 }, { rotulo: 'Fonte', largura: 20 }],
      linhas: [['Levantamentos de pragas dos citros', H.levantamentos, 'e-GDV'], ['Propriedades/localidades com citros inspecionadas', H.propriedades, 'e-GDV'],
        ['Viveiros inspecionados (tipo de local "Viveiro")', H.viveiros, 'e-GDV'], ['Propriedades com HLB detectado ou suspeito', H.hlb, 'e-GDV'],
        ['Propriedades com Diaphorina citri detectada ou suspeita', H.diaphorina, 'e-GDV'], ['Armadilhas para Diaphorina citri (monitoramento)', H.armadilhas, 'lançado']]
        .map(([a, v, f]) => [{ texto: a }, { texto: v == null ? '—' : fmt.int(v), alinhar: 'd' }, { texto: f, alinhar: 'c' }]) });
    fecho(B, R, t, o, M);
    return B;
  }
  /** Conclusão, local/data, assinaturas e o anexo por propriedade (comum ao consolidado e ao relatório PCE). */
  function fecho(B, R, t, o, M) {
    B.push({ t: 'h', texto: 'CONCLUSÃO' }, ...paras(t.conclusao, M));
    B.push({ t: 'p', alinhar: 'd', espaco: true, texto: `${t.local || 'Manaus/AM'}, ${fmt.extenso(o.dataEmissao || '')}.` });
    const ass = (t.assinaturas || []).filter(a => a && (a.nome || a.cargo));
    if (ass.length) B.push({ t: 'assinaturas', itens: ass.map(a => ({ nome: a.nome || ' ', cargo: a.cargo || '' })) });
    // Anexos (por grupo): propriedade, CPF/CNPJ mascarado, iniciais do produtor, coordenadas a 2 casas
    if (o.anexo) {
      const comAnexo = R.grupos.filter(G => G.anexo.length);
      B.push({ t: 'quebra' });
      if (comAnexo.length) B.push({ t: 'orientacao', paisagem: true });
      B.push({ t: 'h', texto: 'ANEXOS' }, { t: 'p', pequeno: true, texto: 'Lista por propriedade e visita (LGPD): produtor só com as iniciais, CPF/CNPJ mascarado e coordenadas arredondadas a 2 casas decimais (cerca de 1 km). Os dados completos ficam no e-GDV, com acesso restrito.' });
      if (!comAnexo.length) B.push({ t: 'p', texto: 'Nenhum levantamento no período.' });
      comAnexo.forEach((G, i) => {
        B.push({ t: 'h2', texto: `Anexo ${i + 1} – ${G.g.nome}: propriedades inspecionadas (${R.periodo})` });
        B.push({ t: 'tabela', mini: true, colunas: [{ rotulo: 'Município', largura: 11 }, { rotulo: 'Propriedade', largura: 14 }, { rotulo: 'Produtor', largura: 7 }, { rotulo: 'CPF/CNPJ', largura: 11 },
            { rotulo: 'Data', largura: 7 }, { rotulo: 'Tipo de local', largura: 10 }, { rotulo: 'Culturas', largura: 12 }, { rotulo: 'Pragas e resultado', largura: 20 }, { rotulo: 'Lat.', largura: 4.5 }, { rotulo: 'Lon.', largura: 5 }],
          linhas: G.anexo.map(x => [x.municipio, x.propriedade || '—', x.produtor || '—', x.doc || '—', fmt.data(x.data), x.tipoLocal || '—', x.culturas || '—', x.resultado || '—',
            x.lat == null ? '—' : fmt.num(x.lat, 2), x.lon == null ? '—' : fmt.num(x.lon, 2)].map((v, j) => ({ texto: v, alinhar: j >= 8 ? 'd' : null }))) });
      });
    }
  }

  /* ================= HTML (modelo relgdv-relatorio.html → PDF/impressão) ================= */
  /** Desenha os blocos: cada {t:'quebra'} começa uma nova folha (.a4) — a impressão e o gerador de PDF (pdf.js) quebram por folha. */
  function html(doc, B) {
    const pg1 = doc.querySelector('.a4'), rod = doc.querySelector('.rodape');
    const partes = [[]]; B.forEach(b => { if (b.t === 'quebra') partes.push([]); else if (b.t !== 'orientacao') partes[partes.length - 1].push(b); });
    doc.querySelectorAll('.a4.extra').forEach(e => e.remove());
    let ult = pg1;
    partes.forEach((p, i) => {
      let raiz;
      if (i === 0) raiz = doc.getElementById('corpo');
      else { const a = doc.createElement('div'); a.className = 'a4 doc-conv extra'; raiz = doc.createElement('div'); a.append(raiz); ult.after(a); ult = a; }
      CD.html(doc, raiz, p);
    });
    if (rod) ult.append(rod);
  }

  /** Linhas manuais do quadro PCE (lançadas no Portal do Administrativo, por mês). */
  const LINHAS_MANUAIS_PCE = PCE_ANTES.concat(PCE_DEPOIS).filter(d => d.fonte === 'manual').map(d => ({ ...d, unid: d.unid || 'nº' }));
  return { calcular, blocos, html, mapa, textosIniciais, aplicarMarcadores, fimDoMes, fmt, valorTxt, TEXTOS_PADRAO, ROTULOS_TXT, MARCADORES, TABS, LINHAS_MANUAIS_PCE, VIG, BLOCOS_VIG,
    MESES, MESES_CURTOS, norm, textoGrupo };
})();
if (typeof window !== 'undefined') window.RelGdvDocs = RelGdvDocs;
