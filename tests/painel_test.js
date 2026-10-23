const amb = require('./lib/amb');
// E2E do novo painel gerencial (web/painel/ servido em 8081) contra o Code.gs real (fakegas, API 8082).
// Popula a planilha falsa pela action "sync" (formato do app) e por /__append; confere KPIs calculados à parte.
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
// reincidência é recalculada pelo servidor (CPF/CNPJ e placa válidos): o tf1 é reincidente por causa do tf0 (apreensão antiga, fora do período,
// em outra barreira); os demais TFs do período são de outros documentos e placas
const TFS = [
  TF('tf0', dia(-120), '', 'apreensao', 1, { barreira: 'BVA-ANTIGA', numeroTxt: '001/ANTIGA', local: 'BVA - ANTIGA' }),
  TF('tf1', dia(-2), 'tA', 'apreensao', 1, { reincidente: 1, tfsAnteriores: 2, auto: 1 }),
  TF('tf2', dia(-2), 'tA', 'liberacao', 2, { produtos: JSON.stringify(['ACEROLA - 5 Caixas']), origem: 'Iranduba', doc: '11144477735', placa: 'DEF2E34' }),
  TF('tf3', dia(-1), 'tB', 'rechaco', 4, { fiscal: 'Carlos Lima', local: 'Barreira Tabatinga', origem: 'Benjamin Constant', destino: 'Tabatinga', produtos: JSON.stringify(['CARAMBOLA - 1.200,5 Kg']), doc: '39053344705', placa: 'GHI3F45' }),
  TF('tf4', dia(-1), 'tB', 'liberacao', 5, { fiscal: 'Carlos Lima', cancelado: 1, motivoCancel: 'erro', doc: '86288366757', placa: 'JKL4G56' })
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

(async () => {
  /* ---------- carga da planilha falsa ---------- */
  const r = await post({ action: 'sync', key: await amb.carga(), since: 0, turnos: TURNOS.map(turnoReg), veiculos: veics, tfs: TFS, levantamentos: LEVS, colheitas: COLS });
  ok(r.ok, 'sync de preparação', r.erro);
  // a barreira esquecida aberta (tE, > 12 h) precisa continuar aberta para testar o estado "aberta > 12 h": sem o encerramento automático
  ok((await get('/__fn?nome=desativarRotinasAutomaticas_')).r === 0, 'rotinas automáticas desativadas (encerramento automático fica para o rotinas_test.js)');
  const tsF = iniF + 60e3, f = turnoReg(TF_SEMSINAL);
  const linhaF = ['id', 'numeroTF', 'data', 'letra', 'inicio', 'fim', 'fiscal', 'local', 'unidade', 'posto', 'encerrado', 'criadoEm', 'atualizadoEm', 'srv_ts', 'latIni', 'lngIni', 'precIni', 'latFim', 'lngFim', 'precFim', 'usuario']
    .map(k => k === 'criadoEm' || k === 'atualizadoEm' || k === 'srv_ts' ? tsF : k === 'usuario' ? 'Rita Gomes' : f[k]);
  await fetch(API + '/__append?aba=Turnos&row=' + encodeURIComponent(JSON.stringify(linhaF)));
  const adm = await amb.gerente('Evilasio Admin');   // sessão de gerente pronta (atalho /__usuario)

  const b = await amb.lancar();
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const erros = [];
  async function abrir(opts = {}, init = {}) {
    const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', acceptDownloads: true, ...opts });
    await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await c.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API);
      Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, init);
    const p = await c.newPage(); p.erros = [];
    p.on('pageerror', e => { p.erros.push('pageerror: ' + e.message); erros.push(e.message); });
    p.on('console', m => { if (m.type() === 'error') { p.erros.push(m.text()); erros.push(m.text()); } });
    p.on('response', rs => { if (rs.status() >= 400) { p.erros.push(rs.status() + ' ' + rs.url()); erros.push(rs.status() + ' ' + rs.url()); } });
    p.on('dialog', d => d.accept());
    await p.goto(WEB); return p;
  }
  const esperarDados = p => p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 }).then(() => p.waitForTimeout(400));
  const kpis = async (p, sel = '#pn-conteudo .pn-kpis') => p.$$eval(sel + ' >> nth=0', () => 0).catch(() => 0) && p.locator(sel).first().evaluate(g =>
    Object.fromEntries([...g.querySelectorAll('.pn-kpi')].map(k => [k.querySelector('.pn-kpi-rot').textContent.trim(), k.querySelector('.pn-kpi-val').textContent.trim()])));
  const lerKpis = async (p, sel = '#pn-conteudo .pn-kpis') => p.locator(sel).first().evaluate(g =>
    Object.fromEntries([...g.querySelectorAll('.pn-kpi')].map(k => [k.querySelector('.pn-kpi-rot').textContent.trim(), k.querySelector('.pn-kpi-val').textContent.trim()])));
  void kpis;
  const aba = async (p, id) => { await p.click(`.pn-aba[data-aba=${id}]`); await p.waitForFunction(i => document.querySelector(`.pn-aba[data-aba=${i}]`).getAttribute('aria-selected') === 'true', id); await p.waitForTimeout(500); };
  const semRolagem = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const baixar = async (p, loc) => { const [dl] = await Promise.all([p.waitForEvent('download'), loc.click()]); return { nome: dl.suggestedFilename(), txt: fs.readFileSync(await dl.path(), 'utf8') }; };

  /* ================= 1. login ================= */
  console.log('1. Login');
  let p = await abrir();
  await p.waitForSelector('#pn-login:not([hidden])');
  ok(await p.isHidden('#pn-app'), 'sem credencial: só a tela de login');
  // a tela de entrar com matrícula e senha é do front novo; aqui a sessão entra pronta
  p = await abrir({}, { 'gdv.painel.token': adm.token, 'gdv.painel.nome': 'Evilasio Admin' }); await esperarDados(p);
  ok((await p.textContent('#pn-nome')).trim() === 'Evilasio Admin', 'sessão de gerente abre o painel; nome no topo');
  ok((await p.evaluate(() => localStorage.getItem('gdv.painel.token') || '')).length >= 32, 'credencial guardada em gdv.painel.token');
  const abas = await p.$$eval('.pn-aba', a => a.map(x => x.dataset.aba)); ok(abas.join() === 'geral,barreiras,tf,pce,convenios,relatorios,acessos,publico', 'abas na ordem Visão geral | Barreiras | TF | PCE | Convênios | Relatórios | Servidores | Dashboard público', abas);
  await p.reload(); await esperarDados(p); ok(await p.isVisible('#pn-app'), 'recarregar mantém a sessão');
  ok(/Atualizado às \d{2}:\d{2}/.test(await p.textContent('#pn-status')), 'indicador "Atualizado às HH:MM"', (await p.textContent('#pn-status')).trim());

  /* ================= 2. Visão geral ================= */
  console.log('2. Visão geral (30 dias)');
  const E30 = esperado(dia(-29), HOJE);
  let k = await lerKpis(p);
  ok(k['Barreiras em andamento agora'] === '3', 'barreiras em andamento agora = 3 (inclui a aberta há > 12 h e a sem sinal)', k['Barreiras em andamento agora']);
  ok(Math.abs(nv(k['Horas de barreira']) - E30.horas) <= 1, `horas de barreira ≈ ${E30.horas.toFixed(1)}`, k['Horas de barreira']);
  ok(k['Veículos abordados'] === String(E30.veiculos), `veículos = ${E30.veiculos} (excluído não conta)`, k['Veículos abordados']);
  ok(k['Pessoas impactadas'] === String(E30.pessoas), `pessoas = ${E30.pessoas}`, k['Pessoas impactadas']);
  ok(k['TFs lavrados'] === String(E30.tfs.length), `TFs = ${E30.tfs.length} (cancelado fora)`, k['TFs lavrados']);
  ok(k['Levantamentos PCE'] === String(E30.levs), `levantamentos = ${E30.levs}`, k['Levantamentos PCE']);
  ok(k['Detecções de pragas'] === String(E30.det), `detecções = ${E30.det}`, k['Detecções de pragas']);
  ok(k['Amostras / termos de colheita'] === `${E30.amostras} / ${E30.termos}`, 'amostras / termos', k['Amostras / termos de colheita']);
  const det = await p.$$eval('#pn-conteudo .pn-kpi .pn-kpi-det', x => x.map(e => e.textContent));
  ok(det.some(t => /1 apreensões · 1 rechaços · 1 cancelado/.test(t)), 'detalhe do TF: apreensões, rechaços e cancelados', det[4]);
  ok(det.some(t => /1 aberto\(s\) há mais de 12 h contado\(s\) com 12 h/.test(t)), 'horas de barreira: turno esquecido aberto conta só 12 h (avisado no detalhe)', det[1]);
  const propGeral = (det.find(t => /propriedade/.test(t)) || '').match(/(\d+) propriedade/);
  // CSV: texto que começa com = + - @ não vira fórmula; número continua número
  const csvInj = await p.evaluate(() => Painel.csvTexto([{ chave: 'a', rotulo: 'A' }], [{ a: '=HYPERLINK("http://x";"y")' }, { a: '+cmd|x' }, { a: '@SUM(1)' }, { a: '-2+3' }, { a: -3.5 }, { a: 'Normal' }]));
  ok(csvInj.split('\r\n').slice(1).join('|') === `"'=HYPERLINK(""http://x"";""y"")"|'+cmd|x|'@SUM(1)|'-2+3|-3,5|Normal`, 'CSV neutraliza fórmulas (=, +, -, @) e mantém números', csvInj.split('\r\n').slice(1).join('|'));
  // fuso: hora formatada no horário de Manaus
  ok(await p.evaluate(() => Painel.fmt.hora(Date.parse('2026-10-10T23:30:00-04:00')) === '23:30'), 'fmt.hora no horário de Manaus');
  const alertas = await p.$$eval('.pn-alertas-caixa .pn-alerta', x => x.map(e => ({ n: e.className.replace('pn-alerta ', ''), t: e.querySelector('.pn-alerta-tit').textContent })));
  const tit = alertas.map(a => a.t).join(' | ');
  ok(alertas.some(a => a.n === 'critico' && /Novo foco de Moko da bananeira: Tabatinga/.test(a.t)), 'alerta crítico: novo foco de Moko em Tabatinga');
  ok(alertas.some(a => a.n === 'critico' && /Novo foco de Sigatoka-negra: Coari/.test(a.t)), 'alerta crítico: novo foco (levantamento sem coordenada também conta)');
  ok(!/Vassoura/.test(tit), 'Vassoura-de-bruxa em Manaus não é foco novo (havia no histórico de 365 dias)');
  ok(alertas.some(a => a.n === 'critico' && /Barreira aberta há .*Itacoatiara/.test(a.t)), 'alerta crítico: barreira aberta há mais de 12 h');
  ok(alertas.some(a => a.n === 'serio' && /sem sinal .*Manacapuru/.test(a.t)), 'alerta sério: barreira sem sinal > 30 min');
  ok(alertas.some(a => /TF: 1 lacuna/.test(a.t)), 'alerta de lacuna na numeração de TF (nº 3)');
  ok(alertas.some(a => new RegExp('municípios sem levantamento PCE em ' + HOJE.slice(0, 4)).test(a.t)), 'alerta de cobertura PCE (anual)');
  ok(alertas.some(a => a.n === 'serio' && /reincidente/.test(a.t)), 'alerta: reincidente com nova apreensão');
  const ordem = alertas.map(a => ({ critico: 0, serio: 1, atencao: 2, info: 3 }[a.n])); ok(ordem.every((v, i) => !i || ordem[i - 1] <= v), 'alertas ordenados crítico → sério → atenção');
  const nCrit = alertas.filter(a => a.n === 'critico').length;
  ok((await p.textContent('#pn-aba-geral .pn-aba-n').catch(() => '')) === String(nCrit), `selo da aba = nº de alertas críticos (${nCrit})`);
  // cartões ao vivo: município pelo ponto no polígono
  const vivos = await p.$$eval('.pn-vivo .pn-vivo-item', x => x.map(e => e.textContent.replace(/\s+/g, ' ')));
  ok(vivos.length === 3 && /Aberta há mais de 12 h/.test(vivos[0]), 'cartões ao vivo: 3, pior primeiro', vivos[0] && vivos[0].slice(0, 60));
  ok(vivos.some(v => /Barreira BR-230 Humaitá/.test(v) && /Humaitá/.test(v.replace('Barreira BR-230 Humaitá', '')) && /2\s*veículos/.test(v)), 'cartão Humaitá: município pela coordenada + 2 veículos');
  // mapa
  const mp = '.pn-duo-mapa .pn-mapa';
  ok(await p.locator(mp + ' .leaflet-pn-mun-pane path').count() === 62, 'mapa: contornos dos 62 municípios', await p.locator(mp + ' .leaflet-pn-mun-pane path').count());
  ok(await p.locator(mp + ' .leaflet-marker-pane .pn-pin.ok').count() === 1 && await p.locator(mp + ' .leaflet-marker-pane .pn-pin.longa').count() === 1 && await p.locator(mp + ' .leaflet-marker-pane .pn-pin.semsinal').count() === 1,
    'mapa: marcadores em andamento (verde, > 12 h, sem sinal)');
  await p.locator(mp + ' .leaflet-marker-pane .pn-pin.ok').click(); await p.waitForSelector(mp + ' .leaflet-popup-content');
  const pop = (await p.textContent(mp + ' .leaflet-popup-content')).replace(/\s+/g, ' ');
  ok(/Barreira BR-230 Humaitá/.test(pop) && /Duração até agora/.test(pop) && /Veículos\s*2/.test(pop) && /Último veículo/.test(pop), 'popup da barreira em andamento', pop.slice(0, 140));
  await p.keyboard.press('Escape'); await p.click(mp + ' .leaflet-popup-close-button').catch(() => {});
  ok(/registro\(s\) sem coordenada/.test(await p.textContent(mp + ' .pn-semcoord')), 'mapa: aviso de registros sem coordenada', (await p.textContent(mp + ' .pn-semcoord')).trim());
  // legenda desenha o mesmo marcador do mapa (pinos com glifo para barreiras; levantamentos com outra cor)
  ok(await p.locator(mp + ' .pn-legenda .pn-lg-pino .pn-pin.longa').count() === 1 && await p.locator(mp + ' .pn-legenda .pn-lg-pino .pn-pin.semsinal').count() === 1 && await p.locator(mp + ' .pn-legenda .pn-lg-pino .pn-pin.ok').count() === 1,
    'legenda: pinos de barreira iguais aos do mapa (anel, ?, !)');
  const coresLev = await p.evaluate(m => { const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim().toLowerCase();
    const fills = [...document.querySelectorAll(m + ' .leaflet-overlay-pane path.leaflet-interactive')].map(x => (x.getAttribute('fill') || '').toLowerCase());
    return { praga: fills.filter(f => f === v('--s2')).length, sem: fills.filter(f => f === v('--s1')).length, critico: fills.filter(f => f === v('--critico') || f === v('--bom')).length, realiz: fills.filter(f => f === v('--s7')).length }; }, mp);
  ok(coresLev.praga === 3 && coresLev.sem === 2 && coresLev.critico === 0, 'mapa: levantamentos com as cores dos gráficos do PCE (laranja = praga, azul = sem), sem vermelho/verde de status', coresLev);
  ok(coresLev.realiz >= 3, 'mapa: barreiras realizadas em violeta (fora da rampa azul do coroplético)', coresLev.realiz);
  ok(await p.evaluate(() => !document.querySelector('.pn-duo-mapa .pn-mapa-dica') ? false : /roda do mouse/.test(document.querySelector('.pn-duo-mapa .pn-mapa-dica').textContent)), 'mapa: roda do mouse não dá zoom sem clicar (dica visível)');
  ok(await p.locator(mp + ' .leaflet-heatmap-layer').count() === 0, 'calor desligado por padrão na Visão geral');
  await p.check(mp + ' input[data-camada=calor]'); await p.waitForTimeout(300);
  ok(await p.locator(mp + ' canvas.leaflet-heatmap-layer').count() === 1, 'camada de calor de detecções liga');
  const legCalor = await p.textContent(mp + ' .pn-legenda'); ok(/Detecções/.test(legCalor), 'legenda dinâmica inclui o calor');
  await p.selectOption(mp + ' select[data-f=praga]', 'Moko da bananeira'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => { const m = Object.values(document.querySelectorAll('.pn-duo-mapa canvas.leaflet-heatmap-layer')); return m.length === 1; }), 'filtro de praga no calor');
  // coroplético: seletor de indicador muda legenda
  await p.selectOption(mp + ' select[data-f=indicador]', 'veiculos'); await p.waitForTimeout(200);
  ok(/Veículos abordados/.test(await p.textContent(mp + ' .pn-legenda')), 'coroplético: troca de indicador atualiza a legenda');
  ok(await p.locator(mp + ' .leaflet-pn-mun-pane path[fill-opacity="0.78"]').count() >= 4, 'coroplético pinta municípios com veículos');
  // CSV
  const csv1 = await baixar(p, p.locator('.pn-tab:has(h3), .pn-secao:has-text("Atividade por município") .pn-tab').last().locator('button:has-text("Baixar CSV")'));
  ok(csv1.nome === 'atividade-por-municipio.csv' && csv1.txt.charCodeAt(0) === 0xFEFF && /^﻿Município;Turnos;Veículos/.test(csv1.txt), 'CSV "Atividade por município" (BOM + ;)', csv1.txt.split('\n')[0]);
  ok(/Tabatinga;1;3;/.test(csv1.txt) && /Humaitá;1;2;/.test(csv1.txt), 'CSV com Tabatinga (1 turno, 3 veículos) e Humaitá', csv1.txt.split('\r\n').length - 1 + ' linhas');
  await p.screenshot({ path: amb.saida('painel_geral.png'), fullPage: true });

  /* ================= 3. Barreiras ================= */
  console.log('3. Aba Barreiras');
  await aba(p, 'barreiras');
  k = await lerKpis(p);
  ok(k['Turnos de barreira'] === String(E30.turnos), `turnos = ${E30.turnos}`, k['Turnos de barreira']);
  ok(Math.abs(nv(k['Horas de barreira']) - E30.horas) <= 1, 'horas de barreira', k['Horas de barreira']);
  ok(k['Veículos abordados'] === String(E30.veiculos) && k['Pessoas impactadas'] === String(E30.pessoas), 'veículos e pessoas', [k['Veículos abordados'], k['Pessoas impactadas']]);
  ok(Math.abs(nv(k['Veículos por hora de barreira']) - E30.veiculos / E30.horas) < 0.15, `veículos/h ≈ ${br((E30.veiculos / E30.horas).toFixed(1))}`, k['Veículos por hora de barreira']);
  ok(k['Em andamento agora'] === '3', 'em andamento = 3');
  ok(await p.locator('.pn-kpi:has-text("Em andamento agora")').evaluate(e => e.classList.contains('pn-st-critico')), 'KPI em andamento vermelho (barreira > 12 h)');
  ok(await p.locator('.pn-bar-vivo .pn-vivo-item').count() === 3, 'cartões ao vivo da aba');
  ok(await p.locator('.pn-bar-alertas .pn-alerta.critico').count() >= 1 && await p.locator('.pn-bar-alertas .pn-alerta.serio').count() >= 1, 'alertas do módulo (> 12 h e sem sinal)');
  ok(await p.textContent('#pn-aba-barreiras .pn-aba-n') === '2', 'selo da aba Barreiras = 2 barreiras em alerta');
  ok(await p.locator('#pn-conteudo canvas').count() >= 6, 'gráficos da aba', await p.locator('#pn-conteudo canvas').count());
  const mtz = await p.locator('.pn-matriz').first().evaluate(m => [...m.querySelectorAll('.pn-mtz-cel')].filter(c => c.style.background).length);
  ok(mtz > 0, 'matriz dia-da-semana × hora preenchida', mtz);
  const fluxo = await p.evaluate(() => { const c = Object.values(Chart.instances).find(x => x.canvas.closest('.pn-cartao') && /Fluxo/.test(x.canvas.closest('.pn-cartao').textContent)); return c ? c.data.datasets[0].data : null; });
  const espH = Array(24).fill(0); todosT.filter(t => t.data >= dia(-29)).forEach(t => t.v.filter(v => !v[3]).forEach(v => espH[+v[0].slice(0, 2)]++));
  ok(fluxo && JSON.stringify(fluxo.map(Number)) === JSON.stringify(espH), 'fluxo ao longo do dia: veículos por hora conferem', fluxo && fluxo.join(','));
  const somaDia = await p.evaluate(() => { const c = Object.values(Chart.instances).find(x => /Veículos por dia/.test(x.canvas.closest('.pn-cartao').textContent)); return c ? c.data.datasets.reduce((s, d) => s + d.data.reduce((a, b) => a + b, 0), 0) : null; });
  ok(somaDia === E30.veiculos, 'gráfico "Veículos por dia" soma o mesmo que o KPI de veículos', somaDia);
  ok(await p.evaluate(() => window.__pnBarMapa && !window.__pnBarMapa.map.scrollWheelZoom.enabled()), 'mapa: zoom pela roda do mouse desligado até clicar');
  const csvT = await baixar(p, p.locator('.pn-tab:has(h3:text-is("Turnos")) button:has-text("Baixar CSV")'));
  ok(csvT.nome === 'barreiras-turnos.csv' && csvT.txt.trim().split('\r\n').length - 1 === E30.turnos, `CSV de turnos com ${E30.turnos} linhas`, csvT.txt.trim().split('\r\n').length - 1);
  ok(await p.locator('.pn-bar-mapa .leaflet-marker-pane .pn-pin').count() === 3, 'mapa da aba Barreiras: 3 barreiras em andamento');
  await p.screenshot({ path: amb.saida('painel_barreiras.png'), fullPage: true });

  /* ================= 4. TF ================= */
  console.log('4. Aba TF de Barreira');
  await aba(p, 'tf');
  k = await lerKpis(p);
  const nP = pr => String(E30.tfs.filter(t => t.procedimento === pr).length);
  ok(k['TFs emitidos'] === '3' && k['Liberações'] === nP('liberacao') && k['Apreensões p/ destruição'] === nP('apreensao') && k['Rechaços (retorno à origem)'] === nP('rechaco'), 'TFs por procedimento', k);
  ok(k['Autos de infração'] === '1' && k['Reincidentes'] === '1' && k['Cancelados'] === '1', 'autos, reincidentes, cancelados');
  ok(k['Conflitos de numeração'] === '0' && await p.locator('.pn-kpi:has-text("Conflitos de numeração")').evaluate(e => e.classList.contains('pn-st-atencao')), 'auditoria: 0 conflitos, status atenção (lacuna)');
  const aud = await p.locator('.pn-secao:has(> h2:text-is("Auditoria da numeração")) .pn-tab').first().locator('tbody tr').first().evaluate(tr => [...tr.cells].map(c => c.textContent.trim()));
  ok(aud[0] === 'Verificar' && aud[1] === 'BVA - CEASA' && aud[3] === '4' && aud[6] === '1' && aud[7] === '3', 'tabela de auditoria: barreira, 4 TFs no ano, lacuna nº 3', aud);
  const prodChart = await p.evaluate(() => { const c = Object.values(Chart.instances).find(x => /produtos/i.test(x.canvas.closest('.pn-cartao').textContent) && /apreend|rechaç/i.test(x.canvas.closest('.pn-cartao').textContent)); return c ? c.data.labels : null; });
  ok(prodChart && prodChart.includes('CARAMBOLA'), 'gráfico de produtos apreendidos/rechaçados', prodChart);
  const tabTF = await p.locator('.pn-secao:has(> h2:text-is("Termos de Fiscalização do período")) .pn-tab').first().textContent();
  ok(/\*\*\*\.982\.247-\*\*/.test(tabTF) && !tabTF.includes(CPF), 'tabela de TFs: CPF mascarado');
  const desemp = await p.locator('.pn-secao:has(> h2:text-is("Desempenho por barreira")) tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(c => c.textContent.trim())));
  const ceasa = desemp.filter(r => /CEASA/.test(r[0]));
  ok(ceasa.length === 1 && ceasa[0][0] === 'BVA - CEASA' && ceasa[0][1] === '2' && ceasa[0][3] === '5' && ceasa[0][4] === '2' && ceasa[0][10] !== '—',
    'desempenho por barreira: turnos e TFs da mesma barreira na mesma linha (taxa calculada; "Barreira Porto CEASA" e "CEASA" = BVA - CEASA)', ceasa);
  const csvQ = await baixar(p, p.locator('.pn-secao:has(> h2:text-is("Quantidades por produto")) .pn-tab button:has-text("Baixar CSV")').first());
  ok(/CARAMBOLA/.test(csvQ.txt) && /1210,5|1\.210,5/.test(csvQ.txt), 'CSV de quantidades soma 10 + 1.200,5 Kg de carambola', csvQ.txt.split('\r\n').find(l => /CARAMBOLA/.test(l)));
  await p.screenshot({ path: amb.saida('painel_tf.png'), fullPage: true });

  /* ================= 5. PCE ================= */
  console.log('5. Aba PCE');
  await aba(p, 'pce');
  { const sp = await p.evaluate(() => { const sel = document.querySelector('#pn-conteudo select[data-f=praga]'); const opts = sel ? [...sel.options].map(o => o.value).filter(Boolean) : null;
      const cfg = (CONFIG.PCE && CONFIG.PCE.pragas) || []; const det = new Set(Painel.dados.levantamentos.flatMap(l => l.pragas));
      return { existe: !!sel, cfg: cfg.length, faltam: cfg.filter(x => !opts || !opts.includes(x)), semDeteccao: cfg.filter(x => !det.has(x)).length }; });
    ok(sp.existe && sp.cfg > 0 && sp.semDeteccao > 0 && !sp.faltam.length, 'mapa do PCE: seletor "Praga" lista CONFIG.PCE.pragas mesmo sem levantamento com detecção', sp); }
  k = await lerKpis(p, '.pn-pce-kpis .pn-kpis');
  ok(k['Levantamentos'] === String(E30.levs) && k['Propriedades visitadas'] === String(E30.levs), 'levantamentos e propriedades', [k['Levantamentos'], k['Propriedades visitadas']]);
  ok(propGeral && propGeral[1] === k['Propriedades visitadas'], 'propriedades: mesmo número na Visão geral e no PCE', [propGeral && propGeral[1], k['Propriedades visitadas']]);
  ok(k['Área inspecionada'] === `${br(E30.area)} ha`, `área = ${br(E30.area)} ha`, k['Área inspecionada']);
  ok(k['Culturas inspecionadas'] === String(E30.culturas), 'culturas inspecionadas', k['Culturas inspecionadas']);
  ok(k['Taxa de detecção'] === `${(E30.comPraga / E30.levs * 100).toFixed(1).replace('.', ',').replace(/,0$/, '')}%`, 'taxa de detecção', k['Taxa de detecção']);
  ok(k['Suspeitas'] === String(E30.susp) && E30.susp === 1, 'suspeitas (contam como detecção e aparecem à parte)', k['Suspeitas']);
  ok(k['Levantamentos negativos'] === String(E30.negativos) && E30.negativos >= 2, `levantamentos negativos = ${E30.negativos} (só "não detectada")`, k['Levantamentos negativos']);
  { const cal = await p.evaluate(() => { const ls = Painel.dados.levantamentos, l7 = ls.find(l => l.id === 'l7'), l8 = ls.find(l => l.id === 'l8');
      return { l7: l7 && [l7.detectou, l7.suspeitas, l7.deteccoes, l7.area, l7.culturasUnicas.length, l7.pragas.join()], l8: l8 && [l8.detectou, l8.negativo, l8.culturasLista.filter(c => c.praga).length],
        pontos: ls.filter(l => l.lat != null).reduce((s, l) => s + l.culturasLista.filter(c => c.praga).length, 0) }; });
    ok(JSON.stringify(cal.l7) === '[true,1,1,3,1,"Vassoura-de-bruxa"]' && JSON.stringify(cal.l8) === '[false,true,0]', 'normalização: suspeita = detecção; mesma cultura em 2 pragas conta 1 vez na área; não detectada = negativo (fora do calor)', cal); }
  ok(k['Amostras coletadas'] === String(E30.amostras) && k['Termos de colheita'] === String(E30.termos), 'amostras e termos');
  { const kc = `Cobertura (${HOJE.slice(0, 4)})`; ok(k[kc] === '4 / 62', 'cobertura anual = 4 / 62', k[kc]); }
  const pm = '.pn-pce-mapa';
  ok(await p.locator(pm + ' .leaflet-pn-mun-pane path').count() === 62, 'mapa PCE com os 62 municípios');
  const pontosLev = await p.locator(pm + ' .leaflet-overlay-pane path.leaflet-interactive').count();
  ok(pontosLev >= 3, 'levantamentos com coordenada no mapa (3) ', pontosLev);
  if (!(await p.isChecked(pm + ' input[data-camada=calor]'))) await p.check(pm + ' input[data-camada=calor]');
  await p.waitForTimeout(300);
  ok(await p.locator(pm + ' canvas.leaflet-heatmap-layer').count() === 1, 'mapa de calor de pragas na aba PCE');
  const focos = await p.locator('.pn-secao:has(> h2:text-is("Focos de pragas e doenças")) .pn-tab').first().textContent().catch(() => '');
  ok(/Novo foco/.test(focos) && /Recorrente/.test(focos), 'tabela de focos: novo × recorrente', focos.slice(0, 80));
  const tabLev = await p.locator('.pn-secao:has(> h2:text-is("Levantamentos do período")) .pn-tab').first().textContent();
  ok(!tabLev.includes(CPF) && !/Produtor l6/.test(tabLev), 'levantamentos: documento mascarado e excluído fora');
  await p.screenshot({ path: amb.saida('painel_pce.png'), fullPage: true });

  /* ================= 6. filtros ================= */
  console.log('6. Filtros');
  await aba(p, 'geral');
  await p.click('[data-preset="7d"]'); await p.waitForFunction(() => document.querySelector('[data-preset="7d"]').getAttribute('aria-pressed') === 'true'); await p.waitForTimeout(1500);
  const E7 = esperado(dia(-6), HOJE); k = await lerKpis(p);
  ok(k['Veículos abordados'] === String(E7.veiculos) && k['Levantamentos PCE'] === String(E7.levs), `7 dias: veículos ${E7.veiculos}, levantamentos ${E7.levs}`, [k['Veículos abordados'], k['Levantamentos PCE']]);
  await p.click('[data-preset="30d"]'); await p.waitForTimeout(1500);
  await p.selectOption('#pn-fiscal', 'Carlos Lima'); await p.waitForTimeout(500);
  const EC = esperado(dia(-29), HOJE, t => /Carlos Lima/.test(t.fiscal), l => l.servidor === 'Carlos Lima');
  k = await lerKpis(p); ok(k['Veículos abordados'] === String(EC.veiculos) && k['Barreiras em andamento agora'] === '0', `fiscal Carlos Lima: ${EC.veiculos} veículos, 0 em andamento`, [k['Veículos abordados'], k['Barreiras em andamento agora']]);
  await p.selectOption('#pn-fiscal', 'Maria'); await p.waitForTimeout(500);       // turno antigo-1 é de "Maria"; "Maria Souza" (tA, tD) não pode entrar
  k = await lerKpis(p); ok(k['Barreiras em andamento agora'] === '0' && k['Veículos abordados'] === '0', 'filtro de fiscal por nome exato ("Maria" não traz "Maria Souza")', [k['Barreiras em andamento agora'], k['Veículos abordados']]);
  await p.selectOption('#pn-fiscal', ''); await p.selectOption('#pn-local', 'm:Tabatinga'); await p.waitForTimeout(500);
  k = await lerKpis(p); ok(k['Veículos abordados'] === '3' && k['Levantamentos PCE'] === '1', 'município Tabatinga: 3 veículos, 1 levantamento', [k['Veículos abordados'], k['Levantamentos PCE']]);
  const opsBar = await p.$$eval('#pn-local optgroup[label="Barreiras / locais"] option', os => os.map(o => o.value));
  ok(opsBar.includes('b:BVA - CEASA') && !opsBar.some(v => /Porto (da )?CEASA|^b:CEASA$/i.test(v)), 'filtro: BVA - CEASA uma vez só (sem "Barreira Porto CEASA", "Barreira Porto da CEASA" nem "CEASA")', opsBar);
  await p.selectOption('#pn-local', 'b:BVA - CEASA'); await aba(p, 'pce');
  k = await lerKpis(p, '.pn-pce-kpis .pn-kpis'); ok(k['Levantamentos'] === String(E30.levs), 'filtro de barreira não se aplica ao PCE');
  ok(/não se aplica ao PCE/.test(await p.textContent('#pn-conteudo')), 'aviso de que o filtro de barreira não vale para o PCE');
  await aba(p, 'barreiras');
  // todos os TFs dos dados de teste são da barreira BVA-CEASA: tA (5 veículos, "Barreira Porto CEASA"), antigo-1 ("CEASA", 0) e tB (3, pelos TFs)
  k = await lerKpis(p); ok(k['Veículos abordados'] === '8' && k['Turnos de barreira'] === '3', 'BVA - CEASA: turnos do local e os da barreira do cadastro (pelos TFs do turno)', [k['Veículos abordados'], k['Turnos de barreira']]);
  await p.selectOption('#pn-local', 'b:BVA - CEASA'); await p.waitForTimeout(300);
  await p.reload(); await esperarDados(p);
  ok(await p.inputValue('#pn-local') === 'b:BVA - CEASA' && await p.getAttribute('.pn-aba[data-aba=barreiras]', 'aria-selected') === 'true', 'filtro e aba lembrados após recarregar');
  await p.selectOption('#pn-local', ''); await aba(p, 'geral');
  await p.click('[data-preset="custom"]'); await p.fill('#pn-de', dia(-25)); await p.fill('#pn-ate', dia(-15)); await p.click('#pn-aplicar'); await p.waitForTimeout(1500);
  const EP = esperado(dia(-25), dia(-15)); k = await lerKpis(p);
  ok(k['Veículos abordados'] === String(EP.veiculos) && k['Levantamentos PCE'] === String(EP.levs) && k['Barreiras em andamento agora'] === '3',
    `personalizado ${dia(-25)}..${dia(-15)}: ${EP.veiculos} veículos, ${EP.levs} levantamentos; em andamento continua 3`, k);
  await p.click('[data-preset="30d"]'); await p.waitForTimeout(1500);

  /* ================= 7. atualização automática ================= */
  console.log('7. Atualização automática (60 s)');
  await p.evaluate(() => window.scrollTo(0, 600)); const y0 = await p.evaluate(() => scrollY);
  const v0 = (await lerKpis(p))['Veículos abordados'];
  const novo = await post({ action: 'sync', key: await amb.carga(), since: 0, turnos: [], veiculos: [{ id: 'tD-novo', turnoId: 'tD', hora: hmM(Date.now()), placa: 'NOV1A23', tipo: 'ON', pessoas: 40, obs: '', excluido: 0, criadoEm: Date.now(), atualizadoEm: Date.now() }] });
  ok(novo.ok, 'novo veículo sincronizado por outro aparelho');
  const reqs = []; p.on('request', rq => { if (rq.method() === 'POST' && rq.url().startsWith(amb.API)) reqs.push(rq.postData() || ''); });
  const t0 = Date.now();
  await p.waitForFunction(v => { const k = [...document.querySelectorAll('#pn-conteudo .pn-kpi')].find(e => /Veículos abordados/.test(e.textContent)); return k && k.querySelector('.pn-kpi-val').textContent.trim() !== v; }, v0, { timeout: 80000 }).catch(() => {});
  const v1 = (await lerKpis(p))['Veículos abordados'];
  ok(Number(v1) === Number(v0) + 1, `painel atualizou sozinho em ${Math.round((Date.now() - t0) / 1000)} s (${v0} → ${v1})`);
  ok(Math.abs((await p.evaluate(() => scrollY)) - y0) < 5, 'rolagem mantida após a atualização automática');
  ok(reqs.length >= 1 && reqs.every(r => /"aoVivo":true/.test(r)), 'atualização de minuto em minuto (30 dias) pede só as barreiras ao vivo (aoVivo)', reqs.map(r => r.slice(0, 60)));

  /* ================= 8. celular, escuro ================= */
  console.log('8. Celular 390 px e modo escuro');
  const tok = await p.evaluate(() => localStorage.getItem('gdv.painel.token'));
  const sess = { 'gdv.painel.token': tok, 'gdv.painel.nome': 'Evilasio Admin' };
  const pc = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, sess); await esperarDados(pc);
  for (const id of ['geral', 'barreiras', 'tf', 'pce']) { await aba(pc, id); ok(await semRolagem(pc), `390 px sem rolagem horizontal: ${id}`); }
  const abasCel = await pc.$$eval('.pn-aba', a => a.map(x => { const r = x.getBoundingClientRect(); return r.right <= innerWidth + 0.5 && r.left >= 0; }));
  ok(abasCel.length === 8 && abasCel.every(Boolean), '390 px: as oito abas inteiras na tela (sem aba cortada)', abasCel);
  await aba(pc, 'barreiras'); ok(await pc.evaluate(() => window.__pnBarMapa && !window.__pnBarMapa.map.dragging.enabled()), 'celular: um dedo rola a página (arraste do mapa só com dois dedos)');
  await aba(pc, 'geral'); await pc.screenshot({ path: amb.saida('painel_celular.png'), fullPage: true });
  // gestor com o aparelho em outro fuso (Brasília): "hoje" e horas continuam de Manaus
  const pz = await abrir({ timezoneId: 'America/Sao_Paulo' }, { ...sess, 'gdv.painel.filtro': JSON.stringify({ preset: 'hoje' }) }); await esperarDados(pz);
  const fz = await pz.evaluate(() => ({ de: Painel.filtros.de, ate: Painel.filtros.ate, h: Painel.fmt.hora(Date.parse('2026-10-10T23:30:00-04:00')), dh: Painel.fmt.dataHora(Date.parse('2026-10-10T23:30:00-04:00')) }));
  ok(fz.de === HOJE && fz.ate === HOJE && fz.h === '23:30' && fz.dh === '10/10 23:30', 'aparelho em Brasília: "Hoje" e horários no fuso de Manaus', fz);
  const pe = await abrir({ colorScheme: 'dark' }, sess); await esperarDados(pe);
  const fundo = await pe.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const lum = fundo.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
  ok(lum < 60, 'modo escuro: fundo escuro', fundo);
  await pe.screenshot({ path: amb.saida('painel_escuro.png'), fullPage: true });
  await aba(pe, 'pce'); await pe.screenshot({ path: amb.saida('painel_pce_escuro.png'), fullPage: true });
  const pcl = await abrir({ colorScheme: 'light' }, sess); await esperarDados(pcl); await pcl.screenshot({ path: amb.saida('painel_claro.png'), fullPage: true });

  /* ================= 9. revogação e sair ================= */
  console.log('9. Revogação e sair');
  const adm2 = await amb.gerente('Segundo Admin Teste');   // outro gerente encerra as sessões do primeiro (aparelho perdido)
  for (const se of (await post({ action: 'sessoesListar', key: adm2.token, usuarioId: adm.usuario.id })).sessoes) await post({ action: 'sessaoEncerrar', key: adm2.token, sessaoId: se.id });
  await pcl.click('#pn-atualizar');
  await pcl.waitForSelector('#pn-login:not([hidden])', { timeout: 10000 }).catch(() => {});
  ok(await pcl.isVisible('#pn-login') && /revogada/.test(await pcl.textContent('#pn-login-erro')), 'credencial revogada volta ao login com a mensagem', await pcl.textContent('#pn-login-erro'));
  ok(!(await pcl.evaluate(() => localStorage.getItem('gdv.painel.token'))), 'credencial apagada do aparelho');
  const p2 = await abrir({}, { 'gdv.painel.token': adm2.token, 'gdv.painel.nome': 'Segundo Admin Teste' }); await esperarDados(p2);
  const tok2 = adm2.token;
  await p2.click('#pn-sair'); await p2.waitForSelector('#pn-login:not([hidden])'); await p2.waitForTimeout(800);
  const dSair = await post({ action: 'painelDados', key: tok2 });
  ok(!dSair.ok && /revogada/.test(dSair.erro), 'Sair revoga a credencial no servidor (cópia do token não lê mais)', dSair.erro);
  ok(!(await p2.evaluate(() => localStorage.getItem('gdv.painel.token'))), 'Sair apaga a credencial e volta ao login');

  const errs = [...new Set(erros)];
  ok(!errs.length, 'sem erros de console/página/HTTP', errs);
  await b.close();
  console.log(falhas ? 'FALHOU=' + falhas : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('FALHOU=1', e.stack); process.exit(1); });
