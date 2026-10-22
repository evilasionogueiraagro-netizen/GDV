const amb = require('./lib/amb');
// Dashboard público (web/dashboard/ + actions publicoDados / painelPublicoConfig / painelPublicoSalvar do Code.gs real via fakegas):
// desligado por padrão → "indisponível"; o gerente liga pela aba "Dashboard público" do painel e desliga alguns blocos → a página mostra
// só os ligados (mapa e números; 360 px e desktop sem rolagem horizontal; claro e escuro); nenhum dado pessoal na resposta; "barreiras
// agora" desligado por padrão e, ligado, só BVA fixa; fiscal não salva; cache, limitador, períodos, pré-visualização e sem conexão.
const { API } = amb;
const DASH = amb.ORIGEM + '/dashboard/';
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const gerar = (nome, perfil) => get('/__gerar?nome=' + encodeURIComponent(nome) + (perfil ? '&perfil=' + perfil : ''));
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); if (!cond) falhas++; };
const manaus = (d = 0) => new Date(Date.now() - 4 * 3600e3 - d * 864e5).toISOString().slice(0, 10);
const SAIDA = process.env.GDV_SAIDA_PUBLICO || '';
const shot = (p, nome, full = true) => Promise.all([p.screenshot({ path: amb.saida('publico_' + nome + '.png'), fullPage: full }),
  SAIDA ? p.screenshot({ path: require('path').join(SAIDA, nome + '.png'), fullPage: full }) : null]);

// dados pessoais e coordenadas exatas usados no teste: nenhum pode aparecer no JSON público
const CPF = '52998224725', CNPJ = '11222333000181', CPF2 = '39053344705';
const PROIBIDOS = [CPF, CNPJ, CPF2, '529.982.247-25', '***.982', 'Fulano Secreto', 'Empresa Sigilosa', 'Produtor Confidencial', 'Sítio Segredo', 'Fazenda Oculta',
  'QWE1A23', 'ZXC2B34', 'RTY3C45', 'QWE', 'Rua do Fiscal Secreto', 'Estrada Volante Sigilosa', 'Joana Fiscal', 'Pedro Fiscal', 'Ana Servidora', 'MAT-123',
  '92 99999', 'Rua Privada', '-4.2347', '-4,2347', '-69.9386', '-2.6283', '-56.7356', '-3.3021', '-60.6206', '-3.5123', '-61.0456', 'foto-', 'ass-', 'observação privada'];

(async () => {
  const agora = Date.now();
  const iniAgora = new Date(Date.now() - 4 * 3600e3 - 3600e3).toISOString();             // turno aberto há 1 h (Manaus)
  const T = (id, data, local, posto, lat, lon, extra = {}) => ({ id, numeroTF: 'TF-' + id, data, letra: 'A', inicio: '06:00', fim: '14:00', fiscal: 'Joana Fiscal e Pedro Fiscal', local,
    unidade: 'MANAUS', posto, encerrado: 1, criadoEm: agora, atualizadoEm: agora, latIni: lat, lngIni: lon, precIni: '8', latFim: lat, lngFim: lon, precFim: '8', ...extra });
  const V = (id, t, placa, tipo, p) => ({ id, turnoId: t, hora: '08:00', placa, tipo, pessoas: p, obs: 'observação privada', excluido: 0, criadoEm: agora, atualizadoEm: agora });
  const TF = (id, turnoId, data, proc, extra = {}) => ({ id, barreira: 'BVA-CEASA', ano: +data.slice(0, 4), numero: Number(id.slice(2)), numeroTxt: '', turnoId, veiculoId: '', data, hora: '09:00',
    fiscal: 'Joana Fiscal', local: 'BVA - CEASA', placa: 'QWE1A23', origem: 'Manacapuru', destino: 'Manaus', doc: CPF, nome: 'Fulano Secreto da Silva', rg: 'RG1', endereco: 'Rua Privada, 1',
    municipio: 'Manaus', uf: 'AM', telefone: '92 99999-0000', relacao: 'Motorista', procedimento: proc, auto: 0, advertencia: 0, produtos: JSON.stringify(['CARAMBOLA - 150 Kg', 'ACEROLA - 3 Caixas']),
    cancelado: 0, criadoEm: agora, atualizadoEm: agora, ...extra });
  const LEV = (id, data, mun, lat, lon, pragas, extra = {}) => ({ id, data, hora: '09:00', servidor: 'Ana Servidora', cargo: 'Fiscal', matricula: 'MAT-123', lotacao: 'ADAF', doc: CPF2,
    nome: 'Produtor Confidencial', telefone: '92 99999-1111', email: 'p@x.com', propriedade: 'Sítio Segredo do Produtor', codigoPropriedade: 'P-77', situacaoFundiaria: 'Própria', municipio: mun,
    lat, lon, precisao: '5', pragas: JSON.stringify(pragas), culturas: '[]', fotos: JSON.stringify(['foto-1']), assinaturas: JSON.stringify({ servidor: 'ass-1' }), obs: 'observação privada',
    excluido: 0, criadoEm: agora, atualizadoEm: agora, ...extra });
  const praga = (nome, res, coleta = 'Não') => [{ praga: nome, culturas: [{ cultura: 'Banana', area: '1', resultado: res, coleta }] }];

  /* ================= 1. servidor ================= */
  console.log('1. Servidor');
  let d = await post({ action: 'sync', key: 'segredo', since: 0,
    turnos: [T('p1', manaus(5), 'BVA - CEASA', 'Fixa', '-3.1190', '-60.0217'), T('p2', manaus(3), 'BVA - JUNDIÁ', 'Fixa', '-3.0412', '-60.0889'),
      T('p3', manaus(2), 'Rua do Fiscal Secreto, 99', 'Móvel', '-3.3021', '-60.6206'),
      T('p4', iniAgora.slice(0, 10), 'BVA - AEROPORTO', 'Fixa', '-3.0386', '-60.0497', { inicio: iniAgora.slice(11, 16), fim: '', encerrado: 0, latFim: '', lngFim: '' }),
      T('p5', iniAgora.slice(0, 10), 'Estrada Volante Sigilosa km 3', 'Móvel', '-3.5123', '-61.0456', { inicio: iniAgora.slice(11, 16), fim: '', encerrado: 0, latFim: '', lngFim: '' })],
    veiculos: [V('w1', 'p1', 'QWE1A23', 'PA', 5), V('w2', 'p1', 'ZXC2B34', 'CC', 1), V('w3', 'p1', '', 'ON', 40), V('w4', 'p2', 'RTY3C45', 'PA', 5), V('w5', 'p2', '', 'MT', 2),
      V('w6', 'p3', '', 'UT', 5), V('w7', 'p3', '', 'PA', 5), V('w8', 'p4', '', 'PA', 4)],
    tfs: [TF('tf1', 'p1', manaus(5), 'apreensao', { auto: 1 }), TF('tf2', 'p2', manaus(3), 'liberacao', { doc: CNPJ, nome: 'Empresa Sigilosa Ltda' }), TF('tf3', 'p3', manaus(2), 'rechaco'),
      TF('tf4', 'p1', manaus(5), 'apreensao', { cancelado: 1, motivoCancel: 'erro' })],
    levantamentos: [LEV('m1', manaus(4), 'Tabatinga', '-4.2347', '-69.9386', praga('Moko da bananeira', 'detectada', 'Sim')),
      LEV('m2', manaus(4), 'Tabatinga', '-4.2347', '-69.9386', praga('Moko da bananeira', 'detectada')),
      LEV('m3', manaus(3), 'Tabatinga', '-4.2347', '-69.9386', praga('Moko da bananeira', 'detectada')),
      LEV('m4', manaus(2), 'Parintins', '-2.6283', '-56.7356', praga('Vassoura-de-bruxa', 'suspeita'), { propriedade: 'Fazenda Oculta' }),
      LEV('m5', manaus(1), 'Manaus', '', '', praga('Moko da bananeira', 'nao_detectada'))],
    colheitas: [{ id: 'k1', unidade: 'TABATINGA', ano: +manaus(4).slice(0, 4), numero: 1, data: manaus(4), hora: '10:00', servidor: 'Ana Servidora', municipio: 'Tabatinga', doc: CPF2, nome: 'Produtor Confidencial',
      lat: '-4.2347', lon: '-69.9386', cultura: 'Banana', cancelado: 0, excluido: 0, criadoEm: agora, atualizadoEm: agora }] });
  ok(d.ok, 'dados de teste (turnos fixos e volantes, veículos com placa, TFs com nome/CPF, levantamentos com detecção)', d.erro);
  await fetch(API + '/__fn?nome=desativarRotinasAutomaticas_');

  d = await post({ action: 'publicoDados' });
  ok(d.ok === true && d.ativo === false && Object.keys(d).sort().join() === 'ativo,ok', 'desligado por padrão: {ok, ativo: false} e nada mais', d);
  const adm = await gerar('Gerente Público', 'admin');
  const TOK = (await post({ action: 'painelAtivar', codigo: adm.codigo })).token;
  const fis = await gerar('Fiscal Curioso Silva');
  const TOKF = (await post({ action: 'ativar', codigo: fis.codigo })).token;
  ok(TOK && TOKF, 'credenciais de administrador e de fiscal');
  d = await post({ action: 'painelPublicoConfig', key: TOK });
  const C0 = d.config;
  ok(d.ok && C0.ativo === false && C0.blocos.aoVivo === false && C0.blocos.calor === false && C0.blocos.supressaoPequenos === true && C0.blocos.veiculos === true && C0.blocos.levantamentos === true,
    'padrão: desligado, aoVivo e calor desligados, supressão ligada, agregados ligados', C0);
  ok(/\/GDV\/dashboard\/$/.test(d.url), 'URL pública padrão', d.url);
  d = await post({ action: 'painelPublicoSalvar', key: TOKF, config: { ativo: true } }); ok(!d.ok && /Acesso restrito/.test(d.erro), 'credencial de fiscal NÃO salva a configuração', d.erro);
  d = await post({ action: 'painelPublicoConfig', key: TOKF }); ok(!d.ok && /Acesso restrito/.test(d.erro), 'fiscal também não lê a configuração', d.erro);
  d = await post({ action: 'painelPublicoSalvar', config: { ativo: true } }); ok(!d.ok && /Sessão do painel inválida/.test(d.erro), 'sem credencial: recusado', d.erro);
  d = await post({ action: 'painelPublicoSalvar', key: TOK, config: { blocos: { cpfs: true } } }); ok(!d.ok && /Bloco desconhecido: cpfs/.test(d.erro), 'chave desconhecida recusada', d.erro);
  d = await post({ action: 'painelPublicoSalvar', key: TOK, config: { periodos: [] } }); ok(!d.ok && /pelo menos um período/.test(d.erro), 'sem período recusado', d.erro);
  d = await post({ action: 'painelPublicoSalvar', key: TOK, config: { modos: { mapa: false, numeros: false } } }); ok(!d.ok && /pelo menos um modo/.test(d.erro), 'sem modo recusado', d.erro);
  ok((await post({ action: 'publicoDados' })).ativo === false, 'tentativas recusadas não ligaram o dashboard');
  d = await post({ action: 'publicoDados', previa: true, key: TOKF }); ok(!d.ok && /Acesso restrito/.test(d.erro), 'pré-visualização exige administrador', d.erro);

  /* ================= 2. página desligada ================= */
  console.log('2. Página pública desligada');
  const b = await amb.lancar();
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const erros = [];
  async function abrir(url, opts = {}, init = {}) {
    const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block', ...opts });
    await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await c.addInitScript(i => {
      if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); }
      Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get() { return { writeText: async t => { window.__copiado = t; } }; } });
      window.__abertos = []; window.open = function (u) { window.__abertos.push(u); return null; };
    }, init);
    const p = await c.newPage();
    p.on('pageerror', e => erros.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push(m.text()); });
    await p.goto(url); return p;
  }
  const semRolagem = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  let pd = await abrir(DASH);
  await pd.waitForSelector('#db-indisponivel', { timeout: 15000 });
  ok(/temporariamente indisponível/.test(await pd.textContent('#db-indisponivel')), 'página mostra "Dashboard temporariamente indisponível"');
  ok(await pd.isHidden('#db-controles') && !(await pd.$('.pn-kpi')), 'sem controles nem números');
  await shot(pd, 'indisponivel');
  await pd.context().close();

  /* ================= 3. gerente liga pelo painel ================= */
  console.log('3. Painel → aba Dashboard público');
  const sess = { 'gdv.painel.token': TOK, 'gdv.painel.nome': 'Gerente Público' };
  const pp = await abrir(amb.PAINEL, {}, sess);
  await pp.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 });
  ok(await pp.isVisible('.pn-aba[data-aba=publico]'), 'aba "Dashboard público" no painel');
  await pp.click('.pn-aba[data-aba=publico]'); await pp.waitForSelector('#pn-pub-ativo', { timeout: 15000 });
  ok(await pp.isHidden('.pn-filtros'), 'aba sem filtros de período');
  ok(!(await pp.isChecked('#pn-pub-ativo')) && !(await pp.isChecked('[data-bloco=aoVivo]')) && !(await pp.isChecked('[data-bloco=calor]')) && await pp.isChecked('[data-bloco=supressaoPequenos]'),
    'formulário com o padrão (desligado, aoVivo/calor desmarcados, supressão marcada)');
  ok(/Pode ajudar quem quer evitar a fiscalização/.test(await pp.textContent('#pn-pub-vivo-aviso')) && await pp.isVisible('#pn-pub-vivo-aviso'), 'aviso visível do "Barreiras agora"');
  ok(/\/dashboard\/$/.test(await pp.inputValue('#pn-pub-link')), 'link público na tela', await pp.inputValue('#pn-pub-link'));
  await pp.click('[data-pub=copiar]'); await pp.waitForTimeout(200);
  ok(/\/dashboard\/$/.test(await pp.evaluate(() => window.__copiado || '')), 'Copiar link');
  await pp.click('[data-pub=previa]');
  ok((await pp.evaluate(() => window.__abertos))[0].endsWith('/dashboard/?previa=1'), 'Pré-visualizar abre ../dashboard/?previa=1');
  await pp.check('#pn-pub-ativo');
  ok(/Publicado/.test(await pp.textContent('#pn-pub-sit')), 'situação "Publicado" ao marcar');
  await pp.fill('#pn-pub-titulo', 'ADAF em números — teste');
  for (const k of ['pessoas', 'produtos', 'tiposVeiculo']) await pp.uncheck(`[data-bloco=${k}]`);
  await pp.check('[data-periodo=tudo]');
  await pp.click('#pn-pub-salvar');
  await pp.waitForFunction(() => /Salvo ✓/.test(document.querySelector('#pn-pub-msg').textContent), null, { timeout: 15000 });
  ok(/Salvo por Gerente Público em \d{2}\/\d{2} \d{2}:\d{2}/.test(await pp.textContent('#pn-pub-quem')), 'mostra quem salvou e quando', await pp.textContent('#pn-pub-quem'));
  await shot(pp, 'painel_aba');
  await pp.context().close();
  const ppc = await abrir(amb.PAINEL, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, sess);
  await ppc.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 });
  await ppc.click('.pn-aba[data-aba=publico]'); await ppc.waitForSelector('#pn-pub-ativo', { timeout: 15000 }); await ppc.waitForTimeout(300);
  ok(await ppc.isChecked('#pn-pub-ativo') && !(await ppc.isChecked('[data-bloco=pessoas]')), 'celular: configuração salva aparece');
  ok(await semRolagem(ppc), 'painel 390 px sem rolagem horizontal na aba');
  await shot(ppc, 'painel_celular');
  await ppc.context().close();

  /* ================= 4. resposta pública ================= */
  console.log('4. publicoDados');
  d = await post({ action: 'publicoDados' });
  const txt = JSON.stringify(d), N = d.numeros || {}, M = d.mapa || {};
  ok(d.ok && d.ativo && d.titulo === 'ADAF em números — teste' && d.periodo.chave === '30d', 'ligado: título salvo, período padrão 30 dias', { titulo: d.titulo, periodo: d.periodo });
  ok(N.acoes === 6 && N.veiculos === 8 && N.horas === 24 + 8 + 2 && N.tfs === 3 && N.autos === 1 && N.procedimentos.apreensao === 1 && N.procedimentos.liberacao === 1 && N.procedimentos.rechaco === 1,
    'barreiras e TF: 6 ações (5 + turno antigo-1 do fakegas), 8 veículos, 34 h, 3 TFs (cancelado fora), 1 auto', { acoes: N.acoes, veiculos: N.veiculos, horas: N.horas, tfs: N.tfs, autos: N.autos, proc: N.procedimentos });
  ok(N.levantamentos === 5 && N.municipiosCobertos === 3 && N.deteccoes === 4 && N.suspeitas === 1 && N.levNegativos === 1 && N.amostras === 1 && N.termos === 1,
    'PCE: 5 levantamentos, 3 municípios, 4 detecções (1 suspeita), 1 negativo, 1 amostra, 1 termo', N);
  ok(!('pessoas' in N) && !('produtos' in N) && !('tiposVeiculo' in N), 'blocos desligados não vêm na resposta (pessoas, produtos, tipos)');
  ok(N.porBarreira.map(x => x.local).join() === 'BVA - CEASA,BVA - JUNDIÁ,BVA - AEROPORTO,Postos volantes' && N.porBarreira.find(x => !x.fixa).acoes === 2, 'por barreira: BVAs fixas + volantes somados (sem endereço do volante)', N.porBarreira);
  ok(N.serie && N.serie.passo === 'dia' && N.serie.pontos.length === 30 && N.serie.pontos.reduce((s, x) => s + x.veiculos, 0) === 8, 'série diária de 30 dias (soma = 8 veículos)');
  const prMoko = (N.pragas || []).find(x => x.praga === 'Moko da bananeira');
  ok(prMoko && prMoko.deteccoes === 3 && prMoko.municipios === 1 && !('mun' in prMoko), 'detecções por praga (sem lista de municípios)', N.pragas);
  const mun = n => (M.pce || []).find(x => x.municipio === n);
  ok(mun('Tabatinga').levantamentos === 3 && mun('Tabatinga').deteccoes === 3 && mun('Parintins').levantamentos === '<3' && mun('Parintins').deteccoes === '<3' && mun('Manaus').deteccoes === 0,
    'mapa PCE por município: supressão "<3" (Parintins), 0 continua 0', M.pce);
  ok((M.barreiras || []).every(x => x.unidade || (Math.abs(x.lat * 10 - Math.round(x.lat * 10)) < 1e-9 && Math.abs(x.lon * 10 - Math.round(x.lon * 10)) < 1e-9)), 'barreiras em células de 0,1°', M.barreiras);
  ok((M.bvas || []).map(x => x.nome).join() === 'BVA - AEROPORTO,BVA - CEASA,BVA - JUNDIÁ' && M.bvas.find(x => x.nome === 'BVA - CEASA').lat === -3.119, 'BVAs fixas no mapa (volantes nunca), média com 3 casas', M.bvas);
  ok(!('calor' in M) && !('aoVivo' in d), 'calor e barreiras agora: desligados por padrão (não vêm)');
  const achados = PROIBIDOS.filter(x => txt.includes(x));
  ok(!achados.length, 'nenhum dado pessoal nem coordenada exata no JSON público (CPF/CNPJ, nomes, placas, propriedades, servidores, endereços, coordenadas)', achados);
  ok(!/"(doc|cpf|placa|servidor|fiscal|propriedade|telefone|usuario|endereco|lat|lon)"\s*:\s*"/.test(txt), 'nenhum campo pessoal em texto (doc/placa/servidor/fiscal/propriedade/telefone/usuario/endereço)');
  const d2 = await post({ action: 'publicoDados' });
  ok(d2.atualizadoEm === d.atualizadoEm, 'segunda consulta vem do cache (mesmo "atualizado em")');
  d = await post({ action: 'publicoDados', periodo: 'anoAnterior' });
  ok(d.ok && d.periodo.de.endsWith('-01-01') && d.periodo.ate.endsWith('-12-31') && d.numeros.acoes === 0 && d.numeros.serie.passo === 'mes' && d.numeros.serie.pontos.length === 12, 'ano anterior: zeros e 12 meses', d.periodo);
  d = await post({ action: 'publicoDados', periodo: 'tudo' }); ok(d.ok && d.numeros.veiculos === 8, 'desde o início (liberado no painel)');
  d = await post({ action: 'publicoDados', periodo: '7d' }); ok(!d.ok && /não está disponível/.test(d.erro) && d.periodos.length === 6, 'período não liberado: erro amigável + lista', d.erro);
  // 15 dias e intervalo escolhido pelo visitante (liberados por padrão)
  d = await post({ action: 'publicoDados', periodo: '15d' });
  ok(d.ok && d.periodo.rotulo === 'Últimos 15 dias' && Math.round((Date.parse(d.periodo.ate) - Date.parse(d.periodo.de)) / 864e5) === 14 && d.periodos.some(p => p.chave === '15d') && d.periodos.some(p => p.chave === 'intervalo'),
    'últimos 15 dias (de = hoje − 14) e intervalo na lista de períodos', d.periodo);
  const hojeIv = d.periodo.ate, deIv = d.periodo.de;
  d = await post({ action: 'publicoDados', periodo: 'intervalo', de: deIv, ate: hojeIv });
  ok(d.ok && d.periodo.chave === 'intervalo' && d.periodo.de === deIv && d.periodo.ate === hojeIv && /^De \d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}$/.test(d.periodo.rotulo) && d.numeros,
    'intervalo de/até: período e rótulo "De dd/mm/aaaa a dd/mm/aaaa"', d.periodo);
  d = await post({ action: 'publicoDados', periodo: 'intervalo', de: hojeIv, ate: deIv });
  ok(!d.ok && d.intervaloInvalido && /depois da data de fim/.test(d.erro), 'intervalo com início depois do fim: recusado', d.erro);
  d = await post({ action: 'publicoDados', periodo: 'intervalo', de: 'x' });
  ok(!d.ok && d.intervaloInvalido, 'intervalo sem datas válidas: recusado', d.erro);

  /* ================= 5. página pública: mapa e números ================= */
  console.log('5. Página pública');
  pd = await abrir(DASH, { colorScheme: 'light' });
  await pd.waitForSelector('#db-mapa .leaflet-db-mun-pane path', { timeout: 20000 }); await pd.waitForTimeout(500);
  ok(/ADAF em números — teste/.test(await pd.textContent('#db-titulo')) && (await pd.title()).includes('ADAF em números'), 'título configurado no topo e na aba');
  ok(await pd.getAttribute('meta[name=robots]', 'content') === 'index, follow', 'página indexável (pública)');
  const nPaths = await pd.$$eval('#db-mapa .leaflet-db-mun-pane path', a => a.length);
  ok(nPaths >= 62, 'modo Mapa (padrão): 62 municípios desenhados', nPaths);
  ok(/Atualizado em \d{2}\/\d{2} \d{2}:\d{2}/.test(await pd.textContent('#db-status')), '"Atualizado em DD/MM HH:MM"', await pd.textContent('#db-status'));
  const inds = await pd.$$eval('[data-ind]', a => a.map(x => x.dataset.ind));
  ok(inds.join() === 'veiculos,acoes,tfs,levantamentos,deteccoes', 'indicadores do mapa (só os blocos ligados)', inds);
  const cams = await pd.$$eval('[data-camada]', a => a.map(x => x.dataset.camada));
  ok(cams.join() === 'coropletico,bvas', 'camadas: municípios e BVAs (sem calor e sem "agora")', cams);
  ok(await pd.$$eval('.db-bva', a => a.length) === 3, '3 marcadores de BVA fixa');
  await pd.selectOption('#db-mun-sel', 'Parintins'); await pd.waitForTimeout(200);
  let cartao = await pd.textContent('#db-municipio');
  ok(/Parintins/.test(cartao) && /Levantamentos PCE\s*<3/.test(cartao), 'cartão do município (Parintins: "<3")', cartao.replace(/\s+/g, ' ').slice(0, 200));
  await pd.click('[data-ind=levantamentos]'); await pd.waitForTimeout(200);
  ok(/Levantamentos PCE/.test(await pd.textContent('#db-legenda')) && /&lt;3|<3/.test(await pd.innerHTML('#db-legenda')), 'legenda do indicador com a faixa "<3"', await pd.textContent('#db-legenda'));
  await pd.selectOption('#db-mun-sel', 'Tabatinga'); await pd.waitForTimeout(200);
  cartao = await pd.textContent('#db-municipio');
  ok(/Tabatinga/.test(cartao) && /Levantamentos PCE\s*3/.test(cartao) && /Detecções de pragas\s*3/.test(cartao), 'cartão de Tabatinga: 3 levantamentos, 3 detecções', cartao.replace(/\s+/g, ' ').slice(0, 200));
  const manausCard = await pd.evaluate(() => { const s = document.querySelector('#db-mun-sel'); s.value = 'Manaus'; s.dispatchEvent(new Event('change')); return document.querySelector('#db-municipio').textContent; });
  ok(/Veículos abordados\s*6/.test(manausCard) && /Ações de barreira\s*4/.test(manausCard), 'barreiras somadas no município pela célula ou pela unidade (Manaus: 4 ações, 6 veículos)', manausCard.replace(/\s+/g, ' ').slice(0, 300));
  ok(await semRolagem(pd), 'desktop: sem rolagem horizontal (mapa)');
  await shot(pd, 'mapa_claro');
  // modo Números
  await pd.click('#db-modo-numeros'); await pd.waitForSelector('.pn-kpi[data-kpi=acoes]', { timeout: 10000 }); await pd.waitForTimeout(500);
  ok(new URL(pd.url()).searchParams.get('modo') === 'numeros', 'modo na URL (?modo=numeros)');
  const kpi = k => pd.$eval(`.pn-kpi[data-kpi=${k}] .pn-kpi-val`, e => e.textContent).catch(() => null);
  ok(await kpi('acoes') === '6' && await kpi('veiculos') === '8' && await kpi('tfs') === '3' && await kpi('apreensao') === '1' && await kpi('levantamentos') === '5' && await kpi('municipios') === '3 de 62',
    'KPIs: ações 6, veículos 8, TFs 3, apreensões 1, levantamentos 5, municípios "3 de 62"');
  ok(await kpi('pessoas') === null && !(await pd.$('[data-grafico=produtos]')) && !(await pd.$('[data-grafico=tiposVeiculo]')), 'blocos desligados não aparecem (pessoas, produtos, tipos)');
  const grafs = await pd.$$eval('[data-grafico]', a => a.map(x => x.dataset.grafico));
  ok(['porBarreira', 'procedimentos', 'pragas', 'serie-veiculos', 'serie-tfs', 'serie-levantamentos'].every(g => grafs.includes(g)) && await pd.$$eval('[data-grafico] canvas', a => a.length) >= 6, 'gráficos dos blocos ligados', grafs);
  ok(await pd.$$eval('[data-grafico] canvas', a => a.every(c => (c.getAttribute('aria-label') || '').length > 10)), 'gráficos com texto alternativo');
  await pd.click('[data-grafico=procedimentos] .pn-link');
  ok(/Apreensão p\/ destruição\s*1/.test(await pd.textContent('[data-grafico=procedimentos] .pn-graf-dados')), '"Ver dados": tabela do gráfico');
  ok(await semRolagem(pd), 'desktop: sem rolagem horizontal (números)');
  await shot(pd, 'numeros_claro');
  await pd.reload(); await pd.waitForSelector('.pn-kpi[data-kpi=acoes]', { timeout: 15000 });
  ok(await pd.getAttribute('#db-modo-numeros', 'aria-selected') === 'true', 'modo lembrado ao recarregar');
  await pd.click('[data-periodo=anoAnterior]'); await pd.waitForFunction(() => /Ano anterior/.test(document.querySelector('#db-status').textContent), null, { timeout: 15000 });
  ok(await kpi('acoes') === '0', 'troca de período (ano anterior: 0 ações)');
  await pd.click('[data-periodo="30d"]'); await pd.waitForFunction(() => /Últimos 30 dias/.test(document.querySelector('#db-status').textContent), null, { timeout: 15000 });
  await pd.click('[data-periodo="intervalo"]'); await pd.waitForSelector('#db-iv-de');
  ok(await pd.isVisible('#db-iv-de') && await pd.isVisible('#db-iv-ate'), 'página: "Intervalo…" abre as datas de início e fim');
  await pd.fill('#db-iv-de', hojeIv); await pd.fill('#db-iv-ate', deIv); await pd.click('#db-iv-ok');
  ok(/depois da data de fim/.test(await pd.textContent('#db-iv-aviso')), 'página: início depois do fim avisa sem recarregar');
  await pd.fill('#db-iv-de', deIv); await pd.fill('#db-iv-ate', hojeIv); await pd.click('#db-iv-ok');
  await pd.waitForFunction(() => /^De \d{2}\/\d{2}\/\d{4} a /.test(document.querySelector('#db-status').textContent), null, { timeout: 15000 });
  ok(true, 'página: intervalo aplicado (status "De … a …")');
  await pd.click('[data-periodo="15d"]'); await pd.waitForFunction(() => /Últimos 15 dias/.test(document.querySelector('#db-status').textContent), null, { timeout: 15000 });
  ok(await pd.isHidden('#db-intervalo'), 'página: últimos 15 dias e as datas do intervalo se escondem');
  // sem conexão: últimos dados guardados no navegador
  await fetch(API + '/__off');
  await pd.reload(); await pd.waitForSelector('#db-offline:not([hidden])', { timeout: 60000 });
  ok(/Sem conexão com o servidor — exibindo os últimos dados guardados neste aparelho \(atualizados em \d{2}\/\d{2} \d{2}:\d{2}\)/.test(await pd.textContent('#db-offline')) && await kpi('acoes') === '6', 'sem conexão: últimos dados guardados, com a data', await pd.textContent('#db-offline'));
  await shot(pd, 'sem_conexao', false);
  await fetch(API + '/__on');
  await pd.context().close();
  // escuro, desktop
  pd = await abrir(DASH + '?modo=mapa', { colorScheme: 'dark' });
  await pd.waitForSelector('#db-mapa .leaflet-db-mun-pane path', { timeout: 20000 }); await pd.waitForTimeout(600);
  const fundo = await pd.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(fundo === 'rgb(13, 13, 13)', 'escuro: fundo escuro do tema', fundo);
  await shot(pd, 'mapa_escuro');
  await pd.click('#db-modo-numeros'); await pd.waitForSelector('.pn-kpi', { timeout: 10000 }); await pd.waitForTimeout(500);
  await shot(pd, 'numeros_escuro');
  await pd.context().close();
  // celular 360 px, claro e escuro, nos dois modos
  for (const esquema of ['light', 'dark']) {
    const pc = await abrir(DASH + '?modo=mapa', { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: esquema });
    await pc.waitForSelector('#db-mapa .leaflet-db-mun-pane path', { timeout: 20000 }); await pc.waitForTimeout(500);
    ok(await semRolagem(pc), `360 px ${esquema}: mapa sem rolagem horizontal`);
    const largMapa = await pc.$eval('#db-mapa', e => e.getBoundingClientRect().width);
    ok(largMapa > 280 && largMapa <= 360, `360 px ${esquema}: mapa ocupa a largura`, largMapa);
    await shot(pc, `celular_mapa_${esquema === 'light' ? 'claro' : 'escuro'}`);
    await pc.click('#db-modo-numeros'); await pc.waitForSelector('.pn-kpi', { timeout: 10000 }); await pc.waitForTimeout(500);
    ok(await semRolagem(pc), `360 px ${esquema}: números sem rolagem horizontal`);
    const kp = await pc.$$eval('.pn-kpi', a => a.every(e => e.getBoundingClientRect().right <= innerWidth + 0.5));
    ok(kp, `360 px ${esquema}: KPIs dentro da tela`);
    await shot(pc, `celular_numeros_${esquema === 'light' ? 'claro' : 'escuro'}`);
    await pc.context().close();
  }

  /* ================= 6. barreiras em andamento agora ================= */
  console.log('6. Barreiras agora');
  d = await post({ action: 'painelPublicoSalvar', key: TOK, config: { blocos: { aoVivo: true, calor: true } } });
  ok(d.ok && d.config.blocos.aoVivo && d.config.blocos.calor && d.config.blocos.pessoas === false && d.config.ativo === true, 'salvar parcial mantém o resto (aoVivo e calor ligados)', d.erro);
  d = await post({ action: 'publicoDados' });
  ok(d.aoVivo && JSON.stringify(d.aoVivo.locais.map(x => [x.nome, x.emAndamento])) === '[["BVA - AEROPORTO",1]]' && d.aoVivo.locais[0].lat === -3.039,
    'agora: só a BVA fixa aberta (volante aberto nunca aparece)', d.aoVivo);
  ok(!JSON.stringify(d).includes('Estrada Volante') && !JSON.stringify(d).includes('-3.5123'), 'volante aberto fora da resposta');
  ok(Array.isArray(d.mapa.calor) && d.mapa.calor.length === 1 && d.mapa.calor[0].join() === '-4.2,-69.9,3', 'calor: células de 0,1° com contagem; abaixo de 3 suprimidas (Parintins some)', d.mapa.calor);
  ok(d.atualizadoEm > d2.atualizadoEm || d.atualizadoEm >= d2.atualizadoEm, 'salvar troca a versão: cache novo');
  pd = await abrir(DASH + '?modo=mapa');
  await pd.waitForSelector('#db-aovivo', { timeout: 20000 }); await pd.waitForTimeout(400);
  ok(/BVA - AEROPORTO/.test(await pd.textContent('#db-aovivo')) && !/Volante/.test(await pd.textContent('#db-aovivo')) && await pd.$$eval('.db-vivo', a => a.length) === 1, 'página: lista e marcador da BVA em funcionamento');
  await shot(pd, 'mapa_aovivo');
  await pd.context().close();

  /* ================= 7. pré-visualização com o dashboard desligado ================= */
  console.log('7. Pré-visualização');
  d = await post({ action: 'painelPublicoSalvar', key: TOK, config: { ativo: false } }); ok(d.ok && !d.config.ativo, 'gerente desliga');
  ok((await post({ action: 'publicoDados' })).ativo === false, 'desligado: público volta a ver "indisponível"');
  pd = await abrir(DASH + '?previa=1&modo=numeros', {}, sess);
  await pd.waitForSelector('.pn-kpi', { timeout: 20000 });
  ok(/NÃO está publicado/.test(await pd.textContent('#db-previa')), 'pré-visualização com a credencial do painel (faixa "não está publicado")');
  await pd.context().close();
  pd = await abrir(DASH);
  await pd.waitForSelector('#db-indisponivel', { timeout: 15000 });
  ok(!(await pd.$('.pn-kpi')), 'desligado: dados guardados no navegador não são exibidos (indisponível)');
  await pd.context().close();
  await post({ action: 'painelPublicoSalvar', key: TOK, config: { ativo: true } });

  /* ================= 8. cache e limitador ================= */
  console.log('8. Cache e limitador');
  const props = await get('/__props'), ver = JSON.parse(props.PUBLICO_CONFIG).versao;
  ok(ver >= 4, 'versão da configuração gravada (troca a cada salvar)', ver);
  const chave = `publico_${ver}_30d`;
  let limitado = null, todasOk = true; const min0 = Math.floor(Date.now() / 60000);
  for (let i = 0; i < 20; i++) {
    await fetch(API + '/__cache?del=' + encodeURIComponent(chave));                 // força recálculo
    const r = await post({ action: 'publicoDados' });
    if (!r.ok) todasOk = false;
    if (r.doCache && !limitado) limitado = r;
  }
  const mesmoMinuto = Math.floor(Date.now() / 60000) === min0;
  ok(todasOk, 'muitas consultas seguidas: todas respondem');
  ok(!mesmoMinuto || (limitado && limitado.numeros && limitado.numeros.acoes === 6), 'limitador: acima de 12 recálculos/min serve a cópia guardada (doCache)', limitado && { doCache: limitado.doCache });
  if (mesmoMinuto && Math.floor(Date.now() / 60000) === min0) {
    await fetch(API + '/__cache?del=' + encodeURIComponent(chave)); await fetch(API + '/__cache?del=' + encodeURIComponent(chave + '_velho'));
    const r = await post({ action: 'publicoDados' });
    ok(Math.floor(Date.now() / 60000) !== min0 || (!r.ok && /Muitos acessos/.test(r.erro)), 'limitador sem nada guardado: mensagem amigável', r.erro);
  }

  ok(!erros.length, 'sem erros de JavaScript nas páginas', erros.slice(0, 5));
  await b.close();
  console.log('FALHOU=' + falhas);
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error('  ✗ erro inesperado: ' + (e && e.stack || e)); process.exit(1); });
