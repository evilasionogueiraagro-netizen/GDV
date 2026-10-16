/* Painel gerencial do GDV — aba "Usuários" (controle de acesso do gerente): login e senha para o app, o painel e o portal.
   O gerente cria o usuário (perfis, módulos do fiscal e senha provisória), edita, desativa/reativa e define uma senha nova.
   Desativar ou trocar a senha encerra a sessão em todos os aparelhos (no servidor: painelUsuarioSalvar). Ninguém vê senha:
   a planilha guarda só o hash. As credenciais antigas (códigos de 6 dígitos) continuam na aba Servidores. */
(() => {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, esc = P.esc;
  const PERFIS = [['fiscal', 'Fiscal (app de campo)'], ['administrativo', 'Administrativo (portal)'], ['gerente', 'Gerente (painel e acessos)'], ['dev', 'Desenvolvedor (tudo)']];
  const MODULOS = [['veiculos', 'Veículos'], ['tf', 'TF'], ['pce', 'PCE'], ['antigo', 'Digitar do papel']];
  const E = { raiz: null, lista: null, erro: '', editando: null, msg: '' };

  async function carregar() {
    try { E.lista = (await P.chamar({ action: 'painelUsuarios' })).usuarios; E.erro = ''; }
    catch (e) { E.erro = e.message; }
    desenhar();
  }
  const data = ms => ms ? `${P.fmt.data(P.diaManaus(ms))} ${P.horaManaus(ms)}` : 'nunca';
  const marcado = (lista, k) => lista && lista.indexOf(k) >= 0 ? 'checked' : '';

  function formHTML(u) {
    u = u || { login: '', nome: '', perfis: ['fiscal'], modulos: { veiculos: 1, tf: 1, pce: 1, antigo: 0 }, ativo: 1 };
    const mods = Object.keys(u.modulos || {}).filter(k => u.modulos[k]);
    return `<form class="pn-cartao pn-us-form" id="pn-us-form" autocomplete="off">
      <h3>${u.id ? 'Editar usuário' : 'Novo usuário'}</h3>
      <div class="pn-us-campos">
        <label>Usuário (para entrar)<input id="pn-us-login" value="${esc(u.login)}" placeholder="ex.: joao.silva" autocapitalize="none" spellcheck="false" required></label>
        <label>Nome completo<input id="pn-us-nome" value="${esc(u.nome)}" required></label>
        <label>${u.id ? 'Senha nova (deixe em branco para manter)' : 'Senha provisória'}<input id="pn-us-senha" type="text" autocomplete="off" minlength="8" ${u.id ? '' : 'required'} placeholder="pelo menos 8 caracteres"></label>
      </div>
      <fieldset><legend>Perfis</legend>${PERFIS.map(([k, r]) => `<label class="pn-us-caixa"><input type="checkbox" name="pn-us-perfil" value="${k}" ${marcado(u.perfis, k)}> ${esc(r)}</label>`).join('')}</fieldset>
      <fieldset id="pn-us-mods"><legend>Módulos do app (fiscal)</legend>${MODULOS.map(([k, r]) => `<label class="pn-us-caixa"><input type="checkbox" name="pn-us-mod" value="${k}" ${marcado(mods, k)}> ${esc(r)}</label>`).join('')}</fieldset>
      <p class="pn-sub">A pessoa entra com a senha provisória e cria a própria senha no primeiro acesso. Senha nova ou desativar encerra o acesso em todos os aparelhos.</p>
      <div class="pn-us-botoes"><button type="submit" class="pn-btn pn-btn-prim" id="pn-us-salvar">${u.id ? 'Salvar alterações' : 'Criar usuário'}</button>
        ${u.id ? '<button type="button" class="pn-btn" data-us="cancelar">Cancelar</button>' : ''}
        <span class="pn-pub-msg" id="pn-us-msg" role="status">${esc(E.msg)}</span></div>
    </form>`;
  }
  function desenhar() {
    const r = E.raiz; if (!r) return;
    r.innerHTML = formHTML(E.editando) + (E.erro ? `<p class="pn-erro" role="alert">${esc(E.erro)}</p>` : '') + '<div id="pn-us-lista"></div>';
    mostrarModulos();
    const l = r.querySelector('#pn-us-lista');
    if (!E.lista) { P.vazio(l, E.erro ? 'Não foi possível ler os usuários.' : 'Carregando os usuários…'); return; }
    const s = P.secao(l, 'Usuários', 'Quem entra com usuário e senha. Os acessos antigos por código continuam na aba Servidores.');
    P.tabela(s, [
      { chave: 'login', rotulo: 'Usuário' }, { chave: 'nome', rotulo: 'Nome' },
      { chave: 'perfis', rotulo: 'Perfis', fmt: v => (v || []).join(', ') },
      { chave: 'modulos', rotulo: 'Módulos', fmt: (v, u) => (u.perfis || []).indexOf('fiscal') < 0 ? '—' : MODULOS.filter(([k]) => v && v[k]).map(([, r2]) => r2).join(', ') || '—' },
      { chave: 'ativo', rotulo: 'Situação', html: (v, u) => `<span class="pn-selo ${v ? (u.trocarSenha ? 'atencao' : 'bom') : 'serio'}">${v ? (u.trocarSenha ? 'Senha provisória' : 'Ativo') : 'Desativado'}</span>` },
      { chave: 'ultimoAcesso', rotulo: 'Último acesso', fmt: data },
      { chave: 'id', rotulo: 'Ações', html: (id, u) => `<button type="button" class="pn-link" data-us="editar" data-id="${esc(id)}">Editar</button>
        <button type="button" class="pn-link" data-us="${u.ativo ? 'desativar' : 'reativar'}" data-id="${esc(id)}">${u.ativo ? 'Desativar' : 'Reativar'}</button>` }
    ], E.lista.slice().sort((a, b) => b.ativo - a.ativo || a.nome.localeCompare(b.nome, 'pt-BR')), { id: 'usuarios', limite: 50, vazio: 'Nenhum usuário ainda. Crie o primeiro acima.' });
  }
  function mostrarModulos() {
    const r = E.raiz, f = r && r.querySelector('#pn-us-mods'); if (!f) return;
    f.hidden = !r.querySelector('input[name=pn-us-perfil][value=fiscal]').checked;
  }
  const marcados = nome => [...E.raiz.querySelectorAll(`input[name=${nome}]:checked`)].map(i => i.value);

  async function salvar(corpo, msgOk) {
    const b = E.raiz.querySelector('#pn-us-salvar'); if (b) b.disabled = true;
    try {
      const j = await P.chamar(Object.assign({ action: 'painelUsuarioSalvar' }, corpo));
      E.msg = msgOk || (j.novo ? `Usuário ${j.usuario.login} criado.` : 'Salvo.'); E.editando = null;
      await carregar();
    } catch (e) { const m = E.raiz.querySelector('#pn-us-msg'); if (m) { m.textContent = e.message; m.className = 'pn-pub-msg erro'; } if (b) b.disabled = false; }
  }
  function montar() {
    const r = P.el('div', 'pn-us'); r.id = 'pn-us';
    r.addEventListener('change', e => { if (e.target.name === 'pn-us-perfil') mostrarModulos(); });
    r.addEventListener('submit', e => {
      e.preventDefault();
      const m = {}; MODULOS.forEach(([k]) => { m[k] = 0; }); marcados('pn-us-mod').forEach(k => { m[k] = 1; });
      const u = E.editando || {};
      salvar({ id: u.id || '', login: r.querySelector('#pn-us-login').value, nome: r.querySelector('#pn-us-nome').value,
        senha: r.querySelector('#pn-us-senha').value, perfis: marcados('pn-us-perfil'), modulos: m, ativo: u.id ? u.ativo : 1 });
    });
    r.addEventListener('click', e => {
      const b = e.target.closest('[data-us]'); if (!b) return;
      const u = (E.lista || []).find(x => x.id === b.dataset.id);
      if (b.dataset.us === 'cancelar') { E.editando = null; E.msg = ''; desenhar(); }
      else if (b.dataset.us === 'editar' && u) { E.editando = u; E.msg = ''; desenhar(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      else if ((b.dataset.us === 'desativar' || b.dataset.us === 'reativar') && u) {
        const ativo = b.dataset.us === 'reativar' ? 1 : 0;
        if (!ativo && !confirm(`Desativar ${u.nome}? O acesso dele acaba agora em todos os aparelhos.`)) return;
        salvar({ id: u.id, login: u.login, nome: u.nome, perfis: u.perfis, modulos: u.modulos, ativo }, ativo ? `${u.nome} reativado.` : `${u.nome} desativado.`);
      }
    });
    return r;
  }
  function render(c) {
    if (!E.raiz) { E.raiz = montar(); carregar(); }
    c.appendChild(E.raiz); desenhar();
  }
  P.aoSair(() => { if (E.raiz) E.raiz.remove(); Object.assign(E, { raiz: null, lista: null, erro: '', editando: null, msg: '' }); });
  P.registrarAba({ id: 'usuarios', titulo: 'Usuários', render, semFiltros: true });
})();
