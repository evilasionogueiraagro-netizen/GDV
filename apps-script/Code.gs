/**
 * GDV – Controle de Veículos (Barreira Fitossanitária)
 * API de sincronização: recebe registros do app (offline-first), grava na planilha
 * e devolve o que mudou desde a última sincronização.
 *
 * Acesso dos aparelhos (por fiscal):
 *   1. No menu "GDV" da planilha: "Gerar código de ativação" → informe o NOME COMPLETO do fiscal.
 *   2. O fiscal digita o código de 6 dígitos no app (uma vez). O servidor devolve uma credencial
 *      própria daquele aparelho, vinculada ao nome. Revogue em "GDV → Revogar acesso".
 *
 * Opcional (compatibilidade): Propriedades do script → ACCESS_KEY = chave mestra (administrador).
 */

const TABELAS = {
  Turnos: ['id', 'numeroTF', 'data', 'letra', 'inicio', 'fim', 'fiscal', 'local', 'unidade', 'posto',
           'encerrado', 'criadoEm', 'atualizadoEm', 'srv_ts',
           'latIni', 'lngIni', 'precIni', 'latFim', 'lngFim', 'precFim', 'usuario'],   // colunas novas ficam sempre no fim
  Veiculos: ['id', 'turnoId', 'hora', 'placa', 'tipo', 'pessoas', 'obs',
             'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],
  Fiscais: ['nome', 'codigo', 'expiraEm', 'ativo', 'token', 'ativadoEm', 'perfil'],   // perfil: vazio = fiscal, 'admin' = administrador
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
  Arquivos: ['id', 'dono', 'donoId', 'tipo', 'papel', 'nome', 'mime', 'tamanho', 'driveId', 'url', 'usuario', 'criadoEm']   // fotos/assinaturas no Drive
};
const CAMPOS_NUMERICOS = ['pessoas', 'encerrado', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts',
                          'expiraEm', 'ativo', 'ativadoEm',
                          'ano', 'numero', 'ultimo', 'de', 'ate', 'em', 'numeroSugerido', 'emitidoEm', 'amostras', 'inspecao', 'coleta', 'fiel', 'auto',
                          'advertencia', 'reincidente', 'tfsAnteriores', 'cancelado', 'conflito', 'tamanho'];   // lat/lon/precisao ficam como texto (como em Turnos)
const LIMITES_TEXTO = { constatacao: 3000, enquadramento: 3000, documentos: 2000, produtos: 3000, motivoCancel: 300,
                        culturas: 45000, descricao: 3000, fotos: 20000, assinaturas: 1000, obs: 2000 };   // demais colunas: 500
// culturas/fotos/assinaturas são JSON: cortar o texto invalidaria o JSON (e apagaria as referências no aparelho). Os limites acima
// cabem numa célula (50.000 caracteres) e o app limita a quantidade de culturas/fotos e o tamanho dos campos para nunca chegar neles.
const VALIDADE_CODIGO_MS = 7 * 24 * 3600 * 1000;      // código de ativação vale 7 dias
const MAX_FALHAS_ATIVACAO = 10;                        // tentativas erradas antes de bloquear por 15 min
const MAX_LINHAS_POR_ENVIO = 2000;

function doGet(e) {
  if (e && e.parameter && e.parameter.p === 'painel') return painelHtml_();
  return json_({ ok: true, servico: 'GDV Controle de Veículos' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.action === 'ativar') return json_(ativar_(req));
    const usuario = autenticar_(req.key);
    if (req.action === 'ping') return json_({ ok: true, nome: usuario });
    if (req.action === 'sync') return json_(sincronizar_(req, usuario));
    if (req.action === 'tfConsultar') return json_(consultar_(req, usuario));
    if (req.action === 'tfProximoNumero') return json_(proximoNumero_(req));
    if (req.action === 'tfEmitir') return json_(emitir_(req, usuario));
    if (req.action === 'pceProximoNumero') return json_(pceProximoNumero_(req));
    if (req.action === 'pceEmitir') return json_(pceEmitir_(req, usuario));
    if (req.action === 'pceConsultar') return json_(pceConsultar_(req, usuario));
    if (req.action === 'arquivoEnviar') return json_(arquivoEnviar_(req, usuario));
    throw new Error('Ação inválida.');
  } catch (err) {
    return json_({ ok: false, erro: String(err.message || err) });
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

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const agora = Date.now();
    gravar_('Turnos', turnos, agora, usuario);
    gravar_('Veiculos', veiculos, agora, usuario);
    tfs.forEach(function (t) { if (t && !t.emitidoEm) t.emitidoEm = agora; });            // momento em que a planilha recebeu o TF
    gravar_('TFs', tfs, agora, usuario);
    if (tfs.length) marcarConflitosTFs_(tfs, agora);
    gravar_('Pessoas', pessoas, agora, usuario);
    gravar_('Placas', placas, agora, usuario);
    gravar_('Levantamentos', levantamentos, agora, usuario);
    const jaGravadas = {};                                                            // termos que a planilha já tem: mantêm o emitidoEm gravado
    if (colheitas.length) lerLeitura_('Colheitas').forEach(function (l) { jaGravadas[l.id] = true; });
    colheitas.forEach(function (c) {
      if (!c) return;
      c.unidade = unidadePce_(c.unidade);
      if (!c.numeroTxt && Number(c.numero) > 0 && Number(c.ano) > 0) c.numeroTxt = numeroTxtPce_(Number(c.numero), Number(c.ano), c.unidade);
      if (!c.emitidoEm) {
        if (jaGravadas[c.id]) delete c.emitidoEm;                                       // reenvio (resposta perdida, cancelamento): não troca a data de emissão
        else c.emitidoEm = agora;                                                       // momento em que a planilha recebeu o termo
      }
    });
    gravar_('Colheitas', colheitas, agora, usuario);
    if (colheitas.length) marcarConflitos_('PCE', colheitas, agora);
    gravar_('Propriedades', propriedades, agora, usuario);
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
      ultimosPce: ultimosPce_()                         // último nº de Termo de Colheita por "UNIDADE|ano"
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
  const s = SEQUENCIAS[tipo];
  if (tipo === 'PCE') barreira = unidadePce_(barreira);
  const tfs = lerLeitura_(s.aba).filter(function (r) { return r[s.grupo] === barreira && r.ano === Number(ano) && (tipo === 'TF' || r.numero > 0); });
  const usos = {};
  tfs.forEach(function (r) { (usos[r.numero] = usos[r.numero] || []).push(r); });
  const nums = Object.keys(usos).map(Number).sort(function (a, b) { return a - b; });
  const base = lerLeitura_('Numeracao').filter(function (r) { return r.id === chaveSeq_(tipo, barreira, ano); })[0];
  const inicio = base ? base.ultimo + 1 : 1, lacunas = [], duplicados = [];
  const maior = nums.length ? nums[nums.length - 1] : inicio - 1;
  for (let n = inicio; n <= maior; n++) if (!usos[n]) lacunas.push(n);
  nums.forEach(function (n) { if (usos[n].length > 1) duplicados.push({ numero: n, ids: usos[n].map(function (r) { return r.usuario + ' ' + r.data + ' ' + r.hora; }) }); });
  const editados = tfs.filter(function (r) { return r.numeroOrigem === 'editado' || r.numeroOrigem === 'provisorio'; }).map(function (r) { return { numero: r.numero, origem: r.numeroOrigem, sugerido: r.numeroSugerido, usuario: r.usuario }; });
  return { total: tfs.length, primeiro: nums[0] || null, ultimo: maior || null, inicioEsperado: inicio, lacunas: lacunas, duplicados: duplicados, editados: editados };
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
 * O painel abre na MESMA implantação dos aparelhos:  <URL /exec>?p=painel
 * A página em si não contém dados. Os dados só são entregues a quem tem uma credencial de ADMINISTRADOR,
 * obtida com um código de 6 dígitos (uso único) gerado no menu da planilha: GDV → Gerar código de administrador.
 * Credenciais de fiscais não leem o painel, e códigos de administrador não ativam aparelhos de fiscais.
 */
function painelHtml_() {
  return HtmlService.createHtmlOutputFromFile('Painel')
    .setTitle('GDV – Painel do administrador')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Valida a credencial do painel e devolve o nome do administrador. */
function adminDoToken_(token) {
  token = String(token || '');
  if (token) {
    const t = lerLeitura_('Fiscais');
    for (let i = 0; i < t.length; i++) if (t[i].token === token && t[i].ativo === 1 && t[i].perfil === 'admin') return t[i].nome;
  }
  throw new Error('Sessão do painel inválida ou revogada. Entre com um código de administrador.');
}

/** Chamada pela página do painel: troca o código de administrador por uma credencial. */
function painelAtivar(codigo) {
  return ativar_({ codigo: codigo, perfil: 'admin' });
}

function lerLeitura_(nome) {                       // leitura pura: não cria abas nem colunas
  const sh = planilha_().getSheetByName(nome), cols = TABELAS[nome];
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues()
    .map(function (l) { return paraObjeto_(cols, l); });
}

/** Dados brutos do período (o painel calcula tudo no navegador). filtro: {de:'aaaa-mm-dd', ate:'aaaa-mm-dd'} */
function painelDados(token, filtro) {
  adminDoToken_(token);
  filtro = filtro || {};
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const de = re.test(filtro.de) ? filtro.de : '0000-00-00', ate = re.test(filtro.ate) ? filtro.ate : '9999-99-99';
  const turnos = lerLeitura_('Turnos').filter(function (t) { return t.data >= de && t.data <= ate; });
  const ids = {};
  turnos.forEach(function (t) { ids[t.id] = true; });
  const num = function (v) { const n = parseFloat(v); return isNaN(n) ? null : n; };
  return {
    geradoEm: Date.now(),
    turnos: turnos.map(function (t) {
      return { id: t.id, tf: t.numeroTF, d: t.data, ini: t.inicio, fim: t.fim, l: t.letra, po: t.posto, lo: t.local,
               un: t.unidade, f: t.fiscal, e: t.encerrado, u: t.usuario,
               la1: num(t.latIni), ln1: num(t.lngIni), la2: num(t.latFim), ln2: num(t.lngFim) };
    }),
    veiculos: lerLeitura_('Veiculos').filter(function (v) { return ids[v.turnoId] && !v.excluido; })
      .map(function (v) { return { t: v.turnoId, h: v.hora, p: v.placa, k: v.tipo, n: v.pessoas }; })
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
  const falhas = Number(cache.get('falhas_ativacao') || 0);
  if (falhas >= MAX_FALHAS_ATIVACAO) throw new Error('Muitas tentativas incorretas. Aguarde 15 minutos e tente de novo.');
  const cod = String(req.codigo || '').replace(/\D/g, '');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
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
      cache.put('falhas_ativacao', String(falhas + 1), 900);
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

/** Cria uma autorização (linha em "Fiscais") e devolve o código de 6 dígitos. */
function gerarCodigo_(nome, perfil) {
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
    t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length)
      .setValues([[nome, codigo, expiraEm, 1, '', 0, perfil === 'admin' ? 'admin' : '']]);
    return { codigo: codigo, expiraEm: expiraEm, nome: nome, perfil: perfil === 'admin' ? 'admin' : 'fiscal' };
  } finally {
    lock.releaseLock();
  }
}

/** Revoga todos os aparelhos/códigos de um fiscal (pelo nome). Devolve quantos foram revogados. */
function revogar_(nome) {
  nome = String(nome || '').trim().toLowerCase();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais'); let n = 0;
    t.valores.forEach(function (l, i) {
      const f = paraObjeto_(t.cols, l);
      if (f.nome.trim().toLowerCase() === nome && f.ativo === 1) {
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
    ui.alert('Código de administrador para ' + g.nome, g.codigo.slice(0, 3) + ' ' + g.codigo.slice(3) + '\n\nAbra o painel (URL do app + ?p=painel) e digite o código. Uso único, válido até ' + venc + '.', ui.ButtonSet.OK);
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
    o[c] = CAMPOS_NUMERICOS.indexOf(c) >= 0 ? (Number(v) || 0) : String(v === null ? '' : v);
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
