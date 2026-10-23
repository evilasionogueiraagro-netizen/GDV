// Usuários do login por matrícula e senha para os testes (dados fictícios). Cria a conta pela função real do back
// (criarUsuario_, via /__fn do fakegas), entra pelo servidor real (action "entrar") e troca a senha provisória, como o app faz.
// Use no lugar dos antigos códigos de ativação: `const f = await usuarios.fiscal('Ana Paula Lima')` e, no navegador,
// `await ctx.addInitScript(i => Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)), f.ls)`.
const amb = require('./amb');
const { API } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());

const SENHA = 'Senha-Campo-123';
const MODULOS_DO_CAMPO = ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'pce', 'digitarDoPapel'];
let aparelhos = 0;

/** Cria a conta com as permissões e devolve {usuario, senhaProvisoria}. */
async function criar(nome, permissoes = MODULOS_DO_CAMPO, matricula) {
  const r = await get('/__fn?nome=criarUsuario_&args=' + encodeURIComponent(JSON.stringify([{ matricula, nome, permissoes }, { quem: 'teste' }])));
  if (r.erro || !r.r || !r.r.usuario) throw new Error('criar usuário: ' + JSON.stringify(r.erro || r.r));
  return r.r;
}

/**
 * Cria a conta, entra no aplicativo (padrão "campo") e troca a senha provisória. Devolve a sessão pronta:
 * {token, nome, matricula, senha, usuario, modulos, ls}. `ls` são as chaves do localStorage que o app grava ao entrar (para semear o navegador).
 * opcoes: {permissoes, matricula, aplicativo, trocar: false (fica com a senha provisória pendente)}.
 */
async function fiscal(nome, opcoes = {}) {
  const c = await criar(nome, opcoes.permissoes || MODULOS_DO_CAMPO, opcoes.matricula);
  const u = c.usuario, app = opcoes.aplicativo || 'campo';
  const e = await post({ action: 'entrar', matricula: u.matricula, senha: c.senhaProvisoria, aplicativo: app, aparelhoId: 'aparelho-teste-' + process.pid + '-' + (++aparelhos) });
  if (!e.ok) throw new Error('entrar: ' + e.erro);
  let senha = c.senhaProvisoria;
  if (opcoes.trocar !== false) {
    const t = await post({ action: 'trocarSenha', key: e.token, senhaAtual: senha, senhaNova: SENHA });
    if (!t.ok) throw new Error('trocarSenha: ' + t.erro);
    senha = SENHA;
  }
  const usuario = { id: u.id, matricula: u.matricula, nome: u.nome };
  const ls = { 'gdv.key': e.token, 'gdv.nome': u.nome, 'gdv.usuario': JSON.stringify(usuario), 'gdv.semInstalar': '1' };
  if (opcoes.trocar === false) ls['gdv.revogado'] = 'senha';
  return { token: e.token, nome: u.nome, matricula: u.matricula, senha, senhaProvisoria: c.senhaProvisoria, usuario, modulos: e.modulos, ls };
}

/** Token de um fiscal fixo do processo, para testes que só precisam semear dados com `sync` (antes usavam a ACCESS_KEY). */
let semeadorSessao = null;
const semeador = async () => (semeadorSessao = semeadorSessao || fiscal('Semeador Dados Teste')).then(f => f.token);

/** Sessão de gerente (permissão gerencia, pelo atalho /__usuario do fakegas) para as actions de gerência. Uma por processo de teste;
 *  não usa /__gerente, que só cria o primeiro gerente e falharia se o teste já tivesse um (amb.gerente, amb.carga). */
let gerenteSessao = null;
async function gerente() {
  if (gerenteSessao) return gerenteSessao;
  const g = await amb.gerente('Gerente Teste Campo');
  return (gerenteSessao = { token: g.token, usuario: g.usuario });
}
/** {veiculos, tf, pce, antigo} (1/0, o formato dos módulos do app) -> lista de permissões do campo. */
const lista = o => ['campo', ...(o.veiculos ? ['fiscalizacaoDeTransito'] : []), ...(o.tf ? ['termoDeBarreira'] : []), ...(o.pce ? ['pce'] : []), ...(o.antigo ? ['digitarDoPapel'] : [])];
/** A gerência define a lista exata de permissões de um usuário (vale na hora, no servidor). */
async function permissoes(usuarioId, lista) {
  const g = await gerente();
  return post({ action: 'usuarioPermissoes', key: g.token, usuarioId, permissoes: lista });
}
/** Encerra todas as sessões abertas do usuário (como revogar o acesso). */
async function revogar(usuarioId) {
  const g = await gerente();
  const l = await post({ action: 'sessoesListar', key: g.token, usuarioId });
  for (const s of l.sessoes || []) await post({ action: 'sessaoEncerrar', key: g.token, sessaoId: s.id });
}
/** Semeia o navegador (contexto) com a sessão: o app abre já com o acesso, como depois de entrar. */
const semear = (contexto, f) => contexto.addInitScript(([i]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } } catch (e) { /* sem storage */ } }, [f.ls]);

module.exports = { lista, semeador, SENHA, MODULOS_DO_CAMPO, criar, fiscal, gerente, permissoes, revogar, semear, post, get };
