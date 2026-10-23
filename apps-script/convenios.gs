/* ---------- Convênios (aba "Convênios" do painel; só administrador) ----------
 * Convênio SUASA nº 991272/2025 – MAPA/ADAF: metas físicas por etapa, execução financeira e textos do relatório mensal.
 * Configuração (etapas, metas, sub-metas, bens, plano de aplicação, assinaturas e regras de apuração): aba "Convenios", uma linha por
 * convênio com o JSON (cabe numa célula, aparece no backup diário da planilha e qualquer um vê/audita; a propriedade do script tem
 * limite de 9 KB por valor). Sem linha = semente embutida (convSemente_), gravada na primeira vez que o gerente salva.
 * Apuração automática (painelConvApuracao): só contagens por mês e por município/BVA — nunca nomes, CPF/CNPJ, placas ou coordenadas.
 *   1.4  municípios distintos com levantamento PCE de monilíase OU Termo de Fiscalização do PCE de monilíase; por município, propriedades
 *        distintas (código da propriedade; sem código, CPF/CNPJ + nome da propriedade normalizados) e nº de registros;
 *   1.9  turnos de barreira volante (posto "Móvel") nos municípios configurados (unidade/local do turno), com veículos e TFs desses turnos;
 *   1.10 veículos abordados nas BVAs fixas configuradas (local do turno = nome da BVA), com TFs, apreensões e rechaços.
 * Etapas manuais e ajustes (+/−, justificativa obrigatória) ficam em ConvLancamentos; o financeiro em ConvFinanceiro. */
const CONV_ID_PADRAO = '991272-2025';
const CONV_APURACOES = ['bens', 'manual', 'pce', 'volante', 'bva'];
const CONV_AUTOMATICAS = ['pce', 'volante', 'bva'];
const CONV_TIPOS = ['execucao', 'ajuste', 'bem'];
const CONV_SITUACOES_BEM = ['previsto', 'em_aquisicao', 'adquirido', 'entregue'];
const CONV_FONTES = ['concedente', 'contrapartida'];
const CONV_CAMPOS_ETAPA_TXT = ['evidencias', 'justificativa', 'fator', 'providencia', 'situacao'];
const CONV_CAMPOS_GERAIS = ['fatores', 'providencias', 'analise', 'conclusao'];
const CONV_RE_CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
const CONV_RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Item do plano de aplicação: [id, nome, natureza, unidade, quantidade, valor unitário, total]. */
function convItem_(a) { return { id: a[0], nome: a[1], natureza: a[2], unidade: a[3], quantidade: a[4], valorUnitario: a[5], total: a[6] }; }

/** Semente do Convênio SUASA nº 991272/2025 (números do Plano de Trabalho; textos do relatório parcial 1; sem dados pessoais). */
function convSemente_() {
  const it = function (lst) { return lst.map(convItem_); };
  return {
    id: CONV_ID_PADRAO, numero: '991272/2025', programa: 'SUASA',
    nome: 'Convênio SUASA nº 991272/2025 – MAPA/ADAF',
    concedente: 'Ministério da Agricultura e Pecuária – MAPA (SDA/DSV, SFA-AM)',
    convenente: 'Agência de Defesa Agropecuária e Florestal do Estado do Amazonas – ADAF',
    titulo: 'RELATÓRIO CIRCUNSTANCIAL TÉCNICO DE EXECUÇÃO FÍSICA DAS METAS',
    objeto: 'Fortalecimento das ações de Defesa Sanitária Vegetal no Estado do Amazonas',
    objetoPlano: 'Atender, extraordinariamente, ações emergenciais do Governo Federal e dos Órgãos Executores de Sanidade Agropecuária, de prevenção e combate às emergências agropecuárias em curso e relacionadas às pragas Moniliophthora roreri, Bactrocera carambolae e Rhizoctonia theobromae.',
    meta: 'Meta 1: Manter e Fortalecer as Ações de Sanidade Vegetal',
    vigencia: { inicio: '2025-12-01', fim: '2027-04-01' }, inicioExecucao: '2026-03-01', local: 'Manaus/AM',
    valores: { repasse: 2200000, repasseCusteio: 1200000, repasseInvestimento: 1000000, contrapartida: 68042, global: 2268042 },
    assinaturas: [{ nome: 'FRANCISCO DANIEL DE OLIVEIRA SENA', cargo: 'Diretor-Presidente da ADAF' },
                  { nome: 'STEFANO SAMUEL BERNARDO DA COSTA', cargo: 'Chefe do DDAF' },
                  { nome: 'SIVANDRO CAMPOS DE FREITAS', cargo: 'Gerente de Defesa Vegetal/ADAF' }],
    etapas: [
      { id: '1.1', nome: 'Estruturação das Unidades Locais para realização das Ações dos Programas Nacionais de Sanidade Vegetal', nomeCurto: 'Estruturação das unidades locais',
        apuracao: 'bens', unidade: 'bens', meta: 10, valor: 1068042, contrapartida: 68042,
        bens: [{ id: 'pickup-urucurituba', nome: 'Pick-up 4x4', local: 'Urucurituba' },
               { id: 'embarcacao-urucurituba', nome: 'Embarcação 150 HP', local: 'Urucurituba' }, { id: 'embarcacao-nhamunda', nome: 'Embarcação 150 HP', local: 'Nhamundá' },
               { id: 'embarcacao-tabatinga', nome: 'Embarcação 150 HP', local: 'Tabatinga' },
               { id: 'quadriciclo-benjamin', nome: 'Quadriciclo', local: 'Benjamin Constant' }, { id: 'quadriciclo-nhamunda', nome: 'Quadriciclo', local: 'Nhamundá' },
               { id: 'quadriciclo-spo', nome: 'Quadriciclo', local: 'São Paulo de Olivença' },
               { id: 'carreta-urucurituba', nome: 'Carreta de reboque', local: 'Urucurituba' }, { id: 'carreta-nhamunda', nome: 'Carreta de reboque', local: 'Nhamundá' },
               { id: 'carreta-tabatinga', nome: 'Carreta de reboque', local: 'Tabatinga' }],
        itens: it([['1.1.1', 'Embarcação fluvial (15 pessoas) com motor de popa 150 HP', '44.90.52', 'Unid.', 3, 180000, 540000],
                   ['1.1.2', 'Carreta de reboque', '44.90.52', 'Unid.', 3, 12000, 36000],
                   ['1.1.3', 'Quadriciclo', '44.90.52', 'Unid.', 3, 63333.33, 190000],
                   ['1.1.4', 'Veículo tipo caminhonete (pick-up) 4x4', '44.90.52', 'Unid.', 1, 302042, 302042]]) },
      { id: '1.3', nome: 'Vigilância em Áreas Consideradas de Maior Risco Fitossanitário', nomeCurto: 'Vigilância em áreas de risco',
        apuracao: 'manual', modo: 'media', unidade: 'áreas de vigilância', meta: 7, valor: 35788,
        submetas: [{ id: 'nhamunda', nome: 'Monitoramento de armadilhas – Nhamundá', municipio: 'Nhamundá', meta: 24, unidade: 'monitoramentos', contagem: 'soma' },
                   { id: 'parintins', nome: 'Monitoramento de armadilhas – Parintins', municipio: 'Parintins', meta: 24, unidade: 'monitoramentos', contagem: 'soma' },
                   { id: 'itacoatiara', nome: 'Monitoramento de armadilhas – Itacoatiara', municipio: 'Itacoatiara', meta: 24, unidade: 'monitoramentos', contagem: 'soma' },
                   { id: 'moniliase-risco', nome: 'Vigilância de monilíase em municípios de alto risco', municipio: '', meta: 5, unidade: 'municípios', contagem: 'municipios',
                     municipios: ['Coari', 'Manicoré', 'Novo Aripuanã', 'Borba', 'Nova Olinda do Norte'] }],
        itens: it([['1.3.1', 'Gasolina', '33.90.30', 'Litro', 2260, 12, 27120], ['1.3.2', 'Passagem Aérea', '33.90.33', 'Unid.', 1, 2500, 2500],
                   ['1.3.3', 'Diárias Servidor Nível Superior no Estado', '33.90.14', 'Unid.', 4, 132, 528], ['1.3.4', 'Diárias Servidor Nível Médio no Estado', '33.90.14', 'Unid.', 27, 120, 3240],
                   ['1.3.5', 'Passagem Fluvial', '33.90.30', 'Unid.', 8, 300, 2400]]) },
      { id: '1.4', nome: 'Levantamentos Fitossanitários de Detecção/Delimitação e Verificação', nomeCurto: 'Levantamentos de monilíase',
        apuracao: 'pce', unidade: 'municípios levantados', meta: 52, valor: 141020, pragas: ['Monilíase', 'Moniliophthora roreri'],
        itens: it([['1.4.1', 'Gasolina', '33.90.30', 'Litro', 5600, 12, 67200], ['1.4.2', 'Passagem Aérea', '33.90.33', 'Unid.', 11, 2500, 27500],
                   ['1.4.3', 'Diárias Servidor Nível Médio no Estado', '33.90.14', 'Unid.', 189, 120, 22680], ['1.4.4', 'Diárias Servidor Nível Superior no Estado', '33.90.14', 'Unid.', 70, 132, 9240],
                   ['1.4.5', 'Passagem Fluvial', '33.90.30', 'Unid.', 48, 300, 14400]]) },
      { id: '1.5', nome: 'Ações de Controle e Erradicação', nomeCurto: 'Controle e supressão da monilíase',
        apuracao: 'manual', modo: 'soma', unidade: 'ações', meta: 72, valor: 479160,
        submetas: ['Tabatinga', 'Benjamin Constant', 'São Paulo de Olivença', 'Atalaia do Norte', 'Urucurituba'].map(function (m) {
          return { id: normPub_(m).replace(/ /g, '-'), nome: m, municipio: m, meta: null, unidade: 'ações', contagem: 'soma' }; }),
        itens: it([['1.5.1', 'Diárias Servidor Nível Superior no Estado', '33.90.14', 'Unid.', 30, 132, 3960], ['1.5.2', 'Diárias Servidor Nível Médio no Estado', '33.90.14', 'Unid.', 1080, 120, 129600],
                   ['1.5.3', 'Gasolina', '33.90.30', 'Litro', 7200, 12, 86400], ['1.5.4', 'Diárias Terceiros', '33.90.36', 'Unid.', 2160, 120, 259200]]) },
      { id: '1.9', nome: 'Fiscalização Móvel do Trânsito de Vegetais', nomeCurto: 'Fiscalização móvel (Tabatinga)',
        apuracao: 'volante', unidade: 'ações de fiscalização', meta: 24, valor: 109320, municipios: ['Tabatinga'],
        itens: it([['1.9.1', 'Gasolina', '33.90.30', 'Litro', 480, 12, 5760], ['1.9.2', 'Passagem Aérea', '33.90.33', 'Unid.', 24, 2500, 60000],
                   ['1.9.3', 'Diárias Servidor Nível Superior no Estado', '33.90.14', 'Unid.', 30, 132, 3960], ['1.9.4', 'Diárias Servidor Nível Médio no Estado', '33.90.14', 'Unid.', 330, 120, 39600]]) },
      { id: '1.10', nome: 'Fiscalização do Trânsito Interestadual de Vegetais em Postos Fixos', nomeCurto: 'Fiscalização em postos fixos',
        apuracao: 'bva', unidade: 'veículos fiscalizados', meta: 18000, valor: 409200, bvas: ['BVA - JUNDIÁ', 'BVA - CEASA'],
        obs: 'O Plano de Trabalho prevê 1.800 diárias nesta etapa (financeiro); a meta física é de 18.000 veículos fiscalizados.',
        itens: it([['1.10.1', 'Gasolina', '33.90.30', 'Litro', 1000, 12, 12000], ['1.10.2', 'Diesel', '33.90.30', 'Litro', 3600, 10, 36000],
                   ['1.10.3', 'Diárias Servidor Nível Superior Fora do Estado', '33.90.14', 'Unid.', 260, 252, 65520], ['1.10.4', 'Diárias Servidor Nível Médio Fora do Estado', '33.90.14', 'Unid.', 760, 210, 159600],
                   ['1.10.5', 'Diárias Servidor Nível Médio no Estado', '33.90.14', 'Unid.', 1134, 120, 136080]]) },
      { id: '1.14', nome: 'Supervisão das Ações de Fitossanidade nas Unidades Regionais e Locais', nomeCurto: 'Supervisão das unidades',
        apuracao: 'manual', modo: 'soma', unidade: 'supervisões', meta: 6, valor: 25512,
        submetas: [{ id: 'jundia', nome: 'BVA do Jundiá (Presidente Figueiredo)', municipio: 'Presidente Figueiredo', meta: 3, unidade: 'supervisões', contagem: 'soma' },
                   { id: 'tabatinga', nome: 'Tabatinga', municipio: 'Tabatinga', meta: 3, unidade: 'supervisões', contagem: 'soma' }],
        itens: it([['1.14.1', 'Diesel', '33.90.30', 'Litro', 270, 10, 2700], ['1.14.2', 'Passagem Aérea', '33.90.33', 'Unid.', 6, 2500, 15000],
                   ['1.14.3', 'Diárias Servidor Nível Médio no Estado', '33.90.14', 'Unid.', 15, 120, 1800], ['1.14.4', 'Diárias Servidor Nível Superior no Estado', '33.90.14', 'Unid.', 15, 132, 1980],
                   ['1.14.5', 'Diárias Servidor Nível Superior Fora do Estado', '33.90.14', 'Unid.', 6, 252, 1512], ['1.14.6', 'Diárias Servidor Nível Médio Fora do Estado', '33.90.14', 'Unid.', 12, 210, 2520]]) }
    ],
    versao: 0, atualizadoEm: 0, atualizadoPor: ''
  };
}

/** Convênios configurados (aba Convenios; sem linha válida = semente). */
function convListar_() {
  const lst = [];
  lerLeitura_('Convenios').forEach(function (r) {
    const c = lerJSONSeguro_(r.config, null);
    if (r.id && c && typeof c === 'object' && Array.isArray(c.etapas)) { c.id = r.id; lst.push(c); }
  });
  if (!lst.some(function (c) { return c.id === CONV_ID_PADRAO; })) lst.unshift(convSemente_());
  return lst;
}
function convDe_(id) {
  id = String(id || CONV_ID_PADRAO);
  const c = convListar_().filter(function (x) { return x.id === id; })[0];
  if (!c) throw new Error('Convênio não encontrado: ' + id + '.');
  return c;
}
function convEtapa_(cfg, id) {
  const e = cfg.etapas.filter(function (x) { return x.id === String(id || ''); })[0];
  if (!e) throw new Error('Etapa inexistente no convênio: ' + id + '.');
  return e;
}
/** Texto livre: espaços aparados, limite de tamanho e sem CPF (os lançamentos nunca pedem dados pessoais). */
function convTexto_(v, max, rotulo) {
  const s = String(v === null || v === undefined ? '' : v).replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (s.length > max) throw new Error(rotulo + ': no máximo ' + max + ' caracteres.');
  if (CONV_RE_CPF.test(s)) throw new Error(rotulo + ': não informe CPF (LGPD).');
  return /^[=+\-@]/.test(s) ? "'" + s : s;              // texto digitado não vira fórmula na planilha
}
function convNumero_(v, rotulo) {
  const n = typeof v === 'number' ? v : numOuNulo_(v);
  if (n === null || !isFinite(n)) throw new Error(rotulo + ' deve ser um número.');
  return n;
}
function convDataNaVigencia_(cfg, d) {
  if (!diaValido_(d)) throw new Error('Data inválida: use aaaa-mm-dd.');
  if (d < cfg.vigencia.inicio || d > cfg.vigencia.fim) throw new Error('Data fora da vigência do convênio (' + diaBR_(cfg.vigencia.inicio) + ' a ' + diaBR_(cfg.vigencia.fim) + ').');
  return d;
}
/** Grava (insere ou substitui pela coluna id) uma linha numa aba do convênio. */
function convGravar_(nome, o) {
  const t = lerTudo_(nome), linha = t.cols.map(function (c) { const v = o[c]; return v === null || v === undefined ? '' : v; });
  for (let i = 0; i < t.valores.length; i++) {
    if (String(t.valores[i][0]) === String(o.id)) { t.sh.getRange(i + 2, 1, 1, t.cols.length).setValues([linha]); return; }
  }
  t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length).setValues([linha]);
}
function convLinha_(nome, id) {
  const t = lerTudo_(nome);
  for (let i = 0; i < t.valores.length; i++) if (String(t.valores[i][0]) === String(id)) return paraObjeto_(t.cols, t.valores[i]);
  return null;
}
function convLancOut_(r) {
  return { id: r.id, convenio: r.convenio, etapa: r.etapa, submeta: r.submeta, data: r.data, municipio: r.municipio, quantidade: numOuNulo_(r.quantidade) || 0,
           descricao: r.descricao, tipo: r.tipo, situacao: r.situacao, documento: r.documento, armadilhas: numOuNulo_(r.armadilhas),
           propriedades: numOuNulo_(r.propriedades), usuario: r.usuario, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm };
}
function convFinOut_(r) {
  return { id: r.id, convenio: r.convenio, etapa: r.etapa, item: r.item, natureza: r.natureza, data: r.data, quantidade: numOuNulo_(r.quantidade),
           valor: numOuNulo_(r.valor) || 0, documento: r.documento, descricao: r.descricao, fonte: r.fonte, usuario: r.usuario, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm,
           chave: r.chave, origem: r.origem || 'manual', arquivo: r.arquivo, importadoEm: r.importadoEm || 0, tipoDiaria: r.tipoDiaria || '', municipio: r.municipio || '' };
}
/** Para o Portal do Administrativo: o mesmo e o servidor que recebeu (id e nome — o nome NUNCA vai ao painel nem aos relatórios). */
function convFinOutAdm_(r) {
  const o = convFinOut_(r);
  o.servidorId = r.servidorId || ''; o.servidorNome = r.servidorNome || ''; o.admId = r.admId || '';
  return o;
}

/** Painel → aba Convênios: configurações, lançamentos físicos, financeiro e textos dos relatórios (só administrador). */
function painelConvenios(token) {
  const admin = adminDoToken_(token);
  const vivo = function (r) { return r.id && r.excluido !== 1; };
  return { ok: true, admin: admin, hoje: hojeManaus_(), convenios: convListar_(), semente: convSemente_(),
           lancamentos: lerLeitura_('ConvLancamentos').filter(vivo).map(convLancOut_),
           financeiro: lerLeitura_('ConvFinanceiro').filter(vivo).map(function (r) { const o = convFinOut_(r); o.servidorNome = r.servidorNome || ''; return o; }),   // painel (só administrador) mostra o servidor; relatórios não
           relatorios: lerLeitura_('ConvRelatorios').filter(function (r) { return r.id; }).map(function (r) {
             return { id: r.id, convenio: r.convenio, mes: r.mes, numero: r.numero, textos: lerJSONSeguro_(r.textos, {}), usuario: r.usuario, atualizadoEm: r.atualizadoEm }; }) };
}

/** Salva a configuração editável (textos, datas, assinaturas, metas/sub-metas, BVAs, municípios, pragas, previsto dos itens). */
function painelConvSalvar(token, convenio, config) {
  const admin = adminDoToken_(token, true);
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuração inválida.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const atual = convDe_(convenio), c = JSON.parse(JSON.stringify(atual));
    const txt = function (k, max, obrig) {
      if (!(k in config)) return;
      const v = convTexto_(config[k], max, k);
      if (!v && obrig) throw new Error('Preencha o campo ' + k + '.');
      c[k] = v;
    };
    txt('titulo', 200, true); txt('objeto', 600, true); txt('meta', 300, true); txt('local', 80, true); txt('nome', 200, true);
    if (config.vigencia) {
      const vi = String(config.vigencia.inicio || ''), vf = String(config.vigencia.fim || '');
      if (!diaValido_(vi) || !diaValido_(vf) || vi >= vf) throw new Error('Vigência inválida.');
      c.vigencia = { inicio: vi, fim: vf };
    }
    if ('inicioExecucao' in config) c.inicioExecucao = String(config.inicioExecucao || '');
    if (!diaValido_(c.inicioExecucao) || c.inicioExecucao < c.vigencia.inicio || c.inicioExecucao >= c.vigencia.fim) throw new Error('Início da execução deve estar dentro da vigência.');
    if ('assinaturas' in config) {
      if (!Array.isArray(config.assinaturas) || config.assinaturas.length > 3) throw new Error('Assinaturas: até 3 linhas.');
      c.assinaturas = config.assinaturas.map(function (a, i) {
        return { nome: convTexto_(a && a.nome, 100, 'Assinatura ' + (i + 1)), cargo: convTexto_(a && a.cargo, 120, 'Cargo ' + (i + 1)) };
      }).filter(function (a) { return a.nome || a.cargo; });
    }
    if ('etapas' in config) {
      if (!Array.isArray(config.etapas)) throw new Error('Etapas inválidas.');
      config.etapas.forEach(function (o) {
        if (!o || typeof o !== 'object') throw new Error('Etapa inválida.');
        const e = convEtapa_(c, o.id);
        if ('meta' in o) { const m = convNumero_(o.meta, 'Meta da etapa ' + e.id); if (!(m > 0) || m > 1e7) throw new Error('Meta da etapa ' + e.id + ' deve ser maior que zero.'); e.meta = m; }
        if ('nome' in o) { const n = convTexto_(o.nome, 200, 'Nome da etapa ' + e.id); if (n) e.nome = n; }
        if ('nomeCurto' in o) { const n = convTexto_(o.nomeCurto, 80, 'Nome curto da etapa ' + e.id); if (n) e.nomeCurto = n; }
        if ('unidade' in o) { const n = convTexto_(o.unidade, 60, 'Unidade da etapa ' + e.id); if (n) e.unidade = n; }
        const listaTxt = function (k, rot) {
          if (!(k in o)) return;
          const l = (Array.isArray(o[k]) ? o[k] : String(o[k] || '').split(/[\n;]/)).map(function (x) { return convTexto_(x, 80, rot); }).filter(Boolean);
          if (!l.length || l.length > 20) throw new Error(rot + ' (etapa ' + e.id + '): de 1 a 20 itens.');
          e[k] = l;
        };
        if (e.apuracao === 'bva') listaTxt('bvas', 'BVAs');
        if (e.apuracao === 'volante') listaTxt('municipios', 'Municípios');
        if (e.apuracao === 'pce') listaTxt('pragas', 'Nomes da praga');
        if ('submetas' in o && e.apuracao === 'manual') {
          if (!Array.isArray(o.submetas) || o.submetas.length > 20) throw new Error('Sub-metas da etapa ' + e.id + ': até 20.');
          const vistos = {};
          e.submetas = o.submetas.map(function (s, i) {
            const nome = convTexto_(s && s.nome, 120, 'Sub-meta');
            if (!nome) throw new Error('Sub-meta ' + (i + 1) + ' da etapa ' + e.id + ' sem nome.');
            let id = String((s && s.id) || '').trim() || normPub_(nome).replace(/ /g, '-').slice(0, 40);
            if (!/^[a-z0-9-]{1,40}$/.test(id) || vistos[id]) id = id.replace(/[^a-z0-9-]/g, '').slice(0, 34) + '-' + (i + 1);
            vistos[id] = true;
            const meta = s.meta === '' || s.meta === null || s.meta === undefined ? null : convNumero_(s.meta, 'Meta da sub-meta ' + nome);
            if (meta !== null && meta < 0) throw new Error('Meta da sub-meta ' + nome + ' negativa.');
            const contagem = s.contagem === 'municipios' ? 'municipios' : 'soma';
            const o2 = { id: id, nome: nome, municipio: convTexto_(s.municipio, 80, 'Município'), meta: meta, unidade: convTexto_(s.unidade, 40, 'Unidade') || e.unidade, contagem: contagem };
            if (contagem === 'municipios') o2.municipios = (Array.isArray(s.municipios) ? s.municipios : String(s.municipios || '').split(/[\n;,]/)).map(function (x) { return convTexto_(x, 80, 'Município'); }).filter(Boolean).slice(0, 60);
            return o2;
          });
        }
        if ('itens' in o) {
          if (!Array.isArray(o.itens)) throw new Error('Itens inválidos.');
          o.itens.forEach(function (x) {
            const item = (e.itens || []).filter(function (y) { return y.id === String(x && x.id); })[0];
            if (!item) throw new Error('Item inexistente: ' + (x && x.id) + '.');
            if ('quantidade' in x) { const q = convNumero_(x.quantidade, 'Quantidade do item ' + item.id); if (q < 0) throw new Error('Quantidade negativa.'); item.quantidade = q; }
            if ('valorUnitario' in x) { const v = convNumero_(x.valorUnitario, 'Valor unitário do item ' + item.id); if (v < 0) throw new Error('Valor negativo.'); item.valorUnitario = v; }
            if ('total' in x && x.total !== '' && x.total !== null) { const t = convNumero_(x.total, 'Total do item ' + item.id); if (t < 0) throw new Error('Valor negativo.'); item.total = Math.round(t * 100) / 100; }
            else if ('quantidade' in x || 'valorUnitario' in x) item.total = Math.round(item.quantidade * item.valorUnitario * 100) / 100;
          });
          e.valor = Math.round(e.itens.reduce(function (s, y) { return s + (Number(y.total) || 0); }, 0) * 100) / 100;
        }
      });
    }
    c.versao = (Number(atual.versao) || 0) + 1; c.atualizadoEm = Date.now(); c.atualizadoPor = admin;
    const json = JSON.stringify(c);
    if (json.length > 45000) throw new Error('Configuração grande demais.');
    convGravar_('Convenios', { id: c.id, config: json, atualizadoEm: c.atualizadoEm, atualizadoPor: admin });
    return { ok: true, config: c };
  } finally { lock.releaseLock(); }
}

/** Painel: as gravações de dados do convênio passaram para o Portal do Administrativo (o painel só mostra). Fiscal continua com "Acesso restrito". */
function painelConvLancar(token) { adminDoToken_(token); throw new Error(MSG_PORTAL); }
function painelConvFinLancar(token) { adminDoToken_(token); throw new Error(MSG_PORTAL); }
function painelConvFinImportar(token) { adminDoToken_(token); throw new Error(MSG_PORTAL); }
function painelConvExcluir(token) { adminDoToken_(token); throw new Error(MSG_PORTAL); }

/**
 * Lançamento físico (novo ou edição pelo id): execucao (etapa manual), ajuste (etapa automática, justificativa obrigatória) ou bem (1.1).
 * autor = {nome, admId} (Portal do Administrativo). Devolve também {antes} para o histórico.
 */
function convLancar_(autor, l) {
  if (!l || typeof l !== 'object') throw new Error('Lançamento inválido.');
  const cfg = convDe_(l.convenio), e = convEtapa_(cfg, l.etapa);
  const tipo = String(l.tipo || (e.apuracao === 'bens' ? 'bem' : CONV_AUTOMATICAS.indexOf(e.apuracao) >= 0 ? 'ajuste' : 'execucao'));
  if (CONV_TIPOS.indexOf(tipo) < 0) throw new Error('Tipo de lançamento inválido.');
  if (tipo === 'execucao' && e.apuracao !== 'manual') throw new Error('A etapa ' + e.id + ' é apurada automaticamente: use um ajuste (+/−) com justificativa.');
  if (tipo === 'ajuste' && CONV_AUTOMATICAS.indexOf(e.apuracao) < 0) throw new Error('Ajuste só nas etapas apuradas automaticamente.');
  if (tipo === 'bem' && e.apuracao !== 'bens') throw new Error('A etapa ' + e.id + ' não tem bens.');
  const o = { convenio: cfg.id, etapa: e.id, tipo: tipo, data: convDataNaVigencia_(cfg, String(l.data || '')),
              municipio: convTexto_(l.municipio, 80, 'Município'), descricao: convTexto_(l.descricao, 2000, 'Descrição'),
              documento: convTexto_(l.documento, 120, 'Documento'), submeta: String(l.submeta || '').trim(), situacao: '' };
  if (tipo === 'bem') {
    if (!(e.bens || []).some(function (b) { return b.id === o.submeta; })) throw new Error('Bem inexistente na etapa ' + e.id + '.');
    o.situacao = String(l.situacao || '');
    if (CONV_SITUACOES_BEM.indexOf(o.situacao) < 0) throw new Error('Situação do bem inválida.');
    o.quantidade = 1;
    var bemValor = l.valor === '' || l.valor === null || l.valor === undefined ? null : Math.round(convNumero_(l.valor, 'Valor de aquisição') * 100) / 100;
    if (bemValor !== null && !(bemValor > 0 && bemValor <= 1e8)) throw new Error('Valor de aquisição inválido.');
    var bemQtd = l.quantidadeAquisicao === '' || l.quantidadeAquisicao === null || l.quantidadeAquisicao === undefined ? null : convNumero_(l.quantidadeAquisicao, 'Quantidade adquirida');
    if (bemQtd !== null && !(bemQtd > 0 && bemQtd <= 1e4)) throw new Error('Quantidade adquirida inválida.');
    var bemFonte = String(l.fonte || 'concedente');
    if (CONV_FONTES.indexOf(bemFonte) < 0) throw new Error('Fonte inválida (concedente ou contrapartida).');
  } else {
    const q = convNumero_(l.quantidade, 'Quantidade');
    if (Math.abs(q) > 1e6) throw new Error('Quantidade grande demais.');
    if (tipo === 'execucao' && !(q > 0)) throw new Error('Quantidade deve ser maior que zero.');
    if (tipo === 'ajuste' && q === 0) throw new Error('Ajuste com quantidade zero.');
    if (tipo === 'ajuste' && o.descricao.length < 5) throw new Error('Ajuste exige justificativa (descrição).');
    o.quantidade = q;
    const subs = e.submetas || [];
    if (tipo === 'execucao' && subs.length && !subs.some(function (s) { return s.id === o.submeta; })) throw new Error('Escolha a sub-meta/município da etapa ' + e.id + '.');
    if (tipo === 'execucao' && !subs.length) o.submeta = '';
    const sub = subs.filter(function (s) { return s.id === o.submeta; })[0];
    if (sub && !o.municipio) o.municipio = sub.municipio || '';
    if (sub && sub.contagem === 'municipios' && !o.municipio) throw new Error('Informe o município da sub-meta "' + sub.nome + '".');
    ['armadilhas', 'propriedades'].forEach(function (k) {
      const v = l[k] === '' || l[k] === null || l[k] === undefined ? null : convNumero_(l[k], k);
      if (v !== null && (v < 0 || v > 1e6)) throw new Error(k + ' inválido.');
      o[k] = v === null ? '' : v;
    });
  }
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const agora = Date.now();
    let id = String(l.id || ''), ant = null;
    if (id) {
      ant = convLinha_('ConvLancamentos', id);
      if (!ant || ant.excluido === 1 || ant.convenio !== cfg.id) throw new Error('Lançamento não encontrado.');
      o.criadoEm = ant.criadoEm;
    } else { id = Utilities.getUuid(); o.criadoEm = agora; }
    o.id = id; o.usuario = autor.nome; o.admId = autor.admId || ''; o.atualizadoEm = agora; o.excluido = 0;
    // bem adquirido/entregue: o valor de aquisição vira (ou atualiza) o desembolso do item do bem no Financeiro (chave bem|<convênio>|<bem>)
    let fin = null;
    if (tipo === 'bem' && (o.situacao === 'adquirido' || o.situacao === 'entregue')) {
      fin = convBemFinanceiro_(autor, cfg, e, o, bemValor, bemFonte, agora, bemQtd);
      if (!fin) throw new Error('Informe o valor de aquisição do bem (entra no financeiro da etapa ' + e.id + '), ou o mesmo nº de NF/NE do desembolso já lançado.');
    }
    convGravar_('ConvLancamentos', o);
    return { ok: true, lancamento: convLancOut_(paraObjeto_(TABELAS.ConvLancamentos, TABELAS.ConvLancamentos.map(function (c) { return o[c]; }))), antes: ant,
             financeiro: fin && fin.lancamento, finAntes: fin && fin.antes, avisos: fin && fin.aviso ? [fin.aviso] : [] };
  } finally { lock.releaseLock(); }
}

/** Item do plano de aplicação de um bem da 1.1: b.item, ou o item cujo nome traz a primeira palavra do bem (pick-up, embarcação, quadriciclo, carreta). */
function convItemDoBem_(e, b) {
  const itens = e.itens || [];
  if (b.item) { const x = itens.filter(function (i) { return i.id === b.item; })[0]; if (x) return x; }
  const p = normPub_(b.nome).split(' ')[0];
  return itens.filter(function (i) { return normPub_(i.nome).split(' ').some(function (w) { return w === p || (p.length >= 4 && w.indexOf(p) === 0); }); })[0] || null;
}
const convChaveBem_ = function (cfg, bemId) { return 'bem|' + cfg.id + '|' + bemId; };
/**
 * Desembolso da aquisição de um bem (dentro do lock de convLancar_), com a quantidade adquirida (padrão 1). valor null = mantém o já lançado (ex.: "entregue" depois de "adquirido").
 * Devolve {lancamento, antes} ou null se não há valor nem lançamento anterior.
 */
/** Nº de documento normalizado para comparar (sem "Memo nº", "NF", "NE"… nem zeros à esquerda). */
function convDocN_(v) { return normPub_(v).replace(/^(memo|memorando|empenho|ne|nf|pcdp|ob)\s*(n|no|nº)?\s*/, '').replace(/^0+(?=\d)/, ''); }
/** Desembolso MANUAL vivo do mesmo item com o mesmo documento (NF/NE/memo) do lançamento do bem: é a mesma aquisição já lançada. */
function convDesembolsoDoDoc_(cfg, itemId, documento) {
  // documento pode ter várias partes ("NE 2026NE0001288; NF 769"): basta uma parte igual
  const partes = function (v) { return String(v || '').split(/[;,/]| e /).map(convDocN_).filter(Boolean); };
  const meus = partes(documento); if (!meus.length) return null;
  return lerLeitura_('ConvFinanceiro').filter(function (r) {
    return r.id && r.excluido !== 1 && r.convenio === cfg.id && r.item === itemId && String(r.chave || '').indexOf('bem|') !== 0 &&
      partes(r.documento).some(function (x) { return meus.indexOf(x) >= 0; });
  })[0] || null;
}
function convBemFinanceiro_(autor, cfg, e, lanc, valor, fonte, agora, qtd) {
  const b = (e.bens || []).filter(function (x) { return x.id === lanc.submeta; })[0];
  const item = convItemDoBem_(e, b);
  if (!item) throw new Error('O bem "' + b.nome + '" não tem item no plano de aplicação da etapa ' + e.id + '.');
  const chave = convChaveBem_(cfg, b.id);
  const ant = lerLeitura_('ConvFinanceiro').filter(function (r) { return r.id && r.chave === chave; })[0] || null;
  let vivo = ant && ant.excluido !== 1, base = vivo ? ant : null, vinculado = null;
  // proteção contra lançamento dobrado: já existe desembolso manual deste item com a mesma NF/NE/memo → é a mesma aquisição:
  // o bem passa a usar essa linha (vira "Bem (aquisição)") em vez de criar outra
  if (!vivo) { vinculado = convDesembolsoDoDoc_(cfg, item.id, lanc.documento); if (vinculado) { vivo = true; base = vinculado; } }
  if (valor === null && !vivo) return null;
  const o = vivo ? JSON.parse(JSON.stringify(base)) : { id: ant ? ant.id : Utilities.getUuid(), criadoEm: ant ? ant.criadoEm : agora };
  Object.assign(o, { convenio: cfg.id, etapa: e.id, item: item.id, natureza: item.natureza, chave: chave, origem: 'bem',
                     descricao: vinculado && vinculado.descricao ? vinculado.descricao : 'Aquisição: ' + b.nome + ' – ' + b.local,
                     municipio: (vinculado && vinculado.municipio) || b.local || '', usuario: autor.nome, admId: autor.admId || '', atualizadoEm: agora, excluido: 0 });
  if (valor !== null) { o.valor = valor; o.fonte = fonte; }
  if (qtd !== null && qtd !== undefined) o.quantidade = qtd; else if (!vivo) o.quantidade = 1;
  if (!vinculado && (!vivo || valor !== null)) { o.data = lanc.data; if (lanc.documento) o.documento = lanc.documento; }
  if (!o.fonte) o.fonte = 'concedente';
  convGravar_('ConvFinanceiro', o);
  return { lancamento: convFinOutAdm_(paraObjeto_(TABELAS.ConvFinanceiro, TABELAS.ConvFinanceiro.map(function (c) { return o[c]; }))), antes: vivo ? base : null,
           aviso: vinculado ? 'Ligado ao desembolso já lançado (' + (vinculado.documento || 'mesmo documento') + '): o valor não foi contado de novo.' : '' };
}
const CONV_TIPOS_DIARIA = ['NM', 'NS', 'TERC'];
/**
 * Lançamento financeiro / desembolso (novo ou edição): etapa e item do plano de aplicação, data, quantidade (diárias), valor, documento
 * (memorando/empenho/NF/PCDP/OB), fonte, tipo da diária e servidor que recebeu (id da lista; o nome é resolvido aqui e gravado só na
 * planilha). autor = {nome, admId}. Devolve avisos (memorando repetido no item, diárias acima do previsto) e {antes} para o histórico.
 */
function convFinLancar_(autor, l) {
  if (!l || typeof l !== 'object') throw new Error('Lançamento inválido.');
  const cfg = convDe_(l.convenio), e = convEtapa_(cfg, l.etapa);
  const item = (e.itens || []).filter(function (x) { return x.id === String(l.item || ''); })[0];
  if (!item) throw new Error('Escolha o item do plano de aplicação da etapa ' + e.id + '.');
  const valor = Math.round(convNumero_(l.valor, 'Valor') * 100) / 100;
  if (valor === 0 || Math.abs(valor) > 1e8) throw new Error('Valor inválido.');
  const fonte = String(l.fonte || 'concedente');
  if (CONV_FONTES.indexOf(fonte) < 0) throw new Error('Fonte inválida (concedente ou contrapartida).');
  const qtd = l.quantidade === '' || l.quantidade === null || l.quantidade === undefined ? '' : convNumero_(l.quantidade, 'Quantidade');
  if (qtd !== '' && (qtd < 0 || qtd > 1e7)) throw new Error('Quantidade inválida.');
  const o = { convenio: cfg.id, etapa: e.id, item: item.id, natureza: item.natureza, data: convDataNaVigencia_(cfg, String(l.data || '')), quantidade: qtd,
              valor: valor, documento: convTexto_(l.documento, 120, 'Documento'), descricao: convTexto_(l.descricao, 1000, 'Descrição'), fonte: fonte, origem: 'manual',
              municipio: convTexto_(String(l.municipio || '').replace(/\s+/g, ' ').trim(), 80, 'Município') };
  if (valor < 0 && o.descricao.length < 5) throw new Error('Valor negativo (estorno) exige descrição.');
  o.tipoDiaria = String(l.tipoDiaria || '').toUpperCase();
  if (o.tipoDiaria && CONV_TIPOS_DIARIA.indexOf(o.tipoDiaria) < 0) throw new Error('Tipo de diária inválido (NM, NS ou terceiros).');
  // servidor da diária: nome digitado livremente (não precisa ser fiscal cadastrado); id estável pelo nome normalizado
  o.servidorNome = convTexto_(String(l.servidorNome || '').replace(/\s+/g, ' ').trim(), 120, 'Servidor'); o.servidorId = '';
  if (!o.servidorNome && l.servidorId) {                          // compatibilidade: id da lista antiga
    const srv = admServidores_().concat(admServidoresDiaria_()).filter(function (x) { return x.id === String(l.servidorId); })[0];
    if (srv) o.servidorNome = srv.nome;
  }
  if (o.servidorNome) o.servidorId = 'srv-' + hexSha_('srv:' + nomeChave_(o.servidorNome)).slice(0, 12);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const agora = Date.now();
    let id = String(l.id || ''), ant = null;
    if (id) {
      ant = convLinha_('ConvFinanceiro', id);
      if (!ant || ant.excluido === 1 || ant.convenio !== cfg.id) throw new Error('Lançamento não encontrado.');
      o.criadoEm = ant.criadoEm;
      // importado da planilha e editado à mão: mantém a chave (a próxima importação compara e, se a planilha diferir, atualiza)
      o.chave = ant.chave; o.origem = ant.origem || 'manual'; o.arquivo = ant.arquivo; o.importadoEm = ant.importadoEm;
    } else { id = Utilities.getUuid(); o.criadoEm = agora; }
    o.id = id; o.usuario = autor.nome; o.admId = autor.admId || ''; o.atualizadoEm = agora; o.excluido = 0;
    // avisos (não bloqueiam): memorando/documento repetido no mesmo item e diárias do item acima do previsto no plano
    const vivos = lerLeitura_('ConvFinanceiro').filter(function (r) { return r.id && r.id !== id && r.excluido !== 1 && r.convenio === cfg.id && r.item === item.id; });
    const docN = function (v) { return normPub_(v).replace(/^(memo|memorando|empenho|ne|nf|pcdp|ob)\s*(n|no|nº)?\s*/, '').replace(/^0+(?=\d)/, ''); };
    const avisos = [];
    if (o.documento && vivos.some(function (r) { return docN(r.documento) && docN(r.documento) === docN(o.documento); })) avisos.push('Documento/memorando ' + o.documento + ' já lançado neste item (possível duplicidade).');
    // proteção contra lançamento dobrado de bem: o item já tem aquisição lançada pela execução física (Bem (aquisição)) com o mesmo valor
    const bemIgual = vivos.filter(function (r) { return String(r.chave || '').indexOf('bem|') === 0 && Math.abs(Number(r.valor) - Number(o.valor)) < 0.005; })[0];
    if (bemIgual && String(o.chave || '').indexOf('bem|') !== 0) avisos.push('Este item já tem a aquisição de um bem lançada pela execução física com o mesmo valor (' + (bemIgual.descricao || bemIgual.documento || '') + '): confira se não é o mesmo bem lançado duas vezes (o saldo desconta os dois).');
    if (ConvNatDiarias_.indexOf(item.natureza) >= 0 && qtd !== '') {
      const usadas = vivos.reduce(function (t, r) { return t + (numOuNulo_(r.quantidade) || 0); }, 0) + Number(qtd);
      if (usadas > Number(item.quantidade || 0)) avisos.push('Diárias do item ' + item.id + ': ' + (Math.round(usadas * 10) / 10) + ' de ' + item.quantidade + ' previstas (acima do previsto).');
    }
    convGravar_('ConvFinanceiro', o);
    return { ok: true, lancamento: convFinOutAdm_(paraObjeto_(TABELAS.ConvFinanceiro, TABELAS.ConvFinanceiro.map(function (c) { return o[c]; }))), avisos: avisos, antes: ant };
  } finally { lock.releaseLock(); }
}
const ConvNatDiarias_ = ['33.90.14', '33.90.36'];

const CONV_IMP_MAX = 500;                              // lançamentos por chamada de painelConvFinImportar (o painel divide em lotes)
/**
 * Importação em lote da planilha de movimentação financeira (painel → Financeiro → "Importar planilha"; o .xlsx é lido no navegador).
 * req = {convenio, arquivo, itens: [{chave, item, etapa, data, valor, documento, quantidade, fonte, descricao}], excluir: [ids]}.
 * Idempotente pela chave (imp|<convênio>|<item>|<memo> ou imp|<convênio>|<item>|<data>|<valor>|<n>): chave já gravada e igual → nada;
 * diferente (valor/data/documento) → atualiza a mesma linha; nova → acrescenta. Linha excluída antes com a mesma chave volta a valer.
 * excluir = ids de lançamentos importados que sumiram da planilha e o gerente marcou para excluir (exclusão lógica).
 * Mesmas validações do lançamento manual (etapa/item do plano, data na vigência, valor, textos sem CPF). Nunca recebe nomes de servidores.
 */
function convFinImportar_(autor, req) {
  req = req || {};
  const cfg = convDe_(req.convenio);
  const itens = Array.isArray(req.itens) ? req.itens : [], excluir = Array.isArray(req.excluir) ? req.excluir.map(String) : [];
  if (!itens.length && !excluir.length) throw new Error('Nada a importar.');
  if (itens.length > CONV_IMP_MAX || excluir.length > CONV_IMP_MAX) throw new Error('No máximo ' + CONV_IMP_MAX + ' lançamentos por envio.');
  const arquivo = convTexto_(req.arquivo, 200, 'Arquivo');
  const pre = 'imp|' + cfg.id + '|', vistas = {};
  const novos = itens.map(function (l, i) {
    const rot = 'Linha ' + (i + 1);
    if (!l || typeof l !== 'object') throw new Error(rot + ': lançamento inválido.');
    const e = convEtapa_(cfg, l.etapa);
    const item = (e.itens || []).filter(function (x) { return x.id === String(l.item || ''); })[0];
    if (!item) throw new Error(rot + ': item ' + l.item + ' não existe na etapa ' + e.id + '.');
    const chave = String(l.chave || '');
    if (chave.indexOf(pre + item.id + '|') !== 0 || chave.length > 200) throw new Error(rot + ': chave de importação inválida.');
    if (vistas[chave]) throw new Error(rot + ': chave repetida no envio (' + chave + ').');
    vistas[chave] = 1;
    const valor = Math.round(convNumero_(l.valor, rot + ': valor') * 100) / 100;
    if (!(valor > 0) || valor > 1e8) throw new Error(rot + ': valor inválido.');
    const qtd = l.quantidade === '' || l.quantidade === null || l.quantidade === undefined ? '' : convNumero_(l.quantidade, rot + ': quantidade');
    if (qtd !== '' && (qtd < 0 || qtd > 1e7)) throw new Error(rot + ': quantidade inválida.');
    const fonte = String(l.fonte || 'concedente');
    if (CONV_FONTES.indexOf(fonte) < 0) throw new Error(rot + ': fonte inválida.');
    let data;
    try { data = convDataNaVigencia_(cfg, String(l.data || '')); } catch (err) { throw new Error(rot + ': ' + err.message); }
    const servidorNome = convTexto_(String(l.servidorNome || '').replace(/\s+/g, ' ').trim(), 120, rot + ': servidor');
    return { convenio: cfg.id, etapa: e.id, item: item.id, natureza: item.natureza, data: data, quantidade: qtd === '' ? '' : Math.round(qtd * 100) / 100, valor: valor,
             documento: convTexto_(l.documento, 120, rot + ': documento'), descricao: convTexto_(l.descricao, 200, rot + ': descrição'), fonte: fonte,
             chave: chave, origem: 'planilha', arquivo: arquivo,
             servidorNome: servidorNome, servidorId: servidorNome ? 'srv-' + hexSha_('srv:' + nomeChave_(servidorNome)).slice(0, 12) : '' };
  });
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const t = lerTudo_('ConvFinanceiro'), cols = t.cols, ix = {}, iId = {};
    const ci = function (c) { return cols.indexOf(c); };
    t.valores.forEach(function (l, i) {
      const o = paraObjeto_(cols, l);
      if (o.chave && o.convenio === cfg.id) { if (!ix[o.chave] || ix[o.chave].o.excluido === 1) ix[o.chave] = { i: i, o: o }; }
      if (o.id) iId[o.id] = { i: i, o: o };
    });
    const agora = Date.now(), acrescentar = [], res = { novos: 0, atualizados: 0, iguais: 0, excluidos: 0, lancamentos: [] };
    const linhaDe = function (o) { return cols.map(function (c) { const v = o[c]; return v === null || v === undefined ? '' : v; }); };
    novos.forEach(function (n) {
      const a = ix[n.chave];
      if (a && a.o.excluido !== 1 && a.o.data === n.data && Number(a.o.valor) === n.valor && a.o.documento === n.documento && a.o.descricao === n.descricao &&
          a.o.item === n.item && String(a.o.quantidade) === String(n.quantidade) && a.o.fonte === n.fonte &&
          (!n.servidorNome || a.o.servidorNome === n.servidorNome)) { res.iguais++; return; }
      if (a && !n.servidorNome && a.o.servidorNome) { n.servidorNome = a.o.servidorNome; n.servidorId = a.o.servidorId; }   // sem nome no envio: mantém o já gravado
      if (a && a.o.municipio) n.municipio = a.o.municipio;                         // a planilha não traz município: mantém o lançado no portal
      const o = Object.assign({}, n, { usuario: autor.nome, admId: autor.admId || '', atualizadoEm: agora, importadoEm: agora, excluido: 0 });
      if (a) {
        o.id = a.o.id; o.criadoEm = a.o.criadoEm || agora;
        t.sh.getRange(a.i + 2, 1, 1, cols.length).setValues([linhaDe(o)]); res.atualizados++;
      } else { o.id = Utilities.getUuid(); o.criadoEm = agora; acrescentar.push(linhaDe(o)); res.novos++; }
      res.lancamentos.push(convFinOutAdm_(o));
    });
    if (acrescentar.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, acrescentar.length, cols.length).setValues(acrescentar);
    excluir.forEach(function (id) {
      const a = iId[id];
      if (!a || a.o.excluido === 1 || a.o.convenio !== cfg.id || a.o.origem !== 'planilha') throw new Error('Lançamento importado não encontrado: ' + id + '.');
      t.sh.getRange(a.i + 2, ci('excluido') + 1).setValue(1);
      t.sh.getRange(a.i + 2, ci('usuario') + 1).setValue(autor.nome);
      t.sh.getRange(a.i + 2, ci('admId') + 1).setValue(autor.admId || '');
      t.sh.getRange(a.i + 2, ci('atualizadoEm') + 1).setValue(agora);
      res.excluidos++;
    });
    res.ok = true; res.arquivo = arquivo;
    return res;
  } finally { lock.releaseLock(); }
}

/** Exclusão lógica (excluido = 1, com quem/quando) de um lançamento físico ou financeiro. */
function convExcluir_(autor, aba, id) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const r = convLinha_(aba, String(id || ''));
    if (!r || r.excluido === 1) throw new Error('Lançamento não encontrado.');
    const antes = JSON.parse(JSON.stringify(r));
    r.excluido = 1; r.usuario = autor.nome; r.admId = autor.admId || ''; r.atualizadoEm = Date.now();
    convGravar_(aba, r);
    return { ok: true, id: r.id, antes: antes };
  } finally { lock.releaseLock(); }
}

/** Textos do relatório mensal (um por convênio e mês) e o número da parcial. */
function painelConvRelSalvar(token, req) {
  const admin = adminDoToken_(token, true);
  const cfg = convDe_(req.convenio), mes = String(req.mes || '');
  if (!CONV_RE_MES.test(mes) || mes < cfg.inicioExecucao.slice(0, 7) || mes > cfg.vigencia.fim.slice(0, 7)) throw new Error('Mês de referência inválido.');
  const numero = Math.round(convNumero_(req.numero, 'Número da parcial'));
  if (numero < 1 || numero > 99) throw new Error('Número da parcial inválido.');
  const t = req.textos && typeof req.textos === 'object' ? req.textos : {}, out = { etapas: {}, gerais: {} };
  Object.keys(t.etapas || {}).forEach(function (id) {
    convEtapa_(cfg, id);
    const x = t.etapas[id] || {}, y = {};
    Object.keys(x).forEach(function (k) { if (CONV_CAMPOS_ETAPA_TXT.indexOf(k) < 0) throw new Error('Campo desconhecido: ' + k + '.'); y[k] = convTexto_(x[k], 4000, 'Texto da etapa ' + id); });
    out.etapas[id] = y;
  });
  Object.keys(t.gerais || {}).forEach(function (k) {
    if (CONV_CAMPOS_GERAIS.indexOf(k) < 0) throw new Error('Campo desconhecido: ' + k + '.');
    out.gerais[k] = convTexto_(t.gerais[k], 8000, 'Texto ' + k);
  });
  const json = JSON.stringify(out);
  if (json.length > 45000) throw new Error('Textos grandes demais.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const o = { id: cfg.id + '|' + mes, convenio: cfg.id, mes: mes, numero: numero, textos: json, usuario: admin, atualizadoEm: Date.now() };
    convGravar_('ConvRelatorios', o);
    return { ok: true, relatorio: { id: o.id, convenio: o.convenio, mes: mes, numero: numero, textos: out, usuario: admin, atualizadoEm: o.atualizadoEm } };
  } finally { lock.releaseLock(); }
}

/**
 * Apuração automática das etapas 1.4, 1.9 e 1.10 no intervalo [de, ate] (o painel pede [início da execução, fim do mês escolhido],
 * assim o acumulado nunca depende do período carregado nas outras abas). Devolve só contagens (por mês AAAA-MM e por município/BVA).
 */
function painelConvApuracao(token, req) {
  adminDoToken_(token);
  const cfg = convDe_(req.convenio), de = String(req.de || cfg.inicioExecucao), ate = String(req.ate || hojeManaus_());
  if (!diaValido_(de) || !diaValido_(ate) || de > ate) throw new Error('Período inválido.');
  if (somarDias_(de, 1100) < ate) throw new Error('Período longo demais.');
  return convApurar_(cfg, de, ate);
}
function convApurar_(cfg, de, ate) {
  const noPer = function (d) { d = String(d || '').slice(0, 10); return d >= de && d <= ate; };
  const mesDe = function (d) { return String(d).slice(0, 7); };
  const out = { ok: true, convenio: cfg.id, de: de, ate: ate, apuradoEm: Date.now(), etapas: {} };
  const etapas = function (ap) { return cfg.etapas.filter(function (e) { return e.apuracao === ap; }); };
  const munNorm = function (s) { return normPub_(s).replace(/ (am|amazonas)$/, ''); };
  let turnos = null, veicPorTurno = null, tfs = null;
  // turnos, veículos e TFs do MESMO motor do VIGIFITO e do Relatório GDV (motorBarreira_): os números nunca divergem
  const carregarBarreira = function () {
    if (turnos) return;
    const M = motorBarreira_(de, ate);
    turnos = M.turnos; tfs = M.tfs; veicPorTurno = {};
    turnos.forEach(function (t) { veicPorTurno[t.id] = t.veiculos; });
  };

  // 1.4 — levantamentos/termos de monilíase: municípios distintos e propriedades por município
  etapas('pce').forEach(function (e) {
    const termos = (e.pragas || []).map(normPub_).filter(Boolean);
    const casa = function (nome) { const n = normPub_(nome); return !!n && termos.some(function (t) { return n.indexOf(t) >= 0; }); };
    const M = {}, MES = {};
    const marcar = function (municipio, data, prop) {
      const k = munNorm(municipio); if (!k) return;
      const mes = mesDe(data);
      const m = M[k] = M[k] || { municipio: String(municipio).trim(), props: {}, registros: 0, primeiro: data, meses: {} };
      m.props[prop] = true; m.registros++; if (data < m.primeiro) m.primeiro = data;
      const mm = m.meses[mes] = m.meses[mes] || { props: {}, registros: 0 }; mm.props[prop] = true; mm.registros++;
      const g = MES[mes] = MES[mes] || { muns: {}, registros: 0, props: {} }; g.muns[k] = true; g.registros++; g.props[k + '|' + prop] = true;
    };
    const chaveLev = function (r) {
      const cod = String(r.codigoPropriedade || '').trim(), doc = digitos_(r.doc), prop = String(r.propriedade || '').trim();
      return normPub_(cod || (doc && prop ? doc + '|' + prop : '')) || 'lev:' + r.id;
    };
    lerLeitura_('Levantamentos').forEach(function (r) {
      if (!r.id || r.excluido === 1 || !noPer(r.data)) return;
      if (!pragasLev_(r).some(function (g) { return casa(g.praga); })) return;
      marcar(r.municipio, r.data, chaveLev(r));
    });
    const cadProp = {};
    lerLeitura_('CadastrosPCE').forEach(function (c) { if (c.id) cadProp[c.id] = c; });
    lerLeitura_('TermosPCE').forEach(function (r) {
      if (!r.id || r.excluido === 1 || r.cancelado === 1 || !noPer(r.data)) return;
      const pr = lerJSONSeguro_(r.pragas, []);
      if (!((Array.isArray(pr) && pr.some(casa)) || (!(Array.isArray(pr) && pr.length) && r.programa === 'moniliase'))) return;
      const cad = cadProp[r.cadastroId], doc = digitos_(r.doc);
      const k = normPub_(r.propriedadeId || (cad && cad.propriedadeId) || (doc && cad && cad.propriedade ? doc + '|' + cad.propriedade : '')) || 'termo:' + r.id;
      marcar(r.municipio, r.data, k);
    });
    const meses = {};
    Object.keys(MES).forEach(function (mes) {
      const g = MES[mes];
      meses[mes] = { municipios: Object.keys(g.muns).map(function (k) { return M[k].municipio; }).sort(), registros: g.registros, propriedades: Object.keys(g.props).length };
    });
    out.etapas[e.id] = { tipo: 'pce', meses: meses, porMunicipio: Object.keys(M).map(function (k) {
      const m = M[k], ms = {};
      Object.keys(m.meses).forEach(function (mes) { ms[mes] = { propriedades: Object.keys(m.meses[mes].props).length, registros: m.meses[mes].registros }; });
      return { municipio: m.municipio, propriedades: Object.keys(m.props).length, registros: m.registros, primeiro: m.primeiro, meses: ms };
    }).sort(function (a, b) { return a.municipio.localeCompare(b.municipio); }) };
  });

  // 1.9 — barreira volante nos municípios configurados
  etapas('volante').forEach(function (e) {
    carregarBarreira();
    const muns = (e.municipios || []).map(munNorm).filter(Boolean);
    const volante = function (t) { return t.tipo === 'volante'; };
    const munDo = function (t) {
      const u = munNorm(t.unidade), l = normPub_(t.local);
      for (let i = 0; i < muns.length; i++) if (u === muns[i] || (' ' + l + ' ').indexOf(' ' + muns[i] + ' ') >= 0) return e.municipios[i];
      return null;
    };
    const sel = {}, M = {}, MES = {};
    const z = function () { return { turnos: 0, veiculos: 0, tfs: 0, apreensoes: 0, rechacos: 0 }; };
    turnos.forEach(function (t) {
      if (!volante(t)) return;
      const mun = munDo(t); if (!mun) return;
      sel[t.id] = { mun: mun, mes: mesDe(t.data) };
      const m = M[mun] = M[mun] || { municipio: mun, total: z(), meses: {} }, g = MES[mesDe(t.data)] = MES[mesDe(t.data)] || z();
      const mm = m.meses[mesDe(t.data)] = m.meses[mesDe(t.data)] || z();
      [m.total, mm, g].forEach(function (x) { x.turnos++; x.veiculos += veicPorTurno[t.id] || 0; });
    });
    tfs.forEach(function (tf) {
      const s = sel[tf.turnoId]; if (!s) return;
      [M[s.mun].total, M[s.mun].meses[s.mes], MES[s.mes]].forEach(function (x) {
        x.tfs++; if (tf.procedimento === 'apreensao') x.apreensoes++; if (tf.procedimento === 'rechaco') x.rechacos++; });
    });
    out.etapas[e.id] = { tipo: 'volante', meses: MES, porMunicipio: Object.keys(M).map(function (k) { return M[k]; }) };
  });

  // 1.10 — BVAs fixas configuradas: veículos, TFs, apreensões e rechaços
  etapas('bva').forEach(function (e) {
    carregarBarreira();
    // a mesma BVA tem nomes diferentes no app de campo ("BVA - CEASA") e no cadastro de barreiras do TF ("Barreira Porto da CEASA",
    // sufixo "BVA - CEASA"): qualquer id/nome/sufixo/local do cadastro conta para a BVA marcada que bater com um deles
    const bvas = [], vistos = {};
    (e.bvas || []).forEach(function (b) { const n = normPub_(b); if (n && !vistos[n]) { vistos[n] = 1; bvas.push(b); } });
    const alvo = {}; bvas.forEach(function (b) { alvo[normPub_(b)] = b; });
    const cad = {}; lerLeitura_('Barreiras').forEach(function (b) { if (b.id) cad[b.id] = b; });
    Object.keys(cad).forEach(function (k) {
      const b = cad[k], nomes = [b.id, b.nome, b.sufixo, b.local].map(normPub_).filter(Boolean);
      const canon = nomes.map(function (n) { return alvo[n]; }).filter(Boolean)[0];
      if (canon) nomes.forEach(function (n) { alvo[n] = canon; });
    });
    const unicas = []; bvas.forEach(function (b) { if (alvo[normPub_(b)] === b) unicas.push(b); });   // marcadas duas vezes (apelidos): uma só
    bvas.length = 0; unicas.forEach(function (b) { bvas.push(b); });
    const qual = function () {
      for (let a = 0; a < arguments.length; a++) { const n = normPub_(arguments[a]); if (n && alvo[n]) return alvo[n]; }
      return null;
    };
    const sel = {}, B = {}, MES = {};
    const z = function () { return { turnos: 0, veiculos: 0, tfs: 0, apreensoes: 0, rechacos: 0 }; };
    bvas.forEach(function (b) { B[b] = { bva: b, total: z(), meses: {} }; });
    turnos.forEach(function (t) {
      if (t.tipo === 'volante') return;
      const b = qual(t.local, t.unidade); if (!b) return;
      const mes = mesDe(t.data); sel[t.id] = { b: b, mes: mes };
      const mm = B[b].meses[mes] = B[b].meses[mes] || z(), g = MES[mes] = MES[mes] || z();
      [B[b].total, mm, g].forEach(function (x) { x.turnos++; x.veiculos += veicPorTurno[t.id] || 0; });
    });
    tfs.forEach(function (tf) {
      const s = sel[tf.turnoId], c = cad[tf.barreira] || {};
      const b = s ? s.b : (tf.turnoId ? null : qual(tf.local, c.nome, c.sufixo, c.local, tf.barreira)); if (!b) return;
      const mes = s ? s.mes : mesDe(tf.data);
      const mm = B[b].meses[mes] = B[b].meses[mes] || z(), g = MES[mes] = MES[mes] || z();
      [B[b].total, mm, g].forEach(function (x) { x.tfs++; if (tf.procedimento === 'apreensao') x.apreensoes++; if (tf.procedimento === 'rechaco') x.rechacos++; });
    });
    out.etapas[e.id] = { tipo: 'bva', meses: MES, porBva: bvas.map(function (b) { return B[b]; }) };
  });
  return out;
}
