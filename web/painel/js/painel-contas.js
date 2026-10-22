/* Painel gerencial do GDV — bloco "Contas de acesso" da aba Servidores (controle de acesso do gerente): uma conta por pessoa e um código
   de acesso para o app, o painel e o portal. O gerente cria a conta (nome, perfis e módulos do fiscal) e o sistema mostra o código de
   6 dígitos uma vez só. O código não expira: vale até o gerente gerar outro, tirar o aparelho ou desativar a pessoa. O perfil decide o que
   a pessoa abre (fiscal: app de campo; administrativo: portal; gerente: painel; dev: tudo). Na ficha de cada pessoa ficam os aparelhos
   conectados, com "Tirar" para celular perdido ou trocado. A planilha guarda só o hash do código (aba Administrativo, que passou a ser a
   aba de contas de todas as pessoas). Os códigos antigos (blocos abaixo) continuam valendo até cada pessoa receber o código da conta.
   Usa as actions painelUsuarios, painelUsuarioSalvar, painelUsuarioCodigo, painelSessaoRevogar e painelUsuariosImportar (Code.gs).
   Back antigo sem essas actions: o bloco mostra o aviso e o resto da aba continua funcionando. */
(() => {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, esc = P.esc;
  const PERFIS = [['fiscal', 'Fiscal (app de campo)'], ['administrativo', 'Administrativo (portal)'], ['gerente', 'Gerente (painel e acessos)'], ['dev', 'Desenvolvedor (tudo)']];
  const MODULOS = [['veiculos', 'Fiscalização'], ['tf', 'TF'], ['pce', 'PCE'], ['antigo', 'Digitar do papel']];
  const APP = { app: 'App de campo', painel: 'Painel', portal: 'Portal' };
  const E = { raiz: null, lista: null, erro: '', editando: null, msg: '', codigo: null };

  async function carregar() {
    try { E.lista = (await P.chamar({ action: 'painelUsuarios' })).usuarios || []; E.erro = ''; }
    catch (e) { E.erro = /Ação inválida/.test(e.message) ? 'Contas de acesso ainda não disponíveis no servidor (atualização em andamento). Tente de novo em alguns minutos.' : e.message; }
    desenhar();
  }
  const data = ms => ms ? `${P.fmt.data(P.diaManaus(ms))} ${P.horaManaus(ms)}` : 'nunca';
  const marcado = (lista, k) => lista && lista.indexOf(k) >= 0 ? 'checked' : '';
  const codTxt = c => String(c).slice(0, 3) + ' ' + String(c).slice(3);

  function codigoHTML() {
    if (!E.codigo) return '';
    return `<div class="pn-cartao pn-us-codigo" id="pn-us-codigo" role="status"><p class="pn-sub">Código de acesso de <b>${esc(E.codigo.nome)}</b></p>
      <p class="pn-ac-codigo" id="pn-us-codigo-num">${esc(codTxt(E.codigo.codigo))}</p>
      <p class="pn-sub">Envie agora para a pessoa: o código não aparece de novo. Ele não expira e vale no app, no painel e no portal, conforme os perfis.
        Para trocar, use "Gerar outro código" na lista.</p>
      <div class="pn-us-botoes"><button type="button" class="pn-btn pn-btn-prim" data-us="copiar">Copiar mensagem</button>
        <button type="button" class="pn-btn" data-us="fechar-codigo">Já enviei</button></div></div>`;
  }
  function formHTML(u) {
    u = u || { nome: '', perfis: ['fiscal'], modulos: { veiculos: 1, tf: 1, pce: 1, antigo: 0 }, ativo: 1 };
    const mods = Object.keys(u.modulos || {}).filter(k => u.modulos[k]);
    return `<form class="pn-cartao pn-us-form" id="pn-us-form" autocomplete="off">
      <h3>${u.id ? 'Editar conta' : 'Nova conta (gera o código de acesso)'}</h3>
      <div class="pn-us-campos"><label>Nome completo<input id="pn-us-nome" value="${esc(u.nome)}" maxlength="80" required></label></div>
      <fieldset><legend>Perfis (o que a pessoa pode abrir)</legend>${PERFIS.map(([k, r]) => `<label class="pn-us-caixa"><input type="checkbox" name="pn-us-perfil" value="${k}" ${marcado(u.perfis, k)}> ${esc(r)}</label>`).join('')}</fieldset>
      <fieldset id="pn-us-mods"><legend>Módulos do app (fiscal)</legend>${MODULOS.map(([k, r]) => `<label class="pn-us-caixa"><input type="checkbox" name="pn-us-mod" value="${k}" ${marcado(mods, k)}> ${esc(r)}</label>`).join('')}</fieldset>
      <p class="pn-sub">Uma pessoa, uma conta. Ao criar, o sistema gera o código de acesso de 6 dígitos. Desativar encerra o acesso em todos os aparelhos.</p>
      <div class="pn-us-botoes"><button type="submit" class="pn-btn pn-btn-prim" id="pn-us-salvar">${u.id ? 'Salvar alterações' : 'Criar conta e gerar código'}</button>
        ${u.id ? '<button type="button" class="pn-btn" data-us="cancelar">Cancelar</button>' : ''}
        <span class="pn-pub-msg" id="pn-us-msg" role="status">${esc(E.msg)}</span></div>
    </form>`;
  }
  const aparelhosHTML = (v, u) => !(v || []).length ? '<span class="pn-sub">nenhum</span>' : v.map(a => `<div class="pn-us-ap">${esc(APP[a.escopo] || a.escopo)}${a.aparelho ? ` <span class="pn-sub">(${esc(a.aparelho)})</span>` : ''}
      <span class="pn-sub">· ${esc(data(a.ultimoUso))}</span> <button type="button" class="pn-link" data-us="tirar" data-sessao="${esc(a.id)}" data-id="${esc(u.id)}">Tirar</button></div>`).join('');

  function desenhar() {
    const r = E.raiz; if (!r) return;
    r.innerHTML = '<h2>Contas de acesso</h2><p class="pn-sub">Um código de 6 dígitos por pessoa para o app, o painel e o portal. Não expira: o gerente tira um aparelho, gera outro código ou desativa a pessoa.</p>'
      + codigoHTML() + formHTML(E.editando) + (E.erro ? `<p class="pn-erro" role="alert">${esc(E.erro)}</p>` : '') + '<div id="pn-us-lista"></div>';
    mostrarModulos();
    const l = r.querySelector('#pn-us-lista');
    if (!E.lista) { P.vazio(l, E.erro ? 'Não foi possível ler as contas.' : 'Carregando as contas…'); return; }
    const s = P.secao(l, 'Contas', 'Uma linha por pessoa. Os códigos antigos (blocos abaixo) continuam valendo até cada pessoa receber o código da conta.');
    const imp = P.el('div', 'pn-us-botoes'); imp.innerHTML = `<button type="button" class="pn-btn" data-us="importar" id="pn-us-importar">Trazer os acessos antigos</button>
      <span class="pn-sub">Cria uma conta por pessoa a partir dos fiscais e do Administrativo já liberados (sem código; gere o de cada um). Nomes parecidos que não dá para juntar com segurança ficam para você decidir.</span>`;
    s.appendChild(imp);
    P.tabela(s, [
      { chave: 'nome', rotulo: 'Nome' },
      { chave: 'perfis', rotulo: 'Perfis', fmt: v => (v || []).join(', ') },
      { chave: 'modulos', rotulo: 'Módulos', fmt: (v, u) => (u.perfis || []).indexOf('fiscal') < 0 ? '—' : MODULOS.filter(([k]) => v && v[k]).map(([, r2]) => r2).join(', ') || '—' },
      { chave: 'ativo', rotulo: 'Situação', html: v => `<span class="pn-selo ${v ? 'bom' : 'serio'}">${v ? 'Ativo' : 'Desativado'}</span>` },
      { chave: 'aparelhos', rotulo: 'Aparelhos', html: aparelhosHTML },
      { chave: 'ultimoAcesso', rotulo: 'Último acesso', fmt: data },
      { chave: 'id', rotulo: 'Ações', html: (id, u) => `<button type="button" class="pn-link" data-us="editar" data-id="${esc(id)}">Editar</button>
        ${u.ativo ? `<button type="button" class="pn-link" data-us="codigo" data-id="${esc(id)}">${u.temCodigo ? 'Gerar outro código' : 'Gerar código'}</button>` : ''}
        <button type="button" class="pn-link" data-us="${u.ativo ? 'revogar' : 'reativar'}" data-id="${esc(id)}">${u.ativo ? 'Desativar' : 'Reativar'}</button>` }
    ], E.lista.slice().sort((a, b) => b.ativo - a.ativo || a.nome.localeCompare(b.nome, 'pt-BR')), { id: 'usuarios', limite: 50, vazio: 'Nenhuma conta ainda. Crie a primeira acima.' });
  }
  function mostrarModulos() {
    const r = E.raiz, f = r && r.querySelector('#pn-us-mods'); if (!f) return;
    f.hidden = !r.querySelector('input[name=pn-us-perfil][value=fiscal]').checked;
  }
  const marcados = nome => [...E.raiz.querySelectorAll(`input[name=${nome}]:checked`)].map(i => i.value);
  const erroMsg = e => { const m = E.raiz.querySelector('#pn-us-msg'); if (m) { m.textContent = e.message; m.className = 'pn-pub-msg erro'; } };

  async function salvar(corpo, msgOk) {
    const b = E.raiz.querySelector('#pn-us-salvar'); if (b) b.disabled = true;
    try {
      const j = await P.chamar(Object.assign({ action: 'painelUsuarioSalvar' }, corpo));
      E.msg = msgOk || (j.novo ? `Conta de ${j.usuario.nome} criada.` : 'Salvo.'); E.editando = null;
      if (j.codigo) E.codigo = { nome: j.usuario.nome, codigo: j.codigo };
      await carregar();
    } catch (e) { erroMsg(e); if (b) b.disabled = false; }
  }
  async function acao(corpo, msgOk) {
    try {
      const j = await P.chamar(corpo);
      if (j.codigo) E.codigo = { nome: j.nome, codigo: j.codigo };
      if (j.criados) {
        msgOk = `${j.criados.length} conta(s) criada(s) e ${(j.atualizados || []).length} atualizada(s) a partir dos acessos antigos. Gere o código de cada pessoa.`;
        if ((j.ambiguos || []).length) msgOk += ` Para decidir (nomes parecidos, não juntados): ${j.ambiguos.map(a => Array.isArray(a) ? a.join(' / ') : (a.nomes || []).join(' / ')).join('; ')}.`;
      }
      E.msg = msgOk; await carregar();
    } catch (e) { erroMsg(e); }
  }
  function montar() {
    const r = P.el('section', 'pn-secao pn-us'); r.id = 'pn-us';
    r.addEventListener('change', e => { if (e.target.name === 'pn-us-perfil') mostrarModulos(); });
    r.addEventListener('submit', e => {
      e.preventDefault();
      const m = {}; MODULOS.forEach(([k]) => { m[k] = 0; }); marcados('pn-us-mod').forEach(k => { m[k] = 1; });
      const u = E.editando || {};
      salvar({ id: u.id || '', nome: r.querySelector('#pn-us-nome').value, perfis: marcados('pn-us-perfil'), modulos: m });
    });
    r.addEventListener('click', e => {
      const b = e.target.closest('[data-us]'); if (!b) return;
      const u = (E.lista || []).find(x => x.id === b.dataset.id), tipo = b.dataset.us;
      if (tipo === 'cancelar') { E.editando = null; E.msg = ''; desenhar(); }
      else if (tipo === 'fechar-codigo') { E.codigo = null; desenhar(); }
      else if (tipo === 'copiar' && E.codigo) {
        const txt = `e-GDV: seu código de acesso é ${codTxt(E.codigo.codigo)}. Ele vale no app, no painel e no portal, conforme o seu acesso. Não compartilhe.`;
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { b.textContent = 'Mensagem copiada'; }, () => { b.textContent = 'Copie o código à mão'; });
      }
      else if (tipo === 'editar' && u) { E.editando = u; E.msg = ''; desenhar(); r.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      else if (tipo === 'importar') acao({ action: 'painelUsuariosImportar' }, '');
      else if (tipo === 'codigo' && u && !u.temCodigo) acao({ action: 'painelUsuarioCodigo', id: u.id }, `Código de ${u.nome} gerado.`);
      else if (tipo === 'codigo' && u) {
        if (!confirm(`Gerar outro código para ${u.nome}? O código atual para de valer agora (os aparelhos já conectados continuam).`)) return;
        acao({ action: 'painelUsuarioCodigo', id: u.id }, `Novo código de ${u.nome} gerado.`);
      }
      else if (tipo === 'tirar' && u) {
        if (!confirm(`Tirar este aparelho da conta de ${u.nome}? Ele precisa do código para entrar de novo.`)) return;
        acao({ action: 'painelSessaoRevogar', id: b.dataset.sessao }, 'Aparelho retirado.');
      }
      else if ((tipo === 'revogar' || tipo === 'reativar') && u) {
        const ativo = tipo === 'reativar' ? 1 : 0;
        if (!ativo && !confirm(`Desativar ${u.nome}? O acesso acaba agora em todos os aparelhos.`)) return;
        salvar({ id: u.id, nome: u.nome, perfis: u.perfis, modulos: u.modulos, ativo }, ativo ? `${u.nome} reativado.` : `Acesso de ${u.nome} desativado.`);
      }
    });
    return r;
  }
  /** Chamado pela aba Servidores (js/painel-acessos.js): o bloco entra no topo da aba. */
  function anexar(c) {
    if (!E.raiz) { E.raiz = montar(); desenhar(); carregar(); }
    c.insertBefore(E.raiz, c.firstChild);                     // reanexado sem redesenhar: o que está sendo digitado não se perde
  }
  P.aoSair(() => { if (E.raiz) E.raiz.remove(); Object.assign(E, { raiz: null, lista: null, erro: '', editando: null, msg: '', codigo: null }); });
  window.PainelContas = { anexar };
})();
