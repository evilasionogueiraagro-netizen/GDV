/* ---------- Portal do Administrativo (web/administrativo/; login com matrícula e senha, ou código de ativação na transição) ----------
 * O Administrativo da GDV (3 pessoas) lança no portal os dados que não vêm do app de campo: desembolso e execução física do convênio
 * (e a importação da planilha de movimentação), as linhas manuais dos relatórios (quadro PCE, colunas por município, CFO/CFOC, PTV,
 * educação sanitária, armadilhas do HLB) e o VIGIFITO por posto × mês (com a importação da planilha de controle). O painel do
 * gerente só mostra os dados e gera os relatórios: as actions painel* de gravação desses dados recusam (MSG_PORTAL).
 * Login novo: `entrar` (usuarios.gs); o token que começa com "u." vira a sessão do portal em admSessao_ (permissão `administracao`).
 * Caminho antigo (enquanto os acessos antigos não são desligados): código de 6 dígitos gerado no painel (admCodigo {codigo}) → token de
 * SESSÃO do portal (aleatório; na planilha só o SHA-256), válido por 30 dias sem uso e renovado ao usar. O código é permanente (serve
 * para entrar de novo quando a sessão vence) até o gerente gerar outro ou revogar o acesso.
 * A sessão do portal não vale no painel nem no app (e as credenciais deles não valem aqui). Revogar no painel (ativo = 0) derruba a
 * sessão antiga na próxima chamada. Logins recusados: 10 em 15 min bloqueiam (CacheService).
 * LGPD: os e-mails ficam só na aba Administrativo (e no painel do administrador); lançamentos e histórico guardam o nome e o admId.
 */
const ADM_SESSAO_MS = 30 * 24 * 3600 * 1000;                 // sessão do portal: 30 dias sem uso (Sair ou revogar derruba na hora)
const ADM_MAX_PADRAO = 10;                                    // liberados ativos (propriedade do script ADM_MAX troca)
const ADM_MAX_FALHAS = 10;                                    // logins recusados (código) antes de bloquear 15 min
const MSG_PORTAL = 'Lançamentos são feitos no Portal do Administrativo (no painel, só leitura).';
const ADM_URL_PADRAO = 'https://evilasionogueiraagro-netizen.github.io/GDV/administrativo/';

function emailNorm_(v) { return String(v || '').trim().toLowerCase(); }
/** SHA-256 em hex (64 caracteres). */
function hexSha_(txt) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(txt), Utilities.Charset.UTF_8)
    .map(function (x) { return ((x + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
function admMax_() { const v = Number(PropertiesService.getScriptProperties().getProperty('ADM_MAX')); return v >= 1 && v <= 50 ? Math.round(v) : ADM_MAX_PADRAO; }
function admUrl_() { return PropertiesService.getScriptProperties().getProperty('ADM_URL') || ADM_URL_PADRAO; }
/** Conta um login recusado (bloqueio de 15 min depois de ADM_MAX_FALHAS) e lança o erro. */
function admFalhou_(msg) {
  const c = CacheService.getScriptCache();
  c.put('falhas_adm', String(Number(c.get('falhas_adm') || 0) + 1), 900);
  throw new Error(msg);
}
function admBloqueado_() {
  if (Number(CacheService.getScriptCache().get('falhas_adm') || 0) >= ADM_MAX_FALHAS) throw new Error('Muitas tentativas recusadas. Aguarde 15 minutos e tente de novo.');
}

/** Login por código de 6 dígitos (gerado no painel para um liberado). Permanente: vale em todo login até o gerente gerar outro
 * código para a pessoa ou revogar o acesso (as colunas codigoExpira antigas são ignoradas). */
function admCodigo_(req) {
  exigirAcessosAntigos_();
  admBloqueado_();
  const cod = String(req.codigo || '').replace(/\D/g, '');
  if (cod.length !== 6) admFalhou_('O código tem 6 dígitos.');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const t = lerTudo_('Administrativo'), agora = Date.now();
    for (let i = 0; i < t.valores.length; i++) {
      const a = paraObjeto_(t.cols, t.valores[i]);
      if (!a.id || !a.codigo || a.codigo.padStart(6, '0') !== cod) continue;
      if (a.ativo !== 1) admFalhou_('Este acesso foi revogado pelo gerente.');
      return admNovaSessao_(a, 'codigo');
    }
    admFalhou_('Código incorreto ou substituído por um novo. Confira com o gerente.');
  } finally { lock.releaseLock(); }
}

/** Nova sessão do portal (o chamador segura o lock): token aleatório devolvido uma vez; na planilha, só o SHA-256. */
function admNovaSessao_(a, origem) {
  const tok = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase(), agora = Date.now();
  const s = { id: Utilities.getUuid(), hash: hexSha_(tok), admId: a.id, origem: origem, criadoEm: agora, expiraEm: agora + ADM_SESSAO_MS, ultimoUso: agora, revogado: 0 };
  const sh = aba_('AdmSessoes'), cols = TABELAS.AdmSessoes;
  sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length).setValues([cols.map(function (c) { return s[c]; })]);
  admMarcarAcesso_(a.id, agora);
  return { ok: true, sessao: tok, nome: a.nome, email: emailNorm_(a.email), expiraEm: s.expiraEm, origem: origem };
}
function admMarcarAcesso_(id, agora) {
  const t = lerTudo_('Administrativo'), iu = t.cols.indexOf('ultimoAcesso');
  for (let i = 0; i < t.valores.length; i++) if (String(t.valores[i][0]) === String(id)) { t.sh.getRange(i + 2, iu + 1).setValue(agora); return; }
}

/** Valida o token de sessão do portal; renova a validade (30 dias a partir do uso). Liberado revogado = sessão recusada. */
function admSessao_(tok) {
  tok = String(tok || '');
  if (ehTokenUsuario_(tok)) return usuarioDoPortal_(tok);                    // matrícula e senha (usuarios.gs): exige `administracao`
  exigirAcessosAntigos_();
  if (!/^[0-9a-f]{64}$/.test(tok)) throw new Error('Sessão do portal inválida. Entre de novo.');
  const h = hexSha_(tok), t = lerTudo_('AdmSessoes'), agora = Date.now(), ih = t.cols.indexOf('hash');
  for (let i = t.valores.length - 1; i >= 0; i--) {
    if (String(t.valores[i][ih]) !== h) continue;
    const s = paraObjeto_(t.cols, t.valores[i]);
    if (s.revogado === 1) break;
    if (s.expiraEm <= agora) throw new Error('Sessão do portal expirada (30 dias sem uso). Entre de novo com o mesmo código de ativação.');
    const a = lerLeitura_('Administrativo').filter(function (x) { return x.id === s.admId; })[0];
    if (!a || a.ativo !== 1) throw new Error('Sessão do portal revogada: o acesso foi retirado pelo gerente.');
    if (s.expiraEm - agora < ADM_SESSAO_MS - 5 * 60 * 1000) {                 // renova (no máximo uma escrita a cada 5 min)
      s.expiraEm = agora + ADM_SESSAO_MS; s.ultimoUso = agora;
      t.sh.getRange(i + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return s[c]; })]);
      admMarcarAcesso_(a.id, agora);
    }
    return { admId: a.id, nome: a.nome, email: emailNorm_(a.email), expiraEm: s.expiraEm };
  }
  throw new Error('Sessão do portal encerrada. Entre de novo.');
}

/** Sair: a sessão é revogada no servidor (cópias do token deixam de valer). */
function admSair_(s, req) {
  const h = hexSha_(String(req.sessao || '')), t = lerTudo_('AdmSessoes'), ih = t.cols.indexOf('hash'), ir = t.cols.indexOf('revogado');
  for (let i = 0; i < t.valores.length; i++) if (String(t.valores[i][ih]) === h) t.sh.getRange(i + 2, ir + 1).setValue(1);
  return { ok: true };
}

/** Histórico de alterações feitas no portal: [registro, antes, depois] por linha (JSON limitado). */
function admHistLote_(s, acao, aba, itens) {
  if (!itens || !itens.length) return;
  const lim = function (o) {
    if (o === null || o === undefined || o === '') return '';
    const j = typeof o === 'string' ? o : JSON.stringify(o);
    return (j.length > 3000 ? j.slice(0, 2990) + '…' : j).replace(/^[=+\-@]/, "'$&");
  };
  const sh = aba_('AdmHistorico'), cols = TABELAS.AdmHistorico, agora = Date.now();
  const linhas = itens.map(function (x) {
    const o = { em: agora, admId: s.admId, nome: s.nome, acao: acao, aba: aba, registro: String(x[0] || '').slice(0, 200), antes: lim(x[1]), depois: lim(x[2]) };
    return cols.map(function (c) { return o[c]; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, linhas.length, cols.length).setValues(linhas);
}

/** Servidores cadastrados (aba Fiscais, sem administradores) para o desembolso de diárias: id estável (hash do nome) e nome. */
function admServidores_() {
  const vistos = {}, out = [];
  lerLeitura_('Fiscais').forEach(function (f) {
    if (!f.nome || f.perfil === 'admin') return;
    const k = nomeChave_(f.nome); if (vistos[k]) return;
    vistos[k] = 1; out.push({ id: 'srv-' + hexSha_('srv:' + k).slice(0, 12), nome: f.nome });
  });
  return out.sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}

/** Nomes de servidores já usados em diárias (para o autopreenchimento do portal): o nome mais recente de cada pessoa. */
function admServidoresDiaria_() {
  const por = {};
  lerLeitura_('ConvFinanceiro').forEach(function (r) {
    if (!r.id || r.excluido === 1 || !r.servidorNome) return;
    const k = nomeChave_(r.servidorNome), t = Number(r.atualizadoEm) || 0;
    if (!por[k] || t >= por[k].t) por[k] = { id: 'srv-' + hexSha_('srv:' + k).slice(0, 12), nome: String(r.servidorNome), t: t };
  });
  return Object.keys(por).map(function (k) { return { id: por[k].id, nome: por[k].nome }; }).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}

/* ----- actions do portal (todas exigem a sessão) ----- */
const autorAdm_ = function (s) { return { nome: s.nome, admId: s.admId }; };
function admDados_(s) {
  const vivo = function (r) { return r.id && r.excluido !== 1; };
  return { ok: true, nome: s.nome, email: s.email, expiraEm: s.expiraEm, hoje: hojeManaus_(), painelUrl: painelUrl_(),
           convenios: convListar_(), servidores: admServidoresDiaria_(),
           lancamentos: lerLeitura_('ConvLancamentos').filter(vivo).map(convLancOut_),
           financeiro: lerLeitura_('ConvFinanceiro').filter(vivo).map(convFinOutAdm_) };
}
function admConvLancar_(s, req) {
  const r = convLancar_(autorAdm_(s), req.lancamento);
  admHistLote_(s, r.antes ? 'editar' : 'lançar', 'ConvLancamentos', [[r.lancamento.id, r.antes, r.lancamento]]);
  if (r.financeiro) admHistLote_(s, r.finAntes ? 'editar' : 'lançar', 'ConvFinanceiro', [[r.financeiro.id, r.finAntes, r.financeiro]]);
  delete r.antes; delete r.finAntes; return r;
}
function admConvFinLancar_(s, req) {
  const r = convFinLancar_(autorAdm_(s), req.lancamento);
  admHistLote_(s, r.antes ? 'editar' : 'lançar', 'ConvFinanceiro', [[r.lancamento.id, r.antes, r.lancamento]]);
  delete r.antes; return r;
}
function admConvExcluir_(s, req) {
  const r = convExcluir_(autorAdm_(s), 'ConvLancamentos', req.id);
  admHistLote_(s, 'excluir', 'ConvLancamentos', [[r.id, r.antes, { excluido: 1 }]]);
  // bem: sem outro lançamento "adquirido"/"entregue" desse bem, o desembolso da aquisição também sai do Financeiro
  const a = r.antes;
  if (a.tipo === 'bem' && (a.situacao === 'adquirido' || a.situacao === 'entregue')) {
    const resta = lerLeitura_('ConvLancamentos').some(function (x) { return x.id && x.excluido !== 1 && x.convenio === a.convenio && x.tipo === 'bem' && x.submeta === a.submeta && (x.situacao === 'adquirido' || x.situacao === 'entregue'); });
    const f = resta ? null : lerLeitura_('ConvFinanceiro').filter(function (x) { return x.id && x.excluido !== 1 && x.chave === convChaveBem_(convDe_(a.convenio), a.submeta); })[0];
    if (f) { const rf = convExcluir_(autorAdm_(s), 'ConvFinanceiro', f.id); admHistLote_(s, 'excluir', 'ConvFinanceiro', [[rf.id, rf.antes, { excluido: 1 }]]); r.finExcluido = rf.id; }
  }
  delete r.antes; return r;
}
function admConvFinExcluir_(s, req) {
  const r = convExcluir_(autorAdm_(s), 'ConvFinanceiro', req.id);
  admHistLote_(s, 'excluir', 'ConvFinanceiro', [[r.id, r.antes, { excluido: 1 }]]); delete r.antes; return r;
}
function admConvFinImportar_(s, req) {
  const r = convFinImportar_(autorAdm_(s), req);
  admHistLote_(s, 'importar', 'ConvFinanceiro', [['arquivo: ' + r.arquivo, '', { novos: r.novos, atualizados: r.atualizados, iguais: r.iguais, excluidos: r.excluidos }]]);
  return r;
}
/** Lançamentos manuais do Relatório GDV no ano (com quem/quando), para o portal. */
function admRelDados_(s, req) {
  const ano = req.ano ? anoRelGdv_(req.ano) : Number(hojeManaus_().slice(0, 4));
  return { ok: true, ano: ano, hoje: hojeManaus_(),
    lancamentos: lerLeitura_('RelGdvLancamentos').filter(function (r) { return r.id && r.ano === ano; }).map(function (r) {
      return { mes: r.mes, chave: r.chave, valor: numOuNulo_(r.valor), lista: r.lista ? lerJSONSeguro_(r.lista, []) : null, usuario: r.usuario, atualizadoEm: r.atualizadoEm }; }) };
}
function admRelLancar_(s, req) { return relGdvLancar_(s, req); }
/** Histórico (últimas 300 alterações; filtro opcional por aba/registro). */
function admHistorico_(s, req) {
  const aba = String(req.aba || ''), reg = String(req.registro || '');
  const l = lerLeitura_('AdmHistorico').filter(function (h) { return h.em && (!aba || h.aba === aba) && (!reg || h.registro === reg); });
  return { ok: true, historico: l.slice(-300).reverse().map(function (h) { return { em: h.em, nome: h.nome, acao: h.acao, aba: h.aba, registro: h.registro, antes: h.antes, depois: h.depois }; }) };
}

/** Actions do portal → função. Montado na chamada: as funções ficam em outros .gs, que podem carregar depois deste. */
function admAcoes_() {
  return {
  admSair: admSair_, admDados: admDados_, admConvLancar: admConvLancar_, admConvExcluir: admConvExcluir_, admConvFinLancar: admConvFinLancar_,
  admConvFinExcluir: admConvFinExcluir_, admConvFinImportar: admConvFinImportar_, admRelDados: admRelDados_, admRelLancar: admRelLancar_,
  admHistorico: admHistorico_, admVigDados: admVigDados_, admVigLancar: admVigLancar_, admVigImportar: admVigImportar_,
  admPlantaoImportar: admPlantaoImportar_
  };
}
/** Roteador das actions do portal: sessão obrigatória (o token do painel/app não vale aqui). */
function admAcao_(req) {
  const fn = admAcoes_()[req.action];
  if (!fn) throw new Error('Ação inválida.');
  if (req.action === 'admSair' && ehTokenUsuario_(req.sessao)) return sair_(req);   // sessão nova sai até com a senha provisória pendente
  return fn(admSessao_(req.sessao), req);
}

/* ----- painel → aba Servidores: lista de liberados do Administrativo (só administrador do painel) ----- */
function admLinhaOut_(a, agora) {
  const pend = !!a.codigo;                                                   // código permanente (até gerar outro ou revogar)
  const o = { id: a.id, email: emailNorm_(a.email), nome: a.nome, ativo: a.ativo === 1 ? 1 : 0, criadoEm: a.criadoEm, criadoPor: a.criadoPor, ultimoAcesso: a.ultimoAcesso || 0,
              codigo: pend ? a.codigo.padStart(6, '0') : '', codigoExpira: 0, atualizadoEm: a.atualizadoEm, atualizadoPor: a.atualizadoPor };
  if (Number(a.oculto) === 1) { o.oculto = 1; o.ocultoPor = a.ocultoPor || ''; o.ocultoEm = Number(a.ocultoEm) || 0; }   // só com ocultos:true ("Mostrar removidos")
  return o;
}
/** Lista dos liberados do portal. Sem os "removidos" (oculto = 1), a não ser com ocultos:true (vêm com oculto:1, ocultoPor, ocultoEm).
 *  ocultar:true = este back tem o painelAdmOcultar (o painel só mostra "Remover" se tiver). */
function painelAdmLista(token, ocultos) {
  adminDoToken_(token);
  const agora = Date.now(), comOcultos = ocultos === true || ocultos === 1 || ocultos === '1';
  const veCodigos = ehGerenciaAtual_();                                         // painel só leitura não recebe o código permanente de entrada do portal
  return { ok: true, max: admMax_(), url: admUrl_(), ocultar: true,
           liberados: lerLeitura_('Administrativo').filter(function (a) { return a.id && (comOcultos || a.oculto !== 1); }).map(function (a) {
             const o = admLinhaOut_(a, agora); if (!veCodigos) o.codigo = ''; return o; }) };
}
/**
 * Painel → bloco "Portal do Administrativo" → "Remover" (restaurar ausente/falso) ou "Restaurar" (restaurar: true) um liberado REVOGADO
 * (ativo = 0). Não apaga nada: remover grava oculto = 1, ocultoPor (administrador do painel) e ocultoEm; restaurar volta oculto = 0 e
 * mantém ocultoPor/ocultoEm como registro da última remoção. Liberado ativo não sai da lista (revogue antes). Reativar pelo
 * painelAdmSalvar (ativo = 1) também desfaz a remoção. Removido continua sem entrar no portal e fora do limite ADM_MAX (ativo = 0).
 */
function painelAdmOcultar(token, req) {
  const admin = adminDoToken_(token, true);
  req = req || {};
  const id = String(req.id || ''), restaurar = req.restaurar === true || req.restaurar === 1 || req.restaurar === '1';
  if (!id) throw new Error('Informe o liberado.');
  const quem = String(admin || 'Administrador').replace(/^[=+\-@\s]+/, '').slice(0, 120) || 'Administrador';   // texto, nunca fórmula
  return comLock_(function () {
    const a = lerLinhas_('Administrativo').filter(function (x) { return x.id && x.id === id; })[0];
    if (!a) throw new Error('Liberado não encontrado.');
    if (!restaurar && a.ativo === 1) throw new Error(a.nome + ' ainda está liberado no portal. Só sai da lista quem está revogado: revogue o acesso antes.');
    if (restaurar ? a.oculto === 1 : a.oculto !== 1) {
      atualizar_('Administrativo', a._linha, restaurar ? { oculto: 0 } : { oculto: 1, ocultoPor: quem, ocultoEm: Date.now() });
    }
    return { ok: true, id: a.id, nome: a.nome, oculto: restaurar ? 0 : 1 };
  });
}
/** Inclui/edita um liberado (e-mail, nome, ativo). ativo = 0 revoga: a sessão cai na próxima chamada do portal. */
function painelAdmSalvar(token, req) {
  const admin = adminDoToken_(token, true);
  req = req || {};
  const email = emailNorm_(req.email);
  if (!RE_EMAIL_.test(email) || email.length > 120) throw new Error('E-mail inválido.');
  const nome = nomeServidor_(req.nome), ativo = req.ativo === 0 || req.ativo === false || req.ativo === '0' ? 0 : 1;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const t = lerTudo_('Administrativo'), agora = Date.now(), id = String(req.id || '');
    let pos = -1, outros = 0;
    t.valores.forEach(function (l, i) {
      const a = paraObjeto_(t.cols, l); if (!a.id) return;
      if (id ? a.id === id : emailNorm_(a.email) === email) pos = i;
      else { if (emailNorm_(a.email) === email) throw new Error('Este e-mail já está na lista.'); if (a.ativo === 1) outros++; }
    });
    if (id && pos < 0) throw new Error('Liberado não encontrado.');
    if (ativo && outros >= admMax_()) throw new Error('Limite de ' + admMax_() + ' pessoas liberadas no Portal do Administrativo. Revogue alguém antes.');
    const a = pos >= 0 ? paraObjeto_(t.cols, t.valores[pos]) : { id: Utilities.getUuid(), criadoEm: agora, criadoPor: admin, ultimoAcesso: 0, codigo: '', codigoExpira: 0 };
    a.email = email; a.nome = nome; a.ativo = ativo; a.atualizadoEm = agora; a.atualizadoPor = admin;
    if (!ativo) { a.codigo = ''; a.codigoExpira = 0; }
    else if (a.oculto === 1) a.oculto = 0;                                       // reativado: volta à lista (ocultoPor/ocultoEm ficam como registro)
    const linha = t.cols.map(function (c) { const v = a[c]; return v === null || v === undefined ? '' : v; });
    if (pos >= 0) t.sh.getRange(pos + 2, 1, 1, t.cols.length).setValues([linha]);
    else t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length).setValues([linha]);
    if (!ativo) {                                                                  // revogado: sessões abertas também saem
      const ss = lerTudo_('AdmSessoes'), ia = ss.cols.indexOf('admId'), ir = ss.cols.indexOf('revogado');
      ss.valores.forEach(function (l, i) { if (String(l[ia]) === a.id && Number(l[ir]) !== 1) ss.sh.getRange(i + 2, ir + 1).setValue(1); });
    }
    return { ok: true, liberado: admLinhaOut_(a, agora) };
  } finally { lock.releaseLock(); }
}
/** Código de ativação do portal (6 dígitos, permanente: vale até gerar outro ou revogar) para um liberado ativo. */
function painelAdmCodigo(token, req) {
  const admin = adminDoToken_(token, true);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const t = lerTudo_('Administrativo'), agora = Date.now(), id = String((req && req.id) || ''), emUso = {};
    let pos = -1;
    t.valores.forEach(function (l, i) { const a = paraObjeto_(t.cols, l); if (a.codigo) emUso[a.codigo.padStart(6, '0')] = 1; if (a.id && a.id === id) pos = i; });
    if (pos < 0) throw new Error('Liberado não encontrado.');
    const a = paraObjeto_(t.cols, t.valores[pos]);
    if (a.ativo !== 1) throw new Error('Acesso revogado: reative antes de gerar o código.');
    let codigo;
    do { codigo = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000).padStart(6, '0'); } while (emUso[codigo]);
    a.codigo = codigo; a.codigoExpira = 0; a.atualizadoEm = agora; a.atualizadoPor = admin;
    t.sh.getRange(pos + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return a[c]; })]);
    return { ok: true, id: a.id, nome: a.nome, codigo: codigo, expiraEm: 0, permanente: true, url: admUrl_() };
  } finally { lock.releaseLock(); }
}
