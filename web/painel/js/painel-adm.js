/* Painel gerencial do GDV — aba "Servidores", bloco "Portal do Administrativo" (acesso antigo): lista de pessoas liberadas no portal de
   lançamentos (e-mail, nome, ativo/revogado, último acesso; máximo configurável, padrão 10), código de ativação de 6 dígitos (o login
   antigo do portal, até o gerente desligar os acessos antigos) e revogar/reativar. Quem entra com matrícula e senha é gerido no bloco Usuários
   (permissão "Portal do Administrativo"). Actions painelAdmLista / painelAdmSalvar / painelAdmCodigo / painelAdmOcultar
   (só administrador). Os e-mails aparecem só aqui (e na aba Administrativo da planilha). Revogar derruba a sessão do portal na próxima
   chamada. Revogado pode sair da lista ("Remover": nada é apagado, oculto = 1 na planilha); "Mostrar removidos" lista esses com
   Restaurar; Reativar também traz de volta. "Remover" só aparece se o back avisar que tem a action (painelAdmLista → ocultar). */
(() => {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, esc = P.esc;
  const E = { raiz: null, d: null, erro: '', msg: { t: '', cls: '' }, codigo: null, carregando: false, removidos: false };
  const ANTIGO = ' — o servidor ainda está com o Code.gs antigo.';
  const antigo = m => /a[çc][ãa]o inv[áa]lida/i.test(m || '');
  const dh = ms => ms > 1e12 ? `${P.fmt.data(P.diaManaus(ms))} ${P.horaManaus(ms)}` : '—';
  async function carregar() {
    if (E.carregando) return; E.carregando = true; E.erro = '';
    try { E.d = await P.chamar(E.removidos ? { action: 'painelAdmLista', ocultos: true } : { action: 'painelAdmLista' }); } catch (e) { E.erro = e.message; }
    finally { E.carregando = false; }
    desenhar();
  }
  function setMsg(t, cls) { E.msg = { t, cls }; const m = E.raiz && E.raiz.querySelector('[data-msg=adm]'); if (m) { m.textContent = t; m.className = 'pn-pub-msg' + (cls ? ' ' + cls : ''); } }
  function desenhar() {
    const r = E.raiz; if (!r) return;
    const d = E.d, ativos = d ? d.liberados.filter(x => x.ativo).length : 0;
    r.innerHTML = `<h2>Portal do Administrativo</h2>
      <p class="pn-sub">Quem lança os dados administrativos (desembolso e físico do convênio, linhas manuais dos relatórios, VIGIFITO) no portal <a href="../administrativo/" target="_blank" rel="noopener">${esc(d ? d.url : '../administrativo/')}</a>. Acesso antigo: entrada com um código de 6 dígitos gerado aqui (quem tem matrícula e senha entra por ela; veja Usuários). Até ${d ? d.max : 10} pessoas ativas.</p>
      ${E.erro ? `<p class="pn-erro">${esc(E.erro)}${antigo(E.erro) ? ANTIGO : ''}</p>` : ''}
      <form class="pn-cartao pn-conv-form" id="pn-adm-form" novalidate>
        <label class="pn-conv-campo">E-mail<input id="pn-adm-email" type="email" maxlength="120" placeholder="nome@gmail.com" autocomplete="off"></label>
        <label class="pn-conv-campo">Nome completo<input id="pn-adm-nome" maxlength="80" placeholder="Ex.: Ana Souza"></label>
        <div class="pn-conv-acoes"><button type="submit" class="pn-btn pn-btn-prim" id="pn-adm-liberar">Liberar</button><span class="pn-pub-msg${E.msg.cls ? ' ' + E.msg.cls : ''}" data-msg="adm" role="status">${esc(E.msg.t)}</span></div>
      </form>
      ${E.codigo ? `<div class="pn-cartao pn-adm-codigo" id="pn-adm-codigo"><p>Código de ativação do portal para <b>${esc(E.codigo.nome)}</b>: <b class="pn-ac-codigo">${esc(E.codigo.codigo.replace(/^(\d{3})(\d{3})$/, '$1 $2'))}</b> — permanente: vale em todo login até você gerar outro código para a pessoa ou revogar o acesso. Envie junto com o endereço do portal: ${esc(E.codigo.url)}</p></div>` : ''}
      ${d && d.ocultar ? `<div class="pn-ac-filtros"><label class="pn-ac-check"><input type="checkbox" id="pn-adm-removidos"${E.removidos ? ' checked' : ''}> Mostrar removidos</label></div>` : ''}
      <div id="pn-adm-lista"></div>`;
    const box = r.querySelector('#pn-adm-lista');
    if (!d) { P.vazio(box, E.carregando ? 'Carregando…' : 'Sem dados.'); return; }
    P.tabela(box, [{ chave: 'nome', rotulo: 'Nome' }, { chave: 'email', rotulo: 'E-mail' },
      { chave: 'ativo', rotulo: 'Situação', html: (x, l) => x ? `<span class="pn-selo bom">Ativo</span>${l.codigo ? ' <span class="pn-selo info">com código</span>' : ''}`
        : `<span class="pn-selo info">Revogado</span>${l.oculto ? ` <span class="pn-ac-perfil pn-ac-removido" title="Removido por ${esc(l.ocultoPor || '—')} em ${esc(dh(l.ocultoEm))}">removido da lista</span>` : ''}` },
      { chave: 'ultimoAcesso', rotulo: 'Último acesso', fmt: dh }, { chave: 'criadoPor', rotulo: 'Liberado por', fmt: (x, l) => `${x || '—'} em ${dh(l.criadoEm)}` },
      { chave: 'id', rotulo: 'Ações', csv: () => '', html: (x, l) => `<span class="pn-conv-acoes-lin">${l.ativo ? `<button type="button" class="pn-btn pn-btn-mini" data-adm="codigo" data-id="${esc(x)}">Gerar código</button><button type="button" class="pn-btn pn-btn-mini pn-btn-encerrar" data-adm="revogar" data-id="${esc(x)}">Revogar</button>`
        : `<button type="button" class="pn-btn pn-btn-mini" data-adm="reativar" data-id="${esc(x)}">Reativar</button>${!d.ocultar ? '' : l.oculto
          ? `<button type="button" class="pn-btn pn-btn-mini pn-ac-restaurar" data-adm="restaurar" data-id="${esc(x)}">Restaurar</button>`
          : `<button type="button" class="pn-btn pn-btn-mini pn-ac-remover" data-adm="remover" data-id="${esc(x)}" title="Tira ${esc(l.nome)} da lista (a planilha guarda o registro)">Remover</button>`}`}</span>` }],
      d.liberados, { id: 'adm-liberados', titulo: `Liberados (${ativos} ativo(s) de no máximo ${d.max})`, csv: 'portal-administrativo-liberados.csv', limite: 20, busca: false, vazio: 'Ninguém liberado ainda.' });
  }
  /** "Remover" (restaurar = false) ou "Restaurar" um liberado revogado: só marca oculto na planilha (painelAdmOcultar). */
  async function ocultar(l, restaurar) {
    if (!restaurar && !confirm(`Remover ${l.nome} da lista do Portal do Administrativo?\n\nO registro continua guardado na planilha (veja em "Mostrar removidos"). O acesso continua revogado.`)) return;
    setMsg(restaurar ? 'Restaurando…' : 'Removendo…', '');
    try {
      await P.chamar({ action: 'painelAdmOcultar', id: l.id, restaurar: !!restaurar });
      E.msg = { t: restaurar ? `${l.nome} voltou para a lista.` : `${l.nome} saiu da lista (o registro continua na planilha).`, cls: 'ok' }; await carregar();
    } catch (e) { if (P.logado) setMsg((restaurar ? 'Não restaurou: ' : 'Não removeu: ') + e.message + (antigo(e.message) ? ANTIGO : ''), 'erro'); }
  }
  async function salvar(o, okMsg) {
    setMsg('Salvando…', '');
    try { await P.chamar(Object.assign({ action: 'painelAdmSalvar' }, o)); E.msg = { t: okMsg, cls: 'ok' }; await carregar(); }
    catch (e) { if (P.logado) setMsg('Não salvou: ' + e.message, 'erro'); }
  }
  function montar() {
    const r = P.el('section', 'pn-secao pn-adm'); r.id = 'pn-adm';
    r.addEventListener('submit', e => {
      e.preventDefault();
      const email = r.querySelector('#pn-adm-email').value.trim(), nome = r.querySelector('#pn-adm-nome').value.trim();
      if (!email || !nome) return setMsg('Informe o e-mail e o nome completo.', 'erro');
      salvar({ email, nome, ativo: 1 }, `Liberado ✓ ${email}`);
    });
    r.addEventListener('change', e => { if (e.target.id === 'pn-adm-removidos') { E.removidos = e.target.checked; E.msg = { t: '', cls: '' }; carregar(); } });
    r.addEventListener('click', async e => {
      const b = e.target.closest('[data-adm]'); if (!b) return;
      const l = E.d.liberados.find(x => x.id === b.dataset.id); if (!l) return;
      if (b.dataset.adm === 'revogar') { if (!confirm(`Revogar o acesso de ${l.nome} ao Portal do Administrativo? A sessão aberta cai na próxima ação.`)) return; salvar({ id: l.id, email: l.email, nome: l.nome, ativo: 0 }, `Revogado ✓ ${l.nome}`); }
      else if (b.dataset.adm === 'reativar') salvar({ id: l.id, email: l.email, nome: l.nome, ativo: 1 }, `Reativado ✓ ${l.nome}`);
      else if (b.dataset.adm === 'remover' || b.dataset.adm === 'restaurar') ocultar(l, b.dataset.adm === 'restaurar');
      else if (b.dataset.adm === 'codigo') {
        try { E.codigo = await P.chamar({ action: 'painelAdmCodigo', id: l.id }); E.msg = { t: 'Código gerado ✓', cls: 'ok' }; await carregar(); }
        catch (err) { if (P.logado) setMsg('Não gerou: ' + err.message, 'erro'); }
      }
    });
    return r;
  }
  /** Chamado pela aba Servidores (painel-acessos.js) depois de desenhar a própria lista. */
  window.PainelAdm = {
    anexar(c) { if (!E.raiz) E.raiz = montar(); c.appendChild(E.raiz); if (!E.d && !E.carregando) { desenhar(); carregar(); } else desenhar(); },
    estado: () => ({ d: E.d, codigo: E.codigo })
  };
  P.aoSair(() => { if (E.raiz) E.raiz.remove(); Object.assign(E, { raiz: null, d: null, erro: '', msg: { t: '', cls: '' }, codigo: null, removidos: false }); });
})();
