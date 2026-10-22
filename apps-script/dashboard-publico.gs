/* ---------- Dashboard público (web/dashboard/, sem credencial) ----------
 * publicoDados {periodo, previa?, key?}: SÓ AGREGADOS dos blocos que o gerente ligou no painel (aba "Dashboard público"),
 * nunca nomes, CPF/CNPJ, placas, propriedades, servidores, fotos nem coordenadas de levantamentos/propriedades.
 * Mapa: municípios do PCE pelo nome digitado no levantamento (contagens pequenas viram "<3" com a supressão ligada);
 * barreiras em células de 0,1° (~11 km, só para o navegador somar por município) ou pela unidade; BVAs fixas na média das
 * coordenadas de início dos turnos (3 casas); calor em células de 0,1° com contagem (células abaixo do limite somem com a
 * supressão). Volantes nunca aparecem como ponto. Configuração na propriedade PUBLICO_CONFIG (JSON); padrão: desligado.
 * Cache por (versão da configuração, período) por 5 min + cópia "velha" (6 h) servida quando o limitador global de
 * recálculos por minuto estoura. "Barreiras em andamento agora" (desligado por padrão): só BVAs fixas, cache de 1 min. */
const PUBLICO_URL_PADRAO = 'https://evilasionogueiraagro-netizen.github.io/GDV/dashboard/';
const PUBLICO_CACHE_MS = 5 * 60 * 1000;        // números de um período ficam 5 min no CacheService
const PUBLICO_VIVO_MS = 60 * 1000;             // barreiras fixas em andamento: 1 min
const PUBLICO_VELHO_S = 6 * 3600;              // cópia servida quando o limitador estoura
const PUBLICO_MAX_RECALCULOS = 12;             // recálculos por minuto (todas as origens); acima disso, serve o cache
const PUBLICO_MIN_PEQUENO = 3;                 // supressão de números pequenos: 1 e 2 viram "<3"
const PUBLICO_GRADE = 10;                      // células de 1/10 de grau (≈ 11 km)
const PUBLICO_TITULO = 'Defesa Agropecuária em números';
const PUBLICO_TEXTO = 'Ações de educação sanitária, fiscalização do trânsito de vegetais e vigilância fitossanitária da ADAF no Amazonas, a partir dos registros do e-GDV.';
const PUBLICO_PERIODOS = { '15d': 'Últimos 15 dias', '30d': 'Últimos 30 dias', ano: 'Ano atual', anoAnterior: 'Ano anterior', tudo: 'Desde o início',
                           intervalo: 'Intervalo' };   // intervalo: o visitante escolhe de/até (AAAA-MM-DD) dentro dos registros
const PUBLICO_PERIODOS_PADRAO = ['15d', '30d', 'ano', 'anoAnterior', 'intervalo'];
const PUBLICO_PERIODOS_ANTIGOS = ['30d', 'ano', 'anoAnterior', 'tudo'];   // os que existiam antes de 2026-10-20 (config sem periodosConhecidos)
// blocos (KPIs, gráficos e camadas) e o padrão de cada um
const PUBLICO_BLOCOS = {
  acoes: true, horas: true, veiculos: true, pessoas: true, porBarreira: true, tiposVeiculo: true,   // Barreiras
  tfs: true, procedimentos: true, autos: true, produtos: true,                                       // TF de Barreira
  levantamentos: true, municipios: true, deteccoes: true, amostras: true,                            // PCE
  mensal: true,                                                                                       // evolução no tempo
  coropletico: true, bvas: true, calor: false, aoVivo: false,                                         // mapa
  supressaoPequenos: true                                                                             // privacidade
};

function publicoUrl_() { return PropertiesService.getScriptProperties().getProperty('PUBLICO_URL') || PUBLICO_URL_PADRAO; }
function normPub_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function publicoPadrao_() {
  const b = {}; Object.keys(PUBLICO_BLOCOS).forEach(function (k) { b[k] = PUBLICO_BLOCOS[k]; });
  return { ativo: false, titulo: PUBLICO_TITULO, texto: PUBLICO_TEXTO, periodos: PUBLICO_PERIODOS_PADRAO.slice(), modos: { mapa: true, numeros: true },
           blocos: b, versao: 0, atualizadoPor: '', atualizadoEm: 0 };
}

/**
 * Aplica "o" (pedido do painel ou o JSON guardado) sobre "base". estrito = true (salvar pelo painel): chave desconhecida,
 * período desconhecido, nenhum período ou nenhum modo → erro. estrito = false (ler a propriedade): ignora o que não conhece.
 */
function publicoAplicar_(base, o, estrito) {
  const c = JSON.parse(JSON.stringify(base));
  if (!o || typeof o !== 'object') return c;
  const erro = function (m) { if (estrito) throw new Error(m); };
  if ('ativo' in o) c.ativo = o.ativo === true || o.ativo === 1 || o.ativo === '1';
  if ('titulo' in o) c.titulo = String(o.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 120) || PUBLICO_TITULO;
  if ('texto' in o) c.texto = String(o.texto || '').replace(/[ \t]+/g, ' ').trim().slice(0, 600);
  if ('periodos' in o) {
    const lst = Array.isArray(o.periodos) ? o.periodos.map(String) : [];
    lst.forEach(function (p) { if (!PUBLICO_PERIODOS.hasOwnProperty(p)) erro('Período desconhecido: ' + p + '.'); });
    const ok = Object.keys(PUBLICO_PERIODOS).filter(function (p) { return lst.indexOf(p) >= 0; });
    if (ok.length) c.periodos = ok; else erro('Libere pelo menos um período.');
  }
  if ('modos' in o && o.modos && typeof o.modos === 'object') {
    const m = { mapa: c.modos.mapa, numeros: c.modos.numeros };
    Object.keys(o.modos).forEach(function (k) { if (k !== 'mapa' && k !== 'numeros') return erro('Modo desconhecido: ' + k + '.'); m[k] = o.modos[k] === true || o.modos[k] === 1; });
    if (m.mapa || m.numeros) c.modos = m; else erro('Deixe pelo menos um modo (mapa ou números) ligado.');
  }
  if ('blocos' in o && o.blocos && typeof o.blocos === 'object') {
    Object.keys(o.blocos).forEach(function (k) {
      if (!PUBLICO_BLOCOS.hasOwnProperty(k)) return erro('Bloco desconhecido: ' + k + '.');
      c.blocos[k] = o.blocos[k] === true || o.blocos[k] === 1;
    });
  }
  return c;
}
function publicoConfig_() {
  const txt = PropertiesService.getScriptProperties().getProperty('PUBLICO_CONFIG');
  const o = lerJSONSeguro_(txt, null), c = publicoAplicar_(publicoPadrao_(), o, false);
  if (o && typeof o === 'object') {
    c.versao = Number(o.versao) || 0; c.atualizadoPor = String(o.atualizadoPor || ''); c.atualizadoEm = Number(o.atualizadoEm) || 0;
    // período novo no código (ex.: 15 dias, intervalo) entra ligado na config já salva, uma vez; depois vale o que o gerente marcar
    const conhecidos = Array.isArray(o.periodosConhecidos) ? o.periodosConhecidos.map(String) : PUBLICO_PERIODOS_ANTIGOS;
    const novos = PUBLICO_PERIODOS_PADRAO.filter(function (p) { return conhecidos.indexOf(p) < 0; });
    if (novos.length) c.periodos = Object.keys(PUBLICO_PERIODOS).filter(function (p) { return c.periodos.indexOf(p) >= 0 || novos.indexOf(p) >= 0; });
  }
  c.periodosConhecidos = Object.keys(PUBLICO_PERIODOS);
  return c;
}

/** Painel → aba "Dashboard público": lê a configuração (só administrador). */
function painelPublicoConfig(token) {
  adminDoToken_(token);
  return { ok: true, config: publicoConfig_(), url: publicoUrl_(), padrao: publicoPadrao_(), periodos: PUBLICO_PERIODOS };
}
/** Painel → grava a configuração (valida as chaves; registra quem/quando; troca a versão = o cache público antigo deixa de valer). */
function painelPublicoSalvar(token, config) {
  const admin = adminDoToken_(token);
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuração inválida.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const atual = publicoConfig_(), c = publicoAplicar_(atual, config, true);
    c.versao = (atual.versao || 0) + 1; c.atualizadoPor = admin; c.atualizadoEm = Date.now();
    PropertiesService.getScriptProperties().setProperty('PUBLICO_CONFIG', JSON.stringify(c));
    publicoLimparCache_(atual.versao);
    return { ok: true, config: c, url: publicoUrl_() };
  } finally { lock.releaseLock(); }
}
function publicoLimparCache_(versao) {
  const cache = CacheService.getScriptCache(), b = 'publico_' + versao + '_';
  Object.keys(PUBLICO_PERIODOS).forEach(function (p) { cache.remove(b + p); cache.remove(b + p + '_velho'); });
  cache.remove(b + 'vivo'); cache.remove(b + 'vivo_velho');
}

/** Período público (horário de Manaus). intervalo: req.de/req.ate (AAAA-MM-DD), até hoje; erro = {erro}. */
function publicoPeriodo_(chave, req) {
  const hoje = hojeManaus_(), ano = Number(hoje.slice(0, 4));
  let de = somarDias_(hoje, -29), ate = hoje;
  if (chave === 'intervalo') {
    req = req || {};
    const re = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, d = String(req.de || ''), a = String(req.ate || '');
    if (!re.test(d) || !re.test(a)) return { erro: 'Escolha as datas de início e de fim do intervalo.' };
    if (d > a) return { erro: 'A data de início é depois da data de fim.' };
    if (d > hoje) return { erro: 'O intervalo começa depois de hoje.' };
    de = d < '2000-01-01' ? '2000-01-01' : d; ate = a > hoje ? hoje : a;
    const br = function (x) { return x.slice(8, 10) + '/' + x.slice(5, 7) + '/' + x.slice(0, 4); };
    const dias0 = Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 864e5) + 1;
    return { chave: chave, rotulo: 'De ' + br(de) + ' a ' + br(ate), de: de, ate: ate, dias: dias0 };
  }
  if (chave === '15d') de = somarDias_(hoje, -14);
  else if (chave === 'ano') de = ano + '-01-01';
  else if (chave === 'anoAnterior') { de = (ano - 1) + '-01-01'; ate = (ano - 1) + '-12-31'; }
  else if (chave === 'tudo') de = '2000-01-01';
  const dias = Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 864e5) + 1;
  return { chave: chave, rotulo: PUBLICO_PERIODOS[chave], de: de, ate: ate, dias: dias };
}

/** Limitador global: no máximo PUBLICO_MAX_RECALCULOS recálculos por minuto (todas as origens). */
function publicoPodeRecalcular_(cache) {
  const k = 'publico_recalc_' + Math.floor(Date.now() / 60000), n = Number(cache.get(k) || 0);
  if (n >= PUBLICO_MAX_RECALCULOS) return false;
  cache.put(k, String(n + 1), 120);
  return true;
}
/** Valor do cache com validade própria ({em, dados}); vencido → recalcula se o limitador deixar, senão serve o último guardado. */
function publicoDoCache_(cache, chave, validadeMs, calcular) {
  const ler = function (k) { const v = cache.get(k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } };
  const atual = ler(chave);
  if (atual && Date.now() - atual.em < validadeMs) return atual;
  if (!publicoPodeRecalcular_(cache)) {
    const velho = atual || ler(chave + '_velho');
    if (velho) { velho.limitado = true; return velho; }
    throw new Error('Muitos acessos ao mesmo tempo. Tente de novo em um minuto.');
  }
  const o = { em: Date.now(), dados: calcular() }, s = JSON.stringify(o);
  if (s.length < 95000) { cache.put(chave, s, Math.ceil(validadeMs / 1000) + 60); cache.put(chave + '_velho', s, PUBLICO_VELHO_S); }
  return o;
}

const ehFixa_ = function (t) { return normPub_(t.posto) === 'fixa'; };
const celulaPub_ = function (v) { return Math.round(v * PUBLICO_GRADE) / PUBLICO_GRADE; };
/** Coordenada de início do turno (ou a do fim, se faltar), como números; null sem coordenada. */
function coordTurnoPub_(t) {
  let la = numOuNulo_(t.latIni), lo = numOuNulo_(t.lngIni);
  if (la === null || lo === null) { la = numOuNulo_(t.latFim); lo = numOuNulo_(t.lngFim); }
  return la === null || lo === null || (la === 0 && lo === 0) ? null : [la, lo];
}
/** Ponto de cada BVA fixa: média das coordenadas de início de TODOS os turnos fixos daquele local (3 casas decimais ≈ 100 m). */
/** Nome público da BVA: turnos antigos com o local digitado à mão ("CEASA", "bva ceasa") somam com "BVA - CEASA". */
function nomeBvaPub_(local) {
  const l = String(local || '').trim().replace(/\s+/g, ' ');
  if (!l) return '';
  const base = l.toUpperCase().replace(/^BVA\b\s*[-–]?\s*/, '');
  return base ? 'BVA - ' + base : l;
}

function coordsBVA_(turnos) {
  const s = {};
  turnos.forEach(function (t) {
    const nome = nomeBvaPub_(t.local), c = coordTurnoPub_(t);
    if (!nome || !ehFixa_(t) || !c) return;
    const x = s[nome] = s[nome] || { la: 0, lo: 0, n: 0 }; x.la += c[0]; x.lo += c[1]; x.n++;
  });
  const out = {};
  Object.keys(s).forEach(function (k) { out[k] = [Math.round(s[k].la / s[k].n * 1000) / 1000, Math.round(s[k].lo / s[k].n * 1000) / 1000]; });
  return out;
}

/** Agregados do período (só os blocos ligados). */
function publicoCalcular_(cfg, per) {
  const B = cfg.blocos, de = per.de, ate = per.ate, agora = Date.now();
  const noPer = function (r) { return r.data >= de && r.data <= ate; };
  const lim = B.supressaoPequenos ? PUBLICO_MIN_PEQUENO : 0;
  const sup = function (n) { return lim && n > 0 && n < lim ? '<' + lim : n; };
  const passo = per.dias <= 31 ? 'dia' : 'mes', serie = {};
  let primeiro = '';
  const ponto = function (d) {
    if (!primeiro || d < primeiro) primeiro = d;
    const k = passo === 'dia' ? d : d.slice(0, 7);
    return serie[k] = serie[k] || { veiculos: 0, tfs: 0, levantamentos: 0 };
  };

  // ---- Barreiras ----
  const todosTurnos = lerLeitura_('Turnos').filter(function (t) { return t.id; });
  const turnoPorId = {}, locDe = {}, porLoc = {}, porBar = {}, volante = { local: 'Postos volantes', fixa: false, acoes: 0, veiculos: 0 };
  let acoes = 0, minutos = 0;
  const locKey = function (t) {
    const c = coordTurnoPub_(t);
    if (c) return 'c:' + celulaPub_(c[0]) + ',' + celulaPub_(c[1]);
    const u = String(t.unidade || '').trim().toUpperCase();
    return u ? 'u:' + u : '';
  };
  const loc = function (k) {
    if (!k) return null;
    if (!porLoc[k]) {
      const o = porLoc[k] = { acoes: 0, veiculos: 0, tfs: 0 };
      if (k.slice(0, 2) === 'c:') { const p = k.slice(2).split(','); o.lat = Number(p[0]); o.lon = Number(p[1]); } else o.unidade = k.slice(2);
    }
    return porLoc[k];
  };
  todosTurnos.forEach(function (t) {
    turnoPorId[t.id] = t; locDe[t.id] = locKey(t);
    if (!noPer(t)) return;
    t._per = true; acoes++;
    const ini = tsManaus_(t.data, t.inicio);
    if (ini !== null) {
      let f = t.encerrado === 1 ? (t.fim ? tsManaus_(t.data, t.fim) : null) : Math.min(agora, ini + TURNO_MAX_MS);
      if (f !== null && t.encerrado === 1 && f < ini) f += 864e5;
      if (f !== null && f > ini) minutos += Math.min(f - ini, 24 * 3600 * 1000) / 60000;
    }
    const l = loc(locDe[t.id]); if (l) l.acoes++;
    const nb = ehFixa_(t) ? nomeBvaPub_(t.local) : '';
    const b = nb ? (porBar[nb] = porBar[nb] || { local: nb, fixa: true, acoes: 0, veiculos: 0 }) : volante;
    b.acoes++; t._bar = b;
  });
  let veiculos = 0, pessoas = 0; const tipos = {};
  todosTurnos.forEach(function (t) { if (t._per) pessoas += Number(t.pessoasEducacao) || 0; });   // turno sem veículos: pessoas orientadas no turno
  lerLeitura_('Veiculos').forEach(function (v) {
    const t = turnoPorId[v.turnoId];
    if (!v.id || v.excluido === 1 || !t || !t._per) return;
    veiculos++; pessoas += v.pessoas || 0;
    const tp = String(v.tipo || '').trim().toUpperCase().slice(0, 4) || 'OUTRO'; tipos[tp] = (tipos[tp] || 0) + 1;
    const l = loc(locDe[t.id]); if (l) l.veiculos++;
    t._bar.veiculos++;
    ponto(t.data).veiculos++;
  });

  // ---- TF de Barreira (válidos = não cancelados) ----
  const tfs = lerLeitura_('TFs').filter(function (r) { return r.id && r.cancelado !== 1 && noPer(r); });
  const proc = { liberacao: 0, apreensao: 0, rechaco: 0, outro: 0 }, prod = {};
  let autos = 0;
  tfs.forEach(function (r) {
    proc[proc.hasOwnProperty(r.procedimento) && r.procedimento !== 'outro' ? r.procedimento : 'outro']++;
    if (r.auto === 1) autos++;
    ponto(r.data).tfs++;
    const l = turnoPorId[r.turnoId] ? loc(locDe[r.turnoId]) : null; if (l) l.tfs++;
    if (r.procedimento !== 'apreensao') return;
    produtosTF_(r.produtos).forEach(function (p) {
      const nome = String(p.produto).toUpperCase().slice(0, 60), un = String(p.unidade || '').slice(0, 20), k = nome + '|' + un.toLowerCase();
      const x = prod[k] = prod[k] || { produto: nome, unidade: un, quantidade: 0, tfs: 0 };
      x.tfs++; if (p.quantidade !== null) x.quantidade += p.quantidade;
    });
  });

  // ---- PCE ----
  const levs = lerLeitura_('Levantamentos').filter(function (r) { return r.id && r.excluido !== 1 && noPer(r); });
  const porMun = {}, pragas = {}, calor = {};
  let det = 0, susp = 0, comDet = 0, amostras = 0;
  levs.forEach(function (r) {
    const cult = culturasLev_(r), d = cult.filter(function (c) { return c.praga; });
    ponto(r.data).levantamentos++;
    det += d.length; if (d.length) comDet++;
    d.forEach(function (c) {
      const p = pragas[c.praga] = pragas[c.praga] || { praga: String(c.praga).slice(0, 80), deteccoes: 0, suspeitas: 0, mun: {} };
      p.deteccoes++; if (c.resultado === 'suspeita') { p.suspeitas++; susp++; }
      if (r.municipio) p.mun[normPub_(r.municipio)] = true;
    });
    amostras += cult.filter(function (c) { return c.coleta === 'Sim'; }).length;
    const km = normPub_(r.municipio);
    if (km) { const m = porMun[km] = porMun[km] || { municipio: String(r.municipio).trim().slice(0, 60), levantamentos: 0, deteccoes: 0 }; m.levantamentos++; m.deteccoes += d.length; }
    const la = numOuNulo_(r.lat), lo = numOuNulo_(r.lon);
    if (d.length && la !== null && lo !== null) { const k = celulaPub_(la) + ',' + celulaPub_(lo); calor[k] = (calor[k] || 0) + d.length; }
  });
  const termos = (B.amostras ? lerLeitura_('Colheitas') : []).filter(function (r) { return r.id && r.excluido !== 1 && r.cancelado !== 1 && noPer(r); }).length;

  const out = {};
  if (cfg.modos.numeros) {
    const N = out.numeros = {};
    if (B.acoes) N.acoes = acoes;
    if (B.horas) N.horas = Math.round(minutos / 60);
    if (B.veiculos) N.veiculos = veiculos;
    if (B.pessoas) N.pessoas = pessoas;
    if (B.porBarreira) N.porBarreira = Object.keys(porBar).map(function (k) { return porBar[k]; }).sort(function (a, b) { return b.veiculos - a.veiculos || a.local.localeCompare(b.local); })
      .concat(volante.acoes ? [volante] : []).map(function (b) { return { local: b.local, fixa: b.fixa, acoes: B.acoes ? b.acoes : undefined, veiculos: B.veiculos ? b.veiculos : undefined }; });
    if (B.tiposVeiculo) N.tiposVeiculo = Object.keys(tipos).map(function (k) { return { tipo: k, n: tipos[k] }; }).sort(function (a, b) { return b.n - a.n; });
    if (B.tfs) N.tfs = tfs.length;
    if (B.procedimentos) N.procedimentos = proc;
    if (B.autos) N.autos = autos;
    if (B.produtos) N.produtos = Object.keys(prod).map(function (k) { const p = prod[k]; p.quantidade = Math.round(p.quantidade * 100) / 100; return p; })
      .sort(function (a, b) { return b.tfs - a.tfs || b.quantidade - a.quantidade; }).slice(0, 15);
    if (B.levantamentos) N.levantamentos = levs.length;
    if (B.municipios) { N.municipiosCobertos = Object.keys(porMun).length; N.municipiosTotal = 62; }
    if (B.deteccoes) {
      N.deteccoes = det; N.suspeitas = susp; N.levComDeteccao = comDet; N.levNegativos = levs.length - comDet;
      N.pragas = Object.keys(pragas).map(function (k) { const p = pragas[k]; return { praga: p.praga, deteccoes: p.deteccoes, suspeitas: p.suspeitas, municipios: Object.keys(p.mun).length }; })
        .sort(function (a, b) { return b.deteccoes - a.deteccoes || a.praga.localeCompare(b.praga); }).slice(0, 20);
    }
    if (B.amostras) { N.amostras = amostras; N.termos = termos; }
    const campos = ['veiculos', 'tfs', 'levantamentos'].filter(function (k) { return B[k]; });
    if (B.mensal && campos.length) {
      const pontos = [];
      let d = per.chave === 'tudo' && primeiro > de ? primeiro : de;            // "desde o início": a partir do primeiro registro
      if (passo === 'mes') d = d.slice(0, 7) + '-01';
      for (let i = 0; d <= ate && i < 800; i++) {
        const k = passo === 'dia' ? d : d.slice(0, 7), s = serie[k] || {}, p = { chave: k };
        campos.forEach(function (c) { p[c] = s[c] || 0; });
        pontos.push(p);
        if (passo === 'dia') d = somarDias_(d, 1);
        else { const a = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); d = (m === 12 ? (a + 1) + '-01' : a + '-' + String(m + 1).padStart(2, '0')) + '-01'; }
      }
      N.serie = { passo: passo, campos: campos, pontos: pontos };
    }
  }
  if (cfg.modos.mapa) {
    const M = out.mapa = {};
    if (B.coropletico && (B.levantamentos || B.deteccoes)) M.pce = Object.keys(porMun).map(function (k) {
      const m = porMun[k], o = { municipio: m.municipio };
      if (B.levantamentos) o.levantamentos = sup(m.levantamentos);
      if (B.deteccoes) o.deteccoes = sup(m.deteccoes);
      return o;
    });
    if (B.coropletico && (B.acoes || B.veiculos || B.tfs)) M.barreiras = Object.keys(porLoc).map(function (k) {
      const l = porLoc[k], o = l.unidade ? { unidade: l.unidade } : { lat: l.lat, lon: l.lon };
      if (B.acoes) o.acoes = l.acoes; if (B.veiculos) o.veiculos = l.veiculos; if (B.tfs) o.tfs = l.tfs;
      return o;
    });
    if (B.bvas) {
      const co = coordsBVA_(todosTurnos);
      M.bvas = Object.keys(co).sort().map(function (k) {
        const b = porBar[k] || { acoes: 0, veiculos: 0 }, o = { nome: k, lat: co[k][0], lon: co[k][1] };
        if (B.acoes) o.acoes = b.acoes; if (B.veiculos) o.veiculos = b.veiculos;
        return o;
      });
    }
    if (B.calor) M.calor = Object.keys(calor).filter(function (k) { return calor[k] >= (lim || 1); })
      .map(function (k) { const p = k.split(','); return [Number(p[0]), Number(p[1]), calor[k]]; });
  }
  return out;
}

/** BVAs fixas com turno aberto agora (início nas últimas 12 h): nome, quantos em andamento e o ponto da BVA. Volantes nunca. */
function publicoAoVivo_() {
  const agora = Date.now(), turnos = lerLeitura_('Turnos').filter(function (t) { return t.id; }), por = {};
  turnos.forEach(function (t) {
    if (t.encerrado === 1 || !ehFixa_(t)) return;
    const nome = nomeBvaPub_(t.local), ini = tsManaus_(t.data, t.inicio);
    if (!nome || ini === null || agora - ini > TURNO_MAX_MS || ini - agora > ENCERRAR_TOLERANCIA_MS) return;
    por[nome] = (por[nome] || 0) + 1;
  });
  const co = coordsBVA_(turnos);
  return Object.keys(por).sort().map(function (k) { const o = { nome: k, emAndamento: por[k] }; if (co[k]) { o.lat = co[k][0]; o.lon = co[k][1]; } return o; });
}

/**
 * publicoDados {periodo?, previa?, key?}: página pública (sem credencial). Desligado → {ok, ativo: false}.
 * previa = true com credencial de administrador: mostra a configuração salva mesmo com o dashboard desligado (pré-visualização do painel).
 */
function publicoDados_(req) {
  const cfg = publicoConfig_();
  const previa = req.previa === true;
  if (previa) adminDoToken_(req.key);
  if (!cfg.ativo && !previa) return { ok: true, ativo: false };
  const periodos = cfg.periodos.map(function (k) { return { chave: k, rotulo: PUBLICO_PERIODOS[k] }; });
  const chave = req.periodo ? String(req.periodo) : (cfg.periodos.indexOf('30d') >= 0 ? '30d' : cfg.periodos[0]);   // abre nos 30 dias, se liberado
  if (cfg.periodos.indexOf(chave) < 0) return { ok: false, erro: 'Este período não está disponível no dashboard. Escolha outro.', periodos: periodos };
  const cache = CacheService.getScriptCache(), base = 'publico_' + cfg.versao + '_';
  const per = publicoPeriodo_(chave, req);
  if (per.erro) return { ok: false, erro: per.erro, intervaloInvalido: true };
  const ck = chave === 'intervalo' ? 'iv_' + per.de + '_' + per.ate : chave;   // cada intervalo tem o seu cache
  const c = publicoDoCache_(cache, base + ck, PUBLICO_CACHE_MS, function () { return publicoCalcular_(cfg, per); });
  const r = { ok: true, ativo: cfg.ativo, previa: previa, titulo: cfg.titulo, texto: cfg.texto, modos: cfg.modos, blocos: cfg.blocos,
              periodos: periodos, periodo: { chave: chave, rotulo: per.rotulo, de: per.de, ate: per.ate }, hoje: hojeManaus_(),
              atualizadoEm: c.em, agora: Date.now(), supressao: cfg.blocos.supressaoPequenos ? PUBLICO_MIN_PEQUENO : 0 };
  if (c.limitado) r.doCache = true;
  if (c.dados.numeros) r.numeros = c.dados.numeros;
  if (c.dados.mapa) r.mapa = c.dados.mapa;
  if (cfg.modos.mapa && cfg.blocos.aoVivo) {
    const v = publicoDoCache_(cache, base + 'vivo', PUBLICO_VIVO_MS, publicoAoVivo_);
    r.aoVivo = { em: v.em, locais: v.dados };
  }
  return r;
}
