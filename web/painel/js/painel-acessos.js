/* Painel gerencial do GDV — aba "Servidores": gerar chave de ativação do app de campo para um fiscal/servidor, reenviar o código
   (copiar / WhatsApp), acompanhar ou revogar os acessos e escolher os módulos em que cada servidor pode inserir dados
   (Educação Sanitária/Fiscalização de Trânsito, TF de Barreira, PCE; por nome, valem para todos os aparelhos dele).
   Usa as actions painelGerarCodigo, painelAcessos, painelRevogar e painelPermissoes (Code.gs).
   Não depende do período nem dos filtros e não aparece no Modo TV. Usa a API do objeto global Painel (js/painel.js). */
(() => {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, fmt = P.fmt, esc = P.esc, norm = P.norm;
  const APP_URL = 'https://evilasionogueiraagro-netizen.github.io/GDV/';
  const RECARREGAR_MS = 60 * 1000;                    // ao voltar à aba, relê a lista se a última leitura tiver mais de 1 min
  const NOME_MAX = 80;
  const MODULOS = [['veiculos', 'Fiscalização', 'Educação Sanitária/Fiscalização de Trânsito', 'Fisc.'], ['tf', 'TF', 'TF de Barreira', 'TF'], ['pce', 'PCE', 'PCE – Programa de Controle e Erradicação', 'PCE']];
  const TUDO = { veiculos: 1, tf: 1, pce: 1 };
  const permDe = a => Object.assign({}, TUDO, (a && a.permissoes) || {});
  const MSG_MIN = 'Marque pelo menos um módulo. Para tirar todo o acesso do servidor, use Revogar.';
  const SITUACOES = {
    aguardando: { rot: 'Aguardando ativação', cls: 'atencao', ordem: 0 },
    ativo: { rot: 'Ativo', cls: 'bom', ordem: 1 },
    vencido: { rot: 'Código vencido', cls: 'serio', ordem: 2 },
    revogado: { rot: 'Revogado', cls: 'info', ordem: 3 }
  };

  /* ---------- estado (sobrevive às atualizações automáticas do painel, que redesenham a aba) ---------- */
  const E = { raiz: null, lista: null, lidoEm: 0, carregando: false, erro: '', ultimo: null, aviso: '', busca: '', situacao: '', admins: false };

  const codigoFmt = c => String(c || '').replace(/\D/g, '').padStart(6, '0').replace(/^(\d{3})(\d{3})$/, '$1 $2');
  const dataHora = ms => ms > 1e12 ? `${fmt.data(P.diaManaus(ms))} às ${P.horaManaus(ms)}` : '—';
  const dataCurta = ms => ms > 1e12 ? `${fmt.data(P.diaManaus(ms))} ${P.horaManaus(ms)}` : '—';
  const primeiroNome = n => String(n || '').trim().split(/\s+/)[0] || '';

  /** Texto pronto para mandar ao fiscal (WhatsApp, e-mail, SMS). */
  function mensagem(g) {
    return `Olá, ${primeiroNome(g.nome)}! Sua chave de ativação do app GDV (ADAF):\n\n` +
      `*${codigoFmt(g.codigo)}*\n\n` +
      `Uso único, válida até ${dataHora(g.expiraEm)} (horário de Manaus). Vinculada a: ${g.nome}.\n\n` +
      `1. No celular, abra o link: ${APP_URL}\n` +
      '2. Instale o app: no Android, toque em "Instalar app" (ou menu ⋮ → "Adicionar à tela inicial"); no iPhone, pelo Safari, toque em Compartilhar → "Adicionar à Tela de Início".\n' +
      '3. Abra o app pelo ícone instalado e digite o código acima (precisa de internet só nesse momento).';
  }
  const linkWhats = g => 'https://wa.me/?text=' + encodeURIComponent(mensagem(g));

  async function copiar(txt) {
    try { if (navigator.clipboard && window.isSecureContext !== false) { await navigator.clipboard.writeText(txt); return true; } } catch (e) { /* tenta o modo antigo */ }
    const ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    let okc = false; try { okc = document.execCommand('copy'); } catch (e) { okc = false; }
    ta.remove(); return okc;
  }

  /* ---------- montagem (uma vez; depois só é reanexada) ---------- */
  function montar() {
    const r = P.el('div', 'pn-ac');
    r.innerHTML = `
      <section class="pn-secao">
        <h2>Gerar chave de ativação</h2>
        <p class="pn-sub">Código do app de campo para um fiscal/servidor: 6 dígitos, uso único, vale 7 dias. Chaves de administrador (painel e TV) continuam só na planilha (GDV → Gerar código de administrador).</p>
        <div class="pn-ac-grade">
          <form class="pn-cartao pn-ac-form" id="pn-ac-form" autocomplete="off" novalidate>
            <label for="pn-ac-nome">Nome completo do servidor</label>
            <input id="pn-ac-nome" name="nome" maxlength="${NOME_MAX}" placeholder="Ex.: Maria Souza da Silva" autocapitalize="words" spellcheck="false" required>
            <p class="pn-sub pn-ac-dica">Como deve aparecer nos documentos. O acesso fica vinculado a esse nome.</p>
            <fieldset class="pn-ac-mods" id="pn-ac-mods">
              <legend>Módulos em que pode inserir dados</legend>
              ${MODULOS.map(([k, , rot]) => `<label class="pn-ac-mod"><input type="checkbox" id="pn-ac-mod-${k}" data-mod="${k}" checked> ${esc(rot)}</label>`).join('')}
              <p class="pn-sub pn-ac-dica" id="pn-ac-mods-dica">Pode mudar depois na lista abaixo. Vale para todos os aparelhos do servidor.</p>
            </fieldset>
            <button type="submit" class="pn-botao" id="pn-ac-gerar">Gerar chave</button>
            <p class="pn-erro" id="pn-ac-erro" role="alert" hidden></p>
          </form>
          <div class="pn-cartao pn-ac-res" id="pn-ac-res" hidden aria-live="polite"></div>
        </div>
      </section>
      <section class="pn-secao">
        <h2>Acessos dos servidores</h2>
        <p class="pn-sub">Aparelhos ativados e códigos gerados (pela planilha ou por aqui). O código aparece só enquanto aguarda ativação, para reenviar.</p>
        <div class="pn-secao-corpo">
          <div class="pn-kpis-host" id="pn-ac-kpis"></div>
          <div class="pn-ac-filtros">
            <label>Buscar nome<input type="search" id="pn-ac-busca" placeholder="Nome do servidor" autocomplete="off"></label>
            <label>Situação<select id="pn-ac-sit"><option value="">Todas</option>${Object.keys(SITUACOES).map(k => `<option value="${k}">${esc(SITUACOES[k].rot)}</option>`).join('')}</select></label>
            <label class="pn-ac-check"><input type="checkbox" id="pn-ac-admins"> Mostrar administradores</label>
            <button type="button" class="pn-btn" id="pn-ac-recarregar">Atualizar lista</button>
          </div>
          <div id="pn-ac-tab"></div>
        </div>
      </section>`;
    const q = s => r.querySelector(s);
    q('#pn-ac-form').addEventListener('submit', gerar);
    q('#pn-ac-nome').addEventListener('input', sugerirModulos);
    r.addEventListener('change', e => { const c = e.target.closest('input[data-perm]'); if (c) mudarPermissao(c); });
    q('#pn-ac-busca').addEventListener('input', e => { E.busca = e.target.value; desenharLista(); });
    q('#pn-ac-sit').addEventListener('change', e => { E.situacao = e.target.value; desenharLista(); });
    q('#pn-ac-admins').addEventListener('change', e => { E.admins = e.target.checked; desenharLista(); });
    q('#pn-ac-recarregar').addEventListener('click', () => carregar());
    r.addEventListener('click', e => {
      const b = e.target.closest('button[data-acao]'); if (!b) return;
      if (b.dataset.acao === 'copiar') copiarMensagem(b);
      else if (b.dataset.acao === 'revogar') revogar(b.dataset.nome, b);
      else if (b.dataset.acao === 'reenviar') {
        const a = (E.lista || []).find(x => x.perfil === 'fiscal' && x.codigo === b.dataset.codigo);
        if (a) { E.ultimo = { nome: a.nome, codigo: a.codigo, expiraEm: a.expiraEm, reenvio: true }; desenharResultado(); q('#pn-ac-res').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      }
    });
    return r;
  }
  const q = s => E.raiz && E.raiz.querySelector(s);

  /* ---------- módulos no formulário: servidor já cadastrado vem com os módulos atuais (gerar não muda sem querer) ---------- */
  function sugerirModulos() {
    const n = norm(q('#pn-ac-nome').value.trim().replace(/\s+/g, ' ')), dica = q('#pn-ac-mods-dica');
    const a = n && (E.lista || []).find(x => x.perfil === 'fiscal' && norm(x.nome) === n);
    const p = a ? permDe(a) : TUDO;
    MODULOS.forEach(([k]) => { q('#pn-ac-mod-' + k).checked = !!p[k]; });
    dica.textContent = a ? `Módulos atuais de ${a.nome} (já cadastrado). O que ficar marcado aqui passa a valer para todos os aparelhos dele.`
      : 'Pode mudar depois na lista abaixo. Vale para todos os aparelhos do servidor.';
  }

  /* ---------- gerar ---------- */
  async function gerar(ev) {
    ev.preventDefault();
    const inp = q('#pn-ac-nome'), err = q('#pn-ac-erro'), b = q('#pn-ac-gerar');
    const nome = inp.value.trim().replace(/\s+/g, ' ');
    err.hidden = true;
    const falha = m => { err.textContent = m; err.hidden = false; inp.focus(); };
    if (!nome) return falha('Informe o nome completo do servidor.');
    if (nome.split(' ').length < 2) return falha('Informe o nome completo (nome e sobrenome).');
    if (nome.length > NOME_MAX) return falha(`Nome longo demais (máximo de ${NOME_MAX} caracteres).`);
    const modulos = {}; MODULOS.forEach(([k]) => { modulos[k] = q('#pn-ac-mod-' + k).checked ? 1 : 0; });
    if (!modulos.veiculos && !modulos.tf && !modulos.pce) { err.textContent = MSG_MIN; err.hidden = false; return; }
    b.disabled = true; b.textContent = 'Gerando…';
    try {
      const j = await P.chamar({ action: 'painelGerarCodigo', nome, modulos });
      E.ultimo = { nome: j.nome, codigo: j.codigo, expiraEm: j.expiraEm, permissoes: j.permissoes || modulos }; E.aviso = '';
      inp.value = ''; sugerirModulos(); desenharResultado();
      carregar();
    } catch (e) { if (P.logado) falha(e.message); }
    finally { b.disabled = false; b.textContent = 'Gerar chave'; }
  }

  function desenharResultado() {
    const box = q('#pn-ac-res'), g = E.ultimo; if (!box) return;
    if (!g) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = `
      <div class="pn-ac-para">${g.reenvio ? 'Código (ainda não usado) de' : 'Chave de ativação de'} <b>${esc(g.nome)}</b></div>
      <div class="pn-ac-codigo" id="pn-ac-codigo" aria-label="Código ${esc(String(g.codigo).split('').join(' '))}">${esc(codigoFmt(g.codigo))}</div>
      <div class="pn-ac-validade">Uso único · válida até <b>${esc(dataHora(g.expiraEm))}</b> (horário de Manaus)</div>
      ${g.permissoes ? `<div class="pn-ac-validade" id="pn-ac-res-mods">Módulos: <b>${esc(MODULOS.filter(([k]) => g.permissoes[k]).map(m => m[2]).join(', '))}</b></div>` : ''}
      <ol class="pn-ac-passos">
        <li>No celular do servidor, abra <a href="${esc(APP_URL)}" target="_blank" rel="noopener">${esc(APP_URL.replace(/^https:\/\//, ''))}</a>.</li>
        <li>Instale o app (Android: <i>Instalar app</i>; iPhone, no Safari: Compartilhar → <i>Adicionar à Tela de Início</i>).</li>
        <li>Abra o app pelo ícone e digite o código.</li>
      </ol>
      <div class="pn-ac-acoes">
        <button type="button" class="pn-btn pn-btn-prim" data-acao="copiar" id="pn-ac-copiar">Copiar mensagem</button>
        <a class="pn-btn pn-ac-whats" id="pn-ac-whats" href="${esc(linkWhats(g))}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a>
        <span class="pn-ac-aviso" id="pn-ac-aviso" role="status"></span>
      </div>`;
  }
  async function copiarMensagem(b) {
    if (!E.ultimo) return;
    const okc = await copiar(mensagem(E.ultimo)), av = q('#pn-ac-aviso');
    if (av) { av.textContent = okc ? 'Mensagem copiada. Cole no WhatsApp, SMS ou e-mail.' : 'Não foi possível copiar. Selecione o código e copie à mão.'; av.className = 'pn-ac-aviso' + (okc ? ' ok' : ' erro'); }
    if (okc && b) { b.textContent = 'Copiada ✓'; setTimeout(() => { if (b.isConnected) b.textContent = 'Copiar mensagem'; }, 2500); }
  }

  /* ---------- lista ---------- */
  async function carregar() {
    if (E.carregando) return; E.carregando = true;
    const tab = q('#pn-ac-tab'); if (tab && !E.lista) tab.innerHTML = '<div class="pn-vazio">Carregando acessos…</div>';
    try {
      const j = await P.chamar({ action: 'painelAcessos' });
      E.lista = Array.isArray(j.acessos) ? j.acessos : []; E.lidoEm = Date.now(); E.erro = '';
    } catch (e) { E.erro = e.message; }
    finally { E.carregando = false; if (P.logado) desenharLista(); }
  }
  function desenharLista() {
    const tab = q('#pn-ac-tab'), kp = q('#pn-ac-kpis'); if (!tab) return;
    tab.innerHTML = ''; kp.innerHTML = '';
    if (E.erro && !E.lista) { tab.innerHTML = `<div class="pn-cartao pn-falha" role="alert"><b>Não foi possível carregar os acessos.</b><p class="pn-sub">${esc(E.erro)}</p></div>`; return; }
    if (!E.lista) return;
    const fiscais = E.lista.filter(a => a.perfil === 'fiscal'), n = k => fiscais.filter(a => a.situacao === k).length;
    const nomesAtivos = new Set(fiscais.filter(a => a.situacao === 'ativo').map(a => norm(a.nome)));
    P.kpis(kp, [
      { rotulo: 'Servidores com app ativo', valor: nomesAtivos.size, detalhe: `${fmt.int(n('ativo'))} aparelho(s)` },
      { rotulo: 'Aguardando ativação', valor: n('aguardando'), status: n('aguardando') ? 'atencao' : null, detalhe: 'códigos válidos não usados' },
      { rotulo: 'Códigos vencidos', valor: n('vencido'), detalhe: 'não usados em 7 dias' },
      { rotulo: 'Revogados', valor: n('revogado') }
    ]);
    const b = norm(E.busca);
    const linhas = E.lista.filter(a => (E.admins || a.perfil === 'fiscal') && (!E.situacao || a.situacao === E.situacao) && (!b || norm(a.nome).includes(b)))
      .map(a => Object.assign({}, a, { ordemSit: (SITUACOES[a.situacao] || {}).ordem }));
    const podeRevogar = a => a.perfil === 'fiscal' && a.situacao !== 'revogado' && a.situacao !== 'vencido';
    P.tabela(tab, [
      { chave: 'nome', rotulo: 'Servidor', html: (v, l) => `<b>${esc(v)}</b>${l.perfil === 'admin' ? ' <span class="pn-ac-perfil">administrador</span>' : ''}` },
      { chave: 'situacao', rotulo: 'Situação', ordem: l => l.ordemSit, csv: v => (SITUACOES[v] || {}).rot || v,
        html: v => { const s = SITUACOES[v] || { rot: v, cls: 'info' }; return `<span class="pn-selo ${s.cls}">${esc(s.rot)}</span>`; } },
      { chave: 'permissoes', rotulo: 'Módulos', ordem: l => l.perfil === 'admin' ? '' : MODULOS.filter(([k]) => permDe(l)[k]).length,
        csv: (v, l) => l.perfil === 'admin' ? 'todos (administrador)' : MODULOS.filter(([k]) => permDe(l)[k]).map(m => m[1]).join(', '),
        html: (v, l) => l.perfil === 'admin' ? '<span class="pn-sub">—</span>' : modulosHTML(l) },
      { chave: 'codigo', rotulo: 'Código', csv: () => '', html: (v, l) => v ? `<span class="pn-ac-cod">${esc(codigoFmt(v))}</span> <button type="button" class="pn-link" data-acao="reenviar" data-codigo="${esc(v)}">Reenviar</button>` : '—' },
      { chave: 'criadoEm', rotulo: 'Gerado em', num: true, fmt: v => dataCurta(v), csv: v => v ? dataCurta(v) : '' },
      { chave: 'expiraEm', rotulo: 'Código válido até', num: true, fmt: (v, l) => l.situacao === 'aguardando' || l.situacao === 'vencido' ? dataCurta(v) : '—', csv: v => v ? dataCurta(v) : '' },
      { chave: 'ativadoEm', rotulo: 'Ativado em', num: true, fmt: v => dataCurta(v), csv: v => v ? dataCurta(v) : '' },
      { chave: 'geradoPor', rotulo: 'Gerado por', fmt: (v, l) => l.perfil === 'admin' ? '—' : v === 'planilha' ? 'Planilha (menu)' : (v || '—') },
      { chave: 'acoes', rotulo: '', csv: () => '', html: (v, l) => podeRevogar(l) ? `<button type="button" class="pn-btn pn-btn-mini pn-ac-revogar" data-acao="revogar" data-nome="${esc(l.nome)}">Revogar</button>`
        : l.perfil === 'admin' && l.situacao !== 'revogado' ? '<span class="pn-sub">só pela planilha</span>' : '' }
    ], linhas, { id: 'acessos', csv: 'acessos-servidores.csv', busca: false, limite: 50, ordenar: 'criadoEm', desc: true,
      titulo: E.aviso || undefined,
      subtitulo: `${E.lidoEm ? 'Lista lida às ' + P.horaManaus(E.lidoEm) : ''}${E.erro ? ' · falha ao atualizar: ' + E.erro : ''}`,
      vazio: E.lista.length ? 'Nenhum acesso com esses filtros.' : 'Nenhum acesso cadastrado ainda.' });
  }

  /* ---------- módulos por servidor (caixas na tabela; salvam na hora) ---------- */
  function modulosHTML(l) {
    const p = permDe(l);
    return `<div class="pn-ac-perm" data-nome="${esc(l.nome)}" role="group" aria-label="Módulos de ${esc(l.nome)}">${MODULOS.map(([k, curto, longo, minimo]) =>
      `<label title="${esc(longo)}"><input type="checkbox" data-perm="${k}" data-nome="${esc(l.nome)}" aria-label="${esc(longo)}" ${p[k] ? 'checked' : ''}> <span class="pn-ac-perm-r">${esc(curto)}</span><span class="pn-ac-perm-m" aria-hidden="true">${esc(minimo)}</span></label>`).join('')}<span class="pn-ac-perm-st" role="status"></span></div>`;
  }
  /** Todas as linhas do mesmo servidor (vários aparelhos/códigos) mostram as mesmas caixas. */
  function caixasDe(nome) { return [...(E.raiz ? E.raiz.querySelectorAll('.pn-ac-perm') : [])].filter(g => norm(g.dataset.nome) === norm(nome)); }
  function mostrarPerm(nome, p, st, cls, ocupado) {
    caixasDe(nome).forEach(g => {
      g.querySelectorAll('input[data-perm]').forEach(i => { i.checked = !!p[i.dataset.perm]; i.disabled = !!ocupado; });
      const s = g.querySelector('.pn-ac-perm-st'); s.textContent = st || ''; s.className = 'pn-ac-perm-st' + (cls ? ' ' + cls : '');
    });
  }
  async function mudarPermissao(c) {
    const g = c.closest('.pn-ac-perm'), nome = c.dataset.nome; if (!g || !nome) return;
    const a = (E.lista || []).find(x => x.perfil === 'fiscal' && norm(x.nome) === norm(nome)), antes = permDe(a);
    const novo = {}; g.querySelectorAll('input[data-perm]').forEach(i => { novo[i.dataset.perm] = i.checked ? 1 : 0; });
    if (!novo.veiculos && !novo.tf && !novo.pce) { mostrarPerm(nome, antes, MSG_MIN, 'erro'); return; }
    mostrarPerm(nome, novo, 'Salvando…', '', true);
    try {
      const j = await P.chamar(Object.assign({ action: 'painelPermissoes', nome }, novo));
      const p = Object.assign({}, TUDO, j.permissoes || novo);
      (E.lista || []).forEach(x => { if (x.perfil === 'fiscal' && norm(x.nome) === norm(nome)) x.permissoes = p; });
      mostrarPerm(nome, p, 'Salvo ✓', 'ok');
      setTimeout(() => caixasDe(nome).forEach(x => { const s = x.querySelector('.pn-ac-perm-st'); if (s && s.classList.contains('ok')) { s.textContent = ''; s.className = 'pn-ac-perm-st'; } }), 4000);
    } catch (e) {
      if (P.logado) mostrarPerm(nome, antes, 'Não salvou: ' + e.message, 'erro');
    }
  }

  /* ---------- revogar ---------- */
  async function revogar(nome, b) {
    if (!nome) return;
    if (!confirm(`Revogar o acesso de ${nome}?\n\nTodos os aparelhos e códigos ainda não usados desse servidor deixam de valer na hora. Para voltar a usar o app, será preciso uma nova chave de ativação.`)) return;
    if (b) { b.disabled = true; b.textContent = 'Revogando…'; }
    try {
      const j = await P.chamar({ action: 'painelRevogar', nome });
      if (E.ultimo && norm(E.ultimo.nome) === norm(nome)) { E.ultimo = null; desenharResultado(); }
      E.aviso = j.revogados ? `Acesso de ${nome} revogado (${j.revogados} aparelho(s)/código(s)).` : `Nenhum acesso ativo de ${nome} encontrado.`;
      await carregar();
    } catch (e) {
      if (P.logado) alert('Não foi possível revogar: ' + e.message);
      if (b && b.isConnected) { b.disabled = false; b.textContent = 'Revogar'; }
    }
  }

  /* ---------- aba ---------- */
  function render(c) {
    if (!E.raiz) E.raiz = montar();
    c.appendChild(E.raiz);
    if (!E.lista || (!E.carregando && Date.now() - E.lidoEm > RECARREGAR_MS)) carregar();
  }
  // outro administrador pode entrar neste aparelho: nada da sessão anterior fica na tela
  P.aoSair(() => { if (E.raiz) E.raiz.remove(); Object.assign(E, { raiz: null, lista: null, lidoEm: 0, erro: '', ultimo: null, aviso: '', busca: '', situacao: '', admins: false }); });

  P.registrarAba({ id: 'acessos', titulo: 'Servidores', render, semFiltros: true, mensagem, linkWhats });
})();
