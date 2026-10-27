/* ---------- Nome do servidor, módulos do campo e autenticação do app (login com matrícula e senha: usuarios.gs) ---------- */

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

/* ---------- Módulos do campo (permissões do usuário: PermissoesDosUsuarios) ---------- */

const NOME_MODULO = { veiculos: 'Educação Sanitária/Fiscalização de Trânsito', tf: 'TF de Barreira', pce: 'PCE' };
// actions do app que pertencem a um módulo (o servidor recusa se o módulo não estiver liberado para quem chama)
const MODULO_DA_ACAO = { tfConsultar: 'tf', tfProximoNumero: 'tf', tfEmitir: 'tf', tfAndamento: 'tf', tfIndiceReincidencia: 'tf',
                         pceProximoNumero: 'pce', pceEmitir: 'pce', pceConsultar: 'pce', pceBaixarMunicipio: 'pce', pceMapaGeral: 'pce', arquivoEnviar: 'pce',
                         pceDocNumero: 'pce', pceDocRegistrar: 'pce',
                         turnoConvidar: 'veiculos', turnoParear: 'veiculos', turnoSair: 'veiculos',
                         turnoPapelRegistrar: 'veiculos', turnoNumero: 'veiculos' };
const MSG_SEM_ANTIGO = 'Sem autorização para digitar registros antigos (do papel). Fale com a gerência.';

/**
 * Módulos liberados para quem chama {veiculos, tf, pce, antigo}: vêm das permissões do usuário da sessão (USUARIO_ATUAL_, preenchido
 * por autenticar_ a cada chamada). Sem sessão, nada liberado. O parâmetro é só o nome (assinatura antiga); não muda o resultado.
 */
function permissoesDe_(usuario) {
  return USUARIO_ATUAL_ ? Object.assign({}, USUARIO_ATUAL_.modulos) : { veiculos: 0, tf: 0, pce: 0, antigo: 0 };
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

/* ---------- Segurança ---------- */

/** App de campo: valida o token da sessão (matrícula e senha, permissão `campo`) e devolve o nome do usuário. */
function autenticar_(key) {
  return usuarioDoApp_(key);
}
