/* Painel gerencial do GDV — Modo TV ("Sala de Situação").
   Tela cheia sem rolagem para a TV da sala da gerência (1920×1080 ou 3840×2160, lida a 3–5 m): relógio de Manaus, telas em
   rotação (ao vivo, alertas, barreiras 7 dias, TF 30 dias, PCE 30 dias), atualização automática e operação 24 h.
   Ativação: painel/?tv=1 ou botão "Modo TV" (lembrado no aparelho: localStorage gdv.painel.tv=1). Parâmetros opcionais na URL:
   rotacao (segundos por tela, padrão 30, mínimo 10), tema (escuro | claro), telas (ex.: aovivo,alertas,pce).
   Teclas: ← → trocam de tela, espaço pausa, Esc sai do modo TV (não faz logout).
   Os números vêm dos mesmos cálculos das abas (Painel.aba(id).indicadores/calculos, Painel.alertasGerais, Painel.recorte).
   Ganchos para testes: window.PainelTV (ir, proxima, anterior, pausar, estado…) e #tv-raiz[data-tela][data-indice][data-pausado]. */
(() => {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, fmt = P.fmt, esc = P.esc;
  const LS_TV = 'gdv.painel.tv';
  const RECARREGAR_MS = 6 * 3600 * 1000;        // recarrega a página inteira (memória do Leaflet/Chart.js) — só com conexão
  const SEM_CONEXAO_MS = 3 * 60 * 1000;         // faixa âmbar "Sem conexão" depois de 3 min sem atualização bem-sucedida
  const OCIOSO_MS = 3000, DICA_MS = 15000, VERSAO_MS = 15 * 60 * 1000;
  const SS_RECARGA = 'gdv.painel.tv.recarga';                           // recarga automática (6 h / versão nova) feita por esta página
  const FONTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const SITUACAO = { ok: 'Em andamento', semsinal: 'Sem sinal > 30 min', longa: 'Aberta > 14 h' };
  const sitTxt = t => t.tfAndamento ? P.rotuloTF(t) : SITUACAO[t.situacao];          // TF em preenchimento / apreensão em andamento na frente

  const TELAS = {
    aovivo: { nome: 'Ao vivo — Barreiras (hoje)', curto: 'Ao vivo', render: telaAoVivo },
    alertas: { nome: 'Alertas para decisão', curto: 'Alertas', render: telaAlertas },
    barreiras: { nome: 'Barreiras — últimos 7 dias', curto: 'Barreiras 7 dias', render: telaBarreiras },
    tf: { nome: 'TF de Barreira — últimos 30 dias', curto: 'TF 30 dias', render: telaTF },
    pce: { nome: 'PCE — últimos 30 dias', curto: 'PCE 30 dias', render: telaPCE }
  };
  const ORDEM_PADRAO = ['aovivo', 'alertas', 'aovivo', 'barreiras', 'aovivo', 'tf', 'aovivo', 'pce'];

  /* ---------------- opções (URL) ---------------- */
  const q = new URLSearchParams(location.search);
  const listaTelas = String(q.get('telas') || '').split(',').map(x => x.trim().toLowerCase()).filter(x => TELAS[x]);
  const opc = {
    rotacaoMs: Math.max(10, parseInt(q.get('rotacao'), 10) || 30) * 1000,
    tema: q.get('tema') === 'claro' ? 'light' : 'dark',
    telas: listaTelas.length ? listaTelas : ORDEM_PADRAO.slice()
  };
  if (q.get('tv') === '1') P.ls.set(LS_TV, '1'); else if (q.get('tv') === '0') P.ls.del(LS_TV);
  let ativo = q.get('tv') === '1' || (q.get('tv') !== '0' && P.ls.get(LS_TV) === '1');

  /* ---------------- estado e utilidades ---------------- */
  const T = { i: 0, pausado: false, fimEm: 0, resta: opc.rotacaoMs, timer: null, relogio: null, vigia: null, graficos: [], mapas: [],
              inicio: Date.now(), ultimaVersao: Date.now(), wake: null, ocioso: null, dicaTimer: null, raiz: null, redim: null };
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => P.el(tag, cls, html);
  const px = v => Math.max(1, Math.round(v * window.innerHeight / 100));          // tamanhos em "vh" para o canvas/Leaflet
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const FH = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Manaus', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const FD = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Manaus', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const loginVisivel = () => { const l = $('#pn-login'); return !!l && !l.hidden; };
  const plural = (n, um, varios) => `${fmt.int(n)} ${n === 1 ? um : varios}`;

  /* ---------------- estrutura da tela ---------------- */
  function montar() {
    if (T.raiz) return T.raiz;
    const r = el('div', 'tv-raiz'); r.id = 'tv-raiz';
    r.innerHTML = `
      <header class="tv-topo">
        <img class="tv-logo" src="../img/logo-adaf.png" alt="ADAF">
        <div class="tv-titulo"><h1>Sala de Situação — GDV</h1><div class="tv-sub">Defesa agropecuária no Amazonas · barreiras, TF e PCE</div></div>
        <div class="tv-atual" id="tv-atual" role="status" aria-live="polite"><span class="tv-ponto"></span><span id="tv-atual-txt">Conectando…</span></div>
        <div class="tv-relogio"><div class="tv-hora" id="tv-hora"></div><div class="tv-data" id="tv-data"></div></div>
      </header>
      <div class="tv-faixa tv-faixa-tf" id="tv-tf" role="alert" hidden></div>
      <div class="tv-faixa" id="tv-faixa" role="alert" hidden></div>
      <main class="tv-palco" id="tv-palco" aria-live="off"></main>
      <footer class="tv-rodape">
        <div class="tv-rod-tela"><b id="tv-nome"></b><span id="tv-periodo"></span></div>
        <div class="tv-pontos" id="tv-pontos" aria-hidden="true"></div>
        <div class="tv-rod-dir"><span class="tv-pausa" id="tv-pausa" hidden><span aria-hidden="true">❚❚</span> Pausado</span><span id="tv-prox"></span></div>
        <div class="tv-progresso" aria-hidden="true"><i id="tv-barra"></i></div>
      </footer>
      <div class="tv-ctl" id="tv-ctl"><button type="button" class="tv-btn" id="tv-cheia">Tela cheia</button><button type="button" class="tv-btn" id="tv-sair">Sair do modo TV</button></div>
      <div class="tv-dica" id="tv-dica" hidden>Clique em qualquer lugar para tela cheia</div>`;
    document.body.appendChild(r); T.raiz = r;
    $('#tv-sair').onclick = e => { e.stopPropagation(); desligar(); };
    $('#tv-cheia').onclick = e => { e.stopPropagation(); e.currentTarget.blur(); alternarTelaCheia(); };
    // a Fullscreen API exige um gesto: qualquer clique na tela (fora dos botões) entra em tela cheia
    r.addEventListener('click', e => { if (!e.target.closest('button') && !document.fullscreenElement) entrarTelaCheia(); });
    return r;
  }

  /* ---------------- topo: relógio e situação da conexão ---------------- */
  function cabecalho() {
    if (!T.raiz) return;
    const agora = new Date(P.agora());
    $('#tv-hora').textContent = FH.format(agora);
    $('#tv-data').textContent = cap(FD.format(agora));
    const e = P.estado(), at = $('#tv-atual'), fx = $('#tv-faixa');
    const velho = !!e.ultimaCarga && Date.now() - e.ultimaCarga > SEM_CONEXAO_MS;
    $('#tv-atual-txt').textContent = e.ultimaCarga ? `Atualizado às ${fmt.hora(e.ultimaCarga)}` : (e.falhas ? 'Sem conexão' : 'Conectando…');
    at.classList.toggle('atrasado', velho || (!e.ultimaCarga && e.falhas > 0));
    let mudou = fx.hidden === velho;
    fx.hidden = !velho;
    if (faixaTF()) mudou = true;
    // a faixa muda a altura do palco: redesenha a tela para o mapa e os gráficos se ajustarem (senão o mapa fica cortado embaixo)
    if (mudou && T.raiz.isConnected && P.todos) setTimeout(() => desenhar(false), 0);
    if (velho) fx.innerHTML = `<span class="tv-faixa-ic" aria-hidden="true">!</span>Sem conexão — exibindo dados de ${esc(fmt.hora(e.ultimaCarga))}`;
  }
  /**
   * Faixa vermelha "TF em preenchimento / Apreensão em andamento" no topo, enquanto algum fiscal estiver preenchendo um TF
   * (até 2 linhas; o resto vira "+N"). Devolve true se a faixa apareceu ou sumiu (o palco muda de altura).
   */
  function faixaTF() {
    const fx = $('#tv-tf'); if (!fx) return false;
    const lst = P.logado && P.todos ? (P.todos.tfsAndamento || []) : [], antes = !fx.hidden;
    T.raiz.dataset.tf = String(lst.length);
    if (!lst.length) { fx.hidden = true; fx.innerHTML = ''; return antes; }
    const linha = a => `<div class="tv-tf-linha${a.apreensao ? ' apreensao' : ''}"><span class="tv-tf-ic" aria-hidden="true">TF</span><b>${esc(a.titulo)}</b>` +
      `<span class="tv-tf-det">${esc([a.onde, a.fiscal, a.placa && 'placa ' + a.placa, a.inicioMs && fmt.rel(a.inicioMs)].filter(Boolean).join(' · '))}</span></div>`;
    const html = lst.slice(0, 2).map(linha).join('') + (lst.length > 2 ? `<div class="tv-tf-mais">+${plural(lst.length - 2, 'outro TF em preenchimento', 'outros TFs em preenchimento')} — veja a tela Ao vivo</div>` : '');
    if (fx.innerHTML !== html) fx.innerHTML = html;
    fx.hidden = false;
    return !antes;
  }
  /** TF novo em preenchimento (o painel avisa): a rotação pula para "Ao vivo" e fica nela por dois períodos (pelo menos um ciclo inteiro). */
  function novoTF() {
    if (!ativo || !T.raiz) return;
    const i = opc.telas.indexOf('aovivo'); faixaTF();
    if (i < 0) return;
    T.i = i; T.resta = opc.rotacaoMs * 2; desenhar(true);
    if (T.pausado) { rodape(); progresso(); } else agendarTroca();
  }

  /* ---------------- rodapé e rotação ---------------- */
  function periodoTxt(id) {
    const hoje = P.hoje();
    if (id === 'aovivo') return `Hoje, ${fmt.data(hoje)}`;
    if (id === 'barreiras') return `${fmt.dataCurta(P.somaDias(hoje, -6))} a ${fmt.dataCurta(hoje)}`;
    return `${fmt.dataCurta(P.somaDias(hoje, -29))} a ${fmt.dataCurta(hoje)}`;
  }
  function rodape() {
    const id = opc.telas[T.i], def = TELAS[id], n = opc.telas.length;
    $('#tv-nome').textContent = def.nome;
    $('#tv-periodo').textContent = periodoTxt(id);
    $('#tv-pontos').innerHTML = opc.telas.map((t, k) => `<i class="${k === T.i ? 'atual' : ''}"></i>`).join('');
    $('#tv-prox').textContent = n > 1 ? `A seguir: ${TELAS[opc.telas[(T.i + 1) % n]].curto}` : '';
    $('#tv-pausa').hidden = !T.pausado;
    T.raiz.dataset.tela = id; T.raiz.dataset.indice = String(T.i); T.raiz.dataset.pausado = T.pausado ? '1' : '0';
  }
  function progresso() {
    const b = $('#tv-barra'); if (!b) return;
    b.style.transition = 'none'; b.style.transform = `scaleX(${Math.min(1, Math.max(0, 1 - T.resta / opc.rotacaoMs))})`;
    if (T.pausado || opc.telas.length < 2) return;
    void b.offsetWidth;                                                   // reinicia a transição
    b.style.transition = `transform ${T.resta}ms linear`; b.style.transform = 'scaleX(1)';
  }
  function agendarTroca() {
    clearTimeout(T.timer);
    if (T.pausado || opc.telas.length < 2) { progresso(); return; }
    T.fimEm = Date.now() + T.resta;
    T.timer = setTimeout(() => ir(T.i + 1), T.resta);
    progresso();
  }
  function ir(i) {
    if (!ativo) return;
    const n = opc.telas.length;
    T.i = ((i % n) + n) % n; T.resta = opc.rotacaoMs;
    desenhar(true); agendarTroca();
  }
  function pausar(sim) {
    sim = !!sim; if (sim === T.pausado) return;
    if (sim) { T.resta = Math.max(0, T.fimEm - Date.now()); clearTimeout(T.timer); T.pausado = true; progresso(); }
    else { T.pausado = false; if (!T.resta) T.resta = opc.rotacaoMs; agendarTroca(); }
    rodape();
  }

  /* ---------------- desenho das telas ---------------- */
  function limpar() {                                                      // sem vazamento: gráficos e mapas destruídos a cada troca
    T.graficos.forEach(g => { try { g.destroy(); } catch (e) { /* já destruído */ } }); T.graficos = [];
    T.mapas.forEach(m => { try { m.remove(); } catch (e) { /* idem */ } }); T.mapas = [];
  }
  function desenhar(trocou) {
    if (!ativo || !T.raiz) return;
    const palco = $('#tv-palco'), id = opc.telas[T.i];
    rodape(); limpar();
    palco.innerHTML = ''; palco.dataset.tela = id;
    if (trocou) { palco.classList.remove('tv-entra'); void palco.offsetWidth; palco.classList.add('tv-entra'); }
    if (!P.logado) return;                                                 // tela de "Sessão encerrada" por cima
    if (!P.todos || !P.dados) { aviso(palco); return; }
    P.reavaliarAbertos();                                                   // sem conexão a barreira continua "envelhecendo" (sem sinal / > 14 h)
    try { TELAS[id].render(palco); }
    catch (err) { console.error(err); limpar(); palco.innerHTML = `<div class="tv-aviso"><b>Não foi possível montar esta tela.</b><span>${esc(err.message)}</span></div>`; }
  }
  function aviso(palco) {
    const e = P.estado();
    palco.innerHTML = e.falhas
      ? `<div class="tv-aviso"><b>Sem conexão com o servidor</b><span>Tentando de novo automaticamente (espera crescente, até 5 min).${e.erro ? ' ' + esc(e.erro) : ''}</span></div>`
      : '<div class="tv-aviso"><b>Carregando os dados…</b><span>Últimos 30 dias e barreiras em andamento.</span></div>';
  }

  /* ---------------- peças visuais ---------------- */
  function kpisTV(cont, itens) {
    const g = el('div', 'tv-kpis');
    g.style.gridTemplateColumns = itens.map(k => k.largo ? 'minmax(0, 2.2fr)' : 'minmax(0, 1fr)').join(' ');
    itens.forEach(k => {
      const v = typeof k.valor === 'number' ? fmt.compacto(k.valor) : (k.valor == null ? '—' : k.valor);
      // detalhe longo (feito para a tela do computador): na TV fica só a primeira parte, sem cortar no meio da palavra
      const det = k.detalhe && k.detalhe.length > 50 ? k.detalhe.split(' · ')[0] : k.detalhe;
      const d = el('div', 'tv-kpi' + (k.status ? ' st-' + k.status : '') + (k.largo ? ' tv-kpi-largo' : '')); d.dataset.chave = k.chave || '';
      const med = k.medidor != null ? `<div class="tv-kpi-med" role="img" aria-label="${esc(fmt.pct(k.medidor))}"><i style="width:${(Math.min(1, Math.max(0, k.medidor)) * 100).toFixed(1)}%"></i></div>` : '';
      d.innerHTML = `<div class="tv-kpi-rot">${esc(k.rotulo)}</div><div class="tv-kpi-val">${esc(v)}</div>${med}${det ? `<div class="tv-kpi-det">${esc(det)}</div>` : ''}` +
        (k.largo ? `<div class="tv-kpi-graf"><span>${esc(k.largo)}</span></div>` : '');
      g.appendChild(d);
    });
    cont.appendChild(g);
    // valor numérico nunca leva reticências ("10,5 m…"): se não couber, a fonte diminui até caber (mínimo 4,4vh)
    g.querySelectorAll('.tv-kpi-val').forEach(v => {
      for (let t = parseFloat(getComputedStyle(v).fontSize) / window.innerHeight * 100; v.scrollWidth > v.clientWidth + 1 && t > 4.4; ) { t = Math.max(4.4, t - 0.4); v.style.fontSize = t + 'vh'; }
    });
    return g;
  }
  /** Nome curto para rótulos de mapa e rankings ("Barreira Porto CEASA" → "Porto CEASA"). */
  const curto = s => String(s || '').replace(/^barreira\s+(?:d[aoe]s?\s+)?/i, '') || String(s || '');
  /** Escolhe indicadores das abas pela chave (mesmo cálculo), com troca opcional de rótulo/detalhe. */
  const escolher = (itens, chaves, troca) => chaves.map(c => { const it = itens.find(x => x.chave === c); return it ? Object.assign({}, it, (troca || {})[c]) : null; }).filter(Boolean);
  function cartao(cont, titulo, sub, cls) {
    const c = el('section', 'tv-cartao' + (cls ? ' ' + cls : ''));
    c.appendChild(el('div', 'tv-cab', `<h2>${esc(titulo)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}`));
    cont.appendChild(c); return c;
  }
  function legenda(cont, itens) {
    const l = el('div', 'tv-leg', itens.map(x => `<span>${x.marca || `<i style="background:${x.cor}"></i>`}${esc(x.txt)}</span>`).join(''));
    cont.appendChild(l); return l;
  }
  /** Esconde os itens que não cabem na lista e fecha com "+N …" (sem rolagem na TV). */
  function caber(lista, mais) {
    const kids = [...lista.children]; if (!kids.length) return 0;
    const topo = () => lista.getBoundingClientRect().top, H = lista.clientHeight;
    const passa = e => e.getBoundingClientRect().bottom - topo() > H + 0.5;
    let n = 0;
    kids.forEach(k => { if (passa(k)) { k.hidden = true; n++; } });
    if (!n) return 0;
    const m = el(lista.tagName === 'UL' ? 'li' : 'div', 'tv-mais', esc(mais(n))); lista.appendChild(m);
    const vis = kids.filter(k => !k.hidden);
    while (vis.length && passa(m)) { vis.pop().hidden = true; n++; m.textContent = mais(n); }
    return n;
  }
  const transborda = e => e.scrollHeight > e.clientHeight + 1;

  /** Rótulos com o valor na ponta (barras horizontais) ou no topo (colunas): na TV não há hover. */
  const ROTULOS = { id: 'tvRotulos', afterDatasetsDraw(ch, args, o) {
    if (!o || !o.modo) return;
    const horiz = ch.options.indexAxis === 'y', ds = ch.data.datasets, n = (ch.data.labels || []).length;
    const tot = [...Array(n).keys()].map(i => ds.reduce((s, d, k) => s + (ch.isDatasetVisible(k) ? (+d.data[i] || 0) : 0), 0));
    let alvo = [...Array(n).keys()].filter(i => tot[i] > 0 || (horiz && o.modo === 'todos'));   // ranking: o zero também é escrito (sem barra, sem número parecia falta de dado)
    if (o.modo === 'max') { const m = Math.max(0, ...tot); alvo = alvo.filter(i => tot[i] === m).slice(-1); }
    const vS = horiz ? ch.scales.x : ch.scales.y, cS = horiz ? ch.scales.y : ch.scales.x, c = ch.ctx;
    c.save(); c.font = `${o.peso} ${o.tam}px ${FONTE}`; c.fillStyle = o.cor;
    alvo.forEach(i => {
      const v = vS.getPixelForValue(tot[i]), pos = cS.getPixelForValue(i), t = o.fmt(tot[i]);
      if (horiz) { c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(t, v + o.tam * 0.45, pos); }
      else { c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillText(t, pos, v - o.tam * 0.3); }
    });
    c.restore();
  } };
  /**
   * Barras no padrão do dataviz para a TV: marcas finas com ponta arredondada de 4px (proporcional), vão de 2px entre segmentos
   * empilhados, grade em linha fina, sem hover/tooltip/animação, valores escritos (cfg.rotulos: 'todos' | 'max').
   */
  function barras(cont, cfg) {
    if (typeof Chart === 'undefined') { cont.appendChild(el('div', 'tv-vazio', 'Biblioteca de gráficos não carregada.')); return null; }
    const p = P.paleta, horiz = !!cfg.horizontal, pilha = !!cfg.empilhado;
    const total = cfg.datasets.reduce((s, d) => s + d.data.reduce((a, v) => a + (+v || 0), 0), 0);
    if (!cfg.labels.length || !total) { cont.appendChild(el('div', 'tv-vazio', esc(cfg.vazio || 'Sem registros no período.'))); return null; }
    const area = el('div', 'tv-graf'), cv = el('canvas'); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', cfg.rotulo || '');
    area.appendChild(cv); cont.appendChild(area);
    const raio = Math.max(3, px(0.4)), vao = Math.max(2, px(0.2)), fonte = (t, w) => ({ family: FONTE, size: px(t), weight: w || 400 });
    // segmento do topo da pilha (o último com valor) leva a ponta arredondada; os de baixo ficam retos
    const topoPilha = ctx => { const i = ctx.dataIndex, ds = ctx.chart.data.datasets; let t = -1; ds.forEach((d, k) => { if ((+d.data[i] || 0) > 0) t = k; }); return ctx.datasetIndex === t; };
    const datasets = cfg.datasets.map((d, k) => Object.assign({
      label: d.label, data: d.data, backgroundColor: d.cor || p.serie[k], maxBarThickness: px(cfg.espessura || 2.6),
      categoryPercentage: 0.8, barPercentage: 0.9, borderSkipped: 'start', borderRadius: pilha ? (ctx => topoPilha(ctx) ? raio : 0) : raio
    }, pilha ? { borderColor: p.sf, borderWidth: horiz ? { right: vao } : { top: vao } } : { borderWidth: 0 }));
    const vAx = horiz ? 'x' : 'y', cAx = horiz ? 'y' : 'x', semEixo = horiz || cfg.semEixo || cfg.mini;
    const ticksCat = { color: p.ink2, font: fonte(cfg.mini ? 1.6 : 1.8), autoSkip: !horiz && !cfg.passo, maxRotation: 0, autoSkipPadding: px(1.2), padding: px(0.6) };
    if (horiz) ticksCat.callback = function (v) { const l = String(this.getLabelForValue(v)), max = cfg.maxRotulo || 26; return l.length > max ? l.slice(0, max - 1) + '…' : l; };
    else if (cfg.passo) ticksCat.callback = function (v, i) { return i % cfg.passo === 0 ? this.getLabelForValue(v) : ''; };
    const ch = new Chart(cv, {
      type: 'bar', data: { labels: cfg.labels, datasets },
      options: {
        indexAxis: horiz ? 'y' : 'x', animation: false, responsive: true, maintainAspectRatio: false, events: [],
        layout: { padding: horiz ? { right: px(cfg.folga || 6) } : { top: px(cfg.mini ? 2.6 : 3) } },
        plugins: { legend: { display: false }, tooltip: { enabled: false },
          tvRotulos: { modo: cfg.rotulos || (horiz ? 'todos' : 'max'), cor: p.ink, tam: px(2), peso: 650, fmt: cfg.fmtValor || fmt.int } },
        scales: {
          [vAx]: { stacked: pilha, beginAtZero: true, display: !semEixo, grid: { color: p.grade, drawTicks: false }, border: { display: false },
                   ticks: { color: p.ink2, font: fonte(1.7), padding: px(0.8), maxTicksLimit: 4, precision: 0, callback: v => fmt.compacto(v) } },
          [cAx]: { stacked: pilha, grid: { display: false }, border: { color: p.base }, ticks: ticksCat }
        }
      },
      plugins: [ROTULOS]
    });
    T.graficos.push(ch); return ch;
  }

  /** Mapa do AM para a TV: não interativo, ajustado aos limites do estado, sem tiles (fundo neutro + contornos municipais). */
  function mapaTV(cont) {
    const div = el('div', 'tv-mapa'); cont.appendChild(div);
    if (typeof L === 'undefined' || !P.geo) { div.appendChild(el('div', 'tv-vazio', 'Mapa indisponível.')); return null; }
    const p = P.paleta;
    const map = L.map(div, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
      keyboard: false, touchZoom: false, zoomSnap: 0, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, inertia: false });
    const mun = L.geoJSON(P.geo, { interactive: false, style: () => ({ color: p.mapa.linha, weight: Math.max(1, px(0.1)), opacity: 1, fillColor: p.mapa.terra, fillOpacity: 1 }) }).addTo(map);
    map.fitBounds(mun.getBounds(), { padding: [px(1.6), px(1.6)], animate: false });
    T.mapas.push(map);
    return { map, div, p };
  }
  const NS = 'http://www.w3.org/2000/svg';
  /**
   * Rótulos permanentes ao lado dos marcadores, sem sobreposição: cada lado (direita/esquerda) empilha os rótulos na vertical
   * e, quando um rótulo sai da altura do marcador, uma linha de chamada liga os dois.
   */
  function rotular(m, itens, raio) {
    const map = m.map, cont = map.getContainer(), W = cont.clientWidth, H = cont.clientHeight, marg = px(0.8), afast = raio + px(1.4), vao = px(0.5);
    // painel próprio entre as camadas vetoriais (400) e os marcadores (600): os rótulos nunca cobrem um marcador
    const pane = map.getPane('tvRotulos') || map.createPane('tvRotulos'); pane.style.zIndex = 590; pane.style.pointerEvents = 'none';
    const camada = el('div', 'tv-rotulos'), svg = document.createElementNS(NS, 'svg');
    camada.appendChild(svg); pane.appendChild(camada);
    const o = map.containerPointToLayerPoint([0, 0]);                      // coordenadas do painel = do contêiner + deslocamento
    camada.style.left = o.x + 'px'; camada.style.top = o.y + 'px'; camada.style.width = W + 'px'; camada.style.height = H + 'px';
    const ls = itens.map(it => {
      const pt = map.latLngToContainerPoint([it.lat, it.lon]), e = el('div', 'tv-rotulo ' + (it.cls || ''), it.html);
      camada.appendChild(e); const b = e.getBoundingClientRect(); return { x: pt.x, y: pt.y, e, w: Math.ceil(b.width), h: Math.ceil(b.height) };   // largura real (borda em vh é fracionária)
    });
    const pinos = ls.map(l => ({ left: l.x - raio, top: l.y - raio, w: 2 * raio, h: 2 * raio }));
    const bate = (a, b) => a.left < b.left + b.w + vao && b.left < a.left + a.w + vao && a.top < b.top + b.h + vao && b.top < a.top + a.h + vao;
    const postos = [];
    // isolados primeiro (ficam colados ao marcador); os de grupos (ex.: Manaus e vizinhos) empilham depois: cada um tenta direita,
    // esquerda e então deslocado para cima/baixo, com linha de chamada
    const viz = l => ls.filter(x => x !== l && Math.hypot(x.x - l.x, x.y - l.y) < px(16)).length;
    // muitas barreiras juntas: além de subir/descer a pilha até a altura do mapa, abre uma 2ª e 3ª coluna mais afastada;
    // se ainda assim não houver lugar livre, fica onde cobre menos (nunca simplesmente por cima de outro rótulo)
    const colW = Math.max(0, ...ls.map(l => l.w)) + px(1.2);
    const dentroMapa = c => c.left >= marg && c.left + c.w <= W - marg && c.top >= marg && c.top + c.h <= H - marg;
    const area = (a, b) => Math.max(0, Math.min(a.left + a.w, b.left + b.w) - Math.max(a.left, b.left) + vao) * Math.max(0, Math.min(a.top + a.h, b.top + b.h) - Math.max(a.top, b.top) + vao);
    ls.slice().sort((a, b) => viz(a) - viz(b) || a.y - b.y).forEach(l => {
      const cands = [], kMax = Math.ceil(H / (l.h + vao));                 // passo de meia altura: mais lugares livres num aglomerado
      for (let col = 0; col < 3; col++) for (let k = 0; k <= kMax; k += 0.5) [1, -1].forEach(lado => [0, 1, -1].forEach(sinal => {
        if (k === 0 && sinal) return;
        const dx = afast + col * colW, left = lado === 1 ? l.x + dx : l.x - dx - l.w, top = l.y - l.h / 2 + sinal * k * (l.h + vao);
        cands.push({ lado, left, top, w: l.w, h: l.h, custo: k * 10 + col * 45 + (lado === 1 ? 0 : 1) });
      }));
      cands.sort((a, b) => a.custo - b.custo);
      const outrosPinos = pinos.filter((p, k) => ls[k] !== l);
      const ok = c => dentroMapa(c) && !postos.some(p => bate(c, p)) && !outrosPinos.some(p => bate(c, p));
      const cobre = c => postos.reduce((s, p) => s + area(c, p), 0) + outrosPinos.reduce((s, p) => s + area(c, p), 0);
      const c = cands.find(ok) || cands.filter(dentroMapa).sort((a, b) => cobre(a) - cobre(b) || a.custo - b.custo)[0] || cands[0];
      Object.assign(l, { lado: c.lado, left: c.left, top: c.top }); postos.push(c);
    });
    ls.forEach(l => {
      const cy = l.top + l.h / 2;
      l.e.style.left = l.left + 'px'; l.e.style.top = l.top + 'px';
      const colado = (l.lado === 1 ? l.left - l.x : l.x - l.left - l.w) <= afast + 1;
      if (Math.abs(cy - l.y) < 2 && colado) return;                          // ao lado do marcador: dispensa linha de chamada
      const x0 = l.x + l.lado * (raio * 0.7), x1 = l.lado === 1 ? l.left : l.left + l.w, xm = x1 - l.lado * Math.min(px(1.2), Math.abs(x1 - x0) / 2);
      const ln = document.createElementNS(NS, 'path');
      ln.setAttribute('d', `M${x0.toFixed(1)},${l.y.toFixed(1)} L${xm.toFixed(1)},${cy.toFixed(1)} L${x1.toFixed(1)},${cy.toFixed(1)}`); svg.appendChild(ln);
    });
  }
  const pino = (sit, tam) => L.divIcon({ className: '', html: `<div class="tv-pin ${sit}" style="--pin:${tam}px"></div>`, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] });
  // pinos: forma diferente por situação (círculo = em andamento, quadrado com "?" = sem sinal, losango com "!" = aberta > 14 h), não só a cor;
  // tamanho para o glifo ficar com ≥ 1,6vh (glifo = metade do pino)
  const PINO_MAPA = 3.6, PINO_LISTA = 3.4;
  const marcaPino = sit => `<i class="tv-lg-pino"><span class="tv-pin ${sit}" style="--pin:${px(PINO_LISTA)}px"></span></i>`;

  /* ================= 1. Ao vivo — Barreiras (hoje) ================= */
  function telaAoVivo(palco) {
    const hoje = P.hoje(), N = P.todos, dH = P.recorte(hoje, hoje), p = P.paleta;
    const vivos = dH.emAndamento.slice().sort((a, b) => P.ordemVivo(a) - P.ordemVivo(b) || (b.duracaoMin || 0) - (a.duracaoMin || 0));
    const semTurno = dH.tfsSemTurno || [], tfGPS = semTurno.filter(a => a.lat != null && a.lon != null);
    const vHoje = N.veiculosTodos.filter(v => v.dia === hoje);             // dia real da passagem (turno que virou a noite conta certo)
    const hojePorTurno = {}; vHoje.forEach(v => { const h = hojePorTurno[v.turnoId] = hojePorTurno[v.turnoId] || { n: 0, pessoas: 0 }; h.n++; h.pessoas += v.pessoas; });
    const deHoje = t => hojePorTurno[t.id] || { n: 0, pessoas: 0 };
    const and = P.indicadoresGerais(dH).find(x => x.chave === 'andamento');
    const nProc = k => dH.tfs.filter(t => t.procedimento === k).length;
    const encHoje = dH.turnos.filter(t => t.encerrado);
    const h24 = Array(24).fill(0); vHoje.forEach(v => { if (v.horaNum != null && v.horaNum >= 0 && v.horaNum < 24) h24[v.horaNum]++; });

    kpisTV(palco, [
      { chave: 'andamento', rotulo: 'Barreiras ativas', valor: vivos.length, detalhe: and.detalhe, status: and.status },
      { chave: 'veiculos', rotulo: 'Veículos hoje', valor: vHoje.length, largo: 'Veículos por hora',
        detalhe: vHoje.length ? `em ${plural(Object.keys(hojePorTurno).length, 'turno', 'turnos')} de barreira` : 'nenhum registro ainda' },
      { chave: 'pessoas', rotulo: 'Pessoas hoje', valor: vHoje.reduce((s, v) => s + v.pessoas, 0), detalhe: 'estimativa por veículo' },
      { chave: 'tfs', rotulo: 'TFs hoje', valor: dH.tfs.length, detalhe: dH.tfs.length ? `${fmt.int(nProc('liberacao'))} liberações · ${fmt.int(nProc('rechaco'))} rechaços` : 'nenhum TF hoje' },
      { chave: 'apreensoes', rotulo: 'Apreensões hoje', valor: nProc('apreensao'), detalhe: 'TFs com apreensão p/ destruição' }
    ]);

    // estrutura primeiro (o mapa e os gráficos medem o espaço final)
    const g = el('div', 'tv-grade tv-grade-vivo'); palco.appendChild(g);
    const cm = cartao(g, 'Barreiras no Amazonas agora', vivos.length ? 'Rótulo: barreira e nº de veículos abordados hoje' : 'Nenhuma barreira em andamento agora', 'tv-cartao-mapa');
    const cl = cartao(g, 'Barreiras em andamento', vivos.length ? `${plural(vivos.length, 'barreira', 'barreiras')} · com alerta primeiro` : 'Resumo de hoje', 'tv-cartao-lista');
    const divMapa = el('div', 'tv-mapa-lugar'); cm.appendChild(divMapa);
    const n = s => vivos.filter(t => P.pinoDe(t) === s).length, comGPS = vivos.filter(t => t.lat != null && t.lon != null), semGPS = vivos.length - comGPS.length;
    legenda(cm, [{ marca: marcaPino('tf'), txt: `TF em preenchimento (${n('tf') + tfGPS.length})` }, { marca: marcaPino('ok'), txt: `Em andamento (${n('ok')})` }, { marca: marcaPino('semsinal'), txt: `Sem sinal > 30 min (${n('semsinal')})` },
      { marca: marcaPino('longa'), txt: `Aberta > 14 h (${n('longa')})` }, { marca: `<i class="tv-lg-pto" style="background:${p.alfa(p.serie[6], 0.6)};box-shadow:0 0 0 1.5px ${p.ink}"></i>`, txt: `Encerrada hoje (${encHoje.length})` }]
      .concat(semGPS ? [{ marca: '', txt: `${plural(semGPS, 'barreira', 'barreiras')} sem GPS` }] : []));

    // lista: cartões; se não couberem, linhas compactas; o que ainda sobrar vira "+N"
    const lista = el('div', 'tv-lista'); cl.appendChild(lista);
    let maisTxt;
    // TF em preenchimento sem turno aberto: linha própria no topo da lista (a barreira com turno mostra o TF no próprio cartão)
    const tfAvulso = a => `<div class="tv-vivo-c tf"><span class="tv-pin tf" style="--pin:${px(PINO_LISTA)}px"></span><div class="tv-vivo-c-nome"><b>${esc(a.onde)}</b><span>${esc([a.apreensao ? 'APREENSÃO' : 'TF', 'sem turno aberto', a.placa, a.inicioMs && fmt.rel(a.inicioMs)].filter(Boolean).join(' · '))}</span></div><div class="tv-vivo-c-num"></div></div>`;
    if (!vivos.length) {
      lista.innerHTML = semTurno.map(tfAvulso).join('') + `<div class="tv-nada"><b>Nenhuma barreira em andamento agora</b><span>Hoje: ${plural(encHoje.length, 'turno realizado', 'turnos realizados')} · ${plural(vHoje.length, 'veículo', 'veículos')} · ${plural(dH.tfs.length, 'TF', 'TFs')}</span></div>` +
        encHoje.slice().sort((a, b) => (b.inicioMs || 0) - (a.inicioMs || 0)).map(t => `<div class="tv-vivo-c encerrada"><i class="tv-dot encerrada"></i><div class="tv-vivo-c-nome"><b>${esc(t.local || 'Sem local')}</b><span>${esc([t.municipio, `encerrada · ${t.inicio || '?'}–${t.fim || '?'}`].filter(Boolean).join(' · '))}</span></div><div class="tv-vivo-c-num"><b>${fmt.int(t.nVeiculos)}</b> veíc.</div></div>`).join('');
      maisTxt = k => `+${plural(k, 'turno encerrado', 'turnos encerrados')} hoje`;
    } else {
      const completo = t => { const h = deHoje(t), desde = t.data !== hoje ? ` · desde ${fmt.dataCurta(t.data)} ${t.inicio || ''}` : '';
        const tf = (t.tfAndamento || [])[0], linhaTF = tf ? `<div class="tv-vivo-tf">${esc([tf.placa && 'Placa ' + tf.placa, tf.procedimentoNome, tf.inicioMs && 'iniciado ' + fmt.rel(tf.inicioMs)].filter(Boolean).join(' · '))}</div>` : '';
        return `<div class="tv-vivo ${P.pinoDe(t)}"><div class="tv-vivo-l1"><span class="tv-selo ${P.pinoDe(t)}"><i></i>${esc(sitTxt(t))}</span><span class="tv-vivo-sinal">Último sinal ${esc(fmt.rel(t.ultimoSinal))}</span></div>
          <div class="tv-vivo-nome">${esc(t.local || 'Sem local')}</div>${linhaTF}<div class="tv-vivo-onde">${esc([t.municipio, t.fiscal].filter(Boolean).join(' · ') || '—')}</div>
          <div class="tv-vivo-num"><span><b>${fmt.int(h.n)}</b> veículos hoje</span><span><b>${fmt.int(h.pessoas)}</b> pessoas</span><span><b>${esc(fmt.duracao(t.duracaoMin))}</b> aberta${esc(desde)}</span></div></div>`; };
      // linha compacta: a situação vai por extenso no texto (não só na cor do marcador, igual ao do mapa)
      const sub = t => { const dur = fmt.duracao(t.duracaoMin), sin = fmt.rel(t.ultimoSinal);
        if (t.tfAndamento) { const tf = t.tfAndamento[0]; return [P.rotuloTF(t).toUpperCase(), tf.placa && 'placa ' + tf.placa, tf.inicioMs && fmt.rel(tf.inicioMs), t.municipio].filter(Boolean).join(' · '); }
        return [t.municipio].concat(t.situacao === 'semsinal' ? [`SEM SINAL ${sin}`, `${dur} aberta`] : t.situacao === 'longa' ? [`ABERTA HÁ ${dur}`, `sinal ${sin}`] : [`${dur} aberta`, `sinal ${sin}`]).filter(Boolean).join(' · '); };
      const compacto = t => `<div class="tv-vivo-c ${P.pinoDe(t)}"><span class="tv-pin ${P.pinoDe(t)}" style="--pin:${px(PINO_LISTA)}px"></span><div class="tv-vivo-c-nome"><b>${esc(t.local || 'Sem local')}</b><span>${esc(sub(t))}</span></div><div class="tv-vivo-c-num"><b>${fmt.int(deHoje(t).n)}</b> veíc.</div></div>`;
      lista.innerHTML = semTurno.map(tfAvulso).join('') + vivos.map(completo).join('');
      if (transborda(lista)) { lista.innerHTML = semTurno.map(tfAvulso).join('') + vivos.map(compacto).join(''); lista.classList.add('compacta'); }
      maisTxt = k => `+${plural(k, 'barreira', 'barreiras')} em andamento`;
    }

    // mapa: barreiras em andamento (marcador grande pulsante + rótulo) e as encerradas hoje
    const m = mapaTV(divMapa);
    if (m) {
      encHoje.filter(t => t.lat != null && t.lon != null).forEach(t => L.circleMarker([t.lat, t.lon], { radius: px(0.8), color: p.ink, weight: 1.5, fillColor: p.serie[6], fillOpacity: 0.6, interactive: false }).addTo(m.map));
      const tam = px(PINO_MAPA);
      comGPS.slice().reverse().forEach(t => L.marker([t.lat, t.lon], { icon: pino(P.pinoDe(t), tam), interactive: false, keyboard: false, zIndexOffset: 1000 - P.ordemVivo(t) * 100 }).addTo(m.map));
      tfGPS.forEach(a => L.marker([a.lat, a.lon], { icon: pino('tf', tam), interactive: false, keyboard: false, zIndexOffset: 1200 }).addTo(m.map));
      // a situação vai escrita no rótulo (barreiras juntas, como em Manaus, ficam identificadas sem depender do pino)
      // (curto, para caber no aglomerado; o detalhe completo está na lista ao lado)
      const sitRot = t => t.tfAndamento ? `<em>${P.tfApreensao(t) ? 'APREENSÃO' : 'TF'}</em>` : t.situacao === 'longa' ? `<em>! ${fmt.int(Math.floor((t.duracaoMin || 0) / 60))} h</em>` : t.situacao === 'semsinal' ? '<em>? sem sinal</em>' : '';
      rotular(m, comGPS.map(t => ({ lat: t.lat, lon: t.lon, cls: P.pinoDe(t), html: `${sitRot(t)}<b>${esc(curto(t.local) || 'Barreira')}</b><span>${fmt.int(deHoje(t).n)}</span>` }))
        .concat(tfGPS.map(a => ({ lat: a.lat, lon: a.lon, cls: 'tf', html: `<em>${a.apreensao ? 'APREENSÃO' : 'TF'}</em><b>${esc(curto(a.onde))}</b>` }))), tam / 2);
    }
    // veículos por hora (hoje), dentro do indicador "Veículos abordados hoje"
    const gk = palco.querySelector('.tv-kpi[data-chave="veiculos"] .tv-kpi-graf');
    if (gk) barras(gk, { labels: h24.map((_, h) => h + 'h'), datasets: [{ label: 'Veículos', data: h24, cor: p.serie[0] }], mini: true, passo: 6, rotulos: 'max', vazio: '—', rotulo: 'Veículos por hora hoje', espessura: 1.6 });
    caber(lista, maisTxt);                                                   // por último: com o espaço final
  }

  /* ================= 2. Alertas para decisão (os mesmos da Visão geral) ================= */
  function telaAlertas(palco) {
    const d = P.dados, f = P.filtros;
    const lista = P.alertasGerais(d).slice().sort((a, b) => P.ORDEM_NIVEL[a.nivel] - P.ORDEM_NIVEL[b.nivel]);
    const c = cartao(palco, 'Alertas para decisão', `${f.rotuloPeriodo} · ordem: crítico → sério → atenção`, 'tv-cartao-alertas');
    const conta = k => lista.filter(a => a.nivel === k).length;
    const NOME = { critico: ['crítico', 'críticos'], serio: ['sério', 'sérios'], atencao: ['de atenção', 'de atenção'], info: ['informativo', 'informativos'] };
    const resumo = el('div', 'tv-alertas-resumo', ['critico', 'serio', 'atencao', 'info'].filter(k => conta(k)).map(k =>
      `<span class="tv-nivel ${k}"><i aria-hidden="true">${P.NIVEIS[k][0]}</i><b>${fmt.int(conta(k))}</b> ${esc(NOME[k][conta(k) === 1 ? 0 : 1])}</span>`).join(''));
    c.querySelector('.tv-cab').appendChild(resumo);
    if (!lista.length) { c.appendChild(el('div', 'tv-nada tv-nada-ok', '<b>Nenhum alerta no período ✓</b><span>Barreiras, numeração de TF/termos, focos de pragas e cobertura do PCE em ordem.</span>')); return; }
    const ul = el('ul', 'tv-alertas'); c.appendChild(ul);
    lista.forEach(a => {
      const [ic, rot] = P.NIVEIS[a.nivel] || P.NIVEIS.info, mod = a.aba && P.aba(a.aba) ? P.aba(a.aba).titulo : '';
      const li = el('li', 'tv-alerta ' + a.nivel);
      li.innerHTML = `<span class="tv-alerta-ic" aria-hidden="true">${ic}</span><div class="tv-alerta-txt"><div class="tv-alerta-tit">${esc(a.titulo)}</div>${a.detalhe ? `<div class="tv-alerta-det">${esc(a.detalhe)}</div>` : ''}</div>
        <div class="tv-alerta-niv">${esc(rot)}${mod ? `<small>${esc(mod)}</small>` : ''}</div>`;
      ul.appendChild(li);
    });
    caber(ul, k => `+${plural(k, 'alerta', 'alertas')} — veja a Visão geral no painel`);
  }

  /* ================= 3. Barreiras — últimos 7 dias ================= */
  function telaBarreiras(palco) {
    const M = P.aba('barreiras'); if (!M || !M.calculos) { palco.appendChild(el('div', 'tv-aviso', '<b>Aba Barreiras não carregada.</b>')); return; }
    const hoje = P.hoje(), de = P.somaDias(hoje, -6), d = P.recorte(de, hoje), f = { de, ate: hoje, dias: 7, fiscal: '', local: null }, p = P.paleta;
    const K = M.calculos(d, f);
    kpisTV(palco, escolher(M.indicadores(d), ['turnos', 'horas', 'veiculos', 'pessoas', 'vph'], { vph: { rotulo: 'Veículos por hora' } }));
    const g = el('div', 'tv-grade tv-grade-2'); palco.appendChild(g);
    const col = el('div', 'tv-coluna'); g.appendChild(col);
    const cd = cartao(col, 'Veículos por dia', 'Pela data de início do turno · empilhado por turno', 'tv-flex tv-flex-maior');
    const cf = cartao(col, 'Fluxo ao longo do dia', 'Veículos por hora do relógio, soma dos 7 dias', 'tv-flex');
    const cr = cartao(g, 'Ranking das barreiras', 'Veículos abordados nos 7 dias, por barreira / local');
    const dias = [...Array(7).keys()].map(i => P.somaDias(de, i));
    const rotDia = dias.map(x => { const [a, mm, dd] = x.split('-').map(Number); return `${P.DIAS_SEMANA[new Date(a, mm - 1, dd).getDay()]} ${fmt.dataCurta(x)}`; });
    const ds = [{ label: 'Turno A (04h–12h)', data: K.porDia.A, cor: p.serie[0] }, { label: 'Turno B (12h–20h)', data: K.porDia.B, cor: p.serie[1] }];
    if (K.porDia.X.some(Boolean)) ds.push({ label: 'Sem turno', data: K.porDia.X, cor: p.serie[2] });
    legenda(cd, ds.map(x => ({ cor: x.cor, txt: x.label })));
    const top = K.porBar.slice(0, 8);
    barras(cd, { labels: rotDia, datasets: ds, empilhado: true, rotulos: 'todos', semEixo: true, espessura: 3.6, vazio: 'Nenhum veículo nos últimos 7 dias.', rotulo: 'Veículos por dia, últimos 7 dias' });
    barras(cf, { labels: K.h24.map((_, h) => h + 'h'), datasets: [{ label: 'Veículos', data: K.h24, cor: p.serie[0] }], rotulos: 'max', passo: 3, vazio: 'Nenhum veículo nos últimos 7 dias.', rotulo: 'Veículos por hora do dia', espessura: 2.2 });
    barras(cr, { horizontal: true, labels: top.map(x => curto(x.chave)), datasets: [{ label: 'Veículos', data: top.map(x => x.veiculos), cor: p.serie[0] }], vazio: 'Nenhum turno nos últimos 7 dias.', rotulo: 'Ranking das barreiras por veículos', maxRotulo: 26, espessura: 3.2 });
    if (K.porBar.length > top.length) cr.appendChild(el('div', 'tv-nota', `+${plural(K.porBar.length - top.length, 'local', 'locais')} com menos veículos`));
  }

  /* ================= 4. TF de Barreira — últimos 30 dias ================= */
  const fatiar = (s, n) => ({ labels: s.labels.slice(0, n), datasets: s.datasets.map(d => Object.assign({}, d, { data: d.data.slice(0, n) })).filter(d => d.data.some(Boolean)) });
  function telaTF(palco) {
    const M = P.aba('tf'); if (!M || !M.calculos) { palco.appendChild(el('div', 'tv-aviso', '<b>Aba TF não carregada.</b>')); return; }
    const d = P.dados, f = P.filtros, p = P.paleta, K = M.calculos(d, f, p);
    kpisTV(palco, escolher(M.indicadores(d, f), ['tfs', 'liberacao', 'apreensao', 'rechaco', 'reincidentes'], { apreensao: { rotulo: 'Apreensões' }, rechaco: { rotulo: 'Rechaços' } }));
    // uma legenda para as três (a cor segue o procedimento em todo o painel)
    const vistos = new Map(); [K.dia, K.produtos, K.rotas].forEach(s => s.datasets.forEach(x => vistos.set(x.label, x.cor)));
    if (vistos.size) legenda(palco, [...vistos].map(([txt, cor]) => ({ txt, cor }))).classList.add('tv-leg-topo');
    const g = el('div', 'tv-grade tv-grade-2'); palco.appendChild(g);
    const cd = cartao(g, 'TFs por dia, por procedimento', 'Somente TFs válidos (cancelados ficam na auditoria)');
    const col = el('div', 'tv-coluna'); g.appendChild(col);
    const cp = cartao(col, 'Produtos mais apreendidos ou rechaçados', 'Nº de TFs em que o produto aparece', 'tv-flex');
    const cr = cartao(col, 'Principais rotas (origem → destino)', 'Nº de TFs por rota', 'tv-flex');
    barras(cd, { labels: K.dia.labels, datasets: K.dia.datasets, empilhado: true, rotulos: 'max', vazio: 'Nenhum TF nos últimos 30 dias.', rotulo: 'TFs por dia', espessura: 2.2 });
    barras(cp, Object.assign(fatiar(K.produtos, 5), { horizontal: true, empilhado: true, vazio: 'Nenhuma apreensão ou rechaço no período.', rotulo: 'Produtos retidos', maxRotulo: 22 }));
    barras(cr, Object.assign(fatiar(K.rotas, 5), { horizontal: true, empilhado: true, vazio: 'Origem e destino não informados nos TFs do período.', rotulo: 'Principais rotas', maxRotulo: 30 }));
  }

  /* ================= 5. PCE — últimos 30 dias ================= */
  function telaPCE(palco) {
    const M = P.aba('pce'); if (!M || !M.calculos) { palco.appendChild(el('div', 'tv-aviso', '<b>Aba PCE não carregada.</b>')); return; }
    const d = P.dados, f = P.filtros, p = P.paleta, K = M.calculos(d, f), cb = K.cob;
    // cobertura municipal: indicador com medidor (cobertos ÷ municípios do estado)
    kpisTV(palco, escolher(M.indicadores(d, f), ['levantamentos', 'taxa', 'amostras', 'termos', 'cobertura'],
      { cobertura: { medidor: cb.total ? cb.cobertos / cb.total : 0, detalhe: `${fmt.int(cb.semVisitaAno)} sem nenhum no último ano` } }));
    const g = el('div', 'tv-grade tv-grade-pce'); palco.appendChild(g);
    const cm = cartao(g, 'Calor de pragas e levantamentos', 'Detecções de pragas/doenças e levantamentos com GPS', 'tv-cartao-mapa');
    const divMapa = el('div', 'tv-mapa-lugar'); cm.appendChild(divMapa);
    const semGPS = d.levantamentos.filter(l => l.lat == null || l.lon == null).length;
    legenda(cm, [{ marca: `<i class="tv-lg-pto" style="background:${p.serie[1]};box-shadow:0 0 0 2px ${p.ink}"></i>`, txt: 'Levantamento com praga' },
      { marca: `<i class="tv-lg-pto" style="background:${p.serie[0]};box-shadow:0 0 0 2px ${p.ink}"></i>`, txt: 'Sem praga' },
      { marca: `<i class="tv-lg-gra" style="background:linear-gradient(90deg, ${Object.values(p.calor).join(',')})"></i>`, txt: 'Calor das detecções' }]
      .concat(semGPS ? [{ marca: '', txt: `${fmt.int(semGPS)} sem GPS (fora do mapa)` }] : []));
    const col = el('div', 'tv-coluna'); g.appendChild(col);
    const cp = cartao(col, 'Detecções por praga', 'Nº de culturas com a praga detectada', 'tv-flex');
    const novos = K.focos.filter(x => x.novo).sort((a, b) => String(b.primeira).localeCompare(String(a.primeira)));
    const cf = cartao(col, `Novos focos (${fmt.int(novos.length)})`, 'Praga sem registro no município nos 365 dias anteriores · mais recentes primeiro', 'tv-flex tv-flex-maior tv-cartao-focos');
    const lf = el('ul', 'tv-focos'); cf.appendChild(lf);
    if (!novos.length) lf.innerHTML = `<li class="tv-foco-nada">Nenhum foco novo no período${K.focos.length ? ` · ${plural(K.focos.length, 'foco recorrente', 'focos recorrentes')}` : ''}</li>`;
    else lf.innerHTML = novos.map(x => `<li class="tv-foco"><i class="tv-dot critico" aria-hidden="true"></i><div class="tv-foco-txt"><b>${esc(x.praga)}</b> — ${esc(x.municipio)}</div><span>desde ${esc(fmt.dataCurta(x.primeira))}${x.deteccoes > 1 ? ` · ${fmt.int(x.deteccoes)} detecções` : ''}</span></li>`).join('');

    // mapa: calor das detecções + pontos dos levantamentos (mesmas cores do painel: laranja com anel = praga, azul = sem praga)
    const m = mapaTV(divMapa);
    if (m) {
      const pts = []; d.levantamentos.forEach(l => { if (l.lat == null || l.lon == null) return; l.culturasLista.forEach(c => { if (c.praga) pts.push([l.lat, l.lon, 1]); }); });
      if (L.heatLayer && pts.length) L.heatLayer(pts, { radius: px(3.2), blur: px(2.6), maxZoom: m.map.getZoom(), minOpacity: 0.35, gradient: p.calor }).addTo(m.map);
      d.levantamentos.slice().sort((a, b) => a.detectou - b.detectou).forEach(l => {
        if (l.lat == null || l.lon == null) return;
        L.circleMarker([l.lat, l.lon], l.detectou ? { radius: px(1.3), color: p.ink, weight: 2, fillColor: p.serie[1], fillOpacity: 1, interactive: false }
          : { radius: px(1), color: p.ink, weight: 2, fillColor: p.serie[0], fillOpacity: 1, interactive: false }).addTo(m.map);
      });
    }
    const pr = K.pragas.slice(0, 6);
    barras(cp, { horizontal: true, labels: pr.map(x => x[0]), datasets: [{ label: 'Detecções', data: pr.map(x => x[1]), cor: p.serie[1] }], vazio: 'Nenhuma praga detectada no período.', rotulo: 'Detecções por praga', maxRotulo: 24, espessura: 2.4 });
    caber(lf, k => `+${plural(k, 'foco novo', 'focos novos')}`);                // por último: com o espaço final de cada cartão
  }

  /* ---------------- operação 24 h ---------------- */
  const telaCheia = () => !!document.fullscreenElement || (window.innerHeight >= screen.height - 1 && window.innerWidth >= screen.width - 1);
  function entrarTelaCheia() {
    esconderDica();
    const d = document.documentElement;
    if (d.requestFullscreen && !document.fullscreenElement) { try { const r = d.requestFullscreen({ navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } catch (e) { /* sem suporte */ } }
  }
  function alternarTelaCheia() { if (document.fullscreenElement) { const r = document.exitFullscreen(); if (r && r.catch) r.catch(() => {}); } else entrarTelaCheia(); }
  /**
   * Dica "Clique para tela cheia": some em 15 s na primeira abertura. Depois de uma recarga automática (6 h ou versão nova) o navegador
   * sai da tela cheia e não deixa voltar sem um gesto: a dica fica fixa até alguém clicar (o ideal é o modo quiosque, ver README).
   */
  function mostrarDica() {
    let recarga = false; try { recarga = !!sessionStorage.getItem(SS_RECARGA); sessionStorage.removeItem(SS_RECARGA); } catch (e) { /* sem armazenamento */ }
    if (telaCheia() || !document.documentElement.requestFullscreen) return;
    const d = $('#tv-dica'); d.hidden = false; d.classList.toggle('fixa', recarga);
    d.textContent = recarga ? 'A página foi atualizada — clique em qualquer lugar para voltar à tela cheia' : 'Clique em qualquer lugar para tela cheia';
    clearTimeout(T.dicaTimer); if (!recarga) T.dicaTimer = setTimeout(esconderDica, DICA_MS);
  }
  function recarregar() { try { sessionStorage.setItem(SS_RECARGA, '1'); } catch (e) { /* idem */ } location.reload(); }
  function esconderDica() { const d = $('#tv-dica'); if (d) d.hidden = true; clearTimeout(T.dicaTimer); }
  document.addEventListener('fullscreenchange', () => { const b = $('#tv-cheia'); if (b) b.textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia'; if (document.fullscreenElement) esconderDica(); });

  // tela sempre acesa (Screen Wake Lock); o navegador solta o bloqueio quando a aba fica oculta → pede de novo ao voltar
  async function manterAcesa() {
    if (!ativo || document.hidden || T.wake || !('wakeLock' in navigator)) return;
    try { T.wake = await navigator.wakeLock.request('screen'); T.wake.addEventListener('release', () => { T.wake = null; }); } catch (e) { T.wake = null; }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) manterAcesa(); });

  // cursor e botões somem após 3 s parado; mexer o mouse mostra "Tela cheia" e "Sair do modo TV"
  function mexeu() {
    if (!ativo) return;
    const b = document.body; b.classList.remove('tv-ocioso'); b.classList.add('tv-mexeu');
    clearTimeout(T.ocioso);
    T.ocioso = setTimeout(() => { b.classList.add('tv-ocioso'); b.classList.remove('tv-mexeu'); }, OCIOSO_MS);
  }
  ['mousemove', 'pointerdown', 'wheel'].forEach(ev => document.addEventListener(ev, mexeu, { passive: true }));

  document.addEventListener('keydown', e => {
    if (!ativo || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') { e.preventDefault(); desligar(); return; }
    if (loginVisivel()) return;                                           // digitando o código de administrador
    if (e.key === 'ArrowRight') { e.preventDefault(); ir(T.i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(T.i - 1); }
    else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); pausar(!T.pausado); }
  });
  window.addEventListener('resize', () => { if (!ativo) return; clearTimeout(T.redim); T.redim = setTimeout(() => desenhar(false), 300); });

  // versão nova do painel (service worker atualizado) → recarrega sozinho no modo TV, sem perguntar
  if ('serviceWorker' in navigator) {
    let controlado = !!navigator.serviceWorker.controller, recarregando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const antes = controlado; controlado = true;
      if (!antes || !ativo || recarregando) return;                       // 1ª instalação não recarrega
      recarregando = true; recarregar();
    });
  }
  function vigiar() {
    if (!ativo) return;
    if (Date.now() - T.ultimaVersao >= VERSAO_MS && navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      T.ultimaVersao = Date.now();
      navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => { /* sem rede: tenta depois */ });
    }
    // recarga a cada 6 h (libera a memória do Leaflet/Chart.js) — só com conexão, para nunca trocar dados na tela por uma página vazia
    const e = P.estado();
    if (Date.now() - T.inicio >= RECARREGAR_MS && navigator.onLine !== false && e.ultimaCarga && Date.now() - e.ultimaCarga < 2 * 60 * 1000 && !loginVisivel()) recarregar();
  }

  /* ---------------- liga / desliga ---------------- */
  function aplicarClasses() {
    document.body.classList.add('tv'); document.documentElement.classList.remove('tv-cedo');
    document.documentElement.dataset.theme = opc.tema;
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = opc.tema === 'dark' ? '#1a1a19' : '#0B3A82';
  }
  function ligar() {
    ativo = true; aplicarClasses(); montar();
    T.i = 0; T.pausado = false; T.resta = opc.rotacaoMs;
    cabecalho(); clearInterval(T.relogio); T.relogio = setInterval(cabecalho, 1000);
    clearInterval(T.vigia); T.vigia = setInterval(vigiar, 60 * 1000);
    desenhar(true); agendarTroca(); manterAcesa(); mexeu(); mostrarDica();
  }
  /** Botão "Modo TV" (computador): liga já, com o gesto do clique servindo para a tela cheia. */
  function entrar() {
    if (ativo) return;
    P.ls.set(LS_TV, '1'); entrarTelaCheia(); ligar(); P.trocarModo();
  }
  /** Sair do modo TV (botão ou Esc): volta ao painel normal; não faz logout. */
  function desligar() {
    if (!ativo) return;
    ativo = false; P.ls.del(LS_TV);
    const u = new URL(location.href);
    if (['tv', 'rotacao', 'tema', 'telas'].some(k => u.searchParams.has(k))) {
      ['tv', 'rotacao', 'tema', 'telas'].forEach(k => u.searchParams.delete(k));
      history.replaceState(history.state, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + u.hash);
    }
    clearTimeout(T.timer); clearInterval(T.relogio); clearInterval(T.vigia); clearTimeout(T.ocioso); esconderDica();
    limpar(); if (T.raiz) $('#tv-palco').innerHTML = '';
    document.body.classList.remove('tv', 'tv-ocioso', 'tv-mexeu'); document.documentElement.classList.remove('tv-cedo');
    delete document.documentElement.dataset.theme;
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = '#0B3A82';
    if (T.wake) { T.wake.release().catch(() => {}); T.wake = null; }
    if (document.fullscreenElement) { const r = document.exitFullscreen(); if (r && r.catch) r.catch(() => {}); }
    P.trocarModo();
  }

  if (ativo) { aplicarClasses(); montar(); }                              // antes do 1º desenho: sem piscar o painel normal
  const btn = document.getElementById('pn-tv'); if (btn) btn.addEventListener('click', entrar);

  P.usarTV({
    ativo: () => ativo,
    iniciar: () => { if (ativo) ligar(); },
    atualizar: () => { if (ativo) { desenhar(false); cabecalho(); } },
    novoTF
  });

  /** Ganchos para testes e operação manual pelo console. */
  window.PainelTV = {
    get ativo() { return ativo; }, get opcoes() { return { rotacaoMs: opc.rotacaoMs, tema: opc.tema, telas: opc.telas.slice() }; },
    estado: () => ({ ativo, indice: T.i, tela: opc.telas[T.i], pausado: T.pausado, restaMs: T.pausado ? T.resta : Math.max(0, T.fimEm - Date.now()), graficos: T.graficos.length, mapas: T.mapas.length }),
    ir: alvo => { const i = typeof alvo === 'number' ? alvo : opc.telas.indexOf(alvo); if (i >= 0) ir(i); },
    proxima: () => ir(T.i + 1), anterior: () => ir(T.i - 1),
    pausar: () => pausar(true), retomar: () => pausar(false),
    redesenhar: () => desenhar(false), entrar, sair: desligar
  };
})();
