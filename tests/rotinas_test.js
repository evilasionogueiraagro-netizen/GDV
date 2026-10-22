const amb = require('./lib/amb');
// gdv:relogio dia=15 hora=10:00   (relatório mensal = mês anterior; nos dias 1–2 os dados do "mês seguinte" cairiam em hoje/ontem e no painel)
// Rotinas automáticas: encerramento de turno esquecido (> 12 h), gatilhos, backup diário e relatório mensal.
// Code.gs real via fakegas (ScriptApp/MailApp/DriveApp.getFileById/Session falsos) + painel e app do fiscal no navegador.
const { chromium } = require('playwright-core');
const { API, PAINEL: WEB, APP } = amb;
const DIR = amb.SAIDA + '/';
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const fn = (nome, ...args) => get('/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args)));
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const M = ms => new Date(ms - 4 * 3600e3);
const diaM = ms => M(ms).toISOString().slice(0, 10), hmM = ms => M(ms).toISOString().slice(11, 16);
const tsM = (d, hm) => Date.parse(`${d}T${hm}:00-04:00`);
const H = 3600e3;
const aba = async n => { const rows = await get('/__aba?nome=' + n); const cab = rows[0]; return rows.slice(1).map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]))); };
const linhaTurno = async id => (await aba('Turnos')).find(t => t.id === id);
const editar = (aba, col, valor, onde) => fetch(`${API}/__editar?aba=${aba}&col=${col}&valor=${encodeURIComponent(JSON.stringify(valor))}&onde=${encodeURIComponent(onde)}`).then(r => r.text());
const limparCache = () => fetch(API + '/__cache?del=auto_encerrar');
const AUTO = 'Automático (12 h)';

(async () => {
  const AG = Date.now();
  const ADM = (await amb.gerente('Gerente Rotina Silva')).token;
  const FIS = (await amb.usuario('Fiscal Rotina Souza')).token;
  const FIS2 = (await amb.usuario('Fiscal Sinal Lima')).token;
  ok(ADM && FIS && FIS2, 'credenciais (administrador e dois fiscais)');
  // turno com início em "ini" (ms); fim calculado a partir do horário truncado no minuto, como a planilha
  const T = (id, ini, extra = {}) => ({ id, numeroTF: 'TF-' + id, data: diaM(ini), letra: 'A', inicio: hmM(ini), fim: '', fiscal: 'Fiscal Rotina Souza', local: 'Barreira ' + id,
    unidade: 'MANAUS', posto: 'Fixa', encerrado: 0, criadoEm: ini, atualizadoEm: ini, ...extra });
  const V = (id, turnoId, hora, extra = {}) => ({ id, turnoId, hora, placa: 'ROT1A' + id.slice(-2), tipo: 'PA', pessoas: 2, obs: '', excluido: 0, criadoEm: AG, atualizadoEm: AG, ...extra });
  const iniT = t => tsM(t.data, t.inicio);
  const ap = (id, extra = {}) => ({ id, versao: 'gdv-teste', plataforma: 'android', standalone: 1, online: true, pendentes: {}, turnoAtual: '', turnosEncerradosPendentes: [], fimPendentes: {}, origem: 'app', ...extra });

  /* ================= 1. encerramento automático ================= */
  console.log('1. Encerramento automático de turno esquecido');
  const i1 = AG - 13 * H, i2 = AG - 11 * H, i3 = AG - 20 * H, i4 = AG - 14 * H, i8 = AG - 15 * H;
  const t1 = T('a1', i1), t2 = T('a2', i2), t3 = T('a3', i3), t4 = T('a4', i4), t8 = T('a8', i8);
  const t5 = T('a5', 0, { data: diaM(AG - 2 * 864e5), inicio: '20:00' });                     // vira a meia-noite
  const fim4 = hmM(iniT(t4) + 6 * H);
  let r = await post({ action: 'sync', key: FIS, since: 0, turnos: [t1, t2, t3, t4, t5, t8],
    veiculos: [V('v1a', 'a1', hmM(iniT(t1) + H)), V('v1b', 'a1', hmM(iniT(t1) + 5 * H)), V('v2a', 'a2', hmM(iniT(t2) + H)),
      V('v3a', 'a3', hmM(iniT(t3) + 15 * H)), V('v4a', 'a4', hmM(iniT(t4) + 2 * H)),
      V('v5a', 'a5', '23:30'), V('v5b', 'a5', '02:15'), V('v5c', 'a5', '21:00'),
      V('v8a', 'a8', hmM(iniT(t8) + 3 * H)), V('v8b', 'a8', hmM(iniT(t8) + 9 * H), { excluido: 1 })],
    aparelho: ap('aparelho-rotina-0001', { turnosEncerradosPendentes: ['a4'], fimPendentes: { a4: fim4 } }) });
  ok(r.ok, 'fiscal sincroniza 6 turnos abertos (sinal do aparelho com a4 encerrado no celular)', r.erro);
  const t6 = T('a6', AG - 13 * H, { fiscal: 'Fiscal Sinal Lima' });
  r = await post({ action: 'sync', key: FIS2, since: 0, turnos: [t6], veiculos: [V('v6a', 'a6', hmM(iniT(t6) + 2 * H))], aparelho: ap('aparelho-rotina-0002', { turnoAtual: 'a6' }) });
  ok(r.ok, 'outro fiscal: turno a6 aberto no aparelho (turnoAtual)');
  ok(await editar('Aparelhos', 'ultimoSinal', iniT(t6) + 7 * H, 'id:aparelho-rotina-0002') === '1', 'último sinal do aparelho de a6 = início + 7 h');
  const antes = await fn('encerrarTurnosAutomatico');
  const enc = (antes.r && antes.r.encerrados) || [];
  ok(enc.map(e => e.id).sort().join() === 'a1,a3,a4,a5,a6,a8', 'encerra só os turnos com mais de 12 h (a2, com 11 h, continua)', enc.map(e => e.id));
  const L = {}; for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a8']) L[id] = await linhaTurno(id);
  ok(L.a2.encerrado === 0 && !L.a2.fim && !L.a2.encerradoPor, 'a2 (11 h) continua aberto');
  ok(L.a1.encerrado === 1 && L.a1.fim === hmM(iniT(t1) + 5 * H), 'a1: fim = horário do último veículo', L.a1.fim);
  ok(L.a1.encerradoPor === AUTO && L.a1.encerradoEm >= AG && L.a1.atualizadoEm === L.a1.encerradoEm && L.a1.srv_ts === L.a1.encerradoEm,
    'a1: encerradoPor "Automático (12 h)", encerradoEm = atualizadoEm = srv_ts = agora', { por: L.a1.encerradoPor });
  ok(L.a3.fim === hmM(iniT(t3) + 12 * H), 'a3: veículo 15 h depois do início → fim limitado a início + 12 h', [L.a3.fim, hmM(iniT(t3) + 12 * H)]);
  ok(L.a4.fim === fim4, 'a4: fim informado pelo celular (encerrado no aparelho, não enviado) prevalece', [L.a4.fim, fim4]);
  ok(L.a5.fim === '02:15', 'a5: turno que vira a meia-noite (20:00 → veículo 02:15 do dia seguinte)', L.a5.fim);
  ok(L.a6.fim === hmM(iniT(t6) + 7 * H), 'a6: fim = último sinal do aparelho com o turno aberto (mais tarde que o último veículo)', L.a6.fim);
  ok(L.a8.fim === hmM(iniT(t8) + 3 * H), 'a8: veículo excluído não conta', L.a8.fim);
  ok(Object.values(L).filter(t => t.encerrado === 1).every(t => t.usuario && t.encerradoPor === AUTO), 'linhas continuam do fiscal (usuario)');
  // idempotente
  const segunda = await fn('encerrarTurnosAutomatico');
  const L1b = await linhaTurno('a1');
  ok(segunda.r && segunda.r.encerrados.length === 0 && L1b.encerradoEm === L.a1.encerradoEm && L1b.fim === L.a1.fim, 'rodar de novo não muda nada (idempotente)', segunda.r);
  // aparelho envia depois encerrado = 0 (edição local mais nova): não reabre; encerramento do aparelho não troca o fim
  r = await post({ action: 'sync', key: FIS, since: 0, turnos: [T('a1', i1, { atualizadoEm: Date.now() + 1000, unidade: 'MANACAPURU' })], veiculos: [] });
  let x = await linhaTurno('a1');
  ok(x.encerrado === 1 && x.fim === L.a1.fim && x.encerradoPor === AUTO && x.encerradoEm === L.a1.encerradoEm && x.unidade === 'MANACAPURU', 'aparelho com encerrado=0 depois NÃO reabre (demais campos atualizam)', { e: x.encerrado, fim: x.fim, un: x.unidade });
  const dev = (r.turnos || []).find(t => t.id === 'a1');
  ok(dev && dev.encerrado === 1 && dev.encerradoPor === AUTO, 'sync devolve ao aparelho o turno encerrado automaticamente');
  await post({ action: 'sync', key: FIS, since: 0, turnos: [T('a1', i1, { atualizadoEm: Date.now() + 2000, encerrado: 1, fim: '23:59' })], veiculos: [] });
  x = await linhaTurno('a1'); ok(x.fim === L.a1.fim && x.encerradoPor === AUTO, 'encerramento posterior do aparelho não troca o fim automático', x.fim);
  r = await post({ action: 'painelEncerrarTurno', key: ADM, turnoId: 'a3', fim: '12:00' });
  ok(!r.ok && /já está encerrado/.test(r.erro) && /Automático \(12 h\)/.test(r.erro), 'painel: "Encerrar turno" de turno já encerrado automaticamente é recusado', r.erro);

  // dentro do painelDados: no máximo 1 vez a cada 10 min (CacheService)
  await post({ action: 'sync', key: FIS, since: 0, turnos: [T('b1', AG - 13 * H)], veiculos: [] });
  await limparCache();
  r = await post({ action: 'painelDados', key: ADM, aoVivo: true, ids: ['b1'] });
  let b1 = (r.turnos || []).find(t => t.id === 'b1');
  ok(r.ok && b1 && b1.encerrado === 1 && b1.encerradoPor === AUTO, 'painelDados encerra o turno esquecido (sem gatilho ativo)', b1 && { e: b1.encerrado, por: b1.encerradoPor });
  await post({ action: 'sync', key: FIS, since: 0, turnos: [T('b2', AG - 13 * H)], veiculos: [] });
  r = await post({ action: 'painelDados', key: ADM, aoVivo: true, ids: ['b2'] });
  ok((r.turnos || []).find(t => t.id === 'b2').encerrado === 0, 'painelDados de novo antes de 10 min: não roda (cache)');
  await limparCache();
  r = await post({ action: 'painelDados', key: ADM, aoVivo: true, ids: ['b2'] });
  ok((r.turnos || []).find(t => t.id === 'b2').encerrado === 1, 'passados os 10 min (cache expirado): roda de novo');

  /* ================= 2. gatilhos ================= */
  console.log('2. Gatilhos (Ativar / Desativar rotinas automáticas)');
  r = await fn('ativarRotinasAutomaticas_');
  let g = await get('/__gatilhos');
  ok(r.r && r.r.criadas.length === 4 && g.length === 4, 'ativar cria 4 gatilhos', g.map(x => x.fn));
  const porFn = Object.fromEntries(g.map(x => [x.fn, x]));
  ok(porFn.encerrarTurnosAutomatico && porFn.encerrarTurnosAutomatico.everyMinutes === 30, 'encerrarTurnosAutomatico a cada 30 min');
  ok(porFn.backupDiario && porFn.backupDiario.everyDays === 1 && porFn.backupDiario.atHour === 3 && porFn.backupDiario.tz === 'America/Manaus', 'backupDiario todo dia às 03h (Manaus)');
  ok(porFn.relatorioMensal && porFn.relatorioMensal.onMonthDay === 1 && porFn.relatorioMensal.atHour === 7 && porFn.relatorioMensal.tz === 'America/Manaus', 'relatorioMensal dia 1 às 07h (Manaus)');
  ok(porFn.arquivarAnosAntigos && porFn.arquivarAnosAntigos.everyDays === 1 && porFn.arquivarAnosAntigos.atHour === 4 && porFn.arquivarAnosAntigos.tz === 'America/Manaus', 'arquivarAnosAntigos todo dia às 04h (Manaus)');
  r = await fn('ativarRotinasAutomaticas_'); g = await get('/__gatilhos');
  ok(r.r.criadas.length === 0 && g.length === 4, 'ativar de novo não duplica', g.length);
  r = await fn('desativarRotinasAutomaticas_'); g = await get('/__gatilhos');
  let props = await get('/__props');
  ok(r.r === 4 && g.length === 0 && props.ROTINAS_DESATIVADAS === '1', 'desativar remove os 4 gatilhos e marca ROTINAS_DESATIVADAS', { n: r.r, g: g.length });
  await post({ action: 'sync', key: FIS, since: 0, turnos: [T('b3', AG - 13 * H)], veiculos: [] });
  await limparCache();
  r = await fn('encerrarTurnosAutomatico'); await post({ action: 'painelDados', key: ADM, aoVivo: true, ids: ['b3'] });
  ok(r.r.desativado && (await linhaTurno('b3')).encerrado === 0, 'desativadas: nem o gatilho nem o painel encerram turnos');
  r = await fn('ativarRotinasAutomaticas_'); g = await get('/__gatilhos'); props = await get('/__props');
  ok(g.length === 4 && !props.ROTINAS_DESATIVADAS, 'ativar de novo: 4 gatilhos e o encerramento volta');
  await fn('encerrarTurnosAutomatico');
  ok((await linhaTurno('b3')).encerradoPor === AUTO, 'b3 encerrado depois de reativar');

  /* ================= 3. backup diário ================= */
  console.log('3. Backup diário');
  const hoje = (await fn('hojeManaus_')).r;
  r = await fn('backupDiario');
  let dr = await get('/__drive');
  const backups = () => dr.arquivos.filter(a => a.caminho === 'GDV - Backups' && !a.lixeira);
  ok(r.r && r.r.ok && r.r.nome === 'GDV backup ' + hoje, 'backup criado com nome "GDV backup AAAA-MM-DD"', r.r);
  ok(backups().length === 1 && backups()[0].nome === 'GDV backup ' + hoje, 'cópia da planilha na pasta "GDV - Backups"', backups());
  props = await get('/__props');
  ok(JSON.parse(props.ULTIMO_BACKUP || '{}').em === r.r.em && props.PASTA_BACKUPS, 'ULTIMO_BACKUP gravado nas propriedades');
  // 35 backups antigos + 1 arquivo que não é backup
  const diasAntigos = []; for (let i = 1; i <= 35; i++) diasAntigos.push(diaM(AG - i * 864e5));
  for (const d of diasAntigos) await fetch(`${API}/__criarArquivo?pastaProp=PASTA_BACKUPS&nome=${encodeURIComponent('GDV backup ' + d)}`);
  await fetch(`${API}/__criarArquivo?pastaProp=PASTA_BACKUPS&nome=${encodeURIComponent('Leia-me.txt')}`);
  r = await fn('backupDiario'); dr = await get('/__drive');
  const bk = backups().filter(a => a.nome.startsWith('GDV backup ')).map(a => a.nome).sort().reverse();
  ok(r.r.ok && bk.length === 30, 'mantém só 30 backups', { n: bk.length, apagados: r.r.apagados });
  ok(bk[0] === 'GDV backup ' + hoje && bk[29] === 'GDV backup ' + diasAntigos[28] && new Set(bk).size === 30, 'ficam os 30 mais recentes, um por dia (o 2º backup de hoje substitui o 1º)', [bk[0], bk[29]]);
  ok(backups().some(a => a.nome === 'Leia-me.txt'), 'arquivo que não é backup não é apagado');
  ok(dr.arquivos.filter(a => a.caminho === 'GDV - Backups' && a.lixeira).length === 7, 'antigos vão para a lixeira (6 antigos + o 1º backup de hoje)', dr.arquivos.filter(a => a.lixeira).length);
  // falha no Drive: não quebra nada
  const ultimoOk = JSON.parse((await get('/__props')).ULTIMO_BACKUP).em;
  await fetch(API + '/__drivefalha?v=1');
  r = await fn('backupDiario');
  props = await get('/__props');
  ok(r.r && r.r.ok === false && /Drive indisponível/.test(r.r.erro) && JSON.parse(props.ULTIMO_BACKUP).em === ultimoOk && JSON.parse(props.ULTIMO_BACKUP_ERRO).erro, 'falha no Drive: devolve ok:false sem lançar erro, mantém o último backup e registra a falha', r.r);
  r = await post({ action: 'painelDados', key: ADM });
  ok(r.ok && r.rotinas && r.rotinas.ultimoBackup === ultimoOk && r.rotinas.backupFalhou > ultimoOk && !r.rotinas.desativadas, 'painelDados traz rotinas {ultimoBackup, backupFalhou}', r.rotinas);
  await fetch(API + '/__drivefalha?v=0');
  r = await fn('backupDiario');
  r = await post({ action: 'painelDados', key: ADM });
  ok(r.rotinas.ultimoBackup > ultimoOk && !r.rotinas.backupFalhou, 'backup seguinte com sucesso limpa o aviso de falha', r.rotinas);
  const aoVivo = await post({ action: 'painelDados', key: ADM, aoVivo: true, ids: [] });
  ok(aoVivo.ok && !('rotinas' in aoVivo), 'atualização ao vivo não traz rotinas (resposta leve)');

  /* ================= 4. relatório mensal ================= */
  console.log('4. Relatório mensal');
  const per = (await fn('mesAnterior_', hoje)).r;
  const d = n => per.de.slice(0, 8) + String(n).padStart(2, '0');
  ok(per && per.de.endsWith('-01') && per.ate >= d(28) && per.ate <= d(31) && per.ate < hoje, 'período = mês anterior inteiro', per);
  const proxMes = (await fn('somarDias_', per.ate, 1)).r;
  const R = (id, data, inicio, fim, local, extra = {}) => ({ id, numeroTF: 'TF-' + id, data, letra: 'A', inicio, fim, fiscal: 'Fiscal Rotina Souza', local, unidade: 'MANAUS', posto: 'Fixa',
    encerrado: fim ? 1 : 0, criadoEm: AG - 40 * 864e5, atualizadoEm: AG - 40 * 864e5, ...extra });
  await post({ action: 'sync', key: FIS, since: 0, turnos: [
    R('r1', d(2), '06:00', '14:00', 'Rel Barreira X'), R('r2', d(5), '22:00', '04:00', 'Rel Barreira X'),
    R('r3', d(10), '08:00', '', 'Rel Barreira Y'), R('r4', d(12), '07:00', '', 'Rel Barreira Y'), R('r5', proxMes, '07:00', '09:00', 'Rel Barreira X')],
    veiculos: [V('rv1', 'r1', '07:00', { pessoas: 2 }), V('rv2', 'r1', '08:00', { pessoas: 3 }), V('rv3', 'r1', '13:00', { pessoas: 4 }),
      V('rv4', 'r2', '01:00', { pessoas: 5 }), V('rv5', 'r2', '02:00', { pessoas: 9, excluido: 1 }), V('rv6', 'r3', '19:00', { pessoas: 1 }), V('rv7', 'r5', '08:00', { pessoas: 7 })] });
  r = await post({ action: 'painelEncerrarTurno', key: ADM, turnoId: 'r4', fim: '09:00' });
  ok(r.ok, 'r4 encerrado pela gerência (09:00)', r.erro);
  await fn('encerrarTurnosAutomatico');
  ok((await linhaTurno('r3')).fim === '19:00', 'r3 encerrado automaticamente às 19:00 (11 h)');
  const TF = (id, data, proc, numero, extra = {}) => ({ id, barreira: 'BVA-CEASA', ano: +data.slice(0, 4), numero, numeroTxt: String(numero).padStart(3, '0') + '/' + data.slice(0, 4) + '/BVA - CEASA',
    turnoId: 'r1', data, hora: '09:00', fiscal: 'Fiscal Rotina Souza', local: 'Rel Barreira X', placa: 'ABC1D23', doc: '52998224725', nome: 'Fulano', procedimento: proc,
    produtos: JSON.stringify(['CARAMBOLA - 3 Kg']), auto: 0, advertencia: 0, cancelado: 0, criadoEm: AG, atualizadoEm: AG, ...extra });
  await post({ action: 'sync', key: FIS, since: 0, tfs: [TF('rt1', d(2), 'liberacao', 901), TF('rt2', d(3), 'liberacao', 902, { advertencia: 1 }),
    TF('rt3', d(4), 'apreensao', 903, { produtos: JSON.stringify(['BANANA - 10 Kg', 'ACEROLA - 2 Caixas']), auto: 1 }), TF('rt4', d(5), 'rechaco', 904),
    TF('rt5', d(6), 'apreensao', 905, { cancelado: 1, motivoCancel: 'erro' }), TF('rt6', proxMes, 'apreensao', 906)] });
  const cult = (c, praga) => ({ cultura: c, area: '1', praga, coleta: 'Não' });
  const LEV = (id, data, municipio, culturas, extra = {}) => ({ id, data, hora: '09:00', servidor: 'Fiscal Rotina Souza', doc: '52998224725', nome: 'Produtor', municipio,
    culturas: JSON.stringify(culturas), fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: AG, atualizadoEm: AG, ...extra });
  await post({ action: 'sync', key: FIS, since: 0, levantamentos: [LEV('rl1', d(3), 'Manaus', [cult('Banana', 'Moko da bananeira'), cult('Mandioca', '')]),
    LEV('rl2', d(8), 'Coari', [cult('Banana', 'Moko da bananeira')]), LEV('rl3', d(9), 'Manaus', [cult('Cupuaçu', 'Vassoura-de-bruxa')]),
    LEV('rl4', d(9), 'Tefé', [cult('Banana', 'Sigatoka-negra')], { excluido: 1 }), LEV('rl5', proxMes, 'Manaus', [cult('Banana', 'Moko da bananeira')]),
    // formato novo (por praga): suspeita conta como detecção (e à parte); só "não detectada" = levantamento negativo
    LEV('rl6', d(10), 'Manaus', [], { pragas: JSON.stringify([{ praga: 'Moko da bananeira', culturas: [{ cultura: 'Banana', area: '2', resultado: 'suspeita', coleta: 'Sim', fotos: [] },
      { cultura: 'Cacau', area: '1', resultado: 'nao_detectada', coleta: 'Não', fotos: [] }] }, { praga: 'Fusarium R4T', culturas: [{ cultura: 'Banana', area: '2', resultado: 'nao_detectada', coleta: 'Não', fotos: [] }] }]) }),
    LEV('rl7', d(11), 'Tefé', [], { pragas: JSON.stringify([{ praga: 'Sigatoka-negra', culturas: [{ cultura: 'Banana', area: '1', resultado: 'nao_detectada', coleta: 'Não', fotos: [] }] }]) })],
    colheitas: [{ id: 'rc1', unidade: 'REL', ano: +d(1).slice(0, 4), numero: 1, data: d(3), hora: '10:00', servidor: 'x', municipio: 'Manaus', cultura: 'Banana', cancelado: 0, excluido: 0, criadoEm: AG, atualizadoEm: AG },
      { id: 'rc2', unidade: 'REL', ano: +d(1).slice(0, 4), numero: 2, data: d(4), hora: '10:00', servidor: 'x', municipio: 'Manaus', cultura: 'Banana', cancelado: 1, excluido: 0, criadoEm: AG, atualizadoEm: AG }] });

  // destinatários
  r = await fn('destinatariosRelatorio_'); ok(JSON.stringify(r.r) === '["dono@exemplo.gov.br"]', 'padrão: e-mail do dono da planilha', r.r);
  r = await fn('definirEmailsRelatorio_', 'gerente@idam.am.gov.br; chefe@exemplo.com , gerente@idam.am.gov.br');
  ok(JSON.stringify(r.r) === '["gerente@idam.am.gov.br","chefe@exemplo.com"]' && (await get('/__props')).RELATORIO_EMAILS === 'gerente@idam.am.gov.br, chefe@exemplo.com', 'definir e-mails (vírgula/ponto e vírgula, sem repetir)', r.r);
  r = await fn('definirEmailsRelatorio_', 'gerente@idam, outro'); ok(r.erro && /E-mail inválido/.test(r.erro), 'e-mail inválido recusado', r.erro);
  ok((await get('/__props')).RELATORIO_EMAILS === 'gerente@idam.am.gov.br, chefe@exemplo.com', 'recusa não altera os destinatários');

  r = await fn('relatorioMensal');
  const rel = r.r || {}, n = rel.numeros || {};
  ok(rel.ok && JSON.stringify(rel.para) === '["gerente@idam.am.gov.br","chefe@exemplo.com"]', 'relatório enviado aos destinatários configurados', r.erro || rel.para);
  const bx = (n.barreiras || []).find(b => b.barreira === 'Rel Barreira X'), by = (n.barreiras || []).find(b => b.barreira === 'Rel Barreira Y');
  ok(bx && bx.turnos === 2 && Math.round(bx.minutos) === 14 * 60 && bx.veiculos === 4 && bx.pessoas === 14, 'Barreira X: 2 turnos, 14 h (8 h + 6 h passando da meia-noite), 4 veículos, 14 pessoas (excluído fora; turno do mês seguinte fora)', bx);
  ok(by && by.turnos === 2 && Math.round(by.minutos) === 13 * 60 && by.veiculos === 1 && by.pessoas === 1, 'Barreira Y: 2 turnos, 13 h (11 h automático + 2 h gerência), 1 veículo', by);
  ok(n.encerramentos && n.encerramentos.automatico >= 1 && n.encerramentos.gerencia >= 1, 'turnos encerrados automaticamente / pela gerência contados', n.encerramentos);
  ok(n.tfs && n.tfs.total === 4 && n.tfs.liberacao === 2 && n.tfs.apreensao === 1 && n.tfs.rechaco === 1 && n.tfs.cancelados === 1 && n.tfs.autos === 1 && n.tfs.advertencias === 1,
    'TFs por procedimento (cancelado e mês seguinte fora)', n.tfs && { t: n.tfs.total, l: n.tfs.liberacao, a: n.tfs.apreensao, r: n.tfs.rechaco, c: n.tfs.cancelados });
  ok(n.tfs && n.tfs.apreensoes.length === 1 && n.tfs.apreensoes[0].numeroTxt.startsWith('903/') && n.tfs.apreensoes[0].produtos === 'BANANA - 10 Kg; ACEROLA - 2 Caixas', 'lista de apreensões com produtos', n.tfs && n.tfs.apreensoes);
  ok(n.pce && n.pce.levantamentos === 5 && n.pce.municipios === 3 && n.pce.comPraga === 4 && n.pce.negativos === 1 && n.pce.suspeitas === 1 && n.pce.termos === 1 && n.pce.termosCancelados === 1,
    'PCE: 5 levantamentos em 3 municípios, 4 com praga (1 só suspeita), 1 negativo, 1 termo (cancelado à parte)', n.pce);
  ok(n.pce && JSON.stringify(n.pce.pragas) === JSON.stringify([{ praga: 'Moko da bananeira', deteccoes: 3, suspeitas: 1, municipios: ['Coari', 'Manaus'] }, { praga: 'Vassoura-de-bruxa', deteccoes: 1, suspeitas: 0, municipios: ['Manaus'] }]),
    'detecções por praga: detectada + suspeita (suspeita à parte); "não detectada" de Fusarium/Sigatoka não conta; excluído e mês seguinte fora', n.pce && n.pce.pragas);
  const mails = await get('/__emails'), m = mails[mails.length - 1] || {};
  ok(m.to === 'gerente@idam.am.gov.br,chefe@exemplo.com' && m.subject === 'e-GDV – Relatório mensal de ' + per.rotulo && m.name === 'e-GDV', 'e-mail: para, assunto e remetente', { to: m.to, s: m.subject });
  const html = m.htmlBody || '';
  ok(/Rel Barreira X/.test(html) && html.includes('>14,0<') && html.includes('>13,0<') && /Moko da bananeira/.test(html) && /BANANA - 10 Kg/.test(html) && html.includes('https://evilasionogueiraagro-netizen.github.io/GDV/painel/'),
    'HTML com barreiras, horas (14,0 / 13,0), pragas, apreensões e link do painel');
  ok(/levantamentos negativos: <b>1<\/b>/.test(html) && /suspeitas: <b>1<\/b>/.test(html) && /Suspeitas \(incluídas\)/.test(html) && !/Fusarium/.test(html), 'HTML do PCE: negativos, suspeitas e coluna de suspeitas por praga');
  ok(/encerrados automaticamente/.test(html) && /pela gerência/.test(html) && (m.body || '').includes('Turnos:'), 'HTML com encerramentos automáticos/gerência e versão em texto');
  ok(!/52998224725|998\.224/.test(html), 'sem CPF no e-mail');
  require('fs').writeFileSync(DIR + 'relatorio_mensal.html', html);
  r = await fn('definirEmailsRelatorio_', ''); ok(JSON.stringify(r.r) === '["dono@exemplo.gov.br"]' && !(await get('/__props')).RELATORIO_EMAILS, 'em branco: volta ao padrão (dono)');

  /* ================= 5. painel ================= */
  console.log('5. Painel');
  await post({ action: 'sync', key: FIS, since: 0, turnos: [T('c1', AG - 13 * H, { local: 'Barreira Auto Encerrada' })], veiculos: [V('vc1', 'c1', hmM(AG - 10 * H))] });
  await fn('encerrarTurnosAutomatico');
  ok((await linhaTurno('c1')).encerradoPor === AUTO, 'c1 encerrado automaticamente');
  await fn('desativarRotinasAutomaticas_');                                                // para ver o estado "aberta > 12 h" no painel
  await post({ action: 'sync', key: FIS, since: 0, turnos: [T('c2', AG - 12.5 * H, { local: 'Barreira Esquecida' })], veiculos: [] });
  const b = await amb.lancar();
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const erros = [];
  async function abrir(url, ls, opts = {}) {
    const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', ...opts });
    await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await c.route('https://nominatim.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await c.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API);
      Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, ls);
    const p = await c.newPage();
    p.on('pageerror', e => erros.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
    p.on('dialog', d => { erros.push('diálogo do navegador: ' + d.message()); d.accept(); });
    await p.goto(url); return p;
  }
  const sessao = { 'gdv.painel.token': ADM, 'gdv.painel.nome': 'Gerente Rotina Silva' };
  let p = await abrir(WEB, sessao);
  await p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 }); await p.waitForTimeout(800);
  const geral = await p.textContent('#pn-conteudo');
  ok(/Aberta há mais de 12 h/.test(geral) && !/14 h/.test(geral), 'cartão: "Aberta há mais de 12 h" (limiar novo; nada de 14 h)');
  ok(/Barreira aberta há 12 h[^:]*: Barreira Esquecida/.test(geral) || /Barreira aberta há .*Barreira Esquecida/.test(geral), 'alerta crítico da barreira aberta > 12 h');
  ok(await p.evaluate(() => { const t = Painel.todos.turnosTodos.find(x => x.id === 'c2'); return t && t.situacao === 'longa' && t.duracaoContabilMin === 12 * 60; }), 'c2 (12 h 30) = "longa" e conta 12 h nas horas de barreira');
  const rod = await p.textContent('.pn-rodape');
  const ub = (await post({ action: 'painelDados', key: ADM })).rotinas.ultimoBackup;
  const esperadoRod = `Último backup: ${diaM(ub).slice(8, 10)}/${diaM(ub).slice(5, 7)} ${hmM(ub)}`;
  ok(rod.includes(esperadoRod), 'rodapé: "Último backup: dd/mm hh:mm"', rod.slice(-80));
  await p.click('.pn-aba[data-aba=barreiras]'); await p.waitForTimeout(1200);
  const linhaC1 = await p.evaluate(() => [...document.querySelectorAll('#pn-conteudo table tr')].map(tr => tr.textContent).find(t => /Barreira Auto Encerrada/.test(t) && /\d\d:\d\d/.test(t)) || '');
  ok(/\(automático\)/.test(linhaC1) && !/gerência/.test(linhaC1), 'tabela de turnos: fim com "(automático)"', linhaC1.slice(0, 160));
  const legBar = await p.textContent('#pn-conteudo');
  ok(/Aberta > 12 h|mais de 12 h/.test(legBar) && !/14 h/.test(legBar), 'aba Barreiras: textos com 12 h');
  await p.screenshot({ path: DIR + 'rotinas_painel_barreiras.png' });
  await p.context().close();
  // Modo TV: legenda com 12 h
  p = await abrir(WEB + '?tv=1&rotacao=300&rotacaoAoVivo=300', sessao, { viewport: { width: 1920, height: 1080 } });
  await p.waitForSelector('#tv-palco .tv-kpi', { timeout: 20000 }); await p.waitForTimeout(1500);
  const tv = await p.textContent('#tv-palco');
  ok(/Aberta > 12 h/.test(tv) && !/14 h/.test(tv), 'Modo TV: "Aberta > 12 h"', (tv.match(/Aberta[^()]*\(\d+\)/) || [])[0]);
  await p.screenshot({ path: DIR + 'rotinas_tv.png' });
  await p.context().close();
  await fn('ativarRotinasAutomaticas_');

  /* ================= 6. app do fiscal ================= */
  console.log('6. App do fiscal');
  const lsApp = { 'gdv.key': FIS, 'gdv.nome': 'Fiscal Rotina Souza', 'gdv.semInstalar': '1' };
  p = await abrir(APP, lsApp, { viewport: { width: 400, height: 820 }, permissions: ['geolocation'], geolocation: { latitude: -3.119, longitude: -60.021, accuracy: 10 } });
  const sync = () => p.evaluate(async () => { for (let i = 0; i < 40 && Sync.estado().tipo === 'sync'; i++) await new Promise(r => setTimeout(r, 150)); await Sync.sincronizar(); return Sync.estado(); });
  await p.waitForSelector('.modulo');
  await p.waitForTimeout(800);                                                   // primeira sincronização redesenha a tela
  await p.click('nav [data-v=modulos]').catch(() => {}); await p.waitForSelector('.modulo[data-v=home]'); await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno');
  await p.fill('#nTF', '77'); await p.selectOption('#nPosto', 'Fixa'); await p.click('#fTurno button[type=submit]'); await p.waitForSelector('.contador');
  const idApp = await p.evaluate(() => Store.meta('turnoAtual'));
  await sync();
  ok(!!(await linhaTurno(idApp)), 'turno do aparelho chegou à planilha');
  // simula um turno esquecido: na planilha, início há 13 h
  const iniApp = AG - 13 * H;
  await editar('Turnos', 'data', diaM(iniApp), 'id:' + idApp); await editar('Turnos', 'inicio', hmM(iniApp), 'id:' + idApp);
  r = await fn('encerrarTurnosAutomatico');
  const fimApp = hmM(tsM(diaM(iniApp), hmM(iniApp)) + 12 * H);
  ok(r.r && r.r.encerrados.some(e => e.id === idApp && e.fim === fimApp), 'turno do aparelho encerrado automaticamente (fim limitado a início + 12 h: o aparelho seguia mandando sinal)', r.r && r.r.encerrados);
  await sync(); await p.waitForSelector('#avisoEncerrado', { timeout: 8000 }).catch(() => {});
  const av = ((await p.textContent('#avisoEncerrado').catch(() => '')) || '').replace(/[\s\u00a0]+/g, ' ');
  ok(av.includes(`Este turno foi encerrado automaticamente após 12 h, às ${fimApp}. Os documentos estão no Histórico.`), 'app: aviso "encerrado automaticamente após 12 h, às HH:MM"', av);
  ok(!/encerrado por Automático/.test(av) && !/gerência/.test(av), 'app: aviso sem "encerrado por Automático" / gerência');
  ok(await p.evaluate(() => Store.meta('turnoAtual')) === '', 'app: turnoAtual limpo');
  await p.screenshot({ path: DIR + 'rotinas_app_aviso.png' });
  await p.click('#avisoEncerrado [data-go=historico]'); await p.waitForSelector('.turno-linha');
  const linhaH = await p.evaluate(id => { const b = document.querySelector(`.turno-linha [data-doc=termo][data-id="${id}"]`); return b ? b.closest('.turno-linha').textContent.replace(/\s+/g, ' ') : ''; }, idApp);
  ok(linhaH.includes('–' + fimApp) && /encerrado automaticamente \(12 h\)/.test(linhaH), 'Histórico: "encerrado automaticamente (12 h)"', linhaH);
  // o aparelho envia depois o turno com encerrado = 0 (edição local): continua encerrado
  await p.evaluate(async id => { const t = await Store.obter('turnos', id); t.encerrado = 0; t.fim = ''; t.atualizadoEm = Date.now() + 5000; t.pendente = 1; await Store.salvar('turnos', t); }, idApp);
  await sync(); await p.waitForTimeout(400);
  const Lapp = await linhaTurno(idApp);
  ok(Lapp.encerrado === 1 && Lapp.fim === fimApp && Lapp.encerradoPor === AUTO, 'app manda encerrado=0 depois: planilha não reabre', { e: Lapp.encerrado, fim: Lapp.fim });

  ok(!erros.length, 'sem erros de página / diálogos do navegador', erros.slice(0, 5));
  await b.close();
  console.log(`FALHOU=${falhas}`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
