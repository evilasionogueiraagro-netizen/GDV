/* ---------- Sinal do aparelho (heartbeat) ---------- */

const PLATAFORMAS_ = ['android', 'ios', 'outro'];
const RE_ID_APARELHO_ = /^[A-Za-z0-9-]{8,64}$/;
const PENDENTES_CHAVES_ = ['turnos', 'veiculos', 'tfs', 'levantamentos', 'colheitas', 'arquivos'];
/** Texto de uma linha, curto e que nunca vira fórmula na planilha. */
function textoCurto_(v, n) {
  return String(v === null || v === undefined ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().replace(/^[=+\-@\s]+/, '').slice(0, n);
}

/**
 * "ping" autenticado. Com {aparelho}: só grava o sinal, marcando situacao = 'erro' quando o aparelho relata um erro (o app chama
 * isto UMA vez quando o sync completo falha por erro do servidor, para o painel ver o motivo). Sem aparelho: teste de conexão.
 */
function ping_(req, usuario) {
  const agora = Date.now();
  if (req.aparelho && typeof req.aparelho === 'object') {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { registrarAparelho_(req.aparelho, usuario, agora, req.key, req.aparelho.ultimoErro ? 'erro' : 'ok', null); }
    finally { lock.releaseLock(); }
  }
  return { ok: true, nome: usuario, agora: agora };
}

/**
 * Grava/atualiza a linha do aparelho na aba Aparelhos (chamar com o lock). a = sinal enviado pelo app (null = versão antiga do app:
 * registra só "sincronizou agora" numa linha "legado-"). aceitos = quantos registros de cada tipo chegaram neste envio (descontados
 * dos pendentes informados, que o app conta antes de enviar) e os ids dos turnos encerrados aceitos.
 */
function registrarAparelho_(a, usuario, agora, key, situacao, aceitos) {
  const cred = String(key || '').slice(0, 8);
  let o;
  if (a && typeof a === 'object' && RE_ID_APARELHO_.test(String(a.id || ''))) {
    const pend = {}, ac = aceitos || {}, encAceitos = ac.encerrados || {};
    PENDENTES_CHAVES_.forEach(function (k) {
      let n = Math.max(0, Math.floor(Number(a.pendentes && a.pendentes[k]) || 0));
      if (ac[k]) n = Math.max(0, n - ac[k]);
      if (n) pend[k] = Math.min(n, 999999);
    });
    const enc = (Array.isArray(a.turnosEncerradosPendentes) ? a.turnosEncerradosPendentes : []).map(function (id) { return String(id || '').slice(0, 64); })
      .filter(function (id) { return id && !encAceitos[id]; }).slice(0, 20);
    const fim = {};
    enc.forEach(function (id) { const f = a.fimPendentes && a.fimPendentes[id]; if (f && RE_HM_.test(String(f))) fim[id] = String(f); });
    const errEm = Number(a.ultimoErroEm) || 0;
    o = { id: String(a.id), usuario: usuario, versao: textoCurto_(a.versao, 40), plataforma: PLATAFORMAS_.indexOf(a.plataforma) >= 0 ? a.plataforma : 'outro',
          standalone: a.standalone ? 1 : 0, online: a.online === false ? 0 : 1, ultimoSinal: agora, pendentes: JSON.stringify(pend),
          turnoAtual: textoCurto_(a.turnoAtual, 64), turnosEncerradosPendentes: JSON.stringify(enc), fimPendentes: JSON.stringify(fim),
          ultimoErro: textoCurto_(a.ultimoErro, 200), ultimoErroEm: a.ultimoErro ? (errEm > 1e12 && errEm < agora + 864e5 ? errEm : agora) : 0,
          origem: a.origem === 'segundo-plano' ? 'segundo-plano' : 'app', situacao: situacao === 'erro' ? 'erro' : 'ok', cred: cred };
  } else {
    if (!cred) return;
    o = { id: 'legado-' + cred, usuario: usuario, versao: '', plataforma: '', standalone: 0, online: 1, ultimoSinal: agora, pendentes: '',
          turnoAtual: '', turnosEncerradosPendentes: '[]', fimPendentes: '{}', ultimoErro: '', ultimoErroEm: 0, origem: 'app', situacao: 'ok', cred: cred };
  }
  const t = lerTudo_('Aparelhos'), cols = t.cols;
  let idx = -1;
  t.valores.forEach(function (l, i) { if (String(l[0]) === o.id) idx = i; });
  if (idx >= 0) {
    const atual = paraObjeto_(cols, t.valores[idx]);
    o.primeiroSinal = atual.primeiroSinal || agora;
    if (!o.ultimoErro) { o.ultimoErro = atual.ultimoErro; o.ultimoErroEm = atual.ultimoErroEm; }   // o último erro fica como histórico
    t.sh.getRange(idx + 2, 1, 1, cols.length).setValues([cols.map(function (c) { return o[c]; })]);
  } else {
    o.primeiroSinal = agora;
    t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, cols.length).setValues([cols.map(function (c) { return o[c]; })]);
  }
}

/** Aparelhos lidos da planilha (JSON já interpretado). A linha "legado-" some quando o mesmo acesso já manda o sinal novo. */
function lerAparelhos_() {
  const lst = lerLeitura_('Aparelhos').filter(function (a) { return a.id && a.usuario; }).map(function (a) {
    const pend = lerJSONSeguro_(a.pendentes, {}), p = {};
    let total = 0;
    PENDENTES_CHAVES_.forEach(function (k) { const n = Math.max(0, Number(pend && pend[k]) || 0); if (n) { p[k] = n; total += n; } });
    const enc = lerJSONSeguro_(a.turnosEncerradosPendentes, []), fim = lerJSONSeguro_(a.fimPendentes, {});
    return { id: a.id, usuario: a.usuario, versao: a.versao, plataforma: a.plataforma, standalone: a.standalone, online: a.online, ultimoSinal: a.ultimoSinal,
             pendentes: p, pendentesTotal: total, turnoAtual: a.turnoAtual, turnosEncerradosPendentes: Array.isArray(enc) ? enc.map(String) : [],
             fimPendentes: fim && typeof fim === 'object' && !Array.isArray(fim) ? fim : {}, ultimoErro: a.ultimoErro, ultimoErroEm: a.ultimoErroEm || 0,
             origem: a.origem, situacao: a.situacao || 'ok', cred: a.cred, legado: a.id.indexOf('legado-') === 0 };
  });
  const novos = {};
  lst.forEach(function (a) { if (!a.legado && a.cred) novos[a.cred] = true; });
  return lst.filter(function (a) { return !a.legado || !novos[a.cred]; });
}
/** Resumo de um aparelho para o painel (sem id nem credencial). */
function resumoAparelho_(a) {
  return { versao: a.versao, plataforma: a.plataforma, standalone: a.standalone, ultimoSinal: a.ultimoSinal, origem: a.origem, legado: a.legado,
           pendentes: a.pendentes, pendentesTotal: a.pendentesTotal, encerradosPendentes: a.turnosEncerradosPendentes.length,
           ultimoErro: a.ultimoErro, ultimoErroEm: a.ultimoErroEm, erroAtual: a.situacao === 'erro' };
}
