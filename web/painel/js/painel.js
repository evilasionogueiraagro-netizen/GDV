/* Painel gerencial do GDV (GitHub Pages). Núcleo: login do administrador, filtros, carga de dados, abas, mapa do Amazonas,
   Visão geral e helpers para as abas de módulo (objeto global Painel). As abas Barreiras, TF e PCE ficam em painel-*.js. */
const Painel = (() => {
  'use strict';
  const LS_TOKEN = 'gdv.painel.token', LS_NOME = 'gdv.painel.nome', LS_ABA = 'gdv.painel.aba', LS_FILTRO = 'gdv.painel.filtro';
  const LS_SEM_INSTALAR = 'gdv.painel.semInstalar';
  const API_TEMPO_MS = 90 * 1000, LS_ENCERRADA = 'gdv.painel.encerrada';
  const ATUALIZAR_MS = 60 * 1000, SEM_SINAL_MIN = 30, ABERTA_LONGA_H = 14, MAX_DIAS = 366;
  // falha de rede: nova tentativa com espera crescente (15 s, 30 s, 1 min, 2 min, 4 min, 5 min…), mantendo os últimos dados na tela
  const ESPERA_INI_MS = 15 * 1000, ESPERA_MAX_MS = 5 * 60 * 1000;
  const CELULAR = '(max-width: 899px)';
  // atualização automática: de minuto em minuto só as barreiras em andamento (leve); o período inteiro a cada 10 min
  // (ou a cada minuto em períodos de até 7 dias, que são pequenos)
  const COMPLETA_MS = 10 * 60 * 1000, DIAS_COMPLETA_SEMPRE = 7;
  const AM_LIMITES = [[-9.9, -73.9], [2.3, -56.0]];
  // TF em preenchimento (apreensão em andamento): enquanto houver um, as barreiras ao vivo são consultadas a cada 25 s;
  // sem batimento do aparelho há mais de 10 min o TF é considerado encerrado (o servidor já filtra; aqui vale também sem conexão)
  const TF_RAPIDO_MS = 25 * 1000, TF_VALIDADE_MS = 10 * 60 * 1000;
  const ORDEM_ABAS = ['geral', 'barreiras', 'tf', 'pce', 'acessos'];

  /* ---------------- utilidades ---------------- */
  const $ = s => document.querySelector(s);
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
               set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } },
               del: k => { try { localStorage.removeItem(k); } catch (e) { /* idem */ } } };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { if (v === '' || v == null) return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const lerJSON = (v, pad) => { if (Array.isArray(v) || (v && typeof v === 'object')) return v; try { return JSON.parse(v) || pad; } catch (e) { return pad; } };
  const pad2 = n => String(n).padStart(2, '0');
  const isoDia = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const diaDeISO = s => { const [a, m, d] = String(s).split('-').map(Number); return new Date(a, m - 1, d); };
  const somaDias = (iso, n) => { const d = diaDeISO(iso); d.setDate(d.getDate() + n); return isoDia(d); };
  const diasEntre = (a, b) => Math.round((diaDeISO(b) - diaDeISO(a)) / 864e5);
  // Datas e horas sempre no horário de Manaus (UTC−4, sem horário de verão), qualquer que seja o fuso do aparelho do gestor.
  const TZ = 'America/Manaus';
  const DTF = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const partesManaus = ms => { const o = {}; DTF.formatToParts(new Date(ms)).forEach(x => { o[x.type] = x.value; }); if (o.hour === '24') o.hour = '00'; return o; };
  const diaManaus = ms => { const o = partesManaus(ms); return `${o.year}-${o.month}-${o.day}`; };
  const horaManaus = ms => { const o = partesManaus(ms); return `${o.hour}:${o.minute}`; };
  const isoDe = v => { if (!v) return ''; if (typeof v === 'number') return diaManaus(v); const s = String(v); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
  const msDe = (data, hora) => { const d = isoDe(data); if (!d) return null; const m = String(hora || '').match(/(\d{1,2}):(\d{2})/);
    return Date.parse(`${d}T${m ? pad2(+m[1]) + ':' + m[2] : '00:00'}:00-04:00`); };     // hora de Manaus → ms
  let relogio = 0;                                      // diferença servidor − aparelho
  const agora = () => Date.now() + relogio;

  const NF = new Intl.NumberFormat('pt-BR'), NF1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const NFC = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = {
    num: (v, casas = 0) => v == null || isNaN(v) ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 }).format(v),
    int: v => v == null || isNaN(v) ? '—' : NF.format(Math.round(v)),
    compacto: v => v == null || isNaN(v) ? '—' : Math.abs(v) >= 10000 ? NFC.format(v) : NF1.format(v),
    pct: (v, casas = 0) => v == null || !isFinite(v) ? '—' : new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: casas }).format(v),
    data: s => { const d = isoDe(s); return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—'; },
    dataCurta: s => { const d = isoDe(s); return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—'; },
    hora: ms => ms ? horaManaus(ms) : '—',
    dataHora: ms => ms ? `${fmt.dataCurta(diaManaus(ms))} ${fmt.hora(ms)}` : '—',
    duracao: min => { if (min == null || isNaN(min)) return '—'; min = Math.max(0, Math.round(min)); const h = Math.floor(min / 60), m = min % 60;
      return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`; },
    horas: min => min == null ? '—' : `${NF1.format(min / 60)} h`,
    ha: v => v == null ? '—' : `${NF1.format(v)} ha`,
    mascarar: doc => { const d = String(doc || '').replace(/\D/g, ''); if (/\*/.test(String(doc || ''))) return String(doc);
      if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`; if (d.length === 14) return `**.***.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
      return d ? '***' : ''; },
    rel: ms => { if (!ms) return '—'; const min = Math.round((agora() - ms) / 60000); if (min < 1) return 'agora'; if (min < 60) return `há ${min} min`;
      const h = Math.floor(min / 60); return h < 48 ? `há ${h} h${min % 60 ? ' ' + (min % 60) + ' min' : ''}` : `há ${Math.floor(h / 24)} dias`; }
  };
  const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  /* ---------------- paleta (lida dos tokens CSS, acompanha claro/escuro) ---------------- */
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  /** Tema efetivo: o escolhido na página (data-theme, ex.: modo TV) ou o do sistema. */
  const temaEscuro = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  const paleta = () => ({
    serie: [1, 2, 3, 4, 5, 6, 7, 8].map(i => css('--s' + i)),
    status: { bom: css('--bom'), atencao: css('--atencao'), serio: css('--serio'), critico: css('--critico') },
    seq: [1, 2, 3, 4, 5].map(i => css('--q' + i)),
    calor: { 0.25: '#f9c7ae', 0.5: '#f29466', 0.75: '#eb6834', 1: '#a8360f' },
    sf: css('--sf'), sf2: css('--sf2'), ink: css('--ink'), ink2: css('--ink2'), mut: css('--mut'), eixo: css('--eixo'),
    grade: css('--grade'), base: css('--base'), escuro: temaEscuro(),
    mapa: { fundo: css('--mapa-fundo'), terra: css('--mapa-terra'), linha: css('--mapa-linha') },
    cor: i => css('--s' + ((i % 8) + 1)),
    alfa: (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
      return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
  });

  /* ---------------- municípios (malha IBGE simplificada) ---------------- */
  let GEO = null, MUN = [];                             // MUN: [{nome, chave, bbox, aneis}]
  const MUN_POR_CHAVE = {};
  async function carregarGeo() {
    if (GEO) return GEO;
    const r = await fetch('dados/am-municipios.json'); GEO = await r.json();
    GEO.features.forEach(f => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
      polys.forEach(p => p[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
      const m = { nome: f.properties.name, id: f.properties.id, chave: norm(f.properties.name), bbox: [x0, y0, x1, y1], polys };
      MUN.push(m); MUN_POR_CHAVE[m.chave] = m;
    });
    MUN.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return GEO;
  }
  const dentroAnel = (x, y, anel) => { let d = false; for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d; } return d; };
  function municipioDe(lat, lon) {
    if (lat == null || lon == null) return null;
    for (const m of MUN) {
      if (lon < m.bbox[0] || lon > m.bbox[2] || lat < m.bbox[1] || lat > m.bbox[3]) continue;
      if (m.polys.some(p => dentroAnel(lon, lat, p[0]) && !p.slice(1).some(b => dentroAnel(lon, lat, b)))) return m.nome;
    }
    return null;
  }
  /** Nome canônico do município (casa por nome sem acento; aceita "Manaus/AM", "MANAUS - AM"). */
  function municipioNome(txt) {
    if (!txt) return null;
    let k = norm(txt).replace(/\b(am|amazonas)$/, '').trim();
    if (MUN_POR_CHAVE[k]) return MUN_POR_CHAVE[k].nome;
    k = norm(String(txt).split(/[\/,(-]/)[0]);
    return MUN_POR_CHAVE[k] ? MUN_POR_CHAVE[k].nome : null;
  }

  /* ---------------- API ---------------- */
  const urlApi = () => ls.get('gdv.url') || (typeof CONFIG !== 'undefined' && CONFIG.sync && CONFIG.sync.url) || '';
  async function api(corpo) {
    const url = urlApi(); if (!url) throw new Error('Endereço do servidor não configurado (js/config.js).');
    let r, j;
    // tempo limite: uma conexão travada (Wi-Fi trocado, servidor que não responde) não pode prender as atualizações para sempre
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, lim = ctl ? setTimeout(() => ctl.abort(), API_TEMPO_MS) : null;
    const semRede = () => Object.assign(new Error('Sem conexão com o servidor. Verifique a internet.'), { rede: true });
    try {
      try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo), redirect: 'follow', signal: ctl ? ctl.signal : undefined }); }
      catch (e) { throw semRede(); }
      try { j = await r.json(); } catch (e) { if (ctl && ctl.signal.aborted) throw semRede(); throw new Error('Resposta inválida do servidor (HTTP ' + r.status + ').'); }
    } finally { clearTimeout(lim); }
    if (!j || !j.ok) throw Object.assign(new Error((j && j.erro) || 'Erro no servidor.'), { servidor: true });
    return j;
  }
  // só estas respostas do servidor encerram a sessão (credencial revogada/inválida); falha de rede, cota ou "período inválido" nunca deslogam
  const erroDeSessao = m => /sess[aã]o do painel|revogad|acesso restrito|n[aã]o autorizado|aparelho n[aã]o ativado/i.test(m || '');
  /** Chamada à API com a credencial do painel (abas que leem ou gravam fora do painelDados). Credencial recusada → volta ao login. */
  async function chamar(corpo) {
    const tok = S.token; if (!tok) throw new Error('Sessão do painel encerrada. Entre de novo.');
    try { return await api(Object.assign({}, corpo, { key: tok })); }
    catch (e) { if (e.servidor && erroDeSessao(e.message) && S.token === tok) sair(e.message); throw e; }
  }
  const aoSairFns = [];                                  // abas que guardam estado próprio (ex.: Servidores) limpam ao sair

  /* ---------------- estado ---------------- */
  const S = { token: ls.get(LS_TOKEN) || '', nome: ls.get(LS_NOME) || '', bruto: null, todos: null, dados: null, filtros: null,
              aba: ls.get(LS_ABA) || 'geral', carregando: false, ultimaCarga: 0, ultimaCompleta: 0, erro: '', falhas: 0, proxima: 0, timer: null,
              abas: {}, graficos: {}, mapas: {}, tabelas: {}, tv: null };
  // no celular a aba inicial é sempre a Visão geral (consulta rápida: barreiras em andamento no topo)
  if (matchMedia(CELULAR).matches) S.aba = 'geral';
  /** Modo TV (js/painel-tv.js) ligado: carga única dos últimos 30 dias, sem filtros; as abas não são desenhadas. */
  const emTV = () => !!(S.tv && S.tv.ativo());

  /* ---------------- filtros ---------------- */
  const PRESETS = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Mês atual'], ['ano', 'Ano'], ['custom', 'Personalizado']];
  const F = Object.assign({ preset: '30d', de: '', ate: '', fiscal: '', local: '' }, lerJSON(ls.get(LS_FILTRO), {}));
  function periodo() {
    const hoje = diaManaus(agora());                     // "hoje" de Manaus, não do fuso do aparelho
    if (emTV()) return { de: somaDias(hoje, -29), ate: hoje };
    switch (F.preset) {
      case 'hoje': return { de: hoje, ate: hoje };
      case '7d': return { de: somaDias(hoje, -6), ate: hoje };
      case 'mes': return { de: hoje.slice(0, 8) + '01', ate: hoje };
      case 'ano': return { de: hoje.slice(0, 5) + '01-01', ate: hoje };
      case 'custom': if (F.de && F.ate) return { de: F.de, ate: F.ate }; return { de: somaDias(hoje, -29), ate: hoje };
      default: return { de: somaDias(hoje, -29), ate: hoje };
    }
  }
  const salvarFiltro = () => ls.set(LS_FILTRO, JSON.stringify(F));
  function filtrosAtuais() {
    if (emTV()) { const p = periodo(); return { de: p.de, ate: p.ate, dias: diasEntre(p.de, p.ate) + 1, preset: '30d', rotuloPeriodo: `Últimos 30 dias (${fmt.dataCurta(p.de)}–${fmt.dataCurta(p.ate)})`, fiscal: '', local: null }; }
    const p = periodo(), rot = (PRESETS.find(x => x[0] === F.preset) || [])[1];
    const loc = F.local ? { tipo: F.local.slice(0, 1) === 'b' ? 'barreira' : 'municipio', valor: F.local.slice(2) } : null;
    return { de: p.de, ate: p.ate, dias: diasEntre(p.de, p.ate) + 1, preset: F.preset,
             rotuloPeriodo: F.preset === 'custom' || F.preset === 'mes' || F.preset === 'ano' ? `${fmt.data(p.de)} a ${fmt.data(p.ate)}` : `${rot} (${fmt.dataCurta(p.de)}–${fmt.dataCurta(p.ate)})`,
             fiscal: F.fiscal || '', local: loc };
  }

  /* ---------------- normalização dos dados ---------------- */
  const PROC = (typeof CONFIG !== 'undefined' && CONFIG.TF && CONFIG.TF.procedimentos) || { liberacao: 'Liberação', apreensao: 'Apreensão p/ destruição', rechaco: 'Rechaço (retorno à origem)' };
  const separarNomes = s => String(s || '').split(/\s+e\s+|,|;|\//).map(x => x.trim()).filter(Boolean);
  function parseProdutos(v) {
    return lerJSON(v, []).map(x => {
      if (x && typeof x === 'object') return { produto: String(x.p || x.produto || '').trim(), qtd: num(x.quantidade != null ? x.quantidade : x.q != null ? x.q : x.qtd), unidade: String(x.u || x.unidade || '').trim() };
      const m = String(x).match(/^(.*?)\s+-\s+([\d.,]+)\s*(.*)$/);
      return m ? { produto: m[1].trim(), qtd: num(m[2].replace(/\.(?=\d{3}\b)/g, '')), unidade: m[3].trim() } : { produto: String(x).trim(), qtd: null, unidade: '' };
    }).filter(p => p.produto);
  }
  /** Propriedade distinta: código do cadastro; sem código, nome + município (mesma regra na Visão geral e no PCE). */
  const chaveProp = l => norm(l.codigoPropriedade) || (norm(l.propriedade) ? norm(l.propriedade) + '|' + norm(l.municipio) : 'id:' + l.id);
  /** Duração de um turno aberto até o instante tAgora. */
  function duracaoAberto(t, tAgora) { t.duracaoMin = t.inicioMs != null ? Math.max(0, (tAgora - t.inicioMs) / 60000) : null; }
  /** Situação do turno no instante tAgora (sem sinal > 30 min / aberta > 14 h). */
  function situar(t, tAgora) {
    t.semSinal = t.emAndamento && (!t.ultimoSinal || tAgora - t.ultimoSinal > SEM_SINAL_MIN * 60000);
    t.abertaLonga = t.emAndamento && t.duracaoMin != null && t.duracaoMin > ABERTA_LONGA_H * 60;
    // turno esquecido aberto: nas horas de barreira (KPIs, tabelas, taxas) conta no máximo 14 h; a duração real fica em duracaoMin
    t.horasLimitadas = t.abertaLonga; t.duracaoContabilMin = t.abertaLonga ? ABERTA_LONGA_H * 60 : t.duracaoMin;
    t.situacao = !t.emAndamento ? 'encerrada' : t.abertaLonga ? 'longa' : t.semSinal ? 'semsinal' : 'ok';
  }
  /**
   * Recalcula duração e situação dos turnos em andamento com o relógio de agora (sem nova carga). O modo TV chama a cada desenho:
   * sem conexão, uma barreira continua "envelhecendo" (passa a sem sinal / aberta > 14 h) em vez de ficar congelada na última carga.
   */
  function reavaliarAbertos() {
    if (!S.todos) return; const tAgora = agora();
    expirarTF(S.todos, tAgora);
    S.todos.turnosTodos.forEach(t => { if (t.emAndamento) { duracaoAberto(t, tAgora); situar(t, tAgora); } });
  }
  /** TF em preenchimento sem batimento há mais de 10 min deixa de valer (barreira volta ao estado normal). */
  function expirarTF(N, tAgora) {
    const vale = a => !a.sinalMs || tAgora - a.sinalMs <= TF_VALIDADE_MS;
    if (N.tfsAndamento.every(vale)) return;
    N.tfsAndamento = N.tfsAndamento.filter(vale);
    N.turnosTodos.forEach(t => { if (t.tfAndamento) { t.tfAndamento = t.tfAndamento.filter(vale); if (!t.tfAndamento.length) t.tfAndamento = null; } });
  }
  /** Marcador/estado ao vivo de uma barreira aberta: TF em preenchimento na frente de tudo; depois > 14 h, sem sinal, em andamento. */
  const pinoDe = t => t.tfAndamento ? 'tf' : t.situacao;
  const ordemVivo = t => t.tfAndamento ? -1 : ORDEM_SITUACAO[t.situacao];
  const tfApreensao = t => !!(t.tfAndamento && t.tfAndamento.some(a => a.apreensao));
  const rotuloTF = t => tfApreensao(t) ? 'Apreensão em andamento' : 'TF em preenchimento';
  function normalizar(r) {
    const de = r.de || r._de, ate = r.ate || r._ate;
    const barreiras = (r.barreiras || []).map(b => ({ ...b }));
    const nomeBarreira = {}; barreiras.forEach(b => { nomeBarreira[b.id] = b.nome || b.id; });
    const vivos = x => x && !(Number(x.excluido) === 1);
    const veicPorTurno = {};
    const veiculos = (r.veiculos || []).filter(vivos).map(v => {
      const o = { ...v, pessoas: num(v.pessoas) || 0, horaNum: (String(v.hora || '').match(/^(\d{1,2})/) || [])[1] != null ? +String(v.hora).match(/^(\d{1,2})/)[1] : null,
                  sinal: Math.max(num(v.srv_ts) || 0, num(v.atualizadoEm) || 0, num(v.criadoEm) || 0) || null };
      (veicPorTurno[v.turnoId] = veicPorTurno[v.turnoId] || []).push(o); return o;
    });
    const tAgora = agora();
    const turnos = (r.turnos || []).filter(vivos).map(t0 => {
      const t = { ...t0 };
      t.latIni = num(t.latIni); t.lonIni = num(t.lngIni != null ? t.lngIni : t.lonIni); t.latFim = num(t.latFim); t.lonFim = num(t.lngFim != null ? t.lngFim : t.lonFim);
      t.encerrado = Number(t.encerrado) === 1; t.emAndamento = !t.encerrado;
      const fimOk = t.latFim != null && t.lonFim != null;
      t.lat = t.emAndamento || !fimOk ? t.latIni : t.latFim; t.lon = t.emAndamento || !fimOk ? t.lonIni : t.lonFim;
      if (t.lat == null || t.lon == null) { t.lat = fimOk ? t.latFim : null; t.lon = fimOk ? t.lonFim : null; }
      t.data = isoDe(t.data);
      t.inicioMs = num(t.inicioTs) || msDe(t.data, t.inicio);
      t.fimMs = t.encerrado ? (num(t.fimTs) || msDe(t.data, t.fim)) : null;
      if (t.fimMs != null && t.inicioMs != null && t.fimMs < t.inicioMs) t.fimMs += 864e5;   // passou da meia-noite
      if (t.encerrado) t.duracaoMin = t.inicioMs != null && t.fimMs != null ? Math.max(0, (t.fimMs - t.inicioMs) / 60000) : null;
      else duracaoAberto(t, tAgora);
      // ordem de chegada (sinal do servidor) e, no empate, pela hora: o "último veículo" fica certo em turno que passa da meia-noite
      const vs = (veicPorTurno[t.id] || []).sort((a, b) => (a.sinal || 0) - (b.sinal || 0) || String(a.hora).localeCompare(String(b.hora)));
      vs.forEach(v => { v.data = t.data; v.local = t.local; v.fiscal = t.fiscal; v.posto = t.posto; v.letra = t.letra; v.turnoAberto = t.emAndamento; v.dia = diaDoVeiculo(v, t); });
      t.veiculosLista = vs; t.nVeiculos = vs.length; t.nPessoas = vs.reduce((s, v) => s + v.pessoas, 0);
      t.ultimoVeiculo = vs.length ? vs[vs.length - 1] : null;
      t.ultimoSinal = Math.max(num(t.ultimoSinal) || 0, num(t.srv_ts) || 0, num(t.atualizadoEm) || 0, num(t.criadoEm) || 0, ...vs.map(v => v.sinal || 0)) || null;
      situar(t, tAgora);
      t.fiscais = separarNomes(t.fiscal); t.barreirasTF = [];
      t.municipio = municipioDe(t.lat, t.lon) || municipioNome(t.unidade) || null;
      t.noPeriodo = (!de || t.data >= de) && (!ate || t.data <= ate);
      vs.forEach(v => { v.municipio = t.municipio; });
      return t;
    });
    const turnoPorId = {}; turnos.forEach(t => { turnoPorId[t.id] = t; });
    // TF sendo preenchido agora no aparelho (aba Andamento): liga-se ao turno aberto pelo turnoId; sem turno aberto fica avulso
    const tfsAndamento = (r.tfsAndamento || []).map(x => {
      const a = { ...x, lat: num(x.lat), lon: num(x.lon), inicioMs: num(x.inicioTs), sinalMs: num(x.atualizadoTs) };
      a.placa = String(a.placa || ''); a.apreensao = a.procedimento === 'apreensao';
      a.titulo = a.apreensao ? 'Apreensão em andamento' : 'TF em preenchimento';
      a.procedimentoNome = a.procedimento ? (PROC[a.procedimento] || String(a.procedimento)) : 'procedimento ainda não marcado';
      const tr = turnoPorId[a.turnoId]; a.turno = tr && tr.emAndamento ? tr : null;
      a.onde = (a.turno && a.turno.local) || a.barreira || a.local || 'Local não informado';
      a.municipio = (a.turno && a.turno.municipio) || municipioDe(a.lat, a.lon) || null;
      return a;
    }).filter(a => !a.sinalMs || tAgora - a.sinalMs <= TF_VALIDADE_MS).sort((a, b) => (a.inicioMs || 0) - (b.inicioMs || 0));
    turnos.forEach(t => { t.tfAndamento = null; });
    tfsAndamento.forEach(a => { const t = a.turno; if (!t) return; (t.tfAndamento = t.tfAndamento || []).push(a);
      if (a.sinalMs > (t.ultimoSinal || 0)) { t.ultimoSinal = a.sinalMs; situar(t, tAgora); } });       // o batimento do TF também é sinal do aparelho
    const tfsTodos = (r.tfs || []).filter(vivos).map(x => {
      const t = { ...x }; t.data = isoDe(t.data); t.cancelado = Number(t.cancelado) === 1; t.numero = num(t.numero); t.ano = num(t.ano) || (t.data ? +t.data.slice(0, 4) : null);
      t.reincidente = Number(t.reincidente) === 1; t.conflito = Number(t.conflito) === 1; t.auto = Number(t.auto) === 1; t.advertencia = Number(t.advertencia) === 1;
      t.produtosLista = parseProdutos(t.produtos); t.barreiraNome = nomeBarreira[t.barreira] || t.barreira || '';
      t.procedimentoNome = PROC[t.procedimento] || (t.procedimento ? String(t.procedimento) : 'Não informado');
      t.doc = fmt.mascarar(t.doc);
      const tr = turnoPorId[t.turnoId]; t.turno = tr ? { id: tr.id, local: tr.local, municipio: tr.municipio } : null;
      // local que casa com o turno (o TF herda o local do turno no app); sem turno, o local digitado ou a barreira do cadastro
      t.localBarreira = (tr && tr.local) || t.local || t.barreiraNome || '';
      t.municipio = (tr && tr.municipio) || null;
      t.municipioOrigem = municipioNome(t.origem); t.municipioDestino = municipioNome(t.destino);
      return t;
    });
    // barreira do cadastro de cada turno, vinda dos TFs lavrados nele (o turno só guarda o local digitado)
    tfsTodos.forEach(tf => { const tr = turnoPorId[tf.turnoId]; if (tr && tf.barreiraNome && !tr.barreirasTF.includes(tf.barreiraNome)) tr.barreirasTF.push(tf.barreiraNome); });
    const levantamentos = (r.levantamentos || []).filter(vivos).map(x => {
      const l = { ...x }; l.data = isoDe(l.data); l.lat = num(l.lat); l.lon = num(l.lon); l.doc = fmt.mascarar(l.doc);
      l.culturasLista = lerJSON(l.culturas, []).filter(c => c && c.cultura).map(c => ({ ...c, area: num(c.area), praga: String(c.praga || '').trim(), coleta: c.coleta === 'Sim' }));
      l.pragas = [...new Set(l.culturasLista.map(c => c.praga).filter(Boolean))];
      l.deteccoes = l.culturasLista.filter(c => c.praga).length; l.detectou = l.deteccoes > 0;
      l.area = l.culturasLista.reduce((s, c) => s + (c.area || 0), 0);
      l.nAmostras = l.culturasLista.filter(c => c.coleta).length;
      l.municipio = municipioNome(l.municipio) || l.municipio || municipioDe(l.lat, l.lon) || '';
      l.nFotos = num(l.nFotos) || 0;
      l.chaveProp = chaveProp(l);
      return l;
    });
    const colheitasTodas = (r.colheitas || []).filter(vivos).map(x => {
      const c = { ...x }; c.data = isoDe(c.data); c.lat = num(c.lat); c.lon = num(c.lon); c.cancelado = Number(c.cancelado) === 1; c.numero = num(c.numero);
      c.ano = num(c.ano) || (c.data ? +c.data.slice(0, 4) : null); c.conflito = Number(c.conflito) === 1; c.doc = fmt.mascarar(c.doc);
      c.municipio = municipioNome(c.municipio) || c.municipio || municipioDe(c.lat, c.lon) || ''; return c;
    });
    const historicoPce = (r.historicoPce || []).map(h => ({ municipio: municipioNome(h.municipio) || h.municipio || '', data: isoDe(h.data),
      pragas: (Array.isArray(h.pragas) ? h.pragas : lerJSON(h.pragas, [])).filter(Boolean) }));
    const auditoria = r.auditoria ? { tf: auditoriaDoServidor(r.auditoria.tf, g => nomeBarreira[g] || g), pce: auditoriaDoServidor(r.auditoria.pce, g => g) }
      : { tf: auditarNumeracao(tfsTodos, t => t.barreiraNome || t.barreira), pce: auditarNumeracao(colheitasTodas, 'unidade') };
    return { agora: num(r.agora) || tAgora, de, ate, barreiras, auditoria, turnosTodos: turnos, veiculosTodos: veiculos, tfsTodos, levantamentos, colheitasTodas, historicoPce, tfsAndamento };
  }

  /**
   * Dia real (Manaus) em que o veículo passou: a data do turno, ou o dia seguinte se a hora é anterior ao início (turno que passou
   * da meia-noite). Turno aberto há 20 h ou mais pode atravessar mais de uma meia-noite: aí vale o dia em que o registro chegou ao servidor.
   */
  function diaDoVeiculo(v, t) {
    if (!t.data) return '';
    const mins = hm => { const m = String(hm || '').match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
    const hv = mins(v.hora); if (hv == null) return t.data;
    if (!(t.duracaoMin != null && t.duracaoMin < 20 * 60) && v.sinal) {
      let d = diaManaus(v.sinal); if (msDe(d, v.hora) > v.sinal + 5 * 60000) d = somaDias(d, -1);
      return d < t.data ? t.data : d;
    }
    const hi = mins(t.inicio);
    return hi != null && hv < hi - 30 ? somaDias(t.data, 1) : t.data;
  }

  /**
   * Aplica fiscal e barreira/município e separa períodos, válidos e cancelados.
   * faixa {de, ate} (opcional): recorte de datas dentro do período carregado (o modo TV calcula hoje, 7 e 30 dias de uma carga só);
   * o histórico do PCE passa a ser os 365 dias anteriores ao recorte (para "novo foco" e cobertura valerem como numa carga própria).
   */
  function aplicarFiltros(N, f, faixa) {
    const fis = f.fiscal ? norm(f.fiscal) : '', loc = f.local;
    // nome a nome e por igualdade ("João" não traz "João Carlos"; "Ana Silva" não traz "Juliana Silva")
    const temFiscal = (...nomes) => !fis || nomes.some(n => n && separarNomes(n).some(x => norm(x) === fis));
    // barreira do cadastro escolhida: casa também com o "local" cadastrado dela (é o texto que vai para o turno no app)
    const alvos = !loc || loc.tipo !== 'barreira' ? [] : [norm(loc.valor)].concat(N.barreiras.filter(b => norm(b.nome) === norm(loc.valor) && b.local).map(b => norm(b.local)));
    const barreiraOk = (...txts) => !loc || loc.tipo !== 'barreira' || txts.some(t => t && alvos.includes(norm(t)));
    const munOk = m => !loc || loc.tipo !== 'municipio' || norm(m) === norm(loc.valor);
    const turnoOk = t => temFiscal(t.fiscal, t.usuario) && barreiraOk(t.local, ...t.barreirasTF) && munOk(t.municipio);
    const naFaixa = faixa ? (x => x.data >= faixa.de && x.data <= faixa.ate) : () => true;
    const turnosTodos = N.turnosTodos.filter(turnoOk);
    const turnos = turnosTodos.filter(t => faixa ? naFaixa(t) : t.noPeriodo);
    const emAndamento = turnosTodos.filter(t => t.emAndamento);
    const ids = new Set(turnos.map(t => t.id));
    const veiculos = N.veiculosTodos.filter(v => ids.has(v.turnoId));
    const tfsTodos = N.tfsTodos.filter(t => naFaixa(t) && temFiscal(t.fiscal, t.usuario) && barreiraOk(t.barreiraNome, t.barreira, t.local, t.turno && t.turno.local) && munOk(t.municipio));
    const pceOk = x => naFaixa(x) && temFiscal(x.servidor, x.usuario) && munOk(x.municipio);     // filtro de barreira não se aplica ao PCE
    const levantamentos = N.levantamentos.filter(pceOk);
    const colheitasTodas = N.colheitasTodas.filter(pceOk);
    let historicoPce = N.historicoPce;
    if (faixa && faixa.de > (N.de || '')) {
      const lim = somaDias(faixa.de, -365);
      historicoPce = N.historicoPce.filter(h => h.data >= lim)
        .concat(N.levantamentos.filter(l => l.data >= lim && l.data < faixa.de).map(l => ({ municipio: l.municipio, data: l.data, pragas: l.pragas })));
    }
    return { agora: N.agora, de: faixa ? faixa.de : N.de, ate: faixa ? faixa.ate : N.ate, barreiras: N.barreiras, auditoria: N.auditoria, turnos, emAndamento, veiculos,
             tfs: tfsTodos.filter(t => !t.cancelado), tfsCancelados: tfsTodos.filter(t => t.cancelado), tfsTodos,
             levantamentos, colheitas: colheitasTodas.filter(c => !c.cancelado), colheitasCanceladas: colheitasTodas.filter(c => c.cancelado), colheitasTodas,
             historicoPce, municipios: MUN.map(m => m.nome),
             // TF em preenchimento: urgente, vale qualquer filtro; os sem turno aberto ganham marcador e cartão próprios
             tfsAndamento: N.tfsAndamento, tfsSemTurno: N.tfsAndamento.filter(a => !a.turno),
             semFiltro: N };
  }

  /* ---------------- opções dos filtros ---------------- */
  function preencherOpcoes() {
    const N = S.todos; if (!N) return;
    const nomes = new Set();
    N.turnosTodos.forEach(t => t.fiscais.forEach(n => nomes.add(n)));
    N.tfsTodos.forEach(t => t.fiscal && separarNomes(t.fiscal).forEach(n => nomes.add(n)));
    N.levantamentos.forEach(l => l.servidor && nomes.add(String(l.servidor).trim()));
    N.colheitasTodas.forEach(c => c.servidor && nomes.add(String(c.servidor).trim()));
    if (F.fiscal) nomes.add(F.fiscal);
    const selF = $('#pn-fiscal');
    selF.innerHTML = '<option value="">Todos</option>' + [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(n => `<option ${n === F.fiscal ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const bars = new Set();
    N.barreiras.forEach(b => b.nome && bars.add(b.nome));
    N.turnosTodos.forEach(t => t.local && bars.add(t.local));
    if (F.local && F.local.startsWith('b:')) bars.add(F.local.slice(2));
    const opt = (v, t) => `<option value="${esc(v)}" ${v === F.local ? 'selected' : ''}>${esc(t)}</option>`;
    $('#pn-local').innerHTML = '<option value="">Todos</option>' +
      `<optgroup label="Barreiras / locais">${[...bars].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(b => opt('b:' + b, b)).join('')}</optgroup>` +
      `<optgroup label="Municípios">${MUN.map(m => opt('m:' + m.nome, m.nome)).join('')}</optgroup>`;
  }
  function desenharPresets() {
    $('#pn-presets').innerHTML = PRESETS.map(([k, t]) => `<button type="button" class="pn-chip" data-preset="${k}" aria-pressed="${F.preset === k}">${t}</button>`).join('');
    $('#pn-custom').hidden = F.preset !== 'custom';
    const p = periodo(); $('#pn-de').value = p.de; $('#pn-ate').value = p.ate;
  }

  /* ---------------- carga ---------------- */
  function status(txt, erro) { const el = $('#pn-status'); el.className = 'pn-status' + (erro ? ' erro' : ''); el.innerHTML = `<span class="pn-ponto"></span>${esc(txt)}`; }
  /** Falha numa atualização: sessão revogada → login; qualquer outra (rede, cota, servidor fora) → mantém os dados e tenta de novo. */
  function falhou(e) {
    S.erro = e.message;
    if (e.servidor && erroDeSessao(e.message)) { sair(e.message); return true; }
    S.falhas++;
    status(`Falha ao atualizar às ${fmt.hora(Date.now())}: ${e.message}${S.todos ? ` · exibindo dados de ${fmt.hora(S.ultimaCarga)}` : ''}`, true);
    return false;
  }
  async function carregar(auto) {
    if (S.carregando) { if (!auto) S.repetir = true; return; }   // pedido manual no meio de uma atualização: refaz ao terminar
    S.carregando = true;
    const p = periodo(), tok = S.token;
    $('#pn-conteudo').classList.add('carregando');
    if (!auto) status('Carregando…');
    try {
      await carregarGeo();
      const t0 = Date.now();
      const j = await api({ action: 'painelDados', key: tok, de: p.de, ate: p.ate });
      if (S.token !== tok) return;                                     // saiu no meio
      if (num(j.agora)) relogio = num(j.agora) - Math.round((t0 + Date.now()) / 2);
      j.de = (j.periodo && j.periodo.de) || j.de || p.de; j.ate = (j.periodo && j.periodo.ate) || j.ate || p.ate;
      S.bruto = j; S.todos = normalizar(j); S.ultimaCarga = S.ultimaCompleta = S.ultimaRegular = Date.now(); S.erro = ''; S.falhas = 0;
      preencherOpcoes(); recalcular(auto); processarTF();
      status(`Atualizado às ${fmt.hora(Date.now())} · atualização automática a cada minuto${S.tfRapido ? ' (barreiras a cada 25 s: TF em preenchimento)' : ''}`);
    } catch (e) {
      if (S.token !== tok || falhou(e)) return;
      if (!S.todos && !emTV()) { const c = $('#pn-conteudo'); c.innerHTML = `<div class="pn-cartao pn-falha" role="alert"><b>Não foi possível carregar os dados.</b><p class="pn-sub">${esc(e.message)} Nova tentativa automática em instantes.</p><button type="button" class="pn-btn" id="pn-tentar">Tentar de novo</button></div>`;
        $('#pn-tentar').onclick = () => carregar(); }
      if (emTV()) S.tv.atualizar();
    } finally {
      S.carregando = false; $('#pn-conteudo').classList.remove('carregando');
      if (S.repetir) { S.repetir = false; setTimeout(() => carregar(), 0); }
    }
  }
  /** Atualização leve: pede só os turnos em andamento (e os que estavam abertos, para saber se encerraram) com seus veículos. */
  async function carregarAoVivo() {
    if (S.carregando || !S.bruto) return; S.carregando = true;
    const p = periodo(), B = S.bruto, tok = S.token;
    try {
      const ids = (B.turnos || []).filter(t => Number(t.encerrado) !== 1).map(t => t.id);
      const t0 = Date.now();
      const j = await api({ action: 'painelDados', key: tok, de: B.de || p.de, ate: B.ate || p.ate, aoVivo: true, ids });
      if (S.bruto !== B || S.token !== tok) return;                    // uma carga completa chegou no meio / saiu
      if (num(j.agora)) { relogio = num(j.agora) - Math.round((t0 + Date.now()) / 2); B.agora = j.agora; }
      const tocados = new Set(ids.concat((j.turnos || []).map(t => t.id)));
      B.turnos = (B.turnos || []).filter(t => !tocados.has(t.id)).concat(j.turnos || []);
      B.veiculos = (B.veiculos || []).filter(v => !tocados.has(v.turnoId)).concat(j.veiculos || []);
      B.tfsAndamento = j.tfsAndamento || [];
      S.todos = normalizar(B); S.ultimaCarga = Date.now(); S.erro = ''; S.falhas = 0;
      preencherOpcoes(); recalcular(true); processarTF();
      status(`Atualizado às ${fmt.hora(Date.now())} · barreiras ao vivo a cada ${S.tfRapido ? '25 s (TF em preenchimento)' : 'minuto'}; demais dados às ${fmt.hora(S.ultimaCompleta)} (a cada 10 min)`);
    } catch (e) {
      if (S.token === tok && !falhou(e) && emTV()) S.tv.atualizar();
    } finally {
      S.carregando = false;
      if (S.repetir) { S.repetir = false; setTimeout(() => carregar(), 0); }
    }
  }
  function atualizarSozinho() {
    const f = filtrosAtuais();
    if (!S.bruto || f.dias <= DIAS_COMPLETA_SEMPRE || Date.now() - (S.ultimaCompleta || 0) >= COMPLETA_MS) return carregar(true);
    return carregarAoVivo();
  }
  function recalcular(auto) {
    if (!S.todos) return;
    S.filtros = filtrosAtuais(); S.dados = aplicarFiltros(S.todos, S.filtros);
    if (emTV()) { S.tv.atualizar(); return; }                         // no modo TV quem desenha é o painel-tv.js
    desenharAbas(); renderAba(auto);
  }
  /**
   * Próxima atualização automática: a cada minuto; com TF em preenchimento, a cada 25 s (entre as atualizações normais, só a consulta
   * leve das barreiras ao vivo); depois de falha, espera crescente (15 s → 5 min).
   */
  function agendar(ms) {
    clearTimeout(S.timer);
    if (!S.token) return;
    if (ms == null) ms = S.falhas ? Math.min(ESPERA_MAX_MS, ESPERA_INI_MS * 2 ** (S.falhas - 1)) : S.tfRapido ? TF_RAPIDO_MS : ATUALIZAR_MS;
    S.proxima = Date.now() + ms;
    S.timer = setTimeout(async () => {
      if (!S.token) return;
      if (!document.hidden && !$('#pn-app').hidden) {
        try {
          if (S.tfRapido && S.bruto && !S.falhas && Date.now() - (S.ultimaRegular || 0) < ATUALIZAR_MS - 2000) await carregarAoVivo();
          else { S.ultimaRegular = Date.now(); await atualizarSozinho(); }
        } catch (e) { /* tratado em carregar */ }
      }
      agendar();
    }, ms);
  }

  /* ---------------- TF em preenchimento: aviso, som e notificação ---------------- */
  // "visto" = já avisado nesta sessão (som/notificação/salto da TV uma vez por TF; de novo se passar a ser apreensão)
  const TFA = { vistos: new Set(), dispensados: new Set(), sons: 0, notificacoes: 0, audio: null, avisos: 0 };
  function audioCtx() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    if (!TFA.audio) TFA.audio = new AC();
    return TFA.audio;
  }
  /** Primeiro gesto na página (clique/tecla) libera o áudio: navegadores bloqueiam som sem interação (no quiosque, ver README). */
  function destravarAudio() { try { const a = audioCtx(); if (a && a.state === 'suspended') a.resume().catch(() => {}); } catch (e) { /* sem áudio */ } }
  /** Três bipes curtos (Web Audio). Bloqueado pelo navegador → silêncio, sem erro. */
  function tocarSom() {
    TFA.sons++;
    try {
      const a = audioCtx(); if (!a) return;
      const tocar = () => {
        const t0 = a.currentTime + 0.03;
        [0, 0.24, 0.48].forEach((d, i) => {
          const o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.value = i === 1 ? 660 : 880;
          g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.2, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.2);
          o.connect(g); g.connect(a.destination); o.start(t0 + d); o.stop(t0 + d + 0.22);
        });
      };
      if (a.state === 'running') tocar(); else a.resume().then(() => { if (a.state === 'running') tocar(); }).catch(() => {});
    } catch (e) { /* navegador bloqueou o áudio: segue em silêncio */ }
  }
  const textoTF = a => [a.fiscal && 'Fiscal: ' + a.fiscal, a.placa && 'Placa ' + a.placa, a.procedimentoNome, a.inicioMs && 'iniciado ' + fmt.rel(a.inicioMs)].filter(Boolean).join(' · ');
  /** Notificação do sistema: só se o usuário já permitiu (botão "Ativar notificações"); nunca pede permissão sozinho. */
  function notificar(novos) {
    if (emTV() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    novos.forEach(a => {
      const tit = `${a.titulo} — ${a.onde}`, op = { body: textoTF(a), tag: 'gdv-tf-' + a.id, renotify: true, requireInteraction: true, icon: 'img/icon-192.png' };
      TFA.notificacoes++;
      const direto = () => { try { new Notification(tit, op); } catch (e) { /* ex.: Android exige o service worker */ } };
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(r => r ? r.showNotification(tit, op) : direto()).catch(direto);
        else direto();
      } catch (e) { direto(); }
    });
  }
  /** Depois de cada carga: avisa os TFs novos (som, notificação, salto da TV), redesenha o aviso e acelera a atualização. */
  function processarTF() {
    const lista = S.todos ? S.todos.tfsAndamento : [], ids = new Set(lista.map(a => a.id));
    TFA.dispensados.forEach(id => { if (!ids.has(id)) TFA.dispensados.delete(id); });      // terminou: se voltar, aparece de novo
    const novos = lista.filter(a => !TFA.vistos.has(a.id) || (a.apreensao && !TFA.vistos.has(a.id + '|apreensao')));
    lista.forEach(a => { TFA.vistos.add(a.id); if (a.apreensao) TFA.vistos.add(a.id + '|apreensao'); });
    if (novos.length) {
      novos.forEach(a => TFA.dispensados.delete(a.id));
      TFA.avisos++; tocarSom(); notificar(novos);
      if (emTV() && S.tv.novoTF) S.tv.novoTF(novos);
    }
    const eraRapido = !!S.tfRapido; S.tfRapido = lista.length > 0;
    desenharAvisoTF();
    if (S.token && !S.falhas) {
      if (S.tfRapido && S.proxima - Date.now() > TF_RAPIDO_MS + 1000) agendar(TF_RAPIDO_MS);
      else if (!S.tfRapido && eraRapido) agendar(Math.max(1000, ATUALIZAR_MS - (Date.now() - (S.ultimaRegular || 0))));   // TF terminou: volta ao ritmo de 1 min
    }
  }
  /** Aviso vermelho (painel normal): fica até o TF terminar ou ser dispensado. Na TV quem mostra é a faixa do topo. */
  function desenharAvisoTF() {
    let box = $('#pn-tfaviso');
    const lista = S.token && S.todos && !emTV() ? S.todos.tfsAndamento.filter(a => !TFA.dispensados.has(a.id)) : [];
    if (!lista.length) { if (box) { box.hidden = true; box.innerHTML = ''; } return; }
    if (!box) {
      box = el('div', 'pn-tfaviso'); box.id = 'pn-tfaviso'; box.setAttribute('role', 'alert'); box.setAttribute('aria-live', 'assertive'); document.body.appendChild(box);
      box.addEventListener('click', e => { const b = e.target.closest('[data-dispensar]'); if (b) { TFA.dispensados.add(b.dataset.dispensar); desenharAvisoTF(); } });
    }
    // a animação de entrada/pulso só nos itens que acabaram de aparecer (redesenhar a cada carga não pode reiniciá-la)
    const ja = new Set([...box.querySelectorAll('[data-tf]')].map(e => e.dataset.tf));
    const html = lista.map(a => `<div class="pn-tfaviso-item${a.apreensao ? ' apreensao' : ''}${ja.has(a.id) ? '' : ' novo'}" data-tf="${esc(a.id)}">
      <span class="pn-tfaviso-ic" aria-hidden="true">TF</span>
      <div class="pn-tfaviso-txt"><b>${esc(a.titulo)}</b><span class="pn-tfaviso-onde">${esc(a.onde)}${a.municipio && a.municipio !== a.onde ? ' · ' + esc(a.municipio) : ''}${a.turno ? '' : ' · sem turno aberto'}</span>
        <small>${esc(textoTF(a))}</small></div>
      <button type="button" class="pn-tfaviso-x" data-dispensar="${esc(a.id)}" aria-label="Dispensar o aviso (${esc(a.titulo)} em ${esc(a.onde)})">Dispensar</button></div>`).join('');
    if (box.dataset.html !== html) {                                   // só troca o conteúdo se mudou (texto, itens ou apreensão)
      box.innerHTML = html; box.dataset.html = html;
    }
    box.hidden = false;
  }
  /** Botão discreto "Ativar notificações" (só no painel normal, só enquanto o navegador ainda não perguntou). */
  function desenharBotaoNotif() {
    const b = $('#pn-notif'); if (!b) return;
    b.hidden = !(typeof Notification !== 'undefined' && Notification.permission === 'default' && !emTV());
  }
  /** Troca de modo (TV ↔ normal): o período muda, então descarta os dados e recarrega. */
  function trocarModo() {
    S.bruto = S.todos = S.dados = null; S.ultimaCarga = 0;
    if (!S.token) return;
    if (!emTV()) { desenharPresets(); $('#pn-conteudo').innerHTML = ''; }
    desenharAvisoTF(); desenharBotaoNotif();
    carregar(); agendar();
  }

  /* ---------------- abas ---------------- */
  function registrarAba(def) {
    if (!def || !def.id || typeof def.render !== 'function') throw new Error('Painel.registrarAba: informe {id, titulo, render}.');
    S.abas[def.id] = def;
    if (S.dados) { desenharAbas(); if (S.aba === def.id) renderAba(); }
  }
  const abasOrdenadas = () => Object.values(S.abas).sort((a, b) => {
    const ia = ORDEM_ABAS.indexOf(a.id), ib = ORDEM_ABAS.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(a.titulo).localeCompare(String(b.titulo)); });
  function desenharAbas() {
    const lista = abasOrdenadas(); if (!S.abas[S.aba]) S.aba = 'geral';
    const nav = $('#pn-abas');
    nav.innerHTML = lista.map(a => {
      const n = typeof a.contador === 'function' && S.dados ? (() => { try { return a.contador(S.dados); } catch (e) { return 0; } })() : 0;
      return `<button type="button" role="tab" class="pn-aba" id="pn-aba-${esc(a.id)}" data-aba="${esc(a.id)}" aria-selected="${a.id === S.aba}" aria-controls="pn-conteudo">${esc(a.titulo)}${n ? `<span class="pn-aba-n" aria-label="${n} alertas">${n}</span>` : ''}</button>`;
    }).join('');
  }
  function irPara(id) { if (!S.abas[id]) return; S.aba = id; ls.set(LS_ABA, id); desenharAbas(); renderAba(); window.scrollTo({ top: 0 }); }
  function renderAba(auto) {
    const def = S.abas[S.aba], c = $('#pn-conteudo');
    if (!emTV()) $('.pn-filtros').hidden = !!(def && def.semFiltros);   // aba sem período/filtros (ex.: Servidores)
    if (!def || !S.dados || emTV()) return;
    const y = window.scrollY, h = c.offsetHeight;
    if (auto) c.style.minHeight = h + 'px';
    Object.keys(S.graficos).forEach(k => { try { S.graficos[k].destroy(); } catch (e) { /* já destruído */ } delete S.graficos[k]; });
    Object.keys(S.mapas).forEach(k => { const m = S.mapas[k]; if (m.vivo) { m.salvarVista(); m.vivo = false; try { m.map.remove(); } catch (e) { /* idem */ } } });
    S.animar = !auto;
    c.innerHTML = '';
    try { def.render(c, S.dados, S.filtros); }
    catch (e) { console.error(e); c.insertAdjacentHTML('beforeend', `<div class="pn-cartao pn-falha" role="alert"><b>Erro ao montar a aba “${esc(def.titulo)}”.</b><p class="pn-sub">${esc(e.message)}</p></div>`); }
    if (auto) { window.scrollTo(0, y); requestAnimationFrame(() => { c.style.minHeight = ''; }); }
  }

  /* ---------------- helpers de layout ---------------- */
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function secao(container, titulo, subtitulo) {
    const s = el('section', 'pn-secao'); s.appendChild(el('h2', null, esc(titulo)));
    if (subtitulo) s.appendChild(el('p', 'pn-sub', esc(subtitulo)));
    const corpo = el('div', 'pn-secao-corpo'); s.appendChild(corpo); container.appendChild(s); return corpo;
  }
  function grade(container) { const g = el('div', 'pn-grade'); container.appendChild(g); return g; }
  function cartao(container, titulo, subtitulo) {
    const c = el('div', 'pn-cartao'); if (titulo) c.appendChild(el('h3', null, esc(titulo))); if (subtitulo) c.appendChild(el('p', 'pn-sub', esc(subtitulo)));
    container.appendChild(c); return c;
  }
  function vazio(container, msg) { const v = el('div', 'pn-vazio', esc(msg || 'Sem registros no período.')); container.appendChild(v); return v; }
  function kpis(container, itens) {
    const g = el('div', 'pn-kpis');
    itens.forEach(k => {
      const v = typeof k.valor === 'number' ? fmt.compacto(k.valor) : (k.valor == null ? '—' : k.valor);
      const d = el('div', 'pn-kpi' + (k.status ? ' pn-st-' + k.status : ''));
      d.innerHTML = `<div class="pn-kpi-rot">${esc(k.rotulo)}</div><div class="pn-kpi-val">${esc(v)}</div>${k.detalhe ? `<div class="pn-kpi-det">${esc(k.detalhe)}</div>` : ''}`;
      if (k.titulo) d.title = k.titulo;
      g.appendChild(d);
    });
    container.appendChild(g); return g;
  }
  const tip = {
    mostrar(ev, html) { const t = $('#pn-tip'); t.innerHTML = html; t.hidden = false; tip.mover(ev); },
    mover(ev) { const t = $('#pn-tip'); if (t.hidden) return; const r = ev.target.getBoundingClientRect ? ev.target.getBoundingClientRect() : null;
      let x = ev.clientX != null && ev.type !== 'focus' ? ev.clientX : (r ? r.left + r.width / 2 : 0), y = ev.clientY != null && ev.type !== 'focus' ? ev.clientY : (r ? r.top : 0);
      const w = t.offsetWidth, h = t.offsetHeight; x = Math.min(Math.max(8, x - w / 2), innerWidth - w - 8); y = y - h - 12 < 8 ? y + 18 : y - h - 12;
      t.style.left = x + 'px'; t.style.top = y + 'px'; },
    esconder() { $('#pn-tip').hidden = true; }
  };

  /* ---------------- gráficos (Chart.js com o tema do dataviz) ---------------- */
  function temaChart() {
    const p = paleta();
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.font.size = 12; Chart.defaults.color = p.ink2; Chart.defaults.borderColor = p.grade;
    Chart.defaults.maintainAspectRatio = false; Chart.defaults.responsive = true;
    Chart.defaults.locale = 'pt-BR';
    const tt = Chart.defaults.plugins.tooltip;
    Object.assign(tt, { backgroundColor: p.sf, titleColor: p.ink2, bodyColor: p.ink, borderColor: p.base, borderWidth: 1, padding: 10, cornerRadius: 8,
      boxWidth: 10, boxHeight: 2, usePointStyle: false, titleFont: { weight: '500', size: 12 }, bodyFont: { weight: '600', size: 13 } });
    const lg = Chart.defaults.plugins.legend;
    lg.labels.boxWidth = 12; lg.labels.boxHeight = 12; lg.labels.color = p.ink2; lg.align = 'start';
    return p;
  }
  function grafico(container, id, config) {
    if (typeof Chart === 'undefined') { vazio(container, 'Biblioteca de gráficos não carregada.'); return null; }
    const p = temaChart();
    const { titulo, subtitulo, altura, semTabela, tabelaRotulo, ...cfg } = config || {};
    if (S.graficos[id]) { try { S.graficos[id].destroy(); } catch (e) { /* ok */ } delete S.graficos[id]; }
    const card = el('div', 'pn-cartao pn-graf');
    const cab = el('div', 'pn-graf-cab'), tt = el('div');
    if (titulo) tt.appendChild(el('h3', null, esc(titulo))); if (subtitulo) tt.appendChild(el('p', 'pn-sub', esc(subtitulo)));
    cab.appendChild(tt);
    const btn = el('button', 'pn-link', 'Ver dados'); btn.type = 'button'; if (!semTabela) cab.appendChild(btn);
    card.appendChild(cab);
    const data = cfg.data || { labels: [], datasets: [] };
    const tipo = cfg.type || 'bar', horizontal = cfg.options && cfg.options.indexAxis === 'y';
    const nSeries = data.datasets.length;
    const total = data.datasets.reduce((s, d) => s + (d.data || []).reduce((a, v) => a + (typeof v === 'number' ? v : (v && v.y) || 0), 0), 0);
    const nRot = (data.labels || []).length;
    const alt = altura || (horizontal ? Math.max(160, Math.min(600, nRot * (nSeries > 1 ? 30 : 26) + 50 + (nSeries > 1 ? 30 : 0))) : 260);
    const area = el('div', 'pn-graf-area'); area.style.height = alt + 'px';
    const canvas = el('canvas'); canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', (titulo || 'Gráfico') + (nRot ? ` — ${nRot} categorias` : ''));
    area.appendChild(canvas); card.appendChild(area);
    if (!nRot && !data.datasets.some(d => (d.data || []).length) || (total === 0 && tipo !== 'line')) {
      area.remove(); btn.remove(); vazio(card, cfg.vazio || 'Sem registros no período.'); container.appendChild(card); return null;
    }
    data.datasets.forEach((d, i) => {
      const cor = d.cor || p.cor(i);
      const t = d.type || tipo;
      if (t === 'bar') {
        if (d.backgroundColor == null) { d.backgroundColor = cor; if (d.hoverBackgroundColor == null && /^#[0-9a-f]{6}$/i.test(cor)) d.hoverBackgroundColor = p.alfa(cor, 0.8); }
        if (d.maxBarThickness == null) d.maxBarThickness = 24;
        if (d.borderRadius == null) d.borderRadius = 4;
        if (d.borderSkipped == null) d.borderSkipped = 'start';
        if (d.borderWidth == null && cfg.options && cfg.options.scales && Object.values(cfg.options.scales).some(s => s.stacked)) { d.borderWidth = { top: 2 }; d.borderColor = p.sf; }
      } else if (t === 'line') {
        if (d.borderColor == null) d.borderColor = cor;
        if (d.backgroundColor == null) d.backgroundColor = p.alfa(cor, 0.1);
        if (d.borderWidth == null) d.borderWidth = 2;
        if (d.pointRadius == null) d.pointRadius = (d.data || []).length > 40 ? 0 : 3;
        if (d.pointHoverRadius == null) d.pointHoverRadius = 5;
        if (d.pointBackgroundColor == null) d.pointBackgroundColor = cor;
        if (d.pointBorderColor == null) d.pointBorderColor = p.sf;
        if (d.pointBorderWidth == null) d.pointBorderWidth = 2;
        if (d.tension == null) d.tension = 0;
        d.borderCapStyle = 'round'; d.borderJoinStyle = 'round';
      } else if (t === 'doughnut' || t === 'pie') {
        if (d.backgroundColor == null) d.backgroundColor = (d.data || []).map((_, j) => p.cor(j));
        if (d.borderColor == null) d.borderColor = p.sf; if (d.borderWidth == null) d.borderWidth = 2;
      }
      delete d.cor;
    });
    const opts = cfg.options || {};
    opts.animation = S.animar === false ? false : (opts.animation != null ? opts.animation : { duration: 300 });
    opts.plugins = opts.plugins || {};
    opts.plugins.legend = Object.assign({ display: nSeries > 1 || tipo === 'doughnut' || tipo === 'pie', position: 'top' }, opts.plugins.legend || {});
    if (tipo === 'line' && !(opts.plugins.legend.labels)) opts.plugins.legend.labels = { boxWidth: 16, boxHeight: 3,   // chave em forma de traço (espelha a linha), na cor da linha
      generateLabels: ch => Chart.defaults.plugins.legend.labels.generateLabels(ch).map(l => ({ ...l, fillStyle: l.strokeStyle, lineWidth: 0 })) };
    opts.plugins.tooltip = Object.assign({}, opts.plugins.tooltip || {});
    if (tipo === 'line' || tipo === 'bar') { opts.interaction = Object.assign({ mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' }, opts.interaction || {}); }
    if (tipo === 'bar' || tipo === 'line') {
      opts.scales = opts.scales || {};
      const vAx = horizontal ? 'x' : 'y', cAx = horizontal ? 'y' : 'x';
      opts.scales[vAx] = Object.assign({ beginAtZero: true, grid: { color: p.grade, drawTicks: false }, border: { display: false },
        ticks: { color: p.eixo, padding: 6, precision: 0, callback: v => fmt.compacto(v) } }, opts.scales[vAx] || {});
      opts.scales[cAx] = Object.assign({ grid: { display: false }, border: { color: p.base },
        ticks: { color: p.eixo, autoSkip: true, maxRotation: 0, autoSkipPadding: 10, callback: horizontal ? function (v) { const l = this.getLabelForValue(v); return String(l).length > 26 ? String(l).slice(0, 25) + '…' : l; } : undefined } }, opts.scales[cAx] || {});
      if (opts.scales[cAx].ticks && opts.scales[cAx].ticks.callback === undefined) delete opts.scales[cAx].ticks.callback;
    }
    cfg.options = opts; cfg.data = data; cfg.type = tipo;
    container.appendChild(card);
    let ch; try { ch = new Chart(canvas, cfg); } catch (e) { console.error(e); area.innerHTML = `<div class="pn-vazio">Falha no gráfico: ${esc(e.message)}</div>`; return null; }
    S.graficos[id] = ch;
    // tabela de dados (acessibilidade: o tooltip nunca é o único caminho para o valor)
    let tabDiv = null;
    btn.onclick = () => {
      if (tabDiv) { tabDiv.remove(); tabDiv = null; btn.textContent = 'Ver dados'; return; }
      tabDiv = el('div', 'pn-graf-dados'); card.appendChild(tabDiv); btn.textContent = 'Ocultar dados';
      const cols = [{ chave: 'r', rotulo: tabelaRotulo || 'Categoria' }].concat(data.datasets.map((d, i) => ({ chave: 'v' + i, rotulo: d.label || 'Valor', num: true })));
      const linhas = (data.labels || []).map((l, j) => { const o = { r: Array.isArray(l) ? l.join(' ') : l }; data.datasets.forEach((d, i) => { const v = d.data[j]; o['v' + i] = typeof v === 'object' && v ? v.y : v; }); return o; });
      tabela(tabDiv, cols, linhas, { csv: (id || 'grafico') + '.csv', limite: 15, simples: true });
    };
    return ch;
  }

  /** Faixas inteiras [mín, máx] de cada uma das 5 classes de cor (sem sobreposição; classe sem valor inteiro → [null, null]). */
  function faixasClasses(max, classe) {
    const f = [0, 1, 2, 3, 4].map(() => [null, null]);
    const passo = Math.max(1, Math.ceil(max / 2000));
    for (let v = 1; v <= max; v += passo) { const k = classe(v); if (k < 0) continue; if (f[k][0] == null) f[k][0] = v; f[k][1] = v; }
    if (max >= 1) { const k = classe(Math.ceil(max)); if (k >= 0) { if (f[k][0] == null) f[k][0] = Math.ceil(max); f[k][1] = Math.ceil(max); } }
    return f;
  }

  /* ---------------- matriz (mapa de calor em grade: dia × hora, cultura × praga) ---------------- */
  function matriz(container, o) {
    const p = paleta(), card = el('div', 'pn-cartao pn-matriz');
    if (o.titulo) card.appendChild(el('h3', null, esc(o.titulo))); if (o.subtitulo) card.appendChild(el('p', 'pn-sub', esc(o.subtitulo)));
    const L = o.linhas || [], C = o.colunas || [], V = o.valores || [];
    let max = 0; V.forEach(l => l.forEach(v => { if (v > max) max = v; }));
    if (!L.length || !C.length || !max) { vazio(card, o.vazio || 'Sem registros no período.'); container.appendChild(card); return card; }
    const f = o.fmt || fmt.int, rotCol = o.rotuloColuna || (c => c);
    const classe = v => v <= 0 ? -1 : Math.min(4, Math.floor((v / max) * 5 - 1e-9));
    const g = el('div', 'pn-mtz'); g.style.gridTemplateColumns = `minmax(48px, ${o.larguraRotulo || '110px'}) repeat(${C.length}, minmax(0, 1fr))`;
    g.appendChild(el('div'));
    const passo = o.passoColuna || 1;
    C.forEach((c, j) => g.appendChild(el('div', 'pn-mtz-col', j % passo === 0 ? esc(rotCol(c)) : '')));
    const mostrarNum = o.mostrarValores != null ? o.mostrarValores : C.length <= 12;
    L.forEach((l, i) => {
      const r = el('div', 'pn-mtz-rot', esc(l)); r.title = l; g.appendChild(r);
      C.forEach((c, j) => {
        const v = (V[i] && V[i][j]) || 0, k = classe(v), cel = el('div', 'pn-mtz-cel');
        if (k >= 0) { cel.style.background = p.seq[k]; cel.style.color = (p.escuro ? k <= 2 : k >= 3) ? '#fff' : '#0b0b0b'; }
        if (mostrarNum && v) cel.textContent = f(v);
        cel.tabIndex = 0; cel.setAttribute('aria-label', `${l}, ${rotCol(c)}: ${f(v)}`);
        const html = `<strong>${esc(f(v))}${o.rotuloValor ? ' ' + esc(o.rotuloValor) : ''}</strong>${esc(l)} · ${esc(rotCol(c))}`;
        cel.addEventListener('pointerenter', ev => tip.mostrar(ev, html)); cel.addEventListener('pointermove', tip.mover);
        cel.addEventListener('pointerleave', tip.esconder); cel.addEventListener('focus', ev => tip.mostrar(ev, html)); cel.addEventListener('blur', tip.esconder);
        g.appendChild(cel);
      });
    });
    card.appendChild(g);
    const lims = faixasClasses(max, classe);
    const esc2 = el('div', 'pn-escala', `<span>${esc(o.rotuloValor || 'Quantidade')}:</span>` +
      lims.map(([a, b], k) => a == null ? '' : `<span><i style="background:${p.seq[k]}"></i>${a === b ? fmt.int(a) : fmt.int(a) + '–' + fmt.int(b)}</span>`).join(''));
    card.appendChild(esc2);
    const btn = el('button', 'pn-link', 'Ver dados'); btn.type = 'button'; let td = null;
    btn.onclick = () => { if (td) { td.remove(); td = null; btn.textContent = 'Ver dados'; return; } td = el('div', 'pn-graf-dados'); card.appendChild(td); btn.textContent = 'Ocultar dados';
      tabela(td, [{ chave: 'l', rotulo: o.rotuloLinha || '' }].concat(C.map((c, j) => ({ chave: 'c' + j, rotulo: String(rotCol(c)), num: true }))),
        L.map((l, i) => { const x = { l }; C.forEach((c, j) => { x['c' + j] = (V[i] && V[i][j]) || 0; }); return x; }), { csv: (o.id || 'matriz') + '.csv', simples: true, limite: 30 }); };
    esc2.appendChild(btn);
    container.appendChild(card); return card;
  }

  /* ---------------- tabela (ordenável, busca, CSV) ---------------- */
  function csvTexto(colunas, linhas) {
    const val = (c, l) => { const v = c.csv ? c.csv(l[c.chave], l) : (c.fmt && !c.num ? c.fmt(l[c.chave], l) : l[c.chave]);
      if (v == null) return ''; if (typeof v === 'number') return String(v).replace('.', ',');
      const t = String(v); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };       // texto digitado não vira fórmula no Excel/LibreOffice
    const q = s => /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    return '﻿' + [colunas.map(c => q(c.rotulo)).join(';')].concat(linhas.map(l => colunas.map(c => q(val(c, l))).join(';'))).join('\r\n');
  }
  function csvBaixar(nome, colunas, linhas) {
    const txt = csvTexto(colunas, linhas);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = nome || 'dados.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function tabela(container, colunas, linhas, opts) {
    opts = opts || {};
    const chaveEstado = opts.id || opts.csv || colunas.map(c => c.chave).join('|');
    const st = S.tabelas[chaveEstado] = S.tabelas[chaveEstado] || { ord: opts.ordenar || null, desc: opts.desc != null ? !!opts.desc : true, busca: '', limite: opts.limite || 50 };
    const box = el('div', opts.simples ? 'pn-tab' : 'pn-cartao pn-tab');
    const cab = el('div', 'pn-tab-cab'), tt = el('div');
    if (opts.titulo) tt.appendChild(el('h3', null, esc(opts.titulo))); if (opts.subtitulo) tt.appendChild(el('p', 'pn-sub', esc(opts.subtitulo)));
    const acoes = el('div', 'pn-tab-acoes');
    let inp = null;
    if (!opts.simples && linhas.length > 8 && opts.busca !== false) { inp = el('input', 'pn-tab-busca'); inp.type = 'search'; inp.placeholder = 'Buscar…'; inp.value = st.busca; inp.setAttribute('aria-label', 'Buscar na tabela'); acoes.appendChild(inp); }
    if (opts.csv) { const b = el('button', 'pn-btn pn-btn-mini', 'Baixar CSV'); b.type = 'button'; b.onclick = () => csvBaixar(opts.csv, colunas, filtradas()); acoes.appendChild(b); }
    cab.appendChild(tt); cab.appendChild(acoes); if (opts.titulo || opts.subtitulo || acoes.children.length) box.appendChild(cab);
    const rolo = el('div', 'pn-tab-rolo'), rod = el('div', 'pn-tab-mais');
    box.appendChild(rolo); box.appendChild(rod);
    const texto = (c, l) => { const v = l[c.chave]; return c.fmt ? c.fmt(v, l) : (typeof v === 'number' ? fmt.num(v, 2) : (v == null || v === '' ? '—' : String(v))); };
    function filtradas() {
      let r = linhas;
      if (st.busca) { const b = norm(st.busca); r = r.filter(l => colunas.some(c => norm(texto(c, l)).includes(b))); }
      if (st.ord) { const c = colunas.find(x => x.chave === st.ord); if (c) { const k = c.ordem || (l => l[c.chave]);
        r = r.slice().sort((a, b) => { const x = k(a), y = k(b); const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'pt-BR', { numeric: true }); return st.desc ? -cmp : cmp; }); } }
      return r;
    }
    function desenhar() {
      const r = filtradas(), vis = r.slice(0, st.limite);
      if (!linhas.length) { rolo.innerHTML = `<div class="pn-vazio">${esc(opts.vazio || 'Sem registros no período.')}</div>`; rod.innerHTML = ''; return; }
      rolo.innerHTML = `<table><thead><tr>${colunas.map(c => `<th scope="col" data-k="${esc(c.chave)}" class="${c.num ? 'num' : ''}" tabindex="0" ${st.ord === c.chave ? `aria-sort="${st.desc ? 'descending' : 'ascending'}"` : ''}>${esc(c.rotulo)}</th>`).join('')}</tr></thead><tbody>` +
        vis.map(l => `<tr>${colunas.map(c => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(l[c.chave], l) : esc(texto(c, l))}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
      rod.innerHTML = `<span>${r.length === linhas.length ? fmt.int(r.length) : `${fmt.int(r.length)} de ${fmt.int(linhas.length)}`} registro(s)${r.length > vis.length ? ` · mostrando ${fmt.int(vis.length)}` : ''}</span>`;
      if (r.length > vis.length) { const m = el('button', 'pn-link', 'Mostrar mais'); m.type = 'button'; m.onclick = () => { st.limite += opts.limite || 50; desenhar(); }; rod.appendChild(m);
        const t = el('button', 'pn-link', 'Mostrar todos'); t.type = 'button'; t.onclick = () => { st.limite = Infinity; desenhar(); }; rod.appendChild(t); }
      rolo.querySelectorAll('th').forEach(th => { const fn = () => { const k = th.dataset.k; if (st.ord === k) st.desc = !st.desc; else { st.ord = k; st.desc = true; } desenhar(); };
        th.onclick = fn; th.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } }; });
    }
    if (inp) { let tm; inp.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { st.busca = inp.value; desenhar(); }, 200); }; }
    desenhar(); container.appendChild(box); return box;
  }

  /* ---------------- alertas ---------------- */
  const NIVEIS = { critico: ['!', 'Crítico'], serio: ['!', 'Sério'], atencao: ['i', 'Atenção'], info: ['i', 'Info'] };
  const ORDEM_NIVEL = { critico: 0, serio: 1, atencao: 2, info: 3 };
  const ORDEM_SITUACAO = { longa: 0, semsinal: 1, ok: 2 };              // barreiras em andamento: as com alerta primeiro
  function alertas(container, lista, opts) {
    opts = opts || {};
    const l = lista.slice().sort((a, b) => ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel]);
    if (!l.length) { const v = vazio(container, opts.vazio || 'Nenhum alerta no período. ✓'); return v; }
    const ul = el('ul', 'pn-alertas'), max = opts.max || 8;
    l.forEach((a, i) => {
      const [ic, rot] = NIVEIS[a.nivel] || NIVEIS.info;
      const li = el('li', 'pn-alerta ' + a.nivel);
      li.innerHTML = `<span class="pn-alerta-ic" aria-hidden="true">${ic}</span><div><div class="pn-alerta-tit">${esc(a.titulo)}</div>${a.detalhe ? `<div class="pn-alerta-det">${esc(a.detalhe)}</div>` : ''}</div>
        <div><span class="pn-alerta-niv">${rot}</span>${a.aba && S.abas[a.aba] ? `<br><button type="button" class="pn-link" data-ir="${esc(a.aba)}">Ver ${esc(S.abas[a.aba].titulo)} ›</button>` : ''}</div>`;
      if (i >= max) li.hidden = true;
      ul.appendChild(li);
    });
    ul.addEventListener('click', e => { const b = e.target.closest('[data-ir]'); if (b) irPara(b.dataset.ir); });
    container.appendChild(ul);
    if (l.length > max) { const b = el('button', 'pn-link', `Mostrar todos os ${l.length} alertas`); b.type = 'button'; b.style.marginTop = '8px';
      b.onclick = () => { ul.querySelectorAll('li[hidden]').forEach(x => { x.hidden = false; }); b.remove(); }; container.appendChild(b); }
    return ul;
  }

  /**
   * Auditoria da numeração (calculada no navegador sobre os registros recebidos): regs com {numero, ano, conflito, numeroOrigem, numeroSugerido,
   * cancelado}; grupo = nome do campo ou função. Devolve [{grupo, ano, total, primeiro, ultimo, lacunas:[n], lacunasTotal, duplicados:[n],
   * editados:[{numero, sugerido, usuario}], provisorios:[...], conflitos:n, cancelados:n}]. Prefira dados.auditoria (vem do servidor, ano inteiro).
   */
  function auditarNumeracao(regs, grupo) {
    const gf = typeof grupo === 'function' ? grupo : (r => r[grupo || 'barreira']);
    const G = {};
    regs.forEach(r => { if (!(r.numero > 0)) return; const k = (gf(r) || '—') + '|' + (r.ano || ''); (G[k] = G[k] || { grupo: gf(r) || '—', ano: r.ano, regs: [] }).regs.push(r); });
    const ed = r => ({ numero: r.numero, sugerido: r.numeroSugerido, usuario: r.usuario, origem: r.numeroOrigem });
    return Object.values(G).map(g => {
      const usos = {}; g.regs.forEach(r => { (usos[r.numero] = usos[r.numero] || []).push(r); });
      const nums = Object.keys(usos).map(Number).sort((a, b) => a - b);
      const lacunas = []; for (let i = 1; i < nums.length; i++) for (let n = nums[i - 1] + 1; n < nums[i]; n++) lacunas.push(n);
      return { grupo: g.grupo, ano: g.ano, total: g.regs.length, primeiro: nums[0], ultimo: nums[nums.length - 1], lacunas: lacunas.slice(0, 200), lacunasTotal: lacunas.length,
        duplicados: nums.filter(n => usos[n].length > 1), editados: g.regs.filter(r => r.numeroOrigem === 'editado').map(ed),
        provisorios: g.regs.filter(r => r.numeroOrigem === 'provisorio').map(ed), conflitos: g.regs.filter(r => r.conflito).length, cancelados: g.regs.filter(r => r.cancelado).length };
    }).sort((a, b) => String(a.grupo).localeCompare(String(b.grupo)) || (b.ano - a.ano));
  }
  /** Converte a auditoria do servidor (auditarRegs_) para o mesmo formato de auditarNumeracao. */
  function auditoriaDoServidor(lista, nomeGrupo) {
    return (lista || []).map(a => {
      const eds = (a.editados || []).map(e => ({ numero: e.numero, sugerido: e.sugerido, usuario: e.usuario, origem: e.origem }));
      return { grupo: nomeGrupo(a.grupo), grupoId: a.grupo, ano: a.ano, total: a.total, primeiro: a.primeiro, ultimo: a.ultimo, inicioEsperado: a.inicioEsperado,
        lacunas: a.lacunas || [], lacunasTotal: a.lacunasTotal != null ? a.lacunasTotal : (a.lacunas || []).length,
        duplicados: (a.duplicados || []).map(d => typeof d === 'object' ? d.numero : d), editados: eds.filter(e => e.origem !== 'provisorio'),
        provisorios: eds.filter(e => e.origem === 'provisorio'), conflitos: num(a.conflitos) || 0, cancelados: num(a.cancelados) || 0, doServidor: true };
    });
  }

  /* ---------------- contagens auxiliares ---------------- */
  function contar(lista, chave, peso) {
    const m = new Map(); lista.forEach(x => { const ks = [].concat(typeof chave === 'function' ? chave(x) : x[chave]); ks.forEach(k => { if (k == null || k === '') return; m.set(k, (m.get(k) || 0) + (peso ? peso(x) : 1)); }); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }
  /** Série diária contínua (com zeros) de de..ate. Devolve {labels:['dd/mm'], dias:['aaaa-mm-dd'], valores:[n]}. */
  function porDia(lista, de, ate, campoData, peso) {
    const n = Math.max(1, diasEntre(de, ate) + 1), dias = []; for (let i = 0; i < n && i < 400; i++) dias.push(somaDias(de, i));
    const idx = {}; dias.forEach((d, i) => { idx[d] = i; });
    const v = dias.map(() => 0);
    lista.forEach(x => { const d = typeof campoData === 'function' ? campoData(x) : x[campoData || 'data']; if (idx[d] != null) v[idx[d]] += peso ? peso(x) : 1; });
    return { labels: dias.map(fmt.dataCurta), dias, valores: v };
  }
  function topN(pares, n, outros) { if (pares.length <= n) return pares; const r = pares.slice(0, n - 1); r.push([outros || 'Outros', pares.slice(n - 1).reduce((s, x) => s + x[1], 0)]); return r; }

  /** Contagens por município (para tooltip e coroplético). */
  function porMunicipio(d) {
    const z = () => ({ levantamentos: 0, deteccoes: 0, colheitas: 0, turnos: 0, veiculos: 0, tfs: 0, tfsOrigem: 0, andamento: 0 });
    const M = {}; MUN.forEach(m => { M[m.nome] = z(); });
    const g = n => n && M[n] ? M[n] : null;
    d.levantamentos.forEach(l => { const m = g(l.municipio); if (m) { m.levantamentos++; m.deteccoes += l.deteccoes; } });
    d.colheitas.forEach(c => { const m = g(c.municipio); if (m) m.colheitas++; });
    d.turnos.forEach(t => { const m = g(t.municipio); if (m) { m.turnos++; m.veiculos += t.nVeiculos; } });
    d.emAndamento.forEach(t => { const m = g(t.municipio); if (m) m.andamento++; });
    d.tfs.forEach(t => { const m = g(t.municipio); if (m) m.tfs++; const o = g(t.municipioOrigem); if (o) o.tfsOrigem++; });
    return M;
  }

  /* ---------------- mapa do Amazonas ---------------- */
  const CAMADAS = {
    andamento: 'Barreiras em andamento', realizadas: 'Barreiras realizadas', levantamentos: 'Levantamentos PCE',
    colheitas: 'Termos de colheita', calor: 'Calor de pragas/doenças', coropletico: 'Coroplético municipal'
  };
  const INDICADORES = { deteccoes: 'Detecções de pragas', levantamentos: 'Levantamentos PCE', veiculos: 'Veículos abordados (barreira)',
                        turnos: 'Turnos de barreira', tfs: 'TFs (local da barreira)', tfsOrigem: 'TFs por município de origem', colheitas: 'Termos de colheita' };
  // tiles do OpenStreetMap que não carregam (sem internet para mapas, rede bloqueada): o mapa fica com fundo neutro + municípios
  // preenchidos (contornos legíveis) e não tenta de novo por 10 minutos (o painel redesenha a cada minuto)
  let tilesFalharamEm = 0;
  const TILES_PAUSA_MS = 10 * 60 * 1000;
  const popup = (titulo, linhas, extra) => `<div class="pn-pop"><h4>${esc(titulo)}</h4>${extra || ''}<dl>${linhas.filter(l => l && l[1] != null && l[1] !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`;
  const seloSituacao = t => t.tfAndamento ? `<span class="pn-selo tf">${rotuloTF(t)}</span>` : t.situacao === 'longa' ? '<span class="pn-selo critico">Aberta há mais de 14 h</span>' : t.situacao === 'semsinal' ? '<span class="pn-selo info">Sem sinal há mais de 30 min</span>' : t.situacao === 'ok' ? '<span class="pn-selo bom">Em andamento</span>' : '<span class="pn-selo info">Encerrada</span>';

  /**
   * Painel.mapa(container, {id, titulo, subtitulo, camadas, ativas, indicador, altura, dados})
   * camadas: subconjunto de ['andamento','realizadas','levantamentos','colheitas','calor','coropletico'] (contornos sempre).
   */
  function mapa(container, o) {
    o = o || {};
    const card = el('div', 'pn-cartao pn-mapa');
    if (typeof L === 'undefined') { card.innerHTML = '<div class="pn-vazio">Biblioteca de mapas não carregada.</div>'; container.appendChild(card); return null; }
    const id = o.id || 'mapa', d = o.dados || S.dados, p = paleta();
    const camadas = (o.camadas || Object.keys(CAMADAS)).filter(k => CAMADAS[k]);
    const memo = S.mapas[id] && S.mapas[id].memo || {};
    const ativas = new Set(memo.ativas || o.ativas || camadas.filter(k => k !== 'calor' || !camadas.includes('levantamentos')));
    const st = { praga: memo.praga || '', cultura: memo.cultura || '', indicador: memo.indicador || o.indicador || (camadas.includes('levantamentos') ? 'deteccoes' : 'veiculos') };
    const cab = el('div', 'pn-mapa-cab'); const tt = el('div');
    tt.appendChild(el('h3', null, esc(o.titulo || 'Mapa do Amazonas'))); if (o.subtitulo) tt.appendChild(el('p', 'pn-sub', esc(o.subtitulo)));
    const semc = el('div', 'pn-semcoord'); cab.appendChild(tt); cab.appendChild(semc); card.appendChild(cab);
    const ctl = el('div', 'pn-mapa-ctl'); card.appendChild(ctl);
    const div = el('div', 'pn-mapa-div pn-tiles-escuro'); if (o.altura) div.style.height = o.altura + 'px'; card.appendChild(div);
    const leg = el('div', 'pn-legenda'); card.appendChild(leg);
    container.appendChild(card);

    // controles (chips liga/desliga + seletores)
    // listas do formulário de levantamento (config.js do app) + o que já foi registrado, mesmo sem detecção no período
    const PCEcfg = (typeof CONFIG !== 'undefined' && CONFIG.PCE) || {}, cmp = (x, y) => x.localeCompare(y, 'pt-BR');
    const pragas = [...new Set([...(PCEcfg.pragas || []), ...d.levantamentos.flatMap(l => l.pragas)].filter(Boolean))].sort(cmp);
    const culturas = [...new Set([...(PCEcfg.culturas || []), ...d.levantamentos.flatMap(l => l.culturasLista.map(c => c.cultura))].filter(Boolean))].sort(cmp);
    ctl.innerHTML = camadas.map(k => `<label class="pn-chip"><input type="checkbox" data-camada="${k}" ${ativas.has(k) ? 'checked' : ''}> ${esc(CAMADAS[k])}</label>`).join('') +
      (camadas.includes('calor') ? `<span class="pn-sel" data-de="calor">Praga <select data-f="praga"><option value="">Todas</option>${pragas.map(x => `<option ${x === st.praga ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></span>
        <span class="pn-sel" data-de="calor">Cultura <select data-f="cultura"><option value="">Todas</option>${culturas.map(x => `<option ${x === st.cultura ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></span>` : '') +
      (camadas.includes('coropletico') ? `<span class="pn-sel" data-de="coropletico">Indicador <select data-f="indicador">${Object.entries(INDICADORES).map(([k, t]) => `<option value="${k}" ${k === st.indicador ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></span>` : '');

    // roda do mouse só dá zoom depois de clicar no mapa; no toque, sem arraste de um dedo (rola a página) e a pinça de dois dedos move/amplia
    const toque = matchMedia('(pointer: coarse)').matches || !!(L.Browser && L.Browser.mobile);
    const map = L.map(div, { zoomSnap: 0.25, minZoom: 4, maxZoom: 17, preferCanvas: false, attributionControl: true, scrollWheelZoom: false, dragging: !toque });
    map.on('click focus', () => map.scrollWheelZoom.enable()); div.addEventListener('mouseleave', () => map.scrollWheelZoom.disable());
    const dica = el('p', 'pn-sub pn-mapa-dica', toque ? 'Use dois dedos para mover ou ampliar o mapa.' : 'Clique no mapa para ampliar com a roda do mouse.');
    card.insertBefore(dica, leg);
    map.attributionControl.setPrefix(false);
    let tiles = null, munLayer = null;
    const ficarSemTiles = () => { div.classList.add('pn-sem-tiles'); if (tiles && map.hasLayer(tiles)) map.removeLayer(tiles); if (munLayer) munLayer.setStyle(estiloMun); };
    if (Date.now() - tilesFalharamEm < TILES_PAUSA_MS) div.classList.add('pn-sem-tiles');
    else {
      tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' });
      let carregados = 0, erros = 0;
      tiles.on('tileload', () => { carregados++; });
      tiles.on('tileerror', () => { if (++erros >= 2 && !carregados) { tilesFalharamEm = Date.now(); ficarSemTiles(); } });
      tiles.addTo(map);
    }
    if (memo.centro) map.setView(memo.centro, memo.zoom); else map.fitBounds(AM_LIMITES, { padding: [4, 4] });
    map.createPane('pn-mun'); map.getPane('pn-mun').style.zIndex = 350;
    const grupos = {};
    const porMun = porMunicipio(d);
    let maxInd = 0;
    const valorInd = nome => (porMun[nome] || {})[st.indicador] || 0;
    const limites = () => { maxInd = 0; Object.keys(porMun).forEach(n => { maxInd = Math.max(maxInd, valorInd(n)); }); };
    const classe = v => v <= 0 || !maxInd ? -1 : Math.min(4, Math.floor((v / maxInd) * 5 - 1e-9));
    const estiloMun = f => {
      const coro = ativas.has('coropletico'), k = coro ? classe(valorInd(f.properties.name)) : -1, sem = div.classList.contains('pn-sem-tiles');
      if (sem) return { pane: 'pn-mun', color: p.mapa.linha, weight: 1, opacity: 1, fillColor: k >= 0 ? p.seq[k] : p.mapa.terra, fillOpacity: k >= 0 ? 0.85 : 1 };
      return { pane: 'pn-mun', color: p.escuro ? '#8d8c86' : '#5b5a56', weight: 1, opacity: 0.8, fillColor: k >= 0 ? p.seq[k] : p.sf, fillOpacity: k >= 0 ? 0.78 : 0.04 };
    };
    limites();
    munLayer = L.geoJSON(GEO, { style: estiloMun, pane: 'pn-mun', onEachFeature: (f, lay) => {
      lay.bindTooltip(() => { const m = porMun[f.properties.name] || {}; const v = k => fmt.int(m[k] || 0);
        return `<b>${esc(f.properties.name)}</b><br>Levantamentos: ${v('levantamentos')} · Detecções: ${v('deteccoes')}<br>Turnos: ${v('turnos')} · Veículos: ${v('veiculos')}<br>TFs: ${v('tfs')} · Termos de colheita: ${v('colheitas')}${m.andamento ? `<br><b>${m.andamento} barreira(s) em andamento</b>` : ''}`; }, { sticky: true });
      lay.on('mouseover', () => lay.setStyle({ weight: 2.5, opacity: 1 })); lay.on('mouseout', () => munLayer.resetStyle(lay));
    } }).addTo(map);

    const semCoord = {};
    // 1. barreiras em andamento
    if (camadas.includes('andamento')) {
      const g = grupos.andamento = L.layerGroup(); let s = 0;
      const linhasTF = lst => (lst || []).flatMap(a => [['TF em preenchimento', `${a.procedimentoNome}${a.placa ? ' · placa ' + a.placa : ''}`], ['Fiscal do TF', a.fiscal], ['TF iniciado', a.inicioMs ? `${fmt.hora(a.inicioMs)} (${fmt.rel(a.inicioMs)})` : '—']]);
      d.emAndamento.forEach(t => {
        if (t.lat == null || t.lon == null) { s++; return; }
        const pin = pinoDe(t), tam = pin === 'tf' ? 26 : 18;
        const ic = L.divIcon({ className: '', html: `<div class="pn-pin ${pin}" aria-label="${esc((t.local || 'Barreira') + (t.tfAndamento ? ' — ' + rotuloTF(t) : ''))}"></div>`, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2], popupAnchor: [0, -tam / 2 - 1] });
        L.marker([t.lat, t.lon], { icon: ic, zIndexOffset: t.tfAndamento ? 2000 : 1000, title: (t.local || 'Barreira em andamento') + (t.tfAndamento ? ' — ' + rotuloTF(t) : ''), keyboard: true })
          .bindPopup(() => popup(t.local || 'Barreira', linhasTF(t.tfAndamento).concat([['Posto', t.posto], ['Unidade', t.unidade], ['Município', t.municipio], ['Fiscais', t.fiscal], ['Início', `${fmt.data(t.data)} ${t.inicio || ''}`],
            ['Duração até agora', fmt.duracao(t.duracaoMin)], ['Veículos', fmt.int(t.nVeiculos)], ['Pessoas', fmt.int(t.nPessoas)],
            ['Último veículo', t.ultimoVeiculo ? `${t.ultimoVeiculo.hora} (${t.ultimoVeiculo.placa || 's/ placa'})` : 'nenhum ainda'], ['Último sinal', t.ultimoSinal ? `${fmt.dataHora(t.ultimoSinal)} (${fmt.rel(t.ultimoSinal)})` : '—']]),
            seloSituacao(t))).addTo(g);
      });
      // TF em preenchimento sem turno aberto: marcador próprio na coordenada do aparelho (sem coordenada: só no aviso e nos alertas)
      (d.tfsSemTurno || []).forEach(a => {
        if (a.lat == null || a.lon == null) return;
        const ic = L.divIcon({ className: '', html: `<div class="pn-pin tf" aria-label="${esc(a.titulo + ' — ' + a.onde)}"></div>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14] });
        L.marker([a.lat, a.lon], { icon: ic, zIndexOffset: 2000, title: a.titulo + ' — ' + a.onde, keyboard: true })
          .bindPopup(() => popup(a.onde, linhasTF([a]).concat([['Município', a.municipio], ['Turno', 'nenhum turno aberto ligado a este TF']]), `<span class="pn-selo tf">${esc(a.titulo)}</span>`)).addTo(g);
      });
      semCoord.andamento = s;
    }
    // 2. barreiras realizadas (encerradas) no período
    if (camadas.includes('realizadas')) {
      const g = grupos.realizadas = L.layerGroup(); let s = 0; const maxV = Math.max(1, ...d.turnos.map(t => t.nVeiculos));
      d.turnos.filter(t => t.encerrado).sort((a, b) => b.nVeiculos - a.nVeiculos).forEach(t => {
        if (t.lat == null || t.lon == null) { s++; return; }
        // violeta com contorno na cor do texto: não some sobre o coroplético (rampa azul) nem se confunde com os levantamentos
        L.circleMarker([t.lat, t.lon], { radius: 5 + 17 * Math.sqrt(t.nVeiculos / maxV), color: p.ink, weight: 1.5, fillColor: p.serie[6], fillOpacity: 0.55 })
          .bindPopup(popup(t.local || 'Barreira', [['Data', fmt.data(t.data)], ['Horário', `${t.inicio || '?'} – ${t.fim || '?'}`], ['Duração', fmt.duracao(t.duracaoMin)],
            ['Posto', t.posto], ['Município', t.municipio], ['Fiscais', t.fiscal], ['Veículos', fmt.int(t.nVeiculos)], ['Pessoas', fmt.int(t.nPessoas)]])).addTo(g);
      });
      semCoord.realizadas = s;
    }
    // 3. levantamentos PCE
    if (camadas.includes('levantamentos')) {
      const g = grupos.levantamentos = L.layerGroup(); let s = 0;
      d.levantamentos.slice().sort((a, b) => a.detectou - b.detectou).forEach(l => {
        if (l.lat == null || l.lon == null) { s++; return; }
        // mesmas cores dos gráficos do PCE (azul = sem praga, laranja = com praga); com praga ganha anel escuro (não depende só da cor)
        L.circleMarker([l.lat, l.lon], l.detectou ? { radius: 7, color: p.ink, weight: 2.5, fillColor: p.serie[1], fillOpacity: 1 } : { radius: 5, color: p.sf, weight: 2, fillColor: p.serie[0], fillOpacity: 1 })
          .bindPopup(popup(l.propriedade || 'Levantamento', [['Data', fmt.data(l.data)], ['Município', l.municipio], ['Produtor', l.nome], ['Culturas', l.culturasLista.map(c => c.cultura).join(', ')],
            ['Pragas', l.pragas.join(', ') || 'nenhuma detectada'], ['Amostras', fmt.int(l.nAmostras)], ['Servidor', l.servidor]],
            l.detectou ? '<span class="pn-selo praga">Praga detectada</span>' : '<span class="pn-selo sempraga">Sem detecção</span>')).addTo(g);
      });
      semCoord.levantamentos = s;
    }
    // 4. termos de colheita
    if (camadas.includes('colheitas')) {
      const g = grupos.colheitas = L.layerGroup(); let s = 0;
      const ic = L.divIcon({ className: '', html: '<div class="pn-losango"></div>', iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -8] });
      d.colheitas.forEach(c => {
        if (c.lat == null || c.lon == null) { s++; return; }
        L.marker([c.lat, c.lon], { icon: ic, title: 'Termo ' + (c.numeroTxt || '') }).bindPopup(popup('Termo de colheita ' + (c.numeroTxt || ''), [['Data', fmt.data(c.data)],
          ['Município', c.municipio], ['Cultura', c.cultura], ['Quantidade', c.quantidade], ['Análise', c.analise], ['Partes', c.partes], ['Servidor', c.servidor]])).addTo(g);
      });
      semCoord.colheitas = s;
    }
    // 5. mapa de calor de detecções
    const pontosCalor = () => { const pts = [];
      d.levantamentos.forEach(l => { if (l.lat == null || l.lon == null) return; l.culturasLista.forEach(c => {
        if (c.praga && (!st.praga || c.praga === st.praga) && (!st.cultura || c.cultura === st.cultura)) pts.push([l.lat, l.lon, 1]); }); });
      return pts; };
    if (camadas.includes('calor') && L.heatLayer) {
      grupos.calor = L.heatLayer(pontosCalor(), { radius: 26, blur: 20, maxZoom: 9, minOpacity: 0.35, gradient: p.calor });
      semCoord.calor = d.levantamentos.filter(l => l.detectou && (l.lat == null || l.lon == null)).length;
    }
    const ordemAdd = ['calor', 'realizadas', 'colheitas', 'levantamentos', 'andamento'];
    const aplicar = () => {
      ordemAdd.forEach(k => { const g = grupos[k]; if (!g) return; if (ativas.has(k)) { if (!map.hasLayer(g)) g.addTo(map); } else if (map.hasLayer(g)) map.removeLayer(g); });
      munLayer.setStyle(estiloMun);
      ctl.querySelectorAll('[data-de]').forEach(x => { x.hidden = !ativas.has(x.dataset.de); });
      const tot = camadas.filter(k => ativas.has(k)).reduce((s, k) => s + (semCoord[k] || 0), 0);
      semc.textContent = tot ? `${fmt.int(tot)} registro(s) sem coordenada (contam nos números, não aparecem no mapa)` : '';
      legenda();
    };
    function legenda() {
      const it = [];
      // a legenda desenha o mesmo marcador do mapa (pino com anel, "?" ou "!" para barreiras; círculos para levantamentos)
      const pino = sit => `<i class="pn-lg-pino"><span class="pn-pin ${sit}"></span></i>`;
      if (ativas.has('andamento')) it.push(`<span>${pino('tf')}TF em preenchimento / apreensão em andamento (${fmt.int(d.emAndamento.filter(t => t.tfAndamento).length + (d.tfsSemTurno || []).filter(a => a.lat != null && a.lon != null).length)})</span>`,
        `<span>${pino('ok')}Barreira em andamento (${fmt.int(d.emAndamento.filter(t => pinoDe(t) === 'ok').length)})</span>`,
        `<span>${pino('semsinal')}Barreira sem sinal &gt; 30 min (${fmt.int(d.emAndamento.filter(t => pinoDe(t) === 'semsinal').length)})</span>`,
        `<span>${pino('longa')}Barreira aberta &gt; 14 h (${fmt.int(d.emAndamento.filter(t => pinoDe(t) === 'longa').length)})</span>`);
      if (ativas.has('realizadas')) it.push(`<span><i class="pn-lg-pto" style="background:${p.alfa(p.serie[6], .55)};border-color:${p.ink};border-width:1.5px;box-shadow:none"></i>Barreira realizada (tamanho = nº de veículos)</span>`);
      if (ativas.has('levantamentos')) it.push(`<span><i class="pn-lg-pto" style="width:14px;height:14px;background:${p.serie[1]};border-color:${p.ink}"></i>Levantamento com praga</span>`, `<span><i class="pn-lg-pto" style="background:${p.serie[0]}"></i>Levantamento sem praga</span>`);
      if (ativas.has('colheitas')) it.push(`<span><i class="pn-lg-los" style="background:${p.serie[2]}"></i>Termo de colheita</span>`);
      if (ativas.has('calor')) it.push(`<span>Detecções: <i class="pn-lg-gra" style="background:linear-gradient(90deg, ${Object.values(p.calor).join(',')})"></i> menos → mais</span>`);
      if (ativas.has('coropletico')) {
        const lims = faixasClasses(maxInd, classe);
        it.push(`<span><b>${esc(INDICADORES[st.indicador])}:</b></span>` + (maxInd ? lims.map(([a, b], k) => a == null ? '' : `<span><i class="pn-lg-gra" style="width:18px;background:${p.seq[k]}"></i>${a === b ? fmt.int(a) : fmt.int(a) + '–' + fmt.int(b)}</span>`).join('') : '<span>nenhum no período</span>'));
      }
      leg.innerHTML = it.join('');
    }
    ctl.addEventListener('change', e => {
      const c = e.target.dataset.camada, f = e.target.dataset.f;
      if (c) { if (e.target.checked) ativas.add(c); else ativas.delete(c); }
      if (f) { st[f] = e.target.value; if (f === 'indicador') limites(); if ((f === 'praga' || f === 'cultura') && grupos.calor) grupos.calor.setLatLngs(pontosCalor()); }
      Object.assign(reg.memo, { ativas: [...ativas], praga: st.praga, cultura: st.cultura, indicador: st.indicador });
      aplicar();
    });
    const reg = S.mapas[id] = { map, vivo: true, memo: Object.assign(memo, { ativas: [...ativas], praga: st.praga, cultura: st.cultura, indicador: st.indicador }),
      salvarVista() { try { reg.memo.centro = map.getCenter(); reg.memo.zoom = map.getZoom(); } catch (e) { /* mapa removido */ } } };
    map.on('moveend', () => reg.salvarVista());
    aplicar();
    setTimeout(() => map.invalidateSize(), 0);
    return { map, camadas: grupos, atualizar: () => renderAba(true) };
  }

  /* ---------------- Visão geral ---------------- */
  function alertasGerais(d) {
    const A = [], N = d.semFiltro, ag = d.agora;
    // 0. TF sendo preenchido agora (apreensão em andamento): aparece até o TF ser gerado/descartado ou o aparelho parar de avisar
    (d.tfsAndamento || []).forEach(a => A.push({ nivel: 'critico', aba: 'barreiras', tf: true,
      titulo: `${a.titulo}: ${a.onde}`, detalhe: textoTF(a) + (a.turno ? '' : ' · TF lavrado sem turno aberto') + '.' }));
    // 1. novo foco de praga (sem detecção no município nos 365 dias anteriores ao período)
    const hist = {}; d.historicoPce.forEach(h => h.pragas.forEach(pr => { hist[norm(h.municipio) + '|' + norm(pr)] = true; }));
    const munComHist = new Set(d.historicoPce.filter(h => h.pragas.length).map(h => norm(h.municipio)));
    const focos = {};
    d.levantamentos.slice().sort((a, b) => a.data.localeCompare(b.data)).forEach(l => l.pragas.forEach(pr => {
      const k = norm(l.municipio) + '|' + norm(pr); if (hist[k]) return;
      (focos[k] = focos[k] || { pr, mun: l.municipio || 'município não informado', data: l.data, n: 0, novoMun: !munComHist.has(norm(l.municipio)) }).n++;
    }));
    const porPraga = {}; Object.values(focos).forEach(f => { (porPraga[f.pr] = porPraga[f.pr] || []).push(f); });
    Object.entries(porPraga).sort((a, b) => b[1].length - a[1].length).forEach(([pr, fs]) => A.push({ nivel: 'critico', aba: 'pce',
      titulo: `Novo foco de ${pr}: ${fs.length === 1 ? fs[0].mun : fs.length + ' municípios'}`,
      detalhe: fs.map(f => `${f.mun} (desde ${fmt.dataCurta(f.data)}, ${f.n} levant.)`).join('; ') + '. Sem registro desta praga no município nos 365 dias anteriores.' +
        (fs.some(f => f.novoMun) ? ` Sem nenhuma detecção anterior: ${fs.filter(f => f.novoMun).map(f => f.mun).join(', ')}.` : '') }));
    // 2. barreiras abertas há mais de 14 h / sem sinal
    d.emAndamento.forEach(t => {
      if (t.abertaLonga) A.push({ nivel: 'critico', aba: 'barreiras', titulo: `Barreira aberta há ${fmt.duracao(t.duracaoMin)}: ${t.local || 'sem local'}`, detalhe: `Início ${fmt.data(t.data)} ${t.inicio || ''} · ${t.fiscal || ''}. Verificar se o turno não foi encerrado no aparelho.` });
      else if (t.semSinal) A.push({ nivel: 'serio', aba: 'barreiras', titulo: `Barreira sem sinal ${fmt.rel(t.ultimoSinal)}: ${t.local || 'sem local'}`, detalhe: `Último dado recebido ${fmt.dataHora(t.ultimoSinal)} · ${t.fiscal || ''}. O aparelho pode estar sem internet.` });
    });
    // 3. numeração de TFs e termos (agrupado por módulo)
    const audit = (au, nome, aba) => {
      const g = a => `${a.grupo}/${a.ano}`;
      const conf = au.filter(a => a.conflitos || a.duplicados.length);
      if (conf.length) A.push({ nivel: 'critico', aba, titulo: `${nome}: conflito de numeração em ${conf.length === 1 ? g(conf[0]) : conf.length + ' sequências'}`,
        detalhe: conf.map(a => `${g(a)}: ${a.duplicados.length ? 'repetidos ' + a.duplicados.slice(0, 8).join(', ') : ''}${a.duplicados.length && a.conflitos ? '; ' : ''}${a.conflitos ? a.conflitos + ' marcado(s) com conflito' : ''}`).join(' · ') });
      const ed = au.filter(a => a.editados.length || a.provisorios.length), nEd = ed.reduce((s, a) => s + a.editados.length + a.provisorios.length, 0);
      if (ed.length) A.push({ nivel: 'atencao', aba, titulo: `${nome}: ${nEd} número(s) editado(s) à mão ou provisório(s)`,
        detalhe: ed.map(a => `${g(a)}: ` + [...a.editados.map(r => `${r.numero} (editado${r.sugerido ? ', sugerido ' + r.sugerido : ''})`), ...a.provisorios.map(r => `${r.numero} (provisório)`)].slice(0, 8).join(', ')).join(' · ') });
      const lac = au.filter(a => a.lacunasTotal), nLac = lac.reduce((s, a) => s + a.lacunasTotal, 0);
      if (lac.length) A.push({ nivel: 'atencao', aba, titulo: `${nome}: ${nLac} lacuna(s) na sequência`,
        detalhe: 'Números sem registro — ' + lac.map(a => `${g(a)}: ${a.lacunas.slice(0, 12).join(', ')}${a.lacunasTotal > 12 ? '…' : ''}`).join(' · ') });
    };
    audit(d.auditoria.tf, 'TF', 'tf');
    audit(d.auditoria.pce, 'Termo de colheita', 'pce');
    // 4. cobertura PCE: municípios sem levantamento nos últimos 90 dias (até o fim do período)
    const lim = somaDias(d.ate, -89), cobertos = new Set();
    d.historicoPce.forEach(h => { if (h.data >= lim && h.data <= d.ate) cobertos.add(norm(h.municipio)); });
    N.levantamentos.forEach(l => { if (l.data >= lim && l.data <= d.ate) cobertos.add(norm(l.municipio)); });
    const desc = MUN.filter(m => !cobertos.has(m.chave)).map(m => m.nome);
    if (desc.length) A.push({ nivel: desc.length > 40 ? 'serio' : 'atencao', aba: 'pce', titulo: `${desc.length} de ${MUN.length} municípios sem levantamento PCE nos últimos 90 dias`,
      detalhe: `Período de ${fmt.data(lim)} a ${fmt.data(d.ate)}: ${desc.slice(0, 25).join(', ')}${desc.length > 25 ? ` e mais ${desc.length - 25}` : ''}.` });
    // 5. reincidentes com nova apreensão
    const reinc = d.tfs.filter(t => t.reincidente && t.procedimento === 'apreensao');
    if (reinc.length) A.push({ nivel: 'serio', aba: 'tf', titulo: `${reinc.length} reincidente(s) com nova apreensão no período`,
      detalhe: reinc.slice(0, 8).map(t => `TF ${t.numeroTxt || t.numero} · ${t.placa || 's/ placa'} · ${t.doc || ''} (${t.tfsAnteriores || '?'} TF anteriores)`).join('; ') });
    void ag;
    return A;
  }

  /** Indicadores da Visão geral (também usados pelo modo TV). Cada item: {chave, rotulo, valor, detalhe, status}. */
  function indicadoresGerais(d) {
    const horas = d.turnos.reduce((s, t) => s + (t.duracaoContabilMin || 0), 0), nLim = d.turnos.filter(t => t.horasLimitadas).length;
    const pessoas = d.turnos.reduce((s, t) => s + t.nPessoas, 0);
    const proc = k => d.tfs.filter(t => t.procedimento === k).length;
    const comPraga = d.levantamentos.filter(l => l.detectou).length, det = d.levantamentos.reduce((s, l) => s + l.deteccoes, 0);
    const amostras = d.levantamentos.reduce((s, l) => s + l.nAmostras, 0);
    const vivos = d.emAndamento, ruins = vivos.filter(t => t.situacao !== 'ok').length;
    const prop = new Set(d.levantamentos.map(l => l.chaveProp)).size;
    return [
      { chave: 'andamento', rotulo: 'Barreiras em andamento agora', valor: vivos.length, detalhe: vivos.length ? (ruins ? `${ruins} com alerta (sem sinal ou > 14 h)` : 'todas com sinal') : 'nenhuma aberta', status: ruins ? 'serio' : (vivos.length ? 'bom' : null) },
      { chave: 'horas', rotulo: 'Horas de barreira', valor: Math.round(horas / 60), detalhe: `${fmt.int(d.turnos.length)} turno(s)${nLim ? ` · ${nLim} aberto(s) há mais de 14 h contado(s) com 14 h` : ''}` },
      { chave: 'veiculos', rotulo: 'Veículos abordados', valor: d.veiculos.length, detalhe: horas ? `${fmt.num(d.veiculos.length / (horas / 60), 1)} por hora de barreira` : null },
      { chave: 'pessoas', rotulo: 'Pessoas impactadas', valor: pessoas, detalhe: 'estimativa por veículo' },
      { chave: 'tfs', rotulo: 'TFs lavrados', valor: d.tfs.length, detalhe: `${fmt.int(proc('apreensao'))} apreensões · ${fmt.int(proc('rechaco'))} rechaços${d.tfsCancelados.length ? ` · ${d.tfsCancelados.length} cancelado(s)` : ''}`, apreensoes: proc('apreensao') },
      { chave: 'levantamentos', rotulo: 'Levantamentos PCE', valor: d.levantamentos.length, detalhe: `${fmt.int(prop)} propriedade(s)` },
      { chave: 'deteccoes', rotulo: 'Detecções de pragas', valor: det, detalhe: d.levantamentos.length ? `${fmt.pct(comPraga / d.levantamentos.length)} dos levantamentos` : null, status: det ? 'critico' : null },
      { chave: 'amostras', rotulo: 'Amostras / termos de colheita', valor: `${fmt.int(amostras)} / ${fmt.int(d.colheitas.length)}`, detalhe: 'culturas com coleta / termos emitidos' }
    ];
  }

  /** Cartões das barreiras em andamento (Visão geral). */
  /** Linha do TF em preenchimento nos cartões ao vivo (barreira com TF aberto ou TF sem turno). */
  const linhaTFVivo = lst => (lst || []).map(a => `<small class="pn-vivo-tf"><b>TF</b> ${esc([a.placa && 'placa ' + a.placa, a.procedimentoNome, a.fiscal, a.inicioMs && 'iniciado ' + fmt.rel(a.inicioMs)].filter(Boolean).join(' · '))}</small>`).join('');
  /** Cartão de um TF em preenchimento sem turno aberto (lista "Barreiras em andamento agora"). */
  const cartaoTFSemTurno = a => { const it = el('div', 'pn-vivo-item tf'); it.dataset.tf = a.id;
    it.innerHTML = `<span class="pn-selo tf">${esc(a.titulo)}</span><b>${esc(a.onde)}</b><small>${esc(a.fiscal || '')}${a.municipio ? ' · ' + esc(a.municipio) : ''} · sem turno aberto${a.lat == null ? ' · sem GPS' : ''}</small>${linhaTFVivo([a])}`;
    return it; };
  /** Cartões das barreiras em andamento (Visão geral). */
  function secaoAoVivo(c, vivos, semTurno) {
    semTurno = semTurno || [];
    const sv = secao(c, 'Barreiras em andamento agora', vivos.length || semTurno.length ? 'Atualiza sozinho a cada minuto (a cada 25 s enquanto houver TF em preenchimento).' : null);
    sv.parentNode.classList.add('pn-geral-vivo');
    if (!vivos.length && !semTurno.length) { vazio(sv, 'Nenhuma barreira aberta no momento.'); return; }
    const g = el('div', 'pn-vivo');
    semTurno.forEach(a => g.appendChild(cartaoTFSemTurno(a)));
    vivos.slice().sort((a, b) => ordemVivo(a) - ordemVivo(b)).forEach(t => {
      const it = el('div', 'pn-vivo-item' + (t.tfAndamento ? ' tf' : '')); it.dataset.turno = t.id;
      it.innerHTML = `${seloSituacao(t)}<b>${esc(t.local || 'Sem local')}</b><small>${esc(t.fiscal || '')}${t.municipio ? ' · ' + esc(t.municipio) : ''}</small>${linhaTFVivo(t.tfAndamento)}
        <small>Início ${esc(fmt.dataCurta(t.data))} ${esc(t.inicio || '')} · ${esc(fmt.duracao(t.duracaoMin))} · último sinal ${esc(fmt.rel(t.ultimoSinal))}</small>
        <div class="pn-vivo-num"><span><strong>${fmt.int(t.nVeiculos)}</strong>veículos</span><span><strong>${fmt.int(t.nPessoas)}</strong>pessoas</span>${t.ultimoVeiculo ? `<span>último ${esc(t.ultimoVeiculo.hora)}</span>` : ''}</div>`;
      const be = botaoEncerrar(t); if (be) { const ac = el('div', 'pn-vivo-acoes'); ac.appendChild(be); it.appendChild(ac); }
      g.appendChild(it);
    });
    sv.appendChild(g);
  }

  /* ---------------- encerrar turno pela gerência (só no painel normal; nunca no modo TV) ---------------- */
  const RE_HM = /^([01]\d|2[0-3]):[0-5]\d$/;
  /** Botão "Encerrar turno" de um cartão de barreira em andamento (null no modo TV ou para turno já encerrado). */
  function botaoEncerrar(t) {
    if (emTV() || !t || !t.emAndamento) return null;
    const b = el('button', 'pn-btn pn-btn-mini pn-btn-encerrar', 'Encerrar turno'); b.type = 'button'; b.dataset.encerrar = t.id;
    b.setAttribute('aria-label', `Encerrar o turno de ${t.local || 'barreira sem local'}${t.fiscal ? ' (' + t.fiscal + ')' : ''}`);
    b.onclick = () => dialogoEncerrar(t);
    return b;
  }
  /** Aviso curto no rodapé (sucesso de uma ação). */
  function avisar(msg) {
    let a = $('#pn-toast');
    if (!a) { a = el('div', 'pn-toast'); a.id = 'pn-toast'; a.setAttribute('role', 'status'); a.setAttribute('aria-live', 'polite'); document.body.appendChild(a); }
    a.textContent = msg; a.classList.add('on'); clearTimeout(avisar.t); avisar.t = setTimeout(() => a.classList.remove('on'), 4000);
  }
  /** Diálogo do gerente: horário de encerramento (sugestões: último veículo / agora), aviso e confirmação. */
  function dialogoEncerrar(t) {
    const velho = $('#pn-encerrar'); if (velho) velho.remove();
    const hAgora = horaManaus(agora()), hUlt = t.ultimoVeiculo && RE_HM.test(String(t.ultimoVeiculo.hora || '')) ? String(t.ultimoVeiculo.hora) : '';
    const dlg = el('dialog', 'pn-dlg'); dlg.id = 'pn-encerrar'; dlg.setAttribute('aria-labelledby', 'pn-enc-tit');
    dlg.innerHTML = `<form method="dialog" class="pn-dlg-form" novalidate>
      <h3 id="pn-enc-tit">Encerrar turno</h3>
      <div class="pn-dlg-info"><b>${esc(t.local || 'Sem local')}</b><span>${esc(t.fiscal || 'Fiscal não informado')}</span>
        <span>Início ${esc(fmt.dataCurta(t.data))} às ${esc(t.inicio || '—')} · ${fmt.int(t.nVeiculos)} veículo(s)${hUlt ? ` · último às ${esc(hUlt)}` : ' · nenhum veículo registrado'}</span></div>
      <label class="pn-dlg-campo">Horário de encerramento<input type="time" id="pn-enc-fim" required value="${esc(hUlt || hAgora)}"></label>
      <div class="pn-dlg-rapidos">${hUlt ? `<button type="button" class="pn-btn pn-btn-mini" data-hora="${esc(hUlt)}">Último veículo (${esc(hUlt)})</button>` : ''}
        <button type="button" class="pn-btn pn-btn-mini" data-hora="${esc(hAgora)}">Agora (${esc(hAgora)})</button></div>
      <p class="pn-dlg-prev" id="pn-enc-prev"></p>
      <p class="pn-dlg-aviso">O turno sai das barreiras em andamento e o aparelho do fiscal será avisado na próxima sincronização.</p>
      <p class="pn-dlg-erro" id="pn-enc-erro" role="alert" hidden></p>
      <div class="pn-dlg-botoes"><button type="button" class="pn-btn" value="cancelar" id="pn-enc-cancelar">Cancelar</button>
        <button type="submit" class="pn-btn pn-btn-perigo" id="pn-enc-ok">Encerrar turno</button></div></form>`;
    document.body.appendChild(dlg);
    const inp = dlg.querySelector('#pn-enc-fim'), erro = dlg.querySelector('#pn-enc-erro'), ok = dlg.querySelector('#pn-enc-ok');
    const mostrarErro = m => { erro.textContent = m; erro.hidden = !m; };
    const previa = () => {
      const h = inp.value, pv = dlg.querySelector('#pn-enc-prev');
      if (!RE_HM.test(h) || t.inicioMs == null) { pv.textContent = ''; return; }
      let f = msDe(t.data, h); if (f < t.inicioMs) f += 864e5;
      pv.textContent = `Turno das ${t.inicio} de ${fmt.dataCurta(t.data)} às ${h} de ${fmt.dataCurta(diaManaus(f))} · duração ${fmt.duracao((f - t.inicioMs) / 60000)}` +
        (f > agora() ? ' · atenção: horário ainda não chegou' : '');
    };
    inp.addEventListener('input', () => { mostrarErro(''); previa(); });
    dlg.querySelectorAll('[data-hora]').forEach(b => { b.onclick = () => { inp.value = b.dataset.hora; mostrarErro(''); previa(); inp.focus(); }; });
    dlg.querySelector('#pn-enc-cancelar').onclick = () => dlg.close();
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('form').addEventListener('submit', async ev => {
      ev.preventDefault();
      const fim = inp.value;
      if (!RE_HM.test(fim)) { mostrarErro('Informe o horário de encerramento no formato HH:MM.'); inp.focus(); return; }
      ok.disabled = true; ok.textContent = 'Encerrando…'; mostrarErro('');
      try {
        const j = await chamar({ action: 'painelEncerrarTurno', turnoId: t.id, fim });
        aplicarEncerramento(j.turno || { id: t.id, encerrado: 1, fim });
        dlg.close(); avisar('Turno encerrado');
      } catch (e) {
        if (!S.token) { dlg.close(); return; }                       // sessão encerrada: chamar() já voltou ao login
        mostrarErro(e.rede ? 'Sem conexão com o servidor. Verifique a internet e tente de novo.' : e.message || 'Não foi possível encerrar o turno.');
        ok.disabled = false; ok.textContent = 'Encerrar turno';
      }
    });
    previa();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    inp.focus();
  }
  /** Turno encerrado no painel: atualiza os dados já carregados na hora e busca a situação ao vivo no servidor. */
  function aplicarEncerramento(r) {
    const B = S.bruto;
    if (B && Array.isArray(B.turnos)) {
      B.turnos = B.turnos.map(x => x.id !== r.id ? x : { ...x, encerrado: 1, emAndamento: false, fim: r.fim, fimTs: r.fimTs != null ? r.fimTs : x.fimTs,
        encerradoPor: r.encerradoPor || S.nome || '', encerradoEm: r.encerradoEm || agora(), atualizadoEm: r.atualizadoEm || x.atualizadoEm, srv_ts: r.srv_ts || x.srv_ts });
      S.todos = normalizar(B); recalcular(true); processarTF();
    }
    if (S.carregando) S.repetir = true; else carregarAoVivo();
  }

  function renderGeral(c, d, f) {
    const vivos = d.emAndamento, celular = matchMedia(CELULAR).matches;
    const s0 = el('p', 'pn-sub', `Período: ${esc(f.rotuloPeriodo)}${f.fiscal ? ' · Fiscal: ' + esc(f.fiscal) : ''}${f.local ? ` · ${f.local.tipo === 'barreira' ? 'Barreira' : 'Município'}: ${esc(f.local.valor)}` : ''}`);
    s0.style.marginTop = '4px'; c.appendChild(s0);
    if (celular) secaoAoVivo(c, vivos, d.tfsSemTurno);                    // no celular: consulta rápida do que está acontecendo, antes de tudo
    const k = secao(c, 'Resumo do período');
    kpis(k, indicadoresGerais(d));

    const lista = alertasGerais(d), duo = el('div', 'pn-duo'); c.appendChild(duo);
    const nCrit = lista.filter(a => a.nivel === 'critico').length;
    const sa = secao(duo, 'Alertas para decisão', lista.length ? `${lista.length} alerta(s)${nCrit ? `, ${nCrit} crítico(s)` : ''} · ordem: crítico → sério → atenção.` : null);
    const ca = el('div', 'pn-cartao pn-alertas-caixa'); sa.appendChild(ca); alertas(ca, lista, { max: matchMedia('(max-width: 700px)').matches ? 4 : 6 });
    sa.parentNode.classList.add('pn-duo-alertas');
    const sm = secao(duo, 'Mapa do Amazonas', 'Barreiras em tempo real, levantamentos, termos de colheita, calor de detecções e indicadores por município. Toque nos pontos para detalhes.');
    sm.parentNode.classList.add('pn-duo-mapa');
    mapa(sm, { id: 'geral', titulo: 'Situação no estado', camadas: ['andamento', 'realizadas', 'levantamentos', 'colheitas', 'calor', 'coropletico'], ativas: ['andamento', 'realizadas', 'levantamentos', 'colheitas', 'coropletico'] });

    if (!celular) secaoAoVivo(c, vivos, d.tfsSemTurno);

    const sr = secao(c, 'Atividade por município', 'Soma dos três módulos no período (barreiras pelo local do turno; PCE pelo município do levantamento).');
    const M = porMunicipio(d);
    const linhas = Object.entries(M).map(([n, m]) => ({ municipio: n, ...m })).filter(m => m.turnos || m.levantamentos || m.tfs || m.colheitas || m.andamento || m.tfsOrigem);
    tabela(sr, [{ chave: 'municipio', rotulo: 'Município' }, { chave: 'turnos', rotulo: 'Turnos', num: true, fmt: fmt.int }, { chave: 'veiculos', rotulo: 'Veículos', num: true, fmt: fmt.int },
      { chave: 'tfs', rotulo: 'TFs', num: true, fmt: fmt.int }, { chave: 'tfsOrigem', rotulo: 'TFs (origem)', num: true, fmt: fmt.int }, { chave: 'levantamentos', rotulo: 'Levantamentos', num: true, fmt: fmt.int },
      { chave: 'deteccoes', rotulo: 'Detecções', num: true, fmt: fmt.int }, { chave: 'colheitas', rotulo: 'Termos', num: true, fmt: fmt.int }],
    linhas, { csv: 'atividade-por-municipio.csv', ordenar: 'veiculos', vazio: 'Nenhum registro com município identificado no período.' });
  }

  /* ---------------- dica de instalação no celular (mesma ideia do app de campo: precisaInstalar/bannerInstalar) ---------------- */
  const UA = navigator.userAgent;
  const ehIOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const ehAndroid = /Android/i.test(UA);
  const instalado = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  let eventoInstalar = null;                                   // evento nativo de instalação (Android/Chrome)
  const precisaInstalar = () => (ehIOS || ehAndroid) && !instalado() && !ls.get(LS_SEM_INSTALAR) && !emTV();
  function desenharDicaInstalar() {
    const el = $('#pn-instalar'); if (!el) return;
    if (!precisaInstalar()) { el.hidden = true; el.innerHTML = ''; return; }
    const como = ehIOS
      ? 'No Safari, toque em <b>Compartilhar</b> <span aria-hidden="true">⬆︎</span> e depois em <b>Adicionar à Tela de Início</b>. Abra pelo ícone' + (S.token ? '' : ' e entre por lá: o app instalado não aproveita o acesso feito no Safari') + '.'
      : eventoInstalar ? 'Toque em <b>Instalar app</b> para abrir o painel pelo ícone, em tela cheia.' : 'No Chrome, toque no menu <b>⋮</b> e em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).';
    el.innerHTML = `<div class="pn-instalar-txt"><b>Instale o GDV Painel no celular</b> para consultar de qualquer lugar. ${como}</div>
      <div class="pn-instalar-acoes">${!ehIOS && eventoInstalar ? '<button type="button" class="pn-btn pn-btn-prim pn-btn-mini" data-instalar="agora">Instalar app</button>' : ''}
      <button type="button" class="pn-instalar-x" data-instalar="fechar" aria-label="Fechar a dica de instalação">✕</button></div>`;
    el.hidden = false;
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); eventoInstalar = e; desenharDicaInstalar(); });
  window.addEventListener('appinstalled', () => { ls.set(LS_SEM_INSTALAR, '1'); eventoInstalar = null; desenharDicaInstalar(); });
  async function acaoInstalar(acao) {
    if (acao === 'agora' && eventoInstalar) {
      const ev = eventoInstalar; eventoInstalar = null; ev.prompt();
      try { const r = await ev.userChoice; if (r && r.outcome === 'accepted') ls.set(LS_SEM_INSTALAR, '1'); } catch (e) { /* cancelado */ }
    } else if (acao === 'fechar') ls.set(LS_SEM_INSTALAR, '1');
    desenharDicaInstalar();
  }

  /* ---------------- login / sessão ---------------- */
  function mostrar(qual) {
    $('#pn-login').hidden = qual !== 'login'; $('#pn-app').hidden = qual !== 'app'; $('#pn-usuario').hidden = qual !== 'app';
    if (qual === 'app') $('#pn-nome').textContent = S.nome || 'Administrador';
    // no modo TV a tela de login só aparece quando o servidor diz que a credencial foi revogada/inválida (nunca por falha de rede)
    // (na primeira configuração da TV, sem credencial ainda, não há sessão para "encerrar": pede o código normalmente)
    const tv = emTV(), encerrada = tv && (S.encerrada || !!ls.get(LS_ENCERRADA));
    $('#pn-login-tit').textContent = encerrada ? 'Sessão encerrada' : tv ? 'Modo TV — acesso do administrador' : 'Acesso do administrador';
    $('#pn-login-txt').innerHTML = tv ? (encerrada ? 'Gere um novo código de administrador e digite aqui' : 'Digite um código de administrador próprio para esta TV')
        + ' (planilha: menu <b>GDV → Gerar código de administrador</b>, ex.: nome “TV Sala da Gerência”).'
      : 'Digite o código de administrador de 6 dígitos gerado na planilha (menu <b>GDV → Gerar código de administrador</b>). Cada código vale uma vez.';
    desenharDicaInstalar();
  }
  function sair(msg) {
    S.encerrada = !!msg;                                       // credencial recusada pelo servidor (não é a 1ª configuração)
    // o motivo fica gravado no aparelho: depois de recarregar (versão nova, TV reiniciada) continua "Sessão encerrada"
    if (msg) ls.set(LS_ENCERRADA, msg); else ls.del(LS_ENCERRADA);
    ls.del(LS_TOKEN); ls.del(LS_NOME); S.token = ''; S.nome = '';
    aoSairFns.forEach(fn => { try { fn(); } catch (e) { /* aba */ } }); S.bruto = S.todos = S.dados = null; clearTimeout(S.timer); S.falhas = 0; S.tfRapido = false;
    desenharAvisoTF();
    mostrar('login'); status(''); const e = $('#pn-login-erro'); e.hidden = !msg; e.textContent = msg || ''; $('#pn-codigo').value = ''; $('#pn-codigo').focus();
    if (S.tv) S.tv.atualizar();
  }
  async function entrar(ev) {
    ev.preventDefault();
    const cod = $('#pn-codigo').value.replace(/\D/g, ''), err = $('#pn-login-erro'), b = $('#pn-entrar');
    err.hidden = true;
    if (cod.length !== 6) { err.textContent = 'O código tem 6 dígitos.'; err.hidden = false; return; }
    b.disabled = true; b.textContent = 'Verificando…';
    try {
      const j = await api({ action: 'painelAtivar', codigo: cod });
      if (!j.token) throw new Error('Resposta sem credencial.');
      S.token = j.token; S.nome = j.nome || 'Administrador'; ls.set(LS_TOKEN, S.token); ls.set(LS_NOME, S.nome);
      S.encerrada = false; ls.del(LS_ENCERRADA);
      iniciarApp();
    } catch (e) { err.textContent = e.message; err.hidden = false; }
    finally { b.disabled = false; b.textContent = 'Entrar'; }
  }
  function iniciarApp() { mostrar('app'); desenharPresets(); desenharBotaoNotif(); carregar(); agendar(); }

  function ligarEventos() {
    $('#pn-login-form').addEventListener('submit', entrar);
    $('#pn-sair').onclick = async () => {
      if (!confirm('Sair do painel? A credencial deste acesso será revogada no servidor e será preciso um novo código de administrador para entrar de novo.')) return;
      const tok = S.token; sair();
      try { await api({ action: 'painelSair', key: tok }); }                // revoga no servidor (cópias do token deixam de valer)
      catch (e) { const er = $('#pn-login-erro'); er.textContent = 'Saiu deste aparelho, mas não foi possível revogar a credencial no servidor (' + e.message + '). Revogue o acesso na planilha (aba Fiscais).'; er.hidden = false; }
    };
    $('#pn-presets').addEventListener('click', e => {
      const b = e.target.closest('[data-preset]'); if (!b) return; F.preset = b.dataset.preset; salvarFiltro(); desenharPresets();
      if (F.preset !== 'custom') carregar();
    });
    $('#pn-aplicar').onclick = () => {
      const de = $('#pn-de').value, ate = $('#pn-ate').value;
      if (!de || !ate) return alert('Informe as duas datas.');
      if (de > ate) return alert('A data inicial é depois da final.');
      if (diasEntre(de, ate) + 1 > MAX_DIAS) return alert(`O período máximo é de ${MAX_DIAS} dias.`);
      F.de = de; F.ate = ate; salvarFiltro(); carregar();
    };
    $('#pn-fiscal').onchange = e => { F.fiscal = e.target.value; salvarFiltro(); recalcular(); };
    $('#pn-local').onchange = e => { F.local = e.target.value; salvarFiltro(); recalcular(); };
    $('#pn-atualizar').onclick = () => carregar();
    $('#pn-abas').addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (b) irPara(b.dataset.aba); });
    $('#pn-abas').addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const l = abasOrdenadas(), i = l.findIndex(a => a.id === S.aba);
      const n = l[(i + (e.key === 'ArrowRight' ? 1 : -1) + l.length) % l.length]; irPara(n.id); const b = document.getElementById('pn-aba-' + n.id); if (b) b.focus();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.token && S.todos && Date.now() - S.ultimaCarga > ATUALIZAR_MS) atualizarSozinho(); });
    // a rede voltou: tenta já, sem esperar o fim da espera crescente
    window.addEventListener('online', () => { if (S.token && S.falhas) agendar(500); });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.dados) renderAba(true); });
    $('#pn-codigo').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
    $('#pn-instalar').addEventListener('click', e => { const b = e.target.closest('[data-instalar]'); if (b) acaoInstalar(b.dataset.instalar); });
    // áudio do alerta de TF: o primeiro gesto na página libera o som (bloqueado pelo navegador até lá)
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, destravarAudio, { once: true, passive: true }));
    const bn = $('#pn-notif');
    if (bn) bn.onclick = () => {
      destravarAudio();
      try { const r = Notification.requestPermission(desenharBotaoNotif); if (r && r.then) r.then(desenharBotaoNotif, desenharBotaoNotif); } catch (e) { desenharBotaoNotif(); }
    };
  }

  registrarAba({ id: 'geral', titulo: 'Visão geral', render: renderGeral,
    contador: d => alertasGerais(d).filter(a => a.nivel === 'critico').length });

  function iniciar() {
    ligarEventos(); desenharPresets();
    if (S.tv) S.tv.iniciar();
    if (S.token) iniciarApp();
    else {
      const msg = ls.get(LS_ENCERRADA);                                    // sessão encerrada antes de recarregar: mostra o motivo de novo
      S.encerrada = !!msg; mostrar('login');
      if (msg) { const e = $('#pn-login-erro'); e.textContent = msg; e.hidden = false; }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else setTimeout(iniciar, 0);

  return {
    registrarAba, irPara, kpis, grafico, matriz, tabela, mapa, alertas, secao, grade, cartao, vazio, el, esc, fmt, auditarNumeracao,
    contar, porDia, topN, porMunicipio, municipioDe, municipioNome, parseProdutos, csv: csvBaixar, csvTexto, norm, lerJSON, alertasGerais, seloSituacao,
    get paleta() { return paleta(); }, get dados() { return S.dados; }, get filtros() { return S.filtros; }, get municipios() { return MUN.map(m => m.nome); },
    agora, recarregar: () => carregar(), DIAS_SEMANA, PROC, somaDias, diasEntre, isoDia,
    TIPOS: (typeof CONFIG !== 'undefined' && CONFIG.tipos) || {},
    // usados pelo modo TV (js/painel-tv.js): mesmos dados e cálculos das abas, sem duplicar regras
    indicadoresGerais, NIVEIS, ORDEM_NIVEL, ORDEM_SITUACAO, diaManaus, horaManaus, temaEscuro, carregarGeo, ls,
    // TF em preenchimento (apreensão em andamento): estado do marcador, ordem nas listas, rótulo e ganchos de teste
    pinoDe, ordemVivo, rotuloTF, tfApreensao, textoTF,
    alertaTF: () => ({ ativos: S.todos ? S.todos.tfsAndamento.map(a => ({ id: a.id, titulo: a.titulo, onde: a.onde, turnoId: a.turno ? a.turno.id : '' })) : [],
                       sons: TFA.sons, notificacoes: TFA.notificacoes, avisos: TFA.avisos, rapido: !!S.tfRapido, proximaMs: S.proxima ? S.proxima - Date.now() : null }),
    hoje: () => diaManaus(agora()), reavaliarAbertos,
    aba: id => S.abas[id] || null,
    /** Dados (já normalizados, sem filtros) recortados em [de, ate] dentro da carga atual; null sem dados. */
    recorte: (de, ate) => S.todos ? aplicarFiltros(S.todos, { fiscal: '', local: null }, { de, ate }) : null,
    get todos() { return S.todos; }, get geo() { return GEO; }, get logado() { return !!S.token; },
    estado: () => ({ ultimaCarga: S.ultimaCarga, ultimaCompleta: S.ultimaCompleta, erro: S.erro, falhas: S.falhas, proxima: S.proxima, carregando: S.carregando, temDados: !!S.todos }),
    /** O modo TV se registra aqui: {ativo() → bool, iniciar(), atualizar()} (atualizar é chamado a cada carga, falha ou fim de sessão). */
    usarTV: h => { S.tv = h; },
    /** API com a credencial do painel ({action, ...} → resposta; erro de sessão volta ao login) e o nome do administrador logado. */
    chamar, get usuario() { return S.nome; }, aoSair: fn => { aoSairFns.push(fn); },
    /** Botão "Encerrar turno" (gerência) para um turno em andamento; null no modo TV. */
    botaoEncerrar,
    trocarModo
  };
})();
