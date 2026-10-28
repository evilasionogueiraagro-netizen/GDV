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
const sobrepoe_ = function (a, b) { return a.inicio <= b.fim && b.inicio <= a.fim; };

/** Escalas que tocam o intervalo [de, ate] (padrão: 60 dias para trás e 90 para a frente) + os fiscais que podem ser escalados. */
function escalaDados_(req) {
  const hoje = hojeManaus_(), de = diaValido_(req && req.de) ? req.de : somarDias_(hoje, -60), ate = diaValido_(req && req.ate) ? req.ate : somarDias_(hoje, 90);
  const escalas = escalasVivas_().filter(function (e) { return sobrepoe_(e, { inicio: de, fim: ate }); })
    .sort(function (a, b) { return a.bva.localeCompare(b.bva, 'pt-BR') || a.inicio.localeCompare(b.inicio); });
  return { ok: true, hoje: hoje, de: de, ate: ate, escalas: escalas, fiscais: fiscaisEscalaveis_() };
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
  const ids = Array.isArray(e.fiscais) ? e.fiscais.map(function (x) { return String(x && x.id || x || '').trim(); }).filter(Boolean) : [];
  if (ids.length > ESCALA_MAX_FISCAIS_) throw new Error('Fiscais demais na mesma escala.');
  const situacao = e.situacao === 'publicada' ? 'publicada' : 'rascunho';
  return comLock_(function () {
    const porId = {}; fiscaisEscalaveis_().forEach(function (f) { porId[f.id] = f; });
    const fiscais = [], vistos = {};
    ids.forEach(function (id) { if (vistos[id]) return; vistos[id] = 1; if (!porId[id]) throw new Error('Fiscal não encontrado ou sem acesso ao app de campo.'); fiscais.push({ id: id, nome: porId[id].nome }); });
    if (situacao === 'publicada' && !fiscais.length) throw new Error('Escolha pelo menos um fiscal para publicar a escala.');
    const linhas = lerLinhas_('Escalas'), id = String(e.id || '').trim(), atual = id ? linhas.filter(function (x) { return x.id === id && Number(x.excluido) !== 1; })[0] : null;
    if (id && !atual) throw new Error('Esta escala não existe mais (foi excluída). Atualize a tela.');
    const agora = Date.now(), nova = { inicio: inicio, fim: fim };
    const outras = linhas.filter(function (x) { return x.id && x.id !== id && Number(x.excluido) !== 1; }).map(escalaOut_).filter(function (x) { return sobrepoe_(x, nova); });
    const avisos = [];
    outras.filter(function (x) { return normPub_(x.bva) === normPub_(bva); }).forEach(function (x) { avisos.push('Já há escala da ' + bva + ' que se sobrepõe a este período (' + diaBR_(x.inicio) + ' a ' + diaBR_(x.fim) + ').'); });
    fiscais.forEach(function (f) {
      outras.filter(function (x) { return normPub_(x.bva) !== normPub_(bva) && x.fiscais.some(function (y) { return y.id === f.id; }); })
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
  return escalaExcluir_(req.id, usuario);
}
/* painel (token): leitura para quem abre o painel; gravação só a gerência */
function painelEscalas(token, req) { adminDoToken_(token); return escalaDados_(req); }
function painelEscalaSalvar(token, req) { return escalaSalvar_(req && req.escala, adminDoToken_(token, true)); }
function painelEscalaExcluir(token, req) { return escalaExcluir_(req && req.id, adminDoToken_(token, true)); }

