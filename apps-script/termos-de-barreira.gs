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
  PCE: { aba: 'Colheitas', grupo: 'unidade', prefixo: 'PCE|', nome: 'Termo de Colheita' },
  // PCE: Termo de Fiscalização (uma sequência por unidade/ano) e Cadastro de imóvel (por programa + unidade + ano: grupo "MONILIASE|AUTAZES")
  TPCE: { aba: 'TermosPCE', grupo: 'unidade', prefixo: 'TPCE|', nome: 'Termo de Fiscalização (PCE)' },
  CPCE: { aba: 'CadastrosPCE', grupo: 'unidade', prefixo: 'CPCE|', nome: 'Cadastro de imóvel (PCE)',
          grupoDe: function (r) { return String(r.programa || 'moniliase').toUpperCase() + '|' + r.unidade; } }
};
function chaveSeq_(tipo, grupo, ano) { return SEQUENCIAS[tipo].prefixo + grupo + '|' + ano; }
/** Grupo da sequência de um registro (barreira, unidade ou "PROGRAMA|UNIDADE"). */
function grupoSeq_(tipo, r) { const s = SEQUENCIAS[tipo]; return s.grupoDe ? s.grupoDe(r) : r[s.grupo]; }

/**
 * Numeração: UMA sequência por grupo (barreira ou unidade) e por ano, sem faixas reservadas. O "último usado" é o maior
 * número entre os registros gravados (inclusive cancelados, que mantêm o número) e o ponto de partida da aba Numeracao.
 */
function ultimoSeq_(tipo, grupo, ano, regs) {
  const s = SEQUENCIAS[tipo];
  let ultimo = 0, ref = null;
  const base = lerLeitura_('Numeracao').filter(function (r) { return r.id === chaveSeq_(tipo, grupo, ano); })[0];
  if (base) ultimo = base.ultimo;
  (regs || lerLeitura_(s.aba)).forEach(function (r) { if (grupoSeq_(tipo, r) === grupo && r.ano === ano && r.numero > ultimo) { ultimo = r.numero; ref = r; } });
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
  if (Number(tf.registroAntigo) === 1) {                                         // TF digitado do papel: só com "Digitar do papel"; data do papel, nunca no futuro
    exigirAntigo_(usuario);
    if (!diaValido_(String(tf.data || '')) || String(tf.data) > hojeManaus_()) throw new Error('TF do papel: data inválida ou no futuro.');
    if (Number(String(tf.data).slice(0, 4)) !== ano) throw new Error('TF do papel: o ano do número (' + ano + ') é diferente do ano da data.');
  }
  ufsNorm_(tf);
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
  if (tipo !== 'TF') barreira = unidadePce_(barreira);
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
    if ((tipo === 'TPCE' || tipo === 'CPCE') && o.excluido === 1) return;   // cadastro excluído não disputa o número
    const k = grupoSeq_(tipo, o) + '|' + o.ano + '|' + o.numero;
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
  if (tipo !== 'TF' && (!(Number(ano) > 2000) || !(Number(ultimo) >= 0))) throw new Error('Ano ou número inválido.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (tipo !== 'TF') {
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

/* ---------- Verificação pública de autenticidade (verificar.html, sem credencial) ---------- */

const VERIF_MAX_INVALIDAS = 30;                 // consultas a ids inexistentes/inválidos por minuto (todas as origens): freia varredura
const RE_ID_TF_ = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;   // o id do TF é UUID v4 gerado no aparelho (não adivinhável)

/** Placa parcialmente mascarada: "ABC1D23" → "ABC***3". */
function placaMascarada_(v) {
  const p = placaNorm_(v);
  return p.length >= 5 ? p.slice(0, 3) + '***' + p.slice(-1) : (p ? '***' : '');
}

/**
 * tfVerificar {id}: o QR code impresso no TF leva a verificar.html?t=<id>. Devolve só o necessário para conferir o documento —
 * nº, data/hora, barreira, procedimento, servidor, situação (válido/cancelado e motivo) e placa mascarada. Nunca CPF/CNPJ, nome do
 * fiscalizado, endereço, telefone ou produtos. Ids inválidos ou não encontrados contam num limite global por minuto (CacheService).
 */
function tfVerificar_(req) {
  const cache = CacheService.getScriptCache(), chave = 'verif_inval_' + Math.floor(Date.now() / 60000);
  const invalidas = Number(cache.get(chave) || 0);
  if (invalidas >= VERIF_MAX_INVALIDAS) throw new Error('Muitas consultas em pouco tempo. Aguarde um minuto e tente de novo.');
  const id = String(req.id || '').trim().toLowerCase();
  const t = RE_ID_TF_.test(id) ? lerLeitura_('TFs').filter(function (r) { return String(r.id).toLowerCase() === id; })[0] : null;
  if (!t) { cache.put(chave, String(invalidas + 1), 120); return { ok: true, encontrado: false }; }
  const bar = lerLeitura_('Barreiras').filter(function (b) { return b.id === t.barreira; })[0];
  const PROC = { liberacao: 'Liberação', apreensao: 'Apreensão p/ destruição', rechaco: 'Rechaço (retorno à origem)' };
  return { ok: true, encontrado: true, tf: {
    numeroTxt: t.numeroTxt, data: t.data, hora: t.hora, barreira: bar ? bar.nome : t.barreira,
    procedimento: PROC[t.procedimento] || 'Não informado', servidor: t.fiscal || t.usuario,
    situacao: t.cancelado === 1 ? 'cancelado' : 'valido', motivoCancel: t.cancelado === 1 ? t.motivoCancel : '',
    placa: placaMascarada_(t.placa), emitidoEm: t.emitidoEm || null } };
}

/* ---------- Índice de reincidência (consulta sem internet no app) ---------- */

const INDICE_CACHE_S = 600;                     // índice completo guardado por 10 min (CacheService)
/** SHA-256 em hex (16 primeiros caracteres) de "doc:<dígitos>" ou "placa:<placa>". */
function hashIndice_(txt) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, txt, Utilities.Charset.UTF_8);
  return b.slice(0, 8).map(function (x) { return ((x + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
/** Agrega os TFs (t._h = hashes das chaves) por chave: {h, n, ap, re, au, li, ad, ult}; cancelados não contam (mas a chave aparece, com n = 0). */
function agregarIndice_(tfs) {
  const m = {};
  const somar = function (h, t) {
    const a = m[h] = m[h] || { h: h, n: 0, ap: 0, re: 0, au: 0, li: 0, ad: 0, ult: '' };
    if (t.cancelado === 1) return;
    a.n++;
    if (t.procedimento === 'apreensao') a.ap++; else if (t.procedimento === 'rechaco') a.re++; else if (t.procedimento === 'liberacao') a.li++;
    if (t.auto === 1) a.au++; if (t.advertencia === 1) a.ad++;
    if (String(t.data) > a.ult) a.ult = String(t.data);
  };
  tfs.forEach(function (t) { t._h.forEach(function (h) { somar(h, t); }); });
  return Object.keys(m).map(function (k) { return m[k]; });
}
/** Hashes das chaves do TF (documento e placa); com filtro {docs, placas}, só as chaves que estão nele. */
function chavesTF_(t, filtro) {
  const h = [], d = digitos_(t.doc), p = placaNorm_(t.placa);
  if ((d.length === 11 || d.length === 14) && (!filtro || filtro.docs[d])) h.push(hashIndice_('doc:' + d));
  if (p.length >= 7 && (!filtro || filtro.placas[p])) h.push(hashIndice_('placa:' + p));
  return h;
}
/**
 * tfIndiceReincidencia {key, desde}: histórico de TODOS os TFs (todas as barreiras) resumido por hash do CPF/CNPJ e da placa, sem dados
 * pessoais em claro. Com desde (ms do índice anterior): só as chaves com TF gravado/alterado depois, recalculadas por inteiro (n = 0 =
 * apagar). Sem desde: índice completo (guardado 10 min no CacheService e completado com o que mudou desde então).
 * Devolve {ok, agora, completo, itens: [{h, n, ap, re, au, li, ad, ult}]}.
 */
function tfIndiceReincidencia_(req) {
  const desde = Number(req.desde) || 0, cache = CacheService.getScriptCache(), agora = Date.now();
  const tfs = lerLeitura_('TFs').filter(function (t) { return t.id; });
  let base = null;
  if (!desde) { try { base = JSON.parse(cache.get('indice_reinc') || 'null'); } catch (e) { base = null; } }
  if (!desde && !base) {
    tfs.forEach(function (t) { t._h = chavesTF_(t, null); });
    const r = { agora: agora, completo: true, itens: agregarIndice_(tfs).filter(function (a) { return a.n > 0; }) };
    const txt = JSON.stringify(r);
    if (txt.length < 90000) { try { cache.put('indice_reinc', txt, INDICE_CACHE_S); } catch (e) { /* grande demais para o cache */ } }
    r.ok = true;
    return r;
  }
  // só as chaves (documento/placa, comparados em claro aqui no servidor) com TF gravado ou alterado depois de "ref" (1 s de folga)
  const ref = desde || base.agora, filtro = { docs: {}, placas: {} };
  tfs.forEach(function (t) {
    if (t.srv_ts < ref - 1000) return;
    filtro.docs[digitos_(t.doc)] = true; filtro.placas[placaNorm_(t.placa)] = true;
  });
  const sel = tfs.filter(function (t) { return filtro.docs[digitos_(t.doc)] || filtro.placas[placaNorm_(t.placa)]; });
  sel.forEach(function (t) { t._h = chavesTF_(t, filtro); });
  const itens = agregarIndice_(sel);
  if (!base) return { ok: true, agora: agora, completo: false, itens: itens };
  const m = {};
  base.itens.forEach(function (a) { m[a.h] = a; });
  itens.forEach(function (a) { m[a.h] = a; });
  return { ok: true, agora: agora, completo: true, itens: Object.keys(m).map(function (k) { return m[k]; }).filter(function (a) { return a.n > 0; }) };
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

/* ---------- UF de origem/destino (veículo e TF) ---------- */
const UFS_ = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC',
              'SE', 'SP', 'TO', 'Exterior'];   // = CONFIG.ufs do app
/** UF informada (select do app): sigla conhecida (maiúscula) ou "Exterior"; qualquer outra coisa = vazio. */
function ufNorm_(v) {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  if (s === 'EXTERIOR') return 'Exterior';
  return s.length === 2 && UFS_.indexOf(s) >= 0 ? s : '';
}
/** Normaliza ufOrigem/ufDestino de um registro recebido (TF ou veículo), só nos campos que vieram. */
function ufsNorm_(r) {
  if (!r || typeof r !== 'object') return;
  ['ufOrigem', 'ufDestino'].forEach(function (c) { if (c in r) r[c] = ufNorm_(r[c]); });
}
/** TF antigo (sem coluna de UF): UF no fim do texto de origem/destino — "PORTO VELHO/RO", "BOA VISTA - RR", "MANAUS (AM)", "RR",
 *  "LIMA, EXTERIOR". Sigla precisa estar separada (espaço, /, -, vírgula, parêntese): "MANAUS" não vira "US". Sem sigla válida = vazio. */
function ufDoTexto_(t) {
  const s = String(t == null ? '' : t).trim().toUpperCase();
  if (!s) return '';
  const m = /(?:^|[\s\/\-–—,.(])(EXTERIOR|[A-Z]{2})\)?\.?$/.exec(s);
  return m ? ufNorm_(m[1]) : '';
}
