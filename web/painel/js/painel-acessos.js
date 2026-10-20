/* Painel gerencial do GDV — aba "Servidores": gerar chave de ativação do app de campo para um fiscal/servidor, reenviar o código
   (copiar / WhatsApp), acompanhar ou revogar os acessos e escolher os módulos em que cada servidor pode inserir dados
   (Educação Sanitária/Fiscalização de Trânsito, TF de Barreira, PCE; por nome, valem para todos os aparelhos dele) e se pode
   "Digitar do papel" (registros antigos do PCE com PDF escaneado: desmarcado por padrão; exige o PCE — marcar "Papel" marca o PCE
   junto e desmarcar o PCE desmarca "Papel").
   Servidor revogado ou com código vencido pode sair da lista ("Remover": botão no computador; no celular, deslizar a linha para a
   esquerda revela "Remover da lista"). Nada é apagado da planilha (oculto=1); "Mostrar removidos" lista esses e permite Restaurar.
   O cartão da chave gerada some sozinho ~3 s depois de "Copiar mensagem" ou "Enviar pelo WhatsApp" (o código segue na lista, com Reenviar).
   Administradores (painel e TV) aparecem com "Mostrar administradores" e também podem ser revogados aqui, menos o próprio acesso
   (esse sai pelo botão Sair). Administrador revogado/vencido também tem "Remover" (e Restaurar), nunca o próprio acesso; só aparece
   se o back avisar que aceita (painelAcessos → ocultarAdmin), para o painel aguentar o Code.gs antigo. Código de administrador novo
   continua só pelo menu da planilha.
   Usa as actions painelGerarCodigo, painelAcessos, painelRevogar, painelRevogarAdmin, painelOcultarAcesso, painelRestaurarAcesso e
   painelPermissoes (Code.gs).
   Não depende do período nem dos filtros e não aparece no Modo TV. Usa a API do objeto global Painel (js/painel.js). */
(() => {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, fmt = P.fmt, esc = P.esc, norm = P.norm;
  const APP_URL = 'https://evilasionogueiraagro-netizen.github.io/GDV/';
  const RECARREGAR_MS = 60 * 1000;                    // ao voltar à aba, relê a lista se a última leitura tiver mais de 1 min
  const RECOLHER_MS = 3000;                           // cartão da chave: tempo da confirmação (copiada / WhatsApp aberto) antes de recolher
  const DESL_W = 124;                                 // celular: largura do botão "Remover da lista" revelado ao deslizar a linha
  const celular = () => window.matchMedia('(max-width: 560px)').matches;
  const NOME_MAX = 80;
  const MODULOS = [['veiculos', 'Fiscalização', 'Educação Sanitária/Fiscalização de Trânsito', 'Fisc.'], ['tf', 'TF', 'TF de Barreira', 'TF'], ['pce', 'PCE', 'PCE – Programa de Controle e Erradicação', 'PCE'],
    ['antigo', 'Digitar do papel', 'Digitar do papel (registros antigos do PCE, com PDF escaneado)', 'Papel']];
  const TUDO = { veiculos: 1, tf: 1, pce: 1, antigo: 0 };                 // padrão do servidor: módulos liberados, "Digitar do papel" não
  /** "Digitar do papel" depende do PCE: marcar Papel marca o PCE; desmarcar o PCE desmarca Papel (c = caixa que mudou). */
  function amarrarPapel(c, caixa) {
    const k = c.dataset.perm || c.dataset.mod, pce = caixa('pce'), ant = caixa('antigo');
    if (k === 'antigo' && c.checked && pce) pce.checked = true;
    if (k === 'pce' && !c.checked && ant) ant.checked = false;
  }
  const permDe = a => Object.assign({}, TUDO, (a && a.permissoes) || {});
  const MSG_MIN = 'Marque pelo menos um módulo. Para tirar todo o acesso do servidor, use Revogar.';
  const SITUACOES = {
    aguardando: { rot: 'Aguardando ativação', cls: 'atencao', ordem: 0 },
    ativo: { rot: 'Ativo', cls: 'bom', ordem: 1 },
    vencido: { rot: 'Código vencido', cls: 'serio', ordem: 2 },
    revogado: { rot: 'Revogado', cls: 'info', ordem: 3 }
  };

  /* ---------- estado (sobrevive às atualizações automáticas do painel, que redesenham a aba) ---------- */
  const E = { raiz: null, lista: null, lidoEm: 0, carregando: false, erro: '', ultimo: null, aviso: '', busca: '', situacao: '', admins: false, removidos: false };

  const codigoFmt = c => String(c || '').replace(/\D/g, '').padStart(6, '0').replace(/^(\d{3})(\d{3})$/, '$1 $2');
  const dataHora = ms => ms > 1e12 ? `${fmt.data(P.diaManaus(ms))} às ${P.horaManaus(ms)}` : '—';
  const dataCurta = ms => ms > 1e12 ? `${fmt.data(P.diaManaus(ms))} ${P.horaManaus(ms)}` : '—';
  const primeiroNome = n => String(n || '').trim().split(/\s+/)[0] || '';

  /** Texto pronto para mandar ao fiscal (WhatsApp, e-mail, SMS). */
  function mensagem(g) {
    return `Olá, ${primeiroNome(g.nome)}! Sua chave de ativação do app e-GDV (ADAF):\n\n` +
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
        <p class="pn-sub">Código do app de campo para um fiscal/servidor: 6 dígitos, uso único, vale 7 dias. Chaves de administrador (painel e TV) são geradas só na planilha (e-GDV → Gerar código de administrador); para revogar uma, marque <i>Mostrar administradores</i> na lista abaixo.</p>
        <div class="pn-ac-grade">
          <form class="pn-cartao pn-ac-form" id="pn-ac-form" autocomplete="off" novalidate>
            <label for="pn-ac-nome">Nome completo do servidor</label>
            <input id="pn-ac-nome" name="nome" maxlength="${NOME_MAX}" placeholder="Ex.: Maria Souza da Silva" autocapitalize="words" spellcheck="false" required>
            <p class="pn-sub pn-ac-dica">Como deve aparecer nos documentos. O acesso fica vinculado a esse nome.</p>
            <fieldset class="pn-ac-mods" id="pn-ac-mods">
              <legend>Módulos em que pode inserir dados</legend>
              ${MODULOS.map(([k, , rot]) => `<label class="pn-ac-mod"><input type="checkbox" id="pn-ac-mod-${k}" data-mod="${k}" ${TUDO[k] ? 'checked' : ''}> ${esc(rot)}</label>`).join('')}
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
            <label class="pn-ac-check"><input type="checkbox" id="pn-ac-removidos"> Mostrar removidos</label>
            <button type="button" class="pn-btn" id="pn-ac-recarregar">Atualizar lista</button>
          </div>
          <div id="pn-ac-tab"></div>
        </div>
      </section>`;
    const q = s => r.querySelector(s);
    q('#pn-ac-form').addEventListener('submit', gerar);
    q('#pn-ac-nome').addEventListener('input', sugerirModulos);
    r.addEventListener('change', e => {
      const m = e.target.closest('input[data-mod]'); if (m) amarrarPapel(m, k => q('#pn-ac-mod-' + k));
      const c = e.target.closest('input[data-perm]'); if (c) mudarPermissao(c);
    });
    q('#pn-ac-busca').addEventListener('input', e => { E.busca = e.target.value; desenharLista(); });
    q('#pn-ac-sit').addEventListener('change', e => { E.situacao = e.target.value; desenharLista(); });
    q('#pn-ac-admins').addEventListener('change', e => { E.admins = e.target.checked; desenharLista(); });
    q('#pn-ac-removidos').addEventListener('change', e => { E.removidos = e.target.checked; E.aviso = ''; carregar(true); });
    q('#pn-ac-recarregar').addEventListener('click', () => carregar());
    r.addEventListener('click', e => {
      const b = e.target.closest('button[data-acao]'); if (!b) return;
      if (b.dataset.acao === 'copiar') copiarMensagem(b);
      else if (b.dataset.acao === 'revogar') revogar(b.dataset.nome, b, b.dataset.perfil === 'admin');
      else if (b.dataset.acao === 'remover') ocultar(b.dataset.nome, b, false, b.dataset.perfil === 'admin');
      else if (b.dataset.acao === 'restaurar') ocultar(b.dataset.nome, b, true, b.dataset.perfil === 'admin');
      else if (b.dataset.acao === 'reenviar') {
        const a = (E.lista || []).find(x => x.perfil === 'fiscal' && x.codigo === b.dataset.codigo);
        if (a) { E.ultimo = { nome: a.nome, codigo: a.codigo, expiraEm: a.expiraEm, reenvio: true }; desenharResultado(); q('#pn-ac-res').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      }
    });
    r.addEventListener('click', e => { if (e.target.closest('#pn-ac-whats')) whatsAberto(); });
    deslizar(r);
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
    clearTimeout(E.tmRecolher); box.classList.remove('pn-ac-saindo');
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
    if (okc && b) b.textContent = 'Copiada ✓';
    if (okc) recolherDepois();                       // se não copiou, o cartão fica para copiar o código à mão
  }
  function whatsAberto() {
    if (!E.ultimo) return;
    const av = q('#pn-ac-aviso');
    if (av) { av.textContent = 'WhatsApp aberto. Escolha o contato do servidor e envie a mensagem.'; av.className = 'pn-ac-aviso ok'; }
    recolherDepois();
  }
  /** Depois de copiar/abrir o WhatsApp: mostra a confirmação por ~3 s, recolhe o cartão, limpa o nome e relê a lista. */
  function recolherDepois() {
    const g = E.ultimo; clearTimeout(E.tmRecolher);
    E.tmRecolher = setTimeout(() => {
      const box = q('#pn-ac-res');
      if (E.ultimo !== g || !box || box.hidden) return;                       // outro código entrou no cartão nesse meio-tempo
      box.classList.add('pn-ac-saindo');
      const fim = () => { if (E.ultimo !== g) return; E.ultimo = null; desenharResultado(); };
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) fim(); else setTimeout(fim, 260);
      const inp = q('#pn-ac-nome'); if (inp && document.activeElement !== inp) { inp.value = ''; sugerirModulos(); }
      carregar(true);
    }, RECOLHER_MS);
  }

  /* ---------- sinal dos aparelhos (último sinal, versão, pendentes, último erro) ---------- */
  const NOMES_PEND = { turnos: ['turno', 'turnos'], veiculos: ['veículo', 'veículos'], tfs: ['TF', 'TFs'], levantamentos: ['levantamento', 'levantamentos'],
    colheitas: ['termo', 'termos'], arquivos: ['foto/arquivo', 'fotos/arquivos'] };
  const PLAT = { android: 'Android', ios: 'iPhone', outro: 'outro' };
  /** Versão de referência: a publicada (js/versao.js, mesma publicação do painel); sem ela, a do aparelho visto mais recentemente. */
  function versaoReferencia() {
    if (typeof VERSAO_APP !== 'undefined' && VERSAO_APP) return VERSAO_APP;
    const l = (E.lista || []).map(a => a.aparelho).filter(x => x && x.versao).sort((a, b) => b.ultimoSinal - a.ultimoSinal);
    return l.length ? l[0].versao : '';
  }
  const desatualizado = ap => !!ap && (ap.legado || !ap.versao || (versaoReferencia() && ap.versao !== versaoReferencia()));
  const pendTxt = ap => { if (!ap) return ''; const p = ap.pendentes || {};
    const l = Object.keys(NOMES_PEND).filter(k => p[k]).map(k => `${fmt.int(p[k])} ${NOMES_PEND[k][p[k] === 1 ? 0 : 1]}`);
    if (ap.encerradosPendentes) l.unshift(`${ap.encerradosPendentes} encerramento(s) de turno`);
    return l.length ? l.join(', ') : 'nada pendente'; };
  function sinalHTML(l) {
    const ap = l.aparelho; if (!ap) return '<span class="pn-sub">—</span>';
    const velho = P.agora() - ap.ultimoSinal > 30 * 60000;
    return `<span${velho ? ' class="pn-sub"' : ''}>${esc(fmt.rel(ap.ultimoSinal))}</span><br><span class="pn-sub">${esc(dataCurta(ap.ultimoSinal))}${ap.origem === 'segundo-plano' ? ' · em segundo plano' : ''}${l.nAparelhos > 1 ? ` · ${l.nAparelhos} aparelhos` : ''}</span>`;
  }
  /** No celular as colunas do sinal ficam ocultas: um resumo vai embaixo da situação (só aparece em telas estreitas). */
  function sinalCurto(l) {
    const ap = l.aparelho; if (!ap) return '';
    const alerta = [desatualizado(ap) && 'app desatualizado', ap.pendentesTotal && `${fmt.int(ap.pendentesTotal)} pendente(s)`, ap.erroAtual && 'erro ao enviar'].filter(Boolean);
    return `<span class="pn-ac-sinal-m">sinal ${esc(fmt.rel(ap.ultimoSinal))}${alerta.length ? ` · <b>${esc(alerta.join(' · '))}</b>` : ''}</span>`;
  }
  function versaoHTML(l) {
    const ap = l.aparelho; if (!ap) return '<span class="pn-sub">—</span>';
    const v = ap.legado || !ap.versao ? 'anterior a esta função' : ap.versao;
    return `${desatualizado(ap) ? `<span class="pn-ac-velha" title="Versão publicada: ${esc(versaoReferencia() || '?')}">⚠️ ${esc(v)} (desatualizada)</span>` : esc(v)}<br><span class="pn-sub">${esc(PLAT[ap.plataforma] || (ap.legado ? '' : 'outro'))}${ap.standalone ? ' · instalado' : ''}</span>`;
  }
  function erroHTML(l) {
    const ap = l.aparelho; if (!ap || !ap.ultimoErro) return '<span class="pn-sub">—</span>';
    return `<span class="pn-ac-erro">${ap.erroAtual ? '⚠️ ' : ''}${esc(ap.ultimoErro)}</span><span class="pn-sub">${esc(fmt.rel(ap.ultimoErroEm))}${ap.erroAtual ? ' · ainda sem envio' : ' · depois enviou normalmente'}</span>`;
  }

  /* ---------- lista ---------- */
  async function carregar(deNovo) {
    if (E.carregando) { if (deNovo) E.reler = true; return; }
    E.carregando = true; E.reler = false;
    const tab = q('#pn-ac-tab'); if (tab && !E.lista) tab.innerHTML = '<div class="pn-vazio">Carregando acessos…</div>';
    try {
      const j = await P.chamar(E.removidos ? { action: 'painelAcessos', ocultos: true } : { action: 'painelAcessos' });
      E.lista = Array.isArray(j.acessos) ? j.acessos : []; E.lidoEm = Date.now(); E.erro = ''; E.ocultarAdmin = !!j.ocultarAdmin;
    } catch (e) { E.erro = e.message; }
    finally { E.carregando = false; if (P.logado) { desenharLista(); if (E.reler) carregar(); } }
  }
  function desenharLista() {
    const tab = q('#pn-ac-tab'), kp = q('#pn-ac-kpis'); if (!tab) return;
    tab.innerHTML = ''; kp.innerHTML = '';
    if (E.erro && !E.lista) { tab.innerHTML = `<div class="pn-cartao pn-falha" role="alert"><b>Não foi possível carregar os acessos.</b><p class="pn-sub">${esc(E.erro)}</p></div>`; return; }
    if (!E.lista) return;
    const fiscais = E.lista.filter(a => a.perfil === 'fiscal' && !a.oculto), n = k => fiscais.filter(a => a.situacao === k).length;
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
    const proprio = a => a.perfil === 'admin' && norm(a.nome) === norm(P.usuario);   // o próprio acesso sai pelo Sair
    const podeRevogar = a => !proprio(a) && !a.oculto && a.situacao !== 'revogado' && a.situacao !== 'vencido';
    // "Remover da lista": só quem não tem nenhum acesso ativo nem código aguardando (todas as linhas do nome, no mesmo perfil, revogadas/vencidas);
    // administrador só se o back aceitar (ocultarAdmin) e nunca o próprio acesso
    const chaveP = a => a.perfil + '|' + norm(a.nome);
    const vivos = new Set(E.lista.filter(a => a.situacao === 'ativo' || a.situacao === 'aguardando').map(chaveP));
    const podeRemover = a => (a.perfil === 'fiscal' || (a.perfil === 'admin' && E.ocultarAdmin && !proprio(a))) && !a.oculto &&
      (a.situacao === 'revogado' || a.situacao === 'vencido') && !vivos.has(chaveP(a));
    P.tabela(tab, [
      { chave: 'nome', rotulo: 'Servidor', html: (v, l) => `<b>${esc(v)}</b>${l.perfil === 'admin' ? ' <span class="pn-ac-perfil">administrador</span>' : ''}` },
      { chave: 'situacao', rotulo: 'Situação', ordem: l => l.ordemSit, csv: v => (SITUACOES[v] || {}).rot || v,
        html: (v, l) => { const s = SITUACOES[v] || { rot: v, cls: 'info' }; return `<span class="pn-selo ${s.cls}">${esc(s.rot)}</span>${l.oculto ? ' <span class="pn-ac-perfil pn-ac-removido">removido da lista</span>' : ''}${sinalCurto(l)}`; } },
      { chave: 'permissoes', rotulo: 'Módulos', ordem: l => l.perfil === 'admin' ? '' : MODULOS.filter(([k]) => permDe(l)[k]).length,
        csv: (v, l) => l.perfil === 'admin' ? 'todos (administrador)' : MODULOS.filter(([k]) => permDe(l)[k]).map(m => m[1]).join(', '),
        html: (v, l) => l.perfil === 'admin' ? '<span class="pn-sub">—</span>' : modulosHTML(l) },
      { chave: 'sinal', rotulo: 'Último sinal', ordem: l => l.aparelho ? l.aparelho.ultimoSinal : 0, csv: (v, l) => l.aparelho ? dataCurta(l.aparelho.ultimoSinal) : '',
        html: (v, l) => sinalHTML(l) },
      { chave: 'versao', rotulo: 'Versão do app', ordem: l => l.aparelho ? (desatualizado(l.aparelho) ? 0 : 1) : 2,
        csv: (v, l) => l.aparelho ? (l.aparelho.versao || 'anterior') + (desatualizado(l.aparelho) ? ' (desatualizada)' : '') : '', html: (v, l) => versaoHTML(l) },
      { chave: 'pend', rotulo: 'Pendentes', ordem: l => l.aparelho ? l.aparelho.pendentesTotal + 1000 * (l.aparelho.encerradosPendentes || 0) : -1, csv: (v, l) => pendTxt(l.aparelho),
        html: (v, l) => l.aparelho ? `<span${l.aparelho.pendentesTotal ? ' class="pn-ac-velha"' : ' class="pn-sub"'}>${esc(pendTxt(l.aparelho))}</span>` : '<span class="pn-sub">—</span>' },
      { chave: 'erro', rotulo: 'Último erro', ordem: l => l.aparelho && l.aparelho.ultimoErro ? (l.aparelho.erroAtual ? 2 : 1) : 0, csv: (v, l) => l.aparelho ? l.aparelho.ultimoErro || '' : '',
        html: (v, l) => erroHTML(l) },
      { chave: 'codigo', rotulo: 'Código', csv: () => '', html: (v, l) => v ? `<span class="pn-ac-cod">${esc(codigoFmt(v))}</span> <button type="button" class="pn-link" data-acao="reenviar" data-codigo="${esc(v)}">Reenviar</button>` : '—' },
      { chave: 'criadoEm', rotulo: 'Gerado em', num: true, fmt: v => dataCurta(v), csv: v => v ? dataCurta(v) : '' },
      { chave: 'expiraEm', rotulo: 'Código válido até', num: true, fmt: (v, l) => l.situacao === 'aguardando' || l.situacao === 'vencido' ? dataCurta(v) : '—', csv: v => v ? dataCurta(v) : '' },
      { chave: 'ativadoEm', rotulo: 'Ativado em', num: true, fmt: v => dataCurta(v), csv: v => v ? dataCurta(v) : '' },
      { chave: 'geradoPor', rotulo: 'Gerado por', fmt: (v, l) => l.perfil === 'admin' ? '—' : v === 'planilha' ? 'Planilha (menu)' : (v || '—') },
      { chave: 'acoes', rotulo: '', csv: () => '', html: (v, l) => podeRevogar(l) ? `<button type="button" class="pn-btn pn-btn-mini pn-ac-revogar" data-acao="revogar" data-nome="${esc(l.nome)}" data-perfil="${esc(l.perfil)}">Revogar</button>`
        : podeRemover(l) ? `<button type="button" class="pn-btn pn-btn-mini pn-ac-remover" data-acao="remover" data-nome="${esc(l.nome)}" data-perfil="${esc(l.perfil)}" title="Tira ${esc(l.nome)} da lista (a planilha guarda o registro)">Remover</button>` +
          `<button type="button" class="pn-ac-desl" data-acao="remover" data-nome="${esc(l.nome)}" data-perfil="${esc(l.perfil)}" tabindex="-1">Remover da lista</button>`
        : l.oculto ? `<button type="button" class="pn-btn pn-btn-mini pn-ac-restaurar" data-acao="restaurar" data-nome="${esc(l.nome)}" data-perfil="${esc(l.perfil)}">Restaurar</button>`
        : proprio(l) && l.situacao === 'ativo' ? '<span class="pn-sub">você (use Sair)</span>' : '' }
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
    if (c.dataset.perm === 'antigo' && novo.antigo) novo.pce = 1;              // "Digitar do papel" exige o PCE (marca junto)
    if (c.dataset.perm === 'pce' && !novo.pce) novo.antigo = 0;                // sem PCE não há "Digitar do papel"
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
  async function revogar(nome, b, admin) {
    if (!nome) return;
    if (!confirm(admin
      ? `Revogar o acesso de administrador de ${nome}?\n\nO painel e a TV desse administrador deixam de funcionar na hora, inclusive códigos ainda não usados. Para voltar, será preciso um novo código de administrador gerado na planilha (e-GDV → Gerar código de administrador).`
      : `Revogar o acesso de ${nome}?\n\nTodos os aparelhos e códigos ainda não usados desse servidor deixam de valer na hora. Para voltar a usar o app, será preciso uma nova chave de ativação.`)) return;
    if (b) { b.disabled = true; b.textContent = 'Revogando…'; }
    try {
      const j = await P.chamar({ action: admin ? 'painelRevogarAdmin' : 'painelRevogar', nome });
      if (!admin && E.ultimo && norm(E.ultimo.nome) === norm(nome)) { E.ultimo = null; desenharResultado(); }
      E.aviso = j.revogados ? `Acesso ${admin ? 'de administrador ' : ''}de ${nome} revogado (${j.revogados} ${admin ? 'acesso(s)/código(s)' : 'aparelho(s)/código(s)'}).`
        : `Nenhum acesso ativo de ${nome} encontrado.`;
      await carregar();
    } catch (e) {
      if (P.logado) alert('Não foi possível revogar: ' + e.message);
      if (b && b.isConnected) { b.disabled = false; b.textContent = 'Revogar'; }
    }
  }

  /* ---------- remover da lista / restaurar (oculto na planilha; nada é apagado) ---------- */
  async function ocultar(nome, b, restaurar, admin) {
    if (!nome) return;
    fecharDesl();
    if (!restaurar && !confirm(admin
      ? `Remover ${nome} da lista de administradores?\n\nO registro continua guardado na planilha. Se for gerado um novo código de administrador para esse nome, ele volta a aparecer.`
      : `Remover ${nome} da lista?\n\nO registro continua guardado na planilha. Se gerar uma nova chave para esse nome, o servidor volta a aparecer.`)) return;
    const rot = b ? b.textContent : '';
    if (b) { b.disabled = true; b.textContent = restaurar ? 'Restaurando…' : 'Removendo…'; }
    try {
      await P.chamar(Object.assign({ action: restaurar ? 'painelRestaurarAcesso' : 'painelOcultarAcesso', nome }, admin ? { perfil: 'admin' } : {}));
      const tr = b && b.closest('tr');
      if (!restaurar && tr && !E.removidos) { tr.classList.add('pn-ac-sumindo'); await new Promise(res => setTimeout(res, 220)); }
      E.aviso = restaurar ? `${nome} voltou para a lista.` : `${nome} saiu da lista (o registro continua na planilha; veja em "Mostrar removidos").`;
      await carregar(true);
    } catch (e) {
      if (P.logado) alert((restaurar ? 'Não foi possível restaurar: ' : 'Não foi possível remover da lista: ') + e.message);
      if (b && b.isConnected) { b.disabled = false; b.textContent = rot; }
    }
  }

  /* ---------- celular: deslizar a linha para a esquerda revela "Remover da lista" ---------- */
  let aberta = null;                                   // linha com o botão à mostra
  const celulasDe = tr => [...tr.cells].filter(td => !td.querySelector('.pn-ac-desl'));
  function posicionar(tr, x, animar) {
    celulasDe(tr).forEach(td => { td.style.transition = animar ? 'transform .2s ease' : 'none'; td.style.transform = x ? `translateX(${x}px)` : ''; });
    const bt = tr.querySelector('.pn-ac-desl');
    if (bt) { bt.style.transition = animar ? 'opacity .2s ease' : 'none'; bt.style.opacity = String(Math.min(1, -x / DESL_W)); bt.classList.toggle('vis', x < 0); bt.tabIndex = x <= -DESL_W ? 0 : -1; }
  }
  function fecharDesl() { if (aberta && aberta.isConnected) { posicionar(aberta, 0, true); aberta.classList.remove('pn-ac-aberta'); } aberta = null; }
  function deslizar(r) {
    let g = null, engolirClique = false;
    r.addEventListener('pointerdown', e => {
      if (aberta && !aberta.contains(e.target)) fecharDesl();
      const tr = e.target.closest('#pn-ac-tab tbody tr');
      if (!tr || !celular() || !tr.querySelector('.pn-ac-desl') || e.target.closest('.pn-ac-desl') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      g = { tr, id: e.pointerId, x0: e.clientX, y0: e.clientY, base: tr === aberta ? -DESL_W : 0, x: tr === aberta ? -DESL_W : 0, arrastando: false };
    });
    r.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.arrastando) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }   // rolagem vertical: não é deslize
        if (Math.abs(dx) < 8) return;
        g.arrastando = true; try { g.tr.setPointerCapture(e.pointerId); } catch (er) { /* sem captura */ }
      }
      g.x = Math.max(-DESL_W - 24, Math.min(0, g.base + dx));
      posicionar(g.tr, g.x, false);
      e.preventDefault();
    });
    const soltar = e => {
      if (!g || e.pointerId !== g.id) return;
      const { tr, arrastando, x } = g; g = null;
      if (!arrastando) { if (tr === aberta && e.type === 'pointerup' && !e.target.closest('button, input, a, label')) fecharDesl(); return; }
      engolirClique = true; setTimeout(() => { engolirClique = false; }, 350);
      if (e.type === 'pointerup' && x < -DESL_W / 2) { if (aberta && aberta !== tr) fecharDesl(); posicionar(tr, -DESL_W, true); tr.classList.add('pn-ac-aberta'); aberta = tr; }
      else { posicionar(tr, 0, true); tr.classList.remove('pn-ac-aberta'); if (aberta === tr) aberta = null; }
    };
    r.addEventListener('pointerup', soltar); r.addEventListener('pointercancel', soltar);
    r.addEventListener('click', e => { if (engolirClique) { engolirClique = false; e.preventDefault(); e.stopPropagation(); } }, true);   // o arraste não marca caixas
    document.addEventListener('pointerdown', e => { if (aberta && !aberta.contains(e.target)) fecharDesl(); }, true);          // tocar fora fecha
    window.addEventListener('resize', () => { if (aberta && !celular()) fecharDesl(); });
  }

  /* ---------- aba ---------- */
  function render(c) {
    if (!E.raiz) E.raiz = montar();
    c.appendChild(E.raiz);
    if (!E.lista || (!E.carregando && Date.now() - E.lidoEm > RECARREGAR_MS)) carregar();
    if (window.PainelAdm) PainelAdm.anexar(c);                 // bloco "Portal do Administrativo" (js/painel-adm.js)
  }
  // outro administrador pode entrar neste aparelho: nada da sessão anterior fica na tela
  P.aoSair(() => { if (E.raiz) E.raiz.remove(); clearTimeout(E.tmRecolher); aberta = null;
    Object.assign(E, { raiz: null, lista: null, lidoEm: 0, erro: '', ultimo: null, aviso: '', busca: '', situacao: '', admins: false, removidos: false, ocultarAdmin: false }); });

  P.registrarAba({ id: 'acessos', titulo: 'Servidores', render, semFiltros: true, mensagem, linkWhats });
})();
