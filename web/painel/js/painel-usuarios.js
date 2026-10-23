/* Painel gerencial do GDV — aba "Usuários" (só quem tem a permissão gerência): matrícula e senha para o app de campo, o painel e o portal.
   O gerente cria o usuário (matrícula opcional: vazia, o sistema gera GDV0001…; nome; permissões) e o sistema mostra a senha provisória
   uma única vez (copiar a mensagem ou enviar pelo WhatsApp). Depois: editar permissões, nova senha provisória (encerra as sessões da
   pessoa), desativar/reativar e ver e encerrar as sessões (aparelhos). A TV da sala é um usuário só com a permissão Painel.
   A planilha guarda só o hash da senha: nada aqui lê uma senha, só a mostra no momento em que o servidor a gera.
   Actions (apps-script/usuarios.gs): usuariosListar, usuarioCriar, usuarioPermissoes, usuarioNovaSenha, usuarioAtivar, sessoesListar e
   sessaoEncerrar. As mensagens de erro do servidor aparecem como vieram. Usa a API do objeto global Painel (js/painel.js).
   Não depende do período nem dos filtros e não aparece no Modo TV. */
(() => {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, esc = P.esc;
  const APP_URL = 'https://evilasionogueiraagro-netizen.github.io/GDV/';
  const RECARREGAR_MS = 60 * 1000;                    // ao voltar à aba, relê a lista se a última leitura tiver mais de 1 min
  const NOME_MAX = 80, RE_MATRICULA = /^[A-Za-z0-9.-]{3,20}$/;
  // permissão (valor gravado no servidor) → rótulo; dois grupos de caixas
  const ROTULOS = { campo: 'App de campo', fiscalizacaoDeTransito: 'Fiscalização de trânsito', termoDeBarreira: 'TF de Barreira', pce: 'PCE',
    digitarDoPapel: 'Digitar do papel', painel: 'Painel (ver)', administracao: 'Portal do Administrativo', gerencia: 'Gerência' };
  const GRUPOS = [['App de campo e módulos', ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'pce', 'digitarDoPapel']],
    ['Painel e portal', ['painel', 'administracao', 'gerencia']]];
  const APLICATIVOS = { campo: 'App de campo', painel: 'Painel', administracao: 'Portal do Administrativo' };
  const rotulo = p => ROTULOS[p] || p;

  /* ---------- estado (sobrevive às atualizações automáticas do painel, que redesenham a aba) ---------- */
  const E = { raiz: null, lista: null, lidoEm: 0, carregando: false, erro: '', editando: null, senha: null, sessoes: null, ocupado: false,
              msg: { form: { t: '', cls: '' }, geral: { t: '', cls: '' } } };

  const q = s => E.raiz && E.raiz.querySelector(s);
  const dataHora = ms => ms > 1e12 ? `${P.fmt.data(P.diaManaus(ms))} ${P.horaManaus(ms)}` : '';
  const primeiroNome = n => String(n || '').trim().split(/\s+/)[0] || '';
  const permissoesDe = u => (u && Array.isArray(u.permissoes) ? u.permissoes : []);

  /** Mensagem de uma linha: "form" (ao lado do botão do formulário) ou "geral" (acima da lista, para as ações de cada linha). */
  function setMsg(onde, t, cls) {
    E.msg[onde] = { t: t || '', cls: cls || '' };
    const m = q(`[data-msg=${onde}]`); if (m) { m.textContent = E.msg[onde].t; m.className = 'pn-pub-msg' + (cls ? ' ' + cls : ''); }
  }
  async function copiar(txt) {
    try { if (navigator.clipboard && window.isSecureContext !== false) { await navigator.clipboard.writeText(txt); return true; } } catch (e) { /* tenta o modo antigo */ }
    const ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    let okc = false; try { okc = document.execCommand('copy'); } catch (e) { okc = false; }
    ta.remove(); return okc;
  }

  /* ---------- mensagem com a senha provisória ---------- */
  /** Texto pronto para mandar à pessoa (WhatsApp, SMS, e-mail): só os endereços das telas que ela pode abrir. */
  function mensagem(g) {
    const p = g.permissoes || [], tudo = p.indexOf('gerencia') >= 0;
    const campo = tudo || p.some(x => ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'pce', 'digitarDoPapel'].indexOf(x) >= 0);
    const links = [campo && `App de campo: ${APP_URL}`, (tudo || p.indexOf('painel') >= 0) && `Painel: ${APP_URL}painel/`,
      (tudo || p.indexOf('administracao') >= 0) && `Portal do Administrativo: ${APP_URL}administrativo/`].filter(Boolean);
    return `Olá, ${primeiroNome(g.nome)}! Seu acesso ao e-GDV (ADAF):\n\n` +
      `Matrícula: *${g.matricula}*\nSenha provisória: *${g.senha}*\n\n` +
      'No primeiro acesso o sistema pede para você criar a sua própria senha (no mínimo 8 caracteres). Não compartilhe a senha.' +
      (links.length ? '\n\n' + links.join('\n') : '');
  }
  const linkWhats = g => 'https://wa.me/?text=' + encodeURIComponent(mensagem(g));

  function desenharResultado() {
    const box = q('#pn-us-res'), g = E.senha; if (!box) return;
    if (!g) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = `
      <div class="pn-ac-para">${g.nova ? 'Nova senha provisória de' : 'Usuário criado:'} <b>${esc(g.nome)}</b> · matrícula <b id="pn-us-res-mat">${esc(g.matricula)}</b></div>
      <div class="pn-ac-codigo" id="pn-us-senha-txt" aria-label="Senha provisória">${esc(g.senha)}</div>
      <div class="pn-ac-validade">Esta senha aparece <b>só agora</b>: envie à pessoa antes de fechar. No primeiro acesso ela é obrigada a criar a própria senha.
        Se perder esta, gere outra em "Nova senha" na lista.</div>
      <div class="pn-ac-acoes">
        <button type="button" class="pn-btn pn-btn-prim" data-us="copiar" id="pn-us-copiar">Copiar mensagem</button>
        <a class="pn-btn pn-ac-whats" id="pn-us-whats" href="${esc(linkWhats(g))}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a>
        <button type="button" class="pn-btn" data-us="fechar" id="pn-us-fechar">Fechar</button>
        <span class="pn-ac-aviso" id="pn-us-aviso" role="status"></span>
      </div>`;
  }
  function avisoSenha(txt, cls) { const a = q('#pn-us-aviso'); if (a) { a.textContent = txt; a.className = 'pn-ac-aviso' + (cls ? ' ' + cls : ''); } }

  /* ---------- formulário (criar usuário ou editar as permissões de um) ---------- */
  const caixas = () => [...E.raiz.querySelectorAll('input[data-perm]')];
  const marcadas = () => caixas().filter(c => c.checked).map(c => c.dataset.perm);
  function marcar(lista) { caixas().forEach(c => { c.checked = lista.indexOf(c.dataset.perm) >= 0; }); }
  /** "Digitar do papel" depende do PCE (como no app): marcar o papel marca o PCE; desmarcar o PCE desmarca o papel. */
  function amarrarPapel(c) {
    const pce = q('#pn-us-perm-pce'), papel = q('#pn-us-perm-digitarDoPapel');
    if (c.dataset.perm === 'digitarDoPapel' && c.checked && pce) pce.checked = true;
    if (c.dataset.perm === 'pce' && !c.checked && papel) papel.checked = false;
  }
  function desenharFormulario() {
    const ed = E.editando;
    q('#pn-us-form-tit').textContent = ed ? `Permissões de ${ed.nome}` : 'Novo usuário';
    q('#pn-us-matricula').disabled = !!ed; q('#pn-us-nome').disabled = !!ed;
    if (ed) { q('#pn-us-matricula').value = ed.matricula || ''; q('#pn-us-nome').value = ed.nome || ''; marcar(permissoesDe(ed)); }
    q('#pn-us-salvar').textContent = ed ? 'Salvar permissões' : 'Criar usuário';
    q('#pn-us-cancelar').hidden = !ed;
    q('#pn-us-dica').textContent = ed ? 'A matrícula e o nome não mudam. Marque exatamente o que a pessoa pode usar: o que sair da lista é retirado.'
      : 'Matrícula em branco: o sistema gera (GDV0001, GDV0002…). A senha provisória aparece uma vez, ao criar.';
  }
  function limparFormulario() {
    E.editando = null; q('#pn-us-matricula').value = ''; q('#pn-us-nome').value = ''; marcar([]); desenharFormulario();
  }
  function validar(permissoes, matricula, nome) {
    if (!E.editando) {
      if (matricula && !RE_MATRICULA.test(matricula)) return 'Matrícula: de 3 a 20 caracteres, só letras, números, ponto e hífen. Deixe em branco para o sistema gerar.';
      if (!nome) return 'Informe o nome completo.';
      if (nome.length > NOME_MAX) return `Nome longo demais (máximo de ${NOME_MAX} caracteres).`;
    }
    if (!permissoes.length) return 'Marque pelo menos uma permissão.';
    if (permissoes.indexOf('digitarDoPapel') >= 0 && permissoes.indexOf('pce') < 0 && permissoes.indexOf('gerencia') < 0) return '"Digitar do papel" exige o PCE.';
    return '';
  }

  /* ---------- chamadas ao servidor ---------- */
  /** Uma ação do gerente: bloqueia cliques repetidos, mostra o erro do servidor tal como veio e devolve a resposta (ou null). */
  async function agir(onde, corpo, durante) {
    if (E.ocupado) return null;
    E.ocupado = true; setMsg(onde, durante || 'Salvando…', '');
    const botoes = E.raiz ? [...E.raiz.querySelectorAll('button[data-us], #pn-us-salvar')] : [];
    botoes.forEach(b => { b.disabled = true; });
    try { return await P.chamar(corpo); }
    catch (e) { if (P.logado) setMsg(onde, e.message, 'erro'); return null; }
    finally { E.ocupado = false; botoes.forEach(b => { if (b.isConnected) b.disabled = false; }); }
  }
  async function carregar() {
    if (E.carregando) return; E.carregando = true;
    try {
      const j = await P.chamar({ action: 'usuariosListar' });
      E.lista = Array.isArray(j.usuarios) ? j.usuarios : []; E.erro = ''; E.lidoEm = Date.now();
    } catch (e) { E.erro = e.message; }
    finally { E.carregando = false; if (P.logado && E.raiz) { desenharLista(); } }
  }
  async function salvarFormulario(ev) {
    ev.preventDefault();
    const ed = E.editando, matricula = q('#pn-us-matricula').value.trim(), nome = q('#pn-us-nome').value.trim().replace(/\s+/g, ' '), permissoes = marcadas();
    const erro = validar(permissoes, matricula, nome);
    if (erro) return setMsg('form', erro, 'erro');
    if (ed) {
      const j = await agir('form', { action: 'usuarioPermissoes', usuarioId: ed.id, permissoes });
      if (!j) return;
      const u = (E.lista || []).find(x => x.id === ed.id); if (u) u.permissoes = j.permissoes || permissoes;
      limparFormulario(); setMsg('form', `Permissões de ${ed.nome} salvas.`, 'ok'); desenharLista(); carregar();
      return;
    }
    const corpo = { action: 'usuarioCriar', nome, permissoes }; if (matricula) corpo.matricula = matricula;
    const j = await agir('form', corpo, 'Criando…');
    if (!j) return;
    const u = j.usuario || {};
    E.senha = { nome: u.nome || nome, matricula: u.matricula || matricula, senha: j.senhaProvisoria, permissoes, nova: false };
    limparFormulario(); setMsg('form', `Usuário ${E.senha.nome} criado (matrícula ${E.senha.matricula}).`, 'ok');
    desenharResultado(); carregar();
    const r = q('#pn-us-res'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  async function novaSenha(u) {
    if (!confirm(`Gerar uma nova senha provisória para ${u.nome} (matrícula ${u.matricula})?\n\nA senha atual deixa de valer e todas as sessões abertas dessa pessoa são encerradas. Na próxima entrada ela precisa criar uma senha nova.`)) return;
    const j = await agir('geral', { action: 'usuarioNovaSenha', usuarioId: u.id }, 'Gerando…');
    if (!j) return;
    E.senha = { nome: u.nome, matricula: u.matricula, senha: j.senhaProvisoria, permissoes: permissoesDe(u), nova: true };
    setMsg('geral', `Nova senha provisória de ${u.nome} gerada.`, 'ok'); desenharResultado(); carregar();
    if (E.sessoes && E.sessoes.usuario.id === u.id) verSessoes(u);
    const r = q('#pn-us-res'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  async function ativar(u, ativo) {
    if (!ativo && !confirm(`Desativar ${u.nome} (matrícula ${u.matricula})?\n\nO acesso acaba agora, em todos os aparelhos. Nada é apagado: dá para reativar depois.`)) return;
    const j = await agir('geral', { action: 'usuarioAtivar', usuarioId: u.id, ativo: ativo ? 1 : 0 });
    if (!j) return;
    setMsg('geral', ativo ? `${u.nome} reativado.` : `${u.nome} desativado: as sessões foram encerradas.`, 'ok');
    if (E.sessoes && E.sessoes.usuario.id === u.id) E.sessoes = null;
    desenharSessoes(); carregar();
  }

  /* ---------- sessões (aparelhos) de um usuário ---------- */
  async function verSessoes(u) {
    const j = await agir('geral', { action: 'sessoesListar', usuarioId: u.id }, 'Lendo as sessões…');
    if (!j) return;
    E.sessoes = { usuario: u, lista: Array.isArray(j.sessoes) ? j.sessoes : [] };
    setMsg('geral', '', ''); desenharSessoes();
    const c = q('#pn-us-sessoes'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  async function encerrarSessao(id) {
    const s = E.sessoes && E.sessoes.lista.find(x => x.id === id); if (!s) return;
    if (!confirm(`Encerrar esta sessão de ${E.sessoes.usuario.nome} (${APLICATIVOS[s.aplicativo] || s.aplicativo}${s.aparelhoId ? ', ' + s.aparelhoId : ''})?\n\nO aparelho volta à tela de entrar e precisa da matrícula e da senha.`)) return;
    const j = await agir('geral', { action: 'sessaoEncerrar', sessaoId: id }, 'Encerrando…');
    if (!j) return;
    setMsg('geral', 'Sessão encerrada.', 'ok');
    verSessoes(E.sessoes.usuario); carregar();
  }
  function desenharSessoes() {
    const box = q('#pn-us-sessoes'); if (!box) return;
    box.innerHTML = '';
    if (!E.sessoes) { box.hidden = true; return; }
    box.hidden = false;
    const { usuario, lista } = E.sessoes;
    const c = P.cartao(box, `Sessões abertas de ${usuario.nome}`, `Matrícula ${usuario.matricula}. Cada linha é um aparelho (app de campo, painel ou portal) que continua conectado até sair ou ser encerrado.`);
    c.id = 'pn-us-sessoes-cartao';
    P.tabela(c, [
      { chave: 'aplicativo', rotulo: 'Aplicativo', fmt: v => APLICATIVOS[v] || v },
      { chave: 'aparelhoId', rotulo: 'Aparelho', fmt: v => v || '—' },
      { chave: 'criadaEm', rotulo: 'Aberta em', num: true, fmt: v => dataHora(v) || '—' },
      { chave: 'ultimoUso', rotulo: 'Último uso', num: true, fmt: v => dataHora(v) || '—' },
      { chave: 'id', rotulo: '', csv: () => '', html: id => `<button type="button" class="pn-btn pn-btn-mini pn-btn-encerrar" data-us="encerrar" data-sessao="${esc(id)}">${icone('parar')} Encerrar</button>` }
    ], lista, { simples: true, id: 'us-sessoes', ordenar: 'ultimoUso', desc: true, busca: false, vazio: 'Nenhuma sessão aberta.' });
    const f = P.el('div', 'pn-conv-acoes', '<button type="button" class="pn-btn" data-us="fechar-sessoes">Fechar</button>'); c.appendChild(f);
  }

  /* ---------- lista ---------- */
  function situacaoHTML(u) {
    return (u.ativo ? '<span class="pn-selo bom">Ativo</span>' : '<span class="pn-selo serio">Desativado</span>')
      + (u.senhaProvisoria ? ' <span class="pn-selo atencao" title="A pessoa ainda não criou a própria senha">Senha provisória</span>' : '');
  }
  function acoesHTML(u) {
    const id = esc(u.id);
    return `<span class="pn-conv-acoes-lin"><button type="button" class="pn-btn pn-btn-mini" data-us="permissoes" data-id="${id}">Permissões</button>`
      + `<button type="button" class="pn-btn pn-btn-mini" data-us="senha" data-id="${id}">Nova senha</button>`
      + (u.ativo ? `<button type="button" class="pn-btn pn-btn-mini pn-btn-encerrar" data-us="desativar" data-id="${id}">Desativar</button>`
        : `<button type="button" class="pn-btn pn-btn-mini" data-us="reativar" data-id="${id}">Reativar</button>`) + '</span>';
  }
  function desenharLista() {
    const box = q('#pn-us-lista'); if (!box) return;
    box.innerHTML = '';
    if (E.erro && !E.lista) { box.innerHTML = `<div class="pn-cartao pn-falha" role="alert"><b>Não foi possível carregar os usuários.</b><p class="pn-sub">${esc(E.erro)}</p></div>`; return; }
    if (!E.lista) { P.vazio(box, 'Carregando os usuários…'); return; }
    P.tabela(box, [
      { chave: 'matricula', rotulo: 'Matrícula', html: v => `<b>${esc(v)}</b>` },
      { chave: 'nome', rotulo: 'Nome' },
      { chave: 'permissoes', rotulo: 'Permissões', ordem: u => permissoesDe(u).length, csv: v => (v || []).map(rotulo).join(', '),
        html: v => (v || []).length ? (v || []).map(p => `<span class="pn-ac-perfil">${esc(rotulo(p))}</span>`).join(' ') : '<span class="pn-sub">nenhuma</span>' },
      { chave: 'ativo', rotulo: 'Situação', ordem: u => (u.ativo ? 1 : 0), html: (v, u) => situacaoHTML(u) },
      { chave: 'ultimoAcesso', rotulo: 'Último acesso', num: true, fmt: v => dataHora(v) || 'nunca' },
      { chave: 'sessoesAbertas', rotulo: 'Sessões abertas', num: true,
        html: (v, u) => v ? `<button type="button" class="pn-link" data-us="sessoes" data-id="${esc(u.id)}">${P.fmt.int(v)} (ver)</button>` : '0' },
      { chave: 'id', rotulo: '', csv: () => '', html: (v, u) => acoesHTML(u) }
    ], E.lista, { id: 'usuarios', titulo: `Usuários (${E.lista.length})`, ordenar: 'nome', desc: false, limite: 50,
      subtitulo: `${E.lidoEm ? 'Lista lida às ' + P.horaManaus(E.lidoEm) : ''}${E.erro ? ' · falha ao atualizar: ' + E.erro : ''}`,
      vazio: 'Nenhum usuário ainda. Crie o primeiro acima.' });
  }

  /* ---------- montagem (uma vez; depois só é reanexada) ---------- */
  function montar() {
    const r = P.el('section', 'pn-secao pn-us'); r.id = 'pn-us';
    r.innerHTML = `
      <h2>${icone('pessoa')} Usuários (matrícula e senha)</h2>
      <p class="pn-sub">Uma conta por pessoa, com matrícula e senha, para o app de campo, o painel e o portal. Você escolhe o que cada uma pode usar; a senha provisória
        é entregue por você e trocada pela própria pessoa no primeiro acesso. A TV da sala usa um usuário só com "Painel (ver)".</p>
      <div class="pn-ac-grade">
        <form class="pn-cartao pn-conv-form" id="pn-us-form" autocomplete="off" novalidate>
          <h3 id="pn-us-form-tit" class="pn-conv-largo">Novo usuário</h3>
          <label class="pn-conv-campo pn-conv-largo">Matrícula (opcional)<input id="pn-us-matricula" maxlength="20" placeholder="Em branco: o sistema gera" autocapitalize="none" spellcheck="false"></label>
          <label class="pn-conv-campo pn-conv-largo">Nome completo<input id="pn-us-nome" maxlength="${NOME_MAX}" placeholder="Ex.: Maria Souza da Silva" autocapitalize="words" spellcheck="false"></label>
          ${GRUPOS.map(([titulo, lista]) => `<fieldset class="pn-ac-mods pn-conv-largo"><legend>${esc(titulo)}</legend><div class="pn-ac-perm">${lista.map(p =>
            `<label><input type="checkbox" id="pn-us-perm-${p}" data-perm="${p}"> ${esc(rotulo(p))}</label>`).join('')}</div></fieldset>`).join('')}
          <p class="pn-sub pn-conv-largo" id="pn-us-dica"></p>
          <div class="pn-conv-acoes pn-conv-largo">
            <button type="submit" class="pn-btn pn-btn-prim" id="pn-us-salvar">Criar usuário</button>
            <button type="button" class="pn-btn" id="pn-us-cancelar" data-us="cancelar" hidden>Cancelar</button>
            <span class="pn-pub-msg" data-msg="form" role="status"></span>
          </div>
        </form>
        <div class="pn-cartao pn-ac-res" id="pn-us-res" hidden aria-live="polite"></div>
      </div>
      <p class="pn-pub-msg" data-msg="geral" role="status"></p>
      <div id="pn-us-lista"></div>
      <div id="pn-us-sessoes" hidden></div>`;
    r.addEventListener('change', e => { const c = e.target.closest('input[data-perm]'); if (c) amarrarPapel(c); });
    r.querySelector('#pn-us-form').addEventListener('submit', salvarFormulario);
    r.addEventListener('click', async e => {
      const b = e.target.closest('[data-us]'); if (!b || b.disabled) return;
      const tipo = b.dataset.us, u = (E.lista || []).find(x => x.id === b.dataset.id);
      if (tipo === 'cancelar') { limparFormulario(); setMsg('form', '', ''); }
      else if (tipo === 'fechar') { E.senha = null; desenharResultado(); }
      else if (tipo === 'fechar-sessoes') { E.sessoes = null; desenharSessoes(); }
      else if (tipo === 'copiar' && E.senha) {
        const okc = await copiar(mensagem(E.senha));
        avisoSenha(okc ? 'Mensagem copiada. Cole no WhatsApp, SMS ou e-mail.' : 'Não foi possível copiar. Selecione a senha e copie à mão.', okc ? 'ok' : 'erro');
        if (okc) b.textContent = 'Copiada';
      }
      else if (tipo === 'permissoes' && u) {
        E.editando = u; setMsg('form', '', ''); desenharFormulario();
        const f = q('#pn-us-form'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      else if (tipo === 'senha' && u) novaSenha(u);
      else if ((tipo === 'desativar' || tipo === 'reativar') && u) ativar(u, tipo === 'reativar');
      else if (tipo === 'sessoes' && u) verSessoes(u);
      else if (tipo === 'encerrar') encerrarSessao(b.dataset.sessao);
    });
    // a aba é redesenhada a cada atualização do painel (a raiz sai e volta à página): o campo em foco volta a ser o foco (ver Painel.renderAba)
    return r;
  }

  /** Aba Usuários: a raiz é montada uma vez e só reanexada nas atualizações automáticas (o que está sendo digitado não se perde). */
  function render(c) {
    if (!E.raiz) { E.raiz = montar(); desenharFormulario(); desenharResultado(); desenharSessoes(); desenharLista(); }
    c.appendChild(E.raiz);
    if (!E.carregando && (!E.lista || Date.now() - E.lidoEm > RECARREGAR_MS)) carregar();
  }
  // outro usuário pode entrar neste aparelho: nada da sessão anterior (nem uma senha provisória à mostra) fica na tela
  P.aoSair(() => { if (E.raiz) E.raiz.remove();
    Object.assign(E, { raiz: null, lista: null, lidoEm: 0, erro: '', editando: null, senha: null, sessoes: null, ocupado: false, msg: { form: { t: '', cls: '' }, geral: { t: '', cls: '' } } }); });
  P.registrarAba({ id: 'usuarios', titulo: 'Usuários', render, semFiltros: true, visivel: () => P.pode('gerencia') });
  window.PainelUsuarios = { mensagem, linkWhats };
})();
