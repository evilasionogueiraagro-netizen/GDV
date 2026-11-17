/* ---------- Termo de Educação Sanitária (módulo próprio, independente do turno, do TF de barreira e do PCE) ----------
 * Numeração "NNN.AAAA.UNIDADE" por unidade (lotação do servidor) e ano, sequência própria (SEQUENCIAS.EDU, aba TermosEducacao).
 * Online o app pergunta o próximo (educacaoProximoNumero) e grava com educacaoRegistrar (só se o número estiver livre, sob lock); sem internet
 * o número é provisório e sobe no sync (número repetido = conflito = 1, o mais antigo vale). Cancelar = cancelado 1 com motivo (o número
 * continua usado); nada é apagado. Só o autor altera o próprio termo (ABAS_COM_DONO_). */

const MEDIDAS_EDU_ = ['Abordagem', 'Palestra', 'Oficina', 'Dia de campo', 'Distribuição de material', 'Exposição/feira', 'Reunião', 'Visita', 'Outro'];
const EDU_MAX_ITENS_ = 12;          // itens do público-alvo e dos programas (JSON cabe nos 2.000 caracteres da célula)
const EDU_MAX_INTEIRO_ = 1000000;

/** "NNN.AAAA.UNIDADE" (3 dígitos). */
function numeroTxtEdu_(numero, ano, unidade) { return String(numero).padStart(3, '0') + '.' + ano + '.' + unidade; }

/** Lista (array ou JSON) de textos curtos, sem vazios nem repetidos; devolve o JSON para a célula. */
function listaEdu_(v) {
  let l = v;
  if (typeof l === 'string') { try { l = JSON.parse(l); } catch (e) { l = []; } }
  if (!Array.isArray(l)) l = [];
  const o = [];
  l.forEach(function (x) { x = String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, 80); if (x && o.indexOf(x) < 0 && o.length < EDU_MAX_ITENS_) o.push(x); });
  return o;
}
/** Inteiro >= 0 (número ou texto de dígitos); vazio vale vazioVale (ou -1 = inválido); decimal, negativo ou texto = -1. */
function inteiroEdu_(v, vazioVale) {
  const s = String(v == null ? '' : v).trim();
  if (s === '') return vazioVale == null ? -1 : vazioVale;
  return /^\d{1,7}$/.test(s) ? Math.min(Number(s), EDU_MAX_INTEIRO_) : -1;
}
function textoEdu_(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }

/**
 * Prepara o registro recebido: unidade em maiúsculas, nº em texto, listas em JSON, inteiros. estrito = true (registro online) recusa campo
 * obrigatório em branco; no sync (estrito = false) só normaliza, sem recusar (o aparelho já validou e o dado não se perde).
 */
function normalizarTermoEdu_(r, estrito) {
  r.unidade = unidadePce_(r.unidade);
  const pub = listaEdu_(r.publicoAlvo), prog = listaEdu_(r.programas), pessoas = inteiroEdu_(r.pessoas), folders = inteiroEdu_(r.folders, 0);
  r.publicoAlvo = JSON.stringify(pub); r.programas = JSON.stringify(prog);
  r.tipoMedida = MEDIDAS_EDU_.indexOf(String(r.tipoMedida || '')) >= 0 ? String(r.tipoMedida) : '';
  r.tipoMedidaOutro = textoEdu_(r.tipoMedidaOutro, 120); r.publicoOutro = textoEdu_(r.publicoOutro, 120); r.programaOutro = textoEdu_(r.programaOutro, 120);
  r.municipio = textoEdu_(r.municipio, 80); r.local = textoEdu_(r.local, 200); r.descricao = String(r.descricao == null ? '' : r.descricao).trim().slice(0, 3000);
  r.obs = String(r.obs == null ? '' : r.obs).trim().slice(0, 2000); r.hora = textoEdu_(r.hora, 5); r.motivoCancel = textoEdu_(r.motivoCancel, 300);
  r.pessoas = Math.max(pessoas, 0); r.folders = Math.max(folders, 0);
  if (Number(r.numero) > 0 && Number(r.ano) > 0) r.numeroTxt = numeroTxtEdu_(Number(r.numero), Number(r.ano), r.unidade);
  if (!estrito) return r;
  const falta = function (msg) { throw new Error(msg); };
  if (!r.unidade) falta('Informe a unidade (lotação do servidor).');
  if (!diaValido_(r.data)) falta('Informe a data da ação.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora)) falta('Informe a hora da ação.');
  if (!r.municipio) falta('Informe o município.');
  if (!r.local) falta('Informe o local da ação.');
  if (!r.tipoMedida) falta('Escolha o tipo de medida.');
  if (r.tipoMedida === 'Outro' && !r.tipoMedidaOutro) falta('Descreva o tipo de medida (Outro).');
  if (!pub.length) falta('Escolha o público-alvo.');
  if (pub.indexOf('Outro') >= 0 && !r.publicoOutro) falta('Descreva o público-alvo (Outro).');
  if (!prog.length) falta('Escolha os programas ou pragas abordados.');
  if (prog.indexOf('Outro') >= 0 && !r.programaOutro) falta('Descreva o programa ou a praga (Outro).');
  if (!r.descricao) falta('Descreva a ação.');
  if (pessoas < 0) falta('Informe o número de pessoas orientadas (inteiro, 0 ou mais).');
  if (folders < 0) falta('O número de folders deve ser um inteiro, 0 ou mais.');
  if (!r.servidor || !r.cargo || !r.lotacao) falta('Complete os dados do servidor (nome, cargo e lotação).');
  return r;
}

/** Último nº usado por "UNIDADE|ano" (base para o número provisório sem internet). */
function ultimosEdu_() {
  const o = {};
  lerLeitura_('TermosEducacao').forEach(function (r) {
    if (!r.unidade || !r.ano) return;
    const k = r.unidade + '|' + r.ano;
    o[k] = Math.max(o[k] || 0, r.numero);
  });
  lerLeitura_('Numeracao').forEach(function (r) {
    if (String(r.id).indexOf(SEQUENCIAS.EDU.prefixo) !== 0 || !r.barreira || !r.ano) return;
    const k = r.barreira + '|' + r.ano;
    o[k] = Math.max(o[k] || 0, r.ultimo);
  });
  return o;
}

/** "Qual é o próximo número?" do Termo de Educação Sanitária (unidade/ano). Não reserva nada. */
function educacaoProximoNumero_(req) {
  const unidade = unidadePce_(req.unidade), ano = Number(req.ano) || Number(hojeManaus_().slice(0, 4));
  if (!unidade) throw new Error('Informe a unidade.');
  const u = ultimoSeq_('EDU', unidade, ano);
  return { ok: true, unidade: unidade, ano: ano, ultimo: u.ultimo, proximo: u.ultimo + 1,
           ultimoReg: u.ref ? { numeroTxt: u.ref.numeroTxt, data: u.ref.data, hora: u.ref.hora, usuario: u.ref.usuario } : null };
}

/** Grava o termo só se o número ainda estiver livre (sob lock); número ocupado devolve emitido = false com o próximo livre. */
function educacaoRegistrar_(req, usuario) {
  const r = normalizarTermoEdu_(req.registro || {}, true);
  const unidade = r.unidade, ano = Number(r.ano) || 0, numero = Number(r.numero) || 0;
  if (!r.id || !ano || numero < 1) throw new Error('Dados do Termo de Educação Sanitária incompletos.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const todos = lerLeitura_('TermosEducacao');
    const ocupante = todos.filter(function (x) { return x.unidade === unidade && x.ano === ano && x.numero === numero && x.id !== r.id && x.excluido !== 1; })[0];
    if (ocupante) {
      const u = ultimoSeq_('EDU', unidade, ano, todos);
      return { ok: true, emitido: false, ocupadoPor: { numeroTxt: ocupante.numeroTxt, data: ocupante.data, hora: ocupante.hora, usuario: ocupante.usuario },
               ultimo: u.ultimo, proximo: u.ultimo + 1 };
    }
    const agora = Date.now(), antes = todos.filter(function (x) { return x.id === r.id; })[0];
    if (antes && !mesmoDono_(antes.usuario, usuario)) throw new Error(MSG_REGISTRO_ALHEIO_);   // mesmo id de termo de outro login (IDOR)
    r.emitidoEm = (antes && antes.emitidoEm) || agora;
    gravar_('TermosEducacao', [r], agora, usuario);
    return { ok: true, emitido: true, numero: numero, numeroTxt: r.numeroTxt, emitidoEm: r.emitidoEm, srv_ts: agora };
  } finally {
    lock.releaseLock();
  }
}
