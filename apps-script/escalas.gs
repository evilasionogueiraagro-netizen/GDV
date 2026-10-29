/* ---------- Escalas de plantão (coordenação de barreira e trânsito) ----------
 * Uma linha da aba Escalas por BVA e período: o período varia por BVA (início e fim escolhidos por quem monta) e a equipe é a lista
 * de fiscais escalados no período (JSON [{id, nome}], ids da aba Usuarios). Quem monta: a permissão coordenacaoBarreiras (app de
 * campo: escalaDados/escalaSalvar/escalaExcluir) e a gerência (painel: painelEscalas/painelEscalaSalvar/painelEscalaExcluir).
 * Rascunho → publicada (só a publicada chega aos fiscais e conta no painel). Excluir é lógico; toda gravação vai para
 * HistoricoDeAlteracoes. O fiscal recebe as próprias escalas publicadas no sync (minhasEscalas).
 */
const ESCALA_MAX_DIAS_ = 62, ESCALA_MAX_FISCAIS_ = 40;
const MSG_SEM_ESCALA_ = 'Sem autorização para montar escalas. Fale com a gerência (permissão "Coordenação de barreira e trânsito").';

/** Fiscais que podem ser escalados: contas ativas com o app de campo. [{id, nome, matricula}] por nome. */
function fiscaisEscalaveis_() {
  const perm = permissoesAtivasPorUsuario_(lerLeitura_('PermissoesDosUsuarios'));
  return lerLeitura_('Usuarios').filter(function (u) { return u.id && u.ativo === 1 && permissoesEfetivas_(perm[u.id] || []).indexOf('campo') >= 0; })
    .map(function (u) { return { id: u.id, nome: u.nome, matricula: u.matricula }; })
    .sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
}

/** Escala da planilha → objeto para as telas (fiscais como lista). */
function escalaOut_(e) {
  return { id: e.id, bva: e.bva, inicio: String(e.inicio).slice(0, 10), fim: String(e.fim).slice(0, 10), fiscais: lerJSONSeguro_(e.fiscais, []),
           situacao: e.situacao === 'publicada' ? 'publicada' : 'rascunho', atualizadoEm: Number(e.atualizadoEm) || 0, atualizadoPor: e.atualizadoPor || '',
           publicadaEm: Number(e.publicadaEm) || 0, publicadaPor: e.publicadaPor || '' };
}
const escalasVivas_ = function () { return lerLeitura_('Escalas').filter(function (e) { return e.id && Number(e.excluido) !== 1; }).map(escalaOut_); };
// sobrepõem-se; encostar só no dia da troca (um acaba no dia em que o outro começa, como no Jundiá) não conta (= CONFIG.sobrepoeEscala)
const sobrepoe_ = function (a, b) {
  if (!(a.inicio <= b.fim && b.inicio <= a.fim)) return false;
  const encosta = function (x, y) { return x.fim === y.inicio && x.inicio < x.fim && y.inicio < y.fim; };
  return !(encosta(a, b) || encosta(b, a));
};
/** Chave do fiscal na escala: o id da conta; fiscal sem login (nome digitado) = "nome:<nome normalizado>". */
const chaveFiscal_ = function (f) { return f.id ? String(f.id) : 'nome:' + nomeChave_(f.nome); };

/** Escalas que tocam o intervalo [de, ate] (padrão: 60 dias para trás e 90 para a frente) + os fiscais que podem ser escalados. */
function escalaDados_(req) {
  const hoje = hojeManaus_(), de = diaValido_(req && req.de) ? req.de : somarDias_(hoje, -60), ate = diaValido_(req && req.ate) ? req.ate : somarDias_(hoje, 90);
  const escalas = escalasVivas_().filter(function (e) { return sobrepoe_(e, { inicio: de, fim: ate }); })
    .sort(function (a, b) { return a.bva.localeCompare(b.bva, 'pt-BR') || a.inicio.localeCompare(b.inicio); });
  let fimConvenio = '';                                   // "Gerar períodos" vai, por padrão, até o fim da vigência do convênio (só com req.convenio)
  if (req && req.convenio) try { convListar_().forEach(function (c) { const f = c && c.vigencia && c.vigencia.fim; if (f && f > fimConvenio) fimConvenio = String(f); }); } catch (e) { /* sem convênio */ }
  const out = { ok: true, hoje: hoje, de: de, ate: ate, escalas: escalas, fiscais: fiscaisEscalaveis_() };
  if (req && req.convenio) out.fimConvenio = fimConvenio;
  return out;
}

/**
 * Grava (cria ou altera) uma escala. e = {id?, bva, inicio, fim, fiscais: [ids], situacao}. O nome de cada fiscal vem da aba Usuarios.
 * Devolve a escala gravada e os avisos (fiscal em outra BVA no mesmo período, outra escala da mesma BVA que se sobrepõe): não bloqueiam.
 */
function escalaSalvar_(e, quem) {
  if (!e || typeof e !== 'object') throw new Error('Escala não informada.');
  const bva = String(e.bva || '').trim().replace(/\s+/g, ' ');
  if (bva.length < 3 || bva.length > 60) throw new Error('Escolha a BVA.');
  const inicio = String(e.inicio || ''), fim = String(e.fim || '');
  if (!diaValido_(inicio) || !diaValido_(fim)) throw new Error('Informe o início e o fim do período (datas válidas).');
  if (fim < inicio) throw new Error('O fim do período é antes do início.');
  if (somarDias_(inicio, ESCALA_MAX_DIAS_) < fim) throw new Error('Período longo demais (até ' + ESCALA_MAX_DIAS_ + ' dias).');
  // cada fiscal: id da conta (ou {id}) ou, quem ainda não tem login, {nome} (fica marcado semLogin; troca-se pela conta depois)
  const ids = Array.isArray(e.fiscais) ? e.fiscais.map(function (x) {
    if (x && typeof x === 'object' && !x.id) return { nome: textoAutor_(String(x.nome || '').trim().replace(/\s+/g, ' ')).slice(0, 80) };
    return String(x && x.id || x || '').trim();
  }).filter(function (x) { return typeof x === 'string' ? x : x.nome; }) : [];
  if (ids.length > ESCALA_MAX_FISCAIS_) throw new Error('Fiscais demais na mesma escala.');
  ids.forEach(function (x) { if (typeof x !== 'string' && x.nome.length < 3) throw new Error('Nome do fiscal sem login curto demais.'); });
  const situacao = e.situacao === 'publicada' ? 'publicada' : 'rascunho';
  return comLock_(function () {
    const porId = {}; fiscaisEscalaveis_().forEach(function (f) { porId[f.id] = f; });
    const fiscais = [], vistos = {};
    ids.forEach(function (id) {
      if (typeof id !== 'string') { const k = chaveFiscal_(id); if (!vistos[k]) { vistos[k] = 1; fiscais.push({ id: '', nome: id.nome, semLogin: 1 }); } return; }
      if (vistos[id]) return; vistos[id] = 1; if (!porId[id]) throw new Error('Fiscal não encontrado ou sem acesso ao app de campo.'); fiscais.push({ id: id, nome: porId[id].nome });
    });
    if (situacao === 'publicada' && !fiscais.length) throw new Error('Escolha pelo menos um fiscal para publicar a escala.');
    const linhas = lerLinhas_('Escalas'), id = String(e.id || '').trim(), atual = id ? linhas.filter(function (x) { return x.id === id && Number(x.excluido) !== 1; })[0] : null;
    if (id && !atual) throw new Error('Esta escala não existe mais (foi excluída). Atualize a tela.');
    const agora = Date.now(), nova = { inicio: inicio, fim: fim };
    const outras = linhas.filter(function (x) { return x.id && x.id !== id && Number(x.excluido) !== 1; }).map(escalaOut_).filter(function (x) { return sobrepoe_(x, nova); });
    const avisos = [];
    outras.filter(function (x) { return normPub_(x.bva) === normPub_(bva); }).forEach(function (x) { avisos.push('Já há escala da ' + bva + ' que se sobrepõe a este período (' + diaBR_(x.inicio) + ' a ' + diaBR_(x.fim) + ').'); });
    fiscais.forEach(function (f) {
      outras.filter(function (x) { return normPub_(x.bva) !== normPub_(bva) && x.fiscais.some(function (y) { return chaveFiscal_(y) === chaveFiscal_(f); }); })
        .forEach(function (x) { avisos.push(f.nome + ' também está na ' + x.bva + ' (' + diaBR_(x.inicio) + ' a ' + diaBR_(x.fim) + ').'); });
    });
    const reg = { bva: bva, inicio: inicio, fim: fim, fiscais: JSON.stringify(fiscais), situacao: situacao, atualizadoEm: agora, atualizadoPor: textoAutor_(quem) };
    if (situacao === 'publicada' && (!atual || atual.situacao !== 'publicada')) { reg.publicadaEm = agora; reg.publicadaPor = textoAutor_(quem); }
    let novoId = id;
    if (atual) atualizar_('Escalas', atual._linha, reg);
    else { novoId = uuid_(); inserir_('Escalas', [Object.assign({ id: novoId, criadoEm: agora, criadoPor: textoAutor_(quem), excluido: 0 }, reg)]); }
    inserir_('HistoricoDeAlteracoes', [{ id: uuid_(), em: agora, usuarioId: (USUARIO_ATUAL_ && USUARIO_ATUAL_.id) || textoAutor_(quem), acao: atual ? 'alterar escala' : 'criar escala',
      tabela: 'Escalas', registroId: novoId, antes: atual ? JSON.stringify(escalaOut_(atual)) : '', depois: JSON.stringify(Object.assign({ id: novoId }, reg, { fiscais: fiscais })) }]);
    const gravada = escalaOut_(Object.assign({}, atual || {}, reg, { id: novoId }));
    return { ok: true, escala: gravada, avisos: avisos };
  });
}

/**
 * Gera de uma vez os períodos de uma BVA como rascunhos sem fiscais (o app calcula os períodos pelo regime da BVA: CONFIG.gerarPeriodosEscala).
 * req = {bva, periodos: [{inicio, fim}]}. Pula o período que se sobrepõe a uma escala que a BVA já tem. Até 120 por vez.
 */
function escalaGerar_(req, quem) {
  const bva = String(req.bva || '').trim().replace(/\s+/g, ' ');
  if (bva.length < 3 || bva.length > 60) throw new Error('Escolha a BVA.');
  const ps = Array.isArray(req.periodos) ? req.periodos.slice(0, 120) : [];
  if (!ps.length) throw new Error('Nenhum período para gerar.');
  ps.forEach(function (p) {
    if (!p || !diaValido_(p.inicio) || !diaValido_(p.fim) || p.fim < p.inicio || somarDias_(p.inicio, ESCALA_MAX_DIAS_) < p.fim) throw new Error('Período inválido.');
  });
  return comLock_(function () {
    const ja = escalasVivas_().filter(function (x) { return normPub_(x.bva) === normPub_(bva); }), agora = Date.now(), novas = [], pulados = [];
    ps.forEach(function (p) {
      if (ja.concat(novas).some(function (x) { return sobrepoe_(x, p); })) { pulados.push(p); return; }
      novas.push({ id: uuid_(), bva: bva, inicio: p.inicio, fim: p.fim, fiscais: '[]', situacao: 'rascunho', criadoEm: agora, criadoPor: textoAutor_(quem),
                   atualizadoEm: agora, atualizadoPor: textoAutor_(quem), excluido: 0 });
    });
    inserir_('Escalas', novas);
    if (novas.length) inserir_('HistoricoDeAlteracoes', [{ id: uuid_(), em: agora, usuarioId: (USUARIO_ATUAL_ && USUARIO_ATUAL_.id) || textoAutor_(quem), acao: 'gerar períodos da escala',
      tabela: 'Escalas', registroId: bva, antes: '', depois: JSON.stringify(novas.map(function (x) { return [x.id, x.inicio, x.fim]; })) }]);
    return { ok: true, criados: novas.length, pulados: pulados.length };
  });
}
/** Exclusão lógica (excluido = 1), com o registro em HistoricoDeAlteracoes. */
function escalaExcluir_(id, quem) {
  id = String(id || '').trim();
  if (!id || id.length > 64) throw new Error('Escala não informada.');
  return comLock_(function () {
    const atual = lerLinhas_('Escalas').filter(function (x) { return x.id === id && Number(x.excluido) !== 1; })[0];
    if (!atual) throw new Error('Esta escala não existe mais. Atualize a tela.');
    const agora = Date.now();
    atualizar_('Escalas', atual._linha, { excluido: 1, atualizadoEm: agora, atualizadoPor: textoAutor_(quem) });
    inserir_('HistoricoDeAlteracoes', [{ id: uuid_(), em: agora, usuarioId: (USUARIO_ATUAL_ && USUARIO_ATUAL_.id) || textoAutor_(quem), acao: 'excluir escala',
      tabela: 'Escalas', registroId: id, antes: JSON.stringify(escalaOut_(atual)), depois: '' }]);
    return { ok: true };
  });
}

/** Escalas publicadas do fiscal que ainda não acabaram (sync: o app mostra "Sua escala" e propõe a BVA ao iniciar o turno). */
function minhasEscalas_() {
  if (!USUARIO_ATUAL_ || !USUARIO_ATUAL_.id) return [];
  const hoje = hojeManaus_(), eu = USUARIO_ATUAL_.id;
  return escalasVivas_().filter(function (e) { return e.situacao === 'publicada' && e.fim >= hoje && e.fiscais.some(function (f) { return f.id === eu; }); })
    .sort(function (a, b) { return a.inicio.localeCompare(b.inicio); }).slice(0, 6)
    .map(function (e) { return { id: e.id, bva: e.bva, inicio: e.inicio, fim: e.fim, equipe: e.fiscais.map(function (f) { return f.nome; }) }; });
}

/* app de campo (key): só com a permissão coordenacaoBarreiras */
function exigirEscala_() {
  if (USUARIO_ATUAL_ && USUARIO_ATUAL_.modulos && USUARIO_ATUAL_.modulos.escala === 1) return;
  const e = new Error(MSG_SEM_ESCALA_); e.semPermissao = 'escala'; throw e;
}
function escalaAcao_(req, usuario) {
  exigirEscala_();
  if (req.action === 'escalaDados') return escalaDados_(req);
  if (req.action === 'escalaSalvar') return escalaSalvar_(req.escala, usuario);
  if (req.action === 'escalaGerar') return escalaGerar_(req, usuario);
  return escalaExcluir_(req.id, usuario);
}
/* painel (token): leitura para quem abre o painel; gravação só a gerência */
function painelEscalas(token, req) { adminDoToken_(token); return escalaDados_(req); }
function painelEscalaSalvar(token, req) { return escalaSalvar_(req && req.escala, adminDoToken_(token, true)); }
function painelEscalaGerar(token, req) { return escalaGerar_(req || {}, adminDoToken_(token, true)); }
function painelEscalaExcluir(token, req) { return escalaExcluir_(req && req.id, adminDoToken_(token, true)); }


/* ---------- Portal do Administrativo: diárias das escalas (PCDP) ----------
 * Cada fiscal de cada escala publicada é uma solicitação de diárias: "pendente" até o Administrativo marcar a PCDP concluída (nº
 * opcional). Uma linha da aba EscalaPcdp por escala × fiscal (id = escalaId|usuarioId), com quem e quando; desfazer volta a pendente.
 * Escala alterada depois da PCDP concluída aparece marcada para conferir; fiscal tirado da escala depois da PCDP também aparece. */
const ESCALA_PCDP_DIAS_ = 120;                  // escalas que acabaram há até 120 dias (e as futuras)
function admEscalas_(s) {
  const hoje = hojeManaus_(), de = somarDias_(hoje, -ESCALA_PCDP_DIAS_), pc = {};
  lerLeitura_('EscalaPcdp').forEach(function (r) { if (r.id) pc[r.id] = r; });
  const escalas = escalasVivas_().filter(function (e) { return e.situacao === 'publicada' && e.fim >= de; })
    .sort(function (a, b) { return b.inicio.localeCompare(a.inicio) || a.bva.localeCompare(b.bva, 'pt-BR'); })
    .map(function (e) {
      const dias = Math.round((Date.parse(e.fim + 'T12:00:00Z') - Date.parse(e.inicio + 'T12:00:00Z')) / 864e5) + 1;
      const linha = function (id, nome, naEscala) {
        const r = pc[e.id + '|' + id], ok = !!r && r.situacao === 'concluida';
        return { usuarioId: id, nome: nome, naEscala: naEscala, concluida: ok, pcdp: ok ? String(r.pcdp || '') : '', em: r ? Number(r.atualizadoEm) || 0 : 0,
                 por: r ? String(r.atualizadoPor || '') : '', alterada: ok && e.atualizadoEm > (Number(r.atualizadoEm) || 0) };
      };
      const fiscais = e.fiscais.map(function (f) { const o = linha(chaveFiscal_(f), f.nome, true); o.semLogin = f.id ? 0 : 1; return o; });
      Object.keys(pc).forEach(function (k) {                    // PCDP concluída de quem saiu da escala depois
        const r = pc[k]; if (r.escalaId !== e.id || r.situacao !== 'concluida' || e.fiscais.some(function (f) { return chaveFiscal_(f) === r.usuarioId; })) return;
        fiscais.push(linha(r.usuarioId, r.nome, false));
      });
      return { id: e.id, bva: e.bva, inicio: e.inicio, fim: e.fim, dias: dias, publicadaPor: e.publicadaPor, atualizadoPor: e.atualizadoPor, atualizadoEm: e.atualizadoEm, fiscais: fiscais };
    });
  return { ok: true, hoje: hoje, escalas: escalas };
}
/** Marca (ou desfaz) a PCDP concluída de um fiscal numa escala publicada. req = {escalaId, usuarioId, concluida, pcdp}. */
function admEscalaPcdp_(s, req) {
  const escalaId = String(req.escalaId || '').trim(), usuarioId = String(req.usuarioId || '').trim().slice(0, 100), concluida = req.concluida === true || req.concluida === 1;
  if (!escalaId || !usuarioId || escalaId.length > 64) throw new Error('Escala ou fiscal não informado.');
  const pcdp = String(req.pcdp || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return comLock_(function () {
    const e = escalasVivas_().filter(function (x) { return x.id === escalaId; })[0];
    if (!e || e.situacao !== 'publicada') throw new Error('Esta escala não está publicada (ou foi excluída). Atualize a tela.');
    const linhas = lerLinhas_('EscalaPcdp'), id = escalaId + '|' + usuarioId, atual = linhas.filter(function (r) { return r.id === id; })[0];
    const f = e.fiscais.filter(function (x) { return chaveFiscal_(x) === usuarioId; })[0];
    if (!f && !atual) throw new Error('Este fiscal não está na escala.');
    const agora = Date.now(), reg = { situacao: concluida ? 'concluida' : 'pendente', pcdp: concluida ? pcdp : '', atualizadoEm: agora, atualizadoPor: textoAutor_(s.nome), admId: s.admId };
    if (atual) atualizar_('EscalaPcdp', atual._linha, reg);
    else inserir_('EscalaPcdp', [Object.assign({ id: id, escalaId: escalaId, usuarioId: usuarioId, nome: f.nome }, reg)]);
    admHistLote_(s, concluida ? 'PCDP concluída' : 'PCDP desfeita', 'EscalaPcdp', [[id, atual ? { situacao: atual.situacao, pcdp: atual.pcdp } : '', { bva: e.bva, inicio: e.inicio, fim: e.fim, fiscal: (f || atual).nome, situacao: reg.situacao, pcdp: reg.pcdp }]]);
    return { ok: true, id: id, situacao: reg.situacao, pcdp: reg.pcdp, em: agora, por: reg.atualizadoPor };
  });
}
