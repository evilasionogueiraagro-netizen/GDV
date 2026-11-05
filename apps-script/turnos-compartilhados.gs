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

/** TFs do sync: os do próprio login e os ligados aos turnos compartilhados (`ids`). TF de colega com dados do fiscalizado: registro de
 *  leitura de dados pessoais (AcessosADados, no máximo 1 vez por hora, como as demais leituras). */
function tfsDoSync_(since, usuario, ids) {
  const tfs = lerMudancasTurnos_('TFs', since, usuario, ids, 'turnoId');
  if (tfs.some(function (t) { return t.usuario !== usuario; })) lido_({ action: 'tfsTurnoCompartilhado' }, { ok: true });
  return tfs;
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
  const r = comLock_(function () {
    const agora = Date.now();
    const p = lerLinhas_('Pareamentos').filter(function (x) { return x.codigo === codigo && !x.colega && x.expiraEm > agora; })[0];
    if (!p) throw errou('Código inválido ou vencido. Peça um código novo ao colega (vale 15 minutos).');
    const turnos = lerLinhas_('Turnos'), t = turnoAbertoPorId_(turnos, p.turnoId);
    if (t.usuario === usuario) throw new Error('Este turno já é seu: os seus aparelhos já entram nele sozinhos.');
    if (ehFixa_(t)) exigirEscalaNaBva_(t.local);
    atualizar_('Pareamentos', p._linha, { colega: usuario, entrouEm: agora });
    return juntarAoTurno_(t, usuario, agora);
  });
  if (r.tfs.length) lido_({ action: 'tfsTurnoCompartilhado' }, r);   // fora do lock (lido_ grava com o próprio lock)
  return r;
}

/** Dentro do lock: põe o colega em Turnos.colegas e devolve o turno, os veículos e (módulo TF) os TFs já lançados nele. */
function juntarAoTurno_(t, usuario, agora) {
  const colegas = lerJSONSeguro_(t.colegas, []);
  if (!colegas.some(function (n) { return nomeChave_(n) === nomeChave_(usuario); })) colegas.push(usuario);
  atualizar_('Turnos', t._linha, { colegas: JSON.stringify(colegas), srv_ts: agora });
  t.colegas = JSON.stringify(colegas); t.srv_ts = agora; delete t._linha;
  const veiculos = lerLeitura_('Veiculos').filter(function (v) { return v.turnoId === t.id; });
  // TFs já lavrados no turno (o colega passa a ver o TF completo, como o dono)
  const tfs = USUARIO_ATUAL_ && USUARIO_ATUAL_.modulos && USUARIO_ATUAL_.modulos.tf ? lerLeitura_('TFs').filter(function (f) { return f.turnoId === t.id; }) : [];
  return { ok: true, turno: t, veiculos: veiculos, tfs: tfs, dono: t.usuario };
}

/** Turno de BVA fixa aberto agora (início nas últimas 12 h), que conta veículos e não foi cancelado: dá para entrar sem código. */
function turnoAbertoNaBva_(t, agora) {
  if (!t.id || t.encerrado === 1 || Number(t.cancelado) === 1 || t.soPessoas === 1 || !ehFixa_(t)) return false;
  const ini = tsManaus_(t.data, t.inicio);
  return ini !== null && agora - ini <= TURNO_MAX_MS && ini - agora <= ENCERRAR_TOLERANCIA_MS;
}

/**
 * turnosAbertos {}: turnos em andamento nas BVAs fixas abertos por outros logins, para o fiscal entrar com um toque (turnoEntrar)
 * em vez de abrir outro turno na mesma BVA. Só o que aparece no cartão do turno: nº, BVA, fiscais, início.
 */
function turnosAbertos_(req, usuario) {
  const agora = Date.now(), dentro = turnosCompartilhados_(usuario, agora).turnos;
  const turnos = lerLeitura_('Turnos').filter(function (t) { return t.usuario !== usuario && !dentro[t.id] && turnoAbertoNaBva_(t, agora) && podeNaBva_(t.local); })
    .map(function (t) { return { id: t.id, numeroTF: t.numeroTF, local: t.local, fiscal: t.fiscal, dono: t.usuario, data: t.data, inicio: t.inicio }; });
  return { ok: true, turnos: turnos };
}

const podeNaBva_ = function (local) { try { exigirEscalaNaBva_(local); return true; } catch (e) { return false; } };

/**
 * turnoEntrar {turnoId}: o fiscal entra, sem código, num turno em andamento de BVA fixa (turnosAbertos). Fica registrado na aba
 * Pareamentos como um pareamento sem código (dono, colega, entrouEm), igual ao do código: sync, Termo e painel não mudam.
 */
function turnoEntrar_(req, usuario) {
  const id = String(req.turnoId || '').trim();
  if (!id || id.length > 64) throw new Error('Turno não informado.');
  const r = comLock_(function () {
    const agora = Date.now(), t = turnoAbertoPorId_(lerLinhas_('Turnos'), id);
    if (t.usuario === usuario) throw new Error('Este turno já é seu: os seus aparelhos já entram nele sozinhos.');
    if (!turnoAbertoNaBva_(t, agora)) throw new Error('Este turno não aceita entrada direta. Peça o código ao colega que abriu o turno.');
    exigirEscalaNaBva_(t.local);
    const ja = lerLeitura_('Pareamentos').some(function (p) { return p.turnoId === id && p.colega === usuario && !p.saiuEm; });
    if (!ja) inserir_('Pareamentos', [{ id: uuid_(), turnoId: id, dono: t.usuario, codigo: '', criadoEm: agora, expiraEm: agora,
                                         colega: usuario, entrouEm: agora }]);
    return juntarAoTurno_(t, usuario, agora);
  });
  if (r.tfs.length) lido_({ action: 'tfsTurnoCompartilhado' }, r);   // fora do lock (lido_ grava com o próprio lock)
  return r;
}

/** Veículos (não excluídos) e TFs que o login lançou no turno. */
function lancamentosNoTurno_(turnoId, usuario) {
  const v = lerLeitura_('Veiculos').filter(function (x) { return x.turnoId === turnoId && x.usuario === usuario && x.excluido !== 1; }).length;
  const f = lerLeitura_('TFs').filter(function (x) { return x.turnoId === turnoId && x.usuario === usuario; }).length;
  return { veiculos: v, tfs: f, total: v + f };
}

/**
 * Dentro do lock: o colega deixa o turno (saiuEm). Se não lançou nada, entrou por engano: o nome sai de Turnos.colegas e o
 * pareamento fica com removidoPor (Termo, painel e relatório da equipe deixam de contá-lo). Se lançou, o nome fica: ele participou.
 */
function tirarDoTurno_(id, colega, quem, agora) {
  const ps = lerLinhas_('Pareamentos').filter(function (p) { return p.turnoId === id && p.colega === colega && !p.saiuEm; });
  const l = lancamentosNoTurno_(id, colega), removido = l.total === 0;
  ps.forEach(function (p) { atualizar_('Pareamentos', p._linha, removido ? { saiuEm: agora, removidoPor: quem } : { saiuEm: agora }); });
  if (removido) {
    const t = lerLinhas_('Turnos').filter(function (x) { return x.id === id; })[0];
    const colegas = t ? lerJSONSeguro_(t.colegas, []) : [], resto = colegas.filter(function (n) { return nomeChave_(n) !== nomeChave_(colega); });
    if (t && resto.length !== colegas.length) atualizar_('Turnos', t._linha, { colegas: resto.length ? JSON.stringify(resto) : '', srv_ts: agora });
  }
  return { ok: true, saiu: ps.length, removido: removido, lancamentos: l };
}

/** turnoSair {turnoId}: o colega deixa o turno compartilhado. O que ele lançou fica; sem lançamento, o nome sai do turno. */
function turnoSair_(req, usuario) {
  const id = String(req.turnoId || '').trim();
  if (!id || id.length > 64) throw new Error('Turno não informado.');
  return comLock_(function () { return tirarDoTurno_(id, usuario, usuario, Date.now()); });
}

/**
 * turnoRemoverColega {turnoId, colega}: o dono tira do turno um colega que entrou por engano. Só se o colega não lançou nada
 * no turno (senão ele participou: o nome fica, e ele mesmo sai pelo app). Fica registrado em Pareamentos (removidoPor).
 */
function turnoRemoverColega_(req, usuario) {
  const id = String(req.turnoId || '').trim(), colega = String(req.colega || '').trim();
  if (!id || id.length > 64 || !colega || colega.length > 120) throw new Error('Turno ou colega não informado.');
  return comLock_(function () {
    const t = lerLeitura_('Turnos').filter(function (x) { return x.id === id; })[0];
    if (!t) throw new Error('Turno não encontrado na planilha. Sincronize e tente de novo.');
    if (t.usuario !== usuario) throw new Error('Só quem abriu o turno pode tirar um colega.');
    const p = lerLeitura_('Pareamentos').filter(function (x) { return x.turnoId === id && x.colega && nomeChave_(x.colega) === nomeChave_(colega); })[0];
    if (!p) throw new Error('Este fiscal não entrou no turno pelo app (código ou "Entrar neste turno").');
    const l = lancamentosNoTurno_(id, p.colega);
    if (l.total) throw new Error(p.colega + ' já lançou ' + (l.veiculos ? l.veiculos + ' veículo(s)' : '') + (l.veiculos && l.tfs ? ' e ' : '') + (l.tfs ? l.tfs + ' TF(s)' : '') +
      ' neste turno: o nome fica no turno. Se ele não está no plantão, ele mesmo toca em "Sair do turno" no app dele.');
    return tirarDoTurno_(id, p.colega, textoAutor_(usuario), Date.now());
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
  lerLeitura_('Pareamentos').forEach(function (p) { if (p.id && p.colega && p.entrouEm && !p.removidoPor && nomeChave_(p.colega) === eu) colega[p.turnoId] = true; });
  const limpo = function (o) { delete o._linha; return o; }, ids = {};
  const turnos = lerLinhas_('Turnos').filter(function (t) {
    const d = String(t.data).slice(0, 10);
    return t.id && d >= de && d <= ate && Number(t.cancelado) !== 1 && (nomeChave_(t.usuario) === eu || colega[t.id]);
  }).map(function (t) { ids[t.id] = true; return limpo(t); });
  return { ok: true, turnos: turnos,
    veiculos: lerLinhas_('Veiculos').filter(function (v) { return ids[v.turnoId]; }).map(limpo),
    // TFs dos turnos do período: os do login e, com o módulo TF, os dos colegas no turno compartilhado
    tfs: lerLinhas_('TFs').filter(function (t) { return ids[t.turnoId] && (nomeChave_(t.usuario) === eu || (USUARIO_ATUAL_ && USUARIO_ATUAL_.modulos && USUARIO_ATUAL_.modulos.tf)); }).map(limpo),
    compartilhados: turnos.filter(function (t) { return nomeChave_(t.usuario) !== eu; }).map(function (t) { return t.id; }) };
}

/**
 * turnoTFs {turnoId}: nºs e medidas (procedimento, auto, advertência, fiel depositário) dos TFs de barreira do turno para o Termo do turno, de quem participou dele (dono ou colega pelo código):
 * os ligados ao turno (turnoId) e os sem turno lavrados por um dos participantes no dia e no horário do turno, depois de aberto. Só o nº (sem dados
 * pessoais): o aparelho tem só os próprios TFs, e o TF do colega também entra no Termo. TF cancelado fica de fora.
 */
function turnoTFs_(req, usuario) {
  const id = String(req.turnoId || '').trim();
  if (!id || id.length > 64) throw new Error('Turno não informado.');
  const t = lerLeitura_('Turnos').filter(function (x) { return x.id === id; })[0];
  if (!t) return { ok: true, tfs: [] };
  const part = {}; part[nomeChave_(t.usuario)] = true;
  lerLeitura_('Pareamentos').forEach(function (p) { if (p.turnoId === id && p.colega && p.entrouEm && !p.removidoPor) part[nomeChave_(p.colega)] = true; });
  if (!part[nomeChave_(usuario)]) throw new Error('Este turno é de outro fiscal.');
  const d = String(t.data).slice(0, 10), ini = String(t.inicio || '00:00'), fim = String(t.fim || '');
  const noHorario = function (f) {                    // turno que passa da meia-noite (fim < início): até o fim, no dia seguinte
    const fd = String(f.data).slice(0, 10), h = String(f.hora || '');
    if (fim && fim < ini) return (fd === d && h >= ini) || (fd === somarDias_(d, 1) && h <= fim);
    return fd === d && h >= ini && (!fim || h <= fim);
  };
  const tfs = lerLeitura_('TFs').filter(function (f) {
    // sem turno: só o criado depois da abertura do turno (o TF lavrado antes de abrir o turno, no mesmo minuto, não é dele)
    return f.id && f.cancelado !== 1 && (f.turnoId === id || (!f.turnoId && part[nomeChave_(f.usuario)] && noHorario(f) && Number(f.criadoEm) >= Number(t.criadoEm)));
  }).sort(function (a, b) { return a.numero - b.numero; }).map(function (f) {
    return { numeroTxt: f.numeroTxt, procedimento: f.procedimento, auto: f.auto, advertencia: f.advertencia, fiel: f.fiel };   // medidas do TF (sem dados pessoais)
  });
  return { ok: true, tfs: tfs };
}
