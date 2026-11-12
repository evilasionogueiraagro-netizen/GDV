const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Ponto fixo da BVA (Cadastro de BVAs no painel: lat/lng): o turno de BVA fixa aparece no ponto da BVA no mapa do painel, também sem GPS
// (marcado "sem GPS (no ponto da BVA)"), e o painel alerta o turno aberto a mais de 2 km da BVA. As coordenadas do turno continuam as do
// celular. painelBvaSalvar recusa coordenada inválida e aceita apagar o ponto. App do painel real (Chromium) + Code.gs real. Dados fictícios.
const { API } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500))); if (!c) falhas++; };
const linhas = async n => { const rows = await (await fetch(API + '/__aba?nome=' + n)).json(); return rows.slice(1).map(r => Object.fromEntries(rows[0].map((c, i) => [c, r[i]]))); };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);

(async () => {
  const g = await amb.gerente('Gerente Ponto Teste'), F = await U.fiscal('Fulano Ficticio Teste'), F2 = await U.fiscal('Beltrano Ficticio Teste'), F3 = await U.fiscal('Ciclano Ficticio Teste');
  console.log('1) cadastro: coordenadas da BVA');
  let r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { nome: 'BVA - CEASA', municipio: 'Manaus', lat: '-3,1190', lng: '' } });
  ok(!r.ok && /Coordenada inválida/.test(r.erro), 'só a latitude: recusa', r.erro);
  r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { nome: 'BVA - CEASA', municipio: 'Manaus', lat: '-95', lng: '-60' } });
  ok(!r.ok && /Coordenada inválida/.test(r.erro), 'latitude fora de -90…90: recusa', r.erro);
  r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { nome: 'BVA - CEASA', municipio: 'Manaus', lat: '-3,1190', lng: '-60.0217' } });
  const ce = (r.bvas || []).find(b => b.nome === 'BVA - CEASA');
  ok(r.ok && ce && ce.lat === -3.119 && ce.lng === -60.0217, 'BVA - CEASA com ponto (vírgula decimal aceita)', ce);
  const s = await post({ action: 'sync', key: F.token, since: 0 });
  ok((s.bvas || []).some(b => b.nome === 'BVA - CEASA' && b.lat === -3.119), 'sync leva o ponto aos aparelhos');

  // turnos de hoje na CEASA: sem GPS; com GPS a ~11 km; com GPS a ~100 m. Volante (Móvel) fica com o GPS dele.
  const ag = Date.now(), T = (id, n, extra) => ({ id, numeroTF: `TF-0${n}-A-${hoje.slice(0, 4)}`, data: hoje, letra: 'A', inicio: '06:00', fim: '07:00', fiscal: F.nome, local: 'BVA - CEASA',
    unidade: 'BVA - CEASA', posto: 'Fixa', encerrado: 1, criadoEm: ag, atualizadoEm: ag, ...extra });
  // um login por turno (turnos do mesmo login na mesma BVA e dia o painel junta como o mesmo turno em dois aparelhos)
  const r1 = await post({ action: 'sync', key: F.token, since: 0, turnos: [T('tp-sem', 41, {}), T('tp-movel', 44, { posto: 'Móvel', local: 'BR-174 KM 10', unidade: 'MANAUS', latIni: -2.9, lngIni: -60.0 })] });
  const r2 = await post({ action: 'sync', key: F2.token, since: 0, turnos: [T('tp-longe', 42, { fiscal: F2.nome, latIni: -3.02, lngIni: -60.02 })] });
  const r3 = await post({ action: 'sync', key: F3.token, since: 0, turnos: [T('tp-perto', 43, { fiscal: F3.nome, latIni: -3.1195, lngIni: -60.0225 })] });
  ok(r1.ok && r2.ok && r3.ok, 'turnos gravados', [r1.erro, r2.erro, r3.erro]);
  ok((await linhas('Turnos')).find(t => t.id === 'tp-sem').latIni === '', 'o turno sem GPS continua sem coordenada na planilha (o ponto é só do painel)');

  console.log('2) painel: mapa e alertas');
  const b = await amb.lancar(), err = [];
  const cg = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block' });
  await cg.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.painel.token', i.t); localStorage.setItem('gdv.painel.nome', i.n); } }, { t: g.token, n: g.nome });
  const G = await cg.newPage(); G.on('pageerror', x => err.push(x.message));
  await G.goto(amb.PAINEL); await G.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 30000 });
  const T2 = await G.evaluate(() => Object.fromEntries(Painel.dados.turnos.filter(t => /^tp-/.test(t.id)).map(t => [t.id, { lat: t.lat, lon: t.lon, cad: !!t.gpsDoCadastro, d: t.distBvaKm == null ? null : +t.distBvaKm.toFixed(1), latIni: t.latIni }])));
  ok(T2['tp-sem'] && T2['tp-sem'].lat === -3.119 && T2['tp-sem'].lon === -60.0217 && T2['tp-sem'].cad && T2['tp-sem'].latIni == null, 'sem GPS: no ponto da BVA (marcado como do cadastro)', T2['tp-sem']);
  ok(T2['tp-longe'] && T2['tp-longe'].lat === -3.119 && T2['tp-longe'].d > 10 && T2['tp-longe'].d < 12 && !T2['tp-longe'].cad, 'com GPS longe: no ponto da BVA, distância ~11 km', T2['tp-longe']);
  ok(T2['tp-perto'] && T2['tp-perto'].d < 0.2, 'com GPS perto: distância < 200 m', T2['tp-perto']);
  ok(T2['tp-movel'] && T2['tp-movel'].lat === -2.9 && T2['tp-movel'].d === null, 'volante: fica com o GPS do celular', T2['tp-movel']);
  await G.click('.pn-aba[data-aba=barreiras]'); await G.waitForSelector('.pn-alertas-caixa .pn-alerta', { timeout: 15000 });
  const al = (await G.textContent('.pn-alertas-caixa')).replace(/\s+/g, ' ');
  ok(/1 turno\(s\) iniciado\(s\) a mais de 2 km da BVA \(no período\)/.test(al) && /BVA - CEASA \(1[01],\d km/.test(al), 'alerta: turno aberto a mais de 2 km da BVA, com a distância', al.slice(0, 600));
  ok(/\d+ turno\(s\) de BVA fixa sem GPS no ponto da BVA/.test(al) && !/sem coordenada GPS/.test(al), 'alerta informativo do turno sem GPS no ponto da BVA (não conta como "sem coordenada")', al.slice(0, 600));
  await G.screenshot({ path: amb.saida('bva_ponto_painel.png'), fullPage: true });

  console.log('3) painel: campo no Cadastro de BVAs');
  await G.click('#pn-bva-abrir'); await G.waitForSelector('#pn-bva-dlg[open] #pn-bva-tab');
  ok(/BVA - CEASA .*definido/.test((await G.innerText('#pn-bva-tab')).replace(/\s+/g, ' ')), 'lista: coluna "Ponto no mapa"');
  const i = await G.$$eval('#pn-bva-tab tbody tr', tr => tr.findIndex(x => /BVA - JUNDIÁ/.test(x.textContent)));
  await G.click(`[data-bva-ed="${i}"]`); await G.fill('#pn-bva-mun', 'Presidente Figueiredo'); await G.fill('#pn-bva-coord', '-2.05, -60.02'); await G.click('#pn-bva-salvar');
  await G.waitForFunction(() => /BVA - JUNDIÁ[\s\S]*definido/.test(document.querySelector('#pn-bva-tab').innerText), null, { timeout: 15000 }).catch(() => {});
  const lj = (await linhas('BVAs')).find(x => x.nome === 'BVA - JUNDIÁ');
  ok(lj && Number(lj.lat) === -2.05 && Number(lj.lng) === -60.02, 'painel: coordenadas coladas do mapa (lat, lng) gravadas', lj);
  await G.screenshot({ path: amb.saida('bva_ponto_cadastro.png') });
  r = await post({ action: 'painelBvaSalvar', key: g.token, bva: { id: ce.id, municipio: 'Manaus', lat: '', lng: '' } });
  ok(r.ok && (r.bvas || []).find(x => x.nome === 'BVA - CEASA').lat === '', 'apagar o ponto (campos vazios)', r.erro);
  const h = (await linhas('HistoricoDeAlteracoes')).filter(x => x.tabela === 'BVAs');
  ok(h.some(x => /"lat":-3.119/.test(x.depois)), 'histórico registra as coordenadas e quem alterou');
  ok(!err.length, 'sem erros de página', err);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
