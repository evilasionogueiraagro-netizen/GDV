/* Portal do Administrativo do e-GDV (web/administrativo/) — núcleo: login (Google Identity Services ou código de ativação), sessão,
   chamadas à API (actions adm* do Code.gs com o token de SESSÃO do portal; nunca a credencial do painel/app), abas, histórico e os
   componentes de tela (seções, KPIs, alertas, tabelas com busca e CSV) no mesmo visual do painel (../painel/css/painel.css).
   Os módulos de lançamento se registram com Adm.registrarAba: js/adm-convenio.js (desembolso, físico do convênio, importação da planilha
   de movimentação), js/adm-relatorios.js (linhas manuais do Relatório GDV) e js/adm-vigifito.js (VIGIFITO por posto e importação).
   Login com Google: o navegador obtém o ID token (JWT) e o envia em admLogin {idToken}; o servidor confere no tokeninfo do Google e
   devolve a sessão (30 dias sem uso, renovada ao usar). O ID token não é guardado no navegador. Client ID público em CONFIG.adm.googleClientId. */
const Adm = (() => {
  'use strict';
  const LS_SESSAO = 'gdv.adm.sessao', LS_NOME = 'gdv.adm.nome', LS_EMAIL = 'gdv.adm.email', LS_ABA = 'gdv.adm.aba', LS_MSG = 'gdv.adm.encerrada';
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } },
    del: k => { try { localStorage.removeItem(k); } catch (e) { /* sem armazenamento */ } }
  };
  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const NF = (c, min) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: c, minimumFractionDigits: min || 0 });
  const diaManaus = ms => new Date(ms - 4 * 3600e3).toISOString().slice(0, 10);
  const horaManaus = ms => new Date(ms - 4 * 3600e3).toISOString().slice(11, 16);
  const fmt = {
    int: v => v == null || !isFinite(v) ? '—' : NF(0).format(Math.round(v)),
    num: (v, c = 2) => v == null || !isFinite(v) ? '—' : NF(c).format(v),
    moeda: v => v == null || !isFinite(v) ? '—' : 'R$ ' + NF(2, 2).format(v),
    data: s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; },
    dataHora: ms => ms > 1e12 ? `${fmt.data(diaManaus(ms))} ${horaManaus(ms)}` : '—'
  };
  const S = { sessao: ls.get(LS_SESSAO) || '', nome: ls.get(LS_NOME) || '', email: ls.get(LS_EMAIL) || '', abas: [], aba: ls.get(LS_ABA) || '', dados: null, carregando: null };

  /* ---------------- API ---------------- */
  const urlOficial = () => (typeof CONFIG !== 'undefined' && CONFIG.sync && CONFIG.sync.url) || '';
  const urlApi = () => (urlOficial() && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? urlOficial() : ls.get('gdv.url') || urlOficial()) || '';
  async function api(corpo) {
    const url = urlApi(); if (!url) throw new Error('Endereço do servidor não configurado (js/config.js).');
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, lim = ctl ? setTimeout(() => ctl.abort(), 90000) : null;
    let r, j;
    try {
      try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo), redirect: 'follow', signal: ctl ? ctl.signal : undefined }); }
      catch (e) { throw Object.assign(new Error('Sem conexão com o servidor. Verifique a internet.'), { rede: true }); }
      try { j = await r.json(); } catch (e) { throw new Error('Resposta inválida do servidor (HTTP ' + r.status + ').'); }
    } finally { clearTimeout(lim); }
    if (!j || !j.ok) throw Object.assign(new Error((j && j.erro) || 'Erro no servidor.'), { servidor: true });
    return j;
  }
  const erroDeSessao = m => /sess[aã]o do portal/i.test(m || '');
  /** Chamada com a sessão do portal; sessão expirada/revogada → volta ao login com o motivo. */
  async function chamar(corpo) {
    const s = S.sessao; if (!s) throw new Error('Sessão do portal encerrada. Entre de novo.');
    try { return await api(Object.assign({}, corpo, { sessao: s })); }
    catch (e) { if (e.servidor && erroDeSessao(e.message) && S.sessao === s) encerrar(e.message); throw e; }
  }

  /* ---------------- componentes (mesmas classes do painel) ---------------- */
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function secao(container, titulo, subtitulo) {
    const s = el('section', 'pn-secao'); s.appendChild(el('h2', null, esc(titulo)));
    if (subtitulo) s.appendChild(el('p', 'pn-sub', esc(subtitulo)));
    const corpo = el('div', 'pn-secao-corpo'); s.appendChild(corpo); container.appendChild(s); return corpo;
  }
  function vazio(container, msg) { const v = el('div', 'pn-vazio', esc(msg || 'Nenhum registro.')); container.appendChild(v); return v; }
  function kpis(container, itens) {
    const g = el('div', 'pn-kpis');
    itens.forEach(k => {
      const d = el('div', 'pn-kpi' + (k.status ? ' pn-st-' + k.status : ''));
      d.innerHTML = `<div class="pn-kpi-rot">${esc(k.rotulo)}</div><div class="pn-kpi-val">${esc(k.valor == null ? '—' : k.valor)}</div>${k.detalhe ? `<div class="pn-kpi-det">${esc(k.detalhe)}</div>` : ''}`;
      if (k.id) d.id = k.id;
      g.appendChild(d);
    });
    container.appendChild(g); return g;
  }
  const NIVEIS = { critico: ['!', 'Crítico'], serio: ['!', 'Sério'], atencao: ['i', 'Atenção'], info: ['i', 'Info'] }, ORDEM = { critico: 0, serio: 1, atencao: 2, info: 3 };
  function alertas(container, lista, opts) {
    opts = opts || {};
    const l = lista.slice().sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel]);
    if (!l.length) return vazio(container, opts.vazio || 'Nenhum aviso. ✓');
    const ul = el('ul', 'pn-alertas'), max = opts.max || 10;
    l.forEach((a, i) => {
      const [ic, rot] = NIVEIS[a.nivel] || NIVEIS.info, li = el('li', 'pn-alerta ' + a.nivel);
      li.innerHTML = `<span class="pn-alerta-ic" aria-hidden="true">${ic}</span><div><div class="pn-alerta-tit">${esc(a.titulo)}</div>${a.detalhe ? `<div class="pn-alerta-det">${esc(a.detalhe)}</div>` : ''}</div><div><span class="pn-alerta-niv">${rot}</span></div>`;
      if (i >= max) li.hidden = true;
      ul.appendChild(li);
    });
    container.appendChild(ul);
    if (l.length > max) { const b = el('button', 'pn-link', `Mostrar todos os ${l.length} avisos`); b.type = 'button'; b.onclick = () => { ul.querySelectorAll('li[hidden]').forEach(x => { x.hidden = false; }); b.remove(); }; container.appendChild(b); }
    return ul;
  }
  function csvTexto(colunas, linhas) {
    const val = (c, l) => { const v = c.csv ? c.csv(l[c.chave], l) : (c.fmt && !c.num ? c.fmt(l[c.chave], l) : l[c.chave]);
      if (v == null) return ''; if (typeof v === 'number') return String(v).replace('.', ',');
      const t = String(v); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
    const q = s => /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    return '﻿' + [colunas.map(c => q(c.rotulo)).join(';')].concat(linhas.map(l => colunas.map(c => q(val(c, l))).join(';'))).join('\r\n');
  }
  function baixar(blob, nome) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000); }
  const csvBaixar = (nome, colunas, linhas) => baixar(new Blob([csvTexto(colunas, linhas)], { type: 'text/csv;charset=utf-8' }), nome || 'dados.csv');
  const estTab = {};
  /** Tabela ordenável com busca e CSV (colunas: {chave, rotulo, num, fmt, html, csv}). */
  function tabela(container, colunas, linhas, opts) {
    opts = opts || {};
    const st = estTab[opts.id || colunas.map(c => c.chave).join('|')] = estTab[opts.id || colunas.map(c => c.chave).join('|')] || { ord: null, desc: true, busca: '', limite: opts.limite || 50 };
    const box = el('div', opts.simples ? 'pn-tab' : 'pn-cartao pn-tab'); if (opts.id) box.id = 'adm-tab-' + opts.id;
    const cab = el('div', 'pn-tab-cab'), tt = el('div'), acoes = el('div', 'pn-tab-acoes');
    if (opts.titulo) tt.appendChild(el('h3', null, esc(opts.titulo))); if (opts.subtitulo) tt.appendChild(el('p', 'pn-sub', esc(opts.subtitulo)));
    let inp = null;
    if (!opts.simples && linhas.length > 8 && opts.busca !== false) { inp = el('input', 'pn-tab-busca'); inp.type = 'search'; inp.placeholder = 'Buscar…'; inp.value = st.busca; inp.setAttribute('aria-label', 'Buscar na tabela'); acoes.appendChild(inp); }
    if (opts.csv) { const b = el('button', 'pn-btn pn-btn-mini', 'Baixar CSV'); b.type = 'button'; b.dataset.csv = opts.id || ''; b.onclick = () => csvBaixar(opts.csv, colunas, filtradas()); acoes.appendChild(b); }
    cab.appendChild(tt); cab.appendChild(acoes); if (opts.titulo || opts.subtitulo || acoes.children.length) box.appendChild(cab);
    const rolo = el('div', 'pn-tab-rolo'), rod = el('div', 'pn-tab-mais'); box.appendChild(rolo); box.appendChild(rod);
    const texto = (c, l) => { const v = l[c.chave]; return c.fmt ? c.fmt(v, l) : (typeof v === 'number' ? fmt.num(v, 2) : (v == null || v === '' ? '—' : String(v))); };
    function filtradas() {
      let r = linhas;
      if (st.busca) { const b = norm(st.busca); r = r.filter(l => colunas.some(c => norm(texto(c, l)).includes(b))); }
      if (st.ord) { const c = colunas.find(x => x.chave === st.ord); if (c) r = r.slice().sort((a, b) => { const x = a[c.chave], y = b[c.chave];
        const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'pt-BR', { numeric: true }); return st.desc ? -cmp : cmp; }); }
      return r;
    }
    function desenhar() {
      const r = filtradas(), vis = r.slice(0, st.limite);
      if (!linhas.length) { rolo.innerHTML = `<div class="pn-vazio">${esc(opts.vazio || 'Nenhum registro.')}</div>`; rod.innerHTML = ''; return; }
      rolo.innerHTML = `<table><thead><tr>${colunas.map(c => `<th scope="col" data-k="${esc(c.chave)}" class="${c.num ? 'num' : ''}" tabindex="0">${esc(c.rotulo)}</th>`).join('')}</tr></thead><tbody>` +
        vis.map(l => `<tr>${colunas.map(c => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(l[c.chave], l) : esc(texto(c, l))}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
      rod.innerHTML = `<span>${r.length === linhas.length ? fmt.int(r.length) : `${fmt.int(r.length)} de ${fmt.int(linhas.length)}`} registro(s)${r.length > vis.length ? ` · mostrando ${fmt.int(vis.length)}` : ''}</span>`;
      if (r.length > vis.length) { const m = el('button', 'pn-link', 'Mostrar todos'); m.type = 'button'; m.onclick = () => { st.limite = Infinity; desenhar(); }; rod.appendChild(m); }
      rolo.querySelectorAll('th').forEach(th => { const fn = () => { const k = th.dataset.k; if (st.ord === k) st.desc = !st.desc; else { st.ord = k; st.desc = true; } desenhar(); };
        th.onclick = fn; th.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } }; });
    }
    if (inp) { let tm; inp.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { st.busca = inp.value; desenhar(); }, 200); }; }
    desenhar(); container.appendChild(box); return box;
  }
  const script = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { s.remove(); no(new Error('Não foi possível carregar ' + src)); }; document.head.appendChild(s); });
  const MUN = ((typeof CONFIG !== 'undefined' && CONFIG.PCE && CONFIG.PCE.municipios) || []).slice();
  const municipioNome = n => MUN.find(m => norm(m) === norm(String(n || '').replace(/\s*[-/]\s*AM$/i, ''))) || '';

  /* ---------------- dados do convênio (uma carga, compartilhada pelas abas) ---------------- */
  async function dados(forcar) {
    if (S.dados && !forcar) return S.dados;
    if (!S.carregando || forcar) S.carregando = chamar({ action: 'admDados' }).then(d => { S.dados = d; return d; }).finally(() => { S.carregando = null; });
    return S.carregando;
  }

  /* ---------------- abas ---------------- */
  function registrarAba(a) { S.abas.push(a); }
  function desenharAbas() {
    const nav = $('#adm-abas');
    if (!S.abas.some(a => a.id === S.aba)) S.aba = S.abas[0].id;
    nav.innerHTML = S.abas.map(a => `<button type="button" class="pn-aba" role="tab" data-aba="${a.id}" aria-selected="${a.id === S.aba}">${esc(a.titulo)}</button>`).join('');
  }
  function irPara(id) { S.aba = id; ls.set(LS_ABA, id); desenharAbas(); renderAba(); }
  function renderAba() {
    const c = $('#adm-conteudo'); c.innerHTML = '';
    const a = S.abas.find(x => x.id === S.aba); if (!a) return;
    try { a.render(c); } catch (e) { c.appendChild(el('p', 'pn-erro', esc('Falha ao abrir: ' + e.message))); }
  }

  /* ---------------- login e sessão ---------------- */
  function mostrar(qual) {
    $('#adm-login').hidden = qual !== 'login'; $('#adm-app').hidden = qual !== 'app'; $('#adm-usuario').hidden = qual !== 'app';
  }
  function erroLogin(msg) { const e = $('#adm-login-erro'); e.textContent = msg || ''; e.hidden = !msg; }
  function entrou(j) {
    S.sessao = j.sessao; S.nome = j.nome; S.email = j.email;
    ls.set(LS_SESSAO, j.sessao); ls.set(LS_NOME, j.nome); ls.set(LS_EMAIL, j.email || ''); ls.del(LS_MSG);
    iniciarApp();
  }
  async function entrarGoogle(credencial) {
    erroLogin('');
    try { entrou(await api({ action: 'admLogin', idToken: credencial })); }
    catch (e) { erroLogin(e.message); }
  }
  async function entrarCodigo(ev) {
    ev.preventDefault(); erroLogin('');
    const b = $('#adm-entrar'); b.disabled = true;
    try { entrou(await api({ action: 'admCodigo', codigo: $('#adm-codigo').value })); }
    catch (e) { erroLogin(e.message); }
    finally { b.disabled = false; }
  }
  function prepararGoogle() {
    const id = typeof CONFIG !== 'undefined' && CONFIG.adm && CONFIG.adm.googleClientId;
    const box = $('#adm-google');
    if (!id) { box.hidden = true; $('#adm-cod-box').open = true; return; }
    box.hidden = false;
    const iniciar = () => {
      try {
        google.accounts.id.initialize({ client_id: id, callback: r => entrarGoogle(r && r.credential), auto_select: false, cancel_on_tap_outside: true });
        google.accounts.id.renderButton($('#adm-google-btn'), { type: 'standard', theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'filled_black' : 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'pt-BR', width: 280 });
      } catch (e) { erroLogin('Não foi possível iniciar o login com o Google: ' + e.message); $('#adm-cod-box').open = true; }
    };
    if (window.google && window.google.accounts && window.google.accounts.id) iniciar();
    else script('https://accounts.google.com/gsi/client').then(iniciar).catch(() => { erroLogin('Sem acesso ao login do Google agora (verifique a internet). Use o código de ativação.'); $('#adm-cod-box').open = true; });
  }
  /** Sessão encerrada pelo servidor (expirada, revogada) ou pelo botão Sair. */
  function encerrar(msg) {
    S.sessao = ''; S.dados = null; ls.del(LS_SESSAO);
    if (msg) ls.set(LS_MSG, msg);
    mostrar('login'); erroLogin(msg || ''); prepararGoogle();
  }
  async function sair() {
    const s = S.sessao;
    if (s) { try { await api({ action: 'admSair', sessao: s }); } catch (e) { /* sai mesmo assim */ } }
    try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) { /* */ }
    encerrar('');
  }
  function iniciarApp() {
    mostrar('app');
    $('#adm-nome').textContent = S.nome + (S.email ? ` (${S.email})` : '');
    $('#adm-status').innerHTML = '<span class="pn-ponto"></span>Lançamentos gravados direto na planilha do e-GDV';
    desenharAbas(); renderAba();
  }
  function iniciar() {
    registrarAba({ id: 'historico', titulo: 'Histórico', render: c => carregarHist(c) });     // sempre a última aba
    $('#adm-cod-form').addEventListener('submit', entrarCodigo);
    $('#adm-codigo').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
    $('#adm-sair').onclick = sair;
    $('#adm-abas').addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (b) irPara(b.dataset.aba); });
    if (S.sessao) iniciarApp();
    else { mostrar('login'); prepararGoogle(); const m = ls.get(LS_MSG); if (m) erroLogin(m); }
  }

  /* ---------------- aba Histórico ---------------- */
  const ABAS_HIST = { ConvFinanceiro: 'Desembolso', ConvLancamentos: 'Físico do convênio', RelGdvLancamentos: 'Linhas dos relatórios', VigLancamentos: 'VIGIFITO' };
  const H = { aba: '', lista: null, erro: '' };
  async function carregarHist(c) {
    H.erro = ''; H.lista = null; desenharHist(c);
    try { H.lista = (await chamar({ action: 'admHistorico', aba: H.aba })).historico; } catch (e) { H.erro = e.message; }
    desenharHist(c);
  }
  function desenharHist(c) {
    c.innerHTML = '';
    const s = secao(c, 'Histórico de alterações', 'Últimas 300 alterações feitas no portal: quem, quando, o que havia antes e o que ficou. Exclusões são lógicas.');
    const f = el('div', 'pn-cartao adm-filtro'); f.innerHTML = `<label class="pn-conv-campo">Lançamento<select id="adm-hist-aba"><option value="">Todos</option>${Object.entries(ABAS_HIST).map(([k, t]) => `<option value="${k}" ${H.aba === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    f.querySelector('select').onchange = e => { H.aba = e.target.value; carregarHist(c); };
    s.appendChild(f);
    if (H.erro) { s.appendChild(el('p', 'pn-erro', esc(H.erro))); return; }
    if (!H.lista) { vazio(s, 'Carregando…'); return; }
    const resumo = v => { if (!v) return '—'; try { const o = JSON.parse(v); if (o && typeof o === 'object' && !Array.isArray(o)) return Object.entries(o).filter(([k, x]) => x !== '' && x != null && !/^(id|criadoEm|atualizadoEm|convenio|admId)$/.test(k)).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · ').slice(0, 300); } catch (e) { /* texto */ } return String(v).slice(0, 300); };
    tabela(s, [{ chave: 'em', rotulo: 'Quando', fmt: fmt.dataHora }, { chave: 'nome', rotulo: 'Quem' }, { chave: 'acao', rotulo: 'Ação' },
      { chave: 'aba', rotulo: 'Lançamento', fmt: v => ABAS_HIST[v] || v }, { chave: 'registro', rotulo: 'Registro' },
      { chave: 'antes', rotulo: 'Antes', fmt: resumo }, { chave: 'depois', rotulo: 'Depois', fmt: resumo }], H.lista, { id: 'hist', csv: 'portal-administrativo-historico.csv', limite: 50, vazio: 'Nenhuma alteração registrada.' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else setTimeout(iniciar, 0);

  return { chamar, api, el, esc, norm, fmt, secao, vazio, kpis, alertas, tabela, csvTexto, csvBaixar, baixar, script, registrarAba, irPara, dados, ls,
    municipios: MUN, municipioNome, hoje: () => diaManaus(Date.now()), diaManaus, horaManaus,
    get usuario() { return S.nome; }, get email() { return S.email; }, get logado() { return !!S.sessao; }, get aba() { return S.aba; },
    renderAba, recarregar: () => dados(true).then(renderAba), encerrar };
})();
