/* Dashboard público do e-GDV (web/dashboard/): sem login. Lê a action pública "publicoDados" do Code.gs, que devolve SÓ agregados
   dos blocos que o gerente ligou no painel (aba "Dashboard público"). Dois modos: Mapa (Leaflet, municípios do AM, BVAs fixas,
   calor e — se ligado — barreiras fixas em andamento) e Números (KPIs e gráficos Chart.js com tabela de dados).
   Modo lembrado no aparelho e na URL (?modo=mapa|numeros); período entre os liberados. Atualiza sozinho a cada 5 min com a aba
   visível (a cada 1 min se "barreiras em andamento agora" estiver ligado). Sem servidor: mostra os últimos dados guardados
   no navegador, com a data. ?previa=1 (botão do painel): pré-visualização com a credencial de administrador deste navegador. */
(() => {
  'use strict';
  const LS_MODO = 'gdv.dashboard.modo', LS_PER = 'gdv.dashboard.periodo', LS_CACHE = 'gdv.dashboard.cache', LS_IV = 'gdv.dashboard.intervalo';
  const ATUALIZAR_MS = 5 * 60 * 1000, VIVO_MS = 60 * 1000, API_TEMPO_MS = 45 * 1000;
  const AM_LIMITES = [[-9.9, -73.9], [2.3, -56.0]];
  const $ = s => document.querySelector(s);
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
               set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } } };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const NF = new Intl.NumberFormat('pt-BR'), NF1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const DTF = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Manaus', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const fmt = {
    int: v => typeof v === 'string' ? v : v == null || isNaN(v) ? '—' : NF.format(Math.round(v)),
    num: v => v == null || isNaN(v) ? '—' : NF1.format(v),
    dataHora: ms => ms ? DTF.format(new Date(ms)).replace(',', '') : '—',
    data: s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; }
  };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const CFG = typeof CONFIG !== 'undefined' ? CONFIG : {};
  const TIPOS = CFG.tipos || {};
  const PROC = Object.assign({ liberacao: 'Liberação', apreensao: 'Apreensão p/ destruição', rechaco: 'Rechaço (retorno à origem)' }, (CFG.TF && CFG.TF.procedimentos) || {});
  const q = new URLSearchParams(location.search);
  const PREVIA = q.get('previa') === '1';

  const S = { r: null, modo: '', periodo: ls.get(LS_PER) || '', carregando: false, ultima: 0, graficos: [], mapa: null, municipio: '', camadas: null, indicador: '', geo: null, mun: [], offline: '' };
  const pedidoModo = q.get('modo');
  S.modo = pedidoModo === 'mapa' || pedidoModo === 'numeros' ? pedidoModo : (ls.get(LS_MODO) || 'mapa');

  /* ---------- paleta (tokens do painel.css; acompanha claro/escuro) ---------- */
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const escuro = () => matchMedia('(prefers-color-scheme: dark)').matches;
  const paleta = () => ({ serie: [1, 2, 3, 4, 5, 6, 7, 8].map(i => css('--s' + i)), seq: [1, 2, 3, 4, 5].map(i => css('--q' + i)),
    sf: css('--sf'), sf2: css('--sf2'), ink: css('--ink'), ink2: css('--ink2'), eixo: css('--eixo'), grade: css('--grade'), base: css('--base'),
    critico: css('--critico'), atencao: css('--atencao'), bom: css('--bom'),
    mapa: { fundo: css('--mapa-fundo'), terra: css('--mapa-terra'), linha: css('--mapa-linha') },
    calor: { 0.25: '#f9c7ae', 0.5: '#f29466', 0.75: '#eb6834', 1: '#a8360f' } });
  const alfa = (hex, a) => { const h = String(hex).replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

  /* ---------- API ---------- */
  const urlApi = () => { const o = (CFG.sync && CFG.sync.url) || ''; return (o && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? o : ls.get('gdv.url') || o) || ''; };   // oficial primeiro (ver painel.js)
  async function api(corpo) {
    const url = urlApi(); if (!url) throw Object.assign(new Error('Endereço do servidor não configurado.'), { rede: true });
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), API_TEMPO_MS);
    let r, j;
    try {
      try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo), redirect: 'follow', signal: ctl.signal }); }
      catch (e) { throw Object.assign(new Error('Sem conexão com o servidor.'), { rede: true }); }
      try { j = await r.json(); } catch (e) { throw Object.assign(new Error('Resposta inválida do servidor.'), { rede: true }); }
    } finally { clearTimeout(t); }
    return j;
  }

  /* ---------- guardado no navegador (últimos dados de cada período) ---------- */
  const lerGuardado = () => { try { return JSON.parse(ls.get(LS_CACHE) || '{}') || {}; } catch (e) { return {}; } };
  function guardar(r) {
    if (PREVIA || !r || !r.periodo) return;
    const g = lerGuardado(); g[r.periodo.chave] = { r, salvoEm: Date.now() }; g.ultimo = r.periodo.chave;
    ls.set(LS_CACHE, JSON.stringify(g));
  }

  /* ---------- intervalo escolhido pelo visitante (de/até) ---------- */
  const lerIntervalo = () => { try { const o = JSON.parse(ls.get(LS_IV) || '{}') || {}; return { de: String(o.de || ''), ate: String(o.ate || '') }; } catch (e) { return { de: '', ate: '' }; } };
  function avisoIntervalo(msg) { const a = $('#db-iv-aviso'); if (a) { a.textContent = msg || ''; a.hidden = !msg; } }
  function desenharIntervalo(r) {
    const box = $('#db-intervalo'); if (!box) return;
    const tem = (r.periodos || []).some(p => p.chave === 'intervalo');
    box.hidden = !(tem && S.periodo === 'intervalo' || tem && S.editandoIv);
    if (box.hidden) return;
    const iv = lerIntervalo(), hoje = r.hoje || (r.periodo && r.periodo.ate) || '';
    box.innerHTML = `<label>De<input type="date" id="db-iv-de" max="${esc(hoje)}" value="${esc(iv.de)}"></label>
      <label>Até<input type="date" id="db-iv-ate" max="${esc(hoje)}" value="${esc(iv.ate || hoje)}"></label>
      <button type="button" class="pn-btn pn-btn-prim" id="db-iv-ok">Aplicar</button><p class="db-iv-aviso" id="db-iv-aviso" role="alert" hidden></p>`;
  }

  /* ---------- carga ---------- */
  async function carregar(auto) {
    if (S.carregando) return; S.carregando = true;
    try {
      const corpo = { action: 'publicoDados' };
      if (S.periodo) corpo.periodo = S.periodo;
      if (S.periodo === 'intervalo') { const iv = lerIntervalo(); corpo.de = iv.de; corpo.ate = iv.ate; }
      if (PREVIA) { corpo.previa = true; corpo.key = ls.get('gdv.painel.token') || ''; }
      let j = await api(corpo);
      if (j && !j.ok && j.intervaloInvalido) { avisoIntervalo(j.erro); return; }   // datas do intervalo recusadas: fica na tela atual com o aviso
      if (j && !j.ok && Array.isArray(j.periodos) && j.periodos.length) {          // período deixou de ser liberado: volta ao primeiro
        S.periodo = j.periodos[0].chave; corpo.periodo = S.periodo; j = await api(corpo);
      }
      if (!j || !j.ok) throw Object.assign(new Error((j && j.erro) || 'Erro no servidor.'), { servidor: true });
      S.ultima = Date.now(); S.offline = '';
      if (!j.ativo && !j.previa) { S.r = null; indisponivel(); return; }
      S.r = j; S.periodo = j.periodo.chave; ls.set(LS_PER, S.periodo);
      guardar(j);
      desenhar(!!auto);
    } catch (e) {
      S.ultima = Date.now();
      if (e.servidor && PREVIA) { falha(e.message); return; }
      const g = lerGuardado(), x = g[S.periodo] || g[g.ultimo];
      if (x && x.r) {
        S.r = x.r; S.periodo = x.r.periodo.chave;
        S.offline = `${e.rede ? 'Sem conexão com o servidor' : 'O servidor não respondeu (' + e.message + ')'} — exibindo os últimos dados guardados neste aparelho (atualizados em ${fmt.dataHora(x.r.atualizadoEm || x.salvoEm)}). Nova tentativa em instantes.`;
        desenhar(!!auto);
      } else falha(e.rede ? 'Não foi possível falar com o servidor agora. Verifique a internet; a página tenta de novo sozinha.' : e.message);
    } finally { S.carregando = false; }
  }
  function limparGraficos() { S.graficos.forEach(g => { try { g.destroy(); } catch (e) { /* ok */ } }); S.graficos = []; if (S.obsMapa) { S.obsMapa.disconnect(); S.obsMapa = null; } if (S.mapa) { try { S.mapa.remove(); } catch (e) { /* ok */ } S.mapa = null; } }
  function indisponivel() {
    limparGraficos();
    $('#db-controles').hidden = true; $('#db-status').textContent = ''; $('#db-texto').textContent = ''; faixas();
    $('#db-corpo').innerHTML = `<div class="pn-cartao db-indisp" id="db-indisponivel"><h2>Dashboard temporariamente indisponível</h2>
      <p>Os números públicos da ADAF/AM não estão sendo exibidos no momento. Tente novamente mais tarde.</p></div>`;
  }
  function falha(msg) {
    limparGraficos(); faixas();
    $('#db-corpo').innerHTML = `<div class="pn-cartao db-indisp" role="alert"><h2>Não foi possível carregar os números</h2><p>${esc(msg)}</p>
      <p><button type="button" class="pn-btn pn-btn-prim" id="db-tentar">Tentar de novo</button></p></div>`;
    $('#db-tentar').onclick = () => carregar();
  }
  function faixas() {
    const pv = $('#db-previa'), off = $('#db-offline');
    pv.hidden = !(PREVIA && S.r); if (S.r && PREVIA) pv.textContent = S.r.ativo ? 'Pré-visualização (o dashboard está publicado; é isto que o público vê).' : 'Pré-visualização — o dashboard NÃO está publicado. Só quem tem acesso ao painel vê esta página.';
    off.hidden = !S.offline; off.textContent = S.offline;
  }

  /* ---------- desenho geral ---------- */
  const ICONES = {
    mapa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/></svg>',
    numeros: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'
  };
  function modosLiberados() { const m = (S.r && S.r.modos) || {}; return ['mapa', 'numeros'].filter(k => m[k]); }
  function desenhar(auto) {
    const r = S.r; if (!r) return;
    document.title = `${r.titulo || 'Dashboard público'} — ADAF/AM`;
    $('#db-titulo').textContent = r.titulo || 'Dashboard público';
    $('#db-texto').textContent = r.texto || '';
    faixas();
    const modos = modosLiberados();
    if (!modos.includes(S.modo)) S.modo = modos[0] || 'numeros';
    $('#db-controles').hidden = false;
    $('#db-modos').hidden = modos.length < 2;
    $('#db-modos').innerHTML = modos.map(k => `<button type="button" role="tab" class="db-modo" id="db-modo-${k}" data-modo="${k}" aria-selected="${k === S.modo}" aria-controls="db-corpo" tabindex="${k === S.modo ? 0 : -1}">${ICONES[k]}${k === 'mapa' ? 'Mapa' : 'Números'}</button>`).join('');
    $('#db-corpo').setAttribute('aria-labelledby', 'db-modo-' + S.modo);
    $('#db-periodos').innerHTML = (r.periodos || []).map(p => `<button type="button" class="pn-chip" data-periodo="${esc(p.chave)}" aria-pressed="${p.chave === S.periodo}">${esc(p.chave === 'intervalo' ? 'Intervalo…' : p.rotulo)}</button>`).join('');
    desenharIntervalo(r);
    $('#db-status').innerHTML = `<b>${esc(r.periodo.rotulo)}</b> (${fmt.data(r.periodo.de) === '01/01/2000' ? 'todos os registros' : fmt.data(r.periodo.de) + ' a ' + fmt.data(r.periodo.ate)}) · Atualizado em ${esc(fmt.dataHora(r.atualizadoEm))}` +
      (r.supressao ? ` · contagens de 1 a ${r.supressao - 1} por município aparecem como “&lt;${r.supressao}”` : '');
    const u = new URL(location.href); if (u.searchParams.get('modo') !== S.modo) { u.searchParams.set('modo', S.modo); try { history.replaceState(null, '', u); } catch (e) { /* file:// */ } }
    const y = window.scrollY;
    limparGraficos();
    const c = $('#db-corpo'); c.innerHTML = '';
    const erro = e => { console.error(e); c.insertAdjacentHTML('beforeend', `<div class="pn-cartao pn-falha" role="alert">Erro ao montar a página: ${esc(e.message)}</div>`); };
    try { if (S.modo === 'mapa') renderMapa(c, r, auto).catch(erro); else renderNumeros(c, r, auto); }
    catch (e) { erro(e); }
    if (auto) window.scrollTo(0, y);
  }
  function trocarModo(m) { if (m === S.modo) return; S.modo = m; ls.set(LS_MODO, m); desenhar(); const b = $('#db-modo-' + m); if (b) b.focus(); }

  /* ---------- helpers de layout ---------- */
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  function secao(c, titulo, sub) { const s = el('section', 'db-sec'); s.appendChild(el('h2', null, esc(titulo))); if (sub) s.appendChild(el('p', 'pn-sub', esc(sub))); c.appendChild(s); return s; }
  function kpis(c, itens) {
    const g = el('div', 'pn-kpis');
    itens.filter(Boolean).forEach(k => {
      const d = el('div', 'pn-kpi' + (k.status ? ' pn-st-' + k.status : '')); d.dataset.kpi = k.chave;
      d.innerHTML = `<div class="pn-kpi-rot">${esc(k.rotulo)}</div><div class="pn-kpi-val">${esc(typeof k.valor === 'number' ? fmt.int(k.valor) : k.valor)}</div>${k.detalhe ? `<div class="pn-kpi-det">${esc(k.detalhe)}</div>` : ''}`;
      g.appendChild(d);
    });
    if (g.children.length) c.appendChild(g);
    return g;
  }
  function tabelaHTML(cols, linhas) {
    return `<div class="pn-tab"><div class="pn-tab-rolo"><table><thead><tr>${cols.map(c => `<th scope="col" class="${c.num ? 'num' : ''}">${esc(c.rotulo)}</th>`).join('')}</tr></thead><tbody>` +
      linhas.map(l => `<tr>${cols.map(c => `<td class="${c.num ? 'num' : ''}">${esc(c.fmt ? c.fmt(l[c.chave], l) : l[c.chave])}</td>`).join('')}</tr>`).join('') + '</tbody></table></div></div>';
  }

  /* ---------- gráficos (mesmo tema do painel: marcas finas, barras com ponta arredondada, grade recessiva) ---------- */
  function temaChart() {
    const p = paleta();
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; Chart.defaults.font.size = 12;
    Chart.defaults.color = p.ink2; Chart.defaults.borderColor = p.grade; Chart.defaults.maintainAspectRatio = false; Chart.defaults.responsive = true;
    Object.assign(Chart.defaults.plugins.tooltip, { backgroundColor: p.sf, titleColor: p.ink2, bodyColor: p.ink, borderColor: p.base, borderWidth: 1, padding: 10, cornerRadius: 8, boxWidth: 10, boxHeight: 10 });
    Object.assign(Chart.defaults.plugins.legend.labels, { boxWidth: 12, boxHeight: 12, color: p.ink2 });
    return p;
  }
  /**
   * Cartão com gráfico de barras/linha + "Ver dados" (tabela; o tooltip nunca é o único caminho para o valor).
   * o: {id, titulo, sub, tipo, horizontal, rotulos, series:[{rotulo, dados, cor}], empilhado, tabela:{cols, linhas}, altura, vazio}
   */
  function grafico(c, o) {
    const card = el('div', 'pn-cartao pn-graf'); card.dataset.grafico = o.id;
    const cab = el('div', 'pn-graf-cab'), tt = el('div'); tt.appendChild(el('h3', null, esc(o.titulo))); if (o.sub) tt.appendChild(el('p', 'pn-sub', esc(o.sub)));
    cab.appendChild(tt); card.appendChild(cab); c.appendChild(card);
    const total = o.series.reduce((s, x) => s + x.dados.reduce((a, v) => a + (v || 0), 0), 0);
    if (!o.rotulos.length || (!total && o.tipo !== 'line')) { card.appendChild(el('div', 'pn-vazio', esc(o.vazio || 'Sem registros no período.'))); return null; }
    const btn = el('button', 'pn-link', 'Ver dados'); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false'); cab.appendChild(btn);
    const p = temaChart(), n = o.rotulos.length, horiz = !!o.horizontal;
    const area = el('div', 'pn-graf-area'); area.style.height = (o.altura || (horiz ? Math.max(150, Math.min(560, n * (o.series.length > 1 && !o.empilhado ? 32 : 28) + 60)) : 240)) + 'px';
    const cv = el('canvas'); cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', `${o.titulo}: ` + o.rotulos.slice(0, 12).map((r, i) => `${r} ${o.series.map(s => fmt.int(s.dados[i])).join(' / ')}`).join('; ') + (n > 12 ? '…' : ''));
    area.appendChild(cv); card.appendChild(area);
    const ds = o.series.map((s, i) => {
      const cor = s.cor || p.serie[i];
      return o.tipo === 'line'
        ? { label: s.rotulo, data: s.dados, borderColor: cor, backgroundColor: alfa(cor, 0.1), borderWidth: 2, pointRadius: n > 40 ? 0 : 3, pointHoverRadius: 5, pointBackgroundColor: cor, pointBorderColor: p.sf, pointBorderWidth: 2, tension: 0, fill: false }
        : { label: s.rotulo, data: s.dados, backgroundColor: Array.isArray(s.cores) ? s.cores : cor, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 26,
            borderWidth: o.empilhado ? { top: 2, right: 2 } : 0, borderColor: p.sf };
    });
    const vAx = horiz ? 'x' : 'y', cAx = horiz ? 'y' : 'x', scales = {};
    scales[vAx] = { beginAtZero: true, stacked: !!o.empilhado, grid: { color: p.grade, drawTicks: false }, border: { display: false }, ticks: { color: p.eixo, padding: 6, precision: 0, callback: v => fmt.int(v) } };
    scales[cAx] = { stacked: !!o.empilhado, grid: { display: false }, border: { color: p.base }, ticks: { color: p.eixo, autoSkip: true, maxRotation: 0, autoSkipPadding: 10 } };
    const lim = card.clientWidth < 480 ? 15 : 24;   // celular: rótulo curto (o nome inteiro fica no tooltip e em "Ver dados")
    if (horiz) scales.y.ticks.callback = function (v) { const l = String(this.getLabelForValue(v)); return l.length > lim ? l.slice(0, lim - 1) + '…' : l; };
    const ch = new Chart(cv, { type: o.tipo === 'line' ? 'line' : 'bar', data: { labels: o.rotulos, datasets: ds },
      options: { indexAxis: horiz ? 'y' : 'x', animation: S.animar === false ? false : { duration: 300 }, scales,
        interaction: { mode: 'index', intersect: false, axis: horiz ? 'y' : 'x' },
        plugins: { legend: { display: o.series.length > 1, position: 'top', align: 'start' },
          tooltip: { callbacks: { label: x => `${x.dataset.label}: ${fmt.int(x.parsed[vAx])}${o.sufixo ? ' ' + o.sufixo(x.dataIndex) : ''}` } } } } });
    S.graficos.push(ch);
    let tab = null;
    btn.onclick = () => {
      if (tab) { tab.remove(); tab = null; btn.textContent = 'Ver dados'; btn.setAttribute('aria-expanded', 'false'); return; }
      const t = o.tabela || { cols: [{ chave: 'r', rotulo: o.rotuloCategoria || 'Categoria' }].concat(o.series.map((s, i) => ({ chave: 'v' + i, rotulo: s.rotulo, num: true, fmt: fmt.int }))),
        linhas: o.rotulos.map((r, j) => { const l = { r }; o.series.forEach((s, i) => { l['v' + i] = s.dados[j]; }); return l; }) };
      tab = el('div', 'pn-graf-dados', tabelaHTML(t.cols, t.linhas)); card.appendChild(tab); btn.textContent = 'Ocultar dados'; btn.setAttribute('aria-expanded', 'true');
    };
    return ch;
  }

  /* ---------- modo Números ---------- */
  function renderNumeros(c, r, auto) {
    S.animar = !auto;
    const N = r.numeros || {}, B = r.blocos || {}, tem = k => N[k] != null;
    let algo = false;
    // Barreiras
    if (['acoes', 'horas', 'veiculos', 'pessoas', 'porBarreira', 'tiposVeiculo'].some(tem)) {
      algo = true;
      const s = secao(c, 'Barreiras fitossanitárias', 'Educação sanitária e fiscalização do trânsito de vegetais nas barreiras fixas (BVAs) e nos postos volantes.');
      kpis(s, [tem('acoes') && { chave: 'acoes', rotulo: 'Ações de barreira (turnos)', valor: N.acoes },
        tem('horas') && { chave: 'horas', rotulo: 'Horas de barreira', valor: N.horas },
        tem('veiculos') && { chave: 'veiculos', rotulo: 'Veículos abordados', valor: N.veiculos, detalhe: tem('horas') && N.horas ? `${fmt.num(N.veiculos / N.horas)} por hora de barreira` : null },
        tem('pessoas') && { chave: 'pessoas', rotulo: 'Pessoas orientadas', valor: N.pessoas, detalhe: 'educação sanitária (estimativa por veículo)' }]);
      const g = el('div', 'db-grade'); s.appendChild(g);
      if (tem('porBarreira')) {
        const L = N.porBarreira, campo = L.some(b => b.veiculos != null) ? 'veiculos' : 'acoes';
        grafico(g, { id: 'porBarreira', titulo: campo === 'veiculos' ? 'Veículos abordados por barreira' : 'Ações por barreira', sub: 'BVAs fixas; os postos volantes aparecem somados.', horizontal: true,
          rotulos: L.map(b => b.local), series: [{ rotulo: campo === 'veiculos' ? 'Veículos' : 'Ações', dados: L.map(b => b[campo] || 0) }], rotuloCategoria: 'Barreira',
          tabela: { cols: [{ chave: 'local', rotulo: 'Barreira' }].concat(L.some(b => b.acoes != null) ? [{ chave: 'acoes', rotulo: 'Ações (turnos)', num: true, fmt: fmt.int }] : [], L.some(b => b.veiculos != null) ? [{ chave: 'veiculos', rotulo: 'Veículos', num: true, fmt: fmt.int }] : []), linhas: L } });
      }
      if (tem('tiposVeiculo')) {
        const L = N.tiposVeiculo.slice(0, 8);
        grafico(g, { id: 'tiposVeiculo', titulo: 'Veículos abordados por tipo', horizontal: true, rotulos: L.map(t => (TIPOS[t.tipo] && TIPOS[t.tipo].nome) || (t.tipo === 'OUTRO' ? 'Não informado' : t.tipo)),
          series: [{ rotulo: 'Veículos', dados: L.map(t => t.n) }], rotuloCategoria: 'Tipo' });
      }
      if (!g.children.length) g.remove();
    }
    // TF
    if (['tfs', 'procedimentos', 'autos', 'produtos'].some(tem)) {
      algo = true;
      const s = secao(c, 'Termos de Fiscalização de Barreira (TF)', 'Termos lavrados nas barreiras; cancelados não entram.');
      const P = N.procedimentos || {};
      kpis(s, [tem('tfs') && { chave: 'tfs', rotulo: 'TFs lavrados', valor: N.tfs },
        tem('procedimentos') && { chave: 'liberacao', rotulo: 'Liberações', valor: P.liberacao || 0 },
        tem('procedimentos') && { chave: 'apreensao', rotulo: 'Apreensões p/ destruição', valor: P.apreensao || 0 },
        tem('procedimentos') && { chave: 'rechaco', rotulo: 'Rechaços (retorno à origem)', valor: P.rechaco || 0 },
        tem('autos') && { chave: 'autos', rotulo: 'Autos de infração', valor: N.autos }]);
      const g = el('div', 'db-grade'); s.appendChild(g);
      if (tem('procedimentos')) {
        const ks = ['liberacao', 'apreensao', 'rechaco'].concat(P.outro ? ['outro'] : []), p = paleta();
        grafico(g, { id: 'procedimentos', titulo: 'TFs por procedimento', horizontal: true, rotulos: ks.map(k => k === 'outro' ? 'Não informado' : PROC[k]),
          series: [{ rotulo: 'TFs', dados: ks.map(k => P[k] || 0), cores: ks.map((k, i) => p.serie[i]) }], rotuloCategoria: 'Procedimento' });
      }
      if (tem('produtos')) {
        const L = N.produtos.slice(0, 10);
        grafico(g, { id: 'produtos', titulo: 'Produtos mais apreendidos', sub: 'Número de apreensões em que o produto aparece; quantidades na tabela (Ver dados).', horizontal: true,
          rotulos: L.map(x => x.produto + (x.unidade ? ` (${x.unidade})` : '')), series: [{ rotulo: 'Apreensões', dados: L.map(x => x.tfs), cor: paleta().serie[1] }],
          sufixo: i => `· ${fmt.num(L[i].quantidade)} ${L[i].unidade || ''}`.trim(),
          tabela: { cols: [{ chave: 'produto', rotulo: 'Produto' }, { chave: 'tfs', rotulo: 'Apreensões', num: true, fmt: fmt.int }, { chave: 'quantidade', rotulo: 'Quantidade', num: true, fmt: fmt.num }, { chave: 'unidade', rotulo: 'Unidade' }], linhas: N.produtos },
          vazio: 'Nenhuma apreensão no período.' });
      }
      if (!g.children.length) g.remove();
    }
    // PCE
    if (['levantamentos', 'municipiosCobertos', 'deteccoes', 'amostras'].some(tem)) {
      algo = true;
      const s = secao(c, 'Vigilância fitossanitária (PCE)', 'Levantamentos de pragas e doenças nas propriedades (Programa de Controle e Erradicação). Suspeita conta como detecção.');
      kpis(s, [tem('levantamentos') && { chave: 'levantamentos', rotulo: 'Levantamentos fitossanitários', valor: N.levantamentos },
        tem('municipiosCobertos') && { chave: 'municipios', rotulo: 'Municípios com levantamento', valor: `${fmt.int(N.municipiosCobertos)} de ${fmt.int(N.municipiosTotal || 62)}` },
        tem('deteccoes') && { chave: 'deteccoes', rotulo: 'Detecções de pragas', valor: N.deteccoes, status: N.deteccoes ? 'critico' : null, detalhe: `${fmt.int(N.suspeitas)} suspeita(s) · ${fmt.int(N.levNegativos)} levantamento(s) sem detecção` },
        tem('amostras') && { chave: 'amostras', rotulo: 'Amostras colhidas', valor: N.amostras },
        tem('amostras') && { chave: 'termos', rotulo: 'Termos de colheita', valor: N.termos }]);
      if (tem('deteccoes')) {
        const g = el('div', 'db-grade'); s.appendChild(g); const L = N.pragas.slice(0, 12), p = paleta();
        grafico(g, { id: 'pragas', titulo: 'Detecções e suspeitas por praga', horizontal: true, empilhado: true, rotulos: L.map(x => x.praga || 'Não informada'),
          series: [{ rotulo: 'Detectada', dados: L.map(x => x.deteccoes - x.suspeitas), cor: p.serie[1] }, { rotulo: 'Suspeita', dados: L.map(x => x.suspeitas), cor: p.serie[3] }],
          tabela: { cols: [{ chave: 'praga', rotulo: 'Praga/doença' }, { chave: 'deteccoes', rotulo: 'Detecções (inclui suspeitas)', num: true, fmt: fmt.int }, { chave: 'suspeitas', rotulo: 'Suspeitas', num: true, fmt: fmt.int }, { chave: 'municipios', rotulo: 'Municípios', num: true, fmt: fmt.int }], linhas: N.pragas },
          vazio: 'Nenhuma praga detectada no período.' });
      }
    }
    // Evolução (pequenos múltiplos: um eixo por gráfico, nunca dois)
    if (N.serie && N.serie.pontos && N.serie.pontos.length) {
      algo = true;
      const se = N.serie, mes = se.passo === 'mes';
      const s = secao(c, mes ? 'Evolução mensal' : 'Evolução diária', mes ? 'Total de cada mês.' : 'Total de cada dia do período.');
      const g = el('div', 'db-mini'); s.appendChild(g);
      const rot = se.pontos.map(x => mes ? `${MESES[+x.chave.slice(5, 7) - 1]}/${x.chave.slice(2, 4)}` : `${x.chave.slice(8, 10)}/${x.chave.slice(5, 7)}`);
      const NOMES = { veiculos: 'Veículos abordados', tfs: 'TFs lavrados', levantamentos: 'Levantamentos PCE' };
      const p = paleta(), COR = { veiculos: p.serie[0], tfs: p.serie[1], levantamentos: p.serie[2] };
      se.campos.forEach(k => grafico(g, { id: 'serie-' + k, titulo: NOMES[k], tipo: 'line', altura: 200, rotulos: rot, series: [{ rotulo: NOMES[k], dados: se.pontos.map(x => x[k] || 0), cor: COR[k] }], rotuloCategoria: mes ? 'Mês' : 'Dia' }));
    }
    if (!algo) c.appendChild(el('div', 'pn-cartao pn-vazio', 'Nenhum número foi liberado para exibição.'));
  }

  /* ---------- municípios (malha do painel) ---------- */
  async function carregarGeo() {
    if (S.geo) return S.geo;
    const r = await fetch('../painel/dados/am-municipios.json'); S.geo = await r.json();
    S.mun = S.geo.features.map(f => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
      polys.forEach(p => p[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
      return { nome: f.properties.name, chave: norm(f.properties.name), bbox: [x0, y0, x1, y1], polys };
    }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return S.geo;
  }
  const dentro = (x, y, anel) => { let d = false; for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) { const [xi, yi] = anel[i], [xj, yj] = anel[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d; } return d; };
  function municipioDe(lat, lon) {
    for (const m of S.mun) { if (lon < m.bbox[0] || lon > m.bbox[2] || lat < m.bbox[1] || lat > m.bbox[3]) continue;
      if (m.polys.some(p => dentro(lon, lat, p[0]) && !p.slice(1).some(b => dentro(lon, lat, b)))) return m.nome; }
    return null;
  }
  function municipioNome(txt) {
    if (!txt) return null;
    let k = norm(txt).replace(/\b(am|amazonas)$/, '').trim(); let m = S.mun.find(x => x.chave === k); if (m) return m.nome;
    k = norm(String(txt).split(/[\/,(-]/)[0]); m = S.mun.find(x => x.chave === k); return m ? m.nome : null;
  }

  /* ---------- modo Mapa ---------- */
  const INDICADORES = { veiculos: 'Veículos abordados', acoes: 'Ações de barreira', tfs: 'TFs lavrados', levantamentos: 'Levantamentos PCE', deteccoes: 'Detecções de pragas' };
  const valorNum = v => typeof v === 'number' ? v : (typeof v === 'string' && /^</.test(v) ? 0.5 : 0);   // "<3" fica na classe mais clara
  /** Soma por município: PCE pelo nome; barreiras pela célula (centro → município) ou pela unidade. */
  function porMunicipio(M) {
    const R = {}; let semMun = 0;
    const de = n => (R[n] = R[n] || {});
    (M.pce || []).forEach(x => { const n = municipioNome(x.municipio); if (!n) { semMun++; return; } const o = de(n); ['levantamentos', 'deteccoes'].forEach(k => { if (x[k] != null) o[k] = x[k]; }); });
    (M.barreiras || []).forEach(x => {
      const n = x.lat != null ? municipioDe(x.lat, x.lon) : municipioNome(x.unidade); if (!n) { semMun++; return; }
      const o = de(n); ['acoes', 'veiculos', 'tfs'].forEach(k => { if (x[k] != null) o[k] = (o[k] || 0) + x[k]; });
    });
    return { R, semMun };
  }
  async function renderMapa(c, r, auto) {
    const M = r.mapa || {};
    const lay = el('div', 'db-mapa-lay'); c.appendChild(lay);
    const card = el('div', 'pn-cartao pn-mapa'); lay.appendChild(card);
    const lado = el('div', 'db-lado'); lay.appendChild(lado);
    card.innerHTML = '<div class="pn-mapa-cab"><div><h2 class="db-h3">Mapa do Amazonas</h2><p class="pn-sub">62 municípios. Toque ou clique num município para ver os números dele.</p></div></div>';
    if (typeof L === 'undefined') { card.appendChild(el('div', 'pn-vazio', 'Biblioteca de mapas não carregada.')); return; }
    try { await carregarGeo(); } catch (e) { card.appendChild(el('div', 'pn-vazio', 'Não foi possível carregar os limites dos municípios.')); return; }
    if (S.r !== r || S.modo !== 'mapa' || !card.isConnected) return;                         // trocou no meio
    const p = paleta(), { R, semMun } = porMunicipio(M);
    const inds = Object.keys(INDICADORES).filter(k => r.blocos[k] && (k === 'levantamentos' || k === 'deteccoes' ? !!M.pce : !!M.barreiras));
    if (!inds.includes(S.indicador)) S.indicador = inds[0] || '';
    const camadas = [];
    if (inds.length) camadas.push(['coropletico', 'Municípios']);
    if (M.bvas) camadas.push(['bvas', 'BVAs fixas']);
    if (M.calor && L.heatLayer) camadas.push(['calor', 'Calor de detecções']);
    if (r.aoVivo) camadas.push(['aoVivo', 'Barreiras em andamento agora']);
    if (!S.camadas) S.camadas = new Set(camadas.map(x => x[0]).filter(k => k !== 'calor'));
    const ctrl = el('div', 'db-mapa-ctrl'); card.appendChild(ctrl);              // indicadores + camadas (no computador, numa faixa só)
    if (inds.length > 1) ctrl.insertAdjacentHTML('beforeend', `<div class="db-ind" role="group" aria-label="Indicador dos municípios">${inds.map(k => `<button type="button" class="pn-chip" data-ind="${k}" aria-pressed="${k === S.indicador}">${esc(INDICADORES[k])}</button>`).join('')}</div>`);
    if (camadas.length) ctrl.insertAdjacentHTML('beforeend', `<div class="db-camadas" role="group" aria-label="Camadas do mapa">${camadas.map(([k, t]) => `<label class="pn-chip"><input type="checkbox" data-camada="${k}" ${S.camadas.has(k) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>`);
    const div = el('div', 'pn-mapa-div pn-tiles-escuro'); div.id = 'db-mapa'; div.setAttribute('role', 'region'); div.setAttribute('aria-label', 'Mapa interativo do Amazonas'); card.appendChild(div);
    const leg = el('div', 'pn-legenda'); leg.id = 'db-legenda'; card.appendChild(leg);
    card.appendChild(el('p', 'db-fonte', `Fonte: e-GDV/ADAF · ${esc(r.periodo.rotulo)} · atualizado em ${esc(fmt.dataHora(r.atualizadoEm))}.` +
      (semMun ? ` ${fmt.int(semMun)} registro(s) sem município identificado (contam nos números).` : '') + ' Barreiras somadas pelo município onde o turno começou.'));

    const toque = matchMedia('(pointer: coarse)').matches;
    const map = S.mapa = L.map(div, { zoomSnap: 0.25, minZoom: 4, maxZoom: 12, scrollWheelZoom: false, dragging: !toque, tap: true });
    map.on('click focus', () => map.scrollWheelZoom.enable()); div.addEventListener('mouseleave', () => map.scrollWheelZoom.disable());
    map.attributionControl.setPrefix(false);
    if (S.vista) map.setView(S.vista.c, S.vista.z); else map.fitBounds(AM_LIMITES, { padding: [4, 4] });
    map.on('moveend', () => { S.vista = { c: map.getCenter(), z: map.getZoom() }; });
    card.insertBefore(el('p', 'pn-sub pn-mapa-dica', toque ? 'Use dois dedos para mover ou ampliar o mapa.' : 'Arraste para mover; clique no mapa para ampliar com a roda do mouse.'), leg);
    let tiles = null;
    const semTiles = () => { div.classList.add('pn-sem-tiles'); if (tiles && map.hasLayer(tiles)) map.removeLayer(tiles); if (munLayer) munLayer.setStyle(estilo); };
    if (Date.now() - (S.tilesFalharam || 0) < 10 * 60 * 1000) div.classList.add('pn-sem-tiles');
    else {
      tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' });
      let ok = 0, er = 0; tiles.on('tileload', () => { ok++; }); tiles.on('tileerror', () => { if (++er >= 2 && !ok) { S.tilesFalharam = Date.now(); semTiles(); } });
      tiles.addTo(map);
    }
    map.createPane('db-mun'); map.getPane('db-mun').style.zIndex = 350;
    let max = 0; const calcMax = () => { max = 0; Object.values(R).forEach(o => { const v = o[S.indicador]; if (typeof v === 'number') max = Math.max(max, v); }); };
    calcMax();
    const classe = v => { const n = valorNum(v); if (!n || !max) return n ? 0 : -1; return Math.min(4, Math.floor((n / max) * 5 - 1e-9)); };
    const estilo = f => {
      const k = S.camadas.has('coropletico') && S.indicador ? classe((R[f.properties.name] || {})[S.indicador]) : -1, sem = div.classList.contains('pn-sem-tiles');
      const sel = S.municipio === f.properties.name;
      if (sem) return { pane: 'db-mun', color: sel ? p.ink : p.mapa.linha, weight: sel ? 3 : 1, opacity: 1, fillColor: k >= 0 ? p.seq[k] : p.mapa.terra, fillOpacity: k >= 0 ? 0.88 : 1 };
      return { pane: 'db-mun', color: sel ? p.ink : (escuro() ? '#8d8c86' : '#5b5a56'), weight: sel ? 3 : 1, opacity: sel ? 1 : 0.8, fillColor: k >= 0 ? p.seq[k] : p.sf, fillOpacity: k >= 0 ? 0.8 : 0.04 };
    };
    const linhasMun = nome => { const o = R[nome] || {}; return inds.map(k => [INDICADORES[k], o[k] == null ? 0 : o[k]]); };
    const munLayer = L.geoJSON(S.geo, { style: estilo, pane: 'db-mun', onEachFeature: (f, ly) => {
      ly.bindTooltip(() => `<b>${esc(f.properties.name)}</b>` + linhasMun(f.properties.name).map(([t, v]) => `<br>${esc(t)}: ${esc(fmt.int(v))}`).join(''), { sticky: true });
      ly.on('click', () => selecionar(f.properties.name));
      ly.on('mouseover', () => ly.setStyle({ weight: 2.5, opacity: 1 })); ly.on('mouseout', () => munLayer.resetStyle(ly));
    } }).addTo(map);
    const grupos = {};
    if (M.bvas) {
      const g = grupos.bvas = L.layerGroup();
      const ic = L.divIcon({ className: '', html: '<div class="db-bva"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
      M.bvas.forEach(b => L.marker([b.lat, b.lon], { icon: ic, title: b.nome, alt: b.nome, keyboard: true, zIndexOffset: 500 })
        .bindTooltip(`<b>${esc(b.nome)}</b>${b.acoes != null ? '<br>Ações: ' + fmt.int(b.acoes) : ''}${b.veiculos != null ? '<br>Veículos: ' + fmt.int(b.veiculos) : ''}`).addTo(g));
    }
    if (M.calor && L.heatLayer) {
      const mx = Math.max(1, ...M.calor.map(x => x[2]));
      grupos.calor = L.heatLayer(M.calor.map(x => [x[0], x[1], x[2] / mx]), { radius: 28, blur: 22, maxZoom: 9, minOpacity: 0.35, gradient: p.calor });
    }
    if (r.aoVivo) {
      const g = grupos.aoVivo = L.layerGroup();
      const ic = L.divIcon({ className: '', html: '<div class="db-vivo"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
      (r.aoVivo.locais || []).filter(x => x.lat != null).forEach(x => L.marker([x.lat, x.lon], { icon: ic, title: `${x.nome}: em funcionamento agora`, alt: x.nome, keyboard: true, zIndexOffset: 1000 })
        .bindTooltip(`<b>${esc(x.nome)}</b><br>Em funcionamento agora${x.emAndamento > 1 ? ` (${x.emAndamento} equipes)` : ''}`).addTo(g));
    }
    const aplicar = () => {
      ['calor', 'bvas', 'aoVivo'].forEach(k => { const g = grupos[k]; if (!g) return; if (S.camadas.has(k)) { if (!map.hasLayer(g)) g.addTo(map); } else if (map.hasLayer(g)) map.removeLayer(g); });
      munLayer.setStyle(estilo); legenda();
    };
    function legenda() {
      const it = [];
      if (S.camadas.has('coropletico') && S.indicador) {
        const faixas = [0, 1, 2, 3, 4].map(() => [null, null]);
        for (let v = 1; v <= max; v += Math.max(1, Math.ceil(max / 2000))) { const k = classe(v); if (faixas[k][0] == null) faixas[k][0] = v; faixas[k][1] = v; }
        if (max >= 1) { const k = classe(max); if (faixas[k][0] == null) faixas[k][0] = max; faixas[k][1] = max; }
        const temMenor = Object.values(R).some(o => typeof o[S.indicador] === 'string');
        it.push(`<span><b>${esc(INDICADORES[S.indicador])}:</b></span>` + (temMenor ? `<span><i class="pn-lg-gra" style="width:18px;background:${p.seq[0]}"></i>&lt;${r.supressao}</span>` : '') +
          (max ? faixas.map(([a, b], k) => a == null ? '' : `<span><i class="pn-lg-gra" style="width:18px;background:${p.seq[k]}"></i>${a === b ? fmt.int(a) : fmt.int(a) + '–' + fmt.int(b)}</span>`).join('') : (temMenor ? '' : '<span>nenhum no período</span>')));
      }
      if (S.camadas.has('bvas') && grupos.bvas) it.push('<span><i class="db-lg-bva"></i>BVA (barreira fixa)</span>');
      if (S.camadas.has('aoVivo') && grupos.aoVivo) it.push('<span><i class="db-lg-vivo"></i>Barreira fixa em funcionamento agora</span>');
      if (S.camadas.has('calor') && grupos.calor) it.push(`<span>Detecções: <i class="pn-lg-gra" style="background:linear-gradient(90deg, ${Object.values(p.calor).join(',')})"></i> menos → mais</span>`);
      leg.innerHTML = it.join('');
    }
    card.addEventListener('change', e => { const k = e.target.dataset.camada; if (!k) return; if (e.target.checked) S.camadas.add(k); else S.camadas.delete(k); aplicar(); });
    card.addEventListener('click', e => { const b = e.target.closest('[data-ind]'); if (!b) return; S.indicador = b.dataset.ind; card.querySelectorAll('[data-ind]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); calcMax(); aplicar(); });
    aplicar();
    setTimeout(() => map.invalidateSize(), 0);
    // girou o celular / mudou o tamanho da janela: o mapa acompanha (um observador só, o da tela atual)
    if (S.obsMapa) S.obsMapa.disconnect();
    if (window.ResizeObserver) { S.obsMapa = new ResizeObserver(() => { if (S.mapa === map && div.isConnected) map.invalidateSize(); }); S.obsMapa.observe(div); }

    // lado: cartão do município, lista de barreiras em andamento e tabela por município (alternativa acessível ao mapa)
    const cm = el('div', 'pn-cartao db-mun'); cm.id = 'db-municipio'; cm.setAttribute('aria-live', 'polite'); lado.appendChild(cm);
    function selecionar(nome) { S.municipio = nome; desenharMun(); munLayer.setStyle(estilo); }
    function desenharMun() {
      const nome = S.municipio;
      cm.innerHTML = nome ? `<h3>${esc(nome)}</h3><p class="pn-sub">${esc(r.periodo.rotulo)}</p><dl>${linhasMun(nome).map(([t, v]) => `<dt>${esc(t)}</dt><dd>${esc(fmt.int(v))}</dd>`).join('')}</dl>` +
        ((M.bvas || []).filter(b => municipioDe(b.lat, b.lon) === nome).map(b => `<p class="pn-sub" style="margin-top:10px">BVA no município: <b>${esc(b.nome)}</b></p>`).join(''))
        : '<h3>Escolha um município</h3><p class="pn-sub">Toque num município no mapa ou escolha na lista abaixo.</p>';
      cm.insertAdjacentHTML('beforeend', `<label class="db-mun-sel">Município<select id="db-mun-sel"><option value="">—</option>${S.mun.map(m => `<option ${m.nome === nome ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></label>`);
      cm.querySelector('#db-mun-sel').onchange = e => selecionar(e.target.value);
    }
    desenharMun();
    if (r.aoVivo) {
      const lv = el('div', 'pn-cartao'); lv.id = 'db-aovivo'; lado.appendChild(lv);
      const ls2 = r.aoVivo.locais || [];
      lv.innerHTML = `<h3 class="db-h3">Barreiras fixas em funcionamento agora</h3><p class="pn-sub">Situação às ${esc(fmt.dataHora(r.aoVivo.em))}.</p>` +
        (ls2.length ? `<ul class="db-vivo-lista">${ls2.map(x => `<li><span>${esc(x.nome)}</span><b>${x.emAndamento > 1 ? fmt.int(x.emAndamento) + ' equipes' : 'em funcionamento'}</b></li>`).join('')}</ul>` : '<div class="pn-vazio">Nenhuma barreira fixa em funcionamento agora.</div>');
    }
    if (inds.length) {
      const tb = el('details', 'pn-cartao'); lado.appendChild(tb);
      const linhas = Object.entries(R).map(([n, o]) => Object.assign({ municipio: n }, o)).sort((a, b) => valorNum(b[S.indicador]) - valorNum(a[S.indicador]) || a.municipio.localeCompare(b.municipio, 'pt-BR'));
      tb.innerHTML = `<summary><b>Tabela por município</b> (${fmt.int(linhas.length)})</summary>` + (linhas.length ? tabelaHTML([{ chave: 'municipio', rotulo: 'Município' }].concat(inds.map(k => ({ chave: k, rotulo: INDICADORES[k], num: true, fmt: v => fmt.int(v == null ? 0 : v) }))), linhas) : '<div class="pn-vazio">Sem registros no período.</div>');
    }
    void auto;
  }

  /* ---------- eventos e atualização automática ---------- */
  function ligar() {
    $('#db-modos').addEventListener('click', e => { const b = e.target.closest('[data-modo]'); if (b) trocarModo(b.dataset.modo); });
    $('#db-modos').addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const m = modosLiberados(); if (m.length < 2) return;
      e.preventDefault(); trocarModo(m[(m.indexOf(S.modo) + 1) % m.length]);
    });
    $('#db-periodos').addEventListener('click', e => {
      const b = e.target.closest('[data-periodo]'); if (!b) return;
      if (b.dataset.periodo === 'intervalo') {                               // abre a escolha das datas; carrega só ao Aplicar
        S.editandoIv = true; if (S.r) desenharIntervalo(S.r);
        const iv = lerIntervalo(); if (S.periodo !== 'intervalo' && iv.de && iv.ate) { S.periodo = 'intervalo'; ls.set(LS_PER, S.periodo); carregar(); }
        return;
      }
      if (b.dataset.periodo === S.periodo) return; S.editandoIv = false; S.periodo = b.dataset.periodo; ls.set(LS_PER, S.periodo); carregar();
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('#db-iv-ok')) return;
      const de = ($('#db-iv-de') || {}).value || '', ate = ($('#db-iv-ate') || {}).value || '';
      if (!de || !ate) return avisoIntervalo('Escolha as datas de início e de fim.');
      if (de > ate) return avisoIntervalo('A data de início é depois da data de fim.');
      avisoIntervalo(''); ls.set(LS_IV, JSON.stringify({ de, ate })); S.periodo = 'intervalo'; ls.set(LS_PER, S.periodo); carregar();
    });
    const intervalo = () => (S.r && S.r.aoVivo ? VIVO_MS : ATUALIZAR_MS);
    setInterval(() => { if (!document.hidden && Date.now() - S.ultima >= (S.offline ? 60 * 1000 : intervalo())) carregar(true); }, 15 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - S.ultima >= intervalo()) carregar(true); });
    window.addEventListener('online', () => { if (S.offline) carregar(true); });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.r) desenhar(true); });
  }
  window.Dashboard = { estado: () => ({ modo: S.modo, periodo: S.periodo, offline: S.offline, temDados: !!S.r, municipio: S.municipio, ultima: S.ultima }), recarregar: () => carregar(), get dados() { return S.r; } };
  ligar(); carregar();
})();
