const amb = require('./lib/amb');
// E2E do modo TV (Sala de Situação), do painel no celular e do mapa sem tiles: painel real (8081) contra o Code.gs real (fakegas, API 8082).
// Dados semeados como no painel_test.js.
const { chromium } = require('playwright-core'); const fs = require('fs');
const { API, PAINEL: WEB } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };

/* ---------- tempo (Manaus = UTC−4) ---------- */
const MS_MANAUS = ms => new Date(ms - 4 * 3600e3);
const diaM = (ms) => MS_MANAUS(ms).toISOString().slice(0, 10);
const hmM = (ms) => MS_MANAUS(ms).toISOString().slice(11, 16);
const AGORA = Date.now(), HOJE = diaM(AGORA), dia = n => diaM(AGORA + n * 864e5);
const tsM = (d, hm) => Date.parse(`${d}T${hm}:00-04:00`);

/* ---------- ponto interno de cada município (a partir da própria malha) ---------- */
const GEO = JSON.parse(fs.readFileSync(amb.RAIZ + '/web/painel/dados/am-municipios.json', 'utf8'));
const dentro = (x, y, anel) => { let d = false; for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) { const [xi, yi] = anel[i], [xj, yj] = anel[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d; } return d; };
function pontoEm(nome) {
  const f = GEO.features.find(f => f.properties.name === nome); const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const pip = (x, y) => polys.some(p => dentro(x, y, p[0]) && !p.slice(1).some(b => dentro(x, y, b)));
  const big = polys.sort((a, b) => b[0].length - a[0].length)[0][0];
  let x0 = 180, x1 = -180, y0 = 90, y1 = -90; big.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  let melhor = null, md = -1;   // ponto da grade mais longe da borda (aprox.: distância mínima aos vértices)
  for (let i = 1; i < 20; i++) for (let j = 1; j < 20; j++) { const x = x0 + (x1 - x0) * i / 20, y = y0 + (y1 - y0) * j / 20; if (!pip(x, y)) continue;
    const dmin = Math.min(...big.map(([a, b]) => (a - x) ** 2 + (b - y) ** 2)); if (dmin > md) { md = dmin; melhor = [y, x]; } }
  return melhor.map(v => +v.toFixed(5));
}
const P = Object.fromEntries(['Manaus', 'Tabatinga', 'Parintins', 'Humaitá', 'Itacoatiara', 'Manacapuru', 'Coari'].map(n => [n, pontoEm(n)]));

/* ---------- dados de teste ---------- */
const TIPOS = { PA: 5, UT: 5, CC: 1, CB: 1, ON: 40, MT: 2 };
const iniD = AGORA - 60 * 60e3, iniF = AGORA - 120 * 60e3;
const TURNOS = [
  { id: 'tA', data: dia(-2), letra: 'A', inicio: '06:00', fim: '14:00', fiscal: 'João Silva e Maria Souza', local: 'Barreira Porto CEASA', posto: 'Fixa', encerrado: 1, mun: 'Manaus',
    v: [['06:30', 'PA', 5], ['07:10', 'PA', 4], ['08:45', 'ON', 40], ['12:05', 'CC', 1], ['13:50', 'MT', 2], ['09:00', 'UT', 3, 1]] },
  { id: 'tB', data: dia(-1), letra: 'B', inicio: '14:00', fim: '22:00', fiscal: 'Carlos Lima', local: 'Barreira Tabatinga', posto: 'Fixa', encerrado: 1, mun: 'Tabatinga',
    v: [['15:00', 'PA', 5], ['18:20', 'UT', 5], ['21:40', 'CB', 1]] },
  { id: 'tC', data: dia(-20), letra: 'A', inicio: '06:00', fim: '14:00', fiscal: 'Carlos Lima', local: 'Barreira Parintins', posto: 'Móvel', encerrado: 1, mun: 'Parintins',
    v: [['07:00', 'PA', 3], ['09:00', 'MT', 2], ['10:00', 'PA', 5]] },
  { id: 'tD', data: diaM(iniD), letra: 'A', inicio: hmM(iniD), fim: '', fiscal: 'Maria Souza', local: 'Barreira BR-230 Humaitá', posto: 'Móvel', encerrado: 0, mun: 'Humaitá',
    v: [[hmM(AGORA - 50 * 60e3), 'PA', 5], [hmM(AGORA - 10 * 60e3), 'PA', 5]] },
  { id: 'tE', data: dia(-1), letra: 'A', inicio: '05:00', fim: '', fiscal: 'Pedro Alves', local: 'Barreira Itacoatiara', posto: 'Fixa', encerrado: 0, mun: 'Itacoatiara', v: [['06:00', 'PA', 5]] }
];
// tF: aberto, sem sinal há 2 h (gravado direto na planilha com srv_ts antigo)
const TF_SEMSINAL = { id: 'tF', data: diaM(iniF), letra: 'A', inicio: hmM(iniF), fim: '', fiscal: 'Rita Gomes', local: 'Barreira Manacapuru', posto: 'Fixa', encerrado: 0, mun: 'Manacapuru', v: [] };
// antigo-1: linha que o fakegas já traz (3 dias atrás, 04:00–12:00, sem veículos, unidade MANAUS)
const ANTIGO = { id: 'antigo-1', data: diaM(AGORA - 3 * 864e5), inicio: '04:00', fim: '12:00', fiscal: 'Maria', local: 'CEASA', encerrado: 1, mun: 'Manaus', v: [] };

const ts0 = AGORA;
const turnoReg = t => ({ id: t.id, numeroTF: 'TF-' + t.id, data: t.data, letra: t.letra, inicio: t.inicio, fim: t.fim, fiscal: t.fiscal, local: t.local, unidade: 'MANAUS', posto: t.posto,
  encerrado: t.encerrado, criadoEm: ts0, atualizadoEm: ts0, latIni: String(P[t.mun][0]), lngIni: String(P[t.mun][1]), precIni: '10',
  latFim: t.encerrado ? String(P[t.mun][0] + 0.0003) : '', lngFim: t.encerrado ? String(P[t.mun][1]) : '', precFim: t.encerrado ? '8' : '' });
const veics = []; TURNOS.forEach(t => t.v.forEach(([h, k, p, exc], i) => veics.push({ id: `${t.id}-v${i}`, turnoId: t.id, hora: h, placa: `PL${t.id}${i}A00`.slice(0, 7), tipo: k, pessoas: p, obs: '', excluido: exc || 0, criadoEm: ts0, atualizadoEm: ts0 })));
const CPF = '52998224725';
const TF = (id, data, turnoId, proc, numero, extra = {}) => ({ id, barreira: 'BVA-CEASA', ano: +data.slice(0, 4), numero, numeroTxt: String(numero).padStart(3, '0') + '/' + data.slice(0, 4) + '/BVA - CEASA',
  turnoId, veiculoId: '', data, hora: '09:00', fiscal: 'João Silva', local: 'Barreira Porto CEASA', placa: 'ABC1D23', origem: 'Manacapuru', destino: 'Manaus', doc: CPF, nome: 'Fulano Transportes',
  rg: '123', endereco: 'Rua X', municipio: 'Manaus', uf: 'AM', telefone: '92 90000-0000', relacao: 'Motorista', inspecao: 1, coleta: 0, amostras: 0, procedimento: proc, fiel: 0, auto: 0, advertencia: 0,
  documentos: JSON.stringify({ nf: '1', ptv: '' }), produtos: JSON.stringify(['CARAMBOLA - 10 Kg']), constatacao: 'x', enquadramento: 'y', reincidente: 0, tfsAnteriores: 0, cancelado: 0, motivoCancel: '',
  criadoEm: ts0, atualizadoEm: ts0, numeroOrigem: 'sugerido', numeroSugerido: numero, ...extra });
const TFS = [
  TF('tf1', dia(-2), 'tA', 'apreensao', 1, { reincidente: 1, tfsAnteriores: 2, auto: 1 }),
  TF('tf2', dia(-2), 'tA', 'liberacao', 2, { produtos: JSON.stringify(['ACEROLA - 5 Caixas']), origem: 'Iranduba' }),
  TF('tf3', dia(-1), 'tB', 'rechaco', 4, { fiscal: 'Carlos Lima', local: 'Barreira Tabatinga', origem: 'Benjamin Constant', destino: 'Tabatinga', produtos: JSON.stringify(['CARAMBOLA - 1.200,5 Kg']) }),
  TF('tf4', dia(-1), 'tB', 'liberacao', 5, { fiscal: 'Carlos Lima', cancelado: 1, motivoCancel: 'erro' })
];
const cult = (c, praga, area, coleta = 'Não') => ({ cultura: c, area: String(area), espLinha: '3', espPlanta: '2', praga, coleta, tipoMaterial: coleta === 'Sim' ? 'Folha' : '', codigoAmostra: '', destinoAmostra: '' });
const LEV = (id, data, mun, servidor, culturas, extra = {}) => ({ id, data, hora: '09:30', servidor, cargo: 'Fiscal', matricula: 'M1', lotacao: 'IDAM', doc: CPF, nome: 'Produtor ' + id, telefone: '97 9', email: 'a@b.c',
  propriedade: 'Sítio ' + id, codigoPropriedade: 'P-' + id, situacaoFundiaria: 'Própria', municipio: mun, lat: P[mun] ? String(P[mun][0]) : '', lon: P[mun] ? String(P[mun][1]) : '', precisao: '6',
  culturas: JSON.stringify(culturas), fotos: JSON.stringify(['f1']), assinaturas: '{}', obs: '', excluido: 0, criadoEm: ts0, atualizadoEm: ts0, ...extra });
// levantamento por praga, como o app grava: pragas + culturas derivadas (praga só se detectada/suspeita)
const LEVP = (id, data, mun, servidor, pragas, extra = {}) => LEV(id, data, mun, servidor, pragas.flatMap(g => g.culturas.map(c => ({ cultura: c.cultura, area: c.area, espLinha: '', espPlanta: '',
  praga: c.resultado === 'nao_detectada' ? '' : g.praga, pragaAvaliada: g.praga, resultado: c.resultado, coleta: c.coleta, tipoMaterial: '', codigoAmostra: '', destinoAmostra: '' }))), { pragas: JSON.stringify(pragas), ...extra });
const LEVS = [
  LEV('l1', dia(-3), 'Tabatinga', 'Ana Pereira', [cult('Banana', 'Moko da bananeira', 2, 'Sim'), cult('Mandioca', '', 1.5)]),
  LEV('l2', dia(-2), 'Manaus', 'Bruno Costa', [cult('Cupuaçu', 'Vassoura-de-bruxa', 3)]),
  LEV('l3', dia(-10), 'Parintins', 'Bruno Costa', [cult('Açaí', '', 4)]),
  LEV('l4', dia(-15), 'Coari', 'Ana Pereira', [cult('Banana', 'Sigatoka-negra', 1, 'Sim')], { lat: '', lon: '' }),
  LEV('l5', dia(-100), 'Manaus', 'Bruno Costa', [cult('Cupuaçu', 'Vassoura-de-bruxa', 2)]),          // histórico: Vassoura em Manaus não é foco novo
  LEV('l6', dia(-3), 'Manaus', 'Bruno Costa', [cult('Banana', 'Moko da bananeira', 9)], { excluido: 1 }),   // excluído: fora de tudo
  // formato novo (por praga): a mesma cultura em 2 pragas (suspeita + não detectada) e um levantamento negativo
  LEVP('l7', dia(-4), 'Manaus', 'Ana Pereira', [{ praga: 'Vassoura-de-bruxa', culturas: [{ cultura: 'Cupuaçu', area: '3', resultado: 'suspeita', coleta: 'Não', fotos: [] }] },
    { praga: 'Fusarium R4T', culturas: [{ cultura: 'Cupuaçu', area: '3', resultado: 'nao_detectada', coleta: 'Não', fotos: [] }] }]),
  LEVP('l8', dia(-5), 'Parintins', 'Bruno Costa', [{ praga: 'Sigatoka-negra', culturas: [{ cultura: 'Banana', area: '1,5', resultado: 'nao_detectada', coleta: 'Não', fotos: [] }] }])
];
const COL = (id, data, mun, numero, levId) => ({ id, unidade: 'IDAM TABATINGA', ano: +data.slice(0, 4), numero, numeroTxt: '', levantamentoId: levId, data, hora: '10:00', servidor: 'Ana Pereira', cargo: 'Fiscal',
  matricula: 'M1', lotacao: 'IDAM', municipio: mun, doc: CPF, nome: 'Produtor', endereco: 'Rua', lat: P[mun] ? String(P[mun][0] + 0.01) : '', lon: P[mun] ? String(P[mun][1]) : '', precisao: '5',
  cultura: 'Banana', quantidade: '2 kg', analise: 'Fitopatológica', partes: 'Folhas', descricao: '', fotos: '[]', testemunha1Nome: '', testemunha1Doc: '', testemunha2Nome: '', testemunha2Doc: '',
  assinaturas: '{}', local: 'Sítio', cancelado: 0, motivoCancel: '', excluido: 0, criadoEm: ts0, atualizadoEm: ts0 });
const COLS = [COL('c1', dia(-3), 'Tabatinga', 1, 'l1'), COL('c2', dia(-15), 'Coari', 2, 'l4')];

/* ---------- valores esperados, calculados à parte ---------- */
const todosT = [...TURNOS, TF_SEMSINAL, ANTIGO];
// horas de barreira: turno aberto há mais de 12 h (esquecido) conta no máximo 12 h
const durMin = t => { const i = tsM(t.data, t.inicio); let f = t.encerrado ? tsM(t.data, t.fim) : Date.now(); if (f < i) f += 864e5; const m = (f - i) / 60000; return !t.encerrado && m > 12 * 60 ? 12 * 60 : m; };
function esperado(de, ate, filtroT = () => true, filtroL = () => true) {
  const ts = todosT.filter(t => (t.data >= de && t.data <= ate) && filtroT(t));
  const vs = ts.flatMap(t => t.v.filter(v => !v[3]));
  const abertos = todosT.filter(t => !t.encerrado && filtroT(t));
  const levs = LEVS.filter(l => !l.excluido && l.data >= de && l.data <= ate && filtroL(l)).map(l => ({ ...l, c: JSON.parse(l.culturas) }));
  return { turnos: ts.length, veiculos: vs.length, pessoas: vs.reduce((s, v) => s + v[2], 0), horas: ts.reduce((s, t) => s + durMin(t), 0) / 60, abertos: abertos.length,
    levs: levs.length, det: levs.reduce((s, l) => s + l.c.filter(c => c.praga).length, 0), comPraga: levs.filter(l => l.c.some(c => c.praga)).length,
    // a mesma cultura avaliada para várias pragas conta uma vez (área e culturas inspecionadas)
    area: levs.reduce((s, l) => s + Object.values(l.c.reduce((m, c) => ({ ...m, [c.cultura]: Math.max(m[c.cultura] || 0, Number(String(c.area).replace(',', '.'))) }), {})).reduce((a, b) => a + b, 0), 0),
    culturas: levs.reduce((s, l) => s + new Set(l.c.map(c => c.cultura)).size, 0),
    susp: levs.reduce((s, l) => s + l.c.filter(c => c.praga && c.resultado === 'suspeita').length, 0), negativos: levs.filter(l => !l.c.some(c => c.praga)).length,
    amostras: levs.reduce((s, l) => s + l.c.filter(c => c.coleta === 'Sim').length, 0),
    termos: COLS.filter(c => c.data >= de && c.data <= ate && filtroL(c)).length,
    tfs: TFS.filter(t => !t.cancelado && t.data >= de && t.data <= ate) };
}
const br = v => String(v).replace('.', ',');
const nv = s => Number(String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));


/* ======================= Modo TV (Sala de Situação) + celular + mapa sem tiles ======================= */
const ORDEM = ['aovivo', 'alertas', 'aovivo', 'barreiras', 'aovivo', 'tf', 'aovivo', 'pce'];
const TZM = 'America/Manaus';
const hmsM = ms => new Intl.DateTimeFormat('pt-BR', { timeZone: TZM, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
const dataExtM = ms => { const s = new Intl.DateTimeFormat('pt-BR', { timeZone: TZM, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms)); return s.charAt(0).toUpperCase() + s.slice(1); };
const esperaReal = ms => new Promise(r => setTimeout(r, ms));
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
// erros esperados quando o teste corta a rede de propósito (API fora / tiles bloqueados)
const ESPERADO_CORTE = /Failed to load resource: net::ERR_(FAILED|INTERNET_DISCONNECTED|BLOCKED_BY_CLIENT|CONNECTION_REFUSED|ABORTED)/;

(async () => {
  /* ---------- carga da planilha falsa (igual ao painel_test.js) ---------- */
  const r = await post({ action: 'sync', key: 'segredo', since: 0, turnos: TURNOS.map(turnoReg), veiculos: veics, tfs: TFS, levantamentos: LEVS, colheitas: COLS });
  ok(r.ok, 'sync de preparação', r.erro);
  // a barreira esquecida aberta (tE, > 12 h) precisa continuar aberta para testar o estado "aberta > 12 h": sem o encerramento automático
  ok((await get('/__fn?nome=desativarRotinasAutomaticas_')).r === 0, 'rotinas automáticas desativadas (encerramento automático fica para o rotinas_test.js)');
  const tsF = iniF + 60e3, f = turnoReg(TF_SEMSINAL);
  const linhaF = ['id', 'numeroTF', 'data', 'letra', 'inicio', 'fim', 'fiscal', 'local', 'unidade', 'posto', 'encerrado', 'criadoEm', 'atualizadoEm', 'srv_ts', 'latIni', 'lngIni', 'precIni', 'latFim', 'lngFim', 'precFim', 'usuario']
    .map(k => k === 'criadoEm' || k === 'atualizadoEm' || k === 'srv_ts' ? tsF : k === 'usuario' ? 'Rita Gomes' : f[k]);
  await fetch(API + '/__append?aba=Turnos&row=' + encodeURIComponent(JSON.stringify(linhaF)));
  /** Credencial de administrador própria (como a TV da sala): gera o código e ativa pela API. */
  const credencial = async nome => { const g = await get('/__gerar?nome=' + encodeURIComponent(nome) + '&perfil=admin'); const a = await post({ action: 'painelAtivar', codigo: g.codigo }); return { token: a.token, nome: a.nome || nome }; };
  const sessao = c => ({ 'gdv.painel.token': c.token, 'gdv.painel.nome': c.nome });
  const TV = await credencial('TV Sala da Gerência');

  const b = await amb.lancar();
  const erros = [];
  async function abrir(o = {}) {
    const c = await b.newContext({ viewport: o.viewport || { width: 1920, height: 1080 }, deviceScaleFactor: o.dsf || 1, timezoneId: o.tz || TZM, locale: 'pt-BR',
      userAgent: o.ua, screen: o.screen, isMobile: !!o.mobile, hasTouch: !!o.mobile, colorScheme: o.esquema || 'light', serviceWorkers: 'block' });
    // tiles do OSM: bloqueados (rede sem acesso a mapas) — o mapa tem de ficar com fundo neutro
    await c.route('https://tile.openstreetmap.org/**', rt => rt.abort('blockedbyclient'));
    await c.addInitScript(i => {
      if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); }
      // Screen Wake Lock falso: registra os pedidos
      window.__wake = []; window.__sentinelas = [];
      Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get() { return { request: async t => {
        window.__wake.push(t); const s = new EventTarget(); s.released = false; s.type = t;
        s.release = async () => { s.released = true; s.dispatchEvent(new Event('release')); }; window.__sentinelas.push(s); return s; } }; } });
    }, o.ls || {});
    const p = await c.newPage(); p.erros = []; p.cortado = false;
    const anota = m => { if (p.cortado && ESPERADO_CORTE.test(m)) return; if (/tile\.openstreetmap\.org/.test(m) || (o.tilesBloq !== false && ESPERADO_CORTE.test(m) && /BLOCKED_BY_CLIENT/.test(m))) return; p.erros.push(m); erros.push((o.nome || '') + ': ' + m); };
    p.on('pageerror', e => anota('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') anota(m.text()); });
    p.on('response', rs => { if (rs.status() >= 400) anota(rs.status() + ' ' + rs.url()); });
    p.on('dialog', d => d.accept());
    if (o.relogio) await p.clock.install({ time: Date.now() });
    await p.goto(o.url || WEB); return p;
  }
  const esperarTV = p => p.waitForSelector('#tv-palco .tv-kpi', { timeout: 20000 }).then(() => p.waitForTimeout(700));
  const esperarDados = p => p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 }).then(() => p.waitForTimeout(400));
  const tela = p => p.evaluate(() => { const r = document.getElementById('tv-raiz'); return r ? { tela: r.dataset.tela, i: +r.dataset.indice, pausado: r.dataset.pausado } : null; });
  const kpiTV = (p, chave) => p.locator(`#tv-palco .tv-kpi[data-chave="${chave}"] .tv-kpi-val`).first().textContent().then(s => s.trim()).catch(() => null);
  const irTela = async (p, id) => { await p.evaluate(i => PainelTV.ir(i), id); await p.waitForTimeout(700); };
  const avanca = async (p, ms) => { await p.clock.fastForward(ms); await esperaReal(250); };
  /** Espera (tempo real) até a condição na página; a página tem relógio falso, então o polling é feito daqui. */
  async function ate(p, fn, arg, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.evaluate(fn, arg)) return true; } catch (e) { /* navegando */ } await esperaReal(150); } return false; }

  /** Layout da TV: sem rolagem, todo texto dentro da viewport, sem texto cortado por contêiner, sem sobreposição, fontes mínimas. */
  const layout = p => p.evaluate(() => {
    const W = innerWidth, H = innerHeight, vh = H / 100, raiz = document.getElementById('tv-raiz'), probs = [];
    const de = document.documentElement;
    if (de.scrollHeight > H + 1 || de.scrollWidth > W + 1 || document.body.scrollHeight > H + 1) probs.push(`rolagem ${de.scrollWidth}x${de.scrollHeight}`);
    const visivel = e => { for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const cs = getComputedStyle(x); if (x.hidden || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return true; };
    const tw = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT), cx = [], reticencias = []; let menor = 1e9, menorTxt = '';
    while (tw.nextNode()) {
      const t = tw.currentNode, txt = t.textContent.trim(); if (!txt) continue;
      const e = t.parentElement; if (e.closest('.tv-ctl, .tv-dica') || !visivel(e)) continue;
      const rg = document.createRange(); rg.selectNodeContents(t);
      const fs = parseFloat(getComputedStyle(e).fontSize);
      // caixa da "tinta": a caixa do texto tem a altura da fonte inteira (≈1,2 em); a linha pode ser mais baixa (line-height 1,05)
      const rs = [...rg.getClientRects()].filter(x => x.width > 0.5 && x.height > 0.5).map(x => { const c = (x.top + x.bottom) / 2, h = Math.min(x.height / 2, fs * 0.45);
        return { left: x.left, right: x.right, top: c - h, bottom: c + h, width: x.width, height: 2 * h }; });
      if (!rs.length) continue; if (fs < menor) { menor = fs; menorTxt = (e.className || e.tagName) + ' "' + txt.slice(0, 30) + '"'; }
      // cortado: alguma caixa do texto passa da área de um ancestral que recorta (overflow ≠ visible)
      // reticências (text-overflow / line-clamp) são aceitas só em textos secundários (detalhes, subtítulos); nunca em rótulos e valores
      const ret = el => { const cs = getComputedStyle(el); return cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none'); };
      const essencial = e.closest('.tv-kpi-rot, .tv-kpi-val, h1, h2, .tv-vivo-nome, .tv-vivo-c-nome b, .tv-rotulo, .tv-alerta-tit, .tv-hora, .tv-faixa, #tv-nome');
      // A caixa de um texto com reticências é a do texto INTEIRO (passa do ancestral que recorta); o que aparece na tela é
      // só a parte dentro dele. Por isso "fora da tela" e "sobreposto" usam a parte visível (recortada pelo ancestral com
      // reticências aceito); o próprio ancestral continua sendo checado como qualquer outro texto/caixa.
      let vis = rs;
      for (let a = e; a && a !== raiz.parentElement; a = a.parentElement) {
        const cs = getComputedStyle(a); if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const ab = a.getBoundingClientRect();
        if (ret(a) && !essencial && (a.scrollWidth > a.clientWidth + 1 || a.scrollHeight > a.clientHeight + 1)) {
          reticencias.push(txt.slice(0, 30));
          vis = rs.map(bx => { const l = Math.max(bx.left, ab.left), r = Math.min(bx.right, ab.right), t0 = Math.max(bx.top, ab.top), b0 = Math.min(bx.bottom, ab.bottom);
            return { left: l, right: r, top: t0, bottom: b0, width: r - l, height: b0 - t0 }; }).filter(bx => bx.width > 0.5 && bx.height > 0.5);
          break;
        }
        if (rs.some(bx => bx.right > ab.right + 1 || bx.bottom > ab.bottom + 1 || bx.left < ab.left - 1 || bx.top < ab.top - 1)) { probs.push(`cortado: "${txt.slice(0, 40)}" (${String(a.className).slice(0, 30)})`); break; }
      }
      vis.forEach(bx => {
        if (bx.left < -0.5 || bx.top < -0.5 || bx.right > W + 0.5 || bx.bottom > H + 0.5) probs.push('fora da tela: "' + txt.slice(0, 40) + '"');
        cx.push({ bx, txt: txt.slice(0, 30), t });
      });
    }
    for (let i = 0; i < cx.length; i++) for (let j = i + 1; j < cx.length; j++) {
      const a = cx[i].bx, c = cx[j].bx; if (cx[i].t === cx[j].t) continue;
      const w = Math.min(a.right, c.right) - Math.max(a.left, c.left), h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
      if (w > 2 && h > 2) probs.push(`sobreposto: "${cx[i].txt}" × "${cx[j].txt}"`);
    }
    // mapa: o estado inteiro cabe no quadro (contornos municipais dentro do contêiner do mapa)
    document.querySelectorAll('#tv-raiz .tv-mapa').forEach(m => { const mr = m.getBoundingClientRect(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      m.querySelectorAll('.leaflet-overlay-pane path').forEach(pth => { const r = pth.getBoundingClientRect(); if (!r.width) return; x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); });
      if (x1 > x0 && (x0 < mr.left - 1 || y0 < mr.top - 1 || x1 > mr.right + 1 || y1 > mr.bottom + 1)) probs.push(`mapa cortado: estado ${Math.round(x0)},${Math.round(y0)}–${Math.round(x1)},${Math.round(y1)} × quadro ${Math.round(mr.left)},${Math.round(mr.top)}–${Math.round(mr.right)},${Math.round(mr.bottom)}`); });
    // fontes dos gráficos (canvas)
    let menorGraf = 1e9;
    Object.values(window.Chart ? Chart.instances : {}).forEach(ch => { if (!ch.canvas.closest('#tv-raiz')) return; Object.values(ch.options.scales || {}).forEach(s => { if (s.display !== false && s.ticks && s.ticks.font && s.ticks.font.size) menorGraf = Math.min(menorGraf, s.ticks.font.size); }); });
    // valores de KPI ≥ 6vh; os indicadores menores da tela Ao vivo (pessoas, TFs, apreensões) ≥ 3,4vh
    const vals = [...raiz.querySelectorAll('.tv-kpi-val')].filter(e => !e.closest('.tv-kpis-mini')).map(e => parseFloat(getComputedStyle(e).fontSize) / vh);
    const mini = [...raiz.querySelectorAll('.tv-kpis-mini .tv-kpi-val')].map(e => parseFloat(getComputedStyle(e).fontSize) / vh);
    const rots = [...raiz.querySelectorAll('.tv-kpi-rot, .tv-cab h2')].map(e => parseFloat(getComputedStyle(e).fontSize) / vh);
    return { probs: [...new Set(probs)], menorVh: menor / vh, menorTxt, menorGrafVh: menorGraf === 1e9 ? null : menorGraf / vh, kpiValVh: Math.min(...vals), miniValVh: mini.length ? Math.min(...mini) : null, rotVh: Math.min(...rots), textos: cx.length, reticencias };
  });
  const checarLayout = async (p, nome) => {
    const L = await layout(p);
    ok(!L.probs.length, `${nome}: sem rolagem, sem texto fora da tela/cortado/sobreposto (${L.textos} textos)`, L.probs.slice(0, 6));
    if (L.reticencias.length) console.log(`    (${nome}: encurtado com reticências, texto secundário: ${L.reticencias.join(' | ')})`);
    ok(L.menorVh >= 1.6 * 0.97, `${nome}: menor fonte ≥ 1,6vh`, L.menorVh.toFixed(2) + 'vh ' + L.menorTxt);
    ok(L.menorGrafVh == null || L.menorGrafVh >= 1.6 * 0.95, `${nome}: fontes dos gráficos ≥ 1,6vh`, L.menorGrafVh && L.menorGrafVh.toFixed(2));
    ok(L.kpiValVh >= 6 * 0.97 && L.rotVh >= 2 * 0.97 && (L.miniValVh == null || L.miniValVh >= 3.4 * 0.97), `${nome}: valores de KPI ≥ 6vh (menores da Ao vivo ≥ 3,4vh) e rótulos ≥ 2vh`, [L.kpiValVh.toFixed(2), L.miniValVh && L.miniValVh.toFixed(2), L.rotVh.toFixed(2)]);
    return L;
  };

  /**
   * Tela Ao vivo: sem linha de KPIs no topo (os indicadores ficam na coluna da direita, acima da lista), mapa na altura toda
   * (≥ 70% da área útil entre cabeçalho/faixas e rodapé) e os 62 municípios dentro do quadro do mapa.
   */
  const geoVivo = p => p.evaluate(() => {
    const palco = document.getElementById('tv-palco'), mapa = document.querySelector('#tv-palco .tv-mapa'), dir = document.querySelector('#tv-palco .tv-vivo-dir');
    const lista = document.querySelector('#tv-palco .tv-cartao-lista'), cm = document.querySelector('#tv-palco .tv-cartao-mapa');
    const r = e => e.getBoundingClientRect(), mr = r(mapa), pr = r(palco), lr = r(lista);
    const kpis = [...palco.querySelectorAll('.tv-kpis')];
    const paths = [...mapa.querySelectorAll('.leaflet-overlay-pane path')].map(r).filter(x => x.width > 0);
    const fora = paths.filter(x => x.left < mr.left - 1 || x.top < mr.top - 1 || x.right > mr.right + 1 || x.bottom > mr.bottom + 1).length;
    const u = paths.reduce((a, x) => ({ l: Math.min(a.l, x.left), t: Math.min(a.t, x.top), rr: Math.max(a.rr, x.right), b: Math.max(a.b, x.bottom) }), { l: 1e9, t: 1e9, rr: -1e9, b: -1e9 });
    const prs = getComputedStyle(palco), util = pr.height - parseFloat(prs.paddingTop) - parseFloat(prs.paddingBottom);
    return { kpisTopo: kpis.filter(k => k.parentElement === palco).length, kpisDir: kpis.filter(k => dir && dir.contains(k)).length,
      kpisAcimaLista: kpis.every(k => r(k).bottom <= lr.top + 1), chaves: [...palco.querySelectorAll('.tv-kpi')].map(k => k.dataset.chave),
      mapaAltura: +(mr.height / util).toFixed(3), cartaoAltura: +(r(cm).height / util).toFixed(3), largura: +(r(cm).width / (r(cm).width + lr.width)).toFixed(3),
      municipios: paths.length, fora, sobraV: Math.round(Math.min(u.t - mr.top, mr.bottom - u.b)), sobraH: Math.round(Math.min(u.l - mr.left, mr.right - u.rr)),
      preenche: +Math.max((u.rr - u.l) / mr.width, (u.b - u.t) / mr.height).toFixed(3) };
  });
  const checarVivo = async (p, nome) => {
    const G = await geoVivo(p);
    ok(G.kpisTopo === 0 && G.kpisDir === 2 && G.kpisAcimaLista && JSON.stringify(G.chaves) === JSON.stringify(['andamento', 'veiculos', 'pessoas', 'tfs', 'apreensoes']),
      `${nome}: sem linha de KPIs no topo; os 5 indicadores na coluna da direita, acima da lista`, G);
    ok(G.mapaAltura >= 0.7 && G.cartaoAltura >= 0.97 && G.largura > 0.57 && G.largura < 0.63, `${nome}: mapa com ${(G.mapaAltura * 100).toFixed(0)}% da altura útil (cartão do topo ao rodapé), ${(G.largura * 100).toFixed(0)}% da largura`, G);
    ok(G.municipios === 62 && G.fora === 0 && G.preenche >= 0.9, `${nome}: os 62 municípios dentro do quadro do mapa (estado preenche ${(G.preenche * 100).toFixed(0)}% do quadro)`, G);
    return G;
  };

  /* ================= 1. ?tv=1 — telas, números, layout 1080p ================= */
  console.log('1. Modo TV por ?tv=1 (1920×1080)');
  let p = await abrir({ nome: 'tv1080', url: WEB + '?tv=1&rotacao=300&rotacaoAoVivo=300', ls: sessao(TV) });
  await esperarTV(p); await p.waitForFunction(() => document.body.classList.contains('tv-ocioso'), null, { timeout: 8000 }); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.body.classList.contains('tv') && localStorage.getItem('gdv.painel.tv') === '1'), '?tv=1 liga o modo TV e lembra no aparelho (gdv.painel.tv=1)');
  ok(await p.isHidden('#pn-sair') && await p.isHidden('#pn-app') && await p.isHidden('#pn-login'), 'no modo TV: botão Sair (logout) escondido, sem filtros nem login');
  ok(/Sala de Situação — GDV/.test(await p.textContent('.tv-topo h1')) && await p.isVisible('.tv-logo'), 'topo: logo ADAF e "Sala de Situação — GDV"');
  ok(/^Atualizado às \d{2}:\d{2}$/.test((await p.textContent('#tv-atual-txt')).trim()) && await p.isHidden('#tv-faixa'), 'topo: "Atualizado às HH:MM", sem faixa de sem conexão', (await p.textContent('#tv-atual-txt')).trim());
  ok((await tela(p)).tela === 'aovivo', 'começa na tela Ao vivo');
  ok(/Ao vivo — Barreiras \(hoje\)/.test(await p.textContent('#tv-nome')) && await p.locator('#tv-pontos i').count() === 8, 'rodapé: nome da tela e 8 pontos de navegação', await p.textContent('#tv-nome'));
  ok(await p.locator('.tv-progresso #tv-barra').count() === 1, 'rodapé: barra de progresso');
  // números da tela ao vivo × dados semeados
  // dia real da passagem: turno de até 20 h → pela hora (passou da meia-noite = dia seguinte); turno mais longo (esquecido aberto) →
  // pelo momento em que o veículo chegou à planilha (criadoEm), pois a hora sozinha não diz o dia
  const durReal = t => { const i = tsM(t.data, t.inicio); let f = t.encerrado ? tsM(t.data, t.fim) : Date.now(); if (f < i) f += 864e5; return (f - i) / 60000; };
  const diaVeic = (t, v) => { if (durReal(t) >= 20 * 60) { let d = diaM(ts0); if (tsM(d, v[0]) > ts0 + 5 * 60e3) d = diaM(Date.parse(d + 'T12:00:00-04:00') - 864e5); return d < t.data ? t.data : d; }
    const [hv, hi] = [v[0], t.inicio].map(h => +h.slice(0, 2) * 60 + +h.slice(3, 5)); return hv < hi - 30 ? diaM(Date.parse(t.data + 'T12:00:00-04:00') + 864e5) : t.data; };
  const vHojeEsp = TURNOS.flatMap(t => t.v.filter(v => !v[3]).map(v => ({ t, v }))).filter(({ t, v }) => diaVeic(t, v) === HOJE);
  ok(await kpiTV(p, 'andamento') === '3', 'Ao vivo: barreiras ativas = 3 (em andamento, sem sinal, > 12 h)', await kpiTV(p, 'andamento'));
  ok(await kpiTV(p, 'veiculos') === String(vHojeEsp.length), `Ao vivo: veículos hoje = ${vHojeEsp.length}`, await kpiTV(p, 'veiculos'));
  ok(await kpiTV(p, 'pessoas') === String(vHojeEsp.reduce((s, x) => s + x.v[2], 0)), 'Ao vivo: pessoas hoje', await kpiTV(p, 'pessoas'));
  ok(await kpiTV(p, 'tfs') === String(TFS.filter(t => !t.cancelado && t.data === HOJE).length), 'Ao vivo: TFs hoje', await kpiTV(p, 'tfs'));
  const pinos = await p.$$eval('.tv-mapa .leaflet-marker-pane .tv-pin', x => x.map(e => e.className.replace('tv-pin ', '')).sort());
  ok(JSON.stringify(pinos) === JSON.stringify(['longa', 'ok', 'semsinal']), 'mapa: 3 marcadores (em andamento, sem sinal, > 12 h)', pinos);
  const rotulos = await p.$$eval('.tv-mapa .tv-rotulo', x => x.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(rotulos.length === 3 && rotulos.some(t => /BR-230 Humaitá/.test(t)), 'mapa: rótulo permanente em cada barreira (nome + veículos hoje)', rotulos);
  // achado: glifo legível e forma por situação (daltonismo); situação escrita no rótulo
  const glifos = () => p.evaluate(() => { const vh = innerHeight / 100;
    const g = sel => { const v = [...document.querySelectorAll(sel)].filter(e => /semsinal|longa/.test(e.className)).map(e => parseFloat(getComputedStyle(e).fontSize) * (/longa/.test(e.className) ? 0.78 : 1) / vh); return v.length ? Math.min(...v) : null; };
    const forma = s => { const e = document.querySelector('.tv-mapa .tv-pin.' + s); if (!e) return null; const cs = getComputedStyle(e); return cs.borderRadius + '|' + cs.transform; };
    return { mapa: g('.tv-mapa .tv-pin'), leg: g('.tv-leg .tv-pin'), lista: g('.tv-lista .tv-pin'), formas: { ok: forma('ok'), semsinal: forma('semsinal'), longa: forma('longa') } }; });
  const gl = await glifos();
  ok([gl.mapa, gl.leg, gl.lista].every(v => v == null || v >= 1.6 * 0.97) && gl.mapa != null && gl.leg != null, 'glifos "!" e "?" dos marcadores ≥ 1,6vh (mapa e legenda)', gl);
  ok(new Set(Object.values(gl.formas)).size === 3 && Object.values(gl.formas).every(Boolean), 'cada situação tem forma própria (círculo / quadrado / losango), não só cor', gl.formas);
  const rotSit = await p.$$eval('.tv-mapa .tv-rotulo', x => x.map(e => ({ t: e.textContent.replace(/\s+/g, ' ').trim(), bl: parseFloat(getComputedStyle(e).borderLeftWidth) })));
  ok(rotSit.some(r => /Manacapuru/.test(r.t) && /^\? sem sinal/.test(r.t) && r.bl > 4) && rotSit.some(r => /Itacoatiara/.test(r.t) && /^! \d+ h/.test(r.t) && r.bl > 4) && rotSit.filter(r => /^[?!]/.test(r.t)).length === 2,
    'rótulo do mapa diz a situação (! N h / ? sem sinal) com borda de status; o "ok" fica sem marca', rotSit);
  ok(await p.locator('.tv-mapa .leaflet-control-zoom').count() === 0 && await p.evaluate(() => { const m = document.querySelector('.tv-mapa'); return m && !m.querySelector('img.leaflet-tile'); }), 'mapa da TV: sem botões de zoom e sem tiles');
  const fundoTV = await p.$eval('.tv-mapa', e => getComputedStyle(e).backgroundColor);
  const rgb = s => s.match(/[\d.]+/g).slice(0, 3).map(Number), sat = c => Math.max(...c) - Math.min(...c), lum = c => (c[0] + c[1] + c[2]) / 3;
  ok(sat(rgb(fundoTV)) < 20 && lum(rgb(fundoTV)) < 70, 'mapa da TV (escuro): fundo neutro escuro, não roxo', fundoTV);
  const nLista = await p.evaluate(() => { const l = document.querySelector('.tv-lista'); const vis = [...l.children].filter(e => !e.hidden && !e.classList.contains('tv-mais')).length; const m = l.querySelector('.tv-mais'); return vis + (m ? +(m.textContent.match(/\+(\d+)/) || [0, 0])[1] : 0); });
  ok(nLista === 3, 'lista lateral: 3 barreiras em andamento (visíveis + "+N")', nLista);
  const listaTxt = (await p.textContent('.tv-lista')).replace(/\s+/g, ' ');
  ok(/Manacapuru/.test(listaTxt) && /Itacoatiara/.test(listaTxt) && /(SEM SINAL|Sem sinal)/.test(listaTxt), 'lista: barreira sem sinal e a aberta > 12 h aparecem', listaTxt.slice(0, 120));
  // o mini-gráfico "veículos por hora" saiu (não cabia legível na coluna): o pico do dia vai escrito no detalhe de "Veículos hoje"
  const picoEsp = (() => { const h = Array(24).fill(0); vHojeEsp.forEach(({ v }) => h[+v[0].slice(0, 2)]++); const m = Math.max(...h); return { h: h.indexOf(m), n: m }; })();
  const detV = (await p.textContent('.tv-kpi[data-chave="veiculos"] .tv-kpi-det')).trim();
  ok(new RegExp(`pico às ${picoEsp.h}h \\(${picoEsp.n}\\)`).test(detV) && await p.locator('.tv-kpi[data-chave="veiculos"] canvas').count() === 0, `Veículos hoje: detalhe com o pico do dia (${picoEsp.h}h, ${picoEsp.n})`, detV);
  ok(await p.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches === false && document.documentElement.dataset.theme === 'dark'), 'tema escuro na TV (padrão), mesmo com o aparelho no claro');
  await checarLayout(p, '1080p aovivo'); await checarVivo(p, '1080p aovivo'); await p.screenshot({ path: amb.saida('tv_aovivo.png') });
  // o próprio verificador acusa sobreposição e texto cortado (controle)
  await p.evaluate(() => { const k = document.querySelector('.tv-kpi-rot'); const x = k.cloneNode(true); x.id = 'tv-teste-sobre'; x.style.cssText = 'position:fixed;left:' + (k.getBoundingClientRect().left + 4) + 'px;top:' + k.getBoundingClientRect().top + 'px'; document.getElementById('tv-raiz').appendChild(x);
    const c = document.querySelector('.tv-kpi-val'); c.dataset.orig = c.textContent; c.textContent = '123.456.789.000'; });
  const ctl = await layout(p);
  ok(ctl.probs.some(x => /sobreposto/.test(x)) && ctl.probs.some(x => /cortado/.test(x)), 'controle: o verificador de layout detecta sobreposição e corte', ctl.probs.slice(0, 2));
  await p.evaluate(() => { document.getElementById('tv-teste-sobre').remove(); const c = document.querySelector('.tv-kpi-val'); c.textContent = c.dataset.orig; });

  // demais telas, com números
  await irTela(p, 'alertas');
  const al = await p.evaluate(() => ({ n: Painel.alertasGerais(Painel.dados).length, vis: [...document.querySelectorAll('.tv-alertas .tv-alerta')].filter(e => !e.hidden).map(e => e.className.replace('tv-alerta ', '')),
    mais: (document.querySelector('.tv-alertas .tv-mais') || { textContent: '' }).textContent }));
  const nMais = +((al.mais.match(/\+(\d+)/) || [0, 0])[1]);
  ok(al.vis.length >= 3 && al.vis.length + nMais === al.n, `Alertas: ${al.vis.length} visíveis + ${nMais} = os ${al.n} alertas da Visão geral`, al.mais);
  ok(al.vis[0] === 'critico' && al.vis.every((v, i) => !i || ({ critico: 0, serio: 1, atencao: 2, info: 3 })[al.vis[i - 1]] <= ({ critico: 0, serio: 1, atencao: 2, info: 3 })[v]), 'Alertas: críticos primeiro', al.vis);
  await checarLayout(p, '1080p alertas'); await p.screenshot({ path: amb.saida('tv_alertas.png') });

  await irTela(p, 'barreiras');
  const E7 = esperado(dia(-6), HOJE), E30 = esperado(dia(-29), HOJE);
  ok(await kpiTV(p, 'veiculos') === String(E7.veiculos) && await kpiTV(p, 'turnos') === String(E7.turnos), `Barreiras 7 dias: ${E7.turnos} turnos, ${E7.veiculos} veículos`, [await kpiTV(p, 'turnos'), await kpiTV(p, 'veiculos')]);
  ok(/últimos 7 dias/.test(await p.textContent('#tv-nome')) && await p.locator('#tv-palco canvas').count() === 3, 'Barreiras: veículos por dia, fluxo por hora e ranking');
  await checarLayout(p, '1080p barreiras'); await p.screenshot({ path: amb.saida('tv_barreiras.png') });
  // achado: valor ≥ 10.000 ("123,5 mil") não pode sair cortado com reticências
  const caber = await p.evaluate(() => { const f0 = Painel.fmt.compacto; Painel.fmt.compacto = () => '123,5 mil'; PainelTV.redesenhar();
    const vs = [...document.querySelectorAll('#tv-palco .tv-kpi-val')].map(e => ({ t: e.textContent, cabe: e.scrollWidth <= e.clientWidth + 1, ell: getComputedStyle(e).textOverflow, vh: +(parseFloat(getComputedStyle(e).fontSize) / innerHeight * 100).toFixed(2) }));
    Painel.fmt.compacto = f0; PainelTV.redesenhar(); return vs; });
  ok(caber.filter(v => v.t === '123,5 mil').length >= 4 && caber.every(v => v.cabe && v.ell !== 'ellipsis' && v.vh >= 4.4 * 0.97), 'KPI "123,5 mil": a fonte diminui até caber, sem reticências', caber);

  await irTela(p, 'tf');
  ok(await kpiTV(p, 'tfs') === String(E30.tfs.length) && await kpiTV(p, 'apreensao') === '1' && await kpiTV(p, 'rechaco') === '1', `TF 30 dias: ${E30.tfs.length} TFs, 1 apreensão, 1 rechaço`, [await kpiTV(p, 'tfs'), await kpiTV(p, 'apreensao'), await kpiTV(p, 'rechaco')]);
  await checarLayout(p, '1080p tf'); await p.screenshot({ path: amb.saida('tv_tf.png') });

  await irTela(p, 'pce');
  ok(await kpiTV(p, 'levantamentos') === String(E30.levs), `PCE 30 dias: ${E30.levs} levantamentos`, await kpiTV(p, 'levantamentos'));
  ok(/4\s*\/\s*62/.test(await kpiTV(p, 'cobertura')), 'PCE: cobertura municipal 4 / 62', await kpiTV(p, 'cobertura'));
  const focosTV = (await p.textContent('.tv-focos')).replace(/\s+/g, ' ');
  ok(/Moko da bananeira — Tabatinga/.test(focosTV) && /Sigatoka-negra — Coari/.test(focosTV) && !/Vassoura/.test(focosTV), 'PCE: novos focos (Moko/Tabatinga, Sigatoka/Coari; Vassoura em Manaus não)', focosTV.slice(0, 120));
  ok(await p.locator('.tv-mapa canvas.leaflet-heatmap-layer').count() === 1, 'PCE: mapa de calor de pragas');
  const pts = await p.evaluate(() => { const pal = Painel.paleta, d = (c) => [...document.querySelectorAll('.tv-mapa .leaflet-overlay-pane path')].filter(x => x.getAttribute('fill') === c).map(x => +(x.getBoundingClientRect().width / innerHeight * 100).toFixed(2));
    return { sem: d(pal.serie[0]), com: d(pal.serie[1]) }; });
  ok(pts.sem.length >= 1 && pts.sem.every(w => w >= 1.9) && pts.com.length >= 1 && pts.com.every(w => w >= 2.5), 'PCE: pontos de levantamento visíveis a distância (sem praga ≥ 2vh, com praga ≥ 2,6vh de diâmetro)', pts);
  await checarLayout(p, '1080p pce'); await p.screenshot({ path: amb.saida('tv_pce.png') });
  const vivos = await p.evaluate(() => ({ e: PainelTV.estado(), mapasDom: document.querySelectorAll('#tv-raiz .leaflet-container').length, graf: Object.values(Chart.instances).length }));
  ok(vivos.e.mapas === 1 && vivos.mapasDom === 1 && vivos.graf === vivos.e.graficos, 'sem vazamento: só os gráficos/mapa da tela atual existem', vivos);
  ok(!p.erros.length, 'tv1080: sem erros de console', p.erros);
  await p.context().close();

  /* ================= 2. 4K ================= */
  console.log('2. 3840×2160');
  p = await abrir({ nome: 'tv4k', viewport: { width: 3840, height: 2160 }, url: WEB + '?tv=1&rotacao=300&rotacaoAoVivo=300', ls: sessao(TV) });
  await esperarTV(p); await p.waitForFunction(() => document.body.classList.contains('tv-ocioso'), null, { timeout: 8000 }); await p.waitForTimeout(400);
  for (const id of ['aovivo', 'alertas', 'barreiras', 'tf', 'pce']) {
    await irTela(p, id); await checarLayout(p, '4K ' + id);
    if (id === 'aovivo') { await checarVivo(p, '4K aovivo'); await p.screenshot({ path: amb.saida('tv_aovivo_4k.png') }); }
  }
  await p.context().close();

  /* ================= 2b. Ao vivo em várias resoluções (Chrome em janela com barras: 1366×620) ================= */
  console.log('2b. Ao vivo: mapa na altura toda, em várias resoluções');
  for (const [w, h] of [[1366, 620], [1366, 768], [1920, 1080], [3840, 2160]]) {
    p = await abrir({ nome: `vivo${w}x${h}`, viewport: { width: w, height: h }, url: WEB + '?tv=1&rotacao=300&rotacaoAoVivo=300', ls: sessao(TV) });
    await esperarTV(p); await p.waitForFunction(() => document.body.classList.contains('tv-ocioso'), null, { timeout: 8000 }); await p.waitForTimeout(400);
    await checarLayout(p, `${w}×${h} aovivo`); await checarVivo(p, `${w}×${h} aovivo`);
    ok(await kpiTV(p, 'andamento') === '3' && await kpiTV(p, 'veiculos') === String(vHojeEsp.length), `${w}×${h}: barreiras ativas e veículos hoje`, [await kpiTV(p, 'andamento'), await kpiTV(p, 'veiculos')]);
    if (w < 3840) await p.screenshot({ path: amb.saida(`tv_aovivo_novo_${w}x${h}.png`) });
    ok(!p.erros.length, `vivo ${w}×${h}: sem erros de console`, p.erros);
    await p.context().close();
  }

  /* ================= 3. relógio, rotação, teclas, wake lock, Esc ================= */
  console.log('3. Relógio de Manaus, rotação, teclas, wake lock');
  p = await abrir({ nome: 'tvrot', tz: 'America/Sao_Paulo', relogio: true, url: WEB + '?tv=1', ls: sessao(TV) });
  await esperarTV(p); await p.evaluate(() => PainelTV.ir(0));
  const hora = (await p.textContent('#tv-hora')).trim(), agoraN = Date.now();
  ok(/^\d{2}:\d{2}:\d{2}$/.test(hora) && [hmsM(agoraN), hmsM(agoraN - 60e3)].includes(hora.slice(0, 5)), 'relógio HH:MM:SS no horário de Manaus (aparelho em Brasília)', hora + ' esperado ' + hmsM(agoraN));
  ok((await p.textContent('#tv-data')).trim() === dataExtM(agoraN), 'data por extenso (Manaus)', (await p.textContent('#tv-data')).trim());
  const h0 = await p.textContent('#tv-hora'); await avanca(p, 2000); ok(await p.textContent('#tv-hora') !== h0, 'relógio anda a cada segundo');
  ok(JSON.stringify(await p.evaluate(() => PainelTV.opcoes.telas)) === JSON.stringify(ORDEM), 'ordem padrão: aovivo, alertas, aovivo, barreiras, aovivo, tf, aovivo, pce');
  const opR = await p.evaluate(() => PainelTV.opcoes);
  ok(opR.rotacaoMs === 10000 && opR.aoVivoMs === 60000, 'padrão: 60 s em cada passagem pela Ao vivo e 10 s nas demais telas', opR);
  // duração de cada tela com relógio falso: a Ao vivo fica 60 s, as demais 10 s; a barra do rodapé anda no tempo da tela atual
  const barraMs = () => p.evaluate(() => { const t = getComputedStyle(document.getElementById('tv-barra')).transitionDuration; return Math.round(parseFloat(t) * (/ms$/.test(t) ? 1 : 1000)); });
  const visto = [(await tela(p)).tela], tempos = [], barras = [await barraMs()];
  let tAtual = 0;
  for (let i = 1; i <= 8; i++) {
    const antes = (await tela(p)).i; let dt = 0;
    while ((await tela(p)).i === antes && dt < 120000) { await avanca(p, 5000); dt += 5000; }
    tempos.push(dt); visto.push((await tela(p)).tela); barras.push(await barraMs()); tAtual += dt;
  }
  ok(JSON.stringify(visto) === JSON.stringify(ORDEM.concat('aovivo')), 'rotação passa por todas as telas na ordem e volta ao início', visto);
  ok(JSON.stringify(tempos) === JSON.stringify(ORDEM.map(t => t === 'aovivo' ? 60000 : 10000)), 'tempo de cada tela: Ao vivo 60 s, demais 10 s', tempos);
  const fracVivo = tempos.filter((_, k) => ORDEM[k] === 'aovivo').reduce((a, b) => a + b, 0) / tAtual;
  ok(fracVivo > 0.8, `a Ao vivo fica ${(fracVivo * 100).toFixed(0)}% do tempo (240 s de 280 s)`, fracVivo);
  ok(barras.every((ms, k) => Math.abs(ms - (visto[k] === 'aovivo' ? 60000 : 10000)) < 1500), 'barra de progresso com a duração de cada tela (60 s / 10 s)', barras);
  ok(/A seguir: Alertas/.test(await p.textContent('#tv-prox')), 'rodapé: "A seguir"', await p.textContent('#tv-prox'));
  const est = await p.evaluate(() => ({ e: PainelTV.estado(), dom: document.querySelectorAll('#tv-raiz .leaflet-container').length }));
  ok(est.e.mapas === 1 && est.dom === 1 && est.e.graficos <= 2, 'depois de uma volta completa: 1 mapa e ≤ 2 gráficos vivos (nada acumulado)', est);
  // teclas
  await p.keyboard.press('ArrowRight'); ok((await tela(p)).i === 1 && (await tela(p)).tela === 'alertas', '→ vai para a próxima tela');
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowLeft'); ok((await tela(p)).i === 1, '← volta uma tela');
  await p.keyboard.press(' '); ok((await tela(p)).pausado === '1' && await p.isVisible('#tv-pausa') && /Pausado/.test(await p.textContent('#tv-pausa')), 'espaço pausa e mostra "Pausado"');
  await avanca(p, 25000); ok((await tela(p)).i === 1, 'pausado: a rotação não anda');
  await p.keyboard.press(' '); ok((await tela(p)).pausado === '0' && await p.isHidden('#tv-pausa'), 'espaço de novo retoma');
  await avanca(p, 10500); ok((await tela(p)).i === 2, 'rotação segue depois de retomar');
  // wake lock
  ok(await p.evaluate(() => window.__wake.includes('screen')), 'Wake Lock: navigator.wakeLock.request("screen") pedido', await p.evaluate(() => window.__wake));
  await p.evaluate(async () => { await window.__sentinelas[window.__sentinelas.length - 1].release(); document.dispatchEvent(new Event('visibilitychange')); });
  ok(await ate(p, () => window.__wake.length >= 2), 'Wake Lock: pedido de novo ao voltar a aba (visibilitychange)', await p.evaluate(() => window.__wake.length));
  // cursor e botão "Sair do modo TV"
  await p.mouse.move(300, 300); await p.mouse.move(320, 310); await esperaReal(400);
  ok(await p.evaluate(() => document.body.classList.contains('tv-mexeu') && getComputedStyle(document.getElementById('tv-ctl')).opacity === '1'), 'mexer o mouse mostra "Tela cheia" e "Sair do modo TV"');
  await avanca(p, 3500); ok(await p.evaluate(() => document.body.classList.contains('tv-ocioso') && getComputedStyle(document.body).cursor === 'none'), 'cursor some após 3 s parado');
  // Esc sai sem logout
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !document.body.classList.contains('tv') && !localStorage.getItem('gdv.painel.tv') && !!localStorage.getItem('gdv.painel.token') && !/tv=/.test(location.search)), 'Esc sai do modo TV sem logout (credencial mantida, URL sem ?tv)');
  await esperarDados(p); ok(await p.isVisible('#pn-app') && await p.isVisible('#pn-sair'), 'volta ao painel normal com filtros e botão Sair');
  ok(!p.erros.length, 'tvrot: sem erros de console', p.erros);
  await p.context().close();

  /* ================= 4. parâmetros telas / rotacao / tema ================= */
  console.log('4. Parâmetros telas, rotacao, tema');
  p = await abrir({ nome: 'tvpar', relogio: true, url: WEB + '?tv=1&telas=pce,alertas,xyz&rotacao=5&rotacaoAoVivo=3&tema=claro', ls: sessao(TV) });
  await esperarTV(p);
  const op = await p.evaluate(() => PainelTV.opcoes);
  ok(JSON.stringify(op.telas) === '["pce","alertas"]' && op.rotacaoMs === 10000 && op.aoVivoMs === 10000 && op.tema === 'light', 'telas=pce,alertas (inválida ignorada); rotacao e rotacaoAoVivo mínimas 10 s; tema claro', op);
  ok((await tela(p)).tela === 'pce' && await p.locator('#tv-pontos i').count() === 2, 'começa na primeira tela da lista');
  await p.evaluate(() => PainelTV.ir(0));                                               // reinicia a contagem da rotação
  await avanca(p, 9000); ok((await tela(p)).tela === 'pce', 'rotacao=5 vira 10 s: ainda na 1ª tela aos 9 s');
  await avanca(p, 1500); ok((await tela(p)).tela === 'alertas', 'aos 10 s troca para a 2ª');
  await avanca(p, 10000); ok((await tela(p)).tela === 'pce', 'e volta para a 1ª');
  const fundoClaro = await p.evaluate(() => getComputedStyle(document.getElementById('tv-raiz')).backgroundColor);
  ok(lum(rgb(fundoClaro)) > 200, 'tema=claro: fundo claro', fundoClaro);
  ok(sat(rgb(await p.$eval('.tv-mapa', e => getComputedStyle(e).backgroundColor))) < 20, 'mapa da TV (claro): fundo neutro');
  await checarLayout(p, 'claro pce'); await p.screenshot({ path: amb.saida('tv_claro_pce.png') });
  await p.context().close();

  /* ================= 5. botão "Modo TV" lembrado após recarregar ================= */
  console.log('5. Botão "Modo TV"');
  p = await abrir({ nome: 'tvbtn', viewport: { width: 1920, height: 1080 }, ls: sessao(TV) });
  await esperarDados(p);
  ok(await p.isVisible('#pn-tv'), 'botão "Modo TV" no topo (tela ≥ 900 px)');
  await p.click('#pn-tv'); await esperarTV(p);
  ok(await p.evaluate(() => document.body.classList.contains('tv') && localStorage.getItem('gdv.painel.tv') === '1'), 'botão liga o modo TV e lembra no aparelho');
  await p.reload(); await esperarTV(p);
  ok(await p.evaluate(() => document.body.classList.contains('tv') && PainelTV.ativo && !/tv=/.test(location.search)), 'recarregar (sem ?tv) volta sozinho ao modo TV');
  await p.mouse.move(500, 500); await p.click('#tv-sair'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !document.body.classList.contains('tv') && !localStorage.getItem('gdv.painel.tv') && !!localStorage.getItem('gdv.painel.token')), 'botão "Sair do modo TV" volta ao painel sem logout');
  await p.goto(WEB + '?tv=1'); await esperarTV(p); await p.goto(WEB + '?tv=0'); await esperarDados(p);
  ok(await p.evaluate(() => !document.body.classList.contains('tv') && !localStorage.getItem('gdv.painel.tv')), '?tv=0 desliga e esquece o modo TV');
  ok(!p.erros.length, 'tvbtn: sem erros de console', p.erros);
  await p.context().close();

  /* ================= 6. sem conexão: faixa âmbar, dados mantidos, sem login ================= */
  console.log('6. Sem conexão');
  p = await abrir({ nome: 'tvoff', relogio: true, url: WEB + '?tv=1&rotacao=300&rotacaoAoVivo=300', ls: sessao(TV) });
  await esperarTV(p);
  const v0 = await kpiTV(p, 'veiculos'), ult = await p.evaluate(() => Painel.estado().ultimaCarga);
  p.cortado = true; await p.route(amb.API + '/**', rt => rt.abort('internetdisconnected'));
  await avanca(p, 61000);
  ok(await ate(p, () => Painel.estado().falhas >= 1), 'falha de rede registrada');
  const e1 = await p.evaluate(() => Painel.estado().proxima - Date.now());              // relógio da página (falso), não o do Node
  ok(e1 <= 15500 && e1 > 10000, '1ª nova tentativa em ~15 s', Math.round(e1 / 1000) + ' s');
  ok(await p.isHidden('#tv-faixa'), 'menos de 3 min sem atualizar: ainda sem a faixa');
  for (let k = 0; k < 3; k++) { const pr = await p.evaluate(() => Painel.estado().proxima - Date.now()); await avanca(p, pr + 100); await ate(p, n => Painel.estado().falhas >= n, k + 2); }
  const e2 = await p.evaluate(() => ({ f: Painel.estado().falhas, d: Painel.estado().proxima - Date.now() }));
  ok(e2.f >= 4 && e2.d > 100000 && e2.d <= 120500, 'espera crescente (15 s → 30 s → 1 min → 2 min)', e2);
  await avanca(p, 30000); await avanca(p, 1200);                                           // > 3 min desde a última carga boa
  ok(await p.isVisible('#tv-faixa') && /^!?Sem conexão — exibindo dados de \d{2}:\d{2}$/.test((await p.textContent('#tv-faixa')).trim()), 'faixa âmbar "Sem conexão — exibindo dados de HH:MM" após 3 min', (await p.textContent('#tv-faixa')).trim());
  ok((await p.textContent('#tv-faixa')).includes(hmsM(ult)), 'faixa mostra a hora da última atualização bem-sucedida');
  ok(await kpiTV(p, 'veiculos') === v0 && await p.locator('.tv-mapa .tv-pin').count() === 3, 'dados mantidos na tela');
  ok(await p.isHidden('#pn-login'), 'falha de rede não mostra a tela de login');
  await esperaReal(500); await checarLayout(p, 'com a faixa de sem conexão'); await p.screenshot({ path: amb.saida('tv_sem_conexao.png') });
  // muito tempo sem rede: espera máxima 5 min
  for (let k = 0; k < 3; k++) { const pr = await p.evaluate(() => Painel.estado().proxima - Date.now()); await avanca(p, pr + 100); await ate(p, n => Painel.estado().falhas >= n, e2.f + k + 1); }
  const e3 = await p.evaluate(() => Painel.estado().proxima - Date.now());
  ok(e3 <= 300500 && e3 > 240000, 'espera crescente limitada a 5 min', Math.round(e3 / 1000) + ' s');
  // 6 h sem rede: não recarrega a página (não troca os dados por uma página vazia)
  await p.evaluate(() => { window.__marca = 1; });
  await avanca(p, 6 * 3600e3); await avanca(p, 61000); await esperaReal(800);
  ok(await p.evaluate(() => window.__marca === 1), 'sem conexão: não recarrega aos 6 h');
  // achado: sem conexão a situação não congela — a BR-230 (último sinal há 10 min na carga) passa a "sem sinal" e a duração continua contando
  await p.evaluate(() => PainelTV.ir('aovivo')); await esperaReal(300);
  const sitOff = await p.evaluate(() => { const t = Painel.todos.turnosTodos.find(x => x.id === 'tD');
    return { sit: t.situacao, durH: +(t.duracaoMin / 60).toFixed(1), pinos: [...document.querySelectorAll('.tv-mapa .tv-pin')].map(e => e.className.replace('tv-pin ', '')).sort(), lista: document.querySelector('.tv-lista').textContent.replace(/\s+/g, ' ') }; });
  ok(sitOff.sit === 'semsinal' && sitOff.durH > 6 && JSON.stringify(sitOff.pinos) === '["longa","semsinal","semsinal"]' && /BR-230 Humaitá/.test(sitOff.lista) && /SEM SINAL/.test(sitOff.lista.split('BR-230 Humaitá')[1] || ''),
    'sem conexão há 6 h: situação e duração recalculadas com o relógio (BR-230 vira "sem sinal")', sitOff);
  // rede volta
  p.cortado = false; await p.unroute(amb.API + '/**');
  const pr = await p.evaluate(() => Painel.estado().proxima - Date.now()); await avanca(p, pr + 100);
  ok(await ate(p, () => Painel.estado().falhas === 0), 'rede volta: atualiza sozinho');
  await avanca(p, 1200);
  ok(await p.isHidden('#tv-faixa') && /Atualizado às/.test(await p.textContent('#tv-atual-txt')), 'faixa some com a rede de volta');
  ok(!p.erros.length, 'tvoff: sem erros de console além dos cortes de rede do teste', p.erros);
  await p.context().close();

  /* ================= 6b. requisição travada (servidor não responde) ================= */
  console.log('6b. Requisição travada');
  p = await abrir({ nome: 'tvtrava', relogio: true, url: WEB + '?tv=1&rotacao=300&rotacaoAoVivo=300', ls: sessao(TV) });
  await esperarTV(p);
  p.cortado = true; const pendentes = []; await p.route(amb.API + '/**', rt => { pendentes.push(rt); });   // nunca responde
  await avanca(p, 61000);
  ok(await ate(p, () => Painel.estado().carregando), 'atualização pendurada (servidor não responde)');
  await avanca(p, 91000);
  ok(await ate(p, () => !Painel.estado().carregando && Painel.estado().falhas >= 1), 'após 90 s a requisição é abortada e conta como falha de rede', await p.evaluate(() => Painel.estado()));
  const prT = await p.evaluate(() => Painel.estado().proxima - Date.now());
  ok(prT > 0 && prT <= 15500, 'e segue a espera crescente (nova tentativa em ~15 s)', Math.round(prT / 1000) + ' s');
  await p.unroute(amb.API + '/**'); pendentes.forEach(rt => rt.abort().catch(() => {})); p.cortado = false;
  await avanca(p, prT + 100);
  ok(await ate(p, () => Painel.estado().falhas === 0 && !Painel.estado().carregando), 'servidor responde de novo: atualiza');
  ok(!p.erros.length, 'tvtrava: sem erros de console', p.erros);
  await p.context().close();

  /* ================= 7. recarga a cada 6 h ================= */
  console.log('7. Recarga a cada 6 h');
  // janela menor que a tela (fora da tela cheia): a dica "Clique para tela cheia" aparece
  p = await abrir({ nome: 'tv6h', relogio: true, viewport: { width: 1600, height: 900 }, screen: { width: 1920, height: 1080 }, url: WEB + '?tv=1&rotacao=300&rotacaoAoVivo=300', ls: sessao(TV) });
  await esperarTV(p);
  ok(await p.isVisible('#tv-dica') && !(await p.getAttribute('#tv-dica', 'class')).includes('fixa'), 'fora da tela cheia: dica "Clique para tela cheia" na abertura');
  await avanca(p, 16000); ok(await p.isHidden('#tv-dica'), 'na abertura a dica some em 15 s');
  await p.evaluate(() => { window.__marca = 1; });
  await avanca(p, 3 * 3600e3); await avanca(p, 61000);
  ok(await p.evaluate(() => window.__marca === 1), 'antes de 6 h: não recarrega');
  await p.evaluate(() => { window.__c0 = Painel.estado().ultimaCarga; });
  await avanca(p, 3 * 3600e3);                                                        // passou de 6 h; uma carga com sucesso agora
  await ate(p, () => Painel.estado().ultimaCarga > window.__c0);
  const nav = p.waitForEvent('framenavigated', { timeout: 15000 }).catch(() => null);
  await avanca(p, 61000);
  await nav; await p.waitForLoadState('load').catch(() => {});
  ok(await p.evaluate(() => window.__marca === undefined).catch(() => false), 'aos 6 h (com conexão): recarrega a página inteira');
  await esperarTV(p); ok(await p.evaluate(() => PainelTV.ativo), 'depois da recarga continua no modo TV');
  // achado: a recarga tira da tela cheia e ninguém está na sala → a dica fica fixa até alguém clicar
  ok(await p.isVisible('#tv-dica') && (await p.getAttribute('#tv-dica', 'class')).includes('fixa') && /voltar à tela cheia/.test(await p.textContent('#tv-dica')), 'depois da recarga automática: dica fixa para voltar à tela cheia', await p.textContent('#tv-dica'));
  await avanca(p, 60000); ok(await p.isVisible('#tv-dica'), 'a dica fixa não some sozinha (60 s depois continua)');
  await p.mouse.click(800, 500); await p.waitForTimeout(200); ok(await p.isHidden('#tv-dica'), 'um clique na tela tira a dica (e pede a tela cheia)');
  ok(!p.erros.length, 'tv6h: sem erros de console', p.erros);
  await p.context().close();

  /* ================= 8. credencial revogada → "Sessão encerrada" ================= */
  console.log('8. Credencial revogada');
  const TVR = await credencial('TV Revogar');
  p = await abrir({ nome: 'tvrev', relogio: true, url: WEB + '?tv=1&rotacao=300&rotacaoAoVivo=300', ls: sessao(TVR) });
  await esperarTV(p);
  ok(await get('/__revogar?nome=' + encodeURIComponent('TV Revogar')) >= 1, 'revogada no servidor (menu GDV revoga pelo nome)');
  await avanca(p, 61000);
  ok(await ate(p, () => !document.getElementById('pn-login').hidden), 'próxima atualização: servidor recusa a credencial');
  ok((await p.textContent('#pn-login-tit')).trim() === 'Sessão encerrada' && /Gere um novo código de administrador e digite aqui/.test(await p.textContent('#pn-login-txt')) && await p.isVisible('#pn-codigo'),
    'tela cheia "Sessão encerrada. Gere um novo código de administrador e digite aqui" com o campo do código');
  ok(await p.evaluate(() => { const r = document.getElementById('pn-login').getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1 && document.body.classList.contains('tv'); }), 'continua no modo TV, em tela cheia');
  await p.screenshot({ path: amb.saida('tv_sessao_encerrada.png') });
  // achado: recarregar (versão nova / TV reiniciada) não pode virar a tela de primeira configuração
  await p.reload(); await p.waitForSelector('#pn-login:not([hidden])', { timeout: 15000 });
  ok((await p.textContent('#pn-login-tit')).trim() === 'Sessão encerrada' && await p.isVisible('#pn-login-erro') && /Gere um novo código/.test(await p.textContent('#pn-login-txt')),
    'depois de recarregar continua "Sessão encerrada", com o motivo', [(await p.textContent('#pn-login-tit')).trim(), (await p.textContent('#pn-login-erro')).trim()]);
  await p.keyboard.press('ArrowRight'); ok(await p.isVisible('#pn-login'), 'teclas de navegação não atrapalham a digitação do código');
  const nov = await get('/__gerar?nome=' + encodeURIComponent('TV Sala da Gerência') + '&perfil=admin');
  await p.fill('#pn-codigo', nov.codigo); await p.click('#pn-entrar'); await esperarTV(p);
  ok(await p.isHidden('#pn-login') && (await tela(p)).tela === 'aovivo' && await kpiTV(p, 'andamento') === '3', 'novo código: a TV volta sozinha às telas');
  ok(await p.evaluate(() => localStorage.getItem('gdv.painel.encerrada') === null), 'novo código apaga o motivo gravado de "Sessão encerrada"');
  ok(!p.erros.length, 'tvrev: sem erros de console', p.erros);
  await p.context().close();

  p = await abrir({ nome: 'tvnova', url: WEB + '?tv=1' });
  await p.waitForSelector('#pn-login:not([hidden])');
  ok((await p.textContent('#pn-login-tit')).trim() === 'Modo TV — acesso do administrador' && await p.isVisible('#pn-codigo'), 'TV nova (sem credencial): pede o código, sem dizer "Sessão encerrada"', (await p.textContent('#pn-login-tit')).trim());
  const cod1 = await get('/__gerar?nome=' + encodeURIComponent('TV Sala da Gerência') + '&perfil=admin');
  await p.fill('#pn-codigo', cod1.codigo); await p.click('#pn-entrar'); await esperarTV(p);
  ok((await tela(p)).tela === 'aovivo', 'com o código, a TV entra direto nas telas');
  ok(!p.erros.length, 'tvnova: sem erros de console', p.erros);
  await p.context().close();

  /* ================= 9. celular ================= */
  console.log('9. Celular 390×844');
  const CEL = { viewport: { width: 390, height: 844 }, mobile: true, dsf: 2 };
  p = await abrir({ nome: 'cel-ios', ...CEL, ua: UA_IOS, ls: { ...sessao(TV), 'gdv.painel.aba': 'pce' } });
  await esperarDados(p);
  ok(await p.isVisible('#pn-instalar') && /Adicionar à Tela de Início/.test(await p.textContent('#pn-instalar')), 'iPhone/Safari: dica "Adicionar à Tela de Início" na primeira abertura', (await p.textContent('#pn-instalar')).replace(/\s+/g, ' ').slice(0, 90));
  ok(await p.getAttribute('.pn-aba[data-aba=geral]', 'aria-selected') === 'true', 'celular: abre sempre na Visão geral (mesmo com outra aba lembrada)');
  const ordem = await p.evaluate(() => { const h = [...document.querySelectorAll('#pn-conteudo h2, #pn-conteudo h3')].find(x => /^Barreiras em andamento agora/.test(x.textContent.trim()));
    const m = document.querySelector('#pn-conteudo .pn-mapa'); return { h: h ? h.getBoundingClientRect().top + scrollY : null, m: m ? m.getBoundingClientRect().top + scrollY : null, H: innerHeight }; });
  ok(ordem.h != null && ordem.m != null && ordem.h < ordem.m && ordem.h < ordem.H, '"Barreiras em andamento agora" antes do mapa e visível na 1ª tela', ordem);
  ok(await p.isHidden('#pn-tv'), 'sem botão "Modo TV" no celular');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'sem rolagem horizontal');
  await p.screenshot({ path: amb.saida('painel_celular_final.png'), fullPage: true });
  await p.click('[data-instalar=fechar]'); ok(await p.isHidden('#pn-instalar'), 'dica fecha no ✕');
  await p.reload(); await esperarDados(p); ok(await p.isHidden('#pn-instalar'), 'dica fechada não volta');
  ok(!p.erros.length, 'cel-ios: sem erros de console', p.erros);
  await p.context().close();
  p = await abrir({ nome: 'cel-and', ...CEL, ua: UA_AND, ls: sessao(TV) });
  await esperarDados(p);
  await p.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompt = 1; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  ok(await p.isVisible('[data-instalar=agora]') && /Instalar app/.test(await p.textContent('#pn-instalar')), 'Android/Chrome: botão "Instalar app" (beforeinstallprompt)');
  await p.click('[data-instalar=agora]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => window.__prompt === 1) && await p.isHidden('#pn-instalar'), 'Instalar app abre o diálogo nativo; aceito, a dica some');
  ok(await p.isHidden('#pn-tv') && await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'Android: sem Modo TV e sem rolagem horizontal');
  ok(!p.erros.length, 'cel-and: sem erros de console', p.erros);
  await p.context().close();

  /* ================= 10. mapa sem tiles: fundo neutro (claro e escuro) ================= */
  console.log('10. Mapa sem tiles do OSM');
  for (const esquema of ['light', 'dark']) {
    p = await abrir({ nome: 'mapa-' + esquema, viewport: { width: 1366, height: 900 }, esquema, ls: sessao(TV) });
    await esperarDados(p);
    ok(await ate(p, () => !!document.querySelector('.pn-duo-mapa .pn-mapa-div.pn-sem-tiles')), `${esquema}: tiles falharam → mapa sem tiles`);
    const m = await p.evaluate(() => { const d = document.querySelector('.pn-duo-mapa .pn-mapa-div'); return { fundo: getComputedStyle(d).backgroundColor, paths: d.querySelectorAll('.leaflet-pn-mun-pane path').length,
      linha: (d.querySelector('.leaflet-pn-mun-pane path') || { getAttribute: () => '' }).getAttribute('stroke'), tiles: d.querySelectorAll('img.leaflet-tile').length }; });
    const c = rgb(m.fundo);
    ok(sat(c) < 20 && (esquema === 'light' ? lum(c) > 200 : lum(c) < 70), `${esquema}: fundo neutro ${esquema === 'light' ? 'claro' : 'escuro'} (não roxo)`, m.fundo);
    ok(m.paths === 62 && m.linha, `${esquema}: contornos dos 62 municípios`, m);
    await p.locator('.pn-duo-mapa').screenshot({ path: amb.saida(`tv_mapa_semtiles_${esquema === 'light' ? 'claro' : 'escuro'}.png`) });
    await p.context().close();
  }

  /* ================= 11. muitas barreiras em andamento (várias perto de Manaus) ================= */
  console.log('11. Muitas barreiras em andamento');
  const iniG = Date.now() - 40 * 60e3, PM = P.Manaus;
  const extras = [...Array(9).keys()].map(k => ({ id: 'tG' + k, numeroTF: 'TF-G' + k, data: diaM(iniG), letra: 'A', inicio: hmM(iniG), fim: '', fiscal: 'Fiscal ' + k, local: 'Barreira Estrada ' + ['AM-010', 'AM-070', 'BR-174', 'Ponte Rio Negro', 'Porto da Ceasa', 'Zona Leste', 'Puraquequara', 'Tarumã', 'Iranduba'][k],
    unidade: 'MANAUS', posto: 'Móvel', encerrado: 0, criadoEm: Date.now(), atualizadoEm: Date.now(), latIni: String(PM[0] + (k % 3 - 1) * 0.06), lngIni: String(PM[1] + (Math.floor(k / 3) - 1) * 0.06), precIni: '10', latFim: '', lngFim: '', precFim: '' }));
  const vExtra = extras.map((t, k) => ({ id: t.id + '-v', turnoId: t.id, hora: hmM(Date.now() - 5 * 60e3), placa: 'EXT' + k + 'A00', tipo: 'PA', pessoas: 2, obs: '', excluido: 0, criadoEm: Date.now(), atualizadoEm: Date.now() }));
  ok((await post({ action: 'sync', key: 'segredo', since: 0, turnos: extras, veiculos: vExtra })).ok, '+9 barreiras abertas perto de Manaus');
  for (const [vp, nm] of [[{ width: 1920, height: 1080 }, '1080p'], [{ width: 3840, height: 2160 }, '4K']]) {
    p = await abrir({ nome: 'tvmuitas' + nm, viewport: vp, url: WEB + '?tv=1&rotacao=300&rotacaoAoVivo=300', ls: sessao(TV) });
    await esperarTV(p); await p.waitForFunction(() => document.body.classList.contains('tv-ocioso'), null, { timeout: 8000 }); await p.waitForTimeout(400);
    ok(await kpiTV(p, 'andamento') === '12', `${nm}: 12 barreiras ativas`, await kpiTV(p, 'andamento'));
    const nL = await p.evaluate(() => { const l = document.querySelector('.tv-lista'); const vis = [...l.children].filter(e => !e.hidden && !e.classList.contains('tv-mais')).length; const m = l.querySelector('.tv-mais'); return { vis, mais: m ? +(m.textContent.match(/\+(\d+)/) || [0, 0])[1] : 0, compacta: l.classList.contains('compacta') }; });
    ok(nL.vis + nL.mais === 12 && nL.compacta, `${nm}: lista compacta, ${nL.vis} visíveis + "+${nL.mais}" = 12`, nL);
    const glM = await glifos(); ok(glM.lista != null && glM.lista >= 1.6 * 0.97 && glM.mapa >= 1.6 * 0.97, `${nm}: glifos dos marcadores na lista compacta e no mapa ≥ 1,6vh`, glM);
    ok(await p.locator('.tv-mapa .tv-rotulo').count() === 12 && await p.locator('.tv-mapa .tv-pin').count() === 12, `${nm}: 12 marcadores, cada um com rótulo`);
    // rótulo não cobre marcador de outra barreira
    const cobre = await p.evaluate(() => { const ps = [...document.querySelectorAll('.tv-mapa .tv-pin')].map(e => e.getBoundingClientRect()), out = [];
      document.querySelectorAll('.tv-mapa .tv-rotulo').forEach(r => { const a = r.getBoundingClientRect(); ps.forEach(b => { const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (w > 3 && h > 3) out.push(r.textContent.trim()); }); }); return out; });
    ok(!cobre.length, `${nm}: nenhum rótulo cobre um marcador`, cobre);
    const rr = await p.evaluate(() => { const rs = [...document.querySelectorAll('.tv-mapa .tv-rotulo')].map(e => ({ t: e.textContent.trim(), b: e.getBoundingClientRect() })), out = [];
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i].b, c = rs[j].b; if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) out.push(rs[i].t + ' × ' + rs[j].t); }
      const m = document.querySelector('.tv-mapa').getBoundingClientRect(); rs.forEach(r => { if (r.b.left < m.left || r.b.right > m.right || r.b.top < m.top || r.b.bottom > m.bottom) out.push('fora do mapa: ' + r.t); }); return out; });
    ok(!rr.length, `${nm}: caixas dos rótulos do mapa sem sobreposição e dentro do mapa`, rr);
    await checarLayout(p, nm + ' muitas barreiras'); await checarVivo(p, nm + ' muitas barreiras');
    if (nm === '1080p') await p.screenshot({ path: amb.saida('tv_aovivo_muitas.png') });
    ok(!p.erros.length, `tvmuitas ${nm}: sem erros de console`, p.erros);
    await p.context().close();
  }

  const errs = [...new Set(erros)];
  ok(!errs.length, 'sem erros de console/página/HTTP', errs);
  await b.close();
  console.log(falhas ? 'FALHOU=' + falhas : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('FALHOU=1', e.stack); process.exit(1); });
