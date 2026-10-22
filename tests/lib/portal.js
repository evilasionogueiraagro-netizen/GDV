// Portal do Administrativo nos testes: uma conta com a permissão `administracao` e a sessão aberta (atalho /__usuario do fakegas) e o
// portal aberto no navegador já com a sessão (localStorage), como depois do login.
const amb = require('./amb');
const post = b => fetch(amb.API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());

/** Conta do Administrativo (só `administracao`) com sessão aberta. Devolve {sessao, nome, email: '', id}. tokPainel e email ficaram da assinatura antiga. */
async function sessao(tokPainel, email, nome) {
  const r = await amb.usuario(nome, { aplicativo: 'administracao', permissoes: ['administracao'] });
  return { sessao: r.token, nome: r.usuario.nome, email: '', id: r.usuario.id };
}

/** Abre o portal (página nova num contexto novo) com a sessão já guardada; espera as abas. */
async function abrir(b, s, opts = {}) {
  const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block', acceptDownloads: true, ...opts });
  await c.addInitScript(([url, ses, nome, email, aba]) => {
    if (!sessionStorage.getItem('__adm')) { sessionStorage.setItem('__adm', 1); localStorage.setItem('gdv.url', url); localStorage.setItem('gdv.adm.sessao', ses); localStorage.setItem('gdv.adm.nome', nome); localStorage.setItem('gdv.adm.email', email || ''); if (aba) localStorage.setItem('gdv.adm.aba', aba); }
  }, [amb.API_URL, s.sessao, s.nome, s.email, opts.aba || '']);
  const p = await c.newPage();
  p.errosPag = [];
  p.on('pageerror', e => p.errosPag.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errosPag.push(m.text()); });
  p.on('dialog', dl => dl.accept());
  await p.goto(amb.ORIGEM + '/administrativo/');
  await p.waitForSelector('#adm-abas .pn-aba', { timeout: 20000 });
  return p;
}
async function aba(p, id) { await p.click(`#adm-abas [data-aba="${id}"]`); }

module.exports = { sessao, abrir, aba, post };
