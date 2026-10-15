// Motor de indicadores do e-GDV: cada número dos relatórios é definido UMA vez (id, rótulo, unidade, fonte e regra) e lido por todos
// os relatórios — PCE, VIGIFITO, Convênio, Metas SUASA e Consolidado — e pelas abas do painel, para que o mesmo número nunca divirja.
// A apuração automática das barreiras é do servidor (Code.gs → motorBarreira_, usado por vigApurar_, relGdvApurar_ e convApurar_);
// aqui ficam o catálogo, a ordem/rótulos exatos da planilha de controle VIGIFITO e a regra que junta o apurado (e-GDV) com os valores
// lançados pelo Administrativo no portal: linha manual = valor lançado; linha automática = valor do e-GDV, a não ser que haja um
// valor lançado que o SUBSTITUI (com justificativa) — e a origem de cada número fica marcada (e-GDV × lançado × substituído).
// Sem dependências; usado no navegador (painel, portal, modelos de documento) e nos testes (Node).
const Indicadores = (() => {
  'use strict';
  // VIGIFITO: as 28 linhas da planilha de controle, na ordem e com os rótulos/unidades exatos (rotuloPlanilha null = 2ª linha do mesmo
  // indicador, em t). fonte: 'auto' = apurado pelo e-GDV (turnos/veículos/TFs do posto; aceita substituição); 'manual' = lançado no portal.
  const VIGIFITO = [
    { k: 'veiculos', rotulo: 'Veículos parados pela fiscalização', unid: 'nº', fonte: 'auto', regra: 'Veículos registrados (não excluídos) nos turnos do posto.' },
    { k: 'documentos', rotulo: 'Exame e análise de documento de sanidade e fiscal', unid: 'nº', fonte: 'auto', regra: 'Veículos com "documento conferido" + TFs com documentos (o mesmo veículo conta uma vez).' },
    { k: 'partidas', rotulo: 'Fiscalização de partidas', unid: 'nº', fonte: 'auto', regra: 'Veículos com carga e "partida fiscalizada" marcada.' },
    { k: 'inspecaoFito', rotulo: 'Inspeção fitossanitária', unid: 'nº', fonte: 'auto', regra: 'Veículos com carga e "inspeção fitossanitária realizada".' },
    { k: 'cargasEstados', rotulo: 'Cargas em trânsito para outros estados', unid: 'nº', fonte: 'auto', regra: 'Veículos com carga e UF de destino diferente do AM.' },
    { k: 'internN', rotulo: 'Internalização de partidas', unid: 'nº', fonte: 'auto', regra: 'Veículos com carga de outra UF com destino ao AM.' },
    { k: 'internT', rotulo: 'Internalização de partidas', rotuloPlanilha: null, unid: 't', fonte: 'auto', regra: 'Produtos dessas cargas em kg (÷ 1.000) ou t; outras unidades à parte.' },
    { k: 'coleta', rotulo: 'Termo de colheita de amostra', unid: 'nº', fonte: 'auto', regra: 'TFs com coleta de amostra.' },
    { k: 'amostras', rotulo: 'Envio de amostra para Unidade Central ou Laboratório', unid: 'nº', fonte: 'auto', regra: 'Amostras informadas nos TFs com coleta.' },
    { k: 'educacao', rotulo: 'Medida de Educação Sanitária', unid: 'nº', fonte: 'auto', regra: 'Veículos com "orientação de educação sanitária" (padrão sim; registros antigos contam como orientados).' },
    { k: 'medidaFito', rotulo: 'Medida Fitossanitária', unid: 'nº', fonte: 'auto', regra: 'Veículos com "medida fitossanitária aplicada".' },
    { k: 'abordagem', rotulo: 'Abordagem itinerante (volante)', unid: 'nº', fonte: 'auto', regra: 'Turnos de barreira volante (posto "Móvel") do posto.' },
    { k: 'capacitacao', rotulo: 'Capacitação técnica', unid: 'nº', fonte: 'manual' },
    { k: 'exportT', rotulo: 'Exportação de vegetais para outros Estados', unid: 't', fonte: 'auto', regra: 'Produtos das cargas com destino a outra UF, em kg (÷ 1.000) ou t.' },
    { k: 'madeira', rotulo: 'Exportação de madeira para outros Estados', unid: 'm3', fonte: 'manual' },
    { k: 'importT', rotulo: 'Importação de vegetais de outros Estados', unid: 't', fonte: 'auto', regra: 'Produtos das cargas de outra UF com destino ao AM, em kg (÷ 1.000) ou t.' },
    { k: 'tfs', rotulo: 'Termo de fiscalização - resultou em:', unid: 'nº', fonte: 'auto', regra: 'TFs lavrados (não cancelados), pela data do turno.' },
    { k: 'inspecao', rotulo: '16.1 Inspeção', unid: 'nº', fonte: 'auto', regra: 'TFs com inspeção.' },
    { k: 'advertencia', rotulo: '16.2 Advertência', unid: 'nº', fonte: 'auto', regra: 'TFs com advertência.' },
    { k: 'rechaco', rotulo: '16.3 Rechaço', unid: 'nº', fonte: 'auto', regra: 'TFs com procedimento rechaço.' },
    { k: 'fiel', rotulo: '16.4 Fiel depositário', unid: 'nº', fonte: 'auto', regra: 'TFs com fiel depositário.' },
    { k: 'liberacao', rotulo: '16.5 Liberação', unid: 'nº', fonte: 'auto', regra: 'TFs com procedimento liberação.' },
    { k: 'liberacaoT', rotulo: '16.5 Liberação', rotuloPlanilha: null, unid: 't', fonte: 'auto', regra: 'Produtos dos TFs de liberação em kg (÷ 1.000) ou t; outras unidades à parte, sem conversão.', nota: 'toneladas' },
    { k: 'infracao', rotulo: '16.6 Infração', unid: 'nº', fonte: 'auto', regra: 'TFs com auto de infração.' },
    { k: 'apreensao', rotulo: '16.7 Apreensão', unid: 'nº', fonte: 'auto', regra: 'TFs com procedimento apreensão.' },
    { k: 'apreensaoT', rotulo: '16.7 Apreensão', rotuloPlanilha: null, unid: 't', fonte: 'auto', regra: 'Produtos dos TFs de apreensão em kg (÷ 1.000) ou t; outras unidades à parte, sem conversão.', nota: 'toneladas' },
    { k: 'autoDestN', rotulo: 'Auto de destruição', unid: 'nº', fonte: 'auto', regra: 'TFs de apreensão (no e-GDV o procedimento é "apreensão p/ destruição").' },
    { k: 'autoDestT', rotulo: 'Auto de destruição', rotuloPlanilha: null, unid: 't', fonte: 'auto', regra: 'Produtos desses TFs em kg (÷ 1.000) ou t.' }
  ].map(d => ({ ...d, id: 'vigifito.' + d.k, rotuloPlanilha: d.rotuloPlanilha === null ? null : d.rotulo }));
  const PORK = {}; VIGIFITO.forEach(d => { PORK[d.k] = d; });

  // Catálogo geral: os do VIGIFITO + PCE (quadro do Relatório GDV, apurados no servidor por relGdvApurar_) + convênio (etapas
  // automáticas, que leem as MESMAS regras: veículos da 1.10 = vigifito.veiculos das BVAs da etapa; ações da 1.9 = vigifito.abordagem).
  const CATALOGO = {};
  VIGIFITO.forEach(d => { CATALOGO[d.id] = { rotulo: d.rotulo, unid: d.unid, fonte: d.fonte === 'auto' ? 'e-GDV (turnos, veículos e TFs)' : 'lançado no Portal do Administrativo', regra: d.regra || 'Valor lançado por posto e mês (ou período de 10 dias) no Portal do Administrativo.' }; });
  Object.assign(CATALOGO, {
    'pce.propriedadesVisitadas': { rotulo: 'Propriedades/localidades visitadas (distintas)', unid: 'nº', fonte: 'e-GDV (levantamentos)', regra: 'Propriedades distintas (código; sem código, CPF/CNPJ + nome) com levantamento no período; no total, distintas no período inteiro.' },
    'pce.propriedadesNovas': { rotulo: 'Propriedades/localidades novas', unid: 'nº', fonte: 'e-GDV', regra: 'Data de cadastro (a menor entre a criação na aba Propriedades e o 1º levantamento) no mês.' },
    'pce.levantamentos': { rotulo: 'Levantamentos fitossanitários (inspeções)', unid: 'nº', fonte: 'e-GDV', regra: 'Levantamentos não excluídos no período.' },
    'pce.areaMonitorada': { rotulo: 'Área monitorada', unid: 'ha', fonte: 'e-GDV', regra: 'Soma das áreas das culturas avaliadas (a mesma cultura em várias pragas conta uma vez); no total, por propriedade distinta.' },
    'pce.termosColheita': { rotulo: 'Termos de colheita de amostra', unid: 'nº', fonte: 'e-GDV', regra: 'Termos não cancelados, pela data do termo.' },
    'pce.amostrasEnviadas': { rotulo: 'Amostras enviadas a laboratório', unid: 'nº', fonte: 'e-GDV', regra: 'Quantidade dos termos, pela data de envio do resultado laboratorial.' },
    'pce.termosFiscalizacao': { rotulo: 'Termos de fiscalização (PCE)', unid: 'nº', fonte: 'e-GDV', regra: 'Termos de Fiscalização do PCE não cancelados.' },
    'convenio.bva.veiculos': { rotulo: 'Veículos fiscalizados nas BVAs da etapa 1.10', unid: 'nº', fonte: 'e-GDV', regra: 'Mesma regra de vigifito.veiculos (motor das barreiras), somando as BVAs escolhidas na etapa.', igual: 'vigifito.veiculos' },
    'convenio.volante.acoes': { rotulo: 'Ações de fiscalização volante (etapa 1.9)', unid: 'nº', fonte: 'e-GDV', regra: 'Mesma regra de vigifito.abordagem (turnos volantes), nos municípios da etapa.', igual: 'vigifito.abordagem' }
  });

  /**
   * Valor de um indicador do VIGIFITO num posto e período (mês AAAA-MM ou período P<início>): junta o apurado (x = objeto da apuração
   * daquele posto/período, ou null) com o lançado (l = lançamento do portal, ou null). Devolve {v, origem, auto, lanc}:
   * origem 'auto' (e-GDV), 'lancado' (manual) ou 'substituido' (manual no lugar do automático); v null = sem dado.
   */
  function valorVig(k, x, l) {
    const d = PORK[k]; if (!d) return { v: null, origem: null };
    const lv = l && l.valor != null && l.valor !== '' ? Number(l.valor) : null;
    if (d.fonte === 'manual') return { v: lv, origem: lv == null ? null : 'lancado', lanc: l || null };
    const auto = x ? Number(x[k] || 0) : null;
    if (lv != null && l.substitui) return { v: lv, origem: 'substituido', auto, lanc: l };
    return { v: auto, origem: auto == null ? null : 'auto', auto };
  }
  const soma = (a, b) => (a == null && b == null ? null : (a || 0) + (b || 0));
  return { VIGIFITO, PORK, CATALOGO, valorVig, soma, def: id => CATALOGO[id] || null };
})();
if (typeof window !== 'undefined') window.Indicadores = Indicadores;
if (typeof module !== 'undefined' && module.exports) module.exports = Indicadores;
