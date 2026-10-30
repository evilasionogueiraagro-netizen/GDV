/* ---------- Turno compartilhado (pareamento) ----------
 * Um fiscal colabora no turno aberto do colega com o próprio login: o dono do turno pede um código (turnoConvidar, válido por
 * 15 min), o colega entra com ele (turnoParear) e passa a lançar veículos e TFs no mesmo turno. Na sincronização, quem participa
 * recebe o turno e os veículos de todos (turnosCompartilhados_ + lerMudancasTurnos_); o dono recebe os veículos dos colegas.
 * Só o dono grava o turno (gravar_) e o encerra; o colega sai quando quiser (turnoSair). O nome do colega entra em Turnos.colegas
 * e, na leitura (lerLeitura_), na lista de fiscais do turno: Termo, painel e produtividade contam o turno para os dois.
 * Tudo fica registrado na aba Pareamentos (quem convidou, quem entrou, quando entrou e saiu). Nada é apagado.
 */

const PAREAR_VALIDADE_MS = 15 * 60 * 1000;      // validade do código
const PAREAR_TENTATIVAS = 10;                   // códigos errados por login em 15 min (freia quem tenta adivinhar)
const PAREAR_JANELA_MS = 3 * 864e5;             // pareamento mais antigo que isto não entra mais na sincronização do colega
const RE_CODIGO_PAREAR_ = /^\d{6}$/;

/** Nomes do turno: os fiscais digitados no início e os colegas que entraram pelo código, sem repetir (mesma regra de nomeChave_). */
function fiscaisComColegas_(fiscal, colegas) {
  const nomes = String(fiscal || '').split(/\s+e\s+|,|;|\//).map(function (x) { return x.trim(); }).filter(Boolean), vistos = {};
  nomes.forEach(function (n) { vistos[nomeChave_(n)] = true; });
  lerJSONSeguro_(colegas, []).forEach(function (n) {
    n = String(n || '').trim();
    if (n && !vistos[nomeChave_(n)]) { vistos[nomeChave_(n)] = true; nomes.push(n); }
  });
  return nomes.join(' e ');
}

/**
 * Turnos e veículos que este login vê além dos próprios: {turnos: {id: true}, veiculos: {turnoId: true}}.
 * Como colega: os turnos em que entrou (sem ter saído) nos últimos dias. Como dono: os próprios turnos que têm colega (os
 * veículos deles chegam com usuario = colega).
 */
function turnosCompartilhados_(usuario, agora) {
  const turnos = {}, veiculos = {};
  lerLeitura_('Pareamentos').forEach(function (p) {
    if (!p.id || !p.colega || !p.entrouEm) return;
    if (p.colega === usuario && !p.saiuEm && agora - p.entrouEm <= PAREAR_JANELA_MS) { turnos[p.turnoId] = true; veiculos[p.turnoId] = true; }
    if (p.dono === usuario) veiculos[p.turnoId] = true;
  });
  return { turnos: turnos, veiculos: veiculos };
}

/** Mudanças desde `since` do próprio login e das linhas cujo `campo` está em `ids` (turno compartilhado). */
function lerMudancasTurnos_(nome, since, usuario, ids, campo) {
  if (!Object.keys(ids).length) return lerMudancas_(nome, since, usuario);
  return lerLinhas_(nome).filter(function (o) { return o.srv_ts > since && (o.usuario === usuario || ids[o[campo]]); })
    .map(function (o) { delete o._linha; return o; });
}

/** Turno pelo id (linha da planilha, dentro do lock) ou erro com a mensagem para o fiscal. */
function turnoAbertoPorId_(turnos, id) {
  const t = turnos.filter(function (x) { return x.id === id; })[0];
  if (!t) throw new Error('O turno ainda não chegou ao servidor. Aguarde sincronizar (com internet) e tente de novo.');
  if (t.encerrado === 1) throw new Error('Este turno já foi encerrado.');
  return t;
}

/**
 * turnoConvidar {turnoId}: o dono do turno aberto recebe um código de 6 dígitos (15 min) para um colega entrar. Pode gerar vários
 * (um por colega); cada código vale para uma pessoa. Turno só de educação sanitária (contador de pessoas) não é compartilhado.
 */
function turnoConvidar_(req, usuario) {
  const id = String(req.turnoId || '').trim();
  if (!id || id.length > 64) throw new Error('Turno não informado.');
  return comLock_(function () {
    const t = turnoAbertoPorId_(lerLinhas_('Turnos'), id);
    if (t.usuario !== usuario) throw new Error('Só quem abriu o turno pode convidar colegas.');
    if (t.soPessoas === 1) throw new Error('Turno só de educação sanitária: o contador de pessoas fica em um aparelho só.');
    const agora = Date.now(), ativos = {};
    lerLeitura_('Pareamentos').forEach(function (p) { if (!p.colega && p.expiraEm > agora) ativos[p.codigo] = true; });
    let codigo = '';
    for (let i = 0; i < 50 && (!codigo || ativos[codigo]); i++) codigo = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    if (ativos[codigo]) throw new Error('Não foi possível gerar o código agora. Tente de novo.');
    const expiraEm = agora + PAREAR_VALIDADE_MS;
    inserir_('Pareamentos', [{ id: uuid_(), turnoId: id, dono: usuario, codigo: codigo, criadoEm: agora, expiraEm: expiraEm }]);
    return { ok: true, codigo: codigo, expiraEm: expiraEm };
  });
}

/**
 * turnoParear {codigo}: o colega entra no turno do dono com o código. Devolve o turno e os veículos já lançados (o aparelho do
 * colega passa a ter esse turno como o turno em andamento). O nome do colega entra em Turnos.colegas; srv_ts muda para o dono
 * receber, atualizadoEm não (uma edição do dono ainda não enviada continua valendo no aparelho dele).
 */
function turnoParear_(req, usuario) {
  const codigo = String(req.codigo || '').replace(/\D/g, '');
  const chave = 'parear_erros_' + nomeChave_(usuario), erros = Number(cacheLer_(chave) || 0);
  if (erros >= PAREAR_TENTATIVAS) throw new Error('Muitos códigos errados. Aguarde 15 minutos e peça um código novo ao colega.');
  const errou = function (msg) { cacheGravar_(chave, erros + 1, PAREAR_VALIDADE_MS / 1000); return new Error(msg); };
  if (!RE_CODIGO_PAREAR_.test(codigo)) throw errou('Digite o código de 6 números que aparece no aparelho do colega.');
  return comLock_(function () {
    const agora = Date.now();
    const p = lerLinhas_('Pareamentos').filter(function (x) { return x.codigo === codigo && !x.colega && x.expiraEm > agora; })[0];
    if (!p) throw errou('Código inválido ou vencido. Peça um código novo ao colega (vale 15 minutos).');
    const turnos = lerLinhas_('Turnos'), t = turnoAbertoPorId_(turnos, p.turnoId);
    if (t.usuario === usuario) throw new Error('Este turno já é seu: os seus aparelhos já entram nele sozinhos.');
    atualizar_('Pareamentos', p._linha, { colega: usuario, entrouEm: agora });
    const colegas = lerJSONSeguro_(t.colegas, []);
    if (!colegas.some(function (n) { return nomeChave_(n) === nomeChave_(usuario); })) colegas.push(usuario);
    atualizar_('Turnos', t._linha, { colegas: JSON.stringify(colegas), srv_ts: agora });
    t.colegas = JSON.stringify(colegas); t.srv_ts = agora; delete t._linha;
    const veiculos = lerLeitura_('Veiculos').filter(function (v) { return v.turnoId === t.id; });
    return { ok: true, turno: t, veiculos: veiculos, dono: t.usuario };
  });
}

/** turnoSair {turnoId}: o colega deixa o turno compartilhado (o que ele lançou fica). O nome continua no turno: ele participou. */
function turnoSair_(req, usuario) {
  const id = String(req.turnoId || '').trim();
  if (!id || id.length > 64) throw new Error('Turno não informado.');
  return comLock_(function () {
    const agora = Date.now();
    const ps = lerLinhas_('Pareamentos').filter(function (p) { return p.turnoId === id && p.colega === usuario && !p.saiuEm; });
    ps.forEach(function (p) { atualizar_('Pareamentos', p._linha, { saiuEm: agora }); });
    return { ok: true, saiu: ps.length };
  });
}

/* ---------- Letra do turno pela ordem do número ----------
 * O fiscal digita o nº do Termo de Fiscalização do turno; a letra vem da ordem: o 1º turno com aquele nº (na mesma BVA/local e no
 * mesmo ano) é A, o 2º B, o 3º C… O aparelho propõe a letra pelo que conhece; o servidor confere com todos os turnos e corrige
 * (numeroTF e letra) na primeira gravação. Depois disso a letra é do servidor: um envio do aparelho não muda mais.
 */
const RE_NUMERO_TURNO_ = /^TF-(\d+)-([A-Z])-(\d{4})$/;
function chaveNumeroTurno_(t) {
  const m = RE_NUMERO_TURNO_.exec(String(t.numeroTF || '').trim());
  return m ? Number(m[1]) + '|' + m[3] + '|' + normPub_(t.local).replace(/ /g, '') : '';
}
/** Ajusta letra e numeroTF dos turnos recebidos no sync (chamar dentro do lock, antes de gravar_). */
function letrasDosTurnos_(recebidos) {
  if (!recebidos.length) return;
  const gravados = {}, usadas = {};
  lerLeitura_('Turnos').forEach(function (t) {
    if (!t.id) return;
    gravados[t.id] = t;
    const k = chaveNumeroTurno_(t); if (k && t.excluido !== 1) (usadas[k] = usadas[k] || {})[t.letra] = true;
  });
  recebidos.forEach(function (r) {
    if (!r || !r.id) return;
    const g = gravados[String(r.id)];
    if (g) { if (g.numeroTF) { r.numeroTF = g.numeroTF; r.letra = g.letra; } return; }   // já gravado: a letra não muda
    const m = RE_NUMERO_TURNO_.exec(String(r.numeroTF || '').trim()), k = chaveNumeroTurno_(r);
    if (!m || !k) return;
    const u = usadas[k] = usadas[k] || {};
    let i = 0; while (u[String.fromCharCode(65 + i)] && i < 25) i++;
    const letra = String.fromCharCode(65 + i);
    u[letra] = true; r.letra = letra; r.numeroTF = 'TF-' + m[1] + '-' + letra + '-' + m[3];
  });
}

/* ---------- Corrigir o nº do TF do turno ----------
 * O fiscal (quem abriu o turno ou colega que entrou nele) corrige o nº digitado errado; a letra é refeita pela ordem do nº novo
 * (a primeira livre: A, B, C…). Vale só onde a gerência liberou: BVA e data mínima em NUMERO_TURNO_EDITAVEL_. Fica registrado em
 * HistoricoDeAlteracoes (quem, quando, antes e depois).
 */
const NUMERO_TURNO_EDITAVEL_ = [{ local: 'BVA - JUNDIÁ', desde: '2026-10-24' }];
function numeroTurnoEditavel_(t) {
  const k = normPub_(t.local).replace(/ /g, '');
  return NUMERO_TURNO_EDITAVEL_.some(function (r) { return normPub_(r.local).replace(/ /g, '') === k && String(t.data) >= r.desde; });
}
function turnoNumero_(req, usuario) {
  const id = String(req.turnoId || '').trim(), n = Math.floor(Number(req.numero));
  if (!id || id.length > 64) throw new Error('Turno não informado.');
  if (!(n >= 1 && n <= 99999)) throw new Error('Informe o nº do Termo de Fiscalização (só números).');
  return comLock_(function () {
    const linhas = lerLinhas_('Turnos'), t = linhas.filter(function (x) { return x.id === id; })[0];
    if (!t) throw new Error('O turno ainda não chegou ao servidor. Aguarde sincronizar (com internet) e tente de novo.');
    const colega = lerJSONSeguro_(t.colegas, []).some(function (x) { return nomeChave_(x) === nomeChave_(usuario); });
    if (t.usuario !== usuario && !colega) throw new Error('Só quem trabalhou no turno pode corrigir o nº.');
    if (!numeroTurnoEditavel_(t)) throw new Error('A correção do nº não está liberada para este turno (BVA ou data).');
    const m = RE_NUMERO_TURNO_.exec(String(t.numeroTF || '').trim()), ano = m ? m[3] : String(t.data).slice(0, 4);
    if (m && Number(m[1]) === n) return { ok: true, turno: { id: id, numeroTF: t.numeroTF, letra: t.letra }, igual: true };
    const novo = { numeroTF: 'TF-' + String(n).padStart(3, '0') + '-A-' + ano, local: t.local };
    const usadas = {};
    lerLeitura_('Turnos').forEach(function (x) { if (x.id !== id && x.excluido !== 1 && chaveNumeroTurno_(x) === chaveNumeroTurno_(novo)) usadas[x.letra] = true; });
    let i = 0; while (usadas[String.fromCharCode(65 + i)] && i < 25) i++;
    const letra = String.fromCharCode(65 + i), numeroTF = 'TF-' + String(n).padStart(3, '0') + '-' + letra + '-' + ano, agora = Date.now();
    atualizar_('Turnos', t._linha, { numeroTF: numeroTF, letra: letra, srv_ts: agora });
    inserir_('HistoricoDeAlteracoes', [{ id: uuid_(), em: agora, usuarioId: (USUARIO_ATUAL_ && USUARIO_ATUAL_.id) || usuario, acao: 'corrigir nº do turno',
      tabela: 'Turnos', registroId: id, antes: JSON.stringify({ numeroTF: t.numeroTF }), depois: JSON.stringify({ numeroTF: numeroTF }) }]);
    return { ok: true, turno: { id: id, numeroTF: numeroTF, letra: letra } };
  });
}

/**
 * turnoRecuperar {de, ate}: devolve ao aparelho os turnos do período (até 62 dias) do próprio login (mesmo nome, sem diferença de
 * maiúsculas e espaços) e os turnos em que ele entrou pelo código, com os veículos e os TFs do login ligados a eles: o fiscal
 * refaz o Termo de um turno que sumiu do celular (aparelho novo, limpeza). Só leitura; turno cancelado fica de fora.
 */
function turnoRecuperar_(req, usuario) {
  const de = String(req.de || ''), ate = String(req.ate || '');
  if (!diaValido_(de) || !diaValido_(ate) || ate < de) throw new Error('Informe o período (de e até).');
  if (somarDias_(de, 62) < ate) throw new Error('Período longo demais (até 62 dias).');
  const eu = nomeChave_(usuario), colega = {};
  lerLeitura_('Pareamentos').forEach(function (p) { if (p.id && p.colega && p.entrouEm && nomeChave_(p.colega) === eu) colega[p.turnoId] = true; });
  const limpo = function (o) { delete o._linha; return o; }, ids = {};
  const turnos = lerLinhas_('Turnos').filter(function (t) {
    const d = String(t.data).slice(0, 10);
    return t.id && d >= de && d <= ate && Number(t.cancelado) !== 1 && (nomeChave_(t.usuario) === eu || colega[t.id]);
  }).map(function (t) { ids[t.id] = true; return limpo(t); });
  return { ok: true, turnos: turnos,
    veiculos: lerLinhas_('Veiculos').filter(function (v) { return ids[v.turnoId]; }).map(limpo),
    tfs: lerLinhas_('TFs').filter(function (t) { return ids[t.turnoId] && nomeChave_(t.usuario) === eu; }).map(limpo),   // só os TFs do próprio login
    compartilhados: turnos.filter(function (t) { return nomeChave_(t.usuario) !== eu; }).map(function (t) { return t.id; }) };
}
