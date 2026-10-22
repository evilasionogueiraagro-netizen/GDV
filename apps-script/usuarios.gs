/* ---------- Usuários, sessões e permissões (login com matrícula e senha) ----------
 * Regras e fluxo: docs/modulos/acessos.md; actions: docs/API.md. Abas: Usuarios, PermissoesDosUsuarios, SessoesDosUsuarios, HistoricoDeAlteracoes.
 * Token da sessão: "u." + 64 hex, aleatório; na planilha fica só o SHA-256 (tokenHash). O app de campo e o painel mandam o token em `key`,
 * o portal em `sessao`. autenticar_ (app), adminDoToken_ (painel) e admSessao_ (portal) só aceitam este token: não há outra credencial
 * (os códigos de 6 dígitos, as abas Fiscais/Administrativo/AdmSessoes e a ACCESS_KEY deixaram de valer; as abas ficam como histórico).
 * A cada chamada o servidor confere a planilha (token → sessão aberta → usuário ativo → senha provisória resolvida → permissão): revogar
 * ou mudar uma permissão vale na hora. Gravação sempre dentro de comLock_, relendo as abas dentro do lock.
 * Nada neste arquivo depende de outro ao carregar (ordem_arquivos_test).
 */

/** Quem está chamando nesta requisição: {id, matricula, nome, permissoes, modulos}. O doPost zera a cada chamada; toda action autenticada o preenche. */
let USUARIO_ATUAL_ = null;

const PERMISSOES_USUARIO_ = ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'pce', 'digitarDoPapel', 'painel', 'administracao', 'gerencia'];
const APLICATIVOS_USUARIO_ = ['campo', 'painel', 'administracao'];
const NOME_APLICATIVO_USUARIO_ = { campo: 'o app de campo', painel: 'o painel', administracao: 'o Portal do Administrativo' };
const RE_MATRICULA_ = /^[A-Za-z0-9.\-]{3,20}$/;
const RE_TOKEN_USUARIO_ = /^u\.[0-9a-f]{64}$/;
const SENHA_MIN_ = 8;
const SENHA_ITERACOES_ = 1000;
const SENHA_ALFABETO_ = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';   // sem 0/O/1/l/I
const USO_SESSAO_MS_ = 5 * 60 * 1000;                        // ultimoUso grava no máximo uma vez a cada 5 min por sessão
const LOGIN_FALHAS_MATRICULA_ = 10, LOGIN_FALHAS_TOTAL_ = 50, LOGIN_JANELA_S_ = 900;   // 10 por matrícula e 50 no total em 15 min
const CHAVE_FALHAS_TOTAL_ = 'falhas_usuarios_total';
const CHAVE_FALHAS_MATRICULA_ = 'falhas_usuarios_m_';        // + matrícula em minúsculas (até 40 caracteres)

const MSG_ENTRE_ = 'Entre com sua matrícula e senha.';
const MSG_LOGIN_ERRADO_ = 'Matrícula ou senha incorreta.';
const MSG_BLOQUEIO_LOGIN_ = 'Muitas tentativas incorretas. Aguarde 15 minutos e tente de novo.';
const MSG_TROCAR_SENHA_ = 'Troque a senha provisória para continuar.';
const MSG_SESSAO_ = 'Sessão encerrada ou inválida. Entre com sua matrícula e senha.';
const MSG_SESSAO_APP_ = 'Acesso revogado ou inválido. Entre com sua matrícula e senha.';   // app de campo: o texto que ele já reconhece
const MSG_SO_GERENCIA_ = 'Só a gerência pode fazer esta alteração (o seu acesso ao painel é só de leitura).';

/* ---------- Utilidades ---------- */

/** Chave de comparação da matrícula: sem espaços nas pontas e sem diferença de maiúscula/minúscula. */
function chaveMatricula_(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); }

/** Matrícula informada → texto sem espaços nas pontas, ou erro. */
function matriculaValida_(v) {
  const m = String(v === null || v === undefined ? '' : v).trim();
  if (!RE_MATRICULA_.test(m)) throw new Error('Matrícula inválida: use de 3 a 20 letras, números, ponto ou hífen, sem espaços.');
  return m;
}

/** "GDV" + 4 dígitos sequenciais (GDV0001...) acima do maior GDV#### já usado. */
function proximaMatricula_(usuarios) {
  let maior = 0;
  usuarios.forEach(function (u) { const m = /^gdv(\d+)$/i.exec(String(u.matricula || '').trim()); if (m) maior = Math.max(maior, Number(m[1])); });
  return 'GDV' + String(maior + 1).padStart(4, '0');
}

/** n caracteres hexadecimais aleatórios, tirando dos UUIDs os dígitos fixos de versão e variante. */
function aleatorioHex_(n) {
  let h = '';
  while (h.length < n) {
    const u = uuid_().replace(/-/g, '');
    h += u.slice(0, 12) + u.slice(13, 16) + u.slice(17);
  }
  return h.slice(0, n);
}

/** Senha provisória: 8 caracteres de um alfabeto sem ambíguos, sorteados sem viés. Mostrada uma vez. */
function senhaProvisoriaNova_() {
  const n = SENHA_ALFABETO_.length, limite = Math.floor(256 / n) * n;
  let s = '';
  while (s.length < 8) {
    const h = aleatorioHex_(32);
    for (let i = 0; i + 1 < h.length && s.length < 8; i += 2) {
      const b = parseInt(h.slice(i, i + 2), 16);
      if (b < limite) s += SENHA_ALFABETO_.charAt(b % n);
    }
  }
  return s;
}

/** SHA-256 iterado 1000 vezes sobre sal + senha (sal aleatório por senha). Só o hash e o sal ficam na planilha. */
function hashSenha_(senha, sal) {
  let h = hexSha_(sal + '|' + senha);
  for (let i = 1; i < SENHA_ITERACOES_; i++) h = hexSha_(sal + h);
  return h;
}

function iguaisSeguro_(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

/** Confere a senha de um usuário (linha de Usuarios). Sem usuário também calcula um hash, para o tempo não revelar se a matrícula existe. */
function senhaConfere_(u, senha) {
  if (!u || !u.senhaSal || !u.senhaHash) { hashSenha_(senha, 'sal-ficticio'); return false; }
  return iguaisSeguro_(hashSenha_(senha, u.senhaSal), u.senhaHash);
}

/** Texto que identifica um autor nas colunas criadoPor/atualizadoPor: nunca começa com caractere de fórmula. */
function textoAutor_(v) { return String(v || '').replace(/^[=+\-@\s]+/, '').slice(0, 120); }

function jsonCurto_(o) {
  if (o === null || o === undefined || o === '') return '';
  const j = JSON.stringify(o);
  return j.length > 3000 ? j.slice(0, 2990) + '…' : j;
}

/** Registra mudanças de acesso em HistoricoDeAlteracoes (antes/depois em JSON, sem hash de senha). O chamador segura o lock. */
function historicoAcesso_(itens) {
  const agora = Date.now();
  inserir_('HistoricoDeAlteracoes', itens.map(function (x) {
    return { id: uuid_(), em: agora, usuarioId: x.usuarioId, acao: x.acao, tabela: x.tabela, registroId: x.registroId, antes: jsonCurto_(x.antes), depois: jsonCurto_(x.depois) };
  }));
}

/* ---------- Permissões ---------- */

/** {usuarioId: [permissões ativas]} (ativa = linha sem revogadaEm), na ordem de PERMISSOES_USUARIO_. */
function permissoesAtivasPorUsuario_(linhas) {
  const tem = {}, por = {};
  linhas.forEach(function (p) {
    if (p.id && p.usuarioId && !p.revogadaEm && PERMISSOES_USUARIO_.indexOf(p.permissao) >= 0) (tem[p.usuarioId] = tem[p.usuarioId] || {})[p.permissao] = 1;
  });
  Object.keys(tem).forEach(function (id) { por[id] = PERMISSOES_USUARIO_.filter(function (p) { return tem[id][p]; }); });
  return por;
}

/** `gerencia` vale como todas: a lista efetiva de quem tem gerência traz todas as permissões. */
function permissoesEfetivas_(lista) { return lista.indexOf('gerencia') >= 0 ? PERMISSOES_USUARIO_.slice() : lista.slice(); }

/** Permissões → módulos do campo no formato que o app e o sync usam: veiculos = fiscalizacaoDeTransito, tf = termoDeBarreira, pce, antigo = digitarDoPapel (exige pce). */
function modulosDasPermissoes_(lista) {
  const ef = permissoesEfetivas_(lista), tem = function (p) { return ef.indexOf(p) >= 0; };
  const pce = tem('pce') ? 1 : 0;
  return { veiculos: tem('fiscalizacaoDeTransito') ? 1 : 0, tf: tem('termoDeBarreira') ? 1 : 0, pce: pce, antigo: pce && tem('digitarDoPapel') ? 1 : 0 };
}

/** Lista de permissões recebida → lista sem repetição, na ordem fixa; recusa permissão desconhecida, lista vazia e digitarDoPapel sem pce. */
function permissoesValidas_(lista) {
  if (!Array.isArray(lista)) throw new Error('Informe as permissões.');
  const v = [];
  lista.forEach(function (p) {
    p = String(p === null || p === undefined ? '' : p).trim();
    if (PERMISSOES_USUARIO_.indexOf(p) < 0) throw new Error('Permissão desconhecida: ' + p.slice(0, 40) + '.');
    if (v.indexOf(p) < 0) v.push(p);
  });
  if (!v.length) throw new Error('Marque pelo menos uma permissão. Para tirar todo o acesso, desative a conta.');
  if (v.indexOf('digitarDoPapel') >= 0 && v.indexOf('pce') < 0 && v.indexOf('gerencia') < 0) {
    throw new Error('“Digitar do papel” só vale com o módulo PCE: marque também o PCE (ou desmarque “Digitar do papel”).');
  }
  return PERMISSOES_USUARIO_.filter(function (p) { return v.indexOf(p) >= 0; });
}

/** Quantos usuários ativos, fora `menosId`, têm a permissão gerencia (linhas lidas dentro do lock). */
function outrosGerentesAtivos_(menosId, usuarios, permissoes) {
  const por = permissoesAtivasPorUsuario_(permissoes);
  return usuarios.filter(function (u) { return u.id && u.id !== menosId && u.ativo === 1 && (por[u.id] || []).indexOf('gerencia') >= 0; }).length;
}

/* ---------- Sessão nova ---------- */

function tokenDe_(req) { return String((req && (req.key || req.sessao)) || ''); }

/** Marca do token gravada em Aparelhos.cred: parte do SHA-256 (o token nunca vai à planilha). */
function credAparelho_(key) {
  key = String(key || '');
  return key ? 'u.' + hexSha_(key).slice(0, 6) : '';
}

/**
 * Valida o token e devolve {sessao, u, usuario, lista, permissoes, modulos, provisoria}. Falha com erro claro: sem token → MSG_ENTRE_;
 * token desconhecido/encerrado/usuário desativado → opcoes.invalida (padrão MSG_SESSAO_); os dois com entrar = 1 (a tela volta ao login);
 * senha provisória pendente → MSG_TROCAR_SENHA_ com trocarSenha = 1 (a menos que opcoes.provisoria); sem a permissão opcoes.permissao
 * (gerencia vale como todas). Lê a planilha a cada chamada. Preenche USUARIO_ATUAL_.
 */
function sessaoNova_(token, opcoes) {
  opcoes = opcoes || {};
  const erroEntrar = function (msg) { const e = new Error(msg); e.entrar = 1; return e; };
  const invalida = function () { return erroEntrar(opcoes.invalida || MSG_SESSAO_); };
  token = String(token || '');
  if (!token) throw erroEntrar(MSG_ENTRE_);
  if (!RE_TOKEN_USUARIO_.test(token)) throw invalida();
  const h = hexSha_(token), agora = Date.now();
  const s = lerLeitura_('SessoesDosUsuarios').filter(function (x) { return x.id && x.tokenHash === h; })[0];
  if (!s || s.encerradaEm) throw invalida();
  const u = lerLeitura_('Usuarios').filter(function (x) { return x.id === s.usuarioId; })[0];
  if (!u || u.ativo !== 1) throw invalida();
  const lista = permissoesAtivasPorUsuario_(lerLeitura_('PermissoesDosUsuarios').filter(function (p) { return p.usuarioId === u.id; }))[u.id] || [];
  if (u.senhaProvisoria === 1 && !opcoes.provisoria) {
    const e = new Error(MSG_TROCAR_SENHA_);
    e.trocarSenha = 1;
    throw e;
  }
  if (opcoes.permissao && lista.indexOf('gerencia') < 0 && lista.indexOf(opcoes.permissao) < 0) {
    throw new Error(opcoes.permissao === 'gerencia' ? 'Esta ação é só da gerência.'
      : 'Seu acesso não inclui ' + NOME_APLICATIVO_USUARIO_[opcoes.permissao] + '. Fale com a gerência.');
  }
  const r = { sessao: s, u: u, usuario: { id: u.id, matricula: u.matricula, nome: u.nome }, lista: lista, permissoes: permissoesEfetivas_(lista),
              modulos: modulosDasPermissoes_(lista), provisoria: u.senhaProvisoria === 1 ? 1 : 0 };
  USUARIO_ATUAL_ = { id: u.id, matricula: u.matricula, nome: u.nome, permissoes: r.permissoes, modulos: r.modulos };
  if (agora - (s.ultimoUso || s.criadaEm || 0) > USO_SESSAO_MS_) marcarUsoSessao_(s.id);
  return r;
}

/** Grava ultimoUso (no máximo uma vez a cada 5 min por sessão), relendo a sessão dentro do lock. Falha aqui nunca derruba a chamada. */
function marcarUsoSessao_(sessaoId) {
  try {
    comLock_(function () {
      const agora = Date.now();
      const s = lerLinhas_('SessoesDosUsuarios').filter(function (x) { return x.id === sessaoId; })[0];
      if (s && !s.encerradaEm && agora - (s.ultimoUso || 0) > USO_SESSAO_MS_) atualizar_('SessoesDosUsuarios', s._linha, { ultimoUso: agora });
    });
  } catch (e) { /* melhor esforço */ }
}

/** Encerra (encerradaEm, encerradaPor, motivo) as sessões abertas que passam no filtro. O chamador segura o lock. Devolve quantas. */
function encerrarSessoesAbertas_(filtro, motivo, por) {
  const agora = Date.now();
  let n = 0;
  lerLinhas_('SessoesDosUsuarios').forEach(function (s) {
    if (!s.id || s.encerradaEm || !filtro(s)) return;
    atualizar_('SessoesDosUsuarios', s._linha, { encerradaEm: agora, encerradaPor: por, motivoDoEncerramento: motivo });
    n++;
  });
  return n;
}

/* Pontos de entrada usados por autenticar_ (app), adminDoToken_ (painel) e admSessao_ (portal). */

/** App de campo: nome do usuário. Exige `campo`. */
function usuarioDoApp_(token) {
  return sessaoNova_(token, { permissao: 'campo', invalida: MSG_SESSAO_APP_ }).usuario.nome;
}

/** Painel: nome do usuário. Exige `painel`; com `gravar`, exige `gerencia` (painel só lê). */
function usuarioDoPainel_(token, gravar) {
  const s = sessaoNova_(token, { permissao: 'painel' });
  if (gravar && s.lista.indexOf('gerencia') < 0) throw new Error(MSG_SO_GERENCIA_);
  return s.usuario.nome;
}

/** Portal do Administrativo: {admId (= id do usuário), nome, email: '', expiraEm: 0}. Exige `administracao`. */
function usuarioDoPortal_(token) {
  const s = sessaoNova_(token, { permissao: 'administracao' });
  return { admId: s.usuario.id, nome: s.usuario.nome, email: '', expiraEm: 0 };
}

/* ---------- Limite de tentativas ---------- */

/** Conta a tentativa ANTES de conferir a senha (dentro do lock: tentativas em paralelo não furam o limite) e bloqueia no limite. */
function reservarTentativa_(chave) {
  comLock_(function () {
    const m = Number(cacheLer_(chave) || 0), t = Number(cacheLer_(CHAVE_FALHAS_TOTAL_) || 0);
    if (m >= LOGIN_FALHAS_MATRICULA_ || t >= LOGIN_FALHAS_TOTAL_) throw new Error(MSG_BLOQUEIO_LOGIN_);
    cacheGravar_(chave, m + 1, LOGIN_JANELA_S_);
    cacheGravar_(CHAVE_FALHAS_TOTAL_, t + 1, LOGIN_JANELA_S_);
  });
}

/** Senha certa: devolve a tentativa e zera o contador da matrícula. */
function devolverTentativa_(chave) {
  comLock_(function () {
    cacheApagar_(chave);
    const t = Number(cacheLer_(CHAVE_FALHAS_TOTAL_) || 0);
    if (t > 0) cacheGravar_(CHAVE_FALHAS_TOTAL_, t - 1, LOGIN_JANELA_S_);
  });
}

/* ---------- entrar, trocarSenha, sair, minhaSessao ---------- */

/**
 * entrar {matricula, senha, aplicativo: campo|painel|administracao, aparelhoId?} → token da sessão nova. Mensagem única para matrícula
 * ou senha errada. Senha certa mas conta desativada ou sem permissão do aplicativo: mensagem própria (quem sabe a senha pode saber disso).
 * Uma sessão por aparelho: um novo login do mesmo usuário, aplicativo e aparelhoId encerra a anterior.
 */
function entrar_(req) {
  const app = String(req.aplicativo || '');
  if (APLICATIVOS_USUARIO_.indexOf(app) < 0) throw new Error('Aplicativo inválido (use campo, painel ou administracao).');
  const matricula = chaveMatricula_(req.matricula), senha = typeof req.senha === 'string' ? req.senha : '';
  if (!matricula || !senha) throw new Error('Informe a matrícula e a senha.');
  const chave = CHAVE_FALHAS_MATRICULA_ + matricula.slice(0, 40);
  reservarTentativa_(chave);
  const u = lerLeitura_('Usuarios').filter(function (x) { return x.id && chaveMatricula_(x.matricula) === matricula; })[0];
  if (!senhaConfere_(u, senha)) throw new Error(MSG_LOGIN_ERRADO_);
  devolverTentativa_(chave);
  if (u.ativo !== 1) throw new Error('Acesso desativado. Fale com a gerência.');
  const lista = permissoesAtivasPorUsuario_(lerLeitura_('PermissoesDosUsuarios').filter(function (p) { return p.usuarioId === u.id; }))[u.id] || [];
  if (lista.indexOf('gerencia') < 0 && lista.indexOf(app) < 0) throw new Error('Seu acesso não inclui ' + NOME_APLICATIVO_USUARIO_[app] + '. Fale com a gerência.');
  const aparelhoId = RE_ID_APARELHO_.test(String(req.aparelhoId || '')) ? String(req.aparelhoId) : '';
  const token = 'u.' + aleatorioHex_(64), agora = Date.now();
  const provisoria = comLock_(function () {
    const atual = lerLinhas_('Usuarios').filter(function (x) { return x.id === u.id; })[0];
    if (!atual || atual.ativo !== 1 || atual.senhaHash !== u.senhaHash) throw new Error(MSG_LOGIN_ERRADO_);   // mudou enquanto a senha era conferida
    if (aparelhoId) encerrarSessoesAbertas_(function (s) { return s.usuarioId === u.id && s.aplicativo === app && s.aparelhoId === aparelhoId; }, 'novo login no aparelho', u.id);
    inserir_('SessoesDosUsuarios', [{ id: uuid_(), usuarioId: u.id, tokenHash: hexSha_(token), aplicativo: app, aparelhoId: aparelhoId, criadaEm: agora, ultimoUso: agora }]);
    return atual.senhaProvisoria === 1 ? 1 : 0;
  });
  USUARIO_ATUAL_ = { id: u.id, matricula: u.matricula, nome: u.nome, permissoes: permissoesEfetivas_(lista), modulos: modulosDasPermissoes_(lista) };
  return { ok: true, token: token, usuario: { id: u.id, matricula: u.matricula, nome: u.nome }, permissoes: permissoesEfetivas_(lista),
           modulos: modulosDasPermissoes_(lista), trocarSenha: provisoria };
}

/** trocarSenha {key|sessao, senhaAtual, senhaNova}: vale com senha provisória pendente. Mínimo de 8 caracteres, diferente da atual; encerra as outras sessões. */
function trocarSenha_(req) {
  const s = sessaoNova_(tokenDe_(req), { provisoria: true });
  const atual = typeof req.senhaAtual === 'string' ? req.senhaAtual : '', nova = typeof req.senhaNova === 'string' ? req.senhaNova : '';
  if (!atual) throw new Error('Informe a senha atual.');
  if (nova.length < SENHA_MIN_) throw new Error('A senha nova precisa ter pelo menos ' + SENHA_MIN_ + ' caracteres.');
  if (nova === atual) throw new Error('A senha nova precisa ser diferente da atual.');
  const chave = CHAVE_FALHAS_MATRICULA_ + chaveMatricula_(s.u.matricula).slice(0, 40);
  reservarTentativa_(chave);
  if (!senhaConfere_(s.u, atual)) throw new Error('A senha atual não confere.');
  devolverTentativa_(chave);
  const sal = aleatorioHex_(32), hash = hashSenha_(nova, sal);
  comLock_(function () {
    const u = lerLinhas_('Usuarios').filter(function (x) { return x.id === s.u.id; })[0];
    const sessao = lerLinhas_('SessoesDosUsuarios').filter(function (x) { return x.id === s.sessao.id; })[0];
    if (!u || u.ativo !== 1 || u.senhaHash !== s.u.senhaHash || !sessao || sessao.encerradaEm) throw new Error(MSG_SESSAO_);
    const agora = Date.now();
    atualizar_('Usuarios', u._linha, { senhaHash: hash, senhaSal: sal, senhaProvisoria: 0, senhaAlteradaEm: agora, atualizadoEm: agora, atualizadoPor: u.id });
    const n = encerrarSessoesAbertas_(function (x) { return x.usuarioId === u.id && x.id !== sessao.id; }, 'senha trocada', u.id);
    historicoAcesso_([{ usuarioId: u.id, acao: 'usuario.trocarSenha', tabela: 'Usuarios', registroId: u.id,
                        antes: { senhaProvisoria: u.senhaProvisoria }, depois: { senhaProvisoria: 0, sessoesEncerradas: n } }]);
  });
  return { ok: true, permissoes: s.permissoes, modulos: s.modulos };
}

/** sair {key|sessao}: encerra esta sessão. Sempre ok (token que já não vale também). */
function sair_(req) {
  const token = tokenDe_(req);
  if (!RE_TOKEN_USUARIO_.test(token)) return { ok: true };
  const h = hexSha_(token);
  if (lerLeitura_('SessoesDosUsuarios').some(function (x) { return x.tokenHash === h && !x.encerradaEm; })) {
    comLock_(function () {
      const s = lerLinhas_('SessoesDosUsuarios').filter(function (x) { return x.tokenHash === h && !x.encerradaEm; })[0];
      if (s) atualizar_('SessoesDosUsuarios', s._linha, { encerradaEm: Date.now(), encerradaPor: s.usuarioId, motivoDoEncerramento: 'sair' });
    });
  }
  return { ok: true };
}

/** minhaSessao {key|sessao}: quem sou e o que posso. Vale com senha provisória pendente (trocarSenha = 1). */
function minhaSessao_(req) {
  const s = sessaoNova_(tokenDe_(req), { provisoria: true });
  return { ok: true, usuario: s.usuario, permissoes: s.permissoes, modulos: s.modulos, trocarSenha: s.provisoria };
}

/* ---------- Gerência ---------- */

/** Quem pede uma action de gerência: sessão com `gerencia`. Devolve {quem (id do usuário), nome}; quem vai em criadoPor/atualizadoPor/... e no histórico. */
function gerenciaDe_(req) {
  const s = sessaoNova_(tokenDe_(req), { permissao: 'gerencia' });
  return { quem: s.usuario.id, nome: s.usuario.nome };
}

function usuarioSaida_(u, lista) { return { id: u.id, matricula: u.matricula, nome: u.nome, ativo: u.ativo === 1 ? 1 : 0, permissoes: lista || [] }; }

function usuariosListar_(req) {
  gerenciaDe_(req);
  const por = permissoesAtivasPorUsuario_(lerLeitura_('PermissoesDosUsuarios')), ultimo = {}, abertas = {};
  lerLeitura_('SessoesDosUsuarios').forEach(function (s) {
    if (!s.id) return;
    ultimo[s.usuarioId] = Math.max(ultimo[s.usuarioId] || 0, s.ultimoUso || s.criadaEm || 0);
    if (!s.encerradaEm) abertas[s.usuarioId] = (abertas[s.usuarioId] || 0) + 1;
  });
  const usuarios = lerLeitura_('Usuarios').filter(function (u) { return u.id; }).map(function (u) {
    const o = usuarioSaida_(u, por[u.id]);
    o.senhaProvisoria = u.senhaProvisoria === 1 ? 1 : 0; o.criadoEm = u.criadoEm; o.ultimoAcesso = ultimo[u.id] || 0; o.sessoesAbertas = abertas[u.id] || 0;
    return o;
  }).sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome)); });
  return { ok: true, usuarios: usuarios };
}

/**
 * Cria a conta (matrícula opcional: sem ela o sistema gera GDV0001...) com as permissões e uma senha provisória, devolvida só aqui.
 * d = {matricula?, nome, permissoes[]}; autor = {quem}. Validação e hash fora do lock; matrícula única conferida dentro dele.
 */
function criarUsuario_(d, autor) {
  const nome = nomeServidor_(d.nome), perms = permissoesValidas_(d.permissoes);
  const matriculaPedida = d.matricula === null || d.matricula === undefined || String(d.matricula).trim() === '' ? '' : matriculaValida_(d.matricula);
  const senha = senhaProvisoriaNova_(), sal = aleatorioHex_(32), hash = hashSenha_(senha, sal);
  return comLock_(function () {
    const todos = lerLinhas_('Usuarios').filter(function (x) { return x.id; });
    const matricula = matriculaPedida || proximaMatricula_(todos);
    if (todos.some(function (x) { return chaveMatricula_(x.matricula) === chaveMatricula_(matricula); })) throw new Error('Já existe um usuário com a matrícula ' + matricula + '.');
    const agora = Date.now(), id = uuid_();
    inserir_('Usuarios', [{ id: id, matricula: matricula, nome: nome, senhaHash: hash, senhaSal: sal, senhaProvisoria: 1, senhaAlteradaEm: agora, ativo: 1,
                            criadoEm: agora, criadoPor: autor.quem, atualizadoEm: agora, atualizadoPor: autor.quem }]);
    inserir_('PermissoesDosUsuarios', perms.map(function (p) { return { id: uuid_(), usuarioId: id, permissao: p, concedidaEm: agora, concedidaPor: autor.quem }; }));
    historicoAcesso_([{ usuarioId: autor.quem, acao: 'usuario.criar', tabela: 'Usuarios', registroId: id, antes: '',
                        depois: { matricula: matricula, nome: nome, permissoes: perms } }]);
    return { usuario: { id: id, matricula: matricula, nome: nome, ativo: 1, permissoes: perms }, senhaProvisoria: senha };
  });
}

function usuarioCriar_(req) {
  const g = gerenciaDe_(req), r = criarUsuario_({ matricula: req.matricula, nome: req.nome, permissoes: req.permissoes }, g);
  return { ok: true, usuario: r.usuario, senhaProvisoria: r.senhaProvisoria };
}

/** usuarioPermissoes {usuarioId, permissoes[]}: a lista exata (revoga as que saíram, concede as novas). Nunca tira gerencia do último gerente ativo. */
function usuarioPermissoes_(req) {
  const g = gerenciaDe_(req), perms = permissoesValidas_(req.permissoes), usuarioId = String(req.usuarioId || '');
  return comLock_(function () {
    const usuarios = lerLinhas_('Usuarios').filter(function (x) { return x.id; }), u = usuarios.filter(function (x) { return x.id === usuarioId; })[0];
    if (!u) throw new Error('Usuário não encontrado.');
    const linhas = lerLinhas_('PermissoesDosUsuarios'), antes = permissoesAtivasPorUsuario_(linhas)[u.id] || [];
    if (antes.indexOf('gerencia') >= 0 && perms.indexOf('gerencia') < 0 && u.ativo === 1 && !outrosGerentesAtivos_(u.id, usuarios, linhas)) {
      throw new Error('Não é possível tirar a gerência do último gerente ativo.');
    }
    const agora = Date.now();
    linhas.forEach(function (p) {
      if (p.id && p.usuarioId === u.id && !p.revogadaEm && perms.indexOf(p.permissao) < 0) atualizar_('PermissoesDosUsuarios', p._linha, { revogadaEm: agora, revogadaPor: g.quem });
    });
    const novas = perms.filter(function (p) { return antes.indexOf(p) < 0; });
    inserir_('PermissoesDosUsuarios', novas.map(function (p) { return { id: uuid_(), usuarioId: u.id, permissao: p, concedidaEm: agora, concedidaPor: g.quem }; }));
    if (novas.length || antes.some(function (p) { return perms.indexOf(p) < 0; })) {
      historicoAcesso_([{ usuarioId: g.quem, acao: 'usuario.permissoes', tabela: 'PermissoesDosUsuarios', registroId: u.id, antes: { permissoes: antes }, depois: { permissoes: perms } }]);
    }
    return { ok: true, permissoes: perms };
  });
}

/**
 * Nova senha provisória (a pessoa troca no acesso seguinte) e fim de todas as sessões dela. criterio = {id} ou {matricula}; autor = {quem}.
 * Usada pela action usuarioNovaSenha (a gerência, para qualquer conta) e pelo menu da planilha (só gerente: novaSenhaGerente_).
 */
function definirSenhaProvisoria_(criterio, autor) {
  const senha = senhaProvisoriaNova_(), sal = aleatorioHex_(32), hash = hashSenha_(senha, sal);
  return comLock_(function () {
    const u = lerLinhas_('Usuarios').filter(function (x) {
      return x.id && (criterio.id ? x.id === criterio.id : chaveMatricula_(x.matricula) === chaveMatricula_(criterio.matricula));
    })[0];
    if (!u) throw new Error('Usuário não encontrado.');
    const agora = Date.now();
    atualizar_('Usuarios', u._linha, { senhaHash: hash, senhaSal: sal, senhaProvisoria: 1, senhaAlteradaEm: agora, atualizadoEm: agora, atualizadoPor: autor.quem });
    const n = encerrarSessoesAbertas_(function (s) { return s.usuarioId === u.id; }, 'nova senha provisória', autor.quem);
    historicoAcesso_([{ usuarioId: autor.quem, acao: 'usuario.novaSenha', tabela: 'Usuarios', registroId: u.id,
                        antes: { senhaProvisoria: u.senhaProvisoria }, depois: { senhaProvisoria: 1, sessoesEncerradas: n } }]);
    return { usuario: { id: u.id, matricula: u.matricula, nome: u.nome }, senhaProvisoria: senha };
  });
}

function usuarioNovaSenha_(req) {
  const g = gerenciaDe_(req), usuarioId = String(req.usuarioId || '');
  if (!usuarioId) throw new Error('Informe o usuário.');
  return { ok: true, senhaProvisoria: definirSenhaProvisoria_({ id: usuarioId }, g).senhaProvisoria };
}

/** usuarioAtivar {usuarioId, ativo: 0|1}: desativar encerra todas as sessões e nunca vale para o último gerente ativo. */
function usuarioAtivar_(req) {
  const g = gerenciaDe_(req), usuarioId = String(req.usuarioId || '');
  const ativo = req.ativo === 1 || req.ativo === '1' || req.ativo === true ? 1 : req.ativo === 0 || req.ativo === '0' || req.ativo === false ? 0 : -1;
  if (ativo < 0) throw new Error('Informe ativo: 1 (ativar) ou 0 (desativar).');
  return comLock_(function () {
    const usuarios = lerLinhas_('Usuarios').filter(function (x) { return x.id; }), u = usuarios.filter(function (x) { return x.id === usuarioId; })[0];
    if (!u) throw new Error('Usuário não encontrado.');
    if (u.ativo === ativo) return { ok: true };
    const perms = lerLinhas_('PermissoesDosUsuarios');
    if (!ativo && (permissoesAtivasPorUsuario_(perms)[u.id] || []).indexOf('gerencia') >= 0 && !outrosGerentesAtivos_(u.id, usuarios, perms)) {
      throw new Error('Não é possível desativar o último gerente ativo.');
    }
    const agora = Date.now();
    atualizar_('Usuarios', u._linha, { ativo: ativo, atualizadoEm: agora, atualizadoPor: g.quem });
    const n = ativo ? 0 : encerrarSessoesAbertas_(function (s) { return s.usuarioId === u.id; }, 'conta desativada', g.quem);
    historicoAcesso_([{ usuarioId: g.quem, acao: ativo ? 'usuario.ativar' : 'usuario.desativar', tabela: 'Usuarios', registroId: u.id,
                        antes: { ativo: u.ativo }, depois: { ativo: ativo, sessoesEncerradas: n } }]);
    return { ok: true };
  });
}

/** sessoesListar {usuarioId?}: só as sessões abertas. */
function sessoesListar_(req) {
  gerenciaDe_(req);
  const usuarioId = String(req.usuarioId || ''), nomes = {};
  lerLeitura_('Usuarios').forEach(function (u) { if (u.id) nomes[u.id] = u; });
  const sessoes = lerLeitura_('SessoesDosUsuarios').filter(function (s) { return s.id && !s.encerradaEm && (!usuarioId || s.usuarioId === usuarioId); }).map(function (s) {
    const u = nomes[s.usuarioId] || {};
    return { id: s.id, usuarioId: s.usuarioId, nome: u.nome || '', matricula: u.matricula || '', aplicativo: s.aplicativo, aparelhoId: s.aparelhoId, criadaEm: s.criadaEm, ultimoUso: s.ultimoUso };
  });
  return { ok: true, sessoes: sessoes };
}

/** sessaoEncerrar {sessaoId}: a gerência encerra uma sessão (aparelho perdido). Já encerrada = ok. */
function sessaoEncerrar_(req) {
  const g = gerenciaDe_(req), sessaoId = String(req.sessaoId || '');
  if (!sessaoId) throw new Error('Informe a sessão.');
  return comLock_(function () {
    const s = lerLinhas_('SessoesDosUsuarios').filter(function (x) { return x.id === sessaoId; })[0];
    if (!s) throw new Error('Sessão não encontrada.');
    if (s.encerradaEm) return { ok: true };
    atualizar_('SessoesDosUsuarios', s._linha, { encerradaEm: Date.now(), encerradaPor: g.quem, motivoDoEncerramento: 'encerrada pela gerência' });
    historicoAcesso_([{ usuarioId: g.quem, acao: 'sessao.encerrar', tabela: 'SessoesDosUsuarios', registroId: s.id,
                        antes: { usuarioId: s.usuarioId, aplicativo: s.aplicativo, aparelhoId: s.aparelhoId }, depois: { encerrada: 1 } }]);
    return { ok: true };
  });
}

/** Action → função. Montado na chamada (as funções ficam neste arquivo, mas mapas de funções não rodam ao carregar). null = não é daqui. */
function usuariosAcao_(nome) {
  const m = { entrar: entrar_, trocarSenha: trocarSenha_, sair: sair_, minhaSessao: minhaSessao_, usuariosListar: usuariosListar_, usuarioCriar: usuarioCriar_,
              usuarioPermissoes: usuarioPermissoes_, usuarioNovaSenha: usuarioNovaSenha_, usuarioAtivar: usuarioAtivar_, sessoesListar: sessoesListar_,
              sessaoEncerrar: sessaoEncerrar_ };
  return Object.prototype.hasOwnProperty.call(m, nome) ? m[nome] : null;
}

/* ---------- Funções do menu da planilha (menu-da-planilha.gs só colhe a entrada) ---------- */

const AUTOR_PLANILHA_ = { quem: 'planilha', nome: 'planilha' };

/** Usuários ativos com a permissão gerencia (leitura). */
function gerentesAtivos_() {
  const por = permissoesAtivasPorUsuario_(lerLeitura_('PermissoesDosUsuarios'));
  return lerLeitura_('Usuarios').filter(function (u) { return u.id && u.ativo === 1 && (por[u.id] || []).indexOf('gerencia') >= 0; });
}

/**
 * e-GDV → Criar o primeiro gerente: todas as permissões e senha provisória. Só quando não há gerente ativo (os demais o gerente cria
 * no painel). Matrícula vazia = gerada (GDV0001...). Devolve {usuario, senhaProvisoria}.
 */
function criarGerente_(matricula, nome) {
  if (gerentesAtivos_().length) throw new Error('Já existe gerente ativo. As outras contas são criadas pela gerência no painel.');
  return criarUsuario_({ matricula: matricula, nome: nome, permissoes: PERMISSOES_USUARIO_.slice() }, AUTOR_PLANILHA_);
}

/** e-GDV → Redefinir senha de gerente: nova senha provisória (troca obrigatória no acesso seguinte) e fim das sessões. Só para gerente ativo. */
function novaSenhaGerente_(matricula) {
  const k = chaveMatricula_(matricula);
  if (!k) throw new Error('Informe a matrícula.');
  if (!gerentesAtivos_().some(function (u) { return chaveMatricula_(u.matricula) === k; })) {
    throw new Error('Matrícula não é de um gerente ativo. A senha dos demais é redefinida pela gerência no painel.');
  }
  return definirSenhaProvisoria_({ matricula: matricula }, AUTOR_PLANILHA_);
}
