/**
 * GDV – Controle de Veículos (Barreira Fitossanitária)
 * API de sincronização: recebe registros do app (offline-first), grava na planilha
 * e devolve o que mudou desde a última sincronização.
 *
 * Acesso dos aparelhos (por fiscal):
 *   1. No menu "GDV" da planilha: "Gerar código de ativação" → informe o NOME COMPLETO do fiscal
 *      (ou no painel do administrador, aba "Servidores" → Gerar chave de ativação).
 *   2. O fiscal digita o código de 6 dígitos no app (uma vez). O servidor devolve uma credencial
 *      própria daquele aparelho, vinculada ao nome. Revogue em "GDV → Revogar acesso" (ou na aba Servidores).
 *
 * Módulos por servidor (aba "Permissoes", editada no painel → Servidores): Controle de veículos, TF de Barreira e PCE.
 *   Sem linha = tudo liberado. O sync não grava registros de módulo não liberado (devolve em "recusados"; o app os mantém
 *   pendentes) e as actions do TF/PCE respondem "Sem autorização para o módulo …".
 *
 * Opcional (compatibilidade): Propriedades do script → ACCESS_KEY = chave mestra (administrador).
 */

const TABELAS = {
  Turnos: ['id', 'numeroTF', 'data', 'letra', 'inicio', 'fim', 'fiscal', 'local', 'unidade', 'posto',
           'encerrado', 'criadoEm', 'atualizadoEm', 'srv_ts',
           'latIni', 'lngIni', 'precIni', 'latFim', 'lngFim', 'precFim', 'usuario', 'semPlaca'],   // colunas novas ficam sempre no fim (semPlaca=1: placa opcional no turno)
  Veiculos: ['id', 'turnoId', 'hora', 'placa', 'tipo', 'pessoas', 'obs',
             'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],
  Fiscais: ['nome', 'codigo', 'expiraEm', 'ativo', 'token', 'ativadoEm', 'perfil',   // perfil: vazio = fiscal, 'admin' = administrador
            'geradoPor'],                                                            // quem gerou o código: nome do administrador (painel) ou "planilha" (menu)
  // Termos de Fiscalização de Barreira (TF)
  TFs: ['id', 'barreira', 'ano', 'numero', 'numeroTxt', 'turnoId', 'veiculoId', 'data', 'hora', 'fiscal', 'local', 'placa', 'origem', 'destino',
        'doc', 'nome', 'rg', 'endereco', 'municipio', 'uf', 'telefone', 'relacao', 'inspecao', 'coleta', 'amostras',
        'procedimento', 'fiel', 'auto', 'advertencia', 'documentos', 'produtos', 'constatacao', 'enquadramento',
        'reincidente', 'tfsAnteriores', 'cancelado', 'motivoCancel', 'conflito', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
        'numeroSugerido', 'numeroOrigem', 'emitidoEm'],   // auditoria da numeração (colunas novas ficam sempre no fim)
  Pessoas: ['id', 'tipo', 'nome', 'rg', 'endereco', 'municipio', 'uf', 'telefone', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
            'email'],                                                                                                              // id = CPF/CNPJ (só dígitos)
  Placas: ['id', 'doc', 'nome', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],                                                    // id = placa
  Barreiras: ['id', 'nome', 'sufixo', 'local', 'ativo'],                                                                            // cadastro feito direto na planilha
  Numeracao: ['id', 'barreira', 'ano', 'ultimo', 'atualizadoEm'],                                                                    // ponto de partida definido pelo administrador (id = barreira|ano)
  Consultas: ['em', 'usuario', 'doc', 'placa', 'resultado'],
  // Módulo PCE: Levantamento fitossanitário e Termo de Colheita de Amostras
  Levantamentos: ['id', 'data', 'hora', 'servidor', 'cargo', 'matricula', 'lotacao', 'doc', 'nome', 'telefone', 'email',
                  'propriedade', 'codigoPropriedade', 'situacaoFundiaria', 'municipio', 'lat', 'lon', 'precisao',
                  'culturas', 'fotos', 'assinaturas', 'obs', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],
  Colheitas: ['id', 'unidade', 'ano', 'numero', 'numeroTxt', 'numeroSugerido', 'numeroOrigem', 'conflito', 'emitidoEm', 'levantamentoId',
              'data', 'hora', 'servidor', 'cargo', 'matricula', 'lotacao', 'municipio', 'doc', 'nome', 'endereco', 'lat', 'lon', 'precisao',
              'cultura', 'quantidade', 'analise', 'partes', 'descricao', 'fotos', 'testemunha1Nome', 'testemunha1Doc', 'testemunha2Nome',
              'testemunha2Doc', 'assinaturas', 'local', 'cancelado', 'motivoCancel', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],
  Propriedades: ['id', 'codigo', 'nome', 'doc', 'municipio', 'situacaoFundiaria', 'lat', 'lon', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],
  Arquivos: ['id', 'dono', 'donoId', 'tipo', 'papel', 'nome', 'mime', 'tamanho', 'driveId', 'url', 'usuario', 'criadoEm'],  // fotos/assinaturas no Drive
  // TF de Barreira em preenchimento no aparelho (alerta "apreensão em andamento" no painel). id = usuario|rascunhoId. Sem CPF/nome do fiscalizado.
  Andamento: ['id', 'usuario', 'fiscal', 'turnoId', 'placa', 'procedimento', 'local', 'barreira', 'lat', 'lon', 'estado', 'inicioTs', 'atualizadoTs'],
  // Módulos que cada servidor pode usar para INSERIR dados (por nome; vale para todos os aparelhos dele). 1 = liberado, 0 = sem autorização.
  // Servidor sem linha aqui = os três módulos liberados (padrão). Editada pelo painel (aba Servidores) ou à mão na planilha.
  Permissoes: ['nome', 'veiculos', 'tf', 'pce', 'atualizadoEm', 'atualizadoPor']
};
const CAMPOS_NUMERICOS = ['pessoas', 'encerrado', 'semPlaca', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts',
                          'expiraEm', 'ativo', 'ativadoEm',
                          'ano', 'numero', 'ultimo', 'de', 'ate', 'em', 'numeroSugerido', 'emitidoEm', 'amostras', 'inspecao', 'coleta', 'fiel', 'auto',
                          'advertencia', 'reincidente', 'tfsAnteriores', 'cancelado', 'conflito', 'tamanho',
                          'inicioTs', 'atualizadoTs'];   // lat/lon/precisao ficam como texto (como em Turnos)
const LIMITES_TEXTO = { constatacao: 3000, enquadramento: 3000, documentos: 2000, produtos: 3000, motivoCancel: 300,
                        culturas: 45000, descricao: 3000, fotos: 20000, assinaturas: 1000, obs: 2000 };   // demais colunas: 500
// culturas/fotos/assinaturas são JSON: cortar o texto invalidaria o JSON (e apagaria as referências no aparelho). Os limites acima
// cabem numa célula (50.000 caracteres) e o app limita a quantidade de culturas/fotos e o tamanho dos campos para nunca chegar neles.
const VALIDADE_CODIGO_MS = 7 * 24 * 3600 * 1000;      // código de ativação vale 7 dias
const MAX_FALHAS_ATIVACAO = 10;                        // tentativas erradas antes de bloquear por 15 min
const MAX_FALHAS_ADMIN = 5;                            // idem para o código de administrador do painel (contador próprio)
const MAX_LINHAS_POR_ENVIO = 2000;

function doGet(e) {
  if (e && e.parameter && e.parameter.p === 'painel') return painelHtml_();
  return json_({ ok: true, servico: 'GDV Controle de Veículos' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.action === 'ativar') return json_(ativar_({ codigo: req.codigo }));          // app dos fiscais: só códigos de fiscal
    if (req.action === 'painelAtivar') return json_(painelAtivar(req.codigo));             // painel (GitHub Pages): só códigos de administrador
    if (req.action === 'painelDados') return json_(painelDados(req.key, { de: req.de, ate: req.ate, aoVivo: req.aoVivo, ids: req.ids }));
    if (req.action === 'painelSair') return json_(painelSair(req.key));
    if (req.action === 'painelGerarCodigo') return json_(painelGerarCodigo(req.key, req.nome, req.modulos));
    if (req.action === 'painelAcessos') return json_(painelAcessos(req.key));
    if (req.action === 'painelRevogar') return json_(painelRevogar(req.key, req.nome));
    if (req.action === 'painelPermissoes') return json_(painelPermissoes(req.key, req.nome, req));
    const usuario = autenticar_(req.key);
    const modulo = MODULO_DA_ACAO[req.action];                                              // TF/PCE: o servidor confere a autorização do módulo
    if (modulo) exigirModulo_(usuario, modulo);
    if (req.action === 'ping') return json_({ ok: true, nome: usuario });
    if (req.action === 'sync') return json_(sincronizar_(req, usuario));
    if (req.action === 'tfConsultar') return json_(consultar_(req, usuario));
    if (req.action === 'tfProximoNumero') return json_(proximoNumero_(req));
    if (req.action === 'tfEmitir') return json_(emitir_(req, usuario));
    if (req.action === 'pceProximoNumero') return json_(pceProximoNumero_(req));
    if (req.action === 'pceEmitir') return json_(pceEmitir_(req, usuario));
    if (req.action === 'pceConsultar') return json_(pceConsultar_(req, usuario));
    if (req.action === 'arquivoEnviar') return json_(arquivoEnviar_(req, usuario));
    if (req.action === 'tfAndamento') return json_(tfAndamento_(req, usuario));
    throw new Error('Ação inválida.');
  } catch (err) {
    const r = { ok: false, erro: String(err.message || err) };
    if (err && err.semPermissao) { r.semPermissao = err.semPermissao; r.permissoes = err.permissoes; }   // o app atualiza as permissões guardadas
    return json_(r);
  }
}

function sincronizar_(req, usuario) {
  const turnos = lista_(req.turnos);
  const veiculos = lista_(req.veiculos);
  const tfs = lista_(req.tfs);
  const pessoas = lista_(req.pessoas);
  const placas = lista_(req.placas);
  const levantamentos = lista_(req.levantamentos);
  const colheitas = lista_(req.colheitas);
  const propriedades = lista_(req.propriedades);
  const since = Number(req.since) || 0;
  // Módulos sem autorização: os registros NÃO são gravados e voltam em "recusados" (o app os mantém pendentes no aparelho).
  // Pessoas (cadastro do fiscalizado/produtor) servem ao TF e ao PCE: entram se qualquer um dos dois estiver liberado.
  const perm = permissoesDe_(usuario), recusados = {};
  const filtrar = function (campo, regs, permitido) {
    if (permitido || !regs.length) return regs;
    recusados[campo] = regs.map(function (r) { return r && r.id ? String(r.id).slice(0, 64) : ''; }).filter(Boolean);
    return [];
  };
  const T = {
    turnos: filtrar('turnos', turnos, perm.veiculos), veiculos: filtrar('veiculos', veiculos, perm.veiculos),
    tfs: filtrar('tfs', tfs, perm.tf), placas: filtrar('placas', placas, perm.tf), pessoas: filtrar('pessoas', pessoas, perm.tf || perm.pce),
    levantamentos: filtrar('levantamentos', levantamentos, perm.pce), colheitas: filtrar('colheitas', colheitas, perm.pce),
    propriedades: filtrar('propriedades', propriedades, perm.pce)
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const agora = Date.now();
    gravar_('Turnos', T.turnos, agora, usuario);
    gravar_('Veiculos', T.veiculos, agora, usuario);
    T.tfs.forEach(function (t) { if (t && !t.emitidoEm) t.emitidoEm = agora; });            // momento em que a planilha recebeu o TF
    gravar_('TFs', T.tfs, agora, usuario);
    if (T.tfs.length) marcarConflitosTFs_(T.tfs, agora);
    gravar_('Pessoas', T.pessoas, agora, usuario);
    gravar_('Placas', T.placas, agora, usuario);
    gravar_('Levantamentos', T.levantamentos, agora, usuario);
    const jaGravadas = {};                                                            // termos que a planilha já tem: mantêm o emitidoEm gravado
    if (T.colheitas.length) lerLeitura_('Colheitas').forEach(function (l) { jaGravadas[l.id] = true; });
    T.colheitas.forEach(function (c) {
      if (!c) return;
      c.unidade = unidadePce_(c.unidade);
      if (!c.numeroTxt && Number(c.numero) > 0 && Number(c.ano) > 0) c.numeroTxt = numeroTxtPce_(Number(c.numero), Number(c.ano), c.unidade);
      if (!c.emitidoEm) {
        if (jaGravadas[c.id]) delete c.emitidoEm;                                       // reenvio (resposta perdida, cancelamento): não troca a data de emissão
        else c.emitidoEm = agora;                                                       // momento em que a planilha recebeu o termo
      }
    });
    gravar_('Colheitas', T.colheitas, agora, usuario);
    if (T.colheitas.length) marcarConflitos_('PCE', T.colheitas, agora);
    gravar_('Propriedades', T.propriedades, agora, usuario);
    return {
      ok: true,
      agora: agora,
      turnos: lerMudancas_('Turnos', since),
      veiculos: lerMudancas_('Veiculos', since),
      tfs: lerMudancas_('TFs', since, usuario),          // cada fiscal recebe só os próprios TFs
      barreiras: listarBarreiras_(),
      ultimos: ultimosPorBarreira_(),                   // último nº usado em cada barreira (ano atual): base para propor número sem internet
      levantamentos: lerMudancas_('Levantamentos', since, usuario),   // PCE: cada servidor recebe só os próprios registros
      colheitas: lerMudancas_('Colheitas', since, usuario),
      ultimosPce: ultimosPce_(),                        // último nº de Termo de Colheita por "UNIDADE|ano"
      permissoes: perm,                                 // módulos liberados para este servidor (o app guarda e esconde o que não pode)
      recusados: recusados                              // ids NÃO gravados por falta de autorização no módulo (ficam pendentes no aparelho)
    };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Termos de Fiscalização (TF): numeração, conflitos e reincidência ---------- */

function digitos_(v) { return String(v || '').replace(/\D/g, ''); }
function placaNorm_(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function listarBarreiras_() {
  const sh = aba_('Barreiras');
  if (sh.getLastRow() < 2) sh.getRange(2, 1, 1, 5).setValues([['BVA-CEASA', 'Barreira Porto da CEASA', 'BVA - CEASA', 'BR-319 PORTO DA CEASA', 1]]);
  return lerLeitura_('Barreiras').filter(function (b) { return b.id && b.ativo === 1; })
    .map(function (b) { return { id: b.id, nome: b.nome, sufixo: b.sufixo, local: b.local }; });
}

/**
 * Sequências numeradas. TF: uma por barreira/ano (aba TFs). PCE (Termo de Colheita): uma por unidade/ano (aba Colheitas).
 * Na aba Numeracao, o id é "barreira|ano" (TF, como sempre foi) ou "PCE|UNIDADE|ano"; a coluna "barreira" guarda a barreira ou a unidade.
 */
const SEQUENCIAS = {
  TF: { aba: 'TFs', grupo: 'barreira', prefixo: '', nome: 'TF' },
  PCE: { aba: 'Colheitas', grupo: 'unidade', prefixo: 'PCE|', nome: 'Termo de Colheita' }
};
function chaveSeq_(tipo, grupo, ano) { return SEQUENCIAS[tipo].prefixo + grupo + '|' + ano; }

/**
 * Numeração: UMA sequência por grupo (barreira ou unidade) e por ano, sem faixas reservadas. O "último usado" é o maior
 * número entre os registros gravados (inclusive cancelados, que mantêm o número) e o ponto de partida da aba Numeracao.
 */
function ultimoSeq_(tipo, grupo, ano, regs) {
  const s = SEQUENCIAS[tipo];
  let ultimo = 0, ref = null;
  const base = lerLeitura_('Numeracao').filter(function (r) { return r.id === chaveSeq_(tipo, grupo, ano); })[0];
  if (base) ultimo = base.ultimo;
  (regs || lerLeitura_(s.aba)).forEach(function (r) { if (r[s.grupo] === grupo && r.ano === ano && r.numero > ultimo) { ultimo = r.numero; ref = r; } });
  return { ultimo: ultimo, ref: ref };
}

function ultimoNumero_(barreira, ano, tfs) { return ultimoSeq_('TF', barreira, ano, tfs); }

function ultimosPorBarreira_() {
  const tfs = lerLeitura_('TFs'), ano = new Date().getFullYear(), o = {};
  listarBarreiras_().forEach(function (b) { o[b.id + '|' + ano] = ultimoNumero_(b.id, ano, tfs).ultimo; });
  return o;
}

/** "Qual é o próximo número?" – consulta rápida feita pelo app na hora de gerar o TF (não reserva nada). */
function proximoNumero_(req) {
  const barreira = String(req.barreira || '').slice(0, 64), ano = Number(req.ano) || new Date().getFullYear();
  if (!listarBarreiras_().some(function (b) { return b.id === barreira; })) throw new Error('Barreira desconhecida: ' + barreira);
  const u = ultimoNumero_(barreira, ano);
  return { ok: true, barreira: barreira, ano: ano, ultimo: u.ultimo, proximo: u.ultimo + 1,
           ultimoTF: u.ref ? { numeroTxt: u.ref.numeroTxt, data: u.ref.data, hora: u.ref.hora, usuario: u.ref.usuario } : null };
}

/**
 * Emissão: grava o TF só se o número ainda estiver livre (sob lock). Se outro fiscal usou o número nesse
 * intervalo, devolve emitido = false e o próximo livre, ANTES de qualquer impressão.
 */
function emitir_(req, usuario) {
  const tf = req.tf || {};
  const barreira = String(tf.barreira || ''), ano = Number(tf.ano) || 0, numero = Number(tf.numero) || 0;
  if (!tf.id || !barreira || !ano || numero < 1) throw new Error('Dados do TF incompletos.');
  if (!listarBarreiras_().some(function (b) { return b.id === barreira; })) throw new Error('Barreira desconhecida: ' + barreira);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const todos = lerLeitura_('TFs');
    const ocupante = todos.filter(function (r) { return r.barreira === barreira && r.ano === ano && r.numero === numero && r.id !== tf.id; })[0];
    if (ocupante) {
      const u = ultimoNumero_(barreira, ano, todos);
      return { ok: true, emitido: false, ocupadoPor: { numeroTxt: ocupante.numeroTxt, data: ocupante.data, hora: ocupante.hora, usuario: ocupante.usuario },
               ultimo: u.ultimo, proximo: u.ultimo + 1 };
    }
    const agora = Date.now(), antes = todos.filter(function (r) { return r.id === tf.id; })[0];
    tf.emitidoEm = (antes && antes.emitidoEm) || agora;                          // reenvio do mesmo TF não muda a data de emissão
    gravar_('TFs', [tf], agora, usuario);
    if (req.pessoa) gravar_('Pessoas', [req.pessoa], agora, usuario);
    if (req.placa) gravar_('Placas', [req.placa], agora, usuario);
    return { ok: true, emitido: true, numero: numero, emitidoEm: tf.emitidoEm, srv_ts: agora };
  } finally {
    lock.releaseLock();
  }
}

/** Auditoria da sequência de uma barreira (TF) ou unidade (PCE) / ano: lacunas e números usados mais de uma vez. */
function auditarSequencia_(barreira, ano, tipo) {
  tipo = tipo || 'TF';
  if (tipo === 'PCE') barreira = unidadePce_(barreira);
  return auditarRegs_(tipo, barreira, ano, lerLeitura_(SEQUENCIAS[tipo].aba), lerLeitura_('Numeracao'));
}

/** Número duplicado (mesmo grupo/ano): o registro mais antigo vale; os demais ficam com conflito = 1. */
function marcarConflitos_(tipo, recebidos, agora) {
  const s = SEQUENCIAS[tipo], ids = {};
  recebidos.forEach(function (r) { if (r && r.id) ids[r.id] = true; });
  const t = lerTudo_(s.aba), iC = t.cols.indexOf('conflito') + 1, iS = t.cols.indexOf('srv_ts') + 1, grupos = {};
  t.valores.forEach(function (l, i) {
    const o = paraObjeto_(t.cols, l);
    if (tipo !== 'TF' && !(o.numero > 0)) return;                       // termo sem número não entra em conflito (TF: comportamento original)
    const k = o[s.grupo] + '|' + o.ano + '|' + o.numero;
    (grupos[k] = grupos[k] || []).push({ i: i, o: o });
  });
  Object.keys(grupos).forEach(function (k) {
    const g = grupos[k];
    if (!g.some(function (x) { return ids[x.o.id]; })) return;
    g.sort(function (a, b) { return a.o.criadoEm - b.o.criadoEm || String(a.o.id).localeCompare(String(b.o.id)); });
    g.forEach(function (x, n) {
      const quer = g.length > 1 && n > 0 ? 1 : 0;
      if (x.o.conflito !== quer) { t.sh.getRange(x.i + 2, iC).setValue(quer); t.sh.getRange(x.i + 2, iS).setValue(agora); }
    });
  });
}

function marcarConflitosTFs_(recebidos, agora) { marcarConflitos_('TF', recebidos, agora); }

/** Define o ponto de partida (último nº já usado) de uma barreira (TF) ou unidade (PCE) / ano, ex.: ao começar no meio do ano. */
function definirSequencia_(barreira, ano, ultimo, tipo) {
  tipo = tipo || 'TF';
  if (tipo === 'PCE' && (!(Number(ano) > 2000) || !(Number(ultimo) >= 0))) throw new Error('Ano ou número inválido.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (tipo === 'PCE') {
      barreira = unidadePce_(barreira);
      if (!barreira) throw new Error('Informe a unidade.');
    } else if (!listarBarreiras_().some(function (b) { return b.id === barreira; })) throw new Error('Barreira desconhecida: ' + barreira);
    const t = lerTudo_('Numeracao'), id = chaveSeq_(tipo, barreira, ano);
    let idx = -1;
    t.valores.forEach(function (l, i) { if (String(l[0]) === id) idx = i; });
    const linha = [[id, barreira, Number(ano), Number(ultimo), Date.now()]];
    if (idx >= 0) t.sh.getRange(idx + 2, 1, 1, 5).setValues(linha); else t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, 5).setValues(linha);
    return Number(ultimo);
  } finally { lock.releaseLock(); }
}

function resumoTFs_(rows) {
  const r = { total: rows.length, liberacoes: 0, apreensoes: 0, rechacos: 0, autos: 0, advertencias: 0, ultimos: [] };
  rows.forEach(function (x) {
    if (x.procedimento === 'liberacao') r.liberacoes++; else if (x.procedimento === 'apreensao') r.apreensoes++; else if (x.procedimento === 'rechaco') r.rechacos++;
    if (x.auto === 1) r.autos++; if (x.advertencia === 1) r.advertencias++;
  });
  r.ultimos = rows.slice().sort(function (a, b) { return String(b.data + b.hora).localeCompare(String(a.data + a.hora)); }).slice(0, 5)
    .map(function (x) { return { numeroTxt: x.numeroTxt, data: x.data, procedimento: x.procedimento, placa: x.placa, produtos: x.produtos }; });
  r.reincidente = r.apreensoes + r.rechacos + r.autos >= 1;      // houve medida anterior (apreensão, rechaço ou auto de infração)
  return r;
}

/** Cadastro + histórico (reincidência) por CPF/CNPJ e por placa. */
function consultar_(req, usuario) {
  const doc = digitos_(req.doc), placa = placaNorm_(req.placa);
  if (doc.length !== 11 && doc.length !== 14 && placa.length < 7) throw new Error('Informe um CPF/CNPJ completo ou uma placa.');
  const pessoa = doc ? lerLeitura_('Pessoas').filter(function (p) { return p.id === doc; })[0] : null;
  const pl = placa ? lerLeitura_('Placas').filter(function (p) { return p.id === placa; })[0] : null;
  const tfs = lerLeitura_('TFs').filter(function (t) { return t.cancelado !== 1; });
  const porDoc = doc ? resumoTFs_(tfs.filter(function (t) { return digitos_(t.doc) === doc; })) : null;
  const porPlaca = placa ? resumoTFs_(tfs.filter(function (t) { return placaNorm_(t.placa) === placa; })) : null;
  const mask = doc ? doc.slice(0, 3) + '***' + doc.slice(-2) : '';
  const c = aba_('Consultas');
  c.getRange(c.getLastRow() + 1, 1, 1, 5).setValues([[Date.now(), usuario, mask, placa, (pessoa || (porDoc && porDoc.total)) ? 'encontrado' : 'novo']]);
  return {
    ok: true,
    pessoa: pessoa ? { id: pessoa.id, tipo: pessoa.tipo, nome: pessoa.nome, rg: pessoa.rg, endereco: pessoa.endereco, municipio: pessoa.municipio, uf: pessoa.uf, telefone: pessoa.telefone } : null,
    placa: pl ? { id: pl.id, doc: pl.doc, nome: pl.nome } : null,
    historicoDoc: porDoc, historicoPlaca: porPlaca
  };
}

/* ---------- TF em preenchimento (sinal ao vivo para o painel) ---------- */

const ANDAMENTO_VALIDADE_MS = 10 * 60 * 1000;   // sem batimento (o app manda a cada 2 min) há mais de 10 min = encerrado
const PROCEDIMENTOS_TF = ['liberacao', 'apreensao', 'rechaco'];

/**
 * O app avisa que um TF está sendo preenchido (estado "preenchendo": ao abrir o formulário, ao mudar procedimento/placa e a cada 2 min)
 * ou que deixou de estar ("fim": gerado, descartado ou o fiscal saiu do formulário). Upsert por usuario|rascunhoId (melhor esforço:
 * sem internet o app não envia nada). Grava só o necessário para o alerta: placa, procedimento, local/barreira e coordenada.
 */
function tfAndamento_(req, usuario) {
  const estado = String(req.estado || ''), rid = String(req.rascunhoId || '');
  if (estado !== 'preenchendo' && estado !== 'fim') throw new Error('Estado inválido.');
  if (!/^[\w-]{1,64}$/.test(rid)) throw new Error('Rascunho inválido.');
  const id = (usuario + '|' + rid).slice(0, 160), txt = function (v, n) { return String(v === null || v === undefined ? '' : v).trim().slice(0, n || 120); };
  const coord = function (v, lim) { const n = numOuNulo_(v); return n !== null && Math.abs(n) <= lim ? String(n) : ''; };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Andamento'), agora = Date.now();
    let idx = -1;
    t.valores.forEach(function (l, i) { if (String(l[0]) === id) idx = i; });
    const antes = idx >= 0 ? paraObjeto_(t.cols, t.valores[idx]) : null;
    if (estado === 'fim' && !antes) return { ok: true };                         // nada em andamento para encerrar
    let o;
    if (estado === 'fim') o = Object.assign({}, antes, { estado: 'fim', atualizadoTs: agora });
    else {
      const lat = coord(req.lat, 90), lon = coord(req.lon, 180), temGps = lat !== '' && lon !== '';
      const continua = antes && antes.estado === 'preenchendo' && agora - antes.atualizadoTs <= ANDAMENTO_VALIDADE_MS;
      o = { id: id, usuario: usuario, fiscal: usuario, turnoId: txt(req.turnoId, 64), placa: placaNorm_(req.placa).slice(0, 8),
            procedimento: PROCEDIMENTOS_TF.indexOf(req.procedimento) >= 0 ? req.procedimento : '', local: txt(req.local), barreira: txt(req.barreira),
            lat: temGps ? lat : (antes ? antes.lat : ''), lon: temGps ? lon : (antes ? antes.lon : ''), estado: 'preenchendo',
            inicioTs: continua ? antes.inicioTs : agora, atualizadoTs: agora };
    }
    const linha = [t.cols.map(function (c) { return o[c] === undefined || o[c] === null ? '' : o[c]; })];
    if (idx >= 0) t.sh.getRange(idx + 2, 1, 1, t.cols.length).setValues(linha);
    else t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length).setValues(linha);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** TFs em preenchimento agora (estado "preenchendo" com batimento nos últimos 10 min), para o painel. */
function tfsAndamento_(agora) {
  return lerLeitura_('Andamento').filter(function (a) { return a.id && a.estado === 'preenchendo' && agora - a.atualizadoTs <= ANDAMENTO_VALIDADE_MS; })
    .map(function (a) {
      return { id: a.id, usuario: a.usuario, fiscal: a.fiscal, turnoId: a.turnoId, placa: a.placa, procedimento: a.procedimento, local: a.local,
               barreira: a.barreira, lat: numOuNulo_(a.lat), lon: numOuNulo_(a.lon), inicioTs: a.inicioTs, atualizadoTs: a.atualizadoTs };
    });
}

/* ---------- PCE: Termo de Colheita de Amostras (numeração), consulta e arquivos ---------- */

/** Unidade da numeração do Termo de Colheita: sem espaços sobrando e em MAIÚSCULAS (ex.: "MANAUS"). */
function unidadePce_(v) { return String(v || '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 64); }

/** "NNN/AAAA/UNIDADE" (3 dígitos). */
function numeroTxtPce_(numero, ano, unidade) { return String(numero).padStart(3, '0') + '/' + ano + '/' + unidade; }

/** Último nº usado por "UNIDADE|ano" (todas as unidades/anos já vistos): base para propor número sem internet. */
function ultimosPce_() {
  const regs = lerLeitura_('Colheitas'), o = {};
  regs.forEach(function (r) {
    if (!r.unidade || !r.ano) return;
    const k = r.unidade + '|' + r.ano;
    o[k] = Math.max(o[k] || 0, r.numero);
  });
  lerLeitura_('Numeracao').forEach(function (r) {
    if (String(r.id).indexOf(SEQUENCIAS.PCE.prefixo) !== 0 || !r.barreira || !r.ano) return;
    const k = r.barreira + '|' + r.ano;
    o[k] = Math.max(o[k] || 0, r.ultimo);
  });
  return o;
}

/** "Qual é o próximo número?" – consulta rápida antes de gerar o termo (não reserva nada). */
function pceProximoNumero_(req) {
  const unidade = unidadePce_(req.unidade), ano = Number(req.ano) || new Date().getFullYear();
  if (!unidade) throw new Error('Informe a unidade.');
  const u = ultimoSeq_('PCE', unidade, ano);
  return { ok: true, unidade: unidade, ano: ano, ultimo: u.ultimo, proximo: u.ultimo + 1,
           ultimoTermo: u.ref ? { numeroTxt: u.ref.numeroTxt, data: u.ref.data, hora: u.ref.hora, usuario: u.ref.usuario } : null };
}

/** Emissão do Termo de Colheita: grava só se o número ainda estiver livre (sob lock), como no TF. */
function pceEmitir_(req, usuario) {
  const c = req.colheita || {};
  c.unidade = unidadePce_(c.unidade);
  const unidade = c.unidade, ano = Number(c.ano) || 0, numero = Number(c.numero) || 0;
  if (!c.id || !unidade || !ano || numero < 1) throw new Error('Dados do Termo de Colheita incompletos.');
  if (!c.numeroTxt) c.numeroTxt = numeroTxtPce_(numero, ano, unidade);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const todos = lerLeitura_('Colheitas');
    const ocupante = todos.filter(function (r) { return r.unidade === unidade && r.ano === ano && r.numero === numero && r.id !== c.id; })[0];
    if (ocupante) {
      const u = ultimoSeq_('PCE', unidade, ano, todos);
      return { ok: true, emitido: false, ocupadoPor: { numeroTxt: ocupante.numeroTxt, data: ocupante.data, hora: ocupante.hora, usuario: ocupante.usuario },
               ultimo: u.ultimo, proximo: u.ultimo + 1 };
    }
    const agora = Date.now(), antes = todos.filter(function (r) { return r.id === c.id; })[0];
    c.emitidoEm = (antes && antes.emitidoEm) || agora;                            // reenvio do mesmo termo não muda a data de emissão
    gravar_('Colheitas', [c], agora, usuario);
    if (req.pessoa) gravar_('Pessoas', [req.pessoa], agora, usuario);
    if (req.propriedade) gravar_('Propriedades', [req.propriedade], agora, usuario);
    return { ok: true, emitido: true, numero: numero, numeroTxt: c.numeroTxt, emitidoEm: c.emitidoEm, srv_ts: agora };
  } finally {
    lock.releaseLock();
  }
}

/** Cadastro do produtor (pessoa + propriedades) e quantos levantamentos/termos já existem para o CPF/CNPJ. */
function pceConsultar_(req, usuario) {
  const doc = digitos_(req.doc);
  if (doc.length !== 11 && doc.length !== 14) throw new Error('Informe um CPF/CNPJ completo.');
  const pessoa = lerLeitura_('Pessoas').filter(function (p) { return p.id === doc; })[0];
  const propriedades = lerLeitura_('Propriedades').filter(function (p) { return digitos_(p.doc) === doc; })
    .map(function (p) { return { id: p.id, codigo: p.codigo, nome: p.nome, doc: p.doc, municipio: p.municipio, situacaoFundiaria: p.situacaoFundiaria, lat: p.lat, lon: p.lon }; });
  const levantamentos = lerLeitura_('Levantamentos').filter(function (r) { return digitos_(r.doc) === doc && r.excluido !== 1; }).length;
  const colheitas = lerLeitura_('Colheitas').filter(function (r) { return digitos_(r.doc) === doc && r.excluido !== 1 && r.cancelado !== 1; }).length;
  const achou = pessoa || propriedades.length || levantamentos || colheitas;
  const c = aba_('Consultas');
  c.getRange(c.getLastRow() + 1, 1, 1, 5).setValues([[Date.now(), usuario, doc.slice(0, 3) + '***' + doc.slice(-2), '', achou ? 'PCE: encontrado' : 'PCE: novo']]);
  return {
    ok: true,
    pessoa: pessoa ? { id: pessoa.id, tipo: pessoa.tipo, nome: pessoa.nome, rg: pessoa.rg, endereco: pessoa.endereco, municipio: pessoa.municipio,
                       uf: pessoa.uf, telefone: pessoa.telefone, email: pessoa.email } : null,
    propriedades: propriedades, levantamentos: levantamentos, colheitas: colheitas
  };
}

const ARQ_MIMES = { 'image/jpeg': 'jpg', 'image/png': 'png' };
const ARQ_MAX_BYTES = 4 * 1024 * 1024;
const ARQ_RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Subpasta com esse nome dentro de "pai" (cria se não existir). */
function subpasta_(pai, nome) {
  const it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

/** Pasta "GDV - Arquivos" (id guardado em PASTA_ARQUIVOS nas propriedades do script; recriada se sumir). */
function pastaArquivos_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('PASTA_ARQUIVOS');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* pasta apagada ou sem acesso: cria outra */ }
  }
  const nova = DriveApp.createFolder('GDV - Arquivos');
  props.setProperty('PASTA_ARQUIVOS', nova.getId());
  return nova;
}

/**
 * Recebe UMA foto/assinatura (base64 sem o prefixo "data:") e grava no Drive, em GDV - Arquivos/PCE/<ano>/<dono>.
 * Idempotente pelo id: reenvio do mesmo arquivo devolve o registro já gravado. Os arquivos NÃO são compartilhados.
 */
function arquivoEnviar_(req, usuario) {
  const a = req.arquivo || {};
  const id = String(a.id || ''), dono = String(a.dono || ''), donoId = String(a.donoId || ''), tipo = String(a.tipo || '');
  const papel = String(a.papel || ''), mime = String(a.mime || '');
  if (!ARQ_RE_UUID.test(id)) throw new Error('Identificador de arquivo inválido.');
  if (dono !== 'levantamentos' && dono !== 'colheitas') throw new Error('Arquivo sem registro de origem válido.');
  if (!donoId || donoId.length > 64) throw new Error('Arquivo sem registro de origem válido.');
  if (tipo !== 'foto' && tipo !== 'assinatura') throw new Error('Tipo de arquivo inválido.');
  if (['', 'servidor', 'produtor', 'testemunha1', 'testemunha2'].indexOf(papel) < 0) throw new Error('Papel da assinatura inválido.');
  if (!ARQ_MIMES[mime]) throw new Error('Formato não aceito (somente JPEG ou PNG).');

  const existente = function () { return lerLeitura_('Arquivos').filter(function (r) { return r.id === id; })[0]; };
  const resposta = function (r) { return { ok: true, id: r.id, url: r.url, driveId: r.driveId, existente: true }; };
  const ja = existente();
  if (ja) return resposta(ja);

  const b64 = String(req.base64 || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  if (!b64 || b64.length > Math.ceil(ARQ_MAX_BYTES / 3) * 4 + 4) throw new Error('Arquivo vazio ou maior que 4 MB.');
  let bytes;
  try { bytes = Utilities.base64Decode(b64); } catch (e) { throw new Error('Arquivo corrompido (base64 inválido).'); }
  if (!bytes.length || bytes.length > ARQ_MAX_BYTES) throw new Error('Arquivo vazio ou maior que 4 MB.');
  const b = function (i) { return bytes[i] & 0xff; };
  const jpeg = b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
  const png = b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47;
  if ((mime === 'image/jpeg' && !jpeg) || (mime === 'image/png' && !png)) throw new Error('O conteúdo do arquivo não corresponde ao formato informado.');

  const ano = String(new Date().getFullYear());
  const lock = LockService.getScriptLock();
  let pasta, n;
  lock.waitLock(30000);
  try {                                                                     // pastas e numeração do nome sob lock (sem duplicar pastas)
    pasta = subpasta_(subpasta_(subpasta_(pastaArquivos_(), 'PCE'), ano), dono);
    n = lerLeitura_('Arquivos').filter(function (r) { return r.dono === dono && r.donoId === donoId && r.tipo === tipo; }).length + 1;
  } finally { lock.releaseLock(); }

  const seguro = function (v) { return String(v).replace(/[^A-Za-z0-9_-]/g, '-'); };
  const nome = seguro(donoId) + '_' + tipo + '_' + (papel || n) + '_' + id + '.' + ARQ_MIMES[mime];
  const arq = pasta.createFile(Utilities.newBlob(bytes, mime, nome));      // privado: herda o acesso da pasta (somente o dono da planilha)

  let gravado = false;
  try {
    lock.waitLock(30000);
    try {
      const outro = existente();                                            // envio duplicado simultâneo: fica o primeiro
      if (outro) return resposta(outro);
      const sh = aba_('Arquivos'), cols = TABELAS.Arquivos;
      const reg = { id: id, dono: dono, donoId: donoId, tipo: tipo, papel: papel, nome: nome, mime: mime, tamanho: bytes.length,
                    driveId: arq.getId(), url: arq.getUrl(), usuario: usuario, criadoEm: Date.now() };
      sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length).setValues([cols.map(function (c) { return reg[c]; })]);
      gravado = true;
      return { ok: true, id: id, url: reg.url, driveId: reg.driveId, existente: false };
    } finally { lock.releaseLock(); }
  } finally {
    // sem linha em Arquivos (duplicado, trava ocupada, erro ao gravar): o arquivo vai para a lixeira, sem deixar cópia órfã no Drive
    if (!gravado) { try { arq.setTrashed(true); } catch (e) { /* segue com o erro original */ } }
  }
}

/* ---------- Painel do administrador (somente leitura) ---------- */

/**
 * O painel é uma página do GitHub Pages (mesmo site do app): web/painel/ (app separado "GDV Painel"). Ela chama esta API (doPost) com:
 *   painelAtivar {codigo}            → troca um código de ADMINISTRADOR (6 dígitos, uso único) por {ok, token, nome}
 *   painelDados  {key, de, ate}      → dados do período, já sem dados pessoais desnecessários (documentos mascarados)
 *   painelDados  {key, aoVivo:true, ids:[...]} → só os turnos em andamento (e os de "ids", para saber se encerraram) com seus veículos
 *                                       (atualização automática de 1 em 1 minuto, sem reler TFs, levantamentos e termos)
 *   As duas formas de painelDados trazem também tfsAndamento: TFs sendo preenchidos agora nos aparelhos (aba Andamento).
 *   painelSair   {key}               → revoga a credencial do administrador (botão Sair)
 *   painelGerarCodigo {key, nome}    → gera um código de ativação de FISCAL (aba Servidores): {ok, nome, codigo, expiraEm}
 *   painelAcessos {key}              → lista dos acessos (situação, datas, quem gerou; sem credenciais; código só enquanto aguarda ativação)
 *   painelRevogar {key, nome}        → revoga os acessos de FISCAL com esse nome (administradores só pelo menu da planilha)
 *   painelPermissoes {key, nome, veiculos, tf, pce} → módulos em que o FISCAL pode inserir dados (aba Permissoes; pelo menos um)
 *   painelGerarCodigo aceita também modulos:{veiculos, tf, pce} (gravados junto); painelAcessos devolve permissoes de cada fiscal.
 * O código é gerado no menu da planilha: GDV → Gerar código de administrador. Credenciais de fiscais não leem o painel,
 * e códigos de administrador não ativam aparelhos de fiscais. A rota antiga "?p=painel" só mostra o novo endereço.
 */
const PAINEL_URL_PADRAO = 'https://evilasionogueiraagro-netizen.github.io/GDV/painel/';
const PAINEL_MAX_DIAS = 366;                 // período máximo de uma consulta
const PAINEL_MAX_REGISTROS = 60000;          // turnos + veículos + TFs + levantamentos + termos devolvidos numa resposta
const PAINEL_MAX_LACUNAS = 200;              // lacunas listadas por sequência na auditoria (o total vem em lacunasTotal)

/** Endereço do painel (Propriedades do script → PAINEL_URL troca o padrão, ex.: outro domínio). */
function painelUrl_() {
  return PropertiesService.getScriptProperties().getProperty('PAINEL_URL') || PAINEL_URL_PADRAO;
}

/** Rota antiga (<URL /exec>?p=painel): página mínima que só aponta para o novo painel. */
function painelHtml_() {
  const url = painelUrl_().replace(/[<>"'&]/g, '');
  const out = HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 16px;line-height:1.5">' +
    '<h2>GDV – Painel gerencial</h2><p>O painel do administrador mudou de endereço:</p>' +
    '<p><a href="' + url + '" target="_blank" rel="noopener" style="font-size:1.1rem">' + url + '</a></p>' +
    '<p>Abra o link, digite o código de administrador (GDV → Gerar código de administrador, na planilha) e salve o endereço nos favoritos.</p></div>')
    .setTitle('GDV – Painel gerencial');
  return out.addMetaTag ? out.addMetaTag('viewport', 'width=device-width, initial-scale=1') : out;
}

/**
 * Valida a credencial do painel e devolve o nome do administrador.
 * Aceita a chave mestra (ACCESS_KEY) e credenciais de perfil "admin"; credencial de fiscal recebe "Acesso restrito".
 */
function adminDoToken_(token) {
  token = String(token || '');
  if (token) {
    const mestra = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
    if (mestra && token === mestra) return 'Administrador';
    const t = lerLeitura_('Fiscais');
    for (let i = 0; i < t.length; i++) {
      if (t[i].token !== token || t[i].ativo !== 1) continue;
      if (t[i].perfil === 'admin') return t[i].nome;
      throw new Error('Acesso restrito ao administrador. Entre com um código de administrador (GDV → Gerar código de administrador).');
    }
  }
  throw new Error('Sessão do painel inválida ou revogada. Entre com um código de administrador.');
}

/** Botão "Sair" do painel: revoga a credencial de administrador no servidor (a cópia local deixa de valer em qualquer lugar). */
function painelSair(token) {
  token = String(token || '');
  const mestra = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  if (!token || (mestra && token === mestra)) return { ok: true };            // chave mestra não é revogada por aqui
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais');
    for (let i = 0; i < t.valores.length; i++) {
      const f = paraObjeto_(t.cols, t.valores[i]);
      if (!f.token || f.token !== token || f.perfil !== 'admin') continue;    // só credencial de administrador
      f.token = ''; f.ativo = 0;
      t.sh.getRange(i + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return f[c]; })]);
      break;
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Aba "Servidores" do painel: chaves de ativação dos fiscais ---------- */

const NOME_SERVIDOR_MAX = 80;
const RE_NOME_SERVIDOR_ = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’.\- ]*$/;   // letras, espaço, apóstrofo, ponto e hífen (nada de fórmula)
function nomeChave_(v) { return String(v || '').trim().replace(/\s+/g, ' ').toLowerCase(); }

/** Nome completo do servidor digitado no painel: espaços normalizados, nome e sobrenome, só letras e pontuação de nome. */
function nomeServidor_(v) {
  const nome = String(v || '').trim().replace(/\s+/g, ' ');
  if (!nome) throw new Error('Informe o nome completo do servidor.');
  if (nome.length > NOME_SERVIDOR_MAX) throw new Error('Nome longo demais (máximo de ' + NOME_SERVIDOR_MAX + ' caracteres).');
  if (!RE_NOME_SERVIDOR_.test(nome)) throw new Error('Use só letras no nome (sem números ou símbolos).');
  if (nome.split(' ').filter(function (p) { return /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(p); }).length < 2) throw new Error('Informe o nome completo (nome e sobrenome).');
  return nome;
}

/**
 * Painel → "Gerar chave de ativação": código de FISCAL (uso único, 7 dias). Códigos de administrador continuam só pelo menu da planilha.
 * modulos (opcional) {veiculos, tf, pce}: módulos liberados para o servidor, gravados junto (aba Permissoes; pelo menos um).
 */
function painelGerarCodigo(token, nome, modulos) {
  const admin = adminDoToken_(token);
  const n = nomeServidor_(nome);
  const perm = modulos === undefined || modulos === null ? null : modulosValidos_(modulos);   // valida ANTES de gerar o código
  const g = gerarCodigo_(n, 'fiscal', admin);
  const r = { ok: true, nome: g.nome, codigo: g.codigo, expiraEm: g.expiraEm };
  if (perm) r.permissoes = gravarPermissoes_(g.nome, perm, admin);
  return r;
}

/* ---------- Módulos autorizados por servidor (aba Permissoes) ---------- */

const MODULOS = ['veiculos', 'tf', 'pce'];
const NOME_MODULO = { veiculos: 'Controle de veículos', tf: 'TF de Barreira', pce: 'PCE' };
// actions do app que pertencem a um módulo (o servidor recusa se o módulo não estiver liberado para quem chama)
const MODULO_DA_ACAO = { tfConsultar: 'tf', tfProximoNumero: 'tf', tfEmitir: 'tf', tfAndamento: 'tf',
                         pceProximoNumero: 'pce', pceEmitir: 'pce', pceConsultar: 'pce', arquivoEnviar: 'pce' };
const tudoLiberado_ = function () { return { veiculos: 1, tf: 1, pce: 1 }; };

/** Célula da aba Permissoes → 0/1. Vazio ou qualquer outro valor = liberado (só "0", "não", "false" bloqueiam). */
function moduloLiberado_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return s === '0' || s === 'false' || s === 'não' || s === 'nao' || s === 'n' ? 0 : 1;
}

/** Mapa nome normalizado → {veiculos, tf, pce} (linhas repetidas: vale a última). */
function mapaPermissoes_() {
  const m = {};
  lerLeitura_('Permissoes').forEach(function (r) {
    const k = nomeChave_(r.nome);
    if (k) m[k] = { veiculos: moduloLiberado_(r.veiculos), tf: moduloLiberado_(r.tf), pce: moduloLiberado_(r.pce) };
  });
  return m;
}

/** Módulos liberados para um usuário (nome do fiscal). Sem linha na aba = tudo liberado; chave mestra = tudo liberado. */
function permissoesDe_(usuario, mapa) {
  if (!usuario || usuario === 'Administrador') return tudoLiberado_();
  return (mapa || mapaPermissoes_())[nomeChave_(usuario)] || tudoLiberado_();
}

/** Recusa a ação de um módulo não liberado. A mensagem não fala em "revogado"/"inválido" (o app trataria como acesso revogado). */
function exigirModulo_(usuario, modulo) {
  const perm = permissoesDe_(usuario);
  if (perm[modulo]) return perm;
  const e = new Error('Sem autorização para o módulo ' + NOME_MODULO[modulo] + '. Fale com a gerência.');
  e.semPermissao = modulo; e.permissoes = perm;
  throw e;
}

/** {veiculos, tf, pce} vindos do painel → 0/1, com pelo menos um módulo marcado. */
function modulosValidos_(m) {
  if (!m || typeof m !== 'object') throw new Error('Informe os módulos do servidor.');
  const o = {};
  MODULOS.forEach(function (k) { const v = m[k]; o[k] = v === true || v === 1 || v === '1' ? 1 : 0; });
  if (!o.veiculos && !o.tf && !o.pce) throw new Error('Marque pelo menos um módulo. Para tirar todo o acesso do servidor, use o botão Revogar.');
  return o;
}

/** Grava (ou atualiza) a linha do servidor na aba Permissoes, sob lock. Devolve {veiculos, tf, pce, atualizadoEm, atualizadoPor}. */
function gravarPermissoes_(nome, perm, autor) {
  const chave = nomeChave_(nome);
  const quem = String(autor || 'planilha').replace(/^[=+\-@\s]+/, '').slice(0, 120) || 'planilha';   // texto, nunca fórmula
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Permissoes'), agora = Date.now();
    let idx = -1;
    t.valores.forEach(function (l, i) { if (nomeChave_(l[0]) === chave) idx = i; });
    const o = { nome: idx >= 0 ? String(t.valores[idx][0]) : String(nome).replace(/^[=+\-@\s]+/, ''), veiculos: perm.veiculos, tf: perm.tf, pce: perm.pce,
                atualizadoEm: agora, atualizadoPor: quem };
    const linha = [t.cols.map(function (c) { return o[c]; })];
    if (idx >= 0) t.sh.getRange(idx + 2, 1, 1, t.cols.length).setValues(linha);
    else t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length).setValues(linha);
    return { veiculos: o.veiculos, tf: o.tf, pce: o.pce, atualizadoEm: agora, atualizadoPor: quem };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Painel → aba Servidores → caixas "Veículos / TF / PCE": módulos em que o servidor pode inserir dados (por nome, todos os aparelhos).
 * Só administrador. O servidor precisa existir na aba Fiscais (como fiscal). Pelo menos um módulo; para bloquear tudo, Revogar.
 */
function painelPermissoes(token, nome, req) {
  const admin = adminDoToken_(token);
  nome = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, NOME_SERVIDOR_MAX + 20);
  if (!nome) throw new Error('Informe o nome do servidor.');
  const perm = modulosValidos_(req && req.modulos ? req.modulos : req);
  const linhas = lerLeitura_('Fiscais').filter(function (f) { return nomeChave_(f.nome) === nomeChave_(nome); });
  const fiscal = linhas.filter(function (f) { return f.perfil !== 'admin'; })[0];
  if (!fiscal) {
    if (linhas.length) throw new Error('Administrador não tem restrição de módulos.');
    throw new Error('Servidor não encontrado na lista de acessos.');
  }
  const g = gravarPermissoes_(fiscal.nome, perm, admin);
  return { ok: true, nome: fiscal.nome, permissoes: { veiculos: g.veiculos, tf: g.tf, pce: g.pce }, atualizadoEm: g.atualizadoEm, atualizadoPor: g.atualizadoPor };
}

/**
 * Situação de uma linha da aba Fiscais: revogado (ativo ≠ 1), ativo (aparelho/painel com credencial), aguardando (código válido
 * ainda não usado) ou vencido (código não usado que passou da validade).
 */
function situacaoAcesso_(f, agora) {
  if (f.ativo !== 1) return 'revogado';
  if (f.token) return 'ativo';
  if (f.codigo !== '' && f.expiraEm > agora) return 'aguardando';
  return f.codigo !== '' ? 'vencido' : 'revogado';
}

/**
 * Lista dos acessos para o painel. Nunca devolve credencial (token). O código só vai para fiscal aguardando ativação (para reenviar).
 * Administradores entram só com nome e situação. "criadoEm" = validade − 7 dias (o código sempre nasce com 7 dias).
 */
function painelAcessos(token) {
  adminDoToken_(token);
  const agora = Date.now(), mapa = mapaPermissoes_();
  const lista = lerLeitura_('Fiscais').filter(function (f) { return f.nome; }).map(function (f) {
    const situacao = situacaoAcesso_(f, agora);
    if (f.perfil === 'admin') return { nome: f.nome, perfil: 'admin', situacao: situacao };
    const o = { nome: f.nome, perfil: 'fiscal', situacao: situacao, criadoEm: f.expiraEm > VALIDADE_CODIGO_MS ? f.expiraEm - VALIDADE_CODIGO_MS : 0,
                expiraEm: f.expiraEm > VALIDADE_CODIGO_MS ? f.expiraEm : 0, ativadoEm: f.ativadoEm > 1e12 ? f.ativadoEm : 0, geradoPor: f.geradoPor || '',
                permissoes: permissoesDe_(f.nome, mapa) };                                     // módulos liberados (por nome; padrão: todos)
    if (situacao === 'aguardando') o.codigo = f.codigo.padStart(6, '0');
    return o;
  });
  lista.sort(function (a, b) { return (b.criadoEm || 0) - (a.criadoEm || 0) || String(a.nome).localeCompare(String(b.nome)); });
  return { ok: true, agora: agora, acessos: lista };
}

/** Painel → "Revogar": tira todos os acessos de FISCAL com esse nome (aparelhos e códigos). Administrador só pela planilha. */
function painelRevogar(token, nome) {
  adminDoToken_(token);
  nome = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, NOME_SERVIDOR_MAX + 20);
  if (!nome) throw new Error('Informe o nome do servidor.');
  const n = revogar_(nome, true);
  if (!n && lerLeitura_('Fiscais').some(function (f) { return f.perfil === 'admin' && f.ativo === 1 && nomeChave_(f.nome) === nomeChave_(nome); })) {
    throw new Error('Acesso de administrador não é retirado pelo painel. Use o menu GDV da planilha.');
  }
  return { ok: true, nome: nome, revogados: n };
}

/** Troca o código de administrador por uma credencial (limitador de tentativas próprio, mais restrito que o dos aparelhos). */
function painelAtivar(codigo) {
  return ativar_({ codigo: codigo, perfil: 'admin' });
}

function lerLeitura_(nome) {                       // leitura pura: não cria abas nem colunas
  const sh = planilha_().getSheetByName(nome), cols = TABELAS[nome];
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues()
    .map(function (l) { return paraObjeto_(cols, l); });
}

/* --- auxiliares do painel (sem efeitos colaterais) --- */

const RE_DIA_ = /^\d{4}-\d{2}-\d{2}$/;
/** "aaaa-mm-dd" + n dias (calendário puro, sem fuso). */
function somarDias_(dia, n) {
  const d = new Date(Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10))) + n * 864e5);
  return d.toISOString().slice(0, 10);
}
function diaValido_(v) { return RE_DIA_.test(String(v || '')) && somarDias_(v, 0) === v; }
function hojeManaus_() { return Utilities.formatDate(new Date(), 'America/Manaus', 'yyyy-MM-dd'); }
/** Data + "HH:MM" do horário de Manaus (UTC−4, sem horário de verão) → milissegundos; null se faltar algo. */
function tsManaus_(dia, hm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || ''));
  if (!diaValido_(dia) || !m) return null;
  return Date.parse(dia + 'T' + m[1].padStart(2, '0') + ':' + m[2] + ':00-04:00');
}
function numOuNulo_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}
function lerJSONSeguro_(v, padrao) {
  try { const o = JSON.parse(String(v || '')); return o === null || o === undefined ? padrao : o; } catch (e) { return padrao; }
}
/** CPF → "***.456.789-**"; CNPJ → "**.345.678/0001-**"; outro valor → "***" (vazio continua vazio). */
function mascararDoc_(v) {
  const d = digitos_(v);
  if (d.length === 11) return '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**';
  if (d.length === 14) return '**.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-**';
  return String(v || '').trim() ? '***' : '';
}
function tipoDoc_(v) { const n = digitos_(v).length; return n === 11 ? 'CPF' : n === 14 ? 'CNPJ' : ''; }
/** Quantidade "1.234,5" / "1234.5" / "12" → número; null se não der para ler. */
function quantidade_(q) {
  let s = String(q || '').trim();
  if (!s) return null;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : null;
}
/** Produtos do TF: o app grava JSON ["PRODUTO - 10 Kg", ...] (aceita também [{p,q,u}] e texto solto). */
function produtosTF_(v) {
  const bruto = lerJSONSeguro_(v, null);
  const lista = Array.isArray(bruto) ? bruto : (String(v || '').trim() ? String(v).split(/\s*[;\n]\s*/) : []);
  return lista.map(function (x) {
    if (x && typeof x === 'object') {
      const p = String(x.p || x.produto || '').trim(), q = String(x.q || x.quantidade || '').trim(), u = String(x.u || x.unidade || '').trim();
      return { produto: p, quantidade: quantidade_(q), unidade: u, texto: (p + (q ? ' - ' + q + ' ' + u : '')).trim() };
    }
    const t = String(x || '').trim(), m = /^(.*?)\s+-\s+([\d.,]+)\s*(.*)$/.exec(t);
    return m ? { produto: m[1].trim(), quantidade: quantidade_(m[2]), unidade: m[3].trim(), texto: t }
             : { produto: t, quantidade: null, unidade: '', texto: t };
  }).filter(function (p) { return p.produto; });
}
/** Documentos apresentados no TF (JSON {nf, ptv, gta, ...}): só os tipos preenchidos, sem os números. */
function documentosTF_(v) {
  const o = lerJSONSeguro_(v, {});
  return o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).filter(function (k) { return String(o[k] || '').trim(); }) : [];
}
function contarFotos_(v) { const a = lerJSONSeguro_(v, []); return Array.isArray(a) ? a.filter(Boolean).length : 0; }
function contarAssinaturas_(v) {
  const o = lerJSONSeguro_(v, {});
  return o && typeof o === 'object' ? Object.keys(o).filter(function (k) { return o[k]; }).length : 0;
}
/** Culturas do levantamento (JSON [{cultura, area, espLinha, espPlanta, praga, coleta, tipoMaterial, codigoAmostra, destinoAmostra}]). */
function culturasLev_(v) {
  const a = lerJSONSeguro_(v, []);
  return (Array.isArray(a) ? a : []).filter(function (c) { return c && typeof c === 'object' && String(c.cultura || '').trim(); }).map(function (c) {
    return { cultura: String(c.cultura).trim(), area: numOuNulo_(c.area), espLinha: String(c.espLinha || ''), espPlanta: String(c.espPlanta || ''),
             praga: String(c.praga || '').trim(), coleta: c.coleta === 'Sim' ? 'Sim' : 'Não', tipoMaterial: String(c.tipoMaterial || ''),
             codigoAmostra: String(c.codigoAmostra || ''), destinoAmostra: String(c.destinoAmostra || '') };
  });
}
function pragasDe_(culturas) {
  const vistas = {};
  culturas.forEach(function (c) { if (c.praga) vistas[c.praga] = true; });
  return Object.keys(vistas);
}

/**
 * Resolve o período do painel. Sem datas: últimos 30 dias (até hoje, horário de Manaus). Só "de": até hoje.
 * Só "ate": 30 dias terminando em "ate". Máximo de 366 dias.
 */
function periodoPainel_(filtro) {
  filtro = filtro || {};
  const temDe = String(filtro.de || '') !== '', temAte = String(filtro.ate || '') !== '';
  if ((temDe && !diaValido_(filtro.de)) || (temAte && !diaValido_(filtro.ate))) throw new Error('Período inválido: use datas no formato aaaa-mm-dd.');
  const ate = temAte ? filtro.ate : hojeManaus_();
  const de = temDe ? filtro.de : somarDias_(ate, -29);
  if (de > ate) throw new Error('Período inválido: a data inicial é posterior à data final.');
  const dias = Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 864e5) + 1;
  if (dias > PAINEL_MAX_DIAS) throw new Error('Período longo demais (máximo de ' + PAINEL_MAX_DIAS + ' dias). Escolha um período menor.');
  return { de: de, ate: ate, dias: dias };
}

/** Auditoria de uma sequência a partir de registros já lidos (usada pelo menu e pelo painel). */
function auditarRegs_(tipo, grupo, ano, todos, numeracao) {
  const s = SEQUENCIAS[tipo];
  ano = Number(ano);
  const regs = todos.filter(function (r) { return r[s.grupo] === grupo && r.ano === ano && (tipo === 'TF' || r.numero > 0); });
  const usos = {};
  regs.forEach(function (r) { (usos[r.numero] = usos[r.numero] || []).push(r); });
  const nums = Object.keys(usos).map(Number).sort(function (a, b) { return a - b; });
  const base = numeracao.filter(function (r) { return r.id === chaveSeq_(tipo, grupo, ano); })[0];
  const inicio = base ? base.ultimo + 1 : 1, lacunas = [], duplicados = [];
  const maior = nums.length ? nums[nums.length - 1] : inicio - 1;
  for (let n = inicio; n <= maior; n++) if (!usos[n]) lacunas.push(n);
  nums.forEach(function (n) { if (usos[n].length > 1) duplicados.push({ numero: n, ids: usos[n].map(function (r) { return r.usuario + ' ' + r.data + ' ' + r.hora; }) }); });
  const editados = regs.filter(function (r) { return r.numeroOrigem === 'editado' || r.numeroOrigem === 'provisorio'; }).map(function (r) { return { numero: r.numero, origem: r.numeroOrigem, sugerido: r.numeroSugerido, usuario: r.usuario }; });
  return { total: regs.length, primeiro: nums[0] || null, ultimo: maior || null, inicioEsperado: inicio, lacunas: lacunas, duplicados: duplicados, editados: editados,
           conflitos: regs.filter(function (r) { return r.conflito === 1; }).length, cancelados: regs.filter(function (r) { return r.cancelado === 1; }).length };
}

/**
 * Dados do período para o painel (o painel calcula indicadores, gráficos e mapa no navegador).
 * filtro: {de:'aaaa-mm-dd', ate:'aaaa-mm-dd'}. Turnos em andamento vêm SEMPRE, qualquer que seja o período.
 * Registros excluídos ficam de fora; TFs/termos cancelados vêm com cancelado = 1. Documentos mascarados; sem telefone,
 * e-mail, endereço, RG, matrícula, testemunhas, assinaturas nem ids de fotos (só contagens).
 */
function painelDados(token, filtro) {
  const admin = adminDoToken_(token);
  const p = periodoPainel_(filtro), de = p.de, ate = p.ate;
  const noPeriodo = function (r) { return r.data >= de && r.data <= ate; };

  // Barreira (Controle de veículos)
  const aoVivo = filtro && filtro.aoVivo === true, idsVivo = {};
  if (aoVivo) (Array.isArray(filtro.ids) ? filtro.ids : []).slice(0, 500).forEach(function (id) { idsVivo[String(id)] = true; });
  const turnosLidos = lerLeitura_('Turnos').filter(function (t) {
    return t.id && (t.encerrado !== 1 || (aoVivo ? idsVivo[t.id] === true : noPeriodo(t)));
  });
  const porTurno = {};
  turnosLidos.forEach(function (t) { porTurno[t.id] = { n: 0, pessoas: 0, ts: 0, hora: '' }; });
  const veiculos = lerLeitura_('Veiculos').filter(function (v) { return v.id && porTurno[v.turnoId] && v.excluido !== 1; }).map(function (v) {
    const a = porTurno[v.turnoId];
    a.n++; a.pessoas += v.pessoas;
    if (v.srv_ts > a.ts) a.ts = v.srv_ts;
    if (String(v.hora) > a.hora) a.hora = String(v.hora);
    return { id: v.id, turnoId: v.turnoId, hora: v.hora, placa: v.placa, tipo: v.tipo, pessoas: v.pessoas, srv_ts: v.srv_ts, usuario: v.usuario };
  });
  const turnos = turnosLidos.map(function (t) {
    const a = porTurno[t.id], ini = tsManaus_(t.data, t.inicio);
    let fim = t.fim ? tsManaus_(t.data, t.fim) : null;
    if (fim !== null && ini !== null && fim < ini) fim += 864e5;                       // turno que passou da meia-noite
    return { id: t.id, numeroTF: t.numeroTF, data: t.data, letra: t.letra, inicio: t.inicio, fim: t.fim, fiscal: t.fiscal, local: t.local,
             unidade: t.unidade, posto: t.posto, encerrado: t.encerrado === 1 ? 1 : 0, emAndamento: t.encerrado !== 1, usuario: t.usuario,
             criadoEm: t.criadoEm, atualizadoEm: t.atualizadoEm, srv_ts: t.srv_ts,
             latIni: numOuNulo_(t.latIni), lngIni: numOuNulo_(t.lngIni), precIni: numOuNulo_(t.precIni),
             latFim: numOuNulo_(t.latFim), lngFim: numOuNulo_(t.lngFim), precFim: numOuNulo_(t.precFim),
             inicioTs: ini, fimTs: fim, nVeiculos: a.n, nPessoas: a.pessoas,
             ultimoVeiculoHora: a.hora, ultimoVeiculoTs: a.ts || null, ultimoSinal: Math.max(t.srv_ts, a.ts) || null };
  });

  const agoraMs = Date.now(), tfsAndamento = tfsAndamento_(agoraMs);                 // TF em preenchimento: vem sempre (normal e ao vivo)
  if (aoVivo) return { ok: true, agora: agoraMs, admin: admin, aoVivo: true, periodo: p, turnos: turnos, veiculos: veiculos, tfsAndamento: tfsAndamento };

  // TF de Barreira
  const todosTFs = lerLeitura_('TFs').filter(function (r) { return r.id; });
  const tfsPer = todosTFs.filter(noPeriodo);
  const tfs = tfsPer.map(function (r) {
    return { id: r.id, barreira: r.barreira, ano: r.ano, numero: r.numero, numeroTxt: r.numeroTxt, numeroSugerido: r.numeroSugerido,
             numeroOrigem: r.numeroOrigem, conflito: r.conflito, emitidoEm: r.emitidoEm, turnoId: r.turnoId, veiculoId: r.veiculoId,
             data: r.data, hora: r.hora, fiscal: r.fiscal, local: r.local, placa: r.placa, origem: r.origem, destino: r.destino,
             doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome, municipio: r.municipio, uf: r.uf, relacao: r.relacao,
             inspecao: r.inspecao, coleta: r.coleta, amostras: r.amostras, procedimento: r.procedimento, fiel: r.fiel, auto: r.auto,
             advertencia: r.advertencia, documentos: documentosTF_(r.documentos), produtos: produtosTF_(r.produtos),
             reincidente: r.reincidente, tfsAnteriores: r.tfsAnteriores, cancelado: r.cancelado, motivoCancel: r.motivoCancel,
             criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario };
  });

  // PCE: levantamentos (período e 365 dias anteriores, para "novo foco" e cobertura) e Termos de Colheita
  const iniHist = somarDias_(de, -365), fimHist = somarDias_(de, -1);
  const levLidos = lerLeitura_('Levantamentos').filter(function (r) { return r.id && r.excluido !== 1; });
  const historicoPce = [], levantamentos = [];
  levLidos.forEach(function (r) {
    if (r.data >= iniHist && r.data <= fimHist) { historicoPce.push({ municipio: r.municipio, data: r.data, pragas: pragasDe_(culturasLev_(r.culturas)) }); return; }
    if (!noPeriodo(r)) return;
    const cult = culturasLev_(r.culturas);
    levantamentos.push({ id: r.id, data: r.data, hora: r.hora, servidor: r.servidor, cargo: r.cargo, lotacao: r.lotacao,
                         doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome, propriedade: r.propriedade,
                         codigoPropriedade: r.codigoPropriedade, situacaoFundiaria: r.situacaoFundiaria, municipio: r.municipio,
                         lat: numOuNulo_(r.lat), lon: numOuNulo_(r.lon), precisao: numOuNulo_(r.precisao),
                         culturas: cult, pragas: pragasDe_(cult), nFotos: contarFotos_(r.fotos), nAssinaturas: contarAssinaturas_(r.assinaturas),
                         criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario });
  });
  const todasColheitas = lerLeitura_('Colheitas').filter(function (r) { return r.id && r.excluido !== 1; });
  const colPer = todasColheitas.filter(noPeriodo);
  const colheitas = colPer.map(function (r) {
    return { id: r.id, unidade: r.unidade, ano: r.ano, numero: r.numero, numeroTxt: r.numeroTxt, numeroSugerido: r.numeroSugerido,
             numeroOrigem: r.numeroOrigem, conflito: r.conflito, emitidoEm: r.emitidoEm, levantamentoId: r.levantamentoId,
             data: r.data, hora: r.hora, servidor: r.servidor, lotacao: r.lotacao, municipio: r.municipio,
             doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome,
             lat: numOuNulo_(r.lat), lon: numOuNulo_(r.lon), precisao: numOuNulo_(r.precisao),
             cultura: r.cultura, quantidade: r.quantidade, analise: r.analise, partes: r.partes, local: r.local,
             cancelado: r.cancelado, motivoCancel: r.motivoCancel, nFotos: contarFotos_(r.fotos),
             criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario };
  });

  const total = turnos.length + veiculos.length + tfs.length + levantamentos.length + colheitas.length + historicoPce.length;
  if (total > PAINEL_MAX_REGISTROS) throw new Error('O período escolhido tem registros demais (' + total + '). Escolha um período menor.');

  // Auditoria da numeração: cada barreira/ano (TF) e unidade/ano (Termo de Colheita) presente no período, sobre TODOS os registros do ano
  const numeracao = lerLeitura_('Numeracao');
  const auditar = function (tipo, todos, doPeriodo) {
    const s = SEQUENCIAS[tipo], vistos = {}, out = [];
    doPeriodo.forEach(function (r) {
      const k = r[s.grupo] + '|' + r.ano;
      if (!r[s.grupo] || !r.ano || vistos[k]) return;
      vistos[k] = true;
      const a = auditarRegs_(tipo, r[s.grupo], r.ano, todos, numeracao);
      a.grupo = r[s.grupo]; a.ano = r.ano; a.lacunasTotal = a.lacunas.length; a.lacunas = a.lacunas.slice(0, PAINEL_MAX_LACUNAS);
      out.push(a);
    });
    return out;
  };

  return {
    ok: true,
    agora: Date.now(),
    admin: admin,
    periodo: p,
    turnos: turnos,
    veiculos: veiculos,
    tfsAndamento: tfsAndamento,
    tfs: tfs,
    levantamentos: levantamentos,
    colheitas: colheitas,
    historicoPce: historicoPce,
    barreiras: lerLeitura_('Barreiras').filter(function (b) { return b.id; })
      .map(function (b) { return { id: b.id, nome: b.nome, sufixo: b.sufixo, local: b.local, ativo: b.ativo === 1 }; }),
    auditoria: { tf: auditar('TF', todosTFs, tfsPer), pce: auditar('PCE', todasColheitas, colPer) }
  };
}

/* ---------- Segurança ---------- */

/** Valida a credencial e devolve o nome do usuário (fiscal ou "Administrador"). */
function autenticar_(key) {
  key = String(key || '');
  if (!key) throw new Error('Aparelho não ativado.');
  const mestra = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  if (mestra && key === mestra) return 'Administrador';
  const t = lerTudo_('Fiscais');
  for (let i = 0; i < t.valores.length; i++) {
    const f = paraObjeto_(t.cols, t.valores[i]);
    if (f.token && f.token === key && f.ativo === 1) return f.nome;
  }
  throw new Error('Acesso revogado ou inválido. Ative o aparelho novamente com um novo código.');
}

/** O aparelho troca o código de 6 dígitos por uma credencial própria (uso único). */
function ativar_(req) {
  const cache = CacheService.getScriptCache();
  // contadores separados: erros no painel (admin) não travam a ativação dos aparelhos dos fiscais, e vice-versa
  const chaveFalhas = req.perfil === 'admin' ? 'falhas_ativacao_admin' : 'falhas_ativacao';
  const limite = req.perfil === 'admin' ? MAX_FALHAS_ADMIN : MAX_FALHAS_ATIVACAO;
  const bloqueado = function () { return Number(cache.get(chaveFalhas) || 0) >= limite; };
  const msgBloqueio = 'Muitas tentativas incorretas. Aguarde 15 minutos e tente de novo.';
  if (bloqueado()) throw new Error(msgBloqueio);                  // recusa rápida, sem esperar o lock
  const cod = String(req.codigo || '').replace(/\D/g, '');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // releitura DENTRO do lock: requisições em paralelo não leem o mesmo contador (cada erro soma 1 de verdade)
    const falhas = Number(cache.get(chaveFalhas) || 0);
    if (falhas >= limite) throw new Error(msgBloqueio);
    const t = lerTudo_('Fiscais'), agora = Date.now();
    let achada = -1;
    if (cod.length === 6) {
      t.valores.forEach(function (l, i) {
        const f = paraObjeto_(t.cols, l);
        if (achada < 0 && f.ativo === 1 && !f.token && f.codigo !== '' && f.codigo.padStart(6, '0') === cod && f.expiraEm > agora &&
            (f.perfil === 'admin') === (req.perfil === 'admin')) achada = i;
      });
    }
    if (achada < 0) {
      let motivo = 'Código incorreto ou já usado. Gere um novo código no menu GDV da planilha.';
      if (cod.length !== 6) motivo = 'O código tem 6 dígitos.';
      else t.valores.forEach(function (l) {                        // explica o motivo quando o código existe, mas não pode ser usado aqui
        const f = paraObjeto_(t.cols, l);
        if (f.token || f.codigo === '' || f.codigo.padStart(6, '0') !== cod) return;
        if (f.ativo !== 1) motivo = 'Este código foi revogado. Gere um novo código.';
        else if ((f.perfil === 'admin') !== (req.perfil === 'admin')) {
          motivo = req.perfil === 'admin'
            ? 'Este é um código de FISCAL. Para o painel, gere o código em GDV → Gerar código de administrador (painel).'
            : 'Este é um código de ADMINISTRADOR (painel). Para o app dos fiscais, gere o código em GDV → Gerar código de ativação.';
        } else if (f.expiraEm <= agora) motivo = 'Código expirado. Gere um novo código.';
      });
      cache.put(chaveFalhas, String(falhas + 1), 900);
      throw new Error(motivo);
    }
    const f = paraObjeto_(t.cols, t.valores[achada]);
    f.token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    f.ativadoEm = agora;
    f.codigo = '';                                            // código de uso único
    t.sh.getRange(achada + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return f[c]; })]);
    return { ok: true, nome: f.nome, token: f.token };
  } finally {
    lock.releaseLock();
  }
}

/** Cria uma autorização (linha em "Fiscais") e devolve o código de 6 dígitos. geradoPor: administrador do painel (padrão "planilha" = menu). */
function gerarCodigo_(nome, perfil, geradoPor) {
  nome = String(nome || '').trim().replace(/\s+/g, ' ');
  if (perfil !== 'admin' && nome.split(' ').length < 2) throw new Error('Informe o nome completo (nome e sobrenome).');
  if (!nome) throw new Error('Informe o nome.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais'), agora = Date.now();
    const emUso = {};
    t.valores.forEach(function (l) {
      const f = paraObjeto_(t.cols, l);
      if (f.ativo === 1 && !f.token && f.codigo) emUso[f.codigo.padStart(6, '0')] = true;
    });
    let codigo;
    do {
      codigo = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000).padStart(6, '0');
    } while (emUso[codigo]);
    const expiraEm = agora + VALIDADE_CODIGO_MS;
    const autor = String(geradoPor || 'planilha').replace(/^[=+\-@\s]+/, '').slice(0, 120) || 'planilha';   // texto, nunca fórmula
    const linha = { nome: nome, codigo: codigo, expiraEm: expiraEm, ativo: 1, token: '', ativadoEm: 0, perfil: perfil === 'admin' ? 'admin' : '', geradoPor: autor };
    t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return linha[c]; })]);
    return { codigo: codigo, expiraEm: expiraEm, nome: nome, perfil: perfil === 'admin' ? 'admin' : 'fiscal' };
  } finally {
    lock.releaseLock();
  }
}

/** Revoga todos os aparelhos/códigos de um fiscal (pelo nome). Devolve quantos foram revogados. soFiscais: não toca em administradores (painel). */
function revogar_(nome, soFiscais) {
  nome = nomeChave_(nome);
  if (!nome) return 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais'); let n = 0;
    t.valores.forEach(function (l, i) {
      const f = paraObjeto_(t.cols, l);
      if (nomeChave_(f.nome) === nome && f.ativo === 1 && !(soFiscais && f.perfil === 'admin')) {
        f.ativo = 0;
        t.sh.getRange(i + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return f[c]; })]);
        n++;
      }
    });
    return n;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Menu da planilha (administrador) ---------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('GDV')
    .addItem('Gerar código de ativação', 'menuGerarCodigo')
    .addItem('Gerar código de administrador (painel)', 'menuGerarCodigoAdmin')
    .addItem('Definir último nº de TF usado (barreira)', 'menuDefinirSequencia')
    .addItem('Auditar numeração de TF (lacunas e duplicidades)', 'menuAuditarNumeracao')
    .addItem('Definir último nº de Termo de Colheita (PCE)', 'menuDefinirSequenciaPce')
    .addItem('Auditar numeração de Termo de Colheita (PCE)', 'menuAuditarNumeracaoPce')
    .addItem('Revogar acesso de um fiscal ou administrador', 'menuRevogar')
    .addItem('Autorizar acesso ao Drive (fotos do PCE)', 'menuAutorizarDrive')
    .addToUi();
}

/** Pede a autorização do Google Drive (fotos/assinaturas do PCE) e cria a pasta "GDV - Arquivos". Depois, publique uma NOVA versão da implantação. */
function menuAutorizarDrive() {
  const ui = SpreadsheetApp.getUi();
  try {
    const p = pastaArquivos_();
    ui.alert('Drive autorizado', 'Pasta das fotos: ' + p.getName() + '\n' + p.getUrl() +
      '\n\nAgora publique uma NOVA versão da implantação (Implantar → Gerenciar implantações → Editar → Nova versão) para os aparelhos enviarem as fotos.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível acessar o Drive', String(e.message || e), ui.ButtonSet.OK); }
}

function menuGerarCodigo() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Gerar código de ativação', 'Nome COMPLETO do fiscal (como deve aparecer nos documentos):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try {
    const g = gerarCodigo_(r.getResponseText());
    const venc = Utilities.formatDate(new Date(g.expiraEm), 'America/Manaus', 'dd/MM/yyyy HH:mm');
    ui.alert('Código para ' + g.nome, g.codigo.slice(0, 3) + ' ' + g.codigo.slice(3) + '\n\nEnvie ao fiscal. Uso único, válido até ' + venc + '.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível gerar', String(e.message || e), ui.ButtonSet.OK); }
}

function menuGerarCodigoAdmin() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Código de administrador (painel)', 'Nome do administrador:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try {
    const g = gerarCodigo_(r.getResponseText(), 'admin');
    const venc = Utilities.formatDate(new Date(g.expiraEm), 'America/Manaus', 'dd/MM/yyyy HH:mm');
    ui.alert('Código de administrador para ' + g.nome, g.codigo.slice(0, 3) + ' ' + g.codigo.slice(3) + '\n\nAbra o painel em ' + painelUrl_() + ' e digite o código. Uso único, válido até ' + venc + '.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível gerar', String(e.message || e), ui.ButtonSet.OK); }
}

function menuDefinirSequencia() {
  const ui = SpreadsheetApp.getUi();
  const b = ui.prompt('Barreira', 'Código da barreira (coluna id da aba Barreiras), ex.: BVA-CEASA', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const a = ui.prompt('Ano', 'Ano da numeração (ex.: ' + new Date().getFullYear() + ')', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const u = ui.prompt('Último número usado', 'Último nº de TF JÁ usado nessa barreira/ano (o próximo será este + 1). Use 0 para começar do 0001.', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  try { const n = definirSequencia_(b.getResponseText().trim(), Number(a.getResponseText()), Number(u.getResponseText())); ui.alert('Pronto', 'O próximo TF será o nº ' + (n + 1) + '.', ui.ButtonSet.OK); }
  catch (e) { ui.alert('Não foi possível definir', String(e.message || e), ui.ButtonSet.OK); }
}

function menuAuditarNumeracao() {
  const ui = SpreadsheetApp.getUi();
  const b = ui.prompt('Barreira', 'Código da barreira (coluna id da aba Barreiras), ex.: BVA-CEASA', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const a = ui.prompt('Ano', 'Ano da numeração (ex.: ' + new Date().getFullYear() + ')', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const r = auditarSequencia_(b.getResponseText().trim(), Number(a.getResponseText()));
  const f = function (l) { return l.length ? l.join(', ') : 'nenhuma'; };
  ui.alert('Auditoria da numeração', r.total + ' TF(s), do nº ' + r.primeiro + ' ao nº ' + r.ultimo + '.\n\nLacunas (números sem TF): ' + f(r.lacunas) +
    '\nNúmeros repetidos: ' + (r.duplicados.length ? r.duplicados.map(function (d) { return d.numero; }).join(', ') : 'nenhum') +
    '\nNúmeros alterados à mão ou provisórios: ' + (r.editados.length ? r.editados.map(function (e) { return e.numero + ' (' + e.origem + ', ' + e.usuario + ')'; }).join('; ') : 'nenhum'), ui.ButtonSet.OK);
}

function menuDefinirSequenciaPce() {
  const ui = SpreadsheetApp.getUi();
  const b = ui.prompt('Unidade', 'Unidade da numeração do Termo de Colheita (lotação do servidor), ex.: MANAUS', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const a = ui.prompt('Ano', 'Ano da numeração (ex.: ' + new Date().getFullYear() + ')', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const u = ui.prompt('Último número usado', 'Último nº de Termo de Colheita JÁ usado nessa unidade/ano (o próximo será este + 1). Use 0 para começar do 001.', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  try {
    const un = unidadePce_(b.getResponseText()), ano = Number(a.getResponseText());
    const n = definirSequencia_(un, ano, Number(u.getResponseText()), 'PCE');
    ui.alert('Pronto', 'O próximo Termo de Colheita será o nº ' + numeroTxtPce_(n + 1, ano, un) + '.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível definir', String(e.message || e), ui.ButtonSet.OK); }
}

function menuAuditarNumeracaoPce() {
  const ui = SpreadsheetApp.getUi();
  const b = ui.prompt('Unidade', 'Unidade da numeração do Termo de Colheita, ex.: MANAUS', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const a = ui.prompt('Ano', 'Ano da numeração (ex.: ' + new Date().getFullYear() + ')', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const r = auditarSequencia_(b.getResponseText(), Number(a.getResponseText()), 'PCE');
  const f = function (l) { return l.length ? l.join(', ') : 'nenhuma'; };
  ui.alert('Auditoria da numeração (Termo de Colheita)', r.total + ' termo(s), do nº ' + r.primeiro + ' ao nº ' + r.ultimo + '.\n\nLacunas (números sem termo): ' + f(r.lacunas) +
    '\nNúmeros repetidos: ' + (r.duplicados.length ? r.duplicados.map(function (d) { return d.numero; }).join(', ') : 'nenhum') +
    '\nNúmeros alterados à mão ou provisórios: ' + (r.editados.length ? r.editados.map(function (e) { return e.numero + ' (' + e.origem + ', ' + e.usuario + ')'; }).join('; ') : 'nenhum'), ui.ButtonSet.OK);
}

function menuRevogar() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Revogar acesso', 'Nome COMPLETO do fiscal (igual ao cadastrado na aba Fiscais):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const n = revogar_(r.getResponseText());
  ui.alert(n ? 'Acesso revogado em ' + n + ' aparelho(s)/código(s).' : 'Nenhum acesso ativo encontrado com esse nome.');
}

/* ---------- Planilha ---------- */

function planilha_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  let ss = SpreadsheetApp.getActiveSpreadsheet();   // projeto criado a partir da planilha
  if (!ss) ss = SpreadsheetApp.create('GDV - Controle de Veículos (banco de dados)');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function aba_(nome) {
  const ss = planilha_();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    const cols = TABELAS[nome];
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#dbe6f7');
    sh.setFrozenRows(1);
    // Texto puro: impede o Sheets de converter datas/placas ou interpretar fórmulas.
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  } else {
    garantirColunas_(sh, nome);
  }
  return sh;
}

/** Planilhas criadas por versões anteriores ganham as colunas novas (no fim), sem mexer nos dados. */
function garantirColunas_(sh, nome) {
  const cols = TABELAS[nome];
  if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
  const atual = sh.getRange(1, 1, 1, cols.length).getValues()[0];
  cols.forEach(function (c, i) {
    if (atual[i] === c) return;
    if (atual[i] !== '' && atual[i] !== undefined && atual[i] !== null) {
      throw new Error('Cabeçalho da aba ' + nome + ' diferente do esperado na coluna ' + (i + 1) + '.');
    }
    sh.getRange(1, i + 1).setValue(c).setFontWeight('bold').setBackground('#dbe6f7');
    sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  });
}

function lerTudo_(nome) {
  const sh = aba_(nome), cols = TABELAS[nome], n = sh.getLastRow() - 1;
  const valores = n > 0 ? sh.getRange(2, 1, n, cols.length).getValues() : [];
  return { sh: sh, cols: cols, valores: valores };
}

function paraObjeto_(cols, linha) {
  const o = {};
  cols.forEach(function (c, i) {
    let v = linha[i];
    if (v instanceof Date) v = Utilities.formatDate(v, 'America/Manaus', 'yyyy-MM-dd');
    o[c] = CAMPOS_NUMERICOS.indexOf(c) >= 0 ? (Number(v) || 0) : String(v === null || v === undefined ? '' : v);
  });
  return o;
}

function gravar_(nome, recebidos, ts, usuario) {
  if (!recebidos.length) return;
  const t = lerTudo_(nome), cols = t.cols, idx = {};
  t.valores.forEach(function (l, i) { idx[String(l[0])] = i; });

  const porId = {}, brutos = {};             // dedup no lote: vale o mais recente
  recebidos.forEach(function (r) {
    const o = limpar_(cols, r);
    if (!o) return;
    if (!porId[o.id] || o.atualizadoEm >= porId[o.id].atualizadoEm) { porId[o.id] = o; brutos[o.id] = r; }
  });

  const novas = [];
  Object.keys(porId).forEach(function (id) {
    const o = porId[id], r = brutos[id];
    o.srv_ts = ts;
    o.usuario = usuario;                       // quem sincronizou (definido pelo servidor, não pelo app)
    const linha = cols.map(function (c) { return o[c]; });
    if (idx[id] === undefined) {
      novas.push(linha);
    } else {
      const atual = paraObjeto_(cols, t.valores[idx[id]]);
      if (o.atualizadoEm >= atual.atualizadoEm) {   // última edição vence
        // campo que o app NÃO enviou (ex.: TF não conhece o e-mail da pessoa, versão antiga do app) mantém o valor da planilha
        cols.forEach(function (c, i) { if (c !== 'srv_ts' && c !== 'usuario' && !(c in r)) linha[i] = t.valores[idx[id]][i]; });
        t.sh.getRange(idx[id] + 2, 1, 1, cols.length).setValues([linha]);
      }
    }
  });
  if (novas.length) {
    t.sh.getRange(t.sh.getLastRow() + 1, 1, novas.length, cols.length).setValues(novas);
  }
}

function lerMudancas_(nome, since, usuario) {
  const t = lerTudo_(nome), i = t.cols.indexOf('srv_ts');
  return t.valores.filter(function (l) { return Number(l[i]) > since; })
                  .map(function (l) { return paraObjeto_(t.cols, l); })
                  .filter(function (o) { return !usuario || usuario === 'Administrador' || o.usuario === usuario; });
}

function limpar_(cols, r) {
  if (!r || !r.id || String(r.id).length > 64) return null;
  const o = {};
  cols.forEach(function (c) {
    let v = r[c];
    if (v === undefined || v === null) v = '';
    o[c] = CAMPOS_NUMERICOS.indexOf(c) >= 0 ? (Number(v) || 0) : String(v).slice(0, LIMITES_TEXTO[c] || 500);
  });
  return o;
}

function lista_(a) {
  if (!Array.isArray(a)) return [];
  if (a.length > MAX_LINHAS_POR_ENVIO) throw new Error('Lote grande demais.');
  return a;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
