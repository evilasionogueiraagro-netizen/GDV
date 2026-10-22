/* ---------- Aba "Servidores" do painel: chaves de ativação dos fiscais ---------- */

const NOME_SERVIDOR_MAX = 80;
const RE_NOME_SERVIDOR_ = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’.\- ]*$/;   // letras, espaço, apóstrofo, ponto e hífen (nada de fórmula)
function nomeChave_(v) { return String(v || '').trim().replace(/\s+/g, ' ').toLowerCase(); }

/** Nome completo do servidor digitado no painel: espaços normalizados, nome e sobrenome, só letras e pontuação de nome. */
function nomeServidor_(v) {
  const nome = String(v || '').trim().replace(/\s+/g, ' ');
  if (!nome) throw new Error('Informe o nome completo do servidor.');
  if (nome.length > NOME_SERVIDOR_MAX) throw new Error('Nome longo demais (máximo de ' + NOME_SERVIDOR_MAX + ' caracteres).');
  if (!RE_NOME_SERVIDOR_.test(nome)) throw new Error('Use só letras no nome (sem números ou símbolos).');
  if (nome.split(' ').filter(function (p) { return /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(p); }).length < 2) throw new Error('Informe o nome completo (nome e sobrenome).');
  return nome;
}

/**
 * Painel → "Gerar chave de ativação": código de FISCAL (uso único, 7 dias). Códigos de administrador continuam só pelo menu da planilha.
 * modulos (opcional) {veiculos, tf, pce, antigo}: módulos liberados para o servidor, gravados junto (aba Permissoes; pelo menos um).
 */
function painelGerarCodigo(token, nome, modulos) {
  const admin = adminDoToken_(token, true);
  const n = nomeServidor_(nome);
  const perm = modulos === undefined || modulos === null ? null : modulosValidos_(modulos);   // valida ANTES de gerar o código
  const g = gerarCodigo_(n, 'fiscal', admin);
  const r = { ok: true, nome: g.nome, codigo: g.codigo, expiraEm: g.expiraEm };
  if (perm) r.permissoes = gravarPermissoes_(g.nome, perm, admin);
  return r;
}

/* ---------- Módulos autorizados por servidor (aba Permissoes) ---------- */

const MODULOS = ['veiculos', 'tf', 'pce'];
const NOME_MODULO = { veiculos: 'Educação Sanitária/Fiscalização de Trânsito', tf: 'TF de Barreira', pce: 'PCE' };
// actions do app que pertencem a um módulo (o servidor recusa se o módulo não estiver liberado para quem chama)
const MODULO_DA_ACAO = { tfConsultar: 'tf', tfProximoNumero: 'tf', tfEmitir: 'tf', tfAndamento: 'tf', tfIndiceReincidencia: 'tf',
                         pceProximoNumero: 'pce', pceEmitir: 'pce', pceConsultar: 'pce', pceBaixarMunicipio: 'pce', arquivoEnviar: 'pce',
                         pceDocNumero: 'pce', pceDocRegistrar: 'pce' };
const tudoLiberado_ = function () { return { veiculos: 1, tf: 1, pce: 1, antigo: 0 }; };   // "antigo" (Digitar do papel): desligado por padrão
const MSG_SEM_ANTIGO = 'Sem autorização para digitar registros antigos (do papel). Fale com a gerência.';

/** Célula da aba Permissoes → 0/1. Vazio ou qualquer outro valor = liberado (só "0", "não", "false" bloqueiam). */
function moduloLiberado_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return s === '0' || s === 'false' || s === 'não' || s === 'nao' || s === 'n' ? 0 : 1;
}

/** Célula "antigo" → 0/1. Ao contrário dos módulos, só "1", "sim", "true" ou "s" autorizam (vazio = não autorizado). */
function antigoLiberado_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'sim' || s === 's' ? 1 : 0;
}

/** Mapa nome normalizado → {veiculos, tf, pce, antigo} (linhas repetidas: vale a última). "antigo" só vale com o PCE liberado. */
function mapaPermissoes_() {
  const m = {};
  lerLeitura_('Permissoes').forEach(function (r) {
    const k = nomeChave_(r.nome);
    if (!k) return;
    const pce = moduloLiberado_(r.pce);
    m[k] = { veiculos: moduloLiberado_(r.veiculos), tf: moduloLiberado_(r.tf), pce: pce, antigo: pce ? antigoLiberado_(r.antigo) : 0 };
  });
  return m;
}

/**
 * Módulos liberados para um usuário (nome do fiscal). Sem linha na aba = três módulos liberados e "antigo" desligado.
 * Chave mestra (ACCESS_KEY, usuário "Administrador") = tudo, inclusive "antigo".
 */
function permissoesDe_(usuario, mapa) {
  // sessão nova (matrícula e senha): os módulos vêm das permissões do usuário (PermissoesDosUsuarios), não da aba Permissoes
  if (!mapa && USUARIO_ATUAL_ && usuario === USUARIO_ATUAL_.nome) return Object.assign({}, USUARIO_ATUAL_.modulos);
  if (!usuario || usuario === 'Administrador') { const t = tudoLiberado_(); t.antigo = 1; return t; }
  return (mapa || mapaPermissoes_())[nomeChave_(usuario)] || tudoLiberado_();
}

/** Recusa registro antigo (digitado do papel) / PDF escaneado sem a permissão "antigo". Mensagem sem "revogado"/"inválido". */
function exigirAntigo_(usuario) {
  const perm = permissoesDe_(usuario);
  if (perm.antigo) return perm;
  const e = new Error(MSG_SEM_ANTIGO);
  e.semPermissao = 'antigo'; e.permissoes = perm;
  throw e;
}

/** Recusa a ação de um módulo não liberado. A mensagem não fala em "revogado"/"inválido" (o app trataria como acesso revogado). */
function exigirModulo_(usuario, modulo) {
  const perm = permissoesDe_(usuario);
  if (perm[modulo]) return perm;
  const e = new Error('Sem autorização para o módulo ' + NOME_MODULO[modulo] + '. Fale com a gerência.');
  e.semPermissao = modulo; e.permissoes = perm;
  throw e;
}

/**
 * {veiculos, tf, pce, antigo?} vindos do painel → 0/1, com pelo menos um módulo marcado (só veiculos/tf/pce contam).
 * antigo ("Digitar do papel") exige o PCE: antigo marcado sem PCE é recusado com mensagem clara (o painel já marca o PCE junto).
 * antigo ausente (painel antigo) = mantém o que estiver gravado (se o PCE for tirado, vira 0).
 */
function modulosValidos_(m) {
  if (!m || typeof m !== 'object') throw new Error('Informe os módulos do servidor.');
  const o = {}, sim = function (v) { return v === true || v === 1 || v === '1' ? 1 : 0; };
  MODULOS.forEach(function (k) { o[k] = sim(m[k]); });
  if (!o.veiculos && !o.tf && !o.pce) throw new Error('Marque pelo menos um módulo. Para tirar todo o acesso do servidor, use o botão Revogar.');
  if (m.antigo !== undefined && m.antigo !== null) {
    o.antigo = sim(m.antigo);
    if (o.antigo && !o.pce) throw new Error('“Digitar do papel” só vale com o módulo PCE: marque também o PCE (ou desmarque “Digitar do papel”).');
  }
  return o;
}

/** Grava (ou atualiza) a linha do servidor na aba Permissoes, sob lock. Devolve {veiculos, tf, pce, antigo, atualizadoEm, atualizadoPor}. */
function gravarPermissoes_(nome, perm, autor) {
  const chave = nomeChave_(nome);
  const quem = String(autor || 'planilha').replace(/^[=+\-@\s]+/, '').slice(0, 120) || 'planilha';   // texto, nunca fórmula
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Permissoes'), agora = Date.now();
    let idx = -1;
    t.valores.forEach(function (l, i) { if (nomeChave_(l[0]) === chave) idx = i; });
    const antes = idx >= 0 ? antigoLiberado_(t.valores[idx][t.cols.indexOf('antigo')]) : 0;
    const antigo = perm.pce ? (perm.antigo === undefined ? antes : perm.antigo) : 0;      // sem PCE não há "Digitar do papel"
    const o = { nome: idx >= 0 ? String(t.valores[idx][0]) : String(nome).replace(/^[=+\-@\s]+/, ''), veiculos: perm.veiculos, tf: perm.tf, pce: perm.pce,
                atualizadoEm: agora, atualizadoPor: quem, antigo: antigo };
    const linha = [t.cols.map(function (c) { return o[c]; })];
    if (idx >= 0) t.sh.getRange(idx + 2, 1, 1, t.cols.length).setValues(linha);
    else t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length).setValues(linha);
    return { veiculos: o.veiculos, tf: o.tf, pce: o.pce, antigo: antigo, atualizadoEm: agora, atualizadoPor: quem };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Painel → aba Servidores → caixas "Veículos / TF / PCE / Papel": módulos em que o servidor pode inserir dados (por nome, todos os aparelhos).
 * Só administrador. O servidor precisa existir na aba Fiscais (como fiscal). Pelo menos um módulo; para bloquear tudo, Revogar.
 * "antigo" (Digitar do papel) é opcional, desligado por padrão e exige o PCE marcado (senão: erro pedindo para marcar o PCE).
 */
function painelPermissoes(token, nome, req) {
  const admin = adminDoToken_(token, true);
  nome = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, NOME_SERVIDOR_MAX + 20);
  if (!nome) throw new Error('Informe o nome do servidor.');
  const perm = modulosValidos_(req && req.modulos ? req.modulos : req);
  const linhas = lerLeitura_('Fiscais').filter(function (f) { return nomeChave_(f.nome) === nomeChave_(nome); });
  const fiscal = linhas.filter(function (f) { return f.perfil !== 'admin'; })[0];
  if (!fiscal) {
    if (linhas.length) throw new Error('Administrador não tem restrição de módulos.');
    throw new Error('Servidor não encontrado na lista de acessos.');
  }
  const g = gravarPermissoes_(fiscal.nome, perm, admin);
  return { ok: true, nome: fiscal.nome, permissoes: { veiculos: g.veiculos, tf: g.tf, pce: g.pce, antigo: g.antigo }, atualizadoEm: g.atualizadoEm, atualizadoPor: g.atualizadoPor };
}

/**
 * Situação de uma linha da aba Fiscais: revogado (ativo ≠ 1), ativo (aparelho/painel com credencial), aguardando (código válido
 * ainda não usado) ou vencido (código não usado que passou da validade).
 */
function situacaoAcesso_(f, agora) {
  if (f.ativo !== 1) return 'revogado';
  if (f.token) return 'ativo';
  if (f.codigo !== '' && f.expiraEm > agora) return 'aguardando';
  return f.codigo !== '' ? 'vencido' : 'revogado';
}

/**
 * Lista dos acessos para o painel. Nunca devolve credencial (token). O código só vai para fiscal aguardando ativação (para reenviar).
 * Administradores entram só com nome e situação. "criadoEm" = validade − 7 dias (o código sempre nasce com 7 dias).
 */
function painelAcessos(token, ocultos) {
  adminDoToken_(token);
  const comOcultos = ocultos === true || ocultos === 1 || ocultos === '1';
  const agora = Date.now(), mapa = mapaPermissoes_(), veCodigos = ehGerenciaAtual_();
  // aparelhos por servidor (nome): o mais recente + quantos; vai na linha "ativo" mais recente do servidor
  const aps = {};
  lerAparelhos_().forEach(function (ap) { (aps[nomeChave_(ap.usuario)] = aps[nomeChave_(ap.usuario)] || []).push(ap); });
  const comAparelho = {};
  const lista = lerLeitura_('Fiscais').filter(function (f) { return f.nome && (comOcultos || f.oculto !== 1); }).map(function (f) {
    const situacao = situacaoAcesso_(f, agora);
    if (f.perfil === 'admin') { const a = { nome: f.nome, perfil: 'admin', situacao: situacao }; if (f.oculto === 1) a.oculto = 1; return a; }
    const o = { nome: f.nome, perfil: 'fiscal', situacao: situacao, criadoEm: f.expiraEm > VALIDADE_CODIGO_MS ? f.expiraEm - VALIDADE_CODIGO_MS : 0,
                expiraEm: f.expiraEm > VALIDADE_CODIGO_MS ? f.expiraEm : 0, ativadoEm: f.ativadoEm > 1e12 ? f.ativadoEm : 0, geradoPor: f.geradoPor || '',
                permissoes: permissoesDe_(f.nome, mapa) };                                     // módulos liberados (por nome; padrão: todos, "antigo" desligado)
    if (situacao === 'aguardando' && veCodigos) o.codigo = f.codigo.padStart(6, '0');   // painel só leitura não recebe códigos que ainda ativam aparelhos
    if (f.oculto === 1) o.oculto = 1;                                                 // só com ocultos:true ("Mostrar removidos")
    return o;
  });
  lista.filter(function (o) { return o.perfil === 'fiscal' && o.situacao === 'ativo' && !o.oculto; })
    .sort(function (a, b) { return (b.ativadoEm || 0) - (a.ativadoEm || 0); })
    .forEach(function (o) {
      const k = nomeChave_(o.nome), l = aps[k];
      if (!l || comAparelho[k]) return;
      comAparelho[k] = true;
      const ult = l.slice().sort(function (x, y) { return y.ultimoSinal - x.ultimoSinal; })[0];
      o.aparelho = resumoAparelho_(ult); o.nAparelhos = l.length;
      o.aparelhos = l.map(resumoAparelho_).sort(function (x, y) { return y.ultimoSinal - x.ultimoSinal; }).slice(0, 10);
    });
  lista.sort(function (a, b) { return (b.criadoEm || 0) - (a.criadoEm || 0) || String(a.nome).localeCompare(String(b.nome)); });
  return { ok: true, agora: agora, acessos: lista, ocultarAdmin: true };     // ocultarAdmin: o painel só mostra "Remover" em administrador se o back aceita
}

/** Painel → "Revogar": tira todos os acessos de FISCAL com esse nome (aparelhos e códigos). Administrador: painelRevogarAdmin. */
function painelRevogar(token, nome) {
  adminDoToken_(token, true);
  nome = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, NOME_SERVIDOR_MAX + 20);
  if (!nome) throw new Error('Informe o nome do servidor.');
  const n = revogar_(nome, 'fiscal');
  if (!n && lerLeitura_('Fiscais').some(function (f) { return f.perfil === 'admin' && f.ativo === 1 && nomeChave_(f.nome) === nomeChave_(nome); })) {
    throw new Error(nome + ' é administrador: marque "Mostrar administradores" e use o Revogar da linha de administrador.');
  }
  return { ok: true, nome: nome, revogados: n };
}

/**
 * Painel → "Revogar" na linha de um administrador: tira os acessos de ADMINISTRADOR com esse nome (painel e TV; credenciais e
 * códigos ainda não usados). Não toca em acessos de fiscal do mesmo nome. O próprio acesso não sai por aqui (use Sair), para
 * ninguém se trancar fora do painel. Novo acesso de administrador continua só pelo menu da planilha.
 */
function painelRevogarAdmin(token, nome) {
  const admin = adminDoToken_(token, true);
  nome = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, NOME_SERVIDOR_MAX + 20);
  if (!nome) throw new Error('Informe o nome do administrador.');
  if (nomeChave_(nome) === nomeChave_(admin)) throw new Error('Este é o seu próprio acesso. Para sair do painel, use o botão Sair.');
  return { ok: true, nome: nome, revogados: revogar_(nome, 'admin') };
}

/**
 * Painel → "Remover da lista" (restaurar = false) ou "Restaurar" (true) um servidor revogado/com código vencido.
 * Não apaga nada (auditoria): marca oculto = 1, ocultoPor (administrador) e ocultoEm nas linhas de FISCAL desse nome; restaurar volta
 * oculto = 0 (ocultoPor/ocultoEm ficam como registro da última remoção). Recusa ocultar quem ainda tem aparelho ativo ou código
 * aguardando ativação. Uma chave nova para o mesmo nome nasce sem oculto, e o servidor volta à lista normalmente.
 * perfil = 'admin': o mesmo nas linhas de ADMINISTRADOR (painel e TV) desse nome, com as mesmas verificações; o próprio acesso de
 * quem está logado nunca sai da lista. Sem perfil (ou outro valor) = só fiscal, como sempre.
 */
function painelOcultarAcesso(token, nome, restaurar, perfil) {
  const admin = adminDoToken_(token, true), deAdmin = perfil === 'admin';
  nome = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, NOME_SERVIDOR_MAX + 20);
  if (!nome) throw new Error(deAdmin ? 'Informe o nome do administrador.' : 'Informe o nome do servidor.');
  const chave = nomeChave_(nome), quem = String(admin || 'Administrador').replace(/^[=+\-@\s]+/, '').slice(0, 120) || 'Administrador';
  if (deAdmin && !restaurar && chave === nomeChave_(admin)) throw new Error('Este é o seu próprio acesso: ele não sai da lista. Para sair do painel, use o botão Sair.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais'), agora = Date.now(), linhas = [];
    t.valores.forEach(function (l, i) {
      const f = paraObjeto_(t.cols, l);
      if ((f.perfil === 'admin') === deAdmin && nomeChave_(f.nome) === chave) linhas.push({ i: i, f: f });
    });
    if (!linhas.length) throw new Error((deAdmin ? 'Administrador' : 'Servidor') + ' não encontrado na lista: ' + nome + '.');
    if (!restaurar) {
      const vivos = linhas.filter(function (x) { const s = situacaoAcesso_(x.f, agora); return s === 'ativo' || s === 'aguardando'; });
      if (vivos.length) {
        throw new Error(linhas[0].f.nome + ' ainda tem ' + (vivos.some(function (x) { return situacaoAcesso_(x.f, agora) === 'ativo'; }) ? 'acesso ativo' : 'código aguardando ativação') +
          '. Só sai da lista quem está revogado ou com código vencido: revogue o acesso antes.');
      }
    }
    let n = 0;
    linhas.forEach(function (x) {
      const f = x.f;
      if (restaurar ? f.oculto !== 1 : f.oculto === 1) return;
      if (restaurar) f.oculto = 0; else { f.oculto = 1; f.ocultoPor = quem; f.ocultoEm = agora; }
      t.sh.getRange(x.i + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return f[c]; })]);
      n++;
    });
    return restaurar ? { ok: true, nome: linhas[0].f.nome, restaurados: n } : { ok: true, nome: linhas[0].f.nome, ocultos: n };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Segurança ---------- */

/** Valida a credencial e devolve o nome do usuário (fiscal ou "Administrador"). */
function autenticar_(key) {
  key = String(key || '');
  if (!key) throw new Error('Aparelho não ativado.');
  if (ehTokenUsuario_(key)) return usuarioDoApp_(key);                      // matrícula e senha (usuarios.gs): exige a permissão `campo`
  exigirAcessosAntigos_();                                                    // acessos antigos desligados: só matrícula e senha
  const mestra = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  if (mestra && key === mestra) return 'Administrador';
  const t = lerTudo_('Fiscais');
  for (let i = 0; i < t.valores.length; i++) {
    const f = paraObjeto_(t.cols, t.valores[i]);
    if (f.token && f.token === key && f.ativo === 1) return f.nome;
  }
  throw new Error('Acesso revogado ou inválido. Ative o aparelho novamente com um novo código.');
}

/** O aparelho troca o código de 6 dígitos por uma credencial própria (uso único). */
function ativar_(req) {
  exigirAcessosAntigos_();
  const cache = CacheService.getScriptCache();
  // contadores separados: erros no painel (admin) não travam a ativação dos aparelhos dos fiscais, e vice-versa
  const chaveFalhas = req.perfil === 'admin' ? 'falhas_ativacao_admin' : 'falhas_ativacao';
  const limite = req.perfil === 'admin' ? MAX_FALHAS_ADMIN : MAX_FALHAS_ATIVACAO;
  const bloqueado = function () { return Number(cache.get(chaveFalhas) || 0) >= limite; };
  const msgBloqueio = 'Muitas tentativas incorretas. Aguarde 15 minutos e tente de novo.';
  if (bloqueado()) throw new Error(msgBloqueio);                  // recusa rápida, sem esperar o lock
  const cod = String(req.codigo || '').replace(/\D/g, '');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // releitura DENTRO do lock: requisições em paralelo não leem o mesmo contador (cada erro soma 1 de verdade)
    const falhas = Number(cache.get(chaveFalhas) || 0);
    if (falhas >= limite) throw new Error(msgBloqueio);
    const t = lerTudo_('Fiscais'), agora = Date.now();
    let achada = -1;
    if (cod.length === 6) {
      t.valores.forEach(function (l, i) {
        const f = paraObjeto_(t.cols, l);
        if (achada < 0 && f.ativo === 1 && !f.token && f.codigo !== '' && f.codigo.padStart(6, '0') === cod && f.expiraEm > agora &&
            (f.perfil === 'admin') === (req.perfil === 'admin')) achada = i;
      });
    }
    if (achada < 0) {
      let motivo = 'Código incorreto ou já usado. Gere um novo código no menu e-GDV da planilha.';
      if (cod.length !== 6) motivo = 'O código tem 6 dígitos.';
      else t.valores.forEach(function (l) {                        // explica o motivo quando o código existe, mas não pode ser usado aqui
        const f = paraObjeto_(t.cols, l);
        if (f.token || f.codigo === '' || f.codigo.padStart(6, '0') !== cod) return;
        if (f.ativo !== 1) motivo = 'Este código foi revogado. Gere um novo código.';
        else if ((f.perfil === 'admin') !== (req.perfil === 'admin')) {
          motivo = req.perfil === 'admin'
            ? 'Este é um código de FISCAL. Para o painel, gere o código em e-GDV → Gerar código de administrador (painel).'
            : 'Este é um código de ADMINISTRADOR (painel). Para o app dos fiscais, gere o código em e-GDV → Gerar código de ativação.';
        } else if (f.expiraEm <= agora) motivo = 'Código expirado. Gere um novo código.';
      });
      cache.put(chaveFalhas, String(falhas + 1), 900);
      throw new Error(motivo);
    }
    const f = paraObjeto_(t.cols, t.valores[achada]);
    f.token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    f.ativadoEm = agora;
    f.codigo = '';                                            // código de uso único
    t.sh.getRange(achada + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return f[c]; })]);
    return { ok: true, nome: f.nome, token: f.token };
  } finally {
    lock.releaseLock();
  }
}

/** Cria uma autorização (linha em "Fiscais") e devolve o código de 6 dígitos. geradoPor: administrador do painel (padrão "planilha" = menu). */
function gerarCodigo_(nome, perfil, geradoPor) {
  nome = String(nome || '').trim().replace(/\s+/g, ' ');
  if (perfil !== 'admin' && nome.split(' ').length < 2) throw new Error('Informe o nome completo (nome e sobrenome).');
  if (!nome) throw new Error('Informe o nome.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais'), agora = Date.now();
    const emUso = {};
    t.valores.forEach(function (l) {
      const f = paraObjeto_(t.cols, l);
      if (f.ativo === 1 && !f.token && f.codigo) emUso[f.codigo.padStart(6, '0')] = true;
    });
    let codigo;
    do {
      codigo = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000).padStart(6, '0');
    } while (emUso[codigo]);
    const expiraEm = agora + VALIDADE_CODIGO_MS;
    const autor = String(geradoPor || 'planilha').replace(/^[=+\-@\s]+/, '').slice(0, 120) || 'planilha';   // texto, nunca fórmula
    const linha = { nome: nome, codigo: codigo, expiraEm: expiraEm, ativo: 1, token: '', ativadoEm: 0, perfil: perfil === 'admin' ? 'admin' : '', geradoPor: autor,
                    oculto: '', ocultoPor: '', ocultoEm: '' };                                  // linha nova nunca nasce "removida da lista"
    t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return linha[c]; })]);
    return { codigo: codigo, expiraEm: expiraEm, nome: nome, perfil: perfil === 'admin' ? 'admin' : 'fiscal' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Revoga todos os aparelhos/códigos com esse nome. Devolve quantos foram revogados.
 * perfil: 'fiscal' = só acessos de fiscal (painelRevogar), 'admin' = só de administrador (painelRevogarAdmin), vazio = todos (menu).
 */
function revogar_(nome, perfil) {
  nome = nomeChave_(nome);
  if (!nome) return 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais'); let n = 0;
    t.valores.forEach(function (l, i) {
      const f = paraObjeto_(t.cols, l);
      if (nomeChave_(f.nome) === nome && f.ativo === 1 && (!perfil || (perfil === 'admin') === (f.perfil === 'admin'))) {
        f.ativo = 0;
        t.sh.getRange(i + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return f[c]; })]);
        n++;
      }
    });
    return n;
  } finally {
    lock.releaseLock();
  }
}
