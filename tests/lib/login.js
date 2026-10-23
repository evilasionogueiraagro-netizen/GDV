// Contas de teste com matrícula e senha (único acesso: não há mais código de ativação nem código de administrador).
// O primeiro gerente nasce como no menu da planilha (rota /__gerente do fakegas); os demais usuários o gerente cria pela action
// usuarioCriar; cada conta entra e troca a senha provisória, como no primeiro acesso de verdade.
const amb = require('./amb');
const post = b => fetch(amb.API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());

const SENHA = 'Senha-teste-1';
let base = null;      // gerente de partida (um por processo de teste, ou seja, um por fakegas)
let serie = 0;

/** Entra (action entrar) e, com senha provisória, troca pela senha nova. Devolve {token, permissoes}. */
async function entrarPronto(matricula, senhaProvisoria, senhaNova, aplicativo = 'painel') {
  const e = await post({ action: 'entrar', matricula, senha: senhaProvisoria, aplicativo, aparelhoId: 'Teste-aparelho' });
  if (!e.ok) throw new Error('entrar: ' + e.erro);
  if (e.trocarSenha) {
    const t = await post({ action: 'trocarSenha', key: e.token, senhaAtual: senhaProvisoria, senhaNova });
    if (!t.ok) throw new Error('trocarSenha: ' + t.erro);
  }
  return { token: e.token, permissoes: e.permissoes };
}

/** Gerente de partida (permissão gerencia, vale todas). */
async function gerenteBase() {
  if (base) return base;
  const g = await amb.gerente('Gerente Base Teste', { matricula: 'base.teste' });   // atalho /__usuario: convive com amb.gerente/amb.carga no mesmo teste
  base = { id: g.usuario.id, matricula: g.matricula, nome: g.usuario.nome, senha: g.senha, token: g.token, permissoes: g.permissoes };
  return base;
}

/**
 * Cria um usuário pelo gerente de partida e entra com ele. opcoes: {permissoes, matricula, aplicativo, trocar}.
 * Com trocar: false devolve a senha provisória (sem entrar), para testar a primeira entrada. Devolve {id, matricula, nome, senha, token, permissoes}.
 */
async function criar(nome, opcoes = {}) {
  const g = await gerenteBase();
  const permissoes = opcoes.permissoes || ['gerencia'];
  const matricula = opcoes.matricula || 'usr' + (++serie) + '.' + Math.random().toString(36).slice(2, 6);
  const r = await post({ action: 'usuarioCriar', key: g.token, matricula, nome, permissoes });
  if (!r.ok) throw new Error('usuarioCriar: ' + r.erro);
  const u = { id: r.usuario.id, matricula: r.usuario.matricula, nome, permissoes, provisoria: r.senhaProvisoria };
  if (opcoes.trocar === false) return u;
  const app = opcoes.aplicativo || (permissoes.includes('gerencia') || permissoes.includes('painel') ? 'painel' : permissoes.includes('administracao') ? 'administracao' : 'campo');
  const s = await entrarPronto(u.matricula, r.senhaProvisoria, SENHA, app);
  return Object.assign(u, { senha: SENHA, token: s.token });
}

/** Token de gerente (painel com tudo liberado). */
const painel = async (nome, opcoes) => (await criar(nome, opcoes)).token;
/** Conta só com a permissão Painel (a TV da sala, ou quem só consulta). */
const soLeitura = (nome, opcoes) => criar(nome, Object.assign({ permissoes: ['painel'] }, opcoes));
/** Fiscal do app de campo (todos os módulos): usado para semear dados pela action sync. */
const campo = (nome, opcoes) => criar(nome, Object.assign({ permissoes: ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'pce'] }, opcoes));
/** Conta do Portal do Administrativo. */
const portal = (nome, opcoes) => criar(nome, Object.assign({ permissoes: ['administracao'] }, opcoes));

/** Chaves do localStorage do painel para abrir já logado. */
const lsPainel = (u, extra = {}) => Object.assign({ 'gdv.painel.token': u.token, 'gdv.painel.nome': u.nome, 'gdv.painel.perm': JSON.stringify(u.permissoes || []) }, extra);

module.exports = { post, SENHA, entrarPronto, gerenteBase, criar, painel, soLeitura, campo, portal, lsPainel };
