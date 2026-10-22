const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Arquivamento anual: a planilha principal fica com o ano atual e o anterior; anos mais antigos vão para "e-GDV – Arquivo AAAA"
// (pasta "GDV - Arquivo anual"). Code.gs real via fakegas (SpreadsheetApp.create/openById, deleteRows e Drive falsos) + painel no navegador.
const { API, PAINEL } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const fn = (nome, ...args) => get('/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args)));
const props = (k, v) => fetch(API + '/__props?set=' + k + (v === undefined ? '' : '&valor=' + encodeURIComponent(v))).then(r => r.json());
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const abaBruta = n => get('/__aba?nome=' + n);
const aba = async n => { const rows = await abaBruta(n); if (!rows) return []; const cab = rows[0]; return rows.slice(1).map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]))); };
const append = (n, row) => fetch(`${API}/__append?aba=${n}&row=${encodeURIComponent(JSON.stringify(row))}`).then(r => r.text());
const linhaDe = async (n, o) => { const cab = (await abaBruta(n))[0]; return cab.map(c => (o[c] === undefined ? '' : o[c])); };
const planilhas = async () => Object.values(await get('/__planilhas'));
const arquivoDe = async ano => (await planilhas()).find(p => p.nome === 'e-GDV – Arquivo ' + ano);
const linhasArq = (p, n) => (p && p.abas[n] ? p.abas[n].slice(1) : []);

(async () => {
  const AG = Date.now(), A = new Date(AG - 4 * 3600e3).getUTCFullYear(), A1 = A - 1, A2 = A - 2, A3 = A - 3;
  const ms = (ano, mmdd, hm = '10:00') => Date.parse(`${ano}-${mmdd}T${hm}:00-04:00`);
  await props('ROTINAS_DESATIVADAS', '1');   // o painel não encerra o turno antigo aberto (testado sem interferência); o menu arquiva mesmo assim
  const gAdm = await get('/__gerar?nome=' + encodeURIComponent('Gerente Arquivo Silva') + '&perfil=admin');
  const ADM = (await post({ action: 'painelAtivar', codigo: gAdm.codigo })).token;
  const FIS = (await U.fiscal('Fiscal Arquivo Souza')).token;
  ok(ADM && FIS, 'credenciais (administrador e fiscal)');

  /* ================= 1. dados em 4 anos ================= */
  console.log(`1. Dados de ${A3} a ${A}`);
  const T = (id, ano, enc = 1, extra = {}) => ({ id, numeroTF: 'TF-' + id, data: `${ano}-03-10`, letra: 'A', inicio: '08:00', fim: enc ? '16:00' : '', fiscal: 'Fiscal Arquivo Souza',
    local: 'Barreira ' + id, unidade: 'MANAUS', posto: 'Fixa', encerrado: enc, criadoEm: ms(ano, '03-10', '08:00'), atualizadoEm: ms(ano, '03-10', '16:00'), ...extra });
  const V = (id, turnoId, ano, extra = {}) => ({ id, turnoId, hora: '09:00', placa: 'ARQ1A' + id.slice(-2), tipo: 'PA', pessoas: 2, obs: '', excluido: 0,
    criadoEm: ms(ano, '03-10', '09:00'), atualizadoEm: ms(ano, '03-10', '09:00'), ...extra });
  const turnos = [T('tA', A), T('tA1', A1), T('tA2', A2), T('tA2b', A2, 1, { data: `${A2}-12-31` }), T('tA2aberto', A2, 0), T('tA3', A3)];
  const veiculos = [V('vA-1', 'tA', A), V('vA1-1', 'tA1', A1), V('vA2-1', 'tA2', A2), V('vA2-2', 'tA2', A2, { excluido: 1 }),
    V('vA2b-1', 'tA2b', A1, { criadoEm: ms(A1, '01-01', '00:30') }),                                   // veículo de turno arquivado vai junto (mesmo de outro ano)
    V('vA2ab-1', 'tA2aberto', A2), V('vA3-1', 'tA3', A3), V('vOrfao-1', 'sem-turno', A2), V('vOrfao-2', 'sem-turno-2', A)];
  const tf = { id: '11111111-2222-4333-8444-555555555555', barreira: 'BVA-CEASA', ano: A2, numero: 7, numeroTxt: '0007/' + A2, data: `${A2}-05-05`, hora: '10:00',
    fiscal: 'Fiscal Arquivo Souza', placa: 'ARQ9Z99', doc: '12345678909', procedimento: 'apreensao', criadoEm: ms(A2, '05-05'), atualizadoEm: ms(A2, '05-05') };
  const lev = { id: 'lev-antigo-1', data: `${A2}-04-04`, hora: '09:00', servidor: 'Fiscal Arquivo Souza', municipio: 'Manaus', doc: '12345678909',
    culturas: '[]', criadoEm: ms(A2, '04-04'), atualizadoEm: ms(A2, '04-04') };
  let r = await post({ action: 'sync', key: FIS, since: 0, turnos, veiculos, tfs: [tf], levantamentos: [lev] });
  ok(r.ok, 'fiscal sincroniza turnos/veículos de 4 anos, um TF e um levantamento antigos', r.erro);
  await fn('aba_', 'Consultas'); await fn('aba_', 'Andamento');
  const consultas = [[ms(A3, '02-02'), 'Fiscal Arquivo Souza', '123***09', '', 'novo'], [ms(A2, '06-06'), 'Fiscal Arquivo Souza', '', 'ARQ9Z99', 'encontrado'],
    [ms(A1, '06-06'), 'Fiscal Arquivo Souza', '', 'ARQ9Z99', 'encontrado'], [AG - 3600e3, 'Fiscal Arquivo Souza', '', 'ARQ9Z99', 'encontrado']];
  for (const c of consultas) await append('Consultas', c);
  const and = (id, ts, estado) => linhaDe('Andamento', { id, usuario: 'Fiscal Arquivo Souza', fiscal: 'Fiscal Arquivo Souza', estado, inicioTs: ts, atualizadoTs: ts, placa: 'ARQ9Z99' });
  await append('Andamento', await and('Fiscal Arquivo Souza|r-a2-fim', ms(A2, '07-07'), 'fim'));
  await append('Andamento', await and('Fiscal Arquivo Souza|r-a2-esquecido', ms(A2, '07-08'), 'preenchendo'));   // sem batimento há anos: finalizado
  await append('Andamento', await and('Fiscal Arquivo Souza|r-a-fim', AG - 3600e3, 'fim'));
  const antes = { TFs: await abaBruta('TFs'), Levantamentos: await abaBruta('Levantamentos'), Pessoas: await abaBruta('Pessoas') };
  const cabTurnos = (await abaBruta('Turnos'))[0], cabVeic = (await abaBruta('Veiculos'))[0];

  /* ================= 2. arquivamento ================= */
  console.log('2. Arquivar anos antigos agora (menu)');
  r = (await fn('arquivarAnosAntigos_', { manual: true })).r;
  ok(r && r.ok && !r.incompleto, 'arquivamento concluído', r);
  ok(r.porAba.Turnos && r.porAba.Turnos[A2] === 2 && r.porAba.Turnos[A3] === 1, `Turnos: 2 de ${A2} e 1 de ${A3}`, r.porAba.Turnos);
  ok(r.porAba.Veiculos && r.porAba.Veiculos[A2] === 4 && r.porAba.Veiculos[A3] === 1, `Veiculos: 4 de ${A2} (incl. excluído, órfão e o do turno de 31/12) e 1 de ${A3}`, r.porAba.Veiculos);
  ok(r.porAba.Consultas && r.porAba.Consultas[A2] === 1 && r.porAba.Consultas[A3] === 1 && r.porAba.Andamento && r.porAba.Andamento[A2] === 2, 'Consultas (1+1) e Andamento (2 finalizados)', [r.porAba.Consultas, r.porAba.Andamento]);
  ok(r.total === 12 && r.arquivos.length === 2 && r.arquivos.every(a => /^https:\/\/docs\.google\.com\/spreadsheets\/d\//.test(a.url)), 'resultado: 12 linhas e links dos 2 arquivos', r.arquivos);
  ok(r.backup && r.backup.ok && /^GDV backup /.test(r.backup.nome), 'backup feito antes de arquivar', r.backup && r.backup.nome);
  const tIds = (await aba('Turnos')).map(t => t.id).sort().join();
  ok(tIds === ['antigo-1', 'tA', 'tA1', 'tA2aberto'].sort().join(), `principal fica com ${A} e ${A1} (e o turno aberto de ${A2})`, tIds);
  const vIds = (await aba('Veiculos')).map(v => v.id).sort().join();
  ok(vIds === ['vA-1', 'vA1-1', 'vA2ab-1', 'vOrfao-2'].sort().join(), 'veículos do turno aberto e dos anos recentes ficam', vIds);
  ok((await aba('Consultas')).length === 2 && (await aba('Andamento')).map(a => a.id).join() === 'Fiscal Arquivo Souza|r-a-fim', 'Consultas e Andamento recentes ficam');
  const arq2 = await arquivoDe(A2), arq3 = await arquivoDe(A3);
  ok(arq2 && arq3 && arq2.pasta === 'GDV - Arquivo anual' && arq3.pasta === 'GDV - Arquivo anual', `"e-GDV – Arquivo ${A2}" e "${A3}" na pasta "GDV - Arquivo anual"`, arq2 && arq2.pasta);
  ok(arq2 && JSON.stringify(arq2.abas.Turnos[0]) === JSON.stringify(cabTurnos) && JSON.stringify(arq2.abas.Veiculos[0]) === JSON.stringify(cabVeic), 'abas do arquivo com o mesmo cabeçalho da principal');
  ok(arq2 && linhasArq(arq2, 'Turnos').map(l => l[0]).sort().join() === 'tA2,tA2b' && linhasArq(arq3, 'Turnos').map(l => l[0]).join() === 'tA3', 'turnos encerrados antigos no arquivo do ano; o aberto não sai');
  ok(arq2 && linhasArq(arq2, 'Veiculos').map(l => l[0]).sort().join() === 'vA2-1,vA2-2,vA2b-1,vOrfao-1', 'veículos no arquivo do ano do turno', linhasArq(arq2, 'Veiculos').map(l => l[0]));
  const tA2arq = arq2 && Object.fromEntries(cabTurnos.map((c, i) => [c, linhasArq(arq2, 'Turnos').find(l => l[0] === 'tA2')[i]]));
  ok(tA2arq && tA2arq.local === 'Barreira tA2' && tA2arq.usuario === 'Fiscal Arquivo Souza' && tA2arq.encerrado === 1, 'linha arquivada igual à da principal', tA2arq && { local: tA2arq.local, usuario: tA2arq.usuario });
  ok(arq2 && linhasArq(arq2, 'Consultas').length === 1 && linhasArq(arq2, 'Andamento').length === 2 && !arq2.abas.TFs && !arq2.abas.Levantamentos, 'Consultas/Andamento arquivados; TFs/Levantamentos não vão para o arquivo');
  ok(JSON.stringify(await abaBruta('TFs')) === JSON.stringify(antes.TFs) && JSON.stringify(await abaBruta('Levantamentos')) === JSON.stringify(antes.Levantamentos) &&
     JSON.stringify(await abaBruta('Pessoas')) === JSON.stringify(antes.Pessoas), 'TFs, Levantamentos e Pessoas intocados');
  let P = await get('/__props');
  const info2 = JSON.parse(P['ARQUIVO_ANUAL_' + A2] || '{}');
  ok(P.PASTA_ARQUIVO_ANUAL && info2.url === arq2.url && !P.ARQUIVO_PROGRESSO && JSON.parse(P.ULTIMO_ARQUIVAMENTO).total === 12, 'propriedades: pasta, arquivo do ano, ULTIMO_ARQUIVAMENTO, sem progresso pendente');
  const drv = await get('/__drive');
  ok(drv.arquivos.some(a => /^GDV backup /.test(a.nome) && a.caminho === 'GDV - Backups'), 'backup na pasta "GDV - Backups"');

  /* ================= 3. idempotência ================= */
  console.log('3. Idempotência e continuação');
  r = (await fn('arquivarAnosAntigos_', { manual: true })).r;
  ok(r.ok && r.nada && r.total === 0, 'rodar de novo: nada a arquivar (sem backup novo)', r);
  ok(linhasArq(await arquivoDe(A2), 'Turnos').length === 2 && linhasArq(await arquivoDe(A2), 'Veiculos').length === 4, 'arquivo sem duplicar');
  // reenvio de um turno já arquivado (aparelho com edição pendente): volta à principal e a próxima execução ATUALIZA a linha no arquivo, sem duplicar
  r = await post({ action: 'sync', key: FIS, since: 0, turnos: [T('tA2', A2, 1, { local: 'Barreira Corrigida', atualizadoEm: ms(A2, '03-11') })], veiculos: [V('vA2-1', 'tA2', A2, { pessoas: 5, atualizadoEm: ms(A2, '03-11') })] });
  ok(r.ok && (await aba('Turnos')).some(t => t.id === 'tA2'), 'reenvio de turno arquivado volta à principal (o sync continua aceitando)');
  r = (await fn('arquivarAnosAntigos_', { manual: true })).r;
  let a2 = await arquivoDe(A2);
  const tA2b = linhasArq(a2, 'Turnos').filter(l => l[0] === 'tA2'), vA2b = linhasArq(a2, 'Veiculos').filter(l => l[0] === 'vA2-1');
  ok(r.ok && r.total === 2 && tA2b.length === 1 && tA2b[0][cabTurnos.indexOf('local')] === 'Barreira Corrigida' && vA2b.length === 1 && vA2b[0][cabVeic.indexOf('pessoas')] === 5,
    'linha já arquivada é atualizada (sem duplicar) e sai da principal', { total: r.total, n: tA2b.length });
  ok(!(await aba('Turnos')).some(t => t.id === 'tA2') && !(await aba('Veiculos')).some(v => v.id === 'vA2-1'), 'principal sem o reenvio');
  // execução interrompida: lote de 2 linhas e tempo 0 → guarda o progresso; a seguinte continua sem novo backup
  for (let i = 0; i < 5; i++) await append('Consultas', [ms(A2, '08-0' + (i + 1)), 'Fiscal Arquivo Souza', '', 'LOT' + i, 'novo']);
  r = (await fn('arquivarAnosAntigos_', { manual: true, lote: 2, tempoMs: 0 })).r;
  P = await get('/__props');
  ok(r.ok && r.incompleto && r.backup && r.backup.ok && JSON.parse(P.ARQUIVO_PROGRESSO || '{}').aba, 'tempo esgotado: guarda ARQUIVO_PROGRESSO (backup só no começo)', P.ARQUIVO_PROGRESSO);
  let n = 1, ultimo = r, viuConsultas = false;
  while (ultimo.incompleto && n++ < 15) {
    ultimo = (await fn('arquivarAnosAntigos_', { manual: true, lote: 2, tempoMs: 0 })).r;
    const pr = JSON.parse((await get('/__props')).ARQUIVO_PROGRESSO || '{}');
    if (pr.aba === 'Consultas' && pr.porAba && pr.porAba.Consultas) viuConsultas = true;
    if (ultimo.backup) break;
  }
  P = await get('/__props');
  ok(viuConsultas, 'parou no meio da aba Consultas (lote de 2) e continuou dela');
  ok(ultimo.ok && !ultimo.incompleto && !ultimo.backup && ultimo.porAba.Consultas[A2] === 5 && !P.ARQUIVO_PROGRESSO && n > 3, 'continuação até o fim (sem novo backup), 5 consultas no total', { n, porAba: ultimo.porAba });
  a2 = await arquivoDe(A2);
  const cons = linhasArq(a2, 'Consultas').map(l => l.join('|'));
  ok(cons.length === 6 && new Set(cons).size === 6 && (await aba('Consultas')).length === 2, 'Consultas: 6 no arquivo, sem duplicar; 2 na principal');
  // gatilho com as rotinas desativadas não faz nada
  r = (await fn('arquivarAnosAntigos')).r;
  ok(r && r.desativado, 'gatilho com rotinas desativadas não age');

  /* ================= 4. sync e painel depois ================= */
  console.log('4. Sync e painel depois do arquivamento');
  r = await post({ action: 'sync', key: FIS, since: 0, turnos: [], veiculos: [V('vA-2', 'tA', A)] });
  ok(r.ok && r.turnos.map(t => t.id).sort().join() === 'tA,tA1,tA2aberto' && r.veiculos.some(v => v.id === 'vA-2'), 'sync continua funcionando (devolve só o que está na principal)', r.turnos && r.turnos.map(t => t.id));
  let d = await post({ action: 'painelDados', key: ADM, de: `${A2}-06-01`, ate: `${A1}-05-31` });
  ok(d.ok && typeof d.avisoArquivo === 'string' && d.avisoArquivo.includes(`Dados de veículos e turnos de ${A2} estão no arquivo anual: `) && d.avisoArquivo.includes(arq2.url),
    'painelDados com período antes de 1º/jan do ano anterior: avisoArquivo com o link', d.avisoArquivo || d.erro);
  ok(Array.isArray(d.arquivosAnuais) && d.arquivosAnuais.length === 1 && d.arquivosAnuais[0].ano === A2, 'arquivosAnuais [{ano, url}]', d.arquivosAnuais);
  ok(d.turnos.some(t => t.id === 'tA2aberto') && d.turnos.some(t => t.id === 'tA1') && !d.turnos.some(t => t.id === 'tA2b'), 'devolve o que houver na principal');
  d = await post({ action: 'painelDados', key: ADM, de: `${A1}-01-01`, ate: `${A1}-12-31` });
  ok(d.ok && !d.avisoArquivo && d.turnos.some(t => t.id === 'tA1'), `período em ${A1}: sem aviso`);
  d = await post({ action: 'painelDados', key: ADM });
  ok(d.ok && !d.avisoArquivo && d.rotinas && d.rotinas.ultimoArquivamento > AG, 'padrão (30 dias): sem aviso; rotinas.ultimoArquivamento', d.rotinas);
  const rel = (await fn('dadosPainel_', 'Relatório mensal', { de: `${A1}-01-01`, ate: `${A1}-01-31` })).r;
  ok(rel && rel.ok, 'relatório mensal (dadosPainel_) continua funcionando');

  // painel no navegador: faixa discreta com o link
  const b = await amb.lancar();
  const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR' });
  await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) }));
  await c.route('https://nominatim.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await c.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API);
    Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } },
    { 'gdv.painel.token': ADM, 'gdv.painel.nome': 'Gerente Arquivo Silva', 'gdv.painel.filtro': JSON.stringify({ preset: 'custom', de: `${A2}-06-01`, ate: `${A1}-05-31` }) });
  const erros = [];
  const p = await c.newPage();
  p.on('pageerror', e => erros.push('pageerror: ' + e.message));
  await p.goto(PAINEL);
  await p.waitForSelector('#pn-arquivo:not([hidden])', { timeout: 20000 });
  const faixa = await p.textContent('#pn-arquivo'), link = await p.getAttribute('#pn-arquivo a', 'href');
  ok(faixa.includes(`Dados de veículos e turnos de ${A2} estão no arquivo anual`) && link === arq2.url, 'painel mostra a faixa do arquivo anual com o link', faixa.slice(0, 120));
  const rod = await p.textContent('.pn-rodape');
  ok(/Último arquivamento: \d\d\/\d\d \d\d:\d\d/.test(rod), 'rodapé: "Último arquivamento"', rod.slice(-90));
  await p.screenshot({ path: amb.saida('arquivo_painel.png') });
  await p.evaluate(() => { document.querySelector('[data-preset="30d"]').click(); });
  await p.waitForFunction(() => document.querySelector('#pn-arquivo').hidden, null, { timeout: 20000 });
  ok(true, 'período de 30 dias: a faixa some');
  ok(!erros.length, 'sem erros no painel', erros);
  await b.close();

  /* ================= 5. gatilho ================= */
  console.log('5. Ativar rotinas automáticas');
  await fn('ativarRotinasAutomaticas_'); await fn('ativarRotinasAutomaticas_');
  const g = await get('/__gatilhos'), ga = g.filter(x => x.fn === 'arquivarAnosAntigos');
  ok(ga.length === 1 && ga[0].everyDays === 1 && ga[0].atHour === 4 && ga[0].tz === 'America/Manaus', 'Ativar rotinas cria o gatilho diário (04h) sem duplicar', ga);
  r = (await fn('arquivarAnosAntigos')).r;
  ok(r && r.ok && r.nada, 'gatilho sem nada antigo: verificação leve e sai', r);
  await append('Consultas', [ms(A3, '09-09'), 'Fiscal Arquivo Souza', '', 'GAT1', 'novo']);
  r = (await fn('arquivarAnosAntigos')).r;
  ok(r && r.ok && r.porAba.Consultas && r.porAba.Consultas[A3] === 1, 'gatilho arquiva o que sobrou', r && r.porAba);

  console.log(`\nFALHOU=${falhas}`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('  ✗ erro: ' + (e.stack || e)); process.exit(1); });
