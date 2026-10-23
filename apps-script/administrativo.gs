/* ---------- Portal do Administrativo (web/administrativo/; login com matrícula e senha, permissão `administracao`) ----------
 * O Administrativo da GDV (3 pessoas) lança no portal os dados que não vêm do app de campo: desembolso e execução física do convênio
 * (e a importação da planilha de movimentação), as linhas manuais dos relatórios (quadro PCE, colunas por município, CFO/CFOC, PTV,
 * educação sanitária, armadilhas do HLB) e o VIGIFITO por posto × mês (com a importação da planilha de controle). O painel do
 * gerente só mostra os dados e gera os relatórios: as actions painel* de gravação desses dados recusam (MSG_PORTAL).
 * Login: `entrar` com aplicativo administracao (usuarios.gs); o token vai em `sessao`. admId nos lançamentos e no histórico = id do usuário.
 * As abas Administrativo e AdmSessoes ficam só como histórico (não valem mais como credencial).
 */
const MSG_PORTAL = 'Lançamentos são feitos no Portal do Administrativo (no painel, só leitura).';

/** SHA-256 em hex (64 caracteres). */
function hexSha_(txt) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(txt), Utilities.Charset.UTF_8)
    .map(function (x) { return ((x + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}

/** Valida o token do portal (sessão de matrícula e senha com `administracao`): {admId, nome, email: '', expiraEm: 0}. */
function admSessao_(tok) {
  return usuarioDoPortal_(tok);
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
  admSair: sair_, admDados: admDados_, admConvLancar: admConvLancar_, admConvExcluir: admConvExcluir_, admConvFinLancar: admConvFinLancar_,
  admConvFinExcluir: admConvFinExcluir_, admConvFinImportar: admConvFinImportar_, admRelDados: admRelDados_, admRelLancar: admRelLancar_,
  admHistorico: admHistorico_, admVigDados: admVigDados_, admVigLancar: admVigLancar_, admVigImportar: admVigImportar_,
  admPlantaoImportar: admPlantaoImportar_
  };
}
/** Roteador das actions do portal: sessão com `administracao` obrigatória. */
function admAcao_(req) {
  const fn = admAcoes_()[req.action];
  if (!fn) throw new Error('Ação inválida.');
  if (req.action === 'admSair') return sair_(req);   // sai até com a senha provisória pendente
  return fn(admSessao_(req.sessao), req);
}
